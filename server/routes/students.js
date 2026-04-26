const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(requireAuth); // All student routes require login

// ── GET /api/students — list students (RBAC filtered) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const { search = '', course = '' } = req.query;

    let sql = `
      SELECT s.*, u.name AS added_by_name, b.name AS batch_name
      FROM students s
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN batches b ON s.batch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    // RBAC: Staff only see their own students, Partners only see their own
    if (req.user.role === 'partner') {
      sql += ' AND s.partner_id = ?';
      params.push(req.user.partner_id);
    } else if (req.user.role === 'staff' && req.user.partner_id) {
       // Staff belonging to a partner see only that partner's students
       sql += ' AND s.partner_id = ?';
       params.push(req.user.partner_id);
    } else if (req.user.role !== 'admin' && !req.user.permissions.viewAll) {
      sql += ' AND s.created_by = ?';
      params.push(req.user.id);
    }

    if (search) {
      sql += ' AND (s.student_name LIKE ? OR s.mobile LIKE ? OR s.course LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (course) {
      sql += ' AND s.course = ?';
      params.push(course);
    }

    sql += ' ORDER BY s.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ students: rows });
  } catch (err) {
    console.error('GET students error:', err);
    res.status(500).json({ error: 'Failed to fetch students.' });
  }
});

// ── GET /api/students/courses — unique course list ─────────────────────────────
router.get('/courses', async (req, res) => {
  try {
    const pool = getPool();
    let sql = 'SELECT DISTINCT course FROM students';
    const params = [];

    if (req.user.role === 'partner' || (req.user.role === 'staff' && req.user.partner_id)) {
      sql += ' WHERE partner_id = ?';
      params.push(req.user.partner_id);
    } else if (req.user.role !== 'admin' && !req.user.permissions.viewAll) {
      sql += ' WHERE created_by = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY course';
    const [rows] = await pool.query(sql, params);
    res.json({ courses: rows.map(r => r.course) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
});

// ── POST /api/students — create student ────────────────────────────────────────
router.post('/', upload.single('document'), async (req, res) => {
  try {
    const {
      candidate_id, student_name, father_husband_name, mother_name, address,
      district, state, dob, age, gender, marital_status, blood_group,
      pwd, pwd_type, qualification, course, mode_of_training,
      year_of_passing, category, minority, aadhaar_no, mobile,
      parents_mobile, email_id, bank_name, bank_account_no, bank_ifsc_code,
      fees, notes, batch_id
    } = req.body;

    if (!student_name || !mobile || !course || fees === undefined) {
      return res.status(400).json({ error: 'Name, mobile, course, and fees are required.' });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Mobile must be exactly 10 digits.' });
    }

    const document_path = req.file ? `/uploads/${req.file.filename}` : '';
    const pool = getPool();
    
    const partner_id_value = req.user.role === 'admin' ? (req.body.partner_id || null) : req.user.partner_id;

    const [result] = await pool.query(
      `INSERT INTO students (
        candidate_id, student_name, father_husband_name, mother_name, address,
        district, state, dob, age, gender, marital_status, blood_group,
        pwd, pwd_type, qualification, course, mode_of_training,
        year_of_passing, category, minority, aadhaar_no, mobile,
        parents_mobile, email_id, bank_name, bank_account_no, bank_ifsc_code,
        fees, document_path, notes, partner_id, batch_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidate_id, student_name.trim(), father_husband_name, mother_name, address,
        district, state, dob || null, age || null, gender, marital_status, blood_group,
        pwd, pwd_type, qualification, course.trim(), mode_of_training,
        year_of_passing, category, minority, aadhaar_no, mobile.trim(),
        parents_mobile, email_id, bank_name, bank_account_no, bank_ifsc_code,
        Number(fees), document_path, notes, partner_id_value, batch_id ? Number(batch_id) : null, req.user.id
      ]
    );

    const [rows] = await pool.query(
      `SELECT s.*, u.name AS added_by_name, b.name AS batch_name FROM students s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN batches b ON s.batch_id = b.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ student: rows[0], message: `${student_name} added successfully!` });
  } catch (err) {
    console.error('POST student error:', err);
    res.status(500).json({ error: 'Failed to add student.' });
  }
});

// ── PUT /api/students/bulk-batch ───────────────────────────────────────────────
router.put('/bulk-batch', async (req, res) => {
  try {
    let { studentIds, batch_id } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No students selected.' });
    }

    const pool = getPool();
    const isAdmin = req.user.role === 'admin';

    // Must verify each student to ensure the user has permission to modify them
    if (!isAdmin) {
      const placeholders = studentIds.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT id, created_by, partner_id FROM students WHERE id IN (${placeholders})`, studentIds);
      
      const isPartner = req.user.role === 'partner' || (req.user.role === 'staff' && req.user.partner_id);
      
      for (const row of rows) {
        if (isPartner && row.partner_id !== req.user.partner_id) {
          return res.status(403).json({ error: 'Access denied. Some students do not belong to your organization.' });
        } else if (!isPartner && row.created_by !== req.user.id) {
          return res.status(403).json({ error: 'Access denied. You can only update your own students.' });
        }
      }
    }

    const placeholders = studentIds.map(() => '?').join(',');
    const params = [batch_id ? Number(batch_id) : null, ...studentIds];

    await pool.query(`UPDATE students SET batch_id = ? WHERE id IN (${placeholders})`, params);

    res.json({ message: `Successfully assigned batch to ${studentIds.length} student(s).` });
  } catch (err) {
    console.error('PUT bulk batch error:', err);
    res.status(500).json({ error: 'Failed to bulk update batches.' });
  }
});

// ── PUT /api/students/:id — update student ─────────────────────────────────────
router.put('/:id', upload.single('document'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    // Fetch student first for RBAC check
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found.' });

    const student = rows[0];
    const isAdmin = req.user.role === 'admin';

    // REQUIREMENT: Once submitted, only Super Admin can edit
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only Super Admin can edit student records after submission.' });
    }

    const {
      candidate_id, student_name, father_husband_name, mother_name, address,
      district, state, dob, age, gender, marital_status, blood_group,
      pwd, pwd_type, qualification, course, mode_of_training,
      year_of_passing, category, minority, aadhaar_no, mobile,
      parents_mobile, email_id, bank_name, bank_account_no, bank_ifsc_code,
      fees, notes, batch_id
    } = req.body;

    if (mobile && !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Mobile must be exactly 10 digits.' });
    }

    const partner_id_value = isAdmin ? (req.body.partner_id !== undefined ? req.body.partner_id : student.partner_id) : student.partner_id;

    await pool.query(
      `UPDATE students SET
        candidate_id = COALESCE(?, candidate_id),
        student_name = COALESCE(?, student_name),
        father_husband_name = COALESCE(?, father_husband_name),
        mother_name = COALESCE(?, mother_name),
        address = COALESCE(?, address),
        district = COALESCE(?, district),
        state = COALESCE(?, state),
        dob = COALESCE(?, dob),
        age = COALESCE(?, age),
        gender = COALESCE(?, gender),
        marital_status = COALESCE(?, marital_status),
        blood_group = COALESCE(?, blood_group),
        pwd = COALESCE(?, pwd),
        pwd_type = COALESCE(?, pwd_type),
        qualification = COALESCE(?, qualification),
        course = COALESCE(?, course),
        mode_of_training = COALESCE(?, mode_of_training),
        year_of_passing = COALESCE(?, year_of_passing),
        category = COALESCE(?, category),
        minority = COALESCE(?, minority),
        aadhaar_no = COALESCE(?, aadhaar_no),
        mobile = COALESCE(?, mobile),
        parents_mobile = COALESCE(?, parents_mobile),
        email_id = COALESCE(?, email_id),
        bank_name = COALESCE(?, bank_name),
        bank_account_no = COALESCE(?, bank_account_no),
        bank_ifsc_code = COALESCE(?, bank_ifsc_code),
        fees = COALESCE(?, fees),
        document_path = ?,
        notes = COALESCE(?, notes),
        partner_id = ?,
        batch_id = ?
       WHERE id = ?`,
      [
        candidate_id, student_name, father_husband_name, mother_name, address,
        district, state, dob || null, age || null, gender, marital_status, blood_group,
        pwd, pwd_type, qualification, course, mode_of_training,
        year_of_passing, category, minority, aadhaar_no, mobile,
        parents_mobile, email_id, bank_name, bank_account_no, bank_ifsc_code,
        fees !== undefined ? Number(fees) : null,
        document_path, notes, partner_id_value, batch_id ? Number(batch_id) : student.batch_id, id
      ]
    );

    const [updated] = await pool.query(
      `SELECT s.*, u.name AS added_by_name, b.name AS batch_name FROM students s
       LEFT JOIN users u ON s.created_by = u.id 
       LEFT JOIN batches b ON s.batch_id = b.id
       WHERE s.id = ?`,
      [id]
    );

    res.json({ student: updated[0], message: `${student_name || student.student_name} updated successfully!` });
  } catch (err) {
    console.error('PUT student error:', err);
    res.status(500).json({ error: 'Failed to update student.' });
  }
});

// ── DELETE /api/students/:id — delete student ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found.' });

    const student = rows[0];
    const isOwner = student.created_by === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You can only delete students you added.' });
    }
    if (!isAdmin && !req.user.permissions.delete) {
      return res.status(403).json({ error: 'You do not have delete permission.' });
    }

    await pool.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ message: 'Student deleted successfully.' });
  } catch (err) {
    console.error('DELETE student error:', err);
    res.status(500).json({ error: 'Failed to delete student.' });
  }
});

// ── GET /api/students/stats — dashboard stats ──────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const isAdmin = req.user.role === 'admin';
    let whereSelf = '';
    const params = [];
    if (req.user.role === 'partner' || (req.user.role === 'staff' && req.user.partner_id)) {
      whereSelf = 'WHERE s.partner_id = ?';
      params.push(req.user.partner_id);
    } else if (!isAdmin && !req.user.permissions.viewAll) {
      whereSelf = 'WHERE s.created_by = ?';
      params.push(req.user.id);
    }

    const [[totalRow]] = await pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(fees),0) as totalFees FROM students s ${whereSelf}`, params);
    const thisMonth = new Date(); thisMonth.setDate(1);
    const [[monthRow]] = await pool.query(
      `SELECT COUNT(*) as newThisMonth FROM students s ${whereSelf ? whereSelf + ' AND' : 'WHERE'} s.created_at >= ?`,
      [...params, thisMonth]
    );

    let staffCount = 0;
    if (isAdmin) {
      const [[sc]] = await pool.query(`SELECT COUNT(*) as cnt FROM users WHERE role='staff' AND status='active'`);
      staffCount = sc.cnt;
    }

    const [courseRows] = await pool.query(
      `SELECT course, COUNT(*) as count FROM students s ${whereSelf} GROUP BY course ORDER BY count DESC LIMIT 6`,
      params
    );

    res.json({
      total: totalRow.total,
      totalFees: totalRow.totalFees,
      newThisMonth: monthRow.newThisMonth,
      staffCount,
      courses: courseRows,
    });
  } catch (err) {
    console.error('GET stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;

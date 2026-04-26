const express = require('express');
const { getPool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/attendance ────────────────────────────────────────────────────────
// Fetches all students in a batch and their attendance status for a specific date
router.get('/', async (req, res) => {
  try {
    const { batch_id, date } = req.query;
    if (!batch_id || !date) {
      return res.status(400).json({ error: 'batch_id and date are required.' });
    }

    const pool = getPool();
    const isAdmin = req.user.role === 'admin';

    // Verify batch permissions
    if (!isAdmin) {
      const [batches] = await pool.query('SELECT id FROM batches WHERE id = ? AND (partner_id = ? OR partner_id IS NULL)', [batch_id, req.user.partner_id]);
      if (batches.length === 0) {
        return res.status(403).json({ error: 'Access denied to this batch.' });
      }
    }

    // Join students with possible existing attendance records for the specified date
    const [rows] = await pool.query(`
      SELECT 
        s.id AS student_id,
        s.student_name,
        s.mobile,
        a.status
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = ?
      WHERE s.batch_id = ?
      ORDER BY s.student_name ASC
    `, [date, batch_id]);

    res.json({ attendance: rows });
  } catch (err) {
    console.error('GET attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance records.' });
  }
});

// ── POST /api/attendance ───────────────────────────────────────────────────────
// Submit bulk attendance
router.post('/', async (req, res) => {
  try {
    const { batch_id, date, records } = req.body;
    // records shape: [{ student_id: 1, status: 'Present' }, ...]

    if (!batch_id || !date || !Array.isArray(records)) {
      return res.status(400).json({ error: 'batch_id, date, and records array are required.' });
    }

    const pool = getPool();
    const isAdmin = req.user.role === 'admin';

    // Verify batch permissions
    if (!isAdmin) {
      const [batches] = await pool.query('SELECT id FROM batches WHERE id = ? AND (partner_id = ? OR partner_id IS NULL)', [batch_id, req.user.partner_id]);
      if (batches.length === 0) {
        return res.status(403).json({ error: 'Access denied to this batch.' });
      }
    }

    // Process inserts/updates
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const rec of records) {
        if (!rec.status) continue; // Skip if no radio selected
        await conn.query(`
          INSERT INTO attendance (student_id, batch_id, attendance_date, status, marked_by)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)
        `, [rec.student_id, batch_id, date, rec.status, req.user.id]);
      }

      await conn.commit();
      res.json({ message: 'Attendance saved successfully!' });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST attendance error:', err);
    res.status(500).json({ error: 'Failed to save attendance.' });
  }
});

module.exports = router;

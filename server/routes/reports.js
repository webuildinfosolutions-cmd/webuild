// ─── routes/reports.js — Admin Reports & CSV Export ───────────────────────────
const express = require('express');
const { getPool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ── GET /api/reports/user-wise ─────────────────────────────────────────────────
router.get('/user-wise', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT u.name, u.email, u.role,
             COUNT(s.id) AS student_count,
             COALESCE(SUM(s.fees), 0) AS total_fees
      FROM users u
      LEFT JOIN students s ON s.created_by = u.id
      GROUP BY u.id
      ORDER BY student_count DESC
    `);
    res.json({ data: rows, title: 'User-wise Student Report' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/course-wise ──────────────────────────────────────────────
router.get('/course-wise', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT course,
             COUNT(*) AS student_count,
             COALESCE(SUM(fees), 0) AS total_fees,
             ROUND(AVG(fees), 0) AS avg_fees
      FROM students
      GROUP BY course
      ORDER BY student_count DESC
    `);
    res.json({ data: rows, title: 'Course-wise Student Report' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/batch-wise ───────────────────────────────────────────────
router.get('/batch-wise', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT b.name AS batch_name,
             DATE_FORMAT(b.start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(b.end_date, '%Y-%m-%d') AS end_date,
             COUNT(s.id) AS student_count,
             COALESCE(SUM(s.fees), 0) AS total_fees,
             ROUND(AVG(s.fees), 0) AS avg_fees
      FROM batches b
      LEFT JOIN students s ON s.batch_id = b.id
      GROUP BY b.id, b.name, b.start_date, b.end_date
      ORDER BY student_count DESC
    `);
    res.json({ data: rows, title: 'Batch-wise Student Report' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/batch-attendance ─────────────────────────────────────────
router.get('/batch-attendance', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT b.name AS batch_name,
             COUNT(DISTINCT a.attendance_date) AS total_days_marked,
             SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS total_present,
             SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS total_absent,
             SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS total_late
      FROM batches b
      JOIN attendance a ON b.id = a.batch_id
      GROUP BY b.id, b.name
      ORDER BY b.name ASC
    `);
    res.json({ data: rows, title: 'Batch-wise Attendance Report' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/student-attendance ────────────────────────────────────────
router.get('/student-attendance', async (req, res) => {
  try {
    const { batch_id, start_date, end_date } = req.query;
    if (!batch_id) return res.status(400).json({ error: 'Batch ID is required' });

    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT 
        s.student_name,
        s.mobile,
        COUNT(CASE WHEN a.status = 'Present' THEN 1 END) AS present_days,
        COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) AS absent_days,
        COUNT(CASE WHEN a.status = 'Late' THEN 1 END) AS late_days,
        COUNT(a.id) AS total_marked_days
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id 
        AND (? IS NULL OR a.attendance_date >= ?)
        AND (? IS NULL OR a.attendance_date <= ?)
      WHERE s.batch_id = ?
      GROUP BY s.id, s.student_name, s.mobile
      ORDER BY s.student_name ASC
    `, [start_date || null, start_date || null, end_date || null, end_date || null, batch_id]);

    res.json({ data: rows, title: 'Student-wise Attendance Report' });
  } catch (err) {
    console.error('Student attendance report error:', err);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/all-students ─────────────────────────────────────────────
router.get('/all-students', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT s.id, s.student_name, s.mobile, s.course, s.fees,
             s.address, s.created_at, u.name AS added_by,
             b.name AS batch_code, DATE_FORMAT(b.start_date, '%Y-%m-%d') AS batch_start_date, DATE_FORMAT(b.end_date, '%Y-%m-%d') AS batch_end_date
      FROM students s
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN batches b ON s.batch_id = b.id
      ORDER BY s.created_at DESC
    `);
    res.json({ data: rows, title: 'Full Student List' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/reports/fees ─────────────────────────────────────────────────────
router.get('/fees', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month_key,
        DATE_FORMAT(created_at, '%M %Y') AS month_label,
        COUNT(*) AS student_count,
        COALESCE(SUM(fees), 0) AS total_fees
      FROM students
      GROUP BY month_key, month_label
      ORDER BY month_key ASC
    `);
    res.json({ data: rows, title: 'Fee Collection Report' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

module.exports = router;

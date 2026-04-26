// ─── routes/batches.js — Batch Management ─────────────────────────────────────
const express = require('express');
const { getPool } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/batches ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const isAdmin = req.user.role === 'admin';
    let sql = 'SELECT id, name, partner_id, start_date, end_date, created_at FROM batches';
    const params = [];

    if (!isAdmin) {
      sql += ' WHERE partner_id = ? OR partner_id IS NULL'; // Optionally see global batches
      params.push(req.user.partner_id);
    }
    
    sql += ' ORDER BY name ASC';
    const [rows] = await pool.query(sql, params);
    res.json({ batches: rows });
  } catch (err) {
    console.error('GET batches error:', err);
    res.status(500).json({ error: 'Failed to fetch batches.' });
  }
});

// ── POST /api/batches ──────────────────────────────────────────────────────────
router.post('/', requireManager, async (req, res) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Batch name is required.' });

    const pool = getPool();
    const isAdmin = req.user.role === 'admin';
    const partnerId = isAdmin ? null : req.user.partner_id; // Simple approach: admin creates global batches, partners create own

    const [result] = await pool.query(
      'INSERT INTO batches (name, partner_id, start_date, end_date) VALUES (?, ?, ?, ?)',
      [name.trim(), partnerId, start_date || null, end_date || null]
    );

    res.status(201).json({ 
      batch: { id: result.insertId, name: name.trim(), partner_id: partnerId, start_date: start_date || null, end_date: end_date || null }, 
      message: 'Batch created successfully!' 
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A batch with this name already exists.' });
    }
    console.error('POST batch error:', err);
    res.status(500).json({ error: 'Failed to create batch.' });
  }
});

module.exports = router;

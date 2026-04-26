const express = require('express');
const { getPool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/partners
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM partners ORDER BY name ASC');
    res.json({ partners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch partners.' });
  }
});

// POST /api/partners
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Partner name is required.' });

    const pool = getPool();
    const [result] = await pool.query('INSERT INTO partners (name) VALUES (?)', [name.trim()]);
    res.status(201).json({ id: result.insertId, name: name.trim() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Partner name already exists.' });
    }
    res.status(500).json({ error: 'Failed to create partner.' });
  }
});

module.exports = router;

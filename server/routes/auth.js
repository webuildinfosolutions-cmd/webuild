// ─── routes/auth.js — Login & Profile ────────────────────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this email.' });
    }

    const user = rows[0];

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Your account is inactive. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // Build permissions object
    const permissions = {
      create: true,
      viewOwn: true,
      viewAll: user.role === 'admin' || !!user.perm_view_all,
      edit: user.role === 'admin' || !!user.perm_edit,
      delete: user.role === 'admin' || !!user.perm_delete,
      manageUsers: user.role === 'admin',
    };

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      partner_id: user.partner_id,
      permissions,
    };

    const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

    res.json({
      token,
      user: payload,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me — verify token and get current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

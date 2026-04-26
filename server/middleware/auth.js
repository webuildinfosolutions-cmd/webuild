// ─── middleware/auth.js — JWT verification + RBAC helpers ─────────────────────
const jwt = require('jsonwebtoken');
const config = require('../config');

// Verify JWT token on every protected request
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please login.' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded; // { id, name, email, role, permissions }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
  }
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
}

// Manager middleware (Admin or Partner)
function requireManager(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'partner') {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireManager };

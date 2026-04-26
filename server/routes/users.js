// ─── routes/users.js — User Management (Admin Only) ───────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireManager); // User routes: Admin and Partner

// ── GET /api/users ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.status, u.partner_id, p.name AS partner_name,
             u.perm_edit, u.perm_delete, u.perm_view_all, u.created_at,
             COUNT(s.id) AS student_count
      FROM users u
      LEFT JOIN partners p ON u.partner_id = p.id
      LEFT JOIN students s ON s.created_by = u.id
    `;
    
    if (!isAdmin) {
      sql += ` WHERE u.partner_id = ? AND u.role = 'staff'`;
      params.push(req.user.partner_id);
    }
    
    sql += ` GROUP BY u.id ORDER BY u.created_at ASC`;
    
    const [rows] = await pool.query(sql, params);
    const users = rows.map(u => ({
      ...u,
      permissions: {
        create: true,
        viewOwn: true,
        viewAll: u.role === 'admin' || !!u.perm_view_all,
        edit: u.role === 'admin' || !!u.perm_edit,
        delete: u.role === 'admin' || !!u.perm_delete,
        manageUsers: u.role === 'admin',
      },
    }));
    res.json({ users });
  } catch (err) {
    console.error('GET users error:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── POST /api/users — create user ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role = 'staff', status = 'active', partner_id = null, permissions = {} } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }

    const isAdmin = req.user.role === 'admin';
    const finalPartnerId = isAdmin ? partner_id : req.user.partner_id;
    const finalRole = isAdmin ? role : 'staff'; // Partners can only create staff

    const pool = getPool();
    // Check email uniqueness
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    const permEdit = finalRole === 'admin' ? 1 : (permissions.edit ? 1 : 0);
    const permDelete = finalRole === 'admin' ? 1 : (permissions.delete ? 1 : 0);
    const permViewAll = finalRole === 'admin' ? 1 : (permissions.viewAll ? 1 : 0);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, status, partner_id, perm_edit, perm_delete, perm_view_all)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.toLowerCase().trim(), hashedPwd, finalRole, status, finalPartnerId, permEdit, permDelete, permViewAll]
    );

    res.status(201).json({ id: result.insertId, message: `${name} added successfully!` });
  } catch (err) {
    console.error('POST user error:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

// ── PUT /api/users/:id — update user ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, status, partner_id, permissions = {} } = req.body;
    const pool = getPool();

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && (rows[0].partner_id !== req.user.partner_id || rows[0].role !== 'staff')) {
      return res.status(403).json({ error: 'Access denied to edit this user.' });
    }

    // Email uniqueness check
    if (email) {
      const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), id]);
      if (dup.length > 0) return res.status(409).json({ error: 'Email already in use by another account.' });
    }

    let newPassword = rows[0].password;
    if (password && password.trim()) {
      newPassword = await bcrypt.hash(password, 10);
    }

    const finalRole = isAdmin ? (role || rows[0].role) : rows[0].role;
    const finalPartnerId = isAdmin ? (partner_id !== undefined ? partner_id : rows[0].partner_id) : rows[0].partner_id;

    const permEdit = finalRole === 'admin' ? 1 : (permissions.edit !== undefined ? (permissions.edit ? 1 : 0) : rows[0].perm_edit);
    const permDelete = finalRole === 'admin' ? 1 : (permissions.delete !== undefined ? (permissions.delete ? 1 : 0) : rows[0].perm_delete);
    const permViewAll = finalRole === 'admin' ? 1 : (permissions.viewAll !== undefined ? (permissions.viewAll ? 1 : 0) : rows[0].perm_view_all);

    await pool.query(
      `UPDATE users SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        password = ?,
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        partner_id = ?,
        perm_edit = ?,
        perm_delete = ?,
        perm_view_all = ?
       WHERE id = ?`,
      [name, email ? email.toLowerCase() : null, newPassword, finalRole, status, finalPartnerId, permEdit, permDelete, permViewAll, id]
    );

    res.json({ message: `${name || rows[0].name} updated successfully!` });
  } catch (err) {
    console.error('PUT user error:', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, name, partner_id, role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && (rows[0].partner_id !== req.user.partner_id || rows[0].role !== 'staff')) {
      return res.status(403).json({ error: 'Access denied to delete this user.' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: `User deleted successfully.` });
  } catch (err) {
    console.error('DELETE user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;

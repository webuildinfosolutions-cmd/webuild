// ─── index.js — EduCRM Express Server (Entry Point) ──────────────────────────
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const config = require('./config');

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5000', 'http://127.0.0.1:5500', 'null', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ── Serve frontend static files ────────────────────────────────────────────────
// Serves index.html + css/ + js/ from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/students', require('./routes/students'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/partners', require('./routes/partners'));

// ── Serve uploaded documents ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ── Catch-all: serve frontend for SPA routes ───────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Start server ───────────────────────────────────────────────────────────────
async function start() {
  try {
    console.log('🔄 Connecting to MySQL...');
    await initDB();

    app.listen(config.server.port, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   🎓 EduCRM Server is RUNNING            ║');
      console.log(`║   📡 http://localhost:${config.server.port}              ║`);
      console.log('║                                          ║');
      console.log('║   Admin:  admin@educrm.com / Admin@1234  ║');
      console.log('║   Staff:  staff@educrm.com / Staff@1234  ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('');
    console.error('❌ Failed to start server:', err.message);
    console.error('');
    console.error('👉 Possible fix: Check your MySQL credentials in server/config.js');
    console.error('   Make sure MySQL is running (XAMPP / WAMP / MySQL Workbench)');
    console.error('');
    process.exit(1);
  }
}

start();

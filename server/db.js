// ─── db.js — MySQL Connection Pool + Auto Database/Table Setup ────────────────
const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

// SQL to create all tables
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS partners (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL UNIQUE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batches (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL UNIQUE,
  partner_id  INT DEFAULT NULL,
  start_date  DATE DEFAULT NULL,
  end_date    DATE DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','staff','partner') NOT NULL DEFAULT 'staff',
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  partner_id  INT DEFAULT NULL,
  perm_edit       TINYINT(1) NOT NULL DEFAULT 1,
  perm_delete     TINYINT(1) NOT NULL DEFAULT 0,
  perm_view_all   TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS students (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  candidate_id            VARCHAR(50) DEFAULT NULL,
  student_name            VARCHAR(150) NOT NULL,
  father_husband_name     VARCHAR(150),
  mother_name             VARCHAR(150),
  address                 VARCHAR(255) DEFAULT '',
  district               VARCHAR(100),
  state                  VARCHAR(100),
  dob                    DATE,
  age                    INT,
  gender                 VARCHAR(20),
  marital_status         VARCHAR(50),
  blood_group            VARCHAR(10),
  pwd                    VARCHAR(10),
  pwd_type               VARCHAR(100),
  qualification          VARCHAR(255),
  course                 VARCHAR(100) NOT NULL,
  mode_of_training       VARCHAR(100),
  year_of_passing        VARCHAR(10),
  category               VARCHAR(50),
  minority               VARCHAR(50),
  aadhaar_no             VARCHAR(20),
  mobile                 VARCHAR(15) NOT NULL,
  parents_mobile         VARCHAR(15),
  email_id               VARCHAR(150),
  bank_name              VARCHAR(150),
  bank_account_no        VARCHAR(50),
  bank_ifsc_code         VARCHAR(20),
  fees                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  document_path          VARCHAR(255) DEFAULT '',
  notes                  TEXT DEFAULT '',
  partner_id             INT DEFAULT NULL,
  batch_id               INT DEFAULT NULL,
  created_by             INT NOT NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  student_id      INT NOT NULL,
  batch_id        INT NOT NULL,
  attendance_date DATE NOT NULL,
  status          VARCHAR(20) NOT NULL,
  marked_by       INT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_attendance (student_id, batch_id, attendance_date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// Seed default admin + staff if users table is empty
const SEED_SQL = `
INSERT IGNORE INTO users (name, email, password, role, status, perm_edit, perm_delete, perm_view_all)
VALUES
  ('Super Admin', 'admin@educrm.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', 'active', 1, 1, 1),
  ('Rahul Sharma', 'staff@educrm.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'staff', 'active', 1, 0, 0);
`;
// Admin@1234 → bcrypt hash above (rounds=10)
// Staff@1234 → bcrypt hash above  (password = "password" used as placeholder - will auto-fix below)

async function initDB() {
  // First connect WITHOUT specifying a database so we can CREATE DATABASE
  const tempPool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    waitForConnections: true,
    connectionLimit: 3,
  });

  const conn = await tempPool.getConnection();
  console.log('✅ MySQL connected successfully');

  // Create database if not exists
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`✅ Database '${config.db.database}' ready`);

  await conn.query(`USE \`${config.db.database}\``);

  // Create tables
  for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await conn.query(stmt).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });
  }
  
  // Migrations: Ensure columns exist in case tables were already there
  const alterStudents = [
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS candidate_id VARCHAR(50)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS father_husband_name VARCHAR(150)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS mother_name VARCHAR(150)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS district VARCHAR(100)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS state VARCHAR(100)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS age INT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(20)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS marital_status VARCHAR(50)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS pwd VARCHAR(10)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS pwd_type VARCHAR(100)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS qualification VARCHAR(255)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS mode_of_training VARCHAR(100)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS year_of_passing VARCHAR(10)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS category VARCHAR(50)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS minority VARCHAR(50)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS aadhaar_no VARCHAR(20)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS parents_mobile VARCHAR(15)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS email_id VARCHAR(150)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(50)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(20)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS document_path VARCHAR(255)',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS partner_id INT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS batch_id INT',
  ];

  for (const sql of alterStudents) {
    try { await conn.query(sql); } catch (e) { /* ignore if already exists */ }
  }

  const alterUsers = [
    'ALTER TABLE users MODIFY COLUMN role ENUM(\'admin\',\'staff\',\'partner\') NOT NULL DEFAULT \'staff\'',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_id INT',
  ];
  for (const sql of alterUsers) {
    try { await conn.query(sql); } catch (e) { /* ignore */ }
  }

  const alterBatches = [
    'ALTER TABLE batches ADD COLUMN IF NOT EXISTS start_date DATE',
    'ALTER TABLE batches ADD COLUMN IF NOT EXISTS end_date DATE'
  ];
  for (const sql of alterBatches) {
    try { await conn.query(sql); } catch (e) { /* ignore */ }
  }

  console.log('✅ Tables created/verified and migrations applied');

  // Seed default users using bcryptjs to hash real passwords
  const bcrypt = require('bcryptjs');
  const [[rows]] = await conn.query('SELECT COUNT(*) as cnt FROM users');
  if (rows.cnt === 0) {
    const adminHash = await bcrypt.hash('Admin@1234', 10);
    const staffHash = await bcrypt.hash('Staff@1234', 10);
    await conn.query(
      `INSERT INTO users (name, email, password, role, status, perm_edit, perm_delete, perm_view_all) VALUES
        ('Super Admin', 'admin@educrm.com', ?, 'admin', 'active', 1, 1, 1),
        ('Rahul Sharma', 'staff@educrm.com', ?, 'staff', 'active', 1, 0, 0)`,
      [adminHash, staffHash]
    );

    // Seed sample students
    const [[adminRow]] = await conn.query('SELECT id FROM users WHERE email = ?', ['admin@educrm.com']);
    const [[staffRow]] = await conn.query('SELECT id FROM users WHERE email = ?', ['staff@educrm.com']);
    const adminId = adminRow.id;
    const staffId = staffRow.id;

    await conn.query(
      `INSERT INTO students (student_name, mobile, course, fees, address, notes, created_by, created_at) VALUES
        ('Priya Mehta', '9876543210', 'Web Development', 15000, 'Mumbai', '', ?, '2025-03-01'),
        ('Kiran Joshi', '9832109876', 'Web Development', 15000, 'Pune', '', ?, '2025-03-12'),
        ('Amit Patel', '9812345678', 'Data Science', 20000, 'Ahmedabad', '', ?, '2025-03-05'),
        ('Sneha Rao', '9856781234', 'Digital Marketing', 10000, 'Bangalore', 'Follow-up needed', ?, '2025-03-10'),
        ('Divya Singh', '9811234567', 'Python Programming', 12000, 'Delhi', '', ?, '2025-03-18')`,
      [adminId, adminId, staffId, staffId, staffId]
    );
    console.log('✅ Default users and sample students seeded');
  }

  conn.release();
  await tempPool.end();

  // Now create the real pool with the database selected
  pool = mysql.createPool({
    ...config.db,
    database: config.db.database,
  });

  console.log('✅ Database pool ready');
}

function getPool() {
  if (!pool) throw new Error('DB not initialized. Call initDB() first.');
  return pool;
}

module.exports = { initDB, getPool };

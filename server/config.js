// ─── EduCRM MySQL Configuration ───────────────────────────────────────────────
// Edit these values to match your MySQL setup
module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'educrm_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'educrm_super_secret_jwt_key_2024_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  server: {
    port: process.env.PORT || 5000,
  },
};

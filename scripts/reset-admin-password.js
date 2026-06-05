/**
 * One-shot script: reset the admin user's password.
 * Usage: node scripts/reset-admin-password.js [email] [newPassword]
 * Defaults: email=admin@eggtrack.com  password=admin@123
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../src/config/database');

const email    = process.argv[2] || 'admin@eggtrack.com';
const password = process.argv[3] || 'admin@123';

(async () => {
  try {
    const pool = await getPool();

    const existing = await pool.request()
      .input('email', sql.NVarChar(150), email)
      .query('SELECT id, name, email FROM Users WHERE email = @email');

    const hash = await bcrypt.hash(password, 10);

    if (existing.recordset.length) {
      await pool.request()
        .input('hash',  sql.NVarChar(255), hash)
        .input('email', sql.NVarChar(150), email)
        .query('UPDATE Users SET passwordHash = @hash, updatedAt = GETDATE() WHERE email = @email');
      console.log(`✅ Password reset for: ${email}`);
    } else {
      await pool.request()
        .input('name',  sql.NVarChar(150), 'Admin')
        .input('email', sql.NVarChar(150), email)
        .input('hash',  sql.NVarChar(255), hash)
        .input('roleId', sql.Int, 1)
        .query(`
          INSERT INTO Users (name, email, passwordHash, roleId, isActive)
          VALUES (@name, @email, @hash, @roleId, 1)
        `);
      console.log(`✅ Admin user created: ${email}`);
    }

    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();

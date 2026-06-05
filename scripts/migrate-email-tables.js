/**
 * Creates ReportRecipients and EmailLogs tables if they don't exist,
 * then seeds the initial recipients.
 * Usage: node scripts/migrate-email-tables.js
 */
require('dotenv').config();
const { getPool, sql } = require('../src/config/database');

(async () => {
  try {
    const pool = await getPool();

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReportRecipients')
      CREATE TABLE ReportRecipients (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        email      NVARCHAR(150)  NOT NULL,
        name       NVARCHAR(150)  NULL,
        isActive   BIT            NOT NULL DEFAULT 1,
        createdAt  DATETIME2      NOT NULL DEFAULT GETDATE(),
        createdBy  INT            NULL REFERENCES Users(id),
        deletedAt  DATETIME2      NULL,
        deletedBy  INT            NULL REFERENCES Users(id)
      )
    `);
    console.log('✅ ReportRecipients table ready');

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmailLogs')
      CREATE TABLE EmailLogs (
        id             INT IDENTITY(1,1) PRIMARY KEY,
        jobType        NVARCHAR(50)   NOT NULL DEFAULT 'debtors_report',
        recipients     NVARCHAR(MAX)  NULL,
        recipientCount INT            NOT NULL DEFAULT 0,
        debtorCount    INT            NULL,
        status         NVARCHAR(20)   NOT NULL DEFAULT 'sent',
        errorMessage   NVARCHAR(MAX)  NULL,
        sentAt         DATETIME2      NOT NULL DEFAULT GETDATE()
      )
    `);
    console.log('✅ EmailLogs table ready');

    // Seed initial recipients if table is empty
    const existing = await pool.request()
      .query('SELECT COUNT(*) AS cnt FROM ReportRecipients');
    if (existing.recordset[0].cnt === 0) {
      await pool.request().query(`
        INSERT INTO ReportRecipients (email, name) VALUES
          ('kwasiadaboboakye@gmail.com', 'Kwasi Adabo Boakye'),
          ('owkwasi@yahoo.com',          NULL)
      `);
      console.log('✅ Seeded 2 initial recipients');
    } else {
      console.log('ℹ️  Recipients already seeded, skipping');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();

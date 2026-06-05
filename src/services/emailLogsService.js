const { getPool, sql } = require('../config/database');

async function logEmail({ jobType = 'debtors_report', recipients = [], debtorCount = null, status = 'sent', errorMessage = null }) {
  const pool = await getPool();
  await pool.request()
    .input('jobType',        sql.NVarChar(50),  jobType)
    .input('recipients',     sql.NVarChar(sql.MAX), recipients.join(', ') || null)
    .input('recipientCount', sql.Int,           recipients.length)
    .input('debtorCount',    sql.Int,           debtorCount)
    .input('status',         sql.NVarChar(20),  status)
    .input('errorMessage',   sql.NVarChar(sql.MAX), errorMessage || null)
    .query(`
      INSERT INTO EmailLogs (jobType, recipients, recipientCount, debtorCount, status, errorMessage)
      VALUES (@jobType, @recipients, @recipientCount, @debtorCount, @status, @errorMessage)
    `);
}

async function getEmailLogs({ limit = 50, jobType } = {}) {
  const pool = await getPool();
  const req = pool.request().input('limit', sql.Int, parseInt(limit));
  const where = jobType ? `WHERE jobType = @jobType` : '';
  if (jobType) req.input('jobType', sql.NVarChar(50), jobType);
  const result = await req.query(`
    SELECT TOP (@limit) id, jobType, recipients, recipientCount, debtorCount, status, errorMessage, sentAt
    FROM EmailLogs
    ${where}
    ORDER BY sentAt DESC
  `);
  return result.recordset;
}

module.exports = { logEmail, getEmailLogs };

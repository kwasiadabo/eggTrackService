const { getPool, sql } = require('../config/database');

async function getActiveRecipients() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT email FROM ReportRecipients
    WHERE deletedAt IS NULL AND isActive = 1
  `);
  return result.recordset.map((r) => r.email);
}

async function getAllRecipients() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, email, name, isActive, createdAt
    FROM ReportRecipients
    WHERE deletedAt IS NULL
    ORDER BY createdAt DESC
  `);
  return result.recordset;
}

async function addRecipient({ email, name, createdBy }) {
  const pool = await getPool();

  const exists = await pool.request()
    .input('email', sql.NVarChar(150), email)
    .query(`SELECT id FROM ReportRecipients WHERE email = @email AND deletedAt IS NULL`);
  if (exists.recordset.length) {
    const e = new Error('Recipient already exists');
    e.statusCode = 409;
    throw e;
  }

  const result = await pool.request()
    .input('email',     sql.NVarChar(150), email)
    .input('name',      sql.NVarChar(150), name || null)
    .input('createdBy', sql.Int,           createdBy || null)
    .query(`
      INSERT INTO ReportRecipients (email, name, createdBy)
      OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.isActive, INSERTED.createdAt
      VALUES (@email, @name, @createdBy)
    `);
  return result.recordset[0];
}

async function updateRecipient(id, { name, isActive }) {
  const pool = await getPool();
  const fields = [];
  const req = pool.request().input('id', sql.Int, parseInt(id));

  if (name !== undefined)     { fields.push('name = @name');         req.input('name',     sql.NVarChar(150), name); }
  if (isActive !== undefined) { fields.push('isActive = @isActive'); req.input('isActive', sql.Bit,           isActive ? 1 : 0); }

  if (!fields.length) { const e = new Error('No fields to update'); e.statusCode = 400; throw e; }

  const result = await req.query(`
    UPDATE ReportRecipients SET ${fields.join(', ')}
    OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.isActive
    WHERE id = @id AND deletedAt IS NULL
  `);
  if (!result.recordset.length) { const e = new Error('Recipient not found'); e.statusCode = 404; throw e; }
  return result.recordset[0];
}

async function deleteRecipient(id, deletedBy) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id',        sql.Int, parseInt(id))
    .input('deletedBy', sql.Int, deletedBy)
    .query(`
      UPDATE ReportRecipients SET deletedAt = GETDATE(), deletedBy = @deletedBy
      OUTPUT INSERTED.id
      WHERE id = @id AND deletedAt IS NULL
    `);
  if (!result.recordset.length) { const e = new Error('Recipient not found'); e.statusCode = 404; throw e; }
}

module.exports = { getActiveRecipients, getAllRecipients, addRecipient, updateRecipient, deleteRecipient };

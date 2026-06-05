const { getPool, sql } = require('../config/database');

async function getAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, name, location, contact, isActive, createdAt, updatedAt
    FROM Farms
    WHERE deletedAt IS NULL
    ORDER BY name ASC
  `);
  return result.recordset;
}

async function getActive() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, name, location, contact
    FROM Farms
    WHERE deletedAt IS NULL AND isActive = 1
    ORDER BY name ASC
  `);
  return result.recordset;
}

async function create({ name, location, contact, isActive }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('name',     sql.NVarChar(100), name.trim())
    .input('location', sql.NVarChar(200), location || null)
    .input('contact',  sql.NVarChar(100), contact  || null)
    .input('isActive', sql.Bit,           isActive !== false ? 1 : 0)
    .query(`
      INSERT INTO Farms (name, location, contact, isActive)
      OUTPUT INSERTED.*
      VALUES (@name, @location, @contact, @isActive)
    `);
  return result.recordset[0];
}

async function update(id, { name, location, contact, isActive }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id',       sql.Int,           parseInt(id))
    .input('name',     sql.NVarChar(100), name.trim())
    .input('location', sql.NVarChar(200), location || null)
    .input('contact',  sql.NVarChar(100), contact  || null)
    .input('isActive', sql.Bit,           isActive !== false ? 1 : 0)
    .query(`
      UPDATE Farms
      SET name=@name, location=@location, contact=@contact,
          isActive=@isActive, updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id AND deletedAt IS NULL
    `);
  if (!result.recordset[0]) {
    const e = new Error('Farm not found'); e.statusCode = 404; throw e;
  }
  return result.recordset[0];
}

async function remove(id) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query(`UPDATE Farms SET deletedAt=GETDATE() WHERE id=@id AND deletedAt IS NULL`);
}

module.exports = { getAll, getActive, create, update, remove };

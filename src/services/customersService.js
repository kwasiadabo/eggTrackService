const { getPool, sql } = require('../config/database');

async function getAllCustomers() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, name, phone, address, email, createdAt, updatedAt
    FROM Customers WHERE deletedAt IS NULL ORDER BY name
  `);
  return result.recordset;
}

async function getCustomerById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT * FROM Customers WHERE id = @id AND deletedAt IS NULL');
  const row = result.recordset[0];
  if (!row) { const e = new Error('Customer not found'); e.statusCode = 404; throw e; }
  return row;
}

async function createCustomer({ name, phone, address, email }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('name',    sql.NVarChar(150), name)
    .input('phone',   sql.NVarChar(30),  phone   || null)
    .input('address', sql.NVarChar(300), address || null)
    .input('email',   sql.NVarChar(150), email   || null)
    .query(`INSERT INTO Customers (name, phone, address, email) OUTPUT INSERTED.* VALUES (@name, @phone, @address, @email)`);
  return result.recordset[0];
}

async function updateCustomer(id, { name, phone, address, email }) {
  const pool = await getPool();
  const orig = await getCustomerById(id);
  const result = await pool.request()
    .input('id',      sql.Int,           parseInt(id))
    .input('name',    sql.NVarChar(150), name    ?? orig.name)
    .input('phone',   sql.NVarChar(30),  phone   !== undefined ? phone   : orig.phone)
    .input('address', sql.NVarChar(300), address !== undefined ? address : orig.address)
    .input('email',   sql.NVarChar(150), email   !== undefined ? email   : orig.email)
    .query(`
      UPDATE Customers
      SET name = @name, phone = @phone, address = @address, email = @email, updatedAt = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id AND deletedAt IS NULL
    `);
  if (!result.recordset.length) { const e = new Error('Customer not found'); e.statusCode = 404; throw e; }
  return result.recordset[0];
}

async function deleteCustomer(id, deletedBy) {
  const pool = await getPool();
  await getCustomerById(id); // throws 404 if missing
  // Check for active sales
  const hasSales = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT TOP 1 id FROM Sales WHERE customerId = @id AND deletedAt IS NULL');
  if (hasSales.recordset.length) {
    const e = new Error('Cannot delete customer with active sales records. Archive or delete the sales first.');
    e.statusCode = 409; throw e;
  }
  await pool.request()
    .input('id',        sql.Int, parseInt(id))
    .input('deletedBy', sql.Int, deletedBy)
    .query('UPDATE Customers SET deletedAt = GETDATE(), deletedBy = @deletedBy WHERE id = @id');
}

module.exports = { getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };

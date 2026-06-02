const { getPool, sql } = require('../config/database');

async function createPayment({ customerId, saleId, amount, paymentDate, method, notes }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('customerId',  sql.Int,           parseInt(customerId))
    .input('saleId',      sql.Int,           saleId ? parseInt(saleId) : null)
    .input('amount',      sql.Decimal(10,2), parseFloat(amount))
    .input('paymentDate', sql.Date,          paymentDate || new Date())
    .input('method',      sql.NVarChar(50),  method || 'cash')
    .input('notes',       sql.NVarChar(500), notes || null)
    .query(`
      INSERT INTO Payments (customerId, saleId, amount, paymentDate, method, notes)
      OUTPUT INSERTED.*
      VALUES (@customerId, @saleId, @amount, @paymentDate, @method, @notes)
    `);
  return result.recordset[0];
}

async function getPaymentById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT * FROM Payments WHERE id = @id AND deletedAt IS NULL');
  const row = result.recordset[0];
  if (!row) { const e = new Error('Payment not found'); e.statusCode = 404; throw e; }
  return row;
}

async function getAllPayments() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT p.id, p.customerId, c.name AS customerName, p.saleId,
           p.amount, p.paymentDate, p.method, p.notes, p.createdAt
    FROM Payments p JOIN Customers c ON c.id = p.customerId
    WHERE p.deletedAt IS NULL
    ORDER BY p.paymentDate DESC, p.createdAt DESC
  `);
  return result.recordset;
}

async function updatePayment(id, { amount, paymentDate, method, notes }) {
  const pool = await getPool();
  const orig = await getPaymentById(id);
  const result = await pool.request()
    .input('id',          sql.Int,           parseInt(id))
    .input('amount',      sql.Decimal(10,2), amount      != null ? parseFloat(amount) : orig.amount)
    .input('paymentDate', sql.Date,          paymentDate ?? orig.paymentDate)
    .input('method',      sql.NVarChar(50),  method      ?? orig.method)
    .input('notes',       sql.NVarChar(500), notes       !== undefined ? notes : orig.notes)
    .query(`
      UPDATE Payments
      SET amount=@amount, paymentDate=@paymentDate, method=@method, notes=@notes, updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id AND deletedAt IS NULL
    `);
  if (!result.recordset.length) { const e = new Error('Payment not found'); e.statusCode = 404; throw e; }
  return result.recordset[0];
}

async function deletePayment(id, deletedBy) {
  const pool = await getPool();
  await getPaymentById(id);
  await pool.request()
    .input('id', sql.Int, parseInt(id)).input('deletedBy', sql.Int, deletedBy)
    .query('UPDATE Payments SET deletedAt=GETDATE(), deletedBy=@deletedBy WHERE id=@id');
}

async function getDebtors() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      c.id AS customerId, c.name AS customerName, c.phone, c.email,
      COALESCE(SUM(s.totalAmount), 0) AS totalSales,
      COALESCE((SELECT SUM(amount) FROM Payments p WHERE p.customerId=c.id AND p.deletedAt IS NULL), 0) AS totalPaid,
      COALESCE(SUM(s.totalAmount), 0)
        - COALESCE((SELECT SUM(amount) FROM Payments p WHERE p.customerId=c.id AND p.deletedAt IS NULL), 0) AS balance,
      MIN(s.saleDate) AS firstSaleDate,
      MAX(s.saleDate) AS lastSaleDate
    FROM Customers c
    LEFT JOIN Sales s ON s.customerId=c.id AND s.deletedAt IS NULL
    WHERE c.deletedAt IS NULL
    GROUP BY c.id, c.name, c.phone, c.email
    HAVING COALESCE(SUM(s.totalAmount),0)
      - COALESCE((SELECT SUM(amount) FROM Payments p WHERE p.customerId=c.id AND p.deletedAt IS NULL),0) > 0
    ORDER BY balance DESC
  `);
  const today = new Date();
  return result.recordset.map(row => {
    const daysDue = row.lastSaleDate ? Math.floor((today - new Date(row.lastSaleDate)) / 86400000) : 0;
    return { ...row, daysDue, overdue: daysDue > 30 };
  });
}

async function getPaymentsByCustomer(customerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('customerId', sql.Int, parseInt(customerId))
    .query(`
      SELECT p.*, s.eggSize, s.quantity, s.totalAmount AS saleTotal
      FROM Payments p LEFT JOIN Sales s ON s.id=p.saleId
      WHERE p.customerId=@customerId AND p.deletedAt IS NULL
      ORDER BY p.paymentDate DESC
    `);
  return result.recordset;
}

module.exports = { createPayment, getPaymentById, getAllPayments, updatePayment, deletePayment, getDebtors, getPaymentsByCustomer };

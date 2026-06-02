const { getPool, sql } = require('../config/database');

async function getAllExpenses() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, category, description, amount, expenseDate, createdAt, updatedAt
    FROM Expenses WHERE deletedAt IS NULL
    ORDER BY expenseDate DESC, createdAt DESC
  `);
  return result.recordset;
}

async function getExpenseById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT * FROM Expenses WHERE id=@id AND deletedAt IS NULL');
  const row = result.recordset[0];
  if (!row) { const e = new Error('Expense not found'); e.statusCode = 404; throw e; }
  return row;
}

async function createExpense({ category, description, amount, expenseDate }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('category',    sql.NVarChar(100), category)
    .input('description', sql.NVarChar(500), description)
    .input('amount',      sql.Decimal(10,2), parseFloat(amount))
    .input('expenseDate', sql.Date,          expenseDate || new Date())
    .query(`INSERT INTO Expenses (category, description, amount, expenseDate) OUTPUT INSERTED.* VALUES (@category, @description, @amount, @expenseDate)`);
  return result.recordset[0];
}

async function updateExpense(id, { category, description, amount, expenseDate }) {
  const pool = await getPool();
  const orig = await getExpenseById(id);
  const result = await pool.request()
    .input('id',          sql.Int,            parseInt(id))
    .input('category',    sql.NVarChar(100),  category    ?? orig.category)
    .input('description', sql.NVarChar(500),  description ?? orig.description)
    .input('amount',      sql.Decimal(10,2),  amount != null ? parseFloat(amount) : orig.amount)
    .input('expenseDate', sql.Date,           expenseDate ?? orig.expenseDate)
    .query(`
      UPDATE Expenses
      SET category=@category, description=@description, amount=@amount, expenseDate=@expenseDate, updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id AND deletedAt IS NULL
    `);
  if (!result.recordset.length) { const e = new Error('Expense not found'); e.statusCode = 404; throw e; }
  return result.recordset[0];
}

async function deleteExpense(id, deletedBy) {
  const pool = await getPool();
  await getExpenseById(id);
  await pool.request()
    .input('id', sql.Int, parseInt(id)).input('deletedBy', sql.Int, deletedBy)
    .query('UPDATE Expenses SET deletedAt=GETDATE(), deletedBy=@deletedBy WHERE id=@id');
}

async function getExpenseSummary() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT category, SUM(amount) AS total, COUNT(*) AS count
    FROM Expenses WHERE deletedAt IS NULL
    GROUP BY category ORDER BY total DESC
  `);
  return result.recordset;
}

module.exports = { getAllExpenses, getExpenseById, createExpense, updateExpense, deleteExpense, getExpenseSummary };

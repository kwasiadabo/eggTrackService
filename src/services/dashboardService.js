const { getPool } = require('../config/database');

async function getDashboardStats() {
  const pool = await getPool();

  const [inventory, sales, payments, expenses] = await Promise.all([
    pool.request().query('SELECT eggSize, quantity FROM Inventory'),
    pool.request().query('SELECT COALESCE(SUM(totalAmount),0) AS totalRevenue, COUNT(*) AS totalSales FROM Sales'),
    pool.request().query('SELECT COALESCE(SUM(amount),0) AS totalPaid FROM Payments'),
    pool.request().query('SELECT COALESCE(SUM(amount),0) AS totalExpenses FROM Expenses'),
  ]);

  const totalRevenue = sales.recordset[0].totalRevenue;
  const totalPaid    = payments.recordset[0].totalPaid;
  const outstandingDebt = totalRevenue - totalPaid;

  return {
    inventory: inventory.recordset,
    totalRevenue,
    totalSales: sales.recordset[0].totalSales,
    totalPaid,
    outstandingDebt,
    totalExpenses: expenses.recordset[0].totalExpenses,
    netProfit: totalRevenue - expenses.recordset[0].totalExpenses,
  };
}

module.exports = { getDashboardStats };

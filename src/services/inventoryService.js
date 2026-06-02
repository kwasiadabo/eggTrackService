const { getPool } = require('../config/database');

async function getInventory() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, eggSize, quantity, updatedAt
    FROM Inventory
    ORDER BY eggSize
  `);
  return result.recordset;
}

module.exports = { getInventory };

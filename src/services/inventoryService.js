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

async function reconcileInventory() {
  const pool = await getPool();
  await pool.request().query(`
    UPDATE Inventory
    SET quantity = (
          ISNULL((SELECT SUM(quantity) FROM EggsPurchases WHERE eggSize = Inventory.eggSize AND deletedAt IS NULL), 0)
        - ISNULL((SELECT SUM(quantity) FROM Sales         WHERE eggSize = Inventory.eggSize AND deletedAt IS NULL), 0)
        ),
        updatedAt = GETDATE()
  `);
  return getInventory();
}

module.exports = { getInventory, reconcileInventory };

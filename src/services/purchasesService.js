const { getPool, sql } = require('../config/database');

async function getAllPurchases() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, farmName, eggSize, quantity, costPerTray, totalCost,
           purchaseDate, notes, createdAt, updatedAt
    FROM EggsPurchases
    WHERE deletedAt IS NULL
    ORDER BY purchaseDate DESC, createdAt DESC
  `);
  return result.recordset;
}

async function getPurchaseById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT * FROM EggsPurchases WHERE id = @id AND deletedAt IS NULL');
  const row = result.recordset[0];
  if (!row) { const e = new Error('Purchase not found'); e.statusCode = 404; throw e; }
  return row;
}

async function createPurchase({ farmName, eggSize, quantity, costPerTray, purchaseDate, notes }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('farmName',    sql.NVarChar(150), farmName)
      .input('eggSize',     sql.NVarChar(10),  eggSize)
      .input('quantity',    sql.Int,            parseInt(quantity))
      .input('costPerTray', sql.Decimal(10, 2), parseFloat(costPerTray))
      .input('purchaseDate',sql.Date,           purchaseDate || new Date())
      .input('notes',       sql.NVarChar(500),  notes || null)
      .query(`
        INSERT INTO EggsPurchases (farmName, eggSize, quantity, costPerTray, purchaseDate, notes)
        OUTPUT INSERTED.*
        VALUES (@farmName, @eggSize, @quantity, @costPerTray, @purchaseDate, @notes)
      `);
    await transaction.request()
      .input('qty',     sql.Int,          parseInt(quantity))
      .input('eggSize', sql.NVarChar(10), eggSize)
      .query(`
        MERGE Inventory WITH (HOLDLOCK) AS t
        USING (VALUES (@eggSize, @qty)) AS s(eggSize, qty) ON t.eggSize = s.eggSize
        WHEN MATCHED     THEN UPDATE SET quantity = t.quantity + s.qty, updatedAt = GETDATE()
        WHEN NOT MATCHED THEN INSERT (eggSize, quantity) VALUES (s.eggSize, s.qty);
      `);
    await transaction.commit();
    return r.recordset[0];
  } catch (err) { await transaction.rollback(); throw err; }
}

async function updatePurchase(id, { farmName, eggSize, quantity, costPerTray, purchaseDate, notes }) {
  const pool = await getPool();
  // Get original to diff inventory
  const orig = await getPurchaseById(id);

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('id',          sql.Int,            parseInt(id))
      .input('farmName',    sql.NVarChar(150),   farmName    ?? orig.farmName)
      .input('eggSize',     sql.NVarChar(10),    eggSize     ?? orig.eggSize)
      .input('quantity',    sql.Int,             quantity    != null ? parseInt(quantity) : orig.quantity)
      .input('costPerTray', sql.Decimal(10, 2),  costPerTray != null ? parseFloat(costPerTray) : orig.costPerTray)
      .input('purchaseDate',sql.Date,            purchaseDate ?? orig.purchaseDate)
      .input('notes',       sql.NVarChar(500),   notes       !== undefined ? notes : orig.notes)
      .query(`
        UPDATE EggsPurchases
        SET farmName = @farmName, eggSize = @eggSize, quantity = @quantity,
            costPerTray = @costPerTray, purchaseDate = @purchaseDate,
            notes = @notes, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id AND deletedAt IS NULL
      `);

    // Adjust inventory: remove old qty on old size, add new qty on new size
    const newQty  = quantity    != null ? parseInt(quantity) : orig.quantity;
    const newSize = eggSize     ?? orig.eggSize;
    if (newSize === orig.eggSize) {
      const diff = newQty - orig.quantity;
      if (diff !== 0) {
        await transaction.request()
          .input('diff',    sql.Int,          diff)
          .input('eggSize', sql.NVarChar(10), newSize)
          .query(`UPDATE Inventory SET quantity = quantity + @diff, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
      }
    } else {
      await transaction.request()
        .input('qty',     sql.Int,          orig.quantity)
        .input('eggSize', sql.NVarChar(10), orig.eggSize)
        .query(`UPDATE Inventory SET quantity = quantity - @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
      await transaction.request()
        .input('qty',     sql.Int,          newQty)
        .input('eggSize', sql.NVarChar(10), newSize)
        .query(`UPDATE Inventory SET quantity = quantity + @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
    }

    await transaction.commit();
    return r.recordset[0];
  } catch (err) { await transaction.rollback(); throw err; }
}

async function deletePurchase(id, deletedBy) {
  const pool = await getPool();
  const orig = await getPurchaseById(id);
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await transaction.request()
      .input('id',        sql.Int,      parseInt(id))
      .input('deletedBy', sql.Int,      deletedBy)
      .query(`UPDATE EggsPurchases SET deletedAt = GETDATE(), deletedBy = @deletedBy WHERE id = @id`);
    // Reverse inventory
    await transaction.request()
      .input('qty',     sql.Int,          orig.quantity)
      .input('eggSize', sql.NVarChar(10), orig.eggSize)
      .query(`UPDATE Inventory SET quantity = quantity - @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
    await transaction.commit();
  } catch (err) { await transaction.rollback(); throw err; }
}

// Create multiple purchase line-items from one farm in a single transaction
async function createBatch({ farmName, purchaseDate, notes, items }) {
  if (!items || items.length === 0) {
    const e = new Error('Batch must have at least one line item'); e.statusCode = 400; throw e;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  const inserted = [];
  try {
    await transaction.begin();
    for (const item of items) {
      const r = await transaction.request()
        .input('farmName',    sql.NVarChar(150), farmName)
        .input('eggSize',     sql.NVarChar(10),  item.eggSize)
        .input('quantity',    sql.Int,            parseInt(item.quantity))
        .input('costPerTray', sql.Decimal(10, 2), parseFloat(item.costPerTray))
        .input('purchaseDate',sql.Date,           purchaseDate || new Date())
        .input('notes',       sql.NVarChar(500),  notes || null)
        .query(`
          INSERT INTO EggsPurchases (farmName, eggSize, quantity, costPerTray, purchaseDate, notes)
          OUTPUT INSERTED.*
          VALUES (@farmName, @eggSize, @quantity, @costPerTray, @purchaseDate, @notes)
        `);
      await transaction.request()
        .input('qty',     sql.Int,          parseInt(item.quantity))
        .input('eggSize', sql.NVarChar(10), item.eggSize)
        .query(`
          MERGE Inventory WITH (HOLDLOCK) AS t
          USING (VALUES (@eggSize, @qty)) AS s(eggSize, qty) ON t.eggSize = s.eggSize
          WHEN MATCHED     THEN UPDATE SET quantity = t.quantity + s.qty, updatedAt = GETDATE()
          WHEN NOT MATCHED THEN INSERT (eggSize, quantity) VALUES (s.eggSize, s.qty);
        `);
      inserted.push(r.recordset[0]);
    }
    await transaction.commit();
    return inserted;
  } catch (err) { await transaction.rollback(); throw err; }
}

module.exports = { getAllPurchases, getPurchaseById, createPurchase, updatePurchase, deletePurchase, createBatch };

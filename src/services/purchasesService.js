const { getPool, sql } = require('../config/database');

// Purchases must reference a farm from the authorised (active) Farms list
async function assertFarmAuthorised(pool, farmName) {
  const result = await pool.request()
    .input('farmName', sql.NVarChar(150), farmName)
    .query(`SELECT id FROM Farms WHERE name = @farmName AND isActive = 1 AND deletedAt IS NULL`);
  if (!result.recordset.length) {
    const e = new Error(`"${farmName}" is not on the authorised farms list. Add it in Farm Setup first.`);
    e.statusCode = 400; throw e;
  }
}

async function getAllPurchases({ status } = {}) {
  const pool = await getPool();
  const request = pool.request();
  let where = 'WHERE p.deletedAt IS NULL';
  if (status) {
    where += ' AND p.status = @status';
    request.input('status', sql.NVarChar(20), status);
  }
  const result = await request.query(`
    SELECT p.id, p.farmName, p.eggSize, p.quantity, p.costPerTray, p.totalCost,
           p.purchaseDate, p.notes, p.status,
           p.initiatedById, ui.name AS initiatedByName,
           p.approvedById,  ua.name AS approvedByName,
           p.approvedAt, p.rejectedAt, p.rejectionNote,
           p.createdAt, p.updatedAt
    FROM EggsPurchases p
    LEFT JOIN Users ui ON ui.id = p.initiatedById
    LEFT JOIN Users ua ON ua.id = p.approvedById
    ${where}
    ORDER BY p.purchaseDate DESC, p.createdAt DESC
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

async function applyInventory(transaction, eggSize, qty) {
  await transaction.request()
    .input('qty',     sql.Int,          qty)
    .input('eggSize', sql.NVarChar(10), eggSize)
    .query(`
      MERGE Inventory WITH (HOLDLOCK) AS t
      USING (VALUES (@eggSize, @qty)) AS s(eggSize, qty) ON t.eggSize = s.eggSize
      WHEN MATCHED     THEN UPDATE SET quantity = t.quantity + s.qty, updatedAt = GETDATE()
      WHEN NOT MATCHED THEN INSERT (eggSize, quantity) VALUES (s.eggSize, s.qty);
    `);
}

// Managers' purchases are submitted as 'pending' and only update inventory once an
// admin approves them. Admins' own submissions are auto-approved immediately.
async function createPurchase({ farmName, eggSize, quantity, costPerTray, purchaseDate, notes }, userId, userRole) {
  const pool = await getPool();
  await assertFarmAuthorised(pool, farmName);
  const isAdmin = userRole === 'admin';
  const status = isAdmin ? 'approved' : 'pending';

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('farmName',      sql.NVarChar(150), farmName)
      .input('eggSize',       sql.NVarChar(10),  eggSize)
      .input('quantity',      sql.Int,            parseInt(quantity))
      .input('costPerTray',   sql.Decimal(10, 2), parseFloat(costPerTray))
      .input('purchaseDate',  sql.Date,           purchaseDate || new Date())
      .input('notes',         sql.NVarChar(500),  notes || null)
      .input('status',        sql.NVarChar(20),   status)
      .input('initiatedById', sql.Int,            userId)
      .query(`
        INSERT INTO EggsPurchases
          (farmName, eggSize, quantity, costPerTray, purchaseDate, notes, status, initiatedById, approvedById, approvedAt)
        OUTPUT INSERTED.*
        VALUES (@farmName, @eggSize, @quantity, @costPerTray, @purchaseDate, @notes, @status, @initiatedById,
                ${isAdmin ? '@initiatedById, GETDATE()' : 'NULL, NULL'})
      `);
    if (status === 'approved') {
      await applyInventory(transaction, eggSize, parseInt(quantity));
    }
    await transaction.commit();
    return r.recordset[0];
  } catch (err) { await transaction.rollback(); throw err; }
}

async function updatePurchase(id, { farmName, eggSize, quantity, costPerTray, purchaseDate, notes }) {
  const pool = await getPool();
  // Get original to diff inventory
  const orig = await getPurchaseById(id);

  const newFarmName = farmName ?? orig.farmName;
  if (newFarmName !== orig.farmName) await assertFarmAuthorised(pool, newFarmName);

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('id',          sql.Int,            parseInt(id))
      .input('farmName',    sql.NVarChar(150),   newFarmName)
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

    // Inventory was only applied for already-approved purchases — only reconcile those.
    if (orig.status === 'approved') {
      const newQty  = quantity != null ? parseInt(quantity) : orig.quantity;
      const newSize = eggSize  ?? orig.eggSize;
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
    // Only reverse inventory if it was actually applied (i.e. the purchase was approved)
    if (orig.status === 'approved') {
      await transaction.request()
        .input('qty',     sql.Int,          orig.quantity)
        .input('eggSize', sql.NVarChar(10), orig.eggSize)
        .query(`UPDATE Inventory SET quantity = quantity - @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
    }
    await transaction.commit();
    return orig;
  } catch (err) { await transaction.rollback(); throw err; }
}

// Create multiple purchase line-items from one farm in a single transaction
async function createBatch({ farmName, purchaseDate, notes, items }, userId, userRole) {
  if (!items || items.length === 0) {
    const e = new Error('Batch must have at least one line item'); e.statusCode = 400; throw e;
  }
  const pool = await getPool();
  await assertFarmAuthorised(pool, farmName);
  const isAdmin = userRole === 'admin';
  const status = isAdmin ? 'approved' : 'pending';

  const transaction = new sql.Transaction(pool);
  const inserted = [];
  try {
    await transaction.begin();
    for (const item of items) {
      const r = await transaction.request()
        .input('farmName',      sql.NVarChar(150), farmName)
        .input('eggSize',       sql.NVarChar(10),  item.eggSize)
        .input('quantity',      sql.Int,            parseInt(item.quantity))
        .input('costPerTray',   sql.Decimal(10, 2), parseFloat(item.costPerTray))
        .input('purchaseDate',  sql.Date,           purchaseDate || new Date())
        .input('notes',         sql.NVarChar(500),  notes || null)
        .input('status',        sql.NVarChar(20),   status)
        .input('initiatedById', sql.Int,            userId)
        .query(`
          INSERT INTO EggsPurchases
            (farmName, eggSize, quantity, costPerTray, purchaseDate, notes, status, initiatedById, approvedById, approvedAt)
          OUTPUT INSERTED.*
          VALUES (@farmName, @eggSize, @quantity, @costPerTray, @purchaseDate, @notes, @status, @initiatedById,
                  ${isAdmin ? '@initiatedById, GETDATE()' : 'NULL, NULL'})
        `);
      if (status === 'approved') {
        await applyInventory(transaction, item.eggSize, parseInt(item.quantity));
      }
      inserted.push(r.recordset[0]);
    }
    await transaction.commit();
    return inserted;
  } catch (err) { await transaction.rollback(); throw err; }
}

// ── Admin approval ──────────────────────────────────────────────────────────

async function approvePurchase(id, adminId) {
  const pool = await getPool();
  const orig = await getPurchaseById(id);
  if (orig.status !== 'pending') {
    const e = new Error('Only pending purchases can be approved'); e.statusCode = 400; throw e;
  }
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('id',         sql.Int, parseInt(id))
      .input('approvedBy', sql.Int, adminId)
      .query(`
        UPDATE EggsPurchases
        SET status='approved', approvedById=@approvedBy, approvedAt=GETDATE(), updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id=@id
      `);
    await applyInventory(transaction, orig.eggSize, orig.quantity);
    await transaction.commit();
    return r.recordset[0];
  } catch (err) { await transaction.rollback(); throw err; }
}

async function rejectPurchase(id, adminId, rejectionNote) {
  const pool = await getPool();
  const orig = await getPurchaseById(id);
  if (orig.status !== 'pending') {
    const e = new Error('Only pending purchases can be rejected'); e.statusCode = 400; throw e;
  }
  const result = await pool.request()
    .input('id',      sql.Int,           parseInt(id))
    .input('adminId', sql.Int,           adminId)
    .input('note',    sql.NVarChar(300), rejectionNote || null)
    .query(`
      UPDATE EggsPurchases
      SET status='rejected', approvedById=@adminId, rejectedAt=GETDATE(), rejectionNote=@note, updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id
    `);
  return result.recordset[0];
}

module.exports = {
  getAllPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  createBatch,
  approvePurchase,
  rejectPurchase,
};

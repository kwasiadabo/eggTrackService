const { getPool, sql } = require('../config/database');
const bankService = require('./bankService');

async function getAllSales() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT s.id, s.customerId, c.name AS customerName,
           s.eggSize, s.quantity, s.unitPrice, s.totalAmount,
           s.saleDate, s.notes, s.invoiceNo, s.createdAt, s.updatedAt
    FROM Sales s JOIN Customers c ON c.id = s.customerId
    WHERE s.deletedAt IS NULL
    ORDER BY s.saleDate DESC, s.createdAt DESC
  `);
  return result.recordset;
}

async function getSaleById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT s.*, c.name AS customerName, c.phone, c.address
      FROM Sales s JOIN Customers c ON c.id = s.customerId
      WHERE s.id = @id AND s.deletedAt IS NULL
    `);
  const row = result.recordset[0];
  if (!row) { const e = new Error('Sale not found'); e.statusCode = 404; throw e; }
  return row;
}

async function createSale({ customerId, eggSize, quantity, unitPrice, saleDate, notes, bankAccountId }, userId) {
  const pool = await getPool();
  const stock = await pool.request()
    .input('eggSize', sql.NVarChar(10), eggSize)
    .query('SELECT quantity FROM Inventory WHERE eggSize = @eggSize');
  const available = stock.recordset[0]?.quantity || 0;
  if (available < parseInt(quantity)) {
    const e = new Error(`Insufficient stock. Available: ${available} trays of ${eggSize} eggs`);
    e.statusCode = 400; throw e;
  }
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('customerId', sql.Int,           parseInt(customerId))
      .input('eggSize',    sql.NVarChar(10),  eggSize)
      .input('quantity',   sql.Int,           parseInt(quantity))
      .input('unitPrice',  sql.Decimal(10,2), parseFloat(unitPrice))
      .input('saleDate',   sql.Date,          saleDate || new Date())
      .input('notes',      sql.NVarChar(500), notes || null)
      .query(`
        INSERT INTO Sales (customerId, eggSize, quantity, unitPrice, saleDate, notes)
        OUTPUT INSERTED.*
        VALUES (@customerId, @eggSize, @quantity, @unitPrice, @saleDate, @notes)
      `);
    await transaction.request()
      .input('qty',     sql.Int,          parseInt(quantity))
      .input('eggSize', sql.NVarChar(10), eggSize)
      .query(`UPDATE Inventory SET quantity = quantity - @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
    await transaction.commit();
    const sale = r.recordset[0];
    const full = await pool.request().input('id', sql.Int, sale.id)
      .query('SELECT s.*, c.name AS customerName, c.phone, c.address FROM Sales s JOIN Customers c ON c.id = s.customerId WHERE s.id = @id');
    const saleRow = full.recordset[0];
    if (bankAccountId && userId) {
      const depositAmt = parseInt(quantity) * parseFloat(unitPrice);
      await bankService.createDeposit({
        bankAccountId,
        amount: depositAmt,
        description: `Sale deposit — ${saleRow.customerName}`,
        reference: `SALE-${saleRow.id}`,
        transactionDate: saleDate || new Date(),
      }, userId);
    }
    return saleRow;
  } catch (err) { await transaction.rollback(); throw err; }
}

async function updateSale(id, { customerId, eggSize, quantity, unitPrice, saleDate, notes }) {
  const pool = await getPool();
  const orig = await getSaleById(id);
  const newQty  = quantity   != null ? parseInt(quantity)        : orig.quantity;
  const newSize = eggSize    ?? orig.eggSize;
  const qtyDiff = newQty - (newSize === orig.eggSize ? orig.quantity : 0);

  // If size or qty changed, validate stock
  if (newSize !== orig.eggSize || newQty !== orig.quantity) {
    const stock = await pool.request()
      .input('eggSize', sql.NVarChar(10), newSize)
      .query('SELECT quantity FROM Inventory WHERE eggSize = @eggSize');
    const available = (stock.recordset[0]?.quantity || 0) + (newSize === orig.eggSize ? orig.quantity : 0);
    if (available < newQty) {
      const e = new Error(`Insufficient stock. Available: ${available} trays of ${newSize} eggs`); e.statusCode = 400; throw e;
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const r = await transaction.request()
      .input('id',         sql.Int,           parseInt(id))
      .input('customerId', sql.Int,           customerId != null ? parseInt(customerId) : orig.customerId)
      .input('eggSize',    sql.NVarChar(10),  newSize)
      .input('quantity',   sql.Int,           newQty)
      .input('unitPrice',  sql.Decimal(10,2), unitPrice  != null ? parseFloat(unitPrice) : orig.unitPrice)
      .input('saleDate',   sql.Date,          saleDate   ?? orig.saleDate)
      .input('notes',      sql.NVarChar(500), notes      !== undefined ? notes : orig.notes)
      .query(`
        UPDATE Sales SET customerId=@customerId, eggSize=@eggSize, quantity=@quantity,
          unitPrice=@unitPrice, saleDate=@saleDate, notes=@notes, updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id=@id AND deletedAt IS NULL
      `);

    // Reconcile inventory
    if (newSize === orig.eggSize) {
      const diff = newQty - orig.quantity;
      if (diff !== 0) await transaction.request()
        .input('diff', sql.Int, -diff).input('eggSize', sql.NVarChar(10), newSize)
        .query(`UPDATE Inventory SET quantity=quantity+@diff, updatedAt=GETDATE() WHERE eggSize=@eggSize`);
    } else {
      await transaction.request().input('qty', sql.Int, orig.quantity).input('eggSize', sql.NVarChar(10), orig.eggSize)
        .query(`UPDATE Inventory SET quantity=quantity+@qty, updatedAt=GETDATE() WHERE eggSize=@eggSize`);
      await transaction.request().input('qty', sql.Int, newQty).input('eggSize', sql.NVarChar(10), newSize)
        .query(`UPDATE Inventory SET quantity=quantity-@qty, updatedAt=GETDATE() WHERE eggSize=@eggSize`);
    }
    await transaction.commit();
    return r.recordset[0];
  } catch (err) { await transaction.rollback(); throw err; }
}

async function deleteSale(id, deletedBy) {
  const pool = await getPool();
  const orig = await getSaleById(id);
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await transaction.request()
      .input('id', sql.Int, parseInt(id)).input('deletedBy', sql.Int, deletedBy)
      .query(`UPDATE Sales SET deletedAt=GETDATE(), deletedBy=@deletedBy WHERE id=@id`);
    // Return stock
    await transaction.request()
      .input('qty', sql.Int, orig.quantity).input('eggSize', sql.NVarChar(10), orig.eggSize)
      .query(`UPDATE Inventory SET quantity=quantity+@qty, updatedAt=GETDATE() WHERE eggSize=@eggSize`);
    await transaction.commit();
  } catch (err) { await transaction.rollback(); throw err; }
}

// ── Multi-line invoice: one atomic transaction, shared invoice number ─────────
function generateInvoiceNo(date) {
  const d   = date ? new Date(date) : new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

async function createInvoice({ customerId, saleDate, notes, items, bankAccountId }, userId) {
  if (!items || items.length === 0) {
    const e = new Error('Invoice must have at least one line item'); e.statusCode = 400; throw e;
  }

  const pool = await getPool();

  // Aggregate per-size totals and validate stock in one pass
  const sizeQtys = {};
  for (const item of items) {
    sizeQtys[item.eggSize] = (sizeQtys[item.eggSize] || 0) + parseInt(item.quantity);
  }
  for (const [eggSize, totalQty] of Object.entries(sizeQtys)) {
    const stock = await pool.request()
      .input('eggSize', sql.NVarChar(10), eggSize)
      .query('SELECT quantity FROM Inventory WHERE eggSize = @eggSize');
    const available = stock.recordset[0]?.quantity || 0;
    if (available < totalQty) {
      const e = new Error(`Insufficient stock for ${eggSize} eggs. Available: ${available}, required: ${totalQty}`);
      e.statusCode = 400; throw e;
    }
  }

  const invoiceNo   = generateInvoiceNo(saleDate);
  const transaction = new sql.Transaction(pool);
  const insertedIds = [];

  try {
    await transaction.begin();
    for (const item of items) {
      const r = await transaction.request()
        .input('customerId', sql.Int,           parseInt(customerId))
        .input('eggSize',    sql.NVarChar(10),  item.eggSize)
        .input('quantity',   sql.Int,           parseInt(item.quantity))
        .input('unitPrice',  sql.Decimal(10,2), parseFloat(item.unitPrice))
        .input('saleDate',   sql.Date,          saleDate || new Date())
        .input('notes',      sql.NVarChar(500), notes || null)
        .input('invoiceNo',  sql.NVarChar(20),  invoiceNo)
        .query(`
          INSERT INTO Sales (customerId, eggSize, quantity, unitPrice, saleDate, notes, invoiceNo)
          OUTPUT INSERTED.id
          VALUES (@customerId, @eggSize, @quantity, @unitPrice, @saleDate, @notes, @invoiceNo)
        `);
      insertedIds.push(r.recordset[0].id);
      await transaction.request()
        .input('qty',     sql.Int,          parseInt(item.quantity))
        .input('eggSize', sql.NVarChar(10), item.eggSize)
        .query(`UPDATE Inventory SET quantity = quantity - @qty, updatedAt = GETDATE() WHERE eggSize = @eggSize`);
    }
    await transaction.commit();

    const full = await pool.request().query(`
      SELECT s.*, c.name AS customerName, c.phone, c.address
      FROM Sales s JOIN Customers c ON c.id = s.customerId
      WHERE s.id IN (${insertedIds.join(',')})
      ORDER BY s.id
    `);
    const rows = full.recordset;
    if (bankAccountId && userId) {
      const totalAmt = items.reduce((s, i) => s + parseInt(i.quantity) * parseFloat(i.unitPrice), 0);
      await bankService.createDeposit({
        bankAccountId,
        amount: totalAmt,
        description: `Invoice deposit — ${rows[0].customerName}`,
        reference: invoiceNo,
        transactionDate: saleDate || new Date(),
      }, userId);
    }
    return {
      invoiceNo,
      sales: rows,
      customer: { name: rows[0].customerName, phone: rows[0].phone, address: rows[0].address },
    };
  } catch (err) { await transaction.rollback(); throw err; }
}

module.exports = { getAllSales, getSaleById, createSale, updateSale, deleteSale, createInvoice };

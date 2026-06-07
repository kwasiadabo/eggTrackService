const { getPool, sql } = require('../config/database');

// ── Accounts ──────────────────────────────────────────────────────────────────

async function listAccounts(includeInactive = false) {
  const pool = await getPool();
  const where = includeInactive ? '' : 'WHERE a.isActive = 1';
  const result = await pool.request().query(`
    SELECT a.id, a.bankName, a.accountName, a.accountNumber, a.branch, a.isActive,
           a.createdAt, a.updatedAt,
           COALESCE((
             SELECT SUM(t.amount) FROM BankTransactions t
             WHERE t.bankAccountId = a.id AND t.type = 'deposit' AND t.status = 'approved'
           ), 0) -
           COALESCE((
             SELECT SUM(t.amount) FROM BankTransactions t
             WHERE t.bankAccountId = a.id AND t.type = 'withdrawal' AND t.status = 'approved'
           ), 0) AS balance
    FROM BankAccounts a
    ${where}
    ORDER BY a.createdAt
  `);
  return result.recordset;
}

async function createAccount({ bankName, accountName, accountNumber, branch }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('bankName',      sql.NVarChar(150), bankName)
    .input('accountName',   sql.NVarChar(150), accountName)
    .input('accountNumber', sql.NVarChar(50),  accountNumber)
    .input('branch',        sql.NVarChar(150), branch || null)
    .query(`
      INSERT INTO BankAccounts (bankName, accountName, accountNumber, branch)
      OUTPUT INSERTED.*
      VALUES (@bankName, @accountName, @accountNumber, @branch)
    `);
  return { ...result.recordset[0], balance: 0 };
}

async function updateAccount(id, { bankName, accountName, accountNumber, branch, isActive }) {
  const pool = await getPool();
  const fields = [];
  const req = pool.request().input('id', sql.Int, parseInt(id));
  if (bankName      !== undefined) { fields.push('bankName = @bankName');           req.input('bankName',      sql.NVarChar(150), bankName); }
  if (accountName   !== undefined) { fields.push('accountName = @accountName');     req.input('accountName',   sql.NVarChar(150), accountName); }
  if (accountNumber !== undefined) { fields.push('accountNumber = @accountNumber'); req.input('accountNumber', sql.NVarChar(50),  accountNumber); }
  if (branch        !== undefined) { fields.push('branch = @branch');               req.input('branch',        sql.NVarChar(150), branch); }
  if (isActive      !== undefined) { fields.push('isActive = @isActive');           req.input('isActive',      sql.Bit,          isActive ? 1 : 0); }
  if (!fields.length) { const e = new Error('Nothing to update'); e.statusCode = 400; throw e; }
  fields.push('updatedAt = GETDATE()');
  const result = await req.query(
    `UPDATE BankAccounts SET ${fields.join(', ')} OUTPUT INSERTED.* WHERE id = @id`
  );
  if (!result.recordset.length) { const e = new Error('Account not found'); e.statusCode = 404; throw e; }
  return result.recordset[0];
}

// ── Transactions ──────────────────────────────────────────────────────────────

async function listTransactions({ bankAccountId, type, status, fromDate, toDate } = {}) {
  const pool = await getPool();
  const conditions = [];
  const req = pool.request();
  if (bankAccountId) { conditions.push('t.bankAccountId = @bankAccountId'); req.input('bankAccountId', sql.Int,          parseInt(bankAccountId)); }
  if (type)          { conditions.push('t.type = @type');                   req.input('type',          sql.NVarChar(20), type); }
  if (status)        { conditions.push('t.status = @status');               req.input('status',        sql.NVarChar(20), status); }
  if (fromDate)      { conditions.push('t.transactionDate >= @fromDate');   req.input('fromDate',      sql.Date,         fromDate); }
  if (toDate)        { conditions.push('t.transactionDate <= @toDate');     req.input('toDate',        sql.Date,         toDate); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await req.query(`
    SELECT t.id, t.bankAccountId, a.bankName, a.accountName, a.accountNumber,
           t.type, t.amount, t.description, t.reference, t.status,
           t.transactionDate, t.createdAt,
           t.initiatedById, ui.name AS initiatedByName,
           t.approvedById,  ua.name AS approvedByName,
           t.approvedAt, t.rejectedAt, t.rejectionNote
    FROM BankTransactions t
    JOIN BankAccounts a ON a.id = t.bankAccountId
    JOIN Users ui ON ui.id = t.initiatedById
    LEFT JOIN Users ua ON ua.id = t.approvedById
    ${where}
    ORDER BY t.createdAt DESC
  `);
  return result.recordset;
}

async function createDeposit({ bankAccountId, amount, description, reference, transactionDate }, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('bankAccountId',   sql.Int,           parseInt(bankAccountId))
    .input('amount',          sql.Decimal(12, 2), parseFloat(amount))
    .input('description',     sql.NVarChar(500),  description    || null)
    .input('reference',       sql.NVarChar(100),  reference      || null)
    .input('transactionDate', sql.Date,           transactionDate || new Date())
    .input('initiatedById',   sql.Int,           userId)
    .query(`
      INSERT INTO BankTransactions
        (bankAccountId, type, amount, description, reference, transactionDate, status, initiatedById, approvedById, approvedAt)
      OUTPUT INSERTED.*
      VALUES (@bankAccountId, 'deposit', @amount, @description, @reference, @transactionDate,
              'approved', @initiatedById, @initiatedById, GETDATE())
    `);
  return result.recordset[0];
}

async function createWithdrawal({ bankAccountId, amount, description, reference, transactionDate }, userId, userRole) {
  const pool = await getPool();

  // Guard: check available balance before allowing withdrawal
  const balRow = await pool.request()
    .input('bankAccountId', sql.Int, parseInt(bankAccountId))
    .query(`
      SELECT
        COALESCE((SELECT SUM(amount) FROM BankTransactions WHERE bankAccountId=@bankAccountId AND type='deposit'    AND status='approved'),0) -
        COALESCE((SELECT SUM(amount) FROM BankTransactions WHERE bankAccountId=@bankAccountId AND type='withdrawal' AND status='approved'),0)
      AS balance
    `);
  const balance = parseFloat(balRow.recordset[0]?.balance || 0);
  if (parseFloat(amount) > balance) {
    const e = new Error(`Insufficient balance. Available: GH₵ ${balance.toFixed(2)}`);
    e.statusCode = 400; throw e;
  }

  const isAdmin = userRole === 'admin';
  const status  = isAdmin ? 'approved' : 'pending';
  const result  = await pool.request()
    .input('bankAccountId',   sql.Int,           parseInt(bankAccountId))
    .input('amount',          sql.Decimal(12, 2), parseFloat(amount))
    .input('description',     sql.NVarChar(500),  description    || null)
    .input('reference',       sql.NVarChar(100),  reference      || null)
    .input('transactionDate', sql.Date,           transactionDate || new Date())
    .input('status',          sql.NVarChar(20),   status)
    .input('initiatedById',   sql.Int,           userId)
    .input('approvedById',    sql.Int,           isAdmin ? userId : null)
    .query(`
      INSERT INTO BankTransactions
        (bankAccountId, type, amount, description, reference, transactionDate, status, initiatedById, approvedById, approvedAt)
      OUTPUT INSERTED.*
      VALUES (@bankAccountId, 'withdrawal', @amount, @description, @reference, @transactionDate, @status, @initiatedById,
              ${isAdmin ? '@approvedById, GETDATE()' : 'NULL, NULL'})
    `);
  return result.recordset[0];
}

async function approveWithdrawal(id, adminId) {
  const pool = await getPool();
  const row = await pool.request().input('id', sql.Int, parseInt(id))
    .query('SELECT id, status, type FROM BankTransactions WHERE id = @id');
  const tx = row.recordset[0];
  if (!tx) { const e = new Error('Transaction not found'); e.statusCode = 404; throw e; }
  if (tx.type !== 'withdrawal' || tx.status !== 'pending') {
    const e = new Error('Only pending withdrawal requests can be approved'); e.statusCode = 400; throw e;
  }
  const result = await pool.request()
    .input('id',         sql.Int, parseInt(id))
    .input('approvedBy', sql.Int, adminId)
    .query(`
      UPDATE BankTransactions
      SET status='approved', approvedById=@approvedBy, approvedAt=GETDATE(), updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id
    `);
  return result.recordset[0];
}

async function rejectWithdrawal(id, adminId, rejectionNote) {
  const pool = await getPool();
  const row = await pool.request().input('id', sql.Int, parseInt(id))
    .query('SELECT id, status, type FROM BankTransactions WHERE id = @id');
  const tx = row.recordset[0];
  if (!tx) { const e = new Error('Transaction not found'); e.statusCode = 404; throw e; }
  if (tx.type !== 'withdrawal' || tx.status !== 'pending') {
    const e = new Error('Only pending withdrawal requests can be rejected'); e.statusCode = 400; throw e;
  }
  const result = await pool.request()
    .input('id',      sql.Int,           parseInt(id))
    .input('adminId', sql.Int,           adminId)
    .input('note',    sql.NVarChar(300), rejectionNote || null)
    .query(`
      UPDATE BankTransactions
      SET status='rejected', approvedById=@adminId, rejectedAt=GETDATE(), rejectionNote=@note, updatedAt=GETDATE()
      OUTPUT INSERTED.*
      WHERE id=@id
    `);
  return result.recordset[0];
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  listTransactions,
  createDeposit,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
};

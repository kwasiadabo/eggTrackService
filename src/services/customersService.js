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
	const result = await pool
		.request()
		.input('id', sql.Int, parseInt(id))
		.query('SELECT * FROM Customers WHERE id = @id AND deletedAt IS NULL');
	const row = result.recordset[0];
	if (!row) {
		const e = new Error('Customer not found');
		e.statusCode = 404;
		throw e;
	}
	return row;
}

async function createCustomer({ name, phone, address, email }) {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('name', sql.NVarChar(150), name)
		.input('phone', sql.NVarChar(30), phone || null)
		.input('address', sql.NVarChar(300), address || null)
		.input('email', sql.NVarChar(150), email || null)
		.query(
			`INSERT INTO Customers (name, phone, address, email) OUTPUT INSERTED.* VALUES (@name, @phone, @address, @email)`,
		);
	return result.recordset[0];
}

async function updateCustomer(id, { name, phone, address, email }) {
	const pool = await getPool();
	const orig = await getCustomerById(id);
	const result = await pool
		.request()
		.input('id', sql.Int, parseInt(id))
		.input('name', sql.NVarChar(150), name ?? orig.name)
		.input('phone', sql.NVarChar(30), phone !== undefined ? phone : orig.phone)
		.input(
			'address',
			sql.NVarChar(300),
			address !== undefined ? address : orig.address,
		)
		.input('email', sql.NVarChar(150), email !== undefined ? email : orig.email)
		.query(`
      UPDATE Customers
      SET name = @name, phone = @phone, address = @address, email = @email, updatedAt = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id AND deletedAt IS NULL
    `);
	if (!result.recordset.length) {
		const e = new Error('Customer not found');
		e.statusCode = 404;
		throw e;
	}
	return result.recordset[0];
}

async function deleteCustomer(id, deletedBy) {
	const pool = await getPool();
	await getCustomerById(id); // throws 404 if missing
	// Check for active sales
	const hasSales = await pool
		.request()
		.input('id', sql.Int, parseInt(id))
		.query(
			'SELECT TOP 1 id FROM Sales WHERE customerId = @id AND deletedAt IS NULL',
		);
	if (hasSales.recordset.length) {
		const e = new Error(
			'Cannot delete customer with active sales records. Archive or delete the sales first.',
		);
		e.statusCode = 409;
		throw e;
	}
	await pool
		.request()
		.input('id', sql.Int, parseInt(id))
		.input('deletedBy', sql.Int, deletedBy)
		.query(
			'UPDATE Customers SET deletedAt = GETDATE(), deletedBy = @deletedBy WHERE id = @id',
		);
}

async function getCustomerStatement(customerId, dateFrom, dateTo) {
	const pool = await getPool();

	const customer = await getCustomerById(customerId);
	const effectiveDateTo = dateTo || new Date().toISOString().split('T')[0];

	// Opening balance: net of all activity strictly before dateFrom
	let openingBalance = 0;
	if (dateFrom) {
		const [salesRes, paymentsRes] = await Promise.all([
			pool
				.request()
				.input('customerId', sql.Int, parseInt(customerId))
				.input('dateFrom', sql.Date, dateFrom)
				.query(
					`SELECT ISNULL(SUM(totalAmount), 0) AS total
           FROM Sales WHERE customerId=@customerId AND saleDate < @dateFrom AND deletedAt IS NULL`,
				),
			pool
				.request()
				.input('customerId', sql.Int, parseInt(customerId))
				.input('dateFrom', sql.Date, dateFrom)
				.query(
					`SELECT ISNULL(SUM(amount), 0) AS total
           FROM Payments WHERE customerId=@customerId AND paymentDate < @dateFrom AND deletedAt IS NULL`,
				),
		]);
		openingBalance =
			parseFloat(salesRes.recordset[0].total) -
			parseFloat(paymentsRes.recordset[0].total);
	}

	// Sales within the period
	const salesReq = pool
		.request()
		.input('customerId', sql.Int, parseInt(customerId))
		.input('dateTo', sql.Date, effectiveDateTo);
	if (dateFrom) salesReq.input('dateFrom', sql.Date, dateFrom);

	const salesResult = await salesReq.query(`
    SELECT id, 'Sale' AS type, saleDate AS txDate,
           totalAmount AS debit, 0 AS credit,
           eggSize, quantity, unitPrice, notes
    FROM Sales
    WHERE customerId=@customerId AND deletedAt IS NULL
      AND saleDate <= @dateTo
      ${dateFrom ? 'AND saleDate >= @dateFrom' : ''}
    ORDER BY saleDate, id
  `);

	// Payments within the period
	const paymentsReq = pool
		.request()
		.input('customerId', sql.Int, parseInt(customerId))
		.input('dateTo', sql.Date, effectiveDateTo);
	if (dateFrom) paymentsReq.input('dateFrom', sql.Date, dateFrom);

	const paymentsResult = await paymentsReq.query(`
    SELECT id, 'Payment' AS type, paymentDate AS txDate,
           0 AS debit, amount AS credit,
           method, notes
    FROM Payments
    WHERE customerId=@customerId AND deletedAt IS NULL
      AND paymentDate <= @dateTo
      ${dateFrom ? 'AND paymentDate >= @dateFrom' : ''}
    ORDER BY paymentDate, id
  `);

	// Merge, sort by date then Sales-before-Payments on the same day
	const merged = [...salesResult.recordset, ...paymentsResult.recordset].sort(
		(a, b) => {
			const diff = new Date(a.txDate) - new Date(b.txDate);
			if (diff !== 0) return diff;
			if (a.type === 'Sale' && b.type === 'Payment') return -1;
			if (a.type === 'Payment' && b.type === 'Sale') return 1;
			return a.id - b.id;
		},
	);

	// Compute running balance
	let balance = openingBalance;
	const transactions = merged.map((t) => {
		balance += parseFloat(t.debit) - parseFloat(t.credit);
		return { ...t, balance: parseFloat(balance.toFixed(2)) };
	});

	return {
		customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
		period: { dateFrom: dateFrom || null, dateTo: effectiveDateTo },
		openingBalance: parseFloat(openingBalance.toFixed(2)),
		transactions,
		closingBalance: parseFloat(balance.toFixed(2)),
	};
}

module.exports = {
	getAllCustomers,
	getCustomerById,
	createCustomer,
	updateCustomer,
	deleteCustomer,
	getCustomerStatement,
};

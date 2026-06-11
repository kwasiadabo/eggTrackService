const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');
const { toNumber } = require('../utils/decimal');

async function getAllCustomers() {
	return prisma.customers.findMany({
		select: {
			id: true,
			name: true,
			phone: true,
			address: true,
			email: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: { name: 'asc' },
	});
}

async function getCustomerById(id) {
	const row = await prisma.customers.findFirst({ where: { id: parseInt(id) } });
	if (!row) {
		const e = new Error('Customer not found');
		e.statusCode = 404;
		throw e;
	}
	return row;
}

async function createCustomer({ name, phone, address, email }) {
	return prisma.customers.create({
		data: {
			name,
			phone: phone || null,
			address: address || null,
			email: email || null,
		},
	});
}

async function updateCustomer(id, { name, phone, address, email }) {
	const orig = await getCustomerById(id);
	try {
		return await prisma.customers.update({
			where: { id: parseInt(id) },
			data: {
				name: name ?? orig.name,
				phone: phone !== undefined ? phone : orig.phone,
				address: address !== undefined ? address : orig.address,
				email: email !== undefined ? email : orig.email,
				updatedAt: new Date(),
			},
		});
	} catch (err) {
		throw toNotFoundError(err, 'Customer not found');
	}
}

async function deleteCustomer(id, deletedBy) {
	await getCustomerById(id); // throws 404 if missing

	const hasSales = await prisma.sales.findFirst({
		where: { customerId: parseInt(id) },
		select: { id: true },
	});
	if (hasSales) {
		const e = new Error(
			'Cannot delete customer with active sales records. Archive or delete the sales first.',
		);
		e.statusCode = 409;
		throw e;
	}

	try {
		await prisma.customers.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
	} catch (err) {
		throw toNotFoundError(err, 'Customer not found');
	}
}

async function getCustomerStatement(customerId, dateFrom, dateTo) {
	const customer = await getCustomerById(customerId);
	const effectiveDateTo = dateTo || new Date().toISOString().split('T')[0];
	const custId = parseInt(customerId);

	// Opening balance: net of all activity strictly before dateFrom
	let openingBalance = 0;
	if (dateFrom) {
		const [salesAgg, paymentsAgg] = await Promise.all([
			prisma.sales.aggregate({
				where: { customerId: custId, saleDate: { lt: new Date(dateFrom) } },
				_sum: { totalAmount: true },
			}),
			prisma.payments.aggregate({
				where: { customerId: custId, paymentDate: { lt: new Date(dateFrom) } },
				_sum: { amount: true },
			}),
		]);
		openingBalance =
			(toNumber(salesAgg._sum.totalAmount) ?? 0) -
			(toNumber(paymentsAgg._sum.amount) ?? 0);
	}

	// Sales within the period
	const salesRows = await prisma.sales.findMany({
		where: {
			customerId: custId,
			saleDate: {
				lte: new Date(effectiveDateTo),
				...(dateFrom && { gte: new Date(dateFrom) }),
			},
		},
		select: {
			id: true,
			saleDate: true,
			totalAmount: true,
			eggSize: true,
			quantity: true,
			unitPrice: true,
			notes: true,
		},
		orderBy: [{ saleDate: 'asc' }, { id: 'asc' }],
	});
	const salesTx = salesRows.map((r) => ({
		id: r.id,
		type: 'Sale',
		txDate: r.saleDate,
		debit: toNumber(r.totalAmount),
		credit: 0,
		eggSize: r.eggSize,
		quantity: r.quantity,
		unitPrice: toNumber(r.unitPrice),
		notes: r.notes,
	}));

	// Payments within the period
	const paymentsRows = await prisma.payments.findMany({
		where: {
			customerId: custId,
			paymentDate: {
				lte: new Date(effectiveDateTo),
				...(dateFrom && { gte: new Date(dateFrom) }),
			},
		},
		select: {
			id: true,
			paymentDate: true,
			amount: true,
			method: true,
			notes: true,
		},
		orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
	});
	const paymentsTx = paymentsRows.map((r) => ({
		id: r.id,
		type: 'Payment',
		txDate: r.paymentDate,
		debit: 0,
		credit: toNumber(r.amount),
		method: r.method,
		notes: r.notes,
	}));

	// Merge, sort by date then Sales-before-Payments on the same day
	const merged = [...salesTx, ...paymentsTx].sort((a, b) => {
		const diff = new Date(a.txDate) - new Date(b.txDate);
		if (diff !== 0) return diff;
		if (a.type === 'Sale' && b.type === 'Payment') return -1;
		if (a.type === 'Payment' && b.type === 'Sale') return 1;
		return a.id - b.id;
	});

	// Compute running balance
	let balance = openingBalance;
	const transactions = merged.map((t) => {
		balance += t.debit - t.credit;
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

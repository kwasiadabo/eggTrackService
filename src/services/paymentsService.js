const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');
const { toNumber } = require('../utils/decimal');

function mapPayment(row) {
	return row && { ...row, amount: toNumber(row.amount) };
}

async function createPayment({ customerId, saleId, amount, paymentDate, method, notes }) {
	const row = await prisma.payments.create({
		data: {
			customerId: parseInt(customerId),
			saleId: saleId ? parseInt(saleId) : null,
			amount: parseFloat(amount),
			paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
			method: method || 'cash',
			notes: notes || null,
		},
	});
	return mapPayment(row);
}

async function getPaymentById(id) {
	const row = await prisma.payments.findFirst({ where: { id: parseInt(id) } });
	if (!row) {
		const e = new Error('Payment not found');
		e.statusCode = 404;
		throw e;
	}
	return mapPayment(row);
}

async function getAllPayments() {
	const rows = await prisma.payments.findMany({
		select: {
			id: true,
			customerId: true,
			saleId: true,
			amount: true,
			paymentDate: true,
			method: true,
			notes: true,
			createdAt: true,
			customer: { select: { name: true } },
		},
		orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
	});
	return rows.map(({ customer, ...rest }) => ({
		...rest,
		customerName: customer.name,
		amount: toNumber(rest.amount),
	}));
}

async function updatePayment(id, { amount, paymentDate, method, notes }) {
	const orig = await getPaymentById(id);
	try {
		const row = await prisma.payments.update({
			where: { id: parseInt(id) },
			data: {
				amount: amount != null ? parseFloat(amount) : orig.amount,
				paymentDate: paymentDate != null ? new Date(paymentDate) : orig.paymentDate,
				method: method ?? orig.method,
				notes: notes !== undefined ? notes : orig.notes,
				updatedAt: new Date(),
			},
		});
		return mapPayment(row);
	} catch (err) {
		throw toNotFoundError(err, 'Payment not found');
	}
}

async function deletePayment(id, deletedBy) {
	await getPaymentById(id);
	try {
		await prisma.payments.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
	} catch (err) {
		throw toNotFoundError(err, 'Payment not found');
	}
}

async function getDebtors() {
	const [customers, salesByCustomer, paymentsByCustomer] = await Promise.all([
		prisma.customers.findMany({ select: { id: true, name: true, phone: true, email: true } }),
		prisma.sales.groupBy({
			by: ['customerId'],
			where: { deletedAt: null },
			_sum: { totalAmount: true },
			_min: { saleDate: true },
			_max: { saleDate: true },
		}),
		prisma.payments.groupBy({
			by: ['customerId'],
			where: { deletedAt: null },
			_sum: { amount: true },
		}),
	]);

	const salesMap = new Map(salesByCustomer.map((s) => [s.customerId, s]));
	const paymentsMap = new Map(
		paymentsByCustomer.map((p) => [p.customerId, toNumber(p._sum.amount) ?? 0]),
	);

	return customers
		.map((c) => {
			const sales = salesMap.get(c.id);
			const totalSales = toNumber(sales?._sum?.totalAmount) ?? 0;
			const totalPaid = paymentsMap.get(c.id) ?? 0;
			const balance = totalSales - totalPaid;
			return {
				customerId: c.id,
				customerName: c.name,
				phone: c.phone,
				email: c.email,
				totalSales,
				totalPaid,
				balance,
				firstSaleDate: sales?._min?.saleDate ?? null,
				lastSaleDate: sales?._max?.saleDate ?? null,
			};
		})
		.filter((d) => d.balance > 0)
		.sort((a, b) => b.balance - a.balance)
		.map((row) => {
			const daysDue = row.lastSaleDate
				? Math.floor((Date.now() - new Date(row.lastSaleDate)) / 86400000)
				: 0;
			return { ...row, daysDue, overdue: daysDue > 30 };
		});
}

async function getPaymentsByCustomer(customerId) {
	const rows = await prisma.payments.findMany({
		where: { customerId: parseInt(customerId) },
		include: { sale: { select: { eggSize: true, quantity: true, totalAmount: true } } },
		orderBy: { paymentDate: 'desc' },
	});
	return rows.map(({ sale, ...rest }) => ({
		...mapPayment(rest),
		eggSize: sale?.eggSize ?? null,
		quantity: sale?.quantity ?? null,
		saleTotal: toNumber(sale?.totalAmount) ?? null,
	}));
}

module.exports = {
	createPayment,
	getPaymentById,
	getAllPayments,
	updatePayment,
	deletePayment,
	getDebtors,
	getPaymentsByCustomer,
};

const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');
const { toNumber } = require('../utils/decimal');

function mapExpense(row) {
	return row && { ...row, amount: toNumber(row.amount) };
}

async function getAllExpenses() {
	const rows = await prisma.expenses.findMany({
		select: {
			id: true,
			category: true,
			description: true,
			amount: true,
			expenseDate: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
	});
	return rows.map(mapExpense);
}

async function getExpenseById(id) {
	const row = await prisma.expenses.findFirst({ where: { id: parseInt(id) } });
	if (!row) {
		const e = new Error('Expense not found');
		e.statusCode = 404;
		throw e;
	}
	return mapExpense(row);
}

async function createExpense({ category, description, amount, expenseDate }) {
	const row = await prisma.expenses.create({
		data: {
			category,
			description,
			amount: parseFloat(amount),
			expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
		},
	});
	return mapExpense(row);
}

async function updateExpense(id, { category, description, amount, expenseDate }) {
	const orig = await getExpenseById(id);
	try {
		const row = await prisma.expenses.update({
			where: { id: parseInt(id) },
			data: {
				category: category ?? orig.category,
				description: description ?? orig.description,
				amount: amount != null ? parseFloat(amount) : orig.amount,
				expenseDate: expenseDate != null ? new Date(expenseDate) : orig.expenseDate,
				updatedAt: new Date(),
			},
		});
		return mapExpense(row);
	} catch (err) {
		throw toNotFoundError(err, 'Expense not found');
	}
}

async function deleteExpense(id, deletedBy) {
	await getExpenseById(id);
	try {
		await prisma.expenses.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
	} catch (err) {
		throw toNotFoundError(err, 'Expense not found');
	}
}

async function getExpenseSummary() {
	// groupBy is not covered by the soft-delete extension - filter explicitly.
	const rows = await prisma.expenses.groupBy({
		by: ['category'],
		where: { deletedAt: null },
		_sum: { amount: true },
		_count: { _all: true },
		orderBy: { _sum: { amount: 'desc' } },
	});
	return rows.map((r) => ({
		category: r.category,
		total: toNumber(r._sum.amount),
		count: r._count._all,
	}));
}

module.exports = {
	getAllExpenses,
	getExpenseById,
	createExpense,
	updateExpense,
	deleteExpense,
	getExpenseSummary,
};

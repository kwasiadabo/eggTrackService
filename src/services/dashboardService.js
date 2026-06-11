const { prisma } = require('../config/prisma');
const { toNumber } = require('../utils/decimal');

async function getDashboardStats() {
	const [inventory, sales, payments, expenses] = await Promise.all([
		prisma.inventory.findMany({ select: { eggSize: true, quantity: true } }),
		prisma.sales.aggregate({ _sum: { totalAmount: true }, _count: { _all: true } }),
		prisma.payments.aggregate({ _sum: { amount: true } }),
		prisma.expenses.aggregate({ _sum: { amount: true } }),
	]);

	const totalRevenue = toNumber(sales._sum.totalAmount) ?? 0;
	const totalPaid = toNumber(payments._sum.amount) ?? 0;
	const totalExpenses = toNumber(expenses._sum.amount) ?? 0;
	const outstandingDebt = totalRevenue - totalPaid;

	return {
		inventory,
		totalRevenue,
		totalSales: sales._count._all,
		totalPaid,
		outstandingDebt,
		totalExpenses,
		netProfit: totalRevenue - totalExpenses,
	};
}

module.exports = { getDashboardStats };

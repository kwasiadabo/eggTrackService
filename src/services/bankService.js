const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');
const { toNumber } = require('../utils/decimal');

function mapTx(row) {
	return row && { ...row, amount: toNumber(row.amount) };
}

async function getAccountBalance(bankAccountId) {
	const sums = await prisma.bankTransactions.groupBy({
		by: ['type'],
		where: { bankAccountId, status: 'approved' },
		_sum: { amount: true },
	});
	const deposits = toNumber(sums.find((s) => s.type === 'deposit')?._sum.amount) ?? 0;
	const withdrawals = toNumber(sums.find((s) => s.type === 'withdrawal')?._sum.amount) ?? 0;
	return deposits - withdrawals;
}

// ── Accounts ──────────────────────────────────────────────────────────────────

async function listAccounts(includeInactive = false) {
	const [accounts, txSums] = await Promise.all([
		prisma.bankAccounts.findMany({
			where: includeInactive ? {} : { isActive: true },
			orderBy: { createdAt: 'asc' },
		}),
		prisma.bankTransactions.groupBy({
			by: ['bankAccountId', 'type'],
			where: { status: 'approved' },
			_sum: { amount: true },
		}),
	]);

	const balanceMap = new Map();
	for (const row of txSums) {
		const cur = balanceMap.get(row.bankAccountId) || { deposit: 0, withdrawal: 0 };
		cur[row.type] = toNumber(row._sum.amount) ?? 0;
		balanceMap.set(row.bankAccountId, cur);
	}

	return accounts.map((a) => {
		const sums = balanceMap.get(a.id) || { deposit: 0, withdrawal: 0 };
		return { ...a, balance: sums.deposit - sums.withdrawal };
	});
}

async function createAccount({ bankName, accountName, accountNumber, branch }) {
	const row = await prisma.bankAccounts.create({
		data: { bankName, accountName, accountNumber, branch: branch || null },
	});
	return { ...row, balance: 0 };
}

async function updateAccount(id, { bankName, accountName, accountNumber, branch, isActive }) {
	const data = {
		...(bankName !== undefined && { bankName }),
		...(accountName !== undefined && { accountName }),
		...(accountNumber !== undefined && { accountNumber }),
		...(branch !== undefined && { branch }),
		...(isActive !== undefined && { isActive: !!isActive }),
	};
	if (!Object.keys(data).length) {
		const e = new Error('Nothing to update');
		e.statusCode = 400;
		throw e;
	}
	data.updatedAt = new Date();

	try {
		return await prisma.bankAccounts.update({ where: { id: parseInt(id) }, data });
	} catch (err) {
		throw toNotFoundError(err, 'Account not found');
	}
}

// ── Transactions ──────────────────────────────────────────────────────────────

async function listTransactions({ bankAccountId, type, status, fromDate, toDate } = {}) {
	const where = {
		...(bankAccountId && { bankAccountId: parseInt(bankAccountId) }),
		...(type && { type }),
		...(status && { status }),
		...((fromDate || toDate) && {
			transactionDate: {
				...(fromDate && { gte: new Date(fromDate) }),
				...(toDate && { lte: new Date(toDate) }),
			},
		}),
	};

	const rows = await prisma.bankTransactions.findMany({
		where,
		include: {
			bankAccount: { select: { bankName: true, accountName: true, accountNumber: true } },
			initiatedBy: { select: { name: true } },
			approvedBy: { select: { name: true } },
		},
		orderBy: { createdAt: 'desc' },
	});

	return rows.map(({ bankAccount, initiatedBy, approvedBy, ...t }) => ({
		id: t.id,
		bankAccountId: t.bankAccountId,
		bankName: bankAccount.bankName,
		accountName: bankAccount.accountName,
		accountNumber: bankAccount.accountNumber,
		type: t.type,
		amount: toNumber(t.amount),
		description: t.description,
		reference: t.reference,
		status: t.status,
		transactionDate: t.transactionDate,
		createdAt: t.createdAt,
		initiatedById: t.initiatedById,
		initiatedByName: initiatedBy.name,
		approvedById: t.approvedById,
		approvedByName: approvedBy?.name ?? null,
		approvedAt: t.approvedAt,
		rejectedAt: t.rejectedAt,
		rejectionNote: t.rejectionNote,
	}));
}

async function createDeposit({ bankAccountId, amount, description, reference, transactionDate }, userId) {
	const row = await prisma.bankTransactions.create({
		data: {
			bankAccountId: parseInt(bankAccountId),
			type: 'deposit',
			amount: parseFloat(amount),
			description: description || null,
			reference: reference || null,
			transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
			status: 'approved',
			initiatedById: userId,
			approvedById: userId,
			approvedAt: new Date(),
		},
	});
	return mapTx(row);
}

async function createWithdrawal({ bankAccountId, amount, description, reference, transactionDate }, userId, userRole) {
	const balance = await getAccountBalance(parseInt(bankAccountId));
	if (parseFloat(amount) > balance) {
		const e = new Error(`Insufficient balance. Available: GH₵ ${balance.toFixed(2)}`);
		e.statusCode = 400;
		throw e;
	}

	const isAdmin = userRole === 'admin';
	const status = isAdmin ? 'approved' : 'pending';
	const row = await prisma.bankTransactions.create({
		data: {
			bankAccountId: parseInt(bankAccountId),
			type: 'withdrawal',
			amount: parseFloat(amount),
			description: description || null,
			reference: reference || null,
			transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
			status,
			initiatedById: userId,
			...(isAdmin && { approvedById: userId, approvedAt: new Date() }),
		},
	});
	return mapTx(row);
}

async function approveWithdrawal(id, adminId) {
	const tx = await prisma.bankTransactions.findFirst({
		where: { id: parseInt(id) },
		select: { id: true, status: true, type: true },
	});
	if (!tx) {
		const e = new Error('Transaction not found');
		e.statusCode = 404;
		throw e;
	}
	if (tx.type !== 'withdrawal' || tx.status !== 'pending') {
		const e = new Error('Only pending withdrawal requests can be approved');
		e.statusCode = 400;
		throw e;
	}
	const row = await prisma.bankTransactions.update({
		where: { id: parseInt(id) },
		data: { status: 'approved', approvedById: adminId, approvedAt: new Date(), updatedAt: new Date() },
	});
	return mapTx(row);
}

async function rejectWithdrawal(id, adminId, rejectionNote) {
	const tx = await prisma.bankTransactions.findFirst({
		where: { id: parseInt(id) },
		select: { id: true, status: true, type: true },
	});
	if (!tx) {
		const e = new Error('Transaction not found');
		e.statusCode = 404;
		throw e;
	}
	if (tx.type !== 'withdrawal' || tx.status !== 'pending') {
		const e = new Error('Only pending withdrawal requests can be rejected');
		e.statusCode = 400;
		throw e;
	}
	const row = await prisma.bankTransactions.update({
		where: { id: parseInt(id) },
		data: { status: 'rejected', approvedById: adminId, rejectedAt: new Date(), rejectionNote: rejectionNote || null, updatedAt: new Date() },
	});
	return mapTx(row);
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

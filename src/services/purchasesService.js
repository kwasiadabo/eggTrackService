const { prisma } = require('../config/prisma');
const { toNumber } = require('../utils/decimal');

// Purchases must reference a farm from the authorised (active) Farms list
async function assertFarmAuthorised(farmName) {
	const farm = await prisma.farms.findFirst({ where: { name: farmName, isActive: true } });
	if (!farm) {
		const e = new Error(`"${farmName}" is not on the authorised farms list. Add it in Farm Setup first.`);
		e.statusCode = 400;
		throw e;
	}
}

function mapPurchase(row) {
	return row && {
		...row,
		costPerTray: toNumber(row.costPerTray),
		totalCost: toNumber(row.totalCost),
	};
}

async function getAllPurchases({ status } = {}) {
	const rows = await prisma.eggsPurchases.findMany({
		where: { ...(status && { status }) },
		include: {
			initiatedBy: { select: { name: true } },
			approvedBy: { select: { name: true } },
		},
		orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
	});
	return rows.map(({ initiatedBy, approvedBy, ...p }) => ({
		id: p.id,
		farmName: p.farmName,
		eggSize: p.eggSize,
		quantity: p.quantity,
		costPerTray: toNumber(p.costPerTray),
		totalCost: toNumber(p.totalCost),
		purchaseDate: p.purchaseDate,
		notes: p.notes,
		status: p.status,
		initiatedById: p.initiatedById,
		initiatedByName: initiatedBy?.name ?? null,
		approvedById: p.approvedById,
		approvedByName: approvedBy?.name ?? null,
		approvedAt: p.approvedAt,
		rejectedAt: p.rejectedAt,
		rejectionNote: p.rejectionNote,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	}));
}

async function getPurchaseById(id) {
	const row = await prisma.eggsPurchases.findFirst({ where: { id: parseInt(id) } });
	if (!row) {
		const e = new Error('Purchase not found');
		e.statusCode = 404;
		throw e;
	}
	return mapPurchase(row);
}

async function applyInventory(tx, eggSize, qty) {
	await tx.$executeRaw`
		MERGE Inventory WITH (HOLDLOCK) AS t
		USING (VALUES (${eggSize}, ${qty})) AS s(eggSize, qty) ON t.eggSize = s.eggSize
		WHEN MATCHED     THEN UPDATE SET quantity = t.quantity + s.qty, updatedAt = GETUTCDATE()
		WHEN NOT MATCHED THEN INSERT (eggSize, quantity) VALUES (s.eggSize, s.qty);
	`;
}

// Every purchase is submitted as 'pending' and only updates inventory once an
// admin approves it — including purchases submitted by an admin.
async function createPurchase({ farmName, eggSize, quantity, costPerTray, purchaseDate, notes }, userId) {
	await assertFarmAuthorised(farmName);

	const row = await prisma.eggsPurchases.create({
		data: {
			farmName,
			eggSize,
			quantity: parseInt(quantity),
			costPerTray: parseFloat(costPerTray),
			purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
			notes: notes || null,
			status: 'pending',
			initiatedById: userId,
			approvedById: null,
			approvedAt: null,
		},
	});
	return mapPurchase(row);
}

async function updatePurchase(id, { farmName, eggSize, quantity, costPerTray, purchaseDate, notes }) {
	// Get original to diff inventory
	const orig = await getPurchaseById(id);

	const newFarmName = farmName ?? orig.farmName;
	if (newFarmName !== orig.farmName) await assertFarmAuthorised(newFarmName);

	const newQty = quantity != null ? parseInt(quantity) : orig.quantity;
	const newSize = eggSize ?? orig.eggSize;

	return prisma.$transaction(async (tx) => {
		const updated = await tx.eggsPurchases.update({
			where: { id: parseInt(id) },
			data: {
				farmName: newFarmName,
				eggSize: newSize,
				quantity: newQty,
				costPerTray: costPerTray != null ? parseFloat(costPerTray) : orig.costPerTray,
				purchaseDate: purchaseDate != null ? new Date(purchaseDate) : orig.purchaseDate,
				notes: notes !== undefined ? notes : orig.notes,
				updatedAt: new Date(),
			},
		});

		// Inventory was only applied for already-approved purchases — only reconcile those.
		if (orig.status === 'approved') {
			if (newSize === orig.eggSize) {
				const diff = newQty - orig.quantity;
				if (diff !== 0) {
					await tx.inventory.updateMany({
						where: { eggSize: newSize },
						data: { quantity: { increment: diff }, updatedAt: new Date() },
					});
				}
			} else {
				await tx.inventory.updateMany({
					where: { eggSize: orig.eggSize },
					data: { quantity: { decrement: orig.quantity }, updatedAt: new Date() },
				});
				await tx.inventory.updateMany({
					where: { eggSize: newSize },
					data: { quantity: { increment: newQty }, updatedAt: new Date() },
				});
			}
		}

		return mapPurchase(updated);
	});
}

async function deletePurchase(id, deletedBy) {
	const orig = await getPurchaseById(id);
	return prisma.$transaction(async (tx) => {
		await tx.eggsPurchases.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
		// Only reverse inventory if it was actually applied (i.e. the purchase was approved)
		if (orig.status === 'approved') {
			await tx.inventory.updateMany({
				where: { eggSize: orig.eggSize },
				data: { quantity: { decrement: orig.quantity }, updatedAt: new Date() },
			});
		}
		return orig;
	});
}

// Create multiple purchase line-items from one farm in a single transaction.
// All lines are submitted as 'pending' and only update inventory once an admin approves them.
async function createBatch({ farmName, purchaseDate, notes, items }, userId) {
	if (!items || items.length === 0) {
		const e = new Error('Batch must have at least one line item');
		e.statusCode = 400;
		throw e;
	}
	await assertFarmAuthorised(farmName);

	return prisma.$transaction(async (tx) => {
		const inserted = [];
		for (const item of items) {
			const row = await tx.eggsPurchases.create({
				data: {
					farmName,
					eggSize: item.eggSize,
					quantity: parseInt(item.quantity),
					costPerTray: parseFloat(item.costPerTray),
					purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
					notes: notes || null,
					status: 'pending',
					initiatedById: userId,
					approvedById: null,
					approvedAt: null,
				},
			});
			inserted.push(mapPurchase(row));
		}
		return inserted;
	});
}

// ── Admin approval ──────────────────────────────────────────────────────────

async function approvePurchase(id, adminId) {
	const orig = await getPurchaseById(id);
	if (orig.status !== 'pending') {
		const e = new Error('Only pending purchases can be approved');
		e.statusCode = 400;
		throw e;
	}
	return prisma.$transaction(async (tx) => {
		const updated = await tx.eggsPurchases.update({
			where: { id: parseInt(id) },
			data: { status: 'approved', approvedById: adminId, approvedAt: new Date(), updatedAt: new Date() },
		});
		await applyInventory(tx, orig.eggSize, orig.quantity);
		return mapPurchase(updated);
	});
}

async function rejectPurchase(id, adminId, rejectionNote) {
	const orig = await getPurchaseById(id);
	if (orig.status !== 'pending') {
		const e = new Error('Only pending purchases can be rejected');
		e.statusCode = 400;
		throw e;
	}
	const updated = await prisma.eggsPurchases.update({
		where: { id: parseInt(id) },
		data: { status: 'rejected', approvedById: adminId, rejectedAt: new Date(), rejectionNote: rejectionNote || null, updatedAt: new Date() },
	});
	return mapPurchase(updated);
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

const { prisma } = require('../config/prisma');
const { toNumber } = require('../utils/decimal');
const bankService = require('./bankService');

function mapSaleList(row) {
	const { customer, ...s } = row;
	return {
		id: s.id,
		customerId: s.customerId,
		customerName: customer.name,
		eggSize: s.eggSize,
		quantity: s.quantity,
		unitPrice: toNumber(s.unitPrice),
		totalAmount: toNumber(s.totalAmount),
		saleDate: s.saleDate,
		notes: s.notes,
		invoiceNo: s.invoiceNo,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
	};
}

function mapSaleFull(row) {
	const { customer, ...s } = row;
	return {
		...s,
		unitPrice: toNumber(s.unitPrice),
		totalAmount: toNumber(s.totalAmount),
		customerName: customer.name,
		phone: customer.phone,
		address: customer.address,
	};
}

async function getAllSales() {
	const rows = await prisma.sales.findMany({
		include: { customer: { select: { name: true } } },
		orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
	});
	return rows.map(mapSaleList);
}

async function getSaleById(id) {
	const row = await prisma.sales.findFirst({
		where: { id: parseInt(id) },
		include: { customer: { select: { name: true, phone: true, address: true } } },
	});
	if (!row) {
		const e = new Error('Sale not found');
		e.statusCode = 404;
		throw e;
	}
	return mapSaleFull(row);
}

async function createSale({ customerId, eggSize, quantity, unitPrice, saleDate, notes, bankAccountId }, userId) {
	const qty = parseInt(quantity);

	const saleRow = await prisma.$transaction(async (tx) => {
		const stock = await tx.inventory.findFirst({ where: { eggSize } });
		const available = stock?.quantity || 0;
		if (available < qty) {
			const e = new Error(`Insufficient stock. Available: ${available} trays of ${eggSize} eggs`);
			e.statusCode = 400;
			throw e;
		}

		const sale = await tx.sales.create({
			data: {
				customerId: parseInt(customerId),
				eggSize,
				quantity: qty,
				unitPrice: parseFloat(unitPrice),
				saleDate: saleDate ? new Date(saleDate) : new Date(),
				notes: notes || null,
			},
		});

		await tx.inventory.updateMany({
			where: { eggSize },
			data: { quantity: { decrement: qty }, updatedAt: new Date() },
		});

		const full = await tx.sales.findFirst({
			where: { id: sale.id },
			include: { customer: { select: { name: true, phone: true, address: true } } },
		});
		return mapSaleFull(full);
	});

	if (bankAccountId && userId) {
		const depositAmt = qty * parseFloat(unitPrice);
		await bankService.createDeposit({
			bankAccountId,
			amount: depositAmt,
			description: `Sale deposit — ${saleRow.customerName}`,
			reference: `SALE-${saleRow.id}`,
			transactionDate: saleDate || new Date(),
		}, userId);
	}
	return saleRow;
}

async function updateSale(id, { customerId, eggSize, quantity, unitPrice, saleDate, notes }) {
	const orig = await getSaleById(id);
	const newQty = quantity != null ? parseInt(quantity) : orig.quantity;
	const newSize = eggSize ?? orig.eggSize;

	// If size or qty changed, validate stock
	if (newSize !== orig.eggSize || newQty !== orig.quantity) {
		const stock = await prisma.inventory.findFirst({ where: { eggSize: newSize } });
		const available = (stock?.quantity || 0) + (newSize === orig.eggSize ? orig.quantity : 0);
		if (available < newQty) {
			const e = new Error(`Insufficient stock. Available: ${available} trays of ${newSize} eggs`);
			e.statusCode = 400;
			throw e;
		}
	}

	return prisma.$transaction(async (tx) => {
		const updated = await tx.sales.update({
			where: { id: parseInt(id) },
			data: {
				customerId: customerId != null ? parseInt(customerId) : orig.customerId,
				eggSize: newSize,
				quantity: newQty,
				unitPrice: unitPrice != null ? parseFloat(unitPrice) : orig.unitPrice,
				saleDate: saleDate != null ? new Date(saleDate) : orig.saleDate,
				notes: notes !== undefined ? notes : orig.notes,
				updatedAt: new Date(),
			},
		});

		// Reconcile inventory
		if (newSize === orig.eggSize) {
			const diff = newQty - orig.quantity;
			if (diff !== 0) {
				await tx.inventory.updateMany({
					where: { eggSize: newSize },
					data: { quantity: { decrement: diff }, updatedAt: new Date() },
				});
			}
		} else {
			await tx.inventory.updateMany({
				where: { eggSize: orig.eggSize },
				data: { quantity: { increment: orig.quantity }, updatedAt: new Date() },
			});
			await tx.inventory.updateMany({
				where: { eggSize: newSize },
				data: { quantity: { decrement: newQty }, updatedAt: new Date() },
			});
		}

		return { ...updated, unitPrice: toNumber(updated.unitPrice), totalAmount: toNumber(updated.totalAmount) };
	});
}

async function deleteSale(id, deletedBy) {
	const orig = await getSaleById(id);
	await prisma.$transaction(async (tx) => {
		await tx.sales.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
		// Return stock
		await tx.inventory.updateMany({
			where: { eggSize: orig.eggSize },
			data: { quantity: { increment: orig.quantity }, updatedAt: new Date() },
		});
	});
}

// ── Multi-line invoice: one atomic transaction, shared invoice number ─────────
function generateInvoiceNo(date) {
	const d = date ? new Date(date) : new Date();
	const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
	return `INV-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

async function createInvoice({ customerId, saleDate, notes, items, bankAccountId }, userId) {
	if (!items || items.length === 0) {
		const e = new Error('Invoice must have at least one line item');
		e.statusCode = 400;
		throw e;
	}

	// Aggregate per-size totals and validate stock in one pass
	const sizeQtys = {};
	for (const item of items) {
		sizeQtys[item.eggSize] = (sizeQtys[item.eggSize] || 0) + parseInt(item.quantity);
	}
	for (const [eggSize, totalQty] of Object.entries(sizeQtys)) {
		const stock = await prisma.inventory.findFirst({ where: { eggSize } });
		const available = stock?.quantity || 0;
		if (available < totalQty) {
			const e = new Error(`Insufficient stock for ${eggSize} eggs. Available: ${available}, required: ${totalQty}`);
			e.statusCode = 400;
			throw e;
		}
	}

	const invoiceNo = generateInvoiceNo(saleDate);

	const rows = await prisma.$transaction(async (tx) => {
		const insertedIds = [];
		for (const item of items) {
			const sale = await tx.sales.create({
				data: {
					customerId: parseInt(customerId),
					eggSize: item.eggSize,
					quantity: parseInt(item.quantity),
					unitPrice: parseFloat(item.unitPrice),
					saleDate: saleDate ? new Date(saleDate) : new Date(),
					notes: notes || null,
					invoiceNo,
				},
			});
			insertedIds.push(sale.id);

			await tx.inventory.updateMany({
				where: { eggSize: item.eggSize },
				data: { quantity: { decrement: parseInt(item.quantity) }, updatedAt: new Date() },
			});
		}

		const full = await tx.sales.findMany({
			where: { id: { in: insertedIds } },
			include: { customer: { select: { name: true, phone: true, address: true } } },
			orderBy: { id: 'asc' },
		});
		return full.map(mapSaleFull);
	});

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
}

module.exports = { getAllSales, getSaleById, createSale, updateSale, deleteSale, createInvoice };

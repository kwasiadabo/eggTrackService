const { prisma } = require('../config/prisma');

async function getInventory() {
	return prisma.inventory.findMany({ orderBy: { eggSize: 'asc' } });
}

async function reconcileInventory() {
	await prisma.$executeRaw`
		UPDATE Inventory
		SET quantity = (
		      ISNULL((SELECT SUM(quantity) FROM EggsPurchases WHERE eggSize = Inventory.eggSize AND deletedAt IS NULL), 0)
		    - ISNULL((SELECT SUM(quantity) FROM Sales         WHERE eggSize = Inventory.eggSize AND deletedAt IS NULL), 0)
		    ),
		    updatedAt = GETUTCDATE()
	`;
	return getInventory();
}

module.exports = { getInventory, reconcileInventory };

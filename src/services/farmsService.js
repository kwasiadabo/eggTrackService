const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');

async function getAll() {
	return prisma.farms.findMany({
		select: {
			id: true,
			name: true,
			location: true,
			contact: true,
			isActive: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: { name: 'asc' },
	});
}

async function getActive() {
	return prisma.farms.findMany({
		where: { isActive: true },
		select: { id: true, name: true, location: true, contact: true },
		orderBy: { name: 'asc' },
	});
}

async function create({ name, location, contact, isActive }) {
	return prisma.farms.create({
		data: {
			name: name.trim(),
			location: location || null,
			contact: contact || null,
			isActive: isActive !== false,
		},
	});
}

async function update(id, { name, location, contact, isActive }) {
	try {
		return await prisma.farms.update({
			where: { id: parseInt(id) },
			data: {
				name: name.trim(),
				location: location || null,
				contact: contact || null,
				isActive: isActive !== false,
				updatedAt: new Date(),
			},
		});
	} catch (err) {
		throw toNotFoundError(err, 'Farm not found');
	}
}

async function remove(id) {
	try {
		await prisma.farms.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date() },
		});
	} catch (err) {
		if (err.code !== 'P2025') throw err;
	}
}

module.exports = { getAll, getActive, create, update, remove };

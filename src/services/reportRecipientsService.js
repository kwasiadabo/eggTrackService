const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');

async function getActiveRecipients() {
	const rows = await prisma.reportRecipients.findMany({
		where: { isActive: true },
		select: { email: true },
	});
	return rows.map((r) => r.email);
}

async function getAllRecipients() {
	return prisma.reportRecipients.findMany({
		select: { id: true, email: true, name: true, isActive: true, createdAt: true },
		orderBy: { createdAt: 'desc' },
	});
}

async function addRecipient({ email, name, createdBy }) {
	const exists = await prisma.reportRecipients.findFirst({
		where: { email },
		select: { id: true },
	});
	if (exists) {
		const e = new Error('Recipient already exists');
		e.statusCode = 409;
		throw e;
	}

	return prisma.reportRecipients.create({
		data: { email, name: name || null, createdBy: createdBy || null },
		select: { id: true, email: true, name: true, isActive: true, createdAt: true },
	});
}

async function updateRecipient(id, { name, isActive }) {
	const data = {
		...(name !== undefined && { name }),
		...(isActive !== undefined && { isActive: !!isActive }),
	};

	if (!Object.keys(data).length) {
		const e = new Error('No fields to update');
		e.statusCode = 400;
		throw e;
	}

	try {
		return await prisma.reportRecipients.update({
			where: { id: parseInt(id) },
			data,
			select: { id: true, email: true, name: true, isActive: true },
		});
	} catch (err) {
		throw toNotFoundError(err, 'Recipient not found');
	}
}

async function deleteRecipient(id, deletedBy) {
	try {
		await prisma.reportRecipients.update({
			where: { id: parseInt(id) },
			data: { deletedAt: new Date(), deletedBy },
		});
	} catch (err) {
		throw toNotFoundError(err, 'Recipient not found');
	}
}

module.exports = {
	getActiveRecipients,
	getAllRecipients,
	addRecipient,
	updateRecipient,
	deleteRecipient,
};

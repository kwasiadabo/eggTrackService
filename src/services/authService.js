const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { toNotFoundError } = require('../utils/prismaErrors');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const JWT_REFRESH_SECRET =
	process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function signAccess(payload) {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function signRefresh(payload) {
	return jwt.sign(payload, JWT_REFRESH_SECRET, {
		expiresIn: JWT_REFRESH_EXPIRES_IN,
	});
}

async function register({ name, email, password, roleId = 3 }) {
	const exists = await prisma.users.findFirst({
		where: { email },
		select: { id: true },
	});
	if (exists) {
		const err = new Error('Email already registered');
		err.statusCode = 409;
		throw err;
	}

	const passwordHash = await bcrypt.hash(password, 10);

	return prisma.users.create({
		data: {
			name,
			email,
			passwordHash,
			roleId: parseInt(roleId),
			mustChangePassword: true,
		},
		select: { id: true, name: true, email: true, roleId: true, createdAt: true },
	});
}

async function login({ email, password }) {
	const user = await prisma.users.findFirst({
		where: { email },
		include: { role: true },
	});

	if (!user) {
		const e = new Error('Invalid credentials');
		e.statusCode = 401;
		throw e;
	}
	if (!user.isActive) {
		const e = new Error('Account is deactivated');
		e.statusCode = 403;
		throw e;
	}

	const valid = await bcrypt.compare(password, user.passwordHash);

	if (!valid) {
		const e = new Error('Invalid credentials');
		e.statusCode = 401;
		throw e;
	}

	await prisma.users.update({
		where: { id: user.id },
		data: { lastLoginAt: new Date() },
	});

	const payload = {
		sub: user.id,
		name: user.name,
		email: user.email,
		role: user.role.name,
		roleId: user.roleId,
	};
	const accessToken = signAccess(payload);
	const refreshToken = signRefresh({ sub: user.id });

	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await prisma.refreshTokens.create({
		data: { userId: user.id, token: refreshToken, expiresAt },
	});

	return {
		accessToken,
		refreshToken,
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role.name,
			mustChangePassword: !!user.mustChangePassword,
		},
	};
}

async function refresh(refreshToken) {
	let decoded;
	try {
		decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
	} catch {
		const e = new Error('Invalid or expired refresh token');
		e.statusCode = 401;
		throw e;
	}

	const rt = await prisma.refreshTokens.findFirst({
		where: { token: refreshToken },
	});

	if (!rt || rt.revokedAt || new Date(rt.expiresAt) < new Date()) {
		const e = new Error('Refresh token invalid or revoked');
		e.statusCode = 401;
		throw e;
	}

	const user = await prisma.users.findFirst({
		where: { id: decoded.sub, isActive: true },
		include: { role: true },
	});
	if (!user) {
		const e = new Error('User not found');
		e.statusCode = 401;
		throw e;
	}

	const payload = {
		sub: user.id,
		name: user.name,
		email: user.email,
		role: user.role.name,
		roleId: user.roleId,
	};
	const newAccess = signAccess(payload);
	const newRefresh = signRefresh({ sub: user.id });
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	// Rotate: revoke old, issue new
	await prisma.$transaction([
		prisma.refreshTokens.update({
			where: { id: rt.id },
			data: { revokedAt: new Date() },
		}),
		prisma.refreshTokens.create({
			data: { userId: user.id, token: newRefresh, expiresAt },
		}),
	]);

	return { accessToken: newAccess, refreshToken: newRefresh };
}

async function logout(refreshToken) {
	await prisma.refreshTokens.updateMany({
		where: { token: refreshToken },
		data: { revokedAt: new Date() },
	});
}

async function getMe(userId) {
	const user = await prisma.users.findFirst({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			isActive: true,
			lastLoginAt: true,
			createdAt: true,
			mustChangePassword: true,
			role: { select: { name: true, description: true } },
		},
	});
	if (!user) return null;
	const { role, ...rest } = user;
	return { ...rest, role: role.name, roleDescription: role.description };
}

// Admin: list / update / deactivate users
async function listUsers() {
	const rows = await prisma.users.findMany({
		select: {
			id: true,
			name: true,
			email: true,
			isActive: true,
			lastLoginAt: true,
			createdAt: true,
			role: { select: { name: true } },
		},
		orderBy: { createdAt: 'desc' },
	});
	return rows.map(({ role, ...rest }) => ({ ...rest, role: role.name }));
}

async function updateUser(id, { name, email, roleId, isActive }) {
	const data = {
		...(name !== undefined && { name }),
		...(email !== undefined && { email }),
		...(roleId !== undefined && { roleId: parseInt(roleId) }),
		...(isActive !== undefined && { isActive: !!isActive }),
	};
	if (!Object.keys(data).length) {
		const e = new Error('No fields to update');
		e.statusCode = 400;
		throw e;
	}
	data.updatedAt = new Date();

	try {
		return await prisma.users.update({
			where: { id: parseInt(id) },
			data,
			select: { id: true, name: true, email: true, isActive: true, roleId: true },
		});
	} catch (err) {
		throw toNotFoundError(err, 'User not found');
	}
}

async function changePassword(userId, { currentPassword, newPassword }) {
	const user = await prisma.users.findFirst({
		where: { id: userId },
		select: { passwordHash: true },
	});
	if (!user) {
		const e = new Error('User not found');
		e.statusCode = 404;
		throw e;
	}
	const valid = await bcrypt.compare(currentPassword, user.passwordHash);
	if (!valid) {
		const e = new Error('Current password is incorrect');
		e.statusCode = 400;
		throw e;
	}
	const hash = await bcrypt.hash(newPassword, 10);
	await prisma.users.update({
		where: { id: userId },
		data: { passwordHash: hash, mustChangePassword: false, updatedAt: new Date() },
	});
}

async function listRoles() {
	return prisma.roles.findMany({
		select: { id: true, name: true, description: true },
		orderBy: { id: 'asc' },
	});
}

module.exports = {
	register,
	login,
	refresh,
	logout,
	getMe,
	listUsers,
	updateUser,
	changePassword,
	listRoles,
};

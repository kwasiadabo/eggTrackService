const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/database');

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
	const pool = await getPool();

	const exists = await pool
		.request()
		.input('email', sql.NVarChar(150), email)
		.query('SELECT id FROM Users WHERE email = @email');
	if (exists.recordset.length) {
		const err = new Error('Email already registered');
		err.statusCode = 409;
		throw err;
	}

	const passwordHash = await bcrypt.hash(password, 10);

	const result = await pool
		.request()
		.input('name', sql.NVarChar(150), name)
		.input('email', sql.NVarChar(150), email)
		.input('passwordHash', sql.NVarChar(255), passwordHash)
		.input('roleId', sql.Int, parseInt(roleId)).query(`
      INSERT INTO Users (name, email, passwordHash, roleId)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.roleId, INSERTED.createdAt
      VALUES (@name, @email, @passwordHash, @roleId)
    `);
	return result.recordset[0];
}

async function login({ email, password }) {
	const pool = await getPool();
	console.log('Email ' + email);
	console.log('Password ' + password);
	const result = await pool.request().input('email', sql.NVarChar(150), email)
		.query(`
      SELECT u.id, u.name, u.email, u.passwordHash, u.isActive, u.roleId,
             r.name AS role
      FROM Users u
      JOIN Roles r ON r.id = u.roleId
      WHERE u.email = @email
    `);

	const user = result.recordset[0];
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

	console.log(password);
	if (!valid) {
		const e = new Error('Invalid credentials');
		e.statusCode = 401;
		throw e;
	}

	// Update lastLoginAt
	await pool
		.request()
		.input('id', sql.Int, user.id)
		.query('UPDATE Users SET lastLoginAt = GETDATE() WHERE id = @id');

	const payload = {
		sub: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		roleId: user.roleId,
	};
	const accessToken = signAccess(payload);
	const refreshToken = signRefresh({ sub: user.id });

	// Persist refresh token
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await pool
		.request()
		.input('userId', sql.Int, user.id)
		.input('token', sql.NVarChar(512), refreshToken)
		.input('expiresAt', sql.DateTime2, expiresAt)
		.query(
			'INSERT INTO RefreshTokens (userId, token, expiresAt) VALUES (@userId, @token, @expiresAt)',
		);

	return {
		accessToken,
		refreshToken,
		user: { id: user.id, name: user.name, email: user.email, role: user.role },
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

	const pool = await getPool();
	const rtRow = await pool
		.request()
		.input('token', sql.NVarChar(512), refreshToken).query(`
      SELECT id, userId, expiresAt, revokedAt
      FROM RefreshTokens
      WHERE token = @token
    `);

	const rt = rtRow.recordset[0];
	if (!rt || rt.revokedAt || new Date(rt.expiresAt) < new Date()) {
		const e = new Error('Refresh token invalid or revoked');
		e.statusCode = 401;
		throw e;
	}

	const userRow = await pool.request().input('id', sql.Int, decoded.sub).query(`
      SELECT u.id, u.name, u.email, u.roleId, r.name AS role
      FROM Users u JOIN Roles r ON r.id = u.roleId
      WHERE u.id = @id AND u.isActive = 1
    `);
	const user = userRow.recordset[0];
	if (!user) {
		const e = new Error('User not found');
		e.statusCode = 401;
		throw e;
	}

	// Rotate: revoke old, issue new
	await pool
		.request()
		.input('id', sql.Int, rt.id)
		.query('UPDATE RefreshTokens SET revokedAt = GETDATE() WHERE id = @id');

	const payload = {
		sub: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		roleId: user.roleId,
	};
	const newAccess = signAccess(payload);
	const newRefresh = signRefresh({ sub: user.id });

	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await pool
		.request()
		.input('userId', sql.Int, user.id)
		.input('token', sql.NVarChar(512), newRefresh)
		.input('expiresAt', sql.DateTime2, expiresAt)
		.query(
			'INSERT INTO RefreshTokens (userId, token, expiresAt) VALUES (@userId, @token, @expiresAt)',
		);

	return { accessToken: newAccess, refreshToken: newRefresh };
}

async function logout(refreshToken) {
	const pool = await getPool();
	await pool
		.request()
		.input('token', sql.NVarChar(512), refreshToken)
		.query(
			'UPDATE RefreshTokens SET revokedAt = GETDATE() WHERE token = @token',
		);
}

async function getMe(userId) {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.Int, userId).query(`
      SELECT u.id, u.name, u.email, u.isActive, u.lastLoginAt, u.createdAt,
             r.name AS role, r.description AS roleDescription
      FROM Users u JOIN Roles r ON r.id = u.roleId
      WHERE u.id = @id
    `);
	return result.recordset[0] || null;
}

// Admin: list / update / deactivate users
async function listUsers() {
	const pool = await getPool();
	const result = await pool.request().query(`
    SELECT u.id, u.name, u.email, u.isActive, u.lastLoginAt, u.createdAt,
           r.name AS role
    FROM Users u JOIN Roles r ON r.id = u.roleId
    ORDER BY u.createdAt DESC
  `);
	return result.recordset;
}

async function updateUser(id, { name, email, roleId, isActive }) {
	const pool = await getPool();
	const fields = [];
	const req = pool.request().input('id', sql.Int, parseInt(id));
	if (name !== undefined) {
		fields.push('name = @name');
		req.input('name', sql.NVarChar(150), name);
	}
	if (email !== undefined) {
		fields.push('email = @email');
		req.input('email', sql.NVarChar(150), email);
	}
	if (roleId !== undefined) {
		fields.push('roleId = @roleId');
		req.input('roleId', sql.Int, parseInt(roleId));
	}
	if (isActive !== undefined) {
		fields.push('isActive = @isActive');
		req.input('isActive', sql.Bit, isActive ? 1 : 0);
	}
	if (!fields.length) {
		const e = new Error('No fields to update');
		e.statusCode = 400;
		throw e;
	}
	fields.push('updatedAt = GETDATE()');
	const result = await req.query(
		`UPDATE Users SET ${fields.join(', ')} OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.isActive, INSERTED.roleId WHERE id = @id`,
	);
	if (!result.recordset.length) {
		const e = new Error('User not found');
		e.statusCode = 404;
		throw e;
	}
	return result.recordset[0];
}

async function changePassword(userId, { currentPassword, newPassword }) {
	const pool = await getPool();
	const row = await pool
		.request()
		.input('id', sql.Int, userId)
		.query('SELECT passwordHash FROM Users WHERE id = @id');
	const user = row.recordset[0];
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
	await pool
		.request()
		.input('id', sql.Int, userId)
		.input('hash', sql.NVarChar(255), hash)
		.query(
			'UPDATE Users SET passwordHash = @hash, updatedAt = GETDATE() WHERE id = @id',
		);
}

async function listRoles() {
	const pool = await getPool();
	const result = await pool
		.request()
		.query('SELECT id, name, description FROM Roles ORDER BY id');
	return result.recordset;
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

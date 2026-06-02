const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
	server: process.env.DB_SERVER || 'localhost',
	port: parseInt(process.env.DB_PORT) || 1433,
	database: process.env.DB_NAME || 'EggDistributionDB',
	user: process.env.DB_USER || 'sa',
	password: process.env.DB_PASSWORD || '',
	options: {
		encrypt: process.env.DB_ENCRYPT === 'true',
		trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
		enableArithAbort: true,
	},
	pool: {
		max: 10,
		min: 0,
		idleTimeoutMillis: 30000,
	},
};

let pool = null;

async function getPool() {
	if (!pool) {
		pool = await sql.connect(dbConfig);
		console.log('✅ Connected to MSSQL database');
	}
	return pool;
}

async function closePool() {
	if (pool) {
		await pool.close();
		pool = null;
	}
}

module.exports = { sql, getPool, closePool };

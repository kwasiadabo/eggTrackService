const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');
require('dotenv').config();

const adapter = new PrismaMssql({
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
	pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
});

const basePrisma = new PrismaClient({ adapter });
const prisma = basePrisma.$extends(require('./prismaSoftDelete').softDeleteExtension);

module.exports = { prisma };

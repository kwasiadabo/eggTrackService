// Prisma returns Decimal columns as Decimal.js instances, which JSON.stringify
// to strings (e.g. "330"). The raw mssql driver returned them as plain numbers.
// Use this when mapping Prisma rows to preserve the existing number-typed JSON shape.
function toNumber(value) {
	return value === null || value === undefined ? value : value.toNumber();
}

module.exports = { toNumber };

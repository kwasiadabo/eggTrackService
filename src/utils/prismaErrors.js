// Converts a Prisma "record not found" error (P2025, raised by update/delete
// when the where clause matches no row) into the same `{ statusCode, message }`
// shape services have always thrown for "not found". Other errors pass through
// unchanged so callers can still handle them (e.g. P2002 unique violations).
function toNotFoundError(err, message) {
	if (err.code === 'P2025') {
		const e = new Error(message);
		e.statusCode = 404;
		return e;
	}
	return err;
}

module.exports = { toNotFoundError };

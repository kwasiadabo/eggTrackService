// Models with deletedAt/deletedBy columns, per prisma/schema.prisma.
// Users is intentionally excluded: it has no deletedAt/deletedBy column
// (deactivation is handled via the isActive flag instead).
const SOFT_DELETE_MODELS = [
	'sales',
	'customers',
	'eggsPurchases',
	'farms',
	'payments',
	'expenses',
	'reportRecipients',
];

// Covers findMany/findFirst/count/aggregate/update only.
// - create has no `where`, and delete/deleteMany are never used (soft deletes only).
// - groupBy and $queryRaw/$executeRaw are NOT covered - callers must add
//   `deletedAt: null` manually for those.
// - findUnique is left unfiltered - use findFirst({ where: { id, ... } }) instead
//   so this extension applies.
// - Any caller-supplied `where.deletedAt` is overwritten (extension wins).
const softDeleteExtension = {
	query: Object.fromEntries(
		SOFT_DELETE_MODELS.map((model) => [
			model,
			{
				async findMany({ args, query }) {
					args.where = { ...args.where, deletedAt: null };
					return query(args);
				},
				async findFirst({ args, query }) {
					args.where = { ...args.where, deletedAt: null };
					return query(args);
				},
				async count({ args, query }) {
					args.where = { ...args.where, deletedAt: null };
					return query(args);
				},
				async aggregate({ args, query }) {
					args.where = { ...args.where, deletedAt: null };
					return query(args);
				},
				async update({ args, query }) {
					args.where = { ...args.where, deletedAt: null };
					return query(args);
				},
			},
		]),
	),
};

module.exports = { softDeleteExtension };

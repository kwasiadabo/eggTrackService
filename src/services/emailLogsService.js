const { prisma } = require('../config/prisma');

async function logEmail({
	jobType = 'debtors_report',
	recipients = [],
	debtorCount = null,
	status = 'sent',
	errorMessage = null,
}) {
	await prisma.emailLogs.create({
		data: {
			jobType,
			recipients: recipients.join(', ') || null,
			recipientCount: recipients.length,
			debtorCount,
			status,
			errorMessage: errorMessage || null,
		},
	});
}

async function getEmailLogs({ limit = 50, jobType } = {}) {
	return prisma.emailLogs.findMany({
		where: { ...(jobType && { jobType }) },
		orderBy: { sentAt: 'desc' },
		take: parseInt(limit),
	});
}

module.exports = { logEmail, getEmailLogs };

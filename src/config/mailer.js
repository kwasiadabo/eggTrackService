const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's shared 'onboarding@resend.dev' sender can only deliver to the
// account owner's own email until a custom domain is verified at
// resend.com/domains — set EMAIL_FROM to an address on that domain for
// production use with multiple report recipients.
const FROM = process.env.EMAIL_FROM || 'EggTrack Reports <onboarding@resend.dev>';

async function sendMail({ to, subject, html }) {
	const { data, error } = await resend.emails.send({
		from: FROM,
		to: Array.isArray(to) ? to : [to],
		subject,
		html,
	});

	if (error) {
		throw new Error(error.message || 'Failed to send email');
	}

	return data;
}

module.exports = { sendMail };

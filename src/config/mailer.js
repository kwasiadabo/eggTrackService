const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS — Render blocks the implicit-TLS port 465 used by the 'gmail' service preset
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password (not your account password)
  },
  family: 4, // force IPv4 — avoids IPv6 routing issues to Gmail's SMTP from Render
});

module.exports = transporter;

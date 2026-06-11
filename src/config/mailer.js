const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password (not your account password)
  },
  family: 4, // force IPv4 — Render's network can't reach Gmail's SMTP over IPv6, causing connection timeouts
});

module.exports = transporter;

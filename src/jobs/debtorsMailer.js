const cron = require('node-cron');
const transporter = require('../config/mailer');
const { getDebtors } = require('../services/paymentsService');

const EMAIL_RECIPIENTS = [
  'kwasiadaboboakye@gmail.com',
  'owkwasi@yahoo.com',
];

function formatCurrency(amount) {
  return `GHS ${parseFloat(amount).toFixed(2)}`;
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Email ────────────────────────────────────────────────────

function buildEmailHtml(debtors, generatedAt) {
  const total = debtors.reduce((sum, d) => sum + parseFloat(d.balance), 0);
  const overdueCount = debtors.filter(d => d.overdue).length;

  const rows = debtors.map((d, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9f9f9'}">
      <td style="padding:10px 12px;border-bottom:1px solid #eee">${d.customerName}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555">${d.phone || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(d.totalSales)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#2e7d32">${formatCurrency(d.totalPaid)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#c62828">${formatCurrency(d.balance)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${formatDate(d.lastSaleDate)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">
        <span style="
          background:${d.overdue ? '#fdecea' : '#e8f5e9'};
          color:${d.overdue ? '#c62828' : '#2e7d32'};
          padding:3px 8px;border-radius:12px;font-size:12px;font-weight:600
        ">${d.overdue ? `OVERDUE (${d.daysDue}d)` : `${d.daysDue}d`}</span>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4">
  <div style="max-width:900px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">

    <div style="background:#3d2008;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px">🥚 EggTrack — Daily Debtors Report</h1>
      <p style="margin:6px 0 0;color:#c8a882;font-size:14px">Generated: ${generatedAt}</p>
    </div>

    <div style="display:flex;gap:0;border-bottom:1px solid #eee">
      <div style="flex:1;padding:20px 24px;border-right:1px solid #eee;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#c62828">${debtors.length}</div>
        <div style="font-size:13px;color:#777;margin-top:4px">Total Debtors</div>
      </div>
      <div style="flex:1;padding:20px 24px;border-right:1px solid #eee;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#c62828">${formatCurrency(total)}</div>
        <div style="font-size:13px;color:#777;margin-top:4px">Total Outstanding</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${overdueCount > 0 ? '#c62828' : '#2e7d32'}">${overdueCount}</div>
        <div style="font-size:13px;color:#777;margin-top:4px">Overdue (&gt;30 days)</div>
      </div>
    </div>

    ${debtors.length === 0 ? `
      <div style="padding:48px;text-align:center;color:#555">
        <div style="font-size:48px">🎉</div>
        <p style="font-size:18px;font-weight:600;margin:12px 0 4px">No outstanding debts!</p>
        <p style="color:#888">All customers are up to date.</p>
      </div>
    ` : `
    <div style="padding:24px 32px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#3d2008;color:#fff">
            <th style="padding:12px;text-align:left">Customer</th>
            <th style="padding:12px;text-align:left">Phone</th>
            <th style="padding:12px;text-align:right">Total Sales</th>
            <th style="padding:12px;text-align:right">Total Paid</th>
            <th style="padding:12px;text-align:right">Balance</th>
            <th style="padding:12px;text-align:center">Last Sale</th>
            <th style="padding:12px;text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#fdf3ec">
            <td colspan="4" style="padding:12px;font-weight:700;text-align:right">Total Outstanding:</td>
            <td style="padding:12px;font-weight:700;color:#c62828;text-align:right">${formatCurrency(total)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    `}

    <div style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center">
      This is an automated report from EggTrack. Do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

// ─── Main job ─────────────────────────────────────────────────

async function sendDebtorsReport() {
  try {
    const debtors = await getDebtors();
    const generatedAt = new Date().toLocaleString('en-GB', {
      dateStyle: 'full', timeStyle: 'short',
    });
    const subject = `EggTrack Debtors Report — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    // Email — all recipients in one call
    await transporter.sendMail({
      from:    `"EggTrack Reports" <${process.env.EMAIL_USER}>`,
      to:      EMAIL_RECIPIENTS.join(', '),
      subject,
      html:    buildEmailHtml(debtors, generatedAt),
    });
    console.log(`✅ Debtors email sent to ${EMAIL_RECIPIENTS.join(', ')} (${debtors.length} debtors)`);

  } catch (err) {
    console.error('❌ Failed to send debtors report:', err.message);
  }
}

function registerDebtorsJob() {
  cron.schedule('0 8 * * *', sendDebtorsReport, { timezone: 'Africa/Accra' });
  console.log('📅 Debtors report job scheduled — daily at 08:00 AM (Africa/Accra)');
}

module.exports = { registerDebtorsJob, sendDebtorsReport };

const path = require('path');
const fs   = require('fs');
const { rescheduleDebtorsJob } = require('../jobs/debtorsMailer');

function getSchedule(req, res) {
  res.json({
    success: true,
    data: {
      hour:     parseInt(process.env.REPORT_HOUR   || 7),
      minute:   parseInt(process.env.REPORT_MINUTE || 15),
      timezone: 'Africa/Accra',
    },
  });
}

function updateSchedule(req, res, next) {
  try {
    const hour   = parseInt(req.body.hour);
    const minute = parseInt(req.body.minute);

    if (isNaN(hour)   || hour   < 0 || hour   > 23)
      return res.status(400).json({ success: false, message: 'hour must be 0–23' });
    if (isNaN(minute) || minute < 0 || minute > 59)
      return res.status(400).json({ success: false, message: 'minute must be 0–59' });

    // Persist to .env so the new time survives a restart
    const envPath    = path.resolve(__dirname, '../../.env');
    let   envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent
      .replace(/^REPORT_HOUR=.*/m,   `REPORT_HOUR=${hour}`)
      .replace(/^REPORT_MINUTE=.*/m, `REPORT_MINUTE=${minute}`);
    fs.writeFileSync(envPath, envContent, 'utf8');

    // Reschedule the live cron job (no restart needed)
    rescheduleDebtorsJob(hour, minute);

    const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    res.json({
      success: true,
      message: `Report rescheduled — will now run daily at ${label} (Africa/Accra)`,
      data: { hour, minute, timezone: 'Africa/Accra' },
    });
  } catch (err) { next(err); }
}

module.exports = { getSchedule, updateSchedule };

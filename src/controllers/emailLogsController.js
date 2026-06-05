const svc = require('../services/emailLogsService');

async function getEmailLogs(req, res, next) {
  try {
    const { limit, jobType } = req.query;
    const data = await svc.getEmailLogs({ limit, jobType });
    res.json({ success: true, data });
  } catch (e) { next(e); }
}

module.exports = { getEmailLogs };

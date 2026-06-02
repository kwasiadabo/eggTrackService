const dashboardService = require('../services/dashboardService');

async function getDashboard(req, res, next) {
  try {
    const data = await dashboardService.getDashboardStats();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = { getDashboard };

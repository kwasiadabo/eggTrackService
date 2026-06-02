const inventoryService = require('../services/inventoryService');

async function getInventory(req, res, next) {
  try {
    const data = await inventoryService.getInventory();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = { getInventory };

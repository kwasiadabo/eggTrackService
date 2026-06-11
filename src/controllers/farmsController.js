const svc = require('../services/farmsService');

async function getFarms(req, res, next) {
  try { res.json({ success: true, data: await svc.getAll() }); } catch (e) { next(e); }
}

async function getActiveFarms(req, res, next) {
  try { res.json({ success: true, data: await svc.getActive() }); } catch (e) { next(e); }
}

async function createFarm(req, res, next) {
  try {
    const farm = await svc.create(req.body);
    res.status(201).json({ success: true, message: 'Farm added', data: farm });
  } catch (e) {
    if (e.code === 'P2002' || e.message?.includes('UQ_Farms_Name') || e.number === 2627)
      return res.status(409).json({ success: false, message: 'A farm with this name already exists.' });
    next(e);
  }
}

async function updateFarm(req, res, next) {
  try {
    const farm = await svc.update(req.params.id, req.body);
    res.json({ success: true, message: 'Farm updated', data: farm });
  } catch (e) {
    if (e.code === 'P2002' || e.message?.includes('UQ_Farms_Name') || e.number === 2627)
      return res.status(409).json({ success: false, message: 'Another farm already has this name.' });
    next(e);
  }
}

async function deleteFarm(req, res, next) {
  try {
    await svc.remove(req.params.id);
    res.json({ success: true, message: 'Farm removed' });
  } catch (e) { next(e); }
}

module.exports = { getFarms, getActiveFarms, createFarm, updateFarm, deleteFarm };

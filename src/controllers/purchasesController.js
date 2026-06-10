const svc = require('../services/purchasesService');

async function getPurchases(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllPurchases(req.query) }); } catch (e) { next(e); }
}
async function getPurchase(req, res, next) {
  try { res.json({ success: true, data: await svc.getPurchaseById(req.params.id) }); } catch (e) { next(e); }
}
async function createPurchase(req, res, next) {
  try {
    const data = await svc.createPurchase(req.body, req.user.sub);
    res.status(201).json({ success: true, message: 'Purchase submitted — awaiting admin approval', data });
  } catch (e) { next(e); }
}
async function updatePurchase(req, res, next) {
  try { res.json({ success: true, message: 'Purchase updated', data: await svc.updatePurchase(req.params.id, req.body) }); } catch (e) { next(e); }
}
async function deletePurchase(req, res, next) {
  try {
    const orig = await svc.deletePurchase(req.params.id, req.user.sub);
    const message = orig.status === 'approved'
      ? 'Purchase deleted and inventory reversed'
      : 'Purchase deleted';
    res.json({ success: true, message });
  } catch (e) { next(e); }
}
async function createBatchPurchase(req, res, next) {
  try {
    const records = await svc.createBatch(req.body, req.user.sub);
    const message = `${records.length} purchase line${records.length > 1 ? 's' : ''} submitted — awaiting admin approval`;
    res.status(201).json({ success: true, message, data: records });
  } catch (e) { next(e); }
}
async function approvePurchase(req, res, next) {
  try {
    const data = await svc.approvePurchase(req.params.id, req.user.sub);
    res.json({ success: true, message: 'Purchase approved & inventory updated', data });
  } catch (e) { next(e); }
}
async function rejectPurchase(req, res, next) {
  try {
    const data = await svc.rejectPurchase(req.params.id, req.user.sub, req.body.rejectionNote);
    res.json({ success: true, message: 'Purchase rejected', data });
  } catch (e) { next(e); }
}

module.exports = {
  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  createBatchPurchase,
  approvePurchase,
  rejectPurchase,
};

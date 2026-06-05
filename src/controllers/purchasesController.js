const svc = require('../services/purchasesService');

async function getPurchases(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllPurchases() }); } catch (e) { next(e); }
}
async function getPurchase(req, res, next) {
  try { res.json({ success: true, data: await svc.getPurchaseById(req.params.id) }); } catch (e) { next(e); }
}
async function createPurchase(req, res, next) {
  try { res.status(201).json({ success: true, message: 'Purchase recorded and inventory updated', data: await svc.createPurchase(req.body) }); } catch (e) { next(e); }
}
async function updatePurchase(req, res, next) {
  try { res.json({ success: true, message: 'Purchase updated', data: await svc.updatePurchase(req.params.id, req.body) }); } catch (e) { next(e); }
}
async function deletePurchase(req, res, next) {
  try { await svc.deletePurchase(req.params.id, req.user.sub); res.json({ success: true, message: 'Purchase deleted and inventory reversed' }); } catch (e) { next(e); }
}
async function createBatchPurchase(req, res, next) {
  try {
    const records = await svc.createBatch(req.body);
    res.status(201).json({
      success: true,
      message: `${records.length} purchase line${records.length > 1 ? 's' : ''} recorded & inventory updated`,
      data: records,
    });
  } catch (e) { next(e); }
}

module.exports = { getPurchases, getPurchase, createPurchase, updatePurchase, deletePurchase, createBatchPurchase };

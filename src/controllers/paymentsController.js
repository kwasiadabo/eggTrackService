const svc = require('../services/paymentsService');

async function getAllPayments(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllPayments() }); } catch (e) { next(e); }
}
async function createPayment(req, res, next) {
  try { res.status(201).json({ success: true, message: 'Payment recorded', data: await svc.createPayment(req.body) }); } catch (e) { next(e); }
}
async function updatePayment(req, res, next) {
  try { res.json({ success: true, message: 'Payment updated', data: await svc.updatePayment(req.params.id, req.body) }); } catch (e) { next(e); }
}
async function deletePayment(req, res, next) {
  try { await svc.deletePayment(req.params.id, req.user.sub); res.json({ success: true, message: 'Payment deleted' }); } catch (e) { next(e); }
}
async function getDebtors(req, res, next) {
  try { res.json({ success: true, data: await svc.getDebtors() }); } catch (e) { next(e); }
}
async function getPaymentsByCustomer(req, res, next) {
  try { res.json({ success: true, data: await svc.getPaymentsByCustomer(req.params.customerId) }); } catch (e) { next(e); }
}
module.exports = { getAllPayments, createPayment, updatePayment, deletePayment, getDebtors, getPaymentsByCustomer };

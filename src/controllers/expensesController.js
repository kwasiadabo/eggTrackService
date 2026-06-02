const svc = require('../services/expensesService');

async function getExpenses(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllExpenses() }); } catch (e) { next(e); }
}
async function getExpense(req, res, next) {
  try { res.json({ success: true, data: await svc.getExpenseById(req.params.id) }); } catch (e) { next(e); }
}
async function createExpense(req, res, next) {
  try { res.status(201).json({ success: true, message: 'Expense recorded', data: await svc.createExpense(req.body) }); } catch (e) { next(e); }
}
async function updateExpense(req, res, next) {
  try { res.json({ success: true, message: 'Expense updated', data: await svc.updateExpense(req.params.id, req.body) }); } catch (e) { next(e); }
}
async function deleteExpense(req, res, next) {
  try { await svc.deleteExpense(req.params.id, req.user.sub); res.json({ success: true, message: 'Expense deleted' }); } catch (e) { next(e); }
}
async function getExpenseSummary(req, res, next) {
  try { res.json({ success: true, data: await svc.getExpenseSummary() }); } catch (e) { next(e); }
}
module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense, getExpenseSummary };

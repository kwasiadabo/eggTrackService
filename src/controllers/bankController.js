const svc = require('../services/bankService');

async function getAccounts(req, res, next) {
  try {
    const data = await svc.listAccounts(req.user.role === 'admin');
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function createAccount(req, res, next) {
  try {
    const data = await svc.createAccount(req.body);
    res.status(201).json({ success: true, message: 'Bank account created', data });
  } catch (err) { next(err); }
}

async function updateAccount(req, res, next) {
  try {
    const data = await svc.updateAccount(req.params.id, req.body);
    res.json({ success: true, message: 'Bank account updated', data });
  } catch (err) { next(err); }
}

async function getTransactions(req, res, next) {
  try {
    const data = await svc.listTransactions(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function deposit(req, res, next) {
  try {
    const data = await svc.createDeposit(req.body, req.user.sub);
    res.status(201).json({ success: true, message: 'Deposit recorded', data });
  } catch (err) { next(err); }
}

async function withdrawal(req, res, next) {
  try {
    const data = await svc.createWithdrawal(req.body, req.user.sub, req.user.role);
    const msg = data.status === 'pending'
      ? 'Withdrawal request submitted — awaiting admin approval'
      : 'Withdrawal recorded';
    res.status(201).json({ success: true, message: msg, data });
  } catch (err) { next(err); }
}

async function approveWithdrawal(req, res, next) {
  try {
    const data = await svc.approveWithdrawal(req.params.id, req.user.sub);
    res.json({ success: true, message: 'Withdrawal approved', data });
  } catch (err) { next(err); }
}

async function rejectWithdrawal(req, res, next) {
  try {
    const data = await svc.rejectWithdrawal(req.params.id, req.user.sub, req.body.rejectionNote);
    res.json({ success: true, message: 'Withdrawal rejected', data });
  } catch (err) { next(err); }
}

module.exports = { getAccounts, createAccount, updateAccount, getTransactions, deposit, withdrawal, approveWithdrawal, rejectWithdrawal };

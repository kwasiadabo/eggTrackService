const svc = require('../services/reportRecipientsService');

async function getRecipients(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllRecipients() }); } catch (e) { next(e); }
}
async function addRecipient(req, res, next) {
  try {
    const recipient = await svc.addRecipient({ ...req.body, createdBy: req.user.sub });
    res.status(201).json({ success: true, message: 'Recipient added', data: recipient });
  } catch (e) { next(e); }
}
async function updateRecipient(req, res, next) {
  try {
    const recipient = await svc.updateRecipient(req.params.id, req.body);
    res.json({ success: true, message: 'Recipient updated', data: recipient });
  } catch (e) { next(e); }
}
async function deleteRecipient(req, res, next) {
  try {
    await svc.deleteRecipient(req.params.id, req.user.sub);
    res.json({ success: true, message: 'Recipient removed' });
  } catch (e) { next(e); }
}

module.exports = { getRecipients, addRecipient, updateRecipient, deleteRecipient };

const svc = require('../services/salesService');

async function getSales(req, res, next) {
  try { res.json({ success: true, data: await svc.getAllSales() }); } catch (e) { next(e); }
}
async function getSale(req, res, next) {
  try { res.json({ success: true, data: await svc.getSaleById(req.params.id) }); } catch (e) { next(e); }
}
async function createSale(req, res, next) {
  try {
    const sale = await svc.createSale(req.body);
    res.status(201).json({
      success: true,
      message: 'Sale recorded and inventory updated',
      receipt: { receiptNo: `RCP-${sale.id}`, date: sale.saleDate, customer: sale.customerName, phone: sale.phone, address: sale.address, eggSize: sale.eggSize, quantity: sale.quantity, unitPrice: sale.unitPrice, totalAmount: sale.totalAmount, notes: sale.notes },
    });
  } catch (e) { next(e); }
}
async function updateSale(req, res, next) {
  try { res.json({ success: true, message: 'Sale updated', data: await svc.updateSale(req.params.id, req.body) }); } catch (e) { next(e); }
}
async function deleteSale(req, res, next) {
  try { await svc.deleteSale(req.params.id, req.user.sub); res.json({ success: true, message: 'Sale deleted and inventory returned' }); } catch (e) { next(e); }
}
module.exports = { getSales, getSale, createSale, updateSale, deleteSale };

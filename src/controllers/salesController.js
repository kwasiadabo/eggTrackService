const svc = require('../services/salesService');

function buildInvoiceHtml(sale) {
  const fmt = (n) => `GHS ${parseFloat(n).toFixed(2)}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const invoiceNo = `INV-${String(sale.id).padStart(5, '0')}`;
  const eggLabel = sale.eggSize.charAt(0).toUpperCase() + sale.eggSize.slice(1);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoiceNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 32px; }
    .page { max-width: 750px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
    .header { background: #3d2008; padding: 32px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-left h1 { color: #fff; font-size: 24px; margin-bottom: 4px; }
    .header-left p { color: #c8a882; font-size: 13px; }
    .header-right { text-align: right; }
    .header-right .invoice-label { color: #c8a882; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
    .header-right .invoice-no { color: #fff; font-size: 22px; font-weight: 700; margin-top: 4px; }
    .header-right .invoice-date { color: #c8a882; font-size: 13px; margin-top: 6px; }
    .body { padding: 36px 40px; }
    .bill-to { margin-bottom: 32px; }
    .bill-to .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
    .bill-to .name { font-size: 17px; font-weight: 700; color: #222; }
    .bill-to .detail { font-size: 14px; color: #555; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #3d2008; color: #fff; }
    thead th { padding: 11px 14px; font-size: 13px; text-align: left; }
    thead th:last-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
    tbody tr { border-bottom: 1px solid #eee; }
    tbody td { padding: 13px 14px; font-size: 14px; color: #333; }
    tbody td:nth-child(2), tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
    tfoot td { padding: 12px 14px; font-size: 14px; }
    .total-label { text-align: right; font-weight: 600; color: #555; }
    .total-value { text-align: right; font-weight: 700; font-size: 16px; color: #c62828; }
    .notes { background: #fdf3ec; border-left: 3px solid #3d2008; padding: 12px 16px; border-radius: 0 4px 4px 0; margin-bottom: 24px; }
    .notes .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 4px; }
    .notes p { font-size: 14px; color: #555; }
    .footer { border-top: 1px solid #eee; padding: 18px 40px; background: #f9f9f9; text-align: center; font-size: 12px; color: #999; }
    @media print {
      body { background: none; padding: 0; }
      .page { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>🥚 EggTrack</h1>
        <p>Egg Distribution &amp; Sales</p>
      </div>
      <div class="header-right">
        <div class="invoice-label">Invoice</div>
        <div class="invoice-no">${invoiceNo}</div>
        <div class="invoice-date">${fmtDate(sale.saleDate)}</div>
      </div>
    </div>

    <div class="body">
      <div class="bill-to">
        <div class="label">Bill To</div>
        <div class="name">${sale.customerName}</div>
        ${sale.phone  ? `<div class="detail">${sale.phone}</div>`   : ''}
        ${sale.address ? `<div class="detail">${sale.address}</div>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty (trays)</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${eggLabel} Eggs</td>
            <td style="text-align:right">${sale.quantity}</td>
            <td style="text-align:right">${fmt(sale.unitPrice)}</td>
            <td style="text-align:right">${fmt(sale.totalAmount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="total-label">Total</td>
            <td class="total-value">${fmt(sale.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      ${sale.notes ? `
      <div class="notes">
        <div class="label">Notes</div>
        <p>${sale.notes}</p>
      </div>` : ''}
    </div>

    <div class="footer">
      Thank you for your business. This is a computer-generated invoice from EggTrack.
    </div>
  </div>
</body>
</html>`;
}

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
async function getSaleInvoice(req, res, next) {
  try {
    const sale = await svc.getSaleById(req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildInvoiceHtml(sale));
  } catch (e) { next(e); }
}
async function createInvoice(req, res, next) {
  try {
    const result = await svc.createInvoice(req.body);
    res.status(201).json({ success: true, message: 'Invoice created', data: result });
  } catch (e) { next(e); }
}

module.exports = { getSales, getSale, createSale, updateSale, deleteSale, getSaleInvoice, createInvoice };

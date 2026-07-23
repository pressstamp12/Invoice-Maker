/**
 * Port dari InvoiceTemplate.html (GAS <?= ?> scriptlets) ke JS template literal biasa.
 * Tampilan & style dibuat SAMA PERSIS dengan versi Apps Script.
 */
function escapeHtmlT(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function moneyT(n) { return Number(n || 0).toLocaleString('id-ID'); }

window.renderInvoiceTemplate = function ({ invoice, company, cashier, currency, bankLine }) {
  const itemsRows = (invoice.items || []).map(item => `
    <tr>
      <td class="desc">${escapeHtmlT(item.desc)}</td>
      <td class="center">${item.qty}</td>
      <td class="center">${item.unit || '-'}</td>
      <td class="num">${currency} ${moneyT(item.price)}</td>
      <td class="num">${currency} ${moneyT(Number(item.qty) * Number(item.price))}</td>
    </tr>`).join('');

  const signatureHtml = (cashier && cashier.signatureUrl)
    ? `<img class="sign-img" src="${cashier.signatureUrl}" alt="ttd"><div class="sign-line">${escapeHtmlT(cashier.name)}</div>`
    : `<div class="sign-line no-img">${escapeHtmlT(cashier ? cashier.name : company.name)}</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; margin: 40px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .invoice-wrap { max-width: 780px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 18px; }
  .company { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .company img.logo { max-height: 60px; max-width: 140px; object-fit: contain; }
  .company h2 { margin: 0 0 4px; color: #1e3a5f; font-size: 20px; word-break: break-word; }
  .company p { margin: 2px 0; color: #555; font-size: 12px; word-break: break-word; }
  .invoice-word { text-align: right; flex-shrink: 0; }
  .invoice-word h1 { margin: 0; font-size: 30px; letter-spacing: 2px; color: #1e3a5f; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .meta .block { flex: 1; min-width: 0; }
  .meta .block.right { text-align: right; }
  .meta h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .meta p { margin: 2px 0; word-break: break-word; }
  .meta .inv-number { font-size: 15px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
  .status-tag { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 4px; }
  .table-scroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.items th { background: #1e3a5f; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; white-space: nowrap; }
  table.items td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
  table.items td.desc { word-break: break-word; }
  table.items th.num, table.items td.num { text-align: right; white-space: nowrap; }
  table.items th.center, table.items td.center { text-align: center; }
  .totals { width: 280px; max-width: 100%; margin-left: auto; margin-bottom: 18px; }
  .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 13px; }
  .totals .grand { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; font-size: 16px; font-weight: bold; color: #1e3a5f; }
  .info-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 14px; }
  .info-row .notes { flex: 1; min-width: 200px; margin-bottom: 0; }
  .notes h4 { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .notes p { word-break: break-word; margin: 2px 0; }
  .signature { display: flex; justify-content: flex-end; margin-top: 20px; }
  .signature .sign-box { text-align: center; font-size: 12px; }
  .signature .sign-img { max-height: 66px; max-width: 180px; object-fit: contain; margin: 4px auto; display: block; }
  .signature .sign-line { margin-top: 6px; border-top: 1px solid #0f172a; padding-top: 4px; min-width: 160px; }
  .signature .sign-line.no-img { margin-top: 40px; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; text-align: center; margin-top: 16px; }
  @media (max-width: 640px) {
    body { margin: 22px; font-size: 14px; } .header { padding-bottom: 12px; margin-bottom: 16px; }
    .company h2 { font-size: 20px; } .invoice-word h1 { font-size: 26px; } .info-row { gap: 12px; }
  }
  @media (max-width: 480px) {
    body { margin: 14px; font-size: 12.5px; } .header { gap: 8px; padding-bottom: 10px; margin-bottom: 14px; align-items: center; }
    .company { gap: 8px; } .company img.logo { max-height: 44px; max-width: 90px; }
    .company h2 { font-size: 16px; margin-bottom: 2px; } .company p { font-size: 10.5px; }
    .invoice-word h1 { font-size: 22px; letter-spacing: 1px; }
    .meta { gap: 10px; margin-bottom: 14px; } .meta h4 { font-size: 10px; margin-bottom: 3px; }
    .meta p { font-size: 11px; } .meta .inv-number { font-size: 12.5px; } .status-tag { font-size: 10px; padding: 2px 8px; }
    table.items th, table.items td { font-size: 11px; padding: 6px 6px; }
    .totals { width: 100%; } .totals div { font-size: 12.5px; padding: 4px 0; } .totals .grand { font-size: 14px; }
    .info-row { flex-direction: column; gap: 8px; margin-bottom: 10px; } .signature { margin-top: 16px; } .footer { font-size: 10.5px; margin-top: 12px; }
  }
  @media (max-width: 360px) {
    body { margin: 10px; } .company h2 { font-size: 14px; } .invoice-word h1 { font-size: 19px; }
    table.items th, table.items td { font-size: 10.5px; padding: 5px 5px; }
  }
  @media print { body { margin: 0; } .invoice-wrap { max-width: 100%; } }
</style></head>
<body>
  <div class="invoice-wrap">
  <div class="header">
    <div class="company">
      ${company.logoUrl ? `<img class="logo" src="${company.logoUrl}" alt="logo">` : ''}
      <div>
        <h2>${escapeHtmlT(company.name)}</h2>
        ${company.address ? `<p>${escapeHtmlT(company.address)}</p>` : ''}
        ${company.phone ? `<p>Telp: ${escapeHtmlT(company.phone)}</p>` : ''}
        ${company.email ? `<p>Email: ${escapeHtmlT(company.email)}</p>` : ''}
      </div>
    </div>
    <div class="invoice-word"><h1>INVOICE</h1></div>
  </div>

  <div class="meta">
    <div class="block">
      <h4>Ditagihkan kepada</h4>
      <p><strong>${escapeHtmlT(invoice.clientName)}</strong></p>
      ${invoice.clientAddress ? `<p>${escapeHtmlT(invoice.clientAddress)}</p>` : ''}
      ${invoice.clientEmail ? `<p>${escapeHtmlT(invoice.clientEmail)}</p>` : ''}
      ${invoice.clientPhone ? `<p>${escapeHtmlT(invoice.clientPhone)}</p>` : ''}
    </div>
    <div class="block right">
      <h4>Detail Invoice</h4>
      <p class="inv-number">${escapeHtmlT(invoice.invoiceNumber)}</p>
      <p>Tanggal: <strong>${escapeHtmlT(invoice.invoiceDate)}</strong></p>
      ${invoice.dueDate ? `<p>Jatuh Tempo: <strong>${escapeHtmlT(invoice.dueDate)}</strong></p>` : ''}
      ${cashier ? `<p>Kasir: <strong>${escapeHtmlT(cashier.name)}</strong></p>` : ''}
      <span class="status-tag" style="background:${invoice.status === 'Paid' ? '#dcfce7' : '#fee2e2'}; color:${invoice.status === 'Paid' ? '#16a34a' : '#ef4444'};">
        ${invoice.status === 'Paid' ? 'LUNAS' : 'BELUM LUNAS'}
      </span>
    </div>
  </div>

  <div class="table-scroll">
  <table class="items">
    <thead><tr><th>Deskripsi</th><th class="center">Qty</th><th class="center">Satuan</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  </div>

  <div class="totals">
    <div><span>Subtotal</span><strong>${currency} ${moneyT(invoice.subtotal)}</strong></div>
    ${invoice.discount > 0 ? `<div><span>Diskon</span><strong>- ${currency} ${moneyT(invoice.discount)}</strong></div>` : ''}
    ${invoice.taxPercent > 0 ? `<div><span>Pajak (${invoice.taxPercent}%)</span><strong>${currency} ${moneyT(invoice.taxAmount)}</strong></div>` : ''}
    <div class="grand"><span>Total</span><span>${currency} ${moneyT(invoice.total)}</span></div>
  </div>

  <div class="info-row">
    ${invoice.notes ? `<div class="notes"><h4>Catatan</h4><p>${escapeHtmlT(invoice.notes)}</p></div>` : ''}
    ${bankLine ? `<div class="notes"><h4>Informasi Pembayaran</h4><p>${escapeHtmlT(bankLine)}</p></div>` : ''}
  </div>

  <div class="signature"><div class="sign-box"><div>Hormat kami,</div>${signatureHtml}</div></div>

  <div class="footer"><p>Terima kasih atas kepercayaan Anda kepada ${escapeHtmlT(company.name)}</p></div>
  </div>
</body></html>`;
};

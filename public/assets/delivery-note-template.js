/**
 * Template Surat Jalan (Soft Copy / Digital POD)
 * Menampilkan rincian barang TANPA harga, lengkap dengan status & tanda tangan penerima.
 */
function escapeHtmlSj(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtDateTimeSj(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return String(iso); }
}

window.renderDeliveryNoteTemplate = function ({ deliveryNote, invoice, company, cashier }) {
  const itemsRows = (invoice.items || []).map((item, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="desc">${escapeHtmlSj(item.desc)}${item.note ? `<div class="item-note">${escapeHtmlSj(item.note)}</div>` : ''}</td>
      <td class="center"><strong>${item.qty}</strong></td>
      <td class="center">${escapeHtmlSj(item.unit || '-')}</td>
    </tr>`).join('');

  const isDone = deliveryNote.status === 'Diterima';
  const senderSigHtml = (cashier && cashier.signatureUrl)
    ? `<img class="sign-img" src="${cashier.signatureUrl}" alt="ttd"><div class="sign-line">${escapeHtmlSj(cashier.name)}</div>`
    : `<div class="sign-line no-img">${escapeHtmlSj(deliveryNote.courierName || (cashier ? cashier.name : company.name))}</div>`;

  const receiverSigHtml = (isDone && deliveryNote.receiverSignatureUrl)
    ? `<img class="sign-img" src="${deliveryNote.receiverSignatureUrl}" alt="ttd penerima">
       <div class="sign-line">${escapeHtmlSj(deliveryNote.receiverName || 'Penerima')}</div>
       <div class="sign-time">${escapeHtmlSj(fmtDateTimeSj(deliveryNote.receivedAt))}</div>`
    : `<div class="sign-line no-img">(Menunggu konfirmasi)</div>`;

  const proofHtml = (isDone && deliveryNote.proofPhotoUrl)
    ? `<div class="proof-section">
         <h4>Foto Bukti Penerimaan Barang</h4>
         <img class="proof-img" src="${deliveryNote.proofPhotoUrl}" alt="bukti terima">
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; margin: 36px; -webkit-text-size-adjust: 100%; }
  .wrap { max-width: 780px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; border-bottom: 3px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
  .company { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .company img.logo { max-height: 56px; max-width: 130px; object-fit: contain; }
  .company h2 { margin: 0 0 3px; color: #1e3a5f; font-size: 19px; word-break: break-word; }
  .company p { margin: 2px 0; color: #555; font-size: 11.5px; word-break: break-word; }
  .doc-word { text-align: right; flex-shrink: 0; }
  .doc-word h1 { margin: 0; font-size: 24px; letter-spacing: 1px; color: #1e3a5f; }
  .meta { display: flex; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
  .meta .block { flex: 1; min-width: 0; }
  .meta .block.right { text-align: right; }
  .meta h4 { margin: 0 0 5px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .meta p { margin: 2px 0; word-break: break-word; }
  .meta .doc-no { font-size: 14.5px; font-weight: bold; color: #0f172a; margin-bottom: 3px; }
  .status-tag { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 4px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.items th { background: #1e3a5f; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; }
  table.items td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
  table.items td.desc { word-break: break-word; }
  table.items td.desc .item-note { font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px; }
  table.items th.center, table.items td.center { text-align: center; }
  .notes { background: #f8fafc; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; font-size: 12px; }
  .notes h4 { font-size: 10.5px; text-transform: uppercase; color: #64748b; margin: 0 0 4px; }
  .notes p { margin: 0; word-break: break-word; }
  .signatures { display: flex; justify-content: space-between; gap: 16px; margin-top: 22px; }
  .sign-box { flex: 1; text-align: center; font-size: 12px; }
  .sign-img { max-height: 64px; max-width: 150px; object-fit: contain; margin: 4px auto; display: block; }
  .sign-line { margin-top: 6px; border-top: 1px solid #0f172a; padding-top: 4px; font-weight: 600; }
  .sign-line.no-img { margin-top: 44px; font-weight: normal; color: #64748b; }
  .sign-time { font-size: 10.5px; color: #16a34a; margin-top: 2px; }
  .proof-section { margin-top: 18px; padding-top: 12px; border-top: 1px dashed #cbd5e1; }
  .proof-section h4 { font-size: 10.5px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing: .8px; }
  .proof-img { max-width: 260px; width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; display: block; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; text-align: center; margin-top: 18px; }
  @media (max-width: 480px) {
    body { margin: 14px; font-size: 12px; }
    .company img.logo { max-height: 40px; max-width: 85px; }
    .company h2 { font-size: 15px; }
    .doc-word h1 { font-size: 18px; }
    table.items th, table.items td { font-size: 11px; padding: 6px; }
    .sign-img { max-height: 52px; max-width: 120px; }
  }
</style></head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="company">
        ${company.logoUrl ? `<img class="logo" src="${company.logoUrl}" alt="logo">` : ''}
        <div>
          <h2>${escapeHtmlSj(company.name)}</h2>
          ${company.address ? `<p>${escapeHtmlSj(company.address)}</p>` : ''}
          ${company.phone ? `<p>Telp: ${escapeHtmlSj(company.phone)}</p>` : ''}
          ${company.email ? `<p>Email: ${escapeHtmlSj(company.email)}</p>` : ''}
        </div>
      </div>
      <div class="doc-word"><h1>SURAT<br>JALAN</h1></div>
    </div>

    <div class="meta">
      <div class="block">
        <h4>Dikirim kepada</h4>
        <p><strong>${escapeHtmlSj(invoice.clientName)}</strong></p>
        ${invoice.clientAddress ? `<p>${escapeHtmlSj(invoice.clientAddress)}</p>` : ''}
        ${invoice.clientPhone ? `<p>${escapeHtmlSj(invoice.clientPhone)}</p>` : ''}
      </div>
      <div class="block right">
        <h4>Detail Pengiriman</h4>
        <p class="doc-no">${escapeHtmlSj(deliveryNote.sjNumber)}</p>
        <p>Ref. Invoice: <strong>${escapeHtmlSj(deliveryNote.invoiceNumber)}</strong></p>
        <p>Tanggal Kirim: <strong>${escapeHtmlSj(deliveryNote.deliveryDate)}</strong></p>
        ${deliveryNote.courierName ? `<p>Kurir: <strong>${escapeHtmlSj(deliveryNote.courierName)}${deliveryNote.courierPhone ? ' (' + escapeHtmlSj(deliveryNote.courierPhone) + ')' : ''}</strong></p>` : ''}
        ${deliveryNote.packageCount ? `<p>Koli/Paket: <strong>${escapeHtmlSj(deliveryNote.packageCount)}</strong></p>` : ''}
        <span class="status-tag" style="background:${isDone ? '#dcfce7' : '#fef3c7'}; color:${isDone ? '#16a34a' : '#b45309'};">
          ${isDone ? 'DITERIMA' : 'DIKIRIM'}
        </span>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="center" style="width:36px">No</th>
          <th>Deskripsi Barang</th>
          <th class="center" style="width:60px">Qty</th>
          <th class="center" style="width:76px">Satuan</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    ${deliveryNote.notes ? `<div class="notes"><h4>Catatan Pengiriman</h4><p>${escapeHtmlSj(deliveryNote.notes)}</p></div>` : ''}

    <div class="signatures">
      <div class="sign-box">
        <div>Diterima oleh,</div>
        ${receiverSigHtml}
      </div>
      <div class="sign-box">
        <div>Pengirim,</div>
        ${senderSigHtml}
      </div>
    </div>

    ${proofHtml}

    <div class="footer">Mohon periksa kelengkapan barang saat diterima — ${escapeHtmlSj(company.name)}</div>
  </div>
</body></html>`;
};
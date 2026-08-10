/**
 * Template Penawaran Harga (Quotation) — turunan dari invoice-template.js,
 * disesuaikan: tanpa status Lunas/Belum Lunas, ada "Berlaku hingga", tanpa info pembayaran.
 */

// Galeri lampiran — gambar TIDAK dipotong/dipaksa pas kotak (object-fit tidak didukung
// html2canvas, penyebab gambar "ketarik" sebelumnya). Lebar dibatasi, tinggi menyesuaikan
// otomatis (rasio asli gambar tetap terjaga).
function attachmentsBlockHtml(attachments, title) {
  return `<div class="attach-section">
    <h4>${title}</h4>
    <div class="attach-grid">
      ${attachments.map(a => {
        const url = typeof a === 'string' ? a : a.url;
        const caption = typeof a === 'string' ? '' : (a.caption || '');
        return `<div class="attach-item"><img src="${url}" alt="">${caption ? `<div class="attach-caption">${escapeHtmlT(caption)}</div>` : ''}</div>`;
      }).join('')}
    </div>
  </div>`;
}

window.renderQuotationTemplate = function ({ quotation, company, cashier, currency, skipAttachments }) {
  const itemsRows = (quotation.items || []).map(item => `
    <tr>
      <td class="desc">${escapeHtmlT(item.desc)}</td>
      <td class="center">${item.qty}</td>
      <td class="center">${item.unit || '-'}</td>
      <td class="num">${currency} ${moneyT(item.price)}</td>
      <td class="num">${currency} ${moneyT(Number(item.qty) * Number(item.price))}</td>
    </tr>`).join('');

  const statusColor = { 'Diterima': ['#dcfce7', '#16a34a'], 'Ditolak': ['#fee2e2', '#ef4444'] }[quotation.status] || ['#fef3c7', '#b45309'];
  const signatureHtml = (cashier && cashier.signatureUrl)
    ? `<img class="sign-img" src="${cashier.signatureUrl}" alt="ttd"><div class="sign-line">${escapeHtmlT(cashier.name)}</div>`
    : `<div class="sign-line no-img">${escapeHtmlT(cashier ? cashier.name : company.name)}</div>`;

  const attachmentsHtml = (!skipAttachments && quotation.attachments && quotation.attachments.length)
    ? attachmentsBlockHtml(quotation.attachments, 'Lampiran / Referensi')
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; margin: 40px; }
  .invoice-wrap { max-width: 780px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 18px; }
  .company { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .company img.logo { max-height: 60px; max-width: 140px; object-fit: contain; }
  .company h2 { margin: 0 0 4px; color: #1e3a5f; font-size: 20px; word-break: break-word; }
  .company p { margin: 2px 0; color: #555; font-size: 12px; word-break: break-word; }
  .invoice-word { text-align: right; flex-shrink: 0; }
  .invoice-word h1 { margin: 0; font-size: 26px; letter-spacing: 1px; color: #1e3a5f; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .meta .block { flex: 1; min-width: 0; }
  .meta .block.right { text-align: right; }
  .meta h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .meta p { margin: 2px 0; word-break: break-word; }
  .meta .inv-number { font-size: 15px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
  .status-tag { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 4px; }
  .table-scroll { width: 100%; overflow-x: auto; }
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
  .notes h4 { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .notes p { word-break: break-word; margin: 2px 0; }
  .signature { display: flex; justify-content: flex-end; margin-top: 20px; }
  .signature .sign-box { text-align: center; font-size: 12px; }
  .signature .sign-img { max-height: 66px; max-width: 180px; object-fit: contain; margin: 4px auto; display: block; }
  .signature .sign-line { margin-top: 6px; border-top: 1px solid #0f172a; padding-top: 4px; min-width: 160px; }
  .signature .sign-line.no-img { margin-top: 40px; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; text-align: center; margin-top: 16px; }
  .disclaimer { background:#f8fafc; border-radius:8px; padding:10px 12px; font-size:11px; color:#64748b; margin-bottom:14px; }
  .attach-section { margin-bottom:18px; }
  .attach-section h4 { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing:1px; }
  .attach-grid { font-size:0; margin:0 -6px; }
  .attach-item { display:inline-block; width:48%; margin:0 1% 14px; vertical-align:top; font-size:12px; }
  .attach-grid img { width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0; display:block; }
  .attach-caption { font-size:10.5px; color:#64748b; text-align:center; margin-top:3px; }
  .attach-page-title { font-size:18px; font-weight:bold; color:#1e3a5f; margin:0 0 4px; }
  .attach-page-sub { font-size:12px; color:#64748b; margin:0 0 20px; }
  @media (max-width: 480px) {
    body { margin: 14px; font-size: 12.5px; } .header { gap: 8px; padding-bottom: 10px; margin-bottom: 14px; align-items: center; }
    .company img.logo { max-height: 44px; max-width: 90px; } .company h2 { font-size: 16px; } .company p { font-size: 10.5px; }
    .invoice-word h1 { font-size: 19px; } .meta { gap: 10px; margin-bottom: 14px; } .meta h4 { font-size: 10px; }
    .meta p { font-size: 11px; } table.items th, table.items td { font-size: 11px; padding: 6px; }
    .totals { width: 100%; } .totals div { font-size: 12.5px; } .totals .grand { font-size: 14px; }
  }
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
    <div class="invoice-word"><h1>PENAWARAN<br>HARGA</h1></div>
  </div>

  <div class="meta">
    <div class="block">
      <h4>Ditujukan kepada</h4>
      <p><strong>${escapeHtmlT(quotation.clientName)}</strong></p>
      ${quotation.clientAddress ? `<p>${escapeHtmlT(quotation.clientAddress)}</p>` : ''}
      ${quotation.clientEmail ? `<p>${escapeHtmlT(quotation.clientEmail)}</p>` : ''}
      ${quotation.clientPhone ? `<p>${escapeHtmlT(quotation.clientPhone)}</p>` : ''}
    </div>
    <div class="block right">
      <h4>Detail Penawaran</h4>
      <p class="inv-number">${escapeHtmlT(quotation.quotationNumber)}</p>
      <p>Tanggal: <strong>${escapeHtmlT(quotation.quotationDate)}</strong></p>
      ${quotation.validUntil ? `<p>Berlaku hingga: <strong>${escapeHtmlT(quotation.validUntil)}</strong></p>` : ''}
      ${cashier ? `<p>Dipersiapkan oleh: <strong>${escapeHtmlT(cashier.name)}</strong></p>` : ''}
      <span class="status-tag" style="background:${statusColor[0]}; color:${statusColor[1]};">${escapeHtmlT((quotation.status || 'Menunggu').toUpperCase())}</span>
    </div>
  </div>

  <div class="disclaimer">Dokumen ini adalah penawaran harga, bukan invoice/tagihan resmi. Harga berlaku hingga tanggal di atas dan dapat berubah sewaktu-waktu.</div>

  <div class="table-scroll">
  <table class="items">
    <thead><tr><th>Deskripsi</th><th class="center">Qty</th><th class="center">Satuan</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  </div>

  <div class="totals">
    <div><span>Subtotal</span><strong>${currency} ${moneyT(quotation.subtotal)}</strong></div>
    ${quotation.discount > 0 ? `<div><span>Diskon</span><strong>- ${currency} ${moneyT(quotation.discount)}</strong></div>` : ''}
    ${quotation.taxPercent > 0 ? `<div><span>Pajak (${quotation.taxPercent}%)</span><strong>${currency} ${moneyT(quotation.taxAmount)}</strong></div>` : ''}
    <div class="grand"><span>Total</span><span>${currency} ${moneyT(quotation.total)}</span></div>
  </div>

  <div class="info-row">
    ${quotation.notes ? `<div class="notes"><h4>Catatan</h4><p>${escapeHtmlT(quotation.notes)}</p></div>` : ''}
  </div>

  ${attachmentsHtml}

  <div class="signature"><div class="sign-box"><div>Hormat kami,</div>${signatureHtml}</div></div>


  <div class="footer"><p>Terima kasih atas kepercayaan Anda kepada ${escapeHtmlT(company.name)}</p></div>
  </div>
</body></html>`;
};

// Halaman terpisah khusus lampiran — dipakai sebagai HALAMAN KE-2 di PDF saat lampiran ada,
// supaya halaman pertama (rincian harga) tidak jadi kepanjangan.
window.renderQuotationAttachmentsPage = function ({ quotation, company, attachments }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; margin: 40px; }
  .invoice-wrap { max-width: 780px; margin: 0 auto; }
  .attach-page-title { font-size:18px; font-weight:bold; color:#1e3a5f; margin:0 0 4px; }
  .attach-page-sub { font-size:12px; color:#64748b; margin:0 0 20px; }
  .attach-section h4 { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing:1px; }
  .attach-grid { font-size:0; margin:0 -6px; }
  .attach-item { display:inline-block; width:48%; margin:0 1% 14px; vertical-align:top; font-size:12px; }
  .attach-grid img { width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0; display:block; }
  .attach-caption { font-size:10.5px; color:#64748b; text-align:center; margin-top:3px; }
</style></head>
<body>
  <div class="invoice-wrap">
    <div class="attach-page-title">Lampiran / Referensi</div>
    <div class="attach-page-sub">${escapeHtmlT(quotation.quotationNumber)} — ${escapeHtmlT(company.name)}</div>
    ${attachmentsBlockHtml(attachments, 'Gambar Terlampir')}
  </div>
</body></html>`;
};

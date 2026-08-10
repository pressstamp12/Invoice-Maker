/**
 * INVOICE MAKER — API layer (pengganti Code.gs / Apps Script)
 * Semua fungsi di sini adalah versi Supabase dari fungsi server GAS asli,
 * dengan nama & perilaku yang sama persis, supaya app.js (UI logic)
 * tidak perlu berubah banyak.
 */
(function () {
  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.sb = sb;

  const num = v => parseFloat(v) || 0;
  const nowIso = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);
  const pad = (n, len) => String(n).padStart(len || 4, '0');

  function fmtDate(v) {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }
  function ok(x) { if (x.error) throw new Error(x.error.message); return x.data; }

  /* ============ ID GENERATION (pengganti nextId_) ============ */
  async function nextId(table, idCol, prefix, padLen) {
    const { data, error } = await sb.from(table).select(idCol);
    if (error) throw new Error(error.message);
    let n = 1;
    const nums = (data || [])
      .map(r => r[idCol])
      .filter(id => typeof id === 'string' && id.indexOf(prefix) === 0)
      .map(id => parseInt(id.split('-').pop(), 10))
      .filter(x => !isNaN(x));
    if (nums.length) n = Math.max.apply(null, nums) + 1;
    return prefix + pad(n, padLen || 4);
  }

  /* ============ AUTH ============ */
  async function signIn(email, password) {
    return ok(await sb.auth.signInWithPassword({ email, password }));
  }
  async function signOut() { await sb.auth.signOut(); }
  async function getSession() { return (await sb.auth.getSession()).data.session; }
  function onAuthChange(cb) { sb.auth.onAuthStateChange((_e, session) => cb(session)); }

  /* ============ BANK ACCOUNTS ============ */
  async function getBankAccounts() {
    const data = ok(await sb.from('bank_accounts').select('*').order('created_at', { ascending: false }));
    return data.map(r => ({ bankId: r.bank_id, bankName: r.bank_name, accountNumber: r.account_number, accountHolder: r.account_holder, label: r.label || '' }));
  }
  async function saveBankAccount(b) {
    if (!b.bankName || !b.bankName.trim()) throw new Error('Nama bank wajib diisi.');
    if (!b.accountNumber || !String(b.accountNumber).trim()) throw new Error('Nomor rekening wajib diisi.');
    if (!b.accountHolder || !b.accountHolder.trim()) throw new Error('Nama pemilik rekening wajib diisi.');
    const id = (b.bankId && b.bankId.trim()) ? b.bankId : await nextId('bank_accounts', 'bank_id', 'BNK-');
    ok(await sb.from('bank_accounts').upsert({
      bank_id: id, bank_name: b.bankName.trim(), account_number: String(b.accountNumber).trim(),
      account_holder: b.accountHolder.trim(), label: (b.label || '').trim()
    }));
    return { success: true, bankId: id };
  }
  async function deleteBankAccount(id) {
    await sb.from('companies').update({ default_bank_id: null }).eq('default_bank_id', id);
    const { error } = await sb.from('bank_accounts').delete().eq('bank_id', id);
    if (error) throw new Error('Rekening tidak ditemukan.');
    return { success: true };
  }
  async function getBankById(id) {
    if (!id) return null;
    const list = await getBankAccounts();
    return list.find(b => b.bankId === id) || null;
  }
  function formatBankLine(b) {
    if (!b) return '';
    const base = b.bankName + ' ' + b.accountNumber + ' a.n. ' + b.accountHolder;
    return b.label ? (b.label + ': ' + base) : base;
  }

  /* ============ COMPANIES ============ */
  async function getCompanies() {
    const data = ok(await sb.from('companies').select('*').order('created_at'));
    return data.map(r => ({
      companyId: r.company_id, name: r.name, address: r.address, phone: r.phone, email: r.email,
      bank: r.bank, logoUrl: r.logo_url, currency: r.currency || 'Rp', defaultBankId: r.default_bank_id || ''
    }));
  }
  async function saveCompany(c) {
    if (!c.name || !c.name.trim()) throw new Error('Nama perusahaan wajib diisi.');
    const id = (c.companyId && c.companyId.trim()) ? c.companyId : await nextId('companies', 'company_id', 'CMP-');
    ok(await sb.from('companies').upsert({
      company_id: id, name: c.name.trim(), address: c.address || '', phone: c.phone || '', email: c.email || '',
      bank: c.bank || '', logo_url: c.logoUrl || '', currency: c.currency || 'Rp', default_bank_id: c.defaultBankId || null
    }));
    return { success: true, companyId: id };
  }
  async function deleteCompany(id) {
    const { error } = await sb.from('companies').delete().eq('company_id', id);
    if (error) throw new Error('Perusahaan tidak ditemukan.');
    return { success: true };
  }
  async function getCompanyById(id) {
    const list = await getCompanies();
    return list.find(c => c.companyId === id) || list[0] || {
      companyId: '', name: 'Nama Perusahaan Anda', address: '', phone: '', email: '', bank: '', logoUrl: '', currency: 'Rp', defaultBankId: ''
    };
  }

  /* ============ CASHIERS ============ */
  async function getCashiers() {
    const data = ok(await sb.from('cashiers').select('*').order('created_at'));
    return data.map(r => ({ cashierId: r.cashier_id, name: r.name, phone: r.phone, signatureUrl: r.signature_url || '' }));
  }
  async function saveCashier(c) {
    if (!c.name || !c.name.trim()) throw new Error('Nama kasir wajib diisi.');
    const id = (c.cashierId && c.cashierId.trim()) ? c.cashierId : await nextId('cashiers', 'cashier_id', 'CSH-');
    ok(await sb.from('cashiers').upsert({ cashier_id: id, name: c.name.trim(), phone: c.phone || '', signature_url: c.signatureUrl || '' }));
    return { success: true, cashierId: id };
  }
  async function deleteCashier(id) {
    const { error } = await sb.from('cashiers').delete().eq('cashier_id', id);
    if (error) throw new Error('Kasir tidak ditemukan.');
    return { success: true };
  }
  async function getCashierById(id) {
    if (!id) return null;
    const list = await getCashiers();
    return list.find(c => c.cashierId === id) || null;
  }

  /* ============ SETTINGS ============ */
  async function getSettings() {
    const [companies, cashiers, bankAccounts, currencyRow, activeAccounts] = await Promise.all([
      getCompanies(), getCashiers(), getBankAccounts(),
      sb.from('app_settings').select('value').eq('key', 'CURRENCY').maybeSingle(),
      getActiveAccounts()
    ]);
    return {
      currency: (currencyRow.data && currencyRow.data.value) || (companies[0] && companies[0].currency) || 'Rp',
      companies, cashiers, bankAccounts, activeAccounts
    };
  }
  async function saveGlobalSettings(s) {
    ok(await sb.from('app_settings').upsert({ key: 'CURRENCY', value: s.currency || 'Rp' }));
    return { success: true };
  }

  /* ============ NOMOR INVOICE ============ */
  async function generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const { data, error } = await sb.from('invoices').select('invoice_number').like('invoice_number', `INV-${year}-%`);
    if (error) throw new Error(error.message);
    let next = 1;
    const nums = (data || []).map(r => parseInt(r.invoice_number.split('-')[2], 10)).filter(n => !isNaN(n));
    if (nums.length) next = Math.max.apply(null, nums) + 1;
    return 'INV-' + year + '-' + pad(next, 4);
  }

  /* ============ CRUD INVOICE ============ */
  async function saveInvoice(data) {
    if (!data.items || !data.items.length) throw new Error('Invoice harus memiliki minimal 1 item.');
    if (!data.clientName || !data.clientName.trim()) throw new Error('Nama klien wajib diisi.');

    let subtotal = 0;
    data.items.forEach(it => { subtotal += num(it.qty) * num(it.price); });
    const taxPercent = num(data.taxPercent), discount = num(data.discount);
    const taxAmount = Math.max(subtotal - discount, 0) * (taxPercent / 100);
    const total = Math.max(subtotal - discount, 0) + taxAmount;

    const isEdit = !!(data.invoiceNumber && data.invoiceNumber.trim());
    const invNo = isEdit ? data.invoiceNumber : await generateInvoiceNumber();

    let createdAt = nowIso();
    let existingStatus = null;
    if (isEdit) {
      const existing = await sb.from('invoices').select('created_at, status').eq('invoice_number', invNo).maybeSingle();
      if (existing.data) {
        if (existing.data.created_at) createdAt = existing.data.created_at;
        existingStatus = existing.data.status;
      }
    }
    // Form Edit Invoice tidak punya field status, jadi JANGAN timpa status
    // yang sudah ada (mis. Paid) hanya karena data.status kosong.
    const status = data.status || existingStatus || 'Unpaid';

    ok(await sb.from('invoices').upsert({
      invoice_number: invNo, invoice_date: data.invoiceDate || today(), due_date: data.dueDate || null,
      client_name: data.clientName, client_address: data.clientAddress || '', client_email: data.clientEmail || '',
      client_phone: data.clientPhone || '', items_json: data.items, notes: data.notes || '',
      tax_percent: taxPercent, discount, subtotal, tax_amount: taxAmount, total,
      status, created_at: createdAt,
      company_id: data.companyId || null, cashier_id: data.cashierId || null
    }));

    try { await upsertCustomerFromInvoice(data); } catch (e) { console.warn('Gagal simpan data customer:', e.message); }

    return { success: true, invoiceNumber: invNo, total };
  }

  /* ============ CUSTOMERS (untuk autofill repeat order) ============ */
  async function getCustomers() {
    const data = ok(await sb.from('customers').select('*').order('name'));
    return data.map(r => ({ customerId: r.customer_id, name: r.name, phone: r.phone || '', email: r.email || '', address: r.address || '' }));
  }
  async function upsertCustomerFromInvoice(data) {
    if (!data.clientName || !data.clientName.trim()) return;
    const name = data.clientName.trim();
    const { data: existing } = await sb.from('customers').select('customer_id').ilike('name', name).maybeSingle();
    if (existing) {
      ok(await sb.from('customers').update({
        phone: data.clientPhone || '', email: data.clientEmail || '', address: data.clientAddress || '', updated_at: nowIso()
      }).eq('customer_id', existing.customer_id));
    } else {
      const id = await nextId('customers', 'customer_id', 'CLI-');
      ok(await sb.from('customers').insert({
        customer_id: id, name, phone: data.clientPhone || '', email: data.clientEmail || '', address: data.clientAddress || ''
      }));
    }
  }

  async function getInvoiceList() {
    const [invRows, purchases, cashiers, companies] = await Promise.all([
      sb.from('invoices').select('invoice_number, invoice_date, client_name, total, status, subtotal, discount, company_id, cashier_id, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }).then(ok),
      sb.from('purchases').select('invoice_number,total_cost').then(ok),
      getCashiers(), getCompanies()
    ]);
    const hppMap = {};
    purchases.forEach(p => { hppMap[p.invoice_number] = (hppMap[p.invoice_number] || 0) + num(p.total_cost); });

    return invRows.map(row => {
      const revenue = Math.max(num(row.subtotal) - num(row.discount), 0);
      const hppTotal = hppMap[row.invoice_number];
      const cashier = cashiers.find(c => c.cashierId === row.cashier_id);
      const company = companies.find(c => c.companyId === row.company_id);
      return {
        invoiceNumber: row.invoice_number, invoiceDate: fmtDate(row.invoice_date),
        clientName: row.client_name, total: row.total, status: row.status,
        cashierName: cashier ? cashier.name : '',
        companyId: row.company_id || '', companyName: company ? company.name : '',
        source: String(row.invoice_number).indexOf('IMP-') === 0 ? 'import' : 'manual',
        hppFilled: hppTotal !== undefined, hppTotal: hppTotal || 0,
        profit: hppTotal !== undefined ? (revenue - hppTotal) : null
      };
    });
  }

  async function getDeletedInvoices() {
    const [invRows, companies] = await Promise.all([
      sb.from('invoices').select('invoice_number, invoice_date, client_name, total, status, company_id, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }).then(ok),
      getCompanies()
    ]);
    return invRows.map(row => {
      const company = companies.find(c => c.companyId === row.company_id);
      return {
        invoiceNumber: row.invoice_number, invoiceDate: fmtDate(row.invoice_date),
        clientName: row.client_name, total: row.total, status: row.status,
        companyId: row.company_id || '', companyName: company ? company.name : '',
        deletedAt: row.deleted_at
      };
    });
  }

  async function getInvoiceByNumber(invNo) {
    const { data, error } = await sb.from('invoices').select('*').eq('invoice_number', invNo).maybeSingle();
    if (error || !data) throw new Error('Invoice tidak ditemukan: ' + invNo);
    return {
      invoiceNumber: data.invoice_number, invoiceDate: fmtDate(data.invoice_date), dueDate: fmtDate(data.due_date),
      clientName: data.client_name, clientAddress: data.client_address, clientEmail: data.client_email, clientPhone: data.client_phone,
      items: data.items_json || [], notes: data.notes, taxPercent: data.tax_percent, discount: data.discount,
      subtotal: data.subtotal, taxAmount: data.tax_amount, total: data.total, status: data.status, createdAt: data.created_at,
      companyId: data.company_id, cashierId: data.cashier_id
    };
  }

  // Pindahkan ke Sampah (soft-delete) — invoice, HPP, dan riwayat kas tetap utuh, bisa dipulihkan.
  async function deleteInvoice(invNo) {
    const { error } = await sb.from('invoices').update({ deleted_at: nowIso() }).eq('invoice_number', invNo);
    if (error) throw new Error('Invoice tidak ditemukan.');
    return { success: true };
  }
  async function restoreInvoice(invNo) {
    const { error } = await sb.from('invoices').update({ deleted_at: null }).eq('invoice_number', invNo);
    if (error) throw new Error('Invoice tidak ditemukan.');
    return { success: true };
  }
  // Hapus permanen dari Sampah — tidak bisa dibatalkan, HPP & riwayat kas terkait ikut terhapus.
  async function permanentlyDeleteInvoice(invNo) {
    const { error } = await sb.from('invoices').delete().eq('invoice_number', invNo);
    if (error) throw new Error('Invoice tidak ditemukan.');
    await deleteHppCashFlows(invNo);
    return { success: true };
  }
  async function updateInvoiceStatus(invNo, status) {
    const { error } = await sb.from('invoices').update({ status }).eq('invoice_number', invNo);
    if (error) throw new Error('Invoice tidak ditemukan.');
    return { success: true };
  }

  /* ============ PREVIEW / PDF / JPG (pengganti HtmlService + Drive) ============ */
  async function toDataUri(url, timeoutMs) {
    if (!url) return url;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return url;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(url); // gagal baca -> fallback ke URL asli, jangan sampai macet
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return url; // timeout / CORS diblokir total -> fallback ke URL asli
    }
  }

  // Versi RINGAN untuk preview di layar — pakai URL gambar apa adanya, cepat & tidak pernah macet.
  async function buildInvoiceHtml(invNo) {
    const invoice = await getInvoiceByNumber(invNo);
    const company = await getCompanyById(invoice.companyId);
    const defBank = company.defaultBankId ? await getBankById(company.defaultBankId) : null;
    const cashier = invoice.cashierId ? await getCashierById(invoice.cashierId) : null;
    const currency = company.currency || 'Rp';
    const bankLine = defBank ? formatBankLine(defBank) : (company.bank || '');
    return window.renderInvoiceTemplate({ invoice, company, cashier, currency, bankLine });
  }
  async function getInvoicePreviewHtml(invNo) { return buildInvoiceHtml(invNo); }

  // Versi KHUSUS untuk export (PDF/JPG) — logo & ttd diubah jadi data URI dulu
  // (dengan timeout, supaya tidak macet kalau server gambar lambat/CORS diblokir).
  async function buildInvoiceHtmlForCapture(invNo) {
    const invoice = await getInvoiceByNumber(invNo);
    const company = await getCompanyById(invoice.companyId);
    const defBank = company.defaultBankId ? await getBankById(company.defaultBankId) : null;
    const cashier = invoice.cashierId ? await getCashierById(invoice.cashierId) : null;
    const currency = company.currency || 'Rp';
    const bankLine = defBank ? formatBankLine(defBank) : (company.bank || '');

    const [logoData, sigData] = await Promise.all([
      toDataUri(company.logoUrl),
      cashier ? toDataUri(cashier.signatureUrl) : Promise.resolve(null)
    ]);
    const companyForRender = Object.assign({}, company, { logoUrl: logoData });
    const cashierForRender = cashier ? Object.assign({}, cashier, { signatureUrl: sigData }) : null;
    return window.renderInvoiceTemplate({ invoice, company: companyForRender, cashier: cashierForRender, currency, bankLine });
  }

  async function waitImagesLoaded(doc, timeoutMs) {
    const imgs = Array.from((doc && doc.images) || []);
    if (!imgs.length) return;
    await Promise.race([
      Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      }))),
      new Promise(res => setTimeout(res, timeoutMs || 3000))
    ]);
  }

  // Batas waktu keseluruhan: kalau proses (mis. html2canvas) macet tanpa batas,
  // ini memaksa gagal dengan pesan jelas alih-alih layar loading nyangkut selamanya.
  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error((label || 'Proses') + ' terlalu lama (timeout). Coba lagi.')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function renderHtmlToCanvas(html) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:420px;border:0;';
    document.body.appendChild(iframe);
    try {
      iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
      await waitImagesLoaded(iframe.contentDocument, 3000);
      return await html2canvas(iframe.contentDocument.body, { scale: 2, backgroundColor: '#fff', useCORS: true, allowTaint: true });
    } finally {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe); // selalu dibersihkan, sukses ataupun gagal
    }
  }
  async function renderInvoiceToCanvas(invNo) {
    return renderHtmlToCanvas(await buildInvoiceHtmlForCapture(invNo));
  }

  async function generateInvoicePdf(invNo) {
    const canvas = await withTimeout(renderInvoiceToCanvas(invNo), 20000, 'Membuat PDF');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'px', format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2);
    const base64 = pdf.output('datauristring').split(',')[1];
    return { filename: invNo + '.pdf', base64 };
  }
  async function generateInvoiceJpg(invNo) {
    const canvas = await withTimeout(renderInvoiceToCanvas(invNo), 20000, 'Membuat JPG');
    return { filename: invNo + '.jpg', dataUrl: canvas.toDataURL('image/jpeg', 0.92) };
  }

  async function uploadToStorage(path, blob, contentType) {
    const { error } = await sb.storage.from('invoice-files').upload(path, blob, { upsert: true, contentType });
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from('invoice-files').getPublicUrl(path);
    return { url: data.publicUrl, downloadUrl: data.publicUrl };
  }
  function b64ToBlob(b64, type) {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type });
  }
  async function savePdfToDrive(invNo) {
    const res = await generateInvoicePdf(invNo);
    return uploadToStorage('pdf/' + invNo + '.pdf', b64ToBlob(res.base64, 'application/pdf'), 'application/pdf');
  }
  async function saveJpgToDrive(invNo) {
    const res = await generateInvoiceJpg(invNo);
    return uploadToStorage('jpg/' + invNo + '.jpg', b64ToBlob(res.dataUrl.split(',')[1], 'image/jpeg'), 'image/jpeg');
  }

  /* ============ PENAWARAN HARGA (Quotation) ============ */
  async function generateQuotationNumber() {
    const year = new Date().getFullYear();
    const { data, error } = await sb.from('quotations').select('quotation_number').like('quotation_number', `QUO-${year}-%`);
    if (error) throw new Error(error.message);
    let next = 1;
    const nums = (data || []).map(r => parseInt(r.quotation_number.split('-')[2], 10)).filter(n => !isNaN(n));
    if (nums.length) next = Math.max.apply(null, nums) + 1;
    return 'QUO-' + year + '-' + pad(next, 4);
  }
  async function saveQuotation(data) {
    if (!data.items || !data.items.length) throw new Error('Penawaran harus memiliki minimal 1 item.');
    if (!data.clientName || !data.clientName.trim()) throw new Error('Nama klien wajib diisi.');
    let subtotal = 0;
    data.items.forEach(it => { subtotal += num(it.qty) * num(it.price); });
    const taxPercent = num(data.taxPercent), discount = num(data.discount);
    const taxAmount = Math.max(subtotal - discount, 0) * (taxPercent / 100);
    const total = Math.max(subtotal - discount, 0) + taxAmount;
    const isEdit = !!(data.quotationNumber && data.quotationNumber.trim());
    const qNo = isEdit ? data.quotationNumber : await generateQuotationNumber();
    let createdAt = nowIso(), existingStatus = null;
    if (isEdit) {
      const existing = await sb.from('quotations').select('created_at, status').eq('quotation_number', qNo).maybeSingle();
      if (existing.data) { if (existing.data.created_at) createdAt = existing.data.created_at; existingStatus = existing.data.status; }
    }
    ok(await sb.from('quotations').upsert({
      quotation_number: qNo, quotation_date: data.quotationDate || today(), valid_until: data.validUntil || null,
      client_name: data.clientName, client_address: data.clientAddress || '', client_email: data.clientEmail || '',
      client_phone: data.clientPhone || '', items_json: data.items, notes: data.notes || '',
      tax_percent: taxPercent, discount, subtotal, tax_amount: taxAmount, total,
      status: data.status || existingStatus || 'Menunggu', created_at: createdAt,
      company_id: data.companyId || null, cashier_id: data.cashierId || null,
      attachments: data.attachments || []
    }));
    try { await upsertCustomerFromInvoice(data); } catch (e) { console.warn('Gagal simpan data customer:', e.message); }
    return { success: true, quotationNumber: qNo, total };
  }
  async function getQuotationList() {
    const data = ok(await sb.from('quotations').select('*').order('created_at', { ascending: false }));
    const [cashiers, companies] = await Promise.all([getCashiers(), getCompanies()]);
    return data.map(row => {
      const cashier = cashiers.find(c => c.cashierId === row.cashier_id);
      const company = companies.find(c => c.companyId === row.company_id);
      return {
        quotationNumber: row.quotation_number, quotationDate: fmtDate(row.quotation_date), validUntil: fmtDate(row.valid_until),
        clientName: row.client_name, total: row.total, status: row.status,
        cashierName: cashier ? cashier.name : '', companyId: row.company_id || '', companyName: company ? company.name : '',
        convertedInvoiceNumber: row.converted_invoice_number || ''
      };
    });
  }
  async function getQuotationByNumber(qNo) {
    const { data, error } = await sb.from('quotations').select('*').eq('quotation_number', qNo).maybeSingle();
    if (error || !data) throw new Error('Penawaran tidak ditemukan: ' + qNo);
    return {
      quotationNumber: data.quotation_number, quotationDate: fmtDate(data.quotation_date), validUntil: fmtDate(data.valid_until),
      clientName: data.client_name, clientAddress: data.client_address, clientEmail: data.client_email, clientPhone: data.client_phone,
      items: data.items_json || [], notes: data.notes, taxPercent: data.tax_percent, discount: data.discount,
      subtotal: data.subtotal, taxAmount: data.tax_amount, total: data.total, status: data.status,
      companyId: data.company_id, cashierId: data.cashier_id, convertedInvoiceNumber: data.converted_invoice_number || '',
      attachments: data.attachments || []
    };
  }
  async function deleteQuotation(qNo) {
    const { error } = await sb.from('quotations').delete().eq('quotation_number', qNo);
    if (error) throw new Error('Penawaran tidak ditemukan.');
    return { success: true };
  }
  async function updateQuotationStatus(qNo, status) {
    const { error } = await sb.from('quotations').update({ status }).eq('quotation_number', qNo);
    if (error) throw new Error('Penawaran tidak ditemukan.');
    return { success: true };
  }
  async function markQuotationConverted(qNo, invoiceNumber) {
    await sb.from('quotations').update({ status: 'Diterima', converted_invoice_number: invoiceNumber }).eq('quotation_number', qNo);
    return { success: true };
  }

  async function buildQuotationHtml(qNo) {
    const quotation = await getQuotationByNumber(qNo);
    const company = await getCompanyById(quotation.companyId);
    const cashier = quotation.cashierId ? await getCashierById(quotation.cashierId) : null;
    const currency = company.currency || 'Rp';
    return window.renderQuotationTemplate({ quotation, company, cashier, currency });
  }
  async function getQuotationPreviewHtml(qNo) { return buildQuotationHtml(qNo); }
  async function prepareQuotationRenderData(qNo) {
    const quotation = await getQuotationByNumber(qNo);
    const company = await getCompanyById(quotation.companyId);
    const cashier = quotation.cashierId ? await getCashierById(quotation.cashierId) : null;
    const currency = company.currency || 'Rp';
    const attachmentUrls = (quotation.attachments || []).map(a => (typeof a === 'string' ? a : a.url));
    const [logoData, sigData, attachmentData] = await Promise.all([
      toDataUri(company.logoUrl), cashier ? toDataUri(cashier.signatureUrl) : Promise.resolve(null),
      Promise.all(attachmentUrls.map(u => toDataUri(u)))
    ]);
    const companyForRender = Object.assign({}, company, { logoUrl: logoData });
    const cashierForRender = cashier ? Object.assign({}, cashier, { signatureUrl: sigData }) : null;
    const attachmentsForRender = (quotation.attachments || []).map((a, i) => ({
      url: attachmentData[i], caption: (typeof a === 'string' ? '' : (a.caption || ''))
    }));
    const quotationForRender = Object.assign({}, quotation, { attachments: attachmentsForRender });
    return { quotation: quotationForRender, company: companyForRender, cashier: cashierForRender, currency, attachments: attachmentsForRender };
  }
  async function buildQuotationHtmlForCapture(qNo) {
    const d = await prepareQuotationRenderData(qNo);
    return window.renderQuotationTemplate({ quotation: d.quotation, company: d.company, cashier: d.cashier, currency: d.currency });
  }
  async function renderQuotationToCanvas(qNo) {
    return renderHtmlToCanvas(await buildQuotationHtmlForCapture(qNo));
  }
  async function generateQuotationPdf(qNo) {
    const canvas1 = await withTimeout((async () => {
      const d = await prepareQuotationRenderData(qNo);
      const html = window.renderQuotationTemplate({ quotation: d.quotation, company: d.company, cashier: d.cashier, currency: d.currency, skipAttachments: d.attachments.length > 0 });
      return { canvas: await renderHtmlToCanvas(html), data: d };
    })(), 20000, 'Membuat PDF');
    const { jsPDF } = window.jspdf;
    const c1 = canvas1.canvas, d = canvas1.data;
    const pdf = new jsPDF({ unit: 'px', format: [c1.width / 2, c1.height / 2] });
    pdf.addImage(c1.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, c1.width / 2, c1.height / 2);
    // Lampiran (kalau ada) jadi halaman ke-2 terpisah, supaya halaman rincian harga tidak kepanjangan.
    if (d.attachments.length) {
      const attachHtml = window.renderQuotationAttachmentsPage({ quotation: d.quotation, company: d.company, attachments: d.attachments });
      const c2 = await withTimeout(renderHtmlToCanvas(attachHtml), 20000, 'Membuat halaman lampiran');
      pdf.addPage([c2.width / 2, c2.height / 2]);
      pdf.addImage(c2.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, c2.width / 2, c2.height / 2);
    }
    const base64 = pdf.output('datauristring').split(',')[1];
    return { filename: qNo + '.pdf', base64 };
  }
  async function generateQuotationJpg(qNo) {
    const canvas = await withTimeout(renderQuotationToCanvas(qNo), 20000, 'Membuat JPG');
    return { filename: qNo + '.jpg', dataUrl: canvas.toDataURL('image/jpeg', 0.92) };
  }
  async function saveQuotationPdfToDrive(qNo) {
    const res = await generateQuotationPdf(qNo);
    return uploadToStorage('quotation-pdf/' + qNo + '.pdf', b64ToBlob(res.base64, 'application/pdf'), 'application/pdf');
  }
  async function saveQuotationJpgToDrive(qNo) {
    const res = await generateQuotationJpg(qNo);
    return uploadToStorage('quotation-jpg/' + qNo + '.jpg', b64ToBlob(res.dataUrl.split(',')[1], 'image/jpeg'), 'image/jpeg');
  }

  async function uploadImage(file, folder) {
    if (!file) throw new Error('Tidak ada file dipilih.');
    if (!file.type || file.type.indexOf('image/') !== 0) throw new Error('File harus berupa gambar (JPG/PNG/dll).');
    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) throw new Error('Ukuran gambar maksimal 3MB.');
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || '');
    const ext = (extMatch ? extMatch[1] : 'png').toLowerCase();
    const safeFolder = (folder || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '') || 'uploads';
    const path = safeFolder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await sb.storage.from('invoice-files').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from('invoice-files').getPublicUrl(path);
    return { url: data.publicUrl };
  }

  async function getItemBranchPrices(itemId) {
    const { data, error } = await sb.from('item_branch_prices').select('company_id, price').eq('item_id', itemId);
    if (error) throw new Error(error.message);
    const map = {};
    (data || []).forEach(r => { map[r.company_id] = r.price; });
    return map;
  }
  async function saveItemBranchPrices(itemId, pricesMap) {
    const companyIds = Object.keys(pricesMap || {});
    for (const cid of companyIds) {
      const p = pricesMap[cid];
      if (p === null || p === undefined || p === '') {
        await sb.from('item_branch_prices').delete().eq('item_id', itemId).eq('company_id', cid);
      } else {
        await sb.from('item_branch_prices').upsert({ item_id: itemId, company_id: cid, price: num(p) });
      }
    }
    return { success: true };
  }

  /* ============ MASTER ITEM ============ */
  async function getItems() {
    const data = ok(await sb.from('items').select('*').order('created_at', { ascending: false }));
    return data.map(r => ({
      itemId: r.item_id, itemName: r.item_name, category: r.category, defaultPrice: r.default_price, unit: r.unit,
      minOrder: r.min_order || 1, terms: r.terms || '', imageUrl: r.image_url || '', itemType: r.item_type || 'barang', description: r.description || ''
    }));
  }
  async function saveItem(item) {
    if (!item.itemName || !item.itemName.trim()) throw new Error('Nama item wajib diisi.');
    const id = (item.itemId && item.itemId.trim()) ? item.itemId : await nextId('items', 'item_id', 'ITM-');
    ok(await sb.from('items').upsert({
      item_id: id, item_name: item.itemName.trim(), category: item.category || '', default_price: num(item.defaultPrice),
      unit: item.unit || '', min_order: num(item.minOrder) > 0 ? num(item.minOrder) : 1, terms: item.terms || '',
      image_url: item.imageUrl || '', item_type: item.itemType || 'barang', description: item.description || ''
    }));
    return { success: true, itemId: id };
  }
  async function deleteItem(id) {
    const { error } = await sb.from('items').delete().eq('item_id', id);
    if (error) throw new Error('Item tidak ditemukan.');
    return { success: true };
  }

  /* ============ HPP / PURCHASES ============ */
  async function getPurchasesByInvoice(invNo) {
    const rows = ok(await sb.from('purchases').select('*').eq('invoice_number', invNo));
    if (!rows.length) return { items: [], others: [] };
    const flows = ok(await sb.from('cash_flow').select('*').eq('invoice_number', invNo).eq('source_type', 'hpp'));
    const accByItem = {}, accByOther = {};
    flows.forEach(f => {
      const note = String(f.note || '');
      if (note.indexOf('Modal: ') === 0) accByItem[note.substring(7).split(' — ')[0]] = f.account_id;
      else if (note.indexOf('Biaya: ') === 0) accByOther[note.substring(7).split(' — ')[0]] = f.account_id;
    });
    const items = [], others = [];
    rows.forEach(r => {
      if ((r.type || 'item') === 'other') others.push({ itemDesc: r.item_desc, totalCost: r.total_cost, accountId: accByOther[r.item_desc] || '' });
      else items.push({ itemDesc: r.item_desc, qty: r.qty, costPrice: r.cost_price, totalCost: r.total_cost, accountId: accByItem[r.item_desc] || '' });
    });
    return { items, others };
  }

  async function savePurchases(invNo, items, others) {
    await sb.from('purchases').delete().eq('invoice_number', invNo);
    const rows = [];
    (items || []).forEach(it => {
      const qty = num(it.qty), cost = num(it.costPrice);
      rows.push({ invoice_number: invNo, item_desc: it.itemDesc, qty, cost_price: cost, total_cost: qty * cost, type: 'item' });
    });
    (others || []).forEach(o => {
      if (o.itemDesc && o.itemDesc.trim())
        rows.push({ invoice_number: invNo, item_desc: o.itemDesc.trim(), qty: null, cost_price: null, total_cost: num(o.totalCost), type: 'other' });
    });
    if (rows.length) ok(await sb.from('purchases').insert(rows));
    await syncHppCashFlows(invNo, items, others);
    return { success: true };
  }

  async function syncHppCashFlows(invNo, items, others) {
    await deleteHppCashFlows(invNo);
    const dateStr = await getInvoiceDateStr(invNo);
    const accounts = await getAccountsRaw();
    const valid = {}; accounts.forEach(a => { valid[a.accountId] = true; });

    const makeFlow = async (accountId, amount, desc) => {
      if (!accountId || !valid[accountId]) return;
      const amt = num(amount);
      if (amt <= 0) return;
      await saveCashFlow({ date: dateStr, type: 'out', accountId, amount: amt, category: 'HPP', note: desc + ' — ' + invNo, invoiceNumber: invNo, sourceType: 'hpp' });
    };
    for (const it of (items || [])) await makeFlow(it.accountId, num(it.qty) * num(it.costPrice), 'Modal: ' + (it.itemDesc || 'item'));
    for (const o of (others || [])) await makeFlow(o.accountId, o.totalCost, 'Biaya: ' + (o.itemDesc || 'lain-lain'));
  }
  async function getInvoiceDateStr(invNo) {
    try { return (await getInvoiceByNumber(invNo)).invoiceDate || today(); } catch (e) { return today(); }
  }
  async function deleteHppCashFlows(invNo) {
    await sb.from('cash_flow').delete().eq('invoice_number', invNo).eq('source_type', 'hpp');
  }
  async function getHppModalData(invNo) {
    const [invoice, purchases, accounts] = await Promise.all([getInvoiceByNumber(invNo), getPurchasesByInvoice(invNo), getActiveAccounts()]);
    return { invoice, purchases, accounts };
  }

  /* ============ IMPOR EXCEL ============ */
  function importInvoiceNumber(orderNo, dateObj) {
    const y = (dateObj instanceof Date && !isNaN(dateObj)) ? dateObj.getFullYear() : new Date().getFullYear();
    let n = parseInt(orderNo, 10); if (isNaN(n)) n = 0;
    return 'IMP-' + y + '-' + pad(n, 4);
  }
  async function ensureCashierByName(name, cache) {
    let clean = String(name || '').trim() || 'Tanpa Nama';
    const key = clean.toLowerCase();
    if (cache[key]) return cache[key];
    const found = (await getCashiers()).find(c => String(c.name).trim().toLowerCase() === key);
    if (found) { cache[key] = found.cashierId; return found.cashierId; }
    const res = await saveCashier({ name: clean });
    cache[key] = res.cashierId;
    return res.cashierId;
  }
  async function importExcelRows(payload) {
    const rows = (payload && payload.rows) || [];
    let companyId = (payload && payload.companyId) || '';
    if (!rows.length) throw new Error('Tidak ada baris untuk diimpor.');
    const companies = await getCompanies();
    if (!companies.length) throw new Error('Belum ada Perusahaan (Kop). Tambahkan minimal 1 di Pengaturan sebelum impor.');
    if (!companyId) companyId = companies[0].companyId;

    const cache = {}, invRows = [], purRows = [];
    let imported = 0, skipped = 0; const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = rows[i];
        const dObj = r.tanggal ? new Date(r.tanggal) : null;
        const dateStr = (dObj instanceof Date && !isNaN(dObj)) ? dObj.toISOString().slice(0, 10) : String(r.tanggal || '');
        const kategori = String(r.kategori || 'Item').trim() || 'Item';
        let qty = parseFloat(r.qty); if (isNaN(qty) || qty <= 0) qty = 1;
        const hargaBeli = num(r.hargaBeli), hargaJual = num(r.hargaJual), ongkir = num(r.ongkir);

        const cashierId = await ensureCashierByName(r.pic, cache);
        const invNo = importInvoiceNumber(r.nomor, dObj);
        const unitPrice = qty > 0 ? hargaJual / qty : hargaJual;
        const items = [{ desc: kategori, qty, unit: '', price: unitPrice }];
        const subtotal = qty * unitPrice, total = Math.max(subtotal, 0);
        const notes = 'Impor dari Excel — Pesanan #' + (r.nomor != null ? r.nomor : '-');

        invRows.push({
          invoice_number: invNo, invoice_date: dateStr, due_date: null, client_name: 'Pelanggan Umum',
          client_address: '', client_email: '', client_phone: '', items_json: items, notes,
          tax_percent: 0, discount: 0, subtotal, tax_amount: 0, total, status: 'Paid',
          company_id: companyId, cashier_id: cashierId
        });
        const costPerUnit = qty > 0 ? hargaBeli / qty : hargaBeli;
        purRows.push({ invoice_number: invNo, item_desc: kategori, qty, cost_price: costPerUnit, total_cost: qty * costPerUnit, type: 'item' });
        if (ongkir > 0) purRows.push({ invoice_number: invNo, item_desc: 'Ongkir/disc', qty: 1, cost_price: ongkir, total_cost: ongkir, type: 'other' });
        imported++;
      } catch (e) {
        skipped++; errors.push('Baris ' + (i + 1) + ': ' + e.message);
      }
    }
    // insert dalam batch agar tidak kena limit request
    for (let i = 0; i < invRows.length; i += 200) {
      const chunk = invRows.slice(i, i + 200);
      const { error } = await sb.from('invoices').upsert(chunk, { onConflict: 'invoice_number' });
      if (error) errors.push('Gagal simpan invoice batch: ' + error.message);
    }
    for (let i = 0; i < purRows.length; i += 200) {
      const chunk = purRows.slice(i, i + 200);
      const { error } = await sb.from('purchases').insert(chunk);
      if (error) errors.push('Gagal simpan HPP batch: ' + error.message);
    }
    return { success: true, imported, skipped, errors: errors.slice(0, 20) };
  }
  async function getImportPreviewInfo() {
    const [companies, cashiers] = await Promise.all([getCompanies(), getCashiers()]);
    return { companies: companies.map(c => ({ companyId: c.companyId, name: c.name })), existingCashiers: cashiers.map(c => c.name) };
  }

  async function getInvoiceNumbers() {
    const data = ok(await sb.from('invoices').select('invoice_number, client_name').is('deleted_at', null).order('invoice_number', { ascending: false }));
    return data.map(r => ({ invoiceNumber: r.invoice_number, clientName: r.client_name }));
  }

  /* ============ DASHBOARD ============ */
  async function getDashboardData(filterCashierId, onlyPaid) {
    const filter = filterCashierId || '';
    const [invRows, purchases, cashiersList, companiesList] = await Promise.all([
      sb.from('invoices').select('invoice_number, invoice_date, discount, subtotal, total, status, company_id, cashier_id, items_json').is('deleted_at', null).then(ok),
      sb.from('purchases').select('invoice_number,total_cost').then(ok),
      getCashiers(), getCompanies()
    ]);
    const hppMap = {};
    purchases.forEach(p => { hppMap[p.invoice_number] = (hppMap[p.invoice_number] || 0) + num(p.total_cost); });

    const result = {
      totalOmzet: 0, totalHpp: 0, grossProfit: 0, margin: 0, totalInvoices: 0,
      paidCount: 0, unpaidCount: 0, piutang: 0, monthlyData: [], topItems: [],
      cashiers: cashiersList.map(c => ({ cashierId: c.cashierId, name: c.name })),
      filterCashierId: filter, onlyPaid: !!onlyPaid, cashierStats: [], cashierBenchmark: null, companyStats: []
    };

    const monthMap = {}, monthOrder = [], now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1, 2);
      monthMap[key] = { month: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }), omzet: 0, hpp: 0, profit: 0 };
      monthOrder.push(key);
    }

    const perCashier = {}, perCompany = {};
    const bucket = (m, id, extra) => (m[id] || (m[id] = Object.assign({ omzet: 0, hpp: 0, profit: 0, count: 0, paid: 0, unpaid: 0 }, extra || {})));

    const tally = {};
    invRows.forEach(row => {
      const cashierId = row.cashier_id || '', companyId = row.company_id || '', inv = row.invoice_number;
      const discount = num(row.discount), subtotal = num(row.subtotal), total = num(row.total), status = row.status;
      const revenue = Math.max(subtotal - discount, 0);
      const hpp = hppMap[inv] || 0;
      const profit = revenue - hpp;
      // Kalau mode "Hanya Lunas" aktif, invoice yang belum dibayar tidak ikut menambah
      // omzet/HPP/profit (uangnya belum benar-benar diterima) — tapi tetap terhitung
      // di jumlah invoice & piutang, supaya tetap kelihatan pekerjaan yang masih pending.
      const countsForRevenue = !onlyPaid || status === 'Paid';

      const b = bucket(perCashier, cashierId);
      if (countsForRevenue) { b.omzet += revenue; b.hpp += hpp; b.profit += profit; }
      b.count++;
      status === 'Paid' ? b.paid++ : b.unpaid++;

      const cb = bucket(perCompany, companyId, { piutang: 0 });
      if (countsForRevenue) { cb.omzet += revenue; cb.hpp += hpp; cb.profit += profit; }
      cb.count++;
      if (status === 'Paid') cb.paid++; else { cb.unpaid++; cb.piutang += total; }

      if (filter && cashierId !== filter) return;

      result.totalInvoices++;
      if (countsForRevenue) { result.totalOmzet += revenue; result.totalHpp += hpp; }
      if (status === 'Paid') result.paidCount++; else { result.unpaidCount++; result.piutang += total; }

      if (countsForRevenue) {
        const dObj = new Date(row.invoice_date);
        if (!isNaN(dObj.getTime())) {
          const key = dObj.getFullYear() + '-' + pad(dObj.getMonth() + 1, 2);
          if (monthMap[key]) { monthMap[key].omzet += revenue; monthMap[key].hpp += hpp; monthMap[key].profit += profit; }
        }
      }
      // Item terlaris dihitung dari SEMUA invoice (indikator permintaan/demand),
      // tidak tergantung status lunas.
      (row.items_json || []).forEach(it => { tally[it.desc] = (tally[it.desc] || 0) + num(it.qty); });
    });

    result.topItems = Object.keys(tally).map(n => ({ name: n, qty: tally[n] })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    result.grossProfit = result.totalOmzet - result.totalHpp;
    result.margin = result.totalOmzet > 0 ? (result.grossProfit / result.totalOmzet) * 100 : 0;
    result.monthlyData = monthOrder.map(k => monthMap[k]);

    let grandOmzet = 0, grandProfit = 0, grandCount = 0;
    Object.keys(perCashier).forEach(id => { grandOmzet += perCashier[id].omzet; grandProfit += perCashier[id].profit; grandCount += perCashier[id].count; });
    const nameById = {}; cashiersList.forEach(c => { nameById[c.cashierId] = c.name; });

    const stats = Object.keys(perCashier).map(id => {
      const b = perCashier[id];
      return {
        cashierId: id, name: nameById[id] || (id ? id : '(Tanpa Kasir)'),
        omzet: b.omzet, profit: b.profit, count: b.count, paid: b.paid, unpaid: b.unpaid,
        margin: b.omzet > 0 ? (b.profit / b.omzet) * 100 : 0,
        pctOmzet: grandOmzet > 0 ? (b.omzet / grandOmzet) * 100 : 0,
        pctProfit: grandProfit !== 0 ? (b.profit / grandProfit) * 100 : 0,
        pctCount: grandCount > 0 ? (b.count / grandCount) * 100 : 0
      };
    }).sort((a, b) => b.omzet - a.omzet);

    const nCashier = stats.length || 1, fairShare = 100 / nCashier;
    stats.forEach(s => {
      const ratio = fairShare > 0 ? s.pctOmzet / fairShare : 0;
      s.performanceRatio = ratio;
      s.rating = ratio >= 1.2 ? 'Sangat Produktif' : ratio >= 0.9 ? 'Produktif' : ratio >= 0.6 ? 'Cukup' : 'Perlu Ditingkatkan';
    });
    result.cashierStats = stats;
    result.cashierBenchmark = { grandOmzet, grandProfit, grandCount, fairShare, avgOmzet: grandOmzet / nCashier, avgProfit: grandProfit / nCashier, nCashier };

    const cNameById = {}; companiesList.forEach(c => { cNameById[c.companyId] = c.name; });
    let cGrandOmzet = 0, cGrandProfit = 0;
    Object.keys(perCompany).forEach(id => { cGrandOmzet += perCompany[id].omzet; cGrandProfit += perCompany[id].profit; });

    result.companyStats = Object.keys(perCompany).map(id => {
      const b = perCompany[id];
      return {
        companyId: id, name: cNameById[id] || (id ? id : '(Tanpa Perusahaan)'),
        omzet: b.omzet, hpp: b.hpp, profit: b.profit, count: b.count, paid: b.paid, unpaid: b.unpaid, piutang: b.piutang,
        margin: b.omzet > 0 ? (b.profit / b.omzet) * 100 : 0,
        pctOmzet: cGrandOmzet > 0 ? (b.omzet / cGrandOmzet) * 100 : 0,
        pctProfit: cGrandProfit !== 0 ? (b.profit / cGrandProfit) * 100 : 0
      };
    }).sort((a, b) => b.omzet - a.omzet);

    return result;
  }

  /* ============ SISTEM KAS ============ */
  async function getAccountsRaw() {
    const data = ok(await sb.from('accounts').select('*').order('created_at'));
    return data.map(r => ({ accountId: r.account_id, name: r.name, type: r.type, openingBalance: num(r.opening_balance), note: r.note, active: !!r.active }));
  }
  async function saveAccount(a) {
    if (!a.name || !a.name.trim()) throw new Error('Nama akun wajib diisi.');
    const isEdit = !!(a.accountId && a.accountId.trim());
    const id = isEdit ? a.accountId : await nextId('accounts', 'account_id', 'ACC-');
    const active = a.active === undefined ? true : !!a.active;
    ok(await sb.from('accounts').upsert({ account_id: id, name: a.name.trim(), type: a.type || 'personal', opening_balance: num(a.openingBalance), note: a.note || '', active }));
    return { success: true, accountId: id };
  }
  async function deleteAccount(id) {
    const { data } = await sb.from('cash_flow').select('flow_id').or(`account_id.eq.${id},to_account_id.eq.${id}`).limit(1);
    if (data && data.length) throw new Error('Akun masih dipakai di riwayat kas. Nonaktifkan saja (set Tidak Aktif) agar riwayat tetap utuh.');
    const { error } = await sb.from('accounts').delete().eq('account_id', id);
    if (error) throw new Error('Akun tidak ditemukan.');
    return { success: true };
  }

  async function getCashFlowRaw() {
    const data = ok(await sb.from('cash_flow').select('*').order('date', { ascending: false }));
    return data.map(r => ({
      flowId: r.flow_id, date: fmtDate(r.date), type: r.type, accountId: r.account_id, toAccountId: r.to_account_id,
      amount: num(r.amount), category: r.category, note: r.note, invoiceNumber: r.invoice_number, sourceType: r.source_type || '', createdAt: r.created_at
    }));
  }
  async function saveCashFlow(f) {
    if (['in', 'out', 'transfer'].indexOf(f.type) === -1) throw new Error('Tipe transaksi tidak valid.');
    const amount = num(f.amount);
    if (amount <= 0) throw new Error('Jumlah harus lebih dari 0.');
    if (!f.accountId) throw new Error('Pilih akun terlebih dahulu.');
    if (f.type === 'transfer') {
      if (!f.toAccountId) throw new Error('Pilih akun tujuan untuk transfer.');
      if (f.toAccountId === f.accountId) throw new Error('Akun asal dan tujuan tidak boleh sama.');
    }
    const id = (f.flowId && String(f.flowId).trim()) ? f.flowId : await nextId('cash_flow', 'flow_id', 'CF-', 5);
    ok(await sb.from('cash_flow').upsert({
      flow_id: id, date: f.date || today(), type: f.type, account_id: f.accountId,
      to_account_id: (f.type === 'transfer' ? f.toAccountId : null), amount, category: f.category || '',
      note: f.note || '', invoice_number: f.invoiceNumber || null, source_type: f.sourceType || ''
    }));
    return { success: true, flowId: id };
  }
  async function deleteCashFlow(id) {
    const { error } = await sb.from('cash_flow').delete().eq('flow_id', id);
    if (error) throw new Error('Transaksi kas tidak ditemukan.');
    return { success: true };
  }

  function computeAccountBalancesFrom(accountsRaw, flowsRaw) {
    const bal = {};
    accountsRaw.forEach(a => { bal[a.accountId] = a.openingBalance; });
    const get = id => (bal[id] === undefined ? (bal[id] = 0) : bal[id]);
    flowsRaw.forEach(f => {
      if (f.type === 'in') bal[f.accountId] = get(f.accountId) + f.amount;
      else if (f.type === 'out') bal[f.accountId] = get(f.accountId) - f.amount;
      else if (f.type === 'transfer') { bal[f.accountId] = get(f.accountId) - f.amount; bal[f.toAccountId] = get(f.toAccountId) + f.amount; }
    });
    return bal;
  }
  async function getCashData(filter) {
    filter = filter || {};
    // Sebelumnya accounts & cashflow tidak sengaja di-fetch 2x (sekali di sini, sekali lagi
    // di dalam computeAccountBalances) -> setiap buka tab Kas kirim request 2x lipat dari perlu.
    const [accounts, allFlows] = await Promise.all([getAccountsRaw(), getCashFlowRaw()]);
    const balances = computeAccountBalancesFrom(accounts, allFlows);
    const nameById = {}; accounts.forEach(a => { nameById[a.accountId] = a.name; });

    let flows = allFlows.slice();
    if (filter.accountId) flows = flows.filter(f => f.accountId === filter.accountId || f.toAccountId === filter.accountId);
    if (filter.type) flows = flows.filter(f => f.type === filter.type);
    if (filter.month) flows = flows.filter(f => String(f.date).slice(0, 7) === filter.month);
    if (filter.invoiceNumber) {
      flows = flows.filter(f => f.invoiceNumber === filter.invoiceNumber);
    }

    const invoiceSortKey = (inv) => {
      if (!inv) return -Infinity;
      const m = String(inv).match(/(\d+)(?!.*\d)/); // ambil angka TERAKHIR dalam nomor invoice
      return m ? parseInt(m[1], 10) : -Infinity;
    };
    const sortBy = filter.sortBy || 'date';
    if (sortBy === 'created') {
      flows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } else if (sortBy === 'invoice_asc' || sortBy === 'invoice_desc') {
      const dir = sortBy === 'invoice_asc' ? 1 : -1;
      flows.sort((a, b) => {
        const an = invoiceSortKey(a.invoiceNumber), bn = invoiceSortKey(b.invoiceNumber);
        if (an !== bn) return dir * (an - bn);
        return String(b.date).localeCompare(String(a.date));
      });
    } else {
      flows.sort((a, b) => a.date === b.date ? String(b.flowId).localeCompare(String(a.flowId)) : String(b.date).localeCompare(String(a.date)));
    }

    const flowsOut = flows.map(f => ({
      flowId: f.flowId, date: f.date, type: f.type, accountId: f.accountId, accountName: nameById[f.accountId] || f.accountId,
      toAccountId: f.toAccountId, toAccountName: f.toAccountId ? (nameById[f.toAccountId] || f.toAccountId) : '',
      amount: f.amount, category: f.category, note: f.note, invoiceNumber: f.invoiceNumber, sourceType: f.sourceType,
      createdAt: f.createdAt
    }));

    let totalIn = 0, totalOut = 0;
    allFlows.forEach(f => { if (f.type === 'in') totalIn += f.amount; else if (f.type === 'out') totalOut += f.amount; });

    let totalBalance = 0;
    const accountsOut = accounts.map(a => {
      const b = balances[a.accountId] || 0;
      if (a.active) totalBalance += b;
      return { accountId: a.accountId, name: a.name, type: a.type, active: a.active, openingBalance: a.openingBalance, balance: b };
    });
    let filteredIn = 0, filteredOut = 0;
    flows.forEach(f => { if (f.type === 'in') filteredIn += f.amount; else if (f.type === 'out') filteredOut += f.amount; });

    return { accounts: accountsOut, flows: flowsOut, totalBalance, totalIn, totalOut, filteredIn, filteredOut, filter };
  }
  async function getActiveAccounts() {
    return (await getAccountsRaw()).filter(a => a.active).map(a => ({ accountId: a.accountId, name: a.name }));
  }

  /* ---------- INTEGRASI INVOICE ---------- */
  async function recordInvoicePayment(p) {
    if (!p.invoiceNumber) throw new Error('Nomor invoice kosong.');
    if (!p.accountId) throw new Error('Pilih akun penerima.');
    if (num(p.amount) <= 0) throw new Error('Jumlah penerimaan harus > 0.');
    await saveCashFlow({ date: p.date || '', type: 'in', accountId: p.accountId, amount: num(p.amount), category: 'Penerimaan Invoice', note: p.note || ('Pembayaran ' + p.invoiceNumber), invoiceNumber: p.invoiceNumber, sourceType: 'payment' });
    if (p.markPaid) await updateInvoiceStatus(p.invoiceNumber, 'Paid');
    return { success: true };
  }
  async function recordInvoiceExpense(p) {
    if (!p.accountId) throw new Error('Pilih akun sumber dana.');
    if (num(p.amount) <= 0) throw new Error('Jumlah pengeluaran harus > 0.');
    await saveCashFlow({ date: p.date || '', type: 'out', accountId: p.accountId, amount: num(p.amount), category: p.category || 'Pembelian Bahan', note: p.note || ('Modal ' + (p.invoiceNumber || '')), invoiceNumber: p.invoiceNumber || '' });
    return { success: true };
  }
  async function getInvoiceCashSummary(invNo) {
    const flows = (await getCashFlowRaw()).filter(f => f.invoiceNumber === invNo);
    let paidIn = 0, paidOut = 0;
    flows.forEach(f => { if (f.type === 'in') paidIn += f.amount; else if (f.type === 'out') paidOut += f.amount; });
    return { paidIn, paidOut, flows };
  }

  /* ============ EXPORT ============ */
  window.API = {
    signIn, signOut, getSession, onAuthChange,
    getBankAccounts, saveBankAccount, deleteBankAccount,
    getCompanies, saveCompany, deleteCompany,
    getCashiers, saveCashier, deleteCashier,
    getSettings, saveGlobalSettings,
    getItems, saveItem, deleteItem, getCustomers, uploadImage, getItemBranchPrices, saveItemBranchPrices,
    saveInvoice, getInvoiceList, getInvoiceByNumber, deleteInvoice, updateInvoiceStatus, getInvoiceNumbers,
    getDeletedInvoices, restoreInvoice, permanentlyDeleteInvoice,
    saveQuotation, getQuotationList, getQuotationByNumber, deleteQuotation, updateQuotationStatus, markQuotationConverted,
    getQuotationPreviewHtml, generateQuotationPdf, generateQuotationJpg, saveQuotationPdfToDrive, saveQuotationJpgToDrive,
    getInvoicePreviewHtml, generateInvoicePdf, generateInvoiceJpg, savePdfToDrive, saveJpgToDrive,
    getPurchasesByInvoice, savePurchases, getHppModalData,
    importExcelRows, getImportPreviewInfo,
    getDashboardData,
    getActiveAccounts, saveAccount, deleteAccount, getCashData, saveCashFlow, deleteCashFlow,
    recordInvoicePayment, recordInvoiceExpense, getInvoiceCashSummary
  };
})();

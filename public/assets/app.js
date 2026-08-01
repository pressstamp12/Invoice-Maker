/**
 * INVOICE MAKER — App logic (port dari JavaScript.html / GAS client script)
 * Perubahan dari versi asli:
 *  - run() sekarang memanggil window.API.<fn>() (Supabase) alih-alih google.script.run
 *  - Ditambahkan auth guard (Supabase Auth) di awal
 *  - Sisanya logic & UI SAMA PERSIS dengan versi Apps Script
 */
let currencySymbol = 'Rp';
let itemCounter = 0;
let itemsCache = [], companiesCache = [], cashiersCache = [], accountsCache = [];
let chartsLoaded = false;
let currentPreviewInv = '';
let dashboardFilterCashier = '';
let _lastDashboardData = null, _prodMetric = 'omzet', _companyMetric = 'omzet';
let _importParsedRows = null;
let hppAccounts = [], hppCurrentInv = '';
let listFilterStatus = 'all', listFilterSource = 'all', listFilterCashier = 'all', _allInvoices = [];
let cashFilterType = 'all', cashFilterAccount = 'all', _payInvoiceNumber = '';
let cashFilterInvoice = '';
let bankAccountsCache = [];
let listFilterCompany = 'all';
let customersCache = [];
let cashSortBy = 'date';

/* ---------------- HELPERS ---------------- */
const $ = id => document.getElementById(id);
const val = id => $(id).value;
const setVal = (id, v) => { $(id).value = v; };
const setTxt = (id, v) => { $(id).textContent = v; };
const show = (id, b) => $(id).classList.toggle('hidden', !b);

/* Wrapper pengganti google.script.run: run(fn, args, onOk, {loading, onErr, lockKey}) */
const _submitLocks = new Set();
function run(fnName, args, onOk, opts) {
  opts = opts || {};
  const lockKey = opts.lockKey;
  if (lockKey) {
    if (_submitLocks.has(lockKey)) return; // sedang diproses — abaikan tap/klik ganda (anti double input)
    _submitLocks.add(lockKey);
  }
  const loading = opts.loading !== false;
  if (loading) showLoading(true);
  const fn = window.API[fnName];
  if (!fn) { console.error('API tidak punya fungsi:', fnName); if (lockKey) _submitLocks.delete(lockKey); return; }
  Promise.resolve(fn.apply(null, args || []))
    .then(res => { if (loading) showLoading(false); if (lockKey) _submitLocks.delete(lockKey); onOk && onOk(res); })
    .catch(err => {
      if (loading) showLoading(false);
      if (lockKey) _submitLocks.delete(lockKey);
      opts.onErr ? opts.onErr(err) : toast(err.message, true);
    });
}

/* ---------------- AUTH ---------------- */
async function initAuth() {
  const session = await window.API.getSession();
  if (session) { onLoggedIn(); return; }
  show('appRoot', false); show('loginScreen', true);
}
function onLoggedIn() {
  show('loginScreen', false); show('appRoot', true);
  initApp();
}
async function doLogin(e) {
  e.preventDefault();
  const email = val('loginEmail'), pass = val('loginPassword');
  const btn = $('loginSubmitBtn'); btn.disabled = true; btn.textContent = 'Masuk...';
  try {
    await window.API.signIn(email, pass);
    onLoggedIn();
  } catch (err) {
    $('loginError').textContent = err.message || 'Gagal masuk.';
    $('loginError').classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
}
async function doLogout() {
  await window.API.signOut();
  location.reload();
}

let appInited = false;
function initApp() {
  if (appInited) return; appInited = true;
  initTabs();
  initItemsTable();
  setVal('invoiceDate', todayStr());
  loadItemsCache();
  loadCustomersCache();
  loadSettings();
  loadDashboard();

  $('clientName').addEventListener('change', onClientNameChange);

  $('addItemBtn').addEventListener('click', () => addItemRow());
  $('resetFormBtn').addEventListener('click', resetForm);
  $('invoiceForm').addEventListener('submit', onSubmitInvoice);
  $('settingsForm').addEventListener('submit', onSubmitSettings);
  $('discount').addEventListener('input', recalcTotals);
  $('taxPercent').addEventListener('input', recalcTotals);

  $('itemForm').addEventListener('submit', onSubmitItemForm);
  $('cancelItemEditBtn').addEventListener('click', cancelItemEdit);
  $('companyForm').addEventListener('submit', onSubmitCompanyForm);
  $('cancelCompanyEditBtn').addEventListener('click', cancelCompanyEdit);
  $('cashierForm').addEventListener('submit', onSubmitCashierForm);
  $('cancelCashierEditBtn').addEventListener('click', cancelCashierEdit);
  $('cashierSignature').addEventListener('input', updateSigPreview);
  $('bankForm').addEventListener('submit', onSubmitBankForm);
  $('cancelBankEditBtn').addEventListener('click', resetBankForm);

  $('hppModalCloseBtn').addEventListener('click', closeHppModal);
  $('hppCancelBtn').addEventListener('click', closeHppModal);
  $('hppSaveBtn').addEventListener('click', saveHppModal);
  $('addOtherCostBtn').addEventListener('click', () => addOtherCostRow());

  $('previewCloseBtn').addEventListener('click', closePreviewModal);
  $('btnDownloadPdf').addEventListener('click', downloadPdfFromPreview);
  $('btnDownloadJpg').addEventListener('click', downloadJpgFromPreview);
  $('btnShareDrive').addEventListener('click', shareDriveFromPreview);
  $('btnShareJpgDrive').addEventListener('click', shareJpgDriveFromPreview);
  $('btnShareWa').addEventListener('click', shareWhatsApp);
  $('btnCopyLink').addEventListener('click', copyShareLink);

  $('logoutBtn').addEventListener('click', doLogout);

  loadGoogleCharts();
}

document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', doLogin);
  initAuth();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Kalau ada versi baru terdeploy, reload otomatis sekali supaya tidak
    // ada file lama/campuran ke-cache (pemicu bug "tampilan kode aneh").
    let _swRefreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_swRefreshed) return;
      _swRefreshed = true;
      window.location.reload();
    });
  }
});

function loadGoogleCharts() {
  try {
    google.charts.load('current', { packages: ['corechart'] });
    google.charts.setOnLoadCallback(() => { chartsLoaded = true; });
  } catch (e) {}
}

/* ---------------- TABS ---------------- */
function initTabs() {
  const map = { list: loadInvoiceList, items: loadItemsList, create: () => { loadItemsCache(); loadCustomersCache(); },
    dashboard: loadDashboard, cash: loadCashTab,
    settings: () => { loadCompanyList(); loadCashierList(); initImportUI(); } };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
      (map[btn.dataset.tab] || (() => {}))();
    });
  });
}

/* ---------------- SETTINGS / COMPANIES / CASHIERS ---------------- */
function loadSettings() {
  run('getSettings', [], s => {
    currencySymbol = s.currency || 'Rp';
    setVal('currency', currencySymbol);
    companiesCache = s.companies || [];
    cashiersCache = s.cashiers || [];
    bankAccountsCache = s.bankAccounts || [];
    fillCompanyDropdown();
    fillCashierDropdown();
    fillImportCompanyDropdown();
    fillCompanyBankDropdown();
    loadCompanyList();
    loadCashierList();
    loadBankList();
    loadAccountsCache();
  }, { loading: false });
}
function loadAccountsCache() {
  run('getActiveAccounts', [], list => { accountsCache = list || []; }, { loading: false });
}
function fillSelect(selId, list, idKey, nameKey, emptyOpt, leadOpt) {
  const sel = $(selId);
  if (!sel) return;
  if (!list.length) { sel.innerHTML = emptyOpt || ''; return; }
  sel.innerHTML = (leadOpt || '') + list.map(o =>
    `<option value="${o[idKey]}">${escapeHtml(o[nameKey])}</option>`).join('');
}
function fillCompanyDropdown() {
  fillSelect('invoiceCompany', companiesCache, 'companyId', 'name',
    '<option value="">(Belum ada perusahaan — tambah di Pengaturan)</option>');
}
function fillCashierDropdown() {
  fillSelect('invoiceCashier', cashiersCache, 'cashierId', 'name', '', '<option value="">— Tidak ada —</option>');
}

function bankOptionLabel(b) {
  const base = b.bankName + ' ' + b.accountNumber + ' a.n. ' + b.accountHolder;
  return b.label ? (b.label + ' — ' + base) : base;
}
function fillCompanyBankDropdown(selectedId) {
  const sel = $('companyDefaultBank');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Tidak ada / pakai teks manual —</option>' +
    bankAccountsCache.map(b => `<option value="${b.bankId}">${escapeHtml(bankOptionLabel(b))}</option>`).join('');
  sel.value = selectedId || '';
}

function onSubmitSettings(e) {
  e.preventDefault();
  const currency = val('currency') || 'Rp';
  run('saveGlobalSettings', [{ currency: currency }], () => {
    currencySymbol = currency; toast('Pengaturan disimpan');
  });
}

// ---- Company CRUD ----
function onSubmitCompanyForm(e) {
  e.preventDefault();
  const data = {
    companyId: val('editCompanyId'), name: val('companyName'), email: val('companyEmail'),
    phone: val('companyPhone'), currency: val('companyCurrency') || 'Rp',
    address: val('companyAddress'), bank: val('companyBank'), logoUrl: val('companyLogo'),
    defaultBankId: val('companyDefaultBank')
  };
  if (!data.name.trim()) { toast('Nama perusahaan wajib diisi', true); return; }
  run('saveCompany', [data], () => { toast('Perusahaan disimpan'); resetCompanyForm(); loadSettings(); });
}
function resetCompanyForm() {
  $('companyForm').reset(); setVal('editCompanyId', '');
  fillCompanyBankDropdown('');
  setTxt('companyFormTitle', 'Tambah Perusahaan (Kop)');
  show('cancelCompanyEditBtn', false);
}
function cancelCompanyEdit() { resetCompanyForm(); }
function editCompany(id) {
  const c = companiesCache.find(x => x.companyId === id); if (!c) return;
  setVal('editCompanyId', c.companyId); setVal('companyName', c.name);
  setVal('companyEmail', c.email || ''); setVal('companyPhone', c.phone || '');
  setVal('companyCurrency', c.currency || 'Rp'); setVal('companyAddress', c.address || '');
  setVal('companyBank', c.bank || ''); setVal('companyLogo', c.logoUrl || '');
  fillCompanyBankDropdown(c.defaultBankId || '');
  setTxt('companyFormTitle', 'Edit Perusahaan');
  show('cancelCompanyEditBtn', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteCompanyUi(id) {
  if (!confirm('Hapus perusahaan ini?')) return;
  run('deleteCompany', [id], () => { toast('Perusahaan dihapus'); loadSettings(); });
}
function loadCompanyList() {
  const wrap = $('companyListWrap');
  if (!companiesCache.length) { wrap.innerHTML = '<p class="muted">Belum ada perusahaan.</p>'; return; }
  wrap.innerHTML = companiesCache.map(c => miniCard(
    `<strong>${escapeHtml(c.name)}</strong>`, escapeHtml(c.address || ''),
    `editCompany('${c.companyId}')`, `deleteCompanyUi('${c.companyId}')`)).join('');
}

function miniCard(main, sub, editCall, delCall) {
  return `<div class="mini-card">
    <div><div class="mc-main">${main}</div><div class="mc-sub">${sub}</div></div>
    <div class="mc-actions">
      <button onclick="${editCall}">Edit</button>
      <button class="del-btn" onclick="${delCall}">Hapus</button>
    </div></div>`;
}

// ---- Cashier CRUD ----
function updateSigPreview() {
  const url = val('cashierSignature').trim();
  const img = $('cashierSigPreview');
  if (url) { img.src = url; img.classList.remove('hidden'); }
  else { img.classList.add('hidden'); img.removeAttribute('src'); }
}
function onSubmitCashierForm(e) {
  e.preventDefault();
  const data = { cashierId: val('editCashierId'), name: val('cashierName'),
    phone: val('cashierPhone'), signatureUrl: val('cashierSignature').trim() };
  if (!data.name.trim()) { toast('Nama kasir wajib diisi', true); return; }
  run('saveCashier', [data], () => { toast('Kasir disimpan'); resetCashierForm(); loadSettings(); });
}
function resetCashierForm() {
  $('cashierForm').reset(); setVal('editCashierId', '');
  setTxt('cashierFormTitle', 'Tambah Kasir');
  show('cancelCashierEditBtn', false);
  updateSigPreview();
}
function cancelCashierEdit() { resetCashierForm(); }
function editCashier(id) {
  const c = cashiersCache.find(x => x.cashierId === id); if (!c) return;
  setVal('editCashierId', c.cashierId); setVal('cashierName', c.name);
  setVal('cashierPhone', c.phone || ''); setVal('cashierSignature', c.signatureUrl || '');
  updateSigPreview();
  setTxt('cashierFormTitle', 'Edit Kasir');
  show('cancelCashierEditBtn', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteCashierUi(id) {
  if (!confirm('Hapus kasir ini?')) return;
  run('deleteCashier', [id], () => { toast('Kasir dihapus'); loadSettings(); });
}
function loadCashierList() {
  const wrap = $('cashierListWrap');
  if (!cashiersCache.length) { wrap.innerHTML = '<p class="muted">Belum ada kasir.</p>'; return; }
  wrap.innerHTML = cashiersCache.map(c => miniCard(
    `<strong>${escapeHtml(c.name)}</strong>${c.signatureUrl ? ' · ✍️ TTD' : ''}`,
    escapeHtml(c.phone || ''),
    `editCashier('${c.cashierId}')`, `deleteCashierUi('${c.cashierId}')`)).join('');
}

// ---- Bank CRUD ----
function onSubmitBankForm(e) {
  e.preventDefault();
  const data = { bankId: val('editBankId'), bankName: val('bankName'),
    accountNumber: val('bankNumber'), accountHolder: val('bankHolder'), label: val('bankLabel') };
  if (!data.bankName.trim() || !data.accountNumber.trim() || !data.accountHolder.trim()) {
    toast('Nama bank, nomor rekening, dan atas nama wajib diisi', true); return;
  }
  run('saveBankAccount', [data], () => { toast('Rekening disimpan'); resetBankForm(); loadSettings(); });
}
function resetBankForm() {
  $('bankForm').reset(); setVal('editBankId', '');
  setTxt('bankFormTitle', 'Database Rekening');
  show('cancelBankEditBtn', false);
}
function editBank(id) {
  const b = bankAccountsCache.find(x => x.bankId === id); if (!b) return;
  setVal('editBankId', b.bankId); setVal('bankName', b.bankName);
  setVal('bankNumber', b.accountNumber); setVal('bankHolder', b.accountHolder);
  setVal('bankLabel', b.label || '');
  setTxt('bankFormTitle', 'Edit Rekening');
  show('cancelBankEditBtn', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteBankUi(id) {
  if (!confirm('Hapus rekening ini? Perusahaan yang memakainya sebagai default akan direset.')) return;
  run('deleteBankAccount', [id], () => { toast('Rekening dihapus'); loadSettings(); });
}
function loadBankList() {
  const wrap = $('bankListWrap'); if (!wrap) return;
  if (!bankAccountsCache.length) { wrap.innerHTML = '<p class="muted">Belum ada rekening.</p>'; return; }
  wrap.innerHTML = bankAccountsCache.map(b => miniCard(
    `<strong>${escapeHtml(b.bankName)}</strong> · ${escapeHtml(b.accountNumber)}${b.label ? ' · '+escapeHtml(b.label) : ''}`,
    'a.n. ' + escapeHtml(b.accountHolder),
    `editBank('${b.bankId}')`, `deleteBankUi('${b.bankId}')`)).join('');
}

/* ---------------- ITEMS TABLE (form invoice) ---------------- */
function initItemsTable() { addItemRow(); }
function addItemRow(item) {
  itemCounter++;
  const tr = document.createElement('tr');
  tr.dataset.id = itemCounter;
  tr.innerHTML = `
    <td><input type="text" class="item-desc" list="itemsDatalist" placeholder="Nama produk/jasa" value="${item ? escapeHtml(item.desc) : ''}"></td>
    <td><input type="number" class="item-qty" min="0" step="any" value="${item ? item.qty : 1}"></td>
    <td><input type="text" class="item-unit" placeholder="pcs" value="${item && item.unit ? escapeHtml(item.unit) : ''}"></td>
    <td><input type="number" class="item-price" min="0" step="any" value="${item ? item.price : 0}"></td>
    <td class="item-subtotal">${formatMoney(0)}</td>
    <td><button type="button" class="remove-item-btn" title="Hapus item">&times;</button></td>`;
  $('itemsBody').appendChild(tr);
  tr.querySelector('.item-desc').addEventListener('change', () => onItemDescChange(tr));
  tr.querySelector('.item-qty').addEventListener('input', () => recalcRow(tr));
  tr.querySelector('.item-price').addEventListener('input', () => recalcRow(tr));
  tr.querySelector('.remove-item-btn').addEventListener('click', () => { tr.remove(); recalcTotals(); });
  recalcRow(tr);
}
function onItemDescChange(tr) {
  const desc = tr.querySelector('.item-desc').value.trim();
  const match = itemsCache.find(it => it.itemName.toLowerCase() === desc.toLowerCase());
  if (match) {
    tr.querySelector('.item-price').value = match.defaultPrice;
    const unitInput = tr.querySelector('.item-unit');
    if (!unitInput.value.trim() && match.unit) unitInput.value = match.unit;
    recalcRow(tr);
  }
}
function recalcRow(tr) {
  const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
  const price = parseFloat(tr.querySelector('.item-price').value) || 0;
  tr.querySelector('.item-subtotal').textContent = formatMoney(qty * price);
  recalcTotals();
}
function recalcTotals() {
  let subtotal = 0;
  document.querySelectorAll('#itemsBody tr').forEach(tr => {
    subtotal += (parseFloat(tr.querySelector('.item-qty').value) || 0) * (parseFloat(tr.querySelector('.item-price').value) || 0);
  });
  const discount = parseFloat(val('discount')) || 0;
  const taxPercent = parseFloat(val('taxPercent')) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = taxable * (taxPercent / 100);
  setTxt('sumSubtotal', formatMoney(subtotal));
  setTxt('sumDiscount', formatMoney(discount));
  setTxt('sumTax', formatMoney(taxAmount));
  setTxt('sumTotal', formatMoney(taxable + taxAmount));
}

/* ---------------- SUBMIT INVOICE ---------------- */
function onSubmitInvoice(e) {
  e.preventDefault();
  const items = [];
  document.querySelectorAll('#itemsBody tr').forEach(tr => {
    const desc = tr.querySelector('.item-desc').value.trim();
    const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
    const unit = tr.querySelector('.item-unit').value.trim();
    const price = parseFloat(tr.querySelector('.item-price').value) || 0;
    if (desc) items.push({ desc, qty, unit, price });
  });
  if (!items.length) { toast('Tambahkan minimal 1 item', true); return; }
  const companyId = val('invoiceCompany');
  if (!companyId) { toast('Pilih perusahaan (kop) dulu. Tambahkan di Pengaturan.', true); return; }
  const data = {
    invoiceNumber: val('editInvoiceNumber'), companyId: companyId, cashierId: val('invoiceCashier'),
    clientName: val('clientName'), clientEmail: val('clientEmail'), clientPhone: val('clientPhone'),
    clientAddress: val('clientAddress'), invoiceDate: val('invoiceDate'), dueDate: val('dueDate'),
    items: items, discount: parseFloat(val('discount')) || 0,
    taxPercent: parseFloat(val('taxPercent')) || 0, notes: val('notes')
  };
  run('saveInvoice', [data], res => {
    toast('Invoice ' + res.invoiceNumber + ' tersimpan'); resetForm();
    loadCustomersCache();
    document.querySelector('.tab-btn[data-tab="list"]').click();
  }, { lockKey: 'saveInvoice:' + (data.invoiceNumber || 'new') });
}
function resetForm() {
  $('invoiceForm').reset(); setVal('editInvoiceNumber', '');
  $('itemsBody').innerHTML = ''; setVal('invoiceDate', todayStr());
  itemCounter = 0; addItemRow(); recalcTotals();
}

/* ---------------- INVOICE LIST ---------------- */
function loadInvoiceList() {
  const wrap = $('invoiceListWrap');
  wrap.innerHTML = '<p class="muted">Memuat...</p>';
  bindListFilterHandlers();
  run('getInvoiceList', [], list => {
    _allInvoices = list || [];
    populateListCashierFilter();
    populateListCompanyFilter();
    renderInvoiceList();
  }, { loading: false, onErr: err => { wrap.innerHTML = '<p class="muted">Gagal memuat.</p>'; toast(err.message, true); } });
}
function bindListFilterHandlers() {
  bindPillGroup('filterStatus', v => { listFilterStatus = v; renderInvoiceList(); });
  bindPillGroup('filterSource', v => { listFilterSource = v; renderInvoiceList(); });
  const fc = $('filterCashierList');
  if (fc && !fc.dataset.bound) {
    fc.dataset.bound = '1';
    fc.addEventListener('change', () => { listFilterCashier = fc.value; renderInvoiceList(); });
  }
  const fco = $('filterCompanyList');
  if (fco && !fco.dataset.bound) {
    fco.dataset.bound = '1';
    fco.addEventListener('change', () => { listFilterCompany = fco.value; renderInvoiceList(); });
  }
}
function bindPillGroup(containerId, cb) {
  const c = $(containerId);
  if (!c || c.dataset.bound) return;
  c.dataset.bound = '1';
  c.querySelectorAll('.lf-pill').forEach(b => b.addEventListener('click', () => {
    syncPills(c, b.dataset.val); cb(b.dataset.val);
  }));
}
function syncPills(container, v) {
  container.querySelectorAll('.lf-pill').forEach(b => b.classList.toggle('active', b.dataset.val === v));
}
function syncListFilterUI() {
  const fs = $('filterStatus'); if (fs) syncPills(fs, listFilterStatus);
  const fsrc = $('filterSource'); if (fsrc) syncPills(fsrc, listFilterSource);
  const fc = $('filterCashierList'); if (fc) fc.value = listFilterCashier;
  const fco = $('filterCompanyList'); if (fco) fco.value = listFilterCompany;
}
function populateListCashierFilter() {
  const sel = $('filterCashierList'); if (!sel) return;
  const names = {};
  _allInvoices.forEach(i => { if (i.cashierName) names[i.cashierName] = true; });
  const cur = listFilterCashier;
  sel.innerHTML = '<option value="all">Semua Kasir</option>' +
    Object.keys(names).sort().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  sel.value = cur;
}
function populateListCompanyFilter() {
  const sel = $('filterCompanyList'); if (!sel) return;
  const names = {};
  _allInvoices.forEach(i => { if (i.companyName) names[i.companyName] = true; });
  const cur = listFilterCompany;
  sel.innerHTML = '<option value="all">Semua Perusahaan</option>' +
    Object.keys(names).sort().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  sel.value = cur;
}
function renderInvoiceList() {
  const wrap = $('invoiceListWrap');
  let list = _allInvoices.slice();
  if (listFilterStatus !== 'all') list = list.filter(i => i.status === listFilterStatus);
  if (listFilterSource !== 'all') list = list.filter(i => (i.source || 'manual') === listFilterSource);
  if (listFilterCashier !== 'all') list = list.filter(i => (i.cashierName || '') === listFilterCashier);
  if (listFilterCompany !== 'all') list = list.filter(i => (i.companyName || '') === listFilterCompany);
  if (!list.length) { wrap.innerHTML = '<p class="muted">Tidak ada invoice sesuai filter.</p>'; return; }

  wrap.innerHTML = list.map(inv => {
    const profitHtml = inv.profit === null ? '<span class="muted">Belum diisi</span>'
      : `<span class="${inv.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${formatMoney(inv.profit)}</span>`;
    const srcBadge = inv.source === 'import'
      ? '<span class="acc-badge other" style="margin-left:6px">Impor</span>'
      : '<span class="acc-badge safe" style="margin-left:6px">App</span>';
    return `
    <div class="inv-card">
      <div class="inv-card-top">
        <div><div class="inv-no">${escapeHtml(inv.invoiceNumber)}${srcBadge}</div>
        <div class="inv-date">${escapeHtml(inv.invoiceDate)}</div></div>
        <button class="status-badge ${inv.status}" onclick="toggleStatus('${inv.invoiceNumber}','${inv.status}')">${inv.status === 'Paid' ? 'LUNAS' : 'BELUM'}</button>
      </div>
      <div class="inv-card-body">
        <div><span class="lbl">Klien</span><span class="val">${escapeHtml(inv.clientName)}</span></div>
        <div><span class="lbl">Total</span><span class="val">${formatMoney(inv.total)}</span></div>
        <div><span class="lbl">Kasir</span><span class="val">${escapeHtml(inv.cashierName || '-')}</span></div>
        <div><span class="lbl">Profit</span><span class="val">${profitHtml}</span></div>
      </div>
      <div class="inv-actions">
        <button class="prev-btn" onclick="openPreview('${inv.invoiceNumber}')">👁️ Preview/Share</button>
        <button onclick="openPayModal('${inv.invoiceNumber}', ${Number(inv.total) || 0})">💵 Terima Bayar</button>
        <button onclick="openHppModal('${inv.invoiceNumber}')">💰 HPP</button>
        <button onclick="editInvoice('${inv.invoiceNumber}')">✏️ Edit</button>
        <button class="del-btn" onclick="deleteInvoiceUi('${inv.invoiceNumber}')">🗑️ Hapus</button>
      </div>
    </div>`;
  }).join('');
}
function toggleStatus(inv, current) {
  if (current === 'Paid') {
    // Batalkan status Lunas — ini aksi koreksi, tidak menghapus histori kas yang sudah ada
    if (!confirm('Ubah status invoice ' + inv + ' jadi Belum Lunas? (Catatan kas yang sudah ada tidak akan otomatis dihapus)')) return;
    run('updateInvoiceStatus', [inv, 'Unpaid'], () => loadInvoiceList(), { lockKey: 'toggleStatus:' + inv });
  } else {
    // Supaya status Lunas SELALU sinkron dengan arus kas, tandai Lunas wajib lewat "Terima Bayar"
    const invObj = _allInvoices.find(i => i.invoiceNumber === inv);
    toast('Catat dulu penerimaannya supaya arus kas tetap sinkron');
    openPayModal(inv, invObj ? invObj.total : 0);
  }
}
function deleteInvoiceUi(inv) {
  if (!confirm('Hapus invoice ' + inv + '?')) return;
  run('deleteInvoice', [inv], () => { toast('Invoice dihapus'); loadInvoiceList(); });
}
function editInvoice(inv) {
  run('getInvoiceByNumber', [inv], d => {
    document.querySelector('.tab-btn[data-tab="create"]').click();
    setVal('editInvoiceNumber', d.invoiceNumber);
    setVal('invoiceCompany', d.companyId || ''); setVal('invoiceCashier', d.cashierId || '');
    setVal('clientName', d.clientName || ''); setVal('clientEmail', d.clientEmail || '');
    setVal('clientPhone', d.clientPhone || ''); setVal('clientAddress', d.clientAddress || '');
    setVal('invoiceDate', d.invoiceDate || todayStr()); setVal('dueDate', d.dueDate || '');
    setVal('discount', d.discount || 0); setVal('taxPercent', d.taxPercent || 0);
    setVal('notes', d.notes || '');
    $('itemsBody').innerHTML = ''; itemCounter = 0;
    (d.items || []).forEach(it => addItemRow(it));
    if (!d.items || !d.items.length) addItemRow();
    recalcTotals();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------------- HPP MODAL ---------------- */
function hppAccountSelectHtml(selectedId) {
  return '<option value="">— pilih kas —</option>' + hppAccounts.map(a =>
    `<option value="${a.accountId}"${a.accountId === selectedId ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
}
function openHppModal(inv) {
  hppCurrentInv = inv;
  setTxt('hppModalInvNumber', inv);
  $('hppTableBody').innerHTML = '<tr><td colspan="5" class="muted">Memuat...</td></tr>';
  $('otherCostBody').innerHTML = '';
  $('hppModalOverlay').classList.remove('hidden');
  run('getHppModalData', [inv], d => {
    hppAccounts = d.accounts || [];
    const invoice = d.invoice, purchases = d.purchases;
    window._hppRevenue = Math.max((invoice.subtotal || 0) - (invoice.discount || 0), 0);
    const body = $('hppTableBody'); body.innerHTML = '';
    (invoice.items || []).forEach(it => {
      const saved = (purchases.items || []).find(p => p.itemDesc === it.desc);
      const cost = saved ? saved.costPrice : 0;
      const accId = saved ? (saved.accountId || '') : '';
      const tr = document.createElement('tr');
      tr.dataset.desc = it.desc; tr.dataset.qty = it.qty;
      tr.innerHTML = `
        <td>${escapeHtml(it.desc)}</td>
        <td>${it.qty}</td>
        <td><input type="number" class="hpp-cost" min="0" step="any" value="${cost}"></td>
        <td class="hpp-total">${formatMoney((it.qty||0)*cost)}</td>
        <td><select class="hpp-acc">${hppAccountSelectHtml(accId)}</select></td>`;
      tr.querySelector('.hpp-cost').addEventListener('input', () => {
        const c = parseFloat(tr.querySelector('.hpp-cost').value) || 0;
        tr.querySelector('.hpp-total').textContent = formatMoney((parseFloat(tr.dataset.qty)||0)*c);
        recalcHpp();
      });
      body.appendChild(tr);
    });
    (purchases.others || []).forEach(o => addOtherCostRow(o.itemDesc, o.totalCost, o.accountId));
    recalcHpp();
  }, { onErr: err => { toast(err.message, true); closeHppModal(); } });
}
function addOtherCostRow(desc, cost, accId) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="oc-desc" placeholder="Ongkir / Desain / dll" value="${desc ? escapeHtml(desc) : ''}"></td>
    <td><input type="number" class="oc-cost" min="0" step="any" value="${cost || 0}"></td>
    <td><select class="oc-acc">${hppAccountSelectHtml(accId || '')}</select></td>
    <td><button type="button" class="remove-item-btn">&times;</button></td>`;
  tr.querySelector('.oc-cost').addEventListener('input', recalcHpp);
  tr.querySelector('.remove-item-btn').addEventListener('click', () => { tr.remove(); recalcHpp(); });
  $('otherCostBody').appendChild(tr);
}
function recalcHpp() {
  let itemsTotal = 0;
  document.querySelectorAll('#hppTableBody tr').forEach(tr => {
    const qty = parseFloat(tr.dataset.qty) || 0;
    const el = tr.querySelector('.hpp-cost');
    itemsTotal += qty * (parseFloat(el ? el.value : 0) || 0);
  });
  let othersTotal = 0;
  document.querySelectorAll('#otherCostBody tr').forEach(tr => {
    othersTotal += parseFloat(tr.querySelector('.oc-cost').value) || 0;
  });
  const total = itemsTotal + othersTotal;
  const profit = (window._hppRevenue || 0) - total;
  setTxt('hppSumItems', formatMoney(itemsTotal));
  setTxt('hppSumOthers', formatMoney(othersTotal));
  setTxt('hppSumTotal', formatMoney(total));
  const pEl = $('hppSumProfit');
  pEl.textContent = formatMoney(profit);
  pEl.className = profit >= 0 ? 'profit-positive' : 'profit-negative';
}
function saveHppModal() {
  const items = [];
  document.querySelectorAll('#hppTableBody tr').forEach(tr => {
    if (!tr.dataset.desc) return;
    items.push({
      itemDesc: tr.dataset.desc, qty: parseFloat(tr.dataset.qty) || 0,
      costPrice: parseFloat(tr.querySelector('.hpp-cost').value) || 0,
      accountId: tr.querySelector('.hpp-acc') ? tr.querySelector('.hpp-acc').value : ''
    });
  });
  const others = [];
  document.querySelectorAll('#otherCostBody tr').forEach(tr => {
    const d = tr.querySelector('.oc-desc').value.trim();
    const acc = tr.querySelector('.oc-acc') ? tr.querySelector('.oc-acc').value : '';
    if (d) others.push({ itemDesc: d, totalCost: parseFloat(tr.querySelector('.oc-cost').value) || 0, accountId: acc });
  });
  run('savePurchases', [hppCurrentInv, items, others], () => {
    toast('HPP tersimpan & kas tercatat'); closeHppModal(); loadInvoiceList();
  }, { lockKey: 'savePurchases:' + hppCurrentInv });
}
function closeHppModal() { $('hppModalOverlay').classList.add('hidden'); }

/* ---------------- PREVIEW & SHARE ---------------- */
function openPreview(inv) {
  currentPreviewInv = inv;
  setTxt('previewInvNumber', inv);
  $('shareLinkBox').classList.add('hidden');
  $('btnShareWa').classList.add('hidden');
  const wrap = $('previewFrameWrap');
  wrap.innerHTML = '<p class="muted">Memuat preview...</p>';
  $('previewModalOverlay').classList.remove('hidden');
  run('getInvoicePreviewHtml', [inv], html => {
    const iframe = document.createElement('iframe');
    iframe.id = 'previewIframe';
    wrap.innerHTML = ''; wrap.appendChild(iframe);
    iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
    setTimeout(() => fitPreviewIframe(iframe), 60);
  }, { onErr: err => { wrap.innerHTML = '<p class="muted">Gagal memuat.</p>'; toast(err.message, true); } });
}
function fitPreviewIframe(iframe) {
  try {
    const wrap = $('previewFrameWrap');
    iframe.style.width = '100%';
    iframe.style.transform = 'none';
    iframe.style.transformOrigin = 'top left';
    const measure = () => {
      const doc = iframe.contentDocument;
      const contentH = Math.max(
        doc && doc.body ? doc.body.scrollHeight : 0,
        doc && doc.documentElement ? doc.documentElement.scrollHeight : 0, 300);
      iframe.style.height = contentH + 'px';
      wrap.style.height = '';
      wrap.style.maxHeight = '70vh';
    };
    measure();
    const imgs = iframe.contentDocument ? iframe.contentDocument.images : [];
    let pending = 0;
    for (let i = 0; i < imgs.length; i++) {
      if (!imgs[i].complete) {
        pending++;
        imgs[i].addEventListener('load', () => { measure(); }, { once: true });
        imgs[i].addEventListener('error', () => { measure(); }, { once: true });
      }
    }
    if (pending) setTimeout(measure, 400);
  } catch (e) {}
}
function closePreviewModal() { $('previewModalOverlay').classList.add('hidden'); }

function downloadPdfFromPreview() {
  run('generateInvoicePdf', [currentPreviewInv], res => {
    triggerDownload('data:application/pdf;base64,' + res.base64, res.filename);
    toast('PDF diunduh');
  });
}
function triggerDownload(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function renderPreviewToCanvas() {
  return new Promise((resolve, reject) => {
    const iframe = $('previewIframe');
    if (!iframe || !iframe.contentDocument) { reject(new Error('Preview belum siap')); return; }
    const doc = iframe.contentDocument;
    const wait = window.waitImagesLoaded ? window.waitImagesLoaded(doc, 3000) : Promise.resolve();
    Promise.resolve(wait).then(() => {
      html2canvas(doc.body, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: true })
        .then(resolve).catch(reject);
    });
  });
}
function downloadJpgFromPreview() {
  showLoading(true);
  renderPreviewToCanvas().then(canvas => {
    showLoading(false);
    triggerDownload(canvas.toDataURL('image/jpeg', 0.92), currentPreviewInv + '.jpg');
    toast('JPG diunduh');
  }).catch(err => { showLoading(false); toast('Gagal render JPG: ' + err.message, true); });
}
function showShareLink(url, msg) {
  setVal('shareLinkInput', url);
  $('shareLinkBox').classList.remove('hidden');
  $('btnShareWa').classList.remove('hidden');
  window._shareUrl = url;
  toast(msg);
}
function shareJpgDriveFromPreview() {
  showLoading(true);
  renderPreviewToCanvas().then(canvas => {
    run('saveJpgToDrive', [currentPreviewInv, canvas.toDataURL('image/jpeg', 0.92)],
      res => showShareLink(res.url, 'Link JPG siap dibagikan'));
  }).catch(err => { showLoading(false); toast('Gagal render JPG: ' + err.message, true); });
}
function shareDriveFromPreview() {
  run('savePdfToDrive', [currentPreviewInv], res => showShareLink(res.url, 'Link PDF siap dibagikan'));
}
function shareWhatsApp() {
  const msg = encodeURIComponent('Halo, berikut invoice ' + currentPreviewInv + ':\n' + (window._shareUrl || ''));
  window.open('https://wa.me/?text=' + msg, '_blank');
}
function copyShareLink() {
  const input = $('shareLinkInput');
  input.select(); input.setSelectionRange(0, 99999);
  try { document.execCommand('copy'); toast('Link disalin'); } catch (e) { toast('Salin manual', true); }
}

/* ---------------- CUSTOMER (autofill repeat order) ---------------- */
function loadCustomersCache() {
  run('getCustomers', [], list => {
    customersCache = list || [];
    const dl = $('clientDatalist');
    if (dl) dl.innerHTML = customersCache.map(c => `<option value="${escapeHtml(c.name)}">`).join('');
  }, { loading: false });
}
function onClientNameChange() {
  const name = val('clientName').trim();
  const match = customersCache.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (match) {
    if (!val('clientPhone').trim()) setVal('clientPhone', match.phone || '');
    if (!val('clientEmail').trim()) setVal('clientEmail', match.email || '');
    if (!val('clientAddress').trim()) setVal('clientAddress', match.address || '');
    toast('Data klien "' + match.name + '" otomatis terisi');
  }
}

/* ---------------- ITEM MASTER ---------------- */
function loadItemsCache() {
  run('getItems', [], items => {
    itemsCache = items || [];
    $('itemsDatalist').innerHTML = itemsCache.map(it => `<option value="${escapeHtml(it.itemName)}">`).join('');
  }, { loading: false });
}
function loadItemsList() {
  loadItemsCache();
  const wrap = $('itemListWrap');
  wrap.innerHTML = '<p class="muted">Memuat...</p>';
  run('getItems', [], items => {
    if (!items.length) { wrap.innerHTML = '<p class="muted">Belum ada item.</p>'; return; }
    wrap.innerHTML = items.map(it => miniCard(
      `<strong>${escapeHtml(it.itemName)}</strong> · ${formatMoney(it.defaultPrice)}`,
      `${escapeHtml(it.category || '-')} · ${escapeHtml(it.unit || '-')}`,
      `editItem('${it.itemId}')`, `deleteItemUi('${it.itemId}')`)).join('');
  }, { loading: false });
}
function onSubmitItemForm(e) {
  e.preventDefault();
  const data = { itemId: val('editItemId'), itemName: val('itemName'), category: val('itemCategory'),
    defaultPrice: parseFloat(val('itemPrice')) || 0, unit: val('itemUnit') };
  if (!data.itemName.trim()) { toast('Nama item wajib diisi', true); return; }
  run('saveItem', [data], () => { toast('Item disimpan'); resetItemForm(); loadItemsList(); });
}
function resetItemForm() {
  $('itemForm').reset(); setVal('editItemId', '');
  setTxt('itemFormTitle', 'Tambah Item Baru');
  show('cancelItemEditBtn', false);
}
function cancelItemEdit() { resetItemForm(); }
function editItem(id) {
  const it = itemsCache.find(x => x.itemId === id); if (!it) return;
  setVal('editItemId', it.itemId); setVal('itemName', it.itemName);
  setVal('itemCategory', it.category || ''); setVal('itemPrice', it.defaultPrice || 0);
  setVal('itemUnit', it.unit || '');
  setTxt('itemFormTitle', 'Edit Item');
  show('cancelItemEditBtn', true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteItemUi(id) {
  if (!confirm('Hapus item ini?')) return;
  run('deleteItem', [id], () => { toast('Item dihapus'); loadItemsList(); });
}

/* ---------------- DASHBOARD ---------------- */
function loadDashboard() {
  renderFilterPills();
  run('getDashboardData', [dashboardFilterCashier], d => {
    try {
      if (!d || typeof d !== 'object') { showDashboardError('Data dashboard kosong / tidak valid dari server.'); return; }
      if (d.cashiers && !cashiersCache.length) {
        cashiersCache = d.cashiers.map(c => ({ cashierId: c.cashierId, name: c.name, phone: '', signatureUrl: '' }));
        renderFilterPills();
      }
      setTxt('statOmzet', formatMoney(Number(d.totalOmzet) || 0));
      setTxt('statHpp', formatMoney(Number(d.totalHpp) || 0));
      setTxt('statProfit', formatMoney(Number(d.grossProfit) || 0));
      setTxt('statMargin', (Number(d.margin) || 0).toFixed(1) + '%');
      setTxt('statCount', Number(d.totalInvoices) || 0);
      setTxt('statPaidUnpaid', (Number(d.paidCount) || 0) + ' / ' + (Number(d.unpaidCount) || 0));
      setTxt('statPiutang', formatMoney(Number(d.piutang) || 0));

      const topItems = Array.isArray(d.topItems) ? d.topItems : [];
      $('topItemsBody').innerHTML = topItems.length
        ? topItems.map(it => `<tr><td>${escapeHtml(it.name)}</td><td>${it.qty}</td></tr>`).join('')
        : '<tr><td colspan="2" class="muted">Belum ada data.</td></tr>';

      _lastDashboardData = d;
      renderCashierProductivity(d);
      renderCompanyProductivity(d);
      wireePiutangDrilldown();
      drawTrendChart(Array.isArray(d.monthlyData) ? d.monthlyData : []);
    } catch (e) {
      showDashboardError('Gagal menampilkan dashboard: ' + (e && e.message ? e.message : e));
    }
  }, { loading: false, onErr: err => showDashboardError('Server error: ' + (err && err.message ? err.message : err)) });
}
function showDashboardError(msg) {
  toast(msg, true);
  const pills = $('cashierFilterPills');
  if (pills && pills.querySelector('.muted'))
    pills.innerHTML = '<span class="muted" style="color:var(--danger)">⚠️ ' + escapeHtml(msg) + '</span>';
  ['statOmzet','statHpp','statProfit','statMargin','statCount','statPaidUnpaid','statPiutang']
    .forEach(id => { const el = $(id); if (el) el.textContent = '⚠️'; });
  const prod = $('cashierProductivityWrap');
  if (prod) prod.innerHTML = '<p class="muted" style="color:var(--danger)">' + escapeHtml(msg) + '</p>';
  const comp = $('companyProductivityWrap');
  if (comp) comp.innerHTML = '<p class="muted" style="color:var(--danger)">' + escapeHtml(msg) + '</p>';
}

function renderFilterPills() {
  const wrap = $('cashierFilterPills');
  if (!wrap) return;
  let html = `<button class="filter-pill${dashboardFilterCashier === '' ? ' active' : ''}" onclick="setDashboardFilter('')">Semua</button>`;
  html += cashiersCache.map(c =>
    `<button class="filter-pill${dashboardFilterCashier === c.cashierId ? ' active' : ''}" onclick="setDashboardFilter('${c.cashierId}')">${escapeHtml(c.name)}</button>`).join('');
  wrap.innerHTML = html;
}
function setDashboardFilter(id) { dashboardFilterCashier = id; loadDashboard(); }

/* ---------------- PRODUKTIVITAS KASIR ---------------- */
function setProdMetric(m) {
  _prodMetric = m;
  document.querySelectorAll('#prodMetricToggle button').forEach(b => b.classList.toggle('active', b.dataset.metric === m));
  if (_lastDashboardData) renderCashierProductivity(_lastDashboardData);
}
function renderCashierProductivity(d) {
  const wrap = $('cashierProductivityWrap'); if (!wrap) return;
  const stats = (d && d.cashierStats) || [], bench = (d && d.cashierBenchmark) || null;
  if (!stats.length) { wrap.innerHTML = '<p class="muted">Belum ada data kasir.</p>'; return; }

  const metric = _prodMetric;
  const pctKey = metric === 'profit' ? 'pctProfit' : (metric === 'count' ? 'pctCount' : 'pctOmzet');
  const sorted = stats.slice().sort((a, b) => {
    const av = metric === 'count' ? a.count : (metric === 'profit' ? a.profit : a.omzet);
    const bv = metric === 'count' ? b.count : (metric === 'profit' ? b.profit : b.omzet);
    return bv - av;
  });
  const fairShare = bench ? bench.fairShare : (100 / sorted.length);
  const maxPct = Math.max.apply(null, sorted.map(s => Math.max(s[pctKey], 0.001)));

  const metricValue = s => metric === 'count' ? s.count + ' inv' : (metric === 'profit' ? formatMoney(s.profit) : formatMoney(s.omzet));
  const ratingClass = r => r === 'Sangat Produktif' ? 'r-top' : r === 'Produktif' ? 'r-good' : r === 'Cukup' ? 'r-mid' : 'r-low';
  const barClass = pct => {
    const ratio = fairShare > 0 ? pct / fairShare : 0;
    return ratio >= 1.2 ? 'good' : ratio >= 0.9 ? '' : ratio >= 0.6 ? 'mid' : 'low';
  };

  let html = `<table class="prod-table"><thead><tr>
      <th>Kasir</th>
      <th class="num">${metric === 'count' ? 'Invoice' : (metric === 'profit' ? 'Profit' : 'Omzet')}</th>
      <th>Capaian thd Total</th><th class="num">Margin</th><th>Penilaian</th>
    </tr></thead><tbody>`;
  sorted.forEach(s => {
    const pct = s[pctKey] || 0, barW = Math.min((pct / maxPct) * 100, 100);
    html += `<tr>
        <td class="prod-name">${escapeHtml(s.name)}
          <div class="mc-sub">${s.count} inv · ${s.paid} lunas / ${s.unpaid} belum</div></td>
        <td class="num">${metricValue(s)}</td>
        <td><div class="prod-bar-wrap">
          <div class="prod-bar-track"><div class="prod-bar-fill ${barClass(pct)}" style="width:${barW}%"></div></div>
          <span class="prod-pct">${pct.toFixed(1)}%</span></div></td>
        <td class="num">${s.margin.toFixed(1)}%</td>
        <td><span class="rating-badge ${ratingClass(s.rating)}">${s.rating}</span></td>
      </tr>`;
  });
  html += `</tbody></table>`;
  if (bench) {
    html += `<div class="import-summary" style="background:#f1f5f9;margin-top:12px">
      Porsi ideal per kasir: <strong>${bench.fairShare.toFixed(1)}%</strong>
      (${bench.nCashier} kasir) · Rata-rata omzet/kasir: <strong>${formatMoney(bench.avgOmzet)}</strong>.
      Kasir dengan capaian di atas porsi ideal berkontribusi lebih besar dari rata-rata.
    </div>`;
  }
  wrap.innerHTML = html;
}

/* ---------------- KINERJA PER PERUSAHAAN ---------------- */
function setCompanyMetric(m) {
  _companyMetric = m;
  document.querySelectorAll('#companyMetricToggle button').forEach(b => b.classList.toggle('active', b.dataset.metric === m));
  if (_lastDashboardData) renderCompanyProductivity(_lastDashboardData);
}
function renderCompanyProductivity(d) {
  const wrap = $('companyProductivityWrap'); if (!wrap) return;
  const stats = (d && d.companyStats) || [];
  if (!stats.length) { wrap.innerHTML = '<p class="muted">Belum ada data perusahaan.</p>'; return; }

  const metric = _companyMetric, pctKey = metric === 'profit' ? 'pctProfit' : 'pctOmzet';
  const sorted = stats.slice().sort((a, b) => metric === 'profit' ? b.profit - a.profit : b.omzet - a.omzet);
  const maxPct = Math.max.apply(null, sorted.map(s => Math.max(s[pctKey], 0.001)));

  let html = `<table class="prod-table"><thead><tr>
      <th>Perusahaan</th><th class="num">${metric === 'profit' ? 'Profit' : 'Omzet'}</th>
      <th>Kontribusi</th><th class="num">Margin</th>
    </tr></thead><tbody>`;
  sorted.forEach(s => {
    const pct = s[pctKey] || 0, barW = Math.min((pct / maxPct) * 100, 100);
    const value = metric === 'profit' ? formatMoney(s.profit) : formatMoney(s.omzet);
    const barCls = metric === 'profit' && s.profit < 0 ? 'low' : '';
    html += `<tr>
      <td class="prod-name">${escapeHtml(s.name)}
        <div class="mc-sub">${s.count} inv · ${s.paid} lunas / ${s.unpaid} belum</div></td>
      <td class="num">${value}</td>
      <td><div class="prod-bar-wrap">
        <div class="prod-bar-track"><div class="prod-bar-fill ${barCls}" style="width:${barW}%"></div></div>
        <span class="prod-pct">${pct.toFixed(1)}%</span></div></td>
      <td class="num">${s.margin.toFixed(1)}%</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

/* ---------------- DRILLDOWN PIUTANG ---------------- */
function wireePiutangDrilldown() {
  const el = $('statPiutang');
  if (!el || el.dataset.wired) return;
  el.dataset.wired = '1';
  const card = el.closest('.stat-card');
  if (card) {
    card.style.cursor = 'pointer';
    card.title = 'Klik untuk lihat invoice belum lunas';
    card.addEventListener('click', goToUnpaidInvoices);
  }
}
function goToUnpaidInvoices() {
  document.querySelector('.tab-btn[data-tab="list"]').click();
  listFilterStatus = 'Unpaid'; listFilterSource = 'all'; listFilterCashier = 'all'; listFilterCompany = 'all';
  syncListFilterUI(); renderInvoiceList();
}

function drawTrendChart(monthly) {
  if (!chartsLoaded || !monthly) return;
  try {
    const data = new google.visualization.DataTable();
    data.addColumn('string', 'Bulan');
    ['Omzet', 'HPP', 'Profit'].forEach(c => data.addColumn('number', c));
    monthly.forEach(m => data.addRow([m.month, m.omzet, m.hpp, m.profit]));
    const isMobile = window.innerWidth < 640;
    new google.visualization.ColumnChart($('trendChart')).draw(data, {
      legend: { position: 'top', textStyle: { fontSize: 11 } },
      chartArea: { width: isMobile ? '80%' : '85%', height: isMobile ? '58%' : '70%', top: 28, bottom: isMobile ? 78 : 40 },
      colors: ['#1e3a5f', '#93c5fd', '#16a34a'],
      bar: { groupWidth: isMobile ? '75%' : '70%' },
      hAxis: {
        textStyle: { fontSize: isMobile ? 9 : 11 },
        slantedText: isMobile,
        slantedTextAngle: 60,
        maxAlternation: 1,
        showTextEvery: 1
      },
      vAxis: { textStyle: { fontSize: isMobile ? 9 : 11 }, format: 'short' }
    });
  } catch (e) {}
}
let _chartResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_chartResizeTimer);
  _chartResizeTimer = setTimeout(() => {
    if (_lastDashboardData) drawTrendChart(_lastDashboardData.monthlyData || []);
  }, 300);
});

/* ---------------- TAB KAS ---------------- */
function loadCashTab() {
  bindCashFilterHandlers();
  const filter = { sortBy: cashSortBy };
  if (cashFilterType !== 'all') filter.type = cashFilterType;
  if (cashFilterAccount !== 'all') filter.accountId = cashFilterAccount;
  if (cashFilterInvoice.trim()) filter.invoiceNumber = cashFilterInvoice.trim();
  $('accountBalanceWrap').innerHTML = '<p class="muted">Memuat...</p>';
  $('cashFlowWrap').innerHTML = '<p class="muted">Memuat...</p>';
  run('getCashData', [filter], d => {
    setTxt('cashTotalBalance', formatMoney(d.totalBalance));
    setTxt('cashTotalIn', formatMoney(d.totalIn));
    setTxt('cashTotalOut', formatMoney(d.totalOut));
    accountsCache = d.accounts.filter(a => a.active).map(a => ({ accountId: a.accountId, name: a.name }));
    renderAccountBalances(d.accounts);
    renderAccountList(d.accounts);
    populateCashAccountFilter(d.accounts);
    renderCashInvoiceSummary(d);
    renderCashFlow(d.flows);
  }, { loading: false });
}
function renderCashInvoiceSummary(d) {
  const box = $('cashInvoiceSummary');
  if (!box) return;
  if (!cashFilterInvoice.trim()) { box.innerHTML = ''; return; }
  const selisih = (d.filteredIn || 0) - (d.filteredOut || 0);
  const jumlah = (d.flows || []).length;
  box.innerHTML = `<div class="import-summary" style="background:#dbeafe">
    Invoice cocok "<strong>${escapeHtml(cashFilterInvoice.trim())}</strong>": <strong>${jumlah}</strong> transaksi kas ditemukan.
    Uang Masuk: <strong class="profit-positive">${formatMoney(d.filteredIn)}</strong> ·
    Uang Keluar: <strong class="profit-negative">${formatMoney(d.filteredOut)}</strong> ·
    Selisih: <strong class="${selisih >= 0 ? 'profit-positive' : 'profit-negative'}">${formatMoney(selisih)}</strong>
    ${jumlah === 0 ? '<br><span class="muted">Belum ada transaksi kas tercatat untuk invoice ini.</span>' : ''}
  </div>`;
}
function renderAccountBalances(accounts) {
  const wrap = $('accountBalanceWrap');
  const active = accounts.filter(a => a.active);
  if (!active.length) { wrap.innerHTML = '<p class="muted">Belum ada akun. Tambahkan di bawah.</p>'; return; }
  const typeLabel = { safe: 'Brankas', personal: 'Pribadi', bank: 'Bank', other: 'Lainnya' };
  wrap.innerHTML = active.map(a => `<div class="acc-card">
      <div class="acc-name">${escapeHtml(a.name)} <span class="acc-badge ${a.type}">${typeLabel[a.type]||a.type}</span></div>
      <div class="acc-balance ${a.balance < 0 ? 'neg' : 'pos'}">${formatMoney(a.balance)}</div>
      <div class="acc-type">Saldo awal: ${formatMoney(a.openingBalance)}</div>
    </div>`).join('');
}
function renderAccountList(accounts) {
  const wrap = $('accountListWrap');
  if (!accounts.length) { wrap.innerHTML = '<p class="muted">Belum ada akun.</p>'; return; }
  wrap.innerHTML = accounts.map(a => `
    <div class="mini-card ${a.active ? '' : 'archived'}">
      <div><div class="mc-main"><strong>${escapeHtml(a.name)}</strong>${a.active ? '' : ' · <span class="muted">(arsip)</span>'}</div>
      <div class="mc-sub">Saldo: ${formatMoney(a.balance)}</div></div>
      <div class="mc-actions">
        <button onclick="editAccount('${a.accountId}')">Edit</button>
        <button class="del-btn" onclick="deleteAccountUi('${a.accountId}')">Hapus</button>
      </div>
    </div>`).join('');
}
function populateCashAccountFilter(accounts) {
  const sel = $('cashFilterAccount'); if (!sel) return;
  const cur = cashFilterAccount;
  sel.innerHTML = '<option value="all">Semua Akun</option>' +
    accounts.map(a => `<option value="${a.accountId}">${escapeHtml(a.name)}</option>`).join('');
  sel.value = cur;
}
function renderCashFlow(flows) {
  const wrap = $('cashFlowWrap');
  if (!flows.length) { wrap.innerHTML = '<p class="muted">Belum ada transaksi kas.</p>'; return; }
  const icon = { in: '⬇️', out: '⬆️', transfer: '🔁' }, sign = { in: '+', out: '−', transfer: '' };
  wrap.innerHTML = flows.map(f => {
    let title, sub;
    if (f.type === 'transfer') {
      title = `${escapeHtml(f.accountName)} → ${escapeHtml(f.toAccountName)}`;
      sub = 'Transfer' + (f.note ? ' · ' + escapeHtml(f.note) : '');
    } else {
      title = escapeHtml(f.accountName);
      sub = (f.category ? escapeHtml(f.category) : (f.type === 'in' ? 'Masuk' : 'Keluar'))
          + (f.invoiceNumber ? ' · ' + escapeHtml(f.invoiceNumber) : '')
          + (f.note ? ' · ' + escapeHtml(f.note) : '');
    }
    const recordedAt = f.createdAt ? new Date(f.createdAt).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    if (recordedAt) sub += ' · dicatat ' + escapeHtml(recordedAt);
    const isHpp = f.sourceType === 'hpp';
    const delBtn = isHpp
      ? `<button class="cf-del" title="Kas HPP — kelola lewat modal HPP invoice terkait" disabled style="opacity:.35;cursor:not-allowed">🔒</button>`
      : `<button class="cf-del" title="Hapus" onclick="deleteCashFlowUi('${f.flowId}')">🗑️</button>`;
    return `<div class="cf-row">
      <div class="cf-icon ${f.type}">${icon[f.type]}</div>
      <div class="cf-main">
        <div class="cf-title">${title}${isHpp ? ' <span class="acc-badge other" style="font-size:9px">HPP</span>' : ''}</div>
        <div class="cf-sub">${escapeHtml(f.date)} · ${sub}</div>
      </div>
      <div class="cf-amount ${f.type}">${sign[f.type]}${formatMoney(f.amount)}</div>
      ${delBtn}
    </div>`;
  }).join('');
}
function bindCashFilterHandlers() {
  bindPillGroup('cashFilterType', v => { cashFilterType = v; loadCashTab(); });
  const fa = $('cashFilterAccount');
  if (fa && !fa.dataset.bound) {
    fa.dataset.bound = '1';
    fa.addEventListener('change', () => { cashFilterAccount = fa.value; loadCashTab(); });
  }
  const fs = $('cashSortBy');
  if (fs && !fs.dataset.bound) {
    fs.dataset.bound = '1';
    fs.addEventListener('change', () => { cashSortBy = fs.value; loadCashTab(); });
  }
  const fi = $('cashFilterInvoice');
  if (fi && !fi.dataset.bound) {
    fi.dataset.bound = '1';
    let t;
    fi.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { cashFilterInvoice = fi.value; loadCashTab(); }, 350);
    });
  }
  const form = $('accountForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', onSubmitAccountForm);
    $('cancelAccountEditBtn').addEventListener('click', resetAccountForm);
  }
}

/* ---- Akun kas: CRUD ---- */
function onSubmitAccountForm(e) {
  e.preventDefault();
  const data = { accountId: val('editAccountId'), name: val('accountName'),
    type: val('accountType'), openingBalance: parseFloat(val('accountOpening')) || 0,
    active: val('accountActive') === 'true', note: val('accountNote') };
  if (!data.name.trim()) { toast('Nama akun wajib diisi', true); return; }
  run('saveAccount', [data], () => { toast('Akun disimpan'); resetAccountForm(); loadCashTab(); loadAccountsCache(); });
}
function resetAccountForm() {
  $('accountForm').reset(); setVal('editAccountId', '');
  setTxt('accountFormTitle', 'Tambah Akun Kas');
  show('cancelAccountEditBtn', false);
  setVal('accountActive', 'true');
}
function editAccount(id) {
  run('getCashData', [{}], d => {
    const a = (d.accounts || []).find(x => x.accountId === id);
    if (!a) { toast('Akun tidak ditemukan', true); return; }
    setVal('editAccountId', a.accountId); setVal('accountName', a.name);
    setVal('accountType', a.type || 'personal'); setVal('accountOpening', a.openingBalance || 0);
    setVal('accountActive', a.active ? 'true' : 'false');
    setTxt('accountFormTitle', 'Edit Akun');
    show('cancelAccountEditBtn', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
function deleteAccountUi(id) {
  if (!confirm('Hapus akun ini? (Hanya bisa jika belum ada transaksi)')) return;
  run('deleteAccount', [id], () => { toast('Akun dihapus'); loadCashTab(); loadAccountsCache(); });
}

/* ---- Modal catat kas ---- */
function fillAccountSelect(selId, selectedVal) {
  fillSelect(selId, accountsCache, 'accountId', 'name', '<option value="">(Tambah akun dulu di tab Kas)</option>');
  if (selectedVal && accountsCache.length) $(selId).value = selectedVal;
}
function openCashModal(type) {
  setVal('cashFlowId', ''); setVal('cashFlowType', type);
  setVal('cashDate', todayStr()); setVal('cashAmount', '');
  setVal('cashCategory', ''); setVal('cashNote', '');
  setTxt('cashModalTitle', { in: '➕ Uang Masuk', out: '➖ Uang Keluar', transfer: '🔁 Transfer Antar Akun' }[type]);
  setTxt('cashAccountLabel', { in: 'Masuk ke Akun', out: 'Keluar dari Akun', transfer: 'Dari Akun' }[type]);
  fillAccountSelect('cashAccount');
  const isTransfer = type === 'transfer';
  show('cashToAccountField', isTransfer);
  show('cashCategoryField', !isTransfer);
  if (isTransfer) fillAccountSelect('cashToAccount');
  $('cashModalOverlay').classList.remove('hidden');
}
function closeCashModal() { $('cashModalOverlay').classList.add('hidden'); }
function saveCashModal() {
  const type = val('cashFlowType');
  const data = { type: type, date: val('cashDate'), accountId: val('cashAccount'),
    amount: parseFloat(val('cashAmount')) || 0, category: val('cashCategory'), note: val('cashNote') };
  if (type === 'transfer') data.toAccountId = val('cashToAccount');
  if (!data.accountId) { toast('Pilih akun. Tambahkan akun dulu bila belum ada.', true); return; }
  if (data.amount <= 0) { toast('Jumlah harus lebih dari 0', true); return; }
  if (type === 'transfer' && data.accountId === data.toAccountId) { toast('Akun asal & tujuan tidak boleh sama', true); return; }
  run('saveCashFlow', [data], () => { toast('Transaksi kas tersimpan'); closeCashModal(); loadCashTab(); }, { lockKey: 'saveCashFlow' });
}
function deleteCashFlowUi(id) {
  if (!confirm('Hapus transaksi kas ini?')) return;
  run('deleteCashFlow', [id], () => { toast('Transaksi dihapus'); loadCashTab(); });
}

/* ---- Modal terima pembayaran ---- */
function openPayModal(inv, total) {
  _payInvoiceNumber = inv;
  setTxt('payInvNumber', inv);
  setVal('payDate', todayStr()); setVal('payAmount', total || 0); setVal('payNote', '');
  $('payMarkPaid').checked = true;
  fillAccountSelect('payAccount');
  $('payModalOverlay').classList.remove('hidden');
}
function closePayModal() { $('payModalOverlay').classList.add('hidden'); }
function savePayModal() {
  const payload = { invoiceNumber: _payInvoiceNumber, date: val('payDate'),
    accountId: val('payAccount'), amount: parseFloat(val('payAmount')) || 0,
    note: val('payNote'), markPaid: $('payMarkPaid').checked };
  if (!payload.accountId) { toast('Pilih akun penerima. Tambahkan akun di tab Kas.', true); return; }
  if (payload.amount <= 0) { toast('Jumlah harus lebih dari 0', true); return; }
  run('recordInvoicePayment', [payload], () => { toast('Penerimaan tersimpan'); closePayModal(); loadInvoiceList(); }, { lockKey: 'recordInvoicePayment:' + _payInvoiceNumber });
}

/* ---------------- IMPOR EXCEL ---------------- */
function initImportUI() {
  const parseBtn = $('importParseBtn'), runBtn = $('importRunBtn');
  if (!parseBtn || parseBtn.dataset.bound) return;
  parseBtn.dataset.bound = '1';
  parseBtn.addEventListener('click', parseImportFile);
  runBtn.addEventListener('click', runImport);
  fillImportCompanyDropdown();
}
function fillImportCompanyDropdown() {
  fillSelect('importCompany', companiesCache, 'companyId', 'name', '<option value="">(Tambah perusahaan dulu)</option>');
}
function _normHeader(h) { return String(h || '').toLowerCase().replace(/[^a-z]/g, ''); }
function parseImportFile() {
  const fileInput = $('importFile'), preview = $('importPreview'), runBtn = $('importRunBtn');
  $('importResult').innerHTML = '';
  runBtn.classList.add('hidden');
  _importParsedRows = null;

  if (typeof XLSX === 'undefined') { toast('Library XLSX belum dimuat. Pastikan koneksi internet aktif.', true); return; }
  if (!fileInput.files || !fileInput.files[0]) { toast('Pilih file Excel dulu', true); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      if (!raw.length) { toast('Sheet kosong', true); return; }

      const h = raw[0].map(_normHeader);
      const find = (...keys) => h.findIndex(x => keys.some(k => x.indexOf(k) !== -1));
      const idx = {
        tanggal: find('tanggal'), nomor: find('nomor', 'pesanan'), kategori: find('kategori'),
        pic: h.findIndex(x => x === 'pic' || x.indexOf('pic') !== -1),
        qty: find('qty'), beli: find('hargabeli', 'beli'), jual: find('hargajual', 'jual'),
        ongkir: find('ongkir', 'disc')
      };
      if (idx.kategori === idx.nomor) idx.kategori = h.findIndex((x, i) => i !== idx.nomor && x.indexOf('kategori') !== -1);
      if (idx.tanggal === -1 || idx.jual === -1) {
        toast('Header tidak dikenali. Pastikan ada kolom Tanggal & Harga Jual.', true);
        preview.innerHTML = '<p class="muted">Header terbaca: ' + escapeHtml(raw[0].join(', ')) + '</p>';
        return;
      }

      const at = (r, k) => idx[k] > -1 ? r[idx[k]] : null;
      const rows = [];
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i]; if (!r) continue;
        const tanggal = at(r, 'tanggal'), nomor = at(r, 'nomor'), kategori = at(r, 'kategori'), pic = at(r, 'pic');
        if (tanggal == null && nomor == null && kategori == null && pic == null) continue;
        rows.push({
          tanggal: _serializeDate(tanggal), nomor: nomor, kategori: kategori, pic: pic,
          qty: at(r, 'qty'), hargaBeli: at(r, 'beli') || 0, hargaJual: at(r, 'jual') || 0, ongkir: at(r, 'ongkir') || 0
        });
      }
      if (!rows.length) { toast('Tidak ada baris data', true); return; }
      _importParsedRows = rows;

      const picSet = {};
      rows.forEach(r => { const p = String(r.pic || '(kosong)').trim(); picSet[p] = (picSet[p] || 0) + 1; });
      const picHtml = Object.keys(picSet).map(p => `${escapeHtml(p)} (${picSet[p]})`).join(', ');

      let html = `<div class="import-summary">
        Terbaca <strong>${rows.length}</strong> baris.<br>
        Kasir (dari PIC) yang akan dibuat/dipakai: <strong>${picHtml}</strong>
      </div>`;
      html += '<table><thead><tr><th>Tanggal</th><th>Kategori</th><th>PIC</th><th>Jual</th><th>Beli</th><th>Ongkir</th></tr></thead><tbody>';
      rows.slice(0, 5).forEach(r => {
        html += `<tr><td>${escapeHtml(String(r.tanggal||''))}</td><td>${escapeHtml(String(r.kategori||''))}</td><td>${escapeHtml(String(r.pic||''))}</td><td>${formatMoney(r.hargaJual)}</td><td>${formatMoney(r.hargaBeli)}</td><td>${formatMoney(r.ongkir)}</td></tr>`;
      });
      html += '</tbody></table><p class="hint">Menampilkan 5 dari ' + rows.length + ' baris.</p>';
      preview.innerHTML = html;
      runBtn.classList.remove('hidden');
      toast('Pratinjau siap — periksa lalu klik Impor');
    } catch (err) {
      toast('Gagal membaca file: ' + err.message, true);
    }
  };
  reader.readAsArrayBuffer(fileInput.files[0]);
}
function _serializeDate(v) {
  if (v == null) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    const local = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  return v;
}
function runImport() {
  if (!_importParsedRows || !_importParsedRows.length) { toast('Belum ada data. Baca file dulu.', true); return; }
  const companyId = val('importCompany');
  if (!companyId) { toast('Pilih perusahaan (kop) dulu. Tambahkan di Pengaturan.', true); return; }
  if (!confirm('Impor ' + _importParsedRows.length + ' baris menjadi invoice? Proses ini menambahkan data baru.')) return;

  $('importResult').innerHTML = '<p class="muted">Mengimpor... mohon tunggu.</p>';
  run('importExcelRows', [{ rows: _importParsedRows, companyId: companyId }], res => {
    let html = `<div class="import-summary" style="background:#dcfce7">✅ Berhasil impor <strong>${res.imported}</strong> invoice.`;
    if (res.skipped) html += ` Dilewati: ${res.skipped}.`;
    html += `</div>`;
    if (res.errors && res.errors.length)
      html += '<p class="hint">Beberapa catatan:</p><ul>' + res.errors.map(e => '<li class="hint">' + escapeHtml(e) + '</li>').join('') + '</ul>';
    $('importResult').innerHTML = html;
    _importParsedRows = null;
    $('importRunBtn').classList.add('hidden');
    $('importPreview').innerHTML = '';
    $('importFile').value = '';
    loadSettings(); loadDashboard();
    toast('Impor selesai');
  }, { onErr: err => {
    $('importResult').innerHTML = '<div class="import-summary" style="background:#fee2e2">❌ ' + escapeHtml(err.message) + '</div>';
    toast(err.message, true);
  }});
}

/* ---------------- HELPERS UMUM ---------------- */
function todayStr() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function formatMoney(v) {
  return currencySymbol + ' ' + (parseFloat(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showLoading(b) { $('loadingOverlay').classList.toggle('hidden', !b); }
function toast(msg, isError) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

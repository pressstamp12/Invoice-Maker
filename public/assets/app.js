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
const dashboardOnlyPaid = true; // Dashboard SELALU hitung omzet/profit dari invoice yang sudah Lunas saja
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
let cashInvoiceOptionsLoaded = false;

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
  // Item & data customer di-lazy-load saat tab "Buat Invoice" dibuka (lihat initTabs()),
  // tidak perlu di-fetch di awal buka app -> mempercepat loading pertama.
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
  $('btnCopyTextSummary').addEventListener('click', () => copyInvoiceSummaryText(currentPreviewInv));
  $('btnDownloadTextSummary').addEventListener('click', () => downloadInvoiceSummaryText(currentPreviewInv));

  $('logoutBtn').addEventListener('click', doLogout);

  wireImageUpload('cashierSigUploadBtn', 'cashierSigFile', 'cashierSignature', 'signatures', updateSigPreview);
  wireImageUpload('companyLogoUploadBtn', 'companyLogoFile', 'companyLogo', 'logos');
  wireImageUpload('itemImageUploadBtn', 'itemImageFile', 'itemImageUrl', 'item-photos', updateItemImagePreview);
  $('itemImageUrl').addEventListener('input', updateItemImagePreview);
  initSimUI();
  initCatalogUI();
  initQuoUI();

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
    quotation: () => { loadCustomersCache(); loadQuotationList(); },
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
    accountsCache = s.activeAccounts || []; // sudah ikut di respons getSettings, hemat 1 request
    renderFilterPills(); // supaya pills kasir langsung muncul, tidak nunggu dashboard selesai duluan
    fillCompanyDropdown();
    fillCashierDropdown();
    fillImportCompanyDropdown();
    fillCompanyBankDropdown();
    loadCompanyList();
    loadCashierList();
    loadBankList();
    checkDriveLinks();
  }, { loading: false });
}
function checkDriveLinks() {
  const box = $('settingsDriveWarning');
  if (!box) return;
  const badCashiers = cashiersCache.filter(c => c.signatureUrl && /drive\.google\.com/i.test(c.signatureUrl));
  const badCompanies = companiesCache.filter(c => c.logoUrl && /drive\.google\.com/i.test(c.logoUrl));
  if (!badCashiers.length && !badCompanies.length) { box.innerHTML = ''; return; }
  let html = `<div class="import-summary" style="background:#fef3c7;color:#92400e">
    ⚠️ <strong>Ditemukan gambar yang pakai link Google Drive</strong> — biasanya GAGAL muncul di PDF/JPG (tapi normal di preview).
    Sebaiknya upload ulang lewat tombol "📤 Upload" di form masing-masing:<br>`;
  if (badCashiers.length) html += `Kasir: ${badCashiers.map(c => escapeHtml(c.name)).join(', ')}<br>`;
  if (badCompanies.length) html += `Perusahaan (logo): ${badCompanies.map(c => escapeHtml(c.name)).join(', ')}`;
  html += `</div>`;
  box.innerHTML = html;
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
  warnIfDriveLink(data.logoUrl, 'Logo perusahaan');
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
  warnIfDriveLink(data.signatureUrl, 'Tanda tangan');
  run('saveCashier', [data], () => { toast('Kasir disimpan'); resetCashierForm(); loadSettings(); });
}
function warnIfDriveLink(url, label) {
  if (url && /drive\.google\.com/i.test(url)) {
    toast(label + ' pakai link Google Drive — biasanya GAGAL muncul di PDF/JPG. Gunakan tombol Upload di atas, bukan paste link Drive.', true);
  }
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
    cashInvoiceOptionsLoaded = false;
    if (window._pendingQuoConvert) {
      const qNo = window._pendingQuoConvert; window._pendingQuoConvert = null;
      run('markQuotationConverted', [qNo, res.invoiceNumber], () => {}, { loading: false });
    }
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
  if (listFilterStatus === 'trash') { loadTrashList(); return; }
  run('getInvoiceList', [], list => {
    _allInvoices = list || [];
    populateListCashierFilter();
    populateListCompanyFilter();
    renderInvoiceList();
  }, { loading: false, onErr: err => { wrap.innerHTML = '<p class="muted">Gagal memuat.</p>'; toast(err.message, true); } });
}
function loadTrashList() {
  const wrap = $('invoiceListWrap');
  wrap.innerHTML = '<p class="muted">Memuat...</p>';
  run('getDeletedInvoices', [], list => renderTrashList(list || []), { loading: false });
}
function renderTrashList(list) {
  const wrap = $('invoiceListWrap');
  if (!list.length) { wrap.innerHTML = '<p class="muted">Sampah kosong — belum ada invoice yang dihapus.</p>'; return; }
  wrap.innerHTML = list.map(inv => `
    <div class="inv-card">
      <div class="inv-card-top">
        <div><div class="inv-no">${escapeHtml(inv.invoiceNumber)}</div>
        <div class="inv-date">${escapeHtml(inv.invoiceDate)}</div></div>
        <span class="status-badge Unpaid" style="cursor:default">🗑️ Dihapus</span>
      </div>
      <div class="inv-card-body">
        <div><span class="lbl">Klien</span><span class="val">${escapeHtml(inv.clientName)}</span></div>
        <div><span class="lbl">Total</span><span class="val">${formatMoney(inv.total)}</span></div>
        <div><span class="lbl">Perusahaan</span><span class="val">${escapeHtml(inv.companyName || '-')}</span></div>
        <div><span class="lbl">Dihapus pada</span><span class="val">${inv.deletedAt ? new Date(inv.deletedAt).toLocaleString('id-ID') : '-'}</span></div>
      </div>
      <div class="inv-actions">
        <button onclick="restoreInvoiceUi('${inv.invoiceNumber}')">♻️ Pulihkan</button>
        <button class="del-btn" onclick="permanentDeleteUi('${inv.invoiceNumber}')">🗑️ Hapus Permanen</button>
      </div>
    </div>`).join('');
}
function restoreInvoiceUi(inv) {
  run('restoreInvoice', [inv], () => { toast('Invoice ' + inv + ' dipulihkan'); loadTrashList(); });
}
function permanentDeleteUi(inv) {
  if (!confirm('Hapus PERMANEN invoice ' + inv + '? Ini TIDAK BISA dibatalkan, termasuk riwayat HPP terkait.')) return;
  run('permanentlyDeleteInvoice', [inv], () => { toast('Invoice dihapus permanen'); loadTrashList(); });
}
function bindListFilterHandlers() {
  bindPillGroup('filterStatus', v => { listFilterStatus = v; loadInvoiceList(); });
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
        <button onclick="copyInvoiceSummaryText('${inv.invoiceNumber}')">📋 Copy Teks</button>
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
  if (!confirm('Pindahkan invoice ' + inv + ' ke Sampah? Bisa dipulihkan lagi nanti dari tab "🗑️ Dihapus".')) return;
  run('deleteInvoice', [inv], () => { toast('Invoice dipindahkan ke Sampah'); loadInvoiceList(); });
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

/* ---------------- PENAWARAN HARGA (Quotation) ---------------- */
let quoItemCounter = 0;
let quoFilterStatus = 'all';
let quoAttachments = []; // [{url, caption}] untuk form penawaran yang sedang dibuka
let _allQuotations = [];
let currentPreviewQuo = '';

function initQuoUI() {
  const addBtn = $('quoAddToggleBtn');
  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => {
      const card = $('quoFormCard');
      if (card.classList.contains('hidden')) { resetQuoForm(false); card.classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else closeQuoFormCard();
    });
  }
  $('quoAddItemBtn').addEventListener('click', () => addQuoItemRow());
  $('quoForm').addEventListener('submit', onSubmitQuotation);
  $('quoCancelBtn').addEventListener('click', closeQuoFormCard);
  $('quoDiscount').addEventListener('input', recalcQuoTotals);
  $('quoTaxPercent').addEventListener('input', recalcQuoTotals);
  $('quoClientName').addEventListener('change', onQuoClientNameChange);
  bindPillGroup('quoFilterStatus', v => { quoFilterStatus = v; renderQuotationList(); });

  $('quoPreviewCloseBtn').addEventListener('click', closeQuoPreviewModal);
  $('quoBtnDownloadPdf').addEventListener('click', downloadQuoPdfFromPreview);
  $('quoBtnDownloadJpg').addEventListener('click', downloadQuoJpgFromPreview);
  $('quoBtnShareDrive').addEventListener('click', shareQuoDriveFromPreview);
  $('quoBtnShareJpgDrive').addEventListener('click', shareQuoJpgDriveFromPreview);
  $('quoBtnShareWa').addEventListener('click', shareQuoWhatsApp);
  $('quoBtnCopyLink').addEventListener('click', copyQuoShareLink);

  const attachBtn = $('quoAttachUploadBtn'), attachFile = $('quoAttachFile');
  attachBtn.addEventListener('click', () => attachFile.click());
  attachFile.addEventListener('change', () => {
    const files = Array.from(attachFile.files || []);
    if (!files.length) return;
    uploadQuoAttachments(files);
    attachFile.value = '';
  });
}
function uploadQuoAttachments(files) {
  if (!files.length) return;
  const file = files[0];
  const rest = files.slice(1);
  run('uploadImage', [file, 'quotation-attachments'], res => {
    quoAttachments.push({ url: res.url, caption: '' });
    renderQuoAttachPreview();
    if (rest.length) uploadQuoAttachments(rest);
    else toast('Gambar ditambahkan');
  }, { onErr: err => { toast('Gagal upload: ' + err.message, true); if (rest.length) uploadQuoAttachments(rest); } });
}
function renderQuoAttachPreview() {
  const wrap = $('quoAttachPreviewWrap');
  wrap.innerHTML = quoAttachments.map((a, i) => `
    <div class="attach-thumb">
      <img src="${escapeHtml(a.url)}" alt="">
      <button type="button" class="attach-remove" onclick="removeQuoAttachment(${i})" title="Hapus">&times;</button>
    </div>`).join('');
}
function removeQuoAttachment(i) {
  quoAttachments.splice(i, 1);
  renderQuoAttachPreview();
}

function closeQuoFormCard() { $('quoFormCard').classList.add('hidden'); resetQuoForm(true); }
function resetQuoForm(alsoResetFields) {
  if (alsoResetFields !== false) { $('quoForm').reset(); }
  setVal('editQuotationNumber', '');
  setTxt('quoFormTitle', 'Buat Penawaran Baru');
  setVal('quoDate', todayStr());
  $('quoItemsBody').innerHTML = ''; quoItemCounter = 0; addQuoItemRow();
  recalcQuoTotals();
  fillSelect('quoCompany', companiesCache, 'companyId', 'name', '<option value="">(Belum ada perusahaan)</option>');
  fillSelect('quoCashier', cashiersCache, 'cashierId', 'name', '', '<option value="">— Tidak ada —</option>');
  quoAttachments = [];
  renderQuoAttachPreview();
}
function addQuoItemRow(item) {
  quoItemCounter++;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="qitem-desc" list="itemsDatalist" placeholder="Nama produk/jasa" value="${item ? escapeHtml(item.desc) : ''}"></td>
    <td><input type="number" class="qitem-qty" min="0" step="any" value="${item ? item.qty : 1}"></td>
    <td><input type="text" class="qitem-unit" placeholder="pcs" value="${item && item.unit ? escapeHtml(item.unit) : ''}"></td>
    <td><input type="number" class="qitem-price" min="0" step="any" value="${item ? item.price : 0}"></td>
    <td class="qitem-subtotal">${formatMoney(0)}</td>
    <td><button type="button" class="remove-item-btn">&times;</button></td>`;
  $('quoItemsBody').appendChild(tr);
  tr.querySelector('.qitem-desc').addEventListener('change', () => {
    const desc = tr.querySelector('.qitem-desc').value.trim();
    const match = itemsCache.find(it => it.itemName.toLowerCase() === desc.toLowerCase());
    if (match) {
      tr.querySelector('.qitem-price').value = match.defaultPrice;
      const unitInput = tr.querySelector('.qitem-unit');
      if (!unitInput.value.trim() && match.unit) unitInput.value = match.unit;
      recalcQuoRow(tr);
    }
  });
  tr.querySelector('.qitem-qty').addEventListener('input', () => recalcQuoRow(tr));
  tr.querySelector('.qitem-price').addEventListener('input', () => recalcQuoRow(tr));
  tr.querySelector('.remove-item-btn').addEventListener('click', () => { tr.remove(); recalcQuoTotals(); });
  recalcQuoRow(tr);
}
function recalcQuoRow(tr) {
  const qty = parseFloat(tr.querySelector('.qitem-qty').value) || 0;
  const price = parseFloat(tr.querySelector('.qitem-price').value) || 0;
  tr.querySelector('.qitem-subtotal').textContent = formatMoney(qty * price);
  recalcQuoTotals();
}
function recalcQuoTotals() {
  let subtotal = 0;
  document.querySelectorAll('#quoItemsBody tr').forEach(tr => {
    subtotal += (parseFloat(tr.querySelector('.qitem-qty').value) || 0) * (parseFloat(tr.querySelector('.qitem-price').value) || 0);
  });
  const discount = parseFloat(val('quoDiscount')) || 0;
  const taxPercent = parseFloat(val('quoTaxPercent')) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = taxable * (taxPercent / 100);
  setTxt('quoSumSubtotal', formatMoney(subtotal));
  setTxt('quoSumDiscount', formatMoney(discount));
  setTxt('quoSumTax', formatMoney(taxAmount));
  setTxt('quoSumTotal', formatMoney(taxable + taxAmount));
}
function onQuoClientNameChange() {
  const name = val('quoClientName').trim();
  const match = customersCache.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (match) {
    if (!val('quoClientPhone').trim()) setVal('quoClientPhone', match.phone || '');
    if (!val('quoClientEmail').trim()) setVal('quoClientEmail', match.email || '');
    if (!val('quoClientAddress').trim()) setVal('quoClientAddress', match.address || '');
  }
}
function onSubmitQuotation(e) {
  e.preventDefault();
  const items = [];
  document.querySelectorAll('#quoItemsBody tr').forEach(tr => {
    const desc = tr.querySelector('.qitem-desc').value.trim();
    const qty = parseFloat(tr.querySelector('.qitem-qty').value) || 0;
    const unit = tr.querySelector('.qitem-unit').value.trim();
    const price = parseFloat(tr.querySelector('.qitem-price').value) || 0;
    if (desc) items.push({ desc, qty, unit, price });
  });
  if (!items.length) { toast('Tambahkan minimal 1 item', true); return; }
  const companyId = val('quoCompany');
  if (!companyId) { toast('Pilih perusahaan (kop) dulu.', true); return; }
  const data = {
    quotationNumber: val('editQuotationNumber'), companyId, cashierId: val('quoCashier'),
    clientName: val('quoClientName'), clientEmail: val('quoClientEmail'), clientPhone: val('quoClientPhone'),
    clientAddress: val('quoClientAddress'), quotationDate: val('quoDate'), validUntil: val('quoValidUntil'),
    items, discount: parseFloat(val('quoDiscount')) || 0, taxPercent: parseFloat(val('quoTaxPercent')) || 0, notes: val('quoNotes'),
    attachments: quoAttachments
  };
  run('saveQuotation', [data], res => {
    toast('Penawaran ' + res.quotationNumber + ' tersimpan');
    closeQuoFormCard();
    loadQuotationList();
  }, { lockKey: 'saveQuotation:' + (data.quotationNumber || 'new') });
}

function loadQuotationList() {
  const wrap = $('quotationListWrap');
  wrap.innerHTML = '<p class="muted">Memuat...</p>';
  run('getQuotationList', [], list => { _allQuotations = list || []; renderQuotationList(); },
    { loading: false, onErr: err => { wrap.innerHTML = '<p class="muted">Gagal memuat.</p>'; toast(err.message, true); } });
}
function renderQuotationList() {
  const wrap = $('quotationListWrap');
  let list = _allQuotations.slice();
  if (quoFilterStatus !== 'all') list = list.filter(q => q.status === quoFilterStatus);
  if (!list.length) { wrap.innerHTML = '<p class="muted">Tidak ada penawaran sesuai filter.</p>'; return; }
  const statusClass = { 'Diterima': 'Paid', 'Ditolak': 'Unpaid', 'Menunggu': 'Unpaid' };
  wrap.innerHTML = list.map(q => `
    <div class="inv-card">
      <div class="inv-card-top">
        <div><div class="inv-no">${escapeHtml(q.quotationNumber)}</div>
        <div class="inv-date">${escapeHtml(q.quotationDate)}${q.validUntil ? ' · berlaku s.d ' + escapeHtml(q.validUntil) : ''}</div></div>
        <button class="status-badge ${statusClass[q.status] || 'Unpaid'}" onclick="cycleQuoStatus('${q.quotationNumber}','${q.status}')">${escapeHtml(q.status)}</button>
      </div>
      <div class="inv-card-body">
        <div><span class="lbl">Klien</span><span class="val">${escapeHtml(q.clientName)}</span></div>
        <div><span class="lbl">Total</span><span class="val">${formatMoney(q.total)}</span></div>
        <div><span class="lbl">Perusahaan</span><span class="val">${escapeHtml(q.companyName || '-')}</span></div>
        <div><span class="lbl">Jadi Invoice</span><span class="val">${q.convertedInvoiceNumber ? escapeHtml(q.convertedInvoiceNumber) : '-'}</span></div>
      </div>
      <div class="inv-actions">
        <button class="prev-btn" onclick="openQuoPreview('${q.quotationNumber}')">👁️ Preview/Share</button>
        ${!q.convertedInvoiceNumber ? `<button onclick="convertQuoToInvoice('${q.quotationNumber}')">🧾 Jadikan Invoice</button>` : ''}
        <button onclick="editQuotation('${q.quotationNumber}')">✏️ Edit</button>
        <button class="del-btn" onclick="deleteQuotationUi('${q.quotationNumber}')">🗑️ Hapus</button>
      </div>
    </div>`).join('');
}
function cycleQuoStatus(qNo, current) {
  const order = ['Menunggu', 'Diterima', 'Ditolak'];
  const next = order[(order.indexOf(current) + 1) % order.length];
  run('updateQuotationStatus', [qNo, next], () => loadQuotationList(), { lockKey: 'quoStatus:' + qNo });
}
function editQuotation(qNo) {
  run('getQuotationByNumber', [qNo], d => {
    document.querySelector('.tab-btn[data-tab="quotation"]').click();
    $('quoFormCard').classList.remove('hidden');
    fillSelect('quoCompany', companiesCache, 'companyId', 'name', '<option value="">(Belum ada perusahaan)</option>');
    fillSelect('quoCashier', cashiersCache, 'cashierId', 'name', '', '<option value="">— Tidak ada —</option>');
    setVal('editQuotationNumber', d.quotationNumber);
    setVal('quoCompany', d.companyId || ''); setVal('quoCashier', d.cashierId || '');
    setVal('quoClientName', d.clientName || ''); setVal('quoClientEmail', d.clientEmail || '');
    setVal('quoClientPhone', d.clientPhone || ''); setVal('quoClientAddress', d.clientAddress || '');
    setVal('quoDate', d.quotationDate || todayStr()); setVal('quoValidUntil', d.validUntil || '');
    setVal('quoDiscount', d.discount || 0); setVal('quoTaxPercent', d.taxPercent || 0); setVal('quoNotes', d.notes || '');
    setTxt('quoFormTitle', 'Edit Penawaran');
    $('quoItemsBody').innerHTML = ''; quoItemCounter = 0;
    (d.items || []).forEach(it => addQuoItemRow(it));
    if (!d.items || !d.items.length) addQuoItemRow();
    recalcQuoTotals();
    quoAttachments = (d.attachments || []).map(a => typeof a === 'string' ? { url: a, caption: '' } : a);
    renderQuoAttachPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
function deleteQuotationUi(qNo) {
  if (!confirm('Hapus penawaran ' + qNo + '? Tidak bisa dibatalkan.')) return;
  run('deleteQuotation', [qNo], () => { toast('Penawaran dihapus'); loadQuotationList(); });
}
function convertQuoToInvoice(qNo) {
  if (!confirm('Jadikan penawaran ' + qNo + ' sebagai Invoice? Data akan disalin ke form Buat Invoice.')) return;
  run('getQuotationByNumber', [qNo], d => {
    document.querySelector('.tab-btn[data-tab="create"]').click();
    setVal('editInvoiceNumber', '');
    setVal('invoiceCompany', d.companyId || ''); setVal('invoiceCashier', d.cashierId || '');
    setVal('clientName', d.clientName || ''); setVal('clientEmail', d.clientEmail || '');
    setVal('clientPhone', d.clientPhone || ''); setVal('clientAddress', d.clientAddress || '');
    setVal('invoiceDate', todayStr()); setVal('dueDate', '');
    setVal('discount', d.discount || 0); setVal('taxPercent', d.taxPercent || 0);
    setVal('notes', 'Dari Penawaran ' + d.quotationNumber + (d.notes ? ' — ' + d.notes : ''));
    $('itemsBody').innerHTML = ''; itemCounter = 0;
    (d.items || []).forEach(it => addItemRow(it));
    recalcTotals();
    window._pendingQuoConvert = qNo;
    toast('Data penawaran dipindah ke form invoice — lengkapi & simpan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---- Preview & share Penawaran (mirror dari preview invoice) ---- */
function openQuoPreview(qNo) {
  currentPreviewQuo = qNo;
  setTxt('quoPreviewNumber', qNo);
  $('quoShareLinkBox').classList.add('hidden');
  $('quoBtnShareWa').classList.add('hidden');
  const fbWrap = $('quoDownloadFallbackWrap');
  if (fbWrap) fbWrap.classList.add('hidden');
  const wrap = $('quoPreviewFrameWrap');
  wrap.innerHTML = '<p class="muted">Memuat preview...</p>';
  $('quoPreviewModalOverlay').classList.remove('hidden');
  run('getQuotationPreviewHtml', [qNo], html => {
    const iframe = document.createElement('iframe');
    wrap.innerHTML = ''; wrap.appendChild(iframe);
    iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
    setTimeout(() => fitPreviewIframe(iframe), 60);
  }, { onErr: err => { wrap.innerHTML = '<p class="muted">Gagal memuat.</p>'; toast(err.message, true); } });
}
function closeQuoPreviewModal() { $('quoPreviewModalOverlay').classList.add('hidden'); }
function triggerQuoDownload(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  const fbWrap = $('quoDownloadFallbackWrap'), fb = $('quoDownloadFallbackLink');
  if (fbWrap && fb) {
    fb.href = href;
    fb.textContent = '📄 Buka ' + name + ' (kalau tidak ada notifikasi)';
    fbWrap.classList.remove('hidden');
  }
}
function downloadQuoPdfFromPreview() {
  run('generateQuotationPdf', [currentPreviewQuo], res => {
    triggerQuoDownload('data:application/pdf;base64,' + res.base64, res.filename);
    toast('PDF diunduh');
  }, { onErr: err => toast('Gagal membuat PDF: ' + err.message, true) });
}
function downloadQuoJpgFromPreview() {
  run('generateQuotationJpg', [currentPreviewQuo], res => {
    triggerQuoDownload(res.dataUrl, res.filename);
    toast('JPG diunduh');
  }, { onErr: err => toast('Gagal membuat JPG: ' + err.message, true) });
}
function showQuoShareLink(url, msg) {
  setVal('quoShareLinkInput', url);
  $('quoShareLinkBox').classList.remove('hidden');
  $('quoBtnShareWa').classList.remove('hidden');
  window._quoShareUrl = url;
  toast(msg);
}
function shareQuoDriveFromPreview() {
  run('saveQuotationPdfToDrive', [currentPreviewQuo], res => showQuoShareLink(res.url, 'Link PDF siap dibagikan'),
    { onErr: err => toast('Gagal membuat PDF: ' + err.message, true) });
}
function shareQuoJpgDriveFromPreview() {
  run('saveQuotationJpgToDrive', [currentPreviewQuo], res => showQuoShareLink(res.url, 'Link JPG siap dibagikan'),
    { onErr: err => toast('Gagal membuat JPG: ' + err.message, true) });
}
function shareQuoWhatsApp() {
  const msg = encodeURIComponent('Halo, berikut penawaran harga ' + currentPreviewQuo + ':\n' + (window._quoShareUrl || ''));
  window.open('https://wa.me/?text=' + msg, '_blank');
}
function copyQuoShareLink() {
  const input = $('quoShareLinkInput');
  input.select(); input.setSelectionRange(0, 99999);
  try { document.execCommand('copy'); toast('Link disalin'); } catch (e) { toast('Salin manual', true); }
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

/* ---------------- RINGKASAN TEKS INVOICE (copy/download) ---------------- */
// 400 invoice pertama masuk lewat Impor Excel dan sudah punya "nomor pesanan" asli
// tertanam di nomor invoicenya sendiri (IMP-tahun-0001 s/d IMP-tahun-0400 = pesanan 1-400).
// Invoice baru yang dibuat lewat form (INV-tahun-0001, dst) melanjutkan urutan itu,
// jadi nomor pesanannya = urutan invoice + 400 (INV-...-0001 = pesanan 401).
// Ganti angka ini kalau titik potongnya bukan 400.
const ORDER_NUMBER_OFFSET = 400;
function orderNumberFromInvoice(invNo) {
  const m = /-([0-9]+)$/.exec(invNo || '');
  const n = m ? parseInt(m[1], 10) : 0;
  return (invNo || '').indexOf('IMP-') === 0 ? n : n + ORDER_NUMBER_OFFSET;
}
function accountNamesFromIds(ids) {
  const uniq = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniq.length) return '-';
  return uniq.map(id => {
    const a = accountsCache.find(x => x.accountId === id);
    return a ? a.name : id;
  }).join(', ');
}
async function buildInvoiceSummaryText(invNo) {
  const [invoice, purchases, cashSummary] = await Promise.all([
    window.API.getInvoiceByNumber(invNo),
    window.API.getPurchasesByInvoice(invNo),
    window.API.getInvoiceCashSummary(invNo)
  ]);
  const cashier = cashiersCache.find(c => c.cashierId === invoice.cashierId);
  const revenue = Math.max((invoice.subtotal || 0) - (invoice.discount || 0), 0); // Harga Jual / Omset
  const hppItemsTotal = (purchases.items || []).reduce((s, it) => s + (it.totalCost || (it.qty || 0) * (it.costPrice || 0)), 0); // Harga Beli
  const hppOthersTotal = (purchases.others || []).reduce((s, o) => s + (o.totalCost || 0), 0); // Ongkir/Diskon (biaya lainnya)
  const profit = revenue - (hppItemsTotal + hppOthersTotal); // Laba

  const beliAcc = accountNamesFromIds((purchases.items || []).map(it => it.accountId));
  const ongkirAcc = accountNamesFromIds((purchases.others || []).map(o => o.accountId));
  const terimaAcc = accountNamesFromIds((cashSummary.flows || []).filter(f => f.type === 'in').map(f => f.accountId));

  const itemsSummary = (invoice.items || [])
    .map(it => (it.qty ? it.qty + 'x ' : '') + it.desc).join(', ') || '-';
  const description = itemsSummary + (invoice.clientName ? ' - ' + invoice.clientName : '');

  const profitNote = buildProfitNote(revenue, hppItemsTotal, hppOthersTotal, profit);
  const sep = '-'.repeat(30);

  return [
    'Nomor Pesanan : ' + orderNumberFromInvoice(invoice.invoiceNumber),
    'Deskripsi Pesanan : ' + description,
    sep,
    '',
    'Harga Beli : ' + formatMoney(hppItemsTotal),
    'Harga Jual : ' + formatMoney(revenue),
    'Ongkir/Diskon : ' + formatMoney(hppOthersTotal),
    'Laba : ' + formatMoney(profit),
    'Cst : ' + (cashier ? cashier.name : '-'),
    '',
    'Note : ' + profitNote,
    sep,
    'Pembayaran Beli : ' + beliAcc,
    'Pembayaran Ongkir/diskon : ' + ongkirAcc,
    'Penerimaan : ' + terimaAcc
  ].join('\n');
}
// Catatan otomatis kalau Laba minus — dihitung murni dari selisih angka yang ada
// (Harga Beli & Ongkir/Diskon vs Harga Jual), bukan tebakan alasan bisnisnya.
function buildProfitNote(revenue, hppItemsTotal, hppOthersTotal, profit) {
  if (profit >= 0) return '-';
  const deficit = Math.abs(profit);
  const parts = [];
  if (hppItemsTotal > 0) parts.push('Harga Beli ' + formatMoney(hppItemsTotal));
  if (hppOthersTotal > 0) parts.push('Ongkir/Diskon ' + formatMoney(hppOthersTotal));
  const costDesc = parts.length ? parts.join(' + ') : 'total modal';
  return 'Minus ' + formatMoney(deficit) + ' — ' + costDesc + ' melebihi Harga Jual (' + formatMoney(revenue) + ').';
}
function copyInvoiceSummaryText(invNo) {
  if (!invNo) return;
  showLoading(true);
  buildInvoiceSummaryText(invNo).then(text => {
    showLoading(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Ringkasan ' + invNo + ' disalin'))
        .catch(() => fallbackCopyText(text));
    } else {
      fallbackCopyText(text);
    }
  }).catch(err => { showLoading(false); toast(err.message, true); });
}
function downloadInvoiceSummaryText(invNo) {
  if (!invNo) return;
  showLoading(true);
  buildInvoiceSummaryText(invNo).then(text => {
    showLoading(false);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'Ringkasan-' + invNo + '.txt');
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Ringkasan ' + invNo + ' diunduh');
  }).catch(err => { showLoading(false); toast(err.message, true); });
}

/* ---------------- PREVIEW & SHARE ---------------- */
function openPreview(inv) {
  currentPreviewInv = inv;
  setTxt('previewInvNumber', inv);
  $('shareLinkBox').classList.add('hidden');
  $('btnShareWa').classList.add('hidden');
  const fbWrap = $('downloadFallbackWrap');
  if (fbWrap) fbWrap.classList.add('hidden');
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
let _lastFallbackUrl = null;
function dataUriToBlob(dataUri) {
  const parts = dataUri.split(',');
  const mimeMatch = /data:([^;]+)/.exec(parts[0]);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function triggerDownload(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();

  // Tombol cadangan "Buka file" pakai Blob URL (bukan data: URI langsung) —
  // data URI panjang kadang gagal dibuka lagi di tab baru pada percobaan berikutnya
  // di beberapa browser HP, Blob URL jauh lebih konsisten untuk dibuka berulang kali.
  const fbWrap = $('downloadFallbackWrap'), fb = $('downloadFallbackLink');
  if (fbWrap && fb) {
    if (_lastFallbackUrl) { URL.revokeObjectURL(_lastFallbackUrl); _lastFallbackUrl = null; }
    try {
      const blobUrl = URL.createObjectURL(dataUriToBlob(href));
      _lastFallbackUrl = blobUrl;
      fb.href = blobUrl;
    } catch (e) {
      fb.href = href; // fallback kalau konversi gagal
    }
    fb.textContent = '📄 Buka ' + name + ' (kalau tidak ada notifikasi)';
    fbWrap.classList.remove('hidden');
  }
}
function downloadJpgFromPreview() {
  run('generateInvoiceJpg', [currentPreviewInv], res => {
    triggerDownload(res.dataUrl, res.filename);
    toast('JPG diunduh');
  }, { onErr: err => toast('Gagal membuat JPG: ' + err.message, true) });
}
function showShareLink(url, msg) {
  setVal('shareLinkInput', url);
  $('shareLinkBox').classList.remove('hidden');
  $('btnShareWa').classList.remove('hidden');
  window._shareUrl = url;
  toast(msg);
}
function shareJpgDriveFromPreview() {
  run('saveJpgToDrive', [currentPreviewInv], res => showShareLink(res.url, 'Link JPG siap dibagikan'),
    { onErr: err => toast('Gagal membuat JPG: ' + err.message, true) });
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

/* ---------------- SIMULASI HARGA (kalkulator lokal, tidak tersimpan ke DB) ---------------- */
let simCounter = 0;
function addSimRow(prefill) {
  simCounter++;
  const tr = document.createElement('tr');
  tr.dataset.id = simCounter;
  tr.innerHTML = `
    <td><input type="text" class="sim-desc" list="itemsDatalist" placeholder="mis. Banner Flexi Korea" value="${prefill ? escapeHtml(prefill.desc) : ''}"></td>
    <td><select class="sim-mode">
      <option value="area">Per m²</option>
      <option value="unit"${prefill ? ' selected' : ''}>Per Satuan</option>
    </select></td>
    <td><input type="number" class="sim-p" min="0" step="any" placeholder="cm"></td>
    <td><input type="number" class="sim-l" min="0" step="any" placeholder="cm"></td>
    <td><input type="number" class="sim-price" min="0" step="any" placeholder="0" value="${prefill ? prefill.price : ''}"></td>
    <td><input type="number" class="sim-qty" min="0" step="any" value="1"></td>
    <td class="sim-subtotal">${formatMoney(0)}</td>
    <td><button type="button" class="remove-item-btn" title="Hapus baris">&times;</button></td>`;
  $('simBody').appendChild(tr);
  tr.querySelector('.sim-desc').addEventListener('change', () => onSimDescChange(tr));
  tr.querySelectorAll('.sim-p, .sim-l, .sim-price, .sim-qty').forEach(el => el.addEventListener('input', () => recalcSimRow(tr)));
  tr.querySelector('.sim-mode').addEventListener('change', () => { toggleSimModeFields(tr); recalcSimRow(tr); });
  tr.querySelector('.remove-item-btn').addEventListener('click', () => { tr.remove(); recalcSimTotal(); });
  toggleSimModeFields(tr);
  recalcSimRow(tr);
}
function toggleSimModeFields(tr) {
  const isArea = tr.querySelector('.sim-mode').value === 'area';
  tr.querySelector('.sim-p').disabled = !isArea;
  tr.querySelector('.sim-l').disabled = !isArea;
  tr.querySelector('.sim-p').placeholder = isArea ? 'cm' : '(tidak dipakai)';
  tr.querySelector('.sim-l').placeholder = isArea ? 'cm' : '(tidak dipakai)';
}
function onSimDescChange(tr) {
  const desc = tr.querySelector('.sim-desc').value.trim();
  const match = itemsCache.find(it => it.itemName.toLowerCase() === desc.toLowerCase());
  if (match) {
    tr.querySelector('.sim-price').value = match.defaultPrice;
    recalcSimRow(tr);
  }
}
function simRowArea(tr) {
  const p = parseFloat(tr.querySelector('.sim-p').value) || 0;
  const l = parseFloat(tr.querySelector('.sim-l').value) || 0;
  return (p / 100) * (l / 100); // cm -> m2
}
function recalcSimRow(tr) {
  const isArea = tr.querySelector('.sim-mode').value === 'area';
  const price = parseFloat(tr.querySelector('.sim-price').value) || 0;
  const qty = parseFloat(tr.querySelector('.sim-qty').value) || 0;
  const perUnit = isArea ? simRowArea(tr) * price : price;
  const subtotal = perUnit * qty;
  tr.querySelector('.sim-subtotal').textContent = formatMoney(subtotal);
  recalcSimTotal();
}
function recalcSimTotal() {
  let total = 0;
  document.querySelectorAll('#simBody tr').forEach(tr => {
    const isArea = tr.querySelector('.sim-mode').value === 'area';
    const price = parseFloat(tr.querySelector('.sim-price').value) || 0;
    const qty = parseFloat(tr.querySelector('.sim-qty').value) || 0;
    const perUnit = isArea ? simRowArea(tr) * price : price;
    total += perUnit * qty;
  });
  setTxt('simGrandTotal', formatMoney(total));
}
function getSimRowsData() {
  const rows = [];
  document.querySelectorAll('#simBody tr').forEach(tr => {
    const desc = tr.querySelector('.sim-desc').value.trim();
    const isArea = tr.querySelector('.sim-mode').value === 'area';
    const p = parseFloat(tr.querySelector('.sim-p').value) || 0;
    const l = parseFloat(tr.querySelector('.sim-l').value) || 0;
    const price = parseFloat(tr.querySelector('.sim-price').value) || 0;
    const qty = parseFloat(tr.querySelector('.sim-qty').value) || 0;
    const area = isArea ? (p / 100) * (l / 100) : 0;
    const perUnit = isArea ? area * price : price;
    if (!desc || qty <= 0) return;
    rows.push({ desc, isArea, p, l, price, qty, area, perUnit, subtotal: perUnit * qty });
  });
  return rows;
}
function simCopyResult() {
  const rows = getSimRowsData();
  if (!rows.length) { toast('Belum ada baris simulasi yang valid', true); return; }
  let text = '📋 SIMULASI HARGA\n\n';
  let total = 0;
  rows.forEach(r => {
    text += '• ' + r.desc + (r.isArea ? ` (${r.p}x${r.l}cm = ${r.area.toFixed(2)}m²)` : '') + '\n';
    text += `  ${r.qty} x ${formatMoney(r.perUnit)} = ${formatMoney(r.subtotal)}\n`;
    total += r.subtotal;
  });
  text += '\nTOTAL: ' + formatMoney(total);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Hasil disalin, siap dikirim ke customer'))
      .catch(() => fallbackCopyText(text));
  } else {
    fallbackCopyText(text);
  }
}
function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Hasil disalin'); } catch (e) { toast('Gagal menyalin', true); }
  ta.remove();
}
function simToInvoice() {
  const rows = getSimRowsData();
  if (!rows.length) { toast('Belum ada baris simulasi yang valid', true); return; }
  closeSimModal();
  document.querySelector('.tab-btn[data-tab="create"]').click();
  $('itemsBody').innerHTML = ''; itemCounter = 0;
  rows.forEach(r => {
    addItemRow({
      desc: r.desc + (r.isArea ? ` (${r.p}x${r.l}cm)` : ''),
      qty: r.qty, unit: r.isArea ? 'm²' : '', price: r.perUnit
    });
  });
  recalcTotals();
  toast('Item dari simulasi sudah dipindah ke form invoice');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openSimModal(prefillItem) {
  $('simModalOverlay').classList.remove('hidden');
  if (prefillItem) addSimRow(prefillItem);
  else if (!$('simBody').children.length) addSimRow();
}
function closeSimModal() { $('simModalOverlay').classList.add('hidden'); }
function initSimUI() {
  const addBtn = $('simAddRowBtn');
  if (!addBtn || addBtn.dataset.bound) return;
  addBtn.dataset.bound = '1';
  addBtn.addEventListener('click', () => addSimRow());
  $('simCopyBtn').addEventListener('click', simCopyResult);
  $('simToInvoiceBtn').addEventListener('click', simToInvoice);
  $('simModalCloseBtn').addEventListener('click', closeSimModal);
  $('simClearBtn').addEventListener('click', () => {
    if (!confirm('Kosongkan semua baris simulasi?')) return;
    $('simBody').innerHTML = ''; simCounter = 0; addSimRow();
  });
}

/* ---------------- UPLOAD GAMBAR (tanda tangan / logo) ---------------- */
function wireImageUpload(btnId, fileId, textInputId, folder, onDoneExtra) {
  const btn = $(btnId), fileInput = $(fileId);
  if (!btn || !fileInput || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    run('uploadImage', [file, folder], res => {
      setVal(textInputId, res.url);
      toast('Gambar berhasil diupload');
      if (onDoneExtra) onDoneExtra();
      fileInput.value = '';
    }, { onErr: err => { toast('Gagal upload: ' + err.message, true); fileInput.value = ''; } });
  });
}

/* ---------------- ITEM MASTER ---------------- */
function loadItemsCache() {
  run('getItems', [], items => {
    itemsCache = items || [];
    $('itemsDatalist').innerHTML = itemsCache.map(it => `<option value="${escapeHtml(it.itemName)}">`).join('');
  }, { loading: false });
}
function loadItemsList() {
  const wrap = $('itemCatalogWrap');
  wrap.innerHTML = '<p class="muted">Memuat...</p>';
  run('getItems', [], items => {
    itemsCache = items || [];
    $('itemsDatalist').innerHTML = itemsCache.map(it => `<option value="${escapeHtml(it.itemName)}">`).join('');
    renderItemCatalog();
  }, { loading: false });
}
function itemIcon(category) {
  const c = (category || '').toLowerCase();
  if (c.indexOf('jasa') !== -1) return '🛠️';
  if (c.indexOf('banner') !== -1 || c.indexOf('spanduk') !== -1 || c.indexOf('flexi') !== -1) return '🖼️';
  if (c.indexOf('stiker') !== -1 || c.indexOf('sticker') !== -1) return '🏷️';
  if (c.indexOf('kertas') !== -1 || c.indexOf('cartoon') !== -1 || c.indexOf('cetak') !== -1) return '📄';
  if (c.indexOf('produk') !== -1) return '📦';
  return '🧾';
}
function renderItemCatalog() {
  const wrap = $('itemCatalogWrap'); if (!wrap) return;
  const q = (($('itemSearchInput') || {}).value || '').toLowerCase().trim();
  const list = q ? itemsCache.filter(it => it.itemName.toLowerCase().indexOf(q) !== -1 || (it.category || '').toLowerCase().indexOf(q) !== -1) : itemsCache;
  if (!list.length) {
    wrap.innerHTML = '<p class="muted">' + (q ? 'Tidak ada item cocok.' : 'Belum ada item. Tambahkan lewat tombol "+ Tambah Item".') + '</p>';
    return;
  }
  wrap.innerHTML = list.map(it => `
    <div class="item-card" onclick="onItemCardTap('${it.itemId}')">
      <div class="ic-actions" onclick="event.stopPropagation()">
        <button onclick="editItem('${it.itemId}')" title="Edit">✏️</button>
        <button class="del-btn" onclick="deleteItemUi('${it.itemId}')" title="Hapus">🗑️</button>
      </div>
      ${it.imageUrl ? `<img src="${escapeHtml(it.imageUrl)}" class="ic-photo" alt="">` : `<div class="ic-icon">${itemIcon(it.category)}</div>`}
      <div class="ic-name">${escapeHtml(it.itemName)}${it.itemType === 'jasa' ? ' <span class="acc-badge other" style="font-size:9px;vertical-align:middle">Jasa</span>' : ''}</div>
      <div class="ic-cat">${escapeHtml(it.category || '-')}</div>
      <div class="ic-price">${formatMoney(it.defaultPrice)}</div>
      <div class="ic-unit">/ ${escapeHtml(it.unit || 'satuan')}${(it.minOrder && it.minOrder > 1) ? ' · Min ' + it.minOrder : ''}</div>
    </div>`).join('');
}
function onItemCardTap(id) {
  const it = itemsCache.find(x => x.itemId === id); if (!it) return;
  openSimModal({ desc: it.itemName, price: it.defaultPrice });
}
function renderItemBranchPriceInputs(pricesMap) {
  pricesMap = pricesMap || {};
  const wrap = $('itemBranchPriceWrap'); if (!wrap) return;
  if (!companiesCache.length) { wrap.innerHTML = '<p class="hint">Belum ada data Perusahaan/Cabang. Tambahkan dulu di Pengaturan.</p>'; return; }
  wrap.innerHTML = companiesCache.map(c => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <div style="flex:1;font-size:13px;font-weight:600">${escapeHtml(c.name)}</div>
      <input type="number" class="branch-price-input" data-company="${c.companyId}" min="0" step="any" placeholder="pakai default" style="width:140px" value="${pricesMap[c.companyId] != null ? pricesMap[c.companyId] : ''}">
    </div>`).join('');
}
function onSubmitItemForm(e) {
  e.preventDefault();
  const data = { itemId: val('editItemId'), itemName: val('itemName'), category: val('itemCategory'),
    defaultPrice: parseFloat(val('itemPrice')) || 0, unit: val('itemUnit'),
    minOrder: parseFloat(val('itemMinOrder')) || 1, terms: val('itemTerms'),
    imageUrl: val('itemImageUrl'), itemType: val('itemType'), description: val('itemDescription') };
  if (!data.itemName.trim()) { toast('Nama item wajib diisi', true); return; }
  warnIfDriveLink(data.imageUrl, 'Gambar produk');
  const branchPrices = {};
  document.querySelectorAll('.branch-price-input').forEach(el => {
    const v = el.value.trim();
    branchPrices[el.dataset.company] = v === '' ? null : parseFloat(v);
  });
  run('saveItem', [data], res => {
    run('saveItemBranchPrices', [res.itemId, branchPrices], () => {
      toast('Item disimpan'); closeItemFormCard(); loadItemsList();
    }, { loading: false });
  });
}
function closeItemFormCard() {
  $('itemFormCard').classList.add('hidden');
  $('itemForm').reset(); setVal('editItemId', ''); setVal('itemMinOrder', 1); setVal('itemType', 'barang');
  setTxt('itemFormTitle', 'Tambah Item Baru');
  renderItemBranchPriceInputs({});
  updateItemImagePreview();
}
function resetItemForm() { closeItemFormCard(); }
function cancelItemEdit() { closeItemFormCard(); }
function updateItemImagePreview() {
  const url = val('itemImageUrl').trim();
  const img = $('itemImagePreview');
  if (url) { img.src = url; img.classList.remove('hidden'); }
  else { img.classList.add('hidden'); img.removeAttribute('src'); }
}
function editItem(id) {
  const it = itemsCache.find(x => x.itemId === id); if (!it) return;
  $('itemFormCard').classList.remove('hidden');
  setVal('editItemId', it.itemId); setVal('itemName', it.itemName);
  setVal('itemCategory', it.category || ''); setVal('itemPrice', it.defaultPrice || 0);
  setVal('itemUnit', it.unit || ''); setVal('itemMinOrder', it.minOrder || 1); setVal('itemTerms', it.terms || '');
  setVal('itemImageUrl', it.imageUrl || ''); setVal('itemType', it.itemType || 'barang'); setVal('itemDescription', it.description || '');
  setTxt('itemFormTitle', 'Edit Item');
  renderItemBranchPriceInputs({});
  updateItemImagePreview();
  run('getItemBranchPrices', [id], prices => renderItemBranchPriceInputs(prices), { loading: false });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteItemUi(id) {
  if (!confirm('Hapus item ini?')) return;
  run('deleteItem', [id], () => { toast('Item dihapus'); loadItemsList(); });
}
function initCatalogUI() {
  const addBtn = $('itemAddToggleBtn');
  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => {
      const card = $('itemFormCard');
      if (card.classList.contains('hidden')) { card.classList.remove('hidden'); renderItemBranchPriceInputs({}); window.scrollTo({ top: 0, behavior: 'smooth' }); $('itemName').focus(); }
      else closeItemFormCard();
    });
  }
  const openBtn = $('openSimBtn');
  if (openBtn && !openBtn.dataset.bound) { openBtn.dataset.bound = '1'; openBtn.addEventListener('click', () => openSimModal()); }
  const search = $('itemSearchInput');
  if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', renderItemCatalog); }
}

/* ---------------- DASHBOARD ---------------- */
function loadDashboard() {
  renderFilterPills();
  run('getDashboardData', [dashboardFilterCashier, dashboardOnlyPaid], d => {
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

let _trendMetric = 'all';
function setTrendMetric(m) {
  _trendMetric = m;
  document.querySelectorAll('#trendMetricToggle button').forEach(b => b.classList.toggle('active', b.dataset.metric === m));
  if (_lastDashboardData) drawTrendChart(_lastDashboardData.monthlyData || []);
}
function drawTrendChart(monthly) {
  if (!chartsLoaded || !monthly) return;
  try {
    const data = new google.visualization.DataTable();
    data.addColumn('string', 'Bulan');
    const metricDefs = { omzet: ['Omzet', '#1e3a5f'], hpp: ['HPP', '#93c5fd'], profit: ['Profit', '#16a34a'] };
    const keys = _trendMetric === 'all' ? ['omzet', 'hpp', 'profit'] : [_trendMetric];
    keys.forEach(k => data.addColumn('number', metricDefs[k][0]));
    monthly.forEach(m => data.addRow([m.month, ...keys.map(k => m[k])]));
    const colors = keys.map(k => metricDefs[k][1]);
    const isMobile = window.innerWidth < 640;
    const single = keys.length === 1;
    new google.visualization.ColumnChart($('trendChart')).draw(data, {
      legend: { position: single ? 'none' : 'top', textStyle: { fontSize: 11 } },
      chartArea: { width: isMobile ? '82%' : '88%', height: isMobile ? (single ? '68%' : '58%') : (single ? '78%' : '70%'), top: 24, bottom: isMobile ? 78 : 40 },
      colors: colors,
      bar: { groupWidth: single ? '55%' : (isMobile ? '75%' : '70%') },
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
  loadCashInvoiceOptions();
  const filter = { sortBy: cashSortBy };
  if (cashFilterType !== 'all') filter.type = cashFilterType;
  if (cashFilterAccount !== 'all') filter.accountId = cashFilterAccount;
  if (cashFilterInvoice) filter.invoiceNumber = cashFilterInvoice;
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
  if (!cashFilterInvoice) { box.innerHTML = ''; return; }
  const selisih = (d.filteredIn || 0) - (d.filteredOut || 0);
  const jumlah = (d.flows || []).length;
  box.innerHTML = `<div class="import-summary" style="background:#dbeafe">
    Invoice <strong>${escapeHtml(cashFilterInvoice)}</strong>: <strong>${jumlah}</strong> transaksi kas ditemukan.
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
function goToInvoicePreview(invNo) {
  document.querySelector('.tab-btn[data-tab="list"]').click();
  openPreview(invNo);
}
function goToInvoiceContext(invNo, sourceType) {
  if (sourceType === 'hpp') {
    openHppModal(invNo);
  } else if (sourceType === 'payment') {
    run('getInvoiceByNumber', [invNo], inv => openPayModal(invNo, inv.total), { onErr: err => toast(err.message, true) });
  } else {
    goToInvoicePreview(invNo);
  }
}
function renderCashFlow(flows) {
  const wrap = $('cashFlowWrap');
  if (!flows.length) { wrap.innerHTML = '<p class="muted">Belum ada transaksi kas.</p>'; return; }
  const icon = { in: '⬇️', out: '⬆️', transfer: '🔁' }, sign = { in: '+', out: '−', transfer: '' };
  wrap.innerHTML = flows.map(f => {
    let title, sub;
    const invoiceTagHtml = f.invoiceNumber
      ? ` · <span class="cf-invoice-link">${escapeHtml(f.invoiceNumber)}</span>`
      : '';
    if (f.type === 'transfer') {
      title = `${escapeHtml(f.accountName)} → ${escapeHtml(f.toAccountName)}`;
      sub = 'Transfer' + invoiceTagHtml + (f.note ? ' · ' + escapeHtml(f.note) : '');
    } else {
      title = escapeHtml(f.accountName);
      sub = (f.category ? escapeHtml(f.category) : (f.type === 'in' ? 'Masuk' : 'Keluar'))
          + invoiceTagHtml
          + (f.note ? ' · ' + escapeHtml(f.note) : '');
    }
    const recordedAt = f.createdAt ? new Date(f.createdAt).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    if (recordedAt) sub += ' · dicatat ' + escapeHtml(recordedAt);
    const isHpp = f.sourceType === 'hpp';
    const delBtn = isHpp
      ? `<button class="cf-del" title="Kas HPP — kelola lewat modal HPP invoice terkait" disabled style="opacity:.35;cursor:not-allowed">🔒</button>`
      : `<button class="cf-del" title="Hapus" onclick="event.stopPropagation();deleteCashFlowUi('${f.flowId}')">🗑️</button>`;
    const clickable = f.invoiceNumber ? ` cf-row-clickable" onclick="goToInvoiceContext('${f.invoiceNumber}','${f.sourceType || ''}')"` : '"';
    return `<div class="cf-row${clickable}>
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
    fi.addEventListener('change', () => { cashFilterInvoice = fi.value; loadCashTab(); });
  }
  const form = $('accountForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', onSubmitAccountForm);
    $('cancelAccountEditBtn').addEventListener('click', resetAccountForm);
  }
}

function loadCashInvoiceOptions() {
  if (cashInvoiceOptionsLoaded) return;
  cashInvoiceOptionsLoaded = true;
  run('getInvoiceNumbers', [], list => {
    const sel = $('cashFilterInvoice');
    if (!sel) return;
    const cur = cashFilterInvoice;
    sel.innerHTML = '<option value="">Semua Invoice</option>' +
      (list || []).map(i => `<option value="${escapeHtml(i.invoiceNumber)}">${escapeHtml(i.invoiceNumber)} — ${escapeHtml(i.clientName || '')}</option>`).join('');
    sel.value = cur;
  }, { loading: false });
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
  fillSelect(selId, accountsCache, 'accountId', 'name',
    '<option value="">(Tambah akun dulu di tab Kas)</option>',
    '<option value="">— Pilih Akun —</option>');
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
  $('payWarnBox').classList.add('hidden');
  $('payModalOverlay').classList.remove('hidden');
  // Cek dulu apakah invoice ini sudah pernah tercatat ada penerimaan — kalau iya,
  // kemungkinan besar ini akan jadi double-input (di tempat Anda, Terima Bayar biasanya cuma 1x).
  run('getInvoiceCashSummary', [inv], summary => {
    if (summary && summary.paidIn > 0) {
      const inFlows = (summary.flows || []).filter(f => f.type === 'in');
      const nameOf = id => { const a = accountsCache.find(x => x.accountId === id); return a ? a.name : id; };
      const detail = inFlows.map(f => `• ${formatMoney(f.amount)} ke akun ${nameOf(f.accountId)} (${f.date})`).join('<br>');
      $('payWarnBox').innerHTML = `⚠️ <strong>Invoice ini sudah tercatat ada penerimaan sebelumnya (total ${formatMoney(summary.paidIn)}):</strong><br>${detail}<br>Pastikan ini memang penerimaan tambahan/susulan, bukan salah pencet ulang.`;
      $('payWarnBox').classList.remove('hidden');
    }
  }, { loading: false });
}
function closePayModal() { $('payModalOverlay').classList.add('hidden'); }
function savePayModal() {
  const payload = { invoiceNumber: _payInvoiceNumber, date: val('payDate'),
    accountId: val('payAccount'), amount: parseFloat(val('payAmount')) || 0,
    note: val('payNote'), markPaid: $('payMarkPaid').checked };
  if (!payload.accountId) { toast('Pilih akun penerima. Tambahkan akun di tab Kas.', true); return; }
  if (payload.amount <= 0) { toast('Jumlah harus lebih dari 0', true); return; }
  if (!$('payWarnBox').classList.contains('hidden')) {
    if (!confirm('Invoice ini sudah pernah tercatat ada penerimaan sebelumnya. Yakin mau tetap catat penerimaan baru ini?')) return;
  }
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

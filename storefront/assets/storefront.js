(function () {
  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const CART_KEY = 'storefront_cart_v1';
  const BRANCH_KEY = 'storefront_branch_v1';

  let items = [];
  let branches = [];
  let branchPrices = {}; // { itemId: price } untuk cabang yang dipilih
  let activeBranch = null; // { companyId, name, phone }
  let cart = {}; // { itemId: qty }

  function loadCart() {
    try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch (e) { cart = {}; }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }
  function cartCount() { return Object.values(cart).reduce((a, b) => a + b, 0); }
  function updateCartBadge() {
    const n = cartCount();
    $('cartBadge').textContent = n;
    $('cartBadge').classList.toggle('hidden', n === 0);
  }

  function formatMoney(v) {
    return 'Rp ' + (parseFloat(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function normalizePhone(phone) {
    let p = String(phone || '').replace(/[^0-9]/g, '');
    if (!p) return '';
    if (p.indexOf('0') === 0) p = '62' + p.slice(1);
    else if (p.indexOf('62') !== 0) p = '62' + p;
    return p;
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

  /* ---------------- PILIH LOKASI ---------------- */
  async function loadBranches() {
    $('branchListWrap').innerHTML = '<p class="muted">Memuat lokasi...</p>';
    const { data, error } = await sb.from('companies').select('company_id, name, address, phone').order('name');
    if (error) { $('branchListWrap').innerHTML = '<p class="muted">Gagal memuat lokasi. Coba refresh halaman.</p>'; return; }
    branches = (data || []).map(r => ({ companyId: r.company_id, name: r.name, address: r.address || '', phone: r.phone || '' }));
    renderBranchList();
  }
  function renderBranchList() {
    const wrap = $('branchListWrap');
    if (!branches.length) { wrap.innerHTML = '<p class="muted">Belum ada lokasi tersedia.</p>'; return; }
    wrap.innerHTML = branches.map(b => `
      <div class="branch-card" onclick="Store.selectBranch('${b.companyId}')">
        <div class="branch-name">📍 ${escapeHtml(b.name)}</div>
        ${b.address ? `<div class="branch-addr">${escapeHtml(b.address)}</div>` : ''}
      </div>`).join('');
  }
  function selectBranch(companyId) {
    const b = branches.find(x => x.companyId === companyId); if (!b) return;
    activeBranch = b;
    localStorage.setItem(BRANCH_KEY, JSON.stringify(b));
    enterCatalog();
  }
  function changeBranch(e) {
    if (e) e.preventDefault();
    localStorage.removeItem(BRANCH_KEY);
    activeBranch = null;
    $('catalogScreen').classList.add('hidden');
    $('branchScreen').classList.remove('hidden');
    loadBranches();
  }
  function enterCatalog() {
    $('branchScreen').classList.add('hidden');
    $('catalogScreen').classList.remove('hidden');
    $('activeBranchName').textContent = activeBranch.name;
    loadItems();
  }

  /* ---------------- KATALOG (per cabang) ---------------- */
  async function loadItems() {
    $('catalogWrap').innerHTML = '<p class="muted">Memuat katalog...</p>';
    const [itemsRes, pricesRes] = await Promise.all([
      sb.from('items').select('*').order('item_name'),
      sb.from('item_branch_prices').select('item_id, price').eq('company_id', activeBranch.companyId)
    ]);
    if (itemsRes.error) { $('catalogWrap').innerHTML = '<p class="muted">Gagal memuat katalog. Coba refresh halaman.</p>'; return; }
    branchPrices = {};
    (pricesRes.data || []).forEach(r => { branchPrices[r.item_id] = r.price; });
    items = (itemsRes.data || []).map(r => ({
      itemId: r.item_id, itemName: r.item_name, category: r.category,
      price: branchPrices[r.item_id] != null ? branchPrices[r.item_id] : r.default_price,
      unit: r.unit, minOrder: r.min_order || 1, terms: r.terms || ''
    }));
    renderCatalog();
  }

  function renderCatalog() {
    const wrap = $('catalogWrap');
    const q = $('searchInput').value.toLowerCase().trim();
    const list = q ? items.filter(it => it.itemName.toLowerCase().indexOf(q) !== -1 || (it.category || '').toLowerCase().indexOf(q) !== -1) : items;
    if (!list.length) { wrap.innerHTML = '<p class="muted">' + (q ? 'Tidak ada item cocok.' : 'Katalog masih kosong.') + '</p>'; return; }
    wrap.innerHTML = list.map(it => `
      <div class="item-card" onclick="Store.openItem('${it.itemId}')">
        <div class="ic-icon">${itemIcon(it.category)}</div>
        <div class="ic-name">${escapeHtml(it.itemName)}</div>
        <div class="ic-cat">${escapeHtml(it.category || '-')}</div>
        <div class="ic-price">${formatMoney(it.price)}</div>
        <div class="ic-unit">/ ${escapeHtml(it.unit || 'satuan')}${it.minOrder > 1 ? ' · Min ' + it.minOrder : ''}</div>
      </div>`).join('');
  }

  let _activeItemId = null;
  function openItem(id) {
    const it = items.find(x => x.itemId === id); if (!it) return;
    _activeItemId = id;
    $('itemModalName').textContent = it.itemName;
    $('itemModalCat').textContent = it.category || '';
    $('itemModalPrice').textContent = formatMoney(it.price) + ' / ' + (it.unit || 'satuan');
    $('itemModalTerms').textContent = it.terms || '';
    $('itemModalTerms').classList.toggle('hidden', !it.terms);
    $('itemQty').value = it.minOrder || 1;
    $('itemQty').min = it.minOrder || 1;
    $('itemModalMin').textContent = it.minOrder > 1 ? ('Minimum order: ' + it.minOrder) : '';
    $('itemModalOverlay').classList.remove('hidden');
  }
  function closeItemModal() { $('itemModalOverlay').classList.add('hidden'); _activeItemId = null; }
  function stepQty(delta) {
    const el = $('itemQty');
    const min = parseFloat(el.min) || 1;
    let v = (parseFloat(el.value) || min) + delta;
    if (v < min) v = min;
    el.value = v;
  }
  function addToCart() {
    if (!_activeItemId) return;
    const it = items.find(x => x.itemId === _activeItemId); if (!it) return;
    const qty = Math.max(parseFloat($('itemQty').value) || it.minOrder, it.minOrder);
    cart[_activeItemId] = (cart[_activeItemId] || 0) + qty;
    saveCart();
    closeItemModal();
    toast(it.itemName + ' ditambahkan ke keranjang');
  }

  function openCart() {
    renderCart();
    $('cartModalOverlay').classList.remove('hidden');
  }
  function closeCart() { $('cartModalOverlay').classList.add('hidden'); }
  function renderCart() {
    const wrap = $('cartItemsWrap');
    const ids = Object.keys(cart).filter(id => cart[id] > 0);
    if (!ids.length) {
      wrap.innerHTML = '<p class="muted">Keranjang masih kosong.</p>';
      $('cartGrandTotal').textContent = formatMoney(0);
      $('checkoutBtn').disabled = true;
      return;
    }
    $('checkoutBtn').disabled = false;
    let total = 0;
    wrap.innerHTML = ids.map(id => {
      const it = items.find(x => x.itemId === id);
      if (!it) return '';
      const qty = cart[id];
      const sub = qty * it.price;
      total += sub;
      return `<div class="cart-row">
        <div class="cart-row-main">
          <div class="cart-row-name">${escapeHtml(it.itemName)}</div>
          <div class="cart-row-sub">${formatMoney(it.price)} x ${qty} = ${formatMoney(sub)}</div>
        </div>
        <div class="cart-row-actions">
          <button onclick="Store.cartStep('${id}',-1)">−</button>
          <span>${qty}</span>
          <button onclick="Store.cartStep('${id}',1)">+</button>
          <button class="cart-del" onclick="Store.cartRemove('${id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
    $('cartGrandTotal').textContent = formatMoney(total);
  }
  function cartStep(id, delta) {
    const it = items.find(x => x.itemId === id);
    const min = it ? it.minOrder : 1;
    cart[id] = (cart[id] || 0) + delta;
    if (cart[id] < min) cart[id] = delta > 0 ? cart[id] : 0;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    renderCart();
  }
  function cartRemove(id) { delete cart[id]; saveCart(); renderCart(); }

  function openCheckout() {
    if (!Object.keys(cart).length) return;
    closeCart();
    $('checkoutFormOverlay').classList.remove('hidden');
  }
  function closeCheckoutForm() { $('checkoutFormOverlay').classList.add('hidden'); }

  function submitCheckout(e) {
    e.preventDefault();
    const name = $('custName').value.trim();
    const phone = $('custPhone').value.trim();
    const notes = $('custNotes').value.trim();
    if (!name || !phone) { toast('Nama & No. HP wajib diisi', true); return; }

    const ids = Object.keys(cart).filter(id => cart[id] > 0);
    if (!ids.length) { toast('Keranjang kosong', true); return; }

    let text = `🛒 *ORDER BARU — ${activeBranch.name}*\n\n`;
    text += `Nama: ${name}\n`;
    text += `No. HP: ${phone}\n\n`;
    text += `Detail Pesanan:\n`;
    let total = 0;
    ids.forEach((id, i) => {
      const it = items.find(x => x.itemId === id); if (!it) return;
      const qty = cart[id], sub = qty * it.price;
      total += sub;
      text += `${i + 1}. ${it.itemName} x ${qty} ${it.unit || ''} = ${formatMoney(sub)}\n`;
    });
    if (notes) text += `\nCatatan: ${notes}\n`;
    text += `\n*TOTAL: ${formatMoney(total)}*\n`;
    text += `\n_Dikirim dari Katalog Online ${window.STORE_NAME || ''}_`;

    const waNumber = normalizePhone(activeBranch.phone);
    if (!waNumber) { toast('Nomor WhatsApp lokasi ini belum diatur, hubungi admin.', true); return; }
    const url = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(text);
    window.open(url, '_blank');

    cart = {}; saveCart();
    closeCheckoutForm();
    $('checkoutForm').reset();
    toast('Membuka WhatsApp... silakan tap Kirim di sana');
  }

  function toast(msg, isError) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('storeName').textContent = window.STORE_NAME || 'Katalog Online';
    $('storeTagline').textContent = window.STORE_TAGLINE || '';
    loadCart();
    updateCartBadge();

    $('searchInput').addEventListener('input', renderCatalog);
    $('cartBtn').addEventListener('click', openCart);
    $('cartCloseBtn').addEventListener('click', closeCart);
    $('checkoutBtn').addEventListener('click', openCheckout);
    $('itemModalCloseBtn').addEventListener('click', closeItemModal);
    $('itemQtyMinus').addEventListener('click', () => stepQty(-1));
    $('itemQtyPlus').addEventListener('click', () => stepQty(1));
    $('addToCartBtn').addEventListener('click', addToCart);
    $('checkoutFormCloseBtn').addEventListener('click', closeCheckoutForm);
    $('checkoutForm').addEventListener('submit', submitCheckout);
    $('changeBranchBtn').addEventListener('click', changeBranch);

    // Kalau sudah pernah pilih lokasi sebelumnya, langsung masuk katalog lokasi itu
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(BRANCH_KEY) || 'null'); } catch (e) {}
    if (saved && saved.companyId) {
      activeBranch = saved;
      enterCatalog();
    } else {
      loadBranches();
    }
  });

  window.Store = { openItem, cartStep, cartRemove, selectBranch };
})();

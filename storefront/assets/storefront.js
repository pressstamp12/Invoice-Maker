(function () {
  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const CART_KEY = 'storefront_cart_v1';
  const BRANCH_KEY = 'storefront_branch_v1';

  let items = [];
  let branches = [];
  let activeBranch = null; // { companyId, name, phone } — boleh null sampai customer checkout/chat
  let cart = {}; // { itemId: qty }
  let pendingAction = null; // 'wa' | 'checkout' — dijalankan setelah lokasi dipilih

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
  // Harga item untuk cabang tertentu; fallback ke harga default kalau cabang itu tidak punya override
  function priceForBranch(it, companyId) {
    if (companyId && it.branchPrices && it.branchPrices[companyId] != null) return it.branchPrices[companyId];
    return it.defaultPrice;
  }

  /* ---------------- LOKASI ---------------- */
  async function loadBranches() {
    const { data, error } = await sb.from('companies').select('company_id, name, address, phone').order('name');
    if (!error) branches = (data || []).map(r => ({ companyId: r.company_id, name: r.name, address: r.address || '', phone: r.phone || '' }));
  }
  function updateBranchLabel() {
    $('activeBranchLabel').textContent = activeBranch ? (activeBranch.name + ' · Ganti') : 'Pilih lokasi saat checkout';
  }
  function openBranchPicker(action) {
    pendingAction = action || null;
    const wrap = $('branchPickerList');
    if (!branches.length) {
      wrap.innerHTML = '<p class="muted">Lokasi belum tersedia. Coba lagi sebentar.</p>';
    } else {
      wrap.innerHTML = branches.map(b => `
        <div class="branch-card" onclick="Store.pickBranch('${b.companyId}')">
          <div class="branch-name">📍 ${escapeHtml(b.name)}</div>
          ${b.address ? `<div class="branch-addr">${escapeHtml(b.address)}</div>` : ''}
        </div>`).join('');
    }
    $('branchPickerOverlay').classList.remove('hidden');
  }
  function closeBranchPicker() { $('branchPickerOverlay').classList.add('hidden'); pendingAction = null; }
  function pickBranch(companyId) {
    const b = branches.find(x => x.companyId === companyId); if (!b) return;
    activeBranch = b;
    localStorage.setItem(BRANCH_KEY, JSON.stringify(b));
    updateBranchLabel();
    $('branchPickerOverlay').classList.add('hidden');
    const action = pendingAction; pendingAction = null;
    if (action === 'wa') openGeneralWa();
    else if (action === 'checkout') openCheckout();
  }
  function onChangeBranchClick(e) { e.preventDefault(); openBranchPicker(null); }
  function onWaFabClick(e) {
    e.preventDefault();
    if (activeBranch) openGeneralWa();
    else openBranchPicker('wa');
  }
  function openGeneralWa() {
    const waNumber = normalizePhone(activeBranch.phone);
    if (!waNumber) { toast('Nomor WhatsApp lokasi ini belum diatur, hubungi admin.', true); return; }
    const msg = encodeURIComponent(`Halo, saya mau tanya-tanya produk ${window.STORE_NAME || ''} (${activeBranch.name}).`);
    window.open('https://wa.me/' + waNumber + '?text=' + msg, '_blank');
  }

  /* ---------------- HERO BANNER (rotasi promo) ---------------- */
  let _heroIdx = 0, _heroTimer = null;
  function renderHero() {
    const promos = window.STORE_PROMOS || [];
    if (!promos.length) { $('heroBanner').classList.add('hidden'); return; }
    const p = promos[_heroIdx % promos.length];
    $('heroTitle').textContent = p.title || '';
    $('heroSubtitle').textContent = p.subtitle || '';
    $('heroDots').innerHTML = promos.map((_, i) => `<span class="hero-dot${i === (_heroIdx % promos.length) ? ' active' : ''}"></span>`).join('');
  }
  function startHeroRotation() {
    const promos = window.STORE_PROMOS || [];
    if (!promos.length) return;
    renderHero();
    if (_heroTimer) clearInterval(_heroTimer);
    if (promos.length > 1) _heroTimer = setInterval(() => { _heroIdx++; renderHero(); }, 4500);
  }

  /* ---------------- KATALOG ---------------- */
  async function loadItems() {
    $('catalogWrap').innerHTML = '<p class="muted">Memuat katalog...</p>';
    const [itemsRes, pricesRes] = await Promise.all([
      sb.from('items').select('*').eq('item_type', 'barang').order('item_name'),
      sb.from('item_branch_prices').select('item_id, company_id, price')
    ]);
    if (itemsRes.error) { $('catalogWrap').innerHTML = '<p class="muted">Gagal memuat katalog. Coba refresh halaman.</p>'; return; }
    const priceMap = {};
    (pricesRes.data || []).forEach(r => {
      if (!priceMap[r.item_id]) priceMap[r.item_id] = {};
      priceMap[r.item_id][r.company_id] = r.price;
    });
    items = (itemsRes.data || []).map(r => {
      const branchPrices = priceMap[r.item_id] || {};
      const allPrices = [r.default_price, ...Object.values(branchPrices)].filter(p => p != null);
      const minPrice = allPrices.length ? Math.min.apply(null, allPrices) : r.default_price;
      return {
        itemId: r.item_id, itemName: r.item_name, category: r.category,
        defaultPrice: r.default_price, branchPrices, minPrice,
        unit: r.unit, minOrder: r.min_order || 1, terms: r.terms || '', imageUrl: r.image_url || '', description: r.description || ''
      };
    });
    renderCatalog();
  }

  function groupByCategory(list) {
    const groups = {}, order = [];
    list.forEach(it => {
      const cat = it.category && it.category.trim() ? it.category.trim() : 'Lainnya';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(it);
    });
    return order.map(cat => ({ category: cat, items: groups[cat] }));
  }
  function slugify(s) { return 'cat-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  function itemCardHtml(it) {
    return `
      <div class="item-card">
        <div class="ic-photo-wrap" onclick="Store.openItem('${it.itemId}')">
          ${it.imageUrl ? `<img src="${escapeHtml(it.imageUrl)}" class="ic-photo" alt="">` : `<div class="ic-icon">${itemIcon(it.category)}</div>`}
        </div>
        <div class="ic-body" onclick="Store.openItem('${it.itemId}')">
          <div class="ic-name">${escapeHtml(it.itemName)}</div>
          <div class="ic-price">Mulai dari <strong>${formatMoney(it.minPrice)}</strong></div>
          <div class="ic-unit">/ ${escapeHtml(it.unit || 'satuan')}${it.minOrder > 1 ? ' · Min ' + it.minOrder : ''}</div>
        </div>
        <button class="ic-buy-btn" onclick="event.stopPropagation();Store.quickAdd('${it.itemId}')">+ Beli</button>
      </div>`;
  }

  function renderCatalog() {
    const wrap = $('catalogWrap');
    const q = $('searchInput').value.toLowerCase().trim();
    const list = q ? items.filter(it => it.itemName.toLowerCase().indexOf(q) !== -1 || (it.category || '').toLowerCase().indexOf(q) !== -1) : items;
    if (!list.length) { wrap.innerHTML = '<p class="muted">' + (q ? 'Tidak ada item cocok.' : 'Katalog masih kosong.') + '</p>'; $('catNavWrap').innerHTML = ''; return; }

    const groups = groupByCategory(list);
    $('catNavWrap').innerHTML = q ? '' : groups.map(g => `<a href="#${slugify(g.category)}" class="cat-nav-pill">${escapeHtml(g.category)}</a>`).join('');

    wrap.innerHTML = groups.map(g => `
      <section class="cat-section" id="${slugify(g.category)}">
        <h2 class="cat-section-title">${escapeHtml(g.category)}</h2>
        <div class="catalog-grid">
          ${g.items.map(itemCardHtml).join('')}
        </div>
      </section>`).join('');
  }

  function quickAdd(id) {
    const it = items.find(x => x.itemId === id); if (!it) return;
    cart[id] = (cart[id] || 0) + (it.minOrder || 1);
    saveCart();
    toast(it.itemName + ' ditambahkan ke keranjang');
  }

  /* ---------------- DETAIL ITEM ---------------- */
  let _activeItemId = null;
  function openItem(id) {
    const it = items.find(x => x.itemId === id); if (!it) return;
    _activeItemId = id;
    const img = $('itemModalImg');
    if (it.imageUrl) { img.src = it.imageUrl; img.classList.remove('hidden'); }
    else { img.classList.add('hidden'); img.removeAttribute('src'); }
    $('itemModalName').textContent = it.itemName;
    $('itemModalCat').textContent = it.category || '';
    $('itemModalPrice').textContent = 'Mulai dari ' + formatMoney(it.minPrice) + ' / ' + (it.unit || 'satuan');
    $('itemModalDesc').textContent = it.description || '';
    $('itemModalDesc').classList.toggle('hidden', !it.description);
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

  /* ---------------- KERANJANG ---------------- */
  function openCart() { renderCart(); $('cartModalOverlay').classList.remove('hidden'); }
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
      const qty = cart[id], price = priceForBranch(it, activeBranch && activeBranch.companyId), sub = qty * price;
      total += sub;
      return `<div class="cart-row">
        <div class="cart-row-main">
          <div class="cart-row-name">${escapeHtml(it.itemName)}</div>
          <div class="cart-row-sub">${formatMoney(price)} x ${qty} = ${formatMoney(sub)}</div>
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

  /* ---------------- CHECKOUT ---------------- */
  function openCheckout() {
    if (!Object.keys(cart).length) return;
    if (!activeBranch) { closeCart(); openBranchPicker('checkout'); return; }
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
    if (!activeBranch) { toast('Pilih lokasi dulu', true); return; }

    const ids = Object.keys(cart).filter(id => cart[id] > 0);
    if (!ids.length) { toast('Keranjang kosong', true); return; }

    let text = `🛒 *ORDER BARU — ${activeBranch.name}*\n\n`;
    text += `Nama: ${name}\n`;
    text += `No. HP: ${phone}\n\n`;
    text += `Detail Pesanan:\n`;
    let total = 0;
    ids.forEach((id, i) => {
      const it = items.find(x => x.itemId === id); if (!it) return;
      const qty = cart[id], price = priceForBranch(it, activeBranch.companyId), sub = qty * price;
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

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(BRANCH_KEY) || 'null'); } catch (e) {}
    if (saved && saved.companyId) activeBranch = saved;
    updateBranchLabel();

    startHeroRotation();
    loadItems();
    loadBranches();

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
    $('changeBranchBtn').addEventListener('click', onChangeBranchClick);
    $('branchPickerCloseBtn').addEventListener('click', closeBranchPicker);
    $('floatingWaBtn').addEventListener('click', onWaFabClick);
  });

  window.Store = { openItem, cartStep, cartRemove, pickBranch, quickAdd };
})();

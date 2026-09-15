// ===== Ligação ao Supabase =====
// Usa o MESMO URL e chave que já colocaste no app React Native — é o
// mesmo projeto Supabase, por isso negócios/pedidos/contas criados de um
// lado aparecem do outro também.
const SUPABASE_URL = 'https://uqixmymxargklrjpvfet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaXhteW14YXJna2xyanB2ZmV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODU4MDAsImV4cCI6MjEwNTA2MTgwMH0.z-otcEwNrzc8SPadUVH-5egSdy0_yqt2hx_LkAEFgik';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Dados auxiliares =====
const CATEGORY_META = {
  restaurante: { label: 'Restaurante', color: 'var(--mango)' },
  mercearia: { label: 'Mercearia', color: 'var(--leaf)' },
  bar: { label: 'Bar', color: 'var(--berry)' },
  hotel: { label: 'Hotel', color: 'var(--night)' },
  guesthouse: { label: 'Guest House', color: 'var(--night-soft)' },
};
const MOTO_BOYS = ['Edson', 'Nelson', 'Edgar', 'Cesaltina'];
const NIGHTS_OPTIONS = ['Hoje', 'Amanhã', 'Sex 18', 'Sáb 19', 'Dom 20'];
const DELIVERY_FEE = 80;
const STEPS_DELIVERY = ['Pedido recebido', 'A preparar', 'Moto boy a caminho', 'Entregue'];
const CODES_DELIVERY = ['recebido', 'preparando', 'a_caminho', 'entregue'];
const STEPS_PICKUP = ['Pedido recebido', 'A preparar', 'Pronto para levantar'];
const CODES_PICKUP = ['recebido', 'preparando', 'pronto_para_levantar'];

function formatMT(v) { return Number(v).toLocaleString('pt-MZ') + ' MT'; }
function val(id) { return document.getElementById(id).value.trim(); }
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function traduzErro(msg) {
  if (!msg) return 'Algo correu mal. Tenta de novo.';
  if (msg.includes('Invalid login credentials')) return 'Email ou password incorretos.';
  if (msg.includes('already registered')) return 'Já existe uma conta com este email.';
  if (msg.includes('Password should be')) return 'A password precisa de pelo menos 6 caracteres.';
  if (msg.includes('Token has expired') || msg.includes('Invalid token')) return 'Código inválido ou expirado.';
  return msg;
}

// ===== Estado em memória =====
let session = null;
let profile = null;
let pendingPhone = null;
let businesses = [];
let currentCategory = 'todos';
let currentBusiness = null;
let selectedNight = 'Hoje';
let currentBooking = null;
let currentOrder = null;
let cart = { businessId: null, businessName: null, lines: [] };
let cartMode = 'entrega';
let trackingStepIndex = 0;
let trackingTimer = null;

// ===== Navegação entre ecrãs =====
function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  updateCartBar();
}
function goAuth(viewId) {
  document.getElementById('main-app').classList.add('hidden');
  showView(viewId || 'view-landing');
}
function goMain() {
  document.getElementById('main-app').classList.remove('hidden');
  showView('view-home');
  if (businesses.length === 0) loadBusinesses();
}
function setActiveTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

function updateCartBar() {
  const bar = document.getElementById('cart-bar');
  const onBusinessView = !document.getElementById('view-business').classList.contains('hidden');
  const isLodging = currentBusiness && (currentBusiness.type === 'hotel' || currentBusiness.type === 'guesthouse');
  const count = cart.lines.reduce((s, l) => s + l.qty, 0);
  if (onBusinessView && !isLodging && count > 0) {
    bar.classList.remove('hidden');
    bar.textContent = `Ver carrinho · ${count} ${count === 1 ? 'item' : 'itens'}`;
  } else {
    bar.classList.add('hidden');
  }
}

// ===== Autenticação =====
function handleSessionChange(newSession, event) {
  session = newSession;
  if (event === 'PASSWORD_RECOVERY') {
    showView('view-new-password');
    return;
  }
  if (session) {
    loadProfile().then(() => goMain());
  } else {
    profile = null;
    businesses = [];
    goAuth('view-landing');
  }
}

async function loadProfile() {
  if (!session) return;
  const { data } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
  profile = data;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideFieldError(id) {
  document.getElementById(id).classList.add('hidden');
}

function wireModeToggles() {
  document.querySelectorAll('.mode-btn[data-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const mode = btn.dataset.mode;
      document.querySelectorAll(`.mode-btn[data-group="${group}"]`).forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById(`${group}-email-fields`).classList.toggle('hidden', mode !== 'email');
      document.getElementById(`${group}-phone-fields`).classList.toggle('hidden', mode !== 'phone');
    });
  });
}

function wireAuthForms() {
  document.getElementById('landing-login-link').addEventListener('click', () => showView('view-login'));
  document.getElementById('landing-cta-hero').addEventListener('click', () => showView('view-signup'));
  document.getElementById('landing-cta-final').addEventListener('click', () => showView('view-signup'));

  document.getElementById('go-signup').addEventListener('click', () => showView('view-signup'));
  document.getElementById('go-login').addEventListener('click', () => showView('view-login'));
  document.getElementById('go-forgot-password').addEventListener('click', () => showView('view-forgot-password'));

  document.getElementById('forgot-submit').addEventListener('click', async () => {
    hideFieldError('forgot-error');
    document.getElementById('forgot-msg').classList.add('hidden');
    const btn = document.getElementById('forgot-submit');
    btn.disabled = true; btn.textContent = 'A enviar…';
    const { error } = await supabaseClient.auth.resetPasswordForEmail(val('forgot-email'), {
      redirectTo: window.location.href.split('#')[0],
    });
    btn.disabled = false; btn.textContent = 'Enviar link';
    if (error) { showFieldError('forgot-error', traduzErro(error.message)); return; }
    const msgEl = document.getElementById('forgot-msg');
    msgEl.textContent = 'Verifica o teu email — enviámos um link para criares uma password nova.';
    msgEl.classList.remove('hidden');
  });

  document.getElementById('new-password-submit').addEventListener('click', async () => {
    hideFieldError('new-password-error');
    const btn = document.getElementById('new-password-submit');
    btn.disabled = true; btn.textContent = 'A guardar…';
    const { error } = await supabaseClient.auth.updateUser({ password: val('new-password') });
    btn.disabled = false; btn.textContent = 'Guardar password';
    if (error) { showFieldError('new-password-error', traduzErro(error.message)); return; }
    loadProfile().then(() => goMain());
  });

  document.getElementById('login-email-submit').addEventListener('click', async () => {
    hideFieldError('login-email-error');
    const btn = document.getElementById('login-email-submit');
    btn.disabled = true; btn.textContent = 'A entrar…';
    const { error } = await supabaseClient.auth.signInWithPassword({ email: val('login-email'), password: val('login-password') });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) showFieldError('login-email-error', traduzErro(error.message));
  });

  document.getElementById('login-phone-submit').addEventListener('click', async () => {
    hideFieldError('login-phone-error');
    const phone = val('login-phone').replace(/\s/g, '');
    const btn = document.getElementById('login-phone-submit');
    btn.disabled = true; btn.textContent = 'A enviar…';
    const { error } = await supabaseClient.auth.signInWithOtp({ phone });
    btn.disabled = false; btn.textContent = 'Enviar código';
    if (error) { showFieldError('login-phone-error', traduzErro(error.message)); return; }
    pendingPhone = phone;
    document.getElementById('otp-subtitle').textContent = `Enviámos um código por SMS para ${phone}.`;
    showView('view-verify-otp');
  });

  document.getElementById('signup-email-submit').addEventListener('click', async () => {
    hideFieldError('signup-email-error');
    document.getElementById('signup-confirm-msg').classList.add('hidden');
    const btn = document.getElementById('signup-email-submit');
    btn.disabled = true; btn.textContent = 'A criar…';
    const { data, error } = await supabaseClient.auth.signUp({
      email: val('signup-email'),
      password: val('signup-password'),
      options: { data: { name: val('signup-name') } },
    });
    btn.disabled = false; btn.textContent = 'Criar conta';
    if (error) { showFieldError('signup-email-error', traduzErro(error.message)); return; }
    if (!data.session) {
      const msgEl = document.getElementById('signup-confirm-msg');
      msgEl.textContent = 'Enviámos um email de confirmação. Confirma e depois volta aqui para entrar.';
      msgEl.classList.remove('hidden');
    }
  });

  document.getElementById('signup-phone-submit').addEventListener('click', async () => {
    hideFieldError('signup-phone-error');
    const phone = val('signup-phone').replace(/\s/g, '');
    const btn = document.getElementById('signup-phone-submit');
    btn.disabled = true; btn.textContent = 'A enviar…';
    const { error } = await supabaseClient.auth.signInWithOtp({ phone, options: { data: { name: val('signup-name') } } });
    btn.disabled = false; btn.textContent = 'Enviar código';
    if (error) { showFieldError('signup-phone-error', traduzErro(error.message)); return; }
    pendingPhone = phone;
    document.getElementById('otp-subtitle').textContent = `Enviámos um código por SMS para ${phone}.`;
    showView('view-verify-otp');
  });

  document.getElementById('otp-submit').addEventListener('click', async () => {
    hideFieldError('otp-error');
    const btn = document.getElementById('otp-submit');
    btn.disabled = true; btn.textContent = 'A confirmar…';
    const { error } = await supabaseClient.auth.verifyOtp({ phone: pendingPhone, token: val('otp-token'), type: 'sms' });
    btn.disabled = false; btn.textContent = 'Confirmar';
    if (error) { showFieldError('otp-error', traduzErro(error.message)); return; }
    pendingPhone = null;
    // Sucesso: onAuthStateChange trata da troca de ecrã sozinho.
  });
}

// ===== Negócios (Início) =====
function mapBusiness(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isOpen: row.is_open,
    distanceKm: Number(row.distance_km || 0),
    rating: Number(row.rating || 0),
    image: row.image_url,
    items: (row.products || []).map((p) => ({ id: p.id, name: p.name, price: p.price })),
    rooms: (row.rooms || []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, pricePerNight: r.price_per_night })),
  };
}

async function loadBusinesses() {
  const statusEl = document.getElementById('home-status');
  statusEl.textContent = 'A carregar…';
  document.getElementById('business-list').innerHTML = '';
  try {
    const { data, error } = await supabaseClient.from('businesses').select('*, products(*), rooms(*)').order('name');
    if (error) throw error;
    businesses = data.map(mapBusiness);
    statusEl.textContent = '';
    renderBusinessList();
  } catch (e) {
    statusEl.innerHTML = 'Não consegui carregar os negócios. Confirma a ligação ao Supabase.<br/><button id="retry-businesses" class="btn-link" style="width:auto;display:inline;">Tentar novamente</button>';
    document.getElementById('retry-businesses').addEventListener('click', loadBusinesses);
  }
}

function renderCategoryPills() {
  const cats = ['todos', ...Object.keys(CATEGORY_META)];
  const el = document.getElementById('category-pills');
  el.innerHTML = cats.map((c) => `<button class="pill ${c === currentCategory ? 'active' : ''}" data-cat="${c}">${c === 'todos' ? 'Todos' : CATEGORY_META[c].label}</button>`).join('');
  el.querySelectorAll('.pill').forEach((btn) => btn.addEventListener('click', () => {
    currentCategory = btn.dataset.cat;
    renderCategoryPills();
    renderBusinessList();
  }));
}

function renderBusinessList() {
  const list = currentCategory === 'todos' ? businesses : businesses.filter((b) => b.type === currentCategory);
  const el = document.getElementById('business-list');
  if (list.length === 0) {
    el.innerHTML = '<p class="center-msg">Nada por aqui ainda nesta categoria.</p>';
    return;
  }
  el.innerHTML = list.map((b) => {
    const meta = CATEGORY_META[b.type];
    return `
    <div class="business-card" data-id="${b.id}">
      <div class="bar" style="background:${meta.color}"></div>
      <img src="${b.image}" alt="" />
      <div class="info">
        <div class="top-line">
          <span class="name">${escapeHtml(b.name)}</span>
          <span class="dot" style="background:${b.isOpen ? 'var(--leaf)' : 'var(--text-muted)'}"></span>
        </div>
        <p class="meta">${meta.label} · ${b.distanceKm.toFixed(1)} km · ★ ${b.rating}</p>
        <p class="status" style="color:${b.isOpen ? 'var(--leaf)' : 'var(--text-muted)'}">${b.isOpen ? 'Aberto agora' : 'Fechado'}</p>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.business-card').forEach((card) => card.addEventListener('click', () => openBusiness(card.dataset.id)));
}

// ===== Detalhe do negócio =====
function openBusiness(id) {
  currentBusiness = businesses.find((b) => b.id === id) || null;
  selectedNight = 'Hoje';
  showView('view-business');
  if (!currentBusiness) {
    document.getElementById('business-detail').innerHTML = '<p class="center-msg">Negócio não encontrado.</p>';
    return;
  }
  renderBusinessDetail();
}

function renderBusinessDetail() {
  const b = currentBusiness;
  const meta = CATEGORY_META[b.type];
  const isLodging = b.type === 'hotel' || b.type === 'guesthouse';
  let html = `
    <img class="hero-img" src="${b.image}" alt="" />
    <p class="category-label" style="color:${meta.color}">${meta.label.toUpperCase()}</p>
    <h1 class="display">${escapeHtml(b.name)}</h1>
    <p class="business-meta">${b.distanceKm.toFixed(1)} km · ★ ${b.rating} · <strong style="color:${b.isOpen ? 'var(--leaf)' : 'var(--text-muted)'}">${b.isOpen ? 'Aberto agora' : 'Fechado'}</strong></p>
  `;
  if (isLodging) {
    html += `
      <h2 class="section-title">Check-in</h2>
      <div class="date-pill-row" id="date-pills"></div>
      <h2 class="section-title">Quartos disponíveis</h2>
      <div id="room-list"></div>
      <div id="booking-banner"></div>`;
  } else {
    html += `<h2 class="section-title">Cardápio</h2><div id="product-list"></div>`;
  }
  document.getElementById('business-detail').innerHTML = html;
  if (isLodging) { renderDatePills(); renderRoomList(); } else { renderProductList(); }
  updateCartBar();
}

function renderDatePills() {
  const el = document.getElementById('date-pills');
  el.innerHTML = NIGHTS_OPTIONS.map((n) => `<button class="date-pill ${n === selectedNight ? 'active' : ''}" data-night="${n}">${n}</button>`).join('');
  el.querySelectorAll('.date-pill').forEach((btn) => btn.addEventListener('click', () => { selectedNight = btn.dataset.night; renderDatePills(); }));
}

function renderRoomList() {
  const el = document.getElementById('room-list');
  el.innerHTML = currentBusiness.rooms.map((r) => `
    <div class="room-row">
      <div>
        <p class="name">${escapeHtml(r.name)}</p>
        <p class="capacity">Até ${r.capacity} pessoas</p>
        <p class="price">${formatMT(r.pricePerNight)} / noite</p>
      </div>
      <button class="btn-dark-pill" data-room-id="${r.id}">Reservar</button>
    </div>`).join('');
  el.querySelectorAll('[data-room-id]').forEach((btn) => btn.addEventListener('click', () => handleReserve(btn.dataset.roomId, btn)));
}

async function handleReserve(roomId, btn) {
  const room = currentBusiness.rooms.find((r) => r.id === roomId);
  btn.disabled = true; btn.textContent = 'A reservar…';
  try {
    const { data, error } = await supabaseClient.from('bookings').insert({
      customer_id: session.user.id,
      business_id: currentBusiness.id,
      business_name: currentBusiness.name,
      room_name: room.name,
      capacity: room.capacity,
      price_per_night: room.pricePerNight,
      check_in: selectedNight,
      code: 'PENDING',
    }).select().single();
    if (error) throw error;
    const code = 'PT-' + data.id.slice(0, 4).toUpperCase();
    const { data: updated, error: err2 } = await supabaseClient.from('bookings').update({ code }).eq('id', data.id).select().single();
    if (err2) throw err2;
    currentBooking = updated;
    const banner = document.getElementById('booking-banner');
    banner.innerHTML = `<div class="confirm-banner" id="view-booking-link"><p>Ver confirmação da reserva de ${escapeHtml(room.name)} →</p></div>`;
    document.getElementById('view-booking-link').addEventListener('click', () => { renderBookingConfirmation(); showView('view-booking-confirmation'); });
  } catch (e) {
    alert('Não consegui confirmar a reserva. Tenta de novo.');
  } finally {
    btn.disabled = false; btn.textContent = 'Reservar';
  }
}

function renderBookingConfirmation() {
  const b = currentBooking;
  document.getElementById('booking-confirmation-content').innerHTML = `
    <p class="badge-leaf">Reserva confirmada</p>
    <h1 class="display">${escapeHtml(b.room_name)}</h1>
    <p class="subtitle">${escapeHtml(b.business_name)}</p>
    <div class="info-card">
      <div class="info-row"><span>Check-in</span><span class="value">${escapeHtml(b.check_in)}</span></div>
      <div class="info-row"><span>Capacidade</span><span class="value">Até ${b.capacity} pessoas</span></div>
      <div class="info-row"><span>Valor por noite</span><span class="value">${formatMT(b.price_per_night)}</span></div>
      <div class="info-row"><span>Código da reserva</span><span class="value">${b.code}</span></div>
    </div>
    <p class="subtitle">Mostra este código na receção. Chegando, o teu quarto já vai estar pronto.</p>
    <button class="btn-primary" id="booking-done-btn">Voltar ao início</button>
  `;
  document.getElementById('booking-done-btn').addEventListener('click', () => { showView('view-home'); setActiveTab('home'); });
}

// ===== Cardápio / carrinho =====
function qtyFor(itemId) {
  const l = cart.lines.find((l) => l.id === itemId);
  return l ? l.qty : 0;
}

function renderProductList() {
  const el = document.getElementById('product-list');
  el.innerHTML = currentBusiness.items.map((item) => {
    const qty = qtyFor(item.id);
    return `<div class="product-row">
      <div>
        <p class="name">${escapeHtml(item.name)}</p>
        <p class="price">${formatMT(item.price)}</p>
      </div>
      ${qty > 0
        ? `<div class="qty-stepper"><button data-action="remove" data-id="${item.id}">−</button><span>${qty}</span><button data-action="add" data-id="${item.id}">+</button></div>`
        : `<button class="btn-outline" data-action="add" data-id="${item.id}">Adicionar</button>`}
    </div>`;
  }).join('');
  el.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', () => {
    const item = currentBusiness.items.find((i) => i.id === btn.dataset.id);
    if (btn.dataset.action === 'add') addToCart(item); else changeQty(btn.dataset.id, -1);
  }));
}

function addToCart(item) {
  if (cart.businessId && cart.businessId !== currentBusiness.id) {
    cart = { businessId: currentBusiness.id, businessName: currentBusiness.name, lines: [{ ...item, qty: 1 }] };
  } else {
    cart.businessId = currentBusiness.id;
    cart.businessName = currentBusiness.name;
    const existing = cart.lines.find((l) => l.id === item.id);
    if (existing) existing.qty += 1; else cart.lines.push({ ...item, qty: 1 });
  }
  renderProductList();
  updateCartBar();
}

function changeQty(itemId, delta) {
  const line = cart.lines.find((l) => l.id === itemId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart.lines = cart.lines.filter((l) => l.id !== itemId);
  if (cart.lines.length === 0) { cart.businessId = null; cart.businessName = null; }
  renderProductList();
  updateCartBar();
}

function renderCart() {
  const content = document.getElementById('cart-content');
  if (cart.lines.length === 0) {
    content.innerHTML = `<h1 class="display">O teu carrinho está vazio</h1><p class="subtitle">Escolhe um negócio na página inicial para começar.</p>`;
    return;
  }
  const total = cart.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const fee = cartMode === 'entrega' ? DELIVERY_FEE : 0;
  const grand = total + fee;
  content.innerHTML = `
    <h1 class="display">O teu pedido</h1>
    <p class="subtitle">${escapeHtml(cart.businessName || '')}</p>
    <div>${cart.lines.map((l) => `<div class="cart-line"><span>${l.qty}× ${escapeHtml(l.name)}</span><span>${formatMT(l.price * l.qty)}</span></div>`).join('')}</div>
    <div class="mode-row">
      <button class="mode-btn ${cartMode === 'entrega' ? 'active' : ''}" data-cart-mode="entrega">Entregar em casa</button>
      <button class="mode-btn ${cartMode === 'recolha' ? 'active' : ''}" data-cart-mode="recolha">Ir buscar</button>
    </div>
    <div style="margin-top:20px;">
      <div class="summary-row"><span>Subtotal</span><span>${formatMT(total)}</span></div>
      <div class="summary-row"><span>Taxa de entrega</span><span>${fee === 0 ? 'Grátis' : formatMT(fee)}</span></div>
      <div class="summary-row total"><span>Total</span><span class="value">${formatMT(grand)}</span></div>
    </div>
    <p id="cart-error" class="error hidden"></p>
    <button class="btn-primary" id="confirm-order-btn">Confirmar pedido</button>
  `;
  document.querySelectorAll('[data-cart-mode]').forEach((btn) => btn.addEventListener('click', () => { cartMode = btn.dataset.cartMode; renderCart(); }));
  document.getElementById('confirm-order-btn').addEventListener('click', handleConfirmOrder);
}

async function handleConfirmOrder() {
  const btn = document.getElementById('confirm-order-btn');
  btn.disabled = true; btn.textContent = 'A enviar…';
  const fee = cartMode === 'entrega' ? DELIVERY_FEE : 0;
  const grand = cart.lines.reduce((s, l) => s + l.price * l.qty, 0) + fee;
  try {
    const { data, error } = await supabaseClient.from('orders').insert({
      customer_id: session.user.id,
      business_id: cart.businessId,
      business_name: cart.businessName,
      items: cart.lines,
      mode: cartMode,
      total: grand,
      status: 'recebido',
    }).select().single();
    if (error) throw error;
    currentOrder = data;
    currentOrder._motoBoy = MOTO_BOYS[Math.floor(Math.random() * MOTO_BOYS.length)];
    cart = { businessId: null, businessName: null, lines: [] };
    trackingStepIndex = 0;
    showView('view-order-tracking');
    advanceTracking();
  } catch (e) {
    document.getElementById('cart-error').textContent = 'Não consegui enviar o pedido. Tenta de novo.';
    document.getElementById('cart-error').classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
  }
}

// ===== Acompanhamento do pedido =====
function advanceTracking() {
  const steps = currentOrder.mode === 'entrega' ? STEPS_DELIVERY : STEPS_PICKUP;
  const codes = currentOrder.mode === 'entrega' ? CODES_DELIVERY : CODES_PICKUP;
  const isMotoStage = currentOrder.mode === 'entrega' && codes[trackingStepIndex] === 'a_caminho';
  supabaseClient.from('orders').update({
    status: codes[trackingStepIndex],
    ...(isMotoStage ? { moto_boy: currentOrder._motoBoy } : {}),
  }).eq('id', currentOrder.id).then(() => {}).catch(() => {});
  renderOrderTracking();
  clearTimeout(trackingTimer);
  if (trackingStepIndex < steps.length - 1) {
    trackingTimer = setTimeout(() => { trackingStepIndex++; advanceTracking(); }, 2500);
  }
}

function renderOrderTracking() {
  const steps = currentOrder.mode === 'entrega' ? STEPS_DELIVERY : STEPS_PICKUP;
  const isDeliveryStage = currentOrder.mode === 'entrega' && trackingStepIndex >= 2;
  let html = `
    <p class="eyebrow">${escapeHtml(currentOrder.business_name)}</p>
    <h1 class="display">${formatMT(currentOrder.total)}</h1>
    <div style="margin-top:24px;">
      ${steps.map((label, i) => {
        const done = i <= trackingStepIndex;
        return `<div class="step-row"><div class="step-dot ${done ? 'done' : ''}"></div><span class="step-label ${done ? 'done' : ''}">${label}</span></div>`;
      }).join('')}
    </div>`;
  if (isDeliveryStage) {
    html += `<div class="moto-card">
      <p class="eyebrow">O teu moto boy</p>
      <p class="name">${currentOrder._motoBoy}</p>
      <p class="subtitle" style="margin:0;">Foi notificado e está a caminho da morada de entrega.</p>
    </div>`;
  }
  if (trackingStepIndex === steps.length - 1) {
    html += `<button class="btn-primary" id="tracking-done-btn">Voltar ao início</button>`;
  }
  document.getElementById('order-tracking-content').innerHTML = html;
  const doneBtn = document.getElementById('tracking-done-btn');
  if (doneBtn) doneBtn.addEventListener('click', () => { showView('view-home'); setActiveTab('home'); });
}

// ===== Perfil =====
function renderProfile() {
  const identifier = (session && (session.user.email || session.user.phone)) || '';
  const firstName = profile && profile.name ? profile.name.split(' ')[0] : '';
  document.getElementById('profile-content').innerHTML = `
    <h1 class="display">Olá${firstName ? (', ' + escapeHtml(firstName)) : ''}</h1>
    <p class="subtitle">${escapeHtml(identifier)}</p>
    <p class="subtitle">Histórico de pedidos e reservas vão aparecer aqui na próxima fase.</p>
    <button class="btn-danger-outline" id="logout-btn">Sair da conta</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());
}

// ===== Início =====
document.addEventListener('DOMContentLoaded', () => {
  wireModeToggles();
  wireAuthForms();
  renderCategoryPills();

  document.querySelectorAll('.back-btn').forEach((btn) => btn.addEventListener('click', () => {
    showView('view-' + btn.dataset.back);
    setActiveTab(btn.dataset.back);
  }));

  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    if (btn.dataset.tab === 'home') showView('view-home');
    else { renderProfile(); showView('view-profile'); }
  }));

  document.getElementById('cart-bar').addEventListener('click', () => { renderCart(); showView('view-cart'); });

  // onAuthStateChange já dispara uma vez ao carregar, com a sessão guardada
  // (ou null); getSession() aqui é só reforço, para não depender só disso.
  supabaseClient.auth.onAuthStateChange((event, newSession) => handleSessionChange(newSession, event));
  supabaseClient.auth.getSession().then(({ data }) => { if (!session) handleSessionChange(data.session); });
});

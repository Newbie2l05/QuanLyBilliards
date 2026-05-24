let qrTableId = null;
let qrOrderData = null;
let qrCart = new Map();
let qrSubmitting = false;
let qrClientCooldownUntil = 0;

document.addEventListener('DOMContentLoaded', () => {
    qrTableId = Number(window.location.pathname.split('/').filter(Boolean).pop() || 0);
    if (!qrTableId) {
        renderQrHeroError('Không xác định được bàn để gọi món.');
        return;
    }

    loadQrOrderPage();
});

async function publicApiCall(url, options = {}) {
    const headers = {
        ...options.headers
    };

    if (!headers['Content-Type'] && options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) : null;
    if (!response.ok) {
        throw new Error(data?.error || 'Request failed');
    }

    return data;
}

async function loadQrOrderPage() {
    try {
        qrOrderData = await publicApiCall(`/api/public/tables/${qrTableId}/order`);
        renderQrHero();
        renderQrMenu();
        renderQrCart();
    } catch (err) {
        renderQrHeroError(err.message);
    }
}

function renderQrHeroError(message) {
    document.getElementById('qrOrderHero').innerHTML = `
        <div class="d-flex align-items-center gap-3">
            <div class="stat-icon warning"><i class="bi bi-exclamation-triangle"></i></div>
            <div>
                <div style="font-size:20px;font-weight:800">Không thể mở QR Order</div>
                <div style="color:var(--text-secondary)">${message}</div>
            </div>
        </div>
    `;
    document.getElementById('qrOrderMenu').innerHTML = '';
}

function renderQrHero() {
    const { table, session, settings, can_order: canOrder, reason } = qrOrderData;
    document.title = `${table.name} - QR Order`;

    document.getElementById('qrOrderHero').innerHTML = `
        <div class="qr-order-title">
            <div>
                <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px">${settings.club_name || 'Billiard Club'}</div>
                <div style="font-size:28px;font-weight:800;margin-top:4px">${table.name}</div>
                <div style="color:var(--text-secondary);margin-top:6px">
                    ${table.type === 'vip' ? 'Bàn VIP' : 'Bàn thường'}
                    ${session ? ` • Phiên #${session.id}` : ''}
                </div>
            </div>
            <span class="badge ${canOrder ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'}" style="font-size:13px;padding:10px 14px;border-radius:999px">
                ${canOrder ? 'Đang nhận order' : 'Bàn chưa mở'}
            </span>
        </div>
        <div style="color:var(--text-secondary)">
            ${canOrder
                ? 'Khách chọn món và gửi order. Nhân viên xác nhận xong mới cộng vào hóa đơn của bàn.'
                : (reason || 'Bàn hiện chưa thể nhận order.')}
        </div>
    `;
}

function renderQrMenu() {
    const wrap = document.getElementById('qrOrderMenu');
    const canOrder = qrOrderData?.can_order;
    const menu = qrOrderData?.menu || [];

    if (!menu.length) {
        wrap.innerHTML = '<div class="qr-order-category"><div class="qr-order-empty">Hiện chưa có món khả dụng.</div></div>';
        return;
    }

    wrap.innerHTML = menu.map(category => `
        <section class="qr-order-category">
            <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
                <div style="font-size:20px;font-weight:800">
                    <i class="bi ${category.icon || 'bi-tag'} me-2"></i>${category.name}
                </div>
                <span style="font-size:12px;color:var(--text-secondary)">${(category.items || []).length} món</span>
            </div>
            <div class="qr-order-items">
                ${(category.items || []).map(item => renderQrMenuItem(item, canOrder)).join('')}
            </div>
        </section>
    `).join('');
}

function renderQrMenuItem(item, canOrder) {
    const disabled = !canOrder || item.inventory_status === 'out';
    const desc = item.description || 'Món đang phục vụ tại bàn.';
    const imageUrl = resolveProductImage(item);
    const stockBadge = item.inventory_status === 'out'
        ? '<span class="report-method-badge is-other">Tạm hết</span>'
        : item.inventory_status === 'low'
            ? `<span class="report-method-badge is-cash">Sắp hết (${Number(item.available_stock_estimate || 0)})</span>`
            : '';

    return `
        <article class="qr-order-item">
            <div class="qr-order-thumb">
                <img src="${imageUrl}" alt="${item.name}" loading="lazy" onerror="this.src='${createProductFallbackDataUri(item.name)}'">
            </div>
            <div class="qr-order-item-body">
                <div class="qr-order-item-name">${item.name}</div>
                <div class="qr-order-item-desc">${desc}</div>
                <div class="qr-order-item-footer">
                    <div>
                        <div style="font-size:18px;font-weight:800">${formatCurrency(item.price)}</div>
                        ${stockBadge}
                    </div>
                    <button class="btn ${disabled ? 'btn-outline-secondary' : 'btn-gradient-primary'}" ${disabled ? 'disabled' : ''} onclick="addQrItem(${item.id})">
                        <i class="bi bi-plus-circle me-1"></i>${disabled ? 'Không bán' : 'Thêm'}
                    </button>
                </div>
            </div>
        </article>
    `;
}

function resolveProductImage(item) {
    if (item.image_url) return item.image_url;

    const normalized = removeVietnameseTones(`${item.name} ${item.category_name || ''}`).toLowerCase();
    if (normalized.includes('heineken')) return '/images/menu/heineken.svg';
    if (normalized.includes('tiger')) return '/images/menu/tiger.svg';
    if (normalized.includes('saigon')) return '/images/menu/saigon-beer.svg';
    if (normalized.includes('coca')) return '/images/menu/coca-cola.svg';
    if (normalized.includes('pepsi')) return '/images/menu/pepsi.svg';
    if (normalized.includes('sting')) return '/images/menu/sting.svg';
    if (normalized.includes('red bull')) return '/images/menu/red-bull.svg';
    if (normalized.includes('nuoc suoi')) return '/images/menu/water.svg';
    if (normalized.includes('tra da')) return '/images/menu/iced-tea.svg';
    if (normalized.includes('cafe den') || normalized.includes('ca phe den')) return '/images/menu/coffee-black.svg';
    if (normalized.includes('cafe sua') || normalized.includes('ca phe sua')) return '/images/menu/coffee-milk.svg';
    if (normalized.includes('dau phong')) return '/images/menu/peanuts.svg';
    if (normalized.includes('kho bo')) return '/images/menu/beef-jerky.svg';
    if (normalized.includes('mi tom') || normalized.includes('my tom') || normalized.includes('mi ') || normalized.includes('mì ')) {
        return '/images/menu/noodle.svg';
    }
    if (normalized.includes('xuc xich') || normalized.includes('xien') || normalized.includes('nuong')) {
        return '/images/menu/sausage.svg';
    }
    if (normalized.includes('bastos')) return '/images/menu/bastos.svg';
    if (normalized.includes('esse')) return '/images/menu/esse.svg';
    if (normalized.includes('jet')) return '/images/menu/jet.svg';
    if (normalized.includes('marlboro')) return '/images/menu/marlboro.svg';
    if (normalized.includes('gang tay')) return '/images/menu/gloves.svg';
    if (normalized.includes('mi tom') || normalized.includes('my tom') || normalized.includes('mi ') || normalized.includes('mì ')) {
        return '/images/menu/noodle.svg';
    }
    if (normalized.includes('xuc xich') || normalized.includes('xien') || normalized.includes('nuong')) {
        return '/images/menu/sausage.svg';
    }
    return '/images/menu/generic.svg';
}

function createProductFallbackDataUri(name) {
    const text = String(name || 'Mon moi')
        .slice(0, 22)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">
            <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                    <stop stop-color="#667eea"/>
                    <stop offset="1" stop-color="#38ef7d"/>
                </linearGradient>
            </defs>
            <rect width="640" height="420" rx="32" fill="url(#g)"/>
            <text x="320" y="200" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">${text}</text>
            <text x="320" y="248" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.9)">Billiard Club QR Order</text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getAllQrItems() {
    return (qrOrderData?.menu || []).flatMap(category => category.items || []);
}

function addQrItem(itemId) {
    const item = getAllQrItems().find(entry => entry.id === itemId);
    if (!item) return;

    const current = qrCart.get(itemId) || { ...item, quantity: 0, note: '' };
    current.quantity += 1;
    qrCart.set(itemId, current);
    renderQrCart();
}

function updateQrItemQty(itemId, delta) {
    const current = qrCart.get(itemId);
    if (!current) return;

    current.quantity += delta;
    if (current.quantity <= 0) {
        qrCart.delete(itemId);
    } else {
        qrCart.set(itemId, current);
    }

    renderQrCart();
}

function updateQrItemNote(itemId, note) {
    const current = qrCart.get(itemId);
    if (!current) return;

    current.note = note;
    qrCart.set(itemId, current);
}

function openQrCartDrawer() {
    if (!qrCart.size) return;
    new bootstrap.Offcanvas(document.getElementById('qrCartDrawer')).show();
}

function renderQrCart() {
    const itemsWrap = document.getElementById('qrCartItems');
    const summary = document.getElementById('qrCartSummary');
    const drawerSummary = document.getElementById('qrCartDrawerSummary');
    const submitBtn = document.getElementById('qrSubmitBtn');
    const drawerSubmitBtn = document.getElementById('qrDrawerSubmitBtn');
    const toggleBtn = document.getElementById('qrCartToggleBtn');
    const canOrder = Boolean(qrOrderData?.can_order);
    const items = Array.from(qrCart.values());
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmt = items.reduce((sum, item) => sum + item.quantity * Number(item.price || 0), 0);

    summary.textContent = `${totalQty} món • ${formatCurrency(totalAmt)}`;
    if (drawerSummary) {
        drawerSummary.textContent = `${totalQty} món • ${formatCurrency(totalAmt)}`;
    }
    const disabled = !canOrder || !items.length || qrSubmitting || Date.now() < qrClientCooldownUntil;
    submitBtn.disabled = disabled;
    if (drawerSubmitBtn) {
        drawerSubmitBtn.disabled = disabled;
    }
    toggleBtn.disabled = !items.length;
    toggleBtn.innerHTML = '<i class="bi bi-bag-check me-1"></i>Xem giỏ hàng';

    if (!items.length) {
        itemsWrap.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Chưa có món trong giỏ hàng</div>';
        return;
    }

    itemsWrap.innerHTML = items.map(item => `
        <div class="qr-order-cart-item">
            <div class="qr-order-cart-main">
                <div class="qr-order-cart-item-title">
                    <div style="font-weight:700">${item.name}</div>
                    <div style="color:var(--text-secondary);font-size:13px">${formatCurrency(item.price)} / ${item.unit || 'phần'}</div>
                </div>
                <div class="qr-order-cart-controls">
                    <div class="qr-order-qty">
                        <button type="button" onclick="updateQrItemQty(${item.id}, -1)"><i class="bi bi-dash"></i></button>
                        <strong>${item.quantity}</strong>
                        <button type="button" onclick="updateQrItemQty(${item.id}, 1)"><i class="bi bi-plus"></i></button>
                    </div>
                    <div style="font-weight:700">${formatCurrency(item.quantity * Number(item.price || 0))}</div>
                </div>
            </div>
            <textarea class="form-control mt-2" rows="2" placeholder="Ghi chú cho món này" oninput="updateQrItemNote(${item.id}, this.value)">${item.note || ''}</textarea>
        </div>
    `).join('');
}

async function submitQrOrder() {
    if (!qrOrderData?.can_order || !qrCart.size || qrSubmitting || Date.now() < qrClientCooldownUntil) return;

    qrSubmitting = true;
    renderQrCart();

    try {
        await publicApiCall(`/api/public/tables/${qrTableId}/order-requests`, {
            method: 'POST',
            body: JSON.stringify({
                note: document.getElementById('qrOrderNote').value.trim(),
                items: Array.from(qrCart.values()).map(item => ({
                    menu_item_id: item.id,
                    quantity: item.quantity,
                    note: item.note || null
                }))
            })
        });

        qrCart.clear();
        document.getElementById('qrOrderNote').value = '';
        qrClientCooldownUntil = Date.now() + 20000;
        showToast('Đã gửi order. Nhân viên sẽ xác nhận trong giây lát.', 'success');
        bootstrap.Offcanvas.getInstance(document.getElementById('qrCartDrawer'))?.hide();
        renderQrCart();
    } catch (err) {
        showToast(err.message, 'danger');
    } finally {
        qrSubmitting = false;
        renderQrCart();
    }
}

// Tables management page
let allTables = [];
let currentTable = null;
let currentSession = null;
let menuData = [];
let timerInterval = null;
let pendingCancelReservationId = null;
let pendingCancelSessionId = null;
let comboConfigs = [];
let selectedComboOption = null;
let selectedComboGiftType = null;
let activeTableFilter = 'all';
let tableSearchKeyword = '';
let pricingConfig = getDefaultPricingConfig();
let pendingQrRequests = [];
let currentTableQrUrl = '';
let networkInfo = null;
let notifications = [];
let unreadNotificationCount = 0;
let knownPendingQrRequestIds = new Set();
let lowStockNotified = false;
window.lastInvoiceData = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    initSidebar();
    loadComboSettings().finally(loadTables);
    loadMenu();
    loadNetworkInfo();
    refreshPendingQrSummary(false);
    bindReservationForm();
    bindTableToolbar();
    updateHeaderClock();
    renderNotifications();

    const s = initSocket();
    if (s) {
        s.on('table-updated', () => loadComboSettings().finally(loadTables));
        s.on('order-updated', (data) => {
            loadTables();
            refreshPendingQrSummary(true);
            if (currentSession && data.session_id == currentSession.id) {
                loadOrderForSession(currentSession.id);
                loadPendingQrRequests(currentSession.id);
            }
        });
    }

    // Global timer
    setInterval(() => {
        updateAllTimers();
        updateHeaderClock();
    }, 1000);
});

function updateHeaderClock() {
    const timeElement = document.getElementById('tablePageTime');
    if (!timeElement) return;

    timeElement.textContent = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

async function loadNetworkInfo() {
    try {
        networkInfo = await apiCall('/api/network-info');
    } catch (err) {
        console.error('Load network info error:', err);
    }
}

function playNotificationChime() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

        oscillator.start();
        oscillator.stop(context.currentTime + 0.38);
        oscillator.onended = () => context.close();
    } catch (err) {
        console.error('Notification chime error:', err);
    }
}

function addNotification({ type = 'info', title, message, meta = '', data = null }, withSound = false) {
    notifications.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        message,
        meta,
        data,
        createdAt: new Date().toISOString()
    });

    notifications = notifications.slice(0, 12);
    unreadNotificationCount += 1;
    renderNotifications();

    if (withSound) {
        playNotificationChime();
    }
}

function renderNotifications() {
    const badge = document.getElementById('notificationUnreadBadge');
    const list = document.getElementById('notificationList');
    if (!badge || !list) return;

    badge.style.display = unreadNotificationCount > 0 ? 'inline-block' : 'none';
    badge.textContent = String(unreadNotificationCount);

    if (!notifications.length) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Chưa có thông báo mới</div>';
        return;
    }

    list.innerHTML = notifications.map(item => `
        <div class="notification-item ${item.type === 'alert' ? 'is-alert' : ''}">
            <div class="notification-item-icon">
                <i class="bi ${item.type === 'alert' ? 'bi-bell-fill' : item.type === 'warning' ? 'bi-exclamation-circle' : 'bi-info-circle'}"></i>
            </div>
            <div>
                <div class="notification-item-title">${item.title}</div>
                <div style="color:var(--text-primary);font-size:13px">${item.message}</div>
                <div class="notification-item-meta">${item.meta || formatDateTime(item.createdAt)}</div>
                ${item.data?.requestId ? `
                    <div class="d-flex gap-2 flex-wrap mt-2">
                        <button type="button" class="btn btn-sm btn-gradient-success" onclick="approveQrRequestFromNotification(${item.data.requestId}, ${item.data.sessionId}, ${item.data.tableId})">
                            <i class="bi bi-check2 me-1"></i>Duyệt ngay
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="openTableFromNotification(${item.data.tableId})">
                            <i class="bi bi-columns-gap me-1"></i>Mở bàn
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function openNotificationModal() {
    markNotificationsRead();
    new bootstrap.Modal(document.getElementById('notificationModal')).show();
}

function markNotificationsRead() {
    unreadNotificationCount = 0;
    renderNotifications();
}

function removeQrRequestNotification(requestId) {
    notifications = notifications.filter(item => item.data?.requestId !== requestId);
    knownPendingQrRequestIds.delete(requestId);
    renderNotifications();
}

async function refreshPendingQrSummary(notifyNew = false) {
    try {
        const items = await apiCall('/api/table-order-requests/pending-summary');
        const currentIds = new Set((items || []).map(item => item.id));
        const newItems = (items || []).filter(item => !knownPendingQrRequestIds.has(item.id));

        if (notifyNew) {
            newItems.forEach(item => {
            addNotification({
                type: 'alert',
                title: `Khách vừa order ở ${item.table_name}`,
                message: item.items_summary || `${item.total_quantity} món đang chờ duyệt`,
                meta: formatDateTime(item.created_at),
                data: {
                    requestId: item.id,
                    tableId: item.table_id,
                    sessionId: item.session_id
                }
            }, true);
            });
        }

        knownPendingQrRequestIds = currentIds;
    } catch (err) {
        console.error('Refresh QR summary error:', err);
    }
}

async function approveQrRequestFromNotification(requestId, sessionId, tableId) {
    try {
        await apiCall(`/api/table-order-requests/${requestId}/approve`, { method: 'POST' });
        showToast('Đã duyệt order QR');
        removeQrRequestNotification(requestId);
        await refreshPendingQrSummary(false);

        if (currentSession && currentSession.id === sessionId) {
            await loadOrderForSession(sessionId);
            await loadPendingQrRequests(sessionId);
        } else if (tableId) {
            await loadTables();
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function openTableFromNotification(tableId) {
    bootstrap.Modal.getInstance(document.getElementById('notificationModal'))?.hide();
    setTimeout(() => openTable(tableId), 160);
}

function bindReservationForm() {
    ['resCustomerName', 'resCustomerPhone', 'resDate', 'resClock'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateReservationConfirmState);
    });

    document
        .getElementById('confirmCancelReservationBtn')
        ?.addEventListener('click', confirmCancelReservation);

    document
        .getElementById('confirmCancelSessionBtn')
        ?.addEventListener('click', confirmCancelSession);

    updateReservationConfirmState();
}

function bindTableToolbar() {
    const searchInput = document.getElementById('tableSearchInput');
    searchInput?.addEventListener('input', (event) => {
        tableSearchKeyword = event.target.value.trim().toLowerCase();
        renderTables();
    });

    document.querySelectorAll('#tableFilterGroup .filter-pill').forEach(button => {
        button.addEventListener('click', () => {
            activeTableFilter = button.dataset.filter || 'all';
            updateTableFilterButtons();
            renderTables();
        });
    });

    updateTableFilterButtons();
    updateTableOverview([]);
}

async function loadComboSettings() {
    try {
        const settings = await apiCall('/api/settings');
        comboConfigs = parseComboConfigs(settings.combo_configs);
        pricingConfig = parsePricingConfig(settings.pricing_config);
    } catch (err) {
        console.error('Load combo settings error:', err);
        comboConfigs = parseComboConfigs(null);
        pricingConfig = getDefaultPricingConfig();
    }
}

function parseComboConfigs(rawValue) {
    const defaults = [
        { id: 1, name: 'Combo 1', hours: 2, prices: { standard: 99000, vip: 129000 } },
        { id: 2, name: 'Combo 2', hours: 3, prices: { standard: 139000, vip: 189000 } },
        { id: 3, name: 'Combo 3', hours: 4, prices: { standard: 179000, vip: 239000 } }
    ];

    if (!rawValue) return defaults;

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed) || parsed.length === 0) return defaults;

        return parsed.map((combo, index) => ({
            id: Number(combo.id) || index + 1,
            name: combo.name || `Combo ${index + 1}`,
            hours: Math.max(1, Number(combo.hours) || 1),
            prices: {
                standard: Math.max(0, Number(combo.prices?.standard) || 0),
                vip: Math.max(0, Number(combo.prices?.vip) || 0)
            }
        }));
    } catch (err) {
        return defaults;
    }
}

function getSessionPlayAmount(session, table) {
    const playTime = calcPlayTime(session.start_time);
    return calcFlexibleSessionAmount({
        startTime: session.start_time,
        totalMinutes: playTime.totalMinutes,
        tableType: table.type,
        pricePerHour: table.price_per_hour,
        comboHours: session.combo_hours,
        comboPrice: session.combo_price,
        pricingConfig
    });
}

function getDrinkItems() {
    return menuData
        .filter(category => /uống|nuoc|drink|beverage/i.test(category.name || ''))
        .flatMap(category => category.items || []);
}

function buildComboOptionsForTable(table) {
    return comboConfigs
        .map(combo => ({
            ...combo,
            price: Number(combo.prices?.[table.type]) || 0
        }))
        .filter(combo => combo.price > 0);
}

function updateReservationConfirmState() {
    const customerName = document.getElementById('resCustomerName')?.value.trim();
    const resDate = document.getElementById('resDate')?.value;
    const resClock = document.getElementById('resClock')?.value;
    const confirmBtn = document.getElementById('reserveConfirmBtn');

    if (!confirmBtn) return;

    const canSubmit = Boolean(customerName && resDate && resClock);
    confirmBtn.disabled = !canSubmit;
    confirmBtn.className = canSubmit ? 'btn btn-gradient-success' : 'btn reservation-confirm-btn';
}

async function loadTables() {
    try {
        allTables = await apiCall('/api/tables');
        renderTables();
    } catch (err) {
        console.error('Load tables error:', err);
    }
}

function updateTableFilterButtons() {
    document.querySelectorAll('#tableFilterGroup .filter-pill').forEach(button => {
        button.classList.toggle('active', button.dataset.filter === activeTableFilter);
    });
}

function updateTableOverview(filteredTables) {
    const counts = {
        all: allTables.length,
        available: allTables.filter(table => table.status === 'available').length,
        playing: allTables.filter(table => table.status === 'playing').length,
        reserved: allTables.filter(table => table.status === 'reserved').length
    };

    const labels = {
        all: 'tất cả trạng thái',
        available: 'bàn trống',
        playing: 'bàn đang chơi',
        reserved: 'bàn đặt trước'
    };

    document.getElementById('tableCountAll').textContent = counts.all;
    document.getElementById('tableCountAvailable').textContent = counts.available;
    document.getElementById('tableCountPlaying').textContent = counts.playing;
    document.getElementById('tableCountReserved').textContent = counts.reserved;

    const isSearching = Boolean(tableSearchKeyword);
    const resultHint = document.getElementById('tableResultHint');
    if (!resultHint) return;

    const filterLabel = labels[activeTableFilter] || labels.all;
    if (isSearching) {
        resultHint.textContent = `Hiển thị ${filteredTables.length}/${counts.all} bàn khớp từ khóa "${tableSearchKeyword}" trong nhóm ${filterLabel}`;
        return;
    }

    if (activeTableFilter === 'all') {
        resultHint.textContent = `Đang hiển thị toàn bộ ${counts.all} bàn`;
        return;
    }

    resultHint.textContent = `Hiển thị ${filteredTables.length} ${filterLabel}`;
}

function getFilteredTables() {
    return allTables.filter(table => {
        const matchesFilter = activeTableFilter === 'all' || table.status === activeTableFilter;
        if (!matchesFilter) return false;

        if (!tableSearchKeyword) return true;

        const searchableText = [
            table.name,
            table.type,
            table.status,
            table.combo_name,
            table.combo_gift_name,
            table.active_order_summary,
            table.reservation_customer_name,
            table.reservation_customer_phone,
            table.reservation_note,
            table.reservation_time ? formatDateTime(table.reservation_time) : ''
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return searchableText.includes(tableSearchKeyword);
    });
}

function getTableStatusLabel(status) {
    if (status === 'playing') return 'Đang chơi';
    if (status === 'reserved') return 'Đặt trước';
    return 'Trống';
}

function resetTableFilters() {
    activeTableFilter = 'all';
    tableSearchKeyword = '';
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    updateTableFilterButtons();
    renderTables();
}

function renderTables() {
    const grid = document.getElementById('tableGrid');
    const filteredTables = getFilteredTables();
    updateTableOverview(filteredTables);

    if (!filteredTables.length) {
        grid.innerHTML = `
            <div class="table-empty-state fade-in">
                <div class="empty-state-icon"><i class="bi bi-search"></i></div>
                <h4>Không tìm thấy bàn phù hợp</h4>
                <p>Thử đổi bộ lọc hoặc xóa từ khóa tìm kiếm để xem lại toàn bộ bàn.</p>
                <button type="button" class="btn btn-gradient-primary" onclick="resetTableFilters()">
                    <i class="bi bi-arrow-counterclockwise me-2"></i>Đặt lại bộ lọc
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredTables.map(table => {
        const status = table.status;
        let timerHtml = '';
        if (status === 'playing' && table.start_time) {
            const pt = calcPlayTime(table.start_time);
            const amt = calcFlexibleSessionAmount({
                startTime: table.start_time,
                totalMinutes: pt.totalMinutes,
                tableType: table.type,
                pricePerHour: table.price_per_hour,
                comboHours: table.combo_hours,
                comboPrice: table.combo_price,
                pricingConfig
            });
            timerHtml = `
                <div class="play-timer">
                    <div class="timer-value" data-start="${table.start_time}" data-price="${table.price_per_hour}" data-combo-hours="${table.combo_hours || 0}" data-combo-price="${table.combo_price || 0}">${pt.display}</div>
                    <div class="timer-amount">${formatCurrency(amt)}</div>
                </div>`;
        }

        const comboBadge = table.combo_name
            ? `<div class="mt-2" style="font-size:12px;color:var(--info)">Combo: ${table.combo_name}</div>`
            : '';
        const orderHint = table.active_order_summary
            ? `<div class="mt-2" style="font-size:11px;color:var(--text-secondary)">Món: ${table.active_order_summary}</div>`
            : '';
        const reservationHint = table.reservation_customer_name
            ? `<div class="mt-2" style="font-size:11px;color:var(--warning)">Khách đặt: ${table.reservation_customer_name}</div>`
            : '';

        return `
        <div class="table-card ${status} fade-in" onclick="openTable(${table.id})" id="table-card-${table.id}">
            <div class="status-indicator"></div>
            <div class="table-icon">
                <i class="bi bi-${status === 'playing' ? 'play-circle-fill' : status === 'reserved' ? 'clock-fill' : 'circle'}"></i>
            </div>
            <div class="table-name">${table.name} ${table.type === 'vip' ? '<span class="badge-vip">VIP</span>' : ''}</div>
            <div class="table-type">${getTableTypeLabel(table.type)}</div>
            <div class="table-price">Giá: <span>${formatCurrency(table.price_per_hour)}</span>/giờ</div>
            <div class="table-status">${getTableStatusLabel(status)}</div>
            ${comboBadge}
            ${orderHint}
            ${reservationHint}
            ${timerHtml}
        </div>`;
    }).join('');
}

function updateTableModalHeaderActions(status) {
    const cancelBtn = document.getElementById('headerCancelSessionBtn');
    if (!cancelBtn) return;

    cancelBtn.style.display = status === 'playing' ? 'inline-flex' : 'none';
}

function updateAllTimers() {
    document.querySelectorAll('.timer-value[data-start]').forEach(el => {
        const pt = calcPlayTime(el.dataset.start);
        const tableCard = el.closest('.table-card');
        const tableId = Number(tableCard?.id?.replace('table-card-', '') || 0);
        const table = allTables.find(item => item.id === tableId);
        const amt = calcFlexibleSessionAmount({
            startTime: el.dataset.start,
            totalMinutes: pt.totalMinutes,
            tableType: table?.type || 'standard',
            pricePerHour: parseFloat(el.dataset.price),
            comboHours: parseInt(el.dataset.comboHours || '0', 10),
            comboPrice: parseFloat(el.dataset.comboPrice || '0'),
            pricingConfig
        });
        el.textContent = pt.display;
        el.nextElementSibling.textContent = formatCurrency(amt);
    });
}

async function openTable(tableId) {
    currentTable = allTables.find(t => t.id === tableId);
    if (!currentTable) return;

    const modal = new bootstrap.Modal(document.getElementById('tableModal'));
    document.getElementById('tableModalTitle').textContent = `${currentTable.name} ${currentTable.type === 'vip' ? '(Bàn VIP)' : '(Bàn thường)'}`;
    updateTableModalHeaderActions(currentTable.status);

    if (currentTable.status === 'available') {
        showAvailableView();
    } else if (currentTable.status === 'playing') {
        await showPlayingView();
    } else if (currentTable.status === 'reserved') {
        await showReservedView();
    }

    modal.show();
}

function showAvailableView() {
    const comboOptions = buildComboOptionsForTable(currentTable);
    const hasAnyCombo = comboConfigs.length > 0;
    document.getElementById('tableModalBody').innerHTML = `
        <div class="text-center py-4">
            <div style="width:80px;height:80px;border-radius:50%;background:rgba(25,135,84,0.15);display:inline-flex;align-items:center;justify-content:center;font-size:36px;color:var(--success);margin-bottom:16px">
                <i class="bi bi-circle"></i>
            </div>
            <h4 style="margin-bottom:8px">${currentTable.name}</h4>
            <p style="color:var(--text-secondary)">Giá: ${formatCurrency(currentTable.price_per_hour)}/giờ</p>
            ${hasAnyCombo ? `
                <div style="max-width:420px;margin:0 auto 12px;color:var(--text-muted);font-size:13px">
                    ${comboOptions.length > 0
                        ? `Bàn này đã có ${comboOptions.length} combo khả dụng. Chọn combo để tính giá trọn gói trước, hết thời lượng sẽ quay lại tính giá giờ thường.`
                        : 'Bàn này chưa gán giá cho combo nào. Vào Cài đặt để nhập giá combo theo bàn.'}
                </div>
            ` : ''}
            <div class="d-flex gap-3 justify-content-center mt-3">
                <button class="btn btn-gradient-success btn-lg" onclick="startSession()">
                    <i class="bi bi-play-fill me-2"></i>Mở bàn
                </button>
                ${hasAnyCombo ? `
                    <button class="btn btn-gradient-primary btn-lg" onclick="openComboModal()">
                        <i class="bi bi-stars me-2"></i>Chọn combo
                    </button>
                ` : ''}
                <button class="btn btn-gradient-primary btn-lg" onclick="openReservationModal()">
                    <i class="bi bi-calendar-event me-2"></i>Đặt trước
                </button>
                ${currentTable.reservation_id ? `
                <button class="btn btn-outline-danger btn-lg" onclick="cancelReservation(${currentTable.reservation_id})">
                    <i class="bi bi-x-circle me-2"></i>Hủy đặt bàn
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

function openComboModal() {
    const comboOptions = buildComboOptionsForTable(currentTable);

    if (!menuData.length) {
        showToast('Menu chưa tải xong, thử lại sau', 'danger');
        return;
    }

    selectedComboOption = null;
    selectedComboGiftType = null;

    document.getElementById('comboSelectionSummary').innerHTML = `
        <div class="p-3 rounded" style="background:var(--bg-input);border:1px solid var(--border-color)">
            <div style="font-weight:600">${currentTable.name}</div>
            <div style="color:var(--text-secondary);font-size:13px">
                Giá thường: ${formatCurrency(currentTable.price_per_hour)}/giờ
            </div>
        </div>
    `;

    document.getElementById('comboOptions').innerHTML = comboOptions.length > 0
        ? comboOptions.map(combo => `
            <div class="col-md-4">
                <button type="button" class="w-100 text-start p-3 combo-option-card" id="combo-option-${combo.id}"
                    style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary)"
                    onclick="selectComboOption(${combo.id})">
                    <div style="font-size:16px;font-weight:700">${combo.name}</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${combo.hours} giờ đầu</div>
                    <div style="font-size:18px;font-weight:700;color:var(--warning);margin-top:10px">${formatCurrency(combo.price)}</div>
                </button>
            </div>
        `).join('')
        : '<div class="col-12"><div class="p-3 rounded" style="background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-secondary)">Bàn này chưa có giá combo nào. Vào Cài đặt để nhập giá combo theo bàn.</div></div>';

    document.getElementById('comboGiftOptions').innerHTML = comboOptions.length > 0 ? `
        <button type="button" class="btn btn-outline-light" id="comboGiftDrinkBtn" onclick="selectComboGift('drink')">Tặng 1 đồ uống</button>
        <button type="button" class="btn btn-outline-light" id="comboGiftCueBtn" onclick="selectComboGift('cue')">Miễn phí thuê gậy</button>
    ` : '';

    const drinkItems = getDrinkItems();
    document.getElementById('comboDrinkPicker').innerHTML = `
        <option value="">Chọn đồ uống</option>
        ${drinkItems.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}
    `;
    document.getElementById('comboDrinkPicker').onchange = updateComboStartButton;
    document.getElementById('comboDrinkPickerWrap').style.display = 'none';
    document.getElementById('comboStartBtn').disabled = true;

    new bootstrap.Modal(document.getElementById('comboModal')).show();
}

function selectComboOption(comboId) {
    selectedComboOption = buildComboOptionsForTable(currentTable).find(combo => combo.id === comboId) || null;
    document.querySelectorAll('.combo-option-card').forEach(card => {
        card.style.borderColor = 'var(--border-color)';
        card.style.boxShadow = 'none';
    });
    document.getElementById(`combo-option-${comboId}`)?.style.setProperty('border-color', '#667eea');
    document.getElementById(`combo-option-${comboId}`)?.style.setProperty('box-shadow', '0 0 0 1px rgba(102,126,234,0.25)');
    updateComboStartButton();
}

function selectComboGift(giftType) {
    if (giftType === 'drink' && getDrinkItems().length === 0) {
        showToast('Chưa có đồ uống trong menu để chọn', 'danger');
        return;
    }

    selectedComboGiftType = giftType;
    document.getElementById('comboGiftDrinkBtn')?.classList.toggle('active', giftType === 'drink');
    document.getElementById('comboGiftCueBtn')?.classList.toggle('active', giftType === 'cue');
    document.getElementById('comboDrinkPickerWrap').style.display = giftType === 'drink' ? 'block' : 'none';
    updateComboStartButton();
}

function updateComboStartButton() {
    const drinkPicker = document.getElementById('comboDrinkPicker');
    const hasGiftSelection = selectedComboGiftType === 'cue'
        || (selectedComboGiftType === 'drink' && drinkPicker?.value);
    document.getElementById('comboStartBtn').disabled = !(selectedComboOption && hasGiftSelection);
}

async function confirmComboStart() {
    if (!selectedComboOption || !selectedComboGiftType) {
        showToast('Chọn combo và quà tặng trước khi mở bàn', 'danger');
        return;
    }

    const payload = {
        table_id: currentTable.id,
        combo_id: selectedComboOption.id,
        combo_name: selectedComboOption.name,
        combo_hours: selectedComboOption.hours,
        combo_price: selectedComboOption.price,
        combo_gift_type: selectedComboGiftType
    };

    if (selectedComboGiftType === 'drink') {
        const drinkPicker = document.getElementById('comboDrinkPicker');
        const selectedOption = drinkPicker.options[drinkPicker.selectedIndex];
        if (!drinkPicker.value) {
            showToast('Chọn đồ uống tặng', 'danger');
            return;
        }
        payload.combo_gift_item_id = Number(drinkPicker.value);
        payload.combo_gift_name = selectedOption.text;
    } else {
        payload.combo_gift_name = 'Miễn phí thuê gậy';
    }

    await startSession(payload);
    bootstrap.Modal.getInstance(document.getElementById('comboModal'))?.hide();
}

function openReservationModal() {
    // Set default time to 30 min from now
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('resCustomerName').value = '';
    document.getElementById('resCustomerPhone').value = '';
    document.getElementById('resDate').value = localDate.toISOString().slice(0, 10);
    document.getElementById('resClock').value = localDate.toISOString().slice(11, 16);
    document.getElementById('resNote').value = '';
    updateReservationConfirmState();
    new bootstrap.Modal(document.getElementById('reservationModal')).show();
}

async function doReserveTable() {
    const customerName = document.getElementById('resCustomerName').value.trim();
    const customerPhone = document.getElementById('resCustomerPhone').value.trim();
    const resDate = document.getElementById('resDate').value;
    const resClock = document.getElementById('resClock').value;
    const note = document.getElementById('resNote').value.trim();
    const resTime = resDate && resClock ? `${resDate}T${resClock}:00` : '';

    if (!customerName) {
        showToast('Vui lòng nhập tên khách hàng', 'danger');
        return;
    }
    if (!resTime) {
        showToast('Vui lòng chọn giờ đến', 'danger');
        return;
    }

    try {
        await apiCall('/api/reservations', {
            method: 'POST',
            body: JSON.stringify({
                table_id: currentTable.id,
                customer_name: customerName,
                customer_phone: customerPhone || null,
                reserved_time: resTime,
                note: note || null
            })
        });
        showToast(`Đặt trước ${currentTable.name} thành công!`);
        bootstrap.Modal.getInstance(document.getElementById('reservationModal')).hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function showReservedView() {
    let reservation = null;
    try {
        reservation = await apiCall(`/api/reservations/table/${currentTable.id}`);
    } catch (err) {
        // No reservation found
    }

    const body = document.getElementById('tableModalBody');
    if (!reservation) {
        body.innerHTML = `
            <div class="text-center py-4">
                <p style="color:var(--text-muted)">Không tìm thấy thông tin đặt bàn</p>
            </div>`;
        return;
    }

    body.innerHTML = `
        <div class="text-center py-4">
            <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,193,7,0.15);display:inline-flex;align-items:center;justify-content:center;font-size:36px;color:var(--warning);margin-bottom:16px">
                <i class="bi bi-clock-fill"></i>
            </div>
            <h4 style="margin-bottom:16px">${currentTable.name} — Đã đặt trước</h4>
            <div class="card-dark mx-auto" style="max-width:360px;text-align:left">
                <div class="card-body" style="font-size:14px">
                    <div class="d-flex justify-content-between mb-2">
                        <span style="color:var(--text-muted)">Khách hàng:</span>
                        <span><strong>${reservation.customer_name}</strong></span>
                    </div>
                    ${reservation.customer_phone ? `
                    <div class="d-flex justify-content-between mb-2">
                        <span style="color:var(--text-muted)">SĐT:</span>
                        <span>${reservation.customer_phone}</span>
                    </div>` : ''}
                    <div class="d-flex justify-content-between mb-2">
                        <span style="color:var(--text-muted)">Giờ đến:</span>
                        <span>${formatDateTime(reservation.reserved_time)}</span>
                    </div>
                    ${reservation.note ? `
                    <div class="d-flex justify-content-between mb-2">
                        <span style="color:var(--text-muted)">Ghi chú:</span>
                        <span>${reservation.note}</span>
                    </div>` : ''}
                    <div class="d-flex justify-content-between">
                        <span style="color:var(--text-muted)">Đặt lúc:</span>
                        <span>${formatDateTime(reservation.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="d-flex gap-3 justify-content-center mt-4">
                <button class="btn btn-gradient-success btn-lg" onclick="startFromReservation(${reservation.id})">
                    <i class="bi bi-play-fill me-2"></i>Bắt đầu chơi
                </button>
                <button class="btn btn-outline-danger btn-lg" onclick="cancelReservation(${reservation.id})">
                    <i class="bi bi-x-circle me-2"></i>Hủy đặt
                </button>
            </div>
        </div>
    `;
}

async function startFromReservation(reservationId) {
    try {
        await apiCall(`/api/reservations/${reservationId}/start`, { method: 'POST' });
        showToast(`Đã mở ${currentTable.name} từ đặt trước!`);
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function cancelReservation(reservationId) {
    pendingCancelReservationId = reservationId;
    new bootstrap.Modal(document.getElementById('cancelReservationModal')).show();
}

async function confirmCancelReservation() {
    if (!pendingCancelReservationId) return;

    try {
        await apiCall(`/api/reservations/${pendingCancelReservationId}/cancel`, { method: 'POST' });
        showToast('Đã hủy đặt bàn!');
        bootstrap.Modal.getInstance(document.getElementById('cancelReservationModal'))?.hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        pendingCancelReservationId = null;
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function openCancelSessionModal() {
    if (!currentSession) return;

    pendingCancelSessionId = currentSession.id;
    const modalText = document.getElementById('cancelSessionModalText');
    if (modalText) {
        modalText.innerHTML = `
            Bạn có chắc muốn hủy phiên đang chơi của <strong>${currentTable.name}</strong> không?<br>
            Phiên chơi này sẽ bị hủy và đơn hàng chưa thanh toán của bàn này cũng sẽ bị hủy theo.
        `;
    }

    new bootstrap.Modal(document.getElementById('cancelSessionModal')).show();
}

function openCancelSessionModalFromPayment() {
    bootstrap.Modal.getInstance(document.getElementById('paymentModal'))?.hide();
    setTimeout(openCancelSessionModal, 150);
}

async function confirmCancelSession() {
    if (!pendingCancelSessionId) return;

    try {
        const result = await apiCall(`/api/sessions/${pendingCancelSessionId}/cancel`, { method: 'POST' });
        showToast(result?.message || `Đã hủy ${currentTable.name}`);
        bootstrap.Modal.getInstance(document.getElementById('cancelSessionModal'))?.hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal'))?.hide();
        if (timerInterval) clearInterval(timerInterval);
        pendingCancelSessionId = null;
        currentSession = null;
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function showPlayingView() {
    // Get session info
    try {
        currentSession = await apiCall(`/api/session/${currentTable.session_id}`);
    } catch (err) {
        console.error('Get session error:', err);
        return;
    }

    const body = document.getElementById('tableModalBody');
    const comboInfoHtml = currentSession.combo_name ? `
        <div class="d-flex justify-content-between mb-2">
            <span style="color:var(--text-muted)">Combo:</span>
            <span>${currentSession.combo_name} (${currentSession.combo_hours} giờ)</span>
        </div>
        <div class="d-flex justify-content-between mb-2">
            <span style="color:var(--text-muted)">Giá combo:</span>
            <span>${formatCurrency(currentSession.combo_price)}</span>
        </div>
        <div class="d-flex justify-content-between mb-2">
            <span style="color:var(--text-muted)">Quà tặng:</span>
            <span>${currentSession.combo_gift_name || '-'}</span>
        </div>
    ` : '';

    body.innerHTML = `
        <div class="row">
            <!-- Left: Timer & Orders -->
            <div class="col-md-7">
                <!-- Timer -->
                <div class="card-dark mb-3">
                    <div class="card-body text-center">
                        <h6 style="color:var(--text-muted);margin-bottom:8px">Thời gian chơi</h6>
                        <div id="modalTimer" style="font-size:48px;font-weight:800;color:#f45c43;font-variant-numeric:tabular-nums">00:00:00</div>
                        <div id="modalTimerAmount" style="font-size:20px;font-weight:600;color:var(--warning);margin-top:4px">0đ</div>
                        <div style="font-size:13px;color:var(--text-muted);margin-top:4px">
                            Bắt đầu: ${formatDateTime(currentSession.start_time)}
                        </div>
                        ${currentSession.combo_name ? `
                            <div style="font-size:13px;color:var(--info);margin-top:8px">
                                ${currentSession.combo_name}: ${formatCurrency(currentSession.combo_price)} / ${currentSession.combo_hours} giờ đầu
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Order Section -->
                <div class="card-dark">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-cart3 me-2"></i>Gọi món</span>
                    </div>
                    <div class="card-body">
                        <div class="menu-tabs" id="menuTabs"></div>
                        <div class="menu-item-grid" id="menuItemGrid"></div>
                        
                        <hr style="border-color:var(--border-color);margin:16px 0">
                        
                        <h6 style="margin-bottom:12px"><i class="bi bi-receipt me-2"></i>Đơn hàng</h6>
                        <div class="order-list" id="orderList">
                            <p style="color:var(--text-muted);text-align:center;font-size:13px">Chưa có món</p>
                        </div>
                        <div class="d-flex justify-content-between mt-3" style="font-size:16px;font-weight:600">
                            <span>Tổng đơn hàng:</span>
                            <span id="orderTotal" style="color:var(--warning)">0đ</span>
                        </div>

                        <hr style="border-color:var(--border-color);margin:16px 0">

                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0"><i class="bi bi-phone me-2"></i>Đơn QR chờ duyệt</h6>
                            <span class="report-method-badge" id="pendingQrCountBadge">0</span>
                        </div>
                        <div id="pendingQrList" class="qr-request-list">
                            <p style="color:var(--text-muted);text-align:center;font-size:13px">Chưa có đơn QR chờ duyệt</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Actions -->
            <div class="col-md-5">
                <div class="card-dark mb-3">
                    <div class="card-header"><i class="bi bi-lightning me-2"></i>Thao tác</div>
                    <div class="card-body d-grid gap-2">
                        <button class="btn btn-gradient-primary" onclick="openTransferModal()">
                            <i class="bi bi-arrow-left-right me-2"></i>Chuyển bàn
                        </button>
                        <button class="btn btn-gradient-primary" onclick="openMergeModal()">
                            <i class="bi bi-union me-2"></i>Gộp bàn
                        </button>
                        <button class="btn btn-outline-info" onclick="openTableQrModal()">
                            <i class="bi bi-qr-code me-2"></i>QR Order
                        </button>
                        <button class="btn btn-gradient-success" onclick="openPaymentModal()">
                            <i class="bi bi-cash-coin me-2"></i>Thanh toán
                        </button>
                        <button class="btn btn-gradient-danger" data-role="cancel-session-action" onclick="openCancelSessionModal()">
                            <i class="bi bi-x-octagon me-2"></i>Hủy bàn
                        </button>
                    </div>
                </div>

                <!-- Session Info -->
                <div class="card-dark">
                    <div class="card-header"><i class="bi bi-info-circle me-2"></i>Thông tin</div>
                    <div class="card-body" style="font-size:13px">
                        <div class="d-flex justify-content-between mb-2">
                            <span style="color:var(--text-muted)">Bàn:</span>
                            <span>${currentTable.name} ${currentTable.type === 'vip' ? '(VIP)' : ''}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span style="color:var(--text-muted)">Giá/giờ:</span>
                            <span>${formatCurrency(currentTable.price_per_hour)}</span>
                        </div>
                        ${comboInfoHtml}
                        <div class="d-flex justify-content-between mb-2">
                            <span style="color:var(--text-muted)">Bắt đầu:</span>
                            <span>${formatDateTime(currentSession.start_time)}</span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span style="color:var(--text-muted)">Session ID:</span>
                            <span>#${currentSession.id}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    renderMenuTabs();
    loadOrderForSession(currentSession.id);
    loadPendingQrRequests(currentSession.id);

    // Start modal timer
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const pt = calcPlayTime(currentSession.start_time);
        const amt = calcFlexibleSessionAmount({
            startTime: currentSession.start_time,
            totalMinutes: pt.totalMinutes,
            tableType: currentTable.type,
            pricePerHour: currentTable.price_per_hour,
            comboHours: currentSession.combo_hours,
            comboPrice: currentSession.combo_price,
            pricingConfig
        });
        document.getElementById('modalTimer').textContent = pt.display;
        document.getElementById('modalTimerAmount').textContent = formatCurrency(amt);
    }, 1000);
}

// ===== SESSION =====
async function startSession(extraPayload = {}) {
    try {
        await apiCall('/api/start-session', {
            method: 'POST',
            body: JSON.stringify({
                table_id: currentTable.id,
                ...extraPayload
            })
        });
        showToast(`Đã mở ${currentTable.name}`);
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ===== MENU & ORDERS =====
async function loadMenu() {
    try {
        menuData = await apiCall('/api/menu');
        if (!lowStockNotified) {
            const lowStockItems = (menuData || [])
                .flatMap(category => category.items || [])
                .filter(item => item.inventory_status === 'low' || item.inventory_status === 'out');

            if (lowStockItems.length) {
                addNotification({
                    type: 'warning',
                    title: 'Cảnh báo tồn kho',
                    message: `${lowStockItems.length} món đang sắp hết hoặc tạm hết`,
                    meta: 'Thông báo không phát chuông'
                }, false);
                lowStockNotified = true;
            }
        }
    } catch (err) {
        console.error('Load menu error:', err);
    }
}

function renderMenuTabs() {
    const tabs = document.getElementById('menuTabs');
    if (!menuData || menuData.length === 0) return;

    tabs.innerHTML = menuData.map((cat, i) => `
        <button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="selectCategory(${i}, this)">
            <i class="bi ${cat.icon} me-1"></i>${cat.name}
        </button>
    `).join('');

    renderMenuItems(0);
}

function selectCategory(index, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMenuItems(index);
}

function renderMenuItems(catIndex) {
    const grid = document.getElementById('menuItemGrid');
    const cat = menuData[catIndex];
    if (!cat || !cat.items) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Không có món</p>';
        return;
    }

    grid.innerHTML = cat.items.map(item => `
        <div class="menu-item-btn ${item.inventory_status === 'out' ? 'is-disabled' : ''}" onclick="${item.inventory_status === 'out' ? `showToast('Món này đang tạm hết', 'danger')` : `addToOrder(${item.id})`}">
            <div class="item-name">${item.name}</div>
            <div class="item-price">${formatCurrency(item.price)}</div>
            ${item.inventory_status === 'out'
                ? '<div style="font-size:11px;color:#ff8f85;margin-top:4px">Tạm hết</div>'
                : item.inventory_status === 'low'
                    ? `<div style="font-size:11px;color:#ffd200;margin-top:4px">Sắp hết (${Number(item.available_stock_estimate || 0)})</div>`
                    : ''}
        </div>
    `).join('');
}

async function addToOrder(menuItemId) {
    if (!currentSession) return;
    try {
        await apiCall('/api/order', {
            method: 'POST',
            body: JSON.stringify({
                session_id: currentSession.id,
                menu_item_id: menuItemId,
                quantity: 1
            })
        });
        loadOrderForSession(currentSession.id);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function loadOrderForSession(sessionId) {
    try {
        const data = await apiCall(`/api/order/${sessionId}`);
        await loadTables();
        const list = document.getElementById('orderList');
        const total = document.getElementById('orderTotal');

        if (!data || !data.items || data.items.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;font-size:13px">Chưa có món</p>';
            total.textContent = '0đ';
            return;
        }

        list.innerHTML = data.items.map(item => `
            <div class="order-item">
                <span class="item-name">
                    ${item.item_name}
                    ${item.note ? `<span class="qr-request-note d-block">${item.note}</span>` : ''}
                </span>
                <div class="qty-controls">
                    <button onclick="updateOrderItem(${item.id}, ${item.quantity - 1})">-</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button onclick="updateOrderItem(${item.id}, ${item.quantity + 1})">+</button>
                </div>
                <span class="item-subtotal">${formatCurrency(item.subtotal)}</span>
                <button class="btn-remove" onclick="deleteOrderItem(${item.id})">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
        `).join('');

        total.textContent = formatCurrency(data.total);
    } catch (err) {
        console.error('Load order error:', err);
    }
}

async function loadPendingQrRequests(sessionId) {
    try {
        pendingQrRequests = await apiCall(`/api/table-order-requests/session/${sessionId}`);
        renderPendingQrRequests();
    } catch (err) {
        console.error('Load pending QR orders error:', err);
    }
}

function renderPendingQrRequests() {
    const list = document.getElementById('pendingQrList');
    const badge = document.getElementById('pendingQrCountBadge');
    if (!list || !badge) return;

    badge.textContent = String(pendingQrRequests.length || 0);

    if (!pendingQrRequests.length) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;font-size:13px">Chưa có đơn QR chờ duyệt</p>';
        return;
    }

    list.innerHTML = pendingQrRequests.map(request => `
        <div class="qr-request-card">
            <div class="qr-request-card-header">
                <div>
                    <div style="font-weight:700">Yêu cầu #${request.id}</div>
                    <div class="qr-request-meta">${formatDateTime(request.created_at)} • ${request.total_quantity} món</div>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-gradient-success" onclick="approvePendingQrRequest(${request.id})">
                        <i class="bi bi-check2 me-1"></i>Duyệt
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="rejectPendingQrRequest(${request.id})">
                        <i class="bi bi-x-lg me-1"></i>Từ chối
                    </button>
                </div>
            </div>
            ${(request.items || []).map(item => `
                <div class="qr-request-item">
                    <div>
                        <div>${item.item_name} x${item.quantity}</div>
                        ${item.note ? `<div class="qr-request-note">${item.note}</div>` : ''}
                    </div>
                    <div>${formatCurrency(item.subtotal)}</div>
                </div>
            `).join('')}
            ${request.request_note ? `<div class="qr-request-note" style="margin-top:10px">Ghi chú đơn: ${request.request_note}</div>` : ''}
        </div>
    `).join('');
}

async function approvePendingQrRequest(requestId) {
    try {
        await apiCall(`/api/table-order-requests/${requestId}/approve`, { method: 'POST' });
        showToast('Đã duyệt order QR');
        removeQrRequestNotification(requestId);
        await loadOrderForSession(currentSession.id);
        await loadPendingQrRequests(currentSession.id);
        await refreshPendingQrSummary(false);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function rejectPendingQrRequest(requestId) {
    try {
        await apiCall(`/api/table-order-requests/${requestId}/reject`, { method: 'POST' });
        showToast('Đã từ chối order QR');
        removeQrRequestNotification(requestId);
        await loadPendingQrRequests(currentSession.id);
        await refreshPendingQrSummary(false);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function updateOrderItem(itemId, newQty) {
    try {
        await apiCall(`/api/order-item/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity: newQty })
        });
        loadOrderForSession(currentSession.id);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteOrderItem(itemId) {
    try {
        await apiCall(`/api/order-item/${itemId}`, { method: 'DELETE' });
        loadOrderForSession(currentSession.id);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ===== TRANSFER =====
function openTransferModal() {
    const available = allTables.filter(t => t.status === 'available' && t.id !== currentTable.id);
    const select = document.getElementById('transferTarget');
    select.innerHTML = available.map(t => `<option value="${t.id}">${t.name} (${formatCurrency(t.price_per_hour)}/h)</option>`).join('');

    if (available.length === 0) {
        select.innerHTML = '<option disabled>Không có bàn trống</option>';
    }

    new bootstrap.Modal(document.getElementById('transferModal')).show();
}

async function doTransfer() {
    const toTableId = document.getElementById('transferTarget').value;
    if (!toTableId) return;

    try {
        await apiCall('/api/transfer-table', {
            method: 'POST',
            body: JSON.stringify({ session_id: currentSession.id, to_table_id: parseInt(toTableId) })
        });
        showToast('Chuyển bàn thành công!');
        bootstrap.Modal.getInstance(document.getElementById('transferModal')).hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ===== MERGE =====
function openMergeModal() {
    const playing = allTables.filter(t => t.status === 'playing' && t.id !== currentTable.id);
    const container = document.getElementById('mergeOptions');

    if (playing.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted)">Không có bàn nào đang chơi để gộp</p>';
    } else {
        container.innerHTML = playing.map(t => `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" value="${t.session_id}" id="merge-${t.id}" style="background-color:var(--bg-input);border-color:var(--border-color)">
                <label class="form-check-label" for="merge-${t.id}" style="color:var(--text-primary)">
                    ${t.name} (đang chơi từ ${formatTime(t.start_time)})
                </label>
            </div>
        `).join('');
    }

    new bootstrap.Modal(document.getElementById('mergeModal')).show();
}

async function doMerge() {
    const checked = document.querySelectorAll('#mergeOptions input:checked');
    const mergeIds = Array.from(checked).map(cb => parseInt(cb.value));

    if (mergeIds.length === 0) {
        showToast('Chọn ít nhất 1 bàn để gộp', 'danger');
        return;
    }

    try {
        await apiCall('/api/merge-tables', {
            method: 'POST',
            body: JSON.stringify({ primary_session_id: currentSession.id, merge_session_ids: mergeIds })
        });
        showToast('Gộp bàn thành công!');
        bootstrap.Modal.getInstance(document.getElementById('mergeModal')).hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ===== PAYMENT =====
async function openPaymentModal() {
    const pt = calcPlayTime(currentSession.start_time);
    const playAmt = calcFlexibleSessionAmount({
        startTime: currentSession.start_time,
        totalMinutes: pt.totalMinutes,
        tableType: currentTable.type,
        pricePerHour: currentTable.price_per_hour,
        comboHours: currentSession.combo_hours,
        comboPrice: currentSession.combo_price,
        pricingConfig
    });
    const comboMinutes = (Number(currentSession.combo_hours) || 0) * 60;
    const extraMinutes = Math.max(0, pt.totalMinutes - comboMinutes);
    const comboDetailHtml = currentSession.combo_name ? `
        <div class="payment-row">
            <span>🎁 ${currentSession.combo_name} (${currentSession.combo_hours} giờ đầu):</span>
            <span style="font-weight:600">${formatCurrency(currentSession.combo_price)}</span>
        </div>
        <div class="payment-row" style="font-size:13px;color:var(--text-secondary)">
            <span>Quà tặng:</span>
            <span>${currentSession.combo_gift_name || '-'}</span>
        </div>
        <div class="payment-row" style="font-size:13px;color:var(--text-secondary)">
            <span>Giờ vượt combo:</span>
            <span>${formatDuration(extraMinutes)}</span>
        </div>
    ` : `
        <div class="payment-row">
            <span>💰 Tiền giờ chơi (${formatCurrency(currentTable.price_per_hour)}/h):</span>
            <span style="font-weight:600">${formatCurrency(playAmt)}</span>
        </div>
    `;

    // Get order
    let orderAmt = 0;
    let orderItems = [];
    try {
        const orderData = await apiCall(`/api/order/${currentSession.id}`);
        orderAmt = orderData.total || 0;
        orderItems = orderData.items || [];
    } catch (err) { /* no order */ }

    // Get surcharges
    let surcharges = [];
    try {
        surcharges = await apiCall('/api/surcharges');
    } catch (err) { /* no surcharges */ }

    // Get bank settings for QR
    let bankSettings = {};
    try {
        bankSettings = await apiCall('/api/settings');
    } catch (err) { /* no settings */ }

    const body = document.getElementById('paymentModalBody');
    body.innerHTML = `
        <div class="row">
            <div class="col-md-7">
                <div class="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
                    <h6 class="mb-0">Chi tiết thanh toán</h6>
                    <button type="button" class="btn btn-sm btn-outline-info" onclick="togglePaymentCopyOptions()">
                        <i class="bi bi-copy me-1"></i>Copy
                    </button>
                </div>
                <div id="paymentCopyOptions" class="mb-3" style="display:none">
                    <div class="d-flex gap-2 flex-wrap">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyPaymentSummary('invoice')">Copy hóa đơn ngắn</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyPaymentSummary('transfer')">Copy nội dung chuyển khoản</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyPaymentSummary('items')">Copy chi tiết món</button>
                    </div>
                </div>
                <div class="payment-summary">
                    <div class="payment-row">
                        <span>🕐 Thời gian chơi:</span>
                        <span>${formatDuration(pt.totalMinutes)}</span>
                    </div>
                    ${comboDetailHtml}
                    ${currentSession.combo_name && extraMinutes > 0 ? `
                        <div class="payment-row">
                            <span>⏱ Phần tính giờ thêm (${formatCurrency(currentTable.price_per_hour)}/h):</span>
                            <span style="font-weight:600">${formatCurrency(playAmt - Number(currentSession.combo_price || 0))}</span>
                        </div>
                    ` : ''}
                    ${currentSession.combo_name ? `
                        <div class="payment-row">
                            <span>💰 Tổng tiền bàn:</span>
                            <span style="font-weight:600">${formatCurrency(playAmt)}</span>
                        </div>
                    ` : ''}
                    ${orderItems.length > 0 ? `
                        <hr style="border-color:var(--border-color);margin:8px 0">
                        <div style="font-weight:600;margin-bottom:4px;font-size:13px">📋 Đồ uống / Đồ ăn:</div>
                        ${orderItems.map(item => `
                            <div class="payment-row" style="font-size:13px;color:var(--text-secondary)">
                                <span>${item.item_name} x${item.quantity}${item.note ? `<div class="qr-request-note">${item.note}</div>` : ''}</span>
                                <span>${formatCurrency(item.subtotal)}</span>
                            </div>
                        `).join('')}
                    ` : ''}
                    <div class="payment-row" style="margin-top:8px">
                        <span>🍺 Tiền đồ uống/ăn:</span>
                        <span style="font-weight:600">${formatCurrency(orderAmt)}</span>
                    </div>
                </div>

                <!-- LIVE TOTAL SECTION -->
                <div class="payment-summary mt-3" id="liveTotalSection" style="border:1px solid var(--border-color);border-radius:var(--radius-sm)">
                    <div id="liveSurchargeLines"></div>
                    <div id="liveDiscountLine"></div>
                    <div class="payment-row total" style="border-top:2px solid var(--border-color);margin-top:8px;padding-top:12px">
                        <span>💵 TỔNG THANH TOÁN:</span>
                        <span id="liveTotal" style="color:#38ef7d;font-size:22px">${formatCurrency(playAmt + orderAmt)}</span>
                    </div>
                </div>
            </div>
            <div class="col-md-5">
                <h6 class="mb-3">Phụ thu & Giảm giá</h6>
                ${surcharges.map(sc => `
                    <div class="form-check mb-2">
                        <input class="form-check-input surcharge-check" type="checkbox" value="${sc.id}" 
                            data-type="${sc.type}" data-value="${sc.value}" data-name="${sc.name}" id="sc-${sc.id}"
                            style="background-color:var(--bg-input);border-color:var(--border-color)"
                            onchange="recalcLiveTotal()">
                        <label class="form-check-label" for="sc-${sc.id}" style="color:var(--text-primary);font-size:13px">
                            ${sc.name} (${sc.type === 'fixed' ? formatCurrency(sc.value) : sc.value + '%'})
                        </label>
                    </div>
                `).join('')}
                <hr style="border-color:var(--border-color)">
                <div class="mb-3">
                    <label class="form-label">Giảm giá (%)</label>
                    <input type="hidden" id="discountPercent" value="0">
                    <div class="d-flex gap-2 flex-wrap">
                        <button type="button" class="btn btn-sm disc-btn active" onclick="setDiscount(0, this)" style="min-width:48px">0%</button>
                        <button type="button" class="btn btn-sm disc-btn" onclick="setDiscount(10, this)" style="min-width:48px">10%</button>
                        <button type="button" class="btn btn-sm disc-btn" onclick="setDiscount(25, this)" style="min-width:48px">25%</button>
                        <button type="button" class="btn btn-sm disc-btn" onclick="setDiscount(50, this)" style="min-width:48px">50%</button>
                        <button type="button" class="btn btn-sm disc-btn" onclick="setDiscount(75, this)" style="min-width:48px">75%</button>
                        <button type="button" class="btn btn-sm disc-btn" onclick="setDiscount(90, this)" style="min-width:48px">90%</button>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Phương thức thanh toán</label>
                    <select class="form-select" id="paymentMethod">
                        <option value="cash">Tiền mặt</option>
                        <option value="transfer">Chuyển khoản</option>
                        <option value="card">Thẻ</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">SĐT member (không bắt buộc)</label>
                    <input type="text" class="form-control mb-2" id="paymentCustomerPhone" placeholder="Nhập số điện thoại để cộng điểm" oninput="lookupPaymentCustomer()">
                    <div id="paymentCustomerPreview" style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
                        Nhập SĐT nếu muốn lưu membership cho lần thanh toán này.
                    </div>
                    <label class="form-label">Ghi chú</label>
                    <input type="text" class="form-control" id="paymentNote" placeholder="Ghi chú...">
                </div>
                <div id="qrPaymentSection" style="display:none">
                    <hr style="border-color:var(--border-color)">
                    <div class="text-center">
                        <h6 style="color:var(--info);margin-bottom:8px"><i class="bi bi-qr-code me-1"></i>Quét QR để chuyển khoản</h6>
                        <div id="qrPaymentCode"></div>
                        <p id="qrBankInfo" style="font-size:12px;color:var(--text-muted);margin-top:8px"></p>
                    </div>
                </div>
            </div>
        </div>

        <input type="hidden" id="payPlayAmount" value="${playAmt}">
        <input type="hidden" id="payOrderAmount" value="${orderAmt}">
        <input type="hidden" id="payLiveAmount" value="${playAmt + orderAmt}">
        <input type="hidden" id="bankSettingsId" value="${bankSettings.bank_id || ''}">
        <input type="hidden" id="bankSettingsAccount" value="${bankSettings.bank_account || ''}">
        <input type="hidden" id="bankSettingsName" value="${bankSettings.bank_name || ''}">
        <input type="hidden" id="clubSettingsName" value="${bankSettings.club_name || 'Billiard Club'}">
    `;

    // Listen for payment method change to show/hide QR
    document.getElementById('paymentMethod').addEventListener('change', () => {
        recalcLiveTotal();
    });

    // Initial calc
    recalcLiveTotal();
    lookupPaymentCustomer();

    new bootstrap.Modal(document.getElementById('paymentModal')).show();
}

function recalcLiveTotal() {
    const playAmt = Number(document.getElementById('payPlayAmount').value) || 0;
    const orderAmt = Number(document.getElementById('payOrderAmount').value) || 0;
    const baseTotal = playAmt + orderAmt;

    // Surcharges
    let surchargeTotal = 0;
    let surchargeHtml = '';
    document.querySelectorAll('.surcharge-check:checked').forEach(cb => {
        const type = cb.dataset.type;
        const value = Number(cb.dataset.value);
        const name = cb.dataset.name;
        let scAmt = 0;
        if (type === 'fixed') {
            scAmt = value;
        } else {
            scAmt = Math.round(baseTotal * value / 100);
        }
        surchargeTotal += scAmt;
        surchargeHtml += `
            <div class="payment-row" style="font-size:13px;color:var(--info)">
                <span>+ ${name}</span>
                <span>+${formatCurrency(scAmt)}</span>
            </div>`;
    });

    // Discount
    const discPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const subtotal = baseTotal + surchargeTotal;
    const discAmt = Math.round(subtotal * discPercent / 100);
    const total = subtotal - discAmt;

    let discountHtml = '';
    if (discPercent > 0) {
        discountHtml = `
            <div class="payment-row" style="font-size:13px;color:var(--success)">
                <span>- Giảm giá ${discPercent}%</span>
                <span>-${formatCurrency(discAmt)}</span>
            </div>`;
    }

    document.getElementById('liveSurchargeLines').innerHTML = surchargeHtml;
    document.getElementById('liveDiscountLine').innerHTML = discountHtml;
    document.getElementById('liveTotal').textContent = formatCurrency(total);
    document.getElementById('payLiveAmount').value = total;

    if (document.getElementById('paymentMethod')?.value === 'transfer') {
        updateQRDisplay();
    }
}

function setDiscount(percent, btn) {
    document.getElementById('discountPercent').value = percent;
    document.querySelectorAll('.disc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    recalcLiveTotal();
}

function normalizeMembershipPhone(value) {
    return String(value || '').replace(/\D/g, '');
}

async function lookupPaymentCustomer() {
    const input = document.getElementById('paymentCustomerPhone');
    const preview = document.getElementById('paymentCustomerPreview');
    if (!input || !preview) return;

    const phone = input.value.trim();
    if (!phone) {
        preview.textContent = 'Nhập SĐT nếu muốn lưu membership cho lần thanh toán này.';
        return;
    }

    const normalizedPhone = normalizeMembershipPhone(phone);
    if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
        preview.innerHTML = '<span style="color:var(--warning)">SĐT member phải có từ 9 đến 15 số.</span>';
        return;
    }

    try {
        const customer = await apiCall(`/api/customers/lookup?phone=${encodeURIComponent(normalizedPhone)}`);
        if (!customer) {
            preview.innerHTML = '<span style="color:var(--warning)">SĐT hợp lệ. Hệ thống sẽ tạo member mới sau khi thanh toán.</span>';
            return;
        }

        preview.innerHTML = `
            <span style="color:var(--success);font-weight:600">${customer.full_name || 'Khách member'}</span>
            <span style="color:var(--text-secondary)"> • Hạng ${customer.rank_name || 'Bronze'}</span>
        `;
    } catch {
        preview.innerHTML = '<span style="color:var(--warning)">Không tải được thông tin member lúc này.</span>';
    }
}

async function doPayment() {
    const surchargeChecks = document.querySelectorAll('.surcharge-check:checked');
    const surchargeIds = Array.from(surchargeChecks).map(cb => parseInt(cb.value));
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const note = document.getElementById('paymentNote').value;
    const customerPhone = document.getElementById('paymentCustomerPhone')?.value?.trim() || null;
    const normalizedPhone = normalizeMembershipPhone(customerPhone);

    if (customerPhone && (normalizedPhone.length < 9 || normalizedPhone.length > 15)) {
        showToast('SĐT member phải có từ 9 đến 15 số hoặc để trống', 'danger');
        return;
    }

    try {
        const result = await apiCall('/api/payment', {
            method: 'POST',
            body: JSON.stringify({
                session_id: currentSession.id,
                discount_percent: discountPercent,
                payment_method: paymentMethod,
                surcharge_ids: surchargeIds,
                note,
                customer_phone: customerPhone ? normalizedPhone : null
            })
        });

        showToast('Thanh toán thành công!');
        bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
        bootstrap.Modal.getInstance(document.getElementById('tableModal')).hide();
        if (timerInterval) clearInterval(timerInterval);

        // Show invoice
        showInvoice(result);
        loadTables();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function updateQRDisplay() {
    const method = document.getElementById('paymentMethod').value;
    const qrSection = document.getElementById('qrPaymentSection');
    
    if (method === 'transfer') {
        const bankId = document.getElementById('bankSettingsId').value;
        const bankAccount = document.getElementById('bankSettingsAccount').value;
        const bankName = document.getElementById('bankSettingsName').value;
        const clubName = document.getElementById('clubSettingsName').value;

        if (!bankId || !bankAccount) {
            qrSection.style.display = 'block';
            qrSection.querySelector('.text-center').innerHTML = `
                <p style="color:var(--warning);font-size:13px">
                    <i class="bi bi-exclamation-triangle me-1"></i>
                    Chưa cấu hình tài khoản ngân hàng.<br>Vào <strong>Cài đặt</strong> để thiết lập.
                </p>`;
            return;
        }

        const estimatedTotal = Number(document.getElementById('payLiveAmount')?.value) || 0;
        const tableName = currentTable ? currentTable.name : 'Ban';
        const description = buildTransferContent({
            clubName,
            tableName,
            sessionId: currentSession?.id
        });
        const qrWrap = document.getElementById('qrPaymentCode');
        const qrInfo = document.getElementById('qrBankInfo');

        if (estimatedTotal <= 0) {
            qrWrap.innerHTML = '<p style="color:var(--warning);font-size:13px">Tổng tiền chưa hợp lệ để tạo QR chuyển khoản.</p>';
            qrInfo.innerHTML = '';
            qrSection.style.display = 'block';
            return;
        }

        const payload = buildVietQrPayload({
            bankBin: bankId,
            bankAccount,
            amount: estimatedTotal,
            description,
            merchantName: bankName || clubName
        });

        if (!payload || !renderOfflineQrCode(qrWrap, payload, { size: 220 })) {
            qrWrap.innerHTML = '<p style="color:var(--warning);font-size:13px">Không thể tạo QR offline.</p>';
            qrInfo.innerHTML = '';
            qrSection.style.display = 'block';
            return;
        }

        qrInfo.innerHTML = `
            <strong>${bankName || clubName}</strong><br>
            STK: ${bankAccount}<br>
            Số tiền: ${formatCurrency(estimatedTotal)}<br>
            Nội dung: ${description}<br>
            <small>QR được sinh offline ngay trên máy thu ngân</small>
        `;
        qrSection.style.display = 'block';
    } else {
        qrSection.style.display = 'none';
    }
}

function togglePaymentCopyOptions() {
    const wrap = document.getElementById('paymentCopyOptions');
    if (!wrap) return;
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

function buildPaymentCopyText(type, payload) {
    const tableName = payload.table_name || currentTable?.name || 'Bàn';
    const clubName = payload.settings?.club_name || document.getElementById('clubSettingsName')?.value || 'Billiard Club';
    const items = payload.order_items || [];
    const itemsText = items.length
        ? items.map(item => `- ${item.item_name} x${item.quantity}${item.note ? ` (${item.note})` : ''}: ${formatCurrency(item.subtotal)}`).join('\n')
        : '- Không có món';

    if (type === 'transfer') {
        return buildTransferContent({
            clubName,
            tableName,
            sessionId: payload.session_id || currentSession?.id || null
        });
    }

    if (type === 'items') {
        return `Chi tiết món - ${tableName}\n${itemsText}`;
    }

    return [
        `${clubName} - ${tableName}`,
        `Thời gian chơi: ${formatDuration(payload.play_duration || 0)}`,
        `Tiền bàn: ${formatCurrency(payload.play_amount || 0)}`,
        `Tiền món: ${formatCurrency(payload.order_amount || 0)}`,
        payload.customer_phone ? `SĐT member: ${payload.customer_phone}` : '',
        payload.customer?.rank_name ? `Hạng: ${payload.customer.rank_name}` : '',
        `Tổng thanh toán: ${formatCurrency(payload.total_amount || 0)}`,
        `Thanh toán: ${getPaymentMethodLabel(payload.payment_method || 'cash')}`,
        `Món đã gọi:\n${itemsText}`
    ].filter(Boolean).join('\n');
}

async function getCurrentOrderItemsForCopy() {
    try {
        const data = currentSession?.id ? await apiCall(`/api/order/${currentSession.id}`) : null;
        return data?.items || [];
    } catch {
        return [];
    }
}

async function copyPaymentSummary(type) {
    const payload = {
        table_name: currentTable?.name,
        play_duration: calcPlayTime(currentSession?.start_time).totalMinutes || 0,
        play_amount: Number(document.getElementById('payPlayAmount')?.value || 0),
        order_amount: Number(document.getElementById('payOrderAmount')?.value || 0),
        total_amount: Number(document.getElementById('payLiveAmount')?.value || 0),
        payment_method: document.getElementById('paymentMethod')?.value || 'cash',
        customer_phone: document.getElementById('paymentCustomerPhone')?.value?.trim() || '',
        order_items: await getCurrentOrderItemsForCopy()
    };

    await copyTextToClipboard(buildPaymentCopyText(type, payload), 'Đã copy nội dung');
}

async function copyInvoiceData(type) {
    await copyTextToClipboard(buildPaymentCopyText(type, window.lastInvoiceData || {}), 'Đã copy nội dung');
}

function buildTableQrUrl() {
    if (!currentTable?.id) return '';
    const hostname = window.location.hostname;
    const localIp = Array.isArray(networkInfo?.local_ips) && networkInfo.local_ips.length
        ? networkInfo.local_ips[0]
        : null;
    const resolvedHost = hostname === 'localhost' || hostname === '127.0.0.1'
        ? (localIp || hostname)
        : hostname;
    const protocol = window.location.protocol || 'http:';
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${resolvedHost}${port}/table/${currentTable.id}`;
}

function openTableQrModal() {
    currentTableQrUrl = buildTableQrUrl();
    if (!currentTableQrUrl) return;

    const qrWrap = document.getElementById('tableQrCode');
    const linkText = document.getElementById('tableQrLinkText');
    if (!qrWrap || !linkText) return;

    qrWrap.innerHTML = '';
    linkText.textContent = currentTableQrUrl;

    if (typeof QRCode === 'function') {
        new QRCode(qrWrap, {
            text: currentTableQrUrl,
            width: 220,
            height: 220,
            colorDark: '#e5ecff',
            colorLight: '#1a1d27',
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    new bootstrap.Modal(document.getElementById('tableQrModal')).show();
}

async function copyTableQrLink() {
    if (!currentTableQrUrl) {
        currentTableQrUrl = buildTableQrUrl();
    }
    await copyTextToClipboard(currentTableQrUrl, 'Đã copy link QR Order');
}

function toggleInvoiceCopyOptions() {
    const wrap = document.getElementById('invoiceCopyOptions');
    if (!wrap) return;
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

function getPaymentMethodLabel(method) {
    if (method === 'transfer') return 'Chuyển khoản';
    if (method === 'card') return 'Thẻ';
    return 'Tiền mặt';
}

function showInvoice(data) {
    window.lastInvoiceData = data;
    const s = data.settings || {};
    const content = document.getElementById('invoiceContent');
    content.innerHTML = `
        <div class="d-flex justify-content-end mb-3">
            <div class="d-flex flex-column align-items-end gap-2">
                <button type="button" class="btn btn-sm btn-outline-info" onclick="toggleInvoiceCopyOptions()">
                    <i class="bi bi-copy me-1"></i>Copy
                </button>
                <div id="invoiceCopyOptions" style="display:none">
                    <div class="d-flex gap-2 flex-wrap justify-content-end">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyInvoiceData('invoice')">Copy hóa đơn ngắn</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyInvoiceData('transfer')">Copy nội dung chuyển khoản</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="copyInvoiceData('items')">Copy chi tiết món</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="invoice-print" id="invoicePrint">
            <div class="invoice-header">
                <h3>${s.club_name || 'Billiard Club'}</h3>
                <div>${s.club_address || ''}</div>
                <div>ĐT: ${s.club_phone || ''}</div>
                <div style="margin-top:8px;font-weight:700">HÓA ĐƠN THANH TOÁN</div>
            </div>

            <div class="invoice-detail">
                <div><strong>Bàn:</strong> ${data.table_name}</div>
                <div><strong>Bắt đầu:</strong> ${formatDateTime(data.start_time)}</div>
                <div><strong>Kết thúc:</strong> ${formatDateTime(data.end_time)}</div>
                <div><strong>Thời gian:</strong> ${formatDuration(data.play_duration)}</div>
                ${data.combo_name ? `<div><strong>Combo:</strong> ${data.combo_name} (${data.combo_hours} giờ)</div>` : ''}
                ${data.combo_gift_name ? `<div><strong>Quà tặng:</strong> ${data.combo_gift_name}</div>` : ''}
                ${data.customer_phone ? `<div><strong>SĐT member:</strong> ${data.customer_phone}</div>` : ''}
                ${data.customer?.rank_name ? `<div><strong>Hạng:</strong> ${data.customer.rank_name}</div>` : ''}
            </div>

            ${data.order_items && data.order_items.length > 0 ? `
                <table class="invoice-items">
                    <thead>
                        <tr><th>Món</th><th>SL</th><th>Thành tiền</th></tr>
                    </thead>
                    <tbody>
                        ${data.order_items.map(item => `
                            <tr>
                                <td>${item.item_name}${item.note ? `<div class="qr-request-note">${item.note}</div>` : ''}</td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.subtotal)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}

            <div class="invoice-total">
                <div class="payment-row">
                    <span>${data.combo_name ? 'Tổng tiền bàn:' : 'Tiền giờ chơi:'}</span>
                    <span>${formatCurrency(data.play_amount)}</span>
                </div>
                <div class="payment-row">
                    <span>Tiền đồ uống/ăn:</span>
                    <span>${formatCurrency(data.order_amount)}</span>
                </div>
                ${data.surcharge_amount > 0 ? `
                    <div class="payment-row">
                        <span>Phụ thu:</span>
                        <span>${formatCurrency(data.surcharge_amount)}</span>
                    </div>
                    ${data.surcharges.map(sc => `
                        <div class="payment-row" style="font-size:11px;color:var(--text-muted)">
                            <span>  - ${sc.name}</span>
                            <span>${formatCurrency(sc.amount)}</span>
                        </div>
                    `).join('')}
                ` : ''}
                ${data.discount_amount > 0 ? `
                    <div class="payment-row" style="color:var(--success)">
                        <span>Giảm giá (${data.discount_percent}%):</span>
                        <span>-${formatCurrency(data.discount_amount)}</span>
                    </div>
                ` : ''}
                <div class="payment-row total">
                    <span>TỔNG THANH TOÁN:</span>
                    <span>${formatCurrency(data.total_amount)}</span>
                </div>
                <div class="payment-row" style="font-size:12px;color:var(--text-muted)">
                    <span>Thanh toán:</span>
                    <span>${data.payment_method === 'cash' ? 'Tiền mặt' : data.payment_method === 'transfer' ? 'Chuyển khoản' : 'Thẻ'}</span>
                </div>
            </div>

            <div class="invoice-footer">
                ${s.invoice_footer || 'Cảm ơn quý khách! Hẹn gặp lại!'}
            </div>
        </div>
    `;

    new bootstrap.Modal(document.getElementById('invoiceModal')).show();
}

function printInvoice() {
    const printContent = document.getElementById('invoicePrint').innerHTML;
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Hóa đơn</title>
            <style>
                body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 8px; width: 80mm; }
                .invoice-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
                .invoice-header h3 { font-size: 16px; margin: 0 0 4px 0; }
                .invoice-detail { margin-bottom: 8px; }
                .invoice-items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                .invoice-items th, .invoice-items td { padding: 2px 0; text-align: left; }
                .invoice-items th:last-child, .invoice-items td:last-child { text-align: right; }
                .invoice-total { border-top: 1px dashed #000; padding-top: 8px; }
                .payment-row { display: flex; justify-content: space-between; padding: 2px 0; }
                .payment-row.total { border-top: 2px solid #000; margin-top: 4px; padding-top: 8px; font-size: 16px; font-weight: bold; }
                .invoice-footer { text-align: center; border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; font-style: italic; }
            </style>
        </head>
        <body>${printContent}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
}

// Cleanup on modal close
document.getElementById('tableModal')?.addEventListener('hidden.bs.modal', () => {
    if (timerInterval) clearInterval(timerInterval);
    currentSession = null;
    pendingCancelSessionId = null;
    updateTableModalHeaderActions('available');
});


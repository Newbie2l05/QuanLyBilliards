const API_URL = '';
let realtimeConnection = null;
let realtimeConnectionStarting = false;

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    const raw = localStorage.getItem('user');
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function isLoggedIn() {
    return Boolean(getToken());
}

function isAdmin() {
    return getUser()?.role === 'admin';
}

function logout() {
    if (typeof clearChatHistory === 'function') clearChatHistory();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}

function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/index.html';
        return false;
    }

    return true;
}

async function apiCall(url, options = {}) {
    const token = getToken();
    const headers = {
        ...options.headers
    };

    if (!headers['Content-Type'] && options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers
    });

    if (response.status === 401 && token) {
        logout();
        return null;
    }

    const rawText = await response.text();
    let data = null;

    if (rawText) {
        try {
            data = JSON.parse(rawText);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const validationMessage = data?.errors && typeof data.errors === 'object'
            ? Object.values(data.errors).flat().find(Boolean)
            : null;

        throw new Error(data?.error || validationMessage || data?.title || rawText || 'Request failed');
    }

    return data;
}

function formatCurrency(amount) {
    return `${new Intl.NumberFormat('vi-VN').format(Number(amount || 0))}đ`;
}

function removeVietnameseTones(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, match => (match === 'đ' ? 'd' : 'D'));
}

function sanitizeTransferText(value, maxLength = 25) {
    return removeVietnameseTones(value)
        .replace(/[^0-9A-Za-z ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        .trim();
}

function buildEmvField(id, value) {
    const stringValue = String(value || '');
    return `${id}${String(stringValue.length).padStart(2, '0')}${stringValue}`;
}

function computeEmvCrc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i += 1) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 0x8000) !== 0
                ? ((crc << 1) ^ 0x1021) & 0xFFFF
                : (crc << 1) & 0xFFFF;
        }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildTransferContent({ clubName, tableName, sessionId }) {
    const parts = [
        sanitizeTransferText(clubName || 'Billiard Club', 12),
        sanitizeTransferText(tableName || 'Ban', 8),
        sessionId ? `S${sessionId}` : ''
    ].filter(Boolean);

    return sanitizeTransferText(parts.join(' '), 25);
}

function buildVietQrPayload({ bankBin, bankAccount, amount, description, merchantName }) {
    const normalizedBankBin = String(bankBin || '').trim();
    const normalizedBankAccount = String(bankAccount || '').trim();

    if (!normalizedBankBin || !normalizedBankAccount) {
        return null;
    }

    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    const transferDescription = sanitizeTransferText(description || merchantName || 'Thanh toan', 25);
    const merchantNameValue = sanitizeTransferText(merchantName || 'Billiard Club', 25);

    const beneficiaryInfo = buildEmvField(
        '01',
        buildEmvField('00', normalizedBankBin) +
        buildEmvField('01', normalizedBankAccount)
    );

    let payload = '';
    payload += buildEmvField('00', '01');
    payload += buildEmvField('01', normalizedAmount > 0 ? '12' : '11');
    payload += buildEmvField(
        '38',
        buildEmvField('00', 'A000000727') +
        beneficiaryInfo +
        buildEmvField('02', 'QRIBFTTA')
    );
    payload += buildEmvField('53', '704');

    if (normalizedAmount > 0) {
        payload += buildEmvField('54', String(normalizedAmount));
    }

    payload += buildEmvField('58', 'VN');

    if (merchantNameValue) {
        payload += buildEmvField('59', merchantNameValue);
    }

    if (transferDescription) {
        payload += buildEmvField('62', buildEmvField('08', transferDescription));
    }

    const crcInput = `${payload}6304`;
    return `${crcInput}${computeEmvCrc16(crcInput)}`;
}

function renderOfflineQrCode(target, payload, options = {}) {
    const container = typeof target === 'string' ? document.getElementById(target) : target;
    if (!container) return false;

    container.innerHTML = '';

    if (!payload) {
        return false;
    }

    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<p style="color:var(--warning);font-size:13px">Thiếu thư viện QR offline.</p>';
        return false;
    }

    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-block';
    wrapper.style.padding = '12px';
    wrapper.style.background = '#ffffff';
    wrapper.style.borderRadius = '16px';
    wrapper.style.boxShadow = '0 12px 40px rgba(15, 23, 42, 0.18)';
    container.appendChild(wrapper);

    new QRCode(wrapper, {
        text: payload,
        width: options.size || 240,
        height: options.size || 240,
        colorDark: options.colorDark || '#0f172a',
        colorLight: options.colorLight || '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });

    return true;
}

function formatTime(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function formatDuration(minutes) {
    const totalMinutes = Number(minutes || 0);
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${remainingMinutes}p`;
    }

    return `${remainingMinutes} phút`;
}

function calcPlayTime(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = Math.max(0, now - start);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
        hours,
        minutes,
        seconds,
        totalMinutes: Math.ceil(diffMs / 60000),
        display: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
}

function calcPlayAmount(startTime, pricePerHour) {
    const playTime = calcPlayTime(startTime);
    return Math.ceil(playTime.totalMinutes / 60 * Number(pricePerHour || 0));
}

function calcSessionPlayAmount(totalMinutes, pricePerHour, comboHours = 0, comboPrice = 0) {
    const hourlyRate = Number(pricePerHour) || 0;
    const comboDurationMinutes = (Number(comboHours) || 0) * 60;
    const comboTotal = Number(comboPrice) || 0;

    if (!comboDurationMinutes || !comboTotal) {
        return Math.ceil(Number(totalMinutes || 0) / 60 * hourlyRate);
    }

    const extraMinutes = Math.max(0, Number(totalMinutes || 0) - comboDurationMinutes);
    const extraAmount = Math.ceil(extraMinutes / 60 * hourlyRate);
    return comboTotal + extraAmount;
}

function getDefaultPricingConfig() {
    return {
        enabled: false,
        slots: [
            { id: 1, name: 'Giờ thường', start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5], standard_price: 60000, vip_price: 90000 },
            { id: 2, name: 'Giờ cao điểm', start: '17:00', end: '23:00', days: [1, 2, 3, 4, 5], standard_price: 75000, vip_price: 110000 },
            { id: 3, name: 'Cuối tuần', start: '08:00', end: '23:59', days: [0, 6], standard_price: 85000, vip_price: 120000 }
        ]
    };
}

function parsePricingConfig(rawValue) {
    if (!rawValue) return getDefaultPricingConfig();

    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (!parsed || !Array.isArray(parsed.slots)) {
            return getDefaultPricingConfig();
        }

        return {
            enabled: Boolean(parsed.enabled),
            slots: parsed.slots.map((slot, index) => ({
                id: Number(slot.id) || index + 1,
                name: slot.name || `Khung giờ ${index + 1}`,
                start: slot.start || '00:00',
                end: slot.end || '23:59',
                days: Array.isArray(slot.days) ? slot.days.map(Number).filter(Number.isInteger) : [],
                standard_price: Number(slot.standard_price) || 0,
                vip_price: Number(slot.vip_price) || 0
            }))
        };
    } catch {
        return getDefaultPricingConfig();
    }
}

function isPricingSlotMatch(dateValue, slot) {
    const currentDay = dateValue.getDay();
    if (Array.isArray(slot.days) && slot.days.length && !slot.days.includes(currentDay)) {
        return false;
    }

    const [startHour, startMinute] = String(slot.start || '00:00').split(':').map(Number);
    const [endHour, endMinute] = String(slot.end || '23:59').split(':').map(Number);
    const currentMinutes = dateValue.getHours() * 60 + dateValue.getMinutes();
    const startMinutes = (startHour || 0) * 60 + (startMinute || 0);
    const endMinutes = (endHour || 0) * 60 + (endMinute || 0);

    if (endMinutes > startMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function calcFlexibleSessionAmount({
    startTime,
    endTime = new Date(),
    totalMinutes,
    tableType = 'standard',
    pricePerHour = 0,
    comboHours = 0,
    comboPrice = 0,
    pricingConfig = null
}) {
    const config = parsePricingConfig(pricingConfig);
    const start = new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    const safeMinutes = Number(totalMinutes ?? Math.ceil(Math.max(0, end - start) / 60000)) || 0;
    const safePricePerHour = Number(pricePerHour) || 0;
    const safeComboMinutes = (Number(comboHours) || 0) * 60;
    const safeComboPrice = Number(comboPrice) || 0;

    function calculateRangeAmount(rangeStart, rangeEnd) {
        if (!(rangeStart instanceof Date) || !(rangeEnd instanceof Date) || rangeEnd <= rangeStart) {
            return 0;
        }

        if (!config.enabled || !config.slots.length) {
            const minutes = Math.ceil((rangeEnd - rangeStart) / 60000);
            return Math.ceil(minutes / 60 * safePricePerHour);
        }

        let total = 0;
        const cursor = new Date(rangeStart);
        while (cursor < rangeEnd) {
            const next = new Date(Math.min(rangeEnd.getTime(), cursor.getTime() + 60000));
            const slot = config.slots.find(item => isPricingSlotMatch(cursor, item));
            const rate = slot
                ? Number(tableType === 'vip' ? slot.vip_price : slot.standard_price) || safePricePerHour
                : safePricePerHour;
            total += rate / 60 * ((next - cursor) / 60000);
            cursor.setTime(next.getTime());
        }

        return Math.round(total);
    }

    if (!safeComboMinutes || !safeComboPrice) {
        return calculateRangeAmount(start, end);
    }

    const extraMinutes = Math.max(0, safeMinutes - safeComboMinutes);
    if (extraMinutes <= 0) {
        return safeComboPrice;
    }

    const extraStart = new Date(start.getTime() + safeComboMinutes * 60000);
    return safeComboPrice + calculateRangeAmount(extraStart, end);
}

async function initSidebar() {
    if (document.getElementById('sidebar')) return;

    const user = getUser();
    if (!user) return;

    let clubName = '99 Billiard Club';
    try {
        const settings = await apiCall('/api/settings');
        if (settings?.club_name) {
            clubName = settings.club_name;
        }
    } catch {
        // Use default club name when settings cannot be loaded.
    }

    const sidebarHtml = `
        <div class="sidebar" id="sidebar">
            <div class="sidebar-brand">
                <div class="brand-icon"><i class="bi bi-bullseye"></i></div>
                <div>
                    <h5 id="sidebarClubName">${clubName}</h5>
                    <small>Vận hành quán billard theo thời gian thực</small>
                </div>
            </div>
            <nav class="sidebar-nav">
                <div class="nav-label">CHÍNH</div>
                <a href="/dashboard.html" class="nav-link" data-page="dashboard">
                    <i class="bi bi-grid-1x2-fill"></i> Dashboard
                </a>
                <a href="/tables.html" class="nav-link" data-page="tables">
                    <i class="bi bi-columns-gap"></i> Quản lý bàn
                </a>
                <div class="nav-label">QUẢN LÝ</div>
                <a href="/menu.html" class="nav-link" data-page="menu">
                    <i class="bi bi-book"></i> Menu
                </a>
                <a href="/reports.html" class="nav-link" data-page="reports">
                    <i class="bi bi-bar-chart-line"></i> Báo cáo
                </a>
                ${user.role === 'admin' ? `
                <a href="/settings.html" class="nav-link" data-page="settings">
                    <i class="bi bi-gear"></i> Cài đặt
                </a>` : ''}
            </nav>
            <div class="sidebar-user">
                <div class="user-avatar">${user.full_name.charAt(0)}</div>
                <div class="user-info">
                    <div class="name">${user.full_name}</div>
                    <div class="role">${user.role === 'admin' ? 'Quản lý' : 'Nhân viên'}</div>
                </div>
                <button class="btn-logout" onclick="logout()" title="Đăng xuất">
                    <i class="bi bi-box-arrow-right"></i>
                </button>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('afterbegin', sidebarHtml);

    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.page === currentPage) {
            link.classList.add('active');
        }
    });
}

function initSocket() {
    if (realtimeConnection) {
        return realtimeConnection;
    }

    if (typeof signalR === 'undefined') {
        return null;
    }

    realtimeConnection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/operations', {
            accessTokenFactory: () => getToken() || ''
        })
        .withAutomaticReconnect()
        .build();

    if (!realtimeConnectionStarting) {
        realtimeConnectionStarting = true;
        realtimeConnection.start()
            .catch(err => console.error('SignalR connection error:', err))
            .finally(() => {
                realtimeConnectionStarting = false;
            });
    }

    return realtimeConnection;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const icon = type === 'success'
        ? 'check-circle-fill'
        : type === 'danger'
            ? 'x-octagon-fill'
            : 'info-circle-fill';
    const title = type === 'success'
        ? 'Thành công'
        : type === 'danger'
            ? 'Có lỗi xảy ra'
            : 'Thông báo';

    toast.className = `app-toast app-toast-${type} fade-in`;
    toast.innerHTML = `
        <div class="app-toast-icon">
            <i class="bi bi-${icon}"></i>
        </div>
        <div class="app-toast-content">
            <div class="app-toast-title">${title}</div>
            <div class="app-toast-message">${message}</div>
        </div>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function copyTextToClipboard(text, successMessage = 'Đã copy') {
    const normalized = String(text || '').trim();
    if (!normalized) {
        showToast('Không có nội dung để copy', 'danger');
        return false;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(normalized);
        } else {
            const temp = document.createElement('textarea');
            temp.value = normalized;
            temp.setAttribute('readonly', '');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }

        showToast(successMessage);
        return true;
    } catch {
        showToast('Không thể copy nội dung', 'danger');
        return false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getToken,
        getUser,
        isLoggedIn,
        isAdmin,
        formatCurrency,
        removeVietnameseTones,
        sanitizeTransferText,
        buildEmvField,
        computeEmvCrc16,
        buildTransferContent,
        buildVietQrPayload,
        formatTime,
        formatDateTime,
        formatDuration,
        calcPlayTime,
        calcPlayAmount,
        calcSessionPlayAmount,
        getDefaultPricingConfig,
        parsePricingConfig,
        calcFlexibleSessionAmount,
        copyTextToClipboard
    };
}

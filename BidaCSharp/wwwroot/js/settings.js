let settingsCache = {};
let managedTables = [];
let inventoryItems = [];
let comboConfigs = [];
let pricingConfigs = getDefaultPricingConfig();

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    if (!isAdmin()) {
        window.location.href = '/dashboard.html';
        return;
    }

    initSidebar();
    document.getElementById('settingsInventory')?.closest('.accordion-item')?.remove();
    document.getElementById('inventoryModal')?.remove();
    loadSettings().finally(() => {
        loadTablesList();
    });
});

function createId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

function getDefaultComboConfigs() {
    return [
        { id: 1, name: 'Combo 1', hours: 2, prices: { standard: 99000, vip: 129000 } },
        { id: 2, name: 'Combo 2', hours: 3, prices: { standard: 139000, vip: 189000 } },
        { id: 3, name: 'Combo 3', hours: 4, prices: { standard: 179000, vip: 239000 } }
    ];
}

function normalizeCombo(combo, index) {
    return {
        id: Number(combo.id) || createId() + index,
        name: combo.name || `Combo ${index + 1}`,
        hours: Math.max(1, Number(combo.hours) || 1),
        prices: {
            standard: Math.max(0, Number(combo.prices?.standard) || 0),
            vip: Math.max(0, Number(combo.prices?.vip) || 0)
        }
    };
}

function parseComboConfigs(rawValue) {
    if (!rawValue) return getDefaultComboConfigs();

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed) || !parsed.length) {
            return getDefaultComboConfigs();
        }
        return parsed.map(normalizeCombo);
    } catch {
        return getDefaultComboConfigs();
    }
}

function renderComboSettings() {
    const wrap = document.getElementById('comboSettingsList');
    wrap.innerHTML = comboConfigs.map((combo, index) => `
        <div class="col-12" data-combo-id="${combo.id}">
            <div class="p-3 rounded" style="background:var(--bg-input);border:1px solid var(--border-color)">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div style="font-weight:700">Combo ${index + 1}</div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeComboSetting(${combo.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <label class="form-label">Tên combo</label>
                <input type="text" class="form-control mb-2 combo-name-input" data-combo-id="${combo.id}" value="${combo.name}">
                <label class="form-label">Số giờ combo</label>
                <input type="number" min="1" class="form-control combo-hours-input" data-combo-id="${combo.id}" value="${combo.hours}">
                <div class="row g-3 mt-1">
                    <div class="col-md-6">
                        <label class="form-label">Giá Standard</label>
                        <input type="number" class="form-control combo-price-standard-input" data-combo-id="${combo.id}" value="${combo.prices.standard || ''}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Giá VIP</label>
                        <input type="number" class="form-control combo-price-vip-input" data-combo-id="${combo.id}" value="${combo.prices.vip || ''}">
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function syncComboConfigsFromInputs() {
    comboConfigs = comboConfigs.map((combo, index) => normalizeCombo({
        id: combo.id,
        name: document.querySelector(`.combo-name-input[data-combo-id="${combo.id}"]`)?.value.trim() || combo.name,
        hours: document.querySelector(`.combo-hours-input[data-combo-id="${combo.id}"]`)?.value || combo.hours,
        prices: {
            standard: document.querySelector(`.combo-price-standard-input[data-combo-id="${combo.id}"]`)?.value || combo.prices.standard,
            vip: document.querySelector(`.combo-price-vip-input[data-combo-id="${combo.id}"]`)?.value || combo.prices.vip
        }
    }, index));
}

function addComboSetting() {
    syncComboConfigsFromInputs();
    comboConfigs.push(normalizeCombo({
        id: createId(),
        name: `Combo ${comboConfigs.length + 1}`,
        hours: 2,
        prices: { standard: 0, vip: 0 }
    }, comboConfigs.length));
    renderComboSettings();
}

function removeComboSetting(comboId) {
    syncComboConfigsFromInputs();
    comboConfigs = comboConfigs.filter(combo => combo.id !== comboId);
    if (!comboConfigs.length) {
        comboConfigs = getDefaultComboConfigs().slice(0, 1);
    }
    renderComboSettings();
}

function collectComboSettings() {
    syncComboConfigsFromInputs();
    return JSON.stringify(comboConfigs);
}

function normalizePricingSlot(slot, index) {
    return {
        id: Number(slot.id) || createId() + index,
        name: slot.name || `Khung giờ ${index + 1}`,
        start: slot.start || '08:00',
        end: slot.end || '17:00',
        days: Array.isArray(slot.days) ? slot.days.map(Number).filter(Number.isInteger) : [1, 2, 3, 4, 5],
        standard_price: Math.max(0, Number(slot.standard_price) || 0),
        vip_price: Math.max(0, Number(slot.vip_price) || 0)
    };
}

function renderPricingSettings() {
    const wrap = document.getElementById('pricingSettingsList');
    const dayOptions = [
        { value: 1, label: 'T2' },
        { value: 2, label: 'T3' },
        { value: 3, label: 'T4' },
        { value: 4, label: 'T5' },
        { value: 5, label: 'T6' },
        { value: 6, label: 'T7' },
        { value: 0, label: 'CN' }
    ];

    wrap.innerHTML = pricingConfigs.slots.map((slot, index) => `
        <div class="col-12" data-pricing-id="${slot.id}">
            <div class="p-3 rounded fade-in" style="background:var(--bg-input);border:1px solid var(--border-color)">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div style="font-weight:700">Khung giờ ${index + 1}</div>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePricingSlot(${slot.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <label class="form-label">Tên hiển thị</label>
                <input type="text" class="form-control mb-2 pricing-name-input" data-pricing-id="${slot.id}" value="${slot.name}">
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label">Bắt đầu</label>
                        <input type="time" class="form-control pricing-start-input" data-pricing-id="${slot.id}" value="${slot.start}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Kết thúc</label>
                        <input type="time" class="form-control pricing-end-input" data-pricing-id="${slot.id}" value="${slot.end}">
                    </div>
                </div>
                <div class="mt-3">
                    <label class="form-label">Ngày áp dụng</label>
                    <div class="d-flex flex-wrap gap-2">
                        ${dayOptions.map(day => `
                            <label class="btn btn-sm ${slot.days.includes(day.value) ? 'btn-gradient-primary' : 'btn-outline-secondary'} pricing-day-chip">
                                <input type="checkbox" class="d-none pricing-day-input" data-pricing-id="${slot.id}" value="${day.value}" ${slot.days.includes(day.value) ? 'checked' : ''}>
                                ${day.label}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="row g-3 mt-1">
                    <div class="col-md-6">
                        <label class="form-label">Giá Standard</label>
                        <input type="number" class="form-control pricing-standard-input" data-pricing-id="${slot.id}" value="${slot.standard_price}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Giá VIP</label>
                        <input type="number" class="form-control pricing-vip-input" data-pricing-id="${slot.id}" value="${slot.vip_price}">
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.pricing-day-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const input = chip.querySelector('.pricing-day-input');
            setTimeout(() => {
                chip.classList.toggle('btn-gradient-primary', input.checked);
                chip.classList.toggle('btn-outline-secondary', !input.checked);
            }, 0);
        });
    });
}

function syncPricingConfigsFromInputs() {
    pricingConfigs = {
        enabled: document.getElementById('pricingEnabled').checked,
        slots: pricingConfigs.slots.map((slot, index) => normalizePricingSlot({
            id: slot.id,
            name: document.querySelector(`.pricing-name-input[data-pricing-id="${slot.id}"]`)?.value.trim() || slot.name,
            start: document.querySelector(`.pricing-start-input[data-pricing-id="${slot.id}"]`)?.value || slot.start,
            end: document.querySelector(`.pricing-end-input[data-pricing-id="${slot.id}"]`)?.value || slot.end,
            days: Array.from(document.querySelectorAll(`.pricing-day-input[data-pricing-id="${slot.id}"]:checked`)).map(input => Number(input.value)),
            standard_price: document.querySelector(`.pricing-standard-input[data-pricing-id="${slot.id}"]`)?.value || slot.standard_price,
            vip_price: document.querySelector(`.pricing-vip-input[data-pricing-id="${slot.id}"]`)?.value || slot.vip_price
        }, index))
    };
}

function addPricingSlot() {
    syncPricingConfigsFromInputs();
    pricingConfigs.slots.push(normalizePricingSlot({
        id: createId(),
        name: `Khung giờ ${pricingConfigs.slots.length + 1}`,
        start: '08:00',
        end: '17:00',
        days: [1, 2, 3, 4, 5],
        standard_price: 60000,
        vip_price: 90000
    }, pricingConfigs.slots.length));
    renderPricingSettings();
}

function removePricingSlot(slotId) {
    syncPricingConfigsFromInputs();
    pricingConfigs.slots = pricingConfigs.slots.filter(slot => slot.id !== slotId);
    if (!pricingConfigs.slots.length) {
        pricingConfigs = getDefaultPricingConfig();
    }
    renderPricingSettings();
}

function collectPricingConfig() {
    syncPricingConfigsFromInputs();
    return JSON.stringify(pricingConfigs);
}

async function loadSettings() {
    try {
        settingsCache = await apiCall('/api/settings');
        document.getElementById('clubName').value = settingsCache.club_name || '';
        document.getElementById('clubAddress').value = settingsCache.club_address || '';
        document.getElementById('clubPhone').value = settingsCache.club_phone || '';
        document.getElementById('invoiceFooter').value = settingsCache.invoice_footer || '';
        document.getElementById('bankId').value = settingsCache.bank_id || '970422';
        document.getElementById('bankAccount').value = settingsCache.bank_account || '';
        document.getElementById('bankName').value = settingsCache.bank_name || '';
        document.getElementById('operatingHoursPerDay').value = settingsCache.operating_hours_per_day || '12';

        comboConfigs = parseComboConfigs(settingsCache.combo_configs);
        pricingConfigs = parsePricingConfig(settingsCache.pricing_config);
        document.getElementById('pricingEnabled').checked = Boolean(pricingConfigs.enabled);
        renderComboSettings();
        renderPricingSettings();
    } catch (err) {
        console.error('Load settings error:', err);
        comboConfigs = getDefaultComboConfigs();
        pricingConfigs = getDefaultPricingConfig();
        renderComboSettings();
        renderPricingSettings();
    }
}

async function saveSettings() {
    try {
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({
                club_name: document.getElementById('clubName').value,
                club_address: document.getElementById('clubAddress').value,
                club_phone: document.getElementById('clubPhone').value,
                invoice_footer: document.getElementById('invoiceFooter').value
            })
        });

        showToast('Lưu cài đặt thành công!');
        const nameEl = document.getElementById('sidebarClubName');
        if (nameEl) nameEl.textContent = document.getElementById('clubName').value;
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function saveBankSettings() {
    try {
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({
                bank_id: document.getElementById('bankId').value,
                bank_account: document.getElementById('bankAccount').value.trim(),
                bank_name: document.getElementById('bankName').value.trim()
            })
        });
        showToast('Lưu thông tin ngân hàng thành công!');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function saveComboSettings() {
    try {
        const comboConfigsRaw = collectComboSettings();
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ combo_configs: comboConfigsRaw })
        });

        settingsCache.combo_configs = comboConfigsRaw;
        comboConfigs = parseComboConfigs(comboConfigsRaw);
        renderComboSettings();
        showToast('Lưu cấu hình combo thành công!');
        loadTablesList();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function savePricingSettings() {
    try {
        const pricingConfigRaw = collectPricingConfig();
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({
                pricing_config: pricingConfigRaw,
                operating_hours_per_day: document.getElementById('operatingHoursPerDay').value || '12'
            })
        });

        settingsCache.pricing_config = pricingConfigRaw;
        pricingConfigs = parsePricingConfig(pricingConfigRaw);
        renderPricingSettings();
        showToast('Lưu khung giờ thành công!');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function previewQR() {
    const bankId = document.getElementById('bankId').value;
    const account = document.getElementById('bankAccount').value.trim();
    const clubName = document.getElementById('clubName').value.trim() || 'Billiard Club';
    const name = document.getElementById('bankName').value.trim();
    if (!account) {
        showToast('Vui lòng nhập số tài khoản', 'danger');
        return;
    }

    const payload = buildVietQrPayload({
        bankBin: bankId,
        bankAccount: account,
        amount: 100000,
        description: buildTransferContent({ clubName, tableName: 'Test QR', sessionId: null }),
        merchantName: name || clubName
    });

    if (!payload || !renderOfflineQrCode('qrPreview', payload, { size: 220 })) {
        showToast('Không thể tạo QR offline', 'danger');
        return;
    }

    document.getElementById('qrPreview').insertAdjacentHTML('beforeend', `
        <p style="color:var(--text-muted);font-size:12px;margin-top:8px">QR thử với số tiền 100.000đ</p>
    `);
}

function getComboSummary(tableType) {
    return comboConfigs
        .map(combo => {
            const price = Number(combo.prices?.[tableType]) || 0;
            if (!price) return null;
            return `${combo.name}: ${formatCurrency(price)}`;
        })
        .filter(Boolean)
        .join('<br>');
}

async function loadTablesList() {
    try {
        managedTables = await apiCall('/api/tables');
        const tbody = document.getElementById('tablesManageList');
        tbody.innerHTML = managedTables.map(table => `
            <tr>
                <td><span class="settings-table-name">${table.name}</span></td>
                <td>${table.type === 'vip' ? '<span class="badge-vip">VIP</span>' : '<span class="settings-table-type">Standard</span>'}</td>
                <td><span class="settings-table-price">${formatCurrency(table.price_per_hour)}</span></td>
                <td style="font-size:12px;line-height:1.5">${getComboSummary(table.type) || '<span class="settings-table-type">Chưa cấu hình</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editTable(${table.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTable(${table.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load tables error:', err);
    }
}

function fillTableForm(table) {
    document.getElementById('editTableId').value = table?.id || '';
    document.getElementById('tableName').value = table?.name || '';
    document.getElementById('tableType').value = table?.type || 'standard';
    document.getElementById('tablePrice').value = table?.price_per_hour || 60000;
}

function showAddTableModal() {
    document.getElementById('tableModalTitle').textContent = 'Thêm bàn mới';
    fillTableForm(null);
    new bootstrap.Modal(document.getElementById('addTableModal')).show();
}

function editTable(id) {
    const table = managedTables.find(item => item.id === id);
    if (!table) return;

    document.getElementById('tableModalTitle').textContent = 'Sửa bàn';
    fillTableForm(table);
    new bootstrap.Modal(document.getElementById('addTableModal')).show();
}

function buildTablePayload() {
    return {
        name: document.getElementById('tableName').value.trim(),
        type: document.getElementById('tableType').value,
        price_per_hour: Number(document.getElementById('tablePrice').value)
    };
}

async function saveTable() {
    const id = document.getElementById('editTableId').value;
    const data = buildTablePayload();

    if (!data.name || !data.price_per_hour) {
        showToast('Vui lòng nhập đủ thông tin', 'danger');
        return;
    }

    try {
        if (id) {
            await apiCall(`/api/tables/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            showToast('Cập nhật bàn thành công!');
        } else {
            await apiCall('/api/tables', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showToast('Thêm bàn thành công!');
        }

        bootstrap.Modal.getInstance(document.getElementById('addTableModal')).hide();
        loadTablesList();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteTable(id) {
    const table = managedTables.find(item => item.id === id);
    if (!table || !confirm(`Bạn có chắc muốn xóa "${table.name}"?`)) return;

    try {
        await apiCall(`/api/tables/${id}`, { method: 'DELETE' });
        showToast('Đã xóa bàn!');
        loadTablesList();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function loadInventoryItems() {
    try {
        inventoryItems = await apiCall('/api/inventory-items');
        renderInventoryItems();
    } catch (err) {
        console.error('Load inventory error:', err);
    }
}

function renderInventoryItems() {
    const tbody = document.getElementById('inventoryManageList');
    if (!inventoryItems.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Chưa có nguyên liệu nào trong kho</td></tr>';
        return;
    }

    tbody.innerHTML = inventoryItems.map(item => {
        const isLow = Number(item.current_stock) <= Number(item.min_stock);
        return `
            <tr class="${isLow ? 'fade-in' : ''}">
                <td>
                    <div style="font-weight:600">${item.name}</div>
                    ${isLow ? '<small style="color:#ff7b6b">Sắp hết hàng</small>' : ''}
                </td>
                <td><span class="report-amount">${Number(item.current_stock).toLocaleString('vi-VN')}</span></td>
                <td>${Number(item.min_stock).toLocaleString('vi-VN')}</td>
                <td>${item.unit}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editInventoryItem(${item.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success me-1" onclick="quickAdjustInventory(${item.id}, 1)">
                        <i class="bi bi-plus"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteInventoryItem(${item.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddInventoryModal() {
    document.getElementById('inventoryModalTitle').textContent = 'Thêm nguyên liệu';
    document.getElementById('editInventoryId').value = '';
    document.getElementById('inventoryName').value = '';
    document.getElementById('inventoryStock').value = '0';
    document.getElementById('inventoryMinStock').value = '0';
    document.getElementById('inventoryUnit').value = 'đơn vị';
    new bootstrap.Modal(document.getElementById('inventoryModal')).show();
}

function editInventoryItem(id) {
    const item = inventoryItems.find(entry => entry.id === id);
    if (!item) return;

    document.getElementById('inventoryModalTitle').textContent = 'Sửa nguyên liệu';
    document.getElementById('editInventoryId').value = item.id;
    document.getElementById('inventoryName').value = item.name;
    document.getElementById('inventoryStock').value = item.current_stock;
    document.getElementById('inventoryMinStock').value = item.min_stock;
    document.getElementById('inventoryUnit').value = item.unit;
    new bootstrap.Modal(document.getElementById('inventoryModal')).show();
}

async function saveInventoryItem() {
    const id = Number(document.getElementById('editInventoryId').value || 0);
    const payload = {
        name: document.getElementById('inventoryName').value.trim(),
        current_stock: Number(document.getElementById('inventoryStock').value || 0),
        min_stock: Number(document.getElementById('inventoryMinStock').value || 0),
        unit: document.getElementById('inventoryUnit').value.trim()
    };

    if (!payload.name || !payload.unit) {
        showToast('Vui lòng nhập đủ thông tin nguyên liệu', 'danger');
        return;
    }

    try {
        if (id > 0) {
            await apiCall(`/api/inventory-items/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Cập nhật nguyên liệu thành công!');
        } else {
            await apiCall('/api/inventory-items', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Thêm nguyên liệu thành công!');
        }

        bootstrap.Modal.getInstance(document.getElementById('inventoryModal'))?.hide();
        loadInventoryItems();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function quickAdjustInventory(id, defaultValue = 1) {
    const amount = window.prompt('Nhập số lượng cần cộng/trừ. Dùng số âm để trừ khỏi kho.', String(defaultValue));
    if (amount === null) return;

    const quantity = Number(amount);
    if (!Number.isFinite(quantity) || quantity === 0) {
        showToast('Số lượng điều chỉnh không hợp lệ', 'danger');
        return;
    }

    try {
        await apiCall(`/api/inventory-items/${id}/adjust`, {
            method: 'POST',
            body: JSON.stringify({
                quantity_change: quantity,
                note: quantity > 0 ? 'Nhập thêm từ giao diện cài đặt' : 'Điều chỉnh giảm từ giao diện cài đặt'
            })
        });
        showToast('Đã cập nhật tồn kho!');
        loadInventoryItems();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteInventoryItem(id) {
    const item = inventoryItems.find(entry => entry.id === id);
    if (!item || !confirm(`Ẩn nguyên liệu "${item.name}" khỏi danh sách kho?`)) return;

    try {
        await apiCall(`/api/inventory-items/${id}`, { method: 'DELETE' });
        showToast('Đã ẩn nguyên liệu');
        loadInventoryItems();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

let menuData = [];
let categories = [];
let inventoryItems = [];
let currentRecipeItem = null;
let currentRecipeIngredients = [];
let menuSearchKeyword = '';
const ITEMS_PER_PAGE = 12;
let menuPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    initSidebar();
    loadMenuPage();

    document.getElementById('menuSearchInput')?.addEventListener('input', event => {
        menuSearchKeyword = event.target.value.trim().toLowerCase();
        menuPage = 1;
        renderMenu();
    });

    if (isAdmin()) {
        document.getElementById('btnAddItem').style.display = 'block';
        document.getElementById('btnAddInventory').style.display = 'block';
    }
});

async function loadMenuPage() {
    try {
        const [menuResponse, categoryResponse, inventoryResponse] = await Promise.all([
            apiCall('/api/menu'),
            apiCall('/api/menu-categories'),
            isAdmin() ? apiCall('/api/inventory-items') : Promise.resolve([])
        ]);

        menuData = menuResponse;
        categories = categoryResponse;
        inventoryItems = inventoryResponse || [];
        renderMenuSummary();
        renderMenu();
        renderInventoryItems();
    } catch (err) {
        console.error('Load menu error:', err);
        showToast(err.message || 'Không tải được menu', 'danger');
    }
}

function getMenuItemById(itemId) {
    for (const category of menuData) {
        const item = (category.items || []).find(entry => entry.id === itemId);
        if (item) return item;
    }
    return null;
}

function getFlatMenuItems() {
    return menuData.flatMap(category => (category.items || []).map(item => ({
        ...item,
        category_name: item.category_name || category.name,
        category_icon: category.icon
    })));
}

function renderMenuSummary() {
    const flatItems = getFlatMenuItems();
    const lowStockCount = flatItems.filter(item => item.inventory_status === 'low' || item.inventory_status === 'out').length;

    document.getElementById('summaryMenuCount').textContent = String(flatItems.length);
    document.getElementById('summaryCategoryCount').textContent = String(categories.length);
    document.getElementById('summaryInventoryCount').textContent = String(inventoryItems.length);
    document.getElementById('summaryLowStockCount').textContent = String(lowStockCount);
}

function getInventoryStatusMeta(item) {
    const estimated = Number(item.available_stock_estimate || 0);
    switch (item.inventory_status) {
        case 'out':
            return {
                label: 'Tạm hết',
                className: 'report-method-badge is-other',
                hint: 'Không đủ nguyên liệu để bán tiếp'
            };
        case 'low':
            return {
                label: `Sắp hết (${estimated})`,
                className: 'report-method-badge is-cash',
                hint: 'Nguyên liệu còn ít, nên nhập thêm'
            };
        case 'ok':
            return {
                label: `Đủ hàng (${estimated})`,
                className: 'report-method-badge',
                hint: 'Món đang bán bình thường'
            };
        default:
            return {
                label: item.has_inventory_recipe ? 'Đã gắn kho' : 'Chưa gắn kho',
                className: 'report-method-badge is-other',
                hint: item.has_inventory_recipe ? 'Đã có công thức kho nhưng chưa tính được tồn' : 'Món chưa cấu hình trừ kho'
            };
    }
}

function getFilteredMenuItems() {
    const items = getFlatMenuItems();
    if (!menuSearchKeyword) return items;

    return items.filter(item => {
        const inventoryMeta = getInventoryStatusMeta(item);
        const searchableText = [
            item.name,
            item.category_name,
            item.unit,
            inventoryMeta.label,
            inventoryMeta.hint,
            item.has_inventory_recipe ? 'có công thức kho' : 'chưa gắn kho'
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return searchableText.includes(menuSearchKeyword);
    });
}

function renderMenu() {
    const tbody = document.getElementById('menuListTable');
    const pagination = document.getElementById('menuPagination');
    const filteredItems = getFilteredMenuItems();

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
    if (menuPage > totalPages) menuPage = totalPages;
    const startIndex = (menuPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (!pageItems.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Không có món khớp bộ lọc hiện tại</td></tr>';
        pagination.innerHTML = '';
        return;
    }

    tbody.innerHTML = pageItems.map(item => {
        const inventoryMeta = getInventoryStatusMeta(item);
        return `
            <tr>
                <td>
                    <div class="menu-item-title">${item.name}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">
                        ${item.description || (item.has_inventory_recipe ? `Công thức: ${item.recipe_count} nguyên liệu` : 'Chưa gắn kho tự trừ')}
                    </div>
                </td>
                <td>
                    <span class="menu-item-unit">
                        <i class="bi ${item.category_icon || 'bi-tag'} me-1"></i>${item.category_name || 'Khác'}
                    </span>
                </td>
                <td class="menu-item-price-cell">${formatCurrency(item.price)}</td>
                <td><span class="menu-item-unit">${item.unit}</span></td>
                <td>
                    <span class="badge ${inventoryMeta.className}" title="${inventoryMeta.hint}">
                        ${inventoryMeta.label}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="openRecipeModal(${item.id})" title="Chi tiết món và kho">
                        <i class="bi bi-boxes"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editItem(${item.id})" title="Sửa món">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteItem(${item.id})" title="Xóa món">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderMenuPagination(totalPages, filteredItems.length);
}

function renderMenuPagination(totalPages, totalItems) {
    const pagination = document.getElementById('menuPagination');
    if (totalPages <= 1) {
        pagination.innerHTML = `<small style="color:var(--text-muted)">Tổng ${totalItems} món</small>`;
        return;
    }

    let pagesHtml = '';
    for (let page = 1; page <= totalPages; page += 1) {
        pagesHtml += `<button class="btn btn-sm ${page === menuPage ? 'btn-gradient-primary' : 'btn-outline-secondary'}" onclick="goMenuPage(${page})" style="min-width:36px">${page}</button>`;
    }

    pagination.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <small style="color:var(--text-muted)">Trang ${menuPage}/${totalPages} (${totalItems} món)</small>
            <div class="d-flex gap-1 flex-wrap justify-content-end">
                <button class="btn btn-sm btn-outline-secondary" onclick="goMenuPage(${menuPage - 1})" ${menuPage <= 1 ? 'disabled' : ''}>
                    <i class="bi bi-chevron-left"></i> Trước
                </button>
                ${pagesHtml}
                <button class="btn btn-sm btn-outline-secondary" onclick="goMenuPage(${menuPage + 1})" ${menuPage >= totalPages ? 'disabled' : ''}>
                    Sau <i class="bi bi-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function goMenuPage(page) {
    const totalPages = Math.max(1, Math.ceil(getFilteredMenuItems().length / ITEMS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    menuPage = page;
    renderMenu();
}

function showAddItemModal() {
    document.getElementById('editItemId').value = '';
    document.getElementById('itemModalTitle').textContent = 'Thêm món mới';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemUnit').value = 'cái';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemImageUrl').value = '';

    const categorySelect = document.getElementById('itemCategory');
    categorySelect.innerHTML = categories.map(category => `<option value="${category.id}">${category.name}</option>`).join('');

    new bootstrap.Modal(document.getElementById('itemModal')).show();
}

function editItem(id) {
    const item = getMenuItemById(id);
    if (!item) {
        showToast('Không tìm thấy món để sửa', 'danger');
        return;
    }

    document.getElementById('editItemId').value = item.id;
    document.getElementById('itemModalTitle').textContent = 'Sửa món';
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemUnit').value = item.unit;
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemImageUrl').value = item.image_url || '';

    const categorySelect = document.getElementById('itemCategory');
    categorySelect.innerHTML = categories.map(category => `
        <option value="${category.id}" ${category.id === item.category_id ? 'selected' : ''}>${category.name}</option>
    `).join('');

    new bootstrap.Modal(document.getElementById('itemModal')).show();
}

async function saveItem() {
    const id = Number(document.getElementById('editItemId').value || 0);
    const payload = {
        category_id: Number(document.getElementById('itemCategory').value || 0),
        name: document.getElementById('itemName').value.trim(),
        price: Number(document.getElementById('itemPrice').value || 0),
        unit: document.getElementById('itemUnit').value.trim(),
        description: document.getElementById('itemDescription').value.trim(),
        image_url: document.getElementById('itemImageUrl').value.trim()
    };

    if (!payload.category_id || !payload.name || payload.price <= 0 || !payload.unit) {
        showToast('Vui lòng nhập đủ thông tin hợp lệ', 'danger');
        return;
    }

    try {
        if (id > 0) {
            await apiCall(`/api/menu/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Cập nhật món thành công!');
        } else {
            await apiCall('/api/menu', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Thêm món thành công!');
        }

        bootstrap.Modal.getInstance(document.getElementById('itemModal'))?.hide();
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteItem(id) {
    const item = getMenuItemById(id);
    if (!item) {
        showToast('Không tìm thấy món để xóa', 'danger');
        return;
    }

    if (!confirm(`Bạn có chắc muốn xóa "${item.name}"?`)) return;

    try {
        await apiCall(`/api/menu/${id}`, { method: 'DELETE' });
        showToast('Đã xóa món!');
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function buildRecipeIngredientRow(ingredient = null) {
    return {
        inventory_item_id: ingredient?.inventory_item_id || '',
        quantity_required: ingredient?.quantity_required || 1
    };
}

function getInventoryBadgeHtml(inventoryItem, quantityRequired) {
    if (!inventoryItem) return '';
    const availableUnits = quantityRequired > 0 ? Math.floor(Number(inventoryItem.current_stock || 0) / Number(quantityRequired || 1)) : 0;
    const badgeClass = availableUnits <= 0
        ? 'report-method-badge is-other'
        : availableUnits <= 5
            ? 'report-method-badge is-cash'
            : 'report-method-badge';
    const badgeLabel = availableUnits <= 0
        ? 'Tạm hết'
        : availableUnits <= 5
            ? `Sắp hết (${availableUnits})`
            : `Đủ hàng (${availableUnits})`;
    return `<span class="badge ${badgeClass}">${badgeLabel}</span>`;
}

function renderRecipeIngredients() {
    const wrap = document.getElementById('recipeIngredientsList');
    if (!currentRecipeIngredients.length) {
        currentRecipeIngredients = [buildRecipeIngredientRow()];
    }

    wrap.innerHTML = currentRecipeIngredients.map((ingredient, index) => {
        const inventoryItem = inventoryItems.find(item => String(item.id) === String(ingredient.inventory_item_id));
        return `
            <div class="col-12 fade-in">
                <div class="p-3 rounded" style="background:var(--bg-input);border:1px solid var(--border-color)">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div style="font-weight:700">Nguyên liệu ${index + 1}</div>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeRecipeIngredient(${index})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                    <div class="row g-3">
                        <div class="col-md-7">
                            <label class="form-label">Nguyên liệu kho</label>
                            <select class="form-select recipe-inventory-select" data-index="${index}" onchange="syncRecipeIngredientBadges()">
                                <option value="">Chọn nguyên liệu</option>
                                ${inventoryItems.map(item => `
                                    <option value="${item.id}" ${String(item.id) === String(ingredient.inventory_item_id) ? 'selected' : ''}>
                                        ${item.name} (${Number(item.current_stock).toLocaleString('vi-VN')} ${item.unit})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Số lượng trừ/món</label>
                            <input type="number" min="0.01" step="0.01" class="form-control recipe-quantity-input" data-index="${index}" value="${ingredient.quantity_required}" oninput="syncRecipeIngredientBadges()">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Trạng thái</label>
                            <div id="recipe-badge-${index}" style="padding-top:6px">
                                ${getInventoryBadgeHtml(inventoryItem, Number(ingredient.quantity_required || 1))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function syncRecipeIngredientBadges() {
    currentRecipeIngredients.forEach((_, index) => {
        const inventoryId = document.querySelector(`.recipe-inventory-select[data-index="${index}"]`)?.value;
        const quantityRequired = Number(document.querySelector(`.recipe-quantity-input[data-index="${index}"]`)?.value || 0);
        const inventoryItem = inventoryItems.find(item => String(item.id) === String(inventoryId));
        const badge = document.getElementById(`recipe-badge-${index}`);
        if (badge) {
            badge.innerHTML = getInventoryBadgeHtml(inventoryItem, quantityRequired);
        }
    });
}

function syncRecipeIngredientsFromInputs() {
    currentRecipeIngredients = currentRecipeIngredients.map((_, index) => ({
        inventory_item_id: document.querySelector(`.recipe-inventory-select[data-index="${index}"]`)?.value || '',
        quantity_required: Number(document.querySelector(`.recipe-quantity-input[data-index="${index}"]`)?.value || 0)
    }));
}

function addRecipeIngredient() {
    syncRecipeIngredientsFromInputs();
    currentRecipeIngredients.push(buildRecipeIngredientRow());
    renderRecipeIngredients();
}

function removeRecipeIngredient(index) {
    syncRecipeIngredientsFromInputs();
    currentRecipeIngredients.splice(index, 1);
    renderRecipeIngredients();
}

async function openRecipeModal(itemId) {
    currentRecipeItem = getMenuItemById(itemId);
    if (!currentRecipeItem) return;

    if (!inventoryItems.length) {
        showToast('Chưa có nguyên liệu trong kho. Vào Cài đặt để thêm trước.', 'danger');
        return;
    }

    const inventoryMeta = getInventoryStatusMeta(currentRecipeItem);
    document.getElementById('recipeModalTitle').textContent = `Chi tiết món và kho - ${currentRecipeItem.name}`;
    document.getElementById('recipeSummary').innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div>
                <div style="font-weight:700;font-size:16px">${currentRecipeItem.name}</div>
                <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">
                    Danh mục: ${currentRecipeItem.category_name || 'Khác'} • Giá bán: ${formatCurrency(currentRecipeItem.price)} • Đơn vị: ${currentRecipeItem.unit}
                </div>
            </div>
            <span class="badge ${inventoryMeta.className}">${inventoryMeta.label}</span>
        </div>
    `;

    try {
        const response = await apiCall(`/api/menu/${itemId}/recipe`);
        currentRecipeIngredients = (response.ingredients || []).map(buildRecipeIngredientRow);
        renderRecipeIngredients();
        new bootstrap.Modal(document.getElementById('recipeModal')).show();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function saveRecipe() {
    if (!currentRecipeItem) return;

    syncRecipeIngredientsFromInputs();
    const ingredients = currentRecipeIngredients
        .filter(item => item.inventory_item_id && item.quantity_required > 0)
        .map(item => ({
            inventory_item_id: Number(item.inventory_item_id),
            quantity_required: Number(item.quantity_required)
        }));

    try {
        await apiCall(`/api/menu/${currentRecipeItem.id}/recipe`, {
            method: 'PUT',
            body: JSON.stringify({ ingredients })
        });
        showToast('Đã lưu cấu hình kho!');
        bootstrap.Modal.getInstance(document.getElementById('recipeModal'))?.hide();
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function renderInventoryItems() {
    const tbody = document.getElementById('inventoryListTable');
    if (!tbody) return;

    if (!inventoryItems.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Chưa có nguyên liệu nào trong kho</td></tr>';
        return;
    }

    tbody.innerHTML = inventoryItems.map(item => {
        const currentStock = Number(item.current_stock || 0);
        const minStock = Number(item.min_stock || 0);
        const badgeHtml = currentStock <= 0
            ? '<span class="badge report-method-badge is-other">Tạm hết</span>'
            : currentStock <= minStock
                ? '<span class="badge report-method-badge is-cash">Sắp hết</span>'
                : '<span class="badge report-method-badge">Ổn định</span>';

        return `
            <tr>
                <td>
                    <div class="menu-item-title">${item.name}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Mức tối thiểu: ${minStock.toLocaleString('vi-VN')} ${item.unit}</div>
                </td>
                <td class="menu-item-price-cell">${currentStock.toLocaleString('vi-VN')}</td>
                <td>${minStock.toLocaleString('vi-VN')}</td>
                <td><span class="menu-item-unit">${item.unit}</span></td>
                <td>${badgeHtml}</td>
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
    const id = document.getElementById('editInventoryId').value;
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
        if (id) {
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
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function quickAdjustInventory(id, direction) {
    const item = inventoryItems.find(entry => entry.id === id);
    if (!item) return;

    const amount = window.prompt(`Nhập số lượng ${direction > 0 ? 'thêm vào' : 'trừ khỏi'} kho cho "${item.name}"`, '1');
    if (amount === null) return;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        showToast('Số lượng điều chỉnh không hợp lệ', 'danger');
        return;
    }

    try {
        await apiCall(`/api/inventory-items/${id}/adjust`, {
            method: 'POST',
            body: JSON.stringify({ amount: direction > 0 ? numericAmount : -numericAmount })
        });
        showToast('Đã cập nhật tồn kho');
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteInventoryItem(id) {
    const item = inventoryItems.find(entry => entry.id === id);
    if (!item || !confirm(`Bạn có chắc muốn xóa "${item.name}"?`)) return;

    try {
        await apiCall(`/api/inventory-items/${id}`, { method: 'DELETE' });
        showToast('Đã xóa nguyên liệu!');
        await loadMenuPage();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

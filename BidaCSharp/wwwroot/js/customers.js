let customersData = [];
let selectedCustomer = null;
let membershipRankRules = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    if (!isAdmin()) {
        window.location.href = '/dashboard.html';
        return;
    }
    await initSidebar();
    bindCustomersPage();
    await Promise.all([loadMembershipRules(), loadCustomers()]);
});

function bindCustomersPage() {
    document.getElementById('customerSearchBtn')?.addEventListener('click', loadCustomers);
    document.getElementById('customerResetBtn')?.addEventListener('click', () => {
        document.getElementById('customerSearchInput').value = '';
        loadCustomers();
    });
    document.getElementById('customerSearchInput')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadCustomers();
        }
    });
    document.getElementById('saveCustomerBtn')?.addEventListener('click', saveCustomerDetail);
    document.getElementById('closeCustomerDetailBtn')?.addEventListener('click', closeCustomerDetail);
    document.getElementById('saveRankRulesBtn')?.addEventListener('click', saveMembershipRules);

    if (!isAdmin()) {
        document.getElementById('rankRulesCard')?.remove();
    }
}

async function loadMembershipRules() {
    const defaults = [
        { name: 'Bronze', min_spent: 0, min_hours: 0, benefit: 'Ưu tiên tích lũy hồ sơ khách quen' },
        { name: 'Silver', min_spent: 2000000, min_hours: 20, benefit: 'Giảm 5%' },
        { name: 'Gold', min_spent: 5000000, min_hours: 60, benefit: 'Giảm 10%' },
        { name: 'VIP', min_spent: 10000000, min_hours: 150, benefit: 'Giảm 15% + ưu tiên bàn VIP' }
    ];

    try {
        const settings = await apiCall('/api/settings');
        membershipRankRules = settings?.membership_rank_rules
            ? JSON.parse(settings.membership_rank_rules)
            : defaults;
    } catch {
        membershipRankRules = defaults;
    }

    renderMembershipRules();
}

function renderMembershipRules() {
    const tbody = document.getElementById('rankRulesTableBody');
    if (!tbody) return;
    const benefitOptions = [
        'Ưu tiên tích lũy hồ sơ khách quen',
        'Giảm 5%',
        'Giảm 10%',
        'Giảm 15% + ưu tiên bàn VIP'
    ];

    tbody.innerHTML = membershipRankRules.map((rule, index) => `
        <tr>
            <td><input type="text" class="form-control" data-rule-field="name" data-rule-index="${index}" value="${rule.name || ''}"></td>
            <td><input type="number" class="form-control" data-rule-field="min_spent" data-rule-index="${index}" value="${Number(rule.min_spent || 0)}"></td>
            <td><input type="number" class="form-control" data-rule-field="min_hours" data-rule-index="${index}" value="${Number(rule.min_hours || 0)}"></td>
            <td>
                <select class="form-select" data-rule-field="benefit" data-rule-index="${index}">
                    ${benefitOptions.map(option => `<option value="${option}" ${option === (rule.benefit || '') ? 'selected' : ''}>${option}</option>`).join('')}
                </select>
            </td>
        </tr>
    `).join('');
}

async function saveMembershipRules() {
    membershipRankRules = Array.from(document.querySelectorAll('#rankRulesTableBody tr')).map((row, index) => ({
        name: row.querySelector(`[data-rule-field="name"][data-rule-index="${index}"]`)?.value?.trim() || '',
        min_spent: Number(row.querySelector(`[data-rule-field="min_spent"][data-rule-index="${index}"]`)?.value || 0),
        min_hours: Number(row.querySelector(`[data-rule-field="min_hours"][data-rule-index="${index}"]`)?.value || 0),
        benefit: row.querySelector(`[data-rule-field="benefit"][data-rule-index="${index}"]`)?.value?.trim() || ''
    })).filter(rule => rule.name);

    try {
        await apiCall('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({
                membership_rank_rules: membershipRankRules
            })
        });
        showToast('Đã lưu cấu hình hạng member');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function loadCustomers() {
    const tbody = document.getElementById('customersTableBody');

    try {
        const keyword = document.getElementById('customerSearchInput')?.value?.trim() || '';
        const query = keyword ? `?search=${encodeURIComponent(keyword)}` : '';
        const response = await apiCall(`/api/customers${query}`);
        customersData = Array.isArray(response) ? response : [];
        renderCustomerSummary();
        renderCustomersTable();
    } catch (err) {
        console.error('Load customers error:', err);
        customersData = [];
        renderCustomerSummary();
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ff8f85">Không tải được danh sách member: ${err.message}</td></tr>`;
        }
        showToast(err.message, 'danger');
    }
}

function renderCustomerSummary() {
    const totalSpent = customersData.reduce((sum, item) => sum + Number(item.total_spent || 0), 0);
    const totalHours = customersData.reduce((sum, item) => sum + Number(item.total_play_minutes || 0), 0);
    const topRank = customersData.find(item => item.rank_name)?.rank_name || '--';

    document.getElementById('membersCount').textContent = String(customersData.length);
    document.getElementById('membersTopRank').textContent = topRank;
    document.getElementById('membersTotalHours').textContent = formatCustomerHours(totalHours);
    document.getElementById('membersTotalSpent').textContent = formatCurrency(totalSpent);
}

function renderCustomersTable() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (!customersData.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Chưa có member nào. Hãy thanh toán với SĐT hợp lệ để tự tạo member đầu tiên.</td></tr>';
        return;
    }

    tbody.innerHTML = customersData.map(item => `
        <tr class="${selectedCustomer?.id === item.id ? 'is-selected-row' : ''}">
            <td>${item.phone}</td>
            <td>${item.full_name || '<span style="color:var(--text-muted)">Chưa cập nhật</span>'}</td>
            <td><span class="badge text-bg-warning">${item.rank_name || 'Bronze'}</span></td>
            <td>${formatCustomerHours(item.total_play_minutes)}</td>
            <td>${formatCurrency(item.total_spent || 0)}</td>
            <td>${item.last_played_at ? formatDateTime(item.last_played_at) : '--'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary" onclick="selectCustomer(${item.id})">
                    <i class="bi bi-eye me-1"></i>Xem
                </button>
            </td>
        </tr>
    `).join('');
}

async function selectCustomer(customerId) {
    try {
        selectedCustomer = await apiCall(`/api/customers/${customerId}`);
        document.getElementById('customerDetailSection').style.display = '';
        fillCustomerDetail(selectedCustomer);

        const payments = await apiCall(`/api/customers/${customerId}/payments`);
        renderCustomerPayments(payments || []);
        renderCustomersTable();
        document.getElementById('customerDetailSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function fillCustomerDetail(customer) {
    document.getElementById('detailCustomerId').value = customer.id;
    document.getElementById('detailCustomerPhone').value = customer.phone || '';
    document.getElementById('detailCustomerName').value = customer.full_name || '';
    document.getElementById('detailCustomerRank').value = customer.rank_name || 'Bronze';
    document.getElementById('detailCustomerHours').value = formatCustomerHours(customer.total_play_minutes);
    document.getElementById('detailCustomerSpent').value = formatCurrency(customer.total_spent || 0);
    document.getElementById('detailCustomerNote').value = customer.note || '';
}

function renderCustomerPayments(payments) {
    const tbody = document.getElementById('customerPaymentsBody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Chưa có lịch sử thanh toán.</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(item => `
        <tr>
            <td>${formatDateTime(item.created_at)}</td>
            <td>${item.table_name || '--'}</td>
            <td>${formatCurrency(item.total_amount || 0)}</td>
            <td>${getMembershipPaymentLabel(item.payment_method)}</td>
            <td style="max-width:320px">${item.order_items_summary || '<span style="color:var(--text-muted)">Không có món</span>'}</td>
        </tr>
    `).join('');
}

async function saveCustomerDetail() {
    const customerId = Number(document.getElementById('detailCustomerId').value || 0);
    if (!customerId) return;

    const payload = {
        phone: document.getElementById('detailCustomerPhone').value.trim(),
        full_name: document.getElementById('detailCustomerName').value.trim(),
        rank_name: document.getElementById('detailCustomerRank').value.trim(),
        note: document.getElementById('detailCustomerNote').value.trim()
    };

    try {
        await apiCall(`/api/customers/${customerId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        showToast('Đã cập nhật member');
        closeCustomerDetail();
        await loadCustomers();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function closeCustomerDetail() {
    selectedCustomer = null;
    document.getElementById('customerDetailSection').style.display = 'none';
    renderCustomersTable();
}

function formatCustomerHours(totalPlayMinutes) {
    const totalHours = Number(totalPlayMinutes || 0) / 60;
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(totalHours)} giờ`;
}

function getMembershipPaymentLabel(method) {
    if (method === 'transfer') return 'Chuyển khoản';
    if (method === 'card') return 'Thẻ';
    return 'Tiền mặt';
}

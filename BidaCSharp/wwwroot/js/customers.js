let customersData = [];
let selectedCustomer = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;
    await initSidebar();
    bindCustomersPage();
    loadCustomers();
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
}

async function loadCustomers() {
    try {
        const keyword = document.getElementById('customerSearchInput')?.value?.trim() || '';
        const query = keyword ? `?search=${encodeURIComponent(keyword)}` : '';
        customersData = await apiCall(`/api/customers${query}`);
        renderCustomerSummary();
        renderCustomersTable();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function renderCustomerSummary() {
    const totalPoints = customersData.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const totalSpent = customersData.reduce((sum, item) => sum + Number(item.total_spent || 0), 0);
    const topRank = customersData.find(item => item.rank_name)?.rank_name || '--';

    document.getElementById('membersCount').textContent = String(customersData.length);
    document.getElementById('membersTopRank').textContent = topRank;
    document.getElementById('membersTotalPoints').textContent = new Intl.NumberFormat('vi-VN').format(totalPoints);
    document.getElementById('membersTotalSpent').textContent = formatCurrency(totalSpent);
}

function renderCustomersTable() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (!customersData.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Không tìm thấy member phù hợp.</td></tr>';
        return;
    }

    tbody.innerHTML = customersData.map(item => `
        <tr class="${selectedCustomer?.id === item.id ? 'is-selected-row' : ''}">
            <td>${item.phone}</td>
            <td>${item.full_name || '<span style="color:var(--text-muted)">Chưa cập nhật</span>'}</td>
            <td><span class="badge text-bg-warning">${item.rank_name || 'Member'}</span></td>
            <td>${new Intl.NumberFormat('vi-VN').format(item.points || 0)}</td>
            <td>${item.total_visits || 0}</td>
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

        const [payments, pointsHistory] = await Promise.all([
            apiCall(`/api/customers/${customerId}/payments`),
            apiCall(`/api/customers/${customerId}/points-history`)
        ]);

        renderCustomerPayments(payments || []);
        renderCustomerPoints(pointsHistory || []);
        renderCustomersTable();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function fillCustomerDetail(customer) {
    document.getElementById('detailCustomerId').value = customer.id;
    document.getElementById('detailCustomerPhone').value = customer.phone || '';
    document.getElementById('detailCustomerName').value = customer.full_name || '';
    document.getElementById('detailCustomerRank').value = customer.rank_name || 'Member';
    document.getElementById('detailCustomerPoints').value = customer.points || 0;
    document.getElementById('detailCustomerNote').value = customer.note || '';
}

function renderCustomerPayments(payments) {
    const tbody = document.getElementById('customerPaymentsBody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Chưa có lịch sử thanh toán.</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(item => `
        <tr>
            <td>${formatDateTime(item.created_at)}</td>
            <td>${item.table_name || '--'}</td>
            <td>${formatCurrency(item.total_amount || 0)}</td>
            <td>+${item.membership_points_earned || 0}</td>
            <td>${getMembershipPaymentLabel(item.payment_method)}</td>
            <td style="max-width:320px">${item.order_items_summary || '<span style="color:var(--text-muted)">Không có món</span>'}</td>
        </tr>
    `).join('');
}

function renderCustomerPoints(history) {
    const tbody = document.getElementById('customerPointsBody');
    if (!tbody) return;

    if (!history.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Chưa có lịch sử điểm.</td></tr>';
        return;
    }

    tbody.innerHTML = history.map(item => `
        <tr>
            <td>${formatDateTime(item.created_at)}</td>
            <td style="color:${Number(item.points_delta) >= 0 ? 'var(--success)' : 'var(--danger)'}">${Number(item.points_delta) >= 0 ? '+' : ''}${item.points_delta}</td>
            <td>${item.points_after}</td>
            <td>${item.reason || '--'}</td>
            <td>${item.note || '--'}</td>
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
        points: Number(document.getElementById('detailCustomerPoints').value || 0),
        note: document.getElementById('detailCustomerNote').value.trim()
    };

    try {
        const updated = await apiCall(`/api/customers/${customerId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        showToast('Đã cập nhật member');
        selectedCustomer = updated;
        fillCustomerDetail(updated);
        await loadCustomers();
        await selectCustomer(customerId);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function getMembershipPaymentLabel(method) {
    if (method === 'transfer') return 'Chuyển khoản';
    if (method === 'card') return 'Thẻ';
    return 'Tiền mặt';
}

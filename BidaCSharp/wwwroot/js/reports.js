const REPORTS_PER_PAGE = 15;
let allPayments = [];
let reportsPage = 1;
let tableEfficiencyData = [];
let reportsRevenueChart;
let paymentMethodChart;
let tableEfficiencyChart;
let tableRevenueChart;
let reportSearchKeyword = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    initSidebar();

    function toLocalISOString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 6);

    document.getElementById('filterFrom').value = toLocalISOString(fromDate);
    document.getElementById('filterTo').value = toLocalISOString(today);
    document.getElementById('reportSearchInput')?.addEventListener('input', event => {
        reportSearchKeyword = event.target.value.trim().toLowerCase();
        reportsPage = 1;
        renderReports(getEfficiencySummary(getFilteredEfficiencyData()));
    });

    loadReports();

    const realtime = initSocket();
    if (realtime) {
        realtime.on('payment-completed', () => loadReports());
    }
});

async function loadReports() {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;

    try {
        const [payments, efficiency] = await Promise.all([
            apiCall(`/api/payments?from=${from}&to=${to}`),
            apiCall(`/api/reports/table-efficiency?from=${from}&to=${to}`)
        ]);

        allPayments = payments || [];
        tableEfficiencyData = efficiency?.items || [];
        reportsPage = 1;
        renderReports(getEfficiencySummary(getFilteredEfficiencyData(), efficiency?.summary || null));
    } catch (err) {
        console.error('Load reports error:', err);
        showToast(err.message, 'danger');
    }
}

function renderReports(efficiencySummary) {
    const filteredPayments = getFilteredPayments();
    const filteredEfficiency = getFilteredEfficiencyData();
    const totalRevenue = filteredPayments.reduce((sum, payment) => sum + Number(payment.total_amount || 0), 0);
    const totalInvoices = filteredPayments.length;
    const avgRevenue = totalInvoices > 0 ? Math.round(totalRevenue / totalInvoices) : 0;

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('totalInvoices').textContent = totalInvoices;
    document.getElementById('avgRevenue').textContent = formatCurrency(avgRevenue);
    document.getElementById('efficiencyHours').textContent = `${Number(efficiencySummary?.total_play_hours || 0).toLocaleString('vi-VN')}h`;
    document.getElementById('efficiencyRate').textContent = `${Number(efficiencySummary?.avg_utilization_rate || 0).toLocaleString('vi-VN')}%`;
    document.getElementById('topTableName').textContent = efficiencySummary?.top_table?.table_name || '--';

    renderTableEfficiencyTable(filteredEfficiency);
    renderPaymentsTable(filteredPayments);
}

function getFilteredPayments() {
    if (!reportSearchKeyword) return allPayments;

    return allPayments.filter(payment => {
        const searchableText = [
            payment.table_name,
            payment.payment_method,
            getPaymentMethodLabel(payment.payment_method),
            payment.note,
            payment.order_items_summary,
            payment.table_type,
            formatDateTime(payment.created_at)
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return searchableText.includes(reportSearchKeyword);
    });
}

function getFilteredEfficiencyData() {
    if (!reportSearchKeyword) return tableEfficiencyData;

    return tableEfficiencyData.filter(item => {
        const relatedPaymentText = allPayments
            .filter(payment => payment.table_name === item.table_name)
            .map(payment => `${payment.order_items_summary || ''} ${payment.note || ''} ${getPaymentMethodLabel(payment.payment_method)}`)
            .join(' ')
            .toLowerCase();

        const searchableText = [
            item.table_name,
            item.table_type,
            relatedPaymentText
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return searchableText.includes(reportSearchKeyword);
    });
}

function getEfficiencySummary(filteredEfficiency, fallbackSummary = null) {
    if (!filteredEfficiency.length) {
        return {
            total_play_hours: 0,
            avg_utilization_rate: 0,
            top_table: null,
            total_play_revenue: 0
        };
    }

    if (!reportSearchKeyword && fallbackSummary) {
        return fallbackSummary;
    }

    const topTable = filteredEfficiency
        .slice()
        .sort((a, b) => Number(b.play_revenue || 0) - Number(a.play_revenue || 0))[0];

    return {
        total_play_hours: filteredEfficiency.reduce((sum, item) => sum + Number(item.total_hours || 0), 0),
        avg_utilization_rate: filteredEfficiency.reduce((sum, item) => sum + Number(item.utilization_rate || 0), 0) / filteredEfficiency.length,
        top_table: topTable,
        total_play_revenue: filteredEfficiency.reduce((sum, item) => sum + Number(item.play_revenue || 0), 0)
    };
}

function renderRevenueChart(filteredPayments) {
    if (typeof Chart === 'undefined') return;

    const grouped = new Map();
    filteredPayments.forEach(payment => {
        const key = new Date(payment.created_at).toLocaleDateString('vi-VN');
        grouped.set(key, (grouped.get(key) || 0) + Number(payment.total_amount || 0));
    });

    const labels = Array.from(grouped.keys()).reverse();
    const values = Array.from(grouped.values()).reverse();
    const canvas = document.getElementById('reportsRevenueChart');
    if (!canvas) return;

    reportsRevenueChart?.destroy();
    reportsRevenueChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Doanh thu',
                data: values,
                borderRadius: 12,
                backgroundColor: ['#667eea', '#38ef7d', '#ffd200', '#ff7b6b', '#6dd5ed', '#764ba2', '#11998e']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: '#aab1c6' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aab1c6',
                        callback: value => formatCurrency(value)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderPaymentMethodChart(filteredPayments) {
    if (typeof Chart === 'undefined') return;

    const methodLabels = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ' };
    const methodCounts = { cash: 0, transfer: 0, card: 0 };

    filteredPayments.forEach(payment => {
        const key = payment.payment_method || 'cash';
        methodCounts[key] = (methodCounts[key] || 0) + 1;
    });

    const labels = Object.keys(methodCounts)
        .filter(key => methodCounts[key] > 0)
        .map(key => methodLabels[key] || key);
    const values = Object.keys(methodCounts)
        .filter(key => methodCounts[key] > 0)
        .map(key => methodCounts[key]);

    const canvas = document.getElementById('paymentMethodChart');
    if (!canvas) return;

    paymentMethodChart?.destroy();
    paymentMethodChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#38ef7d', '#667eea', '#ffd200'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#d7def3', padding: 18 }
                }
            }
        }
    });
}

function renderTableEfficiencyChart(filteredEfficiency) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('tableEfficiencyChart');
    if (!canvas) return;

    const topItems = filteredEfficiency.slice(0, 8);
    tableEfficiencyChart?.destroy();
    tableEfficiencyChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: topItems.map(item => item.table_name),
            datasets: [{
                label: 'Hiệu suất (%)',
                data: topItems.map(item => Number(item.utilization_rate || 0)),
                borderRadius: 12,
                backgroundColor: ['#38ef7d', '#50d890', '#6dd5ed', '#667eea', '#a18cd1', '#ffd200', '#ff7b6b', '#11998e']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: '#aab1c6' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aab1c6',
                        callback: value => `${value}%`
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderTableRevenueChart(filteredEfficiency) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('tableRevenueChart');
    if (!canvas) return;

    const topItems = filteredEfficiency.slice(0, 8);
    tableRevenueChart?.destroy();
    tableRevenueChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: topItems.map(item => item.table_name),
            datasets: [{
                label: 'Doanh thu tiền bàn',
                data: topItems.map(item => Number(item.play_revenue || 0)),
                borderWidth: 3,
                borderColor: '#ffd200',
                backgroundColor: 'rgba(255, 210, 0, 0.12)',
                fill: true,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: '#aab1c6' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aab1c6',
                        callback: value => formatCurrency(value)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderTableEfficiencyTable(filteredEfficiency) {
    const tbody = document.getElementById('tableEfficiencyList');
    if (!filteredEfficiency.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Không có dữ liệu hiệu suất trong khoảng thời gian này</td></tr>';
        return;
    }

    tbody.innerHTML = filteredEfficiency.map(item => `
        <tr>
            <td><span class="report-payment-name">${item.table_name}</span></td>
            <td>${item.table_type === 'vip' ? '<span class="badge report-method-badge is-other">Bàn VIP</span>' : '<span class="badge report-method-badge is-cash">Bàn thường</span>'}</td>
            <td>${item.sessions_count}</td>
            <td>${Number(item.total_hours || 0).toLocaleString('vi-VN')}h</td>
            <td>${formatDuration(item.avg_minutes || 0)}</td>
            <td><span class="report-total-amount">${Number(item.utilization_rate || 0).toLocaleString('vi-VN')}%</span></td>
            <td><span class="report-amount">${formatCurrency(item.play_revenue)}</span></td>
        </tr>
    `).join('');
}

function renderPaymentsTable(filteredPayments) {
    const totalPages = Math.max(1, Math.ceil(filteredPayments.length / REPORTS_PER_PAGE));
    if (reportsPage > totalPages) reportsPage = totalPages;

    const startIndex = (reportsPage - 1) * REPORTS_PER_PAGE;
    const pagePayments = filteredPayments.slice(startIndex, startIndex + REPORTS_PER_PAGE);
    const tbody = document.getElementById('paymentsList');

    if (!filteredPayments.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">Không có dữ liệu trong khoảng thời gian này</td></tr>';
        document.getElementById('reportsPagination').innerHTML = '';
        return;
    }

    const adminColumn = isAdmin();
    tbody.innerHTML = pagePayments.map((payment, index) => `
        <tr>
            <td>${startIndex + index + 1}</td>
            <td><span class="report-payment-name">${payment.table_name}</span></td>
            <td class="report-meta-cell">${formatDateTime(payment.created_at)}</td>
            <td><span class="report-duration">${formatDuration(payment.play_duration)}</span></td>
            <td><span class="report-amount">${formatCurrency(payment.play_amount)}</span></td>
            <td><span class="report-amount">${formatCurrency(payment.order_amount)}</span></td>
            <td><span class="report-total-amount">${formatCurrency(payment.total_amount)}</span></td>
            <td><span class="badge report-method-badge ${payment.payment_method === 'cash' ? 'is-cash' : 'is-other'}">${getPaymentMethodLabel(payment.payment_method)}</span></td>
            <td class="report-note-cell" title="${(payment.note || '').replace(/"/g, '&quot;')}">${payment.note || '—'}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-info" onclick="copyInvoice(${payment.id})" title="Copy hóa đơn">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="exportInvoice(${payment.id})" title="Tải file hóa đơn">
                        <i class="bi bi-download"></i>
                    </button>
                    ${adminColumn ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePayment(${payment.id})" title="Xóa">
                        <i class="bi bi-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    renderReportsPagination(totalPages, filteredPayments.length);
}

function renderReportsPagination(totalPages, totalItems) {
    const pagination = document.getElementById('reportsPagination');
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let pagesHtml = '';
    for (let page = 1; page <= totalPages; page += 1) {
        pagesHtml += `<button class="btn btn-sm ${page === reportsPage ? 'btn-gradient-primary' : 'btn-outline-secondary'}" onclick="goReportsPage(${page})" style="min-width:36px">${page}</button>`;
    }

    pagination.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <small style="color:var(--text-muted)">Trang ${reportsPage}/${totalPages} (${totalItems} hóa đơn)</small>
            <div class="d-flex gap-1 flex-wrap justify-content-end">
                <button class="btn btn-sm btn-outline-secondary" onclick="goReportsPage(${reportsPage - 1})" ${reportsPage <= 1 ? 'disabled' : ''}>
                    <i class="bi bi-chevron-left"></i> Trước
                </button>
                ${pagesHtml}
                <button class="btn btn-sm btn-outline-secondary" onclick="goReportsPage(${reportsPage + 1})" ${reportsPage >= totalPages ? 'disabled' : ''}>
                    Sau <i class="bi bi-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function goReportsPage(page) {
    const totalPages = Math.max(1, Math.ceil(getFilteredPayments().length / REPORTS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    reportsPage = page;
    renderPaymentsTable(getFilteredPayments());
}

function getPaymentMethodLabel(method) {
    switch (method) {
        case 'transfer':
            return 'Chuyển khoản';
        case 'card':
            return 'Thẻ';
        default:
            return 'Tiền mặt';
    }
}

async function deletePayment(paymentId) {
    if (!confirm('Bạn có chắc muốn xóa dòng thanh toán này?')) return;

    try {
        await apiCall(`/api/payments/${paymentId}`, { method: 'DELETE' });
        showToast('Đã xóa thanh toán');
        loadReports();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function generateInvoiceText(payment) {
    const clubName = document.getElementById('sidebarClubName')?.textContent || 'Billiard Club';
    return `${clubName} - HÓA ĐƠN
--------------------------------
Bàn: ${payment.table_name}
Thời gian: ${formatDateTime(payment.created_at)}
Thời gian chơi: ${formatDuration(payment.play_duration)}
Tiền giờ: ${formatCurrency(payment.play_amount)}
Đồ uống/Dịch vụ: ${formatCurrency(payment.order_amount)}
${payment.order_items_summary ? `(${payment.order_items_summary})\n` : ''}--------------------------------
TỔNG CỘNG: ${formatCurrency(payment.total_amount)}
Thanh toán bằng: ${getPaymentMethodLabel(payment.payment_method)}
${payment.note ? `Ghi chú: ${payment.note}` : ''}`;
}

async function copyInvoice(id) {
    const payment = allPayments.find(p => p.id === id);
    if (!payment) return;
    const text = generateInvoiceText(payment);
    await copyTextToClipboard(text, 'Đã copy thông tin hóa đơn');
}

function exportInvoice(id) {
    const payment = allPayments.find(p => p.id === id);
    if (!payment) return;
    const text = generateInvoiceText(payment);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HoaDon_${removeVietnameseTones(payment.table_name).replace(/\s+/g, '')}_${new Date(payment.created_at).getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

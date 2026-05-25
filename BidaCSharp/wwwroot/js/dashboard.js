let revenueTrendChart;
let statusBreakdownChart;

const STATUS_LABELS = {
    available: 'Trong',
    playing: 'Dang choi',
    reserved: 'Dat truoc'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;

    initSidebar();
    loadDashboard();

    function updateTime() {
        document.getElementById('currentTime').textContent = new Date().toLocaleString('vi-VN');
    }

    updateTime();
    setInterval(updateTime, 1000);

    const realtime = initSocket();
    if (realtime) {
        realtime.on('table-updated', () => loadDashboard());
        realtime.on('payment-completed', () => loadDashboard());
        realtime.on('order-updated', () => loadDashboard());
    }
});

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function buildSessionSummary(session) {
    if (!session) {
        return {
            title: 'Chua co phien',
            meta: 'He thong se cap nhat khi co ban hoat dong'
        };
    }

    return {
        title: session.table_name || `Ban ${session.table_id}`,
        meta: session.status === 'active'
            ? `${formatDateTime(session.start_time)} • Dang choi`
            : `${formatDateTime(session.start_time)} • Da hoan tat`
    };
}

function renderRevenueTrendChart(data = []) {
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('revenueTrendChart');
    if (!ctx) return;

    revenueTrendChart?.destroy();
    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.label),
            datasets: [{
                label: 'Doanh thu',
                data: data.map(item => Number(item.value || 0)),
                borderColor: '#38ef7d',
                backgroundColor: 'rgba(56, 239, 125, 0.12)',
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: { color: '#aab1c6' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
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

function renderStatusBreakdownChart(data = []) {
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('statusBreakdownChart');
    if (!ctx) return;

    statusBreakdownChart?.destroy();
    statusBreakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(item => STATUS_LABELS[item.label] || item.label),
            datasets: [{
                data: data.map(item => Number(item.value || 0)),
                backgroundColor: ['#38ef7d', '#ff7b6b', '#ffd200', '#667eea'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#d7def3',
                        padding: 18
                    }
                }
            }
        }
    });
}

async function loadDashboard() {
    try {
        const data = await apiCall('/api/dashboard');
        if (!data) return;

        const totalTables = Number(data.totalTables || 0);
        const playingTables = Number(data.playingTables || 0);
        const availableTables = Number(data.availableTables || 0);
        const occupancyRate = totalTables > 0 ? Math.round((playingTables / totalTables) * 100) : 0;
        const topItem = Array.isArray(data.topItems) && data.topItems.length > 0 ? data.topItems[0] : null;
        const latestSession = Array.isArray(data.recentSessions) && data.recentSessions.length > 0 ? data.recentSessions[0] : null;
        const latestSummary = buildSessionSummary(latestSession);

        setText('totalTables', totalTables);
        setText('playingTables', playingTables);
        setText('revenueToday', formatCurrency(data.revenueToday || 0));
        setText('revenueMonth', formatCurrency(data.revenueMonth || 0));
        setText('occupancyRate', `${occupancyRate}%`);
        setText('heroAvailableTables', availableTables);
        setText('heroActiveSessions', playingTables);
        setText('heroTopItem', topItem ? topItem.item_name : '--');
        setText('insightUtilization', `${occupancyRate}%`);
        setText('insightUtilizationMeta', `${playingTables}/${totalTables} ban dang phuc vu`);
        setText('insightTopItem', topItem ? topItem.item_name : 'Chua co du lieu');
        setText(
            'insightTopItemMeta',
            topItem
                ? `${topItem.total_qty} da ban • ${formatCurrency(topItem.total_revenue)}`
                : 'Chua phat sinh don hoan tat'
        );
        setText('insightLatestSession', latestSummary.title);
        setText('insightLatestSessionMeta', latestSummary.meta);

        renderRevenueTrendChart(data.revenueByDay || []);
        renderStatusBreakdownChart(data.statusBreakdown || []);

        const topList = document.getElementById('topItemsList');
        if (Array.isArray(data.topItems) && data.topItems.length > 0) {
            topList.innerHTML = data.topItems.map((item, index) => `
                <div class="top-item">
                    <div class="rank">${index + 1}</div>
                    <div class="item-info">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-qty">${item.total_qty} da ban</div>
                    </div>
                    <div class="item-revenue">${formatCurrency(item.total_revenue)}</div>
                </div>
            `).join('');
        } else {
            topList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Chua co du lieu ban hang</p>';
        }

        if (!isAdmin()) {
            document.querySelector('.page-hero-actions a[href="/menu.html"]')?.remove();
        }

        const sessionList = document.getElementById('recentSessionsList');
        if (Array.isArray(data.recentSessions) && data.recentSessions.length > 0) {
            sessionList.innerHTML = `
                <div style="max-height:300px;overflow-y:auto">
                    ${data.recentSessions.map(session => `
                        <div class="top-item">
                            <div class="rank" style="background:${session.status === 'active' ? 'var(--gradient-danger)' : 'var(--gradient-success)'}">
                                <i class="bi bi-${session.status === 'active' ? 'play-fill' : 'check'}"></i>
                            </div>
                            <div class="item-info">
                                <div class="item-name">${session.table_name}</div>
                                <div class="item-qty">
                                    ${formatDateTime(session.start_time)}
                                    ${session.end_time ? ` → ${formatTime(session.end_time)}` : ' • Dang choi'}
                                </div>
                            </div>
                            <div style="font-size:13px;color:${session.status === 'active' ? 'var(--danger)' : 'var(--success)'}">
                                ${session.status === 'active' ? 'Dang choi' : formatCurrency(session.total_amount)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            sessionList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Chua co phien choi</p>';
        }
    } catch (err) {
        console.error('Load dashboard error:', err);
        showToast(err.message, 'danger');
    }
}

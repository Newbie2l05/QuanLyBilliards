const chatbotState = {
    pendingIntent: null,
    draft: {},
    lastAvailability: null,
    lastPricing: null
};

document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) return;
    initChatbot();
});

function initChatbot() {
    if (document.getElementById('chatbotFab')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <button id="chatbotFab" class="chatbot-fab" type="button" aria-label="Mở chatbot">
            <i class="bi bi-robot"></i>
        </button>
        <section id="chatbotPanel" class="chatbot-panel" aria-live="polite">
            <div class="chatbot-header">
                <div>
                    <strong>AI Chatbot</strong>
                    <small>Kiểm tra bàn, báo giá và đặt bàn thật</small>
                </div>
                <button id="chatbotClose" type="button" class="chatbot-close">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <div id="chatbotMessages" class="chatbot-messages"></div>
            <div class="chatbot-quick-actions">
                <button type="button" class="chatbot-chip" data-message="Còn bàn không?">Còn bàn không?</button>
                <button type="button" class="chatbot-chip" data-message="Đặt bàn 19h cho 4 người">Đặt 19h cho 4 người</button>
                <button type="button" class="chatbot-chip" data-message="Giá bàn VIP bao nhiêu?">Giá bàn VIP</button>
                <button type="button" class="chatbot-chip" data-message="Tình trạng bàn hiện tại?">Tình trạng bàn</button>
                <button type="button" class="chatbot-chip" data-message="Doanh thu hôm nay?">Doanh thu</button>
                <button type="button" class="chatbot-chip" data-message="Menu có gì?">Xem menu</button>
            </div>
            <form id="chatbotForm" class="chatbot-form">
                <input id="chatbotInput" type="text" class="form-control" placeholder="Ví dụ: 7h còn bàn không?" autocomplete="off">
                <button type="submit" class="btn btn-gradient-primary">
                    <i class="bi bi-send-fill"></i>
                </button>
            </form>
        </section>
    `);

    const fab = document.getElementById('chatbotFab');
    const panel = document.getElementById('chatbotPanel');
    const closeBtn = document.getElementById('chatbotClose');
    const form = document.getElementById('chatbotForm');
    const input = document.getElementById('chatbotInput');

    fab.addEventListener('click', () => panel.classList.toggle('is-open'));
    closeBtn.addEventListener('click', () => panel.classList.remove('is-open'));
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        input.value = '';
        await handleChatbotMessage(message);
    });

    document.querySelectorAll('.chatbot-chip').forEach(button => {
        button.addEventListener('click', async () => {
            const message = button.dataset.message;
            if (!message) return;
            await handleChatbotMessage(message);
        });
    });

    const savedMessages = loadChatHistory();
    if (savedMessages.length > 0) {
        savedMessages.forEach(msg => addChatMessage(msg.role, msg.text, false));
    } else {
        addChatMessage('bot', 'Xin chào! 👋 Mình là trợ lý AI của quán bida. Mình có thể giúp bạn:');
        addChatMessage('bot', '🔹 Kiểm tra bàn trống & đặt bàn\n🔹 Xem bảng giá & menu\n🔹 Tình trạng bàn đang chơi\n🔹 Doanh thu hôm nay\n\nHãy hỏi mình bất cứ điều gì!');
    }
}

async function handleChatbotMessage(message) {
    addChatMessage('user', message);

    if (await handlePendingIntent(message)) {
        return;
    }

    const intent = detectIntent(message);
    if (intent === '__handled__') return;
    const timeInfo = parseTime(message);
    const people = parsePeople(message);
    const budget = parseBudget(message);
    const preferredType = parsePreferredType(message, budget);

    switch (intent) {
        case 'availability': {
            if (!timeInfo) {
                chatbotState.pendingIntent = 'availability';
                addChatMessage('bot', 'Bạn muốn kiểm tra lúc mấy giờ? Ví dụ 19h, 7 giờ tối hoặc tối nay.');
                return;
            }

            await replyAvailability(timeInfo);
            return;
        }
        case 'booking': {
            chatbotState.draft = {
                ...chatbotState.draft,
                timeInfo: timeInfo || chatbotState.lastAvailability || chatbotState.draft.timeInfo || null,
                people: people || chatbotState.draft.people || null,
                budget: isCheapestRequested(message) ? 1 : (budget ?? chatbotState.draft.budget ?? null),
                preferredType: preferredType || chatbotState.draft.preferredType || null,
                tableName: parseTableName(message) || chatbotState.draft.tableName || null
            };

            if (!chatbotState.draft.timeInfo && !chatbotState.draft.people) {
                chatbotState.pendingIntent = 'booking';
                addChatMessage('bot', buildMissingBookingPrompt(chatbotState.draft));
                return;
            }

            if (!chatbotState.draft.timeInfo) {
                chatbotState.pendingIntent = 'booking';
                addChatMessage('bot', `Mình hiểu bạn muốn ${describePricePreference(chatbotState.draft)}. Bạn muốn chơi lúc mấy giờ?`);
                return;
            }

            if (!chatbotState.draft.people) {
                chatbotState.pendingIntent = 'booking';
                addChatMessage('bot', `Mình đã ghi nhận ${describeTimePreference(chatbotState.draft.timeInfo)} và ${describePricePreference(chatbotState.draft)}. Bạn đi bao nhiêu người?`);
                return;
            }

            await replyBooking(chatbotState.draft);
            return;
        }
        case 'pricing': {
            await replyPricing(message);
            return;
        }
        case 'status': {
            await replyStatus();
            return;
        }
        case 'revenue': {
            await replyRevenue();
            return;
        }
        case 'menu': {
            await replyMenu(message);
            return;
        }
        case 'greeting': {
            addChatMessage('bot', 'Chào bạn! 😊 Mình có thể giúp gì cho bạn? Hỏi mình về bàn trống, đặt bàn, bảng giá, menu, doanh thu hay tình trạng quán nhé!');
            return;
        }
        case 'help': {
            addChatMessage('bot', 'Mình có thể giúp bạn:\n🔹 "Còn bàn không?" - kiểm tra bàn trống\n🔹 "Đặt bàn 19h cho 4 người" - đặt bàn\n🔹 "Giá bàn VIP" - xem bảng giá\n🔹 "Menu có gì?" - xem thực đơn\n🔹 "Tình trạng bàn" - bàn đang chơi\n🔹 "Doanh thu hôm nay" - báo cáo doanh thu');
            return;
        }
        default:
            if (budget !== null) {
                chatbotState.pendingIntent = 'booking';
                chatbotState.draft = {
                    ...chatbotState.draft,
                    budget,
                    preferredType
                };
                addChatMessage('bot', `Mình hiểu bạn đang muốn ${describePricePreference(chatbotState.draft)}. Bạn muốn chơi lúc mấy giờ và bao nhiêu người?`);
                return;
            }

            addChatMessage('bot', 'Mình chưa hiểu rõ lắm 🤔. Bạn thử hỏi "còn bàn không", "đặt bàn", "xem menu", "doanh thu" hoặc gõ "help" để xem hướng dẫn nhé!');
    }
}

async function handlePendingIntent(message) {
    if (!chatbotState.pendingIntent) {
        return false;
    }

    const timeInfo = parseTime(message);
    const people = parsePeople(message);
    const budget = parseBudget(message);
    const preferredType = parsePreferredType(message, budget);

    if (chatbotState.pendingIntent === 'availability') {
        if (!timeInfo) {
            addChatMessage('bot', 'Mình vẫn chưa thấy giờ. Bạn thử nhập 19h, 19:00 hoặc 7 giờ tối nhé.');
            return true;
        }

        chatbotState.pendingIntent = null;
        await replyAvailability(timeInfo);
        return true;
    }

    if (chatbotState.pendingIntent === 'booking') {
        if (timeInfo) {
            chatbotState.draft.timeInfo = timeInfo;
        }
        if (people) {
            chatbotState.draft.people = people;
        }
        if (budget !== null) {
            chatbotState.draft.budget = budget;
        }
        if (preferredType) {
            chatbotState.draft.preferredType = preferredType;
        }

        if (!chatbotState.draft.timeInfo) {
            addChatMessage('bot', `Mình đã ghi nhận ${describePricePreference(chatbotState.draft)}. Bạn cho mình giờ chơi trước nhé, ví dụ 19h hoặc tối nay.`);
            return true;
        }

        if (!chatbotState.draft.people) {
            addChatMessage('bot', `Mình đã ghi nhận ${describeTimePreference(chatbotState.draft.timeInfo)} và ${describePricePreference(chatbotState.draft)}. Bạn đi bao nhiêu người?`);
            return true;
        }

        chatbotState.pendingIntent = null;
        await replyBooking(chatbotState.draft);
        return true;
    }

    return false;
}

function detectIntent(message) {
    const normalized = normalizeText(message);
    const hasBudget = parseBudget(message) !== null;
    const hasBookingKeywords = /\b(dat|giu|book|mo|lay|chon|muon)\b/.test(normalized);
    const hasTableKeyword = /\bban\b/.test(normalized);
    const hasPricingKeywords = /(gia|bao nhieu|bang gia|vip gia|ban vip|ban thuong|co loai nao|la ban gi)/.test(normalized);

    if (/^(hi|hello|hey|chao|xin chao|alo|yo)\b/.test(normalized)) {
        return 'greeting';
    }

    if (/^(help|huong dan|giup|chi minh|lam gi duoc|ban lam duoc gi|co the gi)/.test(normalized)) {
        return 'help';
    }

    if (/(doanh thu|thu nhap|kiem duoc|tien hom nay|bao cao|thong ke ngay|so lieu)/.test(normalized)) {
        return 'revenue';
    }

    if (/(tinh trang|trang thai|dang choi|may ban dang|hien tai|ban nao dang|overview|tong quan)/.test(normalized)) {
        return 'status';
    }

    if (/(menu|thuc don|do uong|nuoc|an gi|uong gi|co gi an|co gi uong|tra da|ca phe|bia|nuoc ngot|do an)/.test(normalized)) {
        return 'menu';
    }

    if (/(dat ban|giu ban|book ban|mo ban|cho minh ban|muon ban|dat cho|giu cho|book cho)/.test(normalized)) {
        return 'booking';
    }

    if (hasBudget && hasBookingKeywords && hasTableKeyword) {
        return 'booking';
    }

    if (hasBudget && hasTableKeyword && !hasPricingKeywords) {
        return 'booking';
    }

    if (hasPricingKeywords) {
        return 'pricing';
    }

    if (hasBudget && /(gia|bao nhieu|co loai nao|la ban gi)/.test(normalized)) {
        return 'pricing';
    }

    if (hasBudget) {
        return 'booking';
    }

    if (/(con ban|ban trong|trong khong|co ban khong|kiem tra ban|con trong|co trong)/.test(normalized)) {
        return 'availability';
    }

    if (/(cam on|thank|ok|duoc roi|tot|tuyet|hay)/.test(normalized)) {
        addChatMessage('bot', 'Không có gì! 😊 Nếu cần thêm gì cứ hỏi mình nhé!');
        return '__handled__';
    }

    return 'unknown';
}

function parseTime(message) {
    const raw = message.toLowerCase();
    const normalized = normalizeText(message);

    const isTomorrow = /(mai|ngay mai|hom sau)/.test(normalized);
    
    if (normalized.includes('toi nay')) {
        return { time: '19:00', label: 'tối nay', isTomorrow: false };
    }
    if (normalized.includes('chieu nay')) {
        return { time: '17:00', label: 'chiều nay', isTomorrow: false };
    }
    if (normalized.includes('trua nay')) {
        return { time: '12:00', label: 'trưa nay', isTomorrow: false };
    }
    if (normalized.includes('sang nay')) {
        return { time: '09:00', label: 'sáng nay', isTomorrow: false };
    }

    const colonMatch = raw.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (colonMatch) {
        return { ...buildTimeInfo(colonMatch[1], colonMatch[2], colonMatch[0], normalized), isTomorrow };
    }

    const hourMatch = raw.match(/(\d{1,2})\s*(?:h|giờ)\s*(\d{1,2})?/u);
    if (hourMatch) {
        return { ...buildTimeInfo(hourMatch[1], hourMatch[2] || '0', hourMatch[0], normalized), isTomorrow };
    }

    return null;
}

function buildTimeInfo(hourValue, minuteValue, label, normalizedText) {
    let hour = Number(hourValue);
    let minute = Number(minuteValue || 0);

    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    if (/(toi|chieu|dem)/.test(normalizedText) && hour < 12) {
        hour += 12;
    }
    if (/(sang)/.test(normalizedText) && hour === 12) {
        hour = 0;
    }
    if (/(trua)/.test(normalizedText) && hour < 11) {
        hour += 12;
    }
    if (/(dem)/.test(normalizedText) && hour === 12) {
        hour = 0;
    }

    return {
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        label: label.trim()
    };
}

function parsePeople(message) {
    const normalized = normalizeText(message);
    const match = normalized.match(/(\d+)\s*(nguoi|khach)/);
    if (match) {
        return Number(match[1]);
    }

    if (/^\d+$/.test(normalized.trim())) {
        return Number(normalized.trim());
    }

    return null;
}

function parseBudget(message) {
    const normalized = normalizeText(message);

    const shorthandMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|ng|trieu|tr)\b/);
    if (shorthandMatch) {
        return normalizeBudgetValue(shorthandMatch[1], shorthandMatch[2]);
    }

    const moneyMatch = normalized.match(/(\d{4,6})\s*(d|dong|đ)?\b/);
    if (moneyMatch && /(gia|ban|dat|giu|vip|thuong)/.test(normalized)) {
        return Number(moneyMatch[1]);
    }

    return null;
}

function normalizeBudgetValue(rawValue, unit) {
    const numericValue = Number(String(rawValue).replace(',', '.'));
    if (Number.isNaN(numericValue)) {
        return null;
    }

    if (unit === 'trieu' || unit === 'tr') {
        return Math.round(numericValue * 1000000);
    }

    return Math.round(numericValue * 1000);
}

function parsePreferredType(message, budget) {
    const normalized = normalizeText(message);

    if (/\bvip\b/.test(normalized)) {
        return 'vip';
    }

    if (/(thuong|standard|pho thong|re|gia re|tiet kiem|binh dan)/.test(normalized)) {
        return 'standard';
    }

    if (budget !== null) {
        return budget >= 100000 ? 'vip' : 'standard';
    }

    return null;
}

function parseTableName(message) {
    const normalized = normalizeText(message);
    const match = normalized.match(/ban\s*(?:so\s*)?(\d+)/);
    return match ? `Ban ${match[1]}` : null;
}

function isCheapestRequested(message) {
    const normalized = normalizeText(message);
    return /(re nhat|gia thap nhat|re nhat co the|tiet kiem nhat)/.test(normalized);
}

function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[đĐ]/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[?.!,]/g, '') // Loại bỏ dấu chấm hỏi, chấm than, chấm, phẩy
        .replace(/\s+/g, ' ')
        .trim();
}

async function replyAvailability(timeInfo) {
    const typing = addTypingMessage();
    try {
        const result = await checkAvailability(timeInfo.time);
        typing.remove();
        chatbotState.lastAvailability = timeInfo;

        if (result.available) {
            addChatMessage('bot', `${timeInfo.label} còn ${result.tables} bàn trống, bạn muốn mình đặt luôn không?`);
        } else {
            addChatMessage('bot', `${timeInfo.label} hiện không còn bàn trống. Bạn muốn mình kiểm tra khung giờ khác không?`);
        }
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Mình chưa kiểm tra được tình trạng bàn lúc này.');
    }
}

async function replyBooking(draft) {
    const typing = addTypingMessage();
    try {
        const timeValue = draft.timeInfo.isTomorrow ? `mai ${draft.timeInfo.time}` : draft.timeInfo.time;
        const result = await bookTable({
            time: timeValue,
            people: draft.people,
            preferred_type: draft.preferredType || null,
            table_name: draft.tableName || null,
            budget_per_hour: draft.budget || null
        });
        typing.remove();

        chatbotState.pendingIntent = null;
        chatbotState.draft = {};

        if (result.success) {
            const priceLine = result.price_per_hour
                ? ` (${formatCurrency(result.price_per_hour)}/giờ)`
                : '';
            addChatMessage('bot', `${result.message}. Mình đã giữ ${result.table_name}${priceLine} cho bạn.`);
            showToast('Chatbot đã đặt bàn thành công');
        } else {
            addChatMessage('bot', result.message || 'Mình chưa đặt được bàn ở khung giờ này.');
        }
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Mình chưa đặt được bàn lúc này.');
    }
}

async function replyPricing(message) {
    const typing = addTypingMessage();
    try {
        const prices = await getPricing();
        typing.remove();
        chatbotState.lastPricing = prices;

        const budget = parseBudget(message);
        if (budget !== null) {
            addChatMessage('bot', formatBudgetLookupReply(prices, budget));
            return;
        }

        addChatMessage('bot', formatPricingReply(prices));
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Mình chưa lấy được bảng giá lúc này.');
    }
}

function formatPricingReply(prices) {
    if (!Array.isArray(prices) || prices.length === 0) {
        return 'Hiện mình chưa lấy được dữ liệu giá bàn.';
    }

    const lines = prices.map(item => {
        const typeLabel = item.type === 'vip' ? 'Bàn VIP' : 'Bàn thường';
        const minPrice = Number(item.min_price || 0);
        const maxPrice = Number(item.max_price || 0);
        const priceLabel = minPrice === maxPrice
            ? `${formatCurrency(minPrice)}/giờ`
            : `từ ${formatCurrency(minPrice)} đến ${formatCurrency(maxPrice)}/giờ`;
        return `${typeLabel}: ${priceLabel}`;
    });

    return lines.join(' | ');
}

function formatBudgetLookupReply(prices, budget) {
    if (!Array.isArray(prices) || prices.length === 0) {
        return 'Hiện mình chưa lấy được dữ liệu giá bàn.';
    }

    const matched = prices.filter(item => {
        const minPrice = Number(item.min_price || 0);
        const maxPrice = Number(item.max_price || 0);
        return budget >= minPrice && budget <= maxPrice;
    });

    if (matched.length > 0) {
        const labels = matched.map(item => item.type === 'vip' ? 'bàn VIP' : 'bàn thường');
        return `${formatCurrency(budget)}/giờ phù hợp với ${labels.join(' và ')}. Nếu muốn, bạn có thể nhắn “đặt bàn ${Math.round(budget / 1000)}k lúc 19h cho 4 người”.`;
    }

    return `${formatCurrency(budget)}/giờ hiện chưa trùng chính xác với bảng giá. ${formatPricingReply(prices)}`;
}

function buildMissingBookingPrompt(draft) {
    const priceHint = describePricePreference(draft);
    return `Mình hiểu bạn muốn ${priceHint}. Bạn muốn chơi lúc mấy giờ và bao nhiêu người?`;
}

function describePricePreference(draft) {
    if (draft?.budget) {
        return `bàn khoảng ${formatCurrency(draft.budget)}/giờ`;
    }

    if (draft?.preferredType === 'vip') {
        return 'bàn VIP';
    }

    if (draft?.preferredType === 'standard') {
        return 'bàn thường';
    }

    return 'một bàn phù hợp';
}

function describeTimePreference(timeInfo) {
    if (!timeInfo) {
        return 'khung giờ bạn muốn';
    }

    return `khung giờ ${timeInfo.label || timeInfo.time}`;
}

function checkAvailability(time) {
    return apiCall(`/api/check-availability?time=${encodeURIComponent(time)}`);
}

function bookTable(data) {
    return apiCall('/api/book-table', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

function getPricing() {
    return apiCall('/api/chatbot/prices');
}

function getStatus() {
    return apiCall('/api/chatbot/status');
}

function getRevenue() {
    return apiCall('/api/chatbot/revenue');
}

function getMenu(q) {
    const url = q ? `/api/chatbot/menu?q=${encodeURIComponent(q)}` : '/api/chatbot/menu';
    return apiCall(url);
}

async function replyStatus() {
    const typing = addTypingMessage();
    try {
        const data = await getStatus();
        typing.remove();
        let msg = `📊 Tình trạng quán hiện tại:\n🟢 Trống: ${data.available} bàn\n🔴 Đang chơi: ${data.playing} bàn\n🟡 Đặt trước: ${data.reserved} bàn\nTổng: ${data.total} bàn`;
        if (data.active_sessions && data.active_sessions.length > 0) {
            msg += '\n\n🎱 Bàn đang chơi:';
            data.active_sessions.forEach(s => {
                const hrs = Math.floor(s.minutes_played / 60);
                const mins = s.minutes_played % 60;
                const dur = hrs > 0 ? `${hrs}h${mins}p` : `${mins} phút`;
                msg += `\n• ${s.table_name} (${s.table_type}) — ${dur}`;
            });
        }
        addChatMessage('bot', msg);
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Không lấy được tình trạng bàn.');
    }
}

async function replyRevenue() {
    const typing = addTypingMessage();
    try {
        const data = await getRevenue();
        typing.remove();
        addChatMessage('bot', `💰 Báo cáo doanh thu:\n• Hôm nay: ${formatCurrency(data.revenue_today)}\n• Tháng này: ${formatCurrency(data.revenue_month)}\n• Số lượt chơi hôm nay: ${data.sessions_today} (hoàn thành: ${data.completed_today})`);
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Không lấy được doanh thu.');
    }
}

async function replyMenu(message) {
    const typing = addTypingMessage();
    try {
        const normalized = normalizeText(message);
        let keyword = null;
        
        // Cải thiện: Nếu chỉ hỏi "menu có gì", "xem menu" thì coi như xem tất cả
        const isGeneralRequest = /^(menu|thuc don|xem menu|menu co gi|quan co gi|co gi an|co gi uong)$/.test(normalized);
        
        if (!isGeneralRequest) {
            const searchMatch = normalized.match(/(?:menu|thuc don|do uong|tim|co|mon)\s+(.+)/);
            if (searchMatch) {
                keyword = searchMatch[1].trim();
                // Loại bỏ từ thừa
                keyword = keyword.replace(/^(co gi|la gi|dau|gi)\b/g, '').trim();
            }
        }

        // Ưu tiên các từ khóa đặc biệt
        if (/(bia|beer)/.test(normalized)) keyword = 'bia';
        if (/(ca phe|cafe|coffee)/.test(normalized)) keyword = 'cà phê';
        if (/(nuoc ngot|nuoc uong|sting|cocacola|pepsi)/.test(normalized)) keyword = keyword || 'nước';
        if (/(tra da|tra)/.test(normalized) && !keyword) keyword = 'trà';
        if (/(thuoc la|thuoc)/.test(normalized)) keyword = 'thuốc';

        // Nếu keyword sau khi lọc bị rỗng thì lấy toàn bộ menu
        if (keyword === '' || keyword === 'co gi') keyword = null;

        const items = await getMenu(keyword);
        typing.remove();
        
        if (!items || items.length === 0) {
            addChatMessage('bot', keyword ? `Hiện mình không thấy món nào liên quan đến "${keyword}" trong menu. Bạn thử hỏi "menu có gì" để xem tất cả nhé!` : 'Menu hiện đang trống.');
            return;
        }

        let msg = keyword ? `🔍 Kết quả tìm "${keyword}":` : '📋 Menu của quán chúng mình:';
        items.forEach(item => {
            msg += `\n• ${item.name}: ${formatCurrency(item.price)}/${item.unit}`;
        });
        
        if (!keyword) {
            msg += '\n\n💡 Bạn có thể hỏi chi tiết hơn, ví dụ: "Có bia gì không?" hoặc "Giá cà phê".';
        }
        
        addChatMessage('bot', msg);
    } catch (err) {
        typing.remove();
        addChatMessage('bot', err.message || 'Hic, mình không lấy được menu lúc này.');
    }
}

function addChatMessage(role, message, save = true) {
    const messages = document.getElementById('chatbotMessages');
    if (!messages) return null;

    const bubble = document.createElement('div');
    bubble.className = `chatbot-message chatbot-message-${role}`;
    bubble.innerHTML = `<span>${escapeHtml(message).replace(/\n/g, '<br>')}</span>`;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;

    if (save) {
        saveChatHistory(role, message);
    }
    return bubble;
}

function saveChatHistory(role, text) {
    const user = getUser();
    if (!user) return;
    const key = `chat_history_${user.id}`;
    const history = loadChatHistory();
    history.push({ role, text, time: new Date().getTime() });
    // Chỉ giữ tối đa 50 tin nhắn gần nhất cho nhẹ
    if (history.length > 50) history.shift();
    localStorage.setItem(key, JSON.stringify(history));
}

function loadChatHistory() {
    const user = getUser();
    if (!user) return [];
    const key = `chat_history_${user.id}`;
    const raw = localStorage.getItem(key);
    try {
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function clearChatHistory() {
    const user = getUser();
    if (!user) return;
    localStorage.removeItem(`chat_history_${user.id}`);
}

function addTypingMessage() {
    const messages = document.getElementById('chatbotMessages');
    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message chatbot-message-bot chatbot-typing';
    bubble.innerHTML = '<span>Đang xử lý...</span>';
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

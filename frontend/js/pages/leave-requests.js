import { api } from '../api.js';
import { state } from '../state.js';
import { formatDate, formatDateTime, roleLabel } from '../utils.js';
import { showToast } from '../components/toast.js';

let usersCache = [];

function canManage() {
    return ['director', 'manager'].includes(state.user.role);
}

function todayIso() {
    return new Date().toISOString().split('T')[0];
}

function typeLabel(type) {
    return type === 'sick' ? 'Больничный' : 'Отдых';
}

function statusBadge(status) {
    if (status === 'approved') return '<span class="badge bg-green-100 text-green-700">Одобрено</span>';
    if (status === 'rejected') return '<span class="badge bg-red-50 text-red-700">Отклонено</span>';
    return '<span class="badge bg-yellow-100 text-yellow-700">Ожидает</span>';
}

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Отпуск / Больничный</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <h3 class="font-bold mb-3">Новая заявка</h3>
                <div class="space-y-3">
                    ${canManage() ? `
                        <div>
                            <label class="input-label">Сотрудник</label>
                            <select class="input" id="leave-user"></select>
                        </div>
                    ` : ''}
                    <div>
                        <label class="input-label">Тип</label>
                        <select class="input" id="leave-type">
                            <option value="sick">Больничный</option>
                            <option value="rest">Отдых</option>
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Причина</label>
                        <textarea class="input" id="leave-reason" rows="3" placeholder="Опишите причину..."></textarea>
                    </div>
                    <div>
                        <label class="input-label">Режим дат</label>
                        <select class="input" id="leave-date-mode">
                            <option value="range">Начало + конец</option>
                            <option value="days">Начало + количество дней</option>
                        </select>
                    </div>
                    <div class="reports-filter-grid">
                        <div>
                            <label class="input-label">Дата начала</label>
                            <input type="date" class="input" id="leave-date-start" value="${todayIso()}">
                        </div>
                        <div id="leave-date-end-wrap">
                            <label class="input-label">Дата конца</label>
                            <input type="date" class="input" id="leave-date-end" value="${todayIso()}">
                        </div>
                        <div id="leave-days-wrap" style="display:none;">
                            <label class="input-label">Дней</label>
                            <input type="number" class="input" id="leave-days-count" min="1" value="1">
                        </div>
                        <button class="btn btn-primary" id="leave-submit">Отправить</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="reports-filter-grid mb-3">
                    <div>
                        <label class="input-label">Статус</label>
                        <select class="input" id="leave-status-filter">
                            <option value="">Все</option>
                            <option value="pending">Ожидает</option>
                            <option value="approved">Одобрено</option>
                            <option value="rejected">Отклонено</option>
                        </select>
                    </div>
                    ${canManage() ? `
                        <div>
                            <label class="input-label">Сотрудник</label>
                            <select class="input" id="leave-user-filter">
                                <option value="">Все</option>
                            </select>
                        </div>
                    ` : ''}
                    <button class="btn btn-secondary" id="leave-refresh">Обновить</button>
                </div>
                <div id="leave-list">
                    <div class="flex justify-center py-8"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    if (canManage()) {
        await loadUsers();
        fillUserSelects();
    }

    document.getElementById('leave-date-mode').onchange = syncDateMode;
    document.getElementById('leave-submit').onclick = submitLeaveRequest;
    document.getElementById('leave-refresh').onclick = loadLeaveList;
    document.getElementById('leave-status-filter').onchange = loadLeaveList;
    if (canManage()) {
        document.getElementById('leave-user-filter').onchange = loadLeaveList;
    }

    loadLeaveList();
}

async function loadUsers() {
    try {
        const rows = await api.get('/api/users');
        usersCache = (rows || []).filter((u) => u.is_active);
    } catch {
        usersCache = [];
    }
}

function fillUserSelects() {
    const formSelect = document.getElementById('leave-user');
    const filterSelect = document.getElementById('leave-user-filter');
    const options = usersCache.map((u) => `<option value="${u.id}">${u.full_name} (${roleLabel(u.role)})</option>`).join('');
    if (formSelect) {
        formSelect.innerHTML = options;
        formSelect.value = String(state.user.id);
    }
    if (filterSelect) {
        filterSelect.innerHTML = `<option value="">Все</option>${options}`;
    }
}

function syncDateMode() {
    const mode = document.getElementById('leave-date-mode').value;
    const endWrap = document.getElementById('leave-date-end-wrap');
    const daysWrap = document.getElementById('leave-days-wrap');
    if (mode === 'days') {
        endWrap.style.display = 'none';
        daysWrap.style.display = '';
    } else {
        endWrap.style.display = '';
        daysWrap.style.display = 'none';
    }
}

async function submitLeaveRequest() {
    const type = document.getElementById('leave-type').value;
    const reason = document.getElementById('leave-reason').value.trim();
    const mode = document.getElementById('leave-date-mode').value;
    const dateStart = document.getElementById('leave-date-start').value;

    if (!reason) {
        showToast('Укажите причину', 'warning');
        return;
    }

    const payload = {
        type,
        reason,
        date_start: dateStart,
    };

    if (canManage()) {
        const selectedUser = document.getElementById('leave-user').value;
        if (selectedUser) payload.user_id = parseInt(selectedUser, 10);
    }

    if (mode === 'days') {
        const days = parseInt(document.getElementById('leave-days-count').value, 10) || 0;
        if (days < 1) {
            showToast('Количество дней должно быть больше 0', 'warning');
            return;
        }
        payload.days_count = days;
    } else {
        payload.date_end = document.getElementById('leave-date-end').value;
    }

    try {
        await api.post('/api/leave-requests', payload);
        showToast('Заявка отправлена', 'success');
        document.getElementById('leave-reason').value = '';
        loadLeaveList();
    } catch {
        // handled by api layer
    }
}

async function reviewLeaveRequest(id, status) {
    try {
        await api.patch(`/api/leave-requests/${id}/status`, { status });
        showToast(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', 'success');
        loadLeaveList();
    } catch {
        // handled
    }
}

async function loadLeaveList() {
    const list = document.getElementById('leave-list');
    list.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';

    try {
        const q = new URLSearchParams({ limit: '100', offset: '0' });
        const status = document.getElementById('leave-status-filter').value;
        if (status) q.set('status', status);
        if (canManage()) {
            const userFilter = document.getElementById('leave-user-filter').value;
            if (userFilter) q.set('user_id', userFilter);
        }
        const data = await api.get(`/api/leave-requests?${q.toString()}`);
        const items = Array.isArray(data) ? data : (data?.items || []);

        if (items.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 py-8">Заявок нет</div>';
            return;
        }

        list.innerHTML = items.map((row) => {
            const canApprove = canManage() && row.status === 'pending' && row.user_id !== state.user.id;
            return `
                <div class="py-3 border-b last:border-0">
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <div>
                            <div class="font-medium">${row.user_name} <span class="text-gray-400">#${row.user_id}</span></div>
                            <div class="text-xs text-gray-400">${typeLabel(row.type)} • ${formatDate(row.date_start)} — ${formatDate(row.date_end)} (${row.days_count} дн.)</div>
                        </div>
                        ${statusBadge(row.status)}
                    </div>
                    <div class="text-sm text-gray-600 mb-2">${row.reason}</div>
                    <div class="text-xs text-gray-400">
                        Создано: ${row.created_by_name || '—'} • ${formatDateTime(row.created_at)}
                        ${row.reviewed_by_name ? `<br>Рассмотрел: ${row.reviewed_by_name}${row.reviewed_at ? ` • ${formatDateTime(row.reviewed_at)}` : ''}` : ''}
                    </div>
                    ${canApprove ? `
                        <div class="flex gap-2 mt-2">
                            <button class="btn btn-success btn-sm" data-approve="${row.id}">Одобрить</button>
                            <button class="btn btn-danger btn-sm" data-reject="${row.id}">Отклонить</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        list.querySelectorAll('[data-approve]').forEach((btn) => {
            btn.onclick = () => reviewLeaveRequest(btn.dataset.approve, 'approved');
        });
        list.querySelectorAll('[data-reject]').forEach((btn) => {
            btn.onclick = () => reviewLeaveRequest(btn.dataset.reject, 'rejected');
        });
    } catch {
        list.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки заявок</div>';
    }
}

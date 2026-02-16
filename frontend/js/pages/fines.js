import { api } from '../api.js';
import { formatCurrency, formatDateTime, roleLabel } from '../utils.js';

export async function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Журнал штрафов</h1>
            <div></div>
        </div>

        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <div class="reports-filter-grid mb-4">
                    <div>
                        <label class="input-label">С</label>
                        <input type="date" class="input" id="fine-date-from" value="${monthAgo}">
                    </div>
                    <div>
                        <label class="input-label">По</label>
                        <input type="date" class="input" id="fine-date-to" value="${today}">
                    </div>
                    <div>
                        <label class="input-label">Сотрудник</label>
                        <select class="input" id="fine-user">
                            <option value="0">Все сотрудники</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="load-fines-btn">Показать</button>
                </div>
            </div>

            <div id="fines-content"></div>
        </div>
    `;

    document.getElementById('load-fines-btn').onclick = loadFines;
    await loadUsers();
    loadFines();
}

async function loadUsers() {
    const select = document.getElementById('fine-user');
    try {
        const users = await api.get('/api/users');
        if (!users || !users.length) return;

        const options = users
            .filter(u => u.role !== 'director')
            .map(u => `<option value="${u.id}">${u.full_name} (${roleLabel(u.role)})</option>`)
            .join('');

        select.insertAdjacentHTML('beforeend', options);
    } catch {
        // ignore
    }
}

async function loadFines() {
    const from = document.getElementById('fine-date-from').value;
    const to = document.getElementById('fine-date-to').value;
    const userId = Number(document.getElementById('fine-user').value || 0);
    const content = document.getElementById('fines-content');

    content.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';

    try {
        const q = new URLSearchParams({
            penalties_only: '1',
            date_from: from,
            date_to: to,
        });
        if (userId > 0) q.set('user_id', String(userId));

        const fines = await api.get(`/api/hr/incidents?${q.toString()}`);
        if (!fines || fines.length === 0) {
            content.innerHTML = '<div class="text-center text-gray-400 py-8">Штрафов за выбранный период нет</div>';
            return;
        }

        const total = fines.reduce((sum, f) => sum + (Number(f.deduction_amount) || 0), 0);

        content.innerHTML = `
            <div class="card mb-4">
                <div class="reports-kpi-grid">
                    <div class="report-kpi report-kpi-orders">
                        <div class="report-kpi-value">${fines.length}</div>
                        <div class="report-kpi-label">Штрафов</div>
                    </div>
                    <div class="report-kpi report-kpi-profit" style="grid-column: span 1;">
                        <div class="report-kpi-value">${formatCurrency(total)}</div>
                        <div class="report-kpi-label">Сумма удержаний</div>
                    </div>
                </div>
            </div>

            <div class="space-y-3">
                ${fines.map(f => `
                    <div class="card">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <div class="font-bold">${f.employee_name}</div>
                                <div class="text-xs text-gray-400">${formatDateTime(f.created_at)} • ${f.created_by_name}</div>
                            </div>
                            <div class="badge" style="background: var(--danger-light); color: var(--danger); font-weight: 700;">
                                ${formatCurrency(f.deduction_amount || 0)}
                            </div>
                        </div>
                        <div class="text-sm text-gray-500 mt-2">${f.description}</div>
                        <div class="text-xs mt-2" style="color: var(--text-tertiary);">Тип: ${f.type}</div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch {
        content.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки журнала штрафов</div>';
    }
}

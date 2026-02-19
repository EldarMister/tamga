import { api } from '../api.js';
import { formatCurrency, roleLabel } from '../utils.js';

let currentSortBy = 'hours';
let currentSortDir = 'desc';
let currentUserId = '';

function isoDay(delta = 0) {
    const d = new Date(Date.now() + delta * 86400000);
    return d.toISOString().split('T')[0];
}

function setPeriod(mode) {
    const fromEl = document.getElementById('wj-date-from');
    const toEl = document.getElementById('wj-date-to');
    if (!fromEl || !toEl) return;

    if (mode === 'week') {
        toEl.value = isoDay(0);
        fromEl.value = isoDay(-6);
        return;
    }
    if (mode === 'month') {
        toEl.value = isoDay(0);
        fromEl.value = isoDay(-29);
    }
}

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Журнал работы</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <div class="period-selector mb-3">
                    <button class="period-btn active" id="wj-period-week">Неделя</button>
                    <button class="period-btn" id="wj-period-month">Месяц</button>
                </div>
                <div class="reports-filter-grid mb-3">
                    <div>
                        <label class="input-label">С</label>
                        <input type="date" class="input" id="wj-date-from" value="${isoDay(-6)}">
                    </div>
                    <div>
                        <label class="input-label">По</label>
                        <input type="date" class="input" id="wj-date-to" value="${isoDay(0)}">
                    </div>
                    <div>
                        <label class="input-label">Сотрудник</label>
                        <select class="input" id="wj-user-filter">
                            <option value="">Все</option>
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Сортировка</label>
                        <select class="input" id="wj-sort-by">
                            <option value="hours">По часам</option>
                            <option value="fines">По штрафам</option>
                            <option value="tasks">По задачам</option>
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Порядок</label>
                        <select class="input" id="wj-sort-dir">
                            <option value="desc">По убыванию</option>
                            <option value="asc">По возрастанию</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="wj-load-btn">Загрузить</button>
                </div>
            </div>

            <div id="wj-insights"></div>

            <div class="card">
                <div class="reports-table-wrap" id="wj-table-wrap">
                    <div class="flex justify-center py-8"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('wj-sort-by').value = currentSortBy;
    document.getElementById('wj-sort-dir').value = currentSortDir;
    document.getElementById('wj-user-filter').value = currentUserId;

    document.getElementById('wj-period-week').onclick = () => {
        document.getElementById('wj-period-week').classList.add('active');
        document.getElementById('wj-period-month').classList.remove('active');
        setPeriod('week');
        loadJournal();
    };
    document.getElementById('wj-period-month').onclick = () => {
        document.getElementById('wj-period-month').classList.add('active');
        document.getElementById('wj-period-week').classList.remove('active');
        setPeriod('month');
        loadJournal();
    };
    document.getElementById('wj-load-btn').onclick = loadJournal;

    loadJournal();
}

function renderUserFilter(items) {
    const select = document.getElementById('wj-user-filter');
    if (!select) return;
    const prev = currentUserId;
    const options = ['<option value="">Все</option>'];
    for (const row of items) {
        options.push(`<option value="${row.user_id}">${row.full_name} (#${row.user_id})</option>`);
    }
    select.innerHTML = options.join('');
    if (prev) select.value = prev;
}

function renderInsights(insights) {
    const box = document.getElementById('wj-insights');
    if (!box) return;
    const mostHours = insights?.most_hours;
    const mostFines = insights?.most_fines;
    const bestTasks = insights?.best_tasks;
    box.innerHTML = `
        <div class="reports-kpi-grid">
            <div class="report-kpi report-kpi-orders">
                <div class="report-kpi-label">Больше часов</div>
                <div class="font-bold mt-1">${mostHours ? `${mostHours.full_name} (${mostHours.value}ч)` : '—'}</div>
            </div>
            <div class="report-kpi report-kpi-revenue">
                <div class="report-kpi-label">Больше штрафов</div>
                <div class="font-bold mt-1">${mostFines ? `${mostFines.full_name} (${formatCurrency(mostFines.value)})` : '—'}</div>
            </div>
            <div class="report-kpi report-kpi-profit">
                <div class="report-kpi-label">Лучший по задачам</div>
                <div class="font-bold mt-1">${bestTasks ? `${bestTasks.full_name} (${bestTasks.value})` : '—'}</div>
            </div>
        </div>
    `;
}

function dayCell(day) {
    if (day.status === 'worked') return { text: `${day.hours}ч`, cls: 'wj-day-worked', title: 'Отработано' };
    if (day.status === 'leave') {
        const mark = day.leave_type === 'sick' ? 'В(Б)' : 'В(О)';
        return { text: mark, cls: 'wj-day-leave', title: 'Выходной по заявке' };
    }
    if (day.status === 'conflict') return { text: 'К', cls: 'wj-day-conflict', title: 'Конфликт: и смена, и заявка' };
    if (day.status === 'absent') return { text: 'Н', cls: 'wj-day-absent', title: 'Не пришёл' };
    return { text: '-', cls: 'wj-day-weekend', title: 'Выходной день' };
}

function renderTable(data) {
    const wrap = document.getElementById('wj-table-wrap');
    if (!wrap) return;
    const items = data?.items || [];
    const days = data?.period?.days || [];

    if (items.length === 0) {
        wrap.innerHTML = '<div class="text-center text-gray-400 py-8">Нет данных за выбранный период</div>';
        return;
    }

    const headDays = days.map(d => `<th class="wj-day-head">${d.slice(5)}</th>`).join('');
    const rows = items.map((row) => {
        const cells = (row.days || []).map((d) => {
            const value = dayCell(d);
            return `<td class="wj-day ${value.cls}" title="${value.title}">${value.text}</td>`;
        }).join('');
        return `
            <tr>
                <td class="wj-user-col">
                    <div class="font-medium">${row.full_name}</div>
                    <div class="text-xs text-gray-400">#${row.user_id} • ${roleLabel(row.role)}</div>
                </td>
                <td class="text-center">${row.total_hours}</td>
                <td class="text-center">${row.absent_days}</td>
                <td class="text-center">${row.fines_count} / ${formatCurrency(row.fines_sum)}</td>
                <td class="text-center">${row.tasks_done_count}</td>
                ${cells}
            </tr>
        `;
    }).join('');

    wrap.innerHTML = `
        <table class="wj-table">
            <thead>
                <tr>
                    <th class="wj-user-col">Сотрудник</th>
                    <th>Часы</th>
                    <th>Не пришёл</th>
                    <th>Штрафы</th>
                    <th>Задачи</th>
                    ${headDays}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadJournal() {
    const from = document.getElementById('wj-date-from').value;
    const to = document.getElementById('wj-date-to').value;
    const userFilter = document.getElementById('wj-user-filter');
    const sortByEl = document.getElementById('wj-sort-by');
    const sortDirEl = document.getElementById('wj-sort-dir');
    const wrap = document.getElementById('wj-table-wrap');
    const insightBox = document.getElementById('wj-insights');

    currentUserId = userFilter?.value || '';
    currentSortBy = sortByEl?.value || 'hours';
    currentSortDir = sortDirEl?.value || 'desc';

    if (wrap) wrap.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
    if (insightBox) insightBox.innerHTML = '';

    try {
        const q = new URLSearchParams({
            date_from: from,
            date_to: to,
            sort_by: currentSortBy,
            sort_dir: currentSortDir,
        });
        if (currentUserId) q.set('user_id', currentUserId);
        const data = await api.get(`/api/work-journal?${q.toString()}`);
        if (!data) return;

        renderUserFilter(data.items || []);
        renderInsights(data.insights);
        renderTable(data);
    } catch {
        if (wrap) wrap.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки журнала</div>';
    }
}

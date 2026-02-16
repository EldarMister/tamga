import { api } from '../api.js';
import { state } from '../state.js';
import { formatCurrency, formatDate } from '../utils.js';
import { showToast } from '../components/toast.js';

const PERIODS = [
    { id: 'today', label: 'Сегодня' },
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'custom', label: 'Период' },
];

let activePeriod = 'month';

function getDates(period) {
    const now = new Date();
    const to = now.toISOString().split('T')[0];

    if (period === 'today') {
        return { from: to, to };
    }

    if (period === 'week') {
        const d = new Date(now);
        d.setDate(now.getDate() - 7);
        return { from: d.toISOString().split('T')[0], to };
    }

    const d = new Date(now);
    d.setDate(now.getDate() - 30);
    return { from: d.toISOString().split('T')[0], to };
}

function getActiveRange() {
    if (activePeriod === 'custom') {
        return {
            from: document.getElementById('date-from')?.value || '',
            to: document.getElementById('date-to')?.value || '',
        };
    }
    return getDates(activePeriod);
}

export async function render(container) {
    const isDirector = state.user.role === 'director';
    const canUsePeriods = ['director', 'manager'].includes(state.user.role);
    const dates = getDates(activePeriod);

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title"><span class="text-gradient">Тамга Сервис</span></h1>
            <div></div>
        </div>

        <div class="px-4 space-y-4 pb-8 slide-up">
            ${canUsePeriods ? `
                <div class="period-selector">
                    ${PERIODS.map(p => `
                        <button class="period-btn ${p.id === activePeriod ? 'active' : ''}" data-period="${p.id}">${p.label}</button>
                    `).join('')}
                </div>

                ${activePeriod === 'custom' ? `
                    <div class="card custom-range-card">
                        <div class="custom-range-grid">
                            <div class="flex-1">
                                <label class="input-label">С</label>
                                <input type="date" class="input" id="date-from" value="${dates.from}">
                            </div>
                            <div class="flex-1">
                                <label class="input-label">По</label>
                                <input type="date" class="input" id="date-to" value="${dates.to}">
                            </div>
                            <button class="btn btn-primary btn-sm" id="apply-dates">OK</button>
                        </div>
                    </div>
                ` : ''}
            ` : ''}

            ${isDirector ? `
                <div class="flex justify-end">
                    <button class="btn btn-secondary btn-sm" id="export-finance-btn">Экспорт CSV</button>
                </div>
            ` : ''}

            <div id="stats-area">
                <div class="flex justify-center py-8"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    container.querySelectorAll('.period-btn').forEach(btn => {
        btn.onclick = () => {
            activePeriod = btn.dataset.period;
            render(container);
        };
    });

    if (activePeriod === 'custom') {
        const applyBtn = document.getElementById('apply-dates');
        if (applyBtn) {
            applyBtn.onclick = () => loadDashboard();
        }
    }

    const exportBtn = document.getElementById('export-finance-btn');
    if (exportBtn) {
        exportBtn.onclick = exportFinanceCsv;
    }

    loadDashboard();
}

async function exportFinanceCsv() {
    const { from, to } = getActiveRange();
    if (!from || !to) {
        showToast('Укажите диапазон дат', 'warning');
        return;
    }

    try {
        const q = new URLSearchParams({ date_from: from, date_to: to }).toString();
        const res = await fetch(`/api/reports/finance-export.csv?${q}`, {
            headers: { Authorization: `Bearer ${state.token}` },
        });

        if (res.status === 401) {
            window.location.hash = '#/login';
            return;
        }
        if (!res.ok) {
            showToast('Ошибка экспорта', 'error');
            return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finance_${from}_${to}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Отчет скачан', 'success');
    } catch {
        showToast('Ошибка экспорта', 'error');
    }
}

async function loadDashboard() {
    const area = document.getElementById('stats-area');
    const isDirector = state.user.role === 'director';
    const isManager = ['director', 'manager'].includes(state.user.role);

    const range = getActiveRange();
    const from = range.from;
    const to = range.to;

    try {
        const requests = [];

        if (isDirector) {
            requests.push(api.get(`/api/reports/finance?date_from=${from}&date_to=${to}`));
        } else if (isManager) {
            requests.push(api.get(`/api/reports/orders-summary?date_from=${from}&date_to=${to}`));
        } else {
            requests.push(Promise.resolve(null));
        }

        requests.push(api.get('/api/tasks?done=0'));

        const [summary, tasks] = await Promise.all(requests);
        let html = '';

        if (isDirector && summary) {
            html += renderDirectorDashboard(summary);
        }

        if (!isDirector && isManager && summary) {
            html += `
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="stat-card stat-card-blue">
                        <div class="stat-label">Заказов</div>
                        <div class="stat-value number-animate">${summary.totals.total_orders}</div>
                    </div>
                    <div class="stat-card stat-card-green">
                        <div class="stat-label">Выручка</div>
                        <div class="stat-value number-animate" style="color: var(--success);">${formatCurrency(summary.totals.total_revenue)}</div>
                    </div>
                </div>
            `;
        }

        html += renderTasksCard(tasks || []);

        area.innerHTML = html;

        area.querySelectorAll('.task-item').forEach(item => {
            const checkbox = item.querySelector('.task-checkbox');
            if (!checkbox) return;
            checkbox.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await api.patch(`/api/tasks/${item.dataset.taskId}/done`);
                    loadDashboard();
                } catch { /* handled */ }
            };
        });

    } catch {
        area.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 32px;">Ошибка загрузки</div>';
    }
}

function renderDirectorDashboard(fin) {
    const expenses = (fin.material_cost || 0) + (fin.payroll || 0) + (fin.penalties || 0);
    const profit = fin.profit || 0;
    const margin = fin.revenue > 0 ? Math.round((profit / fin.revenue) * 100) : 0;

    const progress = Math.max(0, Math.min(100, margin));
    const donutBg = `conic-gradient(var(--success) ${progress}%, var(--bg-tertiary) ${progress}% 100%)`;

    const daily = Array.isArray(fin.daily) ? [...fin.daily].reverse() : [];

    return `
        <div class="director-dashboard">
            <div class="card finance-hero mb-4">
                <div>
                    <div class="stat-label">Финансы за период</div>
                    <div class="finance-main">${formatCurrency(fin.revenue)}</div>
                    <div class="finance-sub">Доход • ${fin.orders_count} заказов</div>
                </div>
                <div class="margin-gauge-wrap">
                    <div class="margin-gauge" style="background: ${donutBg};">
                        <div class="margin-gauge-inner">${margin}%</div>
                    </div>
                    <div class="finance-sub">Маржа</div>
                </div>
            </div>

            <div class="director-kpi-grid mb-4">
                ${renderKpi('Доход', fin.revenue, 'var(--success)')}
                ${renderKpi('Расходы', expenses, 'var(--danger)')}
                ${renderKpi('Прибыль', profit, profit >= 0 ? 'var(--accent)' : 'var(--danger)')}
                ${renderKpi('Штрафы', fin.penalties || 0, 'var(--warning)')}
            </div>

            <div class="card mb-4">
                <div class="dash-title">Тренд: доход и расходы</div>
                ${renderFinanceLines(daily)}
            </div>

            <div class="card mb-4">
                <div class="dash-title">Структура расходов</div>
                ${renderExpenseStructure(fin.material_cost || 0, fin.payroll || 0, fin.penalties || 0)}
            </div>

            ${renderTopServices(fin.top_services || [])}
        </div>
    `;
}

function renderKpi(label, value, color) {
    return `
        <div class="kpi-card">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value" style="color: ${color};">${formatCurrency(value)}</div>
        </div>
    `;
}

function renderFinanceLines(daily) {
    if (!daily.length) {
        return '<div class="text-sm text-gray-400">Недостаточно данных для графика</div>';
    }

    const width = 640;
    const height = 180;
    const pad = 16;

    const rev = daily.map(d => Number(d.revenue || 0));
    const cost = daily.map(d => Number(d.cost || 0));
    const maxVal = Math.max(1, ...rev, ...cost);

    const toPoints = (vals) => vals.map((v, i) => {
        const x = pad + (i * (width - pad * 2)) / Math.max(1, vals.length - 1);
        const y = height - pad - (v / maxVal) * (height - pad * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const revPoints = toPoints(rev);
    const costPoints = toPoints(cost);

    const startLabel = formatDate(daily[0].day);
    const endLabel = formatDate(daily[daily.length - 1].day);

    return `
        <div class="line-chart-wrap">
            <svg viewBox="0 0 ${width} ${height}" class="line-chart" preserveAspectRatio="none">
                <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="chart-axis"></line>
                <polyline points="${costPoints}" class="chart-line-cost"></polyline>
                <polyline points="${revPoints}" class="chart-line-rev"></polyline>
            </svg>
            <div class="line-chart-legend">
                <span><i class="legend-dot legend-dot-rev"></i> Доход</span>
                <span><i class="legend-dot legend-dot-cost"></i> Расход</span>
                <span class="line-chart-dates">${startLabel} — ${endLabel}</span>
            </div>
        </div>
    `;
}

function renderExpenseStructure(material, payroll, penalties) {
    const total = Math.max(1, material + payroll + penalties);
    const mPct = Math.round((material / total) * 100);
    const pPct = Math.round((payroll / total) * 100);
    const penPct = Math.max(0, 100 - mPct - pPct);

    const gradient = `conic-gradient(
        var(--danger) 0% ${mPct}%,
        var(--warning) ${mPct}% ${mPct + pPct}%,
        var(--purple) ${mPct + pPct}% 100%
    )`;

    return `
        <div class="expense-structure">
            <div class="expense-donut" style="background: ${gradient};">
                <div class="expense-donut-inner">${formatCurrency(material + payroll + penalties)}</div>
            </div>
            <div class="expense-legend">
                ${renderLegendRow('Материалы', material, 'var(--danger)', mPct)}
                ${renderLegendRow('Зарплаты', payroll, 'var(--warning)', pPct)}
                ${renderLegendRow('Штрафы', penalties, 'var(--purple)', penPct)}
            </div>
        </div>
    `;
}

function renderLegendRow(label, value, color, pct) {
    return `
        <div class="legend-row">
            <span class="legend-name"><i class="legend-dot" style="background:${color}"></i>${label}</span>
            <span class="legend-value">${formatCurrency(value)} (${pct}%)</span>
        </div>
    `;
}

function renderTopServices(top) {
    if (!top.length) return '';

    const maxRevenue = Math.max(...top.map(s => Number(s.revenue || 0)), 1);

    return `
        <div class="card mb-4">
            <div class="dash-title">Топ услуг</div>
            <div class="top-services-list">
                ${top.map((s, idx) => {
                    const pct = Math.max(6, Math.round((Number(s.revenue || 0) / maxRevenue) * 100));
                    return `
                        <div class="top-service-row">
                            <div class="top-service-head">
                                <span class="top-service-index">${idx + 1}</span>
                                <span class="top-service-name">${s.name_ru}</span>
                                <span class="top-service-value">${formatCurrency(s.revenue)}</span>
                            </div>
                            <div class="top-service-bar">
                                <div class="top-service-fill" style="width:${pct}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderTasksCard(myTasks) {
    if (myTasks.length > 0) {
        return `
            <div class="card">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <h3 style="font-weight: 700; color: var(--text-primary);">Мои задачи</h3>
                    <span class="badge" style="background: var(--danger-light); color: var(--danger);">${myTasks.length}</span>
                </div>
                <div class="space-y-2">
                    ${myTasks.slice(0, 5).map(t => `
                        <div class="task-item" data-task-id="${t.id}">
                            <div class="task-checkbox ${t.is_done ? 'checked' : ''}"></div>
                            <div style="flex: 1; min-width:0;">
                                <div style="font-weight: 600; ${t.is_done ? 'text-decoration: line-through; color: var(--text-tertiary);' : ''}">${t.title}</div>
                                <div style="font-size: 12px; color: var(--text-tertiary);">${t.type === 'daily' ? 'На сегодня' : 'На неделю'} ${t.due_date ? '• до ' + formatDate(t.due_date) : ''}</div>
                            </div>
                        </div>
                    `).join('')}
                    ${myTasks.length > 5 ? `<a href="#/tasks" style="font-size: 13px; color: var(--accent); font-weight: 600;">Показать все (${myTasks.length})...</a>` : ''}
                </div>
            </div>
        `;
    }

    return `
        <div class="card" style="text-align: center; padding: 32px;">
            <div style="font-size: 40px; margin-bottom: 8px;">✅</div>
            <div style="font-weight: 600; color: var(--text-secondary);">Нет активных задач</div>
        </div>
    `;
}

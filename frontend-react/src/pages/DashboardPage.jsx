import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatCurrency, formatDate } from '@legacy/utils.js';

const PERIODS = [
    { id: 'today', label: 'Сегодня' },
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'custom', label: 'Период' },
];

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

function getActiveRange(activePeriod, customRange) {
    if (activePeriod === 'custom') {
        return customRange;
    }
    return getDates(activePeriod);
}

function renderKpi(label, value, color) {
    return (
        <div className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{formatCurrency(value)}</div>
        </div>
    );
}

function FinanceLines({ daily }) {
    if (!daily.length) {
        return <div className="text-sm text-gray-400">Недостаточно данных для графика</div>;
    }

    const width = 640;
    const height = 180;
    const pad = 16;

    const revenue = daily.map((item) => Number(item.revenue || 0));
    const costs = daily.map((item) => Number(item.cost || 0));
    const maxVal = Math.max(1, ...revenue, ...costs);

    const toPoints = (values) => values.map((value, index) => {
        const x = pad + (index * (width - pad * 2)) / Math.max(1, values.length - 1);
        const y = height - pad - (value / maxVal) * (height - pad * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    return (
        <div className="line-chart-wrap">
            <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
                <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="chart-axis" />
                <polyline points={toPoints(costs)} className="chart-line-cost" />
                <polyline points={toPoints(revenue)} className="chart-line-rev" />
            </svg>
            <div className="line-chart-legend">
                <span><i className="legend-dot legend-dot-rev" /> Доход</span>
                <span><i className="legend-dot legend-dot-cost" /> Расход</span>
                <span className="line-chart-dates">
                    {formatDate(daily[0].day)} - {formatDate(daily[daily.length - 1].day)}
                </span>
            </div>
        </div>
    );
}

function LegendRow({ label, value, color, pct }) {
    return (
        <div className="legend-row">
            <span className="legend-name"><i className="legend-dot" style={{ background: color }} />{label}</span>
            <span className="legend-value">{formatCurrency(value)} ({pct}%)</span>
        </div>
    );
}

function ExpenseStructure({ material, payroll, penalties }) {
    const total = Math.max(1, material + payroll + penalties);
    const materialPct = Math.round((material / total) * 100);
    const payrollPct = Math.round((payroll / total) * 100);
    const penaltiesPct = Math.max(0, 100 - materialPct - payrollPct);

    const gradient = `conic-gradient(
        var(--danger) 0% ${materialPct}%,
        var(--warning) ${materialPct}% ${materialPct + payrollPct}%,
        var(--purple) ${materialPct + payrollPct}% 100%
    )`;

    return (
        <div className="expense-structure">
            <div className="expense-donut" style={{ background: gradient }}>
                <div className="expense-donut-inner">{formatCurrency(material + payroll + penalties)}</div>
            </div>
            <div className="expense-legend">
                <LegendRow label="Материалы" value={material} color="var(--danger)" pct={materialPct} />
                <LegendRow label="Зарплаты" value={payroll} color="var(--warning)" pct={payrollPct} />
                <LegendRow label="Штрафы" value={penalties} color="var(--purple)" pct={penaltiesPct} />
            </div>
        </div>
    );
}

function TopServices({ services }) {
    if (!services.length) return null;

    const maxRevenue = Math.max(...services.map((service) => Number(service.revenue || 0)), 1);

    return (
        <div className="card mb-4">
            <div className="dash-title">Топ услуг</div>
            <div className="top-services-list">
                {services.map((service, index) => {
                    const pct = Math.max(6, Math.round((Number(service.revenue || 0) / maxRevenue) * 100));
                    return (
                        <div className="top-service-row" key={`${service.name_ru}-${index}`}>
                            <div className="top-service-head">
                                <span className="top-service-index">{index + 1}</span>
                                <span className="top-service-name">{service.name_ru}</span>
                                <span className="top-service-value">{formatCurrency(service.revenue)}</span>
                            </div>
                            <div className="top-service-bar">
                                <div className="top-service-fill" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DirectorDashboard({ summary }) {
    const expenses = (summary.material_cost || 0) + (summary.payroll || 0) + (summary.penalties || 0);
    const profit = summary.profit || 0;
    const margin = summary.revenue > 0 ? Math.round((profit / summary.revenue) * 100) : 0;
    const progress = Math.max(0, Math.min(100, margin));
    const donutBg = `conic-gradient(var(--success) ${progress}%, var(--bg-tertiary) ${progress}% 100%)`;
    const daily = Array.isArray(summary.daily) ? [...summary.daily].reverse() : [];

    return (
        <div className="director-dashboard">
            <div className="card finance-hero mb-4">
                <div>
                    <div className="stat-label">Финансы за период</div>
                    <div className="finance-main">{formatCurrency(summary.revenue)}</div>
                    <div className="finance-sub">Доход • {summary.orders_count} заказов</div>
                </div>
                <div className="margin-gauge-wrap">
                    <div className="margin-gauge" style={{ background: donutBg }}>
                        <div className="margin-gauge-inner">{margin}%</div>
                    </div>
                    <div className="finance-sub">Маржа</div>
                </div>
            </div>

            <div className="director-kpi-grid mb-4">
                {renderKpi('Доход', summary.revenue, 'var(--success)')}
                {renderKpi('Расходы', expenses, 'var(--danger)')}
                {renderKpi('Прибыль', profit, profit >= 0 ? 'var(--accent)' : 'var(--danger)')}
                {renderKpi('Штрафы', summary.penalties || 0, 'var(--warning)')}
            </div>

            <div className="card mb-4">
                <div className="dash-title">Тренд: доход и расходы</div>
                <FinanceLines daily={daily} />
            </div>

            <div className="card mb-4">
                <div className="dash-title">Структура расходов</div>
                <ExpenseStructure
                    material={summary.material_cost || 0}
                    payroll={summary.payroll || 0}
                    penalties={summary.penalties || 0}
                />
            </div>

            <TopServices services={summary.top_services || []} />
        </div>
    );
}

function TasksCard({ tasks, onToggle }) {
    if (!tasks.length) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Нет активных задач</div>
            </div>
        );
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Мои задачи</h3>
                <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>{tasks.length}</span>
            </div>
            <div className="space-y-2">
                {tasks.slice(0, 5).map((task) => (
                    <div className="task-item" data-task-id={task.id} key={task.id}>
                        <button
                            type="button"
                            className={`task-checkbox ${task.is_done ? 'checked' : ''}`}
                            onClick={() => onToggle(task.id)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={task.is_done
                                    ? { fontWeight: 600, textDecoration: 'line-through', color: 'var(--text-tertiary)' }
                                    : { fontWeight: 600 }}
                            >
                                {task.title}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {task.type === 'daily' ? 'На сегодня' : 'На неделю'}
                                {task.due_date ? ` • до ${formatDate(task.due_date)}` : ''}
                            </div>
                        </div>
                    </div>
                ))}
                {tasks.length > 5 ? (
                    <a href="#/tasks" style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
                        Показать все ({tasks.length})...
                    </a>
                ) : null}
            </div>
        </div>
    );
}

async function exportFinanceCsv(range) {
    if (!range.from || !range.to) {
        showToast('Укажите диапазон дат', 'warning');
        return;
    }

    try {
        const q = new URLSearchParams({ date_from: range.from, date_to: range.to }).toString();
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
        const link = document.createElement('a');
        link.href = url;
        link.download = `finance_${range.from}_${range.to}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Отчет скачан', 'success');
    } catch {
        showToast('Ошибка экспорта', 'error');
    }
}

export default function DashboardPage({ refreshToken = 0 }) {
    const user = state.user;
    const isDirector = user.role === 'director';
    const canUsePeriods = ['director', 'manager'].includes(user.role);
    const [activePeriod, setActivePeriod] = useState('month');
    const [customRangeDraft, setCustomRangeDraft] = useState(() => getDates('month'));
    const [customRangeApplied, setCustomRangeApplied] = useState(() => getDates('month'));
    const [summary, setSummary] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const activeRange = getActiveRange(activePeriod, customRangeApplied);

    useEffect(() => {
        let alive = true;

        async function loadDashboard() {
            setIsLoading(true);
            setError('');

            try {
                const requests = [];
                if (isDirector) {
                    requests.push(api.get(`/api/reports/finance?date_from=${activeRange.from}&date_to=${activeRange.to}`));
                } else if (canUsePeriods) {
                    requests.push(api.get(`/api/reports/orders-summary?date_from=${activeRange.from}&date_to=${activeRange.to}`));
                } else {
                    requests.push(Promise.resolve(null));
                }
                requests.push(api.get('/api/tasks?done=0'));

                const [nextSummary, nextTasks] = await Promise.all(requests);
                if (!alive) return;

                setSummary(nextSummary);
                setTasks(nextTasks || []);
            } catch {
                if (!alive) return;
                setError('Ошибка загрузки');
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadDashboard();
        return () => {
            alive = false;
        };
    }, [activePeriod, activeRange.from, activeRange.to, canUsePeriods, isDirector, refreshToken]);

    async function handleTaskToggle(taskId) {
        try {
            await api.patch(`/api/tasks/${taskId}/done`);
            setTasks((current) => current.filter((task) => task.id !== taskId));
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title"><span className="text-gradient">Тамга Сервис</span></h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8 slide-up">
                {canUsePeriods ? (
                    <>
                        <div className="period-selector">
                            {PERIODS.map((period) => (
                                <button
                                    key={period.id}
                                    type="button"
                                    className={`period-btn ${period.id === activePeriod ? 'active' : ''}`}
                                    onClick={() => {
                                        setActivePeriod(period.id);
                                        if (period.id === 'custom') {
                                            const monthRange = getDates('month');
                                            setCustomRangeDraft(monthRange);
                                            setCustomRangeApplied(monthRange);
                                        } else {
                                            const range = getDates(period.id);
                                            setCustomRangeDraft(range);
                                            setCustomRangeApplied(range);
                                        }
                                    }}
                                >
                                    {period.label}
                                </button>
                            ))}
                        </div>

                        {activePeriod === 'custom' ? (
                            <div className="card custom-range-card">
                                <div className="custom-range-grid">
                                    <div className="flex-1">
                                        <label className="input-label" htmlFor="date-from">С</label>
                                        <input
                                            id="date-from"
                                            type="date"
                                            className="input"
                                            value={customRangeDraft.from}
                                            onChange={(event) => setCustomRangeDraft((current) => ({
                                                ...current,
                                                from: event.target.value,
                                            }))}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="input-label" htmlFor="date-to">По</label>
                                        <input
                                            id="date-to"
                                            type="date"
                                            className="input"
                                            value={customRangeDraft.to}
                                            onChange={(event) => setCustomRangeDraft((current) => ({
                                                ...current,
                                                to: event.target.value,
                                            }))}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setCustomRangeApplied(customRangeDraft)}
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                ) : null}

                {isDirector ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => exportFinanceCsv(activeRange)}
                        >
                            Экспорт CSV
                        </button>
                    </div>
                ) : null}

                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div style={{ textAlign: 'center', color: 'var(--danger)', padding: '32px' }}>{error}</div>
                ) : (
                    <>
                        {isDirector && summary ? <DirectorDashboard summary={summary} /> : null}

                        {!isDirector && canUsePeriods && summary ? (
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="stat-card stat-card-blue">
                                    <div className="stat-label">Заказов</div>
                                    <div className="stat-value number-animate">{summary.totals.total_orders}</div>
                                </div>
                                <div className="stat-card stat-card-green">
                                    <div className="stat-label">Выручка</div>
                                    <div className="stat-value number-animate" style={{ color: 'var(--success)' }}>
                                        {formatCurrency(summary.totals.total_revenue)}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <TasksCard tasks={tasks} onToggle={handleTaskToggle} />
                    </>
                )}
            </div>
        </>
    );
}

import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { formatCurrency, roleLabel } from '@legacy/utils.js';

function isoDay(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().split('T')[0];
}

function getPeriodRange(mode) {
    return mode === 'month'
        ? { from: isoDay(-29), to: isoDay(0) }
        : { from: isoDay(-6), to: isoDay(0) };
}

function dayCell(day) {
    if (day.status === 'worked') return { text: `${day.hours}ч`, className: 'wj-day-worked', title: 'Отработано' };
    if (day.status === 'leave') {
        const mark = day.leave_type === 'sick' ? 'В(Б)' : 'В(О)';
        return { text: mark, className: 'wj-day-leave', title: 'Выходной по заявке' };
    }
    if (day.status === 'conflict') return { text: 'К', className: 'wj-day-conflict', title: 'Конфликт: и смена, и заявка' };
    if (day.status === 'absent') return { text: 'Н', className: 'wj-day-absent', title: 'Не пришёл' };
    return { text: '-', className: 'wj-day-weekend', title: 'Выходной день' };
}

function Insights({ insights }) {
    const mostHours = insights?.most_hours;
    const mostFines = insights?.most_fines;
    const bestTasks = insights?.best_tasks;

    return (
        <div className="reports-kpi-grid">
            <div className="report-kpi report-kpi-orders">
                <div className="report-kpi-label">Больше часов</div>
                <div className="font-bold mt-1">{mostHours ? `${mostHours.full_name} (${mostHours.value}ч)` : '—'}</div>
            </div>
            <div className="report-kpi report-kpi-revenue">
                <div className="report-kpi-label">Больше штрафов</div>
                <div className="font-bold mt-1">{mostFines ? `${mostFines.full_name} (${formatCurrency(mostFines.value)})` : '—'}</div>
            </div>
            <div className="report-kpi report-kpi-profit">
                <div className="report-kpi-label">Лучший по задачам</div>
                <div className="font-bold mt-1">{bestTasks ? `${bestTasks.full_name} (${bestTasks.value})` : '—'}</div>
            </div>
        </div>
    );
}

function WorkJournalTable({ data }) {
    const items = data?.items || [];
    const days = data?.period?.days || [];

    if (!items.length) {
        return <div className="text-center text-gray-400 py-8">Нет данных за выбранный период</div>;
    }

    return (
        <table className="wj-table">
            <thead>
                <tr>
                    <th className="wj-user-col">Сотрудник</th>
                    <th>Часы</th>
                    <th>Не пришёл</th>
                    <th>Штрафы</th>
                    <th>Задачи</th>
                    {days.map((day) => (
                        <th className="wj-day-head" key={day}>{day.slice(5)}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {items.map((row) => (
                    <tr key={row.user_id}>
                        <td className="wj-user-col">
                            <div className="font-medium">{row.full_name}</div>
                            <div className="text-xs text-gray-400">#{row.user_id} • {roleLabel(row.role)}</div>
                        </td>
                        <td className="text-center">{row.total_hours}</td>
                        <td className="text-center">{row.absent_days}</td>
                        <td className="text-center">{row.fines_count} / {formatCurrency(row.fines_sum)}</td>
                        <td className="text-center">{row.tasks_done_count}</td>
                        {(row.days || []).map((day) => {
                            const value = dayCell(day);
                            return (
                                <td className={`wj-day ${value.className}`} title={value.title} key={`${row.user_id}-${day.date}`}>
                                    {value.text}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function WorkJournalPage({ refreshToken = 0 }) {
    const initialFilters = {
        ...getPeriodRange('week'),
        userId: '',
        sortBy: 'hours',
        sortDir: 'desc',
    };
    const [periodMode, setPeriodMode] = useState('week');
    const [filters, setFilters] = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/work-journal');

        async function loadJournal() {
            setIsLoading(true);
            setError('');

            try {
                const query = new URLSearchParams({
                    date_from: appliedFilters.from,
                    date_to: appliedFilters.to,
                    sort_by: appliedFilters.sortBy,
                    sort_dir: appliedFilters.sortDir,
                });

                if (appliedFilters.userId) {
                    query.set('user_id', appliedFilters.userId);
                }

                const nextData = await api.get(`/api/work-journal?${query.toString()}`);
                if (!alive) return;
                setData(nextData);
            } catch {
                if (!alive) return;
                setError('Ошибка загрузки журнала');
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadJournal();
        return () => {
            alive = false;
        };
    }, [
        appliedFilters.from,
        appliedFilters.sortBy,
        appliedFilters.sortDir,
        appliedFilters.to,
        appliedFilters.userId,
        refreshToken,
    ]);

    const availableUsers = (data?.items || []).map((item) => ({
        id: String(item.user_id),
        full_name: item.full_name,
    }));

    function applyPeriod(mode) {
        const range = getPeriodRange(mode);
        const nextFilters = {
            ...filters,
            ...range,
        };
        setPeriodMode(mode);
        setFilters(nextFilters);
        setAppliedFilters(nextFilters);
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Журнал работы</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="period-selector mb-3">
                        <button
                            type="button"
                            className={`period-btn ${periodMode === 'week' ? 'active' : ''}`}
                            onClick={() => applyPeriod('week')}
                        >
                            Неделя
                        </button>
                        <button
                            type="button"
                            className={`period-btn ${periodMode === 'month' ? 'active' : ''}`}
                            onClick={() => applyPeriod('month')}
                        >
                            Месяц
                        </button>
                    </div>

                    <div className="reports-filter-grid mb-3">
                        <div>
                            <label className="input-label" htmlFor="wj-date-from">С</label>
                            <input
                                id="wj-date-from"
                                type="date"
                                className="input"
                                value={filters.from}
                                onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="input-label" htmlFor="wj-date-to">По</label>
                            <input
                                id="wj-date-to"
                                type="date"
                                className="input"
                                value={filters.to}
                                onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="input-label" htmlFor="wj-user-filter">Сотрудник</label>
                            <select
                                id="wj-user-filter"
                                className="input"
                                value={filters.userId}
                                onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
                            >
                                <option value="">Все</option>
                                {availableUsers.map((item) => (
                                    <option key={item.id} value={item.id}>{item.full_name} (#{item.id})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="input-label" htmlFor="wj-sort-by">Сортировка</label>
                            <select
                                id="wj-sort-by"
                                className="input"
                                value={filters.sortBy}
                                onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}
                            >
                                <option value="hours">По часам</option>
                                <option value="fines">По штрафам</option>
                                <option value="tasks">По задачам</option>
                            </select>
                        </div>
                        <div>
                            <label className="input-label" htmlFor="wj-sort-dir">Порядок</label>
                            <select
                                id="wj-sort-dir"
                                className="input"
                                value={filters.sortDir}
                                onChange={(event) => setFilters((current) => ({ ...current, sortDir: event.target.value }))}
                            >
                                <option value="desc">По убыванию</option>
                                <option value="asc">По возрастанию</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setAppliedFilters({ ...filters })}
                        >
                            Загрузить
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : (
                    <>
                        <Insights insights={data?.insights} />
                        <div className="card">
                            <div className="reports-table-wrap">
                                <WorkJournalTable data={data} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

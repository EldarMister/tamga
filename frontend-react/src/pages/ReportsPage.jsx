import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { formatCurrency, roleLabel, statusLabel } from '@legacy/utils.js';

function isoDay(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().split('T')[0];
}

function StatusSummary({ summary }) {
    if (!summary) return null;

    return (
        <div className="card mb-4">
            <h3 className="font-bold mb-3">Заказы</h3>

            <div className="reports-kpi-grid mb-4">
                <div className="report-kpi report-kpi-orders">
                    <div className="report-kpi-value">{summary.totals.total_orders}</div>
                    <div className="report-kpi-label">Заказов</div>
                </div>
                <div className="report-kpi report-kpi-revenue">
                    <div className="report-kpi-value">{formatCurrency(summary.totals.total_revenue)}</div>
                    <div className="report-kpi-label">Выручка</div>
                </div>
                <div className="report-kpi report-kpi-profit">
                    <div className="report-kpi-value">{formatCurrency(summary.profit)}</div>
                    <div className="report-kpi-label">Прибыль</div>
                </div>
            </div>

            <div className="space-y-1">
                {(summary.by_status || []).map((item) => (
                    <div className="report-status-row" key={item.status}>
                        <span className="text-gray-600">{statusLabel(item.status)}</span>
                        <span><span className="font-medium">{item.count}</span> • {formatCurrency(item.revenue)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MaterialUsage({ materials }) {
    if (!materials.length) return null;

    const maxUsed = Math.max(...materials.map((item) => Number(item.used || 0)), 1);

    return (
        <div className="card mb-4">
            <h3 className="font-bold mb-3">Расход материалов</h3>
            <div className="space-y-3">
                {materials.map((item) => (
                    <div key={`${item.name_ru}-${item.unit}`}>
                        <div className="flex justify-between text-sm mb-1 gap-2">
                            <span className="truncate">{item.name_ru}</span>
                            <span className="font-bold">{Number(item.used || 0).toFixed(1)} {item.unit}</span>
                        </div>
                        <div className="stock-bar">
                            <div
                                className="stock-bar-fill"
                                style={{
                                    width: `${((Number(item.used || 0) / maxUsed) * 100).toFixed(0)}%`,
                                    background: 'var(--accent)',
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EmployeeStats({ employees }) {
    if (!employees.length) return null;

    return (
        <div className="card mb-4">
            <h3 className="font-bold mb-3">Сотрудники</h3>

            <div className="reports-table-wrap reports-desktop-table">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b text-left">
                            <th className="py-2">Имя</th>
                            <th className="py-2 text-center">Дней</th>
                            <th className="py-2 text-center">Задач</th>
                            <th className="py-2 text-center">Инцид.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((item) => (
                            <tr className="border-b" key={item.id}>
                                <td className="py-2">
                                    <div className="font-medium">{item.full_name}</div>
                                    <div className="text-xs text-gray-400">{roleLabel(item.role)}</div>
                                </td>
                                <td className="py-2 text-center font-bold">{item.days_worked}</td>
                                <td className="py-2 text-center font-bold">{item.tasks_done}</td>
                                <td className={`py-2 text-center font-bold ${item.incidents > 0 ? 'text-red-600' : ''}`}>{item.incidents}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="reports-mobile-list">
                {employees.map((item) => (
                    <div className="report-emp-card" key={`mobile-${item.id}`}>
                        <div>
                            <div className="font-medium">{item.full_name}</div>
                            <div className="text-xs text-gray-400">{roleLabel(item.role)}</div>
                        </div>
                        <div className="report-emp-stats">
                            <span>Дней: <b>{item.days_worked}</b></span>
                            <span>Задач: <b>{item.tasks_done}</b></span>
                            <span>Инцид.: <b className={item.incidents > 0 ? 'text-red-600' : ''}>{item.incidents}</b></span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ReportsPage({ refreshToken = 0 }) {
    const initialRange = { from: isoDay(-30), to: isoDay(0) };
    const [draftRange, setDraftRange] = useState(initialRange);
    const [appliedRange, setAppliedRange] = useState(initialRange);
    const [summary, setSummary] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/reports');

        async function loadReport() {
            setIsLoading(true);
            setError('');

            try {
                const [nextSummary, nextMaterials, nextEmployees] = await Promise.all([
                    api.get(`/api/reports/orders-summary?date_from=${appliedRange.from}&date_to=${appliedRange.to}`),
                    api.get(`/api/reports/material-usage?date_from=${appliedRange.from}&date_to=${appliedRange.to}`),
                    api.get(`/api/reports/employee-stats?date_from=${appliedRange.from}&date_to=${appliedRange.to}`).catch(() => []),
                ]);

                if (!alive) return;

                setSummary(nextSummary);
                setMaterials(nextMaterials || []);
                setEmployees(nextEmployees || []);
            } catch {
                if (!alive) return;
                setError('Ошибка загрузки отчётов');
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadReport();
        return () => {
            alive = false;
        };
    }, [appliedRange.from, appliedRange.to, refreshToken]);

    const hasData = Boolean(summary) || materials.length > 0 || employees.length > 0;

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Отчёты</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="reports-filter-grid mb-4">
                        <div>
                            <label className="input-label" htmlFor="report-date-from">С</label>
                            <input
                                id="report-date-from"
                                type="date"
                                className="input"
                                value={draftRange.from}
                                onChange={(event) => setDraftRange((current) => ({ ...current, from: event.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="input-label" htmlFor="report-date-to">По</label>
                            <input
                                id="report-date-to"
                                type="date"
                                className="input"
                                value={draftRange.to}
                                onChange={(event) => setDraftRange((current) => ({ ...current, to: event.target.value }))}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setAppliedRange({ ...draftRange })}
                        >
                            Загрузить
                        </button>
                    </div>
                </div>

                <div>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><div className="spinner" /></div>
                    ) : error ? (
                        <div className="text-center text-red-500 py-8">{error}</div>
                    ) : hasData ? (
                        <>
                            <StatusSummary summary={summary} />
                            <MaterialUsage materials={materials} />
                            <EmployeeStats employees={employees} />
                        </>
                    ) : (
                        <div className="text-center text-gray-400 py-8">Нет данных за период</div>
                    )}
                </div>
            </div>
        </>
    );
}

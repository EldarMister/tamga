import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { formatCurrency, formatDateTime, roleLabel } from '@legacy/utils.js';

function isoDay(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().split('T')[0];
}

export default function FinesPage({ refreshToken = 0 }) {
    const initialFilters = { from: isoDay(-30), to: isoDay(0), userId: '0' };
    const [users, setUsers] = useState([]);
    const [filters, setFilters] = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);
    const [fines, setFines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/api/users')
            .then((rows) => setUsers((rows || []).filter((user) => user.role !== 'director')))
            .catch(() => setUsers([]));
    }, []);

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/hr');

        async function load() {
            setIsLoading(true);
            setError('');
            try {
                const query = new URLSearchParams({
                    penalties_only: '1',
                    date_from: appliedFilters.from,
                    date_to: appliedFilters.to,
                });
                if (Number(appliedFilters.userId) > 0) {
                    query.set('user_id', String(appliedFilters.userId));
                }
                const rows = await api.get(`/api/hr/incidents?${query.toString()}`);
                if (!alive) return;
                setFines(rows || []);
            } catch {
                if (alive) setError('Ошибка загрузки журнала штрафов');
            } finally {
                if (alive) setIsLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [appliedFilters.from, appliedFilters.to, appliedFilters.userId, refreshToken]);

    const total = fines.reduce((sum, fine) => sum + (Number(fine.deduction_amount) || 0), 0);

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Журнал штрафов</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="reports-filter-grid mb-4">
                        <div>
                            <label className="input-label" htmlFor="fine-date-from">С</label>
                            <input id="fine-date-from" type="date" className="input" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
                        </div>
                        <div>
                            <label className="input-label" htmlFor="fine-date-to">По</label>
                            <input id="fine-date-to" type="date" className="input" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
                        </div>
                        <div>
                            <label className="input-label" htmlFor="fine-user">Сотрудник</label>
                            <select id="fine-user" className="input" value={filters.userId} onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}>
                                <option value="0">Все сотрудники</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>{user.full_name} ({roleLabel(user.role)})</option>
                                ))}
                            </select>
                        </div>
                        <button type="button" className="btn btn-primary" onClick={() => setAppliedFilters({ ...filters })}>Показать</button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : fines.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">Штрафов за выбранный период нет</div>
                ) : (
                    <>
                        <div className="card mb-4">
                            <div className="reports-kpi-grid">
                                <div className="report-kpi report-kpi-orders">
                                    <div className="report-kpi-value">{fines.length}</div>
                                    <div className="report-kpi-label">Штрафов</div>
                                </div>
                                <div className="report-kpi report-kpi-profit">
                                    <div className="report-kpi-value">{formatCurrency(total)}</div>
                                    <div className="report-kpi-label">Сумма удержаний</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {fines.map((fine) => (
                                <div className="card" key={fine.id}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-bold">{fine.employee_name}</div>
                                            <div className="text-xs text-gray-400">{formatDateTime(fine.created_at)} • {fine.created_by_name}</div>
                                        </div>
                                        <div className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 700 }}>
                                            {formatCurrency(fine.deduction_amount || 0)}
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-2">{fine.description}</div>
                                    <div className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Тип: {fine.type}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

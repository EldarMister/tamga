import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatDate, formatDateTime, roleLabel } from '@legacy/utils.js';

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
    if (status === 'approved') return <span className="badge bg-green-100 text-green-700">Одобрено</span>;
    if (status === 'rejected') return <span className="badge bg-red-50 text-red-700">Отклонено</span>;
    return <span className="badge bg-yellow-100 text-yellow-700">Ожидает</span>;
}

export default function LeaveRequestsPage({ refreshToken = 0 }) {
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [type, setType] = useState('sick');
    const [reason, setReason] = useState('');
    const [dateMode, setDateMode] = useState('range');
    const [dateStart, setDateStart] = useState(todayIso());
    const [dateEnd, setDateEnd] = useState(todayIso());
    const [daysCount, setDaysCount] = useState('1');
    const [selectedUser, setSelectedUser] = useState(String(state.user.id));
    const [statusFilter, setStatusFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');

    async function loadUsers() {
        if (!canManage()) return;
        try {
            const rows = await api.get('/api/users');
            setUsers((rows || []).filter((user) => user.is_active));
        } catch {
            setUsers([]);
        }
    }

    async function loadLeaveList() {
        setIsLoading(true);
        setError('');
        try {
            const query = new URLSearchParams({ limit: '100', offset: '0' });
            if (statusFilter) query.set('status', statusFilter);
            if (canManage() && userFilter) query.set('user_id', userFilter);

            const data = await api.get(`/api/leave-requests?${query.toString()}`);
            setItems(Array.isArray(data) ? data : (data?.items || []));
        } catch {
            setError('Ошибка загрузки заявок');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        loadLeaveList();
    }, [statusFilter, userFilter, refreshToken]);

    async function submitLeaveRequest() {
        if (!reason.trim()) {
            showToast('Укажите причину', 'warning');
            return;
        }

        const payload = {
            type,
            reason: reason.trim(),
            date_start: dateStart,
        };

        if (canManage() && selectedUser) {
            payload.user_id = parseInt(selectedUser, 10);
        }

        if (dateMode === 'days') {
            const days = parseInt(daysCount, 10) || 0;
            if (days < 1) {
                showToast('Количество дней должно быть больше 0', 'warning');
                return;
            }
            payload.days_count = days;
        } else {
            payload.date_end = dateEnd;
        }

        try {
            await api.post('/api/leave-requests', payload);
            showToast('Заявка отправлена', 'success');
            setReason('');
            loadLeaveList();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function reviewLeaveRequest(id, status) {
        try {
            await api.patch(`/api/leave-requests/${id}/status`, { status });
            showToast(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', 'success');
            loadLeaveList();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Отпуск / Больничный</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <h3 className="font-bold mb-3">Новая заявка</h3>
                    <div className="space-y-3">
                        {canManage() ? (
                            <div>
                                <label className="input-label" htmlFor="leave-user">Сотрудник</label>
                                <select id="leave-user" className="input" value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>{user.full_name} ({roleLabel(user.role)})</option>
                                    ))}
                                </select>
                            </div>
                        ) : null}

                        <div>
                            <label className="input-label" htmlFor="leave-type">Тип</label>
                            <select id="leave-type" className="input" value={type} onChange={(event) => setType(event.target.value)}>
                                <option value="sick">Больничный</option>
                                <option value="rest">Отдых</option>
                            </select>
                        </div>

                        <div>
                            <label className="input-label" htmlFor="leave-reason">Причина</label>
                            <textarea id="leave-reason" className="input" rows="3" placeholder="Опишите причину..." value={reason} onChange={(event) => setReason(event.target.value)} />
                        </div>

                        <div>
                            <label className="input-label" htmlFor="leave-date-mode">Режим дат</label>
                            <select id="leave-date-mode" className="input" value={dateMode} onChange={(event) => setDateMode(event.target.value)}>
                                <option value="range">Начало + конец</option>
                                <option value="days">Начало + количество дней</option>
                            </select>
                        </div>

                        <div className="reports-filter-grid">
                            <div>
                                <label className="input-label" htmlFor="leave-date-start">Дата начала</label>
                                <input id="leave-date-start" type="date" className="input" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
                            </div>

                            {dateMode === 'days' ? (
                                <div>
                                    <label className="input-label" htmlFor="leave-days-count">Дней</label>
                                    <input id="leave-days-count" type="number" className="input" min="1" value={daysCount} onChange={(event) => setDaysCount(event.target.value)} />
                                </div>
                            ) : (
                                <div>
                                    <label className="input-label" htmlFor="leave-date-end">Дата конца</label>
                                    <input id="leave-date-end" type="date" className="input" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
                                </div>
                            )}

                            <button type="button" className="btn btn-primary" onClick={submitLeaveRequest}>Отправить</button>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="reports-filter-grid mb-3">
                        <div>
                            <label className="input-label" htmlFor="leave-status-filter">Статус</label>
                            <select id="leave-status-filter" className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                <option value="">Все</option>
                                <option value="pending">Ожидает</option>
                                <option value="approved">Одобрено</option>
                                <option value="rejected">Отклонено</option>
                            </select>
                        </div>

                        {canManage() ? (
                            <div>
                                <label className="input-label" htmlFor="leave-user-filter">Сотрудник</label>
                                <select id="leave-user-filter" className="input" value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
                                    <option value="">Все</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>{user.full_name} ({roleLabel(user.role)})</option>
                                    ))}
                                </select>
                            </div>
                        ) : null}

                        <button type="button" className="btn btn-secondary" onClick={loadLeaveList}>Обновить</button>
                    </div>

                    <div>
                        {isLoading ? (
                            <div className="flex justify-center py-8"><div className="spinner" /></div>
                        ) : error ? (
                            <div className="text-center text-red-500 py-8">{error}</div>
                        ) : items.length === 0 ? (
                            <div className="text-center text-gray-400 py-8">Заявок нет</div>
                        ) : (
                            items.map((item) => {
                                const allowReview = canManage() && item.status === 'pending' && item.user_id !== state.user.id;
                                return (
                                    <div className="py-3 border-b last:border-0" key={item.id}>
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <div>
                                                <div className="font-medium">{item.user_name} <span className="text-gray-400">#{item.user_id}</span></div>
                                                <div className="text-xs text-gray-400">
                                                    {typeLabel(item.type)} • {formatDate(item.date_start)} — {formatDate(item.date_end)} ({item.days_count} дн.)
                                                </div>
                                            </div>
                                            {statusBadge(item.status)}
                                        </div>

                                        <div className="text-sm text-gray-600 mb-2">{item.reason}</div>
                                        <div className="text-xs text-gray-400">
                                            Создано: {item.created_by_name || '—'} • {formatDateTime(item.created_at)}
                                            {item.reviewed_by_name ? (
                                                <>
                                                    <br />
                                                    Рассмотрел: {item.reviewed_by_name}{item.reviewed_at ? ` • ${formatDateTime(item.reviewed_at)}` : ''}
                                                </>
                                            ) : null}
                                        </div>

                                        {allowReview ? (
                                            <div className="flex gap-2 mt-2">
                                                <button type="button" className="btn btn-success btn-sm" onClick={() => reviewLeaveRequest(item.id, 'approved')}>Одобрить</button>
                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => reviewLeaveRequest(item.id, 'rejected')}>Отклонить</button>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

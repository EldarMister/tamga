import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatDateTime, formatTime, roleLabel } from '@legacy/utils.js';

function ShiftChecklist({ tasks, onToggle, isLoading, error }) {
    if (isLoading) {
        return <div className="flex justify-center py-4"><div className="spinner" /></div>;
    }

    if (error) {
        return <div className="text-red-500 text-sm">{error}</div>;
    }

    if (!tasks.length) {
        return <p className="text-gray-400 text-sm">Нет задач для роли</p>;
    }

    return (
        <>
            {tasks.map((task) => (
                <button
                    type="button"
                    className="task-item w-full text-left"
                    key={task.id}
                    onClick={() => onToggle(task)}
                >
                    <div className={`task-checkbox ${task.completed ? 'checked' : ''}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }} className={task.completed ? 'task-done' : ''}>{task.title}</div>
                        {task.is_required ? <div className="text-xs text-gray-400">Обязательная</div> : null}
                    </div>
                </button>
            ))}
        </>
    );
}

export default function HrPage({ refreshToken = 0 }) {
    const canManage = ['director', 'manager'].includes(state.user.role);
    const [myAttendance, setMyAttendance] = useState(undefined);
    const [myShiftError, setMyShiftError] = useState('');
    const [isLoadingMyShift, setIsLoadingMyShift] = useState(true);
    const [shiftTasks, setShiftTasks] = useState([]);
    const [isLoadingShiftTasks, setIsLoadingShiftTasks] = useState(false);
    const [shiftTasksError, setShiftTasksError] = useState('');
    const [todayAttendance, setTodayAttendance] = useState([]);
    const [isLoadingToday, setIsLoadingToday] = useState(canManage);
    const [todayError, setTodayError] = useState('');
    const [incidents, setIncidents] = useState([]);
    const [isLoadingIncidents, setIsLoadingIncidents] = useState(canManage);
    const [incidentsError, setIncidentsError] = useState('');

    async function loadShiftChecklist() {
        setIsLoadingShiftTasks(true);
        setShiftTasksError('');
        try {
            const rows = await api.get('/api/hr/shift-tasks');
            setShiftTasks(rows || []);
        } catch {
            setShiftTasksError('Ошибка');
        } finally {
            setIsLoadingShiftTasks(false);
        }
    }

    async function loadMyShift() {
        setIsLoadingMyShift(true);
        setMyShiftError('');
        try {
            const attendance = await api.get('/api/hr/my-attendance');
            setMyAttendance(attendance);
            if (attendance && !attendance.check_out) {
                await loadShiftChecklist();
            } else {
                setShiftTasks([]);
                setShiftTasksError('');
            }
        } catch {
            setMyShiftError('Ошибка загрузки');
        } finally {
            setIsLoadingMyShift(false);
        }
    }

    async function loadTodayAttendance() {
        if (!canManage) return;
        setIsLoadingToday(true);
        setTodayError('');
        try {
            const rows = await api.get('/api/hr/attendance/today');
            setTodayAttendance(rows || []);
        } catch {
            setTodayError('Ошибка');
        } finally {
            setIsLoadingToday(false);
        }
    }

    async function loadIncidents() {
        if (!canManage) return;
        setIsLoadingIncidents(true);
        setIncidentsError('');
        try {
            const rows = await api.get('/api/hr/incidents?status=pending');
            setIncidents(rows || []);
        } catch {
            setIncidentsError('Ошибка');
        } finally {
            setIsLoadingIncidents(false);
        }
    }

    async function reloadPageData() {
        api.clearCache('/api/hr');
        await loadMyShift();
        if (canManage) {
            await Promise.all([loadTodayAttendance(), loadIncidents()]);
        }
    }

    useEffect(() => {
        reloadPageData();
    }, [refreshToken]);

    async function handleCheckin() {
        try {
            await api.post('/api/hr/checkin');
            showToast('Смена начата!', 'success');
            reloadPageData();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function handleCheckout() {
        try {
            const result = await api.post('/api/hr/checkout');
            const summary = result?.shift_tasks_summary;
            if (summary && summary.not_completed > 0) {
                showToast(`Смена завершена. Выполнено: ${summary.completed}/${summary.total}, не выполнено: ${summary.not_completed}`, 'warning');
            } else {
                showToast('Смена завершена!', 'success');
            }
            reloadPageData();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function handleToggleShiftTask(task) {
        try {
            await api.post(`/api/hr/shift-tasks/${task.id}/complete`, { completed: !task.completed });
            loadShiftChecklist();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function showIncidentForm() {
        let users = [];
        try {
            users = await api.get('/api/users');
        } catch {
            users = [];
        }

        const employees = (users || []).filter((user) => user.role !== 'director' && user.is_active);

        showFormModal({
            title: 'Новый инцидент',
            fields: [
                {
                    name: 'user_id',
                    label: 'Сотрудник',
                    type: 'select',
                    options: employees.map((user) => ({
                        value: user.id,
                        label: `${user.full_name} (${roleLabel(user.role)})`,
                    })),
                },
                {
                    name: 'type',
                    label: 'Тип',
                    type: 'select',
                    options: [
                        { value: 'defect', label: 'Брак' },
                        { value: 'late', label: 'Опоздание' },
                        { value: 'complaint', label: 'Жалоба' },
                        { value: 'other', label: 'Прочее' },
                    ],
                },
                { name: 'description', label: 'Описание', type: 'textarea', required: true, placeholder: 'Что произошло...' },
                { name: 'material_waste', label: 'Потеря материала (м²)', type: 'number', step: '0.1', placeholder: 'Только для брака' },
                { name: 'deduction_amount', label: 'Штраф (сумма)', type: 'number', step: '100', placeholder: '0' },
            ],
            submitText: 'Создать',
            onSubmit: async (data) => {
                try {
                    await api.post('/api/hr/incidents', {
                        user_id: parseInt(data.user_id, 10),
                        type: data.type,
                        description: data.description,
                        material_waste: data.material_waste ? parseFloat(data.material_waste) : null,
                        deduction_amount: data.deduction_amount ? parseFloat(data.deduction_amount) : null,
                    });
                    showToast('Инцидент создан', 'success');
                    loadIncidents();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    const typeLabels = {
        defect: '🔴 Брак',
        late: '🟡 Опоздание',
        complaint: '🟠 Жалоба',
        other: '⚪ Прочее',
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Кадры</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Моя смена</h3>
                    {isLoadingMyShift ? (
                        <div className="text-center py-4"><div className="spinner mx-auto" /></div>
                    ) : myShiftError ? (
                        <div className="text-red-500">{myShiftError}</div>
                    ) : !myAttendance ? (
                        <div className="text-center py-4">
                            <p className="text-gray-500 mb-4">Вы ещё не отметились</p>
                            <button
                                type="button"
                                className="btn btn-success btn-lg btn-block"
                                style={{ minHeight: '80px', fontSize: '20px' }}
                                onClick={handleCheckin}
                            >
                                ☀️ Начать смену
                            </button>
                        </div>
                    ) : !myAttendance.check_out ? (
                        <>
                            <div className="text-center py-4">
                                <div className="text-green-600 font-bold text-lg mb-1">На смене</div>
                                <div className="text-gray-500 mb-4">Приход: {formatTime(myAttendance.check_in)}</div>
                                <button
                                    type="button"
                                    className="btn btn-warning btn-lg btn-block"
                                    style={{ minHeight: '80px', fontSize: '20px' }}
                                    onClick={handleCheckout}
                                >
                                    🌙 Закончить смену
                                </button>
                            </div>

                            <div className="card mt-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Чек-лист перед уходом</h3>
                                <ShiftChecklist
                                    tasks={shiftTasks}
                                    onToggle={handleToggleShiftTask}
                                    isLoading={isLoadingShiftTasks}
                                    error={shiftTasksError}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <div className="text-gray-600 font-bold text-lg mb-1">Смена завершена</div>
                            <div className="text-gray-400">
                                Приход: {formatTime(myAttendance.check_in)} — Уход: {formatTime(myAttendance.check_out)}
                            </div>
                        </div>
                    )}
                </div>

                {canManage ? (
                    <>
                        <div className="card">
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Сегодня на работе</h3>
                            {isLoadingToday ? (
                                <div className="flex justify-center py-4"><div className="spinner" /></div>
                            ) : todayError ? (
                                <div className="text-red-500 text-sm">{todayError}</div>
                            ) : !todayAttendance.length ? (
                                <p className="text-gray-400 text-sm">Никто ещё не отметился</p>
                            ) : (
                                todayAttendance.map((item) => (
                                    <div className="flex items-center justify-between py-2 border-b last:border-0" key={item.id}>
                                        <div>
                                            <span className="font-medium">{item.full_name}</span>
                                            <span className="text-xs text-gray-400 ml-2">{roleLabel(item.role)}</span>
                                        </div>
                                        <div className="text-sm">
                                            <span className="text-green-600">{formatTime(item.check_in)}</span>
                                            {item.check_out ? (
                                                <>
                                                    <span className="text-gray-400"> — </span>
                                                    <span className="text-red-500">{formatTime(item.check_out)}</span>
                                                </>
                                            ) : (
                                                <span className="badge bg-green-100 text-green-700 ml-2">на месте</span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="card">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-400 uppercase">Инциденты</h3>
                                <button type="button" className="btn btn-danger btn-sm" onClick={showIncidentForm}>
                                    + Инцидент
                                </button>
                            </div>

                            {isLoadingIncidents ? (
                                <div className="flex justify-center py-4"><div className="spinner" /></div>
                            ) : incidentsError ? (
                                <div className="text-red-500 text-sm">{incidentsError}</div>
                            ) : !incidents.length ? (
                                <p className="text-gray-400 text-sm">Нет открытых инцидентов</p>
                            ) : (
                                incidents.map((item) => (
                                    <div className="py-3 border-b last:border-0" key={item.id}>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <span className="font-medium">{typeLabels[item.type] || item.type}</span>
                                                <span className="text-gray-500 ml-2">— {item.employee_name}</span>
                                            </div>
                                            {item.status === 'pending' ? (
                                                <span className="badge bg-yellow-100 text-yellow-700">Ожидает</span>
                                            ) : (
                                                <span className="badge bg-green-100 text-green-700">Обсуждён</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                        {item.material_waste ? <p className="text-sm text-red-500">Потеря материала: {item.material_waste} м²</p> : null}
                                        {item.deduction_amount ? <p className="text-sm text-red-600">Штраф: {item.deduction_amount}</p> : null}
                                        <div className="text-xs text-gray-400 mt-1">{formatDateTime(item.created_at)} • {item.created_by_name}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </>
    );
}

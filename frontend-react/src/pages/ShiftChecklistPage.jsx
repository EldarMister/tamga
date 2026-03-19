import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';

const ROLES = [
    { value: 'manager', label: 'Менеджер' },
    { value: 'designer', label: 'Дизайнер' },
    { value: 'master', label: 'Печатник' },
    { value: 'assistant', label: 'Помощник' },
];

function todayIso() {
    return new Date().toISOString().split('T')[0];
}

export default function ShiftChecklistPage({ refreshToken = 0 }) {
    const [role, setRole] = useState(ROLES[0].value);
    const [date, setDate] = useState(todayIso());
    const [taskDefs, setTaskDefs] = useState([]);
    const [report, setReport] = useState([]);
    const [isLoadingDefs, setIsLoadingDefs] = useState(true);
    const [isLoadingReport, setIsLoadingReport] = useState(true);
    const [defsError, setDefsError] = useState('');
    const [reportError, setReportError] = useState('');

    async function loadTaskDefs() {
        setIsLoadingDefs(true);
        setDefsError('');
        try {
            const rows = await api.get(`/api/hr/shift-tasks/catalog?role=${role}`);
            setTaskDefs(rows || []);
        } catch {
            setDefsError('Ошибка загрузки');
        } finally {
            setIsLoadingDefs(false);
        }
    }

    async function loadReport() {
        setIsLoadingReport(true);
        setReportError('');
        try {
            const data = await api.get(`/api/hr/shift-tasks/report?role=${role}&date=${date}`);
            setReport(data?.items || []);
        } catch {
            setReportError('Ошибка загрузки');
        } finally {
            setIsLoadingReport(false);
        }
    }

    useEffect(() => {
        api.clearCache('/api/hr');
        loadTaskDefs();
        loadReport();
    }, [role, date, refreshToken]);

    async function addTask() {
        const title = window.prompt('Название задачи');
        if (!title) return;
        const isRequired = window.confirm('Сделать обязательной?');
        try {
            await api.post('/api/hr/shift-tasks', { role, title, is_required: isRequired });
            showToast('Задача добавлена', 'success');
            loadTaskDefs();
            loadReport();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function editTask(taskId) {
        const title = window.prompt('Новое название');
        if (title === null) return;
        const isRequired = window.confirm('Сделать обязательной?');
        try {
            await api.patch(`/api/hr/shift-tasks/${taskId}`, { title, is_required: isRequired });
            showToast('Задача обновлена', 'success');
            loadTaskDefs();
            loadReport();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function deleteTask(taskId) {
        if (!window.confirm('Удалить задачу?')) return;
        try {
            await api.delete(`/api/hr/shift-tasks/${taskId}`);
            showToast('Задача удалена', 'success');
            loadTaskDefs();
            loadReport();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Чек-лист смены</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="reports-filter-grid mb-3">
                        <div>
                            <label className="input-label" htmlFor="shift-role">Роль</label>
                            <select id="shift-role" className="input" value={role} onChange={(event) => setRole(event.target.value)}>
                                {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="input-label" htmlFor="shift-date">Дата</label>
                            <input id="shift-date" type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
                        </div>
                        <button type="button" className="btn btn-primary" onClick={() => { loadTaskDefs(); loadReport(); }}>Показать</button>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-700">Настройка чек-листа</h3>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addTask}>+ Задача</button>
                    </div>

                    {isLoadingDefs ? (
                        <div className="flex justify-center py-4"><div className="spinner" /></div>
                    ) : defsError ? (
                        <div className="text-red-500 text-sm">{defsError}</div>
                    ) : !taskDefs.length ? (
                        <div className="text-gray-400 text-sm">Нет задач для роли</div>
                    ) : (
                        taskDefs.map((task) => (
                            <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0" key={task.id}>
                                <div>
                                    <div className="font-medium">{task.title}</div>
                                    <div className="text-xs text-gray-400">{task.is_required ? 'Обязательная' : 'Необязательная'}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => editTask(task.id)}>Редактировать</button>
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteTask(task.id)}>Удалить</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="card">
                    <h3 className="font-bold text-gray-700 mb-3">Выполнение за дату</h3>
                    {isLoadingReport ? (
                        <div className="flex justify-center py-4"><div className="spinner" /></div>
                    ) : reportError ? (
                        <div className="text-red-500 text-sm">{reportError}</div>
                    ) : !report.length ? (
                        <div className="text-gray-400 text-sm">Нет сотрудников</div>
                    ) : (
                        report.map((row) => (
                            <div className="card mb-3" key={row.user_id}>
                                <div className="font-bold mb-2">{row.full_name}</div>
                                <div className="text-xs text-gray-400 mb-2">Выполнено: {row.tasks.filter((task) => task.completed).length}/{row.tasks.length}</div>
                                <div className="space-y-2">
                                    {row.tasks.map((task) => (
                                        <div className="flex items-center justify-between text-sm" key={task.id}>
                                            <span>{task.title}</span>
                                            <span className={task.completed ? 'text-green-600' : 'text-red-500'}>{task.completed ? 'Выполнено' : 'Не выполнено'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}

import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal, showModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatDate, roleLabel } from '@legacy/utils.js';

export default function TasksPage({ refreshToken = 0 }) {
    const canCreate = ['director', 'manager'].includes(state.user.role);
    const canManage = canCreate;
    const [filterType, setFilterType] = useState('');
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    async function loadTasks() {
        setIsLoading(true);
        setError('');
        try {
            const data = await api.get(`/api/tasks?type=${filterType}`);
            setTasks(data || []);
        } catch {
            setError('Ошибка');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadTasks();
    }, [filterType, refreshToken]);

    async function handleToggle(taskId) {
        try {
            await api.patch(`/api/tasks/${taskId}/done`);
            loadTasks();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function handleCreateTask() {
        let users = [];
        try {
            users = await api.get('/api/users');
        } catch {
            users = [];
        }
        const employees = (users || []).filter((user) => user.is_active);

        showFormModal({
            title: 'Новая задача',
            fields: [
                { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Что нужно сделать?' },
                { name: 'description', label: 'Описание', type: 'textarea', placeholder: 'Подробности...' },
                {
                    name: 'type',
                    label: 'Тип',
                    type: 'select',
                    options: [
                        { value: 'daily', label: 'Дневная задача' },
                        { value: 'weekly', label: 'Недельная задача' },
                    ],
                },
                {
                    name: 'assigned_to',
                    label: 'Кому',
                    type: 'select',
                    options: employees.map((user) => ({
                        value: user.id,
                        label: `${user.full_name} (${roleLabel(user.role)})`,
                    })),
                },
                { name: 'due_date', label: 'Срок', type: 'date' },
            ],
            submitText: 'Создать',
            onSubmit: async (data) => {
                try {
                    await api.post('/api/tasks', {
                        ...data,
                        assigned_to: parseInt(data.assigned_to, 10),
                    });
                    showToast('Задача создана', 'success');
                    loadTasks();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    function handleDeleteTask(taskId) {
        showModal({
            title: 'Удалить задачу?',
            body: 'Задача будет удалена',
            danger: true,
            confirmText: 'Удалить',
            onConfirm: async () => {
                try {
                    await api.delete(`/api/tasks/${taskId}`);
                    showToast('Задача удалена', 'success');
                    loadTasks();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Задачи</h1>
                {canCreate ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateTask}>
                        + Задача
                    </button>
                ) : null}
            </div>

            <div className="px-4 space-y-4 pb-8 slide-up">
                <div className="period-selector">
                    <button type="button" className={`period-btn ${filterType === '' ? 'active' : ''}`} onClick={() => setFilterType('')}>Все</button>
                    <button type="button" className={`period-btn ${filterType === 'daily' ? 'active' : ''}`} onClick={() => setFilterType('daily')}>Дневные</button>
                    <button type="button" className={`period-btn ${filterType === 'weekly' ? 'active' : ''}`} onClick={() => setFilterType('weekly')}>Недельные</button>
                </div>

                <div>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><div className="spinner" /></div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', color: 'var(--danger)', padding: '32px' }}>{error}</div>
                    ) : tasks.length === 0 ? (
                        <div className="empty-state">
                            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                            <p style={{ fontWeight: 600 }}>Нет задач</p>
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <div className="task-item" key={task.id}>
                                <button
                                    type="button"
                                    className={`task-checkbox ${task.is_done ? 'checked' : ''}`}
                                    onClick={() => handleToggle(task.id)}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={task.is_done
                                            ? { fontWeight: 600, textDecoration: 'line-through', color: 'var(--text-tertiary)' }
                                            : { fontWeight: 600, color: 'var(--text-primary)' }}
                                    >
                                        {task.title}
                                    </div>
                                    {task.description ? (
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                            {task.description}
                                        </div>
                                    ) : null}
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                        <span
                                            className="badge"
                                            style={{
                                                background: task.type === 'daily' ? 'var(--accent-light)' : 'var(--purple-light)',
                                                color: task.type === 'daily' ? 'var(--accent)' : 'var(--purple)',
                                            }}
                                        >
                                            {task.type === 'daily' ? 'Дневная' : 'Недельная'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>→ {task.assigned_name}</span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Поставил: {task.assigned_by_name || '—'}</span>
                                        {task.due_date ? (
                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>до {formatDate(task.due_date)}</span>
                                        ) : null}
                                    </div>
                                </div>
                                {canManage ? (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm delete-task"
                                        style={{ color: 'var(--danger)' }}
                                        onClick={() => handleDeleteTask(task.id)}
                                    >
                                        ✕
                                    </button>
                                ) : null}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}

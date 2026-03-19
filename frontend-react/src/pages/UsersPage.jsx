import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal, showModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { roleLabel } from '@legacy/utils.js';

export default function UsersPage({ refreshToken = 0 }) {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    async function loadUsers() {
        setIsLoading(true);
        setError('');
        try {
            const rows = await api.get('/api/users');
            setUsers(rows || []);
        } catch {
            setError('Ошибка');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, [refreshToken]);

    function showAddUserForm() {
        showFormModal({
            title: 'Новый сотрудник',
            fields: [
                { name: 'full_name', label: 'ФИО', type: 'text', required: true },
                { name: 'username', label: 'Логин', type: 'text', required: true },
                { name: 'password', label: 'Пароль', type: 'text', required: true, value: '12345' },
                {
                    name: 'role',
                    label: 'Роль',
                    type: 'select',
                    options: [
                        { value: 'manager', label: 'Менеджер' },
                        { value: 'designer', label: 'Дизайнер' },
                        { value: 'master', label: 'Мастер' },
                        { value: 'assistant', label: 'Помощник' },
                    ],
                },
                { name: 'phone', label: 'Телефон', type: 'tel', placeholder: '+996...' },
            ],
            submitText: 'Создать',
            onSubmit: async (data) => {
                try {
                    await api.post('/api/users', data);
                    showToast('Сотрудник создан', 'success');
                    loadUsers();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    function showAssignTaskForm(user) {
        showFormModal({
            title: `Задача: ${user.full_name}`,
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
                { name: 'due_date', label: 'Срок', type: 'date' },
            ],
            submitText: 'Назначить',
            onSubmit: async (data) => {
                try {
                    await api.post('/api/tasks', {
                        title: data.title,
                        description: data.description || '',
                        type: data.type || 'daily',
                        assigned_to: user.id,
                        due_date: data.due_date || null,
                    });
                    showToast('Задача назначена', 'success');
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    function showFineForm(user) {
        showFormModal({
            title: `Штраф: ${user.full_name}`,
            fields: [
                {
                    name: 'type',
                    label: 'Причина',
                    type: 'select',
                    options: [
                        { value: 'late', label: 'Опоздание' },
                        { value: 'defect', label: 'Брак' },
                        { value: 'complaint', label: 'Жалоба' },
                        { value: 'other', label: 'Прочее' },
                    ],
                },
                { name: 'description', label: 'Комментарий', type: 'textarea', required: true, placeholder: 'За что назначен штраф...' },
                { name: 'deduction_amount', label: 'Сумма штрафа', type: 'number', required: true, step: '100', placeholder: '0' },
            ],
            submitText: 'Штрафовать',
            onSubmit: async (data) => {
                const amount = parseFloat(data.deduction_amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                    showToast('Введите корректную сумму штрафа', 'warning');
                    return;
                }

                try {
                    await api.post('/api/hr/incidents', {
                        user_id: user.id,
                        type: data.type || 'other',
                        description: data.description,
                        deduction_amount: amount,
                    });
                    showToast('Штраф сохранён', 'success');
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Сотрудники</h1>
                <button type="button" className="btn btn-primary btn-sm" onClick={showAddUserForm}>+ Добавить</button>
            </div>

            <div className="px-4 space-y-3 pb-8">
                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : users.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">Нет сотрудников</div>
                ) : (
                    users.map((user) => {
                        const canManageTasksAndFines = user.role !== 'director' && user.is_active;
                        return (
                            <div className="card" key={user.id}>
                                <div className="employee-row">
                                    <div>
                                        <div className={`font-bold ${!user.is_active ? 'text-gray-400 line-through' : ''}`}>{user.full_name}</div>
                                        <div className="text-sm text-gray-500">{roleLabel(user.role)} • @{user.username}</div>
                                        {user.phone ? <div className="text-sm text-gray-400">{user.phone}</div> : null}
                                    </div>
                                    <div className="employee-actions">
                                        {canManageTasksAndFines ? <button type="button" className="btn btn-sm btn-secondary" title="Назначить задачу" onClick={() => showAssignTaskForm(user)}>📅</button> : null}
                                        {canManageTasksAndFines ? <button type="button" className="btn btn-sm btn-warning" title="Выписать штраф" onClick={() => showFineForm(user)}>💸</button> : null}
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => {
                                                showModal({
                                                    title: user.is_active ? 'Деактивировать?' : 'Активировать?',
                                                    body: user.is_active ? 'Сотрудник не сможет войти в систему' : 'Восстановить доступ?',
                                                    danger: user.is_active,
                                                    onConfirm: async () => {
                                                        try {
                                                            await api.patch(`/api/users/${user.id}/active`);
                                                            showToast('Статус обновлён', 'success');
                                                            loadUsers();
                                                        } catch {
                                                            // api.js already handles user-facing errors.
                                                        }
                                                    },
                                                });
                                            }}
                                        >
                                            {user.is_active ? '🔴' : '🟢'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => {
                                                showModal({
                                                    title: 'Сброс пароля',
                                                    body: 'Пароль будет сброшен на "12345"',
                                                    confirmText: 'Сбросить',
                                                    onConfirm: async () => {
                                                        try {
                                                            await api.post(`/api/users/${user.id}/reset-password`);
                                                            showToast('Пароль сброшен на 12345', 'success');
                                                        } catch {
                                                            // api.js already handles user-facing errors.
                                                        }
                                                    },
                                                });
                                            }}
                                        >
                                            🔑
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}

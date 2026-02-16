import { api } from '../api.js';
import { roleLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showFormModal, showModal } from '../components/modal.js';

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Сотрудники</h1>
            <button class="btn btn-primary btn-sm" id="add-user-btn">+ Добавить</button>
        </div>
        <div class="px-4 space-y-3 pb-8" id="users-list">
            <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
    `;

    document.getElementById('add-user-btn').onclick = showAddUserForm;
    loadUsers();
}

async function loadUsers() {
    const container = document.getElementById('users-list');
    try {
        const users = await api.get('/api/users');
        if (!users || users.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">Нет сотрудников</div>';
            return;
        }

        container.innerHTML = users.map(u => {
            const canManageTasksAndFines = u.role !== 'director' && u.is_active;
            return `
                <div class="card">
                    <div class="employee-row">
                        <div>
                            <div class="font-bold ${!u.is_active ? 'text-gray-400 line-through' : ''}">${u.full_name}</div>
                            <div class="text-sm text-gray-500">${roleLabel(u.role)} • @${u.username}</div>
                            ${u.phone ? `<div class="text-sm text-gray-400">${u.phone}</div>` : ''}
                        </div>
                        <div class="employee-actions">
                            ${canManageTasksAndFines ? `<button class="btn btn-sm btn-secondary assign-task-btn" data-id="${u.id}" data-name="${u.full_name}" title="Назначить задачу">📅</button>` : ''}
                            ${canManageTasksAndFines ? `<button class="btn btn-sm btn-warning fine-btn" data-id="${u.id}" data-name="${u.full_name}" title="Выписать штраф">💸</button>` : ''}
                            <button class="btn btn-sm btn-secondary toggle-btn" data-id="${u.id}" data-active="${u.is_active}">
                                ${u.is_active ? '🔴' : '🟢'}
                            </button>
                            <button class="btn btn-sm btn-secondary reset-btn" data-id="${u.id}">🔑</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.assign-task-btn').forEach(btn => {
            btn.onclick = () => showAssignTaskForm({ id: Number(btn.dataset.id), full_name: btn.dataset.name });
        });

        container.querySelectorAll('.fine-btn').forEach(btn => {
            btn.onclick = () => showFineForm({ id: Number(btn.dataset.id), full_name: btn.dataset.name });
        });

        container.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.onclick = async () => {
                const active = btn.dataset.active === '1';
                showModal({
                    title: active ? 'Деактивировать?' : 'Активировать?',
                    body: active ? 'Сотрудник не сможет войти в систему' : 'Восстановить доступ?',
                    danger: active,
                    onConfirm: async () => {
                        try {
                            await api.patch(`/api/users/${btn.dataset.id}/active`);
                            showToast('Статус обновлён', 'success');
                            loadUsers();
                        } catch { /* handled */ }
                    },
                });
            };
        });

        container.querySelectorAll('.reset-btn').forEach(btn => {
            btn.onclick = () => {
                showModal({
                    title: 'Сброс пароля',
                    body: 'Пароль будет сброшен на "12345"',
                    confirmText: 'Сбросить',
                    onConfirm: async () => {
                        try {
                            await api.post(`/api/users/${btn.dataset.id}/reset-password`);
                            showToast('Пароль сброшен на 12345', 'success');
                        } catch { /* handled */ }
                    },
                });
            };
        });

    } catch {
        container.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка</div>';
    }
}

function showAddUserForm() {
    showFormModal({
        title: 'Новый сотрудник',
        fields: [
            { name: 'full_name', label: 'ФИО', type: 'text', required: true },
            { name: 'username', label: 'Логин', type: 'text', required: true },
            { name: 'password', label: 'Пароль', type: 'text', required: true, value: '12345' },
            {
                name: 'role', label: 'Роль', type: 'select',
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
            } catch { /* handled */ }
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
                name: 'type', label: 'Тип', type: 'select',
                options: [
                    { value: 'daily', label: '📅 Дневная задача' },
                    { value: 'weekly', label: '📆 Недельная задача' },
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
            } catch { /* handled */ }
        },
    });
}

function showFineForm(user) {
    showFormModal({
        title: `Штраф: ${user.full_name}`,
        fields: [
            {
                name: 'type', label: 'Причина', type: 'select',
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
            } catch { /* handled */ }
        },
    });
}

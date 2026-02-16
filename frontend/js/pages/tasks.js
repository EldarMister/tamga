import { api } from '../api.js';
import { state } from '../state.js';
import { formatDate, roleLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showFormModal, showModal } from '../components/modal.js';

let filterType = '';

export async function render(container) {
    const canCreate = ['director', 'manager'].includes(state.user.role);

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Задачи</h1>
            ${canCreate ? '<button class="btn btn-primary btn-sm" id="add-task-btn">+ Задача</button>' : ''}
        </div>
        <div class="px-4 space-y-4 pb-8 slide-up">
            <div class="period-selector">
                <button class="period-btn ${filterType === '' ? 'active' : ''}" data-type="">Все</button>
                <button class="period-btn ${filterType === 'daily' ? 'active' : ''}" data-type="daily">Дневные</button>
                <button class="period-btn ${filterType === 'weekly' ? 'active' : ''}" data-type="weekly">Недельные</button>
            </div>
            <div id="tasks-list">
                <div class="flex justify-center py-8"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    container.querySelectorAll('.period-btn').forEach(btn => {
        btn.onclick = () => { filterType = btn.dataset.type; render(container); };
    });

    if (canCreate) {
        document.getElementById('add-task-btn').onclick = () => showCreateTask(container);
    }

    loadTasks();
}

async function loadTasks() {
    const list = document.getElementById('tasks-list');
    const canManage = ['director', 'manager'].includes(state.user.role);

    try {
        const tasks = await api.get(`/api/tasks?type=${filterType}`);
        if (!tasks || tasks.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
                    <p style="font-weight: 600;">Нет задач</p>
                </div>
            `;
            return;
        }

        list.innerHTML = tasks.map(t => `
            <div class="task-item" data-id="${t.id}">
                <div class="task-checkbox ${t.is_done ? 'checked' : ''}" data-id="${t.id}"></div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; ${t.is_done ? 'text-decoration: line-through; color: var(--text-tertiary);' : 'color: var(--text-primary);'}">${t.title}</div>
                    ${t.description ? `<div style="font-size: 13px; color: var(--text-tertiary); margin-top: 2px;">${t.description}</div>` : ''}
                    <div style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
                        <span class="badge" style="background: ${t.type === 'daily' ? 'var(--accent-light)' : 'var(--purple-light)'}; color: ${t.type === 'daily' ? 'var(--accent)' : 'var(--purple)'};">
                            ${t.type === 'daily' ? '📅 Дневная' : '📆 Недельная'}
                        </span>
                        <span style="font-size: 12px; color: var(--text-tertiary);">→ ${t.assigned_name}</span>
                        ${t.due_date ? `<span style="font-size: 12px; color: var(--text-tertiary);">до ${formatDate(t.due_date)}</span>` : ''}
                    </div>
                </div>
                ${canManage ? `<button class="btn btn-ghost btn-sm delete-task" data-id="${t.id}" style="color: var(--danger);">✕</button>` : ''}
            </div>
        `).join('');

        // Checkboxes
        list.querySelectorAll('.task-checkbox').forEach(cb => {
            cb.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await api.patch(`/api/tasks/${cb.dataset.id}/done`);
                    loadTasks();
                } catch { /* handled */ }
            };
        });

        // Delete
        list.querySelectorAll('.delete-task').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                showModal({
                    title: 'Удалить задачу?',
                    body: 'Задача будет удалена',
                    danger: true,
                    confirmText: 'Удалить',
                    onConfirm: async () => {
                        try {
                            await api.delete(`/api/tasks/${btn.dataset.id}`);
                            showToast('Задача удалена', 'success');
                            loadTasks();
                        } catch { /* handled */ }
                    },
                });
            };
        });

    } catch {
        list.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 32px;">Ошибка</div>';
    }
}

async function showCreateTask(container) {
    let users = [];
    try { users = await api.get('/api/users'); } catch { /* ignore */ }
    const employees = (users || []).filter(u => u.is_active);

    showFormModal({
        title: 'Новая задача',
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
            {
                name: 'assigned_to', label: 'Кому', type: 'select',
                options: employees.map(u => ({ value: u.id, label: `${u.full_name} (${roleLabel(u.role)})` })),
            },
            { name: 'due_date', label: 'Срок', type: 'date' },
        ],
        submitText: 'Создать',
        onSubmit: async (data) => {
            try {
                await api.post('/api/tasks', {
                    ...data,
                    assigned_to: parseInt(data.assigned_to),
                });
                showToast('Задача создана', 'success');
                loadTasks();
            } catch { /* handled */ }
        },
    });
}

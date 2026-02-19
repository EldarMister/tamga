import { api } from '../api.js';
import { showToast } from '../components/toast.js';

// Director checklist admin page
const ROLES = [
    { value: 'manager', label: 'Менеджер' },
    { value: 'designer', label: 'Дизайнер' },
    { value: 'master', label: 'Печатник' },
    { value: 'assistant', label: 'Помощник' },
];

export async function render(container) {
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Чек-лист смены</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <div class="reports-filter-grid mb-3">
                    <div>
                        <label class="input-label">Роль</label>
                        <select class="input" id="shift-role">
                            ${ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Дата</label>
                        <input type="date" class="input" id="shift-date" value="${today}">
                    </div>
                    <button class="btn btn-primary" id="shift-load-btn">Показать</button>
                </div>
            </div>

            <div class="card">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold text-gray-700">Настройка чек-листа</h3>
                    <button class="btn btn-secondary btn-sm" id="add-task-btn">+ Задача</button>
                </div>
                <div id="task-defs">
                    <div class="flex justify-center py-4"><div class="spinner"></div></div>
                </div>
            </div>

            <div class="card">
                <h3 class="font-bold text-gray-700 mb-3">Выполнение за дату</h3>
                <div id="shift-report">
                    <div class="flex justify-center py-4"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('shift-load-btn').onclick = () => loadAll();
    document.getElementById('add-task-btn').onclick = () => addTask();
    loadAll();
}

async function loadAll() {
    await loadTaskDefs();
    await loadReport();
}

async function loadTaskDefs() {
    const role = document.getElementById('shift-role').value;
    const container = document.getElementById('task-defs');
    try {
        const tasks = await api.get(`/api/hr/shift-tasks/catalog?role=${role}`);
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<div class="text-gray-400 text-sm">Нет задач для роли</div>';
            return;
        }
        container.innerHTML = tasks.map(t => `
            <div class="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <div>
                    <div class="font-medium">${t.title}</div>
                    <div class="text-xs text-gray-400">${t.is_required ? 'Обязательная' : 'Необязательная'}</div>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Редактировать</button>
                    <button class="btn btn-ghost btn-sm" data-del="${t.id}">Удалить</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('[data-edit]').forEach(btn => {
            btn.onclick = () => editTask(btn.dataset.edit);
        });
        container.querySelectorAll('[data-del]').forEach(btn => {
            btn.onclick = () => deleteTask(btn.dataset.del);
        });
    } catch {
        container.innerHTML = '<div class="text-red-500 text-sm">Ошибка загрузки</div>';
    }
}

async function loadReport() {
    const role = document.getElementById('shift-role').value;
    const date = document.getElementById('shift-date').value;
    const container = document.getElementById('shift-report');
    try {
        const data = await api.get(`/api/hr/shift-tasks/report?role=${role}&date=${date}`);
        if (!data || !data.items || data.items.length === 0) {
            container.innerHTML = '<div class="text-gray-400 text-sm">Нет сотрудников</div>';
            return;
        }

        container.innerHTML = data.items.map(row => `
            <div class="card mb-3">
                <div class="font-bold mb-2">${row.full_name}</div>
                <div class="text-xs text-gray-400 mb-2">
                    Выполнено: ${row.tasks.filter(t => t.completed).length}/${row.tasks.length}
                </div>
                <div class="space-y-2">
                    ${row.tasks.map(t => `
                        <div class="flex items-center justify-between text-sm">
                            <span>${t.title}</span>
                            <span class="${t.completed ? 'text-green-600' : 'text-red-500'}">${t.completed ? 'Выполнено' : 'Не выполнено'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch {
        container.innerHTML = '<div class="text-red-500 text-sm">Ошибка загрузки</div>';
    }
}

async function addTask() {
    const role = document.getElementById('shift-role').value;
    const title = prompt('Название задачи');
    if (!title) return;
    const required = confirm('Сделать обязательной?');
    try {
        await api.post('/api/hr/shift-tasks', { role, title, is_required: required });
        showToast('Задача добавлена', 'success');
        loadTaskDefs();
    } catch { /* handled */ }
}

async function editTask(taskId) {
    const title = prompt('Новое название');
    if (title === null) return;
    const required = confirm('Сделать обязательной?');
    try {
        await api.patch(`/api/hr/shift-tasks/${taskId}`, { title, is_required: required });
        showToast('Задача обновлена', 'success');
        loadTaskDefs();
    } catch { /* handled */ }
}

async function deleteTask(taskId) {
    if (!confirm('Удалить задачу?')) return;
    try {
        await api.delete(`/api/hr/shift-tasks/${taskId}`);
        showToast('Задача удалена', 'success');
        loadTaskDefs();
    } catch { /* handled */ }
}

import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../components/toast.js';
import { showFormModal } from '../components/modal.js';
import { formatTime, formatDateTime, roleLabel } from '../utils.js';

export async function render(container) {
    const isManager = ['director', 'manager'].includes(state.user.role);

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Кадры</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card" id="my-shift">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">Моя смена</h3>
                <div id="shift-status" class="text-center py-4">
                    <div class="spinner mx-auto"></div>
                </div>
            </div>

            <div class="card" id="shift-checklist-card" style="display:none;">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">Чек-лист перед уходом</h3>
                <div id="shift-checklist">
                    <div class="spinner mx-auto"></div>
                </div>
            </div>

            ${isManager ? `
                <div class="card">
                    <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">Сегодня на работе</h3>
                    <div id="today-list">
                        <div class="spinner mx-auto"></div>
                    </div>
                </div>

                <div class="card">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-bold text-gray-400 uppercase">Инциденты</h3>
                        <button class="btn btn-danger btn-sm" id="add-incident-btn">+ Инцидент</button>
                    </div>
                    <div id="incidents-list">
                        <div class="spinner mx-auto"></div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    loadMyShift();
    if (isManager) {
        loadTodayAttendance();
        loadIncidents();
        document.getElementById('add-incident-btn').onclick = () => showIncidentForm();
    }
}

async function loadMyShift() {
    const container = document.getElementById('shift-status');
    const checklistCard = document.getElementById('shift-checklist-card');
    try {
        const attendance = await api.get('/api/hr/my-attendance');

        if (!attendance) {
            checklistCard.style.display = 'none';
            container.innerHTML = `
                <p class="text-gray-500 mb-4">Вы ещё не отметились</p>
                <button class="btn btn-success btn-lg btn-block" id="checkin-btn" style="min-height: 80px; font-size: 20px;">
                    ☀️ Начать смену
                </button>
            `;
            document.getElementById('checkin-btn').onclick = async () => {
                try {
                    await api.post('/api/hr/checkin');
                    showToast('Смена начата!', 'success');
                    loadMyShift();
                } catch { /* handled */ }
            };
        } else if (!attendance.check_out) {
            checklistCard.style.display = 'block';
            loadShiftChecklist();
            container.innerHTML = `
                <div class="text-green-600 font-bold text-lg mb-1">На смене</div>
                <div class="text-gray-500 mb-4">Приход: ${formatTime(attendance.check_in)}</div>
                <button class="btn btn-warning btn-lg btn-block" id="checkout-btn" style="min-height: 80px; font-size: 20px;">
                    🌙 Закончить смену
                </button>
            `;
            document.getElementById('checkout-btn').onclick = async () => {
                try {
                    await api.post('/api/hr/checkout');
                    showToast('Смена завершена!', 'success');
                    loadMyShift();
                } catch { /* handled */ }
            };
        } else {
            checklistCard.style.display = 'none';
            container.innerHTML = `
                <div class="text-gray-600 font-bold text-lg mb-1">Смена завершена</div>
                <div class="text-gray-400">Приход: ${formatTime(attendance.check_in)} — Уход: ${formatTime(attendance.check_out)}</div>
            `;
        }
    } catch {
        checklistCard.style.display = 'none';
        container.innerHTML = '<div class="text-red-500">Ошибка загрузки</div>';
    }
}

async function loadShiftChecklist() {
    const container = document.getElementById('shift-checklist');
    try {
        const tasks = await api.get('/api/hr/shift-tasks');
        if (!tasks || tasks.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">Нет задач для роли</p>';
            return;
        }

        container.innerHTML = tasks.map(t => `
            <div class="task-item" data-id="${t.id}">
                <div class="task-checkbox ${t.completed ? 'checked' : ''}"></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight: 600;" class="${t.completed ? 'task-done' : ''}">${t.title}</div>
                    ${t.is_required ? '<div class="text-xs text-gray-400">Обязательная</div>' : ''}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.task-item').forEach(item => {
            item.onclick = async () => {
                const taskId = item.dataset.id;
                const isChecked = item.querySelector('.task-checkbox').classList.contains('checked');
                try {
                    await api.post(`/api/hr/shift-tasks/${taskId}/complete`, { completed: !isChecked });
                    loadShiftChecklist();
                } catch { /* handled */ }
            };
        });
    } catch {
        container.innerHTML = '<div class="text-red-500 text-sm">Ошибка</div>';
    }
}

async function loadTodayAttendance() {
    const container = document.getElementById('today-list');
    try {
        const list = await api.get('/api/hr/attendance/today');
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">Никто ещё не отметился</p>';
            return;
        }
        container.innerHTML = list.map(a => `
            <div class="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                    <span class="font-medium">${a.full_name}</span>
                    <span class="text-xs text-gray-400 ml-2">${roleLabel(a.role)}</span>
                </div>
                <div class="text-sm">
                    <span class="text-green-600">${formatTime(a.check_in)}</span>
                    ${a.check_out ? `<span class="text-gray-400"> — </span><span class="text-red-500">${formatTime(a.check_out)}</span>` : '<span class="badge bg-green-100 text-green-700 ml-2">на месте</span>'}
                </div>
            </div>
        `).join('');
    } catch {
        container.innerHTML = '<div class="text-red-500 text-sm">Ошибка</div>';
    }
}

async function loadIncidents() {
    const container = document.getElementById('incidents-list');
    try {
        const list = await api.get('/api/hr/incidents?status=pending');
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">Нет открытых инцидентов</p>';
            return;
        }
        const typeLabels = {
            defect: '🔴 Брак',
            late: '🟡 Опоздание',
            complaint: '🟠 Жалоба',
            other: '⚪ Прочее',
        };

        container.innerHTML = list.map(i => `
            <div class="py-3 border-b last:border-0">
                <div class="flex items-start justify-between">
                    <div>
                        <span class="font-medium">${typeLabels[i.type] || i.type}</span>
                        <span class="text-gray-500 ml-2">— ${i.employee_name}</span>
                    </div>
                    ${i.status === 'pending' ? '<span class="badge bg-yellow-100 text-yellow-700">Ожидает</span>' : '<span class="badge bg-green-100 text-green-700">Обсуждён</span>'}
                </div>
                <p class="text-sm text-gray-600 mt-1">${i.description}</p>
                ${i.material_waste ? `<p class="text-sm text-red-500">Потеря материала: ${i.material_waste} м²</p>` : ''}
                ${i.deduction_amount ? `<p class="text-sm text-red-600">Штраф: ${i.deduction_amount}</p>` : ''}
                <div class="text-xs text-gray-400 mt-1">${formatDateTime(i.created_at)} • ${i.created_by_name}</div>
            </div>
        `).join('');
    } catch {
        container.innerHTML = '<div class="text-red-500 text-sm">Ошибка</div>';
    }
}

async function showIncidentForm() {
    let users = [];
    try {
        users = await api.get('/api/users');
    } catch { /* ignore */ }
    const employees = (users || []).filter(u => u.role !== 'director' && u.is_active);

    showFormModal({
        title: 'Новый инцидент',
        fields: [
            {
                name: 'user_id', label: 'Сотрудник', type: 'select',
                options: employees.map(u => ({ value: u.id, label: `${u.full_name} (${roleLabel(u.role)})` })),
            },
            {
                name: 'type', label: 'Тип', type: 'select',
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
                    user_id: parseInt(data.user_id),
                    type: data.type,
                    description: data.description,
                    material_waste: data.material_waste ? parseFloat(data.material_waste) : null,
                    deduction_amount: data.deduction_amount ? parseFloat(data.deduction_amount) : null,
                });
                showToast('Инцидент создан', 'success');
                loadIncidents();
            } catch { /* handled */ }
        },
    });
}

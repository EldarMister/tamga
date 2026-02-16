import { api } from '../api.js';
import { state } from '../state.js';
import { formatCurrency, formatDate, formatDateTime, statusBadgeClass, statusLabel, roleLabel, isOverdue } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';

const NEXT_STATUS = {
    created: { label: 'Передать в дизайн', status: 'design', roles: ['manager', 'director'] },
    design: { label: 'Макет готов', status: 'design_done', roles: ['designer', 'manager', 'director'] },
    design_done: { label: 'Отправить в печать', status: 'production', roles: ['manager', 'director', 'master'] },
    production: { label: 'Напечатано', status: 'printed', roles: ['master', 'manager', 'director'] },
    printed: { label: 'На постобработку', status: 'postprocess', roles: ['manager', 'director', 'master'] },
    postprocess: { label: 'Готов к выдаче', status: 'ready', roles: ['assistant', 'manager', 'director'] },
    ready: { label: 'Выдан клиенту', status: 'closed', roles: ['manager', 'director'] },
};

export async function render(container, params) {
    const orderId = params.id;
    container.innerHTML = '<div class="flex justify-center py-16"><div class="spinner"></div></div>';

    try {
        const order = await api.get(`/api/orders/${orderId}`);
        if (!order) return;
        renderOrder(container, order);
    } catch {
        container.innerHTML = '<div class="text-center text-red-500 py-16">Ошибка загрузки заказа</div>';
    }
}

function renderOrder(container, order) {
    const overdue = isOverdue(order);
    const next = NEXT_STATUS[order.status];
    const canAdvance = next && next.roles.includes(state.user.role);
    const canCancel = ['manager', 'director'].includes(state.user.role) && !['closed', 'cancelled'].includes(order.status);
    const canUploadDesign = ['designer', 'manager', 'director'].includes(state.user.role) && ['design', 'created'].includes(order.status);

    const item = order.items?.[0] || {};

    container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-sm btn-secondary" id="back-btn">← Назад</button>
            <h1 class="text-lg font-bold">${order.order_number}</h1>
            <div></div>
        </div>

        <div class="px-4 space-y-4 pb-8">
            <!-- Status -->
            <div class="card">
                <div class="flex items-center justify-between">
                    <span class="${statusBadgeClass(order.status)} text-base px-4 py-2">${statusLabel(order.status)}</span>
                    ${overdue ? '<span class="badge badge-overdue">Просрочен!</span>' : ''}
                </div>
                ${canAdvance ? `
                    <button class="btn btn-success btn-block btn-lg mt-4" id="advance-btn">
                        ${next.label} →
                    </button>
                ` : ''}
            </div>

            <!-- Client -->
            <div class="card">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-2">Клиент</h3>
                <div class="font-bold text-lg">${order.client_name}</div>
                ${order.client_phone ? `<a href="tel:${order.client_phone}" class="text-blue-600">${order.client_phone}</a>` : ''}
                <span class="badge ${order.client_type === 'dealer' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} ml-2">
                    ${order.client_type === 'dealer' ? 'Дилер' : 'Розница'}
                </span>
            </div>

            <!-- Service details -->
            <div class="card">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-2">Услуга</h3>
                <div class="font-medium">${item.name_ru || '—'}</div>
                <div class="grid grid-cols-3 gap-4 mt-3">
                    <div>
                        <div class="text-xs text-gray-400">Кол-во</div>
                        <div class="font-bold">${item.quantity || '—'} ${item.unit || ''}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-400">Цена/ед</div>
                        <div class="font-bold">${formatCurrency(item.unit_price)}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-400">Итого</div>
                        <div class="font-bold text-blue-800 text-lg">${formatCurrency(order.total_price)}</div>
                    </div>
                </div>
                ${state.user.role === 'director' ? `
                    <div class="mt-3 pt-3 border-t">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-xs text-gray-400">Себестоимость</div>
                                <div class="font-bold text-red-600">${formatCurrency(order.material_cost)}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-400">Прибыль</div>
                                <div class="font-bold text-green-600">${formatCurrency(order.total_price - (order.material_cost || 0))}</div>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Design file -->
            ${order.design_file || canUploadDesign ? `
                <div class="card">
                    <h3 class="text-sm font-bold text-gray-400 uppercase mb-2">Макет</h3>
                    ${order.design_file ? `
                        <a href="/api/uploads/${order.design_file}" target="_blank" class="btn btn-outline btn-sm">
                            📎 ${order.design_file}
                        </a>
                    ` : '<p class="text-gray-400">Макет не загружен</p>'}
                    ${canUploadDesign ? `
                        <div class="mt-3">
                            <input type="file" id="design-file" class="input" accept=".pdf,.ai,.cdr,.psd,.jpg,.jpeg,.png,.tiff">
                            <button class="btn btn-primary btn-sm mt-2" id="upload-design-btn">Загрузить макет</button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <!-- Info -->
            <div class="card">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-2">Информация</h3>
                <div class="space-y-2 text-sm">
                    ${order.deadline ? `<div class="flex justify-between"><span class="text-gray-500">Срок</span><span class="font-medium ${overdue ? 'text-red-600' : ''}">${formatDate(order.deadline)}</span></div>` : ''}
                    <div class="flex justify-between"><span class="text-gray-500">Создан</span><span>${formatDateTime(order.created_at)}</span></div>
                    ${order.notes ? `<div class="mt-2 p-3 bg-gray-50 rounded-lg text-gray-600">${order.notes}</div>` : ''}
                </div>
            </div>

            <!-- History -->
            <div class="card">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">История</h3>
                <div class="space-y-3">
                    ${(order.history || []).map(h => `
                        <div class="flex gap-3 text-sm">
                            <div class="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                            <div>
                                <div class="font-medium">${h.note || `${statusLabel(h.old_status || '')} → ${statusLabel(h.new_status)}`}</div>
                                <div class="text-gray-400">${h.full_name} • ${formatDateTime(h.created_at)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Cancel -->
            ${canCancel ? `
                <button class="btn btn-danger btn-block" id="cancel-btn">Отменить заказ</button>
            ` : ''}
        </div>
    `;

    // Event handlers
    document.getElementById('back-btn').onclick = () => { window.location.hash = '#/orders'; };

    if (canAdvance) {
        document.getElementById('advance-btn').onclick = async () => {
            showModal({
                title: 'Подтверждение',
                body: `Перевести заказ в статус "${next.label}"?`,
                onConfirm: async () => {
                    try {
                        await api.patch(`/api/orders/${order.id}/status`, { status: next.status });
                        showToast('Статус обновлён', 'success');
                        render(container, { id: order.id });
                    } catch { /* handled */ }
                },
            });
        };
    }

    if (canCancel) {
        document.getElementById('cancel-btn').onclick = () => {
            showModal({
                title: 'Отмена заказа',
                body: 'Вы уверены? Зарезервированный материал вернётся на склад.',
                confirmText: 'Отменить заказ',
                danger: true,
                onConfirm: async () => {
                    try {
                        await api.patch(`/api/orders/${order.id}/status`, { status: 'cancelled' });
                        showToast('Заказ отменён', 'warning');
                        window.location.hash = '#/orders';
                    } catch { /* handled */ }
                },
            });
        };
    }

    if (canUploadDesign) {
        const uploadBtn = document.getElementById('upload-design-btn');
        if (uploadBtn) {
            uploadBtn.onclick = async () => {
                const fileInput = document.getElementById('design-file');
                if (!fileInput.files[0]) {
                    showToast('Выберите файл', 'warning');
                    return;
                }
                try {
                    await api.upload(`/api/orders/${order.id}/design`, fileInput.files[0]);
                    showToast('Макет загружен', 'success');
                    render(container, { id: order.id });
                } catch { /* handled */ }
            };
        }
    }
}

import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../components/toast.js';
import { showFormModal } from '../components/modal.js';
import { formatDateTime } from '../utils.js';

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Склад</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8" id="inventory-list">
            <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
    `;
    loadInventory();
}

async function loadInventory() {
    const container = document.getElementById('inventory-list');
    try {
        const materials = await api.get('/api/inventory');
        if (!materials) return;

        const canManage = ['director', 'manager'].includes(state.user.role);

        container.innerHTML = materials.map(m => {
            const available = m.quantity - m.reserved;
            const maxStock = Math.max(m.quantity + 10, m.low_threshold * 5);
            const pct = Math.min(100, Math.max(0, (available / maxStock) * 100));
            let barColor = 'bg-green-500';
            if (available < m.low_threshold) barColor = 'bg-red-500';
            else if (available < m.low_threshold * 2) barColor = 'bg-yellow-500';

            return `
                <div class="card ${m.is_low ? 'border-2 border-red-400' : ''}">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <h3 class="font-bold">${m.name_ru}</h3>
                            <span class="text-xs text-gray-400">${m.unit}</span>
                        </div>
                        ${m.is_low ? '<span class="badge badge-cancelled">МАЛО!</span>' : ''}
                    </div>

                    <div class="stock-bar my-3">
                        <div class="stock-bar-fill ${barColor}" style="width: ${pct}%"></div>
                    </div>

                    <div class="grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                            <div class="text-gray-400">На складе</div>
                            <div class="font-bold text-lg">${m.quantity.toFixed(1)}</div>
                        </div>
                        <div>
                            <div class="text-gray-400">Резерв</div>
                            <div class="font-bold text-lg text-yellow-600">${m.reserved.toFixed(1)}</div>
                        </div>
                        <div>
                            <div class="text-gray-400">Доступно</div>
                            <div class="font-bold text-lg ${m.is_low ? 'text-red-600' : 'text-green-600'}">${available.toFixed(1)}</div>
                        </div>
                    </div>

                    ${canManage ? `
                        <div class="flex gap-2 mt-4">
                            <button class="btn btn-success btn-sm flex-1 receive-btn" data-id="${m.id}" data-name="${m.name_ru}">+ Приход</button>
                            <button class="btn btn-secondary btn-sm flex-1 correct-btn" data-id="${m.id}" data-name="${m.name_ru}">± Коррекция</button>
                            <button class="btn btn-outline btn-sm ledger-btn" data-id="${m.id}" data-name="${m.name_ru}">📋</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Bind buttons
        container.querySelectorAll('.receive-btn').forEach(btn => {
            btn.onclick = () => showReceiveModal(btn.dataset.id, btn.dataset.name);
        });
        container.querySelectorAll('.correct-btn').forEach(btn => {
            btn.onclick = () => showCorrectionModal(btn.dataset.id, btn.dataset.name);
        });
        container.querySelectorAll('.ledger-btn').forEach(btn => {
            btn.onclick = () => showLedger(btn.dataset.id, btn.dataset.name);
        });

    } catch {
        container.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки</div>';
    }
}

function showReceiveModal(id, name) {
    showFormModal({
        title: `Приход: ${name}`,
        fields: [
            { name: 'quantity', label: 'Количество (м²)', type: 'number', required: true, step: '0.1', placeholder: '0' },
            { name: 'note', label: 'Примечание', type: 'text', placeholder: 'Поставщик, накладная...' },
        ],
        submitText: 'Принять',
        onSubmit: async (data) => {
            const qty = parseFloat(data.quantity);
            if (!qty || qty <= 0) { showToast('Введите количество', 'warning'); return; }
            try {
                await api.post(`/api/inventory/${id}/receive`, { quantity: qty, note: data.note });
                showToast('Материал принят', 'success');
                loadInventory();
            } catch { /* handled */ }
        },
    });
}

function showCorrectionModal(id, name) {
    showFormModal({
        title: `Корректировка: ${name}`,
        fields: [
            { name: 'quantity', label: 'Количество (+/-)', type: 'number', required: true, step: '0.1', placeholder: 'напр. -5 или +10' },
            { name: 'note', label: 'Причина', type: 'text', required: true, placeholder: 'Инвентаризация, ошибка...' },
        ],
        submitText: 'Применить',
        onSubmit: async (data) => {
            const qty = parseFloat(data.quantity);
            if (!qty) { showToast('Введите количество', 'warning'); return; }
            try {
                await api.post(`/api/inventory/${id}/correction`, { quantity: qty, note: data.note });
                showToast('Корректировка применена', 'success');
                loadInventory();
            } catch { /* handled */ }
        },
    });
}

async function showLedger(id, name) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = '<div class="p-6"><div class="flex justify-center"><div class="spinner"></div></div></div>';
    overlay.classList.remove('hidden');

    try {
        const entries = await api.get(`/api/inventory/${id}/ledger?limit=30`);
        const actionLabels = {
            receive: '📦 Приход',
            reserve: '🔒 Резерв',
            unreserve: '🔓 Возврат',
            consume: '🖨 Списание',
            correction: '📝 Коррекция',
            defect: '❌ Брак',
        };

        content.innerHTML = `
            <div class="p-6">
                <h3 class="font-bold text-lg mb-4">История: ${name}</h3>
                <div class="space-y-2 max-h-96 overflow-y-auto">
                    ${entries.length ? entries.map(e => `
                        <div class="flex items-center justify-between text-sm border-b pb-2">
                            <div>
                                <div class="font-medium">${actionLabels[e.action] || e.action}</div>
                                <div class="text-gray-400">${e.full_name} • ${formatDateTime(e.created_at)}</div>
                                ${e.note ? `<div class="text-gray-500 text-xs">${e.note}</div>` : ''}
                                ${e.order_number ? `<div class="text-blue-600 text-xs">${e.order_number}</div>` : ''}
                            </div>
                            <div class="font-bold ${e.quantity > 0 ? 'text-green-600' : 'text-red-600'}">
                                ${e.quantity > 0 ? '+' : ''}${e.quantity.toFixed(1)}
                            </div>
                        </div>
                    `).join('') : '<p class="text-gray-400 text-center">Нет записей</p>'}
                </div>
                <button class="btn btn-secondary btn-block mt-4" id="close-ledger">Закрыть</button>
            </div>
        `;
        document.getElementById('close-ledger').onclick = () => overlay.classList.add('hidden');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
    } catch {
        content.innerHTML = '<div class="p-6 text-center text-red-500">Ошибка загрузки</div>';
    }
}

import { api } from '../api.js';
import { state } from '../state.js';
import { formatCurrency, formatDate, statusBadgeClass, statusLabel, isOverdue, buildUploadUrl, openImageViewer } from '../utils.js';

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'created', label: 'Новые' },
    { value: 'design', label: 'Дизайн' },
    { value: 'production', label: 'Производство' },
    { value: 'ready', label: 'Готовые' },
    { value: 'closed', label: 'Закрытые' },
    { value: 'defect', label: 'Брак' },
];

let currentFilter = '';
let searchQuery = '';

export async function render(container) {
    const canCreate = ['director', 'manager'].includes(state.user.role);

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Заказы</h1>
            ${canCreate ? '<button class="btn btn-primary" id="new-order-btn">+ Новый</button>' : ''}
        </div>
        <div class="px-4 mb-3">
            <input type="search" class="input" id="order-search" placeholder="Поиск по номеру или клиенту..." value="${searchQuery}">
        </div>
        <div class="px-4 mb-4 flex gap-2 overflow-x-auto pb-1" id="status-filters"></div>
        <div class="px-4 space-y-3" id="orders-list">
            <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
    `;

    renderFilters();
    loadOrders();

    if (canCreate) {
        document.getElementById('new-order-btn').onclick = () => {
            window.location.hash = '#/orders/new';
        };
    }

    document.getElementById('order-search').oninput = (e) => {
        searchQuery = e.target.value;
        clearTimeout(window._searchTimer);
        window._searchTimer = setTimeout(loadOrders, 400);
    };
}

function renderFilters() {
    const container = document.getElementById('status-filters');
    container.innerHTML = STATUS_FILTERS.map(f =>
        `<button class="btn btn-sm ${f.value === currentFilter ? 'btn-primary' : 'btn-secondary'}" data-status="${f.value}">${f.label}</button>`
    ).join('');

    container.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            currentFilter = btn.dataset.status;
            renderFilters();
            loadOrders();
        };
    });
}

async function loadOrders() {
    const list = document.getElementById('orders-list');
    try {
        let url = `/api/orders?limit=50&status=${currentFilter}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        const data = await api.get(url);
        if (!data) return;

        if (data.orders.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                        <rect x="9" y="3" width="6" height="4" rx="1"/>
                    </svg>
                    <p class="text-lg font-medium">Заказов нет</p>
                    <p class="text-sm mt-1">Создайте первый заказ</p>
                </div>
            `;
            return;
        }

        list.innerHTML = data.orders.map(order => renderOrderCard(order)).join('');
        list.querySelectorAll('.order-card').forEach(card => {
            card.onclick = () => {
                window.location.hash = `#/orders/${card.dataset.id}`;
            };
        });

        list.querySelectorAll('.order-thumb').forEach((img) => {
            img.addEventListener('error', () => {
                const placeholder = document.createElement('div');
                placeholder.className = 'order-thumb-placeholder';
                img.replaceWith(placeholder);
            }, { once: true });

            img.addEventListener('click', (e) => {
                e.stopPropagation();
                openImageViewer(img.currentSrc || img.src, img.alt || 'Фото заказа');
            });
            img.classList.add('is-clickable');
        });
    } catch {
        list.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки</div>';
    }
}

function renderOrderCard(order) {
    const overdue = isOverdue(order);
    const itemsCount = order.items?.length || 0;
    const mainItem = order.items?.[0];
    const summary = itemsCount > 1
        ? `${itemsCount} услуг`
        : (mainItem ? `${mainItem.name_ru} • ${mainItem.quantity} ${mainItem.unit || ''}` : '—');

    const photoUrl = buildUploadUrl(order.photo_file);
    const thumb = photoUrl
        ? `<img src="${photoUrl}" class="order-thumb" alt="Фото" loading="lazy">`
        : '<div class="order-thumb-placeholder"></div>';

    return `
        <div class="card cursor-pointer hover:shadow-md transition-shadow order-card ${overdue ? 'border-red-400 border-2' : ''}" data-id="${order.id}">
            <div class="order-card-grid">
                ${thumb}
                <div>
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <span class="font-bold text-blue-800">${order.order_number}</span>
                            ${overdue ? '<span class="badge badge-overdue ml-2">Просрочен</span>' : ''}
                        </div>
                        <span class="${statusBadgeClass(order.status)}">${statusLabel(order.status)}</span>
                    </div>
                    <div class="text-gray-900 font-medium">${order.client_name}</div>
                    <div class="text-sm text-gray-500 mt-1">${summary}</div>
                    <div class="flex items-center justify-between mt-3 text-sm">
                        <span class="font-bold text-lg">${formatCurrency(order.total_price)}</span>
                        <span class="text-gray-400">${order.deadline ? formatDate(order.deadline) : formatDate(order.created_at)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

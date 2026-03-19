import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { state } from '@legacy/state.js';
import {
    buildUploadUrl,
    formatCurrency,
    formatDate,
    isOverdue,
    openImageViewer,
    statusBadgeClass,
    statusLabel,
} from '@legacy/utils.js';

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'created', label: 'Новые' },
    { value: 'design', label: 'Дизайн' },
    { value: 'production', label: 'Производство' },
    { value: 'ready', label: 'Готовые' },
    { value: 'closed', label: 'Закрытые' },
    { value: 'defect', label: 'Брак' },
];

function OrderCard({ order }) {
    const overdue = isOverdue(order);
    const itemsCount = order.items?.length || 0;
    const mainItem = order.items?.[0];
    const summary = itemsCount > 1
        ? `${itemsCount} услуг`
        : (mainItem ? `${mainItem.name_ru} • ${mainItem.quantity} ${mainItem.unit || ''}` : '—');
    const photoUrl = order.photo_url || buildUploadUrl(order.photo_file);

    return (
        <div
            className={`card cursor-pointer hover:shadow-md transition-shadow order-card ${overdue ? 'border-red-400 border-2' : ''}`}
            onClick={() => {
                window.location.hash = `#/orders/${order.id}`;
            }}
        >
            <div className="order-card-grid">
                {photoUrl ? (
                    <img
                        src={photoUrl}
                        className="order-thumb is-clickable"
                        alt="Фото заказа"
                        loading="lazy"
                        onClick={(event) => {
                            event.stopPropagation();
                            openImageViewer(photoUrl, 'Фото заказа');
                        }}
                        onError={(event) => {
                            event.currentTarget.style.display = 'none';
                            const placeholder = event.currentTarget.nextElementSibling;
                            if (placeholder) placeholder.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="order-thumb-placeholder"
                    style={photoUrl ? { display: 'none' } : undefined}
                >
                    📷
                </div>

                <div>
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <span className="font-bold text-blue-800">{order.order_number}</span>
                            {overdue ? <span className="badge badge-overdue ml-2">Просрочен</span> : null}
                        </div>
                        <span className={statusBadgeClass(order.status)}>{statusLabel(order.status)}</span>
                    </div>
                    <div className="text-gray-900 font-medium">{order.client_name}</div>
                    <div className="text-sm text-gray-500 mt-1">{summary}</div>
                    <div className="flex items-center justify-between mt-3 text-sm">
                        <span className="font-bold text-lg">{formatCurrency(order.total_price)}</span>
                        <span className="text-gray-400">
                            {order.deadline ? formatDate(order.deadline) : formatDate(order.created_at)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function OrdersPage({ refreshToken = 0 }) {
    const canCreate = ['director', 'manager'].includes(state.user.role);
    const [filter, setFilter] = useState('');
    const [searchValue, setSearchValue] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchQuery(searchValue.trim());
        }, 350);
        return () => window.clearTimeout(timer);
    }, [searchValue]);

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/orders');

        async function loadOrders() {
            setIsLoading(true);
            setError('');
            try {
                let url = `/api/orders?limit=50&status=${filter}`;
                if (searchQuery) {
                    url += `&search=${encodeURIComponent(searchQuery)}`;
                }
                const data = await api.get(url);
                if (!alive || !data) return;
                setOrders(data.orders || []);
            } catch {
                if (alive) {
                    setError('Ошибка загрузки');
                }
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadOrders();
        return () => {
            alive = false;
        };
    }, [filter, searchQuery, refreshToken]);

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Заказы</h1>
                {canCreate ? (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            window.location.hash = '#/orders/new';
                        }}
                    >
                        + Новый
                    </button>
                ) : null}
            </div>

            <div className="px-4 mb-3">
                <input
                    type="search"
                    className="input"
                    placeholder="Поиск по номеру или клиенту..."
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                />
            </div>

            <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1">
                {STATUS_FILTERS.map((item) => (
                    <button
                        key={item.value || 'all'}
                        type="button"
                        className={`btn btn-sm ${item.value === filter ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter(item.value)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="px-4 space-y-3">
                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                            <rect x="9" y="3" width="6" height="4" rx="1" />
                        </svg>
                        <p className="text-lg font-medium">Заказов нет</p>
                        <p className="text-sm mt-1">Создайте первый заказ</p>
                    </div>
                ) : (
                    orders.map((order) => <OrderCard key={order.id} order={order} />)
                )}
            </div>
        </>
    );
}

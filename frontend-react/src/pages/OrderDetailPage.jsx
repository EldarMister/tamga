import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal, showModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import {
    buildUploadUrl,
    formatCurrency,
    formatDate,
    formatDateTime,
    isOverdue,
    openImageViewer,
    statusBadgeClass,
    statusLabel,
} from '@legacy/utils.js';

const NEXT_STATUS = {
    created: { label: 'Передать в дизайн', status: 'design', roles: ['manager', 'director'] },
    design: { label: 'В производство', status: 'production', roles: ['designer', 'manager', 'director'] },
    production: { label: 'Готов к выдаче', status: 'ready', roles: ['master', 'manager', 'director'] },
    ready: { label: 'Выдан клиенту', status: 'closed', roles: ['manager', 'director'] },
    design_done: { label: 'В производство', status: 'production', roles: ['manager', 'director', 'master'] },
    printed: { label: 'Готов к выдаче', status: 'ready', roles: ['manager', 'director'] },
    postprocess: { label: 'Готов к выдаче', status: 'ready', roles: ['assistant', 'manager', 'director'] },
};

function isAreaUnit(unit) {
    if (!unit) return false;
    const normalized = unit.toLowerCase().replace(/\s+/g, '');
    return normalized.includes('м2') || normalized.includes('м²') || normalized.includes('m2') || normalized.includes('m²');
}

export default function OrderDetailPage({ params, refreshToken = 0 }) {
    const orderId = params?.id;
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    async function loadOrder() {
        setIsLoading(true);
        setError('');
        try {
            const data = await api.get(`/api/orders/${orderId}`);
            setOrder(data);
        } catch {
            setError('Ошибка загрузки заказа');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadOrder();
    }, [orderId, refreshToken]);

    if (isLoading) {
        return <div className="flex justify-center py-16"><div className="spinner" /></div>;
    }

    if (error || !order) {
        return <div className="text-center text-red-500 py-16">{error || 'Заказ не найден'}</div>;
    }

    const overdue = isOverdue(order);
    const next = NEXT_STATUS[order.status];
    const canAdvance = next && next.roles.includes(state.user.role);
    const canCancel = ['manager', 'director'].includes(state.user.role) && !['closed', 'cancelled', 'defect'].includes(order.status);
    const canMarkDefect = ['manager', 'director'].includes(state.user.role) && !['closed', 'cancelled', 'defect'].includes(order.status);
    const canUploadDesign = ['designer', 'manager', 'director'].includes(state.user.role) && ['design', 'created'].includes(order.status);
    const canNotify = ['manager', 'director'].includes(state.user.role) && order.status === 'ready';
    const photoUrl = order.photo_url || buildUploadUrl(order.photo_file);
    const items = Array.isArray(order.items) ? order.items : [];

    function reloadAfter(action) {
        return async (...args) => {
            await action(...args);
            loadOrder();
        };
    }

    return (
        <>
            <div className="page-header">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => { window.location.hash = '#/orders'; }}>
                    ← Назад
                </button>
                <h1 className="text-lg font-bold">{order.order_number}</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="flex items-center justify-between">
                        <span className={`${statusBadgeClass(order.status)} text-base px-4 py-2`}>{statusLabel(order.status)}</span>
                        {overdue ? <span className="badge badge-overdue">Просрочен!</span> : null}
                    </div>

                    {canAdvance ? (
                        <button
                            type="button"
                            className="btn btn-success btn-block btn-lg mt-4"
                            onClick={() => {
                                showModal({
                                    title: 'Подтверждение',
                                    body: `Перевести заказ в статус "${next.label}"?`,
                                    onConfirm: reloadAfter(async () => {
                                        await api.patch(`/api/orders/${order.id}/status`, { status: next.status });
                                        showToast('Статус обновлён', 'success');
                                    }),
                                });
                            }}
                        >
                            {next.label} →
                        </button>
                    ) : null}

                    {canNotify ? (
                        <button
                            type="button"
                            className="btn btn-primary btn-block btn-lg mt-3"
                            onClick={async () => {
                                try {
                                    await api.post(`/api/orders/${order.id}/notify`, {});
                                    showToast('Уведомление поставлено в очередь', 'success');
                                } catch {
                                    // api.js already handles user-facing errors.
                                }
                            }}
                        >
                            Отправить уведомление клиенту
                        </button>
                    ) : null}
                </div>

                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Клиент</h3>
                    <div className="font-bold text-lg">{order.client_name}</div>
                    {order.client_phone ? <a href={`tel:${order.client_phone}`} className="text-blue-600">{order.client_phone}</a> : null}
                    <span className={`badge ${order.client_type === 'dealer' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} ml-2`}>
                        {order.client_type === 'dealer' ? 'Дилер' : 'Розница'}
                    </span>
                </div>

                {photoUrl ? (
                    <div className="card">
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Фото заказа</h3>
                        <img src={photoUrl} className="order-photo is-clickable" alt="Фото заказа" loading="lazy" onClick={() => openImageViewer(photoUrl, 'Фото заказа')} />
                    </div>
                ) : null}

                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">Услуги</h3>
                    <div className="order-items-wrap">
                        <table className="order-items-table">
                            <thead>
                                <tr>
                                    <th>Услуга</th>
                                    <th>Ширина</th>
                                    <th>Высота</th>
                                    <th>Кол-во</th>
                                    <th>Цена</th>
                                    <th>Итог</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const areaItem = isAreaUnit(item.unit);
                                    return (
                                        <tr key={item.id}>
                                            <td>{item.name_ru || ''}</td>
                                            <td>{areaItem ? (item.width || '—') : '—'}</td>
                                            <td>{areaItem ? (item.height || '—') : '—'}</td>
                                            <td>{item.quantity} {item.unit || ''}</td>
                                            <td>{formatCurrency(item.unit_price)}</td>
                                            <td>{formatCurrency(item.total)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-gray-500">Итого по заказу</span>
                        <span className="font-bold text-lg">{formatCurrency(order.total_price)}</span>
                    </div>

                    {state.user.role === 'director' ? (
                        <div className="mt-3 pt-3 border-t">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-gray-400">Себестоимость</div>
                                    <div className="font-bold text-red-600">{formatCurrency(order.material_cost)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400">Прибыль</div>
                                    <div className="font-bold text-green-600">{formatCurrency(order.total_price - (order.material_cost || 0))}</div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {(order.design_file || canUploadDesign) ? (
                    <div className="card">
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Макет</h3>
                        {order.design_file ? (
                            <a href={`/api/uploads/${order.design_file}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                                📎 {order.design_file}
                            </a>
                        ) : (
                            <p className="text-gray-400">Макет не загружен</p>
                        )}

                        {canUploadDesign ? (
                            <div className="mt-3">
                                <input
                                    type="file"
                                    className="input"
                                    accept=".pdf,.ai,.cdr,.psd,.jpg,.jpeg,.png,.tiff"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        api.upload(`/api/orders/${order.id}/design`, file)
                                            .then(() => {
                                                showToast('Макет загружен', 'success');
                                                loadOrder();
                                            })
                                            .catch(() => {});
                                    }}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Информация</h3>
                    <div className="space-y-2 text-sm">
                        {order.deadline ? (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Срок</span>
                                <span className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{formatDate(order.deadline)}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between">
                            <span className="text-gray-500">Создан</span>
                            <span>{formatDateTime(order.created_at)}</span>
                        </div>
                        {order.notes ? <div className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-600">{order.notes}</div> : null}
                    </div>
                </div>

                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">История</h3>
                    <div className="space-y-3">
                        {(order.history || []).map((historyItem, index) => (
                            <div className="flex gap-3 text-sm" key={`${historyItem.created_at}_${index}`}>
                                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                                <div>
                                    <div className="font-medium">
                                        {historyItem.note || `${statusLabel(historyItem.old_status || '')} → ${statusLabel(historyItem.new_status)}`}
                                    </div>
                                    <div className="text-gray-400">{historyItem.full_name} • {formatDateTime(historyItem.created_at)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {canMarkDefect ? (
                    <button
                        type="button"
                        className="btn btn-warning btn-block"
                        onClick={() => {
                            showFormModal({
                                title: 'Отметить как Брак',
                                fields: [
                                    {
                                        type: 'select',
                                        name: 'caused_by',
                                        label: 'Виновник',
                                        options: [
                                            { value: 'manager', label: 'Менеджер' },
                                            { value: 'designer', label: 'Дизайнер' },
                                            { value: 'master', label: 'Печатник' },
                                        ],
                                    },
                                    { type: 'textarea', name: 'description', label: 'Описание брака', placeholder: 'Опишите проблему...' },
                                ],
                                submitText: 'Отметить как Брак',
                                onSubmit: reloadAfter(async (data) => {
                                    const causeLabels = { manager: 'Менеджер', designer: 'Дизайнер', master: 'Печатник' };
                                    const note = `Виновник: ${causeLabels[data.caused_by] || data.caused_by}. ${data.description || ''}`.trim();
                                    await api.patch(`/api/orders/${order.id}/status`, { status: 'defect', note });
                                    showToast('Заказ отмечен как брак', 'warning');
                                }),
                            });
                        }}
                    >
                        Отметить как Брак
                    </button>
                ) : null}

                {canCancel ? (
                    <button
                        type="button"
                        className="btn btn-danger btn-block mt-2"
                        onClick={() => {
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
                                    } catch {
                                        // api.js already handles user-facing errors.
                                    }
                                },
                            });
                        }}
                    >
                        Отменить заказ
                    </button>
                ) : null}
            </div>
        </>
    );
}

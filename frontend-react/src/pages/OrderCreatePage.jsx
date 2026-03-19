import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { formatCurrency } from '@legacy/utils.js';

function isAreaUnit(unit) {
    if (!unit) return false;
    const normalized = unit.toLowerCase().replace(/\s+/g, '');
    return normalized.includes('м2') || normalized.includes('м²') || normalized.includes('m2') || normalized.includes('m²');
}

function createEmptyItem(defaultServiceId = '') {
    return {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        service_id: String(defaultServiceId || ''),
        width: '',
        height: '',
        quantity: '1',
    };
}

function calcLine(item, service, clientType) {
    if (!service) return { unitPrice: 0, lineTotal: 0, areaRequired: false };
    const unitPrice = clientType === 'dealer' && service.price_dealer > 0 ? service.price_dealer : service.price_retail;
    const qty = parseFloat(item.quantity) || 0;
    const areaRequired = isAreaUnit(service.unit);

    if (areaRequired) {
        const width = parseFloat(item.width) || 0;
        const height = parseFloat(item.height) || 0;
        return { unitPrice, lineTotal: width * height * qty * unitPrice, areaRequired };
    }

    return { unitPrice, lineTotal: qty * unitPrice, areaRequired };
}

function UserSelect({ id, label, users, value, onChange }) {
    return (
        <div>
            <label className="input-label" htmlFor={id}>{label}</label>
            <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="">Не назначен</option>
                {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
            </select>
        </div>
    );
}

export default function OrderCreatePage() {
    const [services, setServices] = useState([]);
    const [users, setUsers] = useState([]);
    const [items, setItems] = useState([createEmptyItem()]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientType, setClientType] = useState('retail');
    const [assignedDesigner, setAssignedDesigner] = useState('');
    const [assignedMaster, setAssignedMaster] = useState('');
    const [assignedAssistant, setAssignedAssistant] = useState('');
    const [deadline, setDeadline] = useState('');
    const [notes, setNotes] = useState('');
    const [photoFile, setPhotoFile] = useState(null);

    useEffect(() => {
        let alive = true;

        async function loadData() {
            setIsLoading(true);
            try {
                const [serviceRows, userRows] = await Promise.all([
                    api.get('/api/pricelist'),
                    api.get('/api/users').catch(() => []),
                ]);
                if (!alive) return;

                const nextServices = serviceRows || [];
                setServices(nextServices);
                setUsers(userRows || []);

                const prefillRaw = sessionStorage.getItem('calc_prefill');
                if (prefillRaw) {
                    sessionStorage.removeItem('calc_prefill');
                    try {
                        const prefill = JSON.parse(prefillRaw);
                        setItems([{
                            id: `calc_${Date.now()}`,
                            service_id: String(prefill.service_id || ''),
                            width: prefill.width || '',
                            height: prefill.height || '',
                            quantity: prefill.quantity || '1',
                        }]);
                        if (prefill.client_type) {
                            setClientType(prefill.client_type);
                        }
                        return;
                    } catch {
                        // Ignore malformed prefill.
                    }
                }

                setItems((current) => current.length ? current : [createEmptyItem(nextServices[0]?.id || '')]);
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadData();
        return () => {
            alive = false;
        };
    }, []);

    function getService(serviceId) {
        return services.find((service) => String(service.id) === String(serviceId));
    }

    function updateItem(itemId, patch) {
        setItems((current) => current.map((item) => (
            item.id === itemId ? { ...item, ...patch } : item
        )));
    }

    function addItem(defaultServiceId = '') {
        setItems((current) => [...current, createEmptyItem(defaultServiceId)]);
    }

    function removeItem(itemId) {
        setItems((current) => {
            const next = current.filter((item) => item.id !== itemId);
            return next.length ? next : [createEmptyItem(services[0]?.id || '')];
        });
    }

    const orderTotal = items.reduce((sum, item) => {
        const service = getService(item.service_id);
        return sum + calcLine(item, service, clientType).lineTotal;
    }, 0);

    async function handleSubmit(event) {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            const payloadItems = [];

            for (const item of items) {
                if (!item.service_id) continue;
                const service = getService(item.service_id);
                if (!service) continue;

                const qty = parseFloat(item.quantity);
                if (!qty || qty <= 0) {
                    throw new Error('Проверьте количество');
                }

                const areaRequired = isAreaUnit(service.unit);
                const width = areaRequired ? parseFloat(item.width) : null;
                const height = areaRequired ? parseFloat(item.height) : null;

                if (areaRequired && (!width || !height)) {
                    throw new Error('Нужны ширина и высота для услуг в м²');
                }

                payloadItems.push({
                    service_id: parseInt(item.service_id, 10),
                    quantity: qty,
                    width: width || null,
                    height: height || null,
                    options: {},
                });
            }

            if (!payloadItems.length) {
                throw new Error('Добавьте хотя бы одну услугу');
            }

            const order = await api.post('/api/orders', {
                client_name: clientName.trim(),
                client_phone: clientPhone.trim(),
                client_type: clientType,
                items: payloadItems,
                notes: notes.trim(),
                deadline: deadline || null,
                assigned_designer: assignedDesigner ? parseInt(assignedDesigner, 10) : null,
                assigned_master: assignedMaster ? parseInt(assignedMaster, 10) : null,
                assigned_assistant: assignedAssistant ? parseInt(assignedAssistant, 10) : null,
            });

            if (!order) return;

            let photoWarning = '';
            if (photoFile) {
                try {
                    const uploaded = await api.upload(`/api/orders/${order.id}/photo`, photoFile);
                    if (uploaded && uploaded.stored_in_fs === false) {
                        photoWarning = ' Фото сохранено в резерв, но недоступно в файловой папке.';
                    }
                } catch (uploadError) {
                    photoWarning = ` Фото не загрузилось: ${uploadError?.message || 'ошибка сервера'}.`;
                }
            }

            showToast(`Заказ ${order.order_number} создан!${photoWarning}`, photoWarning ? 'warning' : 'success');
            window.location.hash = `#/orders/${order.id}`;
        } catch (error) {
            showToast(error.message || 'Ошибка создания заказа', 'error');
        } finally {
            setIsSubmitting(false);
        }
    }

    const designers = users.filter((user) => user.role === 'designer');
    const masters = users.filter((user) => user.role === 'master');
    const assistants = users.filter((user) => user.role === 'assistant');

    return (
        <>
            <div className="page-header">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => { window.location.hash = '#/orders'; }}>
                    ← Назад
                </button>
                <h1 className="page-title">Новый заказ</h1>
                <div />
            </div>

            <div className="px-4 pb-8">
                {isLoading ? (
                    <div className="flex justify-center py-16"><div className="spinner" /></div>
                ) : (
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="card">
                            <h3 className="font-bold mb-3 text-gray-700">Клиент</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="input-label" htmlFor="client-name">Имя клиента</label>
                                    <input id="client-name" type="text" className="input" required placeholder="ФИО или название компании" value={clientName} onChange={(event) => setClientName(event.target.value)} />
                                </div>
                                <div>
                                    <label className="input-label" htmlFor="client-phone">Телефон</label>
                                    <input id="client-phone" type="tel" className="input" placeholder="+996..." value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
                                </div>
                                <div>
                                    <label className="input-label" htmlFor="client-type">Тип</label>
                                    <select id="client-type" className="input" value={clientType} onChange={(event) => setClientType(event.target.value)}>
                                        <option value="retail">Розница</option>
                                        <option value="dealer">Дилер</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-gray-700">Услуги в заказе</h3>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addItem('')}>+ Добавить</button>
                            </div>

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
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => {
                                            const service = getService(item.service_id);
                                            const line = calcLine(item, service, clientType);
                                            return (
                                                <tr key={item.id}>
                                                    <td>
                                                        <select className="input" value={item.service_id} onChange={(event) => updateItem(item.id, { service_id: event.target.value })}>
                                                            <option value="">Выберите услугу</option>
                                                            {services.map((serviceOption) => (
                                                                <option key={serviceOption.id} value={serviceOption.id}>
                                                                    {serviceOption.name_ru} ({serviceOption.price_retail} сом/{serviceOption.unit})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input type="number" className="input" step="0.01" min="0" disabled={!line.areaRequired} value={item.width} placeholder="м" onChange={(event) => updateItem(item.id, { width: event.target.value })} />
                                                    </td>
                                                    <td>
                                                        <input type="number" className="input" step="0.01" min="0" disabled={!line.areaRequired} value={item.height} placeholder="м" onChange={(event) => updateItem(item.id, { height: event.target.value })} />
                                                    </td>
                                                    <td>
                                                        <input type="number" className="input" step="0.1" min="0.1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} />
                                                    </td>
                                                    <td><div className="input bg-gray-50">{formatCurrency(line.unitPrice)}</div></td>
                                                    <td><div className="input bg-blue-50 font-bold text-blue-800">{formatCurrency(line.lineTotal)}</div></td>
                                                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>✕</button></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                                <span className="text-gray-500">Итого по заказу</span>
                                <span className="font-bold text-lg">{formatCurrency(orderTotal)}</span>
                            </div>
                        </div>

                        <div className="card">
                            <h3 className="font-bold mb-3 text-gray-700">Назначение</h3>
                            <div className="space-y-3">
                                <UserSelect id="sel-designer" label="Дизайнер" users={designers} value={assignedDesigner} onChange={setAssignedDesigner} />
                                <UserSelect id="sel-master" label="Мастер" users={masters} value={assignedMaster} onChange={setAssignedMaster} />
                                <UserSelect id="sel-assistant" label="Помощник" users={assistants} value={assignedAssistant} onChange={setAssignedAssistant} />
                            </div>
                        </div>

                        <div className="card">
                            <h3 className="font-bold mb-3 text-gray-700">Дополнительно</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="input-label" htmlFor="deadline">Срок сдачи</label>
                                    <input id="deadline" type="date" className="input" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                                </div>
                                <div>
                                    <label className="input-label" htmlFor="order-photo">Фото заказа</label>
                                    <input id="order-photo" type="file" className="input" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
                                </div>
                                <div>
                                    <label className="input-label" htmlFor="notes">Примечание</label>
                                    <textarea id="notes" className="input" rows="2" placeholder="Комментарий к заказу..." value={notes} onChange={(event) => setNotes(event.target.value)} />
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={isSubmitting}>
                            {isSubmitting ? 'Создание...' : 'Создать заказ'}
                        </button>
                    </form>
                )}
            </div>
        </>
    );
}

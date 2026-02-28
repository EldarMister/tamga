import { api } from '../api.js';
import { showToast } from '../components/toast.js';
import { formatCurrency } from '../utils.js';

let services = [];
let users = [];
let items = [];

function isAreaUnit(unit) {
    if (!unit) return false;
    const u = unit.toLowerCase().replace(/\s+/g, '');
    return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
}

function addItem(defaultServiceId = '') {
    items.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        service_id: defaultServiceId,
        width: '',
        height: '',
        quantity: '1',
    });
}

function getService(id) {
    return services.find(s => s.id === parseInt(id));
}

function calcLine(item, svc, clientType) {
    if (!svc) return { unitPrice: 0, lineTotal: 0, areaRequired: false };
    const unitPrice = (clientType === 'dealer' && svc.price_dealer > 0) ? svc.price_dealer : svc.price_retail;
    const qty = parseFloat(item.quantity) || 0;
    const areaRequired = isAreaUnit(svc.unit);

    if (areaRequired) {
        const w = parseFloat(item.width) || 0;
        const h = parseFloat(item.height) || 0;
        const area = w * h;
        return { unitPrice, lineTotal: area * qty * unitPrice, areaRequired };
    }

    return { unitPrice, lineTotal: qty * unitPrice, areaRequired };
}

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-sm btn-secondary" id="back-btn">\u2190 Назад</button>
            <h1 class="page-title">Новый заказ</h1>
            <div></div>
        </div>
        <div class="px-4 pb-8">
            <form id="order-form" class="space-y-4">
                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Клиент</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Имя клиента</label>
                            <input type="text" class="input" name="client_name" required placeholder="ФИО или название компании">
                        </div>
                        <div>
                            <label class="input-label">Телефон</label>
                            <input type="tel" class="input" name="client_phone" placeholder="+996...">
                        </div>
                        <div>
                            <label class="input-label">Тип</label>
                            <select class="input" name="client_type" id="client-type">
                                <option value="retail">Розница</option>
                                <option value="dealer">Дилер</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-bold text-gray-700">Услуги в заказе</h3>
                        <button type="button" class="btn btn-secondary btn-sm" id="add-item-btn">+ Добавить</button>
                    </div>

                    <div class="order-items-wrap">
                        <table class="order-items-table">
                            <thead>
                                <tr>
                                    <th>Услуга</th>
                                    <th>Ширина</th>
                                    <th>Высота</th>
                                    <th>Кол-во</th>
                                    <th>Цена</th>
                                    <th>Итог</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="items-body"></tbody>
                        </table>
                    </div>

                    <div class="mt-4 flex items-center justify-between">
                        <span class="text-gray-500">Итого по заказу</span>
                        <span class="font-bold text-lg" id="order-total">0 сом</span>
                    </div>
                </div>

                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Назначение</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Дизайнер</label>
                            <select class="input" name="assigned_designer" id="sel-designer">
                                <option value="">Не назначен</option>
                            </select>
                        </div>
                        <div>
                            <label class="input-label">Мастер</label>
                            <select class="input" name="assigned_master" id="sel-master">
                                <option value="">Не назначен</option>
                            </select>
                        </div>
                        <div>
                            <label class="input-label">Помощник</label>
                            <select class="input" name="assigned_assistant" id="sel-assistant">
                                <option value="">Не назначен</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Дополнительно</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Срок сдачи</label>
                            <input type="date" class="input" name="deadline">
                        </div>
                        <div>
                            <label class="input-label">Фото заказа</label>
                            <input type="file" class="input" id="order-photo" accept="image/*">
                        </div>
                        <div>
                            <label class="input-label">Примечание</label>
                            <textarea class="input" name="notes" rows="2" placeholder="Комментарий к заказу..."></textarea>
                        </div>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary btn-block btn-lg" id="submit-btn">Создать заказ</button>
            </form>
        </div>
    `;

    document.getElementById('back-btn').onclick = () => { window.location.hash = '#/orders'; };

    try {
        const [svcData, usersData] = await Promise.all([
            api.get('/api/pricelist'),
            api.get('/api/users').catch(() => []),
        ]);
        services = svcData || [];
        users = usersData || [];
    } catch {
        services = [];
        users = [];
    }

    // Pick up pre-fill from calculator (if any)
    const prefillRaw = sessionStorage.getItem('calc_prefill');
    if (prefillRaw) {
        sessionStorage.removeItem('calc_prefill');
        try {
            const pf = JSON.parse(prefillRaw);
            items = [{
                id: `calc_${Date.now()}`,
                service_id: pf.service_id || '',
                width: pf.width || '',
                height: pf.height || '',
                quantity: pf.quantity || '1',
            }];
            if (pf.client_type) {
                const ctSel = document.querySelector('[name="client_type"]');
                if (ctSel) ctSel.value = pf.client_type;
            }
        } catch { /* ignore malformed prefill */ }
    }

    if (items.length === 0) {
        addItem(services[0]?.id || '');
    }

    const designers = users.filter(u => u.role === 'designer');
    const masters = users.filter(u => u.role === 'master');
    const assistants = users.filter(u => u.role === 'assistant');

    populateUserSelect('sel-designer', designers);
    populateUserSelect('sel-master', masters);
    populateUserSelect('sel-assistant', assistants);

    renderItems();

    document.getElementById('add-item-btn').onclick = () => {
        addItem('');
        renderItems();
    };

    document.getElementById('order-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.textContent = 'Создание...';

        try {
            const clientType = form.client_type.value;
            const payloadItems = [];

            for (const item of items) {
                if (!item.service_id) continue;
                const svc = getService(item.service_id);
                if (!svc) continue;

                const qty = parseFloat(item.quantity);
                if (!qty || qty <= 0) {
                    throw new Error('Проверьте количество');
                }

                const areaRequired = isAreaUnit(svc.unit);
                const width = areaRequired ? parseFloat(item.width) : null;
                const height = areaRequired ? parseFloat(item.height) : null;
                if (areaRequired && (!width || !height)) {
                    throw new Error('Нужны ширина и высота для услуг в м²');
                }

                payloadItems.push({
                    service_id: parseInt(item.service_id),
                    quantity: qty,
                    width: width || null,
                    height: height || null,
                    options: {},
                });
            }

            if (payloadItems.length === 0) {
                throw new Error('Добавьте хотя бы одну услугу');
            }

            const order = {
                client_name: form.client_name.value.trim(),
                client_phone: form.client_phone.value.trim(),
                client_type: clientType,
                items: payloadItems,
                notes: form.notes.value.trim(),
                deadline: form.deadline.value || null,
                assigned_designer: form.assigned_designer.value ? parseInt(form.assigned_designer.value) : null,
                assigned_master: form.assigned_master.value ? parseInt(form.assigned_master.value) : null,
                assigned_assistant: form.assigned_assistant.value ? parseInt(form.assigned_assistant.value) : null,
            };

            const result = await api.post('/api/orders', order);
            if (result) {
                const photoInput = document.getElementById('order-photo');
                let photoWarning = '';
                if (photoInput.files[0]) {
                    try {
                        const uploaded = await api.upload(`/api/orders/${result.id}/photo`, photoInput.files[0]);
                        if (uploaded && uploaded.stored_in_fs === false) {
                            photoWarning = ' Фото сохранено в резерв, но недоступно в файловой папке.';
                        }
                    } catch (uploadErr) {
                        photoWarning = ` Фото не загрузилось: ${uploadErr?.message || 'ошибка сервера'}.`;
                    }
                }
                const msg = `Заказ ${result.order_number} создан!${photoWarning}`;
                showToast(msg, photoWarning ? 'warning' : 'success');
                window.location.hash = `#/orders/${result.id}`;
            }
        } catch (err) {
            if (err.message) showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Создать заказ';
        }
    };
}

function renderItems() {
    const tbody = document.getElementById('items-body');
    const clientType = document.getElementById('client-type').value;

    tbody.innerHTML = items.map(item => {
        const svc = getService(item.service_id);
        const line = calcLine(item, svc, clientType);
        const areaRequired = line.areaRequired;
        const unitPrice = line.unitPrice;
        const lineTotal = line.lineTotal;

        return `
            <tr data-id="${item.id}">
                <td>
                    <select class="input item-service" data-id="${item.id}">
                        <option value="">Выберите услугу</option>
                        ${services.map(s => `
                            <option value="${s.id}" ${String(s.id) === String(item.service_id) ? 'selected' : ''}>
                                ${s.name_ru} (${s.price_retail} сом/${s.unit})
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td>
                    <input type="number" class="input item-width" data-id="${item.id}" step="0.01" min="0" ${areaRequired ? '' : 'disabled'} value="${item.width ?? ''}" placeholder="м">
                </td>
                <td>
                    <input type="number" class="input item-height" data-id="${item.id}" step="0.01" min="0" ${areaRequired ? '' : 'disabled'} value="${item.height ?? ''}" placeholder="м">
                </td>
                <td>
                    <input type="number" class="input item-qty" data-id="${item.id}" step="0.1" min="0.1" value="${item.quantity}">
                </td>
                <td>
                    <div class="input bg-gray-50 item-price" data-id="${item.id}">${formatCurrency(unitPrice)}</div>
                </td>
                <td>
                    <div class="input bg-blue-50 font-bold text-blue-800 item-total" data-id="${item.id}">${formatCurrency(lineTotal)}</div>
                </td>
                <td>
                    <button type="button" class="btn btn-ghost btn-sm item-remove" data-id="${item.id}">✕</button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.item-service').forEach(el => {
        el.onchange = (e) => {
            const item = items.find(i => i.id === e.target.dataset.id);
            if (!item) return;
            item.service_id = e.target.value;
            renderItems();
        };
    });

    tbody.querySelectorAll('.item-width').forEach(el => {
        el.oninput = (e) => {
            const item = items.find(i => i.id === e.target.dataset.id);
            if (!item) return;
            item.width = e.target.value;
            updateTotals();
        };
    });

    tbody.querySelectorAll('.item-height').forEach(el => {
        el.oninput = (e) => {
            const item = items.find(i => i.id === e.target.dataset.id);
            if (!item) return;
            item.height = e.target.value;
            updateTotals();
        };
    });

    tbody.querySelectorAll('.item-qty').forEach(el => {
        el.oninput = (e) => {
            const item = items.find(i => i.id === e.target.dataset.id);
            if (!item) return;
            item.quantity = e.target.value;
            updateTotals();
        };
    });

    tbody.querySelectorAll('.item-remove').forEach(el => {
        el.onclick = () => {
            items = items.filter(i => i.id !== el.dataset.id);
            if (items.length === 0) addItem(services[0]?.id || '');
            renderItems();
        };
    });

    document.getElementById('client-type').onchange = () => renderItems();
    updateTotals();
}

function updateTotals() {
    const clientType = document.getElementById('client-type').value;
    let total = 0;
    items.forEach(item => {
        const svc = getService(item.service_id);
        const line = calcLine(item, svc, clientType);
        total += line.lineTotal;
    });
    document.getElementById('order-total').textContent = formatCurrency(total);
}

function populateUserSelect(selectId, userList) {
    const sel = document.getElementById(selectId);
    userList.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.full_name;
        sel.appendChild(opt);
    });
}

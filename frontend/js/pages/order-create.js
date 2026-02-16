import { api } from '../api.js';
import { showToast } from '../components/toast.js';
import { formatCurrency } from '../utils.js';

let services = [];
let users = [];

export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-sm btn-secondary" id="back-btn">← Назад</button>
            <h1 class="page-title">Новый заказ</h1>
            <div></div>
        </div>
        <div class="px-4 pb-8">
            <form id="order-form" class="space-y-4">
                <!-- Client -->
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

                <!-- Service -->
                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Услуга</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Тип услуги</label>
                            <select class="input" id="service-select" name="service_id" required>
                                <option value="">Выберите услугу</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="input-label">Количество</label>
                                <input type="number" class="input" name="quantity" id="qty-input" step="0.1" min="0.1" required placeholder="0">
                            </div>
                            <div>
                                <label class="input-label">Ед. измерения</label>
                                <input type="text" class="input bg-gray-50" id="unit-display" readonly value="—">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="input-label">Цена за ед.</label>
                                <input type="number" class="input bg-gray-50" id="unit-price" readonly value="0">
                            </div>
                            <div>
                                <label class="input-label">Итого</label>
                                <div class="input bg-blue-50 font-bold text-blue-800 flex items-center" id="total-display">0 сом</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Assignment -->
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

                <!-- Extra -->
                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Дополнительно</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Срок сдачи</label>
                            <input type="date" class="input" name="deadline">
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

    // Load services and users
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

    // Populate service select
    const sel = document.getElementById('service-select');
    services.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name_ru} (${s.price_retail} сом/${s.unit})`;
        opt.dataset.retail = s.price_retail;
        opt.dataset.dealer = s.price_dealer;
        opt.dataset.unit = s.unit;
        sel.appendChild(opt);
    });

    // Populate user selects
    const designers = users.filter(u => u.role === 'designer');
    const masters = users.filter(u => u.role === 'master');
    const assistants = users.filter(u => u.role === 'assistant');

    populateUserSelect('sel-designer', designers);
    populateUserSelect('sel-master', masters);
    populateUserSelect('sel-assistant', assistants);

    // Price calculation
    const recalc = () => {
        const svc = services.find(s => s.id === parseInt(sel.value));
        if (!svc) return;
        const clientType = document.getElementById('client-type').value;
        const price = (clientType === 'dealer' && svc.price_dealer > 0) ? svc.price_dealer : svc.price_retail;
        document.getElementById('unit-price').value = price;
        document.getElementById('unit-display').value = svc.unit;
        const qty = parseFloat(document.getElementById('qty-input').value) || 0;
        document.getElementById('total-display').textContent = formatCurrency(qty * price);
    };

    sel.onchange = recalc;
    document.getElementById('qty-input').oninput = recalc;
    document.getElementById('client-type').onchange = recalc;

    // Submit
    document.getElementById('order-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.textContent = 'Создание...';

        try {
            const svcId = parseInt(form.service_id.value);
            const qty = parseFloat(form.quantity.value);
            const svc = services.find(s => s.id === svcId);
            if (!svc || !qty) throw new Error('Выберите услугу и количество');

            const order = {
                client_name: form.client_name.value.trim(),
                client_phone: form.client_phone.value.trim(),
                client_type: form.client_type.value,
                items: [{ service_id: svcId, quantity: qty, options: {} }],
                notes: form.notes.value.trim(),
                deadline: form.deadline.value || null,
                assigned_designer: form.assigned_designer.value ? parseInt(form.assigned_designer.value) : null,
                assigned_master: form.assigned_master.value ? parseInt(form.assigned_master.value) : null,
                assigned_assistant: form.assigned_assistant.value ? parseInt(form.assigned_assistant.value) : null,
            };

            const result = await api.post('/api/orders', order);
            if (result) {
                showToast(`Заказ ${result.order_number} создан!`, 'success');
                window.location.hash = `#/orders/${result.id}`;
            }
        } catch (err) {
            // showToast handles API errors
        } finally {
            btn.disabled = false;
            btn.textContent = 'Создать заказ';
        }
    };
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

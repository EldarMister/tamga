import { api } from '../api.js';
import { formatCurrency, debounce } from '../utils.js';
import { showToast } from '../components/toast.js';

// ─── Module state (persists across re-renders within session) ────────────────
let services = [];
let calc = {
    service_id: '',
    client_type: 'retail',
    width: '',
    height: '',
    copies: '1',
    quantity: '1',
    options: {},
};

// ─── Unit helpers ─────────────────────────────────────────────────────────────
function isAreaUnit(unit) {
    if (!unit) return false;
    const u = unit.toLowerCase().replace(/\s+/g, '');
    return u.includes('м2') || u.includes('м²') || u.includes('m2') || u.includes('m²');
}

function isSheetUnit(unit) {
    if (!unit) return false;
    const u = unit.toLowerCase();
    return u.includes('sheet') || u.includes('лист');
}

// ─── Options parser ───────────────────────────────────────────────────────────
// Handles: null, {}, [], {"key":{"label":"..","price":50}}, [{"key":"..","label":"..","price":50}]
function parseOptions(raw) {
    if (!raw) return [];
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(obj)) {
            return obj.filter(o => o && o.key).map(o => ({
                key: String(o.key),
                label: o.label || o.key,
                price: Number(o.price) || 0,
            }));
        }
        if (typeof obj === 'object') {
            return Object.entries(obj)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([key, val]) => ({
                    key,
                    label: typeof val === 'object' ? (val.label || key) : key,
                    price: typeof val === 'object' ? (Number(val.price) || 0) : (Number(val) || 0),
                }));
        }
    } catch { /* ignore */ }
    return [];
}

function getService(id) {
    return services.find(s => String(s.id) === String(id));
}

// ─── Core calculation ─────────────────────────────────────────────────────────
function compute() {
    const svc = getService(calc.service_id);
    if (!svc) return { unitPrice: 0, quantity: 0, area: null, baseCost: 0, optionsCost: 0, total: 0, options: [] };

    const unitPrice = (calc.client_type === 'dealer' && svc.price_dealer > 0)
        ? svc.price_dealer
        : svc.price_retail;

    const options = parseOptions(svc.options);
    let quantity = 0;
    let area = null;
    let baseCost = 0;

    if (isAreaUnit(svc.unit)) {
        const w = Math.max(0, parseFloat(calc.width) || 0);
        const h = Math.max(0, parseFloat(calc.height) || 0);
        const copies = Math.max(1, parseInt(calc.copies) || 1);
        area = Math.round(w * h * 100) / 100;
        quantity = Math.round(area * copies * 100) / 100;
        baseCost = quantity * unitPrice;
    } else {
        quantity = Math.max(0, parseFloat(calc.quantity) || 0);
        baseCost = quantity * unitPrice;
    }

    let optionsCost = 0;
    options.forEach(opt => {
        if (calc.options[opt.key] && opt.price > 0) {
            optionsCost += opt.price * (quantity || 1);
        }
    });

    return { unitPrice, quantity, area, baseCost, optionsCost, total: baseCost + optionsCost, options, svc };
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function render(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Калькулятор</h1>
        </div>
        <div class="flex justify-center py-16"><div class="spinner"></div></div>
    `;

    try {
        const data = await api.get('/api/pricelist');
        services = data || [];
        if (services.length > 0 && !calc.service_id) {
            calc.service_id = String(services[0].id);
        }
        renderCalc(container);
    } catch {
        container.innerHTML = `
            <div class="page-header"><h1 class="page-title">Калькулятор</h1></div>
            <div class="text-center text-red-500 py-16">Ошибка загрузки услуг</div>
        `;
    }
}

// ─── Full re-render (on service / client_type change) ────────────────────────
function renderCalc(container) {
    const svc = getService(calc.service_id);
    const area = isAreaUnit(svc?.unit);
    const sheet = isSheetUnit(svc?.unit);
    const result = compute();
    const options = result.options || [];

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Калькулятор</h1>
        </div>
        <div class="px-4 pb-8 space-y-4">

            <!-- Услуга + тип клиента -->
            <div class="card space-y-3">
                <div>
                    <label class="input-label">Услуга</label>
                    <select class="input" id="calc-service">
                        ${services.map(s => `
                            <option value="${s.id}" ${String(s.id) === String(calc.service_id) ? 'selected' : ''}>
                                ${s.name_ru} (${s.unit})
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div>
                    <label class="input-label">Тип клиента</label>
                    <div class="flex gap-2">
                        <button class="btn flex-1 ${calc.client_type === 'retail' ? 'btn-primary' : 'btn-secondary'}" id="btn-retail">Розница</button>
                        <button class="btn flex-1 ${calc.client_type === 'dealer' ? 'btn-primary' : 'btn-secondary'}" id="btn-dealer">Дилер</button>
                    </div>
                </div>
            </div>

            <!-- Параметры ввода -->
            <div class="card space-y-3">
                <h3 class="font-bold text-sm text-gray-400 uppercase">Параметры</h3>
                ${area ? `
                    <div class="grid grid-cols-3 gap-2">
                        <div>
                            <label class="input-label">Ширина (м)</label>
                            <input type="number" class="input" id="calc-width"
                                value="${calc.width}" placeholder="0.00" step="0.01" min="0">
                        </div>
                        <div>
                            <label class="input-label">Высота (м)</label>
                            <input type="number" class="input" id="calc-height"
                                value="${calc.height}" placeholder="0.00" step="0.01" min="0">
                        </div>
                        <div>
                            <label class="input-label">Кол-во (шт)</label>
                            <input type="number" class="input" id="calc-copies"
                                value="${calc.copies}" placeholder="1" step="1" min="1">
                        </div>
                    </div>
                    <div class="text-sm text-gray-500">
                        Площадь: <span class="font-medium" id="calc-area-display">${result.area ?? 0} м²</span>
                        &nbsp;×&nbsp;<span id="calc-copies-display">${calc.copies || 1}</span> шт
                        = <span class="font-medium" id="calc-qty-display">${result.quantity} м²</span>
                    </div>
                ` : `
                    <div>
                        <label class="input-label">Количество (${svc?.unit || 'шт'})</label>
                        <input type="number" class="input" id="calc-qty"
                            value="${calc.quantity}" placeholder="1" step="1" min="0">
                        <div id="calc-min-warn" class="${sheet && svc?.min_order && (parseFloat(calc.quantity) || 0) < svc.min_order && (parseFloat(calc.quantity) || 0) > 0 ? '' : 'hidden'} mt-1 text-sm text-orange-600 font-medium">
                            ⚠ Минимальный заказ: ${svc?.min_order ?? ''} ${svc?.unit ?? ''}
                        </div>
                    </div>
                `}
            </div>

            <!-- Опции -->
            ${options.length > 0 ? `
                <div class="card space-y-2">
                    <h3 class="font-bold text-sm text-gray-400 uppercase">Опции</h3>
                    ${options.map(opt => `
                        <label class="flex items-center gap-3 cursor-pointer py-1">
                            <input type="checkbox" class="calc-option"
                                data-key="${opt.key}" ${calc.options[opt.key] ? 'checked' : ''}>
                            <span class="flex-1">${opt.label}</span>
                            ${opt.price > 0 ? `<span class="text-sm text-gray-500">+ ${formatCurrency(opt.price)} / ед.</span>` : ''}
                        </label>
                    `).join('')}
                </div>
            ` : ''}

            <!-- Результат -->
            <div class="card" id="calc-result-card">
                ${renderBreakdown(result, svc, area)}
            </div>

            <!-- CTA -->
            <button class="btn btn-primary btn-block btn-lg" id="calc-to-order">
                Создать заказ из расчёта →
            </button>
        </div>
    `;

    attachHandlers(container);
}

// ─── Result breakdown HTML (re-used by partial update) ───────────────────────
function renderBreakdown(result, svc, area) {
    return `
        <h3 class="font-bold text-sm text-gray-400 uppercase mb-3">Итог</h3>
        <div class="space-y-2 text-sm">
            <div class="flex justify-between">
                <span class="text-gray-500">Цена за единицу</span>
                <span class="font-medium">${formatCurrency(result.unitPrice)} / ${svc?.unit || 'ед.'}</span>
            </div>
            ${area ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">Площадь × кол-во</span>
                    <span>${result.quantity} м²</span>
                </div>
            ` : `
                <div class="flex justify-between">
                    <span class="text-gray-500">Количество</span>
                    <span>${result.quantity} ${svc?.unit || ''}</span>
                </div>
            `}
            <div class="flex justify-between">
                <span class="text-gray-500">Стоимость услуги</span>
                <span>${formatCurrency(result.baseCost)}</span>
            </div>
            ${result.optionsCost > 0 ? `
                <div class="flex justify-between">
                    <span class="text-gray-500">Опции</span>
                    <span>+ ${formatCurrency(result.optionsCost)}</span>
                </div>
            ` : ''}
            <div class="border-t pt-3 mt-1 flex items-center justify-between">
                <span class="font-bold text-base">Итого</span>
                <span class="font-bold text-2xl text-blue-700">${formatCurrency(result.total)}</span>
            </div>
        </div>
    `;
}

// ─── Partial update — only result card, inputs keep focus ────────────────────
function updateResult() {
    const svc = getService(calc.service_id);
    const area = isAreaUnit(svc?.unit);
    const sheet = isSheetUnit(svc?.unit);
    const result = compute();

    // Update result card
    const card = document.getElementById('calc-result-card');
    if (card) card.innerHTML = renderBreakdown(result, svc, area);

    // Update area info line
    const areaDisplay = document.getElementById('calc-area-display');
    const copiesDisplay = document.getElementById('calc-copies-display');
    const qtyDisplay = document.getElementById('calc-qty-display');
    if (areaDisplay) areaDisplay.textContent = `${result.area ?? 0} м²`;
    if (copiesDisplay) copiesDisplay.textContent = calc.copies || 1;
    if (qtyDisplay) qtyDisplay.textContent = `${result.quantity} м²`;

    // Update min_order warning
    const warn = document.getElementById('calc-min-warn');
    if (warn && sheet && svc?.min_order) {
        const qty = parseFloat(calc.quantity) || 0;
        warn.classList.toggle('hidden', qty === 0 || qty >= svc.min_order);
    }
}

// ─── Event handlers ───────────────────────────────────────────────────────────
function attachHandlers(container) {
    const svc = getService(calc.service_id);
    const area = isAreaUnit(svc?.unit);

    // Service change → full re-render
    document.getElementById('calc-service').onchange = (e) => {
        calc.service_id = e.target.value;
        calc.options = {};
        calc.width = '';
        calc.height = '';
        calc.copies = '1';
        calc.quantity = '1';
        renderCalc(container);
    };

    // Client type toggle → full re-render (prices change)
    document.getElementById('btn-retail').onclick = () => {
        if (calc.client_type === 'retail') return;
        calc.client_type = 'retail';
        renderCalc(container);
    };
    document.getElementById('btn-dealer').onclick = () => {
        if (calc.client_type === 'dealer') return;
        calc.client_type = 'dealer';
        renderCalc(container);
    };

    // Dimension / quantity inputs → debounced partial update
    const debouncedUpdate = debounce(updateResult, 250);

    if (area) {
        document.getElementById('calc-width').oninput = (e) => {
            calc.width = e.target.value;
            debouncedUpdate();
        };
        document.getElementById('calc-height').oninput = (e) => {
            calc.height = e.target.value;
            debouncedUpdate();
        };
        document.getElementById('calc-copies').oninput = (e) => {
            calc.copies = String(Math.max(1, parseInt(e.target.value) || 1));
            debouncedUpdate();
        };
    } else {
        document.getElementById('calc-qty').oninput = (e) => {
            calc.quantity = e.target.value;
            debouncedUpdate();
        };
    }

    // Options → immediate partial update
    document.querySelectorAll('.calc-option').forEach(cb => {
        cb.onchange = (e) => {
            calc.options[e.target.dataset.key] = e.target.checked;
            updateResult();
        };
    });

    // Create order from calculation
    document.getElementById('calc-to-order').onclick = () => {
        if (!svc) {
            showToast('Выберите услугу', 'warning');
            return;
        }
        const result = compute();
        if (result.total === 0) {
            showToast('Укажите параметры расчёта', 'warning');
            return;
        }
        // Pass prefill data via sessionStorage — order-create picks it up
        const prefill = {
            service_id: String(calc.service_id),
            client_type: calc.client_type,
            width: calc.width || null,
            height: calc.height || null,
            quantity: area ? (calc.copies || '1') : calc.quantity,
            options: calc.options,
        };
        sessionStorage.setItem('calc_prefill', JSON.stringify(prefill));
        window.location.hash = '#/orders/new';
    };
}

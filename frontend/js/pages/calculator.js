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

function parseOptionsObject(raw) {
    if (!raw) return {};
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch {
        return {};
    }
}

function getService(id) {
    return services.find(s => String(s.id) === String(id));
}

function canonicalServiceType(svc) {
    const code = String(svc?.code || '').toLowerCase();
    const category = String(svc?.category || '').toLowerCase();
    const name = String(svc?.name_ru || '').toLowerCase();
    const source = `${code} ${category} ${name}`;

    if (source.includes('banner') || source.includes('баннер')) return 'banner';
    if (source.includes('samokley') || source.includes('vinyl') || source.includes('самоклей')) return 'samokleyka';
    if (source.includes('setka') || source.includes('mesh') || source.includes('сетк')) return 'setka';
    if (source.includes('stend') || source.includes('stand') || source.includes('forex') || source.includes('стенд')) return 'stend';
    if (source.includes('letters') || source.includes('букв')) return 'letters';
    if (source.includes('tablich') || source.includes('table') || source.includes('таблич')) return 'tablichka';
    if (source.includes('menu')) return 'menu';
    if (source.includes('vizit') || source.includes('business_card') || source.includes('визит')) return 'vizitka';
    if (source.includes('dtf')) return 'dtf';
    return '';
}

function isTwoSideKey(key) {
    const value = String(key || '').toLowerCase();
    return /(two|2|double|двух|двуст|артын|артынa|артына|артынан)/.test(value);
}

function isOptionAllowedForClient(rawOptions, key, clientType) {
    const meta = rawOptions?.[key];
    if (!meta || typeof meta !== 'object') return true;
    if (!Array.isArray(meta.client_types) || meta.client_types.length === 0) return true;
    return meta.client_types.includes(clientType);
}

// ─── Core calculation ─────────────────────────────────────────────────────────
function compute() {
    const svc = getService(calc.service_id);
    if (!svc) return { unitPrice: 0, quantity: 0, area: null, baseCost: 0, optionsCost: 0, total: 0, options: [] };

    const defaultUnitPrice = (calc.client_type === 'dealer' && svc.price_dealer > 0)
        ? svc.price_dealer
        : svc.price_retail;

    const options = parseOptions(svc.options);
    const rawOptions = parseOptionsObject(svc.options);
    const serviceType = canonicalServiceType(svc);
    const areaUnit = isAreaUnit(svc.unit);
    let unitPrice = defaultUnitPrice;
    let quantity = 0;
    let area = null;
    let baseCost = 0;

    if (areaUnit) {
        const w = Math.max(0, parseFloat(calc.width) || 0);
        const h = Math.max(0, parseFloat(calc.height) || 0);
        const copies = Math.max(1, parseInt(calc.copies) || 1);
        const areaRaw = w * h;

        area = Math.round(areaRaw * 100) / 100;
        quantity = Math.round(areaRaw * copies * 100) / 100;

        if (calc.client_type === 'dealer') {
            if (serviceType === 'banner') {
                unitPrice = 300;
                baseCost = areaRaw * 300 * copies;
            } else if (serviceType === 'samokleyka') {
                unitPrice = 400;
                baseCost = areaRaw * 400 * copies;
            } else if (serviceType === 'setka') {
                unitPrice = 500;
                baseCost = areaRaw * 500 * copies;
            } else if (serviceType === 'stend') {
                unitPrice = 1600;
                baseCost = areaRaw * 1600 * copies;
            } else {
                baseCost = quantity * unitPrice;
            }
        } else {
            if (serviceType === 'banner') {
                const rate = areaRaw >= 10 ? 400 : 450;
                const oneItem = (areaRaw > 0 && areaRaw < 1) ? 400 : areaRaw * rate;
                unitPrice = (areaRaw > 0 && areaRaw < 1) ? 400 : rate;
                baseCost = oneItem * copies;
            } else if (serviceType === 'samokleyka') {
                const rate = areaRaw >= 10 ? 450 : 500;
                const oneItem = (areaRaw > 0 && areaRaw < 1) ? 400 : areaRaw * rate;
                unitPrice = (areaRaw > 0 && areaRaw < 1) ? 400 : rate;
                baseCost = oneItem * copies;
            } else if (serviceType === 'setka') {
                const rate = areaRaw >= 10 ? 650 : 700;
                const oneItem = (areaRaw > 0 && areaRaw < 1) ? 500 : areaRaw * rate;
                unitPrice = (areaRaw > 0 && areaRaw < 1) ? 500 : rate;
                baseCost = oneItem * copies;
            } else if (serviceType === 'stend') {
                unitPrice = 2000;
                baseCost = areaRaw * 2000 * copies;
            } else {
                baseCost = quantity * unitPrice;
            }
        }
    } else {
        quantity = Math.max(0, parseFloat(calc.quantity) || 0);

        if (serviceType === 'dtf') {
            const twoSide = Object.entries(calc.options || {}).some(([key, checked]) => checked && isTwoSideKey(key));
            unitPrice = twoSide ? (quantity >= 10 ? 400 : 500) : 350;
            baseCost = unitPrice * quantity;
        } else if (serviceType === 'tablichka') {
            unitPrice = 350;
            baseCost = unitPrice * quantity;
        } else if (serviceType === 'menu') {
            unitPrice = 200;
            baseCost = unitPrice * quantity;
        } else if (serviceType === 'vizitka') {
            const preset = rawOptions?.vizitka_prices || {};
            const onePrice = Number(preset.one) || 4;
            const twoPrice = Number(preset.two) || 6;
            const twoSide = Object.entries(calc.options || {}).some(([key, checked]) => checked && isTwoSideKey(key));
            unitPrice = twoSide ? twoPrice : onePrice;
            baseCost = unitPrice * quantity;
        } else {
            baseCost = quantity * unitPrice;
        }
    }

    let optionsCost = 0;
    options.forEach(opt => {
        if (!calc.options[opt.key] || opt.price <= 0) return;
        if (!isOptionAllowedForClient(rawOptions, opt.key, calc.client_type)) return;
        if (serviceType === 'dtf' && isTwoSideKey(opt.key)) return;
        if (serviceType === 'vizitka' && opt.key === 'vizitka_prices') return;
        optionsCost += opt.price * (quantity > 0 ? quantity : 0);
    });

    const total = Math.round(baseCost + optionsCost);
    return { unitPrice, quantity, area, baseCost, optionsCost, total, options, svc };
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

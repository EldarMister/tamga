import { useEffect, useMemo, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { formatCurrency } from '@legacy/utils.js';

function isAreaUnit(unit) {
    if (!unit) return false;
    const normalized = String(unit).toLowerCase().replace(/\s+/g, '').replace(/\u00b2/g, '2');
    return normalized.includes('м2') || normalized.includes('m2');
}

function isSheetUnit(unit) {
    if (!unit) return false;
    const normalized = String(unit).toLowerCase();
    return normalized.includes('sheet') || normalized.includes('лист');
}

function parseOptions(raw) {
    if (!raw) return [];
    try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(value)) {
            return value.filter((item) => item && item.key).map((item) => ({
                key: String(item.key),
                label: item.label || item.key,
                price: Number(item.price) || 0,
            }));
        }
        if (typeof value === 'object') {
            return Object.entries(value)
                .filter(([, entry]) => entry !== null && entry !== undefined)
                .map(([key, entry]) => ({
                    key,
                    label: typeof entry === 'object' ? (entry.label || key) : key,
                    price: typeof entry === 'object' ? (Number(entry.price) || 0) : (Number(entry) || 0),
                }));
        }
    } catch {
        return [];
    }
    return [];
}

function parseOptionsObject(raw) {
    if (!raw) return {};
    try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function canonicalServiceType(service) {
    const source = `${String(service?.code || '').toLowerCase()} ${String(service?.category || '').toLowerCase()} ${String(service?.name_ru || '').toLowerCase()}`;
    const has = (...patterns) => patterns.some((pattern) => source.includes(pattern));

    if (has('banner', 'баннер')) return 'banner';
    if (has('samokley', 'vinyl', 'самоклей')) return 'samokleyka';
    if (has('setka', 'mesh', 'сетк')) return 'setka';
    if (has('stend', 'stand', 'forex', 'стенд')) return 'stend';
    if (has('letters', 'букв')) return 'letters';
    if (has('tablich', 'table', 'таблич')) return 'tablichka';
    if (has('menu', 'меню')) return 'menu';
    if (has('vizit', 'business_card', 'визит')) return 'vizitka';
    if (has('dtf')) return 'dtf';
    return '';
}

function isTwoSideKey(key) {
    const value = String(key || '').toLowerCase();
    return /(two|2|double|двух|двуст|артын|артына|артынан)/.test(value);
}

function isOptionAllowedForClient(rawOptions, key, clientType) {
    const meta = rawOptions?.[key];
    if (!meta || typeof meta !== 'object') return true;
    if (!Array.isArray(meta.client_types) || !meta.client_types.length) return true;
    return meta.client_types.includes(clientType);
}

function compute(calc, service) {
    if (!service) {
        return { unitPrice: 0, total: 0, baseCost: 0, optionsCost: 0, quantity: 0, area: null, options: [] };
    }

    const serviceType = canonicalServiceType(service);
    const options = parseOptions(service.options);
    const rawOptions = parseOptionsObject(service.options);
    const defaultUnitPrice = calc.client_type === 'dealer' && service.price_dealer > 0 ? service.price_dealer : service.price_retail;
    const areaUnit = isAreaUnit(service.unit);

    let unitPrice = defaultUnitPrice;
    let quantity = 0;
    let area = null;
    let baseCost = 0;

    if (areaUnit) {
        const width = Math.max(0, parseFloat(calc.width) || 0);
        const height = Math.max(0, parseFloat(calc.height) || 0);
        const copies = Math.max(1, parseInt(calc.copies, 10) || 1);
        const areaRaw = width * height;

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
        } else if (serviceType === 'banner') {
            const rate = areaRaw >= 10 ? 400 : 450;
            const oneItem = areaRaw > 0 && areaRaw < 1 ? 400 : areaRaw * rate;
            unitPrice = areaRaw > 0 && areaRaw < 1 ? 400 : rate;
            baseCost = oneItem * copies;
        } else if (serviceType === 'samokleyka') {
            const rate = areaRaw >= 10 ? 450 : 500;
            const oneItem = areaRaw > 0 && areaRaw < 1 ? 400 : areaRaw * rate;
            unitPrice = areaRaw > 0 && areaRaw < 1 ? 400 : rate;
            baseCost = oneItem * copies;
        } else if (serviceType === 'setka') {
            const rate = areaRaw >= 10 ? 650 : 700;
            const oneItem = areaRaw > 0 && areaRaw < 1 ? 500 : areaRaw * rate;
            unitPrice = areaRaw > 0 && areaRaw < 1 ? 500 : rate;
            baseCost = oneItem * copies;
        } else if (serviceType === 'stend') {
            unitPrice = 2000;
            baseCost = areaRaw * 2000 * copies;
        } else {
            baseCost = quantity * unitPrice;
        }
    } else if (serviceType === 'letters') {
        const letterHeightCm = Math.max(0, parseFloat(calc.letter_height_cm) || 0);
        const lettersCount = Math.max(0, parseInt(calc.letters_count, 10) || 0);
        quantity = lettersCount;
        unitPrice = 50;
        baseCost = letterHeightCm * 50 * lettersCount;
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
    options.forEach((option) => {
        if (!calc.options[option.key] || option.price <= 0) return;
        if (!isOptionAllowedForClient(rawOptions, option.key, calc.client_type)) return;
        if (serviceType === 'dtf' && isTwoSideKey(option.key)) return;
        if (serviceType === 'vizitka' && option.key === 'vizitka_prices') return;
        optionsCost += option.price * (quantity > 0 ? quantity : 0);
    });

    return {
        unitPrice,
        quantity,
        area,
        baseCost,
        optionsCost,
        total: Math.round(baseCost + optionsCost),
        options,
        areaUnit,
        serviceType,
    };
}

export default function CalculatorPage() {
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [calc, setCalc] = useState({
        service_id: '',
        client_type: 'retail',
        width: '',
        height: '',
        copies: '1',
        quantity: '1',
        letter_height_cm: '',
        letters_count: '1',
        options: {},
    });

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/pricelist');

        async function load() {
            setIsLoading(true);
            setError('');
            try {
                const rows = await api.get('/api/pricelist');
                if (!alive) return;
                const nextServices = rows || [];
                setServices(nextServices);
                if (nextServices.length) {
                    setCalc((current) => ({
                        ...current,
                        service_id: current.service_id || String(nextServices[0].id),
                    }));
                }
            } catch {
                if (alive) setError('Ошибка загрузки услуг');
            } finally {
                if (alive) setIsLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, []);

    const service = services.find((item) => String(item.id) === String(calc.service_id));
    const result = useMemo(() => compute(calc, service), [calc, service]);
    const sheetUnit = isSheetUnit(service?.unit);
    const minWarnVisible = !result.areaUnit && sheetUnit && service?.min_order && (parseFloat(calc.quantity) || 0) > 0 && (parseFloat(calc.quantity) || 0) < service.min_order;

    function setField(field, value) {
        setCalc((current) => ({ ...current, [field]: value }));
    }

    function handleServiceChange(serviceId) {
        setCalc((current) => ({
            ...current,
            service_id: serviceId,
            width: '',
            height: '',
            copies: '1',
            quantity: '1',
            letter_height_cm: '',
            letters_count: '1',
            options: {},
        }));
    }

    function handleOptionToggle(key, checked) {
        setCalc((current) => ({
            ...current,
            options: {
                ...current.options,
                [key]: checked,
            },
        }));
    }

    function createOrderFromCalc() {
        if (!service) {
            showToast('Выберите услугу', 'warning');
            return;
        }
        if (result.total === 0) {
            showToast('Укажите параметры расчёта', 'warning');
            return;
        }

        sessionStorage.setItem('calc_prefill', JSON.stringify({
            service_id: String(calc.service_id),
            client_type: calc.client_type,
            width: result.areaUnit ? calc.width || null : null,
            height: result.areaUnit ? calc.height || null : null,
            quantity: result.areaUnit ? (calc.copies || '1') : (result.serviceType === 'letters' ? (calc.letters_count || '1') : calc.quantity),
            options: calc.options,
        }));
        window.location.hash = '#/orders/new';
    }

    function renderBreakdown() {
        return (
            <>
                <h3 className="font-bold text-sm text-gray-400 uppercase mb-3">Итог</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Цена за единицу</span>
                        <span className="font-medium">{formatCurrency(result.unitPrice)} / {service?.unit || 'ед.'}</span>
                    </div>
                    {result.areaUnit ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Площадь × кол-во</span>
                            <span>{result.quantity} м²</span>
                        </div>
                    ) : result.serviceType === 'letters' ? (
                        <>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Высота буквы</span>
                                <span>{calc.letter_height_cm || 0} см</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Кол-во букв</span>
                                <span>{calc.letters_count || 0} шт</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Количество</span>
                            <span>{result.quantity} {service?.unit || ''}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-gray-500">Стоимость услуги</span>
                        <span>{formatCurrency(result.baseCost)}</span>
                    </div>
                    {result.optionsCost > 0 ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Опции</span>
                            <span>+ {formatCurrency(result.optionsCost)}</span>
                        </div>
                    ) : null}
                    <div className="border-t pt-3 mt-1 flex items-center justify-between">
                        <span className="font-bold text-base">Итого</span>
                        <span className="font-bold text-2xl text-blue-700">{formatCurrency(result.total)}</span>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Калькулятор</h1>
            </div>

            <div className="px-4 pb-8 space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-16"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-16">{error}</div>
                ) : (
                    <>
                        <div className="card space-y-3">
                            <div>
                                <label className="input-label" htmlFor="calc-service">Услуга</label>
                                <select id="calc-service" className="input" value={calc.service_id} onChange={(event) => handleServiceChange(event.target.value)}>
                                    {services.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name_ru} ({item.unit})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="input-label">Тип клиента</label>
                                <div className="flex gap-2">
                                    <button type="button" className={`btn flex-1 ${calc.client_type === 'retail' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setField('client_type', 'retail')}>Розница</button>
                                    <button type="button" className={`btn flex-1 ${calc.client_type === 'dealer' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setField('client_type', 'dealer')}>Дилер</button>
                                </div>
                            </div>
                        </div>

                        <div className="card space-y-3">
                            <h3 className="font-bold text-sm text-gray-400 uppercase">Параметры</h3>
                            {result.areaUnit ? (
                                <>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="input-label">Ширина (м)</label>
                                            <input type="number" className="input" min="0" step="0.01" value={calc.width} placeholder="0.00" onChange={(event) => setField('width', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className="input-label">Высота (м)</label>
                                            <input type="number" className="input" min="0" step="0.01" value={calc.height} placeholder="0.00" onChange={(event) => setField('height', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className="input-label">Кол-во (шт)</label>
                                            <input type="number" className="input" min="1" step="1" value={calc.copies} placeholder="1" onChange={(event) => setField('copies', String(Math.max(1, parseInt(event.target.value, 10) || 1)))} />
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        Площадь: <span className="font-medium">{result.area ?? 0} м²</span> × <span>{calc.copies || 1}</span> шт = <span className="font-medium">{result.quantity} м²</span>
                                    </div>
                                </>
                            ) : result.serviceType === 'letters' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="input-label">Высота буквы (см)</label>
                                        <input type="number" className="input" min="0" step="1" value={calc.letter_height_cm} placeholder="40" onChange={(event) => setField('letter_height_cm', event.target.value)} />
                                    </div>
                                    <div>
                                        <label className="input-label">Кол-во букв</label>
                                        <input type="number" className="input" min="0" step="1" value={calc.letters_count} placeholder="7" onChange={(event) => setField('letters_count', event.target.value)} />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="input-label">Количество ({service?.unit || 'шт'})</label>
                                    <input type="number" className="input" min="0" step="1" value={calc.quantity} placeholder="1" onChange={(event) => setField('quantity', event.target.value)} />
                                    {minWarnVisible ? <div className="mt-1 text-sm text-orange-600 font-medium">⚠ Минимальный заказ: {service?.min_order} {service?.unit}</div> : null}
                                </div>
                            )}
                        </div>

                        {result.options.length > 0 ? (
                            <div className="card space-y-2">
                                <h3 className="font-bold text-sm text-gray-400 uppercase">Опции</h3>
                                {result.options.map((option) => (
                                    <label key={option.key} className="flex items-center gap-3 cursor-pointer py-1">
                                        <input type="checkbox" checked={Boolean(calc.options[option.key])} onChange={(event) => handleOptionToggle(option.key, event.target.checked)} />
                                        <span className="flex-1">{option.label}</span>
                                        {option.price > 0 ? <span className="text-sm text-gray-500">+ {formatCurrency(option.price)} / ед.</span> : null}
                                    </label>
                                ))}
                            </div>
                        ) : null}

                        <div className="card">
                            {renderBreakdown()}
                        </div>

                        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={createOrderFromCalc}>
                            Создать заказ из расчёта →
                        </button>
                    </>
                )}
            </div>
        </>
    );
}

import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatCurrency } from '@legacy/utils.js';

export default function PricelistPage({ refreshToken = 0 }) {
    const isDirector = state.user.role === 'director';
    const [services, setServices] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/pricelist');

        async function load() {
            setIsLoading(true);
            setError('');
            try {
                const rows = await api.get('/api/pricelist');
                if (!alive) return;
                setServices(rows || []);
                setDrafts(Object.fromEntries((rows || []).map((service) => [service.id, {
                    retail: service.price_retail,
                    dealer: service.price_dealer,
                    cost: service.cost_price || 0,
                }])));
            } catch {
                if (alive) setError('Ошибка загрузки');
            } finally {
                if (alive) setIsLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [refreshToken]);

    function updateDraft(serviceId, field, value) {
        setDrafts((current) => ({
            ...current,
            [serviceId]: {
                ...current[serviceId],
                [field]: value,
            },
        }));
    }

    async function savePrice(serviceId) {
        const draft = drafts[serviceId];
        try {
            await api.put(`/api/pricelist/${serviceId}`, {
                price_retail: parseFloat(draft.retail) || 0,
                price_dealer: parseFloat(draft.dealer) || 0,
                cost_price: parseFloat(draft.cost) || 0,
            });
            showToast('Цена обновлена', 'success');
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Прайс-лист</h1>
                <div />
            </div>

            <div className="px-4 pb-8">
                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b-2">
                                    <th className="py-2 pr-2">Услуга</th>
                                    <th className="py-2 pr-2">Ед.</th>
                                    <th className="py-2 pr-2">Розница</th>
                                    <th className="py-2 pr-2">Дилер</th>
                                    {isDirector ? <th className="py-2 pr-2">Себест.</th> : null}
                                    {isDirector ? <th className="py-2" /> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {services.map((service) => (
                                    <tr className="border-b" key={service.id}>
                                        <td className="py-3 pr-2 font-medium">{service.name_ru}</td>
                                        <td className="py-3 pr-2 text-gray-500">{service.unit}</td>
                                        {isDirector ? (
                                            <>
                                                <td className="py-3 pr-2">
                                                    <input type="number" className="input input-sm text-center" style={{ width: '80px', minHeight: '36px', padding: '4px 8px' }} value={drafts[service.id]?.retail ?? 0} onChange={(event) => updateDraft(service.id, 'retail', event.target.value)} />
                                                </td>
                                                <td className="py-3 pr-2">
                                                    <input type="number" className="input input-sm text-center" style={{ width: '80px', minHeight: '36px', padding: '4px 8px' }} value={drafts[service.id]?.dealer ?? 0} onChange={(event) => updateDraft(service.id, 'dealer', event.target.value)} />
                                                </td>
                                                <td className="py-3 pr-2">
                                                    <input type="number" className="input input-sm text-center" style={{ width: '80px', minHeight: '36px', padding: '4px 8px' }} value={drafts[service.id]?.cost ?? 0} onChange={(event) => updateDraft(service.id, 'cost', event.target.value)} />
                                                </td>
                                                <td className="py-3">
                                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => savePrice(service.id)}>💾</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="py-3 pr-2 font-bold">{formatCurrency(service.price_retail)}</td>
                                                <td className="py-3 pr-2">{service.price_dealer > 0 ? formatCurrency(service.price_dealer) : '—'}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

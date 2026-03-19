import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatDateTime } from '@legacy/utils.js';

const ACTION_LABELS = {
    receive: '📦 Приход',
    reserve: '🔒 Резерв',
    unreserve: '🔓 Возврат',
    consume: '🖨 Списание',
    correction: '📝 Коррекция',
    defect: '❌ Брак',
};

function LedgerModal({ materialName, entries, onClose }) {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto bg-white" onClick={(event) => event.stopPropagation()}>
                <div className="p-6">
                    <h3 className="font-bold text-lg mb-4">История: {materialName}</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {entries.length ? entries.map((entry) => (
                            <div key={`${entry.id}_${entry.created_at}`} className="flex items-center justify-between text-sm border-b pb-2">
                                <div>
                                    <div className="font-medium">{ACTION_LABELS[entry.action] || entry.action}</div>
                                    <div className="text-gray-400">{entry.full_name} • {formatDateTime(entry.created_at)}</div>
                                    {entry.note ? <div className="text-gray-500 text-xs">{entry.note}</div> : null}
                                    {entry.order_number ? <div className="text-blue-600 text-xs">{entry.order_number}</div> : null}
                                </div>
                                <div className={`font-bold ${entry.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {entry.quantity > 0 ? '+' : ''}{Number(entry.quantity).toFixed(1)}
                                </div>
                            </div>
                        )) : (
                            <p className="text-gray-400 text-center">Нет записей</p>
                        )}
                    </div>
                    <button type="button" className="btn btn-secondary btn-block mt-4" onClick={onClose}>Закрыть</button>
                </div>
            </div>
        </div>
    );
}

export default function InventoryPage({ refreshToken = 0 }) {
    const canManage = ['director', 'manager'].includes(state.user.role);
    const [materials, setMaterials] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [ledgerState, setLedgerState] = useState({ open: false, materialName: '', entries: [] });

    async function loadInventory() {
        setIsLoading(true);
        setError('');
        try {
            const rows = await api.get('/api/inventory');
            setMaterials(rows || []);
        } catch {
            setError('Ошибка загрузки');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadInventory();
    }, [refreshToken]);

    function showReceiveModal(id, name) {
        showFormModal({
            title: `Приход: ${name}`,
            fields: [
                { name: 'quantity', label: 'Количество (м²)', type: 'number', required: true, step: '0.1', placeholder: '0' },
                { name: 'note', label: 'Примечание', type: 'text', placeholder: 'Поставщик, накладная...' },
            ],
            submitText: 'Принять',
            onSubmit: async (data) => {
                const qty = parseFloat(data.quantity);
                if (!qty || qty <= 0) {
                    showToast('Введите количество', 'warning');
                    return;
                }
                try {
                    await api.post(`/api/inventory/${id}/receive`, { quantity: qty, note: data.note });
                    showToast('Материал принят', 'success');
                    loadInventory();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    function showCorrectionModal(id, name) {
        showFormModal({
            title: `Корректировка: ${name}`,
            fields: [
                { name: 'quantity', label: 'Количество (+/-)', type: 'number', required: true, step: '0.1', placeholder: 'например -5 или +10' },
                { name: 'note', label: 'Причина', type: 'text', required: true, placeholder: 'Инвентаризация, ошибка...' },
            ],
            submitText: 'Применить',
            onSubmit: async (data) => {
                const qty = parseFloat(data.quantity);
                if (!qty) {
                    showToast('Введите количество', 'warning');
                    return;
                }
                try {
                    await api.post(`/api/inventory/${id}/correction`, { quantity: qty, note: data.note });
                    showToast('Корректировка применена', 'success');
                    loadInventory();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    async function showLedger(id, name) {
        try {
            const entries = await api.get(`/api/inventory/${id}/ledger?limit=30`);
            setLedgerState({ open: true, materialName: name, entries: entries || [] });
        } catch {
            showToast('Ошибка загрузки', 'error');
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Склад</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : (
                    materials.map((material) => {
                        const available = material.quantity - material.reserved;
                        const maxStock = Math.max(material.quantity + 10, material.low_threshold * 5);
                        const pct = Math.min(100, Math.max(0, (available / maxStock) * 100));
                        let barColor = 'bg-green-500';
                        if (available < material.low_threshold) barColor = 'bg-red-500';
                        else if (available < material.low_threshold * 2) barColor = 'bg-yellow-500';

                        return (
                            <div className={`card ${material.is_low ? 'border-2 border-red-400' : ''}`} key={material.id}>
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="font-bold">{material.name_ru}</h3>
                                        <span className="text-xs text-gray-400">{material.unit}</span>
                                    </div>
                                    {material.is_low ? <span className="badge badge-cancelled">МАЛО!</span> : null}
                                </div>

                                <div className="stock-bar my-3">
                                    <div className={`stock-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                    <div>
                                        <div className="text-gray-400">На складе</div>
                                        <div className="font-bold text-lg">{Number(material.quantity).toFixed(1)}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-400">Резерв</div>
                                        <div className="font-bold text-lg text-yellow-600">{Number(material.reserved).toFixed(1)}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-400">Доступно</div>
                                        <div className={`font-bold text-lg ${material.is_low ? 'text-red-600' : 'text-green-600'}`}>{Number(available).toFixed(1)}</div>
                                    </div>
                                </div>

                                {canManage ? (
                                    <div className="flex gap-2 mt-4">
                                        <button type="button" className="btn btn-success btn-sm flex-1" onClick={() => showReceiveModal(material.id, material.name_ru)}>+ Приход</button>
                                        <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => showCorrectionModal(material.id, material.name_ru)}>± Коррекция</button>
                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => showLedger(material.id, material.name_ru)}>📋</button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </div>

            {ledgerState.open ? (
                <LedgerModal
                    materialName={ledgerState.materialName}
                    entries={ledgerState.entries}
                    onClose={() => setLedgerState({ open: false, materialName: '', entries: [] })}
                />
            ) : null}
        </>
    );
}

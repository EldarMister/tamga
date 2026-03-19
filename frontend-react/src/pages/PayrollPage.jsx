import { useEffect, useMemo, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { formatCurrency, roleLabel } from '@legacy/utils.js';

function getMonthDates(offset = 0) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return {
        start: first.toISOString().split('T')[0],
        end: last.toISOString().split('T')[0],
        label: first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    };
}

function incidentLabel(type) {
    if (type === 'defect') return '🔴 Брак';
    if (type === 'late') return '🟡 Опозд.';
    if (type === 'complaint') return '🟠 Жалоба';
    return `🟠 ${type}`;
}

export default function PayrollPage({ refreshToken = 0 }) {
    const [monthOffset, setMonthOffset] = useState(0);
    const [report, setReport] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const month = useMemo(() => getMonthDates(monthOffset), [monthOffset]);

    useEffect(() => {
        let alive = true;
        api.clearCache('/api/payroll');

        async function loadReport() {
            setIsLoading(true);
            setError('');
            try {
                const rows = await api.get(`/api/payroll/month-report?month_start=${month.start}&month_end=${month.end}`);
                if (!alive) return;
                const nextReport = rows || [];
                setReport(nextReport);
                setDrafts(Object.fromEntries(nextReport.map((item) => {
                    const payroll = item.payroll;
                    return [item.employee.id, {
                        base_salary: payroll?.base_salary || 0,
                        bonus: payroll?.bonus || 0,
                        deductions: Number.isFinite(payroll?.deductions) ? payroll.deductions : (item.penalties_total || 0),
                        payroll_id: payroll?.id || null,
                        is_paid: Boolean(payroll?.is_paid),
                    }];
                })));
            } catch {
                if (alive) setError('Ошибка загрузки');
            } finally {
                if (alive) setIsLoading(false);
            }
        }

        loadReport();
        return () => {
            alive = false;
        };
    }, [month.end, month.start, refreshToken]);

    function updateDraft(employeeId, field, value) {
        setDrafts((current) => ({
            ...current,
            [employeeId]: {
                ...current[employeeId],
                [field]: value,
            },
        }));
    }

    async function savePayroll(employeeId) {
        const draft = drafts[employeeId];
        try {
            await api.post('/api/payroll', {
                user_id: employeeId,
                month_start: month.start,
                month_end: month.end,
                base_salary: parseFloat(draft.base_salary) || 0,
                bonus: parseFloat(draft.bonus) || 0,
                deductions: parseFloat(draft.deductions) || 0,
            });
            showToast('Сохранено', 'success');
            const rows = await api.get(`/api/payroll/month-report?month_start=${month.start}&month_end=${month.end}`);
            setReport(rows || []);
            setDrafts((current) => ({
                ...current,
                ...Object.fromEntries((rows || []).map((item) => {
                    const payroll = item.payroll;
                    return [item.employee.id, {
                        base_salary: payroll?.base_salary || 0,
                        bonus: payroll?.bonus || 0,
                        deductions: Number.isFinite(payroll?.deductions) ? payroll.deductions : (item.penalties_total || 0),
                        payroll_id: payroll?.id || null,
                        is_paid: Boolean(payroll?.is_paid),
                    }];
                })),
            }));
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    async function markPaid(employeeId) {
        const draft = drafts[employeeId];
        if (!draft?.payroll_id) {
            showToast('Сначала сохраните данные', 'warning');
            return;
        }
        if (!window.confirm('Отметить как выплаченное?')) {
            return;
        }
        try {
            await api.patch(`/api/payroll/${draft.payroll_id}/pay`);
            showToast('Выплата отмечена', 'success');
            updateDraft(employeeId, 'is_paid', true);
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Зарплата</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                <div className="card">
                    <div className="flex items-center justify-between gap-2">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMonthOffset((value) => value - 1)}>← Пред.</button>
                        <div className="text-center" style={{ minWidth: 0 }}>
                            <div className="font-bold" style={{ textTransform: 'capitalize' }}>{month.label}</div>
                            <div className="text-xs text-gray-400">{month.start} — {month.end}</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMonthOffset((value) => value + 1)}>След. →</button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">{error}</div>
                ) : report.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">Нет сотрудников</div>
                ) : (
                    report.map((item) => {
                        const employee = item.employee;
                        const draft = drafts[employee.id] || { base_salary: 0, bonus: 0, deductions: 0, payroll_id: null, is_paid: false };
                        const total = (parseFloat(draft.base_salary) || 0) + (parseFloat(draft.bonus) || 0) - (parseFloat(draft.deductions) || 0);

                        return (
                            <div className="card mb-4" key={employee.id}>
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="font-bold text-lg">{employee.full_name}</div>
                                        <span className="text-xs text-gray-400">{roleLabel(employee.role)}</span>
                                    </div>
                                    {draft.is_paid ? <span className="badge bg-green-100 text-green-700">Выплачено</span> : null}
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                                    <div className="bg-gray-50 rounded-lg p-2">
                                        <div className="text-gray-400">Дней</div>
                                        <div className="font-bold text-lg">{item.days_worked}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2">
                                        <div className="text-gray-400">Задач</div>
                                        <div className="font-bold text-lg">{item.tasks_done}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-2">
                                        <div className="text-gray-400">Инцид.</div>
                                        <div className={`font-bold text-lg ${item.incidents.length > 0 ? 'text-red-600' : ''}`}>{item.incidents.length}</div>
                                    </div>
                                </div>

                                {item.incidents.length > 0 ? (
                                    <div className="bg-red-50 rounded-lg p-3 mb-4 text-sm">
                                        {item.incidents.map((incident) => (
                                            <div className="mb-1" key={incident.id}>
                                                <span className="font-medium">{incidentLabel(incident.type)}</span>
                                                <span className="text-gray-600"> {incident.description}</span>
                                                {incident.deduction_amount ? <span className="text-red-700"> • штраф {incident.deduction_amount}</span> : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="input-label">Оклад</label>
                                            <input type="number" className="input text-center" step="100" value={draft.base_salary} onChange={(event) => updateDraft(employee.id, 'base_salary', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className="input-label">Бонус</label>
                                            <input type="number" className="input text-center" step="100" value={draft.bonus} onChange={(event) => updateDraft(employee.id, 'bonus', event.target.value)} />
                                        </div>
                                        <div>
                                            <label className="input-label">Штраф</label>
                                            <input type="number" className="input text-center" step="100" value={draft.deductions} onChange={(event) => updateDraft(employee.id, 'deductions', event.target.value)} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                                        <span className="font-bold">Итого:</span>
                                        <span className="font-bold text-xl text-blue-800">{formatCurrency(total)}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" className="btn btn-primary flex-1" onClick={() => savePayroll(employee.id)}>Сохранить</button>
                                        {!draft.is_paid ? <button type="button" className="btn btn-success flex-1" onClick={() => markPaid(employee.id)}>Выплатить</button> : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}

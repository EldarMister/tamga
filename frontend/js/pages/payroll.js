import { api } from '../api.js';
import { formatCurrency, roleLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';

let currentMonthStart = '';
let currentMonthEnd = '';
let monthOffset = 0;

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

export async function render(container) {
    const month = getMonthDates(monthOffset);
    currentMonthStart = month.start;
    currentMonthEnd = month.end;

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Зарплата</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <div class="flex items-center justify-between gap-2">
                    <button class="btn btn-sm btn-secondary" id="prev-month">← Пред.</button>
                    <div class="text-center" style="min-width: 0;">
                        <div class="font-bold" id="month-label" style="text-transform: capitalize;">${month.label}</div>
                        <div class="text-xs text-gray-400">${currentMonthStart} — ${currentMonthEnd}</div>
                    </div>
                    <button class="btn btn-sm btn-secondary" id="next-month">След. →</button>
                </div>
            </div>
            <div id="payroll-content">
                <div class="flex justify-center py-8"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    document.getElementById('prev-month').onclick = () => { monthOffset--; render(container); };
    document.getElementById('next-month').onclick = () => { monthOffset++; render(container); };

    loadReport();
}

async function loadReport() {
    const container = document.getElementById('payroll-content');
    try {
        const report = await api.get(`/api/payroll/month-report?month_start=${currentMonthStart}&month_end=${currentMonthEnd}`);
        if (!report || report.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">Нет сотрудников</div>';
            return;
        }

        container.innerHTML = report.map(r => {
            const emp = r.employee;
            const p = r.payroll;
            const suggestedDeductions = Number.isFinite(p?.deductions) ? p.deductions : (r.penalties_total || 0);

            return `
                <div class="card mb-4">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <div class="font-bold text-lg">${emp.full_name}</div>
                            <span class="text-xs text-gray-400">${roleLabel(emp.role)}</span>
                        </div>
                        ${p?.is_paid ? '<span class="badge bg-green-100 text-green-700">Выплачено</span>' : ''}
                    </div>

                    <div class="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                        <div class="bg-gray-50 rounded-lg p-2">
                            <div class="text-gray-400">Дней</div>
                            <div class="font-bold text-lg">${r.days_worked}</div>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-2">
                            <div class="text-gray-400">Задач</div>
                            <div class="font-bold text-lg">${r.tasks_done}</div>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-2">
                            <div class="text-gray-400">Инцид.</div>
                            <div class="font-bold text-lg ${r.incidents.length > 0 ? 'text-red-600' : ''}">${r.incidents.length}</div>
                        </div>
                    </div>

                    ${r.incidents.length > 0 ? `
                        <div class="bg-red-50 rounded-lg p-3 mb-4 text-sm">
                            ${r.incidents.map(i => `
                                <div class="mb-1">
                                    <span class="font-medium">${i.type === 'defect' ? '🔴 Брак' : i.type === 'late' ? '🟡 Опозд.' : '🟠 ' + i.type}</span>
                                    <span class="text-gray-600">${i.description}</span>
                                    ${i.deduction_amount ? `<span class="text-red-700"> • штраф ${i.deduction_amount}</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="space-y-2">
                        <div class="grid grid-cols-3 gap-2">
                            <div>
                                <label class="input-label">Оклад</label>
                                <input type="number" class="input text-center" data-emp="${emp.id}" data-field="base" value="${p?.base_salary || 0}" step="100">
                            </div>
                            <div>
                                <label class="input-label">Бонус</label>
                                <input type="number" class="input text-center" data-emp="${emp.id}" data-field="bonus" value="${p?.bonus || 0}" step="100">
                            </div>
                            <div>
                                <label class="input-label">Штраф</label>
                                <input type="number" class="input text-center" data-emp="${emp.id}" data-field="deductions" value="${suggestedDeductions}" step="100">
                            </div>
                        </div>
                        <div class="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                            <span class="font-bold">Итого:</span>
                            <span class="font-bold text-xl text-blue-800" id="total-${emp.id}">${formatCurrency((p?.base_salary || 0) + (p?.bonus || 0) - suggestedDeductions)}</span>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-primary flex-1 save-pay-btn" data-emp="${emp.id}">Сохранить</button>
                            ${!p?.is_paid ? `<button class="btn btn-success flex-1 mark-paid-btn" data-emp="${emp.id}" data-payroll="${p?.id || ''}">Выплатить</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('input[data-field]').forEach(input => {
            input.oninput = () => {
                const empId = input.dataset.emp;
                const base = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="base"]`).value) || 0;
                const bonus = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="bonus"]`).value) || 0;
                const ded = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="deductions"]`).value) || 0;
                document.getElementById(`total-${empId}`).textContent = formatCurrency(base + bonus - ded);
            };
        });

        container.querySelectorAll('.save-pay-btn').forEach(btn => {
            btn.onclick = async () => {
                const empId = btn.dataset.emp;
                const base = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="base"]`).value) || 0;
                const bonus = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="bonus"]`).value) || 0;
                const ded = parseFloat(container.querySelector(`input[data-emp="${empId}"][data-field="deductions"]`).value) || 0;

                try {
                    await api.post('/api/payroll', {
                        user_id: parseInt(empId, 10),
                        month_start: currentMonthStart,
                        month_end: currentMonthEnd,
                        base_salary: base,
                        bonus,
                        deductions: ded,
                    });
                    showToast('Сохранено', 'success');
                    loadReport();
                } catch { /* handled */ }
            };
        });

        container.querySelectorAll('.mark-paid-btn').forEach(btn => {
            btn.onclick = () => {
                if (!btn.dataset.payroll) {
                    showToast('Сначала сохраните данные', 'warning');
                    return;
                }
                showModal({
                    title: 'Подтверждение выплаты',
                    body: 'Отметить как выплаченное?',
                    confirmText: 'Выплатить',
                    onConfirm: async () => {
                        try {
                            await api.patch(`/api/payroll/${btn.dataset.payroll}/pay`);
                            showToast('Выплата отмечена', 'success');
                            loadReport();
                        } catch { /* handled */ }
                    },
                });
            };
        });

    } catch {
        container.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки</div>';
    }
}

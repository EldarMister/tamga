import { api } from '../api.js';
import { formatCurrency, statusLabel, roleLabel } from '../utils.js';

export async function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Отчёты</h1>
            <div></div>
        </div>

        <div class="px-4 space-y-4 pb-8">
            <div class="card">
                <div class="reports-filter-grid mb-4">
                    <div>
                        <label class="input-label">С</label>
                        <input type="date" class="input" id="date-from" value="${monthAgo}">
                    </div>
                    <div>
                        <label class="input-label">По</label>
                        <input type="date" class="input" id="date-to" value="${today}">
                    </div>
                    <button class="btn btn-primary" id="load-report-btn">Загрузить</button>
                </div>
            </div>

            <div id="report-content"></div>
        </div>
    `;

    document.getElementById('load-report-btn').onclick = loadReport;
    loadReport();
}

async function loadReport() {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    const content = document.getElementById('report-content');
    content.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';

    try {
        const [ordersSummary, materialUsage, empStats] = await Promise.all([
            api.get(`/api/reports/orders-summary?date_from=${from}&date_to=${to}`),
            api.get(`/api/reports/material-usage?date_from=${from}&date_to=${to}`),
            api.get(`/api/reports/employee-stats?date_from=${from}&date_to=${to}`).catch(() => []),
        ]);

        let html = '';

        if (ordersSummary) {
            html += `
                <div class="card mb-4">
                    <h3 class="font-bold mb-3">Заказы</h3>

                    <div class="reports-kpi-grid mb-4">
                        <div class="report-kpi report-kpi-orders">
                            <div class="report-kpi-value">${ordersSummary.totals.total_orders}</div>
                            <div class="report-kpi-label">Заказов</div>
                        </div>
                        <div class="report-kpi report-kpi-revenue">
                            <div class="report-kpi-value">${formatCurrency(ordersSummary.totals.total_revenue)}</div>
                            <div class="report-kpi-label">Выручка</div>
                        </div>
                        <div class="report-kpi report-kpi-profit">
                            <div class="report-kpi-value">${formatCurrency(ordersSummary.profit)}</div>
                            <div class="report-kpi-label">Прибыль</div>
                        </div>
                    </div>

                    <div class="space-y-1">
                        ${ordersSummary.by_status.map(s => `
                            <div class="report-status-row">
                                <span class="text-gray-600">${statusLabel(s.status)}</span>
                                <span><span class="font-medium">${s.count}</span> • ${formatCurrency(s.revenue)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (materialUsage && materialUsage.length > 0) {
            const maxUsed = Math.max(...materialUsage.map(m => m.used), 1);
            html += `
                <div class="card mb-4">
                    <h3 class="font-bold mb-3">Расход материалов</h3>
                    <div class="space-y-3">
                        ${materialUsage.map(m => `
                            <div>
                                <div class="flex justify-between text-sm mb-1 gap-2">
                                    <span class="truncate">${m.name_ru}</span>
                                    <span class="font-bold">${m.used.toFixed(1)} ${m.unit}</span>
                                </div>
                                <div class="stock-bar">
                                    <div class="stock-bar-fill" style="width: ${(m.used / maxUsed * 100).toFixed(0)}%; background: var(--accent);"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (empStats && empStats.length > 0) {
            html += `
                <div class="card mb-4">
                    <h3 class="font-bold mb-3">Сотрудники</h3>

                    <div class="reports-table-wrap reports-desktop-table">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b text-left">
                                    <th class="py-2">Имя</th>
                                    <th class="py-2 text-center">Дней</th>
                                    <th class="py-2 text-center">Задач</th>
                                    <th class="py-2 text-center">Инцид.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${empStats.map(e => `
                                    <tr class="border-b">
                                        <td class="py-2">
                                            <div class="font-medium">${e.full_name}</div>
                                            <div class="text-xs text-gray-400">${roleLabel(e.role)}</div>
                                        </td>
                                        <td class="py-2 text-center font-bold">${e.days_worked}</td>
                                        <td class="py-2 text-center font-bold">${e.tasks_done}</td>
                                        <td class="py-2 text-center font-bold ${e.incidents > 0 ? 'text-red-600' : ''}">${e.incidents}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="reports-mobile-list">
                        ${empStats.map(e => `
                            <div class="report-emp-card">
                                <div>
                                    <div class="font-medium">${e.full_name}</div>
                                    <div class="text-xs text-gray-400">${roleLabel(e.role)}</div>
                                </div>
                                <div class="report-emp-stats">
                                    <span>Дней: <b>${e.days_worked}</b></span>
                                    <span>Задач: <b>${e.tasks_done}</b></span>
                                    <span>Инцид.: <b class="${e.incidents > 0 ? 'text-red-600' : ''}">${e.incidents}</b></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        content.innerHTML = html || '<div class="text-center text-gray-400 py-8">Нет данных за период</div>';

    } catch {
        content.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки отчётов</div>';
    }
}

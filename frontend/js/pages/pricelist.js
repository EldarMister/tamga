import { api } from '../api.js';
import { state } from '../state.js';
import { formatCurrency } from '../utils.js';
import { showToast } from '../components/toast.js';

export async function render(container) {
    const isDirector = state.user.role === 'director';

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Прайс-лист</h1>
            <div></div>
        </div>
        <div class="px-4 pb-8" id="pricelist-content">
            <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
    `;

    try {
        const services = await api.get('/api/pricelist');
        if (!services) return;

        const content = document.getElementById('pricelist-content');
        content.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-left border-b-2">
                            <th class="py-2 pr-2">Услуга</th>
                            <th class="py-2 pr-2">Ед.</th>
                            <th class="py-2 pr-2">Розница</th>
                            <th class="py-2 pr-2">Дилер</th>
                            ${isDirector ? '<th class="py-2 pr-2">Себест.</th><th class="py-2"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody id="price-tbody">
                        ${services.map(s => `
                            <tr class="border-b" data-id="${s.id}">
                                <td class="py-3 pr-2 font-medium">${s.name_ru}</td>
                                <td class="py-3 pr-2 text-gray-500">${s.unit}</td>
                                ${isDirector ? `
                                    <td class="py-3 pr-2"><input type="number" class="input input-sm text-center" data-field="retail" value="${s.price_retail}" style="width: 80px; min-height: 36px; padding: 4px 8px;"></td>
                                    <td class="py-3 pr-2"><input type="number" class="input input-sm text-center" data-field="dealer" value="${s.price_dealer}" style="width: 80px; min-height: 36px; padding: 4px 8px;"></td>
                                    <td class="py-3 pr-2"><input type="number" class="input input-sm text-center" data-field="cost" value="${s.cost_price}" style="width: 80px; min-height: 36px; padding: 4px 8px;"></td>
                                    <td class="py-3"><button class="btn btn-primary btn-sm save-price-btn" data-id="${s.id}">💾</button></td>
                                ` : `
                                    <td class="py-3 pr-2 font-bold">${formatCurrency(s.price_retail)}</td>
                                    <td class="py-3 pr-2">${s.price_dealer > 0 ? formatCurrency(s.price_dealer) : '—'}</td>
                                `}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        if (isDirector) {
            content.querySelectorAll('.save-price-btn').forEach(btn => {
                btn.onclick = async () => {
                    const row = btn.closest('tr');
                    const id = btn.dataset.id;
                    const retail = parseFloat(row.querySelector('[data-field="retail"]').value) || 0;
                    const dealer = parseFloat(row.querySelector('[data-field="dealer"]').value) || 0;
                    const cost = parseFloat(row.querySelector('[data-field="cost"]').value) || 0;

                    try {
                        await api.put(`/api/pricelist/${id}`, {
                            price_retail: retail,
                            price_dealer: dealer,
                            cost_price: cost,
                        });
                        showToast('Цена обновлена', 'success');
                    } catch { /* handled */ }
                };
            });
        }
    } catch {
        document.getElementById('pricelist-content').innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки</div>';
    }
}

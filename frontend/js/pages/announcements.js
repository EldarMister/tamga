import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, roleLabel } from '../utils.js';

let users = [];

export async function render(container) {
    const isDirector = state.user.role === 'director';

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Объявления</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            ${isDirector ? `
                <div class="card">
                    <h3 class="font-bold mb-3 text-gray-700">Новое объявление</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="input-label">Кому</label>
                            <select class="input" id="ann-target">
                                <option value="">Всем сотрудникам</option>
                            </select>
                        </div>
                        <div>
                            <label class="input-label">Сообщение</label>
                            <textarea class="input" id="ann-message" rows="3" placeholder="Текст объявления..."></textarea>
                        </div>
                        <button class="btn btn-primary" id="ann-send">Отправить</button>
                    </div>
                </div>
            ` : ''}

            <div id="ann-list">
                <div class="flex justify-center py-8"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    if (isDirector) {
        await loadUsers();
        const sendBtn = document.getElementById('ann-send');
        sendBtn.onclick = sendAnnouncement;
    }

    loadAnnouncements();
}

async function loadUsers() {
    try {
        users = await api.get('/api/users') || [];
        const select = document.getElementById('ann-target');
        users.filter(u => u.role !== 'director').forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.full_name} (${roleLabel(u.role)})`;
            select.appendChild(opt);
        });
    } catch { /* ignore */ }
}

async function sendAnnouncement() {
    const message = document.getElementById('ann-message').value.trim();
    const target = document.getElementById('ann-target').value;
    if (!message) {
        showToast('Введите сообщение', 'warning');
        return;
    }
    try {
        await api.post('/api/announcements', {
            message,
            target_user_id: target ? parseInt(target) : null,
        });
        showToast('Объявление отправлено', 'success');
        document.getElementById('ann-message').value = '';
        document.getElementById('ann-target').value = '';
        loadAnnouncements();
    } catch { /* handled */ }
}

async function loadAnnouncements() {
    const container = document.getElementById('ann-list');
    try {
        const list = await api.get('/api/announcements');
        if (!list || list.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">Нет объявлений</div>';
            return;
        }

        container.innerHTML = list.map(a => `
            <div class="card mb-3 ${a.is_read ? '' : 'card-glow'}">
                <div class="flex items-center justify-between">
                    <div class="font-bold">${a.created_by_name || 'Директор'}</div>
                    <div class="text-xs text-gray-400">${formatDateTime(a.created_at)}</div>
                </div>
                <div class="mt-2 text-gray-700">${a.message}</div>
                ${a.target_user_id ? '<div class="text-xs text-gray-400 mt-2">Личное сообщение</div>' : '<div class="text-xs text-gray-400 mt-2">Для всех</div>'}
            </div>
        `).join('');

        list.filter(a => !a.is_read).forEach(a => {
            api.post(`/api/announcements/${a.id}/read`, {}).catch(() => {});
        });
    } catch {
        container.innerHTML = '<div class="text-center text-red-500 py-8">Ошибка загрузки</div>';
    }
}

import { state, clearState } from '../state.js';
import { api } from '../api.js';
import { roleLabel } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showFormModal } from '../components/modal.js';
import { loadTranslations } from '../i18n.js';

function tr(ru, ky) {
    return state.lang === 'ky' ? ky : ru;
}

export async function render(container) {
    const user = state.user;
    const isDirector = user.role === 'director';

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">${tr('Профиль', 'Профиль')}</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-4 pb-8">
            <div class="card text-center">
                <div class="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span class="text-3xl font-bold text-blue-800">${user.full_name.charAt(0)}</span>
                </div>
                <div class="font-bold text-xl">${user.full_name}</div>
                <div class="text-gray-500">${roleLabel(user.role)}</div>
                <div class="text-gray-400 mt-1">${user.username}</div>
                ${user.phone ? `<div class="text-gray-400 mt-1">${user.phone}</div>` : ''}
            </div>

            ${isDirector ? `
                <button class="btn btn-secondary btn-block" id="edit-profile-btn">${tr('Редактировать профиль', 'Профилди оңдоо')}</button>
            ` : ''}

            <div class="card">
                <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">${tr('Язык / Тил', 'Тил / Язык')}</h3>
                <div class="flex gap-2">
                    <button class="btn flex-1 ${state.lang === 'ru' ? 'btn-primary' : 'btn-secondary'}" id="lang-ru">Русский</button>
                    <button class="btn flex-1 ${state.lang === 'ky' ? 'btn-primary' : 'btn-secondary'}" id="lang-ky">Кыргызча</button>
                </div>
            </div>

            <button class="btn btn-secondary btn-block" id="lessons-btn">${tr('Уроки', 'Сабактар')}</button>
            <button class="btn btn-secondary btn-block" id="change-pass-btn">${tr('Сменить пароль', 'Сырсөздү алмаштыруу')}</button>
            <button class="btn btn-danger btn-block" id="logout-btn">${tr('Выйти', 'Чыгуу')}</button>
        </div>
    `;

    document.getElementById('lang-ru').onclick = () => switchLang('ru');
    document.getElementById('lang-ky').onclick = () => switchLang('ky');

    document.getElementById('lessons-btn').onclick = () => {
        window.location.hash = '#/training';
    };

    if (isDirector) {
        document.getElementById('edit-profile-btn').onclick = () => {
            showFormModal({
                title: tr('Редактировать профиль', 'Профилди оңдоо'),
                fields: [
                    { name: 'username', label: tr('Логин', 'Колдонуучу'), type: 'text', required: true, value: user.username },
                    { name: 'phone', label: tr('Телефон', 'Телефон'), type: 'text', required: false, value: user.phone || '' },
                ],
                submitText: tr('Сохранить', 'Сактоо'),
                onSubmit: async (data) => {
                    try {
                        const updated = await api.patch('/api/users/me', data);
                        if (updated) {
                            state.user.username = updated.username;
                            state.user.phone = updated.phone;
                            localStorage.setItem('pc_user', JSON.stringify(state.user));
                        }
                        showToast(tr('Профиль обновлён', 'Профиль жаңырды'), 'success');
                        render(container);
                    } catch { /* handled */ }
                },
            });
        };
    }

    document.getElementById('change-pass-btn').onclick = () => {
        showFormModal({
            title: tr('Сменить пароль', 'Сырсөздү алмаштыруу'),
            fields: [
                { name: 'old_password', label: tr('Текущий пароль', 'Учурдагы сырсөз'), type: 'password', required: true },
                { name: 'new_password', label: tr('Новый пароль', 'Жаңы сырсөз'), type: 'password', required: true },
            ],
            submitText: tr('Сменить', 'Алмаштыруу'),
            onSubmit: async (data) => {
                try {
                    await api.post('/api/auth/change-password', data);
                    showToast(tr('Пароль изменён', 'Сырсөз өзгөртүлдү'), 'success');
                } catch { /* handled */ }
            },
        });
    };

    document.getElementById('logout-btn').onclick = () => {
        clearState();
        window.location.hash = '#/login';
    };
}

async function switchLang(lang) {
    try {
        await api.patch(`/api/users/me/lang?lang=${lang}`);
        state.lang = lang;
        state.user.lang = lang;
        localStorage.setItem('pc_user', JSON.stringify(state.user));
        await loadTranslations(lang);
        showToast(lang === 'ru' ? 'Язык: Русский' : 'Тил: Кыргызча', 'success');
        window.location.reload();
    } catch { /* handled */ }
}

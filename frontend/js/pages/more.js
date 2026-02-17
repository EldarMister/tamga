import { state } from '../state.js';

function tr(ru, ky) {
    return state.lang === 'ky' ? ky : ru;
}

export async function render(container) {
    const items = [];

    if (state.user.role === 'director') {
        items.push(
            { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения сотрудникам', 'Кызматкерлерге билдирүү') },
            { label: tr('Прайс-лист', 'Баа тизмеси'), icon: '💰', hash: '#/pricelist', desc: tr('Цены на услуги', 'Кызмат баалары') },
            { label: tr('Зарплата', 'Айлык'), icon: '💳', hash: '#/payroll', desc: tr('Ежемесячный расчёт', 'Айлык эсеп') },
            { label: tr('Журнал штрафов', 'Айып журналы'), icon: '💸', hash: '#/fines', desc: tr('История удержаний', 'Кармоо тарыхы') },
            { label: tr('Сотрудники', 'Кызматкерлер'), icon: '👥', hash: '#/users', desc: tr('Управление аккаунтами', 'Колдонуучуларды башкаруу') },
            { label: tr('Отчёты', 'Отчеттор'), icon: '📊', hash: '#/reports', desc: tr('Аналитика и статистика', 'Аналитика жана статистика') },
            { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
            { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
        );
    } else if (state.user.role === 'manager') {
        items.push(
            { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения директора', 'Директордун билдирүүлөрү') },
            { label: tr('Прайс-лист', 'Баа тизмеси'), icon: '💰', hash: '#/pricelist', desc: tr('Цены на услуги', 'Кызмат баалары') },
            { label: tr('Журнал штрафов', 'Айып журналы'), icon: '💸', hash: '#/fines', desc: tr('История удержаний', 'Кармоо тарыхы') },
            { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
            { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
        );
    } else {
        items.push(
            { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения директора', 'Директордун билдирүүлөрү') },
            { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
            { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
        );
    }

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">${tr('Ещё', 'Дагы')}</h1>
            <div></div>
        </div>
        <div class="px-4 space-y-3 pb-8">
            ${items.map(item => `
                <a class="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" data-hash="${item.hash}">
                    <div class="text-3xl">${item.icon}</div>
                    <div>
                        <div class="font-bold">${item.label}</div>
                        <div class="text-sm text-gray-500">${item.desc}</div>
                    </div>
                </a>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('[data-hash]').forEach(el => {
        el.onclick = () => { window.location.hash = el.dataset.hash; };
    });
}

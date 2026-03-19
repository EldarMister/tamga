import { state } from '@legacy/state.js';

function tr(ru, ky) {
    return state.lang === 'ky' ? ky : ru;
}

function getItems() {
    if (state.user.role === 'director') {
        return [
            { label: tr('Калькулятор', 'Калькулятор'), icon: '🧮', hash: '#/calculator', desc: tr('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
            { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения сотрудникам', 'Кызматкерлерге билдирүү') },
            { label: tr('Чек-лист смены', 'Смена тизмеси'), icon: '✅', hash: '#/shift-checklist', desc: tr('Настройка и контроль', 'Жөндөө жана көзөмөл') },
            { label: tr('Прайс-лист', 'Баа тизмеси'), icon: '💰', hash: '#/pricelist', desc: tr('Цены на услуги', 'Кызмат баалары') },
            { label: tr('Зарплата', 'Айлык'), icon: '💳', hash: '#/payroll', desc: tr('Ежемесячный расчёт', 'Айлык эсеп') },
            { label: tr('Журнал штрафов', 'Айып журналы'), icon: '💸', hash: '#/fines', desc: tr('История удержаний', 'Кармоо тарыхы') },
            { label: tr('Журнал работы', 'Иш журналы'), icon: '🕒', hash: '#/work-journal', desc: tr('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
            { label: tr('Отпуск / Больничный', 'Эс алуу / Ооруу'), icon: '🩺', hash: '#/leave-requests', desc: tr('Заявки и согласование', 'Сурамдар жана бекитүү') },
            { label: tr('Сотрудники', 'Кызматкерлер'), icon: '👥', hash: '#/users', desc: tr('Управление аккаунтами', 'Колдонуучуларды башкаруу') },
            { label: tr('Отчёты', 'Отчеттор'), icon: '📊', hash: '#/reports', desc: tr('Аналитика и статистика', 'Аналитика жана статистика') },
            { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
            { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
        ];
    }

    if (state.user.role === 'manager') {
        return [
            { label: tr('Калькулятор', 'Калькулятор'), icon: '🧮', hash: '#/calculator', desc: tr('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
            { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения директора', 'Директордун билдирүүлөрү') },
            { label: tr('Прайс-лист', 'Баа тизмеси'), icon: '💰', hash: '#/pricelist', desc: tr('Цены на услуги', 'Кызмат баалары') },
            { label: tr('Журнал штрафов', 'Айып журналы'), icon: '💸', hash: '#/fines', desc: tr('История удержаний', 'Кармоо тарыхы') },
            { label: tr('Журнал работы', 'Иш журналы'), icon: '🕒', hash: '#/work-journal', desc: tr('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
            { label: tr('Отпуск / Больничный', 'Эс алуу / Ооруу'), icon: '🩺', hash: '#/leave-requests', desc: tr('Заявки и согласование', 'Сурамдар жана бекитүү') },
            { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
            { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
        ];
    }

    return [
        { label: tr('Калькулятор', 'Калькулятор'), icon: '🧮', hash: '#/calculator', desc: tr('Расчёт стоимости услуг', 'Кызматтардын баасын эсептөө') },
        { label: tr('Объявления', 'Жарнамалар'), icon: '📢', hash: '#/announcements', desc: tr('Сообщения директора', 'Директордун билдирүүлөрү') },
        { label: tr('Журнал работы', 'Иш журналы'), icon: '🕒', hash: '#/work-journal', desc: tr('Часы, прогулы, KPI', 'Саат, келбей калуу, KPI') },
        { label: tr('Отпуск / Больничный', 'Эс алуу / Ооруу'), icon: '🩺', hash: '#/leave-requests', desc: tr('Мои заявки', 'Менин сурамдарым') },
        { label: tr('Уроки', 'Сабактар'), icon: '🎓', hash: '#/training', desc: tr('Видео и фото инструкции', 'Видео жана сүрөт нускама') },
        { label: tr('Профиль', 'Профиль'), icon: '👤', hash: '#/profile', desc: tr('Настройки аккаунта', 'Аккаунт жөндөөлөрү') },
    ];
}

export default function MorePage() {
    const items = getItems();

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">{tr('Ещё', 'Дагы')}</h1>
                <div />
            </div>

            <div className="px-4 space-y-3 pb-8">
                {items.map((item) => (
                    <button
                        type="button"
                        key={item.hash}
                        className="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow w-full text-left"
                        onClick={() => { window.location.hash = item.hash; }}
                    >
                        <div className="text-3xl">{item.icon}</div>
                        <div>
                            <div className="font-bold">{item.label}</div>
                            <div className="text-sm text-gray-500">{item.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </>
    );
}

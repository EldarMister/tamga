import { state } from './state.js';

function locale() {
    return state.lang === 'ky' ? 'ky-KG' : 'ru-RU';
}

export function formatCurrency(amount) {
    if (amount == null) return `0 ${state.lang === 'ky' ? 'сом' : 'сом'}`;
    return new Intl.NumberFormat(locale()).format(Math.round(amount)) + ` ${state.lang === 'ky' ? 'сом' : 'сом'}`;
}

export function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function statusBadgeClass(status) {
    return `badge badge-${status}`;
}

export function statusLabel(status) {
    const labelsRu = {
        created: 'Создан',
        design: 'Дизайн',
        production: 'Производство',
        design_done: 'Макет готов',
        printed: 'Напечатано',
        postprocess: 'Постобработка',
        ready: 'Готов',
        closed: 'Закрыт',
        cancelled: 'Отменён',
    };
    const labelsKy = {
        created: 'Түзүлдү',
        design: 'Дизайн',
        production: 'Өндүрүш',
        design_done: 'Макет даяр',
        printed: 'Басылды',
        postprocess: 'Кийинки иштетүү',
        ready: 'Даяр',
        closed: 'Жабык',
        cancelled: 'Жокко чыгарылды',
    };
    const labels = state.lang === 'ky' ? labelsKy : labelsRu;
    return labels[status] || status;
}

export function roleLabel(role) {
    const labelsRu = {
        director: 'Директор',
        manager: 'Менеджер',
        designer: 'Дизайнер',
        master: 'Мастер',
        assistant: 'Помощник',
    };
    const labelsKy = {
        director: 'Директор',
        manager: 'Менеджер',
        designer: 'Дизайнер',
        master: 'Уста',
        assistant: 'Жардамчы',
    };
    const labels = state.lang === 'ky' ? labelsKy : labelsRu;
    return labels[role] || role;
}

export function isOverdue(order) {
    if (!order.deadline) return false;
    if (['ready', 'closed', 'cancelled'].includes(order.status)) return false;
    return new Date(order.deadline) < new Date();
}

export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

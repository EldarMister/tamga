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
        defect: 'Брак',
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
        defect: 'Брак',
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
    if (['ready', 'closed', 'cancelled', 'defect'].includes(order.status)) return false;
    const raw = String(order.deadline).trim();
    if (!raw) return false;

    // Treat date-only deadlines as end-of-day in local time to avoid timezone false positives.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
        return endOfDay < new Date();
    }

    const deadline = new Date(raw);
    if (Number.isNaN(deadline.getTime())) return false;
    return deadline < new Date();
}

export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function buildUploadUrl(fileRef) {
    if (!fileRef || typeof fileRef !== 'string') return '';
    let normalized = fileRef.trim().replace(/\\/g, '/');
    if (!normalized) return '';

    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('/api/uploads/')) return normalized;
    if (normalized.startsWith('api/uploads/')) return `/${normalized}`;
    if (/^uploads\//i.test(normalized)) normalized = normalized.replace(/^uploads\//i, '');
    if (/\/uploads\//i.test(normalized)) normalized = normalized.split(/\/uploads\//i).pop() || '';
    if (normalized.startsWith('/')) return normalized;

    const encodedPath = normalized
        .split('/')
        .filter(Boolean)
        .map(part => encodeURIComponent(part))
        .join('/');
    return `/api/uploads/${encodedPath}`;
}

let closeImageViewerFn = null;

export function openImageViewer(src, alt = 'Фото') {
    if (!src) return;
    if (typeof closeImageViewerFn === 'function') {
        closeImageViewerFn();
    }

    const overlay = document.createElement('div');
    overlay.className = 'image-viewer-overlay';

    const img = document.createElement('img');
    img.className = 'image-viewer-img';
    img.src = src;
    img.alt = alt;
    img.addEventListener('click', (e) => e.stopPropagation());

    const onKeyDown = (e) => {
        if (e.key === 'Escape') close();
    };

    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
        if (closeImageViewerFn === close) {
            closeImageViewerFn = null;
        }
    }

    overlay.addEventListener('click', close);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);

    closeImageViewerFn = close;
}

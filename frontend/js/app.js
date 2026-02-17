import { state, loadState } from './state.js';
import { loadTranslations } from './i18n.js';
import { renderTabBar } from './components/tab-bar.js';
import { api } from './api.js';
import { showToast } from './components/toast.js';

// Page modules
const pages = {
    '/login': () => import('./pages/login.js'),
    '/dashboard': () => import('./pages/dashboard.js'),
    '/orders': () => import('./pages/orders.js'),
    '/orders/new': () => import('./pages/order-create.js'),
    '/orders/:id': () => import('./pages/order-detail.js'),
    '/inventory': () => import('./pages/inventory.js'),
    '/pricelist': () => import('./pages/pricelist.js'),
    '/hr': () => import('./pages/hr.js'),
    '/payroll': () => import('./pages/payroll.js'),
    '/users': () => import('./pages/users.js'),
    '/reports': () => import('./pages/reports.js'),
    '/fines': () => import('./pages/fines.js'),
    '/announcements': () => import('./pages/announcements.js'),
    '/profile': () => import('./pages/profile.js'),
    '/more': () => import('./pages/more.js'),
    '/tasks': () => import('./pages/tasks.js'),
    '/training': () => import('./pages/training.js'),
};

const DEFAULT_PAGE = '/dashboard';

function parseHash() {
    const hash = window.location.hash.slice(1) || DEFAULT_PAGE;
    const parts = hash.split('/').filter(Boolean);

    if (pages['/' + parts.join('/')]) {
        return { route: '/' + parts.join('/'), params: {} };
    }

    if (parts[0] === 'orders' && parts[1] && parts[1] !== 'new') {
        return { route: '/orders/:id', params: { id: parts[1] } };
    }

    return { route: '/' + parts.join('/'), params: {} };
}

async function navigate() {
    const app = document.getElementById('app');
    const { route, params } = parseHash();

    if (!state.token && route !== '/login') {
        window.location.hash = '#/login';
        return;
    }

    if (state.token && route === '/login') {
        window.location.hash = '#' + DEFAULT_PAGE;
        return;
    }

    const loader = pages[route];
    if (!loader) {
        app.innerHTML = `<div style="text-align: center; padding: 64px; color: var(--text-tertiary);">Страница не найдена</div>`;
        renderTabBar();
        return;
    }

    try {
        const mod = await loader();
        app.classList.add('page-enter');
        await mod.render(app, params);
        setTimeout(() => app.classList.remove('page-enter'), 400);
        checkAnnouncements();
    } catch (err) {
        console.error('Page load error:', err);
        app.innerHTML = `<div style="text-align: center; padding: 64px; color: var(--danger);">Ошибка загрузки страницы</div>`;
    }

    renderTabBar();
}

// Theme management
function initTheme() {
    const saved = localStorage.getItem('pc_theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    syncGlobalThemeToggle();
}

function syncGlobalThemeToggle() {
    const btn = document.getElementById('global-theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
}

function initGlobalThemeToggle() {
    const btn = document.getElementById('global-theme-toggle');
    if (!btn) return;
    btn.onclick = () => {
        if (window.toggleTheme) window.toggleTheme();
    };
    syncGlobalThemeToggle();
}

window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('pc_theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('pc_theme', 'dark');
    }
    syncGlobalThemeToggle();
};

let lastAnnCheck = 0;
async function checkAnnouncements() {
    if (!state.token) return;
    const now = Date.now();
    if (now - lastAnnCheck < 30000) return;
    lastAnnCheck = now;

    try {
        const list = await api.get('/api/announcements?unread=1');
        if (!list || list.length === 0) return;
        const latest = list[0];
        showToast(latest.message, 'success');
        await api.post(`/api/announcements/${latest.id}/read`, {});
    } catch { /* handled */ }
}

// Init
async function init() {
    initTheme();
    initGlobalThemeToggle();
    loadState();
    await loadTranslations(state.lang);
    window.addEventListener('hashchange', navigate);
    navigate();
}

init();

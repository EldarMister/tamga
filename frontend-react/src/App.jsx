import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@legacy/api.js';
import { renderTabBar } from '@legacy/components/tab-bar.js';
import { showToast } from '@legacy/components/toast.js';
import { loadTranslations } from '@legacy/i18n.js';
import { loadState, state } from '@legacy/state.js';
import { DEFAULT_ROUTE, useHashRoute } from './hashRouter.js';
import { legacyPageLoaders } from './legacy/pageLoaders.js';
import LegacyPageHost from './legacy/LegacyPageHost.jsx';
import { reactPageLoaders } from './reactPages.js';
import { connectRealtime } from './realtime.js';

const ROUTE_CHANNELS = {
    '/dashboard': ['orders', 'tasks', 'announcements', 'inventory', 'leave-requests', 'work-journal', 'reports'],
    '/hr': ['hr', 'work-journal', 'reports'],
    '/orders': ['orders'],
    '/orders/:id': ['orders'],
    '/orders/new': ['orders'],
    '/inventory': ['inventory', 'orders'],
    '/reports': ['orders', 'inventory', 'reports', 'users'],
    '/users': ['users'],
    '/announcements': ['announcements'],
    '/profile': ['profile', 'users'],
    '/tasks': ['tasks'],
    '/training': ['training'],
    '/work-journal': ['work-journal', 'tasks', 'leave-requests'],
    '/leave-requests': ['leave-requests', 'work-journal'],
};

function snapshotLegacyState() {
    return {
        token: state.token,
        user: state.user,
        lang: state.lang || 'ru',
    };
}

function syncThemeButton() {
    const btn = document.getElementById('global-theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
}

function initTheme() {
    const saved = localStorage.getItem('pc_theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    syncThemeButton();
}

export default function App() {
    const routeInfo = useHashRoute();
    const lastAnnouncementCheckRef = useRef(0);
    const routeInfoRef = useRef(routeInfo);
    const refreshTimerRef = useRef(null);
    const [session, setSession] = useState(() => {
        loadState(false);
        return snapshotLegacyState();
    });
    const [refreshVersion, setRefreshVersion] = useState(0);

    const legacyPageLoader = useMemo(
        () => legacyPageLoaders[routeInfo.route] || null,
        [routeInfo.route],
    );
    const reactPageLoader = useMemo(
        () => reactPageLoaders[routeInfo.route] || null,
        [routeInfo.route],
    );
    const ReactPage = useMemo(
        () => (reactPageLoader ? lazy(reactPageLoader) : null),
        [reactPageLoader],
    );

    useEffect(() => {
        routeInfoRef.current = routeInfo;
    }, [routeInfo]);

    useEffect(() => {
        initTheme();

        window.toggleTheme = () => {
            const current = document.documentElement.getAttribute('data-theme');
            if (current === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('pc_theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('pc_theme', 'dark');
            }
            syncThemeButton();
        };

        return () => {
            delete window.toggleTheme;
        };
    }, []);

    useEffect(() => {
        const syncSession = () => {
            loadState(false);
            setSession(snapshotLegacyState());
        };

        syncSession();
        window.addEventListener('pc:state-change', syncSession);
        window.addEventListener('storage', syncSession);

        return () => {
            window.removeEventListener('pc:state-change', syncSession);
            window.removeEventListener('storage', syncSession);
        };
    }, []);

    useEffect(() => {
        loadTranslations(session.lang);
        renderTabBar();
        syncThemeButton();
    }, [session.lang, session.user, routeInfo.hash]);

    useEffect(() => {
        if (!session.token && routeInfo.route !== '/login') {
            window.location.hash = '#/login';
            return;
        }
        if (session.token && routeInfo.route === '/login') {
            window.location.hash = `#${DEFAULT_ROUTE}`;
        }
    }, [routeInfo.route, session.token]);

    useEffect(() => {
        async function checkAnnouncements() {
            if (!session.token) return;
            const now = Date.now();
            if (now - lastAnnouncementCheckRef.current < 30000) return;
            lastAnnouncementCheckRef.current = now;

            try {
                const list = await api.get('/api/announcements?unread=1');
                if (!list || list.length === 0) return;
                const latest = list[0];
                showToast(latest.message, 'success');
                await api.post(`/api/announcements/${latest.id}/read`, {});
            } catch {
                // Ignore background poll failures here; legacy API already shows user-facing errors when needed.
            }
        }

        checkAnnouncements();
    }, [routeInfo.hash, session.token]);

    useEffect(() => {
        if (!session.token) return undefined;

        const cleanup = connectRealtime(session.token, {
            onEvent(event) {
                if (event.type === 'hello') {
                    return;
                }

                for (const prefix of event.cache_prefixes || []) {
                    api.clearCache(prefix);
                }

                window.dispatchEvent(new CustomEvent('pc:realtime', {
                    detail: event,
                }));

                const currentRoute = routeInfoRef.current.route;

                if (
                    event.kind === 'announcements.created' &&
                    event.payload?.message &&
                    currentRoute !== '/announcements'
                ) {
                    showToast(event.payload.message, 'success');
                }
                const currentChannels = ROUTE_CHANNELS[currentRoute] || [];
                const eventChannels = event.channels || [];
                const shouldRefresh = eventChannels.some((channel) => currentChannels.includes(channel));

                if (!shouldRefresh) {
                    return;
                }

                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = window.setTimeout(() => {
                    startTransition(() => {
                        setRefreshVersion((value) => value + 1);
                    });
                }, 120);
            },
        });

        return () => {
            clearTimeout(refreshTimerRef.current);
            cleanup();
        };
    }, [session.token]);

    const shouldRenderPage = session.token || routeInfo.route === '/login';
    const renderKey = `${routeInfo.hash}:${refreshVersion}`;

    return (
        <>
            <button
                id="global-theme-toggle"
                className="theme-toggle global-theme-toggle"
                aria-label="Переключить тему"
                onClick={() => window.toggleTheme?.()}
            >
                <span className="theme-toggle-icon theme-toggle-sun">☀️</span>
                <span className="theme-toggle-icon theme-toggle-moon">🌙</span>
            </button>

            <div id="app" className="max-w-screen-xl mx-auto pb-20">
                {!shouldRenderPage ? null : ReactPage ? (
                    <Suspense fallback={<div className="flex justify-center py-16"><div className="spinner" /></div>}>
                        <ReactPage params={routeInfo.params} routeKey={renderKey} refreshToken={refreshVersion} />
                    </Suspense>
                ) : legacyPageLoader ? (
                    <LegacyPageHost
                        loader={legacyPageLoader}
                        params={routeInfo.params}
                        routeKey={renderKey}
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-tertiary)' }}>
                        Страница не найдена
                    </div>
                )}
            </div>

            <nav id="tab-bar" className="fixed bottom-0 left-0 right-0 z-40 hidden">
                <div className="max-w-screen-xl mx-auto flex justify-around items-center h-16" />
            </nav>

            <div id="toast-container" className="fixed top-4 right-4 z-50 flex flex-col gap-2" />

            <div
                id="modal-overlay"
                className="fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center p-4"
            >
                <div
                    id="modal-content"
                    className="rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
                />
            </div>
        </>
    );
}

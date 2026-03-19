import { useEffect, useRef } from 'react';

export default function LegacyPageHost({ loader, params, routeKey }) {
    const containerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function mountPage() {
            const container = containerRef.current;
            if (!container) return;

            container.innerHTML = '<div class="flex justify-center py-16"><div class="spinner"></div></div>';

            try {
                const mod = await loader();
                if (cancelled || !containerRef.current) return;

                containerRef.current.classList.remove('page-enter');
                void containerRef.current.offsetWidth;
                containerRef.current.classList.add('page-enter');
                await mod.render(containerRef.current, params);
            } catch (error) {
                console.error('Legacy page mount error:', error);
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = '<div style="text-align: center; padding: 64px; color: var(--danger);">Ошибка загрузки страницы</div>';
                }
            }
        }

        mountPage();

        return () => {
            cancelled = true;
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [loader, params, routeKey]);

    return <div ref={containerRef} />;
}

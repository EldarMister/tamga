import { useEffect, useState } from 'react';

export const DEFAULT_ROUTE = '/dashboard';

export function parseHash(rawHash = window.location.hash) {
    const hash = rawHash.replace(/^#/, '') || DEFAULT_ROUTE;
    const parts = hash.split('/').filter(Boolean);
    const route = `/${parts.join('/')}`;

    if (parts[0] === 'orders' && parts[1] && parts[1] !== 'new') {
        return {
            hash,
            route: '/orders/:id',
            params: { id: parts[1] },
        };
    }

    return {
        hash,
        route,
        params: {},
    };
}

export function useHashRoute() {
    const [routeInfo, setRouteInfo] = useState(() => parseHash());

    useEffect(() => {
        const onHashChange = () => setRouteInfo(parseHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    return routeInfo;
}

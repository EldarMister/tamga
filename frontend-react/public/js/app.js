(async () => {
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(async (registration) => {
                try {
                    await registration.unregister();
                } catch {}
            }));
        }

        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
    } catch {}

    const target = `/?v=react${window.location.hash || ''}`;
    window.location.replace(target);
})();

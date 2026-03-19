const ICONS = {
    dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="14" y="10" width="7" height="11" rx="1" /><rect x="3" y="13" width="7" height="8" rx="1" /></svg>,
    orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>,
    inventory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.27 6.96 8.73 5.04 8.73-5.04" /><path d="M12 22.08V12" /></svg>,
    hr: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>,
    more: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>,
};

const LABELS = {
    ru: {
        dashboard: 'Главная',
        orders: 'Заказы',
        inventory: 'Склад',
        hr: 'Кадры',
        more: 'Ещё',
    },
    ky: {
        dashboard: 'Башкы',
        orders: 'Буйрутма',
        inventory: 'Кампа',
        hr: 'Кадр',
        more: 'Дагы',
    },
};

const TABS = {
    director: [
        { id: 'dashboard', hash: '#/dashboard', icon: 'dashboard' },
        { id: 'orders', hash: '#/orders', icon: 'orders' },
        { id: 'inventory', hash: '#/inventory', icon: 'inventory' },
        { id: 'hr', hash: '#/hr', icon: 'hr' },
        { id: 'more', hash: '#/more', icon: 'more' },
    ],
    manager: [
        { id: 'dashboard', hash: '#/dashboard', icon: 'dashboard' },
        { id: 'orders', hash: '#/orders', icon: 'orders' },
        { id: 'inventory', hash: '#/inventory', icon: 'inventory' },
        { id: 'hr', hash: '#/hr', icon: 'hr' },
        { id: 'more', hash: '#/more', icon: 'more' },
    ],
    designer: [
        { id: 'dashboard', hash: '#/dashboard', icon: 'dashboard' },
        { id: 'orders', hash: '#/orders', icon: 'orders' },
        { id: 'hr', hash: '#/hr', icon: 'hr' },
        { id: 'more', hash: '#/more', icon: 'more' },
    ],
    master: [
        { id: 'dashboard', hash: '#/dashboard', icon: 'dashboard' },
        { id: 'orders', hash: '#/orders', icon: 'orders' },
        { id: 'inventory', hash: '#/inventory', icon: 'inventory' },
        { id: 'hr', hash: '#/hr', icon: 'hr' },
        { id: 'more', hash: '#/more', icon: 'more' },
    ],
    assistant: [
        { id: 'dashboard', hash: '#/dashboard', icon: 'dashboard' },
        { id: 'orders', hash: '#/orders', icon: 'orders' },
        { id: 'hr', hash: '#/hr', icon: 'hr' },
        { id: 'more', hash: '#/more', icon: 'more' },
    ],
};

export default function TabBar({ user, lang, currentHash }) {
    if (!user) return null;

    const tabs = TABS[user.role] || TABS.assistant;
    const labels = LABELS[lang] || LABELS.ru;

    return (
        <nav id="tab-bar" className="fixed bottom-0 left-0 right-0 z-40">
            <div className="max-w-screen-xl mx-auto flex justify-around items-center h-16">
                {tabs.map((tab) => {
                    const active = currentHash === tab.hash || (tab.hash !== '#/dashboard' && currentHash.startsWith(tab.hash));
                    return (
                        <button
                            key={tab.hash}
                            type="button"
                            className={`tab-item ${active ? 'active' : ''}`}
                            onClick={() => { window.location.hash = tab.hash; }}
                        >
                            {ICONS[tab.icon]}
                            <span>{labels[tab.id] || tab.id}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

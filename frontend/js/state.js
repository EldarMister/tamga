// Global application state
export const state = {
    user: null,
    token: null,
    lang: 'ru',
};

export function loadState() {
    try {
        state.token = localStorage.getItem('pc_token');
        const userData = localStorage.getItem('pc_user');
        if (userData) {
            state.user = JSON.parse(userData);
            state.lang = state.user.lang || 'ru';
        }
    } catch (e) {
        clearState();
    }
}

export function saveState(token, user) {
    state.token = token;
    state.user = user;
    state.lang = user.lang || 'ru';
    localStorage.setItem('pc_token', token);
    localStorage.setItem('pc_user', JSON.stringify(user));
}

export function clearState() {
    state.token = null;
    state.user = null;
    state.lang = 'ru';
    localStorage.removeItem('pc_token');
    localStorage.removeItem('pc_user');
}

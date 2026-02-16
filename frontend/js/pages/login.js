import { api } from '../api.js';
import { saveState } from '../state.js';
import { showToast } from '../components/toast.js';

export function render(container) {
    container.innerHTML = `
        <div class="min-h-screen flex items-center justify-center p-4">
            <div class="w-full max-w-sm">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" class="w-8 h-8">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        </svg>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-900">Тамга Сервис</h1>
                    <p class="text-gray-500 mt-1">Вход в систему</p>
                </div>
                <form id="login-form" class="space-y-4">
                    <div>
                        <label class="input-label">Логин</label>
                        <input type="text" id="username" class="input" placeholder="Имя пользователя" autocomplete="username" required>
                    </div>
                    <div>
                        <label class="input-label">Пароль</label>
                        <input type="password" id="password" class="input" placeholder="Пароль" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block btn-lg" id="login-btn">
                        Войти
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showToast('Введите логин и пароль', 'warning');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Вход...';

        try {
            const data = await api.post('/api/auth/login', { username, password });
            if (data) {
                saveState(data.token, data.user);
                showToast(`Добро пожаловать, ${data.user.full_name}!`, 'success');
                window.location.hash = '#/orders';
            }
        } catch {
            // Error shown by api.js
        } finally {
            btn.disabled = false;
            btn.textContent = 'Войти';
        }
    };
}

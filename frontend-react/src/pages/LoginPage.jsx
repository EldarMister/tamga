import { useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { saveState } from '@legacy/state.js';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        const trimmedUsername = username.trim();
        if (!trimmedUsername || !password) {
            showToast('Введите логин и пароль', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const data = await api.post('/api/auth/login', {
                username: trimmedUsername,
                password,
            });
            if (!data) return;

            saveState(data.token, data.user);
            showToast(`Добро пожаловать, ${data.user.full_name}!`, 'success');
            window.location.hash = '#/orders';
        } catch {
            // api.js already handles user-facing errors.
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-8 h-8">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Тамга Сервис</h1>
                    <p className="text-gray-500 mt-1">Вход в систему</p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label className="input-label" htmlFor="username">Логин</label>
                        <input
                            id="username"
                            type="text"
                            className="input"
                            placeholder="Имя пользователя"
                            autoComplete="username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label className="input-label" htmlFor="password">Пароль</label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            placeholder="Пароль"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-block btn-lg"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Вход...' : 'Войти'}
                    </button>
                </form>
            </div>
        </div>
    );
}

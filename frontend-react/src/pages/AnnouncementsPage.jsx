import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { formatDateTime, roleLabel } from '@legacy/utils.js';

export default function AnnouncementsPage({ refreshToken = 0 }) {
    const isDirector = state.user.role === 'director';
    const [users, setUsers] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [message, setMessage] = useState('');
    const [targetUserId, setTargetUserId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;

        async function loadPage() {
            setIsLoading(true);
            setError('');

            try {
                const requests = [api.get('/api/announcements')];
                if (isDirector) {
                    requests.unshift(api.get('/api/users'));
                }

                const results = await Promise.all(requests);
                if (!alive) return;

                if (isDirector) {
                    setUsers(results[0] || []);
                    setAnnouncements(results[1] || []);
                } else {
                    setAnnouncements(results[0] || []);
                }
            } catch {
                if (alive) {
                    setError('Ошибка загрузки');
                }
            } finally {
                if (alive) {
                    setIsLoading(false);
                }
            }
        }

        loadPage();
        return () => {
            alive = false;
        };
    }, [isDirector, refreshToken]);

    useEffect(() => {
        for (const announcement of announcements.filter((item) => !item.is_read)) {
            api.post(`/api/announcements/${announcement.id}/read`, {}).catch(() => {});
        }
    }, [announcements]);

    async function handleSend() {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            showToast('Введите сообщение', 'warning');
            return;
        }

        try {
            await api.post('/api/announcements', {
                message: trimmedMessage,
                target_user_id: targetUserId ? parseInt(targetUserId, 10) : null,
            });
            showToast('Объявление отправлено', 'success');
            setMessage('');
            setTargetUserId('');
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Объявления</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8">
                {isDirector ? (
                    <div className="card">
                        <h3 className="font-bold mb-3 text-gray-700">Новое объявление</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="input-label" htmlFor="ann-target">Кому</label>
                                <select
                                    id="ann-target"
                                    className="input"
                                    value={targetUserId}
                                    onChange={(event) => setTargetUserId(event.target.value)}
                                >
                                    <option value="">Всем сотрудникам</option>
                                    {users.filter((user) => user.role !== 'director').map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.full_name} ({roleLabel(user.role)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="input-label" htmlFor="ann-message">Сообщение</label>
                                <textarea
                                    id="ann-message"
                                    className="input"
                                    rows="3"
                                    placeholder="Текст объявления..."
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                />
                            </div>

                            <button type="button" className="btn btn-primary" onClick={handleSend}>
                                Отправить
                            </button>
                        </div>
                    </div>
                ) : null}

                <div>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><div className="spinner" /></div>
                    ) : error ? (
                        <div className="text-center text-red-500 py-8">{error}</div>
                    ) : announcements.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">Нет объявлений</div>
                    ) : (
                        announcements.map((announcement) => (
                            <div key={announcement.id} className={`card mb-3 ${announcement.is_read ? '' : 'card-glow'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="font-bold">{announcement.created_by_name || 'Директор'}</div>
                                    <div className="text-xs text-gray-400">{formatDateTime(announcement.created_at)}</div>
                                </div>
                                <div className="mt-2 text-gray-700">{announcement.message}</div>
                                <div className="text-xs text-gray-400 mt-2">
                                    {announcement.target_user_id ? 'Личное сообщение' : 'Для всех'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}

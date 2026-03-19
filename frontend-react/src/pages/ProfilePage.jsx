import { useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { clearState, saveState, state } from '@legacy/state.js';
import { roleLabel } from '@legacy/utils.js';

function tr(ru, ky) {
    return state.lang === 'ky' ? ky : ru;
}

export default function ProfilePage() {
    const [version, setVersion] = useState(0);
    const user = state.user;
    const isDirector = user.role === 'director';

    function refresh() {
        setVersion((current) => current + 1);
    }

    function updateCurrentUser(patch) {
        saveState(state.token, { ...state.user, ...patch });
        refresh();
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">{tr('Профиль', 'Профиль')}</h1>
                <div />
            </div>

            <div className="px-4 space-y-4 pb-8" key={version}>
                <div className="card text-center">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-3xl font-bold text-blue-800">{user.full_name.charAt(0)}</span>
                    </div>
                    <div className="font-bold text-xl">{user.full_name}</div>
                    <div className="text-gray-500">{roleLabel(user.role)}</div>
                    <div className="text-gray-400 mt-1">{user.username}</div>
                    {user.phone ? <div className="text-gray-400 mt-1">{user.phone}</div> : null}
                </div>

                {isDirector ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-block"
                        onClick={() => {
                            showFormModal({
                                title: tr('Редактировать профиль', 'Профилди оңдоо'),
                                fields: [
                                    { name: 'username', label: tr('Логин', 'Колдонуучу'), type: 'text', required: true, value: user.username },
                                    { name: 'phone', label: tr('Телефон', 'Телефон'), type: 'text', required: false, value: user.phone || '' },
                                ],
                                submitText: tr('Сохранить', 'Сактоо'),
                                onSubmit: async (data) => {
                                    try {
                                        const updated = await api.patch('/api/users/me', data);
                                        if (updated) {
                                            updateCurrentUser({ username: updated.username, phone: updated.phone });
                                        }
                                        showToast(tr('Профиль обновлён', 'Профиль жаңырды'), 'success');
                                    } catch {
                                        // api.js already handles user-facing errors.
                                    }
                                },
                            });
                        }}
                    >
                        {tr('Редактировать профиль', 'Профилди оңдоо')}
                    </button>
                ) : null}

                <div className="card">
                    <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">{tr('Язык / Тил', 'Тил / Язык')}</h3>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={`btn flex-1 ${state.lang === 'ru' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={async () => {
                                try {
                                    await api.patch('/api/users/me/lang?lang=ru');
                                    updateCurrentUser({ lang: 'ru' });
                                    showToast('Язык: Русский', 'success');
                                    window.location.reload();
                                } catch {
                                    // api.js already handles user-facing errors.
                                }
                            }}
                        >
                            Русский
                        </button>
                        <button
                            type="button"
                            className={`btn flex-1 ${state.lang === 'ky' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={async () => {
                                try {
                                    await api.patch('/api/users/me/lang?lang=ky');
                                    updateCurrentUser({ lang: 'ky' });
                                    showToast('Тил: Кыргызча', 'success');
                                    window.location.reload();
                                } catch {
                                    // api.js already handles user-facing errors.
                                }
                            }}
                        >
                            Кыргызча
                        </button>
                    </div>
                </div>

                <button type="button" className="btn btn-secondary btn-block" onClick={() => { window.location.hash = '#/training'; }}>
                    {tr('Уроки', 'Сабактар')}
                </button>

                <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={() => {
                        showFormModal({
                            title: tr('Сменить пароль', 'Сырсөздү алмаштыруу'),
                            fields: [
                                { name: 'old_password', label: tr('Текущий пароль', 'Учурдагы сырсөз'), type: 'password', required: true },
                                { name: 'new_password', label: tr('Новый пароль', 'Жаңы сырсөз'), type: 'password', required: true },
                            ],
                            submitText: tr('Сменить', 'Алмаштыруу'),
                            onSubmit: async (data) => {
                                try {
                                    await api.post('/api/auth/change-password', data);
                                    showToast(tr('Пароль изменён', 'Сырсөз өзгөртүлдү'), 'success');
                                } catch {
                                    // api.js already handles user-facing errors.
                                }
                            },
                        });
                    }}
                >
                    {tr('Сменить пароль', 'Сырсөздү алмаштыруу')}
                </button>

                <button
                    type="button"
                    className="btn btn-danger btn-block"
                    onClick={() => {
                        clearState();
                        window.location.hash = '#/login';
                    }}
                >
                    {tr('Выйти', 'Чыгуу')}
                </button>
            </div>
        </>
    );
}

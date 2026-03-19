import { useEffect, useState } from 'react';
import { api } from '@legacy/api.js';
import { showFormModal, showModal } from '@legacy/components/modal.js';
import { showToast } from '@legacy/components/toast.js';
import { state } from '@legacy/state.js';
import { buildUploadUrl, roleLabel } from '@legacy/utils.js';

function getYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

export default function TrainingPage({ refreshToken = 0 }) {
    const canManage = state.user.role === 'director';
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    async function loadTraining() {
        setIsLoading(true);
        setError('');
        api.clearCache('/api/training');

        try {
            const rows = await api.get('/api/training');
            setItems(rows || []);
        } catch {
            setError('Ошибка загрузки');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadTraining();
    }, [refreshToken]);

    function showCreateTraining() {
        showFormModal({
            title: 'Новый урок',
            fields: [
                { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Как печатать баннер' },
                { name: 'description', label: 'Описание и цель урока', type: 'textarea', required: true, placeholder: 'Что изучаем и для чего...' },
                { name: 'youtube_url', label: 'Ссылка YouTube (необязательно)', type: 'text', placeholder: 'https://youtube.com/watch?v=...' },
                { name: 'photo_url', label: 'Ссылка на фото (необязательно)', type: 'text', placeholder: 'https://.../image.jpg' },
                { name: 'photo_file', label: 'Фото с компьютера (необязательно)', type: 'file', accept: 'image/*' },
                {
                    name: 'role_target',
                    label: 'Для роли (необязательно)',
                    type: 'select',
                    options: [
                        { value: '', label: 'Для всех' },
                        { value: 'designer', label: 'Дизайнер' },
                        { value: 'master', label: 'Мастер' },
                        { value: 'assistant', label: 'Помощник' },
                        { value: 'manager', label: 'Менеджер' },
                    ],
                },
            ],
            submitText: 'Опубликовать',
            onSubmit: async (data) => {
                const hasYoutube = typeof data.youtube_url === 'string' && data.youtube_url.trim().length > 0;
                const hasPhotoUrl = typeof data.photo_url === 'string' && data.photo_url.trim().length > 0;
                const hasPhotoFile = data.photo_file && typeof data.photo_file === 'object' && data.photo_file.size > 0;

                if (!hasYoutube && !hasPhotoUrl && !hasPhotoFile) {
                    showToast('Добавьте YouTube, ссылку на фото или загрузите фото', 'warning');
                    return;
                }

                if (hasYoutube && !data.youtube_url.includes('youtu')) {
                    showToast('Проверьте ссылку на YouTube', 'warning');
                    return;
                }

                try {
                    const created = await api.post('/api/training', {
                        title: data.title,
                        description: data.description,
                        youtube_url: hasYoutube ? data.youtube_url.trim() : '',
                        photo_url: hasPhotoUrl ? data.photo_url.trim() : null,
                        role_target: data.role_target || null,
                        is_required: false,
                    });

                    if (hasPhotoFile && created?.id) {
                        await api.upload(`/api/training/${created.id}/photo`, data.photo_file);
                    }

                    showToast('Урок опубликован', 'success');
                    loadTraining();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    async function handleWatchToggle(id) {
        try {
            await api.patch(`/api/training/${id}/watch`);
            showToast('Отмечено', 'success');
            loadTraining();
        } catch {
            // api.js already handles user-facing errors.
        }
    }

    function handleDelete(id) {
        showModal({
            title: 'Удалить урок?',
            body: 'Урок будет удалён из системы',
            danger: true,
            confirmText: 'Удалить',
            onConfirm: async () => {
                try {
                    await api.delete(`/api/training/${id}`);
                    showToast('Удалено', 'success');
                    loadTraining();
                } catch {
                    // api.js already handles user-facing errors.
                }
            },
        });
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Уроки</h1>
                {canManage ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={showCreateTraining}>
                        + Урок
                    </button>
                ) : null}
            </div>

            <div className="px-4 space-y-4 pb-8 slide-up">
                {isLoading ? (
                    <div className="flex justify-center py-8"><div className="spinner" /></div>
                ) : error ? (
                    <div style={{ textAlign: 'center', color: 'var(--danger)', padding: '32px' }}>{error}</div>
                ) : items.length === 0 ? (
                    <div className="empty-state">
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎓</div>
                        <p style={{ fontWeight: 600 }}>Нет уроков</p>
                        <p style={{ fontSize: '13px', marginTop: '4px' }}>Добавьте YouTube и/или фото с описанием</p>
                    </div>
                ) : (
                    items.map((item) => {
                        const ytId = getYouTubeId(item.youtube_url);
                        const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '';
                        const photo = item.photo_file ? buildUploadUrl(item.photo_file) : (item.photo_url || '');

                        return (
                            <div className="video-card card-hover" key={item.id}>
                                {ytThumb ? (
                                    <a href={item.youtube_url} target="_blank" rel="noopener" style={{ display: 'block', position: 'relative' }}>
                                        <img src={ytThumb} alt={item.title} className="video-thumb" loading="lazy" />
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="#dc2626"><path d="M8 5v14l11-7z" /></svg>
                                            </div>
                                        </div>
                                    </a>
                                ) : null}

                                {photo ? (
                                    <a href={photo} target="_blank" rel="noopener" style={{ display: 'block', borderTop: '1px solid var(--border)' }}>
                                        <img
                                            src={photo}
                                            alt={`Фото к уроку ${item.title}`}
                                            className="video-thumb"
                                            loading="lazy"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </a>
                                ) : null}

                                <div style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '8px' }}>
                                        <div>
                                            <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>{item.title}</h3>
                                            {item.description ? (
                                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{item.description}</p>
                                            ) : null}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                {item.youtube_url ? <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>YouTube</span> : null}
                                                {photo ? <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>Фото</span> : null}
                                                {item.role_target ? (
                                                    <span className="badge" style={{ background: 'var(--purple-light)', color: 'var(--purple)' }}>
                                                        Для: {roleLabel(item.role_target)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <button
                                                type="button"
                                                className={`btn btn-sm ${item.watched ? 'btn-success' : 'btn-secondary'}`}
                                                onClick={() => handleWatchToggle(item.id)}
                                            >
                                                {item.watched ? '✅' : '👁'}
                                            </button>
                                            {canManage ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ color: 'var(--danger)' }}
                                                    onClick={() => handleDelete(item.id)}
                                                >
                                                    ✕
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}

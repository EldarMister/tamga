import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../components/toast.js';
import { showFormModal, showModal } from '../components/modal.js';
import { roleLabel } from '../utils.js';

export async function render(container) {
    const canManage = state.user.role === 'director';

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Уроки</h1>
            ${canManage ? '<button class="btn btn-primary btn-sm" id="add-training-btn">+ Урок</button>' : ''}
        </div>
        <div class="px-4 space-y-4 pb-8 slide-up" id="training-list">
            <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
    `;

    if (canManage) {
        document.getElementById('add-training-btn').onclick = () => showCreateTraining();
    }

    loadTraining();
}

function getYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

async function loadTraining() {
    const list = document.getElementById('training-list');
    const canManage = state.user.role === 'director';

    try {
        const items = await api.get('/api/training');
        if (!items || items.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 48px; margin-bottom: 12px;">🎓</div>
                    <p style="font-weight: 600;">Нет уроков</p>
                    <p style="font-size: 13px; margin-top: 4px;">Добавьте YouTube и/или фото с описанием</p>
                </div>
            `;
            return;
        }

        list.innerHTML = items.map(item => {
            const ytId = getYouTubeId(item.youtube_url);
            const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '';
            const photo = item.photo_file ? `/api/uploads/${item.photo_file}` : (item.photo_url || '');

            return `
                <div class="video-card card-hover" data-id="${item.id}">
                    ${ytThumb ? `
                        <a href="${item.youtube_url}" target="_blank" rel="noopener" style="display: block; position: relative;">
                            <img src="${ytThumb}" alt="${item.title}" class="video-thumb" loading="lazy">
                            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
                                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#dc2626"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                            </div>
                        </a>
                    ` : ''}

                    ${photo ? `
                        <a href="${photo}" target="_blank" rel="noopener" style="display: block; border-top: 1px solid var(--border);">
                            <img src="${photo}" alt="Фото к уроку ${item.title}" class="video-thumb" loading="lazy" style="object-fit: cover;">
                        </a>
                    ` : ''}

                    <div style="padding: 16px;">
                        <div style="display: flex; align-items: start; justify-content: space-between; gap: 8px;">
                            <div>
                                <h3 style="font-weight: 700; font-size: 16px; color: var(--text-primary);">${item.title}</h3>
                                ${item.description ? `<p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${item.description}</p>` : ''}
                                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                    ${item.youtube_url ? '<span class="badge" style="background: var(--danger-light); color: var(--danger);">YouTube</span>' : ''}
                                    ${photo ? '<span class="badge" style="background: var(--accent-light); color: var(--accent);">Фото</span>' : ''}
                                    ${item.role_target ? `<span class="badge" style="background: var(--purple-light); color: var(--purple);">Для: ${roleLabel(item.role_target)}</span>` : ''}
                                </div>
                            </div>
                            <div style="display: flex; gap: 4px; flex-shrink: 0;">
                                <button class="btn btn-sm ${item.watched ? 'btn-success' : 'btn-secondary'} watch-btn" data-id="${item.id}">
                                    ${item.watched ? '✅' : '👁'}
                                </button>
                                ${canManage ? `<button class="btn btn-sm btn-ghost delete-training" data-id="${item.id}" style="color: var(--danger);">✕</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.watch-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await api.patch(`/api/training/${btn.dataset.id}/watch`);
                    showToast('Отмечено', 'success');
                    loadTraining();
                } catch { /* handled */ }
            };
        });

        list.querySelectorAll('.delete-training').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                showModal({
                    title: 'Удалить урок?',
                    body: 'Урок будет удален из системы',
                    danger: true,
                    confirmText: 'Удалить',
                    onConfirm: async () => {
                        try {
                            await api.delete(`/api/training/${btn.dataset.id}`);
                            showToast('Удалено', 'success');
                            loadTraining();
                        } catch { /* handled */ }
                    },
                });
            };
        });

    } catch {
        list.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 32px;">Ошибка загрузки</div>';
    }
}

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
                name: 'role_target', label: 'Для роли (необязательно)', type: 'select',
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
            } catch { /* handled */ }
        },
    });
}

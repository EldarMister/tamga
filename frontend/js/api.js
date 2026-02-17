import { state, clearState } from './state.js';
import { showToast } from './components/toast.js';

const BASE = '';

async function request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const opts = { method, headers };
    if (body && method !== 'GET') {
        opts.body = JSON.stringify(body);
    }
    try {
        const res = await fetch(`${BASE}${path}`, opts);
        if (res.status === 401) {
            clearState();
            window.location.hash = '#/login';
            return null;
        }
        const data = await res.json();
        if (!res.ok) {
            let msg = data.detail || 'Ошибка сервера';
            if (typeof msg === 'object' && msg.message) msg = msg.message;
            showToast(msg, 'error');
            throw new Error(msg);
        }
        return data;
    } catch (e) {
        if (e.message && !e.message.includes('fetch')) {
            throw e;
        }
        showToast('Нет связи с сервером', 'error');
        throw e;
    }
}

async function uploadFile(path, file, fieldName = 'file') {
    const headers = {};
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const formData = new FormData();
    formData.append(fieldName, file);
    try {
        const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });
        if (res.status === 401) {
            clearState();
            window.location.hash = '#/login';
            return null;
        }
        const data = await res.json();
        if (!res.ok) {
            showToast(data.detail || 'Ошибка загрузки', 'error');
            throw new Error(data.detail);
        }
        return data;
    } catch (e) {
        if (!e.message.includes('fetch')) throw e;
        showToast('Нет связи с сервером', 'error');
        throw e;
    }
}

export const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    upload: uploadFile,
};

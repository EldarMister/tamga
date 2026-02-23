import { state, clearState } from './state.js';
import { showToast } from './components/toast.js';

const BASE = '';
const _cache = new Map();
const CACHE_TTL = 15000; // 15 seconds

function _getCached(path) {
    const entry = _cache.get(path);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return null;
}

function _setCache(path, data) {
    _cache.set(path, { data, ts: Date.now() });
}

function _invalidateCache(path) {
    // Invalidate matching prefix (e.g. POST /api/orders invalidates GET /api/orders*)
    const prefix = path.split('?')[0].replace(/\/\d+\/?.*$/, '');
    for (const key of _cache.keys()) {
        if (key.split('?')[0].startsWith(prefix)) _cache.delete(key);
    }
}

async function request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const opts = { method, headers };
    if (body && method !== 'GET') {
        opts.body = JSON.stringify(body);
    }
    if (method === 'GET') {
        const cached = _getCached(path);
        if (cached) return cached;
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
        if (method === 'GET') _setCache(path, data);
        if (method !== 'GET') _invalidateCache(path);
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
    clearCache: (prefix) => {
        for (const key of [..._cache.keys()]) {
            if (!prefix || key.split('?')[0].startsWith(prefix)) _cache.delete(key);
        }
    },
};

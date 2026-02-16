import { state } from './state.js';

let translations = {};

export async function loadTranslations(lang) {
    try {
        const res = await fetch(`/lang/${lang || state.lang}.json`);
        translations = await res.json();
    } catch {
        // Fallback to Russian
        if (lang !== 'ru') {
            const res = await fetch('/lang/ru.json');
            translations = await res.json();
        }
    }
}

export function t(key) {
    const parts = key.split('.');
    let val = translations;
    for (const p of parts) {
        if (val && typeof val === 'object') {
            val = val[p];
        } else {
            return key;
        }
    }
    return val || key;
}

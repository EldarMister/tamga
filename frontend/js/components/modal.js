export function showModal({ title, body, onConfirm, confirmText = 'Да', cancelText = 'Отмена', danger = false }) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <div class="p-6">
            <h3 class="text-lg font-bold mb-3">${title}</h3>
            <div class="text-gray-600 mb-6">${body}</div>
            <div class="flex gap-3">
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} flex-1" id="modal-confirm">${confirmText}</button>
                <button class="btn btn-secondary flex-1" id="modal-cancel">${cancelText}</button>
            </div>
        </div>
    `;
    overlay.classList.remove('hidden');

    const close = () => overlay.classList.add('hidden');

    document.getElementById('modal-confirm').onclick = () => {
        close();
        if (onConfirm) onConfirm();
    };
    document.getElementById('modal-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

export function showFormModal({ title, fields, onSubmit, submitText = 'Сохранить' }) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');

    const fieldsHtml = fields.map(f => {
        if (f.type === 'select') {
            const opts = f.options.map(o => `<option value="${o.value}" ${o.value === f.value ? 'selected' : ''}>${o.label}</option>`).join('');
            return `<div class="mb-4">
                <label class="input-label">${f.label}</label>
                <select class="input" name="${f.name}">${opts}</select>
            </div>`;
        }
        if (f.type === 'textarea') {
            return `<div class="mb-4">
                <label class="input-label">${f.label}</label>
                <textarea class="input" name="${f.name}" rows="3" placeholder="${f.placeholder || ''}">${f.value || ''}</textarea>
            </div>`;
        }
        if (f.type === 'file') {
            return `<div class="mb-4">
                <label class="input-label">${f.label}</label>
                <input type="file" class="input" name="${f.name}" accept="${f.accept || '*'}">
            </div>`;
        }
        return `<div class="mb-4">
            <label class="input-label">${f.label}</label>
            <input type="${f.type || 'text'}" class="input" name="${f.name}" value="${f.value || ''}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''}>
        </div>`;
    }).join('');

    content.innerHTML = `
        <form class="p-6" id="modal-form">
            <h3 class="text-lg font-bold mb-4">${title}</h3>
            ${fieldsHtml}
            <div class="flex gap-3 mt-6">
                <button type="submit" class="btn btn-primary flex-1">${submitText}</button>
                <button type="button" class="btn btn-secondary flex-1" id="modal-cancel">Отмена</button>
            </div>
        </form>
    `;
    overlay.classList.remove('hidden');

    const close = () => overlay.classList.add('hidden');
    document.getElementById('modal-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    document.getElementById('modal-form').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {};
        for (const [key, val] of formData.entries()) {
            data[key] = val;
        }
        close();
        if (onSubmit) onSubmit(data);
    };
}

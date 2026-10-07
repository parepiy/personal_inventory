// Small UI toolkit: HTML escaping, icons, dialogs, toasts.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const stroke = (body, size = 22, width = 2) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const PAW_SHAPES = '<ellipse cx="5.5" cy="10" rx="2" ry="2.5"/><ellipse cx="9.5" cy="5.8" rx="2" ry="2.6"/><ellipse cx="14.5" cy="5.8" rx="2" ry="2.6"/><ellipse cx="18.5" cy="10" rx="2" ry="2.5"/><path d="M12 12.2c-2.7 0-5.6 3.3-5.6 5.8 0 1.6 1.2 2.5 2.6 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.4 0 2.6-.9 2.6-2.5 0-2.5-2.9-5.8-5.6-5.8z"/>';

export const icon = {
  paw: (size = 22) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor">${PAW_SHAPES}</svg>`,
  sun: (s) => stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', s ?? 18),
  moon: (s) => stroke('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', s ?? 18),
  bell: (s) => stroke('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', s),
  search: (s) => stroke('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', s ?? 20),
  plus: (s) => stroke('<path d="M12 5v14M5 12h14"/>', s ?? 28, 2.6),
  home: (s) => stroke('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>', s ?? 24),
  calendar: (s) => stroke('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>', s ?? 24),
  sliders: (s) => stroke('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', s ?? 24),
  camera: (s) => stroke('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', s ?? 18),
  image: (s) => stroke('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', s ?? 18),
  back: (s) => stroke('<path d="M15 5l-7 7 7 7"/>', s ?? 22, 2.2),
  next: (s) => stroke('<path d="M9 5l7 7-7 7"/>', s ?? 20, 2.2),
  pencil: (s) => stroke('<path d="M4 20h4L19 9l-4-4L4 16z"/>', s),
  trash: (s) => stroke('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', s),
  refresh: (s) => stroke('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>', s ?? 20, 2.2),
  clock: (s) => stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s ?? 14, 2.2),
  cloud: (s) => stroke('<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18z"/>', s ?? 24),
  check: (s) => stroke('<path d="M5 12.5l4.5 4.5L19 7"/>', s ?? 20, 2.4),
  x: (s) => stroke('<path d="M6 6l12 12M18 6L6 18"/>', s ?? 18, 2.2),
  download: (s) => stroke('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', s ?? 20),
  upload: (s) => stroke('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', s ?? 20),
};

/** The light/dark pill switch with the paw knob. */
export function themeToggle(dark) {
  return `<button class="theme-toggle${dark ? ' is-dark' : ''}" data-action="toggle-theme" aria-label="Switch light or dark theme" aria-pressed="${dark}">
    <span class="tt-icon tt-sun">${icon.sun()}</span><span class="tt-icon tt-moon">${icon.moon()}</span>
    <span class="tt-knob">${icon.paw(20)}</span></button>`;
}

/** Item photo (or a pastel tile with its first letter while there's no photo). */
export function photoTile(item, cls = '') {
  const tone = TONES[hash(item.id) % TONES.length];
  const letter = esc((item.name || '?').trim().charAt(0).toUpperCase() || '?');
  const src = item.photo ? ` data-photo="${esc(item.photo)}"` : '';
  return `<div class="photo ${cls} tone-${tone}"${src}><span class="photo-letter">${letter}</span></div>`;
}

const TONES = ['lav', 'sky', 'peach', 'butter', 'mint', 'pink'];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function badge(status) {
  return `<span class="badge badge-${status.kind}">${esc(status.label)}</span>`;
}

/* ---------- dialogs & toasts ---------- */

export function confirmDialog({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog" class="sheet-body">
      <h2 class="sheet-title">${esc(title)}</h2>
      ${body ? `<p class="sheet-text">${body}</p>` : ''}
      <div class="sheet-actions">
        <button value="cancel" class="btn btn-soft">${esc(cancel)}</button>
        <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(ok)}</button>
      </div></form>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    dlg.showModal();
  });
}

export function promptDialog({ title, label, value = '', ok = 'Save' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog" class="sheet-body">
      <h2 class="sheet-title">${esc(title)}</h2>
      <label class="field"><span class="field-label">${esc(label)}</span>
        <input class="input" name="v" value="${esc(value)}" autocomplete="off"></label>
      <div class="sheet-actions">
        <button value="cancel" class="btn btn-soft" formnovalidate>Cancel</button>
        <button value="ok" class="btn btn-primary">${esc(ok)}</button>
      </div></form>`;
    document.body.append(dlg);
    const input = dlg.querySelector('input');
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok' ? input.value.trim() : null);
      dlg.remove();
    });
    dlg.showModal();
    input.focus();
  });
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show${error ? ' toast-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, error ? 6000 : 3000);
}

import * as store from './store.js';
import { applyPrefs, isDark, setPref } from './prefs.js';
import { cachedURL } from './photos.js';
import * as home from './views/home.js';
import * as item from './views/item.js';
import * as edit from './views/edit.js';
import * as reminders from './views/reminders.js';
import * as calendar from './views/calendar.js';
import * as settings from './views/settings.js';
import * as setup from './views/setup.js';

const ROUTES = [
  { re: /^\/?$/, view: home, screen: 'home', tab: 'home' },
  { re: /^\/item\/([^/]+)$/, view: item, screen: 'item', keys: ['id'] },
  { re: /^\/add$/, view: edit, screen: 'edit', live: false },
  { re: /^\/edit\/([^/]+)$/, view: edit, screen: 'edit', keys: ['id'], live: false },
  { re: /^\/reminders$/, view: reminders, screen: 'reminders', tab: 'reminders' },
  { re: /^\/calendar$/, view: calendar, screen: 'calendar', tab: 'calendar' },
  { re: /^\/settings$/, view: settings, screen: 'settings', tab: 'settings' },
  { re: /^\/setup$/, view: setup, screen: 'setup', live: false },
];

const root = document.getElementById('view');
let current = null;
let renderedKey = null;

function match() {
  const path = decodeURI(location.hash.replace(/^#/, '')) || '/';
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { ...r, params };
    }
  }
  return { ...ROUTES[0], params: {} };
}

/** What a screen depends on; it only re-renders when this changes (keeps typing and scroll intact). */
function stateKey(route) {
  const { state } = store;
  const parts = [state.data, state.mode, state.meta.pushEndpoint, state.meta.jobProblem, state.meta.login];
  if (route.screen === 'settings') parts.push(state.sync.status, state.sync.error, state.meta.lastSync);
  return parts;
}

const sameKey = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

function render({ force = false } = {}) {
  if (!store.state.ready) return;
  const route = match();
  if (!store.state.mode && route.screen !== 'setup') {
    location.replace('#/setup');
    return;
  }
  if (current && current.screen === 'edit' && route.screen !== 'edit') edit.reset();
  const sameScreen = current && current.screen === route.screen && current.params.id === route.params.id;
  const key = stateKey(route);
  if (sameScreen && !force && (route.live === false || sameKey(key, renderedKey))) return;

  const focusId = sameScreen ? document.activeElement?.id : null;
  const selection = focusId && document.activeElement.selectionStart != null
    ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  root.innerHTML = route.view.render({ params: route.params });
  document.body.dataset.screen = route.screen;
  document.querySelectorAll('.tabbar [data-tab]').forEach((a) => {
    const on = a.dataset.tab === route.tab;
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  route.view.mount?.(root, { params: route.params });
  hydratePhotos();
  if (!sameScreen) window.scrollTo(0, 0);
  if (focusId) {
    const el = document.getElementById(focusId);
    el?.focus();
    if (selection && el?.setSelectionRange) {
      try { el.setSelectionRange(...selection); } catch { /* not a text field */ }
    }
  }
  current = route;
  renderedKey = key;
}

function hydratePhotos() {
  root.querySelectorAll('[data-photo]').forEach((tile) => {
    const path = tile.dataset.photo;
    const put = (url) => {
      if (!url || !tile.isConnected || tile.querySelector('img')) return;
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      img.className = 'photo-img';
      tile.append(img);
      tile.classList.add('has-img');
    };
    const cached = cachedURL(path);
    if (cached) put(cached);
    else store.photoURL(path).then(put);
  });
  root.querySelectorAll('[data-photo-img]').forEach((img) => {
    store.photoURL(img.dataset.photoImg).then((url) => {
      if (url) img.src = url;
    });
  });
}

root.addEventListener('paw:rerender', () => render({ force: true }));
root.addEventListener('paw:hydrate', hydratePhotos);

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action="toggle-theme"]');
  if (!t) return;
  setPref('theme', isDark() ? 'light' : 'dark');
  render({ force: true });
});

window.addEventListener('hashchange', () => render());
store.onChange(() => render());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.hash) location.hash = e.data.hash;
  });
}

applyPrefs();
store.init().then(() => render({ force: true }));

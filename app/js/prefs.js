// Look-and-feel choices for this device (not synced: your Mac and iPhone can differ).

export const ACCENTS = [
  { id: 'pink', label: 'Pink' },
  { id: 'lav', label: 'Lavender' },
  { id: 'mint', label: 'Mint' },
  { id: 'peach', label: 'Peach' },
  { id: 'sky', label: 'Sky blue' },
];

const KEY = 'paw.prefs';
const defaults = { theme: 'auto', accent: 'pink', paws: true };

function read() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export const prefs = read();
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export const isDark = () => (prefs.theme === 'auto' ? darkQuery.matches : prefs.theme === 'dark');

export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = isDark() ? 'dark' : 'light';
  root.dataset.accent = prefs.accent;
  root.dataset.paws = prefs.paws ? 'on' : 'off';
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#FDF6FA');
}

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* private mode: still applies for this visit */ }
  applyPrefs();
}

darkQuery.addEventListener('change', () => {
  if (prefs.theme === 'auto') applyPrefs();
});

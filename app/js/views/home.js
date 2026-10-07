import * as store from '../store.js';
import { ageText, formatMonthYear, itemStatus } from '../dates.js';
import { badge, esc, icon, photoTile, themeToggle } from '../ui.js';
import { isDark } from '../prefs.js';

const view = { category: 'All', query: '', sort: 'expiry' };

const SORTS = [
  ['expiry', 'Expiry'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['name', 'Name'],
];

function decorate(items, today, soon) {
  return items.map((it) => ({ it, st: itemStatus(it, today, soon) }));
}

function sortRows(rows) {
  const by = {
    expiry: (a, b) => a.st.days - b.st.days || a.it.name.localeCompare(b.it.name),
    newest: (a, b) => (b.it.got || '').localeCompare(a.it.got || ''),
    oldest: (a, b) => (a.it.got || '').localeCompare(b.it.got || ''),
    name: (a, b) => a.it.name.localeCompare(b.it.name),
  }[view.sort];
  return rows.sort(by);
}

function card({ it, st }, today) {
  return `<a class="card item-card" href="#/item/${encodeURIComponent(it.id)}">
    ${photoTile(it, 'photo-card')}
    <span class="card-name">${esc(it.name)}</span>
    <span class="card-age">${icon.clock()} ${esc(ageText(it.got, today))}</span>
    ${it.got ? `<span class="card-sub">Got ${esc(formatMonthYear(it.got))}</span>` : ''}
    ${badge(st)}
  </a>`;
}

function gridHTML(rows, today) {
  const q = view.query.trim().toLowerCase();
  const shown = sortRows(rows.filter(({ it }) => (view.category === 'All' || it.category === view.category)
    && (!q || `${it.name} ${it.category} ${it.notes}`.toLowerCase().includes(q))));
  if (!shown.length) {
    return `<p class="empty-note">${icon.paw(20)} ${rows.length ? 'Nothing matches. Try another search or category.' : ''}</p>`;
  }
  return shown.map((r) => card(r, today)).join('');
}

export function render() {
  const today = store.today();
  const soon = store.state.data.settings.soonDays;
  const rows = decorate(store.items(), today, soon);
  const expired = rows.filter((r) => r.st.kind === 'expired');
  const soonRows = rows.filter((r) => r.st.kind === 'soon');
  const attention = [...expired, ...soonRows].sort((a, b) => a.st.days - b.st.days);
  const used = new Set(rows.map((r) => r.it.category).filter(Boolean));
  const cats = ['All', ...store.state.data.categories.list.filter((c) => used.has(c)),
    ...[...used].filter((c) => !store.state.data.categories.list.includes(c))];
  if (!cats.includes(view.category)) view.category = 'All';
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  let hero;
  if (!rows.length) {
    hero = `<section class="hero hero-lav">
      <span class="hero-kicker">Welcome!</span>
      <span class="hero-title">Let's sniff out your first thing</span>
      <span class="hero-text">Tap the + button to add something with a photo, the date you got it and when it expires.</span>
      <span class="hero-paw">${icon.paw(96)}</span></section>`;
  } else if (attention.length) {
    hero = `<section class="hero hero-lav">
      <span class="hero-kicker">Woof! Heads up</span>
      <span class="hero-title">${attention.length} ${attention.length === 1 ? 'thing needs' : 'things need'} your attention</span>
      <div class="chip-row">
        <span class="pill pill-surface">${rows.length} items</span>
        ${expired.length ? `<span class="pill badge-expired">${expired.length} expired</span>` : ''}
        ${soonRows.length ? `<span class="pill badge-soon">${soonRows.length} within ${soon} days</span>` : ''}
      </div>
      <span class="hero-paw">${icon.paw(96)}</span></section>`;
  } else {
    hero = `<section class="hero hero-mint">
      <span class="hero-kicker">Good dog!</span>
      <span class="hero-title">Nothing expires in the next ${soon} days</span>
      <div class="chip-row"><span class="pill pill-surface">${rows.length} items</span></div>
      <span class="hero-paw">${icon.paw(96)}</span></section>`;
  }

  return `
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">${icon.paw(26)}</div>
      <div class="brand-text"><span class="brand-name">Pawventory</span><span class="brand-date">${esc(dateLine)}</span></div>
    </div>
    <div class="topbar-actions">
      ${themeToggle(isDark())}
      <a class="icon-btn" href="#/reminders" aria-label="Reminders${attention.length ? `, ${attention.length} need attention` : ''}">
        ${icon.bell()}${attention.length ? `<span class="count">${attention.length}</span>` : ''}
      </a>
    </div>
  </header>
  <main class="page">
    ${hero}
    ${attention.length ? `<section class="stack">
      <div class="section-head"><h2 class="h2">Replace soon</h2><a class="link" href="#/reminders">See all</a></div>
      <div class="hscroll">${attention.map(({ it, st }) => `
        <a class="card soon-card" href="#/item/${encodeURIComponent(it.id)}">
          ${photoTile(it, 'photo-soon')}
          <span class="card-name">${esc(it.name)}</span>
          <span class="card-sub">${esc(ageText(it.got, today))}</span>
          ${badge(st)}
        </a>`).join('')}</div>
    </section>` : ''}
    ${rows.length ? `
    <label class="search">${icon.search()}
      <input id="search" type="search" placeholder="Search your things" aria-label="Search your things" value="${esc(view.query)}" autocomplete="off">
    </label>
    <div class="chips hscroll" role="group" aria-label="Category">${cats.map((c) => `
      <button class="chip${c === view.category ? ' is-on' : ''}" data-cat="${esc(c)}" aria-pressed="${c === view.category}">${esc(c)}</button>`).join('')}
    </div>
    <section class="stack">
      <div class="section-head">
        <h2 class="h2">All belongings <span class="muted">· ${rows.length}</span></h2>
        <label class="sort"><span class="visually-hidden">Sort by</span>
          <select id="sort">${SORTS.map(([v, l]) => `<option value="${v}"${v === view.sort ? ' selected' : ''}>Sort: ${l}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid" id="grid">${gridHTML(rows, today)}</div>
    </section>` : ''}
  </main>`;
}

export function mount(root) {
  const today = store.today();
  const rows = () => decorate(store.items(), today, store.state.data.settings.soonDays);
  const grid = root.querySelector('#grid');
  const refresh = () => {
    if (!grid) return;
    grid.innerHTML = gridHTML(rows(), today);
    root.dispatchEvent(new CustomEvent('paw:hydrate', { bubbles: true }));
  };
  root.querySelector('#search')?.addEventListener('input', (e) => {
    view.query = e.target.value;
    refresh();
  });
  root.querySelector('#sort')?.addEventListener('change', (e) => {
    view.sort = e.target.value;
    refresh();
  });
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    view.category = b.dataset.cat;
    root.querySelectorAll('[data-cat]').forEach((x) => {
      const on = x.dataset.cat === view.category;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-pressed', on);
    });
    refresh();
  }));
}

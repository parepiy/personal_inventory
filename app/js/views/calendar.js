import * as store from '../store.js';
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, ageText, daysInMonth, formatWeekday, itemStatus, parts } from '../dates.js';
import { badge, esc, icon, photoTile, themeToggle } from '../ui.js';
import { isDark } from '../prefs.js';

const pad = (n) => String(n).padStart(2, '0');
let ym = null; // [year, monthIndex] being shown
let selected = null; // 'YYYY-MM-DD'

function rowsWithExpiry(today) {
  const soon = store.state.data.settings.soonDays;
  return store.items().filter((it) => it.exp)
    .map((it) => ({ it, st: itemStatus(it, today, soon) }))
    .sort((a, b) => a.it.exp.localeCompare(b.it.exp));
}

function itemRow({ it, st }, today) {
  return `<a class="card list-row" href="#/item/${encodeURIComponent(it.id)}">
    ${photoTile(it, 'photo-row')}
    <span class="list-main"><span class="card-name">${esc(it.name)}</span>
      <span class="card-sub">${esc(ageText(it.got, today))}</span></span>
    ${badge(st)}
  </a>`;
}

export function render() {
  const today = store.today();
  if (!ym) {
    const [y, m] = parts(today);
    ym = [y, m - 1];
    selected = today;
  }
  const [y, m] = ym;
  const prefix = `${y}-${pad(m + 1)}-`;
  const rows = rowsWithExpiry(today);
  const inMonth = rows.filter((r) => r.it.exp.startsWith(prefix));
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push('<span></span>');
  for (let d = 1; d <= daysInMonth(y, m); d += 1) {
    const key = prefix + pad(d);
    const due = inMonth.filter((r) => r.it.exp === key);
    const cls = ['day', key === selected ? 'is-selected' : '', key === today ? 'is-today' : '', due.length ? 'has-due' : '']
      .filter(Boolean).join(' ');
    const label = `${MONTHS[m]} ${d}${due.length ? `, ${due.length} due` : ''}${key === today ? ', today' : ''}`;
    cells.push(`<button class="${cls}" data-day="${key}" aria-label="${esc(label)}" aria-pressed="${key === selected}">
      ${d}<span class="day-dots">${due.slice(0, 3).map((r) => `<span class="dot dot-${r.st.kind}"></span>`).join('')}</span></button>`);
  }

  const selRows = rows.filter((r) => r.it.exp === selected);
  const [, sm, sd] = parts(selected);

  return `
  <header class="topbar">
    <h1 class="h1">Calendar</h1>
    ${themeToggle(isDark())}
  </header>
  <main class="page">
    <section class="card pad-sm stack-tight">
      <div class="row-between">
        <button class="icon-btn icon-btn-soft" data-month="-1" aria-label="Previous month">${icon.back(20)}</button>
        <h2 class="h2">${MONTHS[m]} ${y}</h2>
        <button class="icon-btn icon-btn-soft" data-month="1" aria-label="Next month">${icon.next()}</button>
      </div>
      <div class="cal-head" aria-hidden="true">${WEEKDAYS_SHORT.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      <div class="legend">
        <span><span class="dot dot-expired"></span>Expired</span>
        <span><span class="dot dot-soon"></span>Soon</span>
        <span><span class="dot dot-ok"></span>Later</span>
        ${selected !== today ? '<button class="mini" data-act="today">Today</button>' : ''}
      </div>
    </section>
    <section class="stack">
      <h2 class="h2">Due ${esc(formatWeekday(selected))}, ${MONTHS_SHORT[sm - 1]} ${sd}</h2>
      ${selRows.length ? selRows.map((r) => itemRow(r, today)).join('')
    : `<p class="note-soft">${icon.paw(20)} Nothing due this day. Good dog!</p>`}
    </section>
    <section class="stack">
      <h2 class="h2">All in ${MONTHS[m]} <span class="muted">· ${inMonth.length}</span></h2>
      ${inMonth.length ? inMonth.map(({ it, st }) => {
    const [, , d] = parts(it.exp);
    return `<a class="card list-row list-row-flat" href="#/item/${encodeURIComponent(it.id)}">
          <span class="date-chip"><span>${MONTHS_SHORT[m].toUpperCase()}</span><b>${d}</b></span>
          <span class="dot dot-${st.kind}"></span>
          <span class="list-main"><span class="card-name">${esc(it.name)}</span>
            <span class="card-sub">${esc(ageText(it.got, today))}</span></span>
          <span class="muted strong-sm">${esc(st.label)}</span>
        </a>`;
  }).join('') : `<p class="note-soft">${icon.paw(20)} Nothing expires this month.</p>`}
    </section>
  </main>`;
}

export function mount(root) {
  const rerender = () => root.dispatchEvent(new CustomEvent('paw:rerender', { bubbles: true }));
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    selected = b.dataset.day;
    rerender();
  }));
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Date.UTC(ym[0], ym[1] + Number(b.dataset.month), 1));
    ym = [d.getUTCFullYear(), d.getUTCMonth()];
    const prefix = `${ym[0]}-${pad(ym[1] + 1)}-`;
    const first = rowsWithExpiry(store.today()).find((r) => r.it.exp.startsWith(prefix));
    selected = first ? first.it.exp : `${prefix}01`;
    rerender();
  }));
  root.querySelector('[data-act="today"]')?.addEventListener('click', () => {
    ym = null;
    rerender();
  });
}

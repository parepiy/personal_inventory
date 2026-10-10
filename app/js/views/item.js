import * as store from '../store.js';
import { ageLabel, formatDate, itemStatus, lifespanUsed, renewedDates } from '../dates.js';
import { REMIND_CHOICES } from '../model.js';
import { confirmDialog, esc, icon, photoTile, themeToggle, toast } from '../ui.js';
import { isDark } from '../prefs.js';

const BANNER = {
  expired: { cls: 'banner-expired', sub: 'Time to replace it' },
  soon: { cls: 'banner-soon', sub: 'Time to start looking for a new one' },
  ok: { cls: 'banner-ok', sub: 'All good for now' },
};

export function render({ params }) {
  const it = store.findItem(params.id);
  if (!it) {
    return `<header class="topbar"><a class="icon-btn" href="#/" aria-label="Back to home">${icon.back()}</a></header>
      <main class="page"><p class="empty-note">${icon.paw(20)} This item is gone. It may have been deleted on another device.</p></main>`;
  }
  const today = store.today();
  const st = itemStatus(it, today, store.state.data.settings.soonDays);
  const used = lifespanUsed(it.got, it.exp, today);
  const remind = Array.isArray(it.remindDays) ? it.remindDays : store.state.data.settings.defaultRemindDays;
  const banner = BANNER[st.kind];
  const history = [...(it.history || [])].reverse();

  return `
  <div class="detail-hero">
    ${photoTile(it, 'photo-hero')}
    <div class="detail-bar">
      <a class="icon-btn" href="#/" aria-label="Back to home">${icon.back()}</a>
      ${themeToggle(isDark())}
    </div>
  </div>
  <main class="page page-detail">
    <div class="stack-tight">
      ${it.category || it.brand ? `<div class="chip-row">
        ${it.category ? `<span class="pill pill-soft">${esc(it.category)}${it.subcategory ? ` › ${esc(it.subcategory)}` : ''}</span>` : ''}
        ${it.brand ? `<span class="pill pill-brand">${esc(it.brand)}</span>` : ''}
      </div>` : ''}
      <h1 class="h1">${esc(it.name)}</h1>
    </div>
    ${banner ? `<div class="banner ${banner.cls}">${icon.clock(26)}
      <div><strong>${esc(st.label)}</strong><span>${banner.sub}</span></div></div>` : ''}
    <section class="card pad stack">
      <div class="two-col">
        <div class="stat"><span class="stat-label">GOT IT ON</span><span class="stat-value">${esc(formatDate(it.got) || '—')}</span></div>
        <div class="stat"><span class="stat-label">${it.exp ? 'EXPIRES ON' : 'EXPIRES'}</span><span class="stat-value">${esc(it.exp ? formatDate(it.exp) : 'Never')}</span></div>
      </div>
      <div class="stat"><span class="stat-label">AGE</span><span class="stat-value">${esc(ageLabel(it.got, today) || '—')}</span></div>
      ${used != null ? `<div class="stack-tight">
        <div class="meter" role="meter" aria-label="Lifespan used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used * 100)}">
          <span style="width:${Math.round(used * 100)}%"></span></div>
        <div class="meter-caption"><span>${Math.round(used * 100)}% of its life used</span></div>
      </div>` : ''}
    </section>
    ${it.exp ? `<section class="card pad stack">
      <h2 class="h3">${icon.bell(20)} Remind me before</h2>
      <div class="chip-row" role="group" aria-label="Remind me before">${REMIND_CHOICES.map((d) => `
        <button class="chip${remind.includes(d) ? ' is-on' : ''}" data-remind="${d}" aria-pressed="${remind.includes(d)}">${d} ${d === 1 ? 'day' : 'days'}</button>`).join('')}
      </div>
      <p class="hint">Also on the day it expires${store.state.data.settings.nagExpired ? ', then weekly until replaced' : ''}.</p>
    </section>` : ''}
    ${it.notes ? `<section class="card pad stack-tight"><h2 class="h3">Notes</h2><p class="notes">${esc(it.notes)}</p></section>` : ''}
    ${history.length ? `<section class="card pad stack-tight"><h2 class="h3">Replaced ${history.length} ${history.length === 1 ? 'time' : 'times'}</h2>
      <ul class="history">${history.map((h) => `<li>Replaced ${esc(formatDate(h.replacedOn))} <span class="muted">(had it since ${esc(formatDate(h.got) || '?')})</span></li>`).join('')}</ul></section>` : ''}
  </main>
  <div class="actionbar">
    <button class="icon-btn icon-btn-soft" data-act="delete" aria-label="Delete item">${icon.trash()}</button>
    <a class="icon-btn icon-btn-soft" href="#/edit/${encodeURIComponent(it.id)}" aria-label="Edit item">${icon.pencil()}</a>
    <button class="btn btn-primary btn-grow" data-act="replace">${icon.refresh()} I replaced it</button>
  </div>`;
}

export function mount(root, { params }) {
  const it = store.findItem(params.id);
  if (!it) return;
  root.querySelectorAll('[data-remind]').forEach((b) => b.addEventListener('click', () => {
    const current = Array.isArray(it.remindDays) ? it.remindDays : store.state.data.settings.defaultRemindDays;
    const d = Number(b.dataset.remind);
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort((a, z) => a - z);
    store.updateItemFields(it.id, { remindDays: next });
  }));
  root.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Delete ${it.name}?`, body: 'It will be removed from all your devices.', ok: 'Delete', danger: true,
    });
    if (!ok) return;
    await store.deleteItem(it.id);
    toast(`${it.name} deleted`);
    location.hash = '#/';
  });
  root.querySelector('[data-act="replace"]').addEventListener('click', async () => {
    const next = renewedDates(it, store.today());
    const body = it.exp
      ? `New dates: got today, expires <strong>${esc(formatDate(next.exp))}</strong> (same lifespan as before).`
      : 'Sets "got it on" to today.';
    const ok = await confirmDialog({ title: `Replaced your ${it.name}?`, body, ok: 'Yes, replaced' });
    if (!ok) return;
    await store.replaceItem(it.id);
    toast('Good dog! Dates updated.');
  });
}

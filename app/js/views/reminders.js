import * as store from '../store.js';
import { ageText, formatShort, itemStatus } from '../dates.js';
import { REMIND_CHOICES } from '../model.js';
import { deviceName, pushBlocker } from '../push.js';
import { esc, icon, photoTile, themeToggle, toast } from '../ui.js';
import { isDark } from '../prefs.js';

function groups(today) {
  const soon = store.state.data.settings.soonDays;
  const rows = store.items().filter((it) => it.exp).map((it) => ({ it, st: itemStatus(it, today, soon) }))
    .sort((a, b) => a.st.days - b.st.days);
  return [
    { title: 'Expired', dot: 'expired', rows: rows.filter((r) => r.st.days < 0) },
    { title: 'Next 14 days', dot: 'soon', rows: rows.filter((r) => r.st.days >= 0 && r.st.days <= 14) },
    { title: `Next ${soon} days`, dot: 'butter', rows: rows.filter((r) => r.st.days > 14 && r.st.days <= Math.max(soon, 14)) },
    { title: 'Later', dot: 'ok', rows: rows.filter((r) => r.st.days > Math.max(soon, 14)) },
  ].filter((g) => g.rows.length);
}

function row({ it, st }, today) {
  const when = st.days < 0 ? `Expired ${formatShort(it.exp)}` : `Expires ${formatShort(it.exp)}`;
  return `<a class="card list-row" href="#/item/${encodeURIComponent(it.id)}">
    ${photoTile(it, 'photo-row')}
    <span class="list-main"><span class="card-name">${esc(it.name)}</span>
      <span class="card-sub">${esc(when)} · ${esc(ageText(it.got, today))}</span></span>
    <span class="badge badge-${st.kind}">${st.days < 0 ? `${-st.days}d ago` : st.days === 0 ? 'Today' : `${st.days} days`}</span>
  </a>`;
}

function pushPanel() {
  const { mode, meta } = store.state;
  if (mode !== 'github') {
    return `<div class="note">${icon.bell(20)}<div><strong>Notifications need sync</strong>
      <span>Connect GitHub in Settings so a daily job can notify your iPhone and Mac.</span>
      <a class="link" href="#/settings">Open Settings</a></div></div>`;
  }
  if (meta.jobProblem === 'workflow-permission') {
    return `<div class="note note-warn">${icon.bell(20)}<div><strong>Reminders can't be installed yet</strong>
      <span>Your GitHub token needs the <b>Workflows: Read and write</b> permission. Edit the token on GitHub, then tap Sync now in Settings.</span></div></div>`;
  }
  const blocker = pushBlocker();
  if (blocker === 'add-to-home') {
    return `<div class="note">${icon.bell(20)}<div><strong>One step first</strong>
      <span>On iPhone, notifications only work from the installed app: tap the Share button in Safari, then <b>Add to Home Screen</b>, and open Pawventory from there.</span></div></div>`;
  }
  if (blocker === 'unsupported') {
    return `<div class="note">${icon.bell(20)}<div><strong>Not available in this browser</strong>
      <span>Use Safari on iPhone (iOS 16.4+) or Mac to get notifications.</span></div></div>`;
  }
  if (blocker === 'denied') {
    return `<div class="note note-warn">${icon.bell(20)}<div><strong>Notifications are blocked</strong>
      <span>Allow them in Settings → Notifications → Pawventory (or Safari's website settings on Mac), then come back.</span></div></div>`;
  }
  const on = Boolean(meta.pushEndpoint) && Notification.permission === 'granted';
  return `<div class="row-between">
      <div class="stack-tight"><span class="strong" id="push-label">Notifications on this ${esc(deviceName())}</span>
        <span class="hint">${on ? 'On' : 'Off'}</span></div>
      <button class="switch" role="switch" id="push" aria-checked="${on}" aria-labelledby="push-label"><span></span></button>
    </div>
    ${on ? `<button class="btn btn-soft" data-act="test">${icon.bell(18)} Send a test notification</button>` : ''}`;
}

export function render() {
  const today = store.today();
  const s = store.state.data.settings;
  const gs = groups(today);
  return `
  <header class="topbar">
    <h1 class="h1">Reminders</h1>
    ${themeToggle(isDark())}
  </header>
  <main class="page">
    <section class="card pad stack">
      ${pushPanel()}
      <div class="divider"></div>
      <label class="row-between"><span class="strong">Daily check at</span>
        <input class="input input-compact" id="notify-time" type="time" value="${esc(s.notifyTime)}">
      </label>
      <div class="field"><span class="field-label" id="def-label">Default reminder for new items</span>
        <div class="chip-row" role="group" aria-labelledby="def-label">${REMIND_CHOICES.map((d) => `
          <button class="chip${s.defaultRemindDays.includes(d) ? ' is-on chip-mint' : ''}" data-def="${d}" aria-pressed="${s.defaultRemindDays.includes(d)}">${d} ${d === 1 ? 'day' : 'days'}</button>`).join('')}
        </div>
      </div>
      <div class="row-between">
        <span class="strong" id="nag-label">Keep reminding weekly after expiry</span>
        <button class="switch" role="switch" id="nag" aria-checked="${s.nagExpired}" aria-labelledby="nag-label"><span></span></button>
      </div>
      <p class="hint">GitHub runs the check once a day, sometimes up to an hour late.</p>
    </section>
    ${gs.length ? gs.map((g) => `<section class="stack">
      <div class="section-head"><h2 class="h2"><span class="dot dot-${g.dot}"></span>${esc(g.title)} <span class="muted">· ${g.rows.length}</span></h2></div>
      ${g.rows.map((r) => row(r, today)).join('')}
    </section>`).join('') : `<p class="empty-note">${icon.paw(20)} Nothing with an expiry date yet.</p>`}
  </main>`;
}

export function mount(root) {
  const $ = (q) => root.querySelector(q);
  const s = store.state.data.settings;
  $('#push')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      if (btn.getAttribute('aria-checked') === 'true') {
        await store.disableNotifications();
        toast('Notifications off for this device');
      } else {
        await store.enableNotifications();
        toast('Notifications on!');
      }
    } catch (err) {
      toast(err.message, { error: true });
      btn.disabled = false;
    }
  });
  $('[data-act="test"]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await store.sendTestNotification();
      toast('On its way! It usually arrives within a minute or two.');
    } catch (err) {
      toast(`Could not start the test: ${err.message}`, { error: true });
    }
  });
  $('#notify-time').addEventListener('change', (e) => {
    if (e.target.value) store.updateSettings({ notifyTime: e.target.value, timezone: store.localZone });
  });
  root.querySelectorAll('[data-def]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.def);
    const next = s.defaultRemindDays.includes(d)
      ? s.defaultRemindDays.filter((x) => x !== d)
      : [...s.defaultRemindDays, d].sort((a, z) => a - z);
    store.updateSettings({ defaultRemindDays: next });
  }));
  $('#nag').addEventListener('click', () => store.updateSettings({ nagExpired: !s.nagExpired }));
}

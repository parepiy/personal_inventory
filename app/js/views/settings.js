import * as store from '../store.js';
import { ACCENTS, isDark, prefs, setPref } from '../prefs.js';
import { confirmDialog, esc, icon, promptDialog, themeToggle, toast } from '../ui.js';

function ago(ms) {
  if (!ms) return 'not yet';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function syncCard() {
  const { mode, meta, sync } = store.state;
  if (mode !== 'github') {
    return `<section class="hero hero-peach">
      <span class="hero-title hero-title-sm">Only on this device</span>
      <span class="hero-text">Connect GitHub to sync your iPhone and Mac and get expiry notifications.</span>
      <a class="btn btn-surface btn-start" href="#/setup">${icon.cloud(20)} Connect GitHub</a>
    </section>`;
  }
  const status = {
    syncing: 'Syncing…',
    error: 'Sync problem',
    offline: 'Offline — will sync later',
    idle: `Synced ${ago(meta.lastSync)}`,
  }[sync.status];
  return `<section class="hero ${sync.status === 'error' ? 'hero-pink' : 'hero-mint'}">
    <div class="row-start">
      <span class="tile-icon">${icon.cloud()}</span>
      <div class="stack-tight"><strong>${esc(status)}</strong>
        <span class="hero-text">Private repo: <a class="link-plain" href="${esc(store.dataRepoURL())}" target="_blank" rel="noopener">${esc(meta.login)}/${store.DATA_REPO}</a></span></div>
    </div>
    ${sync.error ? `<span class="hero-text">${esc(sync.error)}</span>` : ''}
    <div class="chip-row">
      <button class="btn btn-surface" data-act="sync" ${sync.status === 'syncing' ? 'disabled' : ''}>${icon.refresh(18)} Sync now</button>
      <button class="btn btn-ghost" data-act="disconnect">Disconnect</button>
    </div>
  </section>`;
}

export function render() {
  const cats = store.state.data.categories.list;
  const used = new Set(store.items().map((it) => it.category));
  const modes = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']];
  return `
  <header class="topbar">
    <h1 class="h1">Settings</h1>
    ${themeToggle(isDark())}
  </header>
  <main class="page">
    ${syncCard()}

    <section class="stack-tight">
      <h2 class="caps">Appearance</h2>
      <div class="card pad stack">
        <div class="field"><span class="field-label" id="theme-label">Theme</span>
          <div class="segmented" role="group" aria-labelledby="theme-label">${modes.map(([v, l]) => `
            <button class="${prefs.theme === v ? 'is-on' : ''}" data-theme-mode="${v}" aria-pressed="${prefs.theme === v}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="field"><span class="field-label" id="accent-label">Accent color</span>
          <div class="chip-row" role="group" aria-labelledby="accent-label">${ACCENTS.map((a) => `
            <button class="swatch swatch-${a.id}${prefs.accent === a.id ? ' is-on' : ''}" data-accent="${a.id}" aria-label="${a.label}" aria-pressed="${prefs.accent === a.id}">${prefs.accent === a.id ? icon.paw(18) : ''}</button>`).join('')}
          </div>
        </div>
        <div class="row-between">
          <span class="strong" id="paws-label">Paw-print background</span>
          <button class="switch" role="switch" id="paws" aria-checked="${prefs.paws}" aria-labelledby="paws-label"><span></span></button>
        </div>
      </div>
    </section>

    <section class="stack-tight">
      <h2 class="caps">Reminders</h2>
      <div class="card list">
        <a class="list-link" href="#/reminders"><span class="strong">Notifications &amp; daily time</span>
          <span class="muted">${esc(store.state.data.settings.notifyTime)} ${icon.next(16)}</span></a>
      </div>
    </section>

    <section class="stack-tight">
      <h2 class="caps">Categories</h2>
      <div class="card list">
        ${cats.map((c) => `<div class="list-link"><span class="strong">${esc(c)}</span>
          <button class="icon-btn icon-btn-small" data-del-cat="${esc(c)}" aria-label="Remove category ${esc(c)}"${used.has(c) ? ' data-used="1"' : ''}>${icon.x()}</button></div>`).join('')}
        <button class="list-link list-button" data-act="add-cat"><span class="strong">+ Add category</span></button>
      </div>
    </section>

    <section class="stack-tight">
      <h2 class="caps">Backup</h2>
      <div class="card list">
        <button class="list-link list-button" data-act="export"><span class="strong">Export backup</span><span class="muted">JSON ${icon.download(18)}</span></button>
        <label class="list-link list-button" for="import-file"><span class="strong">Import backup</span><span class="muted">${icon.upload(18)}</span></label>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
      </div>
      <p class="hint">Backups contain your list, not the photos (those stay in your private repo).</p>
    </section>

    <p class="about">${icon.paw(16)} Pawventory · made with paws</p>
  </main>`;
}

export function mount(root) {
  const $ = (q) => root.querySelector(q);
  const rerender = () => root.dispatchEvent(new CustomEvent('paw:rerender', { bubbles: true }));

  root.querySelectorAll('[data-theme-mode]').forEach((b) => b.addEventListener('click', () => {
    setPref('theme', b.dataset.themeMode);
    rerender();
  }));
  root.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => {
    setPref('accent', b.dataset.accent);
    rerender();
  }));
  $('#paws').addEventListener('click', () => {
    setPref('paws', !prefs.paws);
    rerender();
  });

  $('[data-act="sync"]')?.addEventListener('click', () => store.syncNow());
  $('[data-act="disconnect"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Disconnect GitHub?',
      body: 'Your things stay on this device and in your private repo. This device stops syncing and stops getting notifications.',
      ok: 'Disconnect',
      danger: true,
    });
    if (ok) {
      await store.disconnect();
      toast('Disconnected');
    }
  });

  root.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', async () => {
    const name = b.dataset.delCat;
    if (b.dataset.used) {
      const ok = await confirmDialog({
        title: `Remove "${name}"?`, body: 'Items in it keep the label; it just leaves this list.', ok: 'Remove', danger: true,
      });
      if (!ok) return;
    }
    await store.setCategories(store.state.data.categories.list.filter((c) => c !== name));
  }));
  $('[data-act="add-cat"]').addEventListener('click', async () => {
    const name = await promptDialog({ title: 'New category', label: 'Name', ok: 'Add' });
    if (name) await store.setCategories([...store.state.data.categories.list, name]);
  });

  $('[data-act="export"]').addEventListener('click', () => {
    const blob = new Blob([store.exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pawventory-backup-${store.today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await store.importBackup(JSON.parse(await file.text()));
      toast('Backup imported');
    } catch {
      toast('That file is not a Pawventory backup.', { error: true });
    }
  });
}

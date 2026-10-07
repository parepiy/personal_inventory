// App state, saved on the device first and synced to the private GitHub repo.

import * as idb from './idb.js';
import * as photos from './photos.js';
import { GitHub, explainError } from './github.js';
import { cronFor, renewedDates, todayISO } from './dates.js';
import { emptyData, liveItems, merge, newId, normalize, referencedPhotos, sameData } from './model.js';
import { attentionCount } from './reminders.js';
import { generateVapidKeys, setBadge, subscribe, unsubscribe } from './push.js';

export const DATA_REPO = 'pawventory-data';
const DATA_PATH = 'data/items.json';
const VAPID_PATH = 'config/vapid.json';
const SUBS_PATH = 'push/subscriptions.json';
const WORKFLOW_FILE = 'reminders.yml';
const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`;

// Bump when the reminder job files change, so every device reinstalls them once.
export const REMOTE_VERSION = 1;
const JOB_FILES = [
  ['js/dates.js', 'scripts/dates.js'],
  ['js/model.js', 'scripts/model.js'],
  ['js/reminders.js', 'scripts/reminders.js'],
  ['js/remind-job.mjs', 'scripts/remind-job.mjs'],
];

export const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const freshMeta = () => ({
  login: null,
  branch: 'main',
  lastSync: 0,
  pendingUploads: [],
  pendingDeletes: [],
  vapidPublic: null,
  installedVersion: 0,
  installedCron: null,
  jobProblem: null,
  pushEndpoint: null,
});

export const state = {
  ready: false,
  mode: null, // 'github' | 'local' | null (not set up yet)
  data: emptyData(localZone),
  meta: freshMeta(),
  sync: { status: 'idle', error: null }, // idle | syncing | error | offline
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(state));

const storage = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch { /* private mode */ }
  },
};

const token = () => storage.get('paw.token');
const client = () => new GitHub(token());
const repoArgs = () => [state.meta.login, DATA_REPO];

export const today = () => todayISO(state.data.settings.timezone || localZone);
export const items = () => liveItems(state.data);
export const findItem = (id) => state.data.items.find((it) => it.id === id && !it.deleted);

async function persist() {
  await Promise.all([idb.set('kv', 'data', state.data), idb.set('kv', 'meta', state.meta)]);
}

function refreshBadge() {
  setBadge(attentionCount(state.data, today()));
}

export async function init() {
  try {
    const [data, meta] = await Promise.all([idb.get('kv', 'data'), idb.get('kv', 'meta')]);
    if (data) state.data = normalize(data, localZone);
    if (meta) state.meta = { ...freshMeta(), ...meta };
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  state.mode = storage.get('paw.mode');
  if (state.mode === 'github' && !token()) state.mode = null;
  state.ready = true;
  emit();
  refreshBadge();
  if (state.mode === 'github') syncNow();
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshBadge();
      syncNow();
    }
  });
}

/* ---------- changes ---------- */

let syncTimer;
function scheduleSync(delay = 1200) {
  if (state.mode !== 'github') return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

async function commit(mutator) {
  const data = structuredClone(state.data);
  mutator(data);
  state.data = data;
  await persist();
  emit();
  refreshBadge();
  scheduleSync();
}

function queue(list, path) {
  if (!path) return;
  if (list === 'pendingDeletes' && state.mode !== 'github') {
    photos.forgetPhoto(path); // nothing on GitHub to clean up
    return;
  }
  if (!state.meta[list].includes(path)) state.meta[list] = [...state.meta[list], path];
}

/**
 * Creates or updates an item. `photo`: a Blob to set a new photo, null to remove it,
 * undefined to leave it as it is.
 */
export async function saveItem(fields, photo) {
  const now = Date.now();
  const existing = fields.id ? state.data.items.find((it) => it.id === fields.id) : null;
  const id = existing?.id || newId();
  let photoPath = existing?.photo || null;
  if (photo !== undefined) {
    if (photoPath) queue('pendingDeletes', photoPath);
    photoPath = null;
    if (photo) {
      photoPath = `photos/${id}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      await photos.savePhoto(photoPath, photo);
      queue('pendingUploads', photoPath);
    }
  }
  const item = {
    history: [],
    createdAt: now,
    deleted: false,
    ...existing,
    ...fields,
    id,
    photo: photoPath,
    updatedAt: now,
  };
  await commit((d) => {
    const i = d.items.findIndex((it) => it.id === id);
    if (i >= 0) d.items[i] = item;
    else d.items.push(item);
  });
  return item;
}

export async function deleteItem(id) {
  const item = findItem(id);
  if (!item) return;
  queue('pendingDeletes', item.photo);
  await commit((d) => {
    const i = d.items.findIndex((it) => it.id === id);
    d.items[i] = { id, createdAt: item.createdAt, updatedAt: Date.now(), deleted: true, history: [] };
  });
}

/** "I replaced it": same lifespan starting today; the old dates go into history. */
export async function replaceItem(id) {
  const item = findItem(id);
  if (!item) return null;
  const t = today();
  const next = renewedDates(item, t);
  await commit((d) => {
    const i = d.items.findIndex((it) => it.id === id);
    d.items[i] = {
      ...item,
      ...next,
      history: [...(item.history || []), { got: item.got, exp: item.exp, replacedOn: t }],
      updatedAt: Date.now(),
    };
  });
  return next;
}

export async function updateItemFields(id, fields) {
  const item = findItem(id);
  if (!item) return;
  await commit((d) => {
    const i = d.items.findIndex((it) => it.id === id);
    d.items[i] = { ...item, ...fields, updatedAt: Date.now() };
  });
}

export async function updateSettings(patch) {
  await commit((d) => {
    d.settings = { ...d.settings, ...patch, updatedAt: Date.now() };
  });
}

export async function setCategories(list) {
  await commit((d) => {
    d.categories = { list: [...new Set(list.map((c) => c.trim()).filter(Boolean))], updatedAt: Date.now() };
  });
}

/** Adds a backup file's contents (merged, so nothing on this device is lost). */
export async function importBackup(json) {
  const incoming = normalize(json, localZone);
  await commit((d) => {
    const merged = merge(incoming, d);
    Object.assign(d, merged);
  });
}

export function exportBackup() {
  return JSON.stringify({ ...state.data, exportedAt: new Date().toISOString() }, null, 2);
}

/* ---------- photos ---------- */

export function photoURL(path) {
  const download = state.mode === 'github' && token()
    ? (p) => client().readBlob(...repoArgs(), p)
    : null;
  return photos.photoURL(path, download);
}

/* ---------- connecting ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useLocalOnly() {
  state.mode = 'local';
  storage.set('paw.mode', 'local');
  emit();
}

/** Signs in with a token, creates the private repo if needed, installs reminders, syncs. */
export async function connect(rawToken, onStep = () => {}) {
  const gh = new GitHub(rawToken.trim());
  onStep('Checking your token…');
  const user = await gh.user();
  onStep('Looking for your private data repo…');
  let repo = await gh.repo(user.login, DATA_REPO);
  if (!repo) {
    onStep(`Creating the private repo ${user.login}/${DATA_REPO}…`);
    repo = await gh.createPrivateRepo(DATA_REPO, 'Pawventory data. Private. Managed by the Pawventory app.');
    await sleep(1500);
  }
  if (!repo.private) {
    throw new Error(`${user.login}/${DATA_REPO} already exists and is public. Make it private on GitHub (Settings → General → Danger Zone), then try again.`);
  }
  storage.set('paw.token', rawToken.trim());
  storage.set('paw.mode', 'github');
  state.mode = 'github';
  state.meta = {
    ...freshMeta(),
    pendingUploads: state.meta.pendingUploads,
    login: user.login,
    branch: repo.default_branch || 'main',
  };
  // Photos taken before connecting still need uploading.
  for (const it of liveItems(state.data)) queue('pendingUploads', it.photo);
  await persist();
  onStep('Setting up reminders and syncing your things…');
  await syncNow();
  if (state.sync.status === 'error') throw new Error(state.sync.error);
  emit();
}

export async function disconnect() {
  try {
    const endpoint = await unsubscribe();
    if (endpoint) await removeSubscription(endpoint);
  } catch { /* still sign out */ }
  storage.set('paw.token', null);
  storage.set('paw.mode', 'local');
  state.mode = 'local';
  state.meta = { ...freshMeta() };
  await persist();
  emit();
}

/* ---------- syncing ---------- */

let syncing = false;
let again = false;

function setSync(status, error = null) {
  state.sync = { status, error };
  emit();
}

/** Retries while a just-created repo is still initialising (GitHub answers 409). */
async function settle(fn) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err.status !== 409 || i >= 5) throw err;
      await sleep(1500);
    }
  }
}

async function writeIfChanged(gh, path, text, message) {
  const [owner, repo] = repoArgs();
  const current = await settle(() => gh.readText(owner, repo, path, state.meta.branch));
  if (current && current.text === text) return;
  await gh.write(owner, repo, path, { text, sha: current?.sha, message, branch: state.meta.branch });
}

async function fetchAppFile(path) {
  const res = await fetch(new URL(`./${path}`, location.href), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.text();
}

/** Push keys + the daily reminder job in the data repo. Only does work when something changed. */
async function ensureReminderJob(gh) {
  const [owner, repo] = repoArgs();
  const cron = cronFor(state.data.settings.notifyTime, state.data.settings.timezone);
  if (state.meta.vapidPublic && state.meta.installedVersion === REMOTE_VERSION && state.meta.installedCron === cron) return;

  if (!state.meta.vapidPublic) {
    const existing = await settle(() => gh.readText(owner, repo, VAPID_PATH, state.meta.branch));
    if (existing) {
      state.meta.vapidPublic = JSON.parse(existing.text).publicKey;
    } else {
      const keys = await generateVapidKeys();
      await gh.write(owner, repo, VAPID_PATH, {
        text: `${JSON.stringify(keys, null, 2)}\n`, message: 'Add push notification keys', branch: state.meta.branch,
      });
      state.meta.vapidPublic = keys.publicKey;
    }
  }

  if (state.meta.installedVersion !== REMOTE_VERSION) {
    await writeIfChanged(gh, 'scripts/package.json', '{\n  "private": true,\n  "type": "module"\n}\n', 'Set up reminder job');
    for (const [from, to] of JOB_FILES) {
      await writeIfChanged(gh, to, await fetchAppFile(from), 'Update reminder job');
    }
  }

  const workflow = (await fetchAppFile('remote/remind.yml')).replace('__CRON__', cron);
  try {
    await writeIfChanged(gh, WORKFLOW_PATH, workflow, 'Update reminder schedule');
    state.meta.jobProblem = null;
  } catch (err) {
    // Writing workflow files needs the token's "Workflows" permission.
    if (err.status === 403 || err.status === 404) {
      state.meta.jobProblem = 'workflow-permission';
      await persist();
      return;
    }
    throw err;
  }
  state.meta.installedVersion = REMOTE_VERSION;
  state.meta.installedCron = cron;
  await persist();
}

async function pushPendingPhotos(gh) {
  const [owner, repo] = repoArgs();
  for (const path of [...state.meta.pendingUploads]) {
    const blob = await photos.localPhoto(path);
    if (blob) {
      try {
        await gh.write(owner, repo, path, {
          bytes: new Uint8Array(await blob.arrayBuffer()), message: 'Add photo', branch: state.meta.branch,
        });
      } catch (err) {
        if (err.status !== 422) throw err; // 422: already uploaded
      }
    }
    state.meta.pendingUploads = state.meta.pendingUploads.filter((p) => p !== path);
    await persist();
  }
}

async function syncData(gh) {
  const [owner, repo] = repoArgs();
  for (let attempt = 0; ; attempt += 1) {
    const remote = await settle(() => gh.readText(owner, repo, DATA_PATH, state.meta.branch));
    const remoteData = remote ? normalize(JSON.parse(remote.text), localZone) : null;
    const merged = remoteData ? merge(state.data, remoteData) : state.data;
    if (!remoteData || !sameData(merged, remoteData)) {
      try {
        await gh.write(owner, repo, DATA_PATH, {
          text: `${JSON.stringify(merged, null, 1)}\n`, sha: remote?.sha, message: 'Update belongings', branch: state.meta.branch,
        });
      } catch (err) {
        // Another device saved in between: fetch again and re-merge.
        if ((err.status === 409 || err.status === 422) && attempt < 3) continue;
        throw err;
      }
    }
    if (!sameData(merged, state.data)) {
      state.data = merged;
      await persist();
      refreshBadge();
    }
    return;
  }
}

async function removeUnusedPhotos(gh) {
  const [owner, repo] = repoArgs();
  const used = referencedPhotos(state.data);
  for (const path of [...state.meta.pendingDeletes]) {
    if (!used.has(path)) {
      const sha = await gh.sha(owner, repo, path);
      if (sha) await gh.remove(owner, repo, path, { sha, message: 'Remove photo', branch: state.meta.branch });
      await photos.forgetPhoto(path);
    }
    state.meta.pendingDeletes = state.meta.pendingDeletes.filter((p) => p !== path);
    await persist();
  }
}

export async function syncNow() {
  if (state.mode !== 'github' || !token()) return;
  if (syncing) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setSync('offline');
    return;
  }
  syncing = true;
  setSync('syncing');
  try {
    const gh = client();
    await pushPendingPhotos(gh);
    await syncData(gh);
    await ensureReminderJob(gh);
    await removeUnusedPhotos(gh);
    state.meta.lastSync = Date.now();
    await persist();
    setSync('idle');
  } catch (err) {
    console.warn('Sync failed', err);
    setSync('error', explainError(err));
  } finally {
    syncing = false;
    if (again) {
      again = false;
      scheduleSync(0);
    }
  }
}

/* ---------- notifications ---------- */

async function editSubscriptions(change) {
  const gh = client();
  const [owner, repo] = repoArgs();
  for (let attempt = 0; ; attempt += 1) {
    const file = await gh.readText(owner, repo, SUBS_PATH, state.meta.branch);
    const doc = file ? JSON.parse(file.text) : { subscriptions: [] };
    doc.subscriptions = change(Array.isArray(doc.subscriptions) ? doc.subscriptions : []);
    try {
      await gh.write(owner, repo, SUBS_PATH, {
        text: `${JSON.stringify(doc, null, 2)}\n`, sha: file?.sha, message: 'Update notification devices', branch: state.meta.branch,
      });
      return;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt < 3) continue;
      throw err;
    }
  }
}

const removeSubscription = (endpoint) => editSubscriptions((subs) => subs.filter((s) => s.endpoint !== endpoint));

/** Call straight from a tap (the permission prompt needs a user gesture). */
export async function enableNotifications() {
  if (!state.meta.vapidPublic) throw new Error('Not set up yet: wait for the first sync to finish, then try again.');
  const sub = await subscribe(state.meta.vapidPublic);
  await editSubscriptions((subs) => [...subs.filter((s) => s.endpoint !== sub.endpoint), sub]);
  state.meta.pushEndpoint = sub.endpoint;
  await persist();
  emit();
}

export async function disableNotifications() {
  const endpoint = (await unsubscribe()) || state.meta.pushEndpoint;
  if (endpoint) await removeSubscription(endpoint);
  state.meta.pushEndpoint = null;
  await persist();
  emit();
}

export async function sendTestNotification() {
  const [owner, repo] = repoArgs();
  await client().dispatchWorkflow(owner, repo, WORKFLOW_FILE, state.meta.branch, { test: 'true' });
}

export const dataRepoURL = () => (state.meta.login ? `https://github.com/${state.meta.login}/${DATA_REPO}` : null);

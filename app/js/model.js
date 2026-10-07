// The synced data file (data/items.json in the private repo) and how two copies merge.
// Pure functions only, so they run in tests and on every device the same way.

export const SCHEMA = 1;

export const DEFAULT_CATEGORIES = ['Documents', 'Personal care', 'Pet', 'Tech', 'Home', 'Clothing'];

export const REMIND_CHOICES = [1, 3, 7, 14, 30];

export function defaultSettings(timeZone) {
  return {
    notifyTime: '09:00',
    timezone: timeZone || 'UTC',
    defaultRemindDays: [7, 30],
    soonDays: 30,
    nagExpired: true,
    updatedAt: 0,
  };
}

export function emptyData(timeZone) {
  return {
    schema: SCHEMA,
    items: [],
    categories: { list: [...DEFAULT_CATEGORIES], updatedAt: 0 },
    settings: defaultSettings(timeZone),
  };
}

export function newId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${rand}`;
}

/** Fills in anything missing so older or hand-edited files still load. */
export function normalize(data, timeZone) {
  const base = emptyData(timeZone);
  if (!data || typeof data !== 'object') return base;
  const items = Array.isArray(data.items) ? data.items.filter((it) => it && it.id) : [];
  return {
    schema: SCHEMA,
    items: items.map((it) => ({
      name: '',
      brand: '',
      category: '',
      got: null,
      exp: null,
      remindDays: null,
      notes: '',
      photo: null,
      history: [],
      createdAt: 0,
      updatedAt: 0,
      deleted: false,
      ...it,
    })),
    categories: data.categories && Array.isArray(data.categories.list)
      ? { list: data.categories.list.filter((c) => typeof c === 'string'), updatedAt: data.categories.updatedAt || 0 }
      : base.categories,
    settings: { ...base.settings, ...(data.settings || {}) },
  };
}

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a);

/**
 * Merges two copies of the data. Each item keeps whichever version was edited last;
 * deletions are kept as tombstones (deleted: true) so they win over stale copies.
 * On a tie the first argument wins.
 */
export function merge(a, b) {
  const byId = new Map();
  for (const it of a.items) byId.set(it.id, it);
  for (const it of b.items) byId.set(it.id, byId.has(it.id) ? newer(byId.get(it.id), it) : it);
  const items = [...byId.values()].sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : 1));
  return {
    schema: SCHEMA,
    items,
    categories: newer(a.categories, b.categories),
    settings: newer(a.settings, b.settings),
  };
}

export const liveItems = (data) => data.items.filter((it) => !it.deleted);

/** Brands in use, A to Z, one entry per brand whatever its capitalisation. */
export function brandsOf(items) {
  const seen = new Map();
  for (const it of items) {
    const b = (it.brand || '').trim();
    if (b && !seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b);
  }
  return [...seen.values()].sort((a, z) => a.localeCompare(z, undefined, { sensitivity: 'base' }));
}

export function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Photo files the data still points at (live items only). */
export function referencedPhotos(data) {
  return new Set(liveItems(data).map((it) => it.photo).filter(Boolean));
}

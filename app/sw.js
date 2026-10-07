// Service worker: works offline, shows push notifications, opens the app when one is tapped.

const CACHE = 'pawventory-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/model.js',
  './js/dates.js',
  './js/reminders.js',
  './js/github.js',
  './js/idb.js',
  './js/photos.js',
  './js/push.js',
  './js/prefs.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/item.js',
  './js/views/edit.js',
  './js/views/reminders.js',
  './js/views/calendar.js',
  './js/views/settings.js',
  './js/views/setup.js',
  './icons/icon-192.png',
  './icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pawventory-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Fonts: cache first (they never change).
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok || res.type === 'opaque') c.put(request, res.clone());
      return res;
    }));
    return;
  }

  // The app itself: network first so updates show up, cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(request);
        if (res.ok) c.put(request, res.clone());
        return res;
      } catch {
        return (await c.match(request, { ignoreSearch: true }))
          || (request.mode === 'navigate' ? c.match('./index.html') : Response.error());
      }
    })());
  }
  // Everything else (GitHub API) goes straight to the network.
});

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data?.text() };
  }
  const title = msg.title || 'Pawventory';
  const target = new URL(msg.url || './#/reminders', self.registration.scope).href;
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: msg.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'pawventory-daily',
      data: { url: target },
    }),
    typeof msg.badge === 'number' && self.navigator.setAppBadge
      ? (msg.badge > 0 ? self.navigator.setAppBadge(msg.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : null,
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      client.postMessage({ type: 'navigate', hash: new URL(target).hash });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

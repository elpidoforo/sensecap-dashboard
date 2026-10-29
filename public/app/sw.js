'use strict';
/* Keeps the app shell so the app opens without a connection. Sensor data, chat and everything under /app/api is never cached. */
const CACHE = 'smart-cities-v1';
const SHELL = ['/app/', '/app/app.css', '/app/core.js', '/app/data.js', '/app/chat.js', '/app/manage.js', '/app/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/app/') || url.pathname.startsWith('/app/api/')) return;
  // Network first so a new version shows up at once; the saved copy is only for when the network fails.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('/app/'))));
});

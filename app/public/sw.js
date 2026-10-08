// Field Command service worker: offline app shell, plus "your move" push notifications.
const CACHE = 'field-command-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    // Hashed build files never change: cache first.
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })),
    );
  } else if (request.mode === 'navigate') {
    // Pages: network first, falling back to the cached app shell when offline.
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/')),
    );
  }
});

// Pushes carry no payload: the server only says "it's your move".
self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('Field Command', {
    body: "It's your move.",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'field-command-turn',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) =>
      list.length ? list[0].focus() : self.clients.openWindow('/'),
    ),
  );
});

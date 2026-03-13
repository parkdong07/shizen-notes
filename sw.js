// sw.js — Shizen Notes Service Worker
// Handles: caching, offline, push notifications, reminder scheduling

const CACHE_NAME = 'shizen-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './env.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500&family=Inter:wght@300;400;500;600&display=swap',
];

// In-memory reminder timers (cleared on SW restart)
const reminderTimers = new Map();

// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Pre-cache partial fail:', err));
    })
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch (Cache-first for static, network-first for API) ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Firebase / CDN – always network
  if (url.hostname.includes('firebase') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ─── Push (FCM) ────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '自然 Shizen Notes', body: 'คุณมีการแจ้งเตือนใหม่', icon: './icons/icon-192.png' };
  try { Object.assign(data, event.data?.json()); } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'shizen-push',
      renotify: true,
      data: data.url || './',
    })
  );
});

// ─── Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(c => c.url.includes(self.location.origin));
      if (win) return win.focus();
      return clients.openWindow(url);
    })
  );
});

// ─── Message (from app.js) ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_REMINDER') {
    const { title, remindAtMs, delay } = event.data;

    // Clear existing timer for same title
    if (reminderTimers.has(title)) clearTimeout(reminderTimers.get(title));

    const ms = Math.max(0, remindAtMs - Date.now());
    const timer = setTimeout(async () => {
      reminderTimers.delete(title);
      try {
        await self.registration.showNotification('⏰ Shizen Reminder', {
          body: title,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `remind-${Date.now()}`,
          vibrate: [200, 100, 200],
        });
      } catch(e) {
        console.warn('[SW] Show notification failed:', e);
      }
    }, ms);

    reminderTimers.set(title, timer);
  }
});

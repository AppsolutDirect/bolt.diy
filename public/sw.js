/*
 * Service Worker für die bolt.diy-PWA.
 *
 * Ziel: Installierbar sein UND sich automatisch aktualisieren, sobald Cloudflare
 * eine neue Version deployed hat.
 *
 *  - Seiten (HTML): immer zuerst vom Netzwerk -> neue Deploys sind sofort sichtbar.
 *    Nur ohne Internet wird eine kleine Offline-Seite gezeigt.
 *  - /assets/*: Dateinamen enthalten einen Hash und ändern sich bei jedem Build.
 *    Daher dauerhaft zwischengespeichert (schneller Start).
 *  - API-Aufrufe und alles andere: wird nicht angefasst.
 */
const CACHE = 'bolt-static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Nur eigene Dateien, keine API-Aufrufe
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Seiten: Netzwerk zuerst, bei fehlendem Internet Offline-Seite
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Gehashte Build-Dateien: Cache zuerst
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        if (cached) {
          return cached;
        }

        const response = await fetch(request);

        if (response.ok) {
          cache.put(request, response.clone());
        }

        return response;
      }),
    );
  }
});

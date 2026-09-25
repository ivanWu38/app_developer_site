// Offline cache: on install, precache every file listed in precache.json (page, code, data, animations, 469 voice clips).
// VERSION is stamped by _generator/web_build.py; a new version installs into a fresh cache and drops the old one.
const VERSION = '1ed7d4aa8b';
const CACHE = 'peerfit-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
    const urls = ['./', ...list.files.map(f => encodeURI(f))];
    // add in small batches so one slow file never fails the whole install
    for (let i = 0; i < urls.length; i += 20) {
      await Promise.all(urls.slice(i, i + 20).map(async u => { try { await cache.add(new Request(u, { cache: 'reload' })); } catch (err) { console.warn('precache miss', u, err); } }));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = url.pathname.includes('/assets/') || url.pathname.includes('/icons/');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isAsset) {   // media + data: cache first (11 MB of voice never re-downloads)
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req); if (res && res.ok) cache.put(req, res.clone()); return res;
    }
    try {            // page + code: network first so an update shows up right away; cache when offline
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await cache.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});

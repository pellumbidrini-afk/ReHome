// Groundwork offline cache. Every file the app needs is stored when the app is first opened; requests are
// answered from that cache first, so the app opens with no connection. A new build changes VERSION, which
// downloads the new files in the background and replaces the old cache.
const VERSION = 'groundwork-04b0818d6862';
const ASSETS = [
  "./",
  "./fonts/fonts.css",
  "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-500-normal.woff2",
  "./fonts/ibm-plex-sans-latin-400-normal.woff2",
  "./fonts/ibm-plex-sans-latin-500-normal.woff2",
  "./fonts/ibm-plex-sans-latin-600-normal.woff2",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./js/app.js",
  "./js/blueprint.js",
  "./js/builder.js",
  "./js/catalog.js",
  "./js/controls.js",
  "./js/estimate.js",
  "./js/framing.js",
  "./js/fx.js",
  "./js/geometry.js",
  "./js/materials.js",
  "./js/model.js",
  "./js/offline.js",
  "./js/roof.js",
  "./js/sky.js",
  "./js/textures.js",
  "./js/three.module.min.js",
  "./js/vendor.js",
  "./manifest.webmanifest"
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('groundwork-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const shell = (await cache.match('./index.html')) || (await cache.match('./')); if (shell) return shell; }
    try { return await fetch(req); } catch { return new Response('Offline and not cached', { status: 503, headers: { 'content-type': 'text/plain' } }); }
  })());
});

/* NEXA VET CONTROL — versão 1.2 | cache exclusivamente da interface pública */
const VERSION = 'nexa-vet-static-v1.2.0';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './demo.js', './config.js',
  './manifest.webmanifest', './assets/favicon.svg', './assets/icon-192.png',
  './assets/icon-512.png', './assets/icon-180.png', './assets/icon-maskable-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nexa-vet-static-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  const allowed = /^(index\.html|styles\.css|app\.js|demo\.js|config\.js|manifest\.webmanifest|assets\/(?:favicon\.svg|icon-(?:180|192|512)\.png|icon-maskable-512\.png))$/.test(url.pathname.slice(scopePath.length));
  const navigation = req.mode === 'navigate';
  if (!allowed && !navigation) return;
  if (navigation) {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // Busca primeiro na rede para não manter tela/JS antigo após atualização.
  event.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(VERSION).then(cache => cache.put(req, copy)));
    }
    return res;
  }).catch(() => caches.match(req)));
});

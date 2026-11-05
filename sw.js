/* NEXA VET v2.0 — cache exclusivo dos arquivos públicos do aplicativo; não guarda dados do servidor. */
const VERSION='nexa-vet-static-v2.0.0';
const SHELL=['./','./index.html','./styles.css','./extra.css','./app.js','./demo.js','./config.js','./manifest.webmanifest','./assets/favicon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png','./assets/icon-maskable-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('nexa-vet-static-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const u=new URL(req.url);if(u.origin!==self.location.origin)return;const scope=new URL(self.registration.scope).pathname;if(!u.pathname.startsWith(scope))return;
  const path=u.pathname.slice(scope.length);const allowed=/^(index\.html|styles\.css|extra\.css|app\.js|demo\.js|config\.js|manifest\.webmanifest|assets\/(?:favicon\.svg|icon-(?:180|192|512)\.png|icon-maskable-512\.png))$/.test(path);
  if(req.mode==='navigate'){e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return}if(!allowed)return;
  e.respondWith(fetch(req).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();e.waitUntil(caches.open(VERSION).then(c=>c.put(req,copy)))}return r}).catch(()=>caches.match(req)));
});

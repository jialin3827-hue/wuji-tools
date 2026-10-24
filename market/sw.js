const V='wuji-market-v9';
const SHELL=['./','./index.html','./app.js','./store.js','./crypto.html','./app.css','./manifest.webmanifest','./vendor/lightweight-charts.js','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('wuji-market')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 const net=()=>fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res});
 if(u.pathname.includes('/data/')&&u.pathname.endsWith('.json')){e.respondWith(net().catch(()=>caches.match(r)));return}
 if(r.mode==='navigate'||/\.(js|css)$/.test(u.pathname)){e.respondWith(net().catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));return}
 e.respondWith(caches.match(r).then(m=>m||net()))});

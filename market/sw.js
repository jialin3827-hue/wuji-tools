const V='wuji-market-v18';
const SHELL=['./','./index.html','./app.js','./store.js','./i18n.js','./crypto.html','./backtest.html','./app.css','./manifest.webmanifest','./vendor/lightweight-charts.js','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 const fresh=r.mode==='navigate'||/\.(html|js|css|json|webmanifest)$/.test(u.pathname)||u.pathname.endsWith('/');
 const net=()=>fetch(r,{cache:'no-store'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res});
 if(fresh){e.respondWith(net().catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('./index.html'):Response.error()))));return}
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(m=>m||net()))});

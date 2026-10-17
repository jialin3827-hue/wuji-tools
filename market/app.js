'use strict';
/* 月光股市大冒險 v1 — single-player simulated trading. Virtual coins only. State: localStorage wuji_market_v1 */
const K='wuji_market_v1';
const TIERS=[{id:'富家',e:'💎',m:10000000,d:'含著金湯匙出生，資金雄厚'},{id:'千金',e:'👑',m:1000000,d:'家境小康，起步不錯'},{id:'存款',e:'🐷',m:100000,d:'靠自己存下的第一桶金'}];
const MK={tw:{name:'台股帳戶',cur:'TWD',short:'台股',unit:'虛擬幣（新台幣計價）'},us:{name:'美股帳戶',cur:'USD',short:'美股',unit:'虛擬幣（美元計價）'}};
const BOTS=[
 {id:'div',e:'🧓',n:'阿息',r:'高股息存股：開局平均買進高股息 ETF，之後抱著不動',tw:['0056','00878','00919'],us:['SCHD','VYM']},
 {id:'dip',e:'🐻',n:'小加',r:'跌了就加碼：開局買 3 成大盤 ETF，之後單日跌超過 1.5% 就再投入剩餘現金 2 成',tw:['0050'],us:['SPY']},
 {id:'dca',e:'🐢',n:'定定',r:'每月定期定額：開局和每月第一個交易日投入本金 1/12 到大盤 ETF',tw:['0050','006208'],us:['VOO','QQQ']},
 {id:'rnd',e:'🐒',n:'亂亂',r:'隨機亂買：每天擲骰子，隨便挑一檔買或賣',tw:['2330','2317','2454','2603','2881','2303','2002','3231','00878','0050'],us:['AAPL','NVDA','TSLA','AMZN','META','AMD','PLTR','KO','JPM','SPY']}];
const $=s=>document.querySelector(s);
let S=load(),D={tw:null,us:null},BARS={},UI={tab:(['list','quote','port','ord','battle'].includes(location.hash.slice(1))?location.hash.slice(1):'list'),q:'',side:'B',type:'L',lot:'lot',px:'',qty:1,lbm:(load()||{}).acct||'tw',oh:'P',tier:'存款',mode:'ai'},chart=null;

function load(){try{return JSON.parse(localStorage.getItem(K))||null}catch(e){return null}}
function save(){localStorage.setItem(K,JSON.stringify(S))}
function newAcct(m){return{cash:m,pos:{},realized:0,fees:0}}
function fresh(tier,mode){const t=TIERS.find(x=>x.id===tier);return{v:1,tier,init:t.m,mode,born:Date.now(),acct:S?S.acct:'tw',start:{tw:D.tw&&D.tw.asof,us:D.us&&D.us.asof},a:{tw:newAcct(t.m),us:newAcct(t.m)},orders:[],cur:{tw:'2330',us:'AAPL'},seq:1}}

/* ---------- formatting ---------- */
const nf=(v,d=0)=>(v==null||isNaN(v))?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const pxf=(v,m)=>v==null?'—':m==='us'?nf(v,2):nf(v,v<10?2:v<1000?(v%1?2:0):0).replace(/^/,'');
const pf=(v,d=2)=>(v>0?'+':'')+nf(v*100,d)+'%';
const cls=v=>v>1e-9?'up':v<-1e-9?'dn':'fl';
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2200)}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- market clock ---------- */
function tzp(tz,d=new Date()){const o={};new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(d).forEach(p=>o[p.type]=p.value);o.min=(+o.hour)*60+(+o.minute);o.wk=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday);return o}
function nyOffset(){const n=new Date(),p=tzp('America/New_York',n);const u=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);return Math.round((u-n.getTime())/3600000)}
function mstat(m){if(m==='tw'){const p=tzp('Asia/Taipei');const open=p.wk>=1&&p.wk<=5&&p.min>=540&&p.min<810;return{open,hrs:'台北 09:00–13:30'}}
 const p=tzp('America/New_York');const open=p.wk>=1&&p.wk<=5&&p.min>=570&&p.min<960;const off=nyOffset();const s=(9.5+8-off)%24,e=(16+8-off)%24;
 const f=h=>String(Math.floor(h)).padStart(2,'0')+':'+(h%1?'30':'00');return{open,hrs:`台北 ${f(s)}–${f(e)}（${off===-4?'夏令':'冬令'}）`}}

/* ---------- fees ---------- */
const isETF=(m,s)=>m==='tw'?/^00/.test(s):false;
function costs(m,s,side,price,q){const amt=price*q;if(m==='us')return{amt,fee:0,tax:0};
 const min=(q%1000===0)?20:1;const fee=Math.max(min,Math.floor(amt*0.001425));const tax=side==='S'?Math.floor(amt*(isETF(m,s)?0.001:0.003)):0;return{amt,fee,tax}}
function tick(m,p,s){if(m==='us')return .01;if(isETF(m,s))return p<50?.01:.05;return p<10?.01:p<50?.05:p<100?.1:p<500?.5:p<1000?1:5}
const rt=(v,t)=>Math.round(Math.round(v/t)*t*100)/100;

/* ---------- data ---------- */
async function getJSON(u){const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error(u+' '+r.status);return r.json()}
async function loadSnap(){for(const m of['tw','us']){try{D[m]=await getJSON(`data/${m}.json`);D[m].map={};D[m].list.forEach(x=>D[m].map[x.s]=x)}catch(e){D[m]=D[m]||{list:[],map:{},asof:null,updated:'讀取失敗'}}}}
async function bars(m,s){const k=m+':'+s;if(!BARS[k]){try{BARS[k]=(await getJSON(`data/${m}/${encodeURIComponent(s)}.json`)).bars}catch(e){BARS[k]=[]}}return BARS[k]}
const last=(m,s)=>{const x=D[m]&&D[m].map[s];return x?x.c:null};
const qname=(m,s)=>{const x=D[m]&&D[m].map[s];return x?x.n:s};

/* ---------- account math ---------- */
function reserved(m){let c=0;const sh={};for(const o of S.orders)if(o.a===m&&o.st==='P'){if(o.side==='B'){const p=o.type==='L'?o.px:(last(m,o.s)||0)*1.1;const k=costs(m,o.s,'B',p,o.q);c+=k.amt+k.fee}else sh[o.s]=(sh[o.s]||0)+o.q}return{c,sh}}
function value(m,a=S.a[m]){let mv=0,cost=0;for(const s in a.pos){const p=a.pos[s];mv+=p.q*(last(m,s)||p.t/p.q);cost+=p.t}return{mv,cost,tot:a.cash+mv}}
function fill(o,price,date){const m=o.a,a=S.a[m],k=costs(m,o.s,o.side,price,o.q);
 if(o.side==='B'){if(a.cash<k.amt+k.fee){o.st='X';o.why='現金不足';return false}a.cash-=k.amt+k.fee;const p=a.pos[o.s]||(a.pos[o.s]={q:0,t:0});p.q+=o.q;p.t+=k.amt+k.fee}
 else{const p=a.pos[o.s];if(!p||p.q<o.q){o.st='X';o.why='庫存不足';return false}const part=p.t*o.q/p.q,net=k.amt-k.fee-k.tax;a.cash+=net;a.realized+=net-part;o.pl=net-part;p.q-=o.q;p.t-=part;if(p.q<=0)delete a.pos[o.s]}
 a.fees+=k.fee+k.tax;Object.assign(o,{st:'F',fpx:price,fee:k.fee,tax:k.tax,fd:date,fts:Date.now()});return true}
/* pending orders: matched against the first daily bar after the order's data date (next price update) */
async function processOrders(){let n=0;for(const o of S.orders){if(o.st!=='P')continue;const b=(await bars(o.a,o.s)).find(x=>x[0]>o.dd);if(!b)continue;const[d,op,hi,lo]=b;
 if(o.type==='M'){fill(o,op,d)&&n++}else if(o.side==='B'?lo<=o.px:hi>=o.px){fill(o,o.side==='B'?Math.min(o.px,op):Math.max(o.px,op),d)&&n++}else{o.st='E';o.why='當日未成交，已失效';o.fd=d}}
 if(n){save();toast(`有 ${n} 筆委託成交了`)}}

/* ---------- AI bots (deterministic replay from the shared start date) ---------- */
function rng(seed){let a=0;for(const c of seed)a=(a*31+c.charCodeAt(0))|0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
async function simBot(bot,m){const init=S.init,start=S.start[m];const a=newAcct(init);if(!start)return{a,v:init};const syms=bot[m],B={};for(const s of syms)B[s]=(await bars(m,s)).filter(x=>x[0]>=start);
 const dates=[...new Set(syms.flatMap(s=>B[s].map(x=>x[0])))].sort();const R=rng(bot.id+m+start);const px={};
 const buy=(s,cashAmt)=>{const p=px[s];if(!p)return;let q=Math.floor(cashAmt/p/1.002);if(q<1)return;let k=costs(m,s,'B',p,q);while(q>0&&k.amt+k.fee>a.cash){q--;k=costs(m,s,'B',p,q)}if(q<1)return;a.cash-=k.amt+k.fee;const P=a.pos[s]||(a.pos[s]={q:0,t:0});P.q+=q;P.t+=k.amt+k.fee};
 const sell=(s,q)=>{const P=a.pos[s],p=px[s];if(!P||!p)return;q=Math.min(q,P.q);const k=costs(m,s,'S',p,q);a.cash+=k.amt-k.fee-k.tax;P.t-=P.t*q/P.q;P.q-=q;if(!P.q)delete a.pos[s]};
 let prevMonth=null;dates.forEach((d,i)=>{const chg={};for(const s of syms){const b=B[s].find(x=>x[0]===d);if(b){chg[s]=px[s]?b[4]/px[s]-1:0;px[s]=b[4]}}
  if(bot.id==='div'&&i===0)syms.forEach(s=>buy(s,init/syms.length*0.98));
  if(bot.id==='dip'){const s=syms[0];if(i===0)buy(s,init*0.3);else if(chg[s]<-0.015)buy(s,a.cash*0.2)}
  if(bot.id==='dca'){const mo=d.slice(0,7);if(mo!==prevMonth){syms.forEach(s=>buy(s,init/12/syms.length));prevMonth=mo}}
  if(bot.id==='rnd'){const r=R(),s=syms[Math.floor(R()*syms.length)];if(r<0.35)buy(s,a.cash*0.15);else if(r<0.55){const h=Object.keys(a.pos);if(h.length){const t=h[Math.floor(R()*h.length)];sell(t,Math.ceil(a.pos[t].q/2))}}}});
 let mv=0;for(const s in a.pos)mv+=a.pos[s].q*(last(m,s)||px[s]);return{a,v:a.cash+mv,days:dates.length}}

/* ---------- rendering ---------- */
function setBody(){document.body.classList.toggle('us',S&&S.acct==='us')}
function renderTop(){const m=S.acct,st=mstat(m),d=D[m]||{};
 $('#top').innerHTML=`<div class="hrow"><div class="logo">🌙 月光股市</div><div class="seg">${['tw','us'].map(x=>`<button class="${x===m?'on':''}" onclick="swAcct('${x}')">${MK[x].name}</button>`).join('')}</div><div class="sp"></div><button class="ibtn" onclick="menu()" aria-label="設定">⚙️</button></div>
 <div class="sub"><span class="pill ${st.open?'open':''}">${MK[m].short}${st.open?'盤中':'已收盤'}</span><span>${st.hrs}</span><span>資料日 ${d.asof||'—'}・更新 ${d.updated||'—'}</span></div>`;
 document.documentElement.style.setProperty('--hh',$('#top').offsetHeight+'px')}
function renderNav(){const T=[['list','📋','行情'],['quote','📈','個股'],['port','💼','庫存'],['ord','🧾','委託'],['battle','🏆','對戰']];
 $('#nav').innerHTML=T.map(([k,i,t])=>`<button class="${UI.tab===k?'on':''}" onclick="go('${k}')"><i>${i}</i>${t}</button>`).join('')}
function go(t){if(t==='battle'&&UI.tab!=='battle')UI.lbm=S.acct;UI.tab=t;render();scrollTo(0,0)}
function swAcct(m){S.acct=m;save();UI.px='';UI.qty=1;UI.lot='lot';render()}
function render(){if(!S){startSheet();return}setBody();renderTop();renderNav();({list:vList,quote:vQuote,port:vPort,ord:vOrd,battle:vBattle})[UI.tab]()}
const DISC='<div class="disc">模擬學習用，非投資建議，價格為盤後／延遲資料。全部為虛擬幣，無真錢、無儲值、無獎品。</div>';

function vList(){const m=S.acct,q=UI.q.trim().toLowerCase(),L=(D[m].list||[]).filter(x=>!q||x.s.toLowerCase().includes(q)||x.n.toLowerCase().includes(q));
 $('#view').innerHTML=`<div class="srch"><input id="sq" placeholder="搜尋代號或名稱（${m==='tw'?'例：2330、台積':'例：AAPL、Apple'}）" value="${esc(UI.q)}" oninput="UI.q=this.value;vListRows()"></div><div class="lhead"><span>名稱／代號</span><span class="r">成交價</span><span class="r">漲跌幅</span></div><div id="rows"></div>
 <div class="note">清單為熱門標的的固定題庫，依代號排列，不代表推薦或評等。${m==='tw'?'台股紅漲綠跌':'美股綠漲紅跌'}。資料來源：${esc(D[m].src||'—')}</div>${DISC}`;vListRows()}
function vListRows(){const m=S.acct,q=UI.q.trim().toLowerCase(),L=(D[m].list||[]).filter(x=>!q||x.s.toLowerCase().includes(q)||x.n.toLowerCase().includes(q));
 $('#rows').innerHTML=L.length?L.map(x=>{const c=x.c/x.pc-1;return`<div class="row" onclick="openQ('${x.s}')"><div><div class="nm">${esc(x.n)}</div><div class="cd">${x.s}${x.m?'・'+esc(x.m):''}${S.a[m].pos[x.s]?'・<span style="color:var(--ac)">持有</span>':''}</div></div><div class="r b ${cls(c)}">${pxf(x.c,m)}</div><div class="chg ${cls(c)}">${pf(c)}</div></div>`}).join(''):'<div class="empty">找不到符合的標的（題庫內約 50 檔熱門標的＋ETF）</div>'}
function openQ(s){S.cur[S.acct]=s;save();UI.px='';UI.qty=1;go('quote')}

async function vQuote(){const m=S.acct,s=S.cur[m],x=D[m].map[s];if(!x){$('#view').innerHTML='<div class="empty">尚無資料</div>';return}
 const c=x.c-x.pc,cp=c/x.pc;const lot=m==='tw'&&UI.lot==='lot';
 $('#view').innerHTML=`<div class="qh"><div class="t"><span class="nm">${esc(x.n)}</span><span class="mu">${s}${x.m?'・'+esc(x.m):''}</span></div>
 <div class="t"><span class="px ${cls(c)}">${pxf(x.c,m)}</span><span class="b ${cls(c)}">${c>0?'▲':c<0?'▼':''}${pxf(Math.abs(c),m)}　${pf(cp)}</span></div>
 <div class="grid4"><div><span>開盤</span>${pxf(x.o,m)}</div><div><span>最高</span><b class="${cls(x.h-x.pc)}">${pxf(x.h,m)}</b></div><div><span>最低</span><b class="${cls(x.l-x.pc)}">${pxf(x.l,m)}</b></div><div><span>${m==='tw'?'成交量(張)':'成交量(股)'}</span>${nf(m==='tw'?x.v/1000:x.v)}</div>
 <div><span>昨收</span>${pxf(x.pc,m)}</div><div><span>資料日</span>${x.d}</div><div><span>幣別</span>${MK[m].cur}</div><div><span>持有</span>${nf((S.a[m].pos[s]||{}).q||0)} 股</div></div></div>
 <div class="lgd"><span>日K</span><b style="color:#f0b90b">MA5</b><b style="color:#5b8def">MA20</b><b style="color:#c678dd">MA60</b><span class="sp"></span></div><div id="chart"></div>
 <div class="trade"><div class="book" id="book"></div><div class="op" id="op"></div></div>
 <div class="note">五檔為依收盤價產生的模擬掛單，非真實委買委賣。市價單：盤中以最新可得價格成交，收盤後排隊到下一次價格更新以開盤價成交；限價單：下一次價格更新觸及限價才成交，否則當日失效。${m==='tw'?'手續費 0.1425%（整張最低 20 元、零股最低 1 元），證交稅賣出 0.3%（ETF 0.1%），皆為模擬。':'美股手續費 0（模擬）。'}</div>${DISC}`;
 if(!UI.px)UI.px=String(x.c);renderBook(x);renderOp();
 const b=await bars(m,s);if(S.cur[m]!==s||UI.tab!=='quote')return;drawChart(b,m)}
function renderBook(x){const m=S.acct,t=tick(m,x.c,x.s),R=rng(x.s+x.d),base=m==='tw'?(x.v/1000/300):(x.v/3000);const vol=()=>Math.max(1,Math.round(base*(0.3+R()*1.4)));
 const asks=[5,4,3,2,1].map(i=>[rt(x.c+t*i,t),vol()]),bids=[0,1,2,3,4].map(i=>[rt(x.c-t*i,t),vol()]);const mx=Math.max(...asks.map(a=>a[1]),...bids.map(a=>a[1]));
 const row=(p,v,k)=>`<div class="lv ${k}" onclick="UI.px='${p}';UI.type='L';renderOp()"><i style="width:${v/mx*100}%"></i><span class="${cls(p-x.pc)}">${pxf(p,m)}</span><span>${nf(v)}</span></div>`;
 $('#book').innerHTML=`<div class="h"><span>模擬五檔</span><span>${m==='tw'?'張':'股'}</span></div>${asks.map(a=>row(a[0],a[1],'a')).join('')}<div class="lvs ${cls(x.c-x.pc)}">${pxf(x.c,m)}</div>${bids.map(a=>row(a[0],a[1],'bd')).join('')}`}
function renderOp(){const m=S.acct,s=S.cur[m],x=D[m].map[s],a=S.a[m],rs=reserved(m),lot=m==='tw'&&UI.lot==='lot',mul=lot?1000:1;
 const p=UI.type==='M'?x.c:(+UI.px||0),q=Math.max(0,Math.floor(+UI.qty||0))*mul,k=costs(m,s,UI.side,p,q||1);const tot=UI.side==='B'?k.amt+k.fee:k.amt-k.fee-k.tax;
 const held=(a.pos[s]||{}).q||0,availSh=held-(rs.sh[s]||0),availC=a.cash-rs.c;const buy=UI.side==='B';
 $('#op').innerHTML=`<div class="seg bs"><button class="buy ${buy?'on':''}" onclick="UI.side='B';renderOp()">買進</button><button class="sell ${buy?'':'on'}" onclick="UI.side='S';renderOp()">賣出</button></div>
 <div class="seg"><button class="${UI.type==='L'?'on':''}" onclick="UI.type='L';renderOp()">限價</button><button class="${UI.type==='M'?'on':''}" onclick="UI.type='M';renderOp()">市價</button></div>
 ${m==='tw'?`<div class="seg"><button class="${lot?'on':''}" onclick="UI.lot='lot';UI.qty=1;renderOp()">整張</button><button class="${lot?'':'on'}" onclick="UI.lot='odd';UI.qty=100;renderOp()">零股</button></div>`:''}
 <div class="lbl">價格（${MK[m].cur}）</div><div class="stp"><button onclick="bump('px',-1)">−</button><input inputmode="decimal" ${UI.type==='M'?'disabled value="市價"':`value="${esc(UI.px)}"`} oninput="UI.px=this.value;est()"><button onclick="bump('px',1)">＋</button></div>
 <div class="lbl">數量（${lot?'張，1 張＝1000 股':m==='tw'?'股，1–999':'股'}）</div><div class="stp"><button onclick="bump('qty',-1)">−</button><input inputmode="numeric" value="${esc(UI.qty)}" oninput="UI.qty=this.value;est()"><button onclick="bump('qty',1)">＋</button></div>
 <div class="est" id="est"></div><button class="go ${buy?'':'sell'}" onclick="place()">${buy?'買進':'賣出'}委託</button>
 <div class="est" style="margin-top:4px">${buy?`可用現金 <b>${nf(availC)}</b>`:`可賣 <b>${nf(availSh)}</b> 股`}</div>`;est()}
function est(){const m=S.acct,s=S.cur[m],x=D[m].map[s],lot=m==='tw'&&UI.lot==='lot',p=UI.type==='M'?x.c:(+UI.px||0),q=Math.max(0,Math.floor(+UI.qty||0))*(lot?1000:1);const k=costs(m,s,UI.side,p,q);
 const e=$('#est');if(!e)return;e.innerHTML=q&&p?`金額 <b>${nf(k.amt,m==='us'?2:0)}</b>${m==='tw'?`・手續費 <b>${nf(k.fee)}</b>${UI.side==='S'?`・稅 <b>${nf(k.tax)}</b>`:''}`:''}<br>${UI.side==='B'?'預估付出':'預估收入'} <b>${nf(UI.side==='B'?k.amt+k.fee:k.amt-k.fee-k.tax,m==='us'?2:0)}</b>${UI.type==='M'?'（以最新價估算）':''}`:'請輸入價格與數量'}
function bump(f,d){const m=S.acct,x=D[m].map[S.cur[m]];if(f==='px'){if(UI.type==='M')return;const p=+UI.px||x.c,t=tick(m,p,x.s);UI.px=String(rt(p+d*t,t))}else{const lot=m==='tw'&&UI.lot==='lot',st=lot||m==='us'?1:(UI.qty>=100?100:1);UI.qty=Math.max(1,Math.min(lot||m==='us'?99999:999,(+UI.qty||0)+d*st))}renderOp()}
async function place(){const m=S.acct,s=S.cur[m],x=D[m].map[s],a=S.a[m],lot=m==='tw'&&UI.lot==='lot';const n=Math.floor(+UI.qty||0),q=n*(lot?1000:1);
 if(n<1)return toast('數量要大於 0');if(m==='tw'&&!lot&&n>999)return toast('零股一次最多 999 股');const px=UI.type==='M'?null:+UI.px;if(UI.type==='L'&&!(px>0))return toast('請輸入限價');
 const rs=reserved(m);if(UI.side==='B'){const k=costs(m,s,'B',px||x.c,q);if(k.amt+k.fee>a.cash-rs.c)return toast('可用現金不足')}else if(q>((a.pos[s]||{}).q||0)-(rs.sh[s]||0))return toast('可賣股數不足');
 const st=mstat(m);const desc=`${UI.side==='B'?'買進':'賣出'} ${x.n}（${s}）\n${lot?n+' 張':q+' 股'}・${UI.type==='M'?'市價':'限價 '+px}\n${st.open?'目前盤中':'目前已收盤，將排隊到下一次價格更新'}\n（模擬交易，虛擬幣）`;
 if(!confirm(desc))return;const o={id:S.seq++,a:m,s,side:UI.side,type:UI.type,px,q,unit:lot?'張':'股',ts:Date.now(),dd:x.d,st:'P'};S.orders.unshift(o);
 if(st.open&&(UI.type==='M'||(UI.side==='B'?px>=x.c:px<=x.c))){fill(o,x.c,x.d)?toast('已成交 @ '+pxf(x.c,m)):toast('委託失敗：'+o.why)}else toast('委託已送出，等待下一次價格更新');
 save();renderOp()}
function ma(b,n){const o=[];let s=0;b.forEach((x,i)=>{s+=x[4];if(i>=n)s-=b[i-n][4];if(i>=n-1)o.push({time:x[0],value:+(s/n).toFixed(3)})});return o}
function drawChart(b,m){const el=$('#chart');if(!el||!window.LightweightCharts)return;el.innerHTML='';if(!b.length){el.innerHTML='<div class="empty">K 線資料累積中</div>';return}
 const up=m==='tw'?'#f6465d':'#0ecb81',dn=m==='tw'?'#0ecb81':'#f6465d';
 chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:230,layout:{background:{color:'#0b0f17'},textColor:'#8b98ad',fontSize:10},grid:{vertLines:{color:'#151c2b'},horzLines:{color:'#151c2b'}},rightPriceScale:{borderColor:'#263045'},timeScale:{borderColor:'#263045'},crosshair:{mode:0},localization:{locale:'zh-TW'}});
 const cs=chart.addCandlestickSeries({upColor:up,downColor:dn,wickUpColor:up,wickDownColor:dn,borderVisible:false});cs.priceScale().applyOptions({scaleMargins:{top:.06,bottom:.26}});
 cs.setData(b.map(x=>({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4]})));
 const vs=chart.addHistogramSeries({priceScaleId:'v',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});chart.priceScale('v').applyOptions({scaleMargins:{top:.8,bottom:0}});
 vs.setData(b.map(x=>({time:x[0],value:x[5],color:(x[4]>=x[1]?up:dn)+'88'})));
 [[5,'#f0b90b'],[20,'#5b8def'],[60,'#c678dd']].forEach(([n,c])=>chart.addLineSeries({color:c,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false}).setData(ma(b,n)));
 const n=b.length;chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-70),to:n+1})}

function vPort(){const m=S.acct,a=S.a[m],v=value(m),pl=v.mv-v.cost,ret=v.tot/S.init-1,ps=Object.entries(a.pos);
 $('#view').innerHTML=`<div class="card"><h3>${MK[m].name}・${MK[m].unit}</h3><div class="mu" style="font-size:11px">總資產</div><div class="big">${nf(v.tot,m==='us'?2:0)}</div><div class="${cls(ret)} b">總報酬 ${pf(ret)}（${nf(v.tot-S.init,0)}）</div>
 <div class="kv"><div><span>可用現金</span>${nf(a.cash-reserved(m).c,m==='us'?2:0)}</div><div><span>股票市值</span>${nf(v.mv,m==='us'?2:0)}</div><div><span>未實現損益</span><b class="${cls(pl)}">${nf(pl,0)}</b></div><div><span>已實現損益</span><b class="${cls(a.realized)}">${nf(a.realized,0)}</b></div><div><span>投胎本金</span>${nf(S.init)}（${S.tier}）</div><div><span>累計手續費＋稅</span>${nf(a.fees,0)}</div></div></div>
 <div class="pos mu" style="font-size:10px;padding:6px 12px"><span>名稱／股數</span><span class="r">成本均價／現價</span><span class="r">損益／報酬率</span></div>
 ${ps.length?ps.map(([s,p])=>{const lp=last(m,s),mv=p.q*lp,g=mv-p.t,r=g/p.t;return`<div class="pos" onclick="openQ('${s}')"><div><div class="nm">${esc(qname(m,s))}</div><div class="mu">${s}・${nf(p.q)} 股${m==='tw'&&p.q>=1000?`（${nf(p.q/1000,p.q%1000?3:0)} 張）`:''}</div></div><div class="r">${pxf(p.t/p.q,m)}<br><b>${pxf(lp,m)}</b></div><div class="r"><b class="${cls(g)}">${nf(g,m==='us'?2:0)}</b><br><span class="${cls(g)}">${pf(r)}</span></div></div>`}).join(''):'<div class="empty">還沒有庫存，去「行情」挑一檔練習看看吧</div>'}
 <div class="note">成本均價含買進手續費。現價為最新盤後／延遲價格（資料日 ${D[m].asof||'—'}）。</div>${DISC}`}
function vOrd(){const m=S.acct,L=S.orders.filter(o=>o.a===m&&(UI.oh==='P'?o.st==='P':o.st!=='P'));const ST={P:'委託中',F:'已成交',C:'已取消',E:'已失效',X:'失敗'};
 $('#view').innerHTML=`<div class="tabs2"><button class="${UI.oh==='P'?'on':''}" onclick="UI.oh='P';vOrd()">委託中</button><button class="${UI.oh==='H'?'on':''}" onclick="UI.oh='H';vOrd()">成交／歷史紀錄</button></div>
 ${L.length?L.map(o=>`<div class="ord"><span class="tag ${o.side}">${o.side==='B'?'買':'賣'}</span><div style="flex:1"><b>${esc(qname(m,o.s))}</b> <span class="mu">${o.s}</span><br><span class="mu">${o.type==='M'?'市價':'限價 '+pxf(o.px,m)}・${o.unit==='張'?nf(o.q/1000)+' 張':nf(o.q)+' 股'}・${new Date(o.ts).toLocaleString('zh-TW',{hour12:false,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
 ${o.st==='F'?`<br>成交 ${pxf(o.fpx,m)}（${o.fd}）${o.fee||o.tax?`・費 ${nf(o.fee)}${o.tax?'・稅 '+nf(o.tax):''}`:''}${o.pl!=null?`・損益 <b class="${cls(o.pl)}">${nf(o.pl,0)}</b>`:''}`:o.why?`<br><span class="mu">${o.why}</span>`:''}</div>
 ${o.st==='P'?`<button class="xbtn" onclick="cancelO(${o.id})">取消</button>`:`<span class="mu">${ST[o.st]}</span>`}</div>`).join(''):`<div class="empty">${UI.oh==='P'?'目前沒有委託中的單':'還沒有紀錄'}</div>`}${DISC}`}
function cancelO(id){const o=S.orders.find(x=>x.id===id);if(o&&o.st==='P'&&confirm('取消這筆委託？')){o.st='C';save();vOrd();toast('已取消')}}

async function vBattle(){const m=UI.lbm;
 $('#view').innerHTML=`<div class="tabs2"><button class="${m==='tw'?'on':''}" onclick="UI.lbm='tw';vBattle()">台股排行</button><button class="${m==='us'?'on':''}" onclick="UI.lbm='us';vBattle()">美股排行</button></div><div class="card" id="lb"><div class="empty">計算中…</div></div>
 <div class="card"><h3>👥 真人對戰（即將推出）</h3><div class="mu" style="font-size:12px">跟朋友即時比報酬率、每週排行賽，需要雲端後台，之後開放。</div><button class="sec" disabled style="opacity:.5">即將推出</button></div>
 <div class="note">AI 對手和你同一天、同樣本金出發，每天用真實收盤價依固定規則自動操作（策略只是遊戲設定，不代表推薦）。排行依報酬率。</div>${DISC}`;
 if(S.mode!=='ai'){$('#lb').innerHTML=`<h3>🏆 對戰模式未開啟</h3><div class="mu" style="font-size:12px;margin-bottom:8px">你現在是單機模式。開啟後，4 位 AI 對手會從你投胎那天（${S.start[m]||'—'}）一起出發。</div><button class="cta" onclick="S.mode='ai';save();vBattle()">開啟 AI 對戰</button>`;return}
 const rows=[{e:'🙋',n:'你',r:`${S.tier}出身・自己操作`,v:value(m).tot,me:1}];for(const b of BOTS){const r=await simBot(b,m);rows.push({e:b.e,n:b.n,r:b.r,v:r.v})}
 if(UI.tab!=='battle'||UI.lbm!==m)return;rows.forEach(x=>x.ret=x.v/S.init-1);rows.sort((a,b)=>b.ret-a.ret);
 $('#lb').innerHTML=`<h3>🏆 ${MK[m].short}報酬率排行・起跑日 ${S.start[m]||'—'}</h3>${rows.map((x,i)=>`<div class="lb ${x.me?'me':''}"><div class="rk">${['🥇','🥈','🥉'][i]||i+1}</div><div><b>${x.e} ${x.n}</b><div class="rl">${x.r}</div></div><div class="r"><b class="${cls(x.ret)}">${pf(x.ret)}</b><div class="rl">${nf(x.v,0)}</div></div></div>`).join('')}`}

/* ---------- start / menu ---------- */
function startSheet(re){const M=$('#modal');M.classList.add('on');
 M.innerHTML=`<div class="sheet"><div style="text-align:center;font-size:40px">🌙📈</div><h1>投胎模式</h1><div class="lead">選一個出身，台股帳戶和美股帳戶各拿到同樣的虛擬幣開局。<br>白天玩台股、晚上玩美股！</div>
 ${TIERS.map(t=>`<button class="tier ${UI.tier===t.id?'on':''}" onclick="UI.tier='${t.id}';startSheet(${!!re})"><span class="e">${t.e}</span><span style="flex:1"><span class="n">${t.id}</span><br><span class="d">${t.d}</span></span><span class="m">${nf(t.m)}</span></button>`).join('')}
 <div class="lbl" style="margin-top:12px;font-size:12px">遊戲模式</div><div class="modes"><button class="${UI.mode==='solo'?'on':''}" onclick="UI.mode='solo';startSheet(${!!re})">🎮 單機模式</button><button class="${UI.mode==='ai'?'on':''}" onclick="UI.mode='ai';startSheet(${!!re})">🤖 對戰模式<br><small class="mu">vs AI</small></button><button disabled>👥 真人對戰<br><small>即將推出</small></button></div>
 <button class="cta" onclick="born()">投胎！</button>${re?'<button class="sec" onclick="closeM()">取消</button>':''}
 <div class="disc" style="margin-top:12px">模擬學習用，非投資建議，價格為盤後／延遲資料。全部為虛擬幣，不能儲值、不能換現金、沒有獎品。</div></div>`}
function born(){if(S&&!confirm(`確定重新投胎成「${UI.tier}」？\n目前兩個帳戶的庫存和紀錄都會清空。`))return;const acct=S?S.acct:'tw';S=fresh(UI.tier,UI.mode);S.acct=acct;save();closeM();UI.tab='list';render();toast(`投胎成功！你是${UI.tier}出身`)}
function closeM(){$('#modal').classList.remove('on');$('#modal').innerHTML=''}
function menu(){const M=$('#modal');M.classList.add('on');M.innerHTML=`<div class="sheet"><h1>⚙️ 設定</h1><div class="lead">${S.tier}出身・${S.mode==='ai'?'對戰模式（vs AI）':'單機模式'}・本金各 ${nf(S.init)}</div>
 <button class="sec" onclick="S.mode=S.mode==='ai'?'solo':'ai';save();closeM();render()">切換成${S.mode==='ai'?'單機模式':'對戰模式（vs AI）'}</button>
 <button class="sec" onclick="UI.tier=S.tier;UI.mode=S.mode;startSheet(true)">🔄 重新投胎</button>
 <button class="sec" onclick="location.href='../budget/'">🌙 回月光存股模擬人生</button><button class="sec" onclick="closeM()">關閉</button>
 <div class="note">資料只存在你的手機（瀏覽器 localStorage）。台股行情：臺灣證券交易所、證券櫃檯買賣中心開放資料；美股：${esc((D.us||{}).src||'—')}。圖表：TradingView Lightweight Charts™（Apache-2.0）。</div></div>`}

(async function init(){await loadSnap();if(S){if(!S.start.tw)S.start.tw=D.tw.asof;if(!S.start.us)S.start.us=D.us.asof;await processOrders();save()}render();
 setInterval(()=>{if(S)renderTop()},60000);
 document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&S){await loadSnap();BARS={};await processOrders();render()}})})();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));

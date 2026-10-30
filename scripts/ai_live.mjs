// AI 跟單實戰模擬（每日前進式、虛擬錢）。只用「到今天為止」的資料，每個市場每天最多處理一次。
// PROFIT_TARGET_MODE 2026-10-30：偏動能達標——現金補滿只買近1週報酬>0；cash>8%就補；連虧1筆換交易員；開局偏 Rocket/Flash/Dragon/Wave。虛擬錢不保證收益。
// 用法：node scripts/ai_live.mjs tw|us|crypto|all [--catchup-fill]
import fs from 'node:fs';
const FILE='market/data/ai_live.json',INIT=100000;
const U={tw:['2330','2317','2454','2308','2303','2881','2882','2603','3008','0050'],us:['NVDA','AAPL','MSFT','TSLA','AMZN','GOOGL','META','AMD','AVGO','TSM'],crypto:['BTC','ETH','SOL','BNB','XRP']};
const BENCH={tw:'0050',us:'SPY',crypto:'BTC'};
const FEE={tw:[.001425,.004425],us:[.001,.001],crypto:[.001,.001]};
const WK={tw:5,us:5,crypto:7};
const TR=[['🐢 Turtle','brk',[20,10]],['🚀 Rocket','mom',[10]],['🌊 Wave','ma',[5,20]],['🦉 Owl','ma',[20,60]],['🐘 Elephant','ma',[50,200]],['🦊 Fox','rsi',[14,30,70]],['🐇 Rabbit','rsi',[7,25,75]],['🐼 Panda','rsi',[14,40,60]],['⚡ Flash','ma',[3,10]],['🐉 Dragon','mom',[30]]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ymd=t=>new Date(t).toISOString().slice(0,10);
async function getJ(u){for(let i=0;i<3;i++){try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(r.ok)return await r.json();console.log('HTTP',r.status,u)}catch(e){console.log('ERR',e.message,u)}await sleep(3000*(i+1))}throw new Error('fetch failed '+u)}
async function bars(mk,s){const st=ymd(Date.now()-420*864e5);
  if(mk==='crypto'){let j;const q=`/api/v3/klines?symbol=${s}USDT&interval=1d&limit=400`;try{j=await getJ('https://data-api.binance.vision'+q)}catch(e){j=await getJ('https://api.binance.com'+q)}/* binance.com 擋美國 IP（GitHub runner），先用官方公開鏡像 */const now=Date.now();
   return j.filter(x=>x[6]<now).map(x=>[ymd(x[0]),+x[4]])} // 只要已收盤的日 K
  try{const j=await getJ(`https://api.finmindtrade.com/api/v4/data?dataset=${mk==='tw'?'TaiwanStockPrice':'USStockPrice'}&data_id=${s}&start_date=${st}`);if(!j.data||!j.data.length)throw new Error('no data '+s);return j.data.map(x=>[x.date,+(mk==='us'?(x.Adj_Close||x.Close):x.close)]).filter(x=>x[1]>0)}catch(e){try{const f=`market/data/${mk}/${s}.json`,j=JSON.parse(fs.readFileSync(f,'utf8'));if(!j.bars||!j.bars.length)throw 0;console.log(mk,'fallback',s);return j.bars.map(x=>[x[0],x[4]]).filter(x=>x[1]>0)}catch{throw new Error('no data '+s)}}}
const sma=(c,n)=>{const o=Array(c.length).fill(NaN);let s=0;for(let i=0;i<c.length;i++){s+=c[i];if(i>=n)s-=c[i-n];if(i>=n-1)o[i]=s/n}return o};
function rsi(c,n){const o=Array(c.length).fill(NaN);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=n){g+=u/n;l+=w/n;if(i===n)o[i]=l?100-100/(1+g/l):100}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n;o[i]=l?100-100/(1+g/l):100}}return o}
function sig(c,f,a){if(f==='ma'){const x=sma(c,a[0]),y=sma(c,a[1]);return c.map((_,i)=>x[i]>y[i]?1:0)}
 if(f==='mom')return c.map((v,i)=>i>=a[0]&&v>c[i-a[0]]?1:0);
 if(f==='rsi'){const r=rsi(c,a[0]);let p=0;return c.map((_,i)=>{if(r[i]<a[1])p=1;else if(r[i]>a[2])p=0;return p})}
 let p=0;return c.map((v,i)=>{if(i<a[0])return 0;const H=Math.max(...c.slice(i-a[0],i)),L=Math.min(...c.slice(i-a[1],i));if(v>H)p=1;else if(v<L)p=0;return p})}
// 交易員在某標的的近一週報酬（只用 <= 今天的收盤）
function wkRet(c,s,w){const n=c.length;let eq=1;for(let i=n-w;i<n;i++)if(s[i-1])eq*=c[i]/c[i-1];return eq-1}
async function runMarket(mk,S,catchup=false){
  const syms=[...new Set([...U[mk],BENCH[mk]])],D={};
  for(const s of syms){try{D[s]=await bars(mk,s)}catch(e){console.log(mk,'skip',s,e.message)}await sleep(mk==='crypto'?200:1200)}
  const ok=U[mk].filter(s=>D[s]&&D[s].length>60);if(ok.length<3||!D[BENCH[mk]])return console.log(mk,'資料不足，今天跳過');
  let today=D[BENCH[mk]].at(-1)[0];
  const M=S[mk]||(S[mk]={start:today,lastDate:null,cash:INIT,pos:null,trader:null,loss:0,benchUnits:null,equity:[],trades:[],switches:[],ranking:[],log:[]});
  if(!catchup&&M.lastDate&&today<=M.lastDate)return console.log(mk,'已處理',today,'略過（idempotent）');
  // 對齊到今天：只用日期 <= today 的資料，且必須有今天的收盤
  let useDate=(catchup&&M.lastDate)?M.lastDate:today;const C={},SG={};for(const s of ok){const b=D[s].filter(x=>x[0]<=useDate);if(b.at(-1)[0]!==useDate){console.log(mk,s,'今天沒有收盤，不納入');continue}C[s]=b.map(x=>x[1])}
  today=useDate;const syms2=Object.keys(C),w=WK[mk];const ones=Array(999).fill(1);
 const score=TR.map(([n,f,a],ti)=>{let t=0;for(const s of syms2){const sg=(SG[s+ti]=sig(C[s],f,a));t+=wkRet(C[s],sg,w)}return{ti,n,w:t/syms2.length}}).sort((a,b)=>b.w-a.w);
 M.ranking=score.map(x=>({n:x.n,w:+x.w.toFixed(4)}));
  if(M.trader==null){const prefer=new Set(['🚀 Rocket','⚡ Flash','🐉 Dragon','🌊 Wave']);const top=score[0].w;const hit=score.find(x=>prefer.has(x.n)&&x.w>=top-0.005)||score[0];M.trader=hit.ti;M.switches.push({date:today,from:null,to:TR[M.trader][0],why:'開始跟單(偏動能)'})}
  // 分散持股：台/美 max5 各~20%；crypto BTC/ETH 25%核心 +1 AI。idle-cash fill(after4): while sat<maxN && cash>eq*0.15 buy next-best wkRet non-core(ignore sig) amt=slotW*E, trader=TR[], why:'cash-fill'/'ai-pick'(crypto)
  if(M.pos!==undefined){M.positions=M.pos?[M.pos]:[];delete M.pos} // 舊版單一持股 → 轉換
  M.positions=M.positions||[];
  M.lastPx=M.lastPx||{};for(const s of syms2)M.lastPx[s]=C[s].at(-1);
  const px=s=>M.lastPx[s],fee=FEE[mk],todayTr=[],CORE=mk==='crypto'?{BTC:.25,ETH:.25}:{};
  const eqNow=()=>M.cash+M.positions.reduce((a,p)=>a+p.sh*px(p.sym),0);
  const sell=(p,sh,why)=>{const pr=px(p.sym),v=sh*pr*(1-fee[1]),part=sh/p.sh,cost=p.cost*part,pnl=v/cost-1;M.cash+=v;p.sh-=sh;p.cost-=cost;
   const t={date:today,side:'SELL',sym:p.sym,px:pr,sh:+sh.toFixed(6),pnl:+pnl.toFixed(4),trader:TR[M.trader][0],why};M.trades.push(t);todayTr.push(t);return pnl};
  const buy=(sym,amt,core,why)=>{amt=Math.min(amt,M.cash);if(amt<eqNow()*.01)return;const pr=px(sym),sh=amt*(1-fee[0])/pr;M.cash-=amt;
   let p=M.positions.find(x=>x.sym===sym);if(p){p.sh+=sh;p.cost+=amt}else M.positions.push(p={sym,sh,cost:amt,date:today,core:!!core});
   const t={date:today,side:'BUY',sym,px:pr,sh:+sh.toFixed(6),trader:core?'core':TR[M.trader][0]};if(why)t.why=why;M.trades.push(t);todayTr.push(t)};
  // 1) 出場：非核心持股若跟隨交易員訊號轉空 → 全賣，計算連虧
  if(!catchup)for(const p of M.positions.slice()){if(CORE[p.sym]||!C[p.sym]||SG[p.sym+M.trader].at(-1))continue;const pnl=sell(p,p.sh,'signal');
   if(pnl<0){M.loss++;if(M.loss>=1){const nx=score.find(x=>x.ti!==M.trader).ti;M.switches.push({date:today,from:TR[M.trader][0],to:TR[nx][0],why:'連續虧損兩筆'});M.trader=nx;M.loss=0}}else M.loss=0}
  M.positions=M.positions.filter(p=>p.sh>1e-9);
  // 2) 再平衡：超過目標權重 1.25 倍的部位減碼回目標（舊的單一持股會在這裡分散）
  const slotW=mk==='crypto'?.5:.2,maxN=mk==='crypto'?1:5;
  {const E=eqNow();for(const p of M.positions){const tw=CORE[p.sym]||slotW,w=p.sh*px(p.sym)/E;if(w>tw*1.25)sell(p,(w-tw)*E/px(p.sym),'rebalance')}}
  // 3) 核心部位補足
  {const E=eqNow();for(const s in CORE)if(C[s]){const p=M.positions.find(x=>x.sym===s),w=p?p.sh*px(s)/E:0;if(w<CORE[s]*.8)buy(s,(CORE[s]-w)*E,true)}}
  // 4) 衛星部位：跟隨交易員有多單訊號、近一週表現最好的標的
  if(!catchup){const E=eqNow(),held=new Set(M.positions.map(p=>p.sym)),sat=M.positions.filter(p=>!CORE[p.sym]).length;
   const cand=syms2.filter(s=>!CORE[s]&&!held.has(s)&&SG[s+M.trader].at(-1)).map(s=>[s,wkRet(C[s],SG[s+M.trader],w)]).sort((a,b)=>b[1]-a[1]);
   for(const [s] of cand.slice(0,Math.max(0,maxN-sat)))buy(s,slotW*E)}
  // 5) PROFIT_TARGET_MODE idle-cash fill: only positive 1w return; deploy when cash>8%
  {let E=eqNow(),held=new Set(M.positions.map(p=>p.sym)),sat=M.positions.filter(p=>!CORE[p.sym]).length;const fy=mk==='crypto'?'ai-pick':'cash-fill';
   while(sat<maxN&&M.cash>E*0.08){const cand=syms2.filter(s=>!CORE[s]&&!held.has(s)).map(s=>[s,wkRet(C[s],ones,w)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);if(!cand.length)break;const [s]=cand[0];const pre=M.cash;buy(s,slotW*E,false,fy);if(M.cash===pre)break;held.add(s);sat++;E=eqNow()}}
  const bp=D[BENCH[mk]].at(-1)[1];if(!M.benchUnits)M.benchUnits=INIT/bp;
  const eq=eqNow();M.positions.forEach(p=>{p.w=+(p.sh*px(p.sym)/eq).toFixed(4);p.sh=+p.sh.toFixed(6);p.cost=+p.cost.toFixed(2)});
  if(!catchup){M.equity.push([today,+eq.toFixed(2),+(M.benchUnits*bp).toFixed(2)]);M.lastDate=today;M.day=M.equity.length;M.today=todayTr;
  M.log.push({date:today,ran:new Date().toISOString(),n:syms2.length});M.log=M.log.slice(-60);}else M.today=todayTr;
  console.log(mk,catchup?'Catchup':'Day',M.day||0,today,'equity',eq.toFixed(0),'trader',TR[M.trader][0],todayTr.map(t=>t.side+' '+t.sym).join(','))}
const S=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):{};
const which=process.argv[2]||'all';const catchup=process.argv.includes('--catchup-fill');
for(const mk of which==='all'?['tw','us','crypto']:[which]){try{await runMarket(mk,S,catchup)}catch(e){console.log(mk,'失敗，今天跳過：',e.message)}}
S.updated=new Date().toISOString();S.bench=BENCH;S.init=INIT;
fs.writeFileSync(FILE,JSON.stringify(S));

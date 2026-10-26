// AI 跟單實戰模擬（每日前進式、虛擬錢）。只用「到今天為止」的資料，每個市場每天最多處理一次。
// 用法：node scripts/ai_live.mjs tw|us|crypto|all
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
 if(mk==='crypto'){let j;const q=`/api/v3/klines?symbol=${s}USDT&interval=1d&limit=400`;try{j=await getJ('https://data-api.binance.vision'+q)}catch(e){j=await getJ('https://api.binance.com'+q)} // binance.com 擋美國 IP（GitHub runner），先用官方公開鏡像const now=Date.now();
  return j.filter(x=>x[6]<now).map(x=>[ymd(x[0]),+x[4]])} // 只要已收盤的日 K
 const j=await getJ(`https://api.finmindtrade.com/api/v4/data?dataset=${mk==='tw'?'TaiwanStockPrice':'USStockPrice'}&data_id=${s}&start_date=${st}`);
 if(!j.data||!j.data.length)throw new Error('no data '+s);return j.data.map(x=>[x.date,+(mk==='us'?(x.Adj_Close||x.Close):x.close)]).filter(x=>x[1]>0)}
const sma=(c,n)=>{const o=Array(c.length).fill(NaN);let s=0;for(let i=0;i<c.length;i++){s+=c[i];if(i>=n)s-=c[i-n];if(i>=n-1)o[i]=s/n}return o};
function rsi(c,n){const o=Array(c.length).fill(NaN);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=n){g+=u/n;l+=w/n;if(i===n)o[i]=l?100-100/(1+g/l):100}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n;o[i]=l?100-100/(1+g/l):100}}return o}
function sig(c,f,a){if(f==='ma'){const x=sma(c,a[0]),y=sma(c,a[1]);return c.map((_,i)=>x[i]>y[i]?1:0)}
 if(f==='mom')return c.map((v,i)=>i>=a[0]&&v>c[i-a[0]]?1:0);
 if(f==='rsi'){const r=rsi(c,a[0]);let p=0;return c.map((_,i)=>{if(r[i]<a[1])p=1;else if(r[i]>a[2])p=0;return p})}
 let p=0;return c.map((v,i)=>{if(i<a[0])return 0;const H=Math.max(...c.slice(i-a[0],i)),L=Math.min(...c.slice(i-a[1],i));if(v>H)p=1;else if(v<L)p=0;return p})}
// 交易員在某標的的近一週報酬（只用 <= 今天的收盤）
function wkRet(c,s,w){const n=c.length;let eq=1;for(let i=n-w;i<n;i++)if(s[i-1])eq*=c[i]/c[i-1];return eq-1}
async function runMarket(mk,S){
 const syms=[...new Set([...U[mk],BENCH[mk]])],D={};
 for(const s of syms){try{D[s]=await bars(mk,s)}catch(e){console.log(mk,'skip',s,e.message)}await sleep(mk==='crypto'?200:1200)}
 const ok=U[mk].filter(s=>D[s]&&D[s].length>60);if(ok.length<3||!D[BENCH[mk]])return console.log(mk,'資料不足，今天跳過');
 const today=D[BENCH[mk]].at(-1)[0];
 const M=S[mk]||(S[mk]={start:today,lastDate:null,cash:INIT,pos:null,trader:null,loss:0,benchUnits:null,equity:[],trades:[],switches:[],ranking:[],log:[]});
 if(M.lastDate&&today<=M.lastDate)return console.log(mk,'已處理',today,'略過（idempotent）');
 // 對齊到今天：只用日期 <= today 的資料，且必須有今天的收盤
 const C={},SG={};for(const s of ok){const b=D[s].filter(x=>x[0]<=today);if(b.at(-1)[0]!==today){console.log(mk,s,'今天沒有收盤，不納入');continue}C[s]=b.map(x=>x[1])}
 const syms2=Object.keys(C),w=WK[mk];
 const score=TR.map(([n,f,a],ti)=>{let t=0;for(const s of syms2){const sg=(SG[s+ti]=sig(C[s],f,a));t+=wkRet(C[s],sg,w)}return{ti,n,w:t/syms2.length}}).sort((a,b)=>b.w-a.w);
 M.ranking=score.map(x=>({n:x.n,w:+x.w.toFixed(4)}));
 if(M.trader==null){M.trader=score[0].ti;M.switches.push({date:today,from:null,to:TR[M.trader][0],why:'開始跟單'})}
 const px=s=>C[s].at(-1),fee=FEE[mk],todayTr=[];
 // 1) 持股：若目前跟隨的交易員對該標的出場訊號 → 賣出
 if(M.pos&&C[M.pos.sym]&&!SG[M.pos.sym+M.trader].at(-1)){const p=px(M.pos.sym),v=M.pos.sh*p*(1-fee[1]),pnl=v/M.pos.cost-1;M.cash+=v;
  const t={date:today,side:'SELL',sym:M.pos.sym,px:p,sh:+M.pos.sh.toFixed(6),pnl:+pnl.toFixed(4),trader:TR[M.trader][0]};M.trades.push(t);todayTr.push(t);M.pos=null;
  if(pnl<0){M.loss++;if(M.loss>=2){const nx=score.find(x=>x.ti!==M.trader).ti;M.switches.push({date:today,from:TR[M.trader][0],to:TR[nx][0],why:'連續虧損兩筆'});M.trader=nx;M.loss=0}}else M.loss=0}
 // 2) 空手：在全宇宙裡挑交易員目前有多單訊號、且近一週表現最好的標的
 if(!M.pos){const c=syms2.filter(s=>SG[s+M.trader].at(-1)).map(s=>[s,wkRet(C[s],SG[s+M.trader],w)]).sort((a,b)=>b[1]-a[1]);
  if(c.length){const s=c[0][0],p=px(s),sh=M.cash*(1-fee[0])/p;M.pos={sym:s,sh,cost:M.cash,date:today};
   const t={date:today,side:'BUY',sym:s,px:p,sh:+sh.toFixed(6),trader:TR[M.trader][0]};M.trades.push(t);todayTr.push(t);M.cash=0}}
 const bp=D[BENCH[mk]].at(-1)[1];if(!M.benchUnits)M.benchUnits=INIT/bp;
 const eq=M.cash+(M.pos?M.pos.sh*px(M.pos.sym):0);
 M.equity.push([today,+eq.toFixed(2),+(M.benchUnits*bp).toFixed(2)]);M.lastDate=today;M.day=M.equity.length;M.today=todayTr;
 M.log.push({date:today,ran:new Date().toISOString(),n:syms2.length});M.log=M.log.slice(-60);
 console.log(mk,'Day',M.day,today,'equity',eq.toFixed(0),'trader',TR[M.trader][0],todayTr.map(t=>t.side+' '+t.sym).join(','))}
const S=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):{};
const which=process.argv[2]||'all';
for(const mk of which==='all'?['tw','us','crypto']:[which]){try{await runMarket(mk,S)}catch(e){console.log(mk,'失敗，今天跳過：',e.message)}}
S.updated=new Date().toISOString();S.bench=BENCH;S.init=INIT;
fs.writeFileSync(FILE,JSON.stringify(S));

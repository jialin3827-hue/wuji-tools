// 真實行情模擬比較場（虛擬錢，不跟單、不影響 ai_live.mjs 的台股 B 帳戶）。2026-11-16 起，使用者 2026-11-15 同意。
//  A：動能 Top20（研究候選 A，參數照研究原樣）：從第一天起每 21 個交易日的收盤，從當期 0050 成分股挑 60 日漲幅前 20 檔，
//     依 60 日波動率倒數加權；大盤濾網（加權指數 200 日線 ±2% 緩衝）在調倉日判斷，空頭就全部轉現金；調倉時權重偏離超過 20% 才交易。
//  A2：動能 Top20（每日檢查）：選股、權重、偏離 20% 才交易都和 A 相同，但大盤濾網每天收盤檢查：
//     加權指數跌破 200 日線 −2% → 隔日開盤全部轉現金；站回 +2% → 當天收盤立即重新選股（不沿用舊名單），隔日開盤買進，
//     並從這天重新起算 21 個交易日的調倉週期。2026-11-15 使用者要求與 A 並列比較（參數不依回測結果調整）。
//  10 位 AI 交易員：各用自己的訊號（突破／動能／均線／RSI），在當期 0050 成分股裡自由買賣，最多 5 檔、每檔約 20%；
//     訊號轉空就賣、有空位就買訊號為多且近一週自己方法報酬最好的股票。不用大盤濾網、不停損。
//  0050 買入持有：第一天收盤決定、隔日開盤買進後不動。
//  共同：收盤決策、隔日開盤成交；費稅照實盤（買 0.1425%、賣 0.1425%＋證交稅 個股 0.3%／ETF 0.1%）；
//     訊號用還原價（每週資料包 tw50_prices.json＋之後的 FinMind 日 K，期間的除權息／分割往回還原）；
//     帳上持股用原始價成交與估值，除息日把每股配息入現金、分割調股數（與 B 相同的總報酬記帳）。
// 用法：node scripts/ai_arena.mjs        （ARENA_FILE 可指定別的狀態檔做離線測試）
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const V=require('../market/v2sim.js');
const FILE=process.env.ARENA_FILE||'market/data/ai_arena.json',START=process.env.ARENA_START||'2026-11-16',INIT=100000,PACK=process.env.ARENA_PACK||'market/data/tw50_prices.json'; // ARENA_START／ARENA_PACK 只給離線測試用
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),ymd=t=>new Date(t).toISOString().slice(0,10);
const fee=s=>[.001425,.001425+(/^00/.test(s)?.001:.003)];
let NREQ=0;
async function fm(q){const u='https://api.finmindtrade.com/api/v4/data?dataset='+q;for(let i=0;i<3;i++){try{NREQ++;const r=await fetch(u,{signal:AbortSignal.timeout(30000)});const j=await r.json();if(j.status===200&&Array.isArray(j.data)){await sleep(1100);return j.data}console.log('FinMind',j.status,j.msg,q)}catch(e){console.log('ERR',e.message,q)}await sleep(3000*(i+1))}throw new Error('FinMind failed '+q)}
// ---------- 資料：資料包＋增量 ----------
export function assemble(PK0,K,inc){// inc={dates:[新交易日], raw:{s:[{d,o,c}]}, idx:[[d,c]], ev:{s:[[date,factor,kind,perShare]]}}；資料包中 >= inc.dates[0] 的日子改用原始 K 棒重算
  const k=inc.dates.length?PK0.dates.findIndex(d=>d>=inc.dates[0]):-1,cut=k<0?PK0.dates.length:k,sl=a=>a.slice(0,cut);
  const PK={dates:sl(PK0.dates),idx:sl(PK0.idx),c:Object.fromEntries(Object.entries(PK0.c).map(([s,v])=>[s,sl(v)])),o:Object.fromEntries(Object.entries(PK0.o).map(([s,v])=>[s,sl(v)]))};
  const dates=PK.dates.concat(inc.dates),n=dates.length,C={},O={},bad={};
  const syms=new Set([...Object.keys(PK.c).filter(s=>s!=='0050'),...Object.keys(inc.raw)]);syms.add('0050');
  for(const s of syms){const pc=(PK.c[s]||new Array(PK.dates.length).fill(null)).map(v=>v==null?NaN:v),po=(PK.o[s]||new Array(PK.dates.length).fill(null)).map(v=>v==null?NaN:v);
    const m=new Map((inc.raw[s]||[]).map(x=>[x.d,x]));const c=pc.concat(inc.dates.map(d=>m.has(d)?m.get(d).c:NaN)),o=po.concat(inc.dates.map(d=>m.has(d)?m.get(d).o:NaN));
    for(const [d,f] of (inc.ev[s]||[]))if(f>0&&isFinite(f))for(let i=0;i<n&&dates[i]<d;i++){c[i]*=f;o[i]*=f}
    // 資料包之後的新 K 棒還原後仍超過 ±11% → 視為資料不足，當天不新買
    for(let i=PK.dates.length;i<n;i++){let j=i-1;while(j>=0&&!(c[j]===c[j]))j--;if(j>=0&&c[i]===c[i]){const q=c[i]/c[j];if(q<.89||q>1.11)bad[s]=dates[i]}}
    C[s]=c;O[s]=o}
  const im=new Map(inc.idx);const idx=PK.idx.map(v=>v==null?NaN:v).concat(inc.dates.map(d=>im.has(d)?im.get(d):NaN));
  return{dates,C,O,idx,bad,K}}
const membersAt=(K,d)=>{const p=K.periods.filter(x=>x.from<=d).at(-1);return p?p.codes:[]};
// ---------- 指標（與 papertrade/tw50_research/eng.js 相同算法） ----------
const sma=(a,n)=>{const o=new Array(a.length).fill(NaN);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n}return o};
const ff=a=>{let l=NaN;return a.map(v=>v===v?(l=v):l)};
function filterAt(idx,i){const m=sma(ff(idx),200),x=ff(idx);let on=false;for(let k=0;k<=i;k++){if(m[k]===m[k]){if(x[k]>m[k]*1.02)on=true;else if(x[k]<m[k]*.98)on=false}}return{on,px:x[i],ma:m[i]}}
const valid=(c,i,n)=>{for(let j=i-n;j<=i;j+=Math.max(1,n>>3))if(!(c[j]===c[j]))return false;return c[i]===c[i]};
const ret=(c,i,n)=>{const a=c[i],b=c[i-n];return a===a&&b===b&&b>0?a/b-1:NaN};
function vol(c,i,n){let s=0,s2=0,m=0;for(let j=i-n+1;j<=i;j++){const r=c[j]/c[j-1]-1;if(r===r){s+=r;s2+=r*r;m++}}return m>n*.8?Math.sqrt(s2/m-(s/m)**2):NaN}
export function targetA(D,i,codes){const F=filterAt(D.idx,i);if(!F.on)return{t:{},F};
  let c=codes.filter(t=>D.C[t]&&valid(D.C[t],i,60)&&!D.bad[t]).map(t=>[t,ret(D.C[t],i,60),vol(D.C[t],i,60)]).filter(x=>x[1]===x[1]&&x[2]===x[2]&&x[2]>0);
  c.sort((a,b)=>b[1]-a[1]);c=c.slice(0,20);const sw=c.reduce((a,x)=>a+1/x[2],0),t={};for(const x of c)t[x[0]]=(1/x[2])/sw*(c.length<20?c.length/20:1);return{t,F}}
// ---------- 帳戶 ----------
const newAcc=(id,name,style)=>({id,name,style,cash:INIT,pos:{},pend:null,n:0,equity:[],trades:[],divs:[]});
function credit(acc,ev,last,today){for(const s in acc.pos)for(const [d,f,kind,per] of (ev[s]||[])){if(!(d>last&&d<=today))continue;const p=acc.pos[s];
  if(kind==='div'&&per>0){const amt=p.sh*per;acc.cash+=amt;acc.divs.push({date:d,sym:s,amt:+amt.toFixed(2)})}else if(kind==='split'){p.sh/=f}}}
function sell(acc,s,sh,px,d,why){const p=acc.pos[s],f=fee(s)[1],v=sh*px;acc.cash+=v*(1-f);const part=sh/p.sh,c0=p.cost*part,pnl=v*(1-f)/c0-1;p.sh-=sh;p.cost-=c0;if(p.sh<=1e-9)delete acc.pos[s];acc.trades.push({date:d,side:'SELL',sym:s,px,sh:+sh.toFixed(6),pnl:+pnl.toFixed(4),why})}
function buy(acc,s,amt,px,d,why){amt=Math.min(amt,acc.cash);if(!(amt>0)||!(px>0))return;const f=fee(s)[0],sh=amt*(1-f)/px;acc.cash-=amt;const p=acc.pos[s];if(p){p.sh+=sh;p.cost+=amt}else acc.pos[s]={sh,cost:amt,date:d};acc.trades.push({date:d,side:'BUY',sym:s,px,sh:+sh.toFixed(6),why})}
const pxO=(D,s,i,acc)=>{const o=D.O[s]&&D.O[s][i];return o===o&&o>0?o:(acc.last&&acc.last[s])};
const pxC=(D,s,i,acc)=>{const c=D.C[s]&&D.C[s][i];return c===c&&c>0?c:(acc.last&&acc.last[s])};
function eqAt(acc,D,i,pf){let E=acc.cash;for(const s in acc.pos)E+=acc.pos[s].sh*(pf(D,s,i,acc)||0);return E}
// 依權重目標調整（研究引擎同邏輯：先賣後買、偏離 20% 才動、單筆 < 0.5% 不買）
function execTarget(acc,D,i,tg,band=.2){const d=D.dates[i],E=eqAt(acc,D,i,pxO);
  for(const s of Object.keys(acc.pos)){const px=pxO(D,s,i,acc),w=tg[s]||0,cur=acc.pos[s].sh*px/E;if(!(px>0))continue;if(w===0||cur>w*(1+band)){const sh=w===0?acc.pos[s].sh:(cur-w)*E/px;sell(acc,s,sh,px,d,w===0?'out':'rebalance')}}
  for(const s in tg){const px=D.O[s]&&D.O[s][i];if(!(px===px&&px>0))continue;const p=acc.pos[s],cur=p?p.sh*px/E:0,w=tg[s];if(cur<w*(1-band)){const amt=Math.min((w-cur)*E,acc.cash);if(amt<E*.005)continue;buy(acc,s,amt,px,d,'rebalance')}}}
// AI 交易員：orders={sell:[s], buy:[s]}，買進金額＝成交時資產 20%（不超過現金）
function execOrders(acc,D,i,o){const d=D.dates[i];for(const s of o.sell){if(!acc.pos[s])continue;const px=pxO(D,s,i,acc);if(px>0)sell(acc,s,acc.pos[s].sh,px,d,'signal')}
  const E=eqAt(acc,D,i,pxO);for(const s of o.buy){const px=D.O[s]&&D.O[s][i];if(px===px&&px>0&&!acc.pos[s])buy(acc,s,Math.min(E*.2,acc.cash),px,d,'signal')}}
const SIG={};function sigOf(D,ti,s){const k=ti+'|'+s;if(SIG[k])return SIG[k];const c=D.C[s],ix=[],cv=[];c.forEach((v,i)=>{if(v===v){ix.push(i);cv.push(v)}});const [,kind,a]=V.TR[ti],s0=V.sig(cv,kind,a),o=new Array(c.length).fill(0);ix.forEach((i,j)=>o[i]=s0[j]);return SIG[k]=o}
function wk(D,ti,s,i){const c=ff(D.C[s]),g=sigOf(D,ti,s);let e=1;for(let j=i-4;j<=i;j++)if(g[j-1]&&c[j-1]>0)e*=c[j]/c[j-1];return e-1}
function decideTrader(acc,D,i,ti,codes){const held=Object.keys(acc.pos),sellL=held.filter(s=>!sigOf(D,ti,s)[i]),keep=held.length-sellL.length;
  const cand=codes.filter(s=>D.C[s]&&!acc.pos[s]&&!D.bad[s]&&valid(D.C[s],i,60)&&sigOf(D,ti,s)[i]).map(s=>[s,wk(D,ti,s,i)]).sort((a,b)=>b[1]-a[1]).slice(0,Math.max(0,5-keep)).map(x=>x[0]);
  return sellL.length||cand.length?{sell:sellL,buy:cand}:null}
// ---------- 每日一步（i＝今天在 D 中的索引） ----------
export function step(S,D,i,ev={}){const d=D.dates[i],codes=membersAt(D.K,d);
  if(!S.accs){S.start=d;S.accs=[newAcc('A','動能 Top20（21 天檢查）','每 21 個交易日：60 日漲幅前 20、波動倒數加權；大盤濾網只在調倉日檢查'),newAcc('A2','動能 Top20（每日檢查）','選股同 A；大盤濾網每天檢查，跌破轉現金、站回立即重選'),newAcc('BH','0050 買入持有','第一天收盤決定、隔日開盤買進後不動'),
    ...V.TR.map(([n,k,a],ti)=>newAcc('T'+ti,n,{brk:'突破',mom:'動能',ma:'均線',rsi:'RSI'}[k]+' '+a.join('/')))]}
  if(!S.accs.find(a=>a.id==='A2')){const a2=newAcc('A2','動能 Top20（每日檢查）','選股同 A；大盤濾網每天檢查，跌破轉現金、站回立即重選');a2.lastDate=S.lastDate;S.accs.splice(1,0,a2)}// 舊狀態補開 A2（從下一個處理日起）
  for(const acc of S.accs){const last=acc.lastDate||'';if(last>=d)continue;credit(acc,ev,last,d);
    if(acc.pend){if(acc.pend.t)execTarget(acc,D,i,acc.pend.t);else execOrders(acc,D,i,acc.pend);acc.pend=null}
    acc.last=acc.last||{};for(const s in acc.pos){const c=D.C[s]&&D.C[s][i];if(c===c)acc.last[s]=c}
    const E=eqAt(acc,D,i,pxC);acc.equity.push([d,+E.toFixed(2)]);
    if(acc.id==='A'){if(acc.n%21===0){const r=targetA(D,i,codes);acc.pend={t:r.t};acc.filter={on:r.F.on,px:+r.F.px.toFixed(2),ma:+r.F.ma.toFixed(2),date:d}}}
    else if(acc.id==='A2'){const F=filterAt(D.idx,i),flip=acc.filter&&acc.filter.on!==F.on;
      if(acc.k==null||acc.k>=21||flip){const r=targetA(D,i,codes);acc.pend={t:r.t};acc.k=0}acc.k++;acc.filter={on:F.on,px:+F.px.toFixed(2),ma:+F.ma.toFixed(2),date:d}}
    else if(acc.id==='BH'){if(acc.n===0)acc.pend={t:{'0050':1}}}
    else{const o=decideTrader(acc,D,i,+acc.id.slice(1),codes);if(o)acc.pend=o}
    acc.n++;acc.lastDate=d}
  S.lastDate=d;return S}
export function summary(acc){const e=acc.equity.map(x=>x[1]);let pk=e[0]||INIT,dd=0;for(const v of e){pk=Math.max(pk,v);dd=Math.min(dd,v/pk-1)}const cl=acc.trades.filter(t=>t.side==='SELL');
  return{ret:e.length?e.at(-1)/INIT-1:0,mdd:dd,win:cl.length?cl.filter(t=>t.pnl>0).length/cl.length:null,closed:cl.length,start:acc.equity[0]&&acc.equity[0][0]}}
// ---------- 主程式 ----------
async function main(){const t0=Date.now();
  const PK=JSON.parse(fs.readFileSync(PACK,'utf8')),K=JSON.parse(fs.readFileSync('market/data/tw50_constituents.json','utf8'));
  const S=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):{};
  // 增量起點：資料包之後；若上次處理日更早（中間漏跑），從上次處理日隔天起改用原始 K 棒，確保配息入帳與原始價估值一致
  const nx=d=>ymd(Date.parse(d)+864e5),from=S.lastDate&&nx(S.lastDate)<nx(PK.end)?nx(S.lastDate):nx(PK.end);
  const b0=(await fm(`TaiwanStockPrice&data_id=0050&start_date=${from}`)).map(x=>({d:x.date,o:+x.open,c:+x.close})).filter(x=>x.c>0);
  const today=(b0.at(-1)||{}).d||PK.end;
  if(today<START)return console.log('arena 尚未開始（',START,'起），最新資料',today);
  if(S.lastDate&&today<=S.lastDate)return console.log('arena 已處理',today,'略過；請求',NREQ);
  const idxN=(await fm(`TaiwanStockPrice&data_id=TAIEX&start_date=${from}`)).map(x=>[x.date,+x.close]);
  if(!idxN.length||idxN.at(-1)[0]!==today)return console.log('arena 加權指數資料未齊，略過');
  const held=new Set();for(const a of S.accs||[])for(const s in a.pos)held.add(s);
  const need=[...new Set([...membersAt(K,today),...held])].filter(s=>s!=='0050');
  const raw={'0050':b0},ev={};
  const sp=await fm(`TaiwanStockSplitPrice&start_date=${from}`);
  for(const s of need){try{raw[s]=(await fm(`TaiwanStockPrice&data_id=${s}&start_date=${from}`)).map(x=>({d:x.date,o:+x.open,c:+x.close})).filter(x=>x.c>0)}catch(e){console.log('skip',s,e.message)}}
  for(const s of ['0050',...need]){try{for(const x of await fm(`TaiwanStockDividendResult&data_id=${s}&start_date=${from}`)){const f=+x.after_price/+x.before_price;if(f>0&&f<1.5)(ev[s]=ev[s]||[]).push([x.date,f,'div',+x.before_price-+x.after_price])}}catch(e){console.log('div skip',s)}}
  for(const x of sp){const f=+x.after_price/+x.before_price;if(f>0&&isFinite(f))(ev[x.stock_id]=ev[x.stock_id]||[]).push([x.date,f,'split'])}
  const dates=b0.map(x=>x.d).filter(d=>d>=from);
  const D=assemble(PK,K,{dates,raw,idx:idxN,ev});
  // 從上次處理日的下一天逐日補到今天（通常只有 1 天）
  for(let i=0;i<D.dates.length;i++){const d=D.dates[i];if(d<START||(S.lastDate&&d<=S.lastDate))continue;step(S,D,i,ev)}
  S.updated=new Date().toISOString();S.rule={fee:'買 0.1425%、賣 0.1425%＋證交稅（個股 0.3%、ETF 0.1%）',fill:'收盤決策、隔日開盤成交'};
  S.board=S.accs.map(a=>({id:a.id,name:a.name,style:a.style,...summary(a),cash:+a.cash.toFixed(2),pos:Object.entries(a.pos).map(([s,p])=>({sym:s,sh:+p.sh.toFixed(6)})),pend:!!a.pend}));
  S.stats={requests:NREQ,seconds:Math.round((Date.now()-t0)/1000)};
  fs.writeFileSync(FILE,JSON.stringify(S));console.log('arena',today,'requests',NREQ,'sec',S.stats.seconds,S.board.map(b=>b.id+':'+(b.ret*100).toFixed(2)+'%').join(' '))}
if(import.meta.url===`file://${process.argv[1]}`)await main();

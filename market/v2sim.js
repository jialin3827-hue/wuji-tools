/* 月光股市 AI 跟單 v2 歷史回測引擎（瀏覽器與 Node 共用）。
   照 papertrade/usjp/moon_v2_backtest.py 的 B 設定（①還原價 ②a 連虧2筆才換、一天最多換1次 ③大盤200MA濾網 ④移動停損＋再進場）移植：
   收盤決策、隔日開盤成交。只做歷史模擬，不影響 scripts/ai_live.mjs 的實盤規則。
   可調：stop 移動停損比例（0=關，預設 .3）、tp 停利比例（0=關）、maxPos 單一標的目標上限（預設台美 .2、幣 .5）。 */
(function(root){
'use strict';
const TR=[['🐢 Turtle','brk',[20,10]],['🚀 Rocket','mom',[10]],['🌊 Wave','ma',[5,20]],['🦉 Owl','ma',[20,60]],['🐘 Elephant','ma',[50,200]],
 ['🦊 Fox','rsi',[14,30,70]],['🐇 Rabbit','rsi',[7,25,75]],['🐼 Panda','rsi',[14,40,60]],['⚡ Flash','ma',[3,10]],['🐉 Dragon','mom',[30]]];
const PREFER=new Set([1,8,9,2]);
const U={tw:['2330','2317','2454','2308','2303','2881','2882','2603','3008','0050'],us:['NVDA','AAPL','MSFT','TSLA','AMZN','GOOGL','META','AMD','AVGO','TSM'],crypto:['BTC','ETH','SOL','BNB','XRP']};
const IDX={tw:'TAIEX',us:'SPY',crypto:'BTC'},BENCH={tw:'0050',us:'SPY',crypto:'BTC'},WKN={tw:5,us:5,crypto:7};
const DEF={tw:{stop:.3,tp:0,maxPos:.2},us:{stop:.3,tp:0,maxPos:.2},crypto:{stop:.3,tp:0,maxPos:.5}};
const feeOf=(mk,s)=>mk==='tw'?[.001425,.001425+(/^00/.test(s)?.001:.003)]:[.001,.001];
const INIT=100000;
/* 與 pandas rolling().mean()/sum() 相同的演算法（Kahan 補償加減、連續相同值），確保與原 Python 回測逐筆一致 */
function pdRoll(v,w,mean){const n=v.length,o=new Array(n).fill(NaN);let nobs=0,sx=0,ca=0,cr=0,neg=0,same=0,prev=NaN;
 const add=x=>{if(x!==x)return;nobs++;const y=x-ca,t=sx+y;ca=t-sx-y;sx=t;if(x<0||Object.is(x,-0))neg++;if(x===prev)same++;else same=1;prev=x};
 const rem=x=>{if(x!==x)return;nobs--;const y=-x-cr,t=sx+y;cr=t-sx-y;sx=t;if(x<0||Object.is(x,-0))neg--};
 for(let i=0;i<n;i++){const s=Math.max(0,i-w+1);if(i===0){prev=v[0];same=0;for(let j=s;j<=i;j++)add(v[j])}else{if(s>0)rem(v[s-1]);add(v[i])}
  if(nobs>=w&&nobs>0){if(mean){let r=sx/nobs;if(same>=nobs)r=prev;else if(neg===0&&r<0)r=0;else if(neg===nobs&&r>0)r=0;o[i]=r}else o[i]=same>=nobs?prev*nobs:sx}}return o}
const rollMean=(c,n)=>pdRoll(c,n,true);
function rsi(c,n){const o=new Array(c.length).fill(NaN);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);
 if(i<=n){g+=u/n;l+=w/n;if(i===n)o[i]=l===0?100:100-100/(1+g/l)}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n;o[i]=l===0?100:100-100/(1+g/l)}}return o}
function sig(c,k,a){const n=c.length,o=new Array(n).fill(0);
 if(k==='ma'){const x=rollMean(c,a[0]),y=rollMean(c,a[1]);for(let i=0;i<n;i++)o[i]=x[i]>y[i]?1:0;return o}
 if(k==='mom'){for(let i=a[0];i<n;i++)o[i]=c[i]>c[i-a[0]]?1:0;return o}
 if(k==='rsi'){const r=rsi(c,a[0]);let p=0;for(let i=0;i<n;i++){if(r[i]===r[i]){if(r[i]<a[1])p=1;else if(r[i]>a[2])p=0}o[i]=p}return o}
 let p=0;for(let i=a[0];i<n;i++){let H=-Infinity,L=Infinity;for(let j=i-a[0];j<i;j++)H=Math.max(H,c[j]);for(let j=i-a[1];j<i;j++)L=Math.min(L,c[j]);if(c[i]>H)p=1;else if(c[i]<L)p=0;o[i]=p}return o}
const ffill=a=>{let l=NaN;return a.map(v=>v===v&&v!=null?(l=v):l)};
function roll(x,w){return pdRoll(x,w,false).map(v=>v===v?Math.exp(v)-1:NaN)}
/* 輸入：dates（基準標的交易日）、C/O：{sym:[對齊 dates 的還原收盤／開盤，缺值 NaN]}、ic：大盤指數收盤、bench：基準收盤 */
function prep(mk,u,dates,C,O,ic,bench){const n=dates.length,w=WKN[mk],P={mk,u,dates,C:{},O:{},have:{},S:{},WK:{},RAW:{},hi20:{},n};
 for(const t of u){const c=C[t]||new Array(n).fill(NaN);let cnt=0;P.have[t]=c.map(v=>{if(v===v)cnt++;return v===v&&cnt>60});
  const cf=ffill(c);P.C[t]=cf;P.O[t]=ffill(O[t]||new Array(n).fill(NaN));
  const ix=[],cv=[];c.forEach((v,i)=>{if(v===v){ix.push(i);cv.push(v)}});
  const lr=cf.map((v,i)=>{const r=i?Math.log(v/cf[i-1]):NaN;return r===r?r:0});
  TR.forEach(([,k,a],ti)=>{const s0=sig(cv,k,a),s=new Array(n).fill(0);ix.forEach((i,j)=>s[i]=s0[j]);P.S[ti+'|'+t]=s;P.WK[ti+'|'+t]=roll(lr.map((r,i)=>(i?s[i-1]:0)*r),w)});
  P.RAW[t]=roll(lr,w);
  P.hi20[t]=cf.map((v,i)=>{if(i<20)return false;let H=-Infinity;for(let j=i-20;j<i;j++){if(cf[j]!==cf[j])return false;H=Math.max(H,cf[j])}return v>H})}
 const icf=ffill(ic),ma=rollMean(icf,200);let on=false;
 P.F=icf.map((v,i)=>{if(mk==='tw'){if(ma[i]===ma[i]){if(v>ma[i]*1.02)on=true;else if(v<ma[i]*.98)on=false}return on}return v>ma[i]});
 P.bench=ffill(bench);return P}
function run(P,i0,opt){const {mk,u,dates}=P,C=P.C,O=P.O,o=Object.assign({},DEF[mk],opt||{});
 const mp=o.maxPos,CORE=mk==='crypto'?{BTC:Math.min(.25,mp),ETH:Math.min(.25,mp)}:{},slot=mp,maxN=mk==='crypto'?1:5;
 let cash=INIT,pos=new Map(),trader=null,loss=0,pend=[],eq=[],ntr=0,cost=0,nsw=0,lock=new Map(),score=null;const sw=[],trades=[];
 for(let i=i0;i<dates.length;i++){let sToday=false;
  for(const [side,t,x,why] of pend){const px=O[t][i];if(px!==px)continue;const [fb,fs]=feeOf(mk,t);
   if(side==='S'){const p=pos.get(t);if(!p)continue;const sh=x==null?p.sh:Math.min(p.sh,x/px),v=sh*px;cash+=v*(1-fs);cost+=v*fs;const part=sh/p.sh,c0=p.cost*part,pnl=v*(1-fs)/c0-1;p.sh-=sh;p.cost-=c0;ntr++;
    if(p.sh<=1e-9)pos.delete(t);trades.push([dates[i],'S',t,px,pnl,why]);
    if(why==='stop'||why==='tp')lock.set(t,mk!=='tw'?'hi20':(P.F[i-1]?'need_off':'need_on'));
    if((why==='signal'||why==='stop'||why==='tp')&&!CORE[t]){if(pnl<0){loss++;if(loss>=2&&!sToday){const nx=score.find(k=>k!==trader);sw.push([dates[i],trader,nx]);trader=nx;nsw++;loss=0;sToday=true}}else loss=0}}
   else{let E=cash;for(const [k,q0] of pos){const q=O[k][i];if(q===q)E+=q0.sh*q}const amt=Math.min(x*E,cash);if(amt<E*.01)continue;
    const sh=amt*(1-fb)/px;cash-=amt;cost+=amt*fb;ntr++;if(pos.has(t)){const q=pos.get(t);q.sh+=sh;q.cost+=amt}else pos.set(t,{sh,cost:amt,peak:C[t][i]});trades.push([dates[i],'B',t,px,null,why])}}
  pend=[];let E=cash;for(const [k,q] of pos)E+=q.sh*C[k][i];eq.push(E);
  const av=u.filter(t=>P.have[t][i]);if(av.length<3)continue;
  const scd=TR.map((_,ti)=>{let s=0,m=0;for(const t of av){const v=P.WK[ti+'|'+t][i];if(v===v){s+=v;m++}}return m?s/m:-Infinity});
  score=TR.map((_,ti)=>ti).sort((a,b)=>scd[b]-scd[a]);
  if(trader==null){const top=scd[score[0]];trader=score.find(k=>PREFER.has(k)&&scd[k]>=top-.005);if(trader==null)trader=score[0];sw.push([dates[i],null,trader])}
  const F=P.F[i];
  for(const [t,s] of [...lock]){if(s==='hi20'&&P.hi20[t][i])lock.delete(t);else if(s==='need_off'&&!F)lock.set(t,'need_on');else if(s==='need_on'&&F)lock.delete(t)}
  const out=new Set(),pe=[];
  for(const [t,p] of pos){p.peak=Math.max(p.peak,C[t][i]);
   if(o.stop&&C[t][i]<p.peak*(1-o.stop)){pe.push(['S',t,null,'stop']);out.add(t);continue}
   if(o.tp&&C[t][i]>=p.cost/p.sh*(1+o.tp)){pe.push(['S',t,null,'tp']);out.add(t);continue}
   if(CORE[t])continue;if(!P.S[trader+'|'+t][i]){pe.push(['S',t,null,'signal']);out.add(t)}}
  const hold=[...pos.keys()].filter(t=>!out.has(t));
  for(const t of hold){const tw=CORE[t]||slot,w=pos.get(t).sh*C[t][i]/E;if(w>tw*1.25)pe.push(['S',t,(w-tw)*E,'rebalance'])}
  if(F){for(const t in CORE)if(av.includes(t)&&!lock.has(t)&&!out.has(t)){const w=hold.includes(t)?pos.get(t).sh*C[t][i]/E:0;if(w<CORE[t]*.8)pe.push(['B',t,CORE[t]-w,'core'])}
   let sat=hold.filter(t=>!CORE[t]).length;
   const cand=av.filter(t=>!CORE[t]&&!hold.includes(t)&&!out.has(t)&&!lock.has(t)&&P.S[trader+'|'+t][i]).sort((a,b)=>P.WK[trader+'|'+b][i]-P.WK[trader+'|'+a][i]);
   for(const t of cand.slice(0,Math.max(0,maxN-sat))){pe.push(['B',t,slot,'sat']);sat++}
   const held=new Set([...hold,...pe.filter(x=>x[0]==='B').map(x=>x[1])]);
   let est=cash;for(const t of out)est+=pos.get(t).sh*C[t][i];for(const x of pe)if(x[0]==='B')est-=x[2]*E;
   while(sat<maxN&&est>E*.08){const cc=av.filter(t=>!CORE[t]&&!held.has(t)&&!lock.has(t)&&P.RAW[t][i]>0).sort((a,b)=>P.RAW[b][i]-P.RAW[a][i]);if(!cc.length)break;const t=cc[0];pe.push(['B',t,slot,'cash-fill']);held.add(t);sat++;est-=slot*E}}
  pend=pe}
 return{eq,bench:P.bench.slice(i0),dates:dates.slice(i0),ntr,cost,nsw,sw,trades,trader,score,pos}}
const API={TR,U,IDX,BENCH,DEF,INIT,prep,run,feeOf,sig};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.V2SIM=API})(typeof window!=='undefined'?window:this);

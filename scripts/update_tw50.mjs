// 臺灣50指數（0050 追蹤指數）成分股時間軸＋回測用還原價資料包。手動執行（每季審核公告後跑一次）：
//   node scripts/update_tw50.mjs constituents   掃臺灣指數公司新公告（taiwanindex.com.tw/news/{id}），把新的「臺灣50指數」納入／刪除接到時間軸
//        可加 --anchor=2330,2454,...（50 檔，來自元大投信 0050 持股權重頁）核對目前成分股；不一致就停下不寫檔
//   node scripts/update_tw50.mjs prices         重抓所有曾為成分股的個股＋0050＋加權指數（FinMind 免費資料集，免金鑰），寫 market/data/tw50_prices.json
//   node scripts/update_tw50.mjs all            兩個都做
// 規則：只接受公開公告解析出的變動；解析不到、檔數不是 50、納入的已在名單或刪除的不在名單 → 直接報錯不寫檔（不猜、不補）。
import fs from 'node:fs';
const CF='market/data/tw50_constituents.json',PF='market/data/tw50_prices.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),ymd=t=>new Date(t).toISOString().slice(0,10);
async function get(u,json=true){for(let i=0;i<3;i++){try{const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(r.ok)return json?await r.json():await r.text();console.log('HTTP',r.status,u)}catch(e){console.log('ERR',e.message,u)}await sleep(3000*(i+1))}throw new Error('fetch failed '+u)}
const strip=h=>h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ');
const codes=s=>[...s.replace(/\s/g,'').matchAll(/\((\d{4,6}[A-Z]?)\)/g)].map(m=>m[1]);
const names=s=>[...s.replace(/\s/g,'').matchAll(/([^：:、，,。()（）]{1,12})\((\d{4,6}[A-Z]?)\)/g)].map(m=>[m[2],m[1]]);
// 從一則公告解析臺灣50指數的納入／刪除與生效日；不是臺灣50相關回 null
export function parseNews(id,text){
  const v=text.replace(/\s/g,''),pub=(text.match(/(20\d\d)\/(\d\d)\/(\d\d)/)||[]).slice(1).join('-');
  if(!v.includes('臺灣50指數'))return null;
  let i=v.indexOf('臺灣50指數',Math.max(0,v.indexOf('結果如下')));if(i<0)return null;
  const j=v.indexOf('臺灣中型100指數',i+5),seg=v.slice(i,j>0?j:i+600);
  const ad=seg.match(/納入[：:](.*?)(?:[（(]二[）)]|成分股刪除|刪除)/),de=seg.match(/刪除[：:](.*?)(?:[（(]三[）)]|候補|$)/);
  const ef=v.match(/亦即自(20\d\d)年(\d+)月(\d+)日/)||v.match(/(20\d\d)年(\d+)月(\d+)日[（(]星期.[）)]起生效/);
  if(!ad||!de||!ef)return{id,pub,bad:true};
  return{id,pub,eff:`${ef[1]}-${ef[2].padStart(2,'0')}-${ef[3].padStart(2,'0')}`,add:codes(ad[1]),del:codes(de[1]),adhoc:!/定期審核/.test(v.slice(0,80)),names:names(seg)}}
function apply(set,ch){const s=new Set(set);for(const c of ch.add){if(s.has(c))throw new Error(`news/${ch.id}: 納入 ${c} 已在名單`);s.add(c)}for(const c of ch.del){if(!s.has(c))throw new Error(`news/${ch.id}: 刪除 ${c} 不在名單`);s.delete(c)}
  if(s.size!==50)throw new Error(`news/${ch.id}: 套用後 ${s.size} 檔，不是 50`);return[...s].sort()}
async function constituents(){
  const J=JSON.parse(fs.readFileSync(CF,'utf8'));let last=Math.max(...J.periods.map(p=>p.news||0),J.scannedTo||0),miss=0,id=last;
  const found=[];
  while(miss<10){id++;const h=await get(`https://taiwanindex.com.tw/news/${id}`,false);await sleep(300);
    if(!h){miss++;continue}const t=strip(h),a=t.indexOf('關於我們 '),b=t.indexOf('回上頁');const body=a>=0&&b>a?t.slice(a+5,b).trim():'';if(!body){miss++;continue}miss=0;J.scannedTo=id;
    const r=parseNews(id,body);if(!r)continue;if(r.bad)throw new Error(`news/${id} 提到臺灣50指數但解析不到納入／刪除／生效日，請人工確認後手動加入`);found.push(r)}
  let cur=J.periods.at(-1).codes;
  for(const r of found){if(J.periods.some(p=>p.news===r.id))continue;
    if(!r.add.length&&!r.del.length){J.reviews.push({news:r.id,pub:r.pub,eff:r.eff,add:[],del:[]});console.log('news',r.id,r.eff,'臺灣50 無變動');continue}
    cur=apply(cur,r);for(const [c,n] of r.names)J.names[c]=J.names[c]||n;
    J.periods.push({from:r.eff,news:r.id,pub:r.pub,src:'official',adhoc:r.adhoc,add:r.add,del:r.del,codes:cur});J.reviews.push({news:r.id,pub:r.pub,eff:r.eff,add:r.add,del:r.del});console.log('news',r.id,r.eff,'+',r.add,'-',r.del)}
  const an=(process.argv.find(x=>x.startsWith('--anchor='))||'').slice(9);
  if(an){const A=an.split(',').map(s=>s.trim()).filter(Boolean).sort();const now=J.periods.filter(p=>p.from<=ymd(Date.now())).at(-1).codes;const x=A.filter(c=>!now.includes(c)),y=now.filter(c=>!A.includes(c));
    if(x.length||y.length)throw new Error(`與元大 0050 持股不一致：元大多 ${x}，時間軸多 ${y}；不寫檔`);J.anchor={...J.anchor,checked:ymd(Date.now()),codes:A};console.log('anchor OK')}
  J.updated=ymd(Date.now());fs.writeFileSync(CF,JSON.stringify(J,null,1));console.log('periods',J.periods.length,'scannedTo',J.scannedTo)}
// ---- 還原價（與 backtest.html 同一套：除權息、減資、分割／面額變更往回乘） ----
const FM='https://api.finmindtrade.com/api/v4/data?dataset=';
async function fm(q){await sleep(1300);const j=await get(FM+q);if(!j||(j.status&&j.status!==200))throw new Error('FinMind '+(j&&j.msg)+' '+q);return j.data||[]}
function adjTW(b,ev){const E=ev.slice().sort((x,y)=>x[0]<y[0]?1:-1),o=new Array(b.length);let f=1,k=0;for(let i=b.length-1;i>=0;i--){while(k<E.length&&E[k][0]>b[i][0]){f*=E[k][1];k++}o[i]=[b[i][0],b[i][1]*f,b[i][2]*f]}return o}
async function prices(){
  const J=JSON.parse(fs.readFileSync(CF,'utf8')),st=J.priceStart||'2021-01-04';
  const syms=[...new Set(J.periods.flatMap(p=>p.codes))].sort(),SP={};
  for(const x of await fm('TaiwanStockSplitPrice&start_date='+st)){const f=+x.after_price/+x.before_price;if(f>0&&isFinite(f))(SP[x.stock_id]=SP[x.stock_id]||[]).push([x.date,f])}
  const bars=async s=>{const b=(await fm('TaiwanStockPrice&data_id='+s+'&start_date='+st)).map(x=>[x.date,+x.close,+x.open]).filter(x=>x[1]>0&&x[2]>0);if(s==='TAIEX')return b;
    const ev=[];for(const x of await fm('TaiwanStockDividendResult&data_id='+s+'&start_date='+st)){const f=+x.after_price/+x.before_price;if(f>0&&f<1.5)ev.push([x.date,f])}
    for(const x of await fm('TaiwanStockCapitalReductionReferencePrice&data_id='+s+'&start_date='+st)){const f=+x.PostReductionReferencePrice/+x.ClosingPriceonTheLastTradingDay;if(f>0&&f<20)ev.push([x.date,f])}
    return adjTW(b,ev.concat(SP[s]||[]))};
  const B={};for(const s of ['0050','TAIEX',...syms]){B[s]=await bars(s);console.log(s,B[s].length)}
  const dates=B['0050'].map(x=>x[0]),r6=v=>v==null?null:+v.toPrecision(6),gaps={};
  const al=(s,j)=>{const m=new Map(B[s].map(x=>[x[0],x[j]]));return dates.map(d=>m.has(d)?r6(m.get(d)):null)};
  const C={},O={};for(const s of ['0050',...syms]){C[s]=al(s,1);O[s]=al(s,2);
    // 還原後仍有超過 ±11% 單日跳動（台股漲跌幅 10%）→ 該日以前的資料不採用，頁面標示
    const c=B[s];let cut=null;if(s!=='0050')for(let i=1;i<c.length;i++){const q=c[i][1]/c[i-1][1];if(q<.89||q>1.11)cut=c[i][0]}
    if(cut){gaps[s]=cut;dates.forEach((d,i)=>{if(d<cut){C[s][i]=null;O[s][i]=null}})}}
  const out={updated:ymd(Date.now()),source:'FinMind 免費資料集：TaiwanStockPrice＋DividendResult＋CapitalReductionReferencePrice＋SplitPrice（還原價）',start:dates[0],end:dates.at(-1),dates,idx:al('TAIEX',1),c:C,o:O,gaps};
  fs.writeFileSync(PF,JSON.stringify(out));console.log('wrote',PF,dates[0],'→',dates.at(-1),'gaps',gaps,(fs.statSync(PF).size/1024|0)+'KB')}
if(import.meta.url===`file://${process.argv[1]}`){const w=process.argv[2]||'all';
  if(w==='constituents'||w==='all')await constituents();if(w==='prices'||w==='all')await prices()}

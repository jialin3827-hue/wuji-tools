'use strict';
/* 共用存檔函式（股市頁 app.js 與虛擬幣頁 crypto.html 共用）。主存檔格式不變：localStorage wuji_market_v1 */
const K='wuji_market_v1';
function load(){try{let s=JSON.parse(localStorage.getItem(K))||null;if(s){s.track=s.track||{};s.track.firstTrade=!!s.track.firstTrade;if(s.track.lastActiveDay==null)s.track.lastActiveDay=null;}return s}catch(e){return null}}
function save(){localStorage.setItem(K,JSON.stringify(S))}
function track(n){if(!n)return;const p='event/'+n;const fire=()=>{try{const g=window.goatcounter;if(g&&typeof g.count==='function'){g.count({path:p,event:true});return true;}}catch(e){}return false;};if(fire())return;if(!window._gcq)window._gcq=[];window._gcq.push(fire);if(!window._gcqT){window._gcqT=setInterval(()=>{for(let i=(window._gcq||[]).length-1;i>=0;i--){if(window._gcq[i] && window._gcq[i]()){window._gcq.splice(i,1);}}if(!(window._gcq&&window._gcq.length)){clearInterval(window._gcqT);window._gcqT=0;}},400);}}
function checkReturnDay(){try{let s=load();if(!s||!s.born)return;const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});s.track=s.track||{};if(s.track.lastActiveDay===today)return;const bornDay=new Date(s.born).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});if(today!==bornDay){track('return-day');}s.track.lastActiveDay=today;localStorage.setItem(K,JSON.stringify(s));if(typeof S!=='undefined'&&S&&S.born===s.born){S.track=s.track;}}catch(e){}}
/* Service worker：更新後自動接管並重新整理一次 */
const APPV=23;
if('serviceWorker' in navigator){const had=!!navigator.serviceWorker.controller;let done=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||done)return;done=true;location.reload()});
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js?v='+APPV).then(r=>r.update()).catch(()=>{}))}

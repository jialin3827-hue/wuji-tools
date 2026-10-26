'use strict';
/* 共用存檔函式（股市頁 app.js 與虛擬幣頁 crypto.html 共用）。主存檔格式不變：localStorage wuji_market_v1 */
const K='wuji_market_v1';
function load(){try{return JSON.parse(localStorage.getItem(K))||null}catch(e){return null}}
function save(){localStorage.setItem(K,JSON.stringify(S))}
/* Service worker：更新後自動接管並重新整理一次 */
const APPV=18;
if('serviceWorker' in navigator){const had=!!navigator.serviceWorker.controller;let done=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||done)return;done=true;location.reload()});
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js?v='+APPV).then(r=>r.update()).catch(()=>{}))}

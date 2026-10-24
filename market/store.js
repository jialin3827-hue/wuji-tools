'use strict';
/* 共用存檔函式（股市頁 app.js 與虛擬幣頁 crypto.html 共用）。主存檔格式不變：localStorage wuji_market_v1 */
const K='wuji_market_v1';
function load(){try{return JSON.parse(localStorage.getItem(K))||null}catch(e){return null}}
function save(){localStorage.setItem(K,JSON.stringify(S))}

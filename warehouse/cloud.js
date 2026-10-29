(()=>{const C=window.WH_CLOUD||{};const on=!!(C.url&&C.anon);let rev=-1,busy=0,t=null;
const rpc=(f,b)=>fetch(C.url+"/rest/v1/rpc/"+f,{method:"POST",headers:{apikey:C.anon,Authorization:"Bearer "+C.anon,"Content-Type":"application/json"},body:JSON.stringify(b)}).then(async r=>{const j=await r.json().catch(()=>null);if(!r.ok)throw new Error((j&&j.message)||r.status);return j});
const cred=()=>JSON.parse(sessionStorage.getItem("whC")||"null");
function banner(txt,c){let b=document.getElementById("cloudBar");if(!b){b=document.createElement("div");b.id="cloudBar";b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99;font-size:12px;text-align:center;padding:2px;color:#fff";document.body.appendChild(b)}b.textContent=txt;b.style.background=c}
async function pull(force){const c=cred();if(!on||!c||busy)return;try{const r=await rpc("wh_rev",c);if(!force&&r==rev)return;
 const g=await rpc("wh_get",c);if(g.empty){if(c.p_u&&S.users[c.p_u]?.role=="admin")push();return}
 rev=g.rev;const keep=S;S=g.data;localStorage.setItem("wuji-wh-v1",JSON.stringify(S));banner("☁️ 雲端同步中","#2e7d32");if(JSON.stringify(keep)!==JSON.stringify(S))try{render()}catch(e){}}
 catch(e){banner("⚠️ 雲端連線失敗："+e.message,"#c62828")}}
async function push(){const c=cred();if(!on||!c)return;const r=S.users?.[c.p_u]?.role;if(r=="viewer")return;busy=1;
 try{rev=await rpc("wh_put",{...c,d:S});banner("☁️ 已同步","#2e7d32");
  if(S.users?.[c.p_u]&&S.users[c.p_u].h!==c.ph){c.ph=S.users[c.p_u].h;sessionStorage.setItem("whC",JSON.stringify(c))}}
 catch(e){banner("⚠️ 上傳失敗："+e.message,"#c62828")}busy=0}
window.WHC={on,async login(u,ph){const c={p_u:u,ph};const g=await rpc("wh_get",c);sessionStorage.setItem("whC",JSON.stringify(c));if(g.empty){if(S.users?.[u]?.role=="admin")await push();return}rev=g.rev;S=g.data;localStorage.setItem("wuji-wh-v1",JSON.stringify(S));banner("☁️ 雲端同步中","#2e7d32")},
 save(){if(!on)return;clearTimeout(t);t=setTimeout(push,600)},pull};
addEventListener("load",()=>{if(!on)banner("尚未接雲端（資料只存在本機）","#757575");else{pull(true);setInterval(pull,4000)}});
})();

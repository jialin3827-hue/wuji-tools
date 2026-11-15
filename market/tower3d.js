/* 舞吉股市大亨 — 大亨大樓 3D 試玩版。Three.js r170 (MIT, vendored). 讀取 localStorage wuji_market_v1（只讀，不寫入）。 */
import * as THREE from 'three';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {RoomEnvironment} from './vendor/three/RoomEnvironment.js';

const Q=new URLSearchParams(location.search);
const $=s=>document.querySelector(s);
const MAXF=46;
const RANKS=[{m:0,n:'街角小店',e:'🏪'},{m:2e5,n:'溫馨公寓',e:'🏠'},{m:5e5,n:'商辦大樓',e:'🏢'},{m:1e6,n:'千金商廈',e:'👑'},{m:3e6,n:'城市地標',e:'🌆'},{m:1e7,n:'舞吉大亨塔',e:'💎'},{m:5e7,n:'傳奇天際塔',e:'🚀'}];
const rankOf=v=>{let r=0;RANKS.forEach((x,i)=>{if(v>=x.m)r=i});return r};
const floorsOf=v=>Math.max(2,Math.min(MAXF,Math.round(3+13.5*Math.log10(Math.max(v,1e4)/1e5))));
const widthOf=i=>i<10?5.2:i<20?4.5:i<30?3.8:i<40?3.1:2.5;
const nf=v=>Math.round(v).toLocaleString('zh-TW');

/* ---------- renderer ---------- */
const canvas=$('#c');
let R;
try{R=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:Q.has('still')||Q.has('cap')})}catch(e){$('#err').style.display='flex';throw e}
R.setPixelRatio(Math.min(devicePixelRatio||1,2));
R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.05;
R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const pm=new THREE.PMREMGenerator(R);scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;
const cam=new THREE.PerspectiveCamera(38,1,0.5,600);cam.position.set(30,18,30);
const ctl=new OrbitControls(cam,canvas);
Object.assign(ctl,{enableDamping:true,dampingFactor:0.08,enablePan:false,autoRotate:!Q.has('still'),autoRotateSpeed:0.7,minDistance:14,maxDistance:110,maxPolarAngle:1.48,minPolarAngle:0.25});
let userZoom=false;ctl.addEventListener('start',()=>{userZoom=true;});

/* ---------- sky / lights ---------- */
const skyU={top:{value:new THREE.Color()},bot:{value:new THREE.Color()},sun:{value:new THREE.Vector3(0,1,0)},sunC:{value:new THREE.Color()}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(300,32,16),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
 vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 top,bot,sunC,sun;varying vec3 vP;void main(){float h=clamp(vP.y*1.6+.08,0.,1.);vec3 c=mix(bot,top,pow(h,.7));float s=max(dot(vP,normalize(sun)),0.);c+=sunC*(pow(s,350.)*1.2+pow(s,8.)*.25);gl_FragColor=vec4(c,1.);}'}));
scene.add(sky);
const starG=new THREE.BufferGeometry(),sp=[];for(let i=0;i<500;i++){const a=Math.random()*6.283,y=0.12+Math.random()*0.88,r=Math.sqrt(1-y*y);sp.push(Math.cos(a)*r*280,y*280,Math.sin(a)*r*280)}
starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
const starM=new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false});scene.add(new THREE.Points(starG,starM));
const hemi=new THREE.HemisphereLight(0xcfe8ff,0x5b7a4a,1);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,2);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:40,bottom:-30,near:1,far:160});sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.03;scene.add(sun,sun.target);
scene.fog=new THREE.Fog(0xbfe3ff,90,230);
const KEY=[ // phase, top, bottom, sunColor, sunI, hemiI, night
 [0.00,'#3f86d6','#bfe4ff','#fff1d0',2.4,1.05,0],[0.36,'#3f86d6','#bfe4ff','#fff1d0',2.4,1.05,0],
 [0.46,'#3a4a8f','#ff9b5e','#ffad6b',1.3,0.6,0.45],[0.56,'#060a1c','#1d2552','#8ea4ff',0.35,0.28,1],
 [0.86,'#060a1c','#1d2552','#8ea4ff',0.35,0.28,1],[0.94,'#4a5ba3','#ffc49c','#ffcf9f',1.3,0.6,0.45],[1.00,'#3f86d6','#bfe4ff','#fff1d0',2.4,1.05,0]].map(k=>[k[0],new THREE.Color(k[1]),new THREE.Color(k[2]),new THREE.Color(k[3]),k[4],k[5],k[6]]);
let night=0;
function setTime(p){let i=0;while(i<KEY.length-2&&p>KEY[i+1][0])i++;const a=KEY[i],b=KEY[i+1],t=THREE.MathUtils.smoothstep(p,a[0],b[0]);
 skyU.top.value.lerpColors(a[1],b[1],t);skyU.bot.value.lerpColors(a[2],b[2],t);skyU.sunC.value.lerpColors(a[3],b[3],t);
 sun.color.copy(skyU.sunC.value);sun.intensity=THREE.MathUtils.lerp(a[4],b[4],t);hemi.intensity=THREE.MathUtils.lerp(a[5],b[5],t);night=THREE.MathUtils.lerp(a[6],b[6],t);
 scene.fog.color.copy(skyU.bot.value);starM.opacity=Math.max(0,night*1.2-0.2);scene.environmentIntensity=0.7-0.45*night;
 const ang=p*6.283+0.8,el=night>0.8?0.9:THREE.MathUtils.lerp(1.1,0.25,Math.min(1,night*2.2));
 sun.position.set(Math.cos(ang)*60*Math.cos(el),60*Math.sin(el)+6,Math.sin(ang)*60*Math.cos(el));skyU.sun.value.copy(sun.position).normalize();
 if(night>0.8)skyU.sunC.value.multiplyScalar(0.15)}

/* ---------- materials ---------- */
const M={
 facade:new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.7,metalness:0.05}),
 glass:new THREE.MeshStandardMaterial({color:0x2f5a80,roughness:0.12,metalness:0.75}),
 gold:new THREE.MeshStandardMaterial({color:0xf3c443,roughness:0.28,metalness:1,emissive:0x3a2600,emissiveIntensity:0.4}),
 win:new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),
 grass:new THREE.MeshStandardMaterial({color:0x6fbf5a,roughness:0.95,flatShading:true}),
 dirt:new THREE.MeshStandardMaterial({color:0x8a6a4a,roughness:1,flatShading:true}),
 stone:new THREE.MeshStandardMaterial({color:0xe9e2d4,roughness:0.9}),
 water:new THREE.MeshStandardMaterial({color:0x2e7fae,roughness:0.25,metalness:0.2,flatShading:true}),
 white:new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.6}),
};
const box=new THREE.BoxGeometry(1,1,1);
const tmp=new THREE.Object3D(),col=new THREE.Color();

/* ---------- world ---------- */
const wG=new THREE.CircleGeometry(220,48);wG.rotateX(-Math.PI/2);const water=new THREE.Mesh(wG,M.water);water.position.y=-1.4;water.receiveShadow=true;scene.add(water);
const isl=new THREE.CylinderGeometry(19,16,2.2,28,1);{const p=isl.attributes.position;for(let i=0;i<p.count;i++){if(p.getY(i)<0){const s=0.9+Math.sin(i*12.9898)*0.08;p.setX(i,p.getX(i)*s);p.setZ(i,p.getZ(i)*s)}}isl.computeVertexNormals()}
const island=new THREE.Mesh(isl,[M.dirt,M.grass,M.dirt]);island.position.y=-1.1;island.receiveShadow=true;scene.add(island);
const plz=new THREE.Mesh(new THREE.CylinderGeometry(7.6,7.8,0.16,8),M.stone);plz.position.y=0.08;plz.rotation.y=Math.PI/8;plz.receiveShadow=true;scene.add(plz);
const road=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.1,11),M.stone);road.position.set(0,0.05,13);road.receiveShadow=true;scene.add(road);
// neighbours
const NB=[];for(let i=0;i<11;i++){const a=i/11*6.283+0.35,r=12.2+(i%3)*1.6;if(Math.abs(Math.atan2(Math.sin(a-1.5708),Math.cos(a-1.5708)))<0.35)continue;NB.push([Math.cos(a)*r,Math.sin(a)*r,1.6+((i*7)%5)*0.7,1.8+(i%2)*0.6])}
const nbM=new THREE.InstancedMesh(box,M.facade,NB.length);const nbCol=['#f2d7b6','#cfe0ec','#f4c7c0','#e6e1d3','#c9dcc0'];
NB.forEach((b,i)=>{tmp.position.set(b[0],b[2]/2,b[1]);tmp.rotation.set(0,Math.atan2(b[0],b[1]),0);tmp.scale.set(b[3],b[2],b[3]);tmp.updateMatrix();nbM.setMatrixAt(i,tmp.matrix);nbM.setColorAt(i,col.set(nbCol[i%5]))});
nbM.castShadow=nbM.receiveShadow=true;scene.add(nbM);
const roofG=new THREE.ConeGeometry(1,1,4);roofG.rotateY(Math.PI/4);const nbR=new THREE.InstancedMesh(roofG,M.facade,NB.length);
NB.forEach((b,i)=>{tmp.position.set(b[0],b[2]+0.45,b[1]);tmp.rotation.set(0,Math.atan2(b[0],b[1]),0);tmp.scale.set(b[3]*0.78,0.9,b[3]*0.78);tmp.updateMatrix();nbR.setMatrixAt(i,tmp.matrix);nbR.setColorAt(i,col.set(i%2?'#c0573e':'#3e6d8f'))});nbR.castShadow=true;scene.add(nbR);
// trees
const TR=[];for(let i=0;i<34;i++){const a=i*2.399+0.3,r=8.6+((i*37)%70)/10;const x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<1.8&&z>7)continue;if(NB.some(b=>Math.hypot(b[0]-x,b[1]-z)<2.1))continue;TR.push([x,z,0.75+((i*13)%10)/20])}
const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12,0.16,0.8,5),M.dirt,TR.length);
const crownG=new THREE.IcosahedronGeometry(0.9,0);const crown=new THREE.InstancedMesh(crownG,new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9,flatShading:true}),TR.length);
TR.forEach((t,i)=>{tmp.rotation.set(0,i,0);tmp.position.set(t[0],0.4*t[2],t[1]);tmp.scale.setScalar(t[2]);tmp.updateMatrix();trunk.setMatrixAt(i,tmp.matrix);
 tmp.position.set(t[0],1.25*t[2],t[1]);tmp.scale.set(t[2],t[2]*1.25,t[2]);tmp.updateMatrix();crown.setMatrixAt(i,tmp.matrix);crown.setColorAt(i,col.set(['#3f9b4f','#5bb04a','#2f8a5a','#7cc152'][i%4]))});
trunk.castShadow=crown.castShadow=true;scene.add(trunk,crown);
// clouds
const cl=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true,transparent:true,opacity:0.92}),21);
const CL=[];for(let c=0;c<7;c++){const a=c*0.9,r=40+c*7,h=26+(c%3)*7;for(let k=0;k<3;k++)CL.push({a,r,h,dx:(k-1)*2.6,s:k===1?3:2.1})}
const cloudGroup=new THREE.Group();cloudGroup.add(cl);scene.add(cloudGroup);
CL.forEach((c,i)=>{tmp.position.set(Math.cos(c.a)*c.r+c.dx,c.h+(i%3===1?0.6:0),Math.sin(c.a)*c.r);tmp.rotation.set(0,i,0);tmp.scale.set(c.s,c.s*0.55,c.s*0.8);tmp.updateMatrix();cl.setMatrixAt(i,tmp.matrix)});

/* ---------- tower (instanced, fixed draw calls) ---------- */
const tower=new THREE.Group();scene.add(tower);
const PER=5;// windows per side
const slabs=new THREE.InstancedMesh(box,M.facade,MAXF+1),cores=new THREE.InstancedMesh(box,M.glass,MAXF),wins=new THREE.InstancedMesh(box,M.win,MAXF*4*PER),trims=new THREE.InstancedMesh(box,M.gold,MAXF);
slabs.castShadow=cores.castShadow=true;slabs.receiveShadow=true;tower.add(slabs,cores,wins,trims);
[slabs,cores,wins,trims].forEach(m=>{m.frustumCulled=false;for(let i=0;i<m.count;i++)m.setColorAt(i,col.set(0xffffff))});
const winSeed=[];for(let i=0;i<MAXF*4*PER;i++)winSeed.push((Math.sin(i*78.233)*43758.5453)%1+1)%1;
// lobby canopy + pillars
const lobby=new THREE.Group();tower.add(lobby);
const can=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.18,1.6),M.gold);can.position.set(0,1.05,3.3);can.castShadow=true;lobby.add(can);
[-1.3,1.3].forEach(x=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,1,8),M.gold);p.position.set(x,0.5,3.95);lobby.add(p)});
// crown: roof, spire, coin logo with candles
const top=new THREE.Group();tower.add(top);
const roof=new THREE.Mesh(box,M.facade);roof.castShadow=true;top.add(roof);
const ring=new THREE.Mesh(new THREE.TorusGeometry(1,0.08,6,28),M.gold);ring.rotation.x=Math.PI/2;top.add(ring);
const spire=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.14,2.6,6),M.gold);top.add(spire);
const coin=new THREE.Group();top.add(coin);
const coinD=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,0.26,32),M.gold);coinD.rotation.x=Math.PI/2;coin.add(coinD);
const rim=new THREE.Mesh(new THREE.TorusGeometry(1.15,0.07,6,32),M.gold);coin.add(rim);
const cRed=new THREE.MeshStandardMaterial({color:0xf04a4a,roughness:0.4,emissive:0x7a0f0f,emissiveIntensity:0.6}),cGrn=new THREE.MeshStandardMaterial({color:0x14c07a,roughness:0.4,emissive:0x05502f,emissiveIntensity:0.6});
[[-0.5,0.55,-0.1,cGrn],[0,0.8,0.05,cRed],[0.5,1.05,0.15,cRed]].forEach(([x,h,y,m])=>{[1,-1].forEach(s=>{const b=new THREE.Mesh(new THREE.BoxGeometry(0.26,h,0.12),m);b.position.set(x,y,0.16*s);coin.add(b);const w=new THREE.Mesh(new THREE.BoxGeometry(0.05,h+0.34,0.06),m);w.position.set(x,y,0.16*s);coin.add(w)})});
const glow=new THREE.PointLight(0xffd36b,0,30,1.6);top.add(glow);
// search lights (night, 城市地標+)
const beamM=new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
const beamG=new THREE.CylinderGeometry(0.1,2.2,55,14,1,true);beamG.translate(0,27.5,0);
const beams=[0,1].map(i=>{const b=new THREE.Mesh(beamG,beamM);top.add(b);return b});

let shown=0,target=3,rank=0;
function layout(f){
 const full=Math.floor(f),part=f-full;let y=0;
 for(let i=0;i<MAXF;i++){
  const s=i<full?1:i===full?part:0,w=widthOf(i),h=0.92*s;
  tmp.rotation.set(0,0,0);
  tmp.position.set(0,y+0.04,0);tmp.scale.set(s?w:0.0001,s?0.08:0.0001,s?w:0.0001);tmp.updateMatrix();slabs.setMatrixAt(i,tmp.matrix);
  tmp.position.set(0,y+0.08+h/2,0);tmp.scale.set(s?w-0.3:0.0001,Math.max(h,0.0001),s?w-0.3:0.0001);tmp.updateMatrix();cores.setMatrixAt(i,tmp.matrix);
  const trim=s&&rank>=1&&((i+1)%5===0||widthOf(i+1)!==w);tmp.position.set(0,y+0.08+h,0);tmp.scale.set(trim?w+0.18:0.0001,trim?0.1:0.0001,trim?w+0.18:0.0001);tmp.updateMatrix();trims.setMatrixAt(i,tmp.matrix);
  const half=(w-0.3)/2+0.02;
  for(let sd=0;sd<4;sd++)for(let k=0;k<PER;k++){const id=(i*4+sd)*PER+k,u=-((w-0.3)/2)+((k+0.5)*(w-0.3))/PER,ww=(w-0.3)/PER*0.62;
   tmp.rotation.set(0,sd*Math.PI/2,0);const c=Math.cos(sd*Math.PI/2),sn=Math.sin(sd*Math.PI/2);
   tmp.position.set(u*c+half*sn,y+0.08+h*0.52,-u*sn+half*c);tmp.scale.set(s>0.3?ww:0.0001,s>0.3?h*0.62:0.0001,0.05);tmp.updateMatrix();wins.setMatrixAt(id,tmp.matrix)}
  if(s>0)y+=0.08+h;}
 const tw=widthOf(Math.max(0,full-1));
 tmp.position.set(0,y+0.08,0);tmp.rotation.set(0,0,0);tmp.scale.set(tw-0.2,0.16,tw-0.2);tmp.updateMatrix();slabs.setMatrixAt(MAXF,tmp.matrix);
 top.position.y=y+0.16;roof.scale.set(tw*0.62,0.7,tw*0.62);roof.position.y=0.35;
 const lux=rank>=3;ring.visible=lux;ring.scale.setScalar(tw*0.42);ring.position.y=0.75;
 spire.visible=rank>=4;spire.position.y=3.9+1.2;coin.position.y=lux?2.4:1.9;coin.scale.setScalar(rank>=5?1.25:rank>=2?1:0.8);
 [slabs,cores,wins,trims].forEach(m=>m.instanceMatrix.needsUpdate=true);
 return y}
let towerH=4;
function paintFacade(){const c=rank>=4?'#2a3346':rank>=2?'#e3e8ef':'#f1e4cc';for(let i=0;i<=MAXF;i++)slabs.setColorAt(i,col.set(c));slabs.instanceColor.needsUpdate=true;
 M.glass.color.set(rank>=4?'#1d3f63':'#2f5a80');roof.material=rank>=4?M.gold:M.facade}
const dayA=new THREE.Color('#a8d4f5'),dayB=new THREE.Color('#6fa5d6'),litA=new THREE.Color('#ffd27a'),litB=new THREE.Color('#fff0c4'),off=new THREE.Color('#18233a'),cc=new THREE.Color();
let lastN=-1,lastR=-1;
function paintWindows(){if(Math.abs(night-lastN)<0.01&&rank===lastR)return;lastN=night;lastR=rank;const frac=0.5+rank*0.07;
 for(let i=0;i<wins.count;i++){const sd=winSeed[i];const day=sd<0.5?dayA:dayB;const nt=sd<frac?(sd<frac*0.5?litA:litB):off;cc.lerpColors(day,nt,night);wins.setColorAt(i,cc)}wins.instanceColor.needsUpdate=true;
 glow.intensity=night*(rank>=3?60:25);M.gold.emissiveIntensity=0.35+night*0.9;beamM.opacity=rank>=4?night*0.09:0}

/* ---------- coin burst ---------- */
const NC=40,coins=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28,0.28,0.06,12),M.gold,NC);coins.frustumCulled=false;scene.add(coins);
const CP=[];for(let i=0;i<NC;i++){CP.push({p:new THREE.Vector3(),v:new THREE.Vector3(),r:0,life:0});tmp.scale.setScalar(0);tmp.updateMatrix();coins.setMatrixAt(i,tmp.matrix)}
function burst(){CP.forEach(c=>{c.p.set(0,top.position.y+2,0);const a=Math.random()*6.283,s=4+Math.random()*6;c.v.set(Math.cos(a)*s,6+Math.random()*8,Math.sin(a)*s);c.r=Math.random()*6;c.life=2.4})}
function stepCoins(dt){let any=false;CP.forEach((c,i)=>{if(c.life>0){any=true;c.life-=dt;c.v.y-=18*dt;c.p.addScaledVector(c.v,dt);if(c.p.y<0.2){c.p.y=0.2;c.v.multiplyScalar(0.3)}c.r+=dt*8;
 tmp.position.copy(c.p);tmp.rotation.set(c.r,c.r*0.7,0);tmp.scale.setScalar(c.life>0?Math.min(1,c.life*2):0)}else tmp.scale.setScalar(0);tmp.updateMatrix();coins.setMatrixAt(i,tmp.matrix)});
 coins.instanceMatrix.needsUpdate=true;coins.visible=any}

/* ---------- data: save or demo ---------- */
const S=(()=>{try{return JSON.parse(localStorage.getItem('wuji_market_v1'))}catch(e){return null}})();
const PX={tw:{},us:{}};let acct=Q.get('acct')||(S&&S.a?(S.acct||'tw'):'demo');if(!(S&&S.a)||Q.has('v'))acct='demo';
async function loadPx(){for(const m of['tw','us'])try{const j=await (await fetch(`data/${m}.json`,{cache:'no-cache'})).json();(j.list||[]).forEach(x=>PX[m][x.s]=x.c)}catch(e){}}
function acctVal(m){const a=S.a[m];if(!a)return 0;let v=a.cash||0;for(const s in a.pos){const p=a.pos[s];v+=p.q*(PX[m][s]||(p.q?p.t/p.q:0))}return v}
const sl=$('#sl');const s2v=x=>1e5*Math.pow(100,x/1000),v2s=v=>Math.round(Math.log(v/1e5)/Math.log(100)*1000);
let value=+Q.get('v')||1e5;sl.value=v2s(value);
function curVal(){return acct==='demo'?value:acctVal(acct)}
function refreshUI(){
 const v=curVal(),r=rankOf(v),nx=RANKS[r+1],cur=acct==='us'?'US$':'NT$';
 $('#rank').innerHTML=`<i>${RANKS[r].e}</i>${RANKS[r].n}`;$('#val').textContent=`${cur} ${nf(v)}`;
 $('#meta').textContent=`${floorsOf(v)} 層樓・${acct==='demo'?'示範資產':(acct==='us'?'美股帳戶總資產':'台股帳戶總資產')}`;
 const lo=RANKS[r].m||1e5,p=nx?Math.max(0,Math.min(1,Math.log(v/lo)/Math.log(nx.m/lo))):1;$('#prog').style.width=(p*100).toFixed(1)+'%';
 $('#meta2').textContent=nx?`距離「${nx.n}」還差 ${cur} ${nf(Math.max(0,nx.m-v))}`:'已達最高等級！';
 $('#src').textContent=acct==='demo'?'示範模式':'讀取你的存檔';$('#demoRow').style.display=acct==='demo'?'flex':'none';
 document.querySelectorAll('#acct button').forEach(b=>b.classList.toggle('on',b.dataset.a===acct));
 const nr=r;target=floorsOf(v);if(nr!==rank){const up=nr>rank;rank=nr;paintFacade();lastR=-1;if(up&&ready&&!window.__manual){burst();toast(`升級！${RANKS[r].e} ${RANKS[r].n}`)}}}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),1800)}
sl.addEventListener('input',()=>{value=s2v(+sl.value);playing=false;refreshUI()});
if(S&&S.a){$('#acctRow').style.display='flex';$('#acct').addEventListener('click',e=>{const a=e.target.dataset.a;if(a){acct=a;refreshUI()}})}
let tod=Q.get('tod')!=null?+Q.get('tod'):null,todMode=tod!=null?'fix':'auto',phase=tod??0.2;
const TODS={day:0.2,dusk:0.465,night:0.7};
$('#tod').addEventListener('click',e=>{const t=e.target.dataset.t;if(!t)return;todMode=t==='auto'?'auto':'fix';if(t!=='auto')tod=TODS[t];document.querySelectorAll('#tod button').forEach(b=>b.classList.toggle('on',b===e.target))});
if(tod!=null)document.querySelectorAll('#tod button').forEach(b=>b.classList.toggle('on',false));
let playing=false,playT=0;
$('#play').addEventListener('click',()=>{if(acct!=='demo'){acct='demo';}playing=true;playT=0;value=1e5;refreshUI()});
if(Q.has('noui'))document.body.classList.add('noui');

/* ---------- loop ---------- */
let ready=false;
function resize(){const w=innerWidth,h=innerHeight;R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();
const tgt=new THREE.Vector3();
function step(dt){
 if(playing){playT+=dt;value=s2v(Math.min(1000,playT/10*1000));sl.value=v2s(value);refreshUI();if(playT>=10)playing=false}
 shown+=(target-shown)*Math.min(1,dt*3);if(Math.abs(target-shown)<0.002)shown=target;
 towerH=layout(shown);
 if(todMode==='auto')phase=(phase+dt/48)%1;else phase+=(tod-phase)*Math.min(1,dt*2.5);
 setTime(phase);paintWindows();
 coin.rotation.y+=dt*0.9;beams.forEach((b,i)=>{const a=performance.now()/1000*(0.35)+i*Math.PI;b.rotation.set(0.45*Math.cos(a*0.7),0,0.5);b.rotation.y=a});
 beams.forEach(b=>b.visible=beamM.opacity>0.005);
 cloudGroup.rotation.y+=dt*0.01;stepCoins(dt);
 tgt.set(0,Math.max(3,towerH*0.58),0);ctl.target.lerp(tgt,Math.min(1,dt*2.5));
 if(!userZoom){const tv=Math.tan(THREE.MathUtils.degToRad(cam.fov/2)),th=tv*cam.aspect,want=Math.min(105,Math.max(16,(towerH*0.72+5)/tv,10/th)),d=cam.position.distanceTo(ctl.target);const nd=d+(want-d)*Math.min(1,dt*2);cam.position.sub(ctl.target).setLength(nd).add(ctl.target)}
 sun.target.position.set(0,towerH*0.3,0);
 ctl.update(dt);R.render(scene,cam)}
let last=performance.now();
function loop(now){const dt=Math.min(0.05,(now-last)/1000);last=now;if(!window.__manual)step(dt);requestAnimationFrame(loop)}
/* hooks for headless capture */
window.__frame=(dt,opts={})=>{window.__manual=true;if(opts.v!=null){acct='demo';value=opts.v;refreshUI()}if(opts.tod!=null){todMode='fix';tod=opts.tod}sl.value=v2s(value);if(opts.az!=null){ctl.autoRotate=false;const d=cam.position.distanceTo(ctl.target),el=0.38;cam.position.set(Math.sin(opts.az)*Math.cos(el)*d,Math.sin(el)*d,Math.cos(opts.az)*Math.cos(el)*d).add(ctl.target)}step(dt)};
(async()=>{if(S&&S.a)await loadPx();refreshUI();shown=Q.has('still')?target:Math.max(2,target-6);paintFacade();
 if(Q.has('still')){phase=tod??0.2;for(let i=0;i<4;i++)step(0.016);}
 ready=true;window.ready=true;requestAnimationFrame(loop)})();

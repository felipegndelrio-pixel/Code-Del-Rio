// NexoProcess — sequência do dia de lançamento (EN): teaser, revelação e mapa de plataformas.
// Feed 1080×1350 (S1, S2, S5) e Stories 1080×1920 (ST1, ST2). Os slides S3 e S4 vêm de ../carrossel.
// Uso: node gera_hoje.cjs [teste]
// Dados: preço US$ 39 pagamento único (apps/nexoprocess/docs/LANCAMENTO_EN.md, ramo wip/en-foundation) · Paddle em desenho
// (ramo wip/paddle) · Hotmart no Brasil. Bandeiras desenhadas em SVG; plataformas só por nome (sem logotipos oficiais).
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { execFileSync } = require('child_process');
const R = '/home/user/Code-Del-Rio', D = `${R}/marketing/lancamento-global/hoje`;
const DOTS = JSON.parse(fs.readFileSync(`${R}/marketing/filme/assets/dados.json`, 'utf8')).dots;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans`;
const ff = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const LOGO = (s) => `<svg viewBox="0 0 64 64" style="width:${s}px;height:${s}px;flex:none"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.4)" stroke-width=".6"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;
let uid = 0;
const FLAG = {
  br: (h) => `<svg viewBox="0 0 20 14" style="height:${h}px;width:${h * 20 / 14}px;border-radius:${h * .12}px;flex:none"><rect width="20" height="14" fill="#009C3B"/><path d="M10 1.6 18.4 7 10 12.4 1.6 7z" fill="#FFDF00"/><circle cx="10" cy="7" r="3.5" fill="#002776"/><path d="M6.7 6.3Q10 5.3 13.4 7.4" stroke="#fff" stroke-width=".7" fill="none"/></svg>`,
  us: (h) => { let st = ''; for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) st += `<circle cx="${(r % 2 ? 1.27 : .63) + c * 1.27}" cy="${.54 + r * .6}" r=".2" fill="#fff"/>`;
    return `<svg viewBox="0 0 19 10" style="height:${h}px;width:${h * 1.9}px;border-radius:${h * .12}px;flex:none"><rect width="19" height="10" fill="#fff"/>${[0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${i * 10 / 13}" width="19" height="${10 / 13}" fill="#B22234"/>`).join('')}<rect width="7.6" height="${70 / 13}" fill="#3C3B6E"/>${st}</svg>`; },
  uk: (h) => { const i = ++uid; return `<svg viewBox="0 0 60 30" style="height:${h}px;width:${h * 2}px;border-radius:${h * .12}px;flex:none"><clipPath id="s${i}"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="t${i}"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#s${i})"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#t${i})" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`; },
};
const TILE = (l, s) => `<span class="tile" style="width:${s}px;height:${s}px;font-size:${s * .56}px;border-radius:${s * .24}px">${l}</span>`;
const LIVE = (s) => `<span class="live" style="font-size:${s}px"><svg viewBox="0 0 12 12" style="width:${s * .85}px"><path d="M2 6.3l2.6 2.6L10 3.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Live</span>`;
const DEV = (s) => `<span class="dev" style="font-size:${s}px"><svg viewBox="0 0 12 12" style="width:${s * .85}px"><circle cx="6" cy="6" r="4.6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M6 3.4V6l1.8 1.2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>In development</span>`;
const css = `${ff(400)}${ff(500)}${ff(600)}${ff(700)}
*{margin:0;box-sizing:border-box}
html,body{overflow:hidden;background:#03060c}
body{position:relative;font-family:Plex,sans-serif;color:#f2f6fc}
#bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,rgba(23,50,99,.55),rgba(3,6,12,0) 60%),linear-gradient(180deg,#071226 0%,#040914 60%,#03060c 100%)}
#grid{position:absolute;inset:0;background-image:linear-gradient(rgba(111,219,230,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(111,219,230,.045) 1px,transparent 1px);background-size:54px 54px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 35%,#000 0%,rgba(0,0,0,.6) 45%,transparent 80%)}
canvas.g{position:absolute;left:0;top:0}
.eye{font-weight:600;letter-spacing:.34em;color:#6fdbe6}
.h{font-weight:700;letter-spacing:-.04em;line-height:1.0;color:#fff}
.sub{font-weight:400;color:#b9c6da;line-height:1.3}
.tile{display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#0a0f18;font-weight:700;flex:none}
.live{display:inline-flex;align-items:center;gap:.35em;color:#4ade80;border:1.5px solid rgba(74,222,128,.55);background:rgba(74,222,128,.10);border-radius:99px;padding:.22em .7em .22em .55em;font-weight:600;white-space:nowrap}
.dev{display:inline-flex;align-items:center;gap:.35em;color:#f5b84a;border:1.5px solid rgba(245,184,74,.55);background:rgba(245,184,74,.10);border-radius:99px;padding:.22em .7em .22em .55em;font-weight:600;white-space:nowrap}
.card{position:absolute;background:rgba(8,14,26,.82);border:1.5px solid rgba(111,219,230,.32);border-radius:22px;box-shadow:0 22px 60px rgba(0,0,0,.6),0 0 40px rgba(64,200,214,.10);backdrop-filter:blur(6px)}
.card.on{border-color:rgba(74,222,128,.55);box-shadow:0 22px 60px rgba(0,0,0,.6),0 0 46px rgba(74,222,128,.16)}
.card.wip{border-color:rgba(245,184,74,.5)}
.row{display:flex;align-items:center}
.brand{display:flex;align-items:center;gap:16px;font-weight:700;letter-spacing:-.02em}
.small{font-weight:600;letter-spacing:.16em;color:#7f93b2}
.pill{background:linear-gradient(90deg,#6fdbe6,#3fd0de);color:#02161b;font-weight:700;letter-spacing:.06em;border-radius:99px;box-shadow:0 0 34px rgba(64,200,214,.4)}
.blurname{filter:blur(9px);opacity:.85}
#grain{position:absolute;inset:0;opacity:.06;mix-blend-mode:overlay;pointer-events:none}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 58%,rgba(0,0,0,.5) 100%);pointer-events:none}`;
const grain = (W, H) => `<canvas id="grain" width="${W / 2}" height="${H / 2}" style="width:${W}px;height:${H}px"></canvas><script>{const c=document.getElementById('grain').getContext('2d'),d=c.createImageData(${W / 2},${H / 2});let s=5;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}</script>`;
// ---------- globo (pontos reais de terra) e arcos; G = {r, lat0, lon0, hub:[x,y]} → Brasil na posição hub
const globe = (W, H, G, arcs) => `<canvas class="g" id="gl"></canvas><script>
(()=>{const W=${W},H=${H},G=${JSON.stringify(G)},DOTS=${JSON.stringify(DOTS)},ARCS=${JSON.stringify(arcs)};
const d2r=Math.PI/180,sl0=Math.sin(G.lat0*d2r),cl0=Math.cos(G.lat0*d2r);
const vec=(la,lo)=>{const f=la*d2r,l=lo*d2r;return [Math.cos(f)*Math.cos(l),Math.cos(f)*Math.sin(l),Math.sin(f)]};
const raw=(v)=>{const la=Math.asin(v[2]/Math.hypot(...v)),lo=Math.atan2(v[1],v[0]),dl=lo-G.lon0*d2r;
  return [Math.cos(la)*Math.sin(dl),cl0*Math.sin(la)-sl0*Math.cos(la)*Math.cos(dl),sl0*Math.sin(la)+cl0*Math.cos(la)*Math.cos(dl)]};
const hb=raw(vec(-23.55,-46.63));G.cx=G.hub[0]-G.r*hb[0];G.cy=G.hub[1]+G.r*hb[1];
const proj=(v,k=1)=>{const p=raw(v);return [G.cx+G.r*k*p[0],G.cy-G.r*k*p[1],p[2]]};
const slerp=(a,b,t)=>{const d=Math.acos(Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])),s=Math.sin(d);if(s<1e-6)return a;const p=Math.sin((1-t)*d)/s,q=Math.sin(t*d)/s;return [a[0]*p+b[0]*q,a[1]*p+b[1]*q,a[2]*p+b[2]*q]};
const c=document.getElementById('gl');c.width=W*2;c.height=H*2;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.scale(2,2);
let a=x.createRadialGradient(G.cx,G.cy,G.r*.97,G.cx,G.cy,G.r*1.22);a.addColorStop(0,'rgba(64,200,214,.40)');a.addColorStop(.15,'rgba(40,150,210,.15)');a.addColorStop(1,'rgba(3,6,12,0)');
x.fillStyle=a;x.beginPath();x.arc(G.cx,G.cy,G.r*1.22,0,7);x.fill();
const b=x.createRadialGradient(G.cx-G.r*.4,G.cy-G.r*.5,G.r*.05,G.cx,G.cy,G.r);b.addColorStop(0,'#0d2448');b.addColorStop(.6,'#061227');b.addColorStop(1,'#02070f');
x.fillStyle=b;x.beginPath();x.arc(G.cx,G.cy,G.r,0,7);x.fill();
x.save();x.beginPath();x.arc(G.cx,G.cy,G.r,0,7);x.clip();
const rim=x.createRadialGradient(G.cx,G.cy,G.r*.86,G.cx,G.cy,G.r);rim.addColorStop(0,'rgba(64,200,214,0)');rim.addColorStop(.7,'rgba(64,200,214,.05)');rim.addColorStop(1,'rgba(150,235,245,.34)');x.fillStyle=rim;x.fillRect(G.cx-G.r,G.cy-G.r,2*G.r,2*G.r);
x.lineWidth=.7;x.strokeStyle='rgba(111,219,230,.08)';
for(let lo=-180;lo<180;lo+=20){x.beginPath();let st=false;for(let la=-88;la<=88;la+=2){const p=proj(vec(la,lo));if(p[2]>0){if(!st){x.moveTo(p[0],p[1]);st=true}else x.lineTo(p[0],p[1])}else st=false}x.stroke()}
for(let la=-60;la<=60;la+=20){x.beginPath();let st=false;for(let lo=-180;lo<=180;lo+=2){const p=proj(vec(la,lo));if(p[2]>0){if(!st){x.moveTo(p[0],p[1]);st=true}else x.lineTo(p[0],p[1])}else st=false}x.stroke()}
const SUB=[[0,0],[.45,.45],[-.45,.45],[.45,-.45],[-.45,-.45]],sc=G.r/500;
for(const [la0,lo0] of DOTS)for(const [dy,dx] of SUB){const la=la0+dy,lo=lo0+dx/Math.max(.25,Math.cos(la0*d2r));const p=proj(vec(la,lo));if(p[2]<=.02)continue;
  x.fillStyle='rgba(120,212,232,'+Math.min(1,.28+.6*Math.pow(p[2],1.2))+')';x.beginPath();x.arc(p[0],p[1],(.8+.55*p[2])*sc,0,7);x.fill()}
x.restore();
const hub=vec(-23.55,-46.63);x.globalCompositeOperation='lighter';
for(const A of ARCS){let pts=[];
  if(A.to){const q=vec(A.to[0],A.to[1]),dist=Math.acos(Math.min(1,hub[0]*q[0]+hub[1]*q[1]+hub[2]*q[2])),hg=.04+.2*dist/Math.PI;for(let j=0;j<=72;j++){const t=j/72;pts.push(proj(slerp(hub,q,t),1+hg*Math.sin(Math.PI*t)))}}
  else{const h=proj(hub),e=A.xy,c1=[h[0]+(e[0]-h[0])*.1,h[1]-(h[1]-e[1])*.75];for(let j=0;j<=72;j++){const t=j/72,u=1-t;pts.push([u*u*h[0]+2*u*t*c1[0]+t*t*e[0],u*u*h[1]+2*u*t*c1[1]+t*t*e[1]])}}
  x.setLineDash(A.dash?[10,9]:[]);
  for(const [lw,al,bl] of [[7,.10,14],[2.8,.95,6]]){x.beginPath();pts.forEach((p,j)=>j?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.strokeStyle=A.col.replace('A',al);x.lineWidth=lw;x.shadowColor=A.col.replace('A',1);x.shadowBlur=bl;x.stroke()}
  x.setLineDash([]);const e=pts[pts.length-1];x.shadowBlur=14;x.fillStyle=A.col.replace('A',1);x.beginPath();x.arc(e[0],e[1],6.5,0,7);x.fill();
  window['END_'+A.id]=[e[0],e[1]];}
// Brasil: anel e losango da marca
const hp=proj(hub);x.shadowBlur=0;const cg=x.createRadialGradient(hp[0],hp[1],0,hp[0],hp[1],60);cg.addColorStop(0,'rgba(255,255,255,.9)');cg.addColorStop(.15,'rgba(160,240,250,.6)');cg.addColorStop(1,'rgba(64,200,214,0)');
x.fillStyle=cg;x.beginPath();x.arc(hp[0],hp[1],60,0,7);x.fill();x.globalCompositeOperation='source-over';
for(const [rr,al] of [[15,.9],[28,.35]]){x.beginPath();x.arc(hp[0],hp[1],rr,0,7);x.strokeStyle='rgba(191,246,251,'+al+')';x.lineWidth=1.6;x.stroke()}
x.save();x.translate(hp[0],hp[1]);x.rotate(Math.PI/4);x.fillStyle='#00A8BC';x.shadowColor='#40C8D6';x.shadowBlur=16;x.fillRect(-7,-7,14,14);x.restore();
window.HUBXY=[hp[0],hp[1]];})();</script>`;
// conector fino de um ponto (fim do arco) até o cartão
const leader = (W, H, pairs) => `<svg style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none">${pairs.map(([a, b, col, dash]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="6 6"' : ''} opacity=".85"/>`).join('')}</svg>`;

// ---------- peças
function teaser(W, H, st) {   // S1 / ST1: "Something just left Brazil."
  const top = st ? 360 : 84, hs = st ? 132 : 124, hub = st ? [640, 1300] : [640, 1000];
  const card = st ? { x: 72, y: 940, w: 600 } : { x: 64, y: 650, w: 560 };
  return `<div id="bg"></div><div id="grid"></div>
${globe(W, H, { r: st ? 980 : 900, lat0: -62, lon0: -46, hub }, [{ id: 'm', xy: [card.x + card.w * .7, card.y + 168], col: 'rgba(74,222,128,A)' }])}
<div class="vig"></div>
<div class="brand" style="position:absolute;left:72px;top:${st ? 270 : 72}px;font-size:38px">${LOGO(50)}<span>NexoProcess</span></div>
<div class="eye" style="position:absolute;left:72px;top:${top + 106}px;font-size:24px">CHAPTER 2</div>
<div class="h" style="position:absolute;left:72px;top:${top + 150}px;font-size:${hs}px">Something just<br>left Brazil.</div>
<div class="sub" style="position:absolute;left:72px;top:${top + 150 + hs * 2.16}px;font-size:36px">Our first international platform is live.</div>
<div class="card on" style="left:${card.x}px;top:${card.y}px;width:${card.w}px;padding:28px 32px">
  <div class="small" style="font-size:19px;color:#c3cfe0;letter-spacing:.18em">FIRST INTERNATIONAL PLATFORM</div>
  <div class="row" style="gap:16px;margin-top:22px">${TILE('?', 58)}<span class="blurname" style="font-size:40px;font-weight:700">Gumroad</span><span style="margin-left:auto">${LIVE(24)}</span></div></div>
${st ? '' : `<div style="position:absolute;right:72px;bottom:62px" class="small"><span style="font-size:19px;color:#6fdbe6">SWIPE TO REVEAL →</span></div>`}
${grain(W, H)}`;
}
function reveal(W, H, st, price) {   // S2 / ST2: "NexoProcess on Gumroad."
  const y0 = st ? 590 : 236, k = st ? 1.14 : 1;
  return `<div id="bg" style="background:radial-gradient(ellipse at 50% 38%,rgba(0,168,188,.22),rgba(3,6,12,0) 55%),radial-gradient(ellipse at 50% 30%,rgba(23,50,99,.6),rgba(3,6,12,0) 65%),linear-gradient(180deg,#071226 0%,#040914 60%,#03060c 100%)"></div><div id="grid"></div><div class="vig"></div>
<div style="position:absolute;left:0;right:0;top:${y0}px;display:flex;flex-direction:column;align-items:center;text-align:center">
  <div style="filter:drop-shadow(0 0 40px rgba(64,200,214,.45))">${LOGO(132 * k)}</div>
  <div class="eye" style="font-size:${26 * k}px;margin-top:46px">NOW LIVE</div>
  <div class="h" style="font-size:${122 * k}px;margin-top:22px">NexoProcess<br>on Gumroad.</div>
  <div class="row" style="gap:16px;margin-top:46px;padding:14px 20px 14px 14px;border:1.5px solid rgba(255,255,255,.16);border-radius:99px;background:rgba(255,255,255,.04)">
    ${TILE('G', 46 * k)}${FLAG.us(28 * k)}<span style="font-size:${32 * k}px;color:#b9c6da">Available on <b style="color:#fff">Gumroad</b></span>${LIVE(24 * k)}</div>
  <div style="margin-top:30px;padding:22px 46px;border-radius:22px;background:linear-gradient(90deg,#6fdbe6,#3fd0de);color:#02161b;font-weight:700;font-size:${44 * k}px;box-shadow:0 0 50px rgba(64,200,214,.35)">${price}</div>
  <div class="row" style="gap:28px;margin-top:34px;font-size:${28 * k}px;color:#dbe4f1;font-weight:600">
    <span class="row" style="gap:12px">${FLAG.us(24 * k)}English edition</span><span style="color:#3a4a63">|</span><span class="row" style="gap:12px">${FLAG.br(24 * k)}Made in Brazil</span></div>
</div>
${st ? '' : `<div class="small" style="position:absolute;left:0;right:0;bottom:62px;text-align:center;font-size:18px">THE ENGLISH EDITION OF NEXOPROCESS</div>`}
${grain(W, H)}`;
}
function plataformas(W, H, sub) {   // S5: "From Brazil to the world." + CTA
  const G = { r: 350, lat0: 18, lon0: -42, hub: [520, 944] };
  return `<div id="bg"></div><div id="grid"></div>
${globe(W, H, G, [{ id: 'us', to: [39.5, -98.4], col: 'rgba(74,222,128,A)' }, { id: 'uk', to: [51.5, -0.1], col: 'rgba(245,184,74,A)', dash: 1 }])}
<div class="vig"></div>
<div class="eye" style="position:absolute;left:72px;top:84px;font-size:22px">WHERE TO GET IT</div>
<div class="h" style="position:absolute;left:72px;top:124px;font-size:96px">From Brazil<br>to the world.</div>
<div class="card on" id="c_us" style="left:56px;top:400px;padding:20px 24px"><div class="row" style="gap:14px">${TILE('G', 46)}${FLAG.us(26)}<b style="font-size:32px">Gumroad</b></div>
  <div class="row" style="gap:12px;margin-top:14px">${LIVE(21)}<span style="font-size:21px;color:#b9c6da">English edition</span></div></div>
<div class="card wip" id="c_uk" style="right:48px;top:400px;padding:20px 24px"><div class="row" style="gap:14px">${TILE('P', 46)}${FLAG.uk(26)}<b style="font-size:32px">Paddle</b></div>
  <div class="row" style="gap:12px;margin-top:14px">${DEV(21)}</div></div>
<div class="card on" id="c_br" style="left:604px;top:1036px;padding:20px 24px"><div class="row" style="gap:14px">${TILE('H', 46)}${FLAG.br(26)}<b style="font-size:32px">Hotmart</b></div>
  <div class="row" style="gap:12px;margin-top:14px">${LIVE(21)}<span style="font-size:21px;color:#b9c6da">Portuguese edition</span></div></div>
<svg id="ld" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none"></svg>
<script>{const L=document.getElementById('ld'),r=(id)=>document.getElementById(id).getBoundingClientRect();
const seg=(a,b,col,dash)=>L.insertAdjacentHTML('beforeend','<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+col+'" stroke-width="2" '+(dash?'stroke-dasharray="6 6"':'')+' opacity=".8"/>');
const u=r('c_us'),k=r('c_uk'),b=r('c_br');seg(window.END_us,[u.left+u.width*.55,u.bottom],'#4ade80');seg(window.END_uk,[k.left+k.width*.45,k.bottom],'#f5b84a',1);seg(window.HUBXY,[b.left+24,b.top],'#4ade80');}</script>
<div style="position:absolute;left:72px;right:72px;bottom:62px;display:flex;align-items:flex-end;justify-content:space-between">
  <div class="brand" style="font-size:36px">${LOGO(48)}<span>NexoProcess</span></div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px"><div class="pill" style="font-size:22px;padding:16px 30px">GET IT ON GUMROAD</div><div class="small" style="font-size:17px">${sub}</div></div></div>
${grain(W, H)}`;
}
const PRICE = 'US$ 39 · one-time payment';
const JOBS = [
  ['S1_teaser', 1080, 1350, () => teaser(1080, 1350, false)],
  ['S2_reveal', 1080, 1350, () => reveal(1080, 1350, false, PRICE)],
  ['S5_plataformas_instagram', 1080, 1350, () => plataformas(1080, 1350, 'LINK IN BIO')],
  ['S5_plataformas_linkedin', 1080, 1350, () => plataformas(1080, 1350, 'LINK IN THE FIRST COMMENT')],
  ['ST1_teaser_story', 1080, 1920, () => teaser(1080, 1920, true)],
  ['ST2_reveal_story', 1080, 1920, () => reveal(1080, 1920, true, PRICE)],
];
(async () => {
  const teste = process.argv[2] === 'teste', OUT = `${D}/${teste ? 'work' : 'exports'}`;
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(`${D}/work`, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  for (const [nome, W, H, fn] of JOBS) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => { console.error('ERRO', nome, e.message); process.exitCode = 2; });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}html,body{width:${W}px;height:${H}px}</style></head><body>${fn()}</body></html>`;
    const hf = `${D}/work/${nome}.html`; fs.writeFileSync(hf, html); await p.goto('file://' + hf);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
    const png = `${OUT}/NexoProcess_${nome}@2x.png`; await p.screenshot({ path: png });
    execFileSync('python3', ['-I', '-c', `from PIL import Image;Image.open('${png}').convert('RGB').resize((${W},${H}),Image.LANCZOS).save('${png.replace('@2x.png', '.jpg')}',quality=92,optimize=True,progressive=True)`]);
    await p.close();
  }
  await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });

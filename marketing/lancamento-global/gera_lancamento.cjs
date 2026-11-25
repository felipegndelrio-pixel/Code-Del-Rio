// NexoProcess — "IT’S TODAY. NEXOPROCESS GOES GLOBAL." Peças de lançamento internacional (versão em inglês, Gumroad).
// Uso: node gera_lancamento.cjs            → todas as peças, camadas, versões sem texto e prévia
//      node gera_lancamento.cjs feed teste  → só um teste rápido em work/
// Tudo é desenhado por código: globo com pontos reais de terra (marketing/filme/assets/dados.json),
// tela REAL do app em inglês (marketing/video/assets/telas-en/en_mapa_4k.png), logotipo oficial em SVG.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const R = '/home/user/Code-Del-Rio', OUT = `${R}/marketing/lancamento-global`;
const DOTS = JSON.parse(fs.readFileSync(`${R}/marketing/filme/assets/dados.json`, 'utf8')).dots;
const SHOT = `file://${R}/marketing/video/assets/telas-en/en_mapa_4k.png`;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans`;
const ff = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
// recorte da captura real (3840×2160): cabeçalho com "Order processing (fictional sample)" + mapa
const CROP = { x: 1060, y: 150, w: 2250, h: 1850, iw: 3840, ih: 2160, end: [3203, 1496] };   // end = evento "Order dispatched"
const crop = () => `background-image:url('${SHOT}');background-size:${(100 * CROP.iw / CROP.w).toFixed(3)}% auto;background-position:${(100 * CROP.x / (CROP.iw - CROP.w)).toFixed(3)}% ${(100 * CROP.y / (CROP.ih - CROP.h)).toFixed(3)}%`;
const LOGO = (s) => `<svg viewBox="0 0 64 64" style="width:${s}px;height:${s}px;flex:none"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.4)" stroke-width=".6"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;

// ---------- formatos: posições de cada elemento (px no tamanho final)
const F = {
  // dev = mockup (x, y, largura) · hub = onde o Brasil deve aparecer na peça (o centro do globo é calculado a partir dele)
  feed: { W: 1080, H: 1350, U: 1,
    globe: { r: 470, lat0: -12, lon0: -48, hub: [930, 506] },
    dev: { x: 46, y: 556, w: 988 },
    t: { eye: [72, 84, 22], h1: [72, 116, 160], h2: [72, 296, 43], sup: [72, 362, 26, 600], cta: [72, 1214, 22], plat: [1008, 1236, 16, 'right'], logo: [1008, 72, 46, 'right'] },
    scrim: 'radial-gradient(ellipse 82% 38% at 32% 17%,rgba(3,6,12,.9) 0%,rgba(3,6,12,.62) 58%,rgba(3,6,12,0) 100%),linear-gradient(180deg,rgba(3,6,12,.6) 0%,rgba(3,6,12,0) 22%),linear-gradient(180deg,rgba(3,6,12,0) 85%,rgba(3,6,12,.92) 100%)' },
  story: { W: 1080, H: 1920, U: 1,
    globe: { r: 540, lat0: -12, lon0: -48, hub: [920, 858] },
    dev: { x: 34, y: 900, w: 1012 },
    t: { logo: [72, 262, 50], eye: [72, 372, 24], h1: [72, 410, 172], h2: [72, 600, 47], sup: [72, 672, 28, 640], plat: [72, 1566, 18], cta: [72, 1602, 25] },
    scrim: 'radial-gradient(ellipse 84% 27% at 34% 27%,rgba(3,6,12,.9) 0%,rgba(3,6,12,.62) 58%,rgba(3,6,12,0) 100%),linear-gradient(180deg,rgba(3,6,12,.85) 0%,rgba(3,6,12,0) 18%),linear-gradient(180deg,rgba(3,6,12,0) 80%,rgba(3,6,12,.95) 100%)' },
  linkedin: { W: 1200, H: 627, U: 0.56,
    globe: { r: 300, lat0: -12, lon0: -48, hub: [1012, 150] },
    dev: { x: 606, y: 232, w: 574 },
    t: { eye: [60, 58, 16], h1: [60, 84, 112], h2: [60, 214, 30], sup: [60, 278, 21, 500], cta: [60, 378, 16], plat: [60, 452, 13], logo: [60, 530, 36] },
    scrim: 'linear-gradient(90deg,rgba(3,6,12,.96) 0%,rgba(3,6,12,.85) 36%,rgba(3,6,12,.2) 50%,rgba(3,6,12,0) 58%)' },
};
// centro do globo a partir do ponto desejado para o Brasil
for (const k in F) { const g = F[k].globe, d = Math.PI / 180, f = -23.55 * d, dl = (-46.63 - g.lon0) * d, l0 = g.lat0 * d;
  const x = Math.cos(f) * Math.sin(dl), y = Math.cos(l0) * Math.sin(f) - Math.sin(l0) * Math.cos(f) * Math.cos(dl);
  g.cx = g.hub[0] - g.r * x; g.cy = g.hub[1] + g.r * y; }
const MOCK = { f: `file://${R}/marketing/lancamento-global/mockup/mockup_en.png`, w: 2110, h: 1339 };
// destinos dos arcos (visual, sem rótulos): América do Norte, Europa, África, Oceania não aparece no hemisfério visível
const HUB = [-23.55, -46.63];   // origem: Brasil, onde o produto nasceu
const ENDS = [[40.7, -74.0, 'c'], [43.7, -79.4, 's'], [19.4, -99.1, 'd'], [51.5, -0.1, 's'], [38.7, -9.1, 'c'], [52.5, 13.4, 'd'], [48.9, 2.35, 'c'], [6.5, 3.4, 's'], [-33.9, 18.4, 'd'], [4.7, -74.1, 'c'], [-34.6, -58.4, 's']];

function page(fmt, layer) {
  const c = F[fmt], { W, H } = c, t = c.t, k = c.U;
  const showBg = layer === 'all' || layer === 'semtexto' || layer === 'fundo';
  const showPanel = layer === 'all' || layer === 'semtexto' || layer === 'produto';
  const dv = c.dev, dh = dv.w * MOCK.h / MOCK.w;
  const showText = layer === 'all' || layer === 'textos';
  const al = (a) => (a === 'right' ? 'right' : 'left');
  const pos = (v) => (v[3] === 'right' ? `right:${W - v[0]}px;` : `left:${v[0]}px;`) + `top:${v[1]}px;`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${ff(400)}${ff(600)}${ff(700)}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${layer === 'produto' || layer === 'textos' ? 'transparent' : '#03060c'}}
body{position:relative;font-family:Plex,sans-serif;color:#f2f6fc}
#bg{position:absolute;inset:0;background:radial-gradient(ellipse at ${c.globe.cx / W * 100}% ${c.globe.cy / H * 100}%,rgba(14,52,110,.32) 0%,rgba(8,22,48,.2) 38%,rgba(3,6,12,0) 70%),radial-gradient(circle at 10% 0%,rgba(23,50,99,.45),rgba(3,6,12,0) 45%),#03060c}
canvas{position:absolute;left:0;top:0}
#scrim{position:absolute;inset:0;background:${c.scrim}}
#stage{position:absolute;inset:0;perspective:${1500 * k}px}
#floor{position:absolute;left:${dv.x + dv.w * 0.08}px;top:${dv.y + dh * 0.86}px;width:${dv.w * 0.84}px;height:${dh * 0.2}px;border-radius:50%;background:radial-gradient(ellipse at 50% 50%,rgba(64,200,214,.28) 0%,rgba(23,70,140,.12) 45%,rgba(3,6,12,0) 72%);filter:blur(${10 * k}px)}
#dev{position:absolute;left:${dv.x}px;top:${dv.y}px;width:${dv.w}px;height:${dh.toFixed(1)}px;filter:drop-shadow(0 ${26 * k}px ${40 * k}px rgba(0,0,0,.75)) drop-shadow(0 0 ${30 * k}px rgba(64,200,214,.18))}
#dev img{width:100%;height:100%;display:block}
.tx{position:absolute;white-space:nowrap}
#eye{${pos(t.eye)}font-weight:600;font-size:${t.eye[2]}px;letter-spacing:.34em;color:#6fdbe6}
#h1{${pos(t.h1)}font-weight:700;font-size:${t.h1[2]}px;letter-spacing:-.045em;line-height:.92;color:#fff;text-shadow:0 0 ${60 * k}px rgba(111,219,230,.25)}
#h2{${pos(t.h2)}font-weight:700;font-size:${t.h2[2]}px;letter-spacing:.06em;background:linear-gradient(90deg,#ffffff 0%,#bff6fb 45%,#40C8D6 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
#sup{${pos(t.sup)}width:${t.sup[3]}px;white-space:normal;font-weight:400;font-size:${t.sup[2]}px;line-height:1.32;color:#c9d6e8}
#cta{${pos(t.cta)}font-weight:700;font-size:${t.cta[2]}px;letter-spacing:.1em;color:#02161b;background:linear-gradient(90deg,#6fdbe6,#3fd0de);border-radius:99px;padding:${0.78 * t.cta[2]}px ${1.5 * t.cta[2]}px;box-shadow:0 0 ${40 * k}px rgba(64,200,214,.4)}
#plat{${pos(t.plat)}font-weight:600;font-size:${t.plat[2]}px;letter-spacing:.26em;color:#9fb2cc;text-align:${al(t.plat[3])}}
#plat b{color:#fff;font-weight:700}
#logo{${pos(t.logo)}display:flex;align-items:center;gap:${0.36 * t.logo[2]}px;font-weight:700;font-size:${0.8 * t.logo[2]}px;letter-spacing:-.02em;color:#fff}
</style></head><body>
${showBg ? '<div id="bg"></div><canvas id="g"></canvas>' : ''}
${showPanel ? `<div id="floor"></div><div id="dev"><img src="${MOCK.f}"></div>` : ''}
${showBg ? '<div id="scrim"></div>' : ''}
${showText ? `<div class="tx" id="eye">A NEW CHAPTER BEGINS</div>
<div class="tx" id="h1">IT’S TODAY.</div>
<div class="tx" id="h2">NEXOPROCESS GOES GLOBAL.</div>
<div class="tx" id="sup">A clearer way to map, understand and improve business processes.</div>
<div class="tx" id="cta">DISCOVER THE ENGLISH EDITION</div>
<div class="tx" id="plat">NOW LAUNCHING ON <b>GUMROAD</b></div>
<div class="tx" id="logo">${LOGO(t.logo[2])}<span>NexoProcess</span></div>` : ''}
<script>
const W=${W},H=${H},K=${k},G=${JSON.stringify(c.globe)},DOTS=${JSON.stringify(DOTS)},HUB=${JSON.stringify(HUB)},ENDS=${JSON.stringify(ENDS)},SHOWBG=${showBg},SHOWP=${showPanel};
const d2r=Math.PI/180, sl0=Math.sin(G.lat0*d2r), cl0=Math.cos(G.lat0*d2r);
function vec(lat,lon){const f=lat*d2r,l=lon*d2r;return [Math.cos(f)*Math.cos(l),Math.cos(f)*Math.sin(l),Math.sin(f)]}
function proj(v,r=1){ // vetor da Terra → tela (ortográfica, centro lat0/lon0)
  const lat=Math.asin(v[2]/Math.hypot(...v)), lon=Math.atan2(v[1],v[0]), dl=lon-G.lon0*d2r;
  const x=Math.cos(lat)*Math.sin(dl), y=cl0*Math.sin(lat)-sl0*Math.cos(lat)*Math.cos(dl), z=sl0*Math.sin(lat)+cl0*Math.cos(lat)*Math.cos(dl);
  return [G.cx+G.r*r*x, G.cy-G.r*r*y, z, r]}
function slerp(a,b,t){const d=Math.acos(Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])),s=Math.sin(d);if(s<1e-6)return a;const p=Math.sin((1-t)*d)/s,q=Math.sin(t*d)/s;return [a[0]*p+b[0]*q,a[1]*p+b[1]*q,a[2]*p+b[2]*q]}
function setup(id){const c=document.getElementById(id);c.width=W*2;c.height=H*2;c.style.width=W+'px';c.style.height=H+'px';const x=c.getContext('2d');x.scale(2,2);return x}
function ring(x,back){ // órbita fina inclinada; metade de trás antes do globo
  x.save();x.translate(G.cx,G.cy);x.rotate(-18*d2r);x.beginPath();
  if(back)x.ellipse(0,0,G.r*1.22,G.r*.3,0,Math.PI,2*Math.PI);else x.ellipse(0,0,G.r*1.22,G.r*.3,0,0,Math.PI);
  x.strokeStyle='rgba(111,219,230,'+(back?.12:.3)+')';x.lineWidth=1.2*K;x.stroke();
  if(!back){const a=.62*Math.PI;x.beginPath();x.arc(G.r*1.22*Math.cos(a),G.r*.3*Math.sin(a),3.2*K,0,7);x.fillStyle='#bff6fb';x.shadowColor='#40C8D6';x.shadowBlur=14*K;x.fill()}
  x.restore()}
if(SHOWBG){
  const x=setup('g');
  // poeira mínima
  let s=11;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};
  for(let i=0;i<46;i++){x.fillStyle='rgba(190,230,255,'+(.08+.18*rnd())+')';x.beginPath();x.arc(rnd()*W,rnd()*H,(.5+rnd()*1.1)*K,0,7);x.fill()}
  ring(x,true);
  // atmosfera
  let a=x.createRadialGradient(G.cx,G.cy,G.r*.96,G.cx,G.cy,G.r*1.28);a.addColorStop(0,'rgba(64,200,214,.42)');a.addColorStop(.12,'rgba(40,150,210,.18)');a.addColorStop(.45,'rgba(23,70,140,.06)');a.addColorStop(1,'rgba(3,6,12,0)');
  x.fillStyle=a;x.beginPath();x.arc(G.cx,G.cy,G.r*1.28,0,7);x.fill();
  // corpo do globo
  const b=x.createRadialGradient(G.cx-G.r*.42,G.cy-G.r*.5,G.r*.05,G.cx,G.cy,G.r);b.addColorStop(0,'#0a1d3b');b.addColorStop(.55,'#050f20');b.addColorStop(1,'#02060d');
  x.fillStyle=b;x.beginPath();x.arc(G.cx,G.cy,G.r,0,7);x.fill();
  // borda iluminada
  x.save();x.beginPath();x.arc(G.cx,G.cy,G.r,0,7);x.clip();
  const rim=x.createRadialGradient(G.cx,G.cy,G.r*.86,G.cx,G.cy,G.r);rim.addColorStop(0,'rgba(64,200,214,0)');rim.addColorStop(.7,'rgba(64,200,214,.05)');rim.addColorStop(1,'rgba(150,235,245,.32)');
  x.fillStyle=rim;x.fillRect(G.cx-G.r,G.cy-G.r,2*G.r,2*G.r);
  // grade geométrica discreta (meridianos e paralelos)
  x.lineWidth=.6*K;x.strokeStyle='rgba(111,219,230,.07)';
  for(let lon=-180;lon<180;lon+=20){x.beginPath();let st=false;for(let lat=-88;lat<=88;lat+=2){const p=proj(vec(lat,lon));if(p[2]>0){if(!st){x.moveTo(p[0],p[1]);st=true}else x.lineTo(p[0],p[1])}else st=false}x.stroke()}
  for(let lat=-60;lat<=60;lat+=20){x.beginPath();let st=false;for(let lon=-180;lon<=180;lon+=2){const p=proj(vec(lat,lon));if(p[2]>0){if(!st){x.moveTo(p[0],p[1]);st=true}else x.lineTo(p[0],p[1])}else st=false}x.stroke()}
  // pontos de terra
  const hub=vec(HUB[0],HUB[1]);
  const SUB=[[0,0],[.45,.45],[-.45,.45],[.45,-.45],[-.45,-.45]];
  for(const [lat0,lon0] of DOTS)for(const [dy,dx] of SUB){const lat=lat0+dy,lon=lon0+dx/Math.max(.25,Math.cos(lat0*d2r));const v=vec(lat,lon),p=proj(v);if(p[2]<=0.02)continue;
    const near=Math.max(0,1-Math.acos(Math.min(1,v[0]*hub[0]+v[1]*hub[1]+v[2]*hub[2]))/0.9);
    const al=(.34+.62*Math.pow(p[2],1.15))*(1+.6*near);const r=(.8+.55*p[2])*K*G.r/500;
    x.fillStyle='rgba('+Math.round(110+130*near)+','+Math.round(205+45*near)+','+Math.round(228+27*near)+','+Math.min(1,al)+')';x.beginPath();x.arc(p[0],p[1],r,0,7);x.fill()}
  x.restore();
  // arcos: do Brasil para o mundo, levantados acima da superfície
  x.globalCompositeOperation='lighter';
  ENDS.forEach((e,i)=>{const q=vec(e[0],e[1]);const dist=Math.acos(Math.min(1,hub[0]*q[0]+hub[1]*q[1]+hub[2]*q[2]));const hgt=.05+.24*dist/Math.PI;
    const pts=[];for(let j=0;j<=64;j++){const tt=j/64;pts.push(proj(slerp(hub,q,tt),1+hgt*Math.sin(Math.PI*tt)))}
    const gr=x.createLinearGradient(pts[0][0],pts[0][1],pts[64][0],pts[64][1]);gr.addColorStop(0,'rgba(220,252,255,.95)');gr.addColorStop(.5,'rgba(111,219,230,.75)');gr.addColorStop(1,'rgba(64,200,214,.35)');
    for(const [lw,al,bl] of [[4.5,.05,9],[1.9,.92,5]]){x.beginPath();pts.forEach((p,j)=>j?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.strokeStyle=al<.5?'rgba(64,200,214,'+al+')':gr;x.lineWidth=lw*K;x.shadowColor='rgba(64,200,214,.9)';x.shadowBlur=bl*K;x.stroke()}
    // cometa ao longo do arco
    const cp=pts[Math.round(64*(.38+.37*((i*7)%5)/4))];x.shadowBlur=16*K;x.fillStyle='#ffffff';x.beginPath();x.arc(cp[0],cp[1],2.6*K,0,7);x.fill();
    // destino: forma de processo (círculo, etapa, decisão)
    const p=pts[64],z=7.5*K;x.shadowBlur=12*K;x.shadowColor='rgba(64,200,214,.9)';x.lineWidth=2*K;x.strokeStyle='#bff6fb';x.fillStyle='rgba(3,6,12,.85)';
    x.beginPath();if(e[2]==='c')x.arc(p[0],p[1],z*.8,0,7);else if(e[2]==='s'){const r=z*.95;x.roundRect(p[0]-r,p[1]-r*.72,2*r,1.44*r,3*K)}else{x.moveTo(p[0],p[1]-z);x.lineTo(p[0]+z,p[1]);x.lineTo(p[0],p[1]+z);x.lineTo(p[0]-z,p[1]);x.closePath()}
    x.fill();x.stroke()});
  // núcleo
  const hp=proj(hub,1.0);x.shadowBlur=0;
  const cg=x.createRadialGradient(hp[0],hp[1],0,hp[0],hp[1],54*K);cg.addColorStop(0,'rgba(255,255,255,.95)');cg.addColorStop(.12,'rgba(160,240,250,.7)');cg.addColorStop(.4,'rgba(64,200,214,.18)');cg.addColorStop(1,'rgba(64,200,214,0)');
  x.fillStyle=cg;x.beginPath();x.arc(hp[0],hp[1],54*K,0,7);x.fill();
  x.globalCompositeOperation='source-over';
  for(const [rr,al] of [[14,.9],[26,.35],[40,.15]]){x.beginPath();x.arc(hp[0],hp[1],rr*K,0,7);x.strokeStyle='rgba(191,246,251,'+al+')';x.lineWidth=1.4*K;x.stroke()}
  // losango da marca no núcleo
  x.save();x.translate(hp[0],hp[1]);x.rotate(Math.PI/4);x.fillStyle='#00A8BC';x.shadowColor='#40C8D6';x.shadowBlur=18*K;x.fillRect(-6*K,-6*K,12*K,12*K);x.restore();
  x.globalCompositeOperation='lighter';const fl=x.createLinearGradient(hp[0]-260*K,0,hp[0]+260*K,0);fl.addColorStop(0,'rgba(64,200,214,0)');fl.addColorStop(.5,'rgba(200,250,255,.55)');fl.addColorStop(1,'rgba(64,200,214,0)');
  x.fillStyle=fl;x.fillRect(hp[0]-260*K,hp[1]-1.2*K,520*K,2.4*K);x.globalCompositeOperation='source-over';
  ring(x,false);
  window.HUBXY=[hp[0],hp[1]];
  { const DV=${JSON.stringify(dv)},DH=${dh.toFixed(1)};const s0=[DV.x+DV.w*0.5,DV.y+DH*0.12];
    x.globalCompositeOperation='lighter';
    const bl=x.createRadialGradient(s0[0],s0[1],0,s0[0],s0[1],DV.w*0.42);bl.addColorStop(0,'rgba(64,200,214,.30)');bl.addColorStop(.5,'rgba(23,90,170,.12)');bl.addColorStop(1,'rgba(3,6,12,0)');
    x.fillStyle=bl;x.beginPath();x.arc(s0[0],s0[1],DV.w*0.42,0,7);x.fill();
    const c1=[s0[0]+(hp[0]-s0[0])*.1,s0[1]-(s0[1]-hp[1])*.75],c2=[hp[0]-(hp[0]-s0[0])*.35,hp[1]+40*K];
    for(const [lw,al,bb] of [[9,.10,18],[3,.95,7]]){x.beginPath();x.moveTo(s0[0],s0[1]);x.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],hp[0],hp[1]);x.strokeStyle='rgba(170,245,252,'+al+')';x.lineWidth=lw*K;x.shadowColor='#40C8D6';x.shadowBlur=bb*K;x.stroke()}
    x.globalCompositeOperation='source-over';x.shadowBlur=0 }
}
// conexão: a linha do fluxo sai do evento final do mapa real e chega ao núcleo do globo
document.body.dataset.ok=1;
</script></body></html>`;
}
(async () => {
  const only = process.argv[2], teste = process.argv[3] === 'teste';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const fmts = only ? [only] : ['feed', 'story', 'linkedin'];
  const NOME = { feed: 'Instagram_Feed_1080x1350', story: 'Instagram_Stories_1080x1920', linkedin: 'LinkedIn_1200x627' };
  for (const fmt of fmts) {
    const { W, H } = F[fmt];
    const layers = teste ? ['all'] : ['all', 'semtexto', 'fundo', 'produto', 'textos'];
    for (const layer of layers) {
      const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
      p.on('pageerror', (e) => { console.error('ERRO:', e.message); process.exitCode = 2; });
      const html = page(fmt, layer), hf = `${teste ? OUT + '/work' : OUT + '/editaveis'}/${NOME[fmt]}${layer === 'all' ? '' : '_' + layer}.html`;
      fs.writeFileSync(hf, html); await p.goto('file://' + hf);
      await p.evaluate(() => document.fonts.ready); await p.waitForSelector('body[data-ok]'); await p.waitForTimeout(400);
      const transparent = layer === 'produto' || layer === 'textos';
      if (teste) { await p.screenshot({ path: `${OUT}/work/teste_${fmt}.png` }); await p.close(); continue; }
      const dir = layer === 'all' ? `${OUT}/exports` : layer === 'semtexto' ? `${OUT}/exports/sem_texto` : `${OUT}/editaveis/camadas`;
      fs.mkdirSync(dir, { recursive: true });
      const png = `${dir}/NexoProcess_GoesGlobal_${NOME[fmt]}${layer === 'all' ? '' : '_' + layer}@2x.png`;
      await p.screenshot({ path: png, omitBackground: transparent });
      if (layer === 'all' || layer === 'semtexto') {   // JPG no tamanho exato de publicação
        const jpg = png.replace('@2x.png', '.jpg');
        execFileSync('python3', ['-I', '-c', `from PIL import Image;im=Image.open('${png}').convert('RGB').resize((${W},${H}),Image.LANCZOS);im.save('${jpg}',quality=92,optimize=True,progressive=True)`]);
      }
      await p.close();
    }
  }
  await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });

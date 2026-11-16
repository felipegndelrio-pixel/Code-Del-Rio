// NexoProcess — filme "Do caos à clareza" (33,6 s). Renderização quadro a quadro: HTML determinístico → FFmpeg.
// Uso: node clareza.cjs <9x16|16x9|4x5> [t1,t2,...]   (com tempos: só gera quadros de teste em work/)
// Tudo que aparece do produto é captura real do app (demonstração fictícia do próprio NexoProcess).
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/filme-clareza`, A = `${R}/marketing/video/assets`;
const FMT = { '16x9': [1920, 1080], '9x16': [1080, 1920], '4x5': [1080, 1350] };
const fmt = process.argv[2]; const [W, H] = FMT[fmt]; const T = 33.6, FPS = 30;
const P = W < H, V = fmt === '9x16';
const u = Math.min(W, H) / 100;
const FD = `${R}/node_modules/@fontsource`;
const ff = (fam, dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:${fam};font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const Wd = (h) => { let em = false; return h.replace(/<em>|<\/em>|<br>|[^\s<]+/g, (m) => { if (m === '<em>') { em = true; return ''; } if (m === '</em>') { em = false; return ''; } if (m === '<br>') return m; return `<span class="w">${em ? '<em>' + m + '</em>' : m}</span>`; }); };
const HS = V ? 9.2 : P ? 8.6 : 7.4;
const PAD = V ? '14% 6% 21%' : P ? '6% 6%' : '6% 7%';
const img = (n) => `file://${A}/${n}`;
const MAPA = img('telas-4k/03b-mapa-macro-recorte.png'), DIAG = img('telas-4k/05-diagnostico-4k.png'), PLAN = img('telas-4k/08-plano-4k.png');
const crop = (src) => `background:url('${src}') no-repeat;background-size:135% auto;background-position:92% 100%`;
// fragmentos: recortes de telas reais [arquivo, x0, y0, largura, altura] em fração da imagem
const FR = [['05-diagnostico-4k', .245, .53, .36, .2], ['08-plano-4k', .245, .8, .74, .14], ['07-comparar-4k', .245, .8, .74, .16], ['06-recomendacoes-4k', .245, .71, .74, .2],
  ['05-diagnostico-4k', .6, .53, .38, .2], ['03b-mapa-macro-recorte', .08, .22, .5, .56], ['09-relatorio-4k', .15, .6, .7, .2], ['05-diagnostico-4k', .245, .76, .36, .2], ['08-plano-4k', .245, .7, .5, .12]];
const AR = { '03b-mapa-macro-recorte': 2850 / 1470 };
const fragHtml = FR.map(([f, x, y, w, h], i) => { const ar = (AR[f] || 16 / 9) * w / h, tw = (P ? 44 : 40) * (0.8 + 0.25 * ((i * 7) % 5) / 4), th = tw / ar;
  return `<div class="fr" id="fr${i}" style="width:${tw.toFixed(2)}vmin;height:${th.toFixed(2)}vmin;margin:${(-th / 2).toFixed(2)}vmin 0 0 ${(-tw / 2).toFixed(2)}vmin;background:url('${img('telas-4k/' + f + '.png')}') no-repeat;background-size:${(100 / w).toFixed(2)}% auto;background-position:${(100 * x / (1 - w)).toFixed(2)}% ${(100 * y / (1 - h)).toFixed(2)}%"></div>`; }).join('');
const html = `<html><head><meta charset="utf-8"><style>
${ff('Plex', 'ibm-plex-sans', 400)}${ff('Plex', 'ibm-plex-sans', 600)}${ff('Plex', 'ibm-plex-sans', 700)}${ff('Mono', 'ibm-plex-mono', 500)}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#03060c;overflow:hidden}
body{--u:${u}px;font-family:Plex,sans-serif;color:#eef3fb;position:relative}
#amb,#net,#vig,#fade,#flash{position:absolute;inset:0}
#frag{position:absolute;inset:0;perspective:${u * 130}px}
.fr{position:absolute;left:50%;top:50%;border-radius:calc(var(--u)*1.6);border:1px solid rgba(111,219,230,.35);box-shadow:0 calc(var(--u)*2) calc(var(--u)*6) rgba(0,0,0,.6);opacity:0;background-color:#11151c}
.sc{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${PAD}}
.halo{position:absolute;left:-10%;right:-10%;top:50%;height:calc(var(--u)*${HS}*5.2);transform:translateY(-50%);background:radial-gradient(ellipse at 50% 50%,rgba(3,6,12,.86) 0%,rgba(3,6,12,.6) 45%,rgba(3,6,12,0) 72%)}
.h{font-weight:700;font-size:calc(var(--u)*${HS});line-height:1.08;letter-spacing:-.03em;position:relative;text-wrap:balance;max-width:${P ? '100%' : '74%'};text-shadow:0 calc(var(--u)*.4) calc(var(--u)*3) rgba(0,0,0,.6)}
.h em{font-style:normal;color:#6fdbe6}
.w{display:inline-block;opacity:0}
.pw{position:relative;width:100%;height:${V ? '52%' : P ? '60%' : '68%'};margin-top:calc(var(--u)*3.2);perspective:${u * 170}px}
.pan{position:absolute;inset:0;margin:auto;border-radius:calc(var(--u)*2.2);overflow:hidden;border:1px solid rgba(111,219,230,.5);background:#11151c;box-shadow:0 calc(var(--u)*4) calc(var(--u)*11) rgba(0,0,0,.7),0 0 calc(var(--u)*7) rgba(64,200,214,.14);opacity:0}
.pan img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#pi0{transform:scale(${P ? 1.26 : 1})}
.pan:after{content:"";position:absolute;inset:0;background:linear-gradient(118deg,rgba(255,255,255,.11) 0%,rgba(255,255,255,0) 32%)}
.gh{position:absolute;border-radius:calc(var(--u)*2);overflow:hidden;border:1px solid rgba(111,219,230,.3);opacity:0;filter:blur(${(u * 0.9).toFixed(1)}px) brightness(.7)}
.hs{position:relative;width:100%;height:calc(var(--u)*${HS}*1.15)}.hs .h{position:absolute;left:0;right:0;bottom:0;margin:auto;max-width:100%}
.selo{position:relative;margin-top:calc(var(--u)*2.4);font-size:calc(var(--u)*1.8);font-weight:600;color:#f5c66a;border:1px solid rgba(245,198,106,.5);border-radius:99px;padding:.45em 1.1em;background:rgba(3,6,12,.5)}
#steps{position:relative;width:calc(var(--u)*${P ? 88 : 84});height:calc(var(--u)*${P ? 46 : 38})}
.rail{position:absolute;left:calc(var(--u)*2.05);top:calc(var(--u)*5);width:calc(var(--u)*.5);height:calc(var(--u)*${P ? 34 : 26});background:linear-gradient(#6fdbe6,#bff6fb);box-shadow:0 0 calc(var(--u)*2.4) rgba(64,200,214,.8);transform-origin:50% 0;border-radius:9px}
.nd{position:absolute;left:0;width:calc(var(--u)*4.6);height:calc(var(--u)*4.6);border-radius:50%;border:calc(var(--u)*.7) solid #fff;background:#03060c;box-shadow:0 0 calc(var(--u)*3) rgba(127,233,245,.7);opacity:0}
.nd.dm{border-radius:calc(var(--u)*.7);border:0;background:#00A8BC;box-shadow:0 0 calc(var(--u)*4) rgba(64,200,214,.95)}
.st{position:absolute;left:calc(var(--u)*9.5);font-weight:700;font-size:calc(var(--u)*${P ? 7.6 : 7.2});letter-spacing:-.03em;line-height:1;white-space:nowrap;text-align:left;text-shadow:0 calc(var(--u)*.4) calc(var(--u)*3) rgba(0,0,0,.6)}
.st em{font-style:normal;color:#6fdbe6}
#s6{${P ? '' : 'flex-direction:row;gap:5%;text-align:left'}}
.hc{display:flex;flex-direction:column;align-items:${P ? 'center' : 'flex-start'};${P ? 'width:100%' : 'width:42%;flex:none'}}
.lock{display:flex;align-items:center;gap:calc(var(--u)*2.4);font-weight:700;font-size:calc(var(--u)*${P ? 10.4 : 8.6});letter-spacing:-.03em;position:relative}
.lock svg{width:calc(var(--u)*${P ? 14 : 11.5});height:auto;overflow:visible}#wm{display:inline-block}
.fl{position:relative;height:2px;width:${P ? '100%' : '90%'};margin:calc(var(--u)*3) 0;background:linear-gradient(90deg,rgba(127,233,245,0),#bff6fb 50%,rgba(127,233,245,0));box-shadow:0 0 calc(var(--u)*4) calc(var(--u)*.6) rgba(64,200,214,.55);opacity:0}
.fan{position:relative;${P ? `width:100%;height:${V ? 31 : 32}%;margin-top:calc(var(--u)*5)` : 'width:53%;height:52%;flex:none'};perspective:${u * 150}px}
.fp{position:absolute;left:50%;top:50%;border-radius:calc(var(--u)*1.8);overflow:hidden;border:1px solid rgba(111,219,230,.5);box-shadow:0 calc(var(--u)*3) calc(var(--u)*9) rgba(0,0,0,.7),0 0 calc(var(--u)*6) rgba(64,200,214,.14);opacity:0;background-color:#11151c}
.fp:after{content:"";position:absolute;inset:0;background:linear-gradient(118deg,rgba(255,255,255,.1) 0%,rgba(255,255,255,0) 34%)}
.cta{position:relative;margin-top:calc(var(--u)*${P ? 5.5 : 4.5});background:#6fdbe6;color:#04212a;font-weight:700;font-size:calc(var(--u)*${P ? 3.6 : 2.9});border-radius:99px;padding:.6em 1.5em;opacity:0;box-shadow:0 calc(var(--u)*1) calc(var(--u)*5) rgba(64,200,214,.35)}
#grain{position:absolute;inset:-200px;opacity:.07;mix-blend-mode:overlay;pointer-events:none}
#vig{background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 50%,rgba(0,0,0,.62) 100%);pointer-events:none}
#flash{background:radial-gradient(ellipse at 50% 50%,rgba(191,246,251,.55),rgba(64,200,214,0) 65%);opacity:0;pointer-events:none}
#fade{background:#000;pointer-events:none}
</style></head><body>
<div id="amb"></div><canvas id="net" width="${W}" height="${H}"></canvas>
<div id="frag">${fragHtml}</div>
<div class="sc" id="s1"><div class="halo"></div><div class="h" id="t1">${Wd('Todo processo tem uma <em>lógica.</em>')}</div></div>
<div class="sc" id="s2"><div class="halo"></div><div class="h" id="t2">${Wd('Mas nem sempre é fácil')}<br>${Wd('<em>enxergar o todo.</em>')}</div></div>
<div class="sc" id="s3"${P ? '' : ' style="justify-content:flex-end;padding-bottom:7%"'}><div class="halo"${P ? '' : ' style="top:84%"'}></div><div class="h" id="t3">${Wd('É aqui que a <em>clareza</em> começa.')}</div></div>
<div class="sc" id="s4"><div class="hs">${['Mapeamento <em>visual.</em>', '<em>Diagnóstico.</em>', 'Plano de <em>ação.</em>'].map((x, i) => `<div class="h" id="pt${i}">${Wd(x)}</div>`).join('')}</div>
<div class="pw"><div class="gh" id="g0"></div><div class="gh" id="g1"></div>
<div class="pan" id="pp0" style="width:${P ? 92 : 62}%;height:${V ? 78 : P ? 76 : 100}%"><img id="pi0" src="${MAPA}"></div>
<div class="pan" id="pp1" style="width:${P ? 82 : 62}%;height:100%${P ? '' : ';' + crop(DIAG)}">${P ? `<img id="pi1" src="${img('capturas-v2/diag-kpi-m.png')}">` : ''}</div>
<div class="pan" id="pp2" style="width:${P ? 82 : 62}%;height:${P ? 78 : 100}%${P ? '' : ';' + crop(PLAN)}">${P ? `<img id="pi2" src="${img('capturas-v2/plano-m.png')}">` : ''}</div></div>
<div class="selo">Demonstração com dados fictícios</div></div>
<div class="sc" id="s5"><div class="halo" style="height:calc(var(--u)*${P ? 74 : 60})"></div><div id="steps"><div class="rail" id="rail"></div>
${[0, 1, 2].map((i) => `<div class="nd${i === 2 ? ' dm' : ''}" id="n${i}" style="top:calc(var(--u)*${2.7 + i * (P ? 17 : 13)})"></div><div class="st" id="w${i}" style="top:calc(var(--u)*${1.2 + i * (P ? 17 : 13)})">${Wd(['Mapeie.', 'Diagnostique.', 'Transforme em <em>ação.</em>'][i])}</div>`).join('')}</div></div>
<div class="sc" id="s6"><div class="hc"><div class="lock"><svg viewBox="0 0 64 64"><rect id="y0" x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle id="y1" cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 17 32)"/><path id="y2" d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path id="y3" d="M41 21l11 11-11 11-11-11z" fill="#00A8BC" style="transform-origin:41px 32px"/></svg><span id="wm">NexoProcess</span></div>
<div class="fl" id="f6"></div><div class="h" id="t6" style="font-size:calc(var(--u)*${HS * 0.7});max-width:100%">${Wd('Clareza para transformar processos <em>em ação.</em>')}</div>${P ? '' : '<div class="cta" id="cta">Conheça o NexoProcess</div>'}</div>
<div class="fan"><div class="fp" id="h1" style="width:${P ? 58 : 56}%;aspect-ratio:16/9.6;${crop(DIAG)}"></div><div class="fp" id="h2" style="width:${P ? 58 : 56}%;aspect-ratio:16/9.6;${crop(PLAN)}"></div><div class="fp" id="h0" style="width:${V ? 80 : P ? 70 : 74}%;aspect-ratio:16/9;background:url('${MAPA}') center/cover"></div></div>
${P ? '<div class="cta" id="cta">Conheça o NexoProcess</div>' : ''}</div>
<canvas id="grain"></canvas><div id="vig"></div><div id="flash"></div><div id="fade"></div>
<script>
const W=${W},H=${H},U=${u},P=${P},V=${V},NF=${FR.length};
const $=(i)=>document.getElementById(i), cl=(x)=>Math.max(0,Math.min(1,x)), ez=(x)=>{x=cl(x);return x*x*(3-2*x)}, eo=(x)=>{x=cl(x);return 1-Math.pow(1-x,3)}, mix=(a,b,k)=>a+(b-a)*k;
let seed=20261116; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
const g=$('grain'); g.width=${Math.ceil(W / 2) + 200}; g.height=${Math.ceil(H / 2) + 200}; g.style.width=(g.width*2)+'px'; g.style.height=(g.height*2)+'px';
{const c=g.getContext('2d'),d=c.createImageData(g.width,g.height);let s=12345;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}
// ---------- rede de luz: caos → fluxo de processo
const nodes=[],edges=[],conn=[];
const add=(x,y,k)=>{const o=P?[x,y,0]:[y,x,0];nodes.push({o:o,c:[(rnd()*2-1)*(P?1.25:2.3),(rnd()*2-1)*(P?2.0:1.15),(rnd()*2-1)*1.7],ph:rnd()*6.28,w:.3+rnd()*.5,sz:.55+rnd()*.5,d:.42*(y+1.5)/3,amb:k?1:0,dust:0});return nodes.length-1};
const loop=(pts,k)=>{const ids=pts.map((p,i)=>add(p[0],p[1],k&&i%5===0));ids.forEach((id,i)=>edges.push([id,ids[(i+1)%ids.length],1]));return ids};
const circ=(cx,cy,r,n)=>loop([...Array(n)].map((_,i)=>[cx+r*Math.cos(i/n*6.2832),cy+r*Math.sin(i/n*6.2832)]));
const rect=(cx,cy,w,h,nw,nh,k)=>{const p=[];for(let i=0;i<nw;i++)p.push([cx-w/2+w*i/nw,cy-h/2]);for(let i=0;i<nh;i++)p.push([cx+w/2,cy-h/2+h*i/nh]);for(let i=0;i<nw;i++)p.push([cx+w/2-w*i/nw,cy+h/2]);for(let i=0;i<nh;i++)p.push([cx-w/2,cy+h/2-h*i/nh]);return loop(p,k)};
const diam=(cx,cy,r)=>{const c=[[cx,cy-r],[cx+r,cy],[cx,cy+r],[cx-r,cy]],p=[];for(let s=0;s<4;s++)for(let i=0;i<3;i++)p.push([mix(c[s][0],c[(s+1)%4][0],i/3),mix(c[s][1],c[(s+1)%4][1],i/3)]);return loop(p,true)};
const line=(pts)=>{const ids=[];for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(L/.11));for(let i=(s?1:0);i<=n;i++)ids.push(add(mix(a[0],b[0],i/n),mix(a[1],b[1],i/n)))}for(let i=0;i<ids.length-1;i++)edges.push([ids[i],ids[i+1],2]);conn.push(ids)};
circ(0,-1.32,.15,14);rect(0,-.8,.66,.3,6,4);diam(0,-.22,.25);rect(-.46,.4,.58,.28,5,4);rect(.46,.4,.58,.28,5,4,true);rect(0,.98,.66,.3,6,4);circ(0,1.48,.15,14);circ(0,1.48,.09,8);
line([[0,-1.17],[0,-.95]]);line([[0,-.65],[0,-.47]]);line([[-.25,-.22],[-.46,-.22],[-.46,.26]]);line([[.25,-.22],[.46,-.22],[.46,.26]]);line([[-.46,.54],[-.46,.98],[-.33,.98]]);line([[.46,.54],[.46,.98],[.33,.98]]);line([[0,1.13],[0,1.33]]);
const NS=nodes.length;
for(let i=0;i<120;i++){const c=[(rnd()*2-1)*(P?1.6:2.9),(rnd()*2-1)*(P?2.5:1.5),(rnd()*2-1)*2.4];nodes.push({o:c,c:c,ph:rnd()*6.28,w:.2+rnd()*.4,sz:.35+rnd()*.6,d:0,amb:0,dust:1})}
for(let i=NS;i<nodes.length;i++){let b=-1,bd=.75;for(let j=NS;j<nodes.length;j++){if(i===j)continue;const a=nodes[i].c,c=nodes[j].c,d=Math.hypot(a[0]-c[0],a[1]-c[1],a[2]-c[2]);if(d<bd){bd=d;b=j}}if(b>=0)edges.push([i,b,0])}
const spr=(r0,g0,b0,flat)=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),gr=x.createRadialGradient(32,32,0,32,32,32);
  if(flat){gr.addColorStop(0,'rgba('+r0+','+g0+','+b0+',.5)');gr.addColorStop(.72,'rgba('+r0+','+g0+','+b0+',.42)');gr.addColorStop(1,'rgba('+r0+','+g0+','+b0+',0)')}
  else{gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.18,'rgba('+r0+','+g0+','+b0+',.9)');gr.addColorStop(.5,'rgba('+r0+','+g0+','+b0+',.22)');gr.addColorStop(1,'rgba('+r0+','+g0+','+b0+',0)')}
  x.fillStyle=gr;x.fillRect(0,0,64,64);return c};
const SP=[spr(120,225,240,0),spr(120,225,240,1),spr(245,190,95,0),spr(245,190,95,1)];
const cv=$('net'),cx2=cv.getContext('2d'),SC=.26*Math.max(W,H),FO=4;
function drawNet(t,Q,cam,al,pulse){cx2.clearRect(0,0,W,H);if(al<=0.003)return;cx2.globalCompositeOperation='lighter';
  const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw),cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch),pr=[];
  for(const n of nodes){const q=n.dust?0:ez((Q-n.d)/.58),dr=.07*(1-q)+.004;
    let x=mix(n.c[0],n.o[0],q)+dr*Math.sin(t*n.w+n.ph),y=mix(n.c[1],n.o[1],q)+dr*Math.cos(t*n.w*1.3+n.ph),z=mix(n.c[2],n.o[2],q)+dr*Math.sin(t*n.w*.7+n.ph*2);
    const x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp,k=FO/(FO+z2+cam.dz);
    pr.push([cam.cx+SC*cam.zoom*x1*k,cam.cy+SC*cam.zoom*y1*k,z2,k,q])}
  for(const e of edges){const a=pr[e[0]],b=pr[e[1]];if(a[3]<=0||b[3]<=0)continue;const q=Math.min(a[4],b[4]),n=nodes[e[0]];
    const fr=e[2]===0?1:mix(.22+.38*(.5+.5*Math.sin(t*1.25+n.ph)),1,q),bl=Math.min(1,(Math.abs(a[2])+Math.abs(b[2]))*.28);
    let alp=(e[2]===0?.13*(1-.6*Q):mix(.2,.85,q))*(1-.72*bl)*al;if(alp<.01)continue;
    cx2.strokeStyle='rgba(125,226,240,'+alp+')';cx2.lineWidth=U*mix(.09,.2,q)*(e[2]===0?.8:1);cx2.beginPath();cx2.moveTo(a[0],a[1]);cx2.lineTo(mix(a[0],b[0],fr),mix(a[1],b[1],fr));cx2.stroke()}
  for(let i=0;i<nodes.length;i++){const n=nodes[i],p=pr[i];if(p[3]<=0)continue;const bl=Math.min(1.4,Math.abs(p[2])*.42),q=p[4];
    const r=U*n.sz*(n.dust?.8:1)*p[3]*(.75+2.6*bl)*mix(1.25,1,q),a=(n.dust?.55*(1-.5*Q):mix(.85,1,q))*al/(1+bl*bl*5);
    cx2.globalAlpha=Math.min(1,a);cx2.drawImage(SP[(n.amb?2:0)+(bl>.4?1:0)],p[0]-r,p[1]-r,2*r,2*r)}
  if(pulse>0){cx2.globalAlpha=al;for(let c=0;c<conn.length;c++){const ids=conn[c],f=((pulse*.9+c*.37)%1)*(ids.length-1),i0=Math.floor(f),a=pr[ids[i0]],b=pr[ids[Math.min(ids.length-1,i0+1)]],x=mix(a[0],b[0],f-i0),y=mix(a[1],b[1],f-i0),r=U*1.5;cx2.drawImage(SP[0],x-r,y-r,2*r,2*r)}}
  cx2.globalAlpha=1;cx2.globalCompositeOperation='source-over'}
// ---------- fragmentos (recortes reais), espalhados em profundidade
const FRG=[...Array(NF)].map((_,i)=>{const a=i/NF*6.2832+rnd()*.5;return {x:Math.cos(a)*(P?27:60)*(.75+rnd()*.5),y:Math.sin(a)*(P?${V ? 60 : 44}:27)*(.75+rnd()*.5),z:-70+rnd()*85,ry:(rnd()*2-1)*38,rx:(rnd()*2-1)*20,rz:(rnd()*2-1)*9,ph:rnd()*6.28,e:$('fr'+i)}});
const WC={};
window.render=async(t)=>{
  const vis=(a,b,fi=.5,fo=.4)=>Math.min(ez((t-a)/fi),ez((b-t)/fo));
  const show=(id,a,b,fi,fo)=>{const v=vis(a,b,fi,fo);$(id).style.opacity=v;return v};
  const rv=(id,t0,per=.07,dur=.5,skip=0,gap=0)=>{(WC[id]||(WC[id]=[...$(id).querySelectorAll('.w')])).forEach((w,i)=>{const v=ez((t-t0-i*per-(i>=skip&&skip?gap:0))/dur);w.style.opacity=v;w.style.filter=v<1?'blur('+((1-v)*9)+'px)':'none';w.style.transform='translateY('+((1-v)*.22)+'em)'})};
  $('amb').style.background='radial-gradient(circle at '+(32+16*Math.sin(t*.13))+'% '+(34+10*Math.cos(t*.11))+'%,rgba(23,50,99,.55),rgba(3,6,12,0) 48%),radial-gradient(circle at '+(70+12*Math.cos(t*.09))+'% '+(72+8*Math.sin(t*.15))+'%,rgba(0,168,188,.14),rgba(3,6,12,0) 42%),#03060c';
  // ---- rede: câmera e ordem
  const Q=ez((t-7.25)/2.25), k1=eo(t/2.4), k2=cl((t-2.4)/4.8), k3=ez((t-7.2)/2.3);
  let cam={yaw:mix(mix(-.6,-.34,k1),.26,k2)*(1-k3),pitch:mix(.2,.1,k2)*(1-k3),zoom:mix(mix(mix(.72,1.06,k1),1.16,k2),P?1:.86,k3),dz:0,cx:W/2,cy:H*(P?.5:.5-.07*k3)},al=1,pulse=0;
  if(t>=9.5){const o=ez((t-9.5)/.5);al=mix(1,.1,o)}
  if(t>=18.3){const i=ez((t-18.3)/.8),o=ez((t-25.6)/.5);al=mix(.1,.42,i)*(1-o)+.2*o;cam.yaw=.38*Math.sin((t-18.6)*.22)+.25;cam.pitch=.12;cam.zoom=mix(1,1.12,i)+.03*(t-18.6);cam.cx=W*(P?.6:.7);pulse=(t-18.6)*.4}
  if(t>=25.8){cam.yaw=.25+.05*(t-25.8);cam.zoom=1.5;cam.cx=W/2;cam.cy=H*.55;pulse=(t-18.6)*.4}
  if(t>=9.3&&t<10.6)al*=1+.5*Math.exp(-Math.abs(t-9.6)*7);
  drawNet(t,Q,cam,al,pulse);
  // ---- fragmentos
  const gv=ez((t-7.3)/1.7);
  for(let i=0;i<NF;i++){const f=FRG[i],a=ez((t-2.5-i*.24)/.4)*(1-ez((t-8.2)/.9));f.e.style.opacity=a*.9;if(a<=0)continue;
    const dx=2.2*Math.sin(t*.5+f.ph),dy=2.6*Math.cos(t*.42+f.ph),s=(1-.55*gv)*(.86+.14*ez((t-2.5-i*.24)/.5));
    f.e.style.transform='translate3d('+((f.x*(1-.9*gv)+dx)*U)+'px,'+((f.y*(1-.9*gv)+dy)*U)+'px,'+(mix(f.z,-20,gv)*U)+'px) rotateY('+(f.ry*(1-gv)+6*Math.sin(t*.4+f.ph))+'deg) rotateX('+(f.rx*(1-gv))+'deg) rotateZ('+(f.rz*(1-gv))+'deg) scale('+s+')';
    f.e.style.filter='blur('+(Math.abs(f.z+10)*.055*U*.1).toFixed(2)+'px) brightness('+(1.0+.4*(f.z+70)/85)+')'}
  // ---- textos de abertura
  if(show('s1',.05,2.35,.25,.3)>0)rv('t1',.2,.085,.5);
  if(show('s2',2.55,7.1,.3,.35)>0)rv('t2',2.8,.085,.5,5,1.05);
  if(show('s3',7.35,9.3,.3,.35)>0)rv('t3',7.6,.085,.5);
  // ---- produto: três planos em painéis de vidro
  if(show('s4',9.6,18.7,.2,.3)>0){const ST=[9.6,12.6,15.6],k=t<ST[1]?0:t<ST[2]?1:2,st=ST[k],ta=t-st,e=eo(ta/.75),x=ez((ta-2.72)/.28),a=Math.min(ez((ta+.1)/.3),1-x);
    for(let i=0;i<3;i++){$('pt'+i).style.opacity=i===k?1-x:0;const p=$('pp'+i);p.style.opacity=i===k?a:0;
      if(i===k)p.style.transform='translate3d(0,'+(U*6*(1-e))+'px,'+(-U*46*(1-e)+U*8*x)+'px) rotateY('+(-26*(1-e)-6+4.5*ta/3)+'deg) rotateX('+(11*(1-e)+2.5)+'deg) scale('+(1+.035*ta/3)+')'}
    rv('pt'+k,st+.08,.08,.45);const uu=ez(ta/3.1);
    $('pi0').style.objectPosition=((P?1:6)+(P?80:66)*uu)+'% 50%';if(P){$('pi1').style.objectPosition='50% '+(3+33*uu)+'%';$('pi2').style.objectPosition='50% '+(100*uu)+'%'}
    else{$('pp1').style.backgroundPosition='92% '+(100-22*(1-uu))+'%';$('pp2').style.backgroundPosition='92% '+(100-22*(1-uu))+'%'}
    const GI=[['${DIAG}','${PLAN}'],['${MAPA}','${PLAN}'],['${MAPA}','${DIAG}']][k];
    [0,1].forEach((j)=>{const gE=$('g'+j);if(gE.dataset.s!==GI[j]){gE.dataset.s=GI[j];gE.style.background="url('"+GI[j]+"') center/cover"}
      gE.style.width=(P?70:44)+'%';gE.style.height=(P?30:46)+'%';gE.style.left=(j?(P?34:60):(P?-6:-6))+'%';gE.style.top=(j?(P?72:52):(P?-6:2))+'%';gE.style.opacity=.42*a;
      gE.style.transform='translate3d('+((j?1:-1)*U*(3-2.5*ta))+'px,'+((j?-1:1)*U*1.5*ta)+'px,'+(-U*(j?95:70))+'px) rotateY('+(j?-30:28)+'deg) rotateX(6deg)'})}
  // ---- as três palavras: um fluxo que se conecta
  if(show('s5',18.55,25.75,.35,.3)>0){const WT=[19.2,21.6,24.0],RH=${P ? 17 : 13};
    for(let i=0;i<3;i++){const a=ez((t-WT[i]+.05)/.3),n=$('n'+i);n.style.opacity=a;const pop=1+.5*Math.exp(-Math.max(0,t-WT[i])*6);n.style.transform=(i===2?'rotate(45deg) ':'')+'scale('+(a*pop)+')';
      rv('w'+i,WT[i],.07,.4);$('w'+i).style.opacity=i<2&&t>WT[i+1]-.2?mix(1,.5,ez((t-WT[i+1]+.2)/.4)):1}
    const rp=t<WT[1]-.9?0:t<WT[1]?.5*ez((t-WT[1]+.9)/.9):t<WT[2]-.9?.5:.5+.5*ez((t-WT[2]+.9)/.9);$('rail').style.transform='scaleY('+rp+')';$('rail').style.opacity=t>WT[0]?1:0}
  // ---- fechamento
  if(show('s6',25.7,34,.3,.1)>0){const b=25.85;
    $('y0').style.opacity=ez((t-b)/.3);$('y0').style.transform='scale('+(.86+.14*eo((t-b)/.45))+')';$('y0').style.transformOrigin='32px 32px';
    $('y1').style.strokeDashoffset=1-ez((t-b-.2)/.5);$('y1').style.opacity=t>b+.2?1:0;$('y2').style.strokeDashoffset=1-ez((t-b-.6)/.3);$('y2').style.opacity=t>b+.6?1:0;
    const dv=cl((t-b-.85)/.4);$('y3').style.transform='scale('+(dv<=0?0:1+.25*Math.sin(dv*Math.PI)*(1-dv))+')';$('y3').style.opacity=dv>0?1:0;
    const wv=ez((t-b-.3)/.9);$('wm').style.clipPath='inset(0 '+((1-wv)*100)+'% 0 0)';$('wm').style.opacity=wv>0?1:0;
    const fa=ez((t-b)/.22),fd=1-ez((t-b-.25)/1.5),fe=$('f6');fe.style.opacity=Math.max(fa*fd,.5*ez((t-b-.4)/1));fe.style.transform='scaleX('+Math.max(.16,fa*(.16+.84*fd))+')';
    rv('t6',b+1.25,.075,.5);
    const HP=[['h0',0,0,0,b+1.9],['h1',-${P ? 30 : 30},-${P ? 34 : 34},34,b+2.2],['h2',${P ? 30 : 30},-${P ? 34 : 34},-34,b+2.2]];
    for(const h of HP){const e=eo((t-h[4])/1.0),el=$(h[0]);el.style.opacity=ez((t-h[4])/.5)*(h[1]?.8:1);el.style.filter=h[1]?'brightness(.78)':'none';
      el.style.transform='translate(-50%,-50%) translate3d('+(h[1]*U*${P ? 1 : 0.8})+'px,'+(U*10*(1-e)-U*.25*(t-b))+'px,'+(h[2]*U+U*1.2*(t-b))+'px) rotateY('+h[3]+'deg) rotateX('+(8*(1-e)+2)+'deg)'}
    const cv2=ez((t-b-3.4)/.6);$('cta').style.opacity=cv2;$('cta').style.transform='translateY('+((1-cv2)*1.2)+'vh)'}
  $('flash').style.opacity=.9*Math.exp(-Math.abs(t-9.62)*9)+.8*Math.exp(-Math.abs(t-25.82)*9)+.35*Math.exp(-Math.abs(t-.12)*10);
  g.style.transform='translate('+(-(Math.floor(t*30)*37%190))+'px,'+(-(Math.floor(t*30)*53%190))+'px)';
  $('fade').style.opacity=Math.max(1-ez(t/.25),ez((t-32.8)/.8));
};
</script></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => { console.error('ERRO NA PÁGINA:', e.message); process.exitCode = 2; });
  const f = `${F}/work/clareza_${fmt}.html`; fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => 0))); }); await p.waitForTimeout(900);
  if (process.argv[3]) {
    for (const t of process.argv[3].split(',')) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${F}/work/t_${fmt}_${t}.jpg`, type: 'jpeg', quality: 95 }); }
    await b.close(); return;
  }
  const out = `${F}/work/master_${fmt}.mp4`;
  const fm = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < Math.round(T * FPS); i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 96 });
    if (!fm.stdin.write(buf)) await new Promise((r) => fm.stdin.once('drain', r));
  }
  fm.stdin.end(); await new Promise((r) => fm.on('close', r)); await b.close(); console.log('ok', out);
})().catch((e) => { console.error(e); process.exit(1); });

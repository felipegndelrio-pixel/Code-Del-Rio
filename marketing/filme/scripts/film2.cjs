// "A história do NexoProcess" — v2 (56 s), renderizado quadro a quadro (HTML determinístico → FFmpeg).
// Uso: node film2.cjs <16x9|9x16|4x5> [t1,t2,...]   (com tempos: só gera quadros de teste em work/)
// Conteúdo real: data e commits do git, telas do app (demonstração fictícia), gravação original do Google,
// foto original dos dispositivos, arquivo en.ts. Globo: Natural Earth (world-atlas). Sem música.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/filme`, A = `${R}/marketing/video/assets`;
const FMT = { '16x9': [1920, 1080], '9x16': [1080, 1920], '4x5': [1080, 1350] };
const fmt = process.argv[2]; const [W, H] = FMT[fmt]; const T = 56, FPS = 30;
const P = W < H, V = fmt === '9x16', LB = fmt === '16x9';
const D = JSON.parse(fs.readFileSync(`${F}/assets/dados.json`, 'utf8'));
const FD = `${R}/node_modules/@fontsource`;
const ff = (fam, dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:${fam};font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const serif = ['normal', 'italic'].map((st) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:ISerif;font-style:${st};font-weight:400;src:url(file://${F}/assets/fonts/instrument-serif-${s}-400-${st}.woff2) format('woff2');}`).join('')).join('');
const LOG = fs.readFileSync(`${F}/work/gitlog.txt`, 'utf8').trim().split('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ICO = (n) => fs.readFileSync(`${F}/assets/${n}.svg`, 'utf8').replace(/<title>.*?<\/title>/, '');
// envolve cada palavra para a revelação palavra a palavra
const Wd = (h) => { let em = false; return h.replace(/<em>|<\/em>|<br>|[^\s<]+/g, (m) => { if (m === '<em>') { em = true; return ''; } if (m === '</em>') { em = false; return ''; } if (m === '<br>') return m; return `<span class="w">${em ? '<em>' + m + '</em>' : m}</span>`; }); };
const card = P ? 'm' : 'd';
const u = Math.min(W, H) / 100;
const HS = V ? 10.4 : P ? 9.4 : 8.6;                       // corpo do título (em u)
const PAD = V ? '15% 7% 21%' : P ? '7% 7%' : '7% 8%';
const LBH = LB ? Math.round((H - W / 2.39) / 2) : 0;       // faixas de cinema (só no 16:9)
const GL = V ? { cx: W / 2, cy: H * 0.6, r: W * 0.42 } : P ? { cx: W / 2, cy: H * 0.6, r: W * 0.37 } : { cx: W * 0.69, cy: H / 2, r: H * 0.3 };
const chip = (k, flag, ico, name) => `<div class="pc"><span class="k">${k}</span><div class="c"><span class="fl">${flag}</span>${ico}${name}</div></div>`;
const HOT = `<img class="ic" src="file://${F}/assets/hotmart_mono.png">`;
const html = `<html><head><meta charset="utf-8"><style>
${serif}${ff('Plex', 'ibm-plex-sans', 400)}${ff('Plex', 'ibm-plex-sans', 600)}${ff('Plex', 'ibm-plex-sans', 700)}${ff('Mono', 'ibm-plex-mono', 400)}${ff('Mono', 'ibm-plex-mono', 500)}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#04070d;overflow:hidden}
body{--u:${u}px;font-family:Plex,sans-serif;color:#eef3fb;position:relative}
#amb{position:absolute;inset:0}
.sc{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${PAD}}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sh{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(4,7,13,.2) 0%,rgba(4,7,13,.88) 100%)}
.h{font-family:ISerif,Georgia,serif;font-weight:400;font-size:calc(var(--u)*${HS});line-height:1.02;letter-spacing:-.012em;position:relative;text-wrap:balance;max-width:${P ? '100%' : '80%'};text-shadow:0 calc(var(--u)*.4) calc(var(--u)*3) rgba(0,0,0,.55)}
.h em{font-style:italic;color:#6fdbe6}
.w{display:inline-block;opacity:0;will-change:transform,filter}
.s{font-weight:400;font-size:calc(var(--u)*${P ? 3.8 : 3});line-height:1.35;color:#b9c6da;margin-top:calc(var(--u)*2.4);position:relative;text-wrap:balance;max-width:${P ? '100%' : '70%'}}
.s b{color:#eef3fb;font-weight:600}
#date{font-family:Mono;font-weight:500;font-size:calc(var(--u)*${P ? 9.6 : 8.2});letter-spacing:.07em;color:#6fdbe6;position:relative;text-shadow:0 0 calc(var(--u)*4) rgba(64,200,214,.45)}
#cur{display:inline-block;width:.55em;height:1em;background:#6fdbe6;vertical-align:-.12em;margin-left:.08em}
.fl1{position:relative;height:2px;width:100%;margin:calc(var(--u)*3.4) 0 calc(var(--u)*3);background:linear-gradient(90deg,rgba(127,233,245,0),#bff6fb 50%,rgba(127,233,245,0));box-shadow:0 0 calc(var(--u)*4) calc(var(--u)*.6) rgba(64,200,214,.55);opacity:0}
.cm{font-family:Mono;font-size:calc(var(--u)*${P ? 2.2 : 1.8});letter-spacing:.2em;color:#7c8fad;margin-bottom:calc(var(--u)*1.8);opacity:0;position:relative}
.term{position:relative;width:100%;max-width:calc(var(--u)*${P ? 92 : 118});margin-top:calc(var(--u)*4);background:rgba(6,11,21,.8);border:1px solid #223049;border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*2.4);text-align:left;font-family:Mono;font-size:calc(var(--u)*${P ? 2.05 : 1.7});line-height:1.75;height:calc(var(--u)*${V ? 56 : P ? 44 : 33});overflow:hidden;box-shadow:0 calc(var(--u)*3) calc(var(--u)*8) rgba(0,0,0,.5)}
.term div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c9d4e8}.term b{color:#f5c66a;font-weight:500}
.hs{position:relative;width:100%;height:calc(var(--u)*${HS}*${P ? 2.1 : 1.1})}.hs .h{position:absolute;left:0;right:0;bottom:0;margin:auto;max-width:100%}
.ss{position:relative;width:100%;height:calc(var(--u)*${P ? 11.5 : 7.4})}.ss .s{position:absolute;left:0;right:0;top:0;margin:calc(var(--u)*2.2) auto 0;max-width:100%;opacity:0}
.shot{position:relative;width:${P ? '100%' : '74%'};height:${V ? '46%' : P ? '50%' : '57%'};border-radius:calc(var(--u)*2);overflow:hidden;border:1px solid rgba(111,219,230,.5);box-shadow:0 calc(var(--u)*3) calc(var(--u)*9) rgba(0,0,0,.65),0 0 calc(var(--u)*6) rgba(64,200,214,.12);background:#11151c;margin-top:calc(var(--u)*2)}
.shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0}
.sweep{position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,0) 38%,rgba(170,240,255,.22) 50%,rgba(255,255,255,0) 62%);transform:translateX(-110%)}
.selo{position:relative;margin-top:calc(var(--u)*2.2);font-size:calc(var(--u)*1.9);font-weight:600;color:#f5c66a;border:1px solid rgba(245,198,106,.5);border-radius:99px;padding:.45em 1.1em}
.row{position:relative;display:flex;flex-direction:${P ? 'column' : 'row'};align-items:center;gap:calc(var(--u)*${P ? 5 : 6});width:100%;justify-content:center}
.txt{display:flex;flex-direction:column;align-items:${P ? 'center' : 'flex-start'};text-align:${P ? 'center' : 'left'};${P ? '' : 'width:40%;flex:none'}}
.txt .h,.txt .s{max-width:100%}
.mock{position:relative;flex:none;width:${P ? '100%' : '56%'};aspect-ratio:${D.mock.w}/${D.mock.h}}
.mock .gl{position:absolute;inset:-12% -8%;background:radial-gradient(ellipse at 50% 55%,rgba(64,200,214,.26) 0%,rgba(24,58,110,.3) 40%,rgba(4,7,13,0) 70%)}
.mock img.d{position:absolute;inset:0;width:100%;height:100%}
.mock img.rf{position:absolute;left:0;top:99.2%;width:100%;height:100%;transform:scaleY(-1);opacity:.17;-webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,0) 34%)}
#rec{position:absolute;left:${(D.mock.phone[0] * 100).toFixed(3)}%;top:${(D.mock.phone[1] * 100).toFixed(3)}%;width:${(D.mock.phone[2] * 100).toFixed(3)}%;height:${(D.mock.phone[3] * 100).toFixed(3)}%;border-radius:11.5%/5.3%;object-fit:fill}
#globe,#g2{position:absolute;left:0;top:0}
.lbl{position:absolute;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.7);opacity:0;white-space:nowrap}
.k{font-family:Mono;font-size:calc(var(--u)*${P ? 1.8 : 1.5});letter-spacing:.22em;color:#6fdbe6}
.c{display:flex;align-items:center;gap:.5em;font-weight:600;font-size:calc(var(--u)*${P ? 2.9 : 2.4});border:1px solid rgba(255,255,255,.22);background:rgba(8,16,32,.72);border-radius:calc(var(--u)*1.5);padding:.5em .85em}
.c svg,.c .ic{height:1.15em;width:auto;fill:#eef3fb;display:block}
.fl{font-family:'Noto Color Emoji';font-size:1.05em;line-height:1}
#h6{position:absolute;${P ? `left:7%;right:7%;top:${V ? 15 : 6}%;text-align:center` : 'left:8%;width:36%;top:50%;transform:translateY(-50%);text-align:left'};max-width:none}
.ed{position:relative;width:${P ? '100%' : '56%'};margin-top:calc(var(--u)*3.5);border-radius:calc(var(--u)*1.6);overflow:hidden;box-shadow:0 calc(var(--u)*3) calc(var(--u)*9) rgba(0,0,0,.7),0 0 calc(var(--u)*6) rgba(64,200,214,.1);max-height:${P ? '44%' : '56%'}}
.ed img{display:block;${P ? 'width:160%;margin-left:-21%' : 'width:100%'}}
#s7{background:radial-gradient(ellipse at 50% 40%,#17386b 0%,#0c1a35 50%,#050b18 100%);${V ? 'padding-bottom:24%' : ''}}
.lock{display:flex;align-items:center;gap:calc(var(--u)*2.4);font-weight:700;font-size:calc(var(--u)*${P ? 10.4 : 9});letter-spacing:-.03em;position:relative}
.lock svg{width:calc(var(--u)*${P ? 14 : 12});height:auto;overflow:visible}
#wm{display:inline-block}
.en{font-family:Mono;font-size:calc(var(--u)*${P ? 2.4 : 2});color:#8fa3c2;margin-top:calc(var(--u)*2);letter-spacing:.02em;opacity:0;position:relative}
.hr{width:calc(var(--u)*14);height:1px;background:rgba(143,163,194,.45);margin:calc(var(--u)*${P ? 5 : 3.6}) 0 calc(var(--u)*${P ? 4.2 : 3.2});opacity:0;position:relative}
.pl{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*${P ? 2 : 3})}
.pc{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1);opacity:0}
.cta{position:relative;margin-top:calc(var(--u)*${P ? 5.5 : 4});background:#6fdbe6;color:#04212a;font-weight:700;font-size:calc(var(--u)*${P ? 3.6 : 2.9});border-radius:99px;padding:.6em 1.5em;opacity:0;box-shadow:0 calc(var(--u)*1) calc(var(--u)*5) rgba(64,200,214,.35)}
#grain{position:absolute;inset:-200px;opacity:.075;mix-blend-mode:overlay;pointer-events:none}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 52%,rgba(0,0,0,.6) 100%);pointer-events:none}
.bar{position:absolute;left:0;right:0;height:${LBH}px;background:#000}
#fade{position:absolute;inset:0;background:#000;pointer-events:none}
</style></head><body>
<div id="amb"></div>
<div class="sc" id="s1"><div id="date"><span id="dt"></span><span id="cur"></span></div><div class="fl1" id="f1"></div><div class="cm" id="s1c">COMMIT ${LOG[0].slice(0, 7).toUpperCase()}</div><div class="h" id="s1b" style="font-size:calc(var(--u)*${HS * 0.66})">${Wd('A primeira linha de código do <em>NexoProcess.</em>')}</div></div>
<div class="sc" id="s2"><img class="bg" id="o1"><div class="sh"></div><div class="h" id="h2">${Wd('Por que tantos processos ainda vivem em <em>planilhas?</em>')}</div></div>
<div class="sc" id="s2b"><img class="bg" id="o2a"><div class="sh"></div><div class="h" id="h2b">${Wd('Onde o fluxo não aparece, <em>o gargalo também não.</em>')}</div></div>
<div class="sc" id="s3"><img class="bg" id="o2b" style="filter:blur(5px) brightness(.5)"><div class="sh"></div><div class="h" id="h3">${Wd('Linha a linha. <em>Commit a commit.</em>')}</div><div class="term" id="term">${LOG.map((l) => `<div style="opacity:0"><b>${esc(l.slice(0, 7))}</b>${esc(l.slice(7))}</div>`).join('')}</div></div>
<div class="sc" id="s4"><div class="hs">${['Começa com um <em>assistente guiado.</em>', 'Vira um <em>mapa visual.</em>', 'Depois, um <em>diagnóstico.</em>', 'E um <em>plano de ação.</em>'].map((x, i) => `<div class="h" id="h4${i}">${Wd(x)}</div>`).join('')}</div>
<div class="ss">${['Você responde perguntas simples. Ele estrutura o processo.', 'Gargalos e retrabalho destacados.', 'Tempo, esforço e custo, com a fórmula à vista.', 'Com responsável e prazo.'].map((x, i) => `<div class="s" id="s4${i}">${x}</div>`).join('')}</div>
<div class="shot" id="shot"><img id="p0"><img id="p1" src="file://${A}/telas-4k/03b-mapa-macro-recorte.png"><img id="p2" src="file://${A}/capturas-v2/diag-kpi-${card}.png"><img id="p3" src="file://${A}/capturas-v2/plano-${card}.png"><div class="sweep" id="sw"></div></div><div class="selo">Demonstração com dados fictícios</div></div>
<div class="sc" id="s5"><div class="row"><div class="txt"><div class="h" id="h5">${Wd('Hoje, no Brasil: <em>disponível na Hotmart.</em>')}</div><div class="s" id="s5b">E o Google já responde o que é o NexoProcess.</div></div>
<div class="mock" id="mk"><div class="gl"></div><img class="rf" src="file://${F}/assets/mockup_recorte.png"><img class="d" src="file://${F}/assets/mockup_recorte.png"><img id="rec"></div></div></div>
<div class="sc" id="s6a" style="padding:0"><canvas id="globe" width="${W}" height="${H}"></canvas><div class="h" id="h6">${Wd('O próximo capítulo: <em>o mundo.</em>')}</div>
<div class="lbl" id="lb0"><div class="c"><span class="fl">🇧🇷</span>${HOT}Hotmart</div><span class="k">HOJE</span></div>
<div class="lbl" id="lb1"><span class="k">EM BREVE</span><div class="c"><span class="fl">🇺🇸</span>${ICO('gumroad')}Gumroad</div></div>
<div class="lbl" id="lb2"><span class="k">EM BREVE</span><div class="c"><span class="fl">🇬🇧</span>${ICO('paddle')}Paddle</div></div></div>
<div class="sc" id="s6b"><div class="h" id="h6b">${Wd('Agora, <em>em inglês.</em>')}</div><div class="s" id="s6s">Em desenvolvimento para as plataformas internacionais <b>Gumroad</b> e <b>Paddle</b>.</div><div class="ed" id="ed"><img src="file://${R}/marketing/stories/TELA_CODIGO_EN.png"></div></div>
<div class="sc" id="s7"><canvas id="g2" width="${W}" height="${H}"></canvas>
<div class="lock"><svg viewBox="0 0 64 64"><rect id="y0" x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle id="y1" cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 17 32)"/><path id="y2" d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path id="y3" d="M41 21l11 11-11 11-11-11z" fill="#00A8BC" style="transform-origin:41px 32px"/></svg><span id="wm">NexoProcess</span></div>
<div class="fl1" id="f7" style="margin:calc(var(--u)*3.2) 0 calc(var(--u)*3.4)"></div>
<div class="h" id="h7" style="font-size:calc(var(--u)*${HS * 0.78})">${Wd('Do processo na planilha <em>ao plano de melhoria.</em>')}</div>
<div class="en" id="s7b">From spreadsheet process to improvement plan.</div><div class="hr" id="s7h"></div>
<div class="pl">${chip('HOJE', '🇧🇷', HOT, 'Hotmart')}${chip('EM BREVE', '🇺🇸', ICO('gumroad'), 'Gumroad')}${chip('EM BREVE', '🇬🇧', ICO('paddle'), 'Paddle')}</div>
<div class="cta" id="s7d">Conheça o NexoProcess</div></div>
<canvas id="grain"></canvas><div id="vig"></div>${LB ? '<div class="bar" id="bt" style="top:0"></div><div class="bar" id="bb" style="bottom:0"></div>' : ''}<div id="fade"></div>
<script>
const W=${W},H=${H},U=${u},P=${P},LB=${LB},GL=${JSON.stringify(GL)};
const $=(i)=>document.getElementById(i), cl=(x)=>Math.max(0,Math.min(1,x)), ez=(x)=>{x=cl(x);return x*x*(3-2*x)}, eo=(x)=>{x=cl(x);return 1-Math.pow(1-x,3)};
const g=$('grain'); g.width=${Math.ceil(W / 2) + 200}; g.height=${Math.ceil(H / 2) + 200}; g.style.width=(g.width*2)+'px'; g.style.height=(g.height*2)+'px';
{const c=g.getContext('2d'),d=c.createImageData(g.width,g.height);let s=12345;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}
const DATE='19.10.2026', lines=[...$('term').children], pad=(n)=>String(n).padStart(4,'0');
async function setImg(el,src){ if(el.dataset.s===src) return; el.dataset.s=src; el.src=src; try{await el.decode()}catch(e){} }
const fr=(dir,t,t0,n)=>'file://${F}/work/'+dir+'/'+pad(Math.max(1,Math.min(n,Math.floor((t-t0)*30)+1)))+'.jpg';
// ---- globo
const rad=Math.PI/180, vec=(la,lo)=>[Math.cos(la*rad)*Math.sin(lo*rad),Math.sin(la*rad),Math.cos(la*rad)*Math.cos(lo*rad)];
const DOTS=${JSON.stringify(D.dots)}.map((d)=>vec(d[0],d[1]));
const BR=vec(-19.9,-43.9), US=vec(37.77,-122.42), UK=vec(51.5,-0.12);
function rot(v,la0,lo0){const L=lo0*rad,p=la0*rad,x1=v[0]*Math.cos(L)-v[2]*Math.sin(L),z1=v[0]*Math.sin(L)+v[2]*Math.cos(L);return [x1,v[1]*Math.cos(p)-z1*Math.sin(p),v[1]*Math.sin(p)+z1*Math.cos(p)]}
function slerp(a,b,s){const d=Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])),o=Math.acos(d),k=Math.sin(o),p=Math.sin((1-s)*o)/k,q=Math.sin(s*o)/k;return [a[0]*p+b[0]*q,a[1]*p+b[1]*q,a[2]*p+b[2]*q]}
function globe(cv,cx,cy,Rg,la0,lo0,a,arcs,marks){const c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);
  let gr=c.createRadialGradient(cx,cy,Rg*.9,cx,cy,Rg*1.22);gr.addColorStop(0,'rgba(64,200,214,'+(.3*a)+')');gr.addColorStop(1,'rgba(64,200,214,0)');c.fillStyle=gr;c.beginPath();c.arc(cx,cy,Rg*1.22,0,7);c.fill();
  gr=c.createRadialGradient(cx-Rg*.3,cy-Rg*.35,Rg*.1,cx,cy,Rg);gr.addColorStop(0,'rgba(20,44,88,'+a+')');gr.addColorStop(1,'rgba(4,9,20,'+a+')');c.fillStyle=gr;c.beginPath();c.arc(cx,cy,Rg,0,7);c.fill();
  c.strokeStyle='rgba(127,233,245,'+(.6*a)+')';c.lineWidth=Math.max(1,Rg*.004);c.stroke();
  for(const d of DOTS){const r=rot(d,la0,lo0);if(r[2]<=0.02)continue;const sx=cx+Rg*r[0],sy=cy-Rg*r[1];if(sy<-9||sy>cv.height+9)continue;c.fillStyle='rgba(150,228,242,'+((.16+.64*r[2])*a)+')';c.beginPath();c.arc(sx,sy,Rg*.0052*(.55+.45*r[2]),0,7);c.fill()}
  for(const k of (arcs||[])){if(k.p<=0)continue;const n=70,m=Math.floor(k.p*n);c.beginPath();let lx=0,ly=0;for(let i=0;i<=m;i++){const s=i/n,v=slerp(k.a,k.b,s),l=1+.2*Math.sin(Math.PI*s),r=rot(v,la0,lo0);lx=cx+Rg*r[0]*l;ly=cy-Rg*r[1]*l;i?c.lineTo(lx,ly):c.moveTo(lx,ly)}
    c.strokeStyle='rgba(191,246,251,.95)';c.lineWidth=Math.max(1.5,Rg*.007);c.shadowColor='#40c8d6';c.shadowBlur=Rg*.06;c.lineCap='round';c.stroke();c.shadowBlur=0;
    if(k.p<1){c.fillStyle='#fff';c.shadowColor='#7fe9f5';c.shadowBlur=Rg*.09;c.beginPath();c.arc(lx,ly,Rg*.014,0,7);c.fill();c.shadowBlur=0}}
  const out=[];for(const k of (marks||[])){const r=rot(k.v,la0,lo0),sx=cx+Rg*r[0],sy=cy-Rg*r[1];out.push([sx,sy]);if(k.a<=0)continue;const pu=(k.t*0.9)%1;
    c.strokeStyle='rgba(127,233,245,'+(k.a*(1-pu))+')';c.lineWidth=Rg*.005;c.beginPath();c.arc(sx,sy,Rg*(.02+.05*pu),0,7);c.stroke();
    c.fillStyle='rgba(255,255,255,'+k.a+')';c.shadowColor='#7fe9f5';c.shadowBlur=Rg*.06;c.beginPath();c.arc(sx,sy,Rg*.016,0,7);c.fill();c.shadowBlur=0}
  return out}
const WC={};
window.render=async(t)=>{
  const vis=(a,b,fi=.7,fo=.7)=>Math.min(ez((t-a)/fi),ez((b-t)/fo));
  const show=(id,a,b,fi,fo)=>{const v=vis(a,b,fi,fo);$(id).style.opacity=v;return v};
  const inn=(id,a,d=.7,dy=1.4)=>{const v=ez((t-a)/d),e=$(id);e.style.opacity=v;e.style.transform='translateY('+((1-v)*dy)+'vh)'};
  const rv=(id,t0,per=.075,dur=.6)=>{(WC[id]||(WC[id]=[...$(id).querySelectorAll('.w')])).forEach((w,i)=>{const v=ez((t-t0-i*per)/dur);w.style.opacity=v;w.style.filter=v<1?'blur('+((1-v)*9)+'px)':'none';w.style.transform='translateY('+((1-v)*.2)+'em)'})};
  const flare=(id,t0,rest)=>{const a=ez((t-t0)/.22),d=1-ez((t-t0-.25)/1.5),e=$(id);e.style.opacity=t<t0?0:Math.max(a*d,rest*ez((t-t0-.4)/1));e.style.transform='scaleX('+(t<t0?0:Math.max(.16,a*(.16+.84*d)))+')'};
  $('amb').style.background='radial-gradient(circle at '+(30+18*Math.sin(t*.11))+'% '+(34+10*Math.cos(t*.09))+'%,rgba(24,58,110,.5),rgba(4,7,13,0) 46%),radial-gradient(circle at '+(72+14*Math.cos(t*.07))+'% '+(70+8*Math.sin(t*.13))+'%,rgba(0,168,188,.13),rgba(4,7,13,0) 40%),#04070d';
  // 1 — a data (gancho: digitação imediata, impacto em 1,75 s)
  if(show('s1',0,4.5,.3,.7)>0){$('dt').textContent=DATE.slice(0,Math.floor(cl((t-0.4)/1.15)*DATE.length+.001));$('cur').style.opacity=t<1.75?1:((Math.floor(t*2.5)%2)?1:.15);
    $('date').style.transform='scale('+(1+(t>1.75?.05*Math.exp(-(t-1.75)*4):0))+')';flare('f1',1.75,.55);inn('s1c',2.35,.6,.8);rv('s1b',2.75)}
  // 2 — a pergunta
  if(show('s2',4.3,8.6)>0){await setImg($('o1'),fr('o1',t,4.3,156));$('o1').style.filter='brightness(.62) saturate(.9)';$('o1').style.transform='scale('+(1.04+.05*(t-4.3)/4.3)+')';rv('h2',4.9)}
  if(show('s2b',8.3,12.2)>0){await setImg($('o2a'),fr('o2a',t,8.3,130));$('o2a').style.filter='brightness(.7)';$('o2a').style.transform='scale('+(1.05+.05*(t-8.3)/3.9)+')';rv('h2b',8.9)}
  // 3 — a construção
  if(show('s3',11.9,18.0)>0){await setImg($('o2b'),fr('o2b',t,11.9,188));rv('h3',12.4);const n=cl((t-12.9)/4.4)*lines.length;lines.forEach((l,i)=>l.style.opacity=cl(n-i));
    const lh=lines[0].offsetHeight,over=Math.max(0,Math.ceil(n)*lh-($('term').clientHeight-lh*1.5));lines.forEach((l)=>l.style.transform='translateY(-'+over+'px)');$('term').style.opacity=ez((t-12.5)/.6)}
  // 4 — o produto
  if(show('s4',17.7,31.2)>0){const ST=[17.9,21.2,24.5,27.8],k=t<ST[1]?0:t<ST[2]?1:t<ST[3]?2:3,st=ST[k],uu=ez((t-st)/3.5),a=Math.min(ez((t-st)/.45),k<3?ez((st+3.3-t)/.3):1);
    for(let i=0;i<4;i++){$('h4'+i).style.opacity=i===k?(k<3?ez((st+3.3-t)/.3):1):0;$('s4'+i).style.opacity=i===k?Math.min(ez((t-st-.7)/.5),k<3?ez((st+3.3-t)/.3):1):0;$('p'+i).style.opacity=i===k?a:0}
    rv('h4'+k,st+.05,.07,.5);
    if(k===0)await setImg($('p0'),fr('as_${card}',t,18.2,116));
    $('p0').style.objectPosition='50% ${P ? 17 : 38}%';$('p1').style.objectPosition=(8+62*uu)+'% 50%';$('p2').style.objectPosition='50% '+(${P ? '4+34*uu' : '0+100*uu'})+'%';$('p3').style.objectPosition='50% '+(${P ? '0+100*uu' : '0+60*uu'})+'%';
    $('sw').style.transform='translateX('+(-110+220*cl((t-st-.1)/.9))+'%)';
    $('shot').style.transform='perspective('+(U*150)+'px) rotateY('+(-2.2+4.4*(t-st)/3.3)+'deg) rotateX(1.2deg)'}
  // 5 — Brasil
  if(show('s5',30.9,37.4)>0){rv('h5',31.4);inn('s5b',33.2);const m=ez((t-31.1)/1.3);$('mk').style.opacity=m;$('mk').style.transform='translateY('+((1-m)*3)+'vh) scale('+(.97+.05*(t-30.9)/6.5)+')';
    await setImg($('rec'),fr('rec',t,32.6,183))}
  // 6a — o mundo
  if(show('s6a',37.1,43.0)>0){const q=ez((t-37.3)/4.4),la=-12+38*q,lo=-48-10*q,p1=eo((t-38.9)/1.3),p2=eo((t-39.3)/1.4);
    const pts=globe($('globe'),GL.cx,GL.cy,GL.r,la,lo,1,[{a:BR,b:US,p:p1},{a:BR,b:UK,p:p2}],[{v:BR,a:ez((t-37.8)/.5),t:t},{v:US,a:p1>=1?1:0,t:t-40.2},{v:UK,a:p2>=1?1:0,t:t-40.7}]);
    rv('h6',37.6);const L=[['lb0',37.9,pts[0],0,U*2.2],['lb1',40.2,pts[1],-100,-U*2.2],['lb2',40.7,pts[2],-100,-U*2.2]];
    for(const x of L){const e=$(x[0]),v=ez((t-x[1])/.5);e.style.opacity=v;e.style.left=Math.max(U*3+e.offsetWidth/2,Math.min(W-U*3-e.offsetWidth/2,x[2][0]))+'px';e.style.top=(x[2][1]+x[4])+'px';e.style.transform='translate(-50%,'+x[3]+'%) scale('+(.92+.08*v)+')'}}
  // 6b — em inglês
  if(show('s6b',42.7,48.6)>0){rv('h6b',43.2);inn('s6s',44.4);const m=ez((t-43.0)/1.0);$('ed').style.opacity=m;$('ed').style.transformOrigin='50% 0%';$('ed').style.transform='perspective('+(U*150)+'px) rotateX('+(3-3*m)+'deg) scale('+(1+.05*(t-42.7)/5.9)+')'}
  // 7 — fechamento
  if(show('s7',48.3,57,.8,.1)>0){const b=48.55;
    globe($('g2'),W/2,H+${P ? 'W*1.28' : 'W*0.79'},${P ? 'W*1.45' : 'W*0.9'},58,-70+5*(t-48.3),.5*ez((t-48.3)/1.5));
    $('y0').style.opacity=ez((t-b)/.3);$('y0').style.transform='scale('+(.86+.14*eo((t-b)/.45))+')';$('y0').style.transformOrigin='32px 32px';
    $('y1').style.strokeDashoffset=1-ez((t-b-.2)/.5);$('y1').style.opacity=t>b+.2?1:0;$('y2').style.strokeDashoffset=1-ez((t-b-.6)/.3);$('y2').style.opacity=t>b+.6?1:0;
    const dv=cl((t-b-.85)/.4);$('y3').style.transform='scale('+(dv<=0?0:1+.25*Math.sin(dv*Math.PI)*(1-dv))+') ';$('y3').style.opacity=dv>0?1:0;
    const wv=ez((t-b-.3)/.9);$('wm').style.clipPath='inset(0 '+((1-wv)*100)+'% 0 0)';$('wm').style.opacity=wv>0?1:0;$('wm').style.transform='translateX('+((1-wv)*-1.2)+'vw)';
    flare('f7',b+.05,.5);rv('h7',b+1.3);inn('s7b',b+2.5,.6,.8);inn('s7h',b+2.9,.6,0);
    document.querySelectorAll('#s7 .pc').forEach((e,i)=>{const v=ez((t-b-3.3-i*.22)/.5);e.style.opacity=v;e.style.transform='translateY('+((1-v)*1.2)+'vh)'});inn('s7d',b+4.5,.6,1)}
  if(LB){const o=Math.max(1-ez((t-17.5)/.7),Math.min(ez((t-36.9)/.7),1-ez((t-42.6)/.7)));$('bt').style.transform='translateY('+(-100*(1-o))+'%)';$('bb').style.transform='translateY('+(100*(1-o))+'%)'}
  g.style.transform='translate('+(-(Math.floor(t*30)*37%190))+'px,'+(-(Math.floor(t*30)*53%190))+'px)';
  $('fade').style.opacity=Math.max(1-ez(t/.3),ez((t-55.1)/.9));
};
</script></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => { console.error('ERRO NA PÁGINA:', e.message); process.exitCode = 2; });
  const f = `${F}/work/film2_${fmt}.html`; fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  const loaded = await p.evaluate(() => [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family + (x.style === 'italic' ? ' it' : '')));
  if (!loaded.some((x) => x.startsWith('ISerif'))) console.error('AVISO: fonte Serif não carregou', loaded);
  if (process.argv[3]) {
    for (const t of process.argv[3].split(',')) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${F}/work/t2_${fmt}_${t}.jpg`, type: 'jpeg', quality: 96 }); }
    await b.close(); return;
  }
  const out = `${F}/work/video2_${fmt}.mp4`;
  const fm = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < T * FPS; i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!fm.stdin.write(buf)) await new Promise((r) => fm.stdin.once('drain', r));
  }
  fm.stdin.end(); await new Promise((r) => fm.on('close', r)); await b.close(); console.log('ok', out);
})().catch((e) => { console.error(e); process.exit(1); });

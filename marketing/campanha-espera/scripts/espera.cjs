// NexoProcess — Reel "A espera invisível" (9:16, 25,2 s, 30 qps). Renderização determinística quadro a quadro.
// Uso: node espera.cjs <A|B> [t1,t2,...]   A = gancho com números · B = gancho com pergunta
//      com tempos: só quadros de teste em work/; sem tempos: work/master_<var>.mp4
// Telas: capturas reais do app (exemplo fictício "Processamento de pedido"). Números mostrados = os da tela.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/campanha-espera`, A = `${R}/marketing/video/assets`;
const VAR = (process.argv[2] || 'A').toUpperCase(), Q = process.argv[3] === '4x5', TESTS = Q ? process.argv[4] : process.argv[3];
// Q = versão 4:5 (LinkedIn): mesmo filme, posições verticais refeitas para 1080×1350
const W = 1080, H = Q ? 1350 : 1920, T = 25.2, FPS = 30, u = W / 100, SUF = Q ? '_4x5' : '';
const Y = (v, q) => (Q ? q : v);
// botão final por plataforma (CTA=ig|yt|li): no LinkedIn e no YouTube não existe "link na bio"
const CTAK = process.env.CTA || 'ig', CTA = { ig: 'Conheça · link na bio', yt: 'Conheça · link no canal', li: 'Conheça o NexoProcess' }[CTAK], SUF2 = SUF + (CTAK === 'ig' ? '' : '_' + CTAK);
const FD = `${R}/node_modules/@fontsource`;
const ff = (dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const Wd = (h) => { let em = ''; return h.replace(/<(a|t)>|<\/(a|t)>|<br>|[^\s<]+/g, (m) => { if (m === '<a>') { em = 'a'; return ''; } if (m === '<t>') { em = 't'; return ''; } if (m === '</a>' || m === '</t>') { em = ''; return ''; } if (m === '<br>') return m; return `<span class="w${em ? ' ' + em : ''}">${m}</span>`; }); };
const img = (n) => `file://${A}/${n}`;
// ---------- recortes reais (coordenadas medidas na captura original)
const SRC = {
  map: { f: 'telas-4k/03b-mapa-macro-recorte.png', w: 2850, h: 1470 },
  cmp: { f: 'telas-4k/07-comparar-4k.png', w: 3840, h: 2160 },
  plan: { f: 'capturas-v2/plano-m.png', w: 1464, h: 1734 },
};
const PANEL = { map: [60, Y(580, 330), 960, 600], cmp: [60, Y(600, 330), 960, 430], plan: [60, Y(560, 250), 960, 700] };   // x, y, largura, altura
const HL = {   // destaques: [x, y, w, h] na captura, cor
  map: [[958, 438, 158, 48, 'a'], [1490, 438, 164, 48, 'a'], [1650, 438, 204, 48, 'a2']],
  cmp: [[955, 1605, 1700, 105, 't'], [955, 1762, 1700, 105, 'a'], [3405, 1610, 240, 50, 't2'], [3405, 1770, 240, 50, 't2']],
  plan: [[52, 528, 1360, 268, 'a']],
};
const panel = (k) => { const s = SRC[k]; return `<div class="pan" id="p_${k}"><div class="cam" id="c_${k}" style="width:${s.w}px;height:${s.h}px"><img src="${img(s.f)}"></div>${HL[k].map((h, i) => `<div class="hl ${h[4]}" id="h_${k}${i}"></div>`).join('')}</div>`; };
const TX = {
  A: { s1: '<div class="h m">Este pedido ficou</div><div class="h xl a" id="big">11 h</div><div class="h l">parado.</div>',
       s2: `<div class="h m">${Wd('E só')}</div><div class="h xl2 t">${Wd('2 h 15 min')}</div><div class="h l">${Wd('sendo trabalhado.')}</div>` },
  B: { s1: '<div class="h l">Quanto do seu<br>processo é</div><div class="h xl3 a">espera?</div>',
       s2: `<div class="h m">${Wd('Neste pedido:')}</div><div class="h l2 a">${Wd('11 h parado.')}</div><div class="h l2 t">${Wd('2 h 15 min trabalhando.')}</div>` },
}[VAR];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ff('ibm-plex-sans', 400)}${ff('ibm-plex-sans', 600)}${ff('ibm-plex-sans', 700)}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:#03060c;overflow:hidden}
body{--u:${u}px;font-family:Plex,sans-serif;color:#eef3fb;position:relative}
#bg,#vig,#flash,#fade{position:absolute;inset:0}
.sc{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0}
.blk{position:absolute;left:72px;right:150px}
.h{font-weight:700;letter-spacing:-.035em;line-height:1.02;text-shadow:0 6px 30px rgba(0,0,0,.5)}
.m{font-size:calc(var(--u)*6.4)}.l{font-size:calc(var(--u)*9)}.l2{font-size:calc(var(--u)*8.2);margin-top:12px}
.xl{font-size:calc(var(--u)*34);line-height:.9;letter-spacing:-.05em;margin:10px 0 6px -8px}
.xl2{font-size:calc(var(--u)*17);line-height:.95;letter-spacing:-.045em;margin:12px 0 10px -4px}
.xl3{font-size:calc(var(--u)*21);line-height:.95;letter-spacing:-.05em;margin-top:8px}
.a{color:#f5b84a}.t{color:#3fd0de}
.w{display:inline-block;opacity:0}
.lab{position:absolute;left:72px;font-size:calc(var(--u)*3.2);font-weight:600;color:#8ea1bd;letter-spacing:.01em}
#bars{position:absolute;left:72px;top:${Y(1190, 800)}px;width:860px}
.bar{position:relative;height:34px;border-radius:6px;margin-top:62px}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px}
#ba i{background:linear-gradient(90deg,#f5b84a,#f0a531);box-shadow:0 0 34px rgba(245,184,74,.35)}
#bt i{background:linear-gradient(90deg,#3fd0de,#00A8BC);box-shadow:0 0 34px rgba(63,208,222,.4)}
.bar b{position:absolute;left:0;top:-48px;font-size:calc(var(--u)*3.6);font-weight:600;white-space:nowrap;color:#dbe4f1}
.bar b span{font-weight:700}
.seg{position:absolute;top:0;height:34px;border-radius:6px;background:#f5b84a;opacity:0}
.pan{position:absolute;border-radius:24px;overflow:hidden;border:1.5px solid rgba(111,219,230,.5);background:#11151c;opacity:0;
  box-shadow:0 40px 90px rgba(0,0,0,.7),0 0 70px rgba(63,208,222,.12)}
.cam{position:absolute;left:0;top:0;transform-origin:0 0}
.cam img{display:block;width:100%;height:100%}
.hl{position:absolute;border-radius:12px;opacity:0;pointer-events:none}
.hl.a,.hl.a2{border:4px solid #f5b84a;box-shadow:0 0 0 9999px rgba(3,6,12,0),0 0 28px rgba(245,184,74,.75)}
.hl.t{border:4px solid #3fd0de;box-shadow:0 0 26px rgba(63,208,222,.7)}
.hl.t2{border:3px solid #3fd0de;border-radius:99px;box-shadow:0 0 22px rgba(63,208,222,.8)}
.ttl{position:absolute;left:72px;right:120px;top:${Y(300, 80)}px;font-weight:700;font-size:calc(var(--u)*8.4);letter-spacing:-.035em;line-height:1.04}
.cal{position:absolute;left:72px;right:150px;font-size:calc(var(--u)*4.7);line-height:1.25;font-weight:600;color:#dbe4f1}
.cal small{display:block;font-size:calc(var(--u)*3.2);font-weight:400;color:#8ea1bd;margin-top:14px}
.mini{position:absolute;left:72px;width:860px}
.mini .r{display:flex;align-items:center;gap:22px;margin-bottom:26px}
.mini .r i{height:26px;border-radius:5px;flex:none}
.mini .r span{font-size:calc(var(--u)*4.4);font-weight:700;white-space:nowrap}
.stmt{position:absolute;left:72px;right:130px;top:${Y(520, 200)}px}
.lock{position:absolute;left:72px;top:${Y(600, 300)}px;display:flex;align-items:center;gap:30px;font-weight:700;font-size:calc(var(--u)*11);letter-spacing:-.035em}
.lock svg{width:calc(var(--u)*15);height:auto;overflow:visible}
.pill{position:absolute;left:72px;top:${Y(1120, 820)}px;background:#3fd0de;color:#02161b;font-weight:700;font-size:calc(var(--u)*4.6);border-radius:99px;padding:22px 52px;opacity:0}
#grain{position:absolute;inset:-200px;opacity:.06;mix-blend-mode:overlay;pointer-events:none}
#vig{background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.6) 100%);pointer-events:none}
#flash{background:radial-gradient(ellipse at 50% 45%,rgba(191,246,251,.4),rgba(64,200,214,0) 65%);opacity:0;pointer-events:none}
#fade{background:#000;opacity:0;pointer-events:none}
</style></head><body>
<div id="bg"></div>
<div class="lab" id="tag" style="top:${Y(250, 60)}px">Exemplo fictício · calculado no NexoProcess</div>
<div class="sc" id="s1"><div class="blk" id="b1" style="top:${VAR === 'A' ? Y(470, 150) : Y(520, 170)}px">${TX.s1}</div></div>
<div class="sc" id="s2"><div class="blk" id="b2" style="top:${VAR === 'A' ? Y(470, 150) : Y(560, 200)}px">${TX.s2}</div></div>
<div class="sc" id="s3"><div class="blk" style="top:${Y(560, 200)}px"><div class="h l" id="q3" style="font-size:calc(var(--u)*11)">${Wd('Onde ele fica<br><a>parado?</a>')}</div></div></div>
<div id="bars"><div class="bar" id="ba"><b id="la">11 h · <span>espera</span></b><i id="fa"></i>${[0, 1, 2, 3].map((i) => `<div class="seg" id="sg${i}"></div>`).join('')}</div>
  <div class="bar" id="bt"><b id="lt">2 h 15 min · <span>trabalho</span></b><i id="ft"></i></div>
  <div class="lab" id="nota" style="position:relative;left:0;margin-top:34px">Por execução · exemplo fictício</div></div>
<div class="sc" id="s4"><div class="ttl" id="t4">${Wd('O mapa mostra<br>onde ele <a>trava.</a>')}</div>${panel('map')}
  <div class="cal" id="k4" style="top:${Y(1250, 990)}px">${Wd('Gargalo e retrabalho destacados no fluxo, com o motivo.')}</div></div>
<div class="sc" id="s5"><div class="ttl" id="t5">${Wd('Cada número<br>tem <t>origem.</t>')}</div>${panel('cmp')}
  <div class="mini" id="k5" style="top:${Y(1100, 820)}px"><div class="r" id="m0"><i style="width:600px;background:#f5b84a"></i><span class="a">11 h</span></div>
  <div class="r" id="m1"><i style="width:${Math.round(600 * 2.25 / 11)}px;background:#3fd0de"></i><span class="t">2 h 15 min</span></div>
  <div class="cal" style="position:relative;left:0;font-size:calc(var(--u)*3.9);margin-top:6px">Base: calculado a partir dos dados do processo.</div></div></div>
<div class="sc" id="s6"><div class="ttl" id="t6">${Wd('E vira <t>ação.</t>')}</div>${panel('plan')}
  <div class="cal" id="k6" style="top:${Y(1310, 1010)}px">${Wd('Com problema, responsável e prazo.')}</div></div>
<div class="sc" id="s7"><div class="stmt"><div class="h" id="q7a" style="font-size:calc(var(--u)*9.6)">${Wd('Às vezes,<br>o problema não<br>é o trabalho.')}</div>
  <div class="h a" id="q7b" style="font-size:calc(var(--u)*16.5);margin-top:70px;letter-spacing:-.05em">${Wd('É a espera.')}</div></div></div>
<div class="sc" id="s8"><div class="lock"><svg viewBox="0 0 64 64"><rect id="y0" x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle id="y1" cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 17 32)"/><path id="y2" d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path id="y3" d="M41 21l11 11-11 11-11-11z" fill="#00A8BC" style="transform-origin:41px 32px"/></svg><span id="wm">NexoProcess</span></div>
  <div class="cal" id="k8" style="top:${Y(860, 560)}px;font-size:calc(var(--u)*5.6);font-weight:700;color:#eef3fb;letter-spacing:-.02em;line-height:1.12">${Wd('Descubra onde<br>o seu processo <a>espera.</a>')}</div>
  <div class="pill" id="cta">${CTA}</div>
  <div class="lab" id="f8" style="top:${Y(1300, 990)}px;opacity:0">Telas reais do app · dados fictícios</div></div>
<canvas id="grain"></canvas><div id="vig"></div><div id="flash"></div><div id="fade"></div>
<script>
const $=(i)=>document.getElementById(i), cl=(x)=>Math.max(0,Math.min(1,x)), ez=(x)=>{x=cl(x);return x*x*(3-2*x)}, eo=(x)=>{x=cl(x);return 1-Math.pow(1-x,3)}, mix=(a,b,k)=>a+(b-a)*k;
const SRC=${JSON.stringify(SRC)}, PANEL=${JSON.stringify(PANEL)}, HL=${JSON.stringify(HL)}, VAR='${VAR}';
const g=$('grain'); g.width=${W / 2 + 200}; g.height=${H / 2 + 200}; g.style.width=(g.width*2)+'px'; g.style.height=(g.height*2)+'px';
{const c=g.getContext('2d'),d=c.createImageData(g.width,g.height);let s=7;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}
for(const k in PANEL){const [x,y,w,h]=PANEL[k],p=$('p_'+k);p.style.left=x+'px';p.style.top=y+'px';p.style.width=w+'px';p.style.height=h+'px'}
const WC={};
const rv=(id,t0,per=.07,dur=.42)=>{(WC[id]||(WC[id]=[...$(id).querySelectorAll('.w')])).forEach((w,i)=>{const v=ez((t-0-t0-i*per)/dur);w.style.opacity=v;w.style.filter=v<1?'blur('+((1-v)*8)+'px)':'none';w.style.transform='translateY('+((1-v)*.2)+'em)'})};
let t=0;
const vis=(a,b,fi=.35,fo=.3)=>Math.min(ez((t-a)/fi),ez((b-t)/fo));
// câmera: vista (x, y, largura) em pixels da captura
function cam(k,vx,vy,vw,hl){const [px,py,pw,ph]=PANEL[k],s=pw/vw;$('c_'+k).style.transform='translate('+(-vx*s)+'px,'+(-vy*s)+'px) scale('+s+')';
  HL[k].forEach((h,i)=>{const e=$('h_'+k+i),pad=10;e.style.left=((h[0]-vx)*s-pad)+'px';e.style.top=((h[1]-vy)*s-pad)+'px';e.style.width=(h[2]*s+2*pad)+'px';e.style.height=(h[3]*s+2*pad)+'px';e.style.opacity=hl[i]||0})}
const panelIn=(k,a,b)=>{const p=$('p_'+k),e=eo((t-a)/.55),x=ez((t-b+.3)/.3);p.style.opacity=Math.min(ez((t-a)/.35),1-x);
  p.style.transform='translateY('+(60*(1-e)-30*x)+'px) scale('+(.95+.05*e)+')';p.style.filter=e<1?'blur('+((1-e)*6)+'px)':'none'};
const pulse=(t0)=>t<t0?0:Math.min(1,(t-t0)/.18)*(.75+.25*Math.cos((t-t0)*7));
window.render=async(tt)=>{t=tt;
  $('bg').style.background='radial-gradient(circle at '+(30+10*Math.sin(t*.12))+'% '+(28+6*Math.cos(t*.1))+'%,rgba(23,50,99,.55),rgba(3,6,12,0) 50%),radial-gradient(circle at '+(75+8*Math.cos(t*.09))+'% '+(78+6*Math.sin(t*.13))+'%,rgba(0,168,188,.12),rgba(3,6,12,0) 44%),#03060c';
  $('tag').style.opacity=Math.min(1,ez((7.0-t)/.3))*.95;
  // ---- S1 gancho (texto visível desde o 1º quadro)
  {const v=Math.min(1,ez((2.42-t)/.22));$('s1').style.opacity=v;$('b1').style.transform='scale('+(1.035-.035*eo(t/.7))+') translateY('+(-24*(1-v))+'px)';$('b1').style.transformOrigin='0 50%'}
  // ---- barras (S1–S3)
  const bv=Math.min(1,ez((7.15-t)/.35));$('bars').style.opacity=bv;
  {const st=Math.min(4,Math.floor(t/.6)+1),fr=ez(((t%.6))/.14),w=t>=2.4?1:((st-1)+fr)/4;$('fa').style.width=(860*w)+'px'}
  $('la').style.opacity=VAR==='A'?ez((t-2.5)/.3):ez((t-2.5)/.3);
  $('ft').style.width=(860*2.25/11*eo((t-2.95)/.5))+'px';$('lt').style.opacity=ez((t-3.1)/.3);$('bt').style.opacity=ez((t-2.8)/.2);
  $('nota').style.opacity=ez((t-3.4)/.4);
  // segmentos: a espera se parte e sobe para o mapa
  {const k=ez((t-6.3)/.75);for(let i=0;i<4;i++){const e=$('sg'+i);e.style.left=(i*215+4)+'px';e.style.width='207px';e.style.opacity=t>6.2?1:0;
    e.style.transform='translate('+(k*((i-1.5)*40))+'px,'+(-k*(560+i*30))+'px) scaleY('+(1-.4*k)+')';e.style.opacity=t>6.2?(1-ez((t-6.75)/.35)):0}
   $('fa').style.opacity=t>6.2?0:1}
  // ---- S2
  if(($('s2').style.opacity=vis(2.42,5.38,.15,.3))>0){rv('b2',2.45,.09,.38)}
  // ---- S3 pergunta
  if(($('s3').style.opacity=vis(5.45,7.12,.2,.25))>0){rv('q3',5.5,.08,.38)}
  // ---- S4 mapa
  if(($('s4').style.opacity=vis(7.15,11.4,.25,.3))>0){rv('t4',7.2,.07,.4);panelIn('map',7.3,11.5);
    const z=ez((t-8.3)/1.8);cam('map',mix(360,860,z),mix(300,300,z),mix(1660,1150,z),[pulse(8.1),pulse(8.75),pulse(8.75)]);rv('k4',9.0,.05,.4)}
  // ---- S5 comparação
  if(($('s5').style.opacity=vis(11.4,15.0,.25,.3))>0){rv('t5',11.45,.07,.4);panelIn('cmp',11.55,15.1);
    const z=ez((t-13.6)/1.3);cam('cmp',mix(880,900,z),mix(1000,1330,z),mix(2840,2000,z),[pulse(12.15),pulse(12.75),pulse(13.35)*(1-z),pulse(13.35)*(1-z)]);
    $('m0').style.opacity=ez((t-12.75)/.3);$('m1').style.opacity=ez((t-12.15)/.3);$('k5').style.opacity=1;
    $('m0').firstChild.style.transform='scaleX('+eo((t-12.75)/.45)+')';$('m0').firstChild.style.transformOrigin='0 50%';
    $('m1').firstChild.style.transform='scaleX('+eo((t-12.15)/.45)+')';$('m1').firstChild.style.transformOrigin='0 50%';
    $('k5').lastElementChild.style.opacity=ez((t-13.4)/.4)}
  // ---- S6 plano
  if(($('s6').style.opacity=vis(15.0,18.6,.25,.3))>0){rv('t6',15.05,.08,.4);panelIn('plan',15.15,18.7);
    const z=ez((t-15.5)/1.6);cam('plan',0,mix(0,380,z),1464,[pulse(16.3)]);rv('k6',16.5,.05,.4)}
  // ---- S7 afirmação
  if(($('s7').style.opacity=vis(18.65,21.55,.25,.3))>0){rv('q7a',18.75,.12,.45);rv('q7b',20.4,.1,.3);
    $('q7a').style.opacity=t>20.4?mix(1,.42,ez((t-20.4)/.4)):1}
  // ---- S8 marca
  if(($('s8').style.opacity=vis(21.6,40,.25,.1))>0){const b=21.7;
    $('y0').style.opacity=ez((t-b)/.3);$('y0').style.transformOrigin='32px 32px';$('y0').style.transform='scale('+(.86+.14*eo((t-b)/.45))+')';
    $('y1').style.strokeDashoffset=1-ez((t-b-.2)/.5);$('y1').style.opacity=t>b+.2?1:0;$('y2').style.strokeDashoffset=1-ez((t-b-.55)/.3);$('y2').style.opacity=t>b+.55?1:0;
    const dv=cl((t-b-.8)/.4);$('y3').style.transform='scale('+(dv<=0?0:1+.25*Math.sin(dv*Math.PI)*(1-dv))+')';$('y3').style.opacity=dv>0?1:0;
    const wv=ez((t-b-.3)/.8);$('wm').style.clipPath='inset(0 '+((1-wv)*100)+'% 0 0)';
    rv('k8',b+1.0,.07,.4);const c=ez((t-b-1.9)/.45);$('cta').style.opacity=c;$('cta').style.transform='translateY('+((1-c)*20)+'px)';$('f8').style.opacity=ez((t-b-2.3)/.4)*.95}
  $('flash').style.opacity=.55*Math.exp(-Math.abs(t-7.2)*10)+.7*Math.exp(-Math.abs(t-20.42)*12)+.45*Math.exp(-Math.abs(t-21.7)*10);
  g.style.transform='translate('+(-(Math.floor(t*30)*37%190))+'px,'+(-(Math.floor(t*30)*53%190))+'px)';
  $('fade').style.opacity=0;
};
</script></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => { console.error('ERRO NA PÁGINA:', e.message); process.exitCode = 2; });
  const f = `${F}/work/espera_${VAR}${SUF2}.html`; fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => 0))); }); await p.waitForTimeout(800);
  if (TESTS) {
    for (const t of TESTS.split(',')) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${F}/work/t_${VAR}${SUF2}_${t}.jpg`, type: 'jpeg', quality: 92 }); }
    await b.close(); return;
  }
  const out = `${F}/work/master_${VAR}${SUF2}.mp4`;
  const fm = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < Math.round(T * FPS); i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 96 });
    if (!fm.stdin.write(buf)) await new Promise((r) => fm.stdin.once('drain', r));
  }
  fm.stdin.end(); await new Promise((r) => fm.on('close', r)); await b.close(); console.log('ok', out);
})().catch((e) => { console.error(e); process.exit(1); });

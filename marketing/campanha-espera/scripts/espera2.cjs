// NexoProcess — Reel "A espera invisível" v2 (com pessoa). 25,2 s, 30 qps. Renderização determinística.
// Uso: [CTA=ig|yt|li] node espera2.cjs [4x5] [t1,t2,...]
//   sem "4x5": 1080×1920 (Instagram/YouTube) · com "4x5": 1080×1350 (LinkedIn)
// Fontes: clipes gerados pelo titular no Google AI Studio (fontes/*.mp4, 640×360, ampliados em work/clip_*)
//         + capturas reais do app (marketing/video/assets). Números = os da tela do exemplo fictício.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/campanha-espera`, A = `${R}/marketing/video/assets`;
const Q = process.argv[2] === '4x5', TESTS = Q ? process.argv[3] : process.argv[2];
const W = 1080, H = Q ? 1350 : 1920, T = 25.2, FPS = 30, u = W / 100;
const Y = (v, q) => (Q ? q : v), S = Q ? 0.8 : 1;   // S: escala de texto no 4:5
const CTAK = process.env.CTA || 'ig', CTA = { ig: 'Conheça · link na bio', yt: 'Conheça · link no canal', li: 'Conheça o NexoProcess' }[CTAK];
const SUF = (Q ? '_4x5' : '') + (CTAK === 'ig' ? '' : '_' + CTAK);
const FD = `${R}/node_modules/@fontsource`;
const ff = (dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const Wd = (h) => { let em = ''; return h.replace(/<(a|t)>|<\/(a|t)>|<br>|[^\s<]+/g, (m) => { if (m === '<a>') { em = 'a'; return ''; } if (m === '<t>') { em = 't'; return ''; } if (m === '</a>' || m === '</t>') { em = ''; return ''; } if (m === '<br>') return m; return `<span class="w${em ? ' ' + em : ''}">${m}</span>`; }); };
const img = (n) => `file://${A}/${n}`;
const BAND = Y(640, 380), BH = 608;            // faixa de cinema com o clipe (largura total)
const SRC = { map: { f: 'telas-4k/03b-mapa-macro-recorte.png', w: 2850, h: 1470 }, plan: { f: 'capturas-v2/plano-m.png', w: 1464, h: 1734 } };
const PANEL = { map: [60, Y(580, 330), 960, 600], plan: [60, Y(560, 250), 960, 700] };
const HL = { map: [[958, 438, 158, 48, 'a'], [1490, 438, 164, 48, 'a'], [1650, 438, 204, 48, 'a2']], plan: [[52, 528, 1360, 268, 'a']] };
const panel = (k) => { const s = SRC[k]; return `<div class="pan" id="p_${k}"><div class="cam" id="c_${k}" style="width:${s.w}px;height:${s.h}px"><img src="${img(s.f)}"></div>${HL[k].map((h, i) => `<div class="hl ${h[4]}" id="h_${k}${i}"></div>`).join('')}</div>`; };
const fs_ = (x) => `font-size:${(x * S).toFixed(1)}px`;
const TOP = Y(262, 92);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ff('ibm-plex-sans', 400)}${ff('ibm-plex-sans', 600)}${ff('ibm-plex-sans', 700)}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:#03060c;overflow:hidden}
body{--u:${u}px;font-family:Plex,sans-serif;color:#eef3fb;position:relative}
#bg,#vig,#flash{position:absolute;inset:0}
#cb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(38px) brightness(.3) saturate(1.25);transform:scale(1.18);opacity:0}
#band{position:absolute;left:0;top:${BAND}px;width:${W}px;height:${BH}px;overflow:hidden;opacity:0;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 9%,#000 91%,transparent 100%)}
#cf{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 45%}
#scrim{position:absolute;inset:0;background:rgba(3,6,12,.0)}
.sc{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0}
.blk{position:absolute;left:72px;right:130px;top:${TOP}px}
.h{font-weight:700;letter-spacing:-.035em;line-height:1.02;text-shadow:0 6px 30px rgba(0,0,0,.6)}
.a{color:#f5b84a}.t{color:#3fd0de}
.w{display:inline-block;opacity:0}
.lab{position:absolute;left:72px;font-size:${34 * S}px;font-weight:600;color:#8ea1bd;letter-spacing:.01em}
#bars{position:absolute;left:72px;top:${BAND + BH + Y(44, 30)}px;width:860px;opacity:0}
.bar{position:relative;height:${Y(26, 22)}px;margin-top:${Y(52, 44)}px}
.bar:first-child{margin-top:${Y(44, 38)}px}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
#ba i{background:linear-gradient(90deg,#f5b84a,#f0a531);box-shadow:0 0 30px rgba(245,184,74,.35)}
#bt i{background:linear-gradient(90deg,#3fd0de,#00A8BC);box-shadow:0 0 30px rgba(63,208,222,.4)}
.bar b{position:absolute;left:0;top:${Y(-44, -38)}px;font-size:${34 * S}px;font-weight:600;white-space:nowrap;color:#dbe4f1}
.pan{position:absolute;border-radius:24px;overflow:hidden;border:1.5px solid rgba(111,219,230,.5);background:#11151c;opacity:0;box-shadow:0 40px 90px rgba(0,0,0,.7),0 0 70px rgba(63,208,222,.12)}
.cam{position:absolute;left:0;top:0;transform-origin:0 0}.cam img{display:block;width:100%;height:100%}
.hl{position:absolute;border-radius:12px;opacity:0;pointer-events:none;border:4px solid #f5b84a;box-shadow:0 0 28px rgba(245,184,74,.75)}
.ttl{position:absolute;left:72px;right:120px;top:${Y(300, 80)}px;font-weight:700;font-size:calc(var(--u)*8.4);letter-spacing:-.035em;line-height:1.04}
.cal{position:absolute;left:72px;right:150px;font-size:calc(var(--u)*4.7);line-height:1.25;font-weight:600;color:#dbe4f1}
#esp{position:absolute;left:0;right:0;top:${BAND + BH / 2 - 95 * S}px;text-align:center;${fs_(172)};font-weight:700;letter-spacing:-.05em;color:#f5b84a;text-shadow:0 10px 60px rgba(0,0,0,.9),0 0 50px rgba(245,184,74,.25)}
.lock{position:absolute;left:72px;top:${Y(600, 300)}px;display:flex;align-items:center;gap:30px;font-weight:700;font-size:calc(var(--u)*11);letter-spacing:-.035em}
.lock svg{width:calc(var(--u)*15);height:auto;overflow:visible}
.pill{position:absolute;left:72px;top:${Y(1120, 820)}px;background:#3fd0de;color:#02161b;font-weight:700;font-size:calc(var(--u)*4.6);border-radius:99px;padding:22px 52px;opacity:0}
#grain{position:absolute;inset:-200px;opacity:.07;mix-blend-mode:overlay;pointer-events:none}
#vig{background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.62) 100%);pointer-events:none}
#flash{background:radial-gradient(ellipse at 50% 45%,rgba(191,246,251,.42),rgba(64,200,214,0) 65%);opacity:0;pointer-events:none}
</style></head><body>
<div id="bg"></div><img id="cb"><div id="band"><img id="cf"><div id="scrim"></div></div>
<div class="lab" id="tag" style="top:${Y(206, 40)}px">Exemplo fictício · calculado no NexoProcess</div>
<div class="sc" id="s1"><div class="blk" id="b1"><div class="h" style="${fs_(69)}">Este pedido ficou</div>
  <div class="h" style="margin-top:6px;white-space:nowrap"><span class="a" style="${fs_(220)};letter-spacing:-.05em;line-height:.92">11 h</span><span style="${fs_(100)};margin-left:.32em">parado.</span></div></div></div>
<div class="sc" id="s2"><div class="blk" id="b2"><div class="h" style="${fs_(69)}">${Wd('E só')}</div><div class="h t" style="${fs_(150)};letter-spacing:-.045em;margin:6px 0 4px">${Wd('2 h 15 min')}</div><div class="h" style="${fs_(84)}">${Wd('sendo trabalhado.')}</div></div></div>
<div class="sc" id="s3"><div class="blk"><div class="h" id="q3" style="${fs_(112)}">${Wd('Onde ele fica<br><a>parado?</a>')}</div></div></div>
<div class="sc" id="s3b"><div class="blk"><div class="h" id="q3b" style="${fs_(100)}">${Wd('O NexoProcess<br><t>mostra.</t>')}</div></div></div>
<div id="bars"><div class="bar" id="ba"><b>11 h · espera</b><i id="fa"></i></div><div class="bar" id="bt"><b>2 h 15 min · trabalho</b><i id="ft"></i></div></div>
<div class="sc" id="s4"><div class="ttl" id="t4">${Wd('O mapa mostra<br>onde ele <a>trava.</a>')}</div>${panel('map')}
  <div class="cal" id="k4" style="top:${Y(1250, 990)}px">${Wd('Gargalo e retrabalho destacados no fluxo, com o motivo.')}</div></div>
<div class="sc" id="s6"><div class="ttl" id="t6">${Wd('E vira <t>ação.</t>')}</div>${panel('plan')}
  <div class="cal" id="k6" style="top:${Y(1310, 1010)}px">${Wd('Com problema, responsável e prazo.')}</div></div>
<div class="sc" id="s7"><div class="blk"><div class="h" id="q7a" style="${fs_(92)}">${Wd('Às vezes, o problema<br>não é o trabalho.')}</div></div><div id="esp">${Wd('É a espera.')}</div></div>
<div class="sc" id="s8"><div class="lock"><svg viewBox="0 0 64 64"><rect id="y0" x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle id="y1" cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 17 32)"/><path id="y2" d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path id="y3" d="M41 21l11 11-11 11-11-11z" fill="#00A8BC" style="transform-origin:41px 32px"/></svg><span id="wm">NexoProcess</span></div>
  <div class="cal" id="k8" style="top:${Y(860, 560)}px;font-size:calc(var(--u)*5.6);font-weight:700;color:#eef3fb;letter-spacing:-.02em;line-height:1.12">${Wd('Descubra onde<br>o seu processo <a>espera.</a>')}</div>
  <div class="pill" id="cta">${CTA}</div>
  <div class="lab" id="f8" style="top:${Y(1300, 990)}px;opacity:0">Telas reais do app · dados fictícios</div></div>
<canvas id="grain"></canvas><div id="vig"></div><div id="flash"></div>
<script>
const $=(i)=>document.getElementById(i), cl=(x)=>Math.max(0,Math.min(1,x)), ez=(x)=>{x=cl(x);return x*x*(3-2*x)}, eo=(x)=>{x=cl(x);return 1-Math.pow(1-x,3)}, mix=(a,b,k)=>a+(b-a)*k;
const SRC=${JSON.stringify(SRC)}, PANEL=${JSON.stringify(PANEL)}, HL=${JSON.stringify(HL)}, CLIP='file://${F}/work/clip_';
const g=$('grain'); g.width=${W / 2 + 200}; g.height=${H / 2 + 200}; g.style.width=(g.width*2)+'px'; g.style.height=(g.height*2)+'px';
{const c=g.getContext('2d'),d=c.createImageData(g.width,g.height);let s=7;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}
for(const k in PANEL){const [x,y,w,h]=PANEL[k],p=$('p_'+k);p.style.left=x+'px';p.style.top=y+'px';p.style.width=w+'px';p.style.height=h+'px'}
const WC={};
const rv=(id,t0,per=.07,dur=.42)=>{(WC[id]||(WC[id]=[...$(id).querySelectorAll('.w')])).forEach((w,i)=>{const v=ez((t-t0-i*per)/dur);w.style.opacity=v;w.style.filter=v<1?'blur('+((1-v)*8)+'px)':'none';w.style.transform='translateY('+((1-v)*.2)+'em)'})};
let t=0;
const vis=(a,b,fi=.35,fo=.3)=>Math.min(ez((t-a)/fi),ez((b-t)/fo));
function cam(k,vx,vy,vw,hl){const [px,py,pw,ph]=PANEL[k],s=pw/vw;$('c_'+k).style.transform='translate('+(-vx*s)+'px,'+(-vy*s)+'px) scale('+s+')';
  HL[k].forEach((h,i)=>{const e=$('h_'+k+i),pad=10;e.style.left=((h[0]-vx)*s-pad)+'px';e.style.top=((h[1]-vy)*s-pad)+'px';e.style.width=(h[2]*s+2*pad)+'px';e.style.height=(h[3]*s+2*pad)+'px';e.style.opacity=hl[i]||0})}
const panelIn=(k,a,b)=>{const p=$('p_'+k),e=eo((t-a)/.55),x=ez((t-b+.3)/.3);p.style.opacity=Math.min(ez((t-a)/.35),1-x);
  p.style.transform='translateY('+(60*(1-e)-30*x)+'px) scale('+(.95+.05*e)+')';p.style.filter=e<1?'blur('+((1-e)*6)+'px)':'none'};
const pulse=(t0)=>t<t0?0:Math.min(1,(t-t0)/.18)*(.75+.25*Math.cos((t-t0)*7));
// linha do tempo dos clipes: [início, fim, clipe, tempo no clipe no início, velocidade, zoom inicial, zoom final]
const SEG=[[0,3,'A',0,1,1.0,1.06],[3,5.4,'A',6.6,1,1.0,1.04],[5.4,7.8,'B',0.4,1,1.04,1.0],[7.8,9.6,'B',5.9,1.15,1.0,1.03],
  [17.4,21.0,'A',0.6,.85,1.02,1.12],[21.0,25.2,'B',8.0,.45,1.0,1.04]];
const FREEZE=19.8;
let last='';
async function clipAt(){
  const s=SEG.find(q=>t>=q[0]&&t<q[1]); if(!s){$('band').style.opacity=0;$('cb').style.opacity=0;return}
  const tt=s[0]===17.4?Math.min(t,FREEZE):t;
  const ct=s[3]+(tt-s[0])*s[4], idx=Math.min(240,Math.max(1,Math.floor(ct*24)+1));
  const src=CLIP+s[2]+'/f_'+String(idx).padStart(4,'0')+'.jpg';
  if(src!==last){$('cf').src=src;$('cb').src=src;last=src;await Promise.all([$('cf').decode(),$('cb').decode()])}
  const k=(tt-s[0])/(s[1]-s[0]);$('cf').style.transform='scale('+mix(s[5],s[6],k)+')';
  let op=1;if(s[0]===21.0)op=1-ez((t-21.9)/.45);if(s[0]===0)op=1;
  $('band').style.opacity=op;$('cb').style.opacity=op;
  const fz=s[0]===17.4?ez((t-FREEZE)/.35):0;
  $('cf').style.filter='grayscale('+(.9*fz)+') brightness('+(1-.45*fz)+') contrast('+(1+.1*fz)+')';
  $('scrim').style.background='rgba(3,6,12,'+(s[0]===17.4?.18+.25*fz:0)+')';
}
window.render=async(tt)=>{t=tt;
  $('bg').style.background='radial-gradient(circle at '+(30+10*Math.sin(t*.12))+'% '+(28+6*Math.cos(t*.1))+'%,rgba(23,50,99,.55),rgba(3,6,12,0) 50%),radial-gradient(circle at '+(75+8*Math.cos(t*.09))+'% '+(78+6*Math.sin(t*.13))+'%,rgba(0,168,188,.12),rgba(3,6,12,0) 44%),#03060c';
  await clipAt();
  $('tag').style.opacity=Math.min(1,ez((9.45-t)/.25))*.95;
  // gancho: visível desde o 1º quadro
  {const v=Math.min(1,ez((3.0-t)/.18));$('s1').style.opacity=v;$('b1').style.transformOrigin='0 50%';$('b1').style.transform='scale('+(1.03-.03*eo(t/.7))+')'}
  // barras: a espera cresce a cada batida do relógio; o trabalho entra depois
  $('bars').style.opacity=Math.min(1,ez((7.75-t)/.3));
  {const st=Math.min(4,Math.floor(t/.6)+1),fr=ez(((t%.6))/.14),w=t>=2.4?1:((st-1)+fr)/4;$('fa').style.width=(860*w)+'px'}
  $('ba').firstChild.style.opacity=ez((t-2.5)/.3);
  $('ft').style.width=(860*2.25/11*eo((t-3.3)/.5))+'px';$('bt').style.opacity=ez((t-3.2)/.2);
  if(($('s2').style.opacity=vis(3.02,5.38,.12,.25))>0)rv('b2',3.05,.09,.36);
  if(($('s3').style.opacity=vis(5.42,7.75,.15,.25))>0)rv('q3',5.45,.08,.38);
  if(($('s3b').style.opacity=vis(7.82,9.5,.15,.2))>0)rv('q3b',7.85,.1,.38);
  // mapa real
  if(($('s4').style.opacity=vis(9.55,13.8,.25,.3))>0){rv('t4',9.6,.07,.4);panelIn('map',9.7,13.9);
    const z=ez((t-10.7)/1.8);cam('map',mix(360,860,z),300,mix(1660,1150,z),[pulse(10.5),pulse(11.15),pulse(11.15)]);rv('k4',11.4,.05,.4)}
  // plano real
  if(($('s6').style.opacity=vis(13.8,17.4,.25,.3))>0){rv('t6',13.85,.08,.4);panelIn('plan',13.95,17.5);
    const z=ez((t-14.3)/1.6);cam('plan',0,mix(0,380,z),1464,[pulse(15.1)]);rv('k6',15.3,.05,.4)}
  // o gestor; o tempo congela em 19,8 s
  if(($('s7').style.opacity=vis(17.45,21.0,.25,.3))>0){rv('q7a',17.55,.11,.42);rv('esp',${'FREEZE'},.12,.28);
    $('q7a').style.opacity=t>FREEZE?mix(1,.45,ez((t-FREEZE)/.4)):1}
  // marca
  if(($('s8').style.opacity=vis(21.9,40,.3,.1))>0){const b=22.0;
    $('y0').style.opacity=ez((t-b)/.3);$('y0').style.transformOrigin='32px 32px';$('y0').style.transform='scale('+(.86+.14*eo((t-b)/.45))+')';
    $('y1').style.strokeDashoffset=1-ez((t-b-.2)/.5);$('y1').style.opacity=t>b+.2?1:0;$('y2').style.strokeDashoffset=1-ez((t-b-.55)/.3);$('y2').style.opacity=t>b+.55?1:0;
    const dv=cl((t-b-.8)/.4);$('y3').style.transform='scale('+(dv<=0?0:1+.25*Math.sin(dv*Math.PI)*(1-dv))+')';$('y3').style.opacity=dv>0?1:0;
    const wv=ez((t-b-.3)/.8);$('wm').style.clipPath='inset(0 '+((1-wv)*100)+'% 0 0)';
    rv('k8',b+1.0,.07,.4);const c=ez((t-b-1.8)/.45);$('cta').style.opacity=c;$('cta').style.transform='translateY('+((1-c)*20)+'px)';$('f8').style.opacity=ez((t-b-2.2)/.4)*.95}
  $('flash').style.opacity=.6*Math.exp(-Math.abs(t-9.6)*10)+.75*Math.exp(-Math.abs(t-FREEZE-.02)*12)+.4*Math.exp(-Math.abs(t-22.0)*10);
  g.style.transform='translate('+(-(Math.floor(t*30)*37%190))+'px,'+(-(Math.floor(t*30)*53%190))+'px)';
};
</script></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => { console.error('ERRO NA PÁGINA:', e.message); process.exitCode = 2; });
  const f = `${F}/work/espera2${SUF}.html`; fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => i.src).map((i) => i.decode().catch(() => 0))); }); await p.waitForTimeout(800);
  if (TESTS) {
    for (const t of TESTS.split(',')) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${F}/work/v2${SUF}_${t}.jpg`, type: 'jpeg', quality: 92 }); }
    await b.close(); return;
  }
  const out = `${F}/work/master_v2${SUF}.mp4`;
  const fm = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < Math.round(T * FPS); i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 96 });
    if (!fm.stdin.write(buf)) await new Promise((r) => fm.stdin.once('drain', r));
  }
  fm.stdin.end(); await new Promise((r) => fm.on('close', r)); await b.close(); console.log('ok', out);
})().catch((e) => { console.error(e); process.exit(1); });

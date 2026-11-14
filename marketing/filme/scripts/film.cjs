// "A história do NexoProcess" — filme de 45 s renderizado quadro a quadro (HTML determinístico → FFmpeg).
// Uso: node film.cjs <16x9|9x16|4x5> [t_unico_para_teste.png]
// Todo conteúdo é real: datas e commits do git, telas do app (demonstração fictícia), gravação original do Google, arquivo en.ts.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/filme`, A = `${R}/marketing/video/assets`;
const FMT = { '16x9': [1920, 1080], '9x16': [1080, 1920], '4x5': [1080, 1350] };
const fmt = process.argv[2]; const [W, H] = FMT[fmt]; const T = 45, FPS = 30;
const FD = `${R}/node_modules/@fontsource`;
const ff = (fam, dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:${fam};font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const SYM = fs.readFileSync(`${A}/marca/nexoprocess-simbolo.svg`, 'utf8');
const LOG = fs.readFileSync(`${F}/work/gitlog.txt`, 'utf8').trim().split('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const P = W < H; // retrato
const card = P ? 'm' : 'd';
const html = `<html><head><meta charset="utf-8"><style>
${ff('Plex', 'ibm-plex-sans', 400)}${ff('Plex', 'ibm-plex-sans', 600)}${ff('Plex', 'ibm-plex-sans', 700)}${ff('Mono', 'ibm-plex-mono', 400)}${ff('Mono', 'ibm-plex-mono', 500)}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#05080f;overflow:hidden}
body{--u:${Math.min(W, H) / 100}px;font-family:Plex,sans-serif;color:#eef3fb;position:relative}
.sc{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${P ? '15% 7% 21%' : '7% 8%'}}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sh{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(5,8,15,.25) 0%,rgba(5,8,15,.86) 100%)}
.lab{font-family:Mono;font-weight:500;font-size:calc(var(--u)*2.1);letter-spacing:.28em;color:#40c8d6;margin-bottom:calc(var(--u)*3);position:relative}
.h{font-weight:700;font-size:calc(var(--u)*${P ? 8.2 : 7});line-height:1.06;letter-spacing:-.02em;position:relative;text-wrap:balance;max-width:${P ? '100%' : '78%'}}
.h em{font-style:normal;color:#40c8d6}
.s{font-weight:400;font-size:calc(var(--u)*${P ? 3.9 : 3.2});line-height:1.35;color:#b9c6da;margin-top:calc(var(--u)*2.6);position:relative;text-wrap:balance;max-width:${P ? '100%' : '70%'}}
.mono{font-family:Mono;font-weight:500}
#date{font-family:Mono;font-size:calc(var(--u)*${P ? 9 : 8});letter-spacing:.06em;color:#40c8d6}
#cur{display:inline-block;width:.55em;height:1em;background:#40c8d6;vertical-align:-.12em;margin-left:.08em}
.term{position:relative;width:100%;max-width:calc(var(--u)*${P ? 92 : 120});margin-top:calc(var(--u)*4);background:rgba(8,13,24,.82);border:1px solid #223049;border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*2.4);text-align:left;font-family:Mono;font-size:calc(var(--u)*${P ? 2.05 : 1.75});line-height:1.75;height:calc(var(--u)*${P ? 58 : 36});overflow:hidden}
.term div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c9d4e8}.term b{color:#f5c66a;font-weight:500}
.shot{position:relative;width:${P ? '100%' : '74%'};height:${P ? '52%' : '62%'};border-radius:calc(var(--u)*2);overflow:hidden;border:1px solid rgba(64,200,214,.45);box-shadow:0 calc(var(--u)*3) calc(var(--u)*8) rgba(0,0,0,.6);background:#11151c;margin-top:calc(var(--u)*3.5)}
.shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.selo{position:relative;margin-top:calc(var(--u)*2.4);font-size:calc(var(--u)*1.9);font-weight:600;color:#f5c66a;border:1px solid rgba(245,198,106,.5);border-radius:99px;padding:.45em 1.1em}
.row{position:relative;display:flex;flex-direction:${P ? 'column' : 'row'};align-items:center;gap:calc(var(--u)*${P ? 4 : 9});width:100%;justify-content:center}
.phone{height:calc(var(--u)*${P ? 88 : 74});${P ? 'max-height:52vh;' : ''}aspect-ratio:660/1434;border-radius:calc(var(--u)*5);border:calc(var(--u)*.9) solid #1b2130;outline:1px solid #46506a;overflow:hidden;box-shadow:0 calc(var(--u)*3) calc(var(--u)*9) rgba(0,0,0,.7);flex:none}
.phone img{width:100%;height:100%;display:block}
.txt{display:flex;flex-direction:column;align-items:${P ? 'center' : 'flex-start'};text-align:${P ? 'center' : 'left'};max-width:${P ? '100%' : '46%'}}
.ed{position:relative;width:${P ? '100%' : '58%'};margin-top:calc(var(--u)*3.5);border-radius:calc(var(--u)*1.6);overflow:hidden;box-shadow:0 calc(var(--u)*3) calc(var(--u)*9) rgba(0,0,0,.7);${P ? 'max-height:44%' : 'max-height:58%'}}
.ed img{display:block;${P ? 'width:160%;margin-left:-21%' : 'width:100%'}}
.lock{display:flex;align-items:center;gap:calc(var(--u)*2.4);font-weight:700;font-size:calc(var(--u)*${P ? 9.5 : 8.4});letter-spacing:-.03em;position:relative}
.lock svg{width:calc(var(--u)*${P ? 13 : 11.5});height:auto}
.mk{position:relative;display:flex;flex-direction:${P ? 'column' : 'row'};gap:calc(var(--u)*${P ? 1.6 : 5});margin-top:calc(var(--u)*5);font-size:calc(var(--u)*${P ? 2.9 : 2.3});color:#b9c6da}
.mk b{color:#eef3fb;font-weight:600}.mk i{font-style:normal;font-family:Mono;font-size:.78em;letter-spacing:.18em;color:#40c8d6;margin-right:.7em}
.cta{position:relative;margin-top:calc(var(--u)*5);background:#40c8d6;color:#06202a;font-weight:700;font-size:calc(var(--u)*${P ? 3.6 : 2.9});border-radius:99px;padding:.6em 1.5em}
#grain{position:absolute;inset:-200px;opacity:.07;mix-blend-mode:overlay;pointer-events:none}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%);pointer-events:none}
#fade{position:absolute;inset:0;background:#000;pointer-events:none}
</style></head><body>
<div class="sc" id="s1"><div id="date"><span id="dt"></span><span id="cur"></span></div><div class="s" id="s1b" style="font-size:calc(var(--u)*${P ? 4.6 : 3.8});color:#eef3fb">A primeira linha de código do NexoProcess.</div></div>
<div class="sc" id="s2"><img class="bg" id="o1"><div class="sh"></div><div class="lab">01 · A PERGUNTA</div><div class="h">Por que tantos processos ainda vivem em <em>planilhas?</em></div><div class="s" id="s2b">Onde o fluxo não aparece, o gargalo também não.</div></div>
<div class="sc" id="s3"><img class="bg" id="o2" style="filter:blur(6px) brightness(.45)"><div class="sh"></div><div class="lab">02 · A CONSTRUÇÃO</div><div class="h">Linha a linha. <em>Commit a commit.</em></div><div class="term" id="term">${LOG.map((l) => `<div style="opacity:0"><b>${esc(l.slice(0, 7))}</b>${esc(l.slice(7))}</div>`).join('')}</div></div>
<div class="sc" id="s4"><div class="lab">03 · O PRODUTO</div><div class="h" id="s4h"></div><div class="shot"><img id="p1" src="file://${A}/telas-4k/03b-mapa-macro-recorte.png"><img id="p2" src="file://${A}/capturas-v2/diag-kpi-${card}.png"><img id="p3" src="file://${A}/capturas-v2/plano-${card}.png"></div><div class="selo">Demonstração com dados fictícios</div></div>
<div class="sc" id="s5"><div class="row"><div class="txt"><div class="lab">04 · BRASIL</div><div class="h">Hoje, no Brasil:<br><em>disponível na Hotmart.</em></div><div class="s" id="s5b" style="max-width:100%">E o Google já responde o que é o NexoProcess.</div></div><div class="phone" id="ph"><img src="file://${F}/work/google.png"></div></div></div>
<div class="sc" id="s6"><div class="lab">05 · O PRÓXIMO CAPÍTULO</div><div class="h" id="s6h">Agora, <em>em inglês.</em></div><div class="s" id="s6b">Em desenvolvimento para as plataformas internacionais: <b style="color:#eef3fb">Gumroad</b> e <b style="color:#eef3fb">Paddle</b>.</div><div class="ed" id="ed"><img src="file://${R}/marketing/stories/TELA_CODIGO_EN.png"></div></div>
<div class="sc" id="s7" style="background:radial-gradient(ellipse at 50% 42%,#183a6e 0%,#0d1c38 52%,#060d1c 100%)"><div class="lock">${SYM}<span>NexoProcess</span></div><div class="s" id="s7a" style="color:#eef3fb;font-weight:600;font-size:calc(var(--u)*${P ? 4.8 : 3.8})">Do processo na planilha ao plano de melhoria.</div><div class="s mono" id="s7b" style="font-size:calc(var(--u)*${P ? 2.5 : 2.1});color:#8fa3c2;margin-top:calc(var(--u)*1.6)">From spreadsheet process to improvement plan.</div><div class="mk" id="s7c"><span><i>HOJE</i><b>Brasil · Hotmart</b></span><span><i>EM BREVE</i><b>Gumroad · Paddle</b></span></div><div class="cta" id="s7d">Conheça o NexoProcess</div></div>
<canvas id="grain"></canvas><div id="vig"></div><div id="fade"></div>
<script>
const $=(i)=>document.getElementById(i), cl=(x)=>Math.max(0,Math.min(1,x)), ez=(x)=>{x=cl(x);return x*x*(3-2*x)};
const g=$('grain'); g.width=${Math.ceil(W / 2) + 200}; g.height=${Math.ceil(H / 2) + 200}; g.style.width=(g.width*2)+'px'; g.style.height=(g.height*2)+'px';
{const c=g.getContext('2d'),d=c.createImageData(g.width,g.height);let s=12345;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}
const DATE='19.10.2026', lines=[...$('term').children];
const pad=(n)=>String(n).padStart(4,'0');
async function setImg(el,src){ if(el.dataset.s===src) return; el.dataset.s=src; el.src=src; try{await el.decode()}catch(e){} }
window.render=async(t)=>{
  const vis=(a,b,fi=.7,fo=.7)=>Math.min(ez((t-a)/fi),ez((b-t)/fo));
  const show=(id,a,b,fi,fo)=>{const v=vis(a,b,fi,fo);$(id).style.opacity=v;return v};
  const inn=(id,a,d=.7,dy=1.6)=>{const v=ez((t-a)/d);const e=$(id);e.style.opacity=v;e.style.transform='translateY('+((1-v)*dy)+'vh)'};
  // 1 — a data
  show('s1',0.2,4.3,.5,.8); $('dt').textContent=DATE.slice(0,Math.floor(cl((t-0.7)/1.1)*DATE.length)); $('cur').style.opacity=(Math.floor(t*2.5)%2)?1:.15; inn('s1b',2.1);
  // 2 — a pergunta
  if(show('s2',4.0,9.3)>0){await setImg($('o1'),'file://${F}/work/o1/'+pad(Math.max(1,Math.min(156,Math.floor((t-4)*30)+1)))+'.jpg'); $('o1').style.filter='brightness(.6) saturate(.9)'; $('o1').style.transform='scale('+(1.04+0.04*(t-4)/5.3)+')'; inn('s2b',6.3)}
  // 3 — a construção
  if(show('s3',9.0,15.3)>0){await setImg($('o2'),'file://${F}/work/o2/'+pad(Math.max(1,Math.min(186,Math.floor((t-9)*30)+1)))+'.jpg'); const n=cl((t-9.9)/4.4)*lines.length; lines.forEach((l,i)=>l.style.opacity=cl(n-i)); const lh=lines[0].offsetHeight, over=Math.max(0,Math.ceil(n)*lh-($('term').clientHeight-lh*1.4)); lines.forEach((l)=>l.style.transform='translateY(-'+over+'px)')}
  // 4 — o produto (3 planos)
  if(show('s4',15.0,25.3)>0){const k=t<18.4?0:t<21.8?1:2, st=[15,18.4,21.8][k], u=ez((t-st)/3.6);
    $('s4h').innerHTML=['Vira um <em>mapa visual.</em>','Um <em>diagnóstico</em> com a fórmula à vista.','E um <em>plano de ação.</em>'][k]; $('s4h').style.opacity=Math.min(ez((t-st)/.5),k<2?ez((st+3.4-t)/.35):1);
    ['p1','p2','p3'].forEach((id,i)=>{const e=$(id); e.style.opacity=i===k?Math.min(ez((t-st)/.5),i<2?ez((st+3.4-t)/.35):1):0});
    $('p1').style.objectPosition=(8+62*u)+'% 50%'; $('p2').style.objectPosition='50% '+(${P ? '4+34*u' : '0+100*u'})+'%'; $('p3').style.objectPosition='50% '+(${P ? '0+100*u' : '0+60*u'})+'%'}
  // 5 — Brasil
  if(show('s5',25.0,31.3)>0){inn('s5b',27.4); $('ph').style.transform='translateY('+((1-ez((t-25.3)/1.2))*4)+'vh) scale('+(1+0.03*(t-25)/6.3)+')'}
  // 6 — próximo capítulo
  if(show('s6',31.0,38.8)>0){inn('s6b',33.6); $('ed').style.transform='scale('+(1+0.05*(t-31)/7.8)+')'; $('ed').style.transformOrigin='50% 0%'}
  // 7 — fechamento
  if(show('s7',38.5,46,1.0,.1)>0){inn('s7a',39.6); inn('s7b',40.5); inn('s7c',41.5); inn('s7d',42.6)}
  g.style.transform='translate('+(-(Math.floor(t*30)*37%190))+'px,'+(-(Math.floor(t*30)*53%190))+'px)';
  $('fade').style.opacity=Math.max(1-ez(t/.5), ez((t-44.2)/.8));
};
</script></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const f = `${F}/work/film_${fmt}.html`; fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  if (process.argv[3]) { // quadros de teste
    for (const t of process.argv[3].split(',')) { await p.evaluate((x) => window.render(x), +t); await p.screenshot({ path: `${F}/work/t_${fmt}_${t}.jpg`, type: 'jpeg', quality: 96 }); }
    await b.close(); return;
  }
  const out = `${F}/work/video_${fmt}.mp4`;
  const fm = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < T * FPS; i++) {
    await p.evaluate((x) => window.render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!fm.stdin.write(buf)) await new Promise((r) => fm.stdin.once('drain', r));
  }
  fm.stdin.end(); await new Promise((r) => fm.on('close', r)); await b.close(); console.log('ok', out);
})().catch((e) => { console.error(e); process.exit(1); });

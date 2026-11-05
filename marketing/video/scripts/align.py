"""Segmenta a locução em 7 frases sem ASR: lacunas de silêncio candidatas + posição prevista pelo nº de sílabas (programação dinâmica)."""
import subprocess, re, json, sys, numpy as np
voz = sys.argv[1]
SR = 16000
raw = subprocess.run(['ffmpeg','-v','error','-i',voz,'-ac','1','-ar',str(SR),'-f','s16le','-'],capture_output=True).stdout
x = np.frombuffer(raw,dtype='<i2').astype(float)/32768
hop = SR//100
n = len(x)//hop
rms = np.sqrt((x[:n*hop].reshape(n,hop)**2).mean(1))+1e-9
db = 20*np.log10(rms/ rms.max())
active = db > -38
idx = np.where(active)[0]; t0, t1 = idx[0]/100, (idx[-1]+1)/100
# lacunas internas
gaps=[]; i=idx[0]
while i < idx[-1]:
    if not active[i]:
        j=i
        while not active[j]: j+=1
        if (j-i)>=8: gaps.append((i/100,j/100))   # >=80 ms
        i=j
    else: i+=1
LINES = ["Com o NexoProcess... você responde perguntas simples sobre o seu processo.",
"E ele vira um mapa visual... com gargalos e retrabalho destacados.",
"O diagnóstico mostra tempo, esforço e custo... com a fórmula à vista.",
"Cada sugestão traz a evidência... e a hipótese a validar.",
"Compare o hoje com o futuro... lado a lado.",
"E tudo vira um plano de ação... com responsável e prazo.",
"NexoProcess. Do processo na planilha... ao plano de melhoria."]
syl = lambda s: max(1,len(re.findall(r'[aeiouáéíóúâêôãõàü]+', s.lower())))
w = np.array([syl(l) for l in LINES],float); cum = np.cumsum(w)/w.sum()
pred = [t0 + c*(t1-t0) for c in cum[:-1]]
mids = [(a+b)/2 for a,b in gaps]
# DP: escolher 6 lacunas em ordem crescente minimizando |mid - pred|
K=6; M=len(mids); INF=1e9
dp=np.full((K+1,M+1),INF); bk=np.zeros((K+1,M+1),int); dp[0,:]=0
for k in range(1,K+1):
    for m in range(1,M+1):
        best=INF;arg=0
        for q in range(k-1,m):   # lacuna anterior
            v=dp[k-1,q]+abs(mids[m-1]-pred[k-1])
            if v<best: best,arg=v,q
        dp[k,m]=best; bk[k,m]=arg
m=int(np.argmin(dp[K,1:]))+1; chosen=[]
for k in range(K,0,-1): chosen.append(m-1); m=bk[k,m]
chosen=sorted(chosen)
# se houver uma lacuna claramente mais longa por perto (±0,6 s), prefira-a: é a pausa de fim de frase
def snap(ci):
    mid=(gaps[ci][0]+gaps[ci][1])/2; best=ci
    for j,(a_,b_) in enumerate(gaps):
        if abs((a_+b_)/2-mid)<=0.6 and (b_-a_)>(gaps[best][1]-gaps[best][0])+0.04: best=j
    return best
chosen=sorted(set(snap(c) for c in chosen))
segs=[]; s=t0
for ci in chosen:
    a,b=gaps[ci]; segs.append((max(s-0.04,0),a+0.06)); s=b
segs.append((max(s-0.04,0),t1+0.1))
print(json.dumps({'fala':[round(t0,2),round(t1,2)],'previsto':[round(p,2) for p in pred],'lacunas':[(round(a,2),round(b,2)) for a,b in gaps],
  'escolhidas':[(round(gaps[c][0],2),round(gaps[c][1],2)) for c in chosen],'segmentos':[(round(a,2),round(b,2)) for a,b in segs]}, ensure_ascii=False))
json.dump([(round(a,3),round(b,3)) for a,b in segs], open(sys.argv[2],'w'))

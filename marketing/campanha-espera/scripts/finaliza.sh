#!/usr/bin/env bash
# Junta imagem + trilha: H.264 High + AAC 192k. Teto: (6500 + 192) kbps × 25,2 s ÷ 8 ≈ 21,1 MB no pior caso.
set -euo pipefail
cd "$(dirname "$0")/.."
for v in A B; do
  ffmpeg -v error -y -i work/master_$v.mp4 -i exports/NexoProcess_Espera_trilha.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -maxrate 6500k -bufsize 13000k -profile:v high -level 4.2 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2 -t 25.2 -movflags +faststart exports/NexoProcess_Espera_Reel_$v.mp4
  echo "ok $v"
done

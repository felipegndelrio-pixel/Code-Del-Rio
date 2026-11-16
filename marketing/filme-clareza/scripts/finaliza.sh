#!/usr/bin/env bash
# Junta imagem + trilha e gera os finais (H.264 High + AAC), com teto de bitrate para ficar abaixo de 29,5 MB.
# Conta: (6500 kbps de vídeo + 192 kbps de áudio) × 33,6 s ÷ 8 = 28,1 MB no pior caso.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in 9x16 4x5 16x9; do
  ffmpeg -v error -y -i work/master_$f.mp4 -i exports/NexoProcess_Clareza_trilha.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -maxrate 6500k -bufsize 13000k -profile:v high -level 4.2 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2 -t 33.6 -movflags +faststart exports/NexoProcess_Clareza_$f.mp4
  echo "ok $f"
done

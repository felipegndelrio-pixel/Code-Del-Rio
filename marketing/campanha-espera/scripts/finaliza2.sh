#!/usr/bin/env bash
# Versão 2 (com pessoa): junta imagem + trilha. H.264 High + AAC 192k; teto ≈ 21 MB.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p exports/v2
enc() { ffmpeg -v error -y -i "work/$1" -i exports/v2/NexoProcess_Espera_v2_trilha.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -maxrate 6500k -bufsize 13000k -profile:v high -level 4.2 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2 -t 25.2 -movflags +faststart "exports/v2/$2"; echo "ok $2"; }
enc master_v2.mp4 1_Instagram_Reel_v2_9x16.mp4
enc master_v2_yt.mp4 2_YouTube_Shorts_v2_9x16.mp4
enc master_v2_4x5_li.mp4 3_LinkedIn_v2_4x5.mp4

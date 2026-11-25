#!/usr/bin/env bash
# Versão 2 (com pessoa): junta imagem + trilha. H.264 High + AAC 192k; teto ≈ 21 MB.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p exports/v2 exports/v2_en
enc() { ffmpeg -v error -y -i "work/$1" -i exports/v2/NexoProcess_Espera_v2_trilha.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -maxrate 6500k -bufsize 13000k -profile:v high -level 4.2 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2 -t 25.2 -movflags +faststart "exports/$2"; echo "ok $2"; }
# português
enc master_v2.mp4 v2/1_Instagram_Reel_v2_9x16.mp4
enc master_v2_yt.mp4 v2/2_YouTube_Shorts_v2_9x16.mp4
enc master_v2_4x5_li.mp4 v2/3_LinkedIn_v2_4x5.mp4
# inglês (Gumroad)
enc master_v2_en.mp4 v2_en/1_Instagram_Reel_v2_EN_9x16.mp4
enc master_v2_en_yt.mp4 v2_en/2_YouTube_Shorts_v2_EN_9x16.mp4
enc master_v2_en_4x5_li.mp4 v2_en/3_LinkedIn_v2_EN_4x5.mp4

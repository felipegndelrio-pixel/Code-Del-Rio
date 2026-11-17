#!/usr/bin/env bash
# Junta imagem + trilha: H.264 High + AAC 192k. Teto: (6500 + 192) kbps × 25,2 s ÷ 8 ≈ 21,1 MB no pior caso.
# Saída em exports/ (Reels A/B) e exports/por_plataforma/ (um arquivo com nome claro por rede).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p exports/por_plataforma
enc() { ffmpeg -v error -y -i "work/$1" -i exports/NexoProcess_Espera_trilha.wav \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -maxrate 6500k -bufsize 13000k -profile:v high -level 4.2 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2 -t 25.2 -movflags +faststart "$2"; echo "ok $2"; }
[ -f work/master_A.mp4 ] && enc master_A.mp4 exports/NexoProcess_Espera_Reel_A.mp4
[ -f work/master_B.mp4 ] && enc master_B.mp4 exports/NexoProcess_Espera_Reel_B.mp4
cp exports/NexoProcess_Espera_Reel_A.mp4 exports/por_plataforma/1_Instagram_Reel_9x16.mp4
cp exports/NexoProcess_Espera_Reel_B.mp4 exports/por_plataforma/1b_Instagram_Reel_9x16_teste_B.mp4
[ -f work/master_A_yt.mp4 ] && enc master_A_yt.mp4 exports/por_plataforma/2_YouTube_Shorts_9x16.mp4
[ -f work/master_A_4x5_li.mp4 ] && enc master_A_4x5_li.mp4 exports/por_plataforma/3_LinkedIn_4x5.mp4

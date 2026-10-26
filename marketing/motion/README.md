# OTTO — comercial 30s (9:16)

**Entrega:** `OTTO_comercial_30s_1080x1920.mp4` — 1080×1920, 30 fps, 900 quadros, H.264 High (CRF 14, BT.709), AAC 320 kbps, −14 LUFS / −1 dBTP.
**Projeto editável:** `OTTO_comercial_9x16.aep` (After Effects 2026). Comp principal: `01_COMPS/OTTO_30s_9x16`.

## Roteiro (120 BPM — 1 tempo = 15 quadros)

| Quadros | Cena | Texto | O que é real |
|---|---|---|---|
| 0–120 | Numeral em odômetro | "saldo hoje" | o saldo da home real (R$ 8.601,62) |
| 120–240 | Match cut para a home | "Abriu, já sabe." | home capturada do app |
| 240–360 | A curva se desenha | "Veja hoje como o seu mês vai fechar." | curva real revelada sobre placa limpa da mesma tela |
| 360–480 | Lançar no ritmo | "Mais rápido que lembrar de anotar." | R$ 45,90 digitado tecla a tecla no teclado real |
| 480–600 | Montagem | "Tudo o que um mês tem." | Razão, Análise, Recorrências e dívidas, Contas e cartões (rolagem real) |
| 600–720 | Otto | "Pergunte ao Otto." | pergunta sugerida pelo app digitada no campo real (não enviada) |
| 720–900 | Wordmark vivo | "Comece pelo próximo gasto." | geometria do `src/ui/Wordmark.tsx`: anéis, hastes, barra, pupilas e piscadas |

A copy vem do site (`site/index.html`) e de textos do próprio app.

## Pastas

- `assets/ui/`: capturas reais (Expo Web, build de produção, dados de exemplo do `sampleMonth` do app, API respondida localmente; nenhuma conta ou dado de produção foi usado)
- `assets/audio/`: trilha original (`music.wav`), efeitos sincronizados (`sfx.wav`) e mixagem (`mix.wav`), gerados por `scripts/score.py`
- `capture/`: scripts de captura (`shots.mjs`, `plate.mjs`, `shoot.mjs`, `serve.mjs`, `make-ledger.mjs`)
- `scripts/ae/`: construção do projeto no AE (`lib.jsx` + uma cena por arquivo); `scripts/build.mjs` envia ao AE aberto
- `scripts/timeline.json`: grade de tempo compartilhada entre a trilha e a animação
- `tools/ae-mcp/ae-bridge.mjs`: servidor MCP `after-effects` (registrado no Claude Code em escopo de usuário) + CLI
- `previews/`: folhas de contato da revisão

## Reconstruir / renderizar

```sh
# AE aberto. Reconstrói todas as cenas (a cena 2 recria o rig do aparelho, então a cadeia sempre roda inteira)
node scripts/build.mjs
# trilha
python scripts/score.py
# master sem perdas + MP4
"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe" -project OTTO_comercial_9x16.aep -comp OTTO_30s_9x16 -RStemplate "Melhores configurações" -OMtemplate "Sem perdas" -output renders/master.[fileextension]
ffmpeg -i renders/master.avi -i assets/audio/mix.wav -map 0:v -map 1:a -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 14 -tune film -af "loudnorm=I=-14:TP=-1:LRA=9" -c:a aac -b:a 320k -movflags +faststart -shortest OTTO_comercial_30s_1080x1920.mp4
```

Recapturar as telas: `npx expo export -p web --output-dir marketing/motion/capture/web-dist` com `EXPO_PUBLIC_API_URL=http://127.0.0.1:9`, depois `node capture/serve.mjs` e `node capture/shots.mjs` (de dentro de `capture/`).

As fontes Geist e Geist Mono foram instaladas para o usuário a partir de `node_modules/@expo-google-fonts`.

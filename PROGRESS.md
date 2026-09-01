# OTTO — Registro de progresso

Arquivo de retomada. Se a sessão cair, comece por aqui.

---

## Estado atual: **Fase 1 concluída — aguardando aprovação do Alan**

O portão da Fase 1 é explícito: nada da Fase 2 começa antes da aprovação das telas de acesso, porque
elas definem o padrão visual de todo o resto.

### O que está pronto e verificado
- **Fase 0 — Fundação.** Expo SDK 54 (compatível com Expo Go), expo-router, Reanimated 4 + Worklets,
  expo-sqlite, react-native-svg, tipografia Geist, tokens "Ledger Nocturne", edge-to-edge com insets
  reais, túnel + QR.
- **Fase 1 — Identidade e Acesso.** `sign-in`, `sign-up`, `forgot` (com estado de confirmação),
  sessão persistida em `expo-secure-store`, e um `home` provisório só para o fluxo ter destino.

### Verificação executada (não é "compilou, logo funciona")
- `tsc --noEmit` limpo.
- Bundle Android **e** web compilam (HTTP 200).
- `tools/shoot.mjs` — captura no viewport real do aparelho (444×986dp @2.75), mede overflow
  horizontal e coleta erros de console. Resultado: **0 offenders, 0 erros** nas três rotas.
- `tools/states.mjs` — dirige a UI de verdade: erros de validação, campos preenchidos, medidor de
  força nos três extremos, snackbar do Google, confirmação de reset. **0 erros** em todos.
- `tools/measure.mjs` — mede o ritmo vertical em dp.
- `tools/contrast.mjs` — WCAG de toda a paleta contra o fundo. **Toda a paleta passa 4.5:1.**

### Defeitos encontrados olhando o resultado, e corrigidos
1. **Crossbar do wordmark não desenhava.** `useAnimatedProps` sobre geometria SVG não funciona no
   react-native-web, e o valor inicial era o estado degenerado. Agora o repouso é a marca completa e
   a animação só rebobina — em native. Regra adotada: *a animação nunca é o único caminho para o
   estado estático correto.*
2. **Tela inteira invisível.** `entering={FadeIn.delay(...)}` deixava todo o conteúdo em opacidade 0
   quando as layout animations não rodavam. Removido: o único momento animado da tela é o crossbar.
3. **`inkFaint` reprovava em contraste** (3.38:1 — labels, placeholders, termos e rodapé). Subido de
   `#5E656F` para `#737B88` → **4.66:1**.
4. **Vão marca→título de 190dp.** Bloco reancorado no topo: agora 72dp, com o CTA a ~51% da altura
   (zona confortável de polegar em tela de 6.67").
5. **Mensagem de erro colava no label do campo seguinte.** Separação entre campos de 12 → 24dp.
6. **Anel de foco padrão do navegador** aparecia sobre o campo. Removido — o foco é desenhado pela
   régua, e nada mais.
7. **Emenda visível na luz de borda.** SVG com dimensão percentual não resolve no web; agora mede o
   layout e pinta de ponta a ponta.
8. Mutação de shared value durante o render no `Field` (proibido no Reanimated) → movida para efeito.
9. `interpolateColor` do `Field` lia `err` dentro do array de saída, produzindo salto de cor no meio
   da transição; e a opacidade somava acima de 1. Ambos corrigidos.

---

## Próximo passo
**Aguardar o "ok" do Alan.** Aprovado, seguir para a Fase 2 (núcleo de dados) conforme `ROADMAP.md`.

## Comandos
```bash
npx expo start --tunnel     # dev server + túnel
node tools/qr.mjs           # QR no terminal + otto-qr.png
node tools/shoot.mjs        # captura + medição de overflow
node tools/states.mjs       # captura dos estados interativos
node tools/measure.mjs      # ritmo vertical em dp
node tools/contrast.mjs     # WCAG da paleta
npx tsc --noEmit            # typecheck
```

## Decisões que valem para o resto do projeto
- **A animação é aditiva.** Todo componente precisa estar correto com a camada de animação morta.
- **Cor é informação.** Verde/vermelho só descrevem dinheiro. O CTA primário é `ink`, sem cor de marca.
- **Sem cards.** Estrutura vem de réguas de 1px e espaço. Card aninhado é proibido.
- **O gutter de 24dp é a margem segura da curva**, não uma escolha estética. Nada entra nela.
- **Medir antes de ajustar.** Espaçamento se decide com `tools/measure.mjs`, não no olho.

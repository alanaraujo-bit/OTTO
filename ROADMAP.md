# OTTO — Roadmap

Phases are gated. Nothing in a later phase starts until the previous one is running on the real
device and has been looked at.

## Fase 0 — Fundação  ✅
Expo SDK 54 (Expo Go compatible), expo-router, Reanimated 4 + Worklets, expo-sqlite, react-native-svg,
Geist type system, "Ledger Nocturne" tokens, device-metrics probe, tunnel + live QR.

## Fase 1 — Identidade e Acesso  ✅
The auth screens set the visual standard for everything after them.
- Splash → wordmark reveal
- Entrar: e-mail + senha, hairline fields, Google, Apple
- Criar conta: nome, e-mail, senha, força de senha, termos
- Recuperar senha
- Local session store, biometric unlock hook (wired in Fase 2)
- **GATE: aprovado por Alan em 2026-09-02.** O padrão de motion destas telas é a régua do projeto.

## Fase 2 — Núcleo de dados  ✅
SQLite schema + migrations em `user_version`. O modelo `series` unificado: uma tabela move entradas
recorrentes, saídas recorrentes, dívidas (contagem finita) e faturas de cartão. Motor de projeção de
ocorrências em TypeScript puro, com 16 checagens de aritmética (`npm run ledger`).

**Desvio deliberado:** a tabela de agregados não foi construída. Para um dono só, o razão inteiro são
centenas de linhas e projetar sobre isso em JS é instantâneo — um cache desnormalizado que ninguém
precisa é só uma segunda fonte de verdade esperando para discordar da primeira. Entra quando uma
medição disser que a leitura está lenta, não antes.

## Fase 3 — Registro instantâneo  ✅
The bottom-sheet quick-add over Home. Amount-first keypad, category in one tap, account in one tap.
Target: three taps, under two seconds, no route push.

## Fase 4 — Tela inicial  ✅
Um número dominante. Saldo hoje, a curva do mês (realizado sólido, projetado tracejado), fluxo,
próximos 7 dias, gastos por categoria e dívidas. **GATE: aprovado por Alan em 2026-09-02, no aparelho.**

## Fase 4.1 — Razão  ✅
A fita contínua: passado e previsto numa coluna só, sem fronteira de mês. A régua do dia gruda no
topo carregando o saldo naquele ponto — rolar o razão é arrastar o dedo pela curva da Home. Sólida
no realizado, tracejada no previsto, e uma única costura em ink: hoje.

Não estava no plano original; entrou porque os três destinos apagados da barra são uma promessa já
visível na tela aprovada, e o razão é onde a lista que a Home se recusa a imprimir sempre ia morar.

## Fase 4.2 — Ajustes e o trinco  ✅
A única tela que fala do app e não do dinheiro. Sacada: a marca é o controle — ligar o desbloqueio
biométrico fecha os olhos do OTTO e os deixa fechados. Um trinco de verdade, com portão no start frio
e uma saída que não depende do sensor. Identidade, conteúdo do razão, reseed e sair da conta.

## Fase 4.3 — Análise  ✅
A barra está completa. Sacada: o mesmo dia do mês — este mês é comparado com o mesmo trecho dos
meses anteriores, e o traço que cruza cada régua é a mediana do próprio dono. Abaixo de dois meses
comparáveis a tela diz que não tem com o que comparar, em vez de inventar um normal.

A Fase 7 do plano original está absorvida aqui.

## Fase 5 — Contas e cartões  ✅
Sacada: "linha de crédito não é dinheiro", desenhada — acima da divisória o que você tem, abaixo o
que você deve e quando, e nada atravessa. Migração 2 traz fechamento, vencimento e limite. O ciclo é
uma régua do tempo. `lançar` ganhou seletor de conta.

**Fora do escopo, e por quê:** compras lançadas direto no cartão precisam antes da decisão de
modelagem que a Fase 6 deve — se a compra é gasto, o pagamento da fatura é transferência, senão o
mesmo dinheiro é contado duas vezes. Criar e apagar contas também não entrou.

## Fase 6 — Assinaturas e dívidas  ✅
As duas UIs de recorrência sobre o motor da Fase 2, e o primeiro caminho de escrita de `series` que
não passa pelo seed — sem ele o app é demonstração, não produto.

Sacada: uma regra tem um custo ao longo da vida, e ninguém soma. O Spotify não é R$ 21,90, é
R$ 262,80 por ano — e essa cifra aparece **enquanto você digita**. Para uma dívida ela se inverte:
quanto falta e quando para, contado em parcelas. No topo, o livre por mês antes de gastar qualquer
coisa.

O anual sai de `occurrences()`, não de `12 ×`: herda o aparo de dia, a data de fim e a contagem de
parcelas de graça. A janela são doze meses de calendário, não as próximas doze ocorrências — ancorar
em `today` faria a mesma assinatura reportar dois custos anuais diferentes conforme o dia em que
fosse olhada.

## Fase 6.2 — Compras no cartão  ✅
A dívida de modelagem paga. Uma compra no cartão é gasto no dia em que acontece e não move saldo; a
fatura move o saldo e é transferência. Sem isso a análise contaria o mesmo dinheiro duas vezes — com
o razão de exemplo, R$ 1.240 a mais. `lançar` oferece cartões e diz a consequência; a fatura abate
estorno; `contas` mostra o que está nela.

## Fase 7 — Estatísticas  ✅ (entregue como Fase 4.3)
Gasto por categoria e mês a mês entregues na Análise. O cone de projeção não entrou: a curva da Home
já desenha a projeção, e um cone precisa de uma medida de incerteza que este razão ainda não tem.

## Fase 8 — Avisos  ← ATUAL
Sacada: OTTO só fala quando sabe de algo que você não sabe. O aviso carrega a consequência, não o
evento — o dia em que o mês fica negativo, quanto, e qual conta causou. Dispara na véspera. A fatura
avisa no fechamento, nunca no vencimento. Dois avisos, e ambos ficam calados na maior parte do tempo.

**Não verificável no Expo Go:** desde o SDK 53 o cliente não agenda notificação local no Android. A
linha aparece desabilitada dizendo isso, e a fase inteira só pode ser olhada num dev build.

## Fase 9 — Polimento
Empty states, error states, font-scale 1.3 pass, dark-only verification on hardware, cold-start
budget, 120Hz frame audit.

# OTTO — Roadmap

Phases are gated. Nothing in a later phase starts until the previous one is running on the real
device and has been looked at.

## Fase 0 — Fundação  ✅
Expo SDK 54 (Expo Go compatible), expo-router, Reanimated 4 + Worklets, expo-sqlite, react-native-svg,
Geist type system, "Ledger Nocturne" tokens, device-metrics probe, tunnel + live QR.

## Fase 1 — Identidade e Acesso  ← ATUAL
The auth screens set the visual standard for everything after them.
- Splash → wordmark reveal
- Entrar: e-mail + senha, hairline fields, Google, Apple
- Criar conta: nome, e-mail, senha, força de senha, termos
- Recuperar senha
- Local session store, biometric unlock hook (wired in Fase 2)
- **GATE: owner approval before Fase 2**

## Fase 2 — Núcleo de dados
SQLite schema + migrations. The unified `series` model: one table drives recurring inflows, recurring
outflows, debts (finite count), and card statements. Occurrence projection engine. Aggregates table
written on every mutation so reads are a single query.

## Fase 3 — Registro instantâneo
The bottom-sheet quick-add over Home. Amount-first keypad, category in one tap, account in one tap.
Target: three taps, under two seconds, no route push.

## Fase 4 — Tela inicial
One dominant number. Saldo, a fluxo do mês, o que vence nos próximos 7 dias, and nothing else above
the fold.

## Fase 5 — Contas e cartões
Accounts, credit cards with fechamento/vencimento, statement projection, limit usage.

## Fase 6 — Assinaturas e dívidas
The two recurrence UIs on top of the Fase 2 engine. Debt: creditor, parcela, total, pagas, próxima —
OTTO computes saldo devedor, data final, progresso.

## Fase 7 — Estatísticas
SVG charts built for this world: no sparkline decoration, every mark answers a question. Category
spend, month-over-month, projection cone.

## Fase 8 — Inteligência e notificações
Scheduled local notifications behind a platform interface (Expo Go degraded / dev-build full).
Anomaly detection, budget pacing, due-date ladder, monthly close-out.

## Fase 9 — Polimento
Empty states, error states, font-scale 1.3 pass, dark-only verification on hardware, cold-start
budget, 120Hz frame audit.

# OTTO — Registro de progresso

Arquivo de retomada. Se a sessão cair, comece por aqui.

---

## Estado atual: **Fase 9.1 — barra do sistema, valores inteligentes, tudo editável. Novo APK.**

Fases 0 a 4 fechadas. A Home foi aprovada por Alan no aparelho em 2026-09-02 e, junto com as telas
de acesso, é a régua visual do resto do projeto.

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

### Defeito encontrado no aparelho real (invisível na web)
10. **`Unmatched Route` ao abrir pelo Expo Go.** O sintoma parecia roteamento, mas a causa era ABI de
    TurboModule: o npm resolveu `react-native-worklets` para 0.8.3 — o peer do Reanimated é apenas
    `>=0.5.0` — enquanto o Expo Go SDK 54 embute o binário **0.5.1**. O JS chamava
    `installTurboModule(arg)` e o nativo esperava `installTurboModule()`. A exceção derrubava a
    inicialização do Reanimated, que derrubava o carregamento das rotas do expo-router. Daí o
    "Unmatched Route": a rota certa nunca chegou a ser registrada.

    Corrigido pinando todos os módulos nativos exatamente às versões que o Expo Go embute, com
    `overrides` para o worklets, que resolve de forma transitiva. Verificado no bundle Android real
    que o aparelho baixa: agora emite `installTurboModule()` com zero argumentos.

    **Lacuna de processo que isso expôs:** a verificação era só web, e web não carrega módulo nativo,
    então essa classe inteira de erro era invisível. Agora existe `tools/native-check.mjs`, que
    compara cada módulo nativo instalado com `expo/bundledNativeModules.json` e falha se divergir.

---

## Fase 1.5 — "OTTO olha"

A UI estava certa e parada. Faltava a plataforma responder. Em vez de espalhar animação por toda a
tela, tudo foi concentrado numa ideia só, tirada do próprio nome: **os dois O de OTTO são olhos.**

**O canal de atenção** (`src/ui/FocusSignal.tsx`). Já existia como um 0/1 para a luz de borda.
Agora carrega quatro shared values — `focus`, `slot` (o índice do campo focado na sequência de
réguas), `secure` (o campo é mascarado) e `reject` (o valor foi recusado). Tudo em shared value:
a reação inteira roda na UI thread, sem um único re-render. `Field` reporta; `Screen` e
`Wordmark` escutam.

**A marca acorda** (`src/ui/Wordmark.tsx`). As pupilas nascem quando um campo recebe foco e
somem quando ele perde. O olhar desce na direção do campo — os dois olhos carregam **o mesmo**
deslocamento, porque a 288 unidades de distância a convergência real renderiza vesgo. Pisca sozinha
em intervalo aleatório, para nunca virar spinner.

Amplitude foi dimensionada, não estimada: a 40dp de marca, 1 unidade do viewBox é 0,4dp. O primeiro
valor escrito dava 1,6dp de deslocamento horizontal — presente na aritmética e ausente na tela.
Agora são ±8 unidades em x (3,2dp) e 10–13 em y (4–5dp), contra um raio de pupila de 13. Na tela de
entrada isso produz dois estados visíveis e distintos: e-mail → olha para baixo e para a esquerda;
senha revelada → para baixo e para a direita. Com a senha mascarada os olhos estão fechados, então
ali não há olhar a distinguir — e é esse o ponto.

**A sacada** — e o motivo de tudo isso existir: **quando você digita a senha, OTTO fecha os olhos.**
Não é enfeite: é o produto dizendo, na única língua que um logo tem, que não está lendo sua senha
por cima do seu ombro. Toque em MOSTRAR e ele abre — e abre *arregalado* por um instante, porque
foi você que escolheu mostrar. Fechar é decisão e leva tempo (`withTiming`); abrir é solta e
ultrapassa (`withSpring` + pulso de `peek`).

Valor recusado: as pupilas se apertam e a marca leva um tranco lateral — mesma linguagem do nudge
que a régua do campo já fazia. Aceito: os olhos fecham satisfeitos (arco pra cima) e a travessa se
desenha de novo — a marca assinando o lançamento.

**A marca deixou de sumir** (`src/ui/BrandHeader.tsx`). Antes o bloco de marca colapsava para zero
quando o teclado subia. Estava certo sobre o espaço e errado sobre a marca: o teclado fica aberto
exatamente durante todo o tempo em que a marca tem algo a dizer. Agora ela **encolhe** de 40dp para
22dp e continua visível, escalando a partir do canto superior esquerdo para não sair do gutter.

### Disciplina mantida
- **Ainda é aditivo.** Em repouso — nada focado, sem camada de animação, na web, ou com "Remover
  animações" — o SVG renderiza exatamente a marca de sempre: quatro traços e uma régua. Pupila em
  `r=0`, pálpebra em `strokeOpacity=0`. Se um atributo animado não pegar no aparelho, a marca
  degrada para o que já era — nunca para um estado quebrado.
- **Só atributos com procedência.** `cx`/`cy`/`r`/`strokeOpacity` via `useAnimatedProps`,
  o mesmo mecanismo do `x2` da travessa, que já roda no aparelho. Nada de `strokeDasharray`, e
  nenhuma pálpebra desenhada como retângulo em `color.bg` — a luz de borda passa por trás, e um
  remendo sólido apareceria no OLED (mesma classe do B-fix 11).
- **Movimento reduzido** mantém pupila centrada e desliga a piscada, mas **continua fechando os
  olhos na senha**: aquilo é informação, não enfeite.

### A verificar no aparelho (não dá para provar daqui)
- **O toque em MOSTRAR mantém o foco do campo?** `keyboardShouldPersistTaps="handled"` garante o
  teclado, não o foco. Se o Android tirar o foco do `TextInput` nesse toque, `wake` vai a 0, as
  pupilas somem e o "espiar" toca contra pupila de raio zero — invisível. É a única coisa de que a
  sacada central depende e que só o dedo responde.
- **A pálpebra lê como pálpebra?** O arco vai de `cx ± 33` com traço 9, terminando junto ao anel.
  Mais estreito que isso, lê como uma boca dentro de um O.

### Defeitos corrigidos durante a implementação
12. `useDerivedValue` devolvendo um **objeto** com `withTiming` dentro. Não anima — o Reanimated
    só interpreta o descritor quando ele é o valor de retorno. Separado em `gazeX`/`gazeY`.
13. Reação a foco escrita como efeito colateral dentro de `useDerivedValue`. Trocado por
    `useAnimatedReaction`, que é a API para "quando este valor mudar, faça isto" — e que dá a
    borda `previous === 1 && target === 0` de que o "espiar" depende.
14. Guarda da piscada lia `shut.value` **na thread JS**, enquanto `shut` é escrito na UI thread
    pela reação. Cópia sempre defasada. Era só otimização (`pupilR` já multiplica por `1 - shut`),
    então a leitura foi removida em vez de remendada — ela viraria bug real assim que `lid`
    controlasse qualquer outra coisa.
15. `CONFIRM_HOLD` de 520ms cortava a própria confirmação: a travessa se redesenha em
    `duration.focal` (620ms). Subido para 820ms, com `Keyboard.dismiss()` antes — sem isso a
    marca assinava o lançamento encolhida a 22dp, que é o tamanho de digitação, não o de conclusão.

### Nota sobre `tools/motion.mjs`
O guard roda em Chrome headless e mede 4/9 no `HEAD` anterior e 5/9 agora — ou seja, **ele não
mede animação**: o Reanimated web não avança sob headless, então quase todo FAIL é do próprio
instrumento. As checagens de "sem erro de runtime" passam e são a parte útil hoje. O sistema de
olhos é native-only por construção; **a verificação real é o aparelho**. Isso reforça o B4.

---

## Fase 1.6 — fluidez, e o olhar que segue

Feedback do aparelho: *"quando ele abre dá um bugzinho, não está fluido"*. Estava certo, e a causa
era estrutural.

**Uma curva por pixel.** `shut` voltava a zero num spring de ~350ms enquanto `peek` corria um
timing de 190ms → espera 340ms → 420ms. Duas curvas crescendo a **mesma** pupila em fases
diferentes: ela crescia no spring e crescia de novo na rampa. Isso é literalmente do que um solavanco
é feito. `peek` foi deletado. Abrir agora é **um** spring subamortecido (`spring.pop`, ζ≈0,4) cujo
overshoot de ~25% *é* o arregalar. A mesma curva que expressa leva o valor até o repouso.

**A pupila virou elipse.** Fechar esmaga `ry` até zero com `rx` inteiro — que é o que uma
pálpebra descendo faz com o que você enxerga. Antes ela encolhia nos dois eixos, e um círculo que
encolhe lê como ponto se afastando, não como olho fechando. Bônus estrutural: piscar e fechar na
senha passaram a ser **o mesmo movimento em duas velocidades**, então não têm como discordar.

**O olhar segue o dedo.** `Screen` ganhou um `Gesture.Manual` — o único detector que observa
toques sem nunca disputá-los: recebe todo evento e só ativa se alguém chamar `activate()`, o que
ninguém aqui chama. Fica acima da tela inteira e não tira nada dos botões embaixo. A posição é
normalizada ali mesmo e escrita em shared value, então roda na frequência do toque sem um único
commit do React. `spring.follow` faz a pupila *perseguir* em vez de rastrear: o spring reinicia
herdando a velocidade atual, e o olho chega sempre um instante depois do dedo — que é o que faz
parecer vivo em vez de mecânico.

**O olhar acompanha a escrita.** `Field` reporta `write` (0..1, caracteres sobre a largura útil
da linha). Começo de linha é olhar à esquerda; linha cheia levou o olhar até a direita. Vale no campo
de e-mail e na senha revelada — mascarada, os olhos estão fechados, e é esse o ponto.

### A transição
A animação da stack já era `slide_from_right` a 320ms. O que faltava não era a animação, era
**continuidade**: a marca sumia entre uma tela e outra.

- `sign-up` agora carrega a marca, a 22dp — o mesmo tamanho para o qual ela encolhe em `sign-in`
  com o teclado aberto. O deslize passa a ler como conteúdo se movendo sob uma marca contínua, e não
  como duas páginas sem relação. E ela continua olhando, no formulário onde isso mais importa.
- **A marca olha para onde você vai, um instante antes de você ir.** `look(dir)` no canal de
  atenção: +1 ao empurrar `sign-up` ou `forgot`, -1 em qualquer caminho de volta. Sai rápido,
  segura durante a troca de tela, e volta. O *hold* é o que faz ler como olhar *para* a coisa que
  chega, em vez de um tique.

### Defeito corrigido no aparelho
16. `clamp` era uma seta de escopo de módulo chamada de dentro de um worklet. Um helper comum
    atravessa para a UI thread como **dado serializado**, não como função — `clamp is not a function
    (it is Object)`. Virou `function` com `'worklet'`. Vale para tudo que um worklet chamar.

### A verificar no aparelho
- **Os botões continuam respondendo?** O `GestureDetector` do `TouchReporter` está acima de toda
  a árvore. Entrar, MOSTRAR, Google, Apple, Criar conta e o voltar precisam disparar normalmente.
- **O `Gesture.Manual` entrega `onTouchesMove` sem ativar?** Se não entregar, o olhar simplesmente
  não segue o dedo — nada quebra. A variante é `Gesture.Pan().manualActivation(true)`.

---

## Fase 1.7 — a transição para "Criar conta"

Feedback: *"muito seco e lagado ainda"*. Três causas separadas, e a maior delas não era a animação.

**1. `sign-up` não tinha entrada nenhuma.** `sign-in` se desenha em sete tempos; `sign-up` era
`<View>` puro. Você tocava e uma laje pronta deslizava por cima. Agora ela se compõe com a mesma
sequência de réguas, começando em `ENTER = 160ms` — ou seja, **dentro** do deslize, não depois
dele. A página chega no meio da própria montagem, e os dois movimentos leem como um só. Essa era a
maior parte do "seco".

**2. `animationDuration: 320` nunca existiu.** Não está sequer nos tipos do react-native-screens:
o native-stack honra isso só no iOS. Aquilo era decoração no arquivo. Removido.

**3. `slide_from_right` → `ios_from_right`.** O slide simples translada **só** a tela que entra,
então a que fica para trás só some por baixo. O `ios_from_right` move as duas, a de trás numa
fração da velocidade e escurecendo — dois planos em duas profundidades, em vez de uma folha
deslizando sobre um buraco. Esse paralaxe é a diferença entre trocar de tela e virar uma página.

**`renderToHardwareTextureAndroid` na luz de borda.** Durante um push existem duas `Screen`
montadas, cada uma rasterizando um gradiente radial SVG de tela cheia enquanto a stack desliza. É o
caso de manual para promover a camada: conteúdo estático cuja única propriedade animada é opacidade.
Mais `freezeOnBlur`, que impede a tela de baixo de re-renderizar durante a transição.

**`Reveal` ganhou `delay`** — com o watchdog medido a partir do mesmo offset. Esquecer de somar o
delay ali alargaria a janela em que uma animação travada deixa a tela em branco, que é exatamente o
defeito 2 de novo.

### Honestidade sobre o que não dá para consertar aqui
Parte do "lagado" é o Expo Go em modo dev, com bundle não otimizado e sem Hermes AOT. Nada acima
muda isso. A medida real de fluidez desta transição só existe num dev build — o que reforça o B4.

### A verificar no aparelho
- A luz de borda continua correta **depois** de girar a tela ou abrir/fechar o teclado? A textura de
  hardware é descartada e reconstruída quando `size` muda; vale conferir que não segura um frame
  velho.

---

## Fase 1.8 — a transição não podia vir do deslize

Feedback: *"muito rápido e quase imperceptível"*. Diagnóstico honesto: **o deslize nativo do Android
não é alongável.** `animationDuration` do native-stack vale só no iOS, e não existe outra opção de
duração no react-native-screens. Insistir no preset era beco sem saída.

Então a duração passou a vir do outro lado. `Reveal` ganhou `shift` — deslocamento horizontal a
partir da direita — mais `step` e `cap`. O conteúdo do `sign-up` entra **viajando na mesma
direção que a página veio** e continua se assentando por quase um segundo depois de ela ter chegado.
O olho lê **um** movimento longo, não um deslize rápido seguido de nada.

A curva é bem carregada na frente (`cubic-bezier(0.16, 1, 0.3, 1)`: aos 50% do tempo já andou 93%),
então o topo da tela está praticamente composto quando o deslize acaba e só a metade de baixo ainda
está vindo. Essa é a diferença entre uma página que chega vazia e se preenche, e um movimento
contínuo só.

Os três campos também entraram na sequência — eram o único bloco parado enquanto tudo em volta
coastava, e um bloco imóvel no meio de uma cascata denuncia a cascata inteira.

Parâmetros num objeto só (`ENTER`), espalhado com `{...ENTER}`: nove chamadas de `Reveal` com
os mesmos cinco valores é a forma de eles divergirem em silêncio.

### Suspeita a descartar no aparelho
Se **todas** as transições do sistema parecerem instantâneas, checar
**Opções do desenvolvedor → Escala de duração do Animator**. Em 0,5x ou "desativado" o Android encurta
ou elimina toda animação de janela, e nenhuma escolha de preset sobrevive a isso.

---

## Fase 2 + Fase 4 — o razão, e a tela que o lê

### O núcleo de dados
`series` é **uma** tabela para quatro coisas que todo app financeiro modela separado: entrada
recorrente, conta recorrente, dívida sendo quitada e fatura de cartão. Elas só diferem em se o
dinheiro entra ou sai, e em se a sequência acaba — então são um formato com dois campos fazendo esse
trabalho, não quatro tabelas que divergem com o tempo.

Decisões que importam:
- **Dinheiro é inteiro em centavos, nunca float.** `0.1 + 0.2` é o bug mais antigo de software
  financeiro e não vai acontecer neste.
- **Datas são `yyyy-MM-dd` em hora local, nunca instantes.** Um app que guarda vencimento como
  timestamp acaba mostrando o dia errado por causa de um fuso que o dono nunca escolheu.
- **Linha de crédito não é dinheiro.** Conta de cartão fica fora do saldo. Contá-la inflaria o único
  número em que a tela inteira pede para confiar.
- **A versão do schema mora no `user_version` do próprio SQLite.** Sem tabela de controle que possa
  discordar da realidade; cada migração roda em transação com o próprio bump de versão, então uma que
  falhe deixa o banco exatamente como estava.
- **Dia 31 é aparado para o tamanho do mês.** A alternativa — pular o mês — perde uma conta em
  silêncio.

`npm run ledger` roda 16 checagens de aritmética sobre o motor puro, com o Node 24 removendo os
tipos direto do fonte. Sem bundler, sem framework de teste, e testando **o mesmo arquivo que embarca**.
Um saldo errado renderiza tão convincentemente quanto um certo; screenshot não verifica esta camada.

### A Home
A tela nasce de uma afirmação: **um saldo sozinho não responde "onde eu estou".** R$ 4.800 é
confortável no dia 28 e apertado no dia 2 com o aluguel em aberto, e nenhum tratamento visual faz um
número solto dizer qual dos dois. Então o número e o mês em que ele está são **uma leitura só**: a
cifra, e a linha à qual ela pertence — realizado sólido, projeção tracejada, mesmo eixo.

**Por isso não existe lista de contas a vencer.** Cada degrau da metade projetada já *é* essa lista;
imprimi-la de novo embaixo repetiria o gráfico num meio pior e transformaria um relance em rolagem. O
que os números abaixo acrescentam é só o que a forma não diz: os nomes, e para onde o dinheiro
efetivamente foi.

**A barra é uma régua.** Gastos por categoria não são um gráfico de barras com as réguas removidas —
são a régua fazendo mais um trabalho. A linha já estava lá para agrupar; agora o *comprimento* dela
carrega o valor. Nada novo entra no vocabulário e nenhuma barra em caixa chega para brigar com o razão.

**Dívida é contada, não estimada.** Uma parcela por marca, preenchida para as pagas. Barra contínua
arredondaria doze pagamentos numa porcentagem lisa e perderia o único fato sobre o qual o dono age:
quantas faltam. Anel de progresso é banido neste mundo pelo mesmo motivo — é uma forma onde cabe uma
contagem.

**Uma frase, e só quando é verdade.** "No dia N o mês fica negativo em R$ X" só é renderizada quando
o mês de fato mergulha. Um alerta que está sempre lá vira mobília que o dono aprende a pular.

**Últimos 30 dias, não o mês corrente.** No dia 2 do mês, "este mês" não diz nada — e é exatamente
quando alguém abre o app se perguntando para onde o dinheiro foi. Janela móvel sempre tem um mês
inteiro dentro.

**E OTTO olha a linha ser desenhada.** As pupilas já seguem o dedo e o texto; aqui seguem o mês sendo
riscado até o fim. É a mesma ideia das telas de acesso, e custa um shared value.

### Defeitos encontrados entre a aritmética e o vidro
Os 17 testes cobrem os números; nada disso eles pegariam.

17. **Os olhos do OTTO estavam mortos na Home.** `wake` era acionado só por `focus`, e a Home não tem
    campo nenhum — pupilas em raio zero, pálpebras em opacidade zero. A frase "OTTO olha a linha ser
    desenhada" não renderizava *nada*. Pior: o seguimento do dedo, entregue na Fase 1.6, só funcionava
    enquanto um campo estava focado — nas telas de acesso isso ficava mascarado porque você toca a
    tela justamente para focar algo. Agora acorda com `max(foco, toque, olhada)`: um dedo no vidro é
    atenção, e é motivo para levantar os olhos.
18. **"entrou / saiu" em números que ainda não aconteceram.** O fluxo do mês é realizado **mais**
    previsto, então no dia 2 a tela dizia *entrou R$ 7.400* de um salário que cai no dia 5. É
    exatamente a classe de número silenciosamente errado contra a qual o `PRODUCT.md` foi escrito.
    Virou "entradas / saídas", com `realizado + previsto` dito na régua da seção.
19. **"Próximos 7 dias" contradizia a si mesmo.** O total somava só saídas, mas a contagem e os nomes
    incluíam o salário: *3 lançamentos*, R$ 1.979,90, "Aluguel · Salário · Internet". Agora a cifra, a
    contagem e os nomes descrevem o mesmo conjunto — só o que há a pagar. E a janela começa amanhã,
    igual à projeção da curva: contar hoje deixaria uma conta já quitada aparecer aqui **e** dentro do
    saldo.
20. **Faltava estado de carregamento** no único caminho que o dono percorre primeiro. O start frio
    grava 158 lançamentos antes de `ready` virar. Agora o instrumento mostra um mostrador em branco —
    um travessão no lugar exato da cifra — então o número aterrissa sem a tela pular.

### Sobre a verificação
O `tools/shoot.mjs` e companhia renderizam na web, e `expo-sqlite` não roda lá — a Home vai cair no
estado de erro nesses instrumentos, que é o comportamento correto e não uma falha da tela. **A
verificação da Home é o aparelho.** Reforça o B4.

### Deriva conhecida (não corrigida aqui)
`DESIGN.md` documenta `inkFaint` como `#5E656F`, mas `tokens.ts` usa `#737B88` desde a correção de
contraste (defeito 3). O código está certo e o documento está velho; anotado para uma passada de
documentação, não emendado de lado dentro de uma tarefa de tela.

---

## Fase 4 aprovada, e a Fase 4.1 — o Razão

**GATE: Alan aprovou a Home no aparelho em 2026-09-02.** As Fases 2, 3 e 4 estão fechadas.

### Defeito 21 — um defeito no `Press`, cinco sintomas em quatro telas
O `Press` entregava o `style` ao `Animated.View` **de dentro** do `Pressable`. Um `flex: 1` ou um
`width: '33%'` escrito ali dimensiona o **conteúdo** dentro de um alvo que já encolheu para a própria
largura, e uma `marginTop` negativa move o desenho e deixa a área de toque para trás. Nada disso
aparece em `tsc`, nenhuma checagem de aritmética o alcança, e cada sintoma parecia um defeito local
de uma tela diferente. Era um só.

`Press` ganhou `outerStyle` — o que posiciona o controle entre os irmãos. `style` continua sendo o
que arruma o conteúdo dentro dele.

Os sintomas, na ordem em que apareceram:

- **Rótulos da barra colados** — "início razão", "análise ajustes". Os quatro slots laterais ficavam
  do tamanho do conteúdo e o `centre`, esse sim com `flex: 1`, comia o resto e empurrava os dois da
  direita para a borda. Rótulos também ganharam `numberOfLines={1}`, porque o mesmo aperto volta em
  escala de fonte 1.3.
- **O teclado de `lançar` colapsou numa linha só.** Doze teclas com `width: '33.333%'` no view
  interno: cada `Pressable` tinha a largura do glifo, o `flexWrap` nunca tinha o que quebrar, e a
  grade 3×4 virou uma fileira esmagada. Este era o sintoma mais grave e o mais fácil de ler errado
  como "o keypad está mal escrito".
- **"SAÍDA" e "ENTRADA" colados**, mesma causa dos rótulos da barra.
- **O disco de lançar era tocável 18dp abaixo de onde é desenhado.** `marginTop: -18` movia o desenho
  e não o alvo. É o único controle em torno do qual o produto inteiro é construído, e estava assim na
  Home aprovada.
- **As setas do `MonthStepper` não iam às pontas da faixa.** `width: 44` e `flex: 1` no interno, então
  os três controles se agrupavam no meio de uma faixa feita para atravessar a linha. Também na Home
  aprovada.

**A lição, e ela vale para o resto do projeto:** um componente que envolve o filho num alvo de toque
tem **duas** caixas, e um `style` só não pode endereçar as duas. Todo wrapper desse tipo precisa
dizer qual das duas está recebendo o estilo. Vale reler qualquer wrapper novo por essa lente antes de
ele ganhar o segundo caller.

`BackBar` e o "Esqueci minha senha" usam `Pressable` direto e nunca tiveram o problema.

### Ajuste de espaço em `lançar` (reversível)
Com o teclado colapsado, tudo que sobrava de altura empoçava numa faixa morta acima das teclas. A
grade correta come ~225dp em vez de ~56dp e resolve a maior parte disso. O resto foi entregue ao
**readout**: `flexGrow` no bloco da cifra em vez de ar acumulado no fim. O espaço vazio passa a ficar
em volta da única coisa pela qual esta tela existe, e descrição/categoria descem para onde o polegar
já está. **Não foi pedido, e sai limpo:** remover `readoutBlock` e o `flexGrow: 1` de `scroll`.

**A verificar no aparelho:** `readoutBlock` cresce com `flexShrink` no padrão. Quando o teclado do
sistema abre para Descrição o `ScrollView` encolhe, e a cifra de 44px está numa caixa que pode
encolher junto.

### A tela
A Home afirma que não precisa de lista de contas a vencer porque *"cada degrau da metade projetada já
é essa lista"*. Isso é verdade sobre a **forma** — e é exatamente por isso que o Razão existe: a
forma diz *quanto* e *quando*, e não tem como dizer *o quê*. O Razão é a mesma linha lida como nomes.

**Sem fronteira de mês.** Uma conta que vence no dia 2 é a próxima coisa depois de uma que vence no
dia 30. Uma lista que para na borda do mês faz o dono emendar de cabeça. A `MonthStepper` é da Home,
onde a pergunta é sobre *um* mês; aqui a fita corre direto e o mês só aparece como carimbo no dia.

**A sacada: a régua do dia gruda no topo carregando o saldo daquele ponto.** Em todo o resto do app
uma régua diz "um grupo começa aqui". Aqui ela também segura a cifra corrente, e fica sob o polegar
enquanto as linhas do dia passam por baixo. **Rolar o razão é arrastar o dedo pela curva da Home** —
e a gramática é a mesma: régua sólida sobre um dia que aconteceu, tracejada sobre um ainda previsto,
com o mesmo `strokeDasharray="3 5"` da projeção do gráfico. Existe **uma** costura, e é hoje: a única
régua desta tela com direito a ser mais clara que um hairline.

**Cartão fora, como no saldo.** Uma cifra corrente que o leitor não pode conferir somando as linhas
acima dela é pior do que nenhuma cifra corrente.

**Dia quieto não vira linha — exceto hoje.** O saldo só muda num dia que se moveu, então um dia
parado só afastaria as linhas que têm o que dizer.

### Defeitos encontrados antes do vidro
22. **A costura não renderizava.** O seed deixa hoje sem lançamento nenhum, então hoje não entrava na
    fita, então a régua de ink — o eixo inteiro da tela — simplesmente não existia, e a lista abria
    no dia 3. Corrigido no **domínio**, não na tela: hoje está sempre na fita, movido ou não. Uma
    terça-feira parada é ruído; um hoje parado é o eixo contra o qual todas as outras linhas são
    lidas. Coberto por `hoje esta sempre na fita, tenha se movido ou nao`, que também prova que hoje
    não é forçado para dentro de uma janela da qual está fora.
23. **`getItemLayout` com altura chumbada seria mentira em escala de fonte 1.3.** É ele que faz a
    tela abrir em hoje em vez de no começo da história, e ele só é honesto se o número que reporta
    for o número que a linha ocupa. As alturas saem da escala tipográfica multiplicada por
    `fontScale`, e a mesma aritmética que estima a linha é a que a dimensiona. Todo rótulo dentro
    está preso a uma linha.

### Verificação
`npm run ledger` — **31 checagens**, seis novas. A que importa: **a fita e a curva não podem
discordar sobre onde o mês termina.** Se discordarem, uma das duas telas está mentindo.

    a fita do razao fecha com a curva do mes
    a fita caminha: cada dia e o anterior mais o que se moveu
    hoje esta sempre na fita, tenha se movido ou nao
    a fita nunca inventa um dia que ja passou, nem repete um que nao passou
    linha de credito nao entra na fita

Com o razão do seed: 103 dias, 254 linhas, abre em `2026-09-02` com saldo `R$ 2.391,77` — o mesmo
número que a Home põe no hero. `npx tsc --noEmit` limpo.

### A verificar no aparelho
- **`stickyHeaderIndices` numa `FlatList` virtualizada.** É a sacada inteira. Se o Android não
  honrar, os cabeçalhos rolam como qualquer linha — um razão mais simples, não um razão quebrado.
- **`initialScrollIndex` aterrissa exatamente em hoje?** Se o layout medido discordar de
  `getItemLayout`, o `onScrollToIndexFailed` cai no offset aproximado.
- **A régua tracejada aparece?** Depende da largura medida chegar antes; até lá é uma régua sólida
  fraca, que ainda lê como dia.

### Navegação entre abas
`router.replace` com `animation: 'fade'`, para as duas. Aba é mudança de contexto, não irmã numa
sequência — e replace impede que as duas empilhem uma sobre a outra. **Custo conhecido, não
resolvido:** o botão voltar do Android a partir de uma aba sai do app em vez de voltar para `início`.
Entra quando a terceira aba existir e o comportamento tiver com o que ser consistente.

---

---

## Fase 4.2 — Ajustes, e o trinco

A única tela do app que fala sobre o app, e não sobre o dinheiro.

### A sacada: a marca é o controle
A identidade inteira do OTTO é que os dois O são olhos, e que eles **se fecham enquanto a senha está
mascarada** — o produto dizendo, na única língua que um logo tem, que não está lendo por cima do seu
ombro. O trinco é esse mesmo gesto promovido de reação a **configuração**: liga e OTTO fecha os olhos
e fica assim; desliga e ele abre, arregalado, porque foi você que decidiu abrir. O estado do trinco
não é *relatado* pela marca — ele **é** a marca.

Isso só é permitido porque a linha também diz o estado em palavras. Os olhos são a leitura; nunca são
a única cópia dela.

**Como isso foi ligado, e o que não foi feito.** A tentação era dirigir os olhos pelo canal de
atenção (`setFocus({ focused: true, secure: true })`), que produz exatamente o estado certo na marca.
Seria errado: a luz de borda da `Screen` também escuta `focus`, e um trinco ligado deixaria o rim
permanentemente inclinado — dizendo que um campo está focado quando nenhum está. O canal de atenção
carrega o que está **acontecendo com um controle**, não uma preferência guardada. Então entrou um
terceiro `Mood` no `Wordmark`: `guard`. E ele usa `lidShut`, não `lidDone` — `lidDone` é o arco
virado para cima, que é satisfação, e guardar não é satisfação.

### O trinco é um trinco de verdade
Um toggle que grava uma preferência e não guarda nada é um controle nomeando uma ação que não
executa — o que a própria `TabBar` se recusa a desenhar. Então ele fica mesmo entre um start frio e o
razão: `app/index.tsx` é o portão, `app/desbloquear.tsx` é a porta.

Duas garantias, as duas sobre **não trancar o dono para fora do próprio dinheiro**:

- **Ligar exige uma autenticação bem-sucedida antes de gravar.** Se o sensor não responde agora, não
  vai responder no lançamento — e descobrir isso depois é descobrir trancado.
- **A porta sempre oferece uma saída que não depende do sensor.** O cadastro biométrico pode ser
  removido do sistema depois que o trinco foi ligado. Sair da conta limpa a sessão e cai no
  `sign-in`: custa um login e **não custa o razão**, que fica intacto no banco. A saída só aparece
  depois que o sensor recusou de fato, então não é atalho para furar o trinco.
- E uma terceira, mais silenciosa: um `'1'` guardado num aparelho que não consegue mais autenticar
  **não é honrado**. O trinco simplesmente deixa de ser trinco no momento em que não consegue fazer o
  trabalho dele. A saída de emergência não basta sozinha.

**Escopo dito em voz alta, no rótulo.** O portão é `index.tsx`, então vale no start frio e não no
retorno de segundo plano. A legenda diz exatamente isso: *"Vale ao abrir o app do zero. Trocar de
tela ou voltar de outro aplicativo não pede de novo."* Um cadeado cuja cópia promete mais do que ele
faz é pior que nenhum cadeado — o rótulo e o portão foram decididos juntos, não um depois do outro.

### O resto da tela
- **Identidade**: nome, e-mail, como entrou, desde quando.
- **Seu razão**: quantos lançamentos, recorrências, contas, desde quando. É o único lugar onde o app
  descreve o próprio conteúdo.
- **Recarregar o razão de exemplo**: destrutivo, então confirma no próprio rótulo — o segundo toque
  é a confirmação, sem `Alert` do sistema, que seria a primeira caixa de diálogo do app.
- **Sair da conta**, que estava estacionado no fim do scroll da Home com um comentário dizendo que
  mudaria para cá quando cá existisse.

**O trinco é uma régua que desliza, não uma pílula que preenche.** A resposta deste app para "este
aqui está escolhido" é sempre uma régua — o marcador da barra, o segmentado de `lançar`, a linha de
foco de um campo. Um `Switch` de sistema seria a segunda gramática de seleção do app.

### Mudança na tela aprovada
"Sair da conta" saiu da Home. É a terceira alteração na tela aprovada nesta sessão, junto com os
chevrons do mês e a área de toque do disco (defeito 21).

### Defeitos corrigidos antes do vidro
24. **A sacada podia não renderizar em repouso.** `wake` e `shut` nasciam em zero e só chegavam a 1
    por reação. Todo o resto do sistema de olhos é evento, e evento tem reação para carregá-lo — mas
    `guard` é um estado no qual a marca pode **nascer**: ajustes aberto com o trinco já ligado. Os
    dois shared values passam a ser semeados de `mood`. Sem isso, olhos fechados existiriam apenas
    através de uma animação que pode não rodar, e a legenda diria "de olhos fechados" sobre uma marca
    sem nenhum. É o defeito 2 deste projeto, dito de novo — e a regra que ele criou, aplicada a um
    caso que ela ainda não tinha alcançado.
25. **A confirmação do reseed ficava armada para sempre.** Confirmar na própria linha em vez de num
    `Alert` mantém a voz única do app — não existe caixa de diálogo em lugar nenhum dele. Mas um
    estado armado sem saída é armadilha: o próximo toque perdido naquela linha apaga o razão. Agora
    desarma sozinho em 4s, que é o "cancelar" que o diálogo teria tido.
26. **A porta era uma rota alcançável sem sessão.** `index.tsx` garante a ordem, mas o expo-router
    monta `/desbloquear` num deep link do mesmo jeito, e o caminho de saída dela pressupõe uma sessão.
    Uma porta na frente de um cômodo vazio é só uma parede — agora redireciona para `sign-in`.

### A verificar no aparelho
- **`expo-local-authentication` responde no Expo Go?** Se `hasHardwareAsync` ou `isEnrolledAsync`
  vierem falsos, a linha renderiza desabilitada dizendo por quê — correto, mas a sacada não aparece,
  porque não há estado ligado para a marca carregar. Isto decide a forma da tela e só o aparelho
  responde.
- **A pálpebra lê como guarda?** É a mesma de senha mascarada, agora parada em vez de reativa.
- **O trinco realmente barra o start frio?** Fechar o app pelo multitarefa e reabrir.
- **A saída de emergência funciona?** Cancelar o prompt duas vezes deve revelar "Sair da conta".

---

---

## Fase 4.3 — Análise, e o mesmo dia do mês

A barra está completa. Os quatro destinos existem.

A Home responde *onde eu estou*; o razão responde *o quê*. Sobra uma pergunta que nenhum dos dois
alcança: **"isso é normal?"** — e ela não tem resposta num número sozinho. R$ 1.200 de mercado não
significa nada até estar ao lado dos R$ 900 que o dono costuma gastar. Então nada nesta tela é um
total puro: toda cifra é uma comparação, e o comparado é sempre o próprio dono.

### A sacada: o mesmo dia do mês
Ler um mês de dois dias contra meses de trinta é **exatamente** a classe de número silenciosamente
errado contra a qual o `PRODUCT.md` foi escrito — anunciaria uma economia triunfal no dia 2 de todo
mês, para sempre. Então a parte sólida de cada régua cobre o mesmo trecho de cada mês, e a cauda
fraca é o resto daqueles meses, que de fato aconteceu e não pode ser escondido. **O traço que
atravessa a régua é a mediana do próprio dono**: passou dele, gastou mais que o normal; ficou aquém,
gastou menos.

O traço é a única marca neste app com direito de cruzar uma régua, e ela merece: é a referência
contra a qual a régua está sendo medida, então tem de estar na mesma linha, não ao lado. `PaceBars`
é `RuleBars` fazendo mais um trabalho — nada novo entra no vocabulário.

### Decisões de aritmética que a tela não pode contradizer
- **`covered`: um mês só é comparável se o primeiro lançamento cai no dia 1 dele ou antes.** Um mês
  cujos primeiros dias antecedem o razão não é um mês frugal — é um mês que o razão não viu. Deixá-lo
  entrar puxaria a mediana para zero e diria ao dono que ele está estourando contra um passado que
  nunca existiu. Isso **descarta o mês em que o razão nasceu**, a menos que tenha nascido no dia 1:
  aqueles primeiros dias são inconhecíveis — nada distingue "não gastou" de "ainda não registrava" —
  e uma comparação sobre um inconhecível é pior que um mês a menos de história.
- **O dia de leitura é aparado ao tamanho de cada mês.** Uma leitura no dia 31 compararia fevereiro
  até o dia 31, uma janela que não existe, e fevereiro voltaria como o mês mais econômico da vida do
  dono. Mesma regra de aparo que `occurrences()` já aplica.
- **Abaixo de dois meses comparáveis não existe normal**, e a tela diz isso em vez de desenhar uma
  mediana com n=1. Com um razão jovem esse é o estado mais provável da primeira vez que a tela abre —
  não é polimento, é a aparência principal dela.
- **"Normal" inclui tudo que saiu.** Compromissos fixos — parcela, assinatura — estão dos dois lados
  da comparação, então se cancelam no delta: o número que o dono lê já é sobre a parte que ele
  controla, sem o módulo precisar adivinhar quais categorias são discricionárias. Adivinhar isso
  seria um segundo modelo da vida do dono, não verificável, morando ao lado do razão.
- **Uma categoria que sumiu conta como zero, não como ausente** — ao contrário de um mês não coberto.
  Não comprar nada numa categoria é um fato real sobre aquele mês; um mês que o razão não viu não é.

### Verificação
`npm run ledger` — **38 checagens**, sete novas. A que amarra as duas leituras: **o passo do mês, no
último dia de um mês fechado, tem de ser igual ao total daquele mês.** Se puderem discordar, uma das
duas cifras na tela está mentindo.

Com o razão do seed, em `2026-09-02`: base de 2 meses, saiu `R$ 52,98` até o dia 2, normal
`R$ 117,01`, ou seja `−R$ 64,03`. Julho e agosto entram; março a junho ficam de fora por `covered`.
`npx tsc --noEmit` limpo.

### Defeitos corrigidos antes do vidro
27. **O traço se alinhava por coincidência.** Ele era posicionado em porcentagem contra a linha,
    não contra a trilha que anota — batia só porque a linha por acaso não tinha padding horizontal, e
    dessaria em silêncio no dia em que alguém pusesse um. Agora os dois resolvem a porcentagem contra
    a mesma caixa.
28. **`current` carregava dois significados.** No gráfico mês a mês ele distingue a linha viva das
    fechadas; no de categorias não queria dizer nada, e estava sendo passado só para conseguir o
    tratamento claro. Invertido para `past`, então o padrão é a leitura viva e quem opta por sair é o
    mês fechado. Uma prop com dois sentidos é um gráfico que renderiza errado na primeira vez que
    alguém reusar o componente.

### A verificar no aparelho
- **Com o seed, `basis` é exatamente 2 — o mínimo.** O veredito deve renderizar, e não o estado
  vazio. E `mês a mês` deve mostrar **três** linhas (JUL, AGO, SET), não sete: se os quatro meses não
  cobertos vazarem para o gráfico, o filtro `covered` não está fazendo o trabalho dele.
- **O traço aparece sobre a régua do mês corrente**, e à direita dela (o mês está abaixo do normal).
- A cauda fraca de JUL e AGO é bem mais longa que a parte sólida — é o resto daqueles meses.

---

---

## Fase 5 — Contas e cartões

### A sacada: "linha de crédito não é dinheiro", desenhada
Este app já fez essa afirmação três vezes em comentário e uma em aritmética — o saldo exclui contas
de cartão, a fita exclui, a projeção exclui. Esta é a tela onde ela vira algo que se **vê**. Acima da
divisória está o que o dono tem; abaixo, o que ele deve e quando. Nada atravessa, e a cifra do topo
conta só a metade de cima. A divisória é a **única régua em ink** da tela: as outras são fronteiras
de grupo, essa é a afirmação.

Um cartão difere de uma conta numa coisa que importa: ele tem uma data em que vira dinheiro de
verdade. Então cada cartão carrega o ciclo como uma **régua do tempo** — sólida até hoje, seguindo
até o fechamento e daí até o vencimento. Mesma gramática sólido/tracejado da curva da Home, dizendo a
mesma coisa: atrás de você é fato, à frente é previsão.

**Nada aqui adivinha um ciclo.** Um cartão sem dia de fechamento é um cartão cujo contrato o app não
conhece; ele diz isso e oferece os campos. Não é caso de borda: é o estado em que **todo** cartão
fica no instante em que a migração 2 chega num razão que já existia.

### Migração 2, e o que ela obrigou
`ALTER TABLE accounts ADD COLUMN closing_day / due_day / limit_cents`, todas nulas. O SQLite não
adiciona coluna `NOT NULL` a uma tabela com linhas sem inventar um default, e inventar um dia de
fechamento seria pior do que não ter nenhum — esses dois números são fatos sobre um contrato.

**`reset()` em `client.ts` ganhou a dependência escrita.** Ele lista `DROP TABLE` para exatamente
três tabelas e zera o `user_version`. Como a migração 2 só adiciona colunas a `accounts`, derrubar
`accounts` ainda limpa tudo — mas uma migração futura que crie uma tabela **tem** de acrescentá-la
ali no mesmo edit, ou o botão de recarregar dos ajustes bate num `CREATE TABLE` de tabela existente,
estoura dentro da transação e deixa o banco pela metade.

### O defeito que só a varredura pegou
29. **A fatura podia vencer no dia em que fechou.** O mês do vencimento era decidido comparando os
    dias **crus** (`dueDay > closingDay`), e não os já aparados ao tamanho do mês. Um cartão que
    fecha dia 30 e vence dia 31 tem `31 > 30`, então o vencimento era arquivado no mês do
    fechamento — e em setembro os dois aparam para 30. Fevereiro colapsa igual para qualquer par
    acima do dia 28. **Aparar primeiro, comparar depois.**

    Nenhum caso pontual teria achado isso. A checagem que achou varre as 31 × 6 × 5 = 930
    combinações de dia de fechamento, dia de vencimento e data de leitura, e assere os invariantes:
    o vencimento é sempre estritamente depois do fechamento, a fatura corrente é sempre a próxima a
    vencer, e a janela de compras nunca é invertida. **Os dois dias são entrada do dono, então toda
    combinação é alcançável** — um teste de amostra aqui é um teste de sorte.

### Decisões
- **O vencimento vem normalmente *antes* do fechamento, em número.** Um cartão brasileiro que fecha
  dia 28 vence dia 10 — do mês seguinte. Tratar isso como caso de borda erraria o cartão comum, então
  a regra é dita ao contrário: o vencimento fica no mês do fechamento quando é estritamente depois
  dele, e no mês seguinte em qualquer outro caso.
- **A fatura corrente é a próxima a vencer.** Antes do fechamento é a que ainda acumula; entre
  fechar e vencer é a que fechou e espera pagamento. Uma leitura de cada vez, que é o que permite
  desenhá-la como uma régua só em vez de duas cifras concorrendo.
- **A fatura conta só o que foi lançado no cartão.** Deliberadamente **não** é a `series` de tipo
  `card` que o razão também guarda: aquela é o *pagamento* saindo da conta corrente, um evento
  diferente numa conta diferente, e somar os dois contaria uma compra duas vezes.
- **Uso do limite não é travado no cheio.** Um cartão estourado é o único caso em que o número mais
  importa, e uma barra que para no cheio esconderia exatamente ele.
- **`lançar` ganhou seletor de conta, e só quando há escolha.** Uma conta só não é uma decisão, e um
  seletor de opção única é um controle perguntando algo que já sabe. Cartões não são oferecidos.

### O que ficou de fora, e por quê
- **Compras lançadas direto no cartão.** Elas exigem primeiro uma decisão de modelagem que ainda não
  foi tomada: se uma compra no cartão é gasto, então o pagamento da fatura **não é** gasto, é
  transferência — senão `spendByCategory` e a análise contam o mesmo dinheiro duas vezes. Enquanto
  isso não estiver resolvido, o seed não põe compras no cartão e a fatura lê `R$ 0,00`, com a tela
  dizendo isso em palavras. É a Fase 6 que deve isso.
- **Criar e apagar contas.** A tela lê e edita o ciclo; ela não cria. O razão do dono tem as contas
  que o seed criou.
- **Estorno no cartão.** `statementTotal` conta só saídas, então uma compra devolvida não reduz a
  fatura. Mesma lacuna de modelagem do item acima, e ela se resolve junto.
- **O seletor de conta em `lançar` pode cair abaixo da dobra** quando existirem duas ou mais contas.
  Está dormente hoje, porque o seed cria uma só. Medir quando aparecer, não adivinhar agora.
- **"Statement projection"** no sentido de prever o valor de uma fatura futura — depende do item
  acima.

### Verificação
`npm run ledger` — **48 checagens**, dez novas. Com o seed, em `2026-09-02`: conta corrente
`R$ 2.391,77` (o mesmo hero da Home), cartão Nubank com janela `2026-07-29 → 2026-08-28`, fechada há
5 dias, vence em 8, limite `R$ 8.000`. `npx tsc --noEmit` limpo.

### A verificar no aparelho
- **A migração 2 roda num banco que já existe.** É a primeira migração incremental deste projeto e a
  única coisa desta fase que pode falhar de forma silenciosa e destrutiva. Se `accounts` vier sem as
  colunas, a tela mostra "sem ciclo configurado" para o Nubank em vez do ciclo.
- **O botão de recarregar dos ajustes ainda funciona** depois da migração 2 — é o caminho que passa
  por `reset()`.
- **Salvar o ciclo persiste**: editar, sair da tela, voltar.
- **A divisória lê como afirmação**, e não como mais uma fronteira de grupo.

---

---

## Fase 6 — Assinaturas e dívidas

A fase que torna o app usável de verdade. Até aqui nenhuma recorrência podia ser criada: só o seed as
criava, e um app financeiro em que você não consegue cadastrar o próprio aluguel é uma demonstração,
não um produto.

### A sacada: uma regra custa alguma coisa, e ninguém soma
Todo o resto do OTTO é o razão — fatos que aconteceram ou que o motor diz que vão acontecer. Esta é a
outra metade: as **regras** que os produzem. A partitura, não a música.

E o que uma regra tem que um fato não tem é um **custo ao longo da vida**. O Spotify não é R$ 21,90;
é **R$ 262,80 por ano**. Ninguém pensa nele assim, e é exatamente essa segunda cifra que faz alguém
cancelar uma assinatura. É a única coisa que esta tela pode dizer que nenhuma outra do app diz, então
toda recorrência a carrega — e no formulário ela aparece **enquanto você digita**: ver `R$ 263 por
ano` surgir enquanto se escreve `21` é o momento em que a ideia trabalha.

Para uma dívida o número se inverte: não o que custa manter, mas **quanto falta e quando para** —
contado em parcelas, nunca arredondado em porcentagem, porque quantas faltam é o único fato sobre o
qual o dono age.

E acima de tudo, a cifra que é o motivo de abrir a tela: **quanto o mês tem de livre antes de você
gastar qualquer coisa.**

### O anual sai do motor, não de uma multiplicação
`yearCents` é contado rodando `occurrences()` sobre a janela, não `12 × parcela`. Isso herda de graça
— e de forma idêntica a todas as outras telas — o aparo de dia do mês, a data de fim e a contagem de
parcelas. Uma assinatura cancelada em março custa até março; uma dívida com três parcelas custa três.

**A janela são doze meses de calendário**, do primeiro dia deste mês ao último do décimo primeiro
adiante — não "as próximas doze ocorrências". Ancorar em `today` pegaria treze ocorrências para uma
série cujo dia ainda não chegou neste mês e onze para uma cujo dia já passou: a **mesma** assinatura
reportando dois custos anuais diferentes conforme o dia em que fosse olhada. Quem pergunta quanto
algo custa por ano está perguntando sobre um ano.

A checagem que trava isso varre 5 dias do mês × 4 datas de leitura e assere `count === 12` e
`yearCents === 12 × parcela` em todas. É um off-by-one que nunca apareceria na tela.

### Decisões
- **Fatura de cartão conta como saída comprometida comum.** Hoje o razão não guarda compras lançadas
  no cartão, então a série da fatura **é** todo aquele dinheiro. Se compras no cartão passarem a
  existir como lançamentos, ela vira a perna de pagamento de dinheiro já contado e este módulo muda
  junto. Dito no código, não deixado para ser descoberto.
- **Dívida quitada some dos compromissos** — some da lista e para de pesar no mês.
- **Dívidas ficam separadas de saídas comuns** porque a leitura é diferente, mas continuam somando em
  `monthlyOut`. Uma parcela é peso no mês mesmo tendo fim.
- **`startDate` de uma dívida nova com parcelas já pagas volta `paidCount` meses.** O motor numera as
  parcelas a partir de `startDate`; sem isso uma dívida 8/24 se reportaria como 1/24 na primeira
  projeção.
- **Apagar uma recorrência não apaga o histórico.** `entries.series_id` é `ON DELETE SET NULL`, então
  os lançamentos que ela já liquidou continuam no razão e perdem o vínculo. É a forma correta, e a
  tela **diz isso**: *"Para de acontecer daqui para a frente. O que já foi lançado continua no
  razão."* Sem essa frase o dono assume que apagar a regra apaga a história. Confirmação pelo mesmo
  padrão arma/desarma dos ajustes, sem caixa de diálogo — o app não tem nenhuma.
- **Três formas, não quatro.** O `kind` do modelo unificado vira três perguntas em linguagem de dono:
  SAI, ENTRA, TERMINA. `card` não é oferecido como forma: uma fatura é consequência de um cartão, e
  cartão se cadastra em contas.

### Verificação
`npm run ledger` — **55 checagens**, sete novas, todas passando de primeira. Com o seed, em
`2026-09-02`: entram `R$ 7.400`, prometidos `R$ 4.341,88`, **livre `R$ 3.058,12`**. Spotify
`R$ 263/ano`, Netflix `R$ 539/ano`, Notebook 5/12 com 7 ocorrências no ano — porque só faltam 7.
`npx tsc --noEmit` limpo.

### Defeitos corrigidos antes do vidro
30. **O botão de criar ficava ativo antes de existir conta para lançar.** O razão chega depois do
    primeiro render, então a conta é algo pelo que o formulário **espera** — não algo que ele supõe.
    Sem isso o dono tocava e recebia "nenhuma conta encontrada" sem nada explicando o porquê. A conta
    entrou na condição de validade.
31. **Editar "parcelas já pagas" produzia uma dívida inconsistente.** `remaining` conta a partir de
    `paidCount`; o motor numera as parcelas a partir de `startDate`. São **duas grafias do mesmo
    fato**, e preservar o início antigo enquanto o dono corrige de 5 para 8 fazia as duas
    discordarem — a tela contando quatro restantes enquanto o razão seguia numerando pelo calendário.
    Agora uma dívida sempre deriva o início do número de parcelas pagas, na edição como na criação, e
    uma checagem varre `paidCount` de 0 a 23 provando que a próxima parcela que o motor produz é
    sempre `paidCount + 1`. É a classe de defeito que as checagens cobriam para a criação e não para
    a mutação.
32. **Código morto com uma resposta plausivelmente errada dentro.** `ends()` tinha um fallback para
    séries sem data de fim que nunca é alcançado — só `endDate` encurta uma série que não é dívida, e
    dívidas têm grupo próprio. Um fallback inalcançável carregando uma conta errada é pior que
    nenhum código.

### Defeitos vistos no aparelho — Ajustes
33. **A correção do defeito 24 causou o defeito 33.** Semear `wake` e `shut` em 1 para `guard`
    acertou a aritmética e, ao fazer isso, **removeu a única coisa que escrevia o valor no nó SVG
    nativo: a mudança.** O Reanimated commita um prop animado quando o valor muda; `withTiming(1)` a
    partir de 1 não produz frame nenhum, nada é commitado, e o `strokeOpacity={0}` estático do JSX
    permanece de pé. Resultado no vidro: **uma marca sem pálpebras sob uma legenda dizendo "de olhos
    fechados"** — a sacada inteira da tela ausente.

    Correção: o prop estático carrega o valor de repouso do mood atual (`strokeOpacity={lidRest}`),
    e a animação passa a apenas mover entre repousos. É a regra mais antiga deste projeto — *a
    animação nunca é o único caminho para o estado estático correto* — e o remendo do 24 a quebrou
    tornando o estado certo alcançável **só** por uma animação que não tinha motivo para rodar.

    **A lição que fica maior que o defeito:** semear um shared value no valor de destino é seguro
    para a aritmética e perigoso para o desenho. Todo atributo dirigido por `useAnimatedProps`
    precisa que o atributo estático correspondente no JSX seja o repouso correto, porque é ele que
    vale até a primeira mudança — e pode não haver nenhuma.
34. **O trinco lia como um botão com um sinal de menos.** Era uma cápsula com borda e um traço
    dentro. Este app responde "este aqui está escolhido" com uma **régua** em todo lugar — o marcador
    da barra, o segmentado do lançar, a linha de foco de um campo — e uma cápsula era a segunda
    gramática de seleção do app entrando pela porta dos fundos. Virou o que sempre devia ter sido:
    uma régua com um segmento que desliza sobre ela.

### O que o aparelho confirmou
- **`expo-local-authentication` responde no Expo Go.** A pergunta que decidia a forma da tela está
  respondida: "Reconhecimento facial · ligado". A sacada tem estado para carregar.
- **Defeito 21 corrigido**: os rótulos da barra estão separados e legíveis nos cinco slots.
- A migração 2 não derrubou a leitura do razão: 158 lançamentos, 10 recorrências, 1 conta, 1 cartão.

### A verificar no aparelho
- **Criar uma recorrência e ver o razão mudar.** É o primeiro caminho de escrita de `series` que
  não passa pelo seed, e o razão e a Home projetam sobre ela imediatamente.
- **O anual aparece enquanto se digita**, no bloco abaixo da categoria.
- **Editar uma dívida existente** — abrir "Notebook", ver 5/12 preenchido, salvar sem mudar nada e
  confirmar que o razão não se move.
- **Apagar**: dois toques, e o aviso sobre o histórico é legível antes do segundo.

---

---

## Fase 6 — Assinaturas e dívidas

A fase que torna o app usável de verdade. Até aqui nenhuma recorrência podia ser criada: só o seed as
criava, e um app financeiro em que você não consegue cadastrar o próprio aluguel é uma demonstração,
não um produto.

### A sacada: uma regra custa alguma coisa, e ninguém soma
Todo o resto do OTTO é o razão — fatos que aconteceram ou que o motor diz que vão acontecer. Esta é a
outra metade: as **regras** que os produzem. A partitura, não a música.

E o que uma regra tem que um fato não tem é um **custo ao longo da vida**. O Spotify não é R$ 21,90;
é **R$ 262,80 por ano**. Ninguém pensa nele assim, e é exatamente essa segunda cifra que faz alguém
cancelar uma assinatura. É a única coisa que esta tela pode dizer que nenhuma outra do app diz, então
toda recorrência a carrega — e no formulário ela aparece **enquanto você digita**: ver `R$ 263 por
ano` surgir enquanto se escreve `21` é o momento em que a ideia trabalha.

Para uma dívida o número se inverte: não o que custa manter, mas **quanto falta e quando para** —
contado em parcelas, nunca arredondado em porcentagem, porque quantas faltam é o único fato sobre o
qual o dono age.

E acima de tudo, a cifra que é o motivo de abrir a tela: **quanto o mês tem de livre antes de você
gastar qualquer coisa.**

### O anual sai do motor, não de uma multiplicação
`yearCents` é contado rodando `occurrences()` sobre a janela, não `12 × parcela`. Isso herda de graça
— e de forma idêntica a todas as outras telas — o aparo de dia do mês, a data de fim e a contagem de
parcelas. Uma assinatura cancelada em março custa até março; uma dívida com três parcelas custa três.

**A janela são doze meses de calendário**, do primeiro dia deste mês ao último do décimo primeiro
adiante — não "as próximas doze ocorrências". Ancorar em `today` pegaria treze ocorrências para uma
série cujo dia ainda não chegou neste mês e onze para uma cujo dia já passou: a **mesma** assinatura
reportando dois custos anuais diferentes conforme o dia em que fosse olhada. Quem pergunta quanto
algo custa por ano está perguntando sobre um ano.

A checagem que trava isso varre 5 dias do mês × 4 datas de leitura e assere `count === 12` e
`yearCents === 12 × parcela` em todas. É um off-by-one que nunca apareceria na tela.

### Decisões
- **Fatura de cartão conta como saída comprometida comum.** Hoje o razão não guarda compras lançadas
  no cartão, então a série da fatura **é** todo aquele dinheiro. Se compras no cartão passarem a
  existir como lançamentos, ela vira a perna de pagamento de dinheiro já contado e este módulo muda
  junto. Dito no código, não deixado para ser descoberto.
- **Dívida quitada some dos compromissos** — some da lista e para de pesar no mês.
- **Dívidas ficam separadas de saídas comuns** porque a leitura é diferente, mas continuam somando em
  `monthlyOut`. Uma parcela é peso no mês mesmo tendo fim.
- **`startDate` de uma dívida nova com parcelas já pagas volta `paidCount` meses.** O motor numera as
  parcelas a partir de `startDate`; sem isso uma dívida 8/24 se reportaria como 1/24 na primeira
  projeção.
- **Apagar uma recorrência não apaga o histórico.** `entries.series_id` é `ON DELETE SET NULL`, então
  os lançamentos que ela já liquidou continuam no razão e perdem o vínculo. É a forma correta, e a
  tela **diz isso**: *"Para de acontecer daqui para a frente. O que já foi lançado continua no
  razão."* Sem essa frase o dono assume que apagar a regra apaga a história. Confirmação pelo mesmo
  padrão arma/desarma dos ajustes, sem caixa de diálogo — o app não tem nenhuma.
- **Três formas, não quatro.** O `kind` do modelo unificado vira três perguntas em linguagem de dono:
  SAI, ENTRA, TERMINA. `card` não é oferecido como forma: uma fatura é consequência de um cartão, e
  cartão se cadastra em contas.

### Verificação
`npm run ledger` — **54 checagens**, seis novas, todas passando de primeira. Com o seed, em
`2026-09-02`: entram `R$ 7.400`, prometidos `R$ 4.341,88`, **livre `R$ 3.058,12`**. Spotify
`R$ 263/ano`, Netflix `R$ 539/ano`, Notebook 5/12 com 7 ocorrências no ano — porque só faltam 7.
`npx tsc --noEmit` limpo.

### A verificar no aparelho
- **Criar uma recorrência e ver o razão mudar.** É o primeiro caminho de escrita de `series` que
  não passa pelo seed, e o razão e a Home projetam sobre ela imediatamente.
- **O anual aparece enquanto se digita**, no bloco abaixo da categoria.
- **Editar uma dívida existente** — abrir "Notebook", ver 5/12 preenchido, salvar sem mudar nada e
  confirmar que o razão não se move.
- **Apagar**: dois toques, e o aviso sobre o histórico é legível antes do segundo.

---

---

## Fase 6.1 — a troca de aba

Feedback do aparelho: *"as transições estão muito secas e nada fluidas quando eu troco de aba"*.
Estava certo, e a lição para consertar já estava escrita neste arquivo desde a Fase 1.8 — só não
tinha sido aplicada onde mais importava.

**Três causas, e a maior delas não era a duração.**

**1. Uma troca de aba não tinha direção.** As quatro abas têm posição: elas ficam numa fileira, nessa
ordem, no rodapé. Ir de `início` para `análise` é ir **para a direita**, e nada carregava esse vetor.
Um fade não tem direção nenhuma; ele não dá ao olho nada para seguir, e é literalmente disso que
"seco" é feito. Agora `src/lib/nav.ts` guarda de onde o dono veio e devolve o sinal, e o conteúdo
entra viajando desse lado — a mesma solução que `sign-up` já usava.

O estado mora fora do React porque é lido durante o **primeiro render** da tela que chega, antes de
qualquer efeito. Um hook chegaria um frame atrasado, e um frame atrasado aqui é o assunto inteiro.

**2. Duas curvas no mesmo pixel.** A troca era um fade nativo **e** o fade do `Reveal`, os dois
animando a mesma opacidade no mesmo instante — o defeito que este projeto já tinha aprendido a
reconhecer na Fase 1.6. Pior: o fade nativo do Android é curto e não é alongável, então era ele quem
ditava o andamento de tudo. 200ms de dissolve com um sobe-e-desce de 12dp atrás.

As abas passaram a `animation: 'none'`. **A barra é o que fica** — ela aparece de uma vez, no mesmo
lugar, porque é a mesma barra — e o conteúdo é o que se move. Uma curva por pixel, e a transição
pertence ao conteúdo, que é onde a Fase 1.8 provou que ela tem de morar no Android.

**3. A barra não dizia de onde você veio.** Havia um marcador por item, aparecendo e sumindo. Agora
há **um** marcador para a barra inteira, e na chegada ele **viaja da aba que o dono acabou de deixar
até a que escolheu**. Um marcador que simplesmente aparece no lugar novo diz "você está aqui"; um que
desliza diz "você veio de lá", que é o fato de que a transição trata.

E a marca **olha para onde você foi**: `look(direction)` já existia para o push entre as telas de
acesso, e uma troca de aba é a mesma frase — o app mostrando ao que está atendendo. Reusa o canal em
vez de inventar um segundo.

### O defeito que a correção quase criou
35. **Sem animação nativa, não há nada cobrindo o vão até o primeiro irmão chegar.** Com a cascata
    começando em 90ms, o dono tocaria e receberia a barra sobre um fundo vazio antes de qualquer
    coisa aparecer — uma travada, e pior que o fade que ela substituiu, porque o fade ao menos
    cobria o buraco. A entrada foi partida em duas: `head` (a marca e a legenda) não viaja e não
    espera — a marca e a barra são o **quadro**, estão no mesmo lugar nas quatro abas e devem ler
    como se nunca tivessem saído. Só o que está dentro do quadro se move.

### Navegação centralizada
`TabBar` navega sozinha. Quatro telas repetindo o mesmo `switch` de rota é como quatro telas passam
a discordar sobre para onde uma aba leva — e a barra é justamente quem conhece a ordem dos próprios
slots, que é o que faz uma troca de aba ter direção.

### A verificar no aparelho
- **Existe algum frame vazio depois do toque?** É o risco que `animation: 'none'` cria e a única
  coisa que decide se isto lê como fluidez ou como uma travada mais longa.
- **O marcador viaja mesmo?** Ele depende de a store gravar `from` antes de o `replace` montar a
  tela nova. A ordem está certa no código; só o aparelho prova.
- **A marca olha para o lado certo** ao trocar de aba, e volta.
- **O corpo entra do lado certo:** indo para a direita na barra, o conteúdo vem da direita.

---

---

## Fase 6.2 — compras no cartão, e a dívida de modelagem paga

A dívida herdada da Fase 5, e o último buraco que impedia o app de ser usado num dia normal: no
Brasil a maior parte do mês passa no cartão, e até aqui `lançar` nem oferecia essa opção.

### A regra, dita uma vez e imposta pelo compilador
**Uma compra no cartão é gasto. O pagamento da fatura é transferência.**

Sair da conta e ser gasto não são o mesmo evento, e o cartão é onde os dois se separam. A compra é
gasto no dia em que acontece, na categoria à qual pertence, e não move saldo nenhum. A fatura que a
paga um mês depois move o saldo e **não é gasto** — é o mesmo dinheiro mudando de lugar.

Contar os dois reportaria uma ida ao mercado duas vezes: como `Mercado` quando foi comprada, e de
novo como `Cartão` quando a conta chegou. Até agora isso era evitado **por acaso** — não existiam
compras no cartão, então o pagamento *era* todo aquele dinheiro e contá-lo estava certo.

A prova, com o razão de exemplo, em `2026-09-02`:

    gastos dos últimos 30 dias, correto            R$ 4.700
    gastos se a fatura também contasse             R$ 5.940

R$ 1.240 de diferença — exatamente a fatura, contada duas vezes.

**O que identifica um pagamento é `kind: 'card'`, nunca o nome da categoria.** "Cartão" é uma palavra
que o dono pode renomear, reusar, ou digitar numa conta comum; `kind` é um fato sobre o modelo.

**`payments` é parâmetro obrigatório, não opcional.** Um default de "conta tudo" faria todo caller
futuro contar uma compra em dobro em silêncio, e o compilador é a única coisa que lembra disso de
forma confiável. Trocar a assinatura quebrou `home.tsx` e `analysis.ts` na hora, que é exatamente o
serviço que se queria dele.

### O que mudou em cada camada
- **`lançar` oferece cartões**, contas primeiro. E diz a consequência onde a escolha é feita: *"Não
  sai do seu saldo agora. Entra na fatura que fecha em 28 de ago."* Sem essa frase o dono registra
  uma compra, volta para a Home, vê a cifra parada e conclui que o app perdeu o lançamento. A frase
  só aparece quando um cartão está de fato escolhido, então nunca vira mobília.
- **A fatura abate estorno.** Um estorno é dinheiro voltando pela mesma linha por onde a compra saiu,
  e uma fatura que o ignorasse pediria pagamento por algo devolvido. É abatido, não descartado — e
  por isso o total pode ser negativo: um mês com mais estornos que compras realmente não deve nada, e
  diz isso.
- **`contas` mostra o que está na fatura**, não só quanto. A cifra é a mesma afirmação que a curva da
  Home faz — uma forma sem nomes — e a lista é a outra metade dela, na escala de um cartão.
- **O razão continua sem compras de cartão, e isso é deliberado.** A fita é a curva desdobrada, e a
  curva é o saldo; uma compra no cartão não move o saldo. Colocá-la ali quebraria a única invariante
  que a tela promete — que o saldo de cada linha se confere somando as linhas acima. O razão responde
  *o que mexeu no meu dinheiro*; a análise responde *no que eu gastei*. São perguntas diferentes, e o
  app já as separava.
- **O seed passou a gastar 45% das variáveis no cartão**, que é a forma de um mês brasileiro real —
  e sem isso não haveria como ver nada disto funcionando.

### Consequência na Home, que já estava aprovada
O saldo do razão de exemplo subiu de `R$ 2.391,77` para `R$ 6.891,51`: quase metade das despesas
variáveis agora entra na fatura em vez de sair da conta na hora. E a categoria "Cartão" **sumiu** dos
gastos por categoria, substituída pelas categorias reais das compras. Os dois números anteriores não
estavam errados para o razão que existia antes; eles descrevem um razão diferente.

### Verificação
`npm run ledger` — **61 checagens**, seis novas, todas passando de primeira. As que travam a regra:

    pagar a fatura nao e gastar
    so a serie de cartao e transferencia; uma conta comum nao
    uma entrada nunca e gasto, venha de onde vier
    uma compra no cartao nao mexe no saldo, e a fatura mexe
    a analise conta a compra e ignora o pagamento
    um estorno abate a fatura

A mais importante é a primeira: sobre uma janela que contém a compra **e** o pagamento, o dinheiro é
contado exatamente uma vez.

### Uma checagem que precisou deixar de depender do seed
`hoje esta sempre na fita` presumia que o razão de exemplo deixava hoje vazio. Ao adicionar compras
no cartão o gerador aleatório deslocou, e essa suposição caiu. A propriedade sob teste é sobre a
fita, não sobre o seed, então ela passou a construir o próprio razão. **Um teste que depende de uma
coincidência do gerador é um teste que o gerador pode revogar.**

### A verificar no aparelho
- **Lançar no cartão**: escolher o Nubank, ver a frase sobre a fatura, salvar — e confirmar que a
  Home **não** se move e que a fatura em contas **sobe** pelo mesmo valor.
- **A lista da fatura** em contas mostra as compras, com data e categoria.
- Nos gastos por categoria da Home não existe mais a categoria "Cartão".

---

---

## Fase 8 — Avisos

A última fase de produto. O que faz o app alcançar o dono sem ele lembrar de abrir.

### A sacada: OTTO só fala quando sabe de algo que você não sabe
*"O aluguel vence amanhã"* não é isso — foi o dono que cadastrou o aluguel, ele sabe quando cai. Mas
**"amanhã o aluguel deixa seu saldo negativo em R$ 340"** é: exige o saldo, a projeção e a aritmética
entre os dois, e não há como saber sem abrir o app e fazer a conta.

Então todo aviso carrega uma **consequência**, nunca um evento. E essa é também a razão honesta de
existirem tão poucos. O `PRODUCT.md` já dizia que um alerta que está sempre lá vira mobília que o
dono aprende a pular; uma notificação que dispara todo dia 4 é pior que mobília — é mobília que
vibra.

Dois avisos, e ambos ficam calados na maior parte do tempo:

- **O vermelho.** O mês mergulha, e OTTO sabe o dia e o valor. Dispara na **véspera**, não no dia: o
  valor de saber está inteiro em ainda haver tempo de agir. Um só por mês, mesmo que o mês mergulhe
  várias vezes — a primeira travessia é a que ainda dá para evitar, o resto é consequência dela. E
  **nomeia a causa**, porque a projeção já sabe qual conta empurrou para baixo.
- **A fatura, no fechamento** — nunca no vencimento. No vencimento não há mais nada a decidir e o
  dono está sendo lembrado de uma conta que ele conhece. No fechamento a cifra ainda está andando, e
  saber é a diferença entre uma compra que cai neste mês e uma que espera.

### Decisões
- **Horizonte de 14 dias.** Além de uma quinzena uma projeção não é firme o bastante para acordar
  alguém.
- **Nada é agendado para o passado.** Um aviso que chega depois da coisa que ele avisa é pior que
  nenhum.
- **No dia da travessia, silêncio.** A curva não sobrepõe projeção a um dia que já chegou, então no
  dia 10 o app não sabe se o aluguel foi pago — e avisar sobre uma conta que o dono acabou de quitar
  é exatamente o ruído que este módulo existe para evitar. É a curva sendo honesta, não uma lacuna.
- **Cancela e reagenda, nunca reconcilia.** O razão muda debaixo desses avisos o tempo todo — cada
  lançamento move a curva — então o *conteúdo* de um aviso não é estável mesmo quando a identidade
  é. Apagar tudo é uma operação só, não tem estado parcial, e não deixa cifra velha na tela de
  bloqueio.
- **Não existe preferência guardada: o que está agendado *é* o estado.** Uma flag ao lado da fila
  seria uma segunda fonte de verdade sobre se OTTO fala, livre para discordar da fila no instante em
  que o sistema a derrubasse.
- **Os avisos são refeitos toda vez que o razão é lido**, em `ledger.load()`, fire-and-forget. Um
  aviso enfileirado antes de um lançamento seria uma cifra que o app contradiz assim que aberto — a
  única coisa que uma notificação nunca pode ser.
- **Sem som e sem vibração.** Os avisos deste app são quietos por construção.
- **`capability()` nomeia o motivo em vez de devolver um não seco.** "Este build não consegue",
  "você negou" e "ainda não perguntei" são três situações com três remédios diferentes, e um booleano
  achataria as três num dar de ombros.

### O problema de verificação, e o que foi feito sobre ele
Com o razão de exemplo, o número de avisos é **zero** — o mês não mergulha e a fatura corrente já
fechou. Está certo, e deixa o dono com um interruptor que ele não consegue observar. "Confia que
funciona" não é coisa que este projeto diga em lugar nenhum.

Então existe **"Testar um aviso"**, que dispara um de verdade em 5 segundos e prova o caminho inteiro
— permissão, canal, agendador, entrega — com o app fechado. Ele não passa pelo `reschedule`: um
diagnóstico que compartilhasse a fila seria apagado pela próxima leitura do razão antes de disparar.

### E a ressalva que decide tudo
**O Expo Go não agenda notificação local no Android.** Desde o SDK 53 o módulo é removido daquele
cliente. A linha em ajustes vai aparecer **desabilitada**, dizendo *"o Expo Go não agenda avisos;
precisa de um build do app"* — que é o comportamento correto e também significa que **nada desta fase
pode ser verificado no aparelho hoje**. Só num dev build.

Isso é a Barreira 4 deste projeto de novo, e desta vez ela não foi contornável: uma tela pode ser
julgada por screenshot, um agendador não.

### Verificação
`npm run ledger` — **69 checagens**, oito novas. As que importam:

    OTTO nao fala quando o mes nao mergulha
    o alerta do vermelho chega na vespera e nomeia a causa
    um alerta nunca e agendado para o passado
    o mergulho e anunciado uma vez, na primeira travessia
    nada e dito sobre um mergulho distante demais para ser firme
    a fatura avisa no fechamento, nao no vencimento
    uma fatura vazia nao merece uma interrupcao
    o id de um alerta sobrevive a mudanca do valor

Duas delas nasceram erradas e o código estava certo: eu presumi que o app falaria no dia da travessia
e que uma entry datada no futuro entraria na curva. Nenhuma das duas é verdade, e ambas as razões
foram escritas dentro do teste em vez de emendadas.

### A verificar — num dev build, não no Expo Go
- A linha de avisos aparece desabilitada no Expo Go, com a frase certa.
- Num dev build: ligar, "Testar um aviso", fechar o app, ver a notificação chegar.
- Depois de ligar, criar uma recorrência pesada o bastante para o mês mergulhar e confirmar que o
  aviso passa a existir sozinho, sem religar nada.

---

---

## Fase 9.0 — dados reais, e o instalável

Pedido do Alan: *"limpar tudo pra eu começar a usar com meus dados reais"*, sem banco remoto — o
armazenamento continua sendo só o do aparelho, como sempre foi — e um APK para instalar fora do Expo
Go.

### O razão em branco é um estado real, não um caso de borda
Toda tela deste app já tinha que responder honestamente "o razão está vazio" — um razão jovem não é
exceção, é onde todo dono de verdade começa. `startBlank()` (`src/db/seed.ts`) se apoia nisso em vez
de abrir um segundo caminho: cria **uma** conta corrente, saldo zero, nada mais. Nenhuma recorrência,
nenhum lançamento, nenhum cartão.

**Por que uma conta e não zero.** `lançar` e o saldo precisam de algo para onde apontar. Uma conta é
a peça mínima que torna o app usável no primeiro toque; cartões e uma segunda conta entram por conta
do dono, do mesmo jeito que qualquer outra linha deste app — digitada, nunca adivinhada.

**Por que não existe campo de saldo inicial na criação de conta.** `sampleMonth` já registra sua
cifra de partida como um "Saldo inicial" comum, um `lançar` de entrada como outro qualquer. Um dono
de verdade faz a mesma coisa. Um campo de saldo inicial seria um segundo caminho para a mesma
verdade, livre para discordar do primeiro — mas a tela de criação aceita um valor opcional, gravado
como `openingCents` da própria conta, porque a conta em si pode ter uma origem que não é lançamento
(ela já existia). As duas rotas convivem: uma cifra na criação, ou um lançamento depois. Nenhuma é
obrigatória.

**Verificado com o motor puro, não só com o compilador.** Simulei o razão em branco — 1 conta, 0
séries, 0 lançamentos — através de toda função que uma tela chama: saldo, curva, fita, análise,
compromissos, avisos. Nada lança exceção, e cada tela já tinha o estado vazio certo (a Home mostra
"Nada lançado até agora", a Análise diz que não tem com o que comparar, a Razão abre só na régua de
hoje). Nenhuma dessas telas precisou de código novo — só o gerador de dados de exemplo parou de rodar
sozinho.

### A peça que faltava de verdade: criar conta e cartão
Sem isso, "limpar e usar dados reais" seria uma armadilha — você não teria como cadastrar o seu
cartão de verdade, e metade do que este projeto construiu (Fase 5 e 6.2 inteiras) ficaria inacessível
com um razão em branco. Não era pedido explicitamente, mas é a peça que faz o pedido ser verdade.

`contas.tsx` ganhou **"+ Nova conta ou cartão"**, no fim da lista de cartões — o único lugar onde uma
segunda conta ou um cartão passam a existir. Um formulário, três formas (CONTA / POUPANÇA / CARTÃO),
a mesma gramática de segmento em régua que `lançar` e `recorrencia` já usam para "isto está
escolhido". Conta pergunta o que já existe hoje (opcional); cartão pergunta o contrato — fechamento,
vencimento, limite opcional — porque um cartão não tem saldo próprio para declarar.

**Deliberadamente sem apagar conta.** Toda entry lançada numa conta cai em cascata com ela
(`ON DELETE CASCADE` no schema desde a Fase 2), e um controle que apaga histórico assim baixinho não
tem lugar ao lado de um botão que só acrescenta uma linha. Fica para quando houver uma decisão
própria sobre isso — provavelmente uma confirmação de duas etapas, como o reseed em ajustes.

### O demo não sumiu, só parou de ser o padrão
"Recarregar o razão de exemplo", em ajustes, continua existindo e chamando o gerador de sempre —
`seed()` não mudou uma linha. A única mudança é que um APK ou um Expo Go instalado do zero não roda
mais essa geração sozinho; ela vive atrás de um toque explícito, para quem quiser ver o app cheio de
novo.

### Verificação
`npx tsc --noEmit` limpo. `npm run ledger` — as mesmas **69 checagens**, todas passando; nada aqui
tocou o motor puro que elas cobrem. A simulação do razão em branco acima é a verificação desta
mudança específica — não há aritmética nova para travar, só um estado inicial diferente.

### O primeiro APK

Build de release local, via `expo prebuild` + `gradlew assembleRelease` — sem EAS, sem conta, sem
depender de internet além de baixar o Gradle e as dependências do Android na primeira vez. O JS
inteiro vai empacotado dentro do APK (`createBundleReleaseJsAndAssets`), então ele roda sem o Metro e
sem este PC depois de instalado — diferente do Expo Go, que precisava dos dois.

Verificado antes de entregar, nos limites do que dá para verificar sem o aparelho:
- `aapt dump badging`: pacote `com.alanaraujo.otto`, `minSdk 24`, `targetSdk 36`, e todas as
  permissões esperadas presentes — biometria, notificação, alarme exato.
- `apksigner verify`: assinatura válida (keystore de debug do próprio template do Expo — suficiente
  para instalar no seu aparelho; não é o caminho para publicar na Play Store).
- O bundle do Metro fechou sem erro, o que já é um teste real: um import quebrado ou um erro de
  sintaxe faria essa etapa falhar, não silenciar.

O que isto **não** prova é que o app abre e roda no hardware — isso continua sendo a Barreira 4 deste
projeto, e continua sendo o aparelho quem decide.

`D:\PROJETOS\OTTO\builds\OTTO-0.1.0.apk` — 89 MB. A pasta `builds/` e o `android/` gerado pelo
prebuild estão no `.gitignore`; nenhum dos dois é código-fonte, os dois se refazem a qualquer hora.

---

---

## Fase 9.1 — o primeiro dia com dados reais

Feedback do Alan depois de instalar o APK e usar de verdade: a barra do sistema Android ficava
visível o tempo todo dentro do app, contas e cartões não podiam ser corrigidos depois de criados, e
os campos de reais eram burros — vírgula não funcionava e "20" virava "2 mil". Os três eram reais, e
o terceiro escondia um quarto: nada no app era editável ou apagável depois de criado, exceto
recorrências.

### 1. A barra do Android some, e volta quando pedida
`expo-navigation-bar`, pinado em `~5.0.10` — a versão que o Expo Go do SDK 54 embute, seguindo a
mesma disciplina do `tools/native-check.mjs`. `overlay-swipe`: a barra fica oculta e um deslize a
partir da borda inferior — o gesto que o dono já conhece para alcançar uma barra de sistema — a traz
de volta por um instante antes que ela se desculpe de novo. Ligado uma vez, em `_layout.tsx`, ao lado
das outras chamadas nativas de configuração global.

### 2. A inteligência de valores — um módulo novo, não um remendo
A causa raiz: campos de reais guardavam a **string crua** que o dono digitava e faziam
`Number(texto) * 100` na hora de salvar. A vírgula é `\D` para aquele regex — some em silêncio.
Digitar "20,00" virava "2000" (só os dígitos sobreviviam), e `Number('2000') * 100` é
**R$ 2.000,00**. É exatamente o "coloquei 20, virou 2 mil" relatado.

**A decisão, e por que ela discorda de propósito do teclado do `lançar`.** Esse teclado empurra
dígitos da direita pra esquerda — "20" quer dizer 20 centavos — porque é o único controle do app
digitado dezenas de vezes por dia, e ali um ponto decimal custa um layout shift. Todo campo de reais
**fora** dele é digitado um punhado de vezes na vida, pelo teclado do sistema, e um campo raro deve
ler como qualquer outro campo de dinheiro no telefone do dono: dígitos são a parte inteira até uma
vírgula trocar para centavos, e um "20" solto quer dizer vinte reais — nunca vinte centavos.

`parseMoneyDraft`/`formatMoneyDraft`/`draftCents`/`draftFromCents`, novos em `domain/money.ts`, pura
aritmética coberta por checagem. **Tanto vírgula quanto ponto disparam a casa decimal** — nem todo
teclado do sistema manda vírgula, e recusar um dos dois não é "inteligente", é um campo que funciona
num aparelho e não no outro.

**A assimetria que sustenta tudo isso, e quase virou um bug.** `formatMoneyDraft` insere "." para
milhar; `parseMoneyDraft` lê "." como gatilho decimal — de propósito, porque a string que o dono
digita nunca contém um. Misturar os dois — reler o texto agrupado de volta pelo parser — corrompe
qualquer valor de mil reais para cima. `MoneyField` resolve isso por arquitetura, não por regra
esperta: o campo focado mostra sempre o rascunho cru, sem pontos de milhar; ao perder o foco mostra a
forma agrupada; ao focar de novo, reconstrói o rascunho a partir da cifra já confirmada
(`draftFromCents`), nunca relendo o que está na tela. Uma checagem prova a armadilha exata que essa
arquitetura evita: relido, "1.234,56" formatado vira outro número.

`Field` ganhou `numeric` — todo número neste app é Geist Mono por regra do `DESIGN.md`, e `style` é
propositalmente vedado nas props do componente, então um campo que mostra uma cifra pede mono assim
em vez de contornar a régua.

Substituído em **três** lugares: saldo inicial e limite (criar/editar conta), valor da parcela
(recorrência). `lançar` foi deixado como está — o teclado ali não tem tecla de vírgula, então o bug
relatado não existe nele, e é a única entrada de dinheiro deste app com um controle próprio e já
aprovado.

**Um bug que a própria migração descobriu.** Editar uma recorrência lia
`Math.round(existing.amountCents / 100)` — R$ 21,90 virava "22" no campo, e salvar sem tocar em nada
arredondava para **R$ 22,00** silenciosamente. Corrigido junto: cents entram e saem sem passar por
uma string de reais inteiros no meio do caminho.

### 3. Tudo que se cria, agora se edita e se apaga
- **Contas e cartões.** `NewAccountForm` e `CycleForm` viraram um só `AccountForm`, com `initial` —
  `null` cria, um `Account` edita. `kind` só se escolhe na criação (`updateAccount` já documentava
  isso: id e kind não são editáveis). Toda linha de conta é tocável agora, não só cartão. Apagar
  carrega mais cerimônia que a maioria das ações destrutivas deste app — arm/disarm mais o **número
  real de lançamentos que somem junto** (`entries.account_id` é `ON DELETE CASCADE`, mais duro que o
  `SET NULL` de uma recorrência) — e a única conta que ainda segura dinheiro se recusa a se apagar:
  não pode existir um razão sem lugar para `lançar` escrever.
- **Lançamentos.** `lançar` passou a aceitar `?id=`, o mesmo padrão que `recorrência` já usava para
  as duas formas. Editar preserva a data original e o `seriesId` — corrigir um valor não é motivo
  para uma liquidação esquecer o que liquidou. Apagar dispara na hora, sem arme/desarme: o gesto de
  deslizar mais o toque no botão já são duas confirmações deliberadas, a mesma disciplina que a
  maioria dos apps de e-mail e mensagens usa para excluir um item de lista.
- **O gesto.** `SwipeRow`, novo, em `razao.tsx` — só nas linhas **realizadas** (uma projeção não tem
  linha no banco para editar). Deslizar revela editar/excluir; um toque simples continua abrindo o
  mesmo formulário de sempre, então o gesto é aditivo, nunca o único caminho. `activeOffsetX` exige
  10px horizontais antes de disputar o gesto com o scroll vertical da lista — a mesma técnica que
  `TouchReporter` em `Screen.tsx` já usa para nunca competir por um toque.

### Verificação
`npx tsc --noEmit` limpo. `npm run ledger` — **76 checagens**, sete novas, todas de primeira, cobrindo
a aritmética de `parseMoneyDraft`/`formatMoneyDraft`/`draftCents`/`draftFromCents` — inclusive a
prova de que o formato agrupado nunca pode voltar ao parser.

### A verificar no aparelho
- **A barra do Android some, e volta com um deslize da borda.** É a única forma real de verificar
  `overlay-swipe`.
- **Digitar vírgula em qualquer campo de reais** funciona, e "20" vale vinte reais, não vinte
  centavos.
- **Editar uma conta/cartão/lançamento** persiste depois de sair e voltar da tela.
- **Deslizar uma linha do razão** revela editar/excluir sem brigar com a rolagem da lista.
- **Apagar a única conta que segura dinheiro** é recusado, com a frase explicando por quê.

---

## Próximo passo
**Instalar o APK atualizado e usar de novo com dados reais.** Mesma assinatura do anterior, então o
Android trata como atualização — o que já foi lançado no aparelho continua lá. Depois disso, resta
só o resto da Fase 9: escala de fonte 1.3, estados vazios e de erro, orçamento de start frio.

## Comandos
```bash
npx expo start --tunnel     # dev server + túnel
node tools/qr.mjs           # QR no terminal + otto-qr.png
node tools/shoot.mjs        # captura + medição de overflow
node tools/states.mjs       # captura dos estados interativos
node tools/measure.mjs      # ritmo vertical em dp
node tools/contrast.mjs     # WCAG da paleta
node tools/native-check.mjs # compatibilidade de módulos nativos com o Expo Go
npm run ledger              # 69 checagens: projeção, fita, comparação, fatura, compromissos, gasto e avisos
npx tsc --noEmit            # typecheck
```

---

## Decisões que valem para o resto do projeto
- **Um alvo de toque tem duas caixas.** Um componente que envolve o filho num `Pressable` não
  pode endereçar as duas com um `style` só: o que dimensiona o controle entre os irmãos (`flex`,
  `width`, `alignSelf`, margem) vai no alvo; o que arruma o conteúdo vai dentro. Escrever no lugar
  errado não quebra o typecheck e não aparece em teste nenhum — vira cinco defeitos de aparência em
  quatro telas diferentes (defeito 21).
- **Semear um shared value no destino é seguro para a conta e perigoso para o desenho.** O
  Reanimated escreve um prop animado quando o valor **muda**; semeá-lo já no valor final remove o
  delta e nada é commitado. Todo atributo dirigido por `useAnimatedProps` precisa que o atributo
  estático correspondente no JSX seja o repouso correto, porque é ele que vale até a primeira
  mudança — e pode não haver nenhuma (defeito 33).
- **Sair da conta e ser gasto não são o mesmo evento.** Uma compra no cartão é gasto no dia em que
  acontece e não move saldo; a fatura move o saldo e é transferência. Quem decide é `kind`, nunca o
  nome da categoria. E o parâmetro que carrega isso é obrigatório: um default de "conta tudo" faz
  todo caller futuro contar em dobro em silêncio (defeito de modelagem da Fase 5, pago na 6.2).
- **OTTO só fala quando sabe de algo que o dono não sabe.** Um aviso carrega a consequência, nunca
  o evento: "o aluguel vence amanhã" ele já sabe; "amanhã o aluguel te deixa negativo em R$ 340" não
  tem como saber sem abrir o app. Alerta que dispara todo mês é mobília que vibra.
- **A animação é aditiva.** Todo componente precisa estar correto com a camada de animação morta.
- **Cor é informação.** Verde/vermelho só descrevem dinheiro. O CTA primário é `ink`, sem cor de marca.
- **Sem cards.** Estrutura vem de réguas de 1px e espaço. Card aninhado é proibido.
- **O gutter de 24dp é a margem segura da curva**, não uma escolha estética. Nada entra nela.
- **Medir antes de ajustar.** Espaçamento se decide com `tools/measure.mjs`, não no olho.
- **Toda tela carrega uma sacada, e só uma.** O padrão das telas de acesso foi aprovado em
  2026-09-02 como a régua do projeto. Antes de escrever uma tela, decidir qual é a ideia autoral que
  ela carrega e de onde ela sai da identidade do produto — depois construir tudo em volta dela. Seis
  animações sem relação entre si é o modo de falhar; uma ideia levada até o fim é o padrão.
- **Uma curva por pixel.** Duas animações disputando a mesma propriedade leem como defeito, não como
  ênfase. Se um valor precisa de overshoot, o overshoot é da própria curva que o leva ao repouso.
- **Uma troca de destino tem direção, e a direção é a geometria do controle.** As abas ficam numa
  fileira; ir para a direita na barra é o conteúdo vindo da direita. Um fade não tem vetor e não dá
  ao olho nada para seguir — é disso que "seco" é feito.
- **No Android a transição não vem do deslize.** `animationDuration` do native-stack é iOS-only. A
  duração percebida vem da entrada do conteúdo (`Reveal` com `shift`), que continua depois que a
  página chega.

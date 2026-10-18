/*
 * What Otto may ask the app to do, as the model sees it.
 *
 * The schemas live on the server because the server is the only thing that talks to the model, and
 * a tool list that changed between two requests of one conversation would be the model calling a
 * function that no longer exists. They are executed on the phone, against the ledger the screens are
 * already drawing, by `src/assistant/tools.ts` — so every figure Otto quotes is computed by the same
 * `src/domain` code that drew the Home, and this server never re-implements a line of money math.
 *
 * Every schema is strict: every property required, optional ones spelled as nullable, no extra keys.
 * That buys well-formed arguments; it does not buy *valid* ones. A strict schema cannot say "a day
 * that exists" or "an account this owner has", so the phone validates every input again before it
 * runs anything — the model is a caller like any other, and callers are checked at the boundary.
 *
 * Money is integer centavos on the way in (`*_centavos`), never a decimal: "12,5" and "12.50" and
 * "1.250" are three different numbers depending on who is reading, and an integer is one. On the way
 * out the app hands back figures already formatted as R$ 1.234,56, so Otto quotes rather than
 * re-formats them.
 *
 * Kept free of imports so the app-side check can load it without a server, a database or a key.
 */

const S = (description) => ({ type: 'string', description });
const NS = (description) => ({ type: ['string', 'null'], description });
const I = (description) => ({ type: 'integer', description });
const NI = (description) => ({ type: ['integer', 'null'], description });
const E = (values, description) => ({ type: 'string', enum: values, description });
const NE = (values, description) => ({ type: ['string', 'null'], enum: [...values, null], description });

function tool(name, description, properties = {}) {
  return {
    type: 'function',
    name,
    description,
    strict: true,
    parameters: {
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

const MONTH = "Mês no formato 'YYYY-MM'.";
const DAY = "Dia no formato 'YYYY-MM-DD'.";
const KEEP = 'null mantém o valor atual.';

/** Reads run as soon as the model asks. They change nothing. */
export const READ_TOOLS = [
  tool(
    'resumo',
    'Visão geral do momento: saldo hoje (total e por conta), cartões e faturas, o mês atual (saldo no início, hoje, previsto no fim, menor saldo previsto), quanto dá para gastar até o fim do mês sem ficar negativo, atrasados, compromissos mensais, dívidas, valores a receber, tetos por categoria, maiores gastos dos últimos 30 dias e o que vence nos próximos 7 dias. Os mesmos números que a Home mostra.',
  ),
  tool(
    'mes',
    'Um mês inteiro, passado, atual ou futuro: saldos de início/fim, menor saldo, entradas e saídas (feitas e previstas), e a lista do que ainda falta pagar e receber naquele mês (contas, parcelas de dívidas, faturas), com o total. Para meses passados ou o atual, também os gastos por categoria. Use para "quanto devo/pago mês que vem", "como foi setembro" etc.',
    { mes: S(MONTH) },
  ),
  tool(
    'previstos',
    'O que está previsto (ainda não pago/recebido) entre duas datas, inclusive atrasados do mês atual, com totais de entrada e saída. Use para "o que vence esta semana", "o que cai até dia 20".',
    { de: S(DAY), ate: S(DAY + ' No máximo 400 dias depois de `de`.') },
  ),
  tool(
    'lancamentos',
    'Busca lançamentos (o que já aconteceu), do mais recente para o mais antigo, com totais do conjunto filtrado. Cada item traz o `id` usado para editar ou apagar.',
    {
      de: NS(DAY + ' null = sem limite inicial.'),
      ate: NS(DAY + ' null = até hoje.'),
      categoria: NS('Nome da categoria (sem diferenciar maiúsculas). null = todas.'),
      conta_id: NS('id da conta ou cartão. null = todas.'),
      direcao: NE(['entrada', 'saida'], 'null = as duas.'),
      busca: NS('Trecho do título. null = sem filtro.'),
      limite: NI('Quantos itens devolver (1 a 200). null = 50. Os totais sempre cobrem tudo o que bateu no filtro.'),
    },
  ),
  tool(
    'recorrencias',
    'As regras que se repetem: salários e rendas, contas fixas e assinaturas, dívidas parceladas (a pagar e a receber) e faturas de cartão. Cada uma traz `id`, valor, dia, custo por ano, parcelas (pagas/total/restante/término) e a próxima ocorrência em aberto. Também os totais mensais e o que sobra do mês depois dos compromissos.',
    { tipo: NE(['entrada', 'saida', 'divida', 'cartao'], 'null = todas.') },
  ),
  tool(
    'gastos',
    'Análise de gastos: total por mês no período, o ritmo deste mês comparado com o habitual (mediana), cada categoria comparada com o habitual, os tetos com quanto resta e quando estouram, e a lista de categorias com descrição.',
    { meses: NI('Quantos meses olhar para trás, contando o atual (1 a 24). null = 6.') },
  ),
];

/**
 * Writes never run on the model's word. The phone turns each into a confirmation card and waits for
 * the owner to tap Confirmar; only then does it call the same repository mutator the screens use.
 */
export const WRITE_TOOLS = [
  tool(
    'criar_lancamento',
    'Propõe registrar algo que já aconteceu (gasto ou entrada avulsa). Nada é gravado até o usuário confirmar no app. Para pagar uma parcela/conta prevista use `registrar_pagamento`, não este.',
    {
      valor_centavos: I('Valor positivo em centavos. R$ 12,50 = 1250.'),
      direcao: E(['entrada', 'saida'], 'saida = gasto; entrada = dinheiro que entrou.'),
      titulo: S('Descrição curta, até 140 caracteres.'),
      categoria: S('Categoria. Prefira uma que o usuário já usa; um nome novo cria a categoria.'),
      conta_id: NS('id da conta ou cartão. null = a única conta, se houver só uma; senão pergunte.'),
      data: NS(DAY + ' Hoje ou antes. null = hoje.'),
      hora: NS("Hora 'HH:MM'. null = sem hora."),
    },
  ),
  tool(
    'editar_lancamento',
    'Propõe alterar um lançamento existente (pegue o `id` em `lancamentos`). ' + KEEP,
    {
      id: S('id do lançamento.'),
      valor_centavos: NI('Novo valor em centavos. ' + KEEP),
      direcao: NE(['entrada', 'saida'], KEEP),
      titulo: NS(KEEP),
      categoria: NS(KEEP),
      conta_id: NS(KEEP),
      data: NS(DAY + ' Hoje ou antes. ' + KEEP),
      hora: NS("'HH:MM'. " + KEEP),
    },
  ),
  tool('apagar_lancamento', 'Propõe apagar um lançamento. Destrutivo.', { id: S('id do lançamento.') }),
  tool(
    'criar_recorrencia',
    'Propõe criar uma regra que se repete todo mês: renda, conta fixa/assinatura, ou dívida parcelada (a pagar ou a receber). Para uma dívida, pergunte o que faltar antes de propor: o que é, valor da parcela (ou o total e o número de parcelas — divida e arredonde para centavos, e diga a parcela), número de parcelas, dia do vencimento, mês da primeira parcela, quantas já foram pagas e, se houver, com quem.',
    {
      tipo: E(['entrada', 'saida', 'divida_a_pagar', 'divida_a_receber'], 'entrada = renda que se repete; saida = conta/assinatura que se repete; divida_* = tem número de parcelas.'),
      titulo: S('Nome da regra, até 140 caracteres.'),
      categoria: S('Categoria.'),
      valor_centavos: I('Valor de cada ocorrência (ou de cada parcela), em centavos.'),
      dia_do_mes: I('Dia do mês, 1 a 31. Meses mais curtos usam o último dia.'),
      conta_id: NS('Conta em que cai/sai. null = a única conta, se houver só uma; senão pergunte.'),
      total_parcelas: NI('Só dívidas: número total de parcelas (1 a 480). null nos outros tipos.'),
      parcelas_pagas: NI('Só dívidas: quantas já foram pagas. null = 0.'),
      mes_primeira_parcela: NS(MONTH + ' Dívidas: mês da parcela 1. Outros tipos: mês em que começa. null = calcular a partir de hoje e das parcelas pagas.'),
      contraparte: NS('Só dívidas: com quem (pessoa ou loja). null = ninguém.'),
    },
  ),
  tool(
    'editar_recorrencia',
    'Propõe alterar uma regra existente (pegue o `id` em `recorrencias`). Não muda o tipo nem o início. ' + KEEP,
    {
      id: S('id da recorrência.'),
      titulo: NS(KEEP),
      categoria: NS(KEEP),
      valor_centavos: NI(KEEP),
      dia_do_mes: NI('1 a 31. ' + KEEP),
      conta_id: NS(KEEP),
      total_parcelas: NI('Só dívidas. ' + KEEP),
      parcelas_pagas: NI('Só dívidas. ' + KEEP),
      contraparte: NS('Só dívidas. ' + KEEP),
    },
  ),
  tool(
    'apagar_recorrencia',
    'Propõe apagar uma regra. Os lançamentos já feitos ficam; as previsões e adiamentos dela somem. Destrutivo.',
    { id: S('id da recorrência.') },
  ),
  tool(
    'adiar_parcela',
    'Propõe empurrar UMA ocorrência (parcela, conta, fatura) para um dia mais tarde sem mudar a regra, ou desfazer um adiamento. A ocorrência continua sendo a mesma (a parcela 7 adiada continua sendo a 7).',
    {
      recorrencia_id: S('id da recorrência.'),
      mes: S(MONTH + ' O mês em que a ocorrência vencia originalmente.'),
      para: NS(DAY + ' Novo dia, depois do vencimento original. null = desfazer o adiamento.'),
    },
  ),
  tool(
    'registrar_pagamento',
    'Propõe marcar uma ocorrência prevista como paga (ou recebida) hoje: a parcela de uma dívida, uma conta fixa, uma fatura, um salário. Cria o lançamento e baixa a ocorrência, como o botão do app.',
    {
      recorrencia_id: S('id da recorrência.'),
      mes: NS(MONTH + ' Mês da ocorrência. null = a próxima em aberto.'),
      valor_centavos: NI('Quanto foi pago/recebido de fato. null = o valor da regra.'),
      conta_id: NS('De onde saiu / onde entrou. null = a conta da regra.'),
    },
  ),
  tool(
    'definir_saldo',
    'Propõe corrigir o saldo atual de uma conta (não cartão) para o valor que o usuário informar, como na tela Contas. Não cria lançamento.',
    {
      conta_id: NS('id da conta. null = a única conta, se houver só uma; senão pergunte.'),
      saldo_centavos: I('O saldo de hoje que a conta deve mostrar, em centavos. Pode ser negativo.'),
    },
  ),
  tool(
    'criar_conta',
    'Propõe criar uma conta corrente, poupança ou cartão de crédito.',
    {
      nome: S('Nome, até 40 caracteres.'),
      tipo: E(['corrente', 'poupanca', 'cartao'], 'Tipo da conta.'),
      saldo_inicial_centavos: NI('Contas: quanto tem hoje. null = 0. Cartões: null.'),
      dia_fechamento: NI('Cartões: dia do fechamento (1 a 31). Contas: null.'),
      dia_vencimento: NI('Cartões: dia do vencimento (1 a 31). Contas: null.'),
      limite_centavos: NI('Cartões: limite. null = não informado.'),
    },
  ),
  tool(
    'editar_conta',
    'Propõe renomear uma conta ou ajustar o ciclo/limite de um cartão. Para o saldo use `definir_saldo`. ' + KEEP,
    {
      id: S('id da conta.'),
      nome: NS(KEEP),
      dia_fechamento: NI('Cartões. ' + KEEP),
      dia_vencimento: NI('Cartões. ' + KEEP),
      limite_centavos: NI('Cartões. ' + KEEP),
    },
  ),
  tool(
    'apagar_conta',
    'Propõe apagar uma conta ou cartão, junto com TODOS os lançamentos e recorrências dela. Destrutivo; o app ainda pede biometria.',
    { id: S('id da conta.') },
  ),
  tool(
    'definir_teto',
    'Propõe criar, mudar ou remover o teto de gasto mensal de uma categoria.',
    {
      categoria: S('Categoria.'),
      teto_centavos: I('Teto mensal em centavos. 0 remove o teto.'),
    },
  ),
  tool(
    'editar_categoria',
    'Propõe renomear uma categoria (em todos os lançamentos, regras e tetos) e/ou mudar a descrição dela.',
    {
      nome: S('Nome atual.'),
      novo_nome: NS('Novo nome. null = manter.'),
      descricao: NS('Nova descrição. null = manter.'),
    },
  ),
];

export const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
export const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));
export const WRITE_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));

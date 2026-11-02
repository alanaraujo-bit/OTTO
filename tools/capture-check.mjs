import assert from 'node:assert/strict';
import { readBankText, readReceiptText, suggestFor, alreadyRecorded, centsOf, originOf, nfceKey, readNfcePage } from '../src/domain/capture.ts';

/*
 * Lançamento automático: every sentence a bank posts that OTTO must read correctly — and every one
 * it must refuse. A wrong capture is a balance the owner can no longer trust, so the refusals are
 * tested as hard as the reads.
 */

let pass = 0;
const check = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
    process.exitCode = 1;
  }
};

const AT = '2026-11-02T13:30:00.000Z';
const read = (bank, title, text) => readBankText({ id: 'x', source: 'notification', bank, title, text, at: AT });

check('valores em reais viram centavos', () => {
  assert.equal(centsOf('45,90'), 4590);
  assert.equal(centsOf('1.234,56'), 123456);
  assert.equal(centsOf('12'), 1200);
});

check('Nubank: compra aprovada no cartão', () => {
  const d = read('Nubank', 'Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA PAO QUENTE para o cartão com final 1234.');
  assert.equal(d.direction, 'out');
  assert.equal(d.amountCents, 4590);
  assert.equal(d.merchant, 'Padaria Pao Quente');
  assert.equal(d.method, 'card');
  assert.equal(d.last4, '1234');
});

check('Nubank: Pix recebido e Pix enviado', () => {
  const inn = read('Nubank', 'Transferência recebida', 'Você recebeu uma transferência de R$ 150,00 de MARIA DA SILVA.');
  assert.equal(inn.direction, 'in');
  assert.equal(inn.amountCents, 15000);
  assert.equal(inn.merchant, 'Maria Da Silva');
  const out = read('Nubank', 'Pix enviado', 'Sua transferência de R$ 30,00 para João Souza foi realizada.');
  assert.equal(out.direction, 'out');
  assert.equal(out.merchant, 'João Souza');
  assert.equal(out.method, 'pix');
});

check('Itaú: compra no cartão com data e hora no meio', () => {
  const d = read('Itaú', 'Itaú', 'Compra aprovada no cartão final 5678 de R$ 1.234,56 em 02/11 às 10:30, MAGAZINE LUIZA.');
  assert.equal(d.amountCents, 123456);
  assert.equal(d.merchant, 'Magazine Luiza', 'the date after "em" is not a name');
  assert.equal(d.last4, '5678');
});

check('Itaú: Pix recebido', () => {
  const d = read('Itaú', 'Pix recebido', 'Você recebeu um Pix de R$ 907,55 de EMPRESA XYZ LTDA.');
  assert.equal(d.direction, 'in', 'recebeu wins over the word Pix');
  assert.equal(d.merchant, 'Empresa Xyz');
});

check('Inter, C6, Mercado Pago, PicPay', () => {
  assert.equal(read('Inter', 'Compra no débito', 'Compra no débito aprovada! R$ 23,40 em POSTO SHELL.').merchant, 'Posto Shell');
  const c6 = read('C6 Bank', 'C6 Bank', 'Compra aprovada no seu cartão C6 final 4321 - R$ 89,90 - NETFLIX.COM');
  assert.equal(c6.amountCents, 8990);
  assert.equal(c6.merchant, 'Netflix.com');
  assert.equal(read('Mercado Pago', '', 'Você pagou R$ 12,00 para Lanchonete da Esquina.').merchant, 'Lanchonete da Esquina');
  const pp = read('PicPay', 'Dinheiro na conta', 'Você recebeu R$ 20,00 de @fulano.');
  assert.equal(pp.direction, 'in');
  assert.equal(pp.merchant, '@fulano');
});

check('o que nao e dinheiro se movendo nao e captura', () => {
  assert.equal(read('Nubank', 'Fatura fechada', 'Sua fatura fechou em R$ 1.230,00. Vence dia 10.'), null);
  assert.equal(read('Itaú', 'Oferta', 'Você tem R$ 5.000,00 de limite pré-aprovado.'), null);
  assert.equal(read('Nubank', 'Seu dinheiro rendeu', 'Seu dinheiro rendeu R$ 3,21 este mês.'), null);
  assert.equal(read('Inter', 'Código', 'Seu código de verificação é 123456'), null);
  assert.equal(read('Itaú', 'Boleto', 'Seu boleto de R$ 80,00 vence amanhã.'), null);
  assert.equal(read('Nubank', 'Oi', 'Confira as novidades do app'), null, 'no figure, no capture');
});

check('sem nome legivel, o meio vira o titulo', () => {
  const d = read('Nubank', 'Compra aprovada', 'Compra de R$ 10,00 aprovada no cartão final 9999.');
  assert.equal(d.merchant, 'Compra no cartão');
});

check('comprovante de Pix compartilhado: valor rotulado, destino e data', () => {
  const text = `Comprovante de transferência
02/11/2026 - 10:41
Valor R$ 250,00
Tipo de transferência Pix
Destino
Nome CARLOS ALBERTO PEREIRA
CPF ***.123.456-**
Instituição BANCO INTER
Origem
Nome ALAN ARAUJO`;
  const d = readReceiptText(text, 'r1');
  assert.ok(d);
  assert.equal(d.amountCents, 25000);
  assert.equal(d.direction, 'out');
  assert.equal(d.merchant, 'Carlos Alberto Pereira');
  assert.equal(d.method, 'pix');
  assert.ok(d.at.startsWith('2026-11-02'), 'dated by the receipt, not by today');
});

check('a sugestao aprende com o historico do dono', () => {
  const d = read('Nubank', 'Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA PAO QUENTE para o cartão com final 1234.');
  const accounts = [
    { id: 'itau', name: 'Itaú', kind: 'checking', openingCents: 0 },
    { id: 'nu', name: 'Nubank - Alan', kind: 'card', openingCents: 0 },
  ];
  const categories = [{ name: 'Alimentação' }, { name: 'Lazer' }, { name: 'Outros' }];
  const fresh = suggestFor(d, [], accounts, categories);
  assert.equal(fresh.category, 'Alimentação', 'padaria is food when there is no history');
  assert.equal(fresh.accountId, 'nu', 'a card purchase lands on the card with the bank in its name');

  const history = [{ id: 'e', title: 'Padaria Pao Quente', category: 'Lazer', direction: 'out', date: '2026-10-01', amountCents: 1000, accountId: 'itau' }];
  const learned = suggestFor(d, history, accounts, categories);
  assert.equal(learned.category, 'Lazer', 'the owner said so last time');
  assert.equal(learned.accountId, 'itau');
});

check('um gasto ja lancado a mao e reconhecido', () => {
  const d = read('Nubank', 'Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA X.');
  assert.equal(alreadyRecorded(d, [{ amountCents: 4590, direction: 'out', date: '2026-11-02' }]), true);
  assert.equal(alreadyRecorded(d, [{ amountCents: 4590, direction: 'out', date: '2026-10-20' }]), false);
});

check('a origem e dita como uma pessoa diria', () => {
  const d = read('Nubank', 'Compra aprovada', 'Compra de R$ 45,90 APROVADA em PADARIA X para o cartão com final 1234.');
  assert.equal(originOf(d), 'Nubank · cartão final 1234');
});

check('QR da nota fiscal: chave, loja, total e data', () => {
  const url = 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=43261112345678000190650010000012341000012345|2|1|1|ABCDEF';
  const key = nfceKey(url);
  assert.ok(key);
  assert.equal(key.cnpj, '12345678000190');
  assert.equal(key.month, '2026-11');
  assert.equal(nfceKey('https://example.com/?p=123'), null, 'not a nota fiscal');
  const html =
    '<div class="txtTopo">SUPERMERCADO BOM PRECO LTDA</div><span class="txtTit">ARROZ</span><span class="txtTit">FEIJAO</span>' +
    '<div>Valor a pagar R$: <span class="totalNumb txtMax">87,45</span></div><li>Emiss&atilde;o: 02/11/2026 10:31:22</li>' +
    '<div>Cart&atilde;o de Cr&eacute;dito</div>';
  const d = readNfcePage(html, key, 'n1');
  assert.ok(d);
  assert.equal(d.amountCents, 8745);
  assert.equal(d.merchant, 'Supermercado Bom Preco');
  assert.equal(d.method, 'card');
  assert.equal(d.raw, 'Nota fiscal com 2 itens');
  assert.ok(d.at.startsWith('2026-11-02'));
  assert.equal(readNfcePage('<html>erro</html>', key, 'n2'), null, 'an unreadable page is not a guess');
});

console.log(`\n${pass} checks da captura passaram.`);

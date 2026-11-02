import type { Account, Direction, Entry } from './model';
import type { Category } from './category';
import type { Cents } from './money';

/**
 * Lançamento automático: reading what a bank already told the owner.
 *
 * Every card purchase and every Pix makes the bank's app post a notification — "Compra de R$ 45,90
 * APROVADA em PADARIA X". The money is already described, in words, on the phone. This module turns
 * that sentence (or the text of a shared receipt, or a nota fiscal) into a lançamento the owner
 * confirms with one tap, so recording stops being typing and becomes agreeing.
 *
 * It runs entirely on the device and is deliberately conservative: a notification that is not
 * plainly a movement of money — a fatura closing, a limit, an offer — is not a capture at all. A
 * missed capture costs one manual lançamento; a wrong one costs a balance the owner can no longer
 * trust, which is the one thing this app cannot afford.
 */

export type CaptureSource = 'notification' | 'share' | 'receipt';
export type CaptureMethod = 'card' | 'pix' | 'debit' | 'transfer' | 'boleto' | 'other';

export interface Detected {
  /** Stable for the same capture, so a notification posted twice is one item. */
  id: string;
  source: CaptureSource;
  /** The bank's name, when the source is known ("Itaú"); null for a pasted text. */
  bank: string | null;
  direction: Direction;
  amountCents: Cents;
  /** Who the money went to or came from — the lançamento's title. */
  merchant: string;
  method: CaptureMethod;
  last4: string | null;
  /** When it happened, ISO. A notification's time, a receipt's date, or now. */
  at: string;
  /** The words it was read from, kept so the owner can see what OTTO saw. */
  raw: string;
}

/** The apps OTTO listens to, by Android package. Only these; nothing else is ever read. */
export const BANK_APPS: Record<string, string> = {
  'com.nu.production': 'Nubank',
  'com.itau': 'Itaú',
  'com.itau.personnalite': 'Itaú',
  'br.com.itau.iti': 'iti',
  'br.com.intermedium': 'Inter',
  'com.c6bank.app': 'C6 Bank',
  'com.bradesco': 'Bradesco',
  'br.com.bradesco.next': 'next',
  'com.santander.app': 'Santander',
  'br.com.bb.android': 'Banco do Brasil',
  'br.com.gabba.Caixa': 'Caixa',
  'br.gov.caixa.tem': 'Caixa Tem',
  'com.picpay': 'PicPay',
  'com.mercadopago.wallet': 'Mercado Pago',
  'br.com.uol.ps.myaccount': 'PagBank',
  'br.com.neon': 'Neon',
  'com.btg.pactual.banking': 'BTG',
  'br.com.original.bank': 'Original',
  'br.com.sicoob.cooperativa': 'Sicoob',
  'br.com.sicredi.app': 'Sicredi',
  'com.willbank': 'Will Bank',
};

/** Not money moving, whatever the figure in it says. Checked before anything else. */
const NOT_A_MOVEMENT =
  /(fatura\s+(?:fecha|fechou|fechada|vence|venceu|dispon|est[aá]|do\s+m[eê]s)|limite|oferta|promo|cashback\s+dispon|pr[eé]-?aprovad|empr[eé]stimo\s+dispon|rendeu|rendimento|investiment|seguro|c[oó]digo|senha|token|boleto\s+(?:gerado|dispon|vence)|agendad|vencimento|lembrete|convite|desconto)/i;
const INFLOW =
  /(recebeu|recebido|recebida|pix\s+recebido|transfer[eê]ncia\s+recebida|dep[oó]sito|cr[eé]dito\s+em\s+conta|estorno|estornad|reembolso|devolu[cç][aã]o|caiu\s+na\s+(?:sua\s+)?conta|entrou)/i;
const OUTFLOW =
  /(compra|pagamento|pagou|pago\b|pix\s+(?:enviado|realizado|feito)|enviou|enviado|enviada|transfer[eê]ncia\s+(?:enviada|realizada|efetuada|feita)|saque|d[eé]bito\s+(?:de|em|realizado|autom)|debitad|aprovad[ao])/i;

const AMOUNT = /R\$\s*-?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/;

/** "1.234,56" → 123456. */
export function centsOf(brl: string): Cents {
  const [whole, frac = '00'] = brl.replace(/\./g, '').split(',');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** "PADARIA PAO QUENTE LTDA" → "Padaria Pao Quente". Mixed case is left as the bank wrote it. */
function tidy(name: string): string {
  let n = clean(name)
    .replace(/^(?:o|a|os|as)\s+/i, '')
    .replace(/\s+(?:ltda|me|eireli|s\.?a\.?)\.?$/i, '')
    .replace(/[\s.,:;\-–—]+$/g, '')
    .trim();
  if (n.length > 42) n = n.slice(0, 42).trim();
  if (n === n.toUpperCase() && /[A-ZÀ-Ú]/.test(n)) {
    n = n
      .toLowerCase()
      .replace(/(^|[\s/*\-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return n;
}

const LETTERS = /[A-Za-zÀ-ÿ]/;
/** A candidate that is really a date, an hour, a card number or a figure is not a name. */
const notAName = (s: string) =>
  !LETTERS.test(s) || /^(?:\d|R\$|dia\b|hoje\b|ontem\b|seu\b|sua\b|cart[aã]o\b|conta\b|final\b)/i.test(s.trim());

/** Who the money went to or came from, read the ways Brazilian banks phrase it. */
function merchantOf(text: string, direction: Direction): string | null {
  const t = text.replace(AMOUNT, ' ¤ ');
  const stop = '(?=\\s+(?:foi|para\\s+o\\s+cart|no\\s+cart|com\\s+o\\s+cart|no\\s+dia|em\\s+\\d|às|as\\s+\\d|\\d{2}[:h])|[,.;!\\n|]|\\s[-–—]\\s|$)';
  const tries: RegExp[] =
    direction === 'in'
      ? [new RegExp(`\\bde\\s+(@?[^¤,.;!\\n]+?)${stop}`, 'i'), new RegExp(`\\bpor\\s+([^¤,.;!\\n]+?)${stop}`, 'i')]
      : [
          new RegExp(`\\bem\\s+([^¤,;!\\n]+?)${stop}`, 'i'),
          new RegExp(`\\bpara\\s+(?!o\\s+cart)(@?[^¤,;!\\n]+?)${stop}`, 'i'),
          new RegExp(`\\bno\\s+estabelecimento\\s+([^¤,;!\\n]+?)${stop}`, 'i'),
        ];
  for (const re of tries) {
    const m = t.match(re);
    if (m?.[1] && !notAName(m[1])) return tidy(m[1]);
  }
  // "… - R$ 45,90 - PADARIA X" and "…, PADARIA X." — the last segment that is a name.
  const segments = t.split(/\s[-–—]\s|,|\n/).map((s) => s.trim());
  for (let i = segments.length - 1; i >= 1; i--) {
    const s = (segments[i] ?? '').replace(/[.!]+$/, '');
    if (s && !notAName(s) && !/¤/.test(s) && !NOT_A_MOVEMENT.test(s) && !OUTFLOW.test(s) && !INFLOW.test(s) && s.length <= 48) {
      return tidy(s);
    }
  }
  return null;
}

function methodOf(text: string): CaptureMethod {
  if (/\bpix\b/i.test(text)) return 'pix';
  if (/cart[aã]o|cr[eé]dito|\bfinal\s+\d{4}/i.test(text)) return 'card';
  if (/d[eé]bito/i.test(text)) return 'debit';
  if (/boleto/i.test(text)) return 'boleto';
  if (/transfer|\bted\b|\bdoc\b/i.test(text)) return 'transfer';
  return 'other';
}

const METHOD_WORDS: Record<CaptureMethod, { out: string; in: string }> = {
  card: { out: 'Compra no cartão', in: 'Estorno no cartão' },
  pix: { out: 'Pix enviado', in: 'Pix recebido' },
  debit: { out: 'Compra no débito', in: 'Crédito em conta' },
  transfer: { out: 'Transferência enviada', in: 'Transferência recebida' },
  boleto: { out: 'Boleto pago', in: 'Boleto recebido' },
  other: { out: 'Gasto', in: 'Entrada' },
};

/**
 * One sentence from a bank, read — or null when it is not a movement of money.
 *
 * `title` and `text` are what the notification showed; a shared receipt passes its whole text as
 * `text`. The amount is the first R$ figure; the direction is decided by inflow words before
 * outflow words, because "você recebeu um Pix" also contains "Pix".
 */
export function readBankText({
  id,
  source,
  bank,
  title = '',
  text,
  at,
}: {
  id: string;
  source: CaptureSource;
  bank: string | null;
  title?: string;
  text: string;
  at: string;
}): Detected | null {
  const raw = clean(`${title} ${text}`);
  if (!raw || NOT_A_MOVEMENT.test(raw)) return null;
  const amount = raw.match(AMOUNT);
  if (!amount?.[1]) return null;
  const amountCents = centsOf(amount[1]);
  if (amountCents <= 0) return null;

  const direction: Direction | null = INFLOW.test(raw) ? 'in' : OUTFLOW.test(raw) ? 'out' : null;
  if (!direction) return null;

  const method = methodOf(raw);
  const last4 = raw.match(/final\s*(\d{4})/i)?.[1] ?? raw.match(/\*{2,4}\s?(\d{4})/)?.[1] ?? null;
  const merchant = merchantOf(clean(text), direction) ?? merchantOf(raw, direction) ?? METHOD_WORDS[method][direction];

  return { id, source, bank, direction, amountCents, merchant, method, last4, at, raw };
}

/**
 * A receipt's text — a Pix comprovante, a print of a purchase, a PDF — read for the one movement it
 * records. Receipts carry the total under a label ("Valor", "Total", "Valor pago"), so that figure
 * wins over any other R$ on the page; the rest is the same reading as a notification.
 */
export function readReceiptText(text: string, id: string, at = new Date().toISOString()): Detected | null {
  const flat = clean(text);
  const labelled = flat.match(/(?:valor(?:\s+(?:pago|total|da\s+transfer[eê]ncia|do\s+pix|a\s+pagar))?|total(?:\s+pago)?)\s*:?\s*R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/i);
  const body = labelled?.[1] ? `R$ ${labelled[1]} ${flat}` : flat;
  // A receipt rarely says "compra"; it is a comprovante of something that left, unless it says received.
  const withVerb = INFLOW.test(body) || OUTFLOW.test(body) ? body : `pagamento ${body}`;
  const d = readBankText({ id, source: 'share', bank: null, text: withVerb, at: dateOf(flat) ?? at });
  if (!d) return null;
  const to = flat.match(/(?:destino|para|recebedor|favorecido|benefici[aá]rio)\s*:?\s*(?:nome\s*:?\s*)?([A-ZÀ-Ú][^\n\d]{2,40}?)(?=\s+(?:CPF|CNPJ|institui|banco|ag[eê]ncia|conta|chave)|$)/i)?.[1];
  const from = flat.match(/(?:origem|de|pagador|remetente)\s*:?\s*(?:nome\s*:?\s*)?([A-ZÀ-Ú][^\n\d]{2,40}?)(?=\s+(?:CPF|CNPJ|institui|banco|ag[eê]ncia|conta|chave)|$)/i)?.[1];
  const who = d.direction === 'out' ? to : from;
  return who && !notAName(who) ? { ...d, merchant: tidy(who) } : d;
}

/** "02/11/2026" or "02/11/2026 10:31" in a receipt → ISO, local time. */
function dateOf(text: string): string | null {
  const m = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:às|-|,)?\s*(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '12', mi = '00'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Words that name a kind of spending, mapped to the category names OTTO ships with. */
const HINTS: [RegExp, string[]][] = [
  [/ifood|rappi|restaurante|lanchonete|padaria|pizza|burger|bar\b|cafe|acai|sorvete|confeitaria/, ['Alimentação']],
  [/mercado|supermerc|atacad|assai|carrefour|hortifruti|acougue|pao de acucar/, ['Mercado', 'Alimentação']],
  [/uber|99\s?app|\b99\b|taxi|posto|combust|shell|ipiranga|estacion|pedagio|metro|onibus/, ['Transporte']],
  [/farmacia|drogaria|droga|raia|pacheco|clinica|hospital|laborat|dentist|medic/, ['Saúde']],
  [/netflix|spotify|prime|disney|hbo|max\b|youtube|apple\.com|google|deezer|globoplay|assinatura/, ['Assinaturas']],
  [/aluguel|condominio|energia|enel|light|cemig|sabesp|copasa|agua|internet|vivo|claro|tim\b|oi\b/, ['Moradia', 'Casa']],
  [/cinema|ingresso|show|steam|playstation|xbox|netshoes|viagem|hotel|airbnb/, ['Lazer']],
  [/renner|c&a|\bcea\b|riachuelo|zara|shein|roupa|calcad/, ['Roupas, calçados e acessórios.', 'Compras']],
];

/**
 * What the lançamento should say, learned from the owner first.
 *
 * The strongest evidence is the owner's own history: the last time "Padaria X" was recorded, it went
 * into Alimentação on the Nubank card, so this one does too. Only when the name is new does a
 * keyword guess apply, and only into a category the owner actually has. The account follows the
 * method and the bank — a card purchase lands on the card that carries the bank's name.
 */
export function suggestFor(
  d: Detected,
  entries: Entry[],
  accounts: Account[],
  categories: Category[],
): { title: string; category: string; accountId: string | null } {
  const name = norm(d.merchant);
  const first = name.split(' ')[0] ?? '';
  const past = [...entries]
    .filter((e) => e.direction === d.direction)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .find((e) => {
      const t = norm(e.title);
      return t === name || (first.length >= 4 && t.split(' ')[0] === first);
    });

  const owned = new Set(categories.map((c) => c.name));
  const hinted = HINTS.find(([re]) => re.test(name))?.[1].find((c) => owned.has(c));
  const fallback = d.direction === 'in' ? (owned.has('Renda Extra') ? 'Renda Extra' : 'Outros') : 'Outros';
  const category = past?.category ?? hinted ?? fallback;

  const bank = d.bank ? norm(d.bank) : null;
  const cards = accounts.filter((a) => a.kind === 'card');
  const holding = accounts.filter((a) => a.kind !== 'card');
  const named = (list: Account[]) => (bank ? list.find((a) => norm(a.name).includes(bank)) : undefined);
  const viaCard = d.method === 'card' && d.direction === 'out';
  const account =
    (past && accounts.some((a) => a.id === past.accountId) ? accounts.find((a) => a.id === past.accountId) : undefined) ??
    (viaCard ? (named(cards) ?? cards[0]) : undefined) ??
    named(holding) ??
    holding[0] ??
    accounts[0];

  return { title: d.merchant, category, accountId: account?.id ?? null };
}

/**
 * Already in the ledger? The same amount, the same way, within a day of when it happened — the
 * owner who recorded it by hand before the notification was read should not record it twice.
 */
export function alreadyRecorded(d: Detected, entries: Entry[]): boolean {
  const day = d.at.slice(0, 10);
  const t = new Date(`${day}T12:00:00`).getTime();
  return entries.some((e) => {
    if (e.amountCents !== d.amountCents || e.direction !== d.direction) return false;
    const gap = Math.abs(new Date(`${e.date}T12:00:00`).getTime() - t);
    return gap <= 36 * 3600 * 1000;
  });
}

/** "Itaú · cartão final 1234", "Pix", "comprovante" — how the row says where it came from. */
export function originOf(d: Detected): string {
  const how =
    d.method === 'card'
      ? d.last4
        ? `cartão final ${d.last4}`
        : 'cartão'
      : d.method === 'pix'
        ? 'Pix'
        : d.method === 'debit'
          ? 'débito'
          : d.method === 'transfer'
            ? 'transferência'
            : d.method === 'boleto'
              ? 'boleto'
              : null;
  const where = d.source === 'receipt' ? 'nota fiscal' : d.source === 'share' ? 'comprovante' : d.bank;
  return [where, how].filter(Boolean).join(' · ');
}

/**
 * A nota fiscal (NFC-e), from its QR code.
 *
 * The QR on every cupom fiscal is a URL to the state's SEFAZ, carrying the 44-digit chave de acesso.
 * The page it opens is public and names the store, the total and the moment of the sale — a better
 * record than a bank notification, which knows the amount but often only an abbreviation of the
 * store. Each state draws that page a little differently, so this reads it as text and looks for
 * the labels they share; when the page cannot be read, the chave alone still gives the store's
 * CNPJ and the month, and the owner types the figure.
 */
export interface NfceKey {
  key: string;
  uf: string;
  /** "2026-11" — the month the note was issued in. */
  month: string;
  cnpj: string;
}

/** The chave de acesso inside an NFC-e QR, or null when the code is something else. */
export function nfceKey(qr: string): NfceKey | null {
  const key = qr.match(/(?:\?|&|^)(?:p|chNFe)=(\d{44})/)?.[1] ?? qr.match(/\b(\d{44})\b/)?.[1];
  if (!key || key.slice(20, 22) !== '65') return null; // model 65 is the NFC-e
  return {
    key,
    uf: key.slice(0, 2),
    month: `20${key.slice(2, 4)}-${key.slice(4, 6)}`,
    cnpj: key.slice(6, 20),
  };
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ({ aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', agrave: 'à' })[name.toLowerCase()] ?? m);

/** The SEFAZ consultation page, read for the store, the total and the date. */
export function readNfcePage(html: string, key: NfceKey, id: string, now = new Date().toISOString()): Detected | null {
  const store =
    html.match(/class="txtTopo"[^>]*>([^<]+)</i)?.[1] ??
    html.match(/id="u20"[^>]*>([^<]+)</i)?.[1] ??
    html.match(/<h4[^>]*>([^<]+)<\/h4>/i)?.[1];
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const total =
    text.match(/valor\s+a\s+pagar\s*R?\$?\s*:?\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/i)?.[1] ??
    text.match(/valor\s+total\s*(?:R\$)?\s*:?\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/i)?.[1] ??
    text.match(/total\s*R\$\s*:?\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/i)?.[1];
  if (!total) return null;
  const amountCents = centsOf(total);
  if (amountCents <= 0) return null;
  const when = text.match(/emiss[aã]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i);
  const at = when
    ? new Date(Number(when[3]), Number(when[2]) - 1, Number(when[1]), Number(when[4]), Number(when[5])).toISOString()
    : now;
  const items = (html.match(/class="txtTit/gi) ?? []).length;
  return {
    id,
    source: 'receipt',
    bank: null,
    direction: 'out',
    amountCents,
    merchant: store ? tidy(decode(store)) : `Compra CNPJ ${key.cnpj}`,
    method: /cart[aã]o\s+de\s+cr[eé]dito/i.test(text) ? 'card' : /pix/i.test(text) ? 'pix' : /d[eé]bito/i.test(text) ? 'debit' : 'other',
    last4: null,
    at,
    raw: items > 0 ? `Nota fiscal com ${items} ${items === 1 ? 'item' : 'itens'}` : 'Nota fiscal',
  };
}

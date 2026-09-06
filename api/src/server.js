import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { Pool } from 'pg';

const port = Number(process.env.PORT || 3333);
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!databaseUrl || !jwtSecret) throw new Error('DATABASE_URL and JWT_SECRET are required.');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

const json = (response, status, body) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  response.end(JSON.stringify(body));
};

const fail = (response, status, message) => json(response, status, { error: message });

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: user.id, email: user.email, iat: now, exp: now + 60 * 60 * 24 * 30 }));
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.sub === 'string' && parsed.exp > Math.floor(Date.now() / 1000) ? parsed : null;
  } catch { return null; }
}

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Payload too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('Invalid JSON.'); }
}

// Mirrors `categoryIcons` in src/domain/category.ts and `categoryHues` in src/theme/tokens.ts.
// Duplicated because this server has no build step and imports nothing from the app.
//
// This drifted once already, within an hour of being written: the client palette was re-derived from
// five to eight hues and this list was not, so every save came back 400 "Razão inválido" with no
// clue which field was wrong. Two things changed because of that. These lists are named after the
// exact client constants above, and the client now falls back to a safe glyph and a neutral tint for
// a value it does not recognise — so the next drift is a wrong-looking icon, not a dead save.
const CATEGORY_ICONS = ['tag','home','lamp','fork','cart','car','heart','spark','repeat','card','wallet','bolt','book','gift','plane','pet'];
const CATEGORY_HUES = ['terracotta','bronze','teal','azure','plum'];

function text(value, max = 140) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function ledger(value) {
  if (!value || !Array.isArray(value.accounts) || !Array.isArray(value.series) || !Array.isArray(value.entries)) return null;
  if (value.accounts.length > 100 || value.series.length > 2_000 || value.entries.length > 20_000) return null;
  const accountIds = new Set();
  for (const account of value.accounts) {
    if (!text(account.id, 80) || !text(account.name) || !['checking', 'savings', 'card'].includes(account.kind) || !Number.isSafeInteger(account.openingCents)) return null;
    if (accountIds.has(account.id)) return null;
    accountIds.add(account.id);
  }
  const seriesIds = new Set();
  for (const item of value.series) {
    if (!text(item.id, 80) || !['inflow', 'outflow', 'debt', 'card'].includes(item.kind) || !text(item.title) || !text(item.category) || !accountIds.has(item.accountId) || !Number.isSafeInteger(item.amountCents) || item.amountCents < 0 || !['in', 'out'].includes(item.direction) || !Number.isInteger(item.dayOfMonth) || item.dayOfMonth < 1 || item.dayOfMonth > 31 || !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) return null;
    if (!Number.isInteger(item.paidCount) || item.paidCount < 0) return null;
    if (item.kind === 'debt' &&
      (!Number.isInteger(item.totalCount) || item.totalCount < 1 || item.paidCount > item.totalCount)) return null;
    if (seriesIds.has(item.id)) return null;
    if (item.counterparty != null && !text(item.counterparty, 80)) return null;
    if (item.linkedShareToken != null && !text(item.linkedShareToken, 100)) return null;
    seriesIds.add(item.id);
  }
  const entryIds = new Set();
  for (const item of value.entries) {
    // Checked here rather than left to the primary key. The insert runs inside the transaction that
    // has already deleted everything, so a duplicate id there is a 500 and a lost document; caught
    // here it is a 400 that says so, and the client can act on it.
    if (entryIds.has(item.id)) return null;
    entryIds.add(item.id);
    if (!text(item.id, 80) || !text(item.title) || !text(item.category) || !accountIds.has(item.accountId) || (item.seriesId !== null && !seriesIds.has(item.seriesId)) || (item.settlesDate != null && (item.seriesId === null || !/^\d{4}-\d{2}-\d{2}$/.test(item.settlesDate))) || !Number.isSafeInteger(item.amountCents) || item.amountCents < 0 || !['in', 'out'].includes(item.direction) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
    // Optional on purpose, exactly like caps: a build older than this field PUTs entries with no
    // `recordedAt`, and rejecting the whole ledger over a timestamp it has never heard of would
    // break saving for everyone still on the old app.
    if (item.recordedAt != null && (typeof item.recordedAt !== 'string' || Number.isNaN(Date.parse(item.recordedAt)))) return null;
  }
  // Optional on purpose: a build older than this field PUTs a document without `caps`, and
  // rejecting its whole ledger over a budget it has never heard of would break saving entirely.
  if (value.caps != null) {
    if (!Array.isArray(value.caps) || value.caps.length > 200) return null;
    const capNames = new Set();
    for (const cap of value.caps) {
      if (!text(cap.category) || capNames.has(cap.category)) return null;
      if (!Number.isSafeInteger(cap.capCents) || cap.capCents <= 0) return null;
      capNames.add(cap.category);
    }
  }
  // Same contract as caps, for the same reason: an older build PUTs no `categories` key and must
  // not have its ledger rejected over a field it has never heard of.
  //
  // `icon` and `hue` are checked against the closed sets the client draws from rather than taken
  // as free text. The client can already only send these, so this is not defence against the app —
  // it is defence against a stored value the app would later have to render, and there is no sane
  // fallback for "an icon that does not exist" three screens deep in a chart.
  if (value.categories != null) {
    if (!Array.isArray(value.categories) || value.categories.length > 200) return null;
    const names = new Set();
    for (const item of value.categories) {
      const name = text(item.name, 40);
      if (!name || names.has(name.toLowerCase())) return null;
      if (!CATEGORY_ICONS.includes(item.icon) || !CATEGORY_HUES.includes(item.hue)) return null;
      if (item.description != null && !text(item.description, 160)) return null;
      names.add(name.toLowerCase());
    }
  }
  return value;
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('checking', 'savings', 'card')),
      opening_cents BIGINT NOT NULL,
      closing_day INTEGER,
      due_day INTEGER,
      limit_cents BIGINT,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS series (
      id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('inflow', 'outflow', 'debt', 'card')),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      account_id TEXT NOT NULL,
      amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
      start_date DATE NOT NULL,
      end_date DATE,
      total_count INTEGER,
      paid_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE
    );
    ALTER TABLE series ADD COLUMN IF NOT EXISTS counterparty TEXT;
    ALTER TABLE series ADD COLUMN IF NOT EXISTS linked_share_token TEXT;
    CREATE TABLE IF NOT EXISTS debt_shares (
      id UUID PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_series_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      accepted_series_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      accepted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      FOREIGN KEY (owner_user_id, source_series_id)
        REFERENCES series(user_id, id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      series_id TEXT,
      date DATE NOT NULL,
      amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      account_id TEXT NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, series_id) REFERENCES series(user_id, id) ON DELETE SET NULL
    );
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS settles_date DATE;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS category_caps (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      cap_cents BIGINT NOT NULL CHECK (cap_cents > 0),
      PRIMARY KEY (user_id, category)
    );
    CREATE TABLE IF NOT EXISTS categories (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      hue TEXT NOT NULL,
      description TEXT,
      PRIMARY KEY (user_id, name)
    );
    CREATE INDEX IF NOT EXISTS entries_by_owner_date ON entries (user_id, date);
    CREATE INDEX IF NOT EXISTS series_by_owner_day ON series (user_id, day_of_month);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_share_per_debt
      ON debt_shares (owner_user_id, source_series_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS debt_shares_by_token ON debt_shares (token) WHERE revoked_at IS NULL;
  `);
}

async function readLedger(userId) {
  const [accounts, series, entries, caps, categories] = await Promise.all([
    pool.query('SELECT id, name, kind, opening_cents AS "openingCents", closing_day AS "closingDay", due_day AS "dueDay", limit_cents AS "limitCents" FROM accounts WHERE user_id = $1 ORDER BY name', [userId]),
    pool.query(`
      SELECT local.id,
        COALESCE(source.kind, local.kind) AS kind,
        COALESCE(source.title, local.title) AS title,
        COALESCE(source.category, local.category) AS category,
        local.account_id AS "accountId",
        COALESCE(source.amount_cents, local.amount_cents) AS "amountCents",
        CASE WHEN source.id IS NOT NULL THEN CASE source.direction WHEN 'out' THEN 'in' ELSE 'out' END ELSE local.direction END AS direction,
        COALESCE(source.day_of_month, local.day_of_month) AS "dayOfMonth",
        to_char(COALESCE(source.start_date, local.start_date), 'YYYY-MM-DD') AS "startDate",
        to_char(COALESCE(source.end_date, local.end_date), 'YYYY-MM-DD') AS "endDate",
        COALESCE(source.total_count, local.total_count) AS "totalCount",
        COALESCE(source.paid_count, local.paid_count) AS "paidCount",
        COALESCE(owner.name, local.counterparty) AS counterparty,
        local.linked_share_token AS "linkedShareToken"
      FROM series local
      LEFT JOIN debt_shares share
        ON share.token = local.linked_share_token AND share.revoked_at IS NULL
      LEFT JOIN series source
        ON source.user_id = share.owner_user_id AND source.id = share.source_series_id
      LEFT JOIN users owner ON owner.id = share.owner_user_id
      WHERE local.user_id = $1
      ORDER BY COALESCE(source.day_of_month, local.day_of_month), COALESCE(source.title, local.title)
    `, [userId]),
    pool.query('SELECT id, series_id AS "seriesId", to_char(settles_date, \'YYYY-MM-DD\') AS "settlesDate", recorded_at AS "recordedAt", to_char(date, \'YYYY-MM-DD\') AS date, amount_cents AS "amountCents", direction, title, category, account_id AS "accountId" FROM entries WHERE user_id = $1 ORDER BY date', [userId]),
    pool.query('SELECT category, cap_cents AS "capCents" FROM category_caps WHERE user_id = $1 ORDER BY category', [userId]),
    pool.query('SELECT name, icon, hue, description FROM categories WHERE user_id = $1 ORDER BY name', [userId]),
  ]);
  const normalize = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && /^-?\d+$/.test(value) && ['openingCents', 'limitCents', 'amountCents', 'capCents'].includes(key) ? Number(value) : value]));
  return { accounts: accounts.rows.map(normalize), series: series.rows.map(normalize), entries: entries.rows.map(normalize), caps: caps.rows.map(normalize), categories: categories.rows.map(normalize) };
}

async function replaceLedger(userId, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The client replaces its compact ledger atomically. Preserve active capabilities across that
    // rewrite; otherwise changing an unrelated account would silently revoke every shared debt via
    // the source-series foreign key cascade.
    const activeShares = await client.query(
      'SELECT * FROM debt_shares WHERE owner_user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    await client.query('DELETE FROM entries WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM series WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
    for (const item of next.accounts) await client.query('INSERT INTO accounts (id,user_id,name,kind,opening_cents,closing_day,due_day,limit_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [item.id, userId, item.name, item.kind, item.openingCents, item.closingDay, item.dueDay, item.limitCents]);
    for (const item of next.series) await client.query('INSERT INTO series (id,user_id,kind,title,category,account_id,amount_cents,direction,day_of_month,start_date,end_date,total_count,paid_count,counterparty,linked_share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [item.id,userId,item.kind,item.title,item.category,item.accountId,item.amountCents,item.direction,item.dayOfMonth,item.startDate,item.endDate,item.totalCount,item.paidCount,item.counterparty ?? null,item.linkedShareToken ?? null]);
    const survivingDebts = new Set(next.series.filter((item) => item.kind === 'debt').map((item) => item.id));
    for (const share of activeShares.rows) {
      if (!survivingDebts.has(share.source_series_id)) continue;
      await client.query(`
        INSERT INTO debt_shares
          (id,token,owner_user_id,source_series_id,recipient_name,accepted_by_user_id,accepted_series_id,created_at,accepted_at,revoked_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
      `, [share.id, share.token, share.owner_user_id, share.source_series_id, share.recipient_name,
        share.accepted_by_user_id, share.accepted_series_id, share.created_at, share.accepted_at]);
    }
    for (const item of next.entries) await client.query('INSERT INTO entries (id,user_id,series_id,settles_date,recorded_at,date,amount_cents,direction,title,category,account_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [item.id,userId,item.seriesId,item.settlesDate ?? null,item.recordedAt ?? null,item.date,item.amountCents,item.direction,item.title,item.category,item.accountId]);
    /*
     * Caps are replaced only when the document actually carries them.
     *
     * Absent is not empty. A build older than this field PUTs a ledger with no `caps` key at all,
     * and treating that as "the owner has no budgets" would wipe every ceiling they set the moment
     * they recorded a lançamento from an old install. Everything else here is replace-the-world
     * because the client always sends the whole of it; this one field is the exception, because
     * some clients cannot.
     */
    if (Array.isArray(next.caps)) {
      await client.query('DELETE FROM category_caps WHERE user_id = $1', [userId]);
      for (const item of next.caps) await client.query('INSERT INTO category_caps (user_id,category,cap_cents) VALUES ($1,$2,$3)', [userId, item.category, item.capCents]);
    }
    // Absent is not empty here either, and the stakes are the same shape: wiping the icons and
    // colours somebody chose because an old build did not send them is a small loss that feels
    // like a large one.
    if (Array.isArray(next.categories)) {
      await client.query('DELETE FROM categories WHERE user_id = $1', [userId]);
      for (const item of next.categories) await client.query('INSERT INTO categories (user_id,name,icon,hue,description) VALUES ($1,$2,$3,$4,$5)', [userId, item.name, item.icon, item.hue, item.description ?? null]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function publicShare(token) {
  const result = await pool.query(`
    SELECT share.recipient_name AS "recipientName", share.accepted_at AS "acceptedAt",
      owner.name AS "ownerName", source.title, source.category,
      source.amount_cents AS "amountCents", source.direction, source.day_of_month AS "dayOfMonth",
      to_char(source.start_date, 'YYYY-MM-DD') AS "startDate",
      source.total_count AS "totalCount", source.paid_count AS "paidCount"
    FROM debt_shares share
    JOIN users owner ON owner.id = share.owner_user_id
    JOIN series source ON source.user_id = share.owner_user_id AND source.id = share.source_series_id
    WHERE share.token = $1 AND share.revoked_at IS NULL
      AND source.kind = 'debt' AND source.total_count IS NOT NULL
  `, [token]);
  const row = result.rows[0];
  if (!row) return null;
  const share = Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === 'string' && /^-?\d+$/.test(value) && ['amountCents'].includes(key) ? Number(value) : value,
  ]));

  /*
   * The payments themselves, and nothing else about the owner's money.
   *
   * Scoped by `series_id` to the one debt this token names, and selecting four columns rather than
   * the row: the token is a capability to watch one debt, not a window into a ledger, and a
   * `SELECT *` here would put every other lançamento's title one careless join away from a public
   * endpoint. `account_id` in particular never leaves the server.
   *
   * Ascending, because the reader is being handed a sequence to count through. The client reverses
   * it where the reading is "what happened lately" — that is a presentation choice, and it does not
   * belong in a payload two screens share.
   */
  const paid = await pool.query(`
    SELECT to_char(entry.date, 'YYYY-MM-DD') AS "paidOn",
      to_char(COALESCE(entry.settles_date, entry.date), 'YYYY-MM-DD') AS "scheduled",
      entry.recorded_at AS "recordedAt", entry.amount_cents AS "amountCents"
    FROM entries entry
    JOIN debt_shares share ON share.owner_user_id = entry.user_id
      AND share.source_series_id = entry.series_id
    WHERE share.token = $1 AND share.revoked_at IS NULL
    ORDER BY COALESCE(entry.settles_date, entry.date), entry.date
    LIMIT 480
  `, [token]);

  return {
    ...share,
    payments: paid.rows.map((p) => ({ ...p, amountCents: Number(p.amountCents) })),
  };
}

async function shareForDebt(userId, seriesId) {
  const result = await pool.query(`
    SELECT token, recipient_name AS "recipientName", accepted_at AS "acceptedAt"
    FROM debt_shares
    WHERE owner_user_id = $1 AND source_series_id = $2 AND revoked_at IS NULL
  `, [userId, seriesId]);
  return result.rows[0] ?? null;
}

async function createShare(userId, seriesId, recipientName) {
  const debt = await pool.query(
    `SELECT id FROM series WHERE user_id = $1 AND id = $2 AND kind = 'debt'`,
    [userId, seriesId],
  );
  if (!debt.rows[0]) return null;
  const existing = await shareForDebt(userId, seriesId);
  if (existing) {
    await pool.query(
      'UPDATE debt_shares SET recipient_name = $1 WHERE owner_user_id = $2 AND source_series_id = $3 AND revoked_at IS NULL',
      [recipientName, userId, seriesId],
    );
    return { ...existing, recipientName };
  }
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO debt_shares (id, token, owner_user_id, source_series_id, recipient_name) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), token, userId, seriesId, recipientName],
  );
  return { token, recipientName, acceptedAt: null };
}

async function acceptShare(userId, token) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`
      SELECT share.*, source.title, source.category, source.amount_cents, source.direction,
        source.day_of_month, source.start_date, source.end_date, source.total_count,
        source.paid_count, owner.name AS owner_name
      FROM debt_shares share
      JOIN series source ON source.user_id = share.owner_user_id AND source.id = share.source_series_id
      JOIN users owner ON owner.id = share.owner_user_id
      WHERE share.token = $1 AND share.revoked_at IS NULL
        AND source.kind = 'debt' AND source.total_count IS NOT NULL
      FOR UPDATE OF share
    `, [token]);
    const item = found.rows[0];
    if (!item) { await client.query('ROLLBACK'); return { status: 'missing' }; }
    if (item.owner_user_id === userId) { await client.query('ROLLBACK'); return { status: 'owner' }; }
    if (item.accepted_by_user_id && item.accepted_by_user_id !== userId) {
      await client.query('ROLLBACK'); return { status: 'taken' };
    }
    if (item.accepted_by_user_id === userId && item.accepted_series_id) {
      await client.query('COMMIT'); return { status: 'accepted', seriesId: item.accepted_series_id };
    }
    const account = await client.query(
      `SELECT id FROM accounts WHERE user_id = $1 AND kind <> 'card' ORDER BY name LIMIT 1`,
      [userId],
    );
    if (!account.rows[0]) { await client.query('ROLLBACK'); return { status: 'no-account' }; }
    const seriesId = randomUUID();
    await client.query(`
      INSERT INTO series
        (id,user_id,kind,title,category,account_id,amount_cents,direction,day_of_month,start_date,end_date,total_count,paid_count,counterparty,linked_share_token)
      VALUES ($1,$2,'debt',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [seriesId, userId, item.title, item.category, account.rows[0].id, item.amount_cents,
      item.direction === 'out' ? 'in' : 'out', item.day_of_month, item.start_date, item.end_date,
      item.total_count, item.paid_count, item.owner_name, token]);
    await client.query(
      'UPDATE debt_shares SET accepted_by_user_id = $1, accepted_series_id = $2, accepted_at = now() WHERE token = $3',
      [userId, seriesId, token],
    );
    await client.query('COMMIT');
    return { status: 'accepted', seriesId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function route(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const url = new URL(request.url || '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });
  const publicMatch = url.pathname.match(/^\/v1\/debt-shares\/([A-Za-z0-9_-]{40,100})$/);
  if (request.method === 'GET' && publicMatch) {
    const shared = await publicShare(publicMatch[1]);
    return shared ? json(response, 200, shared) : fail(response, 404, 'Este acompanhamento não está mais disponível.');
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/register') {
    const input = await body(request); const name = text(input.name); const email = text(input.email, 254)?.toLowerCase(); const password = input.password;
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) return fail(response, 400, 'Dados de cadastro inválidos.');
    const user = { id: randomUUID(), name, email };
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO users (id,name,email,password_hash) VALUES ($1,$2,$3,$4)', [user.id, user.name, user.email, passwordHash(password)]);
        await client.query('INSERT INTO accounts (id,user_id,name,kind,opening_cents) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), user.id, 'Conta corrente', 'checking', 0]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    catch (error) { if (error.code === '23505') return fail(response, 409, 'Este e-mail já está cadastrado.'); throw error; }
    return json(response, 201, { ...user, provider: 'password', createdAt: Date.now(), accessToken: signToken(user) });
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
    const input = await body(request); const email = text(input.email, 254)?.toLowerCase();
    if (!email || typeof input.password !== 'string') return fail(response, 400, 'E-mail ou senha inválidos.');
    const result = await pool.query('SELECT id,name,email,password_hash FROM users WHERE email = $1', [email]); const user = result.rows[0];
    if (!user || !passwordMatches(input.password, user.password_hash)) return fail(response, 401, 'E-mail ou senha incorretos.');
    return json(response, 200, { id: user.id, name: user.name, email: user.email, provider: 'password', createdAt: Date.now(), accessToken: signToken(user) });
  }
  const auth = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]; const claims = auth ? verifyToken(auth) : null;
  if (!claims) return fail(response, 401, 'Sessão inválida ou expirada.');
  const acceptMatch = url.pathname.match(/^\/v1\/debt-shares\/([A-Za-z0-9_-]{40,100})\/accept$/);
  if (request.method === 'POST' && acceptMatch) {
    const accepted = await acceptShare(claims.sub, acceptMatch[1]);
    if (accepted.status === 'missing') return fail(response, 404, 'Este acompanhamento não está mais disponível.');
    if (accepted.status === 'owner') return fail(response, 409, 'Esta dívida já pertence a você.');
    if (accepted.status === 'taken') return fail(response, 409, 'Este convite já foi aceito por outra pessoa.');
    if (accepted.status === 'no-account') return fail(response, 409, 'Crie uma conta antes de adicionar este valor.');
    return json(response, 200, accepted);
  }
  const debtShareMatch = url.pathname.match(/^\/v1\/debts\/([^/]+)\/share$/);
  if (debtShareMatch && request.method === 'GET') {
    return json(response, 200, await shareForDebt(claims.sub, decodeURIComponent(debtShareMatch[1])));
  }
  if (debtShareMatch && request.method === 'POST') {
    const input = await body(request); const recipientName = text(input.recipientName, 80);
    if (!recipientName) return fail(response, 400, 'Informe com quem esta dívida será compartilhada.');
    const shared = await createShare(claims.sub, decodeURIComponent(debtShareMatch[1]), recipientName);
    return shared ? json(response, 201, shared) : fail(response, 404, 'Dívida não encontrada.');
  }
  if (debtShareMatch && request.method === 'DELETE') {
    await pool.query('UPDATE debt_shares SET revoked_at = now() WHERE owner_user_id = $1 AND source_series_id = $2 AND revoked_at IS NULL', [claims.sub, decodeURIComponent(debtShareMatch[1])]);
    return json(response, 200, { ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/v1/ledger') return json(response, 200, await readLedger(claims.sub));
  if (request.method === 'PUT' && url.pathname === '/v1/ledger') {
    const next = ledger(await body(request)); if (!next) return fail(response, 400, 'Razão inválido.');
    await replaceLedger(claims.sub, next); return json(response, 200, await readLedger(claims.sub));
  }
  if (request.method === 'DELETE' && url.pathname === '/v1/ledger') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM entries WHERE user_id = $1', [claims.sub]);
      await client.query('DELETE FROM series WHERE user_id = $1', [claims.sub]);
      await client.query('DELETE FROM accounts WHERE user_id = $1', [claims.sub]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return json(response, 200, { ok: true });
  }
  return fail(response, 404, 'Rota não encontrada.');
}

await migrate();
const server = createServer((request, response) => route(request, response).catch((error) => { console.error(error); fail(response, 500, 'Erro interno.'); }));

/*
 * Outlive the proxy in front of us.
 *
 * Node closes an idle keep-alive connection after 5 seconds. Railway's edge holds connections open
 * for longer than that, so the edge can pick a socket this process has just decided to close and
 * lose the request on it — a failure the client sees and the server never logs. The rule is that the
 * thing behind must wait longer than the thing in front, so these sit above any proxy idle timeout.
 */
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(port, '0.0.0.0', () => console.log(`OTTO API listening on ${port}`));

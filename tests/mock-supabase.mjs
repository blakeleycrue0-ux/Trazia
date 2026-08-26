#!/usr/bin/env node
/**
 * Servidor de pruebas: habla el protocolo de Supabase (GoTrue + PostgREST) por
 * delante y ejecuta las consultas contra un PostgreSQL real por detras, con el
 * esquema de database.sql y sus politicas RLS activas.
 *
 * Sirve para probar la aplicacion completa en local sin depender de la nube.
 * NO es un sustituto de Supabase ni debe usarse en produccion: los tokens no
 * son JWT firmados y no hay envio de correos.
 *
 *   node tests/mock-supabase.mjs [puerto]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.argv[2] || 8788);
const ROOT = resolve(process.cwd());
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/trazia_test';
/** Cuando es false, el registro exige confirmar el correo (como Supabase por defecto). */
const AUTOCONFIRM = process.env.MOCK_AUTOCONFIRM !== 'false';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
const sessions = new Map();   // access_token -> userId
const refreshTokens = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function authError(res, status, message, code = 'invalid_request') {
  send(res, status, { error: code, error_description: message, message, msg: message, code: status });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':');
  if (!salt || !key) return false;
  const attempt = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return attempt.length === expected.length && timingSafeEqual(attempt, expected);
}

async function ensureAuthTable() {
  await pool.query(`
    create table if not exists auth.test_credentials (
      user_id uuid primary key references auth.users (id) on delete cascade,
      password_hash text not null,
      confirmed boolean not null default true
    )`);
}

function userPayload(row, confirmed) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: confirmed ? row.created_at : null,
    confirmed_at: confirmed ? row.created_at : null,
    phone: '',
    created_at: row.created_at,
    updated_at: row.created_at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: row.raw_user_meta_data || {},
    identities: [{
      id: row.id,
      user_id: row.id,
      identity_id: row.id,
      provider: 'email',
      identity_data: { email: row.email, sub: row.id },
      created_at: row.created_at,
      last_sign_in_at: row.created_at,
    }],
  };
}

function createSession(user) {
  const accessToken = randomBytes(24).toString('hex');
  const refreshToken = randomBytes(24).toString('hex');
  sessions.set(accessToken, user.id);
  refreshTokens.set(refreshToken, user.id);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refreshToken,
    user,
  };
}

async function loadUser(userId) {
  const { rows } = await pool.query(
    `select u.*, c.confirmed from auth.users u
     left join auth.test_credentials c on c.user_id = u.id where u.id = $1`, [userId],
  );
  if (!rows.length) return null;
  return userPayload(rows[0], rows[0].confirmed !== false);
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return sessions.get(token) || null;
}

/* -------------------------------------------------------------------------- */
/* GoTrue                                                                      */
/* -------------------------------------------------------------------------- */

async function handleAuth(req, res, url) {
  const path = url.pathname.replace('/auth/v1', '');
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};

  if (path === '/signup' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    if (!email.includes('@')) return authError(res, 422, 'Unable to validate email address: invalid format');
    if (password.length < 6) return authError(res, 422, 'Password should be at least 6 characters');

    const existing = await pool.query('select id, email, created_at, raw_user_meta_data from auth.users where email = $1', [email]);
    if (existing.rows.length) {
      // Igual que Supabase: devuelve un usuario sin identidades para no revelar
      // si el correo existe.
      const user = userPayload(existing.rows[0], true);
      user.identities = [];
      return send(res, 200, { user, session: null });
    }

    const id = randomUUID();
    const { rows } = await pool.query(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3) returning *',
      [id, email, JSON.stringify(body.data || {})],
    );
    await pool.query(
      'insert into auth.test_credentials (user_id, password_hash, confirmed) values ($1, $2, $3)',
      [id, hashPassword(password), AUTOCONFIRM],
    );
    const user = userPayload(rows[0], AUTOCONFIRM);
    if (!AUTOCONFIRM) return send(res, 200, { user, session: null });
    const session = createSession(user);
    return send(res, 200, { ...session, session, user });
  }

  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'refresh_token') {
      const userId = refreshTokens.get(body.refresh_token);
      if (!userId) return authError(res, 400, 'Invalid Refresh Token', 'invalid_grant');
      const user = await loadUser(userId);
      const session = createSession(user);
      return send(res, 200, { ...session, session, user });
    }
    const email = String(body.email || '').toLowerCase().trim();
    const { rows } = await pool.query(
      `select u.*, c.password_hash, c.confirmed from auth.users u
       left join auth.test_credentials c on c.user_id = u.id where u.email = $1`, [email],
    );
    if (!rows.length || !verifyPassword(String(body.password || ''), rows[0].password_hash)) {
      return authError(res, 400, 'Invalid login credentials', 'invalid_grant');
    }
    if (rows[0].confirmed === false) {
      return authError(res, 400, 'Email not confirmed', 'invalid_grant');
    }
    const user = userPayload(rows[0], true);
    const session = createSession(user);
    return send(res, 200, { ...session, session, user });
  }

  if (path === '/user' && req.method === 'GET') {
    const userId = bearer(req);
    if (!userId) return authError(res, 401, 'Auth session missing!', 'unauthorized');
    return send(res, 200, await loadUser(userId));
  }

  if (path === '/user' && req.method === 'PUT') {
    const userId = bearer(req);
    if (!userId) return authError(res, 401, 'Auth session missing!', 'unauthorized');
    if (body.password) {
      if (String(body.password).length < 6) return authError(res, 422, 'Password should be at least 6 characters');
      await pool.query('update auth.test_credentials set password_hash = $2 where user_id = $1',
        [userId, hashPassword(String(body.password))]);
    }
    if (body.data) {
      await pool.query('update auth.users set raw_user_meta_data = raw_user_meta_data || $2 where id = $1',
        [userId, JSON.stringify(body.data)]);
    }
    return send(res, 200, await loadUser(userId));
  }

  if (path === '/logout' && req.method === 'POST') {
    const header = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    sessions.delete(header);
    res.writeHead(204).end();
    return undefined;
  }

  if ((path === '/recover' || path === '/resend' || path === '/otp') && req.method === 'POST') {
    // En pruebas no se envian correos; respondemos como Supabase.
    return send(res, 200, {});
  }

  return authError(res, 404, `Not found: ${path}`, 'not_found');
}

/* -------------------------------------------------------------------------- */
/* PostgREST                                                                   */
/* -------------------------------------------------------------------------- */

const OPERATORS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', is: 'is' };
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const IDENT = /^[a-z_][a-z0-9_]*$/;

function quote(identifier) {
  if (!IDENT.test(identifier)) throw new Error(`Identificador no válido: ${identifier}`);
  return `"${identifier}"`;
}

function buildFilters(url, values) {
  const clauses = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (RESERVED.has(key)) continue;
    const [operator, ...rest] = raw.split('.');
    const sql = OPERATORS[operator];
    if (!sql) continue;
    const value = rest.join('.');
    if (operator === 'is') {
      clauses.push(`${quote(key)} is ${value === 'null' ? 'null' : 'not null'}`);
    } else {
      values.push(value);
      clauses.push(`${quote(key)} ${sql} $${values.length}`);
    }
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : '';
}

function buildOrder(url) {
  const order = url.searchParams.getAll('order');
  if (!order.length) return '';
  const parts = [];
  for (const entry of order) {
    for (const piece of entry.split(',')) {
      const [column, ...modifiers] = piece.split('.');
      if (!IDENT.test(column)) continue;
      const direction = modifiers.includes('desc') ? 'desc' : 'asc';
      const nulls = modifiers.includes('nullsfirst') ? ' nulls first'
        : modifiers.includes('nullslast') ? ' nulls last' : '';
      parts.push(`${quote(column)} ${direction}${nulls}`);
    }
  }
  return parts.length ? ` order by ${parts.join(', ')}` : '';
}

function pgError(res, error) {
  const status = error.code === '23505' ? 409
    : error.code === '42501' ? 403
    : error.code === '23503' ? 409
    : error.code === '23514' || error.code === '22P02' || error.code === '23502' ? 400
    : 500;
  send(res, status, {
    code: error.code || 'unknown',
    message: error.message,
    details: error.detail || null,
    hint: error.hint || null,
  });
}

async function handleRest(req, res, url) {
  const userId = bearer(req);
  if (!userId) {
    return send(res, 401, { code: 'PGRST301', message: 'JWT expired or missing', details: null, hint: null });
  }

  const segments = url.pathname.replace('/rest/v1/', '').split('/');
  const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
  const prefer = String(req.headers.prefer || '');
  const returnsRows = prefer.includes('return=representation') || req.method === 'GET';

  const clientConnection = await pool.connect();
  try {
    await clientConnection.query('begin');
    await clientConnection.query("set local role authenticated");
    await clientConnection.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);

    if (segments[0] === 'rpc') {
      const fn = segments[1];
      if (!IDENT.test(fn)) throw new Error('Función no válida');
      const result = await clientConnection.query(`select public.${quote(fn)}() as value`);
      await clientConnection.query('commit');
      return send(res, 200, result.rows[0]?.value ?? null);
    }

    const table = segments[0];
    const values = [];
    let sql;

    if (req.method === 'GET') {
      sql = `select * from public.${quote(table)}${buildFilters(url, values)}${buildOrder(url)}`;
      const limit = url.searchParams.get('limit');
      if (limit && /^\d+$/.test(limit)) sql += ` limit ${Number(limit)}`;
    } else if (req.method === 'POST') {
      const body = await readBody(req);
      const rows = Array.isArray(body) ? body : [body];
      if (!rows.length) throw new Error('Sin filas que insertar');
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const tuples = rows.map((row) => `(${columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      }).join(', ')})`);
      sql = `insert into public.${quote(table)} (${columns.map(quote).join(', ')}) values ${tuples.join(', ')}`;
      const onConflict = url.searchParams.get('on_conflict');
      if (onConflict && prefer.includes('resolution=merge-duplicates')) {
        const targets = onConflict.split(',').map(quote).join(', ');
        const updates = columns.filter((column) => !onConflict.split(',').includes(column))
          .map((column) => `${quote(column)} = excluded.${quote(column)}`);
        sql += ` on conflict (${targets}) do update set ${updates.length ? updates.join(', ') : `${quote(columns[0])} = excluded.${quote(columns[0])}`}`;
      }
      if (returnsRows) sql += ' returning *';
    } else if (req.method === 'PATCH') {
      const body = await readBody(req);
      const columns = Object.keys(body);
      if (!columns.length) throw new Error('Sin columnas que actualizar');
      const assignments = columns.map((column) => {
        values.push(body[column] ?? null);
        return `${quote(column)} = $${values.length}`;
      });
      sql = `update public.${quote(table)} set ${assignments.join(', ')}${buildFilters(url, values)}`;
      if (returnsRows) sql += ' returning *';
    } else if (req.method === 'DELETE') {
      sql = `delete from public.${quote(table)}${buildFilters(url, values)}`;
      if (returnsRows) sql += ' returning *';
    } else {
      throw new Error(`Método no soportado: ${req.method}`);
    }

    const result = await clientConnection.query(sql, values);
    await clientConnection.query('commit');

    const rows = result.rows || [];
    if (wantsObject) {
      if (rows.length === 1) return send(res, 200, rows[0]);
      return send(res, 406, {
        code: 'PGRST116',
        message: rows.length === 0
          ? 'JSON object requested, multiple (or no) rows returned'
          : 'JSON object requested, multiple rows returned',
        details: `Results contain ${rows.length} rows`,
        hint: null,
      });
    }
    return send(res, req.method === 'POST' ? 201 : 200, returnsRows ? rows : null);
  } catch (error) {
    await clientConnection.query('rollback').catch(() => {});
    return pgError(res, error);
  } finally {
    clientConnection.release();
  }
}

/* -------------------------------------------------------------------------- */
/* Archivos estaticos                                                          */
/* -------------------------------------------------------------------------- */

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/app') pathname = '/app.html';
  if (pathname === '/entrar') pathname = '/auth.html';
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('no es un archivo');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    console.error('mock error:', error);
    return send(res, 500, { message: error.message });
  }
});

await ensureAuthTable();
server.listen(PORT, () => {
  console.log(`Trazia de pruebas en http://localhost:${PORT} (base ${DATABASE_URL}, autoconfirm ${AUTOCONFIRM})`);
});

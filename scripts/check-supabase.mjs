#!/usr/bin/env node
/**
 * Comprueba que un proyecto de Supabase esta listo para Trazia.
 *
 * Usa unicamente la anon key y no crea, modifica ni borra nada: solo lee la
 * configuracion publica de Auth y pregunta a PostgREST por las tablas.
 *
 *   node scripts/check-supabase.mjs
 *
 * Lee SUPABASE_URL y SUPABASE_ANON_KEY del entorno o de un archivo .env.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TABLES = [
  'profiles', 'subjects', 'schedule_items', 'grades', 'habits',
  'habit_completions', 'journal_entries', 'books', 'focus_sessions', 'countdowns',
];

function loadDotEnv() {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, index).trim()] = value;
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };
const url = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (env.SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY (en el entorno o en .env).');
  process.exit(1);
}

/** Aviso temprano: la service role key no debe salir del panel de Supabase. */
try {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  if (payload.role && payload.role !== 'anon') {
    console.error(`✗ La clave tiene el rol "${payload.role}". Usa la anon public key, nunca la service role.`);
    process.exit(1);
  }
} catch {
  console.warn('· No se ha podido leer el rol de la clave; continuamos igualmente.');
}

const problems = [];
const warnings = [];
const ok = (text) => console.log(`  ✓ ${text}`);
const bad = (text) => { problems.push(text); console.log(`  ✗ ${text}`); };
const warn = (text) => { warnings.push(text); console.log(`  · ${text}`); };

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

console.log(`\nComprobando ${url}\n`);

/* -------------------------------------------------------------------------- */
console.log('Autenticación');
try {
  const { status, body } = await request('/auth/v1/settings');
  if (status !== 200) {
    bad(`no hemos podido leer la configuración de Auth (HTTP ${status}). Revisa la URL y la anon key.`);
  } else {
    if (body.disable_signup) bad('el registro está desactivado: nadie podrá crear una cuenta.');
    else ok('el registro con correo está activado');

    if (body.mailer_autoconfirm) {
      warn('la confirmación de correo está desactivada: se entra sin verificar el correo.');
    } else {
      ok('la confirmación de correo está activada');
    }

    const google = Boolean(body.external && body.external.google);
    if (google) ok('Google OAuth está configurado: pon GOOGLE_AUTH_ENABLED=true');
    else warn('Google OAuth no está configurado; el botón se mostrará desactivado (es lo previsto)');
  }
} catch (error) {
  bad(`no hemos podido conectar con Auth: ${error.message}`);
}

/* -------------------------------------------------------------------------- */
console.log('\nBase de datos');
let missing = [];
try {
  const { status, body } = await request('/rest/v1/');
  if (status !== 200 || !body) {
    warn(`no hemos podido leer el esquema (HTTP ${status}); comprobamos tabla por tabla.`);
  } else {
    const exposed = new Set(Object.keys(body.definitions || body.paths || {}).map((n) => n.replace(/^\//, '')));
    missing = TABLES.filter((table) => !exposed.has(table));
    if (missing.length === 0) ok(`las ${TABLES.length} tablas existen`);
    else bad(`faltan tablas (${missing.join(', ')}). Ejecuta database.sql en el SQL Editor.`);
  }
} catch (error) {
  bad(`no hemos podido conectar con la base de datos: ${error.message}`);
}

/* -------------------------------------------------------------------------- */
console.log('\nRow Level Security');
let leaks = 0;
let absent = 0;
let unreachable = false;
for (const table of TABLES) {
  try {
    const { status, body } = await request(`/rest/v1/${table}?select=*&limit=1`);
    const code = body && body.code;
    if (status === 200 && Array.isArray(body)) {
      leaks++;
      bad(`${table}: una sesión sin iniciar puede leer la tabla. Revisa RLS y los permisos.`);
    } else if (code === 'PGRST205' || status === 404) {
      absent++;
    }
  } catch {
    unreachable = true;
    break;
  }
}
if (unreachable) bad('no hemos podido comprobar RLS porque la base de datos no responde.');
else if (leaks === 0 && absent === 0) ok('ninguna tabla es legible sin iniciar sesión');
else if (leaks === 0 && absent > 0) bad(`${absent} tablas no existen todavía; ejecuta database.sql.`);

/* -------------------------------------------------------------------------- */
console.log('\nEliminación de cuenta');
try {
  const rpc = await request('/rest/v1/rpc/delete_account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (rpc.body && rpc.body.code === 'PGRST202') {
    bad('falta la función delete_account(). Ejecuta database.sql completo.');
  } else {
    ok('la función delete_account() está publicada');
  }
} catch {
  bad('no hemos podido comprobar delete_account() porque la base de datos no responde.');
}

/* -------------------------------------------------------------------------- */
console.log('\nEnlaces de retorno que deben estar en Authentication → URL Configuration:');
console.log('  <tu-dominio>/app.html');
console.log('  <tu-dominio>/reset.html');
console.log('Y, si activas Google, en Google Cloud como Authorized redirect URI:');
console.log(`  ${url}/auth/v1/callback`);

console.log(`\n${'─'.repeat(56)}`);
if (problems.length === 0) {
  console.log(`Todo listo${warnings.length ? ` (${warnings.length} aviso${warnings.length === 1 ? '' : 's'})` : ''}.`);
  process.exit(0);
}
console.log(`${problems.length} problema(s) que resolver antes de usar Trazia.`);
process.exit(1);

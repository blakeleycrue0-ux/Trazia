#!/usr/bin/env node
/**
 * Genera config.js a partir de las variables de entorno.
 *
 *   SUPABASE_URL          URL del proyecto de Supabase (obligatoria)
 *   SUPABASE_ANON_KEY     anon public key del proyecto (obligatoria)
 *   GOOGLE_AUTH_ENABLED   "true" solo si el proveedor de Google esta configurado
 *
 * En local puedes crear un archivo .env con esas variables; en Netlify se
 * definen en Site configuration -> Environment variables.
 *
 * Aqui nunca debe usarse la service role key: solo la anon key, que es publica
 * por diseño y depende de las politicas RLS de database.sql.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Carga un .env sencillo (CLAVE=valor) sin dependencias. */
function loadDotEnv() {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadDotEnv();
const env = { ...fileEnv, ...process.env };

const url = (env.SUPABASE_URL || '').trim();
const anonKey = (env.SUPABASE_ANON_KEY || '').trim();
const googleEnabled = String(env.GOOGLE_AUTH_ENABLED || '').toLowerCase() === 'true';

if (anonKey.includes('service_role')) {
  console.error('✗ SUPABASE_ANON_KEY parece una service role key. No la uses en el frontend.');
  process.exit(1);
}

if (!url || !anonKey) {
  console.warn('⚠ Faltan SUPABASE_URL o SUPABASE_ANON_KEY.');
  console.warn('  Trazia se desplegará, pero mostrará la pantalla de configuración pendiente.');
}

const contents = `/**
 * ARCHIVO GENERADO por scripts/generate-config.mjs. No lo edites a mano.
 *
 * Contiene solo configuracion publica: la URL del proyecto y la anon key, que
 * esta pensada para el navegador y depende de las politicas RLS de la base de
 * datos. La service role key nunca debe aparecer aqui.
 */
window.TRAZIA_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)},
  GOOGLE_AUTH_ENABLED: ${googleEnabled},
};
`;

writeFileSync(resolve(ROOT, 'config.js'), contents);
console.log(`✓ config.js generado${url ? ` para ${url}` : ' sin credenciales'}${googleEnabled ? ' (Google OAuth activado)' : ''}`);

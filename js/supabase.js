/**
 * Cliente de Supabase y utilidades de sesion.
 *
 * El cliente se crea de forma perezosa: si el proyecto todavia no esta
 * configurado, la aplicacion muestra una pantalla de configuracion en lugar de
 * fallar con un error de consola.
 */

/**
 * El cliente oficial se sirve desde el propio dominio (vendor/supabase-js.esm.js,
 * generado con scripts/vendor-supabase.mjs). Asi no dependemos de un CDN externo
 * y la Content-Security-Policy puede quedarse en script-src 'self'.
 * Se puede apuntar a otra copia con TRAZIA_CONFIG.SUPABASE_JS_URL.
 */
const DEFAULT_CLIENT_URL = new URL('../vendor/supabase-js.esm.js', import.meta.url).href;
const DEV_CONFIG_KEY = 'trazia.dev-config';

function clientUrl() {
  const configured = (window.TRAZIA_CONFIG && window.TRAZIA_CONFIG.SUPABASE_JS_URL) || '';
  return String(configured).trim() || DEFAULT_CLIENT_URL;
}

/** Configuracion efectiva: variables de entorno del build + override local. */
export function getConfig() {
  const base = window.TRAZIA_CONFIG || {};
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(DEV_CONFIG_KEY) || '{}');
  } catch {
    local = {};
  }
  return {
    url: (local.SUPABASE_URL || base.SUPABASE_URL || '').trim(),
    anonKey: (local.SUPABASE_ANON_KEY || base.SUPABASE_ANON_KEY || '').trim(),
    googleEnabled: Boolean(local.GOOGLE_AUTH_ENABLED ?? base.GOOGLE_AUTH_ENABLED),
    fromLocalOverride: Boolean(local.SUPABASE_URL),
  };
}

export function saveLocalConfig({ url, anonKey, googleEnabled = false }) {
  localStorage.setItem(DEV_CONFIG_KEY, JSON.stringify({
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    GOOGLE_AUTH_ENABLED: googleEnabled,
  }));
}

export function clearLocalConfig() {
  localStorage.removeItem(DEV_CONFIG_KEY);
}

export function isConfigured() {
  const { url, anonKey } = getConfig();
  return Boolean(url && anonKey && url.startsWith('http'));
}

export function isGoogleEnabled() {
  return isConfigured() && getConfig().googleEnabled;
}

export class ConfigError extends Error {
  constructor() {
    super('Trazia todavía no está conectado a Supabase.');
    this.name = 'ConfigError';
  }
}

let clientPromise = null;

/** Devuelve (creando si hace falta) el cliente de Supabase. */
export function getSupabase() {
  if (!isConfigured()) return Promise.reject(new ConfigError());
  if (!clientPromise) {
    const { url, anonKey } = getConfig();
    clientPromise = import(/* @vite-ignore */ clientUrl())
      .then(({ createClient }) => createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'trazia.auth',
        },
      }))
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

/* -------------------------------------------------------------------------- */
/* Sesion                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Procesa los parametros que Supabase añade a la URL al volver de un enlace de
 * correo o de un proveedor OAuth. Cubre los tres formatos posibles:
 *   #access_token=...   (flujo implicito, ya lo resuelve detectSessionInUrl)
 *   ?code=...           (flujo PKCE)
 *   ?token_hash=&type=  (plantillas de correo nuevas)
 * Devuelve { type, error } describiendo lo ocurrido.
 */
export async function ensureSessionFromUrl() {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  const result = { type: null, error: null };

  const hashError = hashParams.get('error_description') || hashParams.get('error');
  const queryError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (hashError || queryError) {
    result.error = decodeURIComponent(hashError || queryError).replace(/\+/g, ' ');
    cleanUrl();
    return result;
  }

  if (hashParams.get('access_token')) {
    result.type = hashParams.get('type') || 'session';
    // detectSessionInUrl ya ha guardado la sesion; solo esperamos al cliente.
    await getSupabase().then((c) => c.auth.getSession()).catch(() => null);
    cleanUrl();
    return result;
  }

  const code = url.searchParams.get('code');
  if (code) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) result.error = translateAuthError(error);
      else result.type = 'session';
    } catch (error) {
      result.error = translateAuthError(error);
    }
    cleanUrl();
    return result;
  }

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash && type) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) result.error = translateAuthError(error);
      else result.type = type;
    } catch (error) {
      result.error = translateAuthError(error);
    }
    cleanUrl();
    return result;
  }

  return result;
}

function cleanUrl() {
  const clean = window.location.pathname + (window.location.hash.startsWith('#/') ? window.location.hash : '');
  window.history.replaceState({}, document.title, clean);
}

export async function getSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
}

export async function onAuthStateChange(callback) {
  const supabase = await getSupabase();
  return supabase.auth.onAuthStateChange(callback);
}

/* -------------------------------------------------------------------------- */
/* Mensajes de error en español                                                */
/* -------------------------------------------------------------------------- */

const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'El correo o la contraseña no son correctos.'],
  [/email not confirmed/i, 'Todavía no has confirmado tu correo. Revisa tu bandeja de entrada.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con este correo.'],
  [/password should be at least/i, 'La contraseña es demasiado corta.'],
  [/password.*(weak|pwned|compromised)/i, 'Esa contraseña es demasiado común. Elige otra.'],
  [/new password should be different/i, 'La nueva contraseña debe ser distinta de la anterior.'],
  [/for security purposes.*after (\d+) seconds/i, 'Espera unos segundos antes de volver a intentarlo.'],
  [/email rate limit exceeded|over_email_send_rate_limit/i, 'Se han enviado demasiados correos. Inténtalo dentro de unos minutos.'],
  [/rate limit|too many requests/i, 'Demasiados intentos seguidos. Inténtalo dentro de unos minutos.'],
  [/unable to validate email address/i, 'El correo no tiene un formato válido.'],
  [/signups not allowed/i, 'El registro está desactivado en este proyecto de Supabase.'],
  [/unsupported provider|provider is not enabled/i, 'Ese método de acceso no está configurado en Supabase.'],
  [/token has expired or is invalid|invalid token|otp_expired/i, 'El enlace ya no es válido. Solicita uno nuevo.'],
  [/session.*(missing|not found)|auth session missing/i, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
  [/failed to fetch|networkerror|network request failed/i, 'No hemos podido conectar. Comprueba tu conexión.'],
  [/email address .* is invalid/i, 'El correo no tiene un formato válido.'],
];

export function translateAuthError(error) {
  if (!error) return 'Ha ocurrido un error inesperado.';
  const message = typeof error === 'string' ? error : (error.message || error.error_description || '');
  for (const [pattern, text] of AUTH_MESSAGES) {
    if (pattern.test(message)) return text;
  }
  if (error instanceof ConfigError) return error.message;
  return message || 'Ha ocurrido un error inesperado.';
}

const DB_MESSAGES = [
  ['23505', 'Ese registro ya existe.'],
  ['42883', 'Falta una función en la base de datos. Ejecuta database.sql en tu proyecto de Supabase.'],
  ['PGRST202', 'Falta una función en la base de datos. Ejecuta database.sql en tu proyecto de Supabase.'],
  ['23503', 'No hemos encontrado el elemento relacionado. Puede que se haya eliminado.'],
  ['23514', 'Alguno de los datos no es válido. Revisa el formulario.'],
  ['42501', 'No tienes permiso para hacer esto.'],
  ['PGRST301', 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
];

export function translateDbError(error) {
  if (!error) return 'Ha ocurrido un error inesperado.';
  const found = DB_MESSAGES.find(([code]) => code === error.code);
  if (found) return found[1];
  if (/failed to fetch|networkerror/i.test(error.message || '')) {
    return 'No hemos podido conectar. Comprueba tu conexión.';
  }
  if (/could not find the function|function .* does not exist/i.test(error.message || '')) {
    return 'Falta una función en la base de datos. Ejecuta database.sql en tu proyecto de Supabase.';
  }
  if (error instanceof ConfigError) return error.message;
  return error.message || 'Ha ocurrido un error inesperado.';
}

/** True si el error indica que la sesion ya no es valida. */
export function isSessionError(error) {
  if (!error) return false;
  const message = error.message || '';
  return error.code === 'PGRST301' || error.status === 401
    || /jwt expired|session.*missing|invalid claim/i.test(message);
}

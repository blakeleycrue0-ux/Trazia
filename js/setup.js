/**
 * Qué se enseña cuando la aplicación no puede conectarse a su base de datos.
 *
 * A quien usa Trazia no se le enseña nada técnico: solo un aviso claro de que
 * ahora mismo no está disponible. El formulario de configuración es una
 * herramienta de desarrollo y únicamente aparece en local o si se pide
 * explícitamente con ?setup en la dirección.
 */
import { getConfig, saveLocalConfig, clearLocalConfig } from './supabase.js';
import { esc, qs, symbolMarkup, toast } from './ui.js';

const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];

/**
 * En local aparece sola; en cualquier otro sitio hay que pedirla con ?setup.
 * Con ?setup=0 se fuerza la vista de quien usa la aplicación, útil para
 * comprobar en local qué se ve realmente en producción.
 */
function isDevContext() {
  const { hostname, search } = window.location;
  const flag = new URLSearchParams(search).get('setup');
  if (flag !== null) return !['0', 'off', 'false', 'no'].includes(flag.toLowerCase());
  return DEV_HOSTS.includes(hostname) || hostname.endsWith('.local');
}

/** Punto de entrada: elige qué mostrar según el contexto. */
export function renderNotConfigured(container) {
  if (isDevContext()) renderSetupScreen(container);
  else renderUnavailable(container);
}

/** Aviso neutro para quien usa la aplicación. */
export function renderUnavailable(container) {
  container.innerHTML = `
    <div class="setup-screen">
      <div class="setup-screen__inner setup-screen__inner--center">
        ${symbolMarkup({ size: 46 })}
        <h1 class="mt-md">Trazia no está disponible ahora mismo</h1>
        <p class="lede mt-sm">Vuelve a intentarlo dentro de un momento.</p>
        <div class="btn-row mt-lg" style="justify-content:center">
          <button type="button" class="btn btn--primary" id="reintentar">Reintentar</button>
        </div>
      </div>
    </div>`;
  qs('#reintentar', container).addEventListener('click', () => window.location.reload());
}

/** Formulario de configuración para desarrollo. */
export function renderSetupScreen(container) {
  const config = getConfig();
  container.innerHTML = `
    <div class="setup-screen">
      <div class="setup-screen__inner">
        ${symbolMarkup({ size: 44 })}
        <p class="eyebrow mt-md">Modo desarrollo</p>
        <h1 class="mt-sm">Falta conectar con la base de datos</h1>
        <p class="lede mt-sm">
          Esta pantalla solo aparece en local o añadiendo <code>?setup</code> a la
          dirección. Quien use Trazia nunca la ve.
        </p>

        <div class="notice notice--info mt-lg">
          <div>
            <strong>En producción</strong>
            <span>Define <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code> como
            variables de entorno y vuelve a desplegar: el build genera <code>config.js</code>.</span>
          </div>
        </div>

        <form id="setup-form" class="mt-lg" novalidate>
          <p class="small muted" style="margin-bottom:16px">
            Los valores se guardan solo en este navegador. La <em>anon key</em> es una
            clave pública; la <em>service role key</em> no debe usarse nunca aquí.
          </p>
          <label class="field">
            <span class="field__label" for="setup-url">URL del proyecto</span>
            <input class="input" id="setup-url" name="url" type="url" inputmode="url"
              placeholder="https://xxxxxxxx.supabase.co" value="${esc(config.url)}" autocomplete="off">
          </label>
          <label class="field">
            <span class="field__label" for="setup-key">Anon key</span>
            <input class="input" id="setup-key" name="key" type="text"
              placeholder="eyJhbGciOi..." value="${esc(config.anonKey)}" autocomplete="off">
          </label>
          <label class="switch mt-sm">
            <input type="checkbox" id="setup-google" ${config.googleEnabled ? 'checked' : ''}>
            <span class="switch__track" aria-hidden="true"></span>
            <span>Google OAuth ya configurado en este proyecto</span>
          </label>
          <div class="btn-row mt-md">
            <button type="submit" class="btn btn--primary">Guardar y continuar</button>
            ${config.fromLocalOverride ? '<button type="button" class="btn btn--ghost" id="setup-clear">Borrar configuración local</button>' : ''}
          </div>
        </form>
      </div>
    </div>`;

  qs('#setup-form', container).addEventListener('submit', (event) => {
    event.preventDefault();
    const url = qs('#setup-url', container).value.trim();
    const key = qs('#setup-key', container).value.trim();
    if (!url.startsWith('http') || key.length < 20) {
      toast('Revisa la URL y la anon key.', 'error');
      return;
    }
    saveLocalConfig({ url, anonKey: key, googleEnabled: qs('#setup-google', container).checked });
    window.location.reload();
  });

  const clearButton = qs('#setup-clear', container);
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      clearLocalConfig();
      window.location.reload();
    });
  }
}

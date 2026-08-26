/**
 * Pantalla que se muestra cuando la aplicacion todavia no esta conectada a
 * Supabase. Explica que variables hacen falta y, para desarrollo local, permite
 * guardarlas en este navegador sin tocar el codigo.
 */
import { getConfig, saveLocalConfig, clearLocalConfig } from './supabase.js';
import { esc, qs, symbolMarkup, toast } from './ui.js';

export function renderSetupScreen(container) {
  const config = getConfig();
  container.innerHTML = `
    <div class="setup-screen">
      <div class="setup-screen__inner">
        ${symbolMarkup({ size: 44 })}
        <h1 class="mt-md">Falta conectar Trazia con Supabase</h1>
        <p class="lede mt-sm">
          Trazia guarda tus datos en tu propio proyecto de Supabase. Para que
          funcione hay que indicarle a qué proyecto conectarse.
        </p>

        <div class="notice notice--info mt-lg">
          <div>
            <strong>En producción (Netlify)</strong>
            <span>Define las variables de entorno <code>SUPABASE_URL</code> y
            <code>SUPABASE_ANON_KEY</code> en tu proyecto y vuelve a desplegar.
            El build genera <code>config.js</code> con esos valores.</span>
          </div>
        </div>

        <ol>
          <li>Crea un proyecto en Supabase y ejecuta <code>database.sql</code>.</li>
          <li>Copia la <em>Project URL</em> y la <em>anon public key</em> desde Project Settings → API.</li>
          <li>Añádelas como variables de entorno y despliega.</li>
        </ol>

        <form id="setup-form" class="mt-lg" novalidate>
          <h2 class="section__head" style="margin-bottom:14px">Configuración local</h2>
          <p class="small muted" style="margin-bottom:16px">
            Solo para desarrollo. Los valores se guardan en este navegador y no se
            envían a ningún sitio. La <em>anon key</em> es una clave pública; la
            <em>service role key</em> no debe usarse nunca aquí.
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

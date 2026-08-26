/**
 * Pantalla de "nueva contraseña". Se abre desde el enlace que envia Supabase.
 * Solo se puede cambiar la contraseña si el enlace ha creado una sesion valida
 * de recuperacion; si no, se explica y se ofrece pedir otro enlace.
 */
import { getSupabase, isConfigured, ensureSessionFromUrl, translateAuthError } from './supabase.js';
import { qs, icon, noticeMarkup, setBusy, esc } from './ui.js';
import { renderSetupScreen } from './setup.js';
import { validatePassword, validateMatch, passwordStrength } from './validation.js';

const card = qs('#reset-card');

function renderInvalid(message) {
  card.innerHTML = `
    <h1>El enlace no es válido</h1>
    <p class="auth-card__sub">${esc(message || 'Puede que ya se haya usado o que haya caducado.')}</p>
    <div class="btn-row mt-lg">
      <a class="btn btn--primary" href="auth.html?modo=recuperar">Pedir otro enlace</a>
      <a class="btn btn--ghost" href="auth.html?modo=login">Iniciar sesión</a>
    </div>`;
}

function renderForm(email) {
  card.innerHTML = `
    <h1>Nueva contraseña</h1>
    <p class="auth-card__sub">${email ? `Vas a cambiar la contraseña de <strong>${esc(email)}</strong>.` : 'Elige tu contraseña nueva.'}</p>
    <div id="form-notice" class="form-notice" hidden></div>
    <form class="auth-form" id="form-reset" novalidate>
      <div class="field password-field">
        <label class="field__label" for="password">Contraseña nueva</label>
        <input class="input" id="password" name="password" type="password" autocomplete="new-password" aria-describedby="password-error">
        <button type="button" class="icon-btn" data-toggle="password" aria-label="Mostrar la contraseña" aria-pressed="false">${icon('ver')}</button>
        <div class="strength" data-strength hidden>
          <span class="strength__bar" aria-hidden="true">
            <span class="strength__seg"></span><span class="strength__seg"></span>
            <span class="strength__seg"></span><span class="strength__seg"></span>
          </span>
          <span class="strength__label" data-strength-label></span>
        </div>
        <p class="field__error" id="password-error" hidden></p>
      </div>
      <div class="field password-field">
        <label class="field__label" for="password2">Repite la contraseña</label>
        <input class="input" id="password2" name="password2" type="password" autocomplete="new-password" aria-describedby="password2-error">
        <button type="button" class="icon-btn" data-toggle="password2" aria-label="Mostrar la contraseña" aria-pressed="false">${icon('ver')}</button>
        <p class="field__error" id="password2-error" hidden></p>
      </div>
      <button type="submit" class="btn btn--primary btn--block mt-md">Guardar contraseña</button>
    </form>`;

  card.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = qs(`#${button.dataset.toggle}`, card);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
      button.innerHTML = icon(show ? 'ocultar' : 'ver');
    });
  });

  const meter = card.querySelector('[data-strength]');
  const segments = Array.from(meter.querySelectorAll('.strength__seg'));
  const label = meter.querySelector('[data-strength-label]');
  qs('#password', card).addEventListener('input', (event) => {
    const value = event.target.value;
    meter.hidden = value.length === 0;
    const { score, label: text } = passwordStrength(value);
    meter.dataset.level = String(score);
    segments.forEach((segment, index) => segment.classList.toggle('is-on', index < score));
    label.textContent = text;
  });

  qs('#form-reset', card).addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = qs('#password', card).value;
    const confirmation = qs('#password2', card).value;
    const errors = {
      password: validatePassword(password),
      password2: validateMatch(password, confirmation),
    };
    let firstInvalid = null;
    for (const [id, message] of Object.entries(errors)) {
      const input = qs(`#${id}`, card);
      const error = qs(`#${id}-error`, card);
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        error.textContent = message;
        error.hidden = false;
        if (!firstInvalid) firstInvalid = input;
      } else {
        input.removeAttribute('aria-invalid');
        error.hidden = true;
      }
    }
    if (firstInvalid) { firstInvalid.focus(); return; }

    const submit = event.target.querySelector('button[type="submit"]');
    setBusy(submit, true, 'Guardando');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      card.innerHTML = `
        <h1>Contraseña actualizada</h1>
        <p class="auth-card__sub">Ya puedes seguir usando Trazia con tu contraseña nueva.</p>
        <div class="btn-row mt-lg"><a class="btn btn--primary" href="app.html">Entrar en Trazia</a></div>`;
    } catch (error) {
      setBusy(submit, false);
      const notice = qs('#form-notice', card);
      notice.innerHTML = noticeMarkup(translateAuthError(error), 'error');
      notice.hidden = false;
    }
  });
}

async function start() {
  if (!isConfigured()) {
    renderSetupScreen(document.body);
    return;
  }
  try {
    const result = await ensureSessionFromUrl();
    if (result.error) {
      renderInvalid(result.error);
      return;
    }
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      renderInvalid('Abre el enlace desde el correo que te hemos enviado.');
      return;
    }
    renderForm(data.session.user.email);
  } catch (error) {
    renderInvalid(translateAuthError(error));
  }
}

start();

/**
 * Pantallas de acceso: registro, inicio de sesion y recuperacion de contraseña.
 * Toda la autenticacion la resuelve Supabase Auth; aqui solo validamos el
 * formulario, traducimos los errores y contamos con exactitud lo que ha pasado
 * (por ejemplo, si hace falta confirmar el correo o no).
 */
import {
  getSupabase, isConfigured, isGoogleEnabled, translateAuthError, ensureSessionFromUrl,
} from './supabase.js';
import { esc, qs, icon, noticeMarkup, setBusy, toast } from './ui.js';
import {
  validateName, validateEmail, validatePassword, validateMatch, passwordStrength,
} from './validation.js';
import { renderSetupScreen } from './setup.js';

const card = qs('#auth-card');
const MODES = { registro: 'registro', login: 'login', recuperar: 'recuperar' };

/* -------------------------------------------------------------------------- */
/* Piezas de formulario                                                        */
/* -------------------------------------------------------------------------- */

function fieldMarkup({ id, label, type = 'text', autocomplete, placeholder = '', inputmode, value = '' }) {
  return `
    <div class="field">
      <label class="field__label" for="${id}">${esc(label)}</label>
      <input class="input" id="${id}" name="${id}" type="${type}"
        ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
        ${inputmode ? `inputmode="${inputmode}"` : ''}
        placeholder="${esc(placeholder)}" value="${esc(value)}"
        aria-describedby="${id}-error">
      <p class="field__error" id="${id}-error" hidden></p>
    </div>`;
}

function passwordFieldMarkup({ id, label, autocomplete, withStrength = false }) {
  return `
    <div class="field password-field">
      <label class="field__label" for="${id}">${esc(label)}</label>
      <input class="input" id="${id}" name="${id}" type="password"
        autocomplete="${autocomplete}" aria-describedby="${id}-error">
      <button type="button" class="icon-btn" data-toggle-password="${id}"
        aria-label="Mostrar la contraseña" aria-pressed="false">${icon('ver')}</button>
      ${withStrength ? `
        <div class="strength" data-strength hidden>
          <span class="strength__bar" aria-hidden="true">
            <span class="strength__seg"></span><span class="strength__seg"></span>
            <span class="strength__seg"></span><span class="strength__seg"></span>
          </span>
          <span class="strength__label" data-strength-label></span>
        </div>` : ''}
      <p class="field__error" id="${id}-error" hidden></p>
    </div>`;
}

function googleBlock() {
  const enabled = isGoogleEnabled();
  const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/>
      <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.6z"/>
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.9l7.3 5.7c1.7-5.1 6.5-8.9 12.2-8.9z"/>
    </svg>`;
  return `
    <div class="divider-text">o</div>
    <button type="button" class="btn btn--ghost btn--block" data-google
      ${enabled ? '' : 'aria-disabled="true" disabled'}>
      ${googleIcon}<span>Continuar con Google</span>
    </button>
    ${enabled ? '' : `
      <p class="provider-note">
        Este botón se activa cuando el proveedor de Google está configurado en
        Supabase Auth. Mientras tanto puedes entrar con tu correo y contraseña.
      </p>`}`;
}

/* -------------------------------------------------------------------------- */
/* Utilidades de formulario                                                    */
/* -------------------------------------------------------------------------- */

function showFieldError(form, id, message) {
  const input = qs(`#${id}`, form);
  const error = qs(`#${id}-error`, form);
  if (!input || !error) return;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
  } else {
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    error.hidden = true;
  }
}

function clearErrors(form) {
  form.querySelectorAll('.field__error').forEach((node) => { node.hidden = true; node.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
}

function setFormNotice(html) {
  const slot = qs('#form-notice');
  if (!slot) return;
  slot.innerHTML = html || '';
  slot.hidden = !html;
}

function wirePasswordToggles(root) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = qs(`#${button.dataset.togglePassword}`, root);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
      button.innerHTML = icon(show ? 'ocultar' : 'ver');
    });
  });
}

function wireStrengthMeter(root, inputId) {
  const input = qs(`#${inputId}`, root);
  const meter = root.querySelector('[data-strength]');
  if (!input || !meter) return;
  const label = meter.querySelector('[data-strength-label]');
  const segments = Array.from(meter.querySelectorAll('.strength__seg'));
  input.addEventListener('input', () => {
    const value = input.value;
    meter.hidden = value.length === 0;
    const { score, label: text } = passwordStrength(value);
    meter.dataset.level = String(score);
    segments.forEach((segment, index) => segment.classList.toggle('is-on', index < score));
    label.textContent = text;
  });
}

function goToApp() {
  window.location.replace('app.html');
}

/* -------------------------------------------------------------------------- */
/* Vistas                                                                      */
/* -------------------------------------------------------------------------- */

function renderRegistro({ email = '', name = '' } = {}) {
  card.innerHTML = `
    <h1>Crear cuenta</h1>
    <p class="auth-card__sub">Empieza a trazar tu día. Solo necesitas un correo.</p>
    <div id="form-notice" class="form-notice" hidden></div>
    <form class="auth-form" id="form-registro" novalidate>
      ${fieldMarkup({ id: 'nombre', label: 'Nombre', autocomplete: 'given-name', placeholder: 'Tu nombre', value: name })}
      ${fieldMarkup({ id: 'email', label: 'Correo', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'tucorreo@ejemplo.com', value: email })}
      ${passwordFieldMarkup({ id: 'password', label: 'Contraseña', autocomplete: 'new-password', withStrength: true })}
      ${passwordFieldMarkup({ id: 'password2', label: 'Confirmar contraseña', autocomplete: 'new-password' })}
      <button type="submit" class="btn btn--primary btn--block mt-md">Crear cuenta</button>
    </form>
    ${googleBlock()}
    <p class="auth-alt">¿Ya tienes cuenta? <button type="button" class="link-btn" data-mode="login">Inicia sesión</button></p>`;

  const form = qs('#form-registro');
  wirePasswordToggles(card);
  wireStrengthMeter(card, 'password');
  wireGoogle();
  wireModeLinks();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    setFormNotice('');

    const nameValue = qs('#nombre', form).value.trim();
    const emailValue = qs('#email', form).value.trim();
    const passwordValue = qs('#password', form).value;
    const confirmValue = qs('#password2', form).value;

    const errors = {
      nombre: validateName(nameValue),
      email: validateEmail(emailValue),
      password: validatePassword(passwordValue),
      password2: validateMatch(passwordValue, confirmValue),
    };
    const firstInvalid = Object.entries(errors).find(([, message]) => message);
    Object.entries(errors).forEach(([id, message]) => showFieldError(form, id, message));
    if (firstInvalid) {
      qs(`#${firstInvalid[0]}`, form).focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    setBusy(submit, true, 'Creando cuenta');
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: emailValue,
        password: passwordValue,
        options: {
          data: { display_name: nameValue },
          emailRedirectTo: `${window.location.origin}/app.html`,
        },
      });
      if (error) throw error;

      // Supabase devuelve un usuario sin identidades cuando el correo ya existe.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setBusy(submit, false);
        setFormNotice(noticeMarkup(
          'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
          'error',
          'Ese correo ya está registrado',
        ));
        return;
      }

      if (data.session) {
        goToApp();
        return;
      }

      renderVerificaCorreo(emailValue);
    } catch (error) {
      setBusy(submit, false);
      setFormNotice(noticeMarkup(translateAuthError(error), 'error', 'No hemos podido crear la cuenta'));
    }
  });
}

function renderVerificaCorreo(email) {
  card.innerHTML = `
    <h1>Confirma tu correo</h1>
    <p class="auth-card__sub">
      Hemos enviado un enlace a <strong>${esc(email)}</strong>. Ábrelo para activar
      tu cuenta y podrás entrar en Trazia.
    </p>
    <div class="notice notice--info mt-lg">
      <span class="notice__icon">${icon('correo', { size: 19 })}</span>
      <div>
        <strong>¿No te llega?</strong>
        <span>Mira en la carpeta de spam. El enlace caduca pasado un tiempo; si ha caducado, pide otro.</span>
      </div>
    </div>
    <div id="form-notice" class="form-notice mt-md" hidden></div>
    <div class="btn-row mt-lg">
      <button type="button" class="btn btn--ghost" id="reenviar">Reenviar correo</button>
      <button type="button" class="btn btn--primary" data-mode="login">Ir a iniciar sesión</button>
    </div>`;
  wireModeLinks();

  qs('#reenviar').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, 'Enviando');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/app.html` },
      });
      if (error) throw error;
      setBusy(button, false);
      setFormNotice(noticeMarkup('Te hemos enviado otro correo de confirmación.', 'success'));
    } catch (error) {
      setBusy(button, false);
      setFormNotice(noticeMarkup(translateAuthError(error), 'error'));
    }
  });
}

function renderLogin({ email = '', notice = '' } = {}) {
  card.innerHTML = `
    <h1>Iniciar sesión</h1>
    <p class="auth-card__sub">Continúa donde lo dejaste.</p>
    <div id="form-notice" class="form-notice" ${notice ? '' : 'hidden'}>${notice}</div>
    <form class="auth-form" id="form-login" novalidate>
      ${fieldMarkup({ id: 'email', label: 'Correo', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'tucorreo@ejemplo.com', value: email })}
      ${passwordFieldMarkup({ id: 'password', label: 'Contraseña', autocomplete: 'current-password' })}
      <div class="auth-forgot">
        <button type="button" class="link-btn" data-mode="recuperar">¿Has olvidado tu contraseña?</button>
      </div>
      <button type="submit" class="btn btn--primary btn--block">Iniciar sesión</button>
    </form>
    ${googleBlock()}
    <p class="auth-alt">¿Todavía no tienes cuenta? <button type="button" class="link-btn" data-mode="registro">Crear cuenta</button></p>`;

  const form = qs('#form-login');
  wirePasswordToggles(card);
  wireGoogle();
  wireModeLinks();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    setFormNotice('');

    const emailValue = qs('#email', form).value.trim();
    const passwordValue = qs('#password', form).value;
    const emailError = validateEmail(emailValue);
    const passwordError = passwordValue ? null : 'Escribe tu contraseña.';
    showFieldError(form, 'email', emailError);
    showFieldError(form, 'password', passwordError);
    if (emailError || passwordError) {
      qs(`#${emailError ? 'email' : 'password'}`, form).focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    setBusy(submit, true, 'Entrando');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });
      if (error) throw error;
      goToApp();
    } catch (error) {
      setBusy(submit, false);
      const message = translateAuthError(error);
      if (/confirmado/i.test(message)) {
        renderVerificaCorreo(emailValue);
        setFormNotice(noticeMarkup(message, 'error'));
        return;
      }
      setFormNotice(noticeMarkup(message, 'error', 'No hemos podido entrar'));
    }
  });
}

function renderRecuperar({ email = '' } = {}) {
  card.innerHTML = `
    <h1>Recuperar contraseña</h1>
    <p class="auth-card__sub">Te enviamos un enlace para crear una contraseña nueva.</p>
    <div id="form-notice" class="form-notice" hidden></div>
    <form class="auth-form" id="form-recuperar" novalidate>
      ${fieldMarkup({ id: 'email', label: 'Correo', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'tucorreo@ejemplo.com', value: email })}
      <button type="submit" class="btn btn--primary btn--block mt-md">Enviar enlace</button>
    </form>
    <p class="auth-alt"><button type="button" class="link-btn" data-mode="login">Volver a iniciar sesión</button></p>`;

  const form = qs('#form-recuperar');
  wireModeLinks();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const emailValue = qs('#email', form).value.trim();
    const emailError = validateEmail(emailValue);
    showFieldError(form, 'email', emailError);
    if (emailError) return;

    const submit = form.querySelector('button[type="submit"]');
    setBusy(submit, true, 'Enviando');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/reset.html`,
      });
      if (error) throw error;
      setBusy(submit, false);
      setFormNotice(noticeMarkup(
        `Si hay una cuenta asociada a ${emailValue}, recibirás un enlace para cambiar la contraseña.`,
        'success',
        'Correo enviado',
      ));
    } catch (error) {
      setBusy(submit, false);
      setFormNotice(noticeMarkup(translateAuthError(error), 'error'));
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Cableado comun                                                              */
/* -------------------------------------------------------------------------- */

function wireModeLinks() {
  card.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });
}

function wireGoogle() {
  const button = card.querySelector('[data-google]');
  if (!button || button.disabled) return;
  button.addEventListener('click', async () => {
    setBusy(button, true, 'Conectando');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/app.html` },
      });
      if (error) throw error;
      // Si no hay error el navegador se redirige a Google.
    } catch (error) {
      setBusy(button, false);
      setFormNotice(noticeMarkup(translateAuthError(error), 'error', 'No hemos podido continuar con Google'));
    }
  });
}

function setMode(mode, options = {}) {
  const target = MODES[mode] || MODES.login;
  const url = new URL(window.location.href);
  url.searchParams.set('modo', target);
  window.history.replaceState({}, '', url);
  document.title = target === 'registro' ? 'Crear cuenta en Trazia' : 'Entrar en Trazia';
  if (target === 'registro') renderRegistro(options);
  else if (target === 'recuperar') renderRecuperar(options);
  else renderLogin(options);
  card.classList.remove('view-enter');
  void card.offsetWidth;
  card.classList.add('view-enter');
}

/* -------------------------------------------------------------------------- */
/* Arranque                                                                    */
/* -------------------------------------------------------------------------- */

async function start() {
  if (!isConfigured()) {
    renderSetupScreen(document.body);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('modo');

  try {
    const urlResult = await ensureSessionFromUrl();
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      goToApp();
      return;
    }
    setMode(mode);
    if (urlResult.error) {
      setFormNotice(noticeMarkup(urlResult.error, 'error'));
    } else if (urlResult.type === 'signup' || urlResult.type === 'email') {
      setFormNotice(noticeMarkup('Correo confirmado. Ya puedes iniciar sesión.', 'success'));
    }
  } catch (error) {
    setMode(mode);
    toast(translateAuthError(error), 'error');
  }
}

start();

/**
 * Pantalla de bienvenida. Es la puerta de entrada: si hay sesion valida se pasa
 * directamente a la aplicacion y, si no, se ofrece crear cuenta o entrar.
 */
import { isConfigured, getSession } from './supabase.js';
import { qs } from './ui.js';
import { renderNotConfigured } from './setup.js';

if (!isConfigured()) {
  renderNotConfigured(document.body);
} else {
  getSession()
    .then((session) => {
      if (session) window.location.replace('app.html');
    })
    .catch(() => { /* sin sesion valida: se queda la bienvenida */ });

  // Evita el salto de la barra inferior del navegador en móvil.
  const main = qs('#bienvenida');
  if (main) main.classList.add('is-ready');
}

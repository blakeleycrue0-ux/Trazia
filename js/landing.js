/**
 * Pequeños detalles de la portada: sombra de la cabecera al hacer scroll y,
 * si ya hay sesion iniciada, un acceso directo a la aplicacion.
 */
import { isConfigured, getSession } from './supabase.js';
import { watchStickyHeader, qs } from './ui.js';

watchStickyHeader(qs('.site-header'));

if (isConfigured()) {
  getSession()
    .then((session) => {
      if (!session) return;
      const access = qs('#acceso');
      if (access) access.innerHTML = '<a class="btn btn--primary" href="app.html">Ir a mi Trazia</a>';
    })
    .catch(() => { /* sin sesion valida: se queda el acceso normal */ });
}

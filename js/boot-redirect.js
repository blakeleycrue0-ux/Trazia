/**
 * Se ejecuta antes de pintar nada: si ya hay una sesion guardada en este
 * navegador, entra directamente en la aplicacion en lugar de enseñar la
 * pantalla de bienvenida y saltar despues.
 *
 * No valida el token (eso lo hace app.html contra el servidor); solo evita el
 * parpadeo. Es un script clasico a proposito, para que corra antes del render.
 */
(function () {
  try {
    var saved = window.localStorage.getItem('trazia.auth');
    if (saved && saved.length > 20) window.location.replace('app.html');
  } catch (error) {
    /* almacenamiento no disponible: se queda en la bienvenida */
  }
})();

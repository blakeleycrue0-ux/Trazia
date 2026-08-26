/**
 * Validaciones de credenciales, compartidas por el registro, el inicio de
 * sesion, el cambio de contraseña desde Ajustes y el enlace de recuperacion.
 *
 * Vive en su propio modulo a proposito: auth.js arranca la pantalla de acceso
 * en cuanto se importa, asi que el resto de pantallas no debe depender de el
 * solo para reutilizar estas funciones.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function validateName(value) {
  const name = String(value || '').trim();
  if (name.length < 2) return 'Escribe tu nombre.';
  if (name.length > 60) return 'El nombre es demasiado largo.';
  return null;
}

export function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Escribe tu correo.';
  if (!EMAIL_RE.test(email)) return 'Ese correo no parece válido.';
  return null;
}

/** Fuerza de 0 a 4 con una etiqueta en español. */
export function passwordStrength(password) {
  const value = String(password || '');
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'];
  return { score, label: labels[score] };
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8) return 'Usa al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Combina letras y números.';
  }
  return null;
}

export function validateMatch(password, confirmation) {
  if (password !== confirmation) return 'Las dos contraseñas no coinciden.';
  return null;
}

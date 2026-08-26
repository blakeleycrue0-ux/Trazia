/**
 * Utilidades de formato y fechas en español de España.
 *
 * Regla importante: las columnas `date` de PostgreSQL viajan como cadenas
 * "AAAA-MM-DD". Nunca las pasamos a `new Date(cadena)` porque el navegador las
 * interpreta en UTC y el dia se desplaza. Siempre usamos parseDate/toISODate.
 */

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEKDAYS_ABBR = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Indice de dia con 0 = lunes (JavaScript usa 0 = domingo). */
export function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

/** Convierte un Date local a "AAAA-MM-DD". */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convierte "AAAA-MM-DD" a un Date local a medianoche. */
export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Lunes de la semana a la que pertenece la fecha. */
export function startOfWeek(date) {
  return addDays(date, -weekdayIndex(date));
}

export function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Diferencia en dias naturales entre dos fechas (b - a). */
export function daysBetween(a, b) {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate())
    - new Date(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 86400000);
}

const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMedium = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' });
const fmtMonthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

export function formatLongDate(date) {
  return fmtLong.format(date);
}

export function formatMediumDate(date) {
  return fmtMedium.format(date);
}

export function formatShortDate(date) {
  return fmtShort.format(date);
}

export function formatMonthYear(date) {
  return fmtMonthYear.format(date);
}

/** "hoy", "mañana", "ayer" o la fecha corta. */
export function formatRelativeDay(date, reference = today()) {
  const diff = daysBetween(reference, date);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1 && diff < 7) return `el ${WEEKDAYS[weekdayIndex(date)]}`;
  return formatMediumDate(date);
}

/** "08:30:00" -> "08:30" */
export function formatTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

/** Minutos desde medianoche a partir de "HH:MM". */
export function timeToMinutes(value) {
  if (!value) return null;
  const [h, m] = String(value).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const numberFormatters = new Map();
function numberFormatter(min, max) {
  const key = `${min}-${max}`;
  if (!numberFormatters.has(key)) {
    numberFormatters.set(key, new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }));
  }
  return numberFormatters.get(key);
}

/** Nota con coma decimal y sin ceros sobrantes: 7.5 -> "7,5", 8 -> "8". */
export function formatScore(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return numberFormatter(0, decimals).format(Number(value));
}

export function formatNumber(value, decimals = 0) {
  return numberFormatter(decimals, decimals).format(Number(value) || 0);
}

/** Acepta "7,5" o "7.5". Devuelve null si no es un numero valido. */
export function parseScore(input) {
  if (input === null || input === undefined) return null;
  const normalized = String(input).trim().replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** "1 h 25 min", "25 min", "45 s" */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
}

/** mm:ss para el temporizador. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Combina "AAAA-MM-DD" y "HH:MM" en un Date local. */
export function combineDateTime(isoDate, time) {
  const date = parseDate(isoDate);
  if (!date) return null;
  const minutes = timeToMinutes(time);
  if (minutes !== null) date.setMinutes(minutes);
  return date;
}

/** Plural sencillo: pluralize(1, 'día', 'días') */
export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Saludo segun la hora del dia. */
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 14) return 'Buenos días';
  if (hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '·';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

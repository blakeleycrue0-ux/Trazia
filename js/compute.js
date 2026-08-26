/**
 * Calculos puros de Trazia: medias ponderadas, rachas de habitos y agenda.
 * No tocan la red ni el DOM, asi que son faciles de comprobar.
 */
import { addDays, isSameDay, toISODate, weekdayIndex, parseDate, timeToMinutes } from './format.js';

/* -------------------------------------------------------------------------- */
/* Notas                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Media ponderada de una lista de notas.
 * Formula: suma(nota x peso) / suma(pesos).
 * Devuelve null cuando no hay notas (nunca inventamos un valor).
 */
export function weightedAverage(grades) {
  if (!grades || grades.length === 0) return null;
  let weightSum = 0;
  let scoreSum = 0;
  for (const grade of grades) {
    const weight = Number(grade.weight) || 0;
    const score = Number(grade.score);
    if (weight <= 0 || Number.isNaN(score)) continue;
    weightSum += weight;
    scoreSum += score * weight;
  }
  if (weightSum === 0) return null;
  return scoreSum / weightSum;
}

/** Suma de pesos registrados, para explicar el calculo al usuario. */
export function weightSum(grades) {
  return (grades || []).reduce((total, grade) => total + (Number(grade.weight) || 0), 0);
}

/**
 * Media global: media aritmetica de las medias de cada asignatura que tenga
 * al menos una nota. Devuelve null si ninguna asignatura tiene notas.
 */
export function globalAverage(subjects, grades) {
  const averages = [];
  for (const subject of subjects) {
    const subjectGrades = grades.filter((g) => g.subject_id === subject.id);
    const average = weightedAverage(subjectGrades);
    if (average !== null) averages.push(average);
  }
  if (averages.length === 0) return null;
  return averages.reduce((a, b) => a + b, 0) / averages.length;
}

export function subjectsWithGrades(subjects, grades) {
  return subjects.filter((subject) => grades.some((g) => g.subject_id === subject.id));
}

/* -------------------------------------------------------------------------- */
/* Habitos                                                                     */
/* -------------------------------------------------------------------------- */

/** Conjunto de fechas ISO completadas de un habito. */
export function completionSet(completions, habitId) {
  const set = new Set();
  for (const completion of completions) {
    if (completion.habit_id === habitId) set.add(String(completion.completed_on).slice(0, 10));
  }
  return set;
}

export function isHabitScheduled(habit, date) {
  const days = habit.weekdays || [];
  return days.includes(weekdayIndex(date));
}

/**
 * Racha actual: dias programados consecutivos completados, hacia atras.
 * Si hoy toca el habito y todavia no esta marcado, la racha no se rompe:
 * el dia sigue en curso.
 */
export function habitStreak(habit, completed, referenceDate = new Date()) {
  const days = new Set(habit.weekdays || []);
  if (days.size === 0) return 0;

  let streak = 0;
  let cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  for (let guard = 0; guard < 730; guard++) {
    if (days.has(weekdayIndex(cursor))) {
      const iso = toISODate(cursor);
      if (completed.has(iso)) {
        streak += 1;
      } else if (isSameDay(cursor, referenceDate)) {
        // Hoy todavia esta por hacer: no cuenta pero tampoco rompe la racha.
      } else {
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Ultimos 7 dias (de mas antiguo a hoy) con su estado. */
export function habitWeek(habit, completed, referenceDate = new Date()) {
  const out = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = addDays(referenceDate, -offset);
    out.push({
      date,
      scheduled: isHabitScheduled(habit, date),
      done: completed.has(toISODate(date)),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Horario y eventos                                                           */
/* -------------------------------------------------------------------------- */

export function classesForDay(items, date) {
  const day = weekdayIndex(date);
  return items
    .filter((item) => item.kind === 'class' && item.weekday === day)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

export function eventsForDay(items, date) {
  const iso = toISODate(date);
  return items
    .filter((item) => item.kind !== 'class' && String(item.event_date).slice(0, 10) === iso)
    .sort((a, b) => String(a.event_time || '99:99').localeCompare(String(b.event_time || '99:99')));
}

/** Proximos examenes y entregas dentro de una ventana de dias. */
export function upcomingEvents(items, { days = 21, includeDone = false, from = new Date() } = {}) {
  const start = toISODate(from);
  const end = toISODate(addDays(from, days));
  return items
    .filter((item) => item.kind !== 'class')
    .filter((item) => includeDone || item.status !== 'done')
    .filter((item) => {
      const date = String(item.event_date).slice(0, 10);
      return date >= start && date <= end;
    })
    .sort((a, b) => {
      const dateCompare = String(a.event_date).localeCompare(String(b.event_date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.event_time || '99:99').localeCompare(String(b.event_time || '99:99'));
    });
}

/** Entregas y examenes ya pasados que siguen pendientes. */
export function overdueEvents(items, from = new Date()) {
  const start = toISODate(from);
  return items
    .filter((item) => item.kind === 'assignment' && item.status !== 'done')
    .filter((item) => String(item.event_date).slice(0, 10) < start)
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
}

/** Siguiente clase de hoy que aun no ha terminado. */
export function nextClassToday(items, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return classesForDay(items, now).find((item) => timeToMinutes(item.end_time) > minutes) || null;
}

/* -------------------------------------------------------------------------- */
/* Cuentas atras                                                               */
/* -------------------------------------------------------------------------- */

export function countdownState(countdown, now = new Date()) {
  const target = new Date(countdown.target_at);
  const diffMs = target - now;
  const past = diffMs <= 0;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const days = Math.round((startOfTarget - startOfToday) / 86400000);
  const hours = Math.floor(Math.abs(diffMs) / 3600000) % 24;
  const minutes = Math.floor(Math.abs(diffMs) / 60000) % 60;
  return { target, past, days, hours, minutes, diffMs };
}

/* -------------------------------------------------------------------------- */
/* Concentracion                                                               */
/* -------------------------------------------------------------------------- */

export function focusTotals(sessions, referenceDate = new Date()) {
  const todayIso = toISODate(referenceDate);
  const weekStart = toISODate(addDays(referenceDate, -6));
  let todaySeconds = 0;
  let weekSeconds = 0;
  for (const session of sessions) {
    const iso = toISODate(new Date(session.started_at));
    if (iso === todayIso) todaySeconds += session.focus_seconds;
    if (iso >= weekStart && iso <= todayIso) weekSeconds += session.focus_seconds;
  }
  return { todaySeconds, weekSeconds, count: sessions.length };
}

/** Comprueba que una fecha ISO tiene forma valida. */
export function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = parseDate(value);
  return date instanceof Date && !Number.isNaN(date.getTime());
}

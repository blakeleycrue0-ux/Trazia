/**
 * Inicio: que necesita hacer hoy esta persona.
 * Solo mostramos datos reales suyos; si algo esta vacio, lo decimos y ofrecemos
 * la accion para empezar.
 */
import { esc, icon, toast, emptyState } from '../ui.js';
import {
  greetingFor, formatLongDate, capitalize, formatScore, formatTime, todayISO,
  formatDuration, pluralize, formatRelativeDay, weekdayIndex,
} from '../format.js';
import * as store from '../store.js';
import {
  classesForDay, upcomingEvents, overdueEvents, nextClassToday, globalAverage,
  isHabitScheduled, focusTotals, countdownState, completionSet,
} from '../compute.js';
import { classRow, eventRow, habitRow, blockHead } from './parts.js';
import { openClassSheet, openEventSheet, openHabitSheet, openCountdownSheet } from '../forms.js';

export function mount(container, { navigate }) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-class], [data-edit-event], [data-toggle-event], [data-toggle-habit], [data-edit-habit]');
    if (!target) return;

    if (target.dataset.editClass) {
      const item = store.state.schedule.find((entry) => entry.id === target.dataset.editClass);
      if (item) await openClassSheet(item);
      return;
    }
    if (target.dataset.editEvent) {
      const item = store.state.schedule.find((entry) => entry.id === target.dataset.editEvent);
      if (item) await openEventSheet(item.kind, item);
      return;
    }
    if (target.dataset.editHabit) {
      const habit = store.state.habits.find((entry) => entry.id === target.dataset.editHabit);
      if (habit) await openHabitSheet(habit);
      return;
    }
    if (target.dataset.toggleEvent) {
      const item = store.state.schedule.find((entry) => entry.id === target.dataset.toggleEvent);
      if (!item) return;
      const next = item.status === 'done' ? 'pending' : 'done';
      try {
        await store.updateScheduleItem(item.id, { status: next });
        if (next === 'done') toast('Entrega completada');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (target.dataset.toggleHabit) {
      const habit = store.state.habits.find((entry) => entry.id === target.dataset.toggleHabit);
      if (!habit) return;
      const done = target.getAttribute('aria-pressed') === 'true';
      target.classList.add('is-celebrating');
      try {
        await store.setHabitCompletion(habit.id, todayISO(), !done);
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }

    const action = target.dataset.action;
    if (action === 'add-class') { await openClassSheet(null, { weekday: weekdayIndex(new Date()) }); return; }
    if (action === 'add-exam') { await openEventSheet('exam'); return; }
    if (action === 'add-assignment') { await openEventSheet('assignment'); return; }
    if (action === 'add-habit') { await openHabitSheet(); return; }
    if (action === 'add-countdown') { await openCountdownSheet(); return; }
    if (action === 'go-focus') { navigate('concentracion'); return; }
    if (action === 'go-schedule') { navigate('horario'); return; }
    if (action === 'go-grades') { navigate('notas'); return; }
    if (action === 'go-habits') { navigate('habitos'); return; }
    if (action === 'go-countdowns') { navigate('cuenta-atras'); }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

function template() {
  const now = new Date();
  const profile = store.state.profile || {};
  const name = (profile.display_name || '').split(' ')[0];
  const todayClasses = classesForDay(store.state.schedule, now);
  const next = nextClassToday(store.state.schedule, now);
  const overdue = overdueEvents(store.state.schedule, now);
  const upcoming = upcomingEvents(store.state.schedule, { days: 14, from: now });
  const todayHabits = store.state.habits.filter((habit) => isHabitScheduled(habit, now));
  const todayIso = todayISO();
  const habitsDone = todayHabits.filter(
    (habit) => completionSet(store.state.completions, habit.id).has(todayIso),
  ).length;
  const average = globalAverage(store.state.subjects, store.state.grades);
  const focus = focusTotals(store.state.focusSessions, now);
  const nextCountdown = store.state.countdowns
    .map((countdown) => ({ countdown, info: countdownState(countdown, now) }))
    .filter((entry) => !entry.info.past)
    .sort((a, b) => a.info.diffMs - b.info.diffMs)[0];

  return `
    <div class="wrap view">
      ${greetingBlock({ name, now, todayClasses, upcoming, next, average, habitsDone, todayHabits, focus })}

      <div class="home-grid">
        <div>
          <section class="block">
            ${blockHead('Hoy', { action: 'go-schedule', actionLabel: 'Ver horario' })}
            ${todayClasses.length === 0
              ? emptyState({
                  title: 'No hay clases guardadas para hoy',
                  text: 'Añade tu horario y aparecerá aquí cada mañana.',
                  actionLabel: 'Añadir clase',
                  action: 'add-class',
                })
              : `<div class="list mt-sm">${todayClasses.map((item) => classRow(item)).join('')}</div>`}
          </section>

          <section class="block">
            ${blockHead('Por hacer', { aside: `${overdue.length + upcoming.length}` })}
            ${overdue.length > 0 ? `
              <p class="small mt-md" style="color:var(--coral-deep);font-weight:800">
                ${overdue.length} ${pluralize(overdue.length, 'entrega pendiente de una fecha ya pasada', 'entregas pendientes de fechas ya pasadas')}
              </p>
              <div class="list">${overdue.map((item) => eventRow(item, { showDate: true })).join('')}</div>` : ''}
            ${upcoming.length === 0 && overdue.length === 0
              ? emptyState({
                  title: 'No tienes nada apuntado para los próximos días',
                  text: 'Cuando añadas un examen o una entrega, aparecerá aquí con su fecha.',
                  actionLabel: 'Añadir entrega',
                  action: 'add-assignment',
                })
              : `<div class="list ${overdue.length ? 'mt-md' : 'mt-sm'}">${upcoming.map((item) => eventRow(item, { showDate: true })).join('')}</div>`}
            <div class="btn-row mt-md">
              <button type="button" class="btn btn--ghost btn--sm" data-action="add-exam">${icon('mmas', { size: 16 })} Examen</button>
              <button type="button" class="btn btn--ghost btn--sm" data-action="add-assignment">${icon('mmas', { size: 16 })} Entrega</button>
            </div>
          </section>
        </div>

        <div>
          <section class="block">
            ${blockHead('Hábitos de hoy', { aside: todayHabits.length ? `${habitsDone} de ${todayHabits.length}` : '' })}
            ${store.state.habits.length === 0
              ? emptyState({
                  title: 'Todavía no tienes hábitos',
                  text: 'Crea uno para empezar.',
                  actionLabel: 'Crear hábito',
                  action: 'add-habit',
                })
              : todayHabits.length === 0
                ? `<p class="muted small" style="padding:20px 0">Hoy no toca ninguno de tus hábitos.
                    <button type="button" class="link-btn" data-action="go-habits">Ver todos</button></p>`
                : `<div class="mt-sm">${todayHabits.map((habit) => habitRow(habit, { dateIso: todayIso, referenceDate: now })).join('')}</div>`}
          </section>

          <section class="block">
            ${blockHead('Progreso académico', { action: 'go-grades', actionLabel: 'Ver notas' })}
            ${progressBlock(average, profile)}
          </section>

          <section class="block">
            ${blockHead('Concentración')}
            <div class="flex-between mt-md">
              <div>
                <p class="row__title">${focus.todaySeconds > 0 ? esc(formatDuration(focus.todaySeconds)) : 'Sin sesiones hoy'}</p>
                <p class="row__meta">${focus.weekSeconds > 0 ? `${esc(formatDuration(focus.weekSeconds))} en los últimos 7 días` : 'El temporizador guarda lo que estudies'}</p>
              </div>
              <button type="button" class="btn btn--coral btn--sm" data-action="go-focus">${icon('play', { size: 16 })} Empezar</button>
            </div>
          </section>

          <section class="block">
            ${blockHead('Cuenta atrás', { action: 'go-countdowns', actionLabel: 'Ver todas' })}
            ${nextCountdown
              ? `<div class="countdown-row" style="border-bottom:0">
                  <span class="countdown-num">${nextCountdown.info.days}<small>${pluralize(nextCountdown.info.days, 'día', 'días')}</small></span>
                  <span class="grow">
                    <span class="row__title">${esc(nextCountdown.countdown.name)}</span>
                    <span class="row__meta">${esc(capitalize(formatRelativeDay(nextCountdown.info.target)))}${nextCountdown.countdown.has_time ? ` · ${esc(formatTime(`${String(nextCountdown.info.target.getHours()).padStart(2, '0')}:${String(nextCountdown.info.target.getMinutes()).padStart(2, '0')}`))}` : ''}</span>
                  </span>
                </div>`
              : emptyState({
                  title: 'No tienes ninguna cuenta atrás',
                  text: 'Crea la tuya: un examen, el final de trimestre, lo que quieras.',
                  actionLabel: 'Crear cuenta atrás',
                  action: 'add-countdown',
                })}
          </section>
        </div>
      </div>
    </div>`;
}

function greetingBlock({ name, now, todayClasses, upcoming, next, average, habitsDone, todayHabits, focus }) {
  const pieces = [];
  if (todayClasses.length > 0) {
    pieces.push(`${todayClasses.length} ${pluralize(todayClasses.length, 'clase', 'clases')}`);
  }
  const todayEvents = upcoming.filter((item) => String(item.event_date).slice(0, 10) === todayISO());
  if (todayEvents.length > 0) {
    pieces.push(`${todayEvents.length} ${pluralize(todayEvents.length, 'entrega o examen', 'entregas o exámenes')}`);
  }
  if (todayHabits.length > 0) {
    pieces.push(`${todayHabits.length} ${pluralize(todayHabits.length, 'hábito', 'hábitos')}`);
  }

  const line = pieces.length > 0
    ? `Hoy tienes ${pieces.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
    : 'Hoy no tienes nada apuntado.';

  return `
    <section class="greeting">
      <span class="trace-motif" aria-hidden="true"></span>
      <p class="eyebrow greeting__date">${esc(capitalize(formatLongDate(now)))}</p>
      <h1 class="greeting__title">${esc(greetingFor(now))}${name ? `, ${esc(name)}` : ''}.</h1>
      <p class="greeting__line">${esc(line)}</p>
      <dl class="greeting__stats">
        <div class="greeting__stat">
          <dt>Próxima clase</dt>
          <dd>${next ? esc(formatTime(next.start_time)) : '—'}
            ${next ? `<small>${esc(store.subjectById(next.subject_id)?.name || 'Clase')}</small>` : '<small>Nada más por hoy</small>'}</dd>
        </div>
        <div class="greeting__stat">
          <dt>Media</dt>
          <dd>${average === null ? '—' : esc(formatScore(average, 2))}
            <small>${average === null ? 'Sin notas' : 'sobre 10'}</small></dd>
        </div>
        <div class="greeting__stat">
          <dt>Hábitos</dt>
          <dd>${todayHabits.length ? `${habitsDone}/${todayHabits.length}` : '—'}
            <small>${todayHabits.length ? 'hoy' : 'sin hábitos hoy'}</small></dd>
        </div>
        <div class="greeting__stat">
          <dt>Concentración</dt>
          <dd>${focus.todaySeconds > 0 ? esc(formatDuration(focus.todaySeconds)) : '—'}<small>hoy</small></dd>
        </div>
      </dl>
    </section>`;
}

/** Frase neutra sobre la distancia al objetivo, sin lenguaje culpabilizador. */
function progressGoalLine(average, goal) {
  if (average >= goal) return ' Vas por encima de tu objetivo.';
  const difference = goal - average;
  const rounded = Math.round(difference * 100) / 100;
  return ` Te ${rounded === 1 ? 'falta' : 'faltan'} ${esc(formatScore(difference, 2))} ${pluralize(rounded, 'punto', 'puntos')} para tu objetivo.`;
}

function progressBlock(average, profile) {
  const goal = profile.grade_goal !== null && profile.grade_goal !== undefined ? Number(profile.grade_goal) : null;
  if (average === null) {
    return `<p class="muted small" style="padding:18px 0">
      Todavía no hay suficientes notas para calcular una media.
      <button type="button" class="link-btn" data-action="go-grades">Apuntar una nota</button>
    </p>`;
  }
  const percent = Math.max(0, Math.min(100, (average / 10) * 100));
  const goalPercent = goal !== null ? Math.max(0, Math.min(100, (goal / 10) * 100)) : null;
  return `
    <div class="mt-md">
      <div class="flex-between" style="align-items:baseline">
        <span class="stat-value" style="font-size:2.1rem">${esc(formatScore(average, 2))}</span>
        ${goal !== null ? `<span class="small muted">Objetivo ${esc(formatScore(goal, 1))}</span>` : ''}
      </div>
      <div class="meter-goal mt-sm">
        <span class="meter-goal__fill" style="width:${percent}%"></span>
        ${goalPercent !== null ? `<span class="meter-goal__mark" style="left:calc(${goalPercent}% - 1px)" aria-hidden="true"></span>` : ''}
      </div>
      <p class="small muted mt-sm">
        Media de las medias ponderadas de cada asignatura con notas.
        ${goal !== null ? progressGoalLine(average, goal) : ''}
      </p>
    </div>`;
}

/**
 * Habitos: crear, marcar el dia y ver la racha.
 * La racha cuenta dias programados seguidos; los dias en los que el habito no
 * toca no la rompen.
 */
import { esc, icon, emptyState, colorValue, toast } from '../ui.js';
import { WEEKDAYS_SHORT, todayISO, pluralize } from '../format.js';
import * as store from '../store.js';
import { completionSet, habitStreak, habitWeek, isHabitScheduled } from '../compute.js';
import { openHabitSheet } from '../forms.js';

/** Ideas que se muestran cuando la lista esta vacia. No se guardan solas. */
const IDEAS = ['Leer 20 minutos', 'Estudiar matemáticas', 'Preparar la mochila', 'Dormir antes de las 23:00'];

export function mount(container) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-toggle-habit], [data-edit-habit], [data-idea]');
    if (!target) return;

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
    if (target.dataset.editHabit) {
      const habit = store.state.habits.find((entry) => entry.id === target.dataset.editHabit);
      if (habit) await openHabitSheet(habit);
      return;
    }
    if (target.dataset.idea) {
      const created = await openHabitSheet(null, { name: target.dataset.idea });
      if (created) toast('Hábito creado');
      return;
    }
    if (target.dataset.action === 'add-habit') {
      const created = await openHabitSheet();
      if (created) toast('Hábito creado');
    }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

function template() {
  const now = new Date();
  const todayIso = todayISO();
  const habits = store.state.habits;
  const scheduledToday = habits.filter((habit) => isHabitScheduled(habit, now));
  const doneToday = scheduledToday.filter(
    (habit) => completionSet(store.state.completions, habit.id).has(todayIso),
  ).length;

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Lo que quieres mantener</span>
          <h1 class="view__title">Hábitos</h1>
          ${habits.length > 0 ? `<p class="view__sub">Hoy toca ${scheduledToday.length} ${pluralize(scheduledToday.length, 'hábito', 'hábitos')}${scheduledToday.length ? ` · ${doneToday} ${pluralize(doneToday, 'hecho', 'hechos')}` : ''}.</p>` : ''}
        </div>
        ${habits.length > 0 ? `
          <button type="button" class="btn btn--primary btn--sm" data-action="add-habit">
            ${icon('mmas', { size: 16 })} Nuevo hábito
          </button>` : ''}
      </div>

      ${habits.length === 0 ? `
        ${emptyState({
          title: 'Sin hábitos aún',
          text: 'Crea uno para empezar.',
          actionLabel: 'Crear hábito',
          action: 'add-habit',
        })}
        <div class="block">
          <div class="block__head"><span class="block__title">Ideas</span></div>
          <p class="small muted mt-sm">Solo son ejemplos. No se guarda nada hasta que tú lo creas.</p>
          <div class="pill-list mt-md">
            ${IDEAS.map((idea) => `<button type="button" class="chip" data-idea="${esc(idea)}">${esc(idea)}</button>`).join('')}
          </div>
        </div>`
      : `<div class="mt-md">${habits.map((habit) => habitCard(habit, now, todayIso)).join('')}</div>`}
    </div>`;
}

function habitCard(habit, now, todayIso) {
  const completed = completionSet(store.state.completions, habit.id);
  const done = completed.has(todayIso);
  const streak = habitStreak(habit, completed, now);
  const week = habitWeek(habit, completed, now);
  const scheduled = isHabitScheduled(habit, now);
  const days = (habit.weekdays || []).map((day) => WEEKDAYS_SHORT[day]).join(' · ');

  return `
    <div class="habit-row ${scheduled ? '' : 'is-off'}" style="--habit-color:${colorValue(habit.color)}">
      <button type="button" class="habit-check" data-toggle-habit="${esc(habit.id)}"
        aria-pressed="${done}"
        aria-label="${done ? `Desmarcar ${esc(habit.name)} de hoy` : `Marcar ${esc(habit.name)} como hecho hoy`}">
        ${icon('check', { size: 20 })}
      </button>
      <span class="grow">
        <span class="row__title">${esc(habit.name)}</span>
        <span class="row__meta">${esc(days)}${scheduled ? '' : ' · hoy no toca'}</span>
        <span class="flex mt-sm" style="gap:8px">
          <span class="streak__dots" role="img" aria-label="Últimos siete días: ${week.filter((d) => d.done).length} completados">
            ${week.map((day) => `<span class="streak__dot ${day.done ? 'is-on' : ''}"
              style="${day.scheduled ? '' : 'opacity:.4'}"></span>`).join('')}
          </span>
          ${streak > 0 ? `<span class="streak">${streak} ${pluralize(streak, 'día seguido', 'días seguidos')}</span>` : '<span class="small muted">Sin racha todavía</span>'}
        </span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn" data-edit-habit="${esc(habit.id)}"
          aria-label="Editar ${esc(habit.name)}">${icon('editar')}</button>
      </span>
    </div>`;
}

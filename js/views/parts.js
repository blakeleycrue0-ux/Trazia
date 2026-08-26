/**
 * Trozos de interfaz que comparten varias vistas (inicio y horario sobre todo).
 */
import { esc, icon, colorValue } from '../ui.js';
import { formatTime, formatRelativeDay, parseDate, capitalize } from '../format.js';
import * as store from '../store.js';
import { habitStreak, completionSet } from '../compute.js';

export function classRow(item, { showActions = true } = {}) {
  const subject = store.subjectById(item.subject_id);
  return `
    <div class="row" style="--row-color:${colorValue(subject?.color)}" data-class="${esc(item.id)}">
      <span class="row__bar" aria-hidden="true"></span>
      <span class="row__time">${esc(formatTime(item.start_time))}<small>${esc(formatTime(item.end_time))}</small></span>
      <span class="row__main">
        <span class="row__title">${esc(subject?.name || 'Clase sin asignatura')}</span>
        ${item.room ? `<span class="row__meta">Aula ${esc(item.room)}</span>` : ''}
      </span>
      ${showActions ? `
        <span class="row__actions">
          <button type="button" class="icon-btn" data-edit-class="${esc(item.id)}"
            aria-label="Editar la clase de ${esc(subject?.name || 'esta asignatura')}">${icon('editar')}</button>
        </span>` : ''}
    </div>`;
}

export function eventRow(item, { showDate = false } = {}) {
  const subject = store.subjectById(item.subject_id);
  const isExam = item.kind === 'exam';
  const date = parseDate(item.event_date);
  const done = item.status === 'done';
  return `
    <div class="row ${done ? 'is-done' : ''}" style="--row-color:${colorValue(subject?.color)}" data-event="${esc(item.id)}">
      ${isExam
        ? '<span class="row__bar" aria-hidden="true"></span>'
        : `<button type="button" class="icon-btn" data-toggle-event="${esc(item.id)}"
             aria-pressed="${done}" aria-label="${done ? 'Marcar como pendiente' : 'Marcar como completada'}">
             <span class="choice__tick" style="width:20px;height:20px" aria-hidden="true"></span>
           </button>`}
      <span class="row__main">
        <span class="row__title">${esc(item.title)}</span>
        <span class="row__meta">
          ${esc(subject ? `${subject.name} · ` : '')}${showDate && date ? esc(subject ? formatRelativeDay(date) : capitalize(formatRelativeDay(date))) : ''}${item.event_time ? ` · ${esc(formatTime(item.event_time))}` : ''}
        </span>
      </span>
      <span class="row__side">
        <span class="tag ${isExam ? 'tag--exam' : (done ? 'tag--done' : 'tag--pending')}">
          ${isExam ? 'Examen' : (done ? 'Entregada' : 'Entrega')}
        </span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn" data-edit-event="${esc(item.id)}"
          aria-label="Editar ${esc(item.title)}">${icon('editar')}</button>
      </span>
    </div>`;
}

export function habitRow(habit, { dateIso, scheduled = true, referenceDate = new Date() }) {
  const completed = completionSet(store.state.completions, habit.id);
  const done = completed.has(dateIso);
  const streak = habitStreak(habit, completed, referenceDate);
  return `
    <div class="habit-row ${scheduled ? '' : 'is-off'}" style="--habit-color:${colorValue(habit.color)}" data-habit="${esc(habit.id)}">
      <button type="button" class="habit-check" data-toggle-habit="${esc(habit.id)}"
        aria-pressed="${done}" aria-label="${done ? `Desmarcar ${esc(habit.name)}` : `Marcar ${esc(habit.name)} como hecho`}">
        ${icon('check', { size: 20 })}
      </button>
      <span class="grow">
        <span class="row__title">${esc(habit.name)}</span>
        <span class="row__meta">
          ${streak > 0
            ? `<span class="streak">${streak} ${streak === 1 ? 'día seguido' : 'días seguidos'}</span>`
            : (scheduled ? 'Hoy toca' : 'Hoy no toca')}
        </span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn" data-edit-habit="${esc(habit.id)}"
          aria-label="Editar ${esc(habit.name)}">${icon('editar')}</button>
      </span>
    </div>`;
}

/** Cabecera de bloque con titulo y accion opcional. */
export function blockHead(title, { aside = '', action = '', actionLabel = '' } = {}) {
  return `
    <div class="block__head">
      <span class="block__title">${esc(title)}</span>
      ${action
        ? `<button type="button" class="link-btn" data-action="${esc(action)}">${esc(actionLabel)}</button>`
        : (aside ? `<span class="block__aside">${esc(aside)}</span>` : '')}
    </div>`;
}

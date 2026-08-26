/**
 * Horario, en modo dia o semana.
 * En escritorio la semana se dibuja como rejilla horaria real; en movil se
 * convierte en una agenda por dias para que no haya scroll horizontal.
 */
import { esc, icon, emptyState, colorValue, toast } from '../ui.js';
import {
  WEEKDAYS, WEEKDAYS_ABBR, formatTime, formatLongDate, formatShortDate, capitalize,
  addDays, startOfWeek, isSameDay, weekdayIndex, timeToMinutes, toISODate, minutesToTime,
  formatMediumDate,
} from '../format.js';
import * as store from '../store.js';
import { classesForDay, eventsForDay } from '../compute.js';
import { classRow, eventRow, blockHead } from './parts.js';
import { openClassSheet, openEventSheet } from '../forms.js';

const DESKTOP_QUERY = '(min-width: 900px)';

export function mount(container) {
  let mode = localStorage.getItem('trazia.schedule-mode') === 'semana' ? 'semana' : 'dia';
  let cursor = new Date();
  const desktop = window.matchMedia(DESKTOP_QUERY);

  const render = () => {
    container.innerHTML = template({ mode, cursor, wide: desktop.matches });
  };

  const onMediaChange = () => render();
  desktop.addEventListener('change', onMediaChange);

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-class], [data-edit-event], [data-toggle-event], [data-mode], [data-goto-day]');
    if (!target) return;

    if (target.dataset.mode) {
      mode = target.dataset.mode;
      localStorage.setItem('trazia.schedule-mode', mode);
      render();
      return;
    }
    if (target.dataset.gotoDay) {
      cursor = new Date(Number(target.dataset.gotoDay));
      mode = 'dia';
      render();
      return;
    }
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
    if (target.dataset.toggleEvent) {
      const item = store.state.schedule.find((entry) => entry.id === target.dataset.toggleEvent);
      if (!item) return;
      try {
        await store.updateScheduleItem(item.id, { status: item.status === 'done' ? 'pending' : 'done' });
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }

    const action = target.dataset.action;
    if (action === 'prev') { cursor = addDays(cursor, mode === 'semana' ? -7 : -1); render(); return; }
    if (action === 'next') { cursor = addDays(cursor, mode === 'semana' ? 7 : 1); render(); return; }
    if (action === 'today') { cursor = new Date(); render(); return; }
    if (action === 'add-class') { await openClassSheet(null, { weekday: weekdayIndex(cursor) }); return; }
    if (action === 'add-exam') { await openEventSheet('exam', null, { date: toISODate(cursor) }); return; }
    if (action === 'add-assignment') { await openEventSheet('assignment', null, { date: toISODate(cursor) }); }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => {
    unsubscribe();
    desktop.removeEventListener('change', onMediaChange);
  };
}

function template({ mode, cursor, wide }) {
  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Tu semana</span>
          <h1 class="view__title">Horario</h1>
        </div>
        <div class="segmented" role="tablist" aria-label="Modo de vista">
          <button type="button" role="tab" data-mode="dia" aria-selected="${mode === 'dia'}">Día</button>
          <button type="button" role="tab" data-mode="semana" aria-selected="${mode === 'semana'}">Semana</button>
        </div>
      </div>

      ${navBar(mode, cursor)}
      ${mode === 'dia' ? dayView(cursor) : weekView(cursor, wide)}

      <div class="btn-row mt-lg">
        <button type="button" class="btn btn--primary btn--sm" data-action="add-class">${icon('mmas', { size: 16 })} Clase</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="add-exam">${icon('mmas', { size: 16 })} Examen</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="add-assignment">${icon('mmas', { size: 16 })} Entrega</button>
      </div>
    </div>`;
}

function navBar(mode, cursor) {
  const isToday = isSameDay(cursor, new Date());
  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 5);
  const label = mode === 'dia'
    ? capitalize(formatLongDate(cursor))
    : `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`;
  const sub = mode === 'dia'
    ? (isToday ? 'Hoy' : '')
    : (isSameDay(startOfWeek(new Date()), weekStart) ? 'Esta semana' : '');

  return `
    <div class="date-nav">
      <button type="button" class="icon-btn" data-action="prev"
        aria-label="${mode === 'dia' ? 'Día anterior' : 'Semana anterior'}">${icon('atras')}</button>
      <p class="date-nav__label grow text-center" style="text-align:center">
        ${esc(label)}${sub ? `<span>${esc(sub)}</span>` : ''}
      </p>
      <div class="flex">
        ${!isToday || mode === 'semana' ? '<button type="button" class="btn btn--quiet btn--sm" data-action="today">Hoy</button>' : ''}
        <button type="button" class="icon-btn" data-action="next"
          aria-label="${mode === 'dia' ? 'Día siguiente' : 'Semana siguiente'}">${icon('siguiente')}</button>
      </div>
    </div>`;
}

function dayView(cursor) {
  const classes = classesForDay(store.state.schedule, cursor);
  const events = eventsForDay(store.state.schedule, cursor);

  return `
    <section class="block">
      ${blockHead('Clases', { aside: classes.length ? String(classes.length) : '' })}
      ${classes.length === 0
        ? emptyState({
            title: `Sin clases el ${esc(WEEKDAYS[weekdayIndex(cursor)])}`,
            text: 'Añade una clase y se repetirá cada semana ese día.',
            actionLabel: 'Añadir clase',
            action: 'add-class',
          })
        : `<div class="list mt-sm">${classes.map((item) => classRow(item)).join('')}</div>`}
    </section>

    <section class="block">
      ${blockHead('Exámenes y entregas')}
      ${events.length === 0
        ? `<p class="muted small" style="padding:18px 0">Nada apuntado para este día.</p>`
        : `<div class="list mt-sm">${events.map((item) => eventRow(item)).join('')}</div>`}
    </section>`;
}

function weekView(cursor, wide) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 6 }, (unused, index) => addDays(weekStart, index));
  const hasWeekend = store.state.schedule.some((item) => item.kind === 'class' && item.weekday === 5)
    || days.some((day) => eventsForDay(store.state.schedule, day).length > 0 && weekdayIndex(day) === 5);
  const visibleDays = hasWeekend ? days : days.slice(0, 5);

  if (!wide) return weekAgenda(visibleDays);

  const classes = store.state.schedule.filter(
    (item) => item.kind === 'class' && visibleDays.some((day) => weekdayIndex(day) === item.weekday),
  );

  const starts = classes.map((item) => timeToMinutes(item.start_time)).filter((value) => value !== null);
  const ends = classes.map((item) => timeToMinutes(item.end_time)).filter((value) => value !== null);
  // Siempre se enseña al menos una jornada creible, aunque haya pocas clases.
  const dayStart = Math.min(480, Math.floor((starts.length ? Math.min(...starts) : 480) / 60) * 60);
  const dayEnd = Math.max(840, Math.min(24 * 60, Math.ceil((ends.length ? Math.max(...ends) : 840) / 60) * 60));
  const totalMinutes = Math.max(60, dayEnd - dayStart);
  const slotHeight = 58;
  const topPad = 10;
  const height = (totalMinutes / 60) * slotHeight + topPad * 2;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const hourLines = [];
  for (let minute = dayStart; minute <= dayEnd; minute += 60) {
    hourLines.push(`<span class="week-grid__hour" style="top:${topPad + ((minute - dayStart) / 60) * slotHeight}px">${esc(minutesToTime(minute))}</span>`);
  }

  const columns = visibleDays.map((day) => {
    const index = weekdayIndex(day);
    const dayClasses = classesForDay(store.state.schedule, day);
    const isToday = isSameDay(day, now);
    const events = dayClasses.map((item) => {
      const subject = store.subjectById(item.subject_id);
      const start = timeToMinutes(item.start_time);
      const end = timeToMinutes(item.end_time);
      const top = topPad + ((start - dayStart) / 60) * slotHeight;
      const blockHeight = Math.max(26, ((end - start) / 60) * slotHeight - 3);
      return `
        <button type="button" class="week-event" data-edit-class="${esc(item.id)}"
          style="--row-color:${colorValue(subject?.color)};top:${top}px;height:${blockHeight}px">
          <span class="week-event__title">${esc(subject?.name || 'Clase')}</span>
          <span class="week-event__meta">${esc(formatTime(item.start_time))}${item.room ? ` · ${esc(item.room)}` : ''}</span>
        </button>`;
    }).join('');
    const nowLine = isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd
      ? `<span class="week-now" style="top:${topPad + ((nowMinutes - dayStart) / 60) * slotHeight}px" aria-hidden="true"></span>`
      : '';
    return `<div class="week-col" style="height:${height}px;background-position:0 ${topPad}px" data-weekday="${index}">${events}${nowLine}</div>`;
  }).join('');

  const weekEvents = visibleDays.flatMap((day) => eventsForDay(store.state.schedule, day));

  return `
    <div class="week-grid" style="--days:${visibleDays.length};--slot-h:${slotHeight}px">
      <div class="week-grid__head" aria-hidden="true"></div>
      ${visibleDays.map((day) => `
        <div class="week-grid__head ${isSameDay(day, now) ? 'is-today' : ''}">
          <button type="button" class="link-btn" style="text-decoration:none;color:inherit;font:inherit"
            data-goto-day="${day.getTime()}">${esc(WEEKDAYS_ABBR[weekdayIndex(day)])} ${day.getDate()}</button>
        </div>`).join('')}
      <div class="week-grid__hours" style="height:${height}px">${hourLines.join('')}</div>
      ${columns}
    </div>

    <section class="block">
      ${blockHead('Exámenes y entregas de esta semana')}
      ${weekEvents.length === 0
        ? `<p class="muted small" style="padding:18px 0">Nada apuntado esta semana.</p>`
        : `<div class="list mt-sm">${weekEvents.map((item) => eventRow(item, { showDate: true })).join('')}</div>`}
    </section>`;
}

function weekAgenda(days) {
  const hasAnything = days.some((day) => classesForDay(store.state.schedule, day).length > 0
    || eventsForDay(store.state.schedule, day).length > 0);

  if (!hasAnything) {
    return emptyState({
      title: 'Esta semana está vacía',
      text: 'Añade tus clases y se repetirán cada semana.',
      actionLabel: 'Añadir clase',
      action: 'add-class',
    });
  }

  return days.map((day) => {
    const classes = classesForDay(store.state.schedule, day);
    const events = eventsForDay(store.state.schedule, day);
    if (classes.length === 0 && events.length === 0) return '';
    return `
      <section class="block">
        <div class="block__head">
          <span class="block__title">${esc(WEEKDAYS[weekdayIndex(day)])}</span>
          <span class="block__aside">${esc(formatMediumDate(day))}${isSameDay(day, new Date()) ? ' · hoy' : ''}</span>
        </div>
        <div class="list mt-sm">
          ${classes.map((item) => classRow(item)).join('')}
          ${events.map((item) => eventRow(item)).join('')}
        </div>
      </section>`;
  }).join('');
}

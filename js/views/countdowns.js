/**
 * Cuentas atras. Las crea siempre la persona usuaria: aqui no hay fechas
 * inventadas ni ejemplos guardados.
 */
import { esc, icon, emptyState, toast } from '../ui.js';
import { formatLongDate, formatTime, capitalize, pluralize, minutesToTime } from '../format.js';
import * as store from '../store.js';
import { countdownState } from '../compute.js';
import { openCountdownSheet } from '../forms.js';

export function mount(container) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-countdown]');
    if (!target) return;
    if (target.dataset.editCountdown) {
      const countdown = store.state.countdowns.find((entry) => entry.id === target.dataset.editCountdown);
      if (countdown) await openCountdownSheet(countdown);
      return;
    }
    if (target.dataset.action === 'add-countdown') {
      const created = await openCountdownSheet();
      if (created) toast('Cuenta atrás creada');
    }
  });

  render();
  const unsubscribe = store.subscribe(render);
  // Refrescamos cada minuto para que las horas restantes no se queden congeladas.
  const ticker = setInterval(render, 60000);
  return () => { unsubscribe(); clearInterval(ticker); };
}

function template() {
  const now = new Date();
  const entries = store.state.countdowns
    .map((countdown) => ({ countdown, info: countdownState(countdown, now) }));
  const upcoming = entries.filter((entry) => !entry.info.past).sort((a, b) => a.info.diffMs - b.info.diffMs);
  const past = entries.filter((entry) => entry.info.past).sort((a, b) => b.info.diffMs - a.info.diffMs);

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Lo que viene</span>
          <h1 class="view__title">Cuenta atrás</h1>
        </div>
        ${entries.length ? `
          <button type="button" class="btn btn--primary btn--sm" data-action="add-countdown">
            ${icon('mmas', { size: 16 })} Nueva
          </button>` : ''}
      </div>

      ${entries.length === 0
        ? emptyState({
            title: 'Sin cuentas atrás',
            text: 'Crea la tuya con su nombre y su fecha: un examen, el final de trimestre, lo que quieras.',
            actionLabel: 'Crear cuenta atrás',
            action: 'add-countdown',
          })
        : `
          <div class="list mt-md">${upcoming.map((entry) => countdownRow(entry)).join('')}</div>
          ${past.length ? `
            <section class="block">
              <div class="block__head"><span class="block__title">Ya han pasado</span>
                <span class="block__aside">${past.length}</span></div>
              <div class="list mt-sm">${past.map((entry) => countdownRow(entry)).join('')}</div>
            </section>` : ''}`}
    </div>`;
}

function countdownRow({ countdown, info }) {
  const soon = !info.past && info.days <= 7;
  const timeLabel = countdown.has_time
    ? ` · ${esc(formatTime(minutesToTime(info.target.getHours() * 60 + info.target.getMinutes())))}`
    : '';

  let value;
  let unit;
  if (info.past) {
    value = '·';
    unit = 'Terminada';
  } else if (info.days === 0) {
    value = countdown.has_time ? String(info.hours) : '0';
    unit = countdown.has_time ? pluralize(info.hours, 'hora', 'horas') : 'hoy';
  } else {
    value = String(info.days);
    unit = pluralize(info.days, 'día', 'días');
  }

  return `
    <div class="countdown-row ${info.past ? 'is-past' : ''} ${soon ? 'is-soon' : ''}">
      <span class="countdown-num num">${esc(value)}<small>${esc(unit)}</small></span>
      <span class="grow">
        <span class="row__title">${esc(countdown.name)}</span>
        <span class="row__meta">${esc(capitalize(formatLongDate(info.target)))}${timeLabel}${info.past ? ' · ya ha pasado' : ''}</span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn" data-edit-countdown="${esc(countdown.id)}"
          aria-label="Editar ${esc(countdown.name)}">${icon('editar')}</button>
      </span>
    </div>`;
}

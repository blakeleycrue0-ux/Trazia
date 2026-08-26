/**
 * Concentración: temporizador tipo Pomodoro.
 *
 * El temporizador es un servicio del modulo, no de la vista: sigue funcionando
 * aunque cambies de seccion, y el tiempo restante siempre se calcula a partir de
 * marcas de tiempo reales (Date.now()), nunca contando ticks. Asi da igual que
 * la pestaña quede en segundo plano o que el navegador ralentice los timers.
 */
import { esc, icon, qs, toast, openSheet, emptyState, colorValue, confirmDialog } from '../ui.js';
import { formatClock, formatDuration, formatMediumDate, formatTime } from '../format.js';
import * as store from '../store.js';
import { focusTotals } from '../compute.js';

const STORAGE_KEY = 'trazia.timer';
const RING_RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* -------------------------------------------------------------------------- */
/* Servicio de temporizador                                                    */
/* -------------------------------------------------------------------------- */

const timer = {
  phase: 'focus',          // 'focus' | 'break'
  status: 'idle',          // 'idle' | 'running' | 'paused'
  endAt: null,             // marca de tiempo en la que termina la fase
  remaining: null,         // segundos restantes cuando esta en pausa
  focusMinutes: 25,
  breakMinutes: 5,
  sessionStartedAt: null,  // inicio de la sesion de concentracion en curso
  accumulated: 0,          // segundos de concentracion ya completados
  listeners: new Set(),
  interval: null,
};

function persist() {
  const { phase, status, endAt, remaining, focusMinutes, breakMinutes, sessionStartedAt, accumulated } = timer;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      phase, status, endAt, remaining, focusMinutes, breakMinutes, sessionStartedAt, accumulated,
    }));
  } catch { /* almacenamiento no disponible: el temporizador sigue funcionando en memoria */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(timer, saved);
  } catch { /* datos corruptos: empezamos limpio */ }
}

function emit() {
  for (const listener of timer.listeners) listener();
}

export function onTimer(listener) {
  timer.listeners.add(listener);
  return () => timer.listeners.delete(listener);
}

function phaseSeconds(phase = timer.phase) {
  return (phase === 'focus' ? timer.focusMinutes : timer.breakMinutes) * 60;
}

export function remainingSeconds() {
  if (timer.status === 'running' && timer.endAt) {
    return Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
  }
  if (timer.status === 'paused' && timer.remaining !== null) return timer.remaining;
  return phaseSeconds();
}

function ensureInterval() {
  if (timer.interval) return;
  timer.interval = setInterval(() => {
    if (timer.status !== 'running') return;
    if (remainingSeconds() <= 0) completePhase();
    else emit();
  }, 250);
}

function start() {
  const seconds = phaseSeconds();
  timer.status = 'running';
  timer.endAt = Date.now() + seconds * 1000;
  timer.remaining = null;
  if (timer.phase === 'focus' && !timer.sessionStartedAt) timer.sessionStartedAt = Date.now();
  ensureInterval();
  persist();
  emit();
}

function pause() {
  if (timer.status !== 'running') return;
  timer.remaining = remainingSeconds();
  timer.status = 'paused';
  timer.endAt = null;
  persist();
  emit();
}

function resume() {
  if (timer.status !== 'paused') return;
  timer.status = 'running';
  timer.endAt = Date.now() + (timer.remaining || 0) * 1000;
  timer.remaining = null;
  ensureInterval();
  persist();
  emit();
}

/** Vuelve al principio de la fase actual sin perder lo ya acumulado. */
function restart() {
  timer.status = 'idle';
  timer.endAt = null;
  timer.remaining = null;
  persist();
  emit();
}

function setPhase(phase) {
  timer.phase = phase;
  timer.status = 'idle';
  timer.endAt = null;
  timer.remaining = null;
  persist();
  emit();
}

function completePhase() {
  const finishedPhase = timer.phase;
  if (finishedPhase === 'focus') {
    timer.accumulated += phaseSeconds('focus');
  }
  timer.phase = finishedPhase === 'focus' ? 'break' : 'focus';
  timer.status = 'idle';
  timer.endAt = null;
  timer.remaining = null;
  persist();
  emit();
  beep();

  if (finishedPhase === 'focus') {
    toast(`Sesión de ${timer.focusMinutes} minutos completada`);
    offerToSave();
  } else {
    toast('Descanso terminado');
  }
}

/** Cierra la sesion en curso: guarda o descarta el tiempo acumulado. */
async function finishSession() {
  const runningFocus = timer.phase === 'focus' && timer.status !== 'idle'
    ? phaseSeconds('focus') - remainingSeconds()
    : 0;
  const total = timer.accumulated + Math.max(0, runningFocus);

  timer.status = 'idle';
  timer.endAt = null;
  timer.remaining = null;
  timer.phase = 'focus';
  persist();
  emit();

  if (total < 60) {
    resetSession();
    toast('Sesión terminada');
    return;
  }
  await offerToSave(total);
}

function resetSession() {
  timer.accumulated = 0;
  timer.sessionStartedAt = null;
  persist();
  emit();
}

function beep() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.setValueAtTime(880, context.currentTime + 0.18);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.95);
    oscillator.onended = () => context.close().catch(() => {});
  } catch { /* sin audio disponible: el aviso visual ya se ha mostrado */ }
}

/* -------------------------------------------------------------------------- */
/* Guardar la sesion                                                           */
/* -------------------------------------------------------------------------- */

async function offerToSave(overrideSeconds) {
  const seconds = overrideSeconds ?? timer.accumulated;
  if (seconds < 60) return;
  const startedAt = timer.sessionStartedAt ? new Date(timer.sessionStartedAt) : new Date(Date.now() - seconds * 1000);

  const result = await openSheet({
    title: 'Guardar la sesión',
    body: `
      <p class="muted">Has concentrado <strong>${esc(formatDuration(seconds))}</strong>.
      Puedes guardarlo para llevar la cuenta de lo que estudias.</p>
      <form novalidate class="mt-md">
        <div class="field">
          <label class="field__label" for="focus-subject">Asignatura <span class="muted">(opcional)</span></label>
          <select class="select" id="focus-subject">
            <option value="">Sin asignatura</option>
            ${store.state.subjects.map((subject) => `
              <option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join('')}
          </select>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>No guardar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar sesión</button>`,
    onMount: (dialog, close) => {
      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const subjectId = qs('#focus-subject', dialog).value || null;
        try {
          await store.createFocusSession({
            subject_id: subjectId,
            started_at: startedAt.toISOString(),
            ended_at: new Date().toISOString(),
            focus_seconds: Math.round(seconds),
          });
          close('saved');
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    },
  });

  if (result === 'saved') toast('Sesión guardada');
  resetSession();
}

/* -------------------------------------------------------------------------- */
/* Arranque del servicio                                                       */
/* -------------------------------------------------------------------------- */

restore();
if (timer.status === 'running') {
  if (remainingSeconds() <= 0) completePhase();
  else ensureInterval();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (timer.status === 'running' && remainingSeconds() <= 0) completePhase();
  else emit();
});

/* -------------------------------------------------------------------------- */
/* Vista                                                                       */
/* -------------------------------------------------------------------------- */

export function mount(container) {
  // Las preferencias guardadas del perfil mandan sobre las de este navegador.
  const profile = store.state.profile;
  if (profile) {
    timer.focusMinutes = profile.focus_minutes || 25;
    timer.breakMinutes = profile.break_minutes || 5;
    if (timer.status === 'idle') persist();
  }

  const render = () => { container.innerHTML = template(); };
  const paint = () => {
    const time = container.querySelector('[data-timer-time]');
    if (!time) { render(); return; }
    const seconds = remainingSeconds();
    time.textContent = formatClock(seconds);
    const total = phaseSeconds();
    const progress = total > 0 ? 1 - seconds / total : 0;
    const ring = container.querySelector('[data-timer-ring]');
    if (ring) ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    const phase = container.querySelector('[data-timer-phase]');
    if (phase) phase.textContent = timer.phase === 'focus' ? 'Concentración' : 'Descanso';
    const controls = container.querySelector('[data-timer-controls]');
    if (controls) controls.innerHTML = controlsMarkup();
    const stage = container.querySelector('[data-timer-stage]');
    if (stage) stage.classList.toggle('is-break', timer.phase === 'break');
    document.title = timer.status === 'running'
      ? `${formatClock(seconds)} — Trazia`
      : 'Concentración — Trazia';
  };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-delete-session]');
    if (!target) return;
    const action = target.dataset.action;

    if (target.dataset.deleteSession) {
      const ok = await confirmDialog({
        title: 'Eliminar sesión',
        message: 'Dejará de contar en tus totales de concentración.',
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      try {
        await store.deleteFocusSession(target.dataset.deleteSession);
        toast('Sesión eliminada');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }

    if (action === 'start') { start(); return; }
    if (action === 'pause') { pause(); return; }
    if (action === 'resume') { resume(); return; }
    if (action === 'restart') { restart(); return; }
    if (action === 'finish') { await finishSession(); render(); return; }
    if (action === 'phase-focus') { setPhase('focus'); render(); return; }
    if (action === 'phase-break') { setPhase('break'); render(); return; }
    if (action === 'settings') { await openDurationSheet(); render(); }
  });

  render();
  const offTimer = onTimer(paint);
  const offStore = store.subscribe(render);
  return () => {
    offTimer();
    offStore();
    document.title = 'Trazia';
  };
}

function controlsMarkup() {
  if (timer.status === 'running') {
    return `
      <button type="button" class="btn btn--ghost" data-action="pause">${icon('pausa', { size: 18 })} Pausar</button>
      <button type="button" class="btn btn--quiet" data-action="restart">${icon('reiniciar', { size: 18 })} Reiniciar</button>
      <button type="button" class="btn btn--quiet" data-action="finish">${icon('parar', { size: 18 })} Finalizar</button>`;
  }
  if (timer.status === 'paused') {
    return `
      <button type="button" class="btn btn--primary" data-action="resume">${icon('play', { size: 18 })} Continuar</button>
      <button type="button" class="btn btn--quiet" data-action="restart">${icon('reiniciar', { size: 18 })} Reiniciar</button>
      <button type="button" class="btn btn--quiet" data-action="finish">${icon('parar', { size: 18 })} Finalizar</button>`;
  }
  return `
    <button type="button" class="btn btn--coral" data-action="start">${icon('play', { size: 18 })} Iniciar</button>
    ${timer.accumulated > 0 ? `<button type="button" class="btn btn--quiet" data-action="finish">${icon('parar', { size: 18 })} Finalizar sesión</button>` : ''}`;
}

function template() {
  const seconds = remainingSeconds();
  const total = phaseSeconds();
  const progress = total > 0 ? 1 - seconds / total : 0;
  const totals = focusTotals(store.state.focusSessions);
  const sessions = store.state.focusSessions.slice(0, 8);

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Sin distracciones</span>
          <h1 class="view__title">Concentración</h1>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-action="settings">
          ${icon('ajustes', { size: 16 })} Duraciones
        </button>
      </div>

      <div class="segmented mt-md" role="tablist" aria-label="Fase">
        <button type="button" role="tab" data-action="phase-focus" aria-selected="${timer.phase === 'focus'}">Concentración</button>
        <button type="button" role="tab" data-action="phase-break" aria-selected="${timer.phase === 'break'}">Descanso</button>
      </div>

      <div class="focus-stage">
        <div class="focus-ring ${timer.phase === 'break' ? 'is-break' : ''}" data-timer-stage>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="focus-ring__track" cx="50" cy="50" r="${RING_RADIUS}"></circle>
            <circle class="focus-ring__progress" cx="50" cy="50" r="${RING_RADIUS}"
              data-timer-ring
              stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}"
              stroke-dashoffset="${(CIRCUMFERENCE * (1 - progress)).toFixed(2)}"></circle>
          </svg>
          <div class="focus-ring__inner">
            <p class="focus-phase" data-timer-phase>${timer.phase === 'focus' ? 'Concentración' : 'Descanso'}</p>
            <p class="focus-time num" data-timer-time role="timer" aria-live="off">${esc(formatClock(seconds))}</p>
            <p class="small muted">${timer.phase === 'focus' ? `${timer.focusMinutes} min` : `${timer.breakMinutes} min`}</p>
          </div>
        </div>
        <div class="focus-controls" data-timer-controls>${controlsMarkup()}</div>
        ${timer.accumulated > 0 ? `
          <p class="small muted">Llevas ${esc(formatDuration(timer.accumulated))} de concentración en esta sesión.</p>` : ''}
      </div>

      <dl class="stat-strip">
        <div class="stat"><dt>Hoy</dt><dd>${totals.todaySeconds ? esc(formatDuration(totals.todaySeconds)) : '—'}</dd></div>
        <div class="stat"><dt>Últimos 7 días</dt><dd>${totals.weekSeconds ? esc(formatDuration(totals.weekSeconds)) : '—'}</dd></div>
        <div class="stat"><dt>Sesiones guardadas</dt><dd>${store.state.focusSessions.length}</dd></div>
      </dl>

      <section class="block">
        <div class="block__head"><span class="block__title">Últimas sesiones</span></div>
        ${sessions.length === 0
          ? emptyState({
              title: 'Sin sesiones aún',
              text: 'Al terminar una sesión de concentración podrás guardarla aquí.',
            })
          : `<div class="list mt-sm">${sessions.map((session) => sessionRow(session)).join('')}</div>`}
      </section>
    </div>`;
}

function sessionRow(session) {
  const subject = store.subjectById(session.subject_id);
  const started = new Date(session.started_at);
  return `
    <div class="row" style="--row-color:${colorValue(subject?.color)}">
      <span class="row__bar" aria-hidden="true"></span>
      <span class="row__main">
        <span class="row__title">${esc(formatDuration(session.focus_seconds))}</span>
        <span class="row__meta">
          ${esc(formatMediumDate(started))} · ${esc(formatTime(`${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`))}
          ${subject ? ` · ${esc(subject.name)}` : ''}
        </span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn icon-btn--danger" data-delete-session="${esc(session.id)}"
          aria-label="Eliminar sesión">${icon('eliminar')}</button>
      </span>
    </div>`;
}

async function openDurationSheet() {
  const result = await openSheet({
    title: 'Duraciones',
    body: `
      <form novalidate>
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="focus-min">Concentración (min)</label>
            <input class="input" id="focus-min" type="number" min="1" max="180" step="1" value="${timer.focusMinutes}">
            <p class="field__error" id="focus-min-error" hidden></p>
          </div>
          <div class="field">
            <label class="field__label" for="break-min">Descanso (min)</label>
            <input class="input" id="break-min" type="number" min="1" max="60" step="1" value="${timer.breakMinutes}">
            <p class="field__error" id="break-min-error" hidden></p>
          </div>
        </div>
        <p class="field__hint">Por defecto son 25 y 5 minutos. Se guardan en tu perfil.</p>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const focusMinutes = Number(qs('#focus-min', dialog).value);
        const breakMinutes = Number(qs('#break-min', dialog).value);
        const focusError = qs('#focus-min-error', dialog);
        const breakError = qs('#break-min-error', dialog);
        focusError.hidden = true;
        breakError.hidden = true;
        if (!Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 180) {
          focusError.textContent = 'Entre 1 y 180 minutos.';
          focusError.hidden = false;
          return;
        }
        if (!Number.isInteger(breakMinutes) || breakMinutes < 1 || breakMinutes > 60) {
          breakError.textContent = 'Entre 1 y 60 minutos.';
          breakError.hidden = false;
          return;
        }
        try {
          await store.updateProfile({ focus_minutes: focusMinutes, break_minutes: breakMinutes });
          timer.focusMinutes = focusMinutes;
          timer.breakMinutes = breakMinutes;
          if (timer.status === 'idle') { timer.endAt = null; timer.remaining = null; }
          persist();
          emit();
          close(true);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    },
  });
  if (result) toast('Duraciones guardadas');
}

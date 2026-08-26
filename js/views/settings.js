/**
 * Ajustes: perfil, asignaturas, temporizador, cuenta, copia de seguridad y
 * eliminacion de cuenta.
 */
import {
  esc, icon, qs, toast, openSheet, confirmDialog, colorValue, colorLabel, setBusy, emptyState,
} from '../ui.js';
import { formatScore, parseScore, initials } from '../format.js';
import * as store from '../store.js';
import { getSupabase, translateAuthError, signOut } from '../supabase.js';
import { validatePassword, validateMatch } from '../validation.js';
import { openSubjectSheet } from '../forms.js';
import { exportData, openImportSheet, importBackup, TABLE_LABELS } from '../backup.js';
import { GRADE_LEVELS, TRACKS } from './onboarding.js';

export function mount(container) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-subject]');
    if (!target) return;
    const action = target.dataset.action;

    if (target.dataset.editSubject) {
      const subject = store.state.subjects.find((entry) => entry.id === target.dataset.editSubject);
      if (subject) await openSubjectSheet(subject);
      return;
    }

    if (action === 'edit-name') { await openNameSheet(); return; }
    if (action === 'edit-course') { await openCourseSheet(); return; }
    if (action === 'edit-goal') { await openGoalSheet(); return; }
    if (action === 'edit-timer') { await openTimerSheet(); return; }
    if (action === 'add-subject') {
      const created = await openSubjectSheet();
      if (created) toast('Asignatura creada');
      return;
    }
    if (action === 'change-password') { await openPasswordSheet(); return; }
    if (action === 'logout') {
      const ok = await confirmDialog({
        title: 'Cerrar sesión',
        message: 'Tendrás que volver a entrar con tu correo y contraseña.',
        confirmLabel: 'Cerrar sesión',
      });
      if (!ok) return;
      await signOut().catch(() => {});
      window.location.replace('auth.html');
      return;
    }
    if (action === 'export') { await handleExport(target); return; }
    if (action === 'import') { qs('#import-file', container).click(); return; }
    if (action === 'delete-account') { await openDeleteAccountSheet(); }
  });

  container.addEventListener('change', async (event) => {
    const input = event.target.closest('#import-file');
    if (!input || !input.files?.length) return;
    const file = input.files[0];
    input.value = '';
    try {
      const choice = await openImportSheet(file);
      if (!choice) return;
      const result = await runImport(choice);
      if (result) render();
    } catch (error) {
      toast(error.message || 'No hemos podido leer el archivo.', 'error');
    }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

/* -------------------------------------------------------------------------- */
/* Plantilla                                                                   */
/* -------------------------------------------------------------------------- */

function template() {
  const profile = store.state.profile || {};
  const user = store.state.user || {};
  const level = GRADE_LEVELS.find((entry) => entry.key === profile.grade_level);
  const track = TRACKS.find((entry) => entry.key === profile.track);
  const name = profile.display_name || 'Sin nombre';

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Tu cuenta</span>
          <h1 class="view__title">Ajustes</h1>
        </div>
      </div>

      <div class="flex mt-md" style="gap:14px">
        <span class="avatar avatar--lg">${esc(initials(name))}</span>
        <div class="grow">
          <p class="row__title" style="font-size:1.1rem">${esc(name)}</p>
          <p class="row__meta">${esc(user.email || '')}</p>
        </div>
      </div>

      <section class="settings-group">
        <div class="block__head"><span class="block__title">Perfil</span></div>
        ${settingRow('Nombre', name, 'edit-name')}
        ${settingRow('Curso', level ? `${level.label}${track ? ` · ${track.label}` : ''}` : 'Sin indicar', 'edit-course')}
        ${settingRow('Objetivo de nota media',
          profile.grade_goal === null || profile.grade_goal === undefined
            ? 'Sin definir'
            : `${formatScore(profile.grade_goal, 1)} sobre 10`, 'edit-goal')}
      </section>

      <section class="settings-group">
        <div class="block__head">
          <span class="block__title">Asignaturas</span>
          <button type="button" class="link-btn" data-action="add-subject">Añadir</button>
        </div>
        ${store.state.subjects.length === 0
          ? emptyState({
              title: 'No tienes asignaturas',
              text: 'Añade las que curses para poder usar el horario y las notas.',
              actionLabel: 'Añadir asignatura',
              action: 'add-subject',
            })
          : `<div class="list mt-sm">${store.state.subjects.map((subject) => `
              <div class="row" style="--row-color:${colorValue(subject.color)}">
                <span class="row__bar" aria-hidden="true"></span>
                <span class="row__main">
                  <span class="row__title">${esc(subject.name)}</span>
                  <span class="row__meta">${esc(colorLabel(subject.color))}</span>
                </span>
                <span class="row__actions">
                  <button type="button" class="icon-btn" data-edit-subject="${esc(subject.id)}"
                    aria-label="Editar ${esc(subject.name)}">${icon('editar')}</button>
                </span>
              </div>`).join('')}</div>`}
      </section>

      <section class="settings-group">
        <div class="block__head"><span class="block__title">Concentración</span></div>
        ${settingRow('Duraciones del temporizador',
          `${profile.focus_minutes || 25} min de concentración · ${profile.break_minutes || 5} min de descanso`, 'edit-timer')}
      </section>

      <section class="settings-group">
        <div class="block__head"><span class="block__title">Acceso</span></div>
        <div class="setting-row">
          <div class="setting-row__main">
            <p class="setting-row__label">Correo</p>
            <p class="setting-row__value">${esc(user.email || '')}</p>
          </div>
        </div>
        ${settingRow('Contraseña', 'Cambiar tu contraseña', 'change-password', 'Cambiar')}
        <div class="setting-row">
          <div class="setting-row__main">
            <p class="setting-row__label">Sesión</p>
            <p class="setting-row__value">Cierra la sesión en este dispositivo</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-action="logout">
            ${icon('salir', { size: 16 })} Cerrar sesión
          </button>
        </div>
      </section>

      <section class="settings-group">
        <div class="block__head"><span class="block__title">Copia de seguridad</span></div>
        <div class="setting-row">
          <div class="setting-row__main">
            <p class="setting-row__label">Exportar mis datos</p>
            <p class="setting-row__value">Un archivo JSON con tu perfil, asignaturas, horario, notas, hábitos, diario, libros, sesiones y cuentas atrás.</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-action="export">
            ${icon('exportar', { size: 16 })} Exportar
          </button>
        </div>
        <div class="setting-row">
          <div class="setting-row__main">
            <p class="setting-row__label">Importar copia de seguridad</p>
            <p class="setting-row__value">Revisamos el archivo y te preguntamos antes de tocar nada.</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-action="import">
            ${icon('importar', { size: 16 })} Importar
          </button>
          <input type="file" id="import-file" accept="application/json,.json" class="visually-hidden"
            aria-label="Elegir archivo de copia de seguridad">
        </div>
      </section>

      <section class="settings-group">
        <div class="block__head"><span class="block__title">Eliminar cuenta</span></div>
        <div class="setting-row" style="border-bottom:0">
          <div class="setting-row__main">
            <p class="setting-row__label">Eliminar mi cuenta</p>
            <p class="setting-row__value">Se borran tu cuenta y todos tus datos. No se puede deshacer.</p>
          </div>
          <button type="button" class="btn btn--danger btn--sm" data-action="delete-account">Eliminar</button>
        </div>
      </section>
    </div>`;
}

function settingRow(label, value, action, buttonLabel = 'Cambiar') {
  return `
    <div class="setting-row">
      <div class="setting-row__main">
        <p class="setting-row__label">${esc(label)}</p>
        <p class="setting-row__value">${esc(value)}</p>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="${esc(action)}">${esc(buttonLabel)}</button>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Hojas de edicion                                                            */
/* -------------------------------------------------------------------------- */

async function openNameSheet() {
  const current = store.state.profile?.display_name || '';
  const result = await openSheet({
    title: 'Tu nombre',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="name">Nombre</label>
          <input class="input" id="name" type="text" maxlength="60" value="${esc(current)}" aria-describedby="name-error">
          <p class="field__error" id="name-error" hidden></p>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const value = qs('#name', dialog).value.trim();
        const error = qs('#name-error', dialog);
        if (value.length < 2) {
          error.textContent = 'Escribe tu nombre.';
          error.hidden = false;
          return;
        }
        try {
          await store.updateProfile({ display_name: value });
          close(true);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
  if (result) toast('Nombre actualizado');
}

async function openCourseSheet() {
  const profile = store.state.profile || {};
  let gradeLevel = profile.grade_level || null;
  let stage = profile.stage || null;
  let track = profile.track || null;

  const result = await openSheet({
    title: 'Curso',
    wide: true,
    body: `<form novalidate><div id="course-body"></div>
      <p class="field__error mt-md" id="course-error" hidden></p></form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      const body = qs('#course-body', dialog);
      const paint = () => {
        body.innerHTML = `
          <p class="block__title" style="margin-bottom:10px">ESO</p>
          <div class="choice-grid">
            ${GRADE_LEVELS.filter((l) => l.stage === 'eso').map((l) => choice(l.key, l.label, gradeLevel === l.key)).join('')}
          </div>
          <p class="block__title" style="margin:18px 0 10px">Bachillerato</p>
          <div class="choice-grid">
            ${GRADE_LEVELS.filter((l) => l.stage === 'bachillerato').map((l) => choice(l.key, l.label, gradeLevel === l.key)).join('')}
          </div>
          ${stage === 'bachillerato' ? `
            <p class="block__title" style="margin:18px 0 10px">Modalidad</p>
            <div class="choice-grid">
              ${TRACKS.map((t) => choice(`track:${t.key}`, t.label, track === t.key)).join('')}
            </div>` : ''}`;
      };
      paint();

      body.addEventListener('click', (event) => {
        const button = event.target.closest('.choice[data-value]');
        if (!button) return;
        const value = button.dataset.value;
        if (value.startsWith('track:')) {
          track = value.slice(6);
        } else {
          gradeLevel = value;
          stage = GRADE_LEVELS.find((l) => l.key === value).stage;
          if (stage !== 'bachillerato') track = null;
        }
        paint();
      });

      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const error = qs('#course-error', dialog);
        error.hidden = true;
        if (!gradeLevel) {
          error.textContent = 'Elige tu curso.';
          error.hidden = false;
          return;
        }
        if (stage === 'bachillerato' && !track) {
          error.textContent = 'Elige también tu modalidad.';
          error.hidden = false;
          return;
        }
        try {
          await store.updateProfile({ grade_level: gradeLevel, stage, track });
          close(true);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
  if (result) toast('Curso actualizado');
}

function choice(value, label, selected) {
  return `
    <button type="button" class="choice ${selected ? 'is-selected' : ''}" data-value="${esc(value)}"
      aria-pressed="${selected ? 'true' : 'false'}">
      <span class="choice__tick" aria-hidden="true"></span><span>${esc(label)}</span>
    </button>`;
}

async function openGoalSheet() {
  const current = store.state.profile?.grade_goal;
  const value = current === null || current === undefined ? 7 : Number(current);
  const result = await openSheet({
    title: 'Objetivo de nota media',
    body: `
      <form novalidate>
        <p class="focus-time" id="goal-value" style="font-size:2.6rem" aria-hidden="true">${esc(formatScore(value, 1))}</p>
        <label class="field__label" for="goal">Objetivo sobre 10</label>
        <input type="range" id="goal" min="0" max="10" step="0.5" value="${value}" style="width:100%" aria-describedby="goal-desc">
        <div class="flex-between small muted mt-sm"><span>0</span><span>10</span></div>
        <p class="field__hint" id="goal-desc">Es una referencia tuya. Puedes cambiarla cuando quieras.</p>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      const range = qs('#goal', dialog);
      const display = qs('#goal-value', dialog);
      range.addEventListener('input', () => { display.textContent = formatScore(parseScore(range.value), 1); });
      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        try {
          await store.updateProfile({ grade_goal: parseScore(range.value) });
          close(true);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
  if (result) toast('Objetivo actualizado');
}

async function openTimerSheet() {
  const profile = store.state.profile || {};
  const result = await openSheet({
    title: 'Duraciones del temporizador',
    body: `
      <form novalidate>
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="focus-min">Concentración (min)</label>
            <input class="input" id="focus-min" type="number" min="1" max="180" step="1" value="${profile.focus_minutes || 25}">
          </div>
          <div class="field">
            <label class="field__label" for="break-min">Descanso (min)</label>
            <input class="input" id="break-min" type="number" min="1" max="60" step="1" value="${profile.break_minutes || 5}">
          </div>
        </div>
        <p class="field__error" id="timer-error" hidden></p>
        <p class="field__hint">Por defecto son 25 y 5 minutos.</p>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const focusMinutes = Number(qs('#focus-min', dialog).value);
        const breakMinutes = Number(qs('#break-min', dialog).value);
        const error = qs('#timer-error', dialog);
        error.hidden = true;
        if (!Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 180
          || !Number.isInteger(breakMinutes) || breakMinutes < 1 || breakMinutes > 60) {
          error.textContent = 'Concentración entre 1 y 180 minutos; descanso entre 1 y 60.';
          error.hidden = false;
          return;
        }
        try {
          await store.updateProfile({ focus_minutes: focusMinutes, break_minutes: breakMinutes });
          close(true);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  });
  if (result) toast('Duraciones guardadas');
}

async function openPasswordSheet() {
  const email = store.state.user?.email;
  const result = await openSheet({
    title: 'Cambiar contraseña',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="current">Contraseña actual</label>
          <input class="input" id="current" type="password" autocomplete="current-password" aria-describedby="current-error">
          <p class="field__error" id="current-error" hidden></p>
        </div>
        <div class="field">
          <label class="field__label" for="next">Contraseña nueva</label>
          <input class="input" id="next" type="password" autocomplete="new-password" aria-describedby="next-error">
          <p class="field__error" id="next-error" hidden></p>
        </div>
        <div class="field">
          <label class="field__label" for="repeat">Repite la contraseña nueva</label>
          <input class="input" id="repeat" type="password" autocomplete="new-password" aria-describedby="repeat-error">
          <p class="field__error" id="repeat-error" hidden></p>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-save>Guardar</button>`,
    onMount: (dialog, close) => {
      const saveButton = dialog.querySelector('[data-save]');
      saveButton.addEventListener('click', async () => {
        const current = qs('#current', dialog).value;
        const next = qs('#next', dialog).value;
        const repeat = qs('#repeat', dialog).value;
        const errors = {
          current: current ? null : 'Escribe tu contraseña actual.',
          next: validatePassword(next),
          repeat: validateMatch(next, repeat),
        };
        let invalid = false;
        for (const [id, message] of Object.entries(errors)) {
          const node = qs(`#${id}-error`, dialog);
          node.hidden = !message;
          if (message) { node.textContent = message; invalid = true; }
        }
        if (invalid) return;

        setBusy(saveButton, true, 'Guardando');
        try {
          const supabase = await getSupabase();
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
          if (signInError) {
            setBusy(saveButton, false);
            const node = qs('#current-error', dialog);
            node.textContent = 'Esa no es tu contraseña actual.';
            node.hidden = false;
            return;
          }
          const { error } = await supabase.auth.updateUser({ password: next });
          if (error) throw error;
          close(true);
        } catch (error) {
          setBusy(saveButton, false);
          toast(translateAuthError(error), 'error');
        }
      });
    },
  });
  if (result) toast('Contraseña actualizada');
}

/* -------------------------------------------------------------------------- */
/* Copia de seguridad                                                          */
/* -------------------------------------------------------------------------- */

async function handleExport(button) {
  setBusy(button, true, 'Preparando');
  try {
    const total = await exportData();
    setBusy(button, false);
    toast(`Copia descargada con ${total} registros`);
  } catch (error) {
    setBusy(button, false);
    toast(error.message || 'No hemos podido exportar tus datos.', 'error');
  }
}

async function runImport({ backup, replace }) {
  if (replace) {
    const ok = await confirmDialog({
      title: '¿Reemplazar todos tus datos?',
      message: 'Vamos a borrar lo que tienes ahora en Trazia y dejar solo el contenido de la copia. Esto no se puede deshacer.',
      confirmLabel: 'Sí, reemplazar',
      danger: true,
    });
    if (!ok) return null;
  }

  toast('Importando…');
  try {
    const { created, skipped } = await importBackup(backup, { replace });
    const total = Object.values(created).reduce((sum, value) => sum + value, 0);
    const detail = Object.entries(created)
      .map(([table, count]) => `${count} ${TABLE_LABELS[table]}`)
      .join(', ');
    toast(total > 0 ? `Importado: ${detail}` : 'La copia no tenía registros válidos.');
    if (skipped > 0) {
      setTimeout(() => toast(`${skipped} registros no se han importado por no ser válidos.`, 'error'), 600);
    }
    return true;
  } catch (error) {
    toast(error.message || 'No hemos podido importar la copia.', 'error');
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Eliminar cuenta                                                             */
/* -------------------------------------------------------------------------- */

async function openDeleteAccountSheet() {
  const confirmed = await openSheet({
    title: 'Eliminar tu cuenta',
    body: `
      <div class="notice notice--error" role="alert">
        <span class="notice__icon">${icon('aviso', { size: 19 })}</span>
        <div>
          <strong>Esto no se puede deshacer</strong>
          <span>Se eliminarán tu cuenta y todos tus datos: asignaturas, horario, notas,
          hábitos, diario, libros, sesiones de concentración y cuentas atrás.</span>
        </div>
      </div>
      <p class="muted small mt-md">Si quieres guardar una copia antes, cierra esto y usa “Exportar mis datos”.</p>
      <form novalidate class="mt-md">
        <div class="field">
          <label class="field__label" for="confirm-word">Escribe ELIMINAR para confirmar</label>
          <input class="input" id="confirm-word" type="text" autocomplete="off" aria-describedby="confirm-word-error">
          <p class="field__error" id="confirm-word-error" hidden></p>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--danger" data-delete>Eliminar cuenta</button>`,
    onMount: (dialog, close) => {
      const button = dialog.querySelector('[data-delete]');
      button.addEventListener('click', async () => {
        const value = qs('#confirm-word', dialog).value.trim().toUpperCase();
        const error = qs('#confirm-word-error', dialog);
        if (value !== 'ELIMINAR') {
          error.textContent = 'Escribe ELIMINAR para confirmar.';
          error.hidden = false;
          return;
        }
        error.hidden = true;
        setBusy(button, true, 'Eliminando');
        try {
          await store.deleteAccount();
          close(true);
        } catch (err) {
          setBusy(button, false);
          toast(err.message, 'error');
        }
      });
    },
  });

  if (confirmed) {
    await signOut().catch(() => {});
    store.reset();
    window.location.replace('index.html');
  }
}

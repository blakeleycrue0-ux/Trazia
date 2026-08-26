/**
 * Copia de seguridad: exportar todos los datos a JSON y volver a importarlos.
 *
 * La importacion nunca sobreescribe en silencio: se valida el archivo, se
 * enseña un resumen de lo que contiene y se pide confirmacion explicita antes
 * de reemplazar nada.
 */
import * as store from './store.js';
import { esc, openSheet, qs, icon } from './ui.js';
import { formatNumber } from './format.js';

const FORMAT = 'trazia.backup';
const VERSION = 1;

const TABLES = [
  'subjects', 'schedule_items', 'grades', 'habits', 'habit_completions',
  'journal_entries', 'books', 'focus_sessions', 'countdowns',
];

const TABLE_LABELS = {
  subjects: 'asignaturas',
  schedule_items: 'clases, exámenes y entregas',
  grades: 'notas',
  habits: 'hábitos',
  habit_completions: 'días completados',
  journal_entries: 'entradas del diario',
  books: 'libros',
  focus_sessions: 'sesiones de concentración',
  countdowns: 'cuentas atrás',
};

const PROFILE_FIELDS = [
  'display_name', 'stage', 'grade_level', 'track', 'grade_goal', 'focus_minutes', 'break_minutes',
];

/* -------------------------------------------------------------------------- */
/* Exportar                                                                    */
/* -------------------------------------------------------------------------- */

export async function exportData() {
  const { profile, tables } = await store.fetchAllForExport();
  const payload = {
    format: FORMAT,
    version: VERSION,
    exported_at: new Date().toISOString(),
    profile: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile?.[field] ?? null])),
    data: tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `trazia-copia-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const total = TABLES.reduce((sum, table) => sum + (tables[table]?.length || 0), 0);
  return total;
}

/* -------------------------------------------------------------------------- */
/* Validar                                                                     */
/* -------------------------------------------------------------------------- */

export function validateBackup(raw) {
  const errors = [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { valid: false, errors: ['El archivo no es un JSON válido.'] };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['El archivo está vacío o no tiene el formato esperado.'] };
  }
  if (parsed.format !== FORMAT) {
    errors.push('El archivo no parece una copia de seguridad de Trazia.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > VERSION) {
    errors.push('La copia se hizo con una versión más nueva de Trazia.');
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    errors.push('La copia no contiene datos.');
  }
  if (errors.length) return { valid: false, errors };

  const counts = {};
  for (const table of TABLES) {
    const rows = parsed.data[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      errors.push(`La sección “${TABLE_LABELS[table]}” está dañada.`);
      continue;
    }
    counts[table] = Array.isArray(rows) ? rows.length : 0;
  }
  if (errors.length) return { valid: false, errors };

  return { valid: true, errors: [], backup: parsed, counts };
}

/* -------------------------------------------------------------------------- */
/* Importar                                                                    */
/* -------------------------------------------------------------------------- */

function clean(row, fields) {
  const out = {};
  for (const field of fields) {
    if (row[field] !== undefined) out[field] = row[field];
  }
  return out;
}

function isText(value, max = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/**
 * Inserta el contenido de la copia. Devuelve el recuento de filas creadas por
 * tabla y las que se han descartado por no ser validas.
 */
export async function importBackup(backup, { replace }) {
  const userId = store.state.user.id;
  const data = backup.data || {};
  const created = {};
  let skipped = 0;

  if (replace) await store.deleteAllUserData();

  // 1. Asignaturas (el resto de tablas las referencian).
  const subjectMap = new Map();
  const subjectRows = (data.subjects || []).filter((row) => isText(row?.name, 60));
  skipped += (data.subjects || []).length - subjectRows.length;
  if (subjectRows.length) {
    const payload = subjectRows.map((row, index) => ({
      user_id: userId,
      name: row.name.trim().slice(0, 60),
      color: typeof row.color === 'string' ? row.color : 'indigo',
      position: Number.isInteger(row.position) ? row.position : index,
    }));
    const inserted = await store.insertRows('subjects', payload);
    inserted.forEach((row, index) => subjectMap.set(subjectRows[index].id, row.id));
    created.subjects = inserted.length;
  }

  const mapSubject = (id) => (id && subjectMap.has(id) ? subjectMap.get(id) : null);

  // 2. Horario.
  const scheduleRows = [];
  for (const row of data.schedule_items || []) {
    if (!row || !['class', 'exam', 'assignment'].includes(row.kind)) { skipped++; continue; }
    if (row.kind === 'class') {
      if (!Number.isInteger(row.weekday) || !row.start_time || !row.end_time) { skipped++; continue; }
    } else if (!row.event_date || !isText(row.title, 120)) { skipped++; continue; }
    scheduleRows.push({
      user_id: userId,
      subject_id: mapSubject(row.subject_id),
      kind: row.kind,
      title: row.title || null,
      weekday: row.kind === 'class' ? row.weekday : null,
      start_time: row.kind === 'class' ? row.start_time : null,
      end_time: row.kind === 'class' ? row.end_time : null,
      room: row.room || null,
      event_date: row.kind === 'class' ? null : row.event_date,
      event_time: row.kind === 'class' ? null : (row.event_time || null),
      status: row.status === 'done' ? 'done' : 'pending',
      notes: row.notes || null,
    });
  }
  if (scheduleRows.length) {
    created.schedule_items = (await store.insertRows('schedule_items', scheduleRows)).length;
  }

  // 3. Notas (necesitan una asignatura existente).
  const gradeRows = [];
  for (const row of data.grades || []) {
    const subjectId = mapSubject(row?.subject_id);
    const score = Number(row?.score);
    const weight = Number(row?.weight);
    if (!subjectId || !isText(row?.title, 120) || !(score >= 0 && score <= 10) || !(weight > 0 && weight <= 100)) {
      skipped++;
      continue;
    }
    gradeRows.push({
      user_id: userId,
      subject_id: subjectId,
      title: row.title.trim().slice(0, 120),
      score,
      weight,
      graded_on: row.graded_on || null,
    });
  }
  if (gradeRows.length) created.grades = (await store.insertRows('grades', gradeRows)).length;

  // 4. Habitos y sus dias completados.
  const habitMap = new Map();
  const habitRows = (data.habits || []).filter(
    (row) => isText(row?.name, 80) && Array.isArray(row.weekdays) && row.weekdays.length > 0
      && row.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  skipped += (data.habits || []).length - habitRows.length;
  if (habitRows.length) {
    const inserted = await store.insertRows('habits', habitRows.map((row) => ({
      user_id: userId,
      name: row.name.trim().slice(0, 80),
      color: typeof row.color === 'string' ? row.color : 'lavanda',
      weekdays: row.weekdays,
    })));
    inserted.forEach((row, index) => habitMap.set(habitRows[index].id, row.id));
    created.habits = inserted.length;
  }

  const completionRows = [];
  const seen = new Set();
  for (const row of data.habit_completions || []) {
    const habitId = habitMap.get(row?.habit_id);
    const date = typeof row?.completed_on === 'string' ? row.completed_on.slice(0, 10) : null;
    const key = `${habitId}|${date}`;
    if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || seen.has(key)) { skipped++; continue; }
    seen.add(key);
    completionRows.push({ user_id: userId, habit_id: habitId, completed_on: date });
  }
  if (completionRows.length) {
    created.habit_completions = (await store.insertRows('habit_completions', completionRows)).length;
  }

  // 5. Diario, libros, concentracion y cuentas atras.
  const journalRows = (data.journal_entries || []).filter((row) => isText(row?.content, 20000)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(row?.entry_date || '').slice(0, 10)));
  skipped += (data.journal_entries || []).length - journalRows.length;
  if (journalRows.length) {
    created.journal_entries = (await store.insertRows('journal_entries', journalRows.map((row) => ({
      user_id: userId,
      entry_date: row.entry_date.slice(0, 10),
      title: row.title || null,
      content: row.content,
    })))).length;
  }

  const bookRows = (data.books || []).filter((row) => isText(row?.title, 200));
  skipped += (data.books || []).length - bookRows.length;
  if (bookRows.length) {
    created.books = (await store.insertRows('books', bookRows.map((row) => ({
      user_id: userId,
      title: row.title.trim().slice(0, 200),
      author: row.author || null,
      status: ['quiero_leer', 'leyendo', 'terminado'].includes(row.status) ? row.status : 'quiero_leer',
    })))).length;
  }

  const focusRows = (data.focus_sessions || []).filter((row) => {
    const seconds = Number(row?.focus_seconds);
    return seconds > 0 && seconds <= 86400 && !Number.isNaN(Date.parse(row?.started_at));
  });
  skipped += (data.focus_sessions || []).length - focusRows.length;
  if (focusRows.length) {
    created.focus_sessions = (await store.insertRows('focus_sessions', focusRows.map((row) => ({
      user_id: userId,
      subject_id: mapSubject(row.subject_id),
      started_at: row.started_at,
      ended_at: row.ended_at && !Number.isNaN(Date.parse(row.ended_at)) ? row.ended_at : row.started_at,
      focus_seconds: Math.round(Number(row.focus_seconds)),
    })))).length;
  }

  const countdownRows = (data.countdowns || []).filter(
    (row) => isText(row?.name, 80) && !Number.isNaN(Date.parse(row?.target_at)),
  );
  skipped += (data.countdowns || []).length - countdownRows.length;
  if (countdownRows.length) {
    created.countdowns = (await store.insertRows('countdowns', countdownRows.map((row) => ({
      user_id: userId,
      name: row.name.trim().slice(0, 80),
      target_at: new Date(row.target_at).toISOString(),
      has_time: Boolean(row.has_time),
    })))).length;
  }

  // 6. Perfil (solo si se reemplaza: en modo añadir no tocamos tus ajustes).
  if (replace && backup.profile && typeof backup.profile === 'object') {
    const patch = clean(backup.profile, PROFILE_FIELDS);
    if (Object.keys(patch).length) {
      await store.updateProfile(patch);
    }
  }

  await store.reload();
  return { created, skipped };
}

/* -------------------------------------------------------------------------- */
/* Dialogo de importacion                                                      */
/* -------------------------------------------------------------------------- */

export async function openImportSheet(file) {
  const text = await file.text();
  const result = validateBackup(text);

  if (!result.valid) {
    await openSheet({
      title: 'No podemos usar este archivo',
      body: `<div class="notice notice--error" role="alert">
        <span class="notice__icon">${icon('aviso', { size: 19 })}</span>
        <div><strong>La copia no es válida</strong><span>${esc(result.errors.join(' '))}</span></div>
      </div>`,
      footer: '<button type="button" class="btn btn--ghost" data-sheet-close>Cerrar</button>',
    });
    return null;
  }

  const { backup, counts } = result;
  const summary = TABLES
    .filter((table) => counts[table] > 0)
    .map((table) => `<div class="summary-item"><dt>${esc(TABLE_LABELS[table])}</dt><dd>${esc(formatNumber(counts[table]))}</dd></div>`)
    .join('');
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const choice = await openSheet({
    title: 'Importar copia de seguridad',
    wide: true,
    body: `
      <p class="muted">La copia es del ${esc(new Date(backup.exported_at || Date.now()).toLocaleDateString('es-ES'))}
      y contiene ${esc(formatNumber(total))} registros.</p>
      ${summary ? `<dl class="summary-list">${summary}</dl>` : '<p class="muted mt-md">La copia no contiene registros.</p>'}
      <fieldset class="mt-lg">
        <legend class="field__label">Qué hacemos con lo que ya tienes</legend>
        <div class="stack mt-sm">
          <label class="choice">
            <input type="radio" name="import-mode" value="merge" checked>
            <span class="choice__tick" aria-hidden="true"></span>
            <span><strong>Añadir a mis datos</strong><br>
              <span class="small muted">Se suman a lo que ya tienes. No se borra nada.</span></span>
          </label>
          <label class="choice">
            <input type="radio" name="import-mode" value="replace">
            <span class="choice__tick" aria-hidden="true"></span>
            <span><strong>Reemplazar todo</strong><br>
              <span class="small muted">Se borran tus datos actuales y se dejan solo los de la copia.</span></span>
          </label>
        </div>
      </fieldset>
      <div id="import-warning" class="notice notice--error mt-md" role="alert" hidden>
        <span class="notice__icon">${icon('aviso', { size: 19 })}</span>
        <div><strong>Esto borra tus datos actuales</strong>
        <span>Se eliminarán tus asignaturas, horario, notas, hábitos, diario, libros, sesiones y cuentas atrás antes de importar.</span></div>
      </div>`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
      <button type="button" class="btn btn--primary" data-import>Importar</button>`,
    onMount: (dialog, close) => {
      const warning = qs('#import-warning', dialog);
      dialog.querySelectorAll('[name="import-mode"]').forEach((input) => {
        input.addEventListener('change', () => { warning.hidden = input.value !== 'replace'; });
      });
      dialog.querySelector('[data-import]').addEventListener('click', () => {
        const mode = dialog.querySelector('[name="import-mode"]:checked').value;
        close(mode);
      });
    },
  });

  if (!choice) return null;
  return { backup, replace: choice === 'replace' };
}

export { TABLE_LABELS };

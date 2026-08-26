/**
 * Formularios compartidos de Trazia.
 *
 * Cada editor abre una hoja modal, valida en el propio formulario y solo cierra
 * cuando el servidor confirma el guardado. Asi nunca mostramos como guardado
 * algo que no lo esta.
 */
import {
  esc, icon, openSheet, confirmDialog, toast, setBusy, qs,
  SUBJECT_COLORS, colorValue, colorLabel,
} from './ui.js';
import { WEEKDAYS, WEEKDAYS_SHORT, todayISO, parseScore, formatScore, minutesToTime } from './format.js';
import * as store from './store.js';

/* -------------------------------------------------------------------------- */
/* Piezas reutilizables                                                        */
/* -------------------------------------------------------------------------- */

export function fieldError(id) {
  return `<p class="field__error" id="${id}-error" hidden></p>`;
}

export function showError(root, id, message) {
  const input = qs(`#${id}`, root);
  const error = qs(`#${id}-error`, root);
  if (!error) return;
  if (message) {
    if (input) input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
  } else {
    if (input) input.removeAttribute('aria-invalid');
    error.hidden = true;
  }
}

/** Aplica un mapa {campo: mensaje} y devuelve true si todo es valido. */
export function applyErrors(root, errors) {
  let firstInvalid = null;
  for (const [id, message] of Object.entries(errors)) {
    showError(root, id, message);
    if (message && !firstInvalid) firstInvalid = qs(`#${id}`, root);
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

export function subjectSelect({ id = 'subject', selected = '', required = true, emptyLabel = 'Sin asignatura' }) {
  const subjects = store.state.subjects;
  const options = subjects.map((subject) => `
    <option value="${esc(subject.id)}" ${subject.id === selected ? 'selected' : ''}>${esc(subject.name)}</option>`).join('');
  return `
    <div class="field">
      <label class="field__label" for="${id}">Asignatura${required ? '' : ' <span class="muted">(opcional)</span>'}</label>
      <select class="select" id="${id}" name="${id}" aria-describedby="${id}-error">
        ${required ? '<option value="">Elige una asignatura</option>' : `<option value="">${esc(emptyLabel)}</option>`}
        ${options}
      </select>
      ${fieldError(id)}
    </div>`;
}

export function colorPicker({ selected = 'indigo', id = 'color' }) {
  return `
    <div class="field">
      <span class="field__label" id="${id}-label">Color</span>
      <div class="color-picker" role="radiogroup" aria-labelledby="${id}-label" data-color-picker="${id}">
        ${SUBJECT_COLORS.map((color) => `
          <button type="button" class="color-swatch" role="radio" data-color="${color.key}"
            aria-checked="${color.key === selected ? 'true' : 'false'}"
            aria-pressed="${color.key === selected ? 'true' : 'false'}"
            aria-label="${esc(color.label)}"
            style="--swatch:${color.value}"></button>`).join('')}
      </div>
      <input type="hidden" id="${id}" name="${id}" value="${esc(selected)}">
    </div>`;
}

export function wireColorPicker(root) {
  root.querySelectorAll('[data-color-picker]').forEach((group) => {
    const hidden = qs(`#${group.dataset.colorPicker}`, root);
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      group.querySelectorAll('[data-color]').forEach((swatch) => {
        const isTarget = swatch === button;
        swatch.setAttribute('aria-checked', String(isTarget));
        swatch.setAttribute('aria-pressed', String(isTarget));
      });
      hidden.value = button.dataset.color;
    });
  });
}

export function weekdayPicker({ selected = [0, 1, 2, 3, 4], id = 'weekdays' }) {
  return `
    <fieldset class="field">
      <legend class="field__label">Días</legend>
      <div class="weekday-picker" data-weekday-picker="${id}">
        ${WEEKDAYS_SHORT.map((short, index) => `
          <label class="weekday" title="${esc(WEEKDAYS[index])}">
            <input type="checkbox" name="${id}" value="${index}" ${selected.includes(index) ? 'checked' : ''}>
            <span aria-hidden="true">${short}</span>
            <span class="visually-hidden">${esc(WEEKDAYS[index])}</span>
          </label>`).join('')}
      </div>
      ${fieldError(id)}
    </fieldset>`;
}

export function readWeekdays(root, id = 'weekdays') {
  return Array.from(root.querySelectorAll(`[data-weekday-picker="${id}"] input:checked`))
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
}

function footerButtons({ saveLabel = 'Guardar', deletable = false }) {
  return `
    ${deletable ? '<button type="button" class="btn btn--danger" data-delete>Eliminar</button>' : ''}
    <button type="button" class="btn btn--ghost" data-sheet-close>Cancelar</button>
    <button type="button" class="btn btn--primary" data-save>${esc(saveLabel)}</button>`;
}

/**
 * Conecta el pie de la hoja con el formulario y gestiona el estado de guardado.
 * onSubmit debe lanzar una excepcion si algo va mal; si devuelve un valor, se
 * cierra la hoja con ese valor.
 */
function wireSheet(dialog, close, { onSubmit, onDelete }) {
  const form = qs('form', dialog);
  const saveButton = dialog.querySelector('[data-save]');
  const deleteButton = dialog.querySelector('[data-delete]');

  const submit = async () => {
    setBusy(saveButton, true, 'Guardando');
    try {
      const result = await onSubmit(form, dialog);
      if (result === false) {
        setBusy(saveButton, false);
        return;
      }
      close(result ?? true);
    } catch (error) {
      setBusy(saveButton, false);
      toast(error.message || 'No hemos podido guardar.', 'error');
    }
  };

  saveButton?.addEventListener('click', submit);
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });

  if (deleteButton && onDelete) {
    deleteButton.addEventListener('click', async () => {
      setBusy(deleteButton, true, 'Eliminando');
      try {
        const result = await onDelete();
        if (result === false) { setBusy(deleteButton, false); return; }
        close('deleted');
      } catch (error) {
        setBusy(deleteButton, false);
        toast(error.message || 'No hemos podido eliminar.', 'error');
      }
    });
  }

  wireColorPicker(dialog);
}

/* -------------------------------------------------------------------------- */
/* Asignaturas                                                                 */
/* -------------------------------------------------------------------------- */

export function openSubjectSheet(subject = null) {
  const editing = Boolean(subject);
  return openSheet({
    title: editing ? 'Editar asignatura' : 'Nueva asignatura',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="name">Nombre</label>
          <input class="input" id="name" name="name" type="text" maxlength="60"
            placeholder="Matemáticas" value="${esc(subject?.name || '')}" aria-describedby="name-error">
          ${fieldError('name')}
        </div>
        ${colorPicker({ selected: subject?.color || 'indigo' })}
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const name = qs('#name', form).value.trim();
        const color = qs('#color', form).value;
        if (!applyErrors(dialog, { name: name ? null : 'Escribe un nombre.' })) return false;
        if (editing) return store.updateSubject(subject.id, { name, color });
        return store.createSubject({ name, color });
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: `Eliminar ${subject.name}`,
          message: 'Se eliminarán también sus notas. Las clases de tu horario se quedarán sin asignatura.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteSubject(subject.id);
        toast('Asignatura eliminada');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Clases del horario                                                          */
/* -------------------------------------------------------------------------- */

export function openClassSheet(item = null, { weekday = 0 } = {}) {
  const editing = Boolean(item);
  const hasSubjects = store.state.subjects.length > 0;
  const defaultStart = item?.start_time ? String(item.start_time).slice(0, 5) : '08:00';
  const defaultEnd = item?.end_time ? String(item.end_time).slice(0, 5) : '09:00';

  return openSheet({
    title: editing ? 'Editar clase' : 'Nueva clase',
    body: `
      <form novalidate>
        ${hasSubjects ? subjectSelect({ selected: item?.subject_id || '', required: true }) : `
          <div class="notice notice--info">
            <span class="notice__icon">${icon('info', { size: 19 })}</span>
            <div><strong>Primero necesitas una asignatura</strong>
            <span>Crea al menos una asignatura para poder añadir clases.</span></div>
          </div>`}
        ${hasSubjects ? `
          <div class="field">
            <label class="field__label" for="weekday">Día</label>
            <select class="select" id="weekday" name="weekday">
              ${WEEKDAYS.map((day, index) => `
                <option value="${index}" ${index === (item?.weekday ?? weekday) ? 'selected' : ''}>${esc(day.charAt(0).toUpperCase() + day.slice(1))}</option>`).join('')}
            </select>
          </div>
          <div class="field-row field-row--2">
            <div class="field">
              <label class="field__label" for="start">Empieza</label>
              <input class="input" id="start" name="start" type="time" value="${esc(defaultStart)}" step="300" aria-describedby="start-error">
              ${fieldError('start')}
            </div>
            <div class="field">
              <label class="field__label" for="end">Termina</label>
              <input class="input" id="end" name="end" type="time" value="${esc(defaultEnd)}" step="300" aria-describedby="end-error">
              ${fieldError('end')}
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="room">Aula <span class="muted">(opcional)</span></label>
            <input class="input" id="room" name="room" type="text" maxlength="40"
              placeholder="B12" value="${esc(item?.room || '')}">
          </div>` : ''}
      </form>`,
    footer: hasSubjects ? footerButtons({ deletable: editing }) : '<button type="button" class="btn btn--ghost" data-sheet-close>Cerrar</button>',
    onMount: (dialog, close) => {
      if (!hasSubjects) return;
      wireSheet(dialog, close, {
        onSubmit: async (form) => {
          const subjectId = qs('#subject', form).value;
          const start = qs('#start', form).value;
          const end = qs('#end', form).value;
          const room = qs('#room', form).value.trim();
          const errors = {
            subject: subjectId ? null : 'Elige una asignatura.',
            start: start ? null : 'Indica la hora de inicio.',
            end: !end ? 'Indica la hora de fin.' : (end <= start ? 'Debe ser posterior al inicio.' : null),
          };
          if (!applyErrors(dialog, errors)) return false;
          const payload = {
            kind: 'class',
            subject_id: subjectId,
            weekday: Number(qs('#weekday', form).value),
            start_time: start,
            end_time: end,
            room: room || null,
            title: null,
          };
          if (editing) return store.updateScheduleItem(item.id, payload);
          return store.createScheduleItem(payload);
        },
        onDelete: editing ? async () => {
          const ok = await confirmDialog({
            title: 'Eliminar clase',
            message: 'Esta clase desaparecerá de tu horario.',
            confirmLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return false;
          await store.deleteScheduleItem(item.id);
          toast('Clase eliminada');
          return true;
        } : null,
      });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Examenes y entregas                                                         */
/* -------------------------------------------------------------------------- */

export function openEventSheet(kind, item = null, { date } = {}) {
  const editing = Boolean(item);
  const isExam = kind === 'exam';
  const label = isExam ? 'examen' : 'entrega';

  return openSheet({
    title: editing ? `Editar ${label}` : (isExam ? 'Nuevo examen' : 'Nueva entrega'),
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="title">Título</label>
          <input class="input" id="title" name="title" type="text" maxlength="120"
            placeholder="${isExam ? 'Examen tema 4' : 'Trabajo de literatura'}"
            value="${esc(item?.title || '')}" aria-describedby="title-error">
          ${fieldError('title')}
        </div>
        ${subjectSelect({ selected: item?.subject_id || '', required: false })}
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="date">Fecha</label>
            <input class="input" id="date" name="date" type="date"
              value="${esc(item?.event_date || date || todayISO())}" aria-describedby="date-error">
            ${fieldError('date')}
          </div>
          <div class="field">
            <label class="field__label" for="time">Hora <span class="muted">(opcional)</span></label>
            <input class="input" id="time" name="time" type="time" step="300"
              value="${esc(item?.event_time ? String(item.event_time).slice(0, 5) : '')}">
          </div>
        </div>
        ${!isExam ? `
          <label class="switch mt-sm">
            <input type="checkbox" id="done" name="done" ${item?.status === 'done' ? 'checked' : ''}>
            <span class="switch__track" aria-hidden="true"></span>
            <span>Ya está entregada</span>
          </label>` : ''}
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const title = qs('#title', form).value.trim();
        const dateValue = qs('#date', form).value;
        const errors = {
          title: title ? null : 'Escribe un título.',
          date: dateValue ? null : 'Elige una fecha.',
        };
        if (!applyErrors(dialog, errors)) return false;
        const payload = {
          kind,
          title,
          subject_id: qs('#subject', form).value || null,
          event_date: dateValue,
          event_time: qs('#time', form).value || null,
          status: isExam ? 'pending' : (qs('#done', form)?.checked ? 'done' : 'pending'),
        };
        if (editing) return store.updateScheduleItem(item.id, payload);
        return store.createScheduleItem(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: `Eliminar ${label}`,
          message: 'Se quitará de tu horario y de tu inicio.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteScheduleItem(item.id);
        toast(isExam ? 'Examen eliminado' : 'Entrega eliminada');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Notas                                                                       */
/* -------------------------------------------------------------------------- */

export function openGradeSheet(grade = null, { subjectId = '' } = {}) {
  const editing = Boolean(grade);
  if (store.state.subjects.length === 0) {
    return openSheet({
      title: 'Necesitas una asignatura',
      body: `<p class="muted">Para apuntar una nota primero tienes que crear la asignatura a la que pertenece.</p>`,
      footer: '<button type="button" class="btn btn--ghost" data-sheet-close>Cerrar</button>',
    });
  }

  return openSheet({
    title: editing ? 'Editar nota' : 'Nueva nota',
    body: `
      <form novalidate>
        ${subjectSelect({ selected: grade?.subject_id || subjectId, required: true })}
        <div class="field">
          <label class="field__label" for="title">Examen o trabajo</label>
          <input class="input" id="title" name="title" type="text" maxlength="120"
            placeholder="Examen tema 3" value="${esc(grade?.title || '')}" aria-describedby="title-error">
          ${fieldError('title')}
        </div>
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="score">Nota (0 a 10)</label>
            <input class="input" id="score" name="score" type="text" inputmode="decimal"
              placeholder="7,5" value="${grade ? esc(formatScore(grade.score)) : ''}" aria-describedby="score-error">
            ${fieldError('score')}
          </div>
          <div class="field">
            <label class="field__label" for="weight">Peso (%)</label>
            <input class="input" id="weight" name="weight" type="number" min="1" max="100" step="1"
              value="${esc(grade?.weight ? Math.round(Number(grade.weight)) : 100)}" aria-describedby="weight-error">
            ${fieldError('weight')}
            <p class="field__hint">Cuánto pesa dentro de la asignatura.</p>
          </div>
        </div>
        <div class="field">
          <label class="field__label" for="date">Fecha <span class="muted">(opcional)</span></label>
          <input class="input" id="date" name="date" type="date" value="${esc(grade?.graded_on || '')}">
        </div>
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const subject = qs('#subject', form).value;
        const title = qs('#title', form).value.trim();
        const score = parseScore(qs('#score', form).value);
        const weight = Number(qs('#weight', form).value);
        const errors = {
          subject: subject ? null : 'Elige una asignatura.',
          title: title ? null : 'Escribe el nombre del examen o trabajo.',
          score: score === null ? 'Escribe la nota.' : (score < 0 || score > 10 ? 'La nota va de 0 a 10.' : null),
          weight: !Number.isFinite(weight) || weight <= 0 || weight > 100 ? 'El peso va de 1 a 100.' : null,
        };
        if (!applyErrors(dialog, errors)) return false;
        const payload = {
          subject_id: subject,
          title,
          score,
          weight,
          graded_on: qs('#date', form).value || null,
        };
        if (editing) return store.updateGrade(grade.id, payload);
        return store.createGrade(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: 'Eliminar nota',
          message: 'La media de la asignatura se recalculará sin ella.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteGrade(grade.id);
        toast('Nota eliminada');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Habitos                                                                     */
/* -------------------------------------------------------------------------- */

export function openHabitSheet(habit = null, { name: prefillName = '' } = {}) {
  const editing = Boolean(habit);
  return openSheet({
    title: editing ? 'Editar hábito' : 'Nuevo hábito',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="name">Hábito</label>
          <input class="input" id="name" name="name" type="text" maxlength="80"
            placeholder="Leer 20 minutos" value="${esc(habit?.name || prefillName)}" aria-describedby="name-error">
          ${fieldError('name')}
        </div>
        ${weekdayPicker({ selected: habit?.weekdays || [0, 1, 2, 3, 4] })}
        ${colorPicker({ selected: habit?.color || 'lavanda' })}
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const name = qs('#name', form).value.trim();
        const weekdays = readWeekdays(dialog);
        const errors = {
          name: name ? null : 'Escribe el hábito.',
          weekdays: weekdays.length ? null : 'Elige al menos un día.',
        };
        if (!applyErrors(dialog, errors)) return false;
        const payload = { name, weekdays, color: qs('#color', form).value };
        if (editing) return store.updateHabit(habit.id, payload);
        return store.createHabit(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: `Eliminar ${habit.name}`,
          message: 'Se borrará también su historial de días completados.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteHabit(habit.id);
        toast('Hábito eliminado');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Diario                                                                      */
/* -------------------------------------------------------------------------- */

export function openJournalSheet(entry = null) {
  const editing = Boolean(entry);
  return openSheet({
    title: editing ? 'Editar entrada' : 'Nueva entrada',
    wide: true,
    body: `
      <form novalidate>
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="date">Fecha</label>
            <input class="input" id="date" name="date" type="date"
              value="${esc(entry?.entry_date || todayISO())}" aria-describedby="date-error">
            ${fieldError('date')}
          </div>
          <div class="field">
            <label class="field__label" for="title">Título <span class="muted">(opcional)</span></label>
            <input class="input" id="title" name="title" type="text" maxlength="120"
              value="${esc(entry?.title || '')}" placeholder="Cómo ha ido el día">
          </div>
        </div>
        <div class="field">
          <label class="field__label" for="content">Entrada</label>
          <textarea class="textarea" id="content" name="content" maxlength="20000"
            placeholder="Escribe lo que quieras. Solo lo ves tú." aria-describedby="content-error">${esc(entry?.content || '')}</textarea>
          ${fieldError('content')}
        </div>
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const content = qs('#content', form).value.trim();
        const dateValue = qs('#date', form).value;
        const errors = {
          date: dateValue ? null : 'Elige una fecha.',
          content: content ? null : 'Escribe algo antes de guardar.',
        };
        if (!applyErrors(dialog, errors)) return false;
        const payload = {
          entry_date: dateValue,
          title: qs('#title', form).value.trim() || null,
          content,
        };
        if (editing) return store.updateJournalEntry(entry.id, payload);
        return store.createJournalEntry(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: 'Eliminar entrada',
          message: 'Esta entrada del diario se borrará para siempre.',
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteJournalEntry(entry.id);
        toast('Entrada eliminada');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Libros                                                                      */
/* -------------------------------------------------------------------------- */

export const BOOK_STATUS = [
  { key: 'quiero_leer', label: 'Quiero leer' },
  { key: 'leyendo', label: 'Leyendo' },
  { key: 'terminado', label: 'Terminado' },
];

export function bookStatusLabel(key) {
  return (BOOK_STATUS.find((status) => status.key === key) || BOOK_STATUS[0]).label;
}

export function openBookSheet(book = null) {
  const editing = Boolean(book);
  return openSheet({
    title: editing ? 'Editar libro' : 'Añadir libro',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="title">Título</label>
          <input class="input" id="title" name="title" type="text" maxlength="200"
            value="${esc(book?.title || '')}" aria-describedby="title-error">
          ${fieldError('title')}
        </div>
        <div class="field">
          <label class="field__label" for="author">Autor o autora <span class="muted">(opcional)</span></label>
          <input class="input" id="author" name="author" type="text" maxlength="120" value="${esc(book?.author || '')}">
        </div>
        <div class="field">
          <label class="field__label" for="status">Estado</label>
          <select class="select" id="status" name="status">
            ${BOOK_STATUS.map((status) => `
              <option value="${status.key}" ${status.key === (book?.status || 'quiero_leer') ? 'selected' : ''}>${esc(status.label)}</option>`).join('')}
          </select>
        </div>
      </form>`,
    footer: footerButtons({ deletable: editing, saveLabel: editing ? 'Guardar' : 'Añadir' }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const title = qs('#title', form).value.trim();
        if (!applyErrors(dialog, { title: title ? null : 'Escribe el título.' })) return false;
        const payload = {
          title,
          author: qs('#author', form).value.trim() || null,
          status: qs('#status', form).value,
        };
        if (editing) return store.updateBook(book.id, payload);
        return store.createBook(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: 'Eliminar libro',
          message: `${book.title} desaparecerá de tu lista.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteBook(book.id);
        toast('Libro eliminado');
        return true;
      } : null,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Cuentas atras                                                               */
/* -------------------------------------------------------------------------- */

export function openCountdownSheet(countdown = null) {
  const editing = Boolean(countdown);
  const target = countdown ? new Date(countdown.target_at) : null;
  const dateValue = target
    ? `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
    : '';
  const timeValue = target && countdown.has_time ? minutesToTime(target.getHours() * 60 + target.getMinutes()) : '';

  return openSheet({
    title: editing ? 'Editar cuenta atrás' : 'Nueva cuenta atrás',
    body: `
      <form novalidate>
        <div class="field">
          <label class="field__label" for="name">Nombre</label>
          <input class="input" id="name" name="name" type="text" maxlength="80"
            placeholder="Selectividad" value="${esc(countdown?.name || '')}" aria-describedby="name-error">
          ${fieldError('name')}
        </div>
        <div class="field-row field-row--2">
          <div class="field">
            <label class="field__label" for="date">Fecha</label>
            <input class="input" id="date" name="date" type="date" value="${esc(dateValue)}" aria-describedby="date-error">
            ${fieldError('date')}
          </div>
          <div class="field">
            <label class="field__label" for="time">Hora <span class="muted">(opcional)</span></label>
            <input class="input" id="time" name="time" type="time" step="300" value="${esc(timeValue)}">
          </div>
        </div>
      </form>`,
    footer: footerButtons({ deletable: editing }),
    onMount: (dialog, close) => wireSheet(dialog, close, {
      onSubmit: async (form) => {
        const name = qs('#name', form).value.trim();
        const dateValue2 = qs('#date', form).value;
        const timeValue2 = qs('#time', form).value;
        const errors = {
          name: name ? null : 'Ponle un nombre.',
          date: dateValue2 ? null : 'Elige la fecha.',
        };
        if (!applyErrors(dialog, errors)) return false;
        const [year, month, day] = dateValue2.split('-').map(Number);
        const [hours, minutes] = timeValue2 ? timeValue2.split(':').map(Number) : [0, 0];
        const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        const payload = {
          name,
          target_at: targetDate.toISOString(),
          has_time: Boolean(timeValue2),
        };
        if (editing) return store.updateCountdown(countdown.id, payload);
        return store.createCountdown(payload);
      },
      onDelete: editing ? async () => {
        const ok = await confirmDialog({
          title: 'Eliminar cuenta atrás',
          message: `${countdown.name} dejará de aparecer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return false;
        await store.deleteCountdown(countdown.id);
        toast('Cuenta atrás eliminada');
        return true;
      } : null,
    }),
  });
}

export { colorValue, colorLabel };

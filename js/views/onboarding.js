/**
 * Onboarding obligatorio. Un usuario nuevo pasa por aqui antes de llegar al
 * inicio, para que Trazia se adapte a lo que estudia de verdad.
 *
 * Cada paso guarda en Supabase en cuanto se avanza, asi que si alguien cierra la
 * pestaña a mitad puede continuar donde lo dejo.
 */
import { esc, icon, qs, toast, setBusy, symbolMarkup, colorForIndex, colorValue } from '../ui.js';
import { WEEKDAYS, formatTime, formatScore, parseScore, pluralize } from '../format.js';
import * as store from '../store.js';
import { openClassSheet } from '../forms.js';

const GRADE_LEVELS = [
  { key: '1eso', label: '1º ESO', stage: 'eso' },
  { key: '2eso', label: '2º ESO', stage: 'eso' },
  { key: '3eso', label: '3º ESO', stage: 'eso' },
  { key: '4eso', label: '4º ESO', stage: 'eso' },
  { key: '1bach', label: '1º Bachillerato', stage: 'bachillerato' },
  { key: '2bach', label: '2º Bachillerato', stage: 'bachillerato' },
];

const TRACKS = [
  { key: 'ciencias', label: 'Ciencias y Tecnología' },
  { key: 'humanidades', label: 'Humanidades y Ciencias Sociales' },
  { key: 'artes', label: 'Artes' },
  { key: 'otra', label: 'Otra' },
];

/**
 * Sugerencias de asignaturas. Son solo eso: sugerencias para ahorrar tecleo.
 * Ninguna se marca sola y siempre se pueden añadir, renombrar o quitar.
 */
const SUGGESTIONS = {
  eso: [
    'Matemáticas', 'Lengua Castellana y Literatura', 'Inglés', 'Geografía e Historia',
    'Biología y Geología', 'Física y Química', 'Educación Física', 'Tecnología y Digitalización',
    'Música', 'Educación Plástica y Visual', 'Francés', 'Religión', 'Valores Éticos',
  ],
  bachillerato_comun: [
    'Lengua Castellana y Literatura', 'Inglés', 'Filosofía', 'Historia de España',
    'Educación Física', 'Historia de la Filosofía',
  ],
  ciencias: [
    'Matemáticas', 'Física', 'Química', 'Biología', 'Dibujo Técnico',
    'Geología y Ciencias Ambientales', 'Tecnología e Ingeniería',
  ],
  humanidades: [
    'Latín', 'Matemáticas Aplicadas a las Ciencias Sociales', 'Historia del Mundo Contemporáneo',
    'Economía', 'Griego', 'Historia del Arte', 'Geografía', 'Literatura Universal',
  ],
  artes: [
    'Dibujo Artístico', 'Dibujo Técnico', 'Volumen', 'Fundamentos Artísticos',
    'Historia del Arte', 'Cultura Audiovisual', 'Artes Escénicas', 'Análisis Musical',
  ],
  otra: ['Tecnología e Ingeniería', 'Economía', 'Historia del Arte', 'Cultura Audiovisual'],
};

const STEPS = ['bienvenida', 'nombre', 'curso', 'asignaturas', 'horario', 'objetivo', 'resumen'];

export function mountOnboarding(root, { onFinish }) {
  const profile = store.state.profile || {};
  const draft = {
    name: profile.display_name || store.state.user?.user_metadata?.display_name || '',
    stage: profile.stage || null,
    gradeLevel: profile.grade_level || null,
    track: profile.track || null,
    goal: profile.grade_goal !== null && profile.grade_goal !== undefined ? Number(profile.grade_goal) : 7,
  };
  let index = 0;
  let scheduleDay = 0;

  root.innerHTML = `
    <div class="onboarding">
      <div class="onboarding__bar">
        <div class="onboarding__progress"><span id="ob-progress"></span></div>
        <div class="wrap onboarding__top">
          ${symbolMarkup({ size: 26 })}
          <span class="onboarding__step" id="ob-step"></span>
        </div>
      </div>
      <div class="onboarding__body">
        <div class="wrap" style="width:100%">
          <div class="onboarding__panel" id="ob-panel"></div>
        </div>
      </div>
      <div class="onboarding__foot">
        <div class="wrap onboarding__foot-inner" id="ob-foot"></div>
      </div>
    </div>`;

  let panel = qs('#ob-panel', root);
  const foot = qs('#ob-foot', root);
  const progress = qs('#ob-progress', root);
  const stepLabel = qs('#ob-step', root);

  const go = (next) => {
    index = Math.max(0, Math.min(STEPS.length - 1, next));
    render();
  };

  /* ---------------------------------------------------------------------- */
  /* Pasos                                                                   */
  /* ---------------------------------------------------------------------- */

  function stepBienvenida() {
    panel.innerHTML = `
      <span class="eyebrow">Bienvenida</span>
      <h1 class="mt-md">Vamos a preparar <span class="marker">tu Trazia.</span></h1>
      <p class="lede">Solo necesitamos unas cosas para adaptarlo a ti. Se tarda menos de dos minutos y todo se puede cambiar después.</p>`;
    foot.innerHTML = `<button type="button" class="btn btn--primary" data-next>Empezar</button>`;
  }

  function stepNombre() {
    panel.innerHTML = `
      <span class="eyebrow">Paso 1 de 5</span>
      <h1 class="mt-md">¿Cómo <span class="marker">te llamas?</span></h1>
      <p class="lede">Lo usamos para saludarte y para nada más.</p>
      <div class="onboarding__section">
        <div class="field">
          <label class="field__label" for="ob-name">Tu nombre</label>
          <input class="input" id="ob-name" type="text" maxlength="60" autocomplete="given-name"
            value="${esc(draft.name)}" aria-describedby="ob-name-error">
          <p class="field__error" id="ob-name-error" hidden></p>
        </div>
      </div>`;
    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-next>Continuar</button>`;

    const input = qs('#ob-name', panel);
    input.focus();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); foot.querySelector('[data-next]').click(); }
    });
  }

  function stepCurso() {
    const eso = GRADE_LEVELS.filter((level) => level.stage === 'eso');
    const bach = GRADE_LEVELS.filter((level) => level.stage === 'bachillerato');
    panel.innerHTML = `
      <span class="eyebrow">Paso 2 de 5</span>
      <h1 class="mt-md">¿Qué <span class="marker">estudias?</span></h1>
      <p class="lede">Con esto ajustamos las asignaturas que te sugerimos.</p>

      <div class="onboarding__section">
        <p class="block__title" style="margin-bottom:10px">ESO</p>
        <div class="choice-grid">
          ${eso.map((level) => choiceButton(level.key, level.label, draft.gradeLevel === level.key)).join('')}
        </div>
      </div>
      <div class="onboarding__section">
        <p class="block__title" style="margin-bottom:10px">Bachillerato</p>
        <div class="choice-grid">
          ${bach.map((level) => choiceButton(level.key, level.label, draft.gradeLevel === level.key)).join('')}
        </div>
      </div>
      <div id="ob-track" class="onboarding__section" ${draft.stage === 'bachillerato' ? '' : 'hidden'}>
        <p class="block__title" style="margin-bottom:10px">Modalidad</p>
        <div class="choice-grid">
          ${TRACKS.map((track) => choiceButton(`track:${track.key}`, track.label, draft.track === track.key)).join('')}
        </div>
      </div>
      <p class="field__error mt-md" id="ob-curso-error" hidden></p>`;

    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-next>Continuar</button>`;

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('.choice[data-value]');
      if (!button) return;
      const value = button.dataset.value;
      if (value.startsWith('track:')) {
        draft.track = value.slice(6);
      } else {
        draft.gradeLevel = value;
        draft.stage = GRADE_LEVELS.find((level) => level.key === value).stage;
        if (draft.stage !== 'bachillerato') draft.track = null;
      }
      render();
    });
  }

  function stepAsignaturas() {
    const suggestions = suggestionsFor(draft);
    const chosen = new Set(store.state.subjects.map((subject) => subject.name.toLowerCase()));

    panel.innerHTML = `
      <span class="eyebrow">Paso 3 de 5</span>
      <h1 class="mt-md">¿Qué <span class="marker">asignaturas</span> tienes?</h1>
      <p class="lede">Toca las que curses o escribe las tuyas. Nada está marcado de antemano.</p>

      <div class="onboarding__section">
        <div class="block__head"><span class="block__title">Tus asignaturas</span>
          <span class="block__aside">${store.state.subjects.length}</span></div>
        <div id="ob-subject-list" class="mt-md"></div>
        <form class="inline-add" id="ob-subject-form">
          <label class="visually-hidden" for="ob-subject-name">Nombre de la asignatura</label>
          <input class="input" id="ob-subject-name" type="text" maxlength="60" placeholder="Añadir asignatura">
          <button type="submit" class="btn btn--ghost">Añadir</button>
        </form>
      </div>

      <div class="onboarding__section">
        <div class="block__head"><span class="block__title">Sugerencias</span></div>
        <p class="small muted mt-sm">Son solo propuestas habituales de tu curso. Añade únicamente las que cursas.</p>
        <div class="pill-list mt-md" id="ob-suggestions">
          ${suggestions.map((name) => `
            <button type="button" class="chip" data-suggestion="${esc(name)}"
              ${chosen.has(name.toLowerCase()) ? 'disabled aria-disabled="true"' : ''}>
              ${esc(name)}
            </button>`).join('')}
        </div>
      </div>`;

    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-next>Continuar</button>`;

    renderSubjectList();

    qs('#ob-subject-form', panel).addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = qs('#ob-subject-name', panel);
      const name = input.value.trim();
      if (!name) return;
      await addSubject(name);
      input.value = '';
      input.focus();
    });

    qs('#ob-suggestions', panel).addEventListener('click', async (event) => {
      const button = event.target.closest('[data-suggestion]');
      if (!button || button.disabled) return;
      button.disabled = true;
      await addSubject(button.dataset.suggestion);
    });
  }

  async function addSubject(name) {
    const exists = store.state.subjects.some(
      (subject) => subject.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      toast('Esa asignatura ya está en tu lista.', 'error');
      return;
    }
    try {
      await store.createSubject({ name, color: colorForIndex(store.state.subjects.length) });
      renderSubjectList();
      updateSuggestionStates();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function updateSuggestionStates() {
    const chosen = new Set(store.state.subjects.map((subject) => subject.name.toLowerCase()));
    panel.querySelectorAll('[data-suggestion]').forEach((button) => {
      const disabled = chosen.has(button.dataset.suggestion.toLowerCase());
      button.disabled = disabled;
      button.setAttribute('aria-disabled', String(disabled));
    });
    const counter = panel.querySelector('.block__aside');
    if (counter) counter.textContent = String(store.state.subjects.length);
  }

  function renderSubjectList() {
    const container = qs('#ob-subject-list', panel);
    if (!container) return;
    if (store.state.subjects.length === 0) {
      container.innerHTML = `<p class="muted small">Todavía no has añadido ninguna asignatura.</p>`;
      return;
    }
    container.innerHTML = `<div class="pill-list">${store.state.subjects.map((subject) => `
      <span class="pill" style="--row-color:${colorValue(subject.color)}">
        <span class="pill__dot" aria-hidden="true"></span>
        ${esc(subject.name)}
        <button type="button" class="pill__remove" data-remove="${esc(subject.id)}"
          aria-label="Quitar ${esc(subject.name)}">${icon('cerrar', { size: 13 })}</button>
      </span>`).join('')}</div>`;

    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await store.deleteSubject(button.dataset.remove);
          renderSubjectList();
          updateSuggestionStates();
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  function stepHorario() {
    const classes = store.state.schedule.filter((item) => item.kind === 'class');
    const dayClasses = classes
      .filter((item) => item.weekday === scheduleDay)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

    panel.innerHTML = `
      <span class="eyebrow">Paso 4 de 5</span>
      <h1 class="mt-md">¿Cómo es <span class="marker">tu horario?</span></h1>
      <p class="lede">Añade las clases que quieras ahora. No hace falta meterlo todo de una vez.</p>

      <div class="onboarding__section">
        <div class="chip-scroll" role="tablist" aria-label="Días de la semana">
          ${WEEKDAYS.slice(0, 6).map((day, dayIndex) => `
            <button type="button" class="chip" role="tab" data-day="${dayIndex}"
              aria-selected="${dayIndex === scheduleDay}"
              ${dayIndex === scheduleDay ? 'aria-pressed="true"' : ''}>
              ${esc(day.charAt(0).toUpperCase() + day.slice(1))}
            </button>`).join('')}
        </div>

        <div class="mt-md" id="ob-day-classes">
          ${dayClasses.length === 0
            ? `<p class="muted small" style="padding:18px 0">Sin clases el ${esc(WEEKDAYS[scheduleDay])}.</p>`
            : `<div class="list">${dayClasses.map((item) => {
                const subject = store.subjectById(item.subject_id);
                return `
                  <div class="row" style="--row-color:${colorValue(subject?.color)}">
                    <span class="row__bar" aria-hidden="true"></span>
                    <span class="row__time">${esc(formatTime(item.start_time))}<small>${esc(formatTime(item.end_time))}</small></span>
                    <span class="row__main">
                      <span class="row__title">${esc(subject?.name || 'Clase')}</span>
                      ${item.room ? `<span class="row__meta">Aula ${esc(item.room)}</span>` : ''}
                    </span>
                    <span class="row__actions">
                      <button type="button" class="icon-btn" data-edit-class="${esc(item.id)}" aria-label="Editar clase">${icon('editar')}</button>
                    </span>
                  </div>`;
              }).join('')}</div>`}
        </div>

        <button type="button" class="btn btn--ghost btn--block mt-md" id="ob-add-class">
          ${icon('mmas', { size: 18 })} Añadir clase
        </button>
        <p class="small muted mt-md">Tienes ${classes.length} ${pluralize(classes.length, 'clase configurada', 'clases configuradas')}.</p>
      </div>`;

    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-next>Continuar</button>
      <button type="button" class="btn btn--quiet" data-next>Lo haré después</button>`;

    panel.querySelectorAll('[data-day]').forEach((button) => {
      button.addEventListener('click', () => { scheduleDay = Number(button.dataset.day); render(); });
    });
    qs('#ob-add-class', panel).addEventListener('click', async () => {
      const result = await openClassSheet(null, { weekday: scheduleDay });
      if (result) { toast('Clase añadida'); render(); }
    });
    panel.querySelectorAll('[data-edit-class]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = store.state.schedule.find((entry) => entry.id === button.dataset.editClass);
        const result = await openClassSheet(item);
        if (result) render();
      });
    });
  }

  function stepObjetivo() {
    panel.innerHTML = `
      <span class="eyebrow">Paso 5 de 5</span>
      <h1 class="mt-md">¿Qué <span class="marker">nota media</span> quieres?</h1>
      <p class="lede">Es una referencia tuya para ver por dónde vas. Puedes cambiarla cuando quieras.</p>

      <div class="onboarding__section">
        <p class="focus-time text-right" id="ob-goal-value" aria-hidden="true">${esc(formatScore(draft.goal, 1))}</p>
        <label class="field__label" for="ob-goal">Objetivo de nota media</label>
        <input type="range" id="ob-goal" min="0" max="10" step="0.5" value="${draft.goal}"
          style="width:100%" aria-describedby="ob-goal-desc">
        <div class="flex-between small muted mt-sm"><span>0</span><span>10</span></div>
        <p class="field__hint" id="ob-goal-desc">Objetivo actual: ${esc(formatScore(draft.goal, 1))} sobre 10.</p>
      </div>`;

    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-next>Continuar</button>`;

    const range = qs('#ob-goal', panel);
    const value = qs('#ob-goal-value', panel);
    const description = qs('#ob-goal-desc', panel);
    range.addEventListener('input', () => {
      draft.goal = parseScore(range.value);
      value.textContent = formatScore(draft.goal, 1);
      description.textContent = `Objetivo actual: ${formatScore(draft.goal, 1)} sobre 10.`;
    });
  }

  function stepResumen() {
    const classes = store.state.schedule.filter((item) => item.kind === 'class');
    const level = GRADE_LEVELS.find((entry) => entry.key === draft.gradeLevel);
    const track = TRACKS.find((entry) => entry.key === draft.track);

    panel.innerHTML = `
      <span class="eyebrow eyebrow--coral">Todo listo</span>
      <h1 class="mt-md">Tu Trazia <span class="marker">está lista.</span></h1>
      <p class="lede">Esto es lo que hemos guardado. Se puede cambiar entero desde Ajustes.</p>

      <dl class="summary-list">
        <div class="summary-item"><dt>Nombre</dt><dd>${esc(draft.name)}</dd></div>
        <div class="summary-item"><dt>Curso</dt><dd>${esc(level ? level.label : 'Sin indicar')}${track ? ` · ${esc(track.label)}` : ''}</dd></div>
        <div class="summary-item"><dt>Asignaturas</dt><dd>${store.state.subjects.length}</dd></div>
        <div class="summary-item"><dt>Objetivo</dt><dd>${esc(formatScore(draft.goal, 1))} sobre 10</dd></div>
        <div class="summary-item"><dt>Clases</dt><dd>${classes.length}</dd></div>
      </dl>

      ${store.state.subjects.length > 0 ? `
        <div class="pill-list mt-md">
          ${store.state.subjects.map((subject) => `
            <span class="pill" style="--row-color:${colorValue(subject.color)}">
              <span class="pill__dot" aria-hidden="true"></span>${esc(subject.name)}
            </span>`).join('')}
        </div>` : ''}`;

    foot.innerHTML = `
      <button type="button" class="btn btn--quiet" data-back>Atrás</button>
      <button type="button" class="btn btn--primary" data-finish>Entrar en Trazia</button>`;
  }

  /* ---------------------------------------------------------------------- */
  /* Navegacion                                                              */
  /* ---------------------------------------------------------------------- */

  async function validateAndSave() {
    const step = STEPS[index];
    if (step === 'nombre') {
      const input = qs('#ob-name', panel);
      const name = input.value.trim();
      if (name.length < 2) {
        const error = qs('#ob-name-error', panel);
        error.textContent = 'Escribe tu nombre.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return false;
      }
      draft.name = name;
      await store.updateProfile({ display_name: name });
      return true;
    }
    if (step === 'curso') {
      if (!draft.gradeLevel) {
        const error = qs('#ob-curso-error', panel);
        error.textContent = 'Elige tu curso para continuar.';
        error.hidden = false;
        return false;
      }
      if (draft.stage === 'bachillerato' && !draft.track) {
        const error = qs('#ob-curso-error', panel);
        error.textContent = 'Elige también tu modalidad.';
        error.hidden = false;
        return false;
      }
      await store.updateProfile({
        stage: draft.stage,
        grade_level: draft.gradeLevel,
        track: draft.track,
      });
      return true;
    }
    if (step === 'objetivo') {
      await store.updateProfile({ grade_goal: draft.goal });
      return true;
    }
    return true;
  }

  function render() {
    // Cada paso estrena panel: asi ningun manejador de un paso anterior queda vivo.
    const fresh = document.createElement('div');
    fresh.className = 'onboarding__panel';
    fresh.id = 'ob-panel';
    panel.replaceWith(fresh);
    panel = fresh;

    const step = STEPS[index];
    progress.style.width = `${(index / (STEPS.length - 1)) * 100}%`;
    stepLabel.textContent = index === 0 ? 'Bienvenida' : `${index} de ${STEPS.length - 2}`;

    if (step === 'bienvenida') stepBienvenida();
    else if (step === 'nombre') stepNombre();
    else if (step === 'curso') stepCurso();
    else if (step === 'asignaturas') stepAsignaturas();
    else if (step === 'horario') stepHorario();
    else if (step === 'objetivo') stepObjetivo();
    else stepResumen();

    panel.classList.remove('view-enter');
    void panel.offsetWidth;
    panel.classList.add('view-enter');

    foot.querySelectorAll('[data-next]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true, 'Guardando');
        try {
          const ok = await validateAndSave();
          setBusy(button, false);
          if (ok) go(index + 1);
        } catch (error) {
          setBusy(button, false);
          toast(error.message, 'error');
        }
      });
    });
    foot.querySelectorAll('[data-back]').forEach((button) => {
      button.addEventListener('click', () => go(index - 1));
    });
    const finish = foot.querySelector('[data-finish]');
    if (finish) {
      finish.addEventListener('click', async () => {
        setBusy(finish, true, 'Preparando');
        try {
          await store.updateProfile({
            display_name: draft.name,
            grade_goal: draft.goal,
            onboarding_completed: true,
          });
          onFinish();
        } catch (error) {
          setBusy(finish, false);
          toast(error.message, 'error');
        }
      });
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  render();
  return () => { root.innerHTML = ''; };
}

function choiceButton(value, label, selected) {
  return `
    <button type="button" class="choice ${selected ? 'is-selected' : ''}" data-value="${esc(value)}"
      aria-pressed="${selected ? 'true' : 'false'}">
      <span class="choice__tick" aria-hidden="true"></span>
      <span>${esc(label)}</span>
    </button>`;
}

function suggestionsFor(draft) {
  if (draft.stage === 'bachillerato') {
    const track = draft.track && SUGGESTIONS[draft.track] ? SUGGESTIONS[draft.track] : [];
    return [...SUGGESTIONS.bachillerato_comun, ...track];
  }
  return SUGGESTIONS.eso;
}

export { GRADE_LEVELS, TRACKS };

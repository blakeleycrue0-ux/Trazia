/**
 * Notas: registro por asignatura, media ponderada y media global.
 * El calculo se explica siempre en pantalla y nunca se inventa un valor: si no
 * hay datos suficientes, se dice.
 */
import { esc, icon, emptyState, colorValue, toast } from '../ui.js';
import { formatScore, formatMediumDate, parseDate, pluralize } from '../format.js';
import * as store from '../store.js';
import { weightedAverage, weightSum, globalAverage, subjectsWithGrades } from '../compute.js';
import { openGradeSheet, openSubjectSheet } from '../forms.js';

export function mount(container, { navigate }) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-grade], [data-add-grade], [data-edit-subject]');
    if (!target) return;

    if (target.dataset.editGrade) {
      const grade = store.state.grades.find((entry) => entry.id === target.dataset.editGrade);
      if (grade) await openGradeSheet(grade);
      return;
    }
    if (target.dataset.addGrade) {
      await openGradeSheet(null, { subjectId: target.dataset.addGrade });
      return;
    }
    if (target.dataset.editSubject) {
      const subject = store.state.subjects.find((entry) => entry.id === target.dataset.editSubject);
      if (subject) await openSubjectSheet(subject);
      return;
    }

    const action = target.dataset.action;
    if (action === 'add-grade') { await openGradeSheet(); return; }
    if (action === 'add-subject') {
      const created = await openSubjectSheet();
      if (created) toast('Asignatura creada');
      return;
    }
    if (action === 'go-settings') navigate('ajustes');
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

function template() {
  const { subjects, grades, profile } = { ...store.state, profile: store.state.profile || {} };
  const average = globalAverage(subjects, grades);
  const goal = profile.grade_goal !== null && profile.grade_goal !== undefined ? Number(profile.grade_goal) : null;
  const counted = subjectsWithGrades(subjects, grades);

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Cómo vas</span>
          <h1 class="view__title">Notas</h1>
        </div>
        ${subjects.length > 0 ? `
          <button type="button" class="btn btn--primary btn--sm" data-action="add-grade">
            ${icon('mmas', { size: 16 })} Nueva nota
          </button>` : ''}
      </div>

      ${subjects.length === 0 ? emptyState({
        title: 'Sin asignaturas',
        text: 'Crea una asignatura para poder apuntar notas y calcular tu media.',
        actionLabel: 'Crear asignatura',
        action: 'add-subject',
      }) : `
        <dl class="stat-strip">
          <div class="stat">
            <dt>Media global</dt>
            <dd>${average === null ? '—' : esc(formatScore(average, 2))}
              <small>${average === null ? 'sin notas' : 'sobre 10'}</small></dd>
          </div>
          <div class="stat">
            <dt>Objetivo</dt>
            <dd>${goal === null ? '—' : esc(formatScore(goal, 1))}
              <small>${goal === null ? 'sin definir' : 'sobre 10'}</small></dd>
          </div>
          <div class="stat">
            <dt>Asignaturas con notas</dt>
            <dd>${counted.length}<small>de ${subjects.length}</small></dd>
          </div>
        </dl>

        ${average === null ? `
          <p class="muted small mt-md">Todavía no hay suficientes notas para calcular una media.</p>` : `
          <details class="mt-md">
            <summary class="link-btn" style="cursor:pointer">Cómo se calcula</summary>
            <div class="notice notice--info mt-sm">
              <span class="notice__icon">${icon('info', { size: 19 })}</span>
              <div>
                <strong>Media ponderada por asignatura</strong>
                <span>Se suma cada nota multiplicada por su peso y se divide entre la suma de los pesos.
                La media global es la media de las medias de las ${counted.length}
                ${pluralize(counted.length, 'asignatura que tiene notas', 'asignaturas que tienen notas')}.</span>
              </div>
            </div>
          </details>`}

        ${subjects.map((subject) => subjectBlock(subject, grades)).join('')}
      `}
    </div>`;
}

function subjectBlock(subject, allGrades) {
  const grades = allGrades
    .filter((grade) => grade.subject_id === subject.id)
    .sort((a, b) => String(b.graded_on || b.created_at).localeCompare(String(a.graded_on || a.created_at)));
  const average = weightedAverage(grades);
  const weights = weightSum(grades);

  return `
    <section class="block" style="--row-color:${colorValue(subject.color)}">
      <div class="block__head">
        <span class="flex">
          <span class="tag tag--subject"><span class="tag__dot" aria-hidden="true"></span>${esc(subject.name)}</span>
          <button type="button" class="icon-btn" data-edit-subject="${esc(subject.id)}"
            aria-label="Editar ${esc(subject.name)}">${icon('editar', { size: 16 })}</button>
        </span>
        <span class="block__aside">
          ${average === null ? 'Sin notas' : `Media ${esc(formatScore(average, 2))} · pesos ${esc(formatScore(weights, 0))}%`}
        </span>
      </div>

      ${grades.length === 0
        ? `<p class="muted small" style="padding:16px 0">
            Todavía no hay notas de ${esc(subject.name)}.
            <button type="button" class="link-btn" data-add-grade="${esc(subject.id)}">Apuntar una</button>
          </p>`
        : `<div class="list mt-sm">
            ${grades.map((grade) => gradeRow(grade)).join('')}
            <div class="row" style="border-bottom:0">
              <span class="row__main">
                <button type="button" class="link-btn" data-add-grade="${esc(subject.id)}">Añadir nota</button>
              </span>
              <span class="row__side">
                ${weights !== 100 && grades.length > 0 ? `<span class="small muted">Los pesos suman ${esc(formatScore(weights, 0))}%</span>` : ''}
              </span>
            </div>
          </div>`}
    </section>`;
}

function gradeRow(grade) {
  const date = parseDate(grade.graded_on);
  const score = Number(grade.score);
  return `
    <div class="row">
      <span class="row__bar" aria-hidden="true"></span>
      <span class="row__main">
        <span class="row__title">${esc(grade.title)}</span>
        <span class="row__meta">
          Peso ${esc(formatScore(grade.weight, 0))}%${date ? ` · ${esc(formatMediumDate(date))}` : ''}
        </span>
      </span>
      <span class="row__side">
        <span class="row__value" style="color:${score >= 5 ? 'var(--ink)' : 'var(--coral-deep)'}">
          ${esc(formatScore(score, 2))}
        </span>
      </span>
      <span class="row__actions">
        <button type="button" class="icon-btn" data-edit-grade="${esc(grade.id)}"
          aria-label="Editar ${esc(grade.title)}">${icon('editar')}</button>
      </span>
    </div>`;
}

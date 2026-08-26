/**
 * Diario privado. Las entradas solo las ve su autor: la consulta va filtrada por
 * usuario y ademas PostgreSQL lo garantiza con RLS.
 */
import { esc, icon, emptyState, toast } from '../ui.js';
import { formatLongDate, parseDate, capitalize, todayISO } from '../format.js';
import * as store from '../store.js';
import { openJournalSheet } from '../forms.js';

export function mount(container) {
  const expanded = new Set();

  const render = () => { container.innerHTML = template(expanded); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-entry], [data-expand]');
    if (!target) return;

    if (target.dataset.editEntry) {
      const entry = store.state.journal.find((item) => item.id === target.dataset.editEntry);
      if (entry) await openJournalSheet(entry);
      return;
    }
    if (target.dataset.expand) {
      const id = target.dataset.expand;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
      return;
    }
    if (target.dataset.action === 'add-entry') {
      const created = await openJournalSheet();
      if (created) toast('Entrada guardada');
    }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

function template(expanded) {
  const entries = store.state.journal;
  const todayEntry = entries.find((entry) => entry.entry_date === todayISO());

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Solo para ti</span>
          <h1 class="view__title">Diario</h1>
          <p class="view__sub">Lo que escribas aquí es privado. No se comparte con nadie.</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-action="add-entry">
          ${icon('mmas', { size: 16 })} ${todayEntry ? 'Nueva entrada' : 'Escribir hoy'}
        </button>
      </div>

      ${entries.length === 0
        ? emptyState({
            title: 'Todavía no has escrito nada.',
            text: 'Escribe cómo ha ido el día, lo que sea. Solo lo ves tú.',
            actionLabel: 'Escribir la primera entrada',
            action: 'add-entry',
          })
        : `<div class="mt-md">${entries.map((entry) => entryBlock(entry, expanded.has(entry.id))).join('')}</div>`}
    </div>`;
}

function entryBlock(entry, isExpanded) {
  const date = parseDate(entry.entry_date);
  const isLong = entry.content.length > 320 || entry.content.split('\n').length > 5;
  return `
    <article class="entry">
      <div class="flex-between">
        <p class="eyebrow entry__date">${esc(date ? capitalize(formatLongDate(date)) : '')}</p>
        <button type="button" class="icon-btn" data-edit-entry="${esc(entry.id)}"
          aria-label="Editar la entrada del ${esc(date ? formatLongDate(date) : 'diario')}">${icon('editar')}</button>
      </div>
      ${entry.title ? `<h2 class="entry__title">${esc(entry.title)}</h2>` : ''}
      <p class="entry__body ${isLong && !isExpanded ? 'is-clamped' : ''}">${esc(entry.content)}</p>
      ${isLong ? `
        <div class="entry__foot">
          <button type="button" class="link-btn" data-expand="${esc(entry.id)}">
            ${isExpanded ? 'Mostrar menos' : 'Seguir leyendo'}
          </button>
        </div>` : ''}
    </article>`;
}

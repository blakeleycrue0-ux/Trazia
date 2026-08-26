/**
 * Libros: lo que quieres leer, lo que estas leyendo y lo que has terminado.
 * Aqui no hay libros de ejemplo: la lista arranca vacia hasta que añades el tuyo.
 */
import { esc, icon, emptyState, toast } from '../ui.js';
import { pluralize } from '../format.js';
import * as store from '../store.js';
import { openBookSheet, BOOK_STATUS, bookStatusLabel } from '../forms.js';

export function mount(container) {
  const render = () => { container.innerHTML = template(); };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-edit-book]');
    if (!target) return;
    if (target.dataset.editBook) {
      const book = store.state.books.find((entry) => entry.id === target.dataset.editBook);
      if (book) await openBookSheet(book);
      return;
    }
    if (target.dataset.action === 'add-book') {
      const created = await openBookSheet();
      if (created) toast('Libro añadido');
    }
  });

  container.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-status-for]');
    if (!select) return;
    const id = select.dataset.statusFor;
    const previous = store.state.books.find((book) => book.id === id)?.status;
    try {
      await store.updateBook(id, { status: select.value });
      toast(`Movido a “${bookStatusLabel(select.value)}”`);
    } catch (error) {
      select.value = previous;
      toast(error.message, 'error');
    }
  });

  render();
  const unsubscribe = store.subscribe(render);
  return () => unsubscribe();
}

function template() {
  const books = store.state.books;

  return `
    <div class="wrap view">
      <div class="view__head">
        <div>
          <span class="eyebrow">Tu lectura</span>
          <h1 class="view__title">Libros</h1>
          ${books.length ? `<p class="view__sub">${books.length} ${pluralize(books.length, 'libro en tu lista', 'libros en tu lista')}.</p>` : ''}
        </div>
        ${books.length ? `
          <button type="button" class="btn btn--primary btn--sm" data-action="add-book">
            ${icon('mmas', { size: 16 })} Añadir libro
          </button>` : ''}
      </div>

      ${books.length === 0
        ? emptyState({
            title: 'Sin libros aún',
            text: 'Apunta uno que quieras leer y ve cambiando su estado.',
            actionLabel: 'Añadir libro',
            action: 'add-book',
          })
        : BOOK_STATUS.map((status) => statusBlock(status, books)).join('')}
    </div>`;
}

function statusBlock(status, books) {
  const list = books.filter((book) => book.status === status.key);
  if (list.length === 0) return '';
  return `
    <section class="block">
      <div class="block__head">
        <span class="block__title">${esc(status.label)}</span>
        <span class="block__aside">${list.length}</span>
      </div>
      <div class="list mt-sm">
        ${list.map((book) => `
          <div class="row">
            <span class="row__bar" style="--row-color:${status.key === 'terminado' ? 'var(--lavender)' : status.key === 'leyendo' ? 'var(--coral)' : 'var(--blue)'}" aria-hidden="true"></span>
            <span class="row__main">
              <span class="row__title">${esc(book.title)}</span>
              ${book.author ? `<span class="row__meta">${esc(book.author)}</span>` : ''}
            </span>
            <span class="row__side">
              <label class="visually-hidden" for="status-${esc(book.id)}">Estado de ${esc(book.title)}</label>
              <select class="select" id="status-${esc(book.id)}" data-status-for="${esc(book.id)}"
                style="min-height:36px;padding:5px 30px 5px 10px;font-size:.82rem">
                ${BOOK_STATUS.map((option) => `
                  <option value="${option.key}" ${option.key === book.status ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
              </select>
            </span>
            <span class="row__actions">
              <button type="button" class="icon-btn" data-edit-book="${esc(book.id)}"
                aria-label="Editar ${esc(book.title)}">${icon('editar')}</button>
            </span>
          </div>`).join('')}
      </div>
    </section>`;
}

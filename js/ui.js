/**
 * Helpers de interfaz: iconos, plantillas seguras, avisos, dialogos y estados.
 * Todo el HTML dinamico se compone con plantillas de texto, asi que cualquier
 * dato del usuario debe pasar siempre por esc().
 */

/* -------------------------------------------------------------------------- */
/* Plantillas                                                                  */
/* -------------------------------------------------------------------------- */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo en HTML. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Etiqueta de plantilla que escapa todas las interpolaciones. */
export function html(strings, ...values) {
  return strings.reduce((acc, str, i) => {
    if (i === 0) return str;
    const value = values[i - 1];
    const rendered = Array.isArray(value) ? value.join('') : value;
    return acc + (rendered === null || rendered === undefined ? '' : rendered) + str;
  });
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Delegacion de eventos: on(root, 'click', '[data-action="x"]', handler) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}

export function setBusy(button, busy, labelWhenBusy) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="btn__spinner" aria-hidden="true"></span><span>${esc(labelWhenBusy || 'Guardando')}</span>`;
  } else if (button.dataset.label !== undefined) {
    button.innerHTML = button.dataset.label;
    delete button.dataset.label;
    button.disabled = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Iconografia                                                                 */
/* -------------------------------------------------------------------------- */

const ICONS = {
  inicio: '<path d="M4 10.6 12 4l8 6.6V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>',
  horario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
  notas: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
  habitos: '<path d="M20.5 8V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V16"/><path d="M8 12.4l2.7 2.6L21 5.5"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  diario: '<path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v15.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M4.5 16.5H19M9 7.5h6"/>',
  libros: '<path d="M4 5.5A2 2 0 0 1 6 3.5h4v17H6a2 2 0 0 1-2-2z"/><path d="M10 3.5h4a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4"/><path d="M16.4 5.2l2.6.6a1.5 1.5 0 0 1 1.1 1.8l-2.7 11.6"/>',
  concentracion: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.8M9.5 2.5h5"/>',
  cuenta: '<path d="M7 3h10M7 21h10"/><path d="M8 3v3.2c0 1.2.5 2.3 1.4 3L12 11.5l2.6-2.3A4 4 0 0 0 16 6.2V3"/><path d="M8 21v-3.2c0-1.2.5-2.3 1.4-3L12 12.5l2.6 2.3a4 4 0 0 1 1.4 3V21"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
  mmas: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M4 20h4l10.3-10.3a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16z"/>',
  eliminar: '<path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  siguiente: '<path d="M9 5l7 7-7 7"/>',
  abajo: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.6 4.5L19 7"/>',
  salir: '<path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8.5 6 12l4 3.5M6 12h10"/>',
  exportar: '<path d="M12 3.5v11M8 11l4 3.5 4-3.5"/><path d="M4.5 16v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  importar: '<path d="M12 15V4M8 7.5 12 4l4 3.5"/><path d="M4.5 16v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  play: '<path d="M8 5.2v13.6L19 12z" stroke-linejoin="round"/>',
  pausa: '<path d="M9.5 5v14M14.5 5v14"/>',
  reiniciar: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  aviso: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.6M12 16.2h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9h.01"/>',
  ver: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  ocultar: '<path d="M4 4l16 16"/><path d="M9.9 5.9A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1M6.6 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5"/><path d="M9.9 10.4a3 3 0 0 0 4 4"/>',
  perfil: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"/>',
  llave: '<circle cx="8" cy="14" r="3.8"/><path d="M10.8 11.2 19 3M16.4 5.6l2.2 2.2M14.4 7.6l2.2 2.2"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.8 6.3 8.2 6 8.2-6"/>',
  escudo: '<path d="M12 3.2 5 6v5.7c0 4.3 2.9 7.6 7 9.1 4.1-1.5 7-4.8 7-9.1V6z"/><path d="m9 12.2 2.2 2.2 4-4.4"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  añadir: '<path d="M12 5v14M5 12h14"/>',
};

/** Devuelve el marcado SVG de un icono del sistema. */
export function icon(name, { size = 20, className = '' } = {}) {
  const paths = ICONS[name];
  if (!paths) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    ${className ? `class="${esc(className)}"` : ''}>${paths}</svg>`;
}

/** Simbolo de Trazia en color, para cabeceras y estados vacios. */
export function symbolMarkup({ size = 30, className = 'brand__symbol', light = false } = {}) {
  const primary = light ? '#8FA4F0' : '#4056B5';
  return `<svg class="${esc(className)}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">
    <path d="M12 28.5 29 11.5" fill="none" stroke="${primary}" stroke-width="9" stroke-linecap="round"/>
    <path d="M21 34.5 30 25.5" fill="none" stroke="#A99BE8" stroke-width="9" stroke-linecap="round"/>
    <circle cx="34.5" cy="35" r="4.2" fill="#F47F68"/>
  </svg>`;
}

/**
 * Wordmark: "trazia" en minusculas con el punto de la i en coral. Se compone
 * con una i sin punto mas un circulo propio, para poder darle el color de marca.
 */
export function wordmarkMarkup() {
  return `<span class="brand__word">
    <span class="visually-hidden">trazia</span>
    <span aria-hidden="true">traz<span class="brand__i">ı<i class="brand__tittle"></i></span>a</span>
  </span>`;
}

/** Logo completo: simbolo + wordmark. */
export function logoMarkup({ size = 30, light = false, className = '' } = {}) {
  return `<span class="brand ${light ? 'brand--light' : ''} ${esc(className)}">
    ${symbolMarkup({ size, light })}
    ${wordmarkMarkup()}
  </span>`;
}

/* -------------------------------------------------------------------------- */
/* Colores de asignatura                                                       */
/* -------------------------------------------------------------------------- */

export const SUBJECT_COLORS = [
  { key: 'indigo', label: 'Azul', value: '#574cef' },
  { key: 'lavanda', label: 'Lavanda', value: '#9473e8' },
  { key: 'coral', label: 'Naranja', value: '#fe7444' },
  { key: 'marino', label: 'Tinta', value: '#030826' },
  { key: 'cielo', label: 'Cielo', value: '#1e7fd4' },
  { key: 'ciruela', label: 'Ciruela', value: '#8a3fb0' },
  { key: 'frambuesa', label: 'Frambuesa', value: '#d6336c' },
  { key: 'salvia', label: 'Verde', value: '#2f8f6b' },
];

const COLOR_MAP = new Map(SUBJECT_COLORS.map((c) => [c.key, c.value]));

export function colorValue(key) {
  return COLOR_MAP.get(key) || COLOR_MAP.get('indigo');
}

export function colorLabel(key) {
  const found = SUBJECT_COLORS.find((c) => c.key === key);
  return found ? found.label : 'Índigo';
}

/** Elige un color de la paleta segun la posicion, evitando repetir seguidos. */
export function colorForIndex(index) {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length].key;
}

/* -------------------------------------------------------------------------- */
/* Avisos temporales                                                           */
/* -------------------------------------------------------------------------- */

function toastRegion() {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}

/** Muestra un aviso breve. type: 'ok' | 'error' */
export function toast(message, type = 'ok') {
  const region = toastRegion();
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'toast--error' : ''}`;
  node.innerHTML = `${icon(type === 'error' ? 'aviso' : 'check', { size: 18 })}<span>${esc(message)}</span>`;
  region.appendChild(node);
  const remove = () => {
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  };
  setTimeout(remove, type === 'error' ? 5200 : 3200);
  node.addEventListener('click', remove);
}

/* -------------------------------------------------------------------------- */
/* Dialogos                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Abre un dialogo modal nativo. Devuelve una promesa que se resuelve con el
 * valor pasado a close() o con null si se cancela.
 *
 * options.render(close) debe devolver el HTML interno del panel.
 */
export function openSheet({ title, body, footer, wide = false, onMount, labelledBy }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `sheet ${wide ? 'sheet--wide' : ''}`;
    const titleId = labelledBy || `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.innerHTML = `
      <div class="sheet__inner">
        <div class="sheet__head">
          <h2 class="sheet__title" id="${titleId}">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-sheet-close aria-label="Cerrar">${icon('cerrar')}</button>
        </div>
        <div class="sheet__body">${body}</div>
        ${footer ? `<div class="sheet__foot">${footer}</div>` : ''}
      </div>`;

    let settled = false;
    const close = (value = null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      dialog.close();
    };

    dialog.addEventListener('close', () => {
      if (!settled) { settled = true; resolve(null); }
      dialog.remove();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(null);
      if (event.target.closest('[data-sheet-close]')) close(null);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    if (onMount) onMount(dialog, close);

    const firstField = dialog.querySelector('input, select, textarea');
    if (firstField && window.matchMedia('(min-width: 700px)').matches) firstField.focus();
  });
}

/** Confirmacion accesible. Devuelve true/false. */
export async function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  detail = '',
}) {
  const result = await openSheet({
    title,
    body: `<p class="muted">${esc(message)}</p>${detail ? `<div class="notice notice--info mt-md">${detail}</div>` : ''}`,
    footer: `
      <button type="button" class="btn btn--ghost" data-sheet-close>${esc(cancelLabel)}</button>
      <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${esc(confirmLabel)}</button>`,
    onMount: (dialog, close) => {
      dialog.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    },
  });
  return result === true;
}

/* -------------------------------------------------------------------------- */
/* Estados de interfaz                                                         */
/* -------------------------------------------------------------------------- */

export function emptyState({ title, text, actionLabel, action, center = false }) {
  return `<div class="empty ${center ? 'empty--center' : ''}">
    <span class="empty__rule" aria-hidden="true"></span>
    <p class="empty__title">${esc(title)}</p>
    ${text ? `<p class="empty__text">${esc(text)}</p>` : ''}
    ${actionLabel ? `<button type="button" class="btn btn--ghost btn--sm" data-action="${esc(action)}">${esc(actionLabel)}</button>` : ''}
  </div>`;
}

export function errorState({ title = 'No hemos podido cargar esto', message, retryAction = 'retry' }) {
  return `<div class="error-state" role="alert">
    <h3>${esc(title)}</h3>
    <p>${esc(message || 'Comprueba tu conexión e inténtalo de nuevo.')}</p>
    <button type="button" class="btn btn--ghost btn--sm" data-action="${esc(retryAction)}">Reintentar</button>
  </div>`;
}

export function skeletonList(rows = 3) {
  return Array.from({ length: rows }, () => `
    <div class="skeleton-row">
      <div class="skeleton skeleton-row__bar"></div>
      <div class="skeleton-row__main">
        <div class="skeleton" style="height:12px;width:58%"></div>
        <div class="skeleton" style="height:10px;width:34%"></div>
      </div>
    </div>`).join('');
}

export function loadingScreen(message = 'Cargando tu Trazia') {
  return `<div class="loading-screen">
    ${symbolMarkup({ size: 40 })}
    <p class="muted small">${esc(message)}</p>
  </div>`;
}

export function noticeMarkup(message, variant = 'info', title = '') {
  const iconName = variant === 'error' ? 'aviso' : variant === 'success' ? 'check' : 'info';
  return `<div class="notice notice--${esc(variant)}" ${variant === 'error' ? 'role="alert"' : 'role="status"'}>
    <span class="notice__icon">${icon(iconName, { size: 19 })}</span>
    <div>${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>
  </div>`;
}

/** Marca visualmente que algo se ha guardado. */
export function flashSaved(element) {
  if (!element) return;
  element.classList.remove('is-saved');
  void element.offsetWidth;
  element.classList.add('is-saved');
}

/** Aplica sombra a las cabeceras pegajosas al hacer scroll. */
export function watchStickyHeader(element) {
  if (!element) return;
  const update = () => element.classList.toggle('is-stuck', window.scrollY > 4);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

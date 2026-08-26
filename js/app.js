/**
 * Shell de la aplicacion: sesion, carga de datos, onboarding y navegacion.
 *
 * Es una aplicacion de una sola pagina con rutas por hash (#/inicio, #/notas...)
 * para que funcione como sitio estatico en Netlify sin reglas de servidor.
 */
import {
  isConfigured, getSupabase, ensureSessionFromUrl, translateAuthError, signOut,
} from './supabase.js';
import * as store from './store.js';
import {
  qs, icon, toast, symbolMarkup, wordmarkMarkup, esc, openSheet, watchStickyHeader,
  loadingScreen, errorState,
} from './ui.js';
import { initials } from './format.js';
import { renderNotConfigured } from './setup.js';
import { mountOnboarding } from './views/onboarding.js';

import * as HomeView from './views/home.js';
import * as ScheduleView from './views/schedule.js';
import * as GradesView from './views/grades.js';
import * as HabitsView from './views/habits.js';
import * as JournalView from './views/journal.js';
import * as BooksView from './views/books.js';
import * as FocusView from './views/focus.js';
import * as CountdownsView from './views/countdowns.js';
import * as SettingsView from './views/settings.js';

const root = qs('#root');

const ROUTES = {
  inicio: { label: 'Inicio', icon: 'inicio', view: HomeView, primary: true },
  horario: { label: 'Horario', icon: 'horario', view: ScheduleView, primary: true },
  notas: { label: 'Notas', icon: 'notas', view: GradesView, primary: true },
  habitos: { label: 'Hábitos', icon: 'habitos', view: HabitsView, primary: true },
  diario: { label: 'Diario', icon: 'diario', view: JournalView },
  libros: { label: 'Libros', icon: 'libros', view: BooksView },
  concentracion: { label: 'Concentración', icon: 'concentracion', view: FocusView },
  'cuenta-atras': { label: 'Cuenta atrás', icon: 'cuenta', view: CountdownsView },
  ajustes: { label: 'Ajustes', icon: 'ajustes', view: SettingsView },
};

const SECONDARY = ['diario', 'libros', 'concentracion', 'cuenta-atras', 'ajustes'];

let destroyCurrentView = null;
let unsubscribeShell = null;

/* -------------------------------------------------------------------------- */
/* Arranque                                                                    */
/* -------------------------------------------------------------------------- */

async function start() {
  if (!isConfigured()) {
    renderNotConfigured(root);
    return;
  }

  try {
    const urlResult = await ensureSessionFromUrl();
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      const reason = urlResult.error ? `?aviso=${encodeURIComponent(urlResult.error)}` : '';
      window.location.replace(`auth.html${reason}`);
      return;
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        store.reset();
        window.location.replace('auth.html');
      }
    });

    await loadData(data.session);
  } catch (error) {
    renderBootError(translateAuthError(error));
  }
}

async function loadData(session) {
  root.innerHTML = loadingScreen();
  try {
    await store.loadAll(session);
    if (!store.state.profile?.onboarding_completed) {
      renderOnboarding();
    } else {
      renderShell();
    }
  } catch (error) {
    if (error.isSession) {
      await signOut().catch(() => {});
      window.location.replace('auth.html');
      return;
    }
    renderBootError(error.message);
  }
}

function renderBootError(message) {
  root.innerHTML = `
    <div class="wrap" style="padding-block:64px;max-width:520px">
      ${symbolMarkup({ size: 38 })}
      <h1 class="mt-md" style="font-size:1.7rem">No hemos podido abrir Trazia</h1>
      <p class="lede mt-sm">${esc(message)}</p>
      <div class="btn-row mt-lg">
        <button type="button" class="btn btn--primary" id="retry">Reintentar</button>
        <button type="button" class="btn btn--ghost" id="logout">Cerrar sesión</button>
      </div>
    </div>`;
  qs('#retry', root).addEventListener('click', () => window.location.reload());
  qs('#logout', root).addEventListener('click', async () => {
    await signOut().catch(() => {});
    window.location.replace('auth.html');
  });
}

function renderOnboarding() {
  if (destroyCurrentView) { destroyCurrentView(); destroyCurrentView = null; }
  root.innerHTML = '';
  const container = document.createElement('div');
  root.appendChild(container);
  mountOnboarding(container, { onFinish: () => { renderShell(); toast('Todo listo. Bienvenida a Trazia.'); } });
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

function renderShell() {
  if (unsubscribeShell) unsubscribeShell();

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <a href="#/inicio" aria-label="Trazia, inicio">
            <span class="brand">${symbolMarkup({ size: 28 })}${wordmarkMarkup()}</span>
          </a>
        </div>
        <nav class="side-nav" aria-label="Secciones">
          ${Object.entries(ROUTES).filter(([, route]) => route.primary).map(([key, route]) => sideLink(key, route)).join('')}
          <p class="side-nav__group">Más</p>
          ${SECONDARY.filter((key) => key !== 'ajustes').map((key) => sideLink(key, ROUTES[key])).join('')}
        </nav>
        <div class="sidebar__foot">
          <button type="button" class="side-user" id="side-user">
            <span class="avatar" id="side-avatar"></span>
            <span class="grow">
              <span class="side-user__name" id="side-name"></span>
              <span class="side-user__meta">Ajustes</span>
            </span>
            ${icon('siguiente', { size: 16 })}
          </button>
        </div>
      </aside>

      <div class="app-main">
        <header class="topbar" id="topbar">
          <span class="topbar__title" id="topbar-title">Inicio</span>
          <div class="topbar__actions">
            <button type="button" class="icon-btn" id="topbar-profile" aria-label="Ajustes de tu cuenta">
              <span class="avatar" style="width:30px;height:30px;font-size:.74rem" id="topbar-avatar"></span>
            </button>
          </div>
        </header>
        <main id="vista" tabindex="-1"></main>
      </div>

      <nav class="bottom-nav" aria-label="Navegación principal">
        ${Object.entries(ROUTES).filter(([, route]) => route.primary).map(([key, route]) => `
          <a class="bottom-nav__item" href="#/${key}" data-nav="${key}">
            ${icon(route.icon, { size: 22 })}<span>${esc(route.label)}</span>
          </a>`).join('')}
        <button type="button" class="bottom-nav__item" id="nav-mas">
          ${icon('mas', { size: 22 })}<span>Más</span>
        </button>
      </nav>
    </div>`;

  watchStickyHeader(qs('#topbar', root));
  qs('#nav-mas', root).addEventListener('click', openMoreSheet);
  qs('#side-user', root).addEventListener('click', () => navigate('ajustes'));
  qs('#topbar-profile', root).addEventListener('click', () => navigate('ajustes'));

  const paintUser = () => {
    const name = store.state.profile?.display_name || 'Tu cuenta';
    qs('#side-name', root).textContent = name;
    qs('#side-avatar', root).textContent = initials(name);
    qs('#topbar-avatar', root).textContent = initials(name);
  };
  paintUser();
  unsubscribeShell = store.subscribe(paintUser);

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function sideLink(key, route) {
  return `<a class="side-link" href="#/${key}" data-nav="${key}">${icon(route.icon)}<span>${esc(route.label)}</span></a>`;
}

function currentRouteKey() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[hash] ? hash : 'inicio';
}

export function navigate(key) {
  if (currentRouteKey() === key) {
    handleRoute();
    return;
  }
  window.location.hash = `#/${key}`;
}

function handleRoute() {
  const key = currentRouteKey();
  const route = ROUTES[key];
  const container = qs('#vista', root);
  if (!container) return;

  if (destroyCurrentView) {
    try { destroyCurrentView(); } catch { /* la vista ya estaba desmontada */ }
    destroyCurrentView = null;
  }

  document.title = key === 'inicio' ? 'Trazia' : `${route.label} — Trazia`;
  qs('#topbar-title', root).textContent = route.label;

  root.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === key);
    if (link.dataset.nav === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  container.innerHTML = '';
  const section = document.createElement('section');
  section.className = 'view-enter';
  container.appendChild(section);

  try {
    destroyCurrentView = route.view.mount(section, { navigate });
  } catch (error) {
    section.innerHTML = `<div class="wrap view">${errorState({ message: error.message })}</div>`;
    section.querySelector('[data-action="retry"]')?.addEventListener('click', handleRoute);
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openMoreSheet() {
  const current = currentRouteKey();
  openSheet({
    title: 'Más',
    body: `<div class="menu-list">
      ${SECONDARY.map((key) => `
        <button type="button" class="menu-item ${key === current ? 'is-active' : ''}" data-go="${key}">
          ${icon(ROUTES[key].icon)}<span>${esc(ROUTES[key].label)}</span>
          <span class="menu-item__chev">${icon('siguiente', { size: 16 })}</span>
        </button>`).join('')}
      <button type="button" class="menu-item" data-logout>
        ${icon('salir')}<span>Cerrar sesión</span>
      </button>
    </div>`,
    onMount: (dialog, close) => {
      dialog.querySelectorAll('[data-go]').forEach((button) => {
        button.addEventListener('click', () => { close(); navigate(button.dataset.go); });
      });
      dialog.querySelector('[data-logout]').addEventListener('click', async () => {
        close();
        await signOut().catch(() => {});
        window.location.replace('auth.html');
      });
    },
  });
}

/* Si una operacion revela que la sesion ha caducado, salimos con aviso. */
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error && error.isSession) {
    event.preventDefault();
    toast('Tu sesión ha caducado. Vuelve a iniciar sesión.', 'error');
    setTimeout(async () => {
      await signOut().catch(() => {});
      window.location.replace('auth.html');
    }, 1400);
  }
});

start();

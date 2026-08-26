/**
 * Intro de Trazia: tres pantallas que se pasan tocando y acaban en el acceso.
 * Es la puerta de entrada; si ya hay sesión, se salta entera.
 */
import { isConfigured, getSession } from './supabase.js';
import { qs, qsa } from './ui.js';
import { renderNotConfigured } from './setup.js';

if (!isConfigured()) {
  renderNotConfigured(document.body);
} else {
  getSession()
    .then((session) => { if (session) window.location.replace('app.html'); })
    .catch(() => { /* sin sesión válida: se queda la intro */ });

  const intro = qs('#intro');
  const slides = qsa('.intro__slide', intro);
  const dots = qsa('.intro__dot', intro);
  const hint = qs('#intro-hint');
  let index = 0;

  const show = (next) => {
    if (next < 0 || next >= slides.length || next === index) return;
    index = next;
    slides.forEach((slide, i) => { slide.hidden = i !== index; });
    dots.forEach((dot, i) => dot.classList.toggle('is-on', i <= index));
    // En la última pantalla el aviso de "toca para seguir" ya no aplica.
    hint.hidden = index === slides.length - 1;
    const focusable = slides[index].querySelector('a, button');
    if (focusable && index === slides.length - 1) focusable.focus();
  };

  const advance = () => show(index + 1);

  intro.addEventListener('click', (event) => {
    if (event.target.closest('a, .btn')) return;
    advance();
  });
  intro.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); advance(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
  });
}

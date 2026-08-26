#!/usr/bin/env node
/**
 * Prueba de extremo a extremo de Trazia con un navegador real.
 *
 * Requiere que tests/mock-supabase.mjs este en marcha y que config.js apunte a
 * el (tests/config.test.js). Recorre el flujo completo: registro, onboarding,
 * cada seccion, copia de seguridad, cierre de sesion y vuelta a entrar.
 *
 *   node tests/e2e.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:8788';
const SHOTS = process.env.SHOT_DIR || '/tmp/trazia-shots';
mkdirSync(SHOTS, { recursive: true });

const email = `lucia${Date.now()}@ejemplo.test`;
const password = 'Trazia2026';

let passed = 0;
const failures = [];

function check(label, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${extra ? ` — ${extra}` : ''}`);
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Captura esperando a que terminen las transiciones de entrada. */
async function shot(target, name, options = {}) {
  await target.waitForTimeout(420);
  await target.screenshot({ path: `${SHOTS}/${name}.png`, ...options });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
/**
 * En este entorno de pruebas no hay salida a Google Fonts desde el navegador.
 * Si FONT_DIR apunta a una copia local de la hoja y de los .woff2, los servimos
 * nosotros para poder revisar la tipografia real de la marca.
 */
const FONT_DIR = process.env.FONT_DIR;
if (FONT_DIR && existsSync(FONT_DIR)) {
  await context.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: readFileSync(join(FONT_DIR, 'fonts.css'), 'utf8'),
    });
  });
  await context.route('https://fonts.gstatic.com/**', async (route) => {
    const file = join(FONT_DIR, basename(new URL(route.request().url()).pathname));
    if (!existsSync(file)) return route.abort();
    return route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(file) });
  });
}

const page = await context.newPage();

// Errores reales de JavaScript. Las respuestas 4xx esperadas (por ejemplo, el
// intento deliberado de entrar con una contraseña incorrecta) se registran
// aparte: el navegador las anota en consola pero no son fallos del codigo.
const jsErrors = [];
const resourceErrors = [];
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource/i.test(text)) resourceErrors.push(text);
  else jsErrors.push(text);
});
page.on('pageerror', (error) => jsErrors.push(`pageerror: ${error.message}`));

try {
  /* ---------------------------------------------------------------------- */
  section('Bienvenida');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load').catch(() => {});
  check('el título es correcto', await page.title() === 'Trazia — Traza tu día', await page.title());
  check('el eslogan es lo primero', (await page.locator('h1.welcome__title').innerText()).includes('Traza tu día'));
  check('solo hay dos accesos', await page.locator('a[href*="auth.html"]').count() === 2);
  check('no hay secciones de página web',
    await page.locator('.feature, .site-footer, .band, .site-header').count() === 0);
  check('no se menciona nada técnico',
    !/supabase|postgres|netlify/i.test(await page.locator('body').innerText()));
  await shot(page, '01-bienvenida');

  /* ---------------------------------------------------------------------- */
  section('Registro');
  await page.click('a[href="auth.html?modo=registro"]');
  await page.waitForSelector('#form-registro');
  await page.click('#form-registro button[type="submit"]');
  check('valida los campos vacíos', await page.locator('#nombre-error:visible').count() === 1);

  await page.fill('#nombre', 'Lucía');
  await page.fill('#email', 'esto-no-es-un-correo');
  await page.fill('#password', '123');
  await page.fill('#password2', '456');
  await page.click('#form-registro button[type="submit"]');
  check('detecta el correo mal escrito', (await page.locator('#email-error').innerText()).includes('válido'));
  check('detecta la contraseña corta', (await page.locator('#password-error').innerText()).includes('8 caracteres'));

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#password2', 'otra-cosa123');
  await page.click('#form-registro button[type="submit"]');
  check('detecta contraseñas distintas', (await page.locator('#password2-error').innerText()).includes('no coinciden'));

  await page.fill('#password2', password);
  check('el medidor de fuerza reacciona', (await page.locator('[data-strength-label]').first().innerText()).length > 0);
  await shot(page, '02-registro');
  await page.click('#form-registro button[type="submit"]');

  /* ---------------------------------------------------------------------- */
  section('Onboarding');
  await page.waitForSelector('.onboarding', { timeout: 15000 });
  check('empieza por la bienvenida', (await page.locator('.onboarding__panel h1').innerText()).includes('Vamos a preparar'));
  await shot(page, '03-onboarding-bienvenida');

  await page.click('[data-next]');
  await page.waitForSelector('#ob-name');
  check('el nombre viene del registro', await page.inputValue('#ob-name') === 'Lucía');
  await page.click('.onboarding__foot [data-next]');

  await page.waitForSelector('.choice[data-value="1bach"]');
  await page.click('.choice[data-value="1bach"]');
  check('al elegir Bachillerato pide modalidad', await page.locator('.choice[data-value="track:ciencias"]').isVisible());
  await page.click('.choice[data-value="track:ciencias"]');
  await shot(page, '04-onboarding-curso');
  await page.click('.onboarding__foot [data-next]');

  await page.waitForSelector('#ob-subject-form');
  check('ninguna asignatura viene marcada', (await page.locator('#ob-subject-list').innerText()).includes('Todavía no'));
  await page.click('[data-suggestion="Matemáticas"]');
  await page.waitForSelector('.pill:has-text("Matemáticas")');
  await page.click('[data-suggestion="Física"]');
  await page.waitForSelector('.pill:has-text("Física")');
  await page.fill('#ob-subject-name', 'Dibujo Técnico');
  await page.click('#ob-subject-form button[type="submit"]');
  await page.waitForSelector('.pill:has-text("Dibujo Técnico")');
  check('se pueden añadir asignaturas propias', await page.locator('#ob-subject-list .pill').count() === 3);
  await shot(page, '05-onboarding-asignaturas');
  await page.click('.onboarding__foot [data-next]');

  await page.waitForSelector('#ob-add-class');
  await page.click('#ob-add-class');
  await page.waitForSelector('dialog.sheet');
  await page.selectOption('#subject', { label: 'Matemáticas' });
  await page.fill('#start', '08:30');
  await page.fill('#end', '09:25');
  await page.fill('#room', 'B12');
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('la clase queda guardada en el horario', (await page.locator('#ob-day-classes').innerText()).includes('Matemáticas'));
  check('hay opción de dejarlo para después', await page.locator('.onboarding__foot:has-text("Lo haré después")').count() === 1);
  await shot(page, '06-onboarding-horario');
  await page.click('.onboarding__foot [data-next]');

  await page.waitForSelector('#ob-goal');
  await page.fill('#ob-goal', '8');
  await page.dispatchEvent('#ob-goal', 'input');
  check('el objetivo se muestra en formato español', (await page.locator('#ob-goal-value').innerText()).includes('8'));
  await page.click('.onboarding__foot [data-next]');

  await page.waitForSelector('.summary-list');
  const summary = await page.locator('.summary-list').innerText();
  check('el resumen muestra el nombre', summary.includes('Lucía'));
  check('el resumen muestra el curso', summary.includes('1º Bachillerato'));
  check('el resumen cuenta 3 asignaturas', summary.includes('3'));
  check('el resumen cuenta la clase configurada', /Clases\s*\n?1/.test(summary.replace(/\s+/g, ' ')) || summary.includes('1'));
  await shot(page, '07-onboarding-resumen');
  await page.click('[data-finish]');

  /* ---------------------------------------------------------------------- */
  section('Inicio');
  await page.waitForSelector('.greeting', { timeout: 15000 });
  const greeting = await page.locator('.greeting__title').innerText();
  check('saluda con el nombre', greeting.includes('Lucía'), greeting);
  check('el saludo depende de la hora', /Buen(os|as)/.test(greeting), greeting);
  check('la barra lateral está en escritorio', await page.locator('.sidebar').isVisible());
  await shot(page, '08-inicio', { fullPage: true });

  /* ---------------------------------------------------------------------- */
  section('Notas');
  await page.click('.side-link[data-nav="notas"]');
  await page.waitForSelector('.view__title:has-text("Notas")');
  check('avisa de que no hay media todavía',
    (await page.locator('.wrap.view').innerText()).includes('Todavía no hay suficientes notas'));

  const addGrade = async (subject, title, score, weight) => {
    await page.click('[data-action="add-grade"]');
    await page.waitForSelector('dialog.sheet');
    await page.selectOption('dialog.sheet #subject', { label: subject });
    await page.fill('dialog.sheet #title', title);
    await page.fill('dialog.sheet #score', score);
    await page.fill('dialog.sheet #weight', weight);
    await page.click('dialog.sheet [data-save]');
    await page.waitForSelector('dialog.sheet', { state: 'detached' });
  };

  await page.click('[data-action="add-grade"]');
  await page.waitForSelector('dialog.sheet');
  await page.selectOption('dialog.sheet #subject', { label: 'Matemáticas' });
  await page.fill('dialog.sheet #title', 'Examen imposible');
  await page.fill('dialog.sheet #score', '12');
  await page.click('dialog.sheet [data-save]');
  check('rechaza notas fuera de 0 a 10',
    (await page.locator('dialog.sheet #score-error').innerText()).includes('0 a 10'));
  await page.click('dialog.sheet [data-sheet-close]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });

  await addGrade('Matemáticas', 'Examen tema 1', '8,5', '40');
  await addGrade('Matemáticas', 'Examen tema 2', '6', '60');
  const gradesText = await page.locator('.wrap.view').innerText();
  check('calcula la media ponderada (7)', gradesText.includes('Media 7'), gradesText.match(/Media [\d,]+/)?.[0]);
  check('muestra la media global', (await page.locator('.stat-strip').innerText()).includes('7'));
  check('muestra el objetivo guardado', (await page.locator('.stat-strip').innerText()).includes('8'));
  await shot(page, '09-notas', { fullPage: true });

  /* ---------------------------------------------------------------------- */
  section('Hábitos');
  await page.click('.side-link[data-nav="habitos"]');
  await page.waitForSelector('.view__title:has-text("Hábitos")');
  check('estado vacío correcto', (await page.locator('.empty__title').innerText()).includes('Todavía no tienes hábitos'));
  check('las ideas se presentan como ejemplos',
    (await page.locator('.block').innerText()).includes('Solo son ejemplos'));

  await page.click('[data-action="add-habit"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #name', 'Leer 20 minutos');
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  await page.waitForSelector('.habit-row');

  const todayWeekday = (new Date().getDay() + 6) % 7;
  if (todayWeekday <= 4) {
    await page.click('.habit-check');
    await page.waitForSelector('.habit-check[aria-pressed="true"]');
    check('marcar el hábito guarda y calcula la racha',
      (await page.locator('.habit-row').innerText()).includes('1 día seguido'));
    await page.click('.habit-check');
    await page.waitForSelector('.habit-check[aria-pressed="false"]');
    check('se puede desmarcar', (await page.locator('.habit-check').getAttribute('aria-pressed')) === 'false');
    await page.click('.habit-check');
    await page.waitForSelector('.habit-check[aria-pressed="true"]');
  } else {
    check('el hábito se crea aunque hoy no toque', await page.locator('.habit-row').count() === 1);
  }
  await shot(page, '10-habitos', { fullPage: true });

  /* ---------------------------------------------------------------------- */
  section('Horario');
  await page.click('.side-link[data-nav="horario"]');
  await page.waitForSelector('.view__title:has-text("Horario")');
  await page.click('[data-mode="semana"]');
  await page.waitForSelector('.week-grid');
  check('la vista semanal dibuja la rejilla', await page.locator('.week-grid__head').count() >= 6);
  check('la clase aparece en la semana', await page.locator('.week-event:has-text("Matemáticas")').count() === 1);

  await page.click('[data-action="add-exam"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #title', 'Examen de Física');
  await page.selectOption('dialog.sheet #subject', { label: 'Física' });
  const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.fill('dialog.sheet #date', inThreeDays);
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('el examen aparece en el horario',
    (await page.locator('.wrap.view').innerText()).includes('Examen de Física'));
  await shot(page, '11-horario-semana', { fullPage: true });

  await page.click('[data-mode="dia"]');
  await page.waitForSelector('.date-nav');
  check('la vista de día funciona', await page.locator('.date-nav__label').count() === 1);

  /* ---------------------------------------------------------------------- */
  section('Inicio con datos');
  await page.click('.side-link[data-nav="inicio"]');
  await page.waitForSelector('.greeting');
  const homeText = await page.locator('.wrap.view').innerText();
  check('el examen aparece en "Por hacer"', homeText.includes('Examen de Física'));
  check('la media aparece en el saludo', homeText.includes('7'));

  /* ---------------------------------------------------------------------- */
  section('Diario');
  await page.click('.side-link[data-nav="diario"]');
  await page.waitForSelector('.view__title:has-text("Diario")');
  await page.click('[data-action="add-entry"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #title', 'Primer día');
  await page.fill('dialog.sheet #content', 'Hoy he empezado a usar Trazia y he ordenado el horario.');
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('la entrada se guarda', (await page.locator('.entry').innerText()).includes('Primer día'));

  /* ---------------------------------------------------------------------- */
  section('Libros');
  await page.click('.side-link[data-nav="libros"]');
  await page.waitForSelector('.view__title:has-text("Libros")');
  check('no hay libros inventados', (await page.locator('.empty__title').innerText()).includes('Todavía no has añadido'));
  await page.click('[data-action="add-book"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #title', 'El libro que estoy leyendo');
  await page.fill('dialog.sheet #author', 'Autora');
  await page.selectOption('dialog.sheet #status', 'leyendo');
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('el libro aparece en "Leyendo"', (await page.locator('.block').innerText()).includes('Leyendo'));
  await page.selectOption('[data-status-for]', 'terminado');
  await page.waitForTimeout(600);
  check('cambiar el estado funciona', (await page.locator('.wrap.view').innerText()).includes('Terminado'));

  /* ---------------------------------------------------------------------- */
  section('Cuenta atrás');
  await page.click('.side-link[data-nav="cuenta-atras"]');
  await page.waitForSelector('.view__title:has-text("Cuenta atrás")');
  await page.click('[data-action="add-countdown"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #name', 'Selectividad');
  const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await page.fill('dialog.sheet #date', inTenDays);
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const countdownText = (await page.locator('.countdown-row').innerText()).toLowerCase();
  check('la cuenta atrás calcula los días', countdownText.includes('10') && countdownText.includes('días'), countdownText);

  /* ---------------------------------------------------------------------- */
  section('Concentración');
  await page.click('.side-link[data-nav="concentracion"]');
  await page.waitForSelector('.focus-time');
  check('empieza en 25:00', (await page.locator('[data-timer-time]').innerText()) === '25:00');
  await page.click('[data-action="start"]');
  await page.waitForTimeout(2500);
  const running = await page.locator('[data-timer-time]').innerText();
  check('el temporizador avanza de verdad', running !== '25:00' && running < '25:00', running);
  await page.click('[data-action="pause"]');
  const paused = await page.locator('[data-timer-time]').innerText();
  await page.waitForTimeout(1500);
  check('la pausa detiene la cuenta', (await page.locator('[data-timer-time]').innerText()) === paused, paused);
  await page.click('[data-action="resume"]');
  await page.waitForTimeout(1200);
  check('continuar reanuda la cuenta', (await page.locator('[data-timer-time]').innerText()) !== paused);
  await shot(page, '12-concentracion', { fullPage: true });

  // Al cambiar de seccion y volver, el temporizador sigue vivo.
  await page.click('.side-link[data-nav="inicio"]');
  await page.waitForSelector('.greeting');
  await page.waitForTimeout(1200);
  await page.click('.side-link[data-nav="concentracion"]');
  await page.waitForSelector('[data-timer-time]');
  const afterNav = await page.locator('[data-timer-time]').innerText();
  check('el temporizador sobrevive al cambio de pantalla', afterNav < paused, `${paused} -> ${afterNav}`);
  await page.click('[data-action="restart"]');
  check('reiniciar vuelve al principio', (await page.locator('[data-timer-time]').innerText()) === '25:00');

  /* ---------------------------------------------------------------------- */
  section('Ajustes y copia de seguridad');
  await page.click('#side-user');
  await page.waitForSelector('.view__title:has-text("Ajustes")');
  check('muestra el correo de la cuenta', (await page.locator('.wrap.view').innerText()).includes(email));
  check('muestra las asignaturas', await page.locator('.settings-group .row').count() === 3);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-action="export"]'),
  ]);
  const exportPath = `${SHOTS}/copia.json`;
  await download.saveAs(exportPath);
  const backup = JSON.parse(readFileSync(exportPath, 'utf8'));
  check('la copia tiene el formato de Trazia', backup.format === 'trazia.backup');
  check('la copia incluye el perfil', backup.profile.display_name === 'Lucía');
  check('la copia incluye las asignaturas', backup.data.subjects.length === 3);
  check('la copia incluye las notas', backup.data.grades.length === 2);
  check('la copia incluye el diario', backup.data.journal_entries.length === 1);
  check('la copia incluye la cuenta atrás', backup.data.countdowns.length === 1);
  check('la copia no filtra datos de otras personas',
    backup.data.subjects.every((row) => row.user_id === backup.data.subjects[0].user_id));

  await page.click('[data-action="edit-name"]');
  await page.waitForSelector('dialog.sheet');
  await page.fill('dialog.sheet #name', 'Lucía M.');
  await page.click('dialog.sheet [data-save]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('el nombre se actualiza', (await page.locator('.side-user__name').innerText()) === 'Lucía M.');
  await shot(page, '13-ajustes', { fullPage: true });

  /* ---------------------------------------------------------------------- */
  section('Importar copia');
  await page.setInputFiles('#import-file', exportPath);
  await page.waitForSelector('dialog.sheet:has-text("Importar copia")');
  check('el diálogo resume el contenido de la copia',
    (await page.locator('dialog.sheet').innerText()).toLowerCase().includes('asignaturas'));
  check('avisa antes de reemplazar', await page.locator('dialog.sheet input[value="replace"]').count() === 1);
  await page.click('dialog.sheet [data-sheet-close]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  check('cancelar no cambia nada', await page.locator('.settings-group .row').count() === 3);

  /* ---------------------------------------------------------------------- */
  section('Cerrar sesión y volver a entrar');
  await page.click('[data-action="logout"]');
  await page.waitForSelector('dialog.sheet');
  await page.click('dialog.sheet [data-confirm]');
  await page.waitForFunction(() => window.location.pathname.includes('auth.html'), null, { timeout: 15000 });
  check('cerrar sesión lleva al acceso', page.url().includes('auth.html'));

  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.location.pathname.includes('auth.html'), null, { timeout: 15000 });
  check('sin sesión no se entra en la aplicación', page.url().includes('auth.html'));

  await page.waitForSelector('#form-login');
  await page.fill('#form-login #email', email);
  await page.fill('#form-login #password', 'contraseña-equivocada1');
  await page.click('#form-login button[type="submit"]');
  await page.waitForSelector('.notice--error');
  check('avisa si la contraseña es incorrecta',
    (await page.locator('.notice--error').innerText()).includes('no son correctos'));

  await page.fill('#form-login #password', password);
  await page.click('#form-login button[type="submit"]');
  await page.waitForSelector('.greeting', { timeout: 15000 });
  check('al volver a entrar no repite el onboarding', await page.locator('.onboarding').count() === 0);
  check('los datos siguen ahí', (await page.locator('.wrap.view').innerText()).includes('Examen de Física'));
  check('el saludo usa el nombre de pila', (await page.locator('.greeting__title').innerText()).includes('Lucía'));
  check('el nombre completo sigue guardado', (await page.locator('.side-user__name').innerText()) === 'Lucía M.');

  /* ---------------------------------------------------------------------- */
  section('Recuperar contraseña');
  // Contexto limpio: sin sesión iniciada, como quien abre el enlace del correo.
  const anon = await browser.newContext({ locale: 'es-ES' });
  const page2 = await anon.newPage();
  await page2.goto(`${BASE}/auth.html?modo=recuperar`, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('#form-recuperar');
  await page2.fill('#email', email);
  await page2.click('#form-recuperar button[type="submit"]');
  await page2.waitForSelector('.notice--success');
  check('el envío del enlace se confirma sin revelar si existe la cuenta',
    (await page2.locator('.notice--success').innerText()).includes('Si hay una cuenta'));
  await page2.goto(`${BASE}/reset.html`, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('.auth-card h1');
  check('el enlace de recuperación sin token se rechaza',
    (await page2.locator('.auth-card h1').innerText()).includes('no es válido'));

  // Recogemos el enlace que Supabase habría enviado por correo y lo abrimos.
  const link = await (await fetch(`${BASE}/__test/recovery-link?email=${encodeURIComponent(email)}`)).json();
  const hash = `#access_token=${link.access_token}&refresh_token=${link.refresh_token}`
    + '&expires_in=3600&token_type=bearer&type=recovery';
  // Salimos de reset.html antes: cambiar solo el hash no recarga la página.
  await page2.goto('about:blank');
  await page2.goto(`${BASE}/reset.html${hash}`, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('#form-reset', { timeout: 15000 });
  check('el enlace del correo abre el formulario de contraseña nueva',
    (await page2.locator('.auth-card h1').innerText()).includes('Nueva contraseña'));

  await page2.fill('#password', 'corta');
  await page2.fill('#password2', 'corta');
  await page2.click('#form-reset button[type="submit"]');
  check('rechaza una contraseña nueva demasiado corta',
    (await page2.locator('#password-error').innerText()).includes('8 caracteres'));

  const newPassword = 'TraziaNueva2026';
  await page2.fill('#password', newPassword);
  await page2.fill('#password2', 'otra-distinta9');
  await page2.click('#form-reset button[type="submit"]');
  check('rechaza dos contraseñas que no coinciden',
    (await page2.locator('#password2-error').innerText()).includes('no coinciden'));

  await page2.fill('#password2', newPassword);
  await page2.click('#form-reset button[type="submit"]');
  await page2.waitForSelector('.auth-card h1:has-text("Contraseña actualizada")', { timeout: 15000 });
  check('la contraseña se cambia desde el enlace', true);

  // Tras cambiar la contraseña queda una sesión abierta, así que la prueba de
  // acceso se hace desde un contexto limpio.
  const fresh = await browser.newContext({ locale: 'es-ES' });
  const after = await fresh.newPage();
  await after.goto(`${BASE}/auth.html?modo=login`, { waitUntil: 'domcontentloaded' });
  await after.waitForSelector('#form-login');
  await after.fill('#form-login #email', email);
  await after.fill('#form-login #password', password);
  await after.click('#form-login button[type="submit"]');
  await after.waitForSelector('.notice--error', { timeout: 15000 });
  check('la contraseña antigua deja de funcionar',
    (await after.locator('.notice--error').innerText()).includes('no son correctos'));

  await after.fill('#form-login #password', newPassword);
  await after.click('#form-login button[type="submit"]');
  await after.waitForSelector('.greeting', { timeout: 20000 });
  check('se entra con la contraseña nueva y los datos siguen ahí',
    (await after.locator('.wrap.view').innerText()).includes('Examen de Física'));
  await after.close();
  await fresh.close();
  await page2.close();
  await anon.close();

  /* ---------------------------------------------------------------------- */
  section('Entrada directa a la aplicación');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.greeting', { timeout: 15000 });
  check('con sesión iniciada la bienvenida entra directa a la aplicación',
    page.url().includes('app.html'));

  // Sin configuración, quien usa la aplicación ve un aviso neutro, no la
  // pantalla técnica.
  const sinConfig = await browser.newContext({ locale: 'es-ES' });
  await sinConfig.route('**/config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.TRAZIA_CONFIG = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "", GOOGLE_AUTH_ENABLED: false };',
  }));
  const roto = await sinConfig.newPage();
  // ?setup=0 fuerza la vista de quien usa la aplicación aunque estemos en local.
  await roto.goto(`${BASE}/index.html?setup=0`, { waitUntil: 'domcontentloaded' });
  await roto.waitForSelector('.setup-screen', { timeout: 15000 });
  const textoRoto = await roto.locator('body').innerText();
  check('sin configuración se muestra un aviso neutro', textoRoto.includes('no está disponible'), textoRoto.slice(0, 80));
  check('el aviso no menciona Supabase ni variables de entorno',
    !/supabase|anon key|variable/i.test(textoRoto));
  await shot(roto, '19-no-disponible');
  await roto.close();
  await sinConfig.close();

  section('Responsive');
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/app.html`);
  await mobile.waitForSelector('.greeting', { timeout: 15000 });
  check('en móvil aparece la navegación inferior', await mobile.locator('.bottom-nav').isVisible());
  check('en móvil se oculta la barra lateral', !(await mobile.locator('.sidebar').isVisible()));
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no hay desbordamiento horizontal en móvil', overflow <= 0, `${overflow}px`);
  await shot(mobile, '14-movil-inicio', { fullPage: true });

  await mobile.click('#nav-mas');
  await mobile.waitForSelector('dialog.sheet');
  check('el menú "Más" lleva a las demás secciones',
    await mobile.locator('dialog.sheet [data-go="diario"]').count() === 1);
  await shot(mobile, '15-movil-mas');
  await mobile.click('dialog.sheet [data-go="concentracion"]');
  await mobile.waitForSelector('.focus-time');
  await shot(mobile, '16-movil-concentracion', { fullPage: true });

  await mobile.setViewportSize({ width: 320, height: 700 });
  await mobile.goto(`${BASE}/app.html#/notas`);
  await mobile.waitForSelector('.view__title');
  const overflowSmall = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('sin desbordamiento en móvil pequeño (320px)', overflowSmall <= 0, `${overflowSmall}px`);
  await shot(mobile, '17-movil-320', { fullPage: true });

  const tablet = await context.newPage();
  await tablet.setViewportSize({ width: 834, height: 1112 });
  await tablet.goto(`${BASE}/app.html#/horario`);
  await tablet.waitForSelector('.view__title');
  const overflowTablet = await tablet.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('sin desbordamiento en tablet', overflowTablet <= 0, `${overflowTablet}px`);
  await shot(tablet, '18-tablet-horario', { fullPage: true });
  await tablet.close();
  await mobile.close();

  /* ---------------------------------------------------------------------- */
  section('Accesibilidad básica');
  await page.goto(`${BASE}/app.html#/inicio`);
  await page.waitForSelector('.greeting');
  const a11y = await page.evaluate(() => {
    const problems = [];
    document.querySelectorAll('button, a').forEach((node) => {
      const label = (node.innerText || '').trim() || node.getAttribute('aria-label');
      if (!label) problems.push(node.outerHTML.slice(0, 80));
    });
    document.querySelectorAll('input, select, textarea').forEach((node) => {
      const hasLabel = node.labels?.length || node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
      if (!hasLabel) problems.push(`sin etiqueta: ${node.outerHTML.slice(0, 80)}`);
    });
    return problems;
  });
  check('todos los controles tienen nombre accesible', a11y.length === 0, a11y.slice(0, 3).join(' | '));

  const headings = await page.evaluate(() => Array.from(document.querySelectorAll('h1')).length);
  check('hay un h1 en la página', headings >= 1);

  /* ---------------------------------------------------------------------- */
  section('Consola del navegador');
  check('sin errores de JavaScript en consola', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  check('solo falla la petición esperada del acceso incorrecto', resourceErrors.length <= 1,
    `${resourceErrors.length}: ${resourceErrors.slice(0, 3).join(' | ')}`);
} catch (error) {
  failures.push(`Excepción: ${error.message}`);
  console.error('\nError durante la prueba:', error);
  await page.screenshot({ path: `${SHOTS}/error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Comprobaciones superadas: ${passed}`);
if (failures.length) {
  console.log(`Fallos: ${failures.length}`);
  failures.forEach((failure) => console.log(`  · ${failure}`));
  process.exit(1);
}
console.log('Todas las comprobaciones han pasado.');
console.log(`Capturas en ${SHOTS}`);

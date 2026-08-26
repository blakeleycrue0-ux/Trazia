#!/usr/bin/env node
/**
 * Exporta anuncio.html a fotogramas PNG y a un vídeo WebM.
 *
 *   node anuncio/render.mjs
 *
 * Recorre la línea de tiempo de la animación fotograma a fotograma con la Web
 * Animations API, así que el resultado es determinista (no depende de lo rápido
 * que vaya la máquina).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const FPS = Number(process.env.FPS || 25);
const OUT = resolve(process.env.OUT || 'anuncio/salida');
const FONT_DIR = process.env.FONT_DIR;
const PAGE = 'file://' + resolve('anuncio/anuncio.html');
const FFMPEG = process.env.FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});

/** Sirve una copia local de las tipografías cuando no hay salida a Google Fonts. */
async function conFuentes(context) {
  if (!FONT_DIR || !existsSync(FONT_DIR)) return context;
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/css; charset=utf-8',
    body: readFileSync(join(FONT_DIR, 'fonts.css'), 'utf8'),
  }));
  await context.route('https://fonts.gstatic.com/**', (route) => {
    const file = join(FONT_DIR, basename(new URL(route.request().url()).pathname));
    return existsSync(file)
      ? route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(file) })
      : route.abort();
  });
  return context;
}

async function abrir({ paused = false, ...opciones } = {}) {
  const context = await conFuentes(await browser.newContext({
    viewport: { width: 1080, height: 1920 }, locale: 'es-ES', ...opciones,
  }));
  const page = await context.newPage();
  await page.goto(PAGE + (paused ? '?paused=1' : ''), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  return { context, page };
}

// 1. Fotogramas clave, en un contexto sin grabación.
const stills = await abrir();
const duration = await stills.page.evaluate(() => window.AD_DURATION);
const claves = [1.6, 3.2, 5.0, 7.2];
for (const [i, t] of claves.entries()) {
  await stills.page.evaluate((seconds) => window.seek(seconds), t);
  await stills.page.screenshot({ path: join(OUT, `clave-${i + 1}.png`) });
}
await stills.context.close();
console.log(`${claves.length} fotogramas clave guardados`);

// 2. El vídeo: un contexto nuevo que solo reproduce la animación de una pasada,
//    para que la grabación no recoja los saltos de la pasada anterior.
const rec = await abrir({
  paused: true,
  recordVideo: { dir: join(OUT, 'video'), size: { width: 1080, height: 1920 } },
});
await rec.page.evaluate(() => window.startAd());
await rec.page.waitForTimeout(duration * 1000 + 400);

const video = rec.page.video();
await rec.context.close();
const salida = join(OUT, 'anuncio-trazia.webm');
if (video) {
  const bruto = join(OUT, 'bruto.webm');
  await video.saveAs(bruto);
  rmSync(join(OUT, 'video'), { recursive: true, force: true });
  // La grabación arranca al abrir la página, así que la animación ocupa solo el
  // tramo final: recortamos desde el final para quitar la espera inicial.
  execFileSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-sseof', `-${(duration + 0.4).toFixed(2)}`,
    '-i', bruto,
    '-c:v', 'libvpx', '-b:v', '4M', '-pix_fmt', 'yuv420p',
    salida,
  ]);
  rmSync(bruto, { force: true });
  console.log(`Listo: ${salida}`);
}
await browser.close();



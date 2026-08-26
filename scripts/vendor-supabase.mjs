#!/usr/bin/env node
/**
 * Genera vendor/supabase-js.esm.js: un unico archivo ESM con el cliente oficial
 * de Supabase, para servirlo desde el propio dominio.
 *
 * Servirlo nosotros evita depender de un CDN externo en tiempo de ejecucion y
 * permite una Content-Security-Policy mas estricta (script-src 'self').
 *
 * Uso:
 *   npm install --no-save @supabase/supabase-js esbuild
 *   node scripts/vendor-supabase.mjs
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const version = require('@supabase/supabase-js/package.json').version;
const outfile = 'vendor/supabase-js.esm.js';

await build({
  // Reexportamos el paquete para que esbuild use su entrada ESM y conserve las
  // exportaciones con nombre (createClient).
  stdin: {
    contents: "export * from '@supabase/supabase-js';",
    resolveDir: process.cwd(),
    sourcefile: 'trazia-supabase-entry.js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  outfile,
});

const banner = `/* @supabase/supabase-js v${version} - MIT License - https://github.com/supabase/supabase-js
   Archivo generado con scripts/vendor-supabase.mjs. No lo edites a mano. */\n`;
writeFileSync(outfile, banner + readFileSync(outfile, 'utf8'));
console.log(`✓ ${outfile} generado con @supabase/supabase-js ${version}`);

#!/usr/bin/env node
/** Comprueba la sintaxis de todos los modulos JS del proyecto. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(path);
  }
  return out;
}

const files = [...walk('js'), 'config.js', ...walk('scripts')];
let failed = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  try {
    new vm.SourceTextModule(source, { identifier: file });
  } catch (error) {
    failed++;
    console.error(`✗ ${file}: ${error.message}`);
  }
}
console.log(failed ? `${failed} archivo(s) con errores` : `${files.length} archivos sin errores de sintaxis`);
process.exit(failed ? 1 : 0);

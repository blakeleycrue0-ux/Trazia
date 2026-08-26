#!/usr/bin/env node
/**
 * Comprobaciones estaticas ligeras del proyecto:
 *  - importaciones que no se usan
 *  - nombres importados que el modulo de origen no exporta
 *  - acciones data-action sin un manejador que las mencione
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.js')) out.push(path);
  }
  return out;
}

const files = walk('js');
const sources = new Map(files.map((file) => [resolve(file), readFileSync(file, 'utf8')]));

function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

let problems = 0;
const report = (file, message) => { problems++; console.log(`  ${relative('.', file)}: ${message}`); };

for (const [file, source] of sources) {
  const body = source.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?$/gm, '');

  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1].trim();
    const specifier = match[2];
    const namespace = clause.match(/^\*\s+as\s+([A-Za-z0-9_$]+)$/);
    const named = clause.match(/\{([\s\S]*)\}/);
    const targetPath = specifier.startsWith('.') ? resolve(dirname(file), specifier) : null;
    const targetExports = targetPath && sources.has(targetPath) ? exportsOf(sources.get(targetPath)) : null;

    const check = (name, original) => {
      const used = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(body);
      if (!used) report(file, `importa "${name}" de ${specifier} pero no lo usa`);
      if (targetExports && !targetExports.has(original)) {
        report(file, `importa "${original}" de ${specifier}, que no lo exporta`);
      }
    };

    if (namespace) {
      // Los espacios de nombres (import * as x) no exigen exportaciones concretas.
      const name = namespace[1];
      if (!new RegExp(`\\b${name}\\b`).test(body)) {
        report(file, `importa "${name}" de ${specifier} pero no lo usa`);
      }
    } else if (named) {
      for (const part of named[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const [original, alias] = trimmed.split(/\s+as\s+/).map((piece) => piece.trim());
        check(alias || original, original);
      }
    }
  }

  // data-action="x" debe tener algo que lo mencione como cadena en el mismo archivo
  const actions = new Set([...source.matchAll(/data-action="([a-z-]+)"/g)].map((match) => match[1]));
  for (const action of actions) {
    const mentions = [...source.matchAll(new RegExp(`['"\`]${action}['"\`]`, 'g'))].length - 1;
    if (mentions === 0 && !/data-action="\$\{/.test(source)) {
      report(file, `la acción "${action}" no tiene manejador en este archivo`);
    }
  }
}

console.log(problems ? `\n${problems} aviso(s)` : 'Sin avisos');

#!/usr/bin/env node
/**
 * Genera los iconos PNG de Trazia (apple-touch-icon y manifest) a partir de la
 * misma geometria que assets/icon.svg, sin dependencias externas.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Colores tomados del logo original, sin retocar. */
const NAVY = [3, 8, 38];        // #030826, fondo del icono
const BLUE = [87, 76, 239];     // #574CEF, barra principal
const LAVENDER = [148, 115, 232]; // #9473E8, barra secundaria
const CORAL = [254, 116, 68];   // #FE7444, punto

/** Geometria en el sistema de coordenadas 0..48 del simbolo. */
const SHAPES = [
  { type: 'segment', a: [10.7, 33.2], b: [26.8, 14.7], width: 7.1, color: BLUE },
  { type: 'segment', a: [24.85, 33.3], b: [34.2, 22.6], width: 7.1, color: LAVENDER },
  { type: 'circle', c: [37.5, 33.5], r: 3.4, color: CORAL },
];

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundedRectCoverage(px, py, size, radius) {
  const inner = size - radius;
  const cx = px < radius ? radius : px > inner ? inner : px;
  const cy = py < radius ? radius : py > inner ? inner : py;
  if (cx === px && cy === py) return radius;
  return radius - Math.hypot(px - cx, py - cy);
}

function blend(dst, src, alpha) {
  return [
    Math.round(dst[0] + (src[0] - dst[0]) * alpha),
    Math.round(dst[1] + (src[1] - dst[1]) * alpha),
    Math.round(dst[2] + (src[2] - dst[2]) * alpha),
  ];
}

function renderIcon(size, { background = true, padding = 0.1 } = {}) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const scale = (size * (1 - padding * 2)) / 48;
  const offset = size * padding;
  const radius = size * 0.2227; // igual proporcion que el rx del SVG

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      let accA = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          let color = [255, 255, 255];
          let alpha = 0;
          if (background) {
            const cov = Math.max(0, Math.min(1, roundedRectCoverage(px, py, size, radius) + 0.5));
            if (cov > 0) {
              color = NAVY;
              alpha = cov;
            }
          }
          const ux = (px - offset) / scale;
          const uy = (py - offset) / scale;
          for (const shape of SHAPES) {
            const d =
              shape.type === 'segment'
                ? distanceToSegment(ux, uy, shape.a, shape.b) - shape.width / 2
                : Math.hypot(ux - shape.c[0], uy - shape.c[1]) - shape.r;
            const cov = Math.max(0, Math.min(1, 0.5 - d * scale));
            if (cov > 0) {
              color = blend(color, shape.color, cov);
              alpha = alpha + (1 - alpha) * cov;
            }
          }
          acc = [acc[0] + color[0] * alpha, acc[1] + color[1] * alpha, acc[2] + color[2] * alpha];
          accA += alpha;
        }
      }
      const total = samples * samples;
      const a = accA / total;
      const i = (y * size + x) * 4;
      pixels[i] = a > 0 ? Math.round(acc[0] / accA) : 0;
      pixels[i + 1] = a > 0 ? Math.round(acc[1] / accA) : 0;
      pixels[i + 2] = a > 0 ? Math.round(acc[2] / accA) : 0;
      pixels[i + 3] = Math.round(a * 255);
    }
  }
  return pixels;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  return encodePngRect(size, size, pixels);
}

/** Imagen Open Graph: simbolo centrado sobre navy, sin texto inventado. */
function renderOpenGraph(width, height) {
  const square = renderIcon(height, { background: false, padding: 0.3 });
  const pixels = Buffer.alloc(width * height * 4);
  const offsetX = Math.round((width - height) / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let color = NAVY;
      const sx = x - offsetX;
      if (sx >= 0 && sx < height) {
        const j = (y * height + sx) * 4;
        const a = square[j + 3] / 255;
        if (a > 0) color = blend(color, [square[j], square[j + 1], square[j + 2]], a);
      }
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function encodePngRect(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: 'assets/icon-180.png', size: 180 },
  { file: 'assets/icon-192.png', size: 192 },
  { file: 'assets/icon-512.png', size: 512 },
];

mkdirSync(resolve(ROOT, 'assets'), { recursive: true });
for (const target of targets) {
  const png = encodePng(target.size, renderIcon(target.size));
  writeFileSync(resolve(ROOT, target.file), png);
  console.log(`escrito ${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}

const og = encodePngRect(1200, 630, renderOpenGraph(1200, 630));
writeFileSync(resolve(ROOT, 'assets/og-image.png'), og);
console.log(`escrito assets/og-image.png (1200x630, ${og.length} bytes)`);

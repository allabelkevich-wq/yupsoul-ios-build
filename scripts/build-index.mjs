#!/usr/bin/env node
// Собирает public/index.html из модульного источника в src/.
// Подставляет содержимое файлов на место маркеров <!--@@INCLUDE:путь@@-->.
// Гарантия: вывод побайтно совпадает с прежним index.html (см. --check).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tplPath = resolve(root, 'src/index.template.html');
const outPath = resolve(root, 'public/index.html');

// Маркер (посимвольный, может стоять где угодно): <!--@@INCLUDE:путь@@-->
const RE = /<!--@@INCLUDE:([^@]+)@@-->/g;

const tpl = readFileSync(tplPath, 'utf8');
if (!RE.test(tpl)) {
  console.error('[build-index] Маркеры @@INCLUDE не найдены в шаблоне');
  process.exit(1);
}
RE.lastIndex = 0;
const out = tpl.replace(RE, (_m, rel) => {
  const p = resolve(root, 'src', rel.trim());
  try {
    return readFileSync(p, 'utf8');
  } catch {
    console.error(`[build-index] Не найден include: src/${rel.trim()} — проверь маркер @@INCLUDE в src/index.template.html`);
    process.exit(1);
  }
});

if (process.argv.includes('--check')) {
  const current = readFileSync(outPath, 'utf8');
  if (current === out) {
    console.log('[build-index] OK — сборка побайтно совпадает с public/index.html');
    process.exit(0);
  }
  console.error('[build-index] РАЗЛИЧИЕ: сборка не совпадает с текущим public/index.html');
  process.exit(2);
}

writeFileSync(outPath, out);
console.log('[build-index] public/index.html собран из src/ (' + out.length + ' байт)');

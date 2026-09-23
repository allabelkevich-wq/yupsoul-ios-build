#!/usr/bin/env node
// Вшивает публичный ключ RevenueCat в app/www/index.html.
// Ключ публичный (SDK-ключ), но в git его не держим — приходит из секрета CI.
// Без ключа сборка не падает: модуль 14 просто не включает покупки и пишет
// предупреждение в консоль. Так джоба validate проходит до появления аккаунта.
// Для релиза это недопустимо — сборка без ключа уехала бы в стор без покупок,
// поэтому джоба release зовёт скрипт с --require (или RC_REQUIRE_KEY=1),
// и тогда отсутствие ключа роняет сборку.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'app/www/index.html');

if (!existsSync(target)) {
  console.error('[inject-rc-key] Нет app/www/index.html — сначала node scripts/build-app-www.mjs');
  process.exit(1);
}

const ios = process.env.RC_IOS_KEY || '';
const android = process.env.RC_ANDROID_KEY || '';
const strict = process.argv.includes('--require') || process.env.RC_REQUIRE_KEY === '1';

if (strict && !ios) {
  console.error('[inject-rc-key] Строгий режим: нет RC_IOS_KEY — без него сборка уехала бы в стор без покупок.');
  console.error('[inject-rc-key] Ключ берётся в RevenueCat (шаг 5 регламента) и кладётся в секрет RC_IOS_KEY.');
  process.exit(1);
}

if (!ios && !android) {
  console.warn('[inject-rc-key] Ключей RevenueCat нет — покупки в этой сборке отключены (ожидаемо до открытия аккаунта)');
  process.exit(0);
}

const snippet = `<script>window.__RC_IOS_KEY__=${JSON.stringify(ios)};window.__RC_ANDROID_KEY__=${JSON.stringify(android)};</script>`;
const html = readFileSync(target, 'utf8');
const at = html.indexOf('</head>');
if (at === -1) {
  console.error('[inject-rc-key] В app/www/index.html не найден </head>');
  process.exit(1);
}
writeFileSync(target, html.slice(0, at) + snippet + html.slice(at));
console.log(`[inject-rc-key] ключи вшиты (ios=${ios ? 'да' : 'нет'}, android=${android ? 'да' : 'нет'})`);

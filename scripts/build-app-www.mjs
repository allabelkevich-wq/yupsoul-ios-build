#!/usr/bin/env node
// Собирает app/www для нативной сборки (Capacitor → App Store).
// Берёт РЕАЛЬНЫЙ фронт public/index.html и вшивает его внутрь приложения.
// Удалённый server.url не используем: Apple отклоняет веб-обёртки по 4.2.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const www = resolve(root, 'app/www');

const src = resolve(pub, 'index.html');
if (!existsSync(src)) {
  console.error('[build-app-www] Нет public/index.html — сначала npm run build:index');
  process.exit(1);
}

// Корневые файлы, на которые index.html ссылается абсолютным путём.
const ROOT_FILES = [
  'apple-touch-icon.png',
  'favicon-32.png',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
];
// Папки с ассетами, нужные офлайн.
const ASSET_DIRS = ['assets/icons'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// Чистка от российского продавца. В App Store продавец — Yupland Digital
// Solutions, LLC; реквизиты ИП из веб-версии (ИНН, ОГРНИП, адрес) и текст
// русской оферты не должны лежать даже внутри файла приложения: распаковать
// .ipa может кто угодно, а адрес там крымский. Экранные подписи меняет
// NATIVE_LANG_OVERRIDES, здесь — сам файл.
//
// Блоки, обёрнутые @@native-strip:begin … @@native-strip:end, вырезаются
// целиком. Ниже — гейт: если след остался, сборка падает, и это видно сразу,
// а не на ревью Apple.
const STRIP = /(?:<!--|\/\*)\s*@@native-strip:begin[\s\S]*?(?:<!--|\/\*)\s*@@native-strip:end\s*(?:-->|\*\/)/g;
const STRIP_EXPECTED = 4; // согласие первого входа, документы продавца, 2 блока партнёрских ссылок

// Продавец в словарях веб-версии. Значения — те же, что в NATIVE_LANG_OVERRIDES.
const SELLER = {
  'Исполнитель': 'Исполнитель: Yupland Digital Solutions, LLC, Грузия',
  'Provider': 'Provider: Yupland Digital Solutions, LLC, Georgia',
  'Anbieter': 'Anbieter: Yupland Digital Solutions, LLC, Georgien',
  'Prestataire': 'Prestataire : Yupland Digital Solutions, LLC, Géorgie',
};
// Слово «оферта» — название договора российского продавца: подписи веб-версии,
// служебные комментарии и мёртвый код модалки документов. Длинные формулировки
// меняем первыми, потом падежи. Экранные подписи и так берутся из
// NATIVE_LANG_OVERRIDES — здесь чистим сам файл.
const OFFER = [
  [/Договор публичной оферты/g, 'Условия использования'],
  [/публичной офертой/g, 'условиями использования'],
  [/публичной оферты/g, 'условий использования'],
  [/публичной офертой/g, 'условиями использования'],
  [/Оферта: оплата, возврат, правила/g, 'Условия использования и правила услуги'],
  [/Public Offer/g, 'Terms of Use'],
  [/Öffentliches Angebot/g, 'Nutzungsbedingungen'],
  // Апостроф — только типографский (’): прямой ' попадает внутрь JS-строки
  // в одинарных кавычках (fr: 'Offre publique') и валит весь код приложения.
  [/Offre publique/g, 'Conditions d’utilisation'],
  [/[Оо]ферт(ами|ам|ах|ой|ы|е|у|а)/g, (m, end) => {
    const map = { ами: 'условиями', ам: 'условиям', ах: 'условиях', ой: 'условиями', ы: 'условий', е: 'условиях', у: 'условия', а: 'условия' };
    const word = map[end];
    return m[0] === 'О' ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }],
];
// Следы, недопустимые в файле приложения. «ИП» без \b: в JS он не видит кириллицу.
const IE_TRACE = /Татауров|Tataurov|Tataurow|Севастопол|Sevastopol|Sébastopol|Sewastopol|920000802153|324920000019876|ОГРНИП|Лесхозная|Einzelunternehmer|IE Anton|EI Anton|[Оо]ферт|[Pp]ublic [Oo]ffer|Öffentliches Angebot|Offre publique|(?:^|[^А-Яа-яЁё])ИП(?:[^А-Яа-яЁё]|$)|yupsoul\.ru\/landing/;

let html = readFileSync(src, 'utf8');
const stripped = (html.match(STRIP) || []).length;
if (stripped !== STRIP_EXPECTED) {
  console.error(`[build-app-www] Меток @@native-strip найдено ${stripped}, ожидалось ${STRIP_EXPECTED}. Кто-то убрал или добавил блок — проверьте src/.`);
  process.exit(1);
}
html = html.replace(STRIP, '');

const seller = new RegExp('(helpLegalSeller:\\s*)([\'"])((?:\\\\.|(?!\\2).)*)\\2', 'g');
html = html.replace(seller, (m, key, q, value) => {
  if (!IE_TRACE.test(value)) return m;
  const to = SELLER[value.split(/[:\s]/)[0]];
  return to ? key + q + to + q : m;
});
html = html.replace(/(data-i18n="helpLegalSeller"[^>]*>)([^<]*)(<)/g,
  (m, open, text, close) => (IE_TRACE.test(text) ? open + SELLER['Исполнитель'] + close : m));

for (const [from, to] of OFFER) html = html.replace(from, to);

// Мёртвая ветка окна документов уводила на русский лендинг — там та же оферта
// с реквизитами. В сборке для стора она ведёт на английские условия компании.
html = html.replace(/yupsoul\.ru\/landing#/g, 'yupsoul.ru/terms-en#');

const trace = [];
html.split('\n').forEach((line, i) => {
  const hit = line.match(IE_TRACE);
  if (hit) trace.push(`  строка ${i + 1}: «${hit[0].trim()}» → ${line.trim().slice(0, 120)}`);
});
if (trace.length) {
  console.error('[build-app-www] В файле приложения остались следы российского продавца:\n' + trace.join('\n'));
  process.exit(1);
}

// Служебная метка сборки (22.09.2026): номер сборки, короткий git sha и время сборки —
// чтобы на экране «Помощь» в нативном режиме было видно, какая сборка стоит на устройстве.
let gitSha = '—';
try { gitSha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (_) {}
const buildDate = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const buildInfo = `${process.env.BUILD_NUMBER || '—'} · ${gitSha} · ${buildDate}`;
if (!html.includes('</head>')) {
  console.error('[build-app-www] Не найден </head> — не удалось вставить метку сборки');
  process.exit(1);
}
html = html.replace('</head>', `<script>window.__YS_BUILD__=${JSON.stringify(buildInfo)};</script></head>`);

// Синтаксическая проверка встроенных скриптов. Одна незакрытая кавычка в
// подстановке выше ломает парсинг всего кода приложения: на iPhone это экран
// «Не удалось запустить приложение», а консоли там нет (сборка #11, 21.09.2026).
const SCRIPT_RE = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
for (const m of html.matchAll(SCRIPT_RE)) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/i.test(attrs)) continue;
  const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1];
  if (type && !/^(text\/javascript|application\/javascript)$/i.test(type)) continue;
  try {
    new vm.Script(m[2], { filename: 'app-www-inline.js' });
  } catch (e) {
    const line = html.slice(0, m.index).split('\n').length;
    console.error(`[build-app-www] Встроенный скрипт со строки ${line} не парсится: ${e.message}. Проверьте подстановки OFFER/SELLER.`);
    process.exit(1);
  }
}

writeFileSync(join(www, 'index.html'), html);

const missing = [];
for (const f of ROOT_FILES) {
  const from = resolve(pub, f);
  if (!existsSync(from)) { missing.push(f); continue; }
  cpSync(from, join(www, f));
}
for (const d of ASSET_DIRS) {
  const from = resolve(pub, d);
  if (!existsSync(from)) { missing.push(d + '/'); continue; }
  mkdirSync(join(www, d), { recursive: true });
  cpSync(from, join(www, d), { recursive: true });
}

if (missing.length) {
  console.error('[build-app-www] Не найдены ассеты: ' + missing.join(', '));
  process.exit(1);
}

const kb = Math.round(statSync(join(www, 'index.html')).size / 1024);
console.log(`[build-app-www] app/www собран из public/index.html (${kb} КБ) + ${ROOT_FILES.length} иконок + ${ASSET_DIRS.length} папки ассетов`);

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

// ═══════════════════════════════════════════════════════════════════════════
// ПЕРЕКЛЮЧАТЕЛИ ФУНКЦИЙ ДЛЯ СТОРА (App Store 4.3(b), 04.10.2026) — единственное место.
// Функции, астрологичные по самому механизму, в iOS 1.0 не входят. В src/ они
// обёрнуты метками <!-- @@native-feature:ГРУППА:begin --> … <!-- @@native-feature:ГРУППА:end -->
// (в JS/CSS — /* … */). Группа false — блок вырезается из app/www целиком
// (вместе со всеми входами: кнопки, вкладки, шаги обучалки, пункты пакетов).
// Включить в iOS — поставить true и пересобрать. Telegram/VK/веб не меняются:
// public/index.html метки только комментирует. Переходы из кода (мостики,
// пресеты формы) смотрят window.__YS_NATIVE_OFF__ — его вставляем ниже.
const NATIVE_FEATURES = {
  razbory_askezy: false, // Разборы (призмы) и Аскезы — вкладка в Soul Chat и входы в неё
  compat_percent: false, // Совместимость в процентах: экран и режим «Совместимость» в чате
  who_are_you: false,    // «Кто ты на самом деле»: архетип, «планета души»
  energy_of_day: false,  // режим «Энергия дня» (транзиты), поля события, «Песня дня» на главной
  planet_sound: false,   // стиль музыки «Звучание планет»
  song_analysis: false,  // «Расшифровка» песни (астро-разбор из ответа ИИ): кнопка в плеере, «Глубокая расшифровка», разбор в истории карточки
};
// Чего не должно остаться в файле, если группа выключена, — страховка
// от забытой или сломанной метки.
const FEATURE_GONE = {
  razbory_askezy: ['data-tab="prism" onclick', 'id="scPrismPane"', 'id="ulSegTopic"'],
  compat_percent: ['id="compatResultPage"', 'id="scPickerTabSynastry"', 'id="scSynastryTeaser"', 'data-i18n-aria="ctxCompatBtn"'],
  who_are_you: ['id="archetypePage"', 'id="profileArchBtn"'],
  energy_of_day: ['data-mode="transit" data-effect', 'data-u="pf" data-mode="transit"', 'id="transitAccordion"', 'data-quick-action="song_of_day"', 'data-i18n="plBuy3"'],
  planet_sound: ['data-smode="astro" data-effect'],
  song_analysis: ['id="mtNpAnalysisBtn"', 'id="whileGeneratingUpsell"', "t('mtAnalysisTitle')", "t('heroAnalysisBtn')"],
};

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

// Переключатели функций: метки парные, имена групп — только из NATIVE_FEATURES.
const featureNames = [...html.matchAll(/@@native-feature:([a-z_]+):(?:begin|end)/g)].map(m => m[1]);
const unknownFeature = [...new Set(featureNames)].filter(n => !(n in NATIVE_FEATURES));
if (unknownFeature.length) {
  console.error(`[build-app-www] Метки @@native-feature с неизвестной группой: ${unknownFeature.join(', ')}. Добавьте группу в NATIVE_FEATURES.`);
  process.exit(1);
}
const featureOff = {};
for (const [name, on] of Object.entries(NATIVE_FEATURES)) {
  const count = kind => (html.match(new RegExp(`@@native-feature:${name}:${kind}\\b`, 'g')) || []).length;
  const begins = count('begin');
  if (!begins || begins !== count('end')) {
    console.error(`[build-app-www] Группа ${name}: меток begin ${begins}, end ${count('end')} — должны быть парными и хотя бы одна.`);
    process.exit(1);
  }
  if (on) continue;
  featureOff[name] = true;
  html = html.replace(new RegExp(`(?:<!--|\\/\\*)\\s*@@native-feature:${name}:begin[\\s\\S]*?(?:<!--|\\/\\*)\\s*@@native-feature:${name}:end\\s*(?:-->|\\*\\/)`, 'g'), '');
  const left = FEATURE_GONE[name].filter(s => html.includes(s));
  if (left.length) {
    console.error(`[build-app-www] Группа ${name} выключена, но в файле осталось: ${left.join(' | ')}. Оберните это меткой @@native-feature:${name}.`);
    process.exit(1);
  }
}

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
html = html.replace('</head>', `<script>window.__YS_BUILD__=${JSON.stringify(buildInfo)};window.__YS_NATIVE_OFF__=${JSON.stringify(featureOff)};</script></head>`);

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

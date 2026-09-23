# src/ — модульный источник `public/index.html`

`public/index.html` теперь **собирается** из этой папки скриптом `scripts/build-index.mjs`.
Файл по-прежнему лежит в `public/` и отдаётся как раньше (деплой не менялся), но
**править его напрямую больше НЕЛЬЗЯ** — источник истины здесь, в `src/`.

## Структура

| Путь | Что внутри |
|---|---|
| `src/index.template.html` | Каркас (head, body-скелет, bootstrap-скрипты) + маркеры `<!--@@INCLUDE:путь@@-->` |
| `src/styles/app.css` | Главный блок стилей (~11.6К строк). **Правки стилей — сюда.** |
| `src/js/01-core-i18n.js` … `12-synastry-tail.js` | Основная логика (~22К строк) разбита на 12 модулей по фичам. |
| `src/pages/<id>Page.html` | 21 экран приложения (onboarding, home, profile, heroes, gift, soulChat, …). **Правки разметки экрана — в его файл.** |

### JS-модули (порядок склейки = порядок определения, НЕ менять)
`01-core-i18n` (i18n/ядро) · `02-auth-env` (среда+Google+VK) · `03-payment-overlay` ·
`04-tbank-profile-referral` · `05-promo-pay-helpers` · `06-oracle-paywall` ·
`07-cardpicker-compat` · `08-gift` · `09-pay-stars-vkpay-tbank` ·
`10-sparks-profilephoto` · `11-heroes` · `12-synastry-tail`

> Это **vanilla JS одного IIFE**, разрезанный на файлы. По отдельности файл невалиден —
> валиден только склеенный результат. Поэтому **порядок файлов менять нельзя** и build
> склеивает их встык (без `import`/`export`).

## Воркфлоу

```bash
# 1) Правишь нужный модуль в src/ (стиль → app.css, логика → src/js/NN-*.js, разметка → template)
# 2) Пересобираешь public/index.html:
npm run build:index
# 3) Коммитишь И src/, И обновлённый public/index.html
```

Сверка синхрона (входит в pre-commit, коммит не пройдёт при рассинхроне):

```bash
npm run build:index:check    # exit 0 = синхронно
```

## Гарантия безопасности

Сборка **побайтно** воспроизводит `public/index.html` (проверено md5 на каждом шаге выноса).
Браузер получает идентичный файл — поведение приложения не меняется.

> ⚠️ Не редактируй `public/index.html` напрямую — pre-commit-страж не даст закоммитить
> рассинхрон, а `npm run build:index` перезапишет такую правку из `src/`.

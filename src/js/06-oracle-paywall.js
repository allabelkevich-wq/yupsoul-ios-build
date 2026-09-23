
      // ── ПЕЙВОЛЛ ОРАКУЛА: пакеты вопросов / Искр (VK-голоса, 15.06) ─────────────────
      var SC_PW_PACKS = {
        q: [
          {n:'1000 вопросов', d:'1000 Искр — хватит надолго', p:'1 630 ₽', vk:230, oki:1630, sku:'iskry_pack_1000'},
          {n:'2000 вопросов', d:'2000 Искр — на месяцы разговоров', p:'2 450 ₽', pop:'Выгоднее', vk:350, oki:2450, sku:'iskry_pack_2000'},
          {n:'5000 вопросов', d:'5000 Искр — лучшая цена', p:'5 300 ₽', vk:750, oki:5300, sku:'iskry_pack_5000'}
        ],
        iskry: [
          {n:'1000 Искр', d:'≈ 10 песен или 1000 вопросов', p:'1 630 ₽', vk:230, oki:1630, sku:'iskry_pack_1000'},
          {n:'2000 Искр', d:'≈ 20 песен или 2000 вопросов', p:'2 450 ₽', pop:'Выгоднее', vk:350, oki:2450, sku:'iskry_pack_2000'},
          {n:'5000 Искр', d:'≈ 50 песен — лучшая цена', p:'5 300 ₽', vk:750, oki:5300, sku:'iskry_pack_5000'}
        ]
      };
      var _scPwKind = 'q', _scPwSel = 1, _scPwInitDone = false;

      function _scPwLocalize() {
        // t() — глобальный i18n того же IIFE (window._translations никогда не присваивался
        // → пейволл был вечно на русском для EN/DE/FR). Фолбэк если ключа нет.
        var tl = function(k, fb) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return fb || k; };
        var m = {
          scPwTeaserLockTxt: tl('pwTeaserLock', 'Оракул не договорил…'),
          scPwTitle: tl('pwTitle', 'Продолжим разговор?'),
          scPwSubText: tl('pwSub', 'Искры закончились — а Оракулу ещё есть что тебе сказать. Возьми пакет и продолжай, без подписок и привязки карты.'),
          scPwSegQ: tl('pwSegQ', 'Вопросы'),
          scPwSegIskry: tl('pwSegIskry', 'Искры'),
          scPwCtaLabel: tl('pwCtaLabel', 'Продолжить разговор'),
          scPwFoot: tl('pwFoot', 'Разовая оплата. Пакет не сгорает — вопросы остаются с тобой.')
        };
        for (var id in m) { var el = document.getElementById(id); if (el) el.textContent = m[id]; }
        // MAJOR (дизайн-аудит 02.07): на VK/OK эти блоки скрыты только CSS (display:none) —
        // ₽/«карта» оставались строкой в DOM-разметке, что VK-модерация может вычитать скрейпом
        // источника (прецедент — крипто-маркеры). На VK/OK текст с ₽/картой в DOM не пишем вовсе.
        var _pwIsVk = window._isVkMiniApp || window._appEnv === 'vk'
          || document.documentElement.classList.contains('is-vk')
          || document.body.classList.contains('in-vk');
        var _pwIsOk = window._isOkMiniApp === true || window._appEnv === 'ok';
        var dayEl = document.getElementById('scPwDay');
        if (dayEl) dayEl.innerHTML = (_pwIsVk || _pwIsOk) ? '' : (tl('pwDay', 'Или') + ' <b>' + tl('pwDayAccess', 'доступ на сутки') + '</b> — 199 ₽');
        var subEl = document.getElementById('scPwSubscribe');
        if (subEl) subEl.innerHTML = (_pwIsVk || _pwIsOk) ? '' : (tl('pwSubscribe', 'Хочешь автопополнение?') + ' <u>' + tl('pwSubscribeLink', 'Получить пакет с картой') + '</u> ' + tl('pwSubscribeWhere', '(где доступно)'));
      }

      function _scPwRender() {
        // КАНОН v8 (отказ 27.07 18:08): голосов на VK нет вообще — Искры признаны
        // цифровым товаром, значит §5.4.1: ₽ и только на vk.ru/m.vk.ru.
        // + DOM-класс: bootstrap-истина, не зависит от гонки env-флагов (скрин Аллы 02.07)
        var isVk = window._isVkMiniApp || window._appEnv === 'vk'
          || document.documentElement.classList.contains('is-vk')
          || document.body.classList.contains('in-vk');
        // §5.4.1: клиенты iOS/Android — ни цен, ни методов; CTA скрыт CSS, виден #scPwStubHint.
        var isVkStub = isVk && !(window._vkPayMode && window._vkPayMode() === 'money')
          && !document.documentElement.classList.contains('is-vk-pay');
        // t() — глобальный i18n того же IIFE (window._translations никогда не присваивался
        // → пейволл был вечно на русском для EN/DE/FR). Фолбэк если ключа нет.
        var tl = function(k, fb) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return fb || k; };
        var arr = SC_PW_PACKS[_scPwKind] || [], h = '';
        for (var i = 0; i < arr.length; i++) {
          var pk = arr[i];
          var isOk = window._isOkMiniApp === true || window._appEnv === 'ok';
          // КАНОН v8: VK-money = ₽ (как web); OK = ₽-витрина; клиенты iOS/Android — пусто.
          var price = isVkStub ? '' : pk.p;
          h += '<button class="pw-pack' + (i === _scPwSel ? ' sel' : '') + '" data-i="' + i + '">'
            + (pk.pop ? '<span class="pw-pack-badge">' + _escHtml(tl('pwBadgePopular', pk.pop)) + '</span>' : '')
            + '<span class="pw-pack-radio"></span>'
            + '<span class="pw-pack-tx"><b>' + _escHtml(pk.n) + '</b><span>' + _escHtml(pk.d) + '</span></span>'
            + '<span class="pw-pack-price">' + _escHtml(price) + '</span></button>';
        }
        var packsEl = document.getElementById('scPwPacks');
        if (packsEl) packsEl.innerHTML = h;
        // Синхрон подсветки сегмента с _scPwKind: scPwShow('iskry') рендерил контент-Искры,
        // но сегмент оставался на «Вопросы» (дефолт) — рассинхрон (Алла-аудит 21.06).
        var _sQ = document.getElementById('scPwSegQ'), _sI = document.getElementById('scPwSegIskry');
        if (_sQ) _sQ.classList.toggle('on', _scPwKind !== 'iskry');
        if (_sI) _sI.classList.toggle('on', _scPwKind === 'iskry');
        var priceEl = document.getElementById('scPwCtaPrice');
        var _pwOk = window._isOkMiniApp === true || window._appEnv === 'ok';
        if (priceEl) priceEl.textContent = isVkStub ? '' : (arr[_scPwSel] ? arr[_scPwSel].p : '');
        var subEl2 = document.getElementById('scPwSubscribe');
        if (subEl2) subEl2.style.display = (isVk || _pwOk) ? 'none' : '';
        var dayEl2 = document.getElementById('scPwDay');
        if (dayEl2) dayEl2.style.display = (isVk || _pwOk) ? 'none' : '';
        // CSS-страховка: на VK/OK пейволл невидим, пока цены не записаны по платформе
        var _pwRoot = document.getElementById('scPaywall');
        if (_pwRoot) _pwRoot.classList.add('pw-prices-ready');
      }

      function _scPwInit() {
        if (_scPwInitDone) return;
        _scPwInitDone = true;
        _scPwLocalize();
        var el = document.getElementById('scPaywall'); if (!el) return;
        document.getElementById('scPwX') && document.getElementById('scPwX').addEventListener('click', window.scPwHide);
        el.addEventListener('click', function(e) { if (e.target === el) window.scPwHide(); });
        var seg = document.getElementById('scPwSeg');
        if (seg) seg.addEventListener('click', function(e) {
          var b = e.target.closest ? e.target.closest('button[data-pk]') : null;
          if (!b) return;
          [].forEach.call(seg.querySelectorAll('button'), function(x) { x.classList.toggle('on', x === b); });
          _scPwKind = b.getAttribute('data-pk');
          _scPwSel = 1;
          _scPwRender();
        });
        var packsEl = document.getElementById('scPwPacks');
        if (packsEl) packsEl.addEventListener('click', function(e) {
          var b = e.target.closest ? e.target.closest('.pw-pack') : null; if (!b) return;
          _scPwSel = +b.getAttribute('data-i');
          _scPwRender();
        });
        var ctaBtn = document.getElementById('scPwCta');
        if (ctaBtn) ctaBtn.addEventListener('click', function() {
          var arr = SC_PW_PACKS[_scPwKind] || [], pk = arr[_scPwSel]; if (!pk) return;
          // КАНОН v8 §5.4.1: на клиентах iOS/Android покупок нет (CTA скрыт CSS) — гард
          if (window._isVkMiniApp && !(window._vkPayMode && window._vkPayMode() === 'money')) return;
          // VK-money идёт тем же путём, что web — конфирм пакета с картой T-Bank.
          window.scPwHide();
          if (typeof window.showIskryPackPayment === 'function') window.showIskryPackPayment(pk.sku);
          else if (typeof goToPage === 'function') goToPage('profilePage');
        });
        var dayBtn = document.getElementById('scPwDay');
        if (dayBtn) dayBtn.addEventListener('click', function() { window.scPwHide(); if (typeof goToPage === 'function') goToPage('profilePage'); });
        var subBtn = document.getElementById('scPwSubscribe');
        if (subBtn) subBtn.addEventListener('click', function() { window.scPwHide(); if (typeof goToPage === 'function') goToPage('profilePage'); });
      }

      window.scPwShow = function(kind) {
        _scPwInit();
        // Канон v7: на VK пейволл всегда в рамке «вопросы Оракулу» (пакет = N вопросов,
        // цена в голосах). Рамка «Искры ≈ песни» на VK ложная — песни там не за Искры.
        var _pwVkAny = window._isVkMiniApp || window._appEnv === 'vk'
          || document.documentElement.classList.contains('is-vk');
        _scPwKind = _pwVkAny ? 'q' : (kind || 'q');
        _scPwSel = 1;
        _scPwRender();
        var el = document.getElementById('scPaywall'); if (el) el.hidden = false;
      };
      window.scPwHide = function() {
        var el = document.getElementById('scPaywall'); if (el) el.hidden = true;
      };
      // ── /ПЕЙВОЛЛ ОРАКУЛА ─────────────────────────────────────────────────────────

      // Дата рождения → «14 марта 1996» (русские месяцы), БЕЗ знака зодиака/дома (закон: без астро).
      function _formatBirthNoAstro(bd) {
        if (!bd) return '';
        var y, mo, d;
        var m = String(bd).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else {
          var dt = new Date(bd);
          if (isNaN(dt.getTime())) return '';
          y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate();
        }
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
        var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        return d + ' ' + MONTHS[mo - 1] + ' ' + y;
      }

      function _escHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function(c) {
          return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
      }
      function _escAttr(s) { return _escHtml(s); }
      // Batch 9.7 (отчёт 11.05.2026): markdown в разборах призм отображался
      // как «**слово**» дословно — `_escHtml` эскейпил HTML, но markdown
      // никто не обрабатывал. `_renderMarkdownInline` сначала эскейпит, потом
      // конвертит **жирный** → <strong>. Безопасно (XSS-стойко) — LLM
      // ответ уже не может вставить произвольный HTML.
      function _renderMarkdownInline(s) {
        var esc = _escHtml(s);
        // **жирный** → <strong>жирный</strong> (не жадно, не через newline)
        esc = esc.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
        // *курсив* → <em> (закрытый одиночный)
        esc = esc.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
        // Остаточные/НЕЗАКРЫТЫЕ звёздочки — убрать. LLM обрезается на max_tokens
        // («Ты продаёшь **с») → раньше сырые ** утекали в UI. Закон: markdown в разборах
        // (Batch 9.7) — НИКОГДА не показывать сырые звёздочки, даже на обрезанном тексте.
        esc = esc.replace(/\*+/g, '');
        return esc;
      }

      // Архитектура «Вариант B»: первый клик прогревает все 13 призм параллельно
      // одним запросом. Последующие клики — мгновенно из клиентского кэша.
      async function runPrism(prismCode) {
        var resultEl = document.getElementById('scPrismResult');
        _prismCatalogHide();

        // Призма «Вы вдвоём» (pair) — разбор ЛЮБЫХ двоих из картотеки (Алла 25.06).
        // Открываем picker в synastry-режиме (выбор двух карт; любая может быть «Ты»
        // или другой человек). Флаг _scPairPrismPick перенаправит «Применить» в
        // разбор-призму (/api/soul-chat/prism с request_id_1 + request_id_2), а не в
        // визуальную фичу совместимости openCompatResult — см. scApplyCardPicker.
        // Табы «Одна карточка / Совместимость» прячем: в пар-флоу нужен только выбор пары
        // (иначе переключение на «Одна карточка» молча ломало запуск разбора).
        if (prismCode === 'pair') {
          window._scPairPrismPick = true;
          if (typeof scOpenCardPicker === 'function') scOpenCardPicker();
          if (typeof scSetPickerMode === 'function') scSetPickerMode('synastry');
          // .seg2 имеет `display:flex !important` (11132) → inline без important НЕ перебьёт
          // ([[reference_global_pill_rule_specificity_bomb]]). Ставим important явно.
          var _pmTabs = document.getElementById('scPickerModeTabs'); if (_pmTabs) _pmTabs.style.setProperty('display', 'none', 'important');
          // Заголовок/подзаголовок пикера — под разбор пары (а не «Контекст чата / в контексте
          // разговора», которые про чат). Восстанавливаются в scCloseCardPicker.
          var _ptl = function(k, fb){ return (typeof t === 'function' && t(k)) || fb; };
          var _ppTitle = document.getElementById('scPickerTitle'); if (_ppTitle) _ppTitle.textContent = _ptl('scPairPickTitle', 'Вы вдвоём');
          var _ppSub = document.querySelector('#scCardPickerModal .ctx-sub'); if (_ppSub) _ppSub.textContent = _ptl('scPairPickSub', 'Разбор пары — как вы звучите вместе.');
          return;
        }

        // Запоминаем текущий «целевой» клик. Любой новый клик во время стрима
        // или после завершения — переназначает target. Это даёт возможность
        // нажать «Попробовать подарочный разбор» на paywall и дождаться soul_name.
        _prismCurrentTarget = prismCode;

        // 1) Клиент-кэш: есть готовый разбор → показываем мгновенно
        var cached = _prismResultsCache[prismCode];
        if (cached) {
          _prismCurrentTarget = null; // уже рендерим, ждать нечего
          if (cached.locked) {
            renderPrismError(
              'Этот разбор доступен с пакетом «Чат с Оракулом». Первый разбор «Имя души» — в подарок.',
              'needs_subscription',
              'soul_name'
            );
            return;
          }
          renderPrismResult({
            prism_code: prismCode,
            title: cached.title,
            sections: cached.sections,
            raw_text: cached.raw_text,
          });
          return;
        }

        // 2) Идёт прогрев — показываем загрузку. Новый target уже выставлен
        //    выше, стрим отрендерит его как только result придёт.
        if (_prismPreloadInFlight) {
          if (resultEl) {
            resultEl.style.display = 'flex';
            resultEl.innerHTML = '<div class="sc-prism-result-loading" id="scPrismLoadingMsg">Готовлю все разборы…</div>';
            try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
          }
          return;
        }
        if (_prismInProgress) return;
        _prismInProgress = true;
        _prismPreloadInFlight = true;

        // 3) Прогресс-индикация для первого прогрева (15-30 сек обычно)
        var progressMessages = [
          'Считаю положение планет…',
          'Собираю узор карты…',
          'Готовлю все разборы параллельно…',
          'Почти готово…',
        ];
        var progressIdx = 0;
        var progressTimer = null;
        if (resultEl) {
          resultEl.style.display = 'flex';
          resultEl.innerHTML = '<div class="sc-prism-result-loading" id="scPrismLoadingMsg">' + _escHtml(progressMessages[0]) + '</div>';
          try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
          progressTimer = setInterval(function(){
            progressIdx = Math.min(progressIdx + 1, progressMessages.length - 1);
            var el = document.getElementById('scPrismLoadingMsg');
            if (el) el.textContent = progressMessages[progressIdx];
          }, 8000);
        }

        // 4) Таймаут 180 сек на весь прогрев (стрим + heartbeat держит соединение живым).
        //    Если LLM совсем залип — abort свалит всё.
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = setTimeout(function(){ try { ctrl && ctrl.abort(); } catch(_) {} }, 180000);
        try {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var headers = Object.assign({ 'Content-Type': 'application/json' }, typeof getAuthHeaders === 'function' ? getAuthHeaders() : {});
          var fetchOpts = { method: 'POST', headers: headers, body: JSON.stringify({}) };
          if (ctrl) fetchOpts.signal = ctrl.signal;
          var res = await fetch(apiBase + '/api/soul-chat/prism-all', fetchOpts);

          if (!res.ok) {
            // Ошибка до стрима (403, 500, и т.п.) — читаем тело как текст/JSON
            var errText = await res.text().catch(function(){ return ''; });
            var errJson = {};
            try { errJson = JSON.parse(errText); } catch(_) {}
            // №37/№31: тех-текст с HTTP-кодом юзеру запрещён; осмысленный error бэка оставляем.
            renderPrismError(errJson.error || ((typeof t === 'function' && t('prismOracleRetry')) || 'Оракул задумался. Попробуй ещё раз.'), errJson.reason, errJson.free_prism);
            return;
          }

          // Читаем NDJSON-стрим построчно
          var reader = res.body.getReader();
          var decoder = new TextDecoder('utf-8');
          var buffer = '';
          var gotError = null;

          var processLine = function(line) {
            if (!line) return;
            var msg;
            try { msg = JSON.parse(line); } catch(_) { return; }
            if (msg.type === 'ping') return;
            if (msg.type === 'error') {
              gotError = msg;
              return;
            }
            if (msg.type === 'result') {
              // Кэшируем результат
              _prismResultsCache[msg.code] = {
                title: msg.title,
                sections: msg.sections,
                raw_text: msg.raw_text,
                locked: !!msg.locked,
                reason: msg.reason,
                error: msg.error,
              };
              _savePrismCache();
              // Пришёл готовый разбор → он у человека есть, замок ему не положен.
              if (msg.ok && !msg.locked) {
                try { window._prismOwned = window._prismOwned || {}; window._prismOwned[msg.code] = true; } catch(_) {}
              }
              _markPrismCardsReady();

              // Рендерим результат, если он совпадает с ТЕКУЩИМ target.
              // Target может меняться на лету (клик «Попробовать подарочный»
              // на paywall → target меняется с 'core' на 'soul_name').
              if (msg.code === _prismCurrentTarget) {
                _prismCurrentTarget = null; // отрендерили, дальше ждать нечего
                if (msg.ok) {
                  renderPrismResult({
                    prism_code: msg.code,
                    title: msg.title,
                    sections: msg.sections,
                    raw_text: msg.raw_text,
                  });
                } else if (msg.locked) {
                  renderPrismError(
                    'Этот разбор доступен с пакетом «Чат с Оракулом». Первый разбор «Имя души» — в подарок.',
                    'needs_subscription',
                    'soul_name'
                  );
                } else {
                  renderPrismError('Не удалось получить этот разбор. Попробуй ещё раз.');
                }
              }
            }
            // type==="done" или "meta" — ничего не делаем
          };

          // Читаем поток
          while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) processLine(lines[i]);
          }
          if (buffer) processLine(buffer);

          if (gotError) {
            _prismCurrentTarget = null;
            renderPrismError(gotError.error, gotError.reason, gotError.free_prism);
            return;
          }
          // Если остался неотрендеренный target (результат не пришёл или пришёл
          // раньше чем user переключил клик) — последняя попытка из кэша
          if (_prismCurrentTarget) {
            var lastTarget = _prismCurrentTarget;
            _prismCurrentTarget = null;
            var targetCached = _prismResultsCache[lastTarget];
            if (targetCached && !targetCached.locked && targetCached.sections) {
              renderPrismResult({
                prism_code: lastTarget,
                title: targetCached.title,
                sections: targetCached.sections,
                raw_text: targetCached.raw_text,
              });
            } else if (targetCached && targetCached.locked) {
              renderPrismError(
                'Этот разбор доступен с пакетом «Чат с Оракулом». Первый разбор «Имя души» — в подарок.',
                'needs_subscription',
                'soul_name'
              );
            } else {
              renderPrismError('Не удалось получить этот разбор. Попробуй ещё раз.');
            }
          }
        } catch (e) {
          var isAbort = e && (e.name === 'AbortError' || /aborted/i.test(String(e.message||'')));
          var errMsg = isAbort
            ? 'Прогрев разборов занимает слишком долго. Попробуй ещё раз через минуту.'
            : (typeof t === 'function' ? (t('scPrismRunFail') || 'Не удалось выполнить разбор.') : 'Не удалось выполнить разбор.');
          if (_prismCurrentTarget) {
            _prismCurrentTarget = null;
            renderPrismError(errMsg);
          }
        } finally {
          clearTimeout(timeoutId);
          if (progressTimer) clearInterval(progressTimer);
          _prismInProgress = false;
          _prismPreloadInFlight = false;
        }
      }
      // VK Testers ID 7259099 (Самсунг S10+, Android): кнопка «Попробовать подарочный
      // разбор» внутри renderPrismError() — inline onclick="runPrism('soul_name')".
      // runPrism определена в локальном scope (тот же, что у addEventListener карточек),
      // в window не экспонирована → inline-обработчик не находит функцию → клик
      // молча игнорируется. Экспонируем в window. Карточки призм работают и так
      // (через addEventListener в том же scope).
      window.runPrism = runPrism;

      // Помечаем прогретые карточки. Дебаунс через rAF — при быстром стриме
      // (13 кэш-хитов за <500мс) 13 подряд сканов DOM вызывают layout thrashing
      // и кратковременные фризы UI. Один rAF = один скан на кадр.
      var _markReadyRafId = null;
      function _markPrismCardsReady() {
        if (_markReadyRafId != null) return;
        _markReadyRafId = (typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : function(cb){ return setTimeout(cb, 16); })(function(){
          _markReadyRafId = null;
          var listEl = document.getElementById('scPrismList');
          if (!listEl) return;
          var btns = listEl.querySelectorAll('.sc-prism-card:not(.is-ready)');
          for (var i = 0; i < btns.length; i++) {
            var code = btns[i].getAttribute('data-prism');
            if (!code) continue;
            var item = _prismResultsCache[code];
            if (item && !item.locked) btns[i].classList.add('is-ready');
          }
        });
      }

      // Надзаголовок окна разбора: «Разбор NN · раздел». Номер и раздел берём из
      // каталога — того же порядка, что и в списке разборов.
      function _prismEyebrow(code) {
        var cat = _prismCatalogCache;
        if (!Array.isArray(cat)) return '';
        var n = 0;
        for (var i = 0; i < cat.length; i++) {
          var prisms = cat[i].prisms || [];
          for (var j = 0; j < prisms.length; j++) {
            n++;
            if (prisms[j].code === code) {
              var num = (n < 10 ? '0' : '') + n;
              var L = (typeof t === 'function' && t('scPrismWord')) || 'Разбор';
              return cat[i].title ? (L + ' ' + num + ' · ' + cat[i].title) : (L + ' ' + num);
            }
          }
        }
        return '';
      }

      // Окно купленного разбора — оверлей #prismReadView, вид по эталону showcase-oracle
      // (секция .s-res): цитата-выноска сверху, ниже одна карточка .res с разделами .res-s.
      // Раздел «Фраза-разблокировка» становится выноской .pull, «Первый шаг» — приглушённым
      // разделом .quiet, как последний раздел эталона.
      function renderPrismResult(data) {
        var titleText = data.title || data.prism_code || 'Разбор';
        var view = document.getElementById('prismReadView');
        if (!view) { // fallback на старый inline-блок
          var resultEl = document.getElementById('scPrismResult');
          if (!resultEl) return;
          var h = '<div class="sc-prism-result-header"><div class="sc-prism-result-title">' + _escHtml(titleText) + '</div><button type="button" class="sc-prism-result-close" onclick="closePrismResult()" aria-label="Закрыть">×</button></div>';
          (data.sections || []).forEach(function(sec){ h += '<div class="sc-prism-result-section"><div class="sc-prism-result-label">' + _escHtml(sec.label) + '</div><div class="sc-prism-result-text">' + _renderMarkdownInline(sec.text) + '</div></div>'; });
          resultEl.innerHTML = h; resultEl._rawText = data.raw_text || ''; resultEl.style.display = 'flex';
          return;
        }
        var titleEl = document.getElementById('prismReadTitle'); if (titleEl) titleEl.textContent = titleText;
        var eyeEl = document.getElementById('prismReadEyebrow');
        if (eyeEl) {
          var eyebrow = _prismEyebrow(data.prism_code);
          if (eyebrow) eyeEl.textContent = eyebrow;
        }
        var pullHtml = '';
        var cardHtml = '';
        if (Array.isArray(data.sections) && data.sections.length) {
          for (var i = 0; i < data.sections.length; i++) {
            var sec = data.sections[i];
            var lbl = (sec.label || '').toLowerCase();
            if (/разблокиров|фраза|unlock|phrase|schl|déblo|frase/.test(lbl)) {
              pullHtml += '<div class="pull"><p>' + _renderMarkdownInline(sec.text) + '</p></div>';
            } else {
              var quiet = /первый шаг|шаг сегодня|на сегодня|что с этим делать|ритуал|рекомендац|^завтра|вечерний вопрос|first step|what to do|today|erster schritt|premier pas|primer paso/.test(lbl);
              cardHtml += '<div class="res-s' + (quiet ? ' quiet' : '') + '"><span class="lbl">' + _escHtml(sec.label) + '</span><p>' + _renderMarkdownInline(sec.text) + '</p></div>';
            }
          }
        } else {
          cardHtml += '<div class="res-s"><p>' + _renderMarkdownInline(data.raw_text || '') + '</p></div>';
        }
        var bodyEl = document.getElementById('prismReadBody');
        if (bodyEl) bodyEl.innerHTML = pullHtml + (cardHtml ? '<div class="res">' + cardHtml + '</div>' : '');
        view._rawText = data.raw_text || '';
        view.classList.add('is-open');
        var sc = document.getElementById('prismReadScroll'); if (sc) sc.scrollTop = 0;
        var oldEl = document.getElementById('scPrismResult'); if (oldEl) oldEl.style.display = 'none';
      }

      function renderPrismError(msg, reason, freePrism) {
        var resultEl = document.getElementById('scPrismResult');
        if (!resultEl) return;
        var html = '';
        html += '<div class="sc-prism-result-header">';
        // «Не хватает Искр» — не сбой, а состояние: заголовок «Не получилось» здесь
        // читается как поломка приложения (закон №37 — никакого error-тона без сбоя).
        var _errTitleKey = (reason === 'needs_iskry_vk') ? 'scPrismTitle' : 'scPrismErrorTitle';
        var _errTitleFb = (reason === 'needs_iskry_vk') ? 'Разбор' : 'Не получилось';
        html += '<div class="sc-prism-result-title">' + _escHtml((typeof t === 'function' ? (t(_errTitleKey) || _errTitleFb) : _errTitleFb)) + '</div>';
        html += '<button type="button" class="sc-prism-result-close" onclick="closePrismResult()" aria-label="Закрыть">×</button>';
        html += '</div>';
        html += '<div class="sc-prism-result-error">' + _escHtml(msg) + '</div>';
        // Если причина — нужна подписка, и есть бесплатный разбор — показываем CTA
        if (reason === 'needs_subscription' && freePrism) {
          html += '<button type="button" class="sc-prism-result-copy" onclick="runPrism(\'' + _escAttr(freePrism) + '\')" data-i18n="scPrismTryFree">Попробовать подарочный разбор</button>';
        } else if (reason === 'needs_iskry_vk') {
          // Искр не хватает, а оплаты на площадке нет. Раньше здесь была молчаливая
          // подмена экрана — человек не понимал, что произошло и как вернуться.
          html += '<button type="button" class="sc-prism-result-copy" onclick="goToPage(\'giftsPage\')" data-i18n="scWallGoGifts">Открыть Подарки</button>';
        } else if (reason === 'needs_subscription' || reason === 'trial_used') {
          // На нативе VK профиль по покупкам пуст (карточки планов и пакеты Искр скрыты) —
          // «Выбрать пакет» упирается в экран без пакетов. Ведём в Подарки, к Искре дня.
          // Подпись — «Открыть Подарки», а не «Забрать Искру дня»: кнопка только
          // переносит на другой экран, Искру она не выдаёт (одна надпись = одно поведение).
          if (window._vkSongsOff && window._vkSongsOff()) {
            html += '<button type="button" class="sc-prism-result-copy" onclick="goToPage(\'giftsPage\')" data-i18n="scWallGoGifts">Открыть Подарки</button>';
          } else {
            html += '<button type="button" class="sc-prism-result-copy" onclick="window.returnToPage=\'soulChatPage\';goToPage(\'profilePage\')" data-i18n="scPrismGoToPlans">Выбрать пакет</button>';
          }
        } else if (reason === 'no_profile_birth_data') {
          // Нет даты/места рождения в профиле — отправляем в профиль заполнить
          html += '<button type="button" class="sc-prism-result-copy" onclick="window.returnToPage=\'soulChatPage\';goToPage(\'profilePage\')" data-i18n="scPrismFillProfile">Заполнить профиль</button>';
        }
        resultEl.innerHTML = html;
        // VK Testers 7277653: тот же скролл что в renderPrismResult — на повторном клике
        // (paywall cached) пользователь должен видеть что блок обновился.
        try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
      }

      // Оффер «Разбор за 100 Искр» — показываем перед списанием (баланса хватает).
      // Покупка разбора — нижняя шторка #prismBuySheet (эталон showcase-analysis-buy). ok/low по балансу.
      function renderPrismPayOffer(prismCode, title, balance) {
        var _tl2 = function(k, fb){ try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return fb || k; };
        var sheet = document.getElementById('prismBuySheet');
        if (!sheet) { // fallback на старый inline-блок
          var resultEl = document.getElementById('scPrismResult');
          if (!resultEl) return;
          _prismCatalogHide();
          var unit0 = _tl2('iskryUnit', 'Искр');
          resultEl.innerHTML = '<div class="sc-prism-result-header"><div class="sc-prism-result-title">' + _escHtml(title || _tl2('scPrismTitle','Разбор')) + '</div><button type="button" class="sc-prism-result-close" onclick="closePrismResult()">×</button></div><button type="button" class="sc-prism-result-copy" onclick="window.runPrismPaid(\'' + _escAttr(prismCode) + '\')">' + _escHtml(_tl2('scPrismPayBtn','Открыть разбор') + ' · 100 ' + unit0) + '</button>';
          resultEl.style.display = 'flex';
          return;
        }
        var t = document.getElementById('prismBuyTitle'); if (t) t.textContent = title || _tl2('scPrismTitle','Разбор');
        var ic = document.getElementById('prismBuyIc'); if (ic) ic.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>';
        var bal = Math.round(balance || 0);
        var balEl = document.getElementById('prismBuyBal'); if (balEl) balEl.textContent = bal;
        var enough = bal >= 100;
        sheet.setAttribute('data-bal', enough ? 'ok' : 'low');
        if (enough) { var a = document.getElementById('prismBuyAfter'); if (a) a.textContent = (bal - 100); }
        else { var sh = document.getElementById('prismBuyShort'); if (sh) sh.textContent = (100 - bal); }
        var openBtn = document.getElementById('prismBuyOpenBtn');
        if (openBtn) openBtn.onclick = function(){ closePrismBuy(); if (typeof window.runPrismPaid === 'function') window.runPrismPaid(prismCode); };
        var topBtn = document.getElementById('prismBuyTopupBtn');
        // На нативе VK scPwShow('iskry') открывает пустую шторку: пакеты и кнопка
        // оплаты скрыты, остаётся «Оплата на платформе недоступна». Ведём в Подарки,
        // где Искра дня реально приходит каждый день.
        // Берём глобальный _tl(), а не _tl2: ниже `var t = document.getElementById(...)`
        // перекрывает глобальную t(), и _tl2 в этой функции всегда отдаёт fallback.
        if (topBtn) {
          if (window._vkSongsOff && window._vkSongsOff()) {
            // Слово «Пополнить» на нативе запрещено: подменяем и подпись, и data-i18n,
            // иначе applyTranslations вернёт старый ключ при смене языка.
            // Подпись честная: кнопка ведёт на экран Подарков, Искру она не выдаёт.
            // «Забрать Искру дня» здесь было ложью — та же надпись в карточке стены
            // Искру реально забирает, одна надпись не может значить два разных действия.
            var lblEl = topBtn.querySelector('[data-i18n="prismBuyTopup"]');
            if (lblEl) { lblEl.setAttribute('data-i18n', 'scWallGoGifts'); lblEl.textContent = _tl('scWallGoGifts', 'Открыть Подарки'); }
            var noteEl = document.querySelector('#prismBuySheet .buy-note.when-low');
            if (noteEl) { noteEl.setAttribute('data-i18n', 'scWallNoteLow'); noteEl.textContent = _tl('scWallNoteLow', 'Искры копятся в Подарках — заходи каждый день.'); }
            topBtn.onclick = function(){ closePrismBuy(); if (typeof goToPage === 'function') goToPage('giftsPage'); };
          } else {
            topBtn.onclick = function(){ closePrismBuy(); if (typeof window.scPwShow === 'function') window.scPwShow('iskry'); };
          }
        }
        sheet.classList.add('is-open');
      }
      // Переключатель планет под разбором «Куда уходит сила»: тот же разбор,
      // другая сторона жизни. Порядок приходит с сервера — первой стоит та,
      // что по карте забирает больше всего.
      window._renderDrainSwitcher = function _renderDrainSwitcher(json) {
        var resultEl = document.getElementById('scPrismResult');
        if (!resultEl || !json || !Array.isArray(json.drain_planets) || !json.drain_planets.length) return;
        var wrap = document.createElement('div');
        wrap.className = 'sc-drain-switch';
        var label = document.createElement('div');
        label.className = 'sc-drain-switch-label';
        label.textContent = (typeof t === 'function' ? (t('drainSwitchLabel') || 'Посмотреть другую сторону') : 'Посмотреть другую сторону');
        wrap.appendChild(label);
        var row = document.createElement('div');
        row.className = 'sc-drain-switch-row';
        json.drain_planets.forEach(function (pl) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'sc-drain-chip' + (pl.planet === json.planet ? ' is-current' : '');
          b.textContent = pl.title;
          b.onclick = function () {
            if (pl.planet === json.planet) return;
            window._drainPlanet = pl.planet;
            runPrismPaid('power_drain', pl.planet);
          };
          row.appendChild(b);
        });
        wrap.appendChild(row);
        resultEl.appendChild(wrap);
      };

      window.closePrismBuy = function closePrismBuy(){ var s = document.getElementById('prismBuySheet'); if (s) s.classList.remove('is-open'); };
      // Платный разбор: single-prism (бэкенд спишет 100 Искр после успеха; 402 → пакеты Искр).
      // «Куда уходит сила» — одна карточка на девять планет. Выбранная планета
      // хранится тут; без выбора сервер берёт ту, что по карте выставляет счёт.
      window._drainPlanet = window._drainPlanet || '';

      async function runPrismPaid(prismCode, planetCode) {
        var resultEl = document.getElementById('scPrismResult');
        var _tl2 = function(k, fb){ try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return fb || k; };
        _prismCatalogHide();
        if (resultEl) { resultEl.style.display = 'flex'; resultEl.innerHTML = '<div class="sc-prism-result-loading">' + _escHtml(_tl2('scPrismPayLoading','Готовлю разбор…')) + '</div>'; }
        try {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var headers = Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}));
          var res = await fetchWithTimeout(apiBase + '/api/soul-chat/prism', { method: 'POST', headers: headers, body: JSON.stringify({ prism_code: prismCode, planet: (prismCode === 'power_drain' ? (planetCode || window._drainPlanet || '') : undefined) }) }, 180000);
          var json = await res.json().catch(function(){ return {}; });
          if (res.ok && json && json.success) {
            // Событие: подарочный разбор открыт. Флаг серверный — фронт его не подделает.
            if (json.used_first_free && window._ysTrack) {
              try { window._ysTrack('prism_first_free_opened', { code: prismCode, platform: window._appEnv || null }); } catch(_) {}
            }
            renderPrismResult(json);
            try { if (prismCode === 'power_drain') window._renderDrainSwitcher(json); } catch (_) {}
            // used_first_free — первый «Имя души» в подарок: бэкенд не списал ничего,
            // значит и локальный баланс уменьшать нельзя.
            if (!json.from_cache && !json.used_first_free && typeof getIskryBalance === 'function' && typeof setIskryBalance === 'function') {
              try { setIskryBalance(Math.max(0, getIskryBalance() - 100)); } catch(_) {}
            }
            // Помечаем полученным и в памяти: перерисовка каталога (смена темы, возврат
            // на экран) не должна вешать замок обратно на оплаченный разбор.
            try { window._prismOwned = window._prismOwned || {}; window._prismOwned[prismCode] = true; } catch(_) {}
            try {
              var c = document.querySelector('#scPrismList .pcard[data-prism="' + prismCode + '"]');
              if (c) {
                c.classList.remove('locked', 'lock');
                c.classList.add('open');
                var cost = c.querySelector('.cost');
                if (cost) {
                  cost.className = 'go';
                  cost.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
                }
              }
            } catch(_) {}
            return;
          }
          if (res.status === 402 || (json && json.reason === 'needs_iskry')) {
            // Те же пустые цены. Сюда сходятся три входа мимо шторки: #prismBuyOpenBtn,
            // fallback-кнопка при отсутствии #prismBuySheet и чипы переключателя планет.
            // Раньше на нативе тут был goToPage('giftsPage') БЕЗ единого слова: экран
            // «Готовлю разбор…» молча подменялся Подарками. Теперь говорим, что
            // произошло, и даём явную кнопку с честной подписью.
            if (window._vkSongsOff && window._vkSongsOff()) {
              renderPrismError(_tl2('scPrismNeedIskryVk', 'Пока не хватает Искр. Сегодняшнюю можно забрать в Подарках.'), 'needs_iskry_vk');
              return;
            }
            if (typeof window.scPwShow === 'function') window.scPwShow('iskry');
            return;
          }
          renderPrismError((json && json.error) || _tl2('scPrismRunFail','Не удалось выполнить разбор.'), json && json.reason, json && json.free_prism);
        } catch (e) {
          renderPrismError(_tl2('scPrismRunFail','Не удалось выполнить разбор.'));
        }
      }
      window.runPrismPaid = runPrismPaid;
      // Разбор-результат показывается ВМЕСТО каталога (#scPrismList), не ПОД ним —
      // иначе блок рендерится ниже всех карточек и срезается нижним навбаром
      // («разборы не кликаются» / «блок, который не проскролить», Алла 20.06).
      // Каталог прячем и показываем одной обёрткой — в ней и шапка, и вход в практику.
      function _prismCatalogHide(){ var c=document.getElementById('scPrismCatalog'); if(c) c.style.display='none'; var p=document.getElementById('scPrismPane'); if(p) p.scrollTop=0; }
      function _prismCatalogShow(){ var c=document.getElementById('scPrismCatalog'); if(c) c.style.display=''; var p=document.getElementById('scPrismPane'); if(p) p.scrollTop=0; }
      window.closePrismResult = function closePrismResult() {
        var resultEl = document.getElementById('scPrismResult');
        if (resultEl) {
          resultEl.style.display = 'none';
          resultEl.innerHTML = '';
          resultEl._rawText = '';
        }
        _prismCatalogShow();
        var _rv = document.getElementById('prismReadView'); if (_rv) _rv.classList.remove('is-open');
        // VK Testers ID 7261316 (Глазунова, Windows): после закрытия ошибки
        // разборов вся страница не реагировала. Корень: state-флаги
        // `_prismCurrentTarget` / `_prismInProgress` / `_prismPreloadInFlight`
        // оставались в неконсистентном состоянии после ошибки → последующие
        // клики призмы попадали в `if (_prismInProgress) return;` и молча
        // игнорировались. Defensive cleanup сбрасывает все флаги.
        try {
          _prismCurrentTarget = null;
          _prismInProgress = false;
          _prismPreloadInFlight = false;
          // Снимаем любой scroll-lock / pointer-events lock на body (если был)
          if (document.body) {
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('pointer-events');
          }
        } catch(_) {}
      };

      window.askAboutPrism = function askAboutPrism() {
        // Захватываем НАЗВАНИЕ разбора, чтобы оракул показал контекст-плашку «Речь пойдёт
        // о вашем разборе «X»» (Алла 06.07: юзер не понимал, что чат — про его разбор).
        var _ctx = null;
        try {
          var _tEl = document.getElementById('prismReadTitle');
          var _ttl = (_tEl && _tEl.textContent || '').trim();
          if (_ttl) _ctx = { title: _ttl };
        } catch(_) {}
        try { closePrismResult(); } catch(_) {}
        try { if (typeof switchOracleTab === 'function') switchOracleTab('chat'); } catch(_) {}
        // Ставим ПОСЛЕ switchOracleTab (он сбрасывает контекст при обычном входе).
        window._oraclePrismContext = _ctx;
        try { if (typeof scUpdateCtxPlank === 'function') scUpdateCtxPlank(); } catch(_) {}
      };
      window.copyPrismResult = async function copyPrismResult() {
        var view = document.getElementById('prismReadView');
        var resultEl = document.getElementById('scPrismResult');
        var text = (view && view._rawText) || (resultEl && resultEl._rawText) || '';
        // VK Testers 7273896 (Тамара Глазунова, MacOS, 14.05.2026): «Отсутствует
        // уведомление об успешном копировании». Корень был тройным:
        // (1) при пустом text функция выходила silent return — нулевая обратная связь;
        // (2) navigator.clipboard может не сработать без HTTPS-secure-context, без
        // user-activation или в iframe без permission — catch{} съедал ошибку,
        // но showToast после catch вызывался с «не удалось» — должен был
        // работать... если только showToast реально не повешен в этом контексте;
        // (3) нет fallback на document.execCommand('copy').
        // Фикс: гарантированное уведомление в КАЖДОМ случае + fallback execCommand.
        if (!text) {
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('scPrismCopyFail') || 'Не удалось скопировать') : 'Не удалось скопировать');
          return;
        }
        // §22: копируем ТОЛЬКО через _copyToClipboard — он сам уходит в execCommand
        // на VK и старых WebView. VKWebAppCopyText убран: на мобильных клиентах VK
        // показывал свой native toast поверх нашего — двойное уведомление (7279957).
        var ok = false;
        try {
          ok = (typeof window._copyToClipboard === 'function')
            ? await Promise.resolve(window._copyToClipboard(text, { silent: true }))
            : false;
        } catch (clipErr) {
          console.warn('[copyPrismResult] copy failed:', clipErr && clipErr.message);
        }
        if (typeof showToast === 'function') {
          showToast(ok ? (typeof t === 'function' ? (t('scPrismCopied') || 'Расклад скопирован') : 'Расклад скопирован') : (typeof t === 'function' ? (t('scPrismCopyFail') || 'Не удалось скопировать') : 'Не удалось скопировать'));
        }
      };

      function renderDiaryTopicCards() {
        var wrap = document.getElementById('scDiaryTopicCards');
        if (!wrap) return;
        wrap.innerHTML = '';
        var checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        var VIS = {
          career:        { g:'linear-gradient(150deg,#f59e0b,#c2780f)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18"/></svg>' },
          relationships: { g:'linear-gradient(150deg,#ec4899,#b1356f)', s:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.17 2 7.5 2 4.5 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.5 22 7.5c0 3.67-3.4 6.74-8.55 11.48L12 20.3z"/></svg>' },
          health:        { g:'linear-gradient(150deg,#34d8a8,#1aa67e)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-5 3 10 2-5h4"/></svg>' },
          growth:        { g:'linear-gradient(150deg,#a3e635,#4d9a16)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9M12 9c0-3 2.2-5.5 5-5.5.2 2.8-1.9 5.5-5 5.5zM12 13c0-2.6-2-4.5-4.5-4.5C7.3 11 9.3 13 12 13z"/></svg>' },
          creativity:    { g:'linear-gradient(150deg,#f472b6,#a855f7)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-1.3-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none"/></svg>' },
          transformation:{ g:'linear-gradient(150deg,#22d3ee,#3a78c2)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a8 8 0 0 1 13.5-3L20 7M20 4v3h-3M20 16a8 8 0 0 1-13.5 3L4 17M4 20v-3h3"/></svg>' },
          purpose:       { g:'linear-gradient(150deg,#f7cf7a,#e0991a)', s:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>' },
          peace:         { g:'linear-gradient(150deg,#818cf8,#5b3fd0)', s:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9c-2 1.5-5 1.5-7-.5s-2-5-2-8.5z"/></svg>' }
        };
        ORACLE_TOPICS.forEach(function(tp) {
          var vis = VIS[tp.id] || { g:'linear-gradient(150deg,#a855f7,#6d28d9)', s:'' };
          var card = document.createElement('button');
          card.type = 'button';
          card.className = 'dset-topic';
          card.setAttribute('data-topic', tp.id);
          if (_diarySelectedTopics.indexOf(tp.id) >= 0) card.classList.add('dset-sel');
          card.innerHTML = '<span class="dset-topic-check">' + checkSvg + '</span>'
            + '<span class="dset-topic-ic" style="background:' + vis.g + '">' + vis.s + '</span>'
            + '<span class="dset-topic-name">' + _oracleTopicLabel(tp) + '</span>'
            + '<span class="dset-topic-sub">' + _oracleTopicDesc(tp) + '</span>';
          card.onclick = function() {
            var idx = _diarySelectedTopics.indexOf(tp.id);
            if (idx >= 0) { _diarySelectedTopics.splice(idx, 1); card.classList.remove('dset-sel'); }
            else if (_diarySelectedTopics.length < 3) { _diarySelectedTopics.push(tp.id); card.classList.add('dset-sel'); }
            _syncDiaryOnboardingCta();
          };
          wrap.appendChild(card);
        });
        _syncDiaryOnboardingCta();
      }
      function _syncDiaryOnboardingCta() {
        var n = _diarySelectedTopics.length;
        var meta = document.getElementById('scDiaryPickMeta');
        if (meta) {
          var tpl = (typeof t === 'function' ? (t('diaryPickedTpl') || 'Выбрано {n} из 3') : 'Выбрано {n} из 3');
          meta.innerHTML = tpl.replace('{n}', '<span class="dset-cnt">' + n + '</span>');
        }
        var btn = document.getElementById('scDiaryStartBtn');
        if (btn) {
          btn.disabled = n < 1;
          btn.textContent = n < 1
            ? (typeof t === 'function' ? (t('diaryPickAtLeastOne') || 'Выбери хотя бы одну тему') : 'Выбери хотя бы одну тему')
            : ((typeof t === 'function' ? (t('diaryEnableBtn') || 'Включить Дневник') : 'Включить Дневник') + ' · ' + n);
        }
        var prevBtn = document.getElementById('scDiaryPreviewBtn');
        if (prevBtn) prevBtn.style.display = n >= 1 ? 'block' : 'none';
      }

      async function submitDiaryOnboarding() {
        if (_diarySelectedTopics.length < 1) return;
        var startBtn = document.getElementById('scDiaryStartBtn');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = t('oracleConfiguring'); }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var sendH = getAuthHeaders();
        var timeEl = document.getElementById('scDiaryDeliveryTime');
        var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
        try {
          // Batch 10.30 (отчёт 7256664 Windows): «Loader висит без ответа >10 мин».
          // Корень: plain fetch без таймаута. На холодном старте Render может висеть
          // очень долго. Фикс: fetchWithTimeout 30s. После таймаута — actionable
          // toast + кнопка возвращается в исходное состояние.
          var resp = await fetchWithTimeout(apiBase + '/api/daily-oracle/onboarding', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, sendH),
            body: JSON.stringify({ topics: _diarySelectedTopics, delivery_time: timeEl ? timeEl.value : '08:00', timezone: tz, channel: 'both' })
          }, 30000);
          var json = await resp.json();
          if (json.success) {
            // VK Testers 7278001 (Дарья Windows EN 17.05): «Дневник настроен» оставался RU на EN locale.
            if (typeof showToast === 'function') {
              var _msg = json.trial_started
                ? (typeof t === 'function' ? (t('diaryTrialStarted') || 'Триал 3 дня активирован!') : 'Триал 3 дня активирован!')
                : (typeof t === 'function' ? (t('diarySaved') || 'Дневник настроен!') : 'Дневник настроен!');
              showToast(_msg);
            }
            initDiaryPane();
          } else {
            if (typeof showToast === 'function') showToast(json.error || (typeof t === 'function' ? (t('diaryActivateFail') || 'Не удалось активировать. Попробуй ещё раз.') : 'Не удалось активировать. Попробуй ещё раз.'));
            if (startBtn) { startBtn.disabled = false; startBtn.textContent = t('oracleStart3Days'); }
          }
        } catch (e) {
          console.warn('[Oracle onboarding]', e);
          // Закон №37: offline → overlay; online → actionable «Попробуй ещё раз»
          if (typeof window._ensureOnline === 'function') window._ensureOnline();
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('oracleOnboardingRetry') || 'Не получилось. Повтори, пожалуйста.') : 'Не получилось. Повтори, пожалуйста.');
          if (startBtn) { startBtn.disabled = false; startBtn.textContent = t('oracleStart3Days'); }
        }
      }
      window.submitDiaryOnboarding = submitDiaryOnboarding;
      window.renderDiaryTopicCards = renderDiaryTopicCards;
      window._syncDiaryOnboardingCta = _syncDiaryOnboardingCta;

      async function requestOraclePreview() {
        var btn = document.getElementById('scDiaryPreviewBtn');
        var result = document.getElementById('scDiaryPreviewResult');
        if (!btn || !result) return;
        if (_diarySelectedTopics.length < 1) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="oracle-loading" style="display:inline-flex;padding:0;font-size:0.85rem;color:rgba(255,255,255,0.5);">' + t('oracleThinking') + '</span>';
        result.style.display = 'block';
        result.innerHTML = '<div class="oracle-loading" style="justify-content:flex-start;">' + t('oracleGenerating') + '</div>';
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var sendH = getAuthHeaders();
        try {
          var resp = await fetchWithTimeout(apiBase + '/api/daily-oracle/preview', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, sendH),
            body: JSON.stringify({ topics: _diarySelectedTopics })
          }, 120000);
          var json = await resp.json();
          if (json.success && json.preview) {
            var html = json.preview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            var paras = html.split(/\n+/).filter(function(p){ return p.trim().length > 0; });
            result.innerHTML = '<div style="color:rgba(var(--primary-rgb),0.7);font-size:0.72rem;font-weight:600;margin-bottom:8px;">' + t('oracleExample') + '</div>' +
              paras.map(function(p){ return '<p style="margin:0 0 0.6em;line-height:1.6;">' + p + '</p>'; }).join('');
            result.style.display = 'block';
          } else {
            // Backend-сигнал «success=false» — обычно «нет даты рождения в профиле».
            // Это actionable hint (закон №37: actionable info ≠ network error).
            result.innerHTML = '<span style="color:rgba(255,255,255,0.4);">' + t('oracleGenerateFail') + '</span>';
            result.style.display = 'block';
          }
        } catch(e) {
          // Закон №37: offline → overlay; online → скрываем результат, кнопка вернётся
          // в состояние «попробовать ещё» через finally. Никакого error UI.
          if (typeof window._ensureOnline === 'function') window._ensureOnline();
          console.warn('[OraclePreview] silent fail');
          result.innerHTML = '';
          result.style.display = 'none';
        } finally {
          btn.disabled = false;
          btn.textContent = t('oracleViewAnother');
        }
      }
      window.requestOraclePreview = requestOraclePreview;

      // Иконки тем для плиток: те же контуры, что на экране настройки дневника.
      var DIARY_TOPIC_ICONS = {
        career:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/></svg>',
        relationships: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.16 2 7.9 2 5.42 4 3.5 6.5 3.5c1.54 0 3.04.78 4 2.02.96-1.24 2.46-2.02 4-2.02C17 3.5 19 5.42 19 7.9c0 3.26-3.4 6.34-8.55 11.08z"/></svg>',
        health:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.5h4l2-5 3 10 2.5-6 1.5 3h5"/></svg>',
        growth:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M12 12c-3.5 0-5.5-2-5.5-5.5C10 6.5 12 8.5 12 12Z"/><path d="M12 14c3 0 5-1.8 5-5-3 0-5 1.8-5 5Z"/></svg>',
        creativity:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2-.6-1 0-2 1.1-2H16a4.5 4.5 0 0 0 4.5-4.5C20.5 7 16.7 3.5 12 3.5Z"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.8" r="1"/><circle cx="15.5" cy="10" r="1"/></svg>',
        transformation:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4.5v4h4"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 19.5v-4h-4"/></svg>',
        purpose:       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>',
        peace:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        _default:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/></svg>'
      };

      // Иконки эталона showcase-oracle — теги целиком, размеры задаёт его CSS.
      var DIARY_ASK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-11.6 7.8L3 21l1.8-6.2A8.4 8.4 0 1 1 21 11.5Z"/></svg>';
      var DIARY_COST_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c0 5.36-4.44 9.8-9.8 9.8 5.36 0 9.8 4.44 9.8 9.8 0-5.36 4.44-9.8 9.8-9.8-5.36 0-9.8-4.44-9.8-9.8Z"/></svg>';
      var DIARY_CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/></svg>';

      // Карточка «сегодня» — .today эталона: строка даты с серией, заголовок по теме,
      // текст разбора, кнопка вопроса. Класс sc-diary-ask на кнопке оставлен: он выводит
      // её из-под глобальной пилюли, иначе та навязала бы свой размер и вес шрифта.
      function renderDiaryTodayCard(msg) {
        var wrap = document.getElementById('scDiaryTodayCard');
        if (!wrap || !msg) { if (wrap) wrap.style.display = 'none'; return; }
        var _dLocale = { ru: 'ru-RU', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
        var dateLabel = new Date(msg.message_date + 'T00:00:00').toLocaleDateString(_dLocale, { day: 'numeric', month: 'long' });
        var todayLabel = (typeof t === 'function' ? (t('today') || 'Сегодня') : 'Сегодня');
        var askOracleLabel = (typeof t === 'function' ? (t('scAskOracle') || 'Спросить Оракула') : 'Спросить Оракула');
        var topic = (msg.focus_topics && msg.focus_topics[0]) || '';
        var heading = topic ? _oracleTopicLabel(topic) : '';
        var safe = msg.message_text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        var bodyHtml = safe.split(/\n+/).filter(function(p){ return p.trim().length > 0; }).map(function(p){ return '<p>' + p + '</p>'; }).join('');
        wrap.className = 'today';
        wrap.innerHTML = '<div class="dt"></div>'
          + (heading ? '<h3></h3>' : '')
          + bodyHtml
          + '<button type="button" class="today-ask sc-diary-ask" onclick="openDiaryReply(\'' + msg.id + '\')">'
          + DIARY_ASK_ICON + '<span></span>' + _diaryAskCostHtml() + '</button>';
        var _dt = wrap.querySelector('.dt');
        _dt.appendChild(document.createTextNode(todayLabel + ' · ' + dateLabel));
        var _em = document.createElement('em'); _em.id = 'scDiaryStreakLine'; _dt.appendChild(_em);
        wrap.querySelector('.today-ask > span').textContent = askOracleLabel;
        if (heading) wrap.querySelector('h3').textContent = heading;
        wrap.style.display = 'block';
        renderDiaryStreak();
      }

      function _diaryTopicHue(topic) {
        var m = { career:30, relationships:330, health:150, growth:90, creativity:280, transformation:200, purpose:50 };
        return (m[topic] != null) ? m[topic] : 265;
      }
      function _diaryDayLabel(dateStr) {
        var loc = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
        var today = new Date(); today.setHours(0,0,0,0);
        var d = new Date(dateStr + 'T00:00:00');
        var diff = Math.round((today - d) / 86400000);
        if (diff === 0) return (typeof t === 'function' ? (t('today') || 'Сегодня') : 'Сегодня');
        if (diff === 1) return (typeof t === 'function' ? (t('yesterday') || 'Вчера') : 'Вчера');
        return d.toLocaleDateString(loc, { day:'numeric', month:'long' });
      }
      function _diaryAskCostHtml() {
        if (window._scOracleUnlimited) return '';
        var free = Number(window._scOracleFreeLeft);
        if (!Number.isFinite(free) || free > 0) return '';
        return '<span class="ask-cost">' + DIARY_COST_ICON + '1</span>';
      }

      // Разбора на сегодня ещё нет. Эталон держит карточку дня главным якорем экрана,
      // поэтому вместо пустого места показываем ту же карточку с ожиданием.
      function renderDiaryWaitingCard(deliveryTime) {
        var wrap = document.getElementById('scDiaryTodayCard');
        if (!wrap) return;
        var L = function(k, fb){ return (typeof t === 'function' ? t(k) : fb) || fb; };
        var _dLocale = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
        var dateLabel = new Date().toLocaleDateString(_dLocale, { day:'numeric', month:'long' });
        wrap.className = 'today';
        wrap.innerHTML = '<div class="dt"></div><h3></h3><p></p>';
        var _dtw = wrap.querySelector('.dt');
        _dtw.appendChild(document.createTextNode(L('today', 'Сегодня') + ' · ' + dateLabel));
        var _emw = document.createElement('em'); _emw.id = 'scDiaryStreakLine'; _dtw.appendChild(_emw);
        wrap.querySelector('h3').textContent = L('diaryWaitTitle', 'Разбор ещё в пути');
        wrap.querySelector('p').textContent = L('diaryWaitText', 'Придёт в {time} — одним сообщением.').replace('{time}', String(deliveryTime || '08:00'));
        wrap.style.display = 'block';
        renderDiaryStreak();
      }

      // Серия дней и число прошлых разборов. В эталоне отдельной плашки нет: серия
      // стоит строкой в карточке «сегодня», число разборов — подписью раздела «Раньше».
      // Прежняя плашка #scDiaryStreak со счётчиками «разборов / дней / тем» снята вместе
      // с разметкой — эталон эти три числа не показывает.
      function renderDiaryStreak() {
        // Итог берём из локальной переменной: loadDiaryFeed присваивает именно её,
        // а не window — раньше подпись раздела «Раньше» всегда считала ноль.
        var total = _diaryFeedTotal || window._diaryFeedTotal || 0;
        var dates = (window._diaryAllDates ? Array.from(window._diaryAllDates) : []).sort().reverse();
        var streak = 0;
        if (dates.length) {
          streak = 1;
          for (var i = 1; i < dates.length; i++) {
            var dd = Math.round((new Date(dates[i-1]+'T00:00:00') - new Date(dates[i]+'T00:00:00')) / 86400000);
            if (dd === 1) streak++; else break;
          }
        }
        var L = function(k, fb){ return (typeof t === 'function' ? t(k) : fb) || fb; };
        var line = document.getElementById('scDiaryStreakLine');
        if (line) line.textContent = streak > 1 ? L('diaryStreakLine', '{n} дней подряд').replace('{n}', streak) : '';
        var head = document.getElementById('scDiaryFeedHead');
        var cnt = document.getElementById('scDiaryFeedCount');
        if (cnt) cnt.textContent = total > 0 ? L('diaryFeedCount', '{n} разборов').replace('{n}', total) : '';
        if (head) head.style.display = total > 0 ? 'flex' : 'none';
      }

      // Первая фраза разбора для заголовка записи. Обращение по имени в начале
      // («Алла, сегодня…») срезаем — иначе все записи начинаются одинаково.
      function _diaryEntryTitle(text) {
        var t0 = String(text || '').trim();
        if (!t0) return '';
        var nm = (window._cachedProfile && window._cachedProfile.name) || '';
        nm = String(nm).trim().split(/\s+/)[0];
        if (nm.length > 1) {
          var esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          t0 = t0.replace(new RegExp('^[«"\']?' + esc + '[,!]?\\s+', 'i'), '');
        }
        var parts = t0.split(/(?<=[.!?…])\s+/);
        var pick = '';
        for (var pi = 0; pi < parts.length && pi < 4; pi++) {
          var cand = parts[pi].replace(/[.!?…]+$/, '').trim();
          if (nm.length > 1) cand = cand.replace(new RegExp('(^|,\\s*)' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,!?]?(\\s+|$)', 'gi'), '$1').replace(/^[,\s]+|[,\s]+$/g, '');
          if (cand.length >= 12 && /\s/.test(cand)) { pick = cand; break; }
        }
        var out = pick || t0.slice(0, 70).replace(/[.!?…]+$/, '').trim();
        if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
        return out.length > 62 ? out.slice(0, 60).replace(/\s+\S*$/, '') + '…' : out;
      }

      // Запись ленты — .fi эталона: число и месяц слева, заголовок с подзаголовком,
      // стрелка справа. Класс entry оставлен: по нему раскрывается текст записи.
      function renderDiaryFeedItem(msg) {
        var loc = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
        var d = new Date(msg.message_date + 'T00:00:00');
        var dayNum = d.toLocaleDateString(loc, { day: '2-digit' });
        var monthShort = d.toLocaleDateString(loc, { month: 'short' }).replace(/\.$/, '');
        var topic = (msg.focus_topics && msg.focus_topics[0]) || '';
        var body = (msg.message_text || '').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' ').trim();
        // Заголовок записи — первая фраза самого разбора. Названием темы его делать нельзя:
        // тем всего восемь, и лента превращалась в столбец одинаковых строк «Отношения».
        var title = _diaryEntryTitle(body) || (topic ? _oracleTopicLabel(topic) : '')
          || ((typeof t === 'function' ? t('diaryEntryTitle') : '') || 'Разбор дня');
        // Подпись — тема: она отвечает «о чём это», когда заголовок уже занят фразой.
        var snip = topic ? _oracleTopicLabel(topic) : body;
        var continueLabel = (typeof t === 'function' ? (t('diaryContinueInChat') || 'Продолжить в чате') : 'Продолжить в чате');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fi entry';
        btn.innerHTML = '<span class="fi-d"></span>'
          + '<span class="fi-b"><b></b><span></span></span>'
          + '<span class="go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>';
        var dEl = btn.querySelector('.fi-d');
        dEl.textContent = dayNum;
        var mEl = document.createElement('span'); mEl.textContent = monthShort; dEl.appendChild(mEl);
        btn.querySelector('.fi-b b').textContent = title;
        btn.querySelector('.fi-b span').textContent = snip;
        btn.onclick = function() {
          var nxt = btn.nextElementSibling;
          if (nxt && nxt.classList.contains('entry-expand')) { nxt.remove(); return; }
          var exp = document.createElement('div');
          exp.className = 'entry-expand';
          var safe = msg.message_text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          exp.innerHTML = safe.split(/\n+/).filter(function(p){ return p.trim(); }).map(function(p){ return '<p>' + p + '</p>'; }).join('')
            + '<button type="button" class="sc-diary-continue" onclick="event.stopPropagation();openDiaryReply(\'' + msg.id + '\')">' + continueLabel + '</button>';
          btn.parentNode.insertBefore(exp, btn.nextSibling);
        };
        return btn;
      }

      async function loadDiaryFeed(reset) {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var sendH = getAuthHeaders();
        if (reset) { _diaryFeedOffset = 0; window._diaryLastDay = null; window._diaryAllDates = new Set(); window._diaryAllTopics = new Set(); var list = document.getElementById('scDiaryFeedList'); if (list) list.innerHTML = ''; }
        // Batch 10.19 (закон №37): silent retry с backoff, никакого error текста.
        // Online → продолжаем тихо. Offline → overlay.
        var _att = 0;
        while (true) {
          if (!window._ensureOnline()) {
            await new Promise(function(r){
              window.addEventListener('online', function onOnline(){
                window.removeEventListener('online', onOnline); r();
              });
            });
            continue;
          }
          try {
            var resp = await fetchWithTimeout(apiBase + '/api/daily-oracle/feed?limit=' + (reset ? 3 : 20) + '&offset=' + _diaryFeedOffset, { headers: sendH }, 20000);
            var json = await resp.json().catch(function(){ return {}; });
            if (!json.success) return;
            _diaryFeedTotal = json.total || 0;
            var list = document.getElementById('scDiaryFeedList');
            if (!list) return;
            (json.messages || []).forEach(function(msg) {
              var todayStr = new Date().toISOString().split('T')[0];
              if (msg.message_date === todayStr) return;
              window._diaryAllDates.add(msg.message_date);
              if (msg.focus_topics) msg.focus_topics.forEach(function(tp){ window._diaryAllTopics.add(tp); });
              // Разделители дней сняты: в эталоне дата стоит в самой записи (.fi-d),
              // а лента — одна карточка с волосяными линиями между строками.
              list.appendChild(renderDiaryFeedItem(msg));
            });
            _diaryFeedOffset += (json.messages || []).length;
            renderDiaryStreak();
            var moreBtn = document.getElementById('scDiaryLoadMore');
            if (moreBtn) moreBtn.style.display = _diaryFeedOffset < _diaryFeedTotal ? 'block' : 'none';
            return;
          } catch (e) { console.warn('[OracleFeed] silent retry', e); }
          _att++;
          if (_att >= 4) return; // потом сдаёмся тихо
          await new Promise(function(r){ setTimeout(r, Math.min(20000, 1500 * Math.pow(1.7, _att))); });
        }
      }
      window.loadMoreDiaryFeed = function() { loadDiaryFeed(false); };

      async function openDiaryReply(messageId) {
        window._oracleReplyMessageId = messageId;
        // Batch 10.9 (отчёт 7271877 Windows): если у юзера нет подписки —
        // переход в Чат показывал paywall с СКРЫТЫМ полем ввода (display:none).
        // Юзер видел: «нажал Спросить → поле ввода исчезло». Запутывает.
        // Теперь: переходим на Soul Chat → switchOracleTab('chat') → если есть
        // доступ, показываем чат; если нет — пользователь видит paywall с
        // кнопкой «Подписаться» (а не «исчезновение» поля). Toast объясняет.
        try { if (typeof switchOracleTab === 'function') switchOracleTab('chat'); } catch(_) {}
        goToPage('soulChatPage');
        if (window._scAccessGranted && typeof window.showChat === 'function') {
          try { window.showChat(); } catch(_) {}
          try { if (typeof scLoadHistory === 'function') scLoadHistory(); } catch(_) {}
        } else {
          // Нет подписки — toast чтобы юзер понял почему вместо чата paywall.
          try {
            if (typeof window.showToast === 'function') {
              window.showToast(typeof t === 'function' ? t('scSubRequiredForReply') : 'Для ответа Оракулу нужен пакет');
            }
          } catch(_) {}
        }
        // Pre-filled вопрос (textarea может монтироваться чуть позже — даём микротаск)
        Promise.resolve().then(function() {
          var ta = document.getElementById('scPageQuestion');
          if (ta) {
            ta.value = 'Расскажи подробнее про сегодняшний разбор';
            // На paywall ta не отображается, focus безопасен — браузер игнорирует
            ta.focus();
            ta.dispatchEvent(new Event('input'));
          }
        });
      }
      window.openDiaryReply = openDiaryReply;

      function showDiarySettings() {
        var settings = document.getElementById('scDiarySettings');
        var content = document.getElementById('scDiaryContent');
        var onboarding = document.getElementById('scDiaryOnboarding');
        if (!settings) return;
        if (settings.style.display === 'none') {
          settings.style.display = 'block';
          if (content) content.style.display = 'none';
          if (onboarding) onboarding.style.display = 'none';
          // VK Testers 7256664 ПЕРЕОТКРЫТ-3 (Алина 18.05 13:30): «Нет возможности
          // выбрать темы». Корень: showDiarySettings показывал панель, но НЕ
          // вызывал renderDiarySettingsTopics — pills оставались статичными с
          // прошлой инициализации без click handlers. Подгружаем актуальные
          // темы с бэка и принудительно перерисовываем.
          try {
            var _apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            var _hdr = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
            fetchWithTimeout(_apiBase + '/api/daily-oracle/access', { headers: _hdr }, 20000)
              .then(function(r){ return r.json(); })
              .then(function(d){ renderDiarySettingsTopics((d && d.focus_topics) || []); })
              .catch(function(){ renderDiarySettingsTopics([]); });
          } catch(_) { renderDiarySettingsTopics([]); }
        } else {
          settings.style.display = 'none';
          initDiaryPane();
        }
      }
      window.showDiarySettings = showDiarySettings;

      async function saveDiarySettings() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var sendH = getAuthHeaders();
        var enabledEl = document.getElementById('scDiaryEnabledToggle');
        var timeEl = document.getElementById('scDiarySettingsTime');
        var body = {};
        if (enabledEl) body.enabled = enabledEl.checked;
        if (timeEl && timeEl.value) body.delivery_time = timeEl.value;
        var topicBtns = document.querySelectorAll('#scDiarySettingsTopics .oracle-settings-topic-btn.selected');
        if (topicBtns.length > 0) body.topics = Array.from(topicBtns).map(function(b){ return b.getAttribute('data-topic'); });
        try {
          await fetchWithTimeout(apiBase + '/api/daily-oracle/settings', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, sendH),
            body: JSON.stringify(body)
          }, 20000);
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('toastSaved') : 'Сохранено');
          // Плитки тем на самом экране дневника показывают те же темы — держим их
          // в согласии с настройками, иначе экраны разойдутся до перезагрузки.
          if (body.topics && typeof renderDiaryThemes === 'function') renderDiaryThemes(body.topics);
          if (body.delivery_time && typeof renderDiaryPick === 'function') renderDiaryPick(body.delivery_time);
          // Закрываем настройки → возвращаемся к фиду
          showDiarySettings();
        } catch (e) { if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('toastError') : 'Ошибка'); }
      }
      window.saveDiarySettings = saveDiarySettings;

      function renderDiarySettingsTopics(currentTopics) {
        var wrap = document.getElementById('scDiarySettingsTopics');
        if (!wrap) return;
        wrap.innerHTML = '';
        ORACLE_TOPICS.forEach(function(t) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'oracle-settings-topic-btn' + (currentTopics.indexOf(t.id) >= 0 ? ' selected' : '');
          btn.setAttribute('data-topic', t.id);
          btn.textContent = _oracleTopicLabel(t); // без эмодзи на <button> (закон №3)
          btn.style.cssText = 'padding:8px 16px;border-radius:9999px;font-size:0.8rem;cursor:pointer;transition:all 0.2s;pointer-events:auto;-webkit-tap-highlight-color:transparent;border:1px solid ' + (currentTopics.indexOf(t.id) >= 0 ? 'rgba(var(--primary-rgb),0.5)' : 'rgba(255,255,255,0.12)') + ';background:' + (currentTopics.indexOf(t.id) >= 0 ? 'rgba(var(--primary-rgb),0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (currentTopics.indexOf(t.id) >= 0 ? 'var(--primary-color)' : 'rgba(255,255,255,0.6)') + ';';
          btn.onclick = function() {
            btn.classList.toggle('selected');
            var sel = btn.classList.contains('selected');
            btn.style.borderColor = sel ? 'rgba(var(--primary-rgb),0.4)' : 'rgba(255,255,255,0.1)';
            btn.style.background = sel ? 'rgba(var(--primary-rgb),0.1)' : 'rgba(255,255,255,0.03)';
            btn.style.color = sel ? 'var(--primary-color)' : 'rgba(255,255,255,0.6)';
          };
          wrap.appendChild(btn);
        });
      }

      // Выбор тем и строка доставки — .themes/.th и .pick эталона. В эталоне это часть
      // самого экрана дневника, а не отдельные настройки: тему видно и можно переключить
      // на месте. Экран настроек никуда не делся — там остаются уведомления и время.
      // Экран дневника в двух режимах: настройка (нет карточки дня и ленты, есть
      // кнопка включения) и рабочий. Разметка одна — эталон не разводит их на два экрана.
      function _diarySetupMode(on) {
        var hide = ['scDiaryTodayCard', 'scDiaryWaiting', 'scDiaryFeedHead', 'scDiaryFeedList', 'scDiaryLoadMore'];
        hide.forEach(function(id){ var e = document.getElementById(id); if (e) e.style.display = on ? 'none' : ''; });
        var btn = document.getElementById('scDiaryEnableBtn');
        var note = document.getElementById('scDiaryEnableNote');
        if (btn) btn.style.display = on ? 'flex' : 'none';
        if (note) note.style.display = on ? 'block' : 'none';
        _syncDiaryEnableBtn();
      }
      function _syncDiaryEnableBtn() {
        var btn = document.getElementById('scDiaryEnableBtn');
        if (!btn || btn.style.display === 'none') return;
        var n = document.querySelectorAll('#scDiaryThemes .th.on').length;
        var L = function(k, fb){ return (typeof t === 'function' ? t(k) : fb) || fb; };
        btn.disabled = n < 1;
        btn.innerHTML = DIARY_ASK_ICON + '<span></span>';
        btn.querySelector('span').textContent = n < 1
          ? L('diaryPickAtLeastOne', 'Выбери хотя бы одну тему')
          : L('diaryEnableBtn', 'Включить Дневник') + ' · ' + n;
      }
      window.submitDiaryFromThemes = async function submitDiaryFromThemes() {
        var picked = Array.prototype.map.call(document.querySelectorAll('#scDiaryThemes .th.on'),
          function(b){ return b.getAttribute('data-topic'); });
        if (!picked.length) return;
        if (!window._ensureOnline()) return;
        var btn = document.getElementById('scDiaryEnableBtn');
        if (btn) btn.disabled = true;
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
        try {
          var resp = await fetchWithTimeout(apiBase + '/api/daily-oracle/onboarding', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
            body: JSON.stringify({ topics: picked, delivery_time: '08:00', timezone: tz, channel: 'both' })
          }, 30000);
          var json = await resp.json().catch(function(){ return {}; });
          if (json.success) {
            if (typeof showToast === 'function') showToast(json.trial_started
              ? ((typeof t === 'function' && t('diaryTrialStarted')) || 'Триал 3 дня активирован!')
              : ((typeof t === 'function' && t('diarySaved')) || 'Дневник настроен!'));
            initDiaryPane();
            return;
          }
        } catch (e) { console.warn('[Diary] включение — тихий повтор позже', e); }
        if (btn) btn.disabled = false;
        _syncDiaryEnableBtn();
      };

      var _diaryThemesSaveTimer = null;
      function renderDiaryThemes(currentTopics) {
        var wrap = document.getElementById('scDiaryThemes');
        if (!wrap) return;
        var sel = Array.isArray(currentTopics) ? currentTopics.slice() : [];
        wrap.innerHTML = '';
        ORACLE_TOPICS.forEach(function(tp) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'th' + (sel.indexOf(tp.id) >= 0 ? ' on' : '');
          btn.setAttribute('data-topic', tp.id);
          btn.innerHTML = '<span class="th-ic">' + (DIARY_TOPIC_ICONS[tp.id] || DIARY_TOPIC_ICONS._default) + '</span><b></b><span></span>';
          btn.querySelector('b').textContent = _oracleTopicLabel(tp);
          btn.querySelectorAll('span')[1].textContent = _oracleTopicDesc(tp);
          btn.onclick = function() {
            var i = sel.indexOf(tp.id);
            var _setupNow = (function(){ var b = document.getElementById('scDiaryEnableBtn'); return !!(b && b.style.display !== 'none'); })();
            if (i >= 0) {
              if (sel.length === 1 && !_setupNow) return; // в рабочем режиме одна тема обязана остаться
              sel.splice(i, 1); btn.classList.remove('on');
            } else {
              if (sel.length >= 3) return; // потолок — три темы
              sel.push(tp.id); btn.classList.add('on');
            }
            var setup = document.getElementById('scDiaryEnableBtn');
            if (setup && setup.style.display !== 'none') { _syncDiaryEnableBtn(); return; }
            // Сохраняем с задержкой: человек часто щёлкает несколько тем подряд.
            if (_diaryThemesSaveTimer) clearTimeout(_diaryThemesSaveTimer);
            _diaryThemesSaveTimer = setTimeout(function(){ _saveDiaryTopics(sel.slice()); }, 700);
          };
          wrap.appendChild(btn);
        });
      }
      async function _saveDiaryTopics(topics) {
        if (!topics.length) return;
        if (!window._ensureOnline()) return;
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        try {
          await fetchWithTimeout(apiBase + '/api/daily-oracle/settings', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
            body: JSON.stringify({ topics: topics })
          }, 20000);
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('toastSaved') : 'Сохранено');
          // Экран настроек читает те же темы — держим его в согласии с этим экраном.
          renderDiarySettingsTopics(topics);
        } catch (e) { console.warn('[Diary] сохранение тем — тихий повтор позже', e); }
      }
      function renderDiaryPick(deliveryTime) {
        var el = document.getElementById('scDiaryPick');
        if (!el) return;
        var time = deliveryTime || '08:00';
        var L = function(k, fb){ return (typeof t === 'function' ? t(k) : fb) || fb; };
        // В эталоне текст и <b> лежат прямо в .pick — так строка остаётся одной
        // строкой флекса. Обёртка в <span> ломала бы раскладку.
        el.innerHTML = DIARY_CLOCK_ICON;
        var tpl = L('diaryPickLine', 'Приходит в {time} · одно сообщение в день');
        var parts = tpl.split('{time}');
        el.appendChild(document.createTextNode(' ' + parts[0]));
        var bEl = document.createElement('b');
        bEl.textContent = String(time);
        el.appendChild(bEl);
        if (parts[1]) el.appendChild(document.createTextNode(parts[1]));
        el.style.display = 'flex';
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.onclick = function() {
          // пока дневник не включён, настраивать нечего — строка просто показывает время
          var setup = document.getElementById('scDiaryEnableBtn');
          if (setup && setup.style.display !== 'none') return;
          showDiarySettings();
        };
      }
      window.renderDiaryThemes = renderDiaryThemes;

      async function initDiaryPane() {
        _diaryInitialized = true;
        var onboarding = document.getElementById('scDiaryOnboarding');
        var content = document.getElementById('scDiaryContent');
        var paywall = document.getElementById('scDiaryPaywall');
        var settingsPanel = document.getElementById('scDiarySettings');
        var todayCard = document.getElementById('scDiaryTodayCard');
        var waiting = document.getElementById('scDiaryWaiting');
        var feedList = document.getElementById('scDiaryFeedList');
        var settingsBtn = document.getElementById('scDiarySettingsBtn');
        [onboarding, content, paywall, settingsPanel].forEach(function(el) { if (el) el.style.display = 'none'; });
        if (todayCard) todayCard.style.display = 'none';
        if (waiting) waiting.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';

        if (feedList) feedList.innerHTML = '<div class="oracle-loading">' + t('loading') + '</div>';
        if (content) content.style.display = 'block';

        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var sendH = getAuthHeaders();
        try {
          // Batch 10.18+10.19 (Алла, 14.05): закон №37 — ошибки видны ТОЛЬКО при offline.
          // Online → silent retry бесконечно с backoff, никакого "Ошибка соединения" текста.
          // Offline → показываем vkOfflineOverlay, ждём 'online' event и продолжаем.
          var resp = null, json = {};
          var DIARY_FETCH_TIMEOUT = 25000;
          var _attempt = 0;
          while (true) {
            if (!window._ensureOnline()) {
              // Offline overlay показан. Ждём online event и продолжаем цикл.
              await new Promise(function(r) {
                window.addEventListener('online', function onOnline() {
                  window.removeEventListener('online', onOnline); r();
                });
              });
              continue;
            }
            try {
              resp = await fetchWithTimeout(apiBase + '/api/daily-oracle/access', { headers: sendH }, DIARY_FETCH_TIMEOUT);
              json = await resp.json().catch(function(){ return {}; });
              if (resp.ok && json.success !== false) break;
              // 5xx/JSON-fail → молчаливый retry
            } catch (_err) { /* timeout/network → молчаливый retry */ }
            _attempt++;
            if (_attempt >= 6) break; // ~3 мин — потом сдаёмся, но без error text
            var backoff = Math.min(30000, 2000 * Math.pow(1.7, _attempt));
            await new Promise(function(r){ setTimeout(r, backoff); });
          }
          if (!resp || !resp.ok || !json.success) {
            // Все попытки исчерпаны при online — оставляем спиннер, тихо логируем.
            // Никакого пугающего "Ошибка соединения" — пользователь сам перезагрузит.
            console.warn('[Diary] access exhausted retries (online)');
            return;
          }
          if (!json.is_configured) {
            // Дневник ещё не настроен. Эталон не разводит настройку и рабочий экран:
            // темы и время доставки живут на самом экране дневника. Поэтому показываем
            // тот же экран без карточки дня и ленты, с кнопкой включения.
            if (onboarding) onboarding.style.display = 'none';
            if (content) content.style.display = 'block';
            _diarySetupMode(true);
            renderDiaryThemes([]);
            renderDiaryPick('08:00');
            return;
          }
          _diarySetupMode(false);
          if (!json.has_access && json.source !== 'no_access') {
            if (content) content.style.display = 'none';
            if (paywall) { paywall.style.display = 'flex'; paywall.style.flexDirection = 'column';
              try { var _pwNm=(window._cachedProfile&&window._cachedProfile.name)?(', '+window._cachedProfile.name):''; var _pwB=document.getElementById('diaryPwMsgBody'); var _pwT=(typeof t==='function')?t('diaryPwMsgBody'):''; if(_pwB&&_pwT) _pwB.innerHTML=_renderMarkdownInline(_pwT.replace('{name}',_pwNm)); } catch(_){} }
            return;
          }
          // Настройки
          if (settingsBtn) settingsBtn.style.display = 'block';
          var enabledEl = document.getElementById('scDiaryEnabledToggle');
          var timeEl = document.getElementById('scDiarySettingsTime');
          if (enabledEl) enabledEl.checked = true;
          if (timeEl) timeEl.value = json.delivery_time || '08:00';
          renderDiarySettingsTopics(json.focus_topics || []);
          // те же данные — на самом экране дневника (эталон: темы и доставка видны сразу)
          renderDiaryThemes(json.focus_topics || []);
          renderDiaryPick(json.delivery_time || '08:00');

          try {
            var todayResp = await fetchWithTimeout(apiBase + '/api/daily-oracle/today', { headers: sendH }, DIARY_FETCH_TIMEOUT);
            var todayJson = await todayResp.json().catch(function(){ return {}; });
            if (todayJson.success && todayJson.message) {
              renderDiaryTodayCard(todayJson.message);
            } else {
              renderDiaryWaitingCard(json.delivery_time || '08:00');
            }
          } catch(e) { renderDiaryWaitingCard(json.delivery_time || '08:00'); }

          if (feedList) feedList.innerHTML = '';
          await loadDiaryFeed(true);
          // Batch 10.17 (отчёт 7272960): если в фиде есть исторические разборы — скрываем «Твой первый разбор».
          if (waiting) waiting.style.display = 'none';
        } catch (e) {
          console.warn('[Diary] init unexpected error (silent):', e);
          // Закон №37: НЕ показываем ошибку. Если online — пусть остаётся спиннер.
          // Если offline — overlay уже показан через _ensureOnline.
          window._ensureOnline();
        }
      }
      window.initDiaryPane = initDiaryPane;

      // Промо Дневника Оракула убрано с главной (31.03.2026)

      async function initSoulChatPage() {
      // Натив (22.09.2026): цены из App Store подставляются заново при каждом входе на экран —
      // обёртка над applyTranslations/loadRubPrices не срабатывала, и подписки оставались без цены.
      try { if (typeof _nativeApplyPrices === 'function') { setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 0); setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 800); } } catch (_) {}
        // Phase 1.1 analytics: Soul Chat funnel — открытие страницы (вход в воронку).
        if (window._ysTrack) { try { window._ysTrack('soul_chat_opened'); } catch(_) {} }
        // VK-юзер: разрешение писать в ВК (доставка дневника/разборов через сообщения сообщества).
        // Дневник живёт тут — это правильный момент спросить. Раз за сессию, чтобы не спамить
        // тех, кто отклонил. Если уже разрешил — нативный диалог не покажется.
        if (window._isVkMiniApp && window.vkBridge && !window._vkMsgConsentAsked) {
          window._vkMsgConsentAsked = true;
          try { vkBridge.send('VKWebAppAllowMessagesFromGroup', { group_id: 237303283 }).then(function(r){ if (window._vkSaveNotifyConsent) window._vkSaveNotifyConsent(r); }).catch(function(){}); } catch(_) {}
        }
        // VK Testers 7276860 (Maria Lykosova MacOS EN UI): «разделитель ИЛИ
        // между Выбрать тариф и Доступ на 24 часа на русском при EN UI».
        // Root cause: applyTranslations при первой загрузке мог пропустить
        // data-i18n элементы внутри Soul Chat promo (если что-то в timing
        // выполнялось до init). Re-apply при открытии страницы покрывает
        // все edge cases.
        try { if (typeof applyTranslations === 'function') applyTranslations(); } catch(_) {}
        var pageEl      = document.getElementById('soulChatPage');
        var scHeader    = document.getElementById('scHeader');
        var scChatHdr   = document.getElementById('scChatHeader');
        var promoArea   = document.getElementById('scPromoArea');
        var chatEl      = document.getElementById('scPageChat');
        var inputArea   = document.getElementById('scInputArea');
        var loadEl      = document.getElementById('scPageLoading');
        var globalLoad  = document.getElementById('scGlobalLoading');
        var giftWrap    = document.getElementById('scPageGiftWrap');
        var buyDayWrap  = document.getElementById('scPageBuyDayWrap');
        var errorWrap   = document.getElementById('scPromoErrorWrap');
        var retryBtn    = document.getElementById('scPromoRetryBtn');

        // Каждое открытие страницы = новый чат: очищаем DOM-историю и сбрасываем флаг,
        // чтобы кнопка «История переписок» могла грузить заново.
        window._scHistoryLoaded = false;
        var _scHistElInit = document.getElementById('scPageHistory');
        if (_scHistElInit) _scHistElInit.innerHTML = '';

        // Начинаем с loading — табы видны, под ними спиннер. Без мелькания promo.
        if (pageEl) { pageEl.dataset.state = 'loading'; }
        // scHeader видимость даёт CSS [data-state="loading"] #scHeader{display:flex} — inline убран (B3, мерцание)
        if (globalLoad) { globalLoad.style.display = 'flex'; globalLoad.querySelector('#scGlobalLoadingText').textContent = ''; }
        // Batch 10.1 (отчёт 7266400 MacOS): при повторном открытии Оракула
        // подсветка вкладки оставалась с прошлого визита (Дневник/Разборы),
        // а контент сбрасывался на Чат — получался рассинхрон между
        // активной вкладкой и видимым контентом. Сбрасываем is-active на
        // вкладку «Чат» в начале init, чтобы кнопки и контент совпадали.
        try {
          var _scTabs = document.querySelectorAll('#scOracleTabs .sc-oracle-tab');
          _scTabs.forEach(function(t) {
            t.classList.toggle('is-active', t.getAttribute('data-tab') === 'chat');
          });
          if (pageEl) pageEl._prevState = null;
        } catch (_) {}

        // Превью оплаченного Soul Chat: ?preview=1&page=soulChatPage&sc_preview_chat=1 — показываем интерфейс чата без API
        var _search = typeof location !== 'undefined' && location.search ? location.search : '';
        if (window._previewMode && _search.indexOf('sc_preview_chat=1') !== -1) {
          if (pageEl) pageEl.dataset.state = 'chat';
          if (loadEl) loadEl.style.display = 'none';
          if (scHeader) scHeader.style.setProperty('display', 'flex', 'important');
          if (scChatHdr) scChatHdr.style.display = 'flex';
          if (promoArea) promoArea.style.display = 'none';
          if (chatEl) chatEl.style.display = 'flex';
          if (inputArea) inputArea.style.display = '';
          return;
        }

        function hideGlobalLoading() {
          if (globalLoad) globalLoad.style.display = 'none';
          if (loadEl) loadEl.style.display = 'none';
        }

        // Защита от зависания (закон №36/37): не ждём access 60с (вечная загрузка + липнет
        // промо-стат-экран при медленном/мёртвом API). Через 8с принудительно открываем ЧАТ
        // (intro+qa = value-first закон №13). access-проверка дотягивается в фоне (таймер/счётчик).
        var accessTimeout = setTimeout(function() {
          var stillChecking = (globalLoad && globalLoad.style.display !== 'none');
          if (stillChecking) {
            showPromo(true);
          }
        }, 8000);

        // Переключение между промо-режимом и чат-режимом (ЗАКОН №15: CSS по data-state, JS только state)
        // Batch 10.30 (отчёты 7257380 MacOS, 7257214 Android): при переходе на
        // Оракул сначала пустой блок наверху + потом автоскрол текста вверх
        // (контент сначала ниже, потом «прыгает» вверх). Корень: scrollTop у
        // promoArea/chatEl был не 0 при переключении state. Helper scrollOracleToTop
        // ставит scrollTop=0 на видимом контейнере после смены data-state.
        function scrollOracleToTop() {
          try {
            var pa = document.getElementById('scPromoArea');
            var pc = document.getElementById('scPageChat');
            var dp = document.getElementById('scDiaryPane');
            var pp = document.getElementById('scPrismPane');
            if (pa) pa.scrollTop = 0;
            if (pc) pc.scrollTop = 0;
            if (dp) dp.scrollTop = 0;
            if (pp) pp.scrollTop = 0;
            // Также сбрасываем scroll у app-frame на случай если viewport имеет свой скролл
            var pageEl = document.getElementById('soulChatPage');
            if (pageEl) pageEl.scrollTop = 0;
          } catch (_) {}
        }
        function showPromo(isLoadError) {
          // ЗАКОН (Алла 13.06): чат-Оракул открыт ВСЕМ — вход ВСЕГДА в чат, без промо-экрана
          // (описание / «78% снижение тревоги» / paywall). Везде, не только в VK. Промо-разметка
          // остаётся в DOM (может пригодиться), но как «ворота» не показывается. Платный гейт —
          // на отправке вопроса (бэкенд 402 → подсказка про Искру), а не на входе.
          if (typeof showChat === 'function') { try { return showChat(); } catch (_) {} }
          if (accessTimeout) { clearTimeout(accessTimeout); accessTimeout = null; }
          hideGlobalLoading();
          // Алла 19.06: «этой страницы вообще не должно быть». Даже в fallback (showChat бросил)
          // НЕ показываем промо-стат-экран — ставим 'chat' (intro+qa = value-first закон №13);
          // промо-DOM #scPromoArea скрыт в chat-состоянии, paywall-блоки внутри него не видны.
          if (pageEl) { pageEl.dataset.state = 'chat'; pageEl.removeAttribute('data-sc-checking'); }
          // Phase 1.1: Soul Chat paywall view (user видит экран с предложением купить).
          if (window._ysTrack && !isLoadError) { try { window._ysTrack('soul_chat_paywall_seen'); } catch(_) {} }
          // CSS-правила по data-state сами разруливают видимость зон.
          // Чистим любые inline display, которые могли остаться от предыдущих
          // переключений (иначе inline !important перекрывает CSS !important и
          // получается «split screen» — одновременно видны promo + chat).
          // VK Testers ID 7257213 (Lykosova: MacOS + Samsung S10+/A14): помимо
          // chat/promo зон ОБЯЗАТЕЛЬНО чистим diaryPane и prismPane — иначе
          // после возврата на оракул из Diary видны одновременно promo+diary.
          if (scHeader)   scHeader.style.removeProperty('display');
          if (scChatHdr)  scChatHdr.style.removeProperty('display');
          if (promoArea)  promoArea.style.removeProperty('display');
          if (chatEl)     chatEl.style.removeProperty('display');
          if (inputArea)  inputArea.style.removeProperty('display');
          var _diaryPane = document.getElementById('scDiaryPane');
          var _prismPane = document.getElementById('scPrismPane');
          if (_diaryPane) _diaryPane.style.removeProperty('display');
          if (_prismPane) _prismPane.style.removeProperty('display');
          // Batch 10.13 (отчёт 7272155 MacOS): для master-тарифа paywall-блок
          // «Получите пакет или купите доступ на сутки» НЕ должен
          // показываться даже при сбое access-API. У юзера уже есть подписка.
          var _userHasMasterSub = (typeof userTariff !== 'undefined') && userTariff === 'master';
          var _showErrorWrap = isLoadError && !window._scAccessGranted && !_userHasMasterSub;
          if (errorWrap)  errorWrap.style.display   = (_showErrorWrap ? '' : 'none');
          // Подписчик: показать "Перейти в чат", скрыть тарифы и ошибки
          var enterBtn = document.getElementById('scEnterChatBtn');
          var promoBlock = document.getElementById('scPagePromo');
          if (window._scAccessGranted) {
            if (enterBtn) enterBtn.style.display = 'block';
            if (promoBlock) promoBlock.style.display = 'none';
            if (errorWrap) errorWrap.style.display = 'none';
          } else {
            if (enterBtn) enterBtn.style.display = 'none';
            if (promoBlock) {
              promoBlock.style.display = '';
              // VK Testers 7276860 (MacOS): связующий текст «или» в EN/DE/FR оставался
              // на русском. applyTranslations при init мог пропустить scPagePromo (lazy
              // DOM / display:none). Принудительно перевожу `[data-i18n]` элементы
              // внутри блока при показе.
              try {
                promoBlock.querySelectorAll('[data-i18n]').forEach(function(el) {
                  var key = el.getAttribute('data-i18n');
                  if (typeof t === 'function') {
                    var v = t(key);
                    if (v && v !== key) el.textContent = v;
                  }
                });
              } catch(_) {}
            }
          }
          // Batch 10.30 (7257380, 7257214): сброс scroll в начало промо-области
          // — иначе после первой загрузки контент «прыгает» / автоскролит вверх.
          // Two rAF — даём CSS применить data-state changes и реальные размеры.
          requestAnimationFrame(function(){ requestAnimationFrame(scrollOracleToTop); });
        }
        function showChat() {
          if (accessTimeout) { clearTimeout(accessTimeout); accessTimeout = null; }
          hideGlobalLoading();
          if (pageEl) { pageEl.dataset.state = 'chat'; pageEl.removeAttribute('data-sc-checking'); }
          // Всё управляется CSS-правилами по data-state. Чистим inline display
          // у всех зон — без этого липкий `display: block !important` от showPromo
          // не даст CSS скрыть промо в chat-режиме (см. showPromo). Также чистим
          // diaryPane/prismPane (VK Testers ID 7257213).
          if (scHeader)   scHeader.style.removeProperty('display');
          if (scChatHdr)  scChatHdr.style.removeProperty('display');
          if (promoArea)  promoArea.style.removeProperty('display');
          if (chatEl)     chatEl.style.removeProperty('display');
          if (inputArea)  inputArea.style.removeProperty('display');
          var _dP = document.getElementById('scDiaryPane');
          var _pP = document.getElementById('scPrismPane');
          if (_dP) _dP.style.removeProperty('display');
          if (_pP) _pP.style.removeProperty('display');
          // VK Testers 7267740 ПЕРЕОТКРЫТ (17.05): «Некорректное отображение
          // экрана чата с оракулом при открытии через вкладку чат».
          // showChat вызывается из 2 entry-points: switchOracleTab (имеет 2xrAF)
          // и goToPage('soulChatPage') + initSoulChatPage (НЕ имеет). На втором
          // пути input-area был display:none при ResizeObserver init → высота
          // 0 → пустое пространство сверху + неправильный scroll. Добавляем тот
          // же double-rAF для observer + scroll.
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              try { if (typeof window._scInitInputHeightObserver === 'function') window._scInitInputHeightObserver(); } catch (_) {}
              try { if (typeof window.scrollChatToBottom === 'function') window.scrollChatToBottom(); } catch (_) {}
              try { if (typeof window._maybeOracleTabsTour === 'function') window._maybeOracleTabsTour(); } catch (_) {}
            });
          });
        }
        window.showChat = showChat;

        // Loading state: табы видны, контент скрыт, только спиннер. Без мелькания promo.
        if (scHeader)   scHeader.style.setProperty('display', 'flex', 'important');
        if (promoArea)  promoArea.style.display   = 'none';
        if (loadEl)     loadEl.style.display      = 'none';
        if (chatEl)     chatEl.style.display      = 'none';
        if (inputArea)  inputArea.style.display    = 'none';
        if (scChatHdr)  scChatHdr.style.display   = 'none';
        if (globalLoad) { globalLoad.style.display = 'flex'; globalLoad.style.flex = '1'; globalLoad.style.alignItems = 'center'; globalLoad.style.justifyContent = 'center'; }
        if (giftWrap)   giftWrap.style.display    = 'none';
        if (buyDayWrap) buyDayWrap.style.display   = 'none';
        if (errorWrap)  errorWrap.style.display    = 'none';

        try {
          var apiBase  = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var initData = typeof getInitData === 'function' ? getInitData() : '';
          if (!apiBase || !hasAuth()) {
            showPromo(true);
            return;
          }
          var scAuthH = getAuthHeaders();

          // Запрос с автоматическим повтором: при сбое (таймаут, холодный старт) — один раз ждём и повторяем тихо
          var resp = null; var json = {};
          var SC_FETCH_TIMEOUT = 25000; // 25 сек — с запасом на холодный старт Render
          for (var _scAttempt = 0; _scAttempt < 2; _scAttempt++) {
            try {
              resp = await fetchWithTimeout(apiBase + '/api/soul-chat/access', {
                method: 'GET',
                headers: scAuthH
              }, SC_FETCH_TIMEOUT);
              json = await resp.json().catch(function(){ return {}; });
              break; // успех — выходим из цикла
            } catch (_scErr) {
              if (_scAttempt === 0) {
                // Первая попытка упала (таймаут/сеть) — ждём 3 сек и повторяем без показа ошибки
                await new Promise(function(r) { setTimeout(r, 3000); });
              } else {
                // Вторая попытка тоже упала — показываем ошибку
                throw _scErr;
              }
            }
          }

          // При любой ошибке HTTP (401, 403, 5xx) — показываем окно с состоянием подписки и сообщением об ошибке
          if (!resp || !resp.ok) {
            var errTextEl = document.getElementById('scPromoErrorText');
            if (errTextEl && json && json.reason) errTextEl.textContent = json.reason;
            showPromo(true);
            return;
          }

          // Приоритет явно перенесённой пары синастрии (экран совместимости →
          // «Спросить Оракула о связи»): её НЕЛЬЗЯ затирать дефолтом last_request_id,
          // иначе выбранный человек подменяется последней песней владельца и Оракул
          // «путает участников» (Закон №20). Обычный вход = одиночный контекст:
          // сбрасываем залипшую пару, чтобы прошлый request_id_2 не утёк в новый вопрос.
          var _scPend = window._scPendingPair;
          if (_scPend && _scPend.a && _scPend.b) {
            window._scPendingPair   = null; // one-shot
            window._scLastRequestId = _scPend.a;
            window._scRequestId2    = _scPend.b;
            window._scPickerMode    = 'synastry';
            window._scPickerSelA    = (_scPend.a !== 'self') ? _scPend.a : (_scPend.b !== 'self' ? _scPend.b : null);
            try { if (typeof scUpdateCtxPlank === 'function') scUpdateCtxPlank(); } catch(_) {}
          } else {
            window._scLastRequestId = (json && json.last_request_id) || null;
            window._scRequestId2    = null;
            window._scPickerMode    = 'single';
            window._scPickerSelA    = null;
          }
          window._scHasProfile   = !!(json && json.has_profile);
          window._scIsMaster     = !!(json && json.is_master);

          if (json && (json.allowed === true || json.oracle_free_left != null || json.oracle_unlimited)) {
            // Soul Chat 24h таймер: показываем оставшееся время для временного доступа
            if (json.expires_at && (json.source === 'purchase_1day' || json.source === 'gift_1day' || json.source === 'iskry')) {
              var _scExpiry = new Date(json.expires_at);
              var _scNow = new Date();
              var _scMsLeft = _scExpiry - _scNow;
              if (_scMsLeft > 0) {
                var _scHoursLeft = Math.floor(_scMsLeft / (1000 * 60 * 60));
                var _scMinsLeft = Math.floor((_scMsLeft % (1000 * 60 * 60)) / (1000 * 60));
                var _tl4 = function(k, fb) { return typeof t === 'function' ? (t(k) || fb) : fb; };
                var _scTimerText = _tl4('soulChatExpiresIn', 'Доступ: ещё {hours}ч {minutes}мин').replace('{hours}', _scHoursLeft).replace('{minutes}', _scMinsLeft);
                var _scTimerEl = document.getElementById('scAccessTimer');
                if (!_scTimerEl) {
                  _scTimerEl = document.createElement('div');
                  _scTimerEl.id = 'scAccessTimer';
                  _scTimerEl.style.cssText = 'text-align:center;font-size:0.72rem;padding:4px 12px;margin:4px auto 0;border-radius:12px;max-width:260px;';
                  var chatHeader = document.querySelector('#soulChatPage .sc-page-hero') || document.querySelector('#soulChatPage header');
                  if (chatHeader && chatHeader.parentNode) chatHeader.parentNode.insertBefore(_scTimerEl, chatHeader.nextSibling);
                }
                var _scIsUrgent = _scHoursLeft < 2;
                _scTimerEl.style.background = _scIsUrgent ? 'rgba(245,158,11,0.15)' : 'rgba(var(--primary-rgb),0.1)';
                _scTimerEl.style.color = _scIsUrgent ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.6)';
                _scTimerEl.textContent = _scTimerText;
                _scTimerEl.style.display = 'block';
              }
            } else {
              var _scTimerEl2 = document.getElementById('scAccessTimer');
              if (_scTimerEl2) _scTimerEl2.style.display = 'none';
            }
            var hadReturnFlag = false;
            try {
              var ts = sessionStorage.getItem('soul_chat_return_from_payment');
              if (ts && (Date.now() - parseInt(ts, 10)) < 5 * 60 * 1000) { hadReturnFlag = true; sessionStorage.removeItem('soul_chat_return_from_payment'); }
            } catch(_) {}
            if (hadReturnFlag && typeof showToast === 'function') showToast(typeof t === 'function' ? t('scToastPaymentReceived') : 'Оплата получена, доступ открыт');
            // ЗАКОН (Алла 13.06): простой чат в стиле дипсика — открываем СРАЗУ в чат
            // (greeting + поле ввода), без промо-страницы со статистикой. Статистика
            // (scPagePromo) больше не первый экран; data-state=chat прячет её через CSS.
            window._scAccessGranted = true;
            showChat();
            // ЗАКОН (Алла 13.06): счётчик пробных вопросов / Искр для чата (подписчик → скрыт)
            window._scOracleUnlimited = !!(json && json.oracle_unlimited);
            window._scOracleFreeLeft = (json && json.oracle_free_left != null) ? Number(json.oracle_free_left) : null;
            window._scOracleBalance = (json && json.oracle_balance != null) ? Number(json.oracle_balance) : null;
            if (typeof scRenderOracleCounter === 'function') scRenderOracleCounter();
            // Если нет данных — показываем блок-подсказку, скрываем поле ввода
            var noReqEl  = document.getElementById('scPageNoRequest');
            var hasData  = window._scLastRequestId || window._scHasProfile;
            if (!hasData) {
              if (noReqEl)   noReqEl.style.display   = '';
              if (inputArea) inputArea.style.display  = 'none';
            } else {
              if (noReqEl)   noReqEl.style.display   = 'none';
            }
            // Контекст карточек — только для Master
            var pillsWrap = document.getElementById('scContextPills');
            if (window._scIsMaster) {
              if (pillsWrap) pillsWrap.style.display = 'flex';
              scLoadUserCards(apiBase, initData);
            } else {
              if (pillsWrap) pillsWrap.style.display = 'none';
              // Тизер синастрии для Basic/Plus
              var teaserEl = document.getElementById('scSynastryTeaser');
              if (teaserEl) teaserEl.style.display = '';
            }
            // Обновляем заголовок кнопки карточки
            scUpdateCardPickerLabel();
            // Таймер доступа
            var timerEl = document.getElementById('scPageTimer');
            if (timerEl && json.expires_at) {
              timerEl.style.display = 'inline-block';
              var exp = new Date(json.expires_at);
              var updateTimer = function() {
                var diff = Math.max(0, exp - Date.now());
                var h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000);
                timerEl.textContent = t('scAccessRemaining').replace('{h}', h).replace('{m}', m);
                if (diff > 0) setTimeout(updateTimer, 60000);
              };
              updateTimer();
            }
            // Сохраняем для кнопки «История переписок»
            window._scApiBase  = apiBase;
            window._scInitData = initData;
            // Показываем greeting (история — только по кнопке, не автоматически)
            var _histEl = document.getElementById('scPageHistory');
            if (_histEl && !_histEl.querySelector('.sc-msg-user,.sc-msg-soul')) {
              scRenderHistory(_histEl, []);
            }
            scrollChatToBottom();
          } else {
            // Нет доступа — показываем промо (шапка + зона с тарифами/подарком), убираем загрузку (не ошибка)
            showPromo(false);
            // ЗАКОН №13: если пользователю доступен бесплатный триал — НЕ показываем
            // блок тарифов первым экраном. Пользователь сначала видит ценность (описание,
            // статистика, примеры), потом предложение попробовать 24ч бесплатно.
            // Тарифы остаются скрытыми — они предлагаются только если триал уже использован.
            var promoBlockEl = document.getElementById('scPagePromo');
            if (json && json.trial_available) {
              if (giftWrap)   giftWrap.style.display   = '';
              if (buyDayWrap) buyDayWrap.style.display  = 'none';
              // Тарифы скрыты — пусть пользователь пользуется пробным периодом
              if (promoBlockEl) promoBlockEl.style.display = 'none';
            } else {
              // Триал уже использован — предлагаем тарифы или разовую покупку
              if (giftWrap)   giftWrap.style.display   = 'none';
              if (buyDayWrap) buyDayWrap.style.display  = '';
              if (promoBlockEl) promoBlockEl.style.display = '';
              var scBuyBtn = document.getElementById('scPageBuyDayBtn');
              var _scBuyVk = window._isVkMiniApp === true || window._appEnv === 'vk';
              if (scBuyBtn && ((typeof getIskryBalance === 'function' && getIskryBalance() >= 30) || _scBuyVk)) {
                // VK: день Оракула = ТОЛЬКО 30 Искр (эталон 08.07 Таблица В) — текст «199 ₽» запрещён.
                scBuyBtn.textContent = t('scOpenFor30');
              } else if (scBuyBtn) {
                scBuyBtn.textContent = typeof t === 'function' ? (t('scBuyDayBtnText') || 'Открыть Чат с Оракулом на 24ч') : 'Открыть Чат с Оракулом на 24ч';
              }
            }
          }
        } catch(e) {
          // Ошибка (сеть, getInitData, разбор ответа) — показываем промо с сообщением об ошибке
          showPromo(true);
        }
      }

      (function bindScPromoRetry() {
        var btn = document.getElementById('scPromoRetryBtn');
        if (btn) btn.addEventListener('click', function() { initSoulChatPage(); });
      })();

      // Загрузка и отображение истории диалогов Soul Chat
      window._scHistoryLoaded = false;
      window.scLoadHistory = function(apiBase, initData) { return scLoadHistory(apiBase, initData); };
      async function scLoadHistory(apiBase, initData) {
        if (window._scHistoryLoaded) return; // Уже загружали в этой сессии
        var historyEl = document.getElementById('scPageHistory');
        if (!historyEl) return;

        // База API считается здесь, а не приходит параметром (фикс 04.09.2026).
        // Кнопка «Перейти в чат» и переход из промо звали scLoadHistory() без
        // аргументов → apiBase был undefined → запрос уходил на "undefined/api/..."
        // → история молча не грузилась. Параметр остаётся ради старых вызовов.
        if (!apiBase) apiBase = window._scApiBase || (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!initData) initData = window._scInitData || (typeof getInitData === 'function' ? getInitData() : '');

        // Мгновенно показываем кэш из localStorage (флаг НЕ ставим — ждём сервер)
        var cacheKey = 'scHistory_' + (window._tgUserId || 'anon') + '_' + (window._scThreadId || 'cur');
        var shownFromCache = false;
        try {
          var cached = localStorage.getItem(cacheKey);
          if (cached) {
            var cachedMsgs = JSON.parse(cached);
            if (Array.isArray(cachedMsgs) && cachedMsgs.length > 0) {
              scRenderHistory(historyEl, cachedMsgs);
              shownFromCache = true;
            }
          }
        } catch(e) {}

        // Запрашиваем актуальную историю с сервера — флаг ставим только при успехе.
        // VK Testers 7263686 (Android, cross-device chat sync): раньше передавали
        // только X-Telegram-Init — для VK Mini App юзеров это initData iframe-а,
        // но backend `validateInitData` отвергает его (не TG-подписанный) → не
        // резолвит user_id → 401 → silent fail → device2 видит пустой чат.
        // Та же ошибка была в heroesApi (Batch 9.33, 7263802). Фикс: используем
        // getAuthHeaders() который шлёт Bearer JWT (VK/Google) + initData (TG)
        // одновременно — backend подхватывает любой работающий способ identity.
        try {
          var historyHeaders = (typeof getAuthHeaders === 'function')
            ? getAuthHeaders()
            : { 'X-Telegram-Init': initData };
          // Гарантируем что initData всё-таки попадёт даже если getAuthHeaders его не положил
          if (!historyHeaders['X-Telegram-Init'] && initData) historyHeaders['X-Telegram-Init'] = initData;
          var _thr = window._scThreadId || (window._scLegacyThread ? 'legacy' : '');
          var r = await fetchWithTimeout(apiBase + '/api/soul-chat/history' + (_thr ? ('?thread_id=' + encodeURIComponent(_thr)) : ''), {
            headers: historyHeaders
          }, 15000);
          var d = await r.json().catch(function(){ return {}; });
          if (d.success && Array.isArray(d.messages)) {
            // Перерисовываем только если с сервера пришло больше сообщений
            if (d.messages.length > 0) {
              scRenderHistory(historyEl, d.messages);
            }
            window._scHistoryLoaded = true;
            try { localStorage.setItem(cacheKey, JSON.stringify(d.messages.slice(-50))); } catch(e) { /* localStorage quota */ }
          } else if (!shownFromCache) {
            window._scHistoryLoaded = false;
            if (r && r.status === 401) {
              console.warn('[SoulChat] history 401 — auth headers may be missing on this device. headers sent:', Object.keys(historyHeaders).join(','));
            }
          }
        } catch(e) {
          console.warn('[SoulChat] history fetch error:', e && e.message);
          window._scHistoryLoaded = false;
        }

        scrollChatToBottom();
      }

      // ── Беседы: список, переключение, новый разговор ───────────────────────
      // Ленты разных разговоров не смешиваются: у каждого свой id, и сервер
      // отдаёт только те, что принадлежат этому человеку.
      window._scThreadId = window._scThreadId || (function () {
        try { return localStorage.getItem('scThreadId_' + (window._tgUserId || 'anon')) || ''; } catch (_) { return ''; }
      })();

      function _scThreadsApi() { return (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, ''); }

      // ── История разговоров: окно #scHistView по эталону showcase-history.html ──
      // Беседы по времени, поиск, «Продолжить разговор». Показываем только то, что хранит
      // сервер: первый и последний вопрос, число вопросов, время. Тем с иконками и Искр
      // по беседе в базе нет — их не рисуем (решение Аллы 11.09). «Новый разговор» и
      // удаление эталон не показывает, но функции живые: «+» в шапке, удаление — долгим
      // нажатием на беседу, как в списке чатов Telegram.
      var _histThreads = null;   // null — ещё не загружали; [] — бесед нет
      var _histDisabled = false; // в базе нет колонки thread_id: окно не нужно, грузим одну ленту
      var _histBound = false;
      var HIST_ICON = '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".45"/></g><path d="M12 4.6c0 4.1-3.3 7.4-7.4 7.4 4.1 0 7.4 3.3 7.4 7.4 0-4.1 3.3-7.4 7.4-7.4-4.1 0-7.4-3.3-7.4-7.4Z" fill="currentColor"/>';
      var HIST_MSG = '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 11.4c0 4-3.8 7.2-8.6 7.2-1 0-2-.1-2.9-.4l-5.1 2.6 1.5-4.3c-1.3-1.4-2.1-3.2-2.1-5.1 0-4 3.8-7.4 8.6-7.4s8.6 3.4 8.6 7.4Z"/></g></svg>';

      function _histT(key, fb) {
        var v = (typeof t === 'function') ? t(key) : '';
        return (v && v !== key) ? v : fb;
      }
      function _histLang() {
        return (typeof window._currentLang === 'string' && window._currentLang) || 'ru';
      }
      // Формы числа из строки перевода: «{n} разговор|{n} разговора|{n} разговоров».
      function _histPlural(key, n, fb) {
        var forms = String(_histT(key, fb)).split('|');
        var cat = 'other';
        try { cat = new Intl.PluralRules(_histLang()).select(n); } catch (_) {}
        var i = forms.length > 2 ? (cat === 'one' ? 0 : cat === 'few' ? 1 : 2) : (cat === 'one' ? 0 : 1);
        return String(forms[Math.min(i, forms.length - 1)]).replace('{n}', String(n));
      }
      function _histDayStarts() {
        var now = new Date();
        return {
          today: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
          week: new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime()
        };
      }
      // Сегодня — «2 ч назад», на этой неделе — день недели, раньше — число и месяц.
      function _histWhen(iso, long) {
        var at = new Date(iso).getTime();
        if (!isFinite(at)) return '';
        var lang = _histLang(), s = _histDayStarts();
        try {
          if (at >= s.today) {
            var rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: long ? 'long' : 'short' });
            var mins = Math.max(0, Math.round((Date.now() - at) / 60000));
            return mins < 60 ? rtf.format(-mins, 'minute') : rtf.format(-Math.round(mins / 60), 'hour');
          }
          var d = new Date(at);
          if (at >= s.week) return d.toLocaleDateString(lang, { weekday: 'long' });
          var o = { day: 'numeric', month: 'long' };
          if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
          return d.toLocaleDateString(lang, o);
        } catch (_) { return ''; }
      }
      // У ранних бесед (до 04.09) вопросы разных разговоров лежат вместе — их первый вопрос
      // ничего не называет, поэтому подпись общая.
      function _histTitle(th) {
        return (!th.legacy && th.title) ? th.title : _histT('scThreadLegacy', 'Ранние разговоры');
      }
      function _histIsOpen(th) {
        return th.legacy ? window._scLegacyThread === true : (!!th.id && th.id === window._scThreadId);
      }

      function _histRender(q) {
        var list = document.getElementById('histList');
        if (!list || !_histThreads) return false;
        var s = _histDayStarts();
        var groups = [[], [], []];
        _histThreads.forEach(function (th) {
          var title = _histTitle(th);
          var last = (th.last_question && th.last_question !== th.title) ? th.last_question : '';
          if (q && (title + ' ' + last).toLowerCase().indexOf(q) < 0) return;
          var at = new Date(th.last_at).getTime();
          groups[at >= s.today ? 0 : at >= s.week ? 1 : 2].push({ th: th, title: title, last: last });
        });
        var names = [_histT('histToday', 'Сегодня'), _histT('histWeek', 'На этой неделе'), _histT('histEarlier', 'Раньше')];
        var quote = String(_histT('histQuote', '«{q}»')).split('{q}');
        var h = '';
        groups.forEach(function (rows, gi) {
          if (!rows.length) return;
          h += '<div class="day">' + _escHtml(names[gi]) + '</div>';
          rows.forEach(function (x) {
            var open = _histIsOpen(x.th);
            var txt = _escHtml(x.last);
            if (q && x.last) {
              var i = x.last.toLowerCase().indexOf(q);
              if (i >= 0) txt = _escHtml(x.last.slice(0, i)) + '<em>' + _escHtml(x.last.slice(i, i + q.length)) + '</em>' + _escHtml(x.last.slice(i + q.length));
            }
            h += '<button type="button" class="th' + (open ? ' open' : '') + '" data-id="' + _escHtml(x.th.id || '') + '"' + (x.th.legacy ? ' data-legacy="1"' : '') + '>' +
              '<span class="th-ic"><svg viewBox="0 0 24 24" class="gi">' + HIST_ICON + '</svg></span>' +
              '<span class="th-b">' +
                '<span class="th-top"><b>' + _escHtml(x.title) + '</b><span class="th-when">' + _escHtml(_histWhen(x.th.last_at)) + '</span></span>' +
                (x.last ? '<span class="th-q">' + _escHtml(quote[0] || '') + txt + _escHtml(quote[1] || '') + '</span>' : '') +
                '<span class="th-meta">' +
                  (open ? '<span class="th-chip live">' + _escHtml(_histT('histLive', 'сейчас открыт')) + '</span>' : '') +
                  '<span class="th-chip">' + HIST_MSG + (x.th.count || 0) + '</span>' +
                '</span>' +
              '</span></button>';
          });
        });
        list.innerHTML = h;
        return !!h;
      }

      function _histPaint() {
        var hist = document.getElementById('hist');
        if (!hist || !_histThreads) return;
        var foot = hist.querySelector('.foot');
        var count = document.getElementById('histCount');
        var note = document.getElementById('histNote');
        var input = document.getElementById('histSearchInput');
        if (!_histThreads.length) {
          hist.dataset.mode = 'empty';
          hist.classList.remove('nores');
          document.getElementById('histList').innerHTML = '';
          count.textContent = _histT('histCountEmpty', 'пока пусто');
          foot.style.display = 'none';
          return;
        }
        if (hist.dataset.mode === 'empty') hist.dataset.mode = 'list';
        var questions = 0;
        _histThreads.forEach(function (th) { questions += th.count || 0; });
        count.textContent = _histPlural('histThreadsN', _histThreads.length, '{n} разговор|{n} разговора|{n} разговоров') +
          ' · ' + _histPlural('histQuestionsN', questions, '{n} вопрос|{n} вопроса|{n} вопросов');
        var last = _histThreads[0];
        var lastTitle = _histTitle(last);
        // Подпись под кнопкой — одной строкой, как в эталоне: длинный вопрос режем по слову.
        if (lastTitle.length > 28) lastTitle = lastTitle.slice(0, 27).replace(/\s+\S*$/, '').replace(/[\s,.;:!?—–-]+$/, '') + '…';
        note.textContent = String(_histT('histLastNote', 'Последний — «{title}», {when}'))
          .replace('{title}', function () { return lastTitle; })
          .replace('{when}', function () { return _histWhen(last.last_at, true); });
        foot.style.display = '';
        var found = _histRender(hist.dataset.mode === 'search' ? input.value.trim().toLowerCase() : '');
        hist.classList.toggle('nores', !found);
      }

      function _histClose() {
        var view = document.getElementById('scHistView');
        if (!view || !view.classList.contains('is-open')) return false;
        view.classList.remove('is-open');
        try { document.getElementById('histSearchInput').blur(); } catch (_) {}
        return true;
      }
      window._scHistClose = _histClose;

      async function _histDelete(id) {
        if (!id || typeof window._safeConfirm !== 'function') return;
        var ok = await window._safeConfirm(_histT('histDeleteAsk', 'Удалить разговор? Вернуть его будет нельзя.'));
        if (!ok) return;
        try {
          var dr = await fetchWithTimeout(_scThreadsApi() + '/api/soul-chat/thread/' + encodeURIComponent(id), {
            method: 'DELETE', headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
          }, 20000);
          if (!dr.ok) return;
          _histThreads = (_histThreads || []).filter(function (th) { return th.id !== id; });
          if (id === window._scThreadId) window.scStartNewThread();
          _histPaint();
        } catch (e) { console.warn('[SoulChat] thread delete', e); }
      }

      function _histBind() {
        if (_histBound) return;
        _histBound = true;
        var hist = document.getElementById('hist');
        var list = document.getElementById('histList');
        var input = document.getElementById('histSearchInput');
        document.getElementById('histBack').addEventListener('click', _histClose);
        document.getElementById('histNewBtn').addEventListener('click', function () {
          _histClose();
          window.scStartNewThread();
        });
        document.getElementById('histSearchBtn').addEventListener('click', function () {
          hist.dataset.mode = 'search';
          _histPaint();
          try { input.focus(); } catch (_) {}
        });
        document.getElementById('histSearchCancel').addEventListener('click', function () {
          input.value = '';
          hist.dataset.mode = 'list';
          _histPaint();
        });
        input.addEventListener('input', function () {
          var found = _histRender(this.value.trim().toLowerCase());
          hist.classList.toggle('nores', !found);
        });
        document.getElementById('histContinue').addEventListener('click', function () {
          var last = _histThreads && _histThreads[0];
          _histClose();
          if (!last) return;
          if (_histIsOpen(last)) { if (typeof showChat === 'function') showChat(); return; }
          window.scSwitchThread(last.legacy ? 'legacy' : last.id);
        });

        // Тап — открыть беседу. Долгое нажатие или правый клик — удалить свою беседу.
        var timer = null, sx = 0, sy = 0, held = false;
        function cancelHold() { if (timer) { clearTimeout(timer); timer = null; } }
        list.addEventListener('pointerdown', function (e) {
          held = false;
          var row = e.target.closest('.th');
          if (!row || !row.getAttribute('data-id') || (e.pointerType === 'mouse' && e.button !== 0)) return;
          sx = e.clientX; sy = e.clientY;
          cancelHold();
          timer = setTimeout(function () { timer = null; held = true; _histDelete(row.getAttribute('data-id')); }, 550);
        });
        list.addEventListener('pointermove', function (e) {
          if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancelHold();
        });
        list.addEventListener('pointerup', cancelHold);
        list.addEventListener('pointercancel', cancelHold);
        hist.querySelector('.scroll').addEventListener('scroll', cancelHold, { passive: true });
        list.addEventListener('contextmenu', function (e) {
          var row = e.target.closest('.th');
          if (!row) return;
          e.preventDefault();
          cancelHold();
          if (held || !row.getAttribute('data-id')) return;
          held = true;
          _histDelete(row.getAttribute('data-id'));
        });
        list.addEventListener('click', function (e) {
          var row = e.target.closest('.th');
          if (!row) return;
          if (held) { held = false; return; }
          _histClose();
          window.scSwitchThread(row.getAttribute('data-legacy') ? 'legacy' : row.getAttribute('data-id'));
        });
      }

      window.scOpenThreads = async function scOpenThreads() {
        if (!window._ensureOnline()) return;
        if (_histDisabled) { window._scHistoryLoaded = false; scLoadHistory(); return; }
        var view = document.getElementById('scHistView');
        var hist = document.getElementById('hist');
        if (!view || !hist) return;
        _histBind();
        document.getElementById('histSearchInput').value = '';
        hist.dataset.mode = 'list';
        hist.classList.remove('nores');
        if (_histThreads) {
          _histPaint();
        } else {
          document.getElementById('histList').innerHTML = '';
          document.getElementById('histCount').textContent = '';
          hist.querySelector('.foot').style.display = 'none';
        }
        view.classList.add('is-open');
        hist.querySelector('.scroll').scrollTop = 0;

        // Список всегда свежий. Сбой — тихий повтор, текста ошибки нет (закон №37).
        for (var att = 0; att < 4 && view.classList.contains('is-open'); att++) {
          if (att) await new Promise(function (r) { setTimeout(r, Math.min(20000, 1500 * Math.pow(1.7, att))); });
          try {
            var resp = await fetchWithTimeout(_scThreadsApi() + '/api/soul-chat/threads', {
              headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
            }, 20000);
            var json = await resp.json().catch(function () { return {}; });
            // База ещё без бесед — окно не нужно, открываем одну ленту, как раньше.
            if (json && json.threads_disabled) {
              _histDisabled = true;
              _histClose();
              window._scHistoryLoaded = false;
              scLoadHistory();
              return;
            }
            if (resp.ok && json && json.success) {
              _histThreads = json.threads || [];
              if (view.classList.contains('is-open')) _histPaint();
              return;
            }
          } catch (e) { console.warn('[SoulChat] threads', e); }
        }
      };

      window.scSwitchThread = function scSwitchThread(id) {
        window._scThreadId = (id === 'legacy') ? '' : (id || '');
        try {
          if (window._scThreadId) localStorage.setItem('scThreadId_' + (window._tgUserId || 'anon'), window._scThreadId);
          else localStorage.removeItem('scThreadId_' + (window._tgUserId || 'anon'));
        } catch (_) {}
        window._scLegacyThread = (id === 'legacy');
        window._scHistoryLoaded = false;
        var el = document.getElementById('scPageHistory');
        if (el) el.innerHTML = '';
        if (typeof showChat === 'function') showChat();
        scLoadHistory();
      };

      window.scStartNewThread = function scStartNewThread() {
        window._scThreadId = '';
        window._scLegacyThread = false;
        try { localStorage.removeItem('scThreadId_' + (window._tgUserId || 'anon')); } catch (_) {}
        window._scHistoryLoaded = true; // новый разговор пустой — с сервера тянуть нечего
        var el = document.getElementById('scPageHistory');
        if (el) { el.innerHTML = ''; scRenderHistory(el, []); }
        if (typeof showChat === 'function') showChat();
      };

      function scRenderHistory(historyEl, messages) {
        // Сохраняем узлы текущего диалога (сообщения, написанные в этой сессии), чтобы не затереть их
        var currentNodes = Array.from(historyEl.childNodes).filter(function(n) {
          return n.classList && (n.classList.contains('sc-msg-user') || n.classList.contains('sc-msg-soul'));
        });
        historyEl.innerHTML = '';
        
        if (!messages || messages.length === 0) {
          if (currentNodes.length === 0) {
            // Приветствие БЕЗ контекста = интро-герой #scIntro (мандала+«Оракул»+подзаголовок),
            // как в эталоне showcase-chat.html — отдельного пузыря-greeting НЕТ (Алла 18.06,
            // «добить чат до 1:1»). Раньше тут строился лишний пузырь «Привет 🤍» поверх героя.

            // qa-grid 2x2 — doslovno showcase-chat-v6 (Alla 15.06): 4 kartochki-starta
            var _tq = function(k, fb){ return (typeof t === 'function' ? t(k) : fb) || fb; };
            var QA_CARDS = [
              { t:'scQaKtoyaT', s:'scQaKtoyaS', q:'scQaKtoyaQ', ic:'<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/></svg>' },
              { t:'scQaTrevogaT', s:'scQaTrevogaS', q:'scQaTrevogaQ', ic:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h1a3 3 0 0 1 0 6h-1M6 10H5a3 3 0 0 0 0 6h1M7 10a5 5 0 0 1 10 0v7H7z"/></svg>' },
              { t:'scQaReshenieT', s:'scQaReshenieS', q:'scQaReshenieQ', ic:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><polygon points="15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5" fill="currentColor" stroke="none"/></svg>' },
              { t:'scQaPodderzhkaT', s:'scQaPodderzhkaS', q:'scQaPodderzhkaQ', ic:'<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/></svg>' }
            ];
            // «С чего начнём» — сетка 2×2: цветная иконка, тема, подпись. Алла 11.09 вернула её
            // вместо строк-затравок эталона: «кнопки были квадратными… визуально красивее и
            // разнообразнее». Заголовок — .sec-t эталона. Вопрос целиком подставляется по тапу.
            var qaWrap = document.createElement('div');
            qaWrap.className = 'qa';
            qaWrap.id = 'scQaWrap';
            var qaLabel = document.createElement('div');
            qaLabel.className = 'sec-t';
            var qaLabelB = document.createElement('b');
            qaLabelB.textContent = _tq('scQaLabel', 'С чего начнём');
            qaLabel.appendChild(qaLabelB);
            qaWrap.appendChild(qaLabel);
            var qaGrid = document.createElement('div');
            qaGrid.className = 'qa-grid';
            QA_CARDS.forEach(function(c) {
              var card = document.createElement('button');
              card.type = 'button';
              card.className = 'qa-card';
              var ic = document.createElement('span'); ic.className = 'qa-ic'; ic.innerHTML = c.ic;
              var tt = document.createElement('span'); tt.className = 'qa-t'; tt.textContent = _tq(c.t, '');
              var ss = document.createElement('span'); ss.className = 'qa-s'; ss.textContent = _tq(c.s, '');
              card.appendChild(ic); card.appendChild(tt); card.appendChild(ss);
              card.onclick = function() {
                var ta = document.getElementById('scPageQuestion');
                if (ta) { ta.value = _tq(c.q, ''); ta.focus(); ta.dispatchEvent(new Event('input')); }
              };
              qaGrid.appendChild(card);
            });
            qaWrap.appendChild(qaGrid);
            historyEl.appendChild(qaWrap);
          }
        } else {
          // Метка «начало истории»
          var divider = document.createElement('div');
          divider.style.cssText = 'text-align:center;font-size:0.72rem;color:rgba(255,255,255,0.25);padding:6px 0 10px;';
          divider.textContent = t('scHistoryDivider');
          historyEl.appendChild(divider);
          messages.forEach(function(msg) {
            if (msg.question) {
              // В эталоне сообщение — сам пузырь, обёртки и аватара нет. Классы
              // sc-msg-user / sc-msg-soul переехали на него: на них держатся
              // дедупликация, прокрутка и определение «диалог начат».
              var ub = document.createElement('div'); ub.className = 'sc-msg-user msg you'; ub.textContent = msg.question;
              historyEl.appendChild(ub);
            }
            if (msg.answer) {
              var sb = document.createElement('div'); sb.className = 'sc-msg-soul msg or';
              if (msg.answer.indexOf('\n') !== -1 || msg.answer.indexOf('**') !== -1 || msg.answer.indexOf('- ') !== -1) {
                // SECURITY (Batch 9.1): HTML-escape перед innerHTML — без него
                // prompt-injection LLM → XSS → кража JWT/cookie через
                // сохранённый ответ в Soul Chat history.
                var html = msg.answer.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // Простая поддержка списков
                html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
                html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
                var paras = html.split(/\n+/).filter(function(p){ return p.trim().length > 0; });
                // Оборачиваем в параграфы только то, что не является списком
                sb.innerHTML = paras.map(function(p){ 
                  if (p.indexOf('<ul>') !== -1 || p.indexOf('<li>') !== -1) return p;
                  return '<p>' + p + '</p>'; 
                }).join('');
              } else {
                sb.textContent = msg.answer;
              }
              sb.insertAdjacentHTML('afterbegin', '<span class="who"><i></i>' + ((typeof t === 'function' && t('scOracleWho')) || 'Оракул') + '</span>');
              historyEl.appendChild(sb);
            }
          });
        }
        
        // Восстанавливаем сообщения текущей сессии после истории
        // Batch 8.8 (7263729 Глазунова MacOS Высокий): «Дубли сообщений в чате при
        // повторном открытии». Корень: currentNodes (только что отправленные)
        // уже сохранены в БД и пришли с history → их повторное добавление = дубль.
        // Фикс: дедупликация по textContent перед добавлением.
        var existingTexts = new Set();
        historyEl.childNodes.forEach(function(n) {
          if (n.classList && (n.classList.contains('sc-msg-user') || n.classList.contains('sc-msg-soul'))) {
            existingTexts.add((n.textContent || '').trim());
          }
        });
        currentNodes.forEach(function(n) {
          var key = (n.textContent || '').trim();
          if (key && existingTexts.has(key)) return; // дубль из history
          historyEl.appendChild(n);
        });
        scrollChatToBottom();
      }

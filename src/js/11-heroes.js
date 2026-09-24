
      // ── Инициализация страницы героев ────────────────────────────────────
      function initHeroesPage() {
        var paywall = document.getElementById('masterPaywall');
        var cabinet = document.getElementById('masterCabinet');
        var formWrap = document.getElementById('heroFormWrap');
        if (!paywall || !cabinet) return;
        // (18.06) Единый .lock-пейволл для всех платформ: web → ₽ подписка,
        // VK/OK → разовые голоса (тоггл data-web-only/data-vk-only по body.in-vk).
        // buy-cta → showPlanConfirm('plan_master'), которая в VK рисует «Пакет 30
        // песен · цена пакета · + картотека людей». Показываем paywall СРАЗУ
        // (большинство юзеров без доступа); /master/access переключит на cabinet.
        // paywall = .lock (flex-центрирование) → display:'flex', не 'block'.
        paywall.style.display = 'flex';
        cabinet.style.display = 'none';
        if (formWrap) formWrap.style.display = 'none';
        try { document.body.classList.remove('hero-form-open'); } catch(_) {}
        // Переключатель «Картотека / Тема расчёта» (showcase-unlock). Сброс на cards + wiring.
        try { if (typeof wireMasterUnlockSeg === 'function') wireMasterUnlockSeg(); } catch (_) {}
        var searchEl = document.getElementById('heroesSearch');
        if (searchEl) searchEl.value = '';
        var badge = document.getElementById('masterAccessBadge');
        if (badge) badge.textContent = (typeof t === 'function' ? t('loading') : 'Загрузка…');

        // Safety: если /master/access висит дольше 1.5 сек — paywall уже показан.
        var _heroesPaywallFallback = setTimeout(function() {
          if (paywall.style.display === 'none' && cabinet.style.display === 'none') {
            paywall.style.display = 'flex';
          }
        }, 1500);

        heroesApi('/master/access', { method: 'GET' }).then(function(d) {
          clearTimeout(_heroesPaywallFallback);
          if (d && d.access) {
            var sub = d.source === 'trial' ? (typeof t === 'function' ? t('subTrialPeriod') : 'Пробный период') : 'Пакет активен';
            if (d.renew_at) {
              var exp = new Date(d.renew_at);
              sub += ' · ' + ((typeof t === 'function' && t('untilWord') !== 'untilWord') ? t('untilWord') : 'до') + ' ' + exp.toLocaleDateString(({ ru: 'ru-RU', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU'), { day:'numeric', month:'short' }); // (аудит 24.09: русское «до» и ru-RU на EN)
            }
            if (badge) badge.textContent = sub;
            paywall.style.display = 'none';
            cabinet.style.display = 'block';
            loadHeroesList();
          } else {
            if (badge) badge.textContent = '';
            paywall.style.display = 'flex';
          }
        }).catch(function() {
          clearTimeout(_heroesPaywallFallback);
          if (badge) badge.textContent = '';
          paywall.style.display = 'flex';
        });
      }

      // ── Пейволл-разблокировка: переключатель «Картотека / Тема расчёта» ──────
      // Дизайн showcase-unlock.html. Сегмент cards/topic меняет контент (data-unlock)
      // + CTA. «Картотека» → существующая оплата картотеки showPlanConfirm('plan_master')
      // (везде ₽, цены из PLAN_PRICES — канон v9). «Тема расчёта» → переход
      // на существующие разборы-призмы дневника Оракула (soulChatPage → tab «Разборы»),
      // где разбор открывается за 100 Искр (своя оплата дневника — здесь не покупаем).
      function _masterUnlockSync(what) {
        // память состояния — чтобы setLang мог пересинхронить без аргумента
        window._muLastWhat = what || window._muLastWhat || 'cards'; what = window._muLastWhat;
        var pw = document.getElementById('masterPaywall'); if (!pw) return;
        pw.dataset.unlock = what;
        var label = document.getElementById('ulCtaLabel');
        var priceEl = document.getElementById('ulCtaPrice');
        var sparkEl = document.getElementById('ulCtaSpark');
        var isVk = document.body.classList.contains('in-vk');
        if (what === 'topic') {
          // Тема расчёта = разбор-призма дневника. Цена разбора = 100 Искр (код: prismBuyOpenBtn).
          if (label) label.textContent = (typeof t === 'function' ? t('ulTopicCta') : 'Открыть разборы');
          if (priceEl) priceEl.textContent = '100 ' + (typeof t === 'function' ? t('iskryUnit') : 'Искр');
          if (sparkEl) sparkEl.style.display = '';
        } else {
          // Картотека: везде ₽ (PLAN_PRICES), карта T-Bank.
          if (label) label.textContent = (typeof t === 'function' ? t('ulCardsCta') : 'Открыть картотеку');
          var rub = (typeof PLAN_PRICES !== 'undefined' && PLAN_PRICES.plan_master) ? PLAN_PRICES.plan_master : '3 250 ₽';
          // КАНОН v9 (отказы VK 27.07 и ОК 29.07): внутренних валют нет ни на одной
          // площадке — обе признали нашу монетизацию цифровыми товарами. Раньше OK
          // падал в else-ветку и рисовал цену во внутренней валюте (и валюта чужая, и по §5.2
          // виртуальная) — это и был предмет отказа ОК. Теперь OK = web: цена в ₽.
          // На VK stub-поверхностях (натив iOS/Android) цены нет вовсе — §5.4.1.
          // Натив приравнен к stub-поверхности: подписки там вне встроенной покупки
          // запрещены (Apple 3.1.1), значит и цены пакета быть не должно.
          var _hStub = window._isNativeApp || (isVk && !(window._vkPayMode && window._vkPayMode() === 'money'));
          if (priceEl) priceEl.textContent = _hStub ? '' : rub;
          if (sparkEl) sparkEl.style.display = 'none';
        }
        // На stub-клиентах (натив iOS/Android) покупка пакета запрещена — showPlanConfirm
        // там тихо выходит, и кнопка выглядела мёртвой (отказ ВК 24.08, скриншот 1:
        // «кнопки для оплаты, которые не кликабельны»). Кнопку и подпись пакета прячем
        // ЦЕЛИКОМ в режиме «Картотека»; вкладка «Тема» — не оплата, там CTA остаётся.
        var _ctaEl = document.getElementById('ulCta');
        var _noteEl = pw.querySelector('.u-note');
        // Натив из списка «оплата недоступна» убран: пакет «Лаборатория» продаётся
        // встроенной покупкой, кнопка рабочая. Цену рядом с ней не рисуем — её
        // показывает Apple (см. _hStub выше).
        var _stubCards = (what !== 'topic') && isVk && !(window._vkPayMode && window._vkPayMode() === 'money');
        if (_ctaEl) _ctaEl.style.display = _stubCards ? 'none' : '';
        if (_noteEl) _noteEl.style.display = _stubCards ? 'none' : '';
      }
      function wireMasterUnlockSeg() {
        var pw = document.getElementById('masterPaywall'); if (!pw) return;
        // Сброс на «Картотека» при каждом открытии страницы.
        var segCards = document.getElementById('ulSegCards');
        var segTopic = document.getElementById('ulSegTopic');
        if (segCards) segCards.classList.add('on');
        if (segTopic) segTopic.classList.remove('on');
        window._masterUnlockSync = _masterUnlockSync;
        _masterUnlockSync('cards');
        if (pw._unlockWired) return;
        pw._unlockWired = true;
        var seg = document.getElementById('ulSeg');
        if (seg) {
          seg.addEventListener('click', function(e) {
            var b = e.target.closest('button'); if (!b) return;
            this.querySelectorAll('button').forEach(function(x) { x.classList.toggle('on', x === b); });
            _masterUnlockSync(b.dataset.u);
          });
        }
        var cta = document.getElementById('ulCta');
        if (cta) {
          cta.addEventListener('click', function() {
            if (pw.dataset.unlock === 'topic') {
              // Существующие разборы-призмы дневника: soulChatPage → таб «Разборы».
              window.returnToPage = 'heroesPage';
              if (window.goToPage) goToPage('soulChatPage');
              if (typeof initSoulChatPage === 'function') { try { initSoulChatPage(); } catch (_) {} }
              setTimeout(function() { try { if (typeof switchOracleTab === 'function') switchOracleTab('prism'); } catch (_) {} }, 300);
            } else {
              // Картотека — существующая оплата (web ₽ подписка / VK голоса). НЕ дублируем.
              if (typeof showPlanConfirm === 'function') showPlanConfirm('plan_master', 'Лаборатория');
            }
          });
        }
      }
      window.wireMasterUnlockSeg = wireMasterUnlockSeg;

      // ── Триал и подписка ─────────────────────────────────────────────────
      var masterTrialBtn = document.getElementById('masterTrialBtn');
      var masterSubBtn = document.getElementById('masterSubBtn');
      // Пробник Лаборатории = 24ч Картотека/Контакты (без песен, Алла 17.06).
      if (masterTrialBtn) masterTrialBtn.addEventListener('click', function() {
        masterTrialBtn.disabled = true;
        masterTrialBtn.textContent = typeof t === 'function' ? t('subConnecting') : 'Подключаем…';
        heroesApi('/master/trial/start', { method: 'POST', body: { initData: (tg && tg.initData) || '' } }).then(function(d) {
          if (d && d.ok) {
            var paywall = document.getElementById('masterPaywall');
            var cabinet = document.getElementById('masterCabinet');
            var badge = document.getElementById('masterAccessBadge');
            if (paywall) paywall.style.display = 'none';
            if (cabinet) { cabinet.style.display = 'block'; loadHeroesList(); }
            if (badge) {
              var exp = d.renew_at ? new Date(d.renew_at).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
              badge.textContent = (typeof t === 'function' ? t('subTrialPeriod') : 'Пробный период') + (exp ? ' · до ' + exp : '');
            }
          } else {
            showToast(d && d.error ? d.error : t('toastActivateFail'));
            masterTrialBtn.disabled = false;
            masterTrialBtn.textContent = typeof t === 'function' ? t('subTrial1Day') : '1 день бесплатно — попробовать';
          }
        }).catch(function(e) {
          var msg = e && e.message ? e.message : '';
          // Batch 7.9 (ID 7258880 Windows Высокий): «При повторной активации
          // отсутствует уведомление, 401 в консоли». Корень: показывали
          // toastTrialUsed = "Подарочный трек активирован" — сообщение УСПЕХА
          // для error case. Корректный ключ: toastMasterTrialUsed.
          if (msg.indexOf('уже был использован') !== -1 || msg.indexOf('already') !== -1) {
            masterTrialBtn.style.display = 'none';
            showToast(typeof t === 'function' ? (t('toastMasterTrialUsed') || 'Пробный день уже использован') : 'Пробный день уже использован');
          } else if (msg.indexOf('401') !== -1 || /unauthor|неверные данные авториз|не удалось определить/i.test(msg)) {
            // 401 без точного «already used» — auth проблема, не trial issue
            showToast(typeof t === 'function' ? (t('toastAuthLost') || 'Перезайди в приложение, чтобы продолжить.') : 'Перезайди в приложение, чтобы продолжить.');
            masterTrialBtn.disabled = false;
            masterTrialBtn.textContent = typeof t === 'function' ? t('subTrial1Day') : '1 день бесплатно — попробовать';
          } else {
            showToast(msg || (typeof t === 'function' ? t('toastActivateFail') : 'Не удалось активировать. Попробуй ещё раз.'));
            masterTrialBtn.disabled = false;
            masterTrialBtn.textContent = typeof t === 'function' ? t('subTrial1Day') : '1 день бесплатно — попробовать';
          }
        });
      });
      if (masterSubBtn) masterSubBtn.addEventListener('click', function() {
        // §5.4.1 + VK QA отказ 26.05.2026: на mobile VK ЗАПРЕЩЕНО показывать
        // toast про оплату / уводы на vk.com или yupsoul.ru. Silent return.
        // Сама кнопка masterSubBtn скрыта CSS на is-vk-mobile (строка 4498),
        // этот guard — на случай если CSS не сработал.
        if (window._appEnv === 'vk' && window._vkIsMobileClient) {
          return;
        }
        if (window._isOkMiniApp) {
          return;
        }
        masterSubBtn.disabled = true;
        masterSubBtn.textContent = t('btnOpening');
        heroesApi('/master/subscribe', { method: 'POST', body: { initData: (tg && tg.initData) || '' } }).then(function(d) {
          if (d && d.payment_url) {
            // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
            if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
              vkBridge.send('VKWebAppOpenLink', { url: d.payment_url })
                .catch(function(){ try { window.open(d.payment_url, '_blank'); } catch(_) {} });
            } else if (tg && tg.openLink) {
              tg.openLink(d.payment_url);
            } else {
              window.open(d.payment_url, '_blank');
            }
          }
          masterSubBtn.disabled = false;
          var _pmL = (typeof t === 'function' ? t('perMonth') : '') || '';
          var priceStr = (d && d.payment_amount != null && d.payment_currency) ? (d.payment_amount + ' ' + d.payment_currency + _pmL) : ('3 250 ₽' + _pmL);
          masterSubBtn.textContent = (typeof t === 'function' ? t('heroesSubBtn') : ('Подписка — ' + priceStr));
        }).catch(function(e) {
          showToast(t('toastConnFail'));
          masterSubBtn.disabled = false;
          masterSubBtn.textContent = (typeof t === 'function' ? t('heroesSubBtn') : 'Пакет — 3 250 ₽');
        });
      });

      // ── Список героев ─────────────────────────────────────────────────────
      function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      
      // Корректное сравнение версий Telegram (например, "7.10" > "7.2")
      function compareVersion(version, minVersion) {
        if (!version) return false;
        var vParts = String(version).split('.').map(function(p) { return parseInt(p, 10) || 0; });
        var minParts = String(minVersion).split('.').map(function(p) { return parseInt(p, 10) || 0; });
        for (var i = 0; i < Math.max(vParts.length, minParts.length); i++) {
          var v = vParts[i] || 0;
          var m = minParts[i] || 0;
          if (v > m) return true;
          if (v < m) return false;
        }
        return true;
      }
      
      // Индикатор состояния сети
      function showOfflineIndicator() {
        var indicator = document.getElementById('offlineIndicator');
        if (!indicator) {
          indicator = document.createElement('div');
          indicator.id = 'offlineIndicator';
          indicator.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.95);color:#fff;padding:8px 16px;border-radius:20px;font-size:0.8rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
          indicator.textContent = t('noInternet');
          document.body.appendChild(indicator);
        }
        indicator.style.display = 'block';
      }
      
      function hideOfflineIndicator() {
        var indicator = document.getElementById('offlineIndicator');
        if (indicator) indicator.style.display = 'none';
      }
      
      // Отслеживание состояния сети
      window.addEventListener('online', function() {
        console.log('[Network] Соединение восстановлено');
        hideOfflineIndicator();
      });
      
      window.addEventListener('offline', function() {
        console.log('[Network] Соединение потеряно');
        showOfflineIndicator();
      });
      
      // Проверка при загрузке
      if (!navigator.onLine) {
        showOfflineIndicator();
      }

      // ═══ visibilitychange: обновить данные при возврате в ап после долгого отсутствия ═══
      var _lastVisibleAt = Date.now();
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          var awayMs = Date.now() - _lastVisibleAt;
          // Если ушёл больше чем на 5 минут — обновить критичные данные
          if (awayMs > 5 * 60 * 1000) {
            console.log('[Visibility] Возврат после ' + Math.round(awayMs / 60000) + ' мин — обновляю данные');
            // Обновить тариф, профиль и баланс Искр (всё через /api/me)
            if (typeof loadMe === 'function') loadMe();
            // Убедиться что TMA развёрнуто
            // Batch 7.22 (telemetry diag, line :27883): typeof tg !== 'undefined' пропускает
            // null (typeof null === 'object'). На VK desktop_web tg = null → tg.expand →
            // TypeError. Зафиксировано 3× за 2 часа после deploy. Truthy check ловит оба.
            if (tg && tg.expand) try { tg.expand(); } catch(_) {}
          }
        } else {
          _lastVisibleAt = Date.now();
        }
      });

      // ── loadHeroesList — закон №37 ────────────────────────────────────
      // Корневая защита: heroesApi уже использует fetchWithRetry (2 ретрая × 45s)
      // с auth headers (Bearer + initData + Google). Если он всё-таки бросит —
      // проверяем offline → overlay; если online → продолжаем silent retry с
      // backoff. Никакого «Не удалось загрузить героев» текста.
      async function loadHeroesListAsync(_attempt) {
        _attempt = _attempt || 0;
        var listEl = document.getElementById('heroesList');
        if (!listEl) return;
        if (_attempt === 0) {
          listEl.innerHTML = '<div style="text-align:center;padding:24px 0;font-size:0.85rem;color:rgba(255,255,255,0.3)">' + (typeof t === 'function' ? t('loading') : 'Загрузка…') + '</div>';
        }
        if (!window._ensureOnline()) {
          window.addEventListener('online', function onOnline() {
            window.removeEventListener('online', onOnline);
            loadHeroesListAsync(0);
          }, { once: true });
          return;
        }
        var search = (document.getElementById('heroesSearch') || {}).value || '';
        var q = search.trim() ? '?search=' + encodeURIComponent(search.trim()) : '';
        try {
          var d = await heroesApi('/heroes' + q, { method: 'GET' });
          renderHeroesListFromData(d);
          _fetchHeroCompatScores();
        } catch (e) {
          console.warn('[loadHeroesList] silent retry', e);
          if (_attempt >= 4) return; // тихо сдаёмся
          setTimeout(function(){ loadHeroesListAsync(_attempt + 1); }, Math.min(20000, 1500 * Math.pow(1.7, _attempt)));
        }
      }
      function loadHeroesList() { loadHeroesListAsync(0); }
      function renderHeroesListFromData(d) {
        var listEl = document.getElementById('heroesList');
        if (!listEl) return;
          heroesCache = (d && d.clients) || [];
          // Batch 10.10 (7271919): обновить disabled-state кнопки «Найти»
          if (typeof window._updateHeroesSearchBtnState === 'function') window._updateHeroesSearchBtnState();
          if (!heroesCache.length) {
            // Batch 10.27 (отчёт 7273348 Ольга Михайловна Windows): аватар-плейсхолдер
            // показывался ВСЕГДА при пустом списке. Но при поиске «героя нет» — это
            // не первый запуск (call-to-action), а отсутствие совпадений. Avatar
            // placeholder вводит в заблуждение. Фикс: показываем avatar ТОЛЬКО когда
            // search пустой (true empty state, новый user). При активном поиске —
            // только текст «По запросу ничего не найдено».
            var _searchEl = document.getElementById('heroesSearch');
            var _hasSearchQuery = _searchEl && (_searchEl.value || '').trim();
            if (_hasSearchQuery) {
              listEl.innerHTML = '<div class="empty"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg><p>' + (typeof t === 'function' ? (t('heroesSearchNotFound') || 'По запросу ничего не найдено.') : 'По запросу ничего не найдено.') + '</p></div>';
            } else {
              listEl.innerHTML = '<div class="zero"><span class="zero-ic"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"></path><path d="M16 4.2a3 3 0 0 1 0 5.6"></path><path d="M18 14.4c2 .5 3.4 2.1 3.8 4.6"></path></svg></span>' +
                '<h3>' + (typeof t === 'function' ? t('heroesZeroTitle') : 'В картотеке пока пусто') + '</h3>' +
                '<p>' + (typeof t === 'function' ? t('heroesZeroDesc') : 'Добавь близкого человека — и оракул соберёт для него песню по дате рождения.') + '</p>' +
                '<div class="zero-hint">' + (typeof t === 'function' ? t('heroesZeroHint') : 'Например: партнёр · дети · родители · друзья') + '</div>' +
                '<button type="button" class="zero-cta" id="heroesZeroAdd">' + (typeof t === 'function' ? t('heroesZeroCta') : 'Добавить первого героя') + '</button></div>';
              var _hZeroAdd = document.getElementById('heroesZeroAdd');
              if (_hZeroAdd) _hZeroAdd.addEventListener('click', function() { window._heroFormReturnTo = null; openHeroForm(null); });
            }
            return;
          }
          // VK Testers 7272195 (Windows EN 14.05.2026 REOPEN): «Кнопки управления
           // и статус "Кто для тебя", месяц рождения и город не локализованы».
          // Корень: h.relationship хранится в БД на русском (мать/отец/...) —
          // даже на EN UI отображается «мать». Добавляем translation map.
          var _heroRelMap = {
            ru: { 'мать':'мать', 'отец':'отец', 'дочь':'дочь', 'сын':'сын', 'сестра':'сестра', 'брат':'брат', 'бабушка':'бабушка', 'дедушка':'дедушка', 'муж':'муж', 'жена':'жена', 'любимый человек':'любимый человек', 'друг':'друг', 'подруга':'подруга', 'коллега':'коллега', 'наставник':'наставник', 'другое':'другое' },
            en: { 'мать':'Mother', 'отец':'Father', 'дочь':'Daughter', 'сын':'Son', 'сестра':'Sister', 'брат':'Brother', 'бабушка':'Grandmother', 'дедушка':'Grandfather', 'муж':'Husband', 'жена':'Wife', 'любимый человек':'Loved one', 'друг':'Friend', 'подруга':'Friend', 'коллега':'Colleague', 'наставник':'Mentor', 'другое':'Other' },
            de: { 'мать':'Mutter', 'отец':'Vater', 'дочь':'Tochter', 'сын':'Sohn', 'сестра':'Schwester', 'брат':'Bruder', 'бабушка':'Großmutter', 'дедушка':'Großvater', 'муж':'Ehemann', 'жена':'Ehefrau', 'любимый человек':'Geliebter Mensch', 'друг':'Freund', 'подруга':'Freundin', 'коллега':'Kollege', 'наставник':'Mentor', 'другое':'Andere' },
            fr: { 'мать':'Mère', 'отец':'Père', 'дочь':'Fille', 'сын':'Fils', 'сестра':'Sœur', 'брат':'Frère', 'бабушка':'Grand-mère', 'дедушка':'Grand-père', 'муж':'Mari', 'жена':'Épouse', 'любимый человек':'Être aimé', 'друг':'Ami', 'подруга':'Amie', 'коллега':'Collègue', 'наставник':'Mentor', 'другое':'Autre' }
          };
          function _translateHeroRel(rel) {
            if (!rel) return '';
            var lang = (typeof currentLang !== 'undefined' && currentLang) || 'ru';
            var map = _heroRelMap[lang] || _heroRelMap.ru;
            return map[rel.toLowerCase().trim()] || rel;
          }
          // Картотека v5 (showcase-contacts): цветной аватар по hue имени + счётчик
          function _heroHueOf(s){var x=0;for(var i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))%360;return x;}
          function _heroAvBg(hue){return 'radial-gradient(120% 120% at 28% 22%,hsl('+((hue+40)%360)+',88%,66%),transparent 55%),radial-gradient(130% 130% at 80% 34%,hsl('+hue+',82%,52%),transparent 58%),linear-gradient(160deg,hsl('+hue+',52%,22%),hsl('+((hue+300)%360)+',52%,12%))';}
          // Картотека v5: совместимость — реальный балл из бэкенда (window._heroCompatScores), не хэш
          function _heroCompatScore(h){
            var m = window._heroCompatScores;
            var v = m && h && m[h.id];
            return (typeof v === 'number') ? v : null;
          }
          var _hCount = heroesCache.length;
          var _hLang = (typeof currentLang !== 'undefined' && currentLang) || 'ru';
          var _hCountWord;
          if (_hLang === 'ru') {
            var _d = _hCount % 10, _dd = _hCount % 100;
            _hCountWord = (_d === 1 && _dd !== 11) ? 'герой' : (_d >= 2 && _d <= 4 && (_dd < 10 || _dd >= 20)) ? 'героя' : 'героев';
          } else {
            _hCountWord = (typeof t === 'function' ? (t('heroesCountWord') || (_hCount === 1 ? 'person' : 'people')) : 'people');
          }
          var _countHtml = '<div class="count">' + _hCount + ' ' + escHtml(_hCountWord) + '</div>';
          // Карточка «Ты» (свой профиль) первой — эталон .feat + .rel.self
          var _selfCardHtml = '';
          if (typeof userProfile !== 'undefined' && userProfile && userProfile.name) {
            var _upName = String(userProfile.name).trim() || 'Ты';
            var _upIni = _upName.split(/\s+/).slice(0,2).map(function(w){var c=Array.from(w);return c[0]||'';}).join('').toUpperCase();
            var _upMeta = [];
            if (userProfile.birthdate) { var _ul={ru:'ru-RU',en:'en-GB',de:'de-DE',fr:'fr-FR'}[_hLang]||'ru-RU'; try{ _upMeta.push(new Date(userProfile.birthdate).toLocaleDateString(_ul,{day:'numeric',month:'long',year:'numeric'})); }catch(e){} }
            if (userProfile.birthplace) _upMeta.push(userProfile.birthplace);
            var _upMetaText = _upMeta.join(' · ');
            var _upHue = _heroHueOf(_upName);
            _selfCardHtml = '<div class="hero feat" id="hcard-self">' +
              '<button type="button" class="hero-main" onclick="toggleHeroCard(\'self\')">' +
              '<span class="av" style="background:' + _heroAvBg(_upHue) + '"><span class="ini">' + escHtml(_upIni) + '</span></span>' +
              '<span class="hero-body"><span class="hero-top"><span class="hero-name">' + escHtml(_upName) + '</span><span class="rel self">✧ ' + escHtml(typeof t==='function'?(t('heroesSelfBadge')||'это ты'):'это ты') + '</span></span>' +
              (_upMetaText ? '<span class="hero-meta"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16v-7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v7Z"></path><path d="M4 16c2 1.4 4 1.4 6 0s4-1.4 6 0 2 1.4 4 0"></path><path d="M12 8V5"></path></svg><span class="hero-place">' + escHtml(_upMetaText) + '</span></span>' : '') +
              '</span>' +
              '<span class="hero-right"><span class="hero-chev"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></span></span>' +
              '</button>' +
              '<div class="hero-fold"><div class="hero-actions">' +
              '<button type="button" class="ha primary" id="heroSelfSongBtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg> ' + escHtml(typeof t==='function'?(t('heroesCreateSong')||'Создать песню'):'Создать песню') + '</button>' +
              '<span class="ha-sp"></span>' +
              '<button type="button" class="ha icon" id="heroSelfEditBtn" aria-label="' + escHtml(typeof t==='function'?(t('heroEditBtn')||'Изменить'):'Изменить') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>' +
              '</div></div></div>';
          }
          listEl.innerHTML = _countHtml + _selfCardHtml + heroesCache.map(function(h) {
            // Batch 10.9 (отчёт 7271872 Windows): эмодзи в имени = surrogate pair
            // (2 char units). w[0] возвращает половину суррогата → ОС рендерит «?».
            // Array.from корректно разбивает по graphemes — эмодзи остаётся целым.
            var nameStr = (h.name || '?').trim();
            var words = nameStr.split(/\s+/).slice(0, 2);
            var initials = words.map(function(w) {
              var chars = Array.from(w);
              return chars[0] || '';
            }).join('').toUpperCase();
            // Картотека v5: отношение → пилюля .rel (в .hero-top), дата+место → .hero-meta.
            var metaParts = [];
            if (h.birth_date) {
              // Batch 10.12 (7272195): локаль из currentLang, не hardcoded 'ru-RU'
              var heroDateLocale = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR', uk:'uk-UA' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
              metaParts.push(new Date(h.birth_date).toLocaleDateString(heroDateLocale, { day:'numeric', month:'long', year:'numeric' }));
            }
            if (h.birth_place) metaParts.push(h.birth_place);
            var _metaText = metaParts.join(' · ');
            var _relText = h.relationship ? _translateHeroRel(h.relationship) : '';
            var _hHue = _heroHueOf(nameStr);
            return '<div class="hero" id="hcard-' + escHtml(h.id) + '">' +
              '<button type="button" class="hero-main" onclick="toggleHeroCard(\'' + escHtml(h.id) + '\')">' +
              '<span class="av" style="background:' + _heroAvBg(_hHue) + '"><span class="ini">' + escHtml(initials) + '</span></span>' +
              '<span class="hero-body">' +
              '<span class="hero-top"><span class="hero-name">' + escHtml(h.name) + '</span>' + (_relText ? '<span class="rel">' + escHtml(_relText) + '</span>' : '') + '</span>' +
              (_metaText ? '<span class="hero-meta"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16v-7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v7Z"></path><path d="M4 16c2 1.4 4 1.4 6 0s4-1.4 6 0 2 1.4 4 0"></path><path d="M12 8V5"></path></svg><span class="hero-place">' + escHtml(_metaText) + '</span></span>' : '') +
              '</span>' +
              '<span class="hero-right">' +
              (typeof _heroCompatScore(h) === 'number' ? '<span class="compat"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> ' + _heroCompatScore(h) + '%</span>' : '') +
              ((h.song_count) ? '<span class="songs"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg> ' + h.song_count + '</span>' : '') +
              '<span class="hero-chev"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></span></span>' +
              '</button>' +
              '<div class="hero-fold">' +
              (h.notes ? '<div class="hero-notes">' + escHtml(h.notes) + '</div>' : '') +
              '<div class="hero-actions">' +
              '<button type="button" class="ha primary hero-solo-btn" data-id="' + escHtml(h.id) + '" data-name="' + escHtml(h.name) + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg> ' + (typeof t === 'function' ? t('heroSoloBtn') : 'Соло') + '</button>' +
              '<button type="button" class="ha hero-duo-btn" data-id="' + escHtml(h.id) + '" data-name="' + escHtml(h.name) + '">' + (typeof t === 'function' ? t('heroDuoBtn') : 'Вместе со мной') + '</button>' +
              '<span class="ha-sp"></span>' +
              '<button type="button" class="ha icon hero-edit-btn" data-id="' + escHtml(h.id) + '" aria-label="' + escHtml(typeof t === 'function' ? t('heroEditBtn') : 'Изменить') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>' +
              '<button type="button" class="ha icon danger hero-delete-btn" data-id="' + escHtml(h.id) + '" data-name="' + escHtml(h.name) + '" aria-label="' + escHtml(typeof t === 'function' ? t('heroDeleteBtn') : 'Удалить') + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path></svg></button>' +
              '</div>' +
              '<div class="hero-hist-section" id="hhist-' + escHtml(h.id) + '">' +
              '<button type="button" class="hero-hist-toggle hero-hist-load-btn" data-id="' + escHtml(h.id) + '">▸ ' + t('heroGenHistory') + '</button>' +
              '<div class="hero-hist-content" id="hhist-content-' + escHtml(h.id) + '" style="display:none"></div>' +
              '</div>' +
              '</div>' +
              '</div>';
          }).join('');

          // Карточка «Ты»: «Создать песню» → форма песни (для себя), «Изменить» → профиль
          var _selfSongBtn = document.getElementById('heroSelfSongBtn');
          if (_selfSongBtn) _selfSongBtn.addEventListener('click', function(e){ e.stopPropagation(); if (window.goToPage) goToPage('formPage'); });
          var _selfEditBtn = document.getElementById('heroSelfEditBtn');
          if (_selfEditBtn) _selfEditBtn.addEventListener('click', function(e){ e.stopPropagation(); if (typeof goToProfileFrom === 'function') goToProfileFrom('heroesPage'); else if (window.goToPage) goToPage('profilePage'); });

          // Раскрытие карточки
          listEl.querySelectorAll('.hero-hist-load-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var id = btn.getAttribute('data-id');
              var contentEl = document.getElementById('hhist-content-' + id);
              if (!contentEl) return;
              if (contentEl.style.display === 'block') { contentEl.style.display = 'none'; btn.textContent = '▸ ' + t('heroGenHistory'); return; }
              contentEl.style.display = 'block';
              btn.textContent = '▾ ' + t('heroGenHistory');
              if (contentEl.dataset.loaded) return;
              contentEl.dataset.loaded = '1';
              contentEl.innerHTML = '<div class="hero-hist-loading">' + (typeof t === 'function' ? t('heroHistLoading') : 'Загрузка истории…') + '</div>';
              heroesApi('/heroes/' + id + '/requests', { method: 'GET' }).then(function(d) {
                var reqs = (d && d.requests) || [];
                if (!reqs.length) { contentEl.innerHTML = '<div class="hero-hist-empty">' + (typeof t === 'function' ? t('heroHistEmpty') : 'Генераций пока нет') + '</div>'; return; }
                // Безопасное создание элементов без innerHTML для предотвращения XSS
                var fragment = document.createDocumentFragment();
                reqs.forEach(function(r) {
                  var statusClass = { completed:'st-done', done:'st-done', delivery_failed:'st-error', error:'st-error', cancelled:'st-error', pending:'st-pending', pending_payment:'st-pending', generating:'st-pending' }[r.generation_status] || '';
                  var dateStr = r.created_at ? new Date(r.created_at).toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';

                  var itemDiv = document.createElement('div');
                  itemDiv.className = 'hero-hist-item';

                  var titleDiv = document.createElement('div');
                  titleDiv.className = 'hero-hist-title';
                  if (statusClass) {
                    var dot = document.createElement('span');
                    dot.className = 'hero-hist-status ' + statusClass;
                    titleDiv.appendChild(dot);
                  }
                  titleDiv.appendChild(document.createTextNode(r.title || 'Песня души'));
                  itemDiv.appendChild(titleDiv);
                  
                  var metaDiv = document.createElement('div');
                  metaDiv.className = 'hero-hist-meta';
                  metaDiv.textContent = dateStr + (r.request_type ? ' · ' + r.request_type : '');
                  itemDiv.appendChild(metaDiv);
                  
                  if (r.lyrics) {
                    var lyricsLabel = document.createElement('div');
                    lyricsLabel.className = 'hero-hist-block-label';
                    lyricsLabel.textContent = t('heroLyricsLabel');
                    itemDiv.appendChild(lyricsLabel);
                    var lyricsText = document.createElement('div');
                    lyricsText.className = 'hero-hist-text';
                    lyricsText.textContent = typeof window._mtCleanMarkdown === 'function' ? window._mtCleanMarkdown(r.lyrics) : r.lyrics;
                    itemDiv.appendChild(lyricsText);
                  }
                  
                  if (r.detailed_analysis) {
                    var analysisBtn = document.createElement('button');
                    analysisBtn.type = 'button';
                    analysisBtn.className = 'hero-hist-toggle hha-toggle';
                    analysisBtn.style.marginBottom = '4px';
                    analysisBtn.textContent = '▸ ' + t('heroAnalysisBtn');
                    itemDiv.appendChild(analysisBtn);
                    var analysisText = document.createElement('div');
                    analysisText.className = 'hero-hist-text';
                    analysisText.style.display = 'none';
                    analysisText.textContent = typeof window._mtCleanMarkdown === 'function' ? window._mtCleanMarkdown(r.detailed_analysis) : r.detailed_analysis;
                    itemDiv.appendChild(analysisText);
                  }
                  
                  if (r.cover_letter) {
                    var letterBtn = document.createElement('button');
                    letterBtn.type = 'button';
                    letterBtn.className = 'hero-hist-toggle hha-toggle';
                    letterBtn.style.marginBottom = '4px';
                    letterBtn.textContent = '▸ ' + t('heroLetterBtn');
                    itemDiv.appendChild(letterBtn);
                    var letterText = document.createElement('div');
                    letterText.className = 'hero-hist-text';
                    letterText.style.display = 'none';
                    letterText.textContent = typeof window._mtCleanMarkdown === 'function' ? window._mtCleanMarkdown(r.cover_letter) : r.cover_letter;
                    itemDiv.appendChild(letterText);
                  }
                  
                  if (r.audio_url) {
                    var audioBtn = document.createElement('button');
                    audioBtn.type = 'button';
                    audioBtn.className = 'hero-hist-audio';
                    audioBtn.textContent = '▶ ' + t('heroListenBtn');
                    audioBtn.setAttribute('data-audio-url', r.audio_url);
                    audioBtn.addEventListener('click', function() {
                      var url = this.getAttribute('data-audio-url');
                      var btn = this;
                      // Если уже играет этот трек — пауза
                      if (window._heroHistAudio && window._heroHistAudioUrl === url && !window._heroHistAudio.paused) {
                        window._heroHistAudio.pause();
                        btn.textContent = '▶ ' + t('heroListenBtn');
                        btn.classList.remove('playing');
                        return;
                      }
                      // Останавливаем предыдущий, сбрасываем все кнопки
                      if (window._heroHistAudio) { window._heroHistAudio.pause(); window._heroHistAudio.src = ''; }
                      document.querySelectorAll('.hero-hist-audio.playing').forEach(function(b) { b.classList.remove('playing'); b.textContent = '▶ ' + t('heroListenBtn'); });
                      window._heroHistAudio = new Audio(window._absMediaUrl(url));
                      window._heroHistAudioUrl = url;
                      window._heroHistAudio.play().then(function() {
                        btn.textContent = '⏸ ' + t('heroListenBtn');
                        btn.classList.add('playing');
                      }).catch(function() {
                        if (window.showToast) window.showToast(typeof t === 'function' ? t('mtPlayError') : 'Не удалось воспроизвести');
                      });
                      window._heroHistAudio.addEventListener('ended', function() {
                        btn.textContent = '▶ ' + t('heroListenBtn');
                        btn.classList.remove('playing');
                      });
                    });
                    itemDiv.appendChild(audioBtn);
                  }
                  
                  fragment.appendChild(itemDiv);
                });
                contentEl.innerHTML = '';
                contentEl.appendChild(fragment);
                // Раскрытие анализа/письма
                contentEl.querySelectorAll('.hha-toggle').forEach(function(tb) {
                  tb.addEventListener('click', function() {
                    var next = tb.nextElementSibling;
                    if (!next) return;
                    var open = next.style.display === 'block';
                    next.style.display = open ? 'none' : 'block';
                    tb.textContent = tb.textContent.replace(/^[▸▾]\s/, (open ? '▸ ' : '▾ '));
                  });
                });
              }).catch(function() {
                // Закон №37: offline → overlay; online → тихо разблокируем re-fetch.
                // Skeleton («Загрузка истории…») остаётся в DOM, юзер может повторно
                // свернуть-развернуть для retry. Error-текст НЕ показываем.
                if (!window._ensureOnline()) return;
                console.warn('[HeroHistory] silent fail id=' + id + ', user re-toggle to retry');
                contentEl.dataset.loaded = ''; // следующий клик повторит загрузку
              });
            });
          });

          // Кнопки Соло / Вместе
          listEl.querySelectorAll('.hero-solo-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var heroId = btn.getAttribute('data-id');
              var heroName = btn.getAttribute('data-name') || '';
              var h = heroesCache.find(function(c){ return c.id === heroId; }) || {};
              // VK Testers 7274982 (MacOS 14.05.2026): при попытке создать
              // песню для героя без birth_date появлялась ошибка «Что-то
              // пошло не так». Корень: бэкенд требует birthdate валидным,
              // но фронт не валидировал перед отправкой. Сейчас проверяем
              // обязательные поля и предлагаем заполнить карточку.
              if (!h.birth_date || !h.birth_place || !String(h.birth_date).trim() || !String(h.birth_place).trim()) {
                if (typeof showToast === 'function') {
                  showToast(typeof t === 'function' ? (t('heroIncomplete') || 'У героя не заполнены дата или место рождения. Открой карточку и дополни.') : 'У героя не заполнены дата или место рождения. Открой карточку и дополни.');
                }
                openHeroForm(h);
                return;
              }
              startHeroRequest({ hero: h, mode: 'single', forWho: heroName });
            });
          });
          listEl.querySelectorAll('.hero-duo-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var heroId = btn.getAttribute('data-id');
              var heroName = btn.getAttribute('data-name') || '';
              var h = heroesCache.find(function(c){ return c.id === heroId; }) || {};
              // VK Testers 7274982: та же валидация для duo
              if (!h.birth_date || !h.birth_place || !String(h.birth_date).trim() || !String(h.birth_place).trim()) {
                if (typeof showToast === 'function') {
                  showToast(typeof t === 'function' ? (t('heroIncomplete') || 'У героя не заполнены дата или место рождения. Открой карточку и дополни.') : 'У героя не заполнены дата или место рождения. Открой карточку и дополни.');
                }
                openHeroForm(h);
                return;
              }
              startHeroRequest({ hero: h, mode: 'couple', forWho: heroName });
            });
          });

          // Кнопки Изменить / Удалить
          listEl.querySelectorAll('.hero-edit-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              var id = btn.getAttribute('data-id');
              var h = heroesCache.find(function(c) { return c.id === id; });
              if (!h) return;
              openHeroForm(h);
            });
          });
          listEl.querySelectorAll('.hero-delete-btn').forEach(function(btn) {
            btn.addEventListener('click', async function(e) {
              e.stopPropagation();
              if (btn.disabled) return;
              var id = btn.getAttribute('data-id');
              var name = btn.getAttribute('data-name') || (typeof t === 'function' ? (t('thisHero') || 'этого героя') : 'этого героя');
              // VK Testers 7274954 (Windows EN) + 7274936 (тёмная тема, MacOS, 14.05.2026):
              // (1) hardcoded RU «Удалить '<name>'?» — не локализовано.
              // (2) _safeConfirm на VK показывал VK-chrome диалог; на web —
              //     _showCustomConfirm (из другого scope, мог не сработать).
              //     В тёмной теме модалка имела недостаточный контраст.
              // Фикс: inline-модал с локализованным текстом + theme-aware стили.
              var msg = (typeof t === 'function' ? (t('confirmDeleteHero') || 'Удалить «{name}»?').replace('{name}', name) : 'Удалить «' + name + '»?');
              var ok = await new Promise(function(resolve) {
                // VK Testers 7276511 (Maria Lykosova MacBook Pro 13 inch 2017 Safari MacOS dark,
                // ПЕРЕОТКРЫТ-2): первые 2 фикса через innerHTML + inline style="..." не сработали
                // на Safari (квирк WebKit). Переписано на CSS classes + правила в <style>.
                // Стили определены выше: .yup-del-modal-overlay / -card / -btn-danger / -btn-cancel
                // с явными overrides под dark (default) и все 3 light-scope.
                var existing = document.getElementById('_inAppHeroDelConfirm');
                if (existing) existing.remove();
                var delLabel = (typeof t === 'function' ? (t('btnDelete') || 'Удалить') : 'Удалить');
                var cancelLabel = (typeof t === 'function' ? (t('confirmCancel') || 'Отмена') : 'Отмена');

                var ov = document.createElement('div');
                ov.id = '_inAppHeroDelConfirm';
                ov.className = 'yup-del-modal-overlay';

                var card = document.createElement('div');
                card.className = 'yup-del-modal-card';

                var textP = document.createElement('p');
                textP.className = 'yup-del-modal-text';
                textP.textContent = msg;
                card.appendChild(textP);

                var actions = document.createElement('div');
                actions.className = 'yup-del-modal-actions';

                var btnOk = document.createElement('button');
                btnOk.type = 'button';
                btnOk.id = '_hdOk';
                btnOk.className = 'yup-del-modal-btn-danger';
                btnOk.textContent = delLabel;

                var btnCancel = document.createElement('button');
                btnCancel.type = 'button';
                btnCancel.id = '_hdCancel';
                btnCancel.className = 'yup-del-modal-btn-cancel';
                btnCancel.textContent = cancelLabel;

                actions.appendChild(btnOk);
                actions.appendChild(btnCancel);
                card.appendChild(actions);
                ov.appendChild(card);
                document.body.appendChild(ov);

                var done = function(val) { try { ov.remove(); } catch(_){} resolve(val); };
                btnOk.onclick = function() { done(true); };
                btnCancel.onclick = function() { done(false); };
                ov.onclick = function(e) { if (e.target === ov) done(false); };
              });
              if (!ok) return;
              btn.disabled = true;
              btn.style.opacity = '0.5';
              heroesApi('/heroes/' + id, { method: 'DELETE' }).then(function() {
                // Batch 10.12 (7272170): сбрасываем кэш героев после удаления —
                // иначе pick-from-lab dropdown показывает stale список со старым героем.
                try { window.heroesCache = null; } catch(_) {}
                if (Array.isArray(heroesCache)) heroesCache = heroesCache.filter(function(c) { return c.id !== id; });
                loadHeroesList();
              }).catch(function() {
                // Закон №37: offline → overlay вместо toast; online → toast.
                if (window._ensureOnline()) showToast(t('heroDeleteFail'));
                btn.disabled = false;
                btn.style.opacity = '';
              });
            });
          });
      }

      // ── Совместимость: реальный балл из бэкенда (не хэш) ─────────────────
      // GET /api/heroes/compat → { ok:true, scores:{ "<clientId>":48-99 } }. Не
      // блокирует рендер списка (тот уже отрисован) — баллы дорисовываются,
      // когда придут. №36 (таймаут) + №37 (тихий провал, без error-текста).
      async function _fetchHeroCompatScores() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base || !hasAuth()) return;
        try {
          var resp = await fetchWithTimeout(base + '/api/heroes/compat', { headers: getAuthHeaders() }, 20000);
          var json = await resp.json().catch(function() { return {}; });
          window._heroCompatScores = (json && json.ok && json.scores) || {};
          if (Array.isArray(heroesCache)) renderHeroesListFromData({ clients: heroesCache });
        } catch (e) {
          // Закон №37: тихий провал — бейджи остаются скрытыми, без error-текста.
        }
      }

      // Раскрытие/схлопывание карточки (картотека v5: класс .open)
      window.toggleHeroCard = function(id) {
        var card = document.getElementById('hcard-' + id);
        if (!card) return;
        card.classList.toggle('open');
      };

      // ── Форма героя ───────────────────────────────────────────────────────
      function openHeroForm(h) {
        var cabinet = document.getElementById('masterCabinet');
        var formWrap = document.getElementById('heroFormWrap');
        var titleEl = document.getElementById('heroFormTitle');
        if (cabinet) cabinet.style.display = 'none';
        if (!formWrap) return;
        formWrap.style.display = 'flex';
        try { document.body.classList.add('hero-form-open'); } catch(_) {} // прячет нижний nav (форма поверх, эталон)
        if (h && h.id) {
          editingHeroId = h.id;
          if (titleEl) titleEl.textContent = t('heroEditTitle');
        } else {
          editingHeroId = null;
          if (titleEl) titleEl.textContent = t('heroAddTitle');
        }
        document.getElementById('heroName').value = (h && h.name) || '';
        document.getElementById('heroRelationship').value = (h && h.relationship) || '';
        document.getElementById('heroBirthdate').value = (h && h.birth_date) || '';
        if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('heroBirthdate');
        document.getElementById('heroBirthtime').value = ((h && h.birth_time) || '').substring(0, 5);
        // Алла 16.05.2026 («Лаборатория без времени → искажение информации»):
        // если у существующего героя в БД birth_time=null и birthtime_unknown=false
        // (старые записи до Batch 49453da4), при редактировании юзер видел пустое поле
        // времени без галочки → думал «надо указать» → ставил РАНДОМНОЕ время →
        // astro snapshot строился по неверному времени → искажение интерпретации.
        // Defensive: если у героя нет birth_time, ВСЕГДА ставим галочку «Не знаю».
        var _heroNoTimeEdit = h && (!h.birth_time || !String(h.birth_time).trim());
        document.getElementById('heroBirthtimeUnknown').checked = !!(h && h.birthtime_unknown) || !!_heroNoTimeEdit;
        // Disable поле если галочка checked — UI consistency
        var _heroBtEdit = document.getElementById('heroBirthtime');
        if (_heroBtEdit && document.getElementById('heroBirthtimeUnknown').checked) {
          _heroBtEdit.disabled = true;
        } else if (_heroBtEdit) {
          _heroBtEdit.disabled = false;
        }
        document.getElementById('heroGender').value = (h && h.gender) || '';
        document.getElementById('heroStyle').value = (h && h.preferred_style) || '';
        document.getElementById('heroNotes').value = (h && h.notes) || '';
        if (typeof window._hfSyncChips === 'function') window._hfSyncChips(); // подсветить чипы роли/пола из скрытых значений + save-disable по имени (форма-эталон)
        // Город: восстанавливаем значение и состояние чекмарка
        var hpInput = document.getElementById('heroBirthplace');
        var hpWrap  = document.getElementById('heroBirthplaceWrap');
        var hpCheck = document.getElementById('heroBirthplaceCheck');
        var hpHint  = document.getElementById('heroBirthplaceHint');
        var birthPlaceVal = (h && h.birth_place) || '';
        if (hpInput) hpInput.value = birthPlaceVal;
        if (hpWrap)  hpWrap.classList.toggle('has-place', !!birthPlaceVal);
        if (hpCheck) hpCheck.setAttribute('aria-hidden', birthPlaceVal ? 'false' : 'true');
        if (hpInput && birthPlaceVal) hpInput.setAttribute('data-place-selected','1');
        else if (hpInput) hpInput.removeAttribute('data-place-selected');
        if (hpHint)  hpHint.style.display = 'none';
        // Batch 10.10 (отчёт 7271881 MacOS): сохраняем снапшот значений при
        // открытии формы для проверки несохранённых изменений при закрытии.
        try {
          window._initialHeroFormState = {
            name: document.getElementById('heroName').value,
            relationship: document.getElementById('heroRelationship').value,
            birth_date: document.getElementById('heroBirthdate').value,
            birth_time: document.getElementById('heroBirthtime').value,
            birthtime_unknown: !!document.getElementById('heroBirthtimeUnknown').checked,
            gender: document.getElementById('heroGender').value,
            preferred_style: document.getElementById('heroStyle').value,
            notes: document.getElementById('heroNotes').value,
            birth_place: (hpInput && hpInput.value) || '',
          };
        } catch (_) { window._initialHeroFormState = null; }
        formWrap.scrollTop = 0;
      }

      // Batch 10.10 (7271881): сравнение текущих значений со снапшотом.
      function _hasUnsavedHeroChanges() {
        var s = window._initialHeroFormState;
        if (!s) return false;
        try {
          var current = {
            name: document.getElementById('heroName').value,
            relationship: document.getElementById('heroRelationship').value,
            birth_date: document.getElementById('heroBirthdate').value,
            birth_time: document.getElementById('heroBirthtime').value,
            birthtime_unknown: !!document.getElementById('heroBirthtimeUnknown').checked,
            gender: document.getElementById('heroGender').value,
            preferred_style: document.getElementById('heroStyle').value,
            notes: document.getElementById('heroNotes').value,
            birth_place: (document.getElementById('heroBirthplace') || {}).value || '',
          };
          var keys = Object.keys(current);
          for (var i = 0; i < keys.length; i++) {
            if (s[keys[i]] !== current[keys[i]]) return true;
          }
        } catch (_) {}
        return false;
      }

      async function closeHeroForm(opts) {
        // Batch 10.10 (7271881): проверка несохранённых изменений.
        // opts.force=true пропускает (для use из heroFormSave после успешного сохранения).
        // VK Testers 7274955 (14.05.2026): «появляется некорректное окно
        // подтверждения действия на стороннем сайте». Раньше confirm(msg) —
        // браузерный диалог с заголовком «www.yupsoul.ru говорит» — выглядел
        // подозрительно. Сейчас inline-модал YupSoul-стиля + локализация.
        if (!(opts && opts.force) && _hasUnsavedHeroChanges()) {
          var msg = (typeof t === 'function' ? t('confirmUnsavedExit') : null) || 'У вас несохранённые изменения. Выйти?';
          // VK Testers 7275175 (MacOS светлая тема, 15.05.2026): inline модал
          // unsaved-confirm имел только тёмный стиль. На светлой теме выглядел
          // как «тёмный прямоугольник без контента». Добавляем theme detection.
          var ok = await new Promise(function(resolve) {
            var existing = document.getElementById('_inAppUnsavedConfirm');
            if (existing) existing.remove();
            var ov = document.createElement('div');
            ov.id = '_inAppUnsavedConfirm';
            var isLight = document.body.classList.contains('theme-light') || document.documentElement.classList.contains('is-vk-light') || document.documentElement.classList.contains('is-ok-light');
            var modBg = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(20,15,40,0.97)';
            var modBorder = isLight ? 'rgba(26,26,46,0.10)' : 'rgba(167,139,250,0.25)';
            var modText = isLight ? '#1a1a2e' : 'rgba(255,255,255,0.92)';
            var dangerColor = isLight ? '#dc2626' : '#fca5a5';
            ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
            var yesLabel = (typeof t === 'function' ? (t('confirmExit') || 'Выйти') : 'Выйти');
            var cancelLabel = (typeof t === 'function' ? (t('confirmStay') || 'Остаться') : 'Остаться');
            ov.innerHTML = '<div style="max-width:360px;width:100%;background:' + modBg + ';border:1px solid ' + modBorder + ';border-radius:18px;padding:22px;text-align:center;color:' + modText + ';font-family:inherit;">' +
              '<p style="font-size:0.92rem;line-height:1.5;margin:0 0 18px;color:' + modText + ';">' + String(msg).replace(/</g,'&lt;') + '</p>' +
              '<div style="display:flex;gap:10px;justify-content:center;">' +
              '<button type="button" id="_uceOk" style="flex:1;padding:11px 20px;border-radius:9999px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:' + dangerColor + ';font-size:0.88rem;cursor:pointer;font-family:inherit;">' + yesLabel + '</button>' +
              '<button type="button" id="_uceCancel" style="flex:1;padding:11px 20px;border-radius:9999px;background:linear-gradient(135deg,#a78bfa,#ec4899);border:none;color:#fff;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">' + cancelLabel + '</button>' +
              '</div></div>';
            document.body.appendChild(ov);
            var done = function(val) { try { ov.remove(); } catch(_){} resolve(val); };
            document.getElementById('_uceOk').onclick = function() { done(true); };
            document.getElementById('_uceCancel').onclick = function() { done(false); };
            ov.onclick = function(e) { if (e.target === ov) done(false); };
          });
          if (!ok) return false;
        }
        var cabinet = document.getElementById('masterCabinet');
        var formWrap = document.getElementById('heroFormWrap');
        if (formWrap) formWrap.style.display = 'none';
        try { document.body.classList.remove('hero-form-open'); } catch(_) {}
        if (cabinet) cabinet.style.display = 'block';
        editingHeroId = null;
        window._initialHeroFormState = null;
        // VK Testers 7278002 (Тамара MacOS 17.05): после успешного сохранения
        // (force=true) поля формы не очищались — Safari quirk с input[type=date]:
        // .value='' не всегда сбрасывает internal state. При следующем
        // openHeroForm(null) пользователь видел старые данные.
        // Фикс: явная очистка ВСЕХ полей формы при закрытии.
        try {
          // VK Testers 7278002 ПЕРЕОТКРЫТ-2 (Тамара MacOS 17.05 17:04):
          // первый фикс (Batch 10.135) очищал только hidden inputs, НЕ
          // custom date selects (День/Месяц/Год). Тамара видела что
          // День=3, Год=2003 оставались от предыдущего героя.
          // Расширили список: + heroBirthdateDay/Month/Year + custom dropdowns.
          var _fld_ids = ['heroName','heroRelationship','heroBirthdate','heroBirthdateDay','heroBirthdateMonth','heroBirthdateYear','heroBirthtime','heroBirthplace','heroGender','heroBirthtimeUnknown'];
          _fld_ids.forEach(function(fid) {
            var el = document.getElementById(fid);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') { el.checked = false; }
            else { el.value = ''; el.removeAttribute('value'); }
            el.removeAttribute('data-lat'); el.removeAttribute('data-lon');
            el.removeAttribute('data-place-selected');
            // Триггер change для custom-select wrappers (cs-display) чтобы
            // visible UI обновился
            try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
          });
          // Также сбрасываем визуальные wrap-классы
          var _bdw = document.getElementById('heroBirthdateWrap'); if (_bdw) _bdw.classList.remove('has-date');
          var _bpw = document.getElementById('heroBirthplaceWrap'); if (_bpw) _bpw.classList.remove('has-place');
          // Reset custom-select display labels (cs-display) к placeholder
          var _csW = document.querySelectorAll('#heroFormWrap .cs-wrap');
          for (var _i = 0; _i < _csW.length; _i++) {
            var _disp = _csW[_i].querySelector('.cs-display');
            if (_disp) {
              var _ph = _disp.getAttribute('data-placeholder') || _disp.getAttribute('data-i18n');
              if (_ph) _disp.textContent = (typeof t === 'function' ? t(_ph) : _ph) || '';
            }
          }
        } catch(_) {}
        // Алла 13.06: форму контакта открыли с формы песни («+ Добавить контакт») →
        // «Отмена»/«←» возвращают НА ФОРМУ, а не в список Контактов (который не открывали).
        if (window._heroFormReturnTo) {
          var _hfrt = window._heroFormReturnTo; window._heroFormReturnTo = null;
          if (typeof goToPage === 'function') goToPage(_hfrt);
          return true;
        }
      }

      var addHeroBtn = document.getElementById('addHeroBtn');
      if (addHeroBtn) addHeroBtn.addEventListener('click', function() { window._heroFormReturnTo = null; openHeroForm(null); });
      // Feature #65: «+ Добавить контакт» из селектора «Для кого генерируем?» на форме.
      // goToHeroesFrom('formPage') ставит returnToPage='formPage' → «Назад» на heroesPage
      // вернёт на форму, где formPage-хук переподтянет loadForWhoSelect() и новый контакт
      // появится в списке. openHeroForm(null) открывает пустую форму нового контакта.
      var forWhoAddContactBtn = document.getElementById('forWhoAddContactBtn');
      if (forWhoAddContactBtn) forWhoAddContactBtn.addEventListener('click', function() {
        // Алла 13.06: пришли с формы песни → «Отмена»/«←» в форме контакта должны вернуть
        // НА ФОРМУ, а не вывалить в список Контактов (который юзер не открывал).
        window._heroFormReturnTo = 'formPage';
        goToHeroesFrom('formPage');
        setTimeout(function() { if (typeof openHeroForm === 'function') openHeroForm(null); }, 250);
      });
      var heroFormCancel = document.getElementById('heroFormCancel');
      if (heroFormCancel) heroFormCancel.addEventListener('click', closeHeroForm);

      // Batch 10.9 (отчёт 7271873 MacOS): локальный hint для формы героя.
      // Раньше _showFormHint писал в #submitHint (форма песни) — юзер не видел.
      function _heroFormShowHint(msg) {
        var h = document.getElementById('heroFormHint');
        if (!h) return;
        h.textContent = msg;
        h.style.display = 'block';
        // Авто-скрытие через 4 сек
        clearTimeout(window._heroFormHintTimer);
        window._heroFormHintTimer = setTimeout(function(){ h.style.display = 'none'; }, 4000);
        // Подсветить поле «Имя» если оно пустое
        var nameEl = document.getElementById('heroName');
        if (nameEl && !nameEl.value.trim()) {
          nameEl.style.borderColor = '#ec4899';
          nameEl.addEventListener('input', function _clr() {
            nameEl.style.borderColor = '';
            nameEl.removeEventListener('input', _clr);
          });
          nameEl.focus();
        }
      }
      var heroFormSave = document.getElementById('heroFormSave');
      if (heroFormSave) heroFormSave.addEventListener('click', function() {
        var name = (document.getElementById('heroName') || {}).value.trim();
        if (!name) { _heroFormShowHint(typeof t === 'function' ? t('alertNameShort') : 'Укажи имя героя'); return; }
        heroFormSave.disabled = true;
        heroFormSave.textContent = t('btnSaving');
        var payload = {
          initData: (tg && tg.initData) || '',
          name: name,
          relationship: (document.getElementById('heroRelationship') || {}).value || null,
          birth_date: (document.getElementById('heroBirthdate') || {}).value || null,
          birth_time: (document.getElementById('heroBirthtime') || {}).value || null,
          birth_place: (document.getElementById('heroBirthplace') || {}).value.trim() || null,
          birthtime_unknown: (document.getElementById('heroBirthtimeUnknown') || {}).checked,
          gender: (document.getElementById('heroGender') || {}).value || null,
          preferred_style: (document.getElementById('heroStyle') || {}).value.trim() || null,
          notes: (document.getElementById('heroNotes') || {}).value.trim() || null
        };
        var apiCall = editingHeroId
          ? heroesApi('/heroes/' + editingHeroId, { method: 'PATCH', body: payload })
          : heroesApi('/heroes', { method: 'POST', body: payload });
        apiCall.then(function() {
          // Batch 10.10 (7271881): force:true — пропускаем confirm после успешного сохранения
          closeHeroForm({ force: true });
          loadHeroesList();
        }).catch(function(e) {
          // Закон №37: если offline — overlay (а не toast). Если online — toast.
          if (!window._ensureOnline()) return;
          // VK Testers 7274401 (Windows EN, 14.05.2026): локализация валидационных
          // ошибок героя. Backend возвращает error_code (errInvalidName / etc),
          // мы храним его в e.code (см. heroesApi). Локализуем через t() на
          // UI-языке. Fallback на raw message если ключа нет.
          var localizedMsg = null;
          if (e && e.code && typeof t === 'function') {
            var maybe = t(e.code, e.params || {});
            if (maybe && maybe !== e.code) localizedMsg = maybe;
          }
          if (localizedMsg) { showToast(localizedMsg); return; }
          // Backend validation messages (heroesApi.js + validation.js) — короткие, на русском,
          // не начинаются с HTTP status. Если message короткое (≤120ch) И не похоже на сетевую
          // ошибку — это validation, показываем его как есть.
          var emsg = (e && e.message) || '';
          var isNetworkErr = /fetch|network|Failed to fetch|timeout|превышено время|AbortError/i.test(emsg);
          var isValidationMsg = emsg && emsg.length > 0 && emsg.length <= 120 && !isNetworkErr && !/^HTTP|^\d{3}\s/.test(emsg);
          if (isValidationMsg) {
            showToast(emsg);
          } else {
            showToast(typeof t === 'function' ? (t('heroSaveFail') || 'Не сохранилось. Повтори, пожалуйста.') : 'Не сохранилось. Повтори, пожалуйста.');
          }
        }).finally(function() {
          heroFormSave.disabled = false;
          heroFormSave.textContent = typeof t === 'function' ? t('btnSave') : 'Сохранить';
        });
      });

      var heroesSearchBtn = document.getElementById('heroesSearchBtn');
      var heroesSearchInput = document.getElementById('heroesSearch');
      // Batch 10.10 (7271919): включать кнопку «Найти» только если input не пуст
      // И есть герои для поиска (heroesCache.length > 0 после loadHeroesList).
      function _updateHeroesSearchBtnState() {
        if (!heroesSearchBtn) return;
        var hasQuery = !!(heroesSearchInput && heroesSearchInput.value.trim());
        var hasHeroes = Array.isArray(heroesCache) && heroesCache.length > 0;
        heroesSearchBtn.disabled = !(hasQuery && hasHeroes);
        heroesSearchBtn.style.opacity = heroesSearchBtn.disabled ? '0.5' : '1';
        heroesSearchBtn.style.cursor = heroesSearchBtn.disabled ? 'not-allowed' : 'pointer';
      }
      window._updateHeroesSearchBtnState = _updateHeroesSearchBtnState;
      if (heroesSearchBtn) heroesSearchBtn.addEventListener('click', function() {
        if (heroesSearchBtn.disabled) return;
        loadHeroesList();
      });
      // Картотека v5: крестик-очистка в поле поиска (.search-x).
      var heroesSearchX = document.getElementById('heroesSearchX');
      function _updateHeroesSearchX() {
        if (heroesSearchX) heroesSearchX.hidden = !(heroesSearchInput && (heroesSearchInput.value || '').trim());
      }
      if (heroesSearchX) heroesSearchX.addEventListener('click', function() {
        if (!heroesSearchInput) return;
        heroesSearchInput.value = '';
        _updateHeroesSearchX();
        loadHeroesList();
        heroesSearchInput.focus();
      });

      // Топбар эталона: логотип-мандала (программный SVG) + кнопка языка RU.
      (function _heroesTopbarSetup(){
        var logo = document.getElementById('heroesLogo');
        if (logo && !logo.firstChild) {
          var ns = 'http://www.w3.org/2000/svg';
          var svg = document.createElementNS(ns,'svg');
          svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('width','34'); svg.setAttribute('height','34');
          var defs = document.createElementNS(ns,'defs'); var lg = document.createElementNS(ns,'linearGradient');
          var gid = 'hmg' + (Date.now ? (Date.now()%99999) : 12345);
          lg.setAttribute('id',gid); lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1');
          [['0','#3fe0e0'],['.5','#9b6bff'],['1','#ff5db1']].forEach(function(s){var st=document.createElementNS(ns,'stop');st.setAttribute('offset',s[0]);st.setAttribute('stop-color',s[1]);lg.appendChild(st);});
          defs.appendChild(lg); svg.appendChild(defs);
          var g = document.createElementNS(ns,'g'); g.setAttribute('fill','none'); g.setAttribute('stroke','url(#'+gid+')'); g.setAttribute('stroke-width','3.4'); g.setAttribute('stroke-linecap','round');
          for (var i=0;i<6;i++){var e=document.createElementNS(ns,'ellipse');e.setAttribute('cx','50');e.setAttribute('cy','50');e.setAttribute('rx','13');e.setAttribute('ry','30');e.setAttribute('transform','rotate('+(i*30)+' 50 50)');e.setAttribute('opacity',i%2?'0.55':'0.95');g.appendChild(e);}
          var c = document.createElementNS(ns,'circle'); c.setAttribute('cx','50'); c.setAttribute('cy','50'); c.setAttribute('r','7.5'); g.appendChild(c);
          svg.appendChild(g); logo.appendChild(svg);
        }
        // Переключатель языка картотеки — теперь выпадающий список (dropdown init + applyTranslations sync heroesLangCurrent).
        // Цикл-хендлер убран: «красота картотеки + удобство главной» (H, Алла 26.06).
      })();

      if (heroesSearchInput) {
        // Живой поиск: список фильтруется по мере ввода (серверный ?search=),
        // с debounce 300мс чтобы не дёргать API на каждую букву. Отдельной
        // кнопки «Найти» больше нет. Пустое поле → полный список (loadHeroesList
        // сам шлёт запрос без ?search).
        var _heroesSearchTimer = null;
        heroesSearchInput.addEventListener('input', function() {
          if (typeof window._updateHeroesSearchBtnState === 'function') window._updateHeroesSearchBtnState();
          _updateHeroesSearchX();
          if (_heroesSearchTimer) clearTimeout(_heroesSearchTimer);
          _heroesSearchTimer = setTimeout(function() { loadHeroesList(); }, 300);
        });
        // Enter — немедленный поиск (без ожидания debounce)
        heroesSearchInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            if (_heroesSearchTimer) clearTimeout(_heroesSearchTimer);
            loadHeroesList();
          }
        });
      }
      var heroesBackBtn = document.getElementById('heroesBackBtn');
      if (heroesBackBtn) heroesBackBtn.addEventListener('click', function() {
        var formWrap = document.getElementById('heroFormWrap');
        if (formWrap && formWrap.style.display !== 'none') { closeHeroForm(); return; }
        goBack();
      });
      var todayHero = new Date();
      var heroBirthdateEl = document.getElementById('heroBirthdate');
      if (heroBirthdateEl) {
        heroBirthdateEl.max = todayHero.toISOString().split('T')[0];
        heroBirthdateEl.min = '0100-01-01';
      }

      // ── Автодополнение города для формы героя ────────────────────────────
      (function() {
        var hInput = document.getElementById('heroBirthplace');
        var hSugg  = document.getElementById('heroBirthplaceSuggestions');
        var hWrap  = document.getElementById('heroBirthplaceWrap');
        var hCheck = document.getElementById('heroBirthplaceCheck');
        var hHint  = document.getElementById('heroBirthplaceHint');
        if (!hInput) return;
        var hDebounce = null;
        var hLastQ = '';
        var _hPlacesClientCache = {};
        var _hFetchAbort = null;

        function hHideSuggestions() {
          if (hSugg) { hSugg.innerHTML = ''; hSugg.setAttribute('aria-hidden','true'); hSugg.style.display = 'none'; }
        }
        function hSelectPlace(displayName, lat, lon) {
          hInput.value = (displayName || '').trim();
          hInput.setAttribute('data-place-selected','1');
          if (lat != null) hInput.setAttribute('data-lat', String(lat));
          if (lon != null) hInput.setAttribute('data-lon', String(lon));
          if (hWrap)  hWrap.classList.add('has-place');
          if (hCheck) hCheck.setAttribute('aria-hidden','false');
          if (hHint)  hHint.style.display = 'none';
          hHideSuggestions();
        }
        function hClearSelection() {
          hInput.removeAttribute('data-place-selected');
          hInput.removeAttribute('data-lat');
          hInput.removeAttribute('data-lon');
          if (hWrap)  hWrap.classList.remove('has-place');
          if (hCheck) hCheck.setAttribute('aria-hidden','true');
        }
        var _hFetchRetries = 0;
        function hFetchPlaces(q) {
          if (!q || q.length < 3) { if (!window._cityMinCharsHint('heroBirthplaceSuggestions', q)) hHideSuggestions(); return; }
          var cacheKey = q.toLowerCase();
          if (_hPlacesClientCache[cacheKey]) { hRenderList(_hPlacesClientCache[cacheKey]); return; }
          if (_hFetchAbort) { try { _hFetchAbort.abort(); } catch(e){} }
          _hFetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var url = typeof getPlacesSearchUrl === 'function' ? getPlacesSearchUrl(q) : (typeof nominatimUrlFor === 'function' ? nominatimUrlFor(q) : ('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=8&addressdetails=1'));
          var headers = { 'Accept': 'application/json' };
          if (url.indexOf('nominatim') !== -1) { headers['Accept-Language'] = window.currentLang || 'ru'; headers['User-Agent'] = 'YupSoulMiniApp/1.0'; }
          var fetchOpts = { headers: headers };
          if (_hFetchAbort) fetchOpts.signal = _hFetchAbort.signal;
          function hRenderList(list) {
            if (hLastQ !== q || !hSugg) return;
            hSugg.innerHTML = '';
            (list || []).forEach(function(item) {
              var li = document.createElement('li');
              var main = item.display_name || (item.address && (item.address.city || item.address.town || item.address.village || item.address.state || item.address.country)) || '';
              var country = item.address && item.address.country ? item.address.country : '';
              li.textContent = main;
              if (country) {
                var sp = document.createElement('div');
                sp.className = 'place-type';
                sp.textContent = country + (item.address.country_code ? ' (' + item.address.country_code.toUpperCase() + ')' : '');
                li.appendChild(sp);
              }
              var lat = item.lat; var lon = item.lon; var placeId = item.place_id; var yandexUri = item.yandex_uri;
              function onSelectH() {
                if ((placeId || yandexUri) && (lat == null || lat === undefined)) {
                  if (typeof fetchPlaceDetails === 'function') {
                    var params = placeId ? { place_id: placeId } : { yandex_uri: yandexUri };
                    fetchPlaceDetails(params, function(name, la, lo) { hSelectPlace(name, la, lo); hHideSuggestions(); }, hHideSuggestions);
                  } else hHideSuggestions();
                } else hSelectPlace(item.display_name || main, item.lat, item.lon);
              }
              li.addEventListener('mousedown', function(e) { e.preventDefault(); onSelectH(); });
              li.addEventListener('click', onSelectH);
              hSugg.appendChild(li);
            });
            hSugg.style.display = (list && list.length) ? 'block' : 'none';
            hSugg.setAttribute('aria-hidden', (list && list.length) ? 'false' : 'true');
          }
          fetch(url, fetchOpts)
            .then(function(r){
              if (r.status === 429 || r.status === 502 || r.status === 503) {
                if (_hFetchRetries < 2) {
                  _hFetchRetries++;
                  setTimeout(function(){ hFetchPlaces(q); }, 1500 * _hFetchRetries);
                } else {
                  _hFetchRetries = 0;
                  hHideSuggestions();
                }
                return null;
              }
              _hFetchRetries = 0;
              return r.json();
            })
            .then(function(list){
              if (!list) return;
              var arr = Array.isArray(list) ? list : [];
              if (arr.length === 0 && url.indexOf('nominatim') === -1) {
                placesNominatimFallback(q, function(narr){ _hPlacesClientCache[cacheKey] = narr; hRenderList(narr); });
                return;
              }
              _hPlacesClientCache[cacheKey] = arr;
              hRenderList(arr);
            })
            .catch(function(err){
              if (err && err.name === 'AbortError') return;
              if (url.indexOf('nominatim') === -1 && typeof nominatimUrlFor === 'function') {
                fetch(nominatimUrlFor(q), { headers: { 'Accept': 'application/json', 'Accept-Language': (window.currentLang || 'ru'), 'User-Agent': 'YupSoulMiniApp/1.0' } })
                  .then(function(r) { return r.ok ? r.json() : []; })
                  .then(function(list) { var arr = Array.isArray(list) ? list : []; _hPlacesClientCache[cacheKey] = arr; hRenderList(arr); })
                  .catch(function() { hHideSuggestions(); });
              } else {
                hHideSuggestions();
              }
            });
        }
        hInput.addEventListener('input', function(){
          var v = hInput.value.trim();
          hClearSelection();
          if (v) { hLastQ = v; clearTimeout(hDebounce); hDebounce = setTimeout(function(){ hFetchPlaces(v); }, 600); }
          else hHideSuggestions();
        });
        hInput.addEventListener('focus', function(){
          if (hHint) hHint.style.display = 'none';
          var v = hInput.value.trim();
          var isSelected = !!hInput.getAttribute('data-place-selected');
          if (!isSelected && v && v.length >= 3) { hLastQ = v; hFetchPlaces(v); }
        });
        hInput.addEventListener('blur', function(){
          setTimeout(hHideSuggestions, 300);
        });
      })();

      // ── Быстрый запуск из карточки героя ─────────────────────────────────
      // Хранит данные heroRequest пока loadForWhoSelect не завершился асинхронно
      var _pendingHeroRequest = null;
      // Отдельное отслеживание выбранного героя для single-режима (защита от перезаписи профиля)
      // loadForWhoSelect() перестраивает <select>, уничтожая pending option → forWho.value теряется
      var _selectedHeroId = null;
      // ID героя, выбранного из Лаборатории для couple-режима (person2)
      var _selectedLabHeroId = null;

      // Заполняет ТОЛЬКО поля второго человека (#name2 …) из карточки/self-объекта.
      // Не трогает person1 — нужно для единого пикера «Про двоих» (Алла 05.07): выбор
      // второго человека не должен переписывать первого. hero может быть self-объектом
      // (_buildSelfHero, id '__self') — форма полей та же.
      function fillPerson2FromHero(hero) {
        if (!hero) return;
        if (typeof clearPerson2Fields === 'function') clearPerson2Fields();
        _selectedLabHeroId = hero.id || null;
        // Зеркалим в window — пикер ПЕРВОГО человека (12-synastry) читает window._selectedLabHeroId
        // чтобы исключить уже выбранного вторым (и наоборот).
        window._selectedLabHeroId = _selectedLabHeroId;
        var n2   = document.getElementById('name2');
        var bd2  = document.getElementById('birthdate2');
        var bt2  = document.getElementById('birthtime2');
        var unk2 = document.getElementById('unknown2');
        var g2   = document.getElementById('gender2');
        var bp2  = document.getElementById('birthplace2');

        if (n2)   n2.value   = hero.name || '';
        if (bd2)  { bd2.value = (hero.birth_date || '').substring(0, 10); if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate2'); }
        if (bt2)  bt2.value  = (hero.birth_time || '').substring(0, 5);
        // Defensive: если у героя нет birth_time — auto-unknown (см. fillFormFromHero)
        var _heroNoTime2 = !hero.birth_time || !String(hero.birth_time).trim();
        if (unk2) unk2.checked = !!hero.birthtime_unknown || _heroNoTime2;
        if (bt2 && unk2 && unk2.checked) { bt2.disabled = true; bt2.value = ''; }
        if (g2 && hero.gender) {
          // Пол пишем только непустой — `|| ''` затирал выбранный руками пол (Светлана 07.08)
          g2.value = hero.gender;
          // VK Testers 7278526: после программной установки .value у <select> нужен
          // change-event + sync, иначе кастомная плашка .cs-display пола пуста и
          // валидация просит «выбери пол второго» повторно (Алла 05.07).
          try { g2.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        }
        var p2rel = document.getElementById('person2Relationship');
        if (p2rel) p2rel.value = hero.relationship || '';
        if (bp2) {
          bp2.value = hero.birth_place || '';
          // Сброс координат перед установкой новых (защита от утечки данных предыдущего героя)
          bp2.removeAttribute('data-lat');
          bp2.removeAttribute('data-lon');
          if (hero.birth_place && String(hero.birth_place).trim().length >= 3) {
            bp2.setAttribute('data-from-profile', '1');
            bp2.setAttribute('data-place-selected', '1');
            if (hero.birth_lat) bp2.setAttribute('data-lat', String(hero.birth_lat));
            if (hero.birth_lon) bp2.setAttribute('data-lon', String(hero.birth_lon));
            var bw2 = document.getElementById('birthplace2Wrap');
            if (bw2) bw2.classList.add('has-place');
            var bch2 = document.getElementById('birthplace2Check');
            if (bch2) bch2.setAttribute('aria-hidden', 'false');
            var bHint2 = document.getElementById('birthplace2Hint');
            if (bHint2) bHint2.style.display = 'none';
          } else {
            bp2.removeAttribute('data-from-profile');
            bp2.removeAttribute('data-place-selected');
            var bw2b = document.getElementById('birthplace2Wrap'); if (bw2b) bw2b.classList.remove('has-place');
            var bch2b = document.getElementById('birthplace2Check'); if (bch2b) bch2b.setAttribute('aria-hidden', 'true');
            var bHint2b = document.getElementById('birthplace2Hint'); if (bHint2b) bHint2b.style.display = '';
          }
        }
        if (typeof updateP2AccordionSummary === 'function') updateP2AccordionSummary();
        var btnTextEl2 = document.getElementById('pickFromLabBtnText');
        if (btnTextEl2) btnTextEl2.textContent = (typeof t === 'function' ? t('pickFromLabSelected') : 'Выбрано: ') + (hero.name || '');
        // Форсируем sync всех кастомных дропдаунов (пол/дата второго)
        try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch(_) {}
      }
      window.fillPerson2FromHero = fillPerson2FromHero;

      function _applyHeroRequest(hero, mode) {
        setMode(mode);
        if (mode === 'couple') {
          // Скрываем forWhoWrap (может быть показан async-колбэком loadForWhoSelect)
          var fww = document.getElementById('forWhoWrap');
          if (fww) fww.style.display = 'none';

          // Предзаполняем person1 профилем текущего пользователя (вход «песня с карточки» =
          // герой второй человек, я — первый). Единый пикер потом позволит сменить обоих.
          fillFormFromProfile(userProfile || (tg && tg.initDataUnsafe && tg.initDataUnsafe.user));
          // Чтобы не требовало «выбери город из списка»: если у person1 уже есть город (3+ символов), считаем его выбранным
          var bp1 = document.getElementById('birthplace');
          if (bp1 && bp1.value.trim().length >= 3) {
            if (!bp1.getAttribute('data-place-selected')) {
              bp1.setAttribute('data-place-selected', '1');
              bp1.setAttribute('data-from-profile', '1');
            }
            var bw1 = document.getElementById('birthplaceWrap');
            if (bw1) bw1.classList.add('has-place');
            var bch1 = document.getElementById('birthplaceCheck');
            if (bch1) bch1.setAttribute('aria-hidden', 'false');
          }
          // Всегда скрываем подсказку для person1 при предзаполнении
          var bHint1 = document.getElementById('birthplaceHint');
          if (bHint1) bHint1.style.display = 'none';

          // Заполняем поля второго человека из карточки героя (не трогая person1)
          fillPerson2FromHero(hero);
          // Собираем контекст пары для запроса (всегда заменяем автосгенерированный текст)
          (function() {
            var reqEl = document.getElementById('request');
            if (!reqEl) return;
            // Заменяем если пусто ИЛИ текст был автосгенерирован (начинается с «Создать совместную»)
            var isAutoText = !reqEl.value || reqEl.value.indexOf('Создать совместную') === 0;
            if (!isAutoText) return;
            var parts = ['Создать совместную песню для нас двоих'];
            if (hero.relationship) parts.push('Кем является ' + hero.name + ' для меня: ' + hero.relationship);
            if (hero.preferred_style) parts.push('Предпочтительный стиль: ' + hero.preferred_style);
            if (hero.notes) parts.push('Особенности и контекст: ' + hero.notes);
            reqEl.value = parts.join('. ');
          })();

          // (сводка аккордеона + текст кнопки уже выставлены в fillPerson2FromHero)

          // Скроллим к secondPersonForm чтобы пользователь видел заполненные поля
          setTimeout(function() {
            var sf = document.getElementById('secondPersonForm');
            if (sf) try { sf.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
          }, 100);

        } else {
          // ── Режим «соло»: герой = person1 ──
          _selectedLabHeroId = null;
          _selectedHeroId = hero.id || null;
          var forWhoEl = document.getElementById('forWho');
          if (forWhoEl && hero.id) {
            if (!forWhoEl.querySelector('option[value="' + hero.id + '"]')) {
              var pendingOpt = document.createElement('option');
              pendingOpt.value = hero.id;
              pendingOpt.textContent = hero.name || hero.id;
              pendingOpt.setAttribute('data-pending', '1');
              forWhoEl.appendChild(pendingOpt);
            }
            forWhoEl.value = hero.id;
          }
          fillFormFromHero(hero);
          // Собираем контекст героя для запроса — relationship + preferred_style + notes
          (function() {
            var reqEl = document.getElementById('request');
            if (!reqEl) return;
            // Заменяем если пусто ИЛИ текст был автосгенерирован (начинается с «Создать персональную»)
            var isAutoText = !reqEl.value || reqEl.value.indexOf('Создать персональную') === 0;
            if (!isAutoText) return;
            var parts = ['Создать персональную песню'];
            if (hero.relationship) {
              // Batch 10.27 (отчёт 7273384 Ольга Михайловна Windows): «Это моя наставник»
              // неверно (роль муж.р., местоимение жен.р.). Маппинг родов из списка
              // heroRelationship options: муж.р. → «Это мой», жен.р. → «Это моя», ср.р. →
              // «Это мой» (default). Также «другое»/«коллега» — нейтральное → без местоимения.
              var rel = (hero.relationship || '').toLowerCase().trim();
              var masc = ['отец', 'папа', 'сын', 'брат', 'дедушка', 'муж', 'друг', 'наставник', 'любимый человек'];
              var fem  = ['мать', 'мама', 'дочь', 'сестра', 'бабушка', 'жена', 'подруга'];
              var pronoun = masc.indexOf(rel) >= 0 ? 'Это мой ' : (fem.indexOf(rel) >= 0 ? 'Это моя ' : '');
              if (pronoun) parts.push(pronoun + hero.relationship + ' — ' + (hero.name || ''));
              else parts.push(hero.relationship + ' — ' + (hero.name || '')); // нейтральное (коллега/другое)
            }
            if (hero.preferred_style) parts.push('Предпочтительный стиль: ' + hero.preferred_style);
            if (hero.notes) parts.push('Особенности и контекст: ' + hero.notes);
            if (parts.length > 1) reqEl.value = parts.join('. ');
          })();
        }
      }

      function startHeroRequest(opts) {
        var hero = opts.hero || {};
        var mode = opts.mode || 'single';

        _pendingHeroRequest = { hero: hero, mode: mode };
        goToPage('formPage');

        // Применяем немедленно
        _applyHeroRequest(hero, mode);
        // И повторяем через 600мс — после того как loadForWhoSelect завершит async-запрос
        // и попытается перезаписать forWhoWrap/heroesCache
        // Повтор через 600мс — на случай, если loadForWhoSelect перезаписал форму.
        // ОДНОРАЗОВО: после применения гасим _pendingHeroRequest. Раньше его чистил
        // только loadForWhoSelect — но он зовётся лишь для тарифа master и молча падает
        // в catch. Залипший pending переприменял СТАРОГО героя на следующем входе в
        // форму «для себя» → «данные нового контакта продолжают отображаться, пока не
        // перезайти несколько раз» (Закон №20 — корень, а не симптом).
        setTimeout(function() {
          if (_pendingHeroRequest) {
            _applyHeroRequest(_pendingHeroRequest.hero, _pendingHeroRequest.mode);
            _pendingHeroRequest = null;
          }
        }, 600);
      }

      function fillFormFromProfile(profileOrTgUser) {
        if (!profileOrTgUser) return;
        // Сохраняем профиль для восстановления при «Для себя» в forWho
        if (profileOrTgUser.birthdate != null || profileOrTgUser.birthplace != null) {
          window._savedFormProfile = window._savedFormProfile || {};
          var sp = window._savedFormProfile;
          sp.name = profileOrTgUser.first_name || profileOrTgUser.name || sp.name;
          sp.birthdate = profileOrTgUser.birthdate || sp.birthdate;
          sp.birthtime = profileOrTgUser.birthtime || sp.birthtime;
          sp.birthplace = profileOrTgUser.birthplace || sp.birthplace;
          sp.birthplace_lat = profileOrTgUser.birthplace_lat != null ? profileOrTgUser.birthplace_lat : sp.birthplace_lat;
          sp.birthplace_lon = profileOrTgUser.birthplace_lon != null ? profileOrTgUser.birthplace_lon : sp.birthplace_lon;
          sp.birthtime_unknown = profileOrTgUser.birthtime_unknown != null ? profileOrTgUser.birthtime_unknown : sp.birthtime_unknown;
          sp.gender = profileOrTgUser.gender || sp.gender;
          sp.language = profileOrTgUser.language || sp.language;
        }
        // Гонка async-префилла (Алла 17.07, заявка ALLA вместо Алексея): если герой УЖЕ выбран
        // из картотеки, НЕ перезаписываем поля person1 профилем заказчика — иначе поздний
        // setTimeout-префилл (05-promo-pay-helpers) молча затирает героя и заявка уходит на
        // заказчика (client_id терялся). Симметрично защите в loadSavedProfileForForm
        // (04-tbank-profile-referral.js:1655). Профиль в _savedFormProfile выше уже сохранён —
        // для восстановления при явном выборе «Для себя». Проверяем устойчивый _selectedHeroId,
        // а не только forWho.value (тот мог слететь при async-пересборке <select>).
        var _fwHeroEl = document.getElementById('forWho');
        var _heroAlreadySelected = (_fwHeroEl && _fwHeroEl.value)
          || (typeof _selectedHeroId !== 'undefined' && _selectedHeroId)
          || (window._selectedPerson1Hero && window._selectedPerson1Hero.id);
        if (_heroAlreadySelected) return;
        var nameEl = document.getElementById('name');
        var bd = document.getElementById('birthdate');
        var bt = document.getElementById('birthtime');
        var bp = document.getElementById('birthplace');
        var unk = document.getElementById('unknown');
        var g = document.getElementById('gender');
        var langEl = document.getElementById('language');
        var isProfile = profileOrTgUser && (profileOrTgUser.birthdate != null || profileOrTgUser.birthplace != null);
        var firstName = profileOrTgUser.first_name || profileOrTgUser.name;
        if (nameEl && firstName) nameEl.value = firstName;
        if (isProfile) {
          if (bd) { bd.value = (profileOrTgUser.birthdate || '').toString().slice(0, 10); if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate'); }
          if (bt) bt.value = (profileOrTgUser.birthtime || '').toString().slice(0, 5);
          if (bp) {
            bp.value = profileOrTgUser.birthplace || '';
            if (profileOrTgUser.birthplace && profileOrTgUser.birthplace.length >= 3) {
              bp.setAttribute('data-from-profile', '1');
              bp.setAttribute('data-place-selected', '1');
              var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.add('has-place');
              var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'false');
              var bHintP = document.getElementById('birthplaceHint'); if (bHintP) bHintP.style.display = 'none';
              if (profileOrTgUser.birthplace_lat != null && profileOrTgUser.birthplace_lon != null) {
                bp.setAttribute('data-lat', String(profileOrTgUser.birthplace_lat));
                bp.setAttribute('data-lon', String(profileOrTgUser.birthplace_lon));
              } else {
                bp.removeAttribute('data-lat');
                bp.removeAttribute('data-lon');
                if (typeof getPlacesSearchUrl === 'function') {
                  (function(field, place) {
                    var geoUrl = getPlacesSearchUrl(place);
                    fetch(geoUrl, { headers: { 'Accept': 'application/json' } })
                      .then(function(r) { return r.ok ? r.json() : []; })
                      .then(function(list) {
                        if (list && list.length > 0 && list[0].lat && list[0].lon) {
                          field.setAttribute('data-lat', String(list[0].lat));
                          field.setAttribute('data-lon', String(list[0].lon));
                          console.log('[prefillFromProfile] Геокодинг профиля:', place, '→', list[0].lat, list[0].lon);
                        }
                      }).catch(function() {});
                  })(bp, profileOrTgUser.birthplace);
                }
              }
            } else {
              bp.removeAttribute('data-from-profile');
              bp.removeAttribute('data-place-selected');
              bp.removeAttribute('data-lat');
              bp.removeAttribute('data-lon');
              var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.remove('has-place');
              var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'true');
            }
          }
          if (unk) unk.checked = !!profileOrTgUser.birthtime_unknown;
          // Пишем пол ТОЛЬКО если он есть в профиле — иначе НЕ затираем уже выбранное
          // (симметрично языку ниже). `|| ''` обнулял пол на success-пути «песня для героя».
          // dispatchEvent('change') + _syncCustomDropdowns() — канонический паттерн как в
          // fillFormFromHero: sel.value=… не триггерит observer → плашка .cs-display застревает.
          if (g && profileOrTgUser.gender) {
            g.value = profileOrTgUser.gender;
            try { g.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
          }
          if (langEl && profileOrTgUser.language) {
            langEl.value = profileOrTgUser.language;
            try { langEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
          }
          try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch (_) {}
          var bdWrap = document.getElementById('birthdateWrap');
          if (bdWrap) {
            if (profileOrTgUser.birthdate) { bdWrap.classList.add('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'false'); }
            else { bdWrap.classList.remove('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'true'); }
          }
        }
      }
      // ── Полная очистка всех полей person2 (couple-режим) ──
      function clearPerson2Fields() {
        ['name2','birthdate2','birthplace2','birthtime2'].forEach(function(id) {
          var el = document.getElementById(id); if (el) el.value = '';
        });
        if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate2');
        var unk2 = document.getElementById('unknown2'); if (unk2) unk2.checked = false;
        var g2 = document.getElementById('gender2'); if (g2) g2.value = '';
        var p2r = document.getElementById('person2Relationship'); if (p2r) p2r.value = '';
        var bp2 = document.getElementById('birthplace2');
        if (bp2) {
          bp2.removeAttribute('data-lat');
          bp2.removeAttribute('data-lon');
          bp2.removeAttribute('data-place-selected');
          bp2.removeAttribute('data-from-profile');
        }
        var bw2 = document.getElementById('birthplace2Wrap'); if (bw2) bw2.classList.remove('has-place');
        var bch2 = document.getElementById('birthplace2Check'); if (bch2) bch2.setAttribute('aria-hidden', 'true');
        var bHint2 = document.getElementById('birthplace2Hint'); if (bHint2) bHint2.style.display = '';
        // Сброс кнопки «Выбрать из Лаборатории»
        var btnTextEl = document.getElementById('pickFromLabBtnText');
        if (btnTextEl) btnTextEl.textContent = (typeof t === 'function' ? t('pickFromLab') : 'Выбрать из Лаборатории');
        _selectedLabHeroId = null;
        window._selectedLabHeroId = null;
        // Сброс сводки аккордеона person2
        if (typeof updateP2AccordionSummary === 'function') updateP2AccordionSummary();
      }

      // Детерминированный сброс формы (Алла 05.07): чистим ВСЕ поля обоих людей и
      // состояние выбора при КАЖДОМ входе на форму — иначе после выхода/повторного входа
      // остаётся стейл-микс (аккордеон одного человека + поля другого). Вызывается в начале
      // входа на formPage ДО async-префилла профиля/героя.
      function resetFormState() {
        // person1
        var n = document.getElementById('name'); if (n) n.value = '';
        var bd = document.getElementById('birthdate'); if (bd) bd.value = '';
        if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate');
        var bt = document.getElementById('birthtime'); if (bt) { bt.value = ''; bt.disabled = false; }
        var unk = document.getElementById('unknown'); if (unk) unk.checked = false;
        var g = document.getElementById('gender'); if (g) g.value = '';
        var bp = document.getElementById('birthplace');
        if (bp) { bp.value = ''; bp.removeAttribute('data-lat'); bp.removeAttribute('data-lon'); bp.removeAttribute('data-from-profile'); bp.removeAttribute('data-place-selected'); }
        var bpw = document.getElementById('birthplaceWrap'); if (bpw) bpw.classList.remove('has-place');
        var bpc = document.getElementById('birthplaceCheck'); if (bpc) bpc.setAttribute('aria-hidden', 'true');
        var bdw = document.getElementById('birthdateWrap'); if (bdw) bdw.classList.remove('has-date');
        var uh = document.getElementById('birthtimeUnknownHint'); if (uh) uh.style.display = 'none';
        // person2
        if (typeof clearPerson2Fields === 'function') clearPerson2Fields();
        // «Для кого» + состояние выбора
        var fw = document.getElementById('forWho'); if (fw) fw.value = '';
        _selectedHeroId = null;
        _selectedLabHeroId = null;
        window._selectedPerson1Hero = null;
        window._selectedLabHeroId = null;
        // Аккордеон person1 прячем — свежий префилл его пересоберёт (иначе стейл-имя героя)
        var acc = document.getElementById('profileAccordion'); if (acc) acc.style.display = 'none';
        var p1Btn = document.getElementById('pickPerson1BtnText');
        if (p1Btn) p1Btn.textContent = typeof t === 'function' ? t('couplePerson1Pick') : 'Выбрать из Лаборатории';
        var p1Acc = document.getElementById('p1AccName');
        if (p1Acc) p1Acc.textContent = typeof t === 'function' ? t('couplePerson1Label') : 'Первый человек';
        try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch(_) {}
        try { if (typeof window._syncNameHints === 'function') window._syncNameHints(); } catch(_) {}
      }
      window.resetFormState = resetFormState;

      function fillFormFromHero(hero) {
        if (!hero) {
          // Восстанавливаем данные профиля при переключении на «Для себя»
          var p = window._savedFormProfile || (typeof getCachedProfile === 'function' ? getCachedProfile() : null);
          if (p) {
            var nameEl = document.getElementById('name');
            var bd = document.getElementById('birthdate');
            var bt = document.getElementById('birthtime');
            var bp = document.getElementById('birthplace');
            var unk = document.getElementById('unknown');
            var g = document.getElementById('gender');
            if (nameEl) nameEl.value = p.name || '';
            if (bd) { bd.value = p.birthdate || ''; if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate'); }
            if (bt) {
              bt.value = p.birthtime ? normalizeTimeValue(p.birthtime) : '';
              bt.disabled = !!p.birthtime_unknown;
            }
            if (bp) {
              bp.value = p.birthplace || '';
              if (window._syncAdvSummary) setTimeout(window._syncAdvSummary, 0);
              bp.removeAttribute('data-lat'); bp.removeAttribute('data-lon');
              if (p.birthplace && p.birthplace.trim().length >= 3) {
                bp.setAttribute('data-from-profile', '1');
                bp.setAttribute('data-place-selected', '1');
                var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.add('has-place');
                var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'false');
                var bHint = document.getElementById('birthplaceHint'); if (bHint) bHint.style.display = 'none';
                if (p.birthplace_lat != null && p.birthplace_lon != null) {
                  bp.setAttribute('data-lat', String(p.birthplace_lat));
                  bp.setAttribute('data-lon', String(p.birthplace_lon));
                }
              } else {
                bp.removeAttribute('data-from-profile'); bp.removeAttribute('data-place-selected');
                var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.remove('has-place');
                var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'true');
              }
            }
            if (unk) {
              unk.checked = !!p.birthtime_unknown;
              var hint = document.getElementById('birthtimeUnknownHint');
              if (hint) hint.style.display = p.birthtime_unknown ? 'block' : 'none';
            }
            if (g) {
              g.value = p.gender || '';
              try { g.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
            }
            // VK Testers 7278526: форс sync всех custom dropdowns после
            // программной установки .value (включая date День/Месяц/Год + lang).
            try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch(_) {}
            // Аккордеон — показываем данные профиля
            if (p.name && p.birthdate) {
              var accordion = document.getElementById('profileAccordion');
              var formWrap = document.getElementById('formFieldsWrap');
              applyProfileAccordion(p.name, p.birthdate, accordion, formWrap);
            }
            var bdWrap = document.getElementById('birthdateWrap');
            if (bdWrap) {
              if (p.birthdate) { bdWrap.classList.add('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'false'); }
              else { bdWrap.classList.remove('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'true'); }
            }
          }
          return;
        }
        var nameEl = document.getElementById('name');
        var bd = document.getElementById('birthdate');
        var bt = document.getElementById('birthtime');
        var bp = document.getElementById('birthplace');
        var unk = document.getElementById('unknown');
        var g = document.getElementById('gender');
        if (nameEl) nameEl.value = hero.name || '';
        if (bd) { bd.value = hero.birth_date || ''; if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate'); }
        if (bt) bt.value = (hero.birth_time || '').substring(0, 5);
        if (bp) {
          bp.value = hero.birth_place || '';
          bp.removeAttribute('data-lat');
          bp.removeAttribute('data-lon');
          if (hero.birth_lat != null && hero.birth_lon != null) {
            bp.setAttribute('data-lat', String(hero.birth_lat));
            bp.setAttribute('data-lon', String(hero.birth_lon));
          }
          if (hero.birth_place && String(hero.birth_place).trim().length >= 3) {
            bp.setAttribute('data-from-profile', '1');
            bp.setAttribute('data-place-selected', '1');
            var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.add('has-place');
            var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'false');
            var bHint = document.getElementById('birthplaceHint'); if (bHint) bHint.style.display = 'none';
            if (!bp.getAttribute('data-lat') && typeof getPlacesSearchUrl === 'function') {
              (function(field, place) {
                var geoUrl = getPlacesSearchUrl(place);
                fetch(geoUrl, { headers: { 'Accept': 'application/json' } })
                  .then(function(r) { return r.ok ? r.json() : []; })
                  .then(function(list) {
                    if (list && list.length > 0 && list[0].lat && list[0].lon) {
                      field.setAttribute('data-lat', String(list[0].lat));
                      field.setAttribute('data-lon', String(list[0].lon));
                      console.log('[fillFormFromHero] Геокодинг героя:', place, '→', list[0].lat, list[0].lon);
                    }
                  }).catch(function(e) { console.warn('[fillFormFromHero] Геокодинг не удался:', e); });
              })(bp, hero.birth_place);
            }
          } else {
            bp.removeAttribute('data-from-profile');
            bp.removeAttribute('data-place-selected');
            var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.remove('has-place');
            var bch = document.getElementById('birthplaceCheck'); if (bch) bch.setAttribute('aria-hidden', 'true');
          }
        }
        // Если у героя нет birth_time — автоматически считаем «время неизвестно»,
        // независимо от значения birthtime_unknown в БД. Без этого валидация
        // блокирует submit alertом «Укажи время рождения», даже когда юзер
        // явно создавал героя без времени (галочка не сохранилась / не нажата).
        var _heroNoTime = !hero.birth_time || !String(hero.birth_time).trim();
        if (unk) unk.checked = !!hero.birthtime_unknown || _heroNoTime;
        // Если поставили unknown — отключаем поле времени для консистентности UI
        var btEl = document.getElementById('birthtime');
        if (btEl && unk && unk.checked) { btEl.disabled = true; btEl.value = ''; }
        var unkHint = document.getElementById('birthtimeUnknownHint');
        if (unkHint) unkHint.style.display = unk && unk.checked ? 'block' : 'none';
        if (g && hero.gender) {
          // Пишем пол ТОЛЬКО если он есть у героя: `|| ''` обнулял пол, выбранный руками
          // (Светлана 07.08: выбрала пол в форме → карточка героя без пола затёрла выбор,
          // «не добавилось и песня в генерацию не пошла»). Как в ветке профиля (:1509).
          g.value = hero.gender;
          // VK Testers 7278526 (Тамара MacOS 17.05 17:48): после программной
          // установки .value у <select> нужно явно triggers change-event,
          // чтобы custom dropdown (.cs-display) обновил visual textContent.
          try { g.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        }
        var langEl = document.getElementById('language');
        if (langEl && hero.language) {
          langEl.value = hero.language;
          try { langEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        }
        // Также форсируем sync ВСЕХ custom dropdowns в form (date selects тоже)
        try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch(_) {}
        // Сводка расширенных настроек (город · время) — обновить под данные героя. Без этого
        // плашка показывает стейл-значения профиля («Мой город») до первого клика (Алла 19.07).
        // Ветка профиля fillFormFromHero(null) это уже делает — ветка героя забывала.
        try { if (window._syncAdvSummary) window._syncAdvSummary(); } catch(_) {}
        var bdWrap = document.getElementById('birthdateWrap');
        if (bdWrap) {
          if (hero.birth_date) { bdWrap.classList.add('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'false'); }
          else { bdWrap.classList.remove('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'true'); }
        }
      }
      function loadForWhoSelect() {
        var wrap = document.getElementById('forWhoWrap');
        var sel = document.getElementById('forWho');
        if (!wrap || !sel) return;
        if (userTariff !== 'master' || window.subscriptionCancelledByUser) { wrap.style.display = 'none'; return; }
        // Не показываем в couple-режиме (герой = person2, forWho не нужен)
        if (selectedMode !== 'couple') wrap.style.display = 'block';
        if (wrap._errorEl) { wrap._errorEl.style.display = 'none'; sel.style.display = ''; }
        heroesApi('/heroes', { method: 'GET' }).then(function(d) {
          heroesCache = (d && d.clients) || [];
          var esc = typeof escHtml === 'function' ? escHtml : function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
          // Batch 10.10 (отчёт 7271896 Windows): длинные имена героев выходили
          // за границы native <select> dropdown. Обрезаем до 35 символов
          // (с многоточием) в <option>, полное имя — в title-атрибуте.
          function _truncName(s) {
            var raw = String(s || '—');
            if (raw.length <= 35) return raw;
            return raw.slice(0, 34) + '…';
          }
          sel.innerHTML = '<option value="">' + t('forMyself') + '</option>' + heroesCache.map(function(h) {
            var fullName = h.name || '—';
            var truncated = _truncName(fullName);
            // BATCH 10.206 (Алла 20.05): «лишняя информация в контактах».
            // Заголовок select уже говорит «Для кого генерируем?» — повторять
            // «Создать песню для» в КАЖДОЙ опции избыточно. Достаточно имени.
            // Кнопка дальше по флоу (line 33977) остаётся с полным текстом
            // forHero — там нет заголовка-контекста, прямой CTA нужен.
            return '<option value="' + esc(h.id || '') + '" title="' + esc(fullName) + '">' + esc(truncated) + '</option>';
          }).join('')
            /* Алла 11.07: «Добавить контакт» — пункт ВНУТРИ списка, не кнопка в форме */
            + '<option value="__add_contact__">' + ((typeof t === 'function' && t('forWhoAddContact')) || '+ Добавить контакт') + '</option>';
          // Используем onchange вместо addEventListener чтобы не накапливать дублирующие слушатели
          sel.onchange = function() {
            var id = sel.value;
            // Пункт «+ Добавить контакт» из списка → дёргаем скрытую кнопку (обработчик 11-heroes:922 жив)
            if (id === '__add_contact__') {
              sel.value = '';
              try { if (window._syncCustomDropdowns) window._syncCustomDropdowns(); } catch (_) {}
              var _addBtn = document.getElementById('forWhoAddContactBtn');
              if (_addBtn) _addBtn.click();
              return;
            }
            var stepNext = document.getElementById('stepNext');
            var btnText = stepNext && stepNext.querySelector('.btn-pay-text');
            var accordion = document.getElementById('profileAccordion');
            var formWrap = document.getElementById('formFieldsWrap');
            if (!id) {
              // «Для себя» — восстанавливаем профиль в форму и аккордеон
              _selectedHeroId = null;
              fillFormFromHero(null);
              if (btnText) btnText.textContent = typeof t === 'function' ? t('submitRequest') : 'Создать мою песню';
              return;
            }
            var hero = heroesCache.find(function(c) { return c.id === id; });
            if (hero) {
              // VK Testers 7275171 (MacOS 14.05.2026 ПЕРЕОТКРЫТ): «При нажатии создать песню
              // в обязательные поля шаг 2 подставляются данные пользователя».
              // Корень (выяснен 15.05.2026): при блокировке incomplete hero вызывался
              // fillFormFromHero(null) → подставлял ПРОФИЛЬ пользователя в форму.
              // Тестер нажимал submit → данные пользователя уходили под именем «неполного» героя.
              // Фикс: НЕ вызывать fillFormFromHero(null) при блокировке. Очищаем форму вручную,
              // чтобы submit упёрся в обязательные пустые поля.
              if (!hero.birth_date || !hero.birth_place || !String(hero.birth_date).trim() || !String(hero.birth_place).trim()) {
                if (typeof showToast === 'function') {
                  showToast(typeof t === 'function' ? (t('heroIncomplete') || 'У героя не заполнены дата или место рождения. Открой карточку и дополни.') : 'У героя не заполнены дата или место рождения. Открой карточку и дополни.');
                }
                // Сбрасываем selection обратно на "Для себя" БЕЗ восстановления данных профиля
                sel.value = '';
                _selectedHeroId = null;
                // Очищаем форму, чтобы данные пользователя НЕ просочились через fillFormFromHero(null)
                var _flds = ['name','birthdate','birthtime','birthplace','gender'];
                _flds.forEach(function(fid) {
                  var fel = document.getElementById(fid);
                  if (fel) { fel.value = ''; fel.removeAttribute('data-lat'); fel.removeAttribute('data-lon'); fel.removeAttribute('data-from-profile'); fel.removeAttribute('data-place-selected'); }
                });
                var _bpw = document.getElementById('birthplaceWrap'); if (_bpw) _bpw.classList.remove('has-place');
                var _bdw = document.getElementById('birthdateWrap'); if (_bdw) _bdw.classList.remove('has-date');
                var _unkEl = document.getElementById('unknown'); if (_unkEl) _unkEl.checked = false;
                // Ярослав admin 17.05 (transit+incomplete hero):
                // accordion ранее показывал имя владельца профиля → пользователь
                // думал что выбран он, а не «Орден». Сбрасываем accordion при
                // incomplete hero чтобы UI был чистым до дополнения данных.
                if (accordion) accordion.style.display = 'none';
                if (formWrap) formWrap.classList.remove('pfw-collapsed');
                // Открываем форму героя для редактирования
                if (typeof openHeroForm === 'function') {
                  setTimeout(function() {
                    window.returnToPage = 'formPage';
                    goToPage('heroesPage');
                    setTimeout(function() { openHeroForm(hero); }, 200);
                  }, 1000);
                }
                return;
              }
              fillFormFromHero(hero);
              // VK Testers 7272216 ПЕРЕОТКРЫТ-2 (Тамара 17.05): «текст кнопки
              // некорректный для: [имя]». Заменили на «Создать песню для [имя]»
              // в i18n + fallback тоже.
              if (btnText) btnText.textContent = typeof t === 'function' ? t('forHero', { name: hero.name || '' }) : ('Создать песню для ' + (hero.name || ''));
              // Алла 11.07 (прод-разбор, скрин №4): выбрал героя → его анкета ОТКРЫТА (можно,
              // например, убрать имя). Компакт-строку НЕ показываем — «строка + поля» читались
              // как двойной вопрос. Аккордеон прячем, поля разворачиваем.
              if (accordion) accordion.style.display = 'none';
              if (formWrap) formWrap.classList.remove('pfw-collapsed');
            }
          };
          // Единый стиль списка (Алла 11.07: «список из лаборатории очень стрёмный» — нативный
          // серый). Оборачиваем в кастомный cs-дропдаун; после innerHTML пересинхронизация (§23).
          // Восстанавливаем выбранного героя ДО синхронизации custom-dropdown — иначе плашка
          // .cs-display синхронизируется на дефолт «Для себя», хотя герой ещё выбран (Алла 17.07).
          if (_selectedHeroId) {
            var restoredOpt = sel.querySelector('option[value="' + _selectedHeroId + '"]');
            if (restoredOpt) sel.value = _selectedHeroId;
          }
          try {
            if (window._initCustomDropdown) window._initCustomDropdown(sel);
            if (window._syncCustomDropdowns) window._syncCustomDropdowns();
          } catch (_) {}
          // После загрузки проверяем тариф ещё раз (мог измениться пока шёл async)
          if (userTariff !== 'master' || window.subscriptionCancelledByUser) { wrap.style.display = 'none'; return; }
          if (selectedMode !== 'couple') wrap.style.display = 'block';
          else wrap.style.display = 'none';
          // Если есть ожидающий герой — переприменяем (защита от гонки) и обнуляем
          if (_pendingHeroRequest) {
            _applyHeroRequest(_pendingHeroRequest.hero, _pendingHeroRequest.mode);
            _pendingHeroRequest = null;
          }
        }).catch(function() {
          // Правило #8: никаких технических ошибок пользователю.
          // Тихо скрываем блок — select «Для кого» просто не появится.
          wrap.style.display = 'none';
          if (wrap._errorEl) wrap._errorEl.style.display = 'none';
          // Гасим pending и здесь: иначе после сбоя загрузки (холодный старт/таймаут)
          // старый герой переприменится на следующем открытии формы «для себя».
          _pendingHeroRequest = null;
        });
      }

      (function initPickFromLab() {
        var btn = document.getElementById('pickFromLabBtn');
        var listEl = document.getElementById('pickFromLabList');
        var dropdown = document.getElementById('pickFromLabDropdown');
        var chevron = document.getElementById('pickFromLabChevron');
        var hintEl = document.getElementById('pickFromLabHint');
        var btnText = document.getElementById('pickFromLabBtnText');
        if (!btn || !listEl || !dropdown) return;
        function closeDropdown() {
          dropdown.style.display = 'none';
          btn.setAttribute('aria-expanded', 'false');
          if (chevron) chevron.style.transform = '';
        }
        function openDropdown() {
          dropdown.style.display = 'block';
          btn.setAttribute('aria-expanded', 'true');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (userTariff !== 'master' || window.subscriptionCancelledByUser) {
            showLabUpgradeHint();
            return;
          }
          if (dropdown.style.display === 'block') { closeDropdown(); return; }
          listEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('loading') : 'Загрузка…') + '</div>';
          openDropdown();
          // Алла 11.07: список бывал НЕПОЛНЫМ (показывал кэш из другого пикера). Кэш — мгновенно
          // (если есть), но ВСЕГДА рефетчим → на экран попадает полный свежий список.
          var cache = window.heroesCache;
          if (cache && cache.length > 0) { renderList(cache); }
          if (typeof heroesApi !== 'function') { if (!cache || !cache.length) listEl.innerHTML = '<div style="padding:12px;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('pickFromLabEmpty') : 'Нет сохранённых людей. Добавляй их в разделе Лаборатория.') + '</div>'; return; }
          heroesApi('/heroes', { method: 'GET' }).then(function(d) {
            window.heroesCache = (d && d.clients) || [];
            if (!window.heroesCache.length) {
              listEl.innerHTML = '<div style="padding:12px;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('pickFromLabEmpty') : 'Нет сохранённых людей. Добавляй их в разделе Лаборатория.') + '</div>';
              return;
            }
            renderList(window.heroesCache);
          }).catch(function() {
            if (!cache || !cache.length) listEl.innerHTML = '<div style="padding:12px;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('pickFromLabEmpty') : 'Нет сохранённых людей. Добавляй их в разделе Лаборатория.') + '</div>';
          });
        });
        function renderList(heroes) {
          var esc = typeof escHtml === 'function' ? escHtml : function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
          // Единый пикер «Про двоих» (Алла 05.07): второй человек = «Я» + карточки.
          // Исключаем того, кто уже выбран первым человеком (по id, включая '__self').
          var p1Id = window._selectedPerson1Hero && window._selectedPerson1Hero.id;
          var filtered = p1Id ? heroes.filter(function(h){ return h.id !== p1Id; }) : heroes;
          var _selId = (typeof _selectedLabHeroId !== 'undefined' && _selectedLabHeroId) ? _selectedLabHeroId : window._selectedLabHeroId;
          function fmtDate(iso){ var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3]+'.'+m[2]+'.'+m[1] : ''; }
          function optHtml(id, name, dateStr, isSel) {
            // Единая капсула дропдаунов формы (.pick-from-lab-option) — без инлайнов (Алла 11.07).
            return '<button type="button" role="option" aria-selected="' + (isSel ? 'true' : 'false') + '" class="pick-from-lab-option' + (isSel ? ' sel' : '') + '" data-id="' + esc(id) + '" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;"><span class="pfl-name">' + name + '</span>' + (dateStr ? '<span class="pfl-date">' + dateStr + '</span>' : '') + (isSel ? '<span class="pfl-ck" aria-hidden="true">✓</span>' : '') + '</button>';
          }
          var html = '';
          // «Я» — первым пунктом, если профиль заполнен и «Я» не выбран уже первым человеком
          var selfReady = typeof window._selfHeroReady === 'function' && window._selfHeroReady();
          if (selfReady && p1Id !== '__self') {
            var _self = window._buildSelfHero();
            html += optHtml('__self', esc((typeof t === 'function' ? t('coupleSelfCard') : 'Я')) + ' · ' + esc(_self.name || ''), fmtDate(_self.birth_date), _selId === '__self');
          }
          html += filtered.map(function(h) {
            return optHtml(h.id || '', esc(h.name || '—'), fmtDate(h.birth_date), _selId && h.id === _selId);
          }).join('');
          if (!html) {
            html = '<div style="padding:12px;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('pickFromLabEmpty') : 'Нет сохранённых людей. Добавляй их в разделе Лаборатория.') + '</div>';
          }
          // «+ Добавить контакт» + «Ввести вручную» — пункты ВНУТРИ списка (Алла 11.07)
          html += '<button type="button" class="pick-from-lab-option pfl-add" data-id="__add_contact__" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;"><span class="pfl-name">' + ((typeof t === 'function' && t('forWhoAddContact')) || '+ Добавить контакт') + '</span></button>';
          html += '<button type="button" class="pick-from-lab-option pfl-add" data-id="__manual__" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;"><span class="pfl-name">' + ((typeof t === 'function' && t('coupleManualEnter')) || 'Ввести вручную') + '</span></button>';
          listEl.innerHTML = html;
          listEl.querySelectorAll('.pick-from-lab-option').forEach(function(opt) {
            opt.addEventListener('click', function() {
              var id = this.getAttribute('data-id');
              if (id === '__add_contact__') {
                closeDropdown();
                var _ab2 = document.getElementById('forWhoAddContactBtn');
                if (_ab2) _ab2.click();
                return;
              }
              if (id === '__manual__') {
                closeDropdown();
                try { if (typeof openSecondPersonAccordion === 'function') openSecondPersonAccordion(); } catch(_) {}
                try { if (typeof window._syncP2ExpandLink === 'function') window._syncP2ExpandLink(); } catch(_) {}
                var _n2f = document.getElementById('name2');
                if (_n2f) setTimeout(function(){ try { _n2f.focus(); } catch(_) {} }, 350);
                return;
              }
              // Заполняем ТОЛЬКО второго человека — первого не трогаем (единый пикер).
              var hero = id === '__self'
                ? (typeof window._buildSelfHero === 'function' ? window._buildSelfHero() : null)
                : (window.heroesCache || []).find(function(c) { return c.id === id; });
              if (hero && typeof fillPerson2FromHero === 'function') {
                fillPerson2FromHero(hero);
                // «2 карточки» (Алла 11.07): выбран из Лаборатории → сводка «Имя · дата» в хедер
                // и карточку СВОРАЧИВАЕМ (шеврон = «поправить вручную»). Поля-sink в DOM для submit.
                try { if (typeof updateP2AccordionSummary === 'function') updateP2AccordionSummary(); } catch(_) {}
                try { if (typeof p2AccOpen !== 'undefined' && p2AccOpen && typeof toggleSecondPersonAccordion === 'function') toggleSecondPersonAccordion(); } catch(_) {}
                try { if (typeof window._syncP2ExpandLink === 'function') window._syncP2ExpandLink(); } catch(_) {}
                try { if (window._syncP2NameHint) window._syncP2NameHint(); } catch(_) {}
                closeDropdown();
              }
            });
          });
        }
        document.addEventListener('click', function(e) {
          if (dropdown.style.display === 'block' && !dropdown.contains(e.target) && !btn.contains(e.target)) closeDropdown();
        });
      })();

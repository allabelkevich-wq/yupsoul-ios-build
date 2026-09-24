
      // ── Helper-функции для UI промокода и оплаты ──────────────────────
      // Переключение единого оверлея confirm↔promo (showcase-confirm.html state machine).
      // НЕ трогает платёжные обработчики — только показывает/прячет .po-confirm-view /
      // .po-promo-view через data-state. focusInput=false при авто-подстановке (gift).
      function _poShowPromo(skipFocus) {
        var ov = document.getElementById('paymentOverlay');
        if (!ov) return;
        ov.setAttribute('data-state', 'promo');
        ov.scrollTop = 0;
        var msg = document.getElementById('payOvPromoMsg');
        if (msg) { msg.textContent = ''; msg.className = 'promo-msg'; }
        if (!skipFocus) {
          var inp = document.getElementById('payOvPromoInput');
          if (inp) { try { inp.focus(); } catch (e) {} }
        }
      }
      function _poBackToConfirm() {
        var ov = document.getElementById('paymentOverlay');
        if (!ov) return;
        ov.setAttribute('data-state', 'confirm');
        ov.scrollTop = 0;
      }
      window._poShowPromo = _poShowPromo;
      window._poBackToConfirm = _poBackToConfirm;

      function showPromoConfirmButton() {
        var hint = document.getElementById('payOvPromoSuccessHint');
        var btn = document.getElementById('payOvPromoConfirmBtn');
        if (hint) hint.style.display = '';
        if (btn) btn.style.display = '';
      }

      function hidePromoConfirmButton() {
        var hint = document.getElementById('payOvPromoSuccessHint');
        var btn = document.getElementById('payOvPromoConfirmBtn');
        if (hint) hint.style.display = 'none';
        if (btn) btn.style.display = 'none';
      }

      function hidePaymentSection() {
        var section = document.getElementById('payOvPaymentSection');
        if (section) section.style.display = 'none';
      }

      function showPaymentSection() {
        var section = document.getElementById('payOvPaymentSection');
        if (section) section.style.display = '';
      }

      function updatePaymentSectionWithDiscount() {
        var priceDisplay = document.getElementById('payOvPriceDisplay');
        var priceHint = document.getElementById('payOvPriceHint');

        // VK Testers #7263009 ПЕРЕОТКРЫТ (Тамара Android VK Mobile, revenue critical):
        // «Цена меняется с 490 ₽ на 5.99 USDT при применении промокода».
        // Root cause: backend `/api/promos/validate` возвращает amount_after в catalog
        // currency (USDT для DEFAULT_PRICING_CATALOG fallback), а frontend изначально
        // показывает рубли через FIXED_PRICES. При apply textContent заменяется на
        // USDT — пользователь видит изменение валюты, теряет доверие.
        // Минимально invasive fix: сравниваем backend currency с initial UI currency
        // (из текущего display). Если mismatch — показываем «Промокод применён»
        // без числа (честно и не misleading), сохраняя начальную цену.
        var initialPriceText = priceDisplay ? String(priceDisplay.textContent || '').trim() : '';
        // Извлекаем currency из initial display (например "490 ₽" → "₽", "5.99 USDT" → "USDT")
        var initialCurrencyMatch = initialPriceText.match(/([₽$€]|[A-Z]{3,4})\s*$/);
        var initialCurrency = initialCurrencyMatch ? initialCurrencyMatch[1] : '';
        var sameCurrency = !initialCurrency || !activePromo || !activePromo.currency ||
          (initialCurrency === activePromo.currency) ||
          // ₽ aliases: RUB / руб → ₽
          (initialCurrency === '₽' && /^(RUB|руб)$/i.test(activePromo.currency || '')) ||
          (activePromo.currency === '₽' && /^(RUB|руб)$/i.test(initialCurrency));

        if (activePromo && priceDisplay) {
          if (sameCurrency) {
            priceDisplay.textContent = activePromo.amount_after + ' ' + activePromo.currency;
          }
          // если mismatch — НЕ меняем priceDisplay (остаётся изначальная цена)
        }

        if (activePromo && priceHint) {
          if (sameCurrency) {
            // (аудит iPhone 24.09: было хардкод RU «Скидка:» на EN/DE/FR — переиспользуем существующий ключ)
            priceHint.textContent = '💚 ' + (typeof t === 'function' ? t('promoDiscountWord') : 'Скидка') + ': ' + activePromo.discount_amount + ' ' + activePromo.currency;
          } else {
            // Mismatch валют — честно говорим что применили без конкретной суммы
            priceHint.textContent = (typeof t === 'function' ? t('payPromoApplied') : 'Промокод применён');
          }
        }

        showPaymentSection();
      }

      function resetPaymentUI() {
        hidePromoConfirmButton();
        showPaymentSection();
        
        var priceDisplay = document.getElementById('payOvPriceDisplay');
        var priceHint = document.getElementById('payOvPriceHint');
        
        // Сброс цены к оригинальной (из каталога)
        if (priceDisplay && pricingCatalog && pricingCatalog.length) {
          var item = pricingCatalog.find(function(x) { return x && x.sku === pendingPaymentSku; });
          if (item) {
            priceDisplay.textContent = item.price + ' ' + (item.currency || '₽');
          }
        }
        
        if (priceHint) priceHint.textContent = '';
      }

      async function applyPromoCode() {
        var input = document.getElementById('payOvPromoInput') || document.getElementById('promoCodeInput');
        if (!input) return;
        var code = String(input.value || '').trim().toUpperCase();
        // Сообщение под полем на экране промокода (.po-promo-view .promo-msg)
        var _poPromoMsg = function(text, cls) {
          var m = document.getElementById('payOvPromoMsg');
          if (m) { m.textContent = text || ''; m.className = 'promo-msg' + (cls ? ' ' + cls : ''); }
        };

        // Валидация длины промокода
        if (code && (code.length < 3 || code.length > 50)) {
          _poPromoMsg(_tl('promoLen3to50', 'Промокод должен быть от 3 до 50 символов'), 'err');
          setPaymentStatus('❌ Промокод должен быть от 3 до 50 символов', 'error');
          return;
        }

        if (!code) {
          activePromo = null;
          _poPromoMsg('', '');
          resetPaymentUI();
          return;
        }
        var sku = pendingPaymentSku;
        if (!sku) {
          _poPromoMsg(typeof t === 'function' ? t('toastFirstSubmit') : 'Сначала отправь заявку', 'err');
          setPaymentStatus(typeof t === 'function' ? t('toastFirstSubmit') : 'Сначала отправь заявку', 'error');
          return;
        }

        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) {
          _poPromoMsg(_tl('payRetry', 'Попробуй снова.'), 'err');
          setPaymentStatus('Попробуй снова.', 'error');
          return;
        }
        var initData = getInitData();
        _poPromoMsg(_tl('promoChecking', 'Проверяю промокод...'), '');
        setPaymentStatus('Проверяю промокод...', 'warn');
        var promoAuthH = getAuthHeaders();
        try {
          var resp = await fetch(apiBase + '/api/promos/validate', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, promoAuthH),
            body: JSON.stringify({ code: code, sku: sku, initData: initData })
          });
          var json = await resp.json().catch(function() { return {}; });
          
          if (!resp.ok || !json.valid) {
            activePromo = null;
            resetPaymentUI();
            // (аудит iPhone 24.09: было хардкод RU для всех причин — теперь через t(), ключи есть в RU/EN/DE/FR)
            var reasonMap = {
              not_found: typeof t === 'function' ? t('promoNotFound') : 'Промокод не найден',
              expired: typeof t === 'function' ? t('promoExpired') : 'Срок действия промокода истёк',
              not_started: typeof t === 'function' ? t('promoNotStarted') : 'Промокод ещё не активен',
              inactive: typeof t === 'function' ? t('promoInactive') : 'Промокод деактивирован',
              user_limit_reached: typeof t === 'function' ? t('promoUserLimitReached') : 'Вы уже использовали этот промокод',
              global_limit_reached: typeof t === 'function' ? t('promoGlobalLimitReached') : 'Промокод больше недоступен (лимит исчерпан)',
              sku_mismatch: typeof t === 'function' ? t('promoSkuMismatch') : 'Этот промокод не действует для выбранного типа заявки',
              empty: typeof t === 'function' ? t('formEnterPromo') : 'Введите промокод'
            };
            var errMsg = json.error || reasonMap[json.reason] || (typeof t === 'function' ? t('promoInvalid') : 'Промокод недействителен');
            throw new Error(errMsg);
          }
          
          activePromo = {
            code: code,
            sku: sku,
            amount_before: json.amount_before,
            amount_after: json.amount_after,
            discount_amount: json.discount_amount,
            currency: json.currency || '₽'
          };
          
          var isFree = Number(activePromo.amount_after) === 0;

          if (isFree) {
            // Промокод даёт 100% скидку
            setPaymentStatus((typeof t === 'function' ? t('payPromoApplied') : 'Промокод применён!') + ' ' + (typeof t === 'function' ? t('payOvFreeGen') : '— генерация в подарок'), 'ok');
            showPromoConfirmButton();
            hidePaymentSection();
          } else {
            // Промокод даёт частичную скидку
            // (аудит iPhone 24.09: было хардкод RU «Скидка:» на EN/DE/FR)
            setPaymentStatus((typeof t === 'function' ? t('payPromoApplied') : 'Промокод применён!') + ' ' + (typeof t === 'function' ? t('promoDiscountWord') : 'Скидка') + ': ' + activePromo.discount_amount + ' ' + activePromo.currency, 'ok');
            updatePaymentSectionWithDiscount();
            hidePromoConfirmButton();
          }
          // Успех → возврат к экрану подтверждения, где видна скидка/100%-кнопка
          // (state machine showcase-confirm: promo → confirm). Очищаем промо-сообщение.
          var _pmOk = document.getElementById('payOvPromoMsg');
          if (_pmOk) { _pmOk.textContent = ''; _pmOk.className = 'promo-msg'; }
          if (typeof _poBackToConfirm === 'function') _poBackToConfirm();

        } catch (e) {
          // Ошибка → остаёмся на экране промокода, показываем сообщение в .promo-msg
          var _pmErr = document.getElementById('payOvPromoMsg');
          if (_pmErr) { _pmErr.textContent = (e.message || 'Ошибка проверки промокода'); _pmErr.className = 'promo-msg err'; }
          setPaymentStatus((e.message || 'Ошибка проверки промокода'), 'error');
        }
      }
      // VK Testers ID 7260593 (Lykosova, MacOS): inline onclick="applyPromoCode()"
      // на кнопке «Применить» в payOvPromoRow искал функцию в global scope.
      // applyPromoCode определена в локальном IIFE → typeof undefined → клик
      // молча игнорируется. Экспонируем (тот же класс что Batch 5.5 для runPrism).
      window.applyPromoCode = applyPromoCode;

      function fetchWithTimeout(url, options, timeoutMs) {
        timeoutMs = timeoutMs || 18000;
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);
        var opts = options || {};
        opts.signal = controller.signal;
        return fetch(url, opts).then(function(r) {
          clearTimeout(timeoutId);
          return r;
        }, function(err) {
          clearTimeout(timeoutId);
          if (err && err.name === 'AbortError') throw new Error('Превышено время ожидания. Проверь интернет и попробуй снова.');
          throw err;
        });
      }
      // Тот же класс, что window.applyPromoCode выше: функция жила только в локальном
      // scope, а 20+ мест зовут её как window.fetchWithTimeout (Искра дня, бонус
      // онбординга, согласие на уведомления, реф-статистика, расклад дня, подарки,
      // совместимость). Свойства не было НИ РАЗУ — все эти вызовы молча уходили в
      // ветку обычного fetch, то есть БЕЗ таймаута, и на холодном старте висели
      // бесконечным спиннером вопреки закону №36 (аудит 17.09.2026).
      window.fetchWithTimeout = fetchWithTimeout;
      function heroesApi(path, opts) {
        var base = (window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base) return Promise.reject(new Error('API не настроен'));
        var initData = (tg && tg.initData) ? tg.initData : '';
        var url = base + '/api' + path;
        var sep = path.indexOf('?') >= 0 ? '&' : '?';
        if (initData && (!opts || opts.method === 'GET')) url += sep + 'initData=' + encodeURIComponent(initData);
        if (opts && opts.query) url += (url.indexOf('?') >= 0 ? '&' : '?') + opts.query;
        // Batch 9.33 (отчёт 7263802 Windows): heroesApi использовал ТОЛЬКО
        // X-Telegram-Init header. На веб/VK/OK у юзера нет tg.initData →
        // backend resolveUserId возвращал 401 (несмотря на Batch 5.16 на
        // бэкенде) → catch показывал «Не удалось подключиться» даже когда
        // оплата работала. Корень: frontend не передавал Bearer JWT.
        // Фикс: мерж с getAuthHeaders() — Bearer App JWT + Google id_token +
        // X-Telegram-Init одновременно. Бэкенд берёт первый подходящий.
        var authHeaders = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
        var options = {
          headers: Object.assign(
            { 'Content-Type': 'application/json', 'X-Telegram-Init': initData },
            authHeaders
          )
        };
        if (opts && opts.method) options.method = opts.method;
        if (opts && opts.body) options.body = JSON.stringify(opts.body);
        return fetchWithRetry(url, options, 2).then(function(r) {
          if (r.status === 204) return null;
          return r.json().then(function(j) {
            if (!r.ok) {
              // VK Testers 7274401 (Windows EN): нелокализованный текст ошибки
              // валидации героя. Backend возвращает j.error_code (e.g. "errInvalidName")
              // и j.error (RU текст). Раньше мы выбрасывали только j.error.
              // Теперь сохраняем error_code в Error.code чтобы caller мог
              // локализовать через t(code) на UI-языке.
              var err = new Error(j.error || r.statusText);
              if (j.error_code) err.code = j.error_code;
              if (j.error_params) err.params = j.error_params;
              throw err;
            }
            return j;
          });
        });
      }
      var _loadMePromise = null;
      function loadMe() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base) return Promise.resolve();
        // Для веб и TG — единый вызов /api/me с авторизационными заголовками
        var headers = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
        headers['Content-Type'] = 'application/json';
        _loadMePromise = fetchWithRetry(base + '/api/me', { headers: headers, credentials: 'include', timeoutMs: 15000 }, 2)
          .then(function(r) { return r.json(); })
          .then(function(d) {
            userTariff = (d && d.tariff) || 'basic';
            // Синхронизируем hasSubscriptionActive из тарифа — если не basic, подписка активна
            if (userTariff !== 'basic') {
              if (!hasSubscriptionActive) catalogCacheTime = 0; // Сбрасываем кэш каталога — был неактуален
              hasSubscriptionActive = true;
              // Grace period: is_cancelled=true но подписка ещё действует
              if (d && d.is_cancelled) {
                window.subscriptionCancelledByUser = true;
              } else {
                window.subscriptionCancelledByUser = false;
              }
            }
            // Сохраняем renew_at для баннера предупреждения
            if (d && d.renew_at) window._subscriptionRenewAt = d.renew_at;
            var masterNav = document.getElementById('masterNav');
            if (masterNav && userTariff === 'master') masterNav.style.display = 'block';
            // «Опытный» юзер (есть заявки): тур/подсветки — только новым (Алла 08.07)
            if (d && typeof d.has_tracks === 'boolean') window._meHasTracks = d.has_tracks;
            // Серверный статус онбординга (модерация ВК 11.08). true не понижаем до false:
            // локальное завершение карусели могло ещё не долететь до сервера.
            if (d && typeof d.onboarding_seen === 'boolean' && window._obSeenServer !== true) window._obSeenServer = d.onboarding_seen;
            // Приглашение в сообщество на главной (Алла 22.08): показываем, пока бонус не выдан.
            if (d && typeof d.community_join_bonus_given === 'boolean') {
              window._commJoinGiven = d.community_join_bonus_given;
              if (typeof window._initHomeCommunityCard === 'function') {
                try { window._initHomeCommunityCard(); } catch (e) { console.warn('[home] community card', e && e.message); }
              }
            }
            // Тест-аккаунт «вечный новичок» (бета, Алла 09.07): сервер шлёт force_newcomer=true.
            // Сносим ВСЕ локальные следы обучения на КАЖДОЙ загрузке (не разово, в обход
            // одноразового маркера ys_edu_reset) — вход всегда как первый. Не зависит от кэша
            // кнопки меню Telegram и URL-флагов, которые на реальном телефоне не доставлялись.
            if (d && d.force_newcomer === true) {
              try {
                window._meHasTracks = false;
                window._obSeenServer = false; // тест-новичок: серверный флаг онбординга тоже сброшен
                localStorage.removeItem('yupsoul_ob_carousel');
                localStorage.removeItem('yupsoul_tour_completed');
                localStorage.removeItem('yupsoul_form_guide_seen');
                localStorage.removeItem('yup_profile_cache');
                // Замок форматов: ys_pkg_unlocked — постоянный кэш «пакет куплен, больше не запирать».
                // У тест-аккаунта (была подписка/пакет) он оседал и держал «Про двоих»/«Энергия дня»
                // открытыми даже после сброса → снимаем ТОЛЬКО для force_newcomer, чтобы замок вернулся
                // (Алла 10.07: как новичок видела форматы незапертыми). Реальных юзеров не трогает.
                localStorage.removeItem('ys_pkg_unlocked');
                for (var _fi = localStorage.length - 1; _fi >= 0; _fi--) {
                  var _fk = localStorage.key(_fi);
                  if (_fk && _fk.indexOf('ys_edu_reset_') === 0) localStorage.removeItem(_fk);
                }
                try { sessionStorage.removeItem('yup_form_draft'); } catch(_) {}
                // Кнопка «Сбросить в новичка» — ТОЛЬКО тест-аккаунт беты (блок под force_newcomer===true).
                // Полный сброс БД (треки/Искры/флаги/промо) для повторного аудита новичок→вкус→разблокировка.
                try {
                  var _drb = document.getElementById('devResetNewcomerBtn');
                  if (_drb) {
                    _drb.style.display = 'flex';
                    if (!_drb._wired) {
                      _drb._wired = true;
                      _drb.addEventListener('click', function () {
                        if (_drb._busy) return; _drb._busy = true; _drb.textContent = '…';
                        fetch(apiBase + '/api/dev/reset-newcomer', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})) })
                          .then(function (r) { return r.json().catch(function () { return {}; }); })
                          .then(function () {
                            try {
                              localStorage.removeItem('yupsoul_ob_carousel');
                              localStorage.removeItem('yupsoul_tour_completed');
                              localStorage.removeItem('yupsoul_form_guide_seen');
                              localStorage.removeItem('yup_profile_cache');
                            } catch (_) {}
                            location.reload();
                          })
                          .catch(function () { _drb._busy = false; _drb.textContent = '↻ Новичок'; });
                      });
                    }
                  }
                } catch(_) {}
                // Если юзер на главной — показать карусель (startApp уже прочёл стейл-ключ до сноса)
                if ((document.body && document.body.dataset && document.body.dataset.page) === 'homePage'
                    && typeof window._showOnboardingCarousel === 'function') {
                  setTimeout(function(){ try { window._showOnboardingCarousel(); } catch(_) {} }, 300);
                }
              } catch(_) {}
            }
            // Новый аккаунт на «помнящем» устройстве (Алла 09.07, тест Дарины): аккаунт истинно
            // новый (нет заявок и тур-бонуса), а localStorage хранит «обучение пройдено» от
            // ПРЕЖНЕГО аккаунта на этом устройстве → сбросить обучающие ключи ОДИН раз для
            // этого userId; если юзер ещё на главной — показать карусель сразу (не со 2-го входа).
            try {
              var _uidEdu = d && d.user && d.user.userId;
              // force_newcomer (тест-аккаунт беты) уже обработан выше — этот разовый
              // путь для ОБЫЧНЫХ новых аккаунтов, чтобы блоки не дублировали снос/карусель.
              if (!(d && d.force_newcomer) && _uidEdu && d.has_tracks === false && d.profile && !d.profile.onboarding_bonus_given) {
                var _ek = 'ys_edu_reset_' + _uidEdu;
                if (localStorage.getItem(_ek) !== '1') {
                  localStorage.removeItem('yupsoul_ob_carousel');
                  localStorage.removeItem('yupsoul_tour_completed');
                  localStorage.removeItem('yupsoul_form_guide_seen');
                  // Следы прежнего аккаунта на устройстве (Алла 09.07: у обнулённой Дарины
                  // форма подставляла старые имя/дату из кэша) — новичок стартует с чистого листа
                  localStorage.removeItem('yup_profile_cache');
                  try { sessionStorage.removeItem('yup_form_draft'); } catch(_) {}
                  localStorage.setItem(_ek, '1');
                  if ((document.body && document.body.dataset && document.body.dataset.page) === 'homePage'
                      && typeof window._showOnboardingCarousel === 'function') {
                    setTimeout(function(){ try { window._showOnboardingCarousel(); } catch(_) {} }, 300);
                  }
                }
              }
            } catch(_) {}
            // Кэшируем профиль если пришёл
            if (d && d.profile) {
              window._cachedProfile = d.profile;
              // Замок форматов couple/transit: пересчитать по свежему has_purchased_package
              if (typeof window._applyModeLocks === 'function') { try { window._applyModeLocks(); } catch(_) {} }
              // Кэшируем партнёрский статус для умного роутинга
              window._partnerStatus = d.profile.partner_status || null;
              window._isPartner = d.profile.partner_status === 'approved';
              // Сразу показать/скрыть бейдж партнёра в профиле
              var _pBadge = document.getElementById('profilePartnerBadge');
              if (_pBadge) _pBadge.style.display = window._isPartner ? 'inline-flex' : 'none';
              // CD 19.09 · профиль: вместо бейджа у имени — строка «Партнёрский кабинет»
              var _pBtn = document.getElementById('profilePartnerBtn');
              if (_pBtn) _pBtn.style.display = window._isPartner ? '' : 'none';
              // Re-engagement рассылки (Алла 21.06): не-подписанным, кто тур уже прошёл — предложить рассылку.
              // Новым юзерам тур сам ведёт к согласию (TOUR_KEY ещё не 'true') — здесь не дублируем.
              try {
                var _np = d.profile;
                var _subscribed = !!(_np.notify_tg || _np.notify_vk || _np.notify_email);
                var _tourDone = false; try { _tourDone = localStorage.getItem('yupsoul_tour_completed') === 'true'; } catch(_) {}
                var _rejRecent = _np.notify_rejected_at && ((Date.now() - new Date(_np.notify_rejected_at).getTime()) < 2592000000); // 30 дней
                var _nlShown = false; try { _nlShown = sessionStorage.getItem('ys_newsletter_shown') === '1'; } catch(_) {}
                // Не перекрывать кольцо-гайд формы (превью Аллы 09.07: оффер «Будь на связи» вылезал
                // ПОВЕРХ гайда у новичка сразу после тура). Пока гайд не завершён — оффер молчит:
                // опт-ин у новичка и так на старте карусели; опытным guide_seen ставится автоматически.
                var _guideDone = false; try { _guideDone = localStorage.getItem('yupsoul_form_guide_seen') === 'true'; } catch(_) {}
                // Флаг гайда живёт в localStorage: зашёл с другого устройства — он пуст, и оффер
                // молчал навсегда. У кого уже есть песни, гайд заведомо пройден (27.08).
                try { if (!_guideDone && (d.has_tracks || (_np && ((_np.tracks_count || 0) > 0 || _np.has_tracks)))) _guideDone = true; } catch(_) {}
                // Алла 11.07: опт-ин уведомлений — ТОЛЬКО «об отправке». Показываем один раз
                // ПОСЛЕ первой песни (has_tracks = есть что доставлять), не в онбординге, не на
                // пустом входе. +5 Искр не обещаем на VK (канон v4 §2.6.2 — бэкенд их и не даёт).
                var _hasTracks = false; try { _hasTracks = !!(d.has_tracks || (_np && (_np.has_tracks || (_np.tracks_count || 0) > 0))); } catch(_) {}
                var _nlBonus = !_np.notify_consent_bonus_given && (window._appEnv !== 'vk');
                if (_tourDone && _guideDone && _hasTracks && !_subscribed && !_rejRecent && !_nlShown && typeof window.showNewsletterOffer === 'function') {
                  try { sessionStorage.setItem('ys_newsletter_shown', '1'); } catch(_) {}
                  setTimeout(function(){ if (typeof window.showNewsletterOffer === 'function') window.showNewsletterOffer(_nlBonus); }, 1400);
                }
              } catch(_) {}
            }
            if (d && d.iskry_balance != null) {
              try { localStorage.setItem('yupsoul_iskry', String(Math.round(d.iskry_balance))); } catch(_) {}
              if (typeof setIskryBalance === 'function') setIskryBalance(d.iskry_balance);
            }
            // Обновляем UI оплаты если каталог уже загружен
            if (typeof updatePaymentUiFromCatalog === 'function') updatePaymentUiFromCatalog();
            // Баннер предупреждения об истечении подписки
            if (typeof showSubExpiryBannerIfNeeded === 'function') showSubExpiryBannerIfNeeded();
          }).catch(function() {});
        return _loadMePromise;
      }
      // Наружу — нативной сборке нужно обновить баланс после встроенной покупки (модуль 14).
      window.loadMe = loadMe;
      async function fetchUserProfile() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base || !tg || !tg.initData) return null;
        try {
          var res = await fetchWithTimeout(base + '/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init': tg.initData },
            body: JSON.stringify({ initData: tg.initData })
          }, 18000);
          var json = await res.json().catch(function() { return {}; });
          return json.profile || null;
        } catch (e) { return null; }
      }
      // Загружаем тариф при старте для ВСЕХ пользователей (TG + web)
      if (tg || (typeof hasAuth === 'function' && hasAuth())) loadMe();
      currentLang = detectLang();
      window._currentLang = currentLang;
      window.currentLang = currentLang;
      applyTranslations();
      localizeLoaderLetters();
      // VK Testers 7276044: применяем tooltips тарифов сразу при первой загрузке
      if (typeof applyPpcTooltips === 'function') try { applyPpcTooltips(); } catch(_) {}
      // VK Testers #7257216 (Maria MacOS Safari): overlay placeholder для пустых
      // input[type=date] — native placeholder Safari игнорирует lang, оверлей
      // показывает локализованный текст из data-i18n-placeholder.
      if (typeof _initDatePlaceholderOverlays === 'function') { try { _initDatePlaceholderOverlays(); } catch(_) {} try { setTimeout(function(){ try { _initDatePlaceholderOverlays(); } catch(_) {} }, 600); } catch(_) {} }
      // VK Testers (Алла 20.05): text-маска ЧЧ:ММ для time inputs — заменяет
      // native time picker (зелёный outline + неудобный ввод).
      if (typeof _initAllTimeInputMasks === 'function') try { _initAllTimeInputMasks(); } catch(_) {}
      // VK Testers 7257216 ПЕРЕОТКРЫТ (Семенцов): на EN/DE/FR плейсхолдер native input[type="date"] оставался "ДД.ММ.ГГГГ". Браузер использует lang attribute для placeholder. setLanguage обновляет lang, но при первой загрузке этот шаг пропускается — добавляем явно.
      // VK Testers 7277118 ПЕРЕОТКРЫТ (17.05): lang ставится также на html и body
      // для большей надёжности (некоторые браузеры читают lang inherit-ом),
      // повторяем через rAF + setTimeout 500ms для динамически добавленных inputs.
      try {
        document.documentElement.lang = currentLang;
        document.body.setAttribute('lang', currentLang);
        var _setLang = function() {
          try { document.querySelectorAll('input[type="date"], input[type="time"]').forEach(function(el){ el.lang = currentLang; el.setAttribute('lang', currentLang); }); } catch(_) {}
        };
        _setLang();
        requestAnimationFrame(_setLang);
        setTimeout(_setLang, 500);
      } catch(_) {}

      // ═══════════════════════════════════════════════════════════════════
      // ═══════════════════════════════════════════════════════════════════
      // Старт приложения: одна страница (главная) для веб и Telegram — без отдельного онбординга
      // ═══════════════════════════════════════════════════════════════════
      (function() {
        var ONBOARDING_KEY = 'yupsoul_onboarding_seen';
        var homePage = document.getElementById('homePage');
        var _urlParams = typeof window.location !== 'undefined' ? (window.location.search || '') : '';
        var _tgStartParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ? String(tg.initDataUnsafe.start_param) : '';
        var _qsStart = _urlParams.match(/[?&](?:tgWebAppStartParam|startapp|start_param)=([^&]+)/);
        if (!_tgStartParam && _qsStart && _qsStart[1]) _tgStartParam = decodeURIComponent(_qsStart[1]);
        var _isPaymentReturn = _urlParams.indexOf('payment=success') !== -1 || /^pay_/.test(_tgStartParam)
        || (_urlParams.indexOf('page=paymentThanks') !== -1 && _urlParams.indexOf('provider=tbank') !== -1);
        function normalizeRequestId(rawValue) {
          var raw = rawValue == null ? '' : String(rawValue);
          if (!raw) return null;
          var decoded = raw;
          try { decoded = decodeURIComponent(raw); } catch(_) {}
          var m = decoded.match(/[?&]request_id=([^&#]+)/i);
          if (m && m[1]) decoded = m[1];
          decoded = decoded.split('#')[0];
          decoded = decoded.replace(/[?&](memo|order_id)=.*$/i, '');
          decoded = decoded.split('?')[0].split('&')[0].trim();
          var uuid = decoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
          return uuid ? uuid[0] : decoded;
        }
        // Экспорт обязателен: ветка возврата с оплаты (08-gift, __isPaymentReturn) зовёт
        // normalizeRequestId голым именем из своего замыкания → ReferenceError, который
        // глотает внешний try/catch → экран «спасибо за оплату» молча обрывается на этой
        // строке. Проверено щупом в браузере 17.07 (?payment=success): до вызова доходит,
        // после — нет. Симптом «заявки не завершаются».
        window.normalizeRequestId = normalizeRequestId;

        function showHomePageCorrectly() {
          var hp = document.getElementById('homePage');
          var ob = document.getElementById('onboardingPage');
          if (!hp) return;
          if (ob) {
            ob.style.display = 'none';
            ob.classList.remove('active');
          }
          document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
          hp.style.display = 'none';
          hp.classList.remove('active');
          void hp.offsetWidth;
          hp.style.display = 'flex';
          hp.classList.add('active');
          document.body.dataset.page = 'homePage';
          if (typeof console !== 'undefined') console.log('[App] Главная страница показана корректно');
          ensureHomePageContentVisible();
        }
        function ensureHomePageContentVisible() {
          var homePage = document.getElementById('homePage');
          if (!homePage || !homePage.classList.contains('active')) return;
          var mainWrap = homePage.querySelector('.home-main-wrap');
          var pageContent = homePage.querySelector('.page-content');
          if (mainWrap) {
            mainWrap.style.display = 'flex';
            mainWrap.style.visibility = 'visible';
            mainWrap.style.opacity = '1';
          }
          if (pageContent) {
            pageContent.style.display = 'flex';
            pageContent.style.visibility = 'visible';
            pageContent.style.opacity = '1';
          }
          if (typeof console !== 'undefined') console.log('[App] Контент главной страницы виден');
        }
        window.showHomePageCorrectly = showHomePageCorrectly;
        window.ensureHomePageContentVisible = ensureHomePageContentVisible;
        // Показ онбординг-карусели (первое впечатление новичка, showcase-onboarding).
        window._showOnboardingCarousel = function() {
          var ob = document.getElementById('onboardingPage');
          if (!ob) { showHomePageCorrectly(); return; }
          document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
          var hp = document.getElementById('homePage'); if (hp) { hp.style.display = 'none'; hp.classList.remove('active'); }
          ob.style.display = 'flex'; ob.classList.add('active');
          document.body.dataset.page = 'onboardingPage';
          // Спираль Фибоначчи — статичная отрисовка для глубины фона (Алла 26.06). 2× rAF: ждём layout после display:flex (закон №30).
          requestAnimationFrame(function(){ requestAnimationFrame(function(){
            try {
              var cv = document.getElementById('obSpiral'); if (!cv) return;
              var rect = ob.getBoundingClientRect();
              var w = Math.max(1, Math.round(rect.width)) || window.innerWidth;
              var h = Math.max(1, Math.round(rect.height)) || window.innerHeight;
              cv.width = w; cv.height = h;
              var ctx = cv.getContext('2d'); if (!ctx) return;
              var cx = w/2, cy = h*0.42, R = Math.min(w,h)*0.66;
              var GA = Math.PI*(3-Math.sqrt(5)), N = 380;
              var light = document.body.classList.contains('theme-light');
              ctx.clearRect(0,0,w,h);
              for (var i=0;i<N;i++){
                var f=i/N, r=Math.sqrt(f)*R, a=i*GA;
                var x=cx+r*Math.cos(a), y=cy+r*Math.sin(a);
                var dr=0.7+(i%3)*0.5;
                ctx.globalAlpha=(light?0.22:0.28)*(0.45+0.55*f);
                ctx.fillStyle=light?(i%3===0?'#d4956b':i%3===1?'#c8875e':'#e8a97a'):(i%3===0?'#FFD580':i%3===1?'#FFF0B0':'#E8E0FF');
                ctx.beginPath(); ctx.arc(x,y,Math.max(0.3,dr),0,6.283); ctx.fill();
              }
              ctx.globalAlpha=1;
            } catch(e){}
          }); });
          if (typeof window.initOnboarding === 'function') { try { window.initOnboarding(); } catch(e){ console.warn('[Onboarding] init', e); } }
          if (typeof console !== 'undefined') console.log('[App] Онбординг-карусель показана');
        };
        // Отметка «онбординг просмотрен» НА СЕРВЕРЕ (модерация ВК 11.08: кеш мобильных
        // клиентов живёт <15 мин, localStorage умирает → онбординг всплывал каждый вход).
        window._markOnboardingSeen = function() {
          try {
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            if (!apiBase || typeof hasAuth !== 'function' || !hasAuth()) return;
            fetch(apiBase + '/api/onboarding/seen', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})),
              body: '{}'
            }).catch(function(){});
          } catch(_) {}
        };
        // Завершение онбординг-карусели (финал или skip) → запомнить + запустить тур (он даёт +30 Искр).
        window._onboardingDone = function() {
          try { localStorage.setItem('yupsoul_ob_carousel', 'true'); } catch(_) {}
          window._obSeenServer = true;
          window._obJustFinishedCarousel = true; // тур после карусели идёт цепочкой — сервер-гейт _checkTour его не режет
          try { window._markOnboardingSeen(); } catch(_) {}
          // Тур (tooltips + 30 Искр «за знакомство») — после ухода с карусели на главную.
          setTimeout(function() { if (typeof window._checkTour === 'function') { try { window._checkTour(); } catch(_){} } }, 800);
        };
        window.startApp = function() {
            if (typeof console !== 'undefined') console.log('[App] Starting...');
            document.documentElement.classList.remove('web-loading');
            // Убираем FOUC — показываем body после инициализации
            if (document.body) document.body.classList.add('app-ready');
            var loginScreen = document.getElementById('webLoginScreen');
            if (loginScreen) {
              loginScreen.style.setProperty('display', 'none', 'important');
              loginScreen.style.setProperty('pointer-events', 'none', 'important');
            }
            var home = document.getElementById('homePage');
            if (home) {
              home.style.display = 'flex';
              home.style.visibility = 'visible';
              home.style.opacity = '1';
              home.style.setProperty('pointer-events', 'auto', 'important');
            }
            document.body.dataset.page = 'homePage';
            // ── Онбординг-карусель (showcase-onboarding) — ПЕРВОЕ впечатление новичка, раз на
            //    устройстве, показывается ДО тура. Тур (tooltips) даёт +30 Искр за знакомство ПОСЛЕ. ──
            // Модерация ВК 11.08 (отказ, Android/iOS/Mob.Web): (1) «онбординг моргает» —
            // startApp вызывается повторно (auth-ready → onWebAuthReady → startApp), и второй
            // прогон прятал уже показанную карусель, а _obDecide показывал её снова;
            // (2) «показывается после каждой очистки кеша» — статус жил только в localStorage.
            // Теперь: серверный флаг onboarding_seen (auth-ответ VK/OK + /api/me → window._obSeenServer)
            // + однократность решения (window._obFlowStarted / window._obDecided).
            var _obSeen = window._obSeenServer === true;
            try { _obSeen = _obSeen || localStorage.getItem('yupsoul_ob_carousel') === 'true'; } catch(_) {}
            var _obEl = document.getElementById('onboardingPage');
            var _obVisible = !!(_obEl && _obEl.style.display === 'flex');
            var _obForce = false; try { _obForce = /[?&]ob=1\b/.test(location.search || ''); } catch(_) {} // тест-хук: ?ob=1 форсит онбординг (как ?tour=1)
            var _obFirstRun = _obForce || (!_obSeen && _obEl && !_isPaymentReturn && !_tgStartParam && !window._obFlowStarted);
            // Баг Миланы (iOS TG, 28.07): «каждый раз предлагает знакомство». Корень: карусель
            // судила ТОЛЬКО по localStorage. Решение ОТЛОЖЕННОЕ: ждём /api/me ИЛИ auth-флаг
            // (главная рендерится сразу), опытному не показываем вовсе. ?ob=1 — форс.
            var _obDeferred = false;
            if (window._obFlowStarted && !_obForce) {
              _obFirstRun = false; // решение уже принял первый прогон — не пересматриваем
            } else if (_obFirstRun && !_obForce) {
              _obDeferred = true;
              window._obFlowStarted = true;
              _obFirstRun = false;                                    // рендер главной как у опытного
              window._obWaitTries = 0;
              var _obDecide = function() {
                if (window._obDecided) return;
                var _ht = window._meHasTracks;
                var _srv = window._obSeenServer; // true/false из auth или /api/me; undefined — ещё не знаем
                var _bonusGiven = !!(window._cachedProfile && window._cachedProfile.onboarding_bonus_given);
                if (_ht === true || _bonusGiven || _srv === true) {
                  window._obDecided = true;
                  try { localStorage.setItem('yupsoul_ob_carousel', 'true'); } catch(_) {}  // впредь решаем мгновенно
                  if (typeof window._checkTour === 'function') try { window._checkTour(); } catch(_) {}
                  return;
                }
                // Ни профиль, ни auth-флаг ещё не пришли — ждём (12×300мс), не мигаем.
                // После таймаута показываем: новичок на медленной сети обучение получить обязан.
                if (_ht === undefined && _srv === undefined && ++window._obWaitTries <= 12) { setTimeout(_obDecide, 300); return; }
                window._obDecided = true;
                if (typeof window._showOnboardingCarousel === 'function') try { window._showOnboardingCarousel(); } catch(_) {}
                else if (typeof window._checkTour === 'function') try { window._checkTour(); } catch(_) {}
              };
              setTimeout(_obDecide, 0);
            } else if (_obFirstRun) {
              window._obFlowStarted = true; // ?ob=1 — форс: показываем сразу, без повторов
            }
            try {
              if (_obFirstRun && typeof window._showOnboardingCarousel === 'function') {
                window._showOnboardingCarousel();
              } else if (_obVisible && window._obSeenServer !== true) {
                // Карусель уже на экране (решение первого прогона) — повторный прогон её НЕ прячет
                // (это и было «моргание»). Если сервер сказал «видел» — упадём ниже и скроем.
              } else if (homePage) { showHomePageCorrectly(); } else {
                document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
                if (home) home.classList.add('active');
              }
              if (!_obFirstRun && typeof window.initHomePageInteractive === 'function') window.initHomePageInteractive();
            } catch (e) {
              if (typeof console !== 'undefined') console.error('[App] Start failed:', e);
            }
            try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch(_) {}
            // Тур (tooltips + 30 Искр за знакомство) для первого запуска. Если показали карусель —
            // тур запустится после её завершения (см. window._onboardingDone).
            // _obDeferred / решение ещё в полёте: тур запускает сам _obDecide (обе ветки) —
            // иначе welcome-экран выскочил бы поверх ещё не принятого решения о карусели.
            var _obPending = window._obFlowStarted && !window._obDecided;
            if (!_obFirstRun && !_obDeferred && !_obPending && typeof window._checkTour === 'function') window._checkTour();
            // Тест-хук: ?newsletter=1 форсит предложение рассылки (как ?tour=1 для тура) — Алла 21.06
            try { if (/[?&]newsletter=1\b/.test(location.search||'')) setTimeout(function(){ if (typeof window.showNewsletterOffer==='function') window.showNewsletterOffer(true); }, 1500); } catch(_) {}
            // Analytics: miniapp_open event
            if (window._ysTrack) window._ysTrack('miniapp_open', { source: window._appEnv || 'telegram' });

          // Кнопка «Мои треки» — для веб и Telegram (ЗАКОН №37: вкладка для веб и TG)
          var mtBtn = document.getElementById('goMyTracksBtn');
          if (mtBtn) mtBtn.style.display = '';

          // Deep link: partner_dash — открыть кабинет партнёра
          if (_tgStartParam === 'partner_dash') {
            setTimeout(function() { goToPartnerPage(); }, 600);
          }

          // Реферальный код: применить ref из start_param (Mini App) или из URL (веб/Google по ссылке из Telegram)
          // VK Testers (Дарья Данилович, 09.05.2026): VK Mini App передаёт ref в hash (#ref=CODE), т.к. query занят vk_* параметрами
          // Поэтому проверяем ВСЕ источники: start_param → search → hash. Универсально для всех платформ.
          var _refToApply = (_tgStartParam && _tgStartParam.indexOf('ref_') === 0) ? _tgStartParam : null;
          if (!_refToApply && _urlParams) {
            var _mRef = _urlParams.match(/[?&]ref=([^&]+)/);
            if (_mRef && _mRef[1]) _refToApply = 'ref_' + decodeURIComponent(_mRef[1]).trim();
            if (!_refToApply) {
              var _mStart = _urlParams.match(/[?&]start=([^&]+)/);
              if (_mStart && _mStart[1] && _mStart[1].indexOf('ref_') === 0) _refToApply = _mStart[1];
            }
          }
          // Hash-источник (VK Mini App + любая платформа с hash-ссылкой)
          if (!_refToApply && window.location.hash) {
            var _hashRef = window.location.hash.match(/[#&]ref=([^&]+)/);
            if (_hashRef && _hashRef[1]) _refToApply = 'ref_' + decodeURIComponent(_hashRef[1]).trim();
          }
          // Применяем ref-код: если есть auth — сразу, если нет — сохраняем для применения после авторизации
          if (_refToApply) {
            var _applyBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            var _hasAuthNow = typeof hasAuth === 'function' && hasAuth();
            if (_applyBase && _hasAuthNow) {
              fetch(_applyBase + '/api/referral/apply', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
                credentials: 'include',
                body: JSON.stringify({ ref: _refToApply })
              }).then(function(r) { return r.json().catch(function() { return null; }); }).then(function() {
                try { localStorage.removeItem('yupsoul_pending_ref'); } catch(_) {}
              }).catch(function() {});
            } else {
              // Сохраняем для применения после Google OAuth или другой авторизации
              try { localStorage.setItem('yupsoul_pending_ref', _refToApply); } catch(_) {}
            }
          }
          // Применяем сохранённый ref после авторизации (если был сохранён ранее)
          if (!_refToApply) {
            try {
              var _pendingRef = localStorage.getItem('yupsoul_pending_ref');
              if (_pendingRef && typeof hasAuth === 'function' && hasAuth()) {
                var _applyBase2 = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                if (_applyBase2) {
                  fetch(_applyBase2 + '/api/referral/apply', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
                    credentials: 'include',
                    body: JSON.stringify({ ref: _pendingRef })
                  }).then(function() { localStorage.removeItem('yupsoul_pending_ref'); }).catch(function() {});
                }
              }
            } catch(_) {}
          }

          // Deep link: #auth_token=JWT — авторизация из VK/OAuth callback (redirect flow)
          // Security (VK Testers 09.05.2026): backend отдаёт через fragment (#).
          // Backward-compat: поддерживаем оба варианта (старые ссылки в кэше).
          var _hashStr2 = (window.location.hash || '').replace(/^#/, '');
          var _authToken = (_hashStr2.match(/(?:^|&)auth_token=([^&]+)/) || _urlParams.match(/[?&]auth_token=([^&]+)/) || [])[1];
          var _authProvider = (_hashStr2.match(/(?:^|&)provider=([^&]+)/) || _urlParams.match(/[?&]provider=([^&]+)/) || [])[1];
          if (_authToken) {
            try {
              var _at = decodeURIComponent(_authToken);
              if (_at.length > 20) {
                window._googleJwt = _at;
                localStorage.setItem('google_jwt', _at);
                // Для VK/OAuth — создаём минимальный google_user чтобы tryRestoreGoogleSession работал
                if (!localStorage.getItem('google_user')) {
                  var _providerName = _authProvider ? decodeURIComponent(_authProvider) : 'oauth';
                  var _fakeUser = { sub: 'oauth_user', email: '', name: 'Пользователь', provider: _providerName };
                  // Попробуем распарсить JWT payload для имени
                  try {
                    var _jwtParts = _at.split('.');
                    if (_jwtParts.length === 3) {
                      var _jwtPayload = JSON.parse(atob(_jwtParts[1].replace(/-/g,'+').replace(/_/g,'/')));
                      if (_jwtPayload.sub) _fakeUser.sub = _jwtPayload.sub;
                      if (_jwtPayload.name) _fakeUser.name = _jwtPayload.name;
                      if (_jwtPayload.email) _fakeUser.email = _jwtPayload.email;
                    }
                  } catch(_) {}
                  localStorage.setItem('google_user', JSON.stringify(_fakeUser));
                  window._googleUser = _fakeUser;
                }
                // Убрать token из URL — и из hash (#) и из search (?) для backward-compat
                try {
                  var cleanSearch2 = (location.search || '').replace(/[?&]auth_token=[^&]+/, '').replace(/[?&]provider=[^&]+/, '').replace(/^\?$/, '');
                  history.replaceState(null, '', location.pathname + cleanSearch2);
                } catch(_) {}
                console.log('[Auth] Токен из ' + (_authProvider || 'OAuth') + ' callback применён');
                // Сбросить guard чтобы onWebAuthReady выполнился даже если showWebLoginScreen уже был
                window._webAuthReadyDone = false;
                if (typeof onWebAuthReady === 'function') setTimeout(function() { onWebAuthReady(); }, 100);
              }
            } catch(_) {}
          }

          // Deep link: ?prefill_date=YYYY-MM-DD — предзаполнение даты рождения (из TikTok лендинга или бота)
          var _prefillDate = (_urlParams.match(/[?&]prefill_date=([^&]+)/) || [])[1];
          // Fallback: cookie ys_prefill_date (set by TikTok landing before auth redirect)
          if (!_prefillDate) {
            var _pdCookie = (document.cookie.match(/(?:^|;\s*)ys_prefill_date=([^;]+)/) || [])[1];
            if (_pdCookie) {
              _prefillDate = _pdCookie;
              // Очищаем cookie после использования
              try { document.cookie = 'ys_prefill_date=;path=/;max-age=0'; } catch(_) {}
            }
          }
          if (_prefillDate) {
            try {
              var _pd = decodeURIComponent(_prefillDate).slice(0, 10);
              // Валидируем формат YYYY-MM-DD
              if (/^\d{4}-\d{2}-\d{2}$/.test(_pd)) {
                setTimeout(function() {
                  var bd = document.getElementById('birthdate');
                  if (bd && !bd.value) {
                    bd.value = _pd;
                    if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate');
                    console.log('[prefillDate] Дата предзаполнена из URL:', _pd);
                  }
                }, 500);
              }
            } catch(_) {}
          }

          // Deep link: ?form={formId} — анкета с TikTok-лендинга (сохранена на сервере).
          // Подтягиваем и предзаполняем форму, чтобы юзер НЕ заполнял всё заново; трогаем только пустые поля.
          var _tkFormId = (_urlParams.match(/[?&]form=([^&]+)/) || [])[1];
          if (_tkFormId) {
            try {
              var _tkId = decodeURIComponent(_tkFormId);
              var _tkFetch = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : function(u, o) { return fetch(u, o); };
              _tkFetch(apiBase + '/api/tiktok/get-form/' + encodeURIComponent(_tkId), {}, 20000)
                .then(function(r) { return r.json(); })
                .then(function(fd) {
                  if (!fd || !fd.ok) return;
                  setTimeout(function() {
                    try {
                      var _fire = function(el) { try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} };
                      var _set = function(id, v) { var el = document.getElementById(id); if (el && v && !el.value) { el.value = v; _fire(el); } };
                      _set('name', fd.name);
                      var bd = document.getElementById('birthdate');
                      if (bd && fd.birthdate && !bd.value) {
                        var _d = String(fd.birthdate).trim();
                        var _m = _d.match(/^(\d{2})[./](\d{2})[./](\d{4})$/); // ДД.ММ.ГГГГ → ISO
                        if (_m) _d = _m[3] + '-' + _m[2] + '-' + _m[1];
                        if (/^\d{4}-\d{2}-\d{2}/.test(_d)) {
                          bd.value = _d.slice(0, 10);
                          if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate');
                        }
                      }
                      _set('birthplace', fd.birthplace);
                      _set('birthtime', fd.birthtime);
                      var g = document.getElementById('gender');
                      if (g && fd.gender && !g.value) {
                        var gv = String(fd.gender).toLowerCase();
                        if (gv === 'м' || gv === 'мужской') gv = 'male';
                        if (gv === 'ж' || gv === 'женский') gv = 'female';
                        if (gv === 'male' || gv === 'female') {
                          g.value = gv;
                          _fire(g); // кастомный дропдаун: без change визуально останется пустым (§23, прецедент #7278526)
                          if (window._syncCustomDropdowns) try { window._syncCustomDropdowns(); } catch(_) {}
                        }
                      }
                      var unk = document.getElementById('unknown');
                      if (unk && fd.birthtimeUnknown && !unk.checked) { unk.checked = true; _fire(unk); }
                      if (typeof goToPage === 'function') goToPage('formPage');
                      console.log('[tiktokForm] Анкета предзаполнена с сервера, открываю форму');
                    } catch(_) {}
                  }, 600);
                })
                .catch(function() {}); // тихо: не получилось — юзер заполнит руками, без error-текстов (закон №37)
            } catch(_) {}
          }

          // Deep link: ?action=buy_analysis — создать заказ на расшифровку и открыть оверлей оплаты
          var _actionParam = (_urlParams.match(/[?&]action=([^&]+)/) || [])[1];

          // Deep link: ?action=invite — открыть страницу профиля и проскроллить к блоку «Пригласи друга»
          if (_actionParam === 'invite') {
            setTimeout(function() {
              try {
                if (typeof goToPage === 'function') goToPage('profilePage');
              } catch(_) {}
              setTimeout(function() {
                var el = document.getElementById('profileRefShareBtn')
                      || document.getElementById('profileRefLinkInput')
                      || document.getElementById('refStatInvited');
                if (el && el.scrollIntoView) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 350);
            }, 100);
          }

          if (_actionParam === 'buy_analysis') {
            setTimeout(function() {
              var _abApiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              var _abInitData = (typeof getInitData === 'function') ? getInitData() : '';
              if (!_abApiBase || !_abInitData) {
                pendingPaymentSku = 'deep_analysis_addon';
                try { localStorage.setItem('hot_pending_sku', 'deep_analysis_addon'); } catch(_) {}
                if (typeof updatePaymentUiFromCatalog === 'function') updatePaymentUiFromCatalog();
                if (typeof showPaymentOverlay === 'function') showPaymentOverlay();
                return;
              }
              fetch(_abApiBase + '/api/payments/analysis/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init': _abInitData },
                body: JSON.stringify({ initData: _abInitData })
              })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data && data.already_available) {
                  showToast(typeof t === 'function' ? t('toastAnalysisAvailable') : 'Расшифровка уже доступна — напиши боту');
                  return;
                }
                if (data && data.success && data.request_id) {
                  pendingPaymentRequestId = data.request_id;
                  pendingPaymentSku = 'deep_analysis_addon';
                  try { localStorage.setItem('hot_pending_request_id', data.request_id); } catch(_) {}
                  try { localStorage.setItem('hot_pending_sku', 'deep_analysis_addon'); } catch(_) {}
                  if (typeof updatePaymentUiFromCatalog === 'function') updatePaymentUiFromCatalog();
                  if (typeof showPaymentOverlay === 'function') showPaymentOverlay();
                } else {
                  console.warn('[buy_analysis] order fail'); if (typeof window._ensureOnline === 'function') window._ensureOnline(); // №37
                }
              })
              .catch(function(e) {
                console.warn('[buy_analysis] order create failed:', e);
                // Закон №37: не показываем error-текст; offline → overlay, online → тихо
                if (typeof window._ensureOnline === 'function') window._ensureOnline();
              });
            }, 600);
          }
        };
        var startApp = window.startApp;

        // Веб-режим без Google-авторизации: не показываем главную — уже показан экран входа (кроме превью)
        if (window._appEnv === 'web' && !window._googleJwt && !window._previewMode) {
          startApp = function() {};
        } else {
        // Telegram: сразу показываем приложение (без bot gate — промпт на loadingPage)
        startApp();
        }
        // Страховка: если через 4 с ни одна страница не активна — показываем главную (кроме веб-режима без авторизации). В превью — всегда снимаем web-loading и показываем главную.
        setTimeout(function() {
          if (window._previewMode) {
            document.documentElement.classList.remove('web-loading');
            var hp = document.getElementById('homePage');
            if (hp && !document.querySelector('.page.active')) {
              document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
              hp.classList.add('active');
              hp.style.display = 'flex';
              hp.style.visibility = 'visible';
              hp.style.opacity = '1';
              document.body.dataset.page = 'homePage';
              if (typeof window.startApp === 'function') window.startApp();
            }
            return;
          }
          if (document.documentElement.classList.contains('web-loading')) return;
          if (window._appEnv === 'web' && !window._googleJwt) return;
          var onboardingPage = document.getElementById('onboardingPage');
          // (аудит iPhone 24.09: #onboardingPage — position:fixed, offsetParent у fixed-элементов
          // ВСЕГДА null → вторая половина условия никогда не срабатывала, гард был мёртвым.
          // Watchdog проваливался в «нет активной страницы» и повторно звал startApp() поверх
          // ещё показанной карусели — двойной re-init, риск дублирующего POST на deep-link)
          if (onboardingPage && onboardingPage.style.display !== 'none') {
            console.log('[App] Онбординг активен — ждём завершения');
            return;
          }
          var activePage = document.querySelector('.page.active');
          if (!activePage && document.getElementById('homePage')) {
            console.warn('[App] Нет активной страницы — показываем главную');
            document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
            var homePage = document.getElementById('homePage');
            homePage.style.display = 'flex';
            homePage.classList.add('active');
            document.body.dataset.page = 'homePage';
            if (typeof window.startApp === 'function') window.startApp();
          }
        }, 4000);

        setTimeout(ensureHomePageContentVisible, 100);
        setTimeout(ensureHomePageContentVisible, 1000);
        setTimeout(ensureHomePageContentVisible, 3000);

        // Восстановление незавершённого HOT-платежа (Mini App могла закрыться на iOS)
        setTimeout(function() {
          try {
            var savedReqId = normalizeRequestId((localStorage.getItem('hot_pending_request_id') || '').trim()) || '';
            var savedSku = localStorage.getItem('hot_pending_sku') || '';
            if (!savedReqId) {
              try {
                var _ppRecoveryRaw = localStorage.getItem('pending_payment_type') || '';
                if (_ppRecoveryRaw) {
                  var _ppRecovery = JSON.parse(_ppRecoveryRaw);
                  savedReqId = normalizeRequestId(_ppRecovery && _ppRecovery.request_id ? _ppRecovery.request_id : '') || '';
                  if (!savedSku && _ppRecovery && _ppRecovery.plan_key) {
                    var _planSkuMap = { plan_basic: 'soul_basic_sub', plan_plus: 'soul_plus_sub', plan_master: 'master_monthly' };
                    savedSku = _planSkuMap[_ppRecovery.plan_key] || '';
                  }
                }
              } catch(_) {}
            }
            if (!savedReqId || savedReqId.length < 10) return;
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            if (!apiBase || !hasAuth()) return;
            var recAuthH = getAuthHeaders();
            console.log('[HOT recovery] Найден незавершённый платёж:', savedReqId.slice(0, 8), 'sku:', savedSku);
            (async function recoverHotPayment() {
              var maxAttempts = 10;
              var authFailCount = 0;
              for (var i = 0; i < maxAttempts; i++) {
                // Дедупликация: если другой обработчик уже обработал — выходим
                if (_hotPaymentConfirmed) { console.log('[HOT recovery] Уже обработано, выходим'); return; }
                try {
                  var ctrl = new AbortController();
                  var tid = setTimeout(function() { ctrl.abort(); }, 12000);
                  var resp = await fetch(apiBase + '/api/payments/hot/status?request_id=' + encodeURIComponent(savedReqId), {
                    headers: recAuthH,
                    signal: ctrl.signal
                  });
                  clearTimeout(tid);
                  if (_hotPaymentConfirmed) { console.log('[HOT recovery] Уже обработано после fetch, выходим'); return; }
                  if (resp.status === 401 || resp.status === 403) {
                    authFailCount++;
                    if (authFailCount >= 3) {
                      console.warn('[HOT recovery] Авторизация не проходит (' + resp.status + '), прекращаем');
                      return;
                    }
                  }
                  var json = await resp.json().catch(function() { return {}; });
                  var ps = json && json.data && json.data.payment_status;
                  if (String(ps || '').toLowerCase() === 'paid') {
                    if (_hotPaymentConfirmed) { console.log('[HOT recovery] Уже обработано другим обработчиком, пропускаем'); return; }
                    _hotPaymentConfirmed = true;
                    paymentPollingActive = false;
                    console.log('[HOT recovery] Платёж подтверждён! Вызываем confirm...');
                    var initDataRec = getInitData();
                    try {
                      var confirmResp = await fetch(apiBase + '/api/payments/hot/confirm', {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, recAuthH),
                        body: JSON.stringify({ request_id: savedReqId, initData: initDataRec })
                      });
                      if (!confirmResp.ok) {
                        console.warn('[HOT recovery] confirm вернул', confirmResp.status, '— повторяем');
                        await new Promise(function(r) { setTimeout(r, 3000); });
                        continue;
                      }
                      console.log('[HOT recovery] confirm успешен');
                      var isSubSku = savedSku && (savedSku.indexOf('sub') !== -1 || savedSku.indexOf('master') !== -1);
                      if (isSubSku) {
                        try {
                          await claimSubscriptionSafe(apiBase, initDataRec, savedReqId);
                        } catch(claimErr) {
                          console.warn('[HOT recovery] subscription/claim ошибка:', claimErr && claimErr.message);
                        }
                      }
                    } catch(ce) {
                      console.warn('[HOT recovery] confirm ошибка:', ce && ce.message, '— повторяем');
                      await new Promise(function(r) { setTimeout(r, 3000); });
                      continue;
                    }
                    localStorage.removeItem('hot_pending_request_id');
                    localStorage.removeItem('hot_pending_sku');
                    localStorage.removeItem('pending_payment_type');
                    catalogCache = null; catalogCacheTime = 0;
                    if (typeof loadProfilePage === 'function') loadProfilePage().catch(function() {});
                    if (typeof loadPricingCatalog === 'function') loadPricingCatalog().catch(function() {});
                    // НЕ показываем toast/confirm — пусть return page handler покажет UI
                    // Только очищаем localStorage и обновляем кеш
                    console.log('[HOT recovery] Платёж обработан, UI покажет основной обработчик');
                    return;
                  }
                } catch(e) {
                  if (e && e.name === 'AbortError') {
                    console.warn('[HOT recovery] таймаут запроса, продолжаем');
                  } else {
                    console.warn('[HOT recovery] poll error:', e && e.message);
                  }
                }
                await new Promise(function(r) { setTimeout(r, 5000); });
              }
              console.log('[HOT recovery] Не подтверждено за', maxAttempts, 'попыток — оставляем для следующего запуска');
            })();
          } catch(_) {}
        }, 3000);
      })();

      // ── Bot gate убран — промпт перенесён на successPage ──

      // Проверяем демо-режим и показываем индикатор
      function checkDemoMode() {
        try {
          var search = (window && window.location && window.location.search) ? window.location.search : '';
          // Явный демо-режим только по флагу в URL (?demo=1 / ?demo=true) или вручную выставленному window.demoMode
          var explicitDemo = /[?&]demo=1(?:&|$)/.test(search) || /[?&]demo=true(?:&|$)/i.test(search);
          if (window.demoMode || explicitDemo) {
            var demoIndicator = document.createElement('div');
            demoIndicator.id = 'demoIndicator';
            demoIndicator.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(255,165,0,0.9);color:white;padding:8px 12px;border-radius:6px;font-size:12px;z-index:9999;font-weight:600;';
            demoIndicator.textContent = '💡 ' + t('scDemoMode');
            document.body.appendChild(demoIndicator);
            console.log('[Demo] Индикатор демо-режима добавлен');
          }
        } catch (e) {
          if (window.demoMode) {
            var demoIndicator = document.createElement('div');
            demoIndicator.id = 'demoIndicator';
            demoIndicator.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(255,165,0,0.9);color:white;padding:8px 12px;border-radius:6px;font-size:12px;z-index:9999;font-weight:600;';
            demoIndicator.textContent = '💡 ' + t('scDemoMode');
            document.body.appendChild(demoIndicator);
          }
        }
      }
      
      // Проверяем демо-режим через 2 секунды после загрузки
      setTimeout(checkDemoMode, 2000);
      (function initLangSwitcher() {
        // Инициализация всех lang-switcher (главная + стартовая страница)
        var switchers = [
          { btn: 'langSwitcherBtn', dropdown: 'langSwitcherDropdown', current: 'langSwitcherCurrent' },
          { btn: 'startLangSwitcherBtn', dropdown: 'startLangSwitcherDropdown', current: 'startLangSwitcherCurrent' },
          { btn: 'heroesLangBtn', dropdown: 'heroesLangDropdown', current: 'heroesLangCurrent' },
          { btn: 'profileLangBtn', dropdown: 'profileLangDropdown', current: 'profileLangCurrent' } // CD 19.09 · профиль
        ];
        var allDropdowns = [];
        function closeAllDropdowns() { allDropdowns.forEach(function(d) { if (d) d.setAttribute('hidden', ''); }); }
        switchers.forEach(function(cfg) {
          var btn = document.getElementById(cfg.btn);
          var dropdown = document.getElementById(cfg.dropdown);
          if (!btn || !dropdown) return;
          allDropdowns.push(dropdown);
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var wasHidden = dropdown.getAttribute('hidden') !== null;
            closeAllDropdowns();
            if (wasHidden) dropdown.removeAttribute('hidden');
          });
          dropdown.addEventListener('click', function(e) { e.stopPropagation(); });
          dropdown.querySelectorAll('.lang-opt').forEach(function(o) {
            o.addEventListener('click', function() {
              var lang = o.getAttribute('data-lang');
              if (lang) { setLang(lang); closeAllDropdowns(); }
            });
          });
        });
        document.addEventListener('click', function() { closeAllDropdowns(); });
      })();

      setTimeout(function() {
        try {
        // Загружаем каталог цен, free trial, реферальные данные и проверяем зависшие заявки
        loadPricingCatalog();
        (function initProfile() {
          if (!tg || !tg.initData) return;
          fetchUserProfile().then(function(p) {
            userProfile = p;
            var greetEl = document.getElementById('homeGreeting');
            if (greetEl) {
              greetEl.textContent = (p && p.name) ? t('greeting', { name: p.name }) : t('greetingDefault');
              greetEl.style.display = 'block';
            }
          });
        })();
        if (!tg) {
          var p = document.getElementById('previewNav');
          if (p) p.classList.add('show');
          document.body.classList.add('preview-mode');
        }
        var todayStr = new Date().toISOString().split('T')[0];
        var minDateStr = '0100-01-01';
        var birthdateEl = document.getElementById('birthdate');
        if (birthdateEl) {
          birthdateEl.max = todayStr;
          birthdateEl.min = minDateStr;
        }
        var birthdate2El = document.getElementById('birthdate2');
        if (birthdate2El) {
          birthdate2El.max = todayStr;
          birthdate2El.min = minDateStr;
        }
        var unknown = document.getElementById('unknown');
        var birthtime = document.getElementById('birthtime');
        if (unknown && birthtime) unknown.addEventListener('change', function() {
          birthtime.required = !unknown.checked;
          // Batch 10.29 (отчёт 7256631): при снятии чекбокса время не восстанавливалось.
          // Фикс: сохраняем значение в dataset.savedTime перед очисткой, восстанавливаем
          // при uncheck. Если ничего не сохранено — поле остаётся пустым (user-friendly).
          if (unknown.checked) {
            if (birthtime.value) birthtime.dataset.savedTime = birthtime.value;
            birthtime.value = ''; birthtime.disabled = true;
          } else {
            birthtime.disabled = false;
            if (birthtime.dataset.savedTime) { birthtime.value = birthtime.dataset.savedTime; delete birthtime.dataset.savedTime; }
          }
          var hint = document.getElementById('birthtimeUnknownHint');
          if (hint) hint.style.display = unknown.checked ? 'block' : 'none';
        });
        // Алла 16.05.2026: тот же change-handler для формы создания/редактирования
        // героя в Лаборатории. Без него юзер кликает галочку «Не знаю», но input
        // не disable'ится → может ввести рандомное время → искажение astro snapshot.
        var heroUnk = document.getElementById('heroBirthtimeUnknown');
        var heroBt = document.getElementById('heroBirthtime');
        if (heroUnk && heroBt && !heroUnk.dataset.bound) {
          heroUnk.dataset.bound = '1';
          heroUnk.addEventListener('change', function() {
            if (heroUnk.checked) {
              if (heroBt.value) heroBt.dataset.savedTime = heroBt.value;
              heroBt.value = ''; heroBt.disabled = true;
            } else {
              heroBt.disabled = false;
              if (heroBt.dataset.savedTime) { heroBt.value = heroBt.dataset.savedTime; delete heroBt.dataset.savedTime; }
            }
          });
        }
        // Также person2 (couple mode)
        var unk2 = document.getElementById('unknown2');
        var bt2 = document.getElementById('birthtime2');
        if (unk2 && bt2 && !unk2.dataset.bound) {
          unk2.dataset.bound = '1';
          unk2.addEventListener('change', function() {
            if (unk2.checked) {
              if (bt2.value) bt2.dataset.savedTime = bt2.value;
              bt2.value = ''; bt2.disabled = true;
            } else {
              bt2.disabled = false;
              if (bt2.dataset.savedTime) { bt2.value = bt2.dataset.savedTime; delete bt2.dataset.savedTime; }
            }
          });
        }
        function normalizeTimeValue(v) {
          if (!v || typeof v !== 'string') return '';
          var parts = v.trim().split(/[:\s]+/);
          var h = parseInt(parts[0], 10); var m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
          if (isNaN(h)) h = 0; if (isNaN(m)) m = 0;
          h = Math.max(0, Math.min(23, h)); m = Math.max(0, Math.min(59, m));
          return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
        }
        window.normalizeTimeValue = normalizeTimeValue;
        document.querySelectorAll('input[type="time"]').forEach(function(inp) {
          if (inp.value) inp.value = normalizeTimeValue(inp.value);
          inp.addEventListener('change', function() { if (this.value) this.value = normalizeTimeValue(this.value); });
          inp.addEventListener('blur', function() { if (this.value) this.value = normalizeTimeValue(this.value); });
        });
        var birthdateWrap = document.getElementById('birthdateWrap');
        var birthdateCheck = document.getElementById('birthdateCheck');
        var birthdateInput = document.getElementById('birthdate');
        var birthplaceInput = document.getElementById('birthplace');
        var monthsRu = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        var monthsRuNom = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        function getMonthNames() {
          if (typeof t !== 'function') return monthsRuNom;
          var keys = ['monthJan','monthFeb','monthMar','monthApr','monthMay','monthJun','monthJul','monthAug','monthSep','monthOct','monthNov','monthDec'];
          return keys.map(function(k, i) { var v = t(k); return (v && v !== k) ? v : monthsRuNom[i]; });
        }
        function formatDateRu(dateStr) {
          if (!dateStr) return '';
          var d = new Date(dateStr + 'T12:00:00');
          if (isNaN(d.getTime())) return dateStr;
          return d.getDate() + ' ' + monthsRu[d.getMonth()] + ' ' + d.getFullYear() + ' г.';
        }
        (function initDateGroups() {
          var yearEnd = new Date().getFullYear();
          var yearStart = yearEnd - 100;
          function fillOneDateGroup(dayId, monthId, yearId, yearMax) {
            yearMax = yearMax || yearEnd;
            var dSel = document.getElementById(dayId);
            var mSel = document.getElementById(monthId);
            var ySel = document.getElementById(yearId);
            if (dSel) { dSel.innerHTML = '<option value="">' + (typeof t === 'function' ? t('selectDay') : 'День') + '</option>'; for (var i = 1; i <= 31; i++) dSel.innerHTML += '<option value="' + i + '">' + i + '</option>'; }
            var _months = getMonthNames();
            if (mSel) { mSel.innerHTML = '<option value="">' + (typeof t === 'function' ? t('selectMonth') : 'Месяц') + '</option>'; for (var j = 1; j <= 12; j++) mSel.innerHTML += '<option value="' + j + '">' + _months[j - 1] + '</option>'; }
            if (ySel) { ySel.innerHTML = '<option value="">' + (typeof t === 'function' ? t('selectYear') : 'Год') + '</option>'; for (var k = yearMax; k >= yearStart; k--) ySel.innerHTML += '<option value="' + k + '">' + k + '</option>'; }
          }
          function selectsToInput(dayId, monthId, yearId, inputId, wrapId, checkId) {
            var d = document.getElementById(dayId);
            var m = document.getElementById(monthId);
            var y = document.getElementById(yearId);
            var inp = document.getElementById(inputId);
            var wrap = wrapId ? document.getElementById(wrapId) : null;
            var chk = checkId ? document.getElementById(checkId) : null;
            if (!inp || !d || !m || !y) return;
            var day = parseInt(d.value, 10); var month = parseInt(m.value, 10); var year = parseInt(y.value, 10);
            if (!day || !month || !year) { inp.value = ''; if (wrap) wrap.classList.remove('has-date'); if (chk) chk.setAttribute('aria-hidden', 'true'); return; }
            var lastDay = new Date(year, month, 0).getDate();
            if (day > lastDay) day = lastDay;
            var yyyy = year; var mm = month < 10 ? '0' + month : '' + month; var dd = day < 10 ? '0' + day : '' + day;
            inp.value = yyyy + '-' + mm + '-' + dd;
            if (wrap) wrap.classList.add('has-date');
            if (chk) chk.setAttribute('aria-hidden', 'false');
          }
          function inputToSelects(inputId, dayId, monthId, yearId, wrapId, checkId) {
            var inp = document.getElementById(inputId);
            var d = document.getElementById(dayId);
            var m = document.getElementById(monthId);
            var y = document.getElementById(yearId);
            var wrap = wrapId ? document.getElementById(wrapId) : null;
            var chk = checkId ? document.getElementById(checkId) : null;
            if (!inp || !d || !m || !y) return;
            var v = (inp.value || '').trim();
            if (!v) { d.value = ''; m.value = ''; y.value = ''; if (wrap) wrap.classList.remove('has-date'); if (chk) chk.setAttribute('aria-hidden', 'true'); return; }
            var parts = v.split(/[-T]/);
            var yyyy = parseInt(parts[0], 10); var mm = parseInt(parts[1], 10); var dd = parseInt(parts[2], 10);
            if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) return;
            d.value = dd; m.value = mm; y.value = yyyy;
            // Программный prefill не шлёт 'change' → cs-display оставался плейсхолдером
            // («день/месяц/год»), хотя значение выбрано (Алла 12.06). Обновляем дисплеи.
            [d, m, y].forEach(function(sel) {
              var w = sel.closest ? sel.closest('.cs-wrap') : null;
              if (w) { if (typeof w._csRebuild === 'function') try { w._csRebuild(); } catch(_) {} if (typeof w._csUpdate === 'function') try { w._csUpdate(); } catch(_) {} }
            });
            if (wrap) wrap.classList.add('has-date');
            if (chk) chk.setAttribute('aria-hidden', 'false');
          }
          // yearEnd = текущий год: можно вводить даты рождения вплоть до сегодня (в т.ч. детей)
          fillOneDateGroup('birthdateDay', 'birthdateMonth', 'birthdateYear', yearEnd);
          fillOneDateGroup('birthdate2Day', 'birthdate2Month', 'birthdate2Year', yearEnd);
          fillOneDateGroup('heroBirthdateDay', 'heroBirthdateMonth', 'heroBirthdateYear', yearEnd);
          fillOneDateGroup('profileEditDateDay', 'profileEditDateMonth', 'profileEditDateYear', yearEnd);
          [['birthdateDay','birthdateMonth','birthdateYear','birthdate','birthdateWrap','birthdateCheck'],
           ['birthdate2Day','birthdate2Month','birthdate2Year','birthdate2','birthdate2Wrap',null],
           ['heroBirthdateDay','heroBirthdateMonth','heroBirthdateYear','heroBirthdate','heroBirthdateWrap',null],
           ['profileEditDateDay','profileEditDateMonth','profileEditDateYear','profileEditDate','profileEditDateWrap',null]].forEach(function(ids) {
            var dayId = ids[0], monthId = ids[1], yearId = ids[2], inputId = ids[3], wrapId = ids[4], checkId = ids[5];
            var onCh = function() { selectsToInput(dayId, monthId, yearId, inputId, wrapId, checkId); };
            var d = document.getElementById(dayId), m = document.getElementById(monthId), y = document.getElementById(yearId);
            if (d) d.addEventListener('change', onCh);
            if (m) m.addEventListener('change', onCh);
            if (y) y.addEventListener('change', onCh);
            inputToSelects(inputId, dayId, monthId, yearId, wrapId, checkId);
          });
          window.updateDateSelectsFromInput = function(inputId) {
            var map = { birthdate: ['birthdate','birthdateDay','birthdateMonth','birthdateYear','birthdateWrap','birthdateCheck'], birthdate2: ['birthdate2','birthdate2Day','birthdate2Month','birthdate2Year','birthdate2Wrap',null], heroBirthdate: ['heroBirthdate','heroBirthdateDay','heroBirthdateMonth','heroBirthdateYear','heroBirthdateWrap',null], profileEditDate: ['profileEditDate','profileEditDateDay','profileEditDateMonth','profileEditDateYear','profileEditDateWrap',null] };
            var cfg = map[inputId];
            if (cfg) inputToSelects(cfg[0], cfg[1], cfg[2], cfg[3], cfg[4], cfg[5]);
          };
          // VK Testers 7271737 ПЕРЕОТКРЫТ (Мургин Windows): «Нет единообразие выпадающих
          // списков». Native HTML <select> на Windows Chrome даёт серый UA-стиль панели —
          // отличается от нашего .birthplace-suggestions custom autocomplete.
          // Фикс: оборачиваем все <select> в custom dropdown с единым стилем.
          // Native select остаётся скрытым для form submission + accessibility.
          window._initCustomDropdown = function _initCustomDropdown(sel) {
            if (!sel || sel._csInited) return;
            sel._csInited = true;
            var wrap = document.createElement('div');
            wrap.className = 'cs-wrap';
            sel.parentNode.insertBefore(wrap, sel);
            wrap.appendChild(sel);
            sel.classList.add('cs-native');
            var display = document.createElement('button');
            display.type = 'button';
            display.className = 'cs-display';
            display.setAttribute('aria-haspopup', 'listbox');
            display.setAttribute('aria-expanded', 'false');
            wrap.appendChild(display);
            // VK Testers 7276464 ПЕРЕОТКРЫТ (Семенцов Yandex Browser): мой portal-в-body
            // ломал dropdown — не открывался вообще. Откатываем list внутрь wrap, а
            // overflow:hidden родителя обходим через JS-toggle класса .cs-open на formFieldsWrap.
            var list = document.createElement('ul');
            list.className = 'cs-list';
            list.setAttribute('role', 'listbox');
            wrap.appendChild(list); // inside wrap — стандарт
            function rebuildList() {
              list.innerHTML = '';
              for (var i = 0; i < sel.options.length; i++) {
                var opt = sel.options[i];
                var li = document.createElement('li');
                li.className = 'cs-option' + (opt.value === sel.value ? ' is-selected' : '') + (!opt.value && opt.disabled ? ' is-placeholder' : '');
                li.setAttribute('role', 'option');
                li.setAttribute('data-value', opt.value);
                li.textContent = opt.textContent;
                if (!opt.value) li.classList.add('is-placeholder');
                li.addEventListener('click', function(ev) {
                  ev.stopPropagation();
                  var v = this.getAttribute('data-value');
                  sel.value = v;
                  try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
                  updateDisplay();
                  closeList();
                });
                list.appendChild(li);
              }
            }
            function updateDisplay() {
              var selOpt = sel.options[sel.selectedIndex];
              var placeholderEmpty = !sel.value;
              display.textContent = (selOpt && selOpt.textContent) || '';
              display.classList.toggle('is-empty', placeholderEmpty);
            }
            function openList() {
              // Закрыть другие открытые
              document.querySelectorAll('.cs-list.is-open').forEach(function(l){ if (l !== list) l.classList.remove('is-open'); });
              document.querySelectorAll('.cs-display[aria-expanded="true"]').forEach(function(d){ if (d !== display) d.setAttribute('aria-expanded', 'false'); });
              // VK Testers 7276307 + 7276693: обходим overflow:hidden родителя через JS-toggle.
              // Покрываем ВСЕ wrappers где могут быть custom dropdowns:
              // formFieldsWrap, heroFormWrap, secondPersonFormWrap, transitFormWrap.
              ['formFieldsWrap','heroFormWrap','secondPersonFormWrap','transitFormWrap','profileDataEditWrap'].forEach(function(id){
                var el = document.getElementById(id);
                if (el) el.classList.add('cs-overflow-visible');
              });
              rebuildList();
              list.classList.add('is-open');
              display.setAttribute('aria-expanded', 'true');
              // Светлана 07.08 (пол в форме): поле последнее на экране — список уезжал под
              // sticky-CTA/за вьюпорт («нажимаю и нет выпадающего списка»). Если снизу не
              // помещается — раскрываем ВВЕРХ; плюс grace-окно, чтобы наш же programmatic
              // scroll (и rubber-band тапа в WebView) не захлопнул список scroll-хендлером.
              window._csOpenGraceUntil = Date.now() + 700;
              try {
                var dRect = display.getBoundingClientRect();
                var vh = window.innerHeight || document.documentElement.clientHeight;
                var need = Math.min(list.scrollHeight || 280, 280) + 12;
                var below = vh - dRect.bottom;
                list.classList.toggle('cs-drop-up', below < need && dRect.top > need);
                if (below < need && dRect.top <= need) {
                  display.scrollIntoView({ block: 'center' });
                }
              } catch (_) {}
            }
            function closeList() {
              list.classList.remove('is-open');
              list.classList.remove('cs-drop-up');
              display.setAttribute('aria-expanded', 'false');
              // Снимаем overflow:visible только если ни один dropdown больше не открыт
              setTimeout(function() {
                if (document.querySelectorAll('.cs-list.is-open').length === 0) {
                  ['formFieldsWrap','heroFormWrap','secondPersonFormWrap','transitFormWrap','profileDataEditWrap'].forEach(function(id){
                    var el = document.getElementById(id);
                    if (el) el.classList.remove('cs-overflow-visible');
                  });
                }
              }, 50);
            }
            display.addEventListener('click', function(ev) {
              ev.stopPropagation();
              if (list.classList.contains('is-open')) closeList();
              else openList();
            });
            document.addEventListener('click', function(ev) {
              if (!wrap.contains(ev.target) && !list.contains(ev.target)) closeList();
            });
            // Закрываем при скролле чтобы list не «гулял» относительно display.
            // ВАЖНО: пропускаем скролл ВНУТРИ самого list — иначе при выборе года
            // (1900-2026, 126 опций при max-height 280px) попытка прокрутить
            // список немедленно его закрывает = «не работает скролл даты рождения».
            window.addEventListener('scroll', function(ev) {
              if (!list.classList.contains('is-open')) return;
              // Grace-окно после открытия: наш scrollIntoView/инерция тапа не закрывают список
              if (window._csOpenGraceUntil && Date.now() < window._csOpenGraceUntil) return;
              var tgt = ev.target;
              if (tgt === list || (tgt && tgt.nodeType === 1 && list.contains(tgt))) return;
              closeList();
            }, true);
            // Sync если value меняется программно (например fillFormFromHero)
            sel.addEventListener('change', updateDisplay);
            // Init
            rebuildList();
            updateDisplay();
            // Expose updateDisplay + rebuildList чтобы applyTranslations мог обновить локализованный текст
            wrap._csUpdate = updateDisplay;
            wrap._csRebuild = rebuildList;
            // MutationObserver — если options меняются (например fillOneDateGroup после init)
            var mo = new MutationObserver(function() { rebuildList(); updateDisplay(); });
            mo.observe(sel, { childList: true, subtree: true, characterData: true });
          };
          // VK Testers 7276305 (Семенцов Windows): после смены языка выбранные значения
          // «Пол»/«Язык песни» оставались на старом языке (display textContent был set до
          // applyTranslations). Хук — после смены языка обновляем display всех custom dropdowns.
          window._syncCustomDropdowns = function _syncCustomDropdowns() {
            document.querySelectorAll('.cs-wrap').forEach(function(w) {
              // Пересобираем список options (option.textContent изменился на новый язык)
              if (typeof w._csRebuild === 'function') try { w._csRebuild(); } catch(_) {}
              // Обновляем display.textContent на основе нового option.textContent
              if (typeof w._csUpdate === 'function') try { w._csUpdate(); } catch(_) {}
            });
            // Динамическая подсказка имени (Алла 05.07): этот хук зовётся после КАЖДОЙ
            // программной установки полей формы (префилл профиля/картотеки, выбор героя) —
            // ровно тогда, когда нужно пересчитать «заполнено/пусто» под полем имени.
            if (typeof window._syncNameHints === 'function') try { window._syncNameHints(); } catch(_) {}
          };
          // Применяем custom dropdown к селектам на странице создания
          ['birthdateDay','birthdateMonth','birthdateYear','birthdate2Day','birthdate2Month','birthdate2Year','heroBirthdateDay','heroBirthdateMonth','heroBirthdateYear','profileEditDateDay','profileEditDateMonth','profileEditDateYear','gender','gender2','heroGender','language'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && el.tagName === 'SELECT') window._initCustomDropdown(el);
          });
        })();
        // Отчёт #7257206 (Тамара, reopened): при 1-2 буквах город-поле давало НЕМУЮ пустоту
        // (порог автокомплита 3 символа) → юзер думал «поиск сломан». Показываем подсказку
        // «введите минимум 3 буквы» вместо тишины. Универсально для всех city-полей (закон №20).
        window._cityMinCharsHint = function(containerId, q) {
          var c = document.getElementById(containerId);
          if (!c) return false;
          var n = String(q || '').trim().length;
          if (n > 0 && n < 3) {
            var _t = (typeof t === 'function') ? t : function(k, f){ return f || k; };
            var tag = (c.tagName === 'UL') ? 'li' : 'div';
            c.innerHTML = '<' + tag + ' class="bs-min-hint" aria-disabled="true">' + _t('cityTypeMore', 'Введите минимум 3 буквы') + '</' + tag + '>';
            c.style.display = 'block';
            c.setAttribute('aria-hidden', 'false');
            return true;
          }
          return false;
        };
        if (birthplaceInput) {
          var suggestionsEl = document.getElementById('birthplaceSuggestions');
          var wrap = document.getElementById('birthplaceWrap');
          var checkEl = document.getElementById('birthplaceCheck');
          var hintEl = document.getElementById('birthplaceHint');
          var debounceTimer = null;
          var lastSearch = '';
          var _placesClientCache = {};
          var _fetchPlacesAbort = null;
          function hideSuggestions() {
            if (suggestionsEl) { suggestionsEl.innerHTML = ''; suggestionsEl.setAttribute('aria-hidden', 'true'); suggestionsEl.style.display = 'none'; }
          }
          function showPlaceConfirm(displayName) {}
          function selectPlace(displayName, lat, lon) {
            var full = (displayName || '').trim();
            birthplaceInput.value = full;
            birthplaceInput.setAttribute('title', full);
            birthplaceInput.setAttribute('data-place-selected', '1');
            if (lat != null && lon != null) {
              birthplaceInput.setAttribute('data-lat', String(lat));
              birthplaceInput.setAttribute('data-lon', String(lon));
            }
            if (wrap) wrap.classList.add('has-place');
            if (checkEl) checkEl.setAttribute('aria-hidden', 'false');
            if (hintEl) hintEl.style.display = 'none';
            showPlaceConfirm(displayName);
            hideSuggestions();
          }
          function clearPlaceSelection() {
            birthplaceInput.removeAttribute('data-place-selected');
            birthplaceInput.removeAttribute('data-lat');
            birthplaceInput.removeAttribute('data-lon');
            if (wrap) wrap.classList.remove('has-place');
            if (checkEl) checkEl.setAttribute('aria-hidden', 'true');
            if (hintEl) hintEl.style.display = 'none';
          }
          var _fetchPlacesRetries = 0;
          function fetchPlaces(q) {
            if (!q || q.length < 3) { if (!window._cityMinCharsHint('birthplaceSuggestions', q)) hideSuggestions(); return; }
            var cacheKey = q.toLowerCase();
            if (_placesClientCache[cacheKey]) { renderList(_placesClientCache[cacheKey]); return; }
            if (_fetchPlacesAbort) { try { _fetchPlacesAbort.abort(); } catch(e){} }
            _fetchPlacesAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var url = typeof getPlacesSearchUrl === 'function' ? getPlacesSearchUrl(q) : nominatimUrlFor(q);
            var headers = { 'Accept': 'application/json' };
            if (url.indexOf('nominatim') !== -1) { headers['Accept-Language'] = window.currentLang || 'ru'; headers['User-Agent'] = 'YupSoulMiniApp/1.0'; }
            var fetchOpts = { headers: headers };
            if (_fetchPlacesAbort) fetchOpts.signal = _fetchPlacesAbort.signal;
            function renderList(list) {
              if (lastSearch !== q || !suggestionsEl) return;
              suggestionsEl.innerHTML = '';
              (list || []).forEach(function(item) {
                var li = document.createElement('li');
                var main = item.display_name || (item.address && (item.address.city || item.address.town || item.address.village || item.address.state || item.address.country));
                var sub = item.address && item.address.country ? (item.address.country + (item.address.country_code ? ' (' + item.address.country_code.toUpperCase() + ')' : '')) : '';
                li.textContent = main;
                if (sub) { var sp = document.createElement('div'); sp.className = 'place-type'; sp.textContent = sub; li.appendChild(sp); }
                var lat = item.lat; var lon = item.lon; var placeId = item.place_id; var yandexUri = item.yandex_uri;
                function onSelect() {
                  if ((placeId || yandexUri) && (lat == null || lat === undefined)) {
                    if (typeof fetchPlaceDetails === 'function') {
                      var params = placeId ? { place_id: placeId } : { yandex_uri: yandexUri };
                      fetchPlaceDetails(params, function(name, la, lo) { selectPlace(name, la, lo); hideSuggestions(); }, hideSuggestions);
                    } else hideSuggestions();
                  } else { selectPlace(item.display_name || main, lat, lon); hideSuggestions(); }
                }
                li.addEventListener('mousedown', function(e) { e.preventDefault(); onSelect(); });
                li.addEventListener('click', onSelect);
                suggestionsEl.appendChild(li);
              });
              suggestionsEl.style.display = (list && list.length) ? 'block' : 'none';
              suggestionsEl.setAttribute('aria-hidden', list && list.length ? 'false' : 'true');
            }
            fetch(url, fetchOpts)
              .then(function(r) {
                if (r.status === 429 || r.status === 502 || r.status === 503) {
                  if (_fetchPlacesRetries < 2) {
                    _fetchPlacesRetries++;
                    setTimeout(function() { fetchPlaces(q); }, 1500 * _fetchPlacesRetries);
                  } else {
                    _fetchPlacesRetries = 0;
                    hideSuggestions();
                  }
                  return null;
                }
                _fetchPlacesRetries = 0;
                return r.json();
              })
              .then(function(list) {
                if (!list) return;
                var arr = Array.isArray(list) ? list : [];
                if (arr.length === 0 && url.indexOf('nominatim') === -1) {
                  placesNominatimFallback(q, function(narr){ _placesClientCache[cacheKey] = narr; renderList(narr); });
                  return;
                }
                _placesClientCache[cacheKey] = arr;
                renderList(arr);
              })
              .catch(function(err) {
                if (err && err.name === 'AbortError') return;
                if (url.indexOf('nominatim') === -1 && typeof getPlacesSearchUrl === 'function') {
                  var fallbackUrl = nominatimUrlFor(q);
                  fetch(fallbackUrl, { headers: { 'Accept': 'application/json', 'Accept-Language': (window.currentLang || 'ru'), 'User-Agent': 'YupSoulMiniApp/1.0' } })
                    .then(function(r) { return r.ok ? r.json() : []; })
                    .then(function(list) { var arr = Array.isArray(list) ? list : []; _placesClientCache[cacheKey] = arr; renderList(arr); })
                    .catch(function() { hideSuggestions(); });
                } else {
                  hideSuggestions();
                }
              });
          }
          birthplaceInput.addEventListener('input', function() {
            var v = birthplaceInput.value.trim();
            clearPlaceSelection();
            if (v) {
              lastSearch = v;
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(function() { fetchPlaces(v); }, 350);
            } else {
              hideSuggestions();
            }
          });
          birthplaceInput.addEventListener('focus', function() {
            var v = birthplaceInput.value.trim();
            var isSelected = !!birthplaceInput.getAttribute('data-place-selected');
            if (hintEl) hintEl.style.display = (!v && !isSelected) ? 'block' : 'none';
            if (v && v.length >= 3) { lastSearch = v; fetchPlaces(v); }
          });
          birthplaceInput.addEventListener('blur', function() {
            // 400ms — даёт время touch-событию на мобильных обработать выбор из списка
            setTimeout(hideSuggestions, 400);
            if (hintEl) hintEl.style.display = 'none';
          });
          if (birthplaceInput.value.trim() && birthplaceInput.getAttribute('data-place-selected') && wrap) {
            wrap.classList.add('has-place');
            if (checkEl) checkEl.setAttribute('aria-hidden', 'false');
          }
        }
        var birthplace2Input = document.getElementById('birthplace2');
        if (birthplace2Input) {
          var sugg2El = document.getElementById('birthplaceSuggestions2');
          var wrap2El = document.getElementById('birthplace2Wrap');
          var check2El = document.getElementById('birthplace2Check');
          var hint2El = document.getElementById('birthplace2Hint');
          var debounce2 = null;
          var lastSearch2 = '';
          var _places2ClientCache = {};
          var _fetchPlaces2Abort = null;
          function hideSuggestions2() {
            if (sugg2El) { sugg2El.innerHTML = ''; sugg2El.setAttribute('aria-hidden', 'true'); sugg2El.style.display = 'none'; }
          }
          function selectPlace2(displayName, lat, lon) {
            var full = (displayName || '').trim();
            birthplace2Input.value = full;
            birthplace2Input.setAttribute('data-place-selected', '1');
            if (lat != null && lon != null) {
              birthplace2Input.setAttribute('data-lat', String(lat));
              birthplace2Input.setAttribute('data-lon', String(lon));
            }
            if (wrap2El) wrap2El.classList.add('has-place');
            if (check2El) check2El.setAttribute('aria-hidden', 'false');
            if (hint2El) hint2El.style.display = 'none';
            hideSuggestions2();
          }
          function clearPlace2Selection() {
            birthplace2Input.removeAttribute('data-place-selected');
            birthplace2Input.removeAttribute('data-lat');
            birthplace2Input.removeAttribute('data-lon');
            if (wrap2El) wrap2El.classList.remove('has-place');
            if (check2El) check2El.setAttribute('aria-hidden', 'true');
          }
          var _fetchPlaces2Retries = 0;
          function fetchPlaces2(q) {
            if (!q || q.length < 3) { if (!window._cityMinCharsHint('birthplaceSuggestions2', q)) hideSuggestions2(); return; }
            var cacheKey = q.toLowerCase();
            if (_places2ClientCache[cacheKey]) { renderList2(_places2ClientCache[cacheKey]); return; }
            if (_fetchPlaces2Abort) { try { _fetchPlaces2Abort.abort(); } catch(e){} }
            _fetchPlaces2Abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var url = typeof getPlacesSearchUrl === 'function' ? getPlacesSearchUrl(q) : nominatimUrlFor(q);
            var headers = { 'Accept': 'application/json' };
            if (url.indexOf('nominatim') !== -1) { headers['Accept-Language'] = window.currentLang || 'ru'; headers['User-Agent'] = 'YupSoulMiniApp/1.0'; }
            var fetchOpts = { headers: headers };
            if (_fetchPlaces2Abort) fetchOpts.signal = _fetchPlaces2Abort.signal;
            function renderList2(list) {
              if (lastSearch2 !== q || !sugg2El) return;
              sugg2El.innerHTML = '';
              (list || []).forEach(function(item) {
                var li = document.createElement('li');
                var main = item.display_name || (item.address && (item.address.city || item.address.town || item.address.village || item.address.state || item.address.country));
                var sub = item.address && item.address.country ? (item.address.country + (item.address.country_code ? ' (' + item.address.country_code.toUpperCase() + ')' : '')) : '';
                li.textContent = main;
                if (sub) { var sp = document.createElement('div'); sp.className = 'place-type'; sp.textContent = sub; li.appendChild(sp); }
                var lat = item.lat; var lon = item.lon; var placeId = item.place_id; var yandexUri = item.yandex_uri;
                function onSelect2() {
                  if ((placeId || yandexUri) && (lat == null || lat === undefined)) {
                    if (typeof fetchPlaceDetails === 'function') {
                      var params = placeId ? { place_id: placeId } : { yandex_uri: yandexUri };
                      fetchPlaceDetails(params, function(name, la, lo) { selectPlace2(name, la, lo); hideSuggestions2(); }, hideSuggestions2);
                    } else hideSuggestions2();
                  } else { selectPlace2(item.display_name || main, lat, lon); hideSuggestions2(); }
                }
                li.addEventListener('mousedown', function(e) { e.preventDefault(); onSelect2(); });
                li.addEventListener('click', onSelect2);
                sugg2El.appendChild(li);
              });
              sugg2El.style.display = (list && list.length) ? 'block' : 'none';
              sugg2El.setAttribute('aria-hidden', (list && list.length) ? 'false' : 'true');
            }
            fetch(url, fetchOpts)
              .then(function(r) {
                if (r.status === 429 || r.status === 502 || r.status === 503) {
                  if (_fetchPlaces2Retries < 2) {
                    _fetchPlaces2Retries++;
                    setTimeout(function() { fetchPlaces2(q); }, 1500 * _fetchPlaces2Retries);
                  } else {
                    _fetchPlaces2Retries = 0;
                    hideSuggestions2();
                  }
                  return null;
                }
                _fetchPlaces2Retries = 0;
                return r.json();
              })
              .then(function(list) {
                if (!list) return;
                var arr = Array.isArray(list) ? list : [];
                if (arr.length === 0 && url.indexOf('nominatim') === -1) {
                  placesNominatimFallback(q, function(narr){ _places2ClientCache[cacheKey] = narr; renderList2(narr); });
                  return;
                }
                _places2ClientCache[cacheKey] = arr;
                renderList2(arr);
              })
              .catch(function(err) {
                if (err && err.name === 'AbortError') return;
                if (url.indexOf('nominatim') === -1 && typeof getPlacesSearchUrl === 'function') {
                  fetch(nominatimUrlFor(q), { headers: { 'Accept': 'application/json', 'Accept-Language': (window.currentLang || 'ru'), 'User-Agent': 'YupSoulMiniApp/1.0' } })
                    .then(function(r) { return r.ok ? r.json() : []; })
                    .then(function(list) { var arr = Array.isArray(list) ? list : []; _places2ClientCache[cacheKey] = arr; renderList2(arr); })
                    .catch(function() { hideSuggestions2(); });
                } else {
                  hideSuggestions2();
                }
              });
          }
          birthplace2Input.addEventListener('input', function() {
            var v = birthplace2Input.value.trim();
            clearPlace2Selection();
            if (v) { lastSearch2 = v; clearTimeout(debounce2); debounce2 = setTimeout(function() { fetchPlaces2(v); }, 350); }
            else { hideSuggestions2(); }
          });
          birthplace2Input.addEventListener('focus', function() {
            var v = birthplace2Input.value.trim();
            var isSelected2 = !!birthplace2Input.getAttribute('data-place-selected');
            if (hint2El) hint2El.style.display = (!v && !isSelected2) ? 'block' : 'none';
            if (!isSelected2 && v && v.length >= 3) { lastSearch2 = v; fetchPlaces2(v); }
          });
          birthplace2Input.addEventListener('blur', function() {
            setTimeout(hideSuggestions2, 400);
            if (hint2El) hint2El.style.display = 'none';
          });
        }
        var transitLocationInput = document.getElementById('transitLocation');
        if (transitLocationInput) {
          var debounceTransit = null;
          transitLocationInput.addEventListener('input', function() {
            var self = this;
            clearTimeout(debounceTransit);
            debounceTransit = setTimeout(function() { showLocationSuggestions(self, 'transitLocationSuggestions', null); }, 320);
          });
        }
        var formPage = document.getElementById('formPage');
        // Дожидаемся загрузки тарифа перед показом forWho
        var _initFormTariff = function() {
          if (formPage && userTariff === 'master' && !window.subscriptionCancelledByUser) loadForWhoSelect();
        };
        if (_loadMePromise) _loadMePromise.then(_initFormTariff).catch(_initFormTariff);
        else _initFormTariff();

      // ── Soul Chat: полный UI на soulChatPage (initSoulChatPage). Старый блок карточки удалён. ──
      var scCurrentRequestId = null;
      window._scLastRequestId = null;
      window._scHasProfile    = false;
      window._scIsMaster      = false;
      window._scRequestId2    = null;
      window._scUserCards     = [];
      window._scPickerMode    = 'single';
      window._scPickerSelA    = null;       // явно выбранный контакт (метка/explicit_request)
      window._scPickerSel     = [];         // мультивыбор пикера: массив id ('self' = карта владельца)

      // ══════════════ SOUL CHAT PAGE ══════════════
      function goToSoulChat() {
        window.returnToPage = 'homePage';
        // Batch 10.30 (отчёт 7263729 Тамара Глазунова MacOS): сброс
        // _scHistoryLoaded=false на каждое открытие → scLoadHistory грузил
        // историю заново КАЖДЫЙ раз. scRenderHistory clear+rerender + dedup
        // через textContent имел edge cases (markdown rendering / whitespace
        // norm), из-за чего после нескольких возвратов сообщения дублировались.
        // Фикс: НЕ сбрасываем флаг при навигации внутри сессии. История
        // загружается ОДИН раз за сессию (флаг persists). На page reload
        // (new session) — flag resets автоматически (window-level).
        // Новые сообщения добавляются live через scAppendMessage в DOM —
        // повторная загрузка не нужна.
        goToPage('soulChatPage');
      }
      window.goToSoulChat = goToSoulChat;
      // Печенька «расклад дня» → углубление: открыть Оракула с supportive вопросом дня (воронка).
      // Вопрос сформулирован позитивно → ответ Оракула опорный (+ гард в oracle_system.txt: без фатализма).
      window._askOracleAboutDay = function _askOracleAboutDay() {
        if (window.goToSoulChat) window.goToSoulChat();
        setTimeout(function () {
          var q = document.getElementById('scPageQuestion');
          if (q) {
            q.value = 'Помоги мягко прожить мой сегодняшний день — на что опереться и что в нём хорошего?';
            try { q.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            try { q.focus(); } catch (e) {}
          }
        }, 350);
      };

      /* ═══ Quick Action Presets ═══ */
      function applySongOfDayPreset(){
        var step1=document.querySelector('#formPage .step-panel[data-step="1"]');
        if(step1)step1.style.display='none';
        var profAcc=document.getElementById('profileAccordion');
        if(profAcc)profAcc.style.display='none';
        var step2=document.querySelector('#formPage .step-panel[data-step="2"]');
        if(step2)step2.style.display='none';
        var transitAcc=document.getElementById('transitAccordion');
        if(transitAcc)transitAcc.style.display='none';
        var reqEl=document.getElementById('request');
        var requestField=reqEl&&reqEl.closest('.field');
        if(requestField)requestField.style.display='none';
        var badge3=document.getElementById('formStepBadge3');
        if(badge3)badge3.style.display='none';
      }
      // Сброс формы в полный режим: отменяет все inline display:none от пресетов.
      // Вызывается при клике на «Получить свою песню» — полная форма со всеми полями.
      function resetFormToFullMode(){
        var step1=document.querySelector('#formPage .step-panel[data-step="1"]');
        if(step1)step1.style.display='';
        var profAcc=document.getElementById('profileAccordion');
        if(profAcc)profAcc.style.display='';
        var step2=document.querySelector('#formPage .step-panel[data-step="2"]');
        if(step2)step2.style.display='';
        var reqEl=document.getElementById('request');
        var requestField=reqEl&&reqEl.closest('.field');
        if(requestField)requestField.style.display='';
        var badge3=document.getElementById('formStepBadge3');
        if(badge3)badge3.style.display='';
        // Сброс preset-loading класса
        var fp=document.getElementById('formPage');
        if(fp)fp.classList.remove('preset-loading');
        // Сброс стиля на дефолтный (ручной)
        if(typeof setStyleMode==='function')setStyleMode('manual');
        // Голос песни — тоже к дефолту: форма открывается заново, чужой текст тут не к месту
        var clEl=document.getElementById('customLyrics');
        if(clEl)clEl.value='';
        if(typeof window.setLyricsMode==='function')window.setLyricsMode('sung');
      }

      function handleQuickAction(action){
        var fp=document.getElementById('formPage');
        function presetStart(){if(fp)fp.classList.add('preset-loading');}
        // Batch 10.2 (отчёт 7267953 Windows): presetDone() снимал
        // .preset-loading мгновенно после sync-блока, но на медленных
        // машинах фактическое заполнение полей и применение пресета
        // (applySongOfDayPreset, fillFormFromProfile) выполнялись микро-
        // задачами позже — и юзер видел доли секунды «дефолтную форму».
        // Снимаем класс через 2 кадра rAF — гарантируем что layout
        // и стилизация уже обновлены.
        function presetDone(){
          if(!fp) return;
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){
              fp.classList.remove('preset-loading');
            });
          });
        }
        switch(action){
          case 'song_of_day':
            window._formPreset={mode:'transit',quickId:'song_of_day'};
            presetStart();
            goToPage('formPage');
            setTimeout(async function(){
              if(!window._savedFormProfile||!window._savedFormProfile.name){
                await loadSavedProfileForForm();
              }
              var b=document.querySelector('.mode-btn[data-mode="transit"]');if(b)b.click();
              if(typeof fillFormFromProfile==='function')fillFormFromProfile(window._savedFormProfile||getCachedProfile());
              var now=new Date();
              var td=document.getElementById('transitDate');
              if(td){td.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');if(typeof updateDateSelectsFromInput==='function')updateDateSelectsFromInput('transitDate');}
              var tt=document.getElementById('transitTime');
              if(tt)tt.value=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
              var bp=document.getElementById('birthplace'),tl=document.getElementById('transitLocation');
              if(bp&&tl&&bp.value&&!tl.value)tl.value=bp.value;
              if(typeof updateTransitAccordionSummary==='function')updateTransitAccordionSummary();
              applySongOfDayPreset();
              window._formPreset=null;
              presetDone();
            },200);
            break;
          case 'quick_song':
          case 'who_am_i':
            window._formPreset={mode:'single',quickId:'who_am_i'};
            presetStart();
            goToPage('formPage');
            setTimeout(function(){
              var b=document.querySelector('.mode-btn[data-mode="single"]');if(b)b.click();
              if(typeof fillFormFromProfile==='function')fillFormFromProfile(window._savedFormProfile||getCachedProfile());
              applySongOfDayPreset();
              window._formPreset=null;
              presetDone();
            },200);
            break;
          case 'star_style':
            window._formPreset={mode:'single',quickId:'star_style'};
            presetStart();
            goToPage('formPage');
            setTimeout(function(){
              var b=document.querySelector('.mode-btn[data-mode="single"]');if(b)b.click();
              if(typeof fillFormFromProfile==='function')fillFormFromProfile(window._savedFormProfile||getCachedProfile());
              if(typeof setStyleMode==='function')setStyleMode('star');
              applySongOfDayPreset();
              window._formPreset=null;
              presetDone();
            },200);
            break;
          case 'couple_song':
            window._formPreset={mode:'couple',quickId:'couple_song'};
            presetStart();
            goToPage('formPage');
            setTimeout(function(){
              var b=document.querySelector('.mode-btn[data-mode="couple"]');if(b)b.click();
              if(typeof fillFormFromProfile==='function')fillFormFromProfile(window._savedFormProfile||getCachedProfile());
              var step1=document.querySelector('#formPage .step-panel[data-step="1"]');
              if(step1)step1.style.display='none';
              var badge2=document.getElementById('formStepBadge2');
              if(badge2)badge2.style.display='none';
              window._formPreset=null;
              presetDone();
            },200);
            break;
          case 'soul_chat':
            if(typeof goToSoulChat==='function')goToSoulChat();
            break;
          case 'gift_song':
            window._formPreset={mode:'single',quickId:'gift_song',clearFields:true};
            goToPage('formPage');
            setTimeout(function(){
              var b=document.querySelector('.mode-btn[data-mode="single"]');if(b)b.click();
              ['name','birthplace'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
              var bd=document.getElementById('birthdate');if(bd){bd.value='';if(typeof updateDateSelectsFromInput==='function')updateDateSelectsFromInput('birthdate');}
              var bt=document.getElementById('birthtime');if(bt)bt.value='';
              var g=document.getElementById('gender');if(g)g.value='';
              window._formPreset=null;
            },200);
            break;
          default:goToPage('formPage');
        }
      }
      window.handleQuickAction=handleQuickAction;

      // Wire up all home-choice buttons with data-quick-action
      document.addEventListener('click',function(e){
        var btn=e.target.closest('[data-quick-action]');
        if(!btn)return;
        if(btn.closest('#webLoginScreen'))return;
        e.preventDefault();
        handleQuickAction(btn.getAttribute('data-quick-action'));
        // Batch 7.3 (ID 7256293 Windows Средний): «При нажатии "Попробуй сегодня"
        // не отображаются поля для ввода». Корень: если профиль уже создан,
        // pfa-accordion svернут (см. строку ~19423). Юзер кликнул quick action →
        // перешёл на formPage → видит свёрнутую секцию без полей.
        // Фикс: после quick action всегда разворачиваем поля чтобы юзер видел форму.
        setTimeout(function(){
          var formWrap = document.getElementById('formFieldsWrap');
          if (formWrap && formWrap.classList.contains('pfw-collapsed')) {
            formWrap.classList.remove('pfw-collapsed');
            var chevron = document.getElementById('pfaChevron');
            if (chevron) chevron.classList.add('open');
          }
        }, 250);
      });

      // ============================================================================
      // DIARY (inside Oracle) — JS логика Дневника внутри Оракула
      // ============================================================================
      var _diaryFeedOffset = 0;
      var _diaryFeedTotal = 0;
      var _diarySelectedTopics = [];
      var _diaryInitialized = false;

      // Batch 9.34 (отчёт 7263825): темы дневника были захардкожены на русском.
      // На FR/EN/DE тестер видел смесь «Configure ton journal» (переведено) +
      // «Карьера/Решения и финансы» (не переведено). Теперь lookup через t().
      var ORACLE_TOPICS = [
        { id: 'career',         icon: '💼', labelKey: 'diaryTopicCareerLabel',         descKey: 'diaryTopicCareerDesc' },
        { id: 'relationships',  icon: '❤️', labelKey: 'diaryTopicRelationshipsLabel',  descKey: 'diaryTopicRelationshipsDesc' },
        { id: 'health',         icon: '🧘', labelKey: 'diaryTopicHealthLabel',         descKey: 'diaryTopicHealthDesc' },
        { id: 'growth',         icon: '🌱', labelKey: 'diaryTopicGrowthLabel',         descKey: 'diaryTopicGrowthDesc' },
        { id: 'creativity',     icon: '🎨', labelKey: 'diaryTopicCreativityLabel',     descKey: 'diaryTopicCreativityDesc' },
        { id: 'transformation', icon: '🔄', labelKey: 'diaryTopicTransformationLabel', descKey: 'diaryTopicTransformationDesc' },
        { id: 'purpose',        icon: '🌟', labelKey: 'diaryTopicPurposeLabel',        descKey: 'diaryTopicPurposeDesc' },
        { id: 'peace',          icon: '🌙', labelKey: 'diaryTopicPeaceLabel',          descKey: 'diaryTopicPeaceDesc' },
      ];
      // Хелпер: возвращает локализованную label/desc темы (fallback на RU).
      // Принимает и объект темы из ORACLE_TOPICS, и голую строку-код: лента дневника
      // передаёт код из msg.focus_topics[0]. Раньше строка давала undefined в fb и в
      // labelKey — заголовком записи в ленте вставало слово «undefined».
      function _oracleTopicById(topic) {
        if (topic && typeof topic === 'object') return topic;
        for (var i = 0; i < ORACLE_TOPICS.length; i++) if (ORACLE_TOPICS[i].id === topic) return ORACLE_TOPICS[i];
        return { id: String(topic || '') };
      }
      function _oracleTopicLabel(topic) {
        topic = _oracleTopicById(topic);
        var fb = { career: 'Карьера', relationships: 'Отношения', health: 'Здоровье', growth: 'Рост', creativity: 'Творчество', transformation: 'Перемены', purpose: 'Путь', peace: 'Покой' }[topic.id] || topic.id;
        return (typeof t === 'function' && topic.labelKey) ? (t(topic.labelKey) || fb) : fb;
      }
      function _oracleTopicDesc(topic) {
        topic = _oracleTopicById(topic);
        var fb = { career: 'Решения и финансы', relationships: 'Динамика с близкими', health: 'Энергия и тело', growth: 'Привычки и развитие', creativity: 'Вдохновение', transformation: 'Трансформация', purpose: 'Смысл и миссия', peace: 'Баланс и опора' }[topic.id] || '';
        return (typeof t === 'function' && topic.descKey) ? (t(topic.descKey) || fb) : fb;
      }

      // ── Tab switching: Чат ↔ Дневник ↔ Разборы ──
      // Batch 9.32 (КОРНЕВАЯ ПРИЧИНА split-screen регрессии 12.05): переписано
      // согласно ЗАКОНУ №15 проекта — «CSS по data-state, JS ТОЛЬКО state».
      //
      // Раньше switchOracleTab прямо ставил inline style.display='flex'/'none'
      // на pane-ы и inline style.background/color/borderColor на табы.
      // Это нарушение архитектуры приводило к регрессии: inline стили
      // «прилипали» к элементам и не сбрасывались при следующих переходах,
      // вызывая split-screen (одновременно видны promo+prism).
      //
      // Теперь: только переключаем data-state на pageEl + class на табах.
      // ВСЯ видимость — через CSS правила #soulChatPage[data-state="..."] ...
      // (закон №15). Дополнительно сбрасываем inline display, оставленный
      // legacy-кодом (showPromo/showChat ещё используют inline, переписать
      // отдельно).
      function switchOracleTab(tab) {
        var pageEl = document.getElementById('soulChatPage');
        if (!pageEl) return;

        // Обычный вход в оракул сбрасывает контекст разбора-призмы (askAboutPrism ставит
        // его ПОСЛЕ этого вызова) — чтобы плашка «ваш разбор «X»» не висела при повторном
        // заходе без разбора. Алла 06.07.
        try { window._oraclePrismContext = null; } catch(_) {}

        // 1. Таб-активность — ТОЛЬКО через class. Стили в CSS .sc-oracle-tab.is-active.
        var tabs = document.querySelectorAll('#scOracleTabs .sc-oracle-tab');
        tabs.forEach(function(t) {
          var _act = t.getAttribute('data-tab') === tab;
          t.classList.toggle('is-active', _act);
          // .on — имя активной вкладки в эталоне; is-active оставлен, на нём висят
          // прежние правила и проверки.
          t.classList.toggle('on', _act);
          // Чистим inline-стили оставленные legacy switchOracleTab — иначе
          // overrides CSS-классов is-active.
          t.style.removeProperty('background');
          t.style.removeProperty('color');
          t.style.removeProperty('border-color');
          t.style.removeProperty('borderColor');
        });

        // 2. Чистим inline display у ВСЕХ зон — оставленный legacy showPromo/
        //    showChat и старым switchOracleTab. После этого видимостью
        //    управляет ИСКЛЮЧИТЕЛЬНО CSS по data-state.
        var ids = ['scPromoArea', 'scPageChat', 'scInputArea', 'scChatHeader',
                   'scDiaryPane', 'scPrismPane', 'scGlobalLoading'];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el) el.style.removeProperty('display');
        }

        // 3. Определяем следующее data-state.
        var nextState;
        if (tab === 'chat') {
          // Batch 8.7 (7263772 Android Высокий): «Пустая вкладка чат при повторных
          // переходах». Если был в diary/prism, восстанавливаем prev (chat или promo).
          // Алла 19.06 «этой страницы вообще не должно быть»: чат-таб ВСЕГДА открывается в
          // эталонный чат (intro + qa-карточки + composer = value-first закон №13). Промо-стат-
          // экран ('promo' со статами 78%/91%) убран из входа — paywall на отправке вопроса
          // (бэк 402 → подсказка про Искру), а не на входе. Раньше: !hasAccess → 'promo' (статы).
          nextState = 'chat';
          // Batch 10.2 (отчёт 7267740 Android): при возврате в Чат из
          // другой вкладки оставалось прежнее положение прокрутки —
          // визуально шапка YupSoul Chat «улетала» к центру с пустотой
          // сверху. Подскролливаем к самому свежему сообщению.
          // Batch 10.10 (отчёт 7271879 Windows, регрессия 10.2): после diary→chat
          // ResizeObserver не пересчитывал --sc-input-h (input area был display:none).
          // Возникало пустое пространство снизу + прыжки при скролле. Пересчитываем
          // observer ПЕРЕД scrollChatToBottom через 2 rAF, чтобы layout закончил
          // переключение data-state="chat" и input area получил реальные размеры.
          if (nextState === 'chat') {
            requestAnimationFrame(function() {
              requestAnimationFrame(function() {
                try { if (typeof window._scInitInputHeightObserver === 'function') window._scInitInputHeightObserver(); } catch (_) {}
                try { if (typeof window.scrollChatToBottom === 'function') window.scrollChatToBottom(); } catch (_) {}
              });
            });
          }
        } else if (tab === 'diary') {
          pageEl._prevState = pageEl.dataset.state;
          nextState = 'diary';
        } else if (tab === 'prism') {
          pageEl._prevState = pageEl.dataset.state;
          nextState = 'prism';
          // Batch 10.30 (отчёт 7257200 Android): «При повторном открытии Разборы
          // остаётся виден раздел Чат». Возможна race с инициализацией если
          // initSoulChatPage параллельно ставит state='chat'. Принудительно
          // hide chatEl/inputArea на смене таба (CSS !important должен сработать,
          // но добавим explicit style как defense-in-depth).
          requestAnimationFrame(function() {
            var _chatEl = document.getElementById('scPageChat');
            var _inputArea = document.getElementById('scInputArea');
            var _chatHdr = document.getElementById('scChatHeader');
            if (_chatEl) _chatEl.style.display = 'none';
            if (_inputArea) _inputArea.style.display = 'none';
            if (_chatHdr) _chatHdr.style.display = 'none';
          });
        } else {
          return;
        }
        pageEl.dataset.state = nextState;

        // 4. Pane-specific init (логика — НЕ управление видимостью).
        if (tab === 'diary') {
          if (!_diaryInitialized) initDiaryPane();
        } else if (tab === 'prism') {
          // Batch 9.8 (отчёт 7263143): сбрасываем prism result при входе на таб.
          var _prismResultEl = document.getElementById('scPrismResult');
          if (_prismResultEl) {
            _prismResultEl.style.display = 'none';
            _prismResultEl.innerHTML = '';
            _prismResultEl._rawText = '';
          }
          try {
            _prismCurrentTarget = null;
            _prismInProgress = false;
            _prismPreloadInFlight = false;
          } catch(_) {}
          if (typeof window.initPrismPane === 'function') window.initPrismPane();
        }
      }
      window.switchOracleTab = switchOracleTab;

      // ══ Soul Chat «Разборы» — логика таба (14 призм) ══
      var _prismCatalogCache = null;
      var _prismInProgress = false;
      // VK Testers 7259253 ПЕРЕОТКРЫТ-2 (Тамара Android 12 16.05): «Результат
      // разбора недоступен после повторного входа». Корень: _prismResultsCache
      // только in-memory → при reload/повторном входе ТЕРЯЕТСЯ. Backend
      // возвращает 402 trial_used (раз уже использовано) → фронт показывает
      // ошибку, не показывая ранее полученный результат.
      // Фикс: persist в sessionStorage. При reload — восстанавливаем кэш
      // оттуда → клик на призму показывает результат мгновенно без API call.
      var _PRISM_CACHE_SS_KEY = 'yupsoul:prismCache:v1';
      var _prismResultsCache = (function loadPrismCache() {
        try {
          var raw = sessionStorage.getItem(_PRISM_CACHE_SS_KEY);
          if (raw) return JSON.parse(raw) || {};
        } catch(_) {}
        return {};
      })();
      function _savePrismCache() {
        try {
          // sessionStorage квота 5MB — наш кэш ≪100KB, ok.
          sessionStorage.setItem(_PRISM_CACHE_SS_KEY, JSON.stringify(_prismResultsCache));
        } catch(_) {}
      }
      var _prismPreloadInFlight = false;
      // Текущий «целевой» код призмы, который хочет видеть пользователь.
      // Меняется на каждом клике. Стрим-reader сверяется с ним при получении
      // результата: совпало → рендерим. Если кликнули другую призму на paywall
      // (кнопка «Попробовать подарочный разбор»), target меняется и стрим
      // отрендерит именно новую призму, когда её result придёт.
      var _prismCurrentTarget = null;

      window.initPrismPane = async function initPrismPane() {
        var listEl = document.getElementById('scPrismList');
        if (!listEl) return;
        // Практика грузится параллельно каталогу: свой silent retry, свои ошибки
        // глотает сама — разборы не должны ждать её и не должны из-за неё падать.
        try { window.loadAskeza(); } catch (e) { console.warn('[Askeza] load', e); }
        if (_prismCatalogCache) {
          renderPrismCatalog(_prismCatalogCache);
          return;
        }
        // owned запрашиваем заново при каждом входе (могли открыть разбор с другого
        // устройства), а каталог кэшируем — он статичный.
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
        var lang = (typeof window._currentLang === 'string' ? window._currentLang : 'ru') || 'ru';
        // Batch 10.19 (закон №37): silent retry. Online → продолжаем тихо. Offline → overlay.
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
            var res = await fetchWithTimeout(apiBase + '/api/soul-chat/prism-catalog?lang=' + encodeURIComponent(lang), { headers: headers }, 20000);
            var json = await res.json().catch(function(){ return {}; });
            if (res.ok && json.success && Array.isArray(json.catalog)) {
              _prismCatalogCache = json.catalog;
              window._prismOwned = {};
              (Array.isArray(json.owned) ? json.owned : []).forEach(function(c){ window._prismOwned[c] = true; });
              renderPrismCatalog(json.catalog);
              return;
            }
          } catch (e) { console.warn('[Prism] silent retry', e); }
          _att++;
          if (_att >= 4) return; // тихо сдаёмся — пользователь сам перезагрузит
          await new Promise(function(r){ setTimeout(r, Math.min(20000, 1500 * Math.pow(1.7, _att))); });
        }
      };

      // ═══════════════════════════════════════════════════════════════════
      // Аскеза — практика на 21 день (docs/askezy-planetam.md).
      // Разбор читают один раз, практику делают три недели: у неё есть
      // состояние на сервере и отметка дня. Ядро (что держать / нельзя /
      // делать / срыв) приходит константой, персональный слой — от модели.
      // ═══════════════════════════════════════════════════════════════════
      var _askezaState = null;

      function _askezaApi() {
        return (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
      }
      function _askezaHeaders(json) {
        var h = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
        if (json) h = Object.assign({ 'Content-Type': 'application/json' }, h);
        return h;
      }

      // Загрузка состояния практики. Закон №37: online → тихие повторы, offline → overlay.
      window.loadAskeza = async function loadAskeza() {
        var entry = document.getElementById('scAskezaEntry');
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
            var res = await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza', { headers: _askezaHeaders() }, 20000);
            var json = await res.json().catch(function(){ return {}; });
            if (res.ok && json.success) {
              _askezaState = json;
              if (entry) {
                entry.style.display = '';
                var note = document.getElementById('scAskezaEntryNote');
                if (note) {
                  if (json.state === 'active') {
                    var done = (json.days_done || []).length;
                    note.textContent = t('askezaEntryProgress').replace('{done}', done).replace('{total}', json.days || 21);
                  } else {
                    note.textContent = t('askezaEntryNote');
                  }
                }
              }
              return json;
            }
            // Нет данных рождения — вход в практику просто не показываем.
            if (res.status === 409) { if (entry) entry.style.display = 'none'; return null; }
          } catch (e) { console.warn('[Askeza] silent retry', e); }
          _att++;
          if (_att >= 4) return null;
          await new Promise(function(r){ setTimeout(r, Math.min(20000, 1500 * Math.pow(1.7, _att))); });
        }
      };

      function _askezaList(el, items) {
        if (!el) return;
        el.innerHTML = '';
        if (typeof items === 'string') items = items.trim() ? [items] : [];
        if (!Array.isArray(items)) items = [];
        items.forEach(function(text){
          var li = document.createElement('li');
          li.textContent = text;
          el.appendChild(li);
        });
      }

      function _askezaSpan(cls, text) {
        var s = document.createElement('span');
        s.className = cls;
        s.textContent = text || '';
        return s;
      }

      // Строка раскрытой карточки выбора: подпись над текстом — на две колонки ширины карточки не хватает.
      function _askezaPlanetRow(mod, label, text) {
        var row = _askezaSpan('sc-askeza-planet-row ' + mod, '');
        row.appendChild(_askezaSpan('sc-askeza-planet-row-l', label));
        row.appendChild(_askezaSpan('sc-askeza-planet-row-v', text));
        return row;
      }

      // «Аскеза Юпитера», «Начать аскезу Юпитера»: родительный падеж есть только в русском,
      // остальные языки получают имя как есть.
      function _askezaPlanetName(p) {
        if (!p) return '';
        var nom = p.name_ru || p.planet_ru || '';
        var gen = p.name_gen || p.planet_gen || '';
        return ((window.currentLang || 'ru') === 'ru' && gen) ? gen : nom;
      }

      function _askezaRenderGrid(card, daysDone, total, todayN) {
        var grid = document.getElementById('scAskezaGrid');
        if (!grid) return;
        var done = {};
        (daysDone || []).forEach(function(d){ done[Number(d)] = true; });
        var warn = {};
        ((card && card.beats) || []).forEach(function(b){ if (b && b.day) warn[Number(b.day)] = true; });
        grid.innerHTML = '';
        for (var d = 1; d <= total; d++) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sc-askeza-cell';
          btn.dataset.day = String(d);
          if (warn[d]) btn.dataset.warn = '1';
          if (d === todayN) btn.classList.add('is-today');
          else if (d < todayN && !done[d]) btn.classList.add('is-missed');
          btn.textContent = String(d);
          btn.setAttribute('aria-label', t('askezaDayAria').replace('{n}', d));
          btn.setAttribute('aria-pressed', done[d] ? 'true' : 'false');
          grid.appendChild(btn);
        }
        var streak = 0;
        for (var i = 1; i <= total; i++) { if (done[i]) streak++; else break; }
        var se = document.getElementById('scAskezaStreak'); if (se) se.textContent = String(streak);
        var te = document.getElementById('scAskezaTotal'); if (te) te.textContent = String((daysDone || []).length);
      }

      // «Почему эта твоя» модель дописывает после старта, около минуты. Ждём не дольше 5 минут:
      // если бот перезапустился посреди работы модели, статус так и остался бы pending.
      function _askezaWhyPending(state) {
        var card = state && state.card;
        if (!card || state.state !== 'active' || card.why || card.why_status !== 'pending') return false;
        var age = Date.now() - new Date(state.started_at || 0).getTime();
        return age >= 0 && age < 5 * 60 * 1000;
      }
      var _askezaWhyTimer = null;
      function _askezaWatchWhy() {
        if (_askezaWhyTimer || !_askezaWhyPending(_askezaState)) return;
        _askezaWhyTimer = setTimeout(async function () {
          _askezaWhyTimer = null;
          if (!_askezaWhyPending(_askezaState)) return;
          var planetNow = _askezaState.planet;
          try {
            if (navigator.onLine !== false) {
              var r = await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza', { headers: _askezaHeaders() }, 20000);
              var j = await r.json().catch(function () { return {}; });
              // Пока шёл запрос, практику могли перезапустить — чужой ответ не рисуем.
              if (r.ok && j.success && j.state === 'active' && _askezaState && _askezaState.state === 'active' && j.planet === planetNow) {
                _askezaState = j;
                window.renderAskeza(j);
              }
            }
          } catch (e) { console.warn('[Askeza] why', e); }
          _askezaWatchWhy();
        }, window._askezaWhyPollMs || 12000);
      }

      window.renderAskeza = function renderAskeza(state) {
        if (!state || !state.card) return;
        var card = state.card;
        var active = state.state === 'active';

        var titleEl = document.getElementById('scAskezaTitle');
        if (titleEl) titleEl.textContent = t('askezaTitle');

        var coreEl = document.getElementById('scAskezaCore');
        if (coreEl) coreEl.textContent = card.core || '';

        var whyWrap = document.getElementById('scAskezaWhyWrap');
        var whyEl = document.getElementById('scAskezaWhy');
        if (whyWrap && whyEl) {
          // Пока модель дописывает текст, блок уже на месте с «Дописываю…» — текст встаёт в него,
          // и экран не прыгает.
          var whyPending = !card.why && _askezaWhyPending(state);
          whyEl.classList.toggle('is-pending', whyPending);
          if (card.why) { whyEl.textContent = card.why; whyWrap.style.display = ''; }
          else if (whyPending) { whyEl.textContent = t('askezaWhyPending'); whyWrap.style.display = ''; }
          else { whyWrap.style.display = 'none'; }
        }

        // Что изменится за 21 день — практика держит в поле зрения, ради чего она.
        var outWrap = document.getElementById('scAskezaOutcomeWrap');
        var outEl = document.getElementById('scAskezaOutcome');
        if (outWrap && outEl) {
          outEl.textContent = card.outcome || '';
          outWrap.style.display = card.outcome ? '' : 'none';
        }

        _askezaList(document.getElementById('scAskezaAction'), card.action);
        _askezaList(document.getElementById('scAskezaBan'), card.ban);

        var failEl = document.getElementById('scAskezaFail');
        if (failEl) failEl.textContent = card.fail || '';
        var failNote = document.querySelector('#scAskezaScreen .sc-askeza-rule-note');
        if (failNote) {
          var same = card.fail && failNote.textContent.trim() === String(card.fail).trim();
          failNote.style.display = (card.fail && same) ? 'none' : '';
        }

        // Где сломает: константы плюс персональная строка, если модель её дала.
        var beatsWrap = document.getElementById('scAskezaBeatsWrap');
        var beatsEl = document.getElementById('scAskezaBeats');
        if (beatsWrap && beatsEl) {
          beatsEl.innerHTML = '';
          var beats = (card.beats || []).slice();
          beats.forEach(function(b){
            var row = document.createElement('div');
            row.className = 'sc-askeza-beat';
            var d = document.createElement('div');
            d.className = 'sc-askeza-beat-day';
            d.textContent = t('askezaDayShort').replace('{n}', b.day);
            var p = document.createElement('p');
            p.textContent = b.text || '';
            row.appendChild(d); row.appendChild(p);
            beatsEl.appendChild(row);
          });
          if (card.personal_beat) {
            var row2 = document.createElement('div');
            row2.className = 'sc-askeza-beat';
            var d2 = document.createElement('div');
            d2.className = 'sc-askeza-beat-day';
            d2.textContent = t('askezaBeatYou');
            var p2 = document.createElement('p');
            p2.textContent = card.personal_beat;
            row2.appendChild(d2); row2.appendChild(p2);
            beatsEl.appendChild(row2);
          }
          beatsWrap.style.display = beatsEl.children.length ? '' : 'none';
        }

        // Что важно проработать: до старта показываем расчёт, после — только выбранное.
        // Раскрыта одна карточка — выбранная: сфера жизни, что это за планета словами,
        // что изменится и что делать 21 день. Остальные свёрнуты до двух строк: выбирают
        // из одной рекомендации, а не из трёх простыней (Хик; Алла 11.09 «не понятно читаются»).
        var picker = document.getElementById('scAskezaPicker');
        var pickerList = document.getElementById('scAskezaPickerList');
        if (picker && pickerList) {
          var ranked = state.ranked || [];
          if (!active && ranked.length) {
            pickerList.innerHTML = '';
            ranked.forEach(function(p, i){
              var picked = p.planet === state.planet;
              var row = document.createElement('button');
              row.type = 'button';
              row.className = 'sc-askeza-planet' + (picked ? ' is-picked' : '');
              row.dataset.planet = p.planet;
              row.setAttribute('aria-expanded', picked ? 'true' : 'false');
              var rank = document.createElement('span');
              rank.className = 'sc-askeza-planet-rank';
              rank.textContent = String(i + 1);
              var body = document.createElement('span');
              body.className = 'sc-askeza-planet-body';
              // Сфера жизни — первой; старый ответ сервера без неё показывает имя планеты.
              body.appendChild(_askezaSpan('sc-askeza-planet-cap', p.sphere || p.name_ru));
              if (p.about) {
                body.appendChild(_askezaSpan('sc-askeza-planet-about', p.about));
                if (picked && p.stuck) body.appendChild(_askezaSpan('sc-askeza-planet-stuck', p.stuck));
              } else if (p.debt) {
                body.appendChild(_askezaSpan('sc-askeza-planet-debt', p.debt));
              }
              if (picked) {
                if (p.outcome) body.appendChild(_askezaPlanetRow('is-outcome', t('askezaOutcomeLabel'), p.outcome));
                if (p.core) body.appendChild(_askezaPlanetRow('is-core', t('askezaCoreShort'), p.core));
                if (p.action) body.appendChild(_askezaPlanetRow('is-do', t('askezaDailyLabel'), p.action));
                if (p.ban) body.appendChild(_askezaPlanetRow('is-ban', t('askezaBanLabel'), p.ban));
              }
              row.appendChild(rank); row.appendChild(body);
              pickerList.appendChild(row);
            });
            picker.style.display = '';
          } else {
            picker.style.display = 'none';
          }
        }

        var titleTop = document.getElementById('scAskezaTitle');
        if (titleTop) {
          var cur = (state.ranked || []).find(function(p){ return p.planet === state.planet; });
          // До старта заголовок общий: планету называет карточка, в шапке она путала бы выбор.
          var planetName = active ? _askezaPlanetName(cur || card) : '';
          titleTop.textContent = planetName ? (t('askezaTitlePrefix') + ' ' + planetName) : t('askezaTitleFallback');
        }

        var trackWrap = document.getElementById('scAskezaTrackWrap');
        if (trackWrap) trackWrap.style.display = active ? '' : 'none';
        var startBtn = document.getElementById('scAskezaStart');
        var restartBtn = document.getElementById('scAskezaRestart');
        var finalBtn = document.getElementById('askFinalCta');
        var note = document.getElementById('askCtaNote');

        // Какой сегодня день практики: считаем от даты старта, а не от числа отметок —
        // иначе пропущенный день сдвигал бы «сегодня» и пропуск нельзя было бы увидеть.
        var total = Number(state.days) || 21;
        var doneArr = state.days_done || [];
        var todayN = 0;
        if (active && state.started_at) {
          var st = new Date(state.started_at);
          var d0 = new Date(st.getFullYear(), st.getMonth(), st.getDate());
          var n0 = new Date();
          var diff = Math.floor((new Date(n0.getFullYear(), n0.getMonth(), n0.getDate()) - d0) / 86400000);
          todayN = Math.min(total, Math.max(1, diff + 1));
        }
        var finished = active && doneArr.length >= total;
        var page = document.getElementById('soulChatPage');
        if (page) page.setAttribute('data-ask', finished ? 'final' : (active ? 'active' : 'picker'));

        if (active) _askezaRenderGrid(card, doneArr, total, finished ? 0 : todayN);

        // «Где я»: день N из 21 + полоса + сколько впереди
        var stDay = document.getElementById('askStatusDay');
        var stBar = document.getElementById('askStatusBar');
        var stLeft = document.getElementById('askStatusLeft');
        if (stDay) stDay.textContent = String(t('askezaStatus')).replace('{n}', todayN).replace('{m}', total);
        if (stBar) stBar.style.width = Math.round((doneArr.length / total) * 100) + '%';
        if (stLeft) stLeft.textContent = String(t('askezaStatusLeft')).replace('{n}', Math.max(0, total - todayN));

        // Одно действие дня + отметка
        var tLab = document.getElementById('askTodayLabel');
        var tTxt = document.getElementById('askTodayText');
        var markBtn = document.getElementById('askMark');
        if (tLab) tLab.textContent = String(t('askezaTodayLabel')).replace('{n}', todayN);
        // «Сегодня» — дело дня, а не формулировка на 21 день: она ниже, в «Что держать».
        var todayDo = Array.isArray(card.action) ? card.action.join(' ') : (card.action || '');
        if (tTxt) tTxt.textContent = todayDo || card.core || '';
        if (markBtn) {
          var markedToday = doneArr.map(Number).indexOf(todayN) !== -1;
          markBtn.textContent = t(markedToday ? 'askezaMarkedBtn' : 'askezaMarkBtn');
          markBtn.dataset.day = String(todayN);
        }

        // Финал 21-го дня
        if (finished) {
          var best = 0, run = 0, set = {};
          doneArr.forEach(function (d) { set[Number(d)] = true; });
          for (var i = 1; i <= total; i++) { if (set[i]) { run++; if (run > best) best = run; } else run = 0; }
          var ft = document.getElementById('askFinalTotal'); if (ft) ft.textContent = String(doneArr.length);
          var fs = document.getElementById('askFinalStreak'); if (fs) fs.textContent = String(best);
          var fm = document.getElementById('askFinalMissed'); if (fm) fm.textContent = String(Math.max(0, total - doneArr.length));
          // Пик-энд: финал называет, что должно было измениться, — человек сверяет с собой.
          var fo = document.getElementById('askFinalOutcome'); if (fo) fo.textContent = card.outcome || '';
          var foWrap = document.getElementById('askFinalOutcomeWrap'); if (foWrap) foWrap.style.display = card.outcome ? '' : 'none';
        }

        // Подвал: один primary на состояние
        if (startBtn) {
          startBtn.style.display = active ? 'none' : '';
          var cur2 = (state.ranked || []).find(function (p) { return p.planet === state.planet; });
          if (cur2) startBtn.textContent = String(t('askezaStartWith')).replace('{planet}', _askezaPlanetName(cur2)).replace('{n}', total);
        }
        if (note) note.style.display = active ? 'none' : '';
        if (restartBtn) restartBtn.style.display = (active && !finished) ? '' : 'none';
        if (finalBtn) {
          finalBtn.style.display = finished ? '' : 'none';
          if (!finalBtn._wired) {
            finalBtn._wired = true;
            // Финал обещает следующую тему — ведём к выбору. Пройденную планету сервер в нём уже не ставит.
            finalBtn.addEventListener('click', async function () {
              if (!window._ensureOnline()) return;
              _askezaState = null;
              var next = await window.loadAskeza();
              if (next) window.renderAskeza(next);
              var pane = document.getElementById('scPrismPane');
              if (pane) pane.scrollTop = 0;
            });
          }
        }
        _askezaWatchWhy();
      };

      window.openAskeza = async function openAskeza() {
        var screen = document.getElementById('scAskezaScreen');
        // Каталог гасим целиком: заголовок, «Твоя карта» и прогресс живут в той же
        // обёртке. Пока их прятали по одному, шапка оставалась висеть над практикой.
        var cat = document.getElementById('scPrismCatalog');
        var result = document.getElementById('scPrismResult');
        if (!screen) return;
        if (cat) cat.style.display = 'none';
        if (result) result.style.display = 'none';
        screen.style.display = '';
        var state = _askezaState || await window.loadAskeza();
        if (state) window.renderAskeza(state);
        // Воронка раздела в analytics_events: сколько открывших экран жмут «Начать» (пара к askeza_start).
        var scPage = document.getElementById('soulChatPage');
        if (state && window._ysTrack) { try { window._ysTrack('askeza_open', { screen: scPage ? scPage.getAttribute('data-ask') : null }); } catch (_) {} }
      };

      window.closeAskeza = function closeAskeza() {
        var screen = document.getElementById('scAskezaScreen');
        var cat = document.getElementById('scPrismCatalog');
        if (screen) screen.style.display = 'none';
        if (cat) cat.style.display = '';
      };

      // Делегирование: экран собирается динамически, слушатели вешаем один раз.
      document.addEventListener('click', async function(e){
        var entry = e.target.closest && e.target.closest('#scAskezaEntry');
        if (entry) { e.preventDefault(); window.openAskeza(); return; }

        var back = e.target.closest && e.target.closest('#scAskezaBack');
        if (back) { e.preventDefault(); window.closeAskeza(); return; }

        var start = e.target.closest && e.target.closest('#scAskezaStart');
        if (start) {
          e.preventDefault();
          if (!window._ensureOnline()) return;
          start.disabled = true;
          var prev = start.textContent;
          start.textContent = t('askezaStarting');
          var sentPlanet = (_askezaState && _askezaState.planet) || '';
          var sentRank = ((_askezaState && _askezaState.ranked) || []).map(function (p) { return p.planet; }).indexOf(sentPlanet) + 1;
          var startStatus = 0;
          try {
            var res = await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza/start', {
              method: 'POST', headers: _askezaHeaders(true), body: JSON.stringify({ planet: sentPlanet })
            }, 25000); // старт больше не ждёт модель — обычного таймаута хватает (закон №36)
            startStatus = res.status;
            var json = await res.json().catch(function(){ return {}; });
            if (res.ok && json.success) { _askezaState = json; window.renderAskeza(json); }
          } catch (err) { console.warn('[Askeza] start', err); }
          // Воронка: какую тему по счёту берут и сколько стартов срывается (статус 0 — таймаут или сеть).
          if (window._ysTrack) { try { window._ysTrack('askeza_start', { planet: sentPlanet, rank: sentRank, status: startStatus }); } catch (_) {} }
          start.disabled = false;
          start.textContent = prev;
          return;
        }

        var restart = e.target.closest && e.target.closest('#scAskezaRestart');
        if (restart) {
          e.preventDefault();
          if (!window._ensureOnline()) return;
          try {
            await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza/restart', {
              method: 'POST', headers: _askezaHeaders(true), body: '{}'
            }, 20000);
            _askezaState = null;
            var fresh = await window.loadAskeza();
            if (fresh) window.renderAskeza(fresh);
          } catch (err) { console.warn('[Askeza] restart', err); }
          return;
        }

        var planetRow = e.target.closest && e.target.closest('.sc-askeza-planet');
        if (planetRow) {
          e.preventDefault();
          var code = planetRow.dataset.planet;
          if (_askezaState && _askezaState.state !== 'active' && code && code !== _askezaState.planet) {
            // Всё для раскрытой карточки уже пришло в списке — раскрываем без запроса к серверу.
            // Ядро и персональный слой практика получит на старте.
            _askezaState.planet = code;
            var picked = (_askezaState.ranked || []).find(function(p){ return p.planet === code; });
            if (picked) _askezaState.house = picked.house;
            window.renderAskeza(_askezaState);
            // Раскрытая карточка выросла — возвращаем её в поле зрения после раскладки (закон №30: 2× rAF).
            requestAnimationFrame(function(){ requestAnimationFrame(function(){
              var open = document.querySelector('#scAskezaPickerList .sc-askeza-planet.is-picked');
              if (open && open.scrollIntoView) open.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }); });
          }
          return;
        }

        // «Отметить день удержанным» — та же ручка, что и клетка сетки, но по сегодняшнему дню
        var mark = e.target.closest && e.target.closest('#askMark');
        if (mark) {
          e.preventDefault();
          if (!window._ensureOnline()) return;
          var mday = Number(mark.dataset.day);
          if (!mday) return;
          mark.disabled = true;
          try {
            var mr = await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza/day', {
              method: 'POST', headers: _askezaHeaders(true), body: JSON.stringify({ day: mday })
            }, 20000);
            var mj = await mr.json().catch(function () { return {}; });
            if (mr.ok && mj.success) {
              if (_askezaState) _askezaState.days_done = mj.days_done;
              if (_askezaState) window.renderAskeza(_askezaState);
            }
          } catch (err) { console.warn('[Askeza] mark', err); }
          mark.disabled = false;
          return;
        }

        var cell = e.target.closest && e.target.closest('.sc-askeza-cell');
        if (cell) {
          e.preventDefault();
          if (!window._ensureOnline()) return;
          var day = Number(cell.dataset.day);
          var was = cell.getAttribute('aria-pressed') === 'true';
          cell.setAttribute('aria-pressed', was ? 'false' : 'true'); // оптимистично
          try {
            var r = await fetchWithTimeout(_askezaApi() + '/api/soul-chat/askeza/day', {
              method: 'POST', headers: _askezaHeaders(true), body: JSON.stringify({ day: day })
            }, 20000);
            var j = await r.json().catch(function(){ return {}; });
            if (r.ok && j.success) {
              if (_askezaState) _askezaState.days_done = j.days_done;
              var se = document.getElementById('scAskezaStreak'); if (se) se.textContent = String(j.streak);
              var te = document.getElementById('scAskezaTotal'); if (te) te.textContent = String(j.total);
            } else {
              cell.setAttribute('aria-pressed', was ? 'true' : 'false'); // откат
            }
          } catch (err) {
            cell.setAttribute('aria-pressed', was ? 'true' : 'false');
            console.warn('[Askeza] day', err);
          }
          return;
        }
      });

      // Каталог «Разборы» — разметка эталона design-export-fixed/showcase-oracle.html
      // (секция .s-cat): заголовок .h1/.h1-sub, «Твоя карта» .chart, прогресс .prog,
      // вход в аскезу .ask, карточки .pr с номером, названием, подписью и правым значком.
      // Тексты остаются нашими: описания — слова Аллы (4 призмы), у остальных описания нет
      // (не выдумываем), астротерминов из эталона не берём — «Твоя карта» это только дата.
      function renderPrismCatalog(catalog) {
        var listEl = document.getElementById('scPrismList');
        if (!listEl) return;
        var introEl = document.getElementById('scPrismIntro');

        // Контент карточек — слова Аллы из референса (4 призмы). Пока RU-only
        // (это её бренд-формулировки; переводы EN/DE/FR — отдельная задача после ревью).
        // Остальные 10 призм — без desc (НЕ выдумываем; Алла даст формулировки).
        var PRISM_META = {
          soul_name:       { desc: 'Тайное имя по дате рождения', tag: 'разбор', is_new: true },
          core:            { desc: 'Главная нота твоей личности', tag: 'разбор + песня' },
          forbidden_power: { desc: 'Дар, который ты боишься включить' },
          pair:            { desc: 'Совместимость по двум датам рождения', tag: 'разбор + дуэт' }
        };
        // Иконки — теги эталона showcase-oracle.html целиком, без width/height:
        // размеры задаёт его же CSS (.chart-art svg, .chk svg, .cost svg, .go svg).
        // «Твоя карта» — белый знак «Мандала-цветок» (icon-navigation-oracle из _icons.json) на янтарной
        // плитке в подаче аскезы (.ask-ic). Выбор Аллы 11.09 из трёх вариантов: прицел эталона и контурная
        // «Карта рождения» не подошли. Плитку рисует хвост стилей Оракула (.chart-art).
        var ICON_CHART = '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z"/><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z" transform="rotate(60 12 12)" opacity="0.84"/><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z" transform="rotate(120 12 12)" opacity="0.66"/><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z" transform="rotate(180 12 12)" opacity="0.54"/><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z" transform="rotate(240 12 12)" opacity="0.66"/><path d="M12 3.2c2.9 3.4 2.9 6.1 0 9.2-2.9-3.1-2.9-5.8 0-9.2Z" transform="rotate(300 12 12)" opacity="0.84"/></g><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';
        var ICON_EDIT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 20.4H20"/><path d="M15.6 3.9a2 2 0 0 1 2.8 2.8L7.4 17.8l-3.8 1 1-3.8z"/></svg>';
        var ICON_CHK   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>';
        var ICON_SPARK = '<svg viewBox="0 0 24 24"><path d="M12 2.2c0 5.36-4.44 9.8-9.8 9.8 5.36 0 9.8 4.44 9.8 9.8 0-5.36 4.44-9.8 9.8-9.8-5.36 0-9.8-4.44-9.8-9.8Z" fill="currentColor"/></svg>';
        var ICON_GO    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

        // Цена разбора Искрами. Эталон рисует 90 — это его демо-число; списывает
        // бэкенд ровно 100 (POST /api/soul-chat/prism), витрина обязана совпадать с чекаутом.
        var PRISM_PRICE_ISKRY = 100;

        var isSub = !!window._userHasSubscription;
        // Уже полученные разборы — с сервера (`owned` из prism-catalog). Замок ставим
        // только тому, чего у человека нет. До этого замок вешался по одной подписке:
        // кончилась подписка → 13 оплаченных разборов превращались в запертые карточки
        // с ценником «100 Искр» (Антон, 25.08.2026).
        var owned = window._prismOwned || {};
        // Шапка эталона (заголовок, «Твоя карта», прогресс) живёт в #scPrismIntro —
        // он стоит выше входа в аскезу, и порядок получается эталонный:
        // заголовок → карта → прогресс → аскеза → разборы. Узлы никуда не переносим:
        // #scAskezaEntry остаётся на месте вместе со своими слушателями.
        var _bd = (window._cachedProfile && window._cachedProfile.birthdate) || '';
        var _bdFmt = _formatBirthNoAstro(_bd);

        var _total = 0; for (var s0 = 0; s0 < catalog.length; s0++) _total += (catalog[s0].prisms || []).length;
        // Считаем по серверному owned + тому, что открыто в этой сессии. Раньше счётчик
        // жил только в sessionStorage: новая сессия → «получено 0 из 14» при 13 в базе.
        var _got = {};
        try {
          Object.keys(owned).forEach(function(c){ _got[c] = true; });
          Object.keys(_prismResultsCache || {}).forEach(function(c){ _got[c] = true; });
        } catch (e0) {}
        var _recv = Object.keys(_got).length;
        if (_recv > _total) _recv = _total;
        var _pct = _total ? Math.round(_recv / _total * 100) : 0;

        if (introEl) {
          introEl.style.display = '';
          introEl.innerHTML =
              '<h1 class="h1">' + _escHtml(_tl('scPrismTitle', 'Разборы')) + '</h1>'
            + '<p class="h1-sub">' + _escHtml(_tl('scPrismSubtitle', 'Загляни глубже — твоя карта, спетая вслух')) + '</p>'
            // «Твоя карта» — ТОЛЬКО дата рождения, БЕЗ знака/дома (закон проекта: без астротерминов)
            + '<button type="button" class="chart chart-chip" id="scChartChip">'
            +   '<span class="chart-art">' + ICON_CHART + '</span>'
            +   '<span class="chart-b"><span class="l">' + _escHtml(_tl('scChartLabel', 'Твоя карта')) + '</span>'
            +   '<b>' + (_bdFmt ? _escHtml(_bdFmt) : _escHtml(_tl('scChartNoDob', 'Добавь дату рождения'))) + '</b></span>'
            +   '<span class="chart-go">' + ICON_EDIT + '</span></button>'
            + '<div class="prog"><div class="prog-r">'
            +   '<span>' + _escHtml(_tl('scProgOpened', 'Открыто разборов')) + '</span>'
            +   '<b>' + _recv + ' / ' + _total + '</b></div>'
            +   '<span class="pbar"><i style="width:' + _pct + '%"></i></span></div>';
          var _chip = document.getElementById('scChartChip');
          if (_chip) _chip.addEventListener('click', function() {
            if (typeof goToPage === 'function') goToPage('profilePage');
            setTimeout(function() { var el = document.getElementById('profileMeBtn') || document.getElementById('profileDataCard'); /* CD 19.09: карточка «я» вместо аккордеона */ if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 350);
          });
        }

        // Разделы и карточки — разметка эталона: .sec-t (название + подпись раздела),
        // .pr с порядковым номером. Три состояния вместо двух: получен (галочка),
        // открыт, но не прочитан (стрелка), заперт (ценник). Классы pcard /
        // sc-prism-card / locked оставлены — на них висят клик, подсветка готовых
        // и снятие замка после покупки, плюс исключение из глобальной пилюли.
        var html = '';
        var _num = 0;
        for (var i = 0; i < catalog.length; i++) {
          var sec = catalog[i];
          html += '<div class="sec-t"><b>' + _escHtml(sec.title || '') + '</b>'
            + (sec.subtitle ? '<span>' + _escHtml(sec.subtitle) + '</span>' : '') + '</div>';
          for (var j = 0; j < (sec.prisms || []).length; j++) {
            var p = sec.prisms[j];
            var meta = PRISM_META[p.code] || {};
            var done = !!_got[p.code];
            var locked = !(done || isSub || p.code === 'soul_name');
            _num++;
            html += '<button type="button" class="pr pcard sc-prism-card ' + (done ? 'done' : (locked ? 'lock locked' : 'open'))
              + '" data-prism="' + _escAttr(p.code) + '">'
              + '<span class="pr-n">' + (_num < 10 ? '0' : '') + _num + '</span>'
              + '<span class="pr-b"><span class="pr-t"><b>' + _escHtml(p.title) + '</b>'
              + (meta.is_new && !done ? '<span class="badge">' + _escHtml(_tl('scPrismTagNew', 'Новое')) + '</span>' : '')
              + '</span>'
              + (meta.desc ? '<span class="pr-s">' + _escHtml(meta.desc) + '</span>' : '')
              + '</span>'
              + (done ? '<span class="chk">' + ICON_CHK + '</span>'
                      : locked ? '<span class="cost">' + ICON_SPARK + PRISM_PRICE_ISKRY + '</span>'
                               : '<span class="go">' + ICON_GO + '</span>')
              + '</button>';
          }
        }

        listEl.innerHTML = html;
        // Гонка locked-мигания (Алла 11.07): _userHasSubscription ставит только loadProfilePage
        // (профиль) — при прямом входе в «Разборы» рендер замораживал undefined → всё locked
        // + fallback-иконки. Дотягиваем статус и перерендериваем при расхождении (второй
        // проход увидит совпадение — рекурсия самогасится).
        (function(){
          var wasSub = !!window._userHasSubscription;
          var recheck = function(){ try { if (!!window._userHasSubscription !== wasSub) renderPrismCatalog(catalog); } catch(_) {} };
          if (window._userHasSubscription === undefined && typeof loadProfilePage === 'function') {
            try { loadProfilePage().then(recheck).catch(function(){}); } catch(_) { setTimeout(recheck, 1200); }
          } else { setTimeout(recheck, 1200); }
        })();

        // wiring: locked → мгновенный paywall без API; unlocked → runPrism
        var btns = listEl.querySelectorAll('.pcard');
        for (var k = 0; k < btns.length; k++) {
          btns[k].addEventListener('click', function(ev) {
            var btn = ev.currentTarget;
            var code = btn.getAttribute('data-prism');
            if (!code) return;
            if (btn.classList.contains('locked')) {
              // Разбор открывает подписка ИЛИ 100 Искр (первый «Имя души» — в подарок).
              // Хватает Искр → оффер «Открыть за 100 Искр»; не хватает → пакеты Искр.
              var _bal = (typeof getIskryBalance === 'function') ? getIskryBalance() : 0;
              var _ttlEl = btn.querySelector('.pr-t b');
              var _ttl = _ttlEl ? _ttlEl.textContent : code;
              renderPrismPayOffer(code, _ttl, _bal); // шторка покупки: ok→100 Искр, low→Пополнить
              return;
            }
            runPrism(code);
          });
        }
      }

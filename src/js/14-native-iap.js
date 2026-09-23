
      /* ══════════════════════════════════════════════════════════════════════
         НАТИВНОЕ ПРИЛОЖЕНИЕ (App Store / Google Play) — вход и покупки

         Модуль инертен вне Capacitor: window._isNativeApp ставится в бутстрапе
         шаблона, вне приложения его нет → веб/TG/VK/ОК не затронуты.

         Почему отдельный платёжный путь:
         • Apple 3.1.1 — цифровые товары продаются ТОЛЬКО через IAP. Stars,
           T-Bank, голоса VK и ОКи обязаны быть скрыты на .is-native, иначе
           отказ на ревью. ВНИМАНИЕ: CSS-гейт ещё не написан, класс есть —
           правил под него нет. Без него подавать в стор нельзя.
         • Apple 4.8 — при наличии сторонних входов обязателен Sign in with Apple.
           На нативе он единственный, поэтому требование закрыто по построению.

         Покупка идёт через RevenueCat SDK: он валидирует чек у Apple и дёргает
         наш вебхук, а тот выдаёт товар той же функцией grantPurchaseBySku, что
         Stars и T-Bank. Баланс на фронте обновляем после подтверждения сервера,
         не по факту нажатия — оптимистичное начисление даёт расхождение.
         ══════════════════════════════════════════════════════════════════════ */
      (function() {
        if (!window._isNativeApp) return;

        /* Адрес бэкенда. В соседних модулях его объявляют внутри каждой функции;
           здесь модуль целиком нативный, поэтому достаточно одного объявления на
           модуль. Под Capacitor origin равен capacitor://localhost, поэтому
           BACKEND_URL в бутстрапе шаблона уходит на боевой домен. */
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');

        var C = window.Capacitor;
        var plugin = function(name) {
          try {
            if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
            if (typeof C.registerPlugin === 'function') return C.registerPlugin(name);
          } catch(_) {}
          return null;
        };

        var Purchases = plugin('Purchases');
        /* Вход Apple живёт в @capgo/capacitor-social-login, а не в
           @capacitor-community/apple-sign-in: у последнего манифест требует
           capacitor-swift-pm 7.x, а RevenueCat — 8.x, и сборка падала на
           разрешении пакетов. Версии под Capacitor 8 у того плагина нет. */
        var SocialLogin = plugin('SocialLogin');

        /* ── Локальное уведомление «Искра дня» (App Store, закон 3.1.1 — сторонний push
           недоступен, шлём через ОС самого устройства). Фиксированный id: schedule всегда
           через cancel того же id — без дублей записи при повторном включении/переустановке. */
        var LocalNotif = plugin('LocalNotifications');
        var DAILY_NOTIF_ID = 7601;
        var DAILY_NOTIF_OPTIN_KEY = 'ys_native_daily_notif';

        function _dailyNotifCancel() {
          if (!LocalNotif) return Promise.resolve();
          return LocalNotif.cancel({ notifications: [{ id: DAILY_NOTIF_ID }] }).catch(function(){});
        }

        // Разрешение → schedule; отказ в разрешении НЕ показываем как ошибку (закон №37) —
        // вызывающий код (тумблер/согласие) сам решает, что делать при false.
        window._nativeEnableDailyNotif = async function() {
          if (!LocalNotif) return false;
          try {
            var perm = await LocalNotif.checkPermissions();
            if (perm.display !== 'granted') perm = await LocalNotif.requestPermissions();
            if (perm.display !== 'granted') return false;
            await _dailyNotifCancel();
            await LocalNotif.schedule({ notifications: [{
              id: DAILY_NOTIF_ID,
              title: (typeof t === 'function' && t('obChipNotifyIskra')) || 'Искра дня',
              body: (typeof t === 'function' && t('notifLocalIskraBody')) || 'Загляни — тебя ждёт Искра дня.',
              schedule: { on: { hour: 9, minute: 0 }, repeats: true, allowWhileIdle: true }
            }] });
            try { localStorage.setItem(DAILY_NOTIF_OPTIN_KEY, '1'); } catch(_) {}
            return true;
          } catch(_) { return false; }
        };

        window._nativeDisableDailyNotif = async function() {
          await _dailyNotifCancel();
          try { localStorage.setItem(DAILY_NOTIF_OPTIN_KEY, '0'); } catch(_) {}
        };

        // Идемпотентный reschedule на каждом старте: у ранее согласившегося юзера
        // переустановка/обновление приложения сбрасывает запланированные ОС-уведомления —
        // cancel+schedule внутри _nativeEnableDailyNotif чинит это без дублей.
        (function _rescheduleDailyNotifOnStart() {
          try {
            if (localStorage.getItem(DAILY_NOTIF_OPTIN_KEY) === '1') window._nativeEnableDailyNotif();
          } catch(_) {}
        })();

        /* SKU нашего бэкенда → Product ID в App Store Connect / Google Play.
           Идентификаторы обязаны совпадать с товарами в сторе и в RevenueCat. */
        var PRODUCT_BY_SKU = {
          song_unlock:     'com.yupsoul.app.song_unlock',
          iskry_pack_1000: 'com.yupsoul.app.iskry_1000',
          iskry_pack_2000: 'com.yupsoul.app.iskry_2000',
          iskry_pack_5000: 'com.yupsoul.app.iskry_5000',
          /* Пакеты — доступ на 30 дней. В App Store Connect это тип
             Non-Renewing Subscription: автопродления у нас нет, продлевает сам
             пользователь повторной покупкой. Поэтому ни группы подписок, ни
             блока с условиями продления не требуется. */
          soul_basic_sub:  'com.yupsoul.app.pack_soul_30d',
          soul_plus_sub:   'com.yupsoul.app.pack_depth_30d',
          master_monthly:  'com.yupsoul.app.pack_lab_30d'
        };
        var PACK_SKUS = { soul_basic_sub: 1, soul_plus_sub: 1, master_monthly: 1 };
        /* Экраны зовут пакеты ключами plan_*, а сервер знает их по sku.
           Та же карта, что PLAN_SKU_MAP в модуле 09 — держать в двух местах
           плохо, но модуль 09 объявляет её внутри своей области. */
        var PLAN_KEY_TO_SKU = {
          plan_basic:  'soul_basic_sub',
          plan_plus:   'soul_plus_sub',
          plan_master: 'master_monthly'
        };
        window._nativeProductBySku = PRODUCT_BY_SKU;

        /* ── Вход через Apple ──────────────────────────────────────────────── */
        var _socialReady = false;

        window._nativeSignInApple = async function() {
          if (!SocialLogin) throw new Error('no_plugin');
          if (!_socialReady) {
            // redirectUrl пустой — так плагин просит для iOS, чтобы не уводить
            // в браузер: на устройстве работает системное окно Apple.
            await SocialLogin.initialize({ apple: { clientId: 'com.yupsoul.app', redirectUrl: '' } });
            _socialReady = true;
          }
          var res = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'] } });
          var idToken = res && res.result && res.result.idToken;
          if (!idToken) throw new Error('no_identity_token');

          var r = await fetch(apiBase + '/api/auth/apple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity_token: idToken })
          });
          var d = await r.json().catch(function() { return {}; });
          if (!r.ok || !d.token) throw new Error(d.error_code || d.error || 'auth_failed');

          window._googleJwt = d.token;              // единое поле Bearer-токена на фронте
          try { localStorage.setItem('google_jwt', d.token); } catch(_) {}
          /* Восстановление сессии при следующем запуске идёт через
             tryRestoreGoogleSession, а ему нужны ОБА ключа — токен и профиль.
             Без google_user пользователь после перезапуска снова видел вход. */
          var appleName = '';
          try {
            var pr = res && res.result && res.result.profile;
            appleName = (pr && (pr.givenName || pr.name)) || '';
          } catch(_) {}
          var appleUser = { sub: String(d.user_id), email: '', name: appleName || 'Apple ID', provider: 'apple' };
          window._googleUser = appleUser;
          try { localStorage.setItem('google_user', JSON.stringify(appleUser)); } catch(_) {}
          try { localStorage.setItem('yupsoul_user_id', String(d.user_id)); } catch(_) {}
          await _rcIdentify(d.user_id);
          return d;
        };

        /* ── RevenueCat ────────────────────────────────────────────────────── */
        var _rcReady = false;

        async function _rcConfigure() {
          if (_rcReady || !Purchases) return _rcReady;
          var key = window.__RC_IOS_KEY__;
          if (window._nativePlatform === 'android') key = window.__RC_ANDROID_KEY__ || key;
          if (!key) { console.warn('[native] нет публичного ключа RevenueCat — покупки недоступны'); return false; }
          try {
            await Purchases.configure({ apiKey: key });
            _rcReady = true;
          } catch (e) {
            console.warn('[native] RevenueCat configure не удался', e);
          }
          return _rcReady;
        }

        /* Связываем покупателя RevenueCat с нашим пользователем — по этому id
           вебхук находит, кому начислять. */
        async function _rcIdentify(userId) {
          if (!userId || !(await _rcConfigure())) return;
          try { await Purchases.logIn({ appUserID: String(userId) }); }
          catch (e) { console.warn('[native] RevenueCat logIn не удался', e); }
        }
        window._nativeRcIdentify = _rcIdentify;

        /* Покупка. Возвращает { ok:true } только после того, как СЕРВЕР
           подтвердил выдачу товара, иначе баланс разъедется с реальностью. */
        window._nativeBuy = async function(sku, opts) {
          opts = opts || {};
          var productId = PRODUCT_BY_SKU[sku];
          if (!productId) return { ok: false, error: 'unknown_sku' };
          if (!(await _rcConfigure())) return { ok: false, error: 'store_unavailable' };

          var pkg = null;
          try {
            var offerings = await Purchases.getOfferings();
            var all = (offerings && offerings.all) || {};
            Object.keys(all).forEach(function(k) {
              ((all[k] && all[k].availablePackages) || []).forEach(function(p) {
                if (p && p.product && p.product.identifier === productId) pkg = p;
              });
            });
          } catch (e) {
            console.warn('[native] getOfferings не удался', e);
            return { ok: false, error: 'store_unavailable' };
          }
          if (!pkg) return { ok: false, error: 'product_not_found' };

          /* Заказ заводим ДО покупки и передаём его номер в RevenueCat
             атрибутом подписчика: вебхук по нему находит, что выдать, и
             защита от повторной выдачи на сервере работает по этому же id.
             Без заказа сервер покупку намеренно не примет. */
          var orderReqId = null;
          try {
            var ordBody = { sku: sku };
            if (opts.requestId) ordBody.request_id = opts.requestId;
            var ordResp = await fetch(apiBase + '/api/payments/native/order', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
              body: JSON.stringify(ordBody)
            });
            var ordData = await ordResp.json().catch(function() { return {}; });
            /* Песня уже открыта (повторный тап, устаревший экран). Сервер
               отвечает 200 с признаком — это успех, а не отказ: показываем
               трек, а не ошибку покупки. */
            if (ordResp.ok && ordData.already_unlocked) {
              return { ok: true, already_unlocked: true };
            }
            if (!ordResp.ok || !ordData.request_id) {
              console.warn('[native] заказ не создан', ordData);
              return { ok: false, error: ordData.error_code || 'order_failed' };
            }
            orderReqId = ordData.request_id;
          } catch (e) {
            console.warn('[native] заказ не создан', e);
            return { ok: false, error: 'order_failed' };
          }

          try {
            await Purchases.setAttributes({ pending_request_id: String(orderReqId) });
          } catch (e) {
            // Без атрибута вебхук не поймёт получателя — покупку не начинаем.
            console.warn('[native] setAttributes не удался', e);
            return { ok: false, error: 'store_unavailable' };
          }

          // Снимок баланса ДО покупки — по его росту поймём, что пакет начислен.
          var baseline = -1;
          if (sku !== 'song_unlock' && !PACK_SKUS[sku]) {
            try {
              var mr0 = await fetch(apiBase + '/api/me', { headers: getAuthHeaders() });
              var md0 = mr0.ok ? await mr0.json().catch(function() { return null; }) : null;
              baseline = md0 && !isNaN(Number(md0.iskry_balance)) ? Number(md0.iskry_balance) : -1;
            } catch(_) {}
          }

          try {
            await Purchases.purchasePackage({ aPackage: pkg });
          } catch (e) {
            _refreshStorePrices();
            // Отмена пользователем — не ошибка приложения, молча выходим.
            if (e && (e.code === '1' || e.userCancelled || /cancel/i.test(e.message || ''))) {
              await _dropOrder(sku, orderReqId);
              return { ok: false, error: 'cancelled' };
            }
            console.warn('[native] покупка не прошла', e);
            await _dropOrder(sku, orderReqId);
            return { ok: false, error: 'purchase_failed' };
          }
          _refreshStorePrices();

          // Чек валидирует RevenueCat, товар выдаёт вебхук. Ждём, пока сервер
          // увидит начисление, и только потом рисуем результат.
          var granted = await _waitForGrant(sku, orderReqId, baseline);
          return granted ? { ok: true } : { ok: false, error: 'grant_pending' };
        };

        /* Заявка-носитель заводится ДО покупки. Если покупка не состоялась,
           она осталась бы висеть в pending_payment и главная показывала бы
           баннер «Перейти к оплате» на несуществующий платёж. Для песни
           заявка своя, настоящая — её не трогаем. */
        async function _dropOrder(sku, requestId) {
          if (!requestId || sku === 'song_unlock') return;
          /* Для пакета и для Искр заявка одинаково служебная — гасим обе. */
          try {
            await fetch(apiBase + '/api/my/pending-request/dismiss', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
              body: JSON.stringify({ request_id: String(requestId) })
            });
          } catch(_) {}
        }

        /* Опрос сервера после покупки: до 6 попыток с растущей паузой.
           Вебхук RevenueCat приходит за секунды, но не мгновенно.
           Признак выдачи: для песни — paid_at у заявки в /api/me/requests,
           для пакета Искр — выросший iskry_balance в /api/me. */
        async function _waitForGrant(sku, requestId, baseline) {
          for (var i = 0; i < 6; i++) {
            await new Promise(function(r) { setTimeout(r, 900 + i * 600); });
            try {
              if (sku === 'song_unlock' && requestId) {
                var rr = await fetch(apiBase + '/api/me/requests', { headers: getAuthHeaders() });
                if (!rr.ok) continue;
                var rd = await rr.json().catch(function() { return null; });
                var list = (rd && rd.requests) || [];
                for (var j = 0; j < list.length; j++) {
                  if (String(list[j].id) === String(requestId) && list[j].paid_at) return true;
                }
              } else if (PACK_SKUS[sku]) {
                /* У пакета баланс Искр не меняется — ждём, пока сервер увидит
                   активный доступ нужного плана. */
                var sr = await fetch(apiBase + '/api/subscription/status', { headers: getAuthHeaders() });
                if (!sr.ok) continue;
                var sd = await sr.json().catch(function() { return null; });
                if (sd && sd.subscription_active && String(sd.plan_sku) === String(sku)) return true;
              } else {
                var mr = await fetch(apiBase + '/api/me', { headers: getAuthHeaders() });
                if (!mr.ok) continue;
                var md = await mr.json().catch(function() { return null; });
                var bal = md && Number(md.iskry_balance);
                if (!isNaN(bal) && bal > baseline) return true;
              }
            } catch(_) {}
          }
          return false;
        }

        /* Восстановление покупок — Apple 3.1.1 требует такой кнопки, если
           покупки не расходуемые. Для расходуемых безвредно, оставляем. */
        window._nativeRestore = async function() {
          if (!(await _rcConfigure())) return { ok: false };
          try { await Purchases.restorePurchases(); return { ok: true }; }
          catch (e) { console.warn('[native] restore не удался', e); return { ok: false }; }
        };

        /* ── Цены из App Store ────────────────────────────────────────────
           Движок намеренно очищает рубли на нативе (правило 3.1.1: чужая цена
           рядом с кнопкой читается как второй способ оплаты), но своей цены
           взамен не ставил — человек видел пустое место вместо стоимости
           (Алла 22.09, сборка на айфоне: «цен не видно»). Цену обязан называть
           сам стор: берём priceString у продукта RevenueCat — он уже в валюте
           и формате витрины покупателя, пересчитывать ничего не надо.
           Если стор недоступен, ничего не пишем: пусто лучше, чем неверная цена. */
        var _priceBySku = null;
        async function _nativeLoadPrices() {
          if (_priceBySku) return _priceBySku;
          if (!(await _rcConfigure())) return null;
          try {
            var offerings = await Purchases.getOfferings();
            var all = (offerings && offerings.all) || {};
            var byProduct = {}, numByProduct = {};
            Object.keys(all).forEach(function(k) {
              ((all[k] && all[k].availablePackages) || []).forEach(function(p) {
                var pr = p && p.product;
                if (pr && pr.identifier && pr.priceString) {
                  byProduct[pr.identifier] = pr.priceString;
                  /* Число и валюта — для «цена за песню» в пакетах Искр (эталон 19.09:
                     «выбор становится арифметикой»). Считаем сами из цены стора. */
                  if (typeof pr.price === 'number' && pr.currencyCode) numByProduct[pr.identifier] = { price: pr.price, cur: pr.currencyCode };
                }
              });
            });
            var map = {}, num = {};
            Object.keys(PRODUCT_BY_SKU).forEach(function(sku) {
              var ps = byProduct[PRODUCT_BY_SKU[sku]];
              if (ps) map[sku] = ps;
              if (numByProduct[PRODUCT_BY_SKU[sku]]) num[sku] = numByProduct[PRODUCT_BY_SKU[sku]];
            });
            if (!Object.keys(map).length) return null;
            _priceBySku = map;
            window._nativePriceBySku = map;
            window._nativePriceNumBySku = num;
            return map;
          } catch (e) {
            console.warn('[native] цены из стора не пришли', e);
            return null;
          }
        }

        /* Проставляет цены во все места, где веб-движок оставил пусто.
           Идемпотентно: зовётся после каждого прохода движка и i18n, потому что
           они переписывают те же узлы (грабли проекта: applyTranslations затирает цены). */
        async function _nativeApplyPrices() {
          var map = await _nativeLoadPrices();
          if (!map) return;
          var set = function(id, txt) {
            var el = document.getElementById(id);
            if (el && txt && el.textContent !== txt) el.textContent = txt;
          };
          set('planBasicPriceEl', map.soul_basic_sub);
          set('planPlusPriceEl', map.soul_plus_sub);
          set('masterPriceEl', map.master_monthly);
          set('scPlanBasicPrice', map.soul_basic_sub);
          set('scPlanPlusPrice', map.soul_plus_sub);
          set('scPlanMasterPrice', map.master_monthly);
          /* Открыть песню целиком: цифра и единица — одной строкой из стора. */
          if (map.song_unlock) {
            set('suPriceVal', map.song_unlock);
            var pu = document.getElementById('suPriceUnit');
            if (pu && pu.textContent) pu.textContent = '';
          }
          /* Пакеты Искр: в разметке цена лежит в <span data-web-only>, а он на нативе скрыт CSS —
             место под цену оставалось пустым. Добавляем свой узел рядом и пишем цену стора в него. */
          document.querySelectorAll('#tuTopups [data-sku]').forEach(function(btn) {
            var ps = map[btn.getAttribute('data-sku')];
            var box = btn.querySelector('.price');
            if (!ps || !box) return;
            var slot = box.querySelector('[data-native-price]');
            if (!slot) {
              slot = document.createElement('span');
              slot.setAttribute('data-native-price', '');
              box.appendChild(slot);
            }
            if (slot.textContent !== ps) slot.textContent = ps;
            /* «цена за песню» (эталон 19.09): веб пишет её в .per из data-rub, а .per на нативе
               скрыт (data-web-only). Считаем из цены стора: цена / песни в пакете, в валюте
               покупателя, тем же суффиксом «/песня», что и веб (ключ tuPerSong без «{p} ₽»). */
            var numInfo = (window._nativePriceNumBySku || {})[btn.getAttribute('data-sku')];
            var skuId = btn.getAttribute('data-sku') || '';
            // ISKRY_PACK_INFO объявлен в другом замыкании (модуль 10) и отсюда не виден — число песен
            // берём из самого SKU: iskry_pack_1000 → 10 песен (1 песня = 100 Искр, константа проекта).
            var packInfo = (typeof ISKRY_PACK_INFO !== 'undefined' && ISKRY_PACK_INFO[skuId]) || null;
            var songs = (packInfo && packInfo.songs) || (parseInt((skuId.match(/(\d+)/) || [])[1], 10) / 100) || 0;
            var small = btn.querySelector('.ta small');
            if (numInfo && songs && small) {
              var perTxt = '';
              try {
                var lang = (typeof getLang === 'function' ? getLang() : (document.documentElement.lang || 'en')) || 'en';
                var fmt = new Intl.NumberFormat(lang, { style: 'currency', currency: numInfo.cur, maximumFractionDigits: 2 });
                var sfx = (typeof t === 'function' ? t('tuPerSong') : '') || '';
                sfx = (sfx && sfx !== 'tuPerSong') ? sfx.replace(/^.*?₽/, '') : '/song';
                perTxt = fmt.format(numInfo.price / songs) + sfx;
              } catch (_) { perTxt = ''; }
              var perSlot = small.querySelector('[data-native-per]');
              if (!perSlot) {
                perSlot = document.createElement('span');
                perSlot.className = 'per';
                perSlot.setAttribute('data-native-per', '');
                small.appendChild(perSlot);
              }
              if (perSlot.textContent !== perTxt) perSlot.textContent = perTxt;
            }
          });
        }
        window._nativeApplyPrices = _nativeApplyPrices;

        /* Окно покупки — момент, когда человек входит в App Store (или меняет аккаунт), а вместе с ним
           меняется и витрина стора: цены, снятые до входа, могут быть с другой витрины (TestFlight 30,
           Алла: в приложении 24,99 $, в окне покупки USD 29.99 — цена той же позиции с НДС её витрины).
           После любого исхода покупки сбрасываем свой кэш и просим цены у стора заново. */
        function _refreshStorePrices() {
          _priceBySku = null;
          setTimeout(function() { try { _nativeApplyPrices(); } catch (_) {} }, 400);
        }

        /* Движок и i18n переписывают те же узлы, поэтому идём следом за ними:
           после их прохода, после смены экрана и один отложенный проход на старте
           (offerings приходят по сети и могут опоздать к первой отрисовке). */
        (function hookPrices() {
          var wrap = function(name) {
            var orig = window[name];
            if (typeof orig !== 'function' || orig._pricesWrapped) return;
            var patched = function() {
              var r = orig.apply(this, arguments);
              try { _nativeApplyPrices(); } catch (_) {}
              return r;
            };
            patched._pricesWrapped = true;
            window[name] = patched;
          };
          ['loadRubPrices', 'applyTranslations', 'goToPage'].forEach(wrap);
          setTimeout(function() { try { _nativeApplyPrices(); } catch (_) {} }, 1500);
          setTimeout(function() { try { _nativeApplyPrices(); } catch (_) {} }, 5000);
        })();

        /* ── Кнопка входа через Apple ──────────────────────────────────────
           Разметка кнопки лежит в шаблоне и скрыта CSS вне натива, поэтому
           обработчик вешаем только здесь. Ошибку показываем рядом с кнопкой,
           а не тостом об «ошибке соединения» (закон №37). */
        (function bindAppleSignIn() {
          var btn = document.getElementById('nativeAppleSignInBtn');
          if (!btn || btn._wired) return;
          btn._wired = true;
          btn.addEventListener('click', async function() {
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              await window._nativeSignInApple();
              // Экран входа снимается тем же путём, что у остальных платформ.
              if (typeof window.loadMe === 'function') { try { window.loadMe(); } catch(_) {} }
              var scr = document.getElementById('webLoginScreen');
              if (scr) scr.style.display = 'none';
              if (typeof window.goToPage === 'function') { try { window.goToPage('homePage'); } catch(_) {} }
            } catch (e) {
              // Отмену в системном окне не комментируем — человек закрыл его сам.
              var msg = String((e && e.message) || e || '');
              if (!/cancel|1001/i.test(msg) && typeof window.showToast === 'function') {
                try { window.showToast(typeof t === 'function' ? t('errPurchaseFailed') : 'Не получилось войти'); } catch(_) {}
              }
              console.warn('[native] вход через Apple не удался', e);
            } finally {
              btn.disabled = false;
            }
          });
        })();

        /* ── Перехват платёжных входов ─────────────────────────────────────
           Кнопки на экранах остаются те же, но ведут во встроенную покупку.
           Оборачиваем две глобальные функции, а не вешаем вторые обработчики:
           у кнопок уже есть свои слушатели, и второй дал бы двойной запуск
           (закон №32 про конфликт обработчиков на одном элементе).

           Искры и промокод пропускаем в родной путь: трата уже купленной
           валюты и активация промокода покупкой не считаются. */
        (function wrapPaymentEntries() {
          var tries = 0;
          (function tick() {
            tries++;
            var f = window.startSongUnlockPayment;
            if (typeof f === 'function' && !f.__nativeWrapped) {
              var origSong = f;
              var wrapSong = function(requestId, price, method) {
                if (method === 'iskry' || method === 'promo') return origSong.apply(this, arguments);
                _buyAndRefresh('song_unlock', { requestId: requestId });
              };
              wrapSong.__nativeWrapped = true;
              window.startSongUnlockPayment = wrapSong;
            }
            /* Пакеты. Оверлей выбора способа оплаты на нативе смысла не имеет:
               способ один. Модуль 09 вызывает эту функцию вместо оверлея. */
            if (!window._nativeBuyPlan) {
              window._nativeBuyPlan = function(planKey) {
                var sku = PLAN_KEY_TO_SKU[planKey];
                if (!sku) { console.warn('[native] неизвестный пакет', planKey); return; }
                _buyAndRefresh(sku, {});
              };
            }
            var g = window.showIskryPackPayment;
            if (typeof g === 'function' && !g.__nativeWrapped) {
              var wrapPack = function(sku) { _buyAndRefresh(sku, {}); };
              wrapPack.__nativeWrapped = true;
              window.showIskryPackPayment = wrapPack;
            }
            // Экраны догружаются асинхронно — ловим поздние определения.
            if (tries < 20) setTimeout(tick, 700);
          })();
        })();

        /* Покупка плюс возврат экрана в исходное состояние. Экран разблокировки
           держит состояние в data-state; застрявшее «paying» выглядит как
           зависание, поэтому сбрасываем его на любом исходе. */
        async function _buyAndRefresh(sku, opts) {
          var suRoot = document.getElementById('suRoot');
          var res = await window._nativeBuy(sku, opts);
          if (res && res.ok) {
            var _lm = null;
            if (typeof window.loadMe === 'function') { try { _lm = window.loadMe(); } catch(_) {} }
            if (sku === 'song_unlock') {
              /* Экран «Песня открыта» заполняет та же функция, что в вебе и Телеграме
                 (openSongOpened: название, волна, кнопка, звук, блоки владельца). Раньше здесь
                 был голый goToPage — экран открывался «сырым»: пустой круг вместо кнопки,
                 оба набора кнопок, тишина (Алла 23.09, TestFlight 25, после покупки через Apple).
                 Трек подтягиваем свежим из my-tracks по номеру заявки, как при возврате с T-Bank. */
              var _rid = opts && opts.requestId ? String(opts.requestId) : null;
              var _openSo = function(row) {
                try {
                  if (typeof window.openSongOpened === 'function') window.openSongOpened(row ? { track: row, requestId: _rid } : (_rid ? { requestId: _rid } : {}));
                  else if (typeof window.goToPage === 'function') window.goToPage('songOpenedPage');
                } catch(_) {}
              };
              var _apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              if (_rid && _apiBase) {
                var _h = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
                fetch(_apiBase + '/api/my-tracks?limit=50&offset=0', { headers: _h })
                  .then(function(r){ return r.json().catch(function(){ return {}; }); })
                  .then(function(j){
                    var list = (j && (j.tracks || j.data || j.items)) || (Array.isArray(j) ? j : []);
                    var row = null;
                    for (var i = 0; i < list.length; i++) if (String(list[i].id) === _rid) { row = list[i]; break; }
                    if (row) window._songUnlockTrack = row;
                    _openSo(row);
                  })
                  .catch(function(){ _openSo(null); });
              } else {
                _openSo(null);
              }
            } else if (suRoot) {
              suRoot.dataset.state = 'offer';
            }
            /* Пополнение из оплаты песни: Искры куплены — возвращаем человека к той же заявке
               (начатое доводим до конца, а не бросаем на экране пополнения). Ждём свежий баланс. */
            if (/^iskry_pack_/.test(sku) && window._poNativeResume && typeof window._poNativeResumePayment === 'function') {
              var _rs = window._poNativeResume; window._poNativeResume = null;
              try { if (_lm && _lm.then) await _lm; } catch(_) {}
              setTimeout(function() { try { window._poNativeResumePayment(_rs); } catch(_) {} }, 350);
            }
            if (PACK_SKUS[sku]) {
              /* Доступ открылся — перерисовываем экраны, которые его читают:
                 карточки пакетов, картотеку героев, тариф в профиле. */
              try { if (typeof window._initPlansPage === 'function') window._initPlansPage(); } catch(_) {}
              try { if (typeof window.wireMasterUnlockSeg === 'function') window.wireMasterUnlockSeg(); } catch(_) {}
              if (typeof window.showToast === 'function') {
                try { window.showToast(typeof t === 'function' ? t('toastSubActivated') : 'Пакет активирован'); } catch(_) {}
              }
            }
            return;
          }
          if (suRoot) suRoot.dataset.state = 'offer';
          // Отмену пользователем не комментируем: он сам закрыл окно Apple.
          if (res && res.error !== 'cancelled' && typeof window.showToast === 'function') {
            try { window.showToast(typeof t === 'function' ? t('errPurchaseFailed') : 'Покупка не завершилась'); } catch(_) {}
          }
        }

        /* Если пользователь уже авторизован с прошлого запуска — сразу
           связываем его с RevenueCat, чтобы вебхук знал получателя. */
        (function bindExistingUser() {
          var tries = 0;
          (function tick() {
            tries++;
            try {
              var uid = null;
              try { uid = localStorage.getItem('yupsoul_user_id'); } catch(_) {}
              if (typeof hasAuth === 'function' && hasAuth() && uid) {
                _rcIdentify(uid);
                return;
              }
            } catch(_) {}
            if (tries < 10) setTimeout(tick, 1200);
          })();
        })();

        /* ── Громкость плеера по кнопкам айфона (Алла 23.09) ─────────────────
           На iOS WebKit audio.volume из JS не задаётся (Apple, "Safari HTML5
           Audio and Video Guide": «the volume property is not settable in
           JavaScript»). Системную громкость меняем/читаем через нативный
           плагин SystemVolume (MPVolumeView + AVAudioSession, AppDelegate.swift).
           Слайдер плеера (index.template.html, #mtNpVolumeTrack) сам проверяет
           window._nativeVolumeBridge в apply() — здесь только поставляем мост
           и дёргаем getVolume/startWatching/stopWatching по открытию/закрытию
           полного плеера (window._v2OpenPlayer/_v2Minimize). Вне iOS-натива
           или если плагин недоступен — window._nativeVolumeBridge не создаётся,
           слайдер продолжает работать через audio.volume как раньше. */
        if (window._nativePlatform === 'ios') {
          var SystemVolume = plugin('SystemVolume');
          if (SystemVolume) {
            var _svWatching = false, _svListenerBound = false, _svLastSet = 0, _svLastKnown = null, _svPoll = null;
            window._nativeVolumeBridge = {
              active: true,
              setVolume: function(v01) {
                var now = Date.now();
                if (now - _svLastSet < 50) return; // не чаще раза в 50мс
                _svLastSet = now;
                try { SystemVolume.setVolume({ value: v01 }); } catch(_) {}
              }
            };
            function _svBindListener() {
              if (_svListenerBound) return;
              _svListenerBound = true;
              try {
                SystemVolume.addListener('volumeChange', function(data) {
                  var v = data && typeof data.value === 'number' ? data.value : null;
                  if (v != null) { _svLastKnown = v; if (typeof window._mtSyncVolUI === 'function' && !window._mtVolDragging) window._mtSyncVolUI(v); }
                });
              } catch(_) {}
            }
            function _svStart() {
              _svBindListener();
              if (_svWatching) return;
              _svWatching = true;
              try {
                SystemVolume.getVolume().then(function(res) {
                  var v = res && typeof res.value === 'number' ? res.value : null;
                  if (v != null && typeof window._mtSyncVolUI === 'function') window._mtSyncVolUI(v);
                }).catch(function() {});
                SystemVolume.startWatching().catch(function() {});
              } catch(_) {}
              /* Второй канал, не зависящий от KVO: пока плеер открыт, раз в полсекунды читаем системную
                 громкость и двигаем ползунок, если её изменили кнопками (не во время драга и не сразу после
                 своего setVolume — иначе ползунок дёргается). */
              if (!_svPoll) _svPoll = setInterval(function() {
                if (document.hidden || window._mtVolDragging || Date.now() - _svLastSet < 400) return;
                try {
                  SystemVolume.getVolume().then(function(res) {
                    var v = res && typeof res.value === 'number' ? res.value : null;
                    if (v == null) return;
                    if (_svLastKnown == null || Math.abs(v - _svLastKnown) > 0.005) { _svLastKnown = v; if (typeof window._mtSyncVolUI === 'function') window._mtSyncVolUI(v); }
                  }).catch(function() {});
                } catch(_) {}
              }, 500);
            }
            function _svStop() {
              if (_svPoll) { clearInterval(_svPoll); _svPoll = null; }
              if (!_svWatching) return;
              _svWatching = false;
              try { SystemVolume.stopWatching().catch(function() {}); } catch(_) {}
            }
            /* Плеер (index.template.html) грузится раньше этого модуля в документе,
               но window._v2OpenPlayer/_v2Minimize уже определены синхронно там же —
               оборачиваем один раз, тем же приёмом, что hookPrices/wrapPaymentEntries выше. */
            (function wirePlayerOpenClose() {
              var tries = 0;
              (function tick() {
                tries++;
                var open = window._v2OpenPlayer, min = window._v2Minimize;
                if (typeof open === 'function' && !open.__svWrapped) {
                  var wrappedOpen = function() { var r = open.apply(this, arguments); _svStart(); return r; };
                  wrappedOpen.__svWrapped = true;
                  window._v2OpenPlayer = wrappedOpen;
                }
                if (typeof min === 'function' && !min.__svWrapped) {
                  var wrappedMin = function() { var r = min.apply(this, arguments); _svStop(); return r; };
                  wrappedMin.__svWrapped = true;
                  window._v2Minimize = wrappedMin;
                }
                var done = window._v2OpenPlayer && window._v2OpenPlayer.__svWrapped && window._v2Minimize && window._v2Minimize.__svWrapped;
                if (!done && tries < 20) setTimeout(tick, 500);
              })();
            })();
            /* Плеер может закрыться не через «Свернуть» (уход со страницы, остановка трека —
               ветка MutationObserver в шаблоне прячет #mtNowPlaying напрямую) — тогда
               наблюдатель громкости в нативе остался бы висеть. Гасим по факту скрытия. */
            (function watchPlayerHidden() {
              var el = document.getElementById('mtNowPlaying');
              if (!el || typeof MutationObserver !== 'function') return;
              new MutationObserver(function() {
                try { if (_svWatching && getComputedStyle(el).display === 'none') _svStop(); } catch(_) {}
              }).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
            })();
          }
        }
      })();

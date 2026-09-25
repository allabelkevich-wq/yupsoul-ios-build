
      // ── Overlay: кнопка «Назад» ─────────────────────────────────────────
      var payOvBackBtn = document.getElementById('payOvBackBtn');
      if (payOvBackBtn) payOvBackBtn.addEventListener('click', function() {
        hidePaymentOverlay();
        if (tg && tg.MainButton && tg.MainButton.hide) tg.MainButton.hide();
      });

      // Делегированный клик (capture): «Назад» в оверлее и «На главную» на странице благодарности — с первого нажатия
      document.addEventListener('click', function paymentThanksAndOverlayBackDelegated(e) {
        var backOv = e.target.closest('#payOvBackBtn');
        if (backOv) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof hidePaymentOverlay === 'function') hidePaymentOverlay();
          if (tg && tg.MainButton && tg.MainButton.hide) tg.MainButton.hide();
          return;
        }
        var thanksBtn = e.target.closest('#paymentThanksBackBtn');
        if (thanksBtn && document.body.dataset.page === 'paymentThanksPage') {
          e.preventDefault();
          e.stopPropagation();
          var target = thanksBtn.getAttribute('data-goto') || 'homePage';
          if (typeof goToPage === 'function') goToPage(target);
          if (target === 'soulChatPage' && typeof initSoulChatPage === 'function') setTimeout(initSoulChatPage, 300);
        }
      }, true);

      // ── Overlay: кнопка «Я уже оплатил» ────────────────────────────────
      var payOvCheckBtn = document.getElementById('payOvCheckBtn');
      if (payOvCheckBtn) payOvCheckBtn.addEventListener('click', async function() {
        if (payOvCheckBtn.disabled) return;
        if (!pendingPaymentRequestId) { setPaymentStatus('Нет активной заявки для проверки', 'error'); return; }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) { setPaymentStatus(t('payAuthLost'), 'error'); return; }
        var initData = getInitData();
        var checkAuthH = getAuthHeaders();
        payOvCheckBtn.disabled = true;
        payOvCheckBtn.textContent = t('payChecking');
        setPaymentStatus('Проверяю статус оплаты...', 'warn');
        try {
          var tbankPid = localStorage.getItem('tbank_payment_id') || '';
          var isTbank = !!tbankPid;
          var st = '';
          if (isTbank) {
            // T-Bank: проверяем через T-Bank endpoint
            var sr = await fetchWithTimeout(apiBase + '/api/payments/tbank/status?payment_id=' + encodeURIComponent(tbankPid) + '&initData=' + encodeURIComponent(initData), { headers: checkAuthH }, 10000);
            var sd = await sr.json().catch(function() { return {}; });
            if (sd.paid) {
              st = 'paid';
              onTbankPaymentSuccess(pendingPaymentSku || '', pendingPaymentRequestId, initData);
              return;
            }
          } else {
            // HOT: проверяем через HOT endpoint
            for (var i = 0; i < 5; i++) {
              var r = await fetchWithTimeout(apiBase + '/api/payments/hot/status?request_id=' + encodeURIComponent(pendingPaymentRequestId), { headers: checkAuthH }, 10000);
              var j = await r.json().catch(function() { return {}; });
              var rawSt = j && j.data && j.data.payment_status;
              st = (rawSt !== null && rawSt !== undefined) ? String(rawSt).toLowerCase() : '';
              if (st === 'paid') break;
              if (i < 4) await new Promise(function(res) { setTimeout(res, 1500); });
            }
          }
          if (st === 'paid') {
            if (_hotPaymentConfirmed) { console.log('[payOvCheck] Уже обработано'); return; }
            _hotPaymentConfirmed = true;
            paymentPollingActive = false;
            setPaymentStatus('Оплата подтверждена! Запускаем создание...', 'ok');
            await fetch(apiBase + '/api/payments/hot/confirm', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, checkAuthH),
              body: JSON.stringify({ request_id: pendingPaymentRequestId, initData: initData })
            }).catch(function(){});
            pendingPaymentRequestId = null; pendingPaymentSku = null;
            try { localStorage.removeItem('hot_pending_request_id'); localStorage.removeItem('hot_pending_sku'); } catch(_) {}
            showConfirm(t('payPaid'), 'Песня генерируется и скоро придёт в бот.<br>Можешь закрыть приложение — ничего не пропадёт.');
          } else {
            setPaymentStatus('Оплата пока не подтверждена. Подожди немного и проверь снова.', 'warn');
          }
        } catch(e) {
          setPaymentStatus('Ошибка проверки: ' + (e && e.message ? e.message : 'попробуй снова'), 'error');
        } finally {
          payOvCheckBtn.disabled = false;
          payOvCheckBtn.textContent = t('payAlreadyPaidCheck');
        }
      });

      // Отключённый способ оплаты удалён из продукта (решение Аллы 27.08.2026):
      // остаются Telegram Stars и карта; кнопка #payOvPayBtn удалена из разметки.
      
      // Профиль и Лаборатория привязаны в bindNavButtons (делегированный обработчик по id)
      var profileCreateSongBtn = document.getElementById('profileCreateSongBtn');
      if (profileCreateSongBtn) profileCreateSongBtn.addEventListener('click', function() { goToPage('formPage'); });

      // Theme switcher в профиле — ручной выбор темы (auto/light/dark).
      // Решает проблему когда Telegram/VK не передаёт правильную colorScheme
      // (старые клиенты, iOS WebView, web-версия). Сохраняется в localStorage.
      (function initProfileThemeSwitcher() {
        var switcher = document.getElementById('profileThemeSwitcher');
        if (!switcher) return;
        var btns = switcher.querySelectorAll('.profile-theme-btn');
        function syncActive() {
          var pref = 'auto';
          try { pref = localStorage.getItem('yupsoul_theme_pref') || 'auto'; } catch(_) {}
          if (pref !== 'light' && pref !== 'dark' && pref !== 'auto') pref = 'auto';
          // data-sel двигает .slider (реф showcase-profile): auto=0, light=1, dark=2
          var order = { auto: 0, light: 1, dark: 2 };
          switcher.setAttribute('data-sel', order[pref] != null ? order[pref] : 0);
          btns.forEach(function(b) {
            var isActive = b.getAttribute('data-theme-pref') === pref;
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            b.classList.toggle('on', isActive);
          });
        }
        btns.forEach(function(b) {
          b.addEventListener('click', function() {
            var pref = b.getAttribute('data-theme-pref');
            try {
              if (pref === 'auto') {
                localStorage.removeItem('yupsoul_theme_pref');
              } else {
                localStorage.setItem('yupsoul_theme_pref', pref);
              }
            } catch(_) {}
            syncActive();
            if (typeof window.applyTheme === 'function') window.applyTheme();
          });
        });
        syncActive();
      })();

      // Удаление аккаунта — §1.1.10 Правил VK Mini Apps
      var profileDeleteAccountBtn = document.getElementById('profileDeleteAccountBtn');
      // VK Testers ID 7259039 (iOS m.vk.ru): «Удалить аккаунт» молча не реагировал.
      // Корень: на iOS VK WebView `window.confirm()` заблокирован — диалог не
      // показывается, возвращает false → код выходит. Используем нативные
      // диалоги VK Bridge / Telegram WebApp / fallback на window.confirm.
      function _confirmDeleteAccount(msg) {
        return new Promise(function(resolve) {
          // VK Testers 7264208 ревизия 14.05.2026: «нажав на кнопку Удалить
          // аккаунт ничего не происходит». Корень: при ошибке VKWebAppShowConfirm
          // catch резолвил false БЕЗ fallback — юзер ничего не видел. Также
          // tgWa.showConfirm на некоторых платформах не вызывает callback —
          // promise остаётся pending. Сейчас:
          // (1) inline-модал YupSoul-стиля как primary (визуально надёжно)
          // (2) VK/TG bridges — fallback при ошибке renderа inline
          var showInline = function() {
            try {
              var existing = document.getElementById('_inAppDelConfirm');
              if (existing) existing.remove();
              // VK Testers 7276499 ПЕРЕОТКРЫТ (Семенцов MacOS light): модал имел hardcoded
              // dark стили (rgba(20,15,40,0.97) + color:#fff). На light theme на Safari
              // текст рендерился тёмно-серым → нечитаем. Фикс: detect темы + два варианта.
              var isLight = document.body.classList.contains('theme-light')
                         || document.documentElement.classList.contains('is-vk-light')
                         || document.documentElement.classList.contains('is-ok-light');
              var bg = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(20,15,40,0.97)';
              var border = isLight ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.30)';
              var textColor = isLight ? '#1a1a2e' : 'rgba(255,255,255,0.92)';
              var titleColor = isLight ? '#0f1023' : '#ffffff';
              var cancelBg = isLight ? 'rgba(26,26,46,0.04)' : 'rgba(255,255,255,0.06)';
              var cancelBorder = isLight ? 'rgba(26,26,46,0.18)' : 'rgba(255,255,255,0.15)';
              var cancelColor = isLight ? 'rgba(26,26,46,0.70)' : 'rgba(255,255,255,0.70)';
              var deleteColor = isLight ? '#b91c1c' : '#fca5a5';
              var deleteBg = isLight ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.18)';
              var ov = document.createElement('div');
              ov.id = '_inAppDelConfirm';
              ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
              ov.innerHTML = '<div style="max-width:360px;width:100%;background:' + bg + ';border:1px solid ' + border + ';border-radius:18px;padding:22px;text-align:center;color:' + titleColor + ';font-family:inherit;">' +
                '<p style="font-size:0.9rem;line-height:1.5;margin:0 0 18px;color:' + textColor + ';white-space:pre-line;">' + String(msg).replace(/</g,'&lt;') + '</p>' +
                '<div style="display:flex;gap:10px;justify-content:center;">' +
                '<button type="button" id="_delOk" style="flex:1;padding:11px 20px;border-radius:9999px;background:' + deleteBg + ';border:1px solid rgba(239,68,68,0.4);color:' + deleteColor + ';font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">' + (typeof t === 'function' ? (t('deleteBtn') || 'Удалить') : 'Удалить') + '</button>' +
                '<button type="button" id="_delCancel" style="flex:1;padding:11px 20px;border-radius:9999px;background:' + cancelBg + ';border:1px solid ' + cancelBorder + ';color:' + cancelColor + ';font-size:0.88rem;cursor:pointer;font-family:inherit;">' + (typeof t === 'function' ? (t('cancel') || 'Отмена') : 'Отмена') + '</button>' +
                '</div></div>';
              document.body.appendChild(ov);
              var done = function(val) { try { ov.remove(); } catch(_){} resolve(val); };
              document.getElementById('_delOk').onclick = function() { done(true); };
              document.getElementById('_delCancel').onclick = function() { done(false); };
              ov.onclick = function(e) { if (e.target === ov) done(false); };
              return true;
            } catch (_) { return false; }
          };
          if (showInline()) return;
          // Hard fallback: web confirm()
          try { resolve(!!window.confirm(msg)); } catch (_) { resolve(false); }
        });
      }
      if (profileDeleteAccountBtn) profileDeleteAccountBtn.addEventListener('click', async function() {
        // VK Testers ID 7261683 (Windows + Android): «Не локализован текст
        // во время удаления аккаунта». Текст confirm был hardcoded на русском.
        var confirmMsg = (typeof t === 'function' ? (t('deleteAccountConfirm') || 'Удалить аккаунт и все связанные данные?\n\nБудут удалены: профиль, настройки, данные о рождении, реферальная история.\n\nВаши созданные треки останутся в общей статистике, но будут отвязаны от вашего аккаунта. Это действие НЕОБРАТИМО.') : 'Удалить аккаунт и все связанные данные?\n\nБудут удалены: профиль, настройки, данные о рождении, реферальная история.\n\nВаши созданные треки останутся в общей статистике, но будут отвязаны от вашего аккаунта. Это действие НЕОБРАТИМО.');
        var ok = await _confirmDeleteAccount(confirmMsg);
        // VK Testers 7264208: при отмене показываем toast — чтобы юзер видел
        // что кнопка СРАБОТАЛА (диалог появился), а не подумал что она broken.
        if (!ok) {
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('deleteCancelled') || 'Удаление отменено') : 'Удаление отменено');
          return;
        }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase) return;
        profileDeleteAccountBtn.disabled = true;
        // (аудит iPhone 24.09: локализация текста кнопки во время удаления — было hardcoded RU)
        profileDeleteAccountBtn.textContent = (typeof t === 'function' ? (t('profileDeletingLabel') || 'Удаляем…') : 'Удаляем…');
        var headers = {};
        try {
          if (typeof getAuthHeaders === 'function') {
            var ah = getAuthHeaders();
            Object.keys(ah).forEach(function(k){ if (k !== 'Content-Type') headers[k] = ah[k]; });
          }
          if (typeof getInitData === 'function') {
            var init = getInitData();
            if (init) headers['X-Telegram-Init'] = init;
          }
        } catch(_) {}
        fetch(apiBase + '/api/me', { method: 'DELETE', headers: headers })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(function(d) {
            if (d && d.ok) {
              // VK Testers ID 7260603, 7260525, 7258885: после удаления аккаунта
              // в localStorage оставались артефакты (tg_user_id, кешированный
              // профиль, ref-код, и т.д.) — последующая авторизация подхватывала
              // призрачное состояние → 401/403 от бэкенда. Полная очистка снимает
              // все следы прошлой сессии. Юзер сам подтвердил удаление —
              // потеря локальных предпочтений ожидаема и желательна.
              try { localStorage.clear(); } catch(_) {}
              try { sessionStorage.clear(); } catch(_) {}
              // VK Bridge: очистка серверной VK-storage (best-effort)
              try {
                if (window.vkBridge && typeof vkBridge.send === 'function') {
                  vkBridge.send('VKWebAppStorageSet', { key: 'yupsoul_session', value: '' }).catch(function(){});
                }
              } catch(_) {}
              window._googleJwt = null;
              window._googleUser = null;
              // (аудит iPhone 24.09: локализация финального alert — было hardcoded RU)
              window.alert(typeof t === 'function' ? (t('profileDeletedAlert') || 'Аккаунт удалён. Спасибо, что были с нами.') : 'Аккаунт удалён. Спасибо, что были с нами.');
              // Перезапуск приложения — новая сессия.
              // TG/VK: НЕ сбрасываем URL на голый origin — launch-параметры платформы
              // (tgWebAppData в URL / VK signature) задают окружение и авторизацию; их потеря
              // после localStorage.clear() выкидывала юзера на ВЕБ-логин (OAuth-кнопки ВК/Google
              // в нативном WebView не работают → «ошибка загрузки»). reload сохраняет launch-
              // контекст → авто-вход как новый пользователь (чистый онбординг). Веб — origin.
              if (window._isTgEmbed || window._isVkMiniApp || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)) {
                window.location.reload();
              } else {
                window.location.href = window.location.origin;
              }
            } else {
              profileDeleteAccountBtn.disabled = false;
              // (аудит iPhone 24.09: локализация revert-текста кнопки — переиспользуем ключ исходной надписи)
              profileDeleteAccountBtn.textContent = (typeof t === 'function' ? (t('profileDeleteAccountBtn') || 'Удалить аккаунт и все данные') : 'Удалить аккаунт и все данные');
              console.warn('[me/delete]', d && d.error); if (typeof window._ensureOnline === 'function') window._ensureOnline(); // №37
            }
          })
          .catch(function(e) {
            profileDeleteAccountBtn.disabled = false;
            profileDeleteAccountBtn.textContent = (typeof t === 'function' ? (t('profileDeleteAccountBtn') || 'Удалить аккаунт и все данные') : 'Удалить аккаунт и все данные');
            console.warn('[me/delete]', e && e.message);
            if (typeof window._ensureOnline === 'function') window._ensureOnline(); // №37
          });
      });
      var PLAN_PRICES = { plan_basic: '810 ₽', plan_plus: '2 030 ₽', plan_master: '3 250 ₽' };
      // non-RU локали видят $ на карточках (applyFixedPrices) — confirm обязан совпадать.
      var PLAN_PRICES_USD = { plan_basic: '$9.90', plan_plus: '$24.90', plan_master: '$39.90' };
      var PLAN_TRACKS = { plan_basic: '5', plan_plus: '15', plan_master: '30' };
      var PLAN_SKU_MAP = { plan_basic: 'soul_basic_sub', plan_plus: 'soul_plus_sub', plan_master: 'master_monthly' };
      var PLAN_STARS = { plan_basic: '760 Stars', plan_plus: '1 910 Stars', plan_master: '3 060 Stars' };
      var PLAN_RUB_FALLBACK = { soul_basic_sub: 810, soul_plus_sub: 2030, master_monthly: 3250 };
      var PLAN_NAMES = { plan_basic: 'Душа', plan_plus: 'Глубина', plan_master: 'Лаборатория' };
      // таблицы нужны и вне этого замыкания (экран «песни пакета закончились» на successPage)
      window.PLAN_PRICES = PLAN_PRICES; window.PLAN_TRACKS = PLAN_TRACKS; window.PLAN_NAMES = PLAN_NAMES;
      // ═══ СИСТЕМА ИСКР ═══
      var ISKRY_PRICES = {
        single_song: 100,
        transit_energy_song: 100,
        couple_song: 100,
        deep_analysis_addon: 40,
        soul_chat_1day: 30
      };
      var ISKRY_PACKS = [
        { iskry: 100, price_usd: 10, label: '100 Искр', badge: null, badge_text: null },
        { iskry: 250, price_usd: 22, label: '250 Искр', badge: 'discount', badge_text: '−12%' },
        { iskry: 500, price_usd: 40, label: '500 Искр', badge: 'best', badge_text: '⭐ Лучший выбор' }
      ];
      // (аудит iPhone 24.09: удалён дубль ISKRY_WELCOME_AMOUNT=100 — единственное
      // объявление теперь в 01-core-i18n.js:265 (=0), закон «вкус — основной вход»)
      var ISKRY_REFERRAL_SENDER = 30;
      function getIskryBalance() {
        return parseInt(localStorage.getItem('yupsoul_iskry') || '0', 10);
      }
      window.getIskryBalance = getIskryBalance; // зовётся голым именем из 04-tbank (профиль, тариф Искатель)
      function setIskryBalance(amount) {
        localStorage.setItem('yupsoul_iskry', String(amount));
        if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
      }
      function addIskry(amount) {
        setIskryBalance(getIskryBalance() + amount);
      }
      function spendIskry(amount) {
        var balance = getIskryBalance();
        if (balance >= amount) {
          setIskryBalance(balance - amount);
          return true;
        }
        return false;
      }
      // ── Искра дня (воронка): ежедневный claim Искр, открывается ПОСЛЕ 1-й песни ──
      // ── Печенька «Расклад дня»: состояния fresh→claimed→opened + привязка кнопки (Алла 19.06) ──
      // CSS data-state (!important) прячет элементы чужих состояний (специфичнее нейтрализаторов);
      // мы лишь снимаем inline hidden с элементов целевого состояния.
      // Локальная дата YYYY-M-D — для персиста «печенька открыта сегодня» (Алла 21.06)
      function _ysTodayStr() { var dt = new Date(); return dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate(); }
      window._setDailyState = function _setDailyState(state) {
        var d = document.getElementById('daily'); if (!d) return;
        d.dataset.state = state;
        d.querySelectorAll('.s-fresh, .s-claimed, .s-opened').forEach(function (el) {
          if (el.classList.contains('s-' + state)) el.removeAttribute('hidden');
        });
      };
      function _wireCookieBtn() {
        var btn = document.getElementById('cookieBtn');
        if (!btn || btn._wired) return;
        btn._wired = true;
        btn.addEventListener('click', async function () {
          if (btn._loading) return;
          btn._loading = true;
          // Печенька открывается СРАЗУ (оптимистично) — не ждём сеть. Послание заполняем, когда придёт
          // (до ответа виден дефолтный текст в .cmsg). Раньше ждали await fetch до 15с → «не открывается».
          window._setDailyState('opened');
          try { localStorage.setItem('ys_cookie_opened_day', _ysTodayStr()); } catch (_) {} // Алла 21.06: персист «открыто» — при возврате на Подарки НЕ предлагать снова сегодня
          try {
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            var hdrs = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
            var resp = await (window.fetchWithTimeout
              ? window.fetchWithTimeout(apiBase + '/api/daily-spread', { headers: hdrs }, 15000)
              : fetch(apiBase + '/api/daily-spread', { headers: hdrs }));
            var d = await resp.json().catch(function () { return {}; });
            var cmsg = document.querySelector('#giftsPage .cmsg');
            if (d && d.ok && d.available && d.message && cmsg) cmsg.textContent = '«' + d.message + '»';
          } catch (e) { /* тихо (закон №37) — остаётся дефолтное послание */ }
          btn._loading = false;
        });
      }
      // Анимация начисления Искры (порт из showcase-gifts.html): spark-pop + конфетти из искры +
      // искры летят к балансу + bump пилюли + флоатер «+N» + count-up числа. Reduced-motion → мгновенно.
      window._giftsClaimAnim = function _giftsClaimAnim(oldBal, newBal) {
        try {
          var balNum = document.getElementById('giftsBalanceNum');
          var setFinal = function () { if (balNum) balNum.textContent = newBal; };
          var spark = document.getElementById('sparkBox');
          var daily = document.getElementById('daily');
          var pill = document.getElementById('giftsBalancePill');
          var gain = document.getElementById('giftsGain');
          if (!spark || !daily || !pill) { setFinal(); return; }
          function countUp() {
            if (!balNum) return;
            var t0 = null, dur = 650;
            function step(ts) {
              if (!t0) t0 = ts;
              var k = Math.min(1, (ts - t0) / dur);
              var v = Math.round(oldBal + (newBal - oldBal) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
              balNum.textContent = v;
              if (k < 1) requestAnimationFrame(step); else setFinal();
            }
            requestAnimationFrame(step);
          }
          spark.classList.add('pop'); setTimeout(function () { spark.classList.remove('pop'); }, 620);
          var b = spark.getBoundingClientRect(), hb = daily.getBoundingClientRect();
          var cx = b.left - hb.left + b.width / 2, cy = b.top - hb.top + b.height / 2;
          var cols = ['#f7cf7a', '#f79633', '#ec4899', '#f97316', '#ffffff'];
          for (var i = 0; i < 14; i++) {
            var s = document.createElement('span'); s.className = 'confetti';
            var ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 46;
            s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.background = cols[i % cols.length];
            s.style.setProperty('--dx', Math.cos(ang) * dist + 'px'); s.style.setProperty('--dy', (Math.sin(ang) * dist - 10) + 'px');
            daily.appendChild(s);
            (function (el) { requestAnimationFrame(function () { el.classList.add('go'); }); setTimeout(function () { el.remove(); }, 950); })(s);
          }
          var pb = pill.getBoundingClientRect();
          var sx = b.left + b.width / 2, sy = b.top + b.height / 2, tx = pb.left + pb.width / 2, ty = pb.top + pb.height / 2;
          for (var j = 0; j < 7; j++) {
            (function (j) {
              var f = document.createElement('span'); f.className = 'flyer';
              f.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>';
              var jx = Math.random() * 44 - 22, jy = Math.random() * 22 - 11;
              f.style.left = (sx - 9 + jx) + 'px'; f.style.top = (sy - 9 + jy) + 'px';
              // в #giftsPage (не body): CSS `#giftsPage .flyer{position:fixed;color:var(--spark)}` применится + var резолвится.
              // .page.active имеет transform:none → position:fixed остаётся viewport-relative (искры долетают до пилюли).
              (document.getElementById('giftsPage') || document.body).appendChild(f);
              var dx = tx - (sx + jx), dy = ty - (sy + jy);
              var a = f.animate([
                { transform: 'translate(0,0) scale(' + (0.6 + Math.random() * 0.5).toFixed(2) + ')', opacity: 0 },
                { opacity: 1, offset: 0.16 },
                { transform: 'translate(' + (dx * 0.34).toFixed(0) + 'px,' + (dy * 0.24 - 30 - Math.random() * 22).toFixed(0) + 'px) scale(1.15)', opacity: 1, offset: 0.5 },
                { transform: 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px) scale(.28)', opacity: 0 }
              ], { duration: 700 + Math.random() * 240, delay: j * 85, easing: 'cubic-bezier(.5,.05,.3,1)' });
              a.onfinish = function () { f.remove(); pill.classList.add('bump'); setTimeout(function () { pill.classList.remove('bump'); }, 190); };
            })(j);
          }
          setTimeout(function () {
            if (gain && newBal > oldBal) { gain.textContent = '+' + (newBal - oldBal); gain.classList.add('go'); setTimeout(function () { gain.classList.remove('go'); }, 1000); }
            // Алла 21.06: пилюля баланса СВЕТИТСЯ когда искра «прилетает» (реф .balance.glow) —
            // видно даже при Reduce Motion, где летящие искры (.flyer) скрыты.
            if (pill) { pill.classList.add('glow'); setTimeout(function () { pill.classList.remove('glow'); }, 1100); }
            countUp();
          }, 520);
        } catch (e) { var bn = document.getElementById('giftsBalanceNum'); if (bn) bn.textContent = newBal; }
      };
      function renderIskraClaim(d) {
        var _t = (typeof t === 'function') ? t : function(k, f) { return f || k; };
        var textEl = document.getElementById('iskraClaimText');
        var streakEl = document.getElementById('iskraStreak');
        var btn = document.getElementById('iskraClaimBtn');
        // #49 (Алла): прогресс-бар «X/100 — копи на песню» убран — claim про привычку + Оракула, не про накопление на песню.
        if (streakEl) {
          if (d.streak > 1) { streakEl.textContent = _t('iskraClaimStreak', 'Серия: {n}').replace('{n}', d.streak); streakEl.style.display = ''; }
          else streakEl.style.display = 'none';
        }
        if (d.canClaim) {
          if (textEl) textEl.textContent = _t('iskraClaimTextCan', 'Заходи каждый день и забирай Искру 🤍 С ней можно задать оракулу любой вопрос о себе.');
          if (btn) {
            btn.disabled = false; btn.style.display = '';
            // textContent затирал <svg> из разметки — подпись живёт в своём span.
            var lbl = btn.querySelector('[data-i18n="iskraClaimBtn"]') || btn.querySelector('span');
            if (lbl) lbl.textContent = _t('iskraClaimBtn', 'Забрать +2 Искры');
            else btn.textContent = _t('iskraClaimBtn', 'Забрать +2 Искры');
          }
        } else {
          // Забрала сегодня — мёртвая «Приходи завтра» убрана (Алла 13.06: непонятна, полупрозрачна). Только статус-текст.
          if (textEl) textEl.textContent = _t('iskraClaimTextDone', 'Сегодня Искра уже твоя 🤍 Возвращайся завтра за новой.');
          if (btn) { btn.style.display = 'none'; }
        }
      }
      // ── Подарки v2: серия-неделя, прогресс, рефералка ──
      function _renderGiftsWeek(week, streak) {
        var wrap = document.getElementById('iskraWeek');
        var dotsEl = document.getElementById('iskraWeekDots');
        var streakEl = document.getElementById('iskraWeekStreak');
        if (!wrap || !dotsEl) return;
        if (!Array.isArray(week) || week.length !== 7) { wrap.style.display = 'none'; return; }
        var _t = (typeof t === 'function') ? t : function (k, f) { return f || k; };
        var labels = String(_t('giftsWeekDays', 'Пн,Вт,Ср,Чт,Пт,Сб,Вс')).split(',');
        var checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>';
        var sparkSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>';
        // Кружки серии отражают стрик: бэкенд daily_claim_history бывает разрежен, поэтому
        // зачтённые дни выводим из счётчика streak (последние `streak` дней до сегодня/вчера).
        var _todayIdx = -1;
        for (var _ti = 0; _ti < week.length; _ti++) { if (week[_ti] && week[_ti].today) { _todayIdx = _ti; break; } }
        var _strk = Number(streak) || 0;
        var _todayClaimed = !!(window._iskraState && window._iskraState.claimedToday);
        var _lastClaimedIdx = _todayClaimed ? _todayIdx : _todayIdx - 1;
        dotsEl.innerHTML = '';
        week.forEach(function (day, i) {
          var claimed = !!(day && day.claimed) || (_todayIdx >= 0 && i <= _lastClaimedIdx && (_lastClaimedIdx - i) < _strk);
          var isToday = !!(day && day.today);
          var cell = document.createElement('div');
          cell.className = 'gst-day' + (isToday && !claimed ? ' today' : '');
          cell.innerHTML = '<span class="gst-d">' + (labels[i] || '') + '</span>' +
            '<span class="gst-dot' + (claimed ? ' got' : '') + (isToday && !claimed ? ' today' : '')
              + (i === 6 && !claimed ? ' goal' : '') + '">' +
            (claimed ? checkSvg : (isToday ? sparkSvg : (i === 6 ? '+' + (Number(window._iskraStreakBonus) || 10) : ''))) + '</span>';
          dotsEl.appendChild(cell);
        });
        if (streakEl) {
          var n = Number(streak) || 0;
          var lang = window._currentLang || 'ru';
          var stxt;
          if (lang === 'ru') {
            var m100 = n % 100, m10 = n % 10, w;
            if (m100 >= 11 && m100 <= 14) w = 'дней'; else if (m10 === 1) w = 'день'; else if (m10 >= 2 && m10 <= 4) w = 'дня'; else w = 'дней';
            stxt = n + ' ' + w + ' подряд';
          } else { stxt = String(_t('giftsWeekStreak', '{n} days in a row')).replace('{n}', n); }
          streakEl.innerHTML = (n > 0) ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .4-1.8 1-2.5C9 9 12 7 12 2Z"/></svg> ' + stxt : '';
          var sgEl = document.getElementById('sGoal');
          if (sgEl) { var _rem = Math.max(0, 7 - n); sgEl.textContent = _rem > 0 ? String(_t('iskraGoal','Ещё {n} дн. подряд → +10 Искр за серию 7 дней')).replace('{n}', _rem) : ''; sgEl.style.display = _rem > 0 ? '' : 'none'; }
        }
        wrap.style.display = 'block';
      }
      function _renderGiftsProgress(balance) {
        var wrap = document.getElementById('iskraProg');
        if (!wrap) return;
        // _t обязателен в каждой функции (паттерн проекта): без него ReferenceError
        // ронял весь блок claim и карточка Искры дня исчезала вместе с кнопкой.
        var _t = (typeof t === 'function') ? t : function (k, f) { return f || k; };
        var numEl = document.getElementById('iskraProgNum');
        var barEl = document.getElementById('iskraProgBar');
        var shown = Math.min(Number(balance) || 0, 100);
        if (numEl) numEl.innerHTML = '<span>' + shown + '<i>/100</i></span><small data-i18n="giftsProgLabel">'
          + String(_t('giftsProgLabel', 'на балансе')) + '</small>';
        if (barEl) barEl.style.width = shown + '%';
        // Песню Искрами открывает только первый пакет. Обещать «собери 100 — и она родится»
        // тому, у кого пакета нет, значит врать: сотня наберётся, а песня не откроется.
        var subEl = wrap.querySelector('[data-i18n="giftsProgSub"], [data-i18n="giftsProgSubPack"]');
        if (subEl) {
          var _hasPack = !!(window._cachedProfile && window._cachedProfile.has_purchased_package);
          var _subKey = _hasPack ? 'giftsProgSub' : 'giftsProgSubPack';
          subEl.setAttribute('data-i18n', _subKey);
          subEl.textContent = _t(_subKey, _hasPack
            ? 'Собери 100 Искр — и она родится'
            : 'Песню открывает первый пакет Искр — дальше платишь накопленным');
        }
        wrap.style.display = 'block';
      }
      var _giftsReferWired = false;
      async function _renderGiftsRefer() {
        var card = document.getElementById('giftsRefer');
        if (!card) return;
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || (typeof hasAuth === 'function' && !hasAuth())) { card.style.display = 'none'; return; }
        var hdrs = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
        try {
          var resp = await (window.fetchWithTimeout
            ? window.fetchWithTimeout(apiBase + '/api/referral/stats', { headers: hdrs }, 15000)
            : fetch(apiBase + '/api/referral/stats', { headers: hdrs }));
          var d = await resp.json().catch(function () { return {}; });
          if (!d || (d.invited_count == null && !d.link && !d.web_link)) { card.style.display = 'none'; return; }
          var inv = document.getElementById('giftsRefInvited'); if (inv) inv.textContent = Number(d.invited_count) || 0;
          var rewarded = Number(d.rewarded_count) || 0;
          var songs = document.getElementById('giftsRefSongs'); if (songs) songs.textContent = rewarded;
          var earned = document.getElementById('giftsRefEarned'); if (earned) earned.textContent = rewarded * 100; // 100 Искр за друга, создавшего песню
          // Платформо-зависимая реф-ссылка (как в loadReferralStats 27314 / _mtShareRefLink 45713).
          // OK-модерация (отказ 25.06): реф-ссылка ОБЯЗАНА вести на приложение ОК, а не ВК.
          var _gRef = ''; try { _gRef = d.link ? ((String(d.link).match(/ref_([^&]+)/) || [])[1] || '') : ''; } catch (_) {}
          var linkVal;
          if (window._appEnv === 'ok' || window._isOkMiniApp) {
            linkVal = _gRef ? ('https://ok.ru/app/512005149416?ref=' + _gRef) : 'https://ok.ru/app/512005149416';
          } else if (window._appEnv === 'vk' || window._isVkMiniApp) {
            linkVal = _gRef ? ('https://vk.com/app54531891#ref=' + _gRef) : 'https://vk.com/app54531891';
          } else {
            linkVal = d.web_link || d.link || '';
          }
          var inp = document.getElementById('giftsRefLinkInput'); if (inp) inp.value = linkVal;
          card.dataset.link = linkVal;
          card.style.display = 'block';
          if (!_giftsReferWired) {
            _giftsReferWired = true;
            var _t = (typeof t === 'function') ? t : function (k, f) { return f || k; };
            var copyBtn = document.getElementById('giftsRefCopyBtn');
            var shareBtn = document.getElementById('giftsRefShareBtn');
            var _doCopy = function (text) {
              if (window._copyToClipboard) { try { window._copyToClipboard(text); return; } catch (e) {} }
              try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); } catch (e) {}
            };
            if (copyBtn) copyBtn.addEventListener('click', function () {
              _doCopy(card.dataset.link || '');
              var sp = copyBtn.querySelector('span'); if (sp) { sp.textContent = _t('giftsRefCopied', 'Скопировано'); setTimeout(function () { sp.textContent = _t('giftsRefCopy', 'Копировать'); }, 1600); }
            });
            if (shareBtn) shareBtn.addEventListener('click', function () {
              var link = card.dataset.link || '';
              var _fb = function () { _doCopy(link); if (typeof showToast === 'function') showToast(_t('giftsRefCopied', 'Скопировано')); };
              // navigator.share падает/отсутствует на Huawei → копируем (не молчим). Отмену (AbortError) игнорим.
              if (navigator.share) { navigator.share({ url: link }).catch(function (e) { if (e && e.name === 'AbortError') return; _fb(); }); }
              else { _fb(); }
            });
          }
        } catch (e) { card.style.display = 'none'; } // тихо (закон №37)
      }
      // Квесты (Алла 02.07): «Вступить в сообщество» — платформо-зависимо. VK — жёсткая серверная
      // проверка (isVkCommunityMember, реальный VK API groups.isMember). OK — нет готового API
      // проверки членства, доверяем клиенту (тот же паттерн, что задание "share" в старом
      // download-гейте). TG/web — карточка скрыта (сообщества для вступления нет).
      var _giftsQuestsWired = false;
      function _renderGiftsQuests() {
        var card = document.getElementById('giftsQuests');
        if (!card) return;
        var isOk = window._appEnv === 'ok' || window._isOkMiniApp;
        var isVk = !isOk && (window._appEnv === 'vk' || window._isVkMiniApp);
        if (!isVk && !isOk) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        var ic = document.getElementById('questJoinIc');
        if (isVk && ic) ic.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.8 16.3c-5 0-8-3.5-8.1-9.2h2.5c.1 4.2 2 6 3.4 6.4V7.1h2.4v3.7c1.4-.15 2.9-1.8 3.4-3.7h2.4c-.4 2.3-2 3.9-3.1 4.6 1.1.6 2.9 2 3.6 4.6h-2.6c-.55-1.7-1.9-3-3.7-3.2v3.2h-.6Z"/></svg>';
        if (_giftsQuestsWired) return;
        _giftsQuestsWired = true;
        var btn = document.getElementById('questJoinBtn');
        if (!btn) return;
        // Клик по квесту «Вступить в сообщество». Открываем страницу сообщества через VKWebAppOpenLink —
        // ПРОВЕРЕННЫЙ в проекте способ (им уже открывается vk.com/club237303283 в 12-synastry-tail).
        // VKWebAppJoinGroup для этого мини-аппа молча отклонялся (группа не привязана к аппу) → клик
        // «ничего не делал». Теперь: тап открывает группу; при возврате в аппку — авто-проверка членства
        // и начисление. Повторный тап = проверить (и если ещё не член — снова открыть группу + подсказка).
        // Бэкенд остаётся реальным гейтом: VK — groups.isMember, OK — доверие. Любой тап виден (закон №20/№37).
        var groupUrl = isOk
          ? (window._YUPSOUL_OK_GROUP_URL || 'https://ok.ru/group/70000049367285')
          : 'https://vk.com/club237303283';
        var _t = (typeof t === 'function') ? t : function (k, f) { return f || k; };
        var _toast = function (m) { if (typeof showToast === 'function') showToast(m); };
        function _verifyJoin(withFeedback) {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
          var _f = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : function (u, o) { return fetch(u, o); };
          return _f(apiBase + '/api/community/join-bonus', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH), body: JSON.stringify({ platform: isOk ? 'ok' : 'vk' }) }, 20000)
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (j) {
              if (j && j.ok) {
                btn.classList.add('done');
                btn.textContent = _t('questJoinDone', 'Готово');
                // Отметка «уже в сообществе» — и локальная, и в памяти сессии.
                // Раньше этот путь (Подарки → Квесты) флаг НЕ писал вообще: тому,
                // кто получил +30 здесь, карточка стены в чате через час снова
                // обещала те же 30 Искр, а повторный запрос молча возвращал 0.
                try { localStorage.setItem('ys_vk_comm_joined', '1'); } catch (_) {}
                window._commJoinGiven = true;
                if (j.amount > 0) {
                  _toast(_t('questJoinToast', 'Спасибо! +30 Искр'));
                  // amount > 0 = бонус выдан впервые: повтор вернёт amount 0 — это и есть дедуп.
                  if (window._ysTrack) { try { window._ysTrack('community_joined', { platform: isOk ? 'ok' : 'vk', src: 'gifts', amount: Number(j.amount) || 0 }); } catch (_) {} }
                } else if (j.alreadyGranted && withFeedback) {
                  // Не молчим: иначе кнопка просто становится «Готово», Искр нет,
                  // и человек считает, что бонус пропал.
                  _toast(_t('questJoinAlready', 'Ты уже в сообществе'));
                }
                if (typeof j.balance === 'number') { var pn = document.getElementById('giftsBalanceNum'); if (pn) pn.textContent = j.balance; }
                return true;
              }
              if (withFeedback) _toast(_t('questJoinNeedMember', 'Сначала вступи в сообщество, потом вернись'));
              return false;
            })
            .catch(function (e) { console.warn('[gifts] join-bonus', e && e.message); return false; });
        }
        function _openGroup() {
          if (window.vkBridge && typeof vkBridge.send === 'function') {
            return vkBridge.send('VKWebAppOpenLink', { url: groupUrl })
              .catch(function () { try { window.open(groupUrl, '_blank', 'noopener'); } catch (_) {} });
          }
          try { window.open(groupUrl, '_blank', 'noopener'); } catch (_) {}
          return Promise.resolve();
        }
        // Когда пользователь вернулся в аппку после открытия группы — один раз тихо проверить членство.
        function _armReturnCheck() {
          var fired = false;
          var _fire = function () {
            if (fired) return;
            fired = true;
            document.removeEventListener('visibilitychange', onBack);
            try { if (window.vkBridge && typeof vkBridge.unsubscribe === 'function') vkBridge.unsubscribe(onBridge); } catch (_) {}
            if (!btn.classList.contains('done')) _verifyJoin(false);
          };
          var onBack = function () {
            if (fired || document.visibilityState !== 'visible') return;
            _fire();
          };
          // В клиенте VK сообщество открывается ПОВЕРХ мини-аппа: iframe фокус не
          // теряет, visibilitychange не приходит, и бонус не начислялся никогда
          // (жалоба Аллы 03.09). VKWebAppViewRestore — штатный сигнал возврата.
          var onBridge = function (e) {
            var ty = e && e.detail && e.detail.type;
            if (ty === 'VKWebAppViewRestore' || ty === 'VKWebAppLocationChanged') _fire();
          };
          document.addEventListener('visibilitychange', onBack);
          try { if (window.vkBridge && typeof vkBridge.subscribe === 'function') vkBridge.subscribe(onBridge); } catch (_) {}
          // Страховка на случай, когда не пришло ни одно событие.
          setTimeout(function () { if (!fired && !btn.classList.contains('done')) _verifyJoin(false); }, 12000);
          setTimeout(function () { if (!fired && !btn.classList.contains('done')) _verifyJoin(false); }, 40000);
          setTimeout(function () {
            fired = true;
            document.removeEventListener('visibilitychange', onBack);
            try { if (window.vkBridge && typeof vkBridge.unsubscribe === 'function') vkBridge.unsubscribe(onBridge); } catch (_) {}
          }, 120000);
        }
        btn.addEventListener('click', function () {
          if (btn.classList.contains('done')) return;
          if (btn.getAttribute('data-opened') === '1') {
            // повторный тап → проверить; если ещё не член — снова открыть группу
            _verifyJoin(true).then(function (ok) { if (!ok) _openGroup(); });
            return;
          }
          btn.setAttribute('data-opened', '1');
          btn.textContent = _t('questJoinCheck', 'Я вступил(а)');
          _openGroup();
          _armReturnCheck();
        });
      }

      // ── Карточка приглашения в сообщество на главной (Алла 22.08) ──────────────
      // Спокойный ряд в потоке главной (не всплывашка — §2.6.3 Правил VK), только на
      // площадках, где сообщество есть (VK/OK). Тап открывает сообщество; при возврате
      // в приложение членство проверяется сервером (groups.isMember) и начисляется бонус
      // (§2.6.2 — вступление в официальное сообщество в белом списке). Карточка исчезает,
      // когда бонус уже выдан (флаг community_join_bonus_given из /api/me).
      var _homeCommWired = false;
      window._initHomeCommunityCard = function () {
        var card = document.getElementById('homeCommCard');
        if (!card) return;
        var isVk = window._isVkMiniApp === true || window._appEnv === 'vk';
        var isOk = window._isOkMiniApp === true || window._appEnv === 'ok';
        if (!isVk && !isOk) { card.style.display = 'none'; return; }
        if (typeof hasAuth === 'function' && !hasAuth()) { card.style.display = 'none'; return; }
        if (window._commJoinGiven === true) { card.style.display = 'none'; return; }
        card.style.display = 'flex';
        if (_homeCommWired) return;
        _homeCommWired = true;
        var _t2 = (typeof t === 'function') ? t : function (k, f) { return f || k; };
        var _toast2 = function (m) { if (typeof showToast === 'function') showToast(m); };
        var url = isOk ? (window._YUPSOUL_OK_GROUP_URL || 'https://ok.ru/group/70000049367285') : 'https://vk.com/club237303283';
        function _open() {
          if (window.vkBridge && typeof vkBridge.send === 'function') {
            return vkBridge.send('VKWebAppOpenLink', { url: url })
              .catch(function () { try { window.open(url, '_blank', 'noopener'); } catch (_) {} });
          }
          try { window.open(url, '_blank', 'noopener'); } catch (_) {}
          return Promise.resolve();
        }
        function _verify() {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
          var _f = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : function (u, o) { return fetch(u, o); };
          return _f(apiBase + '/api/community/join-bonus', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH), body: JSON.stringify({ platform: isOk ? 'ok' : 'vk' }) }, 20000)
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (j) {
              if (j && j.ok) {
                card.style.display = 'none';
                window._commJoinGiven = true;
                if (j.amount > 0) _toast2(_t2('questJoinToast', 'Спасибо! +30 Искр'));
                return true;
              }
              return false;
            })
            .catch(function (e) { console.warn('[home] join-bonus', e && e.message); return false; });
        }
        card.addEventListener('click', function () {
          _open();
          var fired = false;
          var onBack = function () {
            if (fired || document.visibilityState !== 'visible') return;
            fired = true; document.removeEventListener('visibilitychange', onBack);
            _verify();
          };
          document.addEventListener('visibilitychange', onBack);
          setTimeout(function () { fired = true; document.removeEventListener('visibilitychange', onBack); }, 120000);
        });
      };
      // Пустой экран Подарков — это дыра: карточка дня скрыта, а взамен ничего.
      // Во всех состояниях «данных нет» показываем карточку первого запуска с CTA.
      function _giftsFirstRun(show) {
        var fr = document.getElementById('giftsFirstRun');
        if (!fr) return;
        fr.hidden = !show;
        if (!show) return;
        var btn = document.getElementById('giftsFirstRunCta');
        if (btn && !btn._wired) {
          btn._wired = true;
          btn.addEventListener('click', function () { if (window.goToPage) window.goToPage('formPage'); });
        }
      }
      var _iskraInitSeq = 0;
      async function initIskraClaim() {
        var card = document.getElementById('daily');
        if (!card) return;
        // Последний вызов главный: результат более раннего к DOM не применяем.
        var _seq = ++_iskraInitSeq;
        var _stale = function () { return _seq !== _iskraInitSeq; };
        // Карточку, уже показанную удачным ответом, ранний «нет авторизации» не гасит.
        var _rendered = function () { return !!(window._iskraState && window._iskraState.eligible); };
        var _ghint = document.getElementById('giftsEmptyHint'); var _gh = function(s){ if (_ghint) _ghint.style.display = s; };
        if (typeof hasAuth === 'function' && !hasAuth()) {
          if (_rendered()) return;                       // авторизация подъехала позже — карточку не трогаем
          // Экран Подарков открывается раньше, чем доезжает авторизация. Тихо ждём её
          // (закон №37: без текста об ошибке), и только потом решаем, что показывать.
          for (var _w = 0; _w < 6 && !hasAuth(); _w++) {
            await new Promise(function (r) { setTimeout(r, 400 + _w * 300); });
          }
          if (_stale() || _rendered()) return;
          if (!hasAuth()) { card.style.display = 'none'; _gh('none'); _giftsFirstRun(true); return; }
        }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase) {
          if (_rendered()) return;
          card.style.display = 'none'; _gh('none'); _giftsFirstRun(true); return;
        }
        var valueCard = document.getElementById('iskraValueCard');
        var _vc = function(s){ if (valueCard) valueCard.style.display = s; };
        var hdrs = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
        try {
          var resp = await (window.fetchWithTimeout
            ? window.fetchWithTimeout(apiBase + '/api/iskry/claim', { headers: hdrs }, 15000)
            : fetch(apiBase + '/api/iskry/claim', { headers: hdrs }));
          var d = await resp.json().catch(function () { return {}; });
          if (_stale()) return;
          if (!d || !d.ok) { card.style.display = 'none'; _gh('none'); _vc('none'); _giftsFirstRun(true); return; }
          // Блок ценности Искр (баланс + что можно + чат) — показываем ВСЕГДА.
          // Закрывает «куда искра попала / что с ней делать / пустой экран» (Алла 12.06).
          // Баланс Искр теперь в шапке Подарков (пилюля справа), а не в карточке (Алла 13.06).
          var _bal = Number(d.balance) || 0;
          var pillNum = document.getElementById('giftsBalanceNum');
          if (pillNum) pillNum.textContent = _bal;
          var pill = document.getElementById('giftsBalancePill');
          if (pill) {
            pill.style.display = 'inline-flex';
            // Сдача 10.09: пилюля баланса — вход в пополнение, а не просто число.
            if (!pill._wired) {
              pill._wired = true;
              var _openTopup = function () { if (window.goToPage) window.goToPage('topupPage'); };
              pill.addEventListener('click', _openTopup);
              pill.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openTopup(); }
              });
            }
          }
          _vc('block');
          // Спросить оракула + рефералка — видны всегда (после ok)
          var _spend = document.getElementById('giftsSpend'); if (_spend) _spend.style.display = 'flex';
          _renderGiftsRefer();
          _renderGiftsQuests();
          var _week = document.getElementById('iskraWeek'); var _prog = document.getElementById('iskraProg');
          if (d.eligible) {
            window._iskraState = d;
            renderIskraClaim(d);
            _renderGiftsWeek(d.week, d.streak);
            _renderGiftsProgress(d.balance);
            card.style.display = 'block';
            _gh('none');
            _giftsFirstRun(false);
            // На нативе VK карточка Искры дня стала достижимой только после снятия песенного гейта.
            // Дедуп по сессии — initIskraClaim зовётся при каждом заходе на экран.
            try {
              if (window._ysTrack && window._vkSongsOff && window._vkSongsOff()
                  && sessionStorage.getItem('ys_a_dailycard_gifts') !== '1') {
                sessionStorage.setItem('ys_a_dailycard_gifts', '1');
                window._ysTrack('vk_native_daily_card_shown', { src: 'gifts', canClaim: !!d.canClaim });
              }
            } catch (_) {}
            // Алла 21.06: если печенька уже открыта сегодня → состояние 'opened' (НЕ предлагать снова).
            // Иначе: canClaim → 'fresh' (забрать Искру), забрал → 'claimed' (печенька доступна).
            var _cookieOpenedToday = false; try { _cookieOpenedToday = (localStorage.getItem('ys_cookie_opened_day') === _ysTodayStr()); } catch (_) {}
            window._setDailyState(d.canClaim ? 'fresh' : (_cookieOpenedToday ? 'opened' : 'claimed'));
            _wireCookieBtn();
            // Алла 25.06: анимацию активирует ТОЛЬКО кнопка «Забрать Искру» (в claimIskra по успеху,
            // через _giftsClaimAnim). Тап по звёздочке-искре больше НЕ запускает анимацию (убран
            // replay-обработчик от 21.06 — он сбивал ожидание: анимация должна идти от кнопки).
          } else {
            // claim ещё закрыт (нет 1-й песни) — claim/серию/прогресс прячем, ценность Искр видна
            card.style.display = 'none';
            if (_week) _week.style.display = 'none';
            if (_prog) _prog.style.display = 'none';
            _gh('none');
            _giftsFirstRun(true);
          }
        } catch (e) {
          if (_stale() || _rendered()) return;           // поздний ответ уже показал карточку
          card.style.display = 'none'; _gh('none'); _vc('none'); _giftsFirstRun(true);
        } // тихо (закон №37)
      }
      window.initIskraClaim = initIskraClaim;
      function _showClaimError(code) {
        var card = document.getElementById('daily');
        if (!card) return;
        // Если под код есть перевод — показываем его вместо общей фразы (закон №31).
        var txEl = card.querySelector('.d-err-tx > span[data-i18n]');
        if (txEl && typeof t === 'function' && code) {
          var loc = t(String(code));
          if (loc && loc !== String(code)) txEl.textContent = loc;
        }
        var codeEl = document.getElementById('iskraErrCode');
        if (codeEl) codeEl.textContent = 'error_code: ' + String(code || 'ISKRA_CLAIM_FAILED');
        card.setAttribute('data-error', '');
        var retry = document.getElementById('iskraErrRetry');
        if (retry && !retry._wired) {
          retry._wired = true;
          retry.addEventListener('click', function () {
            card.removeAttribute('data-error');
            if (window.claimIskra) window.claimIskra();
          });
        }
      }
      window.claimIskra = async function claimIskra() {
        var btn = document.getElementById('iskraClaimBtn');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var hdrs = Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {});
        try {
          var resp = await (window.fetchWithTimeout
            ? window.fetchWithTimeout(apiBase + '/api/iskry/claim', { method: 'POST', headers: hdrs }, 15000)
            : fetch(apiBase + '/api/iskry/claim', { method: 'POST', headers: hdrs }));
          var d = await resp.json().catch(function () { return {}; });
          if (d && d.ok) {
            // Строго ПЕРВОЙ строкой блока: между _giftsClaimAnim и setTimeout ниже синхронную
            // работу вставлять нельзя — порядок вызовов чинили дважды (22.06 и 24.06), рвётся анимация.
            if (window._ysTrack && window._vkSongsOff && window._vkSongsOff()) {
              try { window._ysTrack('vk_native_daily_claimed', { src: 'gifts', streak: Number(d.streak) || 0, amount: Number(d.amount) || 0 }); } catch (_) {}
            }
            var _dc = document.getElementById('daily'); if (_dc) _dc.removeAttribute('data-error');
            if (typeof setIskryBalance === 'function') setIskryBalance(d.balance);
            if (typeof showToast === 'function') showToast('+' + d.amount + ' ' + (window.iskryPlural ? window.iskryPlural(d.amount) : 'Искр'));
            var _oldBal = Number((window._iskraState || {}).balance) || 0;
            var st = window._iskraState || {};
            st.canClaim = false; st.claimedToday = true; st.streak = d.streak; st.balance = d.balance; st.week = d.week || st.week;
            window._iskraState = st;
            // Алла 22.06: анимация «чуда» зовётся ПЕРВОЙ — как при тапе по искре (там работает), на ещё
            // стабильной карточке. Раньше она шла ПОСЛЕ _setDailyState/render-функций — и при заборе её НЕ
            // было (одна из них меняет layout / падает до вызова), хотя по тапу искра летела. Корень — порядок.
            if (window._giftsClaimAnim) { window._giftsClaimAnim(_oldBal, Number(d.balance) || 0); }
            else { var _pn = document.getElementById('giftsBalanceNum'); if (_pn) _pn.textContent = Number(d.balance) || 0; }
            // Ре-рендеры карточки ОТКЛАДЫВАЕМ до завершения анимации (≈950мс — flyer+countUp). Иначе
            // _setDailyState/renderIskraClaim синхронно перерисовывают #daily/#sparkBox и ПРЕРЫВАЮТ летящие
            // искры/confetti (Алла 24.06: «забираю — анимация не попадает», хотя по тапу искра летит).
            // Корень не в порядке вызова (фикс 22.06), а в гонке ре-рендера с асинхронной анимацией.
            setTimeout(function(){
              window._setDailyState('claimed'); // после клейма — печенька «расклад дня»
              _wireCookieBtn(); // печенька кликабельна сразу после клейма
              renderIskraClaim(st);
              _renderGiftsWeek(d.week || st.week, d.streak);
              _renderGiftsProgress(d.balance);
            }, 1000);
          } else if (d && d.error_code && d.error !== 'already_claimed' && d.error !== 'claim_locked') {
            // Сервер ответил отказом с кодом — это не сетевой сбой (закон №37 разрешает
            // показ), а результат действия: причина + код для поддержки (закон №31).
            _showClaimError(d.error_code);
            btn.disabled = false;
          } else if (d && (d.error === 'already_claimed' || d.error === 'claim_locked')) {
            var st2 = window._iskraState || {}; st2.canClaim = false; st2.claimedToday = true; if (d.streak != null) st2.streak = d.streak;
            renderIskraClaim(st2);
          } else {
            btn.disabled = false; // прочее — позволим повтор
          }
        } catch (e) {
          btn.disabled = false; // онлайн-фейл — повтор (закон №37, без error-текста в UI)
        }
      };
      // Helper: правильное склонение «Искр» для ru (1 Искра, 2-4 Искры, 5-20 Искр, 33 Искры…)
      window.iskryPlural = function iskryPlural(n) {
        n = Math.abs(Math.round(Number(n) || 0));
        var lang = window._currentLang || 'ru';
        if (lang !== 'ru') return (typeof t === 'function' ? t('iskryUnit') : 'Sparks') || 'Sparks';
        var mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 14) return 'Искр';
        var mod10 = n % 10;
        if (mod10 === 1) return 'Искра';
        if (mod10 >= 2 && mod10 <= 4) return 'Искры';
        return 'Искр';
      };
      window._trackPlural = function _trackPlural(n) {
        n = Math.abs(Math.round(Number(n) || 0));
        var lang = window._currentLang || 'ru';
        if (lang === 'de') return n === 1 ? 'Track' : 'Tracks';
        if (lang === 'fr') return n === 1 ? 'morceau' : 'morceaux';
        if (lang !== 'ru') return n === 1 ? 'track' : 'tracks';
        var mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 14) return 'треков';
        var mod10 = n % 10;
        if (mod10 === 1) return 'трек';
        if (mod10 >= 2 && mod10 <= 4) return 'трека';
        return 'треков';
      };
      function updateAllIskryDisplays() {
        var balance = getIskryBalance();
        document.querySelectorAll('[data-iskry-balance]').forEach(function(el) {
          var unit = window.iskryPlural(balance);
          el.textContent = balance + ' ' + unit;
        });
        document.querySelectorAll('[data-iskry-balance-number]').forEach(function(el) {
          el.textContent = balance;
        });
        updateHomeIskryHint(balance);
      }
      function updateHomeIskryHint(balance) {
        var el = document.getElementById('homeIskryHint');
        var txt = document.getElementById('homeIskryHintText');
        if (!el || !txt) return;
        var minPrice = ISKRY_PRICES.single_song || 100;
        var isLoggedIn = !!(localStorage.getItem('yupsoul_user_id') || (typeof window.TG_USER !== 'undefined' && window.TG_USER));
        var msg = '';
        if (!isLoggedIn) {
          msg = typeof t === 'function' ? (t('homeIskryHintGuest') || '') : 'Начни — получи ' + ISKRY_WELCOME_AMOUNT + ' Искр на первый трек';
        } else if (balance >= minPrice) {
          msg = typeof t === 'function' ? (t('homeIskryHintEnough') || '') : 'У тебя ' + balance + ' Искр — хватит на трек';
          msg = msg.replace('{n}', balance);
        } else if (balance > 0) {
          msg = typeof t === 'function' ? (t('homeIskryHintLow') || '') : 'У тебя ' + balance + ' Искр — пригласи друга, чтобы создать трек';
          msg = msg.replace('{n}', balance);
        } else {
          msg = typeof t === 'function' ? (t('homeIskryHintZero') || '') : 'Пригласи друга — получи Искры на первый трек';
        }
        txt.textContent = msg;
        el.style.display = msg ? '' : 'none';
      }
      // ── Счётчик песен на главной ──
      (function loadSongCounter() {
        var numEl = document.getElementById('homeSongCountNum');
        var lblEl = document.getElementById('homeSongCountLabel');
        var counterEl = document.getElementById('homeSongCounter');
        if (!numEl) return;
        // Алла 25.09 (видео App Review): «в Apple пишет, что там только 300 песен» — в нативе счётчик всегда
        // показывал резервные 367. Корень: модуль брал `API_BASE`, которого нет (все остальные — BACKEND_URL),
        // запрос уходил на capacitor://localhost и падал. Резерв больше не выдумывает число: последнее известное
        // с сервера или счётчик скрыт.
        function renderFallback() {
          var cached = 0;
          try { cached = parseInt(localStorage.getItem('ys_song_count') || '0', 10) || 0; } catch (_) {}
          if (!cached) { if (counterEl) counterEl.style.display = 'none'; return; }
          numEl.textContent = cached.toLocaleString('ru-RU');
          if (typeof t === 'function' && t('songCounterLabel')) {
            lblEl.textContent = t('songCounterLabel');
          }
          if (counterEl) counterEl.style.display = '';
        }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        fetch(apiBase + '/api/stats/total-songs').then(function(r) { return r.json(); }).then(function(d) {
          if (!d.success || !d.count) { renderFallback(); return; }
          var target = d.count;
          try { localStorage.setItem('ys_song_count', String(target)); } catch (_) {}
          // Алла 24.09 («сгенерировано песен показывает меньше»): на экране входа висел статичный «3000+»,
          // а живой счётчик уже 3510 — подставляем реальное число тем же запросом.
          try {
            var _pl = (typeof currentLang === 'string') ? currentLang : 'ru';
            var _pn = target.toLocaleString({ ru: 'ru-RU', en: 'en-US', de: 'de-DE', fr: 'fr-FR' }[_pl] || 'ru-RU');
            var _ptxt = (typeof t === 'function' && t('wlProofN') !== 'wlProofN') ? t('wlProofN').replace('{n}', _pn) : null;
            if (_ptxt) document.querySelectorAll('.wl-proof').forEach(function(el) { el.textContent = _ptxt; el.removeAttribute('data-i18n'); });
          } catch (_) {}
          // Animated count-up
          var start = Math.max(0, target - 40);
          var current = start;
          var step = Math.max(1, Math.floor((target - start) / 30));
          function tick() {
            current = Math.min(current + step, target);
            numEl.textContent = current.toLocaleString('ru-RU');
            if (current < target) requestAnimationFrame(tick);
          }
          tick();
          // i18n label
          if (typeof t === 'function' && t('songCounterLabel')) {
            lblEl.textContent = t('songCounterLabel');
          }
          if (counterEl) counterEl.style.display = '';
        }).catch(function() { renderFallback(); });
      })();

      function updatePaymentUpsell(sku) {
        var block = document.getElementById('payOvUpsellBlock');
        if (!block) return;
        var noUpsellSkus = ['deep_analysis_addon', 'soul_chat_1day'];
        if (noUpsellSkus.indexOf(sku) !== -1) {
          block.style.display = 'none';
          return;
        }
        // Активным подписчикам апсейл подписки не показываем — у них уже есть
        // подписка, push на «оформи подписку» бессмыслен (VK §5.2).
        if (window.hasSubscriptionActive === true) {
          block.style.display = 'none';
          return;
        }
        block.style.display = 'block';
        // Эталонный .pack: старая→новая цена/песня + экономия + total. Числа реальные.
        var oldEl = document.getElementById('payOvUpsellOld');
        var newEl = document.getElementById('payOvUpsellNew');
        var saveEl = document.getElementById('payOvUpsellSave');
        var totalEl = document.getElementById('payOvUpsellTotal');
        var _tlu = function(k, fb) { return (typeof t === 'function' && t(k)) || fb; };
        // Натив: цену называет Apple на своём экране покупки. Рублёвый апселл
        // здесь — вторая цена рядом с встроенной покупкой (правило 3.1.1),
        // прямой отказ на ревью. Детект и по классу: html.is-native ставится в
        // bootstrap синхронно, а флаг мог не успеть — та же гонка, из-за которой
        // ₽ протекли на нативный клиент ВК 02.07.
        var _upNative = window._isNativeApp
          || document.documentElement.classList.contains('is-native');
        if (_upNative) {
          block.style.display = 'none';
          return;
        }
        // VK: пакет-доступ (5 песен) в ГОЛОСАХ (₽ запрещены на VK — §5.2/§5.4).
        // Детект и по DOM-классу: html.is-vk ставится в bootstrap СИНХРОННО — env-флаги
        // могли не успеть (гонка → скрин Аллы 02.07: ₽ на нативном клиенте).
        var _upVk = window._isVkMiniApp || window._appEnv === 'vk'
          || document.documentElement.classList.contains('is-vk')
          || document.body.classList.contains('in-vk');
        if (_upVk) {
          // КАНОН v5 (отказ 22.07, §5.2.5): голосов на VK нет, а ₽ в песенном оверлее
          // запрещены (песня оплачивается Искрами — вторая валюта на экране была скрином
          // отказа). Апселл на VK не показываем вовсе: votes-ready НЕ ставим, и CSS
          // `html.is-vk #payOvUpsellBlock:not(.votes-ready){display:none!important}` скрывает блок.
          block.style.display = 'none';
          return;
        }
        // web/desktop: ₽
        var subRub = (_tbankPrices && _tbankPrices['soul_basic_sub']) || 810;
        var songRub = (_tbankPrices && (_tbankPrices[sku] || _tbankPrices['single_song'])) || 490;
        var perTrack = Math.round(subRub / 5);
        var pct = Math.max(1, Math.round((1 - perTrack / songRub) * 100));
        var perSongSfx = _tlu('payPackPerSong', '/песня');
        if (oldEl) oldEl.innerHTML = songRub + ' ₽<small>' + perSongSfx + '</small>';
        if (newEl) newEl.innerHTML = perTrack + ' ₽<small>' + perSongSfx + '</small>';
        if (saveEl) saveEl.textContent = '−' + pct + '%';
        if (totalEl) totalEl.textContent = subRub + ' ₽';
      }
      function handleUpsellSubscription() {
        // Batch 9.10 (отчёт 7262759, Глазунова): при переходе с paymentOverlay
        // на тарифы — сохраняем контекст pending заявки для sticky-banner
        // возврата к оформлению песни.
        try {
          // Баннер «вернуться к оформлению» — ТОЛЬКО при реальном неоплаченном заказе
          // (Алла 19.07: у подписчика Ярослава баннер висел без единой pending-заявки —
          // флаг ставился безусловно). Нет pending_payment id → флага нет.
          var _realPending = (typeof pendingPaymentRequestId !== 'undefined' && pendingPaymentRequestId) || window._pendingDraftRequestId || null;
          window._pendingDraftRequestId = _realPending;
          window._pendingDraftActive = !!_realPending;
        } catch(_) {}
        if (typeof hidePaymentOverlay === 'function') hidePaymentOverlay();
        // VK mobile: сразу подтверждение подписки голосами — без лишнего шага
        // через профиль (Алла 12.06: «почему не предлагается подписку сразу»)
        if ((window._isVkMiniApp || window._appEnv === 'vk' || document.documentElement.classList.contains('is-vk')) && typeof showPlanConfirm === 'function') {
          showPlanConfirm('plan_basic', (typeof t === 'function' ? t('planBasicName') : 'Душа'));
          return;
        }
        goToPage('profilePage');
        setTimeout(function() {
          // CD 19.09 · профиль: секции-аккордеона «Пакеты» больше нет — скроллим к кошельку (строка пакета)
          var planSection = document.getElementById('profileSectionPlansLink') || document.getElementById('profileSectionPlans');
          if (planSection) planSection.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
      window.handleUpsellSubscription = handleUpsellSubscription;

      // Batch 9.10: sticky-banner «Вернуться к оформлению песни» при
      // активном pending-черновике на не-form страницах.
      function _renderPendingDraftBanner(pageId) {
        try {
          var existing = document.getElementById('pendingDraftBanner');
          // Реальный неоплаченный заказ + НЕ активный подписчик лаборатории (Ярославу с
          // вечной лабораторией «доплатить за песню» бессмысленно — Алла 19.07).
          var _isActiveLab = (typeof userTariff !== 'undefined') && userTariff === 'master' && !window.subscriptionCancelledByUser;
          var shouldShow = !!window._pendingDraftActive
            && !!window._pendingDraftRequestId
            && !_isActiveLab
            && pageId !== 'formPage'
            && pageId !== 'loadingPage'
            && pageId !== 'webLoginScreen';
          if (!shouldShow) {
            if (existing) existing.style.display = 'none';
            return;
          }
          if (!existing) {
            existing = document.createElement('div');
            existing.id = 'pendingDraftBanner';
            // Стиль вынесен в CSS-класс .pending-draft-banner (theme-aware,
            // под общую канву приложения). Защита вёрстки (VK Testers #7265886,
            // Тамара MacOS 18.05: «текст вертикально, X на всю ширину» на узком
            // VK iframe / zoom) сохранена в CSS: box-sizing, min-height,
            // white-space:nowrap+ellipsis на label, flex-shrink:0 на dismiss.
            existing.className = 'pending-draft-banner';
            var label = document.createElement('button');
            label.type = 'button';
            label.id = 'pendingDraftBannerBtn';
            label.textContent = (typeof t === 'function' ? t('pendingDraftBannerText') : '') || '← Вернуться к оформлению песни';
            label.onclick = function() {
              if (typeof goToPage === 'function') goToPage('formPage');
            };
            var dismiss = document.createElement('button');
            dismiss.type = 'button';
            dismiss.id = 'pendingDraftBannerDismiss';
            dismiss.setAttribute('aria-label', 'Закрыть');
            dismiss.textContent = '×';
            dismiss.onclick = function() {
              window._pendingDraftActive = false;
              existing.style.display = 'none';
            };
            existing.appendChild(label);
            existing.appendChild(dismiss);
            document.body.appendChild(existing);
          } else {
            // Обновляем язык при показе (могла произойти смена локали)
            var btn = document.getElementById('pendingDraftBannerBtn');
            if (btn && typeof t === 'function') {
              var tx = t('pendingDraftBannerText');
              if (tx) btn.textContent = tx;
            }
          }
          existing.style.display = 'flex';
        } catch(e) { console.warn('[pendingDraftBanner]', e && e.message); }
      }
      window._renderPendingDraftBanner = _renderPendingDraftBanner;
      function showWhileGeneratingUpsell() {
        if (localStorage.getItem('yupsoul_deep_analysis_bought')) return;
        setTimeout(function() {
          var el = document.getElementById('whileGeneratingUpsell');
          if (el) el.style.display = 'block';
        }, 3000);
      }
      function handleBuyDeepAnalysis() {
        var el = document.getElementById('whileGeneratingUpsell');
        if (el) el.style.display = 'none';
        // Восстанавливаем requestId: сначала из polling (web), потом из localStorage
        if (!pendingPaymentRequestId && window._pendingGenerationRequestId) {
          pendingPaymentRequestId = String(window._pendingGenerationRequestId);
        }
        if (!pendingPaymentRequestId) {
          try { pendingPaymentRequestId = localStorage.getItem('hot_pending_request_id') || null; } catch(_) {}
        }
        if (!pendingPaymentRequestId) {
          if (typeof showToast === 'function') showToast(t('toastFirstSubmit'));
          return;
        }
        pendingPaymentSku = 'deep_analysis_addon';
        if (typeof showPaymentOverlay === 'function') showPaymentOverlay();
      }
      function showAfterFirstSong() {
        var purchaseCount = parseInt(localStorage.getItem('yupsoul_purchase_count') || '0', 10) + 1;
        localStorage.setItem('yupsoul_purchase_count', String(purchaseCount));
        var block = document.getElementById('afterFirstSongBlock');
        if (!block) return;
        if (purchaseCount <= 2) block.style.display = 'block';
      }
      window.shareApp = shareApp;
      function _doShare(url) {
        if (window._ysTrack) window._ysTrack('share_click', { type: 'referral', url: (url || '').substring(0, 100) });
        // VK Testers 7274702 (Maria Lykosova Android EN): VKWebAppCopyText
        // показывал свой системный toast «Скопировано в буфер обмена» ВСЕГДА
        // на русском, независимо от UI-языка. Также текст «Получи свою
        // персональную песню...» был hardcoded RU. Фикс: все строки через t().
        // VK Testers 7256516 ПЕРЕОТКРЫТ (Галина Кузнецова Windows 10 17.05):
        // «отправляется только текст без какой либо ссылки на приложение».
        // Корень: navigator.share({text, url}) — Edge/Chrome игнорируют поле
        // `url` если есть `text`, шарится только text. Аналогично Telegram
        // share dialog. Фикс: всегда включаем URL ВНУТРЬ text (один параметр).
        var _baseText = typeof t === 'function' ? (t('refShareText') || 'Получи свою персональную песню по дате рождения') : 'Получи свою персональную песню по дате рождения';
        var text = _baseText + '\n' + (url || '');
        // 18.05.2026 Алла одобрила Вариант A: ВСЕГДА copy + toast (без VK Bridge,
        // без navigator.share, без TG share dialog). Единый UX, никаких диалогов
        // с required text.
        // §22: копирование только через _copyToClipboard — он сам уходит в
        // execCommand там, где clipboard API нет или его перехватывает VK-клиент.
        var _copyMsg = typeof t === 'function' ? (t('profileLinkCopied') || 'Ссылка скопирована') : 'Ссылка скопирована';
        var _manual = function() {
          if (typeof showToast === 'function') {
            var _cm = (typeof t === 'function' && t('copyManually')) || 'Скопируй ссылку:';
            showToast(_cm + ' ' + (url || ''));
          }
        };
        try {
          Promise.resolve(window._copyToClipboard(text, { silent: true })).then(function(ok) {
            if (ok) { if (typeof showToast === 'function') showToast(_copyMsg); } else _manual();
          }, _manual);
        } catch(_) { _manual(); }
      }
      function shareApp() {
        var refEl = document.getElementById('profileRefLinkInput') || document.getElementById('referralLinkInput');
        // Для OK — ссылка на OK-приложение, для VK — на VK Mini App,
        // для веб — web_link, для TG — обычная ссылка.
        // YUPSOUL_OK_APP_URL — URL мини-приложения YupSoul в Одноклассниках.
        // OK App ID = 512005149416 (отдельный ID для платформы ОК внутри
        // того же приложения 54531891 в dev.vk.com). Можно переопределить
        // через window._YUPSOUL_OK_APP_URL.
        var YUPSOUL_OK_APP_URL = (window._YUPSOUL_OK_APP_URL || 'https://ok.ru/app/512005149416');
        var cached;
        if ((window._appEnv === 'ok' || window._isOkMiniApp) && window._myReferralLink) {
          var _rcOk = (window._myReferralLink.match(/ref_([^&]+)/) || [])[1] || '';
          cached = _rcOk ? YUPSOUL_OK_APP_URL + '?ref=' + _rcOk : YUPSOUL_OK_APP_URL;
        } else if (window._appEnv === 'vk' && window._myReferralLink) {
          var _rc = (window._myReferralLink.match(/ref_([^&]+)/) || [])[1] || '';
          cached = _rc ? 'https://vk.com/app54531891#ref=' + _rc : window._myReferralWebLink;
        } else {
          cached = (window._appEnv === 'web' && window._myReferralWebLink) ? window._myReferralWebLink : (window._myReferralLink || (refEl && refEl.value));
        }
        if (cached) { _doShare(cached); return; }
        // Fallback зависит от среды: в OK — на ОК-приложение, в VK — на VK Mini App,
        // иначе — на Telegram-бот. В VK/OK НИКОГДА не отдаём t.me-ссылку
        // (требования модерации обеих площадок — без упоминаний других площадок).
        var _fallbackUrl;
        if (window._appEnv === 'ok' || window._isOkMiniApp) {
          _fallbackUrl = YUPSOUL_OK_APP_URL;
        } else if (window._appEnv === 'vk' || window._isVkMiniApp) {
          _fallbackUrl = 'https://vk.com/app54531891';
        } else {
          _fallbackUrl = 'https://t.me/Yup_Soul_bot';
        }
        fetch(apiBase + '/api/referral/stats', { headers: getAuthHeaders() })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d && d.link) window._myReferralLink = d.link;
            if (d && d.web_link) window._myReferralWebLink = d.web_link;
            var shareLink;
            if (window._appEnv === 'ok' || window._isOkMiniApp) {
              var _refCodeOk = d && d.link ? (String(d.link).match(/ref_([^&]+)/) || [])[1] : '';
              shareLink = _refCodeOk ? YUPSOUL_OK_APP_URL + '?ref=' + _refCodeOk : _fallbackUrl;
            } else if (window._appEnv === 'vk' || window._isVkMiniApp) {
              // В VK — берём реферальный код из link и формируем vk.com ссылку
              var _refCode = d && d.link ? (String(d.link).match(/ref_([^&]+)/) || [])[1] : '';
              shareLink = _refCode ? 'https://vk.com/app54531891#ref=' + _refCode : _fallbackUrl;
            } else {
              shareLink = (window._appEnv === 'web' && d && d.web_link) ? d.web_link : (d && d.link ? d.link : null);
            }
            if (shareLink) { _doShare(shareLink); }
            else { _doShare(_fallbackUrl); }
          })
          .catch(function() { _doShare(_fallbackUrl); });
      }
      function checkAndShowSecondPurchaseBanner() {
        var purchaseCount = parseInt(localStorage.getItem('yupsoul_purchase_count') || '0', 10);
        var banner = document.getElementById('secondPurchaseUpsellBanner');
        if (!banner) return;
        var hasSubscription = window._userHasSubscription || false;
        if (purchaseCount >= 2 && !hasSubscription) banner.classList.add('visible');
      }
      function initWelcomeIskry() {
        if (!ISKRY_WELCOME_AMOUNT) return; // вкус — основной вход (Алла 02.07): автоматических welcome-Искр нет
        if (localStorage.getItem('yupsoul_welcome_iskry_given')) return;
        addIskry(ISKRY_WELCOME_AMOUNT);
        localStorage.setItem('yupsoul_welcome_iskry_given', '1');
        if (typeof showToast === 'function') showToast(t('toastWelcomeIskry').replace('{amount}', ISKRY_WELCOME_AMOUNT));
      }
      function isSubscriptionSku(sku) {
        var s = String(sku || '').toLowerCase();
        return s === 'soul_basic_sub' || s === 'soul_plus_sub' || s === 'master_monthly';
      }
      // Экспорт обязателен: зовётся голым именем из 04-tbank (checkPendingRequestOnStart,
      // баннер восстановления) и 08-gift (возврат с оплаты) — а те лежат в СВОИХ замыканиях
      // и это объявление оттуда не видно. Без экспорта → ReferenceError, который глотает
      // внешний try/catch → ветка молча обрывается. Проверено щупом в браузере 17.07.
      window.isSubscriptionSku = isSubscriptionSku;
      function getPaymentSkuFromStatus(statusJson) {
        var data = statusJson && statusJson.data ? statusJson.data : {};
        if (data.payment_sku) return String(data.payment_sku);
        if (data.payment_raw && typeof data.payment_raw === 'object' && data.payment_raw.sku) return String(data.payment_raw.sku);
        if (data.payment_raw && typeof data.payment_raw === 'string') {
          try {
            var parsed = JSON.parse(data.payment_raw);
            if (parsed && parsed.sku) return String(parsed.sku);
          } catch(_) {}
        }
        return '';
      }
      window.getPaymentSkuFromStatus = getPaymentSkuFromStatus; // см. коммент у isSubscriptionSku
      function normalizeBirthTimeInput(rawValue) {
        var raw = String(rawValue || '').trim();
        if (!raw) return '';
        var m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (m) {
          var h = parseInt(m[1], 10);
          var mm = parseInt(m[2], 10);
          if (h >= 0 && h <= 23 && mm >= 0 && mm <= 59) {
            return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
          }
          return '';
        }
        m = raw.match(/^(\d{1,2})[.\-](\d{2})$/);
        if (m) {
          var h2 = parseInt(m[1], 10);
          var mm2 = parseInt(m[2], 10);
          if (h2 >= 0 && h2 <= 23 && mm2 >= 0 && mm2 <= 59) {
            return String(h2).padStart(2, '0') + ':' + String(mm2).padStart(2, '0');
          }
        }
        m = raw.match(/^(\d{1,2})(\d{2})$/);
        if (m) {
          var h3 = parseInt(m[1], 10);
          var mm3 = parseInt(m[2], 10);
          if (h3 >= 0 && h3 <= 23 && mm3 >= 0 && mm3 <= 59) {
            return String(h3).padStart(2, '0') + ':' + String(mm3).padStart(2, '0');
          }
        }
        return '';
      }

      // ── Stars: универсальная функция открытия инвойса ─────────────────────
      window.payWithStars = async function payWithStars(sku, requestId, btn) {
        var apiBase  = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) { showToast(t('toastOpenInTg')); return; }
        var initData = getInitData ? getInitData() : '';

        // Проверка версии Telegram для Stars (требуется 6.9+) — только в Telegram
        var tgApp = window.Telegram && window.Telegram.WebApp;
        if (tgApp && tgApp.version && !compareVersion(tgApp.version, '6.9')) {
          showToast(t('toastUpdateTgStars'));
          return;
        }
        
        var authH = getAuthHeaders();
        var origText = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = t('payCreatingInvoice'); }
        try {
          var resp = await fetch(apiBase + '/api/payments/stars/invoice', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
            body: JSON.stringify({ sku: sku, initData: initData, request_id: requestId || null, promo_code: (activePromo && activePromo.code) ? activePromo.code : null })
          });
          var data = await resp.json().catch(function() { return {}; });
          // Промокод с полной скидкой — оплата не нужна
          if (data.success && data.free_applied) {
            if (btn) btn.textContent = t('payPromoApplied');
            activePromo = null;
            pendingPaymentRequestId = null;
            pendingPaymentSku = null;
            hidePaymentOverlay();
            var isSub = isSubscriptionSku(sku);
            if (isSub) {
              showToast(t('toastSubActivated'));
              goToPage('profilePage');
            } else {
              showConfirm(t('payPromoApplied'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
            }
            return;
          }
          if (!data.success || !data.invoice_link) {
            if (btn) { btn.disabled = false; btn.textContent = origText; }
            showToast(t('toastInvoiceFail'));
            return;
          }
          // Открываем инвойс Stars через Telegram WebApp
          var tgApp = window.Telegram && window.Telegram.WebApp;
          if (tgApp && typeof tgApp.openInvoice === 'function') {
            tgApp.openInvoice(data.invoice_link, function(status) {
              if (status === 'paid') {
                if (btn) btn.textContent = t('payPaid');
                catalogCache = null;
                catalogCacheTime = 0;
                // Закрываем оверлеи
                var planOv = document.getElementById('planConfirmOverlay');
                var payOv = document.getElementById('paymentOverlay');
                if (planOv) planOv.style.display = 'none';
                if (payOv) { payOv.style.display = 'none'; payOv.style.visibility = 'hidden'; payOv.style.pointerEvents = 'none'; }
                // Прямой переход без промежуточного confirmOverlay
                var isSub = isSubscriptionSku(sku);
                if (isSub) {
                  var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                  var claimInitData = getInitData ? getInitData() : '';
                  if (apiBase && typeof claimSubscriptionSafe === 'function') {
                    claimSubscriptionSafe(apiBase, claimInitData, requestId || '');
                  }
                  if (typeof showToast === 'function') showToast(t('toastSubActivated'));
                  goToPage('profilePage');
                } else if (sku === 'deep_analysis_addon') {
                  if (typeof showToast === 'function') showToast(t('toastSubPaid'));
                  goToPage('homePage');
                } else {
                  showConfirm(t('payPaid'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
                }
                // Сброс состояния оплаты
                pendingPaymentRequestId = null;
                pendingPaymentSku = null;
                try { localStorage.removeItem('hot_pending_request_id'); localStorage.removeItem('hot_pending_sku'); localStorage.removeItem('pending_payment_type'); } catch(_) {}
                setTimeout(function() {
                  if (typeof loadProfilePage === 'function') loadProfilePage().catch(function() {});
                  if (typeof loadPricingCatalog === 'function') loadPricingCatalog().catch(function() {});
                }, 1200);
              } else {
                if (btn) { btn.disabled = false; btn.textContent = origText; }
              }
            });
          } else if (tgApp && typeof tgApp.openLink === 'function') {
            tgApp.openLink(data.invoice_link);
            if (btn) { btn.disabled = false; btn.textContent = origText; }
          } else {
            window.open(data.invoice_link, '_blank');
            if (btn) { btn.disabled = false; btn.textContent = origText; }
          }
        } catch (e) {
          showToast(t('toastConnRetry'));
          if (btn) { btn.disabled = false; btn.textContent = origText; }
        }
      };

      // ── VK Pay: оплата Голосами VK ──────────────────────────────────────
      window.payWithVkPay = async function payWithVkPay(sku, requestId, btn) {
        if (!window.vkBridge) {
          console.warn('[VK Pay] vkBridge недоступен');
          return;
        }
        // Канон v9: ShowOrderBox не используется нигде. VK отказ 27.07 («убрать
        // платежи за голоса, в том числе для искр»), ОК отказ 29.07 («монетизация
        // должна быть как для цифровых ценностей, а не виртуальных»). Обе площадки
        // продают за деньги картой T-Bank своим эндпоинтом.
        if (window._isVkMiniApp || window._appEnv === 'vk' || window._isOkMiniApp || window._appEnv === 'ok') {
          console.warn('[VK Pay] заблокировано: ни голоса, ни ОКи не продаются (канон v9)');
          return;
        }
        var origText = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = t('payOpeningPayment'); }
        try {
          // 1. Создать заказ на бэкенде
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var authH = getAuthHeaders();
          var resp = await fetch(apiBase + '/api/payments/vk/order', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
            body: JSON.stringify({ sku: sku, request_id: requestId || null })
          });
          var orderData = await resp.json().catch(function() { return {}; });
          if (!orderData.success || !orderData.item_id) {
            if (btn) { btn.disabled = false; btn.textContent = origText; }
            console.warn('[VK Pay] order fail:', orderData.error || '');
            // §37: online+fail — без error-текста (юзер повторит клик); offline → единый overlay
            if (typeof window._ensureOnline === 'function') window._ensureOnline();
            return;
          }
          // 2. Открыть окно оплаты VK
          // VK-hang guard: VKWebAppShowOrderBox can hang on some VK clients
          // (promise never settles). Watchdog reverts the button after 30s so the
          // UI does not stay stuck on "opening payment" forever (law #37: no error text).
          var _vkPayStuck = setTimeout(function() {
            if (btn && btn.textContent === t('payOpeningPayment')) {
              btn.disabled = false; btn.textContent = origText;
            }
          }, 30000);
          var result;
          try {
            result = await vkBridge.send('VKWebAppShowOrderBox', {
              type: 'item',
              item: String(orderData.item_id)
            });
          } finally {
            clearTimeout(_vkPayStuck);
          }
          // 3. Оплата успешна — подтвердить на бэкенде
          if (result && result.status !== 'cancel') {
            if (btn) btn.textContent = t('payPaid');
            // Подтверждение
            fetch(apiBase + '/api/payments/vk/confirm', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
              body: JSON.stringify({ sku: sku, request_id: requestId || null, order_id: orderData.order_id || null })
            }).catch(function() {});
            // Закрываем оверлеи и показываем результат
            var planOv = document.getElementById('planConfirmOverlay');
            var payOv = document.getElementById('paymentOverlay');
            if (planOv) planOv.style.display = 'none';
            if (payOv) { payOv.style.display = 'none'; payOv.style.visibility = 'hidden'; payOv.style.pointerEvents = 'none'; }
            var isSub = typeof isSubscriptionSku === 'function' && isSubscriptionSku(sku);
            if (isSub) {
              if (typeof showToast === 'function') showToast(t('toastSubActivated'));
              goToPage('profilePage');
            } else {
              showConfirm(t('payPaid'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт уведомление.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
            }
            pendingPaymentRequestId = null;
            pendingPaymentSku = null;
            setTimeout(function() {
              if (typeof loadProfilePage === 'function') loadProfilePage().catch(function() {});
              if (typeof loadPricingCatalog === 'function') loadPricingCatalog().catch(function() {});
            }, 1200);
          } else {
            // Отмена
            if (btn) { btn.disabled = false; btn.textContent = origText; }
          }
        } catch (e) {
          console.error('[VK Pay] Ошибка:', e);
          if (btn) { btn.disabled = false; btn.textContent = origText; }
          // error_code 4 = пользователь отменил оплату — ничего не показываем.
          // §37: прочие ошибки при online — тоже без error-текста (юзер повторит);
          // offline → единый overlay «Нет подключения».
          if (!(e && e.error_data && e.error_data.error_code === 4)) {
            if (typeof window._ensureOnline === 'function') window._ensureOnline();
          }
        }
      };

      // Кнопка Stars в оверлее разовой покупки
      var payOvStarsBtn = document.getElementById('payOvStarsBtn');
      if (payOvStarsBtn) payOvStarsBtn.addEventListener('click', function() {
        var sku = pendingPaymentSku || '';
        if (!sku) { showToast(t('toastFillForm')); return; }
        if (window._ysTrack) window._ysTrack('payment_method_selected', { method: 'stars', sku: sku });
        payWithStars(sku, pendingPaymentRequestId, payOvStarsBtn);
      });

      // Кнопка VK Pay в оверлее разовой покупки.
      // КАНОН v4 (11.07): на VK кнопка перепрофилирована в «Пополнить Искры»
      // (dataset.vkTopup ставит 03-payment-overlay) — контент за голоса не продаётся,
      // прямой ShowOrderBox с песенным SKU сервер всё равно отвергнет («Неизвестный SKU»).
      var payOvVkPayBtn = document.getElementById('payOvVkPayBtn');
      if (payOvVkPayBtn) payOvVkPayBtn.addEventListener('click', function() {
        if (payOvVkPayBtn.dataset.vkTopup === '1') {
          if (window._ysTrack) window._ysTrack('payment_method_selected', { method: 'iskry_topup', sku: pendingPaymentSku || '' });
          try { if (typeof hidePaymentOverlay === 'function') hidePaymentOverlay(); } catch (_) {}
          if (window.goToPage) goToPage('topupPage');
          if (window._initTopupPage) window._initTopupPage();
          return;
        }
        var sku = pendingPaymentSku || '';
        if (!sku) { showToast(t('toastFillForm')); return; }
        if (window._ysTrack) window._ysTrack('payment_method_selected', { method: 'vkpay', sku: sku });
        payWithVkPay(sku, pendingPaymentRequestId, payOvVkPayBtn);
      });

      // ── T-Bank: оплата картой ──────────────────────────────────────────
      // Batch 9.20 (отчёт Глазуновой MacOS): «Кнопки оплаты 590/890 отсутствуют».
      // Корень: /tbank/config мог не успеть прийти к моменту открытия overlay
      // (медленная сеть / слабый MacBook 2017) → _tbankAvailable=false навсегда
      // → cardBtn.style.display='none' остаётся → юзер не видит кнопку «Картой».
      // Фикс — 3 защиты:
      //   1) Retry с exponential backoff (1s, 2s, 4s) при network error.
      //   2) Optimistic fallback: если все retry упали — считаем что T-Bank
      //      доступен (он настроен в проде, ENV проверяется на бэке).
      //      Юзер сможет нажать карту, фактическая ошибка покажется в init.
      //   3) При успехе — обновляем cardBtn даже если уже виден.
      (function loadTbankConfig() {
        // КАНОН v5 (отказ 22.07): карта T-Bank РАЗРЕШЕНА на VK-money (vk.ru/m.vk.ru,
        // §5.4.1) — конфиг обязателен, иначе _tbankAvailable навсегда false и клик
        // «Оплатить картой» в конфирме молча умирает («карта недоступна» — сценарий
        // отказа 28.04/23.04). На stub-VK денег нет вовсе — конфиг не грузим.
        // Приложение из App Store: оплата только встроенной покупкой Apple.
        // Конфиг российского эквайринга там не нужен — он приносит в приложение
        // рублёвый прайс, а запрос к нему в трафике читается как второй способ
        // оплаты (правило 3.1.1).
        if (window._isNativeApp) {
          console.log('[T-Bank] нативная сборка — оплата через Apple, конфиг не грузим');
          return;
        }
        var _tcVk = window._isVkMiniApp || window._appEnv === 'vk' || document.documentElement.classList.contains('is-vk');
        var _tcMoney = !!(window._vkPayMode && window._vkPayMode() === 'money');
        if (_tcVk && !_tcMoney) {
          console.log('[T-Bank] VK-stub — денег на этой поверхности нет, конфиг не грузим');
          return;
        }
        var attempts = 0;
        var maxAttempts = 3;
        function attempt() {
          attempts++;
          // ОТКАЗ ОК 03.08 («Оплата не работает» + скриншот тоста «Картой временно
          // недоступно»): голый fetch без таймаута мог ВИСЕТЬ, а не падать. Пока он
          // висит, .catch не вызывается → optimistic fallback ниже не срабатывает →
          // _tbankAvailable остаётся false → клик по карте отдаёт тост «недоступно».
          // Таймаут превращает зависание в ошибку, ошибку — в retry, а исчерпанные
          // retry — в available=true. Закон №36: fetch в init-логике только с таймаутом.
          fetchWithTimeout(BACKEND_URL + '/api/payments/tbank/config', {}, 8000)
            .then(function(r) { return r.json(); })
            .then(function(d) {
              _tbankAvailable = !!d.available;
              _tbankPrices = d.prices_rub || {};
              // ПЕСЕННУЮ карту (#payOvCardBtn) на VK не трогаем: песня платится
              // Искрами (вторая валюта в оверлее = скрин отказа 22.07), кнопка
              // скрыта CSS !important — inline display её не оживляет и не нужен.
              if (!_tcVk) {
                var cardBtn = document.getElementById('payOvCardBtn');
                if (cardBtn) cardBtn.style.display = _tbankAvailable ? 'block' : 'none';
              }
              console.log('[T-Bank] config:', _tbankAvailable ? 'доступен' : 'недоступен');
            })
            .catch(function(e) {
              console.warn('[T-Bank] config error (attempt ' + attempts + '/' + maxAttempts + '):', e.message);
              if (attempts < maxAttempts) {
                setTimeout(attempt, Math.pow(2, attempts - 1) * 1000); // 1s, 2s
              } else {
                // Optimistic fallback — если все retry упали, считаем что
                // T-Bank настроен (он есть в production ENV). Юзер сможет
                // нажать, реальная ошибка вернётся при init попытке.
                _tbankAvailable = true;
                if (!_tcVk) {
                  var cardBtn = document.getElementById('payOvCardBtn');
                  if (cardBtn) cardBtn.style.display = 'block';
                }
                console.warn('[T-Bank] config все retry упали — optimistic fallback на available=true');
              }
            });
        }
        attempt();
      })();

      // T-Bank: глобальный таймер polling (чтобы можно было остановить извне)
      var _tbankPollTimer = null;
      function stopTbankPolling() {
        if (_tbankPollTimer) { clearInterval(_tbankPollTimer); _tbankPollTimer = null; }
      }

      // Патчим hidePaymentOverlay чтобы останавливать T-Bank polling
      var _origHidePaymentOverlay = hidePaymentOverlay;
      hidePaymentOverlay = function() {
        stopTbankPolling();
        _origHidePaymentOverlay();
      };

      var payOvCardBtn = document.getElementById('payOvCardBtn');
      if (payOvCardBtn) payOvCardBtn.addEventListener('click', async function(e) {
        // КАНОН v3: карта на VK запрещена — guard-reject (кнопка и так скрыта CSS)
        if (window._isVkMiniApp || window._appEnv === 'vk') { console.warn('[T-Bank Card] заблокировано на VK (канон v3)'); return; }
        if (window._ysTrack) window._ysTrack('payment_method_selected', { method: 'tbank', sku: pendingPaymentSku || '' });
        console.log('[T-Bank Card] === КЛИК ПО КНОПКЕ КАРТЫ ===');
        console.log('[T-Bank Card] event.target:', e.target.id, e.target.textContent);
        console.log('[T-Bank Card] _tbankAvailable:', _tbankAvailable);
        console.log('[T-Bank Card] BACKEND_URL:', BACKEND_URL);
        if (payOvCardBtn.disabled) return;
        // Batch 7.14 (ID 7260610 Lykosova MacOS Высокий): «Отсутствуют кнопки оплаты для 590/890».
        // Возможный root cause: тестер открыл overlay ДО загрузки /tbank/config →
        // _tbankAvailable = false → click показывает toast «недоступна» → юзер думает
        // что кнопок нет. Defensive: убрали блокирующую проверку, передаём в backend —
        // он сам вернёт точный код (503 «не настроен» / 401 «авторизация» / 200 OK).
        // Если действительно tbank не настроен — backend ответит 503 в 7.x friendly tone.
        var sku = pendingPaymentSku || '';
        var requestId = pendingPaymentRequestId || '';
        console.log('[T-Bank Card] sku:', sku, 'requestId:', requestId);
        if (!sku || !requestId) {
          showToast(t('toastFillForm'));
          return;
        }
        // VK Testers ID 7260600 (Lykosova, MacOS): popup blocker блокирует
        // window.open() ВНУТРИ then() / await — потерян user-gesture контекст.
        // Открываем popup СРАЗУ при клике (синхронно), потом меняем его location.
        // Открываем платёжную вкладку СИНХРОННО при клике (пока жив user-gesture),
        // чтобы её не заблокировал popup-blocker после await fetch.
        // Нужно для: обычного веба И VK desktop / mobile-web (там VKWebAppOpenLink
        // не поддерживается и оплата падала в copy-link). НЕ для Telegram (свой openLink)
        // и НЕ для VK-мобильных клиентов (там оплата скрыта по §5.4.1).
        var _earlyPopup = null;
        var _isTgMode = !!(tg && typeof tg.openLink === 'function');
        var _isVkCtxEarly = (window._appEnv === 'vk' || window._isVkMiniApp);
        var _isVkMobileClient = !!window._vkIsMobileClient;
        var _wantEarlyPopup = !_isTgMode && !(_isVkCtxEarly && _isVkMobileClient);
        if (_wantEarlyPopup) {
          try { _earlyPopup = window.open('about:blank', '_blank'); } catch(_) {}
        }
        var btn = payOvCardBtn;
        var origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('payConnectingBank');

        try {
          var initData = getInitData();
          var tbankUrl = BACKEND_URL + '/api/payments/tbank/init';
          console.log('[T-Bank Card] Отправляем запрос:', tbankUrl);

          // getAuthHeaders() — Bearer JWT для VK/web, X-Telegram-Init для Telegram.
          var resp = await fetch(tbankUrl, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sku: sku, request_id: requestId, initData: initData, promo_code: (activePromo && activePromo.code) ? activePromo.code : null }),
          });
          var data = await resp.json().catch(function() { return {}; });
          console.log('[T-Bank Card] Ответ:', resp.status, JSON.stringify(data));

          // Промокод с полной скидкой
          if (data.success && data.free_applied) {
            if (btn) btn.textContent = t('payPromoApplied');
            activePromo = null;
            pendingPaymentRequestId = null;
            pendingPaymentSku = null;
            // Закрываем заранее открытый popup — оплата не нужна
            if (_earlyPopup) { try { _earlyPopup.close(); } catch(_) {} }
            hidePaymentOverlay();
            var isSub = isSubscriptionSku(sku);
            if (isSub) {
              showToast(t('toastSubActivated'));
              goToPage('profilePage');
            } else {
              showConfirm(t('payPromoApplied'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
            }
            return;
          }
          if (!resp.ok || !data.success || !data.payment_url) {
            btn.disabled = false;
            btn.textContent = origText;
            // Закрываем заранее открытый popup — payment_url не получили
            if (_earlyPopup) { try { _earlyPopup.close(); } catch(_) {} }
            // Закон №37: тех-текст (HTTP-код, сырой data.error) юзеру запрещён.
            // Кнопка вернулась — юзер повторит сам (init POST слепо не ретраим: дубли платежей).
            console.warn('[T-Bank Card] init failed:', resp.status, data && data.error);
            setPaymentStatus('', '');
            if (typeof window._ensureOnline === 'function') window._ensureOnline();
            return;
          }

          console.log('[T-Bank Card] payment_url:', data.payment_url);
          localStorage.setItem('tbank_payment_id', data.payment_id || '');
          localStorage.setItem('tbank_order_id', data.order_id || '');
          var isSubSku = ['soul_basic_sub','soul_plus_sub','master_monthly'].indexOf(sku) >= 0;
          var payType = (sku === 'deep_analysis_addon') ? 'analysis' : (isSubSku ? 'subscription' : 'song');
          var planKey = (sku === 'soul_basic_sub') ? 'plan_basic' : (sku === 'soul_plus_sub') ? 'plan_plus' : (sku === 'master_monthly') ? 'plan_master' : null;
          var planName = (sku === 'soul_basic_sub') ? 'Душа' : (sku === 'soul_plus_sub') ? 'Глубина' : (sku === 'master_monthly') ? 'Лаборатория' : null;
          try {
            var pendingPayload = { type: payType, request_id: requestId || (data.request_id || ''), sku: sku, ts: Date.now() };
            if (planKey) pendingPayload.plan_key = planKey;
            if (planName) pendingPayload.plan_name = planName;
            localStorage.setItem('pending_payment_type', JSON.stringify(pendingPayload));
          } catch (_) {}
          localStorage.setItem('tbank_payment_url', data.payment_url || '');

          // Открываем платёжную форму T-Bank.
          // В VK — через VK Bridge (VKWebAppOpenLink), чтобы страница открылась
          // в нативном интерфейсе VK, а не в iframe мини-аппа.
          // На вебе — используем заранее открытый _earlyPopup (popup blocker fix).
          console.log('[T-Bank Card] Открываем URL:', data.payment_url);
          if (_isTgMode) {
            // Telegram — нативный браузер Telegram
            if (_earlyPopup) { try { _earlyPopup.close(); } catch(_) {} }
            tg.openLink(data.payment_url);
          } else if (_earlyPopup && !_earlyPopup.closed) {
            // Веб + VK desktop/mobile-web: переводим заранее открытую вкладку на оплату.
            // user-gesture сохранён (popup открыт синхронно при клике) → не блокируется.
            try { _earlyPopup.location.href = data.payment_url; }
            catch(_) { try { window.open(data.payment_url, '_blank'); } catch(__) {} }
          } else if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
            // Последний fallback для VK (если вкладку всё же заблокировали):
            // нативный OpenLink, а если и он недоступен — копируем ссылку.
            vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
              .catch(function(){
                try { vkBridge.send('VKWebAppCopyText', { text: data.payment_url }).catch(function(){}); } catch(_) {}
                if (typeof showToast === 'function') showToast(t('payLinkCopied'));
              });
          } else {
            // Fallback (если popup был заблокирован при первом клике)
            window.open(data.payment_url, '_blank');
          }

          btn.disabled = false;
          btn.textContent = origText;

          // Показываем fallback-ссылку
          var linkRow = document.getElementById('payOvLinkRow');
          var linkHint = document.getElementById('payOvLinkHint');
          var copyBtn = document.getElementById('payOvCopyBtn');
          if (linkRow) linkRow.style.display = 'block';
          if (linkHint) linkHint.textContent = t('payFormNotOpened');
          if (copyBtn) {
            // Batch 5.23 расширение: на VK через VKWebAppCopyText, иначе clipboard.
            copyBtn.onclick = function() {
              var ok = function() {
                copyBtn.textContent = t('payCopied');
                setTimeout(function(){ copyBtn.textContent = t('payCopyLink'); }, 2000);
              };
              var fail = function() {
                if (typeof showToast === 'function') showToast(t('payCopyFail') || 'Не удалось скопировать');
              };
              if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
                vkBridge.send('VKWebAppCopyText', { text: data.payment_url }).then(ok, fail);
                return;
              }
              try { navigator.clipboard.writeText(data.payment_url).then(ok, fail); } catch(e){ fail(); }
            };
          }

          // Показываем кнопку «Я оплатил» с проверкой T-Bank (не HOT!)
          var checkBtn = document.getElementById('payOvCheckBtn');
          if (checkBtn) {
            checkBtn.style.display = 'block';
            checkBtn.textContent = t('payPaidByCardCheck');
          }

          // Polling статуса T-Bank
          stopTbankPolling();
          var tbankPaymentId = data.payment_id;
          if (tbankPaymentId) {
            var tbankPollAttempts = 0;
            var tbankPollMax = 30;
            _tbankPollTimer = setInterval(async function() {
              tbankPollAttempts++;
              if (tbankPollAttempts > tbankPollMax) { stopTbankPolling(); return; }
              try {
                var sr = await fetch(BACKEND_URL + '/api/payments/tbank/status?payment_id=' + encodeURIComponent(tbankPaymentId) + '&initData=' + encodeURIComponent(getInitData()));
                var sd = await sr.json();
                if (sd.paid) {
                  stopTbankPolling();
                  onTbankPaymentSuccess(sku, requestId, getInitData());
                }
              } catch(e) { console.warn('[T-Bank poll]', e.message); }
            }, 4000);
          }
        } catch (e) {
          btn.disabled = false;
          btn.textContent = origText;
          if (_earlyPopup) { try { _earlyPopup.close(); } catch(_) {} }
          setPaymentStatus('Попробуй снова.', 'error');
        }
      });

      function onTbankPaymentSuccess(sku, requestId, initData) {
        stopTbankPolling();
        localStorage.removeItem('tbank_payment_id');
        localStorage.removeItem('tbank_order_id');
        localStorage.removeItem('tbank_payment_url');
        localStorage.removeItem('pending_payment_type');
        pendingPaymentRequestId = '';
        pendingPaymentSku = '';
        var isSub = ['soul_basic_sub','soul_plus_sub','master_monthly'].indexOf(sku) >= 0;
        var isAnalysis = (sku === 'deep_analysis_addon');
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (isSub && typeof claimSubscriptionSafe === 'function') {
          claimSubscriptionSafe(apiBase, initData, requestId);
        }
        // Закрываем все оверлеи
        var planOv = document.getElementById('planConfirmOverlay');
        if (planOv) planOv.style.display = 'none';
        hidePaymentOverlay();
        // Прямой переход без confirmOverlay
        if (isSub) {
          if (typeof showToast === 'function') showToast(t('toastSubActivated'));
          goToPage('profilePage');
        } else if (isAnalysis) {
          if (typeof showToast === 'function') showToast(t('toastSubPaid'));
          goToPage('homePage');
        } else {
          showConfirm(t('payPaid'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
        }
      }

      window.showPlanConfirm = function showPlanConfirm(planKey, planName) {
        // §5.4.1 Правил VK Mini Apps: на нативных мобильных VK-клиентах
        // (vk_platform = mobile_iphone / mobile_android) ЗАПРЕЩЕНО показывать
        // оплату и уводы на оплату. Поэтому на VK mobile вместо overlay
        // показываем подсказку «Оформите на vk.com или yupsoul.ru».
        // На VK desktop / mobile-web подписки разрешены через интернет-эквайринг
        // Тинькофф (см. dev.vk.com/ru/mini-apps/monetization/sales).
        // OK Mini Apps — пока без подписок (vk_platform = ok), будет в следующей версии.
        // 12.06: подписки на VK mobile РАЗРЕШЕНЫ через голоса (нативный метод
        // §5.4) — silent return убран. Внутри overlay на mobile показывается
        // ТОЛЬКО votes-кнопка с ценой в голосах (карта/HOT/Stars скрыты CSS,
        // mainBtn с ₽ прячем ниже, цена — в голосах).
        if (window._isOkMiniApp) {
          // OK §1.7: оплата через ОКи/подписки разрешена только через VK Bridge
          // методы. Текстовый toast про yupsoul.ru — увод, не показываем.
          return;
        }
        // Apple 3.1.1: цифровые товары продаются только через встроенную покупку.
        // Оверлей выбора способа оплаты раскрывает «Оплатить картой» с уходом в
        // браузерный чекаут T-Bank — на нативе его не показываем вообще. Способ
        // там один, поэтому ведём прямо в покупку Apple. Работает для всех
        // входов: карточки пакетов, апселл лимита треков, реактивация,
        // картотека героев.
        if (window._isNativeApp) {
          if (typeof window._nativeBuyPlan === 'function') { window._nativeBuyPlan(planKey); return; }
          console.warn('[PlanConfirm] нативная покупка ещё не готова — оверлей не открываем (Apple 3.1.1)');
          return;
        }
        // КАНОН v5 §5.4.1 (отказ 22.07): оплата на VK — только денежные поверхности
        // vk.ru/m.vk.ru (_vkPayMode()==='money'). На stub (натив/планшет/неизвестно)
        // окно покупки НЕ открываем — silent return. Это последний рубеж (CSS первый).
        if (window._isVkMiniApp && !(window._vkPayMode && window._vkPayMode() === 'money')) {
          console.warn('[PlanConfirm] заблокировано: VK-платформа без оплаты (§5.4.1, канон v5)');
          return;
        }
        var overlay = document.getElementById('planConfirmOverlay');
        window._cfIsPack = false;
        var title = document.getElementById('planConfirmTitle');
        var desc = document.getElementById('planConfirmDesc');
        var starsBtn = document.getElementById('planConfirmStarsBtn');
        var cardBtn = document.getElementById('planConfirmCardBtn');
        var mainBtn = document.getElementById('planConfirmMainBtn');
        var methodsBlock = document.getElementById('planConfirmMethodsBlock');
        if (!overlay) return;
        // Канон v7: голосовая кнопка принадлежит модалке пакетов Искр (её включает
        // showIskryPackPayment). Здесь продаются пакеты треков — цифровая ценность,
        // только карта (§5.4.1). Сбрасываем состояние, оставшееся от прошлой модалки.
        var _pcVkPayBtn = document.getElementById('planConfirmVkPayBtn');
        if (_pcVkPayBtn && !(window._isOkMiniApp === true || window._appEnv === 'ok')) _pcVkPayBtn.style.display = 'none';
        // VK (любой): продаём разовый ПАКЕТ-доступ за голоса (не подписку). Раньше был
        // _vkIsMobileClient → на VK-мобайл-вебе/сбое детекта показывался «Тариф» + ₽.
        // Детект и по DOM-классу (html.is-vk ставится в bootstrap СИНХРОННО) — env-флаги
        // могли не успеть/сброситься при reload без launch query (найдено дизайн-аудитом 02.07).
        var _vkAny = window._isVkMiniApp || window._appEnv === 'vk'
          || document.documentElement.classList.contains('is-vk')
          || document.body.classList.contains('in-vk');
        var _vkPkg = _vkAny;
        var price = PLAN_PRICES[planKey] || '';
        // non-RU: карточки показывают $ (applyFixedPrices) — в confirm тоже $ (было ₽ = рассинхрон).
        var priceUsd = PLAN_PRICES_USD[planKey] || price;
        var tracks = PLAN_TRACKS[planKey] || '';
        var starsPrice = PLAN_STARS[planKey] || '';
        var _pm = (typeof t === 'function' ? t('perMonth') : '') || '';
        if (title) {
          // VK Testers 10.05.2026 (Тамара Глазунова, видеоскрин на FR):
          // hardcoded «Тариф» был всегда русским, должен локализоваться.
          // VK mobile: заголовок «Пакет» (разовая покупка за голоса).
          title.textContent = _vkPkg ? t('vkPackHeader') : (typeof t === 'function' ? t('planConfirmHeader') : 'Тариф');
        }
        var planNameEl = document.getElementById('planConfirmPlanName');
        if (planNameEl) {
          // VK Testers 10.05.2026: planName приходит русским из вызовов
          // ('plan_basic', 'Душа'). Маппим planKey → локализованное имя.
          var _planNameMap = {
            'plan_basic': typeof t === 'function' ? t('planBasicName') : (planName || 'Душа'),
            'plan_plus': typeof t === 'function' ? t('planPlusName') : (planName || 'Глубина'),
            'plan_master': typeof t === 'function' ? t('planMasterNameText') : (planName || 'Лаборатория'),
          };
          // VK mobile: имя пакета = «Пакет N песен» вместо названия тарифа.
          planNameEl.textContent = (_planNameMap[planKey] || planName || ''); // VK: имя пакета = имя тарифа (Душа/Глубина/Лаборатория) — Алла 13.06
        }
        var priceEl = document.getElementById('planConfirmPrice');
        var sku = PLAN_SKU_MAP[planKey] || '';
        var rubPrice = (_tbankPrices && _tbankPrices[sku]) || (PLAN_RUB_FALLBACK && PLAN_RUB_FALLBACK[sku]) || '';
        var rubStr = rubPrice ? rubPrice + ' ₽' : '';
        var _lang = window._currentLang || 'ru';
        if (priceEl) {
          if (_lang === 'ru' && rubStr) {
            // ru: только рубли
            priceEl.innerHTML = rubStr + _pm;
          } else {
            // VK Testers 7271823 ПЕРЕОТКРЫТ (FR 15.05.2026): «Цена в окне дублируется (2 раза подряд)».
            // Корень: на FR/EN/DE показывали $X + ' · ' + Y₽ (две цены в одну строку = воспринимается как дубль).
            // Фикс: на не-RU показываем ТОЛЬКО USD, рублёвую цену убираем (она не нужна нерезидентам).
            // Локальная цена для иностранцев = USD (как в тайлах applyFixedPrices).
            priceEl.innerHTML = priceUsd ? priceUsd + _pm : '';
          }
        }
        if (desc) {
          if (_vkPkg) {
            // Пакет: «N персональных песен» (+ картотека людей в Пакете 30).
            desc.textContent = t('vkPackSongs', { n: tracks }) + (planKey === 'plan_master' ? ' + ' + t('vkCardoteka') : '');
          } else {
            desc.textContent = tracks ? tracks + ' ' + t('bsTracksPerMonth') : '';
          }
        }
        // КАНОН v5 (отказ 22.07): голосов на VK НЕТ. Пакет на VK-money продаётся за ₽
        // (карта T-Bank) как на web — РАЗОВО, без «/мес» (подписок на VK нет, фрейминг
        // «Пакет» сохранён). Цена в голосах и votes-кнопка удалены — двойная валюта
        // на одном экране была скрином отказа модератора 22.07.
        var _vkMob = _vkAny;
        if (_vkMob && priceEl && rubStr) {
          // VK: разовая ₽-цена без «/мес»
          priceEl.innerHTML = rubStr;
        }
        // Сброс: одна кнопка «Оплатить» видна, блок методов скрыт (раскроется по клику)
        if (mainBtn) {
          mainBtn.style.display = '';
          mainBtn.style.animation = '';
          var _mainPm = _vkMob ? '' : _pm; // VK: разовый пакет, без «/мес»
          var _mainPriceStr = (_lang === 'ru' && rubStr) ? rubStr + _mainPm : (priceUsd ? priceUsd + _mainPm : '');
          mainBtn.textContent = (typeof t === 'function' ? t('pay') : 'Оплатить') + (_mainPriceStr ? ' — ' + _mainPriceStr : '');
        }
        if (methodsBlock) methodsBlock.style.display = 'none';
        // --- Промокод: сброс (скрыть поле, показать ссылку) ---
        var _appliedPromo = null;
        var _promoInput = document.getElementById('planPromoInput');
        var _promoApplyBtn = document.getElementById('planPromoApplyBtn');
        var _promoStatus = document.getElementById('planPromoStatus');
        var _promoToggle = document.getElementById('planPromoToggleBtn');
        var _promoRow = document.getElementById('planPromoRow');
        if (_promoInput) { _promoInput.value = ''; _promoInput.disabled = false; }
        if (_promoStatus) { _promoStatus.innerHTML = ''; _promoStatus.classList.remove('error','success'); }
        // §6.12 market-rules (канон v5): промокоды на VK запрещены — toggle скрыт на любом VK.
        if (_promoToggle) _promoToggle.style.display = _vkMob ? 'none' : '';
        if (_promoRow) _promoRow.style.display = 'none';
        if (_promoApplyBtn) {
          _promoApplyBtn.textContent = t('apply');
          _promoApplyBtn.disabled = false;
          // Сброс inline-стилей зелёного успеха (могли остаться от прошлого ✓)
          _promoApplyBtn.style.background = '';
          _promoApplyBtn.style.borderColor = '';
          _promoApplyBtn.style.color = '';
          _promoApplyBtn.onclick = async function() {
            var code = (_promoInput && _promoInput.value || '').trim().toUpperCase();
            if (!code) {
              if (_promoStatus) {
                _promoStatus.classList.remove('success'); _promoStatus.classList.add('error');
                _promoStatus.textContent = (typeof t === 'function' ? (t('promoEmptyError') || 'Введите промокод') : 'Введите промокод');
              }
              return;
            }
            _promoApplyBtn.textContent = '...';
            _promoApplyBtn.disabled = true;
            if (_promoStatus) { _promoStatus.textContent = ''; _promoStatus.classList.remove('error','success'); }
            try {
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              var initData = getInitData ? getInitData() : '';
              var sku = PLAN_SKU_MAP[planKey] || '';
              var resp = await fetch(apiBase + '/api/payments/validate-promo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init': initData },
                body: JSON.stringify({ promo_code: code, sku: sku, initData: initData })
              });
              var data = await resp.json().catch(function() { return {}; });
              if (resp.ok && data.ok) {
                _appliedPromo = code;
                if (_promoInput) _promoInput.disabled = true;
                _promoApplyBtn.textContent = '✓';
                _promoApplyBtn.disabled = true;
                _promoApplyBtn.style.background = 'rgba(34,197,94,0.15)';
                _promoApplyBtn.style.borderColor = 'rgba(34,197,94,0.3)';
                _promoApplyBtn.style.color = '#86efac';
                var discountText = data.discount_percent ? ('-' + data.discount_percent + '%') : (data.discount_amount ? ('-$' + data.discount_amount) : t('bsDiscount'));
                if (data.free) discountText = '100% ' + t('bsDiscount').toLowerCase();
                if (_promoStatus) {
                  _promoStatus.classList.remove('error'); _promoStatus.classList.add('success');
                  _promoStatus.textContent = discountText + ' ' + t('bsPromoApplied');
                }
                // Скрыть "Мне подарили промокод" после применения
                if (_promoToggle) _promoToggle.style.display = 'none';
                // Обновить цену с учётом скидки
                var origUsd = parseFloat((price || '').replace(/[^0-9.]/g, '')) || 0;
                var newUsd = origUsd;
                if (data.free) { newUsd = 0; }
                else if (data.discount_percent) { newUsd = origUsd * (1 - data.discount_percent / 100); }
                else if (data.discount_amount) { newUsd = Math.max(0, origUsd - data.discount_amount); }
                var newPriceStr = data.free ? t('bsFree') : ('$' + newUsd.toFixed(2) + _pm);
                var newRub = rubPrice ? Math.round(rubPrice * (newUsd / origUsd)) : '';
                var newRubStr = data.free ? '' : (newRub ? newRub + ' ₽' + _pm : '');
                // Обновить блок цены
                if (priceEl) {
                  var _lang2 = window._currentLang || 'ru';
                  var _origLine = (_lang2 === 'ru' && rubStr) ? rubStr + _pm : price + _pm;
                  if (data.free) {
                    priceEl.innerHTML = '<span style="text-decoration:line-through;opacity:0.4;">' + _origLine + '</span> ' + t('bsFree');
                  } else if (_lang2 === 'ru' && newRubStr) {
                    // ru: только рубли в новой цене
                    priceEl.innerHTML = '<span style="text-decoration:line-through;opacity:0.4;">' + _origLine + '</span> ' + newRubStr;
                  } else {
                    // VK Testers 7271823 ПЕРЕОТКРЫТ: на не-RU локалях показываем ТОЛЬКО USD, без дубля ₽.
                    priceEl.innerHTML = '<span style="text-decoration:line-through;opacity:0.4;">' + _origLine + '</span> ' + newPriceStr;
                  }
                }
                // Обновить кнопки оплаты
                if (data.free) {
                  // 100% скидка — скрыть все платёжные кнопки, показать одну "Активировать"
                  if (cardBtn) cardBtn.style.display = 'none';
                  if (starsBtn) starsBtn.style.display = 'none';
                  if (mainBtn) {
                    mainBtn.textContent = typeof t === 'function' ? t('btnActivateFree') : 'Активировать бесплатно';
                    mainBtn.style.display = '';
                    mainBtn.onclick = async function() {
                      mainBtn.textContent = typeof t === 'function' ? t('btnActivating') : 'Активируем...';
                      mainBtn.disabled = true;
                      try {
                        var _apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                        var _initData = getInitData ? getInitData() : '';
                        var _sku = PLAN_SKU_MAP[planKey] || '';
                        var _resp = await fetch(_apiBase + '/api/payments/tbank/init', {
                          method: 'POST',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ sku: _sku, initData: _initData, promo_code: _appliedPromo })
                        });
                        var _data = await _resp.json().catch(function() { return {}; });
                        if (_data.success && _data.free_applied) {
                          _appliedPromo = null;
                          showToast(t('toastSubActivated'));
                          var _ov1 = document.getElementById('planConfirmOverlay');
                          if (_ov1) _ov1.style.display = 'none';
                          mainBtn.textContent = typeof t === 'function' ? t('btnActivateFree') : 'Активировать бесплатно';
                          mainBtn.disabled = false;
                          if (typeof loadProfilePage === 'function') loadProfilePage();
                          goToPage('profilePage');
                          return;
                        }
                        // Фолбек: попробуем через HOT
                        var _resp2 = await fetch(_apiBase + '/api/payments/subscription/checkout', {
                          method: 'POST',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ initData: _initData, plan_key: planKey, promo_code: _appliedPromo, name: (userProfile && userProfile.name) || '' })
                        });
                        var _data2 = await _resp2.json().catch(function() { return {}; });
                        if (_data2.success && (_data2.promo_applied && _data2.free)) {
                          _appliedPromo = null;
                          showToast(t('toastSubActivated'));
                          var _ov2 = document.getElementById('planConfirmOverlay');
                          if (_ov2) _ov2.style.display = 'none';
                          mainBtn.textContent = typeof t === 'function' ? t('btnActivateFree') : 'Активировать бесплатно';
                          mainBtn.disabled = false;
                          if (typeof loadProfilePage === 'function') loadProfilePage();
                          goToPage('profilePage');
                          return;
                        }
                        mainBtn.textContent = typeof t === 'function' ? t('btnActivateFree') : 'Активировать бесплатно';
                        mainBtn.disabled = false;
                        showToast(t('toastActivateFail'));
                      } catch(e) {
                        mainBtn.textContent = typeof t === 'function' ? t('btnActivateFree') : 'Активировать бесплатно';
                        mainBtn.disabled = false;
                        // №37: error-toast при живом интернете запрещён; offline → overlay.
                        console.warn('[Promo] fetch fail:', e);
                        if (typeof window._ensureOnline === 'function') window._ensureOnline();
                      }
                    };
                  }
                } else {
                  // Частичная скидка — обновить текст на кнопках
                  if (mainBtn) mainBtn.textContent = t('pay') + ' — ' + newPriceStr;
                  if (cardBtn && cardBtn.style.display !== 'none') cardBtn.textContent = t('bsPayCard') + (newRubStr ? ' — ' + newRubStr : '');
                  if (starsBtn && starsBtn.style.display !== 'none' && starsPrice) {
                    var origStarsNum = parseInt(String(starsPrice).replace(/[^0-9]/g, '')) || 0;
                    var newStars = origUsd > 0 ? Math.max(1, Math.ceil(origStarsNum * (newUsd / origUsd))) : origStarsNum;
                    starsBtn.textContent = t('bsPayStars') + ' — ' + newStars.toLocaleString() + ' Stars';
                  }
                }
              } else {
                _appliedPromo = null;
                _promoApplyBtn.textContent = t('apply');
                _promoApplyBtn.disabled = false;
                var reason = data.reason || '';
                var msg = reason === 'not_found' ? t('bsPromoNotFound') : reason === 'expired' ? t('bsPromoExpired') : reason === 'limit_reached' ? t('bsPromoLimit') : (data.error || t('bsPromoInvalid'));
                if (_promoStatus) {
                  // VK Testers 7264304 ПЕРЕОТКРЫТ (Windows): инлайн color:#f87171 был невидим на тёмной теме.
                  // Используем class .error с явным фоном/border/font-weight (см. CSS .plan-promo-status.error).
                  _promoStatus.classList.remove('success'); _promoStatus.classList.add('error');
                  _promoStatus.textContent = msg;
                }
              }
            } catch(e) {
              // Закон №37: offline → overlay; online → silent, кнопка возвращается в исходное состояние,
              // пользователь может нажать «Применить» ещё раз.
              _appliedPromo = null;
              _promoApplyBtn.textContent = t('apply');
              _promoApplyBtn.disabled = false;
              if (typeof window._ensureOnline === 'function') window._ensureOnline();
              if (_promoStatus) { _promoStatus.innerHTML = ''; _promoStatus.classList.remove('error','success'); }
              console.warn('[Promo] silent fail — user can retry');
            }
          };
        }
        // Card button — оплата через T-Bank (карта)
        if (cardBtn) {
          cardBtn.style.display = '';
          var cardRub = (_tbankPrices && _tbankPrices[PLAN_SKU_MAP[planKey]]) || (PLAN_RUB_FALLBACK && PLAN_RUB_FALLBACK[PLAN_SKU_MAP[planKey]]) || '';
          var rubPrice = cardRub ? cardRub + ' ₽' : '';
          cardBtn.textContent = t('bsPayCard') + (rubPrice ? ' — ' + rubPrice : '');
          cardBtn.disabled = false;
          cardBtn.onclick = async function() {
            console.log('[T-Bank Card Sub] === КЛИК ПО КНОПКЕ КАРТЫ (подписка) ===');
            console.log('[T-Bank Card Sub] planKey:', planKey, 'sku:', PLAN_SKU_MAP[planKey]);
            // ОТКАЗ ОК 03.08: блокирующая проверка _tbankAvailable снята (см. тот же
            // разбор в showIskryPackPayment). Флаг ложно-false, пока не пришёл
            // /tbank/config — оплату решает бэкенд, а не гонка загрузки конфига.
            var origCardText = cardBtn.textContent;
            cardBtn.textContent = t('bsConnectingBank');
            cardBtn.disabled = true;
            try {
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              var initData = getInitData ? getInitData() : '';
              var subSku = PLAN_SKU_MAP[planKey] || '';
              console.log('[T-Bank Card Sub] Вызываем T-Bank init для подписки:', subSku);
              var tbankBody = { sku: subSku, initData: initData };
              if (_appliedPromo) tbankBody.promo_code = _appliedPromo;
              // getAuthHeaders() — для VK/web возвращает Bearer JWT, для Telegram X-Telegram-Init.
              // Раньше тут жёстко стоял X-Telegram-Init → в VK был 401 → «Не удалось создать платёж» (отказ модератора 28.04).
              var resp = await fetch(apiBase + '/api/payments/tbank/init', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(tbankBody)
              });
              var data = await resp.json().catch(function() { return {}; });
              console.log('[T-Bank Card Sub] Ответ:', resp.status, JSON.stringify(data));
              if (data.success && data.free_applied) {
                cardBtn.textContent = t('payPromoApplied');
                _appliedPromo = null;
                showToast(t('toastSubActivated'));
                goToPage('profilePage');
                return;
              }
              if (!resp.ok || !data.success || !data.payment_url) {
                cardBtn.textContent = origCardText;
                cardBtn.disabled = false;
                showToast(t('bsPaymentCreateError'));
                return;
              }
              console.log('[T-Bank Card Sub] payment_url:', data.payment_url);
              try {
                localStorage.setItem('tbank_payment_id', data.payment_id || '');
                localStorage.setItem('tbank_order_id', data.order_id || '');
                localStorage.setItem('pending_payment_type', JSON.stringify({
                  type: 'subscription',
                  plan_key: planKey,
                  plan_name: planName,
                  request_id: data.request_id || '',
                  ts: Date.now()
                }));
                localStorage.setItem('tbank_payment_url', data.payment_url || '');
              } catch(e) {}
              overlay.style.display = 'none';
              // Открываем payment_url:
              // - в VK Mini App — через VKWebAppOpenLink (нативный UI VK,
              //   window.open в iframe заблокирован — это и было причиной
              //   отказа модерации 23.04.2026 «не удалось оформить»);
              // - в Telegram — через tg.openLink (нативный браузер Telegram);
              // - на вебе — обычный window.open.
              if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
                vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
                  .catch(function(){ try { window.open(data.payment_url, '_blank'); } catch(_) {} });
              } else if (tg && typeof tg.openLink === 'function') {
                tg.openLink(data.payment_url);
              } else {
                window.open(data.payment_url, '_blank');
              }
              cardBtn.textContent = origCardText;
              cardBtn.disabled = false;
            } catch(e) {
              console.error('[T-Bank Card Sub] Ошибка:', e);
              cardBtn.textContent = t('payByCard') + (rubPrice ? ' — ' + rubPrice : '');
              cardBtn.disabled = false;
              // №37: error-toast при живом интернете запрещён; offline → системный overlay.
              if (typeof window._ensureOnline === 'function') window._ensureOnline();
            }
          };
        }
        if (starsBtn && starsPrice && window._appEnv === 'telegram') {
          starsBtn.style.display = '';
          starsBtn.textContent = t('bsPayStars') + ' — ' + starsPrice;
          starsBtn.disabled = false;
          var skuForStars = PLAN_SKU_MAP[planKey] || '';
          starsBtn.onclick = function() { payWithStars(skuForStars, null, starsBtn); };
        } else if (starsBtn) {
          starsBtn.style.display = 'none';
        }
        // КАНОН v5 (отказ 22.07): голосов на VK НЕТ — кнопка «Оплатить голосами» удалена.
        // Именно она рядом с ₽-CTA была скрином отказа («двойная оплата»). На VK-money
        // пакет оплачивается картой (cardBtn выше). На OK кнопку включает ОКи-ветка.
        var vkPayBtn = document.getElementById('planConfirmVkPayBtn');
        if (vkPayBtn) vkPayBtn.style.display = 'none';
        // Кнопка отключённого способа оплаты удалена из продукта (решение Аллы 27.08.2026) —
        // подписки и пакеты оплачиваются картой или Telegram Stars.
        overlay.style.display = 'flex';
      }

      // ── Тумблер уведомлений в профиле (§2.7.3 Правил VK Mini Apps: отключение уведомлений
      // прямо в приложении). Управляет reengage-рассылками (user_profiles.reengage_optout);
      // «песня готова» — транзакционное, не отключается. Состояние тянем через тот же
      // endpoint в режиме запроса (POST {} → {enabled}); синк зовёт loadProfilePage (04).
      // ── Тумблер уведомлений в профиле (§2.7.3 Правил VK Mini Apps) ──
      try {
      (function initNotifToggle() {
        var btn = document.getElementById('profileNotifToggleBtn');
        if (!btn) return;
        var enabled = true;
        function _ntl(k, fb) { return (typeof t === 'function' ? t(k) : '') || fb; }
        function label() {
          // CD 19.09 · профиль: строка «Уведомления» + тумблер (эталон); текстовая кнопка — запасной вид
          var sw = document.getElementById('profileNotifSw');
          if (sw) { sw.classList.toggle('on', enabled); btn.setAttribute('aria-pressed', String(enabled)); return; }
          btn.textContent = enabled ? _ntl('profileNotifDisable', 'Отключить уведомления') : _ntl('profileNotifEnable', 'Включить уведомления');
        }
        label();
        var synced = false;
        window._syncNotifToggle = function () {
          if (synced) { label(); return; }
          var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!base || (typeof hasAuth === 'function' && !hasAuth())) return;
          fetch(base + '/api/reengage-optout', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})), body: '{}' })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) { if (d && d.ok === true && typeof d.enabled === 'boolean') { enabled = d.enabled; synced = true; label(); } })
            .catch(function () {});
        };
        btn.addEventListener('click', function () {
          var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!base || (typeof hasAuth === 'function' && !hasAuth())) return;
          var next = !enabled;
          enabled = next; label(); btn.disabled = true;
          // Натив (App Store): тот же тумблер управляет локальным уведомлением «Искра дня».
          // Разрешение не дали → тумблер возвращается в выключенное состояние, без текста
          // об ошибке (закон №37) — существующий POST ниже не трогаем.
          if (window._isNativeApp) {
            if (next && typeof window._nativeEnableDailyNotif === 'function') {
              window._nativeEnableDailyNotif().then(function (ok) { if (!ok) { enabled = false; label(); } });
            } else if (!next && typeof window._nativeDisableDailyNotif === 'function') {
              window._nativeDisableDailyNotif();
            }
          }
          fetch(base + '/api/reengage-optout', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})), body: JSON.stringify({ enabled: next }) })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) { if (!d || d.ok !== true) { enabled = !next; label(); } else { synced = true; } })
            .catch(function () { enabled = !next; label(); })
            .finally(function () { btn.disabled = false; });
        });
      })();
      } catch(eNT) { console.error('[NotifToggle] boot error:', eNT); }

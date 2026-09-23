
      // ── Управление картой T-Bank ──────────────────────────────────────────
      async function loadPaymentMethod() {
        var section = document.getElementById('profilePaymentMethodSection');
        var cardInfo = document.getElementById('profileCardInfo');
        var noCard = document.getElementById('profileCardNoCard');
        var panEl = document.getElementById('profileCardPan');
        var expEl = document.getElementById('profileCardExpiry');
        var bindBtn = document.getElementById('profileBindCardBtn');
        var unbindBtn = document.getElementById('profileUnbindCardBtn');
        if (!section) return;
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var initData = getInitData();
        if (!apiBase || !initData) return;
        try {
          var resp = await fetch(apiBase + '/api/payments/tbank/cards', { headers: getAuthHeaders() });
          var data = await resp.json();
          if (data.cards && data.cards.length > 0) {
            var card = data.cards[0];
            section.style.display = 'block';
            if (cardInfo) cardInfo.style.display = 'flex';
            if (noCard) noCard.style.display = 'none';
            if (panEl) panEl.textContent = '💳 ' + (card.card_pan || '**** ****');
            var expStr = card.card_exp || card.exp_date || '';
            if (expEl && expStr) expEl.textContent = 'до ' + expStr;
            if (bindBtn) bindBtn.textContent = (typeof t === 'function' ? t('profileChangeCard') : 'Сменить карту');
            if (unbindBtn) unbindBtn.style.display = '';
          } else {
            section.style.display = 'block';
            if (cardInfo) cardInfo.style.display = 'none';
            if (noCard) noCard.style.display = 'block';
            if (bindBtn) bindBtn.textContent = (typeof t === 'function' ? t('profileBindCard') : 'Привязать карту');
            if (unbindBtn) unbindBtn.style.display = 'none';
          }
        } catch(e) {
          section.style.display = 'none';
        }
      }
      window.loadPaymentMethod = loadPaymentMethod;

      async function bindNewCard() {
        var btn = document.getElementById('profileBindCardBtn');
        if (btn) { btn.disabled = true; btn.textContent = typeof t === 'function' ? t('btnOpening') : 'Открываем…'; }
        try {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var initData = getInitData();
          var resp = await fetch(apiBase + '/api/payments/tbank/init', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ initData: initData, sku: 'card_bind', recurrent: true })
          });
          var data = await resp.json();
          if (data.payment_url) {
            var tg = window.Telegram && window.Telegram.WebApp;
            // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
            if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
              vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
                .catch(function(){ try { window.open(data.payment_url, '_blank'); } catch(_) {} });
            } else if (tg && typeof tg.openLink === 'function') {
              tg.openLink(data.payment_url);
            } else {
              window.open(data.payment_url, '_blank');
            }
            var attempts = 0;
            var pollTimer = setInterval(async function() {
              attempts++;
              if (attempts > 60) { clearInterval(pollTimer); if (btn) { btn.disabled = false; btn.textContent = (typeof t === 'function' ? t('profileBindCard') : 'Привязать карту'); } return; }
              try {
                await loadPaymentMethod();
                var panEl = document.getElementById('profileCardPan');
                if (panEl && panEl.textContent && panEl.textContent.indexOf('****') > -1) {
                  clearInterval(pollTimer);
                  if (btn) { btn.disabled = false; btn.textContent = (typeof t === 'function' ? t('profileChangeCard') : 'Сменить карту'); }
                }
              } catch(e2) {}
            }, 3000);
          } else {
            showToast(t('toastCardLinkFail'));
            if (btn) { btn.disabled = false; btn.textContent = (typeof t === 'function' ? t('profileBindCard') : 'Привязать карту'); }
          }
        } catch(e) {
          showToast(t('toastConnFail'));
          if (btn) { btn.disabled = false; btn.textContent = (typeof t === 'function' ? t('profileBindCard') : 'Привязать карту'); }
        }
      }
      window.bindNewCard = bindNewCard;

      async function unbindCard() {
        var confirmed = await _safeConfirm('Отвязать карту?');
        if (!confirmed) return;
        var btn = document.getElementById('profileUnbindCardBtn');
        if (btn) { btn.disabled = true; btn.textContent = typeof t === 'function' ? t('btnUnlinking') : 'Отвязываем…'; }
        try {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var initData = getInitData();
          var authH2 = typeof getAuthHeaders === 'function' ? getAuthHeaders() : { 'Content-Type': 'application/json' };
          var resp = await fetch(apiBase + '/api/payments/tbank/cancel-subscription', {
            method: 'POST',
            headers: authH2,
            body: JSON.stringify({ initData: initData, unbind_only: true })
          });
          var data = await resp.json();
          if (data.success) {
            showToast(t('toastCardUnlinked'));
            await loadPaymentMethod();
            return;
          } else {
            showToast(t('toastCardUnlinkFail'));
          }
        } catch(e) {
          showToast(t('toastConnFail'));
        }
        if (btn) { btn.disabled = false; btn.textContent = (typeof t === 'function' ? t('profileUnbindCard') : 'Отвязать карту'); }
      }
      window.unbindCard = unbindCard;

      // SKU тарифа → [i18n-ключ имени, запасное имя]. Один источник для бейджа
      // и для мгновенной отрисовки из кэша в начале loadProfilePage.
      var PLAN_NAME_KEY = {
        soul_basic_sub: ['planBasicName', 'Душа'],
        soul_plus_sub:  ['planPlusName', 'Глубина'],
        master_monthly: ['planMasterNameText', 'Лаборатория'],
      };

      // Загружает данные профиля на страницу «Профиль»
      async function loadProfilePage() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var initData = getInitData();
        var avatarEl = document.getElementById('profileAvatar');
        var avatarInitialEl = document.getElementById('profileAvatarInitial');
        var nameEl = document.getElementById('profileName');
        var planBadgeEl = document.getElementById('profilePlanBadge');
        // Тариф из прошлого визита — рисуем сразу. Иначе до ответа
        // /api/subscription/status (1-2с на мобильной сети) бейдж показывает
        // «Искатель» и потом перескакивает на настоящий тариф. Кэш пишется
        // ниже, когда ответ приходит; при потере подписки — стирается.
        if (planBadgeEl) {
          try {
            var _pbCache = JSON.parse(localStorage.getItem('yupsoul:planBadge') || 'null');
            var _pbName = _pbCache && PLAN_NAME_KEY[_pbCache.sku];
            if (_pbName) {
              planBadgeEl.textContent = '✦ ' + (typeof t === 'function' ? t(_pbName[0]) : _pbName[1]);
              planBadgeEl.style.background = _pbCache.bg;
              planBadgeEl.style.borderColor = _pbCache.border;
              planBadgeEl.style.color = _pbCache.color;
              // Ключ для applyTranslations: переводить бейдж как имя тарифа,
              // а не откатывать на дефолтного «Искателя»
              planBadgeEl.dataset.planKey = _pbName[0];
            }
          } catch (_) {}
        }
        var creditsEl = document.getElementById('profileCreditsCount');
        var refLinkEl = document.getElementById('profileRefLinkInput');
        var refInvEl = document.getElementById('profileRefInvited');
        var refRewEl = document.getElementById('profileRefRewarded');
        var errorWrap = document.getElementById('profileLoadErrorWrap');
        if (errorWrap) errorWrap.style.display = 'none';
        // VK Testers ID 7261319 (Windows): «Загрузка…» висит в профиле даже
        // когда у нас уже есть displayName из tg/google/vk. Показываем имя
        // сразу для всех платформ, чтобы не было пустого экрана.
        if (nameEl) nameEl.textContent = (displayName && displayName !== 'Guest') ? displayName : (typeof t === 'function' ? t('loading') : 'Загрузка…');
        // VK Testers 7272193 (MacOS, 14.05.2026): «—» в счётчике треков пугал
        // пользователей при холодном открытии профиля (выглядит как «нет данных» /
        // ошибка). Показываем кэшированное значение из прошлого визита (если есть) —
        // обновится через 1-2с когда backend ответит. Если кэша нет — «…» (loading),
        // не «—» (значение).
        if (creditsEl) {
          try {
            var cachedCredits = localStorage.getItem('yupsoul:lastCredits');
            // VK Testers 7272193: показываем cached значение из прошлого визита,
            // обновится через 1-2с от backend. Без cache — «…» (loading).
            // 16.05.2026: убрали ✨ эмодзи по команде Аллы (закон №42).
            // Cleanup legacy cache содержащего ✨ — strip перед display.
            if (cachedCredits && cachedCredits.length > 0) {
              var cleaned = cachedCredits.replace(/<span[^>]*>[^<]*<\/span>/g, '').replace(/✨/g, '').trim();
              creditsEl.textContent = cleaned || '…';
            } else {
              creditsEl.textContent = '…';
            }
          } catch (_) { creditsEl.textContent = '…'; }
        }
        if (refLinkEl) refLinkEl.value = '';
        if (refInvEl) refInvEl.textContent = '0';
        if (refRewEl) refRewEl.textContent = '0';
        var tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        var displayName = (tgUser && tgUser.first_name) ? tgUser.first_name : (typeof t === 'function' ? t('guestName') : 'Guest');
        if (window._appEnv === 'web' && window._googleUser && (window._googleUser.name || window._googleUser.email)) {
          displayName = window._googleUser.name || window._googleUser.email.split('@')[0] || displayName;
        }

        function setAvatarPhoto(src) {
          if (!avatarEl) return;
          var existing = avatarEl.querySelector('img');
          if (!existing) {
            var img = document.createElement('img');
            img.alt = 'avatar';
            avatarEl.insertBefore(img, avatarEl.firstChild);
            existing = img;
          }
          existing.onerror = function() {
            existing.style.display = 'none';
            if (avatarInitialEl) avatarInitialEl.style.display = '';
          };
          existing.src = src;
          existing.style.display = 'block';
          if (avatarInitialEl) avatarInitialEl.style.display = 'none';
        }

        // Сначала — инициалы (до 2 букв: первая буква каждого слова имени)
        // Batch 10.9 (7271872): Array.from для корректной обработки эмодзи (graphemes)
        function getProfileInitials(name) {
          return (name || '').trim().split(/\s+/).slice(0, 2)
            .map(function(w){ var chars = Array.from(w); return chars[0] || ''; })
            .join('').toUpperCase();
        }
        if (avatarInitialEl) avatarInitialEl.textContent = getProfileInitials(displayName);
        // Batch 10.9 (отчёт 7271862 Windows VK, регрессия Batch 10.3): раньше
        // показывали VK-фото мгновенно, потом оно сменялось на кастомный
        // avatar_url из /api/user/profile — визуальная подмена. Теперь:
        // СНАЧАЛА проверяем cached profile.avatar_url (сохраняется после
        // успешной загрузки профиля), затем уже tg/google/vk fallback.
        var photoUrl = '';
        try { photoUrl = localStorage.getItem('yup_avatar_url') || ''; } catch(_) {}
        if (!photoUrl) photoUrl = (tgUser && tgUser.photo_url) || '';
        if (!photoUrl) { try { photoUrl = localStorage.getItem('tg_photo_url') || ''; } catch(e) {} }
        if (!photoUrl && window._appEnv === 'web' && window._googleUser && window._googleUser.picture) photoUrl = window._googleUser.picture;
        if (!photoUrl && window._vkUserPhoto) photoUrl = window._vkUserPhoto;
        if (!photoUrl) { try { photoUrl = localStorage.getItem('vk_photo_url') || ''; } catch(e) {} }
        if (photoUrl) setAvatarPhoto(photoUrl);
        if (!apiBase || !hasAuth()) {
          if (nameEl) nameEl.textContent = displayName;
          return;
        }
        var initData = getInitData();
        var profileAuthH = getAuthHeaders();
        // Статус подписки не зависит ни от профиля, ни от рефералов — пускаем
        // его сразу, параллельно всему остальному. Раньше он ждал две волны
        // подряд и тариф доезжал последним (закон №36: с таймаутом).
        var _subStatusPromise = fetchWithRetry(apiBase + '/api/subscription/status', { headers: profileAuthH, timeoutMs: 15000 }, 1)
          .then(function(r) { return r.json().catch(function() { return null; }); })
          .catch(function(e) { console.warn('[Profile] Не удалось загрузить статус подписки:', e); return null; });
        try {
          var profileResp = await fetchWithRetry(apiBase + '/api/user/profile', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, profileAuthH),
            body: JSON.stringify({ initData: initData }),
            timeoutMs: 20000
          }, 2);
          var profileJson = await profileResp.json().catch(function() { return {}; });
          if (!profileResp.ok) {
            if (nameEl) nameEl.textContent = displayName;
            // Закон №37: НЕ показываем error-плашку. Offline → overlay. Online → тихий retry с max counter.
            if (!window._ensureOnline()) return;
            window._profileRetryCount = (window._profileRetryCount || 0) + 1;
            if (window._profileRetryCount > 4) { console.warn('[Profile] retry exhausted'); return; }
            var pBackoff = Math.min(20000, 2500 * Math.pow(1.6, window._profileRetryCount));
            setTimeout(function(){ if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){}); }, pBackoff);
            return;
          }
          // Успех — сбрасываем счётчик
          window._profileRetryCount = 0;
          if (profileJson.profile && profileJson.profile.name) displayName = profileJson.profile.name;
          // VK Testers 7257411 ПЕРЕОТКРЫТ-2: guard на потерю имени.
          // Если backend вернул profile без name (или name пустое) — НЕ перетираем
          // существующий cache. Это защита от race condition на Android WebView
          // где backend может временно вернуть устаревшую запись.
          var _newProf = profileJson.profile || {};
          // VK Testers 7257411 ПЕРЕОТКРЫТ-3 (17.05): кроме window cache,
          // используем localStorage backup (cache переживает navigate/reload).
          var _prevName = (window._cachedProfile && window._cachedProfile.name) || null;
          if (!_prevName) { try { _prevName = localStorage.getItem('yup_cached_profile_name') || null; } catch(_) {} }
          if ((!_newProf.name || String(_newProf.name).trim() === '') && _prevName) {
            _newProf.name = _prevName;
            if (!displayName) displayName = _prevName;
          }
          window._cachedProfile = _newProf;

          // Параллельно загружаем referral + pricing
          // NOTE: Promise.allSettled requires Chrome 76+ — not available on Redmi 9C (Android 10, Chrome 74).
          // Use Promise.all with .catch() wrappers for compatibility.
          var _settled = await Promise.all([
            fetchWithRetry(apiBase + '/api/referral/stats', { headers: profileAuthH, timeoutMs: 15000 }, 1)
              .then(function(r) { return r.json().catch(function(){ return null; }); })
              .catch(function() { return null; }),
            fetchWithRetry(apiBase + '/api/pricing/catalog', { headers: profileAuthH, timeoutMs: 15000 }, 1)
              .then(function(r) { return r.json().catch(function(){ return null; }); })
              .catch(function() { return null; })
          ]);
          var refData = _settled[0];
          var pricingData = _settled[1];

          if (nameEl) nameEl.textContent = displayName;
          if (avatarInitialEl) avatarInitialEl.textContent = getProfileInitials(displayName);

          // Карточка «Мои данные»
          var pdName     = document.getElementById('profileDataName');
          var pdDate     = document.getElementById('profileDataDate');
          var pdSep      = document.getElementById('profileDataSep');
          var pdCity     = document.getElementById('profileDataCity');
          var pdCitySep  = document.getElementById('profileDataCitySep');
          if (pdName) pdName.textContent = displayName || '';
          // Валидируем дату: birthdate может прийти truthy-но-невалидным (пустая/битая) —
          // тогда НЕ показываем дату и сепаратор «·» (иначе пустое состояние = «— ·», глюк).
          var _bd = (profileJson.profile && profileJson.profile.birthdate) ? new Date(profileJson.profile.birthdate + 'T00:00:00') : null;
          var _hasValidDate = !!(_bd && !isNaN(_bd.getTime()));
          if (pdDate) {
            // Эталон showcase-profile: дата словом «14 марта 1996» (без суффикса «г.»), не «14.03.1996».
            pdDate.textContent = _hasValidDate ? _bd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.?\s*$/, '') : '';
          }
          // Сепаратор «·» — ТОЛЬКО когда есть И имя, И валидная дата (иначе «— ·» / лишний «·»).
          if (pdSep) pdSep.style.display = (displayName && _hasValidDate) ? '' : 'none';
          // Подзаголовок целиком показываем ТОЛЬКО когда есть имя или валидная дата.
          // Пусто → «Мои данные» без второй строки (а не «— ·» / висячая заглушка).
          var pdSub = document.getElementById('profileDataSubtitle');
          if (pdSub) pdSub.style.display = (displayName || _hasValidDate) ? '' : 'none';
          var cityVal = profileJson.profile && (profileJson.profile.birthplace || profileJson.profile.birth_city || '');
          if (pdCity && cityVal) {
            pdCity.textContent = cityVal;
            if (pdCitySep) pdCitySep.style.display = '';
          } else if (pdCity) {
            pdCity.textContent = '';
            if (pdCitySep) pdCitySep.style.display = 'none';
          }
          // Время рождения
          var pdTime = document.getElementById('profileDataTime');
          var pdTimeSep = document.getElementById('profileDataTimeSep');
          var timeVal = profileJson.profile && !profileJson.profile.birthtime_unknown && profileJson.profile.birthtime;
          if (pdTime && timeVal) {
            pdTime.textContent = timeVal;
            if (pdTimeSep) pdTimeSep.style.display = '';
          } else if (pdTime) {
            pdTime.textContent = '';
            if (pdTimeSep) pdTimeSep.style.display = 'none';
          }
          // Пол
          var pdGender = document.getElementById('profileDataGender');
          var pdGenderSep = document.getElementById('profileDataGenderSep');
          var genderVal = profileJson.profile && profileJson.profile.gender;
          if (pdGender && genderVal) {
            pdGender.textContent = genderVal === 'female' ? 'Ж' : (genderVal === 'male' ? 'М' : '');
            if (pdGenderSep && pdGender.textContent) pdGenderSep.style.display = '';
          } else if (pdGender) {
            pdGender.textContent = '';
            if (pdGenderSep) pdGenderSep.style.display = 'none';
          }

          // Фото из профиля (приоритет выше Telegram photo_url)
          if (profileJson.profile && profileJson.profile.avatar_url) {
            setAvatarPhoto(profileJson.profile.avatar_url);
            // Batch 10.9 (7271862): кэшируем для мгновенного показа на следующих загрузках
            try { localStorage.setItem('yup_avatar_url', profileJson.profile.avatar_url); } catch(_) {}
          } else {
            // Профиль не имеет custom avatar → очищаем кэш (юзер удалил аватар)
            try { localStorage.removeItem('yup_avatar_url'); } catch(_) {}
          }


          // Синхрон баланса Искр с сервером (приветственные 60 + реферальные начисления)
          if (refData && typeof refData.iskry_balance === 'number') {
            try { localStorage.setItem('yupsoul_iskry', String(Math.round(refData.iskry_balance))); } catch(_) {}
            if (typeof setIskryBalance === 'function') setIskryBalance(refData.iskry_balance);
            if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
            // Прямое обновление бейджа Искр в шапке (на случай если updateAllIskryDisplays не сработал)
            var _bal = Math.round(refData.iskry_balance);
            document.querySelectorAll('[data-iskry-balance]').forEach(function(el) {
              var _unit = (typeof window.iskryPlural === 'function') ? window.iskryPlural(_bal) : ((typeof t === 'function' ? t('iskryUnit') : 'Искр') || 'Искр');
              el.textContent = _bal + ' ' + _unit;
            });
          }

          // Реферальные ссылки — формируем ссылку под платформу:
          // — VK: внутри-VK ссылка vk.com/app54531891#ref=<code> (требование §4.1.8 правил VK Mini Apps —
          //       нельзя уводить на другие площадки, ссылка должна вести на мини-приложение ВКонтакте);
          // — OK: внутри-OK ссылка ok.ru/app/512005149416?ref=<code> (аналогичное требование ОК);
          // — Web: web_link (yupsoul.ru/...);
          // — Telegram: t.me/Yup_Soul_bot?start=ref_<code> (бэкендовая link).
          if (refData && refData.link) window._myReferralLink = refData.link;
          if (refData && refData.web_link) window._myReferralWebLink = refData.web_link;
          var displayLink = '';
          var _refCode = '';
          try { _refCode = refData && refData.link ? (String(refData.link).match(/ref_([^&]+)/) || [])[1] || '' : ''; } catch(_) {}
          if ((window._appEnv === 'vk' || window._isVkMiniApp)) {
            displayLink = _refCode ? ('https://vk.com/app54531891#ref=' + _refCode) : 'https://vk.com/app54531891';
          } else if ((window._appEnv === 'ok' || window._isOkMiniApp)) {
            displayLink = _refCode ? ('https://ok.ru/app/512005149416?ref=' + _refCode) : 'https://ok.ru/app/512005149416';
          } else if (window._appEnv === 'web' && refData && refData.web_link) {
            displayLink = refData.web_link;
          } else {
            displayLink = (refData && refData.link) ? refData.link : '';
          }
          // Натив: реф-блок скрыт (см. app.css, html.is-native #profileReferralSection),
          // а ссылка ведёт в Телеграм-бот — в сторе это увод к другому способу оплаты.
          if (window._isNativeApp) displayLink = '';
          if (refLinkEl) refLinkEl.value = displayLink;
          var invCount = (refData && typeof refData.invited_count === 'number') ? refData.invited_count : 0;
          var rewardedCount = (refData && typeof refData.rewarded_count === 'number') ? refData.rewarded_count : 0;

          // Заполняем grid-статистику рефералов
          var rsInv = document.getElementById('refStatInvited');
          var rsAct = document.getElementById('refStatActivated');
          var rsSp = document.getElementById('refStatSparks');
          if (rsInv) rsInv.textContent = invCount;
          if (rsAct) rsAct.textContent = rewardedCount;
          if (rsSp) rsSp.textContent = (refData && typeof refData.iskry_balance === 'number') ? Math.round(refData.iskry_balance) : 0;

          // Блок Искр с приглашённых (energy = iskry, единый баланс)
          var earningsBlock = document.getElementById('profileRefEarningsBlock');
          var balanceEl = document.getElementById('profileRefBalance');
          if (earningsBlock) {
            var totalIskry = (refData && typeof refData.iskry_balance === 'number') ? refData.iskry_balance : 0;
            earningsBlock.style.display = 'block';
            var _roundedIskry = Math.round(totalIskry);
            var unit = (typeof window.iskryPlural === 'function') ? window.iskryPlural(_roundedIskry) : ((typeof t === 'function' ? t('iskryUnit') : 'Искр') || 'Искр');
            if (balanceEl) balanceEl.textContent = _roundedIskry + ' ' + unit;
            var earningsLabelEl = document.getElementById('profileRefEarningsLabel');
            if (earningsLabelEl) earningsLabelEl.textContent = (typeof t === 'function' ? t('refEarningsLabel') : 'Ваши Искры:');
          }

          // --- Статистика Искр: Получено / Потрачено ---
          // Batch 10.5 (7271036): «Мой баланс» вынесен в отдельную секцию.
          // Показываем секцию когда есть данные iskry_stats ИЛИ ref earnings.
          var balanceSection = document.getElementById('profileMyBalanceSection');
          if (balanceSection && refData && (refData.iskry_stats || refData.iskry_balance != null)) {
            balanceSection.style.display = 'block';
          }
          var iskryStatsBlock = document.getElementById('profileIskryStatsBlock');
          if (iskryStatsBlock && refData && refData.iskry_stats) {
            var ist = refData.iskry_stats;
            iskryStatsBlock.style.display = 'block';
            var earnedEl = document.getElementById('iskryStatEarnedNum');
            var spentEl = document.getElementById('iskryStatSpentNum');
            var breakdownEl = document.getElementById('iskryBreakdown');
            if (earnedEl) earnedEl.textContent = ist.total_earned || 0;
            if (spentEl) spentEl.textContent = ist.total_spent || 0;
            if (breakdownEl) {
              /* _tl — глобальная, определена рядом с t() */
              var parts = [];
              // Batch 10.5 (отчёт 7271050 Maria Lykosova MacOS+Android):
              // «На песни: 1» — двусмысленно (1 шт или 1 Искра?). Переводим
              // на Искры (1 песня = 100 Искр, 1 чат = 30 Искр) — это
              // согласуется с totalSpent = spentSongs*100 + spentChat*30.
              // Подпись остаётся прежней, значение — Искры (без эмодзи, по запросу Аллы 16.05.2026).
              var _songsIskry = (ist.spent_songs || 0) * 100;
              var _chatIskry  = (ist.spent_soul_chat || 0) * 30;
              if (_songsIskry > 0) parts.push(_tl('iskryBreakdownSongs','На песни') + ': ' + _songsIskry);
              if (_chatIskry  > 0) parts.push(_tl('iskryBreakdownChat','Soul Chat') + ': ' + _chatIskry);
              breakdownEl.textContent = parts.length ? parts.join(' · ') : '';
            }
          }

          // --- Статус подписки (новый API) --- запрос летит с начала функции
          var subData = await _subStatusPromise;

          var balanceLabelEl = document.getElementById('profileBalanceLabel');
          var balanceHintEl = document.getElementById('profileBalanceHintText');
          var renewalDateEl = document.getElementById('profileRenewalDate');

          // Запись текста CTA-кнопки тарифа — в .cta-label (внутри кнопки цена/точка,
          // прямой btn.textContent затёр бы их). pay-kit-разметка showcase-plans.
          var _setPlanBtnText = function(btn, txt) {
            if (!btn) return;
            var lbl = btn.querySelector('.cta-label');
            if (lbl) {
              // applyTranslations перетирает текст по data-i18n — состояние подписчика («Действует до…»,
              // «Перейти на…») держим без ключа, исходный ключ храним в data-i18n-orig (аудит 23.09:
              // «Активен» откатывался обратно на «Подключить»).
              if (lbl.hasAttribute('data-i18n')) lbl.setAttribute('data-i18n-orig', lbl.getAttribute('data-i18n'));
              lbl.removeAttribute('data-i18n');
              lbl.textContent = txt;
            } else btn.textContent = txt;
          };
          // Сбрасываем все карточки тарифов в исходное состояние
          var allPlanCards = ['planCardFree','planCardBasic','planCardPlus','planCardMaster'];
          var allPlanBtns = {
            planCardBasic: { btnId: 'planBtnBasic', origText: (typeof t === 'function' ? t('plBasicCta') : 'Get Soul') },
            planCardPlus:  { btnId: 'planBtnPlus',  origText: (typeof t === 'function' ? t('plPlusCta') : 'Get Depth') },
            planCardMaster:{ btnId: 'planBtnMaster', origText: (typeof t === 'function' ? t('plLabCta') : 'Get Laboratory') },
          };
          allPlanCards.forEach(function(id) {
            var card = document.getElementById(id);
            if (card) { card.classList.remove('current'); var _ct = card.querySelector('.cur-tag'); if (_ct) _ct.remove(); }
          });
          Object.values(allPlanBtns).forEach(function(b) {
            var btn = document.getElementById(b.btnId);
            if (btn) {
              _setPlanBtnText(btn, b.origText); btn.disabled = false; btn.style.opacity = ''; btn.classList.remove('ghost-cur');
              var _l = btn.querySelector('.cta-label');
              if (_l && _l.getAttribute('data-i18n-orig')) _l.setAttribute('data-i18n', _l.getAttribute('data-i18n-orig'));
            }
          });

          var subActive = subData && subData.subscription_active;
          var planSku = subData && subData.plan_sku;
          // Batch 10.9 (отчёт 7271875 Windows): backend возвращает русское plan_name
          // («Лаборатория»), на EN/DE/FR отображалось русским. Маппим planSku к
          // локализованному имени через i18n ключи.
          var _planNamePair = PLAN_NAME_KEY[planSku];
          var _localPlanName = _planNamePair
            ? (typeof t === 'function' ? t(_planNamePair[0]) : _planNamePair[1])
            : undefined;
          var planName = _localPlanName || (subData && subData.plan_name) || (typeof t === 'function' ? t('planFreeName') : 'Искатель');

          // Синхронизируем глобальные переменные с актуальным статусом подписки
          var subIsCancelled = subData && subData.is_cancelled;
          if (subActive && planSku) {
            hasSubscriptionActive = true;
            if (planSku === 'master_monthly') userTariff = 'master';
            else if (planSku === 'soul_plus_sub') userTariff = 'plus';
            else if (planSku === 'soul_basic_sub') userTariff = 'basic';
            // Grace period: подписка отменена, но доступ сохраняется до renew_at
            window.subscriptionCancelledByUser = !!subIsCancelled;
          } else {
            hasSubscriptionActive = false;
            userTariff = 'basic';
            window.subscriptionCancelledByUser = false;
          }
          // Сохраняем данные о последней истёкшей подписке для UI реактивации
          if (subData && subData.last_expired_plan) window._lastExpiredPlan = subData.last_expired_plan;
          // Показываем ссылку на управление подпиской на главной
          var homeSubLink = document.getElementById('homeSubCancelLink');
          if (homeSubLink) homeSubLink.style.display = subActive ? 'block' : 'none';

          // Карта SKU → ID карточки и цвет
          var planCardMap = {
            soul_basic_sub: { cardId: 'planCardBasic', btnId: 'planBtnBasic', color: 'var(--primary-color)', bg: 'rgba(var(--primary-rgb),0.12)', border: 'rgba(var(--primary-rgb),0.45)' },
            soul_plus_sub:  { cardId: 'planCardPlus',  btnId: 'planBtnPlus',  color: 'var(--secondary-color)', bg: 'rgba(var(--secondary-rgb),0.12)', border: 'rgba(var(--secondary-rgb),0.45)' },
            master_monthly: { cardId: 'planCardMaster', btnId: 'planBtnMaster', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.45)' },
          };

          if (subActive && planSku && planCardMap[planSku]) {
            var pm = planCardMap[planSku];
            var tracksUsed = subData.tracks_used_this_month || 0;
            var tracksLimit = subData.tracks_limit || 0;
            var tracksRemaining = subData.tracks_remaining || 0;
            var renewAt = subData.renew_at;
            // VK Testers 7272264: сохраняем глобально чтобы cancelSubscription
            // мог подставить точную дату в confirm-text вместо абстрактного «до конца периода».
            window._currentRenewAt = renewAt;
            var dateLocale = { ru: 'ru-RU', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
            var renewDateStr = renewAt
              ? new Date(renewAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })
              : null;

            // Бейдж плана
            if (planBadgeEl) {
              planBadgeEl.textContent = '✦ ' + planName;
              planBadgeEl.style.background = pm.bg;
              planBadgeEl.style.borderColor = pm.border;
              planBadgeEl.style.color = pm.color;
              planBadgeEl.title = (typeof t === 'function' ? t('planCurrentBadge') : 'Текущий тариф');
              if (_planNamePair) planBadgeEl.dataset.planKey = _planNamePair[0];
              // Снимок для мгновенной отрисовки при следующем открытии
              try { localStorage.setItem('yupsoul:planBadge', JSON.stringify({ sku: planSku, bg: pm.bg, border: pm.border, color: pm.color })); } catch (_) {}
            }

            // Баланс-карточка: счётчик треков (все строки через t() для выбранного языка)
            if (balanceLabelEl) balanceLabelEl.textContent = typeof t === 'function' ? t('profileTracksThisMonth') : 'Треков в этом месяце';
            if (creditsEl) {
              var creditsStr = tracksUsed + ' / ' + tracksLimit;
              creditsEl.textContent = creditsStr;
              // VK Testers 7272193: кэшируем чтобы при следующем открытии профиля
              // не было «…» / «—» — пользователь увидит знакомое значение сразу.
              try { localStorage.setItem('yupsoul:lastCredits', creditsStr); } catch (_) {}
            }
            if (balanceHintEl) balanceHintEl.textContent = typeof t === 'function' ? t('profileTracksRemaining', { n: tracksRemaining }) : tracksRemaining + ' треков ещё доступно';
            if (renewalDateEl && renewDateStr) {
              if (subIsCancelled) {
                renewalDateEl.textContent = typeof t === 'function' ? (t('subCancelledGrace', { date: renewDateStr }) || ('Отменена · доступ до ' + renewDateStr)) : 'Отменена · доступ до ' + renewDateStr;
                renewalDateEl.style.color = 'rgba(239,68,68,0.8)';
              } else {
                renewalDateEl.textContent = typeof t === 'function' ? (t('profileRenewalDate', { date: renewDateStr }) || ('Действует до ' + renewDateStr)) : 'Действует до ' + renewDateStr;
                renewalDateEl.style.color = '';
              }
              renewalDateEl.style.display = '';
            }

            // Выделяем активную карточку, убираем «Текущий» с бесплатного тарифа
            var cardFree = document.getElementById('planCardFree');
            if (cardFree) cardFree.classList.remove('current');
            var freeBadge = document.getElementById('planFreeBadge');
            if (freeBadge) freeBadge.style.visibility = 'hidden';
            var activeCard = document.getElementById(pm.cardId);
            if (activeCard) { activeCard.classList.add('current'); activeCard.style.borderColor = pm.border; }
            // Показываем бейдж «Текущий» на активном тарифе
            var activeBadge = activeCard && activeCard.querySelector('.ppc-badge');
            if (activeBadge) { activeBadge.textContent = typeof t === 'function' ? t('planCurrentBadge') || 'Текущий' : 'Текущий'; activeBadge.style.visibility = 'visible'; activeBadge.style.display = ''; activeBadge.style.color = pm.color; }
            var activeBtn = document.getElementById(pm.btnId);
            if (subIsCancelled) {
              // Grace period: показываем кнопку "Возобновить" вместо "Активен"
              if (activeBtn) {
                _setPlanBtnText(activeBtn, typeof t === 'function' ? (t('subReactivateBtn') || 'Возобновить') : 'Возобновить');
                activeBtn.disabled = false;
                activeBtn.style.opacity = '';
              }
              // Бейдж "Отменена" вместо "Текущий"
              if (activeBadge) {
                activeBadge.textContent = typeof t === 'function' ? (t('subCancelledBadge') || 'Отменена') : 'Отменена';
                activeBadge.style.color = 'rgba(239,68,68,0.8)';
              }
              // Не показываем ссылку "Отменить" — уже отменена
            } else {
              if (activeBtn) {
                // Эталон showcase-plans.html, состояние «подписчик»: тег «Твой пакет» у владеемой строки,
                // её кнопка — призрачная «Действует до {дата}», у старших пакетов — «Перейти на …» (аудит 23.09).
                var _ph = activeCard && activeCard.querySelector('.plan-head');
                if (_ph && !_ph.querySelector('.cur-tag')) {
                  var _tag = document.createElement('span'); _tag.className = 'cur-tag';
                  _tag.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span data-i18n="plCurTag">' + (typeof t === 'function' ? t('plCurTag') : 'Твой пакет') + '</span>';
                  var _nm = _ph.querySelector('.plan-name');
                  if (_nm && _nm.nextSibling) _ph.insertBefore(_tag, _nm.nextSibling); else _ph.appendChild(_tag);
                }
                activeBtn.classList.add('ghost-cur');
                _setPlanBtnText(activeBtn, renewDateStr
                  ? (typeof t === 'function' ? (t('plCurrentUntil', { date: renewDateStr }) || ('Действует до ' + renewDateStr)) : ('Действует до ' + renewDateStr))
                  : (typeof t === 'function' ? t('planStatusActive') : 'Активен'));
                activeBtn.disabled = true; activeBtn.style.opacity = '';
                var _tier = { planCardBasic: 1, planCardPlus: 2, planCardMaster: 3 }[pm.cardId] || 0;
                if (_tier < 2) _setPlanBtnText(document.getElementById('planBtnPlus'), typeof t === 'function' ? t('plUpgradeToPlus') : 'Перейти на «Глубину»');
                if (_tier < 3) _setPlanBtnText(document.getElementById('planBtnMaster'), typeof t === 'function' ? t('plUpgradeToMaster') : 'Перейти на «Лабораторию»');
              }
              // Отмена пакета — ТОЛЬКО в #profileSubManage (профиль). На карточку plansPage
              // НЕ инжектим: карточки переехали в #plansPage, ссылка налезала на эталон-CTA (фикс 27.06).
            }

            // Подписчик — пакеты свёрнуты по умолчанию (аккордеон), upsell не показываем.
            // КОРЕНЬ регресса (Алла 24.06 «птички нет»): раньше тут было plansChevron.textContent='▸'
            // — но plansChevron это <svg>, textContent СТИРАЛ <path> внутри → птичка исчезала.
            // Теперь сворачиваем через class .collapsed (птичка-svg цела, chevron поворот через .open).
            var plansWrap = document.getElementById('profilePlansWrap');
            if (plansWrap) { plansWrap.style.display = ''; plansWrap.classList.remove('collapsed'); }
            var sectionPlansAcc = document.getElementById('profileSectionPlans');
            if (sectionPlansAcc) sectionPlansAcc.classList.remove('open');
            var upsellBanner = document.getElementById('secondPurchaseUpsellBanner');
            if (upsellBanner) upsellBanner.style.display = 'none';

            // Пакеты Искр — показываем ТОЛЬКО в grace period (подписка отменена,
            // доступ сохранён до renew_at). VK §5.2: апсейл пакетов на активной
            // подписке — недобросовестная монетизация. Подписчику с лимитом
            // достаточно его лимита и реф-Искр.
            var iskryPacksEl = document.getElementById('iskryPacksSection');
            if (iskryPacksEl) iskryPacksEl.style.display = subIsCancelled ? '' : 'none';

            // Блок управления подпиской
            var subManage = document.getElementById('profileSubManage');
            if (subManage) {
              subManage.style.display = 'block';
              var subPlanEl = document.getElementById('profileSubPlan');
              if (subPlanEl) subPlanEl.textContent = planName;
              var subRenewEl = document.getElementById('profileSubRenew');
              if (subRenewEl && renewDateStr) {
                if (subIsCancelled) {
                  subRenewEl.textContent = typeof t === 'function' ? (t('subCancelledGrace', { date: renewDateStr }) || ('Отменена · доступ до ' + renewDateStr)) : 'Отменена · доступ до ' + renewDateStr;
                } else {
                  subRenewEl.textContent = typeof t === 'function' ? (t('profileSubExpires', { date: renewDateStr }) || ('Действует до ' + renewDateStr)) : 'Действует до ' + renewDateStr;
                }
                // 18.05.2026: тонкая amber-карточка над блоком при ≤3 дней до конца
                // (вариант одобрен Аллой). БЕЗ кнопок, единый стиль профиля.
                var _expSoonEl = document.getElementById('profileSubExpiringSoon');
                if (_expSoonEl) {
                  try {
                    var _renewDate = window._subscriptionRenewAt ? new Date(window._subscriptionRenewAt) : null;
                    var _show = false;
                    if (_renewDate && !subIsCancelled) {
                      var _now = new Date();
                      var _daysLeft = Math.ceil((_renewDate - _now) / (1000 * 60 * 60 * 24));
                      if (_daysLeft >= 0 && _daysLeft <= 3) {
                        var _msg = _daysLeft <= 1
                          ? (typeof t === 'function' ? (t('subExpiryBanner1d') || 'Пакет действует ещё 1 день') : 'Пакет действует ещё 1 день')
                          : (typeof t === 'function' ? (t('subExpiryBanner3d') || 'Пакет действует ещё {n} дн.').replace('{n}', _daysLeft) : 'Пакет действует ещё ' + _daysLeft + ' дн.');
                        _expSoonEl.textContent = _msg;
                        _show = true;
                      }
                    }
                    _expSoonEl.style.display = _show ? 'block' : 'none';
                  } catch(_) { _expSoonEl.style.display = 'none'; }
                }
              }
              var cancelBtn = document.getElementById('profileCancelSubBtn');
              if (cancelBtn && subIsCancelled) {
                cancelBtn.textContent = typeof t === 'function' ? (t('subReactivateBtn') || 'Возобновить пакет') : 'Возобновить пакет';
                cancelBtn.disabled = false;
                cancelBtn.style.opacity = '';
                cancelBtn.style.cursor = 'pointer';
                cancelBtn.onclick = function() { if (typeof showPlanConfirm === 'function') showPlanConfirm(planSku === 'soul_basic_sub' ? 'plan_basic' : planSku === 'soul_plus_sub' ? 'plan_plus' : 'plan_master', planName); };
              } else if (cancelBtn && !subIsCancelled) {
                cancelBtn.textContent = typeof t === 'function' ? t('profileCancelSubscription') || 'Деактивировать пакет' : 'Деактивировать пакет';
                cancelBtn.disabled = false;
                cancelBtn.style.opacity = '';
              }
            }
            // Показываем привязанную карту (если есть)
            (async function() {
              try {
                var cardResp = await fetch(apiBase + '/api/payments/tbank/cards', { headers: { 'X-Telegram-Init': initData } });
                var cardData = await cardResp.json();
                if (cardData.cards && cardData.cards.length > 0) {
                  var cardEl = document.getElementById('profileSubCard');
                  if (cardEl) {
                    cardEl.style.display = 'block';
                    var cardLabel = (typeof t === 'function' ? t('profileSubCardLabel') : 'Карта привязана');
                    cardEl.textContent = '💳 ' + (cardData.cards[0].card_pan || cardLabel);
                  }
                }
              } catch(e) {}
            })();

          } else {
            // Тариф Искатель (без подписки)
            var iskryPacksElFree = document.getElementById('iskryPacksSection');
            if (iskryPacksElFree) iskryPacksElFree.style.display = 'none';
            // Подписки нет — стираем снимок, иначе при следующем открытии
            // на секунду мелькнёт тариф, которого уже нет.
            try { localStorage.removeItem('yupsoul:planBadge'); } catch (_) {}
            if (planBadgeEl) { delete planBadgeEl.dataset.planKey; planBadgeEl.textContent = (typeof t === 'function' ? t('planFreeBadge') : '✦ YupSoul Искатель'); planBadgeEl.style.background = ''; planBadgeEl.style.borderColor = ''; planBadgeEl.style.color = ''; planBadgeEl.title = (typeof t === 'function' ? t('planCurrentBadge') : 'Текущий тариф'); }
            var credits = (refData && typeof refData.iskry_balance === 'number') ? refData.iskry_balance : getIskryBalance();
            // 16.05.2026: убрали ✨ эмодзи по команде Аллы (закон №42).
            // Прежние Batches 6.11 (10.05) + 10.121 (16.05) отменены —
            // эмодзи никогда не были одобрены, я добавил их ошибочно.
            // По эталону showcase-profile (Алла 19.06): баланс в виде «Осталось треков / N трек / + X Искр на балансе».
            // Для Искателя (без подписки) N = Искры ÷ 100 (1 песня = 100 Искр).
            var _tracksAvail = Math.floor((Number(credits) || 0) / 100);
            if (creditsEl) {
              creditsEl.textContent = _tracksAvail + ' ' + (typeof window._trackPlural === 'function' ? window._trackPlural(_tracksAvail) : 'трек');
              try { localStorage.setItem('yupsoul:lastCredits', String(credits)); } catch (_) {}
            }
            if (balanceLabelEl) balanceLabelEl.textContent = (typeof t === 'function' && t('profileTracksLeftLbl')) ? t('profileTracksLeftLbl') : 'Осталось треков';
            var _iskryWord = (typeof window.iskryPlural === 'function') ? window.iskryPlural(credits || 0) : 'Искр';
            var _onBalance = (typeof t === 'function' && t('profileOnBalanceSuffix')) ? t('profileOnBalanceSuffix') : 'на балансе';
            var _balHint = '+ ' + (Number(credits) || 0) + ' ' + _iskryWord + ' ' + _onBalance;
            if (balanceHintEl) balanceHintEl.textContent = _balHint;
            var hintTextEl = document.getElementById('profileBalanceHintText');
            if (hintTextEl) hintTextEl.textContent = _balHint;
            if (renewalDateEl) renewalDateEl.style.display = 'none';
            // Бесплатная карточка — текущая
            var cardFree2 = document.getElementById('planCardFree');
            if (cardFree2) cardFree2.classList.add('current');
            var freeBadge2 = document.getElementById('planFreeBadge');
            if (freeBadge2) { freeBadge2.style.visibility = 'visible'; freeBadge2.textContent = typeof t === 'function' ? t('planCurrentBadge') || 'Текущий' : 'Текущий'; }
          }
        } catch (e) {
          console.warn('[Profile] silent retry:', e);
          if (nameEl) nameEl.textContent = displayName;
          // VK Testers 7272193: при ошибке тоже не показываем «—». Если есть кэш —
          // отображаем (вернёт значение через retry), иначе «…» (loading).
          if (creditsEl) {
            try {
              var cached = localStorage.getItem('yupsoul:lastCredits');
              creditsEl.textContent = (cached && cached.length > 0) ? cached : '…';
            } catch (_) { creditsEl.textContent = '…'; }
          }
          // Закон №37: offline → overlay; online → тихий ретрай с MAX counter (4 попытки).
          if (!window._ensureOnline()) return;
          window._profileRetryCount = (window._profileRetryCount || 0) + 1;
          if (window._profileRetryCount > 4) { console.warn('[Profile] retry exhausted'); return; }
          var pBackoff2 = Math.min(20000, 2500 * Math.pow(1.6, window._profileRetryCount));
          setTimeout(function(){ if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){}); }, pBackoff2);
        }
        // Загружаем способ оплаты (привязанная карта)
        if (typeof loadPaymentMethod === 'function') loadPaymentMethod();
        // Загружаем статус привязанных аккаунтов
        if (typeof window.loadLinkedAccounts === 'function') window.loadLinkedAccounts();
        window._userHasSubscription = !!hasSubscriptionActive;
        if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
        if (typeof checkAndShowSecondPurchaseBanner === 'function') checkAndShowSecondPurchaseBanner();
        if (typeof window.loadRubPrices === 'function') window.loadRubPrices();
        // Тумблер уведомлений (§2.7.3): подтянуть актуальное состояние при каждом открытии профиля.
        if (typeof window._syncNotifToggle === 'function') window._syncNotifToggle();
      }

      // Фиксированные рублёвые цены (ЗАКОН: без динамического курса, совпадают с T-Bank)
      (function initFixedRubPrices() {
        var FIXED_PRICES = {
          planBasicPriceEl:  { usd: 9.90,  rub: 810  },
          planPlusPriceEl:   { usd: 24.90, rub: 2030 },
          masterPriceEl:     { usd: 39.90, rub: 3250 },
          scPlanBasicPrice:  { usd: 9.90,  rub: 810  },
          scPlanPlusPrice:   { usd: 24.90, rub: 2030 },
          scPlanMasterPrice: { usd: 39.90, rub: 3250 }
        };
        // VK mobile: продажа только за ГОЛОСА (§5.4) — ₽/$ на карточках запрещены
        var VOTES_BY_EL = {
          planBasicPriceEl: '99',  planPlusPriceEl: '249',  masterPriceEl: '399',
          scPlanBasicPrice: '99',  scPlanPlusPrice: '249',  scPlanMasterPrice: '399'
        };
        function applyFixedPrices() {
          var pm = (typeof t === 'function') ? t('perMonth') : '';
          var lang = window._currentLang || 'ru';
          // КАНОН v5 (отказ 22.07): голоса на VK удалены (§5.2.5). Пакеты-доступы на VK
          // продаются РАЗОВО за ₽ (карта T-Bank, §5.4.1 — только vk.ru/m.vk.ru; на stub
          // витрина скрыта CSS). Цена без «/мес» — это пакет, не подписка.
          var vkMobile = (window._isVkMiniApp || window._appEnv === 'vk');
          Object.keys(FIXED_PRICES).forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            // Натив: цену пакета называет Apple на своём экране покупки. Наша
            // цифра рядом с кнопкой читалась бы как второй способ оплаты
            // (правило 3.1.1) и разошлась бы с прайсом стора по территориям.
            if (window._isNativeApp) { el.textContent = ''; return; }
            if (vkMobile) {
              var pVk = FIXED_PRICES[id];
              el.textContent = pVk.rub.toLocaleString('ru-RU') + ' ₽';
              return;
            }
            var p = FIXED_PRICES[id];
            var rubStr = p.rub.toLocaleString('ru-RU') + '\u00a0\u20bd';
            if (lang === 'ru') {
              // ru: только рубли, без USD (закон: фикс. рублёвые цены приоритетны)
              el.innerHTML = rubStr + pm;
            } else {
              // VK Testers 7271823 (FR 15.05.2026): «Несоответствие валют».
              // Решение: для EN/DE/FR — только USD (без второй валюты).
              el.innerHTML = '$' + p.usd.toFixed(2) + pm;
            }
          });
          // Разовые тарифы профиля — КАНОН v4 (11.07, §5.2): на ВСЁМ VK контент оплачивается
          // ИСКРАМИ — витрина показывает «100 Искр» (витрина == чекаут, чекаут = Искры).
          // Прямых цен в голосах за контент больше не существует.
          // На нативе — та же логика: цена в ₽ там не имеет смысла (оплата идёт
          // встроенной покупкой по прайсу Apple), а ₽ рядом с кнопкой читается
          // как альтернативный способ оплаты — правило 3.1.1.
          if (vkMobile || window._isNativeApp) {
            var _ptiIu = (typeof window.iskryPlural === 'function') ? window.iskryPlural(100) : ((typeof t === 'function' ? t('iskryUnit') : '') || 'Искр');
            ['ptiSinglePrice', 'ptiCouplePrice', 'ptiTransitPrice'].forEach(function(_id) {
              var _e = document.getElementById(_id); if (_e) _e.textContent = '100 ' + _ptiIu;
            });
          }
          try { if (typeof window._vkApplyPackageWording === 'function') window._vkApplyPackageWording(); } catch(_) {}
        }
        // VK mobile: фичи тарифных карточек = «✦ N персональных песен» (пакет за
        // голоса), а не «✦ N треков/мес» (подписочная формулировка). §5.4.1 + Алла 12.06.
        window._vkApplyPackageWording = function _vkApplyPackageWording() {
          try {
            if (!(window._isVkMiniApp || window._appEnv === 'vk')) return;
            var _set = function(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; };
            _set('planBasicF1',  '✦ ' + t('vkPackSongs', { n: 5 }));
            _set('planPlusF1',   '✦ ' + t('vkPackSongs', { n: 15 }));
            _set('planMasterF1', '✦ ' + t('vkPackSongs', { n: 30 }));
          } catch (_) {}
        };
        window.loadRubPrices = applyFixedPrices;
        setTimeout(applyFixedPrices, 100);
      })();

      (function bindProfileLoadRetry() {
        var btn = document.getElementById('profileLoadRetryBtn');
        if (btn) btn.addEventListener('click', function() { if (typeof loadProfilePage === 'function') loadProfilePage(); });
      })();

      // ── Inline-редактирование профиля ──
      function profileAccordionToggle() {
        var wrap = document.getElementById('profileDataEditWrap');
        var chevron = document.getElementById('profileDataChevron');
        if (!wrap) return;
        var isCollapsed = wrap.style.maxHeight === '0px' || wrap.style.maxHeight === '0';
        if (isCollapsed) {
          // Раскрываем — заполняем поля из кешированного профиля
          var p = window._cachedProfile || {};
          var nameInput = document.getElementById('profileEditName');
          var dateInput = document.getElementById('profileEditDate');
          var cityInput = document.getElementById('profileEditCity');
          if (nameInput) { nameInput.value = p.name || ''; nameInput.placeholder = typeof t === 'function' ? t('profileEditNamePh') : 'Ваше имя'; }
          // Batch 10.22 (re-open 7256512): если backend вернул ISO datetime (`1991-07-21T00:00:00.000Z`),
          // input type=date silently отвергает строку и ставит value=''. Тестер видит «пустую» дату.
          // Корень: slice до YYYY-MM-DD. Аналогично для birthtime — HH:MM формат.
          if (dateInput) {
            dateInput.value = (p.birthdate || '').toString().slice(0, 10);
            // Форматированный дисплей «14 марта 1996» из загруженной ISO-даты (эталон).
            try {
              if (window._profileSyncDateDisplay) window._profileSyncDateDisplay();
              if (window.updateDateSelectsFromInput) window.updateDateSelectsFromInput('profileEditDate');
              if (window._syncCustomDropdowns) window._syncCustomDropdowns();
            } catch(_) {}
          }
          if (cityInput) { cityInput.value = p.birthplace || p.birth_city || ''; cityInput.placeholder = typeof t === 'function' ? t('profileEditCityPh') : 'Город рождения'; }
          var timeInput = document.getElementById('profileEditTime');
          var timeUnknown = document.getElementById('profileEditTimeUnknown');
          if (timeInput && timeUnknown) {
            if (p.birthtime_unknown || !p.birthtime) {
              timeUnknown.checked = true; timeInput.value = ''; timeInput.disabled = true;
            } else {
              // 10.22: slice HH:MM (backend может вернуть HH:MM:SS)
              timeUnknown.checked = false; timeInput.value = (p.birthtime || '').toString().slice(0, 5); timeInput.disabled = false;
            }
          }
          var genderWrap = document.getElementById('profileEditGender');
          if (genderWrap) {
            // VK Testers 7256222 ПЕРЕОТКРЫТ-6 (Кирилл Windows 18.05, 5-я попытка):
            // Прошлые подходы (class .is-active + delegated click) не работали.
            // Radical fix: восстановление initial state ТОЖЕ через _setProfileGender
            // — inline style modification, no CSS dependency. На init если у юзера
            // есть gender в БД — устанавливаем визуальное состояние ТАК ЖЕ как при клике.
            var _pgender = p.gender || '';
            var _gbtns = genderWrap.querySelectorAll('button');
            for (var _gi = 0; _gi < _gbtns.length; _gi++) {
              var _gbtn = _gbtns[_gi];
              if (_gbtn.getAttribute('data-gender') === _pgender && _pgender && typeof window._setProfileGender === 'function') {
                window._setProfileGender(_gbtn, _pgender);
                break;
              }
            }
          }
          var saveBtn = document.getElementById('profileSaveBtn');
          var cancelBtn2 = document.getElementById('profileCancelBtn');
          if (saveBtn) saveBtn.textContent = typeof t === 'function' ? t('profileEditSaveBtn') : 'Сохранить';
          if (cancelBtn2) cancelBtn2.textContent = typeof t === 'function' ? t('profileEditCancelBtn') : 'Отмена';
          var errEl = document.getElementById('profileEditError');
          var okEl = document.getElementById('profileEditSuccess');
          if (errEl) errEl.style.display = 'none';
          if (okEl) okEl.style.display = 'none';
          // Batch 7.12: snapshot текущих значений для diff при Save (ID 7257284)
          // VK Testers 7257284 ПЕРЕОТКРЫТ-2 (Тамара MacOS 16.05): snap содержал
          // только name/birthdate/birthplace, но `same` на line 22120 сравнивает
          // также birthtime/birthtime_unknown/gender → snap.birthtime = undefined
          // → never matches → same=false ВСЕГДА → toast «Сохранено» без изменений.
          // Добавляем недостающие поля в snapshot.
          try {
            var _ni = document.getElementById('profileEditName');
            var _di = document.getElementById('profileEditDate');
            var _ci = document.getElementById('profileEditCity');
            var _ti = document.getElementById('profileEditTime');
            var _tu = document.getElementById('profileEditTimeUnknown');
            var _gw = document.getElementById('profileEditGender');
            var _snapGender = '';
            if (_gw) {
              // VK Testers 7256222 ПЕРЕОТКРЫТ-4: detect active по .is-active class
              // (новый подход), а не по inline style[rgba(var(--primary-rgb)] (старый).
              var _aG = _gw.querySelector('button.is-active, button.active');
              if (_aG) _snapGender = _aG.getAttribute('data-gender') || '';
            }
            window._profileEditInitialSnap = {
              name: (_ni && _ni.value || '').trim(),
              birthdate: (_di && _di.value || ''),
              birthplace: (_ci && _ci.value || '').trim(),
              birthtime: (_ti && _ti.value) || '',
              birthtime_unknown: !!(_tu && _tu.checked),
              gender: _snapGender
            };
          } catch(_) {}
          wrap.style.maxHeight = '800px';
          wrap.style.opacity = '1';
          wrap.style.pointerEvents = 'auto';
          if (chevron) chevron.classList.add('open');
        } else {
          // Сворачиваем
          wrap.style.maxHeight = '0';
          wrap.style.opacity = '0';
          wrap.style.pointerEvents = 'none';
          if (chevron) chevron.classList.remove('open');
        }
      }
      // Обратная совместимость
      function profileEditToggle(show) {
        if (show) {
          var wrap = document.getElementById('profileDataEditWrap');
          if (wrap && (wrap.style.maxHeight === '0px' || wrap.style.maxHeight === '0')) {
            profileAccordionToggle();
          }
        } else {
          var wrap = document.getElementById('profileDataEditWrap');
          if (wrap && wrap.style.maxHeight !== '0px' && wrap.style.maxHeight !== '0') {
            profileAccordionToggle();
          }
        }
      }

      async function profileEditSave() {
        var nameInput = document.getElementById('profileEditName');
        var dateInput = document.getElementById('profileEditDate');
        var cityInput = document.getElementById('profileEditCity');
        var saveBtn = document.getElementById('profileSaveBtn');
        var errEl = document.getElementById('profileEditError');
        var okEl = document.getElementById('profileEditSuccess');
        if (errEl) errEl.style.display = 'none';
        if (okEl) okEl.style.display = 'none';
        var newName = (nameInput ? nameInput.value.trim() : '');
        var newDate = (dateInput ? dateInput.value : '');
        var newCity = (cityInput ? cityInput.value.trim() : '');
        // Имя необязательно (закон Аллы 05.07 «имя в анкете по желанию»): не блокируем сохранение без имени.
        // Дата рождения — единственный смысловой ключ для Оракула/расчётов; имя лишь персонализирует.
        // Batch 7.12 (ID 7257284 Глазунова MacOS Средний): «"Данные сохранены"
        // показывается при ОТСУТСТВИИ изменений». Сравниваем с кешем — если
        // ничего не поменялось, не дёргаем API, показываем нейтральный toast.
        try {
          var snap = window._profileEditInitialSnap || (window._cachedProfile || {});
          // Batch 9.27 (отчёт 7264249, Windows): juser снимал галочку «Не знаю»
          // у времени рождения → save → toast «Изменений нет». Корень: same
          // сравнивал только name/birthdate/birthplace, игнорируя birthtime
          // и birthtime_unknown — фактическое изменение поля времени не
          // детектировалось. Добавляем эти поля + gender в сравнение.
          var timeInputEl = document.getElementById('profileEditTime');
          var timeUnknownEl = document.getElementById('profileEditTimeUnknown');
          var curTime = (timeInputEl && timeInputEl.value) || '';
          var curUnknown = !!(timeUnknownEl && timeUnknownEl.checked);
          var genderWrapEl = document.getElementById('profileEditGender');
          var curGender = '';
          if (genderWrapEl) {
            // VK Testers 7256222 ПЕРЕОТКРЫТ-4: detect по .is-active class.
            var activeG = genderWrapEl.querySelector('button.is-active, button.active');
            if (activeG) curGender = activeG.getAttribute('data-gender') || '';
          }
          var same = (snap.name || '') === newName
            && (snap.birthdate || '') === newDate
            && (snap.birthplace || '') === newCity
            && (snap.birthtime || '') === curTime
            && !!snap.birthtime_unknown === curUnknown
            && (snap.gender || '') === curGender;
          if (same) {
            if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastNoChanges') || 'Изменений нет') : 'Изменений нет');
            return;
          }
        } catch(_) {}
        // Batch 5.28 — VK Testers ID 7258729: валидация года рождения в профиле.
        if (newDate) {
          var _pdParts = String(newDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (_pdParts) {
            var _py = parseInt(_pdParts[1], 10);
            var _curY = new Date().getFullYear();
            if (_py < 1900 || _py > _curY) {
              if (errEl) { errEl.textContent = (typeof t === 'function' ? (t('alertBirthdateInvalid') || 'Год рождения должен быть от 1900 до текущего') : 'Год рождения должен быть от 1900 до текущего'); errEl.style.display = 'block'; }
              return;
            }
          }
        }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) {
          if (errEl) { errEl.textContent = typeof t === 'function' ? t('formNoAuth') : 'Нет авторизации'; errEl.style.display = 'block'; }
          return;
        }
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = typeof t === 'function' ? t('formSaving') : 'Сохранение…'; }
        try {
          // VK Testers ID 7256838 (Maria Lykosova, MacOS): юзер удаляет дату/город/
          // время → save → на бэкенде поля НЕ обновлялись (фронт пропускал пустые
          // значения через `if (newDate) body.birthdate = newDate`). Теперь всегда
          // передаём — пусто → backend трактует как «удалить значение».
          // Имя по желанию: пустое → шлём null (backend пропускает name-валидацию errNameRequired, не трогает поле).
          var body = { name: newName || null, birthdate: newDate || '', birthplace: newCity || '' };
          // Координаты города из подсказок (только если город заполнен)
          if (newCity && cityInput && cityInput.getAttribute('data-lat') && cityInput.getAttribute('data-lon')) {
            body.birthplace_lat = parseFloat(cityInput.getAttribute('data-lat'));
            body.birthplace_lon = parseFloat(cityInput.getAttribute('data-lon'));
          }
          // Время рождения
          var timeInput = document.getElementById('profileEditTime');
          var timeUnknown = document.getElementById('profileEditTimeUnknown');
          if (timeUnknown && timeUnknown.checked) {
            body.birthtime_unknown = true;
            body.birthtime = '';
          } else {
            body.birthtime = (timeInput && timeInput.value) || '';
            body.birthtime_unknown = false;
          }
          // Пол
          var genderWrap = document.getElementById('profileEditGender');
          if (genderWrap) {
            // VK Testers 7256222 ПЕРЕОТКРЫТ-4: detect по .is-active class.
            var activeGenderBtn = genderWrap.querySelector('button.is-active, button.active');
            if (activeGenderBtn) body.gender = activeGenderBtn.getAttribute('data-gender');
          }
          var resp = await fetch(apiBase + '/api/user/profile', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
            body: JSON.stringify(body)
          });
          var json = await resp.json().catch(function() { return {}; });
          if (!resp.ok) {
            // Batch 10.11 (отчёты 7272665, 7272666 Ольга Михайловна): локализация
            // сообщений ошибки. Backend возвращает error_code (errInvalidName /
            // errInvalidDateFormat и т.д.) — на фронте используем i18n
            // соответствующий локали юзера. Fallback на raw error если ключа нет.
            var localizedErr = null;
            if (json.error_code && typeof t === 'function') {
              localizedErr = t(json.error_code, json.error_params || {});
              if (localizedErr === json.error_code) localizedErr = null; // i18n key not found
            }
            throw new Error(localizedErr || json.error || 'Ошибка сервера');
          }
          // Обновляем кеш и UI
          // VK Testers 7257411 ПЕРЕОТКРЫТ-2 (Тамара Android 14+12 16.05):
          // имя 🦁 (emoji) не сохранялось после reload. Корень: оптимистичный
          // update кэша делался только при наличии json.profile. Если backend
          // не вернул profile в ответе — кэш не обновлялся → loadProfilePage
          // запрашивал backend → у backend имя могло быть старое (race условие
          // на Android WebView). Фикс: IMMEDIATELY обновляем кэш с новыми
          // значениями form'ы, не дожидаясь backend response.
          window._cachedProfile = window._cachedProfile || {};
          window._cachedProfile.name = newName;
          if (newDate) window._cachedProfile.birthdate = newDate;
          if (newCity) window._cachedProfile.birthplace = newCity;
          // VK Testers 7257411 ПЕРЕОТКРЫТ-3 (Тамара Android 17.05): на Android
          // WebView fetch может аборитроваться между optimistic update и
          // response. После navigate _cachedProfile теряется → имя сбрасывается.
          // Двойная защита: localStorage backup + window cache.
          try {
            localStorage.setItem('yup_cached_profile_name', String(newName || ''));
            if (newDate) localStorage.setItem('yup_cached_profile_birthdate', String(newDate));
            if (newCity) localStorage.setItem('yup_cached_profile_birthplace', String(newCity));
          } catch(_) {}
          if (json.profile) {
            // Если backend вернул profile — сохраняем backend-данные, но
            // защищаем name: если backend почему-то вернул пустое имя,
            // оставляем то что юзер ввёл (предотвращаем потерю).
            var _bp = json.profile;
            if (!_bp.name || String(_bp.name).trim() === '') _bp.name = newName;
            window._cachedProfile = _bp;
          }
          if (okEl) { okEl.textContent = typeof t === 'function' ? t('formDataSaved') : 'Данные сохранены ✓'; okEl.style.display = 'block'; }
          setTimeout(function() { profileEditToggle(false); }, 800);
          // Обновить отображение профиля
          if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){});
        } catch (e) {
          if (errEl) { errEl.textContent = e.message || (typeof t === 'function' ? t('formSaveError') : 'Ошибка сохранения'); errEl.style.display = 'block'; }
        } finally {
          if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = typeof t === 'function' ? t('btnSave') : 'Сохранить'; }
        }
      }
      // Экспортируем на window — inline onclick="profileEditToggle(true)" требует глобальный scope
      window.profileAccordionToggle = profileAccordionToggle;
      window.profileEditToggle = profileEditToggle;
      window.profileEditSave = profileEditSave;

      // VK Testers 7256222 ПЕРЕОТКРЫТ-6 (Кирилл Windows 18.05, 5-я попытка фикса):
      // Кнопки выбора пола в Профиле не показывают visual selection. CSS-классы
      // `.is-active` / `.active` уже добавляются (5 итераций фиксов), но Кирилл
      // продолжает видеть «не выделяется». Возможно CSS rules перебиваются
      // browser default ИЛИ Yandex Browser / Windows VK cache. Radical fix:
      // INLINE style modification напрямую — НИКАКОЙ CSS не сможет перебить
      // inline style без !important от CSS, а inline `style="..."` имеет
      // higher specificity чем любая class rule БЕЗ !important.
      // Пол — сегмент со слайдером (.gseg). Класс-based визуал (CSS: button.on + .slider по data-sel).
      // Без inline-стилей. Save читает button.is-active; load зовёт _setProfileGender(btn, gender).
      window._setProfileGender = function(btn, gender) {
        var container = document.getElementById('profileEditGender');
        if (!container) return;
        container.querySelectorAll('button').forEach(function(b) {
          b.classList.remove('is-active'); b.classList.remove('active'); b.classList.remove('on');
        });
        if (btn) { btn.classList.add('is-active'); btn.classList.add('active'); btn.classList.add('on'); }
        var order = { female: 0, male: 1 };
        container.setAttribute('data-sel', order[gender] != null ? String(order[gender]) : '');
        container.setAttribute('data-selected-gender', gender || '');
      };

      // ── Дата рождения в профиле: форматированный дисплей «14 марта 1996» (эталон) ──
      // Видимый readonly #profileEditDateDisplay показывает локализованную дату; скрытый нативный
      // #profileEditDate — источник YYYY-MM-DD для save/load. Клик по дисплею → нативный пикер.
      window._profileOpenDatePicker = function() {
        var d = document.getElementById('profileEditDate');
        if (!d) return;
        try { d.showPicker(); } catch(_) { try { d.focus(); d.click(); } catch(__) {} }
      };
      window._profileSyncDateDisplay = function() {
        var d = document.getElementById('profileEditDate'), disp = document.getElementById('profileEditDateDisplay');
        if (!d || !disp) return;
        var v = d.value;
        if (!v) { disp.value = ''; return; }
        var loc = { ru: 'ru-RU', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }[window.currentLang || 'ru'] || 'ru-RU';
        var dt = new Date(v + 'T12:00:00');
        // Эталон: «14 марта 1996» БЕЗ суффикса « г.» (ru-RU добавляет его — срезаем).
        disp.value = isNaN(dt.getTime()) ? v : dt.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.?\s*$/i, '');
      };

      // ── Автодополнение города в профиле ──────────────────────────────────
      (function() {
        var pInput = document.getElementById('profileEditCity');
        var pSugg  = document.getElementById('profileCitySuggestions');
        var pWrap  = document.getElementById('profileCityWrap');
        var pCheck = document.getElementById('profileCityCheck');
        if (!pInput) return;
        var pDebounce = null;
        var pLastQ = '';
        var _pPlacesCache = {};
        var _pFetchAbort = null;
        var _pFetchRetries = 0;
        function pHide() {
          if (pSugg) { pSugg.innerHTML = ''; pSugg.setAttribute('aria-hidden','true'); pSugg.style.display = 'none'; }
        }
        function pSelect(displayName, lat, lon) {
          pInput.value = (displayName || '').trim();
          pInput.setAttribute('data-place-selected','1');
          if (lat != null) pInput.setAttribute('data-lat', String(lat));
          if (lon != null) pInput.setAttribute('data-lon', String(lon));
          if (pWrap)  pWrap.classList.add('has-place');
          if (pCheck) pCheck.setAttribute('aria-hidden','false');
          pHide();
        }
        function pClear() {
          pInput.removeAttribute('data-place-selected');
          pInput.removeAttribute('data-lat');
          pInput.removeAttribute('data-lon');
          if (pWrap)  pWrap.classList.remove('has-place');
          if (pCheck) pCheck.setAttribute('aria-hidden','true');
        }
        function pFetch(q) {
          if (!q || q.length < 3) { if (!window._cityMinCharsHint('profileCitySuggestions', q)) pHide(); return; }
          var ck = q.toLowerCase();
          if (_pPlacesCache[ck]) { pRender(_pPlacesCache[ck]); return; }
          if (_pFetchAbort) { try { _pFetchAbort.abort(); } catch(e){} }
          _pFetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var url = typeof getPlacesSearchUrl === 'function' ? getPlacesSearchUrl(q) : ('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=8&addressdetails=1');
          var hdrs = { 'Accept': 'application/json' };
          if (url.indexOf('nominatim') !== -1) { hdrs['Accept-Language'] = window.currentLang || 'ru'; hdrs['User-Agent'] = 'YupSoulMiniApp/1.0'; }
          var opts = { headers: hdrs };
          if (_pFetchAbort) opts.signal = _pFetchAbort.signal;
          function pRender(list) {
            if (pLastQ !== q || !pSugg) return;
            pSugg.innerHTML = '';
            (list || []).forEach(function(item) {
              var li = document.createElement('li');
              var main = item.display_name || (item.address && (item.address.city || item.address.town || item.address.village || item.address.state || item.address.country)) || '';
              var country = item.address && item.address.country ? item.address.country : '';
              li.textContent = main;
              if (country) { var sp = document.createElement('div'); sp.className = 'place-type'; sp.textContent = country + (item.address && item.address.country_code ? ' (' + item.address.country_code.toUpperCase() + ')' : ''); li.appendChild(sp); }
              function onSel() {
                var placeId = item.place_id; var yandexUri = item.yandex_uri;
                if ((placeId || yandexUri) && (item.lat == null)) {
                  if (typeof fetchPlaceDetails === 'function') {
                    var params = placeId ? { place_id: placeId } : { yandex_uri: yandexUri };
                    fetchPlaceDetails(params, function(n, la, lo) { pSelect(n, la, lo); }, pHide);
                  } else pHide();
                } else pSelect(item.display_name || main, item.lat, item.lon);
              }
              li.addEventListener('mousedown', function(e) { e.preventDefault(); onSel(); });
              li.addEventListener('click', onSel);
              pSugg.appendChild(li);
            });
            pSugg.style.display = (list && list.length) ? 'block' : 'none';
            pSugg.setAttribute('aria-hidden', (list && list.length) ? 'false' : 'true');
          }
          fetch(url, opts)
            .then(function(r) {
              if (r.status === 429 || r.status === 502 || r.status === 503) {
                if (_pFetchRetries < 2) { _pFetchRetries++; setTimeout(function(){ pFetch(q); }, 1500 * _pFetchRetries); }
                else { _pFetchRetries = 0; pHide(); }
                return null;
              }
              _pFetchRetries = 0;
              return r.json();
            })
            .then(function(list) {
              if (!list) return;
              var arr = Array.isArray(list) ? list : [];
              if (arr.length === 0 && url.indexOf('nominatim') === -1) {
                placesNominatimFallback(q, function(narr){ _pPlacesCache[ck] = narr; pRender(narr); });
                return;
              }
              _pPlacesCache[ck] = arr;
              pRender(arr);
            })
            .catch(function(err) {
              if (err && err.name === 'AbortError') return;
              if (url.indexOf('nominatim') === -1 && typeof nominatimUrlFor === 'function') {
                fetch(nominatimUrlFor(q), { headers: { 'Accept': 'application/json', 'Accept-Language': (window.currentLang || 'ru'), 'User-Agent': 'YupSoulMiniApp/1.0' } })
                  .then(function(r) { return r.ok ? r.json() : []; })
                  .then(function(list) { var arr = Array.isArray(list) ? list : []; _pPlacesCache[ck] = arr; pRender(arr); })
                  .catch(function() { pHide(); });
              } else pHide();
            });
        }
        pInput.addEventListener('input', function() {
          var v = pInput.value.trim();
          pClear();
          if (v) { pLastQ = v; clearTimeout(pDebounce); pDebounce = setTimeout(function(){ pFetch(v); }, 400); }
          else pHide();
        });
        pInput.addEventListener('focus', function() {
          var v = pInput.value.trim();
          if (!pInput.getAttribute('data-place-selected') && v && v.length >= 3) { pLastQ = v; pFetch(v); }
        });
        pInput.addEventListener('blur', function() { setTimeout(pHide, 350); });
      })();

      // === Промокод в профиле ===
      async function applyProfilePromo() {
        var input = document.getElementById('profilePromoInput');
        var btn = document.getElementById('profilePromoBtn');
        var resultEl = document.getElementById('profilePromoResult');
        if (!input || !resultEl) return;
        var code = (input.value || '').trim().toUpperCase();
        if (!code) {
          resultEl.style.display = '';
          resultEl.style.background = 'rgba(255,100,100,0.1)';
          resultEl.style.color = '#ff6b6b';
          resultEl.textContent = typeof t === 'function' ? t('formEnterPromo') : 'Введите промокод';
          return;
        }
        btn.disabled = true;
        // Batch 8.24 (7263003 Windows Низкий): "Не отображается ... в кнопке Применить".
        // Корень: textContent перезаписывается мгновенно при быстром fetch. Min display 350ms.
        btn.textContent = '...';
        var _btnLoaderStart = Date.now();
        resultEl.style.display = 'none';
        var L = function(k, fb){ return (typeof t === 'function' ? t(k) : '') || fb; };
        try {
          var initData = typeof getInitData === 'function' ? getInitData() : '';
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var headers = { 'Content-Type': 'application/json' };
          if (initData) headers['X-Telegram-Init'] = initData;
          if (typeof getAuthHeaders === 'function') Object.assign(headers, getAuthHeaders());
          // Подарочный промокод зачисляет Искры на баланс (free_generation = 100 × генерации).
          // Скидочные возвращаются deferred:true (применяются на чекауте). Решение Аллы 25.06.
          var resp = await fetch(apiBase + '/api/promos/redeem-gift', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ code: code })
          });
          // Min loader display
          var _elapsed = Date.now() - _btnLoaderStart;
          if (_elapsed < 350) await new Promise(function(r){ setTimeout(r, 350 - _elapsed); });
          var data = await resp.json();
          resultEl.style.display = '';
          if (data.valid && data.unlocked_song) {
            // Подарочный промо ОТКРЫЛ уже готовую запертую вкус-песню (решение Аллы 06.07) → показываем и ведём к ней.
            resultEl.style.background = 'rgba(76,175,80,0.1)';
            resultEl.style.color = '#4caf50';
            resultEl.textContent = (typeof t === 'function' ? (t('giftSongUnlocked') || 'Твоя песня открыта 🤍') : 'Твоя песня открыта 🤍');
            input.value = '';
            if (typeof loadProfilePage === 'function') { try { loadProfilePage(); } catch(_){} }
            if (typeof goToPage === 'function') { setTimeout(function(){ try { goToPage('myTracksPage'); } catch(_){} }, 1000); }
          } else if (data.valid && data.granted_songs > 0) {
            // free_song промо — подарена ПОЛНАЯ песня (entitlement, минует вкус). Создай — и она сгенерится целиком.
            resultEl.style.background = 'rgba(76,175,80,0.1)';
            resultEl.style.color = '#4caf50';
            resultEl.textContent = (typeof t === 'function' ? (t('giftSongCredited') || 'Песня в подарок 🤍 Создай свою') : 'Песня в подарок 🤍 Создай свою');
            input.value = '';
            if (typeof loadProfilePage === 'function') { try { loadProfilePage(); } catch(_){} }
          } else if (data.valid && data.credited > 0) {
            // Подарочный промокод — Искры реально зачислены на баланс
            resultEl.style.background = 'rgba(76,175,80,0.1)';
            resultEl.style.color = '#4caf50';
            resultEl.textContent = (typeof t === 'function' ? t('giftIskryCredited', { n: data.credited }) : '+' + data.credited + ' Искр зачислено');
            input.value = '';
            if (typeof window._refreshIskryBalance === 'function') { try { window._refreshIskryBalance(); } catch(_){} }
            if (typeof loadProfilePage === 'function') { try { loadProfilePage(); } catch(_){} }
          } else if (data.valid && data.deferred) {
            // Скидочный промокод — применится при оплате (сохраняем код)
            var promo = data.promo || {};
            var msg = '✅ ' + L('promoActivated', 'Промокод активирован!');
            if (promo.type === 'discount_percent') msg += '\n' + L('promoDiscountWord', 'Скидка') + ' ' + (promo.value || 0) + '%';
            else if (promo.type === 'discount_amount') msg += '\n' + L('promoDiscountWord', 'Скидка') + ' ' + (promo.value || 0) + ' ₽';
            resultEl.style.background = 'rgba(76,175,80,0.1)';
            resultEl.style.color = '#4caf50';
            resultEl.textContent = msg;
            window.__profilePromoCode = code;
            input.value = '';
          } else {
            var ec = data.error_code || 'promoNotFound';
            var fb = { promoEmpty: 'Введите промокод', promoNotFound: 'Промокод не найден', promoExpired: 'Промокод истёк', promoUsedUp: 'Промокод больше не действует', promoAlreadyActivated: 'Промокод уже активирован', errAuth: 'Войди, чтобы активировать' };
            var key = (ec === 'promoEmpty') ? 'formEnterPromo' : ec;
            resultEl.style.background = 'rgba(255,100,100,0.1)';
            resultEl.style.color = '#ff6b6b';
            resultEl.textContent = L(key, fb[ec] || 'Промокод не найден');
          }
        } catch (e) {
          // №37: catch = сеть; error-текст только при offline (системный overlay)
          resultEl.style.display = 'none';
          if (typeof window._ensureOnline === 'function') window._ensureOnline();
        }
        btn.disabled = false;
        btn.textContent = typeof t === 'function' ? t('btnApply') : 'Применить';
      }
      window.applyProfilePromo = applyProfilePromo;

      // Аккордеон: открыть/закрыть поля формы
      // VK Testers ID 7262408 (Lykosova MacOS): стрелка вверх при свёрнутом блоке —
      // визуальное противоречие. Фикс: open-class только при РАСКРЫТОМ блоке.
      // Совмещено с поведением toggleSecondPersonAccordion (стрелка вниз = свёрнут).
      function toggleProfileAccordion() {
        var wrap = document.getElementById('formFieldsWrap');
        var chevron = document.getElementById('pfaChevron');
        if (!wrap) return;
        var isCollapsed = wrap.classList.contains('pfw-collapsed');
        if (isCollapsed) {
          wrap.classList.remove('pfw-collapsed');
          // VK Testers 7262959 ПЕРЕОТКРЫТ (Онуфриенко Android VKUI WebView): тестер тапал
          // на pfa-header, шеврон менялся, но контент НЕ ПОКАЗЫВАЛСЯ. Root cause: CSS
          // transition max-height на Android WebView мог не отрабатывать корректно.
          // Защита: explicit style + scrollIntoView чтобы юзер видел появившиеся поля.
          wrap.style.maxHeight = '';
          wrap.style.opacity = '';
          wrap.style.pointerEvents = '';
          if (chevron) chevron.classList.add('open');
          // ЗАКОН: при раскрытии — подтянуть пустые поля из профиля
          var sp = window._savedFormProfile || getCachedProfile();
          if (sp) {
            var bt = document.getElementById('birthtime');
            var g = document.getElementById('gender');
            if (bt && !bt.value && !bt.disabled && sp.birthtime) bt.value = normalizeTimeValue(sp.birthtime);
            if (g && !g.value && sp.gender) g.value = sp.gender;
          }
          // Прокрутить до имени чтобы юзер увидел раскрытые поля
          setTimeout(function() {
            try {
              var firstField = document.getElementById('name');
              if (firstField) firstField.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } catch(_) {}
          }, 100);
        } else {
          wrap.classList.add('pfw-collapsed');
          if (chevron) chevron.classList.remove('open');
        }
      }
      window.toggleProfileAccordion = toggleProfileAccordion;

      // ── Аккордеон второго человека ──────────────────────────────────────────
      var p2AccOpen = false;
      function toggleSecondPersonAccordion() {
        var wrap = document.getElementById('secondPersonFormWrap');
        var chevron = document.getElementById('p2AccChevron');
        if (!wrap) return;
        p2AccOpen = !p2AccOpen;
        if (p2AccOpen) {
          wrap.style.maxHeight = '2000px';
          wrap.style.opacity = '1';
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
          wrap.style.maxHeight = '0';
          wrap.style.opacity = '0';
          if (chevron) chevron.style.transform = '';
        }
      }
      window.toggleSecondPersonAccordion = toggleSecondPersonAccordion;

      function openSecondPersonAccordion() {
        if (!p2AccOpen) toggleSecondPersonAccordion();
      }

      function updateP2AccordionSummary() {
        var name2 = (document.getElementById('name2') || {}).value || '';
        var bd2 = (document.getElementById('birthdate2') || {}).value || '';
        var nameEl = document.getElementById('p2AccName');
        var dateEl = document.getElementById('p2AccDate');
        var sepEl  = document.getElementById('p2AccSep');
        if (!nameEl) return;
        if (name2) {
          nameEl.textContent = name2;
          if (bd2 && dateEl) {
            var parts = bd2.split('-');
            dateEl.textContent = parts.length === 3 ? parts[2] + '.' + parts[1] + '.' + parts[0] : bd2;
            if (sepEl) sepEl.style.display = '';
          } else {
            if (dateEl) dateEl.textContent = '';
            if (sepEl) sepEl.style.display = 'none';
          }
        } else {
          nameEl.textContent = typeof t === 'function' ? t('formSecondPerson') : 'Второй человек';
          if (dateEl) dateEl.textContent = '';
          if (sepEl) sepEl.style.display = 'none';
        }
      }
      window.updateP2AccordionSummary = updateP2AccordionSummary;

      // ── Аккордеон энергии момента ──────────────────────────────────────────
      var transitAccOpen = false;
      function toggleTransitAccordion() {
        var wrap = document.getElementById('transitFormWrap');
        var chevron = document.getElementById('transitAccChevron');
        if (!wrap) return;
        transitAccOpen = !transitAccOpen;
        if (transitAccOpen) {
          wrap.style.maxHeight = '2000px';
          wrap.style.opacity = '1';
          wrap.classList.add('transit-form-open');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
          wrap.style.maxHeight = '0';
          wrap.style.opacity = '0';
          wrap.classList.remove('transit-form-open');
          if (chevron) chevron.style.transform = '';
        }
      }
      window.toggleTransitAccordion = toggleTransitAccordion;

      // ── Аккордеон «Расширенные настройки» (место+время — необязательно) ──
      var advSettingsOpen = false;
      function toggleAdvSettings() {
        // Эталон _form_preview.html: раскрытие через класс .open на #advSettings
        // (галочка-чекбокс + border-left панель), НЕ через .adv-collapsed на wrap.
        var box = document.getElementById('advSettings');
        var header = document.getElementById('advHeader') || document.querySelector('#advSettings .adv-header');
        if (!box) return;
        advSettingsOpen = !advSettingsOpen;
        box.classList.toggle('open', advSettingsOpen);
        if (header) header.setAttribute('aria-expanded', advSettingsOpen ? 'true' : 'false');
        _syncAdvSummary();
      }
      window.toggleAdvSettings = toggleAdvSettings;

      // Сводка в шапке «Расширенных настроек»: если место/время уже заполнены (профиль,
      // герой, рука) — вместо «необязательно» показываем «Москва · 14:30». Данные при
      // свёрнутой секции ВСЕГДА уходят в заявку (submit читает поля напрямую) — сводка
      // делает это видимым, чтобы свёрнутость не читалась как «не учитывается» (Алла 12.07).
      function _syncAdvSummary() {
        var sub = document.querySelector('#advSettings .adv-sub');
        if (!sub) return;
        var bpEl = document.getElementById('birthplace');
        var btEl = document.getElementById('birthtime');
        var unkEl = document.getElementById('unknown');
        var parts = [];
        var city = ((bpEl && bpEl.value) || '').split(',')[0].trim();
        if (city) parts.push(city);
        var tv = (btEl && !btEl.disabled && btEl.value) || '';
        if (tv && !(unkEl && unkEl.checked)) parts.push(tv);
        if (parts.length) { sub.textContent = parts.join(' · '); sub.removeAttribute('data-i18n'); }
        else { sub.setAttribute('data-i18n', 'advSettingsSub'); sub.textContent = (typeof t === 'function' ? t('advSettingsSub') : 'необязательно'); }
      }
      window._syncAdvSummary = _syncAdvSummary;
      ['birthplace', 'birthtime', 'unknown'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.addEventListener('input', _syncAdvSummary); el.addEventListener('change', _syncAdvSummary); }
      });
      _syncAdvSummary();

      function openTransitAccordion() {
        if (!transitAccOpen) toggleTransitAccordion();
      }

      function updateTransitAccordionSummary() {
        var transitDate = (document.getElementById('transitDate') || {}).value || '';
        var transitLocation = (document.getElementById('transitLocation') || {}).value || '';
        var dateEl = document.getElementById('transitAccDate');
        var sepEl  = document.getElementById('transitAccSep');
        if (!dateEl) return;
        var parts = [];
        if (transitDate) {
          var dateParts = transitDate.split('-');
          if (dateParts.length === 3) {
            parts.push(dateParts[2] + '.' + dateParts[1] + '.' + dateParts[0]);
          } else {
            parts.push(transitDate);
          }
        }
        if (transitLocation) {
          parts.push(transitLocation);
        }
        if (parts.length > 0) {
          dateEl.textContent = parts.join(' · ');
          if (sepEl) sepEl.style.display = '';
        } else {
          dateEl.textContent = '';
          if (sepEl) sepEl.style.display = 'none';
        }
      }
      window.updateTransitAccordionSummary = updateTransitAccordionSummary;

      // Следим за полями второго человека для обновления сводки в шапке
      document.addEventListener('DOMContentLoaded', function() {
        ['name2', 'birthdate2'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('change', updateP2AccordionSummary);
          if (el && el.tagName === 'INPUT') el.addEventListener('input', updateP2AccordionSummary);
        });
        // Следим за полями энергии момента для обновления сводки в шапке
        ['transitDate', 'transitLocation'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('change', updateTransitAccordionSummary);
          if (el && el.tagName === 'INPUT') el.addEventListener('input', updateTransitAccordionSummary);
        });
      });

      // Применить аккордеон: свернуть форму и показать шапку с именем и датой
      function applyProfileAccordion(name, birthdate, accordion, formWrap) {
        var pfaNameEl = document.getElementById('pfaName');
        var pfaDateEl = document.getElementById('pfaDate');
        var pfaSepEl  = document.getElementById('pfaSep');
        var chevronEl = document.getElementById('pfaChevron');
        if (pfaNameEl) pfaNameEl.textContent = name;
        // Batch 10.13 (отчёт 7272216 MacOS): обновляем title «Твои данные» при
        // выборе героя — показываем имя героя в заголовке развёрнутого блока.
        // Если name === имя из профиля или пусто → возврат к «Твои данные».
        try {
          var titleEl = document.getElementById('formYourDataTitle');
          if (titleEl) {
            var profileName = (window._savedFormProfile && window._savedFormProfile.name) || '';
            var isHeroSelected = name && name !== profileName;
            if (isHeroSelected) {
              titleEl.textContent = (typeof t === 'function' ? (t('heroDataTitle', { name: name }) || ('Данные ' + name)) : ('Данные ' + name));
            } else {
              titleEl.textContent = typeof t === 'function' ? t('formYourData') : 'Твои данные';
            }
          }
        } catch (_) {}
        var d = new Date(birthdate + 'T00:00:00');
        // Batch 10.13 (7272195): локаль из currentLang
        var accLocale = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
        var dateStr = d.toLocaleDateString(accLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (pfaDateEl) pfaDateEl.textContent = dateStr;
        if (pfaSepEl) pfaSepEl.style.display = 'inline';
        if (accordion) accordion.style.display = 'block';
        if (formWrap) formWrap.classList.add('pfw-collapsed');
        // Batch 6.3 (ID 7262408): стрелка ВНИЗ при свёрнутом — соответствие контенту
        if (chevronEl) chevronEl.classList.remove('open');
        requestAnimationFrame(function() { requestAnimationFrame(function() { if (formWrap) formWrap.classList.remove('no-anim'); }); });
      }

      // Сохранить профиль в localStorage (fallback для мгновенного аккордеона)
      function cacheProfileLocal(p) {
        try { localStorage.setItem('yup_profile_cache', JSON.stringify({ name: p.name, birthdate: p.birthdate, birthplace: p.birthplace, birthtime: p.birthtime, birthtime_unknown: p.birthtime_unknown, gender: p.gender, language: p.language })); } catch(_) {}
      }
      function getCachedProfile() {
        try { var s = localStorage.getItem('yup_profile_cache'); return s ? JSON.parse(s) : null; } catch(_) { return null; }
      }

      // Автозаполнение формы из профиля + аккордеон для повторных визитов
      // Баг доходимости C: форма теряла ввод (запрос/стиль/режим) при перезагрузке
      // Mini App (VK/TG WebView reload, self-heal) и глубокой навигации. Черновик в
      // sessionStorage переживает это в рамках сессии вкладки. Чистится после успешной отправки.
      // Поля анкеты, которые переживают SPA-навигацию (уход «добавить контакт» и назад).
      // Первый человек + второй: при возврате formPage-хук зовёт resetFormState() и чистит
      // поля, а профиль-префилл возвращает ТОЛЬКО данные владельца — вручную введённый
      // человек терялся («сброс данных первого контакта», Закон №20).
      var _DRAFT_P1 = ['name', 'birthdate', 'birthtime', 'birthplace', 'gender'];
      var _DRAFT_P2 = ['name2', 'birthdate2', 'birthtime2', 'birthplace2', 'gender2', 'person2Relationship'];

      function _saveFormDraft() {
        if (!window._formDraftWired) return; // не сохраняем до показа+восстановления формы
        try {
          var d = {
            request: (document.getElementById('request') || {}).value || '',
            preferredStyle: (document.getElementById('requestPreferredStyle') || {}).value || '',
            styleMode: window._styleMode || 'manual',
            lyricsMode: window._lyricsMode || 'sung',
            customLyrics: (document.getElementById('customLyrics') || {}).value || ''
          };
          // Поля людей пишем в черновик ТОЛЬКО при ручном вводе. Если выбран герой
          // картотеки — его данные в черновик не кладём, иначе контакт «утечёт» в форму
          // «для себя» при следующем входе (тот самый баг залипания).
          var _fwEl = document.getElementById('forWho');
          var _heroPicked = (_fwEl && _fwEl.value)
            || (typeof _selectedHeroId !== 'undefined' && _selectedHeroId)
            || (window._selectedPerson1Hero && window._selectedPerson1Hero.id);
          if (!_heroPicked) {
            var f = {};
            _DRAFT_P1.concat(_DRAFT_P2).forEach(function(id) {
              var el = document.getElementById(id);
              if (el && el.value) f[id] = el.value;
            });
            var bp = document.getElementById('birthplace');
            if (bp && bp.getAttribute('data-place-selected')) {
              f._bpSel = '1';
              if (bp.getAttribute('data-lat')) f._bpLat = bp.getAttribute('data-lat');
              if (bp.getAttribute('data-lon')) f._bpLon = bp.getAttribute('data-lon');
            }
            var bp2 = document.getElementById('birthplace2');
            if (bp2 && bp2.getAttribute('data-place-selected')) {
              f._bp2Sel = '1';
              if (bp2.getAttribute('data-lat')) f._bp2Lat = bp2.getAttribute('data-lat');
              if (bp2.getAttribute('data-lon')) f._bp2Lon = bp2.getAttribute('data-lon');
            }
            var u1 = document.getElementById('unknown'); if (u1 && u1.checked) f.unknown = 1;
            var u2 = document.getElementById('unknown2'); if (u2 && u2.checked) f.unknown2 = 1;
            if (Object.keys(f).length) d.fields = f;
          }
          if (!d.request && !d.preferredStyle && d.styleMode === 'manual' && d.lyricsMode === 'sung' && !d.customLyrics && !d.fields) sessionStorage.removeItem('yup_form_draft');
          else sessionStorage.setItem('yup_form_draft', JSON.stringify(d));
        } catch (e) {}
      }
      window._saveFormDraft = _saveFormDraft;

      function _restoreFormDraft() {
        try {
          var raw = sessionStorage.getItem('yup_form_draft');
          if (!raw) return;
          var d = JSON.parse(raw);
          if (!d || typeof d !== 'object') return;
          var reqEl = document.getElementById('request');
          var styleEl = document.getElementById('requestPreferredStyle');
          // Только пустые поля (reload). Живой ввод, переживший SPA-навигацию, не трогаем.
          if (d.request && reqEl && !reqEl.value) reqEl.value = d.request;
          if (styleEl && !styleEl.value && d.preferredStyle && d.styleMode !== 'astro') {
            if (d.styleMode === 'star') window._draftStarStyle = d.preferredStyle;
            else window._draftManualStyle = d.preferredStyle;
            if (d.styleMode && d.styleMode !== window._styleMode && typeof setStyleMode === 'function') setStyleMode(d.styleMode);
            else styleEl.value = d.preferredStyle;
          }
          // Голос песни: восстанавливаем выбор и написанный текст (тоже только в пустое поле)
          var clEl = document.getElementById('customLyrics');
          if (clEl && !clEl.value && d.customLyrics) clEl.value = d.customLyrics;
          if (d.lyricsMode && d.lyricsMode !== 'sung' && typeof window.setLyricsMode === 'function') {
            window.setLyricsMode(d.lyricsMode);
          }
          // Поля людей — тоже только в ПУСТЫЕ (профиль-префилл уже отработал и он в
          // приоритете). Возвращает вручную введённого человека после «добавить контакт».
          var f = d.fields;
          if (f) {
            _DRAFT_P1.concat(_DRAFT_P2).forEach(function(id) {
              var el = document.getElementById(id);
              if (el && !el.value && f[id]) {
                el.value = f[id];
                if ((id === 'birthdate' || id === 'birthdate2') && typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput(id);
              }
            });
            var bp = document.getElementById('birthplace');
            if (bp && bp.value && f._bpSel) {
              bp.setAttribute('data-place-selected', '1');
              if (f._bpLat) bp.setAttribute('data-lat', f._bpLat);
              if (f._bpLon) bp.setAttribute('data-lon', f._bpLon);
              var bw = document.getElementById('birthplaceWrap'); if (bw) bw.classList.add('has-place');
              var bh = document.getElementById('birthplaceHint'); if (bh) bh.style.display = 'none';
            }
            var bp2 = document.getElementById('birthplace2');
            if (bp2 && bp2.value && f._bp2Sel) {
              bp2.setAttribute('data-place-selected', '1');
              if (f._bp2Lat) bp2.setAttribute('data-lat', f._bp2Lat);
              if (f._bp2Lon) bp2.setAttribute('data-lon', f._bp2Lon);
              var bw2 = document.getElementById('birthplace2Wrap'); if (bw2) bw2.classList.add('has-place');
              var bh2 = document.getElementById('birthplace2Hint'); if (bh2) bh2.style.display = 'none';
            }
            var u1 = document.getElementById('unknown'); if (u1 && !u1.checked && f.unknown) u1.checked = true;
            var u2 = document.getElementById('unknown2'); if (u2 && !u2.checked && f.unknown2) u2.checked = true;
            var bdw = document.getElementById('birthdateWrap');
            var bdEl = document.getElementById('birthdate');
            if (bdw && bdEl && bdEl.value) bdw.classList.add('has-date');
            try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch(_) {}
          }
        } catch (e) {}
      }
      window._restoreFormDraft = _restoreFormDraft;

      function _wireFormDraftSave() {
        if (window._formDraftWired) return;
        window._formDraftWired = true;
        ['request', 'requestPreferredStyle', 'customLyrics'].concat(_DRAFT_P1, _DRAFT_P2).forEach(function(id) {
          var el = document.getElementById(id);
          if (el && !el._draftBound) {
            el._draftBound = true;
            el.addEventListener('input', _saveFormDraft);
            // select/чекбоксы (пол, дата из дропдаунов) шлют change, не input
            el.addEventListener('change', _saveFormDraft);
          }
        });
        ['unknown', 'unknown2'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el && !el._draftBound) { el._draftBound = true; el.addEventListener('change', _saveFormDraft); }
        });
      }
      window._wireFormDraftSave = _wireFormDraftSave;

      async function loadSavedProfileForForm() {
        var accordion = document.getElementById('profileAccordion');
        var formWrap = document.getElementById('formFieldsWrap');
        if (accordion) accordion.style.display = 'none';

        // CRITICAL: инициализируем _savedFormProfile СРАЗУ (даже пустым объектом),
        // чтобы input handlers не падали из-за race condition с async fetch
        if (!window._savedFormProfile) window._savedFormProfile = {};

        // Мгновенный fallback из localStorage — показываем аккордеон сразу, не дожидаясь API
        // Но если герой уже выбран в forWho (переход с Лаборатории) — не перезатираем
        var cached = getCachedProfile();
        var _fwCheck = document.getElementById('forWho');
        var _fwHasHero = _fwCheck && _fwCheck.value;
        if (cached) {
          // Сохраняем как fallback для восстановления при «Для себя»
          window._savedFormProfile = cached;
        }
        if (cached && cached.name && cached.birthdate && !_fwHasHero) {
          formWrap && formWrap.classList.add('no-anim');
          applyProfileAccordion(cached.name, cached.birthdate, accordion, formWrap);
        }

        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) {
          if (!cached || !cached.name || !cached.birthdate) {
            if (formWrap) { formWrap.classList.remove('pfw-collapsed'); formWrap.classList.remove('no-anim'); }
          }
          return;
        }
        var initData = getInitData();
        var formAuthH = getAuthHeaders();
        try {
          // Закон №36: таймаут обязателен — на холодном старте бэкенда голый fetch висел
          // 2-5 мин (браузерный дефолт) → «медленно грузится форма» (жалобы юзеров). 20с + json-guard.
          var _fwt = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : fetch;
          var resp = await _fwt(apiBase + '/api/user/profile', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, formAuthH),
            body: JSON.stringify({ initData: initData })
          }, 20000);
          var json = await resp.json().catch(function() { return {}; });
          var p = json && json.profile;
          if (!p) {
            // Профиля нет на сервере — но может быть в localStorage (первый визит после заполнения формы)
            if (!cached || !cached.name || !cached.birthdate) {
              if (formWrap) {
                formWrap.classList.add('no-anim');
                formWrap.classList.remove('pfw-collapsed');
                if (accordion) accordion.style.display = 'none';
                requestAnimationFrame(function() { requestAnimationFrame(function() { if (formWrap) formWrap.classList.remove('no-anim'); }); });
              }
            }
            return;
          }

          // Кэшируем профиль для мгновенного аккордеона при следующем визите
          cacheProfileLocal(p);
          // Сохраняем профиль пользователя для восстановления при переключении «Для себя»
          // Это ВСЕГДА данные пользователя (приходят с сервера), поэтому перезаписываем безусловно
          window._savedFormProfile = p;
          // СЕРВЕР — ИСТИНА (Алла 09.07, «эффект новичка не работает»): профиль на сервере ПУСТ
          // (обнулён/новый), а устройство помнит старый кэш/ввод — мгновенный fallback выше уже
          // успел показать старые данные. Маркер пустоты — ОТСУТСТВИЕ ДАТЫ (имя сервер может
          // префиллить из Telegram — это задумано, сохраняем). Чистим форму и следы прежнего акка.
          if (!p.birthdate) {
            try { localStorage.removeItem('yup_profile_cache'); } catch(_) {}
            try { sessionStorage.removeItem('yup_form_draft'); } catch(_) {}
            window._savedFormProfile = p.name ? { name: p.name } : {};
            if (typeof window.resetFormState === 'function') { try { window.resetFormState(); } catch(_) {} }
            // TG-префилл имени возвращаем (остальное — чистый лист)
            if (p.name) { var _nmEl = document.getElementById('name'); if (_nmEl) _nmEl.value = p.name; }
            if (formWrap) { formWrap.classList.add('no-anim'); formWrap.classList.remove('pfw-collapsed'); }
            if (accordion) accordion.style.display = 'none';
            requestAnimationFrame(function() { requestAnimationFrame(function() { if (formWrap) formWrap.classList.remove('no-anim'); }); });
            return;
          }

          // Если пользователь уже выбрал героя в forWho — НЕ перезаписываем поля формы (гонка async)
          var _forWhoEl = document.getElementById('forWho');
          var _heroSelected = _forWhoEl && _forWhoEl.value;

          if (!_heroSelected) {
          // Предзаполняем поля формы
          var nameEl = document.getElementById('name');
          var birthdateEl = document.getElementById('birthdate');
          var birthplaceEl = document.getElementById('birthplace');
          var birthtimeEl = document.getElementById('birthtime');
          var unknownEl = document.getElementById('unknown');
          if (nameEl && p.name) nameEl.value = p.name;
          if (birthdateEl && p.birthdate) {
            birthdateEl.value = p.birthdate;
            var parts = p.birthdate.split('-');
            if (parts.length === 3) {
              var dayEl = document.getElementById('birthdateDay');
              var monEl = document.getElementById('birthdateMonth');
              var yrEl  = document.getElementById('birthdateYear');
              if (dayEl) dayEl.value = parseInt(parts[2], 10);
              if (monEl) monEl.value = parseInt(parts[1], 10);
              if (yrEl)  yrEl.value  = parts[0];
              var checkEl = document.getElementById('birthdateCheck');
              if (checkEl) { checkEl.style.display = 'flex'; checkEl.style.opacity = '1'; }
              // Синхронизируем кастомные дропдауны (.cs-wrap) с проставленными value —
              // иначе плашка показывает плейсхолдер «День/Месяц/Год», хотя дата уже в #birthdate
              // (данные «не подтягивались» при возврате из профиля в анкету).
              if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate');
            }
          }
          if (birthplaceEl && p.birthplace) {
            birthplaceEl.value = p.birthplace;
            if (p.birthplace.trim().length >= 3) {
              birthplaceEl.setAttribute('data-from-profile', '1');
              birthplaceEl.setAttribute('data-place-selected', '1');
              var bwEl = document.getElementById('birthplaceWrap');
              if (bwEl) bwEl.classList.add('has-place');
              var bchEl = document.getElementById('birthplaceCheck');
              if (bchEl) bchEl.setAttribute('aria-hidden', 'false');
              var bHintEl = document.getElementById('birthplaceHint');
              if (bHintEl) bHintEl.style.display = 'none';
              if (p.birthplace_lat != null && p.birthplace_lon != null) {
                birthplaceEl.setAttribute('data-lat', String(p.birthplace_lat));
                birthplaceEl.setAttribute('data-lon', String(p.birthplace_lon));
              }
            }
          }
          if (birthtimeEl && p.birthtime) birthtimeEl.value = normalizeTimeValue(p.birthtime);
          if (unknownEl && p.birthtime_unknown) {
            unknownEl.checked = true;
            if (birthtimeEl) { birthtimeEl.value = ''; birthtimeEl.disabled = true; }
            var hint = document.getElementById('birthtimeUnknownHint');
            if (hint) hint.style.display = 'block';
          } else {
            var hint = document.getElementById('birthtimeUnknownHint');
            if (hint) hint.style.display = 'none';
            if (birthtimeEl) birthtimeEl.disabled = false;
          }
          if (window._syncAdvSummary) window._syncAdvSummary();

          // Пол
          var genderEl = document.getElementById('gender');
          if (genderEl && p.gender) genderEl.value = p.gender;

          // Язык песни
          var langEl = document.getElementById('language');
          // Batch 10.9 (отчёт 7271861 MacOS): если пользователь УЖЕ выбрал язык
          // в этой сессии формы (langEl.value !== ''), autofill не должен
          // его перезатирать. Возврат к форме из платёжного экрана сохранит
          // ручной выбор. Только если поле пустое — заполняем из профиля/TG.
          if (langEl && !langEl.value) {
            var tgLc = ((tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || '').toLowerCase();
            var telegramSongLang = /^uk/.test(tgLc) ? 'uk' : /^en/.test(tgLc) ? 'en' : /^de/.test(tgLc) ? 'de' : /^fr/.test(tgLc) ? 'fr' : 'ru';
            var profileLang = p.language || '';
            if (profileLang && !(profileLang === 'ru' && telegramSongLang !== 'ru')) {
              langEl.value = profileLang;
            } else {
              langEl.value = telegramSongLang;
            }
          }
          } // end if (!_heroSelected)

          // Показываем аккордеон если есть имя И дата рождения (минимум для отправки)
          // При выбранном герое — берём данные героя для аккордеона
          if (_heroSelected) {
            var _selHero = (heroesCache || []).find(function(c) { return c.id === _heroSelected; });
            if (_selHero && _selHero.name && _selHero.birth_date) {
              applyProfileAccordion(_selHero.name, _selHero.birth_date, accordion, formWrap);
            }
          } else if (p.name && p.birthdate) {
            applyProfileAccordion(p.name, p.birthdate, accordion, formWrap);
          } else {
            // Профиль есть, но данные неполные — показываем форму открытой
            if (formWrap) {
              formWrap.classList.add('no-anim');
              formWrap.classList.remove('pfw-collapsed');
              if (accordion) accordion.style.display = 'none';
              requestAnimationFrame(function() { requestAnimationFrame(function() { if (formWrap) formWrap.classList.remove('no-anim'); }); });
            }
          }
        } catch(e) {
          console.warn('[Form] Ошибка загрузки профиля:', e);
          // При ошибке — если нет кэша, показываем форму открытой
          if (!cached || !cached.name || !cached.birthdate) {
            if (formWrap) { formWrap.classList.remove('pfw-collapsed'); formWrap.classList.remove('no-anim'); }
          }
        }
        // Дефолтный язык по Telegram
        var langElFallback = document.getElementById('language');
        if (langElFallback && !langElFallback.value) {
          var tgLcFb = ((tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || '').toLowerCase();
          langElFallback.value = /^uk/.test(tgLcFb) ? 'uk' : /^en/.test(tgLcFb) ? 'en' : /^de/.test(tgLcFb) ? 'de' : /^fr/.test(tgLcFb) ? 'fr' : 'ru';
        }
        // Пол/язык выставлены программно (sel.value=…) — MutationObserver кастом-дропдауна
        // на это НЕ срабатывает, плашка .cs-display застревает на «Выбери» («слетает пол/язык»
        // при попадании на «Твой заказ» / возврате на форму). Форсим sync после автозаполнения.
        try { if (typeof window._syncCustomDropdowns === 'function') window._syncCustomDropdowns(); } catch (_) {}
      }

      // Проверяет при запуске есть ли зависшая заявка (работает и для новичков и для повторных)
      async function checkPendingRequestOnStart() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) return;
        // Приложение App Store: карточка «Незавершённый пакет/заказ» сделана для веб-оплат (HOT, T-Bank) —
        // её кнопка проверяет веб-платёж и открывает веб-оплату. Платёж Apple «продолжить» нельзя: окно
        // закрыли — покупки нет, а незавершённую транзакцию StoreKit доставит сам. Каждое нажатие «купить»
        // заводит заявку pending_payment, и после закрытого окна Apple карточка висела на главной
        // (Алла 22.09, TestFlight 24: «страшилище»). В приложении карточку не показываем.
        if (window._isNativeApp) return;
        try {
          var resp = await fetch(apiBase + '/api/my/pending-request', { headers: getAuthHeaders() });
          var json = await resp.json().catch(function() { return {}; });
          if (!resp.ok || !json.ok || !json.pending || !json.request_id) return;
          // Есть зависшая заявка — показываем восстановительный баннер на главной
          pendingPaymentRequestId = json.request_id;
          pendingPaymentSku = json.sku || null;
          var banner = document.getElementById('recoveryBanner');
          var bannerText = document.getElementById('recoveryBannerText');
          var rb = document.getElementById('recoveryClaimBtn');
          if (banner) {
            if (isSubscriptionSku(pendingPaymentSku)) {
              if (bannerText) bannerText.innerHTML = '<strong style="color:#6ee7b7;">' + (typeof t === 'function' ? t('bannerPendingSub') : 'Незавершённый пакет') + '</strong><br>' + (typeof t === 'function' ? t('bannerPendingSubDesc') : 'Оплата ещё не подтверждена. Продолжи оформление тарифа.');
              if (rb) rb.textContent = typeof t === 'function' ? t('btnContinueSub') : 'Продолжить оплату пакета';
            } else if (freeTrialAvailable) {
              // Новый пользователь — предлагаем бесплатный ключ
              if (bannerText) bannerText.innerHTML = '<strong style="color:#6ee7b7;">' + (typeof t === 'function' ? t('bannerPendingIskry') : 'Твоя заявка ждёт!') + '</strong><br>' + (typeof t === 'function' ? t('bannerPendingIskryDesc') : 'Используй Искры — создай свою песню.');
              if (rb) rb.textContent = typeof t === 'function' ? t('btnCreateSong') : 'Создать песню';
            } else {
              // Повторный пользователь — у него незавершённая оплата
              if (bannerText) bannerText.innerHTML = '<strong style="color:#6ee7b7;">' + (typeof t === 'function' ? t('bannerPendingOrder') : 'Незавершённый заказ') + '</strong><br>' + (typeof t === 'function' ? t('bannerPendingOrderDesc') : 'У тебя есть заявка, ожидающая оплаты.');
              if (rb) rb.textContent = typeof t === 'function' ? t('btnGoToPayment') : 'Перейти к оплате';
            }
            banner.style.display = 'block';
            // Когда баннер заказа показан — скрываем реферальный блок (не перегружаем экран)
            var refCard = document.getElementById('referralCard');
            if (refCard) refCard.style.display = 'none';
            var dismissBtn = document.getElementById('recoveryDismissBtn');
            if (dismissBtn) dismissBtn.onclick = function() {
              banner.style.display = 'none';
              if (refCard) refCard.style.display = 'block';
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              if (apiBase && hasAuth() && pendingPaymentRequestId) {
                var dh = getAuthHeaders();
                fetch(apiBase + '/api/my/pending-request/dismiss', {
                  method: 'POST',
                  headers: Object.assign({ 'Content-Type': 'application/json' }, dh),
                  body: JSON.stringify({ request_id: pendingPaymentRequestId })
                }).catch(function() {});
              }
            };
            if (rb) rb.onclick = function() {
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              if (!apiBase || !hasAuth() || !pendingPaymentRequestId) {
                banner.style.display = 'none';
                showPaymentOverlay();
                return;
              }
              var initData = getInitData();
              var recAuthH = getAuthHeaders();
              (async function smartPendingRecovery() {
                try {
                  var stResp = await fetch(apiBase + '/api/payments/hot/status?request_id=' + encodeURIComponent(pendingPaymentRequestId), {
                    headers: recAuthH
                  });
                  var stJson = await stResp.json().catch(function(){ return {}; });
                  var ps = stJson && stJson.data ? String(stJson.data.payment_status || '').toLowerCase() : '';
                  var sku = getPaymentSkuFromStatus(stJson) || pendingPaymentSku || '';
                  if (ps === 'paid') {
                    if (_hotPaymentConfirmed) { banner.style.display = 'none'; return; }
                    _hotPaymentConfirmed = true;
                    paymentPollingActive = false;
                    if (isSubscriptionSku(sku)) {
                      await claimSubscriptionSafe(apiBase, initData, pendingPaymentRequestId);
                      hidePaymentOverlay();
                      if (typeof showToast === 'function') showToast(t('toastSubActivated'));
                      goToPage('profilePage');
                    } else {
                      await fetch(apiBase + '/api/payments/hot/confirm', {
                        method: 'POST',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, recAuthH),
                        body: JSON.stringify({ request_id: pendingPaymentRequestId, initData: initData })
                      }).catch(function(){});
                      showConfirm(t('payPaid'), (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>'));
                    }
                    banner.style.display = 'none';
                    pendingPaymentRequestId = null;
                    pendingPaymentSku = null;
                    try { localStorage.removeItem('hot_pending_request_id'); localStorage.removeItem('hot_pending_sku'); localStorage.removeItem('pending_payment_type'); } catch(_) {}
                    catalogCache = null; catalogCacheTime = 0;
                    if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){});
                    if (typeof loadPricingCatalog === 'function') loadPricingCatalog().catch(function(){});
                    return;
                  }
                } catch (_) {}
                banner.style.display = 'none';
                showPaymentOverlay();
              })();
            };
          }
        } catch (e) { /* не критично */ }
      }

      // ── Тогл статистики рефералов ─────────────────────────────────────
      (function() {
        var toggle = document.getElementById('refStatsToggle');
        var block = document.getElementById('refStatsBlock');
        if (!toggle || !block) return;
        toggle.addEventListener('click', function() {
          var open = block.style.display !== 'none';
          block.style.display = open ? 'none' : 'flex';
          toggle.textContent = open ? '▸ моя статистика' : '▾ моя статистика';
          toggle.style.color = open ? 'rgba(var(--primary-rgb),0.4)' : 'rgba(var(--primary-rgb),0.7)';
          if (!open && typeof loadReferralStats === 'function') loadReferralStats();
        });
      })();

      // ── Реферальная кнопка «Поделиться» ──────────────────────────────
      (function() {
        var shareBtn = document.getElementById('referralShareBtn');
        if (!shareBtn) return;
        shareBtn.addEventListener('click', function() {
          var link = (document.getElementById('referralLinkInput') || {}).value || '';
          if (!link) return;
          var tgWeb = window.Telegram && window.Telegram.WebApp;
          if (tgWeb && tgWeb.openTelegramLink) {
            tgWeb.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) +
              '&text=' + encodeURIComponent('Получи персональную песню в YupSoul! Минута твоей песни в подарок'));
          } else {
            // VK Testers #7257956×7 + #7279207 + #7274702: navigator.clipboard.writeText
            // на VK Mobile перехватывается клиентом и показывает свой русский toast.
            // _copyToClipboard сам выбирает execCommand на VK env. §22 в check-ui-invariants.
            if (typeof window._copyToClipboard === 'function') {
              window._copyToClipboard(link);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(link).catch(function() {});
            }
            shareBtn.textContent = typeof t === 'function' ? t('btnCopied') : 'Скопировано!';
            setTimeout(function() { shareBtn.textContent = typeof t === 'function' ? t('btnShare') : 'Поделиться'; }, 2000);
          }
        });
      })();

      // ═══ CD 19.09 · Профиль (docs/DESIGN-HANDOFF-1909.md, экран 10): зеркала узлов движка для кошелька ═══
      // «N из M песен» и полоса — из #profileCreditsCount («used / limit», пишет loadProfilePage); подпись Искр —
      // из баланса; «Пакета нет» — когда #profileSubManage скрыт; счётчик контактов — heroesCache.
      (function pfCdInit() {
        var page = document.getElementById('profilePage');
        if (!page) return;
        var $ = function (id) { return document.getElementById(id); };
        function tl(k, fb, v) { var s = (typeof t === 'function') ? t(k, v) : null; return (s && s !== k) ? s : fb; }
        function songsWord(n) {
          var lang = (typeof currentLang !== 'undefined' ? currentLang : (window._currentLang || 'ru'));
          if (lang === 'ru') { var m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? tl('plSongsWord1', 'песню') : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? tl('plSongsWord2', 'песни') : tl('plSongsWord5', 'песен'); }
          return n === 1 ? tl('plSongsWord1', 'song') : tl('plSongsWord5', 'songs');
        }
        function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
        var syncing = false, queued = false;
        function sync() {
          if (syncing) return;
          syncing = true;
          try {
            var m = String(($('profileCreditsCount') || {}).textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
            var used = m ? parseInt(m[1], 10) : 0, limit = m ? parseInt(m[2], 10) : 0, left = Math.max(0, limit - used);
            setText($('pfSongsLeft'), String(left));
            setText($('pfSongsOf'), limit ? tl('pfOfSongs', 'из {n} {songs}', { n: limit, songs: songsWord(limit) }) : '');
            var bar = $('pfSongsBar'); if (bar) bar.style.width = (limit ? Math.round(left / limit * 100) : 0) + '%';
            var sub = $('profileSubManage'), noPack = $('pfNoPack');
            if (noPack) noPack.style.display = (sub && sub.style.display !== 'none') ? 'none' : '';
            var bal = typeof getIskryBalance === 'function' ? (getIskryBalance() || 0) : 0, n = Math.floor(bal / 100);
            setText($('pfIskrySub'), n > 0 ? tl('pfIskryEnough', 'Хватит на {n} {songs}', { n: n, songs: songsWord(n) }) : tl('pfIskryNone', 'Пока не хватает'));
            setText($('pfContactsCount'), Array.isArray(window.heroesCache) ? String(window.heroesCache.length) : '');
            // карта не привязана: движок прячет строку #profileCardInfo, но рамка .w-card остаётся пустой
            var _ci = $('profileCardInfo'), _sec = $('profilePaymentMethodSection');
            if (_ci && _sec) _sec.classList.toggle('pf-card-empty', getComputedStyle(_ci).display === 'none');
          } finally { syncing = false; }
        }
        function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; sync(); }); }
        new MutationObserver(function () { if (!syncing) schedule(); })
          .observe(page, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
        new MutationObserver(function () { if (document.body.dataset.page === 'profilePage') schedule(); })
          .observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
        window._pfCdSync = sync;
        sync();
      })();

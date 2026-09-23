
      // ── Определение среды: Telegram, VK или Web ─────────────────────────
      // ВАЖНО: НЕ перетирать значение, выставленное в HEAD (строка ~145
      // выставляет _appEnv='vk' синхронно при vk_user_id в URL). Иначе
      // captureSource() в окне до runtime-детекта поставит platform='telegram'
      // и весь VK-трафик размечается как Telegram (баг от 11.06.2026, см.
      // docs/ANALYTICS_ROADMAP.md Phase 0.1).
      if (!window._appEnv) window._appEnv = 'unknown'; // 'telegram' | 'web' | 'vk'
      window._googleJwt = null;
      window._googleUser = null;

      function isWebMode() { return window._appEnv === 'web' || window._appEnv === 'vk'; }
      window.isWebMode = isWebMode;

      function getAuthHeaders() {
        var headers = { 'Content-Type': 'application/json' };
        // Batch 9.41 (отчёт 7264852, Юлия Гатина Windows VK): trial-таймер шёл,
        // но /api/soul-chat/access возвращал 401 в консоли. Корень:
        // getAuthHeaders проверял _appEnv === 'web'|'vk' && _googleJwt.
        // Если window._googleJwt слетел (rare race) → возвращался ТОЛЬКО
        // Content-Type без какого-либо токена → backend 401.
        // Защита: fallback на localStorage.google_jwt + ВСЕГДА шлём Bearer
        // если есть валидный JWT (независимо от _appEnv — он мог быть
        // не установлен в редких race-условиях).
        var jwt = window._googleJwt;
        if (!jwt) {
          try { jwt = localStorage.getItem('google_jwt'); } catch(_) {}
          if (jwt) window._googleJwt = jwt; // восстановили в window
        }
        if (jwt) {
          headers['Authorization'] = 'Bearer ' + jwt;
        }
        // initData передаём ВСЕГДА если есть — backend выберет приоритет
        // (initData > Bearer, см. resolveUserId на бэкенде). Не «или/или».
        var initData = getInitData();
        if (initData) headers['X-Telegram-Init'] = initData;
        return headers;
      }
      window.getAuthHeaders = getAuthHeaders;

      /** VK разрешил сообщения сообщества → пишем согласие в профиль.
          Без этой записи notify_vk остаётся false: подписка есть на стороне ВК, а у нас её не видно,
          и оверлей «Будь на связи» продолжает приставать к тому, кто уже разрешил.
          Бонус на чистом VK-канале бэкенд не начисляет сам (§2.6.2 правил VK Mini Apps). */
      window._vkSaveNotifyConsent = function (bridgeRes) {
        // Ответ моста решает, что писать. VK при отказе обычно уходит в catch, но часть
        // клиентов резолвит с result:false — тогда записать «разрешил» значит соврать
        // базе и оставить движок возврата бить в 901. Без аргумента — как раньше, true.
        var allowed = (bridgeRes && typeof bridgeRes === 'object' && 'result' in bridgeRes)
          ? !!(bridgeRes.result === true || bridgeRes.result === 1)
          : true;
        try { if (allowed) localStorage.setItem('ys_notify_optin', '1'); } catch (_) {}
        try {
          var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var hdrs = getAuthHeaders();
          hdrs['Content-Type'] = 'application/json';
          var opts = { method: 'POST', headers: hdrs, body: JSON.stringify({ vk: allowed }) };
          var p = window.fetchWithTimeout
            ? window.fetchWithTimeout(base + '/api/notify-consent', opts, 12000)
            : fetch(base + '/api/notify-consent', opts);
          if (p && p.catch) p.catch(function () {});   // тихо, без ошибок в UI (закон №37)
        } catch (_) {}
      };

      /** fetch с повторами при сетевой ошибке (холодный старт, таймаут). maxRetries — сколько доп. попыток после первой. */
      function fetchWithRetry(url, opts, maxRetries) {
        maxRetries = maxRetries == null ? 2 : maxRetries;
        var timeoutMs = (opts && opts.timeoutMs) != null ? opts.timeoutMs : 45000;
        var attempt = 0;
        function run() {
          var controller = new AbortController();
          var tid = setTimeout(function() { controller.abort(); }, timeoutMs);
          var merged = Object.assign({}, opts, { signal: controller.signal });
          delete merged.timeoutMs;
          return fetch(url, merged).then(function(r) {
            clearTimeout(tid);
            // Batch 8.16 (7262762 MacOS Средний): «429 Too Many Requests без понятного
            // сообщения». При rate-limit показываем явный toast пользователю.
            if (r.status === 429 && typeof window.showToast === 'function') {
              var msg = (typeof t === 'function' ? (t('toastRateLimit') || 'Слишком много попыток. Подожди несколько минут и попробуй снова.') : 'Слишком много попыток. Подожди несколько минут и попробуй снова.');
              window.showToast(msg);
            }
            return r;
          }, function(err) {
            clearTimeout(tid);
            if (attempt < maxRetries && (err && (err.name === 'AbortError' || /fetch|network|Failed to fetch/i.test(String(err.message))))) {
              attempt++;
              return new Promise(function(ok) { setTimeout(ok, 2000); }).then(run);
            }
            throw err;
          });
        }
        return run();
      }
      window.fetchWithRetry = fetchWithRetry;

      // ═══════════════════════════════════════════════════════════════
      // YupSoul Analytics Module — сбор событий поведения пользователей
      // ═══════════════════════════════════════════════════════════════
      (function() {
        'use strict';

        var BATCH_INTERVAL = 15000;
        var MAX_BATCH = 50;
        var MAX_QUEUE = 200;
        var SESSION_TIMEOUT = 30 * 60 * 1000;

        var _queue = [];
        var _sid = null;
        var _sessionStart = 0;
        var _lastActivity = 0;
        var _currentPage = null;
        var _pageEnteredAt = 0;
        var _sourceData = null;
        var _flushing = false;
        var _userId = null;

        // --- Генерация ID сессии ---
        function genId() {
          if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'ses_' + crypto.randomUUID();
          return 'ses_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        }

        // --- Управление сессией ---
        function getOrCreateSession() {
          var now = Date.now();
          try {
            var stored = sessionStorage.getItem('ys_a_sid');
            var storedTs = parseInt(sessionStorage.getItem('ys_a_la'), 10);
            if (stored && storedTs && (now - storedTs < SESSION_TIMEOUT)) {
              _sid = stored;
              _sessionStart = parseInt(sessionStorage.getItem('ys_a_ss'), 10) || now;
              _lastActivity = now;
              sessionStorage.setItem('ys_a_la', String(now));
              return;
            }
          } catch(e) {}

          _sid = genId();
          _sessionStart = now;
          _lastActivity = now;
          try {
            sessionStorage.setItem('ys_a_sid', _sid);
            sessionStorage.setItem('ys_a_ss', String(now));
            sessionStorage.setItem('ys_a_la', String(now));
          } catch(e) {}

          _sourceData = captureSource();
          try { sessionStorage.setItem('_ys_source', JSON.stringify(_sourceData)); } catch(e) {}
          track('session_start', { source: _sourceData });
          sendSessionInit();
        }

        // --- Захват источника трафика ---
        function captureSource() {
          var params;
          try { params = new URLSearchParams(window.location.search); } catch(e) { params = { get: function() { return null; } }; }
          var tgStart = '';
          try {
            var wa = window.Telegram && window.Telegram.WebApp;
            tgStart = (wa && wa.initDataUnsafe && wa.initDataUnsafe.start_param) ? String(wa.initDataUnsafe.start_param) : '';
          } catch(e) {}
          if (!tgStart) {
            var m = (window.location.search || '').match(/[?&](?:tgWebAppStartParam|startapp|start_param)=([^&]+)/);
            if (m && m[1]) tgStart = decodeURIComponent(m[1]);
          }

          var refCode = null;
          if (tgStart && tgStart.indexOf('ref_') === 0) refCode = tgStart;
          var refParam = params.get('ref');
          // VK Mini App: ref может быть в hash (#ref=CODE) т.к. query занят vk_* параметрами
          if (!refParam && window.location.hash) {
            var hashMatch = window.location.hash.match(/[#&]ref=([^&]+)/);
            if (hashMatch) refParam = hashMatch[1];
          }
          if (!refCode && refParam) refCode = 'ref_' + refParam;

          var campCode = null;
          if (tgStart && tgStart.indexOf('camp_') === 0) campCode = tgStart.substring(5);
          if (!campCode) campCode = params.get('campaign') || null;
          // VK Mini App: campaign в hash (#camp=CODE) — query занят vk_* параметрами,
          // зеркально механике #ref= выше. Даёт постовую атрибуцию VK-ссылкам.
          if (!campCode && window.location.hash) {
            var campHash = window.location.hash.match(/[#&]camp=([^&]+)/);
            if (campHash) campCode = decodeURIComponent(campHash[1]);
          }

          // vk_ref: VK САМ присылает вход (catalog/menu/share/feed/im...) в launch params —
          // до 17.07 выбрасывали. Читаем из _vkLaunchParams (HEAD-копия оригинального query,
          // сохранена ДО чистки URL бутстрапом — location.search к этому моменту уже пуст).
          var vkRef = null;
          try {
            var _vkQs = String(window._vkLaunchParams || window.location.search || '');
            if (_vkQs.charAt(0) === '?') _vkQs = _vkQs.slice(1);
            vkRef = new URLSearchParams(_vkQs).get('vk_ref');
          } catch(e) {}

          // Альтернативный надёжный детект VK: окно vk_user_id в URL ставит
          // _isVkMiniApp синхронно в HEAD ещё до запуска IIFE. Используем
          // его как fallback чтобы не зависеть от _appEnv (который мог быть
          // временно 'unknown' в окне между HEAD-инициализацией и runtime-detect).
          var isVk = !!window._isVkMiniApp || window._appEnv === 'vk';
          var isWeb = !isVk && window._appEnv === 'web';

          var sourceType = 'unknown';
          if (params.get('utm_source')) sourceType = 'utm_campaign';
          else if (refCode) sourceType = 'telegram_deeplink';
          else if (tgStart) sourceType = 'telegram';
          else if (isVk) sourceType = 'vk_mini_app';
          else if (isWeb && document.referrer) sourceType = 'web_referral';
          else if (isWeb) sourceType = 'web_direct';
          else sourceType = 'telegram';

          return {
            utm_source: params.get('utm_source') || null,
            utm_medium: params.get('utm_medium') || null,
            utm_campaign: params.get('utm_campaign') || null,
            utm_content: params.get('utm_content') || null,
            utm_term: params.get('utm_term') || null,
            // vk_ref важнее document.referrer: referrer в VK — бесполезное «https://vk.com/»,
            // а vk_ref говорит, ОТКУДА внутри VK открыли (catalog/menu/share/feed).
            referrer: (vkRef ? 'vk_ref:' + vkRef : null) || document.referrer || null,
            ref_code: refCode,
            campaign_code: campCode,
            source_type: sourceType,
            platform: isVk ? 'vk' : isWeb ? 'web' : 'telegram',
            screen_width: window.screen ? window.screen.width : null,
            screen_height: window.screen ? window.screen.height : null,
            language: navigator.language || null,
            user_agent: navigator.userAgent || null
          };
        }

        // --- Определить userId ---
        function resolveUserId() {
          if (_userId) return;
          var found = null;
          try {
            var wa = window.Telegram && window.Telegram.WebApp;
            if (wa && wa.initDataUnsafe && wa.initDataUnsafe.user) {
              found = wa.initDataUnsafe.user.id;
            }
          } catch(e) {}
          if (!found && window._meData && window._meData.telegram_id) {
            found = window._meData.telegram_id;
          }
          if (!found) {
            // Phase 0.3: localStorage сохраняет userId между сессиями (см. /api/me)
            try {
              var stored = localStorage.getItem('yupsoul_user_id');
              if (stored) found = parseInt(stored, 10) || null;
            } catch(e) {}
          }
          if (found) {
            _userId = found;
            // Phase 0.3: ретро-привязка сессии к юзеру (сессия могла быть
            // записана с user_id=null до этого момента — VK/Web case).
            if (typeof window._ysSetUserId === 'function' && window._ysSetUserId !== resolveUserId) {
              try { window._ysSetUserId(found); } catch(e) {}
            }
          }
        }

        // --- Основная функция трекинга ---
        function track(eventType, data) {
          if (!_sid) getOrCreateSession();
          _lastActivity = Date.now();
          try { sessionStorage.setItem('ys_a_la', String(_lastActivity)); } catch(e) {}

          resolveUserId();

          var event = {
            sid: _sid,
            t: eventType,
            ts: new Date().toISOString(),
            p: _currentPage || (document.body && document.body.dataset.page) || null,
            d: data || {}
          };
          if (_userId) event.u = _userId;

          _queue.push(event);
          if (_queue.length > MAX_QUEUE) _queue = _queue.slice(_queue.length - MAX_QUEUE);
        }

        // --- Отправка батча ---
        function flush() {
          if (_flushing || _queue.length === 0) return;
          _flushing = true;

          var batch = _queue.splice(0, MAX_BATCH);
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase) { _flushing = false; return; }

          // Подпись кладём в ТЕЛО: батч уходит через sendBeacon, а он заголовки
          // выставлять не умеет. Сервер её проверяет (_analyticsAuthorUserId),
          // поэтому события больше не приписываются по слову клиента, но и
          // привязка к пользователю не теряется.
          var _aInit = '';
          try { _aInit = (typeof getInitData === 'function' ? getInitData() : '') || ''; } catch(_) {}
          var _aTok = '';
          try { _aTok = window._googleJwt || localStorage.getItem('google_jwt') || ''; } catch(_) {}
          var _aBody = { events: batch, sid: _sid };
          if (_aInit) _aBody.initData = _aInit;
          if (_aTok) _aBody.auth = _aTok;
          var payload = JSON.stringify(_aBody);
          var sent = false;
          if (navigator.sendBeacon) {
            try { sent = navigator.sendBeacon(apiBase + '/api/analytics/events', new Blob([payload], { type: 'application/json' })); } catch(e) {}
          }
          if (!sent) {
            fetch(apiBase + '/api/analytics/events', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: payload, keepalive: true
            }).catch(function() {
              _queue = batch.concat(_queue).slice(0, MAX_QUEUE);
            }).finally(function() { _flushing = false; });
            return;
          }
          _flushing = false;
        }

        function sendSessionInit() {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !_sourceData) return;
          resolveUserId();
          // Phase 0.2: серверный детект платформы — шлём ground-truth headers
          // (X-Vk-Launch-Params, X-Telegram-Init), чтобы сервер мог проверить
          // platform независимо от клиентского _appEnv.
          var headers = { 'Content-Type': 'application/json' };
          try {
            if (window._vkLaunchParams) headers['X-Vk-Launch-Params'] = window._vkLaunchParams;
            var wa = window.Telegram && window.Telegram.WebApp;
            if (wa && wa.initData && wa.initData.length > 10) headers['X-Telegram-Init'] = wa.initData;
            // Веб / ВК / натив ходят по Bearer — без него сервер запишет
            // сессию анонимной (user_id он берёт только из подписи).
            var _sTok = window._googleJwt || localStorage.getItem('google_jwt') || '';
            if (_sTok) headers['Authorization'] = 'Bearer ' + _sTok;
          } catch(e) {}
          try {
            fetch(apiBase + '/api/analytics/session', {
              method: 'POST', headers: headers,
              body: JSON.stringify({ session_id: _sid, source: _sourceData }),
              keepalive: true
            }).catch(function() {});
          } catch(e) {}
        }

        // --- Авто-flush ---
        setInterval(flush, BATCH_INTERVAL);
        window.addEventListener('beforeunload', function() {
          track('session_end', { duration_s: Math.round((_lastActivity - _sessionStart) / 1000), page_exit: _currentPage });
          flush();
        });
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'hidden') flush();
        });

        // --- Перехват goToPage ---
        var _origGoToPage = null;
        function patchGoToPage() {
          if (typeof window.goToPage !== 'function' || _origGoToPage) return;
          _origGoToPage = window.goToPage;
          window.goToPage = function(pageId) {
            var prevPage = _currentPage;
            var timeOnPrev = _pageEnteredAt ? Math.round((Date.now() - _pageEnteredAt) / 1000) : 0;
            _origGoToPage.apply(this, arguments);
            _currentPage = pageId;
            _pageEnteredAt = Date.now();
            track('page_view', { from: prevPage, time_on_prev: timeOnPrev });
          };
        }
        var _patchInt = setInterval(function() {
          if (typeof window.goToPage === 'function') { patchGoToPage(); clearInterval(_patchInt); }
        }, 100);
        setTimeout(function() { clearInterval(_patchInt); }, 10000);

        // --- Трекинг кликов (делегирование) ---
        document.addEventListener('click', function(e) {
          var el = e.target;
          for (var i = 0; i < 5 && el && el !== document.body; i++) {
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.hasAttribute('onclick')) break;
            el = el.parentElement;
          }
          if (!el || el === document.body) return;
          if (el.tagName !== 'BUTTON' && el.tagName !== 'A' && !el.hasAttribute('onclick')) return;

          track('click', {
            el_id: el.id || '',
            el_text: (el.textContent || '').trim().substring(0, 50),
            el_tag: el.tagName,
            el_class: (typeof el.className === 'string') ? el.className.substring(0, 80) : ''
          });
        }, true);

        // --- Трекинг формы ---
        var _formStarted = false;
        var _formSubmitted = false;
        document.addEventListener('focusin', function(e) {
          var page = document.body && document.body.dataset.page;
          if (page !== 'formPage') return;
          var el = e.target;
          if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') return;
          if (!_formStarted) { _formStarted = true; track('form_start', {}); }
          track('form_field_focus', { field_id: el.id || '', field_name: el.name || '' });
        }, true);

        // Отслеживание ухода с формы
        if (typeof MutationObserver !== 'undefined') {
          new MutationObserver(function() {
            var page = document.body && document.body.dataset.page;
            if (page !== 'formPage' && _formStarted) {
              if (!_formSubmitted) track('form_abandon', {});
              _formStarted = false;
              _formSubmitted = false;
            }
          }).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
        }

        // --- Глубина прокрутки ---
        var _scrollMilestones = {};
        function trackScrollDepth() {
          var page = document.body && document.body.dataset.page;
          if (!page) return;
          var scrollEl = document.querySelector('#' + page + ' .page-scroll')
            || document.querySelector('#' + page + ' .profile-scroll')
            || document.querySelector('#' + page);
          if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return;
          var pct = Math.round((scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight)) * 100);
          var key = page;
          if (!_scrollMilestones[key]) _scrollMilestones[key] = {};
          [25, 50, 75, 100].forEach(function(m) {
            if (pct >= m && !_scrollMilestones[key][m]) {
              _scrollMilestones[key][m] = true;
              track('scroll_depth', { depth: m });
            }
          });
        }
        var _scrollTimer;
        document.addEventListener('scroll', function() {
          clearTimeout(_scrollTimer);
          _scrollTimer = setTimeout(trackScrollDepth, 500);
        }, true);

        // --- Ошибки JS ---
        window.addEventListener('error', function(e) {
          track('error', {
            message: (e.message || '').substring(0, 200),
            filename: (e.filename || '').split('/').pop() || '',
            line: e.lineno
          });
        });

        // --- Глобальные хуки ---
        window._ysTrack = track;
        window._ysFlush = flush;
        // Phase 0.3: ретроактивно привязываем существующую сессию к юзеру.
        // VK/Web user_id появляется только после /api/me — сессия к этому
        // моменту уже записана с user_id=null. Шлём update чтобы 3991→7
        // деградация исчезла.
        window._ysSetUserId = function(uid) {
          _userId = uid;
          if (_sid && typeof uid === 'number') {
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            if (apiBase) {
              try {
                // Заголовки авторизации обязательны: сервер берёт user_id
                // только из подписи, поле из тела игнорирует.
                fetch(apiBase + '/api/analytics/session', {
                  method: 'POST',
                  headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})),
                  body: JSON.stringify({ session_id: _sid, update_user: true }),
                  keepalive: true
                }).catch(function() {});
              } catch(e) {}
            }
          }
        };
        window._ysSetPage = function(pageId) { _currentPage = pageId; _pageEnteredAt = Date.now(); };
        window._ysFormSubmitted = function() { _formSubmitted = true; };

        // --- Session heartbeat: обновляет last_activity каждые 60с, только при активности ---
        var _lastHeartbeat = 0;
        setInterval(function() {
          if (!_sid) return;
          var idle = Date.now() - _lastActivity;
          // Только если активен в последние 2 мин И прошло >55с с прошлого heartbeat
          if (idle < 120000 && (Date.now() - _lastHeartbeat) > 55000) {
            _lastHeartbeat = Date.now();
            // Не создаём event — просто обновляем сессию через flush
            if (_sid) {
              try {
                var apiBase = window._apiBase || (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                if (apiBase) fetch(apiBase + '/api/analytics/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_id: _sid, heartbeat: true })
                }).catch(function() {});
              } catch(_) {}
            }
          }
        }, 60000);

        // --- Авто-трекер: referral_conversion при payment_complete ---
        var _origTrack = track;
        track = function(eventType, data) {
          _origTrack(eventType, data);
          if (eventType === 'payment_complete') {
            // Помечаем что оплата прошла (для abandon-трекинга)
            if (typeof _paymentCompleteInSession !== 'undefined') _paymentCompleteInSession = true;
            // Проверяем ref_code из сессии
            try {
              var sessionData = JSON.parse(sessionStorage.getItem('_ys_source') || '{}');
              if (sessionData.ref_code) {
                _origTrack('referral_conversion', { ref_code: sessionData.ref_code, source: (data && data.source) || 'unknown' });
              }
            } catch(_) {}
          }
        };

        // --- Инициализация ---
        getOrCreateSession();
        _currentPage = (document.body && document.body.dataset.page) || 'homePage';
        _pageEnteredAt = Date.now();
        track('page_view', { initial: true });

        // Phase 0.3: ретро-привязка к юзеру для случая когда юзер появляется
        // АСИНХРОННО после старта сессии. Причины: (1) telegram-web-app.js
        // подгружается с CDN async — Telegram.WebApp может быть undefined
        // в первые ~1-3 сек; (2) /api/me для VK/Web возвращает userId с
        // задержкой 200-2000мс. Без этого 99% сессий = user_id=NULL.
        // Опрашиваем 30 раз × 500мс = 15 сек. При успехе — стопаем.
        var _userResolveTries = 0;
        var _userResolveTimer = setInterval(function() {
          _userResolveTries++;
          if (_userId || _userResolveTries >= 30) {
            clearInterval(_userResolveTimer);
            return;
          }
          resolveUserId(); // он сам вызовет _ysSetUserId → retro-update
        }, 500);
      })();
      // ═══════════════ Конец модуля аналитики ═══════════════

      function getInitData() {
        if (window._appEnv === 'web' || window._appEnv === 'vk') return '';
        var current = '';
        try {
          var wa = window.Telegram && window.Telegram.WebApp;
          current = (wa && wa.initData) ? String(wa.initData) : (tg && tg.initData) ? String(tg.initData) : '';
        } catch (e) { current = ''; }
        if (current) {
          try { localStorage.setItem(INIT_DATA_STORAGE_KEY, current); } catch (_) {}
          return current;
        }
        try { return localStorage.getItem(INIT_DATA_STORAGE_KEY) || ''; } catch (_) { return ''; }
      }

      /** Есть ли авторизация. ДОЛЖНО совпадать с getAuthHeaders(): авторизованы, если
       *  есть ЛЮБОЙ креденшл, который реально уйдёт в запрос — initData (X-Telegram-Init)
       *  ИЛИ Bearer (из window._googleJwt ИЛИ localStorage.google_jwt).
       *  Баг (Алла 28.06, Android): старая проверка для TG смотрела ТОЛЬКО initData, для web/vk —
       *  ТОЛЬКО in-memory _googleJwt; а getAuthHeaders шлёт Bearer (в т.ч. из localStorage) и
       *  initData НЕЗАВИСИМО (закалено в Batch 9.41). Рассинхрон давал ложное «Нет авторизации»
       *  при сохранении у активного юзера, у кого /api/me работает по другому креденшлу
       *  (Android WebView: initData пуст/не пойман, но валиден Bearer-токен). Закон №20 — корень,
       *  не текст ошибки. Бэкенд (resolveUserId) остаётся финальным авторитетом и вернёт 401,
       *  если креденшл реально невалиден. */
      function hasAuth() {
        try {
          var h = getAuthHeaders();
          var init = h['X-Telegram-Init'];
          if (init && init.length > 10) return true;
          var auth = h['Authorization'] || '';
          if (auth.indexOf('Bearer ') === 0 && auth.length > 17) return true;
        } catch (_) {}
        return false;
      }
      window.hasAuth = hasAuth;

      // ── Google Sign-In ───────────────────────────────────────────────────
      function handleGoogleSignIn(response) {
        if (!response || !response.credential) return;
        /* Сразу используем Google id_token для быстрого отображения UI */
        window._googleJwt = response.credential;
        try { localStorage.setItem('google_jwt', response.credential); } catch(_) {}
        try {
          var parts = response.credential.split('.');
          var payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
          window._googleUser = {
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
          };
          try { localStorage.setItem('google_user', JSON.stringify(window._googleUser)); } catch(_) {}
        } catch(e) { console.warn('[Google] Ошибка парсинга JWT:', e); }

        console.log('[Google] Авторизация успешна:', window._googleUser && window._googleUser.email);
        onWebAuthReady();

        /* Обмениваем короткоживущий Google id_token на долгоживущий AppToken */
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (apiBase) {
          fetch(apiBase + '/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id_token: response.credential })
          })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d && d.token) {
              console.log('[Google] Получен AppToken, user_id:', d.user_id);
              window._googleJwt = d.token;
              try { localStorage.setItem('google_jwt', d.token); } catch(_) {}
              if (d.user_id) {
                try { localStorage.setItem('yupsoul_user_id', String(d.user_id)); } catch(_) {}
              }
              // Применяем pending_ref СРАЗУ после получения JWT (ключевой момент!)
              try {
                var _pRef = localStorage.getItem('yupsoul_pending_ref');
                if (_pRef) {
                  fetch(apiBase + '/api/referral/apply', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
                    credentials: 'include',
                    body: JSON.stringify({ ref: _pRef })
                  }).then(function(r) { return r.json(); }).then(function(rd) {
                    console.log('[Referral] Applied pending ref after Google auth:', _pRef, rd);
                    localStorage.removeItem('yupsoul_pending_ref');
                  }).catch(function(e) { console.warn('[Referral] pending ref error:', e); });
                }
              } catch(_) {}
              // Загружаем /api/me теперь когда JWT есть
              fetch(apiBase + '/api/me', { method: 'GET', headers: getAuthHeaders(), credentials: 'include' })
                .then(function(r) { return r.json(); })
                .then(function(meData) {
                  if (meData && meData.user) {
                    if (typeof window._handleMeData === 'function') window._handleMeData(meData);
                  }
                }).catch(function() {});
            } else {
              console.warn('[Google] /api/auth/google не вернул token:', d && d.error);
            }
          })
          .catch(function(e) {
            console.warn('[Google] Ошибка обмена токена:', e && e.message);
          });
        }
      }
      window.handleGoogleSignIn = handleGoogleSignIn;
      window.showWebLoginScreen = showWebLoginScreen;

      function onWebAuthReady() {
        if (window._webAuthReadyDone) return;
        window._webAuthReadyDone = true;
        var loginScreen = document.getElementById('webLoginScreen');
        if (loginScreen) loginScreen.style.display = 'none';
        document.querySelectorAll('.page').forEach(function(p) { p.style.visibility = ''; });
        var homePage = document.getElementById('homePage');
        if (homePage) {
          homePage.classList.add('active');
          document.querySelectorAll('.page').forEach(function(p) {
            if (p !== homePage) p.classList.remove('active');
          });
        }
        document.documentElement.classList.remove('web-loading');
        // Гарантируем видимость body (app-ready снимает opacity:0)
        if (document.body) document.body.classList.add('app-ready');
        if (typeof window.startApp === 'function') window.startApp();
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (apiBase && window._googleJwt) {
          fetch(apiBase + '/api/user/sync', {
            method: 'POST',
            headers: getAuthHeaders()
          }).catch(function(){});
          fetch(apiBase + '/api/me', { method: 'GET', headers: getAuthHeaders(), credentials: 'include' })
            .then(function(r) { return r.json(); })
            .then(function(d) {
              // BUG#2 fix: JWT невалидный (сменился секрет) → сбросить сессию и показать логин
              if (d && !d.authenticated && window._googleJwt) {
                console.warn('[Web] JWT невалидный — сброс сессии, показ логин-экрана');
                try { localStorage.removeItem('google_jwt'); localStorage.removeItem('google_user'); } catch(_) {}
                window._googleJwt = null; window._googleUser = null;
                window._webAuthReadyDone = false;
                showWebLoginScreen();
                return;
              }
              if (d && d.authenticated && d.user) {
                var newUserId = String(d.user.userId);
                var prevUserId = null;
                try { prevUserId = localStorage.getItem('yupsoul_user_id'); } catch(_) {}
                // Если сменился пользователь — сбрасываем устаревший баланс
                if (prevUserId && prevUserId !== newUserId) {
                  try { localStorage.removeItem('yupsoul_iskry'); } catch(_) {}
                }
                window.fallbackUserData = { id: d.user.userId, first_name: d.user.displayName || (d.profile && d.profile.name) || '', username: d.user.email || '' };
                try { localStorage.setItem('yupsoul_user_id', newUserId); } catch(_) {}
                // Phase 0.3: ретро-привязка сессии к юзеру для VK/Web case —
                // именно здесь user_id впервые становится доступен (через /api/me).
                if (typeof window._ysSetUserId === 'function') {
                  try { window._ysSetUserId(d.user.userId); } catch(_) {}
                }
              }
              if (d && typeof d.iskry_balance === 'number') {
                if (typeof setIskryBalance === 'function') setIskryBalance(d.iskry_balance);
                if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
              }
              // VK Mini App: consent overlay (§1.1.4 + п. 6.1.2 Типовой политики).
              // Overlay показывается РАНО при старте (см. ранний script выше) — здесь
              // только синхронизируем с бэкендом: если на бэкенде terms уже accepted
              // (например пользователь принял на другом устройстве) — скрываем overlay
              // и сохраняем в localStorage. Если бэкенд говорит false — оставляем
              // показанным до явного клика пользователя.
              if (window._isVkMiniApp && d && d.authenticated) {
                var ov = document.getElementById('vkConsentOverlay');
                if (d.vk_terms_accepted === true) {
                  // Уже принято — отменяем early-показ + скрываем если уже виден
                  window._vkConsentSyncedAccepted = true;
                  if (window._vkConsentEarlyTimer) {
                    clearTimeout(window._vkConsentEarlyTimer);
                    window._vkConsentEarlyTimer = null;
                  }
                  try { localStorage.setItem('vk_terms_accepted', '1'); } catch(_) {}
                  if (ov) { ov.style.display = 'none'; ov.setAttribute('aria-hidden', 'true'); }
                } else if (d.vk_terms_accepted === false) {
                  // Не принято — отменяем 1500мс таймер (если ещё не сработал) +
                  // показываем overlay сразу (без задержки, юзер ждал ответ).
                  if (window._vkConsentEarlyTimer) {
                    clearTimeout(window._vkConsentEarlyTimer);
                    window._vkConsentEarlyTimer = null;
                  }
                  if (ov) { ov.style.display = 'flex'; ov.setAttribute('aria-hidden', 'false'); }
                }
                // Если undefined/null — overlay остаётся в текущем состоянии
              }
            }).catch(function(e){ console.warn('[Web] /api/me error:', e && e.message); });
        }
        adaptUiForWeb();
      }
      // Экспонируем для fallbackToWeb() которая обращается через window.*
      window.onWebAuthReady = onWebAuthReady;
      window.tryRestoreGoogleSession = tryRestoreGoogleSession;

      function adaptUiForWeb() {
        document.body.classList.add('web');
        document.querySelectorAll('.tg-only').forEach(function(el) { el.style.display = 'none'; });
        document.querySelectorAll('.web-only').forEach(function(el) { el.style.display = ''; });
        // Stars — только Telegram, VK Pay — только VK
        var starsBtn = document.getElementById('payOvStarsBtn');
        if (starsBtn) starsBtn.style.display = 'none';
        var planStarsBtn = document.getElementById('planConfirmStarsBtn');
        if (planStarsBtn) planStarsBtn.style.display = 'none';
        // КАНОН v8 (отказ 27.07): голосов на VK нет. payOvVkPayBtn = «Пополнить
        // Искры» (вход на topupPage, где пакеты продаются за ₽ картой) — виден
        // только на денежных поверхностях vk.ru/m.vk.ru; на клиентах iOS/Android
        // платежей нет вовсе. planConfirmVkPayBtn на VK скрыт всегда (ОКи — у OK).
        var isVk = (window._appEnv === 'vk');
        var _vkVotesOk = isVk && !!(window._vkPayMode && window._vkPayMode() === 'money');
        var vkPayBtn = document.getElementById('payOvVkPayBtn');
        if (vkPayBtn) vkPayBtn.style.display = _vkVotesOk ? '' : 'none';
        var planVkPayBtn = document.getElementById('planConfirmVkPayBtn');
        if (planVkPayBtn) planVkPayBtn.style.display = 'none';
        // Партнёрская программа скрыта на VK/OK: она описывает вывод вознаграждения
        // через блокчейн, а модерация площадок такое не пропускает (удаление из каталога VK 24.06).
        // В App Store — та же чистка: ссылки партнёрки ведут на русский лендинг и
        // в Телеграм-бот (для Apple это второй способ оплаты, правило 3.1.1), а
        // вывод вознаграждения через блокчейн читается как операции с криптой.
        var _noCrypto = isVk || window._isOkMiniApp || window._appEnv === 'ok' || window._isNativeApp;
        if (_noCrypto) {
          // Партнёрка — узлы и точки входа.
          ['partnerApplyPage','partnerDashPage','partnerApplyBtn','profilePartnerBadge','helpPartnerSection'].forEach(function(_id){
            var _el = document.getElementById(_id); if (_el) { try { _el.remove(); } catch(_e){} }
          });
          try { document.querySelectorAll('.partner-link, .home-app-menu-btn[data-page="partnerApplyPage"]').forEach(function(_el){ try { _el.remove(); } catch(_e){} }); } catch(_e){}
          try { window.goToPartnerPage = function(){}; } catch(_e){}
          // Экран оплаты: нейтральный текст без упоминания промокода.
          try {
            // §6.12 (отказ 10.07): «промокод» на VK не упоминаем даже в этих текстах
            var _vkIntro = {
              paymentPageIntroOrPay: { ru:'Оплатите кнопкой ниже.', en:'Pay with the button below.', de:'Zahle mit der Schaltfläche unten.', fr:'Paie avec le bouton ci-dessous.' },
              paymentPageIntroAfterSubmit: { ru:'Заявка отправлена. Оплатите кнопкой ниже.', en:'Request submitted. Pay with the button below.', de:'Anfrage gesendet. Zahle mit der Schaltfläche unten.', fr:'Demande envoyée. Paie avec le bouton ci-dessous.' }
            };
            if (typeof LANG !== 'undefined') { for (var _k in _vkIntro) { for (var _l in _vkIntro[_k]) { if (LANG[_l]) LANG[_l][_k] = _vkIntro[_k][_l]; } } }
          } catch(_e){}
        }
        if (isVk) {
          // КАНОН v5 (отказ 22.07): песни = цифровые ценности → §5.4.1 продаются за ДЕНЬГИ
          // только на vk.ru/m.vk.ru. Карта T-Bank (лицензия ЦБ — прямо разрешена
          // «Одобренными способами оплаты») ВИДНА на денежных поверхностях, скрыта на stub.
          var _vkCardOk = window._vkPayMode && window._vkPayMode() === 'money';
          ['planConfirmCardBtn', 'scPayCardBtn', 'payOvCardBtn'].forEach(function(_id) {
            var _el = document.getElementById(_id);
            if (_el) {
              if (_vkCardOk) { _el.style.removeProperty('display'); }
              else { _el.style.setProperty('display', 'none', 'important'); }
            }
          });
          // День Оракула на VK = валюта (30 Искр, эталон 08.07 Таблица В), не карта:
          // quick-buy «24 часа — 199 ₽» скрываем вместе с разделителем «или» над ним.
          var _scQuick = document.getElementById('scQuickBuyDayBtn');
          if (_scQuick) {
            _scQuick.style.setProperty('display', 'none', 'important');
            var _scOr = _scQuick.previousElementSibling;
            if (_scOr && _scOr.getAttribute && _scOr.getAttribute('data-i18n') === 'webLoginOr') _scOr.style.display = 'none';
          }
          // VK: подписок нет (разовые пакеты) — реф-тексты и фичи пакетов не должны говорить
          // «подписка»/«в месяц». Правим словари ДО applyTranslations (аудит эталона 08.07).
          try {
            var _vkSwapKeys = ['profileRefTagline', 'giftsRefTag', 'giftsRefSub', 'helpB5', 'helpB8', 'plBasicF2', 'obConsentBtn', 'consentBonus', 'helpT6', 'helpB6', 'helpB7', 'unlockR2t', 'unlockR2s'];
            // §2.6.2: бонус за согласие на оповещения вне белого списка соц-механик → на VK
            // упоминания «+5 Искр за уведомления» вычищаются (бэк на vk-канале бонус не даёт).
            // §6.12 market-rules (отказ 10.07): промокоды на VK запрещены — вычищаем
            // упоминания из FAQ (helpT6/helpB6/helpB7): заголовок «Оплата и промокоды» →
            // «Оплата», абзацы про ввод промокода удаляются целиком.
            // КАНОН v4 (11.07, §5.2.3): скачивание mp3 на VK убрано — оффер разлочки
            // (unlockR2t/R2s) не должен обещать «Скачать в MP3» (§2.1.3 «не вводить в
            // заблуждение»): заменяем на «песня навсегда в твоём плейлисте» ×4 языка.
            var _vkSwaps = {
              ru: [[/оформляет подписку/g, 'оформляет пакет'], [/за подписку друга/g, 'за пакет друга'], [/Подписка снимает лимит/g, 'Пакет снимает лимит'], [/ вопросов\/мес/g, ' вопросов'], [/ в месяц/g, ''], [/, \+5 за уведомления/g, ''], [/ · \+5 Искр/g, ''], [/\+5 Искр за уведомления/g, 'Только важное — без спама'], [/Оплата и промокоды/g, 'Оплата'], [/<p>Если у тебя есть <strong>промокод<\/strong>[\s\S]*?<\/p>/g, ''], [/<p><strong>Промокод не принимается<\/strong>[\s\S]*?<\/p>/g, ''], [/^Скачать в MP3$/g, 'Песня — в твоём плейлисте'], [/^останется у тебя навсегда$/g, 'слушай в приложении когда угодно']],
              en: [[/gets a subscription/g, 'gets a package'], [/subscription/gi, 'package'], [/ questions\/mo\b/g, ' questions'], [/ a month/g, ''], [/, \+5 for notifications/g, ''], [/ · \+5 Sparks/g, ''], [/\+5 Sparks for notifications/g, 'Only the important — no spam'], [/Payment & promo codes/g, 'Payment'], [/<p>If you have a <strong>promo code<\/strong>[\s\S]*?<\/p>/g, ''], [/<p><strong>Promo code (?:is )?not accepted<\/strong>[\s\S]*?<\/p>/g, ''], [/^Download as MP3$/g, 'Song in your playlist'], [/^yours to keep forever$/g, 'listen in the app anytime']],
              de: [[/ein Abo abschließt/g, 'ein Paket holt'], [/Abos?/g, 'Paket'], [/ Fragen\/Mon\.?/g, ' Fragen'], [/ pro Monat/g, ''], [/, \+5 für Benachrichtigungen/g, ''], [/ · \+5 Funken/g, ''], [/\+5 Funken für Benachrichtigungen/g, 'Nur Wichtiges — kein Spam'], [/Zahlung & Gutscheincodes/g, 'Zahlung'], [/<p>Wenn du einen <strong>Gutscheincode<\/strong>[\s\S]*?<\/p>/g, ''], [/<p><strong>(?:Gutscheincode|Promo-Code) (?:wird )?nicht akzeptiert<\/strong>[\s\S]*?<\/p>/g, ''], [/^Als MP3 laden$/g, 'Song in deiner Playlist'], [/^bleibt für immer bei dir$/g, 'jederzeit in der App hören']],
              fr: [[/prend un abonnement/g, 'prend un pack'], [/abonnement/g, 'pack'], [/ questions\/mois/g, ' questions'], [/ par mois/g, ''], [/, \+5 pour les notifications/g, ''], [/ · \+5 Étincelles/g, ''], [/\+5 Étincelles pour les notifications/g, 'Seulement l’essentiel — sans spam'], [/Paiement & codes promo/g, 'Paiement'], [/<p>Si tu as un <strong>code promo<\/strong>[\s\S]*?<\/p>/g, ''], [/<p><strong>Code promo non accepté<\/strong>[\s\S]*?<\/p>/g, ''], [/^Télécharger en MP3$/g, 'La chanson dans ta playlist'], [/^à toi pour toujours$/g, 'écoute-la dans l’appli à tout moment']]
            };
            if (typeof LANG !== 'undefined') {
              Object.keys(_vkSwaps).forEach(function(_lg) {
                if (!LANG[_lg]) return;
                _vkSwapKeys.forEach(function(_k) {
                  if (typeof LANG[_lg][_k] !== 'string') return;
                  _vkSwaps[_lg].forEach(function(_p) { LANG[_lg][_k] = LANG[_lg][_k].replace(_p[0], _p[1]); });
                });
              });
            }
          } catch(_e){}
        }
        var botStatusSection = document.getElementById('botStatusSection');
        if (botStatusSection) botStatusSection.style.display = 'none';
      }

      function showWebLoginScreen() {
        // ═══ ЗАКОН (Алла 29.06.2026): в Telegram стартовая/login-страница ЗАПРЕЩЕНА ВСЕГДА ═══
        // Физический инвариант против регрессии «в TG открывается стартовая страница»: любой
        // вызов showWebLoginScreen в Telegram-контексте — no-op (остаёмся на главной), кто бы
        // его ни вызвал. См. память feedback_telegram_never_show_login_screen.
        if (window._appEnv === 'telegram' || window._isTgEmbed) {
          console.warn('[guard] showWebLoginScreen заблокирован в Telegram (закон Алла) — login в TG не показываем');
          return;
        }
        // VK/OK: пользователь мини-аппа всегда авторизован подписанными launch params —
        // login-экран на этих платформах запрещён (аудит v5 22.07: путь onWebAuthReady →
        // authenticated:false при протухшем JWT вёл сюда без гарда).
        if (window._isVkMiniApp || window._appEnv === 'vk' || window._isOkMiniApp || window._appEnv === 'ok') {
          console.warn('[guard] showWebLoginScreen заблокирован на VK/OK — авторизация платформенная');
          return;
        }
        if (window._previewMode) return;
        // body видим даже на login screen
        if (document.body) document.body.classList.add('app-ready');
        document.querySelectorAll('.page').forEach(function(p) { p.style.visibility = 'hidden'; });
        var existing = document.getElementById('webLoginScreen');
        if (existing) {
          existing.style.setProperty('display', 'flex', 'important');
          if (window.initWebLoginInteractive) window.initWebLoginInteractive();
          /* Google auth: иконочная кнопка #googleSignInBtn обрабатывает клик → One Tap popup.
             #googleSignInBtnContainer остаётся скрытым — не нужен отдельный GIS render. */
          try { initGoogleButton(); } catch(e) { console.error('[Google] init error:', e); }
          // OAuth кнопки — навесить обработчики если ещё не навешаны
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var vkBtn = document.getElementById('vkAuthBtn');
          if (vkBtn && !vkBtn._bound) {
            vkBtn._bound = true;
            vkBtn.addEventListener('click', function() { window.location.href = apiBase + '/api/auth/vk/redirect'; });
          }
          return;
        }
        var screen = document.createElement('div');
        screen.id = 'webLoginScreen';
        var langCodes = {ru:'RU',en:'EN',de:'DE',fr:'FR'};
        var curCode = langCodes[currentLang] || 'RU';
        screen.innerHTML = '<div class="web-login-bg" aria-hidden="true"><div class="web-login-gradient"></div><div class="web-login-squares"><div class="web-login-square"></div><div class="web-login-square"></div><div class="web-login-square"></div><div class="web-login-square"></div><div class="web-login-square"></div><div class="web-login-square"></div></div></div>' +
          '<div id="startLangSwitcher" class="lang-switcher-compact" style="position:absolute;top:16px;right:16px;z-index:10;" aria-label="Language">' +
          '<button type="button" id="startLangSwitcherBtn" class="home-top-bar-btn lang-switcher-btn header-menu-btn" title="Language">' +
          '<span id="startLangSwitcherIcon" aria-hidden="true"></span>' +
          '<span id="startLangSwitcherCurrent">' + curCode + '</span></button>' +
          '<div id="startLangSwitcherDropdown" class="lang-dropdown" hidden>' +
          '<button type="button" class="lang-opt" data-lang="ru">RU</button>' +
          '<button type="button" class="lang-opt" data-lang="en">EN</button>' +
          '<button type="button" class="lang-opt" data-lang="de">DE</button>' +
          '<button type="button" class="lang-opt" data-lang="fr">FR</button>' +
          '</div></div>' +
          '<div class="web-login-inner"><div class="web-login-glass">' +
          '<p class="web-login-brand">YUPSOUL</p>' +
          '<p class="web-login-subtitle">' + t('homeServiceDesc') + '</p>' +
          '<h1 class="web-login-title">' + t('tagline') + '</h1>' +
          '<p class="web-login-teaser">' + t('webLoginTeaser') + '</p>' +
          '<div class="web-login-cta-wrap"><button type="button" class="vk-glass-btn" id="vkAuthBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:12px 24px;border-radius:12px;border:1px solid rgba(0,119,255,0.3);background:rgba(0,119,255,0.15);color:#fff;font-family:inherit;font-size:0.95rem;font-weight:600;cursor:pointer;width:100%;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all 0.25s;min-height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12.62 21.07C4.54 21.07 0 16.08 0 7H3.73c.16 6.25 3.06 8.9 5.38 9.44V7h3.5v5.39c2.29-.25 4.7-2.88 5.51-5.39h3.5c-.62 3.09-3.23 5.72-5.09 6.72 1.86.79 4.83 3.09 5.97 6.35h-3.86c-.89-2.76-3.1-4.9-6.03-5.19v5.19h-.89z" fill="#fff"/></svg> Войти через VK</button></div>' +
          /* googleSignInBtnContainer убран — Google вход через иконку #googleSignInBtn */
          '<div class="web-login-cta-wrap"><a href="https://t.me/Yup_Soul_bot" target="_blank" rel="noopener" class="vk-glass-btn" id="webLoginTelegramBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:12px 24px;border-radius:12px;border:1px solid rgba(0,136,204,0.3);background:rgba(0,136,204,0.15);color:#fff;font-family:inherit;font-size:0.95rem;font-weight:600;cursor:pointer;width:100%;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all 0.25s;min-height:44px;text-decoration:none;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" fill="#fff"/></svg> ' + t('webLoginTelegram') + '</a></div></div></div>';
        document.body.appendChild(screen);
        // Обработчики кнопок OAuth (кнопки уже в HTML, не зависят от SDK)
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var vkBtn = document.getElementById('vkAuthBtn');
        if (vkBtn) vkBtn.addEventListener('click', function() {
          window.location.href = apiBase + '/api/auth/vk/redirect';
        });
        // Telegram — прямая ссылка на бота с рефералкой из URL ?ref=CODE
        var _tgBotLink = document.getElementById('webLoginTelegramBtn');
        if (_tgBotLink) {
          var _urlRef = (window.location.search.match(/[?&]ref=([^&]+)/) || [])[1];
          if (!_urlRef) { try { _urlRef = (document.cookie.match(/(?:^|;\s*)ys_ref=([^;]+)/) || [])[1]; } catch(e){} }
          if (_urlRef) _tgBotLink.href = 'https://t.me/Yup_Soul_bot?start=ref_' + encodeURIComponent(decodeURIComponent(_urlRef));
        }
        try { initGoogleButton(); } catch(e) { console.error('[Google] initGoogleButton error:', e); }
      }

      function initGoogleButton() {
        /* Инициализирует Google SDK и привязывает обработчик к иконке #googleSignInBtn.
           Контейнер #googleSignInBtnContainer больше не используется — единственная точка входа
           это маленькая иконка в .login-icons-row */
        // VK Mini App: Google SDK не грузится, инициализация запрещена модерацией
        if (window._isVkMiniApp) return;
        var _googleInitialized = false;
        function apiBaseForConfig() {
          var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').trim().replace(/\/$/, '');
          if (base) return base;
          try { return (window.location && window.location.origin) || ''; } catch(e) { return ''; }
        }
        function googleClick() {
          var apiBase = apiBaseForConfig();
          // Серверный redirect — работает мгновенно, в любом браузере, без SDK
          console.log('[Google] server redirect →', apiBase + '/api/auth/google/redirect');
          window.location.href = apiBase + '/api/auth/google/redirect';
        }
        /* Привязать обработчик ко всем иконкам Google на странице */
        function bindGoogleIcons() {
          document.querySelectorAll('#googleSignInBtn').forEach(function(btn) {
            if (btn._gBound) return;
            btn._gBound = true;
            btn.addEventListener('click', googleClick);
          });
        }
        function onSdkReady(clientId) {
          window._googleClientId = clientId;
          if (!_googleInitialized) {
            try {
              google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleSignIn, auto_select: false, cancel_on_tap_outside: true, ux_mode: 'popup' });
              _googleInitialized = true;
            } catch(e) { console.error('[Google] SDK init error:', e); }
          }
          bindGoogleIcons();
        }
        function waitForGoogleSdk(clientId, attempt) {
          if (window.google && window.google.accounts) { onSdkReady(clientId); return; }
          if (attempt >= 50) { /* 15с — SDK не загрузился, иконка всё равно работает через server redirect */
            console.warn('[Google] GSI SDK не загрузился за 15с — иконка использует серверный redirect');
            window._googleClientId = clientId;
            bindGoogleIcons();
            return;
          }
          setTimeout(function() { waitForGoogleSdk(clientId, attempt + 1); }, 300);
        }
        function onConfigReady(cfg) {
          var clientId = (cfg && cfg.google_client_id) ? String(cfg.google_client_id).trim() : '';
          if (!clientId) { console.warn('[Google] GOOGLE_CLIENT_ID не настроен'); bindGoogleIcons(); return; }
          window._googleClientId = clientId;
          if (window.google && window.google.accounts) { onSdkReady(clientId); }
          else { bindGoogleIcons(); waitForGoogleSdk(clientId, 0); }
        }
        function fetchConfigWithRetry(retries) {
          var base = apiBaseForConfig();
          if (!base) { bindGoogleIcons(); return; }
          var cachedCfg = null;
          try { cachedCfg = JSON.parse(sessionStorage.getItem('_apiConfig')); } catch(_) {}
          if (cachedCfg && cachedCfg.google_client_id) { onConfigReady(cachedCfg); return; }
          var configUrl = base + '/api/config';
          var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 15000) : null;
          fetch(configUrl, controller ? { signal: controller.signal } : {})
            .then(function(r) { if (timeoutId) clearTimeout(timeoutId); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function(d) { try { sessionStorage.setItem('_apiConfig', JSON.stringify(d)); } catch(_) {} onConfigReady(d); })
            .catch(function(err) {
              if (timeoutId) clearTimeout(timeoutId);
              console.warn('[Google] /api/config ошибка (попытка ' + (4 - retries) + '):', err && err.message);
              if (retries > 0) { setTimeout(function() { fetchConfigWithRetry(retries - 1); }, 3000); }
              else { bindGoogleIcons(); } /* иконка всё равно работает через server redirect */
            });
        }
        /* Сразу привязываем обработчик (server redirect работает без SDK) и параллельно грузим конфиг */
        bindGoogleIcons();
        fetchConfigWithRetry(3);
      }

      // VK SDK удалён — используем серверный OAuth redirect (кнопка вшита в HTML шаблон)

      function openGoogleOAuthPopup() {
        // Серверный redirect — работает в TikTok WebView, без попапов
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').trim().replace(/\/$/, '');
        if (!apiBase) { try { apiBase = window.location.origin; } catch(e) {} }
        console.log('[Google] Серверный redirect →', apiBase + '/api/auth/google/redirect');
        window.location.href = apiBase + '/api/auth/google/redirect';
        return;
        // Legacy popup code below (не используется)
        var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          return;
        }
        var w = 500, h = 600;
        var left = Math.max(0, (screen.width - w) / 2);
        var top = Math.max(0, (screen.height - h) / 2);
        try {
          var popup = window.open(url, 'googleAuth', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',toolbar=no,menubar=no');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            window.location.href = url;
          }
        } catch(e) {
          window.location.href = url;
        }
      }

      (function handleOAuthHashCallback() {
        var hash = window.location.hash;
        if (!hash || hash.indexOf('id_token=') === -1) return;
        var params = {};
        hash.replace(/^#/, '').split('&').forEach(function(part) {
          var kv = part.split('=');
          if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        });
        if (params.id_token) {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.handleGoogleSignIn({ credential: params.id_token });
              window.close();
              return;
            } catch(_) {}
          }
          history.replaceState(null, '', window.location.pathname + window.location.search);
          handleGoogleSignIn({ credential: params.id_token });
        }
      })();

      function tryRestoreGoogleSession() {
        try {
          var jwt = localStorage.getItem('google_jwt');
          var userStr = localStorage.getItem('google_user');
          if (jwt && userStr) {
            var parts = jwt.split('.');
            if (parts.length === 3) {
              var payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
              var now = Math.floor(Date.now() / 1000);
              // Google JWT имеет exp, наш AppToken тоже (или не имеет — тогда принимаем)
              if (payload.exp && payload.exp < now) {
                // Токен истёк
                localStorage.removeItem('google_jwt');
                localStorage.removeItem('google_user');
                return false;
              }
              window._googleJwt = jwt;
              window._googleUser = JSON.parse(userStr);
              return true;
            }
          }
        } catch(_) {}
        return false;
      }
      function initApp() {
        try {
          console.log('[App] Инициализация приложения');

          // Если auth_token в URL — это OAuth callback, обрабатываем в web-режиме
          // даже если мы в Telegram-браузере (иначе Telegram auth перебьёт OAuth-юзера).
          // VK Testers 09.05.2026: backend отдаёт через fragment (#) для безопасности —
          // проверяем оба источника (hash + search) для backward-compat.
          var _hasAuthTokenInUrl = typeof location !== 'undefined' && (
            (location.search && location.search.indexOf('auth_token=') !== -1) ||
            (location.hash && location.hash.indexOf('auth_token=') !== -1)
          );

      if (window.Telegram && window.Telegram.WebApp && !_hasAuthTokenInUrl) {
            tg = window.Telegram.WebApp;
            var hasTgData = tg.initData && tg.initData.length > 10;
            
            window._appEnv = 'telegram';
            if (document.body) document.body.classList.add('in-telegram');
            document.documentElement.classList.remove('web-loading');
            var _tgLoginEl = document.getElementById('webLoginScreen');
            if (_tgLoginEl) { _tgLoginEl.style.setProperty('display', 'none', 'important'); _tgLoginEl.style.setProperty('pointer-events', 'none', 'important'); }
            // ═══ ЗАКОН (Алла 29.06.2026): в Telegram стартовая/login-страница ЗАПРЕЩЕНА ВСЕГДА ═══
            // (бета+прод, любая кнопка). Сюда попадаем только когда загружен telegram-web-app.js,
            // а он грузится лишь при _isTgEmbed → значит это РЕАЛЬНЫЙ Telegram, не web-юзер.
            // initData на Android/старых клиентах приходит АСИНХРОННО — пока пусто, НЕ показываем
            // login и НЕ уходим в web, а возвращаем false → retryInit вызовет initApp снова.
            // Тяжёлый setup ниже на ретраях не выполняется (запустится один раз, когда данные готовы).
            if (!hasTgData && !(tg.initDataUnsafe && tg.initDataUnsafe.user)) {
              window._tgInitWait = (window._tgInitWait || 0) + 1;
              if (window._tgInitWait <= 24) {
                try { if (tg.ready) tg.ready(); } catch(e) {}
                console.warn('[Telegram] initData ещё пуст — ждём (' + window._tgInitWait + '/24), login НЕ показываем');
                return false;
              }
              // initData так и не пришёл (редкий случай — TG in-app browser) — всё равно остаёмся
              // в Telegram и идём на ГЛАВНУЮ. Стартовую страницу в TG не показываем НИКОГДА.
              console.warn('[Telegram] initData не пришёл после ретраев — остаёмся в TG, главная без login');
            }
            console.log('[Telegram] WebApp обнаружен, initData:', hasTgData ? 'есть' : 'нет', ', версия:', tg.version);

            if (!compareVersion(tg.version, '6.1')) {
                console.warn('[Telegram] Старая версия WebApp (' + tg.version + ')');
            }
            
            if (tg && tg.ready) tg.ready();
            if (tg && tg.expand) tg.expand();
            /* ═══ FIX: Disable vertical swipes to prevent TMA collapse on input focus ═══
               On old TG versions (< 7.7) this method doesn't exist — we handle that below
               with touch event interception on input fields and suggestion dropdowns. */
            if (typeof tg.disableVerticalSwipes === 'function') {
              try { tg.disableVerticalSwipes(); } catch(e) {}
            }
            // Telegram BackButton — навигация назад
            if (tg.BackButton) {
              tg.BackButton.onClick(function() {
                // Защита от ЭХО-back (баг Подарки: открываешь — сразу выкидывает на
                // главную, со 2-го раза ок). Telegram, как и VK, может прислать
                // backButtonClicked сразу после BackButton.show() на навигации —
                // это не настоящий «назад», а эхо перехода. Раньше гард был только
                // в VK-хендлере (_lastNavAt), Telegram-путь его НЕ имел → бета в TG
                // продолжала выкидывать. Зеркалим защиту здесь.
                var now = Date.now();
                if (now - (window._lastBackBtnEvent || 0) < 400) return;
                window._lastBackBtnEvent = now;
                if (now - (window._lastNavAt || 0) < 1500) {
                  if (typeof console !== 'undefined') console.log('[TG back] ignored — page just changed (echo)');
                  return;
                }
                if (typeof goBack === 'function') {
                  goBack();
                } else if (typeof window.goBack === 'function') {
                  window.goBack();
                } else {
                  goToPage('homePage');
                }
              });
            }
            try {
              if (tg.setHeaderColor) tg.setHeaderColor('#08071a');
              if (tg.setBackgroundColor) tg.setBackgroundColor('#08071a');
            } catch(e) {}
            try {
              var _u = tg.initDataUnsafe && tg.initDataUnsafe.user;
              if (_u && _u.photo_url) localStorage.setItem('tg_photo_url', _u.photo_url);
              if (_u && _u.id) localStorage.setItem('tg_user_id', String(_u.id));
            } catch(e) {}
            if (hasTgData) {
              try {
                var _initD = tg.initData;
                if (_initD) {
                  var _base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                  fetch(_base + '/api/user/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init': _initD }
                  }).catch(function(){});
                  // Загрузка баланса Искр при старте — ждём готовности функций
                  (function loadTgIskry() {
                    var _b = _base, _i = _initD;
                    function doFetch() {
                      fetch(_b + '/api/me', {
                        method: 'GET',
                        headers: { 'X-Telegram-Init': _i }
                      }).then(function(r) { return r.json(); })
                        .then(function(d) {
                          if (d && typeof d.iskry_balance === 'number') {
                            localStorage.setItem('yupsoul_iskry', String(Math.round(d.iskry_balance)));
                            if (typeof setIskryBalance === 'function') {
                              setIskryBalance(d.iskry_balance);
                            } else {
                              // Функция ещё не определена — обновим DOM напрямую
                              document.querySelectorAll('[data-iskry-balance]').forEach(function(el) {
                                var t = el.getAttribute('data-iskry-title') || (typeof window.t === 'function' ? window.t('iskryUnit') : 'Искр');
                                el.textContent = Math.round(d.iskry_balance) + ' ' + t;
                              });
                            }
                            if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
                          }
                        }).catch(function(e) { console.warn('[TG] /api/me error:', e && e.message); });
                    }
                    if (document.readyState === 'complete' || document.readyState === 'interactive') {
                      doFetch();
                    } else {
                      document.addEventListener('DOMContentLoaded', doFetch);
                    }
                  })();
                }
              } catch(e) {}
            }
            if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
            getInitData();
            
            if ((!tg.initData || tg.initData.length < 10) && tg.initDataUnsafe && tg.initDataUnsafe.user) {
              window.fallbackUserData = {
                id: tg.initDataUnsafe.user.id,
                first_name: tg.initDataUnsafe.user.first_name,
                username: tg.initDataUnsafe.user.username
              };
            }
            // BUG#3 (in-app browser → showWebLoginScreen) УДАЛЁН 29.06.2026 — давал регрессию
            // «в Telegram открывается стартовая страница» (закон Алла). Ожидание initData теперь
            // в ретрай-гейте выше; в Telegram login не показывается НИКОГДА — всегда главная.
            return true;
          }

          // SDK ещё не загрузился, но мы в Telegram — ждём (retry)
          // НО если auth_token в URL — не ждём, сразу в web-режим (OAuth callback)
          if (window._isTgEmbed && !_hasAuthTokenInUrl) {
            console.log('[App] Telegram среда, SDK ещё не загружен — retry');
            return false;
          }

          // ── VK Mini App: авторизация через launch params ──────────────────
          if (window._isVkMiniApp && window._vkLaunchParams) {
            window._appEnv = 'vk';
            document.documentElement.classList.remove('web-loading');
            if (document.body) { document.body.classList.add('web-standalone'); document.body.classList.add('in-vk'); }
            // Адаптируем UI под VK СРАЗУ — не дожидаясь backend auth.
            // adaptUiForWeb() внутренне детектит _appEnv === 'vk' и:
            //  (а) скрывает Stars/Google/Telegram элементы
            //  (б) показывает VK Pay кнопки
            //  (в) если _vkIsMobileClient — скрывает T-Bank и крипту (правила VK §5.4.1)
            try { adaptUiForWeb(); } catch(e) { console.warn('[VK] adaptUiForWeb error:', e); }
            // VK: обработка кнопки "назад" платформы
            if (window.vkBridge) {
              // Batch 9.35 (отчёт 7264413 MacOS): после reload → переход на
              // myTracksPage → через ~2 сек возврат на homePage. Корень:
              // VK desktop client генерирует VKWebAppBackButtonPressed
              // events автоматически (свайп / системный keybind / другие
              // источники), не только user-gesture. Раньше handler сразу
              // вызывал goBack/goToPage('homePage') без throttling.
              // Фикс: 1) Игнорируем событие если страница только что
              // изменилась (< 1500мс назад — pendingPage не финализирован).
              // 2) Игнорируем сразу после reload (< 2500мс от load).
              window._lastBackBtnEvent = 0;
              window._appReadyAt = Date.now();
              // Трекер реального жеста пользователя (свайп-edge = touchstart, keybind = keydown,
              // тап = pointerdown). Нужен чтобы отличить НАСТОЯЩИЙ «назад» от СПОНТАННОГО
              // VK-back (VK авто-генерирует его БЕЗ жеста) — см. гард №2 ниже.
              window._lastUserGesture = window._lastUserGesture || 0;
              ['pointerdown','touchstart','keydown'].forEach(function(_ev){
                try { document.addEventListener(_ev, function(){ window._lastUserGesture = Date.now(); }, { capture: true, passive: true }); } catch(_) {}
              });
              vkBridge.subscribe(function(event) {
                if (event.detail && event.detail.type === 'VKWebAppViewHide') return;
                if (event.detail && event.detail.type === 'VKWebAppBackButtonPressed') {
                  var now = Date.now();
                  // Защита от двойных events
                  if (now - window._lastBackBtnEvent < 400) return;
                  window._lastBackBtnEvent = now;
                  // Защита: первые 2.5 сек после reload игнорируем
                  // спонтанные back events от VK init
                  if (now - window._appReadyAt < 2500) {
                    console.log('[VK back] ignored — too soon after reload');
                    return;
                  }
                  // Защита (баг 9.35 + Подарки 12.06 + Профиль 21.06 бета VK): VK генерирует
                  // спонтанные back-события (свайп/системно/инициализация). ДВА слоя:
                  var _sinceNav = now - (window._lastNavAt || 0);
                  var _sinceGesture = now - (window._lastUserGesture || 0);
                  // 1) ЭХО навигации — первые 3с после перехода всегда игнор.
                  if (_sinceNav < 3000) {
                    console.log('[VK back] ignored — page just changed (echo)');
                    return;
                  }
                  // 2) СПОНТАННЫЙ back: в окне до 7с после перехода БЕЗ реального жеста
                  //    пользователя за последние 1.5с — это авто-back VK, не «назад».
                  //    Реальный «назад» (свайп-edge=touch, keybind=keydown) обновляет
                  //    _lastUserGesture → _sinceGesture мал → НЕ игнорим (профиль больше
                  //    не выкидывает на главную с первого раза, со 2-го раза тоже ок).
                  if (_sinceNav < 7000 && _sinceGesture > 1500) {
                    console.log('[VK back] ignored — spontaneous (no gesture, sinceNav=' + _sinceNav + 'ms)');
                    return;
                  }
                  // Защита: если активная страница ещё в начальной загрузке
                  // (skeleton state), игнорируем — пусть юзер дождётся.
                  var active = document.querySelector('.page.active');
                  if (active && (active.dataset.loading === 'true' ||
                                 active.querySelector('.skeleton:not([style*="display: none"])'))) {
                    console.log('[VK back] ignored — page still loading');
                    return;
                  }
                  // Тур/онбординг открыт (оверлеи #tour* поверх .page) — VK-back НЕ должен
                  // навигировать подложку: иначе оверлей застревает над сменившейся страницей
                  // и тур не продолжить (Алла 21.06, бета VK: «после retain экран завис, не пройти дальше»).
                  var _tourOpen = ['tourWelcome','tourOverlay','tourRetain','tourReward'].some(function(id){
                    var el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none';
                  });
                  if (_tourOpen) { console.log('[VK back] ignored — tour overlay open'); return; }
                  var backBtn = document.querySelector('.page.active .header-back-btn, .page.active [onclick*="goBack"], .page.active [onclick*="goToPage"]');
                  if (backBtn) backBtn.click();
                  else if (typeof goToPage === 'function') goToPage('homePage');
                }
              });
              // Включаем кнопку "назад" в VK
              vkBridge.send('VKWebAppEnableSwipeBack').catch(function(){});
            }
            var _vkLoginEl = document.getElementById('webLoginScreen');
            if (_vkLoginEl) { _vkLoginEl.style.setProperty('display', 'none', 'important'); _vkLoginEl.style.setProperty('pointer-events', 'none', 'important'); }
            console.log('[VK Mini App] Определена VK-среда, launch params:', window._vkLaunchParams.substring(0, 80) + '...');

            // Получить информацию о пользователе через VK Bridge
            var vkUserInfo = null;
            (function vkAuth() {
              var launchParams = window._vkLaunchParams;
              var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');

              var _vkAuthAttempt = 0;
              function doVkAuth(userInfo) {
                if (userInfo && userInfo.photo_200) {
                  try {
                    window._vkUserPhoto = userInfo.photo_200;
                    localStorage.setItem('vk_photo_url', userInfo.photo_200);
                  } catch (_) {}
                }
                function _tryVkAuth() {
                  fetch(base + '/api/auth/vk/mini-app', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ launch_params: launchParams, user_info: userInfo || null })
                  }).then(function(r) { return r.json(); })
                    .then(function(d) {
                      if (d && d.token) {
                        console.log('[VK Mini App] Авторизация успешна, userId:', d.user_id);
                        window._googleJwt = d.token;
                        try { localStorage.setItem('google_jwt', d.token); } catch(_) {}
                        // Серверный статус онбординга — ДО onWebAuthReady/startApp, чтобы
                        // решение о карусели принималось по нему (модерация ВК 11.08).
                        if (typeof d.onboarding_seen === 'boolean') window._obSeenServer = d.onboarding_seen;
                        var vkUser = { sub: String(d.user_id), email: '', name: (userInfo && userInfo.first_name) || 'VK User', provider: 'vk' };
                        if (userInfo && userInfo.photo_200) vkUser.picture = userInfo.photo_200;
                        try { localStorage.setItem('google_user', JSON.stringify(vkUser)); } catch(_) {}
                        window._googleUser = vkUser;
                        if (typeof onWebAuthReady === 'function') onWebAuthReady();
                      } else {
                        _vkAuthAttempt++;
                        if (_vkAuthAttempt < 4) {
                          console.warn('[VK Mini App] Авторизация не удалась, retry', _vkAuthAttempt);
                          setTimeout(_tryVkAuth, Math.min(20000, 1500 * Math.pow(1.7, _vkAuthAttempt)));
                        } else {
                          console.error('[VK Mini App] Авторизация не удалась после', _vkAuthAttempt, 'попыток');
                        }
                      }
                    }).catch(function(e) {
                      _vkAuthAttempt++;
                      if (_vkAuthAttempt < 4) {
                        console.warn('[VK Mini App] Сетевая ошибка, retry', _vkAuthAttempt, e && e.message);
                        setTimeout(_tryVkAuth, Math.min(20000, 1500 * Math.pow(1.7, _vkAuthAttempt)));
                      } else {
                        console.error('[VK Mini App] Сетевая ошибка после', _vkAuthAttempt, 'попыток');
                      }
                    });
                }
                _tryVkAuth();
              }

              // Попробовать получить user info через VK Bridge
              if (window.vkBridge) {
                vkBridge.send('VKWebAppGetUserInfo')
                  .then(function(info) {
                    console.log('[VK Mini App] User info:', info.first_name, info.last_name);
                    doVkAuth(info);
                  })
                  .catch(function(e) {
                    console.warn('[VK Mini App] VKWebAppGetUserInfo failed:', e);
                    doVkAuth(null);
                  });
              } else {
                doVkAuth(null);
              }
            })();
            return true;
          }

          // ── OK (Одноклассники): VK Mini App через мост — среда 'ok', вход теми же vk_* params ──
          // Бутстрап при OK-маркерах (vk_client=ok / logged_user_id) НЕ включает VK-режим и кладёт
          // подписанные параметры в _okVkLaunchParams. Здесь: env='ok', чистка методов, авто-вход.
          if (window._isOkMiniApp === true) {
            window._appEnv = 'ok';
            if (window._bootBeacon) window._bootBeacon('ok_branch', { lp: !!window._okVkLaunchParams });
            document.documentElement.classList.remove('web-loading');
            if (document.body) { document.body.classList.add('web-standalone'); document.body.classList.add('in-ok'); }
            // Чистка: крипта/партнёрка удаляются (_noCrypto ловит OK), Stars и VK Pay скрыты (isVk=false),
            // карта T-Bank остаётся — модель OK «как web» (решение Аллы после отказа OK 02.07).
            try { adaptUiForWeb(); } catch(e) { console.warn('[OK] adaptUiForWeb error:', e); }
            var _okLoginEl = document.getElementById('webLoginScreen');
            if (_okLoginEl) { _okLoginEl.style.setProperty('display', 'none', 'important'); _okLoginEl.style.setProperty('pointer-events', 'none', 'important'); }
            // Авто-вход: OK-запуск несёт те же ПОДПИСАННЫЕ vk_*-параметры (vk_client=ok) → существующий
            // /api/auth/vk/mini-app (verifyVkLaunchParams, HMAC). Без vk_*/sign — гостевой режим (fail-closed).
            (function okAuth() {
              var lp = window._okVkLaunchParams || ((location.search || '').charAt(0) === '?' ? location.search.slice(1) : (location.search || ''));
              if (lp.indexOf('vk_user_id=') === -1 || lp.indexOf('sign=') === -1) {
                console.warn('[OK] запуск без подписанных vk_*-параметров — гостевой режим');
                return;
              }
              var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              var _okAttempt = 0;
              function _tryOkAuth(userInfo) {
                fetch(base + '/api/auth/vk/mini-app', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ launch_params: lp, user_info: userInfo || null })
                }).then(function(r) { return r.json(); })
                  .then(function(d) {
                    if (d && d.token) {
                      console.log('[OK] Авторизация успешна, userId:', d.user_id);
                      window._googleJwt = d.token;
                      try { localStorage.setItem('google_jwt', d.token); } catch(_) {}
                      if (typeof d.onboarding_seen === 'boolean') window._obSeenServer = d.onboarding_seen;
                      var okUser = { sub: String(d.user_id), email: '', name: (userInfo && userInfo.first_name) || 'OK User', provider: 'vk' };
                      if (userInfo && userInfo.photo_200) okUser.picture = userInfo.photo_200;
                      try { localStorage.setItem('google_user', JSON.stringify(okUser)); } catch(_) {}
                      window._googleUser = okUser;
                      if (typeof onWebAuthReady === 'function') onWebAuthReady();
                    } else {
                      _okAttempt++;
                      if (_okAttempt < 4) setTimeout(function(){ _tryOkAuth(userInfo); }, Math.min(20000, 1500 * Math.pow(1.7, _okAttempt)));
                      else console.error('[OK] Авторизация не удалась после', _okAttempt, 'попыток (подпись launch params?)');
                    }
                  }).catch(function(e) {
                    _okAttempt++;
                    if (_okAttempt < 4) setTimeout(function(){ _tryOkAuth(userInfo); }, Math.min(20000, 1500 * Math.pow(1.7, _okAttempt)));
                    else console.error('[OK] Сетевая ошибка авторизации:', e && e.message);
                  });
              }
              if (window.vkBridge && typeof vkBridge.send === 'function') {
                // Имя и аватар — украшение, токен важнее. Мост ОК может не ответить
                // на VKWebAppGetUserInfo вовсе (ни then, ни catch) — тогда без гонки
                // с таймером авторизация не стартует никогда, и оплата картой падает
                // в 401 «Не удалось определить пользователя». Тот же класс, что отказ
                // ОК 03.08: ожидание без таймаута = молча неработающая оплата.
                var _okInfoDone = false;
                var _okGo = function(info) { if (_okInfoDone) return; _okInfoDone = true; _tryOkAuth(info); };
                setTimeout(function() { _okGo(null); }, 3000);
                vkBridge.send('VKWebAppGetUserInfo')
                  .then(function(info) { _okGo(info); })
                  .catch(function() { _okGo(null); });
              } else { _tryOkAuth(null); }
            })();
            return true;
          }

          // ── Нативный клиент экосистемы (OK/VK app): мост есть, но синхронный URL-детект площадку НЕ дал.
          // Причина отказа OK-модерации 09.07 «не запускается на Android/iOS»: на нативном OK-клиенте
          // параметры запуска приходят через VKWebAppGetLaunchParams (НЕ в location.search) → синхронный
          // детект в бутстрапе проваливался → приложение уходило в web-fallback (белый экран + чужой
          // VK/TG-login, что в ОК запрещено). Фикс: дёргаем мост, определяем площадку по vk_client/vk_platform.
          var _nativeBridge = !!(window.AndroidBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.VKWebAppClose));
          if (_nativeBridge && !window._nativeLpTried && window.vkBridge && typeof window.vkBridge.send === 'function') {
            window._nativeLpTried = true;
            var _nativeGiveUp = function() { document.documentElement.classList.remove('web-loading'); };
            if (window._bootBeacon) window._bootBeacon('native_bridge');
            // ОК-намёк по среде: UA нативного клиента ОК / referrer ok.ru. Нужен для фолбэка,
            // когда мост есть, но VKWebAppGetLaunchParams молчит (отказ ОК 17.08: Android-клиент
            // «не запускается» — промис без ответа держал шторку web-loading вечно).
            var _okEnvHint = function() {
              var u = String(navigator.userAgent || '').toLowerCase();
              if (u.indexOf('okandroid') !== -1 || u.indexOf('okios') !== -1 || u.indexOf('odnoklassniki') !== -1 || u.indexOf('okapp') !== -1) return true;
              return /(^|\.)ok\.ru(\/|$)/i.test(String(document.referrer || '').replace(/^https?:\/\//, ''));
            };
            var _lpSettled = false;
            var _lpFinish = function(fn) {
              if (_lpSettled) return;
              _lpSettled = true;
              try { clearTimeout(_lpTimer); } catch(_) {}
              fn();
            };
            var _lpTimer = setTimeout(function() {
              _lpFinish(function() {
                if (window._bootBeacon) window._bootBeacon('launchparams_timeout');
                if (_okEnvHint()) {
                  // Среда ОК без параметров запуска: открываем ОК-режим гостем (fail-closed вход),
                  // вместо вечной шторки — приложение хотя бы запускается.
                  window._isOkMiniApp = true;
                  document.documentElement.classList.add('is-ok');
                  try { initApp(); } catch(_e) { _nativeGiveUp(); }
                } else { _nativeGiveUp(); }
              });
            }, 4000);
            window.vkBridge.send('VKWebAppGetLaunchParams').then(function(p) { _lpFinish(function() {
              if (!p || typeof p !== 'object') { _nativeGiveUp(); return; }
              var _client = String(p.vk_client || '').toLowerCase();
              var _platform = String(p.vk_platform || '').toLowerCase();
              var _qs = Object.keys(p).filter(function(k){ return k.indexOf('vk_') === 0 || k === 'sign'; })
                .map(function(k){ return k + '=' + encodeURIComponent(p[k]); }).join('&');
              if (window._bootBeacon) window._bootBeacon('launchparams_ok', { client: _client, platform: _platform });
              // Тема с точных параметров моста: на нативе URL пуст, бутстрап угадывал по
              // системной теме телефона. Если VK прислал vk_appearance — применяем и кэшируем,
              // чтобы перекраска не ждала VKWebAppUpdateConfig (отказ ВК 24.08 «экран моргает»).
              if (p.vk_appearance === 'dark' || p.vk_appearance === 'light') {
                try { localStorage.setItem('vk_theme_cache', p.vk_appearance); } catch(_) {}
                var _noUserPref = true;
                try { _noUserPref = !localStorage.getItem('yupsoul_theme_pref'); } catch(_) {}
                if (_noUserPref) { try { if (typeof applyTheme === 'function') applyTheme(p.vk_appearance); } catch(_) {} }
              }
              if (_client === 'ok' || _platform.indexOf('ok') !== -1) {
                window._isOkMiniApp = true; window._okVkLaunchParams = _qs;
                document.documentElement.classList.add('is-ok');
              } else if (p.vk_user_id != null) {
                window._isVkMiniApp = true; window._vkLaunchParams = _qs; window._vkPlatform = _platform;
                window._vkIsMobileClient = (_platform === 'mobile_android' || _platform === 'mobile_iphone');
                document.documentElement.classList.add('is-vk');
                if (window._vkIsMobileClient) document.documentElement.classList.add('is-vk-mobile');
                // Платёжный гейт §5.4.1 (канон v5): money = только vk.ru/m.vk.ru; мост/натив → 'stub'
                document.documentElement.classList.add((window._vkPayMode && window._vkPayMode() === 'money') ? 'is-vk-pay' : 'is-vk-stub');
                // Оракул-only на нативе VK (см. _vkSongsOff в bootstrap)
                if (window._vkSongsOff && window._vkSongsOff()) document.documentElement.classList.add('is-vk-oracle');
                if (window._vkVotesMode && window._vkVotesMode()) document.documentElement.classList.add('is-vk-votes');
                if (document.body) {
                  document.body.classList.add('in-vk');
                  if (window._vkIsMobileClient) document.body.classList.add('in-vk-mobile');
                  document.body.classList.add((window._vkPayMode && window._vkPayMode() === 'money') ? 'in-vk-pay' : 'in-vk-stub');
                  if (window._vkSongsOff && window._vkSongsOff()) document.body.classList.add('in-vk-oracle');
                  if (window._vkVotesMode && window._vkVotesMode()) document.body.classList.add('in-vk-votes');
                }
              } else { _nativeGiveUp(); return; }
              try { initApp(); } catch(_e) { _nativeGiveUp(); } // переинициализация: пойдёт в OK/VK-ветку выше
            }); }).catch(function() { _lpFinish(_nativeGiveUp); });
            return true; // ждём ответ моста — НЕ уходим в web-fallback (иначе белый экран/чужой login)
          }

          // ОК-клиент без моста и без параметров запуска (referrer у нативного WebView часто пуст):
          // распознаём по UA и открываем ОК-режим гостем — иначе человек в ОК увидел бы чужой
          // VK/TG-login (запрещено правилами площадки) или зависшую шторку. Отказ ОК 17.08.
          if (window._isOkMiniApp !== true) {
            var _uaOkNoBridge = String(navigator.userAgent || '').toLowerCase();
            if (_uaOkNoBridge.indexOf('okandroid') !== -1 || _uaOkNoBridge.indexOf('okios') !== -1 || _uaOkNoBridge.indexOf('odnoklassniki') !== -1 || _uaOkNoBridge.indexOf('okapp') !== -1) {
              if (window._bootBeacon) window._bootBeacon('ok_ua_no_bridge');
              window._isOkMiniApp = true;
              document.documentElement.classList.add('is-ok');
              try { initApp(); return true; } catch(_e) {} // перезаход уйдёт в ОК-ветку выше
            }
          }

          // Не Telegram и не VK — переходим в веб-режим (страховка: OK не затираем)
          window._appEnv = (window._isOkMiniApp === true) ? 'ok' : 'web';
          if (window._bootBeacon && _nativeBridge) window._bootBeacon('web_fallback_with_bridge');
          if (document.body) document.body.classList.add('web-standalone');
          if (typeof location !== 'undefined' && location.search && location.search.indexOf('preview=1') !== -1) {
            window._previewMode = true;
          }
          console.log('[Web] Запуск в веб-режиме (Google Auth)' + (window._previewMode ? ', превью' : ''));

          // Проверить auth_token из URL (VK/OAuth callback redirect)
          // Security (VK Testers 09.05.2026): backend теперь отдаёт через fragment (#) вместо ?
          // Fragment не уходит в server logs / Referer / browser history.
          // Backward-compat: поддерживаем оба варианта (старые ссылки могут быть в кэше).
          var _hashStr = (location.hash || '').replace(/^#/, '');
          var _searchStr = (location.search || '').replace(/^\?/, '');
          var _urlAuthToken = (_hashStr.match(/(?:^|&)auth_token=([^&]+)/) || _searchStr.match(/(?:^|&)auth_token=([^&]+)/) || [])[1];
          var _urlProvider = (_hashStr.match(/(?:^|&)provider=([^&]+)/) || _searchStr.match(/(?:^|&)provider=([^&]+)/) || [])[1];
          if (_urlAuthToken) {
            try {
              var _tok = decodeURIComponent(_urlAuthToken);
              if (_tok.length > 20) {
                console.log('[Auth] Найден auth_token в URL, provider:', _urlProvider || 'unknown');
                window._googleJwt = _tok;
                localStorage.setItem('google_jwt', _tok);
                // Создать google_user для tryRestoreGoogleSession
                var _oauthUser = { sub: 'oauth_user', email: '', name: 'Пользователь', provider: _urlProvider || 'oauth' };
                try {
                  var _tp = _tok.split('.');
                  if (_tp.length === 3) {
                    var _tpl = JSON.parse(atob(_tp[1].replace(/-/g,'+').replace(/_/g,'/')));
                    if (_tpl.user_id) _oauthUser.sub = String(_tpl.user_id);
                    if (_tpl.name) _oauthUser.name = _tpl.name;
                    if (_tpl.email) _oauthUser.email = _tpl.email;
                  }
                } catch(_) {}
                localStorage.setItem('google_user', JSON.stringify(_oauthUser));
                window._googleUser = _oauthUser;
                // Убрать token из URL — и из hash (#) и из search (?) для backward-compat
                try {
                  var cleanSearch = (location.search || '').replace(/[?&]auth_token=[^&]+/, '').replace(/[?&]provider=[^&]+/, '').replace(/^\?$/, '');
                  history.replaceState(null, '', location.pathname + cleanSearch);
                } catch(_) {}
                console.log('[Auth] Токен применён, вызываю onWebAuthReady');
                onWebAuthReady();
                return true;
              }
            } catch(_e) { console.error('[Auth] Ошибка парсинга auth_token:', _e); }
          }

          if (tryRestoreGoogleSession()) {
            console.log('[Web] Восстановлена Google-сессия:', window._googleUser && window._googleUser.email);
            onWebAuthReady();
            return true;
          }

          if (!window._previewMode) showWebLoginScreen();
          return true;
        } catch (e) { 
          console.error('[App] Ошибка инициализации:', e);
        }
        return false;
      }
      if (!initApp()) {
        // ═══ Холодный старт: перезагрузка профиля когда авторизация наконец готова ═══
        // На Telegram (Android / первое открытие) initData приходит АСИНХРОННО. Профиль
        // (loadMe в 05-*) грузится один раз при парсинге модулей — если это случилось ДО
        // прихода initData, /api/me ушёл без авторизации → вернулся пустой/гостевой профиль
        // и закэшировался в _loadMePromise. Ничто его не перезагружало → "базы не подгружены"
        // (пустой баланс/партнёрка/тариф) до перезахода. Фикс (законы №36/№37): когда вход
        // готов (успех retryInit / fallback-retry) — ОДИН раз перезагружаем профиль с валидной
        // авторизацией и обновляем видимые данные, чтобы не заставлять пользователя перезаходить.
        function _reloadProfileAfterAuthReady() {
          if (window._coldStartProfileReloaded) return;
          window._coldStartProfileReloaded = true;
          try {
            if (typeof loadMe === 'function') {
              var _p = loadMe();
              if (_p && _p.then) _p.then(function() {
                try { if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays(); } catch(_) {}
                // Если уже открыт экран, зависящий от профиля (партнёрский кабинет/заявка) —
                // мягко пере-роутим, чтобы подхватить реальный статус вместо пустого.
                try {
                  var _ap = document.querySelector('.page.active');
                  if (_ap && (_ap.id === 'partnerDashPage' || _ap.id === 'partnerApplyPage') &&
                      typeof window.goToPartnerPage === 'function') {
                    window.goToPartnerPage();
                  }
                } catch(_) {}
              });
            }
            if (typeof loadTgIskry === 'function') { try { loadTgIskry(); } catch(_) {} }
          } catch(_) {}
        }
        function fallbackToWeb() {
          if (window._appEnv === 'telegram' || window.tg) return;
          if (window._isTgEmbed || (window.Telegram && window.Telegram.WebApp)) {
            console.warn('[App] Telegram detected at fallback — retrying init');
            if (initApp()) { _reloadProfileAfterAuthReady(); return; }
            attempts = 0; maxAttempts = 20;
            setTimeout(retryInit, 300);
            return;
          }
          window._appEnv = (window._isOkMiniApp === true) ? 'ok' : 'web'; // OK не затираем «вебом»
          if (document.body) document.body.classList.add('web-standalone');
          if (typeof location !== 'undefined' && location.search && location.search.indexOf('preview=1') !== -1) {
            window._previewMode = true;
          }
          if (window._previewMode && window.startApp) {
            window.startApp();
          } else if (window.tryRestoreGoogleSession && window.tryRestoreGoogleSession()) {
            if (window.onWebAuthReady) window.onWebAuthReady();
          } else if (window.showWebLoginScreen) {
            window.showWebLoginScreen();
          }
        }
        var attempts = 0;
        var maxAttempts = window._isTgEmbed ? 30 : 15;
        function retryInit() {
          attempts++;
          if (initApp()) {
            if (typeof window.startApp === 'function') window.startApp();
            _reloadProfileAfterAuthReady();
            return;
          }
          if (attempts >= maxAttempts) { fallbackToWeb(); return; }
          var delay = attempts < 3 ? 100 : (attempts < 10 ? 300 : 500);
          setTimeout(retryInit, delay);
        }
        setTimeout(retryInit, 100);
      }
      document.addEventListener('DOMContentLoaded', function syncAppEnvBodyClass() {
        if (!document.body) return;
        if (window._appEnv === 'telegram' && !document.body.classList.contains('in-telegram')) document.body.classList.add('in-telegram');
        if (window._appEnv === 'web' && !document.body.classList.contains('web-standalone')) document.body.classList.add('web-standalone');
        if (typeof initWelcomeIskry === 'function') initWelcomeIskry();
      });

      /* ═══ ADAPTATION: visualViewport keyboard handler ═══
         When virtual keyboard opens on mobile, the viewport shrinks.
         We use CSS custom property --keyboard-height to let pages adjust.
         NOTE: scrollIntoView is NOT used here — it can trigger TMA collapse on Android. */
      (function initKeyboardHandler() {
        if (!window.visualViewport) return;
        var last = 0;
        function onViewportResize() {
          var kbHeight = Math.round(window.innerHeight - window.visualViewport.height);
          if (kbHeight === last) return;
          last = kbHeight;
          document.documentElement.style.setProperty('--keyboard-height', kbHeight + 'px');
          if (kbHeight > 50) {
            document.documentElement.classList.add('keyboard-open');
          } else {
            document.documentElement.classList.remove('keyboard-open');
          }
        }
        window.visualViewport.addEventListener('resize', onViewportResize);
      })();

      /* ═══ FIX: Prevent TMA collapse when keyboard opens (Redmi 9C, old Android) ═══
         Problem: on old Telegram (< 7.7) without disableVerticalSwipes(),
         when the text keyboard opens (not number picker), the viewport resize
         causes Telegram to interpret it as swipe-down → mini-app collapses.

         Solution:
         1. For new TG: disableVerticalSwipes() (called above in initApp)
         2. For old TG: intercept touchmove on the document when input is focused,
            prevent overscroll, and call tg.expand() to keep app fullscreen.
         3. Block the swipe gesture by preventing touchmove at document top. */
      (function initTmaSwipeGuard() {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (!tg) return; /* Not in Telegram — no guard needed */

        var inputFocused = false;
        var touchStartY = 0;

        /* Track when any text input gains/loses focus */
        document.addEventListener('focusin', function(e) {
          var t = e.target;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
            inputFocused = true;
            /* Force app to stay expanded when keyboard opens */
            if (tg && tg.expand) try { tg.expand(); } catch(ex) {}
            /* Double-tap expand after keyboard animation (300ms) */
            setTimeout(function() {
              if (tg && tg.expand) try { tg.expand(); } catch(ex) {}
            }, 350);
          }
        });
        document.addEventListener('focusout', function() {
          inputFocused = false;
        });

        /* Remember touch start Y to detect downward swipe */
        document.addEventListener('touchstart', function(e) {
          touchStartY = e.touches[0] ? e.touches[0].clientY : 0;
        }, { passive: true });

        /* Block downward swipe when input focused or touch started near top of screen.
           This prevents Telegram from collapsing the mini-app on keyboard open.
           BATCH 10.195 (Светлана Либакова 20.05): порог dy > 2 убивал iOS long-press menu
           (Paste/Select All) — даже микро-тремор пальца за 500ms holding отменяет нативное
           меню. Подняли до 30px (это уверенный swipe). Также: НЕ блокируем если target
           внутри input/textarea/contenteditable — там native interactions важнее.   */
        document.addEventListener('touchmove', function(e) {
          if (!inputFocused) return;
          /* CRITICAL: не блокировать события внутри редактируемых полей —
             ломаем iOS long-press paste menu */
          var tgt = e.target;
          if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' ||
                      (tgt.isContentEditable === true) ||
                      (tgt.closest && tgt.closest('input,textarea,[contenteditable="true"]')))) {
            return;
          }
          var t = e.touches[0];
          if (!t) return;
          var dy = t.clientY - touchStartY;
          /* Only block downward swipe (dy > 30) — allow upward scroll + long-press */
          if (dy > 30) {
            e.preventDefault();
            e.stopPropagation();
          }
        }, { passive: false, capture: true });

        /* Also prevent overscroll at the top of scrollable containers
           which can trigger TMA collapse on old Android WebViews
           BATCH 10.195: добавлен такой же guard для input/textarea + порог 30px */
        document.addEventListener('touchmove', function(e) {
          var t = e.target;
          if (!t) return;
          /* CRITICAL: не блокировать события внутри редактируемых полей */
          if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              (t.isContentEditable === true) ||
              (t.closest && t.closest('input,textarea,[contenteditable="true"]'))) {
            return;
          }
          var scrollable = t.closest && t.closest('.page-scroll, .profile-scroll, .help-scroll, .home-main-wrap');
          if (scrollable && scrollable.scrollTop <= 0) {
            var touch = e.touches[0];
            if (touch && (touch.clientY - touchStartY) > 30) {
              /* Trying to pull down at scroll top — block */
              e.preventDefault();
            }
          }
        }, { passive: false });

        /* ═══ SAFETY NET: viewportChanged event ═══
           Telegram fires this when miniapp viewport changes (collapse/expand).
           If the app unexpectedly becomes non-expanded (e.g. keyboard resize
           was misinterpreted as swipe), immediately re-expand. */
        if (tg.onEvent) {
          tg.onEvent('viewportChanged', function(evt) {
            /* Re-expand on ANY viewport change if app got collapsed.
               Don't wait for isStateStable — react immediately to prevent
               the user seeing the collapse (critical on Redmi 9C / old Android). */
            if (tg && !tg.isExpanded) {
              try { tg.expand(); } catch(ex) {}
              if (typeof console !== 'undefined') console.log('[TMA] Auto-re-expanded after unexpected collapse');
            }
          });
        }

        /* ═══ EXTRA GUARD: periodic expand check while input focused ═══
           On old Telegram (< 7.7) without disableVerticalSwipes(), the keyboard
           open/resize can collapse the mini-app. The viewportChanged event may
           not fire reliably on all devices (e.g. Redmi 9C, Android 10).
           Poll every 500ms while an input is focused to catch any collapse. */
        var _inputFocusExpandInterval = null;
        document.addEventListener('focusin', function(e) {
          var tag = e.target && e.target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            if (_inputFocusExpandInterval) return; /* Already polling */
            _inputFocusExpandInterval = setInterval(function() {
              if (tg && !tg.isExpanded) {
                try { tg.expand(); } catch(ex) {}
                console.log('[TMA] Periodic re-expand during input focus');
              }
            }, 500);
          }
        });
        document.addEventListener('focusout', function() {
          if (_inputFocusExpandInterval) {
            clearInterval(_inputFocusExpandInterval);
            _inputFocusExpandInterval = null;
          }
          /* Final expand after keyboard closes (300ms keyboard animation) */
          setTimeout(function() {
            if (tg && !tg.isExpanded) try { tg.expand(); } catch(ex) {}
          }, 400);
        });
      })();

      /* ═══ LOW-END: disable canvas fireworks to save GPU/memory ═══ */
      if (window._isLowEndDevice) {
        /* Override launchFireworks to be a no-op on low-end devices.
           Fireworks use requestAnimationFrame + canvas + shadowBlur = major GPU spike. */
        window._disableFireworks = true;
      }

      function getPlacesSearchUrl(q) {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var lang = window.currentLang || 'ru';
        if (base) return base + '/api/places?q=' + encodeURIComponent(q) + '&lang=' + lang;
        return 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=8&addressdetails=1&accept-language=' + lang;
      }
      function getPlaceDetailsUrl() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        return base ? base + '/api/place-details' : '';
      }
      function fetchPlaceDetails(params, onSuccess, onError) {
        var url = getPlaceDetailsUrl();
        var body = params && (params.place_id || params.yandex_uri) ? (params.place_id ? { place_id: params.place_id } : { yandex_uri: params.yandex_uri }) : null;
        if (!url || !body) { if (onError) onError(); return; }
        body.lang = window.currentLang || 'ru';
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.lat != null && data.lon != null) onSuccess(data.display_name || '', data.lat, data.lon);
            else if (onError) onError();
          })
          .catch(function() { if (onError) onError(); });
      }
      function nominatimUrlFor(q) {
        return 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=8&addressdetails=1';
      }
      /* Алла 06.06.2026: автокомплит малых посёлков (Раубичи и т.п.).
         Своя база покрывает 150k городов, но микро-посёлки ниже порога знает
         только OpenStreetMap. С сервера Render Nominatim заблокирован по IP, а
         с устройства пользователя — нет. Поэтому когда backend /api/places вернул
         пусто — добиваем подсказку Nominatim'ом прямо из браузера пользователя.
         Yandex Geocoder теперь платный (8-16к ₽/мес) — не используем. */
      function _trimNominatimName(item) {
        var dn = (item && item.display_name) || '';
        if (!dn) return null;
        /* Закон №22: не показываем учреждения/POI (тюрьмы, больницы, посольства, в/ч…) */
        if (/исправительн|пенитенциар|тюрьм|сизо|колони|\bудин\b|\bмвд\b|\bфсин\b|больниц|госпиталь|клиник|роддом|психиатр|посольств|консульств|воинск|войсков|\bв\/ч\b|воинская часть|церковь|храм|мечеть|монастыр|синагог|школа|лицей|гимназ|университет|институт|prison|hospital|embassy|consulate|correctional|barracks|church|mosque|school|university/i.test(dn)) return null;
        var parts = dn.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
        var cleaned = (parts.length <= 3) ? parts.join(', ') : (parts[0] + ', ' + parts[parts.length - 1]);
        return { display_name: cleaned, lat: item.lat, lon: item.lon, address: item.address || { country: (item.address && item.address.country) || '' } };
      }
      /* Добивает пустой ответ backend'а подсказками Nominatim (с устройства юзера).
         renderFn(arr) — функция отрисовки списка конкретного поля. */
      function placesNominatimFallback(q, renderFn) {
        if (!q || q.length < 3 || typeof nominatimUrlFor !== 'function') { renderFn([]); return; }
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var t = setTimeout(function(){ try { ctrl && ctrl.abort(); } catch(e){} }, 6000);
        fetch(nominatimUrlFor(q), { headers: { 'Accept': 'application/json', 'Accept-Language': (window.currentLang || 'ru') }, signal: ctrl ? ctrl.signal : undefined })
          .then(function(r){ clearTimeout(t); return r.ok ? r.json() : []; })
          .then(function(list){
            var arr = (Array.isArray(list) ? list : []).map(_trimNominatimName).filter(Boolean);
            /* дедуп по имени */
            var seen = {}, out = [];
            arr.forEach(function(x){ var k = (x.display_name || '').toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } });
            renderFn(out);
          })
          .catch(function(){ clearTimeout(t); renderFn([]); });
      }
      async function showLocationSuggestions(inputElement, suggestionsContainerId, confirmCheckboxId) {
        var value = inputElement.value.trim();
        var suggestionsContainer = document.getElementById(suggestionsContainerId);
        // #7257206 (Maria Lykosova ПЕРЕОТКРЫТ): поле «Город для энергии момента» (транзит)
        // шло через этот общий хэндлер с порогом <2 → на «Мо» (2 буквы) бэкенд-suggest (min 3)
        // возвращал [] → «не найдено»/тишина. Остальные city-поля уже чинились хинтом
        // _cityMinCharsHint. Единое поведение (закон №20): <3 букв → «Введите минимум 3 буквы».
        if (value.length < 3) {
          if (!(window._cityMinCharsHint && window._cityMinCharsHint(suggestionsContainerId, value))) {
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
          }
          return;
        }
        try {
          var url = getPlacesSearchUrl(value);
          var headers = { 'Accept': 'application/json' };
          if (url.indexOf('nominatim') !== -1) { headers['User-Agent'] = 'YupSoulMiniApp/1.0'; }
          var response = await fetch(url, { headers: headers });
          var locations = await response.json();
          if (locations.length === 0) {
            if (suggestionsContainer) {
              suggestionsContainer.textContent = '';
              var nfDiv = document.createElement('div');
              nfDiv.style.cssText = 'padding:10px;color:var(--tg-theme-hint-color, rgba(255,255,255,0.6));text-align:center;';
              nfDiv.textContent = t('notFound');
              suggestionsContainer.appendChild(nfDiv);
              suggestionsContainer.style.display = 'block';
            }
            return;
          }
          if (suggestionsContainer) {
            // Безопасное создание элементов без innerHTML для защиты от XSS
            suggestionsContainer.innerHTML = '';
            var fragment = document.createDocumentFragment();
            
            locations.forEach(function(loc) {
              var display = (loc.display_name || '')
                .replace(', Россия', '').replace(', Беларусь', '').replace(', Российская Федерация', '').replace(', Republic of Belarus', '');
              
              var suggestionDiv = document.createElement('div');
              suggestionDiv.className = 'location-suggestion';
              suggestionDiv.textContent = display;
              suggestionDiv.setAttribute('data-value', display);
              suggestionDiv.setAttribute('data-lat', loc.lat || '');
              suggestionDiv.setAttribute('data-lon', loc.lon || '');
              
              suggestionDiv.addEventListener('click', function() {
                inputElement.value = this.getAttribute('data-value');
                inputElement.setAttribute('data-lat', this.getAttribute('data-lat'));
                inputElement.setAttribute('data-lon', this.getAttribute('data-lon'));
                suggestionsContainer.style.display = 'none';
                if (confirmCheckboxId) {
                  var checkbox = document.getElementById(confirmCheckboxId);
                  if (checkbox) checkbox.checked = true;
                }
              });
              
              fragment.appendChild(suggestionDiv);
            });
            
            suggestionsContainer.appendChild(fragment);
            suggestionsContainer.style.display = 'block';
          }
        } catch (err) {
          console.error('Ошибка поиска местоположения:', err);
          if (suggestionsContainer) {
            var errorText = t('searchError') || 'Ошибка поиска';
            if (err.name === 'AbortError') {
              errorText = 'Превышено время ожидания';
            } else if (err.message && err.message.includes('network')) {
              errorText = '🌐 Проблема с интернетом';
            }
            suggestionsContainer.textContent = '';
            var errDiv = document.createElement('div');
            errDiv.style.cssText = 'padding:10px;color:#ef4444;text-align:center;';
            errDiv.textContent = errorText;
            suggestionsContainer.appendChild(errDiv);
            suggestionsContainer.style.display = 'block';
          }
        }
      }
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.location-input-wrapper')) {
          document.querySelectorAll('.location-suggestions').forEach(function(el) { el.style.display = 'none'; });
        }
      });
      var userTariff = 'basic';
      var userProfile = null;
      var heroesCache = [];
      var editingHeroId = null;
      var pricingCatalog = [];
      var freeTrialAvailable = true;
      var hasSubscriptionActive = false;
      var catalogLoadError = false;
      var activePromo = null;
      var pendingPaymentRequestId = null;
      var pendingPaymentSku = null;
      var pendingPaymentPromo = null; // Промокод, который был отправлен с заявкой
      var paymentPollingActive = false; // Флаг для остановки polling
      var _hotPaymentConfirmed = false; // Дедупликация: предотвращает повторные success-обработчики от параллельных polling-циклов
      var _paymentCompleteInSession = false; // Для трекинга payment_abandoned
      var subscriptionClaimInFlight = false; // Защита от параллельных claim
      var promoDebounceTimer = null; // Таймер для debounce промокода
      var isSubmitting = false; // Флаг для защиты от дублирования заявок
      var catalogCache = null;
      var catalogCacheTime = 0;
      var CATALOG_CACHE_TTL = 5 * 60 * 1000;
      var _tbankAvailable = false;
      var _tbankPrices = {};
      var selectedMode = 'single';

      function getCurrentSku() {
        if (pendingPaymentSku && pendingPaymentSku !== '') return pendingPaymentSku;
        var modeSku = (typeof selectedMode !== 'undefined' && selectedMode) ? selectedMode : 'single';
        if (modeSku === 'couple') return 'couple_song';
        if (modeSku === 'transit') return 'transit_energy_song';
        return 'single_song';

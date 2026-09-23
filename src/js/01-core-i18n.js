
    // В режиме симуляции Telegram (preview + mock_tg) подменяем ответы check-chat и submit-request, чтобы пройти весь сценарий без бэкенда
    (function() {
      if (!window._mockTgMode) return;
      var _fetch = window.fetch;
      window.fetch = function(url, opts) {
        var urlStr = (typeof url === 'string' ? url : (url && url.url) || '');
        if (urlStr.indexOf('/api/check-chat') !== -1) {
          return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ chat_available: true }); }, status: 200 });
        }
        if (urlStr.indexOf('/api/submit-request') !== -1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: function() {
              return Promise.resolve({ ok: true, requestId: 'mock-' + Date.now(), payment_required: false });
            }
          });
        }
        return _fetch.apply(this, arguments);
      };
    })();
    // Глобальная обработка ошибок — приложение не «зависает» без обратной связи
    (function() {
      // Collect last errors for diagnostic debug tag (visible on screenshot)
      window.__recentErrors = [];
      function _pushErr(type, msg, line) {
        window.__recentErrors.push(type + ':L' + (line || '?') + ':' + String(msg || '').slice(0, 80));
        if (window.__recentErrors.length > 5) window.__recentErrors.shift();
      }
      function reportError(type, msg, url, line, col) {
        try {
          var body = JSON.stringify({ type: type, msg: String(msg).slice(0, 500), url: String(url || '').slice(-100), line: line, col: col, ua: navigator.userAgent, ts: Date.now() });
          navigator.sendBeacon((window.apiBase || '') + '/api/analytics/error', body);
        } catch(_) {}
      }
      function showErrorToast() {
        try {
          // Count errors in window — if too many in short time, show retry
          window.__errCount = (window.__errCount || 0) + 1;
          if (!window.__errFirstTime) window.__errFirstTime = Date.now();

          // Less than 3 errors or more than 10 sec since first — just log, don't bother user
          if (window.__errCount < 3 || (Date.now() - window.__errFirstTime) > 10000) {
            // Reset counter after 10 sec
            if ((Date.now() - window.__errFirstTime) > 10000) {
              window.__errCount = 1;
              window.__errFirstTime = Date.now();
            }
            return; // Don't show anything for isolated errors
          }

          // 3+ errors in 10 seconds — app is broken, show soft retry
          if (document.getElementById('ys-err-retry')) return; // Already showing
          var toast = document.createElement('div');
          toast.id = 'ys-err-retry';
          toast.setAttribute('role', 'alert');
          toast.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;z-index:99999;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(0,0,0,0.85);color:#fff;font-family:inherit;font-size:0.9rem;padding:14px 18px;border-radius:14px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 20px rgba(0,0,0,0.3);';
          var txt = document.createElement('span');
          txt.textContent = typeof t === 'function' ? t('appUpdating') : 'Приложению нужно обновиться';
          toast.appendChild(txt);
          var btn = document.createElement('button');
          btn.textContent = typeof t === 'function' ? t('btnRefresh') : 'Обновить';
          btn.style.cssText = 'padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:0.85rem;cursor:pointer;white-space:nowrap;';
          btn.onclick = function() { window.location.reload(); };
          toast.appendChild(btn);
          // Diagnostic: show recent errors in small text for screenshot debugging
          if (window.__recentErrors && window.__recentErrors.length) {
            var diag = document.createElement('div');
            diag.style.cssText = 'margin-top:6px;font:9px/1.2 monospace;color:#ff0;opacity:0.9;word-break:break-all;';
            diag.textContent = window.__recentErrors.join(' | ');
            toast.style.flexWrap = 'wrap';
            toast.appendChild(diag);
          }
          document.body.appendChild(toast);
          // NO auto-reload — user decides when to refresh via button
          // Auto-hide after 15 seconds if user ignores
          setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); window.__errCount = 0; }, 15000);
        } catch (_) {}
      }
      window.onerror = function(msg, url, line, col, err) {
        console.error('[YupSoul]', msg, url, line, col, err);
        reportError('onerror', msg, url, line, col);
        _pushErr('ERR', msg, line);
        var msgStr = String(msg || '');
        var isSyntaxFromInjected = /Unexpected token/.test(msgStr) && line > 13500;
        if (isSyntaxFromInjected) return true;
        // Не показывать полноэкранную ошибку для типичных некритичных ситуаций
        var nonFatalErr = /fetch|network|timeout|Unauthorized|401|403|409|500|503|null|undefined|Cannot read|Cannot set|Cannot access|is not a function|is not defined|is not iterable|is not a constructor|is not an object|loadProfile|subscription|referral|pricing|profile|catalog|cards|tbank|GoogleAuth|allSettled|TypeError|RangeError|SyntaxError/i.test(msgStr);
        if (nonFatalErr) return true;
        // Ошибки внутри async-кода профиля/подписки — подавляем полноэкранный crash
        if (line > 10000) return true;
        // Во время отмены подписки — не показывать overlay
        if (window.__cancelSubInProgress) return true;
        var search = typeof location !== 'undefined' && location.search ? location.search : '';
        var payOverlay = document.getElementById('paymentOverlay');
        var overlayVisible = payOverlay && payOverlay.style && payOverlay.style.display !== 'none' && getComputedStyle(payOverlay).display !== 'none';
        var paymentOpening = (window.__paymentOpeningUntil && Date.now() < window.__paymentOpeningUntil) || overlayVisible;
        if (paymentOpening) {
          // §5.4.1: на VK mobile оплата ТОЛЬКО голосами (нативный VK order box, без
          // перехода в браузер) — увод «открой в браузере» запрещён. Тихо подавляем.
          if (window._appEnv === 'vk' && window._vkIsMobileClient) return true;
          try {
            var toast = document.createElement('div');
            toast.setAttribute('role', 'alert');
            toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,0.9);color:#fff;font-family:inherit;font-size:1rem;padding:24px;text-align:center;line-height:1.5;';
            toast.innerHTML = (typeof t === 'function' ? t('bsPaymentNotOpened') : 'Если страница оплаты не открылась — нажми «Скопировать ссылку» ниже и открой её в браузере.');
            var btn = document.createElement('button');
            btn.textContent = (typeof t === 'function' ? t('bsGotIt') : 'Понятно');
            btn.style.cssText = 'padding:12px 24px;border-radius:12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;font-size:1rem;cursor:pointer;';
            btn.onclick = function() { if (toast.parentNode) toast.parentNode.removeChild(toast); };
            toast.appendChild(btn);
            document.body.appendChild(toast);
            setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 15000);
          } catch (_) {}
          return true;
        }
        if (window.__isPaymentReturn || search.indexOf('page=paymentThanks') !== -1 || search.indexOf('payment=success') !== -1) {
          if (window._ysTrack) {
            var _ppd = { source: 'payment_return' };
            try { var _pp2 = JSON.parse(localStorage.getItem('pending_payment_type') || '{}'); _ppd.method = _pp2.type || 'unknown'; _ppd.sku = _pp2.sku || null; } catch(_) {}
            window._ysTrack('payment_complete', _ppd);
          }
          try {
            var toast2 = document.createElement('div');
            toast2.setAttribute('role', 'alert');
            toast2.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,0.9);color:#fff;font-family:inherit;font-size:1rem;padding:24px;text-align:center;line-height:1.5;';
            toast2.innerHTML = (typeof t === 'function' ? t('bsPaymentAccepted') : 'Оплата принята.<br><br>Можешь закрыть это окно и вернуться в Telegram — песня придёт в чат с ботом.');
            var btn2 = document.createElement('button');
            btn2.textContent = typeof t === 'function' ? t('btnClose') : 'Закрыть';
            btn2.style.cssText = 'padding:12px 24px;border-radius:12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;font-size:1rem;cursor:pointer;';
            btn2.onclick = function() { if (toast2.parentNode) toast2.parentNode.removeChild(toast2); };
            toast2.appendChild(btn2);
            document.body.appendChild(toast2);
            setTimeout(function() { if (toast2.parentNode) toast2.parentNode.removeChild(toast2); }, 20000);
          } catch (_) {}
          return true;
        }
        showErrorToast();
        return true;
      };
      window.addEventListener('unhandledrejection', function(e) {
        var reason = e && e.reason;
        var message = String((reason && (reason.message || reason)) || '');
        console.error('[YupSoul] unhandledrejection', reason && (reason.stack || reason.message || reason));
        reportError('rejection', message, '', 0, 0);
        _pushErr('REJ', message, 0);
        var nonFatal =
          (reason && reason.name === 'AbortError') ||
          /fetch|network|timeout|Оплата не подтверждена|not confirmed|Unauthorized|401|403|409|500|503|null|undefined|Cannot read|Cannot set|Cannot access|is not a function|is not defined|is not iterable|is not a constructor|is not an object|loadProfile|subscription|referral|pricing|profile|catalog|cards|tbank|GoogleAuth|cancel|showConfirm|JSON|allSettled|TypeError|RangeError|SyntaxError/i.test(message);
        if (nonFatal) return;
        var search = typeof location !== 'undefined' && location.search ? location.search : '';
        var payOverlay = document.getElementById('paymentOverlay');
        var overlayVisible = payOverlay && payOverlay.style && payOverlay.style.display !== 'none' && getComputedStyle(payOverlay).display !== 'none';
        var paymentOpening = (window.__paymentOpeningUntil && Date.now() < window.__paymentOpeningUntil) || overlayVisible;
        if (paymentOpening) {
          // §5.4.1: на VK mobile оплата ТОЛЬКО голосами (нативный VK order box, без
          // перехода в браузер) — увод «открой в браузере» запрещён. Тихо подавляем.
          if (window._appEnv === 'vk' && window._vkIsMobileClient) return true;
          try {
            var toast = document.createElement('div');
            toast.setAttribute('role', 'alert');
            toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,0.9);color:#fff;font-family:inherit;font-size:1rem;padding:24px;text-align:center;line-height:1.5;';
            toast.innerHTML = (typeof t === 'function' ? t('bsPaymentNotOpened') : 'Если страница оплаты не открылась — нажми «Скопировать ссылку» ниже и открой её в браузере.');
            var btn = document.createElement('button');
            btn.textContent = (typeof t === 'function' ? t('bsGotIt') : 'Понятно');
            btn.style.cssText = 'padding:12px 24px;border-radius:12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;font-size:1rem;cursor:pointer;';
            btn.onclick = function() { if (toast.parentNode) toast.parentNode.removeChild(toast); };
            toast.appendChild(btn);
            document.body.appendChild(toast);
            setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 15000);
          } catch (_) {}
          return;
        }
        if (window.__isPaymentReturn || search.indexOf('page=paymentThanks') !== -1 || search.indexOf('payment=success') !== -1) {
          try {
            var toast2 = document.createElement('div');
            toast2.setAttribute('role', 'alert');
            toast2.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,0.9);color:#fff;font-family:inherit;font-size:1rem;padding:24px;text-align:center;line-height:1.5;';
            toast2.innerHTML = (typeof t === 'function' ? t('bsPaymentAccepted') : 'Оплата принята.<br><br>Можешь закрыть это окно и вернуться в Telegram — песня придёт в чат с ботом.');
            var btn2 = document.createElement('button');
            btn2.textContent = typeof t === 'function' ? t('btnClose') : 'Закрыть';
            btn2.style.cssText = 'padding:12px 24px;border-radius:12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;font-size:1rem;cursor:pointer;';
            btn2.onclick = function() { if (toast2.parentNode) toast2.parentNode.removeChild(toast2); };
            toast2.appendChild(btn2);
            document.body.appendChild(toast2);
            setTimeout(function() { if (toast2.parentNode) toast2.parentNode.removeChild(toast2); }, 20000);
          } catch (_) {}
          return;
        }
        showErrorToast();
      });
    })();

    document.addEventListener('DOMContentLoaded', function() {
      var q = typeof location !== 'undefined' && location.search ? location.search : '';
      if (q.indexOf('page=paymentThanks') !== -1 || q.indexOf('payment=success') !== -1) {
        window.__isPaymentReturn = true;
        setTimeout(function() { window.__isPaymentReturn = false; }, 60000);
      }
      // Должна быть определена до initApp() — используется при инициализации Telegram
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
      window.compareVersion = compareVersion;

      (function removeBotNameHeaders() {
        document.querySelectorAll('.header-title, .page-header-title, .app-title').forEach(function(el) { el.remove(); });
        document.querySelectorAll('#homeTopBar, .page-header, .form-header-bar').forEach(function(header) {
          [].slice.call(header.childNodes).forEach(function(node) {
            if (node.nodeType === 1 && node.textContent && node.textContent.trim() === 'YupSoul Personal Music') node.remove();
          });
        });
      })();
      var tg = null;
      var INIT_DATA_STORAGE_KEY = 'tg_init_data';

      // Перехват fetch: в веб-режиме автоматически добавляем Authorization вместо X-Telegram-Init
      (function patchFetchForWebAuth() {
        var _origFetch = window.fetch;
        window.fetch = function(url, opts) {
          if (window._appEnv === 'web' && window._googleJwt && opts) {
            var headers = opts.headers || {};
            if (headers instanceof Headers) {
              if (headers.has('X-Telegram-Init') && !headers.has('Authorization')) {
                headers.delete('X-Telegram-Init');
                headers.set('Authorization', 'Bearer ' + window._googleJwt);
              }
            } else if (typeof headers === 'object') {
              if (headers['X-Telegram-Init'] && !headers['Authorization']) {
                delete headers['X-Telegram-Init'];
                headers['Authorization'] = 'Bearer ' + window._googleJwt;
              }
            }
            opts.headers = headers;
            // Убираем initData из body для веб-режима
            if (opts.body && typeof opts.body === 'string') {
              try {
                var bodyObj = JSON.parse(opts.body);
                if (bodyObj.initData) {
                  delete bodyObj.initData;
                  opts.body = JSON.stringify(bodyObj);
                }
              } catch(_) {}
            }
          }
          return _origFetch.call(window, url, opts);
        };
      })();

      var LANG_STORAGE_KEY = 'yupsoul_lang';
      var BOT_USERNAME = 'Yup_Soul_bot';
      var ISKRY_WELCOME_AMOUNT = 0; // вкус — основной вход (Алла 02.07): Искры за дела (тур +30, уведомления +5, Искра дня +2), не за регистрацию
      var ISKRY_PRICES = {
        single_song: 100,
        transit_energy_song: 100,
        couple_song: 100,
        deep_analysis_addon: 40,
        soul_chat_1day: 30
      };
      var LANG = {        ru: {
          dlSongTitle: 'Скачать песню',
          dlSongEyebrow: 'Скачать песню',
          dlSongTrackSub: 'Песня души · 2:48 · MP3',
          dlSongMsg: 'Спасибо, что делишься 🤍 <span class="hl">Пока песня живёт у тебя на странице — скачивание открыто.</span> <span class="ret">Если решишь убрать пост — вернёмся к обычному: трек за Искры.</span>',
          dlSongMore: 'Другие способы открыть',
          dlSongJoinT: 'Вступить в сообщество',
          dlSongJoinS: 'YupSoul во ВКонтакте',
          dlSongRevT: 'Оставить отзыв',
          dlSongRevS: 'Пара тёплых слов о песне',
          dlSongCta: 'Поделиться песней',
          dlSongOrPre: 'или ',
          dlSongOrLink: 'открыть скачивание за <span class="spk">100</span> Искр',
          tagline: 'Узнай, как звучит твой гороскоп',
          taglineAccent: 'твой',
          startBtn: 'Получи свою песню', myProfile: 'Профиль', myHeroes: 'Лаборатория', myHelp: 'Помощь', admin: 'Админка',
          compatTitle: 'Совместимость', profileTitle: 'Профиль', profileSubtitle: 'Твои данные и баланс Искр',
          profileFreeCredits: 'Баланс Искр', profileInviteFriend: 'Пригласи друга', profileShare: 'Поделиться', profileCopyLink: 'Скопировать ссылку', profileLinkCopied: 'Ссылка скопирована',
          // VK Testers 7274710 (Maria Lykosova, Android, 14.05.2026): hardcoded русский текст
          // для шаринга, не зависел от текущего языка приложения.
          refShareTextWithName: 'Привет! Вот приложение, которое создаёт персональную песню на основе даты рождения. Реально крутое — попробуй, минута твоей песни в подарок!',
          refShareText: 'Вот приложение — создаёт персональную песню на основе даты рождения. Минута твоей песни в подарок, попробуй!',
          // VK Testers 7274702: своё уведомление вместо VK Bridge (VK toast не локализуется)
          copiedToClipboard: 'Скопировано в буфер обмена',
          shared: 'Поделились!',
          copyManually: 'Скопируй ссылку:',
          // VK Testers 7272264 ревизия 14.05.2026: i18n для inline confirm в cancelSubscription
          confirmYes: 'Да',
          confirmCancel: 'Отмена',
          deleteCancelled: 'Удаление отменено',
          confirmExit: 'Выйти',
          confirmStay: 'Остаться',
          thisHero: 'этого героя',
          confirmDeleteHero: 'Удалить «{name}»?',
          btnDelete: 'Удалить',
          profileInvited: 'Приглашено', profileActivated: 'Активировано', profileCreateSong: 'Создать песню',
          heroesTitle: 'Контакты', heroesSubtitle: 'Люди, для которых оракул поёт',
          heroesVkOfferTitle: 'Картотека людей', heroesVkOfferDesc: 'Добавь близких один раз — и собирай для них песни в один тап. Вся история с текстами рядом.', heroesVkOfferCta: 'Открыть картотеку',
          ulSegCards: 'Картотека', ulSegTopic: 'Тема расчёта',
          ulCardsEyebrow: 'Картотека людей', ulCardsTitle: 'Все близкие — в одном месте', ulCardsSub: 'Сохраняй карты родных и друзей — песни и совместимость в один тап.',
          ulCardsB1: 'Песни в один тап', ulCardsB1s: 'по сохранённой дате', ulCardsB2: 'Совместимость', ulCardsB2s: 'разбор пары для двоих', ulCardsB3: 'Дари близким', ulCardsB3s: 'песня в подарок прямо отсюда',
          ulCardsCta: 'Открыть картотеку', ulCardsNote: 'Пакет «Лаборатория» · доступ на 30 дней',
          ulTopicEyebrow: 'Разбор темы', ulTopicTitle: 'Разборы по твоей карте', ulTopicSub: 'Глубокий разбор темы по твоей карте — и персональная песня к ней.',
          ulTopicB1: 'Глубокий разбор', ulTopicB1s: 'по твоей дате рождения', ulTopicB2: 'Песня к теме', ulTopicB2s: 'персональный трек в подарок', ulTopicB3: 'Вопросы Оракулу', ulTopicB3s: 'по этой теме без лимита',
          ulTopicCta: 'Открыть разборы', ulTopicNote: 'Разбор откроется в дневнике Оракула',
          heroesPerkTapTitle: 'Песни в один тап', heroesPerkTapDesc: 'Добавь человека один раз — и создавай для него треки, не вводя дату заново.', heroesPerkMatchTitle: 'Совместимость с близкими', heroesPerkMatchDesc: 'Смотри, насколько вы созвучны с каждым человеком — по дате рождения.', heroesPerkHistoryTitle: 'Вся история рядом', heroesPerkHistoryDesc: 'Песни и тексты для каждого близкого — собраны в одном месте.', heroesPerkGiftTitle: 'Дари близким', heroesPerkGiftDesc: 'Собери семью и друзей — и радуй их персональными песнями.', heroesBuyPeriodWeb: 'Лаборатория · картотека внутри', heroesBuyPriceUnitWeb: '₽', heroesBuyNoteWeb: 'Пакет · картотека и всё «Лаборатории»', heroesBuyTrust: 'Безопасная оплата · мгновенный доступ', heroesBrandTagline: 'Музыкальный оракул', heroesTitleH1: 'Картотека', heroesTitleSub: 'Люди, для которых оракул поёт', heroesSelfBadge: 'это ты', heroesCreateSong: 'Создать песню',
          searchByName: 'Поиск по имени', searchPlaceholder: 'Введите имя...', searchBtn: 'Искать',
          addHero: 'Добавить героя', heroName: 'Имя *', heroNameLabel: 'Имя', heroBirthdate: 'Дата рождения', heroBirthtime: 'Время рождения',
          heroBirthplace: 'Место рождения', heroBirthplacePh: 'Город, страна', heroNotes: 'Досье / заметки', heroNotesPh: 'Заметки о человеке',
          unknownTime: 'Не знаю точное время', cancel: 'Отмена', deleteBtn: 'Удалить', save: 'Сохранить', back: '← Назад', backLabel: 'Назад',
          gender: 'Пол', genderSelect: 'Выбери', male: 'Мужской', female: 'Женский', other: 'Другой',
          modeType: 'Формат песни', modeSubtitle: 'Для кого создаём?',
          modeSingle: 'Обо мне', modeSingleDesc: 'Песня по твоей дате рождения',
          modeCouple: 'Про двоих', modeCoupleDesc: 'Песня для двух людей',
          modeLockedBadge: 'Доступно с пакетом',
          guideTipFormat: 'Выбери формат', guideTipDate: 'Впиши дату рождения', guideTipStyle: 'Выбери, как определить стиль', guideTipLyrics: 'Со словами, только музыка или свой текст', guideTipCreate: 'Готово — жми «Создать»',
          guideTipStart: 'Жми — создадим твою песню', guideTipGender: 'Выбери пол', guideNextBtn: 'Дальше', coupleManualEnter: 'Ввести вручную', coupleExpandEdit: 'Развернуть', coupleCollapseEdit: 'Свернуть', guideTipLanguage: 'На каком языке петь', guideTipRequest: 'Пара слов о теме — и песня получится точнее. Не хочешь — пропускай, соберём по твоему раскладу.', guideTipName: 'Впишешь имя — прозвучит в песне. Уже вписано, а не хочешь? Просто сотри — и не прозвучит', guideTipAdv: 'По желанию: место и время — песня точнее',
          obSlide5Eyebrow: 'Не пропусти', obSlide5Title: 'Узнай первым, когда песня готова', obSlide5Sub: 'Пришлём весточку, когда песня будет готова, и напомним про Искру дня.',
          obChipNotifyReady: 'песня готова → сразу весточка', obChipNotifyIskra: 'Искра дня',
          obConsentBtn: 'Подключить уведомления · +5 Искр', obConsentDone: 'Подключено',
          modeTransit: 'Энергия<br>дня', modeTransitDesc: 'Песня о сегодняшнем дне',
          namePh: 'Как тебя зовут?', birthdateLabel: 'Дата рождения', birthplacePh: 'Город или страна — выбери из подсказок',
          birthplaceHint: 'Начни вводить город и выбери из выпавшего списка.',
          cityTypeMore: 'Введите минимум 3 буквы',
          unknownTimeShort: 'Не знаю', secondPersonTitle: 'Для двоих', name2Ph: 'Имя второго человека',
          birthplace2Ph: 'Место рождения второго', birthtime2Ph: 'Время рождения',
          transitTitle: 'Энергия дня', transitDatePh: 'ДД.ММ.ГГГГ', transitTimePh: 'ЧЧ:ММ',
          transitLocationPh: 'Город для энергии момента', transitLocationOk: 'Локация указана верно',
          transitIntentPh: 'Намерение момента',
          styleManual: 'Ввести<br>вручную', styleAstro: 'Звучание<br>планет', styleStar: 'Как у<br>звезды', starRecent: 'Недавние',
          styleHeading: 'Стиль музыки', styleSubtitle: 'Как определить стиль?',
          stylePlaceholderManual: 'Жанр или настроение музыки', stylePlaceholderAstro: 'Стиль определится по дате рождения', stylePlaceholderStar: 'Артист, песня или саундтрек',
          styleManualDefaultHint: 'Если оставить пустым — стиль подберём автоматически по твоей дате рождения.',
          pendingDraftBannerText: '← Вернуться к оформлению песни',
          payOvDraftTtlHint: 'Заявка сохранится 7 дней — потом отменится автоматически.',
          authErrVkNoCode: 'Не удалось войти через VK. Попробуй ещё раз или используй Telegram.',
          authErrVkTokenFail: 'VK не подтвердил вход. Попробуй ещё раз через минуту.',
          authErrVkUserFail: 'VK вернул неполный профиль. Попробуй ещё раз.',
          authErrVkCreateFail: 'Не удалось создать аккаунт. Напиши в поддержку, если ошибка повторяется.',
          authErrVkJwtFail: 'Сессия не создалась. Попробуй ещё раз.',
          authErrGeneric: 'Не удалось войти. Попробуй ещё раз.',
          supportEmailCopied: 'Email скопирован — напиши нам',
          supportEmailLabel: 'Напиши нам по email',
          mtAudioTapAgain: 'Нажми ещё раз — браузер просит подтверждения',
          astroInfoReady: 'Стиль определится по твоей дате рождения',
          astroInfoNoProfile: 'Сначала укажи дату рождения',
          astroInfoNoProfileHint: 'Нажми, чтобы заполнить',
          starHint: 'Введите имя артиста, название песни или саундтрека фильма. Мы создадим музыку в похожем стиле, уникальную для вас.',
          sendRequest: 'О чём будет песня?', requestReassure: 'Можно оставить пустым — соберём песню по твоей дате рождения.', quickRequests: 'Быстрые запросы', hide: 'Скрыть',
          requestDesc: 'О чём песня? Любой запрос — от юмора до глубокой темы',
          requestQuickHint: 'Выбери готовый запрос или напиши свой',
          requestPh: 'Напиши любой запрос', toPayment: 'К оплате',
          paymentSubtitle: 'Твоя песня', paymentAndAccess: 'Оплата и доступ',
          paymentIntro: 'Создай трек за Искры или получи пакет для полного доступа.',
          loadingPricing: 'Загрузка тарифов...', currentItem: 'Текущий элемент',
          promoCode: 'Промокод', promoEmptyError: 'Введите промокод', toastRateLimit: 'Слишком много попыток. Подожди несколько минут и попробуй снова.', apply: 'Применить', backFromPayment: '← Назад',
          submitAndContinue: 'Оформить и продолжить', submitRequest: 'Создать мою песню',
          submitHint: 'Песня придёт в этот чат с ботом. Если вы ещё не нажимали «Старт» в боте — нажмите его сейчас.',
          paymentPageIntroAfterSubmit: 'Заявка отправлена. Введите промокод или выберите способ оплаты ниже.',
          paymentPageIntroOrPay: 'Или введите промокод, или выберите способ оплаты ниже.',
          paymentPageTagline: 'Промокод или оплата',
          pay: 'Оплатить',

          firstFree: 'У тебя есть Искры — создай свой первый трек!',
          paymentRequired: 'Оплата требуется для новых заявок.',
          subscriptionActive: 'У вас активный пакет — можно продолжить.',
          catalogLoadFailed: 'Тарифы не загрузились. Нажмите «Оформить и продолжить» — стоимость определит бэкенд.',
          promoApplied: 'Промокод {code}: -{amount} {currency}',
          creatingKey: 'Создаю твою песню...',
          creatingKeyDesc: 'Магия творится в реальном времени. Твоя персональная песня формируется на основе твоих данных.',
          keyActivated: 'Песня создана!', done: 'Готово!',
          successText: 'Твоя персональная песня создана! Уникальный трек по твоим данным — слушай когда захочешь.',
          yourSong: 'Твоя песня',
          songPreviewText: 'Твоя уникальная аудиокомпозиция уже ждёт тебя в боте. Слушай её каждое утро, чтобы настроиться на волну успеха.',
          whatNext: 'Что дальше:', openBot: 'Открой бота',
          soulChat: 'Разговор по душам', soulChatPay: 'К оплате — Душа / Глубина',
          newKey: 'Создать ещё одну песню',
          paymentThanks: 'Спасибо за оплату', thanksSubtitle: 'заявка принята', paymentThanksBackToForm: 'Создать свою песню', paymentThanksBackToHome: 'На главную', paymentCancelled: 'Оплата отменена',
          songInProgress: 'Песня генерируется на сервере и придёт в этот чат с ботом. Можно закрыть окно — ничего не пропадёт. Спасибо',
          songInProgressConfirmed: 'Заявка принята. Песня генерируется на нашем сервере — когда будет готова, придёт сюда в чат с ботом. Можно закрыть окно — ничего не пропадёт. Спасибо, что остаёшься с нами',
          thanksDone: 'Готово',
          notFromTelegram: 'Открой приложение из чата с ботом в Telegram (кнопка меню) — иначе заявка не отправится.',
          notFound: 'Не найдено', searchError: 'Ошибка поиска',
          soulChatLoad: 'Загрузка…',
          soulChatHasAccess: 'У тебя есть доступ к Чат с Оракулом. Нажми кнопку ниже — откроется бот. В боте напиши /soulchat и задай вопрос своей душе.',
          soulChatNoAccess: 'Чат с Оракулом — диалоги с душой. Доступ по пакету Душа (до 50 сообщений) или Глубина (без лимита).',
          soulChatDefault: 'Чат с Оракулом — диалоги с душой по заявке. Доступ по пакету.',
          soulChatNoApi: 'Чат с Оракулом — диалоги с душой по заявке. Доступ по пакету Душа или Глубина. Оформи в приложении: «К оплате».',
          greeting: 'Привет, {name}!',
          greetingDefault: 'Привет',
          onboardingSlide1Title: 'Есть песня — о тебе',
          onboardingSlide1Text: 'Написанная по дате рождения. Не шаблон — живой текст о твоём характере, силе и пути.',
          onboardingSlide2Title: 'Только о тебе',
          onboardingSlide2Text: 'Каждая — уникальна. Её больше нет ни у кого. Ни одна не повторяется.',
          onboardingSlide3Title: 'Твоя песня уже ждёт',
          onboardingSlide3Text: 'Введи дату рождения — создай первую песню, минута звучания в подарок.',
          onboardingBtnStart: 'Получить свою песню',
          obBrand: 'YupSoul', obSkip: 'Пропустить', obNext: 'Далее', obCreate: 'Создать первую песню',
          archTitle: 'Кто ты на самом деле', archLead: 'В твоей дате рождения есть планета, которую в астрологии называют показателем Души. Она и держит твой характер. Назови дату — покажу.', archDateLabel: 'Дата рождения', archGo: 'Показать мой архетип', archEyebrow: 'Показатель Души', archGift: 'Твой дар', archShadow: 'Твоя тень', archSoulPlanet: 'Планета Души', archNote: 'Твоя нота', archBridge: 'Это — словами. А теперь послушай, как это звучит: песня соберётся по этой же дате.', archToSong: 'Собрать мою песню', archAgain: 'Другая дата', archNeedDate: 'Укажи дату рождения', archBadDate: 'Проверь дату — что-то в ней не сходится', signInWithApple: 'Вход с Apple', rgAll: 'Все жанры', rg_rock: 'Рок', rg_electronic: 'Электроника', rg_rap: 'Рэп', rg_folk: 'Фолк', rg_soul: 'Soul / R&B', rg_ambient: 'Ambient', rg_cinematic: 'Кинематографик', rg_acoustic: 'Акустика', rg_sacred: 'Сакральное', rg_pop: 'Поп', rg_other: 'Другое', offlineTitle: 'Нет подключения к интернету', offlineText: 'Проверьте соединение и попробуйте снова', offlineRetry: 'Обновить', errPurchaseFailed: 'Покупка не завершилась', errArchBadDate: 'Проверь дату — что-то в ней не сходится',
          obReward: '+30 Искр за знакомство',
          obChipBirthdate: 'по дате рождения', obChipWhoAmI: '«Кто я?»', obChipDiary: 'дневник дня',
          obChipCompat: 'Ты + мама · 92%', obChipContacts: 'картотека близких', obChipGift: 'подари другу', obChipRadio: 'радио · чужие песни',
          obSlide1Eyebrow: 'Твоя песня души', obSlide1Title: 'Песня, написанная по твоей дате рождения', obSlide1Sub: 'Оракул читает твою карту рождения и создаёт трек, который звучит только про тебя.',
          obSlide2Eyebrow: 'Оракул', obSlide2Title: 'Спроси о себе — и получи глубокий ответ', obSlide2Sub: 'Задавай вопросы о своём пути, отношениях и характере. Оракул отвечает тепло и по делу.',
          obSlide3Eyebrow: 'Совместимость', obSlide3Title: 'Узнай, насколько вы созвучны с близкими', obSlide3Sub: 'Добавь родных и друзей в картотеку — и смотри вашу совместимость по дате рождения.',
          obSlide4Eyebrow: 'Дари и слушай', obSlide4Title: 'Дари песни близким и слушай Радио', obSlide4Sub: 'Подари песню тому, кто дорог, и открой Радио — эфир песен других людей.',
          alertNameShort: 'Имя должно содержать минимум 2 символа', alertNameFriendly: 'Как тебя зовут? С именем песня станет по-настоящему твоей', alertNameInvalid: 'Укажи настоящее имя', alertBirthdate: 'Выбери дату рождения', alertBirthdateInvalid: 'Год рождения должен быть от 1900 до текущего', alertBirthdateInvalidDay: 'Введена некорректная дата — проверь день и месяц',
          // Batch 10.11 (отчёты 7272665, 7272666): локализованные сообщения от backend (error_code)
          errInvalidName: 'Имя содержит недопустимые символы или повторы.',
          errNameRequired: 'Имя не может быть пустым. Введите хотя бы 1 символ.',
          errInvalidDateFormat: 'Некорректный формат даты рождения. Используй YYYY-MM-DD.',
          errInvalidDateYear: 'Год рождения должен быть от 1900 до текущего.',
          errInvalidDateMonth: 'Некорректный месяц рождения.',
          errInvalidDateDay: 'Некорректный день рождения.',
          errInvalidDate: 'Некорректная дата рождения.',
          errInvalidBirthplace: 'Место рождения некорректно.',
          alertBirthplace: 'Место рождения должно содержать минимум 3 символа', alertBirthplaceHint: 'Выбери локацию из списка подсказок',
          validationErrorHint: 'Заполните все обязательные поля.',
          alertBirthtime: 'Укажи время рождения или отметь "Не знаю"', alertGender: 'Укажи пол', alertLanguage: 'Выбери язык',
          advSettingsTitle: 'Расширенные настройки', advSettingsSub: 'по желанию', advSettingsHint: 'По желанию. Место и время рождения делают расчёт точнее — можно пропустить.',
          unlockEyebrow: 'Твоя песня', unlockTitle: 'Это только начало',
          unlockLead: 'Прозвучала первая минута. <b>Полная песня — около 3 минут</b>, написана по твоей дате рождения. Впереди — припев, финал и твоё имя в словах.',
          unlockR1t: 'Полная песня', unlockR1s: 'около 3 минут', unlockR2t: 'Скачать в MP3', unlockR2s: 'останется у тебя навсегда',
          unlockR3t: 'Слова песни', unlockR3s: 'весь текст целиком', unlockR4t: 'Поделиться с близкими', unlockR4s: 'подарить эту песню',
          unlockR5t: 'Караоке по песне', unlockR5s: 'петь под свои слова',
          unlockPromoToggle: 'Мне подарили промокод', unlockPromoPh: 'Введите промокод', unlockPromoApply: 'Применить', unlockPromoChecking: 'Проверяю…', unlockPromoWrongProduct: 'Этот промокод не для песни',
          unlockCtaOpen: 'Открыть целиком', unlockCtaSub: 'открывается сразу', unlockCtaPaying: 'Открываем оплату…', unlockPayCard: 'Картой', unlockPayStars: 'Звёздами', unlockPayPromo: 'Промокод', unlockPayIskry: 'Искрами',
          unlockGhReplay: 'Ещё минуту', unlockGhBack: 'Вернуться', unlockVkNote: 'Открытие оплачивается картой', unlockIskryUnit: 'Искр',
          openedEyebrow: 'Твоя песня открыта', openedTitle: 'Готово — слушай целиком',
          openedLead: 'Полная версия уже играет. Она твоя — скачивай, читай слова и делись с близкими.',
          openedLeadNoLyrics: 'Полная версия уже играет. Она твоя — скачивай и делись с близкими.',
          openedPlaySub: 'Полная песня · 3:12',
          openedKaraT: 'Спеть караоке', openedKaraS: 'слова подсветятся в такт',
          openedNudgeT: 'Создать песню близкому', openedNudgeS: 'подарить такую же историю', openedPackT: 'Ещё песни — для себя и близких', openedPackS: 'пакет Искр — от 10 песен разом',
          openedOptinT: 'Заглядывать к тебе по утрам?', openedOptinGift: '3 дня в подарок', openedOptinP: 'Короткое тёплое слово от Оракула каждое утро. Можно выключить в любой момент.', openedOptinYes: 'Да, присылай', openedOptinNo: 'Не сейчас',
          openedShare: 'Поделиться с близким', openedDownload: 'Скачать', openedLyrics: 'Слова песни',
          alertName2Short: 'Имя второго человека — минимум 2 символа', alertBirthdate2: 'Укажи дату рождения второго человека',
          alertBirthplace2: 'Место рождения второго человека должно содержать минимум 3 символа',
          alertBirthtime2: 'Укажи время рождения второго человека', alertGender2: 'Выбери пол второго человека',
          alertTransitDate: 'Укажи дату события', alertTransitLocation: 'Укажи локацию события', alertTransitConfirm: 'Подтверди, что локация указана верно',
          alertRequestShort: 'Добавь запрос (5+ символов)', alertRequestLong: 'Расскажи Вселенной подробнее (минимум 15 символов)',
          alertYourPath: 'Выбери свой путь', alertNoApi: 'Не настроен адрес API.', alertOpenFromBot: 'Открой приложение из чата с ботом в Telegram — иначе заявку нельзя принять.',
          alertServerSleep: 'Сервер проснулся не сразу. Подожди около минуты и нажми «Создать мою песню» снова.',
          sending: 'Отправляю…',
          universeHeard: '{name}, Вселенная услышала твой запрос.\n\nТвоя песня формируется и придёт в этот чат, когда будет готова.',
          universeHeardCouple: '{name} и {name2}, Вселенная услышала ваш запрос.\n\nВаша песня формируется и придёт в этот чат, когда будет готова.',
          universeHeardTransit: '{name}, Вселенная услышала твой запрос.\n\nПесня «Энергия Дня» формируется и придёт в этот чат, когда будет готова.',
          langSong: 'Язык песни', langRu: 'Русский', langEn: 'English', langDe: 'Deutsch', langFr: 'Français', langUk: 'Українська',
          quick1: 'Гармония и любовь к себе', quick2: 'Уверенность и предназначение', quick3: 'Творческий потенциал', quick4: 'Отпустить прошлое',
          quick5: 'Баланс жизни', quick6: 'Доверие и принятие', quick7: 'Исцеление и свобода', quick8: 'Путь к счастью',
          quick9: 'Сила и преодоление', quick10: 'Глубина и тишина', quick11: 'Нежность и забота', quick12: 'Юмор и лёгкость',
          quick1t: 'Гармония в отношениях и любовь к себе', quick2t: 'Уверенность, предназначение и опора на себя',
          quick3t: 'Раскрыть творческий потенциал без страха', quick4t: 'Отпустить прошлое и открыть новые возможности',
          quick5t: 'Баланс работы и личной жизни', quick6t: 'Доверять жизни и отпускать контроль',
          quick7t: 'Исцелить детские травмы и обрести свободу', quick8t: 'Найти свой путь к счастью и спокойствию',
          quick9t: 'Мощная песня о моей силе и преодолении', quick10t: 'Медитативная песня для практики и исцеления',
          quick11t: 'Тёплая песня о заботе и нежности', quick12t: 'Весёлая песня с самоиронией про мои слабости',
          promoError: 'Не удалось применить промокод',
          promoCleared: 'Промокод очищен.', promoApplied: 'Промокод применён: итоговая сумма {amount} {currency}',
          promoAppliedHint: 'Промокод {code}: -{amount} {currency}',
          paymentRequiredOpening: 'Требуется оплата. Открываю HOT Checkout...',
          promoFreeGen: 'Промокод активирован. Запуск...',
          hotCheckoutOpened: 'Открыт HOT Checkout. После оплаты вернись в Mini App — статус обновится автоматически.',
          paymentNotConfirmed: 'Оплата пока не подтверждена. Проверь статус позже или открой оплату повторно.',
          paymentConfirmed: 'Оплата подтверждена. Запускаю генерацию...', successWhileWaiting: 'Пока ждёшь песню', successNewSong: 'Ещё песню',
          paymentReceivedNoStart: 'Оплата получена, но авто‑старт не удался. Запусти генерацию в админке по request_id: {id}',
          submitFailed: 'Не удалось отправить заявку. Подожди минуту и нажми «Создать мою песню» снова или открой Mini App заново из чата с ботом.',
          errorOp: 'Ошибка операции оплаты/заявки',
          alertTransitLocation: 'Укажи локацию события', alertTransitConfirm: 'Подтверди, что локация указана верно',
          alertNoApi: 'Не настроен адрес API.', alertOpenFromBot: 'Открой приложение из чата с ботом в Telegram — иначе заявку нельзя принять.',
          alertOpenFromBotShort: 'Открой приложение из чата с ботом в Telegram.',
          alertPaymentFirst: 'Сначала нажмите «Создать мою песню» на предыдущем шаге.',
          alertLinkCopied: 'Ссылка скопирована. Вставьте её в Safari или Chrome и откройте.',
          alertHeroName: 'Введите имя', alertError: 'Ошибка', alertDeleteConfirm: 'Удалить «{name}»? Это действие нельзя отменить.',
          alertSubmitError: 'Ошибка при отправке',
          copyLinkPrompt: 'Скопируйте эту ссылку и откройте в браузере:',
          songFormingText: 'Твоя песня формируется и придёт в этот чат, когда будет готова.',
          heroesLoading: 'Загрузка...', heroesEmpty: 'Пока нет героев. Нажми «Добавить героя».',
          heroesEmptyFull: 'Пока нет ни одного героя.<br>Добавь первого — и создавай для него<br>персональные песни в один тап.', heroesSearchNotFound: 'По запросу ничего не найдено.', heroesZeroTitle: 'В картотеке пока пусто', heroesZeroDesc: 'Добавь близкого человека — и оракул соберёт для него песню по дате рождения.', heroesZeroHint: 'Например: партнёр · дети · родители · друзья', heroesZeroCta: 'Добавить первого героя',
          heroSoloBtn: 'Соло', heroDuoBtn: 'Вместе со мной', heroEditBtn: 'Изменить', heroDeleteBtn: 'Удалить',
          heroesLoadError: 'Не удалось загрузить. Попробуй позже.',
          loading: 'Загрузка…', noCardsYet: 'Нет завершённых карточек', heroHistLoading: 'Загрузка истории…', heroHistEmpty: 'Генераций пока нет', heroHistLoadError: 'Не удалось загрузить историю', heroesPageLoadError: 'Не удалось загрузить героев', retry: 'Повторить',
          forMyself: 'Для себя', forHero: 'Создать песню для {name}', heroDataTitle: 'Данные {name}',
          mtTooltipLyrics: 'Текст', mtTooltipAnalysis: 'Расшифровка', mtTooltipDownload: 'Скачать', mtTooltipShare: 'Поделиться', mtTooltipVolume: 'Громкость', mtVolumeLabel: 'Громкость',
          previewHome: 'Главная', previewForm: 'Форма', previewPayment: 'Оплата', previewLoading: 'Загрузка', previewSuccess: 'Успех',
          supportBtn: 'Написать в поддержку',
          subActivated: 'Пакет активирован!', subBtnProfile: 'Мой профиль',
          helpPageTitle: 'Помощь и поддержка', helpPageSubtitle: 'Всё о YupSoul — просто и по делу',
          profileHelpBtn: 'Помощь и поддержка', profileDeleteAccountBtn: 'Удалить аккаунт',
          deleteAccountConfirm: 'Удалить аккаунт и все связанные данные?\n\nБудут удалены: профиль, настройки, данные о рождении, реферальная история.\n\nВаши созданные треки останутся в общей статистике, но будут отвязаны от вашего аккаунта. Это действие НЕОБРАТИМО.',
          profileSectionTheme: 'Тема оформления', themeAuto: 'Авто', themeLight: 'Светлая', themeDark: 'Тёмная',
          profileSubsLink: 'Пакеты', payOvSubsLink: 'пакеты и управление',
          legalTabOffer: 'Оферта', legalTabPrivacy: 'Конфиденциальность', legalTabSubs: 'Пакеты', legalCloseAria: 'Закрыть',
          profilePageTitle: 'Профиль', profileSectionMyData: 'Мои данные', profileSectionPlans: 'Пакеты',
          profileLoadError: 'Не удалось загрузить профиль', profileLoadRetry: 'Обновить',
          profileEditBtn: 'Изменить →', profileEditLabelName: 'Имя', profileEditLabelDate: 'Дата рождения', profileEditLabelCity: 'Город рождения', profileEditNamePh: 'Ваше имя', profileEditCityPh: 'Город рождения', profileEditSaveBtn: 'Сохранить', profileEditCancelBtn: 'Отмена',
          profileBalanceHintText: 'Приглашай друзей — получай Искры',
          profileSectionTracks: 'Разовые треки', profileTracksNote: 'Без пакета — оплати один трек, когда захочешь.', profileRefTagline: 'Делись ссылкой — когда друг оформляет подписку, тебе начисляются Искры.',
          tuTitle: 'Пополнить Искры', tuBalance: 'на твоём балансе · 1 песня = 100 Искр', tuBalanceVk: 'на твоём балансе · 1 вопрос Оракулу = 1 Искра', tuChoose: 'Сколько добавить', tuCta: 'Пополнить', tuPack1k: '≈ 10 песен', tuPack2k: '≈ 20 песен', tuPack5k: '≈ 50 песен', tuSave2k: 'выгоднее', tuSave5k: 'максимум', tuEntrySub: '1000 / 2000 / 5000 Искр на новые песни',
          iskryPacksTitle: 'Пополнить Искры', iskryPack1000Name: '1000 Искр', iskryPack1000Desc: '10 песен',
          iskryPack2000Name: '2000 Искр', iskryPack2000Desc: '20 песен',
          iskryPack5000Name: '5000 Искр', iskryPack5000Desc: '50 песен — лучшая цена', iskryPackSongs: 'песен', vkPackHeader: 'Пакет', vkPackName: 'Пакет {n} песен', vkPackSongs: '{n} персональных песен', vkCardoteka: 'картотека людей',
          vkIskryUnavailable: 'Покупка пакетов Искр недоступна на VK. Получи пакет услуг или пригласи друга.',
          profileRefInvited: 'Приглашено', profileRefActivated: 'Активировано', profileRefSparks: 'Искры',
          planCurrentBadge: 'Текущий', planFreeYours: 'Уже у тебя', planSubscribeBtn: 'Оформить',
          plTitle: 'Пакеты', plBalance: 'Твой баланс', plTopup: 'Пополнить', plSubsSec: 'Подписки · полный доступ', plSubsSecVk: 'Пакеты · полный доступ', plPacksSec: 'Пакеты Искр · разово', plBasicTag: 'Basic', plPlusTag: 'Plus', plLabTag: 'Master', plBasicF1: '5 треков каждый месяц', plBasicF2: 'Оракул — 50 вопросов в месяц', plBasicF3: 'История заказов', plPlusF1: '15 треков каждый месяц', plPlusF2: 'Оракул без лимита', plPlusF3: 'Приоритет в очереди генерации', plLabF1: '30 треков каждый месяц', plLabF2: 'Картотека людей', plLabF3: 'Оракул без лимита + приоритет', plFlag: 'выбирают чаще', plBasicCta: 'Подключить «Душу»', plPlusCta: 'Подключить «Глубину»', plLabCta: 'Подключить «Лабораторию»', plOnceSec: 'Разовые покупки', plBuy1: 'Песня о себе', plBuy1s: 'Звуковой ключ по твоему узору', plBuy2: 'Песня про двоих', plBuy2s: 'Совместимость по двум раскладам', plBuy3: 'Энергия дня', plBuy3s: 'Звук конкретного момента', plBuyPrice: '100 Искр', plLegalHtml: 'Любая песня — 100 Искр. Пакеты — разовая оплата на 30 дней, без автоматических списаний. Оплата картой, Stars или Искрами; промокоды — на разовые покупки. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Оферта</a>.', plLegalVkHtml: 'Искры пополняются картой и тратятся на вопросы Оракулу. Пакеты — разовая покупка. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Оферта</a>.', tuBalanceVk: 'на твоём балансе · 1 вопрос Оракулу = 1 Искра', tuPack1kVk: '≈ 1000 вопросов Оракулу', tuPack2kVk: '≈ 2000 вопросов Оракулу', tuPack5kVk: '≈ 5000 вопросов Оракулу', tuEntrySubVk: '1000 / 2000 / 5000 Искр для вопросов Оракулу', iskryPackQuestions: 'вопросов Оракулу',
          planFreeName: 'Искатель', planFreeBadge: '✦ YupSoul Искатель',
          planFreeNameClassic: '(Стартовый)', planBasicNameClassic: '(Базовый)', planPlusNameClassic: '(Плюс)', planMasterNameClassic: '(Мастер — Лаборатория)',
          planBasicName: 'Душа', planPlusName: 'Глубина',
          planDetailsBtn: 'Подробнее', planPopularBadge: 'выбирают чаще', planMasterBadgeText: 'Лучший выбор',
          planMasterNameText: 'Лаборатория', planOpenMasterBtn: 'Открыть Лабораторию',
          planModalSection: 'Что входит', planModalSubscribe: 'Оформить {title}', planModalClose: 'Закрыть',
          planConfirmHeader: 'Тариф',
          vkPackHeader: 'Пакет', vkPackName: 'Пакет {n} песен', vkPackSongs: '{n} персональных песен', vkCardoteka: 'картотека людей',
          ptiSingleName: 'Для себя', ptiSingleDesc: 'Твоя личность в звуке',
          ptiCoupleName: 'Для двоих', ptiCoupleDesc: 'Ваша связь и резонанс',
          ptiTransitName: 'Энергия дня', ptiTransitDesc: 'Песня под сегодняшний день',
          successTitle: 'Заявка принята!', successDesc: 'Твоя песня генерируется. Как только будет готова — придёт в бот. Обычно 10–20 минут.', successWhereTrack: 'Песня появится в разделе<br><b>Мои треки</b>',
          successHint: 'Не пришла через 20 мин? Напиши боту «песня не пришла».', successToProfile: 'Перейти в профиль',
          successListen: 'Перейти в бот', successMyTracks: 'Мои треки',
          typewriter1: 'Создавай песню о себе на любую тему.',
          typewriter2: 'Получи текстовую расшифровку на основе глубинного анализа своего запроса.',
          typewriter3: 'Общайся со своей душой с помощью Душевного чата.',
          typewriter4: 'Искры уже ждут — создай свою песню.',
          typewriter5: 'Заводи карточки с данными своих близких или клиентов для быстрого доступа.',
          typewriter6: 'Соединяй карточки с данными близких.',
          typewriter7: 'Сделай уникальный глубокий подарок себе и близким.',
          loadingTitle: 'Заявка принята', loadingGenerating: 'Создаём твою песню...', loadingWait: 'Обычно 10–15 минут. Появится в «Мои треки».', rateLimitError: 'Сервер обрабатывает запрос. Подожди немного и попробуй снова.',
          heroesPageTitle: 'Контакты', heroesPromoHeading: 'Личный кабинет для мастеров',
          heroesPromoDesc: 'Добавляй людей один раз — и генерируй для них песни в один тап. Полная история с текстами.',
          heroesPromoFeaturesTitle: 'Что входит в тариф:',
          heroesF1: '✦ Неограниченное число героев', heroesF2: '✦ Быстрый запуск соло и совместных песен',
          heroesF3: '✦ Предпочтения по стилю музыки', heroesF4: '✦ Полная история генераций с текстами и анализом',
          heroesF5: '✦ Аудио прямо из карточки героя',
          heroesTrialBtn: '1 день бесплатно — попробовать', heroesSubBtn: 'Получить Лабораторию — 3 250 ₽',
          heroesSubNote: '30 треков',
          heroFormTitle: 'Добавить героя', heroRelLabel: 'Кто для тебя', heroBirthdateHint: 'Выбери день, месяц и год',
          heroTimeBirthLabel: 'Время рождения', heroStyleLabel: 'Любимые стили музыки', heroStylePh: 'поп, джаз, электронная…',
          requestPreferredStyleLabel: 'Стиль песни',
          requestPreferredStylePh: 'поп, r&b, рэп, хип‑хоп, техно, house, ambient…',
          styleQuickLabel: '✦ Стили музыки',
          heroRelOpt0: '— выбери —', heroRelOpt1: 'Мать', heroRelOpt2: 'Отец', heroRelOpt3: 'Дочь', heroRelOpt4: 'Сын',
          heroRelOpt5: 'Сестра', heroRelOpt6: 'Брат', heroRelOpt7: 'Бабушка', heroRelOpt8: 'Дедушка',
          heroRelOpt9: 'Муж', heroRelOpt10: 'Жена', heroRelOpt11: 'Любимый человек',
          heroRelOpt12: 'Друг', heroRelOpt13: 'Подруга', heroRelOpt14: 'Коллега', heroRelOpt15: 'Наставник', heroRelOpt16: 'Другое',
          dateDay: 'День', dateMonth: 'Месяц', dateYear: 'Год',
          scLoading: 'Загружаю…', scCheckingAccess: 'Проверяем ваш пакет: включён ли Чат с Оракулом или у вас разовый доступ…', scTyping: 'Чат с Оракулом печатает…', scHeroTagline: 'Разговор с душой', scPromoIntro: 'Чат с Оракулом — твой ИИ-ассистент, который понимает тебя словно лучший друг или Высшее Я. Отвечает на вопросы о характере, предназначении и пути.',
          scPromoErrorText: 'Получите пакет или купите доступ на сутки', scPromoRetryBtn: 'Обновить',
          scMoreBtnText: 'Подробнее ↓', scMoreBtnCollapse: 'Свернуть ↑', scStat1: 'отмечают снижение тревоги', scStat2: 'чувствуют себя понятыми',
          scStat3: 'быстрее находят ответ', scStat4: 'возвращаются снова',
          scExamplesTitle: 'Примеры вопросов',
          scEx1: '«Почему мне так сложно говорить о своих чувствах?»', scEx2: '«Какой мой главный страх и как с ним работать?»',
          scEx3: '«В чём моё предназначение и как к нему прийти?»',
          profileNotifDisable: 'Отключить уведомления', profileNotifEnable: 'Включить уведомления',
          scSubIncluded: 'Чат с Оракулом включён в пакет', scChoosePlanBtn: 'Выбрать тариф →', scSubMobileHint: 'Оплата на платформе недоступна',
          scGiftHeading: 'Попробуй Чат с Оракулом — 24 часа', scGiftNote: 'Один раз для каждого пользователя',
          scGiftBtnText: 'Получить 24 часа бесплатно', scBuyDayNote: 'Не готов к пакету? Попробуй разовый доступ',
          scBuyDayBtnText: 'Открыть Чат с Оракулом на 24ч — 199 ₽', scQuickBuyDay: 'Доступ на 24 часа — 199 ₽', scToastPaymentReceived: 'Оплата получена, доступ открыт',
          scSubRequiredForReply: 'Для продолжения диалога с Оракулом нужен пакет',
          scPickerTabSynastryText: 'Совместимость', scSynastryTeaserText: 'Совместимость — диалог по двум датам рождения — доступна в тарифе Лаборатория',
          helpT1: 'Что такое YupSoul', helpB1: '<p>YupSoul создаёт <strong>персональную песню именно для тебя</strong> — на основе даты, времени и места рождения. Система анализирует твою личность и пишет песню о твоих реальных качествах, пути и силе.</p><p>Это не шаблон и не случайный текст — каждая песня уникальна и создана только для тебя.</p>',
          helpT2: 'Что можно создать', helpB2: '<p><strong>Режимы создания:</strong></p><ul><li><strong>Песня о себе</strong> — твой личный звуковой портрет: кто ты, твоя сила и внутренний путь</li><li><strong>Песня для пары</strong> — для двоих (влюблённых, друзей, подруг). Анализирует обе даты рождения и отражает союз</li><li><strong>Энергия дня</strong> — песня под конкретную дату и место. Какие возможности открываются прямо сейчас</li></ul><p><strong>Стиль музыки:</strong></p><ul><li><strong>Свой стиль</strong> — выбери жанр и настроение вручную</li><li><strong>Астро-стиль</strong> — система подберёт стиль на основе твоих данных</li><li><strong>Как у звезды</strong> — укажи любимого артиста, и песня зазвучит в его стиле</li></ul><p><strong>Быстрые запросы</strong> — готовые идеи: песня силы, поздравление с днём рождения, медитативная, про отпускание прошлого и другие.</p><p><strong>Чат с Оракулом</strong> — ИИ-ассистент, который понимает тебя на глубинном уровне. Задавай вопросы о характере, предназначении и пути.</p>',
          helpT3: 'Сколько ждать песню', helpB3: '<p>Обычно <strong>5–15 минут</strong>. Бот пришлёт уведомление в чат, как только песня будет готова.</p><p>Можно закрыть приложение — результат придёт сам, ты ничего не потеряешь.</p>',
          helpT4: 'Не знаю точное время рождения', helpB4: '<p>Не страшно. Отметь <strong>«Время неизвестно»</strong> — система создаст полноценную песню на основе остальных данных.</p>',
          helpT5: 'Искры и оплата', helpB5: '<p><strong>Первую песню создаёшь сразу — минута звучания в подарок; понравилась — открой целиком одним лёгким платежом.</strong></p><p>Искры — за дела: забирай Искру дня (+2 каждый день, +10 за серию 7 дней), +30 за знакомство с приложением, +5 за уведомления.</p><p>Получай больше Искр, приглашая друзей: поделись ссылкой из раздела «Профиль» → «Пригласи друга». Когда приглашённый друг оформляет подписку — тебе начисляются Искры.</p>',
          helpT6: 'Оплата и промокоды', helpB6: '<p>Дополнительные генерации оплачиваются по тарифу. Способы оплаты отображаются на экране при оформлении заявки.</p><p>Если у тебя есть <strong>промокод</strong> — введи его на экране оплаты. Промокоды чувствительны к регистру, вводи точно как написано.</p>',
          helpLegalTitle: 'Правовая информация', helpLegalSeller: 'Исполнитель: ИП Татауров Антон Юрьевич, ИНН 920000802153, г. Севастополь', helpLegalSupport: 'Поддержка: кнопка «Написать в поддержку» выше — отвечаем в течение дня', helpLegalOffer: 'Оферта: оплата, возврат, правила услуги', helpLegalPrivacy: 'Конфиденциальность', errPayPlatform: 'Оплата на платформе недоступна',
          helpT7: 'Что-то пошло не так', helpB7: '<p><strong>Приложение закрылось или показало ошибку</strong> — попробуй открыть бота заново. Незавершённые заявки восстанавливаются автоматически.</p><p><strong>Оплатил, но песни нет</strong> — подожди 15–20 минут. Если результата нет — напиши боту «песня не пришла». Или напиши в поддержку.</p><p><strong>Промокод не принимается</strong> — проверь регистр букв. Если всё верно — напиши нам с указанием кода.</p>',
          helpT8: 'Чат с Оракулом и пакеты', helpB8: '<p><strong>Чат с Оракулом</strong> — разговор с твоей душой на основе твоих данных. Задавай вопросы о характере, предназначении, выборе. Открыт всем: первые 10 вопросов бесплатно, дальше 1 вопрос = 1 Искра. Подписка снимает лимит — Душа (50 вопросов/мес), Глубина и Лаборатория (без лимита). Можно купить доступ на 24 часа.</p><p><strong>Пакеты</strong> — Душа (5 треков + Чат с Оракулом), Глубина (15 треков + Чат с Оракулом без лимита + расшифровка), Лаборатория (30 треков, картотека людей, Чат с Оракулом без лимита + расшифровка). Расшифровка — текстовый разбор песни — включена в Глубину и Лабораторию; для Души и разовых треков — первая в подарок, далее отдельно. Получить — в разделе «Профиль» или на экране оплаты.</p>',
          helpT9: 'Возможности для мастеров', helpB9: '<p><strong>Картотека и совместимость.</strong> Ведите картотеку клиентов, анализируйте совместимость по двум датам — одна песня на пару. Идеально для астрологов и консультантов.</p><p><strong>Масштаб без потери качества.</strong> До 30 треков с пакетом Лаборатория. Уникальный контент для каждого клиента — без шаблонов и повторов.</p><p><strong>Монетизация и подарки.</strong> Дарите песни клиентам, включайте в пакеты консультаций или продавайте отдельно. Минута первой песни в подарок — попробуйте сами.</p>',
          helpT10: 'Что говорят пользователи', helpB10: '<p><em>«Это невероятно! Песня точно описала мой характер и то, что я переживаю сейчас. Мурашки!»</em> — Анна М.</p><p><em>«Подарил жене на день рождения — она была в восторге! Теперь хотим песню про нашу пару»</em> — Дмитрий К.</p><p><em>«Минута песни в подарок — это честно. Качество на высоте, обязательно закажу ещё»</em> — Елена В.</p>',
          helpSearchPh: 'Поиск по вопросам…', helpSearchAria: 'Поиск по вопросам', helpSearchClear: 'Очистить', helpFaqTitle: 'Частые вопросы', helpSearchEmpty: 'Ничего не нашлось', helpFound: 'найдено',
          helpHeroTitle: 'Чем можем помочь?', helpHeroSub: 'Всё о YupSoul — просто и по делу. Найди ответ или напиши нам.', helpPartnerSub: 'Зарабатывай 20% с подписок друзей', helpFoot: '✦ Мы рядом — ответим в течение дня ✦',
          helpPartnerTitle: 'Партнёрская программа',
          profileBalanceLbl: 'Баланс Искр',
          profileTracksLeftLbl: 'Осталось треков',
          profileOnBalanceSuffix: 'на балансе',
          homeIskryHintGuest: 'Начни — минута твоей первой песни в подарок',
          homeIskryHintEnough: 'У тебя {n} Искр — хватит на трек',
          homeIskryHintLow: 'У тебя {n} Искр — пригласи друга, чтобы создать трек',
          homeIskryHintZero: 'Пригласи друга — Искры за его подписку',
          songCounterLabel: 'человек узнали себя',
          planFreeF1: 'Первая песня — минута в подарок', planFreeF2: 'Все форматы',
          planBasicF1: '✦ 5 треков', planBasicF2: '✦ Чат с Оракулом (50 сообщений)', planBasicF3: 'История заказов', planBasicSave: '−67% vs разовых',
          planPlusF1: '✦ 15 треков', planPlusF2: 'Чат с Оракулом без лимита', planPlusF3: 'Приоритет обработки', planFeatDiary: 'Дневник Оракула — разбор каждое утро', planPlusF4: 'Полная история треков', planPlusSave: '−72% vs разовых',
          planMasterF1: '✦ 30 треков', planMasterF2: 'Картотека людей', planMasterF3: 'История генераций', planMasterF4: 'Чат с Оракулом без лимита', planMasterSave: '−83% vs разовых',
          perMonth: '/мес', iskryUnit: 'Искр', iskryStatEarned: 'Получено', iskryStatSpent: 'Потрачено', iskryBreakdownSongs: 'На песни', iskryBreakdownChat: 'Чат с Оракулом', planBasicPrice: '810 ₽', planPlusPrice: '2 030 ₽', planMasterPrice: '3 250 ₽',
          scPlanBasicDesc: '5 треков + Чат с Оракулом', scPlanPlusDesc: '15 треков + Чат без лимита', scPlanMasterDesc: '30 треков + Чат без лимита',
          planPlusF5: 'Выбор стилей музыки', planMasterF5: 'Выбор стилей музыки',
          profileTracksThisMonth: 'Треков в пакете', profileTracksRemaining: '{n} треков ещё доступно',
          profileRenewalDate: 'Пакет активен', planStatusActive: '✓ Активен', profileNextCharge: 'Следующее списание: {date}',
          profileCardNotLinked: 'Карта не привязана. Привяжите карту для полного управления.',
          profileBindCard: 'Привязать карту', profileUnbindCard: 'Отвязать карту', profileChangeCard: 'Сменить карту', profilePaymentMethod: 'СПОСОБ ОПЛАТЫ',
          profileActiveSubscription: 'Пакет активен', profileCancelSubscription: 'Деактивировать пакет', profileSubCardLabel: 'Карта привязана',
          subCancelledGrace: 'Пакет использован', subCancelledBadge: 'Использован', subReactivateBtn: 'Возобновить', profileSubExpires: 'Пакет активен',
          subExpiredTitle: 'Пакет использован', subExpiredMsg: 'Твой пакет «{planName}» использован', subExpiredReactivate: 'Возобновить «{planName}»', subExpiredOrSingle: 'или купить одну песню',
          trackLimitUpgradeToPlus: 'Перейти на Глубина — 15 треков', trackLimitUpgradeToMaster: 'Перейти на Лаборатория — 30 треков',
          subExpiryBanner3d: 'Пакет действует ещё {n} дн.', subExpiryBanner1d: 'Пакет действует ещё 1 день', subExpiryManageBtn: 'Управление',
          iskryNotEnough: 'У тебя {current} Искр. Нужно ещё {needed}', unlockIskryNeedPack: 'Первую песню Искрами открывает пакет Искр. Выбери пакет — или открой напрямую', iskryNoneToast: 'Нет Искр для оплаты', iskryNeedTopup: 'Для оплаты Искрами нужно {needed}. Пополни баланс или введи промокод ниже.', iskryNotEnoughFull: 'Недостаточно Искр (нужно {n}). Пополни баланс или введи промокод.', iskryNotEnoughVk: 'Недостаточно Искр (нужно {n}). Пополни баланс.', iskryNeedTopupVk: 'Для оплаты Искрами нужно {needed}. Пополни баланс.', iskryPayRetry: 'Не получилось оформить. Попробуй ещё раз или выбери другой способ.', playLabel: 'Слушать', pauseLabel: 'Пауза', suPromoNoted: 'Код принят — применится при открытии песни', payAuthLost: 'Перезайди в приложение и попробуй снова.', payLinkCopied: 'Ссылка на оплату скопирована', iskryTopUpViaReferral: 'Пригласи друга — Искры за его подписку', iskryDepletedReferralHint: 'Искры закончились. Пригласи друга!',
          soulChatExpiresIn: 'Доступ: ещё {hours}ч {minutes}мин',
          formStep1: 'Шаг 1', formStep2: 'Шаг 2', formStep3: 'Шаг 3',
          refFriend1: 'друг', refFriend2: 'друга', refFriend5: 'друзей', refLinkLoading: 'Загрузка…',
          profileConnectedServices: 'Подключённые сервисы', profileLinkedLoading: 'Загружаем…',
          profileLinkTgBtn: 'Привязать Telegram', profileLinkGoogleBtn: 'Привязать Google',
          refEarningsLabel: 'Ваши Искры:',
          refNextHintFirst: 'За каждого друга, который создаст песню — 10 Искр',
          refNextHintNext: 'За каждого друга, который создаст песню — 10 Искр',
          iskryTitle: 'Ваши Искры',
          linkedStatusLinked: 'Привязан', linkedStatusNotLinked: 'Не привязан', linkedStatusNoData: 'Нет данных', linkedStatusLoadFail: 'Не удалось загрузить',
          linkedGoogleLinked: 'Google привязан!', linkedGoogleFail: 'Не удалось привязать Google. Попробуй ещё раз.', linkedConnFail: 'Не удалось подключиться. Проверь соединение.',
          linkedTgOpenBot: 'Открой бота в Telegram и нажми Старт. Затем вернись и обнови страницу.',
          profileLinkTgHint: 'Нажми кнопку — откроется бот, нажми Старт для привязки.',
          linkedGoogleSdkFail: 'Google Sign-In недоступен. Попробуй из браузера.',
          cancelSubFail: 'Не удалось деактивировать пакет. Попробуй ещё раз.',
          trackLimitTitle: 'Лимит исчерпан',
          trackLimitMsg: 'Лимит треков на этот месяц исчерпан.',
          trackLimitHint: 'Обнови тариф или купи песню отдельно.',
          trackLimitActionsTitle: 'Что дальше?',
          trackLimitBuySingle: 'Купить одну песню',
          trackLimitUpgrade: 'Улучшить пакет',
          trackLimitPayIskry: 'Оплатить Искрами',
          trackLimitBackToProfile: 'Вернуться в профиль',
          trackLimitPayHint: 'Лимит пакета исчерпан. Оплати дополнительную песню.',
          labHintTitle: 'Лаборатория',
          labHintDesc: 'Сохраняй карточки близких и выбирай их одним тапом — не нужно вводить данные каждый раз',
          labHintGo: 'Узнать больше',
          labHintLater: 'Позже',
          guestName: 'Гость',
          quickPickerLabel: '✦ Быстрые запросы',
          inboxTitle: 'Уведомления', inboxEmpty: 'Пока нет уведомлений', inboxOpen: 'Открыть',
          forWhoLabel: 'Для кого генерируем?', forWhoAddContact: '+ Добавить контакт', pickFromLab: 'Выбрать из Лаборатории', pickFromLabSelected: 'Выбрано: ', pickFromLabEmpty: 'Нет сохранённых людей. Добавляй их в разделе Лаборатория.', pickFromLabHint: 'Выбери человека из Лаборатории — поля заполнятся автоматически',
          coupleSrcMePerson: 'Я + Человек', coupleSrcCardCard: 'Карточка + Карточка', couplePerson1Label: 'Первый человек', couplePerson1Pick: 'Выбрать из Лаборатории', couplePerson1Required: 'Выбери первого человека из Лаборатории', coupleSelfCard: 'Я',
          nameLbl: 'Имя', birthdateLbl: 'Дата рождения', birthplaceLbl: 'Место рождения', birthtimeLbl: 'Время рождения', birthtimeUnknownHint: 'Время неизвестно',
          payOvCardTitleDefault: 'Оплата пакета / заявки', payOvTrialText: 'Используй свои Искры!', payOvFreeClaimBtn: 'Оплатить Искрами — ' + ISKRY_PRICES.single_song + ' Искр',
          payOvPromoToggle: '▸ Есть промокод?', orPay: 'Или оплати:', priceLabel: 'Цена:',
          payOvLinkHint: 'Если окно не открылось — скопируйте ссылку и вставьте в браузер:',
          payOvCopyBtn: 'Скопировать ссылку оплаты', payOvCheckBtn: 'Я уже оплатил — проверить',
          payOvPromoConfirmBtn: 'Подтвердить и отправить',
          paymentThanksTitle: 'Оплата получена', paymentThanksMsg: 'Проверяем платёж и обновляем доступ. Это может занять до минуты.',
          paymentThanksHintText: 'Не пришла за 20 минут? Напиши боту «песня не пришла»',
          logoSubtitle: 'Музыкальный оракул', homeBrand: 'МУЗЫКАЛЬНЫЙ ОРАКУЛ',
          homeTeaser: 'В твоей дате скрыт дар по рождению, раскрой его через песню', homeTeaserHtml: 'В твоей <span class="tagline-glow">дате</span> скрыт дар по рождению, раскрой его через <span class="tagline-glow">песню</span><span class="tagline-underline"></span>',
          startBenefitAbout: 'О тебе', startBenefitCompat: 'Совместимость', startBenefitDaily: 'Песня дня', startBenefitFinance: 'Финансы',
          wlHeadline1: 'Песни по твоей дате рождения',
          wlHeadline2: 'на все случаи жизни',
          wlPlaylistKick: 'Создай свой плейлист',
          wlPlaylistName: 'Хиты про тебя',
          wlPlaylistSub: 'по дате рождения · на все случаи',
          wlTrack1Name: 'Я — не функция, я — жизнь',
          wlTrack1Desc: 'о том, что ты живой',
          wlTrack2Name: 'Хранительница порога',
          wlTrack2Desc: 'песня на день рождения',
          wlTrack3Name: 'Для любимого',
          wlTrack3Desc: 'признание',
          wlLoginTitleHtml: 'Узнай, как звучит <span class="home-card-title-accent">твоя</span> дата рождения',
          wlProof: '3000+ песен уже создано',
          loginVia: 'Вход через',
          review1: 'Это просто фантастика! Серьёзно, вы считали меня! Это просто супер проект!', reviewAuthor1: 'Роман',
          review2: 'Кайф! Стиль тот что люблю, слова прямо в сердце!', reviewAuthor2: 'Юлия',
          review3: 'Зашло то как. Откуда ИИ могло знать про чертежи, про кофе, про отчеты. Браво!!!', reviewAuthor3: 'Геннадий',
          review4: 'Очень понравилась динамика: от спокойного к мощному. Определенные моменты совпадают!', reviewAuthor4: 'Александр',
          review5: 'Первая просто шедевр! Удивили, прослушал её раз 15, маме переслал.', reviewAuthor5: 'Владимир',
          review6: 'Очень красивая и легкая песня, прям можно медитировать слушая её!', reviewAuthor6: 'Пользователь',
          homeServiceDesc: 'Единственный сервис, где песня создаётся по глубокому анализу твоей даты рождения.',
          homeChoicesHead: 'ТОЛЬКО ЗДЕСЬ', homeChoicesHeadMain: 'Попробуй сегодня',
          homeChoiceMain1: 'Песня дня', homeChoiceMain2: 'Кто я?', homeChoiceMain3: 'Как у звезды', homeChoiceMain4: 'Совместимость', homeChoiceMain5: 'Дневник Оракула',
          // Натив VK (оракул-only): главная, пустой плейлист, вопросы-пресеты
          vkOracleHeroTitleHtml: 'Оракул знает твою <span class="home-card-title-accent">дату рождения</span> — и отвечает',
          vkOracleHeroCta: 'Задать вопрос', vkOracleChoicesHead: 'Спроси сегодня',
          vkOracleChoice1: 'Кто я?', vkOracleChoice2: 'Мой дар', vkOracleChoice3: 'Деньги', vkOracleChoice4: 'Любовь',
          vkOracleAskBtn: 'Спросить оракула',
          vkOracleEmptyTitle: 'Оракул отвечает на твои вопросы',
          vkOracleEmptyDesc: 'Спроси о себе — по дате рождения',
          vkOracleQ1: 'Расскажи, кто я по своей дате рождения — какой у меня характер и на что опереться?',
          vkOracleQ2: 'В чём мой дар по дате рождения — что мне дано от рождения и как это раскрыть?',
          vkOracleQ3: 'Как у меня с деньгами по дате рождения — где мой денежный канал и что его открывает?',
          vkOracleQ4: 'Что мне важно знать про любовь и отношения по моей дате рождения?',
          homeChoice1: 'Песня дня', homeChoice1Hint: 'Каждый день несёт уникальную энергию. Узнай свою через музыку.',
          homeChoice2: 'Песня обо мне', homeChoice2Hint: 'В один клик — песня, написанная по твоей дате рождения.',
          homeChoice3: 'Чат с Оракулом', homeChoice3Hint: 'Твой персональный ИИ-ассистент на основе даты рождения.',
          homeChoice4: 'Подарок другу', homeChoice4Hint: 'Удиви близкого уникальной песней — расскажи ему в музыке, какой он особенный.',
          navSoulChat: 'Оракул', navHelp: 'Помощь', navLab: 'Контакты', navTracks: 'Плейлист',
          navSoulChatFull: 'Оракул', navMyTracks: 'Плейлист', navSoulChatShort: 'Оракул', navMyTracksShort: 'Плейлист', myHeroesShort: 'Контакты', myHelpShort: 'Помощь',
          soulChatPageTitle: 'Разговор по душам | Чат с Оракулом', scHeroTitle: 'Разговор по душам | Чат с Оракулом',
          myTracksPageTitle: 'Музыка', mtGlabelRecent: 'Недавние', mtCreateBtn: 'Создать новую песню',
          myTracksPageSubtitle: 'Твоя коллекция звуковых ключей',
          mtHeroBadge: 'Звуковые ключи',
          mtHeroTitle: 'Каждая песня — уникальный ключ к твоей душе',
          mtHeroDesc: 'Слушай, скачивай и делись. Все твои треки хранятся здесь навсегда.',
          myTracksLoading: 'Загрузка треков…',
          mtEmptyTitle: 'Здесь появятся твои песни',
          mtEmptyDesc: 'Создай первую — по дате рождения',
          mtEmptyCta: 'Создать песню',
          myTracksLoadMore: 'Загрузить ещё',
          mtNowPlayingTitle: 'Сейчас играет',
          mtNpFromCollection: 'Играет из коллекции',
          mtTabTracks: 'Мои треки', mtTabLiked: 'Любимое', mtTabRadio: 'Радио', mtSearchPh: 'Поиск по трекам', mtSearchAria: 'Поиск', mtLikedEmpty: 'Нажми ♡ на любом треке — и он появится здесь.', mtActPlay: 'Слушать', mtActShare: 'Поделиться', mtHeroEyebrow: 'Твоя коллекция', mtHeroSub: 'Созданы по твоей дате рождения', mtHeroPlayAll: 'Слушать всё',
          mtActSpark: 'Искра', mtActText: 'Текст', mtActAnalysis: 'Разбор', mtActDownload: 'Скачать', mtActShare: 'Поделиться', mtActBroadcast: 'В эфир', mtActGift: 'Подарить', mtActResing: 'Перепеть своими словами',
          shareSheetTitle: 'Поделиться песней', shareEyebrow: 'Моя песня души', shareFootCreate: 'Создай свою песню', shareCardSub: 'Песня по твоей дате рождения', shareFmtStory: 'Stories', shareFmtPost: 'Пост', shareFmtLink: 'Ссылка', shareCopyBtn: 'Копия', shareSaveImg: 'Сохранить картинку', shareTgtLink: 'Ссылка', shareTgtStory: 'Истории', shareTgtMore: 'Ещё', shareToVk: 'В Историю VK', shareToOk: 'Поделиться в ОК', shareToWeb: 'Поделиться', shareToTg: 'В Telegram', shareVkStory: 'В Историю', shareVkWall: 'На стену', shareHint: 'Отправь ссылку близкому — он откроет и послушает песню целиком.', shareCreateOwn: 'Создай свою песню', shareCopied: 'Скопировано', shareRendering: 'Готовлю картинку…', shareSaved: 'Картинка сохранена', shareSaveFail: 'Не удалось сохранить', karaokeTitle: 'Текст песни', karaokeSub: 'Караоке · строки в такт', diaryPwEyebrow: '3 дня пробного — позади', diaryPwMsgFrom: 'YupSoul · твоя настройка', diaryPwMsgTime: 'сегодня утром', diaryPwMsgBody: 'Доброе утро{name}. Сегодня день про **опору и спокойные решения**. Важный разговор лучше не торопить до обеда — после он пойдёт легче.', diaryPwMsgPin: 'Опора дня: тёплый разговор с близким', diaryPwH: 'Понравилось начинать день вот так?', diaryPwSub: 'Это твой Дневник. Каждое утро в Telegram — личное сообщение с настройкой именно на твой день. Пробные дни закончились — продолжим вместе.', diaryPwFeat1Title: 'Приходит в личку', diaryPwFeat1Desc: 'Каждое утро, в выбранное тобой время', diaryPwFeat2Title: 'Настройка по твоей дате', diaryPwFeat2Desc: 'Не общий гороскоп — разбор лично для тебя', diaryPwFeat3Title: 'Темы — на твой выбор', diaryPwFeat3Desc: 'Любовь, дело, энергия, отношения', diaryPwPlan: 'Входит в пакеты Глубина и Лаборатория', diaryPwCta: 'Продолжить дневник', karaokeEmpty: 'Текст этой песни пока недоступен', prismOracleRetry: 'Оракул задумался. Попробуй ещё раз.',
          rdTitle: 'Радио', rdSubtitle: 'Бесконечные волны по твоей энергии', rdOnAir: 'в эфире', rdLiveNow: 'Прямой эфир',
          rdYouLive: 'Ты в эфире', rdPitchTitle: 'Отправь песню в эфир', rdPitchSub: 'Её услышит всё сообщество YupSoul — живой поток из песен души.', rdNowLive: 'Сейчас в эфире — живой поток сообщества', rdLiveTitle: 'Твоя песня звучит для всех', rdReady: 'готова', rdYourSong: 'твоя песня', rdV1t: 'Тебя услышат вживую', rdV1s: 'Десятки людей в эфире прямо сейчас', rdV2t: 'Искры за реакции', rdV2s: 'Слушатели лайкают — ты получаешь Искры', rdV3t: 'Попади в топ недели', rdV3s: 'Лучшие песни эфира видит всё сообщество', rdRewardHtml: 'Песня в эфире <b>зарабатывает Искры</b> — а Искры превращаются в новые песни твоей души.', rdGo: 'Отправить в эфир', rdGoHint: 'Можно убрать из эфира в любой момент', rdLeave: 'Убрать из эфира', rdLeaveHint: 'Песня звучит в общем потоке YupSoul Радио', rdStatListens: 'прослушиваний', rdStatHearts: 'лайков', rdStatSparks: 'Искр заработано', rdReactHint: 'Слушатели реагируют на твою песню', rdRankTop: 'Топ недели', rdRankWave: 'волна', rdRankOf: 'из', rdRankClimb: 'Собирай лайки — поднимайся в топ недели',
          rdSongOfDay: 'Песня дня', rdSongOfDaySub: 'Энергия дня', rdNowListening: 'Сейчас слушают', rdWaves: 'Волны',
          rdCosmos: 'Космос', rdCosmosTag: 'Глубокий эмбиент', rdDuo: 'Две души', rdDuoTag: 'О любви и союзах',
          rdFlow: 'Поток', rdFlowTag: 'Деньги и движение', rdCalm: 'Тихая сила', rdCalmTag: 'Медитация и покой',
          rdGroza: 'Гроза', rdGrozaTag: 'Мощно и громко', rdListen: 'слушают', rdAllWaves: 'все ›',
          rdQuiet: 'тихо в эфире', rdSomeone: 'Кто-то', rdBeFirst: 'Тихо в эфире — включи волну первым', rdEmpty: 'Эта волна ещё наполняется', rdRadioArtist: 'YupSoul · Радио', rdShareToRadio: 'Поделиться в Радио', rdInRadio: 'Отправлено в Радио', rdShareDone: 'Трек отправлен на модерацию в Радио', rdShareOff: 'Трек убран из Радио',
          rwMood: 'По настроению', rwTender: 'Нежность', rwPower: 'Сила', rwLight: 'Свет', rwFlight: 'Полёт', rwCalm: 'Покой',
          rdWaveAll: 'Все волны', rdFresh: 'Свежее в эфире', rdTopWeek: 'Топ недели', rdNowOnAir: 'В эфире сейчас', rdAnon: 'Аноним', rdToday: 'сегодня', rdYesterday: 'вчера', rdLike: 'Нравится', rdMore: 'Ещё', rdReport: 'Пожаловаться', rdBlockAuthor: 'Не показывать этого автора', rdSheetCancel: 'Отмена', rdReportSent: 'Спасибо, мы посмотрим', rdReportHidden: 'Трек снят с эфира', rdBlockDone: 'Больше не покажем этого автора', rdActionFailed: 'Не получилось — попробуй ещё раз', errReportSelf: 'Это твоя песня', errBlockSelf: 'Это твоя песня', errTrackNotFound: 'Трек не найден', rdSave: 'Сохранить', rdListen2: 'Слушать', rdListensNow: 'слушает', rdEmpty2: 'Пока никто не публиковал песни на эту волну. Опубликуй свою первой — во вкладке «Мои треки».', rdSavedTitle: 'Сохранённое', rdSavedEmpty: 'Здесь будут песни из Радио, которые ты сохранишь. Нажми закладку на любой песне.', rdSavedToast: 'Сохранено в коллекцию', rdUnsavedToast: 'Убрано из коллекции', mtTabSaved: 'Сохранённое', navCancel: 'Отмена',
          pubInEther: 'В эфир', pubTitle: 'Опубликовать в Радио', pubSubtitle: 'Песню услышат другие слушатели. Снять с эфира можно в любой момент.', pubWave: 'Волна', pubShowAuthor: 'Показывать имя автора', pubAnon: 'Аноним', pubGo: 'Опубликовать', pubDoneTitle: 'Песня в эфире!', pubDoneText: 'Теперь её найдут другие слушатели в Радио.', pubYou: 'Ты', pubFail: 'Не удалось опубликовать',
          mngOnAir: 'В эфире', mngManage: 'Управление эфиром', mngManageText: 'Слушатели могут лайкать и сохранять её.', mngListeners: 'Слушали', mngLikes: 'Лайков', mngCollections: 'В коллекциях', mngOpenRadio: 'Открыть в Радио', mngUnpublish: 'Снять с эфира', mngUnpubDone: 'Снято с эфира', mtTrackDeleted: 'Песня удалена', mtUndo: 'Отменить',
          errTrackNotReady: 'Трек ещё не готов', errRadioWave: 'Выбери волну', errRadioProfanity: 'В этой песне есть нецензурные слова — её нельзя отправить в общий эфир', errTasteLockedRadio: 'Сначала открой песню целиком — потом её можно отправить в эфир',
          mtSelectTrack: 'Выберите трек',
          mtDownload: 'Скачать',
          mtLyrics: 'Текст',
          mtShare: 'Поделиться',
          mtLinkCopied: 'Ссылка скопирована',
          mtNoTitle: 'Песня души',
          mtModeSingle: 'Для себя',
          mtModeCouple: 'Про двоих',
          mtModeTransit: 'Энергия дня',
          mtAuthExpired: 'Сессия истекла. Обнови страницу или войди снова.',
          mtLoadError: 'Не удалось загрузить список. Проверь интернет.',
          mtLinkCopied: 'Ссылка скопирована', mtPlayError: 'Не удалось воспроизвести', mtLyricsTitle: 'Текст песни', mtAnalysisTitle: 'Расшифровка', mtCopied: 'Скопировано', mtCopyFail: 'Не удалось скопировать', mtCopyBtn: 'Копировать', mtCloseBtn: 'Закрыть', mtDownloading: 'Открываем...', mtShareFail: 'Не удалось поделиться',
          dlUnlockTitle: 'Заберём твою песню? 🎵', dlUnlockSub: 'Выбери, как забрать её к себе — это один тёплый шаг 🤍', dlUnlockJoin: 'Вступить и скачать', dlUnlockOr: 'или одно из заданий', dlUnlockShare: 'Поделиться песней', dlUnlockReview: 'Оставить отзыв', dlUnlockReviewPh: 'Пара тёплых слов о приложении…', dlUnlockReviewSend: 'Отправить и скачать', dlUnlockUpsell: 'С пакетом — скачивание без заданий.', dlUnlockClose: 'Позже', dlChecking: 'Секунду, проверяю…', dlDone: 'Готово, скачиваю', dlTryAgain: 'Пока не вижу — попробуй ещё раз', dlReviewShort: 'Пара слов побольше — и готово',
          dlGateTitle: 'Скачать песню', dlGateEyebrow: 'Первая песня — твоя', dlGateHeadline: 'Забери свою песню в подарок', dlGateLead: 'Выполни задание ниже — и файл песни сохранится на устройство. Это наш способ расти вместе.', dlGateSteps: 'Шаги для разблокировки', dlGateAltB: 'Не хочешь заданий?', dlGateAltRest: 'Оформи пакет — скачивай любые песни без шагов.', dlGatePacks: 'Пакеты ›', dlGateLocked: 'Выполни задание, чтобы скачать', dlGateReady: 'Скачать песню', dlGateHint: 'Файл сохранится в формате MP3 на твоё устройство', dlDoneTitle: 'Песня скачана 🤍', dlDoneTextRest: 'сохранена на устройство. Спасибо, что ты с нами — впереди ещё много музыки.', dlTrackFallback: 'Песня души', dlTrackSub: 'Песня души', dlTaskVkTitle: 'Вступить в сообщество', dlTaskVkSub: 'YupSoul во ВКонтакте', dlTaskVkAct: 'Вступить', dlTaskShareTitle: 'Поделиться песней', dlTaskShareSub: 'Расскажи друзьям о YupSoul', dlTaskShareAct: 'Поделиться', dlTaskReviewTitle: 'Оставить отзыв', dlTaskReviewSub: 'Пара тёплых слов о приложении', dlTaskReviewAct: 'Написать',
          myTracksWipTitle: 'Страница в разработке',
          myTracksWipText: 'Скоро здесь появятся ваши треки. Пока можно создать песню или открыть раздел «Разговор по душам».',
          profileMyTracks: 'Мои треки',
          footerSubManage: 'Управление пакетами', footerOffer: 'Оферта', footerPrivacy: 'Конфиденциальность',
          webLoginOr: 'Или', webLoginTelegram: 'Открыть в Telegram', googleSignIn: 'Войти через Google',
          webLoginTeaser: 'Войди через Google, чтобы создавать персональные песни. Или открой приложение в Telegram.',
          bsPromoToggle: 'Мне подарили промокод',
          bsChooseMethod: 'Выбери способ оплаты:',
          bsPayCard: 'Оплатить картой',
          payTitle: 'Оплата песни', paySecure: 'Защищено', cfTitle: 'Подтверждение оплаты', successEyebrow: 'Оплата получена', successEyebrowTaste: 'Твоя первая песня', successReceiptName: 'Песня души', successReceiptSub: 'уже в работе', successMaking: 'Оракул пишет твою мелодию…', successAskOracle: 'Спросить Оракула, пока ждём', successShare: 'Поделиться с близким', successReadyLine: 'Осталось дождаться — появится в «Плейлист»', successNotifyBtn: 'Оповестить, когда будет готова', successNotifyDone: 'Уведомим в VK ✓', successReadyTitle: 'Готово — твоя<br>песня рождается', successReadyLead: 'Спасибо тебе! <b>Песня души</b> уже создаётся — появится во вкладке «Плейлист» примерно через 15 минут.', cfSub: 'Проверь детали — и подтверждаем.', cfWhat: 'Покупка', cfIncludes: 'Что входит', cfTotal: 'К оплате', cfPay: 'Подтвердить и оплатить', payOrderEyebrow: 'Твой заказ', payOrderMeta: 'Уникальный трек по твоей дате · придёт в Telegram за ~15 минут', payPriceLabel: 'К оплате', payPriceSub: 'Разовая оплата · одна песня', payByIskry: 'Оплатить Искрами', payByPromo: 'Мне подарили промокод', payPromoSub: 'Введи код — спишем стоимость', pmTitle: 'Введи промокод', pmSub: 'Спишем стоимость или начислим Искры.', pmBack: 'Назад к оплате', promoLen3to50: 'Промокод должен быть от 3 до 50 символов', payRetry: 'Попробуй снова.', promoChecking: 'Проверяю промокод...', payTrustSecure: 'Безопасная оплата', payTrustHold: 'Заявка хранится 7 дней', payOvBack: 'Назад',
          bsPayStars: 'Оплатить звёздами',
          bsTopupIskry: 'Пополнить Искры', tuPack100: '= 1 песня', giftVkUnavail: 'Этот подарок нельзя открыть в этой версии приложения',

          bsDiscount: 'Скидка',
          bsGotIt: 'Понятно',
          bsClose: 'Закрыть',
          bsPaymentNotOpened: 'Если страница оплаты не открылась — нажми «Скопировать ссылку» ниже и открой её в браузере.',
          bsPaymentAccepted: 'Оплата принята.<br><br>Можешь закрыть это окно и вернуться в Telegram — песня придёт в чат с ботом.',
          bsDiscountApplied: 'Скидка: {amount} {currency}',
          bsPromoNotFound: 'Промокод не найден',
          bsPromoExpired: 'Промокод истёк',
          bsPromoLimit: 'Лимит использований исчерпан',
          bsPromoInvalid: 'Промокод недействителен',
          bsPromoCheckError: 'Ошибка проверки',
          bsPromoApplied: 'применено',
          bsFree: 'Бесплатно',
          bsConfirm: 'Подтвердить',
          bsConnectingBank: 'Подключаемся к банку…',
          bsPaymentCreateError: 'Не удалось создать платёж. Попробуй другой способ оплаты.',
          bsTracksPerMonth: 'персональных треков',
          navBack: 'Назад', navClose: 'Закрыть', loading: 'Загрузка…', btnRefresh: 'Обновить', btnSave: 'Сохранить', btnCancel: 'Отмена', btnSending: 'Отправляем…', btnSaving: 'Сохраняем…', btnOpening: 'Открываем…', btnUnlinking: 'Отвязываем…',
          helpPageTitle: 'Помощь и поддержка',
          phName: 'Имя (по желанию)', phBirthplace: 'Москва, Лондон, Нью-Йорк...', phName2: 'Имя (по желанию)', phBirthplace2: 'Москва, Лондон, Нью-Йорк...', nameHintEmpty: 'Впишешь имя — оно прозвучит в песне.', nameHintFilled: 'Это имя прозвучит в песне. Сотри, если не хочешь его слышать.', phTransitDate: 'ДД.ММ.ГГГГ', phTransitTime: 'ЧЧ:ММ', phTransitLocation: 'Москва, Лондон, Нью-Йорк...', phRequest: 'Например: про смелость начать заново', phPreferredStyle: 'Жанр или настроение музыки',
          phProfileName: 'Ваше имя', phDateDisplay: 'дд месяц гггг', phProfileCity: 'Город рождения', phPromoInput: 'Введите промокод',
          heroesAddBtn: '+ Добавить героя', heroesCountWord: 'героев', heroNamePh: 'Как зовут человека', heroBirthplacePh: 'Москва, Лондон, Нью-Йорк...', heroStylePh: 'поп, джаз, электронная…', heroNotesPh: 'Что важно помнить об этом человеке',
          heroEditTitle: 'Изменить героя', heroAddTitle: 'Добавить героя', confirmUnsavedExit: 'У вас несохранённые изменения. Выйти?',
          heroSaveFail: 'Не удалось сохранить. Попробуй ещё раз.', heroDeleteFail: 'Не удалось удалить. Попробуй ещё раз.',
          heroIncomplete: 'У героя не заполнены дата или место рождения. Открой карточку и дополни.',
          errHeroIncomplete: 'У выбранного героя не хватает данных. Дополни дату и место рождения в Лаборатории.',
          errMissingFields: 'Проверь дату рождения — без неё песню не собрать.',
          errVkSongsOracleOnly: 'Здесь работает оракул — задай ему вопрос о себе.', errClaimLocked: 'Искра дня пока недоступна.', errClaimAlready: 'Искру сегодня уже забрал — возвращайся завтра.',
          vkFormStubHint: 'Генерация песен на платформе недоступна',
          diarySaved: 'Дневник настроен!',
          diaryTrialStarted: 'Триал 3 дня активирован!',
          diaryActivateFail: 'Не удалось активировать. Попробуй ещё раз.',
          profileBalanceTitle: 'Мой баланс',
          errGenderRequired: 'Пол не может быть пустым. Выбери Женский или Мужской.',
          errInvalidGender: 'Недопустимое значение пола. Допустимо: Женский или Мужской.',
          today: 'Сегодня',
          scAskOracle: 'Спросить Оракула',
          fillProfileCta: 'Заполнить профиль',
          diaryContinueInChat: 'Продолжить в чате',
          heroGenHistory: 'История генераций', heroLyricsLabel: 'Текст песни', heroAnalysisBtn: 'Анализ', heroLetterBtn: 'Сопроводительное письмо', heroListenBtn: 'Слушать',
          noInternet: 'Нет интернета',
          partnerTitle: 'Кабинет партнёра', partnerStatusActive: 'Активен', partnerBalUnit: 'Искр · не потрачено', partnerStatsTitle: 'Статистика', partnerPromoTapCopy: 'Скопировать текст', partnerPromoTapDone: 'Скопировано', partnerDashFootNote: 'Выплаты раз в неделю', partnerApplyNamePh: 'Как вас зовут', partnerApplySocialsPh: '@username, ссылки на каналы', partnerApplyPlanPh: 'Как планируете привлекать пользователей',
          partnerApplySubmit: 'Отправить заявку', partnerApplySent: 'Заявка отправлена! Мы рассмотрим её и уведомим вас.',
          partnerApplyPending: 'Заявка на рассмотрении', partnerApplyPendingDesc: 'Мы рассмотрим вашу заявку и уведомим о решении в Telegram.',
          partnerApplyRejected: 'Заявка не одобрена', partnerApplyNameReq: 'Укажите ваше имя', partnerApplySocialsReq: 'Укажите ваши соцсети',
          partnerDashWalletPh: 'Реквизиты для выплаты', partnerDashWalletReq: 'Укажите реквизиты для выплаты',
          partnerDashNoAccruals: 'Пока нет начислений', partnerDashPayoutProcessing: 'Заявка на вывод обрабатывается',
          partnerDashPayoutSubmit: 'Запросить вывод', partnerDashPayoutSent: 'Заявка на вывод отправлена!',
          partnerDashCodeSaved: 'Код сохранён!', partnerDashCodeMinLen: 'Минимум 3 символа',
          partnerDashOpenTg: 'Откройте приложение через Telegram',
          partnerDashSendError: 'Ошибка отправки', partnerDashRetryLater: 'Повторите попытку позже',
          partnerApplyPageTitle: 'Партнёрская программа', partnerHowItWorks: 'Как это работает',
          partnerStepApply: 'Подайте заявку', partnerStepApproval: 'Одобрение', partnerStepShare: 'Делитесь ссылкой', partnerStepBonus: 'Получайте бонусы',
          partnerEarnHeadingHtml: 'Зарабатывай с <span style="display:inline-block;background:linear-gradient(120deg,#f472b6 0%,#ec4899 22%,#a78bfa 45%,#f97316 70%,#fbbf24 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 12px rgba(236,72,153,0.35));animation:accentGradientShift 6s ease-in-out infinite;">YupSoul</span>',
          partnerEarnDescHtml: 'Приглашай друзей и получай <strong style="color:var(--primary-color);">20% бонус в Искрах</strong> с каждого пакета твоих рефералов. Выплаты по заявке раз в неделю.',
          partnerSparksPerMonth: 'Искр / мес', partnerTierSoul: 'Душа', partnerTierDepth: 'Глубина', partnerTierLab: 'Лаборатория',
          partnerBonusNoteHtml: 'Бонусы начисляются в Искрах<br>Выплаты по заявке раз в неделю',
          partnerHeroTitleHtml: 'Зарабатывай вместе с <span class="pa-grad">YupSoul</span>',
          partnerHeroSub: 'Приглашай друзей и получай долю с каждого их пакета — в Искрах.',
          partnerStatCapHtml: '<b>в Искрах</b> с каждого пакета твоих рефералов — с каждой покупки',
          partnerStep1Title: 'Подай заявку', partnerStep1Sub: 'Расскажи о себе и своих каналах',
          partnerStep2Title: 'Получи одобрение', partnerStep2Sub: 'Мы рассмотрим и откроем доступ',
          partnerStep3Title: 'Делись ссылкой', partnerStep3Sub: 'Приглашай друзей в YupSoul',
          partnerStep4Title: 'Получай бонусы', partnerStep4Sub: 'Искры капают с каждого пакета',
          partnerTiersTitle: 'Сколько получишь за пакет', partnerTiersNote: 'Бонус начисляется с каждого пакета, который купит реферал',
          partnerPayoutTitle: 'Как получить деньги',
          partnerPfSparks: 'Искры', partnerPfSparksSub: 'копятся', partnerPfPayout: 'Выплата', partnerPfPayoutSub: 'раз в неделю',
          partnerPayoutFreq: 'раз в неделю', partnerPayoutFreqSub: 'выплаты', partnerPayoutMin: 'от 100 000', partnerPayoutMinSub: 'Искр к выводу',
          partnerApplyFormHeading: 'Заявка в партнёры', partnerApplyFormSub: 'Расскажи о себе — откроем доступ к программе.',
          partnerApplyBtn: 'Подать заявку',
          partnerNameLabelHtml: 'Ваше имя <span style="color:var(--primary-color);">*</span>',
          partnerSocialsLabelHtml: 'Соцсети / каналы <span style="color:var(--primary-color);">*</span>',
          partnerPlanLabel: 'Ваш план продвижения',
          partnerAgreeTextHtml: 'Я ознакомился(-ась) с <a href="#" onclick="document.getElementById(\'partnerAgreementBlock\').style.display=document.getElementById(\'partnerAgreementBlock\').style.display===\'none\'?\'block\':\'none\';return false;" style="color:var(--primary-color);text-decoration:underline;">условиями партнёрской программы</a> и принимаю их',
          partnerFaqTitle: 'Частые вопросы',

          partnerFaq2Q: 'Когда происходят выплаты?', partnerFaq2A: 'Заявки на вывод собираются в течение недели и обрабатываются единой рассылкой раз в неделю.',
          partnerFaq3Q: 'Какой минимум для вывода?', partnerFaq3A: 'Минимум — 100 000 Искр. Заявка на вывод подаётся в кабинете партнёра.',
          partnerFaq4Q: 'Как считается бонус?', partnerFaq4A: '20% бонус в Искрах начисляется с каждого пакета реферала. Душа — 1 980, Глубина — 4 980, Лаборатория — 7 980 Искр.',
          partnerLegalTitle: 'Условия партнёрской программы',
          partnerLegalBodyHtml: '<p style="font-weight:700;margin-bottom:6px;">1. Общие положения</p><p>1.1. Настоящее Соглашение регулирует участие в Партнёрской программе сервиса YupSoul (далее — Платформа).</p><p>1.2. Партнёр — пользователь, чья заявка одобрена администрацией Платформы.</p><p>1.3. Подавая заявку, вы подтверждаете, что ознакомились и согласны с условиями данного Соглашения.</p><p style="font-weight:700;margin:12px 0 6px;">2. Условия участия</p><p>2.1. Для участия необходимо подать заявку через форму в приложении.</p><p>2.2. Администрация оставляет за собой право одобрить или отклонить заявку без объяснения причин.</p><p>2.3. Статус партнёра может быть отозван в любой момент при нарушении условий Соглашения.</p><p style="font-weight:700;margin:12px 0 6px;">3. Бонусная программа</p><p>3.1. Партнёр получает бонус в размере 20% в Искрах с каждой покупки пакета реферала.</p><p>3.2. Бонусы начисляются в Искрах (внутренняя валюта Платформы) с каждой покупки пакета реферала.</p><p>3.3. Размеры бонусов по тарифам: Душа — 1 980 Искр/мес, Глубина — 4 980 Искр/мес, Лаборатория — 7 980 Искр/мес.</p><p>3.4. Платформа оставляет за собой право изменять размер бонусов с предварительным уведомлением партнёров.</p><p style="font-weight:700;margin:12px 0 6px;">4. Выплаты</p><p>4.1. Минимальная сумма для вывода — 100 000 Искр.</p><p>4.2. Заявка на вывод подаётся в кабинете партнёра; выплата производится по реквизитам, согласованным с партнёром.</p><p>4.3. Заявки на вывод собираются в течение недели и обрабатываются единой рассылкой раз в неделю.</p><p>4.4. Платформа вправе отклонить заявку на вывод при подозрении в мошенничестве.</p><p style="font-weight:700;margin:12px 0 6px;">5. Обязанности партнёра</p><p>5.1. Партнёр обязуется продвигать Платформу добросовестно, без вводящей в заблуждение информации.</p><p>5.2. Запрещается: спам-рассылки, накрутка регистраций, создание фиктивных аккаунтов, использование порочащего контента.</p><p>5.3. Партнёр самостоятельно несёт ответственность за уплату налогов с полученного дохода в соответствии с законодательством своей страны.</p><p style="font-weight:700;margin:12px 0 6px;">6. Ответственность</p><p>6.1. Платформа не гарантирует конкретный размер дохода партнёра.</p><p>6.2. При выявлении мошеннических действий партнёрский статус аннулируется, а накопленные средства могут быть заблокированы.</p><p>6.3. Платформа не несёт ответственности за действия партнёра перед третьими лицами.</p><p style="font-weight:700;margin:12px 0 6px;">7. Изменение условий</p><p>7.1. Платформа вправе изменять условия данного Соглашения, уведомив партнёров через Telegram.</p><p>7.2. Продолжение участия в программе после уведомления означает согласие с новыми условиями.</p><p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.7rem;">Дата публикации: 22 марта 2026 г.</p>',
          partnerDashHeaderHtml: 'Партнёр <span style="background:linear-gradient(135deg,var(--primary-color),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">YupSoul</span>',
          partnerDashBonusLine: 'Бонус: 20% в Искрах',
          partnerLinksLabel: 'Ваши реферальные ссылки', partnerCopy: 'Копировать', partnerShareMsg: 'Создай персональную песню по своей дате рождения. YupSoul — музыка, которая звучит про тебя', partnerLinksLoading: 'Ссылки ещё загружаются', partnerShare: 'Поделиться',
          partnerLinkLanding: 'Лендинг', partnerLinkPartnerPage: 'Партнёрка',
          partnerCodeLabel: 'Персональный код', partnerCodeExample: 'Например: ANNA_MUSIC — ваша ссылка станет ...?start=ref_ANNA_MUSIC',
          partnerPromoTitle: 'Готовые тексты для рассылки',
          partnerPromoText1: 'YupSoul - персонализированная музыка на основе даты рождения. Уникальные треки, которые звучат именно для тебя. Попробуй — минута твоей песни в подарок!',
          partnerPromoText2: 'Подари уникальную песню близкому человеку! YupSoul создаёт персональные треки по дате рождения - идеальный подарок, который невозможно повторить.',
          partnerPromoCopyHint: 'Нажмите на текст, чтобы скопировать',
          partnerQrTitle: 'QR-код вашей ссылки', partnerSaveQr: 'Сохранить QR', partnerQrHint: 'Используйте для оффлайн-продвижения',
          partnerStatInvited: 'Приглашено', partnerStatPaid: 'Купили', partnerConversion: 'Конверсия',
          partnerMinPayoutLabel: 'Минимум для вывода', partnerMinPayoutValue: '100 000 Искр',
          partnerWalletLabel: 'Реквизиты для выплат',
          partnerEarningsTitle: 'История начислений', partnerPayoutsTitle: 'История выплат',
          paymentConfirmed: 'Оплата подтверждена!', songCanClose: 'Можешь закрыть приложение — ничего не пропадёт.',
          successWhileWaiting: 'Пока ждёшь песню', successNewSong: 'Ещё песню',
          songNotArrived: 'Не пришла через 20 мин? Напиши боту «песня не пришла».', goToBot: 'Перейти в бот',
          songCreating: 'Твоя песня генерируется.', songUsually: 'Обычно 10-15 минут.',
          ptTariffActivated: 'Тариф активирован!', ptWelcomeTo: 'Добро пожаловать в', ptTracksAndChat: 'Треки и Чат с Оракулом доступны.', ptGoHome: 'На главную',
          ptScOpened: 'Чат с Оракулом открыт!', ptScAccess: '24 часа доступа', ptScConfirmed: 'Оплата подтверждена. Можешь начать диалог.', ptGoSc: 'В Чат с Оракулом',
          ptSongInQueue: 'Песня в очереди', ptSongCreating: 'Твоя песня создаётся. Результат придёт в бот.',
          payOvCardBtn: 'Оплатить картой', payOvRubHint: 'при оплате картой', payOvOrIskry: 'или {amount} Искр',
          toastCardLinked: 'Карта привязана', toastCardLinkFail: 'Не удалось привязать карту. Попробуй ещё раз.',
          toastConnFail: 'Не удалось подключиться. Проверь соединение.',
          toastCardUnlinked: 'Карта отвязана.', toastCardUnlinkFail: 'Не удалось отвязать карту. Попробуй ещё раз.',
          toastSubActivated: 'Пакет активирован!', toastScOpened: 'Чат с Оракулом открыт на 24 часа',
          toastPayFail: 'Не удалось создать платёж', toastConnError: 'Ошибка соединения',
          toastActivateFail: 'Не удалось активировать. Попробуй ещё раз.', toastMasterTrialUsed: 'Пробный день уже использован', toastAuthLost: 'Перезайди в приложение, чтобы продолжить.', toastNoChanges: 'Изменений нет',
          toastConnRetry: 'Не удалось подключиться. Проверь соединение и попробуй снова.',
          toastScExpired: 'Время доступа истекло — открой Чат с Оракулом снова',
          toastIskryCharged: 'Списано {amount} Искр',
          toastReferralCreditUsed: 'Списан реферальный кредит',
          toastEntitlementUsed: 'Использован купленный трек',
          toastTrialUsed: 'Подарочный трек активирован',
          toastSubscriptionUsed: 'Засчитан в пакете',
          toastPromoUsed: 'Промокод применён',
          toastOpenInTg: 'Открой приложение из бота в Telegram.',
          toastPayOpenTg: 'Оплата на платформе недоступна',
          vkSupportLinkCopied: 'Ссылка на сообщество YupSoul скопирована: {url}',
          vkSupportLink: 'Наше сообщество YupSoul: {url}',
          vkTabletTitle: 'Откройте на телефоне или компьютере',
          vkTabletText: 'YupSoul оптимизирован для телефонов и десктопа. На планшете интерфейс пока может работать некорректно — откройте YupSoul со смартфона или на vk.com в браузере.',
          vkTabletCommunity: 'Наше сообщество YupSoul',
          okSupportLinkCopied: 'Ссылка на группу YupSoul скопирована: {url}',
          okSupportLink: 'Наша группа YupSoul в Одноклассниках: {url}',
          toastSubsOnDesktop: 'Оплата на платформе недоступна',
          toastUpdateTg: 'Для оплаты обнови Telegram до версии 6.1 или выше.',
          toastPromoApplied: 'Промокод применён! Расшифровка доступна',
          toastFirstSubmit: 'Сначала отправь заявку на песню', toastShareForward: 'Откроется окно пересылки в Telegram',
          toastLinkCopiedFriend: 'Ссылка скопирована — отправь другу!',
          toastWelcomeIskry: 'Тебе начислено {amount} Искр — добро пожаловать!',
          toastUpdateTgStars: 'Для оплаты Stars обнови Telegram до версии 6.9 или выше.',
          toastInvoiceFail: 'Не удалось создать счёт на оплату. Попробуй ещё раз.',
          toastFillForm: 'Сначала заполни форму заявки.', toastIskryPaid: 'Искры списаны — песня в работе!', toastSubPaid: 'Расшифровка оплачена!',
          mtAuthExpired: 'Сессия истекла. Обнови страницу или войди снова.', mtLoadError: 'Не удалось загрузить список. Проверь интернет.', mtPlayRetry: 'Не удалось воспроизвести. Попробуй ещё раз через минуту.',
          mtCreatingSong: 'Создаём твою песню...', mtUsuallyTime: 'Обычно 10–15 минут. Появится в «Мои треки».',
          mtGenDelayed: 'Генерация затянулась. Проверь раздел «Мои треки» позже.',
          mtAnalyzing: 'Анализируем карту…', mtWritingLyrics: 'Пишем текст песни…', mtShapingSound: 'Собираю звучание…', mtRecording: 'Записываем музыку…',
          mtGenFailed: 'Не удалось создать песню', mtGenFailedDesc: 'Произошла ошибка при генерации. Попробуй создать новую заявку или напиши в поддержку.',
          scGreeting: 'Привет, я твой оракул 🤍 Спрашивай о чём угодно: о себе, пути, отношениях. Я рядом.',
          ctxSelfBtn: 'О себе', ctxCompatBtn: 'Совместимость',
          ctxSub: 'С кем сегодня говорим — Оракул будет держать это в контексте разговора.',
          scPairPickTitle: 'Вы вдвоём', scPairPickSub: 'Разбор пары — как вы звучите вместе.',
          ctxModeOne: 'Одна карточка', ctxModeCompat: 'Совместимость',
          ctxYou: 'Ты', ctxYourChart: 'твоя дата рождения', ctxMeBadge: 'это ты', ctxAddPerson: 'Добавить человека', ctxPlankLabel: 'Контекст задан', ctxPlankOne: 'разговор об {name}', ctxPlankPair: 'разбор пары {a} и {b}', ctxPlankPrism: 'ваш разбор «{title}»',
          ctxHintPickOne: '<b>Выбери карточку</b> — Оракул будет говорить об этом человеке.',
          ctxHintOneSelected: 'Чат пойдёт об одном человеке.',
          ctxHintPickTwo: '<b>Выбери двоих</b> — Оракул разберёт их совместимость.',
          ctxApply: 'Применить', ctxApplyOne: 'Применить · {name}', ctxApplyPair: 'Разобрать пару · {a} и {b}',
          scCopy: 'Копировать', scCopied: 'Скопировано',
          diaryEntryTitle: 'Разбор дня',
          yesterday: 'Вчера',
          scPrismWord: 'Разбор', scPrismBackToList: 'К разборам', diaryWaitTitle: 'Разбор ещё в пути', diaryWaitText: 'Придёт в {time} — одним сообщением.', diaryFeedEarlier: 'Раньше', diaryFeedCount: '{n} разборов', diaryThemesTitle: 'О чём присылать', diaryThemesHint: '1–3 темы', diaryStreakLine: '{n} дней подряд', diaryPickLine: 'Приходит в {time} · одно сообщение в день', diaryHeadTitle: 'Дневник', diaryHeadSub: 'Короткий разбор каждый день — на твою карту и на текущий день', diaryStatConversations: 'разборов', diaryStatDays: 'дней подряд', diaryStatTopics: 'тем',
          scChipLonely: 'Мне одиноко', scChipBurnout: 'Я выгорел(а)', scChipSelflove: 'Как полюбить себя?',
          scQaLabel: 'С чего начнём', scQaKtoyaT: 'Кто я по сути?', scQaKtoyaS: 'Понять себя глубже', scQaKtoyaQ: 'Кто я по сути? Помоги понять себя глубже.', scQaTrevogaT: 'Мне тревожно', scQaTrevogaS: 'Выговориться и выдохнуть', scQaTrevogaQ: 'Мне тревожно. Хочу выговориться и выдохнуть.', scQaReshenieT: 'Помоги решить', scQaReshenieS: 'Найти свой ответ', scQaReshenieQ: 'Помоги мне принять решение и найти свой ответ.', scQaPodderzhkaT: 'Побудь рядом', scQaPodderzhkaS: 'Когда нужна поддержка', scQaPodderzhkaQ: 'Побудь рядом со мной. Мне нужна поддержка.',
          scOracleFreeLeft: 'Вопросов в подарок: {n} из 10', scOracleIskryMode: '1 вопрос = 1 Искра · у тебя {n}', scOracleNeedIskry: 'Вопросы в подарок закончились. Дальше 1 вопрос = 1 Искра — забери ежедневную Искру в Подарках или пополни баланс.', scOracleGetIskry: 'Забрать Искру', scOracleFreeWarn: 'Остались 3 вопроса из подарочных. Дальше Искра приходит каждый день — одной хватает на новый вопрос.', scWallTitle: 'Подарочные вопросы закончились. Дальше вопрос стоит одну Искру.', scWallTitleClaim: 'Подарочные вопросы закончились. Возьми Искру дня — её хватит на новый вопрос.', scWallTitleDone: 'Искра на сегодня уже у тебя. Новая придёт завтра.', scWallClaimedMsg: 'Искра у тебя — спрашивай.', scWallGoGifts: 'Открыть Подарки', scPrismNeedIskryVk: 'Пока не хватает Искр. Сегодняшнюю можно забрать в Подарках.', scWallClaimBtn: 'Забрать Искру дня', scWallJoinBtn: 'Вступить в сообщество', scWallNote: 'В сообществе каждое утро выходит разбор дня. За вступление начислим 30 Искр.', scWallClaimDone: 'Искра у тебя', scWallPrismText: 'Один большой разбор о тебе уже открыт — «Имя души». Прочти.', scWallNoteLow: 'Искры копятся в Подарках — заходи каждый день.',
          scPlaceholder: 'Что у тебя на душе?', scHistoryEmpty: 'Здесь появятся ваши недавние запросы', scHistoryToggle: 'История',
          bannerPendingSub: 'Незавершённый пакет', bannerPendingSubDesc: 'Оплата ещё не подтверждена. Продолжи оформление тарифа.',
          bannerPendingIskry: 'Твоя заявка ждёт!', bannerPendingIskryDesc: 'Используй Искры — создай свою песню.',
          bannerPendingOrder: 'Незавершённый заказ', bannerPendingOrderDesc: 'У тебя есть заявка, ожидающая оплаты.',
          valNameMin: 'Имя должно содержать минимум 2 символа', valBirthdate: 'Выбери дату рождения',
          valBirthplace: 'Место рождения должно содержать минимум 3 символа',
          valBirthtime: 'Укажи время рождения или отметь «Не знаю»', valGender: 'Укажи пол',
          appUpdating: 'Приложению нужно обновиться', payOvDefault: 'Оплата', payOvPaymentReq: 'Оплата заявки',
          linkedOpenBrowser: 'Открой ссылку в браузере и привяжи Google там.',
          linkedConnFail: 'Войди через Google и обнови страницу',
          scQuickBuyDay: 'Доступ на 24 часа — 199 ₽',
          iskryPaySuccess: 'Искры списаны — песня в работе!', iskryPayingProgress: 'Списываю Искры...', iskryPayingStatus: 'Списываю Искры и запускаю генерацию...',
          // Batch 9.13: 6 ключей были в EN/DE/FR, но отсутствовали в RU словаре.
          // RU тестеры видели технический ключ вместо локализованного текста.
          // VK Testers 7272264 (MacOS): «противоречащий текст». Делаем явным:
          // (1) что отменяется автопродление, (2) до какой именно даты будет доступ,
          // (3) что произойдёт потом. Дата подставляется через {date}.
          cancelSubConfirm: 'Деактивировать пакет?\n\nДоступ к пакету сохранится до {date}, после чего профиль переключится на бесплатный тариф «Искатель». Деньги за оплаченный период не возвращаются.',
          cancelSubConfirmNoDate: 'Деактивировать пакет?\n\nДоступ к пакету сохранится до конца оплаченного периода, после чего профиль переключится на бесплатный тариф «Искатель». Деньги за оплаченный период не возвращаются.',
          cancelSubProgress: 'Отменяем…',
          cancelSubSuccess: 'Пакет активен',
          cancelSubSuccessNoDate: 'Пакет активен',
          profileSubscriptionCancelled: 'Пакет использован',
          processing: 'Обработка...',
          payCopyFail: 'Не удалось скопировать',
          paymentRequiredHint: 'Для создания песни нужна оплата.',
          trackLimitResubmitHint: 'Заполни форму и отправь — откроется экран оплаты.',
          paymentThanksOk: 'Готово!',
          apiNotConfigured: 'Не определён адрес API. Откройте приложение по ссылке с сервера.',
          // --- i18n batch: payment, buttons, forms, loading, plans ---
          btnGoHome: 'На главную', btnClose: 'Закрыть', btnDone: 'Готово', btnSave: 'Сохранить',
          btnApply: 'Применить', btnShare: 'Поделиться', btnCopied: 'Скопировано!', btnBack: '← Назад',
          btnMore: 'Ещё', btnFind: 'Найти', btnRefresh: 'Обновить', btnTry: 'Попробовать',
          btnActivateFree: 'Активировать бесплатно', btnActivating: 'Активируем...',
          btnConfirmAndSend: 'Подтвердить и отправить', btnConfirming: 'Подтверждаю...',
          btnCreateSong: 'Создать мою песню', btnCreateMore: 'Создать ещё трек',
          btnTrySoulChat: 'Попробовать Чат с Оракулом', btnInviteFriend: 'Пригласить друга',
          btnGoToPayment: 'Перейти к оплате', btnContinueSub: 'Продолжить оплату пакета',
          btnReceiveInTg: 'Получать песни в Telegram', btnPickFromLab: 'Выбрать из Лаборатории',
          btnGet24hFree: 'Получить 24 часа бесплатно', btnBindCard: 'Привязать карту',
          btnUnbindCard: 'Отвязать карту', btnChoosePlan: 'Выбрать план', btnSettings: '⚙ Настройки',
          payCheckingPayment: 'Проверяем оплату…', payWaitingBank: 'Ожидаем подтверждение от банка. Обычно несколько секунд.',
          payWaitingConfirm: 'Ожидаем подтверждение…', payNoData: 'Нет данных для проверки. Статус обновится в профиле.',
          payReceived: 'Платёж получен. Проверяем активацию доступа…',
          payReturnHome: 'Можешь вернуться на главную — статус обновится.',
          payBankNotConfirmed: 'Банк пока не подтвердил платёж. Если средства списаны — не волнуйся, они зачтутся.',
          payBankNotConfirmedRetry: 'Банк ещё не подтвердил платёж. Попробуй проверить позже.',
          payConfirmedPlan: 'Оплата подтверждена. План «{plan}» активен.',
          payAnalysisPaid: 'Расшифровка оплачена!', payAnalysisAvailable: 'Теперь ты можешь получить подробный разбор своей песни.',
          payDeepAnalysis: 'Глубокая расшифровка', payNotConfirmed: 'Оплата не подтверждена',
          payContactSupport: 'Не помогло? Напиши в поддержку.', payCheckFailed: 'Не удалось проверить статус платежа. Попробуй позже.', payCheckTakesTimeTitle: 'Проверяем оплату', payCheckTakesTime: 'Если деньги списались, мы пришлём подтверждение в Telegram. Можешь вернуться на главную.',
          paySoulChatOpened: 'Чат с Оракулом открыт!', payConfirmedChat: 'Оплата подтверждена. Можешь начать диалог.',
          payToSoulChat: 'В Чат с Оракулом', payCreatingLink: 'Создаю ссылку…',
          payCreatingInvoice: 'Создаём инвойс…', payPromoApplied: 'Промокод применён!',
          payPaid: 'Оплачено!', payOpeningPayment: 'Открываем оплату…',
          payConnectingBank: 'Подключаемся к банку…', payByCard: 'Оплатить картой',
          payLoading: 'Загружаем…', payAlreadyPaidCheck: 'Я уже оплатил — проверить',
          payChecking: 'Проверяю...', payPaidByCardCheck: 'Я оплатил картой — проверить',
          payFormNotOpened: 'Если форма оплаты не открылась — скопируйте ссылку:',
          payCopyLink: 'Скопировать ссылку оплаты', payCopied: 'Скопировано ✓',
          payPlanActivated: 'Тариф «{plan}» активирован!',
          formEnterName: 'Введите имя', formNoAuth: 'Нет авторизации',
          formSaving: 'Сохранение…', formDataSaved: 'Данные сохранены ✓',
          formSaveError: 'Ошибка сохранения', formEnterPromo: 'Введите промокод', promoActivated: 'Промокод активирован!', promoNotFound: 'Промокод не найден', promoExpired: 'Промокод истёк', promoUsedUp: 'Промокод больше не действует', promoAlreadyActivated: 'Промокод уже активирован', promoDiscountWord: 'Скидка',
          formPromoError: 'Ошибка проверки. Попробуй позже.', formSecondPerson: 'Второй человек',
          selectDay: 'День', selectMonth: 'Месяц', selectYear: 'Год',
          labelName: 'Имя', labelBirthdate: 'Дата рождения', labelBirthplace: 'Место рождения',
          labelBirthtime: 'Время рождения', labelDontKnow: 'Не знаю', labelGender: 'Пол',
          labelCity: 'Город', labelPlan: 'Тариф',
          genderMale: 'Мужской', genderFemale: 'Женский', genderSelect: 'Выбери',
          formStep1: 'Шаг 1', formStep2: 'Шаг 2', formStep3: 'Шаг 3',
          formYourData: 'Твои данные', formDataNeeded: 'Нужны для персонального текста песни',
          formCityHint: 'Начни вводить город и выбери из выпавшего списка.',
          formTimeUnknown: 'Время неизвестно', formSongLang: 'Язык песни', formLangTooltip: 'На каком языке будет текст песни и расшифровка',
          formAnalysisLang: 'Язык разбора', formLangTooltipNoLyrics: 'На каком языке придут разбор и письмо',
          lyricsHeading: 'Голос песни', lyricsSubtitle: 'Будут ли в ней слова?',
          lyricsSung: 'Со словами', lyricsSungDesc: 'Споём твою песню',
          lyricsInstrumental: 'Только музыка', lyricsInstrumentalDesc: 'Мелодия по твоей дате',
          lyricsOwn: 'Свой текст', lyricsOwnDesc: 'Споём то, что напишешь',
          phCustomLyrics: 'Впиши свои строки — споём их',
          customLyricsHint: 'Пиши как чувствуешь, разбивку на куплеты и припев сделаем сами. На песню в три минуты уходит примерно 45 строк. Такие песни остаются только у тебя — в общий эфир они не идут.', charsShort: 'симв.', customLyricsShortWarn: 'для песни на 3 минуты нужно около 1400 — сейчас выйдет короче', customLyricsEnough: 'хватит на полноценную песню',
          alertCustomLyrics: 'Впиши текст песни — хотя бы пару строк',
          errCustomLyricsShort: 'Впиши текст песни — хотя бы пару строк',
          errCustomLyricsProfanity: 'В тексте есть слова, которые мы не сможем спеть',
          errRadioOwnLyrics: 'Песни на свой текст остаются только у тебя — в эфир их не отправляем',
          birthDateTooltip: 'Выберите дату рождения', birthTimeTooltip: 'Выберите время рождения',
          formMePlusHuman: 'Я + Человек', formCardPlusCard: 'Карточка + Карточка',
          formPickFromLabHint: 'Выбери человека из Лаборатории — поля заполнятся автоматически',
          formTransitMode: 'Энергия дня', formTransitDate: 'Дата события',
          formTransitTime: 'Время события', formTransitCity: 'Город для энергии момента',
          formRequestLabel: 'Что будешь исследовать сегодня?', formQuickPicks: '✦ Быстрые запросы',
          formForWho: 'Для кого генерируем?', formForSelf: 'Для себя',
          styleManual: 'Ввести вручную', styleAstro: 'Звучание планет', styleStar: 'Стиль артиста',
          styleStarHint: 'Введите имя артиста, название песни или саундтрека фильма...',
          styleQuickLabel: '✦ Стили музыки',
          stylePresetPop: 'Поп', stylePresetRock: 'Рок', stylePresetRap: 'Рэп / hip-hop',
          stylePresetElectronic: 'Электронная / techno / house',
          stylePresetAmbient: 'Ambient / медитативная', stylePresetAcoustic: 'Акустика / piano / ballad',
          langRussian: 'Русский', langUkrainian: 'Українська',
          oracleThinking: 'Оракул думает', oracleGenerating: 'Генерирую разбор, подожди ~30 секунд',
          oracleExample: 'ПРИМЕР РАЗБОРА', oracleGenerateFail: 'Не удалось сгенерировать. Заполни дату рождения в профиле.',
          oracleConnError: 'Ошибка соединения. Попробуй позже.', oracleViewAnother: 'Посмотреть другой пример',
          oracleConfiguring: 'Настраиваю...', oracleStart3Days: 'Начать — 3 дня бесплатно', oracleOnboardingRetry: 'Не получилось. Повтори, пожалуйста.',
          oracleLoadFail: 'Не удалось загрузить.', oracleDiaryReply: 'ответ',
          toastNetworkError: 'Ошибка сети — попробуй ещё раз', toastSaved: 'Сохранено', toastError: 'Ошибка',
          toastAnalysisAvailable: 'Расшифровка уже доступна — напиши боту',
          toastOrderFail: 'Не удалось создать заказ. Попробуй позже.',
          statusNoRequests: 'Нет доступных запросов', loading: 'Загрузка...',
          noSavedPeople: 'Нет сохранённых людей.', noEarningsYet: 'Пока нет начислений',
          subConnecting: 'Подключаем…', subTrialPeriod: 'Пробный период',
          subTrial1Day: '1 день бесплатно — попробовать',
          scAccessRemaining: 'Доступ: ещё {h}ч {m}мин', scOpenFor30: 'Открыть за 30 Искр',
          scSelectCard: 'Выбрать карточку...', scContextSelf: 'О себе', scHistoryDivider: '✦ история переписки ✦',
          scDemoMode: 'ДЕМО-РЕЖИМ',
          successTitle: 'Заявка принята!', successDesc: 'Твоя песня генерируется.',
          successBotHint: 'Нажми Start в боте — и будущие песни будут приходить прямо в Telegram',
          successWhileWaiting: 'Пока ждёшь песню', successMoreSong: 'Ещё песню',
          footerOffer: 'Оферта', footerPrivacy: 'Конфиденциальность', footerSubManage: 'Управление пакетами',
          navOracle: 'Оракул', navPlaylist: 'Плейлист', navContacts: 'Контакты', navHelp: 'Помощь',
          heroesTitle: 'Лаборатория', heroFormTitle: 'Добавить героя',
          mtTitle: 'мой плейлист', mtEmpty: 'Пока нет треков',
          mtEmptyDesc: 'Создай первую — по дате рождения',
          mtLoadMore: 'Загрузить ещё',
          mtAudioRefreshFail: 'Не удалось загрузить трек. Попробуй позже.',
          mtPendingTitle: 'Создаём песню…', mtPendingStuckTitle: 'Не удалось создать песню', mtPendingStuckSub: 'Напишите в поддержку — мы вернём Искры', mtAnalysisPending: 'Расшифровка ещё формируется. Загляни через несколько минут.', mtShuffleNeedTracks: 'Нужно хотя бы 2 песни, чтобы перемешать',
          mtPendingSub: 'Будет готова через 5–15 минут',
          diarySetupTitle: 'Настрой свой Дневник',
          diaryTopicCareerLabel: 'Карьера', diaryTopicCareerDesc: 'Решения и финансы',
          diaryTopicRelationshipsLabel: 'Отношения', diaryTopicRelationshipsDesc: 'Динамика с близкими',
          diaryTopicHealthLabel: 'Здоровье', diaryTopicHealthDesc: 'Энергия и тело',
          diaryTopicGrowthLabel: 'Рост', diaryTopicGrowthDesc: 'Привычки и развитие',
          diaryTopicCreativityLabel: 'Творчество', diaryTopicCreativityDesc: 'Вдохновение',
          diaryTopicTransformationLabel: 'Перемены', diaryTopicTransformationDesc: 'Трансформация',
          diaryTopicPurposeLabel: 'Путь', diaryTopicPurposeDesc: 'Смысл и миссия',
          diaryTopicPeaceLabel: 'Покой', diaryTopicPeaceDesc: 'Баланс и опора', diarySetupEyebrow: 'Дневник Оракула', diaryPickedTpl: 'Выбрано {n} из 3', diaryPickAtLeastOne: 'Выбери хотя бы одну тему', diaryEnableBtn: 'Включить Дневник', diaryFootNote: 'Разбор приходит утром — можно изменить темы в любой момент',
          shareSheetTitle: 'Поделиться песней', shareEyebrow: 'Моя песня души', shareFootCreate: 'Создай свою песню', shareFmtStory: 'Stories', shareFmtPost: 'Пост', shareFmtLink: 'Ссылка', shareCopyBtn: 'Копия', shareSaveImg: 'Сохранить картинку', shareTgtLink: 'Ссылка', shareTgtStory: 'Истории', shareTgtMore: 'Ещё',
          vkDoorTitle: 'Дверь в мир новых эмоций — открой её вместе с Музыкальным оракулом', vkDoorBody: 'Искра — это вопрос Оракулу: про день, про отношения, про то, что не отпускает. Буду напоминать забирать её каждое утро и напишу, когда твоя песня родится. Выключить можно в профиле.', vkDoorYes: 'Открыть дверь', vkDoorNo: 'Позже', consentBonus: '+5 Искр за уведомления', consentTitle: 'Будь на связи', consentTextVk: 'Искра — это вопрос Оракулу: про сегодняшний день, про отношения, про то, что не отпускает. Напомню забирать её каждое утро: +2 в день, +10 за неделю подряд. Одно сообщение в день, выключить можно в профиле.', consentTextTg: 'Включи уведомления — Искра дня каждое утро и весточка, когда песня готова. Только важное, без спама.', consentTextWeb: 'Уведомления приходят в Telegram. Открой бота — напишу, когда песня готова, и подарю Искру дня.', consentBtnVk: 'Разрешить уведомления', consentBtnTg: 'Включить уведомления', consentBtnWeb: 'Открыть в Telegram', consentLater: 'Позже', consentLegalHtml: 'Соглашаясь, ты принимаешь <u>условия рассылки</u>. Отписаться можно в любой момент.', consentTermsBody: 'Пишем только по делу: весточка, когда песня готова, Искра дня по утрам и редкие новости сервиса. E-mail — не чаще раза в неделю. Отписаться можно в любой момент: кнопкой в профиле или ссылкой в письме. Контакты не передаём третьим лицам и не используем для рекламы других компаний.',
          oracleOptinTitle: 'Заглядывать к тебе по утрам?', oracleOptinDesc: 'Пока песня рождается — могу присылать короткий разбор дня каждое утро: что сегодня в фокусе, где поберечь силы, где твой момент.', oracleOptinYes: 'Да, присылай', oracleOptinNo: 'Не сейчас', oracleOptinNote: '3 дня в подарок. Отключить можно в любой момент.', oracleOptinDone: 'Готово — загляну утром.',
          diarySetupDesc: 'Выбери 1-3 темы. Каждое утро — персональный разбор дня.',
          diaryDeliveryTime: 'Время доставки', diaryReceiveDaily: 'Получать ежедневные разборы',
          diaryTopics: 'Темы', diaryTrialEnded: 'Пробный период закончился',
          diaryTrialEndedDesc: 'Подпишись на Глубина или Лаборатория для ежедневных разборов.',
          diaryFirstArrival: 'Твой первый разбор придёт в выбранное время.',
          oracleTabChat: 'Чат', oracleTabDiary: 'Дневник',
          settingsTitle: 'Настройки',
          scHeroTitle: 'Разговор по душам | Чат с Оракулом',
          scPromoText: 'Чат с Оракулом — твой ИИ-ассистент, который понимает тебя на глубоком уровне.',
          scGoToChat: 'Перейти в чат →', scMoreDetails: 'Подробнее ↓',
          scStat1: 'отмечают снижение тревоги', scStat2: 'чувствуют себя понятыми',
          scStat3: 'быстрее находят ответ', scStat4: 'возвращаются снова',
          scExTitle: 'Примеры вопросов',
          scEx1: '«Почему мне так сложно говорить о своих чувствах?»',
          scEx2: '«Какой мой главный страх и как с ним работать?»',
          scEx3: '«В чём моё предназначение и как к нему прийти?»',
          scGiftHeading: 'Попробуй Чат с Оракулом — 24 часа', scGiftNote: 'Один раз для каждого пользователя',
          scSubIncluded: 'Чат с Оракулом включён в пакет',
          scChoosePlan: 'Выбрать тариф →', scOpenFor24h: 'Открыть Чат с Оракулом на 24ч',
          scPayByCard: 'Картой (Т-Банк) — 199 ₽',
          scPickerTitle: 'Контекст чата', scPickerSingle: 'Одна карточка',
          scPickerSynastry: 'Совместимость (2 карточки)',
          scPickerCardA: 'Карточка A', scPickerCardB: 'Карточка B',
          scNoRequestTitle: 'Нужны твои данные',
          scNoRequestText: 'Чат с Оракулом строит персональный разговор на основе твоих данных.',
          scSynastryTeaser: 'Совместимость — диалог по двум датам рождения.',
          scOpenPlan: 'Открыть тариф →', scSelectLabel: 'Выбрать...',
          scPromoError: 'Получите пакет или купите доступ на сутки',
          profilePromo: 'У меня есть промокод',
          profilePromoTitle: 'Мне подарили промокод',
          profilePromoSub: 'Активируй — получишь бонусные Искры',
          profilePromoSectionTitle: 'Промокод',
          profileLoadError: 'Не удалось загрузить профиль',
          profileInvited: 'Приглашено', profileActivated: 'Активировано', profileIskry: 'Искры',
          profileEarningsLabel: 'Ваши Искры:', profileEarningsHint: 'Искры можно тратить на песни и функции',
          profileListenDownload: 'Слушать и скачать треки', profileCreateSongBtn: 'Создать свою песню',
          profileNoCard: 'Карта не привязана. Привяжите карту для полного управления.',
          relSelect: '— выбери —', relMother: 'Мать', relFather: 'Отец', relDaughter: 'Дочь', relSon: 'Сын',
          relSister: 'Сестра', relBrother: 'Брат', relGrandmother: 'Бабушка', relGrandfather: 'Дедушка',
          relHusband: 'Муж', relWife: 'Жена', relPartner: 'Любимый человек',
          relFriend: 'Друг', relGirlfriend: 'Подруга', relColleague: 'Коллега',
          relMentor: 'Наставник', relOther: 'Другое',
          heroDateHint: 'Выбери день, месяц и год',
          optional: 'необязательно', heroIntro: 'По <b>дате рождения</b> оракул соберёт для героя персональную песню и разборы.', heroRelPartner: 'партнёр', heroRelDaughter: 'дочь', heroRelSon: 'сын', heroRelMom: 'мама', heroRelDad: 'папа', heroRelFriendM: 'друг', heroRelFriendF: 'подруга', heroRelMentor: 'наставник', heroRelOther: 'другое', heroPlaceHint: 'Начни вводить город и выбери из выпавшего списка.', heroNoTime: 'Не знаю точное время', heroSexSkip: 'Не указывать',
          wguLabel: 'Пока создаётся твоя песня', wguTitle: 'Узнай что твоя дата говорит о тебе',
          wguPrice: 'Глубокая расшифровка — 40 Искр', wguBtn: 'Получить расшифровку', daDeepDesc: 'Глубокая расшифровка — более глубокий анализ с учётом места и времени рождения: твоя суть, сильные стороны и точки роста, ключевые темы и периоды жизни, и смысл, вложенный в песню. Словами, лично для тебя.',
          payThanksTitle: 'Оплата получена', payThanksSubtitle: 'заявка принята',
          payThanksDesc: 'Твоя песня уже генерируется. Обычно 10–15 минут.',
          payThanksAfsTitle: 'Твоя Искра зажглась', payThanksAfsSubtitle: 'Готова идти глубже?',
          payThanksHint: 'Не пришла за 20 минут? Напиши боту «песня не пришла»',
          statusRequestAccepted: 'Заявка принята', statusSongCreating: 'Песня создаётся. Придёт в чат с ботом. Можно закрыть окно.',
          qrSaved: 'QR сохранён ✓',
          heroesPromoHeading: 'Личный кабинет для мастеров',
          heroesPromoDesc: 'Добавляй людей один раз — и генерируй для них песни в один тап.',
          heroesPromoFeatures: 'Что входит в тариф:', scBuyDayNote: 'Не готов к пакету? Попробуй разовый доступ',
          homeTeaserHtml: 'В твоей <span class="tagline-glow">дате</span> скрыт дар по рождению, раскрой его через <span class="tagline-glow">песню</span>',
          payOvSubtitle: 'Твоя персональная песня', payOvCardTitleSingle: 'Персональная песня',
          payOvCardTitleCouple: 'Песня для двоих', payOvCardTitleTransit: 'Энергия дня',
          payOvCardTitleAnalysis: 'Текстовая расшифровка', payOvCardTitleSc: 'Разговор по душам — 24 часа',
          payOvSubtitleSingle: 'Твоя персональная песня', payOvSubtitleCouple: 'Песня для вас двоих',
          payOvSubtitleTransit: 'Энергия твоего дня', payOvSubtitleAnalysis: 'Глубокая расшифровка',
          payOvSubtitleSc: 'Чат с Оракулом на 24 часа', payOvSubtitleDefault: 'Твоя песня',
          payOvPromoApplied: 'Промокод применён', payOvFreeGen: '— генерация в подарок',
          payOvIskryHint: 'или {amount} Искр', payOvPriceHint: 'при оплате картой',
          payOvUpsellLabel: 'Выгоднее пакетом', payOvUpsellBtn: 'Взять пакет',
          payOvUpsellPackTitle: 'Пакет «Душа» — 5 песен', payOvUpsellFeat1: '5 песен вместо одной', payOvUpsellFeat2: 'Чат с Оракулом включён', payPackPerSong: '/песня', payPackPerVote: ' гол./песня',
          payOvOfferText: 'Оплачивая, вы соглашаетесь с', payOvOfferLink: 'публичной офертой',
          payOvPromoConfirmBtn: 'Подтвердить и отправить',
          confirmTitle: 'Заявка принята!',
          confirmDesc1: 'Анализирую твои данные и создаю уникальную песню.',
          confirmDesc2Bot: 'Песня придёт в этот чат. Можешь закрыть приложение — ничего не пропадёт.',
          confirmDesc2Web: 'Песня появится в разделе «Мои треки». Можешь закрыть приложение — ничего не пропадёт.',
          confirmContinueBtn: 'Продолжить →',
          planConfirmPay: 'Оплатить', planConfirmCancel: 'Отмена',
          profileLogout: 'Выйти из аккаунта', profileOfferLink: 'Договор публичной оферты',
          monthJan: 'Январь', monthFeb: 'Февраль', monthMar: 'Март', monthApr: 'Апрель',
          monthMay: 'Май', monthJun: 'Июнь', monthJul: 'Июль', monthAug: 'Август',
          monthSep: 'Сентябрь', monthOct: 'Октябрь', monthNov: 'Ноябрь', monthDec: 'Декабрь',
          createSong: 'Создать песню',
          csWhileWaiting: 'Пока ждёшь песню', csMyTracks: 'Мои треки', csInvite: 'Пригласить', csNewSong: 'Ещё песню',
          genStage1: 'Читаю твою дату рождения', genStage2: 'Исследую, как звучат твои звёзды', genStage3: 'Подбираю нужные слова', genStage3NoLyrics: 'Ищу твоё звучание', genStage4: 'Составляю звуковую композицию',
          mtUpsellTitle: 'Это только начало', mtUpsellText: 'Понравилось, как звучит твоя душа? Подари песню тому, кто дорог — маме, любимому, другу.', mtUpsellCreate: 'Создать ещё', mtUpsellSub: 'Больше песен — можно купить пакет',
          iskraClaimTitle: 'Искра дня', iskraClaimTextCan: 'Заходи каждый день и забирай Искру 🤍 С ней можно задать оракулу любой вопрос о себе.', iskraClaimTextDone: 'Сегодня Искра уже твоя 🤍 Возвращайся завтра за новой.', iskraClaimStreak: 'Серия: {n}', iskraClaimBtn: 'Забрать Искру', iskraClaimBtnDone: 'Приходи завтра',
          navGifts: 'Подарки', navMenuGifts: 'Подарки', giftsTitle: 'Подарки', giftsSubtitle: 'Заходи каждый день — забирай Искру', giftsExplainer: 'Каждый день тут тебя ждёт Искра — просто за то, что ты с нами 🤍 Одной хватит, чтобы задать оракулу вопрос о себе, а сотня — это целая песня про тебя.', iskraValueTitle: 'Что можно с Искрами', iskraValueQuestion: 'Задай оракулу любой вопрос о себе — это одна Искра', iskraValueSong: 'Собери сотню — и родится песня твоей души', iskraValueCta: 'Спросить оракула', giftsEmptyHint: 'Создай первую песню — и здесь откроется ежедневная Искра 🤍', iskraClaimErr: 'Искра не начислилась, баланс не изменился.', iskraClaimRetry: 'Повторить', iskraCookieFrom: 'Послание Оракула на сегодня', giftsProgLabel: 'на балансе', giftsBalanceTopup: 'Баланс Искр — пополнить', giftsFirstRunTitle: 'Искра дня откроется после первой песни', giftsFirstRunSub: 'Каждый день — +2 Искры, за 7 дней подряд — ещё +10. Искры идут на вопросы Оракулу и на следующую песню.', giftsFirstRunCta: 'Создать первую песню', giftsEmptyTitle: 'Здесь появятся твои Искры', giftsEmptySub: 'Создай первую песню — и каждый день сможешь забирать Искру дня', giftsBackHome: '← На главную',
          giftsSpendCta: 'Задать вопрос', giftsSpendSub: 'Задай в диалоге любой вопрос о себе', giftsRefTitle: 'Пригласи друга', giftsRefSub: 'Искры за подписку друга', giftsRefReward: '+Искры', giftsRefTag: 'Делись ссылкой — когда друг оформляет подписку, тебе начисляются Искры.', giftsRefStatInvited: 'Приглашено', giftsRefStatSongs: 'Создали песню', giftsRefStatEarned: 'Искр получено', giftsRefCopy: 'Копировать', giftsRefCopied: 'Скопировано', giftsRefShare: 'Поделиться ссылкой', giftsWeekTitle: 'Твоя серия', giftsWeekStreak: '{n} дней подряд', giftsWeekDays: 'Пн,Вт,Ср,Чт,Пт,Сб,Вс', giftsProgTitle: 'До песни твоей души', giftsProgSub: 'Собери 100 Искр — и она родится', giftsProgSubPack: 'Песню открывает первый пакет Искр — дальше платишь накопленным', iskrySongNeedPack: 'Искры открывают песню после первого пакета Искр. Сейчас они идут на вопросы Оракулу и разборы.', errSongIskryNeedPack: 'Песню Искрами открывает пакет Искр — или оплата напрямую.', errGiftIskryNeedPack: 'Подарить песню за Искры можно после первого пакета Искр.', giftsFoot: '✦ Возвращайся завтра — серия растёт ✦', giftCardTitle: 'Подари близкому', giftCardSub: 'Подари свою песню — близкий услышит её', giftCardCta: 'Подарить песню', iskraClaimedTitle: 'Искра у тебя ✦', iskraFreshSub: 'Маленький подарок за то, что ты с нами.', iskraClaimedSub: 'Разломи печеньку — Оракул оставил тебе послание.', iskraCookieBtn: 'Открыть печеньку предсказаний', iskraSaved: 'Сохранено в Дневник посланий', iskraAskDay: 'Спросить Оракула про это', iskraGoal: 'Ещё {n} дн. подряд → +10 Искр за серию 7 дней', questsTitle: 'Квесты', homeCommT: 'Больше о твоих возможностях', homeCommS: 'Новости и подсказки — в нашем сообществе', questJoinT: 'Вступить в сообщество', questJoinS: 'Присоединяйся к нам', questJoinBtn: '+30', questJoinDone: 'Готово', questJoinAlready: 'Ты уже в сообществе', questJoinToast: 'Спасибо! +30 Искр', questJoinCheck: 'Я вступил(а)', questJoinNeedMember: 'Сначала вступи в сообщество, потом вернись', scCommInviteT: 'Энергия дня — каждое утро в сообществе', scCommInviteS: 'Короткий настрой на день и новости Оракула. За вступление — +30 Искр.', scCommInviteBtn: 'Вступить', profileVkCommunity: 'Сообщество: Энергия дня — каждое утро',
          // gift create/redeem pages (giftPage / giftRedeemPage)
          giftPageTitle: 'Подарить песню', gpEyebrow: 'Подарок близкому', gpTitle: 'Оформление подарка', gpWhat: 'Что дарим', gpItem: 'Песня души', gpInGift: 'в подарок', gpToClose: 'близкому', gpPayMethod: 'Способ оплаты', gpMStars: 'Telegram Stars', gpMStarsSub: 'Оплата звёздами Telegram', gpMCard: 'Картой · T-Bank', gpMCardSub: 'Visa / Mastercard / МИР', gpNote: 'После оплаты ты получишь промокод — отправь его близкому, он активирует подарок при создании песни.', gpPay: 'Оплатить', gpSecure: 'Безопасная оплата · промокод придёт сразу', gpDoneTitle: 'Подарок готов 🤍', gpDoneText: 'Промокод на песню души — отправь близкому, он введёт его при создании.', gpDoneShare: 'Отправить подарок', gpDoneCopy: 'Скопировать код', gpCodeCopied: 'Код скопирован ✓', giftsMyTitle: 'Мои подарки', giftCodePending: 'Ждёт активации', giftCodeUsed: 'Активирован', giftCodeFor: 'Для: ', giftCodeCopy: 'Копировать', giftCodeSend: 'Отправить', gpShareText: 'Дарю тебе песню души 🤍 Промокод: ', giftToPlaceholder: 'Выбери, для кого', giftToName: 'Для · {name}', giftNoSongs: 'Нет готовых песен', giftCreateFirst: 'Создать песню', giftNeedSongTitle: 'Сначала создай песню', giftNeedSongSub: 'Подаришь её, когда будет готова', giftSoulSong: 'Песня души', giftSongFallback: 'Песня', giftDediPlaceholderPreview: 'Здесь появится твоё посвящение…', giftSecRecip: 'Для кого песня', giftSecWords: 'Тёплые слова', giftSecHow: 'Как подарить', giftRecipAdd: 'Добавить', giftDediPlaceholder: 'Напиши пару строк тому, кому даришь…', giftPresetBday: 'С днём рождения', giftPresetJust: 'Просто так, для тебя', giftPresetSpecial: 'Ты особенный человек', giftDlvLink: 'Ссылкой', giftDlvTg: 'Telegram', giftDlvQr: 'QR-код', giftReward: '+5 Искр, когда подарок откроют', giftSendBtn: 'Подарить песню', giftDoneTitle: 'Подарок готов!', giftDoneText: '«{name}» для {to}. Поделись ссылкой ниже — когда подарок откроют, ты узнаешь.', giftDoneCopy: 'Копировать', giftToLovedOne: 'близкого', giftDoneClose: 'Готово', giftPromptRecipName: 'Кому подарок? Имя:', giftAddNamePh: 'Для кого? Напр.: мамы, Ани', giftAddNameOk: 'Готово', giftLinkCopied: 'Ссылка скопирована', giftSelectFirst: 'Сначала выбери песню', giftFailed: 'Не получилось', giftSongYours: 'Песня твоя 🤍', giftLoginToRedeem: 'Войди, чтобы получить подарок', giftPlaying: '🎵 {title} играет', giftIskryCredited: '+{n} Искр зачислено 🤍', giftSongCredited: 'Песня в подарок 🤍 Создай свою', giftSongUnlocked: 'Твоя песня открыта 🤍', giftDeliverShareText: 'Тебе подарили песню души 🤍 Открой подарок: {url}', giftNotFound: 'Подарок не найден', giftFromLovedOne: 'Близкий человек', grFromSealedDefault: 'Тебе подарок', grFromSealedName: 'Тебе подарок от {name}', grTitleSealed: 'Тебе подарили<br>песню души 🤍', grLeadDefault: 'Открой подарок, чтобы услышать персональную песню.', grFromOpenDefault: 'Подарок', grFromOpenName: 'Подарок от {name}', grTitleOpen: 'С теплом 🤍', grLeadNew: '{name} дарит тебе <b>персональную песню</b> по твоей дате рождения. Открой подарок, чтобы создать её.', grLeadExisting: '{name} дарит тебе <b>песню души</b>. Открой подарок, чтобы услышать её.', giftInsidePersonalSong: 'Персональная песня', giftInsideByBirthdate: 'по твоей дате рождения', giftInside100: '+100 Искр в подарок', giftInside100Sub: 'на твои будущие песни', giftInsideFromName: 'от {name}', grNoteNew: 'Дату рождения уточним на следующем шаге · подарок уже оплачен', grOpenBtn: 'Открыть подарок', grGetBtn: 'Получить мою песню', grCreateSong: 'Создать свою песню', grRedeemedNote: 'Подарок твой 🤍', giftPromoWillApply: 'Промокод применится при создании песни 🤍', gpPayUnavailable: 'Оплата сейчас недоступна, попробуй позже', sharedSongEyebrow: 'Тебе поделились песней', sharedSongCta: 'Создать песню про себя', sharedSongLoading: 'Открываю песню…', sharedSongFallback: 'Песня души', sharedSaveFav: 'В любимые', sharedCreateOwn: 'Создать свою песню', sharedLockedLead: 'Послушай отрывок — 60 секунд. Полную песню открывает автор.', sharedLockedSub: 'Отрывок · 60 сек', sharedSavedFav: 'Добавлено в любимые', sharedSavedFavBtn: 'В любимых', favoritesTitle: 'Любимые', favSharedBadge: 'Поделились с тобой', favEmpty: 'Здесь появятся песни, которые ты добавишь в любимые.',
          profileContactsTitle: 'Контакты', profileContactsSub: 'Песни для близких — картотека людей', helpReplayTour: 'Посмотреть обучение заново',
          afsTitle: 'Твоя Искра зажглась', afsSubtitle: 'Готова идти глубже?',
          afsBtnCreate: 'Создать ещё трек', afsBtnSoulChat: 'Попробовать Чат с Оракулом', afsBtnInvite: 'Пригласить друга',
          scTabChat: 'Чат', scTabDiary: 'Дневник', scTabPrism: 'Разборы',
          askezaEntryLabel: 'Что ты держишь', askezaEntryTitle: 'Твоя аскеза на 21 день',
          askezaPickerLabel: 'Что важно проработать',
          histTitle: 'История', histBack: 'Назад в чат', histSearch: 'Поиск по разговорам', histSearchPh: 'Найти в разговорах', histNoRes: 'Ничего не нашлось. Попробуй другое слово — ищу по твоим вопросам.', histEmptyT: 'Разговоров пока нет', histEmptyS: 'Спроси Оракула о чём угодно — здесь останется всё, о чём вы говорили, чтобы можно было вернуться.', histContinue: 'Продолжить разговор', histLastNote: 'Последний — «{title}», {when}', histToday: 'Сегодня', histWeek: 'На этой неделе', histEarlier: 'Раньше', histLive: 'сейчас открыт', histThreadsN: '{n} разговор|{n} разговора|{n} разговоров', histQuestionsN: '{n} вопрос|{n} вопроса|{n} вопросов', histCountEmpty: 'пока пусто', histQuote: '«{q}»', histDeleteAsk: 'Удалить разговор? Вернуть его будет нельзя.',
          prismPowerDrain: 'Куда уходит сила', drainSwitchLabel: 'Посмотреть другую сторону',
          vkObSlide1Eyebrow: 'Твой оракул', vkObSlide1Title: 'Оракул читает твою дату рождения',
          vkObSlide1Sub: 'Спроси о себе — ответ придёт по твоей карте. Первые десять вопросов в подарок.',
          vkObChipFree: '10 вопросов в подарок',
          vkObSlide4Eyebrow: 'Разборы и практика', vkObSlide4Title: 'Разборы о себе и практика на 21 день',
          vkObSlide4Sub: 'Пятнадцать разборов по твоей карте. И аскеза — практика, которую делают три недели, а не читают один раз.',
          vkObChipPrisms: 'разборы карты', vkObChipAskeza: 'аскеза · 21 день',
          vkConsentDataOracle: 'Данные хранятся на серверах в России. Для разборов часть данных передаётся сервисам генерации, в том числе за рубежом — подробности в Политике.', scThreadNew: 'Новый разговор', scThreadLegacy: 'Ранние разговоры',
          errThreadNotFound: 'Беседа не найдена.', askezaPickerHint: 'Первая — там, где сейчас тяжелее всего. Взять можно любую, но одну.',
          askezaTitlePrefix: 'Аскеза', askezaTitleFallback: 'Твоя аскеза',
          askezaEntryNote: 'Практика вместо чтения', askezaEntryProgress: 'Удержано {done} из {total}',
          askezaBack: 'К разборам', askezaStatus: "День {n} из {m}", askezaStatusLeft: "{n} впереди", askezaTodayLabel: "Сегодня · день {n}", askezaMarkBtn: "Отметить день удержанным", askezaMarkedBtn: "День отмечен", askezaStartWith: "Начать аскезу {planet}", askezaCtaNote: "21 день · один пропуск можно, два подряд — сначала", askezaFinalLabel: "21 день позади", askezaFinalTitle: "Практика завершена", askezaFinalStreak: "лучшая серия", askezaFinalMissed: "пропуска", askezaFinalNext: "Дальше — следующая тема из списка.", askezaFinalCta: "Выбрать следующую", askezaEyebrow: 'Практика · 21 день', askezaTitle: 'Аскеза Сатурна', askezaWhatIs: 'Одно правило на 21 день: каждый день одно дело и один запрет. Вечером отмечаешь день.', askezaOutcomeLabel: 'Что изменится', askezaDailyLabel: 'Каждый день', askezaCoreShort: 'Аскеза', askezaFinalCheck: 'Сверь, что изменилось',
          askezaCoreLabel: 'Что держать', askezaWhyLabel: 'Почему эта твоя', askezaWhyPending: 'Дописываю, почему эта практика твоя…',
          askezaDoLabel: 'Делать', askezaBanLabel: 'Нельзя',
          askezaTrackLabel: 'Двадцать один день', askezaTrackHint: 'Отметь вечером, если день удержан',
          askezaStreakLabel: 'подряд с начала', askezaTotalLabel: 'всего удержано',
          askezaBeatsLabel: 'Где сломает', askezaBeatYou: 'у тебя',
          askezaFailLabel: 'Срыв', askezaFailRule: 'Один пропуск — идёшь дальше. Два подряд — начинаешь сначала.',
          askezaStartBtn: 'Начать практику', askezaRestartBtn: 'Начать заново', askezaStarting: 'Собираю практику…',
          askezaDayAria: 'День {n}', askezaDayShort: 'день {n}',
          errAskezaNeedBirthData: 'Заполни дату, время и место рождения — без них практику не собрать.',
          errAskezaNeedBirthTime: 'Для практики нужно точное время рождения.',
          errAskezaUnknown: 'Неизвестная практика.', errAskezaBadDay: 'День вне практики.',
          errAskezaNotStarted: 'Практика не начата.',
          scOracleWho: 'Оракул', scIntroTitle: 'Спроси о себе', scIntroSubtitle: 'Оракул отвечает по твоей карте, а не общими словами.',
          scPrismTitle: 'Разборы', scPrismSubtitle: 'Загляни глубже — твоя карта, спетая вслух', scChartLabel: 'Твоя карта', scChartNoDob: 'Добавь дату рождения', scProgReceived: 'Разборов получено', scProgOpened: 'Открыто разборов', scPrismTagNew: 'Новое', scPrismLockedTitle: 'Доступно в пакете', scPrismLockedMsg: 'Этот разбор доступен с пакетом «Чат с Оракулом». Первый разбор «Имя души» — в подарок.', scPrismTryFreeTitle: 'Попробовать «Имя души»', scPrismPayDesc: 'Глубокий персональный разбор по твоей карте — подробно о тебе.', scPrismPayHave: 'у тебя', scPrismPayBtn: 'Открыть разбор', scPrismPayLoading: 'Готовлю разбор…', pwTeaserLock: 'Оракул не договорил…', pwTitle: 'Продолжим разговор?', pwSub: 'Искры закончились — а Оракулу ещё есть что тебе сказать. Возьми пакет и продолжай, без подписок и привязки карты.', pwSegQ: 'Вопросы', pwSegIskry: 'Искры', pwCtaLabel: 'Продолжить разговор', pwDay: 'Или', pwDayAccess: 'доступ на сутки', pwSubscribe: 'Хочешь автопополнение?', pwSubscribeLink: 'Получить пакет с картой', pwSubscribeWhere: '(где доступно)', pwFoot: 'Разовая оплата. Пакет не сгорает — вопросы остаются с тобой.', pwBadgePopular: 'Выгоднее',
          scPrismLoadingCatalog: 'Загружаю разборы…', scPrismRunning: 'Считаю твой разбор…',
          scPrismErrorTitle: 'Не получилось', scPrismRunFail: 'Не удалось выполнить разбор. Попробуй ещё раз.',
          scPrismCatalogErr: 'Не удалось загрузить разборы.', scPrismCopy: 'Скопировать расклад', prismReadEyebrow: 'Персональный разбор', prismReadIntro: 'Оракул читает твою карту', prismReadAsk: 'Задать вопрос по разбору', prismReadSave: 'Сохранить разбор', prismBuyDesc: 'Глубокий персональный разбор по твоей карте — подробно о тебе и как это разблокировать.', prismBuyIncl1Html: '<b>Подробный текст</b> по твоей дате рождения', prismBuyIncl2Html: 'Сохраняется в чат — можно <b>задавать вопросы</b>', prismBuyYouHave: 'у тебя', prismBuyAfter: 'останется', prismBuyShort: 'не хватает', prismBuyOpen: 'Открыть разбор', prismBuyTopup: 'Пополнить Искры', prismBuyNoteOk: 'Разбор откроется сразу в чате с Оракулом', prismBuyNoteLow: 'Пополни Искры и открой разбор',
          scPrismCopied: 'Расклад скопирован', scPrismCopyFail: 'Не удалось скопировать',
          scPrismTryFree: 'Попробовать подарочный разбор', scPrismGoToPlans: 'Выбрать пакет', scPrismFillProfile: 'Заполнить профиль',
          scEnterChat: 'Войти в Чат с Оракулом', scPayByCardBtn: 'Картой (Т-Банк) — 199 ₽',
          forSelfOption: 'Для себя',
          iskrySuffix: 'Искр',
          successConfirmDesc: 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class="success-desc-note">Обычно 10–20 минут.</span>',
          successConfirmDescWeb: 'Твоя песня генерируется.<br>Как только будет готова — появится в «Мои треки».<br><span class="success-desc-note">Обычно 10–20 минут.</span>',
          profileEditLabelTime: 'Время', profileEditLabelGender: 'Пол', profileEditDontKnow: 'Не знаю точное время', profileEditDontKnowHint: 'Разбор будет по дате — без привязки ко времени',
          profileEditFemale: 'Женский', profileEditMale: 'Мужской',
          styleManualDesc: 'Выбрать вручную', styleAstroDesc: 'Автоматически', styleStarDesc: 'Стиль артиста',
          scPickerApply: 'Применить', scFillProfile: 'Заполнить профиль →', scCreateRequest: 'Создать заявку на песню →',
          planAnalysisIncluded: 'Расшифровка включена', profileAnalytics: 'Аналитика',
          refStatInvitedLabel: 'Приглашено', refStatActivatedLabel: 'Активировано', refStatSparksLabel: 'Искры',
          spubNudge: 'У тебя уже 2 трека. <strong>Пакет Душа окупается с 3го</strong> — и даёт ещё Чат с Оракулом, историю заказов и приоритет обработки.',
          spubCta: 'Получить Душу — 810 ₽ →',
          diarySettingsTitle: 'Настройки', diarySettingsBack: '← Назад',
          successBotHintHtml: 'Нажми <b style="color:rgba(255,255,255,0.7);">Start</b> в боте — и будущие песни будут приходить прямо в Telegram',
          payOvUpsellTitle: 'Душа — 5 треков за {subRub} ₽',
          payOvUpsellDesc: '1 трек = {perTrack} ₽ вместо {songRub} ₽. Включён Чат с Оракулом',
          confirmDescHtml: 'Анализирую твои данные и создаю уникальную песню.<br><br>Песня придёт в этот чат. Можешь закрыть приложение — ничего не пропадёт.',
          confirmContinueBtn: 'Продолжить →', planConfirmPay: 'Оплатить', planConfirmCancel: 'Отмена',
          profileLogout: 'Выйти из аккаунта', profileOfferLink: 'Договор публичной оферты',
          profileAnalytics: 'Аналитика',
          recoveryBannerHtml: '<strong style="color:#6ee7b7;">Твоя заявка ждёт!</strong> Используй Искры — создай свою песню.',
          recoveryClaimBtn: 'Создать песню',
          profilePartnerBadge: 'Партнёр',
          partnerDashStatEarned: 'Заработано за всё время', partnerDashStatAvailable: 'Доступно к выводу (не потрачено)',
          adminTitle: 'Админка', adminDesc: 'Управление заявками, карта архитектуры и настройки — в веб-админке.',
          adminOpenBtn: 'Открыть веб-админку'
        },
        en: {
          dlSongTitle: 'Download song',
          dlSongEyebrow: 'Download song',
          dlSongTrackSub: 'Soul song · 2:48 · MP3',
          dlSongMsg: 'Thanks for sharing 🤍 <span class="hl">As long as your song lives on your page, the download stays open.</span> <span class="ret">If you take the post down — we go back to the usual: the track for Sparks.</span>',
          dlSongMore: 'Other ways to open',
          dlSongJoinT: 'Join the community',
          dlSongJoinS: 'YupSoul on VK',
          dlSongRevT: 'Leave a review',
          dlSongRevS: 'A few warm words about the song',
          dlSongCta: 'Share the song',
          dlSongOrPre: 'or ',
          dlSongOrLink: 'open the download for <span class="spk">100</span> Sparks',
          tagline: 'Discover how your horoscope sounds',
          taglineAccent: 'your',
          startBtn: 'Get your song', myProfile: 'Profile', myHeroes: 'Lab', myHelp: 'Help', admin: 'Admin',
          compatTitle: 'Compatibility', profileTitle: 'Profile', profileSubtitle: 'Your data and Sparks',
          profileFreeCredits: 'Sparks', profileInviteFriend: 'Invite a friend', profileShare: 'Share', profileCopyLink: 'Copy link', profileLinkCopied: 'Link copied',
          refShareTextWithName: 'Hi! Check out this app — it creates a personal song based on your birth date. Really cool, try it — the first minute of your song is a gift!',
          refShareText: 'Check out this app — it creates a personal song based on your birth date. The first minute of your song comes as a gift — give it a try!',
          copiedToClipboard: 'Copied to clipboard',
          shared: 'Shared!',
          copyManually: 'Copy the link:',
          confirmYes: 'Yes',
          confirmCancel: 'Cancel',
          deleteCancelled: 'Deletion cancelled',
          confirmExit: 'Leave',
          confirmStay: 'Stay',
          thisHero: 'this person',
          confirmDeleteHero: 'Delete "{name}"?',
          btnDelete: 'Delete',
          profileInvited: 'Invited', profileActivated: 'Activated', profileCreateSong: 'Create song',
          heroesTitle: 'Contacts', heroesSubtitle: 'People the oracle sings for',
          heroesVkOfferTitle: 'People catalog', heroesVkOfferDesc: 'Add your loved ones once — and create songs for them in one tap. The whole history with lyrics is right here.', heroesVkOfferCta: 'Open the catalog',
          ulSegCards: 'Catalog', ulSegTopic: 'Reading topic',
          ulCardsEyebrow: 'People catalog', ulCardsTitle: 'Everyone close — in one place', ulCardsSub: 'Save the charts of family and friends — songs and compatibility in one tap.',
          ulCardsB1: 'Songs in one tap', ulCardsB1s: 'by the saved date', ulCardsB2: 'Compatibility', ulCardsB2s: 'a reading for the two of you', ulCardsB3: 'Gift your loved ones', ulCardsB3s: 'a song as a gift right from here',
          ulCardsCta: 'Open the catalog', ulCardsNote: '«Laboratory» package · 30-day access',
          ulTopicEyebrow: 'Topic reading', ulTopicTitle: 'Readings from your chart', ulTopicSub: 'A deep reading of the topic from your chart — and a personal song to match.',
          ulTopicB1: 'Deep reading', ulTopicB1s: 'from your date of birth', ulTopicB2: 'A song for the topic', ulTopicB2s: 'a personal track as a gift', ulTopicB3: 'Questions for the Oracle', ulTopicB3s: 'on this topic, no limit',
          ulTopicCta: 'Open readings', ulTopicNote: 'The reading opens in the Oracle journal',
          heroesPerkTapTitle: 'Songs in one tap', heroesPerkTapDesc: 'Add a person once — then create tracks for them without entering the date again.', heroesPerkMatchTitle: 'Compatibility with loved ones', heroesPerkMatchDesc: 'See how in tune you are with each person — by their birth date.', heroesPerkHistoryTitle: 'All the history in one place', heroesPerkHistoryDesc: 'Songs and lyrics for each loved one — gathered in one place.', heroesPerkGiftTitle: 'Gift your loved ones', heroesPerkGiftDesc: 'Gather family and friends — and delight them with personal songs.', heroesBuyPeriodWeb: 'The Lab · card index included', heroesBuyPriceUnitWeb: '₽', heroesBuyNoteWeb: 'Package · the card index and all of the Lab', heroesBuyTrust: 'Secure payment · instant access', heroesBrandTagline: 'Music oracle', heroesTitleH1: 'Card index', heroesTitleSub: 'People the oracle sings for', heroesSelfBadge: 'it\'s you', heroesCreateSong: 'Create a song',
          searchByName: 'Search by name', searchPlaceholder: 'Enter name...', searchBtn: 'Search',
          addHero: 'Add Hero', heroName: 'Name *', heroNameLabel: 'Name', heroBirthdate: 'Date of birth', heroBirthtime: 'Time of birth',
          heroBirthplace: 'Place of birth', heroBirthplacePh: 'City, country', heroNotes: 'Notes', heroNotesPh: 'Notes about the person',
          unknownTime: "I don't know exact time", cancel: 'Cancel', deleteBtn: 'Delete', save: 'Save', back: '← Back', backLabel: 'Back',
          gender: 'Gender', genderSelect: 'Choose', male: 'Male', female: 'Female', other: 'Other',
          modeType: 'Song format', modeSubtitle: 'Who is it for?',
          modeSingle: 'About me', modeSingleDesc: 'A song by your date of birth',
          modeCouple: 'About us', modeCoupleDesc: 'A song for two people',
          modeLockedBadge: 'Unlocks with a pack',
          guideTipFormat: 'Pick a format', guideTipDate: 'Enter your birth date', guideTipStyle: 'Pick how to set the style', guideTipLyrics: 'With lyrics, music only, or your own text', guideTipCreate: 'All set — tap "Create"',
          guideTipStart: "Tap — let's craft your song", guideTipGender: 'Pick a gender', guideNextBtn: 'Next', coupleManualEnter: 'Enter manually', coupleExpandEdit: 'Expand', coupleCollapseEdit: 'Collapse', guideTipLanguage: 'Song language', guideTipRequest: "A few words about the theme and the song comes out truer. Not in the mood? Skip it — we'll shape it from your reading.", guideTipName: "Add a name — it'll be sung. Already filled in and don't want it? Just erase it", guideTipAdv: 'Optional: place & time refine the song',
          obSlide5Eyebrow: 'Stay tuned', obSlide5Title: 'Be the first to know when your song is ready', obSlide5Sub: "We'll ping you when your song is ready and remind you about the daily Spark.",
          obChipNotifyReady: 'song ready → instant ping', obChipNotifyIskra: 'daily Spark',
          obConsentBtn: 'Turn on notifications · +5 Sparks', obConsentDone: 'Connected',
          modeTransit: 'Energy<br>of the day', modeTransitDesc: "A song about today",
          namePh: "What's your name?", birthdateLabel: 'Date of birth', birthplacePh: 'City or country — choose from suggestions',
          birthplaceHint: 'Start typing your city and pick from the list.',
          cityTypeMore: 'Type at least 3 letters',
          unknownTimeShort: "Don't know", secondPersonTitle: 'For two', name2Ph: "Second person's name",
          birthplace2Ph: "Second person's place of birth", birthtime2Ph: 'Time of birth',
          transitTitle: 'Energy of the day', transitDatePh: 'DD.MM.YYYY', transitTimePh: 'HH:MM',
          transitLocationPh: 'City for the moment energy', transitLocationOk: 'Location is correct',
          transitIntentPh: 'Intention for this moment',
          styleManual: 'Enter<br>manually', styleAstro: 'Planet<br>sound', styleStar: 'Like a<br>star', starRecent: 'Recent',
          styleHeading: 'Music style', styleSubtitle: 'How to choose the style?',
          stylePlaceholderManual: 'Genre or mood of music', stylePlaceholderAstro: 'Style will be set by birth date', stylePlaceholderStar: 'Artist, song or soundtrack',
          styleManualDefaultHint: 'If left empty — style will be chosen automatically based on your birth date.',
          pendingDraftBannerText: '← Back to song draft',
          payOvDraftTtlHint: 'Draft will be kept for 7 days — then cancelled automatically.',
          authErrVkNoCode: 'Could not sign in with VK. Try again or use Telegram.',
          authErrVkTokenFail: 'VK did not confirm the login. Try again in a minute.',
          authErrVkUserFail: 'VK returned an incomplete profile. Try again.',
          authErrVkCreateFail: 'Could not create an account. Contact support if this keeps happening.',
          authErrVkJwtFail: 'Session was not created. Try again.',
          authErrGeneric: 'Sign-in failed. Try again.',
          supportEmailCopied: 'Email copied — drop us a line',
          supportEmailLabel: 'Reach us by email',
          mtAudioTapAgain: 'Tap again — browser requires confirmation',
          astroInfoReady: 'Style will be derived from your birth date',
          astroInfoNoProfile: 'Add your birth date first',
          astroInfoNoProfileHint: 'Tap to fill it in',
          starHint: 'Enter an artist name, song title or movie soundtrack. We\'ll create music in a similar style, unique to you.',
          sendRequest: 'What should the song be about?', requestReassure: "Feel free to leave it blank — we'll shape the song from your birth date.", quickRequests: 'Quick requests', hide: 'Hide',
          requestDesc: 'What\'s the song about? Any request — from humor to deep themes.',
          requestQuickHint: 'Pick a ready-made request or write your own',
          requestPh: 'Write any request', toPayment: 'To payment',
          paymentSubtitle: 'Your sound key', paymentAndAccess: 'Payment & access',
          paymentIntro: 'Create a track with Sparks or get a package for full access.',
          loadingPricing: 'Loading plans...', currentItem: 'Current item',
          promoCode: 'Promo code', promoEmptyError: 'Enter promo code', toastRateLimit: 'Too many attempts. Wait a few minutes and try again.', apply: 'Apply', backFromPayment: '← Back',
          submitAndContinue: 'Checkout & continue', submitRequest: 'Submit request',
          submitHint: 'The song will arrive in this chat with the bot. If you haven\'t pressed «Start» in the bot yet — do it now.',
          paymentPageIntroAfterSubmit: 'Request submitted. Enter a promo code or choose a payment method below.',
          paymentPageTagline: 'Promo code or payment',
          pay: 'Pay',

          firstFree: 'You have Sparks — create your first track!',
          paymentRequired: 'Payment required for new requests.',
          subscriptionActive: 'You have an active package — continue.',
          catalogLoadFailed: 'Pricing failed to load. Press «Continue» — backend will determine cost.',
          promoApplied: 'Promo {code}: -{amount} {currency}',
          creatingKey: 'Creating your key...',
          creatingKeyDesc: 'Magic happens in real time. Your personal sound key is being formed from your unique data.',
          keyActivated: 'Key activated!', done: 'Done!',
          successText: 'Your personal sound key is created! Your unique artifact of strength for the game of life.',
          yourSong: 'Your song',
          songPreviewText: 'Your unique audio piece is waiting for you in the bot. Listen every morning to tune into success.',
          whatNext: 'What next:', openBot: 'Open the bot',
          soulChat: 'Talk to your soul', soulChatPay: 'To payment — Soul / Depth',
          newKey: 'Create another key',
          paymentThanks: 'Thank you for payment', thanksSubtitle: 'request accepted', paymentThanksBackToForm: 'Create your song', paymentThanksBackToHome: 'Back to home', paymentCancelled: 'Payment cancelled',
          songInProgress: 'Song is being generated and will arrive in the bot chat when ready.',
          songInProgressConfirmed: 'Request accepted. Song is being generated — no need to pay again. It will arrive in the bot chat when ready.',
          thanksDone: 'Done',
          notFromTelegram: 'Open the app from the bot chat in Telegram (menu button) — otherwise the request cannot be sent.',
          notFound: 'Not found', searchError: 'Search error',
          soulChatLoad: 'Loading…',
          soulChatHasAccess: "You have Soul Chat access. Tap below — the bot will open. In the bot, type /soulchat and ask your soul a question.",
          soulChatNoAccess: 'Soul Chat — dialogues with your soul. Available with Soul (up to 50 messages) or Depth (unlimited) package.',
          soulChatDefault: 'Soul Chat — dialogues with your soul per request. Available by package.',
          soulChatNoApi: 'Soul Chat — dialogues with your soul. Available with Soul or Depth package. Go to «To payment» in the app.',
          greeting: "Hi, {name}! Come back whenever you want to remember who you are.",
          greetingDefault: "Come back whenever you want to remember who you are.",
          onboardingSlide1Title: 'There is a song — about you',
          onboardingSlide1Text: 'Written from your date of birth. Not a template — a real text about your character, strength and path.',
          onboardingSlide2Title: 'Only about you',
          onboardingSlide2Text: 'A smart analysis of your personality becomes a living song — unique, only yours.',
          onboardingSlide3Title: 'Your song is waiting',
          onboardingSlide3Text: 'Enter your date of birth — create your first song, one minute of it as a gift.',
          onboardingBtnStart: 'Get my song',
          obBrand: 'YupSoul', obSkip: 'Skip', obNext: 'Next', obCreate: 'Create first song',
          archTitle: 'Who you really are', archLead: 'Your birth date holds a planet astrology calls the indicator of the Soul. It shapes your character. Give me the date — I\'ll show you.', archDateLabel: 'Date of birth', archGo: 'Show my archetype', archEyebrow: 'Indicator of the Soul', archGift: 'Your gift', archShadow: 'Your shadow', archSoulPlanet: 'Soul planet', archNote: 'Your note', archBridge: 'That was in words. Now hear how it sounds: your song is built from the same date.', archToSong: 'Create my song', archAgain: 'Another date', archNeedDate: 'Enter your date of birth', archBadDate: 'Check the date — something doesn\'t add up', signInWithApple: 'Sign in with Apple', rgAll: 'All genres', rg_rock: 'Rock', rg_electronic: 'Electronic', rg_rap: 'Rap', rg_folk: 'Folk', rg_soul: 'Soul / R&B', rg_ambient: 'Ambient', rg_cinematic: 'Cinematic', rg_acoustic: 'Acoustic', rg_sacred: 'Sacred', rg_pop: 'Pop', rg_other: 'Other', offlineTitle: 'No internet connection', offlineText: 'Check your connection and try again', offlineRetry: 'Refresh', errPurchaseFailed: 'The purchase didn\'t go through', errArchBadDate: 'Check the date — something doesn\'t add up',
          obReward: '+30 Sparks for getting started',
          obChipBirthdate: 'from your birth date', obChipWhoAmI: '"Who am I?"', obChipDiary: 'diary of the day',
          obChipCompat: 'You + mom · 92%', obChipContacts: 'your circle', obChipGift: 'gift a friend', obChipRadio: "radio · others' songs",
          obSlide1Eyebrow: 'Your soul song', obSlide1Title: 'A song written from your birth date', obSlide1Sub: 'The Oracle reads your birth chart and creates a track that sounds only about you.',
          obSlide2Eyebrow: 'Oracle', obSlide2Title: 'Ask about yourself — get a deep answer', obSlide2Sub: 'Ask questions about your path, relationships and character. The Oracle answers warmly and to the point.',
          obSlide3Eyebrow: 'Compatibility', obSlide3Title: 'See how in tune you are with loved ones', obSlide3Sub: 'Add family and friends to your circle — and see your compatibility by birth date.',
          obSlide4Eyebrow: 'Give and listen', obSlide4Title: 'Gift songs to loved ones and listen to Radio', obSlide4Sub: 'Gift a song to someone dear, and open Radio — a stream of other people\'s songs.',
          alertNameShort: 'Name must be at least 2 characters', alertNameFriendly: "What's your name? It makes the song truly yours", alertNameInvalid: 'Please enter a real name', alertBirthdate: 'Choose date of birth', alertBirthdateInvalid: 'Birth year must be between 1900 and current', alertBirthdateInvalidDay: 'Invalid date — check day and month',
          errInvalidName: 'Name contains invalid characters or repetitions.',
          errNameRequired: 'Name cannot be empty. Enter at least 1 character.',
          errInvalidDateFormat: 'Invalid birthdate format. Use YYYY-MM-DD.',
          errInvalidDateYear: 'Birth year must be between 1900 and current year.',
          errInvalidDateMonth: 'Invalid birth month.',
          errInvalidDateDay: 'Invalid birth day.',
          errInvalidDate: 'Invalid birthdate.',
          errInvalidBirthplace: 'Birthplace is invalid.',
          alertBirthplace: 'Place of birth must be at least 3 characters', alertBirthplaceHint: 'Pick a location from the suggestions',
          validationErrorHint: 'Fill in all required fields.',
          alertBirthtime: 'Enter time of birth or check "Don\'t know"', alertGender: 'Select gender', alertLanguage: 'Choose language',
          advSettingsTitle: 'Advanced settings', advSettingsSub: 'optional', advSettingsHint: 'Optional. Birth place and time make the reading more precise — you can skip them.',
          unlockEyebrow: 'Your song', unlockTitle: 'This is just the start',
          unlockLead: 'The first minute has played. <b>The full song is about 3 minutes</b>, written from your birth date. Ahead — the chorus, the finale and your name in the words.',
          unlockR1t: 'Full song', unlockR1s: 'about 3 minutes', unlockR2t: 'Download as MP3', unlockR2s: 'yours to keep forever',
          unlockR3t: 'Song lyrics', unlockR3s: 'the whole text', unlockR4t: 'Share with loved ones', unlockR4s: 'gift this song',
          unlockR5t: 'Karaoke to your song', unlockR5s: 'sing along to your words',
          unlockPromoToggle: 'I was given a promo code', unlockPromoPh: 'Enter promo code', unlockPromoApply: 'Apply', unlockPromoChecking: 'Checking…', unlockPromoWrongProduct: 'This promo code isn’t for a song',
          unlockCtaOpen: 'Open the full song', unlockCtaSub: 'opens instantly', unlockCtaPaying: 'Opening payment…', unlockPayCard: 'Card', unlockPayStars: 'Stars', unlockPayPromo: 'Promo code', unlockPayIskry: 'Sparks',
          unlockGhReplay: 'Replay', unlockGhBack: 'Back', unlockVkNote: 'Unlocking is paid by card', unlockIskryUnit: 'Sparks',
          openedEyebrow: 'Your song is open', openedTitle: 'Done — listen in full',
          openedLead: 'The full version is already playing. It’s yours — download it, read the lyrics and share with loved ones.',
          openedLeadNoLyrics: 'The full version is already playing. It’s yours — download it and share with loved ones.',
          openedPlaySub: 'Full song · 3:12',
          openedKaraT: 'Sing karaoke', openedKaraS: 'lyrics light up in time',
          openedNudgeT: 'Create a song for someone dear', openedNudgeS: 'gift them a story like this', openedPackT: 'More songs — for you and loved ones', openedPackS: 'a Sparks pack — 10 songs and more',
          openedOptinT: 'Check in with you each morning?', openedOptinGift: '3 days as a gift', openedOptinP: 'A short warm word from the Oracle every morning. Turn it off anytime.', openedOptinYes: 'Yes, send them', openedOptinNo: 'Not now',
          openedShare: 'Share with a loved one', openedDownload: 'Download', openedLyrics: 'Lyrics',
          alertName2Short: "Second person's name — at least 2 characters", alertBirthdate2: "Enter second person's date of birth",
          alertBirthplace2: "Second person's place of birth must be at least 3 characters",
          alertBirthtime2: "Enter second person's time of birth", alertGender2: "Select second person's gender",
          alertTransitDate: 'Enter event date', alertTransitLocation: 'Enter event location', alertTransitConfirm: 'Confirm the location is correct',
          alertRequestShort: 'Add a request (5+ characters)', alertRequestLong: 'Tell the Universe more (at least 15 characters)',
          alertYourPath: 'Choose your path', alertNoApi: 'API address not configured.', alertOpenFromBot: 'Open the app from the bot chat in Telegram — otherwise the request cannot be accepted.',
          alertServerSleep: 'Server was slow to wake up. Wait about a minute and tap «Submit request» again.',
          sending: 'Sending…',
          universeHeard: '{name}, the Universe heard your request.\n\nYour sound key is being created and will arrive in this chat when ready.',
          universeHeardCouple: '{name} and {name2}, the Universe heard your request.\n\nYour sound key is being created and will arrive in this chat when ready.',
          universeHeardTransit: '{name}, the Universe heard your request.\n\nYour Day Energy sound key is being created and will arrive in this chat when ready.',
          langSong: 'Song language', langRu: 'Russian', langEn: 'English', langDe: 'German', langFr: 'French', langUk: 'Ukrainian',
          quick1: 'Harmony and self-love', quick2: 'Confidence and purpose', quick3: 'Creative potential', quick4: 'Let go of the past',
          quick5: 'Life balance', quick6: 'Trust and acceptance', quick7: 'Healing and freedom', quick8: 'Path to happiness',
          quick9: 'Strength and overcoming', quick10: 'Depth and silence', quick11: 'Tenderness and care', quick12: 'Humor and lightness',
          quick1t: 'Harmony in relationships and self-love', quick2t: 'Confidence, purpose, and self-reliance',
          quick3t: 'Unlock creative potential without fear', quick4t: 'Let go of the past and open to new possibilities',
          quick5t: 'Balance of work and personal life', quick6t: 'Trust life and release control',
          quick7t: 'Heal childhood wounds and find freedom', quick8t: 'Find your path to happiness and peace',
          quick9t: 'Powerful song about my strength and overcoming', quick10t: 'Meditative song for practice and healing',
          quick11t: 'Warm song about care and tenderness', quick12t: 'Playful song with self-irony about my quirks',
          promoError: 'Could not apply promo code',
          promoCleared: 'Promo code cleared.', promoApplied: 'Promo applied: final amount {amount} {currency}',
          promoAppliedHint: 'Promo {code}: -{amount} {currency}',
          paymentRequiredOpening: 'Payment required. Opening HOT Checkout...',
          promoFreeGen: 'Promo code activated. Starting...',
          hotCheckoutOpened: 'HOT Checkout opened. After payment, return to the Mini App — status will update automatically.',
          paymentNotConfirmed: 'Payment not yet confirmed. Check status later or open payment again.',
          paymentConfirmed: 'Payment confirmed. Starting generation...', successWhileWaiting: 'While you wait', successNewSong: 'New song',
          paymentReceivedNoStart: 'Payment received, but auto-start failed. Start generation in admin by request_id: {id}',
          submitFailed: 'Could not submit request. Wait a minute and tap «Submit request» again or reopen the Mini App from the bot chat.',
          errorOp: 'Payment/request operation error',
          alertTransitLocation: 'Enter event location', alertTransitConfirm: 'Confirm the location is correct',
          alertNoApi: 'API address not configured.', alertOpenFromBot: 'Open the app from the bot chat in Telegram — otherwise the request cannot be accepted.',
          alertOpenFromBotShort: 'Open the app from the bot chat in Telegram.',
          alertPaymentFirst: 'First tap «Submit request» on the previous step.',
          alertLinkCopied: 'Link copied. Paste it in Safari or Chrome and open.',
          alertHeroName: 'Enter name', alertError: 'Error', alertDeleteConfirm: 'Delete «{name}»? This action cannot be undone.',
          alertSubmitError: 'Submit error',
          copyLinkPrompt: 'Copy this link and open it in browser:',
          songFormingText: 'Your sound key is being created and will arrive in this chat when ready.',
          heroesLoading: 'Loading...', heroesEmpty: 'No heroes yet. Tap «Add Hero».',
          heroesEmptyFull: 'No heroes yet.<br>Add your first — and create<br>personal songs in one tap.', heroesSearchNotFound: 'No matches for your search.', heroesZeroTitle: 'Your address book is empty', heroesZeroDesc: 'Add someone close — and the oracle will compose a song for them by their birth date.', heroesZeroHint: 'For example: partner · kids · parents · friends', heroesZeroCta: 'Add your first hero',
          heroSoloBtn: 'Solo', heroDuoBtn: 'With me', heroEditBtn: 'Edit', heroDeleteBtn: 'Delete',
          heroesLoadError: 'Could not load. Try again later.',
          loading: 'Loading…', noCardsYet: 'No completed cards yet', heroHistLoading: 'Loading history…', heroHistEmpty: 'No generations yet', heroHistLoadError: 'Could not load history', heroesPageLoadError: 'Could not load heroes', retry: 'Retry',
          forMyself: 'For myself', forHero: 'Create song for {name}', heroDataTitle: '{name} data',
          mtTooltipLyrics: 'Lyrics', mtTooltipAnalysis: 'Analysis', mtTooltipDownload: 'Download', mtTooltipShare: 'Share', mtTooltipVolume: 'Volume', mtVolumeLabel: 'Volume',
          previewHome: 'Home', previewForm: 'Form', previewPayment: 'Payment', previewLoading: 'Loading', previewSuccess: 'Success',
          supportBtn: 'Contact support',
          subActivated: 'Package activated!', subBtnProfile: 'My profile',
          helpPageTitle: 'Help & Support', helpPageSubtitle: 'Everything about YupSoul — clear and simple',
          profileHelpBtn: 'Help & support', profileDeleteAccountBtn: 'Delete account',
          deleteAccountConfirm: 'Delete account and all related data?\n\nWill be deleted: profile, settings, birth data, referral history.\n\nYour created tracks will stay in overall statistics but will be unlinked from your account. This action is IRREVERSIBLE.',
          profileSectionTheme: 'Appearance', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
          profileSubsLink: 'Packages', payOvSubsLink: 'packages & management',
          legalTabOffer: 'Offer', legalTabPrivacy: 'Privacy', legalTabSubs: 'Packages', legalCloseAria: 'Close',
          profilePageTitle: 'Profile', profileSectionMyData: 'My data', profileSectionPlans: 'Packages',
          profileLoadError: 'Could not load profile', profileLoadRetry: 'Refresh',
          profileEditBtn: 'Edit →', profileEditLabelName: 'Name', profileEditLabelDate: 'Date of birth', profileEditLabelCity: 'City of birth', profileEditNamePh: 'Your name', profileEditCityPh: 'City of birth', profileEditSaveBtn: 'Save', profileEditCancelBtn: 'Cancel',
          profileBalanceHintText: 'Invite friends — earn Sparks',
          profileSectionTracks: 'Single tracks', profileTracksNote: 'No package — pay for one track whenever you like.', profileRefTagline: 'Share your link — when a friend gets a subscription, you earn Sparks.',
          tuTitle: 'Buy Sparks', tuBalance: 'on your balance · 1 song = 100 Sparks', tuBalanceVk: 'on your balance · 1 Oracle question = 1 Spark', tuChoose: 'How much to add', tuCta: 'Top up', tuPack1k: '≈ 10 songs', tuPack2k: '≈ 20 songs', tuPack5k: '≈ 50 songs', tuSave2k: 'better value', tuSave5k: 'maximum', tuEntrySub: '1000 / 2000 / 5000 Sparks for new songs',
          iskryPacksTitle: 'Buy Sparks', iskryPack1000Name: '1000 Sparks', iskryPack1000Desc: '10 songs',
          iskryPack2000Name: '2000 Sparks', iskryPack2000Desc: '20 songs',
          iskryPack5000Name: '5000 Sparks', iskryPack5000Desc: '50 songs — best value', iskryPackSongs: 'songs', vkPackHeader: 'Pack', vkPackName: 'Pack: {n} songs', vkPackSongs: '{n} personal songs', vkCardoteka: 'people catalog',
          vkIskryUnavailable: 'Sparks packs are unavailable on VK. Get a package or invite a friend.',
          profileRefInvited: 'Invited', profileRefActivated: 'Activated', profileRefSparks: 'Sparks',
          planCurrentBadge: 'Current', planFreeYours: 'Already yours', planSubscribeBtn: 'Subscribe',
          plTitle: 'Packages', plBalance: 'Your balance', plTopup: 'Top up', plSubsSec: 'Subscriptions · full access', plSubsSecVk: 'Packages · full access', plPacksSec: 'Spark packs · one-time', plBasicTag: 'Basic', plPlusTag: 'Plus', plLabTag: 'Master', plBasicF1: '5 tracks every month', plBasicF2: 'Oracle — 50 questions a month', plBasicF3: 'Order history', plPlusF1: '15 tracks every month', plPlusF2: 'Oracle unlimited', plPlusF3: 'Priority in the generation queue', plLabF1: '30 tracks every month', plLabF2: 'People card-file', plLabF3: 'Oracle unlimited + priority', plFlag: 'most popular', plBasicCta: 'Get Soul', plPlusCta: 'Get Depth', plLabCta: 'Get Laboratory', plOnceSec: 'One-time purchases', plBuy1: 'Song about you', plBuy1s: 'A sound key from your pattern', plBuy2: 'Song for two', plBuy2s: 'Compatibility from two charts', plBuy3: 'Energy of the day', plBuy3s: 'The sound of a specific moment', plBuyPrice: '100 Sparks', plLegalHtml: 'Any song — 100 Sparks. Packages are a one-time payment for 30 days, no automatic charges. Pay by card, Stars or Sparks; promo codes apply to one-time purchases. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Terms</a>.', plLegalVkHtml: 'Sparks are topped up by card and spent on Oracle questions. Packs are a one-time purchase. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Terms</a>.', tuBalanceVk: 'on your balance · 1 Oracle question = 1 Spark', tuPack1kVk: '≈ 1000 Oracle questions', tuPack2kVk: '≈ 2000 Oracle questions', tuPack5kVk: '≈ 5000 Oracle questions', tuEntrySubVk: '1000 / 2000 / 5000 Sparks for Oracle questions', iskryPackQuestions: 'Oracle questions',
          planFreeName: 'Seeker', planFreeBadge: '✦ YupSoul Seeker',
          planFreeNameClassic: '(Free)', planBasicNameClassic: '(Basic)', planPlusNameClassic: '(Plus)', planMasterNameClassic: '(Laboratory)',
          planBasicName: 'Soul', planPlusName: 'Depth',
          planDetailsBtn: 'Details', planPopularBadge: 'most chosen', planMasterBadgeText: 'Best choice',
          planMasterNameText: 'Laboratory', planOpenMasterBtn: 'Open Laboratory',
          planModalSection: 'What\'s included', planModalSubscribe: 'Subscribe to {title}', planModalClose: 'Close',
          planConfirmHeader: 'Plan',
          vkPackHeader: 'Pack', vkPackName: 'Pack: {n} songs', vkPackSongs: '{n} personal songs', vkCardoteka: 'people catalog',
          ptiSingleName: 'For myself', ptiSingleDesc: 'Your personality in sound',
          ptiCoupleName: 'For two', ptiCoupleDesc: 'Your bond and resonance',
          ptiTransitName: 'Day energy', ptiTransitDesc: 'A song for today',
          successTitle: 'Request accepted!', successDesc: 'Your song is being generated. When ready — it\'ll arrive in the bot. Usually 10–20 minutes.', successWhereTrack: 'Your song will appear in<br><b>My Tracks</b>',
          successHint: 'Not arrived in 20 min? Tell the bot "song not arrived".', successToProfile: 'Go to profile',
          successListen: 'Open bot', successMyTracks: 'My tracks',
          typewriter1: 'Create a song about yourself on any topic.',
          typewriter2: 'Get a text transcript based on deep analysis of your request.',
          typewriter3: 'Talk to your soul with Soul Chat.',
          typewriter4: 'Sparks are waiting — create your song.',
          typewriter5: 'Create cards with data of your loved ones or clients for quick access.',
          typewriter6: 'Combine cards with data of loved ones.',
          typewriter7: 'Make a unique, deep gift for yourself and loved ones.',
          loadingTitle: 'Request accepted', loadingGenerating: 'Creating your song...', loadingWait: 'Usually 10–15 minutes. Will appear in My Tracks.', rateLimitError: 'Server is processing. Please wait and try again.',
          heroesPageTitle: 'Contacts', heroesPromoHeading: 'Master\'s Dashboard',
          heroesPromoDesc: 'Add people once — and generate songs for them in one tap. Full history with lyrics.',
          heroesPromoFeaturesTitle: 'What\'s included:',
          heroesF1: '✦ Unlimited number of people', heroesF2: '✦ Quick solo & duo song generation',
          heroesF3: '✦ Music style preferences', heroesF4: '✦ Full history with lyrics & analysis',
          heroesF5: '✦ Audio straight from the person\'s card',
          heroesTrialBtn: '1 day free — try it out', heroesSubBtn: 'Get Laboratory — 3 250 ₽',
          heroesSubNote: '30 tracks',
          heroFormTitle: 'Add person', heroRelLabel: 'Relationship', heroBirthdateHint: 'Select day, month and year',
          heroTimeBirthLabel: 'Time of birth', heroStyleLabel: 'Favourite music styles', heroStylePh: 'pop, jazz, electronic…',
          requestPreferredStyleLabel: 'Song style',
          requestPreferredStylePh: 'pop, R&B, hip‑hop, techno, house, ambient…',
          styleQuickLabel: '✦ Music styles',
          heroRelOpt0: '— select —', heroRelOpt1: 'Mother', heroRelOpt2: 'Father', heroRelOpt3: 'Daughter', heroRelOpt4: 'Son',
          heroRelOpt5: 'Sister', heroRelOpt6: 'Brother', heroRelOpt7: 'Grandmother', heroRelOpt8: 'Grandfather',
          heroRelOpt9: 'Husband', heroRelOpt10: 'Wife', heroRelOpt11: 'Loved one',
          heroRelOpt12: 'Friend', heroRelOpt13: 'Girlfriend', heroRelOpt14: 'Colleague', heroRelOpt15: 'Mentor', heroRelOpt16: 'Other',
          dateDay: 'Day', dateMonth: 'Month', dateYear: 'Year',
          scLoading: 'Loading…', scCheckingAccess: 'Checking your package: whether Soul Chat is included or you have single access…', scTyping: 'Soul Chat is typing…', scHeroTagline: 'Talk to your soul', scPromoIntro: 'Soul Chat is your AI assistant that understands you like a best friend or your Higher Self. Answers questions about your character, purpose and path.',
          scPromoErrorText: 'Get a package or buy 24-hour access', scPromoRetryBtn: 'Refresh',
          scMoreBtnText: 'More ↓', scMoreBtnCollapse: 'Collapse ↑', scStat1: 'report reduced anxiety', scStat2: 'feel understood',
          scStat3: 'find answers faster', scStat4: 'come back again',
          scExamplesTitle: 'Example questions',
          scEx1: '"Why is it so hard for me to talk about my feelings?"', scEx2: '"What is my main fear and how to work with it?"',
          scEx3: '"What is my purpose and how do I get there?"',
          profileNotifDisable: 'Turn off notifications', profileNotifEnable: 'Turn on notifications',
          scSubIncluded: 'Soul Chat included in package', scChoosePlanBtn: 'Choose a plan →', scSubMobileHint: 'Payment is unavailable on this platform',
          scGiftHeading: 'Try Soul Chat — 24 hours', scGiftNote: 'One time per user',
          scGiftBtnText: 'Get 24 hours free', scBuyDayNote: 'Not ready for a package? Try single access',
          scBuyDayBtnText: 'Open Soul Chat for 24h — 2.99 $', scToastPaymentReceived: 'Payment received, access granted',
          scSubRequiredForReply: 'Package required to continue the dialogue with the Oracle',
          scPickerTabSynastryText: 'Compatibility', scSynastryTeaserText: 'Compatibility — dialogue for two charts at once — available in Lab plan',
          helpT1: 'What is YupSoul', helpB1: '<p>YupSoul creates a <strong>personal song just for you</strong> — based on your date, time and place of birth. The system analyses your personality and writes a song about your real qualities, path and strength.</p><p>This is not a template — each song is unique and belongs only to you.</p>',
          helpT2: 'What can be created', helpB2: '<p><strong>Creation modes:</strong></p><ul><li><strong>Song about me</strong> — your personal sonic portrait: who you are, your strength and inner path</li><li><strong>Song for two</strong> — for a couple (lovers, friends). Analyses both dates and reflects the union</li><li><strong>Day energy</strong> — a song for a specific date and place. What opportunities are opening right now</li></ul><p><strong>Music style:</strong></p><ul><li><strong>Custom style</strong> — choose genre and mood manually</li><li><strong>Astro-style</strong> — the system picks style based on your data</li><li><strong>Like a star</strong> — name your favourite artist and the song will sound like theirs</li></ul><p><strong>Quick requests</strong> — ready-made ideas: power song, birthday song, meditative, about letting go, and more.</p><p><strong>Soul Chat</strong> — an AI assistant that understands you deeply. Ask questions about your character, purpose and path.</p>',
          helpT3: 'How long to wait', helpB3: '<p>Usually <strong>5–15 minutes</strong>. The bot will send a notification when your song is ready.</p><p>You can close the app — the result will arrive on its own, nothing will be lost.</p>',
          helpT4: "I don't know my exact birth time", helpB4: '<p>No problem. Check <strong>"Time unknown"</strong> — the system will create a full song based on the other data.</p>',
          helpT5: 'Sparks & payment', helpB5: '<p><strong>You create your first song right away — one minute of it is a gift; loved it — unlock the full track with one light payment.</strong></p><p>Sparks are earned: claim your daily Spark (+2 every day, +10 for every 7-day streak), +30 for the app intro, +5 for notifications.</p><p>Earn more Sparks by inviting friends: share your link from Profile → Invite a friend. When an invited friend gets a subscription — you earn Sparks.</p>',
          helpT6: 'Payment & promo codes', helpB6: '<p>Additional generations are paid according to the tariff. Payment options are shown on screen when placing an order.</p><p>If you have a <strong>promo code</strong> — enter it on the payment screen. Promo codes are case-sensitive.</p>',
          helpLegalTitle: 'Legal information', helpLegalSeller: 'Provider: IE Anton Tataurov, TIN 920000802153, Sevastopol', helpLegalSupport: 'Support: use the “Contact support” button above — we reply within a day', helpLegalOffer: 'Terms: payment, refunds, service rules', helpLegalPrivacy: 'Privacy', errPayPlatform: 'Payment is not available on this platform',
          helpT7: 'Something went wrong', helpB7: '<p><strong>App closed or showed an error</strong> — try reopening the bot. Unfinished orders are restored automatically.</p><p><strong>Paid but no song</strong> — wait 15–20 minutes. If nothing arrives — tell the bot "song not arrived". Or contact support.</p><p><strong>Promo code not accepted</strong> — check the letter case. If everything is correct — write to us with the code.</p>',
          helpPartnerTitle: 'Partner program',
          helpT8: 'Soul Chat & packages', helpB8: '<p><strong>Soul Chat</strong> — talk to your soul based on your data. Ask about character, purpose, choices. Open to everyone: first 10 questions free, then 1 question = 1 Spark. A subscription removes the limit — Soul (50 questions/mo), Depth and Lab (unlimited). You can also buy 24h access.</p><p><strong>Packages</strong> — Soul (5 tracks + Soul Chat), Depth (15 tracks + Soul Chat unlimited + transcript), Lab (30 tracks, people directory, Soul Chat unlimited + transcript). Transcript (detailed analysis) is included in Depth and Lab; for Soul and one-time tracks — the first comes as a gift, then paid separately. Get package in Profile or on the payment screen.</p>',
          helpT9: 'For practitioners & pros', helpB9: '<p><strong>Directory & compatibility.</strong> Keep a client directory, analyse compatibility from two birth charts — one song per couple. Ideal for astrologers and consultants.</p><p><strong>Scale without losing quality.</strong> Up to 30 tracks with Lab package. Unique content for each client — no templates or repeats.</p><p><strong>Monetisation & gifts.</strong> Gift songs to clients, include them in consultation packages or sell separately. A minute of the first song as a gift — try it yourself.</p>',
          helpT10: 'What users say', helpB10: '<p><em>«Incredible! The song really captured my character and what I\'m going through. Goosebumps!»</em> — Anna M.</p><p><em>«Gave it to my wife for her birthday — she was thrilled! Now we want a song about us as a couple»</em> — Dmitry K.</p><p><em>«A minute as a gift is fair. Quality is top, I\'ll definitely order again»</em> — Elena V.</p>',
          helpSearchPh: 'Search questions…', helpSearchAria: 'Search questions', helpSearchClear: 'Clear', helpFaqTitle: 'Common questions', helpSearchEmpty: 'Nothing found', helpFound: 'found',
          helpHeroTitle: 'How can we help?', helpHeroSub: 'Everything about YupSoul — clear and simple. Find an answer or message us.', helpPartnerSub: 'Earn 20% from your friends\\\' packages', helpFoot: '✦ We are here — we reply within a day ✦',
          profileBalanceLbl: 'Sparks balance',
          profileTracksLeftLbl: 'Tracks left',
          profileOnBalanceSuffix: 'on balance',
          homeIskryHintGuest: 'Start — the first minute of your song is a gift',
          homeIskryHintEnough: 'You have {n} Sparks — enough for a track',
          homeIskryHintLow: 'You have {n} Sparks — invite a friend to create a track',
          homeIskryHintZero: 'Invite a friend — Sparks when they subscribe',
          songCounterLabel: 'people discovered themselves',
          planFreeF1: 'First song — one minute as a gift', planFreeF2: 'All formats',
          planBasicF1: '✦ 5 tracks', planBasicF2: '✦ Soul Chat (50 messages)', planBasicF3: 'Order history', planBasicSave: '−67% vs singles',
          planPlusF1: '✦ 15 tracks', planPlusF2: 'Soul Chat unlimited', planPlusF3: 'Priority processing', planFeatDiary: 'Oracle Diary — a reading every morning', planPlusF4: 'Full track history', planPlusSave: '−72% vs singles',
          planMasterF1: '✦ 30 tracks', planMasterF2: 'People directory', planMasterF3: 'Generation history', planMasterF4: 'Soul Chat unlimited', planMasterSave: '−83% vs singles',
          perMonth: '/mo', iskryUnit: 'Sparks', iskryStatEarned: 'Earned', iskryStatSpent: 'Spent', iskryBreakdownSongs: 'Songs', iskryBreakdownChat: 'Soul Chat', planBasicPrice: '810 ₽', planPlusPrice: '2 030 ₽', planMasterPrice: '3 250 ₽',
          scPlanBasicDesc: '5 tracks + Soul Chat', scPlanPlusDesc: '15 tracks + Chat unlimited', scPlanMasterDesc: '30 tracks + Chat unlimited',
          planPlusF5: 'Music style choice', planMasterF5: 'Music style choice',
          profileTracksThisMonth: 'Tracks in package', profileTracksRemaining: '{n} tracks left',
          profileRenewalDate: 'Package active', planStatusActive: '✓ Active', profileNextCharge: 'Next charge: {date}',
          profileCardNotLinked: 'Card not linked. Link a card for full management.',
          profileBindCard: 'Link card', profileUnbindCard: 'Unlink card', profileChangeCard: 'Change card', profilePaymentMethod: 'PAYMENT METHOD',
          profileActiveSubscription: 'Package active', profileCancelSubscription: 'Deactivate package', profileSubCardLabel: 'Card linked',
          subCancelledGrace: 'Package used', subCancelledBadge: 'Used', subReactivateBtn: 'Reactivate', profileSubExpires: 'Package active',
          subExpiredTitle: 'Package used', subExpiredMsg: 'Your {planName} package was used', subExpiredReactivate: 'Reactivate {planName}', subExpiredOrSingle: 'or buy a single song',
          trackLimitUpgradeToPlus: 'Upgrade to Plus — 15 tracks', trackLimitUpgradeToMaster: 'Upgrade to Lab — 30 tracks',
          subExpiryBanner3d: 'Package is valid for {n} more days', subExpiryBanner1d: 'Package is valid for 1 more day', subExpiryManageBtn: 'Manage',
          iskryNotEnough: 'You have {current} Iskry. Need {needed} more', unlockIskryNeedPack: 'Your first song unlocks with an Iskry pack. Pick a pack — or unlock it directly', iskryNoneToast: 'No Iskry to pay with', iskryNeedTopup: 'You need {needed} Iskry to pay. Top up or enter a promo code below.', iskryNotEnoughFull: 'Not enough Iskry (need {n}). Top up your balance or enter a promo code.', iskryNotEnoughVk: 'Not enough Iskry (need {n}). Top up your balance.', iskryNeedTopupVk: 'You need {needed} Iskry to pay. Top up your balance.', iskryPayRetry: "Couldn't complete it. Try again or choose another method.", playLabel: 'Play', pauseLabel: 'Pause', suPromoNoted: 'Code saved — it will apply when you unlock the song', payAuthLost: 'Reopen the app and try again.', payLinkCopied: 'Payment link copied', iskryTopUpViaReferral: 'Invite a friend — Sparks when they subscribe', iskryDepletedReferralHint: 'Out of Iskry. Invite a friend!',
          soulChatExpiresIn: 'Access: {hours}h {minutes}m left',
          formStep1: 'Step 1', formStep2: 'Step 2', formStep3: 'Step 3',
          refFriend1: 'friend', refFriend2: 'friends', refFriend5: 'friends', refLinkLoading: 'Loading…',
          profileConnectedServices: 'Connected services', profileLinkedLoading: 'Loading…',
          profileLinkTgBtn: 'Link Telegram', profileLinkGoogleBtn: 'Link Google',
          refEarningsLabel: 'Your Sparks:',
          refNextHintFirst: 'For each friend who creates a song — 10 Sparks',
          refNextHintNext: 'For each friend who creates a song — 10 Sparks',
          iskryTitle: 'Your Sparks',
          linkedStatusLinked: 'Linked', linkedStatusNotLinked: 'Not linked', linkedStatusNoData: 'No data', linkedStatusLoadFail: 'Failed to load',
          linkedGoogleLinked: 'Google linked!', linkedGoogleFail: 'Failed to link Google. Try again.', linkedConnFail: 'Connection failed. Check your internet.',
          linkedTgOpenBot: 'Open the bot in Telegram and tap Start. Then come back and refresh the page.',
          profileLinkTgHint: 'Tap the button to open the bot, then tap Start to link.',
          linkedGoogleSdkFail: 'Google Sign-In unavailable. Try from a browser.',
          cancelSubFail: 'Failed to deactivate package. Try again.',
          trackLimitTitle: 'Limit reached',
          trackLimitMsg: 'Your track limit for this month has been reached.',
          trackLimitHint: 'Upgrade your plan or buy a single song.',
          trackLimitActionsTitle: 'What next?',
          trackLimitBuySingle: 'Buy a single song',
          trackLimitUpgrade: 'Upgrade package',
          trackLimitPayIskry: 'Pay with Iskry',
          trackLimitBackToProfile: 'Back to profile',
          trackLimitPayHint: 'Package limit reached. Pay for an extra song.',
          labHintTitle: 'Laboratory',
          labHintDesc: 'Save your loved ones\' profiles and pick them in one tap — no need to enter data every time',
          labHintGo: 'Learn more',
          labHintLater: 'Later',
          cancelSubSuccess: 'Package active',
          cancelSubSuccessNoDate: 'Package active',
          profileSubscriptionCancelled: 'Package used',
          cancelSubConfirm: 'Deactivate package?\n\nAccess will remain until {date}, then your profile switches to the free Explorer plan. No refund for the paid amount.',
          cancelSubConfirmNoDate: 'Deactivate package?\n\nAccess will remain until the end of the paid period, then your profile switches to the free Explorer plan. No refund for the paid amount.',
          cancelSubProgress: 'Cancelling…',
          guestName: 'Guest',
          quickPickerLabel: '✦ Quick requests',
          inboxTitle: 'Notifications', inboxEmpty: 'No notifications yet', inboxOpen: 'Open',
          forWhoLabel: 'Who are we generating for?', forWhoAddContact: '+ Add contact', pickFromLab: 'Choose from Laboratory', pickFromLabSelected: 'Selected: ', pickFromLabEmpty: 'No saved people. Add them in Laboratory.', pickFromLabHint: 'Choose a person from Laboratory — fields will fill automatically.',
          coupleSrcMePerson: 'Me + Person', coupleSrcCardCard: 'Card + Card', couplePerson1Label: 'First person', couplePerson1Pick: 'Choose from Laboratory', couplePerson1Required: 'Select the first person from Laboratory', coupleSelfCard: 'Me',
          nameLbl: 'Name', birthdateLbl: 'Date of birth', birthplaceLbl: 'Place of birth', birthtimeLbl: 'Time of birth', birthtimeUnknownHint: 'Time unknown',
          payOvCardTitleDefault: 'Package / order payment', payOvTrialText: 'Use your Sparks!', payOvFreeClaimBtn: 'Pay with Sparks — ' + ISKRY_PRICES.single_song + ' Sparks',
          payOvPromoToggle: '▸ Have a promo code?', orPay: 'Or pay:', priceLabel: 'Price:',
          payOvLinkHint: "If the window didn't open — copy the link and paste in your browser:",
          payOvCopyBtn: 'Copy payment link', payOvCheckBtn: "I've already paid — verify",
          payOvPromoConfirmBtn: 'Confirm and submit',
          paymentThanksTitle: 'Payment successful', paymentThanksMsg: 'Song is being created. It will arrive in the bot chat. You can close the window.',
          paymentThanksHintText: "Not arrived in 20 minutes? Message the bot 'song not received'",
          logoSubtitle: 'Music Oracle', homeBrand: 'MUSIC ORACLE',
          homeTeaser: 'A gift is hidden in your birth date — reveal it through a song', homeTeaserHtml: 'A gift is hidden in your <span class="tagline-glow">birth date</span> — reveal it through a <span class="tagline-glow">song</span><span class="tagline-underline"></span>',
          startBenefitAbout: 'About you', startBenefitCompat: 'Compatibility', startBenefitDaily: 'Song of the day', startBenefitFinance: 'Finances',
          wlHeadline1: 'Songs from your birth date',
          wlHeadline2: 'for every moment of life',
          wlPlaylistKick: 'Create your playlist',
          wlPlaylistName: 'Hits about you',
          wlPlaylistSub: 'by birth date · for every moment',
          wlTrack1Name: 'I\'m not a function, I\'m life',
          wlTrack1Desc: 'about being alive',
          wlTrack2Name: 'Keeper of the Threshold',
          wlTrack2Desc: 'a birthday song',
          wlTrack3Name: 'For Your Love',
          wlTrack3Desc: 'a confession',
          wlLoginTitleHtml: 'Hear how <span class="home-card-title-accent">your</span> birth date sounds',
          wlProof: '3,000+ songs already created',
          loginVia: 'Sign in via',
          review1: 'This is just fantastic! Seriously, you read me! This is an amazing project!', reviewAuthor1: 'Roman',
          review2: 'Love it! The style I adore, the words go straight to the heart!', reviewAuthor2: 'Julia',
          review3: 'How did the AI know about the blueprints, the coffee, the reports? Bravo!!!', reviewAuthor3: 'Gennady',
          review4: 'Loved the dynamics: from calm to powerful. Certain moments really match!', reviewAuthor4: 'Alexander',
          review5: 'The first one is a masterpiece! Surprised me, listened 15 times, sent it to my mom.', reviewAuthor5: 'Vladimir',
          review6: 'Very beautiful and light song, you can literally meditate listening to it!', reviewAuthor6: 'User',
          homeServiceDesc: 'The only service where a song is created through deep analysis of your date of birth.',
          homeChoicesHead: 'ONLY HERE', homeChoicesHeadMain: 'Try today',
          homeChoiceMain1: 'Song of the day', homeChoiceMain2: 'Who am I?', homeChoiceMain3: 'Star style', homeChoiceMain4: 'Compatibility', homeChoiceMain5: 'Oracle Diary',
          // VK native (oracle-only): home screen, empty playlist, question presets
          vkOracleHeroTitleHtml: 'The Oracle knows your <span class="home-card-title-accent">birth date</span> — and answers',
          vkOracleHeroCta: 'Ask a question', vkOracleChoicesHead: 'Ask today',
          vkOracleChoice1: 'Who am I?', vkOracleChoice2: 'My gift', vkOracleChoice3: 'Money', vkOracleChoice4: 'Love',
          vkOracleAskBtn: 'Ask the Oracle',
          vkOracleEmptyTitle: 'The Oracle answers your questions',
          vkOracleEmptyDesc: 'Ask about yourself — from your birth date',
          vkOracleQ1: 'Tell me who I am based on my birth date — what is my character and what can I rely on?',
          vkOracleQ2: 'What is my gift according to my birth date — what was given to me at birth and how do I unfold it?',
          vkOracleQ3: 'How is it with money for me by my birth date — where is my money channel and what opens it?',
          vkOracleQ4: 'What do I need to know about love and relationships based on my birth date?',
          homeChoice1: 'Song of the Day', homeChoice1Hint: 'Every day carries unique energy. Discover yours through music.',
          homeChoice2: 'Quick Song About Me', homeChoice2Hint: 'One click — a song written from your birth date.',
          homeChoice3: 'Soul Chat', homeChoice3Hint: 'Your personal AI assistant based on your birth date.',
          homeChoice4: 'Gift for a Friend', homeChoice4Hint: 'Surprise someone special with a unique song about how amazing they are.',
          navSoulChat: 'Oracle', navHelp: 'Help', navLab: 'Contacts', navTracks: 'Playlist',
          navSoulChatFull: 'Oracle', navMyTracks: 'Playlist', navSoulChatShort: 'Oracle', navMyTracksShort: 'Playlist', myHeroesShort: 'Contacts', myHelpShort: 'Help',
          soulChatPageTitle: 'Soul Chat', scHeroTitle: 'Soul Chat',
          myTracksPageTitle: 'Music', mtGlabelRecent: 'Recent', mtCreateBtn: 'Create a new song',
          myTracksPageSubtitle: 'Your collection of sound keys',
          mtHeroBadge: 'Sound keys',
          mtHeroTitle: 'Every song is a unique key to your soul',
          mtHeroDesc: 'Listen, download and share. All your tracks are stored here forever.',
          myTracksLoading: 'Loading tracks…',
          mtEmptyTitle: 'Your songs will appear here',
          mtEmptyDesc: 'Create your first one — from your birth date',
          mtEmptyCta: 'Create song',
          myTracksLoadMore: 'Load more',
          mtNowPlayingTitle: 'Now playing',
          mtNpFromCollection: 'Playing from collection',
          mtTabTracks: 'My tracks', mtTabLiked: 'Favorites', mtTabRadio: 'Radio', mtSearchPh: 'Search tracks', mtSearchAria: 'Search', mtLikedEmpty: 'Tap ♡ on any track — it will appear here.', mtActPlay: 'Listen', mtActShare: 'Share', mtHeroEyebrow: 'Your collection', mtHeroSub: 'Created from your birth date', mtHeroPlayAll: 'Play all',
          mtActSpark: 'Spark', mtActText: 'Lyrics', mtActAnalysis: 'Analysis', mtActDownload: 'Download', mtActShare: 'Share', mtActBroadcast: 'Broadcast', mtActGift: 'Gift', mtActResing: 'Re-sing with your own words',
          shareSheetTitle: 'Share song', shareEyebrow: 'My soul song', shareFootCreate: 'Create your own', shareCardSub: 'Song from your birth date', shareFmtStory: 'Stories', shareFmtPost: 'Post', shareFmtLink: 'Link', shareCopyBtn: 'Copy', shareSaveImg: 'Save image', shareTgtLink: 'Link', shareTgtStory: 'Stories', shareTgtMore: 'More', shareToVk: 'To VK Story', shareToOk: 'Share to OK', shareToWeb: 'Share', shareToTg: 'To Telegram', shareVkStory: 'To Story', shareVkWall: 'To Wall', shareHint: 'Send the link to someone close — they’ll open it and hear the whole song.', shareCreateOwn: 'Create your own song', shareCopied: 'Copied', shareRendering: 'Preparing image…', shareSaved: 'Image saved', shareSaveFail: 'Could not save', karaokeTitle: 'Lyrics', karaokeSub: 'Karaoke · line by line', diaryPwEyebrow: '3 trial days — done', diaryPwMsgFrom: 'YupSoul · your tuning', diaryPwMsgTime: 'this morning', diaryPwMsgBody: 'Good morning{name}. Today is a day about **grounding and calm decisions**. Better not to rush an important talk before noon — it goes easier after.', diaryPwMsgPin: 'Anchor of the day: a warm talk with someone close', diaryPwH: 'Liked starting your day like this?', diaryPwSub: 'This is your Diary. Every morning in Telegram — a personal message tuned to your day. The trial days are over — let\'s continue together.', diaryPwFeat1Title: 'Comes to your chat', diaryPwFeat1Desc: 'Every morning, at the time you choose', diaryPwFeat2Title: 'Tuned to your date', diaryPwFeat2Desc: 'Not a generic horoscope — a reading just for you', diaryPwFeat3Title: 'Topics — your choice', diaryPwFeat3Desc: 'Love, work, energy, relationships', diaryPwPlan: 'Included in Depth and Laboratory plans', diaryPwCta: 'Continue the diary', karaokeEmpty: 'Lyrics for this song aren\'t available yet', prismOracleRetry: 'The Oracle got lost in thought. Try once more.',
          rdTitle: 'Radio', rdSubtitle: 'Endless waves for your energy', rdOnAir: 'on air', rdLiveNow: 'Live',
          rdYouLive: 'You are live', rdPitchTitle: 'Send your song on air', rdPitchSub: 'The whole YupSoul community will hear it — a live stream of soul songs.', rdNowLive: 'On air now — a live community stream', rdLiveTitle: 'Your song plays for everyone', rdReady: 'ready', rdYourSong: 'your song', rdV1t: 'Heard live', rdV1s: 'Dozens of people on air right now', rdV2t: 'Sparks for reactions', rdV2s: 'Listeners like — you earn Sparks', rdV3t: 'Reach the weekly top', rdV3s: 'The whole community sees the best songs', rdRewardHtml: 'A song on air <b>earns Sparks</b> — and Sparks turn into new songs of your soul.', rdGo: 'Send on air', rdGoHint: 'You can take it off air anytime', rdLeave: 'Take off air', rdLeaveHint: 'Your song plays in the shared YupSoul Radio stream', rdStatListens: 'plays', rdStatHearts: 'likes', rdStatSparks: 'Sparks earned', rdReactHint: 'Listeners are reacting to your song', rdRankTop: 'Top of the week', rdRankWave: 'wave', rdRankOf: 'of', rdRankClimb: 'Collect likes — climb the weekly top',
          rdSongOfDay: 'Song of the day', rdSongOfDaySub: "Today's energy", rdNowListening: 'Now listening', rdWaves: 'Waves',
          rdCosmos: 'Cosmos', rdCosmosTag: 'Deep ambient', rdDuo: 'Two souls', rdDuoTag: 'On love & bonds',
          rdFlow: 'Flow', rdFlowTag: 'Money & momentum', rdCalm: 'Quiet strength', rdCalmTag: 'Meditation & calm',
          rdGroza: 'Storm', rdGrozaTag: 'Loud & powerful', rdListen: 'listening', rdAllWaves: 'all ›',
          rdQuiet: 'quiet on air', rdSomeone: 'Someone', rdBeFirst: 'Quiet on air — be the first to tune in', rdEmpty: 'This wave is still filling up', rdRadioArtist: 'YupSoul · Radio', rdShareToRadio: 'Share to Radio', rdInRadio: 'Sent to Radio', rdShareDone: 'Sent to Radio for review', rdShareOff: 'Removed from Radio',
          rwMood: 'By mood', rwTender: 'Tenderness', rwPower: 'Strength', rwLight: 'Light', rwFlight: 'Flight', rwCalm: 'Calm',
          rdWaveAll: 'All waves', rdFresh: 'Fresh on air', rdTopWeek: 'Top of the week', rdNowOnAir: 'On air now', rdAnon: 'Anonymous', rdToday: 'today', rdYesterday: 'yesterday', rdLike: 'Like', rdMore: 'More', rdReport: 'Report', rdBlockAuthor: 'Hide this author', rdSheetCancel: 'Cancel', rdReportSent: 'Thank you, we will look into it', rdReportHidden: 'Track taken off the air', rdBlockDone: 'We will not show this author again', rdActionFailed: 'Did not work — try again', errReportSelf: 'This is your own song', errBlockSelf: 'This is your own song', errTrackNotFound: 'Track not found', rdSave: 'Save', rdListen2: 'Listen', rdListensNow: 'is listening to', rdEmpty2: 'No one has published a song on this wave yet. Be the first — from the “My tracks” tab.', rdSavedTitle: 'Saved', rdSavedEmpty: 'Songs from Radio you save will appear here. Tap the bookmark on any song.', rdSavedToast: 'Saved to collection', rdUnsavedToast: 'Removed from collection', mtTabSaved: 'Saved', navCancel: 'Cancel',
          pubInEther: 'On air', pubTitle: 'Publish to Radio', pubSubtitle: 'Other listeners will hear your song. You can take it off air anytime.', pubWave: 'Wave', pubShowAuthor: 'Show author name', pubAnon: 'Anonymous', pubGo: 'Publish', pubDoneTitle: 'Your song is on air!', pubDoneText: 'Other listeners will now find it in Radio.', pubYou: 'You', pubFail: 'Could not publish',
          mngOnAir: 'On air', mngManage: 'Manage broadcast', mngManageText: 'Listeners can like and save it.', mngListeners: 'Plays', mngLikes: 'Likes', mngCollections: 'In collections', mngOpenRadio: 'Open in Radio', mngUnpublish: 'Take off air', mngUnpubDone: 'Taken off air', mtTrackDeleted: 'Song deleted', mtUndo: 'Undo',
          errTrackNotReady: 'Track is not ready yet', errRadioWave: 'Choose a wave', errRadioProfanity: 'This song contains profanity — it can\'t be sent to the public radio', errTasteLockedRadio: 'Unlock the full song first — then you can send it on air',
          mtSelectTrack: 'Select a track',
          mtDownload: 'Download',
          mtLyrics: 'Lyrics',
          mtShare: 'Share',
          mtLinkCopied: 'Link copied',
          mtNoTitle: 'Song of Soul',
          mtModeSingle: 'About me',
          mtModeCouple: 'For two',
          mtModeTransit: 'Day energy', mtPlayError: 'Playback failed', mtLyricsTitle: 'Lyrics', mtAnalysisTitle: 'Analysis', mtCopied: 'Copied', mtCopyFail: 'Copy failed', mtCopyBtn: 'Copy', mtCloseBtn: 'Close', mtDownloading: 'Opening...', mtShareFail: 'Share failed', mtLinkCopied: 'Link copied',
          dlUnlockTitle: 'Shall we get your song? 🎵', dlUnlockSub: 'Choose how to keep it — just one warm step 🤍', dlUnlockJoin: 'Join and download', dlUnlockOr: 'or one small task', dlUnlockShare: 'Share the song', dlUnlockReview: 'Leave a review', dlUnlockReviewPh: 'A few warm words about the app…', dlUnlockReviewSend: 'Send and download', dlUnlockUpsell: 'With a package — downloads without tasks.', dlUnlockClose: 'Later', dlChecking: 'One sec, checking…', dlDone: 'Done, downloading', dlTryAgain: "Don't see it yet — try again", dlReviewShort: "A few more words — and you're set",
          dlGateTitle: 'Download the song', dlGateEyebrow: 'Your first song', dlGateHeadline: 'Get your song as a gift', dlGateLead: 'Complete a task below — and the song file saves to your device. This is how we grow together.', dlGateSteps: 'Steps to unlock', dlGateAltB: 'Prefer no tasks?', dlGateAltRest: 'Get a pack — download any songs with no steps.', dlGatePacks: 'Packs ›', dlGateLocked: 'Complete a task to download', dlGateReady: 'Download the song', dlGateHint: 'The file saves as MP3 to your device', dlDoneTitle: 'Song downloaded 🤍', dlDoneTextRest: 'is saved to your device. Thank you for being with us — much more music is ahead.', dlTrackFallback: 'Soul song', dlTrackSub: 'Soul song', dlTaskVkTitle: 'Join the community', dlTaskVkSub: 'YupSoul on VK', dlTaskVkAct: 'Join', dlTaskShareTitle: 'Share the song', dlTaskShareSub: 'Tell friends about YupSoul', dlTaskShareAct: 'Share', dlTaskReviewTitle: 'Leave a review', dlTaskReviewSub: 'A few warm words about the app', dlTaskReviewAct: 'Write',
          myTracksWipTitle: 'Page in development',
          myTracksWipText: 'Your tracks will appear here soon. For now, you can create a song or open Soul Chat.',
          profileMyTracks: 'My tracks',
          footerSubManage: 'Manage packages', footerOffer: 'Terms', footerPrivacy: 'Privacy',
          webLoginOr: 'Or', webLoginTelegram: 'Open in Telegram', googleSignIn: 'Sign in with Google',
          webLoginTeaser: 'Sign in with Google to create personalized songs. Or open the app in Telegram.',
          bsPromoToggle: 'I have a promo code',
          bsChooseMethod: 'Choose payment method:',
          bsPayCard: 'Pay by card',
          payTitle: 'Song payment', paySecure: 'Secure', cfTitle: 'Payment confirmation', successEyebrow: 'Payment received', successEyebrowTaste: 'Your first song', successReceiptName: 'Soul song', successReceiptSub: 'in the works', successMaking: 'The Oracle is writing your melody…', successAskOracle: 'Ask the Oracle while you wait', successShare: 'Share with a loved one', successReadyLine: 'Almost there — it will appear in your Playlist', successNotifyBtn: "Notify me when it's ready", successNotifyDone: "We'll ping you in VK ✓", successReadyTitle: 'Done — your<br>song is being born', successReadyLead: "Thank you! <b>Your soul song</b> is being created — it will appear in the Playlist tab in about 15 minutes.", cfSub: 'Check the details — and we confirm.', cfWhat: 'Purchase', cfIncludes: "What's included", cfTotal: 'To pay', cfPay: 'Confirm and pay', payOrderEyebrow: 'Your order', payOrderMeta: 'A unique track from your date · arrives in Telegram in ~15 minutes', payPriceLabel: 'To pay', payPriceSub: 'One-time payment · one song', payByIskry: 'Pay with Sparks', payByPromo: 'I have a promo code', payPromoSub: 'Enter the code — we\\\'ll cover the cost', pmTitle: 'Enter promo code', pmSub: 'We will cover the cost or add Sparks.', pmBack: 'Back to payment', promoLen3to50: 'Promo code must be 3 to 50 characters', payRetry: 'Please try again.', promoChecking: 'Checking promo code...', payTrustSecure: 'Secure payment', payTrustHold: 'Order kept for 7 days', payOvBack: 'Back',
          bsPayStars: 'Pay with Stars',
          bsTopupIskry: 'Top up Sparks', tuPack100: '= 1 song', giftVkUnavail: 'This gift can’t be opened in this version of the app',

          bsDiscount: 'Discount',
          bsGotIt: 'Got it',
          bsClose: 'Close',
          bsPaymentNotOpened: 'If the payment page didn\'t open — tap "Copy link" below and open it in your browser.',
          bsPaymentAccepted: 'Payment accepted.<br><br>You can close this window and return to Telegram — the song will arrive in the bot chat.',
          bsDiscountApplied: 'Discount: {amount} {currency}',
          bsPromoNotFound: 'Promo code not found',
          bsPromoExpired: 'Promo code expired',
          bsPromoLimit: 'Usage limit reached',
          bsPromoInvalid: 'Invalid promo code',
          bsPromoCheckError: 'Verification error',
          bsPromoApplied: 'applied',
          bsFree: 'Free',
          bsConfirm: 'Confirm',
          bsConnectingBank: 'Connecting to bank…',
          bsPaymentCreateError: 'Failed to create payment. Try another method.',
          bsTracksPerMonth: 'personal tracks',
          navBack: 'Back', navClose: 'Close', loading: 'Loading…', btnRefresh: 'Refresh', btnSave: 'Save', btnCancel: 'Cancel', btnSending: 'Sending…', btnSaving: 'Saving…', btnOpening: 'Opening…', btnUnlinking: 'Unlinking…',
          helpPageTitle: 'Help & Support',
          phName: 'Name (optional)', phBirthplace: 'Moscow, London, New York...', phName2: 'Name (optional)', phBirthplace2: 'Moscow, London, New York...', nameHintEmpty: 'Type a name and it will be sung in your song.', nameHintFilled: 'This name will be sung in your song. Clear it if you don\'t want to hear it.', phTransitDate: 'DD.MM.YYYY', phTransitTime: 'HH:MM', phTransitLocation: 'Moscow, London, New York...', phRequest: 'For example: about the courage to start over', phPreferredStyle: 'Genre or music mood',
          phProfileName: 'Your name', phDateDisplay: 'dd month yyyy', phProfileCity: 'City of birth', phPromoInput: 'Enter promo code',
          heroesAddBtn: '+ Add person', heroesCountWord: 'people', heroNamePh: 'Person\'s name', heroBirthplacePh: 'Moscow, London, New York...', heroStylePh: 'pop, jazz, electronic…', heroNotesPh: 'What to remember about this person',
          heroEditTitle: 'Edit person', heroAddTitle: 'Add person', confirmUnsavedExit: 'You have unsaved changes. Exit?',
          heroSaveFail: 'Failed to save. Try again.', heroDeleteFail: 'Failed to delete. Try again.',
          heroIncomplete: "This person's birth date or place is missing. Open the card and fill them in.",
          errHeroIncomplete: "Selected person is missing data. Add birth date and place in the Lab.",
          errMissingFields: "Please add your birth date — the song needs it.",
          errVkSongsOracleOnly: 'The Oracle works here — ask it about yourself.', errClaimLocked: 'The daily Spark is not available yet.', errClaimAlready: 'You already took today\'s Spark — come back tomorrow.',
          vkFormStubHint: 'Song generation is not available on this platform',
          diarySaved: 'Diary configured!',
          diaryTrialStarted: '3-day trial activated!',
          diaryActivateFail: 'Could not activate. Try again.',
          profileBalanceTitle: 'My balance',
          errGenderRequired: 'Gender cannot be empty. Choose Female or Male.',
          errInvalidGender: 'Invalid gender value. Allowed: Female or Male.',
          today: 'Today',
          scAskOracle: 'Ask the Oracle',
          fillProfileCta: 'Fill profile',
          diaryContinueInChat: 'Continue in chat',
          heroGenHistory: 'Generation history', heroLyricsLabel: 'Lyrics', heroAnalysisBtn: 'Analysis', heroLetterBtn: 'Cover letter', heroListenBtn: 'Listen',
          noInternet: 'No internet',
          partnerTitle: 'Partner Dashboard', partnerStatusActive: 'Active', partnerBalUnit: 'Sparks · unspent', partnerStatsTitle: 'Statistics', partnerPromoTapCopy: 'Copy text', partnerPromoTapDone: 'Copied', partnerDashFootNote: 'Weekly payouts', partnerApplyNamePh: 'Your name', partnerApplySocialsPh: '@username, channel links', partnerApplyPlanPh: 'How do you plan to attract users',
          partnerApplySubmit: 'Submit application', partnerApplySent: 'Application sent! We will review and notify you.',
          partnerApplyPending: 'Application under review', partnerApplyPendingDesc: 'We will review your application and notify you via Telegram.',
          partnerApplyRejected: 'Application not approved', partnerApplyNameReq: 'Enter your name', partnerApplySocialsReq: 'Enter your social media',
          partnerDashWalletPh: 'Payout details', partnerDashWalletReq: 'Enter payout details',
          partnerDashNoAccruals: 'No accruals yet', partnerDashPayoutProcessing: 'Payout request is being processed',
          partnerDashPayoutSubmit: 'Request payout', partnerDashPayoutSent: 'Payout request sent!',
          partnerDashCodeSaved: 'Code saved!', partnerDashCodeMinLen: 'Minimum 3 characters',
          partnerDashOpenTg: 'Open the app via Telegram',
          partnerDashSendError: 'Submission error', partnerDashRetryLater: 'Try again later',
          partnerApplyPageTitle: 'Partner Program', partnerHowItWorks: 'How it works',
          partnerStepApply: 'Submit an application', partnerStepApproval: 'Approval', partnerStepShare: 'Share your link', partnerStepBonus: 'Earn bonuses',
          partnerEarnHeadingHtml: 'Earn with <span style="display:inline-block;background:linear-gradient(120deg,#f472b6 0%,#ec4899 22%,#a78bfa 45%,#f97316 70%,#fbbf24 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 12px rgba(236,72,153,0.35));animation:accentGradientShift 6s ease-in-out infinite;">YupSoul</span>',
          partnerEarnDescHtml: 'Invite friends and get a <strong style="color:var(--primary-color);">20% bonus in Sparks</strong> from each package your referrals buy. Payouts on request once a week.',
          partnerSparksPerMonth: 'Sparks / mo', partnerTierSoul: 'Soul', partnerTierDepth: 'Depth', partnerTierLab: 'Lab',
          partnerBonusNoteHtml: 'Bonuses are credited in Sparks<br>Payouts on request once a week',
          partnerHeroTitleHtml: 'Earn together with <span class="pa-grad">YupSoul</span>',
          partnerHeroSub: 'Invite friends and get a share of every package they buy — in Sparks.',
          partnerStatCapHtml: '<b>in Sparks</b> from every package of your referrals — on each purchase',
          partnerStep1Title: 'Apply', partnerStep1Sub: 'Tell us about yourself and your channels',
          partnerStep2Title: 'Get approved', partnerStep2Sub: 'We review and open access',
          partnerStep3Title: 'Share your link', partnerStep3Sub: 'Invite friends to YupSoul',
          partnerStep4Title: 'Earn bonuses', partnerStep4Sub: 'Sparks drip from every package',
          partnerTiersTitle: 'How much you get per package', partnerTiersNote: 'Bonus is credited from every package your referral buys',
          partnerPayoutTitle: 'How to get paid',
          partnerPfSparks: 'Sparks', partnerPfSparksSub: 'accumulate', partnerPfPayout: 'Payout', partnerPfPayoutSub: 'once a week',
          partnerPayoutFreq: 'once a week', partnerPayoutFreqSub: 'payouts', partnerPayoutMin: 'from 100,000', partnerPayoutMinSub: 'Sparks to withdraw',
          partnerApplyFormHeading: 'Partner application', partnerApplyFormSub: 'Tell us about yourself — we’ll open access to the program.',
          partnerApplyBtn: 'Apply',
          partnerNameLabelHtml: 'Your name <span style="color:var(--primary-color);">*</span>',
          partnerSocialsLabelHtml: 'Social media / channels <span style="color:var(--primary-color);">*</span>',
          partnerPlanLabel: 'Your promotion plan',
          partnerAgreeTextHtml: 'I have read the <a href="#" onclick="document.getElementById(\'partnerAgreementBlock\').style.display=document.getElementById(\'partnerAgreementBlock\').style.display===\'none\'?\'block\':\'none\';return false;" style="color:var(--primary-color);text-decoration:underline;">partner program terms</a> and accept them',
          partnerFaqTitle: 'FAQ',

          partnerFaq2Q: 'When are payouts made?', partnerFaq2A: 'Withdrawal requests are collected during the week and processed in a single batch once a week.',
          partnerFaq3Q: 'What is the minimum for withdrawal?', partnerFaq3A: 'Minimum is 100,000 Sparks. Submit a payout request in the partner dashboard.',
          partnerFaq4Q: 'How is the bonus calculated?', partnerFaq4A: '20% bonus in Sparks is credited from each referral package. Soul — 1,980, Depth — 4,980, Lab — 7,980 Sparks.',
          partnerLegalTitle: 'Partner Program Terms',
          partnerLegalBodyHtml: '<p style="font-weight:700;margin-bottom:6px;">1. General Provisions</p><p>1.1. This Agreement governs participation in the Partner Program of the YupSoul service (hereinafter — the Platform).</p><p>1.2. A Partner is a user whose application has been approved by the Platform administration.</p><p>1.3. By submitting an application, you confirm that you have read and agree to the terms of this Agreement.</p><p style="font-weight:700;margin:12px 0 6px;">2. Participation Conditions</p><p>2.1. To participate, you must submit an application through the form in the app.</p><p>2.2. The administration reserves the right to approve or reject an application without explanation.</p><p>2.3. Partner status may be revoked at any time if the terms of the Agreement are violated.</p><p style="font-weight:700;margin:12px 0 6px;">3. Bonus Program</p><p>3.1. The Partner receives a 20% bonus in Sparks from each subscription made through their referral link.</p><p>3.2. Bonuses are credited in Sparks (the Platform\'s internal currency) at each referral subscription renewal.</p><p>3.3. Bonus amounts by plan: Soul — 1,980 Sparks/mo, Depth — 4,980 Sparks/mo, Lab — 7,980 Sparks/mo.</p><p>3.4. The Platform reserves the right to change bonus amounts with prior notice to partners.</p><p style="font-weight:700;margin:12px 0 6px;">4. Payouts</p><p>4.1. Minimum withdrawal amount is 100,000 Sparks.</p><p>4.2. A payout request is submitted in the partner dashboard; payment is made using the details agreed with the partner.</p><p>4.3. Withdrawal requests are collected during the week and processed in a single batch once a week.</p><p>4.4. The Platform may reject a withdrawal request if fraud is suspected.</p><p style="font-weight:700;margin:12px 0 6px;">5. Partner Obligations</p><p>5.1. The Partner agrees to promote the Platform in good faith, without misleading information.</p><p>5.2. Prohibited: spam mailings, fake registrations, creating fictitious accounts, using defamatory content.</p><p>5.3. The Partner is independently responsible for paying taxes on income received in accordance with their country\'s laws.</p><p style="font-weight:700;margin:12px 0 6px;">6. Liability</p><p>6.1. The Platform does not guarantee a specific income for the partner.</p><p>6.2. If fraudulent actions are detected, partner status is revoked and accumulated funds may be frozen.</p><p>6.3. The Platform is not liable for the partner\'s actions towards third parties.</p><p style="font-weight:700;margin:12px 0 6px;">7. Changes to Terms</p><p>7.1. The Platform may change the terms of this Agreement by notifying partners via Telegram.</p><p>7.2. Continued participation in the program after notification means acceptance of the new terms.</p><p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.7rem;">Published: March 22, 2026</p>',
          partnerDashHeaderHtml: 'Partner <span style="background:linear-gradient(135deg,var(--primary-color),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">YupSoul</span>',
          partnerDashBonusLine: 'Bonus: 20% in Sparks',
          partnerLinksLabel: 'Your referral links', partnerCopy: 'Copy', partnerShareMsg: 'Create a personal song from your birth date. YupSoul — music that sounds like you', partnerLinksLoading: 'Links are still loading', partnerShare: 'Share',
          partnerLinkLanding: 'Landing', partnerLinkPartnerPage: 'Partner page',
          partnerCodeLabel: 'Personal code', partnerCodeExample: 'Example: ANNA_MUSIC — your link becomes ...?start=ref_ANNA_MUSIC',
          partnerPromoTitle: 'Ready-made promo texts',
          partnerPromoText1: 'YupSoul — personalized music based on your date of birth. Unique tracks that sound just for you. Try it — 100 Sparks as a welcome gift!',
          partnerPromoText2: 'Gift a unique song to someone special! YupSoul creates personal tracks based on date of birth — a perfect gift that cannot be repeated.',
          partnerPromoCopyHint: 'Tap text to copy',
          partnerQrTitle: 'Your link QR code', partnerSaveQr: 'Save QR', partnerQrHint: 'Use for offline promotion',
          partnerStatInvited: 'Invited', partnerStatPaid: 'Purchased', partnerConversion: 'Conversion',
          partnerMinPayoutLabel: 'Minimum for withdrawal', partnerMinPayoutValue: '100,000 Sparks',
          partnerWalletLabel: 'Payout details',
          partnerEarningsTitle: 'Earnings history', partnerPayoutsTitle: 'Payout history',
          paymentConfirmed: 'Payment confirmed!', songCanClose: 'You can close the app — nothing will be lost.',
          successWhileWaiting: 'While you wait', successNewSong: 'New song',
          songNotArrived: 'Didn\'t arrive in 20 min? Text the bot "song not arrived".', goToBot: 'Go to bot',
          songCreating: 'Your song is being generated.', songUsually: 'Usually 10-15 minutes.',
          ptTariffActivated: 'Plan activated!', ptWelcomeTo: 'Welcome to', ptTracksAndChat: 'Tracks and Soul Chat available.', ptGoHome: 'Home',
          ptScOpened: 'Soul Chat opened!', ptScAccess: '24 hours of access', ptScConfirmed: 'Payment confirmed. You can start chatting.', ptGoSc: 'To Soul Chat',
          ptSongInQueue: 'Song in queue', ptSongCreating: 'Your song is being created. The result will arrive in the bot.',
          payOvCardBtn: 'Pay by card', payOvRubHint: 'when paying by card', payOvOrIskry: 'or {amount} Sparks',
          toastCardLinked: 'Card linked', toastCardLinkFail: 'Failed to link card. Try again.',
          toastConnFail: 'Failed to connect. Check your connection.',
          toastCardUnlinked: 'Card unlinked.', toastCardUnlinkFail: 'Failed to unlink card. Try again.',
          toastSubActivated: 'Package activated!', toastScOpened: 'Soul Chat opened for 24 hours',
          toastPayFail: 'Failed to create payment', toastConnError: 'Connection error',
          toastActivateFail: 'Failed to activate. Try again.', toastMasterTrialUsed: 'Trial day already used', toastAuthLost: 'Please re-open the app to continue.', toastNoChanges: 'No changes',
          toastConnRetry: 'Failed to connect. Check connection and try again.',
          toastScExpired: 'Access time expired — open Soul Chat again',
          toastIskryCharged: '{amount} Sparks charged',
          toastReferralCreditUsed: 'Referral credit used',
          toastEntitlementUsed: 'Purchased track used',
          toastTrialUsed: 'Gift track activated',
          toastSubscriptionUsed: 'Counted in package',
          toastPromoUsed: 'Promo code applied',
          toastOpenInTg: 'Open the app from the bot in Telegram.',
          toastPayOpenTg: 'Payment is unavailable on this platform',
          vkSupportLinkCopied: 'Link to YupSoul community copied: {url}',
          vkSupportLink: 'Our YupSoul community: {url}',
          vkTabletTitle: 'Open on phone or desktop',
          vkTabletText: 'YupSoul is optimized for phones and desktop. The interface may not work correctly on a tablet — please open YupSoul from your phone or on vk.com in a browser.',
          vkTabletCommunity: 'Our YupSoul community',
          okSupportLinkCopied: 'Link to YupSoul group copied: {url}',
          okSupportLink: 'Our YupSoul group on Odnoklassniki: {url}',
          toastSubsOnDesktop: 'Payment is unavailable on this platform',
          toastUpdateTg: 'To pay, update Telegram to version 6.1 or higher.',
          toastPromoApplied: 'Promo code applied! Analysis available',
          toastFirstSubmit: 'First submit a song request', toastShareForward: 'A Telegram forwarding window will open',
          toastLinkCopiedFriend: 'Link copied — send it to a friend!',
          toastWelcomeIskry: 'You received {amount} Sparks — welcome!',
          toastUpdateTgStars: 'For Stars payment, update Telegram to version 6.9 or higher.',
          toastInvoiceFail: 'Failed to create invoice. Try again.',
          toastFillForm: 'First fill out the request form.', toastIskryPaid: 'Sparks charged — song in progress!', toastSubPaid: 'Analysis paid!',
          mtAuthExpired: 'Session expired. Refresh the page or sign in again.', mtLoadError: 'Failed to load list. Check your internet.', mtPlayRetry: 'Playback failed. Try again in a minute.',
          mtCreatingSong: 'Creating your song...', mtUsuallyTime: 'Usually 10-15 minutes. Will appear in "My tracks".',
          mtGenDelayed: 'Generation delayed. Check "My tracks" later.',
          mtAnalyzing: 'Analyzing chart…', mtWritingLyrics: 'Writing lyrics…', mtShapingSound: 'Shaping the sound…', mtRecording: 'Recording music…',
          mtGenFailed: 'Failed to create song', mtGenFailedDesc: 'An error occurred during generation. Try creating a new request or contact support.',
          scGreeting: 'Hi, I\'m your oracle 🤍 Ask me anything: about yourself, your path, your relationships. I\'m here.',
          ctxSelfBtn: 'About me', ctxCompatBtn: 'Compatibility',
          ctxSub: 'Who are we talking about today — the Oracle keeps it in the conversation.',
          scPairPickTitle: 'The two of you', scPairPickSub: 'Pair reading — how you two sound together.',
          ctxModeOne: 'One card', ctxModeCompat: 'Compatibility',
          ctxYou: 'You', ctxYourChart: 'your birth date', ctxMeBadge: 'this is you', ctxAddPerson: 'Add a person', ctxPlankLabel: 'Context set', ctxPlankOne: 'about {name}', ctxPlankPair: 'the pair {a} & {b}', ctxPlankPrism: 'your reading "{title}"',
          ctxHintPickOne: '<b>Pick a card</b> — the Oracle will talk about this person.',
          ctxHintOneSelected: 'The chat will be about one person.',
          ctxHintPickTwo: '<b>Pick two</b> — the Oracle will explore their compatibility.',
          ctxApply: 'Apply', ctxApplyOne: 'Apply · {name}', ctxApplyPair: 'Explore pair · {a} & {b}',
          scCopy: 'Copy', scCopied: 'Copied',
          diaryEntryTitle: 'Daily reading',
          yesterday: 'Yesterday',
          scPrismWord: 'Reading', scPrismBackToList: 'Back to readings', diaryWaitTitle: 'Your reading is on the way', diaryWaitText: 'Arrives at {time} — in one message.', diaryFeedEarlier: 'Earlier', diaryFeedCount: '{n} readings', diaryThemesTitle: 'What to send about', diaryThemesHint: '1–3 topics', diaryStreakLine: '{n} days in a row', diaryPickLine: 'Arrives at {time} · one message a day', diaryHeadTitle: 'Diary', diaryHeadSub: 'A short reading every day — on your chart and on the day itself', diaryStatConversations: 'readings', diaryStatDays: 'days in a row', diaryStatTopics: 'topics',
          scChipLonely: 'I feel lonely', scChipBurnout: 'I am burned out', scChipSelflove: 'How to love myself?',
          scQaLabel: 'Where do we start', scQaKtoyaT: 'Who am I really?', scQaKtoyaS: 'Understand myself deeper', scQaKtoyaQ: 'Who am I really? Help me understand myself deeper.', scQaTrevogaT: 'I feel anxious', scQaTrevogaS: 'Speak it out and breathe', scQaTrevogaQ: 'I feel anxious. I want to speak it out and breathe.', scQaReshenieT: 'Help me decide', scQaReshenieS: 'Find my own answer', scQaReshenieQ: 'Help me make a decision and find my own answer.', scQaPodderzhkaT: 'Stay with me', scQaPodderzhkaS: 'When I need support', scQaPodderzhkaQ: 'Stay with me. I need some support.',
          scOracleFreeLeft: 'Gift questions: {n} of 10', scOracleIskryMode: '1 question = 1 Spark · you have {n}', scOracleNeedIskry: 'Your gift questions are used up. From now 1 question = 1 Spark — claim your daily Spark in Gifts or top up.', scOracleGetIskry: 'Claim a Spark', scOracleFreeWarn: 'You have 3 gift questions left. After that a Spark comes every day — one Spark is one new question.', scWallTitle: 'Your gift questions are used up. From now a question costs one Spark.', scWallTitleClaim: 'Your gift questions are used up. Take the daily Spark — one Spark is one new question.', scWallTitleDone: "Today's Spark is already yours. A new one comes tomorrow.", scWallClaimedMsg: 'The Spark is yours — go ahead and ask.', scWallGoGifts: 'Open Gifts', scPrismNeedIskryVk: "Not enough Sparks yet. You can take today's one in Gifts.", scWallClaimBtn: 'Claim the daily Spark', scWallJoinBtn: 'Join the community', scWallNote: 'The community posts a reading of the day every morning. We add 30 Sparks for joining.', scWallClaimDone: 'The Spark is yours', scWallPrismText: 'One big reading about you is already open — "Soul Name". Have a read.', scWallNoteLow: 'Sparks add up in Gifts — drop by every day.',
          scPlaceholder: 'What is on your mind?', scHistoryEmpty: 'Your recent requests will appear here', scHistoryToggle: 'History',
          bannerPendingSub: 'Pending package', bannerPendingSubDesc: 'Payment not yet confirmed. Continue plan setup.',
          bannerPendingIskry: 'Your request is waiting!', bannerPendingIskryDesc: 'Use Sparks — create your song.',
          bannerPendingOrder: 'Pending order', bannerPendingOrderDesc: 'You have a request awaiting payment.',
          valNameMin: 'Name must be at least 2 characters', valBirthdate: 'Select date of birth',
          valBirthplace: 'Birthplace must be at least 3 characters',
          valBirthtime: 'Enter time of birth or check "Don\'t know"', valGender: 'Select gender',
          appUpdating: 'The app needs a refresh', payOvDefault: 'Payment', payOvPaymentReq: 'Request payment',
          linkedOpenBrowser: 'Open the link in a browser and link Google there.',
          linkedConnFail: 'Sign in with Google and refresh the page',
          scQuickBuyDay: '24-hour access — 2.99 $',
          iskryPaySuccess: 'Sparks charged — song in progress!', iskryPayingProgress: 'Charging Sparks...', iskryPayingStatus: 'Charging Sparks and starting generation...',
          paymentRequiredHint: 'Payment is required to create a song.',
          processing: 'Processing...',
          payCopyFail: 'Failed to copy',
          paymentPageIntroOrPay: 'Enter a promo code or choose a payment method below.',
          trackLimitResubmitHint: 'Fill the form and submit — payment screen will open.',
          paymentThanksOk: 'Done!',
          apiNotConfigured: 'API address not configured. Open the app via server link.',
          // --- i18n batch: payment, buttons, forms, loading, plans ---
          btnGoHome: 'Home', btnClose: 'Close', btnDone: 'Done', btnSave: 'Save',
          btnApply: 'Apply', btnShare: 'Share', btnCopied: 'Copied!', btnBack: '← Back',
          btnMore: 'More', btnFind: 'Find', btnRefresh: 'Refresh', btnTry: 'Try',
          btnActivateFree: 'Activate for free', btnActivating: 'Activating...',
          btnConfirmAndSend: 'Confirm and send', btnConfirming: 'Confirming...',
          btnCreateSong: 'Create my song', btnCreateMore: 'Create another track',
          btnTrySoulChat: 'Try Soul Chat', btnInviteFriend: 'Invite a friend',
          btnGoToPayment: 'Proceed to payment', btnContinueSub: 'Continue package payment',
          btnReceiveInTg: 'Receive songs in Telegram', btnPickFromLab: 'Pick from Laboratory',
          btnGet24hFree: 'Get 24 hours free', btnBindCard: 'Link card',
          btnUnbindCard: 'Unlink card', btnChoosePlan: 'Choose a plan', btnSettings: '⚙ Settings',
          payCheckingPayment: 'Checking payment…', payWaitingBank: 'Waiting for bank confirmation. Usually a few seconds.',
          payWaitingConfirm: 'Waiting for confirmation…', payNoData: 'No data to check. Status will update in your profile.',
          payReceived: 'Payment received. Checking access activation…',
          payReturnHome: 'You can return home — status will update.',
          payBankNotConfirmed: 'Bank hasn\'t confirmed yet. If charged — don\'t worry, it will count.',
          payBankNotConfirmedRetry: 'Bank hasn\'t confirmed the payment yet. Try checking later.',
          payConfirmedPlan: 'Payment confirmed. Plan "{plan}" is active.',
          payAnalysisPaid: 'Analysis paid!', payAnalysisAvailable: 'Now you can get a detailed analysis of your song.',
          payDeepAnalysis: 'Deep analysis', payNotConfirmed: 'Payment not confirmed',
          payContactSupport: 'Didn\'t help? Write to support.', payCheckFailed: 'Failed to check payment status. Try later.', payCheckTakesTimeTitle: 'Checking payment', payCheckTakesTime: 'If the money was charged, we\'ll send you a confirmation in Telegram. You can go back to home.',
          paySoulChatOpened: 'Soul Chat opened!', payConfirmedChat: 'Payment confirmed. You can start chatting.',
          payToSoulChat: 'To Soul Chat', payCreatingLink: 'Creating link…',
          payCreatingInvoice: 'Creating invoice…', payPromoApplied: 'Promo code applied!',
          payPaid: 'Paid!', payOpeningPayment: 'Opening payment…',
          payConnectingBank: 'Connecting to bank…', payByCard: 'Pay by card',
          payLoading: 'Loading…', payAlreadyPaidCheck: 'I already paid — check',
          payChecking: 'Checking...', payPaidByCardCheck: 'I paid by card — check',
          payFormNotOpened: 'If the payment form didn\'t open — copy the link:',
          payCopyLink: 'Copy payment link', payCopied: 'Copied ✓',
          payPlanActivated: 'Plan "{plan}" activated!',
          formEnterName: 'Enter name', formNoAuth: 'Not authorized',
          formSaving: 'Saving…', formDataSaved: 'Data saved ✓',
          formSaveError: 'Save error', formEnterPromo: 'Enter promo code', promoActivated: 'Promo code activated!', promoNotFound: 'Promo code not found', promoExpired: 'Promo code expired', promoUsedUp: 'Promo code no longer valid', promoAlreadyActivated: 'Promo code already activated', promoDiscountWord: 'Discount',
          formPromoError: 'Check failed. Try later.', formSecondPerson: 'Second person',
          selectDay: 'Day', selectMonth: 'Month', selectYear: 'Year',
          labelName: 'Name', labelBirthdate: 'Date of birth', labelBirthplace: 'Place of birth',
          labelBirthtime: 'Time of birth', labelDontKnow: 'Don\'t know', labelGender: 'Gender',
          labelCity: 'City', labelPlan: 'Plan',
          genderMale: 'Male', genderFemale: 'Female', genderSelect: 'Select',
          formStep1: 'Step 1', formStep2: 'Step 2', formStep3: 'Step 3',
          formYourData: 'Your data', formDataNeeded: 'Needed for personalized song lyrics',
          formCityHint: 'Start typing a city and pick from the dropdown.',
          formTimeUnknown: 'Time unknown', formSongLang: 'Song language', formLangTooltip: 'Language of the song lyrics and analysis',
          formAnalysisLang: 'Analysis language', formLangTooltipNoLyrics: 'Language of your analysis and letter',
          lyricsHeading: 'Voice of the song', lyricsSubtitle: 'Will it have words?',
          lyricsSung: 'With lyrics', lyricsSungDesc: 'We\'ll sing your song',
          lyricsInstrumental: 'Music only', lyricsInstrumentalDesc: 'A melody from your date',
          lyricsOwn: 'Your own text', lyricsOwnDesc: 'We\'ll sing what you write',
          phCustomLyrics: 'Write your lines — we\'ll sing them',
          customLyricsHint: 'Write it how you feel it, we\'ll shape the verses and chorus. A three-minute song takes about 45 lines. Songs like this stay with you only — they don\'t go on air.', charsShort: 'chars', customLyricsShortWarn: 'a 3-minute song needs about 1400 — this will come out shorter', customLyricsEnough: 'enough for a full song',
          alertCustomLyrics: 'Write the lyrics — a couple of lines at least',
          errCustomLyricsShort: 'Write the lyrics — a couple of lines at least',
          errCustomLyricsProfanity: 'There are words here we can\'t sing',
          errRadioOwnLyrics: 'Songs on your own text stay with you — we don\'t put them on air',
          birthDateTooltip: 'Pick birth date', birthTimeTooltip: 'Pick birth time',
          formMePlusHuman: 'Me + Person', formCardPlusCard: 'Card + Card',
          formPickFromLabHint: 'Pick a person from the Laboratory — fields will auto-fill',
          formTransitMode: 'Energy of the day', formTransitDate: 'Event date',
          formTransitTime: 'Event time', formTransitCity: 'City for the moment\'s energy',
          formRequestLabel: 'What will you explore today?', formQuickPicks: '✦ Quick picks',
          formForWho: 'Who is this for?', formForSelf: 'For myself',
          styleManual: 'Enter manually', styleAstro: 'Planet sound', styleStar: 'Artist style',
          styleStarHint: 'Enter artist name, song title, or movie soundtrack...',
          styleQuickLabel: '✦ Music styles',
          stylePresetPop: 'Pop', stylePresetRock: 'Rock', stylePresetRap: 'Rap / hip-hop',
          stylePresetElectronic: 'Electronic / techno / house',
          stylePresetAmbient: 'Ambient / meditative', stylePresetAcoustic: 'Acoustic / piano / ballad',
          langRussian: 'Russian', langUkrainian: 'Ukrainian',
          oracleThinking: 'Oracle is thinking', oracleGenerating: 'Generating analysis, wait ~30 seconds',
          oracleExample: 'SAMPLE ANALYSIS', oracleGenerateFail: 'Failed to generate. Fill in your birthdate in the profile.',
          oracleConnError: 'Connection error. Try later.', oracleViewAnother: 'View another example',
          oracleConfiguring: 'Setting up...', oracleStart3Days: 'Start — 3 days free', oracleOnboardingRetry: 'Didn\'t work. Please try again.',
          oracleLoadFail: 'Failed to load.', oracleDiaryReply: 'reply',
          toastNetworkError: 'Network error — try again', toastSaved: 'Saved', toastError: 'Error',
          toastAnalysisAvailable: 'Analysis already available — write to the bot',
          toastOrderFail: 'Failed to create order. Try later.',
          statusNoRequests: 'No available requests', loading: 'Loading...',
          noSavedPeople: 'No saved people.', noEarningsYet: 'No earnings yet',
          subConnecting: 'Connecting…', subTrialPeriod: 'Trial period',
          subTrial1Day: '1 day free — try it',
          scAccessRemaining: 'Access: {h}h {m}min left', scOpenFor30: 'Open for 30 Sparks',
          scSelectCard: 'Select a card...', scContextSelf: 'About you', scHistoryDivider: '✦ chat history ✦',
          scDemoMode: 'DEMO MODE',
          successTitle: 'Request accepted!', successDesc: 'Your song is being generated.',
          successBotHint: 'Press Start in the bot — future songs will arrive right in Telegram',
          successWhileWaiting: 'While you wait', successMoreSong: 'One more song',
          footerOffer: 'Terms', footerPrivacy: 'Privacy', footerSubManage: 'Manage packages',
          navOracle: 'Oracle', navPlaylist: 'Playlist', navContacts: 'Contacts', navHelp: 'Help',
          heroesTitle: 'Laboratory', heroFormTitle: 'Add a hero',
          mtTitle: 'my playlist', mtEmpty: 'No tracks yet',
          mtEmptyDesc: 'Create your first one — from your birth date',
          mtLoadMore: 'Load more',
          mtAudioRefreshFail: 'Couldn\'t load the track. Try again later.',
          mtPendingTitle: 'Creating your song…', mtPendingStuckTitle: 'Failed to create song', mtPendingStuckSub: 'Contact support — we will refund Sparks', mtAnalysisPending: 'Transcript is still being prepared. Check back in a few minutes.', mtShuffleNeedTracks: 'You need at least 2 songs to shuffle',
          mtPendingSub: 'Ready in 5–15 minutes',
          diarySetupTitle: 'Set up your Diary',
          diaryTopicCareerLabel: 'Career', diaryTopicCareerDesc: 'Decisions and finances',
          diaryTopicRelationshipsLabel: 'Relationships', diaryTopicRelationshipsDesc: 'Dynamics with loved ones',
          diaryTopicHealthLabel: 'Health', diaryTopicHealthDesc: 'Energy and body',
          diaryTopicGrowthLabel: 'Growth', diaryTopicGrowthDesc: 'Habits and development',
          diaryTopicCreativityLabel: 'Creativity', diaryTopicCreativityDesc: 'Inspiration',
          diaryTopicTransformationLabel: 'Changes', diaryTopicTransformationDesc: 'Transformation',
          diaryTopicPurposeLabel: 'Path', diaryTopicPurposeDesc: 'Meaning and mission',
          diaryTopicPeaceLabel: 'Peace', diaryTopicPeaceDesc: 'Balance and support', diarySetupEyebrow: 'Oracle Diary', diaryPickedTpl: 'Selected {n} of 3', diaryPickAtLeastOne: 'Pick at least one topic', diaryEnableBtn: 'Enable Diary', diaryFootNote: 'The analysis arrives in the morning — change topics anytime',
          shareSheetTitle: 'Share your song', shareEyebrow: 'My soul song', shareFootCreate: 'Create your song', shareFmtStory: 'Stories', shareFmtPost: 'Post', shareFmtLink: 'Link', shareCopyBtn: 'Copy', shareSaveImg: 'Save image', shareTgtLink: 'Link', shareTgtStory: 'Stories', shareTgtMore: 'More',
          vkDoorTitle: 'A door to a world of new emotions — open it with the Musical Oracle', vkDoorBody: 'A Spark is a question to the Oracle: about your day, your relationships, whatever will not let you go. I will remind you to collect it each morning and write when your song is born. Switch it off in your profile.', vkDoorYes: 'Open the door', vkDoorNo: 'Later', consentBonus: '+5 Sparks for notifications', consentTitle: 'Stay in touch', consentTextVk: 'A Spark is a question to the Oracle: about your day, your relationships, whatever will not let you go. I will remind you to collect it each morning: +2 a day, +10 for a full week. One message a day, switch it off in your profile.', consentTextTg: 'Turn on notifications — the Spark of the day each morning and a note when your song is ready. Only what matters, no spam.', consentTextWeb: 'Notifications come in Telegram. Open the bot — I will message you when your song is ready and gift the Spark of the day.', consentBtnVk: 'Allow notifications', consentBtnTg: 'Turn on notifications', consentBtnWeb: 'Open in Telegram', consentLater: 'Later', consentLegalHtml: 'By agreeing, you accept the <u>newsletter terms</u>. You can unsubscribe anytime.', consentTermsBody: 'We only write when it matters: a note when your song is ready, a daily Spark each morning, and rare service news. E-mail no more than once a week. Unsubscribe anytime — a button in your profile or a link in the e-mail. We never share your contacts or use them to advertise other companies.',
          oracleOptinTitle: 'A morning word from me?', oracleOptinDesc: 'While your song is being born, I can send you a short reading each morning: what is in focus today, where to save your energy, where your moment is.', oracleOptinYes: 'Yes, send it', oracleOptinNo: 'Not now', oracleOptinNote: '3 days as a gift. You can turn it off anytime.', oracleOptinDone: 'Done — I will look in tomorrow.',
          diarySetupDesc: 'Pick 1-3 topics. Every morning — a personalized daily analysis.',
          diaryDeliveryTime: 'Delivery time', diaryReceiveDaily: 'Receive daily analyses',
          diaryTopics: 'Topics', diaryTrialEnded: 'Trial period ended',
          diaryTrialEndedDesc: 'Subscribe to Depth or Laboratory for daily analyses.',
          diaryFirstArrival: 'Your first analysis will arrive at the chosen time.',
          oracleTabChat: 'Chat', oracleTabDiary: 'Diary',
          settingsTitle: 'Settings',
          scHeroTitle: 'Heart-to-heart | Soul Chat',
          scPromoText: 'Soul Chat — your AI assistant that understands you deeply.',
          scGoToChat: 'Go to chat →', scMoreDetails: 'More details ↓',
          scStat1: 'report reduced anxiety', scStat2: 'feel understood',
          scStat3: 'find answers faster', scStat4: 'come back again',
          scExTitle: 'Example questions',
          scEx1: '"Why is it so hard for me to talk about my feelings?"',
          scEx2: '"What is my biggest fear and how to deal with it?"',
          scEx3: '"What is my purpose and how to reach it?"',
          scGiftHeading: 'Try Soul Chat — 24 hours', scGiftNote: 'Once per user',
          scSubIncluded: 'Soul Chat included in package',
          scChoosePlan: 'Choose a plan →', scOpenFor24h: 'Open Soul Chat for 24h',
          scPayByCard: 'Card (T-Bank) — 199 ₽',
          scPickerTitle: 'Chat context', scPickerSingle: 'Single card',
          scPickerSynastry: 'Compatibility (2 cards)',
          scPickerCardA: 'Card A', scPickerCardB: 'Card B',
          scNoRequestTitle: 'We need your data',
          scNoRequestText: 'Soul Chat builds a personalized conversation based on your data.',
          scSynastryTeaser: 'Compatibility — a dialogue based on two birthdates.',
          scOpenPlan: 'Open plan →', scSelectLabel: 'Select...',
          scPromoError: 'Get a package or buy 24-hour access',
          profilePromo: 'I have a promo code',
          profilePromoTitle: 'I got a promo code',
          profilePromoSub: 'Activate it — get bonus Sparks',
          profilePromoSectionTitle: 'Promo code',
          profileLoadError: 'Failed to load profile',
          profileInvited: 'Invited', profileActivated: 'Activated', profileIskry: 'Sparks',
          profileEarningsLabel: 'Your Sparks:', profileEarningsHint: 'Sparks can be spent on songs and features',
          profileListenDownload: 'Listen and download tracks', profileCreateSongBtn: 'Create your song',
          profileNoCard: 'No card linked. Link a card for full management.',
          relSelect: '— select —', relMother: 'Mother', relFather: 'Father', relDaughter: 'Daughter', relSon: 'Son',
          relSister: 'Sister', relBrother: 'Brother', relGrandmother: 'Grandmother', relGrandfather: 'Grandfather',
          relHusband: 'Husband', relWife: 'Wife', relPartner: 'Partner',
          relFriend: 'Friend', relGirlfriend: 'Girlfriend', relColleague: 'Colleague',
          relMentor: 'Mentor', relOther: 'Other',
          heroDateHint: 'Select day, month, and year',
          optional: 'optional', heroIntro: 'From the <b>birth date</b> the oracle composes a personal song and readings for them.', heroRelPartner: 'partner', heroRelDaughter: 'daughter', heroRelSon: 'son', heroRelMom: 'mom', heroRelDad: 'dad', heroRelFriendM: 'friend', heroRelFriendF: 'friend', heroRelMentor: 'mentor', heroRelOther: 'other', heroPlaceHint: 'Start typing a city and pick from the list.', heroNoTime: 'I don\'t know the exact time', heroSexSkip: 'Prefer not to say',
          wguLabel: 'While your song is being created', wguTitle: 'Discover what your birthdate says about you',
          wguPrice: 'Deep analysis — 40 Sparks', wguBtn: 'Get analysis', daDeepDesc: 'Deep transcript — an in-depth analysis taking into account your place and time of birth: your essence, strengths and growth areas, key life themes and periods, and the meaning embedded in your song. In words, personal to you.',
          payThanksTitle: 'Payment received', payThanksSubtitle: 'request accepted',
          payThanksDesc: 'Your song is already being generated. Usually 10–15 minutes.',
          payThanksAfsTitle: 'Your Spark is lit', payThanksAfsSubtitle: 'Ready to go deeper?',
          payThanksHint: 'Didn\'t arrive in 20 minutes? Write to the bot "song didn\'t arrive"',
          statusRequestAccepted: 'Request accepted', statusSongCreating: 'Song is being created. It will arrive in the bot chat. You can close the window.',
          qrSaved: 'QR saved ✓',
          heroesPromoHeading: 'Personal workspace for practitioners',
          heroesPromoDesc: 'Add people once — and generate songs for them in one tap.',
          heroesPromoFeatures: 'What\'s included:', scBuyDayNote: 'Not ready for a package? Try single access',
          homeTeaserHtml: 'Your <span class="tagline-glow">birthdate</span> holds a hidden gift, unlock it through a <span class="tagline-glow">song</span>',
          payOvSubtitle: 'Your personal song', payOvCardTitleSingle: 'Personal song',
          payOvCardTitleCouple: 'Song for two', payOvCardTitleTransit: 'Energy of the day',
          payOvCardTitleAnalysis: 'Text analysis', payOvCardTitleSc: 'Heart-to-heart — 24 hours',
          payOvSubtitleSingle: 'Your personal song', payOvSubtitleCouple: 'A song for both of you',
          payOvSubtitleTransit: 'Energy of your day', payOvSubtitleAnalysis: 'Deep analysis',
          payOvSubtitleSc: 'Soul Chat for 24 hours', payOvSubtitleDefault: 'Your song',
          payOvPromoApplied: 'Promo code applied', payOvFreeGen: '— generation as a gift',
          payOvIskryHint: 'or {amount} Sparks', payOvPriceHint: 'when paying by card',
          payOvUpsellLabel: 'Better as a pack', payOvUpsellBtn: 'Get the pack',
          payOvUpsellPackTitle: 'Soul pack — 5 songs', payOvUpsellFeat1: '5 songs instead of one', payOvUpsellFeat2: 'Oracle Chat included', payPackPerSong: '/song', payPackPerVote: ' votes/song',
          payOvOfferText: 'By paying, you agree to the', payOvOfferLink: 'terms of service',
          payOvPromoConfirmBtn: 'Confirm and send',
          confirmTitle: 'Request accepted!',
          confirmDesc1: 'Analyzing your data and creating a unique song.',
          confirmDesc2Bot: 'The song will arrive in this chat. You can close the app — nothing will be lost.',
          confirmDesc2Web: 'The song will appear in "My tracks". You can close the app — nothing will be lost.',
          confirmContinueBtn: 'Continue →',
          planConfirmPay: 'Pay', planConfirmCancel: 'Cancel',
          profileLogout: 'Log out', profileOfferLink: 'Terms of service',
          monthJan: 'January', monthFeb: 'February', monthMar: 'March', monthApr: 'April',
          monthMay: 'May', monthJun: 'June', monthJul: 'July', monthAug: 'August',
          monthSep: 'September', monthOct: 'October', monthNov: 'November', monthDec: 'December',
          createSong: 'Create a song',
          csWhileWaiting: 'While you wait', csMyTracks: 'My tracks', csInvite: 'Invite', csNewSong: 'One more song',
          genStage1: 'Reading your birth date', genStage2: 'Exploring how your stars sound', genStage3: 'Finding the right words', genStage3NoLyrics: 'Searching for your sound', genStage4: 'Composing the music',
          mtUpsellTitle: 'This is just the beginning', mtUpsellText: 'Loved how your soul sounds? Gift a song to someone dear — your mom, your love, a friend.', mtUpsellCreate: 'Create another', mtUpsellSub: 'More songs — you can buy a package',
          iskraClaimTitle: 'Daily spark', iskraClaimTextCan: 'Drop by each day and grab a Spark 🤍 With it you can ask the Oracle anything about yourself.', iskraClaimTextDone: 'Today\'s Spark is yours 🤍 Come back tomorrow for a new one.', iskraClaimStreak: 'Streak: {n}', iskraClaimBtn: 'Claim Spark', iskraClaimBtnDone: 'Back tomorrow',
          navGifts: 'Gifts', navMenuGifts: 'Gifts', giftsTitle: 'Gifts', giftsSubtitle: 'Drop by daily — grab your Spark', giftsExplainer: 'Every day a Spark waits for you here — just for dropping by 🤍 One is enough to ask the Oracle about yourself, and a hundred make a whole song about you.', iskraValueTitle: 'What Sparks are for', iskraValueQuestion: 'Ask the Oracle anything about you — that\'s one Spark', iskraValueSong: 'Gather a hundred — and a song of your soul is born', iskraValueCta: 'Ask the Oracle', giftsEmptyHint: 'Create your first song — and the daily Spark unlocks here 🤍', iskraClaimErr: 'The Spark was not credited, your balance is unchanged.', iskraClaimRetry: 'Try again', iskraCookieFrom: 'The Oracle\'s message for today', giftsProgLabel: 'in balance', giftsBalanceTopup: 'Spark balance — top up', giftsFirstRunTitle: 'The daily Spark unlocks after your first song', giftsFirstRunSub: 'Every day — +2 Sparks, and +10 more for 7 days in a row. Sparks go to Oracle questions and to your next song.', giftsFirstRunCta: 'Create your first song', giftsEmptyTitle: 'Your Sparks will appear here', giftsEmptySub: 'Create your first song — and claim a daily Spark every day', giftsBackHome: '← Home',
          giftsSpendCta: 'Ask a question', giftsSpendSub: 'Ask anything about yourself in the chat', giftsRefTitle: 'Invite a friend', giftsRefSub: 'Sparks when a friend subscribes', giftsRefReward: '+Sparks', giftsRefTag: 'Share your link — when a friend gets a subscription, you earn Sparks.', giftsRefStatInvited: 'Invited', giftsRefStatSongs: 'Made a song', giftsRefStatEarned: 'Sparks earned', giftsRefCopy: 'Copy', giftsRefCopied: 'Copied', giftsRefShare: 'Share link', giftsWeekTitle: 'Your streak', giftsWeekStreak: '{n} days in a row', giftsWeekDays: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', giftsProgTitle: 'To the song of your soul', giftsProgSub: 'Gather 100 Sparks — and it is born', giftsProgSubPack: 'Your first Spark pack unlocks a song — after that you pay with what you gather', iskrySongNeedPack: 'Sparks unlock a song after your first Spark pack. For now they go to Oracle questions and readings.', errSongIskryNeedPack: 'A Spark pack unlocks a song with Sparks — or pay directly.', errGiftIskryNeedPack: 'Gifting a song with Sparks opens after your first Spark pack.', giftsFoot: '✦ Come back tomorrow — your streak grows ✦', giftCardTitle: 'Gift to a loved one', giftCardSub: 'Gift your song — a loved one will hear it', giftCardCta: 'Gift a song', iskraClaimedTitle: 'The Spark is yours ✦', iskraFreshSub: 'A little gift for being with us.', iskraClaimedSub: 'Break the cookie — the Oracle left you a message.', iskraCookieBtn: 'Open the fortune cookie', iskraSaved: 'Saved to the Messages Diary', iskraAskDay: 'Ask the Oracle about this', iskraGoal: '{n} more days in a row → +10 Sparks for a 7-day streak', questsTitle: 'Quests', homeCommT: 'More of what you can do here', homeCommS: 'News and tips — in our community', questJoinT: 'Join our community', questJoinS: 'Come hang out with us', questJoinBtn: '+30', questJoinDone: 'Done', questJoinAlready: 'You are already in the community', questJoinToast: 'Thank you! +30 Sparks', questJoinCheck: 'I joined', questJoinNeedMember: 'Join the community first, then come back', scCommInviteT: 'Energy of the day — every morning in our community', scCommInviteS: 'A short daily tune-in and Oracle news. +30 Sparks for joining.', scCommInviteBtn: 'Join', profileVkCommunity: 'Community: Energy of the day, every morning',
          // gift create/redeem pages (giftPage / giftRedeemPage)
          giftPageTitle: 'Gift a song', gpEyebrow: 'A gift for someone close', gpTitle: 'Gift checkout', gpWhat: 'What you gift', gpItem: 'Soul song', gpInGift: 'as a gift', gpToClose: 'a loved one', gpPayMethod: 'Payment method', gpMStars: 'Telegram Stars', gpMStarsSub: 'Pay with Telegram Stars', gpMCard: 'Card · T-Bank', gpMCardSub: 'Visa / Mastercard / MIR', gpNote: 'After payment you\'ll get a promo code — send it to your loved one, they activate the gift when creating a song.', gpPay: 'Pay', gpSecure: 'Secure payment · promo code arrives instantly', gpDoneTitle: 'Gift ready 🤍', gpDoneText: 'A promo code for a soul song — send it to your loved one, they enter it when creating.', gpDoneShare: 'Send the gift', gpDoneCopy: 'Copy code', gpCodeCopied: 'Code copied ✓', giftsMyTitle: 'My gifts', giftCodePending: 'Awaiting activation', giftCodeUsed: 'Activated', giftCodeFor: 'For: ', giftCodeCopy: 'Copy', giftCodeSend: 'Send', gpShareText: 'I\'m gifting you a soul song 🤍 Promo code: ', giftToPlaceholder: 'For · choose someone', giftToName: 'For · {name}', giftNoSongs: 'No ready songs', giftCreateFirst: 'Create a song', giftNeedSongTitle: 'Create a song first', giftNeedSongSub: 'You\'ll gift it once it\'s ready', giftSoulSong: 'Soul song', giftSongFallback: 'Song', giftDediPlaceholderPreview: 'Your dedication will appear here…', giftSecRecip: 'Who it\'s for', giftSecWords: 'Warm words', giftSecHow: 'How to gift', giftRecipAdd: 'Add', giftDediPlaceholder: 'Write a few lines for the one you\'re gifting…', giftPresetBday: 'Happy birthday', giftPresetJust: 'Just because, for you', giftPresetSpecial: 'You\'re someone special', giftDlvLink: 'Link', giftDlvTg: 'Telegram', giftDlvQr: 'QR code', giftReward: '+5 Sparks when your gift is opened', giftSendBtn: 'Gift the song', giftDoneTitle: 'Gift ready!', giftDoneText: '«{name}» for {to}. Share the link below — you\'ll know when it\'s opened.', giftDoneCopy: 'Copy', giftToLovedOne: 'your loved one', giftDoneClose: 'Done', giftPromptRecipName: 'Who is the gift for? Name:', giftAddNamePh: 'For whom? (e.g. Mom)', giftAddNameOk: 'Done', giftLinkCopied: 'Link copied', giftSelectFirst: 'Choose a song first', giftFailed: 'It didn\'t work', giftSongYours: 'The song is yours 🤍', giftLoginToRedeem: 'Sign in to get your gift', giftPlaying: '🎵 {title} is playing', giftIskryCredited: '+{n} Sparks credited 🤍', giftSongCredited: 'A song as a gift 🤍 Create yours', giftSongUnlocked: 'Your song is unlocked 🤍', giftDeliverShareText: 'You\'ve been gifted a soul song 🤍 Open it: {url}', giftNotFound: 'Gift not found', giftFromLovedOne: 'Someone dear', grFromSealedDefault: 'A gift for you', grFromSealedName: 'A gift from {name}', grTitleSealed: 'You\'ve been gifted<br>a soul song 🤍', grLeadDefault: 'Open the gift to hear your personal song.', grFromOpenDefault: 'Gift', grFromOpenName: 'Gift from {name}', grTitleOpen: 'With love 🤍', grLeadNew: '{name} is gifting you a <b>personal song</b> based on your date of birth. Open the gift to create it.', grLeadExisting: '{name} is gifting you a <b>soul song</b>. Open the gift to hear it.', giftInsidePersonalSong: 'Personal song', giftInsideByBirthdate: 'based on your date of birth', giftInside100: '+100 Sparks as a gift', giftInside100Sub: 'for your future songs', giftInsideFromName: 'from {name}', grNoteNew: 'We\'ll confirm the date of birth on the next step · the gift is already paid', grOpenBtn: 'Open the gift', grGetBtn: 'Get my song', grCreateSong: 'Create your own song', grRedeemedNote: 'The gift is yours 🤍', giftPromoWillApply: 'The promo code applies when you create the song 🤍', gpPayUnavailable: 'Payment is unavailable right now, try later', sharedSongEyebrow: 'A song was shared with you', sharedSongCta: 'Create a song about you', sharedSongLoading: 'Opening the song…', sharedSongFallback: 'Soul song', sharedSaveFav: 'To favorites', sharedCreateOwn: 'Create your own song', sharedLockedLead: 'Listen to a 60-second preview. The author opens the full song.', sharedLockedSub: 'Preview · 60 sec', sharedSavedFav: 'Added to favorites', sharedSavedFavBtn: 'In favorites', favoritesTitle: 'Favorites', favSharedBadge: 'Shared with you', favEmpty: 'Songs you add to favorites will appear here.',
          profileContactsTitle: 'Contacts', profileContactsSub: 'Songs for loved ones — your people', helpReplayTour: 'Watch the tour again',
          afsTitle: 'Your Spark is lit', afsSubtitle: 'Ready to go deeper?',
          afsBtnCreate: 'Create another track', afsBtnSoulChat: 'Try Soul Chat', afsBtnInvite: 'Invite a friend',
          scTabChat: 'Chat', scTabDiary: 'Diary', scTabPrism: 'Readings',
          askezaEntryLabel: 'What you hold', askezaEntryTitle: 'Your 21-day ascesis',
          askezaPickerLabel: 'What to work on first',
          histTitle: 'History', histBack: 'Back to chat', histSearch: 'Search conversations', histSearchPh: 'Find in conversations', histNoRes: 'Nothing found. Try another word — I search your questions.', histEmptyT: 'No conversations yet', histEmptyS: 'Ask the Oracle anything — everything you talked about stays here so you can come back to it.', histContinue: 'Continue conversation', histLastNote: 'Latest — “{title}”, {when}', histToday: 'Today', histWeek: 'This week', histEarlier: 'Earlier', histLive: 'open now', histThreadsN: '{n} conversation|{n} conversations', histQuestionsN: '{n} question|{n} questions', histCountEmpty: 'empty for now', histQuote: '“{q}”', histDeleteAsk: 'Delete this conversation? It can\'t be restored.', scThreadNew: 'New conversation',
          prismPowerDrain: 'Where your force leaks', drainSwitchLabel: 'See another side',
          vkObSlide1Eyebrow: 'Your oracle', vkObSlide1Title: 'The oracle reads your birth date',
          vkObSlide1Sub: 'Ask about yourself — the answer comes from your own chart. First ten questions are a gift.',
          vkObChipFree: '10 questions as a gift',
          vkObSlide4Eyebrow: 'Readings and practice', vkObSlide4Title: 'Readings about you and a 21-day practice',
          vkObSlide4Sub: 'Fifteen readings from your chart. And an ascesis — a practice you do for three weeks, not read once.',
          vkObChipPrisms: 'chart readings', vkObChipAskeza: 'ascesis · 21 days',
          vkConsentDataOracle: 'Data is stored on servers in Russia. For readings, part of the data goes to generation services, including abroad — details in the Policy.', scThreadLegacy: 'Earlier conversations',
          errThreadNotFound: 'Conversation not found.', askezaPickerHint: 'The first one is where it is hardest right now. You can take any, but only one.',
          askezaTitlePrefix: 'Ascesis of', askezaTitleFallback: 'Your ascesis',
          askezaEntryNote: 'Practice instead of reading', askezaEntryProgress: 'Held {done} of {total}',
          askezaBack: 'Back to readings', askezaStatus: "Day {n} of {m}", askezaStatusLeft: "{n} ahead", askezaTodayLabel: "Today · day {n}", askezaMarkBtn: "Mark the day as held", askezaMarkedBtn: "Day marked", askezaStartWith: "Start the ascesis of {planet}", askezaCtaNote: "21 days · one missed day is fine, two in a row — start over", askezaFinalLabel: "21 days behind you", askezaFinalTitle: "Practice complete", askezaFinalStreak: "best streak", askezaFinalMissed: "missed", askezaFinalNext: "Next — the next theme from the list.", askezaFinalCta: "Choose the next one", askezaEyebrow: 'Practice · 21 days', askezaTitle: 'Ascesis of Saturn', askezaWhatIs: 'One rule for 21 days: one action and one limit every day. In the evening you mark the day.', askezaOutcomeLabel: 'What changes', askezaDailyLabel: 'Every day', askezaCoreShort: 'Ascesis', askezaFinalCheck: 'Check what has changed',
          askezaCoreLabel: 'What to hold', askezaWhyLabel: 'Why this one is yours', askezaWhyPending: 'Writing down why this practice is yours…',
          askezaDoLabel: 'Do', askezaBanLabel: 'Never',
          askezaTrackLabel: 'Twenty-one days', askezaTrackHint: 'Mark it in the evening if you held the day',
          askezaStreakLabel: 'in a row from the start', askezaTotalLabel: 'held in total',
          askezaBeatsLabel: 'Where it breaks you', askezaBeatYou: 'for you',
          askezaFailLabel: 'Broken', askezaFailRule: 'Miss one day — carry on. Miss two in a row — start over.',
          askezaStartBtn: 'Start the practice', askezaRestartBtn: 'Start over', askezaStarting: 'Building your practice…',
          askezaDayAria: 'Day {n}', askezaDayShort: 'day {n}',
          errAskezaNeedBirthData: 'Add your date, time and place of birth — the practice needs them.',
          errAskezaNeedBirthTime: 'The practice needs your exact birth time.',
          errAskezaUnknown: 'Unknown practice.', errAskezaBadDay: 'That day is outside the practice.',
          errAskezaNotStarted: 'The practice has not started.',
          scOracleWho: 'Oracle', scIntroTitle: 'Ask about yourself', scIntroSubtitle: 'The Oracle answers from your chart, not in generalities.',
          scPrismTitle: 'Readings', scPrismSubtitle: 'Look deeper — your chart, sung aloud', scChartLabel: 'Your chart', scChartNoDob: 'Add your date of birth', scProgReceived: 'Readings received', scProgOpened: 'Readings opened', scPrismTagNew: 'New', scPrismLockedTitle: 'Available with a package', scPrismLockedMsg: 'This reading is available with the Soul Chat package. The first reading «Soul Name» is a gift.', scPrismTryFreeTitle: 'Try «Soul Name»', scPrismPayDesc: 'A deep personal reading from your chart — detailed about you.', scPrismPayHave: 'you have', scPrismPayBtn: 'Open reading', scPrismPayLoading: 'Preparing your reading…', pwTeaserLock: "Oracle didn't finish…", pwTitle: 'Continue the conversation?', pwSub: 'Sparks are gone — but the Oracle still has things to tell you. Get a pack and continue, no subscriptions or card required.', pwSegQ: 'Questions', pwSegIskry: 'Sparks', pwCtaLabel: 'Continue conversation', pwDay: 'Or', pwDayAccess: 'day access', pwSubscribe: 'Want auto-refill?', pwSubscribeLink: 'Get a package with card', pwSubscribeWhere: '(where available)', pwFoot: "One-time payment. Pack doesn't expire.", pwBadgePopular: 'Best value',
          scPrismLoadingCatalog: 'Loading readings…', scPrismRunning: 'Running your reading…',
          scPrismErrorTitle: 'Something went wrong', scPrismRunFail: 'Couldn\'t run the reading. Try again.',
          scPrismCatalogErr: 'Couldn\'t load readings.', scPrismCopy: 'Copy reading', prismReadEyebrow: 'Personal reading', prismReadIntro: 'The Oracle reads your chart', prismReadAsk: 'Ask about this reading', prismReadSave: 'Save reading', prismBuyDesc: 'A deep personal reading from your chart — in detail about you and how to unlock it.', prismBuyIncl1Html: '<b>Detailed text</b> based on your birth date', prismBuyIncl2Html: 'Saved to chat — you can <b>ask questions</b>', prismBuyYouHave: 'you have', prismBuyAfter: 'left', prismBuyShort: 'short by', prismBuyOpen: 'Open reading', prismBuyTopup: 'Top up Sparks', prismBuyNoteOk: 'The reading opens right in the chat with the Oracle', prismBuyNoteLow: 'Top up Sparks and open the reading',
          scPrismCopied: 'Reading copied', scPrismCopyFail: 'Copy failed',
          scPrismTryFree: 'Try the gift reading', scPrismGoToPlans: 'Choose a package', scPrismFillProfile: 'Fill in profile',
          scEnterChat: 'Enter Soul Chat', scPayByCardBtn: 'Card (T-Bank) — 199 ₽',
          forSelfOption: 'For myself',
          iskrySuffix: 'Sparks',
          successConfirmDesc: 'Your song is being generated.<br>Once ready — it will arrive in the bot.<br><span class="success-desc-note">Usually 10–20 minutes.</span>',
          successConfirmDescWeb: 'Your song is being generated.<br>Once ready — it will appear in "My tracks".<br><span class="success-desc-note">Usually 10–20 minutes.</span>',
          profileEditLabelTime: 'Time', profileEditLabelGender: 'Gender', profileEditDontKnow: 'Don\'t know exact time', profileEditDontKnowHint: 'Reading is based on the date — no exact time needed',
          profileEditFemale: 'Female', profileEditMale: 'Male',
          styleManualDesc: 'Choose manually', styleAstroDesc: 'Automatic', styleStarDesc: 'Artist style',
          scPickerApply: 'Apply', scFillProfile: 'Fill in profile →', scCreateRequest: 'Create a song request →',
          planAnalysisIncluded: 'Analysis included', profileAnalytics: 'Analytics',
          refStatInvitedLabel: 'Invited', refStatActivatedLabel: 'Activated', refStatSparksLabel: 'Sparks',
          spubNudge: 'You\\\'ve already created 2 tracks. <strong>The Soul package pays for itself from the 3rd</strong> — plus Soul Chat, order history and priority.',
          spubCta: 'Get Soul — $9.90 →',
          diarySettingsTitle: 'Settings', diarySettingsBack: '← Back',
          successBotHintHtml: 'Press <b style="color:rgba(255,255,255,0.7);">Start</b> in the bot — and future songs will arrive right in Telegram',
          payOvUpsellTitle: 'Soul — 5 tracks for {subRub} ₽',
          payOvUpsellDesc: '1 track = {perTrack} ₽ instead of {songRub} ₽. Includes Soul Chat',
          confirmDescHtml: 'Analyzing your data and creating a unique song.<br><br>The song will arrive in this chat. You can close the app — nothing will be lost.',
          confirmContinueBtn: 'Continue →', planConfirmPay: 'Pay', planConfirmCancel: 'Cancel',
          profileLogout: 'Log out', profileOfferLink: 'Terms of service',
          profileAnalytics: 'Analytics',
          recoveryBannerHtml: '<strong style="color:#6ee7b7;">Your request is waiting!</strong> Use Sparks — create your song.',
          recoveryClaimBtn: 'Create song',
          profilePartnerBadge: 'Partner',
          partnerDashStatEarned: 'Total earned', partnerDashStatAvailable: 'Available for withdrawal',
          adminTitle: 'Admin', adminDesc: 'Request management, architecture map and settings — in the web admin panel.',
          adminOpenBtn: 'Open web admin'
        },
        de: {
          dlSongTitle: 'Song herunterladen',
          dlSongEyebrow: 'Song herunterladen',
          dlSongTrackSub: 'Seelenlied · 2:48 · MP3',
          dlSongMsg: 'Danke fürs Teilen 🤍 <span class="hl">Solange dein Song auf deiner Seite lebt, bleibt der Download offen.</span> <span class="ret">Nimmst du den Beitrag herunter, kehren wir zum Üblichen zurück: der Track für Funken.</span>',
          dlSongMore: 'Andere Wege zum Öffnen',
          dlSongJoinT: 'Der Community beitreten',
          dlSongJoinS: 'YupSoul auf VK',
          dlSongRevT: 'Bewertung schreiben',
          dlSongRevS: 'Ein paar warme Worte zum Song',
          dlSongCta: 'Song teilen',
          dlSongOrPre: 'oder ',
          dlSongOrLink: 'den Download für <span class="spk">100</span> Funken öffnen',
          tagline: 'Entdecke, wie dein Horoskop klingt',
          taglineAccent: 'dein',
          startBtn: 'Hol dir dein Lied', myProfile: 'Profil', myHeroes: 'Labor', myHelp: 'Hilfe', admin: 'Admin',
          compatTitle: 'Kompatibilität', profileTitle: 'Profil', profileSubtitle: 'Deine Daten und Sparks',
          profileFreeCredits: 'Sparks', profileInviteFriend: 'Freund einladen', profileShare: 'Teilen', profileCopyLink: 'Link kopieren', profileLinkCopied: 'Link kopiert',
          refShareTextWithName: 'Hallo! Schau dir diese App an — sie erstellt einen persönlichen Song basierend auf deinem Geburtsdatum. Wirklich cool, probiere es aus — die erste Minute deines Songs ist ein Geschenk!',
          refShareText: 'Schau dir diese App an — sie erstellt einen persönlichen Song basierend auf deinem Geburtsdatum. Die erste Minute deines Songs ist ein Geschenk — probiere es aus!',
          copiedToClipboard: 'In Zwischenablage kopiert',
          shared: 'Geteilt!',
          copyManually: 'Link kopieren:',
          confirmYes: 'Ja',
          confirmCancel: 'Abbrechen',
          deleteCancelled: 'Löschung abgebrochen',
          confirmExit: 'Verlassen',
          confirmStay: 'Bleiben',
          thisHero: 'diese Person',
          confirmDeleteHero: '«{name}» löschen?',
          btnDelete: 'Löschen',
          profileInvited: 'Eingeladen', profileActivated: 'Aktiviert', profileCreateSong: 'Lied erstellen',
          heroesTitle: 'Kontakte', heroesSubtitle: 'Menschen, für die das Orakel singt',
          heroesVkOfferTitle: 'Personenkartei', heroesVkOfferDesc: 'Füge deine Liebsten einmal hinzu — und erstelle Lieder für sie mit einem Tipp. Die ganze Historie mit Texten ist gleich hier.', heroesVkOfferCta: 'Kartei öffnen',
          ulSegCards: 'Kartei', ulSegTopic: 'Deutungsthema',
          ulCardsEyebrow: 'Personenkartei', ulCardsTitle: 'Alle Liebsten — an einem Ort', ulCardsSub: 'Speichere die Daten von Familie und Freunden — Lieder und Übereinstimmung mit einem Tipp.',
          ulCardsB1: 'Lieder mit einem Tipp', ulCardsB1s: 'nach gespeichertem Datum', ulCardsB2: 'Übereinstimmung', ulCardsB2s: 'eine Deutung für euch beide', ulCardsB3: 'Beschenke deine Liebsten', ulCardsB3s: 'ein Lied als Geschenk direkt von hier',
          ulCardsCta: 'Kartei öffnen', ulCardsNote: 'Paket «Labor» · 30 Tage Zugang',
          ulTopicEyebrow: 'Themendeutung', ulTopicTitle: 'Deutungen aus deiner Karte', ulTopicSub: 'Eine tiefe Deutung des Themas aus deiner Karte — und ein persönliches Lied dazu.',
          ulTopicB1: 'Tiefe Deutung', ulTopicB1s: 'nach deinem Geburtsdatum', ulTopicB2: 'Ein Lied zum Thema', ulTopicB2s: 'ein persönlicher Track als Geschenk', ulTopicB3: 'Fragen an das Orakel', ulTopicB3s: 'zu diesem Thema, ohne Limit',
          ulTopicCta: 'Deutungen öffnen', ulTopicNote: 'Die Deutung öffnet sich im Orakel-Tagebuch',
          heroesPerkTapTitle: 'Songs mit einem Tipp', heroesPerkTapDesc: 'Füge eine Person einmal hinzu — und erstelle Tracks für sie, ohne das Datum erneut einzugeben.', heroesPerkMatchTitle: 'Verbundenheit mit deinen Liebsten', heroesPerkMatchDesc: 'Sieh, wie sehr ihr im Einklang seid — anhand des Geburtsdatums.', heroesPerkHistoryTitle: 'Die ganze Geschichte griffbereit', heroesPerkHistoryDesc: 'Songs und Texte für jeden Liebsten — an einem Ort gesammelt.', heroesPerkGiftTitle: 'Beschenke deine Liebsten', heroesPerkGiftDesc: 'Versammle Familie und Freunde — und beschenke sie mit persönlichen Songs.', heroesBuyPeriodWeb: 'Das Labor · Kartothek inklusive', heroesBuyPriceUnitWeb: '₽', heroesBuyNoteWeb: 'Paket · die Kartothek und das ganze Labor', heroesBuyTrust: 'Sichere Zahlung · sofortiger Zugang', heroesBrandTagline: 'Musik-Orakel', heroesTitleH1: 'Kartei', heroesTitleSub: 'Menschen, für die das Orakel singt', heroesSelfBadge: 'das bist du', heroesCreateSong: 'Song erstellen',
          searchByName: 'Suche nach Name', searchPlaceholder: 'Name eingeben...', searchBtn: 'Suchen',
          addHero: 'Held hinzufügen', heroName: 'Name *', heroNameLabel: 'Name', heroBirthdate: 'Geburtsdatum', heroBirthtime: 'Geburtszeit',
          heroBirthplace: 'Geburtsort', heroBirthplacePh: 'Stadt, Land', heroNotes: 'Notizen', heroNotesPh: 'Notizen zur Person',
          unknownTime: 'Exakte Zeit unbekannt', cancel: 'Abbrechen', deleteBtn: 'Löschen', save: 'Speichern', back: '← Zurück', backLabel: 'Zurück',
          gender: 'Geschlecht', genderSelect: 'Wählen', male: 'Männlich', female: 'Weiblich', other: 'Divers',
          modeType: 'Song-Format', modeSubtitle: 'Für wen erstellen wir?',
          modeSingle: 'Über mich', modeSingleDesc: 'Ein Lied nach deinem Geburtsdatum.',
          modeCouple: 'Über uns zwei', modeCoupleDesc: 'Ein Lied für zwei Menschen.',
          modeLockedBadge: 'Mit Paket verfügbar',
          guideTipFormat: 'Wähle ein Format', guideTipDate: 'Gib dein Geburtsdatum ein', guideTipStyle: 'Wähle, wie der Stil bestimmt wird', guideTipLyrics: 'Mit Text, nur Musik oder dein eigener Text', guideTipCreate: 'Fertig — tippe auf „Erstellen“',
          guideTipStart: 'Tipp — wir erstellen deinen Song', guideTipGender: 'Wähle das Geschlecht', guideNextBtn: 'Weiter', coupleManualEnter: 'Manuell eingeben', coupleExpandEdit: 'Aufklappen', coupleCollapseEdit: 'Zuklappen', guideTipLanguage: 'Sprache des Songs', guideTipRequest: 'Ein paar Worte zum Thema, und das Lied trifft es genauer. Keine Lust? Überspring es einfach — wir gestalten es nach deiner Deutung.', guideTipName: 'Name eingeben — wird gesungen. Schon ausgefüllt, aber ungewollt? Einfach löschen', guideTipAdv: 'Optional: Ort & Zeit machen es genauer',
          obSlide5Eyebrow: 'Verpasse nichts', obSlide5Title: 'Erfahre als Erste(r), wenn dein Song fertig ist', obSlide5Sub: 'Wir melden uns, sobald dein Song fertig ist, und erinnern an den Tagesfunken.',
          obChipNotifyReady: 'Song fertig → sofort Bescheid', obChipNotifyIskra: 'Tagesfunke',
          obConsentBtn: 'Benachrichtigungen aktivieren · +5 Funken', obConsentDone: 'Verbunden',
          modeTransit: 'Energie<br>des Tages', modeTransitDesc: 'Ein Lied über den heutigen Tag.',
          namePh: 'Wie heißt du?', birthdateLabel: 'Geburtsdatum', birthplacePh: 'Stadt oder Land — wähle aus den Vorschlägen',
          birthplaceHint: 'Stadt eintippen und aus der Liste auswählen.',
          cityTypeMore: 'Mindestens 3 Buchstaben eingeben',
          unknownTimeShort: 'Unbekannt', secondPersonTitle: 'Zu zweit', name2Ph: 'Name der zweiten Person',
          birthplace2Ph: 'Geburtsort der zweiten Person', birthtime2Ph: 'Geburtszeit',
          transitTitle: 'Energie des Tages', transitDatePh: 'TT.MM.JJJJ', transitTimePh: 'HH:MM',
          transitLocationPh: 'Stadt für die Momentenergie', transitLocationOk: 'Ort ist korrekt',
          transitIntentPh: 'Absicht für diesen Moment',
          styleManual: 'Manuell<br>eingeben', styleAstro: 'Planeten-<br>klang', styleStar: 'Wie ein<br>Star', starRecent: 'Letzte',
          styleHeading: 'Musikstil', styleSubtitle: 'Wie bestimmst du den Stil?',
          stylePlaceholderManual: 'Genre oder Stimmung der Musik', stylePlaceholderAstro: 'Stil wird nach Geburtsdatum bestimmt', stylePlaceholderStar: 'Künstler, Song oder Soundtrack',
          styleManualDefaultHint: 'Wenn leer gelassen — wählen wir den Stil automatisch nach deinem Geburtsdatum.',
          pendingDraftBannerText: '← Zurück zum Lied-Entwurf',
          payOvDraftTtlHint: 'Entwurf wird 7 Tage aufbewahrt — danach automatisch storniert.',
          authErrVkNoCode: 'Anmeldung über VK fehlgeschlagen. Versuche es erneut oder nutze Telegram.',
          authErrVkTokenFail: 'VK hat die Anmeldung nicht bestätigt. Versuche es in einer Minute erneut.',
          authErrVkUserFail: 'VK gab ein unvollständiges Profil zurück. Versuche es erneut.',
          authErrVkCreateFail: 'Konto konnte nicht erstellt werden. Kontaktiere den Support, falls das wieder passiert.',
          authErrVkJwtFail: 'Sitzung wurde nicht erstellt. Versuche es erneut.',
          authErrGeneric: 'Anmeldung fehlgeschlagen. Versuche es erneut.',
          supportEmailCopied: 'E-Mail kopiert — schreib uns',
          supportEmailLabel: 'Schreib uns per E-Mail',
          mtAudioTapAgain: 'Tippe erneut — Browser verlangt Bestätigung',
          astroInfoReady: 'Stil wird aus deinem Geburtsdatum abgeleitet',
          astroInfoNoProfile: 'Gib zuerst dein Geburtsdatum ein',
          astroInfoNoProfileHint: 'Zum Ausfüllen tippen',
          starHint: 'Gib den Namen eines Künstlers, Songs oder Filmsoundtracks ein. Wir erstellen Musik in einem ähnlichen Stil, einzigartig für dich.',
          sendRequest: 'Worüber soll das Lied entstehen?', requestReassure: 'Kannst du leer lassen — wir gestalten das Lied nach deinem Geburtsdatum.', quickRequests: 'Schnellanfragen', hide: 'Ausblenden',
          requestDesc: 'Worum geht das Lied? Jede Anfrage — von Humor bis tiefe Themen.',
          requestQuickHint: 'Wähle eine Vorlage oder schreib deine eigene',
          requestPh: 'Schreib eine beliebige Anfrage', toPayment: 'Zur Kasse',
          paymentSubtitle: 'Dein Klangschlüssel', paymentAndAccess: 'Zahlung & Zugang',
          paymentIntro: 'Erstelle einen Track mit Funken oder hole dir ein Paket für vollen Zugang.',
          loadingPricing: 'Tarife laden...', currentItem: 'Aktuelles Element',
          promoCode: 'Gutscheincode', promoEmptyError: 'Gutscheincode eingeben', toastRateLimit: 'Zu viele Versuche. Warte ein paar Minuten und versuche es erneut.', apply: 'Anwenden', backFromPayment: '← Zurück',
          submitAndContinue: 'Zur Kasse & weiter', submitRequest: 'Anfrage senden',
          submitHint: 'Das Lied kommt in diesen Chat mit dem Bot. Falls Sie im Bot noch nicht auf «Start» geklickt haben — tun Sie es jetzt.',
          paymentPageIntroAfterSubmit: 'Anfrage gesendet. Gutscheincode eingeben oder unten eine Zahlungsart wählen.',
          paymentPageTagline: 'Gutscheincode oder Zahlung',
          pay: 'Bezahlen',

          firstFree: 'Du hast Funken — erstelle deinen ersten Track!',
          subscriptionActive: 'Du hast ein aktives Paket — fahre fort.',
          catalogLoadFailed: 'Tarife konnten nicht geladen werden. Tippe «Zur Kasse» — der Backend bestimmt den Preis.',
          paymentRequired: 'Zahlung für neue Anfragen erforderlich.',
          promoApplied: 'Gutschein {code}: -{amount} {currency}',
          creatingKey: 'Dein Schlüssel wird erstellt...',
          creatingKeyDesc: 'Magie passiert in Echtzeit. Dein persönlicher Klangschlüssel wird aus deinen einzigartigen Daten geformt.',
          keyActivated: 'Schlüssel aktiviert!', done: 'Fertig!',
          successText: 'Dein persönlicher Klangschlüssel ist erstellt! Dein einzigartiges Kraftartefakt für das Spiel des Lebens.',
          yourSong: 'Dein Lied',
          songPreviewText: 'Deine einzigartige Komposition wartet im Bot. Höre sie jeden Morgen, um dich auf Erfolg einzustimmen.',
          whatNext: 'Was weiter:', openBot: 'Bot öffnen',
          soulChat: 'Mit deiner Seele sprechen', soulChatPay: 'Zur Kasse — Soul / Depth',
          newKey: 'Weiteren Schlüssel erstellen',
          paymentThanks: 'Danke für die Zahlung', thanksSubtitle: 'Anfrage angenommen', paymentThanksBackToForm: 'Dein Lied erstellen', paymentThanksBackToHome: 'Zur Startseite', paymentCancelled: 'Zahlung abgebrochen',
          songInProgress: 'Das Lied wird generiert und kommt im Bot-Chat, wenn es fertig ist.',
          songInProgressConfirmed: 'Anfrage angenommen. Lied wird generiert — erneute Zahlung nicht nötig. Es kommt im Bot-Chat, wenn es fertig ist.',
          thanksDone: 'Fertig',
          notFromTelegram: 'Öffne die App aus dem Bot-Chat in Telegram (Menü) — sonst kann die Anfrage nicht gesendet werden.',
          notFound: 'Nicht gefunden', searchError: 'Suchfehler',
          soulChatLoad: 'Laden…',
          soulChatHasAccess: 'Du hast Soul Chat. Tippe unten — der Bot öffnet sich. Im Bot: /soulchat und stelle deiner Seele eine Frage.',
          soulChatNoAccess: 'Soul Chat — Dialoge mit deiner Seele. Mit Soul (bis 50 Nachrichten) oder Depth (unbegrenzt) Paket.',
          soulChatDefault: 'Soul Chat — Dialoge mit deiner Seele pro Anfrage. Per Paket.',
          soulChatNoApi: 'Soul Chat — Dialoge mit deiner Seele. Mit Soul oder Depth Paket. Gehe zu «Zur Kasse» in der App.',
          greeting: 'Hallo, {name}! Komm zurück, wann immer du dich erinnern willst, wer du bist.',
          greetingDefault: 'Komm zurück, wann immer du dich erinnern willst, wer du bist.',
          onboardingSlide1Title: 'Es gibt ein Lied — über dich',
          onboardingSlide1Text: 'Geschrieben nach deinem Geburtsdatum. Kein Template — ein echter Text über deinen Charakter und Weg.',
          onboardingSlide2Title: 'Nur über dich',
          onboardingSlide2Text: 'Eine smarte Analyse deiner Persönlichkeit wird zu einem lebendigen Lied — einzigartig, nur deins.',
          onboardingSlide3Title: 'Dein Song wartet auf dich',
          onboardingSlide3Text: 'Gib dein Geburtsdatum ein — erstelle dein erstes Lied, eine Minute davon geschenkt.',
          onboardingBtnStart: 'Mein Lied hören',
          obBrand: 'YupSoul', obSkip: 'Überspringen', obNext: 'Weiter', obCreate: 'Ersten Song erstellen',
          archTitle: 'Wer du wirklich bist', archLead: 'In deinem Geburtsdatum steckt ein Planet, den die Astrologie den Anzeiger der Seele nennt. Er trägt deinen Charakter. Nenn das Datum — ich zeig es dir.', archDateLabel: 'Geburtsdatum', archGo: 'Meinen Archetyp zeigen', archEyebrow: 'Anzeiger der Seele', archGift: 'Deine Gabe', archShadow: 'Dein Schatten', archSoulPlanet: 'Seelenplanet', archNote: 'Deine Note', archBridge: 'Das waren Worte. Jetzt hör, wie es klingt: der Song entsteht aus demselben Datum.', archToSong: 'Meinen Song erstellen', archAgain: 'Anderes Datum', archNeedDate: 'Gib dein Geburtsdatum ein', archBadDate: 'Prüf das Datum — da stimmt etwas nicht', signInWithApple: 'Mit Apple anmelden', rgAll: 'Alle Genres', rg_rock: 'Rock', rg_electronic: 'Elektronik', rg_rap: 'Rap', rg_folk: 'Folk', rg_soul: 'Soul / R&B', rg_ambient: 'Ambient', rg_cinematic: 'Cinematic', rg_acoustic: 'Akustik', rg_sacred: 'Sakral', rg_pop: 'Pop', rg_other: 'Andere', offlineTitle: 'Keine Internetverbindung', offlineText: 'Prüfe deine Verbindung und versuch es erneut', offlineRetry: 'Neu laden', errPurchaseFailed: 'Der Kauf wurde nicht abgeschlossen', errArchBadDate: 'Prüf das Datum — da stimmt etwas nicht',
          obReward: '+30 Funken zum Kennenlernen',
          obChipBirthdate: 'nach deinem Geburtsdatum', obChipWhoAmI: '„Wer bin ich?"', obChipDiary: 'Tagebuch des Tages',
          obChipCompat: 'Du + Mama · 92%', obChipContacts: 'deine Liebsten', obChipGift: 'verschenke an Freunde', obChipRadio: 'Radio · Lieder anderer',
          obSlide1Eyebrow: 'Dein Seelenlied', obSlide1Title: 'Ein Song nach deinem Geburtsdatum', obSlide1Sub: 'Das Orakel liest deine Geburtskarte und erschafft einen Track, der nur von dir handelt.',
          obSlide2Eyebrow: 'Orakel', obSlide2Title: 'Frag über dich — und erhalte eine tiefe Antwort', obSlide2Sub: 'Stelle Fragen über deinen Weg, deine Beziehungen und deinen Charakter. Das Orakel antwortet warm und auf den Punkt.',
          obSlide3Eyebrow: 'Kompatibilität', obSlide3Title: 'Erfahre, wie sehr ihr im Einklang seid', obSlide3Sub: 'Füge Familie und Freunde zu deinen Liebsten hinzu — und sieh eure Kompatibilität nach Geburtsdatum.',
          obSlide4Eyebrow: 'Schenken und hören', obSlide4Title: 'Verschenke Songs und höre Radio', obSlide4Sub: 'Verschenke einen Song an jemanden, der dir wichtig ist, und öffne Radio — Lieder anderer Menschen.',
          alertNameShort: 'Name muss mindestens 2 Zeichen haben', alertNameFriendly: 'Wie heißt du? Mit Namen wird das Lied wirklich deins', alertNameInvalid: 'Bitte gib einen echten Namen ein', alertBirthdate: 'Wähle Geburtsdatum', alertBirthdateInvalid: 'Geburtsjahr muss zwischen 1900 und aktuellem liegen', alertBirthdateInvalidDay: 'Ungültiges Datum — prüfe Tag und Monat',
          errInvalidName: 'Name enthält ungültige Zeichen oder Wiederholungen.',
          errNameRequired: 'Der Name darf nicht leer sein. Gib mindestens 1 Zeichen ein.',
          errInvalidDateFormat: 'Ungültiges Geburtsdatumformat. Verwende YYYY-MM-DD.',
          errInvalidDateYear: 'Geburtsjahr muss zwischen 1900 und dem aktuellen Jahr liegen.',
          errInvalidDateMonth: 'Ungültiger Geburtsmonat.',
          errInvalidDateDay: 'Ungültiger Geburtstag.',
          errInvalidDate: 'Ungültiges Geburtsdatum.',
          errInvalidBirthplace: 'Geburtsort ist ungültig.',
          alertBirthplace: 'Geburtsort muss mindestens 3 Zeichen haben', alertBirthplaceHint: 'Wähle einen Ort aus den Vorschlägen',
          validationErrorHint: 'Fülle alle Pflichtfelder aus.',
          alertBirthtime: 'Geburtszeit eingeben oder "Unbekannt" wählen', alertGender: 'Geschlecht wählen', alertLanguage: 'Sprache wählen',
          advSettingsTitle: 'Erweiterte Einstellungen', advSettingsSub: 'optional', advSettingsHint: 'Optional. Geburtsort und -zeit machen die Berechnung genauer — du kannst sie überspringen.',
          unlockEyebrow: 'Dein Song', unlockTitle: 'Das ist erst der Anfang',
          unlockLead: 'Die erste Minute ist erklungen. <b>Der ganze Song dauert etwa 3 Minuten</b>, geschrieben nach deinem Geburtsdatum. Es folgen Refrain, Finale und dein Name in den Worten.',
          unlockR1t: 'Ganzer Song', unlockR1s: 'etwa 3 Minuten', unlockR2t: 'Als MP3 laden', unlockR2s: 'bleibt für immer bei dir',
          unlockR3t: 'Songtext', unlockR3s: 'der ganze Text', unlockR4t: 'Mit Liebsten teilen', unlockR4s: 'diesen Song schenken',
          unlockR5t: 'Karaoke zum Song', unlockR5s: 'zu deinen Worten mitsingen',
          unlockPromoToggle: 'Ich habe einen Promo-Code', unlockPromoPh: 'Promo-Code eingeben', unlockPromoApply: 'Anwenden', unlockPromoChecking: 'Prüfe…', unlockPromoWrongProduct: 'Dieser Promo-Code gilt nicht für einen Song',
          unlockCtaOpen: 'Ganzen Song öffnen', unlockCtaSub: 'öffnet sofort', unlockCtaPaying: 'Zahlung wird geöffnet…', unlockPayCard: 'Karte', unlockPayStars: 'Sterne', unlockPayPromo: 'Promo-Code', unlockPayIskry: 'Funken',
          unlockGhReplay: 'Nochmal', unlockGhBack: 'Zurück', unlockVkNote: 'Freischaltung wird per Karte bezahlt', unlockIskryUnit: 'Funken',
          openedEyebrow: 'Dein Song ist frei', openedTitle: 'Fertig — hör ihn ganz',
          openedLead: 'Die volle Version läuft schon. Sie gehört dir — lade sie, lies den Text und teile sie mit Liebsten.',
          openedLeadNoLyrics: 'Die volle Version läuft schon. Sie gehört dir — lade sie und teile sie mit Liebsten.',
          openedPlaySub: 'Ganzer Song · 3:12',
          openedKaraT: 'Karaoke singen', openedKaraS: 'Text leuchtet im Takt auf',
          openedNudgeT: 'Song für einen Liebsten erstellen', openedNudgeS: 'so eine Geschichte verschenken', openedPackT: 'Mehr Songs — für dich und deine Liebsten', openedPackS: 'ein Funken-Paket — gleich 10+ Songs',
          openedOptinT: 'Jeden Morgen bei dir vorbeischauen?', openedOptinGift: '3 Tage geschenkt', openedOptinP: 'Ein kurzes warmes Wort vom Orakel jeden Morgen. Jederzeit abschaltbar.', openedOptinYes: 'Ja, schick sie', openedOptinNo: 'Nicht jetzt',
          openedShare: 'Mit Liebsten teilen', openedDownload: 'Laden', openedLyrics: 'Songtext',
          alertName2Short: 'Name der zweiten Person — mindestens 2 Zeichen', alertBirthdate2: 'Geburtsdatum der zweiten Person eingeben',
          alertBirthplace2: 'Geburtsort der zweiten Person muss mindestens 3 Zeichen haben',
          alertBirthtime2: 'Geburtszeit der zweiten Person eingeben', alertGender2: 'Geschlecht der zweiten Person wählen',
          alertTransitDate: 'Ereignisdatum eingeben', alertTransitLocation: 'Ereignisort eingeben', alertTransitConfirm: 'Bestätige, dass der Ort korrekt ist',
          alertRequestShort: 'Anfrage hinzufügen (5+ Zeichen)', alertRequestLong: 'Erzähle dem Universum mehr (mindestens 15 Zeichen)',
          alertYourPath: 'Wähle deinen Weg', alertNoApi: 'API-Adresse nicht konfiguriert.', alertOpenFromBot: 'Öffne die App aus dem Bot-Chat in Telegram — sonst wird die Anfrage nicht angenommen.',
          alertServerSleep: 'Server brauchte etwas zum Aufwachen. Warte etwa eine Minute und tippe erneut auf «Anfrage senden».',
          sending: 'Sende…',
          universeHeard: '{name}, das Universum hat deine Anfrage gehört.\n\nDein Klangschlüssel wird erstellt und kommt in diesen Chat, wenn er fertig ist.',
          universeHeardCouple: '{name} und {name2}, das Universum hat eure Anfrage gehört.\n\nEuer Klangschlüssel wird erstellt und kommt in diesen Chat, wenn er fertig ist.',
          universeHeardTransit: '{name}, das Universum hat deine Anfrage gehört.\n\nDein Tagesenergie-Klangschlüssel wird erstellt und kommt in diesen Chat, wenn er fertig ist.',
          langSong: 'Liedsprache', langRu: 'Russisch', langEn: 'Englisch', langDe: 'Deutsch', langFr: 'Französisch', langUk: 'Ukrainisch',
          quick1: 'Harmonie und Selbstliebe', quick2: 'Selbstvertrauen und Bestimmung', quick3: 'Kreatives Potenzial', quick4: 'Vergangenheit loslassen',
          quick5: 'Lebensbalance', quick6: 'Vertrauen und Akzeptanz', quick7: 'Heilung und Freiheit', quick8: 'Weg zum Glück',
          quick9: 'Kraft und Überwindung', quick10: 'Tiefe und Stille', quick11: 'Zärtlichkeit und Fürsorge', quick12: 'Humor und Leichtigkeit',
          quick1t: 'Harmonie in Beziehungen und Selbstliebe', quick2t: 'Selbstvertrauen, Bestimmung und Selbstständigkeit',
          quick3t: 'Kreatives Potenzial ohne Angst entfalten', quick4t: 'Vergangenheit loslassen und neue Möglichkeiten öffnen',
          quick5t: 'Balance von Arbeit und Privatleben', quick6t: 'Dem Leben vertrauen und Kontrolle loslassen',
          quick7t: 'Kindheitstraumen heilen und Freiheit finden', quick8t: 'Deinen Weg zu Glück und Frieden finden',
          quick9t: 'Kraftvolles Lied über meine Stärke und Überwindung', quick10t: 'Meditatives Lied für Praxis und Heilung',
          quick11t: 'Warmes Lied über Fürsorge und Zärtlichkeit', quick12t: 'Verspieltes Lied mit Selbstironie über meine Eigenheiten',
          promoError: 'Gutscheincode konnte nicht angewendet werden',
          promoCleared: 'Gutscheincode entfernt.', promoApplied: 'Gutschein angewendet: Endsumme {amount} {currency}',
          promoAppliedHint: 'Gutschein {code}: -{amount} {currency}',
          paymentRequiredOpening: 'Zahlung erforderlich. Öffne HOT Checkout...',
          promoFreeGen: 'Gutscheincode aktiviert. Starte...',
          hotCheckoutOpened: 'HOT Checkout geöffnet. Nach der Zahlung kehre zur Mini App zurück — der Status wird automatisch aktualisiert.',
          paymentNotConfirmed: 'Zahlung noch nicht bestätigt. Später prüfen oder Zahlung erneut öffnen.',
          paymentConfirmed: 'Zahlung bestätigt. Generierung startet...', successWhileWaiting: 'Während du wartest', successNewSong: 'Neuer Song',
          paymentReceivedNoStart: 'Zahlung erhalten, aber Auto-Start fehlgeschlagen. Starte Generierung in der Admin per request_id: {id}',
          submitFailed: 'Anfrage konnte nicht gesendet werden. Warte eine Minute und tippe erneut auf «Anfrage senden» oder öffne die Mini App neu aus dem Bot-Chat.',
          errorOp: 'Fehler bei Zahlung/Anfrage',
          alertTransitLocation: 'Ereignisort eingeben', alertTransitConfirm: 'Bestätige, dass der Ort korrekt ist',
          alertNoApi: 'API-Adresse nicht konfiguriert.', alertOpenFromBot: 'Öffne die App aus dem Bot-Chat in Telegram — sonst wird die Anfrage nicht angenommen.',
          alertOpenFromBotShort: 'Öffne die App aus dem Bot-Chat in Telegram.',
          alertPaymentFirst: 'Tippe zuerst auf «Anfrage senden» im vorherigen Schritt.',
          alertLinkCopied: 'Link kopiert. Füge ihn in Safari oder Chrome ein und öffne ihn.',
          alertHeroName: 'Name eingeben', alertError: 'Fehler', alertDeleteConfirm: '«{name}» löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
          alertSubmitError: 'Sendefehler',
          copyLinkPrompt: 'Kopiere diesen Link und öffne ihn im Browser:',
          songFormingText: 'Dein Klangschlüssel wird erstellt und kommt in diesen Chat, wenn er fertig ist.',
          heroesLoading: 'Laden...', heroesEmpty: 'Noch keine Helden. Tippe auf «Held hinzufügen».',
          heroesEmptyFull: 'Noch keine Helden.<br>Füge den ersten hinzu — und erstelle<br>persönliche Songs mit einem Tipp.', heroesSearchNotFound: 'Keine Treffer für deine Suche.', heroesZeroTitle: 'Deine Kartei ist noch leer', heroesZeroDesc: 'Füge einen geliebten Menschen hinzu — und das Orakel komponiert für ihn ein Lied nach seinem Geburtsdatum.', heroesZeroHint: 'Zum Beispiel: Partner · Kinder · Eltern · Freunde', heroesZeroCta: 'Ersten Helden hinzufügen',
          heroSoloBtn: 'Solo', heroDuoBtn: 'Mit mir', heroEditBtn: 'Bearbeiten', heroDeleteBtn: 'Löschen',
          heroesLoadError: 'Konnte nicht geladen werden. Versuche es später.',
          loading: 'Laden…', noCardsYet: 'Noch keine abgeschlossenen Karten', heroHistLoading: 'Verlauf wird geladen…', heroHistEmpty: 'Noch keine Generierungen', heroHistLoadError: 'Verlauf konnte nicht geladen werden', heroesPageLoadError: 'Helden konnten nicht geladen werden', retry: 'Wiederholen',
          forMyself: 'Für mich', forHero: 'Lied erstellen für {name}', heroDataTitle: 'Daten von {name}',
          mtTooltipLyrics: 'Text', mtTooltipAnalysis: 'Analyse', mtTooltipDownload: 'Herunterladen', mtTooltipShare: 'Teilen', mtTooltipVolume: 'Lautstärke', mtVolumeLabel: 'Lautstärke',
          previewHome: 'Startseite', previewForm: 'Formular', previewPayment: 'Zahlung', previewLoading: 'Laden', previewSuccess: 'Erfolg',
          supportBtn: 'Support kontaktieren',
          subActivated: 'Paket aktiviert!', subBtnProfile: 'Mein Profil',
          helpPageTitle: 'Hilfe & Support', helpPageSubtitle: 'Alles über YupSoul — klar und kurz',
          profileHelpBtn: 'Hilfe & Support', profileDeleteAccountBtn: 'Konto löschen',
          deleteAccountConfirm: 'Konto und alle zugehörigen Daten löschen?\n\nWird gelöscht: Profil, Einstellungen, Geburtsdaten, Referral-Verlauf.\n\nDeine erstellten Tracks bleiben in der Gesamtstatistik, werden aber von deinem Konto entkoppelt. Diese Aktion ist UNUMKEHRBAR.',
          profileSectionTheme: 'Erscheinungsbild', themeAuto: 'Auto', themeLight: 'Hell', themeDark: 'Dunkel',
          profileSubsLink: 'Pakete', payOvSubsLink: 'Pakete und Verwaltung',
          legalTabOffer: 'AGB', legalTabPrivacy: 'Datenschutz', legalTabSubs: 'Pakete', legalCloseAria: 'Schließen',
          profilePageTitle: 'Profil', profileSectionMyData: 'Meine Daten', profileSectionPlans: 'Pakete',
          profileLoadError: 'Profil konnte nicht geladen werden', profileLoadRetry: 'Aktualisieren',
          profileEditBtn: 'Bearbeiten →', profileEditLabelName: 'Name', profileEditLabelDate: 'Geburtsdatum', profileEditLabelCity: 'Geburtsstadt', profileEditNamePh: 'Dein Name', profileEditCityPh: 'Geburtsstadt', profileEditSaveBtn: 'Speichern', profileEditCancelBtn: 'Abbrechen',
          profileBalanceHintText: 'Freunde einladen — Sparks erhalten',
          profileSectionTracks: 'Einzeltracks', profileTracksNote: 'Ohne Paket — zahle für einen Track, wann immer du willst.', profileRefTagline: 'Teile deinen Link — wenn ein Freund ein Abo abschließt, bekommst du Funken.',
          tuTitle: 'Funken kaufen', tuBalance: 'auf deinem Guthaben · 1 Song = 100 Funken', tuBalanceVk: 'auf deinem Guthaben · 1 Orakel-Frage = 1 Funke', tuChoose: 'Wie viel hinzufügen', tuCta: 'Aufladen', tuPack1k: '≈ 10 Songs', tuPack2k: '≈ 20 Songs', tuPack5k: '≈ 50 Songs', tuSave2k: 'günstiger', tuSave5k: 'maximal', tuEntrySub: '1000 / 2000 / 5000 Funken für neue Songs',
          iskryPacksTitle: 'Funken kaufen', iskryPack1000Name: '1000 Funken', iskryPack1000Desc: '10 Songs',
          iskryPack2000Name: '2000 Funken', iskryPack2000Desc: '20 Songs',
          iskryPack5000Name: '5000 Funken', iskryPack5000Desc: '50 Songs — bester Preis', iskryPackSongs: 'Songs', vkPackHeader: 'Paket', vkPackName: 'Paket: {n} Lieder', vkPackSongs: '{n} persönliche Lieder', vkCardoteka: 'Personenkartei',
          vkIskryUnavailable: 'Funken-Pakete sind auf VK nicht verfügbar. Paket nehmen oder lade einen Freund ein.',
          profileRefInvited: 'Eingeladen', profileRefActivated: 'Aktiviert', profileRefSparks: 'Sparks',
          planCurrentBadge: 'Aktuell', planFreeYours: 'Bereits deins', planSubscribeBtn: 'Abonnieren',
          plTitle: 'Pakete', plBalance: 'Dein Guthaben', plTopup: 'Aufladen', plSubsSec: 'Abos · voller Zugang', plSubsSecVk: 'Pakete · voller Zugang', plPacksSec: 'Funken-Pakete · einmalig', plBasicTag: 'Basic', plPlusTag: 'Plus', plLabTag: 'Master', plBasicF1: '5 Tracks pro Monat', plBasicF2: 'Orakel — 50 Fragen pro Monat', plBasicF3: 'Bestellverlauf', plPlusF1: '15 Tracks pro Monat', plPlusF2: 'Orakel ohne Limit', plPlusF3: 'Priorität in der Warteschlange', plLabF1: '30 Tracks pro Monat', plLabF2: 'Personenkartei', plLabF3: 'Orakel ohne Limit + Priorität', plFlag: 'am beliebtesten', plBasicCta: 'Seele aktivieren', plPlusCta: 'Tiefe aktivieren', plLabCta: 'Labor aktivieren', plOnceSec: 'Einmalkäufe', plBuy1: 'Lied über dich', plBuy1s: 'Ein Klangschlüssel nach deinem Muster', plBuy2: 'Lied zu zweit', plBuy2s: 'Kompatibilität aus zwei Mustern', plBuy3: 'Energie des Tages', plBuy3s: 'Der Klang eines bestimmten Moments', plBuyPrice: '100 Funken', plLegalHtml: 'Jedes Lied — 100 Funken. Pakete sind eine Einmalzahlung für 30 Tage, ohne automatische Abbuchungen. Zahlung per Karte, Stars oder Funken; Promo-Codes gelten für Einmalkäufe. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">AGB</a>.', plLegalVkHtml: 'Funken werden per Karte aufgeladen und für Orakel-Fragen ausgegeben. Pakete sind ein Einmalkauf. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">AGB</a>.', tuBalanceVk: 'auf deinem Guthaben · 1 Orakel-Frage = 1 Funke', tuPack1kVk: '≈ 1000 Orakel-Fragen', tuPack2kVk: '≈ 2000 Orakel-Fragen', tuPack5kVk: '≈ 5000 Orakel-Fragen', tuEntrySubVk: '1000 / 2000 / 5000 Funken für Orakel-Fragen', iskryPackQuestions: 'Orakel-Fragen',
          planFreeName: 'Suchender', planFreeBadge: '✦ YupSoul Suchender',
          planFreeNameClassic: '(Kostenlos)', planBasicNameClassic: '(Basic)', planPlusNameClassic: '(Plus)', planMasterNameClassic: '(Labor)',
          planBasicName: 'Seele', planPlusName: 'Tiefe',
          planDetailsBtn: 'Details', planPopularBadge: 'am häufigsten gewählt', planMasterBadgeText: 'Beste Wahl',
          planMasterNameText: 'Labor', planOpenMasterBtn: 'Labor öffnen',
          planModalSection: 'Was enthalten ist', planModalSubscribe: '{title} abonnieren', planModalClose: 'Schließen',
          planConfirmHeader: 'Tarif',
          vkPackHeader: 'Paket', vkPackName: 'Paket: {n} Lieder', vkPackSongs: '{n} persönliche Lieder', vkCardoteka: 'Personenkartei',
          ptiSingleName: 'Für mich', ptiSingleDesc: 'Deine Persönlichkeit im Klang',
          ptiCoupleName: 'Für zwei', ptiCoupleDesc: 'Eure Verbindung und Resonanz',
          ptiTransitName: 'Tagesenergie', ptiTransitDesc: 'Ein Lied für heute',
          successTitle: 'Anfrage angenommen!', successDesc: 'Dein Song wird erstellt. Wenn er fertig ist — kommt er im Bot an. Normalerweise 10–20 Minuten.', successWhereTrack: 'Dein Song erscheint im Bereich<br><b>Meine Tracks</b>',
          successHint: 'Nicht angekommen nach 20 Min? Schreib dem Bot "Song nicht angekommen".', successToProfile: 'Zum Profil',
          successListen: 'Bot öffnen', successMyTracks: 'Meine Tracks',
          typewriter1: 'Erstelle ein Lied über dich zu jedem Thema.',
          typewriter2: 'Erhalte eine Textfassung basierend auf tiefer Analyse deiner Anfrage.',
          typewriter3: 'Sprich mit deiner Seele über den Seelen-Chat.',
          typewriter4: 'Funken warten — erschaffe deinen Song.',
          typewriter5: 'Lege Karten mit Daten deiner Liebsten oder Klienten für schnellen Zugriff an.',
          typewriter6: 'Verbinde Karten mit Daten deiner Liebsten.',
          typewriter7: 'Mach dir und deinen Liebsten ein einzigartiges, tiefes Geschenk.',
          loadingTitle: 'Anfrage angenommen', loadingGenerating: 'Dein Lied wird erstellt...', loadingWait: 'Normalerweise 10–15 Minuten. Erscheint in Meine Tracks.', rateLimitError: 'Server verarbeitet. Bitte warte und versuche es erneut.',
          heroesPageTitle: 'Kontakte', heroesPromoHeading: 'Meister-Dashboard',
          heroesPromoDesc: 'Personen einmal hinzufügen — und Songs für sie in einem Tipp erstellen. Komplette Geschichte mit Texten.',
          heroesPromoFeaturesTitle: 'Was ist enthalten:',
          heroesF1: '✦ Unbegrenzte Personenanzahl', heroesF2: '✦ Schnelle Solo- & Duo-Song-Erstellung',
          heroesF3: '✦ Musikstil-Präferenzen', heroesF4: '✦ Komplette Geschichte mit Texten & Analyse',
          heroesF5: '✦ Audio direkt aus der Personenkarte',
          heroesTrialBtn: '1 Tag kostenlos — ausprobieren', heroesSubBtn: 'Labor erhalten — 3 250 ₽',
          heroesSubNote: '30 Tracks',
          heroFormTitle: 'Person hinzufügen', heroRelLabel: 'Beziehung', heroBirthdateHint: 'Tag, Monat und Jahr wählen',
          heroTimeBirthLabel: 'Geburtszeit', heroStyleLabel: 'Lieblingsmusikstile', heroStylePh: 'Pop, Jazz, Elektronisch…',
          requestPreferredStyleLabel: 'Song-Stil',
          requestPreferredStylePh: 'Pop, Soul, R&B, Hip‑Hop, Techno, House, Ambient…',
          styleQuickLabel: '✦ Musikstile',
          heroRelOpt0: '— auswählen —', heroRelOpt1: 'Mutter', heroRelOpt2: 'Vater', heroRelOpt3: 'Tochter', heroRelOpt4: 'Sohn',
          heroRelOpt5: 'Schwester', heroRelOpt6: 'Bruder', heroRelOpt7: 'Großmutter', heroRelOpt8: 'Großvater',
          heroRelOpt9: 'Ehemann', heroRelOpt10: 'Ehefrau', heroRelOpt11: 'Geliebte Person',
          heroRelOpt12: 'Freund', heroRelOpt13: 'Freundin', heroRelOpt14: 'Kollege', heroRelOpt15: 'Mentor', heroRelOpt16: 'Anderes',
          dateDay: 'Tag', dateMonth: 'Monat', dateYear: 'Jahr',
          scLoading: 'Lade…', scCheckingAccess: 'Wir prüfen dein Paket: ob Soul Chat enthalten ist oder du Einzelzugang hast…', scTyping: 'Soul Chat tippt…', scHeroTagline: 'Gespräch mit der Seele', scPromoIntro: 'Soul Chat ist dein KI-Assistent, der dich versteht wie ein bester Freund oder dein Höheres Selbst. Beantwortet Fragen zu Charakter, Bestimmung und Weg.',
          scPromoErrorText: 'Paket nehmen oder 24-Stunden-Zugang kaufen', scPromoRetryBtn: 'Aktualisieren',
          scMoreBtnText: 'Mehr ↓', scMoreBtnCollapse: 'Einklappen ↑', scStat1: 'berichten von weniger Angst', scStat2: 'fühlen sich verstanden',
          scStat3: 'finden Antworten schneller', scStat4: 'kommen wieder',
          scExamplesTitle: 'Beispielfragen',
          scEx1: '„Warum fällt es mir so schwer, über meine Gefühle zu reden?"', scEx2: '„Was ist meine größte Angst und wie gehe ich damit um?"',
          scEx3: '„Was ist mein Lebensweg und wie komme ich dahin?"',
          profileNotifDisable: 'Benachrichtigungen deaktivieren', profileNotifEnable: 'Benachrichtigungen aktivieren',
          scSubIncluded: 'Soul Chat im Paket enthalten', scChoosePlanBtn: 'Tarif wählen →', scSubMobileHint: 'Bezahlung auf dieser Plattform nicht verfügbar',
          scGiftHeading: 'Probiere Soul Chat — 24 Stunden', scGiftNote: 'Einmalig pro Nutzer',
          scGiftBtnText: '24 Stunden kostenlos', scBuyDayNote: 'Noch nicht bereit für ein Paket? Teste den Einzelzugang',
          scBuyDayBtnText: 'Soul Chat 24h öffnen — 2,99 $', scToastPaymentReceived: 'Zahlung erhalten, Zugang aktiv',
          scSubRequiredForReply: 'Paket erforderlich, um den Dialog mit dem Orakel fortzusetzen',
          scPickerTabSynastryText: 'Kompatibilität', scSynastryTeaserText: 'Kompatibilität — Dialog für zwei Charts — im Labor-Tarif verfügbar',
          helpT1: 'Was ist YupSoul', helpB1: '<p>YupSoul erstellt ein <strong>persönliches Lied genau für dich</strong> — basierend auf Datum, Uhrzeit und Geburtsort. Das System analysiert deine Persönlichkeit und schreibt ein Lied über deine echten Qualitäten, Weg und Stärke.</p><p>Dies ist kein Template — jedes Lied ist einzigartig und gehört nur dir.</p>',
          helpT2: 'Was kann erstellt werden', helpB2: '<p><strong>Erstellungsmodi:</strong></p><ul><li><strong>Lied über mich</strong> — dein persönliches Klangportrait: wer du bist, deine Stärke und innerer Weg</li><li><strong>Lied für zwei</strong> — für ein Paar (Verliebte, Freunde). Analysiert beide Daten und spiegelt die Verbindung wider</li><li><strong>Tagesenergie</strong> — ein Lied für ein bestimmtes Datum und Ort. Welche Möglichkeiten öffnen sich gerade jetzt</li></ul><p><strong>Musikstil:</strong></p><ul><li><strong>Eigener Stil</strong> — wähle Genre und Stimmung manuell</li><li><strong>Astro-Stil</strong> — das System wählt den Stil basierend auf deinen Daten</li><li><strong>Wie ein Star</strong> — nenne deinen Lieblingskünstler und der Song klingt wie seiner</li></ul><p><strong>Schnellanfragen</strong> — fertige Ideen: Kraftlied, Geburtstagslied, meditativ, Loslassen und mehr.</p><p><strong>Soul Chat</strong> — ein KI-Assistent, der dich tiefgreifend versteht. Stelle Fragen zu Charakter, Bestimmung und Weg.</p>',
          helpT3: 'Wie lange warten', helpB3: '<p>Normalerweise <strong>5–15 Minuten</strong>. Der Bot schickt eine Benachrichtigung, wenn dein Lied fertig ist.</p><p>Du kannst die App schließen — das Ergebnis kommt von selbst, nichts geht verloren.</p>',
          helpT4: 'Ich kenne meine genaue Geburtszeit nicht', helpB4: '<p>Kein Problem. Wähle <strong>„Zeit unbekannt"</strong> — das System erstellt ein vollständiges Lied anhand der anderen Daten.</p>',
          helpT5: 'Funken & Zahlung', helpB5: '<p><strong>Dein erstes Lied erstellst du sofort — eine Minute davon ist ein Geschenk; gefällt es dir — schalte es mit einer kleinen Zahlung ganz frei.</strong></p><p>Funken gibt es für Taten: hol dir den täglichen Funken (+2 pro Tag, +10 für jede 7-Tage-Serie), +30 für die App-Einführung, +5 für Benachrichtigungen.</p><p>Mehr Funken durch Freunde einladen: teile deinen Link (Profil → Freund einladen). Wenn ein eingeladener Freund ein Abo abschließt — bekommst du Funken.</p>',
          helpT6: 'Zahlung & Gutscheincodes', helpB6: '<p>Zusätzliche Generierungen werden nach Tarif bezahlt. Zahlungsoptionen werden beim Aufgeben einer Bestellung angezeigt.</p><p>Wenn du einen <strong>Gutscheincode</strong> hast — gib ihn auf dem Zahlungsbildschirm ein. Codes sind Groß-/Kleinschreibung-sensitiv.</p>',
          helpLegalTitle: 'Rechtliche Informationen', helpLegalSeller: 'Anbieter: Einzelunternehmer Anton Tataurow, INN 920000802153, Sewastopol', helpLegalSupport: 'Support: Knopf „Support kontaktieren“ oben — Antwort innerhalb eines Tages', helpLegalOffer: 'AGB: Zahlung, Rückerstattung, Regeln', helpLegalPrivacy: 'Datenschutz', errPayPlatform: 'Zahlung auf dieser Plattform nicht verfügbar',
          helpT7: 'Etwas ist schiefgelaufen', helpB7: '<p><strong>App geschlossen oder Fehler</strong> — versuche den Bot neu zu öffnen. Unfertige Bestellungen werden automatisch wiederhergestellt.</p><p><strong>Bezahlt aber kein Lied</strong> — warte 15–20 Minuten. Wenn nichts kommt — schreib dem Bot „Lied nicht angekommen". Oder kontaktiere den Support.</p><p><strong>Gutscheincode nicht akzeptiert</strong> — Groß-/Kleinschreibung prüfen. Falls alles korrekt — schreib uns mit dem Code.</p>',
          helpPartnerTitle: 'Partnerprogramm',
          helpT8: 'Soul Chat & Pakete', helpB8: '<p><strong>Soul Chat</strong> — Gespräch mit deiner Seele basierend auf deinen Daten. Fragen zu Charakter, Bestimmung, Wahl. Für alle offen: die ersten 10 Fragen kostenlos, danach 1 Frage = 1 Funke. Ein Abo hebt das Limit auf — Soul (50 Fragen/Mon.), Depth und Labor (unbegrenzt). Oder 24h-Zugang kaufen.</p><p><strong>Pakete</strong> — Soul (5 Tracks + Soul Chat), Depth (15 Tracks + Soul Chat unbegrenzt), Labor (30 Tracks, Personenverzeichnis, Soul Chat unbegrenzt). Im Profil oder auf der Zahlungsseite.</p>',
          helpT9: 'Für Profis & Berater', helpB9: '<p><strong>Kartei & Kompatibilität.</strong> Führe eine Klientenkartei, analysiere die Kompatibilität anhand zweier Geburtsdaten — ein Lied pro Paar. Ideal für Astrologen und Berater.</p><p><strong>Skalierung ohne Qualitätsverlust.</strong> Bis zu 30 Tracks mit Labor-Paket. Einzigartiger Inhalt pro Klient — ohne Vorlagen.</p><p><strong>Monetarisierung & Geschenke.</strong> Verschenke Lieder an Klienten, packe sie in Beratungspakete oder verkaufe einzeln. Eine Minute des ersten Songs geschenkt — probier es aus.</p>',
          helpT10: 'Was Nutzer sagen', helpB10: '<p><em>„Unglaublich! Das Lied hat meinen Charakter und was ich gerade durchmache genau getroffen. Gänsehaut!“</em> — Anna M.</p><p><em>„Meiner Frau zum Geburtstag geschenkt — sie war begeistert! Jetzt wollen wir ein Lied über uns als Paar“</em> — Dmitry K.</p><p><em>„Eine Minute geschenkt ist fair. Qualität top, bestelle auf jeden Fall wieder“</em> — Elena V.</p>',
          helpSearchPh: 'Fragen durchsuchen…', helpSearchAria: 'Fragen durchsuchen', helpSearchClear: 'Löschen', helpFaqTitle: 'Häufige Fragen', helpSearchEmpty: 'Nichts gefunden', helpFound: 'gefunden',
          helpHeroTitle: 'Wie können wir helfen?', helpHeroSub: 'Alles über YupSoul — klar und kurz. Finde eine Antwort oder schreib uns.', helpPartnerSub: 'Verdiene 20% an den Abos deiner Freunde', helpFoot: '✦ Wir sind für dich da — Antwort innerhalb eines Tages ✦',
          profileBalanceLbl: 'Funken-Guthaben',
          profileTracksLeftLbl: 'Verbleibende Tracks',
          profileOnBalanceSuffix: 'auf dem Guthaben',
          homeIskryHintGuest: 'Starte — die erste Minute deines Songs ist ein Geschenk',
          homeIskryHintEnough: 'Du hast {n} Funken — genug für einen Track',
          homeIskryHintLow: 'Du hast {n} Funken — lade einen Freund ein',
          homeIskryHintZero: 'Lade einen Freund ein — Funken bei seinem Abo',
          songCounterLabel: 'Menschen haben sich selbst entdeckt',
          planFreeF1: 'Erster Song — eine Minute geschenkt', planFreeF2: 'Alle Formate',
          planBasicF1: '✦ 5 Lieder', planBasicF2: '✦ Soul Chat (50 Nachrichten)', planBasicF3: 'Bestellhistorie', planBasicSave: '−67% vs Einzelkauf',
          planPlusF1: '✦ 15 Lieder', planPlusF2: 'Soul Chat unbegrenzt', planPlusF3: 'Prioritätsverarbeitung', planFeatDiary: 'Orakel-Tagebuch — jeden Morgen eine Deutung', planPlusF4: 'Vollständige Titel-Historie', planPlusSave: '−72% vs Einzelkauf',
          planMasterF1: '✦ 30 Lieder', planMasterF2: 'Personenverzeichnis', planMasterF3: 'Generierungshistorie', planMasterF4: 'Soul Chat unbegrenzt', planMasterSave: '−83% vs Einzelkauf',
          perMonth: '/Mon.', iskryUnit: 'Funken', iskryStatEarned: 'Erhalten', iskryStatSpent: 'Ausgegeben', iskryBreakdownSongs: 'Lieder', iskryBreakdownChat: 'Soul Chat', planBasicPrice: '810 ₽', planPlusPrice: '2 030 ₽', planMasterPrice: '3 250 ₽',
          scPlanBasicDesc: '5 Lieder + Soul Chat', scPlanPlusDesc: '15 Lieder + Chat unbegrenzt', scPlanMasterDesc: '30 Lieder + Chat unbegrenzt',
          planPlusF5: 'Musikstil-Auswahl', planMasterF5: 'Musikstil-Auswahl',
          profileTracksThisMonth: 'Tracks im Paket', profileTracksRemaining: '{n} Tracks übrig',
          profileRenewalDate: 'Paket aktiv', planStatusActive: '✓ Aktiv', profileNextCharge: 'Nächste Abbuchung: {date}',
          profileCardNotLinked: 'Karte nicht verknüpft. Karte verknüpfen für vollständige Verwaltung.',
          profileBindCard: 'Karte verknüpfen', profileUnbindCard: 'Karte trennen', profileChangeCard: 'Karte wechseln', profilePaymentMethod: 'ZAHLUNGSART',
          profileActiveSubscription: 'Paket aktiv', profileCancelSubscription: 'Paket deaktivieren', profileSubCardLabel: 'Karte verknüpft',
          subCancelledGrace: 'Paket verwendet', subCancelledBadge: 'Verwendet', subReactivateBtn: 'Erneuern', profileSubExpires: 'Paket aktiv',
          subExpiredTitle: 'Paket verwendet', subExpiredMsg: 'Dein Paket {planName} wurde verwendet', subExpiredReactivate: '{planName} erneuern', subExpiredOrSingle: 'oder einzelnen Song kaufen',
          trackLimitUpgradeToPlus: 'Auf Plus upgraden — 15 Tracks', trackLimitUpgradeToMaster: 'Auf Labor upgraden — 30 Tracks',
          subExpiryBanner3d: 'Paket gilt noch {n} Tage', subExpiryBanner1d: 'Paket gilt noch 1 Tag', subExpiryManageBtn: 'Verwalten',
          iskryNotEnough: 'Du hast {current} Iskry. Brauchst noch {needed}', unlockIskryNeedPack: 'Dein erster Song öffnet sich mit einem Iskry-Paket. Wähle ein Paket — oder öffne ihn direkt', iskryNoneToast: 'Keine Iskry zum Bezahlen', iskryNeedTopup: 'Für die Zahlung brauchst du {needed} Iskry. Lade auf oder gib unten einen Promo-Code ein.', iskryNotEnoughFull: 'Nicht genug Iskry (brauchst {n}). Lade dein Guthaben auf oder gib einen Promo-Code ein.', iskryNotEnoughVk: 'Nicht genug Iskry (brauchst {n}). Lade dein Guthaben auf.', iskryNeedTopupVk: 'Für die Zahlung brauchst du {needed} Iskry. Lade dein Guthaben auf.', iskryPayRetry: 'Hat nicht geklappt. Versuch es erneut oder wähle eine andere Methode.', playLabel: 'Abspielen', pauseLabel: 'Pause', suPromoNoted: 'Code gespeichert — wird beim \u00d6ffnen angewendet', payAuthLost: 'Öffne die App erneut und versuch es noch mal.', payLinkCopied: 'Zahlungslink kopiert', iskryTopUpViaReferral: 'Lade einen Freund ein — Funken bei seinem Abo', iskryDepletedReferralHint: 'Keine Iskry mehr. Lade einen Freund ein!',
          soulChatExpiresIn: 'Zugang: noch {hours}Std {minutes}Min',
          formStep1: 'Schritt 1', formStep2: 'Schritt 2', formStep3: 'Schritt 3',
          refFriend1: 'Freund', refFriend2: 'Freunde', refFriend5: 'Freunde', refLinkLoading: 'Laden…',
          profileConnectedServices: 'Verbundene Dienste', profileLinkedLoading: 'Laden…',
          profileLinkTgBtn: 'Telegram verknüpfen', profileLinkGoogleBtn: 'Google verknüpfen',
          refEarningsLabel: 'Deine Funken:',
          refNextHintFirst: 'Für jeden Freund, der einen Song erstellt — 10 Funken',
          refNextHintNext: 'Für jeden Freund, der einen Song erstellt — 10 Funken',
          iskryTitle: 'Deine Funken',
          linkedStatusLinked: 'Verknüpft', linkedStatusNotLinked: 'Nicht verknüpft', linkedStatusNoData: 'Keine Daten', linkedStatusLoadFail: 'Laden fehlgeschlagen',
          linkedGoogleLinked: 'Google verknüpft!', linkedGoogleFail: 'Google konnte nicht verknüpft werden. Versuche es erneut.', linkedConnFail: 'Verbindung fehlgeschlagen. Prüfe dein Internet.',
          linkedTgOpenBot: 'Öffne den Bot in Telegram und tippe auf Start. Dann komm zurück und aktualisiere die Seite.',
          profileLinkTgHint: 'Tippe auf die Schaltfläche, dann im Bot auf Start zum Verknüpfen.',
          linkedGoogleSdkFail: 'Google Sign-In nicht verfügbar. Versuche es im Browser.',
          cancelSubFail: 'Paket konnte nicht deaktiviert werden. Versuche es erneut.',
          trackLimitTitle: 'Limit erreicht',
          trackLimitMsg: 'Dein Track-Limit für diesen Monat ist erreicht.',
          trackLimitHint: 'Upgrade deinen Tarif oder kaufe einen einzelnen Song.',
          trackLimitActionsTitle: 'Was nun?',
          trackLimitBuySingle: 'Einzelnen Song kaufen',
          trackLimitUpgrade: 'Paket upgraden',
          trackLimitPayIskry: 'Mit Iskry bezahlen',
          trackLimitBackToProfile: 'Zurück zum Profil',
          trackLimitPayHint: 'Paket-Limit erreicht. Bezahle für einen zusätzlichen Song.',
          labHintTitle: 'Labor',
          labHintDesc: 'Speichere Profile deiner Liebsten und wähle sie mit einem Tipp — keine Daten erneut eingeben',
          labHintGo: 'Mehr erfahren',
          labHintLater: 'Später',
          cancelSubSuccess: 'Paket aktiv',
          cancelSubSuccessNoDate: 'Paket aktiv',
          profileSubscriptionCancelled: 'Paket verwendet',
          cancelSubConfirm: 'Paket deaktivieren?\n\nZugang bleibt bis {date}, danach wechselt das Profil zum kostenlosen Tarif «Entdecker». Keine Rückerstattung für den bezahlten Betrag.',
          cancelSubConfirmNoDate: 'Paket deaktivieren?\n\nZugang bleibt bis zum Ende des bezahlten Zeitraums, danach wechselt das Profil zum kostenlosen Tarif «Entdecker». Keine Rückerstattung für den bezahlten Betrag.',
          cancelSubProgress: 'Wird gekündigt…',
          guestName: 'Gast',
          quickPickerLabel: '✦ Schnellanfragen',
          inboxTitle: 'Benachrichtigungen', inboxEmpty: 'Noch keine Benachrichtigungen', inboxOpen: 'Öffnen',
          forWhoLabel: 'Für wen generieren wir?', forWhoAddContact: '+ Kontakt hinzufügen', pickFromLab: 'Aus Labor wählen', pickFromLabSelected: 'Ausgewählt: ', pickFromLabEmpty: 'Keine gespeicherten Personen. Füge sie im Labor hinzu.', pickFromLabHint: 'Wähle eine Person aus dem Labor — Felder werden ausgefüllt.',
          coupleSrcMePerson: 'Ich + Person', coupleSrcCardCard: 'Karte + Karte', couplePerson1Label: 'Erste Person', couplePerson1Pick: 'Aus Labor wählen', couplePerson1Required: 'Wähle die erste Person aus dem Labor', coupleSelfCard: 'Ich',
          nameLbl: 'Name', birthdateLbl: 'Geburtsdatum', birthplaceLbl: 'Geburtsort', birthtimeLbl: 'Geburtszeit', birthtimeUnknownHint: 'Zeit unbekannt',
          payOvCardTitleDefault: 'Paket / Bestellung bezahlen', payOvTrialText: 'Nutze deine Funken!', payOvFreeClaimBtn: 'Mit Funken bezahlen — ' + ISKRY_PRICES.single_song + ' Funken',
          payOvPromoToggle: '▸ Haben Sie einen Code?', orPay: 'Oder bezahle:', priceLabel: 'Preis:',
          payOvLinkHint: 'Wenn sich das Fenster nicht öffnete — Link kopieren und im Browser einfügen:',
          payOvCopyBtn: 'Zahlungslink kopieren', payOvCheckBtn: 'Ich habe bezahlt — prüfen',
          payOvPromoConfirmBtn: 'Bestätigen und senden',
          paymentThanksTitle: 'Zahlung erfolgreich', paymentThanksMsg: 'Lied wird erstellt. Kommt im Bot-Chat an. Fenster kann geschlossen werden.',
          paymentThanksHintText: 'Nicht in 20 Min. angekommen? Schreib dem Bot „Lied nicht angekommen"',
          logoSubtitle: 'Musik-Orakel', homeBrand: 'MUSIK-ORAKEL',
          homeTeaser: 'In deinem Geburtsdatum verbirgt sich ein Geschenk — entdecke es durch ein Lied', homeTeaserHtml: 'In deinem <span class="tagline-glow">Geburtsdatum</span> verbirgt sich ein Geschenk — entdecke es durch ein <span class="tagline-glow">Lied</span><span class="tagline-underline"></span>',
          startBenefitAbout: 'Über dich', startBenefitCompat: 'Kompatibilität', startBenefitDaily: 'Song des Tages', startBenefitFinance: 'Finanzen',
          wlHeadline1: 'Songs nach deinem Geburtsdatum',
          wlHeadline2: 'für alle Momente des Lebens',
          wlPlaylistKick: 'Erstelle deine Playlist',
          wlPlaylistName: 'Hits über dich',
          wlPlaylistSub: 'nach Geburtsdatum · für jeden Anlass',
          wlTrack1Name: 'Ich bin keine Funktion, ich bin Leben',
          wlTrack1Desc: 'darüber, lebendig zu sein',
          wlTrack2Name: 'Hüterin der Schwelle',
          wlTrack2Desc: 'ein Geburtstagslied',
          wlTrack3Name: 'Für deine Liebe',
          wlTrack3Desc: 'ein Geständnis',
          wlLoginTitleHtml: 'Hör, wie <span class="home-card-title-accent">dein</span> Geburtsdatum klingt',
          wlProof: '3.000+ Songs bereits erstellt',
          loginVia: 'Anmelden über',
          review1: 'Das ist einfach fantastisch! Ernsthaft, ihr habt mich gelesen! Ein super Projekt!', reviewAuthor1: 'Roman',
          review2: 'Geil! Der Stil den ich liebe, die Worte gehen direkt ins Herz!', reviewAuthor2: 'Julia',
          review3: 'Woher konnte die KI von den Bauplänen, dem Kaffee, den Berichten wissen? Bravo!!!', reviewAuthor3: 'Gennady',
          review4: 'Die Dynamik hat mir sehr gefallen: von ruhig zu kraftvoll. Bestimmte Momente stimmen!', reviewAuthor4: 'Alexander',
          review5: 'Der erste ist ein Meisterwerk! Hat mich überrascht, 15 Mal gehört, an Mama geschickt.', reviewAuthor5: 'Wladimir',
          review6: 'Sehr schöner und leichter Song, man kann dabei richtig meditieren!', reviewAuthor6: 'Nutzer',
          homeServiceDesc: 'Der einzige Dienst, bei dem ein Lied durch tiefe Analyse deines Geburtsdatums entsteht.',
          homeChoicesHead: 'NUR HIER', homeChoicesHeadMain: 'Probier heute',
          homeChoiceMain1: 'Lied des Tages', homeChoiceMain2: 'Wer bin ich?', homeChoiceMain3: 'Star-Stil', homeChoiceMain4: 'Kompatibilität', homeChoiceMain5: 'Orakel-Tagebuch',
          // VK-Nativ (nur Orakel): Startseite, leere Playlist, Frage-Presets
          vkOracleHeroTitleHtml: 'Das Orakel kennt dein <span class="home-card-title-accent">Geburtsdatum</span> — und antwortet',
          vkOracleHeroCta: 'Frage stellen', vkOracleChoicesHead: 'Frag heute',
          vkOracleChoice1: 'Wer bin ich?', vkOracleChoice2: 'Meine Gabe', vkOracleChoice3: 'Geld', vkOracleChoice4: 'Liebe',
          vkOracleAskBtn: 'Das Orakel fragen',
          vkOracleEmptyTitle: 'Das Orakel beantwortet deine Fragen',
          vkOracleEmptyDesc: 'Frag nach dir selbst — nach deinem Geburtsdatum',
          vkOracleQ1: 'Sag mir, wer ich nach meinem Geburtsdatum bin — welchen Charakter habe ich und worauf kann ich mich stützen?',
          vkOracleQ2: 'Worin liegt meine Gabe nach meinem Geburtsdatum — was ist mir mitgegeben und wie entfalte ich es?',
          vkOracleQ3: 'Wie steht es nach meinem Geburtsdatum um Geld — wo ist mein Geldkanal und was öffnet ihn?',
          vkOracleQ4: 'Was sollte ich nach meinem Geburtsdatum über Liebe und Beziehungen wissen?',
          homeChoice1: 'Lied des Tages', homeChoice1Hint: 'Jeder Tag trägt einzigartige Energie. Entdecke deine durch Musik.',
          homeChoice2: 'Schnelles Lied über mich', homeChoice2Hint: 'Ein Klick — ein Lied nach deinem Geburtsdatum.',
          homeChoice3: 'Soul Chat', homeChoice3Hint: 'Dein persönlicher KI-Assistent basierend auf deinem Geburtsdatum.',
          homeChoice4: 'Geschenk für Freund', homeChoice4Hint: 'Überrasche jemanden mit einem einzigartigen Lied darüber, wie besonders er ist.',
          navSoulChat: 'Orakel', navHelp: 'Hilfe', navLab: 'Kontakte', navTracks: 'Playlist',
          navSoulChatFull: 'Orakel', navMyTracks: 'Playlist', navSoulChatShort: 'Orakel', navMyTracksShort: 'Playlist', myHeroesShort: 'Kontakte', myHelpShort: 'Hilfe',
          soulChatPageTitle: 'Seelengespräch | Soul Chat', scHeroTitle: 'Seelengespräch | Soul Chat',
          myTracksPageTitle: 'Musik', mtGlabelRecent: 'Letzte', mtCreateBtn: 'Neuen Song erstellen',
          myTracksPageSubtitle: 'Deine Sammlung von Klangschlüsseln',
          mtHeroBadge: 'Klangschlüssel',
          mtHeroTitle: 'Jedes Lied ist ein einzigartiger Schlüssel zu deiner Seele',
          mtHeroDesc: 'Hören, herunterladen und teilen. Alle deine Tracks sind hier dauerhaft gespeichert.',
          myTracksLoading: 'Tracks werden geladen…',
          mtEmptyTitle: 'Hier erscheinen deine Songs',
          mtEmptyDesc: 'Erstelle deinen ersten — anhand deines Geburtsdatums',
          mtEmptyCta: 'Lied erstellen',
          myTracksLoadMore: 'Mehr laden',
          mtNowPlayingTitle: 'Läuft gerade',
          mtNpFromCollection: 'Aus der Sammlung',
          mtTabTracks: 'Meine Tracks', mtTabLiked: 'Favoriten', mtTabRadio: 'Radio', mtSearchPh: 'Titel suchen', mtSearchAria: 'Suche', mtLikedEmpty: 'Tippe ♡ auf einen Track — er erscheint hier.', mtActPlay: 'Anhören', mtActShare: 'Teilen', mtHeroEyebrow: 'Deine Kollektion', mtHeroSub: 'Erstellt aus deinem Geburtsdatum', mtHeroPlayAll: 'Alle abspielen',
          mtActSpark: 'Funke', mtActText: 'Songtext', mtActAnalysis: 'Analyse', mtActDownload: 'Download', mtActShare: 'Teilen', mtActBroadcast: 'Senden', mtActGift: 'Verschenken', mtActResing: 'Mit eigenen Worten neu singen',
          shareSheetTitle: 'Song teilen', shareEyebrow: 'Mein Seelenlied', shareFootCreate: 'Erstelle dein eigenes', shareCardSub: 'Song nach deinem Geburtsdatum', shareFmtStory: 'Stories', shareFmtPost: 'Post', shareFmtLink: 'Link', shareCopyBtn: 'Kopie', shareSaveImg: 'Bild speichern', shareTgtLink: 'Link', shareTgtStory: 'Stories', shareTgtMore: 'Mehr', shareToVk: 'Zur VK-Story', shareToOk: 'Auf OK teilen', shareToWeb: 'Teilen', shareToTg: 'Zu Telegram', shareVkStory: 'Zur Story', shareVkWall: 'An die Pinnwand', shareHint: 'Schick den Link an einen lieben Menschen — er öffnet ihn und hört das ganze Lied.', shareCreateOwn: 'Erstelle dein eigenes Lied', shareCopied: 'Kopiert', shareRendering: 'Bild wird erstellt…', shareSaved: 'Bild gespeichert', shareSaveFail: 'Speichern fehlgeschlagen', karaokeTitle: 'Songtext', karaokeSub: 'Karaoke · Zeile für Zeile', diaryPwEyebrow: '3 Probetage — vorbei', diaryPwMsgFrom: 'YupSoul · deine Einstimmung', diaryPwMsgTime: 'heute Morgen', diaryPwMsgBody: 'Guten Morgen{name}. Heute ist ein Tag für **Halt und ruhige Entscheidungen**. Ein wichtiges Gespräch besser nicht vor dem Mittag überstürzen — danach läuft es leichter.', diaryPwMsgPin: 'Halt des Tages: ein warmes Gespräch mit einem lieben Menschen', diaryPwH: 'Hat dir dieser Start in den Tag gefallen?', diaryPwSub: 'Das ist dein Tagebuch. Jeden Morgen in Telegram — eine persönliche Nachricht, abgestimmt auf deinen Tag. Die Probetage sind vorbei — lass uns zusammen weitermachen.', diaryPwFeat1Title: 'Kommt in den Chat', diaryPwFeat1Desc: 'Jeden Morgen, zur von dir gewählten Zeit', diaryPwFeat2Title: 'Abgestimmt auf dein Datum', diaryPwFeat2Desc: 'Kein allgemeines Horoskop — eine Deutung nur für dich', diaryPwFeat3Title: 'Themen — deine Wahl', diaryPwFeat3Desc: 'Liebe, Beruf, Energie, Beziehungen', diaryPwPlan: 'Enthalten in den Paketen Tiefe und Labor', diaryPwCta: 'Tagebuch fortsetzen', karaokeEmpty: 'Songtext ist noch nicht verfügbar', prismOracleRetry: 'Das Orakel ist in Gedanken versunken. Versuch es noch einmal.',
          rdTitle: 'Radio', rdSubtitle: 'Endlose Wellen für deine Energie', rdOnAir: 'live', rdLiveNow: 'Live',
          rdYouLive: 'Du bist auf Sendung', rdPitchTitle: 'Sende deinen Song on air', rdPitchSub: 'Die ganze YupSoul-Community hört ihn — ein Live-Stream aus Seelensongs.', rdNowLive: 'Jetzt auf Sendung — ein Live-Community-Stream', rdLiveTitle: 'Dein Song spielt für alle', rdReady: 'bereit', rdYourSong: 'dein Song', rdV1t: 'Live gehört werden', rdV1s: 'Dutzende Menschen sind gerade auf Sendung', rdV2t: 'Funken für Reaktionen', rdV2s: 'Hörer liken — du bekommst Funken', rdV3t: 'Komm in die Wochen-Top', rdV3s: 'Die ganze Community sieht die besten Songs', rdRewardHtml: 'Ein Song auf Sendung <b>verdient Funken</b> — und Funken werden zu neuen Songs deiner Seele.', rdGo: 'Auf Sendung geben', rdGoHint: 'Du kannst ihn jederzeit von der Sendung nehmen', rdLeave: 'Von Sendung nehmen', rdLeaveHint: 'Dein Song läuft im gemeinsamen YupSoul-Radio-Stream', rdStatListens: 'Wiedergaben', rdStatHearts: 'Likes', rdStatSparks: 'Funken verdient', rdReactHint: 'Hörer reagieren auf deinen Song', rdRankTop: 'Top der Woche', rdRankWave: 'Welle', rdRankOf: 'von', rdRankClimb: 'Sammle Likes — steig in die Wochen-Top',
          rdSongOfDay: 'Lied des Tages', rdSongOfDaySub: 'Energie des Tages', rdNowListening: 'Hört gerade', rdWaves: 'Wellen',
          rdCosmos: 'Kosmos', rdCosmosTag: 'Tiefes Ambient', rdDuo: 'Zwei Seelen', rdDuoTag: 'Über Liebe & Bindung',
          rdFlow: 'Fluss', rdFlowTag: 'Geld & Bewegung', rdCalm: 'Stille Kraft', rdCalmTag: 'Meditation & Ruhe',
          rdGroza: 'Gewitter', rdGrozaTag: 'Laut & kraftvoll', rdListen: 'hören', rdAllWaves: 'alle ›',
          rdQuiet: 'ruhig im Äther', rdSomeone: 'Jemand', rdBeFirst: 'Ruhe im Äther — sei der Erste', rdEmpty: 'Diese Welle füllt sich noch', rdRadioArtist: 'YupSoul · Radio', rdShareToRadio: 'Im Radio teilen', rdInRadio: 'Ans Radio gesendet', rdShareDone: 'Zur Prüfung ans Radio gesendet', rdShareOff: 'Aus dem Radio entfernt',
          rwMood: 'Nach Stimmung', rwTender: 'Zärtlichkeit', rwPower: 'Kraft', rwLight: 'Licht', rwFlight: 'Flug', rwCalm: 'Ruhe',
          rdWaveAll: 'Alle Wellen', rdFresh: 'Frisch im Äther', rdTopWeek: 'Top der Woche', rdNowOnAir: 'Jetzt im Äther', rdAnon: 'Anonym', rdToday: 'heute', rdYesterday: 'gestern', rdLike: 'Gefällt mir', rdSave: 'Speichern', rdListen2: 'Hören', rdListensNow: 'hört', rdEmpty2: 'Noch hat niemand einen Song auf dieser Welle veröffentlicht. Sei der Erste — im Tab „Meine Titel“.', rdSavedTitle: 'Gespeichert', rdSavedEmpty: 'Hier erscheinen Radio-Songs, die du speicherst. Tippe das Lesezeichen an.', rdSavedToast: 'Zur Sammlung hinzugefügt', rdUnsavedToast: 'Aus der Sammlung entfernt', mtTabSaved: 'Gespeichert', navCancel: 'Abbrechen', rdMore: 'Mehr', rdReport: 'Melden', rdBlockAuthor: 'Diesen Autor ausblenden', rdSheetCancel: 'Abbrechen', rdReportSent: 'Danke, wir schauen es uns an', rdReportHidden: 'Titel aus dem Äther genommen', rdBlockDone: 'Wir zeigen diesen Autor nicht mehr', rdActionFailed: 'Hat nicht geklappt — versuch es nochmal', errReportSelf: 'Das ist dein eigenes Lied', errBlockSelf: 'Das ist dein eigenes Lied', errTrackNotFound: 'Titel nicht gefunden',
          pubInEther: 'Auf Sendung', pubTitle: 'Im Radio veröffentlichen', pubSubtitle: 'Andere Hörer hören deinen Song. Du kannst ihn jederzeit aus dem Äther nehmen.', pubWave: 'Welle', pubShowAuthor: 'Autorennamen zeigen', pubAnon: 'Anonym', pubGo: 'Veröffentlichen', pubDoneTitle: 'Dein Song ist im Äther!', pubDoneText: 'Andere Hörer finden ihn jetzt im Radio.', pubYou: 'Du', pubFail: 'Veröffentlichung fehlgeschlagen',
          mngOnAir: 'Im Äther', mngManage: 'Sendung verwalten', mngManageText: 'Hörer können ihn liken und speichern.', mngListeners: 'Gehört', mngLikes: 'Likes', mngCollections: 'In Sammlungen', mngOpenRadio: 'Im Radio öffnen', mngUnpublish: 'Aus dem Äther nehmen', mngUnpubDone: 'Aus dem Äther genommen', mtTrackDeleted: 'Lied gelöscht', mtUndo: 'Rückgängig',
          errTrackNotReady: 'Titel ist noch nicht fertig', errRadioWave: 'Wähle eine Welle', errRadioProfanity: 'Dieser Song enthält Schimpfwörter — er kann nicht in den öffentlichen Äther', errTasteLockedRadio: 'Schalte den Song zuerst ganz frei — dann kannst du ihn senden',
          mtSelectTrack: 'Track wählen',
          mtDownload: 'Herunterladen',
          mtLyrics: 'Text',
          mtShare: 'Teilen',
          mtLinkCopied: 'Link kopiert',
          mtNoTitle: 'Lied der Seele',
          mtModeSingle: 'Für mich',
          mtModeCouple: 'Für zwei',
          mtModeTransit: 'Tagesenergie', mtPlayError: 'Wiedergabe fehlgeschlagen', mtLyricsTitle: 'Songtext', mtAnalysisTitle: 'Analyse', mtCopied: 'Kopiert', mtCopyFail: 'Kopieren fehlgeschlagen', mtCopyBtn: 'Kopieren', mtCloseBtn: 'Schließen', mtDownloading: 'Wird geöffnet...', mtShareFail: 'Teilen fehlgeschlagen', mtLinkCopied: 'Link kopiert',
          dlUnlockTitle: 'Holen wir deinen Song? 🎵', dlUnlockSub: 'Wähle, wie du ihn behältst — nur ein warmer Schritt 🤍', dlUnlockJoin: 'Beitreten und herunterladen', dlUnlockOr: 'oder eine kleine Aufgabe', dlUnlockShare: 'Song teilen', dlUnlockReview: 'Bewertung hinterlassen', dlUnlockReviewPh: 'Ein paar warme Worte zur App…', dlUnlockReviewSend: 'Senden und herunterladen', dlUnlockUpsell: 'Mit Paket — Downloads ohne Aufgaben.', dlUnlockClose: 'Später', dlChecking: 'Einen Moment, ich prüfe…', dlDone: 'Fertig, lädt herunter', dlTryAgain: 'Sehe es noch nicht — versuch es nochmal', dlReviewShort: 'Ein bisschen mehr — und fertig',
          dlGateTitle: 'Song herunterladen', dlGateEyebrow: 'Dein erster Song', dlGateHeadline: 'Hol dir deinen Song als Geschenk', dlGateLead: 'Erledige eine Aufgabe unten — und die Songdatei wird auf deinem Gerät gespeichert. So wachsen wir gemeinsam.', dlGateSteps: 'Schritte zum Freischalten', dlGateAltB: 'Keine Aufgaben?', dlGateAltRest: 'Hol dir ein Paket — lade beliebige Songs ohne Schritte.', dlGatePacks: 'Pakete ›', dlGateLocked: 'Erledige eine Aufgabe zum Download', dlGateReady: 'Song herunterladen', dlGateHint: 'Die Datei wird als MP3 auf deinem Gerät gespeichert', dlDoneTitle: 'Song heruntergeladen 🤍', dlDoneTextRest: 'wurde auf deinem Gerät gespeichert. Danke, dass du dabei bist — es kommt noch viel Musik.', dlTrackFallback: 'Seelensong', dlTrackSub: 'Seelensong', dlTaskVkTitle: 'Der Community beitreten', dlTaskVkSub: 'YupSoul auf VK', dlTaskVkAct: 'Beitreten', dlTaskShareTitle: 'Song teilen', dlTaskShareSub: 'Erzähl Freunden von YupSoul', dlTaskShareAct: 'Teilen', dlTaskReviewTitle: 'Bewertung abgeben', dlTaskReviewSub: 'Ein paar warme Worte zur App', dlTaskReviewAct: 'Schreiben',
          myTracksWipTitle: 'Seite in Entwicklung',
          myTracksWipText: 'Deine Tracks erscheinen hier bald. Du kannst jetzt ein Lied erstellen oder das Seelengespräch öffnen.',
          profileMyTracks: 'Meine Tracks',
          footerSubManage: 'Pakete verwalten', footerOffer: 'AGB', footerPrivacy: 'Datenschutz',
          webLoginOr: 'Oder', webLoginTelegram: 'In Telegram öffnen', googleSignIn: 'Mit Google anmelden',
          webLoginTeaser: 'Melde dich mit Google an, um personalisierte Lieder zu erstellen. Oder öffne die App in Telegram.',
          bsPromoToggle: 'Ich habe einen Gutscheincode',
          bsChooseMethod: 'Zahlungsmethode wählen:',
          bsPayCard: 'Mit Karte bezahlen',
          payTitle: 'Bezahlung des Songs', paySecure: 'Geschützt', cfTitle: 'Zahlungsbestätigung', successEyebrow: 'Zahlung erhalten', successEyebrowTaste: 'Dein erstes Lied', successReceiptName: 'Seelenlied', successReceiptSub: 'in Arbeit', successMaking: 'Das Orakel schreibt deine Melodie…', successAskOracle: 'Das Orakel fragen, während du wartest', successShare: 'Mit einem Liebsten teilen', successReadyLine: 'Fast fertig — erscheint in deiner Playlist', successNotifyBtn: 'Benachrichtigen, wenn fertig', successNotifyDone: 'Wir melden uns in VK ✓', successReadyTitle: 'Fertig — dein<br>Lied entsteht', successReadyLead: "Danke! <b>Dein Seelenlied</b> entsteht — es erscheint in etwa 15 Minuten im Playlist-Tab.", cfSub: 'Prüfe die Details — und wir bestätigen.', cfWhat: 'Kauf', cfIncludes: 'Enthalten', cfTotal: 'Zu zahlen', cfPay: 'Bestätigen und bezahlen', payOrderEyebrow: 'Deine Bestellung', payOrderMeta: 'Ein einzigartiger Track nach deinem Datum · kommt in ~15 Minuten in Telegram an', payPriceLabel: 'Zu zahlen', payPriceSub: 'Einmalige Zahlung · ein Song', payByIskry: 'Mit Funken bezahlen', payByPromo: 'Ich habe einen Promo-Code', payPromoSub: 'Code eingeben — wir übernehmen die Kosten', pmTitle: 'Promo-Code eingeben', pmSub: 'Wir übernehmen die Kosten oder schreiben Funken gut.', pmBack: 'Zurück zur Zahlung', promoLen3to50: 'Promo-Code muss 3 bis 50 Zeichen lang sein', payRetry: 'Bitte versuche es erneut.', promoChecking: 'Promo-Code wird geprüft...', payTrustSecure: 'Sichere Zahlung', payTrustHold: 'Bestellung 7 Tage gespeichert', payOvBack: 'Zurück',
          bsPayStars: 'Mit Sternen bezahlen',
          bsTopupIskry: 'Funken aufladen', tuPack100: '= 1 Lied', giftVkUnavail: 'Dieses Geschenk kann in dieser App-Version nicht geöffnet werden',

          bsDiscount: 'Rabatt',
          bsGotIt: 'Verstanden',
          bsClose: 'Schließen',
          bsPaymentNotOpened: 'Wenn sich die Zahlungsseite nicht geöffnet hat — tippe auf „Link kopieren" und öffne ihn im Browser.',
          bsPaymentAccepted: 'Zahlung akzeptiert.<br><br>Du kannst dieses Fenster schließen und zu Telegram zurückkehren — das Lied kommt im Bot-Chat.',
          bsDiscountApplied: 'Rabatt: {amount} {currency}',
          bsPromoNotFound: 'Gutscheincode nicht gefunden',
          bsPromoExpired: 'Gutscheincode abgelaufen',
          bsPromoLimit: 'Nutzungslimit erreicht',
          bsPromoInvalid: 'Ungültiger Gutscheincode',
          bsPromoCheckError: 'Überprüfungsfehler',
          bsPromoApplied: 'angewendet',
          bsFree: 'Kostenlos',
          bsConfirm: 'Bestätigen',
          bsConnectingBank: 'Verbindung zur Bank…',
          bsPaymentCreateError: 'Zahlung konnte nicht erstellt werden. Versuche eine andere Methode.',
          bsTracksPerMonth: 'persönliche Tracks',
          navBack: 'Zurück', navClose: 'Schließen', loading: 'Laden…', btnRefresh: 'Aktualisieren', btnSave: 'Speichern', btnCancel: 'Abbrechen', btnSending: 'Wird gesendet…', btnSaving: 'Wird gespeichert…', btnOpening: 'Wird geöffnet…', btnUnlinking: 'Wird getrennt…',
          helpPageTitle: 'Hilfe & Support',
          phName: 'Name (optional)', phBirthplace: 'Moskau, London, New York...', phName2: 'Name (optional)', phBirthplace2: 'Moskau, London, New York...', nameHintEmpty: 'Gib einen Namen ein — er wird im Lied gesungen.', nameHintFilled: 'Dieser Name wird im Lied gesungen. Lösche ihn, wenn du ihn nicht hören willst.', phTransitDate: 'TT.MM.JJJJ', phTransitTime: 'HH:MM', phTransitLocation: 'Moskau, London, New York...', phRequest: 'Zum Beispiel: über den Mut, neu anzufangen', phPreferredStyle: 'Genre oder Musikstimmung',
          phProfileName: 'Dein Name', phDateDisplay: 'tt Monat jjjj', phProfileCity: 'Geburtsstadt', phPromoInput: 'Gutscheincode eingeben',
          heroesAddBtn: '+ Person hinzufügen', heroesCountWord: 'Personen', heroNamePh: 'Name der Person', heroBirthplacePh: 'Moskau, London, New York...', heroStylePh: 'Pop, Jazz, Elektronisch…', heroNotesPh: 'Was ist wichtig über diese Person',
          heroEditTitle: 'Person bearbeiten', heroAddTitle: 'Person hinzufügen', confirmUnsavedExit: 'Sie haben ungespeicherte Änderungen. Verlassen?',
          heroSaveFail: 'Speichern fehlgeschlagen. Versuche es erneut.', heroDeleteFail: 'Löschen fehlgeschlagen. Versuche es erneut.',
          heroIncomplete: 'Geburtsdatum oder -ort dieser Person fehlen. Öffne die Karte und vervollständige.',
          errHeroIncomplete: 'Der ausgewählten Person fehlen Daten. Ergänze Geburtsdatum und -ort im Labor.',
          errMissingFields: 'Bitte gib dein Geburtsdatum an — ohne geht das Lied nicht.',
          errVkSongsOracleOnly: 'Hier arbeitet das Orakel — stell ihm eine Frage über dich.', errClaimLocked: 'Der Funke des Tages ist noch nicht verfügbar.', errClaimAlready: 'Den heutigen Funken hast du schon geholt — komm morgen wieder.',
          vkFormStubHint: 'Die Lied-Generierung ist auf dieser Plattform nicht verfügbar',
          diarySaved: 'Tagebuch eingerichtet!',
          diaryTrialStarted: '3-Tage-Testversion aktiviert!',
          diaryActivateFail: 'Aktivierung fehlgeschlagen. Versuche es erneut.',
          profileBalanceTitle: 'Mein Guthaben',
          errGenderRequired: 'Geschlecht darf nicht leer sein. Wähle Weiblich oder Männlich.',
          errInvalidGender: 'Ungültiger Geschlechtswert. Erlaubt: Weiblich oder Männlich.',
          today: 'Heute',
          scAskOracle: 'Das Orakel fragen',
          fillProfileCta: 'Profil ausfüllen',
          diaryContinueInChat: 'Im Chat fortsetzen',
          heroGenHistory: 'Generierungsverlauf', heroLyricsLabel: 'Songtext', heroAnalysisBtn: 'Analyse', heroLetterBtn: 'Begleitschreiben', heroListenBtn: 'Anhören',
          noInternet: 'Kein Internet',
          partnerTitle: 'Partner-Dashboard', partnerStatusActive: 'Aktiv', partnerBalUnit: 'Funken · ungenutzt', partnerStatsTitle: 'Statistik', partnerPromoTapCopy: 'Text kopieren', partnerPromoTapDone: 'Kopiert', partnerDashFootNote: 'Wöchentliche Auszahlungen', partnerApplyNamePh: 'Dein Name', partnerApplySocialsPh: '@username, Kanal-Links', partnerApplyPlanPh: 'Wie planst du Nutzer zu gewinnen',
          partnerApplySubmit: 'Bewerbung senden', partnerApplySent: 'Bewerbung gesendet! Wir prüfen sie und benachrichtigen dich.',
          partnerApplyPending: 'Bewerbung wird geprüft', partnerApplyPendingDesc: 'Wir prüfen deine Bewerbung und benachrichtigen dich über Telegram.',
          partnerApplyRejected: 'Bewerbung nicht genehmigt', partnerApplyNameReq: 'Gib deinen Namen ein', partnerApplySocialsReq: 'Gib deine Social Media ein',
          partnerDashWalletPh: 'Zahlungsdaten', partnerDashWalletReq: 'Gib deine Zahlungsdaten ein',
          partnerDashNoAccruals: 'Noch keine Gutschriften', partnerDashPayoutProcessing: 'Auszahlungsantrag wird bearbeitet',
          partnerDashPayoutSubmit: 'Auszahlung anfordern', partnerDashPayoutSent: 'Auszahlungsantrag gesendet!',
          partnerDashCodeSaved: 'Code gespeichert!', partnerDashCodeMinLen: 'Mindestens 3 Zeichen',
          partnerDashOpenTg: 'Öffne die App über Telegram',
          partnerDashSendError: 'Sendefehler', partnerDashRetryLater: 'Versuche es später erneut',
          partnerApplyPageTitle: 'Partnerprogramm', partnerHowItWorks: 'So funktioniert es',
          partnerStepApply: 'Bewerbung einreichen', partnerStepApproval: 'Genehmigung', partnerStepShare: 'Link teilen', partnerStepBonus: 'Boni erhalten',
          partnerEarnHeadingHtml: 'Verdiene mit <span style="display:inline-block;background:linear-gradient(120deg,#f472b6 0%,#ec4899 22%,#a78bfa 45%,#f97316 70%,#fbbf24 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 12px rgba(236,72,153,0.35));animation:accentGradientShift 6s ease-in-out infinite;">YupSoul</span>',
          partnerEarnDescHtml: 'Lade Freunde ein und erhalte einen <strong style="color:var(--primary-color);">20% Bonus in Funken</strong> von jedem Paket deiner Empfehlungen. Auszahlung auf Anfrage einmal pro Woche.',
          partnerSparksPerMonth: 'Funken / Mo', partnerTierSoul: 'Seele', partnerTierDepth: 'Tiefe', partnerTierLab: 'Labor',
          partnerBonusNoteHtml: 'Boni werden in Funken gutgeschrieben<br>Auszahlung auf Anfrage einmal pro Woche',
          partnerHeroTitleHtml: 'Verdiene zusammen mit <span class="pa-grad">YupSoul</span>',
          partnerHeroSub: 'Lade Freunde ein und erhalte einen Anteil an jedem ihrer Abos — in Funken.',
          partnerStatCapHtml: '<b>in Funken</b> von jedem Paket deiner Empfohlenen — bei jedem Kauf',
          partnerStep1Title: 'Bewirb dich', partnerStep1Sub: 'Erzähl uns von dir und deinen Kanälen',
          partnerStep2Title: 'Werde freigegeben', partnerStep2Sub: 'Wir prüfen und öffnen den Zugang',
          partnerStep3Title: 'Teile deinen Link', partnerStep3Sub: 'Lade Freunde zu YupSoul ein',
          partnerStep4Title: 'Erhalte Boni', partnerStep4Sub: 'Funken tröpfeln von jedem Paket',
          partnerTiersTitle: 'Wie viel du pro Paket bekommst', partnerTiersNote: 'Der Bonus wird von jedem Paket gutgeschrieben, das dein Empfohlener kauft',
          partnerPayoutTitle: 'So wirst du ausgezahlt',
          partnerPfSparks: 'Funken', partnerPfSparksSub: 'sammeln sich', partnerPfPayout: 'Auszahlung', partnerPfPayoutSub: 'einmal pro Woche',
          partnerPayoutFreq: 'einmal pro Woche', partnerPayoutFreqSub: 'Auszahlungen', partnerPayoutMin: 'ab 100 000', partnerPayoutMinSub: 'Funken zur Auszahlung',
          partnerApplyFormHeading: 'Partner-Bewerbung', partnerApplyFormSub: 'Erzähl uns von dir — wir öffnen den Zugang zum Programm.',
          partnerApplyBtn: 'Bewerben',
          partnerNameLabelHtml: 'Dein Name <span style="color:var(--primary-color);">*</span>',
          partnerSocialsLabelHtml: 'Social Media / Kanäle <span style="color:var(--primary-color);">*</span>',
          partnerPlanLabel: 'Dein Promotionsplan',
          partnerAgreeTextHtml: 'Ich habe die <a href="#" onclick="document.getElementById(\'partnerAgreementBlock\').style.display=document.getElementById(\'partnerAgreementBlock\').style.display===\'none\'?\'block\':\'none\';return false;" style="color:var(--primary-color);text-decoration:underline;">Bedingungen des Partnerprogramms</a> gelesen und akzeptiere sie',
          partnerFaqTitle: 'Häufige Fragen',

          partnerFaq2Q: 'Wann erfolgen Auszahlungen?', partnerFaq2A: 'Auszahlungsanträge werden während der Woche gesammelt und einmal pro Woche in einer Sammelauszahlung verarbeitet.',
          partnerFaq3Q: 'Was ist das Minimum für eine Auszahlung?', partnerFaq3A: 'Minimum sind 100.000 Funken. Die Auszahlung beantragst du im Partner-Dashboard.',
          partnerFaq4Q: 'Wie wird der Bonus berechnet?', partnerFaq4A: '20% Bonus in Funken wird von jedem Paket des Empfohlenen gutgeschrieben. Seele — 1.980, Tiefe — 4.980, Labor — 7.980 Funken.',
          partnerLegalTitle: 'Bedingungen des Partnerprogramms',
          partnerLegalBodyHtml: '<p style="font-weight:700;margin-bottom:6px;">1. Allgemeine Bestimmungen</p><p>1.1. Diese Vereinbarung regelt die Teilnahme am Partnerprogramm des Dienstes YupSoul (nachfolgend — die Plattform).</p><p>1.2. Ein Partner ist ein Nutzer, dessen Bewerbung von der Plattformverwaltung genehmigt wurde.</p><p>1.3. Mit der Einreichung einer Bewerbung bestätigen Sie, dass Sie die Bedingungen dieser Vereinbarung gelesen haben und ihnen zustimmen.</p><p style="font-weight:700;margin:12px 0 6px;">2. Teilnahmebedingungen</p><p>2.1. Zur Teilnahme muss eine Bewerbung über das Formular in der App eingereicht werden.</p><p>2.2. Die Verwaltung behält sich das Recht vor, eine Bewerbung ohne Begründung zu genehmigen oder abzulehnen.</p><p>2.3. Der Partnerstatus kann jederzeit bei Verstoß gegen die Vereinbarung widerrufen werden.</p><p style="font-weight:700;margin:12px 0 6px;">3. Bonusprogramm</p><p>3.1. Der Partner erhält einen 20%-Bonus in Funken von jedem Abonnement, das über seinen Empfehlungslink abgeschlossen wird.</p><p>3.2. Boni werden in Funken (interne Währung der Plattform) bei jeder Abo-Verlängerung gutgeschrieben.</p><p>3.3. Bonusbeträge nach Tarif: Seele — 1.980 Funken/Mo, Tiefe — 4.980 Funken/Mo, Labor — 7.980 Funken/Mo.</p><p>3.4. Die Plattform behält sich das Recht vor, Bonusbeträge mit vorheriger Benachrichtigung der Partner zu ändern.</p><p style="font-weight:700;margin:12px 0 6px;">4. Auszahlungen</p><p>4.1. Mindestauszahlungsbetrag: 100.000 Funken.</p><p>4.2. Der Auszahlungsantrag wird im Partner-Dashboard gestellt; die Auszahlung erfolgt über die mit dem Partner vereinbarten Zahlungsdaten.</p><p>4.3. Auszahlungsanträge werden während der Woche gesammelt und einmal pro Woche verarbeitet.</p><p>4.4. Die Plattform kann einen Auszahlungsantrag bei Betrugsverdacht ablehnen.</p><p style="font-weight:700;margin:12px 0 6px;">5. Pflichten des Partners</p><p>5.1. Der Partner verpflichtet sich, die Plattform redlich und ohne irreführende Informationen zu bewerben.</p><p>5.2. Verboten: Spam-Mailings, gefälschte Registrierungen, Erstellung fiktiver Konten, Verwendung diffamierender Inhalte.</p><p>5.3. Der Partner ist eigenverantwortlich für die Steuerzahlung auf erhaltene Einkünfte gemäß den Gesetzen seines Landes.</p><p style="font-weight:700;margin:12px 0 6px;">6. Haftung</p><p>6.1. Die Plattform garantiert kein bestimmtes Einkommen für den Partner.</p><p>6.2. Bei Feststellung betrügerischer Handlungen wird der Partnerstatus widerrufen und angesammelte Mittel können eingefroren werden.</p><p>6.3. Die Plattform haftet nicht für Handlungen des Partners gegenüber Dritten.</p><p style="font-weight:700;margin:12px 0 6px;">7. Änderung der Bedingungen</p><p>7.1. Die Plattform kann die Bedingungen dieser Vereinbarung ändern und die Partner über Telegram benachrichtigen.</p><p>7.2. Die fortgesetzte Teilnahme am Programm nach Benachrichtigung bedeutet Zustimmung zu den neuen Bedingungen.</p><p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.7rem;">Veröffentlicht: 22. März 2026</p>',
          partnerDashHeaderHtml: 'Partner <span style="background:linear-gradient(135deg,var(--primary-color),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">YupSoul</span>',
          partnerDashBonusLine: 'Bonus: 20% in Funken',
          partnerLinksLabel: 'Deine Empfehlungslinks', partnerCopy: 'Kopieren', partnerShareMsg: 'Erstelle einen persönlichen Song aus deinem Geburtsdatum. YupSoul — Musik, die nach dir klingt', partnerLinksLoading: 'Links werden noch geladen', partnerShare: 'Teilen',
          partnerLinkLanding: 'Landingpage', partnerLinkPartnerPage: 'Partnerseite',
          partnerCodeLabel: 'Persönlicher Code', partnerCodeExample: 'Beispiel: ANNA_MUSIC — dein Link wird ...?start=ref_ANNA_MUSIC',
          partnerPromoTitle: 'Fertige Promo-Texte',
          partnerPromoText1: 'YupSoul — personalisierte Musik basierend auf deinem Geburtsdatum. Einzigartige Tracks, die nur für dich klingen. Probiere es aus — 100 Funken als Willkommensgeschenk!',
          partnerPromoText2: 'Verschenke einen einzigartigen Song an einen besonderen Menschen! YupSoul erstellt persönliche Tracks basierend auf dem Geburtsdatum — ein perfektes Geschenk, das nicht wiederholt werden kann.',
          partnerPromoCopyHint: 'Text antippen zum Kopieren',
          partnerQrTitle: 'QR-Code deines Links', partnerSaveQr: 'QR speichern', partnerQrHint: 'Für Offline-Werbung verwenden',
          partnerStatInvited: 'Eingeladen', partnerStatPaid: 'Gekauft', partnerConversion: 'Konversion',
          partnerMinPayoutLabel: 'Minimum für Auszahlung', partnerMinPayoutValue: '100.000 Funken',
          partnerWalletLabel: 'Auszahlungsdaten',
          partnerEarningsTitle: 'Einnahmenhistorie', partnerPayoutsTitle: 'Auszahlungshistorie',
          paymentConfirmed: 'Zahlung bestätigt!', songCanClose: 'Du kannst die App schließen — nichts geht verloren.',
          successWhileWaiting: 'Während du wartest', successNewSong: 'Neuer Song',
          songNotArrived: 'Nicht angekommen in 20 Min? Schreib dem Bot „Lied nicht angekommen".', goToBot: 'Zum Bot',
          songCreating: 'Dein Lied wird generiert.', songUsually: 'Normalerweise 10-15 Minuten.',
          ptTariffActivated: 'Tarif aktiviert!', ptWelcomeTo: 'Willkommen bei', ptTracksAndChat: 'Tracks und Soul Chat verfügbar.', ptGoHome: 'Startseite',
          ptScOpened: 'Soul Chat geöffnet!', ptScAccess: '24 Stunden Zugang', ptScConfirmed: 'Zahlung bestätigt. Du kannst mit dem Chat beginnen.', ptGoSc: 'Zum Soul Chat',
          ptSongInQueue: 'Lied in Warteschlange', ptSongCreating: 'Dein Lied wird erstellt. Das Ergebnis kommt im Bot.',
          payOvCardBtn: 'Mit Karte bezahlen', payOvRubHint: 'bei Kartenzahlung', payOvOrIskry: 'oder {amount} Funken',
          toastCardLinked: 'Karte verknüpft', toastCardLinkFail: 'Karte konnte nicht verknüpft werden. Versuche es erneut.',
          toastConnFail: 'Verbindung fehlgeschlagen. Prüfe deine Verbindung.',
          toastCardUnlinked: 'Karte getrennt.', toastCardUnlinkFail: 'Karte konnte nicht getrennt werden. Versuche es erneut.',
          toastSubActivated: 'Paket aktiviert!', toastScOpened: 'Soul Chat für 24 Stunden geöffnet',
          toastPayFail: 'Zahlung konnte nicht erstellt werden', toastConnError: 'Verbindungsfehler',
          toastActivateFail: 'Aktivierung fehlgeschlagen. Versuche es erneut.', toastMasterTrialUsed: 'Probetag bereits verwendet', toastAuthLost: 'Öffne die App erneut, um fortzufahren.', toastNoChanges: 'Keine Änderungen',
          toastConnRetry: 'Verbindung fehlgeschlagen. Prüfe Verbindung und versuche es erneut.',
          toastScExpired: 'Zugriffszeit abgelaufen — öffne Soul Chat erneut',
          toastIskryCharged: '{amount} Funken abgezogen',
          toastReferralCreditUsed: 'Empfehlungs-Guthaben verwendet',
          toastEntitlementUsed: 'Gekaufter Track verwendet',
          toastTrialUsed: 'Geschenk-Track aktiviert',
          toastSubscriptionUsed: 'Im Paket verbucht',
          toastPromoUsed: 'Promo-Code angewendet',
          toastOpenInTg: 'Öffne die App vom Bot in Telegram.',
          toastPayOpenTg: 'Bezahlung auf dieser Plattform nicht verfügbar',
          vkSupportLinkCopied: 'Link zur YupSoul-Community kopiert: {url}',
          vkSupportLink: 'Unsere YupSoul-Community: {url}',
          vkTabletTitle: 'Auf Smartphone oder PC öffnen',
          vkTabletText: 'YupSoul ist für Smartphones und Desktop optimiert. Auf einem Tablet funktioniert die Oberfläche möglicherweise nicht korrekt — öffne YupSoul bitte auf deinem Smartphone oder auf vk.com im Browser.',
          vkTabletCommunity: 'Unsere YupSoul-Community',
          okSupportLinkCopied: 'Link zur YupSoul-Gruppe kopiert: {url}',
          okSupportLink: 'Unsere YupSoul-Gruppe auf Odnoklassniki: {url}',
          toastSubsOnDesktop: 'Bezahlung auf dieser Plattform nicht verfügbar',
          toastUpdateTg: 'Zum Bezahlen aktualisiere Telegram auf Version 6.1 oder höher.',
          toastPromoApplied: 'Gutscheincode angewendet! Analyse verfügbar',
          toastFirstSubmit: 'Sende zuerst eine Song-Anfrage', toastShareForward: 'Ein Telegram-Weiterleitungsfenster wird geöffnet',
          toastLinkCopiedFriend: 'Link kopiert — sende ihn einem Freund!',
          toastWelcomeIskry: 'Du hast {amount} Funken erhalten — willkommen!',
          toastUpdateTgStars: 'Für Stars-Zahlung aktualisiere Telegram auf Version 6.9 oder höher.',
          toastInvoiceFail: 'Rechnung konnte nicht erstellt werden. Versuche es erneut.',
          toastFillForm: 'Fülle zuerst das Anfrageformular aus.', toastIskryPaid: 'Funken abgezogen — Lied in Arbeit!', toastSubPaid: 'Analyse bezahlt!',
          mtAuthExpired: 'Sitzung abgelaufen. Seite aktualisieren oder erneut anmelden.', mtLoadError: 'Liste konnte nicht geladen werden. Prüfe dein Internet.', mtPlayRetry: 'Wiedergabe fehlgeschlagen. Versuche es in einer Minute erneut.',
          mtCreatingSong: 'Dein Lied wird erstellt...', mtUsuallyTime: 'Normalerweise 10-15 Minuten. Erscheint in „Meine Tracks".',
          mtGenDelayed: 'Generierung verzögert. Prüfe „Meine Tracks" später.',
          mtAnalyzing: 'Karte wird analysiert…', mtWritingLyrics: 'Songtext wird geschrieben…', mtShapingSound: 'Der Klang entsteht…', mtRecording: 'Musik wird aufgenommen…',
          mtGenFailed: 'Lied konnte nicht erstellt werden', mtGenFailedDesc: 'Bei der Generierung ist ein Fehler aufgetreten. Erstelle eine neue Anfrage oder kontaktiere den Support.',
          scGreeting: 'Hallo, ich bin dein Orakel 🤍 Frag mich alles: über dich, deinen Weg, deine Beziehungen. Ich bin da.',
          ctxSelfBtn: 'Über mich', ctxCompatBtn: 'Kompatibilität',
          ctxSub: 'Über wen sprechen wir heute — das Orakel behält es im Gespräch.',
          scPairPickTitle: 'Ihr beide', scPairPickSub: 'Paar-Deutung — wie ihr zusammen klingt.',
          ctxModeOne: 'Eine Karte', ctxModeCompat: 'Kompatibilität',
          ctxYou: 'Du', ctxYourChart: 'dein Geburtsdatum', ctxMeBadge: 'das bist du', ctxAddPerson: 'Person hinzufügen', ctxPlankLabel: 'Kontext gesetzt', ctxPlankOne: 'über {name}', ctxPlankPair: 'das Paar {a} & {b}', ctxPlankPrism: 'deine Analyse „{title}“',
          ctxHintPickOne: '<b>Wähle eine Karte</b> — das Orakel spricht über diese Person.',
          ctxHintOneSelected: 'Der Chat dreht sich um eine Person.',
          ctxHintPickTwo: '<b>Wähle zwei</b> — das Orakel ergründet ihre Kompatibilität.',
          ctxApply: 'Anwenden', ctxApplyOne: 'Anwenden · {name}', ctxApplyPair: 'Paar deuten · {a} & {b}',
          scCopy: 'Kopieren', scCopied: 'Kopiert',
          diaryEntryTitle: 'Tagesdeutung',
          yesterday: 'Gestern',
          scPrismWord: 'Deutung', scPrismBackToList: 'Zurück zu den Deutungen', diaryWaitTitle: 'Deine Deutung ist unterwegs', diaryWaitText: 'Kommt um {time} — in einer Nachricht.', diaryFeedEarlier: 'Früher', diaryFeedCount: '{n} Deutungen', diaryThemesTitle: 'Worüber schreiben wir', diaryThemesHint: '1–3 Themen', diaryStreakLine: '{n} Tage in Folge', diaryPickLine: 'Kommt um {time} · eine Nachricht pro Tag', diaryHeadTitle: 'Tagebuch', diaryHeadSub: 'Jeden Tag eine kurze Deutung — auf deine Karte und auf den Tag', diaryStatConversations: 'Deutungen', diaryStatDays: 'Tage in Folge', diaryStatTopics: 'Themen',
          scChipLonely: 'Ich fühle mich einsam', scChipBurnout: 'Ich bin ausgebrannt', scChipSelflove: 'Wie liebe ich mich selbst?',
          scQaLabel: 'Womit fangen wir an', scQaKtoyaT: 'Wer bin ich wirklich?', scQaKtoyaS: 'Mich tiefer verstehen', scQaKtoyaQ: 'Wer bin ich wirklich? Hilf mir, mich tiefer zu verstehen.', scQaTrevogaT: 'Ich bin unruhig', scQaTrevogaS: 'Aussprechen und durchatmen', scQaTrevogaQ: 'Ich bin unruhig. Ich möchte es aussprechen und durchatmen.', scQaReshenieT: 'Hilf mir entscheiden', scQaReshenieS: 'Meine Antwort finden', scQaReshenieQ: 'Hilf mir, eine Entscheidung zu treffen und meine Antwort zu finden.', scQaPodderzhkaT: 'Bleib bei mir', scQaPodderzhkaS: 'Wenn ich Halt brauche', scQaPodderzhkaQ: 'Bleib bei mir. Ich brauche etwas Halt.',
          scOracleFreeLeft: 'Geschenkfragen: {n} von 10', scOracleIskryMode: '1 Frage = 1 Funke · du hast {n}', scOracleNeedIskry: 'Deine Geschenkfragen sind aufgebraucht. Ab jetzt 1 Frage = 1 Funke — hol dir deinen täglichen Funken unter Geschenke oder lade auf.', scOracleGetIskry: 'Funken holen', scOracleFreeWarn: 'Dir bleiben noch 3 Geschenkfragen. Danach kommt jeden Tag ein Funke — einer reicht für eine neue Frage.', scWallTitle: 'Deine Geschenkfragen sind aufgebraucht. Ab jetzt kostet eine Frage einen Funken.', scWallTitleClaim: 'Deine Geschenkfragen sind aufgebraucht. Hol dir den Funken des Tages — einer reicht für eine neue Frage.', scWallTitleDone: 'Den heutigen Funken hast du schon. Der nächste kommt morgen.', scWallClaimedMsg: 'Der Funke gehört dir — frag einfach.', scWallGoGifts: 'Geschenke öffnen', scPrismNeedIskryVk: 'Noch nicht genug Funken. Den heutigen bekommst du unter Geschenke.', scWallClaimBtn: 'Funken des Tages holen', scWallJoinBtn: 'Der Community beitreten', scWallNote: 'In der Community erscheint jeden Morgen die Deutung des Tages. Fürs Beitreten schreiben wir 30 Funken gut.', scWallClaimDone: 'Der Funke gehört dir', scWallPrismText: 'Eine große Deutung über dich ist schon offen — „Name der Seele“. Lies sie.', scWallNoteLow: 'Funken sammeln sich unter Geschenke — schau täglich vorbei.',
          scPlaceholder: 'Was beschäftigt dich?', scHistoryEmpty: 'Deine letzten Anfragen erscheinen hier', scHistoryToggle: 'Verlauf',
          bannerPendingSub: 'Ausstehendes Paket', bannerPendingSubDesc: 'Zahlung noch nicht bestätigt. Setze die Tarifeinrichtung fort.',
          bannerPendingIskry: 'Deine Anfrage wartet!', bannerPendingIskryDesc: 'Nutze Funken — erstelle dein Lied.',
          bannerPendingOrder: 'Ausstehende Bestellung', bannerPendingOrderDesc: 'Du hast eine Anfrage, die auf Zahlung wartet.',
          valNameMin: 'Name muss mindestens 2 Zeichen haben', valBirthdate: 'Geburtsdatum wählen',
          valBirthplace: 'Geburtsort muss mindestens 3 Zeichen haben',
          valBirthtime: 'Geburtszeit eingeben oder „Weiß nicht" ankreuzen', valGender: 'Geschlecht wählen',
          appUpdating: 'Die App braucht eine Aktualisierung', payOvDefault: 'Zahlung', payOvPaymentReq: 'Anfragezahlung',
          linkedOpenBrowser: 'Öffne den Link im Browser und verknüpfe Google dort.',
          linkedConnFail: 'Melde dich mit Google an und aktualisiere die Seite',
          scQuickBuyDay: '24-Stunden-Zugang — 2,99 $',
          iskryPaySuccess: 'Funken abgezogen — Lied in Arbeit!', iskryPayingProgress: 'Funken werden abgezogen...', iskryPayingStatus: 'Funken werden abgezogen und Generierung startet...',
          paymentRequiredHint: 'Für die Erstellung eines Liedes ist eine Zahlung erforderlich.',
          processing: 'Wird verarbeitet...',
          payCopyFail: 'Kopieren fehlgeschlagen',
          paymentPageIntroOrPay: 'Geben Sie einen Promo-Code ein oder wählen Sie unten eine Zahlungsart.',
          trackLimitResubmitHint: 'Formular ausfüllen und absenden — der Zahlungsbildschirm öffnet sich.',
          paymentThanksOk: 'Fertig!',
          apiNotConfigured: 'API-Adresse nicht konfiguriert. Öffne die App über den Server-Link.',
          btnGoHome: 'Startseite', btnClose: 'Schließen', btnDone: 'Fertig', btnSave: 'Speichern',
          btnApply: 'Anwenden', btnShare: 'Teilen', btnCopied: 'Kopiert!', btnBack: '← Zurück',
          btnMore: 'Mehr', btnFind: 'Suchen', btnRefresh: 'Aktualisieren', btnTry: 'Ausprobieren',
          btnActivateFree: 'Kostenlos aktivieren', btnActivating: 'Aktivierung...',
          btnConfirmAndSend: 'Bestätigen und senden', btnConfirming: 'Bestätige...',
          btnCreateSong: 'Mein Lied erstellen', btnCreateMore: 'Noch einen Track erstellen',
          btnTrySoulChat: 'Soul Chat testen', btnInviteFriend: 'Freund einladen',
          btnGoToPayment: 'Zur Zahlung', btnContinueSub: 'Paket-Zahlung fortsetzen',
          btnReceiveInTg: 'Lieder in Telegram empfangen', btnPickFromLab: 'Aus dem Labor wählen',
          btnGet24hFree: '24 Stunden kostenlos', btnBindCard: 'Karte verknüpfen',
          btnUnbindCard: 'Karte lösen', btnChoosePlan: 'Plan wählen', btnSettings: '⚙ Einstellungen',
          payCheckingPayment: 'Zahlung wird geprüft…', payWaitingBank: 'Warten auf Bankbestätigung. Normalerweise einige Sekunden.',
          payWaitingConfirm: 'Warten auf Bestätigung…', payNoData: 'Keine Daten zur Prüfung. Status wird im Profil aktualisiert.',
          payReceived: 'Zahlung eingegangen. Zugangsaktivierung wird geprüft…',
          payReturnHome: 'Du kannst zur Startseite zurückkehren — Status wird aktualisiert.',
          payBankNotConfirmed: 'Bank hat noch nicht bestätigt. Falls abgebucht — keine Sorge, es wird berücksichtigt.',
          payBankNotConfirmedRetry: 'Bank hat die Zahlung noch nicht bestätigt. Versuche es später.',
          payConfirmedPlan: 'Zahlung bestätigt. Plan „{plan}" ist aktiv.',
          payAnalysisPaid: 'Analyse bezahlt!', payAnalysisAvailable: 'Jetzt kannst du eine detaillierte Analyse deines Liedes erhalten.',
          payDeepAnalysis: 'Tiefenanalyse', payNotConfirmed: 'Zahlung nicht bestätigt',
          payContactSupport: 'Hat nicht geholfen? Schreib dem Support.', payCheckFailed: 'Zahlungsstatus konnte nicht geprüft werden. Versuche es später.', payCheckTakesTimeTitle: 'Zahlung wird geprüft', payCheckTakesTime: 'Falls das Geld abgebucht wurde, schicken wir dir die Bestätigung in Telegram. Du kannst zur Startseite zurück.',
          paySoulChatOpened: 'Soul Chat geöffnet!', payConfirmedChat: 'Zahlung bestätigt. Du kannst jetzt chatten.',
          payToSoulChat: 'Zum Soul Chat', payCreatingLink: 'Link wird erstellt…',
          payCreatingInvoice: 'Rechnung wird erstellt…', payPromoApplied: 'Promo-Code angewendet!',
          payPaid: 'Bezahlt!', payOpeningPayment: 'Zahlung wird geöffnet…',
          payConnectingBank: 'Verbindung zur Bank…', payByCard: 'Mit Karte bezahlen',
          payLoading: 'Laden…', payAlreadyPaidCheck: 'Ich habe schon bezahlt — prüfen',
          payChecking: 'Prüfe...', payPaidByCardCheck: 'Mit Karte bezahlt — prüfen',
          payFormNotOpened: 'Falls das Zahlungsformular nicht geöffnet wurde — Link kopieren:',
          payCopyLink: 'Zahlungslink kopieren', payCopied: 'Kopiert ✓',
          payPlanActivated: 'Plan „{plan}" aktiviert!',
          formEnterName: 'Name eingeben', formNoAuth: 'Nicht autorisiert',
          formSaving: 'Speichern…', formDataSaved: 'Daten gespeichert ✓',
          formSaveError: 'Speicherfehler', formEnterPromo: 'Promo-Code eingeben', promoActivated: 'Promo-Code aktiviert!', promoNotFound: 'Promo-Code nicht gefunden', promoExpired: 'Promo-Code abgelaufen', promoUsedUp: 'Promo-Code nicht mehr gültig', promoAlreadyActivated: 'Promo-Code bereits aktiviert', promoDiscountWord: 'Rabatt',
          formPromoError: 'Prüfung fehlgeschlagen. Versuche es später.', formSecondPerson: 'Zweite Person',
          selectDay: 'Tag', selectMonth: 'Monat', selectYear: 'Jahr',
          labelName: 'Name', labelBirthdate: 'Geburtsdatum', labelBirthplace: 'Geburtsort',
          labelBirthtime: 'Geburtszeit', labelDontKnow: 'Weiß nicht', labelGender: 'Geschlecht',
          labelCity: 'Stadt', labelPlan: 'Tarif',
          genderMale: 'Männlich', genderFemale: 'Weiblich', genderSelect: 'Wählen',
          formStep1: 'Schritt 1', formStep2: 'Schritt 2', formStep3: 'Schritt 3',
          formYourData: 'Deine Daten', formDataNeeded: 'Benötigt für personalisierte Liedtexte',
          formCityHint: 'Beginne eine Stadt einzugeben und wähle aus der Liste.',
          formTimeUnknown: 'Zeit unbekannt', formSongLang: 'Liedsprache', formLangTooltip: 'Sprache des Liedtextes und der Analyse',
          formAnalysisLang: 'Sprache der Analyse', formLangTooltipNoLyrics: 'Sprache deiner Analyse und deines Briefes',
          lyricsHeading: 'Stimme des Liedes', lyricsSubtitle: 'Soll es Worte haben?',
          lyricsSung: 'Mit Text', lyricsSungDesc: 'Wir singen dein Lied',
          lyricsInstrumental: 'Nur Musik', lyricsInstrumentalDesc: 'Melodie aus deinem Datum',
          lyricsOwn: 'Eigener Text', lyricsOwnDesc: 'Wir singen, was du schreibst',
          phCustomLyrics: 'Schreib deine Zeilen — wir singen sie',
          customLyricsHint: 'Schreib, wie du es fühlst, Strophen und Refrain gliedern wir selbst. Ein Lied von drei Minuten braucht etwa 45 Zeilen. Solche Lieder bleiben nur bei dir — sie gehen nicht auf Sendung.', charsShort: 'Zeichen', customLyricsShortWarn: 'für drei Minuten braucht es etwa 1400 — so wird es kürzer', customLyricsEnough: 'reicht für ein volles Lied',
          alertCustomLyrics: 'Schreib den Liedtext — wenigstens ein paar Zeilen',
          errCustomLyricsShort: 'Schreib den Liedtext — wenigstens ein paar Zeilen',
          errCustomLyricsProfanity: 'Hier stehen Worte, die wir nicht singen können',
          errRadioOwnLyrics: 'Lieder auf eigenen Text bleiben bei dir — wir senden sie nicht',
          birthDateTooltip: 'Geburtsdatum auswählen', birthTimeTooltip: 'Geburtszeit auswählen',
          formMePlusHuman: 'Ich + Person', formCardPlusCard: 'Karte + Karte',
          formPickFromLabHint: 'Wähle eine Person aus dem Labor — Felder werden automatisch ausgefüllt',
          formTransitMode: 'Energie des Tages', formTransitDate: 'Ereignisdatum',
          formTransitTime: 'Ereigniszeit', formTransitCity: 'Stadt für die Energie des Moments',
          formRequestLabel: 'Was erforschst du heute?', formQuickPicks: '✦ Schnellauswahl',
          formForWho: 'Für wen generieren?', formForSelf: 'Für mich',
          styleManual: 'Manuell eingeben', styleAstro: 'Planetenklang', styleStar: 'Künstler-Stil',
          styleStarHint: 'Künstlername, Songtitel oder Filmsoundtrack eingeben...',
          styleQuickLabel: '✦ Musikstile',
          stylePresetPop: 'Pop', stylePresetRock: 'Rock', stylePresetRap: 'Rap / Hip-Hop',
          stylePresetElectronic: 'Elektronik / Techno / House',
          stylePresetAmbient: 'Ambient / Meditativ', stylePresetAcoustic: 'Akustik / Piano / Ballade',
          langRussian: 'Russisch', langUkrainian: 'Ukrainisch',
          oracleThinking: 'Orakel denkt', oracleGenerating: 'Analyse wird erstellt, warte ~30 Sekunden',
          oracleExample: 'BEISPIELANALYSE', oracleGenerateFail: 'Generierung fehlgeschlagen. Fülle dein Geburtsdatum im Profil aus.',
          oracleConnError: 'Verbindungsfehler. Versuche es später.', oracleViewAnother: 'Anderes Beispiel ansehen',
          oracleConfiguring: 'Einrichten...', oracleStart3Days: 'Start — 3 Tage kostenlos', oracleOnboardingRetry: 'Hat nicht geklappt. Versuche es erneut.',
          oracleLoadFail: 'Laden fehlgeschlagen.', oracleDiaryReply: 'Antwort',
          toastNetworkError: 'Netzwerkfehler — versuche es erneut', toastSaved: 'Gespeichert', toastError: 'Fehler',
          toastAnalysisAvailable: 'Analyse bereits verfügbar — schreib dem Bot',
          toastOrderFail: 'Bestellung konnte nicht erstellt werden. Versuche es später.',
          statusNoRequests: 'Keine verfügbaren Anfragen', loading: 'Laden...',
          noSavedPeople: 'Keine gespeicherten Personen.', noEarningsYet: 'Noch keine Einnahmen',
          subConnecting: 'Verbinden…', subTrialPeriod: 'Testzeitraum',
          subTrial1Day: '1 Tag kostenlos — testen',
          scAccessRemaining: 'Zugang: noch {h}Std {m}Min', scOpenFor30: 'Für 30 Funken öffnen',
          scSelectCard: 'Karte auswählen...', scContextSelf: 'Über dich', scHistoryDivider: '✦ Chatverlauf ✦',
          scDemoMode: 'DEMO-MODUS',
          successTitle: 'Anfrage angenommen!', successDesc: 'Dein Lied wird generiert.',
          successBotHint: 'Drücke Start im Bot — künftige Lieder kommen direkt in Telegram',
          successWhileWaiting: 'Während du wartest', successMoreSong: 'Noch ein Lied',
          footerOffer: 'AGB', footerPrivacy: 'Datenschutz', footerSubManage: 'Pakete verwalten',
          navOracle: 'Orakel', navPlaylist: 'Playlist', navContacts: 'Kontakte', navHelp: 'Hilfe',
          heroesTitle: 'Labor', heroFormTitle: 'Held hinzufügen',
          mtTitle: 'meine Playlist', mtEmpty: 'Noch keine Tracks',
          mtEmptyDesc: 'Erstelle deinen ersten — anhand deines Geburtsdatums',
          mtLoadMore: 'Mehr laden',
          mtAudioRefreshFail: 'Track konnte nicht geladen werden. Bitte später erneut versuchen.',
          mtPendingTitle: 'Song wird erstellt…', mtPendingStuckTitle: 'Song konnte nicht erstellt werden', mtPendingStuckSub: 'Support kontaktieren — wir erstatten Funken', mtAnalysisPending: 'Die Auswertung wird noch erstellt. Schau in ein paar Minuten wieder vorbei.', mtShuffleNeedTracks: 'Du brauchst mindestens 2 Songs zum Mischen',
          mtPendingSub: 'Fertig in 5–15 Minuten',
          diarySetupTitle: 'Richte dein Tagebuch ein',
          diaryTopicCareerLabel: 'Karriere', diaryTopicCareerDesc: 'Entscheidungen und Finanzen',
          diaryTopicRelationshipsLabel: 'Beziehungen', diaryTopicRelationshipsDesc: 'Dynamik mit Nahestehenden',
          diaryTopicHealthLabel: 'Gesundheit', diaryTopicHealthDesc: 'Energie und Körper',
          diaryTopicGrowthLabel: 'Wachstum', diaryTopicGrowthDesc: 'Gewohnheiten und Entwicklung',
          diaryTopicCreativityLabel: 'Kreativität', diaryTopicCreativityDesc: 'Inspiration',
          diaryTopicTransformationLabel: 'Veränderungen', diaryTopicTransformationDesc: 'Transformation',
          diaryTopicPurposeLabel: 'Weg', diaryTopicPurposeDesc: 'Sinn und Mission',
          diaryTopicPeaceLabel: 'Ruhe', diaryTopicPeaceDesc: 'Balance und Halt', diarySetupEyebrow: 'Orakel-Tagebuch', diaryPickedTpl: '{n} von 3 ausgewählt', diaryPickAtLeastOne: 'Wähle mindestens ein Thema', diaryEnableBtn: 'Tagebuch aktivieren', diaryFootNote: 'Die Analyse kommt am Morgen — Themen jederzeit änderbar',
          shareSheetTitle: 'Lied teilen', shareEyebrow: 'Mein Seelenlied', shareFootCreate: 'Erstelle dein Lied', shareFmtStory: 'Stories', shareFmtPost: 'Beitrag', shareFmtLink: 'Link', shareCopyBtn: 'Kopie', shareSaveImg: 'Bild speichern', shareTgtLink: 'Link', shareTgtStory: 'Stories', shareTgtMore: 'Mehr',
          vkDoorTitle: 'Eine Tür in eine Welt neuer Emotionen — öffne sie mit dem Musik-Orakel', vkDoorBody: 'Ein Funke ist eine Frage an das Orakel: über deinen Tag, deine Beziehungen, über das, was dich nicht loslässt. Ich erinnere jeden Morgen ans Abholen und schreibe, wenn dein Lied geboren ist. Im Profil abschaltbar.', vkDoorYes: 'Tür öffnen', vkDoorNo: 'Später', consentBonus: '+5 Funken für Benachrichtigungen', consentTitle: 'Bleib in Kontakt', consentTextVk: 'Ein Funke ist eine Frage an das Orakel: über deinen Tag, deine Beziehungen, über das, was dich nicht loslässt. Ich erinnere dich jeden Morgen ans Abholen: +2 pro Tag, +10 für eine ganze Woche. Eine Nachricht pro Tag, im Profil abschaltbar.', consentTextTg: 'Aktiviere Benachrichtigungen — jeden Morgen den Funken des Tages und eine Nachricht, wenn dein Lied fertig ist. Nur Wichtiges, kein Spam.', consentTextWeb: 'Benachrichtigungen kommen in Telegram. Öffne den Bot — ich schreibe dir, wenn dein Lied fertig ist, und schenke dir den Funken des Tages.', consentBtnVk: 'Benachrichtigungen erlauben', consentBtnTg: 'Benachrichtigungen aktivieren', consentBtnWeb: 'In Telegram öffnen', consentLater: 'Später', consentLegalHtml: 'Mit der Zustimmung akzeptierst du die <u>Newsletter-Bedingungen</u>. Du kannst dich jederzeit abmelden.', consentTermsBody: 'Wir schreiben nur, wenn es zählt: eine Nachricht, wenn dein Song fertig ist, jeden Morgen ein Funke des Tages und seltene Service-News. E-Mail höchstens einmal pro Woche. Abmelden jederzeit — per Schaltfläche im Profil oder Link in der E-Mail. Deine Kontaktdaten geben wir nicht weiter und nutzen sie nicht für Fremdwerbung.',
          oracleOptinTitle: 'Morgens bei dir vorbeischauen?', oracleOptinDesc: 'Während dein Lied entsteht, kann ich dir jeden Morgen eine kurze Deutung schicken: was heute im Fokus steht, wo du Kraft sparen kannst, wo dein Moment ist.', oracleOptinYes: 'Ja, schick es', oracleOptinNo: 'Nicht jetzt', oracleOptinNote: '3 Tage geschenkt. Jederzeit abschaltbar.', oracleOptinDone: 'Fertig — ich schaue morgen vorbei.',
          diarySetupDesc: 'Wähle 1-3 Themen. Jeden Morgen — eine persönliche Tagesanalyse.',
          diaryDeliveryTime: 'Zustellzeit', diaryReceiveDaily: 'Tägliche Analysen erhalten',
          diaryTopics: 'Themen', diaryTrialEnded: 'Testzeitraum beendet',
          diaryTrialEndedDesc: 'Abonniere Tiefe oder Labor für tägliche Analysen.',
          diaryFirstArrival: 'Deine erste Analyse kommt zur gewählten Zeit.',
          oracleTabChat: 'Chat', oracleTabDiary: 'Tagebuch',
          settingsTitle: 'Einstellungen',
          scHeroTitle: 'Herzgespräch | Soul Chat',
          scPromoText: 'Soul Chat — dein KI-Assistent, der dich tiefgehend versteht.',
          scGoToChat: 'Zum Chat →', scMoreDetails: 'Mehr Details ↓',
          scStat1: 'berichten von weniger Angst', scStat2: 'fühlen sich verstanden',
          scStat3: 'finden schneller Antworten', scStat4: 'kommen wieder',
          scExTitle: 'Beispielfragen',
          scEx1: '„Warum fällt es mir so schwer, über meine Gefühle zu sprechen?"',
          scEx2: '„Was ist meine größte Angst und wie gehe ich damit um?"',
          scEx3: '„Was ist meine Bestimmung und wie erreiche ich sie?"',
          scGiftHeading: 'Probiere Soul Chat — 24 Stunden', scGiftNote: 'Einmal pro Nutzer',
          scSubIncluded: 'Soul Chat im Paket enthalten',
          scChoosePlan: 'Tarif wählen →', scOpenFor24h: 'Soul Chat für 24h öffnen',
          scPayByCard: 'Karte (T-Bank) — 199 ₽',
          scPickerTitle: 'Chat-Kontext', scPickerSingle: 'Eine Karte',
          scPickerSynastry: 'Kompatibilität (2 Karten)',
          scPickerCardA: 'Karte A', scPickerCardB: 'Karte B',
          scNoRequestTitle: 'Wir brauchen deine Daten',
          scNoRequestText: 'Soul Chat baut ein persönliches Gespräch auf deinen Daten auf.',
          scSynastryTeaser: 'Kompatibilität — ein Dialog basierend auf zwei Geburtsdaten.',
          scOpenPlan: 'Tarif öffnen →', scSelectLabel: 'Wählen...',
          scPromoError: 'Paket nehmen oder 24-Stunden-Zugang kaufen',
          profilePromo: 'Ich habe einen Promo-Code',
          profilePromoTitle: 'Mir wurde ein Promo-Code geschenkt',
          profilePromoSub: 'Aktiviere ihn — erhalte Bonus-Funken',
          profilePromoSectionTitle: 'Promo-Code',
          profileLoadError: 'Profil konnte nicht geladen werden',
          profileInvited: 'Eingeladen', profileActivated: 'Aktiviert', profileIskry: 'Funken',
          profileEarningsLabel: 'Deine Funken:', profileEarningsHint: 'Funken können für Lieder und Funktionen verwendet werden',
          profileListenDownload: 'Tracks anhören und herunterladen', profileCreateSongBtn: 'Erstelle dein Lied',
          profileNoCard: 'Keine Karte verknüpft. Verknüpfe eine Karte für vollständige Verwaltung.',
          relSelect: '— wählen —', relMother: 'Mutter', relFather: 'Vater', relDaughter: 'Tochter', relSon: 'Sohn',
          relSister: 'Schwester', relBrother: 'Bruder', relGrandmother: 'Großmutter', relGrandfather: 'Großvater',
          relHusband: 'Ehemann', relWife: 'Ehefrau', relPartner: 'Partner',
          relFriend: 'Freund', relGirlfriend: 'Freundin', relColleague: 'Kollege',
          relMentor: 'Mentor', relOther: 'Andere',
          heroDateHint: 'Tag, Monat und Jahr wählen',
          optional: 'optional', heroIntro: 'Aus dem <b>Geburtsdatum</b> stellt das Orakel ein persönliches Lied und Deutungen zusammen.', heroRelPartner: 'Partner:in', heroRelDaughter: 'Tochter', heroRelSon: 'Sohn', heroRelMom: 'Mama', heroRelDad: 'Papa', heroRelFriendM: 'Freund', heroRelFriendF: 'Freundin', heroRelMentor: 'Mentor', heroRelOther: 'Andere', heroPlaceHint: 'Tippe eine Stadt ein und wähle aus der Liste.', heroNoTime: 'Genaue Zeit unbekannt', heroSexSkip: 'Keine Angabe',
          wguLabel: 'Während dein Lied erstellt wird', wguTitle: 'Erfahre, was dein Geburtsdatum über dich sagt',
          wguPrice: 'Tiefenanalyse — 40 Funken', wguBtn: 'Analyse erhalten', daDeepDesc: 'Tieftranskription — eine umfassendere Analyse unter Berücksichtigung von Ort und Zeit deiner Geburt: dein Wesen, Stärken und Wachstumsbereiche, wichtige Lebensthemen und Phasen, und die in deinen Song eingebettete Bedeutung. In Worten, persönlich für dich.',
          payThanksTitle: 'Zahlung erhalten', payThanksSubtitle: 'Anfrage angenommen',
          payThanksDesc: 'Dein Lied wird bereits generiert. Normalerweise 10–15 Minuten.',
          payThanksAfsTitle: 'Dein Funke leuchtet', payThanksAfsSubtitle: 'Bereit, tiefer zu gehen?',
          payThanksHint: 'Nicht angekommen in 20 Minuten? Schreib dem Bot „Lied nicht angekommen"',
          statusRequestAccepted: 'Anfrage angenommen', statusSongCreating: 'Lied wird erstellt. Es kommt im Bot-Chat. Du kannst das Fenster schließen.',
          qrSaved: 'QR gespeichert ✓',
          heroesPromoHeading: 'Persönlicher Arbeitsbereich für Praktiker',
          heroesPromoDesc: 'Füge Personen einmal hinzu — und generiere Lieder für sie mit einem Tipp.',
          heroesPromoFeatures: 'Was enthalten ist:', scBuyDayNote: 'Noch nicht bereit für ein Paket? Teste den Einzelzugang',
          homeTeaserHtml: 'In deinem <span class="tagline-glow">Geburtsdatum</span> verbirgt sich ein Geschenk, entdecke es durch ein <span class="tagline-glow">Lied</span>',
          payOvSubtitle: 'Dein persönliches Lied', payOvCardTitleSingle: 'Persönliches Lied',
          payOvCardTitleCouple: 'Lied für zwei', payOvCardTitleTransit: 'Energie des Tages',
          payOvCardTitleAnalysis: 'Textanalyse', payOvCardTitleSc: 'Seelengespräch — 24 Stunden',
          payOvSubtitleSingle: 'Dein persönliches Lied', payOvSubtitleCouple: 'Ein Lied für euch beide',
          payOvSubtitleTransit: 'Energie deines Tages', payOvSubtitleAnalysis: 'Tiefenanalyse',
          payOvSubtitleSc: 'Soul Chat für 24 Stunden', payOvSubtitleDefault: 'Dein Lied',
          payOvPromoApplied: 'Promo-Code angewendet', payOvFreeGen: '— Generierung geschenkt',
          payOvIskryHint: 'oder {amount} Funken', payOvPriceHint: 'bei Kartenzahlung',
          payOvUpsellLabel: 'Günstiger im Paket', payOvUpsellBtn: 'Paket nehmen',
          payOvUpsellPackTitle: 'Paket „Seele" — 5 Songs', payOvUpsellFeat1: '5 Songs statt einem', payOvUpsellFeat2: 'Orakel-Chat inklusive', payPackPerSong: '/Song', payPackPerVote: ' Stimmen/Song',
          payOvOfferText: 'Mit der Zahlung stimmen Sie den', payOvOfferLink: 'AGB zu',
          payOvPromoConfirmBtn: 'Bestätigen und senden',
          confirmTitle: 'Anfrage angenommen!',
          confirmDesc1: 'Deine Daten werden analysiert und ein einzigartiges Lied erstellt.',
          confirmDesc2Bot: 'Das Lied kommt in diesen Chat. Du kannst die App schließen — nichts geht verloren.',
          confirmDesc2Web: 'Das Lied erscheint unter „Meine Tracks". Du kannst die App schließen — nichts geht verloren.',
          confirmContinueBtn: 'Weiter →',
          planConfirmPay: 'Bezahlen', planConfirmCancel: 'Abbrechen',
          profileLogout: 'Abmelden', profileOfferLink: 'AGB',
          monthJan: 'Januar', monthFeb: 'Februar', monthMar: 'März', monthApr: 'April',
          monthMay: 'Mai', monthJun: 'Juni', monthJul: 'Juli', monthAug: 'August',
          monthSep: 'September', monthOct: 'Oktober', monthNov: 'November', monthDec: 'Dezember',
          createSong: 'Lied erstellen',
          csWhileWaiting: 'Während du wartest', csMyTracks: 'Meine Tracks', csInvite: 'Einladen', csNewSong: 'Noch ein Lied',
          genStage1: 'Lese dein Geburtsdatum', genStage2: 'Erkunde, wie deine Sterne klingen', genStage3: 'Finde die passenden Worte', genStage3NoLyrics: 'Suche deinen Klang', genStage4: 'Komponiere die Musik',
          mtUpsellTitle: 'Das ist erst der Anfang', mtUpsellText: 'Gefällt dir, wie deine Seele klingt? Schenke einem lieben Menschen einen Song — Mama, Partner, Freund.', mtUpsellCreate: 'Noch einen erstellen', mtUpsellSub: 'Mehr Songs — ein Paket kaufen',
          iskraClaimTitle: 'Funke des Tages', iskraClaimTextCan: 'Schau täglich vorbei und hol dir einen Funken 🤍 Damit kannst du das Orakel alles über dich fragen.', iskraClaimTextDone: 'Der heutige Funke gehört dir 🤍 Komm morgen für einen neuen wieder.', iskraClaimStreak: 'Serie: {n}', iskraClaimBtn: 'Funken holen', iskraClaimBtnDone: 'Morgen wieder',
          navGifts: 'Geschenke', navMenuGifts: 'Geschenke', giftsTitle: 'Geschenke', giftsSubtitle: 'Schau täglich vorbei — hol dir deinen Funken', giftsExplainer: 'Jeden Tag wartet hier ein Funke auf dich — einfach fürs Vorbeischauen 🤍 Einer reicht, um das Orakel über dich zu fragen, und hundert ergeben einen ganzen Song über dich.', iskraValueTitle: 'Wofür Funken da sind', iskraValueQuestion: 'Frag das Orakel alles über dich — das ist ein Funke', iskraValueSong: 'Sammle hundert — und ein Song deiner Seele entsteht', iskraValueCta: 'Das Orakel fragen', giftsEmptyHint: 'Erstelle deinen ersten Song — und hier öffnet sich der tägliche Funken 🤍', iskraClaimErr: 'Der Funke wurde nicht gutgeschrieben, dein Guthaben blieb unverändert.', iskraClaimRetry: 'Erneut versuchen', iskraCookieFrom: 'Die Botschaft des Orakels für heute', giftsProgLabel: 'im Guthaben', giftsBalanceTopup: 'Funken-Guthaben — aufladen', giftsFirstRunTitle: 'Der Funke des Tages öffnet sich nach dem ersten Song', giftsFirstRunSub: '+2 Funken pro Tag, nach 7 Tagen in Folge noch +10. Funken gehen an Fragen ans Orakel und an den nächsten Song.', giftsFirstRunCta: 'Ersten Song erstellen', giftsEmptyTitle: 'Hier erscheinen deine Funken', giftsEmptySub: 'Erstelle deinen ersten Song — und hol dir jeden Tag deinen Funken', giftsBackHome: '← Zur Startseite',
          giftsSpendCta: 'Frage stellen', giftsSpendSub: 'Frag im Chat alles über dich', giftsRefTitle: 'Lade einen Freund ein', giftsRefSub: 'Funken fürs Abo deines Freundes', giftsRefReward: '+Funken', giftsRefTag: 'Teile deinen Link — wenn ein Freund ein Abo abschließt, bekommst du Funken.', giftsRefStatInvited: 'Eingeladen', giftsRefStatSongs: 'Song erstellt', giftsRefStatEarned: 'Funken erhalten', giftsRefCopy: 'Kopieren', giftsRefCopied: 'Kopiert', giftsRefShare: 'Link teilen', giftsWeekTitle: 'Deine Serie', giftsWeekStreak: '{n} Tage in Folge', giftsWeekDays: 'Mo,Di,Mi,Do,Fr,Sa,So', giftsProgTitle: 'Zum Song deiner Seele', giftsProgSub: 'Sammle 100 Funken — und er entsteht', giftsProgSubPack: 'Das erste Funken-Paket schaltet einen Song frei — danach zahlst du mit Gesammeltem', iskrySongNeedPack: 'Funken schalten einen Song nach deinem ersten Funken-Paket frei. Bis dahin gehen sie an Orakel-Fragen und Deutungen.', errSongIskryNeedPack: 'Ein Funken-Paket schaltet den Song mit Funken frei — oder zahle direkt.', errGiftIskryNeedPack: 'Einen Song mit Funken verschenken geht ab dem ersten Funken-Paket.', giftsFoot: '✦ Komm morgen wieder — deine Serie wächst ✦', giftCardTitle: 'Schenk einem Lieben', giftCardSub: 'Verschenke deinen Song — ein lieber Mensch hört ihn', giftCardCta: 'Einen Song verschenken', iskraClaimedTitle: 'Der Funken ist deiner ✦', iskraFreshSub: 'Ein kleines Geschenk dafür, dass du da bist.', iskraClaimedSub: 'Brich den Keks — das Orakel hat dir eine Botschaft hinterlassen.', iskraCookieBtn: 'Glückskeks öffnen', iskraSaved: 'Im Botschaften-Tagebuch gespeichert', iskraAskDay: 'Das Orakel dazu fragen', iskraGoal: 'Noch {n} Tage in Folge → +10 Funken für eine 7-Tage-Serie', questsTitle: 'Quests', homeCommT: 'Mehr über deine Möglichkeiten', homeCommS: 'News und Tipps — in unserer Community', questJoinT: 'Unserer Community beitreten', questJoinS: 'Sei dabei', questJoinBtn: '+30', questJoinDone: 'Erledigt', questJoinAlready: 'Du bist schon in der Community', questJoinToast: 'Danke! +30 Funken', questJoinCheck: 'Ich bin dabei', questJoinNeedMember: 'Tritt zuerst der Community bei und komm dann zurück', scCommInviteT: 'Energie des Tages — jeden Morgen in der Community', scCommInviteS: 'Kurze Einstimmung auf den Tag und Orakel-News. +30 Funken fürs Beitreten.', scCommInviteBtn: 'Beitreten', profileVkCommunity: 'Community: Energie des Tages, jeden Morgen',
          // gift create/redeem pages (giftPage / giftRedeemPage)
          giftPageTitle: 'Song verschenken', gpEyebrow: 'Geschenk für einen lieben Menschen', gpTitle: 'Geschenk-Bestellung', gpWhat: 'Was du schenkst', gpItem: 'Seelensong', gpInGift: 'als Geschenk', gpToClose: 'einem lieben Menschen', gpPayMethod: 'Zahlungsart', gpMStars: 'Telegram Stars', gpMStarsSub: 'Mit Telegram Stars bezahlen', gpMCard: 'Karte · T-Bank', gpMCardSub: 'Visa / Mastercard / MIR', gpNote: 'Nach der Zahlung erhältst du einen Promo-Code — sende ihn deinem Liebsten, er aktiviert das Geschenk beim Erstellen eines Songs.', gpPay: 'Bezahlen', gpSecure: 'Sichere Zahlung · Promo-Code kommt sofort', gpDoneTitle: 'Geschenk bereit 🤍', gpDoneText: 'Ein Promo-Code für einen Seelensong — sende ihn deinem Liebsten, er gibt ihn beim Erstellen ein.', gpDoneShare: 'Geschenk senden', gpDoneCopy: 'Code kopieren', gpCodeCopied: 'Code kopiert ✓', giftsMyTitle: 'Meine Geschenke', giftCodePending: 'Wartet auf Aktivierung', giftCodeUsed: 'Aktiviert', giftCodeFor: 'Für: ', giftCodeCopy: 'Kopieren', giftCodeSend: 'Senden', gpShareText: 'Ich schenke dir einen Seelensong 🤍 Promo-Code: ', giftToPlaceholder: 'Für · wähle jemanden', giftToName: 'Für · {name}', giftNoSongs: 'Keine fertigen Songs', giftCreateFirst: 'Song erstellen', giftNeedSongTitle: 'Erst einen Song erstellen', giftNeedSongSub: 'Du verschenkst ihn, sobald er fertig ist', giftSoulSong: 'Seelensong', giftSongFallback: 'Song', giftDediPlaceholderPreview: 'Hier erscheint deine Widmung…', giftSecRecip: 'Für wen', giftSecWords: 'Warme Worte', giftSecHow: 'Wie verschenken', giftRecipAdd: 'Hinzufügen', giftDediPlaceholder: 'Schreib ein paar Zeilen für die beschenkte Person…', giftPresetBday: 'Alles Gute zum Geburtstag', giftPresetJust: 'Einfach so, für dich', giftPresetSpecial: 'Du bist etwas Besonderes', giftDlvLink: 'Link', giftDlvTg: 'Telegram', giftDlvQr: 'QR-Code', giftReward: '+5 Funken, wenn dein Geschenk geöffnet wird', giftSendBtn: 'Song verschenken', giftDoneTitle: 'Geschenk bereit!', giftDoneText: '«{name}» für {to}. Teile den Link unten — du erfährst es, sobald es geöffnet wird.', giftDoneCopy: 'Kopieren', giftToLovedOne: 'einen lieben Menschen', giftDoneClose: 'Fertig', giftPromptRecipName: 'Für wen ist das Geschenk? Name:', giftAddNamePh: 'Für wen? (z.B. Mama)', giftAddNameOk: 'Fertig', giftLinkCopied: 'Link kopiert', giftSelectFirst: 'Wähle zuerst einen Song', giftFailed: 'Hat nicht geklappt', giftSongYours: 'Der Song gehört dir 🤍', giftLoginToRedeem: 'Melde dich an, um dein Geschenk zu erhalten', giftPlaying: '🎵 {title} läuft', giftIskryCredited: '+{n} Funken gutgeschrieben 🤍', giftSongCredited: 'Ein Song geschenkt 🤍 Erstelle deinen', giftSongUnlocked: 'Dein Song ist freigeschaltet 🤍', giftDeliverShareText: 'Du hast einen Seelensong geschenkt bekommen 🤍 Öffne ihn: {url}', giftNotFound: 'Geschenk nicht gefunden', giftFromLovedOne: 'Ein lieber Mensch', grFromSealedDefault: 'Ein Geschenk für dich', grFromSealedName: 'Ein Geschenk von {name}', grTitleSealed: 'Du hast einen<br>Seelensong erhalten 🤍', grLeadDefault: 'Öffne das Geschenk, um deinen persönlichen Song zu hören.', grFromOpenDefault: 'Geschenk', grFromOpenName: 'Geschenk von {name}', grTitleOpen: 'Mit Liebe 🤍', grLeadNew: '{name} schenkt dir einen <b>persönlichen Song</b> nach deinem Geburtsdatum. Öffne das Geschenk, um ihn zu erstellen.', grLeadExisting: '{name} schenkt dir einen <b>Seelensong</b>. Öffne das Geschenk, um ihn zu hören.', giftInsidePersonalSong: 'Persönlicher Song', giftInsideByBirthdate: 'nach deinem Geburtsdatum', giftInside100: '+100 Funken geschenkt', giftInside100Sub: 'für deine künftigen Songs', giftInsideFromName: 'von {name}', grNoteNew: 'Das Geburtsdatum klären wir im nächsten Schritt · das Geschenk ist bereits bezahlt', grOpenBtn: 'Geschenk öffnen', grGetBtn: 'Meinen Song holen', grCreateSong: 'Erstelle deinen Song', grRedeemedNote: 'Das Geschenk gehört dir 🤍', giftPromoWillApply: 'Der Promo-Code wird beim Erstellen des Songs angewendet 🤍', gpPayUnavailable: 'Zahlung ist gerade nicht verfügbar, versuche es später', sharedSongEyebrow: 'Ein Song wurde mit dir geteilt', sharedSongCta: 'Erstelle einen Song über dich', sharedSongLoading: 'Song wird geöffnet…', sharedSongFallback: 'Seelensong', sharedSaveFav: 'Zu Favoriten', sharedCreateOwn: 'Erstelle dein eigenes Lied', sharedLockedLead: 'Hör dir einen 60-Sekunden-Ausschnitt an. Das ganze Lied schaltet der Autor frei.', sharedLockedSub: 'Ausschnitt · 60 Sek.', sharedSavedFav: 'Zu Favoriten hinzugefügt', sharedSavedFavBtn: 'In Favoriten', favoritesTitle: 'Favoriten', favSharedBadge: 'Mit dir geteilt', favEmpty: 'Hier erscheinen Lieder, die du zu Favoriten hinzufügst.',
          profileContactsTitle: 'Kontakte', profileContactsSub: 'Lieder für Lieblingsmenschen — deine Kartei', helpReplayTour: 'Tour erneut ansehen',
          afsTitle: 'Dein Funke leuchtet', afsSubtitle: 'Bereit, tiefer zu gehen?',
          afsBtnCreate: 'Noch einen Track erstellen', afsBtnSoulChat: 'Soul Chat ausprobieren', afsBtnInvite: 'Freund einladen',
          scTabChat: 'Chat', scTabDiary: 'Tagebuch', scTabPrism: 'Deutungen',
          askezaEntryLabel: 'Was du hältst', askezaEntryTitle: 'Deine Askese für 21 Tage',
          askezaPickerLabel: 'Was zuerst zu bearbeiten ist',
          histTitle: 'Verlauf', histBack: 'Zurück zum Chat', histSearch: 'Gespräche durchsuchen', histSearchPh: 'In Gesprächen suchen', histNoRes: 'Nichts gefunden. Versuch ein anderes Wort — ich suche in deinen Fragen.', histEmptyT: 'Noch keine Gespräche', histEmptyS: 'Frag das Orakel, was du willst — hier bleibt alles, worüber ihr gesprochen habt, damit du zurückkehren kannst.', histContinue: 'Gespräch fortsetzen', histLastNote: 'Zuletzt — „{title}“, {when}', histToday: 'Heute', histWeek: 'Diese Woche', histEarlier: 'Früher', histLive: 'gerade offen', histThreadsN: '{n} Gespräch|{n} Gespräche', histQuestionsN: '{n} Frage|{n} Fragen', histCountEmpty: 'noch leer', histQuote: '„{q}“', histDeleteAsk: 'Gespräch löschen? Es lässt sich nicht wiederherstellen.',
          prismPowerDrain: 'Wohin deine Kraft geht', drainSwitchLabel: 'Andere Seite ansehen',
          vkObSlide1Eyebrow: 'Dein Orakel', vkObSlide1Title: 'Das Orakel liest dein Geburtsdatum',
          vkObSlide1Sub: 'Frag nach dir selbst — die Antwort kommt aus deiner Karte. Die ersten zehn Fragen sind ein Geschenk.',
          vkObChipFree: '10 Fragen geschenkt',
          vkObSlide4Eyebrow: 'Deutungen und Praxis', vkObSlide4Title: 'Deutungen über dich und eine Praxis für 21 Tage',
          vkObSlide4Sub: 'Fünfzehn Deutungen aus deiner Karte. Und eine Askese — eine Praxis für drei Wochen, nicht zum einmaligen Lesen.',
          vkObChipPrisms: 'Deutungen', vkObChipAskeza: 'Askese · 21 Tage',
          vkConsentDataOracle: 'Daten liegen auf Servern in Russland. Für Deutungen geht ein Teil der Daten an Generierungsdienste, auch im Ausland — Details in der Richtlinie.', scThreadNew: 'Neues Gespräch', scThreadLegacy: 'Frühere Gespräche',
          errThreadNotFound: 'Gespräch nicht gefunden.', askezaPickerHint: 'Die erste ist dort, wo es gerade am schwersten ist. Du kannst jede nehmen, aber nur eine.',
          askezaTitlePrefix: 'Askese des', askezaTitleFallback: 'Deine Askese',
          askezaEntryNote: 'Üben statt lesen', askezaEntryProgress: '{done} von {total} gehalten',
          askezaBack: 'Zurück zu den Deutungen', askezaStatus: "Tag {n} von {m}", askezaStatusLeft: "{n} vor dir", askezaTodayLabel: "Heute · Tag {n}", askezaMarkBtn: "Tag als gehalten markieren", askezaMarkedBtn: "Tag markiert", askezaStartWith: "Askese des {planet} beginnen", askezaCtaNote: "21 Tage · ein ausgelassener Tag geht, zwei in Folge — von vorn", askezaFinalLabel: "21 Tage geschafft", askezaFinalTitle: "Praxis abgeschlossen", askezaFinalStreak: "beste Serie", askezaFinalMissed: "ausgelassen", askezaFinalNext: "Weiter geht es mit dem nächsten Thema aus der Liste.", askezaFinalCta: "Nächstes wählen", askezaEyebrow: 'Praxis · 21 Tage', askezaTitle: 'Askese des Saturn', askezaWhatIs: 'Eine Regel für 21 Tage: jeden Tag eine Handlung und ein Verzicht. Abends markierst du den Tag.', askezaOutcomeLabel: 'Was sich ändert', askezaDailyLabel: 'Jeden Tag', askezaCoreShort: 'Askese', askezaFinalCheck: 'Prüfe, was sich verändert hat',
          askezaCoreLabel: 'Was zu halten ist', askezaWhyLabel: 'Warum diese deine ist', askezaWhyPending: 'Ich schreibe gerade auf, warum diese Praxis deine ist…',
          askezaDoLabel: 'Tun', askezaBanLabel: 'Niemals',
          askezaTrackLabel: 'Einundzwanzig Tage', askezaTrackHint: 'Abends markieren, wenn du den Tag gehalten hast',
          askezaStreakLabel: 'am Stück von Anfang an', askezaTotalLabel: 'insgesamt gehalten',
          askezaBeatsLabel: 'Wo es dich bricht', askezaBeatYou: 'bei dir',
          askezaFailLabel: 'Gebrochen', askezaFailRule: 'Ein Tag verpasst — weiter. Zwei am Stück — von vorn.',
          askezaStartBtn: 'Praxis beginnen', askezaRestartBtn: 'Von vorn beginnen', askezaStarting: 'Praxis wird zusammengestellt…',
          askezaDayAria: 'Tag {n}', askezaDayShort: 'Tag {n}',
          errAskezaNeedBirthData: 'Trage Datum, Uhrzeit und Ort deiner Geburt ein — ohne sie geht die Praxis nicht.',
          errAskezaNeedBirthTime: 'Die Praxis braucht deine genaue Geburtszeit.',
          errAskezaUnknown: 'Unbekannte Praxis.', errAskezaBadDay: 'Dieser Tag liegt außerhalb der Praxis.',
          errAskezaNotStarted: 'Die Praxis hat nicht begonnen.',
          scOracleWho: 'Orakel', scIntroTitle: 'Frag nach dir selbst', scIntroSubtitle: 'Das Orakel antwortet aus deiner Karte, nicht mit Allgemeinplätzen.',
          scPrismTitle: 'Deutungen', scPrismSubtitle: 'Blick tiefer — deine Karte, laut gesungen', scChartLabel: 'Deine Karte', scChartNoDob: 'Geburtsdatum hinzufügen', scProgReceived: 'Erhaltene Deutungen', scProgOpened: 'Geöffnete Deutungen', scPrismTagNew: 'Neu', scPrismLockedTitle: 'Im Paket verfügbar', scPrismLockedMsg: 'Diese Deutung ist mit dem Soul-Chat-Paket verfügbar. Die erste Deutung «Seelenname» ist ein Geschenk.', scPrismTryFreeTitle: '«Seelenname» ausprobieren', scPrismPayDesc: 'Eine tiefe persönliche Deutung aus deiner Karte — ausführlich über dich.', scPrismPayHave: 'du hast', scPrismPayBtn: 'Deutung öffnen', scPrismPayLoading: 'Deutung wird vorbereitet…', pwTeaserLock: 'Das Orakel brach ab…', pwTitle: 'Gespräch fortsetzen?', pwSub: 'Funken aufgebraucht — aber das Orakel hat noch mehr zu sagen. Hol dir ein Paket, ohne Abo oder Karte.', pwSegQ: 'Fragen', pwSegIskry: 'Funken', pwCtaLabel: 'Gespräch fortsetzen', pwDay: 'Oder', pwDayAccess: 'Tageszugang', pwSubscribe: 'Automatisch aufladen?', pwSubscribeLink: 'Mit Karte abonnieren', pwSubscribeWhere: '(wo verfügbar)', pwFoot: 'Einmalige Zahlung. Paket verfällt nicht.', pwBadgePopular: 'Bester Preis',
          scPrismLoadingCatalog: 'Lade Deutungen…', scPrismRunning: 'Berechne deine Deutung…',
          scPrismErrorTitle: 'Etwas ist schiefgelaufen', scPrismRunFail: 'Deutung konnte nicht erstellt werden.',
          scPrismCatalogErr: 'Deutungen konnten nicht geladen werden.', scPrismCopy: 'Deutung kopieren', prismReadEyebrow: 'Persönliche Deutung', prismReadIntro: 'Das Orakel liest deine Karte', prismReadAsk: 'Frage zur Deutung stellen', prismReadSave: 'Deutung speichern', prismBuyDesc: 'Eine tiefe persönliche Deutung aus deiner Karte — ausführlich über dich und wie du es löst.', prismBuyIncl1Html: '<b>Ausführlicher Text</b> nach deinem Geburtsdatum', prismBuyIncl2Html: 'Wird im Chat gespeichert — du kannst <b>Fragen stellen</b>', prismBuyYouHave: 'du hast', prismBuyAfter: 'übrig', prismBuyShort: 'es fehlen', prismBuyOpen: 'Deutung öffnen', prismBuyTopup: 'Funken aufladen', prismBuyNoteOk: 'Die Deutung öffnet sich direkt im Chat mit dem Orakel', prismBuyNoteLow: 'Lade Funken auf und öffne die Deutung',
          scPrismCopied: 'Deutung kopiert', scPrismCopyFail: 'Kopieren fehlgeschlagen',
          scPrismTryFree: 'Geschenk-Deutung probieren', scPrismGoToPlans: 'Paket wählen', scPrismFillProfile: 'Profil ausfüllen',
          scEnterChat: 'Soul Chat betreten', scPayByCardBtn: 'Karte (T-Bank) — 199 ₽',
          forSelfOption: 'Für mich',
          iskrySuffix: 'Funken',
          successConfirmDesc: 'Dein Lied wird generiert.<br>Sobald es fertig ist — kommt es im Bot an.<br><span class="success-desc-note">Normalerweise 10–20 Minuten.</span>',
          successConfirmDescWeb: 'Dein Lied wird generiert.<br>Sobald es fertig ist — erscheint es unter „Meine Tracks".<br><span class="success-desc-note">Normalerweise 10–20 Minuten.</span>',
          profileEditLabelTime: 'Zeit', profileEditLabelGender: 'Geschlecht', profileEditDontKnow: 'Genaue Zeit unbekannt', profileEditDontKnowHint: 'Deutung erfolgt nach Datum — ohne genaue Zeit',
          profileEditFemale: 'Weiblich', profileEditMale: 'Männlich',
          styleManualDesc: 'Manuell wählen', styleAstroDesc: 'Automatisch', styleStarDesc: 'Künstlerstil',
          scPickerApply: 'Anwenden', scFillProfile: 'Profil ausfüllen →', scCreateRequest: 'Songanfrage erstellen →',
          planAnalysisIncluded: 'Analyse inklusive', profileAnalytics: 'Analytik',
          refStatInvitedLabel: 'Eingeladen', refStatActivatedLabel: 'Aktiviert', refStatSparksLabel: 'Funken',
          spubNudge: 'Du hast bereits 2 Tracks erstellt. <strong>Das Seele-Paket lohnt sich ab dem 3.</strong> — plus Soul Chat, Bestellverlauf und Priorität.',
          spubCta: 'Seele holen — 9,90 $ →',
          diarySettingsTitle: 'Einstellungen', diarySettingsBack: '← Zurück',
          successBotHintHtml: 'Drücke <b style="color:rgba(255,255,255,0.7);">Start</b> im Bot — und künftige Lieder kommen direkt in Telegram',
          payOvUpsellTitle: 'Seele — 5 Tracks für 9,90 $ | {subRub} ₽',
          payOvUpsellDesc: '1 Track = {perTrack} ₽ statt {songRub} ₽. Inkl. Soul Chat',
          confirmDescHtml: 'Deine Daten werden analysiert und ein einzigartiges Lied erstellt.<br><br>Das Lied kommt in diesen Chat. Du kannst die App schließen — nichts geht verloren.',
          confirmContinueBtn: 'Weiter →', planConfirmPay: 'Bezahlen', planConfirmCancel: 'Abbrechen',
          profileLogout: 'Abmelden', profileOfferLink: 'AGB',
          profileAnalytics: 'Analytik',
          recoveryBannerHtml: '<strong style="color:#6ee7b7;">Deine Anfrage wartet!</strong> Verwende Funken — erstelle deinen Song.',
          recoveryClaimBtn: 'Song erstellen',
          profilePartnerBadge: 'Partner',
          partnerDashStatEarned: 'Insgesamt verdient', partnerDashStatAvailable: 'Verfügbar zur Auszahlung',
          adminTitle: 'Admin', adminDesc: 'Anfragenverwaltung, Architekturkarte und Einstellungen — im Web-Adminbereich.',
          adminOpenBtn: 'Web-Admin öffnen'
        },
        fr: {
          dlSongTitle: 'Télécharger la chanson',
          dlSongEyebrow: 'Télécharger la chanson',
          dlSongTrackSub: 'Chanson de l’âme · 2:48 · MP3',
          dlSongMsg: 'Merci de partager 🤍 <span class="hl">Tant que ta chanson vit sur ta page, le téléchargement reste ouvert.</span> <span class="ret">Si tu retires la publication — on revient au normal : le morceau contre des Étincelles.</span>',
          dlSongMore: 'Autres façons d’ouvrir',
          dlSongJoinT: 'Rejoindre la communauté',
          dlSongJoinS: 'YupSoul sur VK',
          dlSongRevT: 'Laisser un avis',
          dlSongRevS: 'Quelques mots tendres sur la chanson',
          dlSongCta: 'Partager la chanson',
          dlSongOrPre: 'ou ',
          dlSongOrLink: 'ouvrir le téléchargement pour <span class="spk">100</span> Étincelles',
          tagline: 'Découvre comment sonne ton horoscope',
          taglineAccent: 'ton',
          startBtn: 'Obtiens ta chanson', myProfile: 'Profil', myHeroes: 'Labo', myHelp: 'Aide', admin: 'Admin',
          compatTitle: 'Compatibilité', profileTitle: 'Profil', profileSubtitle: 'Tes données et Étincelles',
          profileFreeCredits: 'Étincelles', profileInviteFriend: 'Inviter un ami', profileShare: 'Partager', profileCopyLink: 'Copier le lien', profileLinkCopied: 'Lien copié',
          refShareTextWithName: 'Salut ! Découvre cette application — elle crée une chanson personnelle basée sur ta date de naissance. Vraiment cool, essaie — la première minute de ta chanson en cadeau !',
          refShareText: 'Découvre cette application — elle crée une chanson personnelle basée sur ta date de naissance. La première minute de ta chanson en cadeau — essaie !',
          copiedToClipboard: 'Copié dans le presse-papiers',
          shared: 'Partagé !',
          copyManually: 'Copie le lien :',
          confirmYes: 'Oui',
          confirmCancel: 'Annuler',
          deleteCancelled: 'Suppression annulée',
          confirmExit: 'Quitter',
          confirmStay: 'Rester',
          thisHero: 'cette personne',
          confirmDeleteHero: 'Supprimer «{name}» ?',
          btnDelete: 'Supprimer',
          profileInvited: 'Invités', profileActivated: 'Activés', profileCreateSong: 'Créer une chanson',
          heroesTitle: 'Contacts', heroesSubtitle: 'Ceux pour qui l\'oracle chante',
          heroesVkOfferTitle: 'Fichier de personnes', heroesVkOfferDesc: 'Ajoute tes proches une fois — et crée des chansons pour eux en un tap. Tout l\'historique avec les paroles est juste ici.', heroesVkOfferCta: 'Ouvrir le fichier',
          ulSegCards: 'Fichier', ulSegTopic: 'Thème de lecture',
          ulCardsEyebrow: 'Fichier de personnes', ulCardsTitle: 'Tous tes proches — au même endroit', ulCardsSub: 'Enregistre les cartes de ta famille et de tes amis — chansons et compatibilité en un tap.',
          ulCardsB1: 'Chansons en un tap', ulCardsB1s: 'selon la date enregistrée', ulCardsB2: 'Compatibilité', ulCardsB2s: 'une lecture pour vous deux', ulCardsB3: 'Offre à tes proches', ulCardsB3s: 'une chanson en cadeau directement d\'ici',
          ulCardsCta: 'Ouvrir le fichier', ulCardsNote: 'Pack «Laboratoire» · accès 30 jours',
          ulTopicEyebrow: 'Lecture du thème', ulTopicTitle: 'Lectures selon ta carte', ulTopicSub: 'Une lecture approfondie du thème selon ta carte — et une chanson personnelle qui l\'accompagne.',
          ulTopicB1: 'Lecture approfondie', ulTopicB1s: 'selon ta date de naissance', ulTopicB2: 'Une chanson pour le thème', ulTopicB2s: 'un morceau personnel en cadeau', ulTopicB3: 'Questions à l\'Oracle', ulTopicB3s: 'sur ce thème, sans limite',
          ulTopicCta: 'Ouvrir les lectures', ulTopicNote: 'La lecture s\'ouvre dans le journal de l\'Oracle',
          heroesPerkTapTitle: 'Des chansons en un geste', heroesPerkTapDesc: 'Ajoutez une personne une fois — puis créez ses morceaux sans ressaisir sa date.', heroesPerkMatchTitle: 'Affinités avec vos proches', heroesPerkMatchDesc: 'Découvrez à quel point vous vibrez à l\'unisson — selon la date de naissance.', heroesPerkHistoryTitle: 'Tout l\'historique à portée', heroesPerkHistoryDesc: 'Les chansons et les paroles de chaque proche — réunies au même endroit.', heroesPerkGiftTitle: 'Offrez à vos proches', heroesPerkGiftDesc: 'Réunissez famille et amis — et ravissez-les avec des chansons personnelles.', heroesBuyPeriodWeb: 'Le Labo · le répertoire inclus', heroesBuyPriceUnitWeb: '₽', heroesBuyNoteWeb: 'Pack · le répertoire et tout le Labo', heroesBuyTrust: 'Paiement sécurisé · accès immédiat', heroesBrandTagline: 'Oracle musical', heroesTitleH1: 'Répertoire', heroesTitleSub: 'Ceux pour qui l\'oracle chante', heroesSelfBadge: 'c\'est toi', heroesCreateSong: 'Créer une chanson',
          searchByName: 'Rechercher par nom', searchPlaceholder: 'Entrer le nom...', searchBtn: 'Rechercher',
          addHero: 'Ajouter un héros', heroName: 'Nom *', heroNameLabel: 'Nom', heroBirthdate: 'Date de naissance', heroBirthtime: 'Heure de naissance',
          heroBirthplace: 'Lieu de naissance', heroBirthplacePh: 'Ville, pays', heroNotes: 'Notes', heroNotesPh: 'Notes sur la personne',
          unknownTime: "Heure exacte inconnue", cancel: 'Annuler', deleteBtn: 'Supprimer', save: 'Enregistrer', back: '← Retour', backLabel: 'Retour',
          gender: 'Genre', genderSelect: 'Choisir', male: 'Homme', female: 'Femme', other: 'Autre',
          modeType: "Format de chanson", modeSubtitle: 'Pour qui créons-nous ?',
          modeSingle: 'À mon sujet', modeSingleDesc: 'Une chanson selon ta date de naissance.',
          modeCouple: 'Nous deux', modeCoupleDesc: 'Une chanson pour deux personnes.',
          modeLockedBadge: 'Disponible avec un pack',
          guideTipFormat: 'Choisis un format', guideTipDate: 'Saisis ta date de naissance', guideTipStyle: 'Choisis comment définir le style', guideTipLyrics: 'Avec paroles, musique seule ou ton propre texte', guideTipCreate: 'C\'est prêt — appuie sur « Créer »',
          guideTipStart: 'Appuie — créons ta chanson', guideTipGender: 'Choisis le genre', guideNextBtn: 'Suivant', coupleManualEnter: 'Saisir manuellement', coupleExpandEdit: 'Déplier', coupleCollapseEdit: 'Replier', guideTipLanguage: 'Langue de la chanson', guideTipRequest: 'Quelques mots sur le thème, et la chanson sonnera plus juste. Pas envie ? Passe — on la composera à partir de ta lecture.', guideTipName: 'Ajoute un prénom — il sera chanté. Déjà rempli mais pas envie ? Efface-le', guideTipAdv: 'Optionnel : lieu et heure affinent la chanson',
          obSlide5Eyebrow: 'Ne rate rien', obSlide5Title: 'Sois le premier à savoir quand ta chanson est prête', obSlide5Sub: 'On te préviendra dès que ta chanson est prête, avec un rappel pour l\'Étincelle du jour.',
          obChipNotifyReady: 'chanson prête → alerte', obChipNotifyIskra: 'Étincelle du jour',
          obConsentBtn: 'Activer les notifications · +5 Étincelles', obConsentDone: 'Connecté',
          modeTransit: "Énergie<br>du jour", modeTransitDesc: "Une chanson sur la journée d'aujourd'hui.",
          namePh: "Comment tu t'appelles ?", birthdateLabel: 'Date de naissance', birthplacePh: 'Ville ou pays — choisis parmi les suggestions',
          birthplaceHint: 'Tape ta ville et choisis dans la liste.',
          cityTypeMore: 'Saisis au moins 3 lettres',
          unknownTimeShort: 'Inconnu', secondPersonTitle: 'À deux', name2Ph: "Nom de la deuxième personne",
          birthplace2Ph: "Lieu de naissance de la deuxième personne", birthtime2Ph: 'Heure de naissance',
          transitTitle: "Énergie du jour", transitDatePh: 'JJ.MM.AAAA', transitTimePh: 'HH:MM',
          transitLocationPh: 'Ville pour l\'énergie du moment', transitLocationOk: 'Le lieu est correct',
          transitIntentPh: 'Intention pour ce moment',
          styleManual: 'Saisir<br>manuellement', styleAstro: 'Son des<br>planètes', styleStar: 'Comme<br>une star', starRecent: 'Récents',
          styleHeading: 'Style musical', styleSubtitle: 'Comment définir le style ?',
          stylePlaceholderManual: 'Genre ou ambiance musicale', stylePlaceholderAstro: 'Le style sera défini par la date de naissance', stylePlaceholderStar: 'Artiste, chanson ou bande son',
          styleManualDefaultHint: 'Si laissé vide — nous choisirons le style automatiquement selon ta date de naissance.',
          pendingDraftBannerText: '← Retour au brouillon de chanson',
          payOvDraftTtlHint: 'Le brouillon sera conservé 7 jours — puis annulé automatiquement.',
          authErrVkNoCode: 'La connexion via VK a échoué. Réessaie ou utilise Telegram.',
          authErrVkTokenFail: 'VK n\'a pas confirmé la connexion. Réessaie dans une minute.',
          authErrVkUserFail: 'VK a renvoyé un profil incomplet. Réessaie.',
          authErrVkCreateFail: 'Impossible de créer un compte. Contacte le support si cela persiste.',
          authErrVkJwtFail: 'La session n\'a pas été créée. Réessaie.',
          authErrGeneric: 'Échec de la connexion. Réessaie.',
          supportEmailCopied: 'Email copié — écris-nous',
          supportEmailLabel: 'Écris-nous par email',
          mtAudioTapAgain: 'Appuie encore — le navigateur demande confirmation',
          astroInfoReady: 'Le style sera dérivé de ta date de naissance',
          astroInfoNoProfile: 'Indique d\'abord ta date de naissance',
          astroInfoNoProfileHint: 'Touche pour remplir',
          starHint: 'Entrez le nom d\'un artiste, d\'une chanson ou d\'un film. Nous créerons une musique dans un style similaire, unique pour vous.',
          sendRequest: 'De quoi parlera la chanson ?', requestReassure: 'Tu peux laisser vide — on composera la chanson à partir de ta date de naissance.', quickRequests: 'Demandes rapides', hide: 'Masquer',
          requestDesc: 'De quoi parle la chanson ? Toute demande — de l\'humour aux thèmes profonds.',
          requestQuickHint: 'Choisis une demande prête ou écris la tienne',
          requestPh: 'Écris n\'importe quelle demande', toPayment: 'Paiement',
          paymentSubtitle: 'Ta clé sonore', paymentAndAccess: 'Paiement et accès',
          paymentIntro: 'Crée un titre avec des Étincelles ou obtiens un forfait pour l\'accès complet.',
          loadingPricing: 'Chargement des tarifs...', currentItem: 'Élément actuel',
          promoCode: 'Code promo', promoEmptyError: 'Saisis le code promo', toastRateLimit: 'Trop de tentatives. Attends quelques minutes et réessaie.', apply: 'Appliquer', backFromPayment: '← Retour',
          submitAndContinue: 'Payer et continuer', submitRequest: 'Envoyer la demande',
          submitHint: 'La chanson arrivera dans ce chat avec le bot. Si vous n\'avez pas encore appuyé sur «Démarrer» dans le bot — faites-le maintenant.',
          paymentPageIntroAfterSubmit: 'Demande envoyée. Entre le code promo ou choisis un moyen de paiement ci-dessous.',
          paymentPageTagline: 'Code promo ou paiement',
          pay: 'Payer',

          firstFree: 'Tu as des Étincelles — crée ton premier titre !',
          subscriptionActive: 'Tu as un forfait actif — continue.',
          catalogLoadFailed: 'Tarifs non chargés. Appuie sur «Payer» — le backend déterminera le prix.',
          paymentRequired: 'Paiement requis pour les nouvelles demandes.',
          promoApplied: 'Code promo {code}: -{amount} {currency}',
          creatingKey: 'Création de ta clé...',
          creatingKeyDesc: 'La magie opère en temps réel. Ta clé sonore personnelle se forme à partir de tes données uniques.',
          keyActivated: 'Clé activée !', done: 'Terminé !',
          successText: 'Ta clé sonore personnelle est créée ! Ton artefact unique de force pour le jeu de la vie.',
          yourSong: 'Ta chanson',
          songPreviewText: 'Ta composition unique t\'attend dans le bot. Écoute-la chaque matin pour te mettre sur la voie du succès.',
          whatNext: 'Et après :', openBot: 'Ouvre le bot',
          soulChat: 'Parler à ton âme', soulChatPay: 'Paiement — Soul / Depth',
          newKey: 'Créer une autre clé',
          paymentThanks: 'Merci pour le paiement', thanksSubtitle: 'demande acceptée', paymentThanksBackToForm: 'Créer ta chanson', paymentThanksBackToHome: 'Accueil', paymentCancelled: 'Paiement annulé',
          songInProgress: 'La chanson est en cours de génération et arrivera dans le chat du bot quand elle sera prête.',
          songInProgressConfirmed: 'Demande acceptée. Chanson en génération — pas besoin de payer à nouveau. Elle arrivera dans le chat du bot quand elle sera prête.',
          thanksDone: 'Terminé',
          notFromTelegram: 'Ouvre l\'app depuis le chat du bot dans Telegram (bouton menu) — sinon la demande ne peut pas être envoyée.',
          notFound: 'Non trouvé', searchError: 'Erreur de recherche',
          soulChatLoad: 'Chargement…',
          soulChatHasAccess: "Tu as accès à Soul Chat. Appuie ci-dessous — le bot s'ouvrira. Dans le bot, tape /soulchat et pose une question à ton âme.",
          soulChatNoAccess: 'Soul Chat — dialogues avec ton âme. Avec forfait Soul (jusqu\'à 50 messages) ou Depth (illimité).',
          soulChatDefault: 'Soul Chat — dialogues avec ton âme par demande. Sur forfait.',
          soulChatNoApi: 'Soul Chat — dialogues avec ton âme. Avec forfait Soul ou Depth. Va dans «Paiement» dans l\'app.',
          greeting: 'Salut, {name} ! Reviens quand tu veux te souvenir de qui tu es.',
          greetingDefault: 'Reviens quand tu veux te souvenir de qui tu es.',
          onboardingSlide1Title: 'Il y a une chanson — sur toi',
          onboardingSlide1Text: 'Écrite selon ta date de naissance. Pas un modèle — un vrai texte sur ton caractère et ton chemin.',
          onboardingSlide2Title: 'Seulement sur toi',
          onboardingSlide2Text: 'Une analyse intelligente de ta personnalité devient une chanson vivante — unique, rien qu\'à toi.',
          onboardingSlide3Title: 'Ta chanson t\'attend',
          onboardingSlide3Text: 'Saisis ta date de naissance — crée ta première chanson, une minute en cadeau.',
          onboardingBtnStart: 'Recevoir ma chanson',
          obBrand: 'YupSoul', obSkip: 'Passer', obNext: 'Suivant', obCreate: 'Créer ma première chanson',
          archTitle: 'Qui tu es vraiment', archLead: 'Dans ta date de naissance il y a une planète que l\'astrologie appelle l\'indicateur de l\'Âme. C\'est elle qui tient ton caractère. Donne la date — je te montre.', archDateLabel: 'Date de naissance', archGo: 'Montrer mon archétype', archEyebrow: 'Indicateur de l\'Âme', archGift: 'Ton don', archShadow: 'Ton ombre', archSoulPlanet: 'Planète de l\'Âme', archNote: 'Ta note', archBridge: 'Ça, c\'était les mots. Maintenant écoute comment ça sonne : la chanson naît de cette même date.', archToSong: 'Créer ma chanson', archAgain: 'Autre date', archNeedDate: 'Indique ta date de naissance', archBadDate: 'Vérifie la date — quelque chose ne colle pas', signInWithApple: 'Se connecter avec Apple', rgAll: 'Tous les genres', rg_rock: 'Rock', rg_electronic: 'Électronique', rg_rap: 'Rap', rg_folk: 'Folk', rg_soul: 'Soul / R&B', rg_ambient: 'Ambient', rg_cinematic: 'Cinématique', rg_acoustic: 'Acoustique', rg_sacred: 'Sacré', rg_pop: 'Pop', rg_other: 'Autre', offlineTitle: 'Pas de connexion Internet', offlineText: 'Vérifie ta connexion et réessaie', offlineRetry: 'Actualiser', errPurchaseFailed: 'L\'achat n\'a pas abouti', errArchBadDate: 'Vérifie la date — quelque chose ne colle pas',
          obReward: '+30 Étincelles pour faire connaissance',
          obChipBirthdate: 'selon ta date de naissance', obChipWhoAmI: '« Qui suis-je ? »', obChipDiary: 'journal du jour',
          obChipCompat: 'Toi + maman · 92%', obChipContacts: 'tes proches', obChipGift: 'offre à un ami', obChipRadio: 'radio · chansons des autres',
          obSlide1Eyebrow: 'Ta chanson de l\'âme', obSlide1Title: 'Une chanson écrite selon ta date de naissance', obSlide1Sub: 'L\'Oracle lit ta carte de naissance et crée un morceau qui ne parle que de toi.',
          obSlide2Eyebrow: 'Oracle', obSlide2Title: 'Pose des questions sur toi — et reçois une réponse profonde', obSlide2Sub: 'Pose des questions sur ton chemin, tes relations et ton caractère. L\'Oracle répond avec chaleur et justesse.',
          obSlide3Eyebrow: 'Compatibilité', obSlide3Title: 'Découvre à quel point vous êtes en accord', obSlide3Sub: 'Ajoute famille et amis à tes proches — et vois votre compatibilité selon la date de naissance.',
          obSlide4Eyebrow: 'Offre et écoute', obSlide4Title: 'Offre des chansons et écoute la Radio', obSlide4Sub: 'Offre une chanson à quelqu\'un qui t\'est cher, et ouvre la Radio — les chansons d\'autres personnes.',
          alertNameShort: 'Le nom doit contenir au moins 2 caractères', alertNameFriendly: "Comment t'appelles-tu ? Avec un prénom, la chanson devient vraiment la tienne", alertNameInvalid: 'Indique un vrai prénom', alertBirthdate: 'Choisis la date de naissance', alertBirthdateInvalid: 'L\'année de naissance doit être entre 1900 et l\'année actuelle', alertBirthdateInvalidDay: 'Date invalide — vérifie le jour et le mois',
          errInvalidName: 'Le nom contient des caractères ou répétitions invalides.',
          errNameRequired: 'Le nom ne peut pas être vide. Saisis au moins 1 caractère.',
          errInvalidDateFormat: 'Format de date de naissance invalide. Utilise YYYY-MM-DD.',
          errInvalidDateYear: 'L\'année de naissance doit être entre 1900 et l\'année actuelle.',
          errInvalidDateMonth: 'Mois de naissance invalide.',
          errInvalidDateDay: 'Jour de naissance invalide.',
          errInvalidDate: 'Date de naissance invalide.',
          errInvalidBirthplace: 'Lieu de naissance invalide.',
          alertBirthplace: 'Le lieu de naissance doit contenir au moins 3 caractères', alertBirthplaceHint: 'Choisis un lieu dans les suggestions',
          validationErrorHint: 'Remplis tous les champs obligatoires.',
          alertBirthtime: 'Entre l\'heure de naissance ou coche "Inconnu"', alertGender: 'Choisis le genre', alertLanguage: 'Choisis la langue',
          advSettingsTitle: 'Paramètres avancés', advSettingsSub: 'facultatif', advSettingsHint: "Facultatif. Le lieu et l'heure de naissance affinent le calcul — tu peux les ignorer.",
          unlockEyebrow: 'Ta chanson', unlockTitle: 'Ce n’est que le début',
          unlockLead: 'La première minute a joué. <b>La chanson complète dure environ 3 minutes</b>, écrite d’après ta date de naissance. À venir — le refrain, le final et ton nom dans les paroles.',
          unlockR1t: 'Chanson complète', unlockR1s: 'environ 3 minutes', unlockR2t: 'Télécharger en MP3', unlockR2s: 'à toi pour toujours',
          unlockR3t: 'Paroles', unlockR3s: 'tout le texte', unlockR4t: 'Partager avec tes proches', unlockR4s: 'offrir cette chanson',
          unlockR5t: 'Karaoké sur ta chanson', unlockR5s: 'chanter sur tes paroles',
          unlockPromoToggle: 'On m’a offert un code promo', unlockPromoPh: 'Saisir le code promo', unlockPromoApply: 'Appliquer', unlockPromoChecking: 'Vérification…', unlockPromoWrongProduct: 'Ce code promo n’est pas pour une chanson',
          unlockCtaOpen: 'Ouvrir en entier', unlockCtaSub: 's’ouvre aussitôt', unlockCtaPaying: 'Ouverture du paiement…', unlockPayCard: 'Carte', unlockPayStars: 'Étoiles', unlockPayPromo: 'Code promo', unlockPayIskry: 'Étincelles',
          unlockGhReplay: 'Réécouter', unlockGhBack: 'Retour', unlockVkNote: 'L’ouverture se paie par carte', unlockIskryUnit: 'Étincelles',
          openedEyebrow: 'Ta chanson est ouverte', openedTitle: 'C’est bon — écoute en entier',
          openedLead: 'La version complète joue déjà. Elle est à toi — télécharge-la, lis les paroles et partage-la avec tes proches.',
          openedLeadNoLyrics: 'La version complète joue déjà. Elle est à toi — télécharge-la et partage-la avec tes proches.',
          openedPlaySub: 'Chanson complète · 3:12',
          openedKaraT: 'Chanter en karaoké', openedKaraS: 'les paroles s’allument en rythme',
          openedNudgeT: 'Créer une chanson pour un proche', openedNudgeS: 'offrir une histoire comme celle-ci', openedPackT: 'Plus de chansons — pour toi et tes proches', openedPackS: "un pack d'Étincelles — 10 chansons et plus",
          openedOptinT: 'Passer te voir chaque matin ?', openedOptinGift: '3 jours offerts', openedOptinP: 'Un court mot chaleureux de l’Oracle chaque matin. Désactivable à tout moment.', openedOptinYes: 'Oui, envoie', openedOptinNo: 'Pas maintenant',
          openedShare: 'Partager avec un proche', openedDownload: 'Télécharger', openedLyrics: 'Paroles',
          alertName2Short: 'Le nom de la 2e personne — au moins 2 caractères', alertBirthdate2: 'Entre la date de naissance de la 2e personne',
          alertBirthplace2: 'Le lieu de naissance de la 2e personne doit contenir au moins 3 caractères',
          alertBirthtime2: 'Entre l\'heure de naissance de la 2e personne', alertGender2: 'Choisis le genre de la 2e personne',
          alertTransitDate: 'Entre la date de l\'événement', alertTransitLocation: 'Entre le lieu de l\'événement', alertTransitConfirm: 'Confirme que le lieu est correct',
          alertRequestShort: 'Ajoute une demande (5+ caractères)', alertRequestLong: 'Dis-en plus à l\'Univers (au moins 15 caractères)',
          alertYourPath: 'Choisis ton chemin', alertNoApi: 'Adresse API non configurée.', alertOpenFromBot: 'Ouvre l\'app depuis le chat du bot dans Telegram — sinon la demande ne peut pas être acceptée.',
          alertServerSleep: 'Le serveur s\'est réveillé lentement. Attends environ une minute et appuie à nouveau sur «Envoyer la demande».',
          sending: 'Envoi…',
          universeHeard: '{name}, l\'Univers a entendu ta demande.\n\nTa clé sonore est en cours de création et arrivera dans ce chat quand elle sera prête.',
          universeHeardCouple: '{name} et {name2}, l\'Univers a entendu votre demande.\n\nVotre clé sonore est en cours de création et arrivera dans ce chat quand elle sera prête.',
          universeHeardTransit: '{name}, l\'Univers a entendu ta demande.\n\nTa clé sonore Énergie du jour est en cours de création et arrivera dans ce chat quand elle sera prête.',
          langSong: 'Langue de la chanson', langRu: 'Russe', langEn: 'Anglais', langDe: 'Allemand', langFr: 'Français', langUk: 'Ukrainien',
          quick1: 'Harmonie et amour de soi', quick2: 'Confiance et but', quick3: 'Potentiel créatif', quick4: 'Lâcher le passé',
          quick5: 'Équilibre de vie', quick6: 'Confiance et acceptation', quick7: 'Guérison et liberté', quick8: 'Chemin vers le bonheur',
          quick9: 'Force et dépassement', quick10: 'Profondeur et silence', quick11: 'Tendresse et soin', quick12: 'Humor et légèreté',
          quick1t: 'Harmonie dans les relations et amour de soi', quick2t: 'Confiance, but et autonomie',
          quick3t: 'Libérer ton potentiel créatif sans peur', quick4t: 'Lâcher le passé et ouvrir de nouvelles possibilités',
          quick5t: 'Équilibre travail et vie personnelle', quick6t: 'Faire confiance à la vie et lâcher le contrôle',
          quick7t: 'Guérir les blessures d\'enfance et trouver la liberté', quick8t: 'Trouver ton chemin vers le bonheur et la paix',
          quick9t: 'Chanson puissante sur ma force et mon dépassement', quick10t: 'Chanson méditative pour la pratique et la guérison',
          quick11t: 'Chanson chaleureuse sur le soin et la tendresse', quick12t: 'Chanson ludique avec auto-ironie sur mes travers',
          promoError: 'Code promo non appliqué',
          promoCleared: 'Code promo effacé.', promoApplied: 'Code promo appliqué: montant final {amount} {currency}',
          promoAppliedHint: 'Code promo {code}: -{amount} {currency}',
          paymentRequiredOpening: 'Paiement requis. Ouverture de HOT Checkout...',
          promoFreeGen: 'Code promo activé. Démarrage...',
          hotCheckoutOpened: 'HOT Checkout ouvert. Après paiement, reviens dans la Mini App — le statut se mettra à jour automatiquement.',
          paymentNotConfirmed: 'Paiement pas encore confirmé. Vérifie plus tard ou rouvre le paiement.',
          paymentConfirmed: 'Paiement confirmé. Démarrage de la génération...', successWhileWaiting: 'En attendant', successNewSong: 'Nouvelle chanson',
          paymentReceivedNoStart: 'Paiement reçu, mais démarrage auto échoué. Lance la génération dans l\'admin par request_id: {id}',
          submitFailed: 'Demande non envoyée. Attends une minute et appuie à nouveau sur «Envoyer la demande» ou rouvre la Mini App depuis le chat du bot.',
          errorOp: 'Erreur opération paiement/demande',
          alertTransitLocation: 'Entre le lieu de l\'événement', alertTransitConfirm: 'Confirme que le lieu est correct',
          alertNoApi: 'Adresse API non configurée.', alertOpenFromBot: 'Ouvre l\'app depuis le chat du bot dans Telegram — sinon la demande ne peut pas être acceptée.',
          alertOpenFromBotShort: 'Ouvre l\'app depuis le chat du bot dans Telegram.',
          alertPaymentFirst: 'Appuie d\'abord sur «Envoyer la demande» à l\'étape précédente.',
          alertLinkCopied: 'Lien copié. Colle-le dans Safari ou Chrome et ouvre-le.',
          alertHeroName: 'Entre le nom', alertError: 'Erreur', alertDeleteConfirm: 'Supprimer «{name}» ? Cette action ne peut pas être annulée.',
          alertSubmitError: 'Erreur d\'envoi',
          copyLinkPrompt: 'Copie ce lien et ouvre-le dans le navigateur:',
          songFormingText: 'Ta clé sonore est en cours de création et arrivera dans ce chat quand elle sera prête.',
          heroesLoading: 'Chargement...', heroesEmpty: 'Pas encore de héros. Appuie sur «Ajouter un héros».',
          heroesEmptyFull: 'Pas encore de héros.<br>Ajoute le premier — et crée<br>des chansons personnelles en un tap.', heroesSearchNotFound: 'Aucun résultat pour ta recherche.', heroesZeroTitle: 'Ton carnet est encore vide', heroesZeroDesc: 'Ajoute un proche — et l\'oracle composera une chanson pour lui selon sa date de naissance.', heroesZeroHint: 'Par exemple : partenaire · enfants · parents · amis', heroesZeroCta: 'Ajouter ton premier héros',
          heroSoloBtn: 'Solo', heroDuoBtn: 'Avec moi', heroEditBtn: 'Modifier', heroDeleteBtn: 'Supprimer',
          heroesLoadError: 'Impossible de charger. Réessaie plus tard.',
          loading: 'Chargement…', noCardsYet: 'Pas encore de cartes terminées', heroHistLoading: 'Chargement de l\'historique…', heroHistEmpty: 'Pas encore de générations', heroHistLoadError: 'Impossible de charger l\'historique', heroesPageLoadError: 'Impossible de charger les héros', retry: 'Réessayer',
          forMyself: 'Pour moi', forHero: 'Créer une chanson pour {name}', heroDataTitle: 'Données de {name}',
          mtTooltipLyrics: 'Paroles', mtTooltipAnalysis: 'Analyse', mtTooltipDownload: 'Télécharger', mtTooltipShare: 'Partager', mtTooltipVolume: 'Volume', mtVolumeLabel: 'Volume',
          previewHome: 'Accueil', previewForm: 'Formulaire', previewPayment: 'Paiement', previewLoading: 'Chargement', previewSuccess: 'Succès',
          supportBtn: 'Contacter le support',
          subActivated: 'Pack activé !', subBtnProfile: 'Mon profil',
          helpPageTitle: 'Aide & Support', helpPageSubtitle: 'Tout sur YupSoul — simple et concis',
          profileHelpBtn: 'Aide & support', profileDeleteAccountBtn: 'Supprimer le compte',
          deleteAccountConfirm: 'Supprimer le compte et toutes les données associées ?\n\nSeront supprimés : profil, paramètres, données de naissance, historique de parrainage.\n\nTes titres créés resteront dans les statistiques globales mais seront dissociés de ton compte. Cette action est IRRÉVERSIBLE.',
          profileSectionTheme: 'Apparence', themeAuto: 'Auto', themeLight: 'Clair', themeDark: 'Sombre',
          profileSubsLink: 'Packs', payOvSubsLink: 'forfaits et gestion',
          legalTabOffer: 'CGV', legalTabPrivacy: 'Confidentialité', legalTabSubs: 'Packs', legalCloseAria: 'Fermer',
          profilePageTitle: 'Profil', profileSectionMyData: 'Mes données', profileSectionPlans: 'Forfaits',
          profileLoadError: 'Impossible de charger le profil', profileLoadRetry: 'Actualiser',
          profileEditBtn: 'Modifier →', profileEditLabelName: 'Nom', profileEditLabelDate: 'Date de naissance', profileEditLabelCity: 'Ville de naissance', profileEditNamePh: 'Votre nom', profileEditCityPh: 'Ville de naissance', profileEditSaveBtn: 'Enregistrer', profileEditCancelBtn: 'Annuler',
          profileBalanceHintText: 'Invite des amis — gagne des Étincelles',
          profileSectionTracks: 'Titres individuels', profileTracksNote: 'Sans pack — paie un titre quand tu veux.', profileRefTagline: 'Partage ton lien — quand un ami prend un abonnement, tu reçois des Étincelles.',
          tuTitle: 'Acheter des Étincelles', tuBalance: 'sur ton solde · 1 chanson = 100 Étincelles', tuBalanceVk: 'sur ton solde · 1 question à l\'Oracle = 1 Étincelle', tuChoose: 'Combien ajouter', tuCta: 'Recharger', tuPack1k: '≈ 10 chansons', tuPack2k: '≈ 20 chansons', tuPack5k: '≈ 50 chansons', tuSave2k: 'plus avantageux', tuSave5k: 'maximum', tuEntrySub: '1000 / 2000 / 5000 Étincelles pour de nouvelles chansons',
          iskryPacksTitle: 'Acheter des Etincelles', iskryPack1000Name: '1000 Etincelles', iskryPack1000Desc: '10 chansons',
          iskryPack2000Name: '2000 Etincelles', iskryPack2000Desc: '20 chansons',
          iskryPack5000Name: '5000 Etincelles', iskryPack5000Desc: '50 chansons — meilleur prix', iskryPackSongs: 'chansons', vkPackHeader: 'Pack', vkPackName: 'Pack : {n} chansons', vkPackSongs: '{n} chansons personnelles', vkCardoteka: 'fichier de personnes',
          vkIskryUnavailable: 'Les forfaits Étincelles ne sont pas disponibles sur VK. Obtiens un forfait ou invite un ami.',
          profileRefInvited: 'Invités', profileRefActivated: 'Activés', profileRefSparks: 'Étincelles',
          planCurrentBadge: 'Actuel', planFreeYours: 'Déjà le tien', planSubscribeBtn: "Obtenir le pack",
          plTitle: 'Packs', plBalance: 'Ton solde', plTopup: 'Recharger', plSubsSec: 'Abonnements · accès complet', plSubsSecVk: 'Packs · accès complet', plPacksSec: "Packs d'Étincelles · ponctuel", plBasicTag: 'Basic', plPlusTag: 'Plus', plLabTag: 'Master', plBasicF1: '5 morceaux chaque mois', plBasicF2: 'Oracle — 50 questions par mois', plBasicF3: 'Historique des commandes', plPlusF1: '15 morceaux chaque mois', plPlusF2: 'Oracle sans limite', plPlusF3: 'Priorité dans la file de génération', plLabF1: '30 morceaux chaque mois', plLabF2: 'Fichier de personnes', plLabF3: 'Oracle sans limite + priorité', plFlag: 'le plus choisi', plBasicCta: 'Activer « Âme »', plPlusCta: 'Activer « Profondeur »', plLabCta: 'Activer « Laboratoire »', plOnceSec: 'Achats ponctuels', plBuy1: 'Chanson sur toi', plBuy1s: 'Une clé sonore selon ton schéma', plBuy2: 'Chanson à deux', plBuy2s: 'Compatibilité selon deux thèmes', plBuy3: 'Énergie du jour', plBuy3s: "Le son d'un moment précis", plBuyPrice: '100 Étincelles', plLegalHtml: "Toute chanson — 100 Étincelles. Les forfaits sont un paiement unique pour 30 jours, sans prélèvements automatiques. Paiement par carte, Stars ou Étincelles ; les codes promo s'appliquent aux achats ponctuels. <a href=\"#\" onclick=\"if(window.showLegalModal)window.showLegalModal('offer');return false\">Conditions</a>.", plLegalVkHtml: "Les Étincelles se rechargent par carte et servent aux questions à l'Oracle. Les packs sont un achat ponctuel. <a href=\"#\" onclick=\"if(window.showLegalModal)window.showLegalModal('offer');return false\">Conditions</a>.", tuBalanceVk: "sur ton solde · 1 question à l'Oracle = 1 Étincelle", tuPack1kVk: "≈ 1000 questions à l'Oracle", tuPack2kVk: "≈ 2000 questions à l'Oracle", tuPack5kVk: "≈ 5000 questions à l'Oracle", tuEntrySubVk: "1000 / 2000 / 5000 Étincelles pour les questions à l'Oracle", iskryPackQuestions: "questions à l'Oracle",
          planFreeName: 'Chercheur', planFreeBadge: '✦ YupSoul Chercheur',
          planFreeNameClassic: '(Gratuit)', planBasicNameClassic: '(Basic)', planPlusNameClassic: '(Plus)', planMasterNameClassic: '(Laboratoire)',
          planBasicName: 'Âme', planPlusName: 'Profondeur',
          planDetailsBtn: 'Détails', planPopularBadge: 'le plus choisi', planMasterBadgeText: 'Meilleur choix',
          planMasterNameText: 'Laboratoire', planOpenMasterBtn: 'Ouvrir le Laboratoire',
          planModalSection: 'Ce qui est inclus', planModalSubscribe: 'Obtenir le pack {title}', planModalClose: 'Fermer',
          planConfirmHeader: 'Tarif',
          vkPackHeader: 'Pack', vkPackName: 'Pack : {n} chansons', vkPackSongs: '{n} chansons personnelles', vkCardoteka: 'fichier de personnes',
          ptiSingleName: 'Pour moi', ptiSingleDesc: 'Ta personnalité en sons',
          ptiCoupleName: 'Pour deux', ptiCoupleDesc: 'Votre lien et résonance',
          ptiTransitName: "Énergie du jour", ptiTransitDesc: "Une chanson pour aujourd'hui",
          successTitle: 'Demande acceptée !', successDesc: "Ta chanson est en cours de création. Quand elle sera prête — elle arrivera dans le bot. Généralement 10–20 minutes.", successWhereTrack: 'Ta chanson apparaitra dans<br><b>Mes morceaux</b>',
          successHint: 'Pas reçue en 20 min ? Dis au bot « chanson non reçue ».', successToProfile: 'Aller au profil',
          successListen: 'Ouvrir le bot', successMyTracks: 'Mes morceaux',
          typewriter1: 'Crée une chanson sur toi, sur n\'importe quel thème.',
          typewriter2: 'Obtiens une transcription textuelle basée sur l\'analyse approfondie de ta demande.',
          typewriter3: 'Communique avec ton âme grâce au Chat de l\'âme.',
          typewriter4: 'Des étincelles pour toi — crée ta chanson.',
          typewriter5: 'Crée des fiches avec les données de tes proches ou clients pour un accès rapide.',
          typewriter6: 'Associe les fiches avec les données de tes proches.',
          typewriter7: 'Offre-toi et à tes proches un cadeau unique et profond.',
          loadingTitle: 'Demande acceptée', loadingGenerating: 'Création de ta chanson...', loadingWait: 'Environ 10–15 minutes. Apparaîtra dans Mes pistes.', rateLimitError: 'Le serveur traite la demande. Patiente et réessaie.',
          heroesPageTitle: 'Contacts', heroesPromoHeading: 'Espace Maître',
          heroesPromoDesc: "Ajoute des personnes une fois — et génère des chansons pour elles en un tap. Historique complet avec paroles.",
          heroesPromoFeaturesTitle: 'Ce qui est inclus :',
          heroesF1: '✦ Nombre illimité de personnes', heroesF2: '✦ Génération solo & duo rapide',
          heroesF3: '✦ Préférences de style musical', heroesF4: '✦ Historique complet avec paroles & analyse',
          heroesF5: '✦ Audio directement depuis la fiche personne',
          heroesTrialBtn: '1 jour gratuit — essayer', heroesSubBtn: "Obtenir Laboratoire — 3 250 ₽",
          heroesSubNote: '30 titres',
          heroFormTitle: 'Ajouter une personne', heroRelLabel: 'Relation', heroBirthdateHint: 'Sélectionne jour, mois et année',
          heroTimeBirthLabel: 'Heure de naissance', heroStyleLabel: 'Styles musicaux préférés', heroStylePh: 'pop, jazz, électronique…',
          requestPreferredStyleLabel: 'Style de la chanson',
          requestPreferredStylePh: "pop, soul, R&B, hip‑hop, techno, house, ambient…",
          styleQuickLabel: '✦ Styles musicaux',
          heroRelOpt0: '— choisir —', heroRelOpt1: 'Mère', heroRelOpt2: 'Père', heroRelOpt3: 'Fille', heroRelOpt4: 'Fils',
          heroRelOpt5: 'Sœur', heroRelOpt6: 'Frère', heroRelOpt7: 'Grand-mère', heroRelOpt8: 'Grand-père',
          heroRelOpt9: 'Mari', heroRelOpt10: 'Femme', heroRelOpt11: 'Être aimé',
          heroRelOpt12: 'Ami', heroRelOpt13: 'Amie', heroRelOpt14: 'Collègue', heroRelOpt15: 'Mentor', heroRelOpt16: 'Autre',
          dateDay: 'Jour', dateMonth: 'Mois', dateYear: 'Année',
          scLoading: 'Chargement…', scCheckingAccess: 'Vérification de ton forfait : Soul Chat inclus ou tu as un accès individuel…', scTyping: 'Soul Chat écrit…', scHeroTagline: 'Dialogue avec ton âme', scPromoIntro: "Soul Chat est ton assistant IA qui te comprend comme un meilleur ami ou ton Moi Supérieur. Répond aux questions sur ton caractère, ta vocation et ton chemin.",
          scPromoErrorText: 'Obtenez un forfait ou achetez un accès 24h', scPromoRetryBtn: 'Actualiser',
          scMoreBtnText: 'Plus ↓', scMoreBtnCollapse: 'Réduire ↑', scStat1: "signalent moins d'anxiété", scStat2: 'se sentent compris',
          scStat3: 'trouvent des réponses plus vite', scStat4: 'reviennent',
          scExamplesTitle: 'Exemples de questions',
          scEx1: '« Pourquoi est-il si difficile pour moi de parler de mes sentiments ? »', scEx2: '« Quelle est ma principale peur et comment y faire face ? »',
          scEx3: '« Quelle est ma vocation et comment y parvenir ? »',
          profileNotifDisable: 'Désactiver les notifications', profileNotifEnable: 'Activer les notifications',
          scSubIncluded: "Soul Chat inclus dans le forfait", scChoosePlanBtn: 'Choisir un pack →', scSubMobileHint: "Paiement indisponible sur cette plateforme",
          scGiftHeading: 'Essaie Soul Chat — 24 heures', scGiftNote: 'Une fois par utilisateur',
          scGiftBtnText: 'Obtenir 24 heures gratuitement', scBuyDayNote: "Pas prêt pour un forfait ? Essaie l'accès individuel",
          scBuyDayBtnText: 'Ouvrir Soul Chat 24h — 2,99 $', scToastPaymentReceived: 'Paiement reçu, accès activé',
          scSubRequiredForReply: 'Forfait requis pour poursuivre le dialogue avec l\'Oracle',
          scPickerTabSynastryText: 'Compatibilité', scSynastryTeaserText: 'Compatibilité — dialogue pour deux cartes — disponible dans l\'offre Laboratoire',
          helpT1: 'Qu\'est-ce que YupSoul', helpB1: '<p>YupSoul crée une <strong>chanson personnelle rien que pour toi</strong> — basée sur ta date, heure et lieu de naissance. Le système analyse ta personnalité et écrit une chanson sur tes vraies qualités, ton chemin et ta force.</p><p>Ce n\'est pas un modèle — chaque chanson est unique et t\'appartient.</p>',
          helpT2: 'Ce qu\'on peut créer', helpB2: '<p><strong>Modes de création :</strong></p><ul><li><strong>Chanson sur moi</strong> — ton portrait sonore personnel : qui tu es, ta force et ton chemin intérieur</li><li><strong>Chanson pour deux</strong> — pour un couple (amoureux, amis). Analyse les deux dates et reflète l\'union</li><li><strong>Énergie du jour</strong> — une chanson pour une date et un lieu précis. Quelles opportunités s\'ouvrent en ce moment</li></ul><p><strong>Style musical :</strong></p><ul><li><strong>Style perso</strong> — choisis le genre et l\'ambiance manuellement</li><li><strong>Astro-style</strong> — le système choisit le style selon tes données</li><li><strong>Comme une star</strong> — nomme ton artiste préféré et la chanson sonnera comme la sienne</li></ul><p><strong>Requêtes rapides</strong> — idées prêtes : chanson de force, d\'anniversaire, méditative, lâcher-prise, et plus.</p><p><strong>Soul Chat</strong> — un assistant IA qui te comprend en profondeur. Pose des questions sur ton caractère, ta mission et ton chemin.</p>',
          helpT3: 'Combien de temps attendre', helpB3: '<p>Généralement <strong>5–15 minutes</strong>. Le bot enverra une notification quand ta chanson sera prête.</p><p>Tu peux fermer l\'appli — le résultat arrivera tout seul, rien ne sera perdu.</p>',
          helpT4: 'Je ne connais pas mon heure de naissance exacte', helpB4: '<p>Pas de problème. Coche <strong>« Heure inconnue »</strong> — le système créera une chanson complète avec les autres données.</p>',
          helpT5: 'Étincelles & paiement', helpB5: '<p><strong>Tu crées ta première chanson tout de suite — une minute en cadeau ; elle te plaît — ouvre-la en entier avec un petit paiement.</strong></p><p>Les Étincelles se gagnent : récupère ton Étincelle du jour (+2 chaque jour, +10 pour chaque série de 7 jours), +30 pour la visite guidée, +5 pour les notifications.</p><p>Gagne plus d\'Étincelles en invitant des amis : partage ton lien (Profil → Inviter un ami). Quand un ami invité prend un abonnement — tu reçois des Étincelles.</p>',
          helpT6: 'Paiement & codes promo', helpB6: '<p>Les générations supplémentaires sont payantes selon le tarif. Les options de paiement s\'affichent lors de la commande.</p><p>Si tu as un <strong>code promo</strong> — saisis-le sur l\'écran de paiement. Les codes sont sensibles à la casse.</p>',
          helpLegalTitle: 'Informations légales', helpLegalSeller: 'Prestataire : EI Anton Tataurov, NIF 920000802153, Sébastopol', helpLegalSupport: 'Support : bouton « Écrire au support » ci-dessus — réponse sous 24 h', helpLegalOffer: 'Conditions : paiement, remboursement, règles', helpLegalPrivacy: 'Confidentialité', errPayPlatform: 'Paiement non disponible sur cette plateforme',
          helpT7: 'Quelque chose a mal tourné', helpB7: '<p><strong>L\'appli s\'est fermée ou a affiché une erreur</strong> — essaie de rouvrir le bot. Les commandes inachevées sont restaurées automatiquement.</p><p><strong>Payé mais pas de chanson</strong> — attends 15–20 minutes. Si rien n\'arrive — dis au bot « chanson non reçue ». Ou contacte le support.</p><p><strong>Code promo non accepté</strong> — vérifie la casse. Si tout est correct — écris-nous avec le code.</p>',
          helpPartnerTitle: 'Programme partenaire',
          helpT8: 'Soul Chat et forfaits', helpB8: '<p><strong>Soul Chat</strong> — dialogue avec ton âme selon tes données. Pose des questions sur le caractère, la vocation, les choix. Ouvert à tous : les 10 premières questions gratuites, puis 1 question = 1 Étincelle. Un abonnement retire la limite — Soul (50 questions/mois), Depth et Lab (illimité). Ou achète 24h d\'accès.</p><p><strong>Forfaits</strong> — Soul (5 titres + Soul Chat), Depth (15 titres + Soul Chat illimité), Lab (30 titres, répertoire, Soul Chat illimité). Dans Profil ou écran paiement.</p>',
          helpT9: 'Pour pros et praticiens', helpB9: '<p><strong>Répertoire et compatibilité.</strong> Tenez une fiche clients, analysez la compatibilité à partir de deux thèmes — une chanson par couple. Idéal pour astrologues et consultants.</p><p><strong>Volume sans perdre en qualité.</strong> Jusqu\'à 30 titres avec le forfait Lab. Contenu unique par client — sans modèles ni répétitions.</p><p><strong>Monétisation et cadeaux.</strong> Offrez des chansons aux clients, incluez-les dans vos forfaits ou vendez à part. Une minute de la première chanson en cadeau — essayez.</p>',
          helpT10: 'Ce que disent les utilisateurs', helpB10: '<p><em>« Incroyable ! La chanson a vraiment capté mon caractère et ce que je vis. La chair de poule ! »</em> — Anna M.</p><p><em>« Offerte à ma femme pour son anniversaire — elle a adoré ! On veut maintenant une chanson sur notre couple »</em> — Dmitry K.</p><p><em>« Une minute en cadeau, c\'est honnête. Qualité au top, je recommanderai »</em> — Elena V.</p>',
          helpSearchPh: 'Rechercher une question…', helpSearchAria: 'Rechercher une question', helpSearchClear: 'Effacer', helpFaqTitle: 'Questions fréquentes', helpSearchEmpty: 'Aucun résultat', helpFound: 'trouvé',
          helpHeroTitle: 'Comment pouvons-nous aider ?', helpHeroSub: 'Tout sur YupSoul — simple et concis. Trouve une réponse ou écris-nous.', helpPartnerSub: 'Gagne 20% sur les packs de tes amis', helpFoot: '✦ Nous sommes là — réponse sous un jour ✦',
          profileBalanceLbl: 'Solde d\'Étincelles',
          profileTracksLeftLbl: 'Morceaux restants',
          profileOnBalanceSuffix: 'sur le solde',
          homeIskryHintGuest: 'Commence — la première minute de ta chanson en cadeau',
          homeIskryHintEnough: 'Tu as {n} Étincelles — assez pour un titre',
          homeIskryHintLow: 'Tu as {n} Étincelles — invite un ami pour créer un titre',
          homeIskryHintZero: "Invite un ami — des Étincelles quand il s'abonne",
          songCounterLabel: 'personnes se sont découvertes',
          planFreeF1: 'Première chanson — une minute en cadeau', planFreeF2: 'Tous les formats',
          planBasicF1: '✦ 5 titres', planBasicF2: '✦ Soul Chat (50 messages)', planBasicF3: 'Historique commandes', planBasicSave: '−67% vs séparés',
          planPlusF1: '✦ 15 titres', planPlusF2: 'Soul Chat illimité', planPlusF3: 'Traitement prioritaire', planFeatDiary: "Journal de l'Oracle — une lecture chaque matin", planPlusF4: 'Historique complet', planPlusSave: '−72% vs séparés',
          planMasterF1: '✦ 30 titres', planMasterF2: 'Répertoire de personnes', planMasterF3: 'Historique des générations', planMasterF4: 'Soul Chat illimité', planMasterSave: '−83% vs séparés',
          perMonth: '/mois', iskryUnit: 'Étincelles', iskryStatEarned: 'Reçu', iskryStatSpent: 'Dépensé', iskryBreakdownSongs: 'Chansons', iskryBreakdownChat: 'Soul Chat', planBasicPrice: '810 ₽', planPlusPrice: '2 030 ₽', planMasterPrice: '3 250 ₽',
          scPlanBasicDesc: '5 titres + Soul Chat', scPlanPlusDesc: '15 titres + Chat illimité', scPlanMasterDesc: '30 titres + Chat illimité',
          planPlusF5: 'Choix du style musical', planMasterF5: 'Choix du style musical',
          profileTracksThisMonth: 'Titres dans le pack', profileTracksRemaining: '{n} titres restants',
          profileRenewalDate: 'Pack actif', planStatusActive: '✓ Actif', profileNextCharge: 'Prochain prélèvement : {date}',
          profileCardNotLinked: 'Carte non liée. Liez une carte pour la gestion complète.',
          profileBindCard: 'Lier la carte', profileUnbindCard: 'Délier la carte', profileChangeCard: 'Changer de carte', profilePaymentMethod: 'MOYEN DE PAIEMENT',
          profileActiveSubscription: 'Forfait actif', profileCancelSubscription: 'Désactiver le forfait', profileSubCardLabel: 'Carte liée',
          subCancelledGrace: 'Pack utilisé', subCancelledBadge: 'Utilisé', subReactivateBtn: 'Réactiver', profileSubExpires: 'Pack actif',
          subExpiredTitle: 'Pack utilisé', subExpiredMsg: 'Ton pack {planName} a été utilisé', subExpiredReactivate: 'Réactiver {planName}', subExpiredOrSingle: 'ou acheter une chanson',
          trackLimitUpgradeToPlus: 'Passer à Plus — 15 pistes', trackLimitUpgradeToMaster: 'Passer au Labo — 30 pistes',
          subExpiryBanner3d: 'Le pack est valable encore {n} jours', subExpiryBanner1d: 'Le pack est valable encore 1 jour', subExpiryManageBtn: 'Gérer',
          iskryNotEnough: 'Tu as {current} Iskry. Il en faut encore {needed}', unlockIskryNeedPack: "Ta première chanson s'ouvre avec un pack d'Iskry. Choisis un pack — ou ouvre-la directement", iskryNoneToast: 'Pas d\'Iskry pour payer', iskryNeedTopup: "Il te faut {needed} Iskry pour payer. Recharge ton solde ou saisis un code promo ci-dessous.", iskryNotEnoughFull: "Pas assez d'Iskry (il en faut {n}). Recharge ton solde ou saisis un code promo.", iskryNotEnoughVk: "Pas assez d'Iskry (il en faut {n}). Recharge ton solde.", iskryNeedTopupVk: "Il te faut {needed} Iskry pour payer. Recharge ton solde.", iskryPayRetry: "Ça n'a pas marché. Réessaie ou choisis un autre moyen.", playLabel: '\u00c9couter', pauseLabel: 'Pause', suPromoNoted: 'Code enregistr\u00e9 — appliqu\u00e9 \u00e0 l\'ouverture', payAuthLost: 'Rouvre l\'application et réessaie.', payLinkCopied: 'Lien de paiement copié', iskryTopUpViaReferral: "Invite un ami — des Étincelles quand il s'abonne", iskryDepletedReferralHint: 'Plus d\'Iskry. Invite un ami !',
          soulChatExpiresIn: 'Accès : encore {hours}h {minutes}min',
          formStep1: 'Étape 1', formStep2: 'Étape 2', formStep3: 'Étape 3',
          refFriend1: 'ami', refFriend2: 'amis', refFriend5: 'amis', refLinkLoading: 'Chargement…',
          profileConnectedServices: 'Services connectés', profileLinkedLoading: 'Chargement…',
          profileLinkTgBtn: 'Lier Telegram', profileLinkGoogleBtn: 'Lier Google',
          refEarningsLabel: 'Tes Étincelles :',
          refNextHintFirst: 'Pour chaque ami qui crée une chanson — 10 Étincelles',
          refNextHintNext: 'Pour chaque ami qui crée une chanson — 10 Étincelles',
          iskryTitle: 'Tes Étincelles',
          linkedStatusLinked: 'Lié', linkedStatusNotLinked: 'Non lié', linkedStatusNoData: 'Pas de données', linkedStatusLoadFail: 'Échec du chargement',
          linkedGoogleLinked: 'Google lié !', linkedGoogleFail: 'Impossible de lier Google. Réessaie.', linkedConnFail: 'Connexion échouée. Vérifie ta connexion.',
          linkedTgOpenBot: 'Ouvre le bot dans Telegram et appuie sur Démarrer. Puis reviens ici et actualise la page.',
          profileLinkTgHint: 'Appuie sur le bouton pour ouvrir le bot, puis sur Démarrer pour lier.',
          linkedGoogleSdkFail: 'Google Sign-In indisponible. Essaie depuis un navigateur.',
          cancelSubFail: 'Impossible de désactiver le forfait. Réessaie.',
          trackLimitTitle: 'Limite atteinte',
          trackLimitMsg: 'Ta limite de morceaux pour ce mois est atteinte.',
          trackLimitHint: 'Mets à jour ton forfait ou achète un morceau séparément.',
          trackLimitActionsTitle: 'Et maintenant ?',
          trackLimitBuySingle: 'Acheter un morceau',
          trackLimitUpgrade: 'Améliorer le forfait',
          trackLimitPayIskry: 'Payer avec Iskry',
          trackLimitBackToProfile: 'Retour au profil',
          trackLimitPayHint: 'Limite de forfait atteinte. Paye pour un morceau supplémentaire.',
          labHintTitle: 'Laboratoire',
          labHintDesc: 'Enregistre les profils de tes proches et choisis-les en un clic — pas besoin de saisir les données à chaque fois',
          labHintGo: 'En savoir plus',
          labHintLater: 'Plus tard',
          cancelSubSuccess: 'Pack actif',
          cancelSubSuccessNoDate: 'Pack actif',
          profileSubscriptionCancelled: 'Pack utilisé',
          cancelSubConfirm: 'Désactiver le forfait ?\n\nL\'accès restera jusqu\'au {date}, puis ton profil passera au plan gratuit «Explorateur». Pas de remboursement pour le montant payé.',
          cancelSubConfirmNoDate: 'Désactiver le forfait ?\n\nL\'accès restera jusqu\'à la fin de la période payée, puis ton profil passera au plan gratuit «Explorateur». Pas de remboursement pour le montant payé.',
          cancelSubProgress: 'Annulation…',
          guestName: 'Invité',
          quickPickerLabel: '✦ Demandes rapides',
          inboxTitle: 'Notifications', inboxEmpty: 'Aucune notification', inboxOpen: 'Ouvrir',
          forWhoLabel: 'Pour qui générons-nous?', forWhoAddContact: '+ Ajouter un contact', pickFromLab: 'Choisir dans le Laboratoire', pickFromLabSelected: 'Choisi : ', pickFromLabEmpty: 'Aucune personne enregistrée. Ajoute-les dans le Laboratoire.', pickFromLabHint: 'Choisis une personne dans le Laboratoire — les champs se rempliront.',
          coupleSrcMePerson: 'Moi + Personne', coupleSrcCardCard: 'Carte + Carte', couplePerson1Label: 'Première personne', couplePerson1Pick: 'Choisir dans le Laboratoire', couplePerson1Required: 'Sélectionne la première personne dans le Laboratoire', coupleSelfCard: 'Moi',
          nameLbl: 'Prénom', birthdateLbl: 'Date de naissance', birthplaceLbl: 'Lieu de naissance', birthtimeLbl: 'Heure de naissance', birthtimeUnknownHint: 'Heure inconnue',
          payOvCardTitleDefault: 'Paiement forfait / commande', payOvTrialText: 'Utilise tes Étincelles!', payOvFreeClaimBtn: 'Payer en Étincelles — ' + ISKRY_PRICES.single_song + ' Étincelles',
          payOvPromoToggle: '▸ Vous avez un code promo?', orPay: 'Ou payez:', priceLabel: 'Prix:',
          payOvLinkHint: "Si la fenêtre ne s'est pas ouverte — copiez le lien et collez dans votre navigateur:",
          payOvCopyBtn: 'Copier le lien de paiement', payOvCheckBtn: "J'ai déjà payé — vérifier",
          payOvPromoConfirmBtn: 'Confirmer et envoyer',
          paymentThanksTitle: 'Paiement effectué', paymentThanksMsg: 'Chanson en cours de création. Arrivera dans le chat du bot. Vous pouvez fermer.',
          paymentThanksHintText: "Pas arrivée en 20 min? Écrivez au bot «chanson non reçue»",
          logoSubtitle: 'Oracle Musical', homeBrand: 'ORACLE MUSICAL',
          homeTeaser: 'Un don est caché dans ta date de naissance — révèle-le par une chanson', homeTeaserHtml: 'Un don est caché dans ta <span class="tagline-glow">date de naissance</span> — révèle-le par une <span class="tagline-glow">chanson</span><span class="tagline-underline"></span>',
          startBenefitAbout: 'Sur toi', startBenefitCompat: 'Compatibilité', startBenefitDaily: 'Chanson du jour', startBenefitFinance: 'Finances',
          wlHeadline1: 'Des chansons selon ta date de naissance',
          wlHeadline2: 'pour tous les moments de la vie',
          wlPlaylistKick: 'Crée ta playlist',
          wlPlaylistName: 'Des hits sur toi',
          wlPlaylistSub: 'par date de naissance · pour chaque occasion',
          wlTrack1Name: 'Je ne suis pas une fonction, je suis la vie',
          wlTrack1Desc: 'sur le fait d\'être vivant',
          wlTrack2Name: 'Gardienne du seuil',
          wlTrack2Desc: 'une chanson d\'anniversaire',
          wlTrack3Name: 'Pour ton amour',
          wlTrack3Desc: 'une déclaration',
          wlLoginTitleHtml: 'Écoute comment sonne <span class="home-card-title-accent">ta</span> date de naissance',
          wlProof: '3 000+ chansons déjà créées',
          loginVia: 'Se connecter via',
          review1: 'C\'est tout simplement fantastique ! Sérieusement, vous m\'avez lu ! Un super projet !', reviewAuthor1: 'Roman',
          review2: 'Génial ! Le style que j\'adore, les mots vont droit au cœur !', reviewAuthor2: 'Julia',
          review3: 'Comment l\'IA pouvait-elle savoir pour les plans, le café, les rapports ? Bravo !!!', reviewAuthor3: 'Gennady',
          review4: 'J\'ai adoré la dynamique : du calme au puissant. Certains moments correspondent !', reviewAuthor4: 'Alexandre',
          review5: 'La première est un chef-d\'œuvre ! Surpris, écouté 15 fois, envoyé à maman.', reviewAuthor5: 'Vladimir',
          review6: 'Très belle chanson légère, on peut vraiment méditer en l\'écoutant !', reviewAuthor6: 'Utilisateur',
          homeServiceDesc: 'Le seul service où une chanson est créée par une analyse profonde de ta date de naissance.',
          homeChoicesHead: 'SEULEMENT ICI', homeChoicesHeadMain: 'Essaie aujourd\'hui',
          homeChoiceMain1: 'Chanson du jour', homeChoiceMain2: 'Qui suis-je?', homeChoiceMain3: 'Style star', homeChoiceMain4: 'Compatibilité', homeChoiceMain5: 'Journal Oracle',
          // VK natif (oracle uniquement) : accueil, playlist vide, questions prédéfinies
          vkOracleHeroTitleHtml: 'L\'Oracle connaît ta <span class="home-card-title-accent">date de naissance</span> — et répond',
          vkOracleHeroCta: 'Poser une question', vkOracleChoicesHead: 'Demande aujourd\'hui',
          vkOracleChoice1: 'Qui suis-je?', vkOracleChoice2: 'Mon don', vkOracleChoice3: 'Argent', vkOracleChoice4: 'Amour',
          vkOracleAskBtn: 'Interroger l\'Oracle',
          vkOracleEmptyTitle: 'L\'Oracle répond à tes questions',
          vkOracleEmptyDesc: 'Interroge-toi — à partir de ta date de naissance',
          vkOracleQ1: 'Dis-moi qui je suis d\'après ma date de naissance — quel est mon caractère et sur quoi puis-je m\'appuyer?',
          vkOracleQ2: 'Quel est mon don d\'après ma date de naissance — qu\'est-ce qui m\'a été donné et comment le déployer?',
          vkOracleQ3: 'Comment cela se passe-t-il avec l\'argent d\'après ma date de naissance — où est mon canal d\'argent et qu\'est-ce qui l\'ouvre?',
          vkOracleQ4: 'Que dois-je savoir sur l\'amour et les relations d\'après ma date de naissance?',
          homeChoice1: 'Chanson du jour', homeChoice1Hint: 'Chaque jour porte une énergie unique. Découvre la tienne à travers la musique.',
          homeChoice2: 'Chanson rapide sur moi', homeChoice2Hint: 'Un clic — une chanson écrite à partir de ta date de naissance.',
          homeChoice3: 'Soul Chat', homeChoice3Hint: 'Ton assistant IA personnel basé sur ta date de naissance.',
          homeChoice4: 'Cadeau pour un ami', homeChoice4Hint: 'Surprends un proche avec une chanson unique sur ce qui le rend spécial.',
          navSoulChat: 'Oracle', navHelp: 'Aide', navLab: 'Contacts', navTracks: 'Playlist',
          navSoulChatFull: 'Oracle', navMyTracks: 'Playlist', navSoulChatShort: 'Oracle', navMyTracksShort: 'Playlist', myHeroesShort: 'Contacts', myHelpShort: 'Aide',
          soulChatPageTitle: 'Dialogue de l\'âme | Soul Chat', scHeroTitle: 'Dialogue de l\'âme | Soul Chat',
          myTracksPageTitle: 'Musique', mtGlabelRecent: 'Récents', mtCreateBtn: 'Créer une nouvelle chanson',
          myTracksPageSubtitle: 'Ta collection de clés sonores',
          mtHeroBadge: 'Clés sonores',
          mtHeroTitle: 'Chaque chanson est une clé unique vers ton âme',
          mtHeroDesc: 'Écoute, télécharge et partage. Tous tes titres sont stockés ici pour toujours.',
          myTracksLoading: 'Chargement des titres…',
          mtEmptyTitle: 'Tes chansons apparaîtront ici',
          mtEmptyDesc: 'Crée la première — à partir de ta date de naissance',
          mtEmptyCta: 'Créer une chanson',
          myTracksLoadMore: 'Charger plus',
          mtNowPlayingTitle: 'En cours',
          mtNpFromCollection: 'Depuis la collection',
          mtTabTracks: 'Mes morceaux', mtTabLiked: 'Favoris', mtTabRadio: 'Radio', mtSearchPh: 'Rechercher un titre', mtSearchAria: 'Recherche', mtLikedEmpty: 'Appuie sur ♡ — il apparaîtra ici.', mtActPlay: 'Écouter', mtActShare: 'Partager', mtHeroEyebrow: 'Ta collection', mtHeroSub: 'Créés à partir de ta date de naissance', mtHeroPlayAll: 'Tout jouer',
          mtActSpark: 'Étincelle', mtActText: 'Paroles', mtActAnalysis: 'Analyse', mtActDownload: 'Télécharger', mtActShare: 'Partager', mtActBroadcast: 'Diffuser', mtActGift: 'Offrir', mtActResing: 'Rechanter avec tes mots',
          shareSheetTitle: 'Partager la chanson', shareEyebrow: 'Ma chanson d\'âme', shareFootCreate: 'Crée la tienne', shareCardSub: 'Chanson selon ta date de naissance', shareFmtStory: 'Stories', shareFmtPost: 'Post', shareFmtLink: 'Lien', shareCopyBtn: 'Copie', shareSaveImg: 'Enregistrer l\'image', shareTgtLink: 'Lien', shareTgtStory: 'Stories', shareTgtMore: 'Plus', shareToVk: 'Vers Story VK', shareToOk: 'Partager sur OK', shareToWeb: 'Partager', shareToTg: 'Vers Telegram', shareVkStory: 'Vers la Story', shareVkWall: 'Sur le mur', shareHint: 'Envoie le lien à un proche — il l’ouvrira et écoutera toute la chanson.', shareCreateOwn: 'Crée ta propre chanson', shareCopied: 'Copié', shareRendering: 'Préparation de l\'image…', shareSaved: 'Image enregistrée', shareSaveFail: 'Échec de l\'enregistrement', karaokeTitle: 'Paroles', karaokeSub: 'Karaoké · ligne par ligne', diaryPwEyebrow: '3 jours d\'essai — terminés', diaryPwMsgFrom: 'YupSoul · ton réglage', diaryPwMsgTime: 'ce matin', diaryPwMsgBody: "Bonjour{name}. Aujourd'hui, une journée placée sous le signe de **l'ancrage et des décisions sereines**. Mieux vaut ne pas précipiter une conversation importante avant midi — elle ira plus facilement après.", diaryPwMsgPin: 'Appui du jour : une conversation chaleureuse avec un proche', diaryPwH: 'Tu as aimé commencer la journée ainsi ?', diaryPwSub: 'C\'est ton Journal. Chaque matin sur Telegram — un message personnel réglé sur ta journée. Les jours d\'essai sont terminés — continuons ensemble.', diaryPwFeat1Title: 'Arrive en privé', diaryPwFeat1Desc: 'Chaque matin, à l\'heure que tu choisis', diaryPwFeat2Title: 'Réglé sur ta date', diaryPwFeat2Desc: 'Pas un horoscope général — une lecture rien que pour toi', diaryPwFeat3Title: 'Thèmes — ton choix', diaryPwFeat3Desc: 'Amour, travail, énergie, relations', diaryPwPlan: 'Inclus dans les packs Profondeur et Laboratoire', diaryPwCta: 'Continuer le journal', karaokeEmpty: 'Les paroles ne sont pas encore disponibles', prismOracleRetry: 'L\'Oracle s\'est plongé dans ses pensées. Réessaie.',
          rdTitle: 'Radio', rdSubtitle: 'Des ondes infinies pour ton énergie', rdOnAir: 'en direct', rdLiveNow: 'En direct',
          rdYouLive: 'Tu es en direct', rdPitchTitle: 'Envoie ta chanson en direct', rdPitchSub: 'Toute la communauté YupSoul l\'entendra — un flux en direct de chansons d\'âme.', rdNowLive: 'En direct maintenant — un flux communautaire live', rdLiveTitle: 'Ta chanson joue pour tous', rdReady: 'prête', rdYourSong: 'ta chanson', rdV1t: 'Être entendu en direct', rdV1s: 'Des dizaines de personnes en direct maintenant', rdV2t: 'Étincelles pour les réactions', rdV2s: 'Les auditeurs aiment — tu gagnes des Étincelles', rdV3t: 'Entre dans le top de la semaine', rdV3s: 'Toute la communauté voit les meilleures chansons', rdRewardHtml: 'Une chanson en direct <b>gagne des Étincelles</b> — et les Étincelles deviennent de nouvelles chansons de ton âme.', rdGo: 'Envoyer en direct', rdGoHint: 'Tu peux la retirer du direct à tout moment', rdLeave: 'Retirer du direct', rdLeaveHint: 'Ta chanson passe dans le flux commun YupSoul Radio', rdStatListens: 'écoutes', rdStatHearts: 'j\'aime', rdStatSparks: 'Étincelles gagnées', rdReactHint: 'Les auditeurs réagissent à ta chanson', rdRankTop: 'Top de la semaine', rdRankWave: 'onde', rdRankOf: 'sur', rdRankClimb: 'Récolte des likes — grimpe dans le top de la semaine',
          rdSongOfDay: 'Chanson du jour', rdSongOfDaySub: 'Énergie du jour', rdNowListening: "À l'écoute", rdWaves: 'Ondes',
          rdCosmos: 'Cosmos', rdCosmosTag: 'Ambient profond', rdDuo: 'Deux âmes', rdDuoTag: 'Amour & liens',
          rdFlow: 'Flux', rdFlowTag: 'Argent & élan', rdCalm: 'Force tranquille', rdCalmTag: 'Méditation & calme',
          rdGroza: 'Orage', rdGrozaTag: 'Fort & puissant', rdListen: 'à l\'écoute', rdAllWaves: 'tout ›',
          rdQuiet: 'calme à l\'antenne', rdSomeone: 'Quelqu\'un', rdBeFirst: 'Silence à l\'antenne — sois le premier', rdEmpty: 'Cette onde se remplit encore', rdRadioArtist: 'YupSoul · Radio', rdShareToRadio: 'Partager sur la Radio', rdInRadio: 'Envoyé à la Radio', rdShareDone: 'Envoyé à la Radio pour modération', rdShareOff: 'Retiré de la Radio',
          rwMood: 'Selon l\'humeur', rwTender: 'Tendresse', rwPower: 'Force', rwLight: 'Lumière', rwFlight: 'Envol', rwCalm: 'Calme',
          rdWaveAll: 'Toutes les ondes', rdFresh: 'Nouveau à l\'antenne', rdTopWeek: 'Top de la semaine', rdNowOnAir: 'À l\'antenne', rdAnon: 'Anonyme', rdToday: 'aujourd\'hui', rdYesterday: 'hier', rdLike: 'J\'aime', rdSave: 'Enregistrer', rdListen2: 'Écouter', rdListensNow: 'écoute', rdEmpty2: 'Personne n\'a encore publié de chanson sur cette onde. Sois le premier — dans l\'onglet « Mes titres ».', rdSavedTitle: 'Enregistré', rdSavedEmpty: 'Les titres de la Radio que tu enregistres apparaîtront ici. Touche le marque-page.', rdSavedToast: 'Ajouté à la collection', rdUnsavedToast: 'Retiré de la collection', mtTabSaved: 'Enregistré', navCancel: 'Annuler', rdMore: 'Plus', rdReport: 'Signaler', rdBlockAuthor: "Masquer cet auteur", rdSheetCancel: 'Annuler', rdReportSent: 'Merci, nous allons regarder', rdReportHidden: "Morceau retiré de l'antenne", rdBlockDone: 'Nous ne montrerons plus cet auteur', rdActionFailed: "Ça n'a pas marché — réessaie", errReportSelf: "C'est ta propre chanson", errBlockSelf: "C'est ta propre chanson", errTrackNotFound: 'Morceau introuvable',
          pubInEther: 'À l\'antenne', pubTitle: 'Publier sur la Radio', pubSubtitle: 'D\'autres auditeurs entendront ta chanson. Tu peux la retirer à tout moment.', pubWave: 'Onde', pubShowAuthor: 'Afficher le nom de l\'auteur', pubAnon: 'Anonyme', pubGo: 'Publier', pubDoneTitle: 'Ta chanson est à l\'antenne !', pubDoneText: 'Les autres auditeurs la trouveront dans la Radio.', pubYou: 'Toi', pubFail: 'Échec de la publication',
          mngOnAir: 'À l\'antenne', mngManage: 'Gérer la diffusion', mngManageText: 'Les auditeurs peuvent l\'aimer et l\'enregistrer.', mngListeners: 'Écoutes', mngLikes: 'J\'aime', mngCollections: 'Dans les collections', mngOpenRadio: 'Ouvrir dans la Radio', mngUnpublish: 'Retirer de l\'antenne', mngUnpubDone: 'Retiré de l\'antenne', mtTrackDeleted: 'Chanson supprimée', mtUndo: 'Annuler',
          errTrackNotReady: 'Le titre n\'est pas encore prêt', errRadioWave: 'Choisis une onde', errRadioProfanity: 'Cette chanson contient des grossièretés — impossible de la diffuser à l\'antenne', errTasteLockedRadio: "Ouvre d'abord la chanson en entier — ensuite tu pourras la diffuser",
          mtSelectTrack: 'Choisir un titre',
          mtDownload: 'Télécharger',
          mtLyrics: 'Paroles',
          mtShare: 'Partager',
          mtLinkCopied: 'Lien copié',
          mtNoTitle: 'Chanson de l\'Ame',
          mtModeSingle: 'Pour moi',
          mtModeCouple: 'Pour deux',
          mtModeTransit: 'Énergie du jour', mtPlayError: 'Échec de la lecture', mtLyricsTitle: 'Paroles', mtAnalysisTitle: 'Analyse', mtCopied: 'Copié', mtCopyFail: 'Échec de la copie', mtCopyBtn: 'Copier', mtCloseBtn: 'Fermer', mtDownloading: 'Ouverture...', mtShareFail: 'Échec du partage', mtLinkCopied: 'Lien copié',
          dlUnlockTitle: 'On récupère ta chanson ? 🎵', dlUnlockSub: 'Choisis comment la garder — juste un pas chaleureux 🤍', dlUnlockJoin: 'Rejoindre et télécharger', dlUnlockOr: 'ou une petite tâche', dlUnlockShare: 'Partager la chanson', dlUnlockReview: 'Laisser un avis', dlUnlockReviewPh: "Quelques mots chaleureux sur l'app…", dlUnlockReviewSend: 'Envoyer et télécharger', dlUnlockUpsell: 'Avec un pack — téléchargements sans tâches.', dlUnlockClose: 'Plus tard', dlChecking: 'Une seconde, je vérifie…', dlDone: 'Téléchargement en cours', dlTryAgain: 'Je ne le vois pas encore — réessaie', dlReviewShort: "Un peu plus de mots — et c'est bon",
          dlGateTitle: 'Télécharger la chanson', dlGateEyebrow: 'Ta première chanson', dlGateHeadline: 'Reçois ta chanson en cadeau', dlGateLead: 'Accomplis une tâche ci-dessous — et le fichier de la chanson sera enregistré sur ton appareil. Voilà notre façon de grandir ensemble.', dlGateSteps: 'Étapes pour débloquer', dlGateAltB: 'Pas envie de tâches ?', dlGateAltRest: 'Prends un pack — télécharge toutes les chansons sans étapes.', dlGatePacks: 'Packs ›', dlGateLocked: 'Accomplis une tâche pour télécharger', dlGateReady: 'Télécharger la chanson', dlGateHint: 'Le fichier sera enregistré au format MP3 sur ton appareil', dlDoneTitle: 'Chanson téléchargée 🤍', dlDoneTextRest: 'est enregistrée sur ton appareil. Merci de rester avec nous — il y a encore beaucoup de musique à venir.', dlTrackFallback: 'Chanson de l’âme', dlTrackSub: 'Chanson de l’âme', dlTaskVkTitle: 'Rejoindre la communauté', dlTaskVkSub: 'YupSoul sur VK', dlTaskVkAct: 'Rejoindre', dlTaskShareTitle: 'Partager la chanson', dlTaskShareSub: 'Parle de YupSoul à tes amis', dlTaskShareAct: 'Partager', dlTaskReviewTitle: 'Laisser un avis', dlTaskReviewSub: 'Quelques mots chaleureux sur l’app', dlTaskReviewAct: 'Écrire',
          myTracksWipTitle: 'Page en cours de développement',
          myTracksWipText: 'Tes pistes apparaîtront bientôt ici. Tu peux créer une chanson ou ouvrir le Dialogue de l\'âme.',
          profileMyTracks: 'Mes pistes',
          footerSubManage: 'Gérer les forfaits', footerOffer: 'CGV', footerPrivacy: 'Confidentialité',
          webLoginOr: 'Ou', webLoginTelegram: 'Ouvrir dans Telegram', googleSignIn: 'Se connecter avec Google',
          webLoginTeaser: 'Connecte-toi avec Google pour créer des chansons personnalisées. Ou ouvre l\'appli dans Telegram.',
          bsPromoToggle: 'J\'ai un code promo',
          bsChooseMethod: 'Choisis le mode de paiement :',
          bsPayCard: 'Payer par carte',
          payTitle: 'Paiement de la chanson', paySecure: 'Sécurisé', cfTitle: 'Confirmation du paiement', successEyebrow: 'Paiement reçu', successEyebrowTaste: 'Ta première chanson', successReceiptName: "Chanson de l'âme", successReceiptSub: 'en préparation', successMaking: "L'Oracle écrit ta mélodie…", successAskOracle: "Demander à l'Oracle en attendant", successShare: 'Partager avec un proche', successReadyLine: 'Presque prêt — apparaîtra dans ta Playlist', successNotifyBtn: "Me prévenir quand c'est prêt", successNotifyDone: 'On te prévient dans VK ✓', successReadyTitle: 'Prêt — ta<br>chanson naît', successReadyLead: "Merci ! <b>Ta chanson de l'âme</b> se crée — elle apparaîtra dans l'onglet Playlist dans environ 15 minutes.", cfSub: 'Vérifie les détails — et on confirme.', cfWhat: 'Achat', cfIncludes: 'Inclus', cfTotal: 'À payer', cfPay: 'Confirmer et payer', payOrderEyebrow: 'Ta commande', payOrderMeta: 'Un morceau unique selon ta date · arrive dans Telegram en ~15 minutes', payPriceLabel: 'À payer', payPriceSub: 'Paiement unique · une chanson', payByIskry: 'Payer avec des Étincelles', payByPromo: 'On m\\\'a offert un code promo', payPromoSub: 'Saisis le code — on couvre le coût', pmTitle: 'Saisis le code promo', pmSub: 'On couvre le coût ou on ajoute des Étincelles.', pmBack: 'Retour au paiement', promoLen3to50: 'Le code promo doit comporter de 3 à 50 caractères', payRetry: 'Réessaie, s\\\'il te plaît.', promoChecking: 'Vérification du code promo...', payTrustSecure: 'Paiement sécurisé', payTrustHold: 'Commande conservée 7 jours', payOvBack: 'Retour',
          bsPayStars: 'Payer avec les Étoiles',
          bsTopupIskry: 'Recharger les Étincelles', tuPack100: '= 1 chanson', giftVkUnavail: 'Ce cadeau ne peut pas être ouvert dans cette version de l’appli',

          bsDiscount: 'Réduction',
          bsGotIt: 'Compris',
          bsClose: 'Fermer',
          bsPaymentNotOpened: 'Si la page de paiement ne s\'est pas ouverte — appuie sur « Copier le lien » et ouvre-le dans ton navigateur.',
          bsPaymentAccepted: 'Paiement accepté.<br><br>Tu peux fermer cette fenêtre et revenir à Telegram — la chanson arrivera dans le chat du bot.',
          bsDiscountApplied: 'Réduction : {amount} {currency}',
          bsPromoNotFound: 'Code promo introuvable',
          bsPromoExpired: 'Code promo expiré',
          bsPromoLimit: 'Limite d\'utilisation atteinte',
          bsPromoInvalid: 'Code promo invalide',
          bsPromoCheckError: 'Erreur de vérification',
          bsPromoApplied: 'appliqué',
          bsFree: 'Gratuit',
          bsConfirm: 'Confirmer',
          bsConnectingBank: 'Connexion à la banque…',
          bsPaymentCreateError: 'Impossible de créer le paiement. Essaye un autre moyen.',
          bsTracksPerMonth: 'morceaux personnalisés',
          navBack: 'Retour', navClose: 'Fermer', loading: 'Chargement…', btnRefresh: 'Actualiser', btnSave: 'Enregistrer', btnCancel: 'Annuler', btnSending: 'Envoi…', btnSaving: 'Enregistrement…', btnOpening: 'Ouverture…', btnUnlinking: 'Dissociation…',
          helpPageTitle: 'Aide & Support',
          phName: 'Prénom (facultatif)', phBirthplace: 'Moscou, Londres, New York...', phName2: 'Prénom (facultatif)', phBirthplace2: 'Moscou, Londres, New York...', nameHintEmpty: 'Écris un prénom : il sera chanté dans la chanson.', nameHintFilled: 'Ce prénom sera chanté dans la chanson. Efface-le si tu ne veux pas l\'entendre.', phTransitDate: 'JJ.MM.AAAA', phTransitTime: 'HH:MM', phTransitLocation: 'Moscou, Londres, New York...', phRequest: 'Par exemple : sur le courage de tout recommencer', phPreferredStyle: 'Genre ou ambiance musicale',
          phProfileName: 'Ton nom', phDateDisplay: 'jj mois aaaa', phProfileCity: 'Ville de naissance', phPromoInput: 'Entrer le code promo',
          heroesAddBtn: '+ Ajouter une personne', heroesCountWord: 'personnes', heroNamePh: 'Nom de la personne', heroBirthplacePh: 'Moscou, Londres, New York...', heroStylePh: 'pop, jazz, électronique…', heroNotesPh: 'Ce qu\'il faut retenir de cette personne',
          heroEditTitle: 'Modifier la personne', heroAddTitle: 'Ajouter une personne', confirmUnsavedExit: 'Vous avez des modifications non enregistrées. Quitter?',
          heroSaveFail: 'Échec de l\'enregistrement. Réessaye.', heroDeleteFail: 'Échec de la suppression. Réessaye.',
          heroIncomplete: 'La date ou le lieu de naissance de cette personne sont manquants. Ouvre la carte et complète.',
          errHeroIncomplete: 'La personne sélectionnée n\'a pas toutes les données. Ajoute la date et le lieu de naissance dans le Labo.',
          errMissingFields: 'Indique ta date de naissance — la chanson en a besoin.',
          errVkSongsOracleOnly: 'Ici c\'est l\'Oracle qui travaille — pose-lui une question sur toi.', errClaimLocked: 'L\'Étincelle du jour n\'est pas encore disponible.', errClaimAlready: 'Tu as déjà pris l\'Étincelle du jour — reviens demain.',
          vkFormStubHint: 'La génération de chansons n\'est pas disponible sur cette plateforme',
          diarySaved: 'Journal configuré !',
          diaryTrialStarted: 'Essai de 3 jours activé !',
          diaryActivateFail: 'Impossible d\'activer. Réessaie.',
          profileBalanceTitle: 'Mon solde',
          errGenderRequired: 'Le genre ne peut pas être vide. Choisis Féminin ou Masculin.',
          errInvalidGender: 'Valeur de genre invalide. Autorisé : Féminin ou Masculin.',
          today: 'Aujourd\'hui',
          scAskOracle: 'Demander à l\'Oracle',
          fillProfileCta: 'Remplir le profil',
          diaryContinueInChat: 'Continuer dans le chat',
          heroGenHistory: 'Historique des générations', heroLyricsLabel: 'Paroles', heroAnalysisBtn: 'Analyse', heroLetterBtn: 'Lettre d\'accompagnement', heroListenBtn: 'Écouter',
          noInternet: 'Pas d\'internet',
          partnerTitle: 'Tableau de bord partenaire', partnerStatusActive: 'Actif', partnerBalUnit: 'Étincelles · non dépensées', partnerStatsTitle: 'Statistiques', partnerPromoTapCopy: 'Copier le texte', partnerPromoTapDone: 'Copié', partnerDashFootNote: 'Paiements hebdomadaires', partnerApplyNamePh: 'Votre nom', partnerApplySocialsPh: '@pseudo, liens des chaînes', partnerApplyPlanPh: 'Comment comptez-vous attirer des utilisateurs',
          partnerApplySubmit: 'Envoyer la candidature', partnerApplySent: 'Candidature envoyée ! Nous l\'examinerons et vous notifierons.',
          partnerApplyPending: 'Candidature en cours d\'examen', partnerApplyPendingDesc: 'Nous examinerons votre candidature et vous notifierons via Telegram.',
          partnerApplyRejected: 'Candidature non approuvée', partnerApplyNameReq: 'Entrez votre nom', partnerApplySocialsReq: 'Entrez vos réseaux sociaux',
          partnerDashWalletPh: 'Coordonnées de paiement', partnerDashWalletReq: 'Indiquez vos coordonnées de paiement',
          partnerDashNoAccruals: 'Pas encore de crédits', partnerDashPayoutProcessing: 'Demande de retrait en cours',
          partnerDashPayoutSubmit: 'Demander un retrait', partnerDashPayoutSent: 'Demande de retrait envoyée !',
          partnerDashCodeSaved: 'Code enregistré !', partnerDashCodeMinLen: 'Minimum 3 caractères',
          partnerDashOpenTg: 'Ouvrez l\'application via Telegram',
          partnerDashSendError: 'Erreur d\'envoi', partnerDashRetryLater: 'Réessayez plus tard',
          partnerApplyPageTitle: 'Programme partenaire', partnerHowItWorks: 'Comment ça marche',
          partnerStepApply: 'Soumettre une candidature', partnerStepApproval: 'Approbation', partnerStepShare: 'Partagez votre lien', partnerStepBonus: 'Recevez des bonus',
          partnerEarnHeadingHtml: 'Gagnez avec <span style="display:inline-block;background:linear-gradient(120deg,#f472b6 0%,#ec4899 22%,#a78bfa 45%,#f97316 70%,#fbbf24 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 12px rgba(236,72,153,0.35));animation:accentGradientShift 6s ease-in-out infinite;">YupSoul</span>',
          partnerEarnDescHtml: 'Invitez vos amis et recevez un <strong style="color:var(--primary-color);">bonus de 20% en Étincelles</strong> de chaque pack acheté par vos filleuls. Versement sur demande une fois par semaine.',
          partnerSparksPerMonth: 'Étincelles / mois', partnerTierSoul: 'Âme', partnerTierDepth: 'Profondeur', partnerTierLab: 'Laboratoire',
          partnerBonusNoteHtml: 'Les bonus sont crédités en Étincelles<br>Versement sur demande une fois par semaine',
          partnerHeroTitleHtml: 'Gagne avec <span class="pa-grad">YupSoul</span>',
          partnerHeroSub: 'Invite tes amis et reçois une part de chacun de leurs packs — en Étincelles.',
          partnerStatCapHtml: '<b>en Étincelles</b> sur chaque pack de tes filleuls — à chaque achat',
          partnerStep1Title: 'Postule', partnerStep1Sub: 'Parle-nous de toi et de tes canaux',
          partnerStep2Title: 'Sois approuvé', partnerStep2Sub: 'Nous examinons et ouvrons l’accès',
          partnerStep3Title: 'Partage ton lien', partnerStep3Sub: 'Invite tes amis sur YupSoul',
          partnerStep4Title: 'Reçois des bonus', partnerStep4Sub: 'Les Étincelles tombent à chaque pack',
          partnerTiersTitle: 'Combien tu reçois par pack', partnerTiersNote: 'Le bonus est crédité sur chaque pack acheté par ton filleul',
          partnerPayoutTitle: 'Comment être payé',
          partnerPfSparks: 'Étincelles', partnerPfSparksSub: 's’accumulent', partnerPfPayout: 'Versement', partnerPfPayoutSub: 'une fois par semaine',
          partnerPayoutFreq: 'une fois par semaine', partnerPayoutFreqSub: 'paiements', partnerPayoutMin: 'à partir de 100 000', partnerPayoutMinSub: 'Étincelles à retirer',
          partnerApplyFormHeading: 'Candidature partenaire', partnerApplyFormSub: 'Parle-nous de toi — nous ouvrirons l’accès au programme.',
          partnerApplyBtn: 'Postuler',
          partnerNameLabelHtml: 'Votre nom <span style="color:var(--primary-color);">*</span>',
          partnerSocialsLabelHtml: 'Réseaux sociaux / chaînes <span style="color:var(--primary-color);">*</span>',
          partnerPlanLabel: 'Votre plan de promotion',
          partnerAgreeTextHtml: 'J\'ai lu les <a href="#" onclick="document.getElementById(\'partnerAgreementBlock\').style.display=document.getElementById(\'partnerAgreementBlock\').style.display===\'none\'?\'block\':\'none\';return false;" style="color:var(--primary-color);text-decoration:underline;">conditions du programme partenaire</a> et je les accepte',
          partnerFaqTitle: 'Questions fréquentes',

          partnerFaq2Q: 'Quand les paiements sont-ils effectués ?', partnerFaq2A: 'Les demandes de retrait sont collectées pendant la semaine et traitées en lot une fois par semaine.',
          partnerFaq3Q: 'Quel est le minimum pour un retrait ?', partnerFaq3A: 'Minimum : 100 000 Étincelles. La demande de versement se fait dans le tableau de bord partenaire.',
          partnerFaq4Q: 'Comment le bonus est-il calculé ?', partnerFaq4A: '20% de bonus en Étincelles est crédité sur chaque pack du filleul. Âme — 1 980, Profondeur — 4 980, Laboratoire — 7 980 Étincelles.',
          partnerLegalTitle: 'Conditions du programme partenaire',
          partnerLegalBodyHtml: '<p style="font-weight:700;margin-bottom:6px;">1. Dispositions générales</p><p>1.1. Le présent Accord régit la participation au Programme partenaire du service YupSoul (ci-après — la Plateforme).</p><p>1.2. Un Partenaire est un utilisateur dont la candidature a été approuvée par l\'administration de la Plateforme.</p><p>1.3. En soumettant une candidature, vous confirmez avoir lu et accepté les conditions du présent Accord.</p><p style="font-weight:700;margin:12px 0 6px;">2. Conditions de participation</p><p>2.1. Pour participer, vous devez soumettre une candidature via le formulaire dans l\'application.</p><p>2.2. L\'administration se réserve le droit d\'approuver ou de rejeter une candidature sans explication.</p><p>2.3. Le statut de partenaire peut être révoqué à tout moment en cas de violation des conditions de l\'Accord.</p><p style="font-weight:700;margin:12px 0 6px;">3. Programme de bonus</p><p>3.1. Le Partenaire reçoit un bonus de 20% en Étincelles de chaque abonnement souscrit via son lien de parrainage.</p><p>3.2. Les bonus sont crédités en Étincelles (monnaie interne de la Plateforme) à chaque renouvellement d\'abonnement du filleul.</p><p>3.3. Montants des bonus par forfait : Âme — 1 980 Étincelles/mois, Profondeur — 4 980 Étincelles/mois, Laboratoire — 7 980 Étincelles/mois.</p><p>3.4. La Plateforme se réserve le droit de modifier les montants des bonus avec notification préalable aux partenaires.</p><p style="font-weight:700;margin:12px 0 6px;">4. Versements</p><p>4.1. Montant minimum de retrait : 100 000 Étincelles.</p><p>4.2. La demande de versement se fait dans le tableau de bord partenaire ; le paiement est effectué selon les coordonnées convenues avec le partenaire.</p><p>4.3. Les demandes de retrait sont collectées pendant la semaine et traitées en lot une fois par semaine.</p><p>4.4. La Plateforme peut rejeter une demande de versement en cas de suspicion de fraude.</p><p style="font-weight:700;margin:12px 0 6px;">5. Obligations du partenaire</p><p>5.1. Le Partenaire s\'engage à promouvoir la Plateforme de bonne foi, sans informations trompeuses.</p><p>5.2. Interdits : mailings spam, fausses inscriptions, création de comptes fictifs, utilisation de contenu diffamatoire.</p><p>5.3. Le Partenaire est seul responsable du paiement des impôts sur les revenus perçus conformément à la législation de son pays.</p><p style="font-weight:700;margin:12px 0 6px;">6. Responsabilité</p><p>6.1. La Plateforme ne garantit pas un revenu spécifique au partenaire.</p><p>6.2. En cas de détection d\'actions frauduleuses, le statut de partenaire est révoqué et les fonds accumulés peuvent être gelés.</p><p>6.3. La Plateforme n\'est pas responsable des actions du partenaire envers des tiers.</p><p style="font-weight:700;margin:12px 0 6px;">7. Modification des conditions</p><p>7.1. La Plateforme peut modifier les conditions du présent Accord en notifiant les partenaires via Telegram.</p><p>7.2. La poursuite de la participation au programme après notification signifie l\'acceptation des nouvelles conditions.</p><p style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.7rem;">Publié : 22 mars 2026</p>',
          partnerDashHeaderHtml: 'Partenaire <span style="background:linear-gradient(135deg,var(--primary-color),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">YupSoul</span>',
          partnerDashBonusLine: 'Bonus : 20% en Étincelles',
          partnerLinksLabel: 'Vos liens de parrainage', partnerCopy: 'Copier', partnerShareMsg: 'Crée une chanson personnelle à partir de ta date de naissance. YupSoul — une musique qui te ressemble', partnerLinksLoading: 'Les liens se chargent encore', partnerShare: 'Partager',
          partnerLinkLanding: 'Page d\'atterrissage', partnerLinkPartnerPage: 'Page partenaire',
          partnerCodeLabel: 'Code personnel', partnerCodeExample: 'Exemple : ANNA_MUSIC — votre lien devient ...?start=ref_ANNA_MUSIC',
          partnerPromoTitle: 'Textes promotionnels prêts à l\'emploi',
          partnerPromoText1: 'YupSoul — musique personnalisée basée sur votre date de naissance. Des morceaux uniques qui résonnent rien que pour vous. Essayez — 100 Étincelles en cadeau de bienvenue !',
          partnerPromoText2: 'Offrez une chanson unique à un être cher ! YupSoul crée des morceaux personnels basés sur la date de naissance — un cadeau parfait et irremplaçable.',
          partnerPromoCopyHint: 'Appuyez sur le texte pour copier',
          partnerQrTitle: 'QR-code de votre lien', partnerSaveQr: 'Enregistrer le QR', partnerQrHint: 'À utiliser pour la promotion hors ligne',
          partnerStatInvited: 'Invités', partnerStatPaid: 'Achetés', partnerConversion: 'Conversion',
          partnerMinPayoutLabel: 'Minimum pour retrait', partnerMinPayoutValue: '100 000 Étincelles',
          partnerWalletLabel: 'Coordonnées de paiement',
          partnerEarningsTitle: 'Historique des gains', partnerPayoutsTitle: 'Historique des paiements',
          paymentConfirmed: 'Paiement confirmé !', songCanClose: 'Tu peux fermer l\'appli — rien ne sera perdu.',
          successWhileWaiting: 'En attendant', successNewSong: 'Nouvelle chanson',
          songNotArrived: 'Pas reçue en 20 min ? Écris au bot « chanson non reçue ».', goToBot: 'Aller au bot',
          songCreating: 'Ta chanson est en cours de génération.', songUsually: 'Habituellement 10-15 minutes.',
          ptTariffActivated: 'Forfait activé !', ptWelcomeTo: 'Bienvenue dans', ptTracksAndChat: 'Pistes et Soul Chat disponibles.', ptGoHome: 'Accueil',
          ptScOpened: 'Soul Chat ouvert !', ptScAccess: '24 heures d\'accès', ptScConfirmed: 'Paiement confirmé. Tu peux commencer à discuter.', ptGoSc: 'Vers Soul Chat',
          ptSongInQueue: 'Chanson en file d\'attente', ptSongCreating: 'Ta chanson est en cours de création. Le résultat arrivera dans le bot.',
          payOvCardBtn: 'Payer par carte', payOvRubHint: 'par carte bancaire', payOvOrIskry: 'ou {amount} Étincelles',
          toastCardLinked: 'Carte liée', toastCardLinkFail: 'Échec de la liaison. Réessaye.',
          toastConnFail: 'Échec de connexion. Vérifie ta connexion.',
          toastCardUnlinked: 'Carte dissociée.', toastCardUnlinkFail: 'Échec de la dissociation. Réessaye.',
          toastSubActivated: 'Pack activé !', toastScOpened: 'Soul Chat ouvert pour 24 heures',
          toastPayFail: 'Échec de la création du paiement', toastConnError: 'Erreur de connexion',
          toastActivateFail: 'Échec de l\'activation. Réessaye.', toastMasterTrialUsed: 'Jour d\'essai déjà utilisé', toastAuthLost: 'Rouvre l\'app pour continuer.', toastNoChanges: 'Aucun changement',
          toastConnRetry: 'Échec de connexion. Vérifie la connexion et réessaye.',
          toastScExpired: 'Temps d\'accès expiré — ouvre Soul Chat à nouveau',
          toastIskryCharged: '{amount} Étincelles débitées',
          toastReferralCreditUsed: 'Crédit de parrainage utilisé',
          toastEntitlementUsed: 'Titre acheté utilisé',
          toastTrialUsed: 'Titre cadeau activé',
          toastSubscriptionUsed: 'Compté dans le forfait',
          toastPromoUsed: 'Code promo appliqué',
          toastOpenInTg: 'Ouvre l\'appli depuis le bot dans Telegram.',
          toastPayOpenTg: 'Paiement indisponible sur cette plateforme',
          vkSupportLinkCopied: 'Lien vers la communauté YupSoul copié : {url}',
          vkSupportLink: 'Notre communauté YupSoul : {url}',
          vkTabletTitle: 'Ouvrez sur téléphone ou ordinateur',
          vkTabletText: 'YupSoul est optimisé pour les téléphones et les ordinateurs. Sur une tablette, l\'interface peut ne pas fonctionner correctement — veuillez ouvrir YupSoul depuis votre téléphone ou sur vk.com dans un navigateur.',
          vkTabletCommunity: 'Notre communauté YupSoul',
          okSupportLinkCopied: 'Lien vers le groupe YupSoul copié : {url}',
          okSupportLink: 'Notre groupe YupSoul sur Odnoklassniki : {url}',
          toastSubsOnDesktop: "Paiement indisponible sur cette plateforme",
          toastUpdateTg: 'Pour payer, mets à jour Telegram vers la version 6.1 ou supérieure.',
          toastPromoApplied: 'Code promo appliqué ! Analyse disponible',
          toastFirstSubmit: 'Envoie d\'abord une demande de chanson', toastShareForward: 'Une fenêtre de transfert Telegram va s\'ouvrir',
          toastLinkCopiedFriend: 'Lien copié — envoie-le à un ami !',
          toastWelcomeIskry: 'Tu as reçu {amount} Étincelles — bienvenue !',
          toastUpdateTgStars: 'Pour le paiement Stars, mets à jour Telegram vers la version 6.9 ou supérieure.',
          toastInvoiceFail: 'Impossible de créer la facture. Réessaye.',
          toastFillForm: 'Remplis d\'abord le formulaire de demande.', toastIskryPaid: 'Étincelles débitées — chanson en cours !', toastSubPaid: 'Analyse payée !',
          mtAuthExpired: 'Session expirée. Actualise la page ou reconnecte-toi.', mtLoadError: 'Impossible de charger la liste. Vérifie ton internet.', mtPlayRetry: 'Lecture échouée. Réessaie dans une minute.',
          mtCreatingSong: 'Création de ta chanson...', mtUsuallyTime: 'Habituellement 10-15 minutes. Apparaîtra dans « Mes pistes ».',
          mtGenDelayed: 'Génération en retard. Vérifie « Mes pistes » plus tard.',
          mtAnalyzing: 'Analyse de la carte…', mtWritingLyrics: 'Écriture des paroles…', mtShapingSound: 'Je façonne le son…', mtRecording: 'Enregistrement de la musique…',
          mtGenFailed: 'Impossible de créer la chanson', mtGenFailedDesc: 'Une erreur est survenue lors de la génération. Crée une nouvelle demande ou contacte le support.',
          scGreeting: 'Salut, je suis ton oracle 🤍 Demande-moi ce que tu veux : sur toi, ton chemin, tes relations. Je suis là.',
          ctxSelfBtn: 'À propos de moi', ctxCompatBtn: 'Compatibilité',
          ctxSub: 'De qui parlons-nous aujourd\'hui — l\'Oracle le garde en tête.',
          scPairPickTitle: 'Vous deux', scPairPickSub: 'Lecture du duo — comment vous résonnez ensemble.',
          ctxModeOne: 'Une carte', ctxModeCompat: 'Compatibilité',
          ctxYou: 'Toi', ctxYourChart: 'ta date de naissance', ctxMeBadge: 'c\'est toi', ctxAddPerson: 'Ajouter une personne', ctxPlankLabel: 'Contexte défini', ctxPlankOne: 'sur {name}', ctxPlankPair: 'le duo {a} et {b}', ctxPlankPrism: 'ton analyse « {title} »',
          ctxHintPickOne: '<b>Choisis une carte</b> — l\'Oracle parlera de cette personne.',
          ctxHintOneSelected: 'Le chat portera sur une personne.',
          ctxHintPickTwo: '<b>Choisis-en deux</b> — l\'Oracle analysera leur compatibilité.',
          ctxApply: 'Appliquer', ctxApplyOne: 'Appliquer · {name}', ctxApplyPair: 'Analyser le couple · {a} et {b}',
          scCopy: 'Copier', scCopied: 'Copié',
          diaryEntryTitle: 'Lecture du jour',
          yesterday: 'Hier',
          scPrismWord: 'Lecture', scPrismBackToList: 'Retour aux lectures', diaryWaitTitle: 'Ta lecture arrive', diaryWaitText: 'Arrive à {time} — en un message.', diaryFeedEarlier: 'Avant', diaryFeedCount: '{n} lectures', diaryThemesTitle: 'Sur quoi écrire', diaryThemesHint: '1–3 thèmes', diaryStreakLine: '{n} jours de suite', diaryPickLine: 'Arrive à {time} · un message par jour', diaryHeadTitle: 'Journal', diaryHeadSub: 'Une lecture courte chaque jour — sur ta carte et sur la journée', diaryStatConversations: 'lectures', diaryStatDays: 'jours de suite', diaryStatTopics: 'thèmes',
          scChipLonely: 'Je me sens seul', scChipBurnout: 'Je suis épuisé', scChipSelflove: 'Comment s\'aimer ?',
          scQaLabel: 'Par où commencer', scQaKtoyaT: 'Qui suis-je vraiment ?', scQaKtoyaS: 'Me comprendre en profondeur', scQaKtoyaQ: 'Qui suis-je vraiment ? Aide-moi à me comprendre en profondeur.', scQaTrevogaT: 'Je me sens anxieux', scQaTrevogaS: 'Exprimer et respirer', scQaTrevogaQ: 'Je me sens anxieux. Je veux exprimer et respirer.', scQaReshenieT: 'Aide-moi à décider', scQaReshenieS: 'Trouver ma réponse', scQaReshenieQ: 'Aide-moi à prendre une décision et trouver ma réponse.', scQaPodderzhkaT: 'Reste avec moi', scQaPodderzhkaS: 'Quand je manque de soutien', scQaPodderzhkaQ: 'Reste avec moi. Je manque de soutien.',
          scOracleFreeLeft: 'Questions offertes : {n} sur 10', scOracleIskryMode: '1 question = 1 Étincelle · tu as {n}', scOracleNeedIskry: 'Tes questions offertes sont épuisées. Désormais 1 question = 1 Étincelle — récupère ton Étincelle quotidienne dans Cadeaux ou recharge.', scOracleGetIskry: 'Récupérer une Étincelle', scOracleFreeWarn: 'Il te reste 3 questions offertes. Ensuite, une Étincelle arrive chaque jour — une suffit pour une nouvelle question.', scWallTitle: 'Tes questions offertes sont épuisées. Désormais une question coûte une Étincelle.', scWallTitleClaim: "Tes questions offertes sont épuisées. Prends l'Étincelle du jour — une suffit pour une nouvelle question.", scWallTitleDone: "L'Étincelle du jour est déjà à toi. La prochaine arrive demain.", scWallClaimedMsg: "L'Étincelle est à toi — pose ta question.", scWallGoGifts: 'Ouvrir Cadeaux', scPrismNeedIskryVk: "Pas encore assez d'Étincelles. Tu peux prendre celle du jour dans Cadeaux.", scWallClaimBtn: "Prendre l'Étincelle du jour", scWallJoinBtn: 'Rejoindre la communauté', scWallNote: 'La communauté publie la lecture du jour chaque matin. Nous créditons 30 Étincelles pour ton adhésion.', scWallClaimDone: "L'Étincelle est à toi", scWallPrismText: "Une grande lecture sur toi est déjà ouverte — « Nom de l'âme ». Lis-la.", scWallNoteLow: 'Les Étincelles se cumulent dans Cadeaux — passe chaque jour.',
          scPlaceholder: 'Que ressens-tu ?', scHistoryEmpty: 'Tes demandes récentes apparaîtront ici', scHistoryToggle: 'Historique',
          bannerPendingSub: 'Forfait en attente', bannerPendingSubDesc: 'Paiement pas encore confirmé. Continue la configuration du forfait.',
          bannerPendingIskry: 'Ta demande attend !', bannerPendingIskryDesc: 'Utilise les Étincelles — crée ta chanson.',
          bannerPendingOrder: 'Commande en attente', bannerPendingOrderDesc: 'Tu as une demande en attente de paiement.',
          valNameMin: 'Le nom doit contenir au moins 2 caractères', valBirthdate: 'Sélectionne la date de naissance',
          valBirthplace: 'Le lieu de naissance doit contenir au moins 3 caractères',
          valBirthtime: 'Indique l\'heure de naissance ou coche « Je ne sais pas »', valGender: 'Sélectionne le genre',
          appUpdating: 'L\'appli doit \u00eatre actualis\u00e9e', payOvDefault: 'Paiement', payOvPaymentReq: 'Paiement de la demande',
          linkedOpenBrowser: 'Ouvre le lien dans un navigateur et lie Google là-bas.',
          linkedConnFail: 'Connecte-toi avec Google et actualise la page',
          scQuickBuyDay: 'Accès 24 heures — 2,99 $',
          iskryPaySuccess: 'Étincelles débitées — chanson en cours !', iskryPayingProgress: 'Débit des Étincelles...', iskryPayingStatus: 'Débit des Étincelles et lancement de la génération...',
          paymentRequiredHint: 'Un paiement est nécessaire pour créer une chanson.',
          processing: 'Traitement...',
          payCopyFail: 'Échec de la copie',
          paymentPageIntroOrPay: 'Entrez un code promo ou choisissez un moyen de paiement ci-dessous.',
          trackLimitResubmitHint: 'Remplis le formulaire et envoie — l\'écran de paiement s\'ouvrira.',
          paymentThanksOk: 'Terminé !',
          apiNotConfigured: 'Adresse API non configurée. Ouvre l\'application via le lien du serveur.',
          btnGoHome: 'Accueil', btnClose: 'Fermer', btnDone: 'Terminé', btnSave: 'Enregistrer',
          btnApply: 'Appliquer', btnShare: 'Partager', btnCopied: 'Copié !', btnBack: '← Retour',
          btnMore: 'Plus', btnFind: 'Chercher', btnRefresh: 'Actualiser', btnTry: 'Essayer',
          btnActivateFree: 'Activer gratuitement', btnActivating: 'Activation...',
          btnConfirmAndSend: 'Confirmer et envoyer', btnConfirming: 'Confirmation...',
          btnCreateSong: 'Créer ma chanson', btnCreateMore: 'Créer un autre titre',
          btnTrySoulChat: 'Essayer Soul Chat', btnInviteFriend: 'Inviter un ami',
          btnGoToPayment: 'Passer au paiement', btnContinueSub: 'Continuer le paiement du forfait',
          btnReceiveInTg: 'Recevoir les chansons dans Telegram', btnPickFromLab: 'Choisir dans le Laboratoire',
          btnGet24hFree: 'Obtenir 24 heures gratuites', btnBindCard: 'Lier la carte',
          btnUnbindCard: 'Délier la carte', btnChoosePlan: 'Choisir un forfait', btnSettings: '⚙ Paramètres',
          payCheckingPayment: 'Vérification du paiement…', payWaitingBank: 'En attente de confirmation bancaire. Quelques secondes en général.',
          payWaitingConfirm: 'En attente de confirmation…', payNoData: 'Aucune donnée à vérifier. Le statut sera mis à jour dans le profil.',
          payReceived: 'Paiement reçu. Vérification de l\'activation…',
          payReturnHome: 'Tu peux revenir à l\'accueil — le statut sera mis à jour.',
          payBankNotConfirmed: 'La banque n\'a pas encore confirmé. Si le montant a été débité — ne t\'inquiète pas.',
          payBankNotConfirmedRetry: 'La banque n\'a pas encore confirmé le paiement. Réessaie plus tard.',
          payConfirmedPlan: 'Paiement confirmé. Le forfait « {plan} » est actif.',
          payAnalysisPaid: 'Analyse payée !', payAnalysisAvailable: 'Tu peux maintenant obtenir une analyse détaillée de ta chanson.',
          payDeepAnalysis: 'Analyse approfondie', payNotConfirmed: 'Paiement non confirmé',
          payContactSupport: 'Ça n\'a pas aidé ? Écris au support.', payCheckFailed: 'Impossible de vérifier le statut du paiement. Réessaie plus tard.', payCheckTakesTimeTitle: 'Vérification du paiement', payCheckTakesTime: 'Si l\'argent a été débité, nous t\'enverrons la confirmation sur Telegram. Tu peux retourner à l\'accueil.',
          paySoulChatOpened: 'Soul Chat ouvert !', payConfirmedChat: 'Paiement confirmé. Tu peux commencer à discuter.',
          payToSoulChat: 'Vers Soul Chat', payCreatingLink: 'Création du lien…',
          payCreatingInvoice: 'Création de la facture…', payPromoApplied: 'Code promo appliqué !',
          payPaid: 'Payé !', payOpeningPayment: 'Ouverture du paiement…',
          payConnectingBank: 'Connexion à la banque…', payByCard: 'Payer par carte',
          payLoading: 'Chargement…', payAlreadyPaidCheck: 'J\'ai déjà payé — vérifier',
          payChecking: 'Vérification...', payPaidByCardCheck: 'J\'ai payé par carte — vérifier',
          payFormNotOpened: 'Si le formulaire de paiement ne s\'est pas ouvert — copie le lien :',
          payCopyLink: 'Copier le lien de paiement', payCopied: 'Copié ✓',
          payPlanActivated: 'Forfait « {plan} » activé !',
          formEnterName: 'Entrer le nom', formNoAuth: 'Non autorisé',
          formSaving: 'Enregistrement…', formDataSaved: 'Données enregistrées ✓',
          formSaveError: 'Erreur d\'enregistrement', formEnterPromo: 'Entrer le code promo', promoActivated: 'Code promo activé !', promoNotFound: 'Code promo introuvable', promoExpired: 'Code promo expiré', promoUsedUp: 'Code promo non valide', promoAlreadyActivated: 'Code promo déjà activé', promoDiscountWord: 'Réduction',
          formPromoError: 'Vérification échouée. Réessaie plus tard.', formSecondPerson: 'Deuxième personne',
          selectDay: 'Jour', selectMonth: 'Mois', selectYear: 'Année',
          labelName: 'Nom', labelBirthdate: 'Date de naissance', labelBirthplace: 'Lieu de naissance',
          labelBirthtime: 'Heure de naissance', labelDontKnow: 'Je ne sais pas', labelGender: 'Genre',
          labelCity: 'Ville', labelPlan: 'Forfait',
          genderMale: 'Masculin', genderFemale: 'Féminin', genderSelect: 'Choisir',
          formStep1: 'Étape 1', formStep2: 'Étape 2', formStep3: 'Étape 3',
          formYourData: 'Tes données', formDataNeeded: 'Nécessaires pour les paroles personnalisées',
          formCityHint: 'Commence à taper une ville et choisis dans la liste.',
          formTimeUnknown: 'Heure inconnue', formSongLang: 'Langue de la chanson', formLangTooltip: 'Langue des paroles de la chanson et de l\'analyse',
          formAnalysisLang: 'Langue de l\'analyse', formLangTooltipNoLyrics: 'Langue de ton analyse et de ta lettre',
          lyricsHeading: 'La voix de la chanson', lyricsSubtitle: 'Aura-t-elle des mots ?',
          lyricsSung: 'Avec paroles', lyricsSungDesc: 'On chante ta chanson',
          lyricsInstrumental: 'Musique seule', lyricsInstrumentalDesc: 'Une mélodie née de ta date',
          lyricsOwn: 'Ton propre texte', lyricsOwnDesc: 'On chante ce que tu écris',
          phCustomLyrics: 'Écris tes lignes — on les chantera',
          customLyricsHint: 'Écris comme tu le sens, les couplets et le refrain, on s\'en occupe. Une chanson de trois minutes demande environ 45 lignes. Ces chansons restent chez toi — elles ne passent pas à l\'antenne.', charsShort: 'car.', customLyricsShortWarn: 'pour trois minutes il en faut environ 1400 — là ce sera plus court', customLyricsEnough: 'de quoi faire une vraie chanson',
          alertCustomLyrics: 'Écris les paroles — au moins quelques lignes',
          errCustomLyricsShort: 'Écris les paroles — au moins quelques lignes',
          errCustomLyricsProfanity: 'Il y a ici des mots que nous ne pouvons pas chanter',
          errRadioOwnLyrics: 'Les chansons sur ton texte restent chez toi — on ne les diffuse pas',
          birthDateTooltip: 'Choisir la date de naissance', birthTimeTooltip: 'Choisir l\'heure de naissance',
          formMePlusHuman: 'Moi + Personne', formCardPlusCard: 'Carte + Carte',
          formPickFromLabHint: 'Choisis une personne du Laboratoire — les champs seront remplis automatiquement',
          formTransitMode: 'Énergie du jour', formTransitDate: 'Date de l\'événement',
          formTransitTime: 'Heure de l\'événement', formTransitCity: 'Ville pour l\'énergie du moment',
          formRequestLabel: 'Que vas-tu explorer aujourd\'hui ?', formQuickPicks: '✦ Choix rapides',
          formForWho: 'Pour qui génère-t-on ?', formForSelf: 'Pour moi',
          styleManual: 'Saisir manuellement', styleAstro: 'Son des planètes', styleStar: 'Style d\'artiste',
          styleStarHint: 'Entre le nom de l\'artiste, le titre ou la bande sonore du film...',
          styleQuickLabel: '✦ Styles musicaux',
          stylePresetPop: 'Pop', stylePresetRock: 'Rock', stylePresetRap: 'Rap / hip-hop',
          stylePresetElectronic: 'Électronique / techno / house',
          stylePresetAmbient: 'Ambient / méditatif', stylePresetAcoustic: 'Acoustique / piano / ballade',
          langRussian: 'Russe', langUkrainian: 'Ukrainien',
          oracleThinking: 'L\'oracle réfléchit', oracleGenerating: 'Analyse en cours, patiente ~30 secondes',
          oracleExample: 'EXEMPLE D\'ANALYSE', oracleGenerateFail: 'Échec de la génération. Remplis ta date de naissance dans le profil.',
          oracleConnError: 'Erreur de connexion. Réessaie plus tard.', oracleViewAnother: 'Voir un autre exemple',
          oracleConfiguring: 'Configuration...', oracleStart3Days: 'Commencer — 3 jours gratuits', oracleOnboardingRetry: 'Ça n\'a pas marché. Réessaie.',
          oracleLoadFail: 'Échec du chargement.', oracleDiaryReply: 'réponse',
          toastNetworkError: 'Erreur réseau — réessaie', toastSaved: 'Enregistré', toastError: 'Erreur',
          toastAnalysisAvailable: 'Analyse déjà disponible — écris au bot',
          toastOrderFail: 'Impossible de créer la commande. Réessaie plus tard.',
          statusNoRequests: 'Aucune demande disponible', loading: 'Chargement...',
          noSavedPeople: 'Aucune personne enregistrée.', noEarningsYet: 'Aucun gain pour le moment',
          subConnecting: 'Connexion…', subTrialPeriod: 'Période d\'essai',
          subTrial1Day: '1 jour gratuit — essayer',
          scAccessRemaining: 'Accès : encore {h}h {m}min', scOpenFor30: 'Ouvrir pour 30 Étincelles',
          scSelectCard: 'Choisir une carte...', scContextSelf: 'Sur toi', scHistoryDivider: '✦ historique du chat ✦',
          scDemoMode: 'MODE DÉMO',
          successTitle: 'Demande acceptée !', successDesc: 'Ta chanson est en cours de génération.',
          successBotHint: 'Appuie sur Start dans le bot — les futures chansons arriveront dans Telegram',
          successWhileWaiting: 'En attendant ta chanson', successMoreSong: 'Encore une chanson',
          footerOffer: 'CGU', footerPrivacy: 'Confidentialité', footerSubManage: 'Gérer les forfaits',
          navOracle: 'Oracle', navPlaylist: 'Playlist', navContacts: 'Contacts', navHelp: 'Aide',
          heroesTitle: 'Laboratoire', heroFormTitle: 'Ajouter un héros',
          mtTitle: 'ma playlist', mtEmpty: 'Pas encore de titres',
          mtEmptyDesc: 'Crée la première — à partir de ta date de naissance',
          mtLoadMore: 'Charger plus',
          mtAudioRefreshFail: 'Impossible de charger le titre. Réessaie plus tard.',
          mtPendingTitle: 'Création du titre…', mtPendingStuckTitle: 'Échec de la création', mtPendingStuckSub: 'Contactez le support — nous rembourserons les Étincelles', mtAnalysisPending: 'L\'analyse est encore en cours. Reviens dans quelques minutes.', mtShuffleNeedTracks: 'Il te faut au moins 2 titres pour mélanger',
          mtPendingSub: 'Prêt dans 5–15 minutes',
          diarySetupTitle: 'Configure ton Journal',
          diaryTopicCareerLabel: 'Carrière', diaryTopicCareerDesc: 'Décisions et finances',
          diaryTopicRelationshipsLabel: 'Relations', diaryTopicRelationshipsDesc: 'Dynamique avec les proches',
          diaryTopicHealthLabel: 'Santé', diaryTopicHealthDesc: 'Énergie et corps',
          diaryTopicGrowthLabel: 'Croissance', diaryTopicGrowthDesc: 'Habitudes et développement',
          diaryTopicCreativityLabel: 'Créativité', diaryTopicCreativityDesc: 'Inspiration',
          diaryTopicTransformationLabel: 'Changements', diaryTopicTransformationDesc: 'Transformation',
          diaryTopicPurposeLabel: 'Chemin', diaryTopicPurposeDesc: 'Sens et mission',
          diaryTopicPeaceLabel: 'Paix', diaryTopicPeaceDesc: 'Équilibre et soutien', diarySetupEyebrow: "Journal de l'Oracle", diaryPickedTpl: 'Sélectionné {n} sur 3', diaryPickAtLeastOne: 'Choisis au moins un thème', diaryEnableBtn: 'Activer le journal', diaryFootNote: "L'analyse arrive le matin — thèmes modifiables à tout moment",
          shareSheetTitle: 'Partager ta chanson', shareEyebrow: "Ma chanson d'âme", shareFootCreate: 'Crée ta chanson', shareFmtStory: 'Stories', shareFmtPost: 'Post', shareFmtLink: 'Lien', shareCopyBtn: 'Copie', shareSaveImg: "Enregistrer l'image", shareTgtLink: 'Lien', shareTgtStory: 'Stories', shareTgtMore: 'Plus',
          vkDoorTitle: 'Une porte vers un monde de nouvelles émotions — ouvre-la avec l\'Oracle Musical', vkDoorBody: "Une Étincelle, c'est une question à l'Oracle : sur ta journée, tes relations, ce qui ne te lâche pas. Je te rappellerai de la prendre chaque matin et j'écrirai quand ta chanson naîtra. Désactivable dans le profil.", vkDoorYes: 'Ouvrir la porte', vkDoorNo: 'Plus tard', consentBonus: '+5 Étincelles pour les notifications', consentTitle: 'Reste connecté', consentTextVk: "Une Étincelle, c'est une question à l'Oracle : sur ta journée, tes relations, ce qui ne te lâche pas. Je te rappellerai de la prendre chaque matin : +2 par jour, +10 pour une semaine complète. Un message par jour, désactivable dans le profil.", consentTextTg: 'Active les notifications — ton Étincelle du jour chaque matin et un message quand ta chanson est prête. Rien que du chaleureux, sans spam.', consentTextWeb: 'Les notifications arrivent dans Telegram. Ouvre le bot — tu recevras un message quand ta chanson sera prête, et ton Étincelle du jour.', consentBtnVk: 'Autoriser les notifications', consentBtnTg: 'Activer les notifications', consentBtnWeb: 'Ouvrir dans Telegram', consentLater: 'Plus tard', consentLegalHtml: 'En acceptant, tu acceptes les <u>conditions de la newsletter</u>. Tu peux te désabonner à tout moment.', consentTermsBody: 'On écrit seulement quand ça compte : un mot quand ta chanson est prête, l\'Étincelle du jour chaque matin et de rares nouvelles du service. E-mail au maximum une fois par semaine. Se désabonner à tout moment — bouton dans le profil ou lien dans l\'e-mail. Tes coordonnées ne sont jamais transmises ni utilisées pour de la publicité tierce.',
          oracleOptinTitle: 'Passer te voir le matin ?', oracleOptinDesc: 'Pendant que ta chanson prend vie, je peux t\'envoyer une courte lecture chaque matin : ce qui compte aujourd\'hui, où ménager ton énergie, où est ton moment.', oracleOptinYes: 'Oui, envoie', oracleOptinNo: 'Pas maintenant', oracleOptinNote: '3 jours offerts. Désactivable à tout moment.', oracleOptinDone: 'C\'est fait — je passe demain matin.',
          diarySetupDesc: 'Choisis 1 à 3 sujets. Chaque matin — une analyse personnalisée.',
          diaryDeliveryTime: 'Heure de livraison', diaryReceiveDaily: 'Recevoir les analyses quotidiennes',
          diaryTopics: 'Sujets', diaryTrialEnded: 'Période d\'essai terminée',
          diaryTrialEndedDesc: 'Abonne-toi à Profondeur ou Laboratoire pour les analyses quotidiennes.',
          diaryFirstArrival: 'Ta première analyse arrivera à l\'heure choisie.',
          oracleTabChat: 'Chat', oracleTabDiary: 'Journal',
          settingsTitle: 'Paramètres',
          scHeroTitle: 'Cœur à cœur | Soul Chat',
          scPromoText: 'Soul Chat — ton assistant IA qui te comprend en profondeur.',
          scGoToChat: 'Aller au chat →', scMoreDetails: 'Plus de détails ↓',
          scStat1: 'signalent moins d\'anxiété', scStat2: 'se sentent compris',
          scStat3: 'trouvent des réponses plus vite', scStat4: 'reviennent',
          scExTitle: 'Exemples de questions',
          scEx1: '« Pourquoi est-ce si difficile pour moi de parler de mes sentiments ? »',
          scEx2: '« Quelle est ma plus grande peur et comment la gérer ? »',
          scEx3: '« Quelle est ma vocation et comment y parvenir ? »',
          scGiftHeading: 'Essaie Soul Chat — 24 heures', scGiftNote: 'Une fois par utilisateur',
          scSubIncluded: 'Soul Chat inclus dans le forfait',
          scChoosePlan: 'Choisir un forfait →', scOpenFor24h: 'Ouvrir Soul Chat pour 24h',
          scPayByCard: 'Carte (T-Bank) — 199 ₽',
          scPickerTitle: 'Contexte du chat', scPickerSingle: 'Une carte',
          scPickerSynastry: 'Compatibilité (2 cartes)',
          scPickerCardA: 'Carte A', scPickerCardB: 'Carte B',
          scNoRequestTitle: 'Nous avons besoin de tes données',
          scNoRequestText: 'Soul Chat construit une conversation personnalisée basée sur tes données.',
          scSynastryTeaser: 'Compatibilité — un dialogue basé sur deux dates de naissance.',
          scOpenPlan: 'Ouvrir le forfait →', scSelectLabel: 'Choisir...',
          scPromoError: 'Obtiens un forfait ou achète un accès de 24 heures',
          profilePromo: 'J\'ai un code promo',
          profilePromoTitle: 'On m\'a offert un code promo',
          profilePromoSub: 'Active-le — reçois des Étincelles bonus',
          profilePromoSectionTitle: 'Code promo',
          profileLoadError: 'Impossible de charger le profil',
          profileInvited: 'Invités', profileActivated: 'Activé', profileIskry: 'Étincelles',
          profileEarningsLabel: 'Tes Étincelles :', profileEarningsHint: 'Les Étincelles servent à acheter des chansons et des fonctionnalités',
          profileListenDownload: 'Écouter et télécharger les titres', profileCreateSongBtn: 'Créer ta chanson',
          profileNoCard: 'Aucune carte liée. Lie une carte pour la gestion complète.',
          relSelect: '— choisir —', relMother: 'Mère', relFather: 'Père', relDaughter: 'Fille', relSon: 'Fils',
          relSister: 'Sœur', relBrother: 'Frère', relGrandmother: 'Grand-mère', relGrandfather: 'Grand-père',
          relHusband: 'Mari', relWife: 'Épouse', relPartner: 'Partenaire',
          relFriend: 'Ami', relGirlfriend: 'Amie', relColleague: 'Collègue',
          relMentor: 'Mentor', relOther: 'Autre',
          heroDateHint: 'Choisis le jour, le mois et l\'année',
          optional: 'facultatif', heroIntro: 'À partir de la <b>date de naissance</b>, l\'oracle compose une chanson et des analyses personnelles.', heroRelPartner: 'partenaire', heroRelDaughter: 'fille', heroRelSon: 'fils', heroRelMom: 'maman', heroRelDad: 'papa', heroRelFriendM: 'ami', heroRelFriendF: 'amie', heroRelMentor: 'mentor', heroRelOther: 'autre', heroPlaceHint: 'Commence à taper une ville et choisis dans la liste.', heroNoTime: 'Je ne connais pas l\'heure exacte', heroSexSkip: 'Ne pas préciser',
          wguLabel: 'Pendant que ta chanson est créée', wguTitle: 'Découvre ce que ta date de naissance dit de toi',
          wguPrice: 'Analyse approfondie — 40 Étincelles', wguBtn: 'Obtenir l\'analyse', daDeepDesc: 'Transcription approfondie — une analyse plus détaillée tenant compte de ton lieu et heure de naissance : ton essence, tes forces et tes domaines de croissance, les thèmes clés de ta vie et les périodes, et le sens de ta chanson. En mots, personnellement pour toi.',
          payThanksTitle: 'Paiement reçu', payThanksSubtitle: 'demande acceptée',
          payThanksDesc: 'Ta chanson est déjà en cours de génération. Habituellement 10–15 minutes.',
          payThanksAfsTitle: 'Ton Étincelle brille', payThanksAfsSubtitle: 'Prêt(e) à aller plus loin ?',
          payThanksHint: 'Pas arrivée en 20 minutes ? Écris au bot « chanson non arrivée »',
          statusRequestAccepted: 'Demande acceptée', statusSongCreating: 'Chanson en cours de création. Elle arrivera dans le chat du bot. Tu peux fermer la fenêtre.',
          qrSaved: 'QR enregistré ✓',
          heroesPromoHeading: 'Espace personnel pour les praticiens',
          heroesPromoDesc: 'Ajoute des personnes une fois — et génère des chansons pour eux en un clic.',
          heroesPromoFeatures: 'Ce qui est inclus :', scBuyDayNote: 'Pas prêt pour un forfait ? Essaie l\'accès individuel',
          homeTeaserHtml: 'Ta <span class="tagline-glow">date</span> de naissance cache un don, révèle-le à travers une <span class="tagline-glow">chanson</span>',
          payOvSubtitle: 'Ta chanson personnelle', payOvCardTitleSingle: 'Chanson personnelle',
          payOvCardTitleCouple: 'Chanson pour deux', payOvCardTitleTransit: 'Énergie du jour',
          payOvCardTitleAnalysis: 'Analyse textuelle', payOvCardTitleSc: 'Conversation intime — 24 heures',
          payOvSubtitleSingle: 'Ta chanson personnelle', payOvSubtitleCouple: 'Une chanson pour vous deux',
          payOvSubtitleTransit: 'Énergie de ta journée', payOvSubtitleAnalysis: 'Analyse approfondie',
          payOvSubtitleSc: 'Soul Chat pour 24 heures', payOvSubtitleDefault: 'Ta chanson',
          payOvPromoApplied: 'Code promo appliqué', payOvFreeGen: '— génération offerte',
          payOvIskryHint: 'ou {amount} Étincelles', payOvPriceHint: 'en payant par carte',
          payOvUpsellLabel: 'Plus avantageux en pack', payOvUpsellBtn: 'Prendre le pack',
          payOvUpsellPackTitle: 'Pack « Âme » — 5 chansons', payOvUpsellFeat1: '5 chansons au lieu d\'une', payOvUpsellFeat2: 'Chat Oracle inclus', payPackPerSong: '/chanson', payPackPerVote: ' voix/chanson',
          payOvOfferText: 'En payant, vous acceptez les', payOvOfferLink: 'conditions générales',
          payOvPromoConfirmBtn: 'Confirmer et envoyer',
          confirmTitle: 'Demande acceptée !',
          confirmDesc1: 'Analyse de tes données et création d\'une chanson unique.',
          confirmDesc2Bot: 'La chanson arrivera dans ce chat. Tu peux fermer l\'appli — rien ne sera perdu.',
          confirmDesc2Web: 'La chanson apparaîtra dans « Mes morceaux ». Tu peux fermer l\'appli — rien ne sera perdu.',
          confirmContinueBtn: 'Continuer →',
          planConfirmPay: 'Payer', planConfirmCancel: 'Annuler',
          profileLogout: 'Se déconnecter', profileOfferLink: 'CGU',
          monthJan: 'Janvier', monthFeb: 'Février', monthMar: 'Mars', monthApr: 'Avril',
          monthMay: 'Mai', monthJun: 'Juin', monthJul: 'Juillet', monthAug: 'Août',
          monthSep: 'Septembre', monthOct: 'Octobre', monthNov: 'Novembre', monthDec: 'Décembre',
          createSong: 'Créer une chanson',
          csWhileWaiting: 'En attendant', csMyTracks: 'Mes morceaux', csInvite: 'Inviter', csNewSong: 'Encore une chanson',
          genStage1: 'Je lis ta date de naissance', genStage2: 'J\'explore le son de tes étoiles', genStage3: 'Je trouve les bons mots', genStage3NoLyrics: 'Je cherche ton son', genStage4: 'Je compose la musique',
          mtUpsellTitle: 'Ce n\'est que le début', mtUpsellText: 'Tu as aimé le son de ton âme ? Offre une chanson à un proche — ta mère, ton amour, un ami.', mtUpsellCreate: 'En créer une autre', mtUpsellSub: 'Plus de chansons — acheter un pack',
          iskraClaimTitle: 'Étincelle du jour', iskraClaimTextCan: 'Passe chaque jour et prends une Étincelle 🤍 Avec elle, tu peux poser n\'importe quelle question sur toi à l\'Oracle.', iskraClaimTextDone: 'L\'Étincelle du jour est à toi 🤍 Reviens demain pour une nouvelle.', iskraClaimStreak: 'Série : {n}', iskraClaimBtn: 'Prendre l\'Étincelle', iskraClaimBtnDone: 'Reviens demain',
          navGifts: 'Cadeaux', navMenuGifts: 'Cadeaux', giftsTitle: 'Cadeaux', giftsSubtitle: 'Passe chaque jour — prends ton Étincelle', giftsExplainer: 'Chaque jour, une Étincelle t\'attend ici — juste parce que tu es là 🤍 Une seule suffit pour poser une question sur toi à l\'Oracle, et cent forment une chanson entière sur toi.', iskraValueTitle: 'À quoi servent les Étincelles', iskraValueQuestion: 'Demande à l\'Oracle tout sur toi — c\'est une Étincelle', iskraValueSong: 'Réunis-en cent — et une chanson de ton âme naît', iskraValueCta: 'Demander à l\'Oracle', giftsEmptyHint: 'Crée ta première chanson — et l\'étincelle quotidienne s\'ouvrira ici 🤍', iskraClaimErr: 'L\'Étincelle n\'a pas été créditée, ton solde n\'a pas changé.', iskraClaimRetry: 'Réessayer', iskraCookieFrom: 'Le message de l\'Oracle pour aujourd\'hui', giftsProgLabel: 'sur le solde', giftsBalanceTopup: 'Solde d\u0027Étincelles — recharger', giftsFirstRunTitle: 'L\'Étincelle du jour s\'ouvre après ta première chanson', giftsFirstRunSub: '+2 Étincelles par jour, et +10 après 7 jours d\'affilée. Les Étincelles servent aux questions à l\'Oracle et à ta prochaine chanson.', giftsFirstRunCta: 'Créer ta première chanson', giftsEmptyTitle: 'Tes Étincelles apparaîtront ici', giftsEmptySub: 'Crée ta première chanson — et récupère ton Étincelle du jour chaque jour', giftsBackHome: '← Accueil',
          giftsSpendCta: 'Poser une question', giftsSpendSub: 'Pose n\'importe quelle question sur toi dans le chat', giftsRefTitle: 'Invite un ami', giftsRefSub: "Des Étincelles quand ton ami s'abonne", giftsRefReward: '+Étincelles', giftsRefTag: 'Partage ton lien — quand un ami prend un abonnement, tu reçois des Étincelles.', giftsRefStatInvited: 'Invités', giftsRefStatSongs: 'Ont créé', giftsRefStatEarned: 'Étincelles reçues', giftsRefCopy: 'Copier', giftsRefCopied: 'Copié', giftsRefShare: 'Partager le lien', giftsWeekTitle: 'Ta série', giftsWeekStreak: '{n} jours d\'affilée', giftsWeekDays: 'Lun,Mar,Mer,Jeu,Ven,Sam,Dim', giftsProgTitle: 'Vers la chanson de ton âme', giftsProgSub: 'Réunis 100 Étincelles — et elle naît', giftsProgSubPack: "Le premier pack d'Étincelles ouvre une chanson — ensuite tu paies avec ce que tu as réuni", iskrySongNeedPack: "Les Étincelles ouvrent une chanson après ton premier pack d'Étincelles. Pour l'instant elles servent aux questions à l'Oracle et aux lectures.", errSongIskryNeedPack: "Un pack d'Étincelles ouvre la chanson en Étincelles — ou paie directement.", errGiftIskryNeedPack: "Offrir une chanson en Étincelles s'ouvre après ton premier pack d'Étincelles.", giftsFoot: '✦ Reviens demain — ta série grandit ✦', giftCardTitle: 'Offre à un proche', giftCardSub: 'Offre ta chanson — un proche l\'entendra', giftCardCta: 'Offrir une chanson', iskraClaimedTitle: "L'Étincelle est à toi ✦", iskraFreshSub: 'Un petit cadeau pour ta présence.', iskraClaimedSub: "Casse le biscuit — l'Oracle t'a laissé un message.", iskraCookieBtn: 'Ouvrir le biscuit de prédiction', iskraSaved: 'Enregistré dans le Journal des messages', iskraAskDay: "Demander à l'Oracle", iskraGoal: "Encore {n} jours d'affilée → +10 Étincelles pour une série de 7 jours", questsTitle: 'Quêtes', homeCommT: 'Plus de possibilités pour toi', homeCommS: 'Actus et astuces — dans notre communauté', questJoinT: 'Rejoindre notre communauté', questJoinS: 'Viens avec nous', questJoinBtn: '+30', questJoinDone: 'Fait', questJoinAlready: 'Tu es déjà dans la communauté', questJoinToast: 'Merci ! +30 Étincelles', questJoinCheck: "J'ai rejoint", questJoinNeedMember: "Rejoins d'abord la communauté, puis reviens", scCommInviteT: "Énergie du jour — chaque matin dans la communauté", scCommInviteS: "Un court réglage du jour et les nouvelles de l'Oracle. +30 Étincelles pour l'adhésion.", scCommInviteBtn: 'Rejoindre', profileVkCommunity: 'Communauté : Énergie du jour, chaque matin',
          // gift create/redeem pages (giftPage / giftRedeemPage)
          giftPageTitle: 'Offrir une chanson', gpEyebrow: 'Un cadeau pour un proche', gpTitle: 'Commande du cadeau', gpWhat: 'Ce que tu offres', gpItem: 'Chanson de l\'âme', gpInGift: 'en cadeau', gpToClose: 'un proche', gpPayMethod: 'Moyen de paiement', gpMStars: 'Telegram Stars', gpMStarsSub: 'Payer avec Telegram Stars', gpMCard: 'Carte · T-Bank', gpMCardSub: 'Visa / Mastercard / MIR', gpNote: 'Après le paiement tu recevras un code promo — envoie-le à ton proche, il active le cadeau en créant une chanson.', gpPay: 'Payer', gpSecure: 'Paiement sécurisé · le code promo arrive aussitôt', gpDoneTitle: 'Cadeau prêt 🤍', gpDoneText: 'Un code promo pour une chanson de l\'âme — envoie-le à ton proche, il le saisit à la création.', gpDoneShare: 'Envoyer le cadeau', gpDoneCopy: 'Copier le code', gpCodeCopied: 'Code copié ✓', giftsMyTitle: 'Mes cadeaux', giftCodePending: 'En attente d’activation', giftCodeUsed: 'Activé', giftCodeFor: 'Pour : ', giftCodeCopy: 'Copier', giftCodeSend: 'Envoyer', gpShareText: 'Je t\'offre une chanson de l\'âme 🤍 Code promo : ', giftToPlaceholder: 'Pour · choisis qui', giftToName: 'Pour · {name}', giftNoSongs: 'Aucune chanson prête', giftCreateFirst: 'Créer une chanson', giftNeedSongTitle: 'Crée d\'abord une chanson', giftNeedSongSub: 'Tu l\'offriras une fois prête', giftSoulSong: 'Chanson de l\'âme', giftSongFallback: 'Chanson', giftDediPlaceholderPreview: 'Ta dédicace apparaîtra ici…', giftSecRecip: 'Pour qui', giftSecWords: 'Mots tendres', giftSecHow: 'Comment offrir', giftRecipAdd: 'Ajouter', giftDediPlaceholder: 'Écris quelques mots pour la personne à qui tu offres…', giftPresetBday: 'Joyeux anniversaire', giftPresetJust: 'Juste pour toi', giftPresetSpecial: 'Tu es quelqu\'un de spécial', giftDlvLink: 'Lien', giftDlvTg: 'Telegram', giftDlvQr: 'Code QR', giftReward: '+5 Étincelles à l\'ouverture du cadeau', giftSendBtn: 'Offrir la chanson', giftDoneTitle: 'Cadeau prêt !', giftDoneText: '«{name}» pour {to}. Partage le lien ci-dessous — tu le sauras à l\'ouverture.', giftDoneCopy: 'Copier', giftToLovedOne: 'un proche', giftDoneClose: 'Terminé', giftPromptRecipName: 'Pour qui est le cadeau ? Prénom :', giftAddNamePh: 'Pour qui ? (ex. Maman)', giftAddNameOk: 'OK', giftLinkCopied: 'Lien copié', giftSelectFirst: 'Choisis d\'abord une chanson', giftFailed: 'Ça n\'a pas marché', giftSongYours: 'La chanson est à toi 🤍', giftLoginToRedeem: 'Connecte-toi pour recevoir ton cadeau', giftPlaying: '🎵 {title} joue', giftIskryCredited: '+{n} Étincelles créditées 🤍', giftSongCredited: 'Une chanson en cadeau 🤍 Crée la tienne', giftSongUnlocked: 'Ta chanson est débloquée 🤍', giftDeliverShareText: 'On t\'offre une chanson de l\'âme 🤍 Ouvre-la : {url}', giftNotFound: 'Cadeau introuvable', giftFromLovedOne: 'Un proche', grFromSealedDefault: 'Un cadeau pour toi', grFromSealedName: 'Un cadeau de {name}', grTitleSealed: 'On t\'offre<br>une chanson de l\'âme 🤍', grLeadDefault: 'Ouvre le cadeau pour écouter ta chanson personnelle.', grFromOpenDefault: 'Cadeau', grFromOpenName: 'Cadeau de {name}', grTitleOpen: 'Avec tendresse 🤍', grLeadNew: '{name} t\'offre une <b>chanson personnelle</b> d\'après ta date de naissance. Ouvre le cadeau pour la créer.', grLeadExisting: '{name} t\'offre une <b>chanson de l\'âme</b>. Ouvre le cadeau pour l\'écouter.', giftInsidePersonalSong: 'Chanson personnelle', giftInsideByBirthdate: 'd\'après ta date de naissance', giftInside100: '+100 Étincelles en cadeau', giftInside100Sub: 'pour tes futures chansons', giftInsideFromName: 'de {name}', grNoteNew: 'Nous préciserons la date de naissance à l\'étape suivante · le cadeau est déjà payé', grOpenBtn: 'Ouvrir le cadeau', grGetBtn: 'Recevoir ma chanson', grCreateSong: 'Crée ta chanson', grRedeemedNote: 'Le cadeau est à toi 🤍', giftPromoWillApply: 'Le code promo s\'applique à la création de la chanson 🤍', gpPayUnavailable: 'Le paiement est indisponible, réessaie plus tard', sharedSongEyebrow: 'On a partagé une chanson avec toi', sharedSongCta: 'Crée une chanson sur toi', sharedSongLoading: 'Ouverture de la chanson…', sharedSongFallback: 'Chanson de l\'âme', sharedSaveFav: 'Aux favoris', sharedCreateOwn: 'Crée ta propre chanson', sharedLockedLead: 'Écoute un extrait de 60 secondes. L\'auteur ouvre la chanson complète.', sharedLockedSub: 'Extrait · 60 s', sharedSavedFav: 'Ajouté aux favoris', sharedSavedFavBtn: 'Dans les favoris', favoritesTitle: 'Favoris', favSharedBadge: 'Partagé avec toi', favEmpty: 'Les chansons que tu ajoutes aux favoris apparaîtront ici.',
          profileContactsTitle: 'Contacts', profileContactsSub: 'Chansons pour tes proches — ton répertoire', helpReplayTour: 'Revoir le tutoriel',
          afsTitle: 'Ton Étincelle est allumée', afsSubtitle: 'Prêt(e) à aller plus loin ?',
          afsBtnCreate: 'Créer un autre morceau', afsBtnSoulChat: 'Essayer Soul Chat', afsBtnInvite: 'Inviter un ami',
          scTabChat: 'Chat', scTabDiary: 'Journal', scTabPrism: 'Lectures',
          askezaEntryLabel: 'Ce que tu tiens', askezaEntryTitle: 'Ton ascèse de 21 jours',
          askezaPickerLabel: 'Par quoi commencer',
          histTitle: 'Historique', histBack: 'Retour au chat', histSearch: 'Rechercher dans les conversations', histSearchPh: 'Trouver dans les conversations', histNoRes: 'Rien trouvé. Essaie un autre mot — je cherche dans tes questions.', histEmptyT: 'Pas encore de conversations', histEmptyS: 'Demande à l\'Oracle ce que tu veux — tout ce dont vous avez parlé reste ici pour que tu puisses y revenir.', histContinue: 'Reprendre la conversation', histLastNote: 'Dernière — « {title} », {when}', histToday: 'Aujourd\'hui', histWeek: 'Cette semaine', histEarlier: 'Plus tôt', histLive: 'ouverte', histThreadsN: '{n} conversation|{n} conversations', histQuestionsN: '{n} question|{n} questions', histCountEmpty: 'vide pour l\'instant', histQuote: '« {q} »', histDeleteAsk: 'Supprimer cette conversation ? Impossible de la récupérer.', scThreadNew: 'Nouvelle conversation',
          prismPowerDrain: 'Où part ta force', drainSwitchLabel: 'Voir un autre côté',
          vkObSlide1Eyebrow: 'Ton oracle', vkObSlide1Title: 'L\'oracle lit ta date de naissance',
          vkObSlide1Sub: 'Pose une question sur toi — la réponse vient de ta carte. Les dix premières questions sont offertes.',
          vkObChipFree: '10 questions offertes',
          vkObSlide4Eyebrow: 'Lectures et pratique', vkObSlide4Title: 'Des lectures sur toi et une pratique de 21 jours',
          vkObSlide4Sub: 'Quinze lectures de ta carte. Et une ascèse — une pratique de trois semaines, pas une lecture unique.',
          vkObChipPrisms: 'lectures de la carte', vkObChipAskeza: 'ascèse · 21 jours',
          vkConsentDataOracle: 'Les données sont stockées sur des serveurs en Russie. Pour les lectures, une partie des données est transmise aux services de génération, y compris à l\'étranger — détails dans la Politique.', scThreadLegacy: 'Conversations précédentes',
          errThreadNotFound: 'Conversation introuvable.', askezaPickerHint: "La première, c'est là où c'est le plus dur en ce moment. Tu peux en prendre n'importe laquelle, mais une seule.",
          askezaTitlePrefix: 'Ascèse de', askezaTitleFallback: 'Ton ascèse',
          askezaEntryNote: 'Pratiquer au lieu de lire', askezaEntryProgress: '{done} sur {total} tenus',
          askezaBack: 'Retour aux lectures', askezaStatus: "Jour {n} sur {m}", askezaStatusLeft: "{n} devant toi", askezaTodayLabel: "Aujourd'hui · jour {n}", askezaMarkBtn: "Marquer la journée tenue", askezaMarkedBtn: "Journée marquée", askezaStartWith: "Commencer l'ascèse de {planet}", askezaCtaNote: "21 jours · un jour manqué passe, deux d'affilée — on recommence", askezaFinalLabel: "21 jours derrière toi", askezaFinalTitle: "Pratique terminée", askezaFinalStreak: "meilleure série", askezaFinalMissed: "manqués", askezaFinalNext: "Ensuite — le thème suivant de la liste.", askezaFinalCta: "Choisir la suivante", askezaEyebrow: 'Pratique · 21 jours', askezaTitle: 'Ascèse de Saturne', askezaWhatIs: "Une règle pendant 21 jours : chaque jour une action et un interdit. Le soir, tu marques la journée.", askezaOutcomeLabel: 'Ce qui change', askezaDailyLabel: 'Chaque jour', askezaCoreShort: 'Ascèse', askezaFinalCheck: 'Vérifie ce qui a changé',
          askezaCoreLabel: 'Ce qu\'il faut tenir', askezaWhyLabel: 'Pourquoi celle-ci est la tienne', askezaWhyPending: "J'écris pourquoi cette pratique est la tienne…",
          askezaDoLabel: 'Faire', askezaBanLabel: 'Jamais',
          askezaTrackLabel: 'Vingt et un jours', askezaTrackHint: 'Coche le soir si tu as tenu la journée',
          askezaStreakLabel: 'd\'affilée depuis le début', askezaTotalLabel: 'tenus au total',
          askezaBeatsLabel: 'Où ça te casse', askezaBeatYou: 'chez toi',
          askezaFailLabel: 'Rompu', askezaFailRule: 'Un jour manqué — tu continues. Deux d\'affilée — tu recommences.',
          askezaStartBtn: 'Commencer la pratique', askezaRestartBtn: 'Recommencer', askezaStarting: 'Préparation de la pratique…',
          askezaDayAria: 'Jour {n}', askezaDayShort: 'jour {n}',
          errAskezaNeedBirthData: 'Renseigne ta date, ton heure et ton lieu de naissance — la pratique en a besoin.',
          errAskezaNeedBirthTime: 'La pratique a besoin de ton heure de naissance exacte.',
          errAskezaUnknown: 'Pratique inconnue.', errAskezaBadDay: 'Ce jour est hors de la pratique.',
          errAskezaNotStarted: 'La pratique n\'a pas commencé.',
          scOracleWho: 'Oracle', scIntroTitle: 'Interroge-toi', scIntroSubtitle: 'L’Oracle répond d’après ta carte, pas en généralités.',
          scPrismTitle: 'Lectures', scPrismSubtitle: 'Regarde plus profond — ta carte, chantée à voix haute', scChartLabel: 'Ta carte', scChartNoDob: 'Ajoute ta date de naissance', scProgReceived: 'Lectures reçues', scProgOpened: 'Lectures ouvertes', scPrismTagNew: 'Nouveau', scPrismLockedTitle: 'Disponible avec un pack', scPrismLockedMsg: 'Cette lecture est disponible avec le pack Soul Chat. La première lecture «Nom de l\'âme» est offerte.', scPrismTryFreeTitle: 'Essayer «Nom de l\'âme»', scPrismPayDesc: 'Une lecture personnelle profonde de ta carte — détaillée sur toi.', scPrismPayHave: 'tu as', scPrismPayBtn: 'Ouvrir la lecture', scPrismPayLoading: 'Préparation de la lecture…', pwTeaserLock: 'L\'Oracle s\'est interrompu…', pwTitle: 'Continuer la conversation?', pwSub: 'Les Étincelles sont épuisées — mais l\'Oracle a encore des choses à dire. Prends un pack et continue, sans abonnement ni carte.', pwSegQ: 'Questions', pwSegIskry: 'Étincelles', pwCtaLabel: 'Continuer la conversation', pwDay: 'Ou', pwDayAccess: 'accès 24h', pwSubscribe: 'Rechargement automatique?', pwSubscribeLink: 'Souscrire avec carte', pwSubscribeWhere: '(où disponible)', pwFoot: 'Paiement unique. Le pack n\'expire pas.', pwBadgePopular: 'Meilleur prix',
          scPrismLoadingCatalog: 'Chargement des lectures…', scPrismRunning: 'Calcul de ta lecture…',
          scPrismErrorTitle: 'Ça n\'a pas marché', scPrismRunFail: 'La lecture n\'a pas pu être générée. Réessaie.',
          scPrismCatalogErr: 'Impossible de charger les lectures.', scPrismCopy: 'Copier la lecture', prismReadEyebrow: 'Lecture personnelle', prismReadIntro: 'L’Oracle lit ta carte', prismReadAsk: 'Poser une question sur la lecture', prismReadSave: 'Enregistrer la lecture', prismBuyDesc: 'Une lecture personnelle profonde de ta carte — en détail sur toi et comment la débloquer.', prismBuyIncl1Html: '<b>Texte détaillé</b> selon ta date de naissance', prismBuyIncl2Html: 'Enregistré dans le chat — tu peux <b>poser des questions</b>', prismBuyYouHave: 'tu as', prismBuyAfter: 'il restera', prismBuyShort: 'il manque', prismBuyOpen: 'Ouvrir la lecture', prismBuyTopup: 'Recharger des Étincelles', prismBuyNoteOk: 'La lecture s’ouvre directement dans le chat avec l’Oracle', prismBuyNoteLow: 'Recharge des Étincelles et ouvre la lecture',
          scPrismCopied: 'Lecture copiée', scPrismCopyFail: 'Échec de la copie',
          scPrismTryFree: 'Essayer la lecture cadeau', scPrismGoToPlans: 'Choisir un forfait', scPrismFillProfile: 'Remplir le profil',
          scEnterChat: 'Entrer dans Soul Chat', scPayByCardBtn: 'Carte (T-Bank) — 199 ₽',
          forSelfOption: 'Pour moi',
          iskrySuffix: 'Étincelles',
          successConfirmDesc: 'Ta chanson est en cours de création.<br>Dès qu\'elle sera prête — elle arrivera dans le bot.<br><span class="success-desc-note">Généralement 10–20 minutes.</span>',
          successConfirmDescWeb: 'Ta chanson est en cours de création.<br>Dès qu\'elle sera prête — elle apparaîtra dans « Mes morceaux ».<br><span class="success-desc-note">Généralement 10–20 minutes.</span>',
          profileEditLabelTime: 'Heure', profileEditLabelGender: 'Genre', profileEditDontKnow: 'Heure exacte inconnue', profileEditDontKnowHint: 'L\'analyse se base sur la date — sans heure précise',
          profileEditFemale: 'Féminin', profileEditMale: 'Masculin',
          styleManualDesc: 'Choisir manuellement', styleAstroDesc: 'Automatique', styleStarDesc: 'Style d\'artiste',
          scPickerApply: 'Appliquer', scFillProfile: 'Remplir le profil →', scCreateRequest: 'Créer une demande de chanson →',
          planAnalysisIncluded: 'Analyse incluse', profileAnalytics: 'Analytique',
          refStatInvitedLabel: 'Invités', refStatActivatedLabel: 'Activés', refStatSparksLabel: 'Étincelles',
          spubNudge: 'Tu as déjà créé 2 morceaux. <strong>Le pack Âme est rentable dès le 3e</strong> — plus Soul Chat, historique et priorité.',
          spubCta: 'Obtenir Âme — 9,90 $ →',
          diarySettingsTitle: 'Paramètres', diarySettingsBack: '← Retour',
          successBotHintHtml: 'Appuie sur <b style="color:rgba(255,255,255,0.7);">Start</b> dans le bot — et les futures chansons arriveront dans Telegram',
          payOvUpsellTitle: 'Âme — 5 morceaux pour 9,90 $ | {subRub} ₽',
          payOvUpsellDesc: '1 morceau = {perTrack} ₽ au lieu de {songRub} ₽. Soul Chat inclus',
          confirmDescHtml: 'Analyse de tes données et création d\'une chanson unique.<br><br>La chanson arrivera dans ce chat. Tu peux fermer l\'appli — rien ne sera perdu.',
          confirmContinueBtn: 'Continuer →', planConfirmPay: 'Payer', planConfirmCancel: 'Annuler',
          profileLogout: 'Se déconnecter', profileOfferLink: 'CGU',
          profileAnalytics: 'Analytique',
          recoveryBannerHtml: '<strong style="color:#6ee7b7;">Ta demande attend !</strong> Utilise des Étincelles — crée ta chanson.',
          recoveryClaimBtn: 'Créer une chanson',
          profilePartnerBadge: 'Partenaire',
          partnerDashStatEarned: 'Total gagné', partnerDashStatAvailable: 'Disponible pour retrait',
          adminTitle: 'Admin', adminDesc: 'Gestion des demandes, carte d\'architecture et paramètres — dans le panneau d\'admin web.',
          adminOpenBtn: 'Ouvrir l\'admin web'
        }
      };
      var currentLang = 'ru';
      function detectLang() {
        try {
          var stored = localStorage.getItem(LANG_STORAGE_KEY);
          if (stored === 'ru' || stored === 'en' || stored === 'de' || stored === 'fr') return stored;
          // VK Mini App: §3.1.2 Правил VK — язык по настройкам пользователя ВКонтакте.
          // vk_language — число: 0=ru, 1=uk, 3=en, 4=es, 6=de, 15=fr. Для неподдерживаемых → ru.
          if (window._isVkMiniApp && window._vkLanguage != null) {
            var vkLang = String(window._vkLanguage);
            if (vkLang === '3') return 'en';
            if (vkLang === '6') return 'de';
            if (vkLang === '15') return 'fr';
            return 'ru'; // 0=ru, 1=uk, 4=es и прочие → русский (дефолт по §3.1.2)
          }
          // OK Mini App: п. 3.4 Правил размещения приложений в Одноклассниках —
          // «Все элементы интерфейса приложения должны быть на русском языке».
          // Поэтому в ОК-режиме ВСЕГДА показываем русский, независимо от
          // значения `_okLanguage` (даже если у пользователя в ОК настроен en/de/fr).
          if (window._isOkMiniApp) {
            return 'ru';
          }
          var lc = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || (typeof navigator !== 'undefined' && navigator.language) || '';
          lc = (lc || '').toLowerCase();
          if (/^en/.test(lc)) return 'en';
          if (/^de/.test(lc)) return 'de';
          if (/^fr/.test(lc)) return 'fr';
          if (/^uk/.test(lc)) return 'ru';
          return 'ru';
        } catch (_) { return 'ru'; }
      }
      // VK-overrides для ключей, упоминающих Telegram/Google/Apple.
      // В VK Mini App показываем альтернативные тексты без упоминаний других площадок.
      var VK_LANG_OVERRIDES = {        ru: {
          payOrderMeta: 'Уникальный трек по твоей дате · появится в разделе «Плейлист» за ~15 минут',
          submitHint: 'Готовая песня появится в разделе «Плейлист» — обычно через несколько минут.',
          toastAnalysisAvailable: 'Расшифровка уже доступна',
          helpB3: '<p>Обычно <strong>5–15 минут</strong>. Уведомление придёт, как только песня будет готова.</p><p>Можно закрыть приложение — результат придёт сам, ты ничего не потеряешь.</p>',
          // §6.12 (отказ VK 10.07): промокоды на VK запрещены — абзац про промокод удалён из VK-оверрайда
          helpB7: '<p><strong>Приложение закрылось или показало ошибку</strong> — перезапусти приложение. Незавершённые заявки восстанавливаются автоматически.</p><p><strong>Оплатил, но песни нет</strong> — подожди 15–20 минут. Если результата нет — напиши в поддержку «песня не пришла».</p>',
          paymentThanksHintText: 'Не пришла за 20 минут? Напиши в поддержку «песня не пришла»',
          authErrVkNoCode: 'Не удалось войти через VK. Попробуй ещё раз.',
          successBotHintHtml: 'Готовая песня появится в разделе <b>Плейлист</b> — обычно через несколько минут.',
          successConfirmDesc: 'Твоя песня генерируется.<br>Как только будет готова — появится в разделе <b>Плейлист</b>.<br><span class="success-desc-note">Обычно 10–20 минут.</span>',
          bsPaymentAccepted: 'Оплата принята. Можешь закрыть это окно — песня появится в разделе Плейлист.',
          notFromTelegram: 'Чтобы отправить заявку, открой YupSoul через VK.',
          alertOpenFromBot: 'Заявку можно отправить только из VK.',
          alertOpenFromBotShort: 'Открой YupSoul через VK.',
          toastOpenInTg: 'Открой YupSoul через VK.',
          toastPayOpenTg: 'Открой YupSoul через VK.',
          linkedTgOpenBot: '',
          profileLinkTgBtn: '',
          profileLinkGoogleBtn: '',
          partnerApplyPendingDesc: 'Мы рассмотрим вашу заявку и уведомим о решении.',
          partnerDashOpenTg: 'Откройте приложение через VK',
          webLoginTelegram: '',
          webLoginOr: '',
          googleSignIn: '',
          webLoginTeaser: '',
          scChoosePlanBtn: 'Выбрать пакет →',
          planConfirmHeader: 'Пакет',
          trackLimitMsg: 'Лимит песен в пакете исчерпан.',
          trackLimitHint: 'Возьми пакет побольше или купи песню отдельно.',
          plBasicCta: 'Взять пакет «Душа»', plPlusCta: 'Взять пакет «Глубина»', plLabCta: 'Взять пакет «Лаборатория»',
          pwSub: 'Искры закончились — а Оракулу ещё есть что тебе сказать. Возьми пакет и продолжай разговор.',
          diaryPwSub: 'Это твой Дневник. Каждое утро — личное сообщение с настройкой именно на твой день. Пробные дни закончились — продолжим вместе.'
        },
        en: {
          payOrderMeta: 'A unique track from your birth date · appears in the Playlist in ~15 min',
          submitHint: 'Your finished song will appear in the Playlist — usually within a few minutes.',
          toastAnalysisAvailable: 'Analysis already available',
          helpB3: '<p>Usually <strong>5–15 minutes</strong>. You will be notified as soon as your song is ready.</p><p>You can close the app — the result will come on its own, you won\'t lose anything.</p>',
          helpB7: '<p><strong>The app closed or showed an error</strong> — restart the app. Unfinished requests are restored automatically.</p><p><strong>Paid but no song</strong> — wait 15–20 minutes. If there is still no result — write to support "song not received".</p>',
          paymentThanksHintText: 'Not arrived in 20 minutes? Write to support "song not received"',
          authErrVkNoCode: 'Could not sign in with VK. Try again.',
          successBotHintHtml: 'Your song will appear in the <b>Playlist</b> section — usually in a few minutes.',
          successConfirmDesc: 'Your song is being generated.<br>Once ready — it will appear in the <b>Playlist</b> section.<br><span class="success-desc-note">Usually 10–20 minutes.</span>',
          bsPaymentAccepted: 'Payment accepted. You can close this window — the song will appear in the Playlist.',
          notFromTelegram: 'To submit a request, open YupSoul via VK.',
          alertOpenFromBot: 'Requests can only be submitted from VK.',
          alertOpenFromBotShort: 'Open YupSoul via VK.',
          toastOpenInTg: 'Open YupSoul via VK.',
          toastPayOpenTg: 'Open YupSoul via VK.',
          partnerApplyPendingDesc: 'We will review your application and notify you of the decision.',
          partnerDashOpenTg: 'Open the app via VK',
          scChoosePlanBtn: 'Choose a package →',
          planConfirmHeader: 'Package',
          trackLimitMsg: 'Your package song limit is used up.',
          trackLimitHint: 'Get a bigger package or buy a song separately.',
          plBasicCta: 'Get the Soul package', plPlusCta: 'Get the Depth package', plLabCta: 'Get the Laboratory package',
          pwSub: 'Sparks are gone — but the Oracle still has things to tell you. Get a pack and keep talking.',
          diaryPwSub: 'This is your Diary. Every morning — a personal message tuned to your day. The trial days are over — let\'s continue together.'
        },
        de: {
          payOrderMeta: 'Ein einzigartiger Track zu deinem Datum · erscheint in der Playlist in ~15 Min.',
          submitHint: 'Dein fertiges Lied erscheint in der Playlist — meist innerhalb weniger Minuten.',
          toastAnalysisAvailable: 'Analyse bereits verfügbar',
          helpB3: '<p>Normalerweise <strong>5–15 Minuten</strong>. Du wirst benachrichtigt, sobald dein Lied fertig ist.</p><p>Du kannst die App schließen — das Ergebnis kommt von selbst, du verlierst nichts.</p>',
          helpB7: '<p><strong>Die App wurde geschlossen oder hat einen Fehler angezeigt</strong> — starte die App neu. Unfertige Anfragen werden automatisch wiederhergestellt.</p><p><strong>Bezahlt, aber kein Lied</strong> — warte 15–20 Minuten. Wenn immer noch kein Ergebnis — schreibe dem Support "Lied nicht erhalten".</p>',
          paymentThanksHintText: 'Nach 20 Minuten nicht angekommen? Schreibe dem Support "Lied nicht erhalten"',
          authErrVkNoCode: 'Anmeldung über VK fehlgeschlagen. Versuche es erneut.',
          successBotHintHtml: 'Dein Song erscheint im Bereich <b>Playlist</b> — meist innerhalb weniger Minuten.',
          successConfirmDesc: 'Dein Lied wird generiert.<br>Sobald es fertig ist — erscheint es im Bereich <b>Playlist</b>.<br><span class="success-desc-note">Normalerweise 10–20 Minuten.</span>',
          bsPaymentAccepted: 'Zahlung akzeptiert. Du kannst dieses Fenster schließen — der Song erscheint in der Playlist.',
          notFromTelegram: 'Um eine Anfrage zu senden, öffne YupSoul über VK.',
          alertOpenFromBot: 'Anfragen können nur über VK gesendet werden.',
          alertOpenFromBotShort: 'Öffne YupSoul über VK.',
          toastOpenInTg: 'Öffne YupSoul über VK.',
          toastPayOpenTg: 'Öffne YupSoul über VK.',
          partnerApplyPendingDesc: 'Wir werden Ihre Bewerbung prüfen und Sie über die Entscheidung informieren.',
          partnerDashOpenTg: 'Öffne die App über VK',
          scChoosePlanBtn: 'Paket wählen →',
          planConfirmHeader: 'Paket',
          trackLimitMsg: 'Das Song-Limit deines Pakets ist ausgeschöpft.',
          trackLimitHint: 'Nimm ein größeres Paket oder kaufe einen Song einzeln.',
          plBasicCta: 'Paket „Seele“ holen', plPlusCta: 'Paket „Tiefe“ holen', plLabCta: 'Paket „Labor“ holen',
          pwSub: 'Funken aufgebraucht — aber das Orakel hat noch mehr zu sagen. Hol dir ein Paket und mach weiter.',
          diaryPwSub: 'Das ist dein Tagebuch. Jeden Morgen — eine persönliche Nachricht, abgestimmt auf deinen Tag. Die Probetage sind vorbei — lass uns zusammen weitermachen.'
        },
        fr: {
          payOrderMeta: 'Un titre unique selon ta date · apparaît dans la Playlist en ~15 min',
          submitHint: 'Ta chanson prête apparaîtra dans la Playlist — généralement en quelques minutes.',
          toastAnalysisAvailable: 'Analyse déjà disponible',
          helpB3: '<p>Généralement <strong>5–15 minutes</strong>. Tu seras notifié dès que ta chanson sera prête.</p><p>Tu peux fermer l\'application — le résultat arrivera tout seul, tu ne perdras rien.</p>',
          helpB7: '<p><strong>L\'application s\'est fermée ou a affiché une erreur</strong> — redémarre l\'application. Les demandes inachevées sont restaurées automatiquement.</p><p><strong>Payé mais pas de chanson</strong> — attends 15–20 minutes. S\'il n\'y a toujours pas de résultat — écris au support "chanson non reçue".</p>',
          paymentThanksHintText: 'Pas arrivée en 20 minutes ? Écris au support «chanson non reçue»',
          authErrVkNoCode: 'Échec de la connexion via VK. Réessaie.',
          successBotHintHtml: 'Ta chanson apparaîtra dans la section <b>Playlist</b> — généralement en quelques minutes.',
          successConfirmDesc: 'Ta chanson est en cours de création.<br>Dès qu\'elle sera prête — elle apparaîtra dans la section <b>Playlist</b>.<br><span class="success-desc-note">Généralement 10–20 minutes.</span>',
          bsPaymentAccepted: 'Paiement accepté. Tu peux fermer cette fenêtre — la chanson apparaîtra dans la Playlist.',
          notFromTelegram: 'Pour envoyer une demande, ouvre YupSoul via VK.',
          alertOpenFromBot: 'Les demandes ne peuvent être envoyées que depuis VK.',
          alertOpenFromBotShort: 'Ouvre YupSoul via VK.',
          toastOpenInTg: 'Ouvre YupSoul via VK.',
          toastPayOpenTg: 'Ouvre YupSoul via VK.',
          partnerApplyPendingDesc: 'Nous examinerons votre candidature et vous informerons de la décision.',
          partnerDashOpenTg: 'Ouvre l\'application via VK',
          scChoosePlanBtn: 'Choisir un pack →',
          planConfirmHeader: 'Forfait',
          trackLimitMsg: 'La limite de chansons de ton forfait est atteinte.',
          trackLimitHint: 'Prends un forfait plus grand ou achète une chanson séparément.',
          plBasicCta: 'Prendre le pack « Âme »', plPlusCta: 'Prendre le pack « Profondeur »', plLabCta: 'Prendre le pack « Laboratoire »',
          pwSub: 'Les Étincelles sont épuisées — mais l\'Oracle a encore des choses à dire. Prends un pack et continue la conversation.',
          diaryPwSub: 'C\'est ton Journal. Chaque matin — un message personnel réglé sur ta journée. Les jours d\'essai sont terminés — continuons ensemble.'
        }
      };
      // OK-overrides: §2.2 правил Одноклассников «приложения, содержащие
      // упоминания социальных сетей, отличных от Одноклассников, не принимаются».
      // В ОК-режиме все ru-тексты содержащие «Telegram», «VK», «ВКонтакте»
      // переписываем на нейтральные/ОК-варианты. Только ru — в ОК язык всегда русский (см. detectLang).
      var OK_LANG_OVERRIDES = {
        ru: {
          payOrderMeta: 'Уникальный трек по твоей дате · появится в разделе «Плейлист» за ~15 минут',
          submitHint: 'Готовая песня появится в разделе «Плейлист» — обычно через несколько минут.',
          toastAnalysisAvailable: 'Расшифровка уже доступна',
          // §2.2 OK: без упоминаний Telegram (как VK-override того же ключа)
          diaryPwSub: 'Это твой Дневник. Каждое утро — личное сообщение с настройкой именно на твой день. Пробные дни закончились — продолжим вместе.',
          helpB3: '<p>Обычно <strong>5–15 минут</strong>. Уведомление придёт, как только песня будет готова.</p><p>Можно закрыть приложение — результат придёт сам, ты ничего не потеряешь.</p>',
          helpB7: '<p><strong>Приложение закрылось или показало ошибку</strong> — перезапусти приложение. Незавершённые заявки восстанавливаются автоматически.</p><p><strong>Оплатил, но песни нет</strong> — подожди 15–20 минут. Если результата нет — напиши в поддержку «песня не пришла».</p><p><strong>Промокод не принимается</strong> — проверь регистр букв. Если всё верно — напиши нам с указанием кода.</p>',
          paymentThanksHintText: 'Не пришла за 20 минут? Напиши в поддержку «песня не пришла»',
          successBotHintHtml: 'Готовая песня появится в разделе <b>Плейлист</b> — обычно через несколько минут.',
          successConfirmDesc: 'Твоя песня генерируется.<br>Как только будет готова — появится в разделе <b>Плейлист</b>.<br><span class="success-desc-note">Обычно 10–20 минут.</span>',
          bsPaymentAccepted: 'Оплата принята. Можешь закрыть это окно — песня появится в разделе Плейлист.',
          notFromTelegram: 'Чтобы отправить заявку, открой YupSoul.',
          alertOpenFromBot: 'Заявку можно отправить только из приложения.',
          alertOpenFromBotShort: 'Открой YupSoul.',
          toastOpenInTg: 'Открой YupSoul.',
          toastPayOpenTg: 'Оплата доступна в YupSoul.',
          toastUpdateTg: 'Для оплаты обнови приложение Одноклассников.',
          toastShareForward: 'Откроется окно отправки.',
          toastUpdateTgStars: '',
          linkedTgOpenBot: '',
          profileLinkTgBtn: '',
          profileLinkGoogleBtn: '',
          partnerApplyPendingDesc: 'Мы рассмотрим вашу заявку и уведомим о решении.',
          partnerDashOpenTg: 'Открой YupSoul.',
          webLoginTelegram: '',
          webLoginOr: '',
          googleSignIn: '',
          webLoginTeaser: ''
        }
      };

      /* Формулировки, обязательные для App Store. Приоритет выше ОК и ВК.
         Три причины, по которым тексты нативной сборки обязаны отличаться:

         • Исполнитель. В веб-версии, ВК и Телеграме назван российский продавец.
           Продавец в App Store — грузинское юрлицо, и оно же обрабатывает данные
           пользователей стора. Замер обходом (scripts/native-currency-sweep.mjs)
           показал эту строку на всех 23 экранах.
         • Правило 3.1.2. Пакет у нас без автопродления, значит текст не должен
           намекать на повторяющийся платёж: «каждый месяц» и «в месяц» уходят,
           остаётся срок — 30 дней.
         • Правило 3.1.1. Ни ₽, ни Stars, ни промокод как способ получить товар.
           Цену показывает Apple на своём экране покупки. */
      var NATIVE_LANG_OVERRIDES = {
        ru: {
          helpLegalSeller: 'Исполнитель: Yupland Digital Solutions, LLC, Грузия',
          // Реф-блок в сторе выключен, поэтому тексты не обещают приглашение друзей.
          profileBalanceHintText: 'Искры — за задания и пакеты',
          homeIskryHintLow: 'У тебя {n} Искр — забери Искру дня или возьми пакет',
          profileRefTagline: 'Делись ссылкой — когда друг берёт пакет, тебе начисляются Искры.',
          giftsRefTag: 'Делись ссылкой — когда друг берёт пакет, тебе начисляются Искры.',
          giftsRefSub: 'Искры за пакет друга',
          homeIskryHintZero: 'Искры за задания: пройди тур и забирай Искру дня',
          iskryTopUpViaReferral: 'Искры за задания: пройди тур и забирай Искру дня',
          helpLegalOffer: 'Условия использования и правила услуги',
          // Слово «оферта» — из договора российского продавца веб-версии. В сторе
          // продавец другой, поэтому все подписи ведут на «Условия использования»
          // (открываются как /terms-en компании).
          legalTabOffer: 'Условия',
          footerOffer: 'Условия использования',
          profileOfferLink: 'Условия использования',
          payOvOfferLink: 'условиями использования',
          plLegalHtml: 'Любая песня — 100 Искр. Пакеты — разовая покупка на 30 дней, без автоматических списаний. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Условия использования</a>.',
          plLegalVkHtml: 'Любая песня — 100 Искр. Пакеты — разовая покупка на 30 дней, без автоматических списаний. <a href="#" onclick="if(window.showLegalModal)window.showLegalModal(\'offer\');return false">Условия использования</a>.',
          plSubsSec: 'Пакеты · полный доступ',
          plBasicF1: '5 песен в течение 30 дней',
          plPlusF1: '15 песен в течение 30 дней',
          plLabF1: '30 песен в течение 30 дней',
          plBasicF2: 'Оракул — 50 вопросов за 30 дней',
          perMonth: '',
          heroesSubBtn: 'Получить «Лабораторию»',
          spubCta: 'Получить «Душу»',

          /* Правила 3.1.1 и 4.2: товар, купленный встроенной покупкой, должен быть
             доступен внутри приложения. Песня у нас в приложении есть — раздел
             «Плейлист» с плеером, поэтому меняется только текст, не логика.
             Оттуда же убраны промокод и внешние способы оплаты. */
          successDesc: 'Твоя песня создаётся. Как только будет готова — появится в разделе «Плейлист». Обычно 10–20 минут.',
          successHint: 'Не появилась через 20 минут? Напиши в поддержку — разберёмся.',
          successListen: 'Открыть Плейлист',
          successConfirmDesc: 'Твоя песня создаётся.<br>Как только будет готова — появится в разделе <b>Плейлист</b>.<br><span class="success-desc-note">Обычно 10–20 минут.</span>',
          successBotHint: 'Готовая песня появится в разделе «Плейлист» — загляни туда через 10–20 минут',
          successBotHintHtml: 'Готовая песня появится в разделе <b>Плейлист</b> — загляни туда через 10–20 минут',
          songNotArrived: 'Не появилась через 20 минут? Напиши в поддержку — разберёмся.',
          goToBot: 'Открыть Плейлист',
          ptSongCreating: 'Твоя песня создаётся. Результат появится в разделе «Плейлист».',
          submitHint: 'Готовая песня появится в разделе «Плейлист» — обычно через 10–20 минут.',
          paymentThanksHintText: 'Не появилась за 20 минут? Напиши в поддержку — разберёмся.',
          payThanksHint: 'Не появилась за 20 минут? Напиши в поддержку — разберёмся.',
          payCheckTakesTime: 'Как только оплата подтвердится, песня появится в разделе «Плейлист». Можешь вернуться на главную.',
          consentTextWeb: 'Включи уведомления — Искра дня каждое утро и весточка, когда песня готова. Только важное, без спама.',
          consentBtnWeb: 'Включить уведомления',
          toastAnalysisAvailable: 'Расшифровка уже доступна',
          songPreviewText: 'Твоя уникальная аудиокомпозиция уже ждёт тебя в разделе «Плейлист». Слушай её каждое утро, чтобы настроиться на волну успеха.',
          soulChatHasAccess: 'У тебя есть доступ к Чату с Оракулом. Нажми кнопку ниже и задай вопрос своей душе.',
          openBot: 'Открыть Плейлист',
          bsPaymentAccepted: 'Оплата принята. Можешь закрыть это окно — песня появится в разделе «Плейлист».',
          helpB3: '<p>Обычно <strong>5–15 минут</strong>. Готовая песня появится в разделе «Плейлист».</p><p>Можно закрыть приложение — результат никуда не денется, ты ничего не потеряешь.</p>',
          helpB5: '<p><strong>Первую песню создаёшь сразу — минута звучания в подарок; понравилась — открой целиком одним лёгким платежом.</strong></p><p>Искры — за дела: забирай Искру дня (+2 каждый день, +10 за серию 7 дней), +30 за знакомство с приложением, +5 за уведомления.</p>',
          helpT6: 'Оплата',
          helpB6: '<p>Дополнительные генерации и пакеты оплачиваются внутри приложения: цену и подтверждение показывает App Store.</p><p>Других способов оплаты здесь нет. Всё, что открыл, остаётся с тобой — песни ждут в разделе «Плейлист».</p>',
          helpB7: '<p><strong>Приложение закрылось или показало ошибку</strong> — перезапусти его. Незавершённые заявки восстанавливаются автоматически.</p><p><strong>Оплатил, но песни нет</strong> — подожди 15–20 минут и загляни в «Плейлист». Если там пусто — напиши в поддержку.</p>',
          helpB8: '<p><strong>Чат с Оракулом</strong> — разговор с твоей душой на основе твоих данных. Задавай вопросы о характере, предназначении, выборе. Открыт всем: первые 10 вопросов в подарок, дальше 1 вопрос = 1 Искра. Пакет снимает лимит — Душа (50 вопросов за 30 дней), Глубина и Лаборатория (без лимита).</p><p><strong>Пакеты</strong> — Душа (5 треков + Чат с Оракулом), Глубина (15 треков + Чат с Оракулом без лимита + расшифровка), Лаборатория (30 треков, картотека людей, Чат с Оракулом без лимита + расшифровка). Расшифровка — текстовый разбор песни — включена в Глубину и Лабораторию; для Души и разовых треков — первая в подарок, далее отдельно. Получить — в разделе «Профиль» или на экране оплаты.</p>'
        },
        en: {
          helpLegalSeller: 'Provider: Yupland Digital Solutions, LLC, Georgia',
          profileBalanceHintText: 'Sparks come from tasks and packages',
          homeIskryHintLow: 'You have {n} Sparks — claim the daily Spark or get a package',
          profileRefTagline: 'Share your link — when a friend gets a package, you earn Sparks.',
          giftsRefTag: 'Share your link — when a friend gets a package, you earn Sparks.',
          giftsRefSub: 'Sparks when a friend gets a package',
          homeIskryHintZero: 'Sparks for tasks: take the tour, claim the daily Spark',
          iskryTopUpViaReferral: 'Sparks for tasks: take the tour, claim the daily Spark',
          helpLegalOffer: 'Terms of Use and service rules',
          legalTabOffer: 'Terms',
          plSubsSec: 'Packages · full access',
          plBasicF1: '5 songs within 30 days',
          plPlusF1: '15 songs within 30 days',
          plLabF1: '30 songs within 30 days',
          plBasicF2: 'Oracle — 50 questions within 30 days',
          perMonth: '',
          heroesSubBtn: 'Get Laboratory',
          spubCta: 'Get Soul',

          /* Правила 3.1.1 и 4.2: товар, купленный встроенной покупкой, должен быть
             доступен внутри приложения. Песня у нас в приложении есть — раздел
             «Плейлист» с плеером, поэтому меняется только текст, не логика.
             Оттуда же убраны промокод и внешние способы оплаты. */
          successDesc: 'Your song is being created. Once ready — it will appear in the Playlist. Usually 10–20 minutes.',
          successHint: 'Nothing after 20 minutes? Write to support — we will sort it out.',
          successListen: 'Open Playlist',
          successConfirmDesc: 'Your song is being created.<br>Once ready — it will appear in the <b>Playlist</b>.<br><span class="success-desc-note">Usually 10–20 minutes.</span>',
          successBotHint: 'Your finished song will appear in the Playlist — look there in 10–20 minutes',
          successBotHintHtml: 'Your finished song will appear in the <b>Playlist</b> — look there in 10–20 minutes',
          songNotArrived: 'Nothing after 20 minutes? Write to support — we will sort it out.',
          goToBot: 'Open Playlist',
          ptSongCreating: 'Your song is being created. The result will appear in the Playlist.',
          submitHint: 'Your finished song will appear in the Playlist — usually within 10–20 minutes.',
          paymentThanksHintText: 'Nothing after 20 minutes? Write to support — we will sort it out.',
          payThanksHint: 'Nothing after 20 minutes? Write to support — we will sort it out.',
          payCheckTakesTime: 'Once the payment is confirmed, your song will appear in the Playlist. You can go back to home.',
          consentTextWeb: 'Turn on notifications — the Spark of the day each morning and a note when your song is ready. Only what matters, no spam.',
          consentBtnWeb: 'Turn on notifications',
          toastAnalysisAvailable: 'Analysis already available',
          songPreviewText: 'Your unique audio piece is already waiting in the Playlist. Listen every morning to tune into success.',
          soulChatHasAccess: 'You have Soul Chat access. Tap below and ask your soul a question.',
          openBot: 'Open Playlist',
          bsPaymentAccepted: 'Payment accepted. You can close this window — your song will appear in the Playlist.',
          helpB3: '<p>Usually <strong>5–15 minutes</strong>. Your finished song will appear in the Playlist.</p><p>You can close the app — the result will not go anywhere, nothing will be lost.</p>',
          helpB5: '<p><strong>You create your first song right away — one minute of it is a gift; loved it — unlock the full track with one light payment.</strong></p><p>Sparks are earned: claim your daily Spark (+2 every day, +10 for every 7-day streak), +30 for the app intro, +5 for notifications.</p>',
          helpT6: 'Payment',
          helpB6: '<p>Extra generations and packages are paid inside the app: the App Store shows the price and the confirmation.</p><p>There are no other payment options here. Whatever you unlock stays with you — your songs wait in the Playlist.</p>',
          helpB7: '<p><strong>The app closed or showed an error</strong> — restart it. Unfinished orders are restored automatically.</p><p><strong>Paid but no song</strong> — wait 15–20 minutes and look in the Playlist. If it is empty — write to support.</p>',
          helpB8: '<p><strong>Soul Chat</strong> — talk to your soul based on your data. Ask about character, purpose, choices. Open to everyone: the first 10 questions are a gift, then 1 question = 1 Spark. A package removes the limit — Soul (50 questions within 30 days), Depth and Lab (unlimited).</p><p><strong>Packages</strong> — Soul (5 tracks + Soul Chat), Depth (15 tracks + Soul Chat unlimited + transcript), Lab (30 tracks, people directory, Soul Chat unlimited + transcript). Transcript (detailed analysis) is included in Depth and Lab; for Soul and one-time tracks — the first comes as a gift, then separately. Get one in Profile or on the payment screen.</p>'
        },
        de: {
          helpLegalSeller: 'Anbieter: Yupland Digital Solutions, LLC, Georgien',
          profileBalanceHintText: 'Funken gibt es für Aufgaben und Pakete',
          homeIskryHintLow: 'Du hast {n} Funken — hol den Funken des Tages oder ein Paket',
          profileRefTagline: 'Teile deinen Link — holt sich ein Freund ein Paket, bekommst du Funken.',
          giftsRefTag: 'Teile deinen Link — holt sich ein Freund ein Paket, bekommst du Funken.',
          giftsRefSub: 'Funken für das Paket eines Freundes',
          homeIskryHintZero: 'Funken für Aufgaben: Tour machen, Funke des Tages holen',
          iskryTopUpViaReferral: 'Funken für Aufgaben: Tour machen, Funke des Tages holen',
          helpLegalOffer: 'Nutzungsbedingungen und Leistungsregeln',
          plSubsSec: 'Pakete · voller Zugang',
          plBasicF1: '5 Songs innerhalb von 30 Tagen',
          plPlusF1: '15 Songs innerhalb von 30 Tagen',
          plLabF1: '30 Songs innerhalb von 30 Tagen',
          plBasicF2: 'Orakel — 50 Fragen innerhalb von 30 Tagen',
          perMonth: '',
          heroesSubBtn: 'Labor holen',
          spubCta: 'Seele holen',

          /* Правила 3.1.1 и 4.2: товар, купленный встроенной покупкой, должен быть
             доступен внутри приложения. Песня у нас в приложении есть — раздел
             «Плейлист» с плеером, поэтому меняется только текст, не логика.
             Оттуда же убраны промокод и внешние способы оплаты. */
          successDesc: 'Dein Lied wird erstellt. Sobald es fertig ist — erscheint es im Bereich Playlist. Normalerweise 10–20 Minuten.',
          successHint: 'Nach 20 Minuten nichts da? Schreib dem Support — wir klären das.',
          successListen: 'Playlist öffnen',
          successConfirmDesc: 'Dein Lied wird erstellt.<br>Sobald es fertig ist — erscheint es im Bereich <b>Playlist</b>.<br><span class="success-desc-note">Normalerweise 10–20 Minuten.</span>',
          successBotHint: 'Dein fertiges Lied erscheint im Bereich Playlist — schau in 10–20 Minuten dort nach',
          successBotHintHtml: 'Dein fertiges Lied erscheint im Bereich <b>Playlist</b> — schau in 10–20 Minuten dort nach',
          songNotArrived: 'Nach 20 Minuten nichts da? Schreib dem Support — wir klären das.',
          goToBot: 'Playlist öffnen',
          ptSongCreating: 'Dein Lied wird erstellt. Das Ergebnis erscheint im Bereich Playlist.',
          submitHint: 'Dein fertiges Lied erscheint im Bereich Playlist — meist in 10–20 Minuten.',
          paymentThanksHintText: 'Nach 20 Minuten nichts da? Schreib dem Support — wir klären das.',
          payThanksHint: 'Nach 20 Minuten nichts da? Schreib dem Support — wir klären das.',
          payCheckTakesTime: 'Sobald die Zahlung bestätigt ist, erscheint dein Lied im Bereich Playlist. Du kannst zur Startseite zurück.',
          consentTextWeb: 'Aktiviere Benachrichtigungen — jeden Morgen den Funken des Tages und eine Nachricht, wenn dein Lied fertig ist. Nur Wichtiges, kein Spam.',
          consentBtnWeb: 'Benachrichtigungen aktivieren',
          toastAnalysisAvailable: 'Analyse bereits verfügbar',
          songPreviewText: 'Deine einzigartige Komposition wartet schon im Bereich Playlist. Höre sie jeden Morgen, um dich auf Erfolg einzustimmen.',
          soulChatHasAccess: 'Du hast Zugang zum Soul Chat. Tippe unten und stelle deiner Seele eine Frage.',
          openBot: 'Playlist öffnen',
          bsPaymentAccepted: 'Zahlung akzeptiert. Du kannst dieses Fenster schließen — dein Lied erscheint im Bereich Playlist.',
          helpB3: '<p>Normalerweise <strong>5–15 Minuten</strong>. Dein fertiges Lied erscheint im Bereich Playlist.</p><p>Du kannst die App schließen — das Ergebnis geht nicht verloren, du verlierst nichts.</p>',
          helpB5: '<p><strong>Dein erstes Lied erstellst du sofort — eine Minute davon ist ein Geschenk; gefällt es dir — schalte es mit einer kleinen Zahlung ganz frei.</strong></p><p>Funken gibt es für Taten: hol dir den täglichen Funken (+2 pro Tag, +10 für jede 7-Tage-Serie), +30 für die App-Einführung, +5 für Benachrichtigungen.</p>',
          helpT6: 'Zahlung',
          helpB6: '<p>Zusätzliche Generierungen und Pakete werden in der App bezahlt: Preis und Bestätigung zeigt der App Store.</p><p>Andere Zahlungswege gibt es hier nicht. Was du freischaltest, bleibt bei dir — deine Lieder warten im Bereich Playlist.</p>',
          helpB7: '<p><strong>App geschlossen oder Fehler</strong> — starte sie neu. Unfertige Bestellungen werden automatisch wiederhergestellt.</p><p><strong>Bezahlt, aber kein Lied</strong> — warte 15–20 Minuten und schau im Bereich Playlist nach. Ist dort nichts — schreib dem Support.</p>',
          helpB8: '<p><strong>Soul Chat</strong> — Gespräch mit deiner Seele basierend auf deinen Daten. Fragen zu Charakter, Bestimmung, Wahl. Für alle offen: die ersten 10 Fragen sind ein Geschenk, danach 1 Frage = 1 Funke. Ein Paket hebt das Limit auf — Soul (50 Fragen innerhalb von 30 Tagen), Depth und Labor (unbegrenzt).</p><p><strong>Pakete</strong> — Soul (5 Tracks + Soul Chat), Depth (15 Tracks + Soul Chat unbegrenzt), Labor (30 Tracks, Personenverzeichnis, Soul Chat unbegrenzt). Im Profil oder auf der Zahlungsseite.</p>'
        },
        fr: {
          helpLegalSeller: 'Prestataire : Yupland Digital Solutions, LLC, Géorgie',
          profileBalanceHintText: "Les Étincelles viennent des tâches et des packs",
          homeIskryHintLow: "Tu as {n} Étincelles — prends l'Étincelle du jour ou un pack",
          profileRefTagline: 'Partage ton lien — quand un ami prend un pack, tu reçois des Étincelles.',
          giftsRefTag: 'Partage ton lien — quand un ami prend un pack, tu reçois des Étincelles.',
          giftsRefSub: 'Étincelles pour le pack d\'un ami',
          homeIskryHintZero: "Étincelles pour les tâches : fais la visite, prends l'Étincelle du jour",
          iskryTopUpViaReferral: "Étincelles pour les tâches : fais la visite, prends l'Étincelle du jour",
          helpLegalOffer: 'Conditions d\'utilisation et règles du service',
          plSubsSec: 'Packs · accès complet',
          plBasicF1: '5 chansons sous 30 jours',
          plPlusF1: '15 chansons sous 30 jours',
          plLabF1: '30 chansons sous 30 jours',
          plBasicF2: 'Oracle — 50 questions sous 30 jours',
          perMonth: '',
          heroesSubBtn: 'Obtenir « Laboratoire »',
          spubCta: 'Obtenir « Âme »',

          /* Правила 3.1.1 и 4.2: товар, купленный встроенной покупкой, должен быть
             доступен внутри приложения. Песня у нас в приложении есть — раздел
             «Плейлист» с плеером, поэтому меняется только текст, не логика.
             Оттуда же убраны промокод и внешние способы оплаты. */
          successDesc: 'Ta chanson est en cours de création. Dès qu\'elle sera prête — elle apparaîtra dans la Playlist. Généralement 10–20 minutes.',
          successHint: 'Rien après 20 minutes ? Écris au support — on regarde ça.',
          successListen: 'Ouvrir la Playlist',
          successConfirmDesc: 'Ta chanson est en cours de création.<br>Dès qu\'elle sera prête — elle apparaîtra dans la <b>Playlist</b>.<br><span class="success-desc-note">Généralement 10–20 minutes.</span>',
          successBotHint: 'Ta chanson prête apparaîtra dans la Playlist — regarde dans 10–20 minutes',
          successBotHintHtml: 'Ta chanson prête apparaîtra dans la <b>Playlist</b> — regarde dans 10–20 minutes',
          songNotArrived: 'Rien après 20 minutes ? Écris au support — on regarde ça.',
          goToBot: 'Ouvrir la Playlist',
          ptSongCreating: 'Ta chanson est en cours de création. Le résultat apparaîtra dans la Playlist.',
          submitHint: 'Ta chanson prête apparaîtra dans la Playlist — généralement en 10–20 minutes.',
          paymentThanksHintText: 'Rien après 20 minutes ? Écris au support — on regarde ça.',
          payThanksHint: 'Rien après 20 minutes ? Écris au support — on regarde ça.',
          payCheckTakesTime: 'Dès que le paiement est confirmé, ta chanson apparaîtra dans la Playlist. Tu peux retourner à l\'accueil.',
          consentTextWeb: 'Active les notifications — ton Étincelle du jour chaque matin et un message quand ta chanson est prête. Rien que l\'essentiel, sans spam.',
          consentBtnWeb: 'Activer les notifications',
          toastAnalysisAvailable: 'Analyse déjà disponible',
          songPreviewText: 'Ta composition unique t\'attend déjà dans la Playlist. Écoute-la chaque matin pour te mettre sur la voie du succès.',
          soulChatHasAccess: 'Tu as accès à Soul Chat. Appuie ci-dessous et pose une question à ton âme.',
          openBot: 'Ouvrir la Playlist',
          bsPaymentAccepted: 'Paiement accepté. Tu peux fermer cette fenêtre — ta chanson apparaîtra dans la Playlist.',
          helpB3: '<p>Généralement <strong>5–15 minutes</strong>. Ta chanson prête apparaîtra dans la Playlist.</p><p>Tu peux fermer l\'application — le résultat ne se perdra pas, tu ne perdras rien.</p>',
          helpB5: '<p><strong>Tu crées ta première chanson tout de suite — une minute en cadeau ; elle te plaît — ouvre-la en entier avec un petit paiement.</strong></p><p>Les Étincelles se gagnent : récupère ton Étincelle du jour (+2 chaque jour, +10 pour chaque série de 7 jours), +30 pour la visite guidée, +5 pour les notifications.</p>',
          helpT6: 'Paiement',
          helpB6: '<p>Les générations supplémentaires et les packs se paient dans l\'application : l\'App Store affiche le prix et la confirmation.</p><p>Il n\'y a pas d\'autre moyen de paiement ici. Ce que tu ouvres te reste — tes chansons t\'attendent dans la Playlist.</p>',
          helpB7: '<p><strong>L\'application s\'est fermée ou a affiché une erreur</strong> — relance-la. Les demandes inachevées sont restaurées automatiquement.</p><p><strong>Payé mais pas de chanson</strong> — attends 15–20 minutes et regarde dans la Playlist. Si elle est vide — écris au support.</p>',
          helpB8: '<p><strong>Soul Chat</strong> — dialogue avec ton âme selon tes données. Pose des questions sur le caractère, la vocation, les choix. Ouvert à tous : les 10 premières questions sont un cadeau, puis 1 question = 1 Étincelle. Un pack retire la limite — Soul (50 questions sous 30 jours), Depth et Lab (illimité).</p><p><strong>Packs</strong> — Soul (5 titres + Soul Chat), Depth (15 titres + Soul Chat illimité), Lab (30 titres, répertoire, Soul Chat illimité). Dans Profil ou écran paiement.</p>'
        }
      };

      function t(k, vars) {
        // Защита от неподдерживаемых языков
        if (!LANG[currentLang]) {
          console.warn('[i18n] Неподдерживаемый язык:', currentLang, '- переключаюсь на русский');
          currentLang = 'ru';
          try { localStorage.setItem(LANG_STORAGE_KEY, 'ru'); } catch (_) {}
        }
        // OK-override: приоритет выше VK (потому что в ОК нельзя упоминать VK).
        // Если запущено внутри OK Mini App и есть альтернативный текст — возвращаем его.
        var s;
        // Натив первым: требования Apple жёстче правил ВК и ОК, и площадки не пересекаются.
        if (window._isNativeApp && NATIVE_LANG_OVERRIDES[currentLang] && NATIVE_LANG_OVERRIDES[currentLang][k] !== undefined) {
          s = NATIVE_LANG_OVERRIDES[currentLang][k];
        } else if (window._isNativeApp && NATIVE_LANG_OVERRIDES.ru && NATIVE_LANG_OVERRIDES.ru[k] !== undefined) {
          s = NATIVE_LANG_OVERRIDES.ru[k];
        } else if (window._isOkMiniApp && OK_LANG_OVERRIDES.ru && OK_LANG_OVERRIDES.ru[k] !== undefined) {
          s = OK_LANG_OVERRIDES.ru[k];
        } else if (window._isVkMiniApp && VK_LANG_OVERRIDES[currentLang] && VK_LANG_OVERRIDES[currentLang][k] !== undefined) {
          s = VK_LANG_OVERRIDES[currentLang][k];
        } else if (window._isVkMiniApp && VK_LANG_OVERRIDES.ru && VK_LANG_OVERRIDES.ru[k] !== undefined) {
          s = VK_LANG_OVERRIDES.ru[k];
        } else {
          s = (LANG[currentLang] && LANG[currentLang][k]) || (LANG.ru && LANG.ru[k]) || k;
        }
        if (vars && typeof s === 'string') {
          Object.keys(vars).forEach(function(key) { s = s.replace(new RegExp('\\{' + key + '\\}', 'g'), vars[key]); });
        }
        return s;
      }
      window.t = t; // expose globally for separate IIFEs (account linking, etc.)
      // _tl(key, fallback) — безопасный перевод с fallback. Если ключ не найден в словаре, возвращает fallback.
      // ГЛОБАЛЬНАЯ функция — НЕ копировать локально, использовать эту.
      function _tl(k, fb) { var v = t(k); return (v && v !== k) ? v : fb; }
      window._tl = _tl;
      function applyTranslations() {
        document.documentElement.lang = currentLang || 'ru';
        // Канон v7 (27.07): на VK Искры — валюта Оракула (за голоса), не «песни».
        // Меняем data-i18n АТРИБУТЫ один раз — дальше любой прогон applyTranslations
        // на любом языке сам берёт VK-ключи (грабли селектор-карты: текст, записанный
        // в обход атрибута, стирается при смене языка).
        if (!window._vkI18nSwapDone && (window._isVkMiniApp || window._appEnv === 'vk'
            || document.documentElement.classList.contains('is-vk'))) {
          window._vkI18nSwapDone = true;
          try {
            [['tuBalance','tuBalanceVk'], ['tuPack1k','tuPack1kVk'], ['tuPack2k','tuPack2kVk'],
             ['tuPack5k','tuPack5kVk'], ['tuEntrySub','tuEntrySubVk']].forEach(function(p) {
              document.querySelectorAll('[data-i18n="' + p[0] + '"]').forEach(function(el) {
                el.setAttribute('data-i18n', p[1]);
              });
            });
          } catch (_) {}
        }
        var map = [
          ['startBtn','#startBtn'], ['myProfile','#goProfileBtn'], ['admin','#adminLinkBtnProfile'],
          ['profileShare','#profileRefShareBtn'], ['profileCopyLink','#profileRefCopyBtn'], ['profileCreateSong','#profileCreateSongBtn'],
          ['heroesTitle','#heroesPage header h1'], ['heroesSubtitle','#heroesPage .subtitle'],
          ['searchByName','#heroesPage label[for="heroesSearch"]'], ['searchPlaceholder','#heroesSearch'],
          ['addHero','#addHeroBtn'],
          /* Форма героя (эталон showcase-hero-add): метки и кнопки переведены через data-i18n
             ВНУТРИ разметки. Старые label[for=…] не матчат новые метки (у них нет for), а
             textContent-таргет на #heroFormCancel/#heroFormSave стирал SVG-иконки ‹/+ (закон №46). */
          ['modeType','.mode-selector h3'], ['modeSubtitle','.mode-subtitle'],
          ['modeSingle','.mode-btn[data-mode="single"] .mode-label'], ['modeSingleDesc','.mode-btn[data-mode="single"] .mode-desc'],
          ['modeCouple','.mode-btn[data-mode="couple"] .mode-label'], ['modeCoupleDesc','.mode-btn[data-mode="couple"] .mode-desc'],
          ['modeTransitDesc','.mode-btn[data-mode="transit"] .mode-desc'],
          ['secondPersonTitle','#secondPersonForm h3'], ['transitTitle','#transitForm h3'],
          ['sendRequest','.request-label'], ['requestDesc','#requestDesc'], ['requestQuickHint','#requestQuickHint'], ['submitRequest','#stepNext'], ['submitHint','#submitHint'],
          ['paymentSubtitle','#paymentPage .subtitle'], ['paymentPageTagline','#paymentPage .tagline'],
          ['promoCode','#promoCodeInput'], ['apply','#promoApplyBtn'], ['backFromPayment','#backFromPaymentBtn'],
          ['paymentPageIntroAfterSubmit','#paymentIntro'], ['loadingDesc','#loadingDesc'], ['priceSummaryLabel','#priceSummaryLabel'],
          ['creatingKey','.loading-text'], ['keyActivated','#successPage .subtitle'],
          ['done','.success-title'], ['soulChatPay','#soulChatPayBtn'],
          // VK Testers 7278132 (Windows): УБРАНО ['newKey','#newKeyBtn'] — старая запись ставила
          // `el.textContent = 'Создать ещё одну песню'` на button#newKeyBtn, что УНИЧТОЖАЛО
          // вложенный <svg> + <span> и заменяло их голым текстом. Воспроизводилось после
          // navigation Soul Chat → tab «Дневник»/«Разборы» → back to success modal: при возврате
          // applyTranslations() триггерился, кнопка теряла иконку. Span внутри уже имеет
          // data-i18n="csNewSong" → корректно обрабатывается общим [data-i18n] loop ниже.
          ['paymentThanks','#paymentThanksPage .success-title'], ['thanksSubtitle','#paymentThanksPage .subtitle'],
          ['paymentThanksBackToHome','#paymentThanksBackBtn'], ['gender','#genderLabel'], ['genderSelect','#gender option[value=""]'],
          // Batch 10.8 (7271763): добавлен label для поля «Язык песни»
          ['formSongLang','#languageLabel'],
          ['previewHome','button[data-page="home"]'], ['previewForm','button[data-page="form"]'], 
          ['previewPayment','button[data-page="payment"]'], ['previewLoading','button[data-page="loading"]'], ['previewSuccess','button[data-page="success"]'],
          ['profileHelpBtn','#profileHelpBtn'],
          ['helpT1','#helpT1'], ['helpT2','#helpT2'], ['helpT3','#helpT3'], ['helpT4','#helpT4'],
          ['helpT5','#helpT5'], ['helpT6','#helpT6'], ['helpT7','#helpT7'], ['helpT8','#helpT8'], ['helpT9','#helpT9'], ['helpT10','#helpT10'],
          ['forWhoLabel','#forWhoLabel'], ['pickFromLab','#pickFromLabBtnText'], ['pickFromLabHint','#pickFromLabHint'], ['nameLbl','#nameLabel'],
          ['birthdateLbl','#birthdateLbl'], ['birthplaceLbl','#birthplaceLbl'], ['birthtimeLbl','#birthtimeLbl'], ['birthtimeUnknownHint','#birthtimeUnknownHint'],
          ['requestPreferredStyleLabel','#requestPreferredStyleLabel'],
          ['styleHeading','.mode-section .mode-heading'], ['styleSubtitle','.mode-section .mode-subtitle'],
          ['starHint','#starStyleHint'], ['starRecent','#styleQuickStars .request-quick-toggle span']
        ];
        // innerHTML — для подписей с переносом (напр. «Энергия» + «момента» на двух строках)
        var htmlMap = [
          ['modeTransit','.mode-btn[data-mode="transit"] .mode-label'],
          ['styleManual','.style-mode-btn[data-smode="manual"] .mode-label'],
          ['styleAstro','.style-mode-btn[data-smode="astro"] .mode-label'],
          ['styleStar','.style-mode-btn[data-smode="star"] .mode-label'],
          ['helpB1','#helpB1'], ['helpB2','#helpB2'], ['helpB3','#helpB3'], ['helpB4','#helpB4'],
          ['helpB5','#helpB5'], ['helpB6','#helpB6'], ['helpB7','#helpB7'], ['helpB8','#helpB8'], ['helpB9','#helpB9'], ['helpB10','#helpB10'],
          ['unlockLead','#suLead']
        ];
        map.forEach(function(pair) {
          var el = document.querySelector(pair[1]);
          if (el) {
            var target = (pair[1] === '#stepNext' && el.querySelector('.btn-pay-text')) ? el.querySelector('.btn-pay-text') : el;
            if ((pair[1] === '#formStepBadge1' || pair[1] === '#formStepBadge2' || pair[1] === '#formStepBadge3') && el.querySelector('.form-step-badge-text')) target = el.querySelector('.form-step-badge-text');
            if (pair[1].indexOf('placeholder') === -1 && (pair[1].indexOf('#') === 0 || pair[1].indexOf('label') >= 0 || pair[1].indexOf('h3') >= 0 || pair[1].indexOf('.') >= 0)) {
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = t(pair[0]);
              else target.textContent = t(pair[0]);
            } else if (pair[1].indexOf('placeholder') >= 0 || (el.tagName === 'INPUT' && pair[0] === 'searchPlaceholder')) el.placeholder = t(pair[0]);
            else target.textContent = t(pair[0]);
          }
        });
        var phMap = [
          ['namePh','#name'], ['birthplacePh','#birthplace'], ['name2Ph','#name2'], ['birthplace2Ph','#birthplace2'],
          ['transitDatePh','#transitDate'], ['transitTimePh','#transitTime'], ['transitLocationPh','#transitLocation'],
          ['transitIntentPh','#transitIntent'], ['requestPh','#request'], ['heroBirthplacePh','#heroBirthplace'],
          ['heroNotesPh','#heroNotes'], ['heroName','#heroName'], ['promoCode','#promoCodeInput']
        ];
        phMap.forEach(function(p) { var e = document.querySelector(p[1]); if (e) e.placeholder = t(p[0]); });
        htmlMap.forEach(function(p) { var e = document.querySelector(p[1]); if (e) e.innerHTML = t(p[0]); });
        var helpBack = document.getElementById('helpBackBtn');
        if (helpBack) { helpBack.setAttribute('aria-label', t('backLabel')); helpBack.setAttribute('title', t('backLabel')); }
        var helpBackBottom = document.getElementById('helpBackBtnBottom');
        if (helpBackBottom) { helpBackBottom.setAttribute('aria-label', t('backLabel')); helpBackBottom.textContent = t('back'); }
        var selectOpts = [['genderSelect','gender'],['male','male'],['female','female'],['other','other'],['langSong','language'],['langRu','ru'],['langEn','en'],['langDe','de'],['langFr','fr'],['langUk','uk']];
        var genderSelect = document.getElementById('gender'); if (genderSelect) {
          var opts = genderSelect.querySelectorAll('option'); if (opts[0]) opts[0].textContent = t('genderSelect');
          if (opts[1]) opts[1].textContent = t('male'); if (opts[2]) opts[2].textContent = t('female');
          var o3 = genderSelect.querySelector('option[value="other"]'); if (o3) o3.textContent = t('other');
        }
        var gender2 = document.getElementById('gender2'); if (gender2) {
          var o2 = gender2.querySelectorAll('option'); if (o2[0]) o2[0].textContent = t('genderSelect');
          if (o2[1]) o2[1].textContent = t('female'); if (o2[2]) o2[2].textContent = t('male');
          var o23 = gender2.querySelector('option[value="other"]'); if (o23) o23.textContent = t('other');
        }
        var heroGender = document.getElementById('heroGender'); if (heroGender) {
          var hOpts = heroGender.querySelectorAll('option'); if (hOpts[0]) hOpts[0].textContent = t('genderSelect');
          if (hOpts[1]) hOpts[1].textContent = t('male'); if (hOpts[2]) hOpts[2].textContent = t('female');
          var hO3 = heroGender.querySelector('option[value="other"]'); if (hO3) hO3.textContent = t('other');
        }
        var langSelect = document.getElementById('language'); if (langSelect) {
          var lOpts = langSelect.querySelectorAll('option');
          // Плейсхолдер (первый option) = короткое «Выбери» как у поля «Пол» (genderSelect),
          // а НЕ длинное «Язык песни» (langSong): над полем уже есть label «Язык песни»
          // (Batch 10.8, #languageLabel) — дубль. Длинный плейсхолдер + глобальный
          // button{white-space:normal!important} переносил текст на 2 строки в узком
          // field-row на m.vk.ru → поле языка выше пола → «поехавшая вёрстка» (скрин Аллы 02.07).
          if (lOpts[0]) lOpts[0].textContent = t('genderSelect');
          var lRu = langSelect.querySelector('option[value="ru"]'); if (lRu) lRu.textContent = t('langRu');
          var lEn = langSelect.querySelector('option[value="en"]'); if (lEn) lEn.textContent = t('langEn');
          var lDe = langSelect.querySelector('option[value="de"]'); if (lDe) lDe.textContent = t('langDe');
          var lFr = langSelect.querySelector('option[value="fr"]'); if (lFr) lFr.textContent = t('langFr');
          var lUk = langSelect.querySelector('option[value="uk"]'); if (lUk) lUk.textContent = t('langUk');
        }
        var heroOpt = document.querySelector('#heroGender option[value=""]'); if (heroOpt) heroOpt.textContent = t('genderSelect');
        var heroMale = document.querySelector('#heroGender option[value="male"]'); if (heroMale) heroMale.textContent = t('male');
        var heroFemale = document.querySelector('#heroGender option[value="female"]'); if (heroFemale) heroFemale.textContent = t('female');
        document.getElementById('birthplaceHint') && (document.getElementById('birthplaceHint').textContent = t('birthplaceHint'));
        document.getElementById('birthplace2Hint') && (document.getElementById('birthplace2Hint').textContent = t('birthplaceHint'));
        document.querySelector('label[for="unknown"]') && (document.querySelector('label[for="unknown"]').textContent = t('unknownTimeShort'));
        document.querySelector('label[for="unknown2"]') && (document.querySelector('label[for="unknown2"]').textContent = t('unknownTimeShort'));
        // Quick buttons now loaded from Supabase via renderQuickButtons() — no hardcoded overwrite needed
        var gh = document.getElementById('homeGreeting');
        if (gh) gh.textContent = (userProfile && userProfile.name) ? t('greeting', { name: userProfile.name }) : t('greetingDefault');
        var codes = { ru: 'RU', en: 'EN', de: 'DE', fr: 'FR' };
        var langCurrentEl = document.getElementById('langSwitcherCurrent');
        if (langCurrentEl) langCurrentEl.textContent = codes[currentLang] || 'RU';
        var startLangEl = document.getElementById('startLangSwitcherCurrent');
        if (startLangEl) startLangEl.textContent = codes[currentLang] || 'RU';
        var heroesLangEl = document.getElementById('heroesLangCurrent');
        if (heroesLangEl) heroesLangEl.textContent = codes[currentLang] || 'RU';
        // Онбординг (превью-сторис) — на языке интерфейса
        // Переводы для 3 слайдов онбординга
        var obTitle1 = document.getElementById('obTitle1'); var obText1 = document.getElementById('obText1');
        var obTitle2 = document.getElementById('obTitle2'); var obText2 = document.getElementById('obText2');
        var obTitle3 = document.getElementById('obTitle3'); var obText3 = document.getElementById('obText3');
        if (obTitle1) obTitle1.textContent = t('onboardingSlide1Title');
        if (obText1)  obText1.textContent  = t('onboardingSlide1Text');
        if (obTitle2) obTitle2.textContent = t('onboardingSlide2Title');
        if (obText2)  obText2.textContent  = t('onboardingSlide2Text');
        if (obTitle3) obTitle3.textContent = t('onboardingSlide3Title');
        if (obText3)  obText3.textContent  = t('onboardingSlide3Text');
        var startBtn = document.getElementById('onboardingStartBtn'); if (startBtn) startBtn.textContent = t('onboardingBtnStart');
        // ── Новые переводы всех страниц ──────────────────────────────────────
        var newMap = [
          // heroes page (старый пейволл-промо заменён на .lock с data-i18n — биндинги удалены 18.06)
          ['heroesPageTitle','#heroesPageTitle'],
          ['heroFormTitle','#heroFormTitle'], ['heroRelLabel','#heroRelLabel'],
          ['heroBirthdateHint','#heroBirthdateHint'],
          ['heroTimeBirthLabel','#heroTimeBirthLabel'], ['heroStyleLabel','#heroStyleLabel'],
          // profile page
          ['profilePageTitle','#profilePageTitle'], ['profileSectionMyData','#profileSectionMyData'],
          ['profileSectionPlans','#profileSectionPlans [data-i18n=\"profileSectionPlans\"]'], ['profileLoadError','#profileLoadErrorText'], ['profileLoadRetry','#profileLoadRetryBtn'],
          ['profileEditBtn','#profileEditBtn'],
          ['profileBalanceHintText','#profileBalanceHintText'],
          ['profileSectionTracks','#profileSectionTracks'],
          ['iskryPacksTitle','#iskryPacksSection .profile-section-title'],
          ['profileRefTagline','#profileRefTagline'],
          ['profileInviteFriend','#profileInviteFriendTitle'],
          ['profileRefInvited','#profileRefInvitedLabel'], ['profileRefActivated','#profileRefActivatedLabel'],
          ['profileConnectedServices','#profileConnectedServicesTitle'],
          // НЕ перезаписываем статусы привязки — они обновляются через loadLinkedAccounts
          ['profileLinkTgBtn','#profileLinkTgBtn'], ['profileLinkGoogleBtn','#profileLinkGoogleBtn'],
          ['profileLinkTgHint','#profileLinkTgHint'],
          ['profileActiveSubscription','#profileActiveSubscriptionEl'], ['profileCancelSubscription','#profileCancelSubBtn'],
          ['planCurrentBadge','#planFreeBadge'], ['planFreeYours','#planFreePrice'],
          ['planSubscribeBtn','#planBtnBasicLabel'], ['planDetailsBtn','#planDetailsBasic'],
          ['planPopularBadge','#planPlusBadge'],
          ['planSubscribeBtn','#planBtnPlusLabel'], ['planDetailsBtn','#planDetailsPlus'],
          ['planMasterBadgeText','#planMasterBadge'], ['planMasterNameText','#planMasterName'],
          ['planOpenMasterBtn','#planBtnMasterLabel'], ['planDetailsBtn','#planDetailsMaster'],
          ['ptiSingleName','#ptiSingleName'], ['ptiSingleDesc','#ptiSingleDesc'],
          ['ptiCoupleName','#ptiCoupleName'], ['ptiCoupleDesc','#ptiCoupleDesc'],
          ['ptiTransitName','#ptiTransitName'], ['ptiTransitDesc','#ptiTransitDesc'],
          // success page — #successTitle НЕ маппим: задаётся динамически по сценарию
          // (showConfirm → successReadyTitle; экраны лимита/пакета — свой заголовок).
          ['successHint','#successHint'],
          ['successToProfile','#successToProfileBtn'], ['openBot','#openBotBtn'], ['successListen','#openBotBtn'], ['successMyTracks','#successMyTracksBtn'],
          // loading page
          ['loadingTitle','#loadingTitle'],
          // soul chat promo
          ['scLoading','#scGlobalLoadingText'], ['scCheckingAccess','#scPageLoadingText'], ['scPromoIntro','#scPromoIntro'],
          ['scMoreBtnText','#scMoreBtnText'], ['scStat1','#scStat1'], ['scStat2','#scStat2'],
          ['scStat3','#scStat3'], ['scStat4','#scStat4'], ['scExamplesTitle','#scExamplesTitle'],
          ['scEx1','#scEx1'], ['scEx2','#scEx2'], ['scEx3','#scEx3'],
          ['scPromoErrorText','#scPromoErrorText'], ['scPromoRetryBtn','#scPromoRetryBtn'],
          ['scSubIncluded','#scSubIncluded'], ['scChoosePlanBtn','#scChoosePlanBtn'],
          ['scGiftHeading','#scGiftHeading'], ['scGiftNote','#scGiftNote'],
          ['scGiftBtnText','#scPageGiftBtn'], ['scBuyDayNote','#scBuyDayNote'],
          ['scBuyDayBtnText','#scPageBuyDayBtn'],
          // payment overlay
          ['payOvCardTitleDefault','#payOvCardTitle'], ['payOvTrialText','#payOvTrialText'],
          ['payOvFreeClaimBtn','#payOvFreeClaimBtn'], ['payOvPromoToggle','#payOvPromoToggle'],
          ['apply','#payOvPromoBtn'], ['orPay','#payOvOrPayText'], ['priceLabel','#payOvPriceLabel'],
          ['payOvLinkHint','#payOvLinkHint'],
          ['payOvCopyBtn','#payOvCopyBtn'], ['payOvCheckBtn','#payOvCheckBtn'],
          ['payOvPromoConfirmBtn','#payOvPromoConfirmBtn'],
          // payment thanks page
          ['paymentThanksTitle','#paymentThanksTitle'],
          ['paymentThanksMsg','#paymentThanksMessage'],
          ['paymentThanksHintText','#paymentThanksHint'],
          // profile plan features
          ['profileBalanceLbl','#profileBalanceLabel'],
          ['planFreeName','#planFreeName'], ['planFreeNameClassic','#planFreeNameClassic'], ['planFreeF1','#planFreeF1'], ['planFreeF2','#planFreeF2'],
          ['planBasicName','#planBasicName'], ['planBasicNameClassic','#planBasicNameClassic'], ['planBasicF1','#planBasicF1'], ['planBasicF2','#planBasicF2'], ['planBasicF3','#planBasicF3'], ['planBasicSave','#planBasicSave'],
          ['planPlusName','#planPlusName'], ['planPlusNameClassic','#planPlusNameClassic'], ['planPlusF1','#planPlusF1'], ['planPlusF2','#planPlusF2'], ['planPlusF3','#planPlusF3'], ['planPlusF4','#planPlusF4'], ['planPlusSave','#planPlusSave'],
          ['planMasterNameClassic','#planMasterNameClassic'], ['planMasterF1','#planMasterF1'], ['planMasterF2','#planMasterF2'], ['planMasterF3','#planMasterF3'], ['planMasterF4','#planMasterF4'], ['planMasterSave','#planMasterSave'],
          ['planPlusF5','#planPlusF5'], ['planMasterF5','#planMasterF5'],
          ['planBasicPrice','#planBasicPriceEl'], ['planPlusPrice','#planPlusPriceEl'], ['planMasterPrice','#masterPriceEl'],
          ['planBasicPrice','#scPlanBasicPrice'], ['planPlusPrice','#scPlanPlusPrice'], ['planMasterPrice','#scPlanMasterPrice'],
          ['scPlanBasicDesc','#scPlanBasicDesc'], ['scPlanPlusDesc','#scPlanPlusDesc'], ['scPlanMasterDesc','#scPlanMasterDesc'],
          ['planBasicName','#scPlanBasicName'], ['planPlusName','#scPlanPlusName'], ['planMasterNameText','#scPlanMasterName'],
          ['formStep1','#formStepBadge1'], ['formStep2','#formStepBadge2'], ['formStep3','#formStepBadge3'],
          ['profileCardNotLinked','#profileCardNoCard'], ['profileBindCard','#profileBindCardBtn'], ['profileUnbindCard','#profileUnbindCardBtn'], ['profilePaymentMethod','#profilePaymentMethodTitle'],
          // quick picker + style picker labels
          ['quickPickerLabel','#quickPickerLabel'],
          ['styleQuickLabel','#styleQuickLabel'],
          // ── Новые переводы: главная, навигация, soul chat, my tracks ──
          /* homeTeaser mapping removed — webLoginTagline has styled HTML with tagline-glow spans */
          ['songCounterLabel','#homeSongCountLabel'],
          ['homeChoicesHead','#homeChoicesHead'],
          ['homeChoice1','#homeChoiceBtn1'], ['homeChoice2','#homeChoiceBtn2'],
          ['homeChoice3','#homeChoiceBtn3'], ['homeChoice4','#homeChoiceBtn4'],
          // Нижнее фиксированное меню
          ['navSoulChat','#navMenuSoulChat'], ['navHelp','#navMenuHelp'], ['navLab','#navMenuLab'], ['navTracks','#navMenuTracks'],
          // В-поток навигация (glass)
          ['navSoulChatFull','#navFlowSoulChat'], ['navHelp','#navFlowHelp'], ['navLab','#navFlowLab'], ['navMyTracks','#navFlowTracks'],
          // Soul Chat page
          ['soulChatPageTitle','#scPageTitle'], ['scHeroTitle','#scHeroTitle'],
          ['scSynastryTeaserText','#scSynastryTeaserText'],
          // My Tracks page
          ['mtHeroBadge','#mtHeroBadgeEl'], ['mtHeroTitle','#mtHeroTitleEl'], ['mtHeroDesc','#mtHeroDescEl'],
          ['myTracksLoading','#myTracksLoadingEl'], ['mtEmptyTitle','#mtEmptyTitleEl'], ['mtEmptyDesc','#mtEmptyDescEl'], ['mtEmptyCta','#mtEmptyCtaEl'],
          ['myTracksLoadMore','#myTracksLoadMoreEl'], ['mtSelectTrack','#mtMusicSub'],
          ['myTracksWipTitle','#mtWipTitle'], ['myTracksWipText','#mtWipText'],
          ['profileMyTracks','#profileMyTracksTitle'],
          // Footer
          ['footerSubManage','#footerSubManageLink'], ['footerOffer','#footerOfferLink'], ['footerPrivacy','#footerPrivacyLink'],
          // Success page
          ['successMyTracks','#successMyTracksBtn'],
          // Form page — step 2 heading
          ['formYourData','#formYourDataTitle'], ['formDataNeeded','#formDataNeededSub'],
          // Form page — second person labels
          ['nameLbl','#name2Label'], ['birthdateLbl','#birthdate2Lbl'], ['birthplaceLbl','#birthplace2Lbl'],
          ['birthtimeLbl','#birthtime2Lbl'], ['gender','#gender2Label'],
          // Form page — transit form labels
          ['formTransitDate','#transitDateLbl'], ['formTransitTime','#transitTimeLbl'], ['formTransitCity','#transitLocationLbl'],
          // Form page — transit accordion name
          ['formTransitMode','#transitAccName'],
          // ── Group A: profile edit labels ──
          ['profileEditLabelName','#profileEditLblName'], ['profileEditLabelDate','#profileEditLblDate'],
          ['profileEditLabelCity','#profileEditLblCity'], ['profileEditLabelTime','#profileEditLblTime'],
          ['profileEditDontKnow','#profileEditLblUnknownText'], ['profileEditDontKnowHint','#profileEditLblUnknownHint'], ['profileEditLabelGender','#profileEditLblGender'],
          ['profileEditFemale','#profileEditBtnFemale'], ['profileEditMale','#profileEditBtnMale'],
          ['planAnalysisIncluded','#planPlusF6'], ['planAnalysisIncluded','#planMasterF6'],
          ['profileEarningsHint','#profileRefEarningsHint'],
          ['profileAnalytics','#analyticsLinkBtnProfile'],
          ['refStatInvitedLabel','#refStatInvitedLabel'], ['refStatActivatedLabel','#refStatActivatedLabel'], ['refStatSparksLabel','#refStatSparksLabel'],
          // ── Group B: style mode descriptions ──
          ['styleManualDesc','#styleManualDesc'], ['styleAstroDesc','#styleAstroDesc'], ['styleStarDesc','#styleStarDesc'],
          // ── Group C: soul chat picker ──
          // Заголовок/табы пикера локализуются через data-i18n (ctxTitle/ctxModeOne/
          // ctxModeCompat). Кнопка #scPickerApplyBtn — динамический текст из scSyncPicker
          // (ctxApply/ctxApplyOne/ctxApplyPair), её НЕ трогаем здесь, иначе перетрётся.
          ['scNoRequestTitle','#scNoRequestTitleEl'], ['scNoRequestText','#scNoRequestTextEl'],
          ['scFillProfile','#scFillProfileBtn'], ['scCreateRequest','#scCreateRequestBtn'],
          ['scOpenPlan','#scSynastryTeaserBtn'], ['scSelectLabel','#scContextLabelA'],
          // ── Group D: plan confirm ──
          ['planConfirmPay','#planConfirmMainBtn'], ['planConfirmCancel','#planConfirmCancelBtn'],
          // ── Group G: diary settings ──
          // Batch 10.1 (7267377): убрана инъекция текста «Назад» в кнопку —
          // теперь это круглая icon-кнопка через ::before SVG, текст
          // не нужен (aria-label обеспечивает доступность).
          ['settingsTitle','#diarySettingsTitle'],
          // ── Group H: birthplace hints ──
          ['formCityHint','#heroBirthplaceHint'],
          ['formCityHint','#birthplaceHint'],
          ['formCityHint','#birthplace2Hint'],
          ['planFreeBadge','#profilePlanBadge'],
          ['confirmContinueBtn','#confirmContinueBtn'],
          ['planConfirmPay','#planConfirmMainBtn'],
          ['helpPartnerTitle','#helpPartnerTitle']
        ];
        newMap.forEach(function(pair) {
          var el = document.querySelector(pair[1]);
          if (el) {
            // Бейдж тарифа уже отрисован по данным подписки (или по кэшу
            // прошлого визита). Не откатываем его на дефолтного «Искателя» —
            // переводим по ключу самого тарифа, чтобы смена языка работала.
            if (el.dataset && el.dataset.planKey) { el.textContent = '✦ ' + t(el.dataset.planKey); return; }
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = t(pair[0]);
            else el.textContent = t(pair[0]);
          }
        });
        // ── innerHTML-переводы (содержат HTML-разметку) ──
        var spubTextEl = document.getElementById('spubText');
        if (spubTextEl) spubTextEl.innerHTML = t('spubNudge');
        var spubBtnEl = document.getElementById('spubBtn');
        if (spubBtnEl) spubBtnEl.textContent = t('spubCta');
        var successBotHintTextEl = document.getElementById('successBotHintText');
        if (successBotHintTextEl) successBotHintTextEl.innerHTML = t('successBotHintHtml');
        // profilePromo — сохраняем chevron при переводе
        var promoSectionEl = document.getElementById('profileSectionPromo');
        if (promoSectionEl) {
          var chevronEl = document.getElementById('promoChevron');
          var chevronHtml = chevronEl ? chevronEl.outerHTML : '';
          promoSectionEl.innerHTML = t('profilePromo') + ' ' + chevronHtml;
        }
        // data-i18n-title: установка title из перевода
        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
          var k = el.getAttribute('data-i18n-title');
          if (k) el.setAttribute('title', t(k));
        });
        // Профиль: подпись «Ваши Искры:»
        var earningsLabelEl = document.getElementById('profileRefEarningsLabel');
        if (earningsLabelEl) {
          earningsLabelEl.textContent = (typeof t === 'function' ? t('refEarningsLabel') : 'Ваши Искры:');
        }
        // Бейдж Искр в шапке профиля: title для подсказки
        document.querySelectorAll('[data-iskry-balance]').forEach(function(el) {
          el.setAttribute('title', typeof t === 'function' ? t('iskryTitle') : 'Ваши Искры');
        });
        if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
        // Реферальные метки — удалены milestones, теперь grid
        var refLink = document.getElementById('profileRefLinkInput');
        if (refLink && !refLink.value) refLink.placeholder = t('refLinkLoading');
        // #successTitle / #successDesc на successPage задаются ДИНАМИЧЕСКИ по сценарию
        // (showConfirm → successReadyTitle/successReadyLead; экраны лимита/пакета — свой текст).
        // applyTranslations их НЕ трогает: раньше перетирал per-flow текст на «Заявка принята!»
        // (заголовок не совпадал с эталоном + на смене языка сбрасывал «Лимит исчерпан»/«Пакет»).
        // successWhereTrack — innerHTML (содержит <br> и <b>)
        var swtEl = document.querySelector('[data-i18n-html="successWhereTrack"]');
        if (swtEl) swtEl.innerHTML = t('successWhereTrack');
        // Перевод плейсхолдеров новых полей
        var newPh = [['heroStylePh','#heroStyle'], ['requestPreferredStylePh','#requestPreferredStyle']];
        newPh.forEach(function(p){ var e = document.querySelector(p[1]); if(e) e.placeholder = t(p[0]); });
        // Перевод опций heroRelationship
        var relSel = document.getElementById('heroRelationship');
        if (relSel) {
          var relOpts = relSel.querySelectorAll('option');
          var relKeys = ['heroRelOpt0','heroRelOpt1','heroRelOpt2','heroRelOpt3','heroRelOpt4','heroRelOpt5','heroRelOpt6','heroRelOpt7','heroRelOpt8','heroRelOpt9','heroRelOpt10','heroRelOpt11','heroRelOpt12','heroRelOpt13','heroRelOpt14','heroRelOpt15','heroRelOpt16'];
          relOpts.forEach(function(opt, i) { if (relKeys[i]) opt.textContent = t(relKeys[i]); });
        }
        // Перевод опций dateDay/dateMonth/dateYear во всех date-group select
        document.querySelectorAll('.date-group-day option[value=""]').forEach(function(o){ o.textContent = t('dateDay'); });
        document.querySelectorAll('.date-group-month option[value=""]').forEach(function(o){ o.textContent = t('dateMonth'); });
        document.querySelectorAll('.date-group-year option[value=""]').forEach(function(o){ o.textContent = t('dateYear'); });
        // Перевод logo-subtitle-i18n (все клоны логотипа)
        document.querySelectorAll('.logo-subtitle-i18n').forEach(function(el){ el.textContent = t('logoSubtitle'); });
        var logoMain = document.getElementById('logoSubtitleMain'); if (logoMain) logoMain.textContent = t('logoSubtitle');
        // Заголовок «Музыка твоей души» / Music of your soul — на всех языках, с выделением слова (taglineAccent)
        var taglineAccent = (typeof t('taglineAccent') === 'string' && t('taglineAccent')) ? t('taglineAccent') : '';
        var taglineHtml = taglineAccent ? t('tagline').replace(taglineAccent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '<span class="home-card-title-accent">' + taglineAccent + '</span>') : t('tagline');
        document.querySelectorAll('.tagline-i18n').forEach(function(el){ el.innerHTML = taglineHtml; });
        var homeTag = document.getElementById('homeTagline'); if (homeTag) homeTag.innerHTML = taglineHtml;
        // Перевод brand/tagline/teaser по классам (webLoginScreen static)
        document.querySelectorAll('.brand-subtitle-i18n').forEach(function(el){ el.textContent = t('homeBrand'); });
        document.querySelectorAll('.service-desc-i18n').forEach(function(el){ el.textContent = t('homeServiceDesc'); });
        document.querySelectorAll('.teaser-i18n').forEach(function(el){ el.textContent = t('homeTeaser'); });
        document.querySelectorAll('.choices-head-i18n').forEach(function(el){ el.textContent = t('homeChoicesHead'); });
        // Перевод статичного webLoginScreen
        var wlOr2 = document.getElementById('webLoginOr'); if (wlOr2) wlOr2.textContent = t('webLoginOr');
        /* login icon buttons — icon-only, no text injection (HEAD layout) */
        // Активная кнопка языка на стартовом экране
        document.querySelectorAll('.start-lang-btn').forEach(function(b){
          b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
        });
        // Перевод data-hint на кнопках выбора (главная)
        var choiceBtns = [['#homeChoiceBtn1','homeChoice1Hint'],['#homeChoiceBtn2','homeChoice2Hint'],['#homeChoiceBtn3','homeChoice3Hint'],['#homeChoiceBtn4','homeChoice4Hint']];
        choiceBtns.forEach(function(p){ var el = document.querySelector(p[0]); if(el) el.setAttribute('data-hint-key', p[1]); });
        // Обновить текущую подсказку если активна
        var activeChoice = document.querySelector('.home-choice.active');
        var hintEl = document.getElementById('homeChoiceHint');
        if (activeChoice && hintEl) {
          var hk = activeChoice.getAttribute('data-hint-key');
          if (hk) hintEl.textContent = t(hk);
        }
        // Перевод webLoginScreen (если существует)
        var wls = document.getElementById('webLoginScreen');
        if (wls) {
          var wlSub = wls.querySelector('.web-login-subtitle'); if (wlSub) wlSub.textContent = t('homeServiceDesc');
          var wlTitle = wls.querySelector('.web-login-title'); if (wlTitle) wlTitle.innerHTML = taglineHtml;
          var wlTeaser = wls.querySelector('.web-login-teaser'); if (wlTeaser) wlTeaser.textContent = t('webLoginTeaser');
          var wlOr = wls.querySelector('.web-login-or'); if (wlOr) wlOr.textContent = t('webLoginOr');
          var wlTg = wls.querySelector('.web-login-telegram-btn'); if (wlTg) wlTg.textContent = t('webLoginTelegram');
        }
        // Убеждаемся, что кнопка оплаты имеет правильный текст после применения переводов
        ensurePayButtonText();
        // VK Testers 7277118 (Windows EN): placeholder native input[type="date"]
        // не локализован — браузер использует системный locale если у input нет
        // lang атрибута. setLang устанавливает lang только при смене языка, на
        // первой загрузке (detectLang сразу = EN) пропускалось. Добавляем lang
        // в applyTranslations который вызывается и на init, и на смене языка.
        try {
          document.querySelectorAll('input[type="date"], input[type="time"]').forEach(function(el) {
            el.lang = currentLang;
          });
          document.documentElement.lang = currentLang;
        } catch(_) {}

        // data-i18n / data-i18n-placeholder — универсальный механизм
        // Пропускаем ключи, уже обработанные через htmlMap (содержат HTML-теги)
        var htmlKeys = ['styleManual','styleAstro','styleStar','modeTransit',
          'helpB1','helpB2','helpB3','helpB4','helpB5','helpB6','helpB7','helpB8','helpB9','helpB10'];
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
          var key = el.getAttribute('data-i18n');
          if (htmlKeys.indexOf(key) !== -1) return; // уже обработан через htmlMap
          var val = t(key);
          if (val && val !== key) el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
          var key = el.getAttribute('data-i18n-html');
          var val = t(key);
          if (val && val !== key) el.innerHTML = val;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
          var key = el.getAttribute('data-i18n-placeholder');
          var val = t(key);
          if (val && val !== key) el.placeholder = val;
        });
        // data-i18n-aria: установка aria-label из перевода
        document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
          var key = el.getAttribute('data-i18n-aria');
          var val = t(key);
          if (val && val !== key) el.setAttribute('aria-label', val);
        });
        // VK button — only relevant for Russian locale
        var vkBtnEl = document.getElementById('vkAuthBtn');
        if (vkBtnEl) vkBtnEl.style.display = (currentLang === 'ru') ? '' : 'none';
        var vkWrap = vkBtnEl ? vkBtnEl.closest('.web-login-cta-wrap') : null;
        if (vkWrap) vkWrap.style.display = (currentLang === 'ru') ? '' : 'none';
        // Перевод названий месяцев в date-group select
        if (typeof getMonthNames === 'function') {
          var _mn = getMonthNames();
          document.querySelectorAll('.date-group-month').forEach(function(sel) {
            var opts = sel.querySelectorAll('option');
            for (var i = 1; i < opts.length && i <= 12; i++) {
              opts[i].textContent = _mn[i - 1];
            }
          });
        }
        // forWho select — "Для себя"
        var fwSel = document.getElementById('forWho');
        if (fwSel) { var fwOpt = fwSel.querySelector('option[value=""]'); if (fwOpt) fwOpt.textContent = t('forSelfOption'); }
        try { if (typeof window._vkApplyPackageWording === 'function') window._vkApplyPackageWording(); } catch(_) {}
        // ₽-УТЕЧКА (Алла 03.07, риск удаления из VK-каталога): map выше ставит planBasicPriceEl/
        // planPlusPriceEl/masterPriceEl + scPlan*Price = «810 ₽» БЕЗ VK-проверки. На back-навигации
        // (топап Искр → назад к пакетам) applyTranslations перезапускался ОДИН и перетирал голоса
        // рублями → на VK показывались ₽ вместо голосов. Re-assert VK-aware цены (голоса на VK)
        // ПОСЛЕДНИМ: applyFixedPrices (loadRubPrices) — авторитетный владелец этих 6 элементов,
        // конвертит ₽→голоса на VK. Идемпотентно, applyFixedPrices НЕ вызывает applyTranslations.
        try { if (typeof window.loadRubPrices === 'function') window.loadRubPrices(); } catch(_) {}
        // ОРАКУЛ-ONLY НА НАТИВЕ VK — САМЫМ ПОСЛЕДНИМ. Карта селекторов выше ставит
        // #startBtn = «Получи свою песню» без платформенной проверки; на нативе VK
        // песен нет, кнопка ведёт в оракул. Тот же класс граблей, что ₽-утечка
        // строкой выше: applyTranslations перетирает платформенные тексты на
        // back-навигации и смене языка. Хук определён ТОЛЬКО на VK-нативе —
        // на web/TG/vk.ru функции нет, ветка не срабатывает.
        try { if (typeof window._vkOracleApplyTexts === 'function') window._vkOracleApplyTexts(); } catch(_) {}
        try { if (typeof window._vkOracleApplyOnboarding === 'function') window._vkOracleApplyOnboarding(); } catch(_) {}
        // Канон v8: на ЛЮБОМ VK Искры тратятся на Оракула, песни покупаются картой.
        // Витрина пакетов не должна обещать «≈ 10 песен» — модератор 27.07 снял это
        // скриншотом как обмен виртуального на цифровое. Хук идёт последним, потому
        // что applyTranslations перетирает тексты по data-i18n на каждой смене языка.
        try { if (typeof window._vkPackTexts === 'function') window._vkPackTexts(); } catch(_) {}
      }
      // VK = разовые ПАКЕТЫ песен за голоса (не подписки, §5.4.1). Имена пакетов =
      // имена тарифов (Душа/Глубина/Лаборатория, Алла 13.06) — НЕ переписываем.
      // Меняем только фичи: «N треков/мес» → «N персональных песен» (без «/мес»).
      // Идемпотентно, вызывается из applyTranslations + applyFixedPrices.
      window._vkApplyPackageWording = function _vkApplyPackageWording() {
        try {
          if (!(window._isVkMiniApp || window._appEnv === 'vk')) return;
          var _set = function(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; };
          _set('planBasicF1',  t('vkPackSongs', { n: 5 }));
          _set('planPlusF1',   t('vkPackSongs', { n: 15 }));
          _set('planMasterF1', t('vkPackSongs', { n: 30 }));
        } catch (_) {}
      };
      // VK Testers #7257216 (Maria MacOS): Safari игнорирует lang attribute на
      // input[type=date] и берёт формат placeholder из system locale (ДД.ММ.ГГГГ).
      // Решение: overlay span поверх native placeholder с локализованным текстом.
      // Native placeholder скрывается через `color: transparent` (см. CSS .date-input-wrap).
      function _initDatePlaceholderOverlays() {
        try {
          document.querySelectorAll('input[type="date"][data-i18n-placeholder]').forEach(function(input) {
            if (input.dataset.dpoInit === '1') {
              // Already wrapped — просто обновим текст overlay для нового языка
              var existingWrap = input.closest('.date-input-wrap');
              if (existingWrap) {
                var existingOverlay = existingWrap.querySelector('.date-placeholder-overlay');
                if (existingOverlay) {
                  var key = input.dataset.i18nPlaceholder;
                  existingOverlay.textContent = (typeof t === 'function' && key) ? (t(key) || input.placeholder || 'DD.MM.YYYY') : (input.placeholder || 'DD.MM.YYYY');
                }
                if (input.value) existingWrap.classList.add('has-value'); else existingWrap.classList.remove('has-value');
              }
              return;
            }
            input.dataset.dpoInit = '1';
            // Оборачиваем input в .date-input-wrap чтобы overlay позиционировался относительно input
            var parent = input.parentNode;
            var wrap = document.createElement('span');
            wrap.className = 'date-input-wrap';
            parent.insertBefore(wrap, input);
            wrap.appendChild(input);
            // Overlay span
            var overlay = document.createElement('span');
            overlay.className = 'date-placeholder-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            var key = input.dataset.i18nPlaceholder;
            overlay.textContent = (typeof t === 'function' && key) ? (t(key) || input.placeholder || 'DD.MM.YYYY') : (input.placeholder || 'DD.MM.YYYY');
            wrap.appendChild(overlay);
            // Initial state
            if (input.value) wrap.classList.add('has-value');
            // Listeners — has-value class + прячем overlay напрямую (надёжнее CSS-класса).
            var sync = function() {
              var hv = !!input.value;
              wrap.classList.toggle('has-value', hv);
              overlay.style.display = hv ? 'none' : '';
            };
            input.addEventListener('input', sync);
            input.addEventListener('change', sync);
            input.addEventListener('blur', sync);
          });
        } catch(_) {}
      }
      window._initDatePlaceholderOverlays = _initDatePlaceholderOverlays;
      (function _delegateDateOverlaySync() {
        try {
          var h = function(e) {
            var inp = e && e.target;
            if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'date') return;
            var w = inp.closest && inp.closest('.date-input-wrap'); if (!w) return;
            var hv = !!inp.value;
            w.classList.toggle('has-value', hv);
            var ov = w.querySelector('.date-placeholder-overlay');
            if (ov) ov.style.display = hv ? 'none' : '';
          };
          ['change', 'input', 'blur', 'focusin'].forEach(function(ev) {
            document.addEventListener(ev, h, true);
          });
        } catch (_) {}
      })();

      // VK Testers (Алла 20.05): native time picker неудобен — Safari/Chrome
      // показывают зелёный outline (system accent), цифры вводятся в неверные
      // поля, 0 не дополняется. Решение: меняем input[type="time"] на
      // input[type="text"] с inputmode=numeric и маской ЧЧ:ММ:
      // - ввод только цифр (4 шт)
      // - автовставка ':' после 2-й цифры
      // - на blur: padStart('0', 2) для часов и минут + clamp 0-23 / 0-59
      // - формат сохраняется HH:MM — backend читает без изменений.
      function _initTimeInputMask(input) {
        if (!input || input.dataset.timeMaskInit === '1') return;
        input.dataset.timeMaskInit = '1';
        // Сохраняем текущее значение перед сменой type (Safari quirk)
        var savedVal = input.value || '';
        try {
          input.type = 'text';
        } catch(_) {}
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('maxlength', '5');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('pattern', '[0-9]{2}:[0-9]{2}');
        // Placeholder ЧЧ:ММ если нет своего
        if (!input.placeholder) input.placeholder = 'ЧЧ:ММ';
        // Восстанавливаем value
        if (savedVal) input.value = savedVal;

        input.addEventListener('input', function() {
          var raw = input.value.replace(/[^\d]/g, '');
          if (raw.length > 4) raw = raw.slice(0, 4);
          var out = raw;
          if (raw.length >= 3) {
            out = raw.slice(0, 2) + ':' + raw.slice(2);
          } else if (raw.length === 2) {
            // After 2 digits — auto-insert ':' to ease typing minutes
            out = raw + ':';
          }
          input.value = out;
        });

        input.addEventListener('blur', function() {
          var v = (input.value || '').replace(/[^\d:]/g, '');
          if (!v || v === ':') { input.value = ''; return; }
          var parts = v.split(':');
          var h = parseInt(parts[0] || '0', 10);
          var m = parseInt(parts[1] || '0', 10);
          if (!isFinite(h)) h = 0;
          if (!isFinite(m)) m = 0;
          h = Math.max(0, Math.min(23, h));
          m = Math.max(0, Math.min(59, m));
          input.value = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        });

        // На focus снимаем readonly если был disabled через «Не знаю» (defensive)
        // не трогаем disabled state — это управляется отдельно (checkbox handler).
      }
      function _initAllTimeInputMasks() {
        try {
          document.querySelectorAll('input[type="time"], input[data-time-mask]').forEach(function(input) {
            _initTimeInputMask(input);
          });
          // type=time уже заменился на text после первого прохода — следующий
          // раз ищем по data-time-mask-init=1 (уже инициализированы).
        } catch(_) {}
      }
      window._initTimeInputMask = _initTimeInputMask;
      window._initAllTimeInputMasks = _initAllTimeInputMasks;
      function localizeLoaderLetters() {
        var words = { ru: 'Создаём', en: 'Generating', de: 'Erstellen', fr: 'Création' };
        var word = words[currentLang] || words.en;
        document.querySelectorAll('.loader-wrapper').forEach(function(wrap) {
          if (wrap.hasAttribute('data-no-letters')) return;
          var loader = wrap.querySelector('.loader');
          if (!loader) return;
          // Remove old letter spans
          wrap.querySelectorAll('.loader-letter').forEach(function(el) { el.remove(); });
          // Add new letter spans before .loader
          for (var i = 0; i < word.length; i++) {
            var span = document.createElement('span');
            span.className = 'loader-letter';
            span.textContent = word[i];
            // Preserve font-size from parent if set inline
            var parentFs = wrap.style.fontSize || wrap.style.getPropertyValue('font-size');
            if (!parentFs) {
              var inlineLetterFs = wrap.getAttribute('data-letter-size');
              if (inlineLetterFs) span.style.fontSize = inlineLetterFs;
            }
            span.style.animationDelay = (i * (2.0 / word.length)).toFixed(2) + 's';
            wrap.insertBefore(span, loader);
          }
        });
      }
      function setLang(lang) {
        // Валидация поддерживаемых языков
        var supportedLangs = ['ru', 'en', 'de', 'fr'];
        if (supportedLangs.indexOf(lang) === -1) {
          console.warn('[i18n] Попытка установить неподдерживаемый язык:', lang, '- используется русский');
          lang = 'ru';
        }
        currentLang = lang;
        window._currentLang = lang;
        window.currentLang = lang;
        try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (_) {}
        // Язык песни не меняем при смене языка интерфейса — это независимый выбор пользователя
        applyTranslations();
        // Пейволл Картотеки: цена/label CTA рендерятся JS-ом (11-heroes) — без
        // пересинхрона после смены языка label сбрасывался, цена оставалась старой.
        try { if (typeof window._masterUnlockSync === 'function') window._masterUnlockSync(); } catch(_) {}
        localizeLoaderLetters();
        // Формат даты в Chromium/WebView зависит от lang самого input — обновляем
        document.querySelectorAll('input[type="date"]').forEach(function(el) { el.lang = lang; });
        // VK Testers #7257216: overlay placeholder для Safari MacOS (см. CSS .date-input-wrap)
        if (typeof _initDatePlaceholderOverlays === 'function') { try { _initDatePlaceholderOverlays(); } catch(_) {} try { setTimeout(function(){ try { _initDatePlaceholderOverlays(); } catch(_) {} }, 600); } catch(_) {} }
        // VK Testers (Алла 20.05): text-маска для time inputs (ЧЧ:ММ)
        if (typeof _initAllTimeInputMasks === 'function') try { _initAllTimeInputMasks(); } catch(_) {}
        // Принудительно обновляем кнопку оплаты после смены языка
        ensurePayButtonText();
        // VK Testers 7276044 (Windows EN, 15.05.2026): локализация tooltips тарифов
        if (typeof applyPpcTooltips === 'function') try { applyPpcTooltips(); } catch(_) {}
        // VK Testers 7276305 (Windows EN): после смены языка обновляем выбранные значения
        // в custom dropdowns (Пол / Язык песни / даты) — option.textContent уже на новом языке.
        if (typeof window._syncCustomDropdowns === 'function') try { window._syncCustomDropdowns(); } catch(_) {}
        // Динамическая подсказка имени (Алла 05.07): пере-локализуем текст под полем имени/партнёра
        // на новом языке с учётом заполнено/пусто.
        if (typeof window._syncNameHints === 'function') try { window._syncNameHints(); } catch(_) {}
        // Обновляем профиль (бейдж тарифа, тексты) при смене языка
        if (typeof loadProfilePage === 'function') try { loadProfilePage().catch(function(){}); } catch(_) {}
      }
      // VK Testers 7276044: locale-aware tooltips для карточек тарифов
      window.PPC_TOOLTIPS = {
        planFreeF1: {
          ru: 'Первая песня создаётся сразу — минута звучания в подарок, целиком открывается одним лёгким платежом.',
          en: 'Your first song is created right away — one minute as a gift, unlock the full track with one light payment.',
          de: 'Dein erster Song entsteht sofort — eine Minute geschenkt, ganz freischalten mit einer kleinen Zahlung.',
          fr: 'Ta première chanson se crée tout de suite — une minute en cadeau, ouvre-la en entier avec un petit paiement.'
        },
        planFreeF2: {
          ru: 'Доступны все три формата: Для себя, Для двоих и Энергия дня.',
          en: 'All three formats are available: About me, About us, Energy of the day.',
          de: 'Alle drei Formate verfügbar: Über mich, Über uns, Tagesenergie.',
          fr: 'Trois formats disponibles: À propos de moi, À propos de nous, Énergie du jour.'
        },
        planBasicF1: {
          ru: '5 новых персональных песен каждый месяц. Разовая цена — 490 ₽/трек. В пакете выходит 162 ₽/трек. Экономия 67%.',
          en: '5 new personal songs. Single track — $5.99. With a package it\'s ~$1.98/track. 67% saving.',
          de: '5 neue persönliche Songs. Einzeltrack — $5.99. Im Paket ~$1.98/Track. 67% Ersparnis.',
          fr: '5 nouveaux titres personnels. Titre unique — $5.99. Avec un pack ~$1.98/titre. 67% d\'économie.'
        },
        planBasicF2: {
          ru: 'Чат с Оракулом — живой разговор с твоей душой на основе твоих личных данных. Задавай вопросы о себе, своём характере, пути и предназначении. До 50 сообщений.',
          en: 'Oracle chat — a live conversation with your soul based on your personal data. Ask about yourself, your character, path and purpose. Up to 50 messages.',
          de: 'Orakel-Chat — ein lebendiges Gespräch mit deiner Seele basierend auf deinen persönlichen Daten. Bis zu 50 Nachrichten.',
          fr: 'Chat avec l\'Oracle — une conversation vivante avec ton âme basée sur tes données personnelles. Jusqu\'à 50 messages.'
        },
        planBasicF3: {
          ru: 'Все твои песни сохраняются в истории. Можно вернуться, переслушать и поделиться в любое время.',
          en: 'All your songs are saved in history. Return, replay and share anytime.',
          de: 'Alle deine Songs werden gespeichert. Jederzeit anhören und teilen.',
          fr: 'Tous tes titres sont sauvegardés. Réécoute et partage à tout moment.'
        },
        planPlusF1: {
          ru: '15 персональных песен. Разовая цена — 490 ₽/трек. В пакете выходит 135 ₽/трек. Экономия 72%.',
          en: '15 personal songs. Single track — $5.99. With a package ~$1.66/track. 72% saving.',
          de: '15 persönliche Songs. Einzeltrack — $5.99. Im Paket ~$1.66/Track. 72% Ersparnis.',
          fr: '15 titres personnels. Titre unique — $5.99. Avec un pack ~$1.66/titre. 72% d\'économie.'
        },
        planPlusF2: {
          ru: 'Чат с Оракулом — живой разговор с твоей душой. В Plus — без ограничений по количеству сессий. Общайся когда угодно.',
          en: 'Oracle chat — a live conversation with your soul. In Plus — unlimited sessions. Talk anytime.',
          de: 'Orakel-Chat — Gespräch mit deiner Seele. In Plus — unbegrenzte Sitzungen.',
          fr: 'Chat avec l\'Oracle — conversation avec ton âme. Dans Plus — sessions illimitées.'
        },
        planPlusF3: {
          ru: 'Твои заявки идут в первую очередь — песня готова быстрее, чем у других пользователей.',
          en: 'Your requests come first — song is ready faster than for other users.',
          de: 'Deine Anfragen kommen zuerst — Song schneller fertig als bei anderen.',
          fr: 'Tes demandes passent en premier — le titre est prêt plus vite.'
        },
        planPlusF4: {
          ru: 'Все твои песни сохраняются с текстами, аудио и датами создания — всегда доступны в профиле.',
          en: 'All songs are saved with lyrics, audio and creation dates — always available in profile.',
          de: 'Alle Songs mit Texten, Audio und Erstellungsdatum gespeichert.',
          fr: 'Tous les titres sauvegardés avec paroles, audio et dates.'
        },
        planPlusF5: {
          ru: 'Укажи желаемый жанр или стиль (поп, соул, джаз, электронная и т.д.) — песня будет создана в этом звучании.',
          en: 'Specify a genre or style (pop, soul, jazz, electronic, etc.) — song will be created in that sound.',
          de: 'Gib einen Stil an (Pop, Soul, Jazz, etc.) — Song wird in diesem Sound erstellt.',
          fr: 'Indique un genre (pop, soul, jazz, etc.) — titre créé dans ce son.'
        },
        planPlusF6: {
          ru: 'Текстовая расшифровка каждой песни включена в пакет — запрашивай без дополнительной оплаты.',
          en: 'Text breakdown for every song included — request without extra charge.',
          de: 'Text-Aufschlüsselung jedes Songs inklusive — ohne Aufpreis.',
          fr: 'Décryptage textuel de chaque titre inclus — sans frais supplémentaires.'
        },
        planMasterF1: {
          ru: '30 персональных песен каждый месяц — для себя и для близких. Максимальный объём.',
          en: '30 personal songs — for yourself and your loved ones. Maximum volume.',
          de: '30 persönliche Songs — für dich und deine Lieben.',
          fr: '30 titres personnels — pour toi et tes proches.'
        },
        planMasterF2: {
          ru: 'Добавляй близких в Лабораторию и создавай для них песни в один тап. Данные сохраняются — вводить повторно не нужно.',
          en: 'Add loved ones to the Lab and create songs for them in one tap. Data is saved.',
          de: 'Füge deine Lieben zum Labor hinzu und erstelle Songs in einem Tap.',
          fr: 'Ajoute tes proches au Laboratoire, crée des titres en un tap.'
        },
        planMasterF3: {
          ru: 'Полная история всех созданных песен с текстами, аудио и датами — для тебя и для каждого из твоих людей.',
          en: 'Full history of all songs with lyrics, audio and dates — for you and your people.',
          de: 'Vollständige Historie aller Songs — für dich und deine Personen.',
          fr: 'Historique complet de tous les titres — pour toi et tes proches.'
        },
        planMasterF4: {
          ru: 'Неограниченный доступ к Чат с Оракулом — разговаривай с душой столько, сколько нужно.',
          en: 'Unlimited Oracle chat — talk with your soul as much as needed.',
          de: 'Unbegrenzter Orakel-Chat — sprich mit deiner Seele.',
          fr: 'Chat illimité avec l\'Oracle — parle autant que nécessaire.'
        },
        planMasterF5: {
          ru: 'Укажи желаемый жанр или стиль (поп, соул, джаз, электронная и т.д.) — песня будет создана в этом звучании.',
          en: 'Specify a genre or style (pop, soul, jazz, electronic, etc.) — song will be created in that sound.',
          de: 'Gib einen Stil an (Pop, Soul, Jazz, etc.) — Song wird in diesem Sound erstellt.',
          fr: 'Indique un genre (pop, soul, jazz, etc.) — titre créé dans ce son.'
        },
        planMasterF6: {
          ru: 'Текстовая расшифровка каждой песни включена в пакет — запрашивай без дополнительной оплаты.',
          en: 'Text breakdown for every song included — request without extra charge.',
          de: 'Text-Aufschlüsselung jedes Songs inklusive — ohne Aufpreis.',
          fr: 'Décryptage textuel de chaque titre inclus — sans frais supplémentaires.'
        }
      };
      window.applyPpcTooltips = function applyPpcTooltips() {
        var lang = window._currentLang || 'ru';
        var map = window.PPC_TOOLTIPS || {};
        Object.keys(map).forEach(function(spanId) {
          var span = document.getElementById(spanId);
          if (!span) return;
          var feature = span.closest('.ppc-feature');
          if (!feature) return;
          var infoIcon = feature.querySelector('.ppc-info');
          if (!infoIcon) return;
          var tip = (map[spanId][lang] || map[spanId].ru || '').trim();
          if (tip) infoIcon.setAttribute('data-tip', tip);
        });
      };
      function ensurePayButtonText() {
        var mainPayBtn = document.getElementById('payOvMainPayBtn');
        var isFree = activePromo && Number(activePromo.amount_after) === 0;
        if (isFree) return;
        var sku = pendingPaymentSku || getCurrentSku();
        var item = pricingCatalog && pricingCatalog.find(function(x) { return x && x.sku === sku; });
        var priceStr = item ? (String(item.price) + ' ' + (item.currency || '₽')) : '';
        if (mainPayBtn) {
          mainPayBtn.textContent = priceStr ? (t('pay') + ' — ' + priceStr) : t('pay');
        }
      }
      function isTelegramWebApp() {
        return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 10);
      }

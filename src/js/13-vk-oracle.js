
      /* ══════════════════════════════════════════════════════════════════════
         ОРАКУЛ-ONLY НА НАТИВЕ VK (Android/iOS) — подача v6, задача Аллы 25.07

         Правила VK Mini Apps §5.4.1: цифровые ценности продаются только на
         vk.ru/m.vk.ru. Подаём приложение как музыкальный оракул: на нативных
         клиентах генерация песен убрана целиком — входы скрыты (CSS
         .is-vk-oracle), навигация в песенные экраны заблокирована, бэкенд
         отвечает 403 (bot/index.js, _vkNativeSongsBlocked).

         Остаются: чат-оракул, разборы-призмы, дневник, совместимость,
         Искры (тур/Искра дня/уведомления) и плейлист с уже созданными песнями
         — доступ к полученному правила не ограничивают.

         ИЗОЛЯЦИЯ: весь модуль за ранним выходом _vkSongsOff(). На web, TG,
         OK, vk.ru и m.vk.ru функция возвращает false → ни один обработчик не
         вешается, ни один текст не меняется, goToPage не оборачивается.
         Модуль идёт ПОСЛЕ общего IIFE — доступ только через window.*
         ══════════════════════════════════════════════════════════════════════ */
      (function() {
        if (!(window._vkSongsOff && window._vkSongsOff())) return;

        var _t = function(k, fb) {
          try { if (typeof window.t === 'function') { var v = window.t(k); if (v && v !== k) return v; } } catch (_) {}
          return fb || '';
        };

        // ── 1. Тексты: главная + пустой плейлист ────────────────────────────
        // Вызывается из applyTranslations ПОСЛЕДНИМ (01-core-i18n) — иначе карта
        // селекторов вернёт «Получи свою песню» на смене языка и back-навигации.
        window._vkOracleApplyTexts = function _vkOracleApplyTexts() {
          var set = function(id, key, fb) {
            var el = document.getElementById(id);
            if (el) el.textContent = _t(key, fb);
          };
          var hide = function(id) {
            var el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
          };

          var tagline = document.getElementById('homeTagline');
          if (tagline) tagline.innerHTML = _t('vkOracleHeroTitleHtml', 'Оракул знает твою дату рождения — и отвечает');
          // Тизер и счётчик песен на оракульной главной не нужны (макет Аллы 26.07)
          hide('homeTeaserText');
          hide('homeSongCounter');
          set('startBtn', 'vkOracleHeroCta', 'Задать вопрос');

          var head = document.querySelector('#homeHero .home-card-choices-head');
          if (head) head.textContent = _t('vkOracleChoicesHead', 'Спроси сегодня');
          var choices = document.querySelectorAll('#homeHero .home-choice');
          for (var i = 0; i < choices.length && i < 4; i++) {
            choices[i].textContent = _t('vkOracleChoice' + (i + 1), '');
            choices[i].setAttribute('data-oracle-ask', String(i + 1));
          }

          // Пустой плейлист: вместо «Создай первую» — путь в оракул
          set('mtEmptyTitleEl', 'vkOracleEmptyTitle', 'Оракул отвечает на твои вопросы');
          set('mtEmptyDescEl', 'vkOracleEmptyDesc', 'Спроси о себе — по дате рождения');
          set('mtEmptyCtaEl', 'vkOracleAskBtn', 'Спросить оракула');
        };

        // ── 1.1. Онбординг: не обещать того, чего на этой платформе нет ──────
        // Штатный тур продаёт песню (слайд 1) и подарки песен с Радио (слайд 4).
        // На нативе VK генерации нет вообще — человек с айфона проходит знакомство,
        // ждёт песню и не находит её. Подменяем два слайда на то, что тут работает:
        // оракул и разборы с практикой. Слайды 2 и 3 (оракул, совместимость) верны.
        window._vkOracleApplyOnboarding = function _vkOracleApplyOnboarding() {
          var slides = document.querySelectorAll('#onboardingPage .ob-slide');
          if (!slides.length) return;

          var setIn = function(slide, sel, key, fb) {
            var el = slide && slide.querySelector(sel);
            if (!el) return;
            // Внутри заголовков лежит <span data-i18n> рядом с иконкой — пишем в него,
            // иначе сотрём SVG (та же грабля, что закон №21 про applyTranslations).
            var inner = el.querySelector('[data-i18n]');
            (inner || el).textContent = _t(key, fb);
          };

          var s1 = slides[0];
          if (s1) {
            setIn(s1, '.ob-eyebrow', 'vkObSlide1Eyebrow', 'Твой оракул');
            setIn(s1, '.ob-title', 'vkObSlide1Title', 'Оракул читает твою дату рождения');
            setIn(s1, '.ob-sub', 'vkObSlide1Sub', 'Спроси о себе — ответ придёт по твоей карте. Первые десять вопросов в подарок.');
            // Второй чип показывает хронометраж трека — на этой платформе он ни о чём.
            var chip2 = s1.querySelectorAll('.ob-chip')[1];
            if (chip2) chip2.textContent = _t('vkObChipFree', '10 вопросов в подарок');
          }

          // Экран согласия обещает «создание песни» — на нативе её нет вовсе.
          var consentNote = document.querySelector('.vk-consent-privacy');
          if (consentNote) consentNote.textContent = _t('vkConsentDataOracle', 'Данные хранятся на серверах в России. Для разборов часть данных передаётся сервисам генерации, в том числе за рубежом — подробности в Политике.');

          var s4 = slides[3];
          if (s4) {
            setIn(s4, '.ob-eyebrow', 'vkObSlide4Eyebrow', 'Разборы и практика');
            setIn(s4, '.ob-title', 'vkObSlide4Title', 'Разборы о себе и практика на 21 день');
            setIn(s4, '.ob-sub', 'vkObSlide4Sub', 'Пятнадцать разборов по твоей карте. И аскеза — практика, которую делают три недели, а не читают один раз.');
            var chips4 = s4.querySelectorAll('.ob-chip');
            if (chips4[0]) chips4[0].textContent = _t('vkObChipPrisms', 'разборы карты');
            if (chips4[1]) chips4[1].textContent = _t('vkObChipAskeza', 'аскеза · 21 день');
            // Иконка подарка осталась от «дари песни» — здесь она обещает дарение,
            // которого на платформе нет. Ставим календарь с отметкой: 21 день практики.
            var calendar = '<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="m8.5 14.5 2.5 2.5 4.5-4.5"/></svg>';
            var glyph4 = s4.querySelector('.ob-art-glyph');
            if (glyph4) glyph4.innerHTML = calendar;
            var eyebrowIcon = s4.querySelector('.ob-eyebrow svg');
            if (eyebrowIcon) {
              var small = document.createElement('span');
              small.innerHTML = calendar.replace('width="60" height="60"', 'width="16" height="16"');
              eyebrowIcon.replaceWith(small.firstChild);
            }
          }
        };

        // ── 2. Навигация: экраны заказа песни недоступны ────────────────────
        // Fail-closed второй рубеж к CSS: даже если кнопка где-то уцелела или
        // вызов пришёл из старого кода — уводим в оракул, а не в тупик.
        // formPage тут НЕТ (решение Аллы 27.07): форма видна и заполняется,
        // вместо кнопки создания — заглушка «Генерация песен на платформе
        // недоступна» (#vkFormStubHint, CSS is-vk-oracle) + бэкенд-403.
        var BLOCKED_PAGES = { giftPage: 1, giftPayPage: 1, songUnlockPage: 1 };
        function wrapGoToPage() {
          if (typeof window.goToPage !== 'function' || window.goToPage._vkOracleWrapped) return false;
          var orig = window.goToPage;
          var wrapped = function(pageId) {
            if (BLOCKED_PAGES[pageId]) {
              if (typeof window.goToSoulChat === 'function') return window.goToSoulChat();
              return orig.call(this, 'soulChatPage');
            }
            return orig.apply(this, arguments);
          };
          wrapped._vkOracleWrapped = true;
          window.goToPage = wrapped;
          return true;
        }
        if (!wrapGoToPage()) {
          // goToPage объявляется в общем IIFE выше — на всякий случай ждём.
          var _tries = 0;
          var _int = setInterval(function() {
            if (wrapGoToPage() || ++_tries > 60) clearInterval(_int);
          }, 100);
        }

        // ── 3. Быстрые темы → вопрос оракулу ────────────────────────────────
        // Тот же приём, что _askOracleAboutDay (05-promo-pay-helpers): открыть
        // чат и положить вопрос в композер, отправку оставить пользователю.
        function askOracle(n) {
          if (typeof window.goToSoulChat === 'function') window.goToSoulChat();
          setTimeout(function() {
            var q = document.getElementById('scPageQuestion');
            if (!q) return;
            q.value = _t('vkOracleQ' + n, '');
            try { q.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
            try { q.focus(); } catch (_) {}
          }, 350);
        }

        // Делегирование в CAPTURE-фазе: перехватываем раньше штатных
        // обработчиков (handleQuickAction, startBtn, inline onclick).
        // #mtCreateBtn здесь НЕТ — «Создать новую песню» в Плейлисте ведёт в форму
        // (форма со стабом, решение Аллы 27.07). #mtEmptyCtaEl остаётся: в пустом
        // состоянии кнопка перетекстована на «Спросить оракула».
        document.addEventListener('click', function(e) {
          var el = e.target && e.target.closest ? e.target.closest(
            '#startBtn, #homeHero .home-choice, #mtEmptyCtaEl, .mt-upsell-btn, ' +
            '#scCreateRequestBtn, #recoveryClaimBtn, #soCreateBtn, #soCreateGhost, #grCreateBtn, ' +
            '#profileCreateSongBtn, #profilePage .track-item, #_selfSongBtn'
          ) : null;
          if (!el) return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          var ask = el.getAttribute && el.getAttribute('data-oracle-ask');
          if (ask) return askOracle(parseInt(ask, 10) || 1);
          if (typeof window.goToSoulChat === 'function') window.goToSoulChat();
        }, true);

        // ── 4. Первичная отрисовка ──────────────────────────────────────────
        // applyTranslations вызовет хук сама, но на холодном старте она могла
        // отработать до загрузки этого модуля — применяем тексты явно.
        function boot() {
          try { window._vkOracleApplyTexts(); } catch (_) {}
          try { window._vkOracleApplyOnboarding(); } catch (_) {}
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', boot);
        } else {
          boot();
        }
        // Страницы рендерятся асинхронно (профиль/плейлист грузятся по API) —
        // повторяем на первых секундах, чтобы поймать поздние узлы.
        var _reps = 0;
        var _repInt = setInterval(function() { boot(); if (++_reps > 10) clearInterval(_repInt); }, 500);
      })();

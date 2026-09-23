
      // ── Покупка пакета Искр — переиспользуем planConfirmOverlay ─────────
      var ISKRY_PACK_INFO = {
        // КАНОН v4 (11.07): мелкий пакет-вход, VK-only (за голоса); rub/stars/oki пустые намеренно
        iskry_pack_100:  { iskry: 100,  songs: 1,  usd: '', rub: '',      stars: 0,    votes: 45,  oki: 0 },
        iskry_pack_1000: { iskry: 1000, songs: 10, usd: '', rub: '1 630', stars: 1540, votes: 230, oki: 1630 },
        iskry_pack_2000: { iskry: 2000, songs: 20, usd: '', rub: '2 450', stars: 2310, votes: 350, oki: 2450 },
        iskry_pack_5000: { iskry: 5000, songs: 50, usd: '', rub: '5 300', stars: 5000, votes: 750, oki: 5300 },
      };
      window.showIskryPackPayment = function showIskryPackPayment(sku) {
        // КАНОН v9 OK (отказ 29.07 18:54): «Монетизация должна быть как для цифровых
        // ценностей, а не виртуальных». ОКи — по гайду ОК единица обмена ВИРТУАЛЬНЫХ
        // ценностей, значит нам они не подходят: продаём за ₽ картой, как web/vk.ru.
        // КАНОН v8 VK (отказ 27.07 18:08): голосов на VK НЕТ вообще — модератор
        // отнёс Искры к цифровым товарам. Значит §5.4.1: пакеты продаются за ₽
        // (карта T-Bank) и ТОЛЬКО на vk.ru/m.vk.ru; на клиентах iOS/Android окно
        // покупки не открывается вовсе. Двойной кнопки «₽ + голоса» больше нет
        // физически — именно её модератор снял скриншотом.
        var _isOk = window._appEnv === 'ok' || window._isOkMiniApp === true;
        var _isVkEnv = window._isVkMiniApp || window._appEnv === 'vk';
        var _vkMoney = _isVkEnv && !!(window._vkPayMode && window._vkPayMode() === 'money');
        // Натив/планшет VK: платежей нет — окно не открываем (fail-closed, §5.4.1).
        if (_isVkEnv && !_vkMoney) {
          console.warn('[IskryPack] заблокировано: на клиентах VK оплаты нет (§5.4.1, канон v8)');
          return;
        }
        // Пакет без рублёвой цены на VK не продаётся (мелкий пакет-100 был VK-only за голоса).
        var _packChk = ISKRY_PACK_INFO[sku];
        if (_isVkEnv && (!_packChk || !_packChk.rub)) {
          console.warn('[IskryPack] на VK пакет без рублёвой цены недоступен:', sku);
          return;
        }
        window._cfIsPack = true;
        var pack = ISKRY_PACK_INFO[sku];
        if (!pack) return;
        var overlay = document.getElementById('planConfirmOverlay');
        if (!overlay) return;
        var title = document.getElementById('planConfirmTitle');
        var planNameEl = document.getElementById('planConfirmPlanName');
        var priceEl = document.getElementById('planConfirmPrice');
        var desc = document.getElementById('planConfirmDesc');
        var mainBtn = document.getElementById('planConfirmMainBtn');
        var methodsBlock = document.getElementById('planConfirmMethodsBlock');
        var cardBtn = document.getElementById('planConfirmCardBtn');
        var starsBtn = document.getElementById('planConfirmStarsBtn');
        /* _tl — глобальная, определена рядом с t() */

        if (title) title.textContent = _tl('iskryPacksTitle', 'Пополнить Искры');
        if (planNameEl) planNameEl.textContent = pack.iskry + ' Искр';
        if (priceEl) { priceEl.textContent = pack.rub + ' ₽'; } // реальная цена T-Bank — на всех локалях (usd не задан)
        // Канон v7: на VK Искры тратятся на Оракула (1 вопрос = 1 Искра), не на песни.
        if (desc) desc.textContent = _isVkEnv
          ? (pack.iskry + ' ' + _tl('iskryPackQuestions', 'вопросов Оракулу'))
          : (pack.songs + ' ' + _tl('iskryPackSongs', 'песен'));

        // Скрыть промокод для пакетов Искр
        var _promoToggle = document.getElementById('planPromoToggleBtn');
        var _promoRow = document.getElementById('planPromoRow');
        if (_promoToggle) _promoToggle.style.display = 'none';
        if (_promoRow) _promoRow.style.display = 'none';

        // Сброс: одна кнопка «Оплатить» видна, блок методов скрыт
        if (mainBtn) {
          mainBtn.style.display = '';
          mainBtn.style.animation = '';
          mainBtn.textContent = _tl('pay', 'Оплатить') + ' — ' + (pack.usd || pack.rub + ' ₽');
        }
        if (methodsBlock) methodsBlock.style.display = 'none';

        // КАНОН v8: на VK цена в ₽ и РОВНО ОДНА кнопка на экране — «Оплатить картой».
        // Общий mainBtn прячем: вместе с раскрытым блоком методов он давал две кнопки
        // подряд, а именно «кнопку для двойной оплаты» модератор снял скриншотом 27.07.
        // OK (канон v9): та же рамка, что VK-money — ₽ и одна кнопка «Оплатить картой».
        if (_isVkEnv || _isOk) {
          if (mainBtn) mainBtn.style.display = 'none';
          if (methodsBlock) methodsBlock.style.display = 'block';
        }

        // Card (T-Bank) — работает и на VK-money, и на OK (канон v9: цифровой товар
        // за деньги; ОКи как валюта виртуальных ценностей нам не подходят).
        if (false) {
          cardBtn.style.display = 'none';
        } else if (cardBtn) {
          cardBtn.style.display = '';
          cardBtn.textContent = _tl('bsPayCard', 'Оплатить картой') + ' — ' + pack.rub + ' ₽';
          cardBtn.disabled = false;
          cardBtn.onclick = async function() {
            // ОТКАЗ ОК 03.08: тут стоял блокирующий `if (!_tbankAvailable)` с тостом
            // об отсутствии карты. Флаг взводится только после ответа /tbank/config,
            // поэтому на медленной сети (и у модератора ОК) клик умирал тостом —
            // это и был его скриншот «Оплата не работает».
            // Ту же проверку уже сняли с песенной кнопки в Batch 7.14 по той же
            // причине; здесь и в подписке она осталась. Решение то же: не гадать
            // на клиенте, а спросить бэкенд — он вернёт 503/401/200 с точным кодом.
            var origText = cardBtn.textContent;
            cardBtn.textContent = _tl('bsConnectingBank', 'Подключаемся к банку...');
            cardBtn.disabled = true;
            try {
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              var initData = getInitData ? getInitData() : '';
              var resp = await fetch(apiBase + '/api/payments/tbank/init', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ sku: sku, initData: initData })
              });
              var data = await resp.json().catch(function() { return {}; });
              if (!resp.ok || !data.success || !data.payment_url) {
                cardBtn.textContent = origText; cardBtn.disabled = false;
                showToast(_tl('bsPaymentCreateError', 'Ошибка создания платежа')); return;
              }
              try {
                localStorage.setItem('tbank_payment_id', data.payment_id || '');
                localStorage.setItem('tbank_order_id', data.order_id || '');
                localStorage.setItem('pending_payment_type', JSON.stringify({ type: 'iskry_pack', sku: sku, request_id: data.request_id || '', ts: Date.now() }));
              } catch(e) {}
              overlay.style.display = 'none';
              // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
              if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
                vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
                  .catch(function(){ try { window.open(data.payment_url, '_blank'); } catch(_) {} });
              } else if (tg && typeof tg.openLink === 'function') {
                tg.openLink(data.payment_url);
              } else {
                window.open(data.payment_url, '_blank');
              }
              cardBtn.textContent = origText; cardBtn.disabled = false;
            } catch(e) {
              cardBtn.textContent = origText; cardBtn.disabled = false;
              showToast(_tl('bsPaymentCreateError', 'Ошибка'));
            }
          };
        }

        // Stars — только Telegram
        if (starsBtn && pack.stars && window._appEnv === 'telegram') {
          starsBtn.style.display = '';
          starsBtn.textContent = _tl('bsPayStars', 'Оплатить звёздами') + ' — ' + pack.stars;
          starsBtn.disabled = false;
          starsBtn.onclick = function() { payWithStars(sku, null, starsBtn); };
        } else if (starsBtn) {
          starsBtn.style.display = 'none';
        }

        // КАНОН v9: ShowOrderBox не используется нигде — ни голоса на VK (отказ 27.07),
        // ни ОКи на Одноклассниках (отказ 29.07). Кнопка скрыта всегда; CSS-предохранители
        // `html.is-vk #planConfirmVkPayBtn` и `html.is-ok #planConfirmVkPayBtn` дублируют.
        var vkPayBtn = document.getElementById('planConfirmVkPayBtn');
        if (vkPayBtn) vkPayBtn.style.display = 'none';

        // Кнопка отключённого способа оплаты удалена из продукта (решение Аллы 27.08.2026) —
        // пакеты оплачиваются картой или Telegram Stars.

        overlay.style.display = 'flex';
      };

      var planBtnBasic = document.getElementById('planBtnBasic');
      if (planBtnBasic) planBtnBasic.addEventListener('click', function() {
        showPlanConfirm('plan_basic', 'Душа');
      });
      var planBtnPlus = document.getElementById('planBtnPlus');
      if (planBtnPlus) planBtnPlus.addEventListener('click', function() {
        showPlanConfirm('plan_plus', 'Глубина');
      });
      var planBtnMaster = document.getElementById('planBtnMaster');
      if (planBtnMaster) planBtnMaster.addEventListener('click', function() {
        showPlanConfirm('plan_master', 'Лаборатория');
      });

      // Batch 9.16 (отчёт Грубниковой «Цена не кликабельна»): юзер тапал на
      // цену 810 ₽ и ожидал что откроется оплата. Цена же была статичным
      // текстом — оплата работала только через .ppc-btn. Делаем всю
      // price-wrap кликабельной (тот же handler что у .ppc-btn).
      (function makePricesClickable() {
        var plans = [
          { id: 'planCardBasic', key: 'plan_basic', name: 'Душа' },
          { id: 'planCardPlus',  key: 'plan_plus',  name: 'Глубина' },
          { id: 'planCardMaster', key: 'plan_master', name: 'Лаборатория' },
        ];
        plans.forEach(function(p) {
          var card = document.getElementById(p.id);
          if (!card) return;
          var priceWrap = card.querySelector('.ppc-price-wrap');
          if (!priceWrap) return;
          // VK Testers 7275294 (MacOS 15.05.2026): «Кликабельный блок цены
          // при подключённом тарифе меняет курсор, реагирует на hover/click,
          // но целевое действие не происходит». Корень: cursor:pointer +
          // role+tabindex ставились БЕЗУСЛОВНО, но handler делал early-return
          // если card.classList.contains('current'). Юзер видит кликабельность,
          // но кликнуть «не работает». Фикс: refresh-функция, которая снимает
          // pointer/role/tabindex когда .current, ставит обратно когда не .current.
          function _refreshPriceClickable() {
            if (card.classList.contains('current')) {
              priceWrap.style.cursor = 'default';
              priceWrap.removeAttribute('role');
              priceWrap.removeAttribute('tabindex');
              priceWrap.setAttribute('aria-disabled', 'true');
            } else {
              priceWrap.style.cursor = 'pointer';
              priceWrap.setAttribute('role', 'button');
              priceWrap.setAttribute('tabindex', '0');
              priceWrap.removeAttribute('aria-disabled');
            }
          }
          _refreshPriceClickable();
          // Перепроверяем при изменениях class (loadProfilePage переключает .current async)
          var _classObserver = new MutationObserver(_refreshPriceClickable);
          _classObserver.observe(card, { attributes: true, attributeFilter: ['class'] });
          var handler = function(e) {
            if (card.classList.contains('current')) return;
            if (typeof showPlanConfirm === 'function') showPlanConfirm(p.key, p.name);
          };
          priceWrap.addEventListener('click', handler);
          priceWrap.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
          });
        });
      })();

      // Тултипы для фич тарифов (.ppc-info)
      (function() {
        var tooltip = document.getElementById('modeTooltip');
        if (!tooltip) return;
        var timer = null;
        function hide() { tooltip.style.display = 'none'; clearTimeout(timer); }
        document.querySelectorAll('.ppc-info').forEach(function(icon) {
          icon.addEventListener('click', function(e) {
            e.stopPropagation();
            var text = this.getAttribute('data-tip') || '';
            if (!text) return;
            tooltip.textContent = text;
            tooltip.style.display = 'block';
            var rect = this.getBoundingClientRect();
            var tw = tooltip.offsetWidth || 220;
            var left = Math.min(rect.left, window.innerWidth - tw - 12);
            tooltip.style.left = Math.max(8, left) + 'px';
            tooltip.style.top = (rect.bottom + 8) + 'px';
            clearTimeout(timer);
            timer = setTimeout(hide, 4000);
          });
        });
        // Batch 10.14 (отчёт 7257364 Елизавета Шейкина MacOS): тултип
        // position:fixed остаётся в viewport при scroll, а иконка `i` уезжает
        // вниз — тестер видит «плавающий» тултип не привязанный к кнопке.
        // Скрываем при любом scroll (window + .profile-scroll + .page-scroll).
        var _hideOnScroll = function() { if (tooltip.style.display === 'block') hide(); };
        window.addEventListener('scroll', _hideOnScroll, { passive: true, capture: true });
        document.addEventListener('click', function(e) {
          // Click outside tooltip and not on .ppc-info → close
          if (tooltip.style.display === 'block' && !tooltip.contains(e.target) && !e.target.classList.contains('ppc-info')) hide();
        }, { passive: true });
      })();
      var profileRefShareBtn = document.getElementById('profileRefShareBtn');
      if (profileRefShareBtn) profileRefShareBtn.addEventListener('click', function() {
        var link = (document.getElementById('profileRefLinkInput') || {}).value || '';
        if (!link) return;
        var userName = '';
        try { userName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || ''; } catch(e) {}
        // VK Testers 7274710 (Maria Lykosova Android): текст шаринга был hardcoded RU,
        // не зависел от выбранного языка. Теперь через t() — переключается с UI.
        var shareText = userName
          ? (typeof t === 'function' ? (t('refShareTextWithName') || 'Привет! Вот приложение, которое создаёт персональную песню на основе даты рождения. Реально крутое — попробуй, минута твоей песни в подарок!') : 'Привет! Вот приложение, которое создаёт персональную песню на основе даты рождения. Реально крутое — попробуй, минута твоей песни в подарок!')
          : (typeof t === 'function' ? (t('refShareText') || 'Вот приложение — создаёт персональную песню на основе даты рождения. Минута твоей песни в подарок, попробуй!') : 'Вот приложение — создаёт персональную песню на основе даты рождения. Минута твоей песни в подарок, попробуй!');
        var fullText = shareText + '\n\n' + link;
        // VK Testers 7256516 (Кирилл Onуфриенко Windows VK Desktop): кнопка
        // «Поделиться» не реагировала. Root cause: silent fail цепочки
        // (1) tg.openTelegramLink — есть стуб у VK Bridge но nothing happens,
        // (2) navigator.share — silent .catch без fallback, (3) ничего.
        // Фикс: единая последовательность с **обязательным** toast feedback на
        // каждом исходе. VK env — приоритет VKWebAppShare. Telegram env —
        // openTelegramLink. Web — navigator.share с then/catch + fallback на
        // clipboard. Никаких silent fail.
        var copyFallback = function(msg) {
          // §22: единый хелпер — сам уходит в execCommand на VK и старых WebView.
          var _done = function(ok) {
            if (ok) {
              if (typeof showToast === 'function') showToast(msg || (typeof t === 'function' ? (t('profileLinkCopied') || 'Ссылка скопирована') : 'Ссылка скопирована'));
              else {
                profileRefShareBtn.textContent = (t && t('profileShare') || 'Поделиться') + ' ✓';
                setTimeout(function() { profileRefShareBtn.textContent = (t && t('profileShare')) || 'Поделиться'; }, 2000);
              }
            } else if (typeof showToast === 'function') {
              /* VK Testers 7279205: `||` имеет нижний приоритет — toast показывал
                 «Скопируй ссылку:» БЕЗ link. Фикс: явные скобки + конкатенация. */
              var _cm = (t && t('copyManually')) || 'Скопируй ссылку:';
              showToast(_cm + ' ' + link);
            }
          };
          try { Promise.resolve(window._copyToClipboard(fullText, { silent: true })).then(_done, function() { _done(false); }); }
          catch(_) { _done(false); }
        };
        // 18.05.2026 Алла одобрила Вариант A: на ВСЕХ платформах единый UX —
        // ВСЕГДА copy в буфер + toast. Никаких VK Bridge / Telegram share
        // dialog / navigator.share / required text.
        copyFallback();
      });

      // ── Кнопка "Скопировать ссылку" ──
      var profileRefCopyBtn = document.getElementById('profileRefCopyBtn');
      if (profileRefCopyBtn) profileRefCopyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var link = (document.getElementById('profileRefLinkInput') || {}).value || '';
        if (!link) {
          profileRefCopyBtn.textContent = '—';
          setTimeout(function() { profileRefCopyBtn.textContent = t('profileCopyLink') || 'Скопировать ссылку'; }, 1500);
          return;
        }
        var origText = profileRefCopyBtn.textContent;
        function showCopied() {
          profileRefCopyBtn.textContent = (t('profileLinkCopied') || 'Ссылка скопирована') + ' ✓';
          profileRefCopyBtn.classList.add('copied');
          setTimeout(function() {
            profileRefCopyBtn.textContent = origText;
            profileRefCopyBtn.classList.remove('copied');
          }, 2500);
        }
        function fallbackCopy() {
          var ta = document.createElement('textarea');
          ta.value = link; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); showCopied(); } catch(e) {}
          document.body.removeChild(ta);
        }
        // VK Testers 7274702 ПЕРЕОТКРЫТ (Maria Lykosova Android EN UI): VK Mini App
        // на mobile при `navigator.clipboard.writeText()` ПЕРЕХВАТЫВАЕТ операцию
        // и показывает свой системный toast «Скопировано в буфер обмена» — ВСЕГДА
        // на VK platform language (русский), независимо от нашего UI. Maria видит
        // RU toast в EN UI. На VK mobile fallback на execCommand — VK НЕ перехватывает.
        if (window._isVkMiniApp && window._vkIsMobileClient) {
          fallbackCopy();
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(showCopied).catch(function() { fallbackCopy(); });
          } else { fallbackCopy(); }
        } catch (e) { fallbackCopy(); }
      });

      // ── ЗАГРУЗКА ФОТО ПРОФИЛЯ ─────────────────────────────────────────────
      (function setupAvatarUpload() {
        var wrap = document.getElementById('profileAvatarWrap');
        var input = document.getElementById('avatarFileInput');
        var spinner = document.getElementById('profileAvatarSpinner');

        if (!wrap || !input) return;

        wrap.addEventListener('click', function() { input.click(); });
        wrap.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

        input.addEventListener('change', function() {
          var file = input.files && input.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) { _showFormHint('Выбери изображение'); return; }

          var reader = new FileReader();
          reader.onload = function(e) {
            var src = e.target.result;
            var img = new Image();
            img.onload = function() {
              // Ресайз до 256×256 через Canvas
              var SIZE = 256;
              var canvas = document.createElement('canvas');
              canvas.width = SIZE; canvas.height = SIZE;
              var ctx = canvas.getContext('2d');
              // Кроп по центру
              var sw = img.width, sh = img.height;
              var side = Math.min(sw, sh);
              var sx = (sw - side) / 2, sy = (sh - side) / 2;
              ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
              var base64 = canvas.toDataURL('image/jpeg', 0.85);

              // Показываем превью сразу
              var avatarEl = document.getElementById('profileAvatar');
              var initEl   = document.getElementById('profileAvatarInitial');
              if (avatarEl) {
                var existing = avatarEl.querySelector('img');
                if (!existing) { existing = document.createElement('img'); existing.alt='avatar'; avatarEl.insertBefore(existing, avatarEl.firstChild); }
                existing.src = base64; existing.style.display = 'block';
              }
              if (initEl) initEl.style.display = 'none';

              // Загружаем на сервер
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              if (!apiBase || !hasAuth()) return;
              var initData = getInitData();
              var avatarAuthH = getAuthHeaders();
              if (spinner) { spinner.style.display = 'flex'; }
              fetch(apiBase + '/api/user/avatar', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, avatarAuthH),
                body: JSON.stringify({ initData: initData, avatar_base64: base64 })
              })
              .then(function(r) { return r.json().then(function(j){ return { status: r.status, json: j }; }); })
              .then(function(result) {
                if (spinner) spinner.style.display = 'none';
                if (result.status >= 200 && result.status < 300 && result.json.ok) {
                  // Кешируем avatar_url локально для быстрого восстановления при reload
                  // (VK Testers 09.05: «Сбрасывается аватар после перезагрузки приложения»)
                  try { localStorage.setItem('yupsoul_avatar_url', result.json.avatar_url || base64); } catch(_) {}
                } else {
                  // Откатываем превью — иначе юзер думает что сохранилось
                  console.warn('[Avatar] upload error:', result.json.error || ('status=' + result.status));
                  var avatarEl2 = document.getElementById('profileAvatar');
                  var initEl2 = document.getElementById('profileAvatarInitial');
                  if (avatarEl2) {
                    var existingImg = avatarEl2.querySelector('img');
                    if (existingImg) existingImg.style.display = 'none';
                  }
                  if (initEl2) initEl2.style.display = '';
                  // Toast для юзера
                  if (typeof showToast === 'function') {
                    var msg = result.json.error || 'Не удалось сохранить фото. Попробуй ещё раз или выбери файл меньшего размера.';
                    showToast(msg);
                  }
                }
              })
              .catch(function(err) {
                if (spinner) spinner.style.display = 'none';
                console.warn('[Avatar] upload failed:', err);
                // Откатываем превью + toast — сетевая ошибка
                var avatarEl3 = document.getElementById('profileAvatar');
                var initEl3 = document.getElementById('profileAvatarInitial');
                if (avatarEl3) {
                  var existingImg2 = avatarEl3.querySelector('img');
                  if (existingImg2) existingImg2.style.display = 'none';
                }
                if (initEl3) initEl3.style.display = '';
                if (typeof showToast === 'function') {
                  showToast('Не удалось сохранить фото. Проверь интернет.');
                }
              });
            };
            img.src = src;
          };
          reader.readAsDataURL(file);
          input.value = ''; // сбрасываем для повторного выбора
        });
      })();

      // ═══ CD 19.09 · Пакет и пополнение (docs/DESIGN-HANDOFF-1909.md, экран 2) ═══
      // Шторка: способы видны сразу (D7), подзаголовок «пакет — что входит», суммы у способов, применённый промокод
      // в чеке, состояние «ждём оплату». Движок (showPlanConfirm, промокод) не переписан — зеркала через MutationObserver.
      (function cfCdInit() {
        var ov = document.getElementById('planConfirmOverlay');
        if (!ov || typeof window.showPlanConfirm !== 'function') return;
        var $ = function (id) { return document.getElementById(id); };
        function tl(k, fb) { var v = typeof t === 'function' ? t(k) : null; return (v && v !== k) ? v : fb; }
        function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
        function setHtml(el, v) { if (el && el.innerHTML !== v) el.innerHTML = v; }
        var origPrice = '', syncing = false, queued = false, waitTimer = null;
        // Строка способа: <span>подпись</span><span class="m-amt">сумма</span>. Движок при частичной скидке пишет
        // textContent «Оплатить картой — 1 522 ₽» и стирает спаны — собираем обратно, сумма берётся после « — ».
        function method(btn, amt) {
          if (!btn) return;
          var amtEl = btn.querySelector('.m-amt');
          if (!amtEl) {
            var parts = btn.textContent.trim().split(' — ');
            btn.innerHTML = '';
            var lbl = document.createElement('span'); lbl.textContent = parts[0];
            amtEl = document.createElement('span'); amtEl.className = 'm-amt'; amtEl.textContent = parts.slice(1).join(' — ');
            btn.appendChild(lbl); btn.appendChild(amtEl);
          }
          if (amt != null) setText(amtEl, amt);
        }
        function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
        function sync() {
          if (syncing) return;
          syncing = true;
          try {
            var name = ($('planConfirmPlanName') || {}).textContent || '', desc = ($('planConfirmDesc') || {}).textContent || '';
            setHtml($('cfSubPlan'), name ? '<b>«' + esc(name.replace(/^«|»$/g, '')) + '»</b>' + (desc ? ' — ' + esc(desc) : '') : esc(desc));
            var price = ($('planConfirmPrice') || {}).textContent || '';
            method($('planConfirmCardBtn'), price.replace(tl('perMonth', '/мес'), '').trim()); // в строке способа — только сумма, как в эталоне
            method($('planConfirmStarsBtn'), null);
            var st = $('planPromoStatus'), ok = !!(st && st.classList.contains('success') && st.textContent.trim());
            if (ok) { if (ov.dataset.promo !== 'ok') ov.dataset.promo = 'ok'; setText($('cfDisc'), st.textContent.trim()); setText($('cfOld'), origPrice !== price ? origPrice : ''); }
            else { if (ov.dataset.promo) delete ov.dataset.promo; setText($('cfDisc'), ''); setText($('cfOld'), ''); }
            var wait = ov.querySelector('.pay-wait span');
            setText(wait, ov.dataset.pay === 'wait' ? tl('payWaitSheet', 'Ждём подтверждение оплаты…') : '');
            if (ov.style.display === 'none' && ov.dataset.pay) { ov.dataset.pay = ''; clearTimeout(waitTimer); }
          } finally { syncing = false; }
        }
        function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; sync(); }); }
        new MutationObserver(function () { if (!syncing) schedule(); })
          .observe(ov, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
        var orig = window.showPlanConfirm;
        window.showPlanConfirm = function (planKey) {
          var r = orig.apply(this, arguments);
          try {
            ov.dataset.pay = ''; clearTimeout(waitTimer);
            if (ov.dataset.promo) delete ov.dataset.promo;
            origPrice = ($('planConfirmPrice') || {}).textContent || '';
            method($('planConfirmStarsBtn'), (typeof PLAN_STARS !== 'undefined' && PLAN_STARS[planKey]) || '');
            // D7: способы сразу, «Подтвердить и оплатить» не нужен; промокод остаётся видимым (в отличие от _cfMethods(true))
            var m = $('planConfirmMethodsBlock'), mb = $('planConfirmMainBtn');
            if (m) m.style.display = 'flex';
            if (mb) mb.style.display = 'none';
            sync();
          } catch (e) { console.warn('[cfCd]', e); }
          return r;
        };
        ['planConfirmCardBtn', 'planConfirmStarsBtn'].forEach(function (id) {
          var b = $(id);
          if (!b) return;
          b.addEventListener('click', function () {
            ov.dataset.pay = 'wait';
            clearTimeout(waitTimer);
            waitTimer = setTimeout(function () { if (ov.dataset.pay === 'wait') ov.dataset.pay = ''; }, 60000);
            schedule();
          }, true);
        });
        window._cfCdSync = sync;
      })();

      // Пополнение Искр: цена за песню у каждого пакета и строка под CTA «+N Искр = M песен».
      (function tuCdInit() {
        var page = document.getElementById('topupPage');
        if (!page) return;
        function tl(k, fb) { var v = typeof t === 'function' ? t(k) : null; return (v && v !== k) ? v : fb; }
        function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
        var syncing = false, queued = false;
        function info(b) { return (b && typeof ISKRY_PACK_INFO !== 'undefined' && ISKRY_PACK_INFO[b.dataset.sku]) || null; }
        function sync() {
          if (syncing) return;
          syncing = true;
          try {
            page.querySelectorAll('.topup').forEach(function (b) {
              var i = info(b), per = b.querySelector('.per');
              var rub = parseInt(String(b.dataset.rub || '').replace(/[^0-9]/g, ''), 10);
              if (per && i && i.songs && rub) setText(per, tl('tuPerSong', '{p} ₽/песня').replace('{p}', Math.round(rub / i.songs)));
            });
            var i = info(page.querySelector('.topup.sel'));
            setText(document.getElementById('tuFootNote'), i ? tl('tuFootNote', '+{n} Искр = {songs} песен · разовая оплата, Искры не сгорают').replace('{n}', i.iskry).replace('{songs}', i.songs) : '');
          } finally { syncing = false; }
        }
        function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; sync(); }); }
        new MutationObserver(function () { if (!syncing) schedule(); })
          .observe(page, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
        window._tuCdSync = sync;
        sync();
      })();

      // ═══ CD 19.09 · Пакеты (docs/DESIGN-HANDOFF-1909.md, экран 3) ═══
      // Карточки — компактные строки с радио; состав раскрыт у выбранной; один primary в липком подвале
      // ведёт на кнопку выбранной карточки (движок: showPlanConfirm). Цены/тексты — зеркала того, что пишет
      // движок (loadRubPrices → #planBasicPriceEl…, _initPlansPage → #plansBuy*Price), синхронизация — MutationObserver.
      (function plCdInit() {
        var page = document.getElementById('plansPage');
        if (!page) return;
        var $ = function (id) { return document.getElementById(id); };
        function tl(k, fb) { var v = typeof t === 'function' ? t(k) : null; return (v && v !== k) ? v : fb; }
        function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
        var CARDS = [['planCardBasic', 'planBasicPriceEl', 'plan_basic'], ['planCardPlus', 'planPlusPriceEl', 'plan_plus'], ['planCardMaster', 'masterPriceEl', 'plan_master']];
        var sel = 'planCardPlus', syncing = false, queued = false;
        function songsWord(n) {
          var lang = window._currentLang || 'ru';
          if (lang === 'ru') { var m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? tl('plSongsWord1', 'песню') : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? tl('plSongsWord2', 'песни') : tl('plSongsWord5', 'песен'); }
          return n === 1 ? tl('plSongsWord1', 'song') : tl('plSongsWord5', 'songs');
        }
        function money(txt) { return String(txt || '').split(' · ')[0].trim(); }
        function sync() {
          if (syncing) return;
          syncing = true;
          try {
            var per = tl('perMonth', ' · 30 дней').replace(/^\s*·\s*/, '').trim();
            CARDS.forEach(function (c) {
              var card = $(c[0]); if (!card) return;
              var m = money(($(c[1]) || {}).textContent);
              setText(card.querySelector('.plan-price b'), m);
              setText(card.querySelector('.plan-price .per'), m ? '· ' + per : '');
              var num = parseFloat(m.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.'));
              var tracks = parseInt((typeof PLAN_TRACKS !== 'undefined' && PLAN_TRACKS[c[2]]) || '0', 10);
              var cur = (m.match(/[₽$€]/) || ['₽'])[0];
              // «162 ₽ за песню» — рубли целым числом. В валюте стора целое округление врало
              // (TestFlight 30, Алла: «Глубина» 24,99/15 = 1,67 показывалась как «$2», как и «Душа») —
              // считаем с копейками в формате устройства (Intl, код валюты из стора), иначе «$1.67».
              var perStr = '';
              if (num && tracks) {
                var perRaw = num / tracks;
                if (cur === '₽') perStr = Math.round(perRaw) + ' ₽';
                else {
                  var NATIVE_SKU = { plan_basic: 'soul_basic_sub', plan_plus: 'soul_plus_sub', plan_master: 'master_monthly' };
                  var ni = (window._nativePriceNumBySku || {})[NATIVE_SKU[c[2]]];
                  try {
                    if (ni && ni.cur) perStr = new Intl.NumberFormat(window._currentLang || 'en', { style: 'currency', currency: ni.cur, maximumFractionDigits: 2 }).format(ni.price / tracks);
                  } catch (_) { perStr = ''; }
                  if (!perStr) perStr = cur + perRaw.toFixed(2).replace(/\.00$/, '');
                }
              }
              setText(card.querySelector('.plan-price .per-song'), perStr ? tl('plPerSong', '{p} ₽ за песню').replace('{p} ₽', perStr).replace('{p}', perStr) : '');
              card.classList.toggle('sel', c[0] === sel);
            });
            var card = $(sel), lbl = card && card.querySelector('.cta-label'), pm = '';
            CARDS.forEach(function (c) { if (c[0] === sel) pm = money(($(c[1]) || {}).textContent); });
            // Владеемый пакет: подвал повторяет призрачную кнопку («Действует до …») и не нажимается (эталон, аудит 23.09)
            var isCur = !!(card && card.classList.contains('current'));
            setText(page.querySelector('#plansFootCta .lbl'), lbl ? (isCur ? lbl.textContent.trim() : lbl.textContent.trim() + (pm ? ' · ' + pm : '')) : '');
            var footBtn = $('plansFootCta'); if (footBtn && footBtn.disabled !== isCur) footBtn.disabled = isCur;
            // Подписчик выбирает другой пакет: зачёта остатка в системе нет (createOrRefreshSubscription — новая
            // подписка на 30 дней с сегодняшнего дня), поэтому честная подпись под кнопкой вместо «остаток зачтётся» из эталона
            var hasCur = !!page.querySelector('.plan.current');
            setText(page.querySelector('.foot .note span'), (hasCur && !isCur) ? tl('plUpgradeNote', 'Новый пакет начнётся сразу и действует 30 дней · разовая оплата') : tl('plFootNote', 'Разовая оплата на 30 дней, без автосписаний'));
            var bal = typeof getIskryBalance === 'function' ? (getIskryBalance() || 0) : 0, n = Math.floor(bal / 100);
            setText($('plBalanceSongs'), n > 0 ? tl('plBalanceSongs', 'хватит на {n} {songs}').replace('{n}', n).replace('{songs}', songsWord(n)) : tl('plBalanceNone', 'пока не хватает на песню'));
            // разовые: движок пишет «100 Искр · 490 ₽» — Искры крупно, деньги мелко «или 490 ₽» (на VK/OK/нативе движок денег не пишет)
            ['plansBuy1Price', 'plansBuy2Price', 'plansBuy3Price'].forEach(function (id) {
              var el = $(id); if (!el || el.querySelector('small')) return;
              var parts = el.textContent.split(' · ');
              if (parts.length < 2) return;
              el.textContent = parts[0].trim();
              var sm = document.createElement('small'); sm.textContent = tl('plOrMoney', 'или {p}').replace('{p}', parts.slice(1).join(' · ').trim());
              el.appendChild(sm);
            });
            var f = page.querySelector('.foot');
            if (f && f.offsetHeight) page.style.setProperty('--foot', (f.offsetHeight + 8) + 'px');
          } finally { syncing = false; }
        }
        function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; sync(); }); }
        new MutationObserver(function () { if (!syncing) schedule(); })
          .observe(page, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
        page.addEventListener('click', function (e) {
          var card = e.target.closest('.plan');
          if (!card || !page.contains(card) || e.target.closest('.plan-cta')) return;
          sel = card.id; sync();
        });
        var foot = $('plansFootCta');
        if (foot) foot.addEventListener('click', function () { var b = $(sel) && $(sel).querySelector('.plan-cta'); if (b) b.click(); });
        window.addEventListener('resize', schedule);
        if (typeof window._initPlansPage === 'function') {
          var orig = window._initPlansPage;
          window._initPlansPage = function () { var r = orig.apply(this, arguments); schedule(); return r; };
        }
        window._plCdSync = sync;
        sync();
      })();

      // ═══ CD 19.09 · Оплата прошла (docs/DESIGN-HANDOFF-1909.md, экран 5) ═══
      // Чек заказа (что оплачено, чем, сколько), срок «10–15 минут» (D8), помощь при задержке, primary «Открыть Плейлист» (D5),
      // салют Искрами вместо бумажек, подвал-дымка с резервом --foot и однократным peek. Движок (reveal/этапы/режимы) не переписан.
      (function suCdInit() {
        var page = document.getElementById('successPage');
        if (!page) return;
        var $ = function (id) { return document.getElementById(id); };
        function tl(k, fb) { var v = typeof t === 'function' ? t(k) : null; return (v && v !== k) ? v : fb; }
        function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
        var SPK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c0 5.36-4.44 9.8-9.8 9.8 5.36 0 9.8 4.44 9.8 9.8 0-5.36 4.44-9.8 9.8-9.8-5.36 0-9.8-4.44-9.8-9.8Z"/></svg>';
        // Салют — как в эталоне: вспышка из печати, три ореола, 12 лучей, 26 Искр веером и 26 Искр, всплывающих снизу
        window._successSalute = function () {
          var l = $('cfLayer'); if (!l) return;
          l.innerHTML = '';
          if (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return;
          var cols = ['#f7c873', '#fff0cf', '#f0b45c'];
          var seal = page.querySelector('.burst') || page.querySelector('.wrap');
          var y0 = seal ? (seal.getBoundingClientRect().top - page.getBoundingClientRect().top + seal.offsetHeight / 2) : 150;
          var fl = document.createElement('i'); fl.className = 'flash'; fl.style.setProperty('--y', y0 + 'px'); l.appendChild(fl);
          [0, .12, .26].forEach(function (dd) { var hl = document.createElement('i'); hl.className = 'halo'; hl.style.cssText = '--y:' + y0 + 'px;--d:' + dd + 's'; l.appendChild(hl); });
          for (var a2 = 0; a2 < 12; a2++) {
            var rr = document.createElement('i'); rr.className = 'ray';
            rr.style.cssText = '--y:' + y0 + 'px;--a:' + (a2 * 30 + (Math.random() * 8 - 4)) + 'deg;--len:' + (110 + Math.random() * 90).toFixed(0) + 'px;--d:' + (Math.random() * .1).toFixed(2) + 's';
            l.appendChild(rr);
          }
          for (var k = 0; k < 26; k++) {
            var ang = (Math.PI * 2 * k) / 26 + (Math.random() - .5) * .22, R = 130 + Math.random() * 150;
            var e = document.createElement('i'); e.className = 'bs'; e.innerHTML = SPK;
            e.style.cssText = '--y:' + y0 + 'px;--c:' + cols[k % 3] + ';--sz:' + (10 + Math.random() * 14).toFixed(1) + 'px;--dx:' + (Math.cos(ang) * R).toFixed(0) + 'px;--dy:' + (Math.sin(ang) * R * .86).toFixed(0) + 'px;--s2:' + (.5 + Math.random() * .7).toFixed(2) + ';--rot:' + (Math.random() * 240 - 120).toFixed(0) + 'deg;--dur:' + (1.2 + Math.random() * .8).toFixed(2) + 's;--del:' + (Math.random() * .12).toFixed(2) + 's';
            l.appendChild(e); (function (el) { requestAnimationFrame(function () { el.classList.add('go'); }); })(e);
          }
          for (var i = 0; i < 26; i++) {
            var c = document.createElement('i'); c.className = 'cf'; c.innerHTML = SPK;
            c.style.cssText = 'left:' + (6 + Math.random() * 88) + '%;--c:' + cols[i % 3] + ';--sz:' + (7 + Math.random() * 10).toFixed(1) + 'px;--op:' + (.5 + Math.random() * .45).toFixed(2) + ';--dur:' + (4.5 + Math.random() * 3).toFixed(2) + 's;--del:' + (Math.random() * 1.8).toFixed(2) + 's;--dx:' + (Math.random() * 60 - 30).toFixed(0) + 'px;--rot:' + (Math.random() * 360 - 180).toFixed(0) + 'deg';
            l.appendChild(c); (function (el) { requestAnimationFrame(function () { el.classList.add('go'); }); })(c);
          }
          setTimeout(function () { if (l.firstChild && l.querySelector('.flash') === fl) l.innerHTML = ''; }, 9000);
        };
        // Чек: название заказа — из шапки оверлея оплаты, способ — из последнего нажатия / pending_payment_type, сумма — из цены оверлея
        function fillOrder() {
          var box = $('successOrder'); if (!box) return;
          var pay = $('successPayActions');
          // .order держит display:flex !important (правило эталона) — обычный инлайн его НЕ перебьёт,
          // поэтому прячем через setProperty(...,'important'), иначе без данных остаётся пустая рамка
          if (pay && getComputedStyle(pay).display !== 'none') { box.style.setProperty('display', 'none', 'important'); return; } // режим лимита — чека нет
          var title = ($('payOvCardTitle') || {}).textContent || '';
          var method = window._poLastMethod || '';
          if (!method) { try { var pp = JSON.parse(localStorage.getItem('pending_payment_type') || '{}'); method = pp.type === 'tbank' || pp.type === 'card' ? 'card' : pp.type === 'stars' ? 'stars' : ''; } catch (_) {} }
          var sum = '';
          if (method === 'card' || method === 'stars') sum = ($('payOvPriceDisplay') || {}).textContent || '';
          else if (method === 'iskry') sum = (($('payOvFreeClaimBtn') || {}).textContent || '').split(' — ').slice(1).join(' — ');
          var subKey = { card: 'successOrderSubCard', stars: 'successOrderSubStars', iskry: 'successOrderSubIskry', promo: 'successOrderSubPromo' }[method];
          if (!title || !subKey) { box.style.setProperty('display', 'none', 'important'); return; }
          setText($('successOrderTitle'), title);
          setText($('successOrderSub'), tl(subKey, ''));
          setText($('successOrderSum'), sum);
          box.style.removeProperty('display');
        }
        var pay = $('successPayActions');
        var wrap = page.querySelector('.wrap'), act = page.querySelector('.actions');
        function hint() {
          if (!act || !wrap) return;
          var f = act.offsetHeight; if (f) page.style.setProperty('--foot', f + 'px');
          var can = wrap.scrollHeight - wrap.clientHeight > 24 && wrap.scrollTop < 8;
          page.classList.toggle('can-scroll', can);
          if (can && !page._peeked) peek();
        }
        function peek() {
          if (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return;
          page._peeked = true;
          var t0 = null, stop = false, D = 1100;
          function cancel() { stop = true; }
          wrap.addEventListener('touchstart', cancel, { once: true, passive: true });
          wrap.addEventListener('wheel', cancel, { once: true, passive: true });
          setTimeout(function () {
            requestAnimationFrame(function step(ts) {
              if (stop) return;
              if (!t0) t0 = ts;
              var p = Math.min(1, (ts - t0) / D), e = Math.sin(p * Math.PI);
              wrap.scrollTop = 44 * e * e;
              if (p < 1) requestAnimationFrame(step); else { wrap.scrollTop = 0; page.classList.remove('can-scroll'); }
            });
          }, 1500);
        }
        if (wrap) wrap.addEventListener('scroll', function () { if (wrap.scrollTop > 60) page.classList.remove('can-scroll'); }, { passive: true });
        window.addEventListener('resize', hint);
        new MutationObserver(function () {
          if (document.body.dataset.page !== 'successPage') return;
          page._peeked = false;
          fillOrder();
          if (typeof showWhileGeneratingUpsell === 'function' && !(pay && getComputedStyle(pay).display !== 'none')) showWhileGeneratingUpsell();
          requestAnimationFrame(function () { requestAnimationFrame(hint); });
          setTimeout(hint, 1800); // после reveal (.rv) высоты меняются
        }).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
        window._suCdFill = fillOrder;
      })();


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

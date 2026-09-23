
      // ========== Экран «Открыть песню целиком» (#songUnlockPage) — контроллер ==========
      // Перенос showcase-song-unlock-2.html: промокод / paying / watchdog как в эталоне.
      // Появление после минуты-превью + реальная оплата 75⭐ (Stars) — Фаза 2/3 (пока экран не триггерится).
      (function(){
        // Равноценные цены открытия по платформам (паритет курса каталога: 75⭐ ≈ 80₽ ≈ 16 Искр по 4.9₽).
        // TG — Stars, web — карта T-Bank в ₽; VK и OK — Искры (канон v9: голоса на VK и
        // ОКи на Одноклассниках удалены — Искры везде пополняются картой).
        var SU_PRICES = {
          tg:  { first: '75', regular: '149', unit: '★' }, // ★ U+2605 (не emoji ⭐ — закон №3)
          vk:  { first: '11', regular: '23',  unit: '' },
          web: { first: '80', regular: '159', unit: '₽' },
          ok:  { first: '16', regular: '32',  unit: '' }
        };
        var suRoot = document.getElementById('suRoot');
        if (!suRoot) return;
        var payTimer = null, watchdog = null, suPollTimer = null;
        function suT(k){ return (typeof t === 'function' ? t(k) : '') || ''; }
        function suCtaTxt(){ return document.querySelector('#songUnlockPage .cta-txt'); }
        function suPlatform(){
          if (window._appEnv === 'ok' || window._isOkMiniApp) return 'ok';
          if (window._appEnv === 'vk' || window._isVkMiniApp) return 'vk';
          var tgApp = window.Telegram && window.Telegram.WebApp;
          if (window._appEnv === 'telegram' || (tgApp && typeof tgApp.openInvoice === 'function' && tgApp.initData)) return 'tg';
          return 'web';
        }

        // Открыть экран (плеер вызывает после минуты-превью) с реальными данными
        // «Перепеть своими словами» (Алла 01.08.2026): люди просят менять слова в готовой
        // песне. Написать три минуты с нуля осилят единицы, поправить строки — многие,
        // поэтому вход именно отсюда. Дальше это обычная новая заявка: те же 100 Искр.
        window._resingWithOwnLyrics = async function(track){
          if (!track) return;
          var lyrics = (track.lyrics && String(track.lyrics).trim()) ? String(track.lyrics) : '';
          // В списке треков лирики нет — приходит только флаг has_lyrics, текст догружаем
          if (!lyrics && track.id) {
            try {
              var base = window.BACKEND_URL || window.HEROES_API_BASE || '';
              var hh = (typeof window.getAuthHeaders === 'function') ? window.getAuthHeaders() : {};
              var r = await fetchWithTimeout(base + '/api/my-tracks/' + encodeURIComponent(track.id) + '/details', { headers: hh }, 20000);
              var j = await r.json().catch(function(){ return {}; });
              if (j && j.lyrics) lyrics = String(j.lyrics);
            } catch (e) { console.warn('[перепеть] не удалось догрузить текст', e); }
          }
          // Показываем тот же текст, что и в «Тексте песни» — без служебных тегов Suno
          if (lyrics && typeof window._mtCleanMarkdown === 'function') lyrics = window._mtCleanMarkdown(lyrics);
          if (typeof goToPage === 'function') goToPage('formPage');
          setTimeout(function(){
            if (typeof window.setLyricsMode === 'function') window.setLyricsMode('own');
            var ta = document.getElementById('customLyrics');
            if (ta) {
              ta.value = lyrics || '';
              if (typeof window._saveFormDraft === 'function') window._saveFormDraft();
              try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
            }
          }, 140);
        };

        window.openSongUnlock = function(opts){
          opts = opts || {};
          // Пейволл не должен обещать «весь текст целиком» там, где текста нет —
          // это оплаченное обещание, а не косметика. Прячем буллет для инструментала.
          try {
            var _suTr = opts.track || window._songUnlockTrack || null;
            var _suInstr = !!(_suTr && (_suTr.is_instrumental || _suTr.lyrics_source === 'none'));
            var _r3 = document.querySelector('#songUnlockPage [data-i18n="unlockR3t"]');
            var _r3row = _r3 && _r3.closest ? _r3.closest('.ys-row') : null;
            if (_r3row) _r3row.style.display = _suInstr ? 'none' : '';
          } catch (_) {}
          var priceKind = opts.priceKind || 'first';
          var plat = suPlatform();
          // КАНОН v7 (27.07, §5.2.3): на VK песня открывается только картой — цена в ₽
          // (как web). Искры на VK — валюта Оракула, на цифровое не тратятся. Stub
          // (натив/планшет/неизвестно): CTA/методы скрыты CSS (is-vk-stub), видна #suStubNote.
          var _suVkStub = plat === 'vk' && !(window._vkPayMode && window._vkPayMode() === 'money');
          var prices = (plat === 'vk') ? SU_PRICES.web : (SU_PRICES[plat] || SU_PRICES.web);
          suRoot.dataset.price = priceKind;
          var pv = document.getElementById('suPriceVal');
          if (pv) pv.textContent = _suVkStub ? '' : ((opts.price != null) ? String(opts.price) : (prices[priceKind] || prices.first));
          var pu = document.getElementById('suPriceUnit');
          if (pu) {
            if (_suVkStub) pu.textContent = '';
            else if (plat === 'ok') pu.textContent = ' ' + (suT('unlockIskryUnit') || 'Искр');
            else pu.textContent = ' ' + prices.unit;
          }
          // Цены методов для TG-выбора (звёзды ★ / карта ₽) — показываются, когда тапнули «Открыть целиком».
          var mSP = document.getElementById('suMStarsPrice');
          if (mSP) mSP.textContent = ' · ' + (SU_PRICES.tg[priceKind] || SU_PRICES.tg.first) + ' ★';
          var mCP = document.getElementById('suMCardPrice');
          if (mCP) mCP.textContent = ' · ' + (SU_PRICES.web[priceKind] || SU_PRICES.web.first) + ' ₽';
          // «Искрами» — показываем ПЕРВЫМ методом, если у юзера хватает Искр на разлочку (баг Аллы 05.07:
          // наличие Искр не засчитывалось; подарочный промокод = Искры, а тратить негде → вкус висел).
          var _iskryPrice = Number(SU_PRICES.ok[priceKind] || SU_PRICES.ok.first) || 16;
          var _iskryBal = (typeof getIskryBalance === 'function') ? (Number(getIskryBalance()) || 0) : 0;
          // Пробник стоит денег (ЗАКОН Алла 29.07): Искрами вкус открывает только покупатель
          // пакета (серверный гейт errUnlockIskryNeedPack). На TG/web без пакета кнопку не
          // показываем — там есть звёзды/карта. OK — единственный путь Искрами, кнопка всегда
          // (без пакета сервер вернёт подсказку → plansPage за пакетом). Паттерн флага как в _applyModeLocks.
          var _suHasPack = false;
          try { _suHasPack = localStorage.getItem('ys_pkg_unlocked') === '1'; } catch(_) {}
          if (!_suHasPack && window._cachedProfile && window._cachedProfile.has_purchased_package) _suHasPack = true;
          if (!_suHasPack && typeof userTariff !== 'undefined' && userTariff && userTariff !== 'basic') _suHasPack = true;
          var _hasIskry = _iskryBal >= _iskryPrice && (plat === 'ok' || _suHasPack);
          var mIB = document.getElementById('suMethodIskry');
          if (mIB) {
            // Канон v7: на VK метода «Искрами» нет (§5.2.3) — только карта.
            if (_hasIskry && plat !== 'vk') { var mIP = document.getElementById('suMIskryPrice'); if (mIP) mIP.textContent = ' · ' + _iskryPrice + ' ' + (suT('unlockIskryUnit') || 'Искр'); mIB.style.display = ''; }
            else { mIB.style.display = 'none'; }
          }
          suRoot.dataset.hasIskry = _hasIskry ? '1' : '0'; // CTA покажет методы даже не на TG, если есть Искры
          // Канон v3: весь VK → 'vk' (голоса); деление на десктоп-карту убрано.
          suRoot.dataset.platform = (plat === 'vk') ? 'vk' : 'web';
          suRoot.dataset.plat = plat; // реальная платформа (tg/vk/web/ok)
          suRoot.dataset.state = 'offer';
          if (opts.requestId != null) suRoot.dataset.requestId = String(opts.requestId);
          if (typeof goToPage === 'function') goToPage('songUnlockPage');
        };

        function suReset(){ clearTimeout(watchdog); clearTimeout(payTimer); clearTimeout(suPollTimer); suRoot.dataset.state = 'offer'; var c = suCtaTxt(); if (c) c.textContent = suT('unlockCtaOpen'); }
        window._songUnlockReset = suReset;

        // Успех оплаты → экран B «Песня открыта» (трек уже в window._songUnlockTrack из плеера).
        function suPaid(requestId){
          clearTimeout(watchdog); clearTimeout(suPollTimer);
          if (window.openSongOpened) window.openSongOpened({ requestId: requestId });
        }
        // Поллинг разлочки: VK-голоса и T-Bank грантят СЕРВЕРНЫМ коллбэком (не клиентом) —
        // ждём пока /api/my-tracks покажет locked=false, потом экран B. Тихо (закон №37).
        function suPollUnlock(requestId, attempt){
          attempt = attempt || 0;
          if (attempt > 40) { suReset(); return; } // ~2 мин — сдаёмся тихо, кнопка вернулась
          clearTimeout(suPollTimer);
          suPollTimer = setTimeout(function(){
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
            fetch(apiBase + '/api/my-tracks?limit=50&offset=0', { headers: authH })
              .then(function(r){ return r.json().catch(function(){ return {}; }); })
              .then(function(j){
                var list = (j && (j.tracks || j.data || j.items)) || (Array.isArray(j) ? j : []);
                var row = null;
                for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(requestId)) { row = list[i]; break; }
                if (row && row.locked === false) { if (row.audio_url) window._songUnlockTrack = row; suPaid(requestId); }
                else suPollUnlock(requestId, attempt + 1);
              })
              .catch(function(){ suPollUnlock(requestId, attempt + 1); });
          }, 3000);
        }

        // Реальная оплата открытия — равноценно по платформам:
        // TG → Stars-инвойс 75⭐; VK → Искры 16 (канон v5, голосов нет); web → карта T-Bank 80₽.
        // Отмена/фейл = назад на A без error-текста (закон №37).
        window.startSongUnlockPayment = async function(requestId, priceKind, method){
          try {
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            if (!apiBase || (typeof hasAuth === 'function' && !hasAuth())) { if (typeof showToast === 'function' && typeof t === 'function') showToast(t('toastOpenInTg')); suReset(); return; }
            var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
            var promoEl = document.getElementById('suPromoInput');
            var promo = (promoEl && promoEl.value ? promoEl.value.trim() : '') || null;
            var plat = suPlatform();
            // КАНОН v5 §5.4.1 (22.07): на stub-платформах VK (натив/планшет/неизвестно) оплаты нет — no-op (CTA скрыт CSS).
            if (plat === 'vk' && !(window._vkPayMode && window._vkPayMode() === 'money')) { suReset(); return; }
            // КАНОН v7 (27.07, §5.2.3): на VK песня — цифровая ценность, открывается
            // ТОЛЬКО картой T-Bank на vk.ru/m.vk.ru. Искры (за голоса) на цифровое
            // не обмениваются — сервер Искры-путь на VK отвергает 403.
            if (plat === 'vk') method = 'card';
            // «Оплатить картой» (TG/web) — форсим путь T-Bank (карта работает и в TG-webview); минуя Stars/голоса.
            if (method === 'card') plat = 'web';
            // «Искрами» — универсальная валюта: списываем Искры через /api/song-unlock/iskry (тот же путь, что OK), на любой платформе.
            if (method === 'iskry') plat = 'ok';

            // Отключённый способ оплаты удалён из продукта (решение Аллы 27.08.2026).
            // ── OK: за Искры (§5.4 — песню напрямую продавать нельзя; карта→пакет Искр→Искрами открыть) ──
            if (plat === 'ok') {
              var okResp = await fetch(apiBase + '/api/song-unlock/iskry', {
                method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
                body: JSON.stringify({ request_id: requestId || null })
              });
              var okData = await okResp.json().catch(function(){ return {}; });
              if (okData && okData.success) { suPaid(requestId); return; }
              if (okResp.status === 403 && okData && okData.error_code === 'errUnlockIskryNeedPack') {
                // Пробник стоит денег: тур-Искры первую песню не открывают. Подсказка (не error).
                // VK → topupPage (пакет за карту, vk.ru), OK → plansPage (пакет за карту);
                // TG/web — остаёмся на экране открытия: звёзды/карта уже перед глазами.
                suReset();
                if (typeof showToast === 'function' && typeof t === 'function') showToast(t('unlockIskryNeedPack'));
                var _suNpPlat = suPlatform();
                if (_suNpPlat === 'vk' || _suNpPlat === 'ok') {
                  if (typeof goToPage === 'function') setTimeout(function(){
                    goToPage(_suNpPlat === 'vk' ? 'topupPage' : 'plansPage');
                    if (_suNpPlat === 'vk' && window._initTopupPage) window._initTopupPage();
                  }, 900);
                }
                return;
              }
              if (okResp.status === 402) {
                // Не хватает Искр — подсказка (не error) + ведём к пополнению:
                // VK → topupPage (пакеты Искр картой на vk.ru — канон v8/v9);
                // OK → plansPage (пакеты картой, как web — канон v9).
                suReset();
                if (typeof showToast === 'function' && typeof t === 'function') {
                  var msg = (t('iskryNotEnough') || 'У тебя {current} Искр. Нужно ещё {needed}')
                    .replace('{current}', okData.current != null ? okData.current : 0)
                    .replace('{needed}', Math.max(0, (okData.needed || 16) - (okData.current || 0)));
                  showToast(msg);
                }
                var _suRealVk = (suPlatform() === 'vk');
                if (typeof goToPage === 'function') setTimeout(function(){
                  goToPage(_suRealVk ? 'topupPage' : 'plansPage');
                  if (_suRealVk && window._initTopupPage) window._initTopupPage();
                }, 900);
                return;
              }
              suReset();
              if (typeof window._ensureOnline === 'function') window._ensureOnline();
              return;
            }

            // (КАНОН v4: VK-ветка ShowOrderBox для song_unlock удалена — на VK разлочка
            //  идёт Искрами через ветку plat==='ok' выше; сервер song-SKU за голоса
            //  больше не продаёт вовсе.)

            // ── TG: Stars-инвойс ──
            if (plat === 'tg') {
              var initData = (typeof getInitData === 'function') ? getInitData() : '';
              var resp = await fetch(apiBase + '/api/payments/stars/invoice', {
                method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
                body: JSON.stringify({ sku: 'song_unlock', initData: initData, request_id: requestId || null, promo_code: promo })
              });
              var data = await resp.json().catch(function(){ return {}; });
              if (data && (data.already_unlocked || (data.success && data.free_applied))) { suPaid(requestId); return; }
              if (!data || !data.success || !data.invoice_link) { if (typeof showToast === 'function' && typeof t === 'function') showToast(t('toastInvoiceFail')); suReset(); return; }
              var tgApp = window.Telegram && window.Telegram.WebApp;
              if (tgApp && typeof tgApp.openInvoice === 'function') {
                tgApp.openInvoice(data.invoice_link, function(status){
                  if (status === 'paid') { suPaid(requestId); }
                  else { suReset(); }
                });
              } else { suReset(); }
              return;
            }

            // ── карта T-Bank (₽). Оплата во вкладке банка → серверный коллбэк грантит → поллинг. ──
            var tbResp = await fetch(apiBase + '/api/payments/tbank/init', {
              method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
              body: JSON.stringify({ sku: 'song_unlock', request_id: requestId || null, promo_code: promo })
            });
            var tb = await tbResp.json().catch(function(){ return {}; });
            if (tb && (tb.already_unlocked || (tb.success && tb.free_applied))) { suPaid(requestId); return; }
            if (!tb || !tb.success || !tb.payment_url) { suReset(); if (typeof window._ensureOnline === 'function') window._ensureOnline(); return; }
            // TG-webview БЛОКИРУЕТ window.open → карта висла на «Открываем оплату» вечно. Открываем банк через
            // Telegram.WebApp.openLink (как рабочая оплата покупки, 09-pay:1558/272); web — обычный window.open.
            var _suTg = window.Telegram && window.Telegram.WebApp;
            // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
            if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
              vkBridge.send('VKWebAppOpenLink', { url: tb.payment_url })
                .catch(function(){ try { window.open(tb.payment_url, '_blank'); } catch (_) { window.location.href = tb.payment_url; } });
            }
            else if (_suTg && typeof _suTg.openLink === 'function') { try { _suTg.openLink(tb.payment_url); } catch (_) { window.location.href = tb.payment_url; } }
            else { try { window.open(tb.payment_url, '_blank'); } catch (_) { window.location.href = tb.payment_url; } }
            // Банк открылся во внешней вкладке — НЕ залипаем на «Открываем оплату»: возвращаем кнопку в оффер,
            // разлочку ловим поллингом в фоне (серверный коллбэк T-Bank); вернётся с оплаты → suPaid.
            suRoot.dataset.state = 'offer';
            var _suC = suCtaTxt(); if (_suC) _suC.textContent = suT('unlockCtaOpen');
            suPollUnlock(requestId, 0);
          } catch (e) { console.warn('[songUnlock] pay error', e); suReset(); }
        };

        // Промокод: тоггл поля. При открытии state='promo-open' → CSS прячет нижний бар (.actions):
        // клавиатуре есть место, кнопки НЕ прыгают (баг Аллы «экран разделился»). Скроллим поле в вид.
        var promoToggle = document.getElementById('suPromoToggle');
        if (promoToggle) promoToggle.addEventListener('click', function(){
          if (suRoot.dataset.state === 'promo-open') { suRoot.dataset.state = 'offer'; var _pb = document.getElementById('suPromoInput'); if (_pb) _pb.blur(); return; }
          suRoot.dataset.state = 'promo-open';
          setTimeout(function(){ var i = document.getElementById('suPromoInput'); if (i) { i.focus(); try { i.scrollIntoView({ block: 'center' }); } catch(_){} } }, 80);
        });
        // «Отмена» — выход из промо (возвращает нижний бар с «Открыть целиком»/«Вернуться»). БЕЗ неё юзер
        // застревал: при открытом промо .actions спрятан, а неверный/уже-активированный код держал promo-open.
        var promoCancel = document.getElementById('suPromoCancel');
        if (promoCancel) promoCancel.addEventListener('click', function(){
          suRoot.dataset.state = 'offer';
          var i = document.getElementById('suPromoInput'); if (i) i.blur();
          showSuPromoHint('', '');
        });

        // Запуск оплаты (method: undefined=дефолт платформы [TG звёзды / web карта / VK голоса / OK Искры], 'card'=T-Bank).
        function startSuPay(method){
          if (suRoot.dataset.state === 'paying') return;
          suRoot.dataset.state = 'paying';
          var c = suCtaTxt(); if (c) c.textContent = suT('unlockCtaPaying');
          clearTimeout(watchdog);
          if (suRoot.dataset.platform === 'vk') watchdog = setTimeout(suReset, 30000); // §5.4.1 watchdog (ShowOrderBox завис)
          if (typeof window.startSongUnlockPayment === 'function') window.startSongUnlockPayment(suRoot.dataset.requestId, suRoot.dataset.price, method);
        }
        // CTA «Открыть целиком»: TG → показать выбор способа (звёзды/карта). Остальные платформы (VK-мобайл голоса /
        // VK-десктоп + web карта / OK Искры) — один метод → платим сразу (Алла 05.07: одна кнопка → потом методы).
        var cta = document.getElementById('suCtaBtn');
        if (cta) cta.addEventListener('click', function(){
          if (suRoot.dataset.state === 'paying') return;
          if (suPlatform() === 'tg') { suRoot.dataset.state = 'methods'; return; }    // TG → выбор способа (звёзды/карта/промо/Искры)
          // Канон v7: на VK Искры-путь закрыт (§5.2.3) — только платформенный дефолт (карта).
          if (suRoot.dataset.hasIskry === '1' && suRoot.dataset.platform !== 'vk') { startSuPay('iskry'); return; } // не-TG, но есть Искры → открыть Искрами
          startSuPay();                                                                // платформенный дефолт (VK/web карта / OK Искры)
        });
        var mIskry = document.getElementById('suMethodIskry');
        if (mIskry) mIskry.addEventListener('click', function(){ startSuPay('iskry'); }); // Искрами (списываем с баланса)
        var mStars = document.getElementById('suMethodStars');
        if (mStars) mStars.addEventListener('click', function(){ startSuPay(); });      // звёзды (дефолт TG)
        var mCard = document.getElementById('suMethodCard');
        if (mCard) mCard.addEventListener('click', function(){ startSuPay('card'); });   // карта T-Bank
        var mPromo = document.getElementById('suMethodPromo');
        if (mPromo) mPromo.addEventListener('click', function(){ // промокод → открыть поле ввода (state=promo-open прячет .actions под клавиатуру)
          suRoot.dataset.state = 'promo-open';
          setTimeout(function(){ var i = document.getElementById('suPromoInput'); if (i) { i.focus(); try { i.scrollIntoView({ block: 'center' }); } catch(_){} } }, 80);
        });
        var mBack = document.getElementById('suMethodBack');
        if (mBack) mBack.addEventListener('click', function(){ suRoot.dataset.state = 'offer'; }); // назад к офферу

        // Инлайн-подсказка под полем промокода (не тост — подсказка рядом с полем).
        function showSuPromoHint(text, kind){
          var el = document.getElementById('suPromoHint');
          if (!el) return;
          if (!text) { el.hidden = true; el.textContent = ''; el.className = 'promo-hint'; return; }
          el.textContent = text; el.className = 'promo-hint ' + (kind === 'err' ? 'err' : 'ok'); el.hidden = false;
          // Подсказка — последний элемент скроллящегося .wrap, легко уходит под CTA-бар → проскроллить к ней (2× rAF, закон №30).
          requestAnimationFrame(function(){ requestAnimationFrame(function(){
            var wrap = document.querySelector('#songUnlockPage .wrap');
            if (wrap) { try { wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' }); } catch(_) { wrap.scrollTop = wrap.scrollHeight; } }
          }); });
        }

        // Промокод «Применить» — РЕАЛЬНАЯ проверка через /api/promos/validate (preview, без списания).
        // Полное покрытие (подарочный free_generation / скидка 100%) → открываем песню сразу (free_applied).
        // Частичная скидка → код остаётся в поле, «Открыть целиком» его донесёт (бэк пересчитает цену).
        // Невалидный код → подсказка у поля (валидационная, не app-error — исключение закона №37).
        // Сетевой сбой → НЕ показываем «ошибка сети»: мягко «применится при открытии» (код уйдёт с оплатой).
        window.applySongUnlockPromo = async function(code){
          code = String(code || '').trim();
          if (!code) return;
          var applyBtn = document.getElementById('suPromoApply');
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || (typeof hasAuth === 'function' && !hasAuth())) { showSuPromoHint(suT('suPromoNoted'), 'ok'); return; }
          if (typeof window._ensureOnline === 'function' && !window._ensureOnline()) return; // оффлайн → единый overlay
          var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
          var prevTxt = applyBtn ? applyBtn.textContent : '';
          if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = suT('unlockPromoChecking') || '…'; }
          try {
            var r = await fetch(apiBase + '/api/promos/validate', {
              method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
              body: JSON.stringify({ sku: 'song_unlock', promo_code: code })
            });
            var j = await r.json().catch(function(){ return {}; });
            if (!j || j.valid !== true) {
              var rmap = { not_found: 'promoNotFound', inactive: 'promoNotFound', not_started: 'promoNotFound', expired: 'promoExpired', sku_mismatch: 'unlockPromoWrongProduct', global_limit_reached: 'promoUsedUp', user_limit_reached: 'promoAlreadyActivated' };
              showSuPromoHint(suT(rmap[j && j.reason] || 'promoNotFound') || (j && j.error) || '', 'err');
              return;
            }
            var full = (Number(j.amount_after) === 0) || (j.promo && j.promo.type === 'free_generation');
            if (full) {
              showSuPromoHint(suT('promoActivated') || '', 'ok');
              if (suRoot.dataset.state !== 'paying') { // полное покрытие → та же разлочка, что CTA (free_applied → suPaid)
                suRoot.dataset.state = 'paying';
                var c = suCtaTxt(); if (c) c.textContent = suT('unlockCtaPaying');
                if (typeof window.startSongUnlockPayment === 'function') window.startSongUnlockPayment(suRoot.dataset.requestId, suRoot.dataset.price);
              }
            } else {
              showSuPromoHint(suT('suPromoNoted') || '', 'ok'); // частичная — донесётся с «Открыть целиком»
              suRoot.dataset.state = 'offer'; // вернуть нижний бар — юзер жмёт «Открыть целиком» (код уйдёт с ним)
              var _pib = document.getElementById('suPromoInput'); if (_pib) _pib.blur();
            }
          } catch (e) {
            console.warn('[songUnlock] promo validate', e);
            showSuPromoHint(suT('suPromoNoted') || '', 'ok'); // сетевой сбой — без error-текста (закон №37)
          } finally {
            if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = prevTxt || (suT('unlockPromoApply') || 'Применить'); }
          }
        };
        var promoApply = document.getElementById('suPromoApply');
        if (promoApply) promoApply.addEventListener('click', function(){
          var code = ((document.getElementById('suPromoInput') || {}).value || '').trim();
          if (typeof window.applySongUnlockPromo === 'function') window.applySongUnlockPromo(code);
        });
        var promoInputEl = document.getElementById('suPromoInput');
        if (promoInputEl) promoInputEl.addEventListener('input', function(){ showSuPromoHint('', ''); }); // правка кода — стереть старую подсказку

        // «Вернуться» → назад; «Минуту ещё раз» → повтор превью (Фаза 2)
        var backBtn = document.getElementById('suBackBtn');
        if (backBtn) backBtn.addEventListener('click', function(){ if (typeof goBack === 'function') goBack(); });
        // «Минуту ещё раз» — возврат на плеер (превью там же); кнопка была мертва.
        window.replaySongPreview = function(){ if (typeof goBack === 'function') goBack(); };
        var replayBtn = document.getElementById('suReplayBtn');
        if (replayBtn) replayBtn.addEventListener('click', function(){ if (typeof window.replaySongPreview === 'function') window.replaySongPreview(); });

      })();

      // ========== Экран «Песня открыта» (#songOpenedPage) — контроллер ==========
      // Перенос showcase-song-opened.html: плеер(волна)/конфетти/опт-ин как в эталоне.
      // Реальное аудио/скачивание/слова/опт-ин API + появление после оплаты — Фаза 3 (пока демо-плеер).
      (function(){
        var soRoot = document.getElementById('soRoot');
        if (!soRoot) return;
        var soWave = document.getElementById('soWave');
        var N = 44, bars = [], built = false, TOTAL = 192, pos = 0, playing = false, tick = null, soAudio = null;
        function fmt(s){ s = Math.max(0, Math.floor(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
        function buildBars(){
          if (built || !soWave) return; built = true;
          for (var i=0;i<N;i++){ var s=document.createElement('span'); s.style.height=(30+Math.round(Math.abs(Math.sin(i*0.7))*70))+'%'; soWave.appendChild(s); bars.push(s); }
        }
        function render(){
          var lit = Math.round((pos/TOTAL)*N);
          for (var i=0;i<N;i++) if (bars[i]) bars[i].classList.toggle('on', i<lit);
          var c=document.getElementById('soTCur'); if(c) c.textContent=fmt(pos);
        }
        function setPlaying(p){
          playing = p; soRoot.classList.toggle('playing', p);
          var b=document.getElementById('soPlayBtn'); if(b) b.setAttribute('aria-label', p ? ((typeof t==='function' && t('pauseLabel')) || 'Пауза') : ((typeof t==='function' && t('playLabel')) || 'Слушать'));
          clearInterval(tick);
          if (soAudio) {           // реальное аудио (после оплаты прокси отдаёт полную)
            if (p) { soAudio.play().catch(function(){}); } else { try{ soAudio.pause(); }catch(_){} }
          } else if (p) {          // демо-волна (тест-вход без трека)
            tick = setInterval(function(){ pos+=0.5; if(pos>=TOTAL) pos=0; render(); }, 500);
          }
        }
        var soPlayBtn = document.getElementById('soPlayBtn');
        if (soPlayBtn) soPlayBtn.addEventListener('click', function(){ setPlaying(!playing); });
        if (soWave) soWave.addEventListener('click', function(e){
          var r=soWave.getBoundingClientRect(); var frac=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
          if (soAudio && soAudio.duration && isFinite(soAudio.duration)) { soAudio.currentTime = frac*soAudio.duration; pos = soAudio.currentTime; }
          else { pos = frac*TOTAL; }
          render();
        });

        function salute(){
          var layer=document.getElementById('soCfLayer'); if(!layer) return;
          var cols=['#f7cf7a','#f3d9a0','#e8b96a','#fff0c2','#f7b6d6'];
          for (var i=0;i<30;i++){
            var c=document.createElement('span'); c.className='cf'; c.style.left=(i*3.33)+'%'; c.style.background=cols[i%cols.length];
            c.style.setProperty('--dur',(2+((i%7)/5))+'s'); c.style.setProperty('--del',((i%5)*0.08)+'s'); c.style.setProperty('--rot',(((i*37)%720)-360)+'deg');
            if (i%2) c.style.borderRadius='50%';
            layer.appendChild(c);
            (function(el){ requestAnimationFrame(function(){ el.classList.add('go'); }); setTimeout(function(){ el.remove(); }, 3800); })(c);
          }
        }

        var optinRow = document.querySelector('#songOpenedPage .optin-row');
        if (optinRow) optinRow.addEventListener('click', function(e){
          var b=e.target.closest('button'); if(!b) return;
          var yes = b.classList.contains('optin-yes');
          var o=document.getElementById('soOptin'); if(o){ o.style.opacity='0'; setTimeout(function(){ o.style.display='none'; }, 260); }
          try{ localStorage.setItem('ys_oracle_optin', yes?'1':'0'); }catch(_){}
          if (yes && typeof window.enableOracleOptin === 'function') window.enableOracleOptin(); // Фаза 3
        });
        // Реальные действия — переиспуск прод-функций плеера myTracks.
        function _soTrack(){ return window._soCurrentTrack || window._songUnlockTrack || null; }
        function on(id, fn){ var el=document.getElementById(id); if(el) el.addEventListener('click', fn); }
        on('soDownloadBtn', function(){
          // КАНОН v4 (11.07, §5.2.3): на VK скачивания нет (кнопка скрыта CSS; гард — рубеж)
          if (window._isVkMiniApp === true || window._appEnv === 'vk') return;
          var tr=_soTrack(); if(!tr||!tr.id||typeof window._dlRequestAccess!=='function') return;
          try{ window._mtSkipPaymentReturnOnce = Date.now(); }catch(_){}
          window._dlRequestAccess(tr.id).then(function(acc){
            if (acc && acc.ok && acc.url) window._dlPerformDownload(tr, acc.url);
            else if (acc && acc.locked && window._dlShowUnlockOverlay) window._dlShowUnlockOverlay(tr, acc);
          });
        });
        // «Текст» и «Спеть караоке» → построчное караоке (в проде «Текст» = караоке).
        on('soLyricsBtn', function(){ var tr=_soTrack(); if(tr && window._mtOpenKaraoke) window._mtOpenKaraoke(tr); });
        on('soKaraBtn',   function(){ var tr=_soTrack(); if(tr && window._mtOpenKaraoke) window._mtOpenKaraoke(tr); });
        on('soShareBtn',  function(){ var tr=_soTrack(); if(!tr) return; if(window._mtOpenShareSheet) window._mtOpenShareSheet(tr); else if(window._mtShareTrack) window._mtShareTrack(tr); });
        // «Создать песню близкому» → флоу подарка (оплати → создай новую).
        // §6.12 (отказ 10.07): платный подарок = продажа промокода — на VK запрещён (кнопка скрыта CSS, гард — рубеж)
        on('soGiftBtn', function(){ if (window._isNativeApp) return; if (window._isVkMiniApp || window._appEnv === 'vk') return; if(window.goToPage) goToPage('giftPayPage'); setTimeout(function(){ if(window._initGiftPayPage) window._initGiftPayPage(); }, 100); });
        // «Ещё песни» → витрина пакетов Искр (мост к пакам в момент радости — решение Аллы 02.07).
        on('soPackBtn', function(){ if(window.goToPage) goToPage('plansPage'); setTimeout(function(){ if(window._initPlansPage) window._initPlansPage(); }, 100); });
        // Кнопки ПОЛУЧАТЕЛЯ шаренной песни (режим _openSharedSong, 07). Свои обработчики —
        // owner-кнопки скрыты, конфликта нет. «В любимые» сохраняет чужую песню, «Создать свою» → форма.
        on('soFavBtn',      function(){ if (typeof window._soSaveShared==='function') window._soSaveShared(); });
        on('soCreateBtn',   function(){ if (window.goToPage) goToPage('formPage'); });
        on('soCreateGhost', function(){ if (window.goToPage) goToPage('formPage'); });
        on('soRecipLyrics', function(){ var tr=_soTrack(); if(tr && window._mtOpenKaraoke) window._mtOpenKaraoke(tr); });

        // Опт-ин Оракула («Да, присылай») — POST /api/daily-oracle/onboarding (закон №37: провал — тихо).
        window.enableOracleOptin = function(){
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase) return;
          if (window._isVkMiniApp && window.vkBridge) { try{ vkBridge.send('VKWebAppAllowMessagesFromGroup', { group_id: 237303283 }).then(function(){ if (window._vkSaveNotifyConsent) window._vkSaveNotifyConsent(); }).catch(function(){}); }catch(_){} }
          var tz='Europe/Moscow'; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz; }catch(_){}
          var sendH = (typeof getAuthHeaders==='function') ? getAuthHeaders() : {};
          var _f = (typeof fetchWithTimeout==='function') ? fetchWithTimeout : function(u,o){ return fetch(u,o); };
          try {
            _f(apiBase + '/api/daily-oracle/onboarding', { method:'POST', headers: Object.assign({'Content-Type':'application/json'}, sendH), body: JSON.stringify({ topics:['relationships','growth','purpose'], delivery_time:'08:00', timezone:tz, channel:'both' }) }, 20000)
              .then(function(r){ return r.json().catch(function(){ return {}; }); })
              .then(function(j){ if (j && j.success && typeof showToast==='function') showToast(typeof t==='function' ? (t('oracleOptinDone')||'Готово — загляну утром.') : 'Готово — загляну утром.'); })
              .catch(function(e){ console.warn('[OracleOptin]', e && e.message); });
          } catch(e){ console.warn('[OracleOptin]', e && e.message); }
        };

        // Привязать реальное аудио к плееру экрана B. Нет трека → демо-волна (тест-вход).
        function _attachRealAudio(track){
          if (soAudio){ try{ soAudio.pause(); }catch(_){} try{ soAudio.src=''; }catch(_){} soAudio=null; }
          if (!track || !track.audio_url) return false;
          soAudio = new Audio(); soAudio.preload='auto'; soAudio.src = window._absMediaUrl(track.audio_url);
          // §2.2.5 VK: new Audio() вне DOM не гасится циклом querySelectorAll('audio')
          // в VKWebAppViewHide — регистрируем ссылку для глобальной паузы (template ~943).
          window._soAudioRef = soAudio;
          soAudio.addEventListener('loadedmetadata', function(){ if (soAudio && isFinite(soAudio.duration) && soAudio.duration>0){ TOTAL=soAudio.duration; var tt=document.getElementById('soTTot'); if(tt) tt.textContent=fmt(TOTAL); } });
          soAudio.addEventListener('timeupdate', function(){ if (soAudio){ pos=soAudio.currentTime; render(); } });
          soAudio.addEventListener('ended', function(){ pos=0; render(); setPlaying(false); });
          soAudio.addEventListener('error', function(){ console.warn('[songOpened] audio error'); });
          return true;
        }
        // Открыть экран (Фаза 3 вызывает после оплаты) с реальными данными трека.
        window.openSongOpened = function(opts){
          opts = opts || {};
          // Сброс режима получателя (DOM-правки _openSharedSong, 07) при обычном открытии владельцем —
          // иначе owner-кнопки/тексты остались бы скрыты/переформулированы после просмотра шаренной песни.
          try{ var _pg=document.getElementById('songOpenedPage'); if(_pg && !opts.shared){
            var _oa=_pg.querySelector('.actions'); if(_oa) _oa.style.display='';
            var _rc=document.getElementById('soRecipActions'); if(_rc){ _rc.hidden=true; _rc.style.display='none'; }
            ['soGiftBtn','soPackBtn','soOptin','soKaraBtn','soDownloadBtn'].forEach(function(x){ var e=document.getElementById(x); if(e) e.style.display=''; });
            var _eb=_pg.querySelector('.eyebrow'); if(_eb) _eb.textContent=(typeof t==='function'&&t('openedEyebrow'))||'Твоя песня открыта';
            var _ld=_pg.querySelector('.lead'); if(_ld){ _ld.style.display=''; _ld.textContent=(typeof t==='function'&&t('openedLead'))||'Полная версия уже играет. Она твоя — скачивай, читай слова и делись с близкими.'; }
            var _ps=document.getElementById('soPlaySub'); if(_ps) _ps.textContent=(typeof t==='function'&&t('openedPlaySub'))||'Полная песня · 3:12';
          } }catch(_){}
          var track = opts.track || window._songUnlockTrack || null;
          window._soCurrentTrack = track;
          // Песня без слов: караоке и «Слова песни» открыли бы пустой экран, а lead
          // обещал бы текст, которого нет. Гейт по треку, а не безусловный показ выше.
          try {
            var _hasLyr = !!(track && (track.has_lyrics || (track.lyrics && String(track.lyrics).trim())));
            var _instr = !!(track && (track.is_instrumental || track.lyrics_source === 'none'));
            if (_instr || !_hasLyr) {
              ['soKaraBtn', 'soLyricsBtn'].forEach(function(x) {
                var e = document.getElementById(x); if (e) e.style.display = 'none';
              });
            }
            if (_instr && !opts.shared) {
              var _pg2 = document.getElementById('songOpenedPage');
              var _ld2 = _pg2 && _pg2.querySelector('.lead');
              if (_ld2) _ld2.textContent = (typeof t === 'function' && t('openedLeadNoLyrics')) || 'Полная версия уже играет. Она твоя — скачивай и делись с близкими.';
            }
            // Свой текст в общий эфир не идёт (закон 01.08.2026) — кнопку не показываем
            if (track && (track.can_publish_radio === false || track.lyrics_source === 'own')) {
              var _rb = document.getElementById('soRadioBtn'); if (_rb) _rb.style.display = 'none';
            }
          } catch (_) {}
          buildBars(); pos = 0;
          var title = (track && (track.title || track.name)) || opts.title || '';
          var t2=document.getElementById('soPlayTitle'); if(t2 && title) t2.textContent=title;
          var hasReal = _attachRealAudio(track);
          if (!hasReal && opts.durationSec) TOTAL = opts.durationSec;
          var tt=document.getElementById('soTTot'); if(tt) tt.textContent=fmt(TOTAL);
          render();
          if (typeof goToPage==='function') goToPage('songOpenedPage');
          salute();
          setPlaying(true); // автозапуск (реальное аудио или демо-фолбэк)
        };

        // Вход ?screen=song-opened[&rid=<id>]: (а) возврат с оплаты T-Bank (successUrl ведёт сюда
        // с rid — подтягиваем трек и открываем «Песня открыта»), (б) тест-вход без rid (демо).
        var _soWant = false, _soRid = null;
        try { var _sp = new URLSearchParams(location.search); _soWant = _sp.get('screen') === 'song-opened'; _soRid = _sp.get('rid') || null; } catch(_){}
        try { var _wa = window.Telegram && window.Telegram.WebApp; if (_wa && _wa.initDataUnsafe && _wa.initDataUnsafe.start_param === 'song-opened') _soWant = true; } catch(_){}
        try { if ((location.hash || '').indexOf('song-opened') !== -1) _soWant = true; } catch(_){} // VK: vk.com/app…#song-opened
        if (_soWant) {
          var _soTries = 0;
          var _soTimer = setInterval(function(){
            _soTries++;
            var home = document.getElementById('homePage');
            var authed = home && home.classList.contains('active');
            var loginUp = document.getElementById('webLoginScreen');
            if (authed && !loginUp && typeof window.openSongOpened === 'function') {
              clearInterval(_soTimer);
              if (_soRid) {
                // Возврат с оплаты: подтянуть реальный трек (аудио/название) из my-tracks
                var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                var authH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
                fetch(apiBase + '/api/my-tracks?limit=50&offset=0', { headers: authH })
                  .then(function(r){ return r.json().catch(function(){ return {}; }); })
                  .then(function(j){
                    var list = (j && (j.tracks || j.data || j.items)) || (Array.isArray(j) ? j : []);
                    var row = null;
                    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(_soRid)) { row = list[i]; break; }
                    if (row) window._songUnlockTrack = row;
                    window.openSongOpened(row ? { track: row, requestId: _soRid } : {});
                  })
                  .catch(function(){ window.openSongOpened({}); });
              } else {
                window.openSongOpened({});
              }
            }
            else if (_soTries > 30) { clearInterval(_soTimer); }
          }, 500);
        }
      })();

      // ========== Вход ?screen=taste[&rid=<id>]: «Послушать минуту» из чат-тизера ==========
      // Тизер вкуса (workerSoundKey.sendTasteTeaser) шлёт кнопку web_app с этим URL. Раньше вёл
      // на главную. Теперь: открываем «Мои треки», находим запертый вкус-трек и запускаем его в
      // плеере — плеер сам на 60с показывает экран разлочки (_onTimeUpdate gate). web_app.url хранит
      // query-строку; start_param и hash тоже поддержаны (как в screen=song-opened выше).
      (function(){
        var want = false, rid = null;
        try { var sp = new URLSearchParams(location.search); want = sp.get('screen') === 'taste'; rid = sp.get('rid') || null; } catch(_){}
        try { var wa = window.Telegram && window.Telegram.WebApp; if (wa && wa.initDataUnsafe && wa.initDataUnsafe.start_param === 'taste') want = true; } catch(_){}
        try { if ((location.hash || '').indexOf('screen=taste') !== -1) want = true; } catch(_){} // VK: vk.com/app…#screen=taste
        if (!want) return;

        var navigated = false, tries = 0;
        var timer = setInterval(function(){
          tries++;
          if (!navigated) {
            // Фаза 1: ждём авторизацию + домашний экран, затем ОДИН раз уходим в «Мои треки».
            var home = document.getElementById('homePage');
            var authed = home && home.classList.contains('active');
            var loginUp = document.getElementById('webLoginScreen');
            if (!authed || loginUp) { if (tries > 40) clearInterval(timer); return; }
            navigated = true;
            if (typeof goToPage === 'function') goToPage('myTracksPage');
            if (typeof window.loadMyTracks === 'function') window.loadMyTracks(false);
            return;
          }
          // Фаза 2: уже в «Мои треки» — home больше НЕ active, повторно гейт НЕ проверяем (иначе
          // воспроизведение никогда не запустится). Ждём список, находим запертый вкус-трек, играем
          // (плеер сам на 60с покажет экран разлочки).
          var list = window._mtTracksData || [];
          if (!list.length) { if (tries > 40) clearInterval(timer); return; } // ждём загрузку треков
          var idx = -1;
          if (rid != null) { for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(rid)) { idx = i; break; } }
          if (idx < 0) { for (var j = 0; j < list.length; j++) if (list[j].locked) { idx = j; break; } } // фолбэк — первый запертый
          clearInterval(timer);
          if (idx >= 0 && typeof window._mtPlayTrack === 'function') window._mtPlayTrack(idx); // нет вкус-трека → остаёмся в «Мои треки»
        }, 500);
      })();

      // ========== Пикер первого человека «Про двоих» (единый пикер, Алла 05.07) ==========
      // Переключатели режимов «Я + Человек / Карточка + Карточка» убраны — первый и второй
      // человек выбираются из одного списка «Я» + карточки, данные пишутся в видимые поля.
      (function() {
        window._selectedPerson1Hero = null;

        // Пикер person1 из Лаборатории
        var p1Btn = document.getElementById('pickPerson1FromLabBtn');
        var p1List = document.getElementById('pickPerson1List');
        var p1Dropdown = document.getElementById('pickPerson1Dropdown');
        var p1Chevron = document.getElementById('pickPerson1Chevron');
        if (p1Btn && p1List && p1Dropdown) {
          function closeP1() { p1Dropdown.style.display = 'none'; p1Btn.setAttribute('aria-expanded', 'false'); if (p1Chevron) p1Chevron.style.transform = ''; }
          function openP1() { p1Dropdown.style.display = 'block'; p1Btn.setAttribute('aria-expanded', 'true'); if (p1Chevron) p1Chevron.style.transform = 'rotate(180deg)'; }
          p1Btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (p1Dropdown.style.display === 'block') { closeP1(); return; }
            p1List.innerHTML = '<div style="padding:12px;text-align:center;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('loading') : 'Загрузка…') + '</div>';
            openP1();
            var cache = window.heroesCache;
            if (cache && cache.length > 0) { renderP1List(cache); return; }
            // Даже без сохранённых людей рендерим список — карточка «Я» (профиль) всё равно доступна.
            if (typeof heroesApi !== 'function') { renderP1List([]); return; }
            heroesApi('/heroes', { method: 'GET' }).then(function(d) {
              window.heroesCache = (d && d.clients) || [];
              renderP1List(window.heroesCache);
            }).catch(function() { renderP1List([]); });
          });
          // Карточка «Я» (профиль пользователя) для пикера первого человека — чтобы в режиме
          // «Карточка + Карточка» можно было выбрать себя (Алла 04.07: «в Лаборатории должна быть
          // карточка Я и дать выбор двоим»). Без неё список = только другие люди → ступор «Выбери
          // первого человека из Лаборатории» (жалоба тестера KAYLANI). Данные — из профиля/полей формы.
          function _buildSelfHero() {
            var prof = window._savedFormProfile || (typeof getCachedProfile === 'function' ? getCachedProfile() : null) || {};
            var gv = function(id){ var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
            var bpEl = document.getElementById('birthplace');
            var unkEl = document.getElementById('unknown');
            return {
              id: '__self', __self: true,
              name: prof.name || prof.first_name || gv('name'),
              birth_date: String(prof.birthdate || gv('birthdate') || '').slice(0, 10),
              birth_time: String(prof.birthtime || gv('birthtime') || '').slice(0, 5),
              birthtime_unknown: prof.birthtime_unknown != null ? !!prof.birthtime_unknown : (unkEl ? !!unkEl.checked : false),
              birth_place: prof.birthplace || gv('birthplace'),
              birth_lat: prof.birthplace_lat != null ? prof.birthplace_lat : (bpEl && bpEl.getAttribute('data-lat')),
              birth_lon: prof.birthplace_lon != null ? prof.birthplace_lon : (bpEl && bpEl.getAttribute('data-lon')),
              gender: prof.gender || gv('gender')
            };
          }
          function _selfHeroReady() { var h = _buildSelfHero(); return !!(h.name && h.birth_date && h.birth_place); }
          // Экспонируем для пикера второго человека (11-heroes.js) — единый пикер «Про двоих»:
          // карточка «Я» должна быть доступна и первым, и вторым человеком (Алла 05.07).
          window._buildSelfHero = _buildSelfHero;
          window._selfHeroReady = _selfHeroReady;
          function renderP1List(heroes) {
            var esc = typeof escHtml === 'function' ? escHtml : function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
            // Batch 10.17 (7272788): фильтруем уже-выбранного в Person 2 (_selectedLabHeroId)
            var p2Id = window._selectedLabHeroId;
            var filtered = p2Id ? heroes.filter(function(h){ return h.id !== p2Id; }) : heroes;
            var _selP1 = window._selectedPerson1Hero && window._selectedPerson1Hero.id;
            function optHtml(id, label, isSel) {
              return '<button type="button" role="option" aria-selected="' + (isSel ? 'true' : 'false') + '" class="pick-p1-option' + (isSel ? ' sel' : '') + '" data-id="' + esc(id) + '" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px 14px;text-align:left;font-size:0.9rem;color:' + (isSel ? 'var(--primary-color)' : 'rgba(255,255,255,0.9)') + ';background:' + (isSel ? 'rgba(var(--primary-rgb),0.14)' : 'none') + ';border:none;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;font-family:inherit;font-weight:' + (isSel ? '600' : '400') + ';"><span>' + label + '</span>' + (isSel ? '<span aria-hidden="true" style="color:var(--primary-color);font-size:1.05rem;line-height:1;">✓</span>' : '') + '</button>';
            }
            var html = '';
            // «Я» — первым пунктом, если профиль заполнен и «Я» не выбран уже вторым человеком
            function _fmtD(iso){ var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3]+'.'+m[2]+'.'+m[1] : ''; }
            if (_selfHeroReady() && p2Id !== '__self') {
              var _self = _buildSelfHero();
              html += optHtml('__self', esc((typeof t === 'function' ? t('coupleSelfCard') : 'Я')) + ' · ' + esc(_self.name || ''), _selP1 === '__self');
            }
            html += filtered.map(function(h) {
              var _d=_fmtD(h.birth_date);
              return optHtml(h.id || '', esc(h.name || '—') + (_d ? ' · ' + _d : ''), _selP1 && h.id === _selP1);
            }).join('');
            if (!html) {
              html = '<div style="padding:12px;font-size:0.85rem;color:rgba(255,255,255,0.5)">' + (typeof t === 'function' ? t('noSavedPeople') : 'Нет сохранённых людей.') + '</div>';
            }
            // «+ Добавить контакт» — пункт ВНУТРИ списка (Алла 11.07): не успел добавить → сюда
            html += '<button type="button" class="pick-p1-option pfl-add" data-id="__add_contact__" style="width:100%;text-align:left;cursor:pointer;font-family:inherit;"><span class="pfl-name">' + ((typeof t === 'function' && t('forWhoAddContact')) || '+ Добавить контакт') + '</span></button>';
            p1List.innerHTML = html;
            p1List.querySelectorAll('.pick-p1-option').forEach(function(opt) {
              opt.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                if (id === '__add_contact__') {
                  closeP1();
                  var _ab1 = document.getElementById('forWhoAddContactBtn');
                  if (_ab1) _ab1.click();
                  return;
                }
                var hero = id === '__self' ? _buildSelfHero() : (window.heroesCache || []).find(function(c) { return c.id === id; });
                if (hero) {
                  window._selectedPerson1Hero = hero;
                  // Единый пикер (Алла 05.07): пишем выбор в ВИДИМЫЕ поля первого человека
                  // (#name/#birthdate/#gender…), чтобы видимое == отправляемое и не было
                  // перемешивания Alla/Фаниан. '__self' → восстановить профиль в поля.
                  if (typeof fillFormFromHero === 'function') fillFormFromHero(id === '__self' ? null : hero);
                  var p1BtnText = document.getElementById('pickPerson1BtnText');
                  if (p1BtnText) p1BtnText.textContent = (typeof t === 'function' ? t('pickFromLabSelected') : 'Выбрано: ') + (hero.name || '');
                  // Batch 10.17 (7272935): обновляем pfa-header Person 1 на имя выбранного героя
                  // «2 карточки» (Алла 11.07): сводка «Имя · ДД.ММ.ГГГГ» — симметрично карточке 2
                  var p1AccName = document.getElementById('p1AccName');
                  if (p1AccName) {
                    var _bdm = String(hero.birth_date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
                    p1AccName.textContent = (hero.name || (typeof t === 'function' ? t('couplePerson1Label') : 'Первый человек')) + (_bdm ? ' · ' + _bdm[3] + '.' + _bdm[2] + '.' + _bdm[1] : '');
                  }
                  try { if (window._syncP1NameHint) window._syncP1NameHint(); } catch(_) {}
                  closeP1();
                }
              });
            });
          }
          document.addEventListener('click', function(e) {
            if (p1Dropdown.style.display === 'block' && !p1Dropdown.contains(e.target) && !p1Btn.contains(e.target)) closeP1();
          });
        }
      })();

      var soulChatPayBtn = document.getElementById('soulChatPayBtn');
      if (soulChatPayBtn) soulChatPayBtn.addEventListener('click', function() { goToPage('formPage'); setTimeout(function() { var stepNext = document.getElementById('stepNext'); if (stepNext) stepNext.click(); }, 100); });
      function openBotLink(payload) {
        // Defense-in-depth: openBotBtn / openBotBeforeSubmitBtn скрыты CSS в VK/OK,
        // но если функция будет вызвана из нового места без скрытия — гарантируем,
        // что в VK/OK НЕ откроется t.me-ссылка (нарушение §4.1.8 VK / §2.2 OK).
        if (window._isVkMiniApp || window._isOkMiniApp || window._appEnv === 'vk' || window._appEnv === 'ok') return;
        var botUrl = 'https://t.me/' + BOT_USERNAME + (payload ? '?start=' + payload : '');
        if (tg && tg.openTelegramLink) tg.openTelegramLink(botUrl);
        else if (tg && tg.openLink) tg.openLink(botUrl);
        else window.open(botUrl, '_blank');
      }
      var openBotBtn = document.getElementById('openBotBtn');
      if (openBotBtn) openBotBtn.addEventListener('click', function() {
        openBotLink('song_ready');
        setTimeout(function() { try { if (tg && tg.close) tg.close(); } catch(e){} }, 400);
      });
      var successMyTracksBtn = document.getElementById('successMyTracksBtn');
      if (successMyTracksBtn) successMyTracksBtn.addEventListener('click', function() {
        window.returnToPage = 'successPage';
        goToPage('myTracksPage');
        if (typeof window.loadMyTracks === 'function') window.loadMyTracks(false);
      });
      function initSuccessInteractiveBlob() {
        var ib = document.getElementById('successInteractiveBlob');
        if (!ib) return;
        var curX = 0, curY = 0, tgX = 0, tgY = 0;
        function move() {
          var sp = document.getElementById('successPage');
          if (sp && sp.classList.contains('active')) {
            curX += (tgX - curX) / 20;
            curY += (tgY - curY) / 20;
            ib.style.transform = 'translate(' + Math.round(curX) + 'px,' + Math.round(curY) + 'px)';
          }
          requestAnimationFrame(move);
        }
        function setTarget(x, y) { tgX = x; tgY = y; }
        window.addEventListener('mousemove', function(e) { setTarget(e.clientX, e.clientY); });
        window.addEventListener('touchmove', function(e) { if (e.touches[0]) setTarget(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
        move();
      }
      var openBotBeforeSubmitBtn = document.getElementById('openBotBeforeSubmitBtn');
      if (openBotBeforeSubmitBtn) openBotBeforeSubmitBtn.addEventListener('click', function() { openBotLink('miniapp_start'); });
      var helpSupportBtn = document.getElementById('helpSupportBtn');
      var SUPPORT_USERNAME = BOT_USERNAME;
      // На нативе — проектный адрес yupsoulmusic@gmail.com: он же указан в
      // англоязычных документах витрины, и расхождение между кнопкой в
      // приложении и Support URL в App Store Connect ревью не любит. Русский
      // контур остаётся на mail.ru — этот адрес назван оператором в политике
      // по 152-ФЗ, его менять нельзя.
      var SUPPORT_EMAIL = window._isNativeApp ? 'yupsoulmusic@gmail.com' : 'yupsoul_main@mail.ru';
      (function() {
        var _base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!_base) return;
        fetch(_base + '/api/config').then(function(r){ return r.json(); }).then(function(d){
          if (d && d.support_username) SUPPORT_USERNAME = d.support_username;
          // На нативе адрес фиксирован: сервер отдаёт русский контур (mail.ru),
          // а в App Store Connect указан проектный gmail — расхождение кнопки в
          // приложении и Support URL витрины ревью не любит.
          if (d && d.support_email && !window._isNativeApp) SUPPORT_EMAIL = d.support_email;
        }).catch(function(){});
      })();
      // helpSupportBtn handler — VK iframe не поддерживает mailto:, поэтому в VK
      // открываем ОФИЦИАЛЬНОЕ СООБЩЕСТВО YupSoul (https://vk.com/club237303283) —
      // таково требование модерации VK Mini Apps: поддержка только через сообщество ВК,
      // не через email/Telegram. VKWebAppOpenLink с vk.com-ссылкой открывается
      // в нативном интерфейсе VK, а не внутри iframe мини-аппа.
      // Telegram — t.me ссылка через openTelegramLink.
      // Web — обычный mailto:.
      var YUPSOUL_VK_GROUP_URL = 'https://vk.com/club237303283';
      // OK-сообщество: URL ждёт создания группы в Одноклассниках (будет заменён
      // после создания группы YupSoul в ОК). Временный placeholder — ok.ru/group/...
      // При отсутствии корректного URL — fallback на копирование/алерт с пояснением.
      // Реальная группа YupSoul в Одноклассниках (создана 26.04.2026 для подачи
      // OK Mini App на модерацию). Можно переопределить через window._YUPSOUL_OK_GROUP_URL.
      var YUPSOUL_OK_GROUP_URL = (window._YUPSOUL_OK_GROUP_URL || 'https://ok.ru/group/70000049367285');
      function _handleHelpSupportClick() {
        var isOk = window._appEnv === 'ok' || (window._isOkMiniApp);
        var isVk = !isOk && (window._appEnv === 'vk' || (window._isVkMiniApp));
        var isTg = !isVk && !isOk && (window._appEnv === 'telegram' || window._isTgEmbed || !!(window.Telegram && window.Telegram.WebApp));
        if (isOk) {
          // OK: сообщество открываем через VK Bridge VKWebAppOpenLink
          // (OK использует тот же VK Bridge — dev.vk.com/ru/ok/overview).
          // Fallback — VKWebAppCopyText + toast.
          var _tOkSupport = function(key){
            try { if (typeof t === 'function') return t(key, { url: YUPSOUL_OK_GROUP_URL }); } catch(_) {}
            return YUPSOUL_OK_GROUP_URL;
          };
          var _okSupportFallback = function(){
            // §22: копируем через единый хелпер (он сам уходит в execCommand).
            // VKWebAppCopyText убран — на мобильных VK показывал свой native toast
            // поверх нашего, выходило двойное уведомление (7279957).
            var _say = function(copied) {
              var msg = _tOkSupport(copied ? 'okSupportLinkCopied' : 'okSupportLink');
              if (typeof showToast === 'function') showToast(msg); else alert(msg);
            };
            try { Promise.resolve(window._copyToClipboard(YUPSOUL_OK_GROUP_URL, { silent: true })).then(_say, function(){ _say(false); }); }
            catch(_) { _say(false); }
          };
          try {
            if (window.vkBridge && typeof vkBridge.send === 'function') {
              vkBridge.send('VKWebAppOpenLink', { url: YUPSOUL_OK_GROUP_URL })
                .catch(function(){ _okSupportFallback(); });
              return;
            }
          } catch(e) {}
          _okSupportFallback();
          return;
        }
        if (isVk) {
          // VK: сначала пробуем VKWebAppOpenLink — это способ, который ожидает
          // модерация VK Mini Apps (нативный UI VK, не iframe). Если метод
          // не поддерживается клиентом или вернул ошибку — fallback на
          // VKWebAppCopyText + toast «Ссылка скопирована».
          var _tSupport = function(key){
            try { if (typeof t === 'function') return t(key, { url: YUPSOUL_VK_GROUP_URL }); } catch(_) {}
            return YUPSOUL_VK_GROUP_URL;
          };
          // VK Testers 7256587 ПЕРЕОТКРЫТ-5 18.05 (Алина: «не работает, перехода нет»):
          // Просто copy + toast НЕ достаточно — юзер ждёт ОТКРЫТИЯ чата поддержки.
          // Решение: ОТКРЫТЬ URL в новой вкладке через `window.open` (native browser API,
          // не VK API). Если popup blocker сработает — fallback на copy + toast.
          try { window.open(YUPSOUL_VK_GROUP_URL, '_blank', 'noopener'); } catch(_) {}
          // Также копируем как backup — если popup blocked, у юзера URL в буфере.
          try {
            var ta = document.createElement('textarea');
            ta.value = YUPSOUL_VK_GROUP_URL; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof showToast === 'function') showToast(_tSupport('vkSupportLinkCopied') || ('Открываем поддержку. Ссылка также скопирована.'));
          } catch(_) {
            if (typeof showToast === 'function') showToast(_tSupport('vkSupportLink')); else alert(_tSupport('vkSupportLink'));
          }
          return;
        }
        if (isTg) {
          var supportUrl = 'https://t.me/' + SUPPORT_USERNAME;
          try {
            var app = window.Telegram && window.Telegram.WebApp;
            if (app && app.openTelegramLink) { app.openTelegramLink(supportUrl); return; }
            if (app && app.openLink) { app.openLink(supportUrl); return; }
          } catch(e) {}
          window.open(supportUrl, '_blank');
        } else {
          // Batch 9.17 (отчёт Грубниковой Windows): mailto: на Windows без
          // настроенного дефолтного почтового клиента — silent fail. Юзер
          // тапает «Написать в поддержку» — ничего не происходит, выглядит
          // как баг. Фикс: 3-уровневый fallback:
          //   1) copy email в буфер через _copyToClipboard (§22 — единый хелпер)
          //   2) showToast «Email скопирован: yupsoul_main@mail.ru»
          //   3) открыть TG-канал поддержки https://t.me/<SUPPORT_USERNAME>
          //      как универсальный путь, работающий и на Windows и на mobile
          var _tlSup = typeof t === 'function' ? t : function(k, fb) { return fb || k; };
          // §22: через единый хелпер; тост — по фактическому результату копирования,
          // раньше _copied выставлялся оптимистично до подтверждения записи.
          var _sayEmail = function(copied) {
            if (typeof showToast === 'function') {
              showToast(copied
                ? _tlSup('supportEmailCopied', 'Email скопирован: ' + SUPPORT_EMAIL)
                : _tlSup('supportEmailLabel', 'Напиши нам: ' + SUPPORT_EMAIL));
            }
          };
          try { Promise.resolve(window._copyToClipboard(SUPPORT_EMAIL, { silent: true })).then(_sayEmail, function(){ _sayEmail(false); }); }
          catch(_) { _sayEmail(false); }
          // Универсальный fallback — TG-канал поддержки. Работает везде:
          // Windows, Mac, mobile-web, без зависимости от mailto-клиента.
          var _tgSupport = 'https://t.me/' + SUPPORT_USERNAME;
          try { window.open(_tgSupport, '_blank', 'noopener'); } catch(_) {}
        }
      }
      if (helpSupportBtn) helpSupportBtn.addEventListener('click', _handleHelpSupportClick);

      // Делегированный handler для динамически создаваемых кнопок
      // (newKeyBtn создаётся в showConfirm() через innerHTML, поэтому
      //  addEventListener на конкретный элемент не работает — кнопка пересоздаётся).
      function _handleNewKeyClick() {
        var n = document.getElementById('name');
        var bd = document.getElementById('birthdate');
        var bp = document.getElementById('birthplace');
        var bt = document.getElementById('birthtime');
        var g = document.getElementById('gender');
        var langEl = document.getElementById('language');
        var r = document.getElementById('request');
        if (n) n.value = '';
        if (bd) { bd.value = ''; if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate'); }
        if (bp) bp.value = '';
        if (bt) bt.value = '';
        var unknownChk = document.getElementById('unknown'); if (unknownChk) unknownChk.checked = false;
        if (g) g.value = '';
        if (langEl) langEl.value = '';
        if (r) r.value = '';
        var bdWrap = document.getElementById('birthdateWrap');
        if (bdWrap) { bdWrap.classList.remove('has-date'); var bc = document.getElementById('birthdateCheck'); if (bc) bc.setAttribute('aria-hidden', 'true'); }
        var birthplaceHint = document.getElementById('birthplaceHint');
        if (birthplaceHint) birthplaceHint.style.display = 'none';
        var bpEl = document.getElementById('birthplace');
        if (bpEl) { bpEl.removeAttribute('data-place-selected'); bpEl.removeAttribute('data-lat'); bpEl.removeAttribute('data-lon'); }
        var wrap = document.getElementById('birthplaceWrap');
        if (wrap) wrap.classList.remove('has-place');
        // Batch 10.1 (отчёт 7268854 Windows): после нажатия «Ещё песню»
        // кнопка «Назад» на форме вела на главную, а не на экран «Заявка
        // принята». Запоминаем successPage как место возврата, чтобы
        // стрелка «Назад» вела пользователя обратно к подтверждению заявки.
        try { window.returnToPage = 'successPage'; } catch (_) {}
        // Batch 10.13 (отчёт 7272236 MacOS): сброс _selectedHeroId — иначе
        // при «Ещё песню» / повторном открытии формы остаётся «Для: Сенто»
        // на stepNext и герой из прошлой сессии в forWho select.
        try {
          _selectedHeroId = null;
          var forWhoEl = document.getElementById('forWho');
          if (forWhoEl) forWhoEl.value = '';
          var stepNext = document.getElementById('stepNext');
          var btnText = stepNext && stepNext.querySelector('.btn-pay-text');
          if (btnText) btnText.textContent = typeof t === 'function' ? t('submitRequest') : 'Создать мою песню';
        } catch (_) {}
        goToPage('formPage');
      }
      window._handleNewKeyClick = _handleNewKeyClick;
      // Делегированный listener — ловим клик по newKeyBtn, который пересоздаётся в showConfirm()
      document.addEventListener('click', function(ev) {
        var t = ev.target;
        // Найти ближайший элемент с id="newKeyBtn" (учёт SVG внутри кнопки)
        while (t && t !== document) {
          if (t.id === 'newKeyBtn') { ev.preventDefault(); _handleNewKeyClick(); return; }
          t = t.parentNode;
        }
      }, false);

      document.querySelectorAll('.preview-nav button').forEach(function(button) {
        button.addEventListener('click', function() {
          var pageMap = { 'home': 'homePage', 'form': 'formPage', 'payment': 'paymentPage', 'loading': 'loadingPage', 'success': 'successPage', 'heroes': 'heroesPage', 'login': null };
          document.querySelectorAll('.preview-nav button').forEach(function(btn) { btn.classList.remove('active'); });
          this.classList.add('active');
          var page = button.getAttribute('data-page');
          if (page === 'payment') {
            if (typeof showPaymentOverlay === 'function') showPaymentOverlay();
            return;
          }
          if (page === 'login') {
            document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); p.style.visibility = 'hidden'; });
            var prev = window._previewMode;
            window._previewMode = false;
            if (typeof showWebLoginScreen === 'function') showWebLoginScreen();
            window._previewMode = prev;
            var loginEl = document.getElementById('webLoginScreen');
            if (loginEl) loginEl.style.setProperty('display', 'flex', 'important');
            return;
          }
          var loginEl = document.getElementById('webLoginScreen');
          if (loginEl) loginEl.style.setProperty('display', 'none', 'important');
          goToPage(pageMap[page] || 'homePage');
        });
      });

      (function initResizeHandles() {
        if (!window._previewMode) return;
        var wrap = document.getElementById('resizeHandlesWrap');
        var handle = document.getElementById('resizeHandle');
        var moveHandle = document.getElementById('moveHandle');
        var panel = document.getElementById('resizeCopyPanel');
        var toggle = document.getElementById('resizeHandlesToggle');
        var selectorDisplay = document.getElementById('resizeSelectorDisplay');
        var copyBtn = document.getElementById('resizeCopyCssBtn');
        if (!wrap || !handle || !toggle) return;
        var selectedEl = null, modeOn = false, dragging = false, dragMode = '', startX, startY, startW, startH, startLeft, startTop;
        function updateHandlePosition() {
          if (!selectedEl) return;
          var r = selectedEl.getBoundingClientRect();
          if (handle) {
            handle.style.left = (r.right - 18) + 'px';
            handle.style.top = (r.bottom - 18) + 'px';
            handle.style.display = 'block';
          }
          if (moveHandle) {
            moveHandle.style.left = r.left + 'px';
            moveHandle.style.top = r.top + 'px';
            moveHandle.style.display = 'block';
          }
        }
        function clearSelection() {
          selectedEl = null;
          if (handle) handle.style.display = 'none';
          if (moveHandle) moveHandle.style.display = 'none';
          if (panel) panel.style.display = 'none';
        }
        function getSelector(el) {
          if (!el) return '';
          if (el.id) return '#' + el.id;
          if (el.className && typeof el.className === 'string') {
            var c = el.className.trim().split(/\s+/).filter(function(x){ return x && x.indexOf('active') < 0; })[0];
            if (c) return '.' + c;
          }
          return el.tagName.toLowerCase();
        }
        toggle.addEventListener('click', function() {
          modeOn = !modeOn;
          wrap.style.display = modeOn ? 'block' : 'none';
          toggle.style.background = modeOn ? 'rgba(234,179,8,0.4)' : 'rgba(234,179,8,0.2)';
          if (!modeOn) clearSelection();
        });
        document.addEventListener('click', function(e) {
          if (!modeOn) return;
          if (wrap.contains(e.target) || (panel && panel.contains(e.target)) || toggle.contains(e.target)) return;
          var t = e.target;
          while (t && t !== document.body) {
            if (t.tagName === 'BUTTON' || t.tagName === 'A' || t.classList.contains('btn') || t.classList.contains('home-nav-link') || t.classList.contains('home-app-menu-btn') || t.id === 'startBtn' || t.classList.contains('web-login-telegram-btn') || t.classList.contains('home-glass-card') || t.classList.contains('home-choice') || t.classList.contains('btn-cta-primary')) break;
            t = t.parentElement;
          }
          if (t && t !== document.body) {
            e.preventDefault();
            e.stopPropagation();
            selectedEl = t;
            updateHandlePosition();
            if (panel && selectorDisplay) { selectorDisplay.textContent = getSelector(t); panel.style.display = 'block'; }
          }
        }, true);
        handle.addEventListener('mousedown', function(e) {
          e.preventDefault();
          if (!selectedEl) return;
          dragging = true;
          dragMode = 'resize';
          startX = e.clientX;
          startY = e.clientY;
          var r = selectedEl.getBoundingClientRect();
          startW = r.width;
          startH = r.height;
        });
        if (moveHandle) moveHandle.addEventListener('mousedown', function(e) {
          e.preventDefault();
          if (!selectedEl) return;
          dragging = true;
          dragMode = 'move';
          startX = e.clientX;
          startY = e.clientY;
          var pos = window.getComputedStyle(selectedEl).position;
          if (pos === 'static' || pos === '') selectedEl.style.position = 'relative';
          startLeft = parseFloat(selectedEl.style.left) || 0;
          startTop = parseFloat(selectedEl.style.top) || 0;
        });
        document.addEventListener('mousemove', function(e) {
          if (!dragging || !selectedEl) return;
          if (dragMode === 'resize') {
            var newW = Math.max(20, startW + (e.clientX - startX));
            var newH = Math.max(20, startH + (e.clientY - startY));
            selectedEl.style.width = newW + 'px';
            selectedEl.style.height = newH + 'px';
          } else if (dragMode === 'move') {
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            selectedEl.style.left = (startLeft + dx) + 'px';
            selectedEl.style.top = (startTop + dy) + 'px';
          }
          updateHandlePosition();
        });
        document.addEventListener('mouseup', function() { dragging = false; dragMode = ''; });
        window.addEventListener('scroll', function() { if (selectedEl && !dragging) updateHandlePosition(); }, true);
        window.addEventListener('resize', function() { if (selectedEl) updateHandlePosition(); });
        if (copyBtn) copyBtn.addEventListener('click', function() {
          if (!selectedEl) return;
          var sel = getSelector(selectedEl);
          var cs = selectedEl.style;
          var comp = window.getComputedStyle(selectedEl);
          var w = cs.width || comp.width;
          var h = cs.height || comp.height;
          var parts = [];
          if (w) parts.push('width: ' + w);
          if (h) parts.push('height: ' + h);
          if (cs.position) parts.push('position: ' + cs.position);
          if (cs.left !== undefined && cs.left !== '') parts.push('left: ' + cs.left);
          if (cs.top !== undefined && cs.top !== '') parts.push('top: ' + cs.top);
          var css = sel + ' { ' + parts.join('; ') + ' }';
          // §22: через единый хелпер (служебный инструмент, тост не нужен).
          var _cssDone = function() { copyBtn.textContent = 'Скопировано!'; setTimeout(function() { copyBtn.textContent = 'Скопировать CSS'; }, 1500); };
          try { Promise.resolve(window._copyToClipboard(css, { silent: true })).then(_cssDone, _cssDone); } catch(_) { _cssDone(); }
        });
      })();

      function checkAdminAndShowLink() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var initData = (tg && tg.initData) ? tg.initData : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
        if (!apiBase || !initData) return;
        fetch(apiBase + '/api/admin/me', { headers: { 'X-Telegram-Init': initData } })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data || !data.admin) return;
            function openAdmin(e) {
              e.preventDefault();
              var url = apiBase + '/admin';
              if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(url);
              else window.open(url, '_blank');
            }
            var wrapProfile = document.getElementById('adminLinkWrapProfile');
            var btnProfile = document.getElementById('adminLinkBtnProfile');
            if (wrapProfile && btnProfile) {
              wrapProfile.style.display = 'block';
              wrapProfile.classList.add('admin-link-visible');
              if (!wrapProfile.dataset.adminBound) {
                wrapProfile.dataset.adminBound = '1';
                btnProfile.addEventListener('click', openAdmin);
              }
            }
            // Admin user в VK Mini App — запросим VK user-token для marketing-bot
            // photo upload. Запрашиваем ОДИН РАЗ (флаг в localStorage), offline
            // scope = бесконечный. После — marketing-bot читает из БД.
            requestVkAdminToken(apiBase, initData);
          })
          .catch(function() {});
      }
      window.checkAdminAndShowLink = checkAdminAndShowLink;
      checkAdminAndShowLink();

      // ─────────────────────────────────────────────────────────
      // VK Admin Token request — для marketing-bot photo upload.
      // Вызывается только если: admin user + VK Mini App + token ещё не получен.
      // VKWebAppGetAuthToken → VK popup «Разрешить» → POST токен на backend.
      // ─────────────────────────────────────────────────────────
      function requestVkAdminToken(apiBase, initData) {
        try {
          if (!window._isVkMiniApp || !window.vkBridge) return;
          // Уже спросили в этом устройстве? Не дёргаем повторно.
          if (localStorage.getItem('yup_vk_admin_token_requested') === '1') {
            // Но проверим что в БД токен реально есть — иначе сбросим флаг
            fetch(apiBase + '/api/internal/vk-admin-token', {
              headers: { 'X-Telegram-Init': initData }
            })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (!data || !data.has_token || data.expired) {
                  // Reset флаг — token нужно получить заново
                  localStorage.removeItem('yup_vk_admin_token_requested');
                }
              })
              .catch(function() {});
            return;
          }
          // Запрашиваем VK Bridge token для wall + photos + offline (бессрочный)
          // VK App ID = 54531891 (YupSoul Mini App)
          vkBridge.send('VKWebAppGetAuthToken', {
            app_id: 54531891,
            scope: 'photos,wall,offline,groups'
          })
            .then(function(res) {
              if (!res || !res.access_token) return;
              console.log('[VK admin token] получен, scope:', res.scope);
              // POST на backend
              return fetch(apiBase + '/api/internal/vk-admin-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Telegram-Init': initData
                },
                body: JSON.stringify({
                  access_token: res.access_token,
                  vk_user_id: res.user_id,
                  scope: res.scope,
                  expires_in: 0 // offline scope = бесконечный
                })
              })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                  if (data && data.ok) {
                    localStorage.setItem('yup_vk_admin_token_requested', '1');
                    console.log('[VK admin token] saved to backend ✓');
                  }
                });
            })
            .catch(function(err) {
              // User denied или error — не блокируем app
              console.warn('[VK admin token] cancelled or failed:', err && (err.error_data?.error_msg || err.message));
            });
        } catch (e) {
          console.warn('[VK admin token] exception:', e && e.message);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // ВОЗВРАТ ПОСЛЕ ОПЛАТЫ КАРТОЙ (T-Bank / HOT в in-app browser)
      // Когда tg.openLink() открывает браузер с платёжной страницей,
      // мини-апп уходит в фон. При закрытии браузера срабатывает
      // visibilitychange / activated — здесь проверяем pending_payment.
      // ═══════════════════════════════════════════════════════════
      (function setupPaymentReturnWatcher() {
        var _handledReturn = false;

        function _onReturnFromPaymentBrowser() {
          if (document.visibilityState !== 'visible') return;
          if (_handledReturn) return;

          // VK Testers 10.05.2026: если только что нажали «Скачать» в плеере
          // (не «Оплатить») — visibilitychange срабатывает по download, не по
          // оплате. Не показываем «Проверяем оплату…» если был download
          // в последние 60 секунд.
          try {
            var _dlTs = Number(window._mtSkipPaymentReturnOnce || 0);
            if (_dlTs && (Date.now() - _dlTs) < 60000) {
              window._mtSkipPaymentReturnOnce = 0;
              return;
            }
          } catch(_) {}

          var _pp = null;
          try { var _r = localStorage.getItem('pending_payment_type'); if (_r) _pp = JSON.parse(_r); } catch(e) {}
          // Нет ожидающего платежа или устарел (> 30 мин)
          if (!_pp || !_pp.ts || (Date.now() - _pp.ts) > 30 * 60 * 1000) return;
          // Нет request_id — не можем проверить на сервере, не показываем экран
          var _reqId = (_pp.request_id || '').trim();
          if (!_reqId) return;

          _handledReturn = true;
          setTimeout(function() { _handledReturn = false; }, 60000);

          var _apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var _initData = typeof getInitData === 'function' ? getInitData() : '';
          var _pln = _pp.plan_name || 'Подписка';
          var _isSubscription = _pp.type === 'subscription';
          var _isSoulChat = _pp.type === 'soul_chat_day';

          // Показываем тихий тост — НЕ переходим на страницу успеха
          if (typeof showToast === 'function') showToast('Проверяем оплату…');

          // Опрашиваем сервер: подтверждён ли платёж (до 8 попыток × 3 сек = 24 сек)
          (async function verifyAndShow() {
            var maxAttempts = 8;
            var confirmed = false;

            for (var i = 0; i < maxAttempts; i++) {
              try {
                var checkResp = await fetch(
                  _apiBase + '/api/payments/return-check?request_id=' + encodeURIComponent(_reqId),
                  { headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {} }
                );
                var checkData = await checkResp.json().catch(function(){ return {}; });
                if (checkData && checkData.paid === true) {
                  confirmed = true;
                  break;
                }
              } catch(e) {
                console.warn('[return-check] attempt', i, e && e.message);
              }
              if (i < maxAttempts - 1) {
                await new Promise(function(r){ setTimeout(r, 3000); });
              }
            }

            if (!confirmed) {
              // Оплата не подтверждена — очищаем и ничего не делаем
              try { localStorage.removeItem('pending_payment_type'); } catch(e) {}
              console.log('[return-check] Payment not confirmed after', maxAttempts, 'attempts — no redirect');
              return;
            }

            // Оплата подтверждена на сервере — теперь показываем экран успеха
            try { localStorage.removeItem('pending_payment_type'); } catch(e) {}
            try { catalogCache = null; catalogCacheTime = 0; } catch(e) {}

            if (typeof goToPage === 'function') goToPage('paymentThanksPage');

            var _ptTitle = document.getElementById('paymentThanksTitle');
            var _ptSub   = document.getElementById('paymentThanksSubtitle');
            var _ptMsg   = document.getElementById('paymentThanksMessage');
            var _ptBack  = document.getElementById('paymentThanksBackBtn');
            var _ptHint  = document.getElementById('paymentThanksHint');
            if (_ptHint) _ptHint.style.display = 'none';

            if (_isSubscription) {
              if (_ptTitle) _ptTitle.textContent = t('ptTariffActivated');
              if (_ptSub)   _ptSub.textContent   = _pln;
              if (_ptMsg)   _ptMsg.innerHTML = t('ptWelcomeTo') + ' <strong>' + _pln + '</strong>!<br><span style="opacity:0.7">' + t('ptTracksAndChat') + '</span>';
              if (_ptBack)  { _ptBack.style.display = ''; _ptBack.style.visibility = 'visible'; _ptBack.textContent = t('ptGoHome'); _ptBack.setAttribute('data-goto', 'homePage'); }
            } else if (_isSoulChat) {
              if (_ptTitle) _ptTitle.textContent = t('ptScOpened');
              if (_ptSub)   _ptSub.textContent   = t('ptScAccess');
              if (_ptMsg)   _ptMsg.textContent   = t('ptScConfirmed');
              if (_ptBack)  { _ptBack.style.display = ''; _ptBack.style.visibility = 'visible'; _ptBack.textContent = t('ptGoSc'); _ptBack.setAttribute('data-goto', 'soulChatPage'); }
            } else {
              if (_ptTitle) _ptTitle.textContent = t('paymentConfirmed');
              if (_ptSub)   _ptSub.textContent   = t('ptSongInQueue');
              if (_ptMsg)   _ptMsg.textContent   = t('ptSongCreating');
              if (_ptBack)  { _ptBack.style.display = ''; _ptBack.style.visibility = 'visible'; _ptBack.textContent = t('ptGoHome'); _ptBack.setAttribute('data-goto', 'homePage'); }
            }

            if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){});

            // Для подписок — claim loop (на случай если webhook ещё не пришёл)
            if (_isSubscription && _apiBase && typeof claimSubscriptionSafe === 'function') {
              (async function runReturnClaimLoop() {
                for (var ci = 0; ci < 10; ci++) {
                  try {
                    var claimRes = await claimSubscriptionSafe(_apiBase, _initData, _reqId);
                    if (claimRes && !claimRes.skipped && claimRes.ok) {
                      if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){});
                      return;
                    }
                    if (claimRes && !claimRes.skipped && claimRes.status !== 202) break;
                  } catch(claimErr) {
                    console.warn('[return claim] attempt', ci, claimErr && claimErr.message);
                  }
                  if (ci < 9) await new Promise(function(r){ setTimeout(r, 4000); });
                }
              })();
            }
          })();
        }

        document.addEventListener('visibilitychange', _onReturnFromPaymentBrowser);
        try {
          if (tg && tg.onEvent) tg.onEvent('activated', _onReturnFromPaymentBrowser);
        } catch(e) {}
      })();

        } catch (e) {
          console.warn('App init error:', e);
        }
      }, 50);
    });
  

      // ═══ Лид-магнит «Кто ты на самом деле» (Алла 13.07) ═══════════════════
      // Расчёт на бэке детерминированный (Атмакарака), без LLM → мгновенно и
      // бесплатно. Экран внутри аппа → VK/TG/web/OK одинаково, без внешних ссылок.
      (function(){
        function $a(id){ return document.getElementById(id); }
        function archShowHint(msg){
          var h=$a('archHint'); if(!h) return;
          if(!msg){ h.style.display='none'; return; }
          h.textContent=msg; h.style.display='block';
        }
        window.initArchetypePage = function(){
          var inp=$a('archDate'); if(inp && !inp.value){ try{ var sp=window._savedFormProfile||{}; if(sp.birthdate) inp.value=sp.birthdate; }catch(_){} }
          var intro=$a('archIntro'), res=$a('archResult');
          if(intro) intro.style.display=''; if(res) res.style.display='none';
          archShowHint('');
        };
        async function archGo(){
          var inp=$a('archDate'); var d=(inp&&inp.value||'').trim();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ archShowHint(typeof t==='function'?t('archNeedDate'):'Укажи дату рождения'); return; }
          var btn=$a('archGoBtn'); if(btn) btn.disabled=true;
          archShowHint('');
          try{
            if(typeof window._ensureOnline==='function' && !window._ensureOnline()){ if(btn) btn.disabled=false; return; }
            var base=(window.BACKEND_URL||window.HEROES_API_BASE||'').replace(/\/$/,'');
            var r=await (window.fetchWithTimeout?window.fetchWithTimeout(base+'/api/archetype?birthdate='+encodeURIComponent(d),{},20000):fetch(base+'/api/archetype?birthdate='+encodeURIComponent(d)));
            var j=await r.json().catch(function(){return null;});
            if(!j||!j.ok||!j.archetype){ archShowHint(typeof t==='function'?t('archBadDate'):'Проверь дату — что-то в ней не сходится'); if(btn) btn.disabled=false; return; }
            var a=j.archetype;
            $a('archName').textContent=a.name||'';
            $a('archEssence').textContent=a.essence||'';
            $a('archGift').textContent=a.gift||'';
            $a('archShadow').textContent=a.shadow||'';
            var meta=[];
            if(a.soul_planet) meta.push((typeof t==='function'?t('archSoulPlanet'):'Планета Души')+': '+a.soul_planet);
            if(a.note) meta.push((typeof t==='function'?t('archNote'):'Твоя нота')+': '+a.note);
            $a('archMeta').textContent=meta.join(' · ');
            $a('archIntro').style.display='none';
            $a('archResult').style.display='';
            try{ window.scrollTo(0,0); }catch(_){}
          }catch(e){ console.warn('[archetype]', e); archShowHint(typeof t==='function'?t('archBadDate'):'Проверь дату — что-то в ней не сходится'); }
          if(btn) btn.disabled=false;
        }
        document.addEventListener('DOMContentLoaded', function(){
          var g=$a('archGoBtn'); if(g) g.addEventListener('click', archGo);
          var ag=$a('archAgainBtn'); if(ag) ag.addEventListener('click', function(){ window.initArchetypePage(); });
          var ts=$a('archToSongBtn'); if(ts) ts.addEventListener('click', function(){
            // Мост к продукту: внутренний переход на форму + перенос даты.
            // Дату ставим ПОСЛЕ перехода (форма при открытии сама тянет профиль и
            // затирает поле — ловили пробой 13.07: dateInForm приходил пустым).
            var d=($a('archDate')||{}).value;
            if(typeof goToPage==='function') goToPage('formPage');
            if(!d) return;
            var tries=0;
            var iv=setInterval(function(){
              tries++;
              var f=document.getElementById('birthdate');
              if(f && !f.value){
                f.value=d;
                try{ if(typeof updateDateSelectsFromInput==='function') updateDateSelectsFromInput('birthdate'); }catch(_){}
                try{ f.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){}
              }
              if((f && f.value) || tries>=8) clearInterval(iv);   // ~1.2с максимум
            }, 150);
          });
          var di=$a('archDate'); if(di) di.addEventListener('input', function(){ archShowHint(''); });
        });

      /* ── ИНБОКС УВЕДОМЛЕНИЙ (Фаза 1, Алла 22.07) — достучаться до веб/ВК-юзеров без чата-бота ── */
      (function initInbox(){
        var _items = [];
        function _plat(){ try{ var e=window._appEnv; return e==='vk'?'vk':(e==='tg'?'tg':(e==='ok'||e==='web'?'web':null)); }catch(_){ return null; } }
        function _time(iso){ try{ var d=new Date(iso), s=(Date.now()-d.getTime())/1000; if(s<90) return 'только что'; if(s<3600) return Math.round(s/60)+' мин назад'; if(s<86400) return Math.round(s/3600)+' ч назад'; return d.toLocaleDateString('ru-RU'); }catch(_){ return ''; } }
        function _esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
        function _badge(n){ var b=document.getElementById('inboxBadge'); if(!b) return; if(n>0){ b.textContent=n>99?'99+':(''+n); b.hidden=false; } else b.hidden=true; }
        function _authHdr(){ try{ return (typeof getAuthHeaders==='function')?getAuthHeaders():{}; }catch(_){ return {}; } }
        function _get(url,opt){ try{ return (typeof fetchWithTimeout==='function')?fetchWithTimeout(url,opt,15000):fetch(url,opt); }catch(_){ return fetch(url,opt); } }
        function load(){
          try{
            if(typeof hasAuth==='function' && !hasAuth()) return;
            var url=apiBase+'/api/notifications'; var p=_plat(); if(p) url+='?platform='+p;
            _get(url,{headers:_authHdr()}).then(function(r){return r.json();}).then(function(j){
              if(!j||!j.success) return;
              _items=j.items||[]; _badge(j.unread||0);
              if(document.getElementById('inboxList')) _render();
              var ap=_items.find(function(n){return n.kind==='apology'&&!n.read;});
              if(ap && !window._inboxApologyShown){ window._inboxApologyShown=true; open(); }
            }).catch(function(){});
          }catch(_){}
        }
        function _overlay(){
          var ov=document.getElementById('inboxOverlay'); if(ov) return ov;
          ov=document.createElement('div'); ov.id='inboxOverlay'; ov.className='inbox-overlay';
          ov.innerHTML='<div class="inbox-sheet"><div class="inbox-grabber" aria-hidden="true"></div><div class="inbox-head"><h3>'+_esc((typeof t==='function'&&t('inboxTitle'))||'Уведомления')+'</h3><button type="button" class="inbox-close" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div id="inboxList"></div></div>';
          document.body.appendChild(ov);
          ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
          var c=ov.querySelector('.inbox-close'); if(c) c.addEventListener('click',close);
          return ov;
        }
        function _render(){
          var list=document.getElementById('inboxList'); if(!list) return;
          if(!_items.length){ list.innerHTML='<div class="inbox-empty">'+_esc((typeof t==='function'&&t('inboxEmpty'))||'Пока пусто')+'</div>'; return; }
          list.innerHTML=_items.map(function(n){
            var cls='inbox-item'+(n.kind==='apology'?' apology':'')+(n.read?'':' unread');
            var act=n.action_url?'<button type="button" class="inbox-item-act" data-url="'+_esc(n.action_url)+'"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'+_esc((typeof t==='function'&&t('inboxOpen'))||'Открыть')+'</button>':'';
            return '<div class="'+cls+'" data-id="'+_esc(n.id)+'"><div class="inbox-item-t">'+_esc(n.title)+'</div>'+(n.body?'<div class="inbox-item-b">'+_esc(n.body)+'</div>':'')+'<div class="inbox-item-time">'+_esc(_time(n.created_at))+'</div>'+act+'</div>';
          }).join('');
          Array.prototype.forEach.call(list.querySelectorAll('.inbox-item'),function(el){
            el.addEventListener('click',function(e){ if(e.target&&e.target.classList.contains('inbox-item-act')) return; _read(el.getAttribute('data-id'),el); });
          });
          Array.prototype.forEach.call(list.querySelectorAll('.inbox-item-act'),function(b){
            b.addEventListener('click',function(){ var u=b.getAttribute('data-url'); var el=b.closest('.inbox-item'); _read(el&&el.getAttribute('data-id'),el); if(u){ try{ if(/^https?:/i.test(u)) window.open(u,'_blank'); else if(typeof goToPage==='function') goToPage(u.replace(/^#/,'')); }catch(_){} close(); } });
          });
        }
        function _read(id,el){
          if(!id) return; var it=null; for(var i=0;i<_items.length;i++){ if(_items[i].id===id){ it=_items[i]; break; } }
          if(it&&it.read) return; if(it) it.read=true; if(el) el.classList.remove('unread');
          var u=0; for(var k=0;k<_items.length;k++){ if(!_items[k].read) u++; } _badge(u);
          try{ _get(apiBase+'/api/notifications/'+id+'/read',{method:'POST',headers:_authHdr()}).catch(function(){}); }catch(_){}
        }
        function open(){ _overlay(); _render(); var ov=document.getElementById('inboxOverlay'); if(ov){ ov.style.display='flex'; requestAnimationFrame(function(){ requestAnimationFrame(function(){ ov.classList.add('open'); }); }); } load(); }
        function close(){ var ov=document.getElementById('inboxOverlay'); if(ov){ ov.classList.remove('open'); setTimeout(function(){ ov.style.display='none'; },250); } }
        window._loadNotifications=load; window._openInbox=open;
        var _tries=0;
        (function boot(){ _tries++; if(typeof hasAuth==='function'&&hasAuth()){ load(); } else if(_tries<8){ setTimeout(boot,1500); } })();
      })();
      })();

      }
      // ── Payment Overlay helpers ──────────────────────────────────────────
      function showPaymentOverlay() {
        // Phase 1.2: явный funnel event — открытие экрана оплаты.
        // Раньше payment_start трекался на page_view (давал 9 событий vs
        // 373 form_submit). Теперь точно срабатывает на каждом open.
        if (window._ysTrack) {
          try { window._ysTrack('payment_overlay_opened', { sku: window.pendingPaymentSku || null, platform: window._appEnv || null }); } catch(_) {}
        }
        // VK, канон v7 (27.07): песня — цифровая ценность, значит только за деньги
        // и только на vk.ru/m.vk.ru (§5.4.1). Оплата Искрами здесь УБРАНА: Искры
        // покупаются за Голоса, а менять виртуальные ценности на цифровые запрещает
        // §5.2.3. Искры на VK живут отдельной жизнью — оракул. Overlay открываем
        // как обычно: на денежных поверхностях внутри карта T-Bank, на нативе
        // песни недоступны вовсе (оракул-only), и сюда путь просто не ведёт.
        // OK, КАНОН v9 (отказ 29.07): ОКи — валюта ВИРТУАЛЬНЫХ ценностей, а наш
        // продукт признан ЦИФРОВЫМ → ОКи убраны. Пакеты Искр на OK оплачиваются
        // картой, как в web. Песня = трата Искр ВНУТРИ приложения; внешний payment
        // overlay на OK скрыт (§5.4 — песню как цифровую ценность нельзя продавать
        // за валюту). Хватает Искр → списываем и генерируем; не хватает → ведём на
        // пополнение Искр (#topupPage, карта).
        if (window._appEnv === 'ok') {
          var _okIskry = typeof getIskryBalance === 'function' ? getIskryBalance() : 0;
          var _okNeeded = typeof ISKRY_PRICES !== 'undefined' ? (ISKRY_PRICES[pendingPaymentSku || 'single_song'] || 100) : 100;
          if (_okIskry >= _okNeeded) {
            // Искр хватает → оплата Искрами (тот же путь, что кнопка в overlay)
            var _okIskryBtn = document.getElementById('payOvFreeClaimBtn');
            if (_okIskryBtn) {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('iskryPayingProgress') || 'Списываю Искры...') : 'Списываю Искры...');
              _okIskryBtn.disabled = false; _okIskryBtn.click();
              return;
            }
          }
          // Не хватает Искр → пополнение Искр картой (топап). Без error-текста (§37).
          if (typeof goToPage === 'function') {
            goToPage('topupPage');
            setTimeout(function(){ if (window._initTopupPage) window._initTopupPage(); }, 100);
          }
          return;
        }
        var ov = document.getElementById('paymentOverlay');
        if (!ov) return;
        console.log('[Payment Overlay] Открытие окна оплаты');
        console.log('[Payment Overlay] pendingPaymentRequestId:', pendingPaymentRequestId);
        console.log('[Payment Overlay] freeTrialAvailable:', freeTrialAvailable);
        _hotPaymentConfirmed = false; // Сброс флага дедупликации для нового платежа
        _paymentCompleteInSession = false; // Для трекинга abandon
        if (window._ysSetPage) window._ysSetPage('paymentOverlay');
        if (window._ysTrack) window._ysTrack('page_view', { from: document.body.dataset.page || null, virtual: true });
        if (window._ysTrack) window._ysTrack('payment_start', { free_trial: !!freeTrialAvailable });
        
        ov.style.display = 'block';
        ov.style.visibility = 'visible';
        ov.style.pointerEvents = 'auto';
        if (tg && tg.expand) try { tg.expand(); } catch(e) {}
        
        // Сброс UI
        ov.setAttribute('data-state', 'confirm'); // всегда открываем на экране подтверждения
        setPaymentStatus('', '');
        hidePromoConfirmButton();
        showPaymentSection();
        var promoMsg0 = document.getElementById('payOvPromoMsg');
        if (promoMsg0) { promoMsg0.textContent = ''; promoMsg0.className = 'promo-msg'; }

        // Методы оплаты видны сразу (payOvMainPayBtn убран)
        var methodsBlock = document.getElementById('payOvMethodsBlock');
        if (methodsBlock) methodsBlock.style.display = 'block';

        var pi = document.getElementById('payOvPromoInput');
        if (pi) pi.value = '';
        var promoSection = document.getElementById('payOvPromoSection');
        if (promoSection) promoSection.style.display = 'block';
        var promoToggle = document.getElementById('payOvPromoToggle');
        if (promoToggle) promoToggle.style.display = '';
        // Подарок-промокод: получатель пришёл создавать СВОЮ песню по подарку → авто-подставляем
        // и применяем промокод дарителя (free_generation → песня бесплатна). Одноразово.
        // Открываем экран промокода (data-state="promo"), подставляем код и применяем.
        if (window._giftPromoCode && pi) {
          pi.value = String(window._giftPromoCode).toUpperCase();
          if (typeof _poShowPromo === 'function') _poShowPromo(true);
          try { if (typeof applyPromoCode === 'function') setTimeout(function(){ applyPromoCode(); }, 60); } catch(_) {}
          window._giftPromoCode = null;
        }

        var lr = document.getElementById('payOvLinkRow');
        if (lr) lr.style.display = 'none';
        
        var cb = document.getElementById('payOvCheckBtn');
        if (cb) cb.style.display = 'none';
        
        ov.scrollTop = 0;
        
        // Free trial блок (не показываем для расшифровки НА TG/web — там она за деньги/Stars).
        // КАНОН v4 (11.07): на VK расшифровка оплачивается ИСКРАМИ (40) — исключение снято,
        // серверная ветка mode=deep_analysis в /api/payments/iskry/pay готова.
        var freeClaimBtn = document.getElementById('payOvFreeClaimBtn');
        var hint = document.getElementById('payOvTrialHint');
        var _poVkCtx = (window._appEnv === 'vk') || window._isVkMiniApp === true
          || document.documentElement.classList.contains('is-vk');
        var isAnalysisPayment = (pendingPaymentSku === 'deep_analysis_addon') && !_poVkCtx;
        var _currentIskryBal = typeof getIskryBalance === 'function' ? getIskryBalance() : 0;
        var _neededIskry = typeof ISKRY_PRICES !== 'undefined' ? (ISKRY_PRICES[pendingPaymentSku || 'single_song'] || 100) : 100;
        // Песню Искрами открывает только тот, кто хоть раз платил (гейт на бэке:
        // /api/payments/iskry/pay → 403 errSongIskryNeedPack). Кнопку, которая упрётся
        // в отказ, не показываем — правило человек читает здесь, а не после нажатия.
        // Расшифровка (deep_analysis_addon) под гейт не попадает.
        var _poSongSku = ['single_song', 'couple_song', 'transit_energy_song'].indexOf(pendingPaymentSku || 'single_song') !== -1;
        var _poIskryNeedPack = _poSongSku && !(window._cachedProfile && window._cachedProfile.has_purchased_package);
        if (_poVkCtx) {
          // Канон v7 (§5.2.3): на VK цифровые ценности за Искры не продаются —
          // ни кнопки «Оплатить Искрами», ни подсказки про нехватку Искр. Песня
          // здесь покупается картой (vk.ru/m.vk.ru), Искры остаются для оракула.
          if (freeClaimBtn) freeClaimBtn.style.display = 'none';
          if (hint) hint.style.display = 'none';
        } else if (_poIskryNeedPack) {
          // Искры на песню пока не идут — говорим правило и куда они идут сейчас
          if (freeClaimBtn) freeClaimBtn.style.display = 'none';
          if (hint) {
            hint.style.display = '';
            var _itPack = document.getElementById('payOvTrialText');
            if (_itPack) _itPack.textContent = _tl('iskrySongNeedPack', 'Искры открывают песню после первого пакета Искр. Сейчас они идут на вопросы Оракулу и разборы.');
          }
        } else if (_currentIskryBal >= _neededIskry && !isAnalysisPayment) {
          // Достаточно Искр — показать кнопку оплаты Искрами
          if (freeClaimBtn) freeClaimBtn.style.display = '';
          if (hint) hint.style.display = '';
        } else if (_currentIskryBal > 0 && _currentIskryBal < _neededIskry && !isAnalysisPayment) {
          // Искры есть, но недостаточно — показать подсказку
          if (freeClaimBtn) freeClaimBtn.style.display = 'none';
          if (hint) {
            hint.style.display = '';
            var iskryText = document.getElementById('payOvTrialText');
            /* _tl — глобальная */
            if (iskryText) iskryText.textContent = _tl('iskryNotEnough', 'У тебя {current} Искр. Нужно ещё {needed}').replace('{current}', _currentIskryBal).replace('{needed}', _neededIskry - _currentIskryBal);
          }
        } else if (freeTrialAvailable && !isAnalysisPayment) {
          if (freeClaimBtn) freeClaimBtn.style.display = '';
          if (hint) hint.style.display = '';
        } else {
          if (freeClaimBtn) freeClaimBtn.style.display = 'none';
          // Алла 11.07 (баг Марины: 0 Искр → «нажали оплатить, ничего»): при недостатке Искр
          // НЕ прятать всё молча. Показываем ВИДИМУЮ подсказку со шортфоллом + путь к промокоду
          // (title-тултип на мобиле не виден). Только для оплаты Искрами (не расшифровка).
          if (hint && !isAnalysisPayment && _neededIskry > 0) {
            hint.style.display = '';
            var _itZero = document.getElementById('payOvTrialText');
            if (_itZero) {
              _itZero.textContent = _currentIskryBal > 0
                ? _tl('iskryNotEnough', 'У тебя {current} Искр. Нужно ещё {needed}').replace('{current}', _currentIskryBal).replace('{needed}', _neededIskry - _currentIskryBal)
                : ((window._isVkMiniApp || window._appEnv === 'vk')
                    // КАНОН v5 §6.12: на VK промокоды запрещены — текст без «введи промокод».
                    ? _tl('iskryNeedTopupVk', 'Для оплаты Искрами нужно {needed}. Пополни баланс.')
                    : _tl('iskryNeedTopup', 'Для оплаты Искрами нужно {needed}. Пополни баланс или введи промокод ниже.')).replace('{needed}', _neededIskry);
            }
          } else if (hint) {
            hint.style.display = 'none';
          }
        }
        // Batch 8.17 (7262778 Глазунова MacOS Средний): defensive disable+toast.
        // Если по какой-то причине payOvFreeClaimBtn visible при 0 Искр —
        // делаем disabled и при клике показываем явное сообщение.
        if (freeClaimBtn) {
          if ((_currentIskryBal < _neededIskry || _poIskryNeedPack) && !isAnalysisPayment) {
            freeClaimBtn.disabled = true;
            freeClaimBtn.style.opacity = '0.45';
            freeClaimBtn.style.cursor = 'not-allowed';
            freeClaimBtn.setAttribute('aria-disabled', 'true');
            freeClaimBtn.title = _poIskryNeedPack
              ? _tl('iskrySongNeedPack', 'Искры открывают песню после первого пакета Искр. Сейчас они идут на вопросы Оракулу и разборы.')
              : (_currentIskryBal === 0
                ? (_tl('iskryNoneToast', 'Нет Искр для оплаты'))
                : _tl('iskryNotEnough', 'У тебя {current} Искр. Нужно ещё {needed}').replace('{current}', _currentIskryBal).replace('{needed}', _neededIskry - _currentIskryBal));
          } else {
            freeClaimBtn.disabled = false;
            freeClaimBtn.style.opacity = '';
            freeClaimBtn.style.cursor = '';
            freeClaimBtn.removeAttribute('aria-disabled');
            freeClaimBtn.title = '';
          }
        }
        
        // Stars — только Telegram, VK Pay — только VK
        if (window._appEnv !== 'telegram') {
          var starsBtn = document.getElementById('payOvStarsBtn');
          if (starsBtn) starsBtn.style.display = 'none';
        }
        var vkPayBtn = document.getElementById('payOvVkPayBtn');
        var _povVk = _poVkCtx || document.body.classList.contains('in-vk');
        // КАНОН v4 (решение Аллы 11.07, §5.2): контент на VK продаётся ТОЛЬКО за Искры —
        // прямой продажи песен/расшифровки за голоса больше нет. Кнопка payOvVkPayBtn
        // ПЕРЕПРОФИЛИРОВАНА в «Пополнить Искры» (вход на topupPage с пакетами за голоса):
        // так CSS-якорь is-vk-pay (форс-показ) остаётся полезным, а у юзера без Искр
        // в оверлее всегда есть живой путь к покупке. dataset.vkTopup читает обработчик в 09.
        // Канон v8 (отказ 27.07): голосов нет — топап продаёт пакеты за ₽ (§5.4.1),
        // поэтому вход в него живёт только на vk.ru/m.vk.ru. Натив — без платежей.
        var _povVkVotes = _povVk && !!(window._vkPayMode && window._vkPayMode() === 'money');
        if (vkPayBtn) {
          vkPayBtn.style.display = _povVkVotes ? '' : 'none';
          // Текст кнопки живёт в разметке (data-i18n=bsTopupIskry) — applyTranslations
          // держит его при смене языка; здесь только роль (dataset.vkTopup → 09 ведёт на topup).
          if (_povVkVotes) vkPayBtn.dataset.vkTopup = '1';
          else delete vkPayBtn.dataset.vkTopup;
        }

        updatePaymentUiFromCatalog();
        if (typeof updatePaymentUpsell === 'function') updatePaymentUpsell(getCurrentSku ? getCurrentSku() : pendingPaymentSku);

        // Быстрая реактивация: если была подписка — показываем блок "Возобновить"
        var reactivateBlock = document.getElementById('payOvReactivateBlock');
        if (window._lastExpiredPlan && window._lastExpiredPlan.plan_sku) {
          var lep = window._lastExpiredPlan;
          var planKeyMap = { soul_basic_sub: 'plan_basic', soul_plus_sub: 'plan_plus', master_monthly: 'plan_master' };
          var planKey = planKeyMap[lep.plan_sku] || 'plan_basic';
          /* _tl — глобальная, определена рядом с t() */
          if (!reactivateBlock) {
            reactivateBlock = document.createElement('div');
            reactivateBlock.id = 'payOvReactivateBlock';
            reactivateBlock.className = 'pay-ov-reactivate-block';
            var cardEl = ov.querySelector('.pay-ov-card');
            if (cardEl) cardEl.insertBefore(reactivateBlock, cardEl.firstChild);
          }
          var _safePlanName = (lep.plan_name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
          var _safePlanKey = (planKey || '').replace(/[^a-zA-Z0-9_\-]/g, '');
          reactivateBlock.innerHTML = '<div class="pay-ov-reactivate-label">' + _tl('subExpiredReactivate', 'Возобновить «{planName}»').replace('{planName}', _safePlanName) + '</div>'
            + '<button type="button" class="pay-ov-reactivate-btn" data-plan-key="' + _safePlanKey + '" data-plan-name="' + _safePlanName + '">' + _tl('subReactivateBtn', 'Возобновить') + '</button>';
          var _reactBtn = reactivateBlock.querySelector('button');
          if (_reactBtn) _reactBtn.addEventListener('click', function() {
            var _pk = this.getAttribute('data-plan-key');
            var _pn = this.getAttribute('data-plan-name');
            hidePaymentOverlay();
            // VK Testers #7279937 (Тамара MacOS, ВЫСОКИЙ приоритет):
            // если paymentOverlay был открыт поверх «Пакет использован»
            // (successPage в режиме showExpiredSubscriptionScreen) — после
            // закрытия planConfirm юзер оставался на «Пакет использован» =
            // тупик. Уходим в чистый homePage перед открытием planConfirm.
            if (document.body.dataset.page === 'successPage' && typeof goToPage === 'function') {
              goToPage('homePage');
            }
            if (typeof showPlanConfirm === 'function') showPlanConfirm(_pk, _pn);
          });
          reactivateBlock.style.display = 'block';
        } else if (reactivateBlock) {
          reactivateBlock.style.display = 'none';
        }
      }
      function hidePaymentOverlay() {
        console.log('[Payment Overlay] Закрытие окна оплаты');
        // Аналитика: если оплата не завершена — это abandon
        if (!_paymentCompleteInSession && window._ysTrack) {
          window._ysTrack('payment_abandoned', { sku: pendingPaymentSku || null });
        }
        // Восстанавливаем текущую страницу для аналитики
        if (window._ysSetPage) window._ysSetPage(document.body.dataset.page || null);
        // Останавливаем polling для предотвращения утечки памяти
        paymentPollingActive = false;
        
        var ov = document.getElementById('paymentOverlay');
        if (ov) {
          ov.style.display = 'none';
          ov.style.pointerEvents = 'none';
          ov.style.visibility = 'hidden';
        }

        // Полный сброс состояния
        setPaymentStatus('', '');
        activePromo = null;
        if (pendingPaymentSku === 'deep_analysis_addon') {
          pendingPaymentSku = null;
          pendingPaymentRequestId = null;
          try { localStorage.removeItem('hot_pending_sku'); localStorage.removeItem('hot_pending_request_id'); } catch(_) {}
        }
        resetPaymentUI();

        var pi = document.getElementById('payOvPromoInput');
        if (pi) pi.value = '';

        var lr = document.getElementById('payOvLinkRow');
        if (lr) lr.style.display = 'none';

        var cb = document.getElementById('payOvCheckBtn');
        if (cb) cb.style.display = 'none';
      }
      // ── Экран успеха: сразу на successPage с кастомизацией ─────────
      function showConfirm(title, desc, opts) {
        hidePaymentOverlay();
        _setSuccessMode(true); // режим генерации: этапы + «Пока ждёшь»
        if (typeof _successResetAnim === 'function') _successResetAnim(); // новая оплата → анимация проиграется заново
        /* _tl — глобальная, определена рядом с t() */
        var stEl = document.getElementById('successTitle');
        var sdEl = document.getElementById('successDesc');
        var botBtn = document.getElementById('openBotBtn');
        var mtBtn = document.getElementById('successMyTracksBtn');
        var hintEl = document.getElementById('successHint');
        var crossSell = document.getElementById('successCrossSell');
        var newKeyBtn = document.getElementById('newKeyBtn');
        var isWeb = window._appEnv === 'web' || window._appEnv === 'vk';
        // Восстанавливаем элементы (после showTrackLimitPage они могли быть скрыты)
        if (hintEl) hintEl.style.display = '';
        if (newKeyBtn) newKeyBtn.style.display = '';
        if (crossSell) {
          crossSell.innerHTML = '<div class="success-cs-divider"></div>'
            + '<div class="success-cs-title">' + _tl('csWhileWaiting', 'Пока ждёшь песню') + '</div>'
            + '<div class="success-cs-grid">'
            + '<button type="button" class="success-cs-btn cs-purple" onclick="window.returnToPage=\'successPage\';goToPage(\'myTracksPage\');if(typeof window.loadMyTracks===\'function\')window.loadMyTracks(false)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.8)" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' + _tl('csMyTracks', 'Мои треки') + '</button>'
            + '<button type="button" class="success-cs-btn cs-green" onclick="window.returnToPage=\'successPage\';goToPage(\'soulChatPage\');if(typeof initSoulChatPage===\'function\')setTimeout(initSoulChatPage,300)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,0.8)" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' + _tl('homeChoice3', 'Чат с Оракулом') + '</button>'
            + '<button type="button" class="success-cs-btn cs-orange" onclick="if(typeof shareApp===\'function\')shareApp()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(249,115,22,0.8)" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' + _tl('csInvite', 'Пригласить') + '</button>'
            + '<button type="button" class="success-cs-btn cs-pink" id="newKeyBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(236,72,153,0.8)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>' + _tl('csNewSong', 'Ещё песню') + '</span></button>'
            + '</div>';
          crossSell.style.display = '';
        }
        // Заголовок — ТОЧНО как в эталоне showcase-success.html (innerHTML: содержит <br>).
        if (stEl) stEl.innerHTML = (typeof t === 'function' ? t('successReadyTitle') : 'Готово — твоя<br>песня рождается');
        // Analytics: song generation requested (funnel step)
        if (window._ysTrack) window._ysTrack('song_generated', { source: window._appEnv || 'telegram' });
        if (window._ysTrack) {
          var _payData = { source: window._appEnv || 'telegram', sku: pendingPaymentSku || null };
          try { var _pp = JSON.parse(localStorage.getItem('pending_payment_type') || '{}'); _payData.method = _pp.type || 'unknown'; _payData.sku = _payData.sku || _pp.sku || null; } catch(_) {}
          if (activePromo) { _payData.promo = activePromo.code; _payData.amount = activePromo.amount_after; _payData.currency = activePromo.currency; }
          window._ysTrack('payment_complete', _payData);
        }
        // Описание — ТОЧНО как в эталоне (innerHTML: содержит 🤍 и <b>). Старая ветка web/TG
        // («Перейти в бот» / whereTrack / bot-status) УДАЛЕНА: в эталоне действия — «Спросить
        // Оракула» + «Поделиться» (cta/ghost уже в разметке successPage.html), кнопки бота нет.
        if (sdEl) sdEl.innerHTML = (typeof t === 'function' ? t('successReadyLead') : 'Спасибо тебе! <b>Песня души</b> уже создаётся — появится во вкладке «Плейлист» примерно через 15 минут.');
        goToPage('successPage'); // page-show hook → _initGenStages: reveal + этапы + салют (один раз на оплату)
        // Вкус (первая песня, бесплатно) НЕ должен показывать «Оплата получена» — юзер ничего не платил (закон №1).
        // Меняем и data-i18n (чтобы applyTranslations не вернул «Оплата получена»), и текст сразу. Платные флоу opts нет → «Оплата получена».
        var _ebEl = document.querySelector('#successPage .eyebrow');
        if (_ebEl) {
          var _ebKey = (opts && opts.freeTaste) ? 'successEyebrowTaste' : 'successEyebrow';
          _ebEl.setAttribute('data-i18n', _ebKey);
          _ebEl.textContent = (typeof t === 'function' ? t(_ebKey) : ((opts && opts.freeTaste) ? 'Твоя первая песня' : 'Оплата получена'));
        }
        if (typeof showToast === 'function') showToast(title || (typeof t === 'function' ? t('paymentThanksOk') : 'Готово!'));
        // (реклама удалена — Алла 02.07: «мы не берём себе такую рекламу»)
      }

      // ── Страница "Лимит исчерпан" — с CTA для оплаты ──
      function showTrackLimitPage() {
        hidePaymentOverlay();
        _setSuccessMode(false); // режим оплаты: прячем этапы/подсказки/CTA генерации
        var stEl = document.getElementById('successTitle');
        var sdEl = document.getElementById('successDesc');
        var botBtn = document.getElementById('openBotBtn');
        var mtBtn = document.getElementById('successMyTracksBtn');
        var hintEl = document.getElementById('successHint');
        var crossSell = document.getElementById('successPayActions');
        var linksDiv = document.querySelector('#successPage .success-links');
        var newKeyBtn = document.getElementById('newKeyBtn');
        var profileBtn = document.getElementById('successToProfileBtn');

        /* _tl — глобальная, определена рядом с t() */

        // Заголовок и описание
        if (stEl) stEl.textContent = _tl('trackLimitTitle', 'Лимит исчерпан');
        if (sdEl) sdEl.innerHTML = _tl('trackLimitMsg', 'Лимит треков на этот месяц исчерпан.')
          + '<br><br><span class="success-desc-note">'
          + _tl('trackLimitHint', 'Обнови тариф или купи песню отдельно.')
          + '</span>';

        // Скрываем: "Перейти в бот", "Мои треки", "Не пришла через 20 мин?"
        if (botBtn) botBtn.style.display = 'none';
        if (mtBtn) mtBtn.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';

        // Заменяем "Пока ждёшь песню" на кнопки оплаты
        if (crossSell) {
          var iskryBal = typeof getIskryBalance === 'function' ? getIskryBalance() : 0;
          var iskryText = iskryBal >= 100
            ? '<button type="button" class="success-cs-btn" onclick="showTrackLimitPaySingle(\'iskry\')" style="background:linear-gradient(135deg,rgba(236,72,153,0.15),rgba(167,139,250,0.15));border-color:rgba(236,72,153,0.3);">' + _tl('trackLimitPayIskry', 'Оплатить Искрами') + ' (' + iskryBal + ')</button>'
            : '';
          // Upgrade button — primary CTA, dynamic text based on current plan
          var upgradeBtn = '';
          var currentTariff = window.userTariff || 'basic';
          if (currentTariff === 'basic') {
            upgradeBtn = '<button type="button" class="success-cs-btn" onclick="if(typeof showPlanConfirm===\'function\')showPlanConfirm(\'plan_plus\',\'Глубина\')" style="background:linear-gradient(135deg,rgba(var(--primary-rgb),0.2),rgba(var(--secondary-rgb),0.15));border-color:rgba(var(--primary-rgb),0.35);font-weight:600;">' + _tl('trackLimitUpgradeToPlus', 'Перейти на Глубина — 15 треков') + '</button>';
          } else if (currentTariff === 'plus') {
            upgradeBtn = '<button type="button" class="success-cs-btn" onclick="if(typeof showPlanConfirm===\'function\')showPlanConfirm(\'plan_master\',\'Лаборатория\')" style="background:linear-gradient(135deg,rgba(var(--primary-rgb),0.2),rgba(var(--secondary-rgb),0.15));border-color:rgba(var(--primary-rgb),0.35);font-weight:600;">' + _tl('trackLimitUpgradeToMaster', 'Перейти на Лаборатория — 30 треков') + '</button>';
          }
          // master — no upgrade button (highest plan)

          crossSell.innerHTML = '<div class="success-cs-divider"></div>'
            + '<div class="success-cs-title">' + _tl('trackLimitActionsTitle', 'Что дальше?') + '</div>'
            + upgradeBtn
            + '<button type="button" class="success-cs-btn" onclick="showTrackLimitPaySingle()" style="background:linear-gradient(135deg,rgba(130,100,230,0.15),rgba(180,120,255,0.1));border-color:rgba(130,100,230,0.3);">' + _tl('trackLimitBuySingle', 'Купить одну песню') + '</button>'
            + iskryText;
          crossSell.style.display = '';
        }

        // Нижние ссылки: убираем "Создать ещё одну песню", оставляем "В профиль"
        if (newKeyBtn) newKeyBtn.style.display = 'none';
        if (profileBtn) profileBtn.textContent = _tl('trackLimitBackToProfile', 'Вернуться в профиль');

        goToPage('successPage');
      }

      // Обработчик покупки одной песни со страницы лимита.
      // VK Testers 7276466 (Семенцов Windows): прежняя версия отправляла юзера на форму
      // с подсказкой «Заполни и отправь» — юзер уже заполнил, видел это как ошибку.
      // Реальный фикс: если у юзера есть pendingPaymentRequestId (last submitted request),
      // открываем payment overlay напрямую с sku=single_song. Иначе fallback на форму.
      function showTrackLimitPaySingle(method) {
        try {
          // Попытка 1: если есть last request_id — открываем payment overlay напрямую
          var lastReqId = window.pendingPaymentRequestId || localStorage.getItem('yup_last_request_id') || '';
          if (lastReqId) {
            pendingPaymentRequestId = lastReqId;
            pendingPaymentSku = 'single_song';
            window._mtSkipPaymentReturnOnce = Date.now(); // guard
            if (typeof showPaymentOverlay === 'function') {
              showPaymentOverlay();
              return;
            }
          }
        } catch(_) {}
        // Fallback: возвращаем на форму с подсказкой
        goToPage('formPage');
        // §5.4.1: на VK (любой клиент) не показываем подсказку про «экран оплаты»
        if (window._isVkMiniApp || window._appEnv === 'vk') return;
        var hint = typeof t === 'function' ? (t('trackLimitResubmitHint') || 'Заполни форму и отправь — откроется экран оплаты.') : 'Заполни форму и отправь — откроется экран оплаты.';
        if (typeof showToast === 'function') showToast(hint);
      }
      window.showTrackLimitPaySingle = showTrackLimitPaySingle;

      // ── Страница "Пакет использован" — с CTA для реактивации ──
      function showExpiredSubscriptionScreen(lastSub) {
        hidePaymentOverlay();
        _setSuccessMode(false); // режим оплаты: прячем этапы/подсказки/CTA генерации
        var stEl = document.getElementById('successTitle');
        var sdEl = document.getElementById('successDesc');
        var botBtn = document.getElementById('openBotBtn');
        var mtBtn = document.getElementById('successMyTracksBtn');
        var hintEl = document.getElementById('successHint');
        var crossSell = document.getElementById('successPayActions');
        var newKeyBtn = document.getElementById('newKeyBtn');
        var profileBtn = document.getElementById('successToProfileBtn');

        /* _tl — глобальная, определена рядом с t() */

        // Map plan_sku → plan_key and display name
        var skuMap = {
          soul_basic_sub: { key: 'plan_basic', name: 'Душа', nameKey: 'planBasicName' },
          soul_plus_sub: { key: 'plan_plus', name: 'Глубина', nameKey: 'planPlusName' },
          master_monthly: { key: 'plan_master', name: 'Лаборатория', nameKey: 'planMasterNameText' }
        };
        var planSku = lastSub.plan_sku || '';
        var mapped = skuMap[planSku] || { key: 'plan_basic', name: planSku };
        var planKey = mapped.key;
        // VK Testers 7276767 (Семенцов Windows EN): название тарифа на русском в модале
        // «Пакет использован». Использует i18n key из nameKey если он определён.
        var planName = mapped.name;
        if (mapped.nameKey && typeof t === 'function') {
          var localizedName = t(mapped.nameKey);
          if (localizedName && localizedName !== mapped.nameKey) planName = localizedName;
        }

        // Format expiry date
        var expiryStr = '';
        if (lastSub.expires_at) {
          try {
            var lang = (window._currentLang || 'ru');
            expiryStr = new Date(lastSub.expires_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
          } catch (e) { expiryStr = lastSub.expires_at; }
        }

        // Title and description
        if (stEl) stEl.textContent = _tl('subExpiredTitle', 'Пакет использован');
        var msgFallback = 'Твой план \u00AB' + planName + '\u00BB завершился ' + expiryStr;
        var msgText = _tl('subExpiredMsg', msgFallback);
        msgText = msgText.replace('{planName}', planName).replace('{date}', expiryStr);
        if (sdEl) sdEl.innerHTML = msgText;

        // Hide default buttons
        if (botBtn) botBtn.style.display = 'none';
        if (mtBtn) mtBtn.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';

        // CTA buttons
        if (crossSell) {
          var iskryBal = typeof getIskryBalance === 'function' ? getIskryBalance() : 0;
          var reactivateLabel = _tl('subExpiredReactivate', 'Возобновить «{planName}»').replace('{planName}', planName);
          var singleLabel = _tl('subExpiredOrSingle', 'Купить одну песню');
          var html = '<div class="success-cs-divider"></div>'
            + '<button type="button" class="success-cs-btn" onclick="showPlanConfirm(\'' + planKey + '\', \'' + planName + '\')" style="background:linear-gradient(135deg,rgba(var(--primary-rgb),0.2),rgba(var(--secondary-rgb),0.15));border-color:rgba(var(--primary-rgb),0.35);font-weight:600;">' + reactivateLabel + '</button>'
            + '<button type="button" class="success-cs-btn" onclick="showTrackLimitPaySingle()" style="background:linear-gradient(135deg,rgba(130,100,230,0.15),rgba(180,120,255,0.1));border-color:rgba(130,100,230,0.3);">' + singleLabel + '</button>';
          if (iskryBal >= 100) {
            html += '<button type="button" class="success-cs-btn" onclick="showTrackLimitPaySingle(\'iskry\')" style="background:linear-gradient(135deg,rgba(236,72,153,0.15),rgba(167,139,250,0.15));border-color:rgba(236,72,153,0.3);">' + _tl('trackLimitPayIskry', 'Оплатить Искрами') + ' (' + iskryBal + ')</button>';
          }
          crossSell.innerHTML = html;
          crossSell.style.display = '';
        }

        if (newKeyBtn) newKeyBtn.style.display = 'none';
        if (profileBtn) profileBtn.textContent = _tl('trackLimitBackToProfile', 'Вернуться в профиль');

        goToPage('successPage');
      }
      window.showExpiredSubscriptionScreen = showExpiredSubscriptionScreen;

      // Экраны «Заявка принята» — фиксированный оверлей, всегда виден поверх всего
      var _confirmAutoTimer = null;
      function showConfirmOverlay(title, desc, onDone) {
        hidePaymentOverlay();
        var ov = document.getElementById('confirmOverlay');
        if (!ov) { if (onDone) onDone(); return; }
        var tEl = document.getElementById('confirmTitle');
        var dEl = document.getElementById('confirmDesc');
        if (tEl) tEl.textContent = title || (typeof t === 'function' ? t('confirmTitle') : 'Заявка принята!');
        var isWeb = window._appEnv === 'web';
        var _tl = function(k, fb) { return typeof t === 'function' ? t(k) : fb; };
        var defaultDesc = _tl('confirmDesc1', 'Анализирую твои данные и создаю уникальную песню.') + '<br><br>' + (isWeb
          ? _tl('confirmDesc2Web', 'Песня появится в разделе «Мои треки». Можешь закрыть приложение — ничего не пропадёт.')
          : _tl('confirmDesc2Bot', 'Песня придёт в этот чат. Можешь закрыть приложение — ничего не пропадёт.'));
        if (dEl) dEl.innerHTML = desc || defaultDesc;
        ov.style.display = 'block';
        // Только ручной клик — без авто-скрытия
        var btn = document.getElementById('confirmContinueBtn');
        if (btn) {
          btn.onclick = function() { if (onDone) onDone(); hideConfirmOverlay(); };
        }
      }
      function hideConfirmOverlay() {
        if (_confirmAutoTimer) { clearTimeout(_confirmAutoTimer); _confirmAutoTimer = null; }
        var ov = document.getElementById('confirmOverlay');
        if (ov) ov.style.display = 'none';
        var btn = document.getElementById('confirmContinueBtn');
        if (btn) btn.onclick = null;
      }
      // Ранний опт-ин ежедневного Оракула — даём повод вернуться (удержание → каталог VK).
      // Вызывается с экрана «Заявка принята» по «Да, присылай». One-tap: дефолтные темы +
      // 3-дневный триал. На VK заодно просим разрешение писать (доставка через сообщество).
      function _oracleOptinSubscribe() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase) return;
        if (window._isVkMiniApp && window.vkBridge) {
          try { vkBridge.send('VKWebAppAllowMessagesFromGroup', { group_id: 237303283 }).then(function(r){ if (window._vkSaveNotifyConsent) window._vkSaveNotifyConsent(r); }).catch(function(){}); } catch(_) {}
        }
        var tz = 'Europe/Moscow';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch(_) {}
        var sendH = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
        try {
          fetchWithTimeout(apiBase + '/api/daily-oracle/onboarding', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, sendH),
            body: JSON.stringify({ topics: ['relationships', 'growth', 'purpose'], delivery_time: '08:00', timezone: tz, channel: 'both' })
          }, 20000).then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(function(j){
            if (j && j.success) {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('oracleOptinDone') || 'Готово — загляну утром.') : 'Готово — загляну утром.');
              if (window._ysTrack) { try { window._ysTrack('oracle_optin_yes', { src: 'post_song' }); } catch(_) {} }
            }
            // Закон №37: на провал — тихо, без error-текста (юзер не виноват).
          }).catch(function(e){ console.warn('[OracleOptin]', e && e.message); });
        } catch (e) { console.warn('[OracleOptin]', e && e.message); }
      }
      // Показ опт-ина Оракула на экране доставки (successPage). 1 раз на устройство.
      // Анимированные стадии генерации на successPage (Цепочка 3, симуляция по таймеру).
      // Каждые ~7с следующая стадия становится active; последняя остаётся крутиться
      // («Составляю звуковую композицию») — реальная генерация ~10-15 мин.
      // Переключение successPage: режим генерации (этапы + «Пока ждёшь») ↔ режим оплаты (лимит/пакет).
      function _setSuccessMode(gen) {
        // .steps/.cta/.ghost имеют display:...!important в CSS — обычный inline их не перебьёт,
        // поэтому в режиме оплаты прячем через setProperty(...,'important'), а в режиме генерации
        // снимаем inline (removeProperty) — элемент возвращается к своему CSS-значению.
        ['successMakingBlock','steps','suggest','successShareBtn'].forEach(function(id){
          var el = document.getElementById(id); if (!el) return;
          if (gen) el.style.removeProperty('display');
          else el.style.setProperty('display', 'none', 'important');
        });
        var pay = document.getElementById('successPayActions');
        if (pay) { if (gen) pay.style.setProperty('display', 'none', 'important'); else pay.style.removeProperty('display'); }
      }
      window._setSuccessMode = _setSuccessMode;
      // Золотое конфетти-салют как в эталоне showcase-success.html (DOM-частицы .cf в #cfLayer).
      // CSS (.cf/.confetti-layer/@keyframes sck_fall) уже в index.template.html.
      function _successSalute() {
        var layer = document.getElementById('cfLayer');
        if (!layer) return;
        var cols = ['#f7cf7a', '#f3d9a0', '#e8b96a', '#fff0c2', '#f7b6d6', '#cda9f5'];
        function shoot(n) {
          for (var i = 0; i < n; i++) {
            var c = document.createElement('span'); c.className = 'cf';
            c.style.left = Math.random() * 100 + '%';
            c.style.background = cols[i % cols.length];
            c.style.setProperty('--dur', (2.2 + Math.random() * 1.8) + 's');
            c.style.setProperty('--del', (Math.random() * 0.6) + 's');
            c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
            if (Math.random() < 0.45) c.style.borderRadius = '50%';
            if (Math.random() < 0.3) { c.style.width = '3px'; c.style.height = '3px'; c.style.borderRadius = '50%'; }
            if (!c.style.height) c.style.height = (9 + Math.random() * 6) + 'px';
            layer.appendChild(c);
            requestAnimationFrame((function (el) { return function () { el.classList.add('go'); }; })(c));
            setTimeout((function (el) { return function () { el.remove(); }; })(c), 4600);
          }
        }
        shoot(46); setTimeout(function () { shoot(24); }, 500);
      }
      window._successSalute = _successSalute;
      // Сброс анимации ПЕРЕД новой оплатой (вызывается из showConfirm) — reveal/этапы/салют
      // проиграются заново. При возврате «назад» reset НЕ вызывается → анимация не перезапускается.
      function _successResetAnim() {
        window._successAnimated = false;
        if (window._genStagesInt) { clearInterval(window._genStagesInt); window._genStagesInt = null; }
        [].slice.call(document.querySelectorAll('#successPage .rv')).forEach(function(el){ el.classList.remove('in'); });
        [].slice.call(document.querySelectorAll('#successPage [data-step]')).forEach(function(s){ s.classList.remove('done','active','future'); });
        var sb = document.getElementById('steps'); if (sb) sb.style.removeProperty('display'); // вернуть этапы (после прошлой оплаты были скрыты)
        var sg = document.getElementById('suggest'); if (sg) sg.classList.remove('show');
        var cf = document.getElementById('cfLayer'); if (cf) cf.innerHTML = '';
        // вернуть блок «идёт работа», скрыть финал/кнопку оповещения (для новой оплаты)
        var mw = document.getElementById('successMakingWork'); if (mw) mw.style.removeProperty('display');
        var mr = document.getElementById('successMakingReady'); if (mr) mr.style.setProperty('display', 'none', 'important');
        var nb0 = document.getElementById('successNotifyVkBtn'); if (nb0) { nb0.classList.remove('done'); nb0.disabled = false; nb0.style.setProperty('display', 'none', 'important'); var nl0 = nb0.querySelector('[data-i18n]'); if (nl0 && typeof t === 'function') nl0.textContent = t('successNotifyBtn'); }
      }
      window._successResetAnim = _successResetAnim;
      // Финал: скрыть «идёт работа», показать «песня в пути» + (только на VK) кнопку оповещения.
      function _successShowReady() {
        var mw = document.getElementById('successMakingWork'); if (mw) mw.style.setProperty('display', 'none', 'important');
        var mr = document.getElementById('successMakingReady'); if (mr) mr.style.setProperty('display', 'block', 'important');
        var nb = document.getElementById('successNotifyVkBtn');
        if (nb) { if (window._isVkMiniApp) nb.style.setProperty('display', 'flex', 'important'); else nb.style.setProperty('display', 'none', 'important'); }
      }
      window._successShowReady = _successShowReady;
      // VK: запрос разрешения сообщений сообщества → воркер сам пришлёт «песня готова»
      // (notifyVkSongReady в workerSoundKey.js УЖЕ вызывается по готовности). group_id = 237303283.
      function _successNotifyVk() {
        if (!(window._isVkMiniApp && window.vkBridge)) return;
        var nb = document.getElementById('successNotifyVkBtn');
        try {
          vkBridge.send('VKWebAppAllowMessagesFromGroup', { group_id: 237303283 })
            .then(function(){
              if (nb) { nb.classList.add('done'); nb.disabled = true; var nl = nb.querySelector('[data-i18n]'); if (nl) nl.textContent = (typeof t === 'function' ? t('successNotifyDone') : 'Уведомим в VK ✓'); }
              try { localStorage.setItem('ys_vk_notify_song', '1'); } catch(_) {}
              if (window._vkSaveNotifyConsent) window._vkSaveNotifyConsent();   // записываем согласие в профиль
            })
            .catch(function(){ /* отказал — тихо, без ошибок в UI (закон №37) */ });
        } catch(_) {}
      }
      window._successNotifyVk = _successNotifyVk;
      // Анимация экрана «Готово»: поэтапный reveal (.rv→.in) + этапы генерации (1.4с) + салют.
      // ЗАПУСКАЕТСЯ ОДИН РАЗ на оплату (guard window._successAnimated). При возврате «назад»
      // показываем финальное состояние БЕЗ повторного проигрывания (баг на проде — Алла 01.07).
      function _initGenStages() {
        var box = document.getElementById('steps');
        if (!box) return;
        var _pay = document.getElementById('successPayActions');
        if (_pay && getComputedStyle(_pay).display !== 'none') return; // режим оплаты (лимит/пакет) — не анимируем
        var st = [].slice.call(box.querySelectorAll('[data-step]'));
        if (!st.length) return;
        // Без слов третий этап — не «Подбираю нужные слова»: слов в этой песне не будет
        try {
          var _lm = sessionStorage.getItem('yup_last_lyrics_mode') || '';
          if (_lm === 'instrumental') {
            var _s3 = box.querySelector('[data-i18n="genStage3"]');
            if (_s3) {
              _s3.setAttribute('data-i18n', 'genStage3NoLyrics');
              _s3.textContent = (typeof t === 'function' && t('genStage3NoLyrics')) || 'Ищу твоё звучание';
            }
          }
        } catch (_) {}
        var suggest = document.getElementById('suggest');
        var rvEls = [].slice.call(document.querySelectorAll('#successPage .rv'));
        // Уже анимировали для этой оплаты → просто финальное состояние (это возврат «назад»)
        if (window._successAnimated) {
          // возврат «назад»: этапы уже пройдены → скрыты, на их месте карточки (финальное состояние)
          rvEls.forEach(function(el){ el.classList.add('in'); });
          st.forEach(function(s){ s.classList.remove('active','future'); s.classList.add('done'); });
          box.style.setProperty('display', 'none', 'important');
          if (suggest) suggest.classList.add('show');
          _successShowReady();
          if (window._genStagesInt) { clearInterval(window._genStagesInt); window._genStagesInt = null; }
          return;
        }
        window._successAnimated = true;
        if (window._genStagesInt) { clearInterval(window._genStagesInt); }
        var wrap = document.querySelector('#successPage .wrap');
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
        var cur = 0;
        function rs() { st.forEach(function(s, i) { s.classList.remove('done','active','future'); s.classList.add(i < cur ? 'done' : (i === cur ? 'active' : 'future')); }); }
        function softScroll() { if (!wrap || wrap.scrollHeight - wrap.clientHeight < 8) return; setTimeout(function(){ try { wrap.scrollTo({ top: wrap.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); } catch(e) { wrap.scrollTop = wrap.scrollHeight; } }, 60); }
        function runSteps() {
          rs();
          window._genStagesInt = setInterval(function(){
            cur++;
            if (cur >= st.length) {
              clearInterval(window._genStagesInt); window._genStagesInt = null;
              st.forEach(function(s){ s.classList.remove('active','future'); s.classList.add('done'); });
              // Все этапы пройдены → плавно скрываем этапы и на их место показываем «Пока ждёшь»
              // (иначе слишком много контента + скролл — Алла 01.07). Пауза = увидеть последнюю галочку.
              setTimeout(function(){
                if (!window._successAnimated) return; // сброшено новой оплатой
                box.classList.remove('in'); // fade-out через .rv transition
                setTimeout(function(){
                  if (!window._successAnimated) return;
                  box.style.setProperty('display', 'none', 'important');
                  _successShowReady();
                  if (suggest) { suggest.classList.add('show'); requestAnimationFrame(softScroll); }
                }, 450);
              }, 650);
            } else { rs(); }
          }, 1400);
        }
        if (reduce) {
          rvEls.forEach(function(el){ el.classList.add('in'); });
          st.forEach(function(s){ s.classList.add('done'); });
          box.style.setProperty('display', 'none', 'important'); // reduce-motion: сразу карточки вместо этапов
          _successShowReady();
          if (suggest) suggest.classList.add('show');
          _successSalute();
        } else {
          var t = 120;
          rvEls.forEach(function(el){ setTimeout(function(){ el.classList.add('in'); }, t); t += el.classList.contains('step') ? 0 : 230; });
          setTimeout(_successSalute, 220);
          setTimeout(runSteps, t + 250);
        }
      }
      function _initOracleOptin() {
        var card = document.getElementById('oracleOptinCard');
        if (!card) return;
        var seen = false; try { seen = !!localStorage.getItem('ys_oracle_optin_seen'); } catch(_) {}
        if (seen) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        var yes = document.getElementById('oracleOptinYesBtn');
        var no = document.getElementById('oracleOptinNoBtn');
        if (yes) yes.onclick = function() {
          try { localStorage.setItem('ys_oracle_optin_seen', '1'); } catch(_) {}
          _oracleOptinSubscribe();
          card.style.display = 'none';
        };
        if (no) no.onclick = function() {
          try { localStorage.setItem('ys_oracle_optin_seen', '1'); } catch(_) {}
          if (window._ysTrack) { try { window._ysTrack('oracle_optin_no', { src: 'success' }); } catch(_) {} }
          card.style.display = 'none';
        };
      }
      var _toastTimer = null;
      function showLabUpgradeHint() {
        // Убираем предыдущий если есть
        var prev = document.getElementById('labUpgradeHint');
        if (prev) prev.remove();
        var overlay = document.createElement('div');
        overlay.id = 'labUpgradeHint';
        overlay.className = 'lab-hint-overlay';
        var card = document.createElement('div');
        card.className = 'lab-hint-card';
        var _lhTitle = typeof t === 'function' ? t('labHintTitle') : 'Лаборатория';
        var _lhDesc = typeof t === 'function' ? t('labHintDesc') : 'Сохраняй карточки близких и выбирай их одним тапом — не нужно вводить данные каждый раз';
        var _lhGo = typeof t === 'function' ? t('labHintGo') : 'Узнать больше';
        var _lhLater = typeof t === 'function' ? t('labHintLater') : 'Позже';
        card.innerHTML = '<div class="lab-hint-icon"></div>'
          + '<div class="lab-hint-title">' + _lhTitle + '</div>'
          + '<div class="lab-hint-desc">' + _lhDesc + '</div>'
          + '<div class="lab-hint-actions">'
          + '<button id="labHintGo" class="lab-hint-btn lab-hint-btn-primary">' + _lhGo + '</button>'
          + '<button id="labHintClose" class="lab-hint-btn lab-hint-btn-secondary">' + _lhLater + '</button>'
          + '</div>';
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) { overlay.remove(); }
        });
        document.getElementById('labHintClose').addEventListener('click', function() { overlay.remove(); });
        document.getElementById('labHintGo').addEventListener('click', function() {
          overlay.remove();
          goToPage('profilePage');
          setTimeout(function() {
            var masterCard = document.getElementById('planCardMaster');
            if (masterCard) masterCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else {
              var plansGrid = document.querySelector('.profile-plans-grid');
              if (plansGrid) plansGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        });
      }

      // ── Баннер предупреждения об истечении подписки ──
      // 18.05.2026 Алла: «что за управление в интерфейсе? такого быть не должно
      // ни в коем случае!» — баннер с кнопкой «Управление» в верхней части
      // приложения отключён полностью. Существующий баннер скрывается, новых
      // не создаём. Уведомления об истечении подписки — только в профиле.
      function showSubExpiryBannerIfNeeded() {
        var existing = document.getElementById('subExpiryBanner');
        if (existing) { existing.style.display = 'none'; existing.remove(); }
        return;
      }

      function showToast(message) {
        var el = document.getElementById('scToast');
        if (!el) return;
        if (_toastTimer) clearTimeout(_toastTimer);
        el.textContent = message || '';
        el.style.display = 'block';
        _toastTimer = setTimeout(function() { el.style.display = 'none'; _toastTimer = null; }, 3000);
      }
      window.showToast = showToast;

      // Batch 9.15 (отчёт Тимури Гонгадзе): VK OAuth fail → backend редиректил
      // на /app?auth_error=vk_token_fail&detail=... — frontend никак не
      // обрабатывал. Юзер видел главный экран в неавторизованном состоянии
      // + URL с ?auth_error= = выглядело как «Ошибка загрузки».
      // Теперь — показываем понятный toast и очищаем URL.
      (function handleAuthError() {
        try {
          var qs = (location && location.search) || '';
          if (!qs || qs.indexOf('auth_error=') === -1) return;
          var params = new URLSearchParams(qs.charAt(0) === '?' ? qs.slice(1) : qs);
          var code = params.get('auth_error');
          if (!code) return;
          var _t = typeof t === 'function' ? t : function(k, fb) { return fb || k; };
          var msgMap = {
            vk_no_code: _t('authErrVkNoCode', 'Не удалось войти через VK. Попробуй ещё раз.'),
            vk_token_fail: _t('authErrVkTokenFail', 'VK не подтвердил вход. Попробуй ещё раз через минуту.'),
            vk_user_fail: _t('authErrVkUserFail', 'VK вернул неполный профиль. Попробуй ещё раз.'),
            vk_create_fail: _t('authErrVkCreateFail', 'Не удалось создать аккаунт. Напиши в поддержку, если ошибка повторяется.'),
            vk_jwt_fail: _t('authErrVkJwtFail', 'Сессия не создалась. Попробуй ещё раз.'),
          };
          var msg = msgMap[code] || _t('authErrGeneric', 'Не удалось войти. Попробуй ещё раз.');
          // Очищаем auth_error из URL — иначе при reload юзер снова увидит сообщение
          try {
            params.delete('auth_error');
            params.delete('detail');
            var newQs = params.toString();
            var newUrl = location.pathname + (newQs ? ('?' + newQs) : '') + (location.hash || '');
            history.replaceState(null, '', newUrl);
          } catch(_) {}
          // Откладываем toast — нужно дождаться рендера scToast (DOM ready)
          var trySend = function(attempts) {
            if (attempts <= 0) { try { alert(msg); } catch(_) {} return; }
            if (typeof window.showToast === 'function' && document.getElementById('scToast')) {
              window.showToast(msg);
            } else {
              setTimeout(function() { trySend(attempts - 1); }, 200);
            }
          };
          trySend(20);
        } catch(e) { console.warn('[handleAuthError]', e && e.message); }
      })();
      function setPaymentStatus(text, tone) {
        var el = document.getElementById('payOvStatus');
        if (!el) return;
        if (!text) { el.style.display = 'none'; el.classList.remove('error','ok','warn'); return; }
        el.style.display = 'block';
        el.textContent = text;
        // VK Testers 7264304 ПЕРЕОТКРЫТ-2 (Семенцов Windows, 15.05.2026): мой Batch 10.53
        // фикс был для #planPromoStatus (страница ПОДПИСКИ), но Семенцов жалуется на
        // страницу оплаты ПЕРСОНАЛЬНОЙ ПЕСНИ — другой контейнер #payOvStatus.
        // Root cause: setPaymentStatus ставил color через inline-style БЕЗ !important,
        // а CSS rule `#paymentOverlay #payOvStatus { color: rgba(255,255,255,0.75) !important }`
        // (стр. 8349-8358) ПЕРЕБИВАЛ inline color. На светлой теме текст оставался серым
        // (0.75 alpha) на бежевом фоне → бледный, нечитаемый.
        // Фикс: используем classList + CSS rules .error/.ok/.warn (уже есть в 10082-10095).
        el.classList.remove('error','ok','warn');
        // Сбрасываем inline-стили — CSS-rules возьмут на себя цвет/фон/бордер через class
        el.style.color = '';
        el.style.border = '';
        el.style.background = '';
        if (tone === 'error') el.classList.add('error');
        else if (tone === 'ok') el.classList.add('ok');
        else if (tone === 'warn') el.classList.add('warn');
      }
      async function claimSubscriptionSafe(apiBase, initData, requestId) {
        if (!apiBase || !requestId || !hasAuth()) return { skipped: true, reason: 'missing_args' };
        if (subscriptionClaimInFlight) return { skipped: true, reason: 'in_flight' };
        subscriptionClaimInFlight = true;
        var id = initData || getInitData();
        var claimH = getAuthHeaders();
        try {
          var claimResp = await fetch(apiBase + '/api/subscription/claim', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, claimH),
            body: JSON.stringify({ request_id: requestId, initData: id })
          });
          var claimJson = await claimResp.json().catch(function(){ return {}; });
          return { skipped: false, ok: !!(claimJson && claimJson.success), status: claimResp.status, json: claimJson };
        } finally {
          subscriptionClaimInFlight = false;
        }
      }
      // DEFAULT_PRICES — fallback на случай если каталог с сервера не загрузится.
      // Цены в рублях (₽), синхронизированы с PLAN_RUB_FALLBACK / priceMap в bot/index.js.
      // Раньше тут были USD цены ('5.99 USDT' и т.д.) — модератор VK мог увидеть
      // долларовые цены до ответа сервера = причина отказа.
      var DEFAULT_PRICES = {
        single_song: { title: 'Твоя персональная песня', price: '490', currency: '₽' },
        couple_song: { title: 'Песня для двоих', price: '890', currency: '₽' },
        transit_energy_song: { title: 'Энергия твоего дня', price: '590', currency: '₽' },
        deep_analysis_addon: { title: 'Глубокая расшифровка', price: '290', currency: '₽' }
      };
      function updatePaymentUiFromCatalog() {
        try {
          var sku = getCurrentSku();
          var item = pricingCatalog.find(function(x) { return x && x.sku === sku; }) || DEFAULT_PRICES[sku] || null;

          var priceLabel = document.getElementById('priceLabel');
          var priceValue = document.getElementById('priceValue');
          var priceHint = document.getElementById('priceHint');
          var notice = document.getElementById('pricingNotice');

          // Если каталог пришёл с сервера и цена в USDT — подменяем на рубли через _tbankPrices.
          // (бэкенд хранит цены в долларах в каталоге, но платёж идёт в рублях через priceMap).
          // Fallback цепочка: _tbankPrices → DEFAULT_PRICES → '490 ₽' литерал.
          // ВАЖНО: USDT/USD/$ НЕ должно протекать в UI — VK §3.1.2 и §5.4 требуют рубли.
          var displayPrice = item ? String(item.price || '') : '';
          var displayCurrency = item ? (item.currency || '₽') : '₽';
          if (displayCurrency === 'USDT' || displayCurrency === 'USD' || displayCurrency === '$') {
            var rubFromTbank = (_tbankPrices && _tbankPrices[sku]) || null;
            if (rubFromTbank) {
              displayPrice = String(rubFromTbank);
              displayCurrency = '₽';
            } else if (DEFAULT_PRICES[sku]) {
              // _tbankPrices ещё не загрузился — используем фиксированный рублёвый fallback
              displayPrice = DEFAULT_PRICES[sku].price;
              displayCurrency = DEFAULT_PRICES[sku].currency;
            } else {
              // Полный fallback — никогда не показываем USDT в UI
              displayPrice = '490';
              displayCurrency = '₽';
            }
          }

          if (priceLabel) priceLabel.textContent = item ? (item.title || sku) : sku;
          if (priceValue) {
            if (activePromo) {
              priceValue.textContent = String(activePromo.amount_after) + ' ' + (displayCurrency || activePromo.currency || '₽');
            } else {
              priceValue.textContent = item ? (displayPrice + ' ' + displayCurrency) : '—';
            }
          }
          if (priceHint) {
            if (activePromo) {
              priceHint.textContent = t('promoAppliedHint', { code: activePromo.code, amount: activePromo.discount_amount, currency: activePromo.currency || displayCurrency || '₽' });
            } else {
              priceHint.textContent = '';
            }
          }
          if (notice) {
            if (catalogLoadError) {
              notice.textContent = t('catalogLoadFailed');
              notice.style.borderColor = 'rgba(var(--primary-rgb),.4)';
              notice.style.background = 'rgba(var(--primary-rgb),.12)';
              notice.style.color = 'rgba(255,255,255,.95)';
            } else if (hasSubscriptionActive) {
              notice.textContent = t('subscriptionActive');
              notice.style.borderColor = 'rgba(16,185,129,.4)';
              notice.style.background = 'rgba(16,185,129,.12)';
              notice.style.color = 'rgba(255,255,255,.95)';
            } else if (freeTrialAvailable) {
              notice.textContent = t('firstFree');
              notice.style.borderColor = 'rgba(var(--primary-rgb),.4)';
              notice.style.background = 'rgba(var(--primary-rgb),.12)';
              notice.style.color = 'rgba(255,255,255,.95)';
            } else {
              notice.textContent = t('paymentRequired');
              notice.style.borderColor = 'rgba(var(--primary-rgb),.35)';
              notice.style.background = 'rgba(var(--primary-rgb),.1)';
              notice.style.color = 'rgba(255,255,255,.95)';
            }
          }
          // Обновляем цену в overlay (новый элемент payOvPriceDisplay)
          var priceDisplay = document.getElementById('payOvPriceDisplay');
          var priceHintOv = document.getElementById('payOvPriceHint');
          if (priceDisplay) {
            // КАНОН v5 (22.07): на VK контент оплачивается ИСКРАМИ — цена в Искрах
            // (100 песни / 40 расшифровка); Искры пополняются за ₽ на vk.ru/m.vk.ru.
            // На stub (натив/планшет/неизвестно) — пусто.
            var _pdVkAny = (document.body.classList.contains('in-vk') || document.documentElement.classList.contains('is-vk'));
            var _pdVkStub = _pdVkAny && !(window._vkPayMode && window._vkPayMode() === 'money')
              && !document.documentElement.classList.contains('is-vk-pay');
            if (_pdVkStub) {
              priceDisplay.textContent = '';
            } else if (_pdVkAny) {
              var _pdSku = sku || (typeof getCurrentSku === 'function' ? getCurrentSku() : '');
              var _pdIskry = (typeof ISKRY_PRICES !== 'undefined' && ISKRY_PRICES[_pdSku]) || 100;
              var _pdIu = (typeof window.iskryPlural === 'function') ? window.iskryPlural(_pdIskry) : ((typeof t === 'function' ? t('iskryUnit') : '') || 'Искр');
              priceDisplay.textContent = _pdIskry + ' ' + _pdIu;
            } else if (activePromo) {
              priceDisplay.textContent = String(activePromo.amount_after) + ' ' + (displayCurrency || activePromo.currency || '₽');
            } else {
              priceDisplay.textContent = item ? (displayPrice + ' ' + displayCurrency) : '490 ₽';
            }
          }
          if (priceHintOv) {
            if (activePromo && Number(activePromo.amount_after) > 0) {
              priceHintOv.textContent = '💚 ' + t('bsDiscount') + ': ' + activePromo.discount_amount + ' ' + (activePromo.currency || displayCurrency || '₽');
            } else {
              priceHintOv.textContent = '';
            }
          }
          // Обновляем кнопку карты с рублёвой ценой (НЕ на VK — канон v3: карта/₽ нигде на VK)
          var cardPayBtn = document.getElementById('payOvCardBtn');
          if (cardPayBtn && _tbankAvailable && _tbankPrices && !_pdVkAny) {
            var skuNow = sku || getCurrentSku();
            var rubPrice = _tbankPrices[skuNow];
            if (rubPrice) {
              cardPayBtn.innerHTML = t('bsPayCard') + ' — <span class="rub-accent">' + rubPrice + ' ₽</span>';
            } else {
              cardPayBtn.textContent = typeof t === 'function' ? t('payOvCardBtn') : 'Оплатить картой';
            }
          }
          // Показываем рублёвую цену рядом с USDT (НЕ на VK — канон v3)
          if (priceHintOv && _tbankAvailable && _tbankPrices && !_pdVkAny) {
            var skuForRub = sku || getCurrentSku();
            var rubP = _tbankPrices[skuForRub];
            var existingHint = priceHintOv.textContent || '';
            if (rubP && !existingHint) {
              priceHintOv.innerHTML = '≈ <span class="rub-accent">' + rubP + ' ₽</span> ' + (typeof t === 'function' ? t('payOvPriceHint') : 'при оплате картой');
            }
          }
          var subEl = document.getElementById('payOvSubtitle');
          var _tl = function(k, fb) { return typeof t === 'function' ? t(k) : fb; };
          var payOvSubtitleBySku = {
            single_song: _tl('payOvSubtitleSingle', 'Твоя персональная песня'),
            couple_song: _tl('payOvSubtitleCouple', 'Песня для вас двоих'),
            transit_energy_song: _tl('payOvSubtitleTransit', 'Энергия твоего дня'),
            deep_analysis_addon: _tl('payOvSubtitleAnalysis', 'Глубокая расшифровка'),
            soul_chat_1day: _tl('payOvSubtitleSc', 'Чат с Оракулом на 24 часа')
          };
          var subtitleText = (sku && payOvSubtitleBySku[sku]) ? payOvSubtitleBySku[sku] : (item ? (item.title || _tl('payOvSubtitleDefault', 'Твоя песня')) : _tl('payOvSubtitleDefault', 'Твоя песня'));
          if (subEl) subEl.textContent = subtitleText;
          var cardTitleEl = document.getElementById('payOvCardTitle');
          var cardTitles = {
            single_song: _tl('payOvCardTitleSingle', 'Персональная песня'),
            couple_song: _tl('payOvCardTitleCouple', 'Песня для двоих'),
            transit_energy_song: _tl('payOvCardTitleTransit', 'Энергия дня'),
            deep_analysis_addon: _tl('payOvCardTitleAnalysis', 'Текстовая расшифровка'),
            soul_chat_1day: _tl('payOvCardTitleSc', 'Разговор по душам — 24 часа')
          };
          if (cardTitleEl) cardTitleEl.textContent = (sku && cardTitles[sku]) ? cardTitles[sku] : (item ? (item.title || _tl('payOvDefault', 'Оплата')) : _tl('payOvPaymentReq', 'Оплата заявки'));
          // payOvIskryHint («или 100 Искр» под ценой) — скрываем ВСЕГДА.
          // VK модерация 03.05.2026 + фидбек Аллы 06.05: «или 100 Искр» путает —
          // юзер не понимает «это альтернатива? покупка пакета? цена в Искрах?».
          // Если у юзера есть Искры — показывается отдельная кнопка «Оплатить
          // Искрами» (payOvFreeClaimBtn) выше. Цена 490₽ — это всегда цена
          // в рублях по карте, без альтернативных формулировок.
          var iskryHint = document.getElementById('payOvIskryHint');
          if (iskryHint) iskryHint.style.display = 'none';
          // Блок апселла подписки: показываем для треков (single/couple/transit), скрываем для расшифровки и Soul Chat
          var upsellBlock = document.getElementById('payOvUpsellBlock');
          if (upsellBlock) {
            // Единая точка: пересчёт цен по платформе (голоса на VK) + display.
            // Голый display='block' оставлял статические ₽-дефолты разметки (скрин Аллы 02.07).
            if (typeof updatePaymentUpsell === 'function') {
              updatePaymentUpsell(sku);
            } else {
              var noUpsellSkus = ['deep_analysis_addon', 'soul_chat_1day'];
              upsellBlock.style.display = (sku && noUpsellSkus.indexOf(sku) !== -1) ? 'none' : 'block';
            }
          }
          // Обновляем главную кнопку «Оплатить» с ценой
          var mainPayBtn = document.getElementById('payOvMainPayBtn');
          if (mainPayBtn) {
            var mainPriceStr = '';
            if (activePromo) {
              mainPriceStr = String(activePromo.amount_after) + ' ' + (activePromo.currency || (item && item.currency) || '₽');
            } else if (item) {
              mainPriceStr = String(item.price) + ' ' + (item.currency || '₽');
            }
            mainPayBtn.textContent = (typeof t === 'function' ? t('pay') : 'Оплатить') + (mainPriceStr ? ' — ' + mainPriceStr : '');
          }
        } catch (e) {
          console.warn('[updatePaymentUiFromCatalog]', e);
          var n = document.getElementById('pricingNotice');
          if (n) { n.textContent = t('catalogLoadFailed'); n.style.display = 'block'; }
        }
      }
      async function loadPricingCatalog() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var initData = (tg && tg.initData) ? tg.initData : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
        catalogLoadError = false;
        if (!apiBase) {
          catalogLoadError = true;
          updatePaymentUiFromCatalog();
          return;
        }
        try {
          // Проверяем кэш
          var now = Date.now();
          if (catalogCache && (now - catalogCacheTime) < CATALOG_CACHE_TTL) {
            console.log('[Catalog] Используем кэш (возраст: ' + Math.round((now - catalogCacheTime) / 1000) + 'с)');
            pricingCatalog = catalogCache.catalog || [];
            freeTrialAvailable = catalogCache.free_trial_available || false;
            hasSubscriptionActive = catalogCache.subscription_active || false;
            catalogLoadError = false;
            updatePaymentUiFromCatalog();
            checkPendingRequestOnStart();
            loadReferralStats();
            return;
          }
          
          var url = apiBase + '/api/pricing/catalog';
          var sep = url.indexOf('?') >= 0 ? '&' : '?';
          if (initData) url += sep + 'initData=' + encodeURIComponent(initData);
          var catalogHeaders = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : { 'X-Telegram-Init': initData };
          var resp = await fetch(url, { headers: catalogHeaders, credentials: 'include' });
          var json = await resp.json().catch(function() { return {}; });
          if (resp.ok && json.success) {
            pricingCatalog = Array.isArray(json.catalog) ? json.catalog : [];
            freeTrialAvailable = !!(json.free_trial && json.free_trial.available);
            hasSubscriptionActive = !!(json.subscription_active);
            
            // Сохраняем в кэш
            catalogCache = {
              catalog: pricingCatalog,
              free_trial_available: freeTrialAvailable,
              subscription_active: hasSubscriptionActive
            };
            catalogCacheTime = now;
            console.log('[Catalog] Данные загружены и закэшированы');
            
            catalogLoadError = false;
            updatePaymentUiFromCatalog();
            // Проверяем зависшую заявку (не при возврате с HOT Pay — там заявка уже оплачена)
            var _curSearch = typeof window.location !== 'undefined' ? (window.location.search || '') : '';
            if (_curSearch.indexOf('payment=success') === -1) {
              checkPendingRequestOnStart();
            }
            // Загружаем реферальные данные
            loadReferralStats();
          } else {
            catalogLoadError = true;
            updatePaymentUiFromCatalog();
          }
        } catch (e) {
          console.warn('[loadPricingCatalog]', e);
          catalogLoadError = true;
          updatePaymentUiFromCatalog();
        }
      }
      // Загружает реферальную статистику и показывает блок «Пригласи друга»
      async function loadReferralStats() {
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) return;
        try {
          var resp = await fetch(apiBase + '/api/referral/stats', { headers: getAuthHeaders() });
          if (!resp.ok) return;
          var data = await resp.json().catch(function() { return null; });
          if (!data || !data.code || !data.link) return;
          window._myReferralLink = data.link;
          // VK Testers 09.05.2026 (Кузнецова): кнопка «Поделиться» читала из
          // #profileRefLinkInput, но loadReferralStats заполняла #referralLinkInput
          // (несуществующий id). Из-за этого link был всегда пустой и handler return.
          // Фикс: пишем в правильный id (HTML имеет именно profileRefLinkInput).
          var inp = document.getElementById('profileRefLinkInput') || document.getElementById('referralLinkInput');
          if (inp) {
            // ЕДИНАЯ платформенная логика (как во втором загрузчике, стр. ~22690 — убираем
            // рассинхрон после переезда: раньше тут ВСЕГДА писалась t.me, из-за чего на VK/OK
            // юзер копировал «не ту» ссылку). VK→vk.com, OK→ok.ru, web→web_link, TG→t.me.
            var _rcLS = '';
            try { _rcLS = data.link ? (String(data.link).match(/ref_([^&]+)/) || [])[1] || '' : ''; } catch (_) {}
            if (window._appEnv === 'vk' || window._isVkMiniApp) {
              inp.value = _rcLS ? ('https://vk.com/app54531891#ref=' + _rcLS) : 'https://vk.com/app54531891';
            } else if (window._appEnv === 'ok' || window._isOkMiniApp) {
              inp.value = _rcLS ? ('https://ok.ru/app/512005149416?ref=' + _rcLS) : 'https://ok.ru/app/512005149416';
            } else if (window._appEnv === 'web' && data.web_link) {
              inp.value = data.web_link;
            } else {
              inp.value = data.link || '';
            }
          }
          var inv = document.getElementById('refInvitedCount');
          if (inv) inv.textContent = data.invited_count || 0;
          var rew = document.getElementById('refRewardedCount');
          if (rew) rew.textContent = data.rewarded_count || 0;
          var crd = document.getElementById('refCreditsCount');
          if (crd) crd.textContent = data.credits || 0;
          var card = document.getElementById('referralCard');
          if (card) card.style.display = 'block';
        } catch (e) { console.warn('[Referral] Не удалось загрузить статистику:', e); }
      }

      // Копирование реф-ссылки из блока «Пригласи друга» на профиле (реф-эталон, Алла 21.06).
      // Свой handler (не #profileRefCopyBtn) — сохраняет svg иконку через span.textContent.
      window._profileCopyRefLink = function(btn) {
        var inp = document.getElementById('profileRefLinkInput');
        var link = (inp && inp.value) ? inp.value : (window._myReferralLink || window._myReferralWebLink || '');
        if (!link) return;
        try {
          if (typeof window._copyToClipboard === 'function') window._copyToClipboard(link);
          else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).catch(function() {});
        } catch (_) {}
        var sp = btn && btn.querySelector('span');
        if (sp) {
          var orig = sp.textContent;
          sp.textContent = (typeof t === 'function' ? (t('giftsRefCopied') || 'Скопировано') : 'Скопировано');
          setTimeout(function() { sp.textContent = orig; }, 1700);
        }
      };

      // Отмена подписки (T-Bank + HOT)
      async function cancelSubscription() {
        var btn = document.getElementById('profileCancelSubBtn');
        if (btn && btn.disabled) return;
        // Блокируем fullscreen overlay на время операции
        window.__cancelSubInProgress = true;
        try {
          // VK Testers 7272264 (MacOS): подставляем точную дату окончания доступа
          // (renew_at). Если даты нет — используем noDate-вариант текста.
          // Это убирает «противоречие»: пользователь видит конкретное число до
          // которого работает подписка вместо абстрактного «до конца периода».
          var renewAt = window._currentRenewAt || null;
          var renewDateStr = null;
          if (renewAt) {
            try {
              var dateLocale = { ru: 'ru-RU', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }[typeof currentLang !== 'undefined' ? currentLang : 'ru'] || 'ru-RU';
              renewDateStr = new Date(renewAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
            } catch (_) {}
          }
          var confirmKey = renewDateStr ? 'cancelSubConfirm' : 'cancelSubConfirmNoDate';
          var confirmMsg = typeof t === 'function'
            ? t(confirmKey, renewDateStr ? { date: renewDateStr } : undefined)
            : (renewDateStr
              ? 'Cancel subscription auto-renewal?\n\nAccess will remain until ' + renewDateStr + ', then your profile switches to the free Explorer plan. No refund.'
              : 'Unlink card?');
          var confirmed = false;
          // VK Testers 7272264 РЕВИЗИЯ (14.05.2026): Тамара переоткрыла — «всё ещё
          // отображается подтвердите действие на странице www.yupsoul.ru». Корень
          // моего же фикса: `_showCustomConfirm` определён ниже в файле как
          // function declaration, НО в RUNTIME-scope cancelSubscription он
          // недоступен (separate scope или другой IIFE). ReferenceError → catch →
          // native browser confirm() → Chrome показывает «yupsoul.ru говорит».
          // Фикс ревизии: inline модал прямо здесь, без зависимости от _showCustomConfirm.
          // VK Testers 7275181 (MacOS 14.05.2026, светлая тема): модал был сделан
          // только для тёмной — на светлой выглядел как «тёмный прямоугольник
          // без контента». Добавляем theme detection + light theme стили.
          confirmed = await new Promise(function(resolve) {
            var existing = document.getElementById('_cancelSubConfirmModal');
            if (existing) existing.remove();
            var ov = document.createElement('div');
            ov.id = '_cancelSubConfirmModal';
            var isLight = document.body.classList.contains('theme-light') || document.documentElement.classList.contains('is-vk-light') || document.documentElement.classList.contains('is-ok-light');
            var bg = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(20,15,40,0.97)';
            var border = isLight ? 'rgba(26,26,46,0.10)' : 'rgba(167,139,250,0.25)';
            var textColor = isLight ? '#1a1a2e' : 'rgba(255,255,255,0.92)';
            var okBg = isLight ? 'rgba(26,26,46,0.05)' : 'rgba(255,255,255,0.06)';
            var okBorder = isLight ? 'rgba(26,26,46,0.15)' : 'rgba(255,255,255,0.15)';
            var okColor = isLight ? 'rgba(26,26,46,0.7)' : 'rgba(255,255,255,0.7)';
            ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
            var okLabel = (typeof t === 'function' ? (t('confirmYes') || 'Да') : 'Да');
            var cancelLabel = (typeof t === 'function' ? (t('confirmCancel') || 'Отмена') : 'Отмена');
            ov.innerHTML = '<div style="max-width:360px;width:100%;background:' + bg + ';border:1px solid ' + border + ';border-radius:18px;padding:22px;text-align:center;color:' + textColor + ';font-family:inherit;">' +
              '<p style="font-size:0.92rem;line-height:1.5;margin:0 0 18px;color:' + textColor + ';white-space:pre-line;">' + String(confirmMsg).replace(/</g,'&lt;') + '</p>' +
              '<div style="display:flex;gap:10px;justify-content:center;">' +
              '<button type="button" id="_csOk" style="flex:1;padding:11px 20px;border-radius:9999px;background:' + okBg + ';border:1px solid ' + okBorder + ';color:' + okColor + ';font-size:0.88rem;cursor:pointer;font-family:inherit;">' + okLabel + '</button>' +
              '<button type="button" id="_csCancel" style="flex:1;padding:11px 20px;border-radius:9999px;background:linear-gradient(135deg,#a78bfa,#ec4899);border:none;color:#fff;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">' + cancelLabel + '</button>' +
              '</div></div>';
            document.body.appendChild(ov);
            var done = function(val) { ov.remove(); resolve(val); };
            document.getElementById('_csOk').onclick = function() { done(true); };
            document.getElementById('_csCancel').onclick = function() { done(false); };
            ov.onclick = function(e) { if (e.target === ov) done(false); };
          });
          if (!confirmed) { window.__cancelSubInProgress = false; return; }
          var progressMsg = typeof t === 'function' ? t('cancelSubProgress') : 'Cancelling…';
          if (btn) { btn.disabled = true; btn.textContent = progressMsg; }
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var authH = typeof getAuthHeaders === 'function' ? getAuthHeaders() : { 'Content-Type': 'application/json' };
          var resp = await fetch(apiBase + '/api/payments/tbank/cancel-subscription', {
            method: 'POST',
            headers: authH,
            body: JSON.stringify({ initData: typeof getInitData === 'function' ? getInitData() : '' }),
          });
          var data = await resp.json().catch(function() { return {}; });
          if (data.success) {
            // VK Testers 7272264: успешный toast тоже включает дату если есть.
            var successKey = renewDateStr ? 'cancelSubSuccess' : 'cancelSubSuccessNoDate';
            var _csMsg = typeof t === 'function'
              ? t(successKey, renewDateStr ? { date: renewDateStr } : undefined)
              : (renewDateStr
                ? 'Auto-renewal cancelled. Subscription active until ' + renewDateStr + '.'
                : 'Auto-renewal cancelled. Access remains until the end of the paid period.');
            showToast(_csMsg);
            var _csLabel = typeof t === 'function' ? t('profileSubscriptionCancelled') : 'Subscription cancelled';
            if (btn) { btn.textContent = _csLabel; btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'default'; }
            // Убираем inline "Деактивировать пакет" ссылки
            document.querySelectorAll('.cancel-sub-inline').forEach(function(el) { el.remove(); });
            window.subscriptionCancelledByUser = true;
            // Grace period: НЕ сбрасываем тариф и подписку — доступ сохраняется до renew_at
            // userTariff и hasSubscriptionActive остаются прежними
            try {
              localStorage.setItem('yupsoul_sub_cancelled', Date.now().toString());
              localStorage.removeItem('hot_pending_request_id');
              localStorage.removeItem('hot_pending_sku');
              localStorage.removeItem('pending_payment_type');
            } catch(_) {}
            // Обновляем профиль с задержкой, чтобы Supabase успел записать отмену
            setTimeout(function() {
              if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(e) { console.warn('[cancelSub] profile reload:', e); });
            }, 1500);
          } else {
            showToast(typeof t === 'function' ? t('cancelSubFail') : 'Failed to cancel subscription. Try again.');
            if (btn) { btn.disabled = false; btn.textContent = typeof t === 'function' ? t('profileCancelSubscription') : 'Cancel subscription'; }
          }
        } catch (e) {
          console.warn('[cancelSubscription] error:', (e && e.message) || e);
          showToast(typeof t === 'function' ? t('cancelSubFail') : 'Failed to cancel subscription. Try again.');
          if (btn) { btn.disabled = false; btn.textContent = typeof t === 'function' ? t('profileCancelSubscription') : 'Cancel subscription'; }
        } finally {
          window.__cancelSubInProgress = false;
        }
      }
      window.cancelSubscription = cancelSubscription;

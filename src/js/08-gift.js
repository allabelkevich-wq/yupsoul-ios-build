      })();
      // ── /Подарки (gift) ──────────────────────────────────────────────────────

      // Кнопка «Подробнее» в промо Soul Chat
      (function() {
        var btn = document.getElementById('scMoreBtn');
        var content = document.getElementById('scMoreContent');
        var textEl = document.getElementById('scMoreBtnText');
        if (!btn || !content) return;
        btn.addEventListener('click', function() {
          if (content.style.display === 'none') {
            content.style.display = 'block';
            if (textEl) textEl.textContent = (typeof t === 'function' ? t('scMoreBtnCollapse') : 'Свернуть ↑');
          } else {
            content.style.display = 'none';
            if (textEl) textEl.textContent = (typeof t === 'function' ? t('scMoreBtnText') : 'Подробнее ↓');
          }
        });
      })();

      // Кнопка «Купить 24ч доступ» на странице Soul Chat
      (function() {
        var btn = document.getElementById('scPageBuyDayBtn');
        var statusEl = document.getElementById('scPageBuyDayStatus');
        var picker = document.getElementById('scPayMethodPicker');
        var cardBtn = document.getElementById('scPayCardBtn');
        var btnLabelIskry = t('scOpenFor30');
        var btnLabelPay = 'Открыть Чат с Оракулом на 24ч';
        if (!btn) return;

        function setBtnText(t) { btn.textContent = t; }
        function setStatus(msg) {
          if (statusEl) { statusEl.textContent = msg; statusEl.style.display = msg ? '' : 'none'; }
        }
        function showPicker() {
          if (picker) picker.style.display = '';
          if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
        }
        function hidePicker() {
          if (picker) picker.style.display = 'none';
        }

        // Основная кнопка: Искры → активируем сразу, иначе показываем пикер
        btn.addEventListener('click', async function() {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !hasAuth()) { setStatus('Необходима авторизация.'); return; }
          var balance = typeof getIskryBalance === 'function' ? getIskryBalance() : 0;
          if (balance >= 30) {
            btn.disabled = true;
            setBtnText('Активирую…');
            hidePicker();
            setStatus('');
            var buyDayH = getAuthHeaders();
            try {
              // Phase 1.1: пользователь активирует Soul Chat доступ за искры.
              if (window._ysTrack) { try { window._ysTrack('soul_chat_purchase_initiated', { method: 'iskry' }); } catch(_) {} }
              var rIskry = await fetch(apiBase + '/api/soul-chat/activate-with-iskry', {
                method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, buyDayH),
                body: JSON.stringify({})
              });
              var jIskry = await rIskry.json().catch(function(){ return {}; });
              if (jIskry && jIskry.success) {
                // Phase 1.1: Soul Chat успешно куплен за искры
                if (window._ysTrack) { try { window._ysTrack('soul_chat_purchased', { method: 'iskry' }); } catch(_) {} }
                try {
                  var refR = await fetch(apiBase + '/api/referral/stats', { headers: buyDayH });
                  var refJ = await refR.json().catch(function(){ return null; });
                  if (refJ && typeof refJ.iskry_balance === 'number' && typeof setIskryBalance === 'function') {
                    setIskryBalance(refJ.iskry_balance);
                    if (typeof updateAllIskryDisplays === 'function') updateAllIskryDisplays();
                  }
                } catch(_) {}
                if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(){});
                if (typeof checkSoulChatAccess === 'function') {
                  await checkSoulChatAccess();
                  if (window._scAccess && window._scAccess.allowed && typeof goToSoulChat === 'function') goToSoulChat();
                }
                if (typeof showToast === 'function') showToast(t('toastScOpened'));
                setBtnText(btnLabelIskry);
                btn.disabled = false;
                return;
              }
            } catch(e) {}
            setBtnText(btnLabelIskry);
            btn.disabled = false;
          } else {
            // VK: день Оракула только за Искры (валюта, эталон 08.07) — карта/крипта-пикер
            // не показываем (карта там скрыта, крипта удалена → пустой тупик). Ведём копить Искры.
            if (window._isVkMiniApp === true || window._appEnv === 'vk') {
              if (typeof showToast === 'function' && typeof t === 'function') {
                showToast((t('iskryNotEnough') || 'У тебя {current} Искр. Нужно ещё {needed}')
                  .replace('{current}', balance).replace('{needed}', Math.max(0, 30 - balance)));
              }
              if (typeof goToPage === 'function') setTimeout(function(){ goToPage('plansPage'); }, 900);
              return;
            }
            // Нет Искр — показываем пикер способа оплаты
            if (picker && picker.style.display !== 'none') {
              hidePicker(); // повторный клик — скрыть
            } else {
              showPicker();
            }
          }
        });

        // Кнопка «Картой (Т-Банк)»
        if (cardBtn) {
          cardBtn.addEventListener('click', async function() {
            var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
            if (!apiBase || !hasAuth()) { setStatus('Необходима авторизация.'); return; }
            var origText = cardBtn.textContent;
            cardBtn.disabled = true;
            cardBtn.textContent = t('payConnectingBank');
            setStatus('');
            try {
              var initData = getInitData();
              var resp = await fetch(apiBase + '/api/payments/tbank/init', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
                body: JSON.stringify({ sku: 'soul_chat_1day', initData: initData })
              });
              var data = await resp.json().catch(function(){ return {}; });
              if (!resp.ok || !data.success || !data.payment_url) {
                cardBtn.disabled = false;
                cardBtn.textContent = origText;
                setStatus('Ошибка: ' + (data.error || 'не удалось создать платёж'));
                return;
              }
              try {
                localStorage.setItem('pending_payment_type', JSON.stringify({
                  type: 'soul_chat_day',
                  request_id: data.request_id || '',
                  sku: 'soul_chat_1day',
                  ts: Date.now()
                }));
              } catch(_) {}
              hidePicker();
              setStatus('Форма оплаты открыта — после оплаты вернись сюда');
              // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
              if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
                vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
                  .catch(function(){ try { window.open(data.payment_url, '_blank'); } catch(_) {} });
              } else if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                window.Telegram.WebApp.openLink(data.payment_url);
              } else {
                window.open(data.payment_url, '_blank');
              }
            } catch(e) {
              setStatus(''); if (typeof window._ensureOnline === 'function') window._ensureOnline(); // №37
            }
            cardBtn.disabled = false;
            cardBtn.textContent = origText;
          });
        }

        // Кнопка отключённого способа оплаты удалена из продукта (решение Аллы 27.08.2026) —
        // день Оракула оплачивается картой (или Искрами).
      })();

      // Кнопка «Доступ на 24 часа — 199 ₽» (быстрая покупка в промо-зоне)
      (function() {
        var qBtn = document.getElementById('scQuickBuyDayBtn');
        if (!qBtn) return;
        qBtn.addEventListener('click', async function() {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !hasAuth()) return;
          var origText = qBtn.textContent;
          qBtn.disabled = true;
          qBtn.textContent = t('payConnectingBank');
          try {
            var initData = getInitData();
            var resp = await fetch(apiBase + '/api/payments/tbank/init', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
              body: JSON.stringify({ sku: 'soul_chat_1day', initData: initData })
            });
            var data = await resp.json().catch(function(){ return {}; });
            if (!resp.ok || !data.success || !data.payment_url) {
              qBtn.disabled = false;
              qBtn.textContent = origText;
              if (typeof showToast === 'function') showToast(t('toastPayFail'));
              return;
            }
            try {
              localStorage.setItem('pending_payment_type', JSON.stringify({
                type: 'soul_chat_day',
                request_id: data.request_id || '',
                sku: 'soul_chat_1day',
                ts: Date.now()
              }));
            } catch(_) {}
            // VK Mini App — через VKWebAppOpenLink (window.open в iframe заблокирован).
            if (window._isVkMiniApp && window.vkBridge && typeof vkBridge.send === 'function') {
              vkBridge.send('VKWebAppOpenLink', { url: data.payment_url })
                .catch(function(){ try { window.open(data.payment_url, '_blank'); } catch(_) {} });
            } else if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
              window.Telegram.WebApp.openLink(data.payment_url);
            } else {
              window.open(data.payment_url, '_blank');
            }
          } catch(e) {
            if (typeof showToast === 'function') showToast(t('toastConnError'));
          }
          qBtn.disabled = false;
          qBtn.textContent = origText;
        });
      })();

      // Кнопка «Получить подарок» на странице Soul Chat
      (function() {
        var btn = document.getElementById('scPageGiftBtn');
        if (!btn) return;
        btn.addEventListener('click', async function() {
          btn.disabled = true; btn.textContent = typeof t === 'function' ? t('btnActivating') : 'Активирую…'; // (аудит iPhone 24.09: убран хардкод RU, теперь через существующий ключ btnActivating)
          var apiBase  = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !hasAuth()) { btn.disabled = false; btn.textContent = typeof t === 'function' ? t('btnTry') : 'Попробовать'; return; }
          var initData = getInitData();
          var giftH = getAuthHeaders();
          try {
            var r = await fetch(apiBase + '/api/soul-chat/activate-gift', {
              method:'POST', headers: Object.assign({'Content-Type':'application/json'}, giftH),
              body: JSON.stringify({ initData: initData })
            });
            var j = await r.json().catch(function(){ return {}; });
            if (j && (j.ok || j.success)) {
              initSoulChatPage();
            } else {
              btn.disabled = false; btn.textContent = typeof t === 'function' ? t('btnGet24hFree') : 'Получить 24 часа бесплатно';
              showToast(j && j.error ? j.error : t('toastActivateFail'));
            }
          } catch(e) {
            btn.disabled = false; btn.textContent = typeof t === 'function' ? t('btnGet24hFree') : 'Получить 24 часа бесплатно';
            showToast(t('toastConnRetry'));
          }
        });
      })();

      // Прокрутка чата вниз после отрисовки (убирает прыжки: скролл после layout)
      function scrollChatToBottom() {
        var chatEl = document.getElementById('scPageChat');
        if (!chatEl) return;
        // Стартовый экран (intro + приветствие + qa-grid, нет реальных сообщений) —
        // показываем СВЕРХУ (эталон showcase-chat-v6), не уезжаем вниз.
        var _hist = document.getElementById('scPageHistory');
        var _hasConvo = _hist && _hist.querySelector('.sc-msg-user');
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            chatEl.scrollTop = _hasConvo ? chatEl.scrollHeight : 0;
          });
        });
      }
      window.scrollChatToBottom = scrollChatToBottom;

      // VK Testers 11.05 — Batch 6.4 rev2: динамическое измерение высоты scInputArea.
      // ResizeObserver обновляет CSS-переменную --sc-input-h при изменении высоты
      // input area (textarea растёт при переносе строк, context pills появляются).
      // padding-bottom #scPageHistory = var(--sc-input-h) + 18px buffer.
      window._scInitInputHeightObserver = function() {
        var inputArea = document.getElementById('scInputArea');
        if (!inputArea) return false;
        var setVar = function() {
          var h = Math.round(inputArea.getBoundingClientRect().height);
          if (h > 0) document.documentElement.style.setProperty('--sc-input-h', h + 'px');
        };
        if (typeof ResizeObserver === 'function') {
          var ro = new ResizeObserver(setVar);
          ro.observe(inputArea);
        } else {
          // Fallback для очень старых WebView без ResizeObserver
          window.addEventListener('resize', setVar);
          setInterval(setVar, 2000);
        }
        setVar();
        return true;
      };
      if (!window._scInitInputHeightObserver()) {
        // scInputArea ещё не в DOM — попробуем после rAF
        requestAnimationFrame(function() { window._scInitInputHeightObserver(); });
      }

      // Добавляет сообщение в историю Soul Chat (глобальная функция)
      // Счётчик пробных вопросов / режим Искр под полем ввода (ЗАКОН Алла 13.06). Подписчику скрыт.
      window.scRenderOracleCounter = function scRenderOracleCounter() {
        var el = document.getElementById('scOracleCounter');
        if (!el) return;
        var _t = (typeof t === 'function') ? t : function(k, f){ return f || k; };
        if (window._scOracleUnlimited) { el.style.display = 'none'; return; }
        var free = Number(window._scOracleFreeLeft);
        var bal = Number(window._scOracleBalance);
        var SPARK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>';
        el.innerHTML = SPARK + '<span></span>';
        var _txt = el.querySelector('span');
        if (Number.isFinite(free) && free > 0) {
          _txt.textContent = _t('scOracleFreeLeft', 'Вопросов в подарок: {n} из 10').replace('{n}', free);
        } else {
          _txt.textContent = _t('scOracleIskryMode', '1 вопрос = 1 Искра · у тебя {n}').replace('{n}', Number.isFinite(bal) ? bal : 0);
        }
        el.style.display = 'flex';
      };

      function _scAppendCopyBtn(container, text) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-copy-btn';
        var lbl = (typeof t === 'function' ? (t('scCopy') || 'Копировать') : 'Копировать');
        btn.setAttribute('aria-label', lbl);
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>' + lbl + '</span>';
        btn.onclick = function() {
          try { if (typeof window._copyToClipboard === 'function') window._copyToClipboard(text); else if (navigator.clipboard) navigator.clipboard.writeText(text); } catch (_) {}
          try { if (typeof window.showToast === 'function') window.showToast(typeof t === 'function' ? (t('scCopied') || 'Скопировано') : 'Скопировано'); } catch (_) {}
        };
        container.appendChild(btn);
        return btn;
      }
      function scPageAddMsg(role, text) {
        var historyEl = document.getElementById('scPageHistory');
        if (!historyEl) return;
        var isUser = (role === 'user');
        // Эталон showcase-oracle: сообщение — сам пузырь (.msg.you / .msg.or),
        // без обёртки и аватара. Классы sc-msg-user / sc-msg-soul переехали на него:
        // на них держатся дедупликация, прокрутка и признак «диалог начат».
        var bubble = document.createElement('div');
        bubble.className = isUser ? 'sc-msg-user msg you' : 'sc-msg-soul msg or';

        // Простая поддержка параграфов и bold для ответов Soul
        if (!isUser && (text.indexOf('\n') !== -1 || text.indexOf('**') !== -1 || text.indexOf('- ') !== -1)) {
          var html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
          html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
          var paras = html.split(/\n+/).filter(function(p){ return p.trim().length > 0; });
          bubble.innerHTML = paras.map(function(p){ 
            if (p.indexOf('<ul>') !== -1 || p.indexOf('<li>') !== -1) return p;
            return '<p>' + p + '</p>'; 
          }).join('');
        } else {
          bubble.textContent = text;
        }

        // Подпись «Оракул» — как в эталоне, внутри пузыря; ставим после наполнения,
        // иначе innerHTML с разметкой ответа её затрёт.
        if (!isUser) bubble.insertAdjacentHTML('afterbegin', '<span class="who"><i></i>' + ((typeof t === 'function' && t('scOracleWho')) || 'Оракул') + '</span>');
        historyEl.appendChild(bubble);
        if (!isUser) _scAppendCopyBtn(historyEl, text);
        scrollChatToBottom();
      }
      // ── Вступление в сообщество ВК (Алла 29.07): общий флоу для карточки в чате
      // и кнопки профиля. Открываем группу (VKWebAppOpenLink — проверенный способ,
      // см. 12-synastry-tail), по возврату фокуса один раз зовём /api/community/
      // join-bonus: бэкенд сам проверяет членство (groups.isMember) и начисляет
      // +30 Искр однократно (флаг community_join_bonus_given). ──
      var _vkCommFocusWired = false;
      // Тихая проверка членства без открытия группы: зовётся при заходе в профиль
      // (см. goToPage). Ничего не показывает, если человек не в группе.
      window._vkCommunityVerifyQuiet = function() {
        try { window._vkCommunityJoinFlow(null, null, true); } catch(_) {}
      };
      // Возвращает true/false для inline onclick на <a>: false = переход берёт на себя мост,
      // true = мост недоступен, пусть сработает обычная навигация по ссылке (WebView клиента
      // VK открывает её всегда — фикс «кнопка сообщества не кликабельна», отказ ВК 24.08).
      window._vkCommunityJoinFlow = function(btn, ev, quietOnly) {
        var GROUP_URL = 'https://vk.com/club237303283';
        var tl = function(k, f) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return f; };
        function verify(withFeedback) {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || (typeof hasAuth === 'function' && !hasAuth())) return Promise.resolve(false);
          var _f = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : function(u, o) { return fetch(u, o); };
          return _f(apiBase + '/api/community/join-bonus', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {}),
            body: JSON.stringify({ platform: 'vk' })
          }, 20000)
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(j) {
              if (j && j.ok) {
                try { localStorage.setItem('ys_vk_comm_joined', '1'); } catch(_) {}
                // Тот же флаг, что приходит из /api/me — по нему карточка стены и
                // ряд на главной решают, показывать ли обещание бонуса. localStorage
                // не переезжает между устройствами, серверный флаг переезжает.
                window._commJoinGiven = true;
                if (btn) { btn.textContent = tl('questJoinDone', 'Готово'); btn.disabled = true; }
                if (j.alreadyGranted && withFeedback && typeof showToast === 'function') showToast(tl('questJoinAlready', 'Ты уже в сообществе'));
                if (j.amount > 0) {
                  if (typeof showToast === 'function') showToast(tl('questJoinToast', 'Спасибо! +30 Искр'));
                  if (j.balance != null) { window._scOracleBalance = Number(j.balance); try { if (typeof scRenderOracleCounter === 'function') scRenderOracleCounter(); } catch(_) {} }
                  // Событие снимаем там, где бэкенд подтвердил членство и выдал бонус, а не по
                  // клику: amount > 0 приходит один раз (повтор вернёт 0) — это и есть дедуп.
                  if (window._ysTrack) { try { window._ysTrack('community_joined', { platform: 'vk', src: 'chat', amount: Number(j.amount) || 0 }); } catch(_) {} }
                }
                return true;
              }
              if (withFeedback && typeof showToast === 'function') showToast(tl('questJoinNeedMember', 'Сначала вступи в сообщество, потом вернись'));
              return false;
            })
            .catch(function() { return false; });
        }
        if (quietOnly) { verify(false); return false; }
        // Открытие группы. Возвращает true, если переход надо отдать нативной
        // навигации <a href> (мост недоступен) — тогда inline onclick не блокирует клик.
        function openGroup(evt) {
          try {
            if (window.vkBridge && typeof vkBridge.send === 'function') {
              if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
              vkBridge.send('VKWebAppOpenLink', { url: GROUP_URL }).catch(function() { try { window.open(GROUP_URL, '_blank'); } catch(_) {} });
              return false;
            }
            if (btn && btn.tagName === 'A') return true;
            window.open(GROUP_URL, '_blank');
          } catch(_) { try { window.open(GROUP_URL, '_blank'); } catch(_) {} }
          return false;
        }
        // Повторный тап = «я вступил(а)»: проверяем членство и говорим результат.
        // Без этой ветки бонус зависел ТОЛЬКО от авто-детекта возврата (ниже), а он
        // в клиенте VK не срабатывает: группа открывается ПОВЕРХ мини-аппа, iframe
        // фокус не теряет — ни focus, ни visibilitychange не приходят. Человек
        // вступал, возвращался, Искр не получал (Алла 03.09).
        if (btn && btn.getAttribute('data-vkcomm-opened') === '1') {
          if (window.vkBridge && typeof vkBridge.send === 'function') {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            verify(true).then(function(ok) { if (!ok) openGroup(null); });
            return false;
          }
          verify(true);          // ссылка уйдёт сама, проверка догонит в фоне
          return true;
        }
        if (btn) {
          btn.setAttribute('data-vkcomm-opened', '1');
          // снимаем data-i18n, иначе смена языка вернёт исходную подпись
          try { btn.removeAttribute('data-i18n'); btn.textContent = tl('questJoinCheck', 'Я вступил(а)'); } catch(_) {}
        }
        var _viaLink = openGroup(ev);
        if (_vkCommFocusWired) return _viaLink;
        _vkCommFocusWired = true;
        var done = false;
        function once() {
          if (done) return; done = true;
          window.removeEventListener('focus', once);
          document.removeEventListener('visibilitychange', onVis);
          try { if (window.vkBridge && typeof vkBridge.unsubscribe === 'function') vkBridge.unsubscribe(onBridge); } catch(_) {}
          _vkCommFocusWired = false;
          setTimeout(function() { verify(true); }, 900);
        }
        function onVis() { if (document.visibilityState === 'visible') once(); }
        // VKWebAppViewRestore — штатный сигнал возврата в мини-апп; в нативных
        // клиентах VK (iOS/Android) это единственное событие, которое реально
        // приходит после закрытия открытой поверх страницы сообщества.
        function onBridge(e) {
          var ty = e && e.detail && e.detail.type;
          if (ty === 'VKWebAppViewRestore' || ty === 'VKWebAppLocationChanged') once();
        }
        window.addEventListener('focus', once);
        document.addEventListener('visibilitychange', onVis);
        try { if (window.vkBridge && typeof vkBridge.subscribe === 'function') vkBridge.subscribe(onBridge); } catch(_) {}
        // Страховка: если ни одно событие не пришло, тихо проверяем сами.
        setTimeout(function() { if (!done) verify(false); }, 12000);
        setTimeout(function() { if (!done) verify(false); }, 40000);
        return _viaLink;
      };

      // Карточка-приглашение в сообщество после ответа Оракула: только VK, один раз
      // за всё время (localStorage). Не показываем уже вступившим.
      function _scMaybeShowCommunityInvite() {
        var isVk = document.documentElement.classList.contains('is-vk') || window._isVkMiniApp === true || window._appEnv === 'vk';
        if (!isVk) return;
        try { if (localStorage.getItem('ys_vk_comm_card') || localStorage.getItem('ys_vk_comm_joined')) return; } catch(_) {}
        var historyEl = document.getElementById('scPageHistory');
        if (!historyEl || document.getElementById('scCommInvite')) return;
        try { localStorage.setItem('ys_vk_comm_card', '1'); } catch(_) {}
        var tl = function(k, f) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return f; };
        var card = document.createElement('div');
        card.id = 'scCommInvite';
        var b = document.createElement('b'); b.textContent = tl('scCommInviteT', 'Энергия дня — каждое утро в сообществе');
        var s = document.createElement('span'); s.textContent = tl('scCommInviteS', 'Короткий настрой на день и новости Оракула. За вступление — +30 Искр.');
        var row = document.createElement('div'); row.className = 'sc-comm-btns';
        // data-u — штатный люк глобальной «простыни» кнопок (button:not([data-u])…):
        // без него вес шрифта падает до 300, а ширины перераспределяются.
        var join = document.createElement('button'); join.type = 'button'; join.className = 'sc-comm-join'; join.setAttribute('data-u', '1'); join.textContent = tl('scCommInviteBtn', 'Вступить');
        var later = document.createElement('button'); later.type = 'button'; later.className = 'sc-comm-later'; later.setAttribute('data-u', '1'); later.textContent = tl('consentLater', 'Позже');
        join.onclick = function() { window._vkCommunityJoinFlow(join); };
        later.onclick = function() { try { card.remove(); } catch(_) { if (card.parentNode) card.parentNode.removeChild(card); } };
        row.appendChild(join); row.appendChild(later);
        card.appendChild(b); card.appendChild(s); card.appendChild(row);
        historyEl.appendChild(card);
        scrollChatToBottom();
      }

      // ── Вехи подарочных вопросов на нативе VK (Алла 09.09) ──────────────
      // Только там, где песни отключены нами самими. На остальных поверхностях
      // Искра дня по-прежнему открывается после первой песни, и обещать
      // «Искра приходит каждый день» там нельзя.
      function _scOracleFreeMilestones(freeWas) {
        if (!(window._vkSongsOff && window._vkSongsOff())) return;
        if (window._scOracleUnlimited) return;
        var now = Number(window._scOracleFreeLeft);
        if (!Number.isFinite(now)) return;
        var tl = function(k, f) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return f; };
        if (now === 3 && !window._scFreeWarnShown) {
          window._scFreeWarnShown = true;
          scPageAddMsg('soul', tl('scOracleFreeWarn', 'Остались 3 вопроса из подарочных. Дальше Искра приходит каждый день — одной хватает на новый вопрос.'));
        }
        // Строгий переход >0 → 0, иначе событие полетит на каждом вопросе после стены.
        if (now === 0 && Number.isFinite(freeWas) && freeWas > 0 && window._ysTrack) {
          try { window._ysTrack('vk_oracle_free_used_up', { balance: Number(window._scOracleBalance) || 0 }); } catch(_) {}
        }
      }

      // ── Стена подарочных вопросов на нативе VK ───────────────────────────
      // Песен и оплаты на площадке нет, поэтому карточка предлагает ровно то,
      // что здесь работает: Искру дня (бэкенд снял песенный гейт по подписанному
      // claim'у) и сообщество. Следом — подарочный разбор «Имя души».
      function _scWallApiBase() { return (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, ''); }
      function _scWallTl(k, f) { try { if (typeof t === 'function') { var v = t(k); if (v && v !== k) return v; } } catch(_) {} return f; }
      function _scWallFetch() { return (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : function(u, o) { return fetch(u, o); }; }

      function _scShowWallCard() {
        if (!(window._vkSongsOff && window._vkSongsOff())) return;
        var historyEl = document.getElementById('scPageHistory');
        if (!historyEl) return;
        var tl = _scWallTl;
        // Карточка ПЕРЕСОЗДАЁТСЯ на каждый упор в стену. Раньше стоял ранний
        // выход при уже существующем #scWallCard: второй и каждый следующий раз
        // человек не получал НИЧЕГО — вопрос в ленте, «печатает…» снято, ответа
        // нет, объяснения нет. Сносим старые узлы, новые уходят в конец ленты.
        ['scWallCard', 'scWallPrism'].forEach(function(id) {
          var oldEl = document.getElementById(id);
          if (oldEl && oldEl.parentNode) oldEl.parentNode.removeChild(oldEl);
        });

        var card = document.createElement('div');
        card.id = 'scWallCard';
        var b = document.createElement('b');
        // Нейтральный заголовок — верен в ОБОИХ состояниях. Точный подставит
        // _scWallSyncClaim, когда сервер скажет, доступна ли сегодня Искра.
        // Прежний текст («на сегодня всё, завтра будут новые») противоречил
        // кнопке под ним: она выдаёт Искры прямо сейчас, а 1 Искра = 1 вопрос.
        b.textContent = tl('scWallTitle', 'Подарочные вопросы закончились. Дальше вопрос стоит одну Искру.');
        var row = document.createElement('div'); row.className = 'sc-wall-btns';

        // Вступление в сообщество гейтим СЕРВЕРНЫМ флагом community_join_bonus_given
        // (/api/me → window._commJoinGiven). localStorage для этого не годится: его
        // пишет только один из двух путей вступления и он не переезжает между
        // устройствами — обещание «+30 Искр» показывалось второй раз тому, кто
        // бонус уже получил, а повторный запрос молча возвращал amount 0.
        var joined = (window._commJoinGiven === true);
        if (!joined) { try { joined = !!localStorage.getItem('ys_vk_comm_joined'); } catch(_) {} }
        var note = null;
        if (!joined) {
          // data-u — штатный люк глобальной «простыни» кнопок (button:not([data-u])…):
          // без него вес шрифта падает до 300, а размер до 0.78rem.
          var join = document.createElement('button');
          join.type = 'button'; join.className = 'sc-wall-join'; join.setAttribute('data-u', '1');
          join.textContent = tl('scWallJoinBtn', 'Вступить в сообщество');
          join.onclick = function() { window._vkCommunityJoinFlow(join); };
          row.appendChild(join);
          note = document.createElement('span'); note.className = 'sc-wall-note';
          note.textContent = tl('scWallNote', 'В сообществе каждое утро выходит разбор дня. За вступление начислим 30 Искр.');
        }

        card.appendChild(b); card.appendChild(row); if (note) card.appendChild(note);
        historyEl.appendChild(card);
        scrollChatToBottom();
        _scWallSyncClaim(card, b, row);
        _scShowWallPrism(historyEl, tl);
      }

      // Кнопка «Забрать Искру дня» появляется ТОЛЬКО когда сервер подтвердил, что
      // сегодня её действительно можно забрать. Раньше карточка рисовала CTA всем
      // подряд — и тому, кто уже забрал сегодня, и заблокированному аккаунту
      // (eligible=false): нажатие не давало обещанного, а надпись менялась на
      // «Приходи завтра», которое для blocked не наступит никогда.
      async function _scWallSyncClaim(card, titleEl, row) {
        var tl = _scWallTl;
        var apiBase = _scWallApiBase();
        var d = null;
        if (apiBase) {
          try {
            var resp = await _scWallFetch()(apiBase + '/api/iskry/claim', {
              headers: (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {}
            }, 15000);
            var j = await resp.json().catch(function() { return null; });
            if (resp.ok) d = j;
          } catch (_) { d = null; } // офлайн/таймаут — молча, без текста ошибки (закон №37)
        }
        if (!card.parentNode) return; // карточку уже сменила новая
        if (d && d.ok && d.canClaim) {
          var claim = document.createElement('button');
          claim.type = 'button'; claim.className = 'sc-wall-claim'; claim.setAttribute('data-u', '1');
          claim.textContent = tl('scWallClaimBtn', 'Забрать Искру дня');
          claim.onclick = function() { _scWallClaim(claim, titleEl); };
          row.insertBefore(claim, row.firstChild);
          titleEl.textContent = tl('scWallTitleClaim', 'Подарочные вопросы закончились. Возьми Искру дня — её хватит на новый вопрос.');
          scrollChatToBottom();
        } else if (d && d.ok && d.eligible && d.claimedToday) {
          titleEl.textContent = tl('scWallTitleDone', 'Искра на сегодня уже у тебя. Новая придёт завтра.');
        }
        // Дедуп по сессии: карточка пересоздаётся при каждом упоре в стену.
        try {
          if (window._ysTrack && sessionStorage.getItem('ys_a_dailycard_wall') !== '1') {
            sessionStorage.setItem('ys_a_dailycard_wall', '1');
            window._ysTrack('vk_native_daily_card_shown', { src: 'chat_wall', canClaim: !!(d && d.canClaim) });
          }
        } catch(_) {}
      }

      // Искра дня прямо из чата. window.claimIskra переиспользовать нельзя: она
      // начинается с #iskraClaimBtn, который живёт только на экране Подарков,
      // и здесь молча выйдет на первой строке.
      async function _scWallClaim(btn, titleEl) {
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var tl = _scWallTl;
        var apiBase = _scWallApiBase();
        if (!apiBase) { btn.disabled = false; return; }
        var hdrs = Object.assign({ 'Content-Type': 'application/json' }, (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {});
        try {
          var resp = await _scWallFetch()(apiBase + '/api/iskry/claim', { method: 'POST', headers: hdrs }, 15000);
          var d = await resp.json().catch(function() { return {}; });
          if (d && d.ok) {
            window._scOracleBalance = Number(d.balance) || 0;
            if (typeof setIskryBalance === 'function') setIskryBalance(d.balance);
            if (typeof scRenderOracleCounter === 'function') scRenderOracleCounter();
            btn.textContent = tl('scWallClaimDone', 'Искра у тебя');
            if (titleEl) titleEl.textContent = tl('scWallTitleDone', 'Искра на сегодня уже у тебя. Новая придёт завтра.');
            // Счётчик над полем ввода меняется тихо — говорим словами, что путь открыт.
            scPageAddMsg('soul', tl('scWallClaimedMsg', 'Искра у тебя — спрашивай.'));
            if (window._ysTrack) { try { window._ysTrack('vk_native_daily_claimed', { src: 'chat_wall', streak: Number(d.streak) || 0 }); } catch(_) {} }
          } else if (resp.status === 409) {
            // Единственный случай, когда «приходи завтра» — правда: сегодня уже забрана.
            btn.textContent = tl('iskraClaimBtnDone', 'Приходи завтра');
            if (titleEl) titleEl.textContent = tl('scWallTitleDone', 'Искра на сегодня уже у тебя. Новая придёт завтра.');
          } else if (resp.status === 401 || resp.status === 403) {
            // Искра этому аккаунту недоступна (протухшая авторизация, blocked).
            // Не врём «приходи завтра» — убираем действие, которого нет.
            if (btn.parentNode) btn.parentNode.removeChild(btn);
            if (titleEl) titleEl.textContent = tl('scWallTitle', 'Подарочные вопросы закончились. Дальше вопрос стоит одну Искру.');
          } else {
            btn.disabled = false; // прочее — тихо позволяем повтор (закон №37)
          }
        } catch (_) { btn.disabled = false; } // офлайн/таймаут — тихо, кнопка снова активна
      }

      // Подарочный первый разбор «Имя души»: механика prism_first_free уже на
      // бэкенде, в чате входа к ней не было. Блок показываем ТОЛЬКО когда сервер
      // подтвердил, что разбор откроется БЕЗ списания (soul_name_free). Раньше
      // карточка утверждала «уже открыт» безусловно: при израсходованном триале
      // и сменившемся отпечатке данных рождения разбор стоит 100 Искр (402), а
      // при пустой дате рождения — 409, и человека выбрасывало на другой экран.
      async function _scShowWallPrism(historyEl, tl) {
        if (!historyEl) return;
        var free = window._scSoulNameFree;
        if (free !== true && free !== false) free = await _scFetchSoulNameFree();
        if (free !== true) return;
        if (document.getElementById('scWallPrism')) return;
        if (!document.getElementById('scWallCard')) return; // карточку успели сменить
        var wrap = document.createElement('div');
        wrap.id = 'scWallPrism';
        var s = document.createElement('span');
        s.textContent = tl('scWallPrismText', 'Один большой разбор о тебе уже открыт — «Имя души». Прочти.');
        var go = document.createElement('button');
        go.type = 'button'; go.className = 'sc-wall-prism-btn'; go.setAttribute('data-u', '1');
        go.textContent = tl('scPrismPayBtn', 'Открыть разбор');
        go.onclick = function() {
          // Одиночная ручка /api/soul-chat/prism — именно она проходит через ветку
          // подарка soul_name. runPrism() вместо неё греет стримом ВСЕ разборы.
          try { if (typeof window.switchOracleTab === 'function') window.switchOracleTab('prism'); } catch(_) {}
          try { if (typeof window.runPrismPaid === 'function') window.runPrismPaid('soul_name'); } catch(_) {}
        };
        wrap.appendChild(s); wrap.appendChild(go);
        historyEl.appendChild(wrap);
        scrollChatToBottom();
      }

      // Ответ кэшируем на сессию: подарок не «расходуется» от чтения — после
      // выдачи разбор попадает в owned и всё так же открывается без списания.
      async function _scFetchSoulNameFree() {
        var apiBase = _scWallApiBase();
        if (!apiBase) return false;
        try {
          var lang = (typeof window._currentLang === 'string' ? window._currentLang : 'ru') || 'ru';
          var r = await _scWallFetch()(apiBase + '/api/soul-chat/prism-catalog?lang=' + encodeURIComponent(lang), {
            headers: (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {}
          }, 15000);
          var j = await r.json().catch(function() { return {}; });
          if (r.ok && j && j.success) {
            window._scSoulNameFree = !!j.soul_name_free;
            return window._scSoulNameFree;
          }
        } catch (_) {}
        return false; // не подтвердили — ничего не обещаем
      }

      function scPageShowTyping() {
        scPageHideTyping();
        var historyEl = document.getElementById('scPageHistory');
        if (!historyEl) return;
        var bubble = document.createElement('div');
        bubble.id = 'scTypingBubble';
        // Эталон showcase-oracle: индикатор набора — тот же пузырь ответа с классом typing
        // и тремя точками-<i>; анимация мигания живёт в блоке эталона (orav2-bl).
        bubble.className = 'sc-msg-soul msg or typing';
        bubble.setAttribute('aria-label', typeof t === 'function' ? t('scTyping') : 'Soul Chat печатает…');
        bubble.innerHTML = '<i></i><i></i><i></i>'; // точки эталона — теги <i>, их и анимирует .typing i
        historyEl.appendChild(bubble);
        scrollChatToBottom();
      }
      function scPageHideTyping() {
        var el = document.getElementById('scTypingBubble');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }

      // Кнопка «Спросить» на странице Soul Chat
      (function() {
        var sendBtn   = document.getElementById('scPageSendBtn');
        var questionEl = document.getElementById('scPageQuestion');
        var statusEl   = document.getElementById('scPageStatus');
        if (!sendBtn || !questionEl) return;

        sendBtn.addEventListener('click', async function() {
          var question = questionEl.value.trim();
          if (!question) return;
          var apiBase  = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !hasAuth()) return;
          var initData = getInitData();
          var sendH = getAuthHeaders();

          scPageAddMsg('user', question);
          questionEl.value = '';
          questionEl.style.height = '24px';
          questionEl.blur();
          sendBtn.disabled = true;
          scPageShowTyping();
          if (statusEl) statusEl.style.display = 'none';
          scrollChatToBottom();

          // Phase 1.1: Soul Chat сообщение отправлено
          if (window._ysTrack) { try { window._ysTrack('soul_chat_message_sent', { len: (question || '').length }); } catch(_) {} }
          try {
            var resp = await fetchWithTimeout(apiBase + '/api/soul-chat', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, sendH),
              body: JSON.stringify({
                initData: initData,
                question: question,
                // 'self' (карта владельца) доходит до бэка КАК ЕСТЬ — не схлопывается в ''.
                request_id: window._scLastRequestId || '',
                request_id_2: window._scRequestId2 || '',
                // Синастрия всегда явная (даже если сторона = 'self'). Одиночный
                // режим — явный только при выбранном контакте (закон №64: без выбора
                // explicit_request=false → контекст про владельца из профиля).
                explicit_request: !!(window._scPickerSelA || window._scRequestId2 || (window._scPickerMode === 'synastry' && window._scLastRequestId)),
                // Беседа: продолжаем текущую или заводим новую. Сервер проверяет,
                // что она наша, и при любом сомнении выдаёт свой id.
                thread_id: window._scThreadId || ''
              })
            }, 120000);
            var json = await resp.json().catch(function(){ return {}; });
            scPageHideTyping();
            if (json && json.data && json.data.thread_id) {
              window._scThreadId = json.data.thread_id;
              try { localStorage.setItem('scThreadId_' + (window._tgUserId || 'anon'), json.data.thread_id); } catch (_) {}
            }
            // ЗАКОН (Алла 13.06): пробные вопросы закончились + 0 Искр → 402 oracleNeedIskry.
            // Показываем тёплую подсказку + кнопку в Подарки (claim/покупка). Закон №31.
            if (resp.status === 402 && json && json.error_code === 'oracleNeedIskry') {
              window._scOracleFreeLeft = 0;
              window._scOracleBalance = (json.oracle_balance != null) ? Number(json.oracle_balance) : 0;
              if (typeof scRenderOracleCounter === 'function') scRenderOracleCounter();
              // Натив VK: слова «пополни баланс» из scOracleNeedIskry там запрещены
              // (оплаты на площадке нет). Вместо строки с кнопкой — карточка в ленте.
              if (window._vkSongsOff && window._vkSongsOff()) {
                try { _scShowWallCard(); } catch(_) {}
                return;
              }
              scPageAddMsg('soul', (typeof t === 'function' && t('scOracleNeedIskry')) || 'Вопросы в подарок закончились. Дальше 1 вопрос = 1 Искра. Забери ежедневную Искру в Подарках или пополни баланс.');
              try {
                var _giftBtnHtml = '<div style="margin-top:8px;"><button type="button" onclick="if(typeof goToPage===\'function\'){goToPage(\'giftsPage\');}" style="padding:8px 16px;border-radius:9999px;background:linear-gradient(135deg,#a78bfa,#ec4899);border:none;color:#fff;font-size:0.85rem;cursor:pointer;font-family:inherit;font-weight:600;">' + ((typeof t === 'function' && t('scOracleGetIskry')) || 'Забрать Искру') + ' →</button></div>';
                var _chatEl2 = document.getElementById('scPageChat');
                if (_chatEl2 && _chatEl2.lastElementChild) _chatEl2.lastElementChild.insertAdjacentHTML('beforeend', _giftBtnHtml);
              } catch(_) {}
              // Решение 23.09 (эталон showcase-oracle-paywall.html): сразу показываем шторку с пакетами —
              // на нативе с ценами стора и встроенной покупкой. Подсказка с «Забрать Искру» остаётся
              // в ленте как бесплатный путь после закрытия шторки (закон 13.06 — ценность и мягкое предложение).
              try { if (typeof window.scPwShow === 'function') window.scPwShow('q'); } catch(_) {}
              return;
            }
            var answer = (json && json.data && json.data.answer) || (json && json.answer) || null;
            if (answer) {
              scPageAddMsg('soul', answer);
              // VK: после ответа — разовое приглашение в сообщество (Алла 29.07)
              try { _scMaybeShowCommunityInvite(); } catch(_) {}
              // Синхронизируем счётчик пробных вопросов / Искр из ответа backend
              if (json.data) {
                var _freeWas = Number(window._scOracleFreeLeft); // до присваивания — для вехи «>0 → 0»
                window._scOracleUnlimited = !!json.data.oracle_unlimited;
                if (json.data.oracle_free_left != null) window._scOracleFreeLeft = Number(json.data.oracle_free_left);
                if (json.data.oracle_balance != null) window._scOracleBalance = Number(json.data.oracle_balance);
                if (typeof scRenderOracleCounter === 'function') scRenderOracleCounter();
                try { _scOracleFreeMilestones(_freeWas); } catch(_) {}
              }
              // Обновляем кэш истории в localStorage
              try {
                var cacheKey = 'scHistory_' + (window._tgUserId || 'anon');
                var cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
                cached.push({ question: question, answer: answer, created_at: new Date().toISOString() });
                localStorage.setItem(cacheKey, JSON.stringify(cached.slice(-50)));
              } catch(ex) {}
            } else if (json && json.error) {
              scPageHideTyping();
              // Batch 9.21 (отчёт 7263926, Android): при превышении rate-limit
              // backend возвращал {error: "rate_limit"} — frontend выводил
              // raw "rate_limit" в чате. Теперь маппинг error code →
              // локализованный текст (предпочитаем json.message если есть,
              // потом локальный fallback, и raw error только как последний
              // вариант для неизвестных кодов).
              var _errCode = json.error_code || json.error;
              var _errMsg = json.message
                || (resp.status === 429 ? (typeof t === 'function' ? (t('toastRateLimit') || 'Слишком много попыток. Подожди немного и попробуй снова.') : 'Слишком много попыток. Подожди немного и попробуй снова.')
                    : (_errCode === 'rate_limit' ? (typeof t === 'function' ? (t('toastRateLimit') || 'Слишком много попыток. Подожди немного.') : 'Слишком много попыток.')
                    : (json.error || _errCode)));
              scPageAddMsg('soul', '❌ ' + _errMsg);
              // VK Testers 7278604 (Тимури Windows 17.05): когда backend требует
              // профиль для чата — добавляем CTA-кнопку «Заполнить профиль»
              // вместо одного текста. Юзер видит куда идти.
              if (json.error_code === 'errChatNeedsProfile' || /Заполни профиль/i.test(json.error || '')) {
                try {
                  var _profileBtnHtml = '<div style="margin-top:8px;"><button type="button" onclick="if(typeof goToPage===\'function\'){window.returnToPage=\'soulChatPage\';goToPage(\'profilePage\');}" style="padding:8px 16px;border-radius:9999px;background:linear-gradient(135deg,#a78bfa,#ec4899);border:none;color:#fff;font-size:0.85rem;cursor:pointer;font-family:inherit;font-weight:600;">' + ((typeof t === 'function' && t('fillProfileCta')) || 'Заполнить профиль') + ' →</button></div>';
                  var _chatEl = document.getElementById('scPageChat');
                  if (_chatEl && _chatEl.lastElementChild) _chatEl.lastElementChild.insertAdjacentHTML('beforeend', _profileBtnHtml);
                } catch(_) {}
              }
              // Не вызываем initSoulChatPage() — иначе сбрасывается весь диалог.
              // Только если это 403 (доступ закончился) — предлагаем продлить через toast, а не ре-инит.
              if (json.need_payment) {
                if (typeof showToast === 'function') showToast(t('toastScExpired'));
              }
            } else {
              scPageAddMsg('soul', '🌙 Оракул задумался. Спроси ещё раз — я рядом.');
            }
          } catch(e) {
            scPageHideTyping();
            scPageAddMsg('soul', '🌙 Связь прервалась. Попробуй ещё раз — я никуда не ухожу.');
          } finally {
            // VK Testers 7263766 ПЕРЕОТКРЫТ (17.05): finally безусловно делал
            // sendBtn.disabled = false → после первой отправки кнопка ВСЕГДА
            // активна, даже если input пустой/только пробелы. Фикс: применяем
            // ту же проверку что в input handler — disabled зависит от value.
            if (sendBtn) sendBtn.disabled = questionEl.value.trim().length === 0;
            if (statusEl) statusEl.style.display = 'none';
          }
        });

        // Счётчик символов и авто-ресайз
        var charHintEl = document.getElementById('scPageCharHint');
        questionEl.addEventListener('input', function() {
          var len = questionEl.value.length;
          if (charHintEl) charHintEl.textContent = len > 10 ? len + ' симв.' : '';
          // Batch 8.14 (7263766 MacOS Низкий): "Кнопка отправки активна когда введён
          // только пробел". Используем trim — disabled если пусто ИЛИ только whitespace.
          if (sendBtn) sendBtn.disabled = questionEl.value.trim().length === 0;

          // Авто-ресайз
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
          if (!this.value) this.style.height = '30px';
        });

        // Инициализация состояния кнопки (Batch 8.14: trim для пробелов)
        if (sendBtn) sendBtn.disabled = questionEl.value.trim().length === 0;

        // Ctrl+Enter/Cmd+Enter для отправки
        questionEl.addEventListener('keydown', function(e) {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendBtn.click();
        });
      })();
      // ═══════════════════════════════════════════

      // Навигация по страницам (оверлей оплаты не закрываем здесь — только в блоке возврата и по кнопке «Назад»)
      // ── Мои подарки: список купленных подарочных промокодов. Даритель спрашивал «где найти
      //    оплаченный промокод?» — код показывался лишь раз на экране успеха и терялся. Раздел на
      //    странице «Подарки» тянет их из /api/gift/my-purchased. Закон №37: без error-UI — при
      //    сбое раздел просто остаётся скрытым (скелетона нет, это доп-блок, не критичный путь).
      window._loadMyGifts = async function () {
        var wrap = document.getElementById('giftsMyGifts');
        var list = document.getElementById('giftsMyGiftsList');
        if (!wrap || !list) return;
        // §6.12 market-rules (отказ VK 10.07): промокоды на VK запрещены — раздел
        // «Мои подарки» (список купленных кодов) не грузим и не показываем (скрыт и CSS).
        if (window._isVkMiniApp || window._appEnv === 'vk') { wrap.style.display = 'none'; return; }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || typeof hasAuth !== 'function' || !hasAuth()) { wrap.style.display = 'none'; return; }
        try {
          var _fetch = window.fetchWithTimeout
            ? function (u, o) { return window.fetchWithTimeout(u, o, 15000); }
            : fetch;
          var resp = await _fetch(apiBase + '/api/gift/my-purchased', { headers: getAuthHeaders() });
          var data = await resp.json().catch(function () { return {}; });
          if (!resp.ok || !data.ok || !Array.isArray(data.gifts) || !data.gifts.length) { wrap.style.display = 'none'; return; }
          list.textContent = '';
          data.gifts.forEach(function (g) { list.appendChild(_buildMyGiftRow(g)); });
          wrap.style.display = '';
        } catch (e) {
          console.warn('[MyGifts] load', e);
          wrap.style.display = 'none';
        }
      };
      function _buildMyGiftRow(g) {
        var _t = function (k, f) { return typeof t === 'function' ? t(k) : f; };
        var row = document.createElement('div');
        row.className = 'mg-row' + (g.redeemed ? ' is-used' : '');
        var top = document.createElement('div');
        top.className = 'mg-top';
        var code = document.createElement('span');
        code.className = 'mg-code';
        code.textContent = g.code || '';
        var badge = document.createElement('span');
        badge.className = 'mg-badge ' + (g.redeemed ? 'used' : 'pending');
        badge.textContent = g.redeemed ? _t('giftCodeUsed', 'Активирован') : _t('giftCodePending', 'Ждёт активации');
        top.appendChild(code); top.appendChild(badge); row.appendChild(top);
        if (g.to_name) {
          var forEl = document.createElement('div');
          forEl.className = 'mg-for';
          forEl.textContent = _t('giftCodeFor', 'Для: ') + g.to_name;
          row.appendChild(forEl);
        }
        var actions = document.createElement('div');
        actions.className = 'mg-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button'; copyBtn.className = 'mg-btn mg-copy';
        copyBtn.textContent = _t('giftCodeCopy', 'Копировать');
        copyBtn.addEventListener('click', function () {
          if (window._copyToClipboard) { window._copyToClipboard(g.code || ''); if (window.showToast) window.showToast(_t('gpCodeCopied', 'Код скопирован ✓')); }
        });
        var sendBtn = document.createElement('button');
        sendBtn.type = 'button'; sendBtn.className = 'mg-btn mg-send';
        sendBtn.textContent = _t('giftCodeSend', 'Отправить');
        sendBtn.addEventListener('click', function () {
          if (typeof window._gpShareCode === 'function') window._gpShareCode(g.code || '');
          else if (window._copyToClipboard) { window._copyToClipboard(g.code || ''); if (window.showToast) window.showToast(_t('gpCodeCopied', 'Код скопирован ✓')); }
        });
        actions.appendChild(copyBtn); actions.appendChild(sendBtn); row.appendChild(actions);
        return row;
      }
      function goToPage(pageId) {
        if (typeof console !== 'undefined') console.log('[goToPage] переход на', pageId);
        // Метка времени навигации — защита от спонтанных VK back-событий, которые
        // бросают со свежей страницы (Подарки) на home сразу после перехода (баг 9.35).
        try { window._lastNavAt = Date.now(); } catch(_) {}
        if (!pageId) {
          console.warn('[goToPage] pageId пустой — переходим на homePage');
          pageId = 'homePage';
        }
        // Тихая доначисление-проверка бонуса за сообщество при заходе в профиль.
        // Ловит тех, кто вступил в группу мимо нашей кнопки (из ленты, по ссылке
        // друга) — без неё Искры не приходили вообще. Один вызов на сессию,
        // только на VK/OK и только пока бонус не выдан.
        if (pageId === 'profilePage' && !window._vkCommPassiveChecked) {
          try {
            var _cpOk = window._appEnv === 'ok' || window._isOkMiniApp === true;
            var _cpVk = !_cpOk && (window._appEnv === 'vk' || window._isVkMiniApp === true);
            var _cpDone = false; try { _cpDone = !!localStorage.getItem('ys_vk_comm_joined'); } catch(_) {}
            if ((_cpVk || _cpOk) && !_cpDone && typeof window._vkCommunityVerifyQuiet === 'function') {
              window._vkCommPassiveChecked = true;
              setTimeout(function() { window._vkCommunityVerifyQuiet(); }, 1200);
            }
          } catch(_) {}
        }
        // Метка времени навигации — защита от спонтанных VK back-событий (порт фикса 9.35 на прод)
        try { window._lastNavAt = Date.now(); } catch(_) {}
        // Batch 8.15 (7263771 Android Средний): «Аудио продолжает играть при переходе
        // из плеера в другие разделы». При уходе с myTracksPage останавливаем audio.
        try {
          var _wasOnTracks = document.body.dataset.page === 'myTracksPage';
          if (_wasOnTracks && pageId !== 'myTracksPage' && window._audio && !window._audio.paused) {
            window._audio.pause();
            // Обновим play-кнопку в карточке
            if (typeof window._mtUpdatePlayButtons === 'function') window._mtUpdatePlayButtons();
          }
        } catch(_) {}
        // ── Стек истории навигации (фикс 16.06): «назад» = на ШАГ назад, не на главную ──
        // Пушим покидаемую страницу. _navBack (ставит goBack) = не пушить при возврате.
        try {
          if (!window._navStack) window._navStack = [];
          var _fromPage = document.body.dataset.page;
          // Переход через нижний таббар (_tabNav ставит bindNavButtons) = переключение КОРНЕЙ:
          // НЕ пушим покидаемую страницу и чистим стек — «Назад» с таббар-экрана всегда ведёт
          // на главную (Алла+Ярослав 10.07). Чистка именно ЗДЕСЬ: раньше bindNavButtons чистил
          // ДО goToPage, а этот блок тут же пушил покидаемую страницу обратно.
          if (window._tabNav) {
            window._tabNav = false;
            window._navStack = [];
          } else if (!window._navBack && _fromPage && _fromPage !== pageId && _fromPage !== 'loadingPage') {
            if (window._navStack[window._navStack.length - 1] !== _fromPage) window._navStack.push(_fromPage);
            if (window._navStack.length > 25) window._navStack.shift();
          }
          window._navBack = false;
        } catch (_) {}
        document.body.dataset.page = pageId;
        try { document.body.style.overflow = ''; } catch(_) {} // safety net: сброс залипшего scroll-lock при навигации (Алла 24.06)
        // Убираем бейдж при переходе на «Мои треки»
        if (pageId === 'myTracksPage' && typeof window._markTracksAsSeen === 'function') window._markTracksAsSeen();
        // Этап 1: вход на Плейлист — всегда вкладка «Мои треки», без торчащего плеера/шторки.
        if (pageId === 'myTracksPage' && typeof window._mtResetView === 'function') setTimeout(window._mtResetView, 0);
        // Пакеты/пополнение: баланс, цены и переводы — при любом входе, не только с кнопок профиля
        // (аудит 23.09: прямой переход на EN оставлял «0 Искр»/«100 Искр» по-русски)
        if (pageId === 'plansPage' && typeof window._initPlansPage === 'function') setTimeout(window._initPlansPage, 0);
        if (pageId === 'topupPage' && typeof window._initTopupPage === 'function') setTimeout(window._initTopupPage, 0);
        var menu = document.getElementById('homeAppMenu');
        if (menu) menu.querySelectorAll('.home-app-menu-btn').forEach(function(btn){ btn.classList.toggle('active', btn.getAttribute('data-nav') === pageId); });
        if (window._previewMode) document.documentElement.classList.remove('web-loading');
        var currentPage = document.querySelector('.page.active');
        
        try { if (tg && tg.MainButton && tg.MainButton.hide) tg.MainButton.hide(); } catch(e) { console.warn('[goToPage] MainButton error:', e); }
        // Telegram BackButton: показываем на всех страницах кроме главной
        try {
          if (tg && tg.BackButton) {
            if (pageId === 'homePage') tg.BackButton.hide();
            else tg.BackButton.show();
          }
        } catch(e) { console.warn('[goToPage] BackButton error:', e); }
        // Всегда проверяем кнопку оплаты при переходах между страницами
        ensurePayButtonText();
        
        var target = document.getElementById(pageId);
        if (!target) {
          console.warn('[goToPage] Страница не найдена:', pageId, '— переходим на homePage');
          target = document.getElementById('homePage');
          if (!target) return;
        }
        // При любом переходе принудительно скрываем экран входа, чтобы он не перекрывал контент (защита от рецидива бага)
        document.documentElement.classList.remove('web-loading');
        var _loginScreen = document.getElementById('webLoginScreen');
        if (_loginScreen) {
          _loginScreen.style.setProperty('display', 'none', 'important');
          _loginScreen.style.setProperty('pointer-events', 'none', 'important');
        }
        // Сбрасываем inline-стили у нецелевых страниц — скрытие через CSS (.page без .active). Не ставим display:none !important, чтобы элементы оставались в DOM и подсвечивались в инспекторе
        document.querySelectorAll('.page').forEach(function(page) {
          page.style.visibility = '';
          if (page !== target) {
            page.classList.remove('active');
            page.removeAttribute('role');
            page.setAttribute('aria-hidden', 'true');
            page.style.display = '';
            page.style.opacity = '';
            page.style.pointerEvents = '';
          }
        });
        target.classList.add('active');
        // Move spiral canvas into active page (behind content, above gradient)
        var _sc = document.getElementById('globalSpiral');
        if (_sc) {
          // Оракул и его вкладки (Чат/Дневник/Разборы = тот же #soulChatPage) — БЕЗ
          // спирали Фибоначчи (Алла 17.06): прячем canvas. На других страницах — как было.
          if (['soulChatPage','profilePage','helpPage','partnerDashPage','partnerApplyPage'].indexOf(target.id) !== -1) { _sc.style.display = 'none'; }
          else { _sc.style.display = ''; target.insertBefore(_sc, target.firstChild); }
        }
        target.setAttribute('role', 'main');
        target.setAttribute('aria-hidden', 'false');
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('opacity', '1', 'important');
        target.style.setProperty('display', 'flex', 'important');
        target.style.setProperty('pointer-events', 'auto', 'important');
        // Чтобы главная не перекрывала при переходе на другую страницу — явно скрываем только её
        if (target.id !== 'homePage') {
          var homeEl = document.getElementById('homePage');
          if (homeEl) homeEl.style.setProperty('display', 'none', 'important');
        }
        // В превью (веб без TG): при переходе на профиль или Разговор по душам убираем web-loading
        if (window._previewMode && (pageId === 'profilePage' || pageId === 'soulChatPage')) {
          document.documentElement.classList.remove('web-loading');
        }
        // Сброс скролла у .page-scroll / .profile-scroll целевой страницы
        try {
          var scrollArea = document.querySelector('#' + pageId + ' .page-scroll') || (pageId === 'profilePage' ? document.querySelector('#profilePage .profile-scroll') : null);
          if (scrollArea) {
            scrollArea.scrollTop = 0;
          }
          if (pageId === 'soulChatPage') {
            // Скролл чата к низу делаем после загрузки истории в initSoulChatPage, не сбрасываем здесь
          }
        } catch(e) {}
        // Контекстная подсказка при первом посещении страницы
        if (typeof window._showPageHint === 'function') {
          setTimeout(function() { window._showPageHint(pageId); }, 600);
        }
        if (pageId === 'formPage') {
          // Детерминированный сброс формы при КАЖДОМ входе (Алла 05.07): чистим поля обоих
          // людей и состояние выбора ДО async-префилла — иначе после выхода/повторного входа
          // остаётся стейл-микс (аккордеон одного человека + поля другого). Ниже async-загрузки
          // (loadSavedProfileForForm / loadForWhoSelect) и hero-вход (_applyHeroRequest) заполнят
          // форму заново из одного источника; черновик (_restoreFormDraft) вернёт непустой ввод.
          if (typeof window.resetFormState === 'function') { try { window.resetFormState(); } catch(_) {} }
          // VK Testers 7274996 (MacOS 14.05.2026): «Сразу после перехода
          // на странице отображается некорректное уведомление "Песня придёт
          // в этот чат с ботом"». Корень: submitHint персистил из прошлой
          // сессии (после fail submission). Сбрасываем при каждом открытии формы.
          var _shForm = document.getElementById('submitHint');
          if (_shForm) { _shForm.textContent = ''; _shForm.style.display = 'none'; }
          // Состояние свёрнуто/развёрнуто задаёт только loadSavedProfileForForm (ЗАКОН №20: при сохранённых данных — свёрнуто)
          if (window.subscriptionCancelledByUser) {
            var forWhoWrap = document.getElementById('forWhoWrap');
            if (forWhoWrap) forWhoWrap.style.display = 'none';
          }
          // Свежий запрос тарифа при каждом открытии формы (если подписка куплена после загрузки страницы)
          _loadMePromise = loadMe();
          var _applyTariffToForm = function() {
            if (userTariff === 'master' && !window.subscriptionCancelledByUser) loadForWhoSelect();
          };
          if (_loadMePromise) _loadMePromise.then(_applyTariffToForm).catch(_applyTariffToForm);
          else _applyTariffToForm();
          // Баг доходимости C: после автозаполнения профиля восстанавливаем черновик
          // формы (приоритет черновика на пустых полях) и включаем автосохранение.
          Promise.resolve(loadSavedProfileForForm()).then(function(){
            if (typeof _restoreFormDraft === 'function') _restoreFormDraft();
            if (typeof _wireFormDraftSave === 'function') _wireFormDraftSave();
          }).catch(function(){
            if (typeof _restoreFormDraft === 'function') _restoreFormDraft();
            if (typeof _wireFormDraftSave === 'function') _wireFormDraftSave();
          });
        }
        if (pageId === 'giftsPage') {
          // Искра дня (claim) переехала сюда из главной — грузим при открытии «Подарков»
          if (typeof initIskraClaim === 'function') initIskraClaim();
          // Мои подарки — купленные промокоды (обновляем при каждом открытии: статус активации мог измениться)
          if (typeof window._loadMyGifts === 'function') window._loadMyGifts();
        }
        if (pageId === 'homePage') {
          if (typeof loadReferralStats === 'function') loadReferralStats();
          if (window.initHomePageInteractive) window.initHomePageInteractive();
          setTimeout(function() { if (typeof fixHomePageVisibility === 'function') fixHomePageVisibility(); }, 50);
          // Проверяем непрочитанные треки при каждом переходе на главную
          if (typeof window._checkUnseenTracks === 'function') window._checkUnseenTracks();
        }
        if (pageId === 'profilePage') {
          if (typeof loadProfilePage === 'function') loadProfilePage();
          if (typeof window.checkAdminAndShowLink === 'function') setTimeout(window.checkAdminAndShowLink, 100);
          (function forceProfileVisible() {
            var p = document.getElementById('profilePage');
            if (!p || !p.classList.contains('active')) return;
            p.style.setProperty('visibility', 'visible', 'important');
            p.style.setProperty('opacity', '1', 'important');
            p.style.setProperty('display', 'flex', 'important');
            var scr = document.querySelector('#profilePage .profile-scroll');
            var hdr = document.querySelector('#profilePage .profile-header');
            if (scr) {
              scr.style.setProperty('visibility', 'visible', 'important');
              scr.style.setProperty('opacity', '1', 'important');
              scr.style.setProperty('display', 'block', 'important');
              scr.style.overflowY = 'auto';
              scr.style.webkitOverflowScrolling = 'touch';
              scr.style.minHeight = '0';
              scr.style.flex = '1 1 0';
              scr.scrollTop = 0;
            }
            if (hdr) {
              hdr.style.setProperty('visibility', 'visible', 'important');
              hdr.style.setProperty('opacity', '1', 'important');
              hdr.style.setProperty('display', 'flex', 'important');
            }
            document.querySelectorAll('#profilePage .profile-plan-card, #profilePage .ppc-features, #profilePage .header-menu-btn').forEach(function(el) {
              el.style.setProperty('visibility', 'visible', 'important');
              el.style.setProperty('opacity', '1', 'important');
            });
          })();
          setTimeout(function() {
            var scr = document.querySelector('#profilePage .profile-scroll');
            if (scr) {
              scr.scrollTop = 0;
              requestAnimationFrame(function() { scr.scrollTop = 0; });
            }
          }, 80);
        }
        if (pageId === 'paymentThanksPage') {
          var _afsBlock = document.getElementById('afterFirstSongBlock');
          if (_afsBlock) _afsBlock.style.display = 'none';
          // После любой успешной оплаты — перечитать /api/me: подтянуть has_purchased_package
          // (снимает замок форматов couple/transit сразу, без перезапуска приложения).
          if (typeof loadMe === 'function') { try { loadMe(); } catch(_) {} }
        }
        // paymentPage теперь overlay — здесь ничего не делаем
        // Soul Chat блок удалён со successPage — initSoulChat вызывать не нужно
        // oracleFeedPage removed — diary is inside soulChatPage tabs
        if (pageId === 'soulChatPage') {
          // Видимость Оракула — ЦЕЛИКОМ на CSS [data-state] (initSoulChatPage синхронно
          // ставит data-state='loading'). Убраны forceSoulChatVisible + гонки 50/200мс:
          // они форсили inline display:flex поверх loading-состояния → мерцание старых
          // экранов (промо/no-request) при входе в Оракул (Алла 17.06).
          document.documentElement.classList.remove('web-loading');
          initSoulChatPage();
        }
        if (pageId === 'successPage') { initSuccessInteractiveBlob(); _initOracleOptin(); _initGenStages(); }
        if (pageId === 'adminPage') { /* веб-админка открывается по кнопке */ }
        // Batch 9.10: показываем sticky-banner возврата к pending форме
        if (typeof window._renderPendingDraftBanner === 'function') {
          try { window._renderPendingDraftBanner(pageId); } catch(_) {}
        }
        // Онбординг-карусель НЕ должна переживать переходы (репро фриза Дарины 09.07, бета):
        // z=10000 fixed-слой оставался поверх формы после goToPage → «не скроллится, назад
        // не выходит». Любой переход на обычную страницу прячет карусель (ключ «просмотрено»
        // не ставим — недосмотренная покажется при следующем чистом входе).
        try {
          var _obLayer = document.getElementById('onboardingPage');
          if (_obLayer && _obLayer.style.display !== 'none' && getComputedStyle(_obLayer).display !== 'none') {
            _obLayer.style.display = 'none';
          }
        } catch(_) {}
        // При возврате на formPage — снимаем флаг pending черновика
        if (pageId === 'formPage') {
          window._pendingDraftActive = false;
          // Progressive-подсветка формы: старт после отрисовки страницы (внутри — 2×rAF, закон №30)
          if (typeof window._startFormGuide === 'function') { try { window._startFormGuide(); } catch(_) {} }
        } else if (typeof window._stopFormGuide === 'function') {
          try { window._stopFormGuide(); } catch(_) {}
        }
        if (document.getElementById('previewNav') && document.getElementById('previewNav').classList.contains('show')) {
          document.querySelectorAll('.preview-nav button').forEach(function(btn) {
            btn.classList.remove('active');
          });
          var pageMap = { 'homePage': 'home', 'formPage': 'form', 'paymentPage': 'payment', 'successPage': 'success', 'heroesPage': 'heroes', 'paymentThanksPage': 'payment' };
          var activeBtn = document.querySelector('.preview-nav button[data-page="' + (pageMap[pageId] || '') + '"]');
          if (activeBtn) activeBtn.classList.add('active');
        }
      }
      function openWebAdmin() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var url = base ? base + '/admin' : '#';
        if (url === '#') return;
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(url);
        else window.open(url, '_blank');
      }
      window.openWebAdmin = openWebAdmin;
      // Делаем goToPage глобальной — нужно для onclick-атрибутов (кнопка Помощь, кнопки назад)
      window.goToPage = goToPage;
      // VK Testers 7257194 ПЕРЕОТКРЫТ (17.05): «Некорректная навигация после
      // возвращения со страницы создания трека». Корень: window.returnToPage
      // жил только в JS-памяти. При reload (особенно в VK iframe который любит
      // перезагружать app) → null → юзер тыкает back → попадает не туда.
      // Persist через sessionStorage (живёт пока tab открыт).
      try {
        var _persistedReturn = sessionStorage.getItem('yup_return_to_page');
        window.returnToPage = _persistedReturn || null;
      } catch(_) { window.returnToPage = null; }
      // Перехватчик: при любой записи в window.returnToPage — сохраняем в sessionStorage
      try {
        Object.defineProperty(window, 'returnToPage', {
          get: function() { return window._returnToPageVal; },
          set: function(v) {
            window._returnToPageVal = v;
            try { if (v) sessionStorage.setItem('yup_return_to_page', String(v));
                  else sessionStorage.removeItem('yup_return_to_page'); } catch(_) {}
          },
          configurable: true
        });
        // Initial sync
        window._returnToPageVal = _persistedReturn || null;
      } catch(_) {}

      // ── bindNavButtons: обработчик кликов нижнего меню (#homeAppMenu) по data-nav ──
      // Кнопки имеют data-nav="pageId" и data-return="returnPage".
      // Делегированный обработчик на контейнере — один на всё меню.
      (function bindNavButtons() {
        var menu = document.getElementById('homeAppMenu');
        if (!menu) return;
        menu.addEventListener('click', function(e) {
          var btn = e.target.closest('[data-nav]');
          if (!btn) return;
          var targetPage = btn.getAttribute('data-nav');
          var returnPage = btn.getAttribute('data-return') || 'homePage';
          if (!targetPage) return;
          if (typeof console !== 'undefined') console.log('[Nav] Клик по меню →', targetPage);
          window.returnToPage = returnPage;
          // Таббар = переключение КОРНЕЙ, не углубление (Алла+Ярослав 10.07: «плейлист → таббаром
          // подарки → Назад» вело в плейлист вместо главной). Флаг _tabNav: goToPage по нему НЕ пушит
          // покидаемую страницу и чистит стек (чистить здесь нельзя — goToPage пушил бы обратно).
          // Реальная вложенность (профиль и т.п.) не задета — туда ходят не через таббар.
          window._tabNav = true;
          if (targetPage === 'soulChatPage') {
            // Soul Chat: специальный переход через goToSoulChat (сбрасывает историю)
            if (typeof window.goToSoulChat === 'function') {
              window.goToSoulChat();
            } else {
              goToPage('soulChatPage');
            }
          } else if (targetPage === 'heroesPage') {
            goToPage('heroesPage');
            if (typeof initHeroesPage === 'function') initHeroesPage();
          } else {
            goToPage(targetPage);
            if (targetPage === 'myTracksPage') {
              if (typeof window._markTracksAsSeen === 'function') window._markTracksAsSeen();
              if (typeof window.loadMyTracks === 'function') window.loadMyTracks(false);
            }
          }
        });
      })();
      // Принудительно показываем контент главной (градиент не должен перекрывать кнопки и текст)
      function fixHomePageVisibility() {
        var homePage = document.getElementById('homePage');
        var mainWrap = homePage ? homePage.querySelector('.home-main-wrap') : null;
        var loginMain = document.getElementById('webLoginScreen');
        var loginWrap = loginMain ? loginMain.querySelector('.home-main-wrap') : null;
        if (homePage && homePage.classList.contains('active') && mainWrap) {
          mainWrap.style.display = 'flex';
          mainWrap.style.zIndex = '100';
          mainWrap.style.position = 'relative';
          mainWrap.style.visibility = 'visible';
          mainWrap.style.opacity = '1';
        }
        if (loginMain && loginMain.style.display === 'flex' && loginWrap) {
          loginWrap.style.display = 'flex';
          loginWrap.style.zIndex = '100';
          loginWrap.style.position = 'relative';
          loginWrap.style.visibility = 'visible';
          loginWrap.style.opacity = '1';
        }
      }
      window.fixHomePageVisibility = fixHomePageVisibility;
      setTimeout(fixHomePageVisibility, 100);
      setTimeout(fixHomePageVisibility, 1000);
      setTimeout(fixHomePageVisibility, 3000);
      // Превью: открыть сразу нужную страницу по параметру ?page=… (ЗАКОН №5: по умолчанию — главная, не стартовая)
      if (window._previewMode && typeof location !== 'undefined' && location.search) {
        try {
          var sp = new URLSearchParams(location.search);
          var pageParam = sp.get('page');
          if (pageParam === 'payment' && typeof showPaymentOverlay === 'function') showPaymentOverlay();
          else if (pageParam === 'login') {
            // ЗАКОН: в превью открываем главную, не стартовую (экран входа). page=login игнорируем → homePage
            goToPage('homePage');
            var pn = document.getElementById('previewNav');
            if (pn && pn.classList.contains('show')) {
              document.querySelectorAll('.preview-nav button').forEach(function(btn) { btn.classList.remove('active'); });
              var homeBtn = document.querySelector('.preview-nav button[data-page="home"]');
              if (homeBtn) homeBtn.classList.add('active');
            }
          } else {
            var pageIdFromParam = { loading: 'successPage', success: 'successPage', form: 'formPage', home: 'homePage', soulChatPage: 'soulChatPage', helpPage: 'helpPage', profilePage: 'profilePage' }[pageParam];
            if (pageIdFromParam) {
              goToPage(pageIdFromParam);
              if (pageIdFromParam === 'soulChatPage') {
                var soulChatState = sp.get('soulChatState');
                var scPage = document.getElementById('soulChatPage');
                if (scPage && soulChatState === 'chat') {
                  scPage.dataset.state = 'chat';
                  // Убираем inline display у промо/шапки, иначе они остаются видимыми поверх чата («две страницы сразу»)
                  var scHeader = document.getElementById('scHeader');
                  var scPromoArea = document.getElementById('scPromoArea');
                  if (scHeader) { scHeader.style.removeProperty('display'); scHeader.style.removeProperty('visibility'); scHeader.style.removeProperty('opacity'); }
                  if (scPromoArea) { scPromoArea.style.removeProperty('display'); scPromoArea.style.removeProperty('visibility'); scPromoArea.style.removeProperty('opacity'); }
                  setTimeout(function() {
                    if (scPage) scPage.dataset.state = 'chat';
                    if (scHeader) { scHeader.style.removeProperty('display'); scHeader.style.removeProperty('visibility'); scHeader.style.removeProperty('opacity'); }
                    if (scPromoArea) { scPromoArea.style.removeProperty('display'); scPromoArea.style.removeProperty('visibility'); scPromoArea.style.removeProperty('opacity'); }
                  }, 400);
                }
              }
            } else goToPage('homePage'); // ?preview=1 без page= — главная
          }
        } catch (e) {}
      }
      function goBack() {
        // Этап 1: слоисто — сначала закрыть открытый оверлей (шторку → плеер), не уходя со страницы.
        // История разговоров Оракула лежит поверх страницы — «назад» сначала закрывает её.
        try { if (window._scHistClose && window._scHistClose()) return; } catch(_) {}
        try { if (window._mtCloseTopOverlay && window._mtCloseTopOverlay()) return; } catch(_) {}
        // Стек истории: «назад» = на ШАГ назад. Падаем на returnToPage/home если стек пуст.
        if (!window._navStack) window._navStack = [];
        var target = (window._navStack.length ? window._navStack.pop() : null) || window.returnToPage || 'homePage';
        window.returnToPage = null;
        window._navBack = true;
        try {
          if (typeof goToPage === 'function') goToPage(target);
          else document.getElementById(target) && document.querySelectorAll('.page').forEach(function(p){ p.classList.toggle('active', p.id === target); });
        } catch (e) {
          try { goToPage('homePage'); } catch (e2) {}
        }
      }
      window.goBack = goBack;
      // Терминальные экраны (успех/оплата) не должны запирать в петле: уход с успеха в
      // кросс-селл (Мои треки/Оракул) чистит back-стек и целит «назад» на главную, а не
      // обратно на успех. Плюс на успехе есть видимая кнопка «На главную» (закон:
      // экраны оплаты/успеха ОБЯЗАНЫ давать выход на главную за ≤1 нажатие).
      function _leaveSuccessTo(pageId) {
        goToPage(pageId);
        // goToPage сам пушит покидаемую (success) страницу в _navStack — поэтому чистим
        // стек и целим returnToPage на главную ПОСЛЕ навигации, иначе «назад» с целевого
        // экрана вернёт в петлю успеха (проверено live: без этого TRAP=true).
        try { window._navStack = []; } catch (_) {}
        window.returnToPage = 'homePage';
      }
      window._leaveSuccessTo = _leaveSuccessTo;
      function goToProfileFrom(from) { window.returnToPage = from; goToPage('profilePage'); }
      function goToMasterPlanFrom(from) {
        window.returnToPage = from;
        goToPage('profilePage');
        setTimeout(function() {
          var el = document.getElementById('planCardMaster');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
      window.goToMasterPlanFrom = goToMasterPlanFrom;
      function goToHeroesFrom(from) { window.returnToPage = from; goToPage('heroesPage'); initHeroesPage(); }
      function goToHelpFrom(from) { window.returnToPage = from; goToPage('helpPage'); }
      window.goToProfileFrom = goToProfileFrom;
      window.goToHeroesFrom = goToHeroesFrom;
      window.goToHelpFrom = goToHelpFrom;

      // Применение конфига навигации с сервера (редактор в админке): кнопка → страница.
      // ЗАПРЕЩЕНО: soulChatBtn всегда ведёт на soulChatPage, никогда на profilePage (закон проекта).
      function applyNavigationConfig(mappings) {
        if (!mappings || typeof mappings !== 'object') return;
        window.__navConfig = mappings;
        var homeNavIds = { soulChatBtn: 1, goHelpBtn: 1, goHeroesBtn: 1, goMyTracksBtn: 1 };
        Object.keys(mappings).forEach(function(buttonId) {
          if (homeNavIds[buttonId]) return;
          var el = document.getElementById(buttonId);
          if (!el) return;
          if (el.id === 'soulChatBtn') return;
          var m = mappings[buttonId];
          var target = typeof m === 'string' ? m : (m && m.target) ? m.target : '';
          if (!target) return;
          var returnFrom = (m && typeof m === 'object' && m.returnFrom) ? m.returnFrom : null;
          el.onclick = function() {
            if (returnFrom) window.returnToPage = returnFrom;
            if (buttonId === 'paymentThanksBackBtn' && typeof goToPage === 'function') goToPage(target);
            else if (typeof goToPage === 'function') goToPage(target);
          };
        });
        // Нижняя панель (#homeAppMenu) управляется только через data-nav в bindNavButtons, onclick не ставим
      }
      window.applyNavigationConfig = applyNavigationConfig;

      // === Нижняя панель и навигация (один контур для нижней панели) ===
      // Чеклист запрещённых действий (см. также docs/NAV_AND_UI_RULES.md): не вешать onclick на soulChatBtn/goHelpBtn/goHeroesBtn/goMyTracksBtn из конфига; не показывать #webLoginScreen поверх главной после старта; не давать глобально pointer-events:none без исключения для #homeAppMenu и кнопок.

      // Загрузка конфига навигации с сервера (редактор в админке) и применение
      (function loadNavigationConfig() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base) return;
        fetch(base + '/api/config/navigation').then(function(r) { return r.json(); }).then(function(data) {
          if (data && data.mappings && typeof applyNavigationConfig === 'function') applyNavigationConfig(data.mappings);
        }).catch(function() {});
      })();

      // Применение дизайна градиентов (цвета и интенсивность) с сервера
      function applyDesignConfig(design) {
        if (!design || typeof design !== 'object') return;
        var cssVars = [];
        var map = { g_bg1: '--g-bg1', g_bg2: '--g-bg2', g_c1: '--g-c1', g_c2: '--g-c2', g_c3: '--g-c3', g_ci: '--g-ci', g_blend: '--g-blend', g_blob_opacity: '--g-blob-opacity', g_blob_mid: '--g-blob-mid', g_blob_edge: '--g-blob-edge', g_int_opacity: '--g-int-opacity', g_int_strong: '--g-int-strong', g_int_mid: '--g-int-mid', g_int_soft: '--g-int-soft' };
        for (var k in map) {
          if (design[k] !== undefined && design[k] !== null && design[k] !== '') cssVars.push(map[k] + ':' + design[k]);
        }
        if (cssVars.length === 0) return;
        var styleId = 'design-override';
        var el = document.getElementById(styleId);
        if (!el) { el = document.createElement('style'); el.id = styleId; document.head.appendChild(el); }
        el.textContent = '#homePage,#webLoginScreen{' + cssVars.join(';') + '}';
      }
      window.applyDesignConfig = applyDesignConfig;
      (function loadDesignConfig() {
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!base) return;
        fetch(base + '/api/config/design').then(function(r) { return r.json(); }).then(function(design) {
          if (design && typeof applyDesignConfig === 'function') applyDesignConfig(design);
        }).catch(function() {});
      })();

      // Сворачиваемый реферальный блок
      var referralToggleBtn = document.getElementById('referralToggleBtn');
      if (referralToggleBtn) {
        referralToggleBtn.addEventListener('click', function() {
          var body = document.getElementById('referralBody');
          var chevron = document.getElementById('referralToggleChevron');
          if (!body) return;
          var isOpen = body.style.display !== 'none';
          body.style.display = isOpen ? 'none' : 'block';
          if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
          if (!isOpen && typeof loadReferralStats === 'function') loadReferralStats();
        });
      }

      // Возврат после привязки карты T-Bank (?page=profile&card_bound=1) → профиль + тост
      var search = typeof window.location !== 'undefined' && window.location.search ? window.location.search : '';
      if (search.indexOf('card_bound=1') !== -1 && search.indexOf('page=profile') !== -1) {
        goToPage('profilePage');
        setTimeout(function() { loadPaymentMethod(); showToast(t('toastCardLinked')); }, 600);
      }

      // Редирект после оплаты: HOT (?payment=success) или T-Bank (?page=paymentThanks&provider=tbank)
      var paymentThanksMsg = document.getElementById('paymentThanksMessage');
      var tgStartParamReturn = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ? String(tg.initDataUnsafe.start_param) : '';
      var qsStartReturn = search.match(/[?&](?:tgWebAppStartParam|startapp|start_param)=([^&]+)/);
      if (!tgStartParamReturn && qsStartReturn && qsStartReturn[1]) tgStartParamReturn = decodeURIComponent(qsStartReturn[1]);
      var startParamRequestId = null;
      if (/^pay_/.test(tgStartParamReturn)) {
        startParamRequestId = tgStartParamReturn.replace(/^pay_/, '').trim();
      }
      var isTbankSuccessReturn = search.indexOf('page=paymentThanks') !== -1 && search.indexOf('provider=tbank') !== -1;
      var isPaymentThanksUrl = search.indexOf('page=paymentThanks') !== -1;
      if (search.indexOf('payment=success') !== -1 || !!startParamRequestId || isTbankSuccessReturn || isPaymentThanksUrl) {
        window.__isPaymentReturn = true;
        _hotPaymentConfirmed = false; // Сброс флага дедупликации для нового потока возврата с оплаты
        setTimeout(function() { window.__isPaymentReturn = false; }, 60000);
        if (typeof hidePaymentOverlay === 'function') hidePaymentOverlay();
        if (window._ysTrack) {
          var _ppd3 = { source: 'return_url' };
          try { var _pp3 = JSON.parse(localStorage.getItem('pending_payment_type') || '{}'); _ppd3.method = _pp3.type || 'unknown'; _ppd3.sku = _pp3.sku || null; } catch(_) {}
          window._ysTrack('payment_complete', _ppd3);
        }
        goToPage('paymentThanksPage');
        (function() {
          var _el = document.getElementById('paymentThanksTitle');
          if (_el) _el.textContent = t('payCheckingPayment');
          var _s = document.getElementById('paymentThanksSubtitle');
          if (_s) _s.textContent = '';
          var _m = document.getElementById('paymentThanksMessage');
          if (_m) _m.textContent = t('payWaitingBank');
          var _h = document.getElementById('paymentThanksHint');
          if (_h) _h.style.display = 'none';
          var _b = document.getElementById('paymentThanksBackBtn');
          if (_b) _b.style.visibility = 'hidden';
          setTimeout(function() {
            var btn = document.getElementById('paymentThanksBackBtn');
            if (btn && btn.style.visibility === 'hidden') {
              btn.style.display = ''; btn.style.visibility = 'visible';
              btn.textContent = t('btnGoHome'); btn.setAttribute('data-goto', 'homePage');
              var msg = document.getElementById('paymentThanksMessage');
              if (msg) msg.innerHTML = t('payBankNotConfirmed');
              var hint = document.getElementById('paymentThanksHint');
              if (hint) { hint.style.display = ''; hint.textContent = t('payReturnHome'); }
            }
          }, 8000);
        })();
        var requestIdMatch = search.match(/request_id=([^&\s]+)/);
        var thanksRequestIdRaw = requestIdMatch ? decodeURIComponent(requestIdMatch[1]) : (startParamRequestId || null);
        var thanksRequestId = normalizeRequestId(thanksRequestIdRaw);
        var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (thanksRequestId && !uuidRe.test(thanksRequestId)) {
          thanksRequestId = null;
        }
        var paymentReturnConfirmKey = thanksRequestId ? ('payment_return_confirm_' + thanksRequestId) : null;
        var paymentReturnClaimKey = thanksRequestId ? ('payment_return_claim_' + thanksRequestId) : null;
        var paymentReturnConfirmSent = false;
        var paymentReturnClaimSucceeded = false;
        try {
          if (paymentReturnConfirmKey) paymentReturnConfirmSent = sessionStorage.getItem(paymentReturnConfirmKey) === '1';
          if (paymentReturnClaimKey) paymentReturnClaimSucceeded = sessionStorage.getItem(paymentReturnClaimKey) === '1';
        } catch (_) {}

        // Мгновенно определяем тип оплаты из localStorage (сохранили перед редиректом на HOT/T-Bank)
        var pendingPayment = null;
        try {
          var _pp = localStorage.getItem('pending_payment_type');
          if (_pp) {
            try {
              var parsed = JSON.parse(_pp);
              pendingPayment = (parsed && typeof parsed === 'object') ? parsed : null;
            } catch(_) { pendingPayment = null; }
            localStorage.removeItem('pending_payment_type');
          }
        } catch(e) {}
        if (!thanksRequestId && pendingPayment && pendingPayment.request_id) {
          var pendingReqId = normalizeRequestId(pendingPayment.request_id);
          if (pendingReqId && uuidRe.test(pendingReqId)) thanksRequestId = pendingReqId;
        }
        
        // КРИТИЧНО: сбрасываем кэш и перезагружаем профиль/каталог для актуального статуса подписки
        catalogCache = null;
        catalogCacheTime = 0;
        function refreshAfterPayment() {
          if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(e) { console.warn('[payment success] loadProfilePage error:', e); });
          if (typeof loadPricingCatalog === 'function') loadPricingCatalog().catch(function(e) { console.warn('[payment success] loadPricingCatalog error:', e); });
        }
        refreshAfterPayment();
        setTimeout(refreshAfterPayment, 1200);
        setTimeout(refreshAfterPayment, 3500);
        setTimeout(refreshAfterPayment, 7000);
        var isAnalysisPaymentImmediate = pendingPayment && pendingPayment.type === 'analysis'
          && pendingPayment.ts && (Date.now() - pendingPayment.ts) < 30 * 60 * 1000;
        var isSubPaymentImmediate = pendingPayment && pendingPayment.type === 'subscription'
          && pendingPayment.ts && (Date.now() - pendingPayment.ts) < 30 * 60 * 1000;
        var isSoulChatDayImmediate = pendingPayment && pendingPayment.type === 'soul_chat_day'
          && pendingPayment.ts && (Date.now() - pendingPayment.ts) < 30 * 60 * 1000;

        // Не показываем «Оплата получена» до подтверждения сервером — только «Проверяем оплату…»
        var _pendingSubName = isSubPaymentImmediate ? (pendingPayment.plan_name || (
            pendingPayment.plan_key === 'plan_basic' ? t('planBasicName') :
            pendingPayment.plan_key === 'plan_plus' ? t('planPlusName') : t('planMasterNameText'))) : ''; // (аудит iPhone 24.09: убран хардкод RU-названий тарифа)
        (function() {
          var pt = document.getElementById('paymentThanksTitle');
          var ps = document.getElementById('paymentThanksSubtitle');
          var ph = document.getElementById('paymentThanksHint');
          var pb = document.getElementById('paymentThanksBackBtn');
          if (pt) pt.textContent = t('payCheckingPayment');
          if (ps) ps.textContent = '';
          if (paymentThanksMsg) paymentThanksMsg.innerHTML = isSubPaymentImmediate
            ? 'Проверяем платёж и активируем план <strong>' + _pendingSubName + '</strong>…'
            : 'Подождите, идёт проверка платежа.';
          if (ph) ph.style.display = 'none';
          if (pb) pb.style.display = 'none';
        })();

        (async function checkPaymentAndConfirm() {
          if (!thanksRequestId) {
            var ptTitle = document.getElementById('paymentThanksTitle');
            var ptBack = document.getElementById('paymentThanksBackBtn');
            if (ptTitle) ptTitle.textContent = t('payWaitingConfirm');
            if (paymentThanksMsg) paymentThanksMsg.textContent = t('payNoData');
            if (ptBack) { ptBack.style.visibility = 'visible'; ptBack.textContent = t('btnGoHome'); ptBack.setAttribute('data-goto', 'homePage'); }
            return;
          }
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          if (!apiBase || !hasAuth()) {
            if (paymentThanksMsg && !isSubPaymentImmediate) paymentThanksMsg.textContent = t('payReceived');
            return;
          }
          var initData = getInitData();
          var thanksAuthH = getAuthHeaders();
          try {
            var payStatus = '';
            var payMode = '';
            var paySku = '';
            var isSub = isSubPaymentImmediate;

            // Определяем ожидаемый plan_sku по plan_key из localStorage
            var LOCAL_PLAN_SKU_MAP = { plan_basic: 'soul_basic_sub', plan_plus: 'soul_plus_sub', plan_master: 'master_monthly' };
            var expectedPlanSku = (pendingPayment && pendingPayment.plan_key)
              ? (LOCAL_PLAN_SKU_MAP[pendingPayment.plan_key] || null)
              : null;

            // ── Для подписок: моментально запускаем claim (без задержки) и повторяем до успеха ──
            // Для подписок: один claim — webhook/confirm должны справиться, claim только как фолбек
            if (isSubPaymentImmediate && thanksRequestId) {
              (async function runClaimOnce() {
                // Ждём 8 сек — даём время webhook'у активировать подписку
                await new Promise(function(r){ setTimeout(r, 8000); });
                if (_hotPaymentConfirmed || paymentReturnClaimSucceeded) {
                  console.log('[sub] claim skipped — уже обработано');
                  return;
                }
                try {
                  var claimRes = await claimSubscriptionSafe(apiBase, initData, thanksRequestId);
                  if (claimRes && !claimRes.skipped && claimRes.ok) {
                    var claimJson = claimRes.json || {};
                    console.log('[sub] claim fallback ok:', claimJson.status, 'plan:', claimJson.plan_sku);
                    paymentReturnClaimSucceeded = true;
                    try { if (paymentReturnClaimKey) sessionStorage.setItem(paymentReturnClaimKey, '1'); } catch (_) {}
                    if (!_hotPaymentConfirmed) {
                      var _ptTitle = document.getElementById('paymentThanksTitle');
                      var _ptMsg = document.getElementById('paymentThanksMessage');
                      var _ptHint = document.getElementById('paymentThanksHint');
                      var _ptBack = document.getElementById('paymentThanksBackBtn');
                      if (_ptTitle) _ptTitle.textContent = t('subActivated') || 'Тариф активирован!';
                      if (_ptMsg) _ptMsg.innerHTML = (t('subscriptionActive') || 'Твой план активен.').replace('—', '<br>') + '<br><span style="opacity:0.7">Треки и Soul Chat доступны.</span>';
                      if (_ptHint) _ptHint.style.display = 'none';
                      if (_ptBack) { _ptBack.style.display = ''; _ptBack.style.visibility = 'visible'; _ptBack.textContent = t('btnGoHome'); _ptBack.setAttribute('data-goto', 'homePage'); }
                    }
                    catalogCache = null;
                    catalogCacheTime = 0;
                    if (typeof loadProfilePage === 'function') loadProfilePage().catch(function(e) { console.warn('[sub] loadProfilePage after claim:', e); });
                  }
                } catch(claimErr) {
                  console.warn('[sub] claim fallback error:', claimErr && claimErr.message);
                }
              })();
            }

            // ── Поллинг payment_status (вебхук путь) ──
            var maxAttempts = isSubPaymentImmediate ? 10 : 5;
            var delayMs = 3000;
            for (var attempt = 0; attempt < maxAttempts; attempt++) {
              if (_hotPaymentConfirmed) { console.log('[payment/return] Уже обработано, прекращаем polling'); break; }
              try {
                var statusResp = await fetchWithTimeout(apiBase + '/api/payments/hot/status?request_id=' + encodeURIComponent(thanksRequestId), {
                  headers: thanksAuthH
                }, 10000);
                var statusJson = await statusResp.json().catch(function() { return {}; });
                var rawStatus = statusJson && statusJson.data && statusJson.data.payment_status;
                payStatus = (rawStatus !== null && rawStatus !== undefined) ? String(rawStatus).toLowerCase() : '';
                payMode = statusJson && statusJson.data && statusJson.data.mode ? String(statusJson.data.mode) : '';
                paySku = getPaymentSkuFromStatus(statusJson);
                if (payStatus === 'paid') break;
              } catch (statusErr) {
                console.warn('[payment/return] status attempt', attempt, statusErr && statusErr.message);
              }
              if (attempt < maxAttempts - 1) await new Promise(function(r) { setTimeout(r, delayMs); });
            }
            isSub = isSubPaymentImmediate || (payMode && payMode.startsWith('sub_')) || isSubscriptionSku(paySku);

            if (payStatus === 'paid') {
              if (_hotPaymentConfirmed) { console.log('[payment/return] Уже обработано другим обработчиком'); return; }
              _hotPaymentConfirmed = true;
              paymentPollingActive = false;
              // Оплата подтверждена сервером — показываем успешный текст и кнопку «Назад»
              (function showConfirmedPayment() {
                var pt = document.getElementById('paymentThanksTitle');
                var pm = document.getElementById('paymentThanksMessage');
                var pb = document.getElementById('paymentThanksBackBtn');
                var isSub2 = isSubPaymentImmediate || (payMode && payMode.startsWith('sub_')) || isSubscriptionSku(paySku);
                var isAn2 = isAnalysisPaymentImmediate || payMode === 'deep_analysis' || paySku === 'deep_analysis_addon';
                var isSc2 = isSoulChatDayImmediate || payMode === 'soul_chat_day' || paySku === 'soul_chat_1day';
                if (isSub2) {
                  var sn = _pendingSubName || (paySku === 'soul_basic_sub' ? t('planBasicName') : paySku === 'soul_plus_sub' ? t('planPlusName') : t('planMasterNameText')); // (аудит iPhone 24.09: убран хардкод RU-названий тарифа)
                  if (pt) pt.textContent = t('subActivated') || 'Тариф активирован!';
                  if (pm) pm.innerHTML = t('payConfirmedPlan').replace('{plan}', sn);
                  if (pb) { pb.style.display = ''; pb.style.visibility = 'visible'; pb.textContent = t('btnGoHome'); pb.setAttribute('data-goto', 'homePage'); }
                } else if (isAn2) {
                  if (pt) pt.textContent = t('payAnalysisPaid');
                  if (pm) pm.innerHTML = t('payAnalysisAvailable');
                  if (pb) { pb.style.display = ''; pb.style.visibility = 'visible'; pb.textContent = t('btnDone'); pb.setAttribute('data-goto', 'homePage'); }
                } else if (isSc2) {
                  if (pt) pt.textContent = t('paySoulChatOpened');
                  if (pm) pm.textContent = t('payConfirmedChat');
                  if (pb) { pb.style.display = ''; pb.style.visibility = 'visible'; pb.textContent = t('payToSoulChat'); pb.setAttribute('data-goto', 'soulChatPage'); }
                } else {
                  if (pt) pt.textContent = typeof t === 'function' ? (t('paymentThanks') || 'Оплата подтверждена!') : 'Оплата подтверждена!';
                  if (pm) pm.textContent = typeof t === 'function' ? (t('songInProgressConfirmed') || 'Твоя песня создаётся.') : 'Твоя песня создаётся.';
                  if (pb) { pb.style.display = ''; pb.style.visibility = 'visible'; pb.textContent = t('btnGoHome'); pb.setAttribute('data-goto', 'homePage'); }
                }
                if (typeof showAfterFirstSong === 'function') showAfterFirstSong();
              })();
              // Моментально: confirm + один запрос subscription/status (запускает repair_on_read)
              if (!paymentReturnConfirmSent) {
                paymentReturnConfirmSent = true;
                try { if (paymentReturnConfirmKey) sessionStorage.setItem(paymentReturnConfirmKey, '1'); } catch (_) {}
                fetch(apiBase + '/api/payments/hot/confirm', {
                  method: 'POST',
                  headers: Object.assign({ 'Content-Type': 'application/json' }, thanksAuthH),
                  body: JSON.stringify({ request_id: thanksRequestId, initData: initData })
                }).catch(function(e){ console.warn('[payment/return] confirm failed:', e && e.message); });
              }
              if (isSub) {
                fetch(apiBase + '/api/subscription/status', { headers: thanksAuthH }).catch(function(e){ console.warn('[payment/return] subscription/status failed:', e && e.message); });
              }
            } else if (isSub && thanksRequestId && !paymentReturnClaimSucceeded) {
              // Вебхук не пришёл за 60 сек — финальный вызов claim (страховка)
              try {
                await claimSubscriptionSafe(apiBase, initData, thanksRequestId);
              } catch(e) {
                console.warn('[payment/return] final claim failed:', e && e.message);
              }
            }

            // ── Ждём появления нужной подписки в БД, обновляем кнопку ──
            // Важно: проверяем конкретный plan_sku (защита от апгрейда Basic→Plus,
            // когда subscription_active=true ещё от Basic, но Plus ещё не активирован)
            if (isSub) {
              var expectedSkuFromMode = payMode && payMode.startsWith('sub_') ? payMode.slice(4) : null;
              var expectedSkuFromStatus = isSubscriptionSku(paySku) ? paySku : null;
              var targetPlanSku = expectedSkuFromStatus || expectedSkuFromMode || expectedPlanSku || null;
              var subCheckDelayMs = 800;
              for (var si = 0; si < 20; si++) {
                if (si > 0) await new Promise(function(r){ setTimeout(r, subCheckDelayMs); });
                try {
                  var subCheckResp = await fetch(apiBase + '/api/subscription/status', { headers: thanksAuthH });
                  var subCheckJson = await subCheckResp.json().catch(function(){ return {}; });
                  // Если знаем ожидаемый план — ждём именно его (апгрейд Basic→Plus)
                  var planMatched = subCheckJson && subCheckJson.subscription_active &&
                    (!targetPlanSku || subCheckJson.plan_sku === targetPlanSku);
                  if (planMatched) {
                    var ptB2 = document.getElementById('paymentThanksBackBtn');
                    if (ptB2 && !ptB2._subConfirmed) {
                      ptB2._subConfirmed = true;
                      ptB2.textContent = '✓ ' + t('subBtnProfile');
                    }
                    // После подтверждения — обновляем профиль если он открыт
                    var curPg = document.querySelector('.page.active');
                    if (curPg && curPg.id === 'profilePage' && typeof loadProfilePage === 'function') {
                      setTimeout(function() { loadProfilePage(); }, 300);
                    }
                    break;
                  }
                } catch(e2) {}
              }
            }
            // Если не знали про подписку из localStorage — определяем по mode
            if (!isSubPaymentImmediate) {
              var isSubFromMode = (payMode && payMode.startsWith('sub_')) || isSubscriptionSku(paySku);
              if (isSubFromMode && paymentThanksMsg) {
                var sn = isSubscriptionSku(paySku)
                  ? (paySku === 'soul_basic_sub' ? t('planBasicName') : (paySku === 'soul_plus_sub' ? t('planPlusName') : t('planMasterNameText')))
                  : (payMode.includes('basic') ? t('planBasicName') : payMode.includes('plus') ? t('planPlusName') : t('planMasterNameText')); // (аудит iPhone 24.09: убран хардкод RU-названий тарифа)
                var ptT = document.getElementById('paymentThanksTitle');
                var ptS = document.getElementById('paymentThanksSubtitle');
                var ptH = document.getElementById('paymentThanksHint');
                var ptB = document.getElementById('paymentThanksBackBtn');
                if (ptT) ptT.textContent = t('subActivated');
                if (ptS) ptS.textContent = sn;
                paymentThanksMsg.innerHTML = t('planConfirmHeader') + ' <strong>' + sn + '</strong> — ' + t('subscriptionActive'); // (аудит iPhone 24.09: убран хардкод «Тариф»)
                if (ptH) ptH.style.display = 'none';
                if (ptB) { ptB.textContent = t('btnGoHome'); ptB.setAttribute('data-goto', 'homePage'); }
              } else if (payMode === 'deep_analysis' || paySku === 'deep_analysis_addon') {
                var ptT3 = document.getElementById('paymentThanksTitle');
                var ptS3 = document.getElementById('paymentThanksSubtitle');
                var ptH3 = document.getElementById('paymentThanksHint');
                var ptB3 = document.getElementById('paymentThanksBackBtn');
                if (ptT3) ptT3.textContent = t('payAnalysisPaid');
                if (ptS3) ptS3.textContent = t('payDeepAnalysis');
                paymentThanksMsg.innerHTML = t('payAnalysisAvailable');
                if (ptH3) ptH3.style.display = 'none';
                if (ptB3) { ptB3.textContent = t('btnDone'); ptB3.setAttribute('data-goto', 'homePage'); }
              } else if (paymentThanksMsg) {
                paymentThanksMsg.textContent = t('songInProgressConfirmed');
              }
            }
          } catch (e) {
            console.warn('[payment/return] Ошибка проверки оплаты:', e && e.message);
            var _ptBackErr = document.getElementById('paymentThanksBackBtn');
            if (_ptBackErr) { _ptBackErr.style.display = ''; _ptBackErr.style.visibility = 'visible'; _ptBackErr.textContent = t('btnGoHome'); _ptBackErr.setAttribute('data-goto', 'homePage'); }
          }
          // Если после всех проверок payStatus так и не 'paid' — показываем честное сообщение
          if (payStatus !== 'paid') {
            var ptF = document.getElementById('paymentThanksTitle');
            var ptFm = document.getElementById('paymentThanksMessage');
            var ptFh = document.getElementById('paymentThanksHint');
            var ptFb = document.getElementById('paymentThanksBackBtn');
            if (ptF) ptF.textContent = t('payNotConfirmed');
            if (ptFm) ptFm.innerHTML = t('payBankNotConfirmedRetry');
            if (ptFh) { ptFh.style.display = ''; ptFh.textContent = t('payContactSupport'); }
            if (ptFb) { ptFb.style.display = ''; ptFb.style.visibility = 'visible'; ptFb.textContent = t('btnGoHome'); ptFb.setAttribute('data-goto', 'homePage'); }
          }
        })().catch(function(err) {
          console.warn('[payment/return] silent:', err && err.message);
          // Закон №37: offline → overlay. Online → actionable hint (без error-слов):
          // обещаем уведомление в Telegram + кнопка поддержки. Без «не удалось проверить» страха.
          if (typeof window._ensureOnline === 'function' && !window._ensureOnline()) return;
          var ptE = document.getElementById('paymentThanksTitle');
          var msg = document.getElementById('paymentThanksMessage');
          var hint = document.getElementById('paymentThanksHint');
          var btn = document.getElementById('paymentThanksBackBtn');
          if (ptE) ptE.textContent = (typeof t === 'function' ? (t('payCheckTakesTimeTitle') || 'Проверяем оплату') : 'Проверяем оплату');
          if (msg) msg.innerHTML = (typeof t === 'function' ? (t('payCheckTakesTime') || 'Если деньги списались, мы пришлём подтверждение в Telegram. Можешь вернуться на главную.') : 'Если деньги списались, мы пришлём подтверждение в Telegram. Можешь вернуться на главную.');
          if (hint) { hint.style.display = ''; hint.textContent = t('payContactSupport'); }
          if (btn) { btn.style.display = ''; btn.style.visibility = 'visible'; btn.textContent = t('btnGoHome'); btn.setAttribute('data-goto', 'homePage'); }
        });
        if (window.history && window.history.replaceState) {
          var cleanUrl = window.location.pathname + (window.location.hash || '');
          window.history.replaceState({}, '', cleanUrl);
        }
      }
      var paymentThanksBackBtn = document.getElementById('paymentThanksBackBtn');
      if (paymentThanksBackBtn) {
        // touch-action: manipulation убирает 300ms задержку на Android
        paymentThanksBackBtn.style.touchAction = 'manipulation';
        var _ptBtnHandled = false;
        function _handlePtBackBtn() {
          if (_ptBtnHandled) return;
          _ptBtnHandled = true;
          setTimeout(function() { _ptBtnHandled = false; }, 600);
          var target = paymentThanksBackBtn.getAttribute('data-goto') || 'homePage';
          if (typeof goToPage === 'function') goToPage(target);
          if (target === 'soulChatPage' && typeof initSoulChatPage === 'function') setTimeout(initSoulChatPage, 300);
          if (target === 'profilePage' && typeof loadProfilePage === 'function') {
            setTimeout(function() { loadProfilePage(); }, 3000);
            setTimeout(function() { loadProfilePage(); }, 8000);
          }
        }
        paymentThanksBackBtn.addEventListener('touchstart', function(e) { e.preventDefault(); _handlePtBackBtn(); }, { passive: false });
        paymentThanksBackBtn.addEventListener('click', _handlePtBackBtn);
      }
      (function bindPaymentThanksPaths() {
        var paths = document.querySelectorAll('#paymentThanksPage .after-first-song-paths button');
        if (paths.length < 3) return;
        paths[0].addEventListener('click', function() { if (typeof goToPage === 'function') goToPage('formPage'); });
        paths[1].addEventListener('click', function() { if (typeof goToSoulChat === 'function') goToSoulChat(); else if (typeof goToPage === 'function') goToPage('soulChatPage'); });
        paths[2].addEventListener('click', function() { if (typeof shareApp === 'function') shareApp(); });
      })();

      // Редирект T-Bank FailURL: ?page=formPage&payment_failed=1 — открыть форму (оплата отменена/ошибка)
      if (search.indexOf('page=formPage') !== -1 && search.indexOf('payment_failed=1') !== -1 && typeof goToPage === 'function') {
        try {
          localStorage.removeItem('pending_payment_type');
          localStorage.removeItem('hot_pending_request_id');
          localStorage.removeItem('hot_pending_sku');
          localStorage.removeItem('tbank_payment_id');
          localStorage.removeItem('tbank_order_id');
          localStorage.removeItem('tbank_payment_url');
        } catch (_) {}
        goToPage('formPage');
        if (typeof showToast === 'function') {
          showToast(typeof t === 'function' ? (t('paymentCancelled') || 'Оплата отменена') : 'Оплата отменена');
        }
      }

      // Открытие через кнопку «Оплатить сейчас» из бота: ?request_id=X без payment=success
      // Проверяем статус заявки и автоматически показываем нужный экран
      if (search.indexOf('payment=success') === -1 && search.indexOf('page=paymentThanks') === -1) {
        var botRidMatch = search.match(/request_id=([^&\s]+)/);
        var botRequestId = botRidMatch ? decodeURIComponent(botRidMatch[1]) : null;
        if (botRequestId) {
          (async function checkBotPendingRequest() {
            try {
              var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
              if (!apiBase || !hasAuth()) return;
              var botAuthH = getAuthHeaders();
              var resp = await fetchWithTimeout(apiBase + '/api/payments/hot/status?request_id=' + encodeURIComponent(botRequestId), {
                headers: botAuthH
              }, 10000);
              var json = await resp.json().catch(function() { return {}; });
              var gs = json && json.data ? String(json.data.generation_status || '').toLowerCase() : '';
              var ps = json && json.data ? String(json.data.payment_status || '').toLowerCase() : '';
              var statusSku = getPaymentSkuFromStatus(json);
              if (gs === 'pending_payment' || ps === 'requires_payment') {
                // Заявка ещё не оплачена — показываем оверлей оплаты
                pendingPaymentRequestId = botRequestId;
                var mode = json.data && json.data.mode ? String(json.data.mode) : 'single';
                if (isSubscriptionSku(statusSku)) pendingPaymentSku = statusSku;
                else if (mode === 'couple') pendingPaymentSku = 'couple_song';
                else if (mode === 'transit') pendingPaymentSku = 'transit_energy_song';
                else pendingPaymentSku = 'single_song';
                showPaymentOverlay();
              } else if (['completed', 'processing', 'suno_processing', 'lyrics_generated', 'astro_calculated'].includes(gs)
                         || ['paid', 'subscription_active', 'gift_used', 'promo_applied'].includes(ps)) {
                // Заявка уже в работе — ничего делать не нужно, остаёмся на главном экране
                console.log('[BotLink] Заявка уже оплачена/в работе:', gs, ps);
              }
            } catch (e) {
              console.warn('[BotLink] Ошибка проверки заявки:', e.message);
            }
          })();
        }
      }

      // Кнопки навигации
      var startBtn = document.getElementById('startBtn');
      if (startBtn) startBtn.addEventListener('click', function() {
        fillFormFromProfile(userProfile || (tg && tg.initDataUnsafe && tg.initDataUnsafe.user));
        // Сброс inline стилей от пресетов — полная форма должна показывать ВСЕ элементы
        resetFormToFullMode();
        goToPage('formPage');
      });

      // Подсказка и активное состояние для кнопок «ЧТО ПОПРОБУЕШЬ?» (блок на стартовой странице)
      (function() {
        var hintEl = document.getElementById('homeChoiceHint');
        var choices = document.querySelectorAll('#webLoginScreen .home-choice, #homePage .home-choice');
        if (!hintEl || !choices.length) return;
        choices.forEach(function(btn) {
          btn.addEventListener('click', function() {
            var hk = this.getAttribute('data-hint-key');
            if (hk) hintEl.textContent = t(hk);
            choices.forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
          });
        });
      })();

      var stepNext = document.getElementById('stepNext');

      (function initStyleQuickClicks() {
        var list = document.getElementById('styleQuickList');
        var input = document.getElementById('requestPreferredStyle');
        if (!list || !input) return;
        list.addEventListener('click', function(e) {
          var btn = e.target.closest('.style-quick');
          if (!btn) return;
          var val = (btn.getAttribute('data-style') || btn.textContent || '').trim();
          if (!val) return;
          var current = (input.value || '').trim();
          if (!current) {
            input.value = val;
          } else if (!current.toLowerCase().includes(val.toLowerCase())) {
            input.value = current + ', ' + val;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      })();

      (function initTypewriter() {
        var elHome = document.getElementById('homeTypewriterText');
        var elWeb = document.getElementById('webLoginTypewriterText');
        var cursorHome = document.getElementById('homeTypewriterCursor');
        var cursorWeb = document.querySelector('#webLoginTypewriterWrap .home-typewriter-cursor');
        var targets = [elHome, elWeb].filter(Boolean);
        var cursors = [cursorHome, cursorWeb].filter(Boolean);
        if (!targets.length) return;
        var _twLastLang = (typeof currentLang !== 'undefined' ? currentLang : 'ru');
        function getPhrases() {
          var lang = (typeof currentLang !== 'undefined' ? currentLang : 'ru');
          var L = (LANG && LANG[lang]) ? LANG[lang] : (LANG && LANG.ru) ? LANG.ru : {};
          // Натив VK (оракул-only, §5.4.1): фразы 1/4/7 зовут создать песню и
          // подарок — там этого нет. Оставляем те, что про оракул и картотеку.
          if (window._vkSongsOff && window._vkSongsOff()) {
            return [
              (L.typewriter2 || 'Получи текстовую расшифровку на основе глубинного анализа своего запроса.'),
              (L.typewriter3 || 'Общайся со своей душой с помощью Душевного чата.'),
              (L.typewriter5 || 'Заводи карточки с данными своих близких или клиентов для быстрого доступа.'),
              (L.typewriter6 || 'Соединяй карточки с данными близких.')
            ];
          }
          return [
            (L.typewriter1 || 'Создавай песню о себе на любую тему.'),
            (L.typewriter2 || 'Получи текстовую расшифровку на основе глубинного анализа своего запроса.'),
            (L.typewriter3 || 'Общайся со своей душой с помощью Душевного чата.'),
            (L.typewriter4 || 'Искры уже ждут — создай свою песню.'),
            (L.typewriter5 || 'Заводи карточки с данными своих близких или клиентов для быстрого доступа.'),
            (L.typewriter6 || 'Соединяй карточки с данными близких.'),
            (L.typewriter7 || 'Сделай уникальный глубокий подарок себе и близким.')
          ];
        }
        var phraseIndex = 0;
        var charIndex = 0;
        var isDeleting = false;
        var tick = 80;
        var pauseAfterType = 2200;
        var pauseAfterDelete = 600;
        var tNext = 0;
        function run() {
          var now = Date.now();
          if (now < tNext) { requestAnimationFrame(run); return; }
          var curLang = (typeof currentLang !== 'undefined' ? currentLang : 'ru');
          if (curLang !== _twLastLang) {
            _twLastLang = curLang;
            charIndex = 0;
            isDeleting = true;
            phraseIndex = 0;
            tNext = 0;
          }
          var phrases = getPhrases();
          var phrase = phrases[phraseIndex] || '';
          if (isDeleting) {
            charIndex--;
            if (charIndex <= 0) {
              charIndex = 0;
              isDeleting = false;
              phraseIndex = (phraseIndex + 1) % phrases.length;
              tNext = now + pauseAfterDelete;
            } else {
              tNext = now + tick / 2;
            }
          } else {
            charIndex++;
            if (charIndex >= phrase.length) {
              charIndex = phrase.length;
              isDeleting = true;
              tNext = now + pauseAfterType;
            } else {
              tNext = now + tick;
            }
          }
          var text = (phrase || '').slice(0, charIndex);
          targets.forEach(function(el) { if (el) el.textContent = text; });
          requestAnimationFrame(run);
        }
        run();
      })();

      function applyTheme() {
        var preferLight = false;
        // SYNC: иерархия приоритетов ОБЯЗАНА совпадать с ранним init в <head>
        // (поиск "Раннее определение темы"). Если меняешь тут — синхронизируй там.
        // Расхождение между ними = мерцание light↔dark при загрузке.
        //
        // ПРИНЦИП: по умолчанию — тёмная. Переключаемся на светлую ТОЛЬКО когда есть
        // явный пользовательский запрос — либо через переключатель в профиле, либо
        // через настройку темы в TG/VK (платформа передаёт сигнал явно).
        // Системный matchMedia(prefers-color-scheme:light) НЕ используется — это
        // вызывало нежелательный авто-переход в светлую при системной светлой теме.
        // Поддержка светлой темы остаётся очевидна для модераторов VK/TG: (1) кнопка
        // «Светлая» в профиле; (2) автопереход при light-теме в самом TG/VK.

        // 0. Ручной выбор пользователя (localStorage) — высший приоритет.
        //    Перебивает VK/Telegram. Значения: 'light' | 'dark' | 'auto' | null.
        var userPref = null;
        try { userPref = localStorage.getItem('yupsoul_theme_pref'); } catch(_) {}
        if (userPref === 'light') {
          preferLight = true;
        } else if (userPref === 'dark') {
          preferLight = false;
        }
        // 1. URL override для тестирования: ?theme=light
        else if (location.search.indexOf('theme=light') !== -1) preferLight = true;
        // 2. VK Mini App: тема приходит через VKWebAppUpdateConfig event
        //    (платформа устанавливает is-vk-light по настройке пользователя в VK).
        //    VK Testers 7276882/etc: если is-vk-light отсутствует (был удалён ранее
        //    в else-блоке при user pref dark), пробуем восстановить из кэша.
        //    Без этого: user pref=dark → удалили is-vk-light → user сменил pref на
        //    auto → applyTheme считает что VK signal=dark (так как класса нет) →
        //    остаётся dark, хотя VK system был light.
        else if (window._isVkMiniApp) {
          var hasVkLight = document.documentElement.classList.contains('is-vk-light');
          if (!hasVkLight) {
            try {
              var cachedTheme = localStorage.getItem('vk_theme_cache');
              if (cachedTheme === 'light') {
                document.documentElement.classList.add('is-vk-light');
                hasVkLight = true;
              }
            } catch(_) {}
          }
          preferLight = hasVkLight;
        }
        // 3. Telegram: определяем из colorScheme (платформа передаёт по настройке TG)
        else if (window.Telegram && Telegram.WebApp && Telegram.WebApp.colorScheme === 'light') preferLight = true;
        // 4. Иначе — тёмная (дефолт). Системный prefers-color-scheme НЕ читаем.

        document.body.classList.remove('theme-light', 'theme-dark');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.remove('light-early');
        if (preferLight) {
          document.body.classList.add('theme-light');
          document.documentElement.classList.add('light-early');
          document.documentElement.style.background = '#faf8f2';
          document.documentElement.style.colorScheme = 'light';
        } else {
          document.body.classList.add('theme-dark');
          document.documentElement.classList.add('dark');
          // VK Testers 7276467/7276470/7276488/7276492/7276493 (Семенцов Safari MacOS):
          // Safari использует UA-default color-scheme для рендера inputs/scrollbars.
          // На тёмной теме без явного color-scheme:dark Safari рендерил поля светлыми.
          document.documentElement.style.background = '#0a0612';
          document.documentElement.style.colorScheme = 'dark';
          // VK Testers 7276882/7276857/7277117/etc (Maria Lykosova Safari MacOS):
          // user явно выбрал DARK в YupSoul профиле, но VK signal `is-vk-light`
          // (от system=light) остаётся → 335 наших правил `html.is-vk-light`
          // перебивают dark стили (modal Лаборатория белый, Пакет использован
          // светлый gradient, mt-detail-panel белый, etc).
          // Системный фикс: убираем external light signals при явно выбранном dark.
          // Восстановятся через VKWebAppUpdateConfig event при сменe user pref
          // обратно на light/auto. ОК сигнал тоже на всякий случай.
          document.documentElement.classList.remove('is-vk-light');
          document.documentElement.classList.remove('is-ok-light');
        }
        // Адаптивный theme-color для статусбара браузера/Telegram/VK.
        // Убираем статичные @media meta-теги, ставим один динамический.
        try {
          var metas = document.querySelectorAll('meta[name="theme-color"]');
          for (var i = metas.length - 1; i >= 0; i--) {
            var m = metas[i];
            if (m.hasAttribute('media')) m.parentNode.removeChild(m);
          }
          var metaTc = document.querySelector('meta[name="theme-color"]:not([media])');
          if (!metaTc) {
            metaTc = document.createElement('meta');
            metaTc.setAttribute('name', 'theme-color');
            document.head.appendChild(metaTc);
          }
          metaTc.setAttribute('content', preferLight ? '#faf8f2' : '#0a0612');
        } catch(_) {}
      }
      window.applyTheme = applyTheme;
      applyTheme();
      // Слушаем смену темы в реальном времени (TG / VK через bridge)
      try {
        if (tg && tg.onEvent) tg.onEvent('themeChanged', applyTheme);
      } catch (_) {}
      // SAFETY (Алла 14.06 «серый фон на светлой теме»): гарантируем body.theme-light
      // ВСЕГДА когда на html есть VK/OK light-сигнал (is-vk-light/is-ok-light) и НЕ
      // выбрана dark. Раньше при гонке VKWebAppUpdateConfig ставил is-vk-light, а
      // body.theme-light не успевал/слетал → светлый СИГНАЛ без light-КОНТЕНТА =
      // серый фон + тёмные карточки. Этот sync делает контент светлым ПОД светлый
      // сигнал — гибрид (светлый фон + тёмный контент) НЕВОЗМОЖЕН. Guard на
      // !theme-light исключает цикл наблюдателя.
      (function _vkOkLightBodySync(){
        function sync(){
          try {
            var h = document.documentElement, b = document.body;
            if (!b) return;
            var lightSignal = (h.classList.contains('is-vk-light') || h.classList.contains('is-ok-light')) && !h.classList.contains('dark');
            if (lightSignal) {
              if (!b.classList.contains('theme-light')) {
                b.classList.remove('theme-dark');
                b.classList.add('theme-light');
              }
              // html-фон тоже кремовый: иначе вокруг карточки виден серый дефолт VK WebView
              h.style.background = '#faf8f2';
              h.style.colorScheme = 'light';
            }
          } catch(_) {}
        }
        sync();
        try {
          new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        } catch(_) {}
      })();
      // Системный matchMedia listener умышленно не слушаем — авто-переход в светлую
      // по системной теме отключён (см. комментарий в applyTheme).

      // ═══════════════════════════════════════════════════════════════════════
      // legalModal — встроенный экран правовых документов (Оферта, Политика,
      // Пакеты). Универсально для VK / OK / TG / web — НЕ уводит
      // пользователя из приложения. §1.1.4 + §5.4.2 VK Mini Apps. Также
      // готовность к Telegram Mini Apps Catalog (требования аналогичные).
      //
      // ⚠️ ВАЖНО: тексты дублируют разделы landing.html (#offer, #privacy,
      // #subscription). При обновлении legal-текста ОБЯЗАТЕЛЬНО синхронизировать
      // public/landing.html И этот блок (поиск: window._LEGAL_CONTENT).
      // ═══════════════════════════════════════════════════════════════════════
      /* @@native-strip:begin документы-российского-продавца
         В сборку для App Store эти тексты не попадают: продавец там —
         Yupland Digital Solutions, LLC, а документы открываются с сервера
         (/terms-en, /privacy-en). Режет scripts/build-app-www.mjs, он же
         падает, если реквизиты остались в app/www. */
      window._LEGAL_CONTENT = {
        offer: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<h3>1. Общие положения</h3>'
          + '<p>Настоящий документ является публичной офертой (далее — Оферта) и определяет условия предоставления услуг сервиса YupSoul (далее — Сервис) любому физическому лицу (далее — Пользователь), принявшему условия настоящей Оферты.</p>'
          + '<p>Акцептом Оферты является совершение оплаты любой из услуг Сервиса. С момента акцепта Оферта считается заключённым договором.</p>'
          + '<h3>2. Предмет оферты</h3>'
          + '<p>Исполнитель обязуется оказать Пользователю услуги по генерации персонального аудиоконтента на основе предоставленных данных (дата, время и место рождения, текстовый запрос), а Пользователь обязуется оплатить услуги в порядке, определённом настоящей Офертой.</p>'
          + '<h3>3. Описание услуг</h3>'
          + '<ul>'
          + '<li><strong>Звуковой ключ</strong> — генерация персональной песни на основе анализа данных рождения.</li>'
          + '<li><strong>Совместимость</strong> — анализ данных двух людей и генерация совместной песни.</li>'
          + '<li><strong>Вопрос узору</strong> — развёрнутый текстовый ответ на вопрос Пользователя.</li>'
          + '<li><strong>Пакет (Душа / Глубина / Лаборатория)</strong> — доступ на 30 дней к расширенным функциям.</li>'
          + '</ul>'
          + '<h3>4. Стоимость и порядок оплаты</h3>'
          + '<p>Актуальные цены указаны в интерфейсе приложения. Цена включает все применимые налоги и сборы. Оплата производится одним из доступных способов: банковская карта (Visa, Mastercard, МИР), Telegram Stars, интернет-эквайринг Тинькофф (для VK Mini Apps в веб-версиях vk.com и m.vk.ru). В мобильных клиентах ВКонтакте (iOS / Android) оплата скрыта в соответствии с §5.4.1 Правил VK Mini Apps.</p>'
          + '<h3>5. Оплата</h3>'
          + '<p>Оплата производится разово. Доступ к пакету открывается на 30 дней с даты оплаты. Автоматических повторных списаний нет — по окончании срока доступ просто завершается.</p>'
          + '<p>Валюта транзакции: российский рубль (₽) при оплате картой, Telegram Stars при оплате через Telegram.</p>'
          + '<p>Доступ по пакету действует до конца оплаченного 30-дневного периода. Поскольку повторные списания не производятся, отдельная отмена не требуется.</p>'
          + '<h3>6. Возврат средств</h3>'
          + '<p>Возврат за разовые услуги возможен в течение 14 дней с момента оплаты, если генерация ещё не была запущена. Если генерация уже выполнена и результат доставлен — возврат не производится.</p>'
          + '<p>Возврат за пакет: неиспользованная часть оплаченного периода возвращается пропорционально оставшимся дням при обращении в поддержку.</p>'
          + '<p>Для оформления возврата обратитесь в поддержку через приложение (раздел «Помощь» → «Написать в поддержку»).</p>'
          + '<h3>7. Гарантии и ограничения</h3>'
          + '<p>Сервис предоставляет развлекательный контент. Результаты генерации не являются медицинскими, психологическими или финансовыми рекомендациями.</p>'
          + '<h3>8. Реквизиты исполнителя</h3>'
          + '<p>ИП Татауров Антон Юрьевич<br>ИНН: 920000802153<br>ОГРНИП: 324920000019876<br>Адрес: ул. Лесхозная, д. 9, кв./оф. 1, г. Севастополь<br>Поддержка: раздел «Помощь» в приложении</p>',

        privacy: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<h3>1. Какие данные мы собираем</h3>'
          + '<ul>'
          + '<li>Данные аккаунта платформы (Telegram user ID, VK user ID, Одноклассники user ID, имя, фото — передаются через API платформы)</li>'
          + '<li>Данные рождения (дата, время, место) — предоставляются Пользователем добровольно для генерации контента</li>'
          + '<li>Платёжные данные — обрабатываются на стороне платёжного провайдера (Т-Банк), не хранятся на наших серверах</li>'
          + '<li>Техническая информация (IP-адрес, user-agent) — для обеспечения работоспособности сервиса</li>'
          + '</ul>'
          + '<h3>2. Цели обработки</h3>'
          + '<ul>'
          + '<li>Предоставление услуг Сервиса (генерация контента)</li>'
          + '<li>Обработка платежей и управление пакетами</li>'
          + '<li>Техническая поддержка и коммуникация с Пользователем</li>'
          + '<li>Улучшение качества Сервиса</li>'
          + '</ul>'
          + '<h3>3. Хранение и защита</h3>'
          + '<p>Персональные данные хранятся на серверах на территории Российской Федерации. Применяются технические и организационные меры для защиты от несанкционированного доступа.</p>'
          + '<p>Срок хранения: пока у Пользователя есть аккаунт в Сервисе. После удаления аккаунта данные удаляются в течение 30 дней, кроме сведений об оплатах — их мы храним 5 лет, как требует налоговое законодательство.</p>'
          + '<p>Данные банковских карт обрабатываются исключительно на стороне Т-Банка в соответствии со стандартом PCI DSS.</p>'
          + '<h3>4. Передача третьим лицам</h3>'
          + '<p>Мы не продаём персональные данные. Для работы Сервиса данные передаются только тем, без кого услуга невозможна:</p>'
          + '<ul>'
          + '<li><strong>Т-Банк</strong> (Россия) — обработка платежей;</li>'
          + '<li><strong>DeepSeek</strong> (Китай) — формирование текстов и разборов. Передаются имя, пол, дата и место рождения, текст обращения Пользователя;</li>'
          + '<li><strong>Suno</strong> (США) — создание музыки. Передаются только текст песни и описание музыкального стиля, без персональных данных;</li>'
          + '<li>по требованию законодательства РФ.</li>'
          + '</ul>'
          + '<p>Передача в DeepSeek является трансграничной. Пользуясь Сервисом, Пользователь соглашается на такую передачу для формирования персонального контента.</p>'
          + '<h3>5. Права пользователя</h3>'
          + '<p>Пользователь вправе запросить удаление своих персональных данных, обратившись в поддержку через приложение (раздел «Помощь» → «Написать в поддержку»). Также удаление аккаунта доступно в Профиле — кнопка «Удалить аккаунт».</p>'
          + '<h3>6. Согласие</h3>'
          + '<p>Используя Сервис и совершая оплату, Пользователь даёт согласие на обработку персональных данных в соответствии с настоящей Политикой конфиденциальности и Федеральным законом №152-ФЗ «О персональных данных».</p>'
          + '<h3>7. Контакты оператора</h3>'
          + '<p>ИП Татауров Антон Юрьевич, ИНН 920000802153, ОГРНИП 324920000019876, г. Севастополь. Поддержка — через приложение (раздел «Помощь»).</p>',

        subscription: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<p>Настоящее Соглашение регулирует условия приобретения пакетов YupSoul.</p>'
          + '<h3>1. Условия пакетов</h3>'
          + '<ul>'
          + '<li><strong>YupSoul Душа</strong> — 810 ₽ / месяц (✦ 5 треков)</li>'
          + '<li><strong>YupSoul Глубина</strong> — 2 030 ₽ / месяц (✦ 15 треков)</li>'
          + '<li><strong>Лаборатория (Мастер)</strong> — 3 250 ₽ / месяц (✦ 30 треков)</li>'
          + '</ul>'
          + '<p>Цены фиксированы. При оплате банковской картой сумма списывается в рублях.</p>'
          + '<h3>2. Оплата</h3>'
          + '<p>Оплата производится разово. Доступ к пакету открывается на 30 дней с даты оплаты. Автоматических повторных списаний нет — по окончании срока доступ просто завершается.</p>'
          + '<h3>3. Прекращение доступа</h3>'
          + '<p>Доступ по пакету действует до конца оплаченного 30-дневного периода. Поскольку повторные списания не производятся, отдельная отмена не требуется.</p>'
          + '<p>Доступ по пакету сохраняется до конца оплаченного 30-дневного периода. Возврат неиспользованной части — пропорционально оставшимся дням, через поддержку.</p>'
          + '<h3>4. Возврат</h3>'
          + '<p>Возврат неиспользованной части пакета производится пропорционально оставшимся дням. Для оформления возврата обратитесь в поддержку через приложение.</p>'
          + '<h3>5. Изменение условий</h3>'
          + '<p>Исполнитель вправе изменить условия пакетов, уведомив Пользователя через приложение не менее чем за 14 дней до вступления изменений в силу.</p>'
      };

      // OK Mini Apps §2.2 — упоминания соц.сетей кроме Одноклассников запрещены.
      // Отдельный набор текстов оферты/политики/подписки без слов VK / Telegram /
      // ВКонтакте / vk.com / m.vk.ru. Активируется когда window._isOkMiniApp = true.
      window._LEGAL_CONTENT_OK = {
        offer: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<h3>1. Общие положения</h3>'
          + '<p>Настоящий документ является публичной офертой (далее — Оферта) и определяет условия предоставления услуг сервиса YupSoul (далее — Сервис) любому физическому лицу (далее — Пользователь), принявшему условия настоящей Оферты.</p>'
          + '<p>Акцептом Оферты является совершение оплаты любой из услуг Сервиса. С момента акцепта Оферта считается заключённым договором.</p>'
          + '<h3>2. Предмет оферты</h3>'
          + '<p>Исполнитель обязуется оказать Пользователю услуги по генерации персонального аудиоконтента на основе предоставленных данных (дата, время и место рождения, текстовый запрос), а Пользователь обязуется оплатить услуги в порядке, определённом настоящей Офертой.</p>'
          + '<h3>3. Описание услуг</h3>'
          + '<ul>'
          + '<li><strong>Звуковой ключ</strong> — генерация персональной песни на основе анализа данных рождения.</li>'
          + '<li><strong>Совместимость</strong> — анализ данных двух людей и генерация совместной песни.</li>'
          + '<li><strong>Вопрос узору</strong> — развёрнутый текстовый ответ на вопрос Пользователя.</li>'
          + '<li><strong>Пакет (Душа / Глубина / Лаборатория)</strong> — доступ на 30 дней к расширенным функциям.</li>'
          + '</ul>'
          + '<h3>4. Стоимость и порядок оплаты</h3>'
          + '<p>Актуальные цены указаны в интерфейсе приложения. Цена включает все применимые налоги и сборы. Оплата производится одним из доступных способов: банковская карта (Visa, Mastercard, МИР) через интернет-эквайринг АО «Тинькофф Банк» (доступен в веб-версиях сервиса). В мобильных клиентах оплата скрыта в соответствии с правилами магазинов приложений Apple и Google.</p>'
          + '<h3>5. Оплата</h3>'
          + '<p>Оплата производится разово. Доступ к пакету открывается на 30 дней с даты оплаты. Автоматических повторных списаний нет — по окончании срока доступ просто завершается.</p>'
          + '<p>Валюта транзакции: российский рубль (₽).</p>'
          + '<p>Доступ по пакету действует до конца оплаченного 30-дневного периода. Поскольку повторные списания не производятся, отдельная отмена не требуется.</p>'
          + '<h3>6. Возврат средств</h3>'
          + '<p>Возврат за разовые услуги возможен в течение 14 дней с момента оплаты, если генерация ещё не была запущена. Если генерация уже выполнена и результат доставлен — возврат не производится.</p>'
          + '<p>Возврат за пакет: неиспользованная часть оплаченного периода возвращается пропорционально оставшимся дням при обращении в поддержку.</p>'
          + '<p>Для оформления возврата обратитесь в поддержку через приложение (раздел «Помощь» → «Написать в поддержку»).</p>'
          + '<h3>7. Гарантии и ограничения</h3>'
          + '<p>Сервис предоставляет развлекательный контент. Результаты генерации не являются медицинскими, психологическими или финансовыми рекомендациями.</p>'
          + '<h3>8. Реквизиты исполнителя</h3>'
          + '<p>ИП Татауров Антон Юрьевич<br>ИНН: 920000802153<br>ОГРНИП: 324920000019876<br>Адрес: ул. Лесхозная, д. 9, кв./оф. 1, г. Севастополь<br>Поддержка: раздел «Помощь» в приложении</p>',

        privacy: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<h3>1. Какие данные мы собираем</h3>'
          + '<ul>'
          + '<li>Данные аккаунта Одноклассников (logged_user_id, имя, фото — передаются через API Одноклассников при запуске приложения)</li>'
          + '<li>Данные рождения (дата, время, место) — предоставляются Пользователем добровольно для генерации контента</li>'
          + '<li>Платёжные данные — обрабатываются на стороне платёжного провайдера (АО «Тинькофф Банк»), не хранятся на наших серверах</li>'
          + '<li>Техническая информация (IP-адрес, user-agent) — для обеспечения работоспособности сервиса</li>'
          + '</ul>'
          + '<h3>2. Цели обработки</h3>'
          + '<ul>'
          + '<li>Предоставление услуг Сервиса (генерация контента)</li>'
          + '<li>Обработка платежей и управление пакетами</li>'
          + '<li>Техническая поддержка и коммуникация с Пользователем</li>'
          + '<li>Улучшение качества Сервиса</li>'
          + '</ul>'
          + '<h3>3. Хранение и защита</h3>'
          + '<p>Персональные данные хранятся на серверах на территории Российской Федерации с применением технических и организационных мер защиты от несанкционированного доступа.</p>'
          + '<p>Срок хранения: пока у Пользователя есть аккаунт в Сервисе. После удаления аккаунта данные удаляются в течение 30 дней, кроме сведений об оплатах — их мы храним 5 лет, как требует налоговое законодательство.</p>'
          + '<p>Данные банковских карт обрабатываются исключительно на стороне АО «Тинькофф Банк» в соответствии со стандартом PCI DSS.</p>'
          + '<h3>4. Передача третьим лицам</h3>'
          + '<p>Мы не продаём персональные данные. Для работы Сервиса данные передаются только тем, без кого услуга невозможна:</p>'
          + '<ul>'
          + '<li><strong>Т-Банк</strong> (Россия) — обработка платежей;</li>'
          + '<li><strong>DeepSeek</strong> (Китай) — формирование текстов и разборов. Передаются имя, пол, дата и место рождения, текст обращения Пользователя;</li>'
          + '<li><strong>Suno</strong> (США) — создание музыки. Передаются только текст песни и описание музыкального стиля, без персональных данных;</li>'
          + '<li>по требованию законодательства РФ.</li>'
          + '</ul>'
          + '<p>Передача в DeepSeek является трансграничной. Пользуясь Сервисом, Пользователь соглашается на такую передачу для формирования персонального контента.</p>'
          + '<h3>5. Права пользователя</h3>'
          + '<p>Пользователь вправе запросить удаление своих персональных данных, обратившись в поддержку через приложение (раздел «Помощь» → «Написать в поддержку»). Также удаление аккаунта доступно в Профиле — кнопка «Удалить аккаунт».</p>'
          + '<h3>6. Согласие</h3>'
          + '<p>Используя Сервис и совершая оплату, Пользователь даёт согласие на обработку персональных данных в соответствии с настоящей Политикой конфиденциальности и Федеральным законом №152-ФЗ «О персональных данных».</p>'
          + '<h3>7. Контакты оператора</h3>'
          + '<p>ИП Татауров Антон Юрьевич, ИНН 920000802153, ОГРНИП 324920000019876, г. Севастополь. Поддержка — через приложение (раздел «Помощь»).</p>',

        subscription: '<p><strong>Дата публикации:</strong> 1 марта 2026 г.</p>'
          + '<p>Настоящее Соглашение регулирует условия приобретения пакетов и внутренней валюты «Искры» в YupSoul.</p>'
          + '<h3>1. Условия пакетов</h3>'
          + '<ul>'
          + '<li><strong>YupSoul Душа</strong> — 810 ₽ / месяц (✦ 5 треков)</li>'
          + '<li><strong>YupSoul Глубина</strong> — 2 030 ₽ / месяц (✦ 15 треков)</li>'
          + '<li><strong>Лаборатория (Мастер)</strong> — 3 250 ₽ / месяц (✦ 30 треков)</li>'
          + '</ul>'
          + '<p>Цены фиксированы. Списание производится в рублях.</p>'
          + '<h3>2. Оплата</h3>'
          + '<p>Оплата производится разово. Доступ к пакету открывается на 30 дней с даты оплаты. Автоматических повторных списаний нет — по окончании срока доступ просто завершается.</p>'
          + '<h3>3. Прекращение доступа</h3>'
          + '<p>Доступ по пакету действует до конца оплаченного 30-дневного периода. Поскольку повторные списания не производятся, отдельная отмена не требуется.</p>'
          + '<p>Доступ по пакету сохраняется до конца оплаченного 30-дневного периода.</p>'
          + '<h3>4. Возврат</h3>'
          + '<p>Возврат неиспользованной части пакета производится пропорционально оставшимся дням. Для оформления возврата обратитесь в поддержку через приложение (Профиль → Помощь и поддержка).</p>'
          + '<h3>5. Изменение условий</h3>'
          + '<p>Исполнитель вправе изменить условия пакетов, уведомив Пользователя через приложение не менее чем за 14 дней до вступления изменений в силу.</p>'
          + '<h3>6. Искры — внутренняя валюта</h3>'
          + '<p><strong>Искра</strong> — единица учёта внутри YupSoul. 1 песня = 100 Искр.</p>'
          + '<p><strong>Откуда приходят Искры:</strong></p>'
          + '<ul>'
          + '<li>Первая песня — это вкус: минута звучания открыта сразу, полную песню открываешь за Искры или оплату</li>'
          + '<li>За дела в приложении: 30 Искр за тур при первом входе, 2 Искры в день за «Искру дня» (до 10 за серию), 5 Искр за разрешённые уведомления</li>'
          + '<li>Реферальные: 200 Искр, когда приглашённый тобой друг оформит подписку</li>'
          + '<li>По пакету — отдельный лимит «N треков» по тарифу</li>'
          + '<li>Пакеты Искр (доступны в любой момент): 1000 Искр / 1 630 ₽, 2000 Искр / 2 450 ₽, 5000 Искр / 5 300 ₽</li>'
          + '</ul>'
          + '<p><strong>Использование:</strong> Искры списываются автоматически при создании песни. Не сгорают, копятся бессрочно.</p>'
          + '<p><strong>Возврат за пакет Искр:</strong> если пакет приобретён менее 14 дней назад и Искры не использованы, возврат через поддержку. Использованные Искры возврату не подлежат.</p>'
      };
      /* @@native-strip:end */

      (function initLegalModal() {
        var modal = document.getElementById('legalModal');
        if (!modal) return;
        var contentEl = document.getElementById('legalModalContent');
        var closeBtn = document.getElementById('legalModalCloseBtn');
        var tabBtns = modal.querySelectorAll('.legal-tab-btn');

        function setActiveTab(name) {
          tabBtns.forEach(function(b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-legal-tab') === name ? 'true' : 'false');
          });
          if (!contentEl) return;
          // OK Mini Apps §2.2: используем OK-нейтрализованный текст без упоминаний
          // VK / Telegram / ВКонтакте / vk.com. На остальных платформах — общий текст.
          var contentSource = (window._isOkMiniApp && window._LEGAL_CONTENT_OK) ? window._LEGAL_CONTENT_OK : window._LEGAL_CONTENT;
          var html = (contentSource && contentSource[name]) || '';
          // КАНОН v5 (отказ VK 22.07, §5.2.5): голоса удалены. На VK оплата — банковской
          // картой через интернет-эквайринг Т-Банк и только в веб-версиях vk.ru / m.vk.ru
          // (§5.4.1). ₽-цены в документах корректны; способы других платформ (Stars)
          // не упоминаем. Подмена при рендере, общий словарь (web/TG) не мутируем.
          if ((window._isVkMiniApp || window._appEnv === 'vk') && html) {
            html = html
              .replace(/Оплата производится одним из доступных способов:[^<]*/,
                'Оплата производится банковской картой (Visa, Mastercard, МИР) через интернет-эквайринг Т-Банк в веб-версиях vk.ru и m.vk.ru. В мобильных клиентах ВКонтакте (iOS / Android) оплата недоступна (§5.4.1 Правил VK Mini Apps).')
              .replace(/Валюта транзакции:[^<]*/,
                'Валюта транзакции: российский рубль (₽).')
              .replace(/Telegram Stars/g, 'банковская карта');
          }
          if (!html) {
            contentEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,0.4);">Раздел временно недоступен</div>';
            return;
          }
          contentEl.innerHTML = html;
          contentEl.scrollTop = 0;
          modal.scrollTop = 0;
        }

        window.showLegalModal = function(section) {
          var s = section || 'offer';
          // Приложение из App Store: в _LEGAL_CONTENT реквизиты российского продавца для веба, VK и
          // Telegram, а продавец в App Store — Yupland Digital Solutions, LLC.
          // Эта функция определяется позже шаблонной и заменяет её, поэтому
          // нативная ветка обязана жить здесь: правка только в шаблоне на айфоне
          // не срабатывала (проверено 17.09 на _native-test.html).
          if (window._isNativeApp) {
            var docBase = (window.BACKEND_URL || window.HEROES_API_BASE || 'https://www.yupsoul.ru').replace(/\/$/, '');
            window.open(docBase + (s === 'privacy' ? '/privacy-en' : '/terms-en'), '_blank');
            return;
          }
          modal.style.display = 'block';
          modal.setAttribute('aria-hidden', 'false');
          setActiveTab(s);
        };
        window.hideLegalModal = function() {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        };

        if (closeBtn) closeBtn.addEventListener('click', window.hideLegalModal);
        tabBtns.forEach(function(b) {
          b.addEventListener('click', function() {
            setActiveTab(b.getAttribute('data-legal-tab'));
            // Batch 10.1 (отчёт 7268608 Windows): при клике на частично
            // скрытую вкладку контент менялся, но сама вкладка не подъезжала
            // в видимую область — оставалась обрезанной. Скроллим табы в
            // центр горизонтальной полосы при клике.
            try { b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch (_) {}
          });
        });
        // Закрытие по клику на фон
        modal.addEventListener('click', function(e) {
          if (e.target === modal) window.hideLegalModal();
        });
      })();

      // «Про двоих» у Master: person1 берётся из ПИКЕРА (карточка «Я» + герои), который
      // пишет выбор в скрытые главные поля (#name/#birthdate/#gender — источник сабмита).
      // Раньше рядом с пикером ОДНОВРЕМЕННО показывались те же главные поля/профиль-аккордеон
      // → person1 запрашивался дважды («три окошка» вместо двух, баг Аллы 08.07). Прячем
      // дублирующую поверхность person1, оставляя видимым #language (язык песни — общий).
      // Способ — класс на body + CSS `!important` (не inline): выбор героя зовёт fillFormFromHero
      // → applyProfileAccordion, который сворачивает wrap и заново показывает профиль-аккордеон;
      // inline-стили он бы перебил, класс с !important — переживает любые перерисовки.
      // Уход из couple снимает класс → штатная логика профиля/collapse снова в силе (без restore).
      function _applyCoupleP1Layout(on) {
        try { document.body.classList.toggle('ys-couple-lab', !!on); } catch(_) {}
        _syncCoupleGenderVisibility();
      }
      // «2 карточки» (Алла 11.07): поле «Пол» в couple-master скрыто (пол внутри карточки
      // человека). Fallback: у выбранного «Я»/героя пол пуст → показываем поле, иначе
      // submit упрётся в невидимое обязательное (#gender скрыт, а валидация его требует).
      function _syncCoupleGenderVisibility() {
        try {
          var g = document.getElementById('gender');
          var need = document.body.classList.contains('ys-couple-lab') && (!g || !g.value);
          document.body.classList.toggle('ys-gender-needed', need);
        } catch(_) {}
      }
      window._syncCoupleGenderVisibility = _syncCoupleGenderVisibility;
      // «Карточка = кнопка» (Алла 11.07): тап по карточке человека открывает его пикер.
      // P1 существует только в couple-master. P2: в couple-master — пикер, иначе — аккордеон.
      // stopPropagation обязателен: клик по карточке всплывал до document-хендлера
      // закрытия дропдауна — список закрывался в ту же миллисекунду, что открылся.
      window._p1CardTap = function(ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        var b = document.getElementById('pickPerson1FromLabBtn');
        if (b) b.click();
      };
      // «Развернуть» под карточками (Алла 11.07): раскрывает анкету для правки.
      function _tlExp(k, fb) { return (typeof t === 'function' && t(k)) || fb; }
      window._p1ExpandToggle = function(ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        var on = document.body.classList.toggle('ys-p1-expanded');
        var l = document.getElementById('p1ExpandLink');
        if (l) l.textContent = on ? _tlExp('coupleCollapseEdit', 'Свернуть') : _tlExp('coupleExpandEdit', 'Развернуть');
        if (window._syncP1NameHint) window._syncP1NameHint();
      };
      window._p2ExpandToggle = function(ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (typeof toggleSecondPersonAccordion === 'function') toggleSecondPersonAccordion();
        if (typeof window._syncP2ExpandLink === 'function') window._syncP2ExpandLink();
        if (window._syncP2NameHint) window._syncP2NameHint();
      };
      // Мини-хинт «Это имя прозвучит в песне…» под свёрнутой карточкой (Алла 11.07):
      // анкета свёрнута — юзер забывает, что имя споётся. Виден когда карточка свёрнута и имя есть.
      window._syncP1NameHint = function() {
        var h = document.getElementById('p1NameHint');
        if (!h) return;
        var nm = (document.getElementById('name') || {}).value || '';
        var expanded = document.body.classList.contains('ys-p1-expanded');
        h.style.display = (nm && !expanded && document.body.classList.contains('ys-couple-lab')) ? 'block' : 'none';
      };
      window._syncP2NameHint = function() {
        var h = document.getElementById('p2NameHint');
        if (!h) return;
        var nm = (document.getElementById('name2') || {}).value || '';
        var open = false;
        try { open = (typeof p2AccOpen !== 'undefined') ? !!p2AccOpen : false; } catch(_) {}
        h.style.display = (nm && !open && document.body.classList.contains('ys-couple-lab')) ? 'block' : 'none';
      };
      window._syncP2ExpandLink = function() {
        var l = document.getElementById('p2ExpandLink');
        if (!l) return;
        var open = false;
        try { open = (typeof p2AccOpen !== 'undefined') ? !!p2AccOpen : false; } catch(_) {}
        l.textContent = open ? _tlExp('coupleCollapseEdit', 'Свернуть') : _tlExp('coupleExpandEdit', 'Развернуть');
      };
      window._p2CardTap = function(ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (document.body.classList.contains('ys-couple-lab')) {
          var b = document.getElementById('pickFromLabBtn');
          if (b) { b.click(); return; }
        }
        if (typeof toggleSecondPersonAccordion === 'function') toggleSecondPersonAccordion();
      };
      try {
        var _gSel = document.getElementById('gender');
        if (_gSel) _gSel.addEventListener('change', _syncCoupleGenderVisibility);
      } catch(_) {}

      function toggleFormsByMode(mode) {
        var p2Accordion = document.getElementById('secondPersonAccordion');
        var transitAccordion = document.getElementById('transitAccordion');
        if (p2Accordion) p2Accordion.style.display = 'none';
        if (transitAccordion) transitAccordion.style.display = 'none';
        if (mode === 'couple') {
          if (p2Accordion) {
            p2Accordion.style.display = 'block';
            // «Карточка = кнопка» (Алла 11.07): в couple-master анкета второго СВЁРНУТА —
            // выбор из пикера по тапу на карточку; ручной ввод — пунктом внутри пикера.
            // Не-master: как раньше, авто-открыть ручные поля.
            var _mc = userTariff === 'master' && !window.subscriptionCancelledByUser;
            setTimeout(function() {
              if (_mc) { if (typeof p2AccOpen !== 'undefined' && p2AccOpen) toggleSecondPersonAccordion(); }
              else { openSecondPersonAccordion(); }
              if (typeof window._syncP2ExpandLink === 'function') window._syncP2ExpandLink();
              if (window._syncP1NameHint) window._syncP1NameHint();
              if (window._syncP2NameHint) window._syncP2NameHint();
            }, 80);
          }
          // Единый пикер «Про двоих» (Алла 05.07): без переключателей режимов.
          // Первый и второй человек выбираются из списка «Я» + карточки; для Master
          // показываем оба пикера, у не-master — обычные поля (person1 = профиль).
          window._selectedPerson1Hero = null;
          var isMasterCouple = userTariff === 'master' && !window.subscriptionCancelledByUser;
          var p1LabWrap = document.getElementById('pickPerson1FromLabWrap');
          if (p1LabWrap) p1LabWrap.style.display = isMasterCouple ? '' : 'none';
          var p1BtnText = document.getElementById('pickPerson1BtnText');
          var _selfName = '';
          // Дефолт «Я» (частый кейс «я + кто-то»): ЯВНО засеиваем главные поля профилем,
          // иначе они пустые → сабмит упрётся в невидимое обязательное поле. Выбор героя в пикере перезапишет.
          // ВАЖНО: засев ДО _applyCoupleP1Layout — fillFormFromHero заново показывает profileAccordion,
          // поэтому прячем поверхность person1 ПОСЛЕ засева, а не до.
          if (isMasterCouple) {
            try {
              if (typeof window._selfHeroReady === 'function' && window._selfHeroReady() && typeof window._buildSelfHero === 'function') {
                var _self = window._buildSelfHero();
                _selfName = _self && _self.name ? _self.name : '';
                window._selectedPerson1Hero = _self;
                if (typeof fillFormFromHero === 'function') fillFormFromHero(null); // null = восстановить профиль в поля
              }
            } catch(_) {}
          }
          // Master: person1 из пикера → прячем дублирующие главные поля person1 (два окошка, не три).
          // Не-master: person1 = обычные поля (пикера нет), поля остаются видимыми.
          _applyCoupleP1Layout(isMasterCouple);
          if (p1BtnText) {
            if (isMasterCouple && _selfName) {
              p1BtnText.textContent = ((typeof t === 'function' && t('coupleSelfCard')) || 'Я') + ' · ' + _selfName;
            } else {
              p1BtnText.textContent = typeof t === 'function' ? t('couplePerson1Pick') : 'Выбрать из Лаборатории';
            }
          }
          // «Карточка = кнопка»: сводка выбора живёт в самой карточке
          var p1AccNameReset = document.getElementById('p1AccName');
          if (p1AccNameReset) {
            p1AccNameReset.textContent = (isMasterCouple && _selfName)
              ? (((typeof t === 'function' && t('coupleSelfCard')) || 'Я') + ' · ' + _selfName)
              : (typeof t === 'function' ? t('couplePerson1Label') : 'Первый человек');
          }
          // Сброс текста кнопки «Выбрать из Лаборатории», если данные второго человека пусты
          var n2 = document.getElementById('name2');
          var btnTextEl = document.getElementById('pickFromLabBtnText');
          if (btnTextEl && n2 && !(n2.value || '').trim()) btnTextEl.textContent = (typeof t === 'function' ? t('pickFromLab') : 'Выбрать из Лаборатории');
          // VK Testers (couple gating): пикер «Выбрать из Лаборатории» — удобство
          // ТОЛЬКО для Лаборатории. Раньше он показывался ВСЕМ с замком 🔒 +
          // хинтом «Выбери человека из Лаборатории», из-за чего подарочный
          // пользователь думал, что «Песня для двоих» требует тариф. На деле
          // couple доступен всем (ручной ввод второго человека ниже). Фикс:
          // для не-master скрываем весь блок — остаются только обычные поля.
          var labPickWrap = document.getElementById('pickFromLabWrap');
          var isLabLocked = userTariff !== 'master' || window.subscriptionCancelledByUser;
          if (labPickWrap) labPickWrap.style.display = isLabLocked ? 'none' : '';
          var pickBtn = document.getElementById('pickFromLabBtn');
          var pickChevron = document.getElementById('pickFromLabChevron');
          if (pickBtn) {
            pickBtn.style.opacity = '';
            pickBtn.style.cursor = 'pointer';
            if (pickChevron) pickChevron.textContent = '▾';
          }
        } else if (mode === 'transit') {
          if (transitAccordion) {
            transitAccordion.style.display = 'block';
            // Авто-открыть если ещё закрыт
            setTimeout(function() { openTransitAccordion(); }, 80);
          }
        }
        if (mode !== 'couple') {
          // Полная очистка всех person2 полей (имя, дата, город, координаты, атрибуты)
          if (typeof clearPerson2Fields === 'function') clearPerson2Fields();
          // Закрыть аккордеон при смене режима
          if (p2AccOpen) toggleSecondPersonAccordion();
          // Сброс выбора первого человека при уходе из couple
          window._selectedPerson1Hero = null;
          // Вернуть главные поля person1 (были спрятаны у master-couple)
          _applyCoupleP1Layout(false);
        }
        if (mode !== 'transit') {
          // Закрыть аккордеон энергии момента при смене режима
          if (transitAccOpen) toggleTransitAccordion();
        }
      }

      function updateStepUI() {
        document.querySelectorAll('.mode-btn').forEach(function(btn) { btn.style.display = ''; });
      }

      function setMode(mode) {
        selectedMode = mode || 'single';
        document.querySelectorAll('.mode-btn[data-mode]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-mode') === selectedMode);
        });
        toggleFormsByMode(selectedMode);
        // При смене режима сбрасываем выбранного героя и восстанавливаем данные профиля
        if (typeof _selectedHeroId !== 'undefined' && _selectedHeroId) {
          _selectedHeroId = null;
          var fwEl = document.getElementById('forWho');
          if (fwEl) fwEl.value = '';
          if (typeof fillFormFromHero === 'function') fillFormFromHero(null);
        }
        // Не раскрывать форму при смене режима — свёрнутое состояние (аккордеон при повторном входе) задаёт только loadSavedProfileForForm
        updatePaymentUiFromCatalog();
      }

      function _showFormHint(msg, focusFieldId) {
        var el = document.getElementById('submitHint');
        // Batch 6.1: убираем inline color — стиль теперь через CSS (тёмная и светлая тема)
        if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; el.style.removeProperty('color'); }
        // Развернуть аккордеон, если форма свёрнута — иначе пользователь не увидит поле
        if (msg && focusFieldId) {
          var formWrap = document.getElementById('formFieldsWrap');
          if (formWrap && formWrap.classList.contains('pfw-collapsed')) {
            formWrap.classList.remove('pfw-collapsed');
            var chevron = document.getElementById('pfaChevron');
            // Batch 6.3 (ID 7262408): expand → стрелка ВВЕРХ
            if (chevron) chevron.classList.add('open');
          }
          // Поля второго человека живут в свёрнутом аккордеоне (max-height:0) — без
          // раскрытия подсветка/скролл уходили в элемент нулевой высоты (Светлана 07.08)
          if (/2/.test(focusFieldId)) {
            try { if (typeof openSecondPersonAccordion === 'function') openSecondPersonAccordion(); } catch(_) {}
          }
          // Пол в couple скрыт CSS до ys-gender-needed — вернуть поле на экран перед подсветкой
          if (focusFieldId === 'gender' && document.body.classList.contains('ys-couple-lab')) {
            document.body.classList.add('ys-gender-needed');
          }
          var field = document.getElementById(focusFieldId);
          var wrap = field && (field.closest('.field') || field.closest('.step-panel') || field.parentElement);
          if (wrap) {
            try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
            wrap.style.transition = 'box-shadow 0.3s';
            wrap.style.boxShadow = '0 0 0 2px rgba(236,72,153,0.5), 0 0 16px rgba(236,72,153,0.2)';
            wrap.style.borderRadius = '12px';
            setTimeout(function() { wrap.style.boxShadow = ''; }, 2500);
          }
          if (field && field.focus) try { field.focus(); } catch(_) {}
        } else if (msg && el) {
          try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        }
      }
      // Batch 10.10 (отчёт 7271895 MacOS): нативный confirm(msg) Safari/Chrome
      // показывал с заголовком домена «yupsoul.ru» — тестер думал что это
      // фишинг (сторонний сайт). Теперь: Telegram → WebApp.showConfirm,
      // VK → vkBridge.VKWebAppShowAlert (с native VK-стилем), web →
      // custom in-app modal без браузерного диалога.
      function _safeConfirm(msg) {
        return new Promise(function(resolve) {
          if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showConfirm) {
            window.Telegram.WebApp.showConfirm(msg, function(ok) { resolve(!!ok); });
            return;
          }
          if (window._appEnv === 'vk' && window.vkBridge && typeof vkBridge.send === 'function') {
            // VK Bridge показывает нативный VK-confirm (без yupsoul.ru в заголовке)
            vkBridge.send('VKWebAppShowAlert', { message: msg, type: 'confirm' }).then(function(r) {
              resolve(!!(r && r.result));
            }).catch(function() {
              // fallback на custom modal если bridge недоступен
              _showCustomConfirm(msg, resolve);
            });
            return;
          }
          // Web — наш стилизованный modal
          _showCustomConfirm(msg, resolve);
        });
      }
      // Экспорт обязателен: unbindCard («Отвязать карту», 04-tbank) зовёт _safeConfirm голым
      // именем из своего замыкания и падает ReferenceError'ом. Проверено вызовом
      // window.unbindCard() в браузере 17.07 — отвязка карты была сломана полностью.
      window._safeConfirm = _safeConfirm;
      // In-app modal для confirm — без браузерного дислога с доменом
      function _showCustomConfirm(msg, resolve) {
        var existing = document.getElementById('_inAppConfirmModal');
        if (existing) existing.remove();
        var ov = document.createElement('div');
        ov.id = '_inAppConfirmModal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
        ov.innerHTML = '<div style="max-width:340px;width:100%;background:rgba(20,15,40,0.97);border:1px solid rgba(167,139,250,0.25);border-radius:18px;padding:22px;text-align:center;color:#fff;font-family:inherit;">' +
          '<p style="font-size:0.95rem;line-height:1.5;margin:0 0 18px;color:rgba(255,255,255,0.92);">' + String(msg).replace(/</g,'&lt;') + '</p>' +
          '<div style="display:flex;gap:10px;justify-content:center;">' +
          '<button type="button" id="_iacOk" style="flex:1;padding:11px 20px;border-radius:9999px;background:linear-gradient(135deg,#a78bfa,#ec4899);border:none;color:#fff;font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit;">Да</button>' +
          '<button type="button" id="_iacCancel" style="flex:1;padding:11px 20px;border-radius:9999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);font-size:0.88rem;cursor:pointer;font-family:inherit;">Отмена</button>' +
          '</div></div>';
        document.body.appendChild(ov);
        var done = function(val) { ov.remove(); resolve(val); };
        document.getElementById('_iacOk').onclick = function() { done(true); };
        document.getElementById('_iacCancel').onclick = function() { done(false); };
        ov.onclick = function(e) { if (e.target === ov) done(false); };
      }
      function validateStep(step) {
        if (step === 1) {
          selectedMode = selectedMode || 'single';
          return true;
        }
        if (step === 2) {
          var nameEl = document.getElementById('name');
          var birthdateEl = document.getElementById('birthdate');
          var birthplaceEl = document.getElementById('birthplace');
          var unknownEl = document.getElementById('unknown');
          var birthtimeEl = document.getElementById('birthtime');
          var genderEl = document.getElementById('gender');
          var langEl = document.getElementById('language');

          // ЗАКОН: если поля пустые — подтянуть из сохранённого профиля (race condition с async fetch)
          // VK Testers 7272191 (Тамара Глазунова MacOS): если выбран герой с НЕПОЛНЫМИ данными
          // (только имя без даты/места), автоподстановка профиля воровала данные пользователя в форму
          // героя и валидация проходила. Теперь skip auto-fill из профиля, если герой выбран —
          // тогда validation увидит реальные пустые поля и заблокирует submit.
          var _heroSelected = (typeof _selectedHeroId !== 'undefined' && _selectedHeroId) ||
                              (typeof _selectedLabHeroId !== 'undefined' && _selectedLabHeroId);
          var sp = !_heroSelected ? (window._savedFormProfile || getCachedProfile()) : null;
          if (sp) {
            if (birthtimeEl && !birthtimeEl.value && !birthtimeEl.disabled && sp.birthtime) {
              birthtimeEl.value = normalizeTimeValue(sp.birthtime);
              console.log('[validateStep] Подставлено время из профиля:', birthtimeEl.value);
            }
            if (genderEl && !genderEl.value && sp.gender) {
              genderEl.value = sp.gender;
              console.log('[validateStep] Подставлен пол из профиля:', genderEl.value);
            }
            if (langEl && !langEl.value && sp.language) {
              langEl.value = sp.language;
            }
            // Имя НЕ дозаполняем здесь (Алла 05.07): имя необязательное, префилл при ОТКРЫТИИ формы
            // делает fillFormFromProfile(). Если юзер стёр имя — оно должно остаться пустым (не поётся),
            // поэтому safety-net re-fill на каждом validateStep для имени убран.
            if (birthdateEl && !birthdateEl.value && sp.birthdate) {
              birthdateEl.value = sp.birthdate;
              if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate');
            }
            if (birthplaceEl && !birthplaceEl.value.trim() && sp.birthplace) {
              birthplaceEl.value = sp.birthplace;
              if (sp.birthplace.length >= 3) {
                birthplaceEl.setAttribute('data-from-profile', '1');
                birthplaceEl.setAttribute('data-place-selected', '1');
              }
            }
            if (unknownEl && sp.birthtime_unknown && !birthtimeEl.value) {
              unknownEl.checked = true;
              birthtimeEl.disabled = true;
            }
            if (window._syncAdvSummary) window._syncAdvSummary();
          }

          var name = (nameEl ? nameEl.value : '').trim();
          var birthdate = birthdateEl ? birthdateEl.value : '';
          var birthplace = (birthplaceEl ? birthplaceEl.value : '').trim();
          var birthtimeVal = (unknownEl && unknownEl.checked) ? 'ok' : (birthtimeEl ? birthtimeEl.value : '');
          var gender = genderEl ? genderEl.value : '';
          var language = langEl ? langEl.value : '';
          // Имя НЕОБЯЗАТЕЛЬНО (Алла 05.07): пустое поле → песня без имени. Не дозаполняем из
          // профиля/Telegram — иначе «стереть имя» не сработает. Валидируем формат ТОЛЬКО для введённого
          // имени (зеркало isValidNameInput из bot/validation.js): непустое имя должно быть корректным
          // (≥2 символа, без мусора/повторов).
          if (name && (name.length < 2 || name.length > 50 || /(.)\1{4,}/u.test(name) || !/\p{L}/u.test(name) || new Set(name.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 2)) {
            _showFormHint(t('alertNameInvalid'), 'name'); return false;
          }
          if (!birthdate) { _showFormHint(t('alertBirthdate'), 'birthdateDay'); return false; }
          // VK Testers ID 7261278 (Глазунова, Windows): тестер вводил «12.12.0001»
          // и «12.12.5000» — некорректные годы. Валидация: год должен быть от
          // 1900 до текущего. Месяц 1-12, день — реальное число для месяца.
          var _bdParts = String(birthdate).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (_bdParts) {
            var _y = parseInt(_bdParts[1], 10);
            var _m = parseInt(_bdParts[2], 10);
            var _d = parseInt(_bdParts[3], 10);
            var _curYear = new Date().getFullYear();
            if (_y < 1900 || _y > _curYear || _m < 1 || _m > 12 || _d < 1 || _d > 31) {
              _showFormHint(typeof t === 'function' ? (t('alertBirthdateInvalid') || 'Год рождения должен быть от 1900 до текущего') : 'Год рождения должен быть от 1900 до текущего', 'birthdateDay');
              return false;
            }
            // VK Testers 7279737 (Maria Lykosova Android 18.05): 31 февраля пропускалось
            // на сервер без валидации. Корень: проверка `_d < 1 || _d > 31` не учитывала
            // что в феврале только 28/29 дней. Фикс: Date constructor — если результат
            // не совпадает с input (Feb 31 → Mar 3), значит дата невалидна.
            var _testDt = new Date(_y, _m - 1, _d);
            if (_testDt.getFullYear() !== _y || _testDt.getMonth() !== (_m - 1) || _testDt.getDate() !== _d) {
              _showFormHint(typeof t === 'function' ? (t('alertBirthdateInvalidDay') || 'Введена некорректная дата — проверь день и месяц') : 'Введена некорректная дата — проверь день и месяц', 'birthdateDay');
              return false;
            }
          }
          if (birthplace && birthplace.length < 3) { _showFormHint(t('alertBirthplace'), 'birthplace'); return false; }
          // Защита от мусорного ввода: повторы/однотипные символы, нет реальных букв.
          // Если в подсказках выбрано место (data-lat есть) — пропускаем эти проверки, доверяем геокодеру.
          var _bpField = document.getElementById('birthplace');
          var _bpHasLat = _bpField && _bpField.getAttribute('data-lat');
          if (birthplace && !_bpHasLat) {
            if (birthplace.length > 100) { _showFormHint(t('alertBirthplaceHint'), 'birthplace'); return false; }
            if (/(.)\1{4,}/u.test(birthplace)) { _showFormHint(t('alertBirthplaceHint'), 'birthplace'); return false; }
            if (!/\p{L}/u.test(birthplace)) { _showFormHint(t('alertBirthplaceHint'), 'birthplace'); return false; }
            var _bpLetters = birthplace.replace(/[^\p{L}]/gu, '').toLowerCase();
            var _bpUnique = new Set(_bpLetters);
            if (_bpUnique.size < 3) { _showFormHint(t('alertBirthplaceHint'), 'birthplace'); return false; }
          }
          var birthplaceField = document.getElementById('birthplace');
          var hasCoords = birthplaceField && birthplaceField.getAttribute('data-lat') && birthplaceField.getAttribute('data-lon');
          var hasPlaceSelected = birthplaceField && birthplaceField.getAttribute('data-place-selected');
          var fromProfile = birthplaceField && birthplaceField.getAttribute('data-from-profile') === '1';
          if (birthplace && !hasCoords && !hasPlaceSelected && !fromProfile) {
            // Фоновый геокодинг — не блокируем если поле заполнено достаточно
            if (birthplace && birthplace.length >= 3 && typeof getPlacesSearchUrl === 'function') {
              (function(el, val) {
                var geoUrl = getPlacesSearchUrl(val);
                fetch(geoUrl, { headers: { 'Accept': 'application/json' } })
                  .then(function(r) { return r.ok ? r.json() : []; })
                  .then(function(list) {
                    if (list && list.length > 0) {
                      el.setAttribute('data-place-selected', '1');
                      if (list[0].lat) el.setAttribute('data-lat', String(list[0].lat));
                      if (list[0].lon) el.setAttribute('data-lon', String(list[0].lon));
                    }
                  }).catch(function() {});
              })(birthplaceField, birthplace);
              birthplaceField.setAttribute('data-place-selected', '1');
            } else {
              var birthplaceHint = document.getElementById('birthplaceHint');
              if (birthplaceHint) birthplaceHint.style.display = 'block';
              try { birthplaceField && birthplaceField.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
              _showFormHint(t('alertBirthplaceHint'));
              return false;
            }
          }
          // Время рождения — НЕОБЯЗАТЕЛЬНО (в «Расширенных настройках»). Указано — пойдёт в расклад. void:
          void birthtimeVal;
          if (!gender) { _showFormHint(t('alertGender'), 'gender'); return false; }
          if (!language) { _showFormHint(t('alertLanguage'), 'language'); return false; }
          if (selectedMode === 'couple') {
            var name2 = (document.getElementById('name2').value || '').trim();
            var birthdate2 = document.getElementById('birthdate2').value;
            var birthplace2El = document.getElementById('birthplace2');
            var birthplace2 = birthplace2El ? birthplace2El.value.trim() : '';
            var bp2PlaceSelected = birthplace2El && birthplace2El.getAttribute('data-place-selected');
            var bp2FromProfile = birthplace2El && birthplace2El.getAttribute('data-from-profile') === '1';
            var bp2HasCoords = birthplace2El && birthplace2El.getAttribute('data-lat') && birthplace2El.getAttribute('data-lon');
            // Имя партнёра НЕОБЯЗАТЕЛЬНО (Алла 05.07): пустое → в песне не поётся. Формат — только для введённого.
            if (name2 && (name2.length < 2 || name2.length > 50 || /(.)\1{4,}/u.test(name2) || !/\p{L}/u.test(name2) || new Set(name2.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 2)) {
              _showFormHint(t('alertNameInvalid'), 'name2'); return false;
            }
            if (!birthdate2) { _showFormHint(t('alertBirthdate2'), 'birthdate2Day'); return false; }
            // VK Testers ID 7259402: валидация года рождения 2-го человека
            var _bd2Parts = String(birthdate2).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (_bd2Parts) {
              var _y2 = parseInt(_bd2Parts[1], 10);
              var _curY2 = new Date().getFullYear();
              if (_y2 < 1900 || _y2 > _curY2) {
                _showFormHint((typeof t === 'function' ? (t('alertBirthdateInvalid') || 'Год рождения должен быть от 1900 до текущего') : 'Год рождения должен быть от 1900 до текущего'), 'birthdate2Day');
                return false;
              }
            }
            if (birthplace2.length < 3) { _showFormHint(t('alertBirthplace2'), 'birthplace2'); return false; }
            if (!bp2HasCoords) {
              if (birthplace2.length > 100) { _showFormHint(t('alertBirthplaceHint'), 'birthplace2'); return false; }
              if (/(.)\1{4,}/u.test(birthplace2)) { _showFormHint(t('alertBirthplaceHint'), 'birthplace2'); return false; }
              if (!/\p{L}/u.test(birthplace2)) { _showFormHint(t('alertBirthplaceHint'), 'birthplace2'); return false; }
              var _bp2Letters = birthplace2.replace(/[^\p{L}]/gu, '').toLowerCase();
              if (new Set(_bp2Letters).size < 3) { _showFormHint(t('alertBirthplaceHint'), 'birthplace2'); return false; }
            }
            if (!bp2HasCoords && !bp2PlaceSelected && !bp2FromProfile) {
              // Фоновый геокодинг введённого значения — не блокируем отправку, координаты подтянутся асинхронно
              if (birthplace2 && birthplace2.length >= 3 && typeof getPlacesSearchUrl === 'function') {
                (function(el, val) {
                  var geoUrl = getPlacesSearchUrl(val);
                  fetch(geoUrl, { headers: { 'Accept': 'application/json' } })
                    .then(function(r) { return r.ok ? r.json() : []; })
                    .then(function(list) {
                      if (list && list.length > 0) {
                        el.setAttribute('data-place-selected', '1');
                        if (list[0].lat) el.setAttribute('data-lat', String(list[0].lat));
                        if (list[0].lon) el.setAttribute('data-lon', String(list[0].lon));
                      }
                    }).catch(function() {});
                })(birthplace2El, birthplace2);
                // Считаем достаточным — пользователь ввёл место, геокодинг идёт в фоне
                birthplace2El.setAttribute('data-place-selected', '1');
              } else {
                _showFormHint(t('alertBirthplaceHint'));
                try { birthplace2El && birthplace2El.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
                return false;
              }
            }
            var birthtime2Val = (document.getElementById('unknown2') && document.getElementById('unknown2').checked) ? 'ok' : (document.getElementById('birthtime2') ? document.getElementById('birthtime2').value : '');
            if (!birthtime2Val) { _showFormHint(t('alertBirthtime2')); return false; }
            if (!(document.getElementById('gender2') && document.getElementById('gender2').value)) { _showFormHint(t('alertGender2'), 'gender2'); return false; }
          }
          if (selectedMode === 'transit') {
            var tDate = document.getElementById('transitDate').value;
            var tLoc = document.getElementById('transitLocation').value.trim();
            if (!tDate) { _showFormHint(t('alertTransitDate'), 'transitDate'); return false; }
            if (!tLoc) { _showFormHint(t('alertTransitLocation'), 'transitLocation'); return false; }
          }
          return true;
        }
        if (step === 3) {
          var requestEl = document.getElementById('request');
          var request = requestEl ? requestEl.value.trim() : '';
          // Пустой запрос — подставляем дефолт «Моя музыка души»
          if (!request) {
            requestEl.value = 'Моя музыка души';
          }
          // Свой текст выбран, а поле пустое — петь нечего
          if (window._lyricsMode === 'own') {
            var _clEl = document.getElementById('customLyrics');
            var _cl = _clEl ? _clEl.value.trim() : '';
            if (_cl.length < 10) {
              _showFormHint(t('alertCustomLyrics'), 'customLyrics');
              return false;
            }
          }
          return true;
        }
        return true;
      }

      document.querySelectorAll('.mode-btn[data-mode]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          if (e.target.classList.contains('mode-info')) return;
          var _m = this.getAttribute('data-mode');
          // Замок форматов (Алла 07.07, первый вход): до первой покупки пакета Искр доступен
          // только «Обо мне». stopImmediatePropagation — на этих кнопках висит второй listener
          // (сброс Шага 3 при смене формата), он не должен срабатывать по запертой кнопке.
          if ((_m === 'couple' || _m === 'transit') && window._modeLocksActive === true) {
            e.stopImmediatePropagation();
            // Во время гайда по форме на шаге «Формат» (Алла 22.09) не редиректим на пополнение —
            // человека резко уносило без объяснения. Показываем подсказку «пока доступен один
            // формат» на месте тултипа, переход дальше — только по «Дальше ✓». stopImmediatePropagation
            // оставляем и в этой ветке: без него сработает listener сброса Шага 3 (ниже по файлу)
            // на моде, которая фактически не стала активной (setMode здесь не вызывался).
            if (typeof window._formGuideActiveStep === 'function' && window._formGuideActiveStep() === 1) {
              if (typeof window._formGuideShowLockedHint === 'function') window._formGuideShowLockedHint();
              return;
            }
            if (typeof goToPage === 'function') goToPage('topupPage');
            return;
          }
          setMode(_m);
        });
      });

      // ── Замок форматов до первой покупки пакета Искр (первый вход: только «Обо мне») ──
      // Источник: user_profiles.has_purchased_package (ставит grantPurchaseBySku при любом
      // провайдере пакета). Подписка тоже снимает замок (подписчик — платящий).
      // localStorage-кэш: раз купил — замок больше никогда не мигает, даже до ответа /api/me.
      window._applyModeLocks = function() {
        var unlocked = false;
        try { unlocked = localStorage.getItem('ys_pkg_unlocked') === '1'; } catch(_) {}
        var p = window._cachedProfile;
        if (!unlocked && p && p.has_purchased_package) unlocked = true;
        if (!unlocked && typeof userTariff !== 'undefined' && userTariff && userTariff !== 'basic') unlocked = true;
        if (unlocked) { try { localStorage.setItem('ys_pkg_unlocked', '1'); } catch(_) {} }
        // Профиль ещё не загружен и кэша нет → не запираем (не мигаем у платящих на старте)
        var locked = !unlocked && !!p;
        window._modeLocksActive = locked;
        document.querySelectorAll('.mode-btn[data-mode="couple"], .mode-btn[data-mode="transit"]').forEach(function(b) {
          b.classList.toggle('mode-locked', locked);
          var badge = b.querySelector('.mode-lock-badge');
          if (locked && !badge) {
            // Маленький замочек-кружок в углу (Алла 09.07): не раздувает карточку, подпись в aria
            badge = document.createElement('span');
            badge.className = 'mode-lock-badge';
            badge.setAttribute('aria-label', (typeof t === 'function' && t('modeLockedBadge')) || 'Доступно с пакетом');
            badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
            b.appendChild(badge);
          } else if (!locked && badge) {
            badge.remove();
          }
        });
      };
      try { window._applyModeLocks(); } catch(_) {}

      // ── Гайд-кольцо v4 — state-машина «точно пройден → плавно дальше» (Алла 09.07, финал) ──
      // Модель шага: active → completing (зелёная ✓-вспышка 380мс) → transition (переезд 520мс,
      // страница едет параллельно) → next-active. Никакого «следования за касанием» и гаданий:
      // шаг закрывается ТОЛЬКО реальным завершением действия:
      //   обязательные — формат: выбор «Обо мне»; дата: ВСЕ три селекта; пол: выбор;
      //                  запрос: ушёл из поля с текстом; стиль: выбор способа; создать: клик.
      //   опциональные (имя / расширенные / язык-с-дефолтом) — Enter/blur-после-изменения
      //                  ИЛИ явная кнопка «Дальше ✓» в тултипе. Просто тапнул мимо — кольцо ЖДЁТ.
      // Interruptible: новое действие юзера отменяет незавершённую вспышку/переезд (без блокировок).
      (function() {
        var GUIDE_KEY = 'yupsoul_form_guide_seen';
        var cur = 0, done = false, wired = false, guideEl = null, tipEl = null, paused = false;
        var _completeTimer = null, _nameBaseline = null, _cameFromAuto = false;
        function T(k, fb) { return (typeof t === 'function' && t(k)) || fb; }
        function fieldOf(id) { var e = document.getElementById(id); return e && e.closest ? (e.closest('.field') || e) : null; }
        // «Дальше ✓» на КАЖДОМ шаге (кроме старта/финала) — продвижение ТОЛЬКО явным
        // подтверждением, ничего не улетает само (Алла 09.07: «кнопка дальше должна быть
        // везде для первого раза; переключаю формат, а штучка улетела, хотя не подтвердила»).
        var OPTIONAL = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true };
        function STEPS() {
          return [
            { el: document.getElementById('startBtn'), host: document.querySelector('#homePage .page-scroll') || document.getElementById('homePage'), tip: T('guideTipStart', 'Жми — создадим твою песню') },
            { el: document.querySelector('#formPage .mode-cards'), tip: T('guideTipFormat', 'Выбери формат') },
            { el: fieldOf('name'), tip: T('guideTipName', 'Впишешь имя — прозвучит в песне. Не впишешь — не прозвучит') },
            { el: fieldOf('birthdate'), tip: '' },
            { el: document.getElementById('advSettings'), tip: T('guideTipAdv', 'По желанию: место и время — песня точнее') },
            { el: fieldOf('gender'), tip: T('guideTipGender', 'Выбери пол') },
            // Порядок шагов = порядок DOM (Алла 11.07: «язык» переехал вниз к стилю, гид
            // скакал вверх-вниз). Теперь строго сверху вниз: пол → запрос → язык → стиль.
            { el: fieldOf('request'), tip: T('guideTipRequest', 'Пара слов о теме — и песня получится точнее. Не хочешь — пропускай, соберём по твоему раскладу.') },
            { el: fieldOf('language'), tip: T('guideTipLanguage', 'На каком языке петь') },
            { el: document.getElementById('styleModeSwitcher'), tip: T('guideTipStyle', 'Выбери, как определить стиль') },
            // Голос песни — новый шаг 9 (Алла 01.08.2026). Встал ПОСЛЕ стиля, а не между
            // языком и стилем: индексы 2/3/5/6 зашиты в satisfied()/schedule()/go(), и
            // вставка в середину сдвинула бы их все. Здесь правится только OPTIONAL.
            { el: document.getElementById('lyricsModeSwitcher'), tip: T('guideTipLyrics', 'Со словами, только музыка или свой текст') },
            { el: document.getElementById('stepNext'), tip: T('guideTipCreate', 'Готово — жми «Создать»') }
          ];
        }
        function hostFor(i) { var s = STEPS()[i]; return (s && s.host) || document.querySelector('#formPage .page-scroll'); }
        function renderTip(i, overrideTxt) {
          var s = STEPS()[i];
          if (!tipEl) return;
          // overrideTxt (Алла 22.09): показать другой текст на ТЕКУЩЕМ шаге, не трогая STEPS()
          // — нужно для «locked»-подсказки на запертом формате (см. window._formGuideShowLockedHint).
          var txt = overrideTxt || (s && s.tip) || '';
          if (!txt && !OPTIONAL[i]) { tipEl.style.display = 'none'; return; }
          tipEl.style.display = '';
          tipEl.textContent = '';
          if (txt) tipEl.appendChild(document.createTextNode(txt));
          if (OPTIONAL[i]) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'fg-next';
            b.textContent = T('guideNextBtn', 'Дальше') + ' ✓';
            b.addEventListener('click', function(ev) { ev.stopPropagation(); complete(i); });
            tipEl.appendChild(b);
          }
        }
        function place(i) {
          var s = STEPS()[i]; var h = hostFor(i);
          if (!s || !s.el || !h || !guideEl) return;
          if (guideEl.parentElement !== h) {
            if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
            h.appendChild(guideEl);
          }
          var r = s.el.getBoundingClientRect(), hb = h.getBoundingClientRect(), pad = 8;
          guideEl.style.width = Math.round(r.width + pad * 2) + 'px';
          guideEl.style.height = Math.round(r.height + pad * 2) + 'px';
          guideEl.style.transform = 'translate(' + Math.round(r.left - hb.left - pad) + 'px,' + Math.round(r.top - hb.top + h.scrollTop - pad) + 'px)';
          // Тултип по умолчанию рисуется ВВЕРХ. Если над целью нет просвета (соседний блок
          // вплотную) — пилюля накрывала его текст (баг Миланы 26.07: шаг «Язык песни»
          // затирал кнопки выбора стиля). Замеряем зазор до элемента выше и переворачиваем вниз.
          try {
            // Ищем ближайшего ВИДИМОГО соседа выше: скрытые (display:none) дают нулевой rect
            // и завышают просвет — на этом эвристика и спотыкалась при первой проверке.
            var _prev = s.el.previousElementSibling, _pr = null;
            while (_prev) {
              var _c = _prev.getBoundingClientRect();
              if (_c.height > 0 && _c.width > 0) { _pr = _c; break; }
              _prev = _prev.previousElementSibling;
            }
            var _above = _pr ? _pr.bottom : hb.top;
            var _tipH = (tipEl && tipEl.offsetHeight) ? tipEl.offsetHeight : 32;
            guideEl.classList.toggle('tip-below', (r.top - _above) < (_tipH + pad + 6));
          } catch(_) {}
          guideEl.classList.add('show');
        }
        var _glueRaf = null, _movedAt = 0;
        // Порог 700 (было) оставлял окно 540-700мс БЕЗ покадровой докоррекции: явный place()
        // едет к цели ~520мс (длительность CSS-transition кольца), scrollIntoView стартует в 540мс
        // (см. schedule() ниже) — а _glueTick подхватывал докоррекцию только после 700мс. При
        // быстром прощёлкивании «Дальше ✓» (Алла 22.09: обрывки контура внизу экрана на шаге
        // «Язык песни») это измерено живьём: кольцо отставало от цели до -566px, пока не
        // «доезжало» кадр-в-кадр. 560 — сразу за 520мс переезда кольца, почти без зазора
        // до старта scrollIntoView (540мс), сам перелёт (0-520мс) не трогаем.
        function _glueTick() {
          _glueRaf = null;
          if (done || paused || !guideEl || !guideEl.classList.contains('show')) return;
          if (Date.now() - _movedAt > 560) { guideEl.classList.add('no-anim'); place(cur); }
          _glueRaf = requestAnimationFrame(_glueTick);
        }
        function schedule(i) {
          _movedAt = Date.now();
          if (guideEl) { guideEl.classList.remove('no-anim'); guideEl.classList.remove('step-done'); }
          renderTip(i);
          // Имя-шаг: СХЛОПЫВАЕМ постоянную подсказку поля (display:none, не visibility) — её
          // текст дублирует тип гайда, а зарезервированное место раздувало кольцо на ~40px
          // (мёртвый зазор снизу, дизайн-аудит 09.07). Вне шага — возвращаем.
          try { var _nh = document.getElementById('nameHint'); if (_nh) _nh.style.display = (i === 2) ? 'none' : ''; } catch(_) {}
          // Нижний хинт «Выбери формат… внизу» — второй слой подсказки поверх гида (наслоение,
          // Алла 09.07). Прячем на ВСЁ время гида, возвращаем на finish/stop.
          try { var _ph = document.getElementById('pageHintText'); if (_ph) _ph.style.display = 'none'; } catch(_) {}
          requestAnimationFrame(function() { requestAnimationFrame(function() {
            place(i);
            // Прокрутку к шагу запускаем ПОСЛЕ переезда кольца (не одновременно с ним).
            // Раньше глайд и smooth-scroll шли вместе: обновления от скролла проходили через
            // CSS-transition кольца и оно тянулось за уезжающей кнопкой — замер показывал отрыв
            // 84–98px на ~200мс каждый шаг («обучалка как замороженная», Алла 30.07).
            // Теперь: сначала кольцо доезжает, затем страница скроллится, а кольцо держится
            // за цель покадрово (no-anim) — без анимации, значит без отставания.
            setTimeout(function() {
              if (done || paused || cur !== i) return;
              try {
                var s = STEPS()[i];
                if (s && s.el) {
                  if (guideEl) guideEl.classList.add('no-anim');
                  s.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              } catch(_) {}
            }, 540);
          }); });
          setTimeout(function() { place(cur); }, 520);
          if (!_glueRaf) _glueRaf = requestAnimationFrame(_glueTick);
        }
        // Условие «шаг уже выполнен» (для авто-✓ при входе): дата целиком / пол выбран / запрос написан
        // Индексы обязаны совпадать с порядком STEPS(): 3=дата, 5=пол, 6=запрос, 7=язык.
        // Баг «перескакивает шаги» (Алла 30.07): после переезда «языка» вниз (11.07) индексы
        // тут не обновили — проверка для 7 смотрела на поле ЗАПРОСА, поэтому заполненный
        // запрос авто-закрывал ШАГ ВЫБОРА ЯЗЫКА, и гид пролетал его мимо. Язык — осознанный
        // выбор, авто-пропуска у него быть не должно вовсе.
        function satisfied(i) {
          if (i === 3) { var d=document.getElementById('birthdateDay'),m=document.getElementById('birthdateMonth'),y=document.getElementById('birthdateYear'); return !!(d&&m&&y&&d.value&&m.value&&y.value); }
          if (i === 5) { var g=document.getElementById('gender'); return !!(g&&g.value); }
          if (i === 6) { var r=document.getElementById('request'); return !!(r&&r.value&&r.value.trim()); }
          return false;
        }
        function go(i) {
          if (_completeTimer) { clearTimeout(_completeTimer); _completeTimer = null; }
          if (i >= STEPS().length) { finish(); return; }
          cur = i;
          // Скрин Аллы 11.07: подсказка «сотри имя» висела над компакт-строкой «ALLA · дата» —
          // поле имени было СВЁРНУТО в аккордеон, стирать нечего. Если элемент шага спрятан в
          // pfw-collapsed — раскрываем (как _showFormHint), place() внутри schedule() встанет
          // уже на живое поле (layout успевает: schedule асинхронный, закон №30).
          try {
            var _sEl = STEPS()[i] && STEPS()[i].el;
            var _fwG = document.getElementById('formFieldsWrap');
            if (_sEl && _fwG && _fwG.classList.contains('pfw-collapsed') && _fwG.contains(_sEl)) {
              _fwG.classList.remove('pfw-collapsed');
              var _chG = document.getElementById('pfaChevron');
              if (_chG) _chG.classList.add('open');
              // max-height анимируется → размеры доезжают ПОСЛЕ place: пересчёт по окончании
              setTimeout(function() { if (!done && !paused && cur === i) place(i); }, 380);
            }
          } catch(_) {}
          if (i === 2) { var n = document.getElementById('name'); _nameBaseline = n ? n.value : null; }
          schedule(i);
          // Шаг уже выполнен к моменту входа → показать ✓ (юзер видит подтверждение) и ехать дальше,
          // не заставляя переделывать сделанное (репро: залипание на заполненной дате).
          // НО не цепочкой: у возвращающегося юзера подряд заполнены дата+пол+запрос, и гид
          // пролетал их залпом — «перескакивает шаги» (Алла 30.07). Автоход разрешён только
          // если в шаг вошли ПО ДЕЙСТВИЮ человека; после авто-хода гид ждёт следующего тапа.
          if (satisfied(i) && !_cameFromAuto) setTimeout(function() { if (cur === i) complete(i, true); }, 650);
          _cameFromAuto = false;
        }
        // Завершение шага k: зелёная ✓-вспышка (380мс, success-feedback) → плавный переезд дальше.
        function complete(k, isAuto) {
          if (done || paused || cur !== k) return;
          if (_completeTimer) return;
          _cameFromAuto = !!isAuto;   // следующий go() узнает, что вход был автоматическим
          if (guideEl) {
            guideEl.classList.add('step-done');
            if (tipEl) { tipEl.style.display = ''; tipEl.textContent = '✓'; }
          }
          _completeTimer = setTimeout(function() {
            _completeTimer = null;
            // Последний шаг: дальше некуда — завершаем гид (Алла 11.07, TG Desktop: клик мимо
            // CTA на финале уходил в go(за-край) → STEPS()[10]=undefined → крэш place →
            // гид зависал вечным «✓» и съедал все клики. Открыл дорогу tap-outside).
            if (k + 1 >= STEPS().length) { finish(); return; }
            go(k + 1);
          }, 380);
        }
        // Без слов имя в песне не прозвучит — гид, закрываясь, не должен воскрешать эту подсказку
        function _restoreNameHint() { try { var _nh = document.getElementById('nameHint'); if (_nh && window._lyricsMode !== 'instrumental') _nh.style.display = ''; } catch(_) {} try { var _ph = document.getElementById('pageHintText'); if (_ph) _ph.style.display = ''; } catch(_) {} }
        function finish() {
          done = true;
          if (_completeTimer) { clearTimeout(_completeTimer); _completeTimer = null; }
          if (guideEl) guideEl.classList.remove('show');
          _restoreNameHint();
          try { localStorage.setItem(GUIDE_KEY, 'true'); } catch(_) {}
        }
        function hideRing() { if (guideEl) guideEl.classList.remove('show'); _restoreNameHint(); }
        function ensureRing() {
          if (guideEl) return true;
          var h = hostFor(cur); if (!h) return false;
          guideEl = document.createElement('div');
          guideEl.className = 'form-guide';
          tipEl = document.createElement('span');
          tipEl.className = 'tip';
          guideEl.appendChild(tipEl);
          if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
          h.appendChild(guideEl);
          return true;
        }
        function wire() {
          if (wired) return; wired = true;
          var sb = document.getElementById('startBtn');
          if (sb) sb.addEventListener('click', function() { if (!done && cur === 0) cur = 1; });
          var mc = document.querySelector('#formPage .mode-cards');
          if (mc) mc.addEventListener('click', function(e) {
            var b = e.target.closest('.mode-btn');
            if (!b || b.classList.contains('mode-locked')) return;
            var m = b.getAttribute('data-mode') || 'single';
            if (m !== 'single') { if (!done) { paused = true; hideRing(); } return; }
            if (!done && paused) { paused = false; go(Math.max(cur, 2)); return; }
            // НЕ продвигаем по клику формата — это только ВЫБОР. Дальше — по «Дальше ✓»
            // (Алла 09.07: «переключаю обо мне/про двоих, а штучка улетела, хотя не подтвердила»).
          });
          var nameEl = document.getElementById('name');
          if (nameEl) {
            // Имя-шаг продвигается ТОЛЬКО явным подтверждением: Enter/Done или кнопка «Дальше ✓».
            // НЕ по blur/изменению: имя часто префилится из Telegram, а стирание/тап уводили
            // подсветку раньше времени → шаг проскакивал на дату (Алла 09.07: «на имя не попадает
            // выделение, сразу кидает на дату»). Оставить пусто — тоже жать «Дальше».
            nameEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); complete(2); } });
          }
          // Дата — заполняется, но НЕ авто-завершается. Продвижение только «Дальше ✓» (Алла 09.07).
          // Расширенный шаг (место + время рождения) — ОБА поля опциональны, оба можно заполнить.
          // НЕ авто-завершаем по blur/чекбоксу: раньше первое же поле (место) при потере фокуса
          // (выбор города из автокомплита) перескакивало на пол, ПРОГЛАТЫВАЯ время рождения
          // (Алла 09.07). Продвигаемся ТОЛЬКО по «Дальше ✓» (OPTIONAL[4]=true) — как шаг имени.
          // Пол / Язык / Запрос / Стиль — ВЫБОР без авто-перехода. Продвижение только «Дальше ✓»
          // на каждом шаге (Алла 09.07: «кнопка дальше должна быть везде для первого раза»).
          var nx = document.getElementById('stepNext');
          if (nx) nx.addEventListener('click', function() { if (!done) finish(); });
          var fh = document.querySelector('#formPage .page-scroll');
          // Скролл-трекинг БЕЗ transition: иначе каждое обновление позиции сглаживается
          // анимацией и кольцо отстаёт от уезжающей кнопки (замер 30.07: отрыв до 98px).
          if (fh) fh.addEventListener('scroll', function() { if (!done && !paused && guideEl && guideEl.classList.contains('show') && cur >= 1) { guideEl.classList.add('no-anim'); place(cur); } }, { passive: true });
          var hh = document.querySelector('#homePage .page-scroll');
          if (hh) hh.addEventListener('scroll', function() { if (!done && !paused && guideEl && guideEl.classList.contains('show') && cur === 0) place(0); }, { passive: true });
          window.addEventListener('resize', function() { if (!done && !paused && guideEl && guideEl.classList.contains('show')) place(cur); });
          // Тап В ЛЮБОМ месте ВНЕ подсвеченной рамки = подтверждение шага (Алла 10.07: «дальше
          // не все догадываются — интуитивно ткнуть в любую точку экрана»; быстрые юзеры
          // прощёлкивают без тормоза). Кнопка «Дальше ✓» остаётся дублёром.
          // Bubble-фаза: клик по .fg-next (stopPropagation) сюда не долетает — двойного complete нет.
          // Исключения: элемент текущего шага (клик по полю/карточкам = работа с шагом, не подтверждение),
          // геометрия кольца (оно pointer-events:none — ловим по координатам), шаг 0 (клик по CTA сам ведёт).
          document.addEventListener('click', function(e) {
            if (done || paused || cur < 1) return;
            if (!guideEl || !guideEl.classList.contains('show')) return;
            if (guideEl.contains(e.target)) return;
            var s = STEPS()[cur];
            if (s && s.el && (s.el === e.target || s.el.contains(e.target))) return;
            var r = guideEl.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
            complete(cur);
          });
        }
        function isForce() { try { return /[?&]tour=1\b/.test(location.search || ''); } catch(_) { return false; } }
        function gateOk(force) {
          try { if (force) localStorage.removeItem(GUIDE_KEY); } catch(_) {}
          // Миграция v2 (Алла 11.07): апдейт «имя можно стереть» должны увидеть и те, кто
          // прошёл СТАРЫЙ гид — включая опытных с песнями (они-то и забывают стирать имя).
          // Одноразово: сброс GUIDE_KEY + разовый пропуск has-tracks-гейта ниже.
          try {
            if (localStorage.getItem('ys_guide_name_v2') !== '1') {
              localStorage.setItem('ys_guide_name_v2', '1');
              if (localStorage.getItem(GUIDE_KEY) === 'true') {
                localStorage.removeItem(GUIDE_KEY);
                localStorage.setItem('ys_guide_rerun_once', '1');
              }
            }
          } catch(_) {}
          try { if (localStorage.getItem(GUIDE_KEY) === 'true') return false; } catch(_) {}
          try { if (localStorage.getItem('yupsoul_tour_completed') !== 'true') return false; } catch(_) {}
          var _rerunOnce = false;
          try { _rerunOnce = localStorage.getItem('ys_guide_rerun_once') === '1'; } catch(_) {}
          if (!force && !_rerunOnce) {
            if (window._meHasTracks === true) { try { localStorage.setItem(GUIDE_KEY, 'true'); } catch(_) {} return false; }
            if (window._meHasTracks === undefined) return false;
          }
          if (_rerunOnce) { try { localStorage.removeItem('ys_guide_rerun_once'); } catch(_) {} }
          return true;
        }
        window._startFormGuideHome = function() {
          if (done) return;
          if (!gateOk(isForce())) return;
          if ((document.body.dataset.page || '') !== 'homePage') return;
          if (!document.getElementById('startBtn')) return;
          paused = false;
          if (!ensureRing()) return;
          wire(); go(0);
        };
        window._startFormGuide = function() {
          if (!gateOk(isForce())) return;
          var am = document.querySelector('#formPage .mode-btn.active');
          if (am && (am.getAttribute('data-mode') || 'single') !== 'single') return;
          if (!ensureRing()) return;
          done = false; paused = false;
          wire(); go(Math.max(cur, 1));
        };
        window._stopFormGuide = function() { hideRing(); };
        // Геттер активного шага гида — нужен СНАРУЖИ IIFE обработчику клика на запертый .mode-btn
        // (Алла 22.09: «Про двоих»/«Энергия дня» резко уносили на пополнение без объяснения прямо
        // во время гайда на шаге «Формат»). -1 — гид не активен/на паузе/завершён.
        window._formGuideActiveStep = function() { return (!done && !paused && guideEl && guideEl.classList.contains('show')) ? cur : -1; };
        // Вместо редиректа на пополнение — подсказка «пока доступен один формат» на месте тултипа
        // текущего шага, кнопка «Дальше ✓» остаётся (OPTIONAL[cur] уже true для шага «Формат»).
        window._formGuideShowLockedHint = function() {
          if (done || paused || !guideEl || !guideEl.classList.contains('show')) return;
          renderTip(cur, T('guideTipFormatLocked', 'Пока доступна песня о себе. «Про двоих» и «Энергия дня» откроются вместе с пакетом'));
        };
      })();




      // Тултип для кнопок режима
      (function() {
        var tooltip = document.getElementById('modeTooltip');
        var tooltipTimer = null;
        function hideTooltip() {
          if (tooltip) tooltip.style.display = 'none';
          clearTimeout(tooltipTimer);
        }
        document.querySelectorAll('.mode-info').forEach(function(icon) {
          icon.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!tooltip) return;
            var descEl = this.closest('.mode-btn').querySelector('.mode-desc');
            var text = descEl ? descEl.textContent.trim() : '';
            if (!text) return;
            tooltip.textContent = text;
            var rect = this.getBoundingClientRect();
            tooltip.style.display = 'block';
            var tw = tooltip.offsetWidth || 180;
            var left = Math.min(rect.left, window.innerWidth - tw - 12);
            tooltip.style.left = Math.max(8, left) + 'px';
            tooltip.style.top = (rect.bottom + 8) + 'px';
            clearTimeout(tooltipTimer);
            tooltipTimer = setTimeout(hideTooltip, 3000);
          });
        });
        document.addEventListener('click', hideTooltip);
      })();

      function toggleQuickPicker(e) {
        if (e) e.stopPropagation();
        var btn = document.getElementById('quickPickerBtn');
        var sheet = document.getElementById('quickPickerSheet');
        var arrow = document.getElementById('quickPickerArrow');
        if (!btn || !sheet) return;
        var isOpen = sheet.style.display !== 'none';
        if (isOpen) {
          sheet.style.display = 'none';
          btn.classList.remove('open');
          if (arrow) arrow.style.transform = '';
        } else {
          sheet.style.display = 'block';
          btn.classList.add('open');
          if (arrow) arrow.style.transform = 'rotate(180deg)';
        }
      }
      // Экспортируем в глобальный scope — onclick-атрибут требует window.*
      window.toggleQuickPicker = toggleQuickPicker;

      function toggleStyleQuick(e) {
        if (e) e.stopPropagation();
        var btn = document.getElementById('styleQuickToggle');
        var sheet = document.getElementById('styleQuickList');
        var arrow = document.getElementById('styleQuickArrow');
        if (!btn || !sheet) return;
        var isOpen = sheet.style.display !== 'none';
        if (isOpen) {
          sheet.style.display = 'none';
          btn.classList.remove('open');
          if (arrow) arrow.style.transform = '';
        } else {
          sheet.style.display = 'block';
          btn.classList.add('open');
          if (arrow) arrow.style.transform = 'rotate(180deg)';
        }
      }
      window.toggleStyleQuick = toggleStyleQuick;

      (function() {
        document.addEventListener('click', function(e) {
          var sheet = document.getElementById('quickPickerSheet');
          var btn = document.getElementById('quickPickerBtn');
          if (!sheet || sheet.style.display === 'none') return;
          var box = document.querySelector('.request-input-box');
          if (box && box.contains(e.target)) return;
          sheet.style.display = 'none';
          if (btn) btn.classList.remove('open');
          var arrow = document.getElementById('quickPickerArrow');
          if (arrow) arrow.style.transform = '';
        });

        // Автоматическое закрытие списка стилей при клике вне блока
        document.addEventListener('click', function(e) {
          var sheet = document.getElementById('styleQuickList');
          var btn = document.getElementById('styleQuickToggle');
          if (!sheet || sheet.style.display === 'none') return;
          var field = document.querySelector('#requestPreferredStyle') && document.querySelector('#requestPreferredStyle').closest('.field');
          if (field && field.contains(e.target)) return;
          sheet.style.display = 'none';
          if (btn) btn.classList.remove('open');
          var arrow = document.getElementById('styleQuickArrow');
          if (arrow) arrow.style.transform = '';
        });

      })();

      // ── Быстрые запросы: динамическая загрузка из API ──
      window._quickButtonId = null; // ID выбранной кнопки (передаётся в форму)

      // Тултипы для кнопок — i18n: каждое текстовое поле = {ru,en,de,fr}
      function _qbl(v) { return v && typeof v === 'object' ? (v[currentLang] || v.ru || '') : (v || ''); }
      var BUTTON_TOOLTIPS = {
        'c4a80fa3': { icon: '◈', placeholderI18n: {en:'Tell me about my money channel based on my date of birth',de:'Erzähl mir von meinem Geldkanal nach meinem Geburtsdatum',fr:'Parle-moi de mon canal financier d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Tell us about our money channel based on our dates of birth',de:'Erzähl uns von unserem Geldkanal nach unseren Geburtsdaten',fr:'Parle-nous de notre canal financier d\'après nos dates de naissance'}, label: {ru:'Откуда придут деньги',en:'Where money comes from',de:'Woher das Geld kommt',fr:'D\'où vient l\'argent'}, duoLabel: {ru:'Откуда придут деньги вместе',en:'Where money comes from together',de:'Woher kommt das Geld zusammen',fr:'D\'où vient l\'argent ensemble'}, desc: {ru:'Песня раскроет, через что к тебе приходит изобилие',en:'A song about how abundance flows to you',de:'Ein Lied darüber, wie Fülle zu dir fließt',fr:'Une chanson sur comment l\'abondance te parvient'}, duoDesc: {ru:'Песня о том, как вы вместе притягиваете ресурсы',en:'A song about attracting resources together',de:'Ein Lied darüber, wie ihr zusammen Ressourcen anzieht',fr:'Une chanson sur comment vous attirez les ressources ensemble'}, input: {ru:'Можешь уточнить конкретный финансовый вопрос',en:'You can specify a financial question',de:'Du kannst eine Finanzfrage angeben',fr:'Tu peux préciser une question financière'} },
        '70f7ac1d': { icon: '◉', placeholderI18n: {en:'What is my main personality archetype?',de:'Was ist mein wichtigster Persönlichkeits-Archetyp?',fr:'Quel est mon archétype de personnalité principal ?'}, duoPlaceholderI18n: {en:'What are our main personality archetypes?',de:'Was sind unsere wichtigsten Persönlichkeits-Archetypen?',fr:'Quels sont nos archétypes de personnalité principaux ?'}, label: {ru:'Кто я на самом деле',en:'Who I really am',de:'Wer ich wirklich bin',fr:'Qui je suis vraiment'}, duoLabel: {ru:'Кто мы на самом деле',en:'Who we really are',de:'Wer wir wirklich sind',fr:'Qui nous sommes vraiment'}, desc: {ru:'Честный портрет — от того, что прячешь, до того, в чём сила',en:'An honest portrait — from what you hide to your power',de:'Ein ehrliches Porträt — von dem was du versteckst bis zu deiner Stärke',fr:'Un portrait honnête — de ce que tu caches à ta force'}, duoDesc: {ru:'Кто вы в глубине и как ваши сути переплетаются',en:'Who you are deep down and how your essences intertwine',de:'Wer ihr in der Tiefe seid und wie sich eure Wesen verflechten',fr:'Qui vous êtes en profondeur et comment vos essences s\'entrelacent'}, input: null },
        '0debdbc2': { icon: '△', placeholderI18n: {en:'Tell me about my spiritual evolution based on my date of birth',de:'Erzähl mir von meiner spirituellen Entwicklung nach meinem Geburtsdatum',fr:'Parle-moi de mon évolution spirituelle d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Tell us about our spiritual evolution based on our dates of birth',de:'Erzähl uns von unserer spirituellen Entwicklung nach unseren Geburtsdaten',fr:'Parle-nous de notre évolution spirituelle d\'après nos dates de naissance'}, label: {ru:'Куда я иду',en:'Where I\'m heading',de:'Wohin ich gehe',fr:'Où je vais'}, duoLabel: {ru:'Куда мы идём',en:'Where we\'re heading',de:'Wohin wir gehen',fr:'Où nous allons'}, desc: {ru:'Какой путь уже пройден и что ждёт впереди',en:'The path you\'ve walked and what lies ahead',de:'Den Weg den du gegangen bist und was vor dir liegt',fr:'Le chemin parcouru et ce qui t\'attend'}, duoDesc: {ru:'Как ваши пути переплетаются и куда ведут',en:'How your paths intertwine and where they lead',de:'Wie sich eure Wege verflechten und wohin sie führen',fr:'Comment vos chemins s\'entrelacent et où ils mènent'}, input: null },
        '602c8e18': { icon: '◇', placeholderI18n: {en:'Create a song about this special moment in my life',de:'Schreib ein Lied über diesen besonderen Moment in meinem Leben',fr:'Crée une chanson sur ce moment spécial de ma vie'}, duoPlaceholderI18n: {en:'Create a song about this special moment in our life',de:'Schreib ein Lied über diesen besonderen Moment in unserem Leben',fr:'Crée une chanson sur ce moment spécial de notre vie'}, label: {ru:'Песня на событие',en:'Song for an event',de:'Lied für ein Ereignis',fr:'Chanson pour un événement'}, duoLabel: {ru:'Песня на наше событие',en:'Song for our event',de:'Lied für unser Ereignis',fr:'Chanson pour notre événement'}, desc: {ru:'Свадьба, рождение, переезд — песня поймает энергию момента',en:'Wedding, birth, move — the song captures the moment\'s energy',de:'Hochzeit, Geburt, Umzug — das Lied fängt die Energie des Moments',fr:'Mariage, naissance, déménagement — la chanson capture l\'énergie du moment'}, duoDesc: {ru:'Песня поймает энергию момента, который вы переживаете вместе',en:'The song captures the energy of the moment you share',de:'Das Lied fängt die Energie des gemeinsamen Moments ein',fr:'La chanson capture l\'énergie du moment que vous vivez ensemble'}, input: {ru:'Укажи момент: роды, свадьба, переезд, новый этап...',en:'Specify: birth, wedding, move, new chapter...',de:'Gib an: Geburt, Hochzeit, Umzug, neues Kapitel...',fr:'Précise : naissance, mariage, déménagement, nouveau chapitre...'} },
        '5a9e392b': { icon: '⊚', placeholderI18n: {en:'Create my personal mantra based on my date of birth',de:'Erstelle mein persönliches Mantra nach meinem Geburtsdatum',fr:'Crée mon mantra personnel d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Create our shared mantra based on our dates of birth',de:'Erstelle unser gemeinsames Mantra nach unseren Geburtsdaten',fr:'Crée notre mantra commun d\'après nos dates de naissance'}, label: {ru:'Моя фраза силы',en:'My power phrase',de:'Mein Kraftspruch',fr:'Ma phrase de pouvoir'}, duoLabel: {ru:'Наша фраза силы',en:'Our power phrase',de:'Unser Kraftspruch',fr:'Notre phrase de pouvoir'}, desc: {ru:'Одна фраза из даты рождения — гипнотическая, ритмичная, твоя',en:'One phrase from your birthdate — hypnotic, rhythmic, yours',de:'Ein Satz aus deinem Geburtsdatum — hypnotisch, rhythmisch, deiner',fr:'Une phrase de ta date de naissance — hypnotique, rythmique, la tienne'}, duoDesc: {ru:'Общая фраза-заклинание из двух дат рождения',en:'A shared spell-phrase from two birthdates',de:'Ein gemeinsamer Zauberspruch aus zwei Geburtsdaten',fr:'Une phrase-sortilège commune de deux dates de naissance'}, input: null },
        'fb1377ae': { icon: '✦', placeholderI18n: {en:'Create my personal blessing based on my date of birth',de:'Erstelle meinen persönlichen Segen nach meinem Geburtsdatum',fr:'Crée ma bénédiction personnelle d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Create a blessing for the two of us based on our dates of birth',de:'Erstelle einen Segen für uns beide nach unseren Geburtsdaten',fr:'Crée une bénédiction pour nous deux d\'après nos dates de naissance'}, label: {ru:'Благословение',en:'Blessing',de:'Segen',fr:'Bénédiction'}, duoLabel: {ru:'Благословение для двоих',en:'Blessing for two',de:'Segen für zwei',fr:'Bénédiction pour deux'}, desc: {ru:'Песня-подарок, наполненная светом. Можно подарить близкому',en:'A song-gift filled with light. Perfect to give someone dear',de:'Ein Lied-Geschenk voller Licht. Perfekt zum Verschenken',fr:'Une chanson-cadeau emplie de lumière. Parfaite à offrir'}, duoDesc: {ru:'Благословение вашему союзу — песня-дар из света обеих дат',en:'A blessing for your union — a gift from the light of both dates',de:'Ein Segen für eure Verbindung — ein Geschenk aus dem Licht beider Daten',fr:'Une bénédiction pour votre union — un cadeau de la lumière des deux dates'}, input: {ru:'Укажи на что благословение: на рождение, завершение цикла, новый путь...',en:'Specify: birth, cycle end, new path...',de:'Gib an: Geburt, Zyklusende, neuer Weg...',fr:'Précise : naissance, fin de cycle, nouveau chemin...'} },
        '73edc06e': { icon: '○', placeholderI18n: {en:'Create a meditation text based on my date of birth',de:'Erstelle einen Meditationstext nach meinem Geburtsdatum',fr:'Crée un texte de méditation d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Create a meditation text for the two of us based on our dates of birth',de:'Erstelle einen Meditationstext für uns beide nach unseren Geburtsdaten',fr:'Crée un texte de méditation pour nous deux d\'après nos dates de naissance'}, label: {ru:'Моя тишина',en:'My silence',de:'Meine Stille',fr:'Mon silence'}, duoLabel: {ru:'Наша тишина',en:'Our silence',de:'Unsere Stille',fr:'Notre silence'}, desc: {ru:'Закрой глаза и слушай — музыка для перезагрузки',en:'Close your eyes and listen — music for a reset',de:'Schließe die Augen und höre — Musik zum Neustarten',fr:'Ferme les yeux et écoute — musique pour un reset'}, duoDesc: {ru:'Музыка для совместной перезагрузки',en:'Music for a shared reset',de:'Musik für einen gemeinsamen Neustart',fr:'Musique pour un reset partagé'}, input: {ru:'Укажи намерение: привлечение удачи, отпускание, исцеление...',en:'Specify intention: luck, letting go, healing...',de:'Gib die Absicht an: Glück, loslassen, heilen...',fr:'Précise l\'intention : chance, lâcher prise, guérison...'} },
        'a7b25cb3': { icon: '⌘', placeholderI18n: {en:'Create a funny, self-ironic song about me based on my date of birth',de:'Schreib ein lustiges, selbstironisches Lied über mich nach meinem Geburtsdatum',fr:'Crée une chanson drôle et ironique sur moi d\'après ma date de naissance'}, duoPlaceholderI18n: {en:'Create a funny, ironic song about us based on our dates of birth',de:'Schreib ein lustiges, ironisches Lied über uns nach unseren Geburtsdaten',fr:'Crée une chanson drôle et ironique sur nous d\'après nos dates de naissance'}, label: {ru:'Жёсткая правда обо мне',en:'Hard truth about me',de:'Harte Wahrheit über mich',fr:'Dure vérité sur moi'}, duoLabel: {ru:'Жёсткая правда о нас',en:'Hard truth about us',de:'Harte Wahrheit über uns',fr:'Dure vérité sur nous'}, desc: {ru:'Шуточная песня о твоих недостатках. С юмором, но без пощады',en:'A funny song about your flaws. No mercy',de:'Ein lustiges Lied über deine Schwächen. Gnadenlos',fr:'Une chanson drôle sur tes défauts. Sans pitié'}, duoDesc: {ru:'Шуточная песня о ваших недостатках. С юмором, но без пощады',en:'A funny song about your flaws together. No mercy',de:'Ein lustiges Lied über eure Schwächen. Gnadenlos',fr:'Une chanson drôle sur vos défauts. Sans pitié'}, input: null, warning: {ru:'Осторожно: песня знает о тебе больше, чем ты думаешь',en:'Warning: the song knows more about you than you think',de:'Vorsicht: das Lied weiß mehr über dich als du denkst',fr:'Attention : la chanson en sait plus sur toi que tu ne penses'} },
        '1da429e2': { icon: '▲', placeholderI18n: {en:'What does my date of birth say about my calling?',de:'Was sagt mein Geburtsdatum über meine Berufung?',fr:'Que dit ma date de naissance sur ma vocation ?'}, duoPlaceholderI18n: {en:'What do our dates of birth say about our shared purpose?',de:'Was sagen unsere Geburtsdaten über unsere gemeinsame Bestimmung?',fr:'Que disent nos dates de naissance sur notre chemin commun ?'}, label: {ru:'Для чего я здесь',en:'Why I\'m here',de:'Wofür ich hier bin',fr:'Pourquoi je suis ici'}, duoLabel: {ru:'Для чего мы вместе',en:'Why we\'re together',de:'Wofür wir zusammen sind',fr:'Pourquoi nous sommes ensemble'}, desc: {ru:'Песня-активация: твоя миссия и как её проявить',en:'An activation song: your mission and how to manifest it',de:'Ein Aktivierungslied: deine Mission und wie du sie manifestierst',fr:'Une chanson d\'activation : ta mission et comment la manifester'}, duoDesc: {ru:'Как ваши миссии усиливают друг друга',en:'How your missions strengthen each other',de:'Wie sich eure Missionen gegenseitig stärken',fr:'Comment vos missions se renforcent mutuellement'}, input: null },
        'c75ac93c': { icon: '∞', placeholderI18n: {en:'Tell us about our bond and compatibility based on our dates of birth',de:'Erzähl uns von unserer Verbindung und Kompatibilität nach unseren Geburtsdaten',fr:'Parle-nous de notre lien et de notre compatibilité d\'après nos dates de naissance'}, duoPlaceholderI18n: {en:'Tell us about our bond and compatibility based on our dates of birth',de:'Erzähl uns von unserer Verbindung und Kompatibilität nach unseren Geburtsdaten',fr:'Parle-nous de notre lien et de notre compatibilité d\'après nos dates de naissance'}, label: {ru:'Песня про нас',en:'Song about us',de:'Lied über uns',fr:'Chanson sur nous'}, duoLabel: {ru:'Песня про нас',en:'Song about us',de:'Lied über uns',fr:'Chanson sur nous'}, desc: {ru:'Дуэт, рождённый из двух дат рождения',en:'A duet born from two birthdates',de:'Ein Duett aus zwei Geburtsdaten',fr:'Un duo né de deux dates de naissance'}, duoDesc: {ru:'Дуэт, рождённый из двух дат рождения',en:'A duet born from two birthdates',de:'Ein Duett aus zwei Geburtsdaten',fr:'Un duo né de deux dates de naissance'}, input: null },
      };

      // VK Testers 10.05.2026: автозамена единственного → множественного для
      // placeholder'ов quick-buttons в режиме «couple». Меняет местоимения
      // первого лица единственного числа на множественное (мой → наш, моя →
      // наша, я → мы и т.д.). Не трогает глаголы (морфологически сложно
      // без NLP-библиотеки) — для них есть override через BUTTON_TOOLTIPS.duoPlaceholder.
      // Применяется ТОЛЬКО к русскому тексту (на en/de/fr placeholder приходит
      // с backend на русском — это отдельный i18n-долг).
      function _pluralizeForCouple(text) {
        if (!text || typeof text !== 'string') return text;
        var hasCyr = /[Ѐ-ӿ]/;
        if (!hasCyr.test(text)) return text;
        // VK Testers 7278939 ПЕРЕОТКРЫТ (Windows): кнопки «Про двоих» подставляли
        // одиночный текст. Корень: `\b` (word boundary) в JS regex работает ТОЛЬКО
        // для Latin букв — для Cyrillic не матчит без `u` флага. «мой» в «Какой мой
        // главный архетип» не находился → конверсия не применялась. Фикс: заменён
        // `\b` на lookbehind/lookahead с Cyrillic char class — работает кроссбраузерно.
        var P = '(?<![А-Яа-яёЁ])', S = '(?![А-Яа-яёЁ])';
        var pairs = [
          // Притяжательные: мой/моя/моё/мои в разных падежах
          [new RegExp(P+'мой'+S, 'g'), 'наш'], [new RegExp(P+'моего'+S, 'g'), 'нашего'], [new RegExp(P+'моему'+S, 'g'), 'нашему'],
          [new RegExp(P+'моим'+S, 'g'), 'нашим'], [new RegExp(P+'моём'+S, 'g'), 'нашем'], [new RegExp(P+'моем'+S, 'g'), 'нашем'],
          [new RegExp(P+'моя'+S, 'g'), 'наша'], [new RegExp(P+'моей'+S, 'g'), 'нашей'], [new RegExp(P+'мою'+S, 'g'), 'нашу'], [new RegExp(P+'моею'+S, 'g'), 'нашей'],
          [new RegExp(P+'моё'+S, 'g'), 'наше'], [new RegExp(P+'мое'+S, 'g'), 'наше'],
          [new RegExp(P+'мои'+S, 'g'), 'наши'], [new RegExp(P+'моих'+S, 'g'), 'наших'], [new RegExp(P+'моими'+S, 'g'), 'нашими'],
          // Личные местоимения
          [new RegExp(P+'меня'+S, 'g'), 'нас'], [new RegExp(P+'мне'+S, 'g'), 'нам'], [new RegExp(P+'мной'+S, 'g'), 'нами'], [new RegExp(P+'мною'+S, 'g'), 'нами'],
          [new RegExp(P+'я'+S, 'g'), 'мы'],
          // Прилагательные первого лица
          [new RegExp(P+'главный'+S, 'g'), 'главные'], [new RegExp(P+'личный'+S, 'g'), 'общий'], [new RegExp(P+'личная'+S, 'g'), 'общая'],
        ];
        var result = text;
        pairs.forEach(function(p) { result = result.replace(p[0], p[1]); });
        return result;
      }
      window._pluralizeForCouple = _pluralizeForCouple;

      function renderQuickButtons(buttons, mode) {
        var sheet = document.getElementById('quickPickerSheet');
        var loading = document.getElementById('quickPickerLoading');
        if (!sheet) return;
        if (loading) loading.style.display = 'none';
        // Удаляем старые кнопки (оставляем loading div)
        sheet.querySelectorAll('.quick-item').forEach(function(el){ el.remove(); });
        // Удаляем старый tooltip (если остался от предыдущего рендера)
        var oldTooltip = document.getElementById('quickBtnTooltip');
        if (oldTooltip) oldTooltip.remove();

        var filtered = buttons.filter(function(b){ return mode === 'couple' ? true : !b.is_duo; });
        filtered.forEach(function(btn) {
          var el = document.createElement('button');
          el.type = 'button';
          el.className = 'quick-item example-btn';
          el.setAttribute('data-quick-id', btn.id);
          el.setAttribute('data-quick-placeholder', btn.placeholder || '');
          el.setAttribute('data-quick-hint', btn.hint || '');
          // Добавляем крафтовую иконку + адаптируем label для duo
          var shortId = btn.id.split('-')[0];
          var tt = BUTTON_TOOLTIPS[shortId] || {};
          var isDuo = mode === 'couple';
          var displayLabel = isDuo && tt.duoLabel ? _qbl(tt.duoLabel) : (_qbl(tt.label) || btn.label);
          el.textContent = (tt.icon ? tt.icon + ' ' : '') + displayLabel;
          // Клик = сразу выбор (без промежуточного тултипа)
          el.addEventListener('click', function() {
            var tt2 = BUTTON_TOOLTIPS[shortId] || {};
            var requestField = document.getElementById('request');
            if (requestField) {
              // VK Testers 10.05.2026: в режиме «couple» placeholder остаётся
              // в единственном числе («моей жизни», «мой архетип», «о моём»).
              // Тестер ожидал «нашей», «наши», «о нашем». Backend
              // /api/quick-buttons возвращает один placeholder для обоих режимов.
              // Хирургический фикс: автозамена местоимений + явный override
              // через tt2.duoPlaceholder если задан.
              var raw = btn.placeholder || '';
              // EN/DE/FR: текст запроса из БД только русский — на английском интерфейсе в поле
              // вставлялся «Какой мой главный архетип личности?» (Алла, TestFlight 31, 24.09).
              // Перевод берём из карты placeholderI18n/duoPlaceholderI18n; русский путь не тронут.
              var _qLang = (typeof currentLang === 'string') ? currentLang : 'ru';
              if (_qLang !== 'ru' && tt2.placeholderI18n && tt2.placeholderI18n[_qLang]) raw = tt2.placeholderI18n[_qLang];
              var isCoupleMode = mode === 'couple';
              var finalText = raw;
              if (isCoupleMode && raw) {
                if (_qLang !== 'ru' && tt2.duoPlaceholderI18n && tt2.duoPlaceholderI18n[_qLang]) finalText = tt2.duoPlaceholderI18n[_qLang];
                else finalText = tt2.duoPlaceholder
                  ? _qbl(tt2.duoPlaceholder)
                  : (typeof _pluralizeForCouple === 'function' ? _pluralizeForCouple(raw) : raw);
              }
              requestField.value = finalText;
              // НЕ фокусируем поле после выбора готового запроса: focus() поднимал
              // клавиатуру → класс form-keyboard-open (стр.960) → CSS прятал sticky-кнопку
              // «Создать песню», а на VK focusout не срабатывал → кнопка исчезала, пока юзер
              // не тыкнет в пустоту (Алла 24.06). Готовый запрос — это и есть ввод, фокус не нужен.
              document.body.classList.remove('form-keyboard-open');
            }
            window._quickButtonId = btn.id;
            if (typeof setAstroStyle === 'function') setAstroStyle(true);
            var hintEl = document.getElementById('quickPickerHint');
            if (hintEl) {
              var inputText = _qbl(tt2.input);
              if (btn.hint || inputText) {
                hintEl.textContent = (inputText ? '✎ ' + inputText : '');
                hintEl.style.display = inputText ? 'block' : 'none';
              } else { hintEl.style.display = 'none'; }
            }
            sheet.style.display = 'none';
            var toggleBtn = document.getElementById('quickPickerBtn');
            if (toggleBtn) toggleBtn.classList.remove('open');
            var arrow = document.getElementById('quickPickerArrow');
            if (arrow) arrow.style.transform = '';
          });
          sheet.appendChild(el);
        });
        if (filtered.length === 0 && mode !== 'couple') {
          if (loading) { loading.textContent = typeof t === 'function' ? t('statusNoRequests') : 'Нет доступных запросов'; loading.style.display = 'block'; }
        }
      }

      // Сбросить выбранную кнопку при ручном редактировании запроса
      (function() {
        var requestField = document.getElementById('request');
        if (requestField) {
          requestField.addEventListener('input', function() {
            window._quickButtonId = null;
            var hintEl = document.getElementById('quickPickerHint');
            if (hintEl) hintEl.style.display = 'none';
          });
        }
      })();

      // Динамическая подсказка имени (Алла 05.07): текст под полем имени/партнёра меняется
      // от содержимого поля. Заполнено (в т.ч. предзаполнено из профиля/картотеки) → «Это имя
      // прозвучит… сотри, если не хочешь»; пусто → «Впишешь имя…». Так пользователь с уже
      // подставленным именем понимает, что оно споётся и его можно стереть.
      (function() {
        function syncOne(inputId, hintId) {
          var inp = document.getElementById(inputId);
          var hint = document.getElementById(hintId);
          if (!inp || !hint) return;
          var filled = (inp.value || '').trim().length > 0;
          var key = filled ? 'nameHintFilled' : 'nameHintEmpty';
          var txt = (typeof t === 'function') ? t(key) : '';
          if (txt && txt !== key) hint.textContent = txt;
        }
        window._syncNameHints = function() {
          syncOne('name', 'nameHint');
          syncOne('name2', 'name2Hint');
        };
        ['name', 'name2'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('input', window._syncNameHints);
        });
        window._syncNameHints();
      })();

      // Загрузить кнопки при старте и закешировать
      (function() {
        var mode = 'single';
        // На нативе (Capacitor WebView) origin не yupsoul.ru — голый '/api/...' уходил в локальную
        // схему WebView и молча падал, #quickPickerSheet навсегда пустой (Алла нашла на iPhone, 22.09).
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        fetch(apiBase + '/api/quick-buttons').then(function(r){ return r.json(); }).then(function(d) {
          if (d.success && d.data) {
            window._quickButtonsCache = d.data;
            // Определяем текущий режим
            var modeActive = document.querySelector('.mode-btn.active');
            if (modeActive && modeActive.getAttribute('data-mode') === 'couple') mode = 'couple';
            renderQuickButtons(d.data, mode);
          } else {
            var loading = document.getElementById('quickPickerLoading');
            if (loading) { loading.textContent = ''; loading.style.display = 'none'; }
          }
        }).catch(function() {
          var loading = document.getElementById('quickPickerLoading');
          if (loading) { loading.textContent = ''; loading.style.display = 'none'; }
        });
      })();

      // При смене режима (single/couple/transit) — перефильтровать кнопки + очистить
      // зависимые поля Шага 3 если они были подставлены автоматически (VK Testers ID 7262419,
      // Тамара Глазунова, MacOS, 10.05.2026): при смене формата текст из quick-button и
      // выбранный стиль остаются на single-версии и попадают в заявку — некорректные метаданные.
      // Очищаем ТОЛЬКО автоподставленные значения. Текст, введённый юзером вручную
      // (_quickButtonId === null И НЕ совпадает с дефолтом quick-button) — оставляем.
      (function() {
        // VK Testers #7262419 ПЕРЕОТКРЫТ (Maria MacOS 3 комм 18.05): «single→couple
        // не очищает Шаг 3, single↔transit очищает». Корень: _prevMode start null,
        // а HTML имеет default mode-btn[active] (single). При ПЕРВОМ клике на
        // другой mode (например couple) `changed = (null !== null && ...) = false`
        // → cleanup skip → данные single остаются в couple форме. На transit это
        // незаметно (у transit отдельные поля transitDate/transitLocation —
        // single данные просто не релевантны). Решение: инициализировать
        // _prevMode значением из текущей `.mode-btn.active` сразу при IIFE.
        var _activeAtInit = document.querySelector('.mode-btn[data-mode].active');
        var _prevMode = _activeAtInit ? (_activeAtInit.getAttribute('data-mode') || null) : null;
        document.querySelectorAll('.mode-btn[data-mode]').forEach(function(modeBtn) {
          modeBtn.addEventListener('click', function() {
            var mode = this.getAttribute('data-mode') || 'single';
            // Не запускать при клике на тот же mode (тестер может кликнуть второй раз)
            if (_prevMode === mode) return;
            var changed = _prevMode !== null && _prevMode !== mode;
            _prevMode = mode;
            if (window._quickButtonsCache) renderQuickButtons(window._quickButtonsCache, mode);
            // Сброс автоподставленных значений Шага 3 при РЕАЛЬНОЙ смене формата
            if (changed) {
              // Batch 8.5 (7263420 MacOS Высокий): «Валидация "Заполни обязательные поля"
              // не исчезает при смене формата». submitHint остаётся видимым потому что
              // mode-btn click handler не сбрасывал его. Чистим при реальной смене формата.
              var submitHintEl = document.getElementById('submitHint');
              if (submitHintEl) { submitHintEl.textContent = ''; submitHintEl.style.display = 'none'; }
              // 1. Текст из quick-button: очищаем если был выбор кнопки (юзер сможет выбрать couple-версию)
              if (window._quickButtonId) {
                var requestField = document.getElementById('request');
                if (requestField) requestField.value = '';
              }
              // 2. Выбранная quick-button — сброс
              window._quickButtonId = null;
              var hintEl = document.getElementById('quickPickerHint');
              if (hintEl) hintEl.style.display = 'none';
              // 3. Стиль: если был активен astro/star → возврат к manual (значения релевантны
              //    конкретной персоне; для couple/transit могут не подходить)
              if (window._styleMode && window._styleMode !== 'manual' && typeof setStyleMode === 'function') {
                setStyleMode('manual');
              }
              // 4. Голос песни: свой текст писался под конкретного человека —
              //    при смене формата возвращаем обычную песню, чтобы чужие строки
              //    не уехали в заявку про двоих
              if (window._lyricsMode && window._lyricsMode !== 'sung' && typeof window.setLyricsMode === 'function') {
                var _clEl = document.getElementById('customLyrics');
                if (_clEl) _clEl.value = '';
                window.setLyricsMode('sung');
              }
            } else {
              // Первый клик после загрузки — только инициализация _prevMode, без сбросов
              window._quickButtonId = null;
              var hintEl0 = document.getElementById('quickPickerHint');
              if (hintEl0) hintEl0.style.display = 'none';
            }
          });
        });
      })();

      // ── Soul Chat: быстрые вопросы (чипсы в пустом стейте — загружаются динамически выше) ──

      if (stepNext) stepNext.addEventListener('click', async function() {
        var stepNextRestoreText = stepNext ? stepNext.textContent : (typeof t === 'function' ? t('submitRequest') : 'Создать мою песню');
        try {
        var submitHintEl = document.getElementById('submitHint');
        function showSubmitHint(msg, focusFieldId) {
          if (submitHintEl) {
            submitHintEl.textContent = msg || '';
            submitHintEl.style.display = msg ? 'block' : 'none';
            // VK Testers ID 7262708 (Lykosova MacOS): белый текст ошибки на белом фоне в светлой теме.
            // Корень: hardcoded color: rgba(255,255,255,0.9) перебивает CSS rule (color:#fda4af).
            // Фикс: убираем inline color — фон уже #fda4af на красном с прозрачностью, контраст виден на обеих темах.
            submitHintEl.style.removeProperty('color');
          }
          // Прокручиваем к незаполненному полю и подсвечиваем
          if (msg && focusFieldId) {
            var field = document.getElementById(focusFieldId);
            var wrap = field && (field.closest('.field') || field.closest('.step-panel') || field.parentElement);
            if (wrap) {
              try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
              wrap.style.transition = 'box-shadow 0.3s';
              wrap.style.boxShadow = '0 0 0 2px rgba(236,72,153,0.5), 0 0 16px rgba(236,72,153,0.2)';
              wrap.style.borderRadius = '12px';
              setTimeout(function() { wrap.style.boxShadow = ''; }, 2500);
            }
            if (field && field.focus) try { field.focus(); } catch(_) {}
          } else if (msg && submitHintEl) {
            try { submitHintEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
          }
        }
        function hideSubmitHint() { showSubmitHint(''); }
        // Защита от дублирования заявок
        if (isSubmitting) {
          console.log('[Submit] Заявка уже отправляется, игнорируем повторное нажатие');
          showSubmitHint(typeof t === 'function' ? t('sending') : 'Отправка… Подождите.');
          return;
        }
        
        if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
          // validateStep уже показал КОНКРЕТНУЮ подсказку (_showFormHint): развернул форму,
          // проскроллил к пустому полю и подсветил его. НЕ перетираем её генерической
          // «Заполните все обязательные поля» — раньше это скроллило обратно вниз и юзер
          // не видел КАКОЕ поле пусто → застревал (новый юзер на VK не мог создать песню).
          return;
        }
        hideSubmitHint();
        isSubmitting = true;
        var mode = selectedMode || 'single';
        var name1 = document.getElementById('name').value.trim();
        var birthdate1 = document.getElementById('birthdate').value;
        var birthplace1 = document.getElementById('birthplace').value.trim();
        var birthtime1 = document.getElementById('birthtime').value;
        var birthtimeUnknown1 = document.getElementById('unknown').checked;
        var gender1 = document.getElementById('gender').value;
        var requestText = document.getElementById('request').value.trim();
        // Пустой запрос — подставляем дефолт
        if (!requestText) {
          requestText = 'Моя музыка души';
          document.getElementById('request').value = requestText;
        }
        // Единый пикер «Про двоих» (Алла 05.07): первый человек ВСЕГДА в видимых полях
        // (#name/#birthdate/#gender…) — пикер их заполняет. Значит person1 валидируем всегда,
        // как в одиночном режиме (видимое == отправляемое).
        var _skipP1Validation = false;
        if (!_skipP1Validation) {
          // Имя НЕОБЯЗАТЕЛЬНО (Алла 05.07): пустое → песня без имени. Формат — только для введённого.
          if (name1 && (name1.length < 2 || name1.length > 50 || /(.)\1{4,}/u.test(name1) || !/\p{L}/u.test(name1) || new Set(name1.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 2)) {
            isSubmitting = false; showSubmitHint(t('alertNameInvalid'), 'name'); return;
          }
          if (!birthdate1) { isSubmitting = false; showSubmitHint(t('alertBirthdate'), 'birthdateDay'); return; }
          if (birthplace1 && birthplace1.length < 3) { isSubmitting = false; showSubmitHint(t('alertBirthplace'), 'birthplace'); return; }
          // Защита от мусорного ввода — если автозаполнение из подсказок не сработало, проверяем формат локально
          var _bpField1 = document.getElementById('birthplace');
          var _bpHasLat1 = _bpField1 && _bpField1.getAttribute('data-lat');
          if (birthplace1 && !_bpHasLat1) {
            var _bpInvalid1 = birthplace1.length > 100
              || /(.)\1{4,}/u.test(birthplace1)
              || !/\p{L}/u.test(birthplace1)
              || new Set(birthplace1.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 3;
            if (_bpInvalid1) { isSubmitting = false; showSubmitHint(t('alertBirthplaceHint'), 'birthplace'); return; }
          }
          // Время рождения — НЕОБЯЗАТЕЛЬНО; пустое → трактуем как «не знаю» (см. payload birthtimeUnknown ниже).

          // Валидация/нормализация формата времени (HH:MM)
          if (!birthtimeUnknown1 && birthtime1) {
            var normalizedTime1 = normalizeBirthTimeInput(birthtime1);
            if (!normalizedTime1) {
              isSubmitting = false;
              showSubmitHint('Время рождения — формат ЧЧ:ММ, например 14:30.', 'birthtime');
              return;
            }
            birthtime1 = normalizedTime1;
            var birthtimeInput1 = document.getElementById('birthtime');
            if (birthtimeInput1) birthtimeInput1.value = normalizedTime1;
          }

          if (!gender1) { isSubmitting = false; showSubmitHint(t('alertGender'), 'gender'); return; }
        }
        // Минимальная валидация убрана — пустой запрос подставляется дефолт выше
        var songLangEl = document.getElementById('language');
        var songLanguage = (songLangEl && songLangEl.value) ? songLangEl.value : 'ru';
        var payload = {
          mode: mode,
          person1: { name: name1, birthdate: birthdate1, birthplace: birthplace1, birthtime: (birthtimeUnknown1 || !birthtime1) ? null : birthtime1, birthtimeUnknown: birthtimeUnknown1 || !birthtime1, gender: gender1 },
          request: requestText,
          language: songLanguage
        };
        // Если есть активный промокод — передаём его серверу для проверки ДО 402
        if (activePromo && activePromo.code) {
          payload.promo_code = activePromo.code;
        }
        var preferredStyleEl = document.getElementById('requestPreferredStyle');
        // Режим «Стиль звезды» — передаём star_reference + сохраняем в историю
        if (window._useStarStyle && preferredStyleEl && preferredStyleEl.value.trim()) {
          payload.star_reference = preferredStyleEl.value.trim();
          saveStarQuery(payload.star_reference);
        }
        // Ручной стиль — передаём preferred_style (не в astro и не в star режиме)
        else if (!window._useAstroStyle && !window._useStarStyle && preferredStyleEl && preferredStyleEl.value.trim()) {
          payload.preferred_style = preferredStyleEl.value.trim();
        }
        // Передаём ID выбранной кнопки быстрого запроса (если была нажата)
        if (window._quickButtonId) {
          payload.quick_button_id = window._quickButtonId;
        }
        // Голос песни: со словами / только музыка / свой текст (Алла 01.08.2026)
        payload.lyrics_mode = window._lyricsMode || 'sung';
        if (payload.lyrics_mode === 'own') {
          var customLyricsEl = document.getElementById('customLyrics');
          payload.custom_lyrics = customLyricsEl ? customLyricsEl.value.trim() : '';
        }
        // Экран ожидания читает это, чтобы не писать «Подбираю нужные слова» там,
        // где слов не будет. Переживает перезагрузку — в отличие от window._lyricsMode.
        try { sessionStorage.setItem('yup_last_lyrics_mode', payload.lyrics_mode); } catch (_) {}
        var birthplaceField = document.getElementById('birthplace');
        if (birthplaceField && birthplaceField.getAttribute('data-lat') && birthplaceField.getAttribute('data-lon')) {
          payload.person1.birthplaceLat = parseFloat(birthplaceField.getAttribute('data-lat'));
          payload.person1.birthplaceLon = parseFloat(birthplaceField.getAttribute('data-lon'));
        }
        var forWho = document.getElementById('forWho');
        if (forWho && forWho.value && userTariff === 'master') payload.clientId = forWho.value;
        // couple-режим: если герой выбран из Лаборатории, привязываем генерацию к его карточке
        if (mode === 'couple' && userTariff === 'master' && typeof _selectedLabHeroId !== 'undefined' && _selectedLabHeroId) {
          payload.clientId = _selectedLabHeroId;
        }
        // (Единый пикер: person1 уже в payload из видимых полей — скрытый override карточки убран.)
        if (mode === 'couple') {
          var name2 = document.getElementById('name2').value.trim();
          var birthdate2 = document.getElementById('birthdate2').value;
          var birthplace2 = document.getElementById('birthplace2').value.trim();
          var birthtime2 = document.getElementById('birthtime2').value;
          var birthtimeUnknown2 = document.getElementById('unknown2').checked;
          var gender2 = document.getElementById('gender2').value;
          // Имя партнёра НЕОБЯЗАТЕЛЬНО (Алла 05.07): пустое → в песне не поётся. Формат — только для введённого.
          if (name2 && (name2.length < 2 || name2.length > 50 || /(.)\1{4,}/u.test(name2) || !/\p{L}/u.test(name2) || new Set(name2.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 2)) {
            isSubmitting = false; showSubmitHint(t('alertNameInvalid'), 'name2'); return;
          }
          if (!birthdate2) { isSubmitting = false; showSubmitHint(t('alertBirthdate2'), 'birthdate2Day'); return; }
          if (birthplace2.length < 3) { isSubmitting = false; showSubmitHint(t('alertBirthplace2'), 'birthplace2'); return; }
          var _bpField2 = document.getElementById('birthplace2');
          var _bpHasLat2 = _bpField2 && _bpField2.getAttribute('data-lat');
          if (!_bpHasLat2) {
            var _bpInvalid2 = birthplace2.length > 100
              || /(.)\1{4,}/u.test(birthplace2)
              || !/\p{L}/u.test(birthplace2)
              || new Set(birthplace2.replace(/[^\p{L}]/gu, '').toLowerCase()).size < 3;
            if (_bpInvalid2) { isSubmitting = false; showSubmitHint(t('alertBirthplaceHint'), 'birthplace2'); return; }
          }
          if (!birthtimeUnknown2 && !birthtime2) { isSubmitting = false; showSubmitHint(t('alertBirthtime2'), 'birthtime2'); return; }
          
          if (!birthtimeUnknown2 && birthtime2) {
            var normalizedTime2 = normalizeBirthTimeInput(birthtime2);
            if (!normalizedTime2) {
              isSubmitting = false;
              showSubmitHint('Время рождения второго человека — формат ЧЧ:ММ, например 14:30.', 'birthtime2');
              return;
            }
            birthtime2 = normalizedTime2;
            var birthtimeInput2 = document.getElementById('birthtime2');
            if (birthtimeInput2) birthtimeInput2.value = normalizedTime2;
          }
          
          if (!gender2) { isSubmitting = false; showSubmitHint(t('alertGender2')); return; }
          var p2relField = document.getElementById('person2Relationship');
          var relationship2 = p2relField ? p2relField.value.trim() : '';
          payload.person2 = { name: name2, birthdate: birthdate2, birthplace: birthplace2, birthtime: birthtimeUnknown2 ? null : birthtime2, birthtimeUnknown: birthtimeUnknown2, gender: gender2 };
          if (relationship2) payload.person2.relationship = relationship2;
          var bp2Field = document.getElementById('birthplace2');
          if (bp2Field && bp2Field.getAttribute('data-lat') && bp2Field.getAttribute('data-lon')) {
            payload.person2.birthplaceLat = parseFloat(bp2Field.getAttribute('data-lat'));
            payload.person2.birthplaceLon = parseFloat(bp2Field.getAttribute('data-lon'));
          }
        }
        if (mode === 'transit') {
          var transitDate = document.getElementById('transitDate').value;
          var transitTime = document.getElementById('transitTime').value;
          var transitLocation = (document.getElementById('transitLocation') && document.getElementById('transitLocation').value) ? document.getElementById('transitLocation').value.trim() : '';
          var transitIntent = (document.getElementById('transitIntent') && document.getElementById('transitIntent').value) ? document.getElementById('transitIntent').value.trim() : null;
          if (!transitDate) { isSubmitting = false; showSubmitHint(t('alertTransitDate'), 'transitDate'); return; }
          if (!transitLocation) { isSubmitting = false; showSubmitHint(t('alertTransitLocation'), 'transitLocation'); return; }
          payload.transit = { date: transitDate, time: transitTime || null, location: transitLocation, intent: transitIntent || null };
        }
        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase) { isSubmitting = false; showSubmitHint(typeof t === 'function' ? t('alertNoApi') : 'Не настроен адрес API.'); return; }
        if (!hasAuth()) { isSubmitting = false; showSubmitHint(typeof t === 'function' ? t('alertOpenFromBotShort') : 'Открой приложение из чата с ботом в Telegram.'); return; }
        var initData = getInitData();
        payload.initData = initData;
        // Кэшируем payload для повторной отправки с промокодом
        window._lastSubmitPayload = JSON.parse(JSON.stringify(payload));

        var authH = getAuthHeaders();
        try {
          var checkCtrl = new AbortController();
          var checkTid = setTimeout(function() { checkCtrl.abort(); }, 5000);
          var checkRes = await fetch(apiBase + '/api/check-chat', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH), body: JSON.stringify({ initData: initData }), signal: checkCtrl.signal });
          clearTimeout(checkTid);
          var checkJson = await checkRes.json().catch(function() { return {}; });
          if (checkJson.chat_available === false) {
            var chatMsg = checkJson.error || (typeof t === 'function' ? t('submitHint') : 'Сначала нажмите «Старт» в боте (или отправьте боту любое сообщение), затем отправьте заявку снова.');
            isSubmitting = false;
            showSubmitHint(chatMsg);
            return;
          }
        } catch (checkErr) {
          // если проверка недоступна — не блокируем отправку
        }

        stepNext.disabled = true;
        var stSpan = stepNext && stepNext.querySelector('.btn-pay-text'); if (stSpan) stSpan.textContent = t('sending'); else if (stepNext) stepNext.textContent = t('sending');
        // Аварийный таймер: если за 35 сек ничего не произошло — разблокируем кнопку
        var _submitSafetyTimer = setTimeout(function() {
          if (isSubmitting) {
            isSubmitting = false;
            if (stepNext) { stepNext.disabled = false; var _st = stepNext.querySelector('.btn-pay-text'); if (_st) _st.textContent = stepNextRestoreText; else stepNext.textContent = stepNextRestoreText; }
            showSubmitHint('Заявка обрабатывается. Уведомление придёт в бот.');
          }
        }, 35000);
        try {
          // Таймаут 30 сек + 1 ретрай, чтобы не зависать при деплое
          var response = await (window.fetchWithRetry ? window.fetchWithRetry(apiBase + '/api/submit-request', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH), body: JSON.stringify(payload), timeoutMs: 30000 }, 1) : fetch(apiBase + '/api/submit-request', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH), body: JSON.stringify(payload) }));
          var result = await response.json().catch(function() { return {}; });

          if (response.ok && result.ok && result.requestId && !result.payment_required) {
            if (window._ysFormSubmitted) window._ysFormSubmitted();
            if (window._ysTrack) window._ysTrack('form_submit', { mode: payload.mode || '', success: true });
            // Phase 1.2: signup_completed — первый раз когда пользователь
            // успешно завёл заявку (= profile точно создан). Маркер в
            // localStorage чтобы не считать повторно. Это «конверсия в лида».
            try {
              if (!localStorage.getItem('ys_signup_marked')) {
                if (window._ysTrack) window._ysTrack('signup_completed', { mode: payload.mode || '', platform: window._appEnv || null });
                localStorage.setItem('ys_signup_marked', '1');
              }
            } catch(_) {}
            // VK-юзер: спросить разрешение писать в ВК, когда песня готова (нативный диалог ВК).
            // Песня генерится 10-15 мин — многие не дожидаются и уходят. Если уже разрешил —
            // диалог не покажется. Сообщество шлёт «песня готова» через messages.send (воркер).
            if (window._isVkMiniApp && window.vkBridge) {
              try { vkBridge.send('VKWebAppAllowMessagesFromGroup', { group_id: 237303283 }).then(function(){ if (window._vkSaveNotifyConsent) window._vkSaveNotifyConsent(); }).catch(function(){}); } catch(_) {}
            }
            if (typeof scCurrentRequestId !== 'undefined') scCurrentRequestId = result.requestId;
            if (tg && tg.disableClosingConfirmation) try { tg.disableClosingConfirmation(); } catch (e) {}
            // ЗАКОН: форма песни НЕ меняет профиль. Профиль меняется только через profileEditSave().
            // Форма читает из профиля (pre-fill), но никогда не пишет обратно.
            var _forWhoEl = document.getElementById('forWho');
            var _isHeroGeneration = (_forWhoEl && _forWhoEl.value) || _selectedHeroId || _selectedLabHeroId;
            // Сброс forWho на "Для себя" после генерации — карточки лаборатории не запоминаются
            _selectedHeroId = null;
            if (typeof _selectedLabHeroId !== 'undefined') _selectedLabHeroId = null;
            var _pickLabBtnText = document.getElementById('pickFromLabBtnText');
            if (_pickLabBtnText) _pickLabBtnText.textContent = typeof t === 'function' ? t('pickFromLab') : 'Выбрать из Лаборатории';
            if (_forWhoEl && _forWhoEl.value) {
              _forWhoEl.value = '';
              if (typeof fillFormFromHero === 'function') fillFormFromHero(null);
            }
            // Полная очистка состояния при успешной отправке
            pendingPaymentRequestId = null;
            pendingPaymentSku = null;
            pendingPaymentPromo = null;
            activePromo = null;
            isSubmitting = false;
            try { localStorage.removeItem('hot_pending_request_id'); localStorage.removeItem('hot_pending_sku'); } catch(_) {}
            
            // Очищаем только поле запроса и второго человека, НЕ трогая данные профиля
            var requestEl = document.getElementById('request');
            if (requestEl) requestEl.value = '';
            // Баг доходимости C: заявка успешно отправлена — черновик формы больше не нужен.
            try { sessionStorage.removeItem('yup_form_draft'); } catch(_) {}
            // Сброс данных второго человека (couple mode)
            ['name2','birthdate2','birthplace2','birthtime2'].forEach(function(id) {
              var el = document.getElementById(id);
              if (el) el.value = '';
            });
            // Сброс date-селектов (Day/Month/Year) — иначе старые значения останутся в UI
            if (typeof updateDateSelectsFromInput === 'function') updateDateSelectsFromInput('birthdate2');
            var unk2 = document.getElementById('unknown2');
            if (unk2) unk2.checked = false;
            var g2 = document.getElementById('gender2');
            if (g2) g2.value = '';
            // Сброс скрытого поля отношений
            var p2relReset = document.getElementById('person2Relationship');
            if (p2relReset) p2relReset.value = '';
            // Сбрасываем data-атрибуты геолокации второго человека
            var bp2El = document.getElementById('birthplace2');
            if (bp2El) { bp2El.removeAttribute('data-place-selected'); bp2El.removeAttribute('data-lat'); bp2El.removeAttribute('data-lon'); bp2El.removeAttribute('data-from-profile'); }
            var bw2Reset = document.getElementById('birthplace2Wrap'); if (bw2Reset) bw2Reset.classList.remove('has-place');
            // Сброс кнопки «Выбрать из Лаборатории» и аккордеона person2
            var btnTextReset = document.getElementById('pickFromLabBtnText');
            if (btnTextReset) btnTextReset.textContent = (typeof t === 'function' ? t('pickFromLab') : 'Выбрать из Лаборатории');
            if (typeof updateP2AccordionSummary === 'function') updateP2AccordionSummary();

            hideSubmitHint();
            // Уведомление об источнике оплаты (VK Testers 09.05.2026: Тамара Глазунова
            // воспроизвела песню по подарочному коду — на самом деле списывался referral_credit
            // или entitlement, но без видимого UI-уведомления юзер думал что генерация
            // прошла даром. Закрываем confusion: показываем источник для ВСЕХ типов.)
            var _paySource = result && result.payment_source;
            if (_paySource === 'iskry') {
              if (typeof showToast === 'function') showToast(t('toastIskryCharged').replace('{amount}', '100'));
              if (typeof spendIskry === 'function') spendIskry(100);
              // Batch 7.15 (ID 7259254 Lykosova MacOS Высокий): «Не списываются Искры
              // после создания песни». Оптимистичное spendIskry(100) может не совпасть
              // с реальным балансом (если были другие транзакции). Подтягиваем
              // актуальный баланс с сервера через 500мс (после успешного списания в БД).
              setTimeout(function(){
                try {
                  var _apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
                  if (!_apiBase) return;
                  fetch(_apiBase + '/api/me', { headers: Object.assign({'Content-Type':'application/json'}, getAuthHeaders ? getAuthHeaders() : {}) })
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                      if (d && typeof d.iskry_balance === 'number' && typeof setIskryBalance === 'function') {
                        setIskryBalance(Math.round(d.iskry_balance));
                      }
                    }).catch(function(){});
                } catch(_) {}
              }, 500);
            } else if (_paySource === 'referral_credit') {
              // Batch 8.1 (7262952 Глазунова MacOS Критический): «На балансе 0 Искр
              // но песня создалась». Корень: списан referral_credit (отдельный счётчик).
              // Тестер не понимает почему создалось. Усиливаем сообщение в success.
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastReferralCreditUsed') || 'Использован 1 реферальный кредит — песня в работе') : 'Использован 1 реферальный кредит — песня в работе');
              window._lastPaySource = 'referral_credit';
            } else if (_paySource === 'entitlement') {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastEntitlementUsed') || 'Использован купленный трек') : 'Использован купленный трек');
            } else if (_paySource === 'trial') {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastTrialUsed') || 'Подарочный трек активирован') : 'Подарочный трек активирован');
            } else if (_paySource === 'subscription') {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastSubscriptionUsed') || 'Засчитан в пакете') : 'Засчитан в пакете');
            } else if (_paySource === 'promo_free') {
              if (typeof showToast === 'function') showToast(typeof t === 'function' ? (t('toastPromoUsed') || 'Промокод применён') : 'Промокод применён');
            }
            // Сразу на successPage — полноценная страница с кнопками и информацией
            if (result.requestId) {
              window._pendingGenerationRequestId = result.requestId;
            }
            var _confirmMsg = (typeof t === 'function' ? t('confirmTitle') : 'Заявка принята!');
            showConfirm(_confirmMsg, undefined, { freeTaste: _paySource === 'free_taste' });
          } else if (response.status === 402 || (result && result.payment_required)) {
            // ЗАКОН: форма песни НЕ меняет профиль (402 путь тоже).
            console.log('[Submit] 402 Payment Required — открываем окно оплаты');
            console.log('[Submit] requestId:', result.requestId, 'sku:', result.sku);

            // requestId может быть null (Закон №29: заявка создаётся после оплаты, не до)
            pendingPaymentRequestId = result.requestId || null;
            pendingPaymentSku = result.sku || getCurrentSku();
            pendingPaymentPromo = activePromo ? activePromo.code : null;
            activePromo = null;
            // VK Testers 7276466 ПЕРЕОТКРЫТ (17.05): «Невозможно оплатить одну
            // песню "Как у звезды"». Корень: pendingPaymentRequestId жил только
            // в JS-памяти. При reload/закрытии оверлея → null → showTrackLimit
            // PaySingle fallback'ил на форму. Save в localStorage чтобы persist.
            try {
              if (pendingPaymentRequestId) localStorage.setItem('yup_last_request_id', String(pendingPaymentRequestId));
              if (pendingPaymentSku) localStorage.setItem('yup_last_pending_sku', String(pendingPaymentSku));
            } catch(_) {}

            // Если лимит подписки исчерпан — показываем уведомление
            if (result && result.track_limit_reached) {
              var _tlMsg = typeof t === 'function' ? (t('trackLimitPayHint') || 'Лимит пакета исчерпан. Оплати дополнительную песню.') : 'Лимит пакета исчерпан. Оплати дополнительную песню.';
              if (typeof showToast === 'function') showToast(_tlMsg);
            }
            // Если подписка истекла — показываем специальный экран реактивации
            if (result && result.last_subscription) {
              isSubmitting = false;
              showExpiredSubscriptionScreen(result.last_subscription);
              return;
            }
            // Открываем окно оплаты
            showPaymentOverlay();
            // Если был промокод — подставляем в поле ввода
            if (pendingPaymentPromo) {
              var _pi = document.getElementById('payOvPromoInput');
              if (_pi) _pi.value = pendingPaymentPromo;
            }
            updatePaymentUiFromCatalog();
            setPaymentStatus('', '');
          } else if (response.status === 401) {
            // Сессия истекла (веб/PWA: токен живёт 7 дней) — это не сбой генерации.
            // Раньше падало в общий else и показывало текст Оракула «Оракул задумался»,
            // человек жал кнопку и ничего не происходило (Алла 22.09, прод, айфон).
            isSubmitting = false;
            showSubmitHint(typeof t === 'function' ? (t('errSessionExpired') || 'Нужно войти заново — сессия устарела.') : 'Нужно войти заново — сессия устарела.');
            if (typeof window.showWebLoginScreen === 'function' && !window._isTelegramApp) {
              setTimeout(function(){ try { window.showWebLoginScreen(); } catch (_) {} }, 1200);
            }
            return;
          } else if (response.status === 403) {
            isSubmitting = false;
            if (result && result.error_code === 'errAccountBlocked') {
              showSubmitHint((typeof t === 'function' && t('errAccountBlocked')) || result.error);
              return;
            }
            if (result && result.track_limit_reached) {
              // Специальная страница "Лимит исчерпан" — НЕ показываем "Пока ждёшь песню"
              showTrackLimitPage();
            } else {
              showSubmitHint(typeof t === 'function' ? (t('paymentRequiredHint') || 'Для создания песни нужна оплата.') : 'Для создания песни нужна оплата.');
            }
            return;
          } else {
            isSubmitting = false;
            // Никаких технических сообщений пользователю (ЗАКОН #8)
            var _rlKey = typeof t === 'function' ? t('rateLimitError') : '';
            var _rlFallback = (_rlKey && _rlKey !== 'rateLimitError') ? _rlKey : 'Подожди немного и попробуй снова.';
            // Текст Оракула на форме песни читался как «ответ чата» и ничего не объяснял —
            // у формы свой ключ (Алла 22.09: «появляется окно оракул задумался, а экрана нет»).
            var _genericErr = (typeof t === 'function' && t('errSubmitRetry')) || 'Не получилось отправить заявку. Попробуй ещё раз.';
            // Ярослав admin 17.05 (Закон №20): для status=400 backend возвращает
            // error_code → локализуем на frontend конкретное сообщение вместо
            // generic «Что-то пошло не так». Особенно важно для errHeroIncomplete
            // (transit + hero без даты/места) — даём подсказку «дополни в Лаборатории».
            var userMsg = _genericErr;
            if (response && response.status === 429) {
              userMsg = _rlFallback;
            } else if (response && response.status === 400 && result) {
              if (result.error_code && typeof t === 'function') {
                var localized = t(result.error_code);
                if (localized && localized !== result.error_code) {
                  userMsg = localized;
                } else if (result.error) {
                  userMsg = result.error; // fallback на server-text
                }
              } else if (result.error) {
                userMsg = result.error;
              }
            }
            showSubmitHint(userMsg);
            return;
          }
        } catch (e) {
          console.error('[Submit Error]', e);
          isSubmitting = false;
          var errMsg = 'Заявка обрабатывается. Уведомление придёт в бот.';
          showSubmitHint(errMsg);
          return;
        }
        } finally {
          clearTimeout(_submitSafetyTimer);
          isSubmitting = false;
          if (stepNext) {
            stepNext.disabled = false;
            var stSpan = stepNext && stepNext.querySelector('.btn-pay-text'); if (stSpan) stSpan.textContent = stepNextRestoreText; else if (stepNext) stepNext.textContent = stepNextRestoreText;
          }
        }
      });
      setMode('single');
      updateStepUI();
      // Promo code removed from paymentOverlay — now only in planConfirmOverlay

      // ── Overlay: кнопка «Подтвердить и отправить» (промокод 100%) ──
      var payOvPromoConfirmBtn = document.getElementById('payOvPromoConfirmBtn');
      if (payOvPromoConfirmBtn) payOvPromoConfirmBtn.addEventListener('click', async function() {
        console.log('[Promo Confirm] Нажата кнопка подтверждения промокода');

        if (!activePromo || Number(activePromo.amount_after) !== 0) {
          setPaymentStatus('❌ Промокод не даёт 100% скидку', 'error');
          return;
        }

        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) {
          setPaymentStatus('Попробуй снова.', 'error');
          return;
        }
        var initData = getInitData();
        payOvPromoConfirmBtn.disabled = true;
        payOvPromoConfirmBtn.textContent = t('btnConfirming');
        setPaymentStatus('Применяю промокод...', 'ok');
        var authH = getAuthHeaders();
        try {
          // Если requestId есть — используем hot/create, иначе повторяем submit с промокодом
          if (pendingPaymentRequestId) {
            var resp = await fetch(apiBase + '/api/payments/hot/create', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
              body: JSON.stringify({
                request_id: pendingPaymentRequestId,
                promo_code: activePromo.code,
                initData: initData
              })
            });

            var json = await resp.json().catch(function() { return {}; });

            if (!resp.ok || !json.success) {
              throw new Error(json.error || json.message || 'Ошибка применения промокода');
            }

            if (json.free_applied || (json.provider === 'promo' && Number(json.amount) === 0)) {
              console.log('[Promo Confirm] Промокод применён успешно через hot/create');
              pendingPaymentRequestId = null;
              pendingPaymentSku = null;
              activePromo = null;
              hidePaymentOverlay();
              showConfirm(
                t('payPromoApplied'),
                'Твоя песня создаётся и скоро придёт в бот.<br><br>Песня придёт в этот чат. Можешь закрыть приложение — ничего не пропадёт.'
              );
            } else {
              throw new Error('Промокод не дал бесплатный доступ');
            }
          } else {
            // Нет requestId — повторяем submit-request с промокодом
            var resubPayload = window._lastSubmitPayload;
            if (!resubPayload) {
              setPaymentStatus('Заполни форму заново и отправь.', 'error');
              payOvPromoConfirmBtn.disabled = false;
              payOvPromoConfirmBtn.textContent = t('btnConfirmAndSend');
              return;
            }
            resubPayload.promo_code = activePromo.code;
            resubPayload.initData = getInitData();
            console.log('[Promo Confirm] Повторный submit с промокодом', activePromo.code);
            var resp2 = await fetch(apiBase + '/api/submit-request', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, authH),
              body: JSON.stringify(resubPayload)
            });
            var result = await resp2.json().catch(function() { return {}; });
            if (resp2.ok && result.ok && result.requestId) {
              console.log('[Promo Confirm] Заявка создана с промокодом, requestId:', result.requestId);
              pendingPaymentRequestId = null;
              pendingPaymentSku = null;
              activePromo = null;
              window._lastSubmitPayload = null;
              hidePaymentOverlay();
              showConfirm(
                t('payPromoApplied'),
                'Твоя песня создаётся и скоро придёт в бот.<br><br>Песня придёт в этот чат. Можешь закрыть приложение — ничего не пропадёт.'
              );
            } else {
              throw new Error(result.error || result.message || 'Ошибка создания заявки с промокодом');
            }
          }

        } catch (e) {
          console.error('[Promo Confirm] Ошибка:', e);
          setPaymentStatus('❌ ' + (e.message || 'Ошибка применения промокода'), 'error');
          payOvPromoConfirmBtn.disabled = false;
          payOvPromoConfirmBtn.textContent = t('btnConfirmAndSend');
        }
      });

      // ── Overlay: кнопка «Оплатить Искрами» ──
      var payOvFreeClaimBtn = document.getElementById('payOvFreeClaimBtn');
      if (payOvFreeClaimBtn) payOvFreeClaimBtn.addEventListener('click', async function() {
        if (payOvFreeClaimBtn.disabled) return;
        if (window._ysTrack) window._ysTrack('payment_method_selected', { method: 'iskry', sku: pendingPaymentSku || '' });
        console.log('[Iskry Pay] Нажата кнопка "Оплатить Искрами"');
        console.log('[Iskry Pay] pendingPaymentRequestId:', pendingPaymentRequestId);

        if (!pendingPaymentRequestId) {
          setPaymentStatus('❌ Нет активной заявки. Заполни форму заново.', 'error');
          return;
        }

        var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        if (!apiBase || !hasAuth()) {
          setPaymentStatus('Попробуй снова.', 'error');
          return;
        }
        var initData = getInitData();
        payOvFreeClaimBtn.disabled = true;
        var originalBtnText = payOvFreeClaimBtn.textContent;
        payOvFreeClaimBtn.textContent = typeof t === 'function' ? (t('iskryPayingProgress') || 'Списываю Искры...') : 'Списываю Искры...';
        setPaymentStatus(typeof t === 'function' ? (t('iskryPayingStatus') || 'Списываю Искры и запускаю генерацию...') : 'Списываю Искры и запускаю генерацию...', 'ok');

        var iskryAuthH = getAuthHeaders();
        try {
          var resp = await fetch(apiBase + '/api/payments/iskry/pay', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, iskryAuthH),
            body: JSON.stringify({ request_id: pendingPaymentRequestId, initData: initData })
          });
          var json = await resp.json().catch(function() { return {}; });

          if (resp.ok && json.ok) {
            console.log('[Iskry Pay] Оплата Искрами успешна');
            pendingPaymentRequestId = null;
            pendingPaymentSku = null;
            // Синхронизируем баланс с сервером (а не оптимистично вычитаем)
            if (typeof setIskryBalance === 'function' && json.iskry_balance != null) {
              setIskryBalance(Math.round(json.iskry_balance));
            }
            hidePaymentOverlay();
            var _iskryDesc = (typeof t === 'function' ? t('successConfirmDesc') : 'Твоя песня генерируется.<br>Как только будет готова — придёт в бот.<br><span class=\"success-desc-note\">Обычно 10–20 минут.</span>');
            // Если Искры закончились — напоминаем о реферале
            if (json.iskry_balance != null && Math.round(json.iskry_balance) < 100) {
              var _tl3 = function(k, fb) { return typeof t === 'function' ? (t(k) || fb) : fb; };
              _iskryDesc += '<br><br><span style="color:rgba(var(--primary-rgb),0.8);font-size:0.78rem;">' + _tl3('iskryTopUpViaReferral', 'Пригласи друга и получи Искры') + '</span>';
            }
            // Бэкенд мог оплатить подпиской (приоритет источников) — тогда честный
            // заголовок «Засчитан в пакете», а не «Искры списаны» (Светлана 12.08).
            var _iskryTitle = (json.payment_source === 'subscription')
              ? (typeof t === 'function' ? (t('toastSubscriptionUsed') || 'Засчитан в пакете') : 'Засчитан в пакете')
              : (typeof t === 'function' ? (t('iskryPaySuccess') || 'Искры списаны — песня в работе!') : 'Искры списаны — песня в работе!');
            showConfirm(_iskryTitle, _iskryDesc);
          } else if (resp.status === 402) {
            // Недостаточно Искр (фолбэк 100 = цена песни, было 60 — неверно)
            var needIskry = json.need_iskry || 100;
            // КАНОН v5 §6.12: на VK промокоды запрещены — текст без «введи промокод».
            var _neVk = (window._isVkMiniApp || window._appEnv === 'vk');
            var _neMsg = _neVk
              ? ((typeof t === 'function' && t('iskryNotEnoughVk')) || 'Недостаточно Искр (нужно {n}). Пополни баланс.')
              : ((typeof t === 'function' && t('iskryNotEnoughFull')) || 'Недостаточно Искр (нужно {n}). Пополни баланс или введи промокод.');
            setPaymentStatus(_neMsg.replace('{n}', needIskry), 'error');
            payOvFreeClaimBtn.disabled = false;
            payOvFreeClaimBtn.textContent = originalBtnText;
          } else {
            // Закон №37/№31: сырой backend-текст НЕ показываем, но и НЕ молчим (баг Марины
            // 11.07: «нажали, ничего»). Даём короткий видимый отклик на явное действие.
            console.warn('[Iskry Pay] Ошибка:', json.error || json.message || resp.status);
            // Правило «песню Искрами открывает пакет» — не сбой, а условие. Называем его
            // словами, а не «попробуй ещё раз»: пробовать бессмысленно, ответ не изменится.
            var _ipCode = json && json.error_code;
            var _ipMsg = (_ipCode && typeof t === 'function' && t(_ipCode))
              || (typeof t === 'function' ? (t('iskryPayRetry') || 'Не получилось оформить. Попробуй ещё раз или выбери другой способ.') : 'Не получилось оформить. Попробуй ещё раз или выбери другой способ.');
            setPaymentStatus(_ipMsg, 'error');
            payOvFreeClaimBtn.disabled = false;
            payOvFreeClaimBtn.textContent = originalBtnText;
          }
        } catch (e) {
          // Закон №37: error-текст только при реальном offline (системный overlay).
          console.error('[Iskry Pay] fetch fail:', e);
          setPaymentStatus('', '');
          if (typeof window._ensureOnline === 'function') window._ensureOnline();
          payOvFreeClaimBtn.disabled = false;
          payOvFreeClaimBtn.textContent = originalBtnText;
        }
      });

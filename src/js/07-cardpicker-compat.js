
      // ── Card Picker (синастрия) ─────────────────────────────────────────────
      async function scLoadUserCards(apiBase, initData) {
        try {
          var r = await fetch(apiBase + '/api/user/cards', {
            headers: { 'X-Telegram-Init': initData }
          });
          var d = await r.json().catch(function(){ return {}; });
          if (d.success && Array.isArray(d.cards)) {
            window._scUserCards = d.cards;
            // #64 (Алла 13.06): НЕ авто-подставлять последнюю песню как контекст.
            // Раньше _scPickerSelA = _scLastRequestId → explicit_request=true →
            // Оракул отвечал про субъекта последней песни (напр. «Екатерину»,
            // которой делали песню 1 раз, но НЕ сохраняли в картотеку). Теперь
            // контекст по умолчанию — сам владелец (профиль), пока он ЯВНО не
            // выберет человека из картотеки.
            scUpdateCardPickerLabel();
          }
        } catch(e) { console.warn('[SoulChat] cards fetch error:', e && e.message); }
      }

      function scCardLabel(card) {
        if (!card) return '—';
        var icon = card.mode === 'couple' ? ' ♥' : '';
        if (card.mode === 'couple' && card.person2_name) {
          return card.name + ' & ' + card.person2_name + icon;
        }
        return card.name + (card.birthdate ? ', ' + card.birthdate : '') + icon;
      }

      // Имя + мета отдельными строками для карточки пикера (иерархия как у hero-card).
      // Дата карточки пикера → «4 июн 2026» (реф showcase-chat-context fmt()).
      // Вход — ISO YYYY-MM-DD (формат birthdate в БД). Месяцы локализованы.
      // Неразборный формат → как есть (без поломки).
      function _scFmtDate(s) {
        if (!s) return '';
        var str = String(s).trim(), y, m, d, mt;
        if ((mt = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
        else if ((mt = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
        else return str;
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return str;
        var lang = (typeof currentLang !== 'undefined' ? currentLang : (window._currentLang || 'ru'));
        var MON = ({
          ru: ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'],
          en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
          de: ['Jan','Feb','März','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
          fr: ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc']
        })[lang] || ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
        return d + ' ' + MON[m - 1] + ' ' + y;
      }
      function scCardParts(card) {
        if (!card) return { name: '—', meta: '' };
        if (card.mode === 'couple' && card.person2_name) {
          return { name: card.name + ' & ' + card.person2_name, meta: '♥' };
        }
        return { name: card.name, meta: _scFmtDate(card.birthdate) };
      }

      function scUpdateCardPickerLabel() {
        var pillsWrap = document.getElementById('scContextPills');
        var labelA = document.getElementById('scContextLabelA');
        var labelB = document.getElementById('scContextLabelB');
        var btnB = document.getElementById('scContextBtnB');
        var plus = document.getElementById('scContextPlus');
        if (!pillsWrap || !labelA) return;

        var cards = window._scUserCards || [];
        var selA = window._scPickerSelA; // #64: только ЯВНЫЙ выбор, без авто-последней-песни
        var selB = window._scRequestId2;
        var cardA = cards.find(function(c){ return c.id === selA; });
        var cardB = selB ? cards.find(function(c){ return c.id === selB; }) : null;

        // Контекст переехал в dock-кнопки [О себе]/[Совместимость] (Алла 16.06) —
        // старую пилюлю #scContextPills больше не показываем.
        pillsWrap.style.display = 'none';

        if (cardA) {
          labelA.textContent = scCardLabel(cardA);
        } else {
          // #64: по умолчанию контекст — сам владелец, не «Выбрать…» и не чужая песня
          labelA.textContent = t('scContextSelf');
        }

        if (cardB) {
          labelB.textContent = scCardLabel(cardB);
          btnB.style.display = 'inline-flex';
          plus.style.display = 'inline';
        } else {
          btnB.style.display = 'none';
          plus.style.display = 'none';
        }
        if (typeof scUpdateCtxPlank === 'function') scUpdateCtxPlank();
      }

      // Плашка контекста вверху чата (реф showcase-chat .ctx-plank, Алла 18.06):
      // показывается при ЯВНО выбранном человеке/паре; иначе скрыта (дефолт = владелец).
      function scUpdateCtxPlank() {
        var plank = document.getElementById('scCtxPlank');
        if (!plank) return;
        var cards = window._scUserCards || [];
        var esc = function(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
        var nm = function(card){ try { return (scCardParts(card) || {}).name || (card && card.name) || ''; } catch(_) { return (card && card.name) || ''; } };
        // 'self' = карта владельца («Ты»); реальный id → ищем в картотеке.
        var meCard = (typeof _scMeCard === 'function') ? _scMeCard() : { id: 'self', name: ((typeof t === 'function' && t('ctxYou')) || 'Ты'), me: true };
        var resolveCard = function(id){
          if (!id) return null;
          if (id === 'self') return meCard;
          return cards.find(function(c){ return c.id === id; }) || null;
        };
        var label = esc((typeof t === 'function' && t('ctxPlankLabel')) || 'Контекст задан');
        var spark = '<span class="cp-spark"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg></span>';
        var av = function(name){ return '<span class="cp-av" style="background:' + _scAvBg(_scCardHue(name)) + '">' + esc(String(name || '?').trim().charAt(0).toUpperCase()) + '</span>'; };
        // ПАРА (синастрия): стороны из РЕАЛЬНЫХ id контекста — _scLastRequestId (A) +
        // _scRequestId2 (B), 'self'→«Ты». Раньше обе стороны брались из _scPickerSelA
        // (это НЕ-self id для explicit_request) → пара (self, X) рисовалась как «X и X»
        // («Ярослав и Ярослав» вместо «Ты и Ярослав»). Алла 27.06.
        if (window._scRequestId2) {
          var cardA = resolveCard(window._scLastRequestId);
          var cardB = resolveCard(window._scRequestId2);
          if (cardA && cardB) {
            var na = nm(cardA), nb = nm(cardB);
            var pairTpl = (typeof t === 'function' && t('ctxPlankPair')) || 'разбор пары {a} и {b}';
            var pairTx = pairTpl.replace('{a}', esc(na)).replace('{b}', esc(nb));
            plank.innerHTML = spark + av(na) + '<span class="cp-tx"><b>' + label + '</b> · ' + pairTx + '</span>';
            plank.style.display = 'flex';
            return;
          }
        }
        // ОДНА карточка: только ЯВНЫЙ выбор (_scPickerSelA), не авто-последняя песня (закон №64).
        var cardOne = window._scPickerSelA ? resolveCard(window._scPickerSelA) : null;
        if (cardOne) {
          var n = nm(cardOne);
          var oneTpl = (typeof t === 'function' && t('ctxPlankOne')) || 'разговор об {name}';
          var oneTx = oneTpl.replace('{name}', esc(n));
          plank.innerHTML = spark + av(n) + '<span class="cp-tx"><b>' + label + '</b> · ' + oneTx + '</span>';
          plank.style.display = 'flex';
        } else if (window._oraclePrismContext && window._oraclePrismContext.title) {
          // Пришли из разбора-призмы (askAboutPrism) → «Контекст задан · ваш разбор «X»»
          // (Алла 06.07). Явно выбранный контакт/пара — приоритетнее (выше по ветке).
          var prismTpl = (typeof t === 'function' && t('ctxPlankPrism')) || 'ваш разбор «{title}»';
          var prismTx = prismTpl.replace('{title}', esc(window._oraclePrismContext.title));
          plank.innerHTML = spark + '<span class="cp-tx"><b>' + label + '</b> · ' + prismTx + '</span>';
          plank.style.display = 'flex';
        } else {
          plank.style.display = 'none';
          plank.innerHTML = '';
        }
      }
      window.scUpdateCtxPlank = scUpdateCtxPlank;

      function _scCardHue(key) {
        var h = 0, str = String(key || '');
        for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) % 360; }
        return h;
      }
      function _scAvBg(h) {
        return 'radial-gradient(120% 120% at 30% 24%,hsl(' + ((h + 30) % 360) + ',88%,64%),transparent 56%),radial-gradient(120% 120% at 78% 36%,hsl(' + h + ',82%,52%),transparent 58%),linear-gradient(160deg,hsl(' + h + ',46%,22%),hsl(' + ((h + 40) % 360) + ',46%,13%))';
      }
      // Карточка «Ты» (ME) для синастрии — сторона владельца ('self'). Имя/мета
      // из i18n, hue:332 как в референсе showcase-chat-context.
      function _scMeCard() {
        return { id: 'self', name: (typeof t === 'function' && t('ctxYou')) || 'Ты', rel: '__self__', date: (typeof t === 'function' && t('ctxYourChart')) || 'твоя дата рождения', place: '', me: true, hue: 332 };
      }
      // Единый список для текущего режима: synastry → [ME].concat(cards),
      // single → cards (БЕЗ ME — закон №64: «про тебя» = дефолт без выбора).
      // Реф showcase-chat-context-3: карточка = аватар + имя + рел-бейдж + дата · место.
      function _scPickerItems() {
        var cards = (window._scUserCards || []).map(function(card) {
          var parts = scCardParts(card);
          var isCouple = card.mode === 'couple' && card.person2_name;
          return {
            id: card.id, name: parts.name,
            rel: card.relationship || '',
            date: isCouple ? parts.meta : _scFmtDate(card.birthdate),
            place: isCouple ? '' : (card.birthplace || ''),
            hue: _scCardHue(parts.name || card.id)
          };
        });
        // Self-карточка «Ты» теперь и в single («О себе» — выбор себя, Алла 20.06).
        return [_scMeCard()].concat(cards);
      }
      function _scPickerFind(id) {
        var L = _scPickerItems();
        for (var i = 0; i < L.length; i++) { if (L[i].id === id) return L[i]; }
        return null;
      }
      function _scPavatar(item) {
        return '<span class="pair-av" style="background:' + _scAvBg(item.hue) + '">' + (item.name || '?').trim().charAt(0).toUpperCase() + '</span>';
      }

      // Рендер списка карточек для текущего режима. Подсветка/хинт/футер — в scSyncPicker.
      function scBuildPickerList() {
        var container = document.getElementById('scPickerList');
        if (!container) return;
        container.innerHTML = '';
        var L = _scPickerItems();
        var modal = document.getElementById('scCardPickerModal');
        var hasCards = (window._scUserCards || []).length > 0;
        // Состояние списка для CSS эталона: one / compat / empty (нет ни одной карточки, кроме своей)
        if (modal) modal.dataset.ctx = !hasCards ? 'empty' : (window._scPickerMode === 'synastry' ? 'compat' : 'one');
        var cnt = document.getElementById('scPickerCount'); if (cnt) cnt.textContent = String(L.length);
        if (!hasCards) return; // блок .ctx-empty показывает CSS по data-ctx="empty"
        L.forEach(function(item) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'person' + (item.me ? ' person-me' : '');
          // аватар: первая буква имени на градиенте-hue (реф .person-av)
          var av = document.createElement('span');
          av.className = 'person-av';
          av.style.background = _scAvBg(item.hue);
          av.textContent = (item.name || '?').trim().charAt(0).toUpperCase();
          btn.appendChild(av);
          var slotEl = document.createElement('span'); slotEl.className = 'slot-n'; btn.appendChild(slotEl); // номер слота в «Совместимости»
          // тело: верхняя строка (имя + рел-бейдж) + дата · место
          var textWrap = document.createElement('span');
          textWrap.className = 'person-body';
          var topEl = document.createElement('span');
          topEl.className = 'person-top';
          var nameEl = document.createElement('span');
          nameEl.className = 'person-name';
          nameEl.textContent = item.name;
          topEl.appendChild(nameEl);
          if (item.rel === '__self__') {
            var selfBadge = document.createElement('span');
            selfBadge.className = 'rel self';
            selfBadge.innerHTML = '✧ <span data-i18n="ctxMeBadge">' + ((typeof t === 'function' && t('ctxMeBadge')) || 'это ты') + '</span>';
            topEl.appendChild(selfBadge);
          } else if (item.rel) {
            var relBadge = document.createElement('span');
            relBadge.className = 'rel';
            relBadge.textContent = item.rel;
            topEl.appendChild(relBadge);
          }
          textWrap.appendChild(topEl);
          if (item.date || item.place) {
            var metaEl = document.createElement('span');
            metaEl.className = 'person-date';
            metaEl.textContent = item.date || '';
            if (item.place) {
              var placeEl = document.createElement('span');
              placeEl.className = 'person-place';
              placeEl.textContent = (item.date ? ' · ' : '') + item.place;
              metaEl.appendChild(placeEl);
            }
            textWrap.appendChild(metaEl);
          }
          var checkEl = document.createElement('span');
          checkEl.className = 'person-pick';
          checkEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
          btn.appendChild(textWrap);
          if (item.me) { // своя карточка в режиме правки заперта
            btn.classList.add('locked');
            var lockEl = document.createElement('span'); lockEl.className = 'lock-tag';
            lockEl.textContent = _scPickerTl('ctxLockTag', 'нельзя удалить');
            btn.appendChild(lockEl);
          }
          btn.appendChild(checkEl);
          btn.setAttribute('data-id', item.id);
          btn.addEventListener('click', function() { scTogglePickerCard(item.id); });
          container.appendChild(btn);
        });
        // «Добавить человека» — пунктирная карточка (реф .person-add).
        // Открывает картотеку (Контакты), где можно завести нового человека.
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'person-add';
        addBtn.innerHTML = '<span class="pa-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>' +
          '<span class="pa-tx" data-i18n="ctxAddPerson">' + ((typeof t === 'function' && t('ctxAddPerson')) || 'Добавить человека') + '</span>';
        addBtn.addEventListener('click', scAddPersonFromPicker);
        container.appendChild(addBtn);
      }
      // «Добавить человека» из пикера контекста → Контакты (картотека).
      function scAddPersonFromPicker() {
        scCloseCardPicker();
        if (typeof goToPage === 'function') goToPage('heroesPage');
        // Без initHeroesPage() пейволл Лаборатории показывал статичный HTML-дефолт
        // «3 250 ₽» на нативном VK, минуя других входов (Алла: «нужна максимальная
        // осознанность»). Идемпотентно — initHeroesPage безопасно перевызывать.
        if (typeof initHeroesPage === 'function') initHeroesPage();
      }
      window.scAddPersonFromPicker = scAddPersonFromPicker;

      // Клик по карточке: single → выбор ровно одного; synastry → toggle, максимум
      // два (старейший выдавливается). _scPickerSel — единый массив выбранных id.
      // ═══ CD 19.09 · Контекст чата (docs/DESIGN-HANDOFF-1909.md, экран 8): режим правки «Изменить → Удалить» ═══
      // Заменяет пер-строчную кнопку .person-del (Алла 04.09): на таче она была пустой пилюлей (показывалась
      // только по hover) и била в DELETE /api/heroes/client:<uuid> — с префиксом виртуального контекста,
      // которого heroesApi не знает (/api/user/cards отдаёт id "client:"+clients.id) — удаление не срабатывало.
      function _scPickerTl(k, fb, v) { var s = (typeof t === 'function') ? t(k, v) : null; return (s && s !== k) ? s : fb; }
      function _scCardWord(n) {
        var lang = (typeof currentLang !== 'undefined' ? currentLang : (window._currentLang || 'ru'));
        if (lang === 'ru') { var m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? _scPickerTl('ctxCardWord1', 'карточку') : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? _scPickerTl('ctxCardWord2', 'карточки') : _scPickerTl('ctxCardWord5', 'карточек'); }
        return n === 1 ? _scPickerTl('ctxCardWord1', 'card') : _scPickerTl('ctxCardWord5', 'cards');
      }
      function _scPickerEditReset() {
        window._scPickerEdit = false; window._scPickerArmed = false; window._scPickerEditSel = [];
        var m = document.getElementById('scCardPickerModal'); if (m) m.removeAttribute('data-edit');
        var l = document.getElementById('scPickerEditLbl'); if (l) l.textContent = _scPickerTl('ctxEdit', 'Изменить');
      }
      function scPickerToggleEdit() {
        var m = document.getElementById('scCardPickerModal'); if (!m) return;
        if (window._scPickerEdit) { _scPickerEditReset(); scSyncPicker(); return; }
        window._scPickerEdit = true; window._scPickerArmed = false; window._scPickerEditSel = [];
        m.setAttribute('data-edit', '1');
        var l = document.getElementById('scPickerEditLbl'); if (l) l.textContent = _scPickerTl('ctxDone', 'Готово');
        scSyncPicker();
      }
      window.scPickerToggleEdit = scPickerToggleEdit;
      function scPickerDelCancel() {
        if (window._scPickerArmed) { window._scPickerArmed = false; scSyncPicker(); return; }
        _scPickerEditReset(); scSyncPicker();
      }
      window.scPickerDelCancel = scPickerDelCancel;
      // Первое нажатие — взвод («Да, удалить N карточки»), второе — удаление. Подтверждение в самой кнопке, без модалки (эталон).
      async function scPickerDelete() {
        var ids = (window._scPickerEditSel || []).slice();
        if (!ids.length) return;
        if (!window._scPickerArmed) { window._scPickerArmed = true; scSyncPicker(); return; }
        if (!window._ensureOnline()) return;
        var btn = document.getElementById('scPickerDelBtn'); if (btn) btn.disabled = true;
        var base = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
        var removed = [];
        for (var i = 0; i < ids.length; i++) {
          var hid = String(ids[i]).replace(/^client:/, ''); // clients.id — без префикса виртуального контекста
          try {
            var resp = await fetchWithTimeout(base + '/api/heroes/' + encodeURIComponent(hid), { method: 'DELETE', headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) }, 20000);
            if (resp.ok || resp.status === 204) removed.push(ids[i]);
          } catch (e) { console.warn('[Picker] delete', e); }
        }
        if (removed.length) {
          window._scUserCards = (window._scUserCards || []).filter(function(c) { return removed.indexOf(c.id) < 0; });
          try { if (Array.isArray(window.heroesCache)) window.heroesCache = window.heroesCache.filter(function(c) { return removed.indexOf('client:' + c.id) < 0; }); } catch (_) {}
          if (removed.indexOf(window._scLastRequestId) >= 0 || removed.indexOf(window._scRequestId2) >= 0) { window._scLastRequestId = null; window._scRequestId2 = null; window._scPickerSelA = null; }
          window._scPickerSel = (window._scPickerSel || []).filter(function(id) { return removed.indexOf(id) < 0; });
          if (typeof window.loadHeroesList === 'function') { try { window.loadHeroesList(); } catch (_) {} }
        }
        _scPickerEditReset();
        scBuildPickerList(); scSyncPicker();
        if (removed.length) scUpdateCardPickerLabel();
      }
      window.scPickerDelete = scPickerDelete;
      function scTogglePickerCard(id) {
        if (window._scPickerEdit) { // режим правки: мультивыбор на удаление, своя карточка не выбирается
          var eit = _scPickerFind(id); if (!eit || eit.me) return;
          var es = window._scPickerEditSel || (window._scPickerEditSel = []);
          var ei = es.indexOf(id); if (ei >= 0) es.splice(ei, 1); else es.push(id);
          window._scPickerArmed = false;
          scSyncPicker(); return;
        }
        var sel = window._scPickerSel || (window._scPickerSel = []);
        var at = sel.indexOf(id);
        if (window._scPickerMode === 'synastry') {
          if (at >= 0) { sel.splice(at, 1); }
          else { if (sel.length >= 2) sel.shift(); sel.push(id); }
        } else {
          window._scPickerSel = [id];
        }
        scSyncPicker();
      }

      // Подсветка выбранных + хинт + футер (пара) + текст/состояние кнопки; режим правки — кнопка «Удалить».
      function scSyncPicker() {
        var sel = window._scPickerSel || [];
        var container = document.getElementById('scPickerList');
        var _t = function(k, f, v) { return (typeof t === 'function' && t(k, v)) || f; };
        var note = document.getElementById('scPickerApplyNote');
        if (window._scPickerEdit) {
          var es = window._scPickerEditSel || [], n = es.length, armed = !!window._scPickerArmed;
          if (container) container.querySelectorAll('.person').forEach(function(el) {
            el.classList.toggle('sel', es.indexOf(el.getAttribute('data-id')) >= 0);
            var s0 = el.querySelector('.slot-n'); if (s0) s0.textContent = '';
          });
          var d = document.getElementById('scPickerDelBtn'), dl = document.getElementById('scPickerDelLbl'), dn = document.getElementById('scPickerDelNote'), dc = document.getElementById('scPickerDelCancel');
          if (d) { d.disabled = !n; d.classList.toggle('arm', armed && n > 0); }
          if (dl) dl.textContent = !n ? _t('ctxDel', 'Удалить') : (armed ? _t('ctxDelArm', 'Да, удалить {n} {word}', { n: n, word: _scCardWord(n) }) : _t('ctxDelN', 'Удалить · {n}', { n: n }));
          if (dn) dn.textContent = !n ? _t('ctxDelNoteEmpty', 'Выбери карточки, которые нужно убрать') : (armed ? _t('ctxDelNoteArm', 'Это не отменить — даты рождения удалятся насовсем') : es.map(function(id) { var it = _scPickerFind(id); return it ? it.name : ''; }).join(', '));
          if (dc) dc.textContent = armed ? _t('ctxDelCancelArm', 'Не удалять') : _t('ctxDone', 'Готово');
          return;
        }
        if (container) {
          container.querySelectorAll('.person').forEach(function(el) {
            var k = sel.indexOf(el.getAttribute('data-id'));
            el.classList.toggle('sel', k >= 0);
            var s1 = el.querySelector('.slot-n'); if (s1) s1.textContent = (k >= 0 && window._scPickerMode === 'synastry') ? String(k + 1) : '';
          });
        }
        var hint = document.getElementById('scPickerHint');
        var pair = document.getElementById('scPickerPair');
        var applyBtn = document.getElementById('scPickerApplyBtn');
        if (window._scPickerMode === 'synastry') {
          if (hint) hint.innerHTML = _t('ctxHintPickTwo', '<b>Выбери двоих</b> — Оракул разберёт их совместимость.') + (sel.length ? (' ' + sel.length + '/2') : '');
          var a = sel[0] != null ? _scPickerFind(sel[0]) : null;
          var b = sel[1] != null ? _scPickerFind(sel[1]) : null;
          if (applyBtn) {
            applyBtn.disabled = sel.length !== 2;
            applyBtn.textContent = (a && b) ? _t('ctxApplyPair', 'Разобрать пару · {a} и {b}', { a: a.name, b: b.name }) : _t('ctxApply', 'Применить');
          }
          if (pair) {
            if (a && b) {
              pair.innerHTML = _scPavatar(a) + '<span class="pair-heart"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></span>' + _scPavatar(b);
              pair.classList.add('show');
            } else { pair.classList.remove('show'); pair.innerHTML = ''; }
          }
          if (note) note.textContent = sel.length === 2 ? _t('ctxNotePair', 'Оракул будет держать обе карточки в контексте') : (sel.length === 1 ? _t('ctxNoteHalf', 'Выбрана одна — нужна вторая') : _t('ctxNoteEmptyPair', 'Выбери две карточки, чтобы продолжить'));
        } else {
          if (pair) { pair.classList.remove('show'); pair.innerHTML = ''; }
          var one = sel.length === 1 ? _scPickerFind(sel[0]) : null;
          if (hint) hint.innerHTML = one ? _t('ctxHintOneSelected', 'Чат пойдёт об одном человеке.') : _t('ctxHintPickOne', '<b>Выбери карточку</b> — Оракул будет говорить об этом человеке.');
          if (applyBtn) {
            applyBtn.disabled = sel.length !== 1;
            applyBtn.textContent = one ? _t('ctxApplyOne', 'Применить · {name}', { name: one.name }) : _t('ctxApply', 'Применить');
          }
          if (note) note.textContent = one ? _t('ctxNoteOne', 'Оракул будет держать эту карточку в контексте') : _t('ctxNoteEmpty', 'Выбери карточку, чтобы продолжить');
        }
      }

      function scSetPickerMode(mode) {
        _scPickerEditReset();
        window._scPickerMode = mode;
        var tabSingle = document.getElementById('scPickerTabSingle');
        var tabSyn = document.getElementById('scPickerTabSynastry');
        // VK Testers 7272221: переключаем класс is-active вместо inline cssText —
        // существующий CSS-правило .sc-picker-tab.is-active даёт правильные
        // цвета в обеих темах (без невидимого white-on-white в светлой).
        if (tabSingle) { tabSingle.classList.toggle('on', mode === 'single'); tabSingle.setAttribute('aria-selected', String(mode === 'single')); }
        if (tabSyn)    { tabSyn.classList.toggle('on', mode === 'synastry'); tabSyn.setAttribute('aria-selected', String(mode === 'synastry')); }
        // В «Совместимости» карточка «Ты» ('self') предвыбрана; «Одна карточка» —
        // без предвыбора (закон №64: дефолт = про владельца, без явного выбора).
        window._scPickerSel = mode === 'synastry' ? ['self'] : [];
        scBuildPickerList();
        scSyncPicker();
      }
      // Табы пикера используют inline onclick="scSetPickerMode(...)", который
      // ищет функцию в global scope. Без экспорта в window клик по табу
      // «Совместимость»/«Одна карточка» бросал ReferenceError и не переключал —
      // переключение табов было сломано. Закон №20 (root cause), №32.
      window.scSetPickerMode = scSetPickerMode;

      // Batch 10.1 (отчёт 7267171 Windows): scOpenCardPicker сбрасывал
      // inline display, но базовое правило CSS `.sc-picker-overlay{display:none}`
      // оставалось активным — окно не показывалось. Используем класс
      // `.is-visible` (правило `.sc-picker-overlay.is-visible{display:block}`
      // уже определено в стилях).
      function scOpenCardPicker() {
        var modal = document.getElementById('scCardPickerModal');
        if (!modal) return;
        // Batch 10.9 (отчёт 7271865 Windows, регрессия Batch 10.1): scroll-lock
        // на body при показе оверлея. Раньше при появлении position:fixed
        // overlay Windows-браузер пересчитывал scrollbar страницы → контент
        // за оверлеем смещался вправо на ~17px. Запоминаем текущий overflow
        // и восстанавливаем при закрытии.
        try {
          window._scPickerPrevOverflow = document.body.style.overflow || '';
          document.body.style.overflow = 'hidden';
        } catch (_) {}
        modal.classList.add('is-visible');
        // Подсказка страницы (#pageHint) висит поверх модалки на первом визите — прячем (аудит 23.09)
        try { var _ph = document.getElementById('pageHint'); if (_ph) _ph.style.display = 'none'; } catch (_) {}
        // Перезапускаем текущий режим чтобы отрисовать актуальный список
        scSetPickerMode(window._scPickerMode || 'single');
      }
      window.scOpenCardPicker = scOpenCardPicker;

      function scCloseCardPicker() {
        _scPickerEditReset();
        var modal = document.getElementById('scCardPickerModal');
        if (modal) modal.classList.remove('is-visible');
        // Восстанавливаем body overflow
        try {
          document.body.style.overflow = window._scPickerPrevOverflow || '';
        } catch (_) {}
        // Сбрасываем пар-флоу: возвращаем табы режима и снимаем флаг (иначе обычный
        // picker откроется без табов / с залипшим _scPairPrismPick). Закон №34/№32.
        window._scPairPrismPick = false;
        var _pmTabs = document.getElementById('scPickerModeTabs'); if (_pmTabs) _pmTabs.style.removeProperty('display');
        // Восстанавливаем чат-дефолты заголовка/подзаголовка (пар-флоу их менял).
        var _ctl = function(k, fb){ return (typeof t === 'function' && t(k)) || fb; };
        var _ct = document.getElementById('scPickerTitle'); if (_ct) _ct.textContent = _ctl('scPickerTitle', 'Контекст чата');
        var _cs = document.querySelector('#scCardPickerModal .ctx-sub'); if (_cs) _cs.textContent = _ctl('ctxSub', 'С кем сегодня говорим — Оракул будет держать это в контексте разговора.');
      }
      window.scCloseCardPicker = scCloseCardPicker;

      function scApplyCardPicker() {
        var sel = window._scPickerSel || [];
        if (window._scPickerMode === 'synastry') {
          // Совместимость: две стороны (sel[0], sel[1]); любая может быть 'self'
          // (карта владельца). Контракт: request_id=A, request_id_2=B (если B≠A).
          var A = sel[0], B = sel[1];
          window._scLastRequestId = A;
          window._scRequestId2 = (B && B !== A) ? B : null;
          // _scPickerSelA — флаг «явный выбор» для метки/explicit_request: для
          // синастрии берём НЕ-'self' сторону (или null, если обе self/нет). В
          // отправке чата explicit_request форсится по _scPickerMode==='synastry'.
          window._scPickerSelA = (A && A !== 'self') ? A : (B && B !== 'self' ? B : null);
          // Разбор-призма «Вы вдвоём»: picker открыт ИЗ призмы → ведём в разбор
          // (/api/soul-chat/prism с request_id_2), а НЕ в фичу совместимости. Флаг
          // ставится только в runPrism('pair') → обычный синастрия-чат не затронут.
          if (window._scPairPrismPick) {
            window._scPairPrismPick = false;
            // «Вы вдвоём» про ЛЮБЫХ двоих: передаём ОБЕ стороны (Алла 25.06). A/B —
            // как выбраны (любая может быть 'self' = твой профиль на бэке). Кнопка
            // «Применить» активна только при двух выбранных, значит A и B оба есть.
            scCloseCardPicker();
            if (typeof runPairPrism === 'function') runPairPrism(A, B);
            return;
          }
          // Полная пара (обе стороны выбраны и различны) → выделенный визуальный
          // экран совместимости. Self-only синастрия — прежнее поведение (метка+чат).
          if (A && B && A !== B && typeof window.openCompatResult === 'function') {
            scCloseCardPicker();
            window.openCompatResult(A, B);
            return;
          }
        } else {
          // Одна карточка: ровно один контакт (sel[0]) либо ничего (дефолт-владелец).
          var single = sel.length === 1 ? sel[0] : null;
          var isSelf = (single === 'self'); // self-карточка = тот же «про тебя» дефолт
          window._scLastRequestId = isSelf ? null : single;
          window._scRequestId2 = null;
          window._scPickerSelA = isSelf ? null : single; // null/self → explicit_request=false (закон №64)
        }
        scUpdateCardPickerLabel();
        scCloseCardPicker();
      }
      window.scApplyCardPicker = scApplyCardPicker;

      // Парный разбор «Вы вдвоём» (Алла 25.06): разбор ЛЮБЫХ двоих из картотеки.
      // После выбора двух карт зовём per-prism endpoint с request_id_1 (сторона A) +
      // request_id_2 (сторона B) и рендерим как любой другой разбор. 'self' = твой
      // профиль на бэке. Бэкенд: pair.txt + /api/soul-chat/prism + getAstroSnapshotForUser.
      async function runPairPrism(rid1, rid2) {
        _prismCatalogHide();
        var resultEl = document.getElementById('scPrismResult');
        if (!rid1 || !rid2) {
          renderPrismError('Для разбора «Вы вдвоём» выбери двоих.', 'second_card_required');
          return;
        }
        if (resultEl) {
          resultEl.style.display = 'flex';
          resultEl.innerHTML = '<div class="sc-prism-result-loading" id="scPrismLoadingMsg">Готовлю разбор «Вы вдвоём»…</div>';
          try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        }
        try {
          var apiBase = (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/, '');
          var headers = Object.assign({ 'Content-Type': 'application/json' }, typeof getAuthHeaders === 'function' ? getAuthHeaders() : {});
          var body = JSON.stringify({ prism_code: 'pair', request_id_1: rid1, request_id_2: rid2 });
          var resp = await fetchWithTimeout(apiBase + '/api/soul-chat/prism', { method: 'POST', headers: headers, body: body }, 180000);
          var j = await resp.json().catch(function () { return {}; });
          if (!resp.ok || !j.success) {
            // №37/№31: тех-текст с HTTP-кодом юзеру запрещён; осмысленный error бэка оставляем.
            renderPrismError(j.error || ((typeof t === 'function' && t('prismOracleRetry')) || 'Оракул задумался. Попробуй ещё раз.'), j.reason, j.free_prism);
            return;
          }
          // Кэшируем как остальные разборы, чтобы повторный тап был мгновенным.
          try { _prismResultsCache['pair'] = { title: j.title, sections: j.sections, raw_text: j.raw_text }; } catch (_) {}
          renderPrismResult({ prism_code: 'pair', title: j.title, sections: j.sections, raw_text: j.raw_text });
        } catch (e) {
          if (typeof window._ensureOnline === 'function') window._ensureOnline();
          console.warn('[pair-prism] fetch failed', e);
          renderPrismError('Не получилось собрать разбор. Попробуй ещё раз.', 'network');
        }
      }
      window.runPairPrism = runPairPrism;
      // ── /Card Picker ────────────────────────────────────────────────────────

      // ── Экран совместимости (compat-result): рендер + загрузка + CTA ──────────
      (function(){
        var FACETS = ['Тепло','Нежность','Ритм','Доверие','Лёгкость','Поддержка'];
        function clamp(n){ return Math.max(0, Math.min(100, Math.round(Number(n)||0))); }
        function esc(s){ var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }
        var SPARK='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"></path></svg>';
        var MIC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>';
        var CLK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l3 2"></path></svg>';
        var HEART='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.17 2 7.5 2 4.5 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.5 22 7.5c0 3.67-3.4 6.74-8.55 11.48L12 20.3z"/></svg>';

        function hearts(){
          var hl=document.getElementById('crHearts'); if(!hl || hl.childNodes.length) return;
          var HP=['16%','34%','52%','70%','86%','26%','60%'];
          HP.forEach(function(left,i){
            var s=document.createElement('span'); s.className='fheart';
            var sz=10+Math.round(Math.random()*12);
            s.style.left=left; s.style.width=sz+'px'; s.style.height=sz+'px';
            s.style.setProperty('--fdur',(4.5+Math.random()*3)+'s');
            s.style.setProperty('--fdel',(i*0.7+Math.random())+'s');
            s.style.setProperty('--frot',(Math.random()*30-15)+'deg');
            s.style.opacity='.5';
            s.innerHTML=HEART;
            hl.appendChild(s);
          });
        }

        function setLoading(){
          // (аудит iPhone 24.09: экран совместимости был захардкожен на русском)
          var nm=document.getElementById('crNames'); if(nm) nm.textContent=(typeof t === 'function' && t('compatLoadingNames')) || 'Считаем ваше созвучие…';
          var num=document.getElementById('crPctNum'); if(num) num.innerHTML='<span style="opacity:.5">…</span>';
          var fc=document.getElementById('crFacets'); if(fc) fc.innerHTML='';
          var vd=document.getElementById('crVerdict'); if(vd) vd.textContent='';
          var q=document.getElementById('crQuote'); if(q) q.textContent='';
        }

        function render(r){
          if(!r) return;
          if(r.result) r=r.result;
          // аудит iPhone 24.09: «Ты» и союз «и» были жёстко русскими на EN/DE/FR
          var selfWord = (typeof t === 'function' && t('compatSelf') !== 'compatSelf') ? t('compatSelf') : 'Ты';
          var dispA = r.aIsSelf ? selfWord : (r.nameA||'—');
          var dispB = r.bIsSelf ? selfWord : (r.nameB||'—');
          var avA=document.getElementById('crAvA'), avB=document.getElementById('crAvB');
          if(avA) avA.textContent=(String(dispA).trim().charAt(0)||'·').toUpperCase();
          if(avB) avB.textContent=(String(dispB).trim().charAt(0)||'·').toUpperCase();
          var nm=document.getElementById('crNames');
          if(nm){ var andTpl=(typeof t === 'function' && t('compatNamesAnd') !== 'compatNamesAnd') ? t('compatNamesAnd') : '{a} и {b}'; nm.innerHTML=esc(andTpl).replace('{a}','<b>'+esc(dispA)+'</b>').replace('{b}','<b>'+esc(dispB)+'</b>'); }
          var score=clamp(r.score);
          var byName={}; (r.facets||[]).forEach(function(f){ if(f&&f.name) byName[f.name]=clamp(f.pct); });
          FACETS.forEach(function(name,i){
            var f=(r.facets&&r.facets[i])?r.facets[i]:null;
            var pct=(f&&typeof f.pct!=='undefined')?clamp(f.pct):(byName[name]||0);
            var v=document.getElementById('crChip'+i+'v'); if(v) v.textContent=pct+'%';
          });
          var fc=document.getElementById('crFacets');
          if(fc){
            var h=''; var closer=Array.isArray(r.closer)?r.closer:[]; var grow=Array.isArray(r.grow)?r.grow:[];
            if(closer.length){
              h+='<div class="facet-sec">'+esc((typeof t === 'function' && t('compatCloserHeading')) || 'Что вас сближает')+'</div>';
              closer.forEach(function(c,i){ h+='<div class="facet up"><span class="facet-ic">'+(i%2?MIC:SPARK)+'</span><span class="facet-tx"><b>'+esc(c.title)+'</b><span>'+esc(c.desc)+'</span></span></div>'; });
            }
            if(grow.length){
              h+='<div class="facet-sec" style="margin-top:18px">'+esc((typeof t === 'function' && t('compatGrowHeading')) || 'Над чем стоит расти')+'</div>';
              grow.forEach(function(g){ h+='<div class="facet soft"><span class="facet-ic">'+CLK+'</span><span class="facet-tx"><b>'+esc(g.title)+'</b><span>'+esc(g.desc)+'</span></span></div>'; });
            }
            fc.innerHTML=h;
          }
          var vd=document.getElementById('crVerdict');
          if(vd){ vd.setAttribute('data-full', String(r.verdict||'')); vd.textContent=String(r.verdict||''); }
          var q=document.getElementById('crQuote');
          if(q) q.textContent = r.quote ? ('«'+r.quote+'»') : '';
          // финальные значения сразу (надёжно при любом окружении), затем rAF-анимация поверх
          var CIRC=534;
          var ring=document.getElementById('crRing');
          if(ring) ring.style.strokeDashoffset=String(CIRC*(1-score/100));
          var num=document.getElementById('crPctNum');
          if(num) num.innerHTML=score+'<span style="font-size:26px">%</span>';
          var chips=document.querySelectorAll('#compatResultPage .pchip');
          chips.forEach(function(el,i){ setTimeout(function(){ el.classList.add('in'); }, 300+i*120); });
          hearts();
          requestAnimationFrame(function(){ requestAnimationFrame(function(){
            if(ring){ ring.style.strokeDashoffset=String(CIRC); void ring.getBoundingClientRect(); ring.style.strokeDashoffset=String(CIRC*(1-score/100)); }
            if(num){ var t0=null,dur=1400; var step=function(ts){ if(!t0)t0=ts; var p=Math.min(1,(ts-t0)/dur); num.innerHTML=Math.round(p*score)+'<span style="font-size:26px">%</span>'; if(p<1)requestAnimationFrame(step); }; requestAnimationFrame(step); }
            if(vd){ var full=vd.getAttribute('data-full')||''; vd.textContent=''; var j=0; setTimeout(function(){ var iv=setInterval(function(){ vd.textContent=full.slice(0,++j); if(j>=full.length) clearInterval(iv); },24); },400); }
          }); });
        }
        window.renderCompatResult = render;

        window.openCompatResult = async function(ridA, ridB){
          // Запоминаем пару, чтобы кнопка «Спросить Оракула о связи» перенесла ИМЕННО
          // этих двоих в чат. Иначе initSoulChatPage подставит последнюю песню владельца
          // и Оракул «путает участников» (Закон №20).
          window._crPair = { a: ridA, b: ridB };
          var apiBase=(window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/,'');
          if(!apiBase || !hasAuth()) return;
          if(typeof window._ensureOnline==='function' && !window._ensureOnline()) return;
          setLoading();
          if(window.goToPage) window.goToPage('compatResultPage');
          var hdrs=Object.assign({'Content-Type':'application/json'}, getAuthHeaders());
          var body=JSON.stringify({ request_id:ridA, request_id_2:ridB });
          var att=0;
          while(att<4){
            if(typeof window._ensureOnline==='function' && !window._ensureOnline()){
              await new Promise(function(res){ window.addEventListener('online', function once(){ window.removeEventListener('online', once); res(); }); });
              continue;
            }
            try{
              var resp = await (window.fetchWithTimeout ? window.fetchWithTimeout(apiBase+'/api/compat-result',{method:'POST',headers:hdrs,body:body},60000) : fetch(apiBase+'/api/compat-result',{method:'POST',headers:hdrs,body:body}));
              var json = await resp.json().catch(function(){ return {}; });
              if(resp.ok && json.ok && json.result){ render(json.result); return; }
              // валидационные кейсы — мягкая подсказка + назад (а не пустой экран)
              if(json.error_code==='errContactNeedsBirthData' || json.error_code==='errPartyLoad' || json.error_code==='errNeedTwoParties'){
                if(typeof window.showToast==='function') window.showToast((typeof t === 'function' && t('errCompatNeedBirthData')) || 'Для разбора нужны дата и место рождения обоих');
                if(window.goBack) window.goBack();
                return;
              }
            }catch(e){ console.warn('[compat] retry', e); }
            att++;
            if(att>=4) return; // тихо: пользователь сам вернётся (закон №37)
            await new Promise(function(res){ setTimeout(res, Math.min(20000, 1500*Math.pow(1.7,att))); });
          }
        };

        // CTA-кнопки экрана
        function wire(){
          var song=document.getElementById('crSongBtn');
          if(song && !song._wired){ song._wired=true; song.addEventListener('click', function(){
            if(window.goToPage) window.goToPage('formPage');
            setTimeout(function(){ var b=document.querySelector('.mode-btn[data-mode="couple"]'); if(b) b.click(); }, 120);
          }); }
          var ask=document.getElementById('crAskBtn');
          if(ask && !ask._wired){ ask._wired=true; ask.addEventListener('click', function(){
            // Переносим пару в чат Оракула через one-shot _scPendingPair — он переживает
            // initSoulChatPage (там приоритетнее last_request_id). Без этого выбранный
            // человек подменяется последней песней владельца → «разговор об одном» /
            // «путает участников» (Закон №20).
            var pr = window._crPair;
            if (pr && pr.a && pr.b) window._scPendingPair = { a: pr.a, b: pr.b };
            if(window.goToPage) window.goToPage('soulChatPage');
          }); }
          var share=document.getElementById('crShareBtn');
          if(share && !share._wired){ share._wired=true; share.addEventListener('click', function(){
            var nm=document.getElementById('crNames');
            var pct=document.getElementById('crPctNum');
            var names = nm ? nm.textContent.replace(/\s+/g,' ').trim() : '';
            var p = pct ? pct.textContent.replace(/[^0-9]/g,'') : '';
            // КАНОН v5 (§5.2.4): на VK внешние ссылки в шеринге запрещены — делимся
            // ссылкой на само мини-приложение, не на yupsoul.ru.
            var url = (window._isVkMiniApp || window._appEnv === 'vk')
              ? 'https://vk.com/app54531891'
              : (window.WEBAPP_URL || 'https://yupsoul.ru');
            var txt = (names? names+' — ':'') + (p? p+'% созвучия в YupSoul':'наше созвучие в YupSoul');
            try{
              if(navigator.share){ navigator.share({ text:txt, url:url }).catch(function(){}); return; }
              if(window._copyToClipboard){ window._copyToClipboard(txt+' '+url); if(window.showToast) window.showToast('Скопировано'); return; }
            }catch(_){}
          }); }
        }
        if(document.readyState!=='loading') wire(); else document.addEventListener('DOMContentLoaded', wire);
      })();
      // ── /Экран совместимости ─────────────────────────────────────────────────

      // ── Подарки (gift) — фронт Phase 1: подарить свою песню + получить подарок ──
      (function(){
        function apiBase(){ return (window.BACKEND_URL || window.HEROES_API_BASE || '').replace(/\/$/,''); }
        function esc(s){ var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }
        function ini(n){ return String(n||'·').trim().charAt(0).toUpperCase()||'·'; }
        function avBg(h){ return 'radial-gradient(120% 120% at 30% 24%,hsl('+((h+30)%360)+',88%,64%),transparent 56%),radial-gradient(120% 120% at 78% 36%,hsl('+h+',82%,52%),transparent 58%),linear-gradient(160deg,hsl('+h+',46%,20%),hsl('+((h+40)%360)+',46%,12%))'; }
        var SPARK='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"></path></svg>';
        var GNOTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
        var state={ song:null, toName:'', deliver:'link', code:null };

        function songName(s){ return (typeof window._cleanTrackTitle==='function'?window._cleanTrackTitle(s.title,s.name):s.title)||t('giftSongFallback'); }
        // Свои готовые песни для дарения — из бэкенда /api/gift/my-songs (надёжно, не зависит
        // от плейлиста/радио; бэкенд уже отфильтровал completed/done + audio_url).
        function completedSongs(){ return (window._giftSongs||[]); }
        window._loadGiftSongs=function(){
          var base=apiBase(); if(!base||!hasAuth()){ window._giftSongs=window._giftSongs||[]; return Promise.resolve(); }
          return (window.fetchWithTimeout?window.fetchWithTimeout(base+'/api/gift/my-songs',{headers:getAuthHeaders()},15000):fetch(base+'/api/gift/my-songs',{headers:getAuthHeaders()}))
            .then(function(r){return r.json().catch(function(){return{};});})
            .then(function(j){ window._giftSongs=(j&&j.ok&&Array.isArray(j.songs))?j.songs:[]; })
            .catch(function(){ window._giftSongs=window._giftSongs||[]; });
        };
        // Пустое состояние: у юзера нет готовых песен → вместо «Нет готовых песен» зовём создать.
        function _giftSetEmpty(empty){
          var pg=document.getElementById('giftPage'); if(pg) pg.classList.toggle('gift-empty', !!empty);
          var send=document.getElementById('giftSendBtn'); if(send){ var sp=send.querySelector('span'); if(sp){ var k=empty?'giftCreateFirst':'giftSendBtn'; sp.setAttribute('data-i18n',k); sp.textContent=t(k); } }
          if(empty){ var n=document.getElementById('giftSongName'); if(n)n.textContent=t('giftNeedSongTitle'); var m=document.getElementById('giftSongMeta'); if(m)m.textContent=t('giftNeedSongSub'); var d=document.getElementById('giftDediPreview'); if(d)d.textContent=''; }
        }
        function selectSong(s){ state.song=s||null; var n=document.getElementById('giftSongName'); if(n)n.textContent=s?songName(s):t('giftNoSongs'); var m=document.getElementById('giftSongMeta'); if(m)m.textContent=s?(s.style||t('giftSoulSong')):''; }
        // Песня уже выбрана на входе (трек-меню → window._giftSong) — показываем её в карточке (как в референсе, без пикера).
        function useGiftSong(pre){
          var songs=completedSongs();
          if(!songs.length){ _giftSetEmpty(true); selectSong(null); return; }
          _giftSetEmpty(false);
          var preId=pre&&pre.id;
          var s=preId?(songs.find(function(x){return String(x.id)===String(preId);})||pre):songs[0];
          selectSong(s||null);
        }
        function setTo(n){ state.toName=n||''; var l=document.getElementById('giftToLabel'); if(l)l.textContent=n?t('giftToName',{name:n}):t('giftToPlaceholder'); }
        // In-app ввод имени получателя (вместо уродливого нативного prompt).
        function _giftShowAddName(){ var row=document.getElementById('giftAddNameRow'); var inp=document.getElementById('giftAddNameInput'); if(!row||!inp) return; row.style.display='flex'; inp.value=''; try{ inp.focus(); }catch(_){} }
        function _giftCommitAddName(){
          var row=document.getElementById('giftAddNameRow'); var inp=document.getElementById('giftAddNameInput'); if(!inp) return;
          var nm=(inp.value||'').trim();
          if(nm){ setTo(nm); var box=document.getElementById('giftRecips'); if(box) box.querySelectorAll('.recip').forEach(function(x){x.classList.remove('sel');}); }
          if(row) row.style.display='none';
        }
        function renderRecips(){
          var box=document.getElementById('giftRecips'); if(!box) return; var add=document.getElementById('giftRecipAdd');
          box.querySelectorAll('.recip:not(.recip-add)').forEach(function(x){x.remove();});
          ((window._heroes||[]).filter(function(h){return h&&h.name;}).slice(0,8)).forEach(function(h,i){ var b=document.createElement('button'); b.type='button'; b.className='recip'; b.dataset.name=h.name; b.innerHTML='<span class="recip-av" style="background:'+avBg((i*61+30)%360)+'">'+esc(ini(h.name))+'</span><span class="recip-name">'+esc(h.name)+'</span>'; box.insertBefore(b,add); });
          box.onclick=function(e){ if(e.target.closest('#giftRecipAdd')){ _giftShowAddName(); return; } var r=e.target.closest('.recip'); if(!r||!r.dataset.name) return; box.querySelectorAll('.recip').forEach(function(x){x.classList.toggle('sel',x===r);}); var _ar=document.getElementById('giftAddNameRow'); if(_ar)_ar.style.display='none'; setTo(r.dataset.name); };
        }
        function syncDedi(){ var inp=document.getElementById('giftDediInput'); if(!inp) return; var c=document.getElementById('giftDediCount'); if(c)c.textContent=inp.value.length+'/140'; var pv=document.getElementById('giftDediPreview'); if(pv)pv.textContent=inp.value.trim()?('«'+inp.value.trim()+'»'):t('giftDediPlaceholderPreview'); }

        // ── Экран оплаты подарка (giftPayPage, порт showcase-gift-pay) ──
        // Методы фильтруются по платформе; оплата любым методом → промокод (бэкенд gift_song → createGiftPromo).
        // Открытие платёжной ссылки: Telegram → openLink (в TG window.open НЕ открывает внешние URL),
        // Web → window.open, и если поп-ап заблокирован (вызов после await — user-gesture истёк) → та же
        // вкладка. Корень бага «оплата не открывается»: bare window.open после await молча блокировался.
        function _gpOpenExternal(url){
          if(!url) return false;
          var tg = window.Telegram && window.Telegram.WebApp;
          if(tg && typeof tg.openLink === 'function'){ try{ tg.openLink(url); return true; }catch(_){} }
          var w=null; try{ w=window.open(url,'_blank'); }catch(_){}
          if(!w){ try{ window.location.href=url; return true; }catch(_){ return false; } }
          return true;
        }
        async function _gpPay(){
          if(window._gpPaying) return; // тап по методу = оплата (Алла 25.06): защита от двойного запуска
          var base = apiBase(); if(!base || !hasAuth()) return;
          if(typeof window._ensureOnline==='function' && !window._ensureOnline()) return;
          window._gpPaying = true;
          var _gpm = document.getElementById('gpMethods'); if(_gpm){ _gpm.style.opacity='.55'; _gpm.style.pointerEvents='none'; }
          var method = window._gpMethod || 'stars';
          // §6.12 market-rules (отказ 10.07): платный подарок выдаёт промокод =
          // продажа купона — на VK ЗАПРЕЩЕНА полностью. Все входы скрыты CSS
          // (#giftCta, #soGiftBtn, #giftPayPage), это последний рубеж (fail-closed).
          if(window._isVkMiniApp === true || window._appEnv === 'vk'){
            console.warn('[giftPay] заблокировано на VK (§6.12: продажа промокодов запрещена)');
            window._gpPaying=false; if(_gpm){ _gpm.style.opacity=''; _gpm.style.pointerEvents=''; }
            return;
          }
          var btn = document.getElementById('gpPayBtn'); if(btn) btn.disabled = true;
          var H = Object.assign({'Content-Type':'application/json'}, getAuthHeaders());
          try {
            // КОРЕНЬ A: создать заказ подарка ПЕРВЫМ → request_id. Нужен ВСЕМ методам, иначе
            // card теряет деньги (нет заявки→fulfillment не вызывается), vk падает.
            // Контекст открытки (для кого/посвящение) из giftPage → сохраняется в заявку →
            // попадает в промокод → получатель видит открытку при открытии.
            var _gc = window._giftContext || {};
            var ordBody = JSON.stringify({ to_name: _gc.toName || null, dedication: _gc.dedication || null, delivery: _gc.delivery || null });
            var ordR = await fetch(base+'/api/gift/create-order', { method:'POST', headers:H, body: ordBody });
            var ord = await ordR.json().catch(function(){return{};});
            var rid = ord && ord.request_id;
            if(!rid){ if(btn) btn.disabled = false; window._gpPaying=false; if(_gpm){ _gpm.style.opacity=''; _gpm.style.pointerEvents=''; } return; }
            var body = JSON.stringify({ sku:'gift_song', request_id:rid });
            var opened = false;
            if(method === 'stars'){
              var r = await fetch(base+'/api/payments/stars/invoice', { method:'POST', headers:H, body:body });
              var d = await r.json().catch(function(){return{};});
              if(d.success && d.invoice_link){ var tg = window.Telegram && window.Telegram.WebApp; if(tg && tg.openInvoice){ try{ tg.openInvoice(d.invoice_link, function(st){ if(st==='paid') _gpPollPromo(rid); }); opened = true; }catch(_e){} } }
            } else if(method === 'card'){
              var r2 = await fetch(base+'/api/payments/tbank/init', { method:'POST', headers:H, body:body });
              var d2 = await r2.json().catch(function(){return{};});
              var url2 = d2.payment_url || d2.PaymentURL || d2.paymentUrl;
              if(url2){ if(_gpOpenExternal(url2)){ _gpPollPromo(rid); opened = true; } }
            } else if(method === 'vk'){
              var r4 = await fetch(base+'/api/payments/vk/order', { method:'POST', headers:H, body:body });
              var d4 = await r4.json().catch(function(){return{};});
              // item_id = "gift_song:REQ" (request_id вшит) — VK вернёт его в callback,
              // grantPurchaseBySku сохранит промокод в ИМЕННО эту заявку → success-экран покажет код.
              var vkItem = d4.item_id || ('gift_song:' + rid);
              if((d4.ok || d4.success) && window.vkBridge){ vkBridge.send('VKWebAppShowOrderBox', { type:'item', item: vkItem }).then(function(){ _gpPollPromo(rid); }).catch(function(){}); opened = true; }
            }
            // Платёж не открылся (нет ключей на тесте / провайдер недоступен) — понятная реакция,
            // НЕ молчаливое зависание кнопки (Алла 24.06 «ничего не происходит, перезагружаю»).
            if(!opened){ console.warn('[giftPay] no payment link'); if (typeof window._ensureOnline === 'function') window._ensureOnline(); } // №37: без error-тоста при online
          } catch(e){ console.warn('[giftPay] pay', e); if (typeof window._ensureOnline === 'function') window._ensureOnline(); } // №37
          if(btn) btn.disabled = false;
          window._gpPaying=false; if(_gpm){ _gpm.style.opacity=''; _gpm.style.pointerEvents=''; }
        }
        function _gpPollPromo(requestId){
          if(!requestId) return; var base = apiBase(); var att = 0;
          if(window._gpPollIv){ clearInterval(window._gpPollIv); window._gpPollIv = null; } // не плодим опросы при повторной оплате
          var iv = setInterval(async function(){
            att++; if(att > 60){ clearInterval(iv); window._gpPollIv = null; return; }
            try {
              var r = await fetch(base+'/api/gift/order-status/'+encodeURIComponent(requestId), { headers:getAuthHeaders() });
              var d = await r.json().catch(function(){return{};});
              if(d.ok && d.promo_code){
                clearInterval(iv); window._gpPollIv = null;
                var c = document.getElementById('gpDoneCode'); if(c) c.textContent = d.promo_code;
                var done = document.getElementById('gpDone'); if(done) done.classList.add('show');
                if(typeof window._refreshIskryBalance==='function') window._refreshIskryBalance();
              }
            } catch(_){}
          }, 1500);
          window._gpPollIv = iv;
        }
        function _gpShareCode(code){
          if(!code) return;
          var env = (window._appEnv)||'tg'; if(env==='telegram') env='tg'; // _appEnv='telegram', а ветки ждут 'tg'
          // VK: системный navigator.share показывает Telegram (запрещён §5.4.1) — на VK только копируем код.
          if(window._isVkMiniApp === true || env === 'vk'){ if(window._copyToClipboard){ window._copyToClipboard((typeof t==='function' ? t('gpShareText') : 'Промокод: ')+code); if(window.showToast) showToast(typeof t==='function'?t('gpCodeCopied'):'Скопировано'); } return; }
          var txt = (typeof t==='function' ? t('gpShareText') : 'Дарю тебе песню души 🤍 Промокод: ')+code;
          if(env === 'tg'){ var tg=window.Telegram&&window.Telegram.WebApp; if(tg&&tg.openTelegramLink){ try{ tg.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent('https://yupsoul.ru/?gift='+code)+'&text='+encodeURIComponent(txt)); return; }catch(_){} } }
          if(navigator.share && env==='web'){ navigator.share({ text:txt }).catch(function(){}); return; }
          if(window._copyToClipboard){ window._copyToClipboard(txt); if(window.showToast) showToast(typeof t==='function'?t('gpCodeCopied'):'Скопировано'); }
        }
        // Экспорт для раздела «Мои подарки» (08-gift.js) — переиспользуем платформенно-корректный
        // шеринг кода (VK = только копирование, §5.4.1) вместо дублирования логики.
        window._gpShareCode = _gpShareCode;
        window._initGiftPayPage = function(toName){
          var pg = document.getElementById('giftPayPage'); if(!pg) return;
          // OK: оплата подарка недоступна (все методы скрыты §5.4-OK) — не оставляем
          // юзера на тупиковом шите с ценой; входы скрыты CSS, это гард прямого входа.
          if (window._isOkMiniApp === true || window._appEnv === 'ok') {
            if (window.goBack) { goBack(); } else if (window.goToPage) { goToPage('profilePage'); }
            return;
          }
          // Apple 3.1.1 / 2.1: подарок оплачивается Stars или картой, товара под него
          // в App Store Connect нет. Страница скрыта CSS (#giftPayPage на is-native),
          // это гард прямого входа — иначе тупиковый шит с ценой в Stars.
          if (window._isNativeApp) {
            if (window.goBack) { goBack(); } else if (window.goToPage) { goToPage('profilePage'); }
            return;
          }
          // §6.12 (отказ VK 10.07): платный подарок = продажа промокода — на VK запрещён.
          // Страница скрыта CSS (#giftPayPage на is-vk), это гард прямого входа (goToPage).
          if (window._isVkMiniApp === true || window._appEnv === 'vk') {
            if (window.goBack) { goBack(); } else if (window.goToPage) { goToPage('profilePage'); }
            return;
          }
          // Закрытие шита по тапу на затемнённый фон (.scrim) — иначе «окно не закрывается» (Алла 24.06)
          var _gpScrim = pg.querySelector('.scrim');
          if (_gpScrim && !_gpScrim._w) { _gpScrim._w = 1; _gpScrim.addEventListener('click', function(){ if (window.goBack) { goBack(); } else if (window.goToPage) { goToPage('profilePage'); } }); }
          var done = document.getElementById('gpDone'); if(done) done.classList.remove('show');
          var toEl = document.getElementById('gpToName'); if(toEl && toName) toEl.textContent = toName;
          var env = (window._appEnv) || 'tg';
          var plat = env==='vk' ? (window._vkIsMobileClient ? 'vkm' : 'vkd') : (env==='web' ? 'web' : (env==='ok' ? 'web' : 'tg'));
          // VK правила §5.4.1: на VK MOBILE — только голоса VK (внешние платежи запрещены).
          // На VK DESKTOP — голоса + карта T-Bank (T-Bank одобрен VK для десктопа, как в
          // основном оверлее оплаты ~25160/37906). Крипта и Stars — НЕ на VK нигде.
          // Гард по надёжным _isVkMiniApp + _vkIsMobileClient (VK Bridge platform, стр.184).
          var vkOnly = window._isVkMiniApp === true || env === 'vk';
          // §5.4.1 VK-модерация: карта T-Bank допустима ТОЛЬКО на ПОДТВЕРЖДЁННОМ VK-десктопе
          // (vk_platform=desktop_web — тот же надёжный сигнал, что _vkDesktopCtx ниже). VK-мобайл ИЛИ
          // любая неопределённость детекта → строго ГОЛОСА VK. Раньше зависели от _vkIsMobileClient===true
          // (позитивный детект мобайла): если флаг не проставился на мобайл-вебе/при сбое → vkMobile=false
          // → показывалась карта на мобиле → отклонение модерации VK («двойная оплата»).
          var vkDesktop = vkOnly && window._vkPlatform === 'desktop_web';
          var vkMobile = vkOnly && !vkDesktop;
          var methods = document.getElementById('gpMethods');
          var orderPrice = document.getElementById('gpOrderPrice'), payAmt = document.getElementById('gpPayAmt'), payLabel = document.getElementById('gpPayLabel');
          var first = null;
          methods.querySelectorAll('.method').forEach(function(m){
            // Отклонение модерации 08.07 («двойная оплата»): РОВНО один способ на платформу.
            // Прецедент 24.06 (ответ модератора): «Т-банк одобрен, но только с десктопа».
            // → VK desktop_web = ТОЛЬКО карта T-Bank; весь остальной VK = ТОЛЬКО голоса.
            var on = vkMobile ? (m.dataset.m === 'vk')
                   : vkDesktop ? (m.dataset.m === 'card')
                   : (m.dataset.on.split(' ').indexOf(plat) >= 0);
            m.classList.toggle('hide', !on); m.classList.remove('on');
            if(on && !first) first = m;
          });
          function selectM(m){
            methods.querySelectorAll('.method').forEach(function(x){ x.classList.toggle('on', x===m); });
            var amtEl = m.querySelector('.m-amt');
            var amt = (amtEl && amtEl.textContent.trim()) || m.dataset.amt; // i18n-текст, не сырой data-amt (RU на EN/DE/FR)
            if(orderPrice) orderPrice.textContent = amt; if(payAmt) payAmt.textContent = amt;
            if(payLabel) payLabel.textContent = (typeof t==='function' ? t('gpPay') : 'Оплатить');
            window._gpMethod = m.dataset.m;
          }
          if(first){ first.classList.add('on'); selectM(first); }
          // Алла 25.06: тап по методу = СРАЗУ оплата (методы — кнопки оплаты, не селекторы).
          if(!methods._w){ methods._w=1; methods.addEventListener('click', function(e){ var m=e.target.closest('.method'); if(m && !m.classList.contains('hide')){ selectM(m); _gpPay(); } }); }
          // Отдельная «Оплатить» больше не нужна — оплата запускается тапом по методу. Прячем через
          // !important (CSS .pay имеет display с !important), но обработчик оставляем — не «мёртвая» кнопка.
          var payBtn = document.getElementById('gpPayBtn');
          if(payBtn){ payBtn.style.setProperty('display','none','important'); if(!payBtn._w){ payBtn._w=1; payBtn.addEventListener('click', _gpPay); } }
          var copyBtn = document.getElementById('gpDoneCopy'); if(copyBtn && !copyBtn._w){ copyBtn._w=1; copyBtn.addEventListener('click', function(){ var c=document.getElementById('gpDoneCode'); if(c && window._copyToClipboard){ window._copyToClipboard(c.textContent.trim()); this.textContent = (typeof t==='function'?t('gpCodeCopied'):'Код скопирован ✓'); } }); }
          var shareBtn = document.getElementById('gpDoneShare'); if(shareBtn && !shareBtn._w){ shareBtn._w=1; shareBtn.addEventListener('click', function(){ var c=document.getElementById('gpDoneCode'); _gpShareCode(c?c.textContent.trim():''); }); }
        };
        // Экран пополнения Искр (#topupPage) — дизайн showcase-topup.html (закон №46).
        // Платёжная логика переиспользует window.showIskryPackPayment (planConfirmOverlay).
        window._initTopupPage = function(){
      // Натив (22.09.2026): цены из App Store подставляются заново при каждом входе на экран —
      // обёртка над applyTranslations/loadRubPrices не срабатывала, и подписки оставались без цены.
      try { if (typeof _nativeApplyPrices === 'function') { setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 0); setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 800); } } catch (_) {}
          var pg = document.getElementById('topupPage'); if(!pg) return;
          var vk = window._isVkMiniApp === true || window._appEnv === 'vk';
          var ok = (window._isOkMiniApp === true || window._appEnv === 'ok'); // OK-веб: оплата картой (канон v9)
          // body.in-vk ставится глобально при VK init (стр.254) — здесь только страховка.
          if(vk && !document.body.classList.contains('in-vk')) document.body.classList.add('in-vk');
          // Баланс — тот же механизм, что бейдж профиля.
          var bal = (typeof getIskryBalance === 'function') ? getIskryBalance() : 0;
          var unit = (typeof window.iskryPlural === 'function') ? window.iskryPlural(bal) : 'Искр';
          var balEl = document.getElementById('tuBalanceVal'); if(balEl) balEl.textContent = bal + ' ' + unit;
          var topups = document.getElementById('tuTopups'), price = document.getElementById('tuPrice');
          // Канон v9 (отказы VK 27.07 и ОК 29.07): ни голоса, ни ОКи — наш продукт
          // признан цифровым товаром, значит везде одна ₽-цена (карта T-Bank).
          // data-vote/data-oki в разметке больше не читаются.
          // На нативе ₽ из data-rub показывать нельзя: цену назначает Apple и
          // показывает её на своём экране покупки, а ₽ рядом с кнобкой читается
          // как второй способ оплаты (правило 3.1.1). ₽-спаны в плитках закрыты
          // атрибутом data-web-only, но эта строка брала цену из атрибута и
          // проходила мимо гейта — нашлось обходом всех экранов. Показываем,
          // сколько Искр добавится.
          function curPrice(t){
            if (window._isNativeApp) {
              var _b = t.querySelector('.ta b');
              return _b ? _b.textContent.trim().replace(/^\+/, '') : '';
            }
            return t.dataset.rub;
          }
          // Первая ВИДИМАЯ плитка (пакет-100 скрыт на всех платформах — у него нет ₽-цены).
          function firstVisible(){ var list = topups.querySelectorAll('.topup'); for (var i = 0; i < list.length; i++) { if (getComputedStyle(list[i]).display !== 'none') return list[i]; } return null; }
          function sync(){ var sel = topups.querySelector('.topup.sel') || firstVisible(); if(sel && price) price.textContent = curPrice(sel); }
          if(!topups._w){ topups._w = 1; topups.addEventListener('click', function(e){ var t = e.target.closest('.topup'); if(!t) return; this.querySelectorAll('.topup').forEach(function(x){ x.classList.toggle('sel', x===t); }); sync(); }); }
          sync();
          var cta = document.getElementById('tuCta');
          if(cta && !cta._w){ cta._w = 1; cta.addEventListener('click', function(){
            var sel = topups.querySelector('.topup.sel') || topups.querySelector('.topup'); if(!sel) return;
            // Канон v9: внутренних валют нет нигде — и на ОК пакет продаётся картой в ₽.
            if (window.showIskryPackPayment) window.showIskryPackPayment(sel.dataset.sku);
          }); }
          if(typeof applyTranslations === 'function') applyTranslations();
        };
        // Канон v8 (отказ 27.07): на VK витрина Искр говорит про вопросы Оракулу,
        // не про песни. Песни на VK покупаются картой отдельно (§5.4.1), поэтому
        // «1000 Искр ≈ 10 песен» там читается как обмен виртуального на цифровое —
        // ровно то, что модератор снял скриншотом. Вызывается из applyTranslations
        // ПОСЛЕДНИМ: иначе смена языка возвращает песенные тексты по data-i18n.
        window._vkPackTexts = function(){
          var _vk = window._isVkMiniApp === true || window._appEnv === 'vk'
            || document.documentElement.classList.contains('is-vk')
            || document.body.classList.contains('in-vk');
          if (!_vk) return;
          var _q = (typeof t === 'function' ? t('iskryPackQuestions') : '') || 'вопросов Оракулу';
          var _bal = document.querySelector('#topupPage .bh-k');
          if (_bal) _bal.textContent = (typeof t === 'function' ? t('tuBalanceVk') : '') || 'на твоём балансе · 1 вопрос Оракулу = 1 Искра';
          var _packQ = { iskry_pack_1000: 1000, iskry_pack_2000: 2000, iskry_pack_5000: 5000 };
          var _tiles = document.querySelectorAll('#topupPage .topup');
          for (var i = 0; i < _tiles.length; i++) {
            var _n = _packQ[_tiles[i].dataset.sku];
            var _sm = _tiles[i].querySelector('.ta small');
            if (_n && _sm) _sm.textContent = '≈ ' + _n + ' ' + _q;
          }
        };
        window._initPlansPage = function(){
      // Натив (22.09.2026): цены из App Store подставляются заново при каждом входе на экран —
      // обёртка над applyTranslations/loadRubPrices не срабатывала, и подписки оставались без цены.
      try { if (typeof _nativeApplyPrices === 'function') { setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 0); setTimeout(function(){ try { _nativeApplyPrices(); } catch (_) {} }, 800); } } catch (_) {}
          var pg = document.getElementById('plansPage'); if(!pg) return;
          var vk = window._isVkMiniApp === true || window._appEnv === 'vk';
          if(vk && !document.body.classList.contains('in-vk')) document.body.classList.add('in-vk');
          // Баланс — тот же механизм, что бейдж профиля / topup.
          var bal = (typeof getIskryBalance === 'function') ? getIskryBalance() : 0;
          var unit = (typeof window.iskryPlural === 'function') ? window.iskryPlural(bal) : 'Искр';
          var balEl = document.getElementById('plansBalanceVal'); if(balEl) balEl.textContent = bal + ' ' + unit;
          if(typeof applyTranslations === 'function') applyTranslations();
          // Цены карточек (₽/USD) + VK-формулировки пакетов — после переводов.
          if(typeof window.loadRubPrices === 'function') window.loadRubPrices();
          // Разовые: «100 Искр · {деньги}» по типу (single 490₽/$5.99, couple 890₽/$8.99, transit 590₽/$6.99)
          try {
            var _lpk = window._currentLang || 'ru';
            // КАНОН v9 (отказы VK 27.07 и ОК 29.07): внутренних валют нет ни на одной
            // площадке. Ветка «цена в голосах» и строка bsVkVotes удалены целиком —
            // модерация скрейпит исходник, мёртвая строка читается как живой оффер
            // (прецедент с крипто-маркерами). На VK/OK контент — только «100 Искр».
            var _vkStubCtx = window._isVkMiniApp || window._appEnv === 'vk'
              || document.documentElement.classList.contains('is-vk')
              || document.body.classList.contains('in-vk');
            var _iu = (typeof window.iskryPlural === 'function') ? window.iskryPlural(100) : ((typeof t==='function'?t('iskryUnit'):'') || 'Искр');
            [['plansBuy1Price',490,'5.99'],['plansBuy2Price',890,'8.99'],['plansBuy3Price',590,'6.99']].forEach(function(b){
              var el=document.getElementById(b[0]); if(!el) return;
              var money = (_lpk==='ru' ? (b[1]+' \u20bd') : ('$'+b[2]));
              // OK: \u0434\u0435\u043d\u044c\u0433\u0438 (\u20bd/$) \u0437\u0430\u043f\u0440\u0435\u0449\u0435\u043d\u044b \u00a75.4-OK \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u00ab100 \u0418\u0441\u043a\u0440\u00bb \u0431\u0435\u0437 \u0434\u0435\u043d\u0435\u0436\u043d\u043e\u0433\u043e \u0445\u0432\u043e\u0441\u0442\u0430.
              var _okb = (window._isOkMiniApp === true || window._appEnv === 'ok');
              // Натив: денежный хвост запрещён по той же причине, что и на ОК —
              // покупка идёт встроенной, цену назначает Apple, а $ рядом с
              // Искрами читается как второй способ оплаты (правило 3.1.1).
              el.textContent = (_okb || _vkStubCtx || window._isNativeApp) ? ('100 ' + _iu) : ('100 ' + _iu + ' \u00b7 ' + money);
            });
          } catch(_) {}
        };
        window._initGiftPage=function(){
          var pre=window._giftSong||null; window._giftSong=null;
          renderRecips(); setTo('');
          // надёжно грузим свои готовые песни (не зависим от плейлиста/радио), потом показываем
          window._loadGiftSongs().then(function(){ useGiftSong(pre); });
          var inp=document.getElementById('giftDediInput'); if(inp){ inp.value=''; syncDedi(); if(!inp._w){ inp._w=1; inp.addEventListener('input',syncDedi); } }
          var pr=document.getElementById('giftPresets'); if(pr&&!pr._w){ pr._w=1; pr.addEventListener('click',function(e){ var c=e.target.closest('.dedi-chip'); if(!c) return; var inp=document.getElementById('giftDediInput'); inp.value=c.textContent.trim(); syncDedi(); }); }
          var dl=document.getElementById('giftDeliver'); if(dl&&!dl._w){ dl._w=1; dl.addEventListener('click',function(e){ var d=e.target.closest('.dlv'); if(!d) return; dl.querySelectorAll('.dlv').forEach(function(x){x.classList.toggle('sel',x===d);}); state.deliver=d.dataset.d; }); }
          var send=document.getElementById('giftSendBtn'); if(send&&!send._w){ send._w=1; send.addEventListener('click',doSend); }
          var cl=document.getElementById('giftDoneCloseBtn'); if(cl&&!cl._w){ cl._w=1; cl.addEventListener('click',function(){ var ov=document.getElementById('giftDoneOv'); if(ov)ov.classList.remove('show'); if(window.goBack)goBack(); }); }
          var cpv=document.getElementById('giftDoneCopyBtn'); if(cpv&&!cpv._w){ cpv._w=1; cpv.addEventListener('click',function(){ var lk=document.getElementById('giftDoneLink'); var u=lk?lk.textContent:''; if(u&&window._copyToClipboard){ window._copyToClipboard(u); if(window.showToast)showToast(t('giftLinkCopied')); } }); }
          _giftSetupDeliver();
          var anOk=document.getElementById('giftAddNameOk'); if(anOk&&!anOk._w){ anOk._w=1; anOk.addEventListener('click',_giftCommitAddName); }
          var anInp=document.getElementById('giftAddNameInput'); if(anInp&&!anInp._w){ anInp._w=1; anInp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); _giftCommitAddName(); } }); }
          window._giftSong=null;
        };
        // Доставка кода близкому по выбранному способу (ссылка/TG/QR → шарим ссылку с ?gift=КОД).
        // КАНОН v4 (11.07, §4.1.8): на VK ссылка подарка ВНУТРЕННЯЯ — vk.com/app…#gift=КОД
        // (хэш-парс при старте по аналогии с #ref=); внешний yupsoul.ru с VK не уходит.
        function _giftLink(code){
          if (window._isVkMiniApp === true || window._appEnv === 'vk') return 'https://vk.com/app54531891#gift=' + code;
          return (window.WEBAPP_URL||'https://yupsoul.ru').replace(/\/$/,'')+'/?gift='+code;
        }
        function _giftRenderQr(slot,text){ try{ slot.innerHTML=''; if(typeof qrcode!=='function') return; var qr=qrcode(0,'M'); qr.addData(String(text)); qr.make(); var n=qr.getModuleCount(),cell=4,sz=n*cell; var cv=document.createElement('canvas'); cv.width=sz; cv.height=sz; var c=cv.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,sz,sz); c.fillStyle='#0a0612'; for(var r=0;r<n;r++)for(var col=0;col<n;col++){ if(qr.isDark(r,col)) c.fillRect(col*cell,r*cell,cell,cell); } cv.style.borderRadius='10px'; slot.appendChild(cv); }catch(_){} }
        // Доставка по ВЫБРАННОМУ способу. Ссылка ВСЕГДА видна в overlay (юзер сам отправит, ничего не «улетает» само).
        function deliverGift(code){
          var url=_giftLink(code); var way=state.deliver||'link'; var env=(window._appEnv)||'tg';
          var linkEl=document.getElementById('giftDoneLink'); if(linkEl) linkEl.textContent=url;
          var qrWrap=document.getElementById('giftDoneQr'); if(qrWrap){ qrWrap.style.display='none'; qrWrap.innerHTML=''; }
          if(way==='qr'){ if(qrWrap){ qrWrap.style.display='flex'; _giftRenderQr(qrWrap,url); } return; }
          if(way==='tg' && env==='tg'){ var tg=window.Telegram&&window.Telegram.WebApp; if(tg&&tg.openTelegramLink){ try{ tg.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent((t('giftDeliverShareText',{url:''})||'').trim())); return; }catch(_){} } }
          // «Ссылкой» и прочее — копируем (ссылка видна в overlay, юзер сам вставит куда хочет)
          if(window._copyToClipboard){ window._copyToClipboard(url); if(window.showToast) showToast(t('giftLinkCopied')); }
        }
        // «Как подарить» адаптивно: Telegram-кнопка только в Telegram (на VK/OK/web скрыта — там телеграма нет).
        function _giftSetupDeliver(){
          var env=(window._appEnv)||'tg';
          var dl=document.getElementById('giftDeliver'); if(!dl) return;
          var tgBtn=dl.querySelector('[data-d="tg"]');
          if(tgBtn) tgBtn.style.display=(env==='tg')?'':'none';
          if(state.deliver==='tg' && env!=='tg'){ state.deliver='link'; dl.querySelectorAll('.dlv').forEach(function(x){x.classList.toggle('sel',x.dataset.d==='link');}); }
        }
        async function doSend(){
          if(!state.song||!state.song.id){
            if(!completedSongs().length){ if(window.goToPage)goToPage('homePage'); return; } // нет готовых песен → ведём создавать
            if(window.showToast)showToast(t('giftSelectFirst')); return;
          }
          var base=apiBase(); if(!base||!hasAuth()) return;
          if(typeof window._ensureOnline==='function'&&!window._ensureOnline()) return;
          var send=document.getElementById('giftSendBtn'); if(send)send.disabled=true;
          var inp=document.getElementById('giftDediInput');
          var body=JSON.stringify({ song_request_id:state.song.id, to_name:state.toName, dedication:inp?inp.value.trim():'' });
          try{
            var resp=await (window.fetchWithTimeout?window.fetchWithTimeout(base+'/api/gift/create-existing',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},getAuthHeaders()),body:body},25000):fetch(base+'/api/gift/create-existing',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},getAuthHeaders()),body:body}));
            var j=await resp.json().catch(function(){return {};});
            if(resp.ok&&j.ok&&j.gift_code){
              state.code=j.gift_code;
              deliverGift(j.gift_code);
              var nm=songName(state.song);
              var tt=document.getElementById('giftDoneText'); if(tt)tt.textContent=t('giftDoneText',{name:nm,to:state.toName||t('giftToLovedOne')});
              var ov=document.getElementById('giftDoneOv'); if(ov)ov.classList.add('show');
              if(typeof window._refreshIskryBalance==='function') window._refreshIskryBalance();
            } else { if(window.showToast)showToast((typeof t==='function'&&j.error_code?t(j.error_code):'')||(j.error||t('giftFailed'))); }
          }catch(e){ console.warn('[gift] send',e); }
          if(send)send.disabled=false;
        }

        // ── #giftRedeemPage ──
        var grGift=null;
        function grConfetti(n){ var layer=document.getElementById('grCfLayer'); if(!layer) return; var cols=['#f7cf7a','#f3d9a0','#e8b96a','#fff0c2','#f7b6d6','#cda9f5']; for(var i=0;i<n;i++){ (function(i){ var c=document.createElement('span'); c.className='cf'; c.style.left=Math.random()*100+'%'; c.style.background=cols[i%cols.length]; c.style.setProperty('--dur',(2.2+Math.random()*1.8)+'s'); c.style.setProperty('--del',(Math.random()*.5)+'s'); c.style.setProperty('--rot',(Math.random()*720-360)+'deg'); if(Math.random()<.4)c.style.borderRadius='50%'; layer.appendChild(c); requestAnimationFrame(function(){ c.classList.add('go'); }); setTimeout(function(){ c.remove(); },4600); })(i); } }
        window._giftPlaySong=function(song){ try{ if(window._giftAudio)window._giftAudio.pause(); window._giftAudio=new Audio(window._absMediaUrl(song.audio_url)); window._giftAudio.play().catch(function(){}); if(window.showToast)showToast(t('giftPlaying',{title:song.title||t('giftSongFallback')})); }catch(e){ if(window.showToast)showToast(t('giftSongYours')); } };
        window._openGiftRedeem=async function(code){
          code=String(code||'').trim().toUpperCase(); if(!code) return;
          if(window.goToPage)goToPage('giftRedeemPage');
          var pg=document.getElementById('giftRedeemPage'); if(pg){ pg.dataset.state='sealed'; pg.removeAttribute('data-redeemed'); }
          var base=apiBase();
          try{
            var resp=await (window.fetchWithTimeout?window.fetchWithTimeout(base+'/api/gift/preview/'+encodeURIComponent(code),{},20000):fetch(base+'/api/gift/preview/'+encodeURIComponent(code)));
            var j=await resp.json().catch(function(){return {};});
            if(resp.ok&&j.ok&&j.gift){
              grGift=Object.assign({code:code},j.gift);
              var fs=document.getElementById('grFromSealed'); if(fs)fs.textContent=j.gift.from_name?t('grFromSealedName',{name:j.gift.from_name}):t('grFromSealedDefault');
              var fo=document.getElementById('grFromOpen'); if(fo)fo.textContent=j.gift.from_name?t('grFromOpenName',{name:j.gift.from_name}):t('grFromOpenDefault');
              var dq=document.getElementById('grDediQ'),dby=document.getElementById('grDediBy'),dbox=document.getElementById('grDedicationBox');
              if(j.gift.dedication){ if(dq)dq.textContent='«'+j.gift.dedication+'»'; if(dby)dby.textContent=j.gift.from_name?('— '+j.gift.from_name):''; if(dbox)dbox.style.display=''; } else if(dbox){ dbox.style.display='none'; }
              var isNew=j.gift.kind==='new_song'||j.gift.kind==='promo', fromNm=j.gift.from_name||t('giftFromLovedOne');
              var lead=document.getElementById('grLead'); if(lead)lead.innerHTML=isNew?t('grLeadNew',{name:esc(fromNm)}):t('grLeadExisting',{name:esc(fromNm)});
              var inside=document.getElementById('grInside');
              if(inside)inside.innerHTML=isNew
                ? '<div class="in-row"><span class="in-ic">'+GNOTE+'</span><span class="in-tx"><b>'+t('giftInsidePersonalSong')+'</b><span>'+t('giftInsideByBirthdate')+'</span></span></div><div class="in-row"><span class="in-ic">'+SPARK+'</span><span class="in-tx"><b>'+t('giftInside100')+'</b><span>'+t('giftInside100Sub')+'</span></span></div>'
                : '<div class="in-row"><span class="in-ic">'+GNOTE+'</span><span class="in-tx"><b>'+t('giftSoulSong')+'</b><span>'+t('giftInsideFromName',{name:esc(fromNm)})+'</span></span></div>';
              var note=document.getElementById('grNote'); if(note)note.textContent=isNew?t('grNoteNew'):'';
            } else if(window.showToast){ showToast((typeof t==='function'&&j.error_code?t(j.error_code):'')||t('giftNotFound')); }
          }catch(e){ console.warn('[gift] preview',e); }
          var ob=document.getElementById('grOpenBtn'); if(ob&&!ob._w){ ob._w=1; ob.addEventListener('click',function(){ var pg=document.getElementById('giftRedeemPage'); if(pg)pg.dataset.state='open'; grConfetti(44); setTimeout(function(){grConfetti(22);},450); }); }
          var gb=document.getElementById('grGetBtn'); if(gb&&!gb._w){ gb._w=1; gb.addEventListener('click',function(){ if(grGift&&grGift.kind==='promo'){ _giftStartWithPromo(grGift.promo_code||grGift.code); } else { doRedeem(); } }); }
          var cb=document.getElementById('grCloseBtn'); if(cb&&!cb._w){ cb._w=1; cb.addEventListener('click',function(){ if(window.goToPage)goToPage('homePage'); }); }
          var crb=document.getElementById('grCreateBtn'); if(crb&&!crb._w){ crb._w=1; crb.addEventListener('click',function(){ if(grGift&&grGift.kind==='promo'){ _giftStartWithPromo(grGift.promo_code||grGift.code); return; } if(window.goToPage)goToPage('formPage'); setTimeout(function(){ var b=document.querySelector('.mode-btn[data-mode="single"]'); if(b)b.click(); },120); }); }
        };
        // Промокод-подарок: получатель создаёт СВОЮ песню, код применяется при оплате (free_generation → оплачено промокодом).
        function _giftStartWithPromo(code){
          // §6.12 (канон v4): промокодные подарки (куплены в TG/web) на VK не активируются —
          // промокоды на VK запрещены полностью. Нейтральное сообщение, без уводов.
          if (window._isVkMiniApp === true || window._appEnv === 'vk') {
            if (window.showToast) showToast(t('giftVkUnavail'));
            return;
          }
          try{ window._giftPromoCode = code || null; }catch(_){}
          if(window.goToPage)goToPage('formPage');
          setTimeout(function(){ var b=document.querySelector('.mode-btn[data-mode="single"]'); if(b)b.click(); },120);
          if(window.showToast)showToast(t('giftPromoWillApply'));
        }
        async function doRedeem(){
          if(!grGift) return; var base=apiBase(); if(!base||!hasAuth()){ if(window.showToast)showToast(t('giftLoginToRedeem')); return; }
          var gb=document.getElementById('grGetBtn'); if(gb)gb.disabled=true;
          try{
            var resp=await (window.fetchWithTimeout?window.fetchWithTimeout(base+'/api/gift/redeem',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},getAuthHeaders()),body:JSON.stringify({gift_code:grGift.code})},25000):fetch(base+'/api/gift/redeem',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},getAuthHeaders()),body:JSON.stringify({gift_code:grGift.code})}));
            var j=await resp.json().catch(function(){return {};});
            if(resp.ok&&j.ok){
              if(j.kind==='existing_song'&&j.song&&j.song.audio_url){ window._giftPlaySong(j.song); }
              else if(j.kind==='new_song'){ if(window.showToast)showToast(t('giftIskryCredited',{n:j.iskry_amount||100})); if(typeof window._refreshIskryBalance==='function')window._refreshIskryBalance(); }
              var _pg=document.getElementById('giftRedeemPage'); if(_pg)_pg.setAttribute('data-redeemed','1');
              var _nt=document.getElementById('grNote'); if(_nt)_nt.textContent=t('grRedeemedNote');
            } else { if(window.showToast)showToast((typeof t==='function'&&j.error_code?t(j.error_code):'')||(j.error||t('giftFailed'))); }
          }catch(e){ console.warn('[gift] redeem',e); }
          if(gb)gb.disabled=false;
        }

        // ── вход: deep-link ?gift=CODE (web/TG) ИЛИ #gift=CODE (VK — query занят vk_* параметрами) ──
        try{
          var m=(location.search||'').match(/[?&]gift=([A-Za-z0-9]+)/);
          if(!m) m=(location.hash||'').match(/[#&]gift=([A-Za-z0-9]+)/);
          if(m&&m[1]){ (function(_gc){ setTimeout(function(){ if(window._openGiftRedeem)window._openGiftRedeem(_gc); },1300); })(m[1]); }
        }catch(_){}

        // ── «Поделились песней» — получатель слушает шаренную песню ЦЕЛИКОМ внутри приложения ──
        // ВК/OK deep-link #song=<id>&s=<token>: тянем метаданные по токену и открываем ЭТАЛОННЫЙ
        // экран «Песня открыта» (songOpenedPage → window.openSongOpened) — премиум-плеер из редизайна.
        // НИКАКОГО кастомного оверлея (§46: переиспользуем эталон, не изобретаем). Не-владелец слушает
        // целиком по подписанному аудио-токену; скачивание/подарок на VK уже скрыты (канон v4).
        // Web/TG используют публичную страницу /share/<id>.
        window._openSharedSong=async function(id,token){
          id=String(id||'').trim(); token=String(token||'').trim(); if(!id||!token) return;
          var base=apiBase(),_att=0;
          while(true){
            if(window._ensureOnline&&!window._ensureOnline()){ await new Promise(function(r){ window.addEventListener('online',function o(){ window.removeEventListener('online',o); r(); }); }); continue; }
            try{
              var u=base+'/api/shared-song/'+encodeURIComponent(id)+'?s='+encodeURIComponent(token);
              var resp=await (window.fetchWithTimeout?window.fetchWithTimeout(u,{},20000):fetch(u));
              if(resp.status===403||resp.status===404){ if(window.goToPage)goToPage('homePage'); return; }
              var j=await resp.json().catch(function(){return {};});
              if(resp.ok&&j&&j.audio_url){
                var _shTrack={ id:id, title:j.title||'', name:j.title||'', cover_url:j.cover_url||null, audio_url:j.audio_url, lyrics:j.lyrics||'' };
                window._soSharedMode={ id:id, token:token, locked:!!j.locked };
                if(typeof window.openSongOpened==='function'){
                  window.openSongOpened({ track:_shTrack, shared:true });
                  // Получатель — НЕ владелец: переформулируем эталон «Песня открыта» под шеринг.
                  // Оплаченная → плеер целиком + караоке/слова + «В любимые» + «Создать свою».
                  // Запертая (отрывок 60с) → только «Создать свою». Владельческие кнопки скрыты.
                  setTimeout(function(){ try{
                    var pg=document.getElementById('songOpenedPage'); if(!pg) return;
                    var locked=!!j.locked, hasLyrics=!!(j.lyrics&&String(j.lyrics).trim());
                    var _tl=function(k,fb){ return (typeof t==='function'&&t(k))||fb; };
                    var setD=function(id2,vis){ var e=document.getElementById(id2); if(e) e.style.display=vis?'':'none'; };
                    var eb=pg.querySelector('.eyebrow'); if(eb) eb.textContent=_tl('sharedSongEyebrow','Тебе поделились песней');
                    var ld=pg.querySelector('.lead'); if(ld){ if(locked){ ld.style.display=''; ld.textContent=_tl('sharedLockedLead','Послушай отрывок — 60 секунд. Полную песню открывает автор.'); } else ld.style.display='none'; }
                    var ps=document.getElementById('soPlaySub'); if(ps&&locked) ps.textContent=_tl('sharedLockedSub','Отрывок · 60 сек');
                    setD('soGiftBtn',false); setD('soPackBtn',false); setD('soOptin',false);
                    var ownAct=pg.querySelector('.actions'); if(ownAct) ownAct.style.display='none';
                    var rec=document.getElementById('soRecipActions'); if(rec){ rec.hidden=false; rec.style.display=''; }
                    setD('soFavBtn',!locked); setD('soCreateBtn',locked); setD('soRecipGhosts',!locked);
                    setD('soKaraBtn', !locked&&hasLyrics); setD('soRecipLyrics', !locked&&hasLyrics);
                  }catch(_){} }, 60);
                }
                return;
              }
            }catch(e){ console.warn('[sharedSong] retry',e); }
            _att++; if(_att>=4){ return; }
            await new Promise(function(r){ setTimeout(r,Math.min(20000,1500*Math.pow(1.7,_att))); });
          }
        };
        // «В любимые» на экране получателя → сохранить чужую песню в свою коллекцию (токен-гейт бэка).
        window._soSaveShared=function(){
          var m=window._soSharedMode; if(!m||!m.id||!m.token) return;
          var base=apiBase();
          var hdrs=(typeof getAuthHeaders==='function')?getAuthHeaders():{};
          var f=window.fetchWithTimeout||function(u,o){return fetch(u,o);};
          var btn=document.getElementById('soFavBtn');
          f(base+'/api/tracks/favorite',{ method:'POST', headers:Object.assign({'Content-Type':'application/json'},hdrs), body:JSON.stringify({ trackId:m.id, s:m.token }) },20000)
            .then(function(r){ return r.json().catch(function(){return {};}); })
            .then(function(){ if(typeof showToast==='function') showToast((typeof t==='function'&&t('sharedSavedFav'))||'Добавлено в любимые'); if(btn){ var sp=btn.querySelector('span'); if(sp) sp.textContent=(typeof t==='function'&&t('sharedSavedFavBtn'))||'В любимых'; btn.disabled=true; btn.style.opacity='.6'; } })
            .catch(function(e){ console.warn('[soSaveShared]',e&&e.message); });
        };
        // ── вход: deep-link #song=<id>&s=<token> (ВК/OK кладут параметры в hash) ──
        try{ var _hs=(location.hash||''); var _sid=(_hs.match(/[#&]song=([^&]+)/)||[])[1]; var _stk=(_hs.match(/[#&]s=([^&]+)/)||[])[1]; if(_sid&&_stk){ setTimeout(function(){ if(window._openSharedSong)window._openSharedSong(decodeURIComponent(_sid),_stk); },1300); } }catch(_){}

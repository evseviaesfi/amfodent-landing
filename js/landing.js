/**
 * ЛЕНДИНГ: интерактивность вокруг калькулятора
 * ---------------------------------------------
 * Не трогает и не дублирует логику калькулятора (config/analytics/storage/
 * calculator/app.js) — только использует его публичный API
 * window.AmfodentCalculatorApp (presetGoal, presetKit, goToStep), который
 * подключён отдельным блоком в app.js (см. комментарий в начале того файла).
 *
 * Разделы:
 *   1. Шапка — тень при прокрутке.
 *   2. Скролл-эффект «фото на весь экран» в герое.
 *   3. Блок «Три задачи» → предвыбор шага «Задача» в калькуляторе.
 *   4. Блок «Готовые комплекты» → выбор комплекта и переход к шагу «Состав».
 *   5. Плавающая кнопка «Рассчитать» — видна до входа в калькулятор.
 *   6. Год в подвале.
 *   7. Галерея «Кабинет вживую» — лайтбокс.
 *   8. Появление блоков при прокрутке (.lp-reveal).
 *   9. Короткий «пульс» суммы в калькуляторе при её изменении (только
 *      анимация класса — расчёт и текст по-прежнему выставляет app.js).
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function calcApp() {
    return window.AmfodentCalculatorApp || null;
  }

  function scrollToCalculator() {
    const el = document.getElementById('calculator');
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  ready(function () {
    // ---------- 1. Шапка ----------
    const header = document.querySelector('.lp-header');
    if (header) {
      const onScroll = function () {
        header.classList.toggle('is-scrolled', window.scrollY > 8);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ---------- 2. Скролл-эффект в герое ----------
    const zoom = document.querySelector('.lp-zoom');
    const zoomSticky = zoom ? zoom.querySelector('.lp-zoom__sticky') : null;
    if (zoom && zoomSticky && !prefersReducedMotion()) {
      let targetProgress = 0;
      let shownProgress = 0;
      let rafId = null;

      // Плавное сглаживание: вместо того чтобы гнать CSS-переменные прямо
      // за сырым значением скролла (рывками, «топорно»), на каждый кадр
      // подтягиваем показанное значение к целевому — так движение выглядит
      // инерционным, а не механическим.
      function render() {
        rafId = null;
        shownProgress += (targetProgress - shownProgress) * 0.16;
        if (Math.abs(targetProgress - shownProgress) < 0.0008) shownProgress = targetProgress;

        // Плавная кривая (ease-out) поверх сглаженного прогресса.
        const eased = 1 - Math.pow(1 - shownProgress, 2);

        const growP = Math.max(0, Math.min(1, eased / 0.62));
        const textP = Math.max(0, Math.min(1, (eased - 0.5) / 0.5));

        // Стартовый размер — сразу «как после первого шага» (раньше было 44%/46vh):
        // фото не начинает с маленькой карточки, а растёт меньше и спокойнее.
        const width = 58 + growP * (100 - 58);
        const height = 60 + growP * (100 - 60);
        const radius = 17 - growP * 17;

        zoomSticky.style.setProperty('--zoomw', width + '%');
        zoomSticky.style.setProperty('--zoomh', height + 'vh');
        zoomSticky.style.setProperty('--zoomr', radius + 'px');
        zoomSticky.style.setProperty('--zoomo', String(textP));

        if (Math.abs(targetProgress - shownProgress) > 0.0008) {
          rafId = requestAnimationFrame(render);
        }
      }

      function scheduleRender() {
        if (rafId === null) rafId = requestAnimationFrame(render);
      }

      function onScroll() {
        const rect = zoom.getBoundingClientRect();
        const total = zoom.offsetHeight - window.innerHeight;
        if (total <= 0) return;
        // Прогресс 0..1: 0 — верх блока только показался, 1 — блок прошли целиком.
        targetProgress = Math.max(0, Math.min(1, (-rect.top) / total));
        scheduleRender();
      }

      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    }

    // ---------- 3. Три задачи ----------
    document.querySelectorAll('[data-goal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const app = calcApp();
        const goalId = btn.getAttribute('data-goal');
        if (app && app.presetGoal) app.presetGoal(goalId);
        scrollToCalculator();
      });
    });

    // ---------- 4. Готовые комплекты ----------
    document.querySelectorAll('[data-kit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const app = calcApp();
        const kitId = btn.getAttribute('data-kit');
        if (app && app.presetKit) {
          app.presetKit(kitId);
        } else {
          scrollToCalculator();
        }
      });
    });

    // ---------- 4а. Выбор комплекта в первом экране ----------
    // Цены «от» (установка + компрессор) берём из config.js, чтобы карточки в
    // первом экране и калькулятор всегда показывали одно и то же.
    (function () {
      const C = window.AMFODENT_CONFIG;
      const fmt = window.AmfodentCalculator && window.AmfodentCalculator.formatMoney;
      if (C && C.kits && fmt) {
        document.querySelectorAll('[data-kit-base]').forEach(function (el) {
          const kit = C.kits.filter(function (k) { return k.id === el.getAttribute('data-kit-base'); })[0];
          if (!kit) return;
          const base = C.kitComponents
            .filter(function (c) { return c.required && kit.items[c.id]; })
            .reduce(function (sum, c) { return sum + kit.items[c.id].price; }, 0);
          el.textContent = fmt(base, C);
        });
      }
      const go = document.getElementById('hero-kit-go');
      if (!go) return;
      go.addEventListener('click', function () {
        const picked = document.querySelector('input[name="hero-kit"]:checked');
        const app = calcApp();
        if (picked && app && app.presetKit) app.presetKit(picked.value);
        else scrollToCalculator();
      });
    })();

    // Обычные ссылки-якоря на калькулятор (без пресета)
    document.querySelectorAll('[data-scroll-calc]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToCalculator();
      });
    });

    // ---------- 5. Плавающая кнопка ----------
    const fab = document.querySelector('.lp-fab');
    const hero = document.querySelector('.lp-hero2, .lp-hero-cinematic');
    const calcRoot = document.getElementById('calc-root');
    const mobileBar = document.getElementById('mobile-bar');
    if (fab && hero && calcRoot && 'IntersectionObserver' in window) {
      let pastHero = false;
      let inCalc = false;

      const heroObserver = new IntersectionObserver(function (entries) {
        pastHero = entries[0].boundingClientRect.top < 0;
        updateFab();
      }, { threshold: 0 });
      heroObserver.observe(hero);

      const calcObserver = new IntersectionObserver(function (entries) {
        inCalc = entries[0].isIntersecting;
        updateFab();
      }, { threshold: 0.15 });
      calcObserver.observe(calcRoot);

      function updateFab() {
        fab.classList.toggle('is-visible', pastHero && !inCalc);
        // Нижняя панель суммы калькулятора видна только пока сам
        // калькулятор в зоне видимости — иначе висит поверх остальных
        // секций лендинга с пустой суммой (см. landing.css).
        if (mobileBar) mobileBar.classList.toggle('lp-active', inCalc);
      }
    }

    // ---------- 6. Год в подвале ----------
    const yearEl = document.getElementById('lp-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // ---------- 7. Галерея «Кабинет вживую» — лайтбокс ----------
    (function () {
      const items = Array.prototype.slice.call(document.querySelectorAll('.lp-gallery__item'));
      const lightbox = document.getElementById('lightbox');
      if (!items.length || !lightbox) return;

      const imgEl = document.getElementById('lightbox-img');
      const captionEl = document.getElementById('lightbox-caption');
      const closeBtn = document.getElementById('lightbox-close');
      const prevBtn = document.getElementById('lightbox-prev');
      const nextBtn = document.getElementById('lightbox-next');
      let index = 0;
      let lastFocused = null;

      function show(i) {
        index = (i + items.length) % items.length;
        const el = items[index];
        imgEl.src = el.getAttribute('data-full');
        imgEl.alt = el.querySelector('img') ? el.querySelector('img').alt : '';
        captionEl.textContent = el.getAttribute('data-caption') || '';
      }

      function open(i) {
        lastFocused = document.activeElement;
        show(i);
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
      }

      function close() {
        lightbox.hidden = true;
        document.body.style.overflow = '';
        if (lastFocused && lastFocused.focus) lastFocused.focus();
      }

      items.forEach(function (el, i) {
        el.addEventListener('click', function () { open(i); });
      });

      closeBtn.addEventListener('click', close);
      prevBtn.addEventListener('click', function () { show(index - 1); });
      nextBtn.addEventListener('click', function () { show(index + 1); });

      lightbox.addEventListener('click', function (e) {
        if (e.target === lightbox) close();
      });

      document.addEventListener('keydown', function (e) {
        if (lightbox.hidden) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') show(index - 1);
        if (e.key === 'ArrowRight') show(index + 1);
      });
    })();

    // ---------- 8. Появление блоков при прокрутке ----------
    (function () {
      if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;

      const selectors = [
        '.lp-section__head',
        '.lp-offer-card',
        '.lp-task',
        '.lp-gallery__item',
        '.lp-kit',
        '.lp-step',
        '.lp-trust',
        '.lp-faq details',
        '.lp-brand-group__title'
      ].join(', ');

      // Задержка появления считается по порядку элемента внутри его
      // родителя — так карточки в сетке проявляются друг за другом.
      const counters = new WeakMap();
      const revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          revealObserver.unobserve(entry.target);
          entry.target.classList.add('lp-in');
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll(selectors).forEach(function (el) {
        el.classList.add('lp-reveal');
        const parent = el.parentElement;
        const n = (counters.get(parent) || 0);
        counters.set(parent, n + 1);
        el.style.transitionDelay = Math.min(n, 5) * 65 + 'ms';
        revealObserver.observe(el);
      });
    })();

    // ---------- 9. Пульс суммы при изменении ----------
    (function () {
      if (!('MutationObserver' in window)) return;

      function watchNumber(el) {
        if (!el) return;
        let prev = el.textContent;
        const obs = new MutationObserver(function () {
          if (el.textContent !== prev) {
            prev = el.textContent;
            el.classList.remove('lp-pulse');
            // reflow, чтобы анимацию можно было перезапустить подряд
            void el.offsetWidth;
            el.classList.add('lp-pulse');
          }
        });
        obs.observe(el, { characterData: true, childList: true, subtree: true });
      }

      // Итоговая сумма и диапазон пересоздаются вместе со всей панелью
      // (innerHTML), поэтому следим не за самим числом, а за панелью целиком,
      // и подсвечиваем актуальный элемент суммы после каждой перерисовки.
      function attach(rootId, selector) {
        const root = document.getElementById(rootId);
        if (!root) return;
        const panelObs = new MutationObserver(function () {
          const el = root.querySelector(selector);
          if (el) watchNumber(el);
        });
        panelObs.observe(root, { childList: true, subtree: true });
      }

      attach('summary-panel', '.panel__total-value');
      attach('mobile-bar', '#mobile-bar-total');
    })();

    // ---------- 10. «Почему мы» — модальное окно из героя ----------
    (function () {
      const trigger = document.getElementById('why-trigger');
      const modal = document.getElementById('why-modal');
      const closeBtn = document.getElementById('why-modal-close');
      if (!trigger || !modal) return;

      function open() {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      function close() {
        modal.hidden = true;
        document.body.style.overflow = '';
      }

      trigger.addEventListener('click', open);
      if (closeBtn) closeBtn.addEventListener('click', close);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
      });
      modal.querySelectorAll('[data-close-why]').forEach(function (btn) {
        btn.addEventListener('click', close);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hidden) close();
      });
    })();

    // ---------- 10а. Окно «Консультация инженера» / «Обратный звонок» ----------
    // Короткая форма без калькулятора. Заявка уходит через js/leads.js
    // (Telegram + почта). Если посетитель уже выбрал комплект в калькуляторе,
    // расчёт можно приложить одной галочкой.
    (function () {
      const modal = document.getElementById('consult-modal');
      const form = document.getElementById('consult-form');
      if (!modal || !form) return;
      const done = document.getElementById('consult-done');
      const errorEl = document.getElementById('consult-error');
      const submitBtn = document.getElementById('consult-submit');
      const emailWrap = form.querySelector('.lp-consult__email');
      const attachWrap = form.querySelector('.lp-consult__attach');
      const calcLabel = document.getElementById('consult-calc');
      let lastFocus = null;
      let mode = 'engineer';

      const MODES = {
        engineer: { kicker: 'Консультация инженера', title: 'Перезвоним и ответим на вопросы', sub: 'Инженер подскажет по комплектации, планировке и срокам. Это бесплатно.', subject: 'Консультация инженера' },
        callback: { kicker: 'Обратный звонок', title: 'Перезвоним, когда вам удобно', sub: 'Оставьте номер — менеджер позвонит и ответит на вопросы по оснащению.', subject: 'Обратный звонок' },
        question: { kicker: 'Вопрос инженеру', title: 'Спросите про ваш кабинет', sub: 'Напишите вопрос — инженер ответит удобным для вас способом.', subject: 'Вопрос инженеру' },
        calc: { kicker: 'Ваш расчёт', title: 'Пришлём расчёт, куда удобно', sub: 'Менеджер отправит расчёт с пояснениями и ответит на вопросы. Обязательно только телефон.', subject: 'Расчёт из калькулятора', method: 'Telegram', button: 'Прислать расчёт →' },
        lead: { kicker: 'Заявка', title: 'Подберём кабинет вместе', sub: 'Менеджер свяжется с вами, уточнит задачу и подготовит предложение.', subject: 'Заявка с лендинга' }
      };

      function money(n) {
        const fmt = window.AmfodentCalculator && window.AmfodentCalculator.formatMoney;
        return fmt ? fmt(n, window.AMFODENT_CONFIG) : Math.round(n) + ' ₽';
      }

      // Краткая сводка расчёта, если посетитель уже выбрал комплект.
      function calcSummary() {
        const app = calcApp();
        const C = window.AMFODENT_CONFIG;
        if (!app || !app.getState || !app.getCalculation || !C) return null;
        const st = app.getState();
        if (!st.kit) return null;
        const kit = (C.kits || []).filter(function (k) { return k.id === st.kit; })[0];
        let total = null;
        try { total = app.getCalculation().total; } catch (e) { total = null; }
        let lines = [];
        try {
          lines = window.AmfodentCalculator.describeConfiguration(C, st)
            .map(function (r) { return r.section + ': ' + r.label; });
        } catch (e) { lines = []; }
        return { short: (kit ? kit.label : st.kit) + (total ? ', ~' + money(total) : ''), lines: lines, total: total };
      }

      const whenBox = document.getElementById('consult-when');
      const L = window.AmfodentLeads;
      if (L && L.maskPhone) L.maskPhone(form.elements.phone);

      // «Когда связаться»: варианты зависят от рабочего времени (js/leads.js).
      function renderWhen() {
        const opts = (L && L.contactTimes) ? L.contactTimes()
          : [{ id: 'today', label: 'Сегодня' }, { id: 'days', label: 'В ближайшие дни' }];
        const def = opts.filter(function (o) { return !o.urgent; })[0] || opts[0];
        whenBox.innerHTML = opts.map(function (o) {
          return '<label><input type="radio" name="when" value="' + o.label + '"' +
            (o.urgent ? ' data-urgent="1"' : '') + (o === def ? ' checked' : '') +
            '><span>' + o.label + '</span></label>';
        }).join('');
      }

      function open(m, prefillQuestion) {
        mode = MODES[m] ? m : 'engineer';
        renderWhen();
        const M = MODES[mode];
        document.getElementById('consult-kicker').textContent = M.kicker;
        document.getElementById('consult-title').textContent = M.title;
        document.getElementById('consult-sub').textContent = M.sub;
        submitBtn.textContent = M.button || 'Отправить заявку →';
        form.hidden = false;
        done.hidden = true;
        errorEl.hidden = true;
        form.querySelectorAll('.has-error').forEach(function (el) { el.classList.remove('has-error'); });
        const sum = calcSummary();
        attachWrap.hidden = !sum;
        if (sum) { calcLabel.textContent = sum.short; form.elements.attach.checked = true; }
        if (M.method) {
          const mi = form.querySelector('input[name="method"][value="' + M.method + '"]');
          if (mi) { mi.checked = true; emailWrap.hidden = M.method !== 'Email'; }
        }
        if (prefillQuestion && form.elements.question) form.elements.question.value = String(prefillQuestion).slice(0, 1000);
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('lp-modal-open');
        setTimeout(function () { const f = form.querySelector('input[name="name"]'); if (f) f.focus(); }, 60);
      }
      function close() {
        modal.hidden = true;
        document.body.classList.remove('lp-modal-open');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }

      window.AmfodentConsult = { open: open };

      document.querySelectorAll('[data-consult]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          open(btn.getAttribute('data-consult'));
        });
      });
      document.getElementById('consult-close').addEventListener('click', close);
      document.getElementById('consult-done-close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });

      form.addEventListener('change', function (e) {
        if (e.target.name === 'method') emailWrap.hidden = e.target.value !== 'Email';
        const wrap = e.target.closest('.has-error');
        if (wrap) wrap.classList.remove('has-error');
        if (!form.querySelector('.has-error')) errorEl.hidden = true;
      });
      form.addEventListener('input', function (e) {
        const wrap = e.target.closest('.has-error');
        if (wrap) wrap.classList.remove('has-error');
        if (!form.querySelector('.has-error')) errorEl.hidden = true;
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const v = function (n) { const el = form.elements[n]; return el ? String(el.value || '').trim() : ''; };
        const method = (form.querySelector('input[name="method"]:checked') || {}).value || 'Звонок';
        const whenEl = form.querySelector('input[name="when"]:checked');
        const errors = [];
        const phoneOk = L && L.isPhoneValid ? L.isPhoneValid(v('phone')) : v('phone').replace(/\D/g, '').length >= 10;
        if (!phoneOk) errors.push('phone');
        if (method === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) errors.push('email');
        if (!form.elements.consent.checked) errors.push('consent');
        form.querySelectorAll('.has-error').forEach(function (el) { el.classList.remove('has-error'); });
        if (errors.length) {
          errors.forEach(function (n) { const w = form.querySelector('[data-f="' + n + '"]'); if (w) w.classList.add('has-error'); });
          errorEl.textContent = errors.indexOf('consent') !== -1 && errors.length === 1
            ? 'Отметьте согласие на обработку данных.'
            : 'Проверьте ' + (errors.indexOf('phone') !== -1 ? 'телефон: +7 и 10 цифр' : '') +
              (errors.indexOf('email') !== -1 ? (errors.indexOf('phone') !== -1 ? ' и ' : '') + 'email' : '') + '.';
          errorEl.hidden = false;
          return;
        }
        errorEl.hidden = true;

        const urgent = !!(whenEl && whenEl.getAttribute('data-urgent'));
        const sum = (!attachWrap.hidden && form.elements.attach.checked) ? calcSummary() : null;
        const lead = {
          subject: MODES[mode].subject,
          urgent: urgent,
          replyTo: method === 'Email' ? v('email') : null,
          fields: [
            ['Имя', v('name')],
            ['Телефон', v('phone')],
            ['Email', method === 'Email' ? v('email') : ''],
            ['Способ связи', method],
            ['Когда связаться', whenEl ? whenEl.value : ''],
            ['Вопрос', v('question')],
            ['Расчёт из калькулятора', sum ? sum.lines.join('\n') : ''],
            ['Ориентировочная сумма', sum && sum.total ? money(sum.total) : ''],
            ['Страница', window.location.href]
          ]
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
        const sender = window.AmfodentLeads ? window.AmfodentLeads.send(lead) : Promise.resolve({ delivered: false });
        if (window.AmfodentAnalytics && window.AmfodentAnalytics.trackEvent) {
          try { window.AmfodentAnalytics.trackEvent('consult_submit', { mode: mode, urgent: urgent, method: method }); } catch (err) { /* аналитика не обязательна */ }
        }
        sender.then(function (res) {
          submitBtn.disabled = false;
          submitBtn.textContent = MODES[mode].button || 'Отправить заявку →';
          const ok = !!(res && res.delivered);
          form.hidden = true;
          done.hidden = false;
          document.getElementById('consult-done-kicker').textContent = ok ? 'Готово' : 'Не отправилось';
          document.getElementById('consult-done-title').textContent = ok ? 'Заявка у нас' : 'Не получилось отправить';
          document.getElementById('consult-done-text').textContent = ok
            ? 'Свяжемся ' + (whenEl ? whenEl.value.toLowerCase() : 'сегодня') + ': ' + (method === 'Звонок' ? 'позвоним' : method === 'Email' ? 'напишем на почту' : 'напишем в ' + method) + '. Рабочее время: пн–чт 10:00–18:00, пт 10:00–17:00 по Москве.'
            : 'Похоже, проблема со связью. Позвоните нам — 8 (800) 550-45-35, бесплатно по России.';
          if (ok) form.reset();
          emailWrap.hidden = true;
        });
      });
    })();

    // ---------- 11. Бот-«подогрев»: иконка + сценарий в окне чата ----------
    (function () {
      const trigger = document.getElementById('chat-trigger');
      const win = document.getElementById('chat-window');
      const closeBtn = document.getElementById('chat-close');
      const body = document.getElementById('chat-body');
      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send');
      if (!trigger || !win || !body) return;

      let scriptStarted = false;
      let autoTimer = null;
      let lastGoal = null; // запоминаем ситуацию клиента, чтобы отвечать не шаблонно

      function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      }
      function addTyping() {
        const t = document.createElement('div');
        t.className = 'lp-chat__typing';
        t.innerHTML = '<span></span><span></span><span></span>';
        body.appendChild(t);
        body.scrollTop = body.scrollHeight;
        return t;
      }
      function addBubble(text, who) {
        const b = document.createElement('div');
        b.className = 'lp-chat__bubble' + (who === 'user' ? ' lp-chat__bubble--user' : '');
        b.textContent = text;
        body.appendChild(b);
        body.scrollTop = body.scrollHeight;
        return b;
      }
      function addInlineCta(text, onClick, secondary) {
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'lp-chat__cta' + (secondary ? ' lp-chat__cta--ghost' : '');
        cta.textContent = text;
        cta.addEventListener('click', onClick);
        body.appendChild(cta);
        body.scrollTop = body.scrollHeight;
        return cta;
      }
      async function say(text, typingMs) {
        const t = addTyping();
        await wait(typingMs);
        t.remove();
        addBubble(text);
        await wait(220);
      }

      const REPLIES = [
        { goal: 'new', label: 'Открываю кабинет с нуля' },
        { goal: 'replace', label: 'Обновляю оборудование' },
        { goal: 'expand', label: 'Добавляю рабочее место' },
        { goal: 'browsing', label: 'Пока только интересуюсь' }
      ];
      const HANDOFF = {
        new: 'Отлично! Для нового кабинета обычно берут базовый комплект и докупают по мере надобности — открываю калькулятор с таким сценарием, я на связи, если что-то будет непонятно.',
        replace: 'Понимаю — покажу, что имеет смысл заменить в первую очередь, без остановки всего кабинета. Открываю калькулятор с нужными позициями.',
        expand: 'Хорошо, для нового места важно не задвоить то, что уже есть. Открываю калькулятор — начнём с оборудования под второе кресло.',
        browsing: 'Хорошо, без спешки. Можно просто полистать готовые комплекты для ориентира по ценам — а я останусь на связи, если появятся вопросы.'
      };

      function addQuickReplies() {
        const wrap = document.createElement('div');
        wrap.className = 'lp-chat__quick';
        REPLIES.forEach(function (r) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lp-chat__reply';
          btn.setAttribute('data-goal', r.goal);
          btn.textContent = r.label;
          btn.addEventListener('click', function () { handleReply(r); });
          wrap.appendChild(btn);
        });
        body.appendChild(wrap);
        body.scrollTop = body.scrollHeight;
      }

      async function handleReply(r) {
        body.querySelectorAll('.lp-chat__quick').forEach(function (el) { el.remove(); });
        addBubble(r.label, 'user');
        lastGoal = r.goal;
        await wait(450);

        if (r.goal === 'browsing') {
          await say(HANDOFF.browsing, 1000);
          addInlineCta('Посмотреть комплекты →', function () {
            const kits = document.getElementById('kits');
            if (kits) kits.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          return;
        }

        await say(HANDOFF[r.goal], 1000);
        await wait(400);
        const app = calcApp();
        if (app && app.presetGoal) app.presetGoal(r.goal);
        scrollToCalculator();
        close();
      }

      // ---- Свободный ввод: простое распознавание темы по ключевым словам.
      // Это не ИИ — набор правил, чтобы ответ звучал по делу, а не молчал
      // на непонятный вопрос. На всё, что не распознано, бот честно
      // предлагает передать вопрос живому менеджеру, а не притворяется.
      // Бренды берём прямо из блока «Бренды» на странице — список всегда совпадает с сайтом.
      // Плюс русские написания, которыми их часто пишут в чате.
      const BRAND_ALIASES = {
        'KaVo': ['каво'], 'Sirona': ['сирона'], 'Planmeca': ['планмека', 'планмеко'], 'A-dec': ['адек', 'adec'],
        'Stern Weber': ['стерн', 'штерн', 'stern'], 'Castellini': ['кастеллини', 'кастелини'], 'Anthos': ['антос'],
        'Vatech': ['ватек', 'ватеч'], 'NewTom': ['ньютом', 'нью том'], 'Genoray': ['генорей'], 'Carestream': ['карестрим'],
        'Chirana': ['хирана'], 'Diplomat': ['дипломат'], 'Lifedent': ['лайфдент'], 'Siger': ['сигер'],
        'Ajax': ['аякс'], 'Slovadent': ['словадент'], 'Trident': ['трайдент', 'тридент'], 'Cattani': ['каттани'],
        'MyRay': ['майрей', 'май рей', 'my ray'], 'Tosi': ['този', 'тоси'], 'Ivoclar': ['ивоклар'], 'Delaude': ['делауде', 'делод'], 'Runyes': ['раниес', 'руньес', 'раньес']
      };
      function escapeRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      function brandMentioned(text) {
        const low = text.toLowerCase();
        const names = Array.prototype.map.call(document.querySelectorAll('#brands .lp-brand-chip'), function (el) {
          return el.textContent.replace(/\s*\(.*\)\s*/, '').trim();
        });
        const found = [];
        names.forEach(function (name) {
          if (found.indexOf(name) !== -1) return;
          const variants = [name.toLowerCase()].concat(BRAND_ALIASES[name] || []);
          const hit = variants.some(function (v) {
            return /^[a-z0-9 -]+$/.test(v)
              ? new RegExp('(^|[^a-z])' + escapeRe(v) + '($|[^a-z])').test(low)
              : low.indexOf(v) !== -1;
          });
          if (hit) found.push(name);
        });
        return found;
      }
      function scrollToBrands() {
        const el = document.getElementById('brands');
        if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }

      const INTENTS = [
        {
          // «Дайте телефон», «как с вами связаться»
          test: /телефон|номер|позвонить|звонок|контакт|связат|адрес|где вы/i,
          reply: 'Наш телефон — 8 (800) 550-45-35, бесплатно по России. Работаем пн–чт 10:00–18:00, пт 10:00–17:00. Офис: Санкт-Петербург, Малая Митрофаньевская ул., 5к1. Можно оставить свой номер — перезвоним.',
          cta: 'Позвонить →',
          action: function () { window.location.href = 'tel:+78005504535'; },
          cta2: 'Перезвоните мне →',
          action2: function () { openCallback(); }
        },
        {
          test: /цен|стоимост|сколько сто|бюджет|дорого/i,
          reply: 'Зависит от комплектации, но это займёт всего пару минут — посчитаем вместе прямо здесь?',
          cta: 'Открыть калькулятор →',
          action: function () { scrollToCalculator(); }
        },
        {
          test: /рассрочк|кредит|скидк|акци/i,
          reply: 'Кредит и лизинг можно оформить через наши компании-партнёры, условия у них индивидуальные. При заказе полного комплекта есть корпоративные скидки. Начните с расчёта, а условия менеджер подберёт под сумму.',
          cta: 'Прикинуть сумму →',
          action: function () { scrollToCalculator(); }
        },
        {
          // Конкретный бренд: «есть KaVo?», «работаете с Сироной?»
          test: function (text) { return brandMentioned(text).length > 0; },
          reply: function (text) {
            const b = brandMentioned(text);
            const DEALER = ['Stern Weber', 'Sirona', 'MyRay', 'Tosi', 'Ivoclar', 'Delaude', 'Runyes'];
            const official = b.filter(function (x) { return DEALER.indexOf(x) !== -1; });
            if (official.length === b.length) {
              return 'Да, мы официальный дилер ' + b.join(', ') + '. Подберу модель под ваш кабинет и проверю наличие. Можно сразу оставить телефон.';
            }
            return 'Да, ' + b.join(', ') + ' — в нашем ассортименте. Подберу модель под ваш кабинет и проверю наличие. Полный список брендов — на странице, а можно сразу оставить телефон.';
          },
          cta: 'Все бренды →',
          action: scrollToBrands,
          cta2: 'Оставить телефон →',
          action2: function () { openCallback(); }
        },
        {
          // Общий вопрос о брендах / производителях
          test: /бр[еэ]нд|марк[аиуеой]|производител|фирм[аыуе]|какие\s+(есть\s+)?(установк|кресл|томограф|рентген|визиограф|оборудован)/i,
          reply: 'Мы официальный дилер Stern Weber, Sirona, MyRay, Tosi, Ivoclar, Delaude и Runyes. Также поставляем установки A-dec, KaVo, Planmeca, Castellini и другие; 3D-томографы Vatech, Planmeca, NewTom; рентген и визиографы Trident, Carestream, Genoray. Весь список — в блоке «Бренды».',
          cta: 'Смотреть бренды →',
          action: scrollToBrands
        },
        {
          test: /томограф|клкт|(^|[^а-яё])кт([^а-яё]|$)|3d|рентген|визиограф|датчик|ортопантомограф/i,
          reply: 'Рентген, визиограф или 3D-томограф можно добавить к любому комплекту — в калькуляторе есть отдельный шаг «Рентген и 3D». Бренды — Vatech, Planmeca, Genoray, NewTom и другие.',
          cta: 'Смотреть бренды →',
          action: scrollToBrands,
          cta2: 'Добавить в расчёт →',
          action2: function () { scrollToCalculator(); }
        },
        {
          test: /срок|когда|быстро|долго|доставк/i,
          reply: 'По срокам смотрю индивидуально — зависит от комплектации и наличия на складе. Оставите телефон? Уточню и перезвоню сама.',
          cta: 'Оставить телефон →',
          action: function () { openCallback(); }
        },
        {
          test: /кресл|установк|оборудован|каталог|комплект/i,
          reply: 'Покажу конкретные варианты, а не общий список — так проще сравнить.',
          cta: 'Смотреть комплекты →',
          action: function () {
            const kits = document.getElementById('kits');
            if (kits) kits.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        },
        {
          test: /привет|здравств|добрый день|добрый вечер/i,
          reply: 'Здравствуйте! Расскажете коротко, что у вас за ситуация с кабинетом — открываете новый, обновляете оборудование или расширяетесь?',
          cta: null,
          action: null
        }
      ];
      // «Оставить телефон» — короткое окно обратного звонка вместо всего калькулятора.
      function openCallback() {
        close();
        if (window.AmfodentConsult) window.AmfodentConsult.open('callback');
        else scrollToCalculator();
      }

      // Нераспознанный вопрос: не требуем телефон, а предлагаем, куда пойти дальше,
      // и даём передать вопрос инженеру — текст подставится в форму сам.
      const FALLBACK_REPLIES = [
        'Чтобы ответить точно, передам ваш вопрос инженеру. Или могу сразу показать бренды и готовые комплекты.',
        'Тут лучше ответит инженер — передам ему вопрос. А пока можно посмотреть бренды или прикинуть сумму в калькуляторе.'
      ];
      let fallbackIndex = 0;

      async function respondTo(text) {
        const match = INTENTS.find(function (i) {
          return typeof i.test === 'function' ? i.test(text) : i.test.test(text);
        });
        if (match) {
          await say(typeof match.reply === 'function' ? match.reply(text) : match.reply, 1000);
          if (match.cta) addInlineCta(match.cta, match.action);
          if (match.cta2) addInlineCta(match.cta2, match.action2, true);
          return;
        }
        const reply = FALLBACK_REPLIES[fallbackIndex % FALLBACK_REPLIES.length];
        fallbackIndex++;
        await say(reply, 1100);
        addInlineCta('Задать вопрос инженеру →', function () {
          close();
          if (window.AmfodentConsult) window.AmfodentConsult.open('question', text);
          else scrollToCalculator();
        });
        addInlineCta('Бренды →', scrollToBrands, true);
        addInlineCta('Готовые комплекты →', function () {
          const kits = document.getElementById('kits');
          if (kits) kits.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, true);
      }

      async function handleUserMessage(text) {
        const clean = text.trim();
        if (!clean) return;
        body.querySelectorAll('.lp-chat__quick').forEach(function (el) { el.remove(); });
        addBubble(clean, 'user');
        if (input) input.value = '';
        await wait(400);
        await respondTo(clean);
      }

      if (input && sendBtn) {
        sendBtn.addEventListener('click', function () { handleUserMessage(input.value); });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); handleUserMessage(input.value); }
        });
      }

      async function runScript() {
        await say('Здравствуйте! Я Ксения, инженер-консультант Амфодент. Какая у вас задача?', 1000);
        addQuickReplies();
      }

      function open() {
        win.hidden = false;
        trigger.classList.add('is-active');
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (!scriptStarted) { scriptStarted = true; runScript(); }
      }
      function close() {
        win.hidden = true;
        trigger.classList.remove('is-active');
      }

      trigger.addEventListener('click', function () {
        if (win.hidden) open(); else close();
      });
      if (closeBtn) closeBtn.addEventListener('click', close);

      // Автооткрытие отключено: окно чата всплывало поверх первого экрана
      // и калькулятора. Чат открывается только по кнопке рядом с «Рассчитать».
    })();
  });
})();

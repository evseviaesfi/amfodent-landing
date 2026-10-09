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

        const width = 44 + growP * (100 - 44);
        const height = 46 + growP * (100 - 46);
        const radius = 22 - growP * 22;

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

    // Обычные ссылки-якоря на калькулятор (без пресета)
    document.querySelectorAll('[data-scroll-calc]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToCalculator();
      });
    });

    // ---------- 5. Плавающая кнопка ----------
    const fab = document.querySelector('.lp-fab');
    const hero = document.querySelector('.lp-hero-cinematic');
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
      function addInlineCta(text, onClick) {
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'lp-chat__cta';
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
      const INTENTS = [
        {
          test: /цен|стоимост|сколько сто|бюджет|дорого/i,
          reply: 'Зависит от комплектации, но это займёт всего пару минут — посчитаем вместе прямо здесь?',
          cta: 'Открыть калькулятор →',
          action: function () { scrollToCalculator(); }
        },
        {
          test: /рассрочк|кредит|скидк|акци/i,
          reply: 'Да, есть рассрочка и корпоративные скидки при заказе полного комплекта — точные условия зависят от суммы, посчитаю вместе с вами.',
          cta: 'Прикинуть сумму →',
          action: function () { scrollToCalculator(); }
        },
        {
          test: /срок|когда|быстро|долго|доставк/i,
          reply: 'По срокам смотрю индивидуально — зависит от комплектации и наличия на складе. Оставите телефон? Уточню и перезвоню сама.',
          cta: 'Оставить телефон →',
          action: function () { scrollToCalculator(); }
        },
        {
          test: /кресл|установк|бренд|оборудован|каталог|комплект/i,
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
      const FALLBACK_REPLIES = [
        'Хороший вопрос — тут лучше отвечу предметно, а не общими словами. Оставите телефон? Я на связи весь день и перезвоню сама.',
        'Это лучше обсудить конкретно под ваш случай. Дайте номер — уточню детали и перезвоню сама, без лишних форм.'
      ];
      let fallbackIndex = 0;

      async function respondTo(text) {
        const match = INTENTS.find(function (i) { return i.test.test(text); });
        if (match) {
          await say(match.reply, 1000);
          if (match.cta) addInlineCta(match.cta, match.action);
          return;
        }
        const reply = FALLBACK_REPLIES[fallbackIndex % FALLBACK_REPLIES.length];
        fallbackIndex++;
        await say(reply, 1100);
        addInlineCta('Оставить телефон →', function () { scrollToCalculator(); });
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
        await say('Здравствуйте! Меня зовут Ксения, инженер-консультант Амфодент.', 1100);
        await say('Сюда обычно пишут с одной из похожих ситуаций — открывают кабинет с нуля, обновляют оборудование, добавляют место под нового врача, или пока просто присматриваются.', 1500);
        await say('Расскажете, что из этого про вас? Или просто напишите своими словами — отвечу конкретно.', 1200);
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

      // Автооткрытие один раз — через 15 секунд после загрузки страницы,
      // если посетитель ещё не открыл чат сам.
      autoTimer = setTimeout(function () {
        if (win.hidden) open();
      }, 15000);
    })();
  });
})();

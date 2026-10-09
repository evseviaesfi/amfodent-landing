/**
 * ПРИЛОЖЕНИЕ КАЛЬКУЛЯТОРА
 * ------------------------
 * Состояние, пошаговый рендеринг, навигация, форма заявки.
 * Цены и тексты не хранит — читает из AMFODENT_CONFIG (config.js).
 * Расчёт  → AmfodentCalculator (calculator.js)
 * Хранение → AmfodentStorage (storage.js)
 * События  → AmfodentAnalytics (analytics.js)
 *
 * ОТПРАВКА ЗАЯВКИ: единственная точка — функция submitLead() ниже.
 * Реальный адрес сайта/CRM подставляется там, см. INTEGRATION.md.
 *
 * ПРАВКА ДЛЯ ЛЕНДИНГА-MVP (см. SETUP.md в корне пакета):
 *   Ядро калькулятора (config/analytics/storage/calculator.js и весь этот
 *   файл, кроме двух блоков ниже с пометкой «ЛЕНДИНГ-MVP») не менялось —
 *   это тот же файл, что и в 03_Калькулятор. Добавлено только:
 *   1) отправка заявки в Telegram-чат менеджеров вместо console.log —
 *      временная замена серверного обработчика CRM для демонстрационного
 *      MVP (см. блок TELEGRAM_* ниже и SETUP.md, как получить токен и chat_id);
 *   2) window.AmfodentCalculatorApp.presetGoal(goalId) — позволяет блоку
 *      «Три задачи кабинета» на лендинге предвыбрать шаг «Задача» до того,
 *      как посетитель долистает до калькулятора.
 *   3) Октябрь 2026, по схеме отдела продаж: вместо выбора «класса установки»,
 *      компрессора и стерилизации по отдельности — выбор готового комплекта
 *      (шаг «Комплект»), его состав с галочками (шаг «Состав») и рентген/3D
 *      с множественным выбором и полем обзора томографа (шаг «Рентген и 3D»).
 *   Токен бота — секрет уровня «страница у всех на виду», а не уровня CRM:
 *   он ограничен только отправкой сообщений в один чат. Для реальной
 *   интеграции в OpenCart замените этот блок на LEAD_ENDPOINT с серверным
 *   обработчиком, как описано в INTEGRATION.md.
 */
(function () {
  'use strict';

  const C = AMFODENT_CONFIG;
  const STEPS = C.steps;
  const UI = C.ui;
  const LBL = UI.labels;

  // ---------- DOM ----------

  const root = document.getElementById('calc-root');
  const brandEl = document.getElementById('calc-brand');
  const titleEl = document.getElementById('calc-title');
  const subtitleEl = document.getElementById('calc-subtitle');
  const disclaimerEl = document.getElementById('calc-disclaimer');
  const progressEl = document.getElementById('progress');
  const stepContainer = document.getElementById('step-container');
  const summaryPanel = document.getElementById('summary-panel');
  const mobileBar = document.getElementById('mobile-bar');
  const liveEl = document.getElementById('calc-live');

  let state = createInitialState();
  let mobileBarOpen = false;
  let lastResultTracked = null;
  let submitting = false;

  // =========================================================================
  //  ЛЕНДИНГ-MVP: приём заявки в Telegram (временно, вместо серверной CRM)
  // =========================================================================
  //
  //  1. Создайте бота через @BotFather в Telegram, получите BOT_TOKEN.
  //  2. Добавьте бота в чат/группу менеджеров, получите CHAT_ID
  //     (см. SETUP.md — там пошаговая инструкция).
  //  3. Впишите оба значения ниже. Пока они пустые — заявки, как и в
  //     исходном прототипе, только логируются в консоль браузера.
  //
  const TELEGRAM_BOT_TOKEN = ''; // например: '123456789:AA...'
  const TELEGRAM_CHAT_ID = '';   // например: '-1001234567890'

  function telegramConfigured() {
    return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
  }

  /** Компактный текст заявки для сообщения в Telegram (HTML-разметка Telegram). */
  function formatTelegramMessage(payload) {
    const c = payload.contact;
    const t = payload.totals;
    const lines = [];
    lines.push('<b>Новая заявка с лендинга — Амфодент</b>');
    lines.push('');
    lines.push('<b>Контакт:</b> ' + escapeHtml(c.name) + ', ' + escapeHtml(c.phone));
    if (c.email) lines.push('Email: ' + escapeHtml(c.email));
    if (c.city) lines.push('Город: ' + escapeHtml(c.city));
    lines.push('Способ связи: ' + escapeHtml(c.contactMethodLabel || c.contactMethod || '—'));
    if (c.comment) lines.push('Комментарий: ' + escapeHtml(c.comment));
    lines.push('');
    lines.push('<b>Комплектация:</b>');
    payload.configurationText.forEach(function (row) { lines.push('• ' + escapeHtml(row)); });
    lines.push('');
    lines.push('<b>Ориентировочная сумма:</b> ' + money(t.total));
    lines.push('Диапазон: ' + money(t.rangeMin) + ' — ' + money(t.rangeMax));
    if (t.provisionalPricing) lines.push('⚠ часть цен предварительная, требует проверки по каталогу');
    lines.push('');
    lines.push('Источник: ' + payload.meta.pageUrl);
    return lines.join('\n');
  }

  function sendToTelegram(payload) {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: formatTelegramMessage(payload),
        parse_mode: 'HTML'
      })
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return { delivered: true };
      })
      .catch(function (err) {
        console.warn('[Amfodent] Не удалось отправить заявку в Telegram:', err);
        return { delivered: false, reason: 'telegram_request_failed' };
      });
  }

  // =========================================================================
  //  ЕДИНСТВЕННЫЙ ОБРАБОТЧИК ОТПРАВКИ ЗАЯВКИ
  // =========================================================================
  /**
   * На демо-лендинге заявка уходит в Telegram-чат (см. блок выше), если
   * заполнены TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID. Иначе — как в исходном
   * прототипе — только логируется в консоль. При переносе в OpenCart
   * замените тело функции на запрос к серверному обработчику сайта
   * (LEAD_ENDPOINT ниже) — ключи и токены CRM в клиентский код не добавляйте.
   *
   * @param {object} payload см. buildSubmissionPayload()
   * @returns {Promise<{delivered: boolean, reason?: string}>}
   */
  const LEAD_ENDPOINT = ''; // например: '/index.php?route=extension/module/amfodent_calculator/lead'

  function submitLead(payload) {
    if (telegramConfigured()) {
      return sendToTelegram(payload);
    }
    if (!LEAD_ENDPOINT) {
      console.log('[Amfodent] Объект заявки (отправка не подключена, см. SETUP.md/INTEGRATION.md):', payload);
      return Promise.resolve({ delivered: false, reason: 'endpoint_not_configured' });
    }
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return { delivered: true };
      })
      .catch(function (err) {
        console.warn('[Amfodent] Не удалось отправить заявку:', err);
        return { delivered: false, reason: 'request_failed' };
      });
  }

  // =========================================================================
  //  СОСТОЯНИЕ
  // =========================================================================

  function firstId(list) {
    return (list && list.length) ? list[0].id : null;
  }

  function createInitialState() {
    return {
      step: 1,
      goal: null,
      workplaces: null,
      kit: null,
      kitOptions: [],        // id необязательных позиций комплекта, отмеченных галочкой
      xray: [],              // id позиций рентгена и 3D
      tomographFov: firstId(C.tomographFov.options),
      extras: [],
      services: { extendedServiceInterest: false },
      contact: { name: '', phone: '', email: '', city: '', contactMethod: null, comment: '', consent: false },
      submitted: false,
      lastSubmissionPayload: null
    };
  }

  function validId(list, value) {
    return AmfodentCalculator.findById(list, value) ? String(value) : null;
  }

  function str(value, maxLength) {
    const s = (value == null) ? '' : String(value);
    return maxLength ? s.slice(0, maxLength) : s;
  }

  /** Оставляет из списка только id, которые есть в списке config (в порядке config). */
  function validIds(list, values) {
    const arr = Array.isArray(values) ? values : [];
    return (list || [])
      .filter(function (item) { return arr.indexOf(item.id) !== -1; })
      .map(function (item) { return item.id; });
  }

  function optionalComponents() {
    return C.kitComponents.filter(function (c) { return !c.required; });
  }

  /**
   * Приведение сохранённого состояния к текущей конфигурации.
   * Нужно, потому что config.js меняется (правки цен и опций), а в localStorage
   * может лежать состояние со старыми id или недостижимым номером шага.
   */
  function sanitizeState(saved) {
    const s = createInitialState();
    if (!saved || typeof saved !== 'object') return s;

    s.goal = validId(C.goals, saved.goal);
    s.workplaces = validId(C.workplaces, saved.workplaces);

    s.kit = validId(C.kits, saved.kit);
    s.kitOptions = validIds(optionalComponents(), saved.kitOptions);
    s.xray = validIds(C.xray, saved.xray);
    s.tomographFov = validId(C.tomographFov.options, saved.tomographFov) || s.tomographFov;
    s.extras = validIds(C.extras, saved.extras);

    s.services.extendedServiceInterest = !!(saved.services && saved.services.extendedServiceInterest);

    const contact = saved.contact || {};
    s.contact.name = str(contact.name, 120);
    s.contact.phone = str(contact.phone, 40);
    s.contact.email = str(contact.email, 120);
    s.contact.city = str(contact.city, 120);
    s.contact.comment = str(contact.comment, 2000);
    s.contact.contactMethod = validId(C.contactMethods, contact.contactMethod);
    s.contact.consent = !!contact.consent;

    s.submitted = !!saved.submitted;
    s.lastSubmissionPayload = (saved.lastSubmissionPayload && typeof saved.lastSubmissionPayload === 'object')
      ? saved.lastSubmissionPayload : null;
    if (s.submitted && !s.lastSubmissionPayload) s.submitted = false;

    // Номер шага: в границах и достижимый при текущем выборе.
    let step = parseInt(saved.step, 10);
    if (!isFinite(step)) step = 1;
    step = Math.min(Math.max(step, 1), STEPS.length);
    while (step > 1 && !canProceedFrom(s, step - 1)) step--;
    s.step = step;

    return s;
  }

  function persist() {
    AmfodentStorage.save(state);
  }

  function calc() {
    return AmfodentCalculator.calculate(C, state);
  }

  function money(n) {
    return AmfodentCalculator.formatMoney(n, C);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // =========================================================================
  //  НАВИГАЦИЯ
  // =========================================================================

  /** Можно ли уйти со шага stepNumber дальше (проверка обязательных полей шага). */
  function canProceedFrom(st, stepNumber) {
    const id = STEPS[stepNumber - 1] && STEPS[stepNumber - 1].id;
    switch (id) {
      case 'goal':         return !!st.goal;
      case 'workplaces':   return !!st.workplaces;
      case 'kit':          return !!st.kit;
      default:             return true;
    }
  }

  function canProceed() {
    return canProceedFrom(state, state.step);
  }

  /** Достижим ли шаг n: назад — всегда, вперёд — только если пройдены обязательные шаги. */
  function canReach(n) {
    if (n < 1 || n > STEPS.length) return false;
    if (n <= state.step) return true;
    for (let i = state.step; i < n; i++) {
      if (!canProceedFrom(state, i)) return false;
    }
    return true;
  }

  function goToStep(n, options) {
    if (!canReach(n)) return;
    const opts = options || {};
    state.step = n;
    mobileBarOpen = false;
    persist();
    AmfodentAnalytics.trackEvent('step', {
      step_index: n,
      step_id: STEPS[n - 1].id,
      step_title: STEPS[n - 1].nav
    });
    render();
    if (opts.scroll !== false) scrollToCalculatorTop();
    trackResultIfOnSummary();
  }

  function scrollToCalculatorTop() {
    try {
      const offset = root.getBoundingClientRect().top +
        (window.pageYOffset || document.documentElement.scrollTop || 0) - 12;
      window.scrollTo({
        top: Math.max(0, offset),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  }

  /** Событие «получен итог» — при попадании на последний шаг, без дублей по той же сумме. */
  function trackResultIfOnSummary() {
    if (STEPS[state.step - 1].id !== 'summary') return;
    const c = calc();
    if (c.isEmpty || lastResultTracked === c.total) return;
    lastResultTracked = c.total;
    AmfodentAnalytics.trackEvent('result', {
      total: Math.round(c.total),
      range_min: c.rangeMin,
      range_max: c.rangeMax,
      positions: c.lines.length,
      currency: C.meta.currency
    });
  }

  // =========================================================================
  //  РЕНДЕР: ПРОГРЕСС
  // =========================================================================

  function renderProgress() {
    const items = STEPS.map(function (s, i) {
      const idx = i + 1;
      const isActive = idx === state.step;
      const isDone = idx < state.step;
      const reachable = canReach(idx);
      let cls = 'progress__item';
      if (isActive) cls += ' is-active';
      else if (isDone) cls += ' is-done';
      if (!reachable) cls += ' is-locked';

      return '<li class="' + cls + '">' +
        '<button type="button" class="progress__btn" data-step="' + idx + '"' +
        (reachable && !isActive ? '' : ' disabled') +
        (isActive ? ' aria-current="step"' : '') + '>' +
        '<span class="progress__dot">' + idx + '</span>' +
        '<span class="progress__label">' + escapeHtml(s.nav) + '</span>' +
        '</button></li>';
    }).join('');

    const percent = Math.round((state.step - 1) / (STEPS.length - 1) * 100);

    progressEl.innerHTML =
      '<ol class="progress__list">' + items + '</ol>' +
      '<div class="progress__meter" role="progressbar" aria-valuemin="1" aria-valuemax="' + STEPS.length +
      '" aria-valuenow="' + state.step + '" aria-label="Шаг ' + state.step + ' из ' + STEPS.length + '">' +
      '<div class="progress__meter-fill" style="width:' + percent + '%"></div></div>';

    progressEl.querySelectorAll('.progress__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        goToStep(parseInt(btn.getAttribute('data-step'), 10));
      });
    });
  }

  // =========================================================================
  //  РЕНДЕР: ЭЛЕМЕНТЫ
  // =========================================================================

  /**
   * Карточка выбора. Цена выводится отдельным элементом (не внутри заголовка),
   * поэтому на узких экранах она переносится на новую строку, а не выходит
   * за границы карточки.
   */
  function optionCard(o) {
    const head = '<span class="option__head">' +
      '<span class="option__title">' + escapeHtml(o.title) + '</span>' +
      (o.price ? '<span class="option__price">' + o.price + '</span>' : '') +
      '</span>';

    return '<label class="option' + (o.checked ? ' is-checked' : '') + '">' +
      '<input type="' + o.type + '" name="' + escapeHtml(o.name) + '" value="' + escapeHtml(o.value) + '"' +
      (o.checked ? ' checked' : '') + '>' +
      '<span class="option__box" aria-hidden="true"></span>' +
      '<span class="option__body">' + head +
      (o.meta ? '<span class="option__meta">' + escapeHtml(o.meta) + '</span>' : '') +
      (o.tags ? '<span class="option__tags">' + o.tags + '</span>' : '') +
      '</span></label>';
  }

  function priceHtml(item) {
    if (!item.price) return '<span class="option__free">' + escapeHtml(LBL.priceFree) + '</span>';
    return '<span class="price">' + (item.priceFrom ? 'от ' : '') + money(item.price) + '</span>' +
      (item.scaling === 'perWorkplace'
        ? '<span class="price__unit">' + escapeHtml(LBL.perWorkplace) + '</span>' : '');
  }

  function tag(text, kind) {
    return '<span class="tag tag--' + kind + '">' + escapeHtml(text) + '</span>';
  }

  // =========================================================================
  //  РЕНДЕР: ШАГИ
  // =========================================================================

  function renderStepGoal() {
    return '<div class="option-grid option-grid--3">' + C.goals.map(function (g) {
      return optionCard({
        type: 'radio', name: 'goal', value: g.id, checked: state.goal === g.id,
        title: g.label, meta: g.hint
      });
    }).join('') + '</div>';
  }

  function renderStepWorkplaces() {
    return '<div class="option-grid option-grid--compact">' + C.workplaces.map(function (w) {
      return optionCard({
        type: 'radio', name: 'workplaces', value: w.id, checked: state.workplaces === w.id,
        title: w.label, meta: w.hint
      });
    }).join('') + '</div>';
  }

  function kitItem(comp) {
    const kit = AmfodentCalculator.findById(C.kits, state.kit);
    return kit ? kit.items[comp.id] : null;
  }

  function includesText(item) {
    return (item.includes && item.includes.length) ? LBL.includes + ': ' + item.includes.join(', ') : '';
  }

  function perWorkplaceTag(comp) {
    const n = AmfodentCalculator.workplaceCount(C, state.workplaces);
    return (comp.scaling === 'perWorkplace' && n > 1) ? tag('× ' + n + ' ' + LBL.perWorkplaceShort, 'reco') : '';
  }

  function renderStepKit() {
    return '<div class="option-grid option-grid--kits">' + C.kits.map(function (k) {
      const base = C.kitComponents
        .filter(function (c) { return c.required && k.items[c.id]; })
        .reduce(function (sum, c) { return sum + k.items[c.id].price; }, 0);
      const meta = C.kitComponents
        .filter(function (c) { return c.required && k.items[c.id]; })
        .map(function (c) { return k.items[c.id].label; })
        .join(' + ');
      return optionCard({
        type: 'radio', name: 'kit', value: k.id, checked: state.kit === k.id,
        title: k.label,
        price: '<span class="price">от ' + money(base) + '</span>',
        meta: meta
      });
    }).join('') + '</div>';
  }

  /** Карточка позиции, которая входит в комплект всегда — без галочки. */
  function fixedCard(title, priceHtmlStr, meta, tags) {
    return '<div class="option is-checked is-fixed">' +
      '<span class="option__box" aria-hidden="true"></span>' +
      '<span class="option__body">' +
      '<span class="option__head"><span class="option__title">' + escapeHtml(title) + '</span>' +
      '<span class="option__price">' + priceHtmlStr + '</span></span>' +
      (meta ? '<span class="option__meta">' + escapeHtml(meta) + '</span>' : '') +
      '<span class="option__tags">' + tag(LBL.alwaysIncluded, 'fixed') + (tags || '') + '</span>' +
      '</span></div>';
  }

  function renderStepComposition() {
    const kit = AmfodentCalculator.findById(C.kits, state.kit);
    if (!kit) return '<p class="empty-note">' + escapeHtml(LBL.chooseKitFirst) + '</p>';

    const fixed = C.kitComponents.filter(function (c) { return c.required && kit.items[c.id]; })
      .map(function (c) {
        const item = kit.items[c.id];
        return fixedCard(item.label, priceHtml(item), includesText(item), perWorkplaceTag(c));
      }).join('');

    const optional = optionalComponents().filter(function (c) { return kit.items[c.id]; })
      .map(function (c) {
        const item = kit.items[c.id];
        return optionCard({
          type: 'checkbox', name: 'kit_option', value: c.id,
          checked: state.kitOptions.indexOf(c.id) !== -1,
          title: item.label, price: priceHtml(item), meta: includesText(item),
          tags: perWorkplaceTag(c)
        });
      }).join('');

    return '<p class="step__group-label">' + escapeHtml(kit.label) + ' — ' + escapeHtml(LBL.kitIncluded) + '</p>' +
      '<div class="option-grid option-grid--list">' + fixed + '</div>' +
      '<p class="step__group-label">' + escapeHtml(LBL.kitOptional) + '</p>' +
      '<div class="option-grid option-grid--list">' + optional + '</div>';
  }

  function renderStepXray() {
    const fovCfg = C.tomographFov;
    return '<div class="option-grid option-grid--list">' + C.xray.map(function (item) {
      const checked = state.xray.indexOf(item.id) !== -1;
      if (!item.hasFov) {
        return optionCard({
          type: 'checkbox', name: 'xray', value: item.id, checked: checked,
          title: item.label, price: priceHtml(item)
        });
      }
      const minPrice = Math.min.apply(null, fovCfg.options.map(function (o) { return o.price; }));
      const card = optionCard({
        type: 'checkbox', name: 'xray', value: item.id, checked: checked,
        title: item.label, price: '<span class="price">от ' + money(minPrice) + '</span>',
        meta: checked ? null : LBL.fovHint
      });
      if (!checked) return card;
      const fovs = fovCfg.options.map(function (o) {
        return optionCard({
          type: 'radio', name: 'tomograph_fov', value: o.id,
          checked: state.tomographFov === o.id,
          title: o.label, price: priceHtml(o), meta: o.model || null
        });
      }).join('');
      return card +
        '<div class="option-sub">' +
        '<p class="step__group-label">' + escapeHtml(fovCfg.label) + '</p>' +
        '<div class="option-grid option-grid--compact">' + fovs + '</div></div>';
    }).join('') + '</div>';
  }

  function renderStepExtras() {
    return '<div class="option-grid option-grid--list">' + C.extras.map(function (item) {
      return optionCard({
        type: 'checkbox', name: 'extras', value: item.id,
        checked: state.extras.indexOf(item.id) !== -1,
        title: item.label, price: priceHtml(item)
      });
    }).join('') + '</div>';
  }

  function renderStepServices() {
    const c = calc();
    const svc = C.services;

    function row(label, note, valueHtml) {
      return '<div class="service-row">' +
        '<div class="service-row__main">' +
        '<span class="service-row__title">' + escapeHtml(label) + '</span>' +
        '<span class="service-row__note">' + escapeHtml(note) + '</span>' +
        '</div>' +
        (valueHtml ? '<div class="service-row__value">' + valueHtml + '</div>' : '') +
        '</div>';
    }

    const installValue = !c.installServiceIncluded
      ? '<span class="service-row__pending">' + escapeHtml(C.services.installService.separateLabel) + '</span>'
      : c.equipmentSubtotal > 0
      ? '<span class="price price--lg">' + money(c.installServiceAmount) + '</span>' +
        '<span class="price__unit">' + escapeHtml(svc.installService.currentPrefix) + '</span>'
      : '<span class="service-row__pending">—</span>';

    return '<div class="service-list">' +
      row(svc.delivery.label, svc.delivery.note, '<span class="service-row__pending">отдельно</span>') +
      row(svc.installService.label, svc.installService.note, installValue) +
      row(svc.warrantyInfo.label, svc.warrantyInfo.note, '') +
      '</div>' +
      '<div class="service-extra">' +
      optionCard({
        type: 'checkbox', name: 'extended_service', value: svc.extendedService.id,
        checked: state.services.extendedServiceInterest,
        title: svc.extendedService.label, meta: svc.extendedService.note
      }) +
      '</div>';
  }

  // ---------- Расшифровка ----------

  function renderBreakdownTable(c) {
    if (c.isEmpty) {
      return '<p class="empty-note">' + escapeHtml(LBL.emptyBreakdown) + '</p>';
    }

    const rows = c.lines.map(function (l) {
      return '<tr>' +
        '<td class="breakdown__main">' +
        '<span class="breakdown__group">' + escapeHtml(l.group) + '</span>' +
        '<span class="breakdown__label">' + escapeHtml(l.label) +
        (l.provisional
          ? ' <span class="tag tag--provisional" title="' + escapeHtml(LBL.provisionalTitle) + '">' +
            escapeHtml(LBL.provisionalShort) + '</span>'
          : '') +
        '</span></td>' +
        '<td class="num" data-label="' + escapeHtml(LBL.quantity) + '">' + l.quantity + '</td>' +
        '<td class="num" data-label="' + escapeHtml(LBL.unitPrice) + '">' + money(l.unitPrice) + '</td>' +
        '<td class="num" data-label="' + escapeHtml(LBL.lineTotal) + '">' + money(l.total) + '</td>' +
        '</tr>';
    }).join('');

    const installLabel = LBL.equipmentTotal;
    const installNote = c.installServicePercent + '%' +
      (c.installServiceAtMinimum ? ', применён минимум ' + money(c.installServiceMin) : '');

    return '<div class="breakdown-wrap"><table class="breakdown">' +
      '<thead><tr>' +
      '<th>' + escapeHtml(LBL.position) + '</th>' +
      '<th class="num">' + escapeHtml(LBL.quantity) + '</th>' +
      '<th class="num">' + escapeHtml(LBL.unitPrice) + '</th>' +
      '<th class="num">' + escapeHtml(LBL.lineTotal) + '</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot>' +
      '<tr><td colspan="3">' + escapeHtml(installLabel) + '</td>' +
      '<td class="num">' + money(c.equipmentSubtotal) + '</td></tr>' +
      (c.installServiceIncluded
        ? '<tr><td colspan="3">' + escapeHtml(C.services.installService.label) +
          ' <span class="breakdown__hint">' + escapeHtml(installNote) + '</span></td>' +
          '<td class="num">' + money(c.installServiceAmount) + '</td></tr>'
        : '<tr><td colspan="3">' + escapeHtml(C.services.installService.label) + '</td>' +
          '<td class="num">' + escapeHtml(C.services.installService.separateLabel) + '</td></tr>') +
      '<tr class="breakdown__total"><td colspan="3">' + escapeHtml(LBL.grandTotal) + '</td>' +
      '<td class="num">' + money(c.total) + '</td></tr>' +
      '</tfoot></table></div>';
  }

  function renderRangeBox(c) {
    if (c.isEmpty) return '';
    return '<div class="range-box">' +
      '<div class="range-box__head">' +
      '<span class="range-box__label">' + escapeHtml(LBL.rangeTitle) + '</span>' +
      '<span class="range-box__hint">−' + c.rangeMinusPercent + '% … +' + c.rangePlusPercent + '%</span>' +
      '</div>' +
      '<div class="range-box__value">' + money(c.rangeMin) + ' — ' + money(c.rangeMax) + '</div>' +
      '</div>';
  }

  function renderClarify(c) {
    if (!c.clarifyNotes.length) return '';
    return '<div class="clarify">' +
      '<span class="clarify__title">' + escapeHtml(LBL.clarifyTitle) + '</span>' +
      '<ul class="clarify__list">' + c.clarifyNotes.map(function (n) {
        return '<li>' + escapeHtml(n) + '</li>';
      }).join('') + '</ul></div>';
  }

  function renderStepSummary() {
    const c = calc();
    return '<div class="summary-block">' +
      renderBreakdownTable(c) +
      renderRangeBox(c) +
      renderClarify(c) +
      '<p class="disclaimer disclaimer--inline">' + escapeHtml(C.meta.disclaimer) + '</p>' +
      '</div>' +
      '<hr class="divider">' +
      (state.submitted ? renderSubmittedPreview() : renderForm());
  }

  // ---------- Форма ----------

  function fieldError(name) {
    return '<span class="field__error" id="err-' + name + '" hidden></span>';
  }

  function textField(name, cfg, inputType, value, extraAttrs) {
    return '<label class="field" data-field="' + name + '">' +
      '<span class="field__label">' + escapeHtml(cfg.label) +
      (cfg.required
        ? ' <span class="field__required" aria-hidden="true">' + escapeHtml(LBL.required) + '</span>'
        : ' <span class="field__optional">' + escapeHtml(LBL.optional) + '</span>') +
      '</span>' +
      '<input type="' + inputType + '" id="f-' + name + '" ' +
      'placeholder="' + escapeHtml(cfg.placeholder || '') + '" ' +
      (extraAttrs || '') +
      'value="' + escapeHtml(value) + '">' +
      fieldError(name) + '</label>';
  }

  function renderForm() {
    const F = UI.form;
    const emailRequired = isEmailRequired();

    const methods = C.contactMethods.map(function (m) {
      return optionCard({
        type: 'radio', name: 'contact_method', value: m.id,
        checked: state.contact.contactMethod === m.id, title: m.label
      });
    }).join('');

    return '<form id="lead-form" novalidate>' +
      '<h3 class="form-title">' + escapeHtml(F.title) + '</h3>' +
      '<p class="form-note">' + escapeHtml(F.note) + '</p>' +

      '<div class="field-row">' +
      textField('name', F.fields.name, 'text', state.contact.name, 'maxlength="120" autocomplete="name" ') +
      textField('phone', F.fields.phone, 'tel', state.contact.phone, 'maxlength="40" autocomplete="tel" ') +
      '</div>' +

      '<div class="field-row">' +
      '<label class="field" data-field="email">' +
      '<span class="field__label">' + escapeHtml(F.fields.email.label) +
      '<span class="field__required' + (emailRequired ? '' : ' is-hidden') + '" id="email-required" aria-hidden="true"> ' +
      escapeHtml(LBL.required) + '</span>' +
      '<span class="field__optional' + (emailRequired ? ' is-hidden' : '') + '" id="email-optional"> ' +
      escapeHtml(LBL.optional) + '</span></span>' +
      '<input type="email" id="f-email" maxlength="120" autocomplete="email" ' +
      'placeholder="' + escapeHtml(F.fields.email.placeholder) + '" ' +
      'value="' + escapeHtml(state.contact.email) + '">' +
      fieldError('email') + '</label>' +
      textField('city', F.fields.city, 'text', state.contact.city, 'maxlength="120" autocomplete="address-level2" ') +
      '</div>' +

      '<div class="field" data-field="contactMethod">' +
      '<span class="field__label">' + escapeHtml(F.fields.contactMethod.label) +
      ' <span class="field__required" aria-hidden="true">' + escapeHtml(LBL.required) + '</span></span>' +
      '<div class="option-grid option-grid--compact">' + methods + '</div>' +
      fieldError('contactMethod') +
      '</div>' +

      '<label class="field" data-field="comment">' +
      '<span class="field__label">' + escapeHtml(F.fields.comment.label) +
      ' <span class="field__optional">' + escapeHtml(LBL.optional) + '</span></span>' +
      '<textarea id="f-comment" rows="3" maxlength="2000" ' +
      'placeholder="' + escapeHtml(F.fields.comment.placeholder) + '">' +
      escapeHtml(state.contact.comment) + '</textarea></label>' +

      '<div class="field field--consent" data-field="consent">' +
      optionCard({
        type: 'checkbox', name: 'consent', value: 'consent',
        checked: state.contact.consent, title: F.consentLabel
      }) +
      fieldError('consent') +
      '</div>' +

      '<p class="form-error" id="form-error" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn--primary btn--wide" id="submit-btn">' +
      escapeHtml(UI.buttons.submit) + '</button>' +
      '</form>';
  }

  function renderSubmittedPreview() {
    const payload = state.lastSubmissionPayload || {};
    const json = escapeHtml(JSON.stringify(payload, null, 2));
    const S = UI.submitted;
    return '<div class="submitted">' +
      '<p class="submitted__title">' + escapeHtml(S.title) + '</p>' +
      '<p class="submitted__note">' + escapeHtml(S.note) + '</p>' +
      '<details class="submitted__details">' +
      '<summary>' + escapeHtml(S.payloadTitle) + '</summary>' +
      '<pre class="submitted__json">' + json + '</pre>' +
      '</details>' +
      '<button type="button" class="btn btn--ghost" id="refill-btn">' +
      escapeHtml(UI.buttons.refill) + '</button>' +
      '</div>';
  }

  // ---------- Каркас шага ----------

  function renderStep() {
    const stepFns = {
      goal: renderStepGoal,
      workplaces: renderStepWorkplaces,
      kit: renderStepKit,
      composition: renderStepComposition,
      xray: renderStepXray,
      extras: renderStepExtras,
      services: renderStepServices,
      summary: renderStepSummary
    };

    const step = STEPS[state.step - 1];
    const isFirst = state.step === 1;
    const isLast = state.step === STEPS.length;

    stepContainer.innerHTML = '<section class="step">' +
      '<p class="step__counter">Шаг ' + state.step + ' из ' + STEPS.length + '</p>' +
      '<h2 class="step__title">' + escapeHtml(step.title) + '</h2>' +
      (step.subtitle ? '<p class="step__subtitle">' + escapeHtml(step.subtitle) + '</p>' : '') +
      '<div class="step__body">' + stepFns[step.id]() + '</div>' +
      '<div class="step__nav">' +
      '<button type="button" class="btn btn--ghost" id="btn-back"' + (isFirst ? ' disabled' : '') + '>' +
      escapeHtml(UI.buttons.back) + '</button>' +
      (isLast
        ? '<button type="button" class="btn btn--ghost btn--quiet" id="btn-reset">' +
          escapeHtml(UI.buttons.reset) + '</button>'
        : '<button type="button" class="btn btn--primary" id="btn-next"' +
          (canProceed() ? '' : ' disabled') + '>' + escapeHtml(UI.buttons.next) + '</button>') +
      '</div></section>';

    bindStepEvents();
  }

  // =========================================================================
  //  РЕНДЕР: ПАНЕЛЬ РАСЧЁТА
  // =========================================================================

  function renderPanelInner(c) {
    const P = UI.panel;

    const items = c.isEmpty
      ? '<p class="panel__empty">' + escapeHtml(P.empty) + '</p>'
      : '<ul class="panel__items">' + c.lines.map(function (l) {
          return '<li><span class="panel__item-name">' + escapeHtml(l.label) +
            (l.quantity > 1 ? ' × ' + l.quantity : '') + '</span>' +
            '<span class="panel__item-sum">' + money(l.total) + '</span></li>';
        }).join('') + '</ul>';

    const totals = c.isEmpty ? '' :
      '<div class="panel__rows">' +
      '<div class="panel__row"><span>' + escapeHtml(P.equipment) + '</span><span>' +
      money(c.equipmentSubtotal) + '</span></div>' +
      '<div class="panel__row"><span>' + escapeHtml(P.install) + '</span><span>' +
      (c.installServiceIncluded ? money(c.installServiceAmount) : escapeHtml(C.services.installService.separateLabel)) + '</span></div>' +
      '</div>' +
      '<div class="panel__total">' +
      '<span class="panel__total-label">' + escapeHtml(P.total) + '</span>' +
      '<span class="panel__total-value">' + money(c.total) + '</span>' +
      '</div>' +
      '<div class="panel__range">' +
      '<span>' + escapeHtml(P.range) + '</span>' +
      '<strong>' + money(c.rangeMin) + ' — ' + money(c.rangeMax) + '</strong>' +
      '</div>';

    return '<div class="panel__head">' +
      '<span class="panel__title">' + escapeHtml(P.title) + '</span>' +
      (c.provisionalUsed ? tag(P.provisionalBadge, 'provisional') : '') +
      '</div>' +
      items + totals +
      '<p class="disclaimer disclaimer--panel">' + escapeHtml(C.meta.disclaimer) + '</p>';
  }

  function updateSummaries() {
    const c = calc();
    const inner = renderPanelInner(c);

    summaryPanel.innerHTML = '<div class="panel">' + inner + '</div>';

    if (liveEl) {
      liveEl.textContent = c.isEmpty
        ? ''
        : UI.panel.total + ': ' + money(c.total) + '. ' +
          UI.panel.range + ': ' + money(c.rangeMin) + ' — ' + money(c.rangeMax) + '.';
    }

    const totalEl = document.getElementById('mobile-bar-total');
    const bodyEl = document.getElementById('mobile-bar-body');
    const toggleEl = document.getElementById('mobile-bar-toggle');
    const panelEl = document.getElementById('mobile-bar-panel');
    if (!totalEl || !bodyEl || !toggleEl || !panelEl) return;

    totalEl.textContent = c.isEmpty ? '—' : money(c.total);
    bodyEl.innerHTML = '<div class="panel panel--mobile">' + inner + '</div>';

    panelEl.classList.toggle('is-open', mobileBarOpen);
    panelEl.hidden = !mobileBarOpen;
    toggleEl.setAttribute('aria-expanded', mobileBarOpen ? 'true' : 'false');
    mobileBar.classList.toggle('is-open', mobileBarOpen);

    reserveMobileBarSpace();
  }

  /**
   * Нижняя панель зафиксирована у края экрана. Резервируем под контентом её
   * фактическую высоту, чтобы она не перекрывала кнопки «Назад» / «Далее»
   * и итоговую сумму на мобильных экранах.
   */
  function reserveMobileBarSpace() {
    requestAnimationFrame(function () {
      const height = mobileBar.offsetHeight || 0;
      root.style.setProperty('--mobile-bar-h', height + 'px');
    });
  }

  function buildMobileBar() {
    mobileBar.innerHTML =
      '<button type="button" class="mobile-bar__toggle" id="mobile-bar-toggle" ' +
      'aria-expanded="false" aria-controls="mobile-bar-panel">' +
      '<span class="mobile-bar__text">' +
      '<span class="mobile-bar__label">' + escapeHtml(UI.panel.total) + '</span>' +
      '<span class="mobile-bar__total" id="mobile-bar-total">—</span>' +
      '</span>' +
      '<span class="mobile-bar__action">' +
      '<span class="mobile-bar__action-text">' + escapeHtml(UI.panel.detailsToggle) + '</span>' +
      '<span class="mobile-bar__arrow" aria-hidden="true"></span></span>' +
      '</button>' +
      '<div class="mobile-bar__panel" id="mobile-bar-panel" hidden>' +
      '<div id="mobile-bar-body"></div></div>';

    document.getElementById('mobile-bar-toggle').addEventListener('click', function () {
      mobileBarOpen = !mobileBarOpen;
      updateSummaries();
    });
  }

  // =========================================================================
  //  СОБЫТИЯ ШАГА
  // =========================================================================

  function bindStepEvents() {
    const stepId = STEPS[state.step - 1].id;

    stepContainer.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach(function (input) {
        input.addEventListener('change', function () { handleOptionChange(stepId, input); });
      });

    const back = document.getElementById('btn-back');
    if (back) back.addEventListener('click', function () { goToStep(state.step - 1); });

    const next = document.getElementById('btn-next');
    if (next) next.addEventListener('click', function () { goToStep(state.step + 1); });

    const reset = document.getElementById('btn-reset');
    if (reset) reset.addEventListener('click', handleReset);

    bindFormEvents();
  }

  function bindFormEvents() {
    // Текстовые поля синхронизируются с состоянием при вводе — переключение
    // способа связи или перерисовка панели не теряет введённые данные.
    const map = {
      'f-name': 'name', 'f-phone': 'phone', 'f-email': 'email',
      'f-city': 'city', 'f-comment': 'comment'
    };
    Object.keys(map).forEach(function (elId) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.addEventListener('input', function () {
        state.contact[map[elId]] = el.value;
        clearFieldError(map[elId]);
        persist();
      });
    });

    const form = document.getElementById('lead-form');
    if (form) form.addEventListener('submit', handleFormSubmit);

    const refill = document.getElementById('refill-btn');
    if (refill) {
      refill.addEventListener('click', function () {
        state.submitted = false;
        state.lastSubmissionPayload = null;
        persist();
        renderStep();
      });
    }
  }

  function trackOptionChange(field, value) {
    AmfodentAnalytics.trackEvent('optionChange', { field: field, value: value });
  }

  function toggleInList(list, value, on) {
    const idx = list.indexOf(value);
    if (on && idx === -1) list.push(value);
    if (!on && idx !== -1) list.splice(idx, 1);
  }

  function handleOptionChange(stepId, input) {
    let rerenderStep = false;
    switch (input.name) {
      case 'goal':
        state.goal = input.value;
        trackOptionChange('goal', input.value);
        break;

      case 'workplaces':
        state.workplaces = input.value;
        trackOptionChange('workplaces', input.value);
        break;

      case 'kit':
        state.kit = input.value;
        trackOptionChange('kit', input.value);
        break;

      case 'kit_option':
        toggleInList(state.kitOptions, input.value, input.checked);
        state.kitOptions = validIds(optionalComponents(), state.kitOptions);
        trackOptionChange('kit_options', state.kitOptions.join(',') || 'none');
        break;

      case 'xray':
        toggleInList(state.xray, input.value, input.checked);
        state.xray = validIds(C.xray, state.xray);
        trackOptionChange('xray', state.xray.join(',') || 'none');
        // У томографа появляется/скрывается выбор поля обзора — нужен перерендер шага.
        if (input.value === 'tomograph') rerenderStep = true;
        break;

      case 'tomograph_fov':
        state.tomographFov = input.value;
        trackOptionChange('tomograph_fov', input.value);
        break;

      case 'extras': {
        const idx = state.extras.indexOf(input.value);
        if (input.checked && idx === -1) state.extras.push(input.value);
        if (!input.checked && idx !== -1) state.extras.splice(idx, 1);
        trackOptionChange('extras', state.extras.join(',') || 'none');
        break;
      }

      case 'extended_service':
        state.services.extendedServiceInterest = input.checked;
        trackOptionChange('extended_service', input.checked);
        break;

      case 'contact_method':
        state.contact.contactMethod = input.value;
        clearFieldError('contactMethod');
        updateEmailRequirement();
        break;

      case 'consent':
        state.contact.consent = input.checked;
        clearFieldError('consent');
        break;

      default:
        break;
    }

    persist();

    if (rerenderStep) {
      renderStep();
      updateSummaries();
      const again = stepContainer.querySelector('input[name="' + input.name + '"][value="' + input.value + '"]');
      if (again) again.focus({ preventScroll: true });
      return;
    }

    // Точечное обновление вместо перерисовки шага: не теряется фокус,
    // не сбрасывается позиция прокрутки и введённый текст.
    syncOptionStates();
    updateNextButton();
    updateSummaries();
    updateServicesInstallAmount();
    if (stepId === 'summary') trackResultIfOnSummary();
  }

  /** Подсветка выбранных карточек берётся из фактического состояния input. */
  function syncOptionStates() {
    stepContainer.querySelectorAll('.option').forEach(function (label) {
      const input = label.querySelector('input');
      if (input) label.classList.toggle('is-checked', input.checked);
    });
  }

  function updateNextButton() {
    const next = document.getElementById('btn-next');
    if (next) next.disabled = !canProceed();
  }

  /** На шаге «Услуги» сумма монтажа зависит только от предыдущих шагов, но
   *  обновляем её на случай изменений в пределах шага. */
  function updateServicesInstallAmount() {
    if (STEPS[state.step - 1].id !== 'services') return;
    renderStepServicesValue();
  }

  function renderStepServicesValue() {
    const c = calc();
    const holder = stepContainer.querySelectorAll('.service-row__value .price--lg')[0];
    if (holder) holder.textContent = money(c.installServiceAmount);
  }

  function isEmailRequired() {
    const cfg = UI.form.fields.email;
    return !!cfg.requiredForContactMethod &&
      state.contact.contactMethod === cfg.requiredForContactMethod;
  }

  function updateEmailRequirement() {
    const req = document.getElementById('email-required');
    const opt = document.getElementById('email-optional');
    if (!req || !opt) return;
    const required = isEmailRequired();
    req.classList.toggle('is-hidden', !required);
    opt.classList.toggle('is-hidden', required);
  }

  // =========================================================================
  //  ФОРМА: ВАЛИДАЦИЯ И ОТПРАВКА
  // =========================================================================

  function clearFieldError(name) {
    const el = document.getElementById('err-' + name);
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
    const wrap = stepContainer.querySelector('[data-field="' + name + '"]');
    if (wrap) wrap.classList.remove('has-error');
  }

  function showFieldErrors(errors) {
    ['name', 'phone', 'email', 'contactMethod', 'consent'].forEach(function (name) {
      const el = document.getElementById('err-' + name);
      const wrap = stepContainer.querySelector('[data-field="' + name + '"]');
      const message = errors[name];
      if (el) {
        el.textContent = message || '';
        el.hidden = !message;
      }
      if (wrap) wrap.classList.toggle('has-error', !!message);
    });
  }

  function validateForm() {
    const E = UI.form.errors;
    const errors = {};
    const c = state.contact;

    if (!c.name.trim()) errors.name = E.name;

    const phone = c.phone.trim();
    const digits = phone.replace(/\D/g, '');
    if (!phone) errors.phone = E.phone;
    else if (digits.length < 10) errors.phone = E.phoneFormat;

    if (!c.contactMethod) errors.contactMethod = E.contactMethod;

    const email = c.email.trim();
    if (isEmailRequired() && !email) errors.email = E.email;
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = E.emailFormat;

    if (!c.consent) errors.consent = E.consent;

    return errors;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    // Читаем актуальные значения полей (автозаполнение браузера может
    // подставить текст без события input).
    ['name', 'phone', 'email', 'city', 'comment'].forEach(function (key) {
      const el = document.getElementById('f-' + key);
      if (el) state.contact[key] = el.value;
    });
    persist();

    const errors = validateForm();
    const formError = document.getElementById('form-error');
    showFieldErrors(errors);

    const names = Object.keys(errors);
    if (names.length) {
      if (formError) {
        formError.textContent = UI.form.errors.summary;
        formError.hidden = false;
      }
      const firstWrap = stepContainer.querySelector('.has-error');
      if (firstWrap) {
        const focusable = firstWrap.querySelector('input, textarea');
        if (focusable) focusable.focus({ preventScroll: false });
        else firstWrap.scrollIntoView({ block: 'center' });
      }
      return;
    }

    if (formError) formError.hidden = true;

    const button = document.getElementById('submit-btn');
    submitting = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Отправляем…';
    }

    // ClientID Метрики запрашивается до сборки объекта, чтобы не патчить
    // уже сохранённую заявку (это раньше приводило к повторным перерисовкам).
    AmfodentAnalytics.getYandexClientId(function (clientId) {
      const payload = buildSubmissionPayload(clientId);

      AmfodentAnalytics.trackEvent('submit', {
        total: payload.totals.total,
        range_min: payload.totals.rangeMin,
        range_max: payload.totals.rangeMax,
        contact_method: payload.contact.contactMethod,
        positions: payload.breakdown.length
      });

      Promise.resolve(submitLead(payload)).then(function (result) {
        payload.meta.delivered = !!(result && result.delivered);
        state.lastSubmissionPayload = payload;
        state.submitted = true;
        submitting = false;
        persist();
        renderStep();
        const box = stepContainer.querySelector('.submitted');
        if (box) box.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  function handleReset() {
    if (!window.confirm(UI.resetConfirm)) return;
    AmfodentAnalytics.trackEvent('reset', {});
    AmfodentStorage.clear();
    state = createInitialState();
    mobileBarOpen = false;
    lastResultTracked = null;
    persist();
    render();
    scrollToCalculatorTop();
  }

  // =========================================================================
  //  ОБЪЕКТ ЗАЯВКИ
  // =========================================================================

  function extractUtm() {
    const utm = {};
    try {
      const params = new URLSearchParams(window.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
        const value = params.get(key);
        if (value) utm[key] = value;
      });
    } catch (err) {
      // URLSearchParams недоступен или адрес некорректен — просто пустой utm.
    }
    return utm;
  }

  function labelOf(list, id) {
    const item = AmfodentCalculator.findById(list, id);
    return item ? item.label : null;
  }

  /**
   * Готовый объект заявки: контакты, комплектация (id + названия),
   * расшифровка расчёта и итоговые суммы. Именно он уйдёт в CRM.
   */
  function buildSubmissionPayload(yandexClientId) {
    const c = calc();
    const contactMethodItem = AmfodentCalculator.findById(C.contactMethods, state.contact.contactMethod);

    return {
      source: 'amfodent_calculator',
      formVersion: 2,

      contact: {
        name: state.contact.name.trim(),
        phone: state.contact.phone.trim(),
        email: state.contact.email.trim() || null,
        city: state.contact.city.trim() || null,
        contactMethod: state.contact.contactMethod,
        contactMethodLabel: contactMethodItem ? contactMethodItem.label : null,
        comment: state.contact.comment.trim() || null,
        personalDataConsent: !!state.contact.consent
      },

      configuration: {
        goal: { id: state.goal, label: labelOf(C.goals, state.goal) },
        workplaces: {
          id: state.workplaces,
          label: labelOf(C.workplaces, state.workplaces),
          count: c.workplaceCount || null
        },
        kit: { id: state.kit, label: labelOf(C.kits, state.kit) },
        kitOptions: state.kitOptions.slice(),
        xray: state.xray.slice(),
        tomographFov: state.xray.indexOf('tomograph') !== -1 ? state.tomographFov : null,
        extras: C.extras
          .filter(function (e) { return state.extras.indexOf(e.id) !== -1; })
          .map(function (e) { return { id: e.id, label: e.label }; }),
        extendedServiceInterest: !!state.services.extendedServiceInterest
      },

      // Плоский человекочитаемый список — удобно вставить в письмо или задачу CRM.
      configurationText: AmfodentCalculator.describeConfiguration(C, state)
        .map(function (row) { return row.section + ': ' + row.label; }),

      breakdown: c.lines.map(function (l) {
        return {
          group: l.group,
          id: l.id,
          label: l.label,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
          provisionalPrice: l.provisional
        };
      }),

      totals: {
        equipmentSubtotal: Math.round(c.equipmentSubtotal),
        installService: {
          percent: c.installServicePercent,
          min: c.installServiceMin,
          amount: Math.round(c.installServiceAmount),
          includedInTotal: c.installServiceIncluded,
          atMinimum: c.installServiceAtMinimum
        },
        total: Math.round(c.total),
        rangeMin: c.rangeMin,
        rangeMax: c.rangeMax,
        rangeMinusPercent: c.rangeMinusPercent,
        rangePlusPercent: c.rangePlusPercent,
        currency: C.meta.currency,
        provisionalPricing: c.provisionalUsed
      },

      clarifySeparately: c.clarifyNotes.slice(),
      disclaimer: C.meta.disclaimer,

      meta: {
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        utm: extractUtm(),
        yandexClientId: yandexClientId || null,
        submittedAt: new Date().toISOString(),
        delivered: false
      }
    };
  }

  // =========================================================================
  //  ОРКЕСТРАЦИЯ И ИНИЦИАЛИЗАЦИЯ
  // =========================================================================

  function render() {
    renderProgress();
    renderStep();
    updateSummaries();
  }

  function bindGlobalEvents() {
    // Клик вне нижней панели её закрывает, чтобы она не оставалась поверх
    // кнопок «Назад» / «Далее».
    document.addEventListener('pointerdown', function (e) {
      if (mobileBarOpen && !mobileBar.contains(e.target)) {
        mobileBarOpen = false;
        updateSummaries();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileBarOpen) {
        mobileBarOpen = false;
        updateSummaries();
      }
    });

    window.addEventListener('resize', reserveMobileBarSpace);
  }

  function init() {
    if (!root || !progressEl || !stepContainer || !summaryPanel || !mobileBar) {
      console.error('[Amfodent] Не найдены контейнеры калькулятора — проверьте разметку index.html.');
      return;
    }

    // Тексты шапки и пометки — из config.js, чтобы правки не требовали HTML.
    if (brandEl) brandEl.textContent = UI.brand;
    if (titleEl) titleEl.textContent = UI.title;
    if (subtitleEl) subtitleEl.textContent = UI.subtitle;
    if (disclaimerEl) disclaimerEl.textContent = C.meta.disclaimer;

    const saved = AmfodentStorage.load();
    const restored = !!saved;
    state = sanitizeState(saved);

    buildMobileBar();
    render();
    bindGlobalEvents();

    AmfodentAnalytics.trackEvent('start', { restored: restored, step_id: STEPS[state.step - 1].id });
    trackResultIfOnSummary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * ЛЕНДИНГ-MVP: предвыбор шага «Задача» из блока «Три задачи кабинета» на
   * лендинге (см. js/landing.js). Если калькулятор уже отрисован — сразу
   * подсвечивает выбор и обновляет панель; если ещё нет — значение просто
   * попадёт в состояние при следующем рендере.
   */
  function presetGoal(goalId) {
    if (!validId(C.goals, goalId)) return;
    state.goal = goalId;
    persist();
    if (stepContainer && stepContainer.innerHTML) {
      renderStep();
      updateSummaries();
    }
  }

  /**
   * ЛЕНДИНГ-MVP: кнопки блока «Готовые комплекты» (data-kit) вызывают
   * presetKit(id) — id совпадают с C.kits в config.js.
   */
  // Пресет комплекта: выбирает комплект и открывает шаг «Состав», где посетитель
  // сам отмечает стерилизацию, мебель и наконечники. Цена считается тем же
  // движком, что и в остальном калькуляторе.
  function presetKit(kitId) {
    if (!validId(C.kits, kitId)) return;
    state.goal = state.goal || 'new';
    state.workplaces = state.workplaces || '1';
    state.kit = kitId;
    persist();
    const compositionStep = STEPS.map(function (s) { return s.id; }).indexOf('composition') + 1;
    goToStep(compositionStep || STEPS.length);
  }

  // Точка доступа для отладки и для интеграции (например, чтобы прочитать
  // текущий расчёт из внешнего кода страницы).
  window.AmfodentCalculatorApp = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getCalculation: calc,
    goToStep: goToStep,
    reset: handleReset,
    submitLead: submitLead,
    presetGoal: presetGoal,
    presetKit: presetKit
  };
})();

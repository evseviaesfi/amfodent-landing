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
      installation: { tierId: null, quantity: 1, quantityTouched: false, brand: '' },
      compressor: firstId(C.compressor),        // первая опция в config — «Не нужны»
      sterilization: firstId(C.sterilization),
      xray: firstId(C.xray),
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

  function clampQuantity(value) {
    const cfg = C.installations;
    let n = parseInt(value, 10);
    if (!isFinite(n)) n = cfg.quantityMin || 1;
    return Math.min(Math.max(n, cfg.quantityMin || 1), cfg.quantityMax || 20);
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

    const inst = saved.installation || {};
    s.installation.tierId = validId(C.installations.tiers, inst.tierId);
    s.installation.quantity = clampQuantity(inst.quantity);
    s.installation.quantityTouched = !!inst.quantityTouched;
    s.installation.brand = str(inst.brand, 120);

    s.compressor = validId(C.compressor, saved.compressor) || s.compressor;
    s.sterilization = validId(C.sterilization, saved.sterilization) || s.sterilization;
    s.xray = validId(C.xray, saved.xray) || s.xray;

    const savedExtras = Array.isArray(saved.extras) ? saved.extras : [];
    s.extras = C.extras
      .filter(function (e) { return savedExtras.indexOf(e.id) !== -1; })
      .map(function (e) { return e.id; });

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
      case 'installation': return !!st.installation.tierId && st.installation.quantity > 0;
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

  function renderStepInstallation() {
    const cfg = C.installations;
    const tiers = cfg.tiers.map(function (t) {
      return optionCard({
        type: 'radio', name: 'installation_tier', value: t.id,
        checked: state.installation.tierId === t.id,
        title: t.label, price: priceHtml(t), meta: t.hint
      });
    }).join('');

    return '<div class="option-grid option-grid--3">' + tiers + '</div>' +
      '<div class="field-row field-row--spaced">' +
      '<label class="field field--narrow">' +
      '<span class="field__label">' + escapeHtml(cfg.quantityLabel) + '</span>' +
      '<input type="number" inputmode="numeric" id="installation-qty" ' +
      'min="' + cfg.quantityMin + '" max="' + cfg.quantityMax + '" step="1" ' +
      'value="' + state.installation.quantity + '">' +
      '</label>' +
      '<label class="field">' +
      '<span class="field__label">' + escapeHtml(cfg.brandLabel) +
      ' <span class="field__optional">' + escapeHtml(LBL.optional) + '</span></span>' +
      '<input type="text" id="installation-brand" maxlength="120" ' +
      'placeholder="' + escapeHtml(cfg.brandPlaceholder) + '" ' +
      'value="' + escapeHtml(state.installation.brand) + '">' +
      '</label></div>';
  }

  function renderStepCompressor() {
    const wpCount = AmfodentCalculator.workplaceCount(C, state.workplaces);
    return '<div class="option-grid option-grid--list">' + C.compressor.map(function (item) {
      const recommended = wpCount > 0 && item.recommendedFor &&
        item.recommendedFor.indexOf(wpCount) !== -1;
      return optionCard({
        type: 'radio', name: 'compressor', value: item.id, checked: state.compressor === item.id,
        title: item.label, price: priceHtml(item),
        tags: recommended ? tag(LBL.recommended, 'reco') : ''
      });
    }).join('') + '</div>';
  }

  function renderStepSterilization() {
    return '<div class="option-grid option-grid--list">' + C.sterilization.map(function (item) {
      const includes = (item.includes && item.includes.length)
        ? LBL.includes + ': ' + item.includes.join(', ') : null;
      return optionCard({
        type: 'radio', name: 'sterilization', value: item.id, checked: state.sterilization === item.id,
        title: item.label, price: priceHtml(item), meta: includes
      });
    }).join('') + '</div>';
  }

  function renderStepXray() {
    return '<div class="option-grid option-grid--list">' + C.xray.map(function (item) {
      return optionCard({
        type: 'radio', name: 'xray', value: item.id, checked: state.xray === item.id,
        title: item.label, price: priceHtml(item)
      });
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

    const installValue = c.equipmentSubtotal > 0
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
      '<tr><td colspan="3">' + escapeHtml(C.services.installService.label) +
      ' <span class="breakdown__hint">' + escapeHtml(installNote) + '</span></td>' +
      '<td class="num">' + money(c.installServiceAmount) + '</td></tr>' +
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
      installation: renderStepInstallation,
      compressor: renderStepCompressor,
      sterilization: renderStepSterilization,
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
      money(c.installServiceAmount) + '</span></div>' +
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

    const qty = document.getElementById('installation-qty');
    if (qty) {
      qty.addEventListener('input', function () {
        // Во время ввода не «дёргаем» поле: пустое значение допускаем,
        // в расчёте используем безопасный минимум.
        state.installation.quantityTouched = true;
        state.installation.quantity = clampQuantity(qty.value);
        persist();
        trackOptionChange('installation_quantity', state.installation.quantity);
        updateSummaries();
      });
      qty.addEventListener('blur', function () {
        qty.value = state.installation.quantity; // нормализуем «5abc», «0», «999»
      });
    }

    const brand = document.getElementById('installation-brand');
    if (brand) {
      brand.addEventListener('input', function () {
        state.installation.brand = brand.value;
        persist();
        updateSummaries();
      });
    }

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

  function handleOptionChange(stepId, input) {
    switch (input.name) {
      case 'goal':
        state.goal = input.value;
        trackOptionChange('goal', input.value);
        break;

      case 'workplaces':
        state.workplaces = input.value;
        // Количество установок подстраивается, пока пользователь не задал его сам.
        if (!state.installation.quantityTouched) {
          state.installation.quantity = clampQuantity(
            AmfodentCalculator.workplaceCount(C, state.workplaces)
          );
        }
        autoSuggestCompressor();
        trackOptionChange('workplaces', input.value);
        break;

      case 'installation_tier':
        state.installation.tierId = input.value;
        trackOptionChange('installation_tier', input.value);
        break;

      case 'compressor':
        state.compressor = input.value;
        trackOptionChange('compressor', input.value);
        break;

      case 'sterilization':
        state.sterilization = input.value;
        trackOptionChange('sterilization', input.value);
        break;

      case 'xray':
        state.xray = input.value;
        trackOptionChange('xray', input.value);
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

  function autoSuggestCompressor() {
    // Не перезаписываем осознанный выбор: подсказываем только пока стоит
    // первый (нулевой) вариант из config.
    if (state.compressor !== firstId(C.compressor)) return;
    const wpCount = AmfodentCalculator.workplaceCount(C, state.workplaces);
    const match = C.compressor.filter(function (item) {
      return item.recommendedFor && item.recommendedFor.indexOf(wpCount) !== -1;
    })[0];
    if (match) state.compressor = match.id;
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
      formVersion: 1,

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
        installation: {
          tierId: state.installation.tierId,
          tierLabel: labelOf(C.installations.tiers, state.installation.tierId),
          quantity: state.installation.quantity,
          brand: state.installation.brand.trim() || null
        },
        compressor: { id: state.compressor, label: labelOf(C.compressor, state.compressor) },
        sterilization: { id: state.sterilization, label: labelOf(C.sterilization, state.sterilization) },
        xray: { id: state.xray, label: labelOf(C.xray, state.xray) },
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
   * ЛЕНДИНГ-MVP: пресеты для блока «Готовые комплекты». Каждый пресет — это
   * реальный набор выбора в терминах config.js (не отдельные «фиксированные
   * цены комплекта»), поэтому показанная в итоге сумма всегда посчитана тем
   * же движком, что и в остальном калькуляторе, и меняется вместе с ценами
   * в config.js. Ориентиры диапазонов подобраны так, чтобы после калибровки
   * цен (см. INTEGRATION.md) примерно совпадать с карточками на лендинге —
   * см. описание в SETUP.md.
   */
  const KIT_PRESETS = {
    starter: {
      goal: 'new', workplaces: '1', tierId: 'basic', quantity: 1,
      compressor: 'one', sterilization: 'basic', xray: 'none',
      extras: ['furniture', 'handpieces']
    },
    optimal: {
      goal: 'new', workplaces: '1', tierId: 'standard', quantity: 1,
      compressor: 'one', sterilization: 'basic', xray: 'xray_visio',
      extras: ['furniture', 'handpieces']
    },
    pro: {
      goal: 'new', workplaces: '1', tierId: 'premium', quantity: 1,
      compressor: 'two_three', sterilization: 'extended', xray: 'xray_visio',
      extras: ['furniture', 'handpieces', 'surgery']
    },
    pro3d: {
      goal: 'new', workplaces: '1', tierId: 'premium', quantity: 1,
      compressor: 'two_three', sterilization: 'extended', xray: 'tomograph',
      extras: ['furniture', 'handpieces', 'microscope']
    }
  };

  function presetKit(kitId) {
    const kit = KIT_PRESETS[kitId];
    if (!kit) return;
    state.goal = validId(C.goals, kit.goal) || state.goal;
    state.workplaces = validId(C.workplaces, kit.workplaces) || state.workplaces;
    state.installation.tierId = validId(C.installations.tiers, kit.tierId) || state.installation.tierId;
    state.installation.quantity = clampQuantity(kit.quantity);
    state.installation.quantityTouched = true;
    state.compressor = validId(C.compressor, kit.compressor) || state.compressor;
    state.sterilization = validId(C.sterilization, kit.sterilization) || state.sterilization;
    state.xray = validId(C.xray, kit.xray) || state.xray;
    state.extras = C.extras
      .filter(function (e) { return kit.extras.indexOf(e.id) !== -1; })
      .map(function (e) { return e.id; });
    persist();
    goToStep(STEPS.length); // сразу на «Итог и заявка» — с реально посчитанной суммой
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

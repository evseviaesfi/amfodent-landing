/**
 * РАСЧЁТ СТОИМОСТИ
 * ----------------
 * Чистые функции: на входе конфигурация + выбор пользователя, на выходе —
 * расшифровка стоимости и итоговый диапазон. Обращений к DOM здесь нет,
 * поэтому расчёт можно проверять отдельно от интерфейса (см. tests/).
 *
 * Порядок расчёта:
 *   1. Позиции оборудования (установки × количество, компрессор, стерилизация,
 *      рентген, дополнительное оснащение) → equipmentSubtotal.
 *   2. Монтаж: процент от equipmentSubtotal, но не меньше минимума
 *      (минимум применяется только если оборудование выбрано).
 *   3. total = equipmentSubtotal + монтаж.
 *   4. Диапазон: total −rangeMinusPercent% … +rangePlusPercent%,
 *      границы округляются наружу до шага из meta (сам total не округляется,
 *      чтобы таблица расшифровки сходилась).
 */
const AmfodentCalculator = (function () {
  'use strict';

  const NBSP = ' ';

  function findById(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  /** Разбивка по три разряда неразрывным пробелом — одинаково в браузере и Node. */
  function groupDigits(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function formatMoney(amount, config) {
    const currency = (config || AMFODENT_CONFIG).meta.currency;
    const rounded = Math.round(Number(amount) || 0);
    const sign = rounded < 0 ? '−' : '';
    return sign + groupDigits(String(Math.abs(rounded))) + NBSP + currency;
  }

  /** Число рабочих мест для расчёта по выбранному варианту. */
  function workplaceCount(config, workplacesId) {
    const wp = findById(config.workplaces, workplacesId);
    return wp ? (Number(wp.count) || 1) : 0;
  }

  /**
   * Округление границы диапазона наружу: min — вниз, max — вверх.
   * @param {number} value
   * @param {number} direction -1 (вниз) или +1 (вверх)
   */
  function roundRangeBound(value, direction, meta) {
    const step = value >= meta.heavyThreshold ? meta.roundStepHeavy : meta.roundStep;
    if (!step || step <= 0) return Math.round(value);
    return direction < 0
      ? Math.floor(value / step) * step
      : Math.ceil(value / step) * step;
  }

  /** Количество единиц позиции с учётом scaling. */
  function scaledQuantity(item, wpCount) {
    if (item.scaling === 'perWorkplace') return Math.max(1, wpCount || 1);
    return 1;
  }

  /**
   * @param {object} config AMFODENT_CONFIG
   * @param {object} state  выбор пользователя (см. app.js → createInitialState)
   * @returns {object} расшифровка расчёта
   */
  function calculate(config, state) {
    const lines = [];
    const clarifyNotes = [];
    let provisionalUsed = false;

    const wpCount = workplaceCount(config, state.workplaces);
    const extras = Array.isArray(state.extras) ? state.extras : [];

    function pushLine(group, item, quantity, extra) {
      const qty = Math.max(1, Math.round(Number(quantity) || 1));
      const line = Object.assign({
        group: group,
        id: item.id,
        label: item.label,
        quantity: qty,
        unitPrice: item.price,
        total: item.price * qty,
        provisional: !!item.provisional,
        priceFrom: !!item.priceFrom
      }, extra || {});
      lines.push(line);
      if (line.provisional) provisionalUsed = true;
      return line;
    }

    // 1. Стоматологические установки
    const tier = findById(config.installations.tiers, state.installation && state.installation.tierId);
    if (tier) {
      const cfgInst = config.installations;
      let qty = parseInt(state.installation.quantity, 10);
      if (!isFinite(qty)) qty = 1;
      qty = Math.min(Math.max(qty, cfgInst.quantityMin || 1), cfgInst.quantityMax || 20);
      const brand = (state.installation.brand || '').trim();
      pushLine('Стоматологическая установка', tier, qty, {
        label: tier.label + (brand ? ' (' + brand + ')' : ''),
        brand: brand || null
      });
    }

    // 2. Компрессор и аспирация
    const compressor = findById(config.compressor, state.compressor);
    if (compressor && compressor.price > 0) {
      pushLine('Компрессор и аспирация', compressor, 1);
    }

    // 3. Стерилизация
    const sterilization = findById(config.sterilization, state.sterilization);
    if (sterilization && sterilization.price > 0) {
      pushLine('Стерилизация', sterilization, 1, { includes: sterilization.includes || [] });
    }

    // 4. Рентгенодиагностика
    const xray = findById(config.xray, state.xray);
    if (xray && xray.price > 0) {
      pushLine('Рентгенодиагностика', xray, 1);
    }

    // 5. Дополнительное оснащение — в порядке config, а не в порядке кликов,
    //    чтобы расшифровка не «прыгала» при переключении галочек.
    config.extras.forEach(function (extra) {
      if (extras.indexOf(extra.id) === -1) return;
      pushLine('Дополнительное оснащение', extra, scaledQuantity(extra, wpCount), {
        perWorkplace: extra.scaling === 'perWorkplace'
      });
    });

    const equipmentSubtotal = lines.reduce(function (sum, l) { return sum + l.total; }, 0);

    // 6. Монтаж
    const installCfg = config.services.installService;
    const installByPercent = equipmentSubtotal * (installCfg.percent / 100);
    const installServiceAmount = equipmentSubtotal > 0
      ? Math.max(installByPercent, installCfg.min)
      : 0;

    const total = equipmentSubtotal + installServiceAmount;

    // 7. Диапазон
    const meta = config.meta;
    const rangeMinRaw = total * (1 - meta.rangeMinusPercent / 100);
    const rangeMaxRaw = total * (1 + meta.rangePlusPercent / 100);
    const rangeMin = total > 0 ? roundRangeBound(rangeMinRaw, -1, meta) : 0;
    const rangeMax = total > 0 ? roundRangeBound(rangeMaxRaw, 1, meta) : 0;

    // 8. Что уточняется отдельно
    if (equipmentSubtotal > 0) clarifyNotes.push(config.services.delivery.clarifyNote);
    if (state.services && state.services.extendedServiceInterest) {
      clarifyNotes.push(config.services.extendedService.clarifyNote);
    }
    if (provisionalUsed) clarifyNotes.push(meta.provisionalNote);

    return {
      lines: lines,
      workplaceCount: wpCount,
      equipmentSubtotal: equipmentSubtotal,
      installServiceAmount: installServiceAmount,
      installServicePercent: installCfg.percent,
      installServiceMin: installCfg.min,
      installServiceAtMinimum: equipmentSubtotal > 0 && installByPercent < installCfg.min,
      total: total,
      rangeMin: rangeMin,
      rangeMax: rangeMax,
      rangeMinusPercent: meta.rangeMinusPercent,
      rangePlusPercent: meta.rangePlusPercent,
      provisionalUsed: provisionalUsed,
      clarifyNotes: clarifyNotes,
      isEmpty: lines.length === 0
    };
  }

  /**
   * Человекочитаемая комплектация для объекта заявки: не только id, но и
   * названия — чтобы менеджер понял выбор без обращения к config.js.
   */
  function describeConfiguration(config, state) {
    const rows = [];

    function add(section, item, value) {
      rows.push({ section: section, id: item ? item.id : null, label: value });
    }

    const goal = findById(config.goals, state.goal);
    add('Задача', goal, goal ? goal.label : 'не выбрано');

    const wp = findById(config.workplaces, state.workplaces);
    add('Рабочие места', wp, wp ? wp.label : 'не выбрано');

    const tier = findById(config.installations.tiers, state.installation && state.installation.tierId);
    if (tier) {
      const qty = Math.max(1, parseInt(state.installation.quantity, 10) || 1);
      const brand = (state.installation.brand || '').trim();
      add('Установки', tier, tier.label + ' × ' + qty + (brand ? ', бренд: ' + brand : ''));
    } else {
      add('Установки', null, 'не выбрано');
    }

    const compressor = findById(config.compressor, state.compressor);
    add('Компрессор и аспирация', compressor, compressor ? compressor.label : 'не выбрано');

    const sterilization = findById(config.sterilization, state.sterilization);
    add('Стерилизация', sterilization, sterilization ? sterilization.label : 'не выбрано');

    const xray = findById(config.xray, state.xray);
    add('Рентгенодиагностика', xray, xray ? xray.label : 'не выбрано');

    const extras = Array.isArray(state.extras) ? state.extras : [];
    const extraLabels = config.extras
      .filter(function (e) { return extras.indexOf(e.id) !== -1; })
      .map(function (e) { return e.label; });
    rows.push({
      section: 'Дополнительное оснащение',
      id: extras.slice(),
      label: extraLabels.length ? extraLabels.join(', ') : 'не выбрано'
    });

    rows.push({
      section: 'Расширенное сервисное обслуживание',
      id: config.services.extendedService.id,
      label: (state.services && state.services.extendedServiceInterest) ? 'интересует' : 'не требуется'
    });

    return rows;
  }

  return {
    calculate: calculate,
    describeConfiguration: describeConfiguration,
    formatMoney: formatMoney,
    workplaceCount: workplaceCount,
    findById: findById
  };
})();

if (typeof window !== 'undefined') window.AmfodentCalculator = AmfodentCalculator;
if (typeof module !== 'undefined' && module.exports) module.exports = AmfodentCalculator;

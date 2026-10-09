/**
 * РАСЧЁТ СТОИМОСТИ
 * ----------------
 * Чистые функции: на входе конфигурация + выбор пользователя, на выходе —
 * расшифровка стоимости и итоговый диапазон. Обращений к DOM здесь нет,
 * поэтому расчёт можно проверять отдельно от интерфейса (см. tests/).
 *
 * Порядок расчёта:
 *   1. Позиции оборудования (комплект: установка и компрессор всегда, остальное
 *      по галочкам; рентген и 3D; дополнительное оснащение) → equipmentSubtotal.
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

  /** Выбранный вариант поля обзора томографа (по умолчанию — первый в config). */
  function tomographOption(config, fovId) {
    const list = (config.tomographFov && config.tomographFov.options) || [];
    return findById(list, fovId) || list[0] || null;
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

    // 1. Комплект: обязательные позиции (установка, компрессор) входят всегда,
    //    необязательные (стерилизация, мебель, наконечники) — только с галочкой.
    const kit = findById(config.kits, state.kit);
    const kitOptions = Array.isArray(state.kitOptions) ? state.kitOptions : [];
    const perWp = Math.max(1, wpCount || 1);
    if (kit) {
      config.kitComponents.forEach(function (comp) {
        const item = kit.items[comp.id];
        if (!item) return;
        if (!comp.required && kitOptions.indexOf(comp.id) === -1) return;
        pushLine(comp.group, Object.assign({ id: comp.id }, item),
          comp.scaling === 'perWorkplace' ? perWp : 1,
          { includes: item.includes || [], perWorkplace: comp.scaling === 'perWorkplace' });
      });
    }

    // 2. Рентген и 3D — несколько позиций; у томографа выбирается поле обзора.
    const xraySel = Array.isArray(state.xray) ? state.xray : [];
    config.xray.forEach(function (x) {
      if (xraySel.indexOf(x.id) === -1) return;
      if (x.hasFov) {
        const fov = tomographOption(config, state.tomographFov);
        if (!fov) return;
        pushLine('Рентгенодиагностика', {
          id: x.id + '_' + fov.id,
          label: x.label + ', поле ' + fov.label + (fov.model ? ' (' + fov.model + ')' : ''),
          price: fov.price,
          priceFrom: fov.priceFrom,
          provisional: fov.provisional
        }, 1);
      } else {
        pushLine('Рентгенодиагностика', x, 1);
      }
    });

    // 3. Дополнительное оснащение — в порядке config, а не в порядке кликов,
    //    чтобы расшифровка не «прыгала» при переключении галочек.
    config.extras.forEach(function (extra) {
      if (extras.indexOf(extra.id) === -1) return;
      pushLine('Дополнительное оснащение', extra, scaledQuantity(extra, wpCount), {
        perWorkplace: extra.scaling === 'perWorkplace'
      });
    });

    const equipmentSubtotal = lines.reduce(function (sum, l) { return sum + l.total; }, 0);

    // 4. Монтаж
    const installCfg = config.services.installService;
    const installByPercent = equipmentSubtotal * (installCfg.percent / 100);
    const installIncluded = installCfg.includedInTotal !== false;
    const installServiceAmount = (installIncluded && equipmentSubtotal > 0)
      ? Math.max(installByPercent, installCfg.min)
      : 0;

    const total = equipmentSubtotal + installServiceAmount;

    // 5. Диапазон
    const meta = config.meta;
    const rangeMinRaw = total * (1 - meta.rangeMinusPercent / 100);
    const rangeMaxRaw = total * (1 + meta.rangePlusPercent / 100);
    const rangeMin = total > 0 ? roundRangeBound(rangeMinRaw, -1, meta) : 0;
    const rangeMax = total > 0 ? roundRangeBound(rangeMaxRaw, 1, meta) : 0;

    // 6. Что уточняется отдельно
    if (equipmentSubtotal > 0 && !installIncluded && installCfg.clarifyNote) clarifyNotes.push(installCfg.clarifyNote);
    if (equipmentSubtotal > 0) clarifyNotes.push(config.services.delivery.clarifyNote);
    if (kit && wpCount > 1 && meta.multiWorkplaceNote) clarifyNotes.push(meta.multiWorkplaceNote);
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
      installServiceIncluded: installIncluded,
      installServiceAtMinimum: installIncluded && equipmentSubtotal > 0 && installByPercent < installCfg.min,
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

    const kit = findById(config.kits, state.kit);
    if (kit) {
      const kitOptions = Array.isArray(state.kitOptions) ? state.kitOptions : [];
      add('Комплект', kit, kit.label);
      config.kitComponents.forEach(function (comp) {
        const item = kit.items[comp.id];
        if (!item) return;
        const on = comp.required || kitOptions.indexOf(comp.id) !== -1;
        rows.push({ section: comp.group, id: comp.id, label: on ? item.label : 'не включено' });
      });
    } else {
      add('Комплект', null, 'не выбрано');
    }

    const xraySel = Array.isArray(state.xray) ? state.xray : [];
    const xrayLabels = config.xray
      .filter(function (x) { return xraySel.indexOf(x.id) !== -1; })
      .map(function (x) {
        if (!x.hasFov) return x.label;
        const fov = tomographOption(config, state.tomographFov);
        return x.label + (fov ? ', поле ' + fov.label + (fov.model ? ' (' + fov.model + ')' : '') : '');
      });
    rows.push({
      section: 'Рентген и 3D',
      id: xraySel.slice(),
      label: xrayLabels.length ? xrayLabels.join('; ') : 'не выбрано'
    });

    const extras = Array.isArray(state.extras) ? state.extras : [];
    const extraLabels = config.extras
      .filter(function (e) { return extras.indexOf(e.id) !== -1; })
      .map(function (e) { return e.label; });
    if (config.extras.length) rows.push({
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
    tomographOption: tomographOption,
    findById: findById
  };
})();

if (typeof window !== 'undefined') window.AmfodentCalculator = AmfodentCalculator;
if (typeof module !== 'undefined' && module.exports) module.exports = AmfodentCalculator;

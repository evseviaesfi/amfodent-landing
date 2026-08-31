/**
 * АНАЛИТИКА — ЗАГОТОВКИ СОБЫТИЙ
 * -----------------------------
 * Безопасные обёртки над window.dataLayer и Яндекс.Метрикой. Ошибка аналитики
 * никогда не должна ломать калькулятор: все вызовы в try/catch, наличие
 * dataLayer / ym проверяется перед обращением.
 *
 * События (имена берутся из AMFODENT_CONFIG.analyticsEvents):
 *   calculator_start          — калькулятор показан, начало расчёта
 *   calculator_step           — переход на шаг {step_index, step_id}
 *   calculator_option_change  — изменение комплектации {field, value}
 *   calculator_result         — пользователь дошёл до итога {total, range_min, range_max}
 *   calculator_submit         — отправка формы {total, contact_method}
 *   calculator_reset          — сброс расчёта
 *
 * Пока на странице нет ни dataLayer, ни счётчика Метрики, события только
 * складываются в AmfodentAnalytics.getLog() — это удобно для проверки.
 * Подключение реальных счётчиков описано в INTEGRATION.md.
 */
const AmfodentAnalytics = (function () {
  'use strict';

  const log = [];
  const DEBUG_FLAG = 'amfodentAnalyticsDebug';

  function cfg() {
    return (typeof window !== 'undefined' && window.AMFODENT_CONFIG) || (typeof AMFODENT_CONFIG !== 'undefined' ? AMFODENT_CONFIG : null);
  }

  function counterId() {
    const c = cfg();
    return c && c.meta ? c.meta.yandexMetrikaCounterId : null;
  }

  function safePushDataLayer(eventName, payload) {
    try {
      if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
        window.dataLayer.push(Object.assign({ event: eventName }, payload || {}));
      }
    } catch (err) {
      console.warn('[AmfodentAnalytics] dataLayer push failed:', err);
    }
  }

  function safePushMetrika(eventName, payload) {
    try {
      const id = counterId();
      if (typeof window !== 'undefined' && typeof window.ym === 'function' && id) {
        window.ym(id, 'reachGoal', eventName, payload || {});
      }
    } catch (err) {
      console.warn('[AmfodentAnalytics] Метрика reachGoal failed:', err);
    }
  }

  /**
   * Единая точка отправки события. При интеграции сюда же можно добавить
   * вызовы других систем (VK Pixel, Google Analytics и т.п.).
   */
  function track(eventName, payload) {
    if (!eventName) return;
    const data = payload || {};
    log.push({ event: eventName, payload: data, at: new Date().toISOString() });
    safePushDataLayer(eventName, data);
    safePushMetrika(eventName, data);
    try {
      if (typeof window !== 'undefined' && window[DEBUG_FLAG]) {
        console.info('[Amfodent analytics]', eventName, data);
      }
    } catch (err) { /* игнорируем */ }
  }

  /** Отправка по ключу из AMFODENT_CONFIG.analyticsEvents. */
  function trackEvent(key, payload) {
    const c = cfg();
    const name = c && c.analyticsEvents ? c.analyticsEvents[key] : null;
    if (!name) {
      console.warn('[AmfodentAnalytics] Неизвестный ключ события:', key);
      return;
    }
    track(name, payload);
  }

  /**
   * ClientID Метрики для склейки заявки с визитом. Асинхронно, с таймаутом:
   * если счётчик не подключён — колбэк вызывается с null.
   */
  function getYandexClientId(callback) {
    const done = (function () {
      let called = false;
      return function (value) {
        if (called) return;
        called = true;
        try { callback(value); } catch (err) { console.warn('[AmfodentAnalytics] callback failed:', err); }
      };
    })();

    try {
      const id = counterId();
      if (typeof window !== 'undefined' && typeof window.ym === 'function' && id) {
        const timer = setTimeout(function () { done(null); }, 1000);
        window.ym(id, 'getClientID', function (clientId) {
          clearTimeout(timer);
          done(clientId || null);
        });
        return;
      }
    } catch (err) {
      console.warn('[AmfodentAnalytics] getClientID failed:', err);
    }
    done(null);
  }

  return {
    track: track,
    trackEvent: trackEvent,
    getYandexClientId: getYandexClientId,
    getLog: function () { return log.slice(); }
  };
})();

if (typeof window !== 'undefined') window.AmfodentAnalytics = AmfodentAnalytics;

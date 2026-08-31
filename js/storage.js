/**
 * СОХРАНЕНИЕ СОСТОЯНИЯ
 * ---------------------
 * Выбранные параметры сохраняются в localStorage, чтобы пользователь не терял
 * прогресс при перезагрузке страницы.
 *
 * localStorage может быть недоступен: приватный режим, отключённые cookie,
 * открытие файла напрямую по file:// в Chrome. В этом случае модуль тихо
 * переключается на память процесса — калькулятор продолжает работать,
 * просто без сохранения между перезагрузками.
 *
 * При интеграции в страницу с несколькими калькуляторами сделайте KEY
 * уникальным — см. INTEGRATION.md.
 */
const AmfodentStorage = (function () {
  'use strict';

  const KEY = 'amfodent_calculator_state_v1';

  let memoryFallback = null;
  let available = null; // null = ещё не проверяли

  function isAvailable() {
    if (available !== null) return available;
    try {
      const probe = '__amfodent_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      available = true;
    } catch (err) {
      available = false;
      console.info('[AmfodentStorage] localStorage недоступен, состояние хранится только в памяти страницы.');
    }
    return available;
  }

  function save(state) {
    let json;
    try {
      json = JSON.stringify(state);
    } catch (err) {
      console.warn('[AmfodentStorage] Не удалось сериализовать состояние:', err);
      return false;
    }
    memoryFallback = json;
    if (!isAvailable()) return false;
    try {
      window.localStorage.setItem(KEY, json);
      return true;
    } catch (err) {
      // Например, переполнение квоты — не критично, работаем из памяти.
      console.warn('[AmfodentStorage] Не удалось сохранить состояние:', err);
      return false;
    }
  }

  function load() {
    let raw = null;
    if (isAvailable()) {
      try {
        raw = window.localStorage.getItem(KEY);
      } catch (err) {
        console.warn('[AmfodentStorage] Не удалось прочитать состояние:', err);
      }
    }
    if (raw === null) raw = memoryFallback;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (err) {
      console.warn('[AmfodentStorage] Сохранённое состояние повреждено, начинаем заново:', err);
      clear();
      return null;
    }
  }

  function clear() {
    memoryFallback = null;
    if (!isAvailable()) return;
    try {
      window.localStorage.removeItem(KEY);
    } catch (err) {
      console.warn('[AmfodentStorage] Не удалось очистить состояние:', err);
    }
  }

  return { save: save, load: load, clear: clear, key: KEY };
})();

if (typeof window !== 'undefined') window.AmfodentStorage = AmfodentStorage;

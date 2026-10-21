/**
 * ОТПРАВКА ЗАЯВОК — единая точка для всех форм лендинга
 * -----------------------------------------------------
 * Используют: калькулятор (app.js → submitLead) и окно «Консультация инженера»
 * (landing.js).
 *
 * По 152-ФЗ (ч. 5 ст. 18) персональные данные россиян при сборе должны
 * записываться в базы на территории РФ. Поэтому браузер отправляет заявку
 * ТОЛЬКО на российский сервер Оператора (LEAD_ENDPOINT), а уже он кладёт её
 * в почту и шлёт в Telegram короткое уведомление без имени и телефона.
 * Готовый код такого сервера — папка serverless/lead-function (Yandex Cloud
 * Functions), инструкция — serverless/README.md.
 *
 * Пока LEAD_ENDPOINT пустой, заявка не отправляется, а посетитель видит
 * сообщение с телефоном 8 (800) 550-45-35.
 */
(function () {
  'use strict';

  // Обработчик заявок на хостинге основного сайта (файл landing-lead.php в /www/amfodent.ru/).
  const LEAD_ENDPOINT = 'https://amfodent.ru/landing-lead.php';

  function clean(fields) {
    return (fields || []).filter(function (f) {
      return f && f[1] !== null && f[1] !== undefined && String(f[1]).trim() !== '';
    }).map(function (f) { return [String(f[0]), String(f[1])]; });
  }

  /**
   * lead = {
   *   subject: 'Консультация инженера',
   *   urgent: true|false,              // «в течение часа»
   *   replyTo: 'email@…' | null,
   *   fields: [['Имя', 'Анна'], ['Телефон', '+7…'], …]  // пустые значения пропускаются
   * }
   */
  // Пометка, по которой заявку с лендинга видно в общей почте и в amoCRM.
  const SOURCE = 'Лендинг «Кабинет под ключ» (kit.amfodent.ru)';

  function send(lead) {
    if (!LEAD_ENDPOINT) return Promise.resolve({ delivered: false, reason: 'endpoint_not_configured' });
    lead = Object.assign({}, lead, { fields: [['Источник', SOURCE]].concat(lead.fields || []) });
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: '[Лендинг] ' + lead.subject,
        urgent: !!lead.urgent,
        replyTo: lead.replyTo || null,
        fields: clean(lead.fields),
        website: '' // ловушка для ботов: настоящая форма всегда шлёт пустое поле
      })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j && j.ok === true; }); })
      .then(function (ok) { return { delivered: ok }; })
      .catch(function (err) {
        console.warn('[Amfodent] Не удалось отправить заявку:', err);
        return { delivered: false, reason: 'request_failed' };
      });
  }

  function isConfigured() { return !!LEAD_ENDPOINT; }

  // ---------- Рабочее время (по Москве) ----------
  // Пн–чт 10:00–18:00, пт 10:00–17:00. «В течение часа» предлагаем только когда
  // до конца рабочего дня больше 30 минут, иначе обещание не выполнится.
  const HOURS = { 1: [10, 18], 2: [10, 18], 3: [10, 18], 4: [10, 18], 5: [10, 17] };
  const DAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

  function mskNow() {
    const d = new Date();
    return new Date(d.getTime() + (d.getTimezoneOffset() + 180) * 60000);
  }

  function nextWorkdayLabel(m) {
    for (let i = 1; i <= 7; i++) {
      const day = (m.getDay() + i) % 7;
      if (HOURS[day]) return (i === 1 ? 'Завтра' : 'В ' + DAY_NAMES[day]) + ' с 10:00';
    }
    return 'В ближайший рабочий день';
  }

  /**
   * Варианты «когда связаться», уместные прямо сейчас.
   * Возвращает [{ id, label, urgent }]; id совпадают с config.contactTimes.
   */
  function contactTimes() {
    const m = mskNow();
    const w = HOURS[m.getDay()];
    const h = m.getHours() + m.getMinutes() / 60;
    const days = { id: 'days', label: 'В ближайшие дни' };
    if (w && h >= w[0] && h < w[1] - 0.5) {
      return [{ id: 'hour', label: 'В течение часа', urgent: true }, { id: 'today', label: 'Сегодня' }, days];
    }
    if (w && h < w[0]) return [{ id: 'today', label: 'Сегодня с 10:00' }, days];
    return [{ id: 'next', label: nextWorkdayLabel(m) }, days];
  }

  // ---------- Маска телефона: +7 (999) 123-45-67 ----------
  function formatPhone(value) {
    const raw = String(value || '');
    // Иностранный номер: пользователь начал с «+» и не с 7, не трогаем.
    if (/^\s*\+\s*([0-689]|$)/.test(raw)) return raw;
    let d = raw.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    else if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  /** Номер выглядит настоящим: российский из 11 цифр или иностранный от 10 цифр. */
  function isPhoneValid(value) {
    const raw = String(value || '').trim();
    const d = raw.replace(/\D/g, '');
    if (/^\+\s*[0-689]/.test(raw)) return d.length >= 10 && d.length <= 15;
    return d.length === 11 && d[0] === '7' && d[1] !== '0';
  }

  function maskPhone(input) {
    if (!input || input.__amfMask) return;
    input.__amfMask = true;
    input.setAttribute('inputmode', 'tel');
    input.addEventListener('input', function () {
      const atEnd = input.selectionStart === input.value.length;
      const next = formatPhone(input.value);
      if (next !== input.value) {
        input.value = next;
        if (atEnd) input.setSelectionRange(next.length, next.length);
      }
    });
  }

  window.AmfodentLeads = {
    send: send,
    isConfigured: isConfigured,
    contactTimes: contactTimes,
    formatPhone: formatPhone,
    isPhoneValid: isPhoneValid,
    maskPhone: maskPhone
  };
})();

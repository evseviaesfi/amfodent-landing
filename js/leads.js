/**
 * ОТПРАВКА ЗАЯВОК — единая точка для всех форм лендинга
 * -----------------------------------------------------
 * Используют: калькулятор (app.js → submitLead) и окно «Консультация инженера»
 * (landing.js). Заявка дублируется в два канала, чтобы не потеряться:
 *
 *   1. Telegram-чат менеджеров — впишите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID
 *      (как получить — SETUP.md). Пока пусто — канал пропускается.
 *   2. Почта EMAIL_TO через бесплатный сервис FormSubmit (formsubmit.co).
 *      При ПЕРВОЙ заявке на этот адрес придёт письмо «Activate Form» —
 *      нужно один раз нажать кнопку в письме, после этого заявки идут сами.
 *
 * Заявка считается доставленной, если дошла хотя бы в один канал.
 * Токен бота виден в коде страницы — он умеет только писать в один чат,
 * доступ к CRM и почте через него получить нельзя.
 */
(function () {
  'use strict';

  const TELEGRAM_BOT_TOKEN = ''; // например: '123456789:AA...'
  const TELEGRAM_CHAT_ID = '';   // например: '-1001234567890'
  const EMAIL_TO = 'zakaz@amfodent.ru';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * lead = {
   *   subject: 'Консультация инженера',
   *   urgent: true|false,              // «в течение часа» — помечается в сообщении
   *   fields: [['Имя', 'Анна'], ['Телефон', '+7…'], …]  // пустые значения пропускаются
   * }
   */
  function clean(fields) {
    return (fields || []).filter(function (f) {
      return f && f[1] !== null && f[1] !== undefined && String(f[1]).trim() !== '';
    });
  }

  function sendTelegram(lead) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return Promise.resolve(null);
    const lines = [];
    lines.push((lead.urgent ? '🔴 СРОЧНО · ' : '') + '<b>' + esc(lead.subject) + '</b>');
    lines.push('');
    clean(lead.fields).forEach(function (f) {
      const value = String(f[1]);
      if (value.indexOf('\n') !== -1) {
        lines.push('<b>' + esc(f[0]) + ':</b>');
        value.split('\n').forEach(function (row) { lines.push('• ' + esc(row)); });
      } else {
        lines.push('<b>' + esc(f[0]) + ':</b> ' + esc(value));
      }
    });
    return fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: lines.join('\n'), parse_mode: 'HTML' })
    })
      .then(function (r) { return r.ok; })
      .catch(function (err) { console.warn('[Amfodent] Telegram:', err); return false; });
  }

  function sendEmail(lead) {
    if (!EMAIL_TO) return Promise.resolve(null);
    const body = {
      _subject: (lead.urgent ? 'СРОЧНО · ' : '') + lead.subject + ' — лендинг Амфодент',
      _template: 'table',
      _captcha: 'false'
    };
    clean(lead.fields).forEach(function (f) { body[f[0]] = String(f[1]); });
    if (lead.replyTo) body._replyto = lead.replyTo;
    return fetch('https://formsubmit.co/ajax/' + encodeURIComponent(EMAIL_TO), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { return j && (j.success === true || j.success === 'true'); })
      .catch(function (err) { console.warn('[Amfodent] Email:', err); return false; });
  }

  function send(lead) {
    return Promise.all([sendTelegram(lead), sendEmail(lead)]).then(function (res) {
      const channels = { telegram: res[0], email: res[1] };
      return { delivered: res[0] === true || res[1] === true, channels: channels };
    });
  }

  function isConfigured() {
    return !!((TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) || EMAIL_TO);
  }

  window.AmfodentLeads = { send: send, isConfigured: isConfigured };
})();

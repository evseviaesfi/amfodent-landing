/**
 * КОНФИГУРАЦИЯ КАЛЬКУЛЯТОРА «АМФОДЕНТ»
 * ------------------------------------
 * ЕДИНСТВЕННОЕ место, где нужно менять цены, названия шагов, варианты выбора
 * и тексты интерфейса. Логика (js/app.js, js/calculator.js) ничего из этого
 * не хранит — она только читает значения отсюда.
 *
 * Поля позиций:
 *   price        — цена в целых рублях (без копеек), форматируется в интерфейсе;
 *   provisional  — true: цена предварительная, требует проверки по каталогу;
 *   priceFrom    — true: в интерфейсе цена показывается с префиксом «от»;
 *   scaling      — 'once' (по умолчанию) цена за весь кабинет,
 *                  'perWorkplace' цена умножается на число рабочих мест.
 *
 * Проверить перед публикацией: все позиции с provisional: true (см. INTEGRATION.md).
 */
const AMFODENT_CONFIG = {

  meta: {
    currency: '₽',

    // Обязательная пометка. Показывается в шапке, в панели расчёта и на шаге итога.
    disclaimer: 'Расчёт предварительный и не является публичной офертой. Точная стоимость определяется после уточнения комплектации.',

    // Диапазон вокруг ориентировочной суммы.
    rangeMinusPercent: 5,
    rangePlusPercent: 10,

    // Округление границ диапазона (сама сумма не округляется, чтобы таблица
    // расшифровки сходилась). Для сумм от heavyThreshold шаг крупнее.
    roundStep: 10000,
    roundStepHeavy: 50000,
    heavyThreshold: 1000000,

    provisionalNote: 'Часть цен в расчёте предварительная и уточняется по актуальному каталогу.',

    // Показывается в «Уточняется отдельно», если выбрано больше одного рабочего места.
    multiWorkplaceNote: 'Компрессор и стерилизация для нескольких рабочих мест — мощность и комплектацию подберёт менеджер',

    // ID счётчика Яндекс.Метрики. Укажите при интеграции — см. INTEGRATION.md.
    yandexMetrikaCounterId: null
  },

  // ----- ТЕКСТЫ ИНТЕРФЕЙСА -----

  ui: {
    brand: 'АМФОДЕНТ',
    title: 'Калькулятор оснащения стоматологического кабинета',
    subtitle: '2 минуты — и вы знаете бюджет. Выберите состав оборудования, расчёт можно отправить менеджеру вместе с контактами.',

    buttons: {
      back: 'Назад',
      next: 'Далее',
      submit: 'Отправить заявку',
      refill: 'Заполнить заново',
      reset: 'Рассчитать заново'
    },

    panel: {
      title: 'Ваш расчёт',
      empty: 'Выберите параметры — сумма появится здесь.',
      equipment: 'Оборудование',
      install: 'Монтаж и ввод в эксплуатацию',
      total: 'Ориентировочная сумма',
      range: 'Возможный диапазон',
      provisionalBadge: 'предварительно',
      detailsToggle: 'Состав расчёта'
    },

    labels: {
      position: 'Позиция',
      quantity: 'Кол-во',
      unitPrice: 'Цена за ед.',
      lineTotal: 'Сумма',
      equipmentTotal: 'Оборудование, итого',
      grandTotal: 'Ориентировочная сумма',
      rangeTitle: 'Возможный диапазон стоимости',
      clarifyTitle: 'Уточняется отдельно',
      emptyBreakdown: 'Оборудование не выбрано. Вернитесь к предыдущим шагам, чтобы увидеть расшифровку.',
      priceFree: 'без затрат',
      provisionalShort: 'предв.',
      provisionalTitle: 'Предварительная цена, требует проверки по каталогу',
      recommended: 'подходит по числу мест',
      perWorkplace: 'за рабочее место',
      perWorkplaceShort: 'по числу мест',
      alwaysIncluded: 'входит в комплект',
      chooseKitFirst: 'Сначала выберите комплект на предыдущем шаге.',
      kitIncluded: 'входит всегда',
      kitOptional: 'Добавить в расчёт',
      fovHint: 'Поле обзора выберете после отметки',
      includes: 'Состав',
      optional: '(необязательно)',
      required: '*'
    },

    // ----- ФОРМА ЗАЯВКИ -----
    form: {
      title: 'Отправить расчёт менеджеру',
      note: 'Менеджер свяжется с вами, чтобы уточнить комплектацию и подготовить точную стоимость.',
      fields: {
        name:    { label: 'Имя', required: true, placeholder: 'Как к вам обращаться' },
        phone:   { label: 'Телефон', required: true, placeholder: '+7 900 000-00-00' },
        email:   { label: 'Email', required: false, placeholder: 'name@example.com', requiredForContactMethod: 'email' },
        city:    { label: 'Город', required: false, placeholder: 'Город размещения кабинета' },
        contactMethod: { label: 'Удобный способ связи', required: true },
        comment: { label: 'Комментарий', required: false, placeholder: 'Сроки, пожелания по моделям, вопросы' }
      },
      consentLabel: 'Согласен на обработку персональных данных для ответа на эту заявку',
      errors: {
        name: 'Укажите имя',
        phone: 'Укажите телефон',
        phoneFormat: 'Проверьте номер телефона — нужно не менее 10 цифр',
        email: 'Укажите email — вы выбрали его способом связи',
        emailFormat: 'Проверьте адрес электронной почты',
        contactMethod: 'Выберите удобный способ связи',
        consent: 'Нужно согласие на обработку персональных данных',
        summary: 'Проверьте выделенные поля.'
      }
    },

    submitted: {
      title: 'Расчёт сформирован',
      note: 'Реальная отправка на сервер и в CRM подключается на этапе интеграции (см. INTEGRATION.md). Ниже — объект данных, который будет передан.',
      payloadTitle: 'Объект заявки'
    },

    resetConfirm: 'Начать расчёт заново? Выбранные параметры сбросятся.'
  },

  // ----- ШАГИ -----

  steps: [
    {
      id: 'goal',
      nav: 'Задача',
      title: 'Какая задача стоит перед кабинетом?',
      subtitle: 'Это влияет на состав оборудования, который предложит менеджер.'
    },
    {
      id: 'workplaces',
      nav: 'Рабочие места',
      title: 'Сколько рабочих мест нужно оснастить?',
      subtitle: 'Установка, мебель и наконечники считаются на каждое рабочее место.'
    },
    {
      id: 'kit',
      nav: 'Комплект',
      title: 'Выберите комплект',
      subtitle: 'Установка и компрессор входят в любой комплект. Стерилизацию, мебель и наконечники добавите на следующем шаге.'
    },
    {
      id: 'composition',
      nav: 'Состав',
      title: 'Состав комплекта',
      subtitle: 'Установка и компрессор входят всегда. Отметьте, что ещё добавить в расчёт.'
    },
    {
      id: 'xray',
      nav: 'Рентген и 3D',
      title: 'Рентген и 3D-диагностика',
      subtitle: 'Можно выбрать несколько позиций или пропустить шаг.'
    },
    {
      id: 'services',
      nav: 'Услуги',
      title: 'Монтаж и дополнительные услуги',
      subtitle: 'Доставка и монтаж оплачиваются отдельно и не входят в сумму расчёта — их стоимость менеджер укажет в коммерческом предложении.'
    },
    {
      id: 'summary',
      nav: 'Итог и заявка',
      title: 'Итог расчёта и заявка',
      subtitle: 'Проверьте состав расчёта и отправьте его менеджеру.'
    }
  ],

  // ----- ШАГ 1: задача -----
  goals: [
    { id: 'new',     label: 'Новый кабинет',       hint: 'Оснащение с нуля' },
    { id: 'replace', label: 'Замена оборудования', hint: 'Обновление действующего кабинета' },
    { id: 'expand',  label: 'Расширение',          hint: 'Добавление новых рабочих мест' }
  ],

  // ----- ШАГ 2: рабочие места -----
  // count — число, которое используется в расчёте для варианта.
  workplaces: [
    { id: '1', label: '1 место',        count: 1 },
    { id: '2', label: '2 места',        count: 2 },
    { id: '3', label: '3 места',        count: 3 },
    { id: '4', label: '4 и более',      count: 4, hint: 'Точное число уточним при согласовании' }
  ],

  // ----- ШАГИ 3–4: комплекты -----
  // Состав комплектов — конкретные модели от отдела продаж (Маргарита, октябрь 2026).
  // Все цены — «от», за единицу.
  //   required: true  — позиция входит в комплект всегда, без галочки;
  //   required: false — добавляется галочкой на шаге «Состав».
  //   scaling: 'perWorkplace' — умножается на число рабочих мест.
  kitComponents: [
    { id: 'installation',  group: 'Стоматологическая установка', required: true,  scaling: 'perWorkplace' },
    { id: 'compressor',    group: 'Компрессор',                  required: true,  scaling: 'once' },
    { id: 'sterilization', group: 'Стерилизация',                required: false, scaling: 'once' },
    { id: 'furniture',     group: 'Медицинская мебель',          required: false, scaling: 'perWorkplace' },
    { id: 'handpieces',    group: 'Наконечники',                 required: false, scaling: 'perWorkplace' }
  ],

  kits: [
    {
      id: 'starter',
      label: 'Стартовый',
      items: {
        installation:  { label: 'Установка Premier 05', price: 270000, priceFrom: true },
        compressor:    { label: 'Компрессор Mercury HK-1EW-30, 70 л', price: 30000, priceFrom: true },
        sterilization: { label: 'Комплект стерилизации', price: 130000, priceFrom: true,
                         includes: ['Автоклав Runyes Wind 23 л', 'Дистиллятор', 'Запечатывающее устройство'] },
        furniture:     { label: 'Мебель Arkodent 4', price: 88000, priceFrom: true },
        handpieces:    { label: 'Наконечники Tosi', price: 20200, priceFrom: true,
                         includes: ['Турбинный', 'Угловой', 'Прямой', 'Воздушный мотор'] }
      }
    },
    {
      id: 'basic',
      label: 'Базовый',
      items: {
        installation:  { label: 'Установка Kaiser', price: 480000, priceFrom: true },
        compressor:    { label: 'Компрессор Mercury HK-2EW-35, 100 л', price: 40000, priceFrom: true },
        sterilization: { label: 'Комплект стерилизации', price: 130000, priceFrom: true,
                         includes: ['Автоклав Runyes Wind 23 л', 'Дистиллятор', 'Запечатывающее устройство'] },
        furniture:     { label: 'Мебель Arkodent 3', price: 132000, priceFrom: true },
        handpieces:    { label: 'Наконечники Tosi', price: 20200, priceFrom: true,
                         includes: ['Турбинный', 'Угловой', 'Прямой', 'Воздушный мотор'] }
      }
    },
    {
      id: 'optimum',
      label: 'Надёжный оптимум',
      items: {
        installation:  { label: 'Установка Stern Weber S200 Continental', price: 900000, priceFrom: true },
        compressor:    { label: 'Компрессор Lifedent SP075', price: 110000, priceFrom: true },
        sterilization: { label: 'Расширенный комплект стерилизации', price: 230000, priceFrom: true,
                         includes: ['Автоклав Stern Weber SW-22', 'Дистиллятор', 'Запечатывающее устройство', 'Аппарат для чистки и смазки наконечников'] },
        furniture:     { label: 'Мебель Arkodent 3', price: 132000, priceFrom: true },
        handpieces:    { label: 'Наконечники Sirona', price: 70000, priceFrom: true,
                         includes: ['Турбинный', 'Угловой', 'Прямой'] }
      }
    },
    {
      id: 'premium',
      label: 'Премиум',
      items: {
        installation:  { label: 'Установка Stern Weber S380 TRC', price: 1400000, priceFrom: true },
        compressor:    { label: 'Компрессор Lifedent SP075', price: 110000, priceFrom: true },
        sterilization: { label: 'Расширенный комплект стерилизации', price: 230000, priceFrom: true,
                         includes: ['Автоклав Stern Weber SW-22', 'Дистиллятор', 'Запечатывающее устройство', 'Аппарат для чистки и смазки наконечников'] },
        furniture:     { label: 'Мебель Arkodent 1', price: 190000, priceFrom: true },
        handpieces:    { label: 'Наконечники Sirona', price: 70000, priceFrom: true,
                         includes: ['Турбинный', 'Угловой', 'Прямой'] }
      }
    }
  ],

  // ----- ШАГ 5: рентген и 3D (множественный выбор) -----
  // hasFov: true — у позиции есть выбор поля обзора (см. tomographFov ниже).
  xray: [
    { id: 'portable',   label: 'Портативный рентген Genoray Port-X IVe', price: 140000, priceFrom: true },
    { id: 'wall',       label: 'Настенный рентген MyRay RXDC eXtend',    price: 130000, priceFrom: true },
    { id: 'visiograph', label: 'Радиовизиограф MyRay Zen-X HD',          price: 120000, priceFrom: true },
    { id: 'tomograph',  label: '3D-томограф', hasFov: true }
  ],

  // Цены томографов указаны вместе с цефалостатом (к полю 10×10 он не подходит),
  // поэтому отдельно цефалостат не выделяем — по словам отдела продаж.
  tomographFov: {
    label: 'Поле обзора',
    options: [
      { id: '10x10', label: '10×10 см', model: 'MyRay Hyperion X5',     price: 2100000, priceFrom: true },
      { id: '11x13', label: '11×13 см', model: 'MyRay Hyperion X9',     price: 3200000, priceFrom: true },
      { id: '13x16', label: '13×16 см', model: 'MyRay Hyperion X9 PRO', price: 3500000, priceFrom: true },
      { id: '16x18', label: '16×18 см', model: '',                      price: 3900000, priceFrom: true }
    ]
  },

  // ----- ШАГ 6: дополнительное оснащение (множественный выбор) -----
  // Пока убрано по решению отдела продаж (октябрь 2026): лампа, хирургия,
  // микроскоп, сканер, расходники. Чтобы вернуть — заполнить список и вернуть
  // шаг { id: 'extras' } в steps.
  extras: [],

  // ----- ШАГ 7: услуги -----
  services: {
    delivery: {
      label: 'Доставка',
      note: 'Рассчитывается отдельно по адресу и объёму поставки.',
      clarifyNote: 'Доставка — рассчитывается отдельно по адресу и объёму'
    },
    installService: {
      label: 'Монтаж и ввод в эксплуатацию',
      percent: 8,
      min: 80000,
      // false — монтаж не прибавляется к сумме, а считается отдельно (решение отдела продаж).
      includedInTotal: false,
      note: 'Оплачивается отдельно — стоимость менеджер укажет в коммерческом предложении.',
      clarifyNote: 'Монтаж и ввод в эксплуатацию — оплачиваются отдельно',
      separateLabel: 'оплачивается отдельно',
      currentPrefix: 'по текущему расчёту'
    },
    warrantyInfo: {
      label: 'Гарантия производителя',
      note: 'Срок и условия зависят от производителя оборудования и уточняются при согласовании комплектации.'
    },
    extendedService: {
      id: 'extended_service',
      label: 'Расширенное сервисное обслуживание',
      note: 'Стоимость по запросу — не входит в сумму расчёта. Менеджер предложит условия после заявки.',
      clarifyNote: 'Расширенное сервисное обслуживание — стоимость по запросу'
    }
  },

  contactMethods: [
    { id: 'phone',    label: 'Звонок' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'email',    label: 'Email' }
  ],

  // ----- СОБЫТИЯ АНАЛИТИКИ -----
  // Заготовки имён событий. Отправку см. в js/analytics.js.
  analyticsEvents: {
    start:        'calculator_start',         // первый показ калькулятора
    step:         'calculator_step',          // переход на шаг
    optionChange: 'calculator_option_change', // изменение комплектации
    result:       'calculator_result',        // пользователь дошёл до итога
    submit:       'calculator_submit',        // отправка формы
    reset:        'calculator_reset'          // сброс расчёта
  }
};

// Доступ из других файлов без порядковых сюрпризов при встраивании в шаблон.
if (typeof window !== 'undefined') window.AMFODENT_CONFIG = AMFODENT_CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = AMFODENT_CONFIG;

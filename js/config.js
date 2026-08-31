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
      reset: 'Сбросить расчёт'
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

    resetConfirm: 'Сбросить все выбранные параметры и начать расчёт заново?'
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
      subtitle: 'Число мест влияет на количество установок, подбор компрессора и аспирации.'
    },
    {
      id: 'installation',
      nav: 'Установки',
      title: 'Класс стоматологической установки',
      subtitle: 'Цена указана за одну установку. Количество по умолчанию равно числу рабочих мест — его можно изменить.'
    },
    {
      id: 'compressor',
      nav: 'Компрессор',
      title: 'Компрессор и аспирация',
      subtitle: 'Вариант подсказывается по числу рабочих мест — выбор можно изменить вручную.'
    },
    {
      id: 'sterilization',
      nav: 'Стерилизация',
      title: 'Стерилизация',
      subtitle: 'В расширенный комплект входит больше оборудования для полного цикла обработки инструментов.'
    },
    {
      id: 'xray',
      nav: 'Рентген',
      title: 'Рентгенодиагностика',
      subtitle: 'Выберите один вариант — от прицельного рентгена до 3D-томографа.'
    },
    {
      id: 'extras',
      nav: 'Оснащение',
      title: 'Дополнительное оснащение',
      subtitle: 'Можно выбрать несколько позиций. Цены указаны за комплект на кабинет — объём для нескольких рабочих мест уточняется менеджером.'
    },
    {
      id: 'services',
      nav: 'Услуги',
      title: 'Монтаж и дополнительные услуги',
      subtitle: 'Доставка и монтаж считаются отдельно от стоимости оборудования.'
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

  // ----- ШАГ 3: стоматологические установки -----
  installations: {
    quantityLabel: 'Количество установок',
    quantityMin: 1,
    quantityMax: 20,
    brandLabel: 'Предпочтительный бренд',
    brandPlaceholder: 'Например: Lifedent, Stern Weber, Siger',
    tiers: [
      { id: 'basic',    label: 'Базовая',     price: 420000,  provisional: true, hint: 'Базовый набор функций для терапевтического приёма' },
      { id: 'standard', label: 'Стандартная', price: 750000,  provisional: true, hint: 'Расширенная комплектация относительно базовой' },
      { id: 'premium',  label: 'Премиальная', price: 1350000, provisional: true, hint: 'Максимальная комплектация в линейке' }
    ]
  },

  // ----- ШАГ 4: компрессор и аспирация -----
  // Цены — ориентир по действующему прайсу сайта Амфодент (компрессор + аспирация
  // считаются здесь одной позицией на кабинет, отдельно на сайте они не суммируются).
  compressor: [
    { id: 'none',      label: 'Не нужны',              price: 0,      provisional: false, recommendedFor: [] },
    { id: 'one',       label: 'Для 1 рабочего места',  price: 180000, provisional: true,  recommendedFor: [1] },
    { id: 'two_three', label: 'Для 2–3 рабочих мест',  price: 320000, provisional: true,  recommendedFor: [2, 3] },
    { id: 'central',   label: 'Центральная система',   price: 600000, provisional: true,  priceFrom: true, recommendedFor: [4] }
  ],

  // ----- ШАГ 5: стерилизация -----
  sterilization: [
    { id: 'none',     label: 'Не нужна',                        price: 0,      provisional: false, includes: [] },
    { id: 'basic',    label: 'Базовый комплект',                price: 320000, provisional: true,
      includes: ['Автоклав класса B', 'Ультразвуковая мойка'] },
    { id: 'extended', label: 'Расширенная стерилизационная',    price: 580000, provisional: true,
      includes: ['Автоклав класса B', 'Ультразвуковая мойка', 'Запечатывающая машина', 'Дистиллятор'] }
  ],

  // ----- ШАГ 6: рентгенодиагностика -----
  xray: [
    { id: 'none',       label: 'Без оборудования',    price: 0,       provisional: false },
    { id: 'xray',       label: 'Рентген',             price: 230000,  provisional: true },
    { id: 'visiograph', label: 'Визиограф',           price: 190000,  provisional: true },
    { id: 'xray_visio', label: 'Рентген + визиограф', price: 330000,  provisional: true },
    { id: 'panoramic',  label: 'Панорамный аппарат',  price: 1900000, provisional: true },
    { id: 'tomograph',  label: '3D-томограф',         price: 3400000, provisional: true }
  ],

  // ----- ШАГ 7: дополнительное оснащение (множественный выбор) -----
  extras: [
    { id: 'furniture',   label: 'Мебель кабинета',                        price: 150000,  provisional: true, scaling: 'once' },
    { id: 'handpieces',  label: 'Наконечники и микромоторы',              price: 45000,   provisional: true, scaling: 'once' },
    { id: 'lamp',        label: 'Полимеризационная лампа',                price: 35000,   provisional: true, scaling: 'once' },
    { id: 'surgery',     label: 'Хирургическое оборудование',             price: 350000,  provisional: true, scaling: 'once' },
    { id: 'microscope',  label: 'Стоматологический микроскоп',            price: 1200000, provisional: true, priceFrom: true, scaling: 'once' },
    { id: 'scanner',     label: 'Интраоральный сканер',                   price: 1000000, provisional: true, scaling: 'once' },
    { id: 'consumables', label: 'Стартовый комплект расходных материалов', price: 150000,  provisional: true, scaling: 'once' }
  ],

  // ----- ШАГ 8: услуги -----
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
      note: '8% от стоимости оборудования, но не менее 80 000 ₽',
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

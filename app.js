// ЗАМЕНИТЬ на цены заказчика
// Стоимость работ за м³; для ремонта — за м². null означает, что ставка ещё не предоставлена.
const PRICES = {
  foundation: { slab: null, strip: null, pile: null },
  masonry: null,
  repair: { cosmetic: null, capital: null },
};

function calculateWork(parameters, prices = PRICES) {
  const p = parameters || {};
  const work = p.work;
  const services = {
    foundation: 'Монолитные работы',
    masonry: 'Каменные работы',
    repair: 'Ремонт и отделка',
  };
  const number = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string' || !value.trim()) return NaN;
    const normalized = value.trim().replace(',', '.');
    return /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)
      ? Number(normalized) : NaN;
  };
  const format = (value, maximumFractionDigits = 6) => new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits,
  }).format(value);
  const invalid = (message, field = 'work') => ({
    valid: false,
    volume: null,
    unit: work === 'repair' ? 'м²' : 'м³',
    formula: '',
    scope: '',
    service: services[work] || '',
    rate: null,
    total: null,
    amount: 'Стоимость — после осмотра объекта',
    message,
    parameters: [],
    text: '',
    field,
  });
  const values = {};
  const positive = (names) => {
    for (const [name, label] of names) {
      values[name] = number(p[name]);
      if (!Number.isFinite(values[name]) || values[name] <= 0) {
        return invalid(`Укажите положительное число: ${label}.`, name);
      }
    }
    return null;
  };

  let volume;
  let unit = 'м³';
  let formula;
  let scope;
  let rate;
  let lines;

  if (work === 'foundation') {
    const type = p.foundationType;
    const typeNames = { slab: 'Плитный', strip: 'Ленточный', pile: 'Свайно-ростверковый' };
    if (!typeNames[type]) return invalid('Выберите тип фундамента.', 'foundationType');
    const dimensionsError = positive([['length', 'длина фундамента'], ['width', 'ширина фундамента']]);
    if (dimensionsError) return dimensionsError;
    const { length: length, width: width } = values;
    lines = [`Фундамент: ${typeNames[type]}`, `Внешние размеры: ${format(length)} × ${format(width)} м`];

    if (type === 'slab') {
      const thicknessError = positive([['thickness', 'толщина плиты']]);
      if (thicknessError) return thicknessError;
      volume = length * width * values.thickness;
      formula = `V = L × W × T = ${format(length)} × ${format(width)} × ${format(values.thickness)} = ${format(volume)} м³`;
      scope = 'Прямоугольная плита постоянной толщины. Без рёбер, вырезов и дополнительных конструкций.';
      lines.push(`Толщина плиты: ${format(values.thickness)} м`);
    } else {
      const stripError = positive([['stripWidth', 'ширина ленты / ростверка'], ['stripHeight', 'высота ленты / ростверка']]);
      if (stripError) return stripError;
      const { stripWidth: stripWidth, stripHeight: stripHeight } = values;
      if (2 * stripWidth >= Math.min(length, width)) {
        return invalid('Ширина ленты должна быть меньше половины меньшего внешнего размера.', 'stripWidth');
      }
      const ring = (length * width - (length - 2 * stripWidth) * (width - 2 * stripWidth)) * stripHeight;
      volume = ring;
      formula = `V = (L × W − (L − 2b) × (W − 2b)) × h = (${format(length)} × ${format(width)} − (${format(length)} − 2 × ${format(stripWidth)}) × (${format(width)} − 2 × ${format(stripWidth)})) × ${format(stripHeight)}`;
      lines.push(`Ширина ленты / ростверка: ${format(stripWidth)} м`, `Высота ленты / ростверка: ${format(stripHeight)} м`);
      scope = 'Замкнутый прямоугольный контур по внешним размерам. Углы учтены один раз; внутренние ленты и перемычки не включены.';

      if (type === 'pile') {
        const pileError = positive([['pileCount', 'количество свай'], ['pileDiameter', 'диаметр сваи'], ['pileLength', 'длина сваи ниже ростверка']]);
        if (pileError) return pileError;
        if (!Number.isInteger(values.pileCount)) return invalid('Количество свай должно быть целым числом.', 'pileCount');
        const pileVolume = values.pileCount * Math.PI * (values.pileDiameter / 2) ** 2 * values.pileLength;
        volume += pileVolume;
        formula += ` + N × π × (d / 2)² × ℓ = ${format(ring)} + ${format(values.pileCount)} × π × (${format(values.pileDiameter)} / 2)² × ${format(values.pileLength)}`;
        lines.push(`Сваи: ${format(values.pileCount)} шт.`, `Диаметр сваи: ${format(values.pileDiameter)} м`, `Длина сваи ниже ростверка: ${format(values.pileLength)} м`);
        scope += ' Сваи — круглые цилиндры. Длина свай считается только ниже ростверка, без двойного учёта пересечения.';
      }
      formula += ` = ${format(volume)} м³`;
    }
    rate = prices?.foundation?.[type];
  } else if (work === 'masonry') {
    const wallError = positive([['wallArea', 'площадь стен'], ['wallThickness', 'толщина кладки']]);
    if (wallError) return wallError;
    volume = values.wallArea * values.wallThickness / 1000;
    formula = `V = A × t / 1000 = ${format(values.wallArea)} × ${format(values.wallThickness)} / 1000 = ${format(volume)} м³`;
    scope = 'Площадь стен указывается за вычетом дверных и оконных проёмов. Толщина переводится из миллиметров в метры.';
    lines = [`Площадь стен без проёмов: ${format(values.wallArea)} м²`, `Толщина кладки: ${format(values.wallThickness)} мм`];
    rate = prices?.masonry;
  } else if (work === 'repair') {
    const typeNames = { cosmetic: 'Косметический', capital: 'Капитальный' };
    if (!typeNames[p.repairType]) return invalid('Выберите тип ремонта.', 'repairType');
    const areaError = positive([['repairArea', 'площадь ремонта']]);
    if (areaError) return areaError;
    volume = values.repairArea;
    unit = 'м²';
    formula = `A = ${format(volume)} м²`;
    scope = 'Ремонт рассчитывается по указанной площади помещений. Состав и состояние поверхностей уточняются для сметы.';
    lines = [`Тип ремонта: ${typeNames[p.repairType]}`, `Площадь помещений: ${format(volume)} м²`];
    rate = prices?.repair?.[p.repairType];
  } else {
    return invalid('Выберите тип работ.');
  }

  if (!Number.isFinite(volume) || volume <= 0) return invalid('Проверьте размеры: объём должен быть положительным конечным числом.');
  const configured = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  const total = configured ? volume * rate : null;
  if (configured && !Number.isFinite(total)) return invalid('Размеры слишком велики для предварительного расчёта.');
  const amount = configured
    ? `≈ от ${format(Math.ceil(total), 0)} ₽, предварительно`
    : 'Стоимость — после осмотра объекта';
  const message = configured
    ? 'Предварительный расчёт по объёму и базовой ставке. Состав работ и точную стоимость определит смета.'
    : `Объём рассчитан: это ориентир для разговора о смете. Стоимость рассчитаем после осмотра объекта.`;
  return {
    valid: true,
    volume,
    unit,
    formula,
    scope,
    service: services[work],
    rate: configured ? rate : null,
    total,
    amount,
    message,
    parameters: lines,
    text: ['Предварительный расчёт', `Тип работ: ${services[work]}`, ...lines, `Объём: ${format(volume)} ${unit}`, `Формула: ${formula}`, `Что учтено: ${scope}`, amount].join('\n'),
    field: null,
  };
}

function setupCalculators(onRequest) {
  document.querySelectorAll('form[data-calculator]').forEach((form) => {
    const requestButton = form.querySelector('[data-calc-request]');
    const outputs = Object.fromEntries(['volume', 'formula', 'amount', 'calc-message', 'price-note'].map((key) => [key, form.querySelector(`[data-${key}]`)]));
    let result = null;
    const setText = (key, value) => {
      if (outputs[key]) outputs[key].textContent = value;
    };
    const field = (name) => form.elements.namedItem(name);
    const fieldValue = (name) => {
      const element = field(name);
      return element && typeof element.value === 'string' ? element.value : '';
    };
    const names = ['work', 'foundationType', 'length', 'width', 'thickness', 'stripWidth', 'stripHeight', 'pileCount', 'pileDiameter', 'pileLength', 'wallArea', 'wallThickness', 'repairArea', 'repairType'];

    function update() {
      const selectedWork = fieldValue('work');
      const selectedFoundation = fieldValue('foundationType');
      form.querySelectorAll('[data-calc-group]').forEach((group) => {
        group.hidden = group.dataset.calcGroup !== selectedWork;
      });
      form.querySelectorAll('[data-foundation-group]').forEach((group) => {
        group.hidden = !(group.dataset.foundationGroup || '').split(/\s+/).includes(selectedFoundation);
      });
      form.querySelectorAll('input, select, textarea').forEach((input) => {
        const parentGroups = [];
        let parent = input.parentElement;
        while (parent && parent !== form) {
          if (parent.hasAttribute('data-calc-group') || parent.hasAttribute('data-foundation-group')) parentGroups.push(parent);
          parent = parent.parentElement;
        }
        const inactive = parentGroups.some((group) => group.hidden);
        input.disabled = inactive;
        input.required = !inactive;
        input.setCustomValidity('');
        if (input instanceof HTMLInputElement && input.type === 'number') {
          input.step = input.name === 'pileCount' ? '1' : 'any';
        }
      });

      result = calculateWork(Object.fromEntries(names.map((name) => [name, fieldValue(name)])));
      setText('volume', result.valid ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(result.volume)} ${result.unit}` : '—');
      setText('formula', result.valid ? `${result.formula}\n${result.scope}` : 'Заполните параметры, чтобы увидеть формулу и объём.');
      setText('amount', result.amount);
      setText('calc-message', result.message);
      setText('price-note', result.rate === null ? 'Точная стоимость зависит от состава работ и условий объекта — рассчитаем её после осмотра.' : 'Базовая ставка применяется к рассчитанному объёму. Итоговая смета зависит от состава работ и условий объекта.');
      if (requestButton) requestButton.disabled = !result.valid;
      const invalidField = result.valid ? null : field(result.field);
      if (invalidField && !invalidField.disabled && typeof invalidField.setCustomValidity === 'function') {
        invalidField.setCustomValidity(result.message);
      }
    }

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      update();
      if (!result.valid || !form.reportValidity()) return;
      if (typeof onRequest === 'function') onRequest({ service: result.service, text: result.text });
    });
    if (requestButton && requestButton.type !== 'submit') {
      requestButton.addEventListener('click', () => {
        update();
        if (!result.valid || !form.reportValidity()) return;
        if (typeof onRequest === 'function') onRequest({ service: result.service, text: result.text });
      });
    }
    update();
  });
}

// Единая точка подготовки обращения. Для Telegram заменить транспорт здесь;
// токен бота должен оставаться на сервере, а не в браузерном JavaScript.
function sendLead(data) {
  const kindNames = {estimate: 'Заявка на смету', visit: 'Заявка на выезд специалиста', vacancy: 'Отклик на вакансию'};
  const title = kindNames[data.kind] || kindNames.estimate;
  const lines = [title + ' — REBORN HOUSE', '', 'Имя: ' + data.name, 'Телефон: ' + data.phone];
  if (data.service) lines.push('Тип работ: ' + data.service);
  if (data.job) lines.push('Направление: ' + data.job);
  if (data.address) lines.push('Адрес объекта: ' + data.address);
  if (data.start) lines.push('Желаемый срок начала: ' + data.start);
  if (data.message) lines.push('', data.kind === 'vacancy' ? 'О себе:' : 'Описание и параметры:', data.message);
  if (data.fileNames?.length) lines.push('', 'Выбранные файлы (нужно приложить вручную):', ...data.fileNames.map(name => '• ' + name));
  lines.push('', 'Согласие на обработку данных для ответа: ' + (data.consent ? 'отмечено в форме' : 'не отмечено'));
  const text = lines.join('\n');
  return {
    delivery: 'manual', text,
    mailto: 'mailto:reborn.house@mail.ru?subject=' + encodeURIComponent(title + ' — REBORN HOUSE') + '&body=' + encodeURIComponent(text),
  };
}

(() => {
  'use strict';

  const EMAIL = 'reborn.house@mail.ru';
  const PROJECTS = {
    kirov: {
      title: 'Киров',
      location: 'Карла Маркса',
      description: 'Фото с объекта: армирование и подготовка монолитных конструкций.',
      source: 'https://vk.ru/album-223259235_310802584',
      photos: ['assets/kirov-1.webp', 'assets/kirov-2.webp', 'assets/kirov-3.webp'],
    },
    inta: {
      title: 'Инта',
      location: 'Объект в Инте',
      description: 'Фото с объекта: армирование, опалубка и подготовка монолитных конструкций.',
      source: 'https://vk.ru/album-223259235_310802590',
      photos: ['assets/inta-1.webp', 'assets/inta-2.webp', 'assets/inta-3.webp'],
    },
  };

  function init() {
    const menuToggle = document.getElementById('menu-toggle');
    const siteNav = document.getElementById('site-nav');

    function closeMenu(restoreFocus = false) {
      if (!menuToggle || !siteNav) return;
      siteNav.classList.remove('is-open');
      siteNav.querySelectorAll('details').forEach(detail => detail.open = false);
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Открыть меню');
      if (restoreFocus) menuToggle.focus({ preventScroll: true });
    }

    if (menuToggle && siteNav) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.addEventListener('click', () => {
        const isOpen = siteNav.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', String(isOpen));
        menuToggle.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
        if (isOpen) siteNav.querySelector('summary,a')?.focus();
      });
      siteNav.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('a')) closeMenu();
      });
      document.addEventListener('click', (event) => {
        if (event.target instanceof Node && !siteNav.contains(event.target)
          && !menuToggle.contains(event.target)) closeMenu();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (siteNav.classList.contains('is-open')) closeMenu(true);
        else {
          const expanded = siteNav.querySelector('details[open]');
          if (expanded) {expanded.open = false; expanded.querySelector('summary')?.focus();}
        }
      });
      window.matchMedia('(min-width: 960px)').addEventListener('change', (event) => {
        if (event.matches) closeMenu();
      });
    }

    const openDialogs = new Set();
    const dialogTriggers = new WeakMap();
    let previousBodyStyle = null;

    function lockScroll(dialog) {
      if (openDialogs.size === 0) {
        previousBodyStyle = {
          overflow: document.body.style.overflow,
          paddingRight: document.body.style.paddingRight,
        };
        const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
        const bodyPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = `${bodyPadding + scrollbarWidth}px`;
        }
      }
      openDialogs.add(dialog);
    }

    function openDialog(dialog, trigger) {
      if (!dialog || dialog.open) return;
      closeMenu();
      dialogTriggers.set(dialog, trigger || document.activeElement);
      dialog.showModal();
      lockScroll(dialog);
    }

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('close', () => {
        openDialogs.delete(dialog);
        if (openDialogs.size === 0 && previousBodyStyle) {
          document.body.style.overflow = previousBodyStyle.overflow;
          document.body.style.paddingRight = previousBodyStyle.paddingRight;
          previousBodyStyle = null;
        }
        const trigger = dialogTriggers.get(dialog);
        if (openDialogs.size === 0 && trigger instanceof HTMLElement && trigger.isConnected) {
          trigger.focus({ preventScroll: true });
        }
        dialogTriggers.delete(dialog);
      });
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
      });
    });

    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const dialog = button.closest('dialog');
        if (dialog?.open) dialog.close();
      });
    });

    const projectDialog = document.getElementById('project-dialog');
    const projectTitle = document.getElementById('project-title');
    const projectLocation = document.getElementById('project-location');
    const projectDescription = document.getElementById('project-description');
    const projectImage = document.getElementById('project-main-image');
    const projectCount = document.getElementById('project-count');
    const projectSource = document.getElementById('project-source');
    const projectThumbs = document.getElementById('project-thumbs');
    let activeProject = null;
    let photoIndex = 0;

    if (projectCount) {
      projectCount.setAttribute('aria-live', 'polite');
      projectCount.setAttribute('aria-atomic', 'true');
    }

    function showPhoto(index) {
      if (!activeProject) return;
      const count = activeProject.photos.length;
      photoIndex = ((index % count) + count) % count;
      if (projectImage) {
        projectImage.src = activeProject.photos[photoIndex];
        projectImage.alt = `${activeProject.title} — фото с объекта ${photoIndex + 1} из ${count}`;
      }
      if (projectCount) projectCount.textContent = `${photoIndex + 1} / ${count}`;
      projectThumbs?.querySelectorAll('button').forEach((button, indexInGallery) => {
        const active = indexInGallery === photoIndex;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    function showProject(key, trigger) {
      const project = PROJECTS[key];
      if (!project || !projectDialog) return;
      activeProject = project;
      if (projectTitle) projectTitle.textContent = project.title;
      if (projectLocation) projectLocation.textContent = project.location;
      if (projectDescription) projectDescription.textContent = project.description;
      if (projectSource) {
        projectSource.href = project.source;
        projectSource.target = '_blank';
        projectSource.rel = 'noopener noreferrer';
      }
      if (projectThumbs) {
        const thumbnails = document.createDocumentFragment();
        project.photos.forEach((src, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'project-thumb';
          button.setAttribute('aria-label', `Показать фото ${index + 1} из ${project.photos.length}: ${project.title}`);
          const image = document.createElement('img');
          image.src = src;
          image.alt = '';
          image.loading = 'lazy';
          image.decoding = 'async';
          button.append(image);
          button.addEventListener('click', () => showPhoto(index));
          thumbnails.append(button);
        });
        projectThumbs.replaceChildren(thumbnails);
      }
      showPhoto(0);
      openDialog(projectDialog, trigger);
    }

    document.querySelectorAll('.project-open').forEach((button) => {
      button.addEventListener('click', () => {
        showProject(button.dataset.project, button);
        if (button.dataset.photo) showPhoto(Number(button.dataset.photo));
      });
    });
    document.getElementById('gallery-prev')?.addEventListener('click', () => showPhoto(photoIndex - 1));
    document.getElementById('gallery-next')?.addEventListener('click', () => showPhoto(photoIndex + 1));
    projectDialog?.addEventListener('keydown', (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        showPhoto(photoIndex + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });

    const briefDialog = document.getElementById('brief-dialog');
    const visitDialog = document.getElementById('visit-dialog');
    const privacyDialog = document.getElementById('privacy-dialog');
    const briefForm = document.getElementById('brief-form');

    function chooseService(service) {
      const select = briefForm?.elements.namedItem('service');
      if (select instanceof HTMLSelectElement && Array.from(select.options).some(o => o.value === service)) select.value = service;
    }
    function openBrief(trigger, service, parameters) {
      chooseService(service || document.body.dataset.defaultService);
      if (parameters && briefForm) {
        const field = briefForm.elements.namedItem('message');
        if (field instanceof HTMLTextAreaElement) field.value = parameters;
      }
      openDialog(briefDialog, trigger);
    }
    document.querySelectorAll('.brief-open').forEach(button => button.addEventListener('click', () => openBrief(button, button.dataset.service)));
    document.querySelectorAll('.visit-open').forEach(button => button.addEventListener('click', () => openDialog(visitDialog, button)));
    document.querySelectorAll('.privacy-open').forEach(button => button.addEventListener('click', () => openDialog(privacyDialog, button)));
    // Карта Яндекса подключается только по нажатию: до этого сторонний сервис не загружается и не ставит cookie.
    document.querySelectorAll('[data-map-src]').forEach(button => button.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = button.dataset.mapSrc;
      frame.title = button.dataset.mapTitle || 'Карта';
      frame.loading = 'lazy';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      button.closest('.map-placeholder').replaceWith(frame);
    }));
    setupCalculators(({service, text}) => openBrief(document.activeElement, service, text));

    document.querySelectorAll('[data-lead-panel]').forEach(panel => {
      const form = panel.querySelector('[data-lead-form]');
      const result = panel.querySelector('[data-lead-result]');
      const text = panel.querySelector('[data-lead-text]');
      const email = panel.querySelector('[data-lead-email]');
      const status = panel.querySelector('[data-lead-status]');
      const copy = panel.querySelector('[data-lead-copy]');
      const fileNames = panel.querySelector('[data-file-names]');
      const value = name => String(form.elements.namedItem(name)?.value || '').trim();
      const files = () => Array.from(form.elements.namedItem('files')?.files || []).map(file => file.name);
      const updateFiles = () => { if (fileNames) fileNames.textContent = files().length ? files().join(' · ') : 'Файлы не выбраны'; };
      form.elements.namedItem('files')?.addEventListener('change', updateFiles);
      const name = form.elements.namedItem('name');
      const phone = form.elements.namedItem('phone');
      const address = form.elements.namedItem('address');
      const validate = () => {
        name.setCustomValidity(value('name') ? '' : 'Введите имя.');
        const raw = value('phone'); const digits = raw.replace(/\D/g, '');
        const valid = /^[+\d\s()\-]+$/.test(raw) && (digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits)));
        phone.setCustomValidity(valid ? '' : 'Введите российский телефон: десять цифр или одиннадцать, начиная с 7 или 8.');
        if (address) address.setCustomValidity(value('address') ? '' : 'Укажите расположение объекта.');
      };
      [name,phone,address].filter(Boolean).forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
      form.addEventListener('submit', event => {
        event.preventDefault(); validate();
        if (!form.reportValidity()) return;
        const prepared = sendLead({kind:form.dataset.kind, name:value('name'), phone:value('phone'), service:value('service'), address:value('address'), message:value('message'), start:value('start'), job:value('job'), fileNames:files(), consent:form.elements.namedItem('consent').checked});
        text.value = prepared.text; email.href = prepared.mailto;
        form.hidden = true; result.hidden = false;
        status.textContent = 'Письмо подготовлено. Отправьте его самостоятельно или скопируйте текст.';
        text.focus();
      });
      panel.querySelector('[data-lead-edit]').addEventListener('click', () => {
        result.hidden = true; form.hidden = false; status.textContent = ''; name.focus();
      });
      copy.addEventListener('click', async () => {
        copy.disabled = true; status.textContent = 'Копируем текст…';
        const captured = text.value; const copied = await copyToClipboard(captured);
        copy.disabled = false;
        if (result.hidden || captured !== text.value) return;
        if (copied) status.textContent = 'Текст скопирован. Вставьте его в письмо или сообщение.';
        else {text.focus(); text.select(); status.textContent = 'Автоматическое копирование недоступно. Текст выделен — скопируйте его вручную.';}
      });
      panel.closest('dialog')?.addEventListener('close', () => {
        form.reset(); form.querySelectorAll('input,textarea').forEach(field=>field.setCustomValidity(''));
        form.hidden=false; result.hidden=true; text.value=''; email.removeAttribute('href'); status.textContent=''; updateFiles();
      });
    });

    document.querySelectorAll('[data-job]').forEach(link=>link.addEventListener('click',()=>{
      const form=document.querySelector('form[data-kind="vacancy"]');
      if(!form)return;
      const panel=form.closest('[data-lead-panel]');
      panel.querySelector('[data-lead-result]').hidden=true; form.hidden=false;
      panel.querySelector('[data-lead-status]').textContent='';
      form.elements.namedItem('job').value=link.dataset.job;
      form.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      form.elements.namedItem('job').focus({preventScroll:true});
    }));

    document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
      const status=document.querySelector('[data-contact-status]');
      button.disabled=true; const copied=await copyToClipboard(button.dataset.copy); button.disabled=false;
      if(!status)return;
      if(copied) status.textContent='Скопировано: '+button.dataset.copy;
      else {
        const value=document.createElement('span'); value.textContent=button.dataset.copy;
        status.replaceChildren(document.createTextNode('Копирование недоступно. Скопируйте вручную: '),value);
        const selection=window.getSelection(); if(selection){const range=document.createRange();range.selectNodeContents(value);selection.removeAllRanges();selection.addRange(range);}
      }
    }));

    document.querySelectorAll('[data-faq]').forEach(container=>{
      const search=container.querySelector('[data-faq-search]'); if(!search)return;
      const items=Array.from(container.querySelectorAll('[data-faq-item]'));
      const norm=value=>value.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
      const update=()=>{
        const query=norm(search.value);let count=0;
        items.forEach(item=>{item.hidden=!!query&&!norm(item.textContent).includes(query);if(!item.hidden)count++;item.open=!!query&&!item.hidden;});
        container.querySelector('[data-faq-count]').textContent=query?'Найдено: '+count+' из '+items.length:'Вопросов: '+items.length;
        container.querySelector('[data-faq-empty]').hidden=count!==0;
      };
      search.addEventListener('input',update);
      container.querySelector('[data-faq-clear]').addEventListener('click',()=>{search.value='';update();search.focus();});
      search.addEventListener('keydown',event=>{if(event.key==='Escape'){search.value='';update();}});update();
    });

    document.querySelectorAll('[data-project-filter]').forEach(container=>{
      const work=container.querySelector('[data-filter-work]');const city=container.querySelector('[data-filter-city]');
      const cards=Array.from(container.querySelectorAll('[data-project-card]'));
      const update=()=>{let count=0;cards.forEach(card=>{card.hidden=!(work.value==='all'||card.dataset.work===work.value)||!(city.value==='all'||card.dataset.city===city.value);if(!card.hidden)count++;});container.querySelector('[data-filter-count]').textContent='Показано: '+count+' из '+cards.length;container.querySelector('[data-filter-empty]').hidden=count!==0;};
      work.addEventListener('change',update);city.addEventListener('change',update);container.querySelector('[data-filter-reset]').addEventListener('click',()=>{work.value='all';city.value='all';update();});update();
    });

    document.querySelectorAll('[data-steps]').forEach(container=>{
      const steps=JSON.parse(container.querySelector('[data-step-content]').textContent);
      const tabs=Array.from(container.querySelectorAll('[data-step]'));
      const panel=container.querySelector('[role="tabpanel"]');
      const show=(index,focus=false)=>{tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});panel.setAttribute('aria-labelledby',tabs[index].id);container.querySelector('[data-step-number]').textContent=String(index+1).padStart(2,'0');container.querySelector('[data-step-title]').textContent=steps[index].title;container.querySelector('[data-step-text]').textContent=steps[index].text;if(focus)tabs[index].focus();};
      tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>show(index));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();show(next,true);}});});
    });

    async function copyToClipboard(text) {
      try {
        if (!navigator.clipboard?.writeText) return false;
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }

    const contactCopy = document.getElementById('contact-copy');
    const contactStatus = document.getElementById('contact-status');
    contactCopy?.addEventListener('click', async () => {
      if (contactCopy.disabled) return;
      contactCopy.disabled = true;
      if (contactStatus) contactStatus.textContent = 'Копируем адрес…';
      const copied = await copyToClipboard(EMAIL);
      contactCopy.disabled = false;
      if (!contactStatus) return;
      if (copied) {
        contactStatus.textContent = 'Адрес электронной почты скопирован.';
      } else {
        const address = document.createElement('span');
        address.textContent = EMAIL;
        contactStatus.replaceChildren(
          document.createTextNode('Автоматическое копирование недоступно. Скопируйте выделенный адрес вручную: '),
          address,
        );
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(address);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

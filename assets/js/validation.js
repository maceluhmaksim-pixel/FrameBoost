/* ==========================================================
   FrameBoost — клієнтська валідація форми зворотного зв'язку (ЛР №9)
   Vanilla JS, без бібліотек.

   ВАЖЛИВО: реального надсилання на сервер немає. Скрипт перехоплює submit
   (preventDefault), перевіряє поля, показує модальне вікно та очищає форму.
   ========================================================== */
(() => {
  'use strict';

  /* ---------- 1. Конфігурація: RegEx і числові правила ---------- */

  // Email: латинські символи в локальній частині, домен із крапкою та TLD від 2 літер.
  // Це спрощене правило для навчальної форми, а не повна специфікація RFC 5322.
  const REGEX_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

  // Телефон: рівно «+380» і потім 9 цифр. Жодних пробілів, дужок, дефісів, літер.
  const REGEX_PHONE = /^\+380\d{9}$/;

  const RULES = {
    nameMin: 2,
    messageMin: 10,
  };

  const SUBMIT_DELAY_MS = 700; // імітація відправлення

  /* ---------- 2. Функції валідації ----------
     Кожна повертає текст помилки або '' (якщо значення коректне). */

  // Рахуємо символи Unicode, а не «кодові одиниці»: емодзі = 1 символ.
  const countChars = (text) => [...text].length;

  function validateName(value) {
    const name = value.trim();
    if (!name) return 'Введіть ваше ім’я.';
    if (countChars(name) < RULES.nameMin) {
      return `Ім’я має містити щонайменше ${RULES.nameMin} символи.`;
    }
    return '';
  }

  function validateEmail(value) {
    const email = value.trim();
    if (!email) return 'Введіть електронну адресу.';
    if (!REGEX_EMAIL.test(email)) {
      return 'Введіть коректну електронну адресу, наприклад user@example.com.';
    }
    return '';
  }

  function validatePhone(value) {
    if (!value) return 'Введіть номер телефону.';
    if (REGEX_PHONE.test(value)) return '';

    // Уточнюємо повідомлення для найтиповішої помилки: невірна кількість цифр після +380.
    const afterPrefix = value.startsWith('+380') ? value.slice(4) : null;
    if (afterPrefix !== null && /^\d*$/.test(afterPrefix)) {
      return `Після +380 має бути рівно 9 цифр, зараз ${afterPrefix.length}.`;
    }
    return 'Номер має бути у форматі +380XXXXXXXXX: без пробілів, дужок, дефісів і літер.';
  }

  function validateMessage(value) {
    const message = value.trim();
    if (!message) return 'Напишіть повідомлення.';
    const length = countChars(message);
    if (length < RULES.messageMin) {
      return `Повідомлення закоротке: потрібно щонайменше ${RULES.messageMin} символів, зараз ${length}.`;
    }
    return '';
  }

  function validateAgreement(isChecked) {
    return isChecked ? '' : 'Щоб надіслати форму, потрібна згода з політикою конфіденційності.';
  }

  /* UX-підказка (НЕ частина RegEx): якщо номер можна безпечно привести до +380XXXXXXXXX,
     пропонуємо виправлення кнопкою. Значення в полі автоматично не змінюємо. */
  function suggestPhone(value) {
    const raw = value.trim();
    const cleaned = raw.replace(/[\s().-]/g, '');
    let suggestion = null;

    if (/^0\d{9}$/.test(cleaned)) suggestion = `+38${cleaned}`;        // 0501234567
    else if (/^380\d{9}$/.test(cleaned)) suggestion = `+${cleaned}`;   // 380501234567
    else if (REGEX_PHONE.test(cleaned)) suggestion = cleaned;          // +380 50 123 45 67

    return suggestion && suggestion !== value ? suggestion : null;
  }

  /* ---------- 3. Опис полів ---------- */

  const form = document.getElementById('feedbackForm');
  if (!form) return;

  const $ = (id) => document.getElementById(id);

  const fields = [
    { id: 'username', validate: (el) => validateName(el.value) },
    { id: 'email', validate: (el) => validateEmail(el.value) },
    { id: 'phone', validate: (el) => validatePhone(el.value) },
    { id: 'message', validate: (el) => validateMessage(el.value) },
    { id: 'agreement', validate: (el) => validateAgreement(el.checked), box: 'agreementBox', event: 'change' },
  ].map((config) => {
    const el = $(config.id);
    const wrapper = el.closest('div');
    return {
      ...config,
      el,
      stateEl: config.box ? $(config.box) : el,           // елемент, що отримує data-state
      errorEl: $(`${config.id}Error`),
      icon: wrapper.querySelector('[data-success-icon]'),  // галочка успіху (може не бути)
      touched: false,                                      // чи взаємодіяв користувач із полем
    };
  });

  const phoneField = fields.find((f) => f.id === 'phone');
  const phoneFix = $('phoneFix');
  const submitBtn = $('submitBtn');
  const submitLabel = submitBtn.querySelector('[data-btn-label]');
  const formStatus = $('formStatus');
  const modal = $('successModal');
  const modalClose = $('modalClose');

  /* ---------- 4. UI: показ та очищення станів ---------- */

  function setStatus(message) {
    formStatus.textContent = message;
    formStatus.classList.toggle('hidden', !message);
    formStatus.classList.toggle('flex', Boolean(message));
  }

  function hidePhoneFix() {
    phoneFix.classList.add('hidden');
    phoneFix.classList.remove('inline-flex');
    phoneFix.textContent = '';
    delete phoneFix.dataset.value;
  }

  function showError(field, message) {
    field.stateEl.dataset.state = 'error';
    field.el.setAttribute('aria-invalid', 'true');
    field.errorEl.querySelector('[data-error-text]').textContent = message;
    field.errorEl.classList.remove('hidden');
    field.errorEl.classList.add('flex');
    if (field.icon) field.icon.classList.add('hidden');
  }

  function showSuccess(field) {
    clearError(field);
    field.stateEl.dataset.state = 'success';
    if (field.icon) field.icon.classList.remove('hidden');
  }

  // Повертає поле у нейтральний стан (normal).
  function clearError(field) {
    delete field.stateEl.dataset.state;
    field.el.setAttribute('aria-invalid', 'false');
    field.errorEl.querySelector('[data-error-text]').textContent = '';
    field.errorEl.classList.add('hidden');
    field.errorEl.classList.remove('flex');
    if (field.icon) field.icon.classList.add('hidden');
  }

  // Пропозиція виправити формат телефону показується лише разом із помилкою.
  function updatePhoneFix(hasError) {
    const suggestion = hasError ? suggestPhone(phoneField.el.value) : null;
    if (!suggestion) {
      hidePhoneFix();
      return;
    }
    phoneFix.dataset.value = suggestion;
    phoneFix.textContent = `Замінити на ${suggestion}`;
    phoneFix.classList.remove('hidden');
    phoneFix.classList.add('inline-flex');
  }

  /* ---------- 5. Валідація поля та динамічна поведінка ---------- */

  // Повна перевірка: показує і помилку, і успіх. Повертає true, якщо поле валідне.
  function validateField(field) {
    const message = field.validate(field.el);
    if (message) showError(field, message);
    else showSuccess(field);
    if (field === phoneField) updatePhoneFix(Boolean(message));
    return !message;
  }

  fields.forEach((field) => {
    // blur / change: користувач залишив поле, тож показуємо остаточний результат.
    if (field.event === 'change') {
      field.el.addEventListener('change', () => {
        field.touched = true;
        validateField(field);
      });
    } else {
      field.el.addEventListener('blur', () => {
        field.touched = true;
        validateField(field);
      });

      // input: під час набору не лякаємо червоним, доки поле не було «закінчене».
      // Після першого blur (touched) оновлюємо стан у реальному часі.
      field.el.addEventListener('input', () => {
        if (field.touched) {
          validateField(field);
          return;
        }
        // Ще не touched: показуємо лише позитивний результат, помилку приховуємо.
        if (field.validate(field.el) === '') showSuccess(field);
        else clearError(field);
      });
    }
  });

  phoneFix.addEventListener('click', () => {
    if (!phoneFix.dataset.value) return;
    phoneField.el.value = phoneFix.dataset.value;
    phoneField.touched = true;
    validateField(phoneField);
    phoneField.el.focus();
  });

  /* ---------- 6. Submit, імітація надсилання, модальне вікно ---------- */

  let isSubmitting = false;
  let lastFocused = null;

  function setSubmitting(state) {
    isSubmitting = state;
    submitBtn.disabled = state;
    submitBtn.setAttribute('aria-busy', String(state));
    submitLabel.textContent = state ? 'Надсилаємо…' : 'Надіслати';
  }

  function resetForm() {
    form.reset();
    fields.forEach((field) => {
      field.touched = false;
      clearError(field);
    });
    hidePhoneFix();
    setStatus('');
  }

  function openModal() {
    lastFocused = document.activeElement;
    modal.showModal();
    modalClose.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();       // реального надсилання на сервер немає
    if (isSubmitting) return;     // захист від повторних швидких натискань

    // Усі поля вважаємо «touched», щоб показати всі помилки одразу.
    fields.forEach((field) => { field.touched = true; });
    const invalid = fields.filter((field) => !validateField(field));

    if (invalid.length > 0) {
      const count = invalid.length;
      setStatus(`Форму не надіслано: виправте поля з помилками (${count}).`);
      invalid[0].el.focus();      // фокус на першому полі з помилкою
      return;
    }

    setStatus('');
    setSubmitting(true);
    window.setTimeout(() => {
      resetForm();
      setSubmitting(false);
      openModal();
    }, SUBMIT_DELAY_MS);
  });

  // Прибираємо підсумок помилок, щойно користувач почав виправляти.
  form.addEventListener('input', () => {
    if (!formStatus.classList.contains('hidden')) setStatus('');
  });

  modalClose.addEventListener('click', () => modal.close());

  // Клік по затемненню (за межами контенту) також закриває вікно.
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });

  // Фокус-пастка: у вікні лише одна інтерактивна кнопка, тож Tab / Shift+Tab
  // залишають фокус на ній і не відправляють його в адресний рядок браузера.
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      modalClose.focus();
    }
  });

  // Esc обробляє браузер (подія cancel → close).
  // Повертаємо фокус туди, де він був; якщо там нічого не було, то на кнопку «Надіслати».
  modal.addEventListener('close', () => {
    const canRestore = lastFocused && lastFocused !== document.body && document.contains(lastFocused);
    (canRestore ? lastFocused : submitBtn).focus();
  });
})();

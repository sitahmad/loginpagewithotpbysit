(() => {
  const OTP_LENGTH = 6;
  const OTP_TTL_SECONDS = 90;
  const RESEND_COOLDOWN_SECONDS = 30;
  const MAX_ATTEMPTS = 3;
  const PENDING_KEY = 'otpDemoPendingSession';
  const PREF_KEY = 'otpDemoPreferences';
  const THEME_KEY = 'otpDemoTheme';

  const els = {
    requestForm: document.getElementById('requestForm'),
    verifyForm: document.getElementById('verifyForm'),
    requestSection: document.getElementById('requestSection'),
    otpSection: document.getElementById('otpSection'),
    successSection: document.getElementById('successSection'),
    identifier: document.getElementById('identifier'),
    identifierLabel: document.getElementById('identifierLabel'),
    requestError: document.getElementById('requestError'),
    verifyFeedback: document.getElementById('verifyFeedback'),
    targetInfo: document.getElementById('targetInfo'),
    demoOtpPanel: document.getElementById('demoOtpPanel'),
    demoOtpValue: document.getElementById('demoOtpValue'),
    attemptsRemaining: document.getElementById('attemptsRemaining'),
    timerText: document.getElementById('timerText'),
    requestOtpBtn: document.getElementById('requestOtpBtn'),
    verifyBtn: document.getElementById('verifyBtn'),
    resendBtn: document.getElementById('resendBtn'),
    editBtn: document.getElementById('editBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    rememberMe: document.getElementById('rememberMe'),
    password: document.getElementById('password'),
    togglePassword: document.getElementById('togglePassword'),
    themeToggle: document.getElementById('themeToggle'),
    otpInputs: Array.from(document.querySelectorAll('.otp-input')),
    modeRadios: Array.from(document.querySelectorAll('input[name="mode"]'))
  };

  let state = {
    mode: 'email',
    normalizedIdentifier: '',
    displayIdentifier: '',
    otp: '',
    otpExpiresAt: 0,
    resendAvailableAt: 0,
    attemptsUsed: 0,
    verified: false
  };

  let timerId;

  function normalizeIdentifier(mode, value) {
    const trimmed = value.trim();
    if (mode === 'phone') {
      const normalized = trimmed.replace(/[\s()-]/g, '').replace(/^00/, '+');
      return normalized.startsWith('+') ? `+${normalized.slice(1).replace(/\D/g, '')}` : normalized.replace(/\D/g, '');
    }
    return trimmed.toLowerCase();
  }

  function isValidIdentifier(mode, value) {
    if (!value) return false;
    if (mode === 'phone') return /^\+?[1-9]\d{7,14}$/.test(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function deriveOtp(identifier) {
    let hash = 0;
    for (let i = 0; i < identifier.length; i += 1) {
      hash = (hash * 31 + identifier.charCodeAt(i)) % 1000000;
    }
    return String(hash).padStart(OTP_LENGTH, '0');
  }

  function setFeedback(element, message, type = 'error') {
    if (!message) {
      element.hidden = true;
      element.textContent = '';
      element.className = 'feedback';
      return;
    }

    element.hidden = false;
    element.textContent = message;
    element.className = `feedback feedback--${type}`;
  }

  function updateIdentifierLabel(mode) {
    const isEmail = mode === 'email';
    els.identifierLabel.textContent = isEmail ? 'Email address' : 'Phone number';
    els.identifier.placeholder = isEmail ? 'name@example.com' : '+12025550123';
    els.identifier.inputMode = isEmail ? 'email' : 'tel';
  }

  function setLoading(button, isLoading, label) {
    if (!button) return;
    button.disabled = isLoading;
    if (label) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = isLoading ? label : button.dataset.originalText;
    }
  }

  function updateOtpSectionVisibility(active) {
    els.otpSection.hidden = !active;
    els.requestSection.hidden = active;
    if (active) {
      els.otpInputs[0].focus();
    }
  }

  function toMaskedIdentifier(mode, value) {
    if (mode === 'phone') {
      return `${value.slice(0, 3)}••••${value.slice(-2)}`;
    }
    const [name = '', domain = ''] = value.split('@');
    if (!domain) return value;
    const safeName = name.length <= 2 ? `${name[0] || ''}•` : `${name.slice(0, 2)}••`;
    return `${safeName}@${domain}`;
  }

  function persistPendingSession() {
    if (!state.otpExpiresAt || state.verified) {
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      mode: state.mode,
      normalizedIdentifier: state.normalizedIdentifier,
      displayIdentifier: state.displayIdentifier,
      otpExpiresAt: state.otpExpiresAt,
      resendAvailableAt: state.resendAvailableAt,
      attemptsUsed: state.attemptsUsed,
      otp: state.otp
    }));
  }

  function resetOtpInputs() {
    els.otpInputs.forEach((input) => {
      input.value = '';
      input.removeAttribute('aria-invalid');
    });
  }

  function getEnteredOtp() {
    return els.otpInputs.map((input) => input.value).join('');
  }

  function updateTimer() {
    const now = Date.now();
    const expiresIn = Math.max(0, Math.ceil((state.otpExpiresAt - now) / 1000));
    const resendIn = Math.max(0, Math.ceil((state.resendAvailableAt - now) / 1000));

    if (expiresIn === 0) {
      setFeedback(els.verifyFeedback, 'OTP expired. Request a new code.', 'error');
    }

    els.timerText.textContent = expiresIn > 0
      ? `Code expires in ${expiresIn}s. ${resendIn > 0 ? `Resend available in ${resendIn}s.` : 'You can resend now.'}`
      : `${resendIn > 0 ? `Resend available in ${resendIn}s.` : 'You can resend now.'}`;

    els.resendBtn.disabled = resendIn > 0;

    if (expiresIn <= 0 && resendIn <= 0 && timerId) {
      clearInterval(timerId);
      timerId = undefined;
    }
  }

  function beginOtpFlow() {
    els.targetInfo.textContent = `Enter the OTP sent to ${toMaskedIdentifier(state.mode, state.displayIdentifier)}.`;
    els.demoOtpPanel.hidden = false;
    els.demoOtpValue.textContent = state.otp;
    els.attemptsRemaining.textContent = String(Math.max(0, MAX_ATTEMPTS - state.attemptsUsed));
    setFeedback(els.verifyFeedback, '');
    updateOtpSectionVisibility(true);
    updateTimer();

    if (timerId) clearInterval(timerId);
    timerId = setInterval(updateTimer, 1000);
    persistPendingSession();
  }

  function requestOtp(event, isResend = false) {
    if (event) event.preventDefault();
    setFeedback(els.requestError, '');

    const mode = els.modeRadios.find((radio) => radio.checked)?.value || 'email';
    const normalized = normalizeIdentifier(mode, els.identifier.value);
    if (!isValidIdentifier(mode, normalized)) {
      setFeedback(els.requestError, `Please enter a valid ${mode === 'email' ? 'email address' : 'phone number in international format'}.`, 'error');
      els.identifier.focus();
      return;
    }

    state.mode = mode;
    state.displayIdentifier = normalized;
    state.normalizedIdentifier = normalized;

    setLoading(els.requestOtpBtn, true, 'Requesting...');
    setLoading(els.resendBtn, true, 'Resending...');

    window.setTimeout(() => {
      state.otp = deriveOtp(state.normalizedIdentifier);
      state.otpExpiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
      state.resendAvailableAt = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
      state.attemptsUsed = 0;
      state.verified = false;

      setLoading(els.requestOtpBtn, false);
      setLoading(els.resendBtn, false);
      els.verifyBtn.disabled = false;
      resetOtpInputs();
      beginOtpFlow();
    }, 500);
  }

  function handleVerify(event) {
    event.preventDefault();

    const enteredOtp = getEnteredOtp();
    if (!/^\d{6}$/.test(enteredOtp)) {
      els.otpInputs.forEach((input) => {
        if (!input.value) input.setAttribute('aria-invalid', 'true');
      });
      setFeedback(els.verifyFeedback, 'Enter all 6 digits before verifying.', 'error');
      const firstEmpty = els.otpInputs.find((input) => !input.value);
      (firstEmpty || els.otpInputs[0]).focus();
      return;
    }

    if (Date.now() > state.otpExpiresAt) {
      setFeedback(els.verifyFeedback, 'OTP expired. Please resend and try again.', 'error');
      return;
    }

    if (state.attemptsUsed >= MAX_ATTEMPTS) {
      setFeedback(els.verifyFeedback, 'Maximum attempts reached. Please edit identifier and start again.', 'error');
      return;
    }

    setLoading(els.verifyBtn, true, 'Verifying...');

    window.setTimeout(() => {
      setLoading(els.verifyBtn, false);

      if (enteredOtp === state.otp) {
        state.verified = true;
        sessionStorage.removeItem(PENDING_KEY);
        setFeedback(els.verifyFeedback, 'OTP verified successfully.', 'success');
        els.otpSection.hidden = true;
        els.successSection.hidden = false;
        els.logoutBtn.focus();
        return;
      }

      state.attemptsUsed += 1;
      persistPendingSession();
      els.attemptsRemaining.textContent = String(Math.max(0, MAX_ATTEMPTS - state.attemptsUsed));
      resetOtpInputs();
      els.otpInputs[0].focus();

      if (state.attemptsUsed >= MAX_ATTEMPTS) {
        setFeedback(els.verifyFeedback, 'Incorrect OTP. No attempts remaining. Edit identifier to restart.', 'error');
        els.verifyBtn.disabled = true;
      } else {
        setFeedback(els.verifyFeedback, 'Incorrect OTP. Try again.', 'error');
      }
    }, 450);
  }

  function restartToRequest() {
    if (timerId) {
      clearInterval(timerId);
      timerId = undefined;
    }

    sessionStorage.removeItem(PENDING_KEY);
    state = {
      ...state,
      otp: '',
      otpExpiresAt: 0,
      resendAvailableAt: 0,
      attemptsUsed: 0,
      verified: false
    };

    els.verifyBtn.disabled = false;
    setFeedback(els.verifyFeedback, '');
    resetOtpInputs();
    updateOtpSectionVisibility(false);
    els.successSection.hidden = true;
    els.demoOtpPanel.hidden = true;
    els.identifier.focus();
  }

  function handleOtpInputEvents() {
    els.otpInputs.forEach((input, index) => {
      input.addEventListener('input', (event) => {
        const value = event.target.value.replace(/\D/g, '').slice(-1);
        event.target.value = value;
        event.target.removeAttribute('aria-invalid');
        if (value && index < OTP_LENGTH - 1) {
          els.otpInputs[index + 1].focus();
        }
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && !input.value && index > 0) {
          els.otpInputs[index - 1].focus();
        }
        if (event.key === 'ArrowLeft' && index > 0) {
          els.otpInputs[index - 1].focus();
        }
        if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
          els.otpInputs[index + 1].focus();
        }
      });
    });

    els.otpInputs[0].addEventListener('paste', (event) => {
      event.preventDefault();
      const digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
      if (!digits) return;
      digits.split('').forEach((digit, idx) => {
        if (els.otpInputs[idx]) {
          els.otpInputs[idx].value = digit;
          els.otpInputs[idx].removeAttribute('aria-invalid');
        }
      });
      const nextIndex = Math.min(digits.length, OTP_LENGTH - 1);
      els.otpInputs[nextIndex].focus();
    });
  }

  function loadPreferences() {
    const rawPrefs = localStorage.getItem(PREF_KEY);
    if (rawPrefs) {
      try {
        const prefs = JSON.parse(rawPrefs);
        if (prefs?.rememberMe) {
          els.rememberMe.checked = true;
          if (prefs.mode === 'phone' || prefs.mode === 'email') {
            const radio = els.modeRadios.find((item) => item.value === prefs.mode);
            if (radio) radio.checked = true;
            updateIdentifierLabel(prefs.mode);
          }
          if (prefs.identifier) {
            els.identifier.value = prefs.identifier;
          }
        }
      } catch (_err) {
        localStorage.removeItem(PREF_KEY);
      }
    }

    const theme = localStorage.getItem(THEME_KEY);
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    els.themeToggle.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ Theme' : '🌙 Theme';
  }

  function savePreferences() {
    if (!els.rememberMe.checked) {
      localStorage.removeItem(PREF_KEY);
      return;
    }

    const mode = els.modeRadios.find((radio) => radio.checked)?.value || 'email';
    const identifier = normalizeIdentifier(mode, els.identifier.value);
    localStorage.setItem(PREF_KEY, JSON.stringify({ rememberMe: true, mode, identifier }));
  }

  function tryRestorePendingSession() {
    const rawSession = sessionStorage.getItem(PENDING_KEY);
    if (!rawSession) return;

    try {
      const pending = JSON.parse(rawSession);
      if (!pending?.otpExpiresAt || Date.now() > pending.otpExpiresAt) {
        sessionStorage.removeItem(PENDING_KEY);
        return;
      }

      state = {
        ...state,
        mode: pending.mode,
        normalizedIdentifier: pending.normalizedIdentifier,
        displayIdentifier: pending.displayIdentifier,
        otp: pending.otp,
        otpExpiresAt: pending.otpExpiresAt,
        resendAvailableAt: pending.resendAvailableAt,
        attemptsUsed: pending.attemptsUsed,
        verified: false
      };

      const modeRadio = els.modeRadios.find((item) => item.value === state.mode);
      if (modeRadio) modeRadio.checked = true;
      updateIdentifierLabel(state.mode);
      els.identifier.value = state.displayIdentifier;
      els.attemptsRemaining.textContent = String(Math.max(0, MAX_ATTEMPTS - state.attemptsUsed));
      beginOtpFlow();

      if (state.attemptsUsed >= MAX_ATTEMPTS) {
        els.verifyBtn.disabled = true;
        setFeedback(els.verifyFeedback, 'Maximum attempts reached. Edit identifier to restart.', 'error');
      }
    } catch (_err) {
      sessionStorage.removeItem(PENDING_KEY);
    }
  }

  function bindEvents() {
    els.requestForm.addEventListener('submit', requestOtp);
    els.verifyForm.addEventListener('submit', handleVerify);

    els.modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        state.mode = radio.value;
        updateIdentifierLabel(radio.value);
        setFeedback(els.requestError, '');
      });
    });

    els.identifier.addEventListener('input', () => setFeedback(els.requestError, ''));
    els.rememberMe.addEventListener('change', savePreferences);

    els.resendBtn.addEventListener('click', () => {
      if (Date.now() < state.resendAvailableAt) return;
      requestOtp(null, true);
    });

    els.editBtn.addEventListener('click', restartToRequest);
    els.logoutBtn.addEventListener('click', restartToRequest);

    els.togglePassword.addEventListener('click', () => {
      const show = els.password.type === 'password';
      els.password.type = show ? 'text' : 'password';
      els.togglePassword.textContent = show ? 'Hide' : 'Show';
      els.togglePassword.setAttribute('aria-pressed', String(show));
    });

    els.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      els.themeToggle.textContent = next === 'dark' ? '☀️ Theme' : '🌙 Theme';
    });

    els.requestForm.addEventListener('submit', savePreferences);
    handleOtpInputEvents();
  }

  bindEvents();
  loadPreferences();
  updateIdentifierLabel(els.modeRadios.find((radio) => radio.checked)?.value || 'email');
  tryRestorePendingSession();
})();

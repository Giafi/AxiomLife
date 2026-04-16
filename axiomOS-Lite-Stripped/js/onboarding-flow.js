// ================================================================
// onboarding-flow.js
// Keeps first-run UI state transitions out of db.js.
// Depends on db.js having already created global db/saveDB.
// ================================================================

function syncOnboardingLanguageUI() {
  const hasChoice = !!db?.settings?.langChoiceDone;
  const lang = hasChoice ? db?.settings?.lang : null;
  const selected = ['it', 'en'].includes(lang) ? lang : null;
  const itBtn = document.getElementById('ob-lang-it-btn');
  const enBtn = document.getElementById('ob-lang-en-btn');
  const startBtn = document.getElementById('ob-start-btn');

  if (itBtn) {
    itBtn.className = 'btn btn-sm ' + (selected === 'it' ? 'btn-primary' : 'btn-ghost');
    itBtn.setAttribute('aria-pressed', selected === 'it' ? 'true' : 'false');
  }
  if (enBtn) {
    enBtn.className = 'btn btn-sm ' + (selected === 'en' ? 'btn-primary' : 'btn-ghost');
    enBtn.setAttribute('aria-pressed', selected === 'en' ? 'true' : 'false');
  }
  if (startBtn) {
    startBtn.disabled = !hasChoice;
    startBtn.setAttribute('aria-disabled', hasChoice ? 'false' : 'true');
  }
}

function _setOnboardingStep(step) {
  document.querySelectorAll('.ob-step').forEach((node) => node.classList.remove('on'));
  document.getElementById('ob-step-' + step)?.classList.add('on');
}

function syncOnboardingModeUI() {
  const selected = db?.settings?.experienceMode || 'simple';
  ['simple', 'expanded', 'custom'].forEach((mode) => {
    const button = document.getElementById(`ob-mode-${mode}-btn`);
    if (!button) return;
    button.className = 'btn btn-sm ' + (selected === mode ? 'btn-primary' : 'btn-ghost');
    button.setAttribute('aria-pressed', selected === mode ? 'true' : 'false');
  });
}

function chooseOnboardingLanguage(lang) {
  if (!['it', 'en'].includes(lang)) return;
  db.settings.lang = lang;
  db.settings.langChoiceDone = true;
  if (typeof I18n !== 'undefined') I18n.setLanguage(lang, true);
  else saveDB();
  syncOnboardingLanguageUI();
}

function chooseOnboardingMode(mode) {
  if (!['simple', 'expanded', 'custom'].includes(mode)) return;
  db.settings.experienceMode = mode;
  saveDB();
  syncOnboardingModeUI();
}

function obNext(step) {
  if (step === 1) {
    if (!db.settings.langChoiceDone) {
      notify(I18n.t('ob_lang_required'), '🌐', 'info');
      return;
    }

    const rawName = document.getElementById('ob-name')?.value || '';
    if (String(rawName).trim()) {
      const result = InputValidator.validateName(
        rawName,
        typeof I18n !== 'undefined' ? I18n.t('settings_name') : 'Name'
      );
      if (!result.valid) {
        notify(result.error || I18n.t('err_enter_name'), '👤', 'info');
        return;
      }
      db.user.name = result.value;
      saveDB();
    }
  }

  _setOnboardingStep(step);
}

function obFinish() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('shell').classList.remove('hidden');
  db.settings.onboarded = true;
  db.settings.langChoiceDone = true;
  if (typeof applyExperienceMode === 'function') {
    applyExperienceMode(db.settings.experienceMode || 'simple', { silent: true, emit: false });
  } else if (typeof applyModulePreset === 'function') {
    applyModulePreset('simple', { silent: true, emit: false });
  }
  saveDB(true);
  initApp();
  if ((db.settings.experienceMode || 'simple') === 'custom' && typeof showSection === 'function') {
    showSection('settings');
  }
}

let _onboardingBindingsReady = false;

function initOnboardingFlow() {
  if (_onboardingBindingsReady) return;
  _onboardingBindingsReady = true;

  const nameInput = document.getElementById('ob-name');
  if (nameInput && !nameInput.value && db?.user?.name) {
    nameInput.value = db.user.name;
  }

  const bindClick = (id, handler) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler(node, event);
    });
  };

  bindClick('ob-lang-en-btn', () => chooseOnboardingLanguage('en'));
  bindClick('ob-lang-it-btn', () => chooseOnboardingLanguage('it'));
  bindClick('ob-start-btn', () => obNext(1));
  bindClick('ob-mode-simple-btn', () => chooseOnboardingMode('simple'));
  bindClick('ob-mode-expanded-btn', () => chooseOnboardingMode('expanded'));
  bindClick('ob-mode-custom-btn', () => chooseOnboardingMode('custom'));

  document.querySelectorAll('[data-action="ob:next"]').forEach((node) => {
    if (node.id === 'ob-start-btn') return;
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      obNext(parseInt(node.dataset.step, 10));
    });
  });

  document.querySelectorAll('[data-action="ob:finish"]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      obFinish();
    });
  });

  nameInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    obNext(1);
  });
}

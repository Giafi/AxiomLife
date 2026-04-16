// ================================================================
// event-handlers.js - Centralized event delegation
//
// This file replaces a bounded subset of inline on* HTML handlers with
// delegated listeners driven by data-action attributes.
// Load order:
//   all feature modules -> event-handlers.js -> init.js
// ================================================================

const ACTIONS = {
  // Onboarding
  'ob:next': (el) => obNext(parseInt(el.dataset.step, 10)),
  'ob:finish': () => obFinish(),
  'ob:set-lang': (el) => chooseOnboardingLanguage(el.dataset.lang),
  'ob:set-mode': (el) => chooseOnboardingMode(el.dataset.mode),

  // Navigation
  'nav:section': (el) => showSection(el.dataset.section),
  'nav:quests': () => { showSection('dashboard'); scrollToQuests(); },
  'nav:advanced-toggle': () => _toggleAdvancedNav(),
  'nav:settings': () => showSection('settings'),

  // Persistence helpers
  'db:save': () => manualSave(),
  'streak:freeze': () => useStreakFreeze(),

  // Time navigation
  'time:set-view': (el) => setTimeView(el.dataset.view),
  'time:navigate': (el) => navigatePeriod(parseInt(el.dataset.dir, 10)),

  // Modals
  'modal:open': (el) => openModal(el.dataset.modal),
  'modal:close': (el) => closeModal(el.dataset.modal),

  // Core CRUD
  'habit:save': () => saveHabit(),
  'identity:save': () => saveIdentity(),
  'goal:save': () => saveGoal(),
  'direction:save': () => saveDirection(),
  'experiment:save': () => saveExperiment(),
  'quote:save': () => saveQuote(),
  'reward:save': () => saveReward(),
  'skill:save': () => saveSkill(),
  'skill:log-practice': () => logPractice(),
  'library:save': () => saveLibItem(),
  'vision:save': () => saveVisionCard(),

  // Tomorrow planner
  'tomorrow:save': () => saveTomorrow(),
  'tomorrow:save-notify': () => {
    saveTomorrow();
    notify(typeof I18n !== 'undefined' ? I18n.t('tomorrow_saved') : 'Plan saved!', '✅', 'info');
  },
  'tomorrow:copy-today': () => copyTodayToTomorrow(),
  'tomorrow:clear': () => clearTomorrow(),
  'tomorrow:add-task': () => addTomorrowTask(),

  // Deep work / timer
  'timer:set': (el) => setTimer(parseInt(el.dataset.minutes, 10)),
  'timer:set-custom': () => setCustomTimer(),
  'timer:toggle': () => toggleTimer(),
  'timer:reset': () => resetTimer(),
  'timer:focus-enter': () => enterFocus(),
  'timer:focus-exit': () => exitFocus(),
  'timer:hardcore': () => toggleHardcore(),
  'timer:log-distraction': () => logDistraction(),
  'timer:add-study-topic': () => addStudyTopic(),

  // Reflection
  'reflect:mood': (el) => pickMood(parseInt(el.dataset.mood || el.dataset.m, 10)),
  'reflect:goal-reached': (el) => setGoalReached(el.dataset.reached === 'true'),
  'reflect:save': () => saveReflection(),

  // Event popup / two-minute rule
  'event:close': () => closeEvt(),
  'twomin:open': () => openTwoMin(),

  // Settings
  'settings:save-name': () => saveName(),
  'settings:set-lang': (el, event) => setLanguage(el.dataset.lang || event.target.value),
  'settings:set-accent': (el) => setAccent(el.dataset.accent, el.dataset.accentDark),
  'settings:set-reminder': () => setReminder(),
  'settings:save-customization': () => saveCustomizationSettings(),
  'settings:reset-customization': () => resetCustomizationSettings(),
  'settings:mode-simple': () => applyExperienceMode('simple'),
  'settings:mode-expanded': () => applyExperienceMode('expanded'),
  'settings:mode-custom': () => applyExperienceMode('custom'),
  'settings:modules-focus': () => applyModulePreset('focus'),
  'settings:modules-all': () => applyModulePreset('all'),
  'reminder:enable-now': () => enableReminderNow(),
  'backup:toggle': () => BackupManager.isActive ? BackupManager.saveNow() : BackupManager.setup(),
  'backup:disable': () => BackupManager.disable(),
  'data:export': () => exportData(),
  'data:import-pick': () => document.getElementById('imp-file')?.click(),
  'data:import': (_, event) => importData(event),
  'data:hard-reset': () => hardReset(),
  'storage:run-cleanup': () => runStorageCleanup(),

  // Fitness
  'fitness:log-workout': () => logWorkout(),
  'fitness:add-water': () => addWater(),
  'fitness:reset-water': () => resetWater(),
  'fitness:log-weight': () => logWeight(),
  'fitness:add-pr': () => addPR(),
  'fitness:save-checkin': () => saveFitnessCheckin(),
  'fitness:save-goals': () => saveFitnessGoals(),

  // Packages
  'packages:import-pick': () => document.getElementById('pkg-imp')?.click(),
  'packages:import': (_, event) => importPackages(event),
  'packages:export': () => exportPackages(),
};

function _toggleAdvancedNav() {
  const open = localStorage.getItem('nav_advanced_open') === '1';
  _applyAdvancedNavState(!open);
}

function _applyAdvancedNavState(nextOpen) {
  localStorage.setItem('nav_advanced_open', nextOpen ? '1' : '0');
  document.documentElement.dataset.navAdvancedOpen = nextOpen ? '1' : '0';
  const nav = document.getElementById('nav-advanced');
  const btn = document.getElementById('nav-advanced-toggle');
  if (nav) nav.classList.toggle('open', nextOpen);
  if (!btn) return;

  btn.setAttribute('aria-expanded', String(nextOpen));
  const arrow = btn.querySelector('.nav-adv-arrow');
  if (arrow) arrow.textContent = nextOpen ? '▾' : '▸';
}

function _dispatchDelegated(event, attrName) {
  const target = event.target.closest(`[${attrName}]`);
  if (!target) return;

  const action = target.dataset[attrName.replace('data-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  const handler = ACTIONS[action];
  if (typeof handler === 'function') {
    handler(target, event);
    return;
  }

  if (typeof APP_CONSTANTS !== 'undefined' && !APP_CONSTANTS.PROD) {
    console.warn('[EventHandlers] Missing handler for action:', action);
  }
}

function _handleClick(event) {
  _dispatchDelegated(event, 'data-action');
}

function _handleInput(event) {
  _dispatchDelegated(event, 'data-action-input');
}

function _handleChange(event) {
  _dispatchDelegated(event, 'data-action-change');
}

function _handleKeydown(event) {
  if (event.key !== 'Enter') return;
  _dispatchDelegated(event, 'data-action-enter');
}

let _eventHandlersInitialized = false;

function initEventHandlers() {
  if (_eventHandlersInitialized) return;
  _eventHandlersInitialized = true;
  _applyAdvancedNavState(document.documentElement.dataset.navAdvancedOpen === '1' || localStorage.getItem('nav_advanced_open') === '1');
  document.addEventListener('click', _handleClick);
  document.addEventListener('input', _handleInput);
  document.addEventListener('change', _handleChange);
  document.addEventListener('keydown', _handleKeydown);
}

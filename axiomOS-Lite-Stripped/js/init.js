// ================================================================
// init.js - Application bootstrap
//
// Responsibilities:
// - initialize i18n before and after db load
// - restore bundled content when storage is missing
// - connect EventBus to lightweight UI refreshes
// - register the service worker and surface safe update prompts
// - start lifecycle/background services after first paint
// ================================================================

function _createUIRefreshScheduler() {
  let pending = false;
  const flags = {
    sidebar: false,
    dashboardPatch: false,
    currentSection: false,
    lifeAreasVisible: false,
    settingsVisible: false,
  };

  function resetFlags() {
    flags.sidebar = false;
    flags.dashboardPatch = false;
    flags.currentSection = false;
    flags.lifeAreasVisible = false;
    flags.settingsVisible = false;
  }

  function flush() {
    pending = false;
    const next = { ...flags };
    resetFlags();
    const activeSection = _getShellState().getCurrentSection();

    if (next.sidebar) updateSidebar?.();

    if (next.dashboardPatch && activeSection !== 'dashboard') {
      _patchDashStats?.();
      _patchMomentumBar?.();
      _renderDashTmrPreview?.();
    }

    if (next.currentSection && typeof refreshCurrentSection === 'function') {
      refreshCurrentSection();
      return;
    }

    if (next.settingsVisible && activeSection === 'settings') renderSettings?.();
    if (next.lifeAreasVisible && activeSection === 'life-areas') renderLifeAreas?.();
  }

  return function schedule(partial = {}) {
    flags.sidebar = flags.sidebar || !!partial.sidebar;
    flags.dashboardPatch = flags.dashboardPatch || !!partial.dashboardPatch;
    flags.currentSection = flags.currentSection || !!partial.currentSection;
    flags.lifeAreasVisible = flags.lifeAreasVisible || !!partial.lifeAreasVisible;
    flags.settingsVisible = flags.settingsVisible || !!partial.settingsVisible;

    if (pending) return;
    pending = true;
    requestAnimationFrame(flush);
  };
}

const scheduleUIRefresh = _createUIRefreshScheduler();
let _serviceWorkerRegistrationPromise = null;
let _serviceWorkerReloadPending = false;
let _appShellListenersBound = false;
let _activityLoggingBound = false;
let _connectionBannerHideTimer = null;
let _deferredInstallPrompt = null;

function _getShellState() {
  return globalThis.AxiomShellState || {
    getCurrentSection: () => globalThis.currentSection,
  };
}

function _getLaunchSection() {
  try {
    const requested = new URLSearchParams(location.search || '').get('section');
    return requested && document.getElementById('sec-' + requested) ? requested : 'dashboard';
  } catch {
    return 'dashboard';
  }
}

function _isStandaloneApp() {
  try {
    return !!(
      window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator?.standalone === true
      || document.referrer?.startsWith?.('android-app://')
    );
  } catch {
    return false;
  }
}

function _isLocalLauncherMode() {
  try {
    return new URLSearchParams(location.search || '').get('local-launcher') === '1';
  } catch {
    return false;
  }
}

function _isDemoLaunchMode() {
  try {
    const params = new URLSearchParams(location.search || '');
    return params.get('demo') === '1' || params.get('demo') === 'true';
  } catch {
    return false;
  }
}

function _getPwaEntrypointKind() {
  try {
    const pathname = String(location.pathname || '');
    if (!pathname || pathname.endsWith('/') || pathname.endsWith('/index.html')) return 'app';
    if (pathname.endsWith('/demo-live.html')) return 'demo-live';
    if (pathname.endsWith('/demo.html')) return 'demo';
    return 'other';
  } catch {
    return 'app';
  }
}

function _getServiceWorkerScriptUrl() {
  try {
    const pathname = String(location.pathname || '');
    return pathname.includes('/demo/') ? '../sw.js' : 'sw.js';
  } catch {
    return 'sw.js';
  }
}

function getPwaInstallState() {
  const protocol = location.protocol || '';
  const isFile = protocol === 'file:';
  const hasServiceWorker = 'serviceWorker' in navigator;
  const installed = _isStandaloneApp();
  const entrypointKind = _getPwaEntrypointKind();
  const installableEntrypoint = entrypointKind === 'app';
  return {
    protocol,
    installed,
    entrypointKind,
    installableEntrypoint,
    serviceWorkerSupported: hasServiceWorker,
    canPromptInstall: !!_deferredInstallPrompt,
    canInstallFromContext: !isFile && hasServiceWorker && installableEntrypoint && !_isLocalLauncherMode(),
  };
}

async function promptPwaInstall() {
  const state = getPwaInstallState();
  if (!state.canInstallFromContext || !_deferredInstallPrompt) return { outcome: 'unavailable' };
  const promptEvent = _deferredInstallPrompt;
  _deferredInstallPrompt = null;
  await promptEvent.prompt?.();
  const choice = await promptEvent.userChoice?.catch(() => null);
  if (_getShellState().getCurrentSection() === 'settings') renderSettings?.();
  return choice || { outcome: 'dismissed' };
}

globalThis.AxiomPWA = {
  getState: getPwaInstallState,
  promptInstall: promptPwaInstall,
};

async function _resetLocalLauncherServiceWorkers() {
  if (!_isLocalLauncherMode()) return false;
  if (!('serviceWorker' in navigator)) return false;

  const reloadKey = 'axiom_local_launcher_sw_reset_done';
  let registrations = [];

  try {
    registrations = await navigator.serviceWorker.getRegistrations();
  } catch {
    return false;
  }

  if (!registrations.length) return false;

  await Promise.all(
    registrations.map((registration) => registration.unregister().catch(() => false))
  );

  if ('caches' in globalThis) {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => String(key || '').startsWith('axiomOS-'))
          .map((key) => caches.delete(key))
      );
    } catch {
      // Ignore cache cleanup failures; unregistering the worker is the critical part.
    }
  }

  try {
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      location.reload();
      return true;
    }
  } catch {
    location.reload();
    return true;
  }

  return false;
}

function _swText(key) {
  const it = typeof I18n !== 'undefined' && I18n.lang === 'it';
  const dict = {
    ready: it ? 'Aggiornamento pronto' : 'Update ready',
    message: it
      ? 'E disponibile una nuova versione. Aggiorna per caricare i file piu recenti.'
      : 'A new version is ready. Refresh to load the latest files.',
    refresh: it ? 'Aggiorna' : 'Refresh',
    close: it ? 'Chiudi' : 'Close',
  };
  return dict[key];
}

function _removeSwUpdateBanner() {
  document.getElementById('sw-update-banner')?.remove();
}

function _updateConnectionBanner(online) {
  const banner = document.getElementById('offline-banner');
  const icon = document.getElementById('offline-banner-ic');
  const message = document.getElementById('offline-banner-msg');
  if (!banner) return;

  if (_connectionBannerHideTimer) {
    clearTimeout(_connectionBannerHideTimer);
    _connectionBannerHideTimer = null;
  }

  if (online) {
    banner.className = 'show online';
    if (icon) icon.textContent = '✅';
    if (message) message.textContent = I18n.t('offline_back');
    _connectionBannerHideTimer = setTimeout(() => {
      banner.classList.remove('show');
      _connectionBannerHideTimer = null;
    }, 3000);
    return;
  }

  banner.className = 'show offline';
  if (icon) icon.textContent = '📶';
  if (message) message.textContent = I18n.t('offline_msg');
}

function _handleRuntimeI18nChange() {
  if (typeof sectionTitles === 'object' && sectionTitles) {
    sectionTitles['life-areas'] = I18n.t('nav_char_sheet');
    sectionTitles.fitness = I18n.t('nav_fitness');
  }
  _removeSwUpdateBanner();
  updateSidebar?.();

  const activeSection = _getShellState().getCurrentSection();
  if (typeof activeSection === 'undefined') return;
  if (typeof refreshCurrentSection === 'function') {
    refreshCurrentSection();
    return;
  }
  if (activeSection === 'life-areas') renderLifeAreas?.();
  if (activeSection === 'fitness') renderFitness?.();
  if (activeSection === 'settings') renderSettings?.();
}

function _bindAppShellListenersOnce() {
  if (_appShellListenersBound) return;
  _appShellListenersBound = true;

  window.addEventListener('online', () => _updateConnectionBanner(true));
  window.addEventListener('offline', () => _updateConnectionBanner(false));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    _deferredInstallPrompt = event;
    if (_getShellState().getCurrentSection() === 'settings') renderSettings?.();
  });
  window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    if (_getShellState().getCurrentSection() === 'settings') renderSettings?.();
  });
  document.addEventListener('i18n:change', _handleRuntimeI18nChange);
}

function _registerEventDrivenRefreshes() {
  function refreshCurrentSectionOnly() {
    scheduleUIRefresh({ currentSection: true });
  }

  EventBus.on('xp:gained', ({ leveled }) => {
    scheduleUIRefresh({ sidebar: true, lifeAreasVisible: !!leveled });
  });

  EventBus.on('habit:completed', () => {
    _invalidateStreakCache?.();
    scheduleUIRefresh({ sidebar: true, dashboardPatch: true, currentSection: true, lifeAreasVisible: true });
  });

  EventBus.on('habits:changed', () => {
    scheduleUIRefresh({ sidebar: true, dashboardPatch: true, currentSection: true });
  });

  EventBus.on('identity:changed', () => {
    scheduleUIRefresh({ sidebar: true, dashboardPatch: true, currentSection: true });
  });

  EventBus.on('goals:changed', () => {
    scheduleUIRefresh({ dashboardPatch: true, currentSection: true });
  });

  EventBus.on('fitness:changed', () => {
    scheduleUIRefresh({ dashboardPatch: true, currentSection: true });
  });

  EventBus.on('rewards:changed', refreshCurrentSectionOnly);
  EventBus.on('skills:changed', refreshCurrentSectionOnly);
  EventBus.on('library:changed', refreshCurrentSectionOnly);
  EventBus.on('vision:changed', refreshCurrentSectionOnly);
  EventBus.on('experiments:changed', refreshCurrentSectionOnly);
  EventBus.on('quotes:changed', refreshCurrentSectionOnly);

  EventBus.on('settings:changed', () => {
    scheduleUIRefresh({ sidebar: true, currentSection: true, settingsVisible: true });
  });

  EventBus.on('tomorrow:changed', () => {
    const activeSection = _getShellState().getCurrentSection();
    scheduleUIRefresh({ dashboardPatch: true, currentSection: activeSection === 'tomorrow' || activeSection === 'dashboard' });
  });
}

function _recordActivity(type, meta) {
  globalThis.AxiomActivityLog?.record(type, meta, { persist: true });
}

function _registerActivityLogging() {
  if (_activityLoggingBound) return;
  _activityLoggingBound = true;

  EventBus.on('habit:completed', (payload = {}) => {
    const habit = db.habits.find((item) => item.id === payload.habitId);
    _recordActivity(payload.completed ? 'habit_completed' : 'habit_uncompleted', {
      habitId: payload.habitId,
      habitName: habit?.name || '',
      xpDelta: payload.xpDelta || 0,
      dateKey: payload.dateKey || today?.(),
    });
  });

  EventBus.on('habits:changed', (payload = {}) => {
    const typeMap = {
      created: 'habit_created',
      updated: 'habit_updated',
      deleted: 'habit_deleted',
      reordered: 'habits_reordered',
    };
    const habit = db.habits.find((item) => item.id === payload.habitId);
    _recordActivity(typeMap[payload.action] || 'habit_updated', {
      habitId: payload.habitId || '',
      habitName: habit?.name || payload.habitName || '',
    });
  });

  EventBus.on('identity:changed', (payload = {}) => {
    _recordActivity(`identity_${payload.action || 'updated'}`, {
      identityId: payload.identityId || '',
      identityName: payload.identityName || '',
    });
  });

  EventBus.on('goals:changed', (payload = {}) => {
    _recordActivity(payload.action === 'milestone' ? 'goal_milestone' : `goal_${payload.action || 'updated'}`, {
      goalId: payload.goalId || '',
      goalName: payload.goalName || '',
    });
  });

  EventBus.on('settings:changed', (payload = {}) => {
    _recordActivity('settings_changed', payload);
  });

  EventBus.on('tomorrow:changed', (payload = {}) => {
    const actionMap = {
      saved: 'tomorrow_saved',
      cleared: 'tomorrow_cleared',
      copied: 'tomorrow_copied',
    };
    _recordActivity(actionMap[payload.action] || 'tomorrow_saved', payload);
  });

  EventBus.on('reflection:saved', (payload = {}) => {
    _recordActivity('reflection_saved', payload);
  });

  EventBus.on('deepwork:completed', (payload = {}) => {
    _recordActivity('deepwork_completed', payload);
  });

  EventBus.on('data:exported', (payload = {}) => {
    _recordActivity('data_exported', payload);
  });

  EventBus.on('data:imported', (payload = {}) => {
    _recordActivity('data_imported', payload);
  });

  EventBus.on('data:backup-created', (payload = {}) => {
    _recordActivity('data_backup_created', payload);
  });

  EventBus.on('backup:changed', (payload = {}) => {
    const actionMap = {
      enabled: 'backup_enabled',
      disabled: 'backup_disabled',
      saved: 'backup_saved',
    };
    _recordActivity(actionMap[payload.action] || 'backup_saved', payload);
  });

  EventBus.on('module:activity', (payload = {}) => {
    _recordActivity('module_activity', payload);
  });
}

function _showSwUpdateBanner(registration, waitingWorker = registration?.waiting) {
  if (!waitingWorker || document.getElementById('sw-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.className = 'sw-update-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  const message = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = _swText('ready');
  const body = document.createElement('div');
  body.textContent = _swText('message');
  message.append(title, body);

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'sw-update-confirm';
  confirm.textContent = _swText('refresh');
  confirm.addEventListener('click', () => {
    _serviceWorkerReloadPending = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    confirm.disabled = true;
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'sw-update-dismiss';
  dismiss.setAttribute('aria-label', _swText('close'));
  dismiss.textContent = '×';
  dismiss.addEventListener('click', _removeSwUpdateBanner);

  banner.append(message, confirm, dismiss);
  document.body.appendChild(banner);
}

async function registerAppServiceWorker() {
  if (_serviceWorkerRegistrationPromise) return _serviceWorkerRegistrationPromise;

  _serviceWorkerRegistrationPromise = (async () => {
    if (!('serviceWorker' in navigator)) return null;
    if (location.protocol === 'file:') return null;
    if (_isLocalLauncherMode()) return null;

    try {
      const registration = await navigator.serviceWorker.register(_getServiceWorkerScriptUrl());

      const showPendingUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          _showSwUpdateBanner(registration, registration.waiting);
        }
      };

      showPendingUpdate();

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            _showSwUpdateBanner(registration, worker);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_serviceWorkerReloadPending) location.reload();
      });

      registration.update?.().catch((err) => {
        console.warn('[PWA] Service worker update check failed:', err);
      });

      return registration;
    } catch (err) {
      console.warn('[PWA] Service worker registration failed:', err);
      return null;
    }
  })();

  return _serviceWorkerRegistrationPromise;
}

function initApp() {
  _bindAppShellListenersOnce();

  if (db.settings.accentColor) {
    document.documentElement.style.setProperty('--accent', db.settings.accentColor);
    document.documentElement.style.setProperty('--ag', db.settings.accentColor + '26');
  }
  if (db.settings.theme && db.settings.theme !== 'nexus') applyTheme(db.settings.theme);
  applyModules();

  document.getElementById('set-name').value = db.user.name || '';
  document.getElementById('period-label').textContent = periodLabel();

  renderSettings();

  // renderSettings may overwrite labels, so apply translations after it.
  I18n.applyToDOM();
  globalThis.applyAppMeta?.();
  globalThis.applyCustomizationSettings?.();

  showSection(_getLaunchSection(), { replaceUrl: true });
  updateSidebar();
  generateDailyQuests();
  renderDW();

  if (!navigator.onLine) _updateConnectionBanner(false);

  setTimeout(() => {
    const quotePool = Array.isArray(db.quotes) && db.quotes.length ? db.quotes : buildQuotes();
    const quote = quotePool[Math.floor(Math.random() * quotePool.length)];
    if (quote) notify(quote.text.slice(0, 50) + '…', '💬', 'info', 5000);
  }, 1500);

  setTimeout(() => {
    if (db.habits.length > 0 && Math.random() < 0.25) triggerEvent();
  }, 45000);
}

window.addEventListener('load', async () => {
  if (await _resetLocalLauncherServiceWorkers()) return;

  // Step 1: initialize i18n before db load so onboarding is translated immediately.
  I18n.init(undefined, false);

  // Step 2: load db and restore bundled defaults if a critical collection is empty.
  db = await NexusDB.init();
  const liteAdjusted = globalThis.AxiomLite?.applyToDb?.(db) === true;
  let restoredBundledContent = false;
  if (!Array.isArray(db.quotes) || db.quotes.length === 0) {
    db.quotes = buildQuotes();
    restoredBundledContent = true;
  }
  if (!Array.isArray(db.packages) || db.packages.length === 0) {
    db.packages = buildPkgs();
    restoredBundledContent = true;
  }

  // Step 3: re-initialize i18n with the persisted explicit choice when present.
  if (db.settings?.langChoiceDone || db.settings?.onboarded) {
    I18n.init(db.settings.lang, true);
  }

  // Step 4: install reactive wrappers and CRUD helpers once.
  _wrapDbReactive();
  _initEntityLogics();

  // Step 5: start runtime services that do not block the first render.
  if (globalThis.AxiomLite?.canUseFeature?.('backup') !== false) {
    BackupManager.init();
  }
  if (restoredBundledContent || liteAdjusted) saveDB();
  if (typeof ReminderManager !== 'undefined') ReminderManager.start();
  if (typeof initEventHandlers === 'function') initEventHandlers();
  await registerAppServiceWorker();

  // Step 6: connect EventBus to focused UI refreshes.
  _registerEventDrivenRefreshes();
  _registerActivityLogging();

  // Step 7: defer lifecycle cleanup so it does not compete with first paint.
  setTimeout(() => {
    DataLifecycleManager.runLifecycle().catch((err) => {
      console.warn('[Init] DataLifecycleManager.runLifecycle failed:', err);
    });
  }, 2000);

  // Step 8: show the correct shell state.
  if (db.settings?.onboarded || _isDemoLaunchMode()) {
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('shell').classList.remove('hidden');
    initApp();
    return;
  }

  I18n.applyToDOM();
  if (typeof syncOnboardingLanguageUI === 'function') syncOnboardingLanguageUI();
  if (typeof syncOnboardingModeUI === 'function') syncOnboardingModeUI();
  if (typeof initOnboardingFlow === 'function') initOnboardingFlow();
  document.getElementById('onboarding').style.display = '';
}, { once: true });

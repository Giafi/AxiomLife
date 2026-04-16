// ══════════════════════════════════════════════════════════════
// UI-CORE-SETTINGS — themes, modules, language actions, settings UI
// Extracted from ui-core.js during the modular refactor.
// Global i18n helpers now live in i18n.js.
// ══════════════════════════════════════════════════════════════

// ─── THEMES ──────────────────────────────────────────────────
const THEMES = {
  nexus:   {name:'axiomOS',   bg:'#050810',bg2:'#090d1a',bg3:'#0e1425',accent:'#00e5a0',accent2:'#0099ff',accent3:'#ff6b35',ag:'rgba(0,229,160,.15)',ab:'rgba(0,153,255,.15)'},
  cyber:   {name:'Cyberpunk', bg:'#070011',bg2:'#0d0020',bg3:'#14002f',accent:'#e040fb',accent2:'#00e5ff',accent3:'#ff4081',ag:'rgba(224,64,251,.15)',ab:'rgba(0,229,255,.15)'},
  solo:    {name:'Solo Lv',   bg:'#06000f',bg2:'#0c001f',bg3:'#12002f',accent:'#7c3aed',accent2:'#f59e0b',accent3:'#ef4444',ag:'rgba(124,58,237,.15)',ab:'rgba(245,158,11,.15)'},
  ghibli:  {name:'Ghibli',    bg:'#04100a',bg2:'#081a10',bg3:'#0d2418',accent:'#10b981',accent2:'#60a5fa',accent3:'#f97316',ag:'rgba(16,185,129,.15)',ab:'rgba(96,165,250,.15)'},
  minimal: {name:'Minimal',   bg:'#0c0c0c',bg2:'#141414',bg3:'#1c1c1c',accent:'#d4d4d4',accent2:'#737373',accent3:'#f97316',ag:'rgba(212,212,212,.1)',ab:'rgba(115,115,115,.1)'},
};

function applyTheme(name) {
  const t = THEMES[name] || THEMES.nexus;
  const r = document.documentElement.style;
  Object.entries({
    '--bg':t.bg, '--bg2':t.bg2, '--bg3':t.bg3,
    '--accent':t.accent, '--accent2':t.accent2, '--accent3':t.accent3,
    '--ag':t.ag, '--ab':t.ab
  }).forEach(([k,v]) => r.setProperty(k,v));
  document.body.style.background = t.bg;
  db.settings.theme = name;
  db.settings.accentColor = t.accent;
  saveDB();
  renderSettings();
  EventBus.emit('settings:changed', { setting: 'theme', value: name });
}

// ─── MODULES ─────────────────────────────────────────────────
function _getModuleRegistry() {
  const registry = globalThis.AxiomModuleRegistry;
  if (!registry) throw new Error('AxiomModuleRegistry is required before ui-core-settings.js');
  return registry;
}
function _getShellState() {
  return globalThis.AxiomShellState || {
    getCurrentSection: () => globalThis.currentSection,
  };
}

function _isModuleEnabled(moduleId, mods = db.settings.modules || {}) {
  return mods[moduleId] !== false;
}

const DAILY_HOME_CARD_IDS = Object.freeze((globalThis.AxiomModuleRegistry?.DAILY_CARD_MODULE_IDS || ['reflection', 'goals', 'fitness', 'achievements']).slice());
const MODULE_SETTINGS_ORDER = Object.freeze({
  reflection: 0,
  goals: 1,
  fitness: 2,
  achievements: 3,
  identity: 4,
  lifeAreas: 5,
  attributes: 6,
  rewards: 7,
  skills: 0,
  library: 1,
  visionBoard: 2,
  experiments: 3,
  packages: 4,
  quotes: 5,
});

const MODULE_GROUP_OPEN_STORAGE_KEY = 'settings_module_group_open';

function _readModuleGroupOpenMap() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MODULE_GROUP_OPEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function _writeModuleGroupOpenMap(nextState) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MODULE_GROUP_OPEN_STORAGE_KEY, JSON.stringify(nextState || {}));
  } catch {}
}

function _captureModuleGroupOpenState(root) {
  const state = _readModuleGroupOpenMap();
  if (!root || typeof root.querySelectorAll !== 'function') return state;
  root.querySelectorAll('details[data-module-group]').forEach((node) => {
    if (!node?.dataset?.moduleGroup) return;
    state[node.dataset.moduleGroup] = !!node.open;
  });
  _writeModuleGroupOpenMap(state);
  return state;
}

function _getModuleGroupOpenState(groupKey, fallbackOpen, currentState) {
  if (currentState && Object.prototype.hasOwnProperty.call(currentState, groupKey)) {
    return currentState[groupKey] === true;
  }
  const persisted = _readModuleGroupOpenMap();
  if (Object.prototype.hasOwnProperty.call(persisted, groupKey)) return persisted[groupKey] === true;
  return fallbackOpen;
}

function _bindModuleGroupOpenState(node, groupKey) {
  if (!node || typeof node.addEventListener !== 'function') return;
  node.dataset.moduleGroup = groupKey;
  node.addEventListener('toggle', () => {
    const nextState = _readModuleGroupOpenMap();
    nextState[groupKey] = !!node.open;
    _writeModuleGroupOpenMap(nextState);
  });
}

function _ensureModuleSurfaceSettings() {
  if (!db.settings.modules) db.settings.modules = {};
  if (!db.settings.modulePlacement) db.settings.modulePlacement = {};
  if (!db.settings.coreNavPins) db.settings.coreNavPins = [];
  if (!db.settings.homeCards) db.settings.homeCards = {};
  if (!db.settings.experienceMode) db.settings.experienceMode = 'simple';
  _ensureCustomizationSettings();
  _ensureDailyHomeSettings();

  _getModuleRegistry().MODULE_DEF.forEach((moduleDef) => {
    if (!(moduleDef.id in db.settings.modules)) db.settings.modules[moduleDef.id] = true;
    if (!(moduleDef.id in db.settings.modulePlacement)) db.settings.modulePlacement[moduleDef.id] = moduleDef.defaultPlacement;
  });
}

function _getModulePlacement(moduleId) {
  _ensureModuleSurfaceSettings();
  return db.settings.modulePlacement[moduleId] || _getModuleRegistry().getById(moduleId)?.defaultPlacement || 'advanced';
}

function _getModuleDefaultPlacement(moduleId) {
  const moduleDef = _getModuleRegistry().getById(moduleId);
  if (!moduleDef) return 'advanced';
  return moduleDef.defaultPlacement === 'hidden' ? 'advanced' : moduleDef.defaultPlacement;
}

function _getModuleSurfaceState(moduleId, mods = db.settings.modules || {}) {
  if (!_isModuleEnabled(moduleId, mods)) return 'hidden';
  const placement = _getModulePlacement(moduleId);
  if (placement === 'hidden') return 'hidden';
  return placement === 'pinned' ? 'core' : 'advanced';
}

function _setModulePlacement(moduleId, placement) {
  _ensureModuleSurfaceSettings();
  if (!_getModuleRegistry().MODULE_PLACEMENTS.includes(placement)) return;

  db.settings.modulePlacement[moduleId] = placement;
  const moduleDef = _getModuleRegistry().getById(moduleId);
  if (!moduleDef) return;

  const nextPins = new Set(db.settings.coreNavPins || []);
  if (placement === 'pinned') nextPins.add(moduleDef.sec);
  else nextPins.delete(moduleDef.sec);
  db.settings.coreNavPins = Array.from(nextPins);
}

function _settingsText(key, fallback, ...args) {
  if (typeof AxiomText !== 'undefined' && AxiomText?.tf) return AxiomText.tf(key, fallback, ...args);
  if (typeof I18n !== 'undefined' && I18n?.t) {
    const resolved = I18n.t(key, ...args);
    if (resolved !== undefined && resolved !== null && resolved !== key) return resolved;
  }
  if (typeof fallback === 'function') return fallback(...args);
  return fallback ?? key;
}

const SETTINGS_GUIDE_CORE_ITEMS = Object.freeze([
  { icon: '🏠', labelKey: 'nav_dashboard', fallbackLabel: 'Today', descKey: 'settings_feature_dashboard_desc', fallbackDesc: 'Your daily home with the next action to take right now.' },
  { icon: '✅', labelKey: 'nav_habits', fallbackLabel: 'Habits', descKey: 'settings_feature_habits_desc', fallbackDesc: 'Create habits, complete them quickly, and keep your streak moving.' },
  { icon: '⏱', labelKey: 'nav_deepwork', fallbackLabel: 'Deep Work', descKey: 'settings_feature_focus_desc', fallbackDesc: 'Run focus sessions, protect attention, and log deep-work time.' },
  { icon: '🌅', labelKey: 'nav_tomorrow', fallbackLabel: 'Tomorrow', descKey: 'settings_feature_tomorrow_desc', fallbackDesc: 'Plan tomorrow before closing today so the next session starts faster.' },
  { icon: '📊', labelKey: 'nav_stats', fallbackLabel: 'Statistics', descKey: 'settings_feature_stats_desc', fallbackDesc: 'Review the essential trend: habits, focus, streak, and rhythm over time.' },
  { icon: '🔔', labelKey: 'settings_reminders', fallbackLabel: 'Reminders', descKey: 'settings_feature_reminders_desc', fallbackDesc: 'Bring the daily loop back with a simple local reminder.' },
  { icon: '💾', labelKey: 'settings_backup', fallbackLabel: 'Backup', descKey: 'settings_feature_backup_desc', fallbackDesc: 'Export and protect your data locally without an account.' },
]);

const CUSTOMIZATION_DEFAULTS = Object.freeze({
  brandName: '',
  brandTagline: '',
  density: 'comfortable',
  corners: 'standard',
  backgroundFx: 'on',
});

function _ensureCustomizationSettings() {
  db.settings.customization = {
    ...CUSTOMIZATION_DEFAULTS,
    ...(db.settings.customization || {}),
  };
}

function _ensureDailyHomeSettings() {
  if (!db.settings.homeCards || typeof db.settings.homeCards !== 'object') db.settings.homeCards = {};
  DAILY_HOME_CARD_IDS.forEach((moduleId) => {
    if (!(moduleId in db.settings.homeCards)) db.settings.homeCards[moduleId] = false;
  });
}

function _isDailyHomeEnabled(moduleId) {
  _ensureDailyHomeSettings();
  return db.settings.homeCards[moduleId] === true;
}

function _canExposeModuleInDaily(moduleId) {
  return _isModuleEnabled(moduleId) && _getModulePlacement(moduleId) !== 'hidden';
}

function _getDailyHomeLabel(moduleId) {
  const available = _canExposeModuleInDaily(moduleId);
  if (!available) return _settingsText('settings_daily_unavailable', 'Enable module first');
  return _isDailyHomeEnabled(moduleId)
    ? _settingsText('settings_daily_on', 'On Today')
    : _settingsText('settings_daily_off', 'Not on Today');
}

function _getModuleCoreToggleLabel(moduleId, mods = db.settings.modules || {}) {
  const state = _getModuleSurfaceState(moduleId, mods);
  if (state === 'hidden') return _settingsText('settings_modules_core_enable_first', 'Enable module first');
  return state === 'core'
    ? _settingsText('settings_modules_core_remove', 'Move to Advanced')
    : _settingsText('settings_modules_core_add', 'Move to Core');
}

function toggleModuleCorePlacement(moduleId) {
  if (_showLiteFeatureNotice('corePromotion', 'Core navigation customization is part of the full version.')) return;
  const moduleDef = _getModuleRegistry().getById(moduleId);
  if (!moduleDef) return;
  if (!_isModuleEnabled(moduleId)) return;
  const nextPlacement = _getModulePlacement(moduleId) === 'pinned'
    ? _getModuleDefaultPlacement(moduleId)
    : 'pinned';
  _setModulePlacement(moduleId, nextPlacement);
  saveDB();
  applyModules();
  renderSettings();
  EventBus.emit('settings:changed', {
    setting: 'module-core-placement',
    moduleId,
    value: nextPlacement === 'pinned' ? 'core' : 'advanced',
  });
}

function _sanitizeCustomizationText(value, maxLen) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function applyCustomizationSettings() {
  _ensureCustomizationSettings();
  const custom = db.settings.customization;
  const brandName = _sanitizeCustomizationText(custom.brandName, 18);
  const brandTagline = _sanitizeCustomizationText(custom.brandTagline, 44);
  const density = ['comfortable', 'compact'].includes(custom.density) ? custom.density : 'comfortable';
  const corners = ['soft', 'standard', 'sharp'].includes(custom.corners) ? custom.corners : 'standard';
  const backgroundFx = custom.backgroundFx === 'off' ? 'off' : 'on';

  custom.brandName = brandName;
  custom.brandTagline = brandTagline;
  custom.density = density;
  custom.corners = corners;
  custom.backgroundFx = backgroundFx;

  const doc = typeof document !== 'undefined' ? document : null;
  const rootStyle = doc?.documentElement?.style || null;
  const cornerMap = {
    soft: { radius: '18px', radiusSm: '12px' },
    standard: { radius: '14px', radiusSm: '9px' },
    sharp: { radius: '8px', radiusSm: '6px' },
  };
  const cornerPreset = cornerMap[corners] || cornerMap.standard;
  rootStyle?.setProperty?.('--radius', cornerPreset.radius);
  rootStyle?.setProperty?.('--radius-sm', cornerPreset.radiusSm);

  if (doc?.body?.dataset) {
    doc.body.dataset.uiDensity = density;
    doc.body.dataset.uiCorners = corners;
  }

  const logoName = doc?.getElementById?.('logo-wordmark-text');
  if (logoName) logoName.textContent = brandName || (globalThis.APP_META?.NAME || 'axiomOS');

  const logoTagline = doc?.getElementById?.('logo-tagline-text');
  if (logoTagline) logoTagline.textContent = brandTagline || _settingsText('app_tagline', globalThis.APP_META?.DEFAULT_TAGLINE || 'Private habit + focus');

  globalThis.applyAppMeta?.(doc);

  const canvas = doc?.getElementById?.('bg-canvas');
  if (canvas) {
    canvas.style.display = backgroundFx === 'off' ? 'none' : '';
    canvas.style.opacity = backgroundFx === 'off' ? '0' : '0.2';
  }
}

function _getSettingsSurface() {
  return globalThis.AxiomSettingsSurface || null;
}

function renderSettingsGuide() {
  _getSettingsSurface()?.renderSettingsGuide?.();
}

function renderLiteUpgradeBox() {
  _getSettingsSurface()?.renderLiteUpgradeBox?.();
}

function renderPwaInstallBox() {
  _getSettingsSurface()?.renderPwaInstallBox?.();
}

function cycleModulePlacement(moduleId) {
  if (_showLiteFeatureNotice('moduleCustomization', 'Module customization is part of the full version.')) return;
  const current = _getModulePlacement(moduleId);
  const next = current === 'pinned' ? 'advanced' : current === 'advanced' ? 'hidden' : 'pinned';
  _setModulePlacement(moduleId, next);
  saveDB();
  applyModules();
  renderSettings();
  EventBus.emit('settings:changed', { setting: 'module-placement', moduleId, value: next });
}

function _syncAdvancedNavVisibility(mods = db.settings.modules || {}) {
  const advancedToggle = document.getElementById('nav-advanced-toggle');
  const advancedGroup = document.getElementById('nav-advanced');
  const advancedMain = document.getElementById('nav-advanced-main');
  const labsGroup = document.getElementById('nav-labs-group');
  const labsList = document.getElementById('nav-labs');
  if (!advancedToggle || !advancedGroup) return;

  const hasVisibleItems = Array.from(advancedGroup.querySelectorAll('.ni')).some((item) => {
    return !item.classList.contains('hidden');
  });
  const hasVisibleLabs = labsList
    ? Array.from(labsList.querySelectorAll('.ni')).some((item) => !item.classList.contains('hidden'))
    : false;

  advancedToggle.classList.toggle('hidden', !hasVisibleItems);
  advancedGroup.classList.toggle('hidden', !hasVisibleItems);
  if (labsGroup) labsGroup.classList.toggle('hidden', !hasVisibleLabs);
  if (advancedMain) advancedMain.classList.toggle('hidden', !Array.from(advancedMain.querySelectorAll('.ni')).some((item) => !item.classList.contains('hidden')));

  if (!hasVisibleItems) {
    advancedGroup.classList.remove('open');
    advancedToggle.setAttribute('aria-expanded', 'false');
    localStorage.setItem('nav_advanced_open', '0');
  }
}

function applyModules() {
  _ensureModuleSurfaceSettings();
  const { MODULE_DEF } = _getModuleRegistry();
  if (typeof invalidateNavSurfaceCache === 'function') invalidateNavSurfaceCache();
  const mods = db.settings.modules || {};
  MODULE_DEF.forEach((moduleDef) => {
    const enabled = _isModuleEnabled(moduleDef.id, mods) && _getModulePlacement(moduleDef.id) !== 'hidden';
    const navItem = document.querySelector(`.ni[data-s="${moduleDef.sec}"]`);
    const section = document.getElementById(`sec-${moduleDef.sec}`);
    if (navItem) navItem.classList.toggle('hidden', !enabled);
    if (section) section.classList.toggle('hidden', !enabled);
    if (!enabled && DAILY_HOME_CARD_IDS.includes(moduleDef.id)) db.settings.homeCards[moduleDef.id] = false;
  });
  if (typeof applyNavSurfaceFromSettings === 'function') applyNavSurfaceFromSettings();
  _syncAdvancedNavVisibility(mods);

  const activeSection = _getShellState().getCurrentSection();
  const activeModule = _getModuleRegistry().MODULE_DEF.find((moduleDef) => moduleDef.sec === activeSection);
  if (activeModule && !_isModuleEnabled(activeModule.id, mods) && typeof showSection === 'function') {
    showSection('dashboard');
  }
}

function toggleModule(id) {
  if (_showLiteFeatureNotice('moduleCustomization', 'Module customization is part of the full version.')) return;
  if (!db.settings.modules) db.settings.modules = {};
  const nextEnabled = !_isModuleEnabled(id);
  db.settings.modules[id] = nextEnabled;
  if (!nextEnabled && DAILY_HOME_CARD_IDS.includes(id)) db.settings.homeCards[id] = false;
  if (nextEnabled && _getModulePlacement(id) === 'hidden') {
    _setModulePlacement(id, _getModuleDefaultPlacement(id));
  }
  saveDB();
  applyModules();
  renderSettings();
  EventBus.emit('settings:changed', { setting: 'module', moduleId: id, enabled: db.settings.modules[id] !== false });
}

function toggleDailyHomeCard(moduleId) {
  if (_showLiteFeatureNotice('moduleCustomization', 'Today customization is part of the full version.')) return;
  if (!DAILY_HOME_CARD_IDS.includes(moduleId)) return;
  if (!_canExposeModuleInDaily(moduleId)) db.settings.homeCards[moduleId] = false;
  else db.settings.homeCards[moduleId] = !_isDailyHomeEnabled(moduleId);
  saveDB();
  renderSettings();
  if (_getShellState().getCurrentSection() === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  EventBus.emit('settings:changed', { setting: 'home-card', moduleId, enabled: db.settings.homeCards[moduleId] === true });
}

function toggleCoreNavPin(section) {
  if (_showLiteFeatureNotice('corePromotion', 'Core navigation customization is part of the full version.')) return;
  const moduleDef = _getModuleRegistry().getBySection(section);
  if (!moduleDef) return;
  const nextPlacement = _getModulePlacement(moduleDef.id) === 'pinned' ? moduleDef.defaultPlacement : 'pinned';
  _setModulePlacement(moduleDef.id, nextPlacement);
  saveDB();
  if (typeof applyNavSurfaceFromSettings === 'function') applyNavSurfaceFromSettings();
  _syncAdvancedNavVisibility(db.settings.modules || {});
  renderSettings();
  EventBus.emit('settings:changed', {
    setting: 'core-nav-pin',
    section,
    pinned: db.settings.coreNavPins.includes(section),
  });
}

function applyExperienceMode(mode, options = {}) {
  if (_showLiteFeatureNotice('experienceModes', 'Lite stays on the simple setup.')) return;
  _ensureModuleSurfaceSettings();
  const { MODULE_DEF } = _getModuleRegistry();
  const normalizedMode = mode === 'focus' ? 'simple' : mode === 'all' ? 'expanded' : mode;
  if (!['simple', 'expanded', 'custom'].includes(normalizedMode)) return;

  MODULE_DEF.forEach((moduleDef) => {
    db.settings.modules[moduleDef.id] = true;
    let placement = moduleDef.defaultPlacement;
    if (normalizedMode === 'expanded') placement = 'advanced';
    if (normalizedMode === 'custom') placement = moduleDef.defaultPlacement;
    db.settings.modulePlacement[moduleDef.id] = placement;
  });

  db.settings.experienceMode = normalizedMode;
  db.settings.coreNavPins = MODULE_DEF
    .filter((moduleDef) => db.settings.modulePlacement[moduleDef.id] === 'pinned')
    .map((moduleDef) => moduleDef.sec);

  saveDB();
  applyModules();
  renderSettings();

  if (options.emit !== false) {
    EventBus.emit('settings:changed', { setting: 'experience-mode', value: normalizedMode });
  }

  if (!options.silent) {
    const messageKey = normalizedMode === 'expanded'
      ? 'settings_mode_expanded_done'
      : normalizedMode === 'custom'
        ? 'settings_mode_custom_done'
        : 'settings_mode_simple_done';
    notify(I18n.t(messageKey), '🧩', 'info');
  }
}

function applyModulePreset(preset, options = {}) {
  applyExperienceMode(preset, options);
}

// ─── RENDER SETTINGS ─────────────────────────────────────────
function renderSettings() {
  _ensureModuleSurfaceSettings();
  const lite = _getLiteMode();
  // Keep the active language controls visually in sync.
  const lang  = db.settings.lang || 'en';
  const itBtn = document.getElementById('lang-it-btn');
  const enBtn = document.getElementById('lang-en-btn');
  if (itBtn) itBtn.className = 'btn btn-sm ' + (lang === 'it' ? 'btn-primary' : 'btn-ghost');
  if (enBtn) enBtn.className = 'btn btn-sm ' + (lang === 'en' ? 'btn-primary' : 'btn-ghost');

  // Keep the language select aligned with the persisted value.
  const langSel = document.getElementById('lang-select');
  if (langSel) langSel.value = lang;

  const nameInput = document.getElementById('set-name');
  if (nameInput) nameInput.value = db.user?.name || '';

  const experienceMode = db.settings.experienceMode || 'simple';
  ['simple', 'expanded', 'custom'].forEach((mode) => {
    const button = document.getElementById(`settings-mode-${mode}`);
    if (!button) return;
    button.className = 'btn btn-sm ' + (experienceMode === mode ? 'btn-primary' : 'btn-ghost');
    button.setAttribute('aria-pressed', experienceMode === mode ? 'true' : 'false');
    button.disabled = !!lite;
    button.title = lite ? lite.featureMessage('experienceModes', 'Lite stays on the simple setup.') : '';
  });

  const customization = db.settings.customization || CUSTOMIZATION_DEFAULTS;
  const brandInput = document.getElementById('set-brand-name');
  if (brandInput) brandInput.value = customization.brandName || '';
  const taglineInput = document.getElementById('set-brand-tagline');
  if (taglineInput) taglineInput.value = customization.brandTagline || '';
  const densitySelect = document.getElementById('set-ui-density');
  if (densitySelect) densitySelect.value = customization.density || 'comfortable';
  const cornersSelect = document.getElementById('set-ui-corners');
  if (cornersSelect) cornersSelect.value = customization.corners || 'standard';
  const backgroundSelect = document.getElementById('set-background-fx');
  if (backgroundSelect) backgroundSelect.value = customization.backgroundFx || 'on';

  applyCustomizationSettings();

  // Theme presets
  const tp = document.getElementById('theme-presets-list');
  if (tp) {
    tp.innerHTML = '';
    const frag = document.createDocumentFragment();
    Object.entries(THEMES).forEach(([key, t]) => {
      const d = document.createElement('div');
      d.className = 'theme-preset' + (db.settings.theme === key ? ' on' : '');
      const dot = document.createElement('div');
      dot.className = 'theme-dot';
      dot.style.background = t.accent;
      const label = document.createElement('span');
      label.className = 'theme-preset-label';
      label.textContent = t.name;
      d.appendChild(dot);
      d.appendChild(label);
      d.addEventListener('click', () => applyTheme(key));
      frag.appendChild(d);
    });
    tp.appendChild(frag);
  }

  // Modules toggle list
  const ml = document.getElementById('modules-list');
  if (ml) {
    const moduleGroupState = _captureModuleGroupOpenState(ml);
    ml.replaceChildren();
    const mods = db.settings.modules || {};
    const modules = _getModuleRegistry().MODULE_DEF;

    const summary = document.createElement('div');
    summary.className = 'modules-compact-summary';
    [
      { label: _settingsText('settings_modules_place_pinned', 'Core'), count: modules.filter((m) => _getModuleSurfaceState(m.id, mods) === 'core').length, tone: 'core' },
      { label: _settingsText('settings_modules_place_advanced', 'Advanced'), count: modules.filter((m) => _getModuleSurfaceState(m.id, mods) === 'advanced').length, tone: 'accessory' },
      { label: _settingsText('settings_modules_place_hidden', 'Hidden'), count: modules.filter((m) => _getModuleSurfaceState(m.id, mods) === 'hidden').length, tone: 'muted' },
    ].forEach((item) => {
      const chip = document.createElement('span');
      chip.className = `settings-guide-tag${item.tone ? ` is-${item.tone}` : ''}`;
      chip.textContent = `${item.label}: ${item.count}`;
      summary.appendChild(chip);
    });
    ml.appendChild(summary);

    if (lite) {
      const note = document.createElement('div');
      note.className = 'settings-panel-copy';
      note.style.margin = '10px 0 16px';
      note.textContent = lite.featureMessage('moduleCustomization', 'Lite keeps the core loop focused. Advanced modules unlock in the full version.');
      ml.appendChild(note);
    }

    const frag = document.createDocumentFragment();
    [
      { id: 'advanced', key: 'settings_guide_accessory', fallback: 'Accessory functions', modules: modules.filter((moduleDef) => moduleDef.bucket === 'advanced'), open: true },
      { id: 'labs', key: 'settings_guide_tag_labs', fallback: 'Labs', modules: modules.filter((moduleDef) => moduleDef.bucket === 'labs'), open: false },
    ].forEach((groupDef) => {
      const section = document.createElement('details');
      section.className = 'mod-section-shell';
      if (_getModuleGroupOpenState(groupDef.id, groupDef.open, moduleGroupState)) section.open = true;
      _bindModuleGroupOpenState(section, groupDef.id);

      const head = document.createElement('summary');
      head.className = 'mod-section-head';

      const title = document.createElement('div');
      title.className = 'mod-section-title';
      title.textContent = _settingsText(groupDef.key, groupDef.fallback);

      const count = document.createElement('span');
      count.className = 'mod-section-count';
      count.textContent = String(groupDef.modules.length);

      head.appendChild(title);
      head.appendChild(count);
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'mod-grid';

        groupDef.modules
          .slice()
          .sort((a, b) => (MODULE_SETTINGS_ORDER[a.id] ?? 999) - (MODULE_SETTINGS_ORDER[b.id] ?? 999))
          .forEach((m) => {
          const d = document.createElement('div');
          const on  = _isModuleEnabled(m.id, mods);
          const placement = _getModulePlacement(m.id);
          const surfaceState = _getModuleSurfaceState(m.id, mods);
          const dailyEligible = DAILY_HOME_CARD_IDS.includes(m.id);
          const dailyAvailable = dailyEligible && _canExposeModuleInDaily(m.id);
          const lockedByLite = !!lite?.isLockedModule?.(m.id);
          const descText = _settingsText(m.guideKey, '');
          d.className = `mod-card${on ? '' : ' is-disabled'}${lockedByLite ? ' is-locked' : ''}`;
          d.dataset.moduleId = m.id;
          d.dataset.placement = placement;
          d.dataset.enabled = on ? 'true' : 'false';

          const copy = document.createElement('div');
          copy.className = 'mod-card-copy';

          const titleLine = document.createElement('div');
          titleLine.className = 'mod-card-titleline';

          const icon = document.createElement('span');
          icon.className = 'mod-card-icon';
          icon.textContent = m.icon;

          const name = document.createElement('div');
          name.className = 'mod-card-name';
          name.textContent = I18n.t(m.labelKey);

          titleLine.appendChild(icon);
          titleLine.appendChild(name);

          const desc = document.createElement('div');
          desc.className = 'mod-card-desc';
          desc.textContent = descText;

          copy.appendChild(titleLine);
          if (descText) copy.appendChild(desc);

          const statusRow = document.createElement('div');
          statusRow.className = 'mod-card-meta';

          const statusTag = document.createElement('span');
          statusTag.className = `settings-guide-tag mod-placement-pill${surfaceState === 'core' ? ' is-core' : surfaceState === 'hidden' ? ' is-muted' : ' is-accessory'}`;
          statusTag.textContent = lockedByLite
            ? _settingsText('settings_modules_full_only', 'Full only')
            : _settingsText(`settings_modules_place_${surfaceState === 'core' ? 'pinned' : surfaceState}`, surfaceState === 'core' ? 'Core' : surfaceState === 'hidden' ? 'Hidden' : 'Advanced');
          statusRow.appendChild(statusTag);

          const coreBtn = document.createElement('button');
          coreBtn.type = 'button';
          coreBtn.className = `settings-guide-tag mod-placement-pill mod-core-pill${surfaceState === 'core' ? ' is-core' : ' is-accessory'}${surfaceState === 'hidden' ? ' is-disabled is-muted' : ''}`;
          coreBtn.textContent = _getModuleCoreToggleLabel(m.id, mods);
          coreBtn.title = _settingsText('settings_modules_core_help', 'Promote this module into the main core navigation or move it back to Advanced.');
          coreBtn.setAttribute('aria-label', coreBtn.title);
          coreBtn.disabled = surfaceState === 'hidden' || !!lite;
          if (lite) coreBtn.classList.add('is-disabled');
          coreBtn.addEventListener('click', () => toggleModuleCorePlacement(m.id));
          statusRow.appendChild(coreBtn);

          if (dailyEligible) {
            const dailyBtn = document.createElement('button');
            dailyBtn.type = 'button';
            dailyBtn.className = `settings-guide-tag mod-placement-pill mod-daily-pill${_isDailyHomeEnabled(m.id) ? ' is-core' : ' is-muted'}`;
            dailyBtn.textContent = _getDailyHomeLabel(m.id);
            dailyBtn.title = _settingsText('settings_daily_help', 'Choose which accessory modules also show up on Today as compact cards.');
            dailyBtn.setAttribute('aria-label', dailyBtn.title);
            dailyBtn.disabled = !dailyAvailable || !!lite;
            if (!dailyAvailable || lite) dailyBtn.classList.add('is-disabled');
            dailyBtn.addEventListener('click', () => toggleDailyHomeCard(m.id));
            statusRow.appendChild(dailyBtn);
          }

          const sw = document.createElement('div');
          sw.className = 'sw' + (on ? ' on' : '');
          sw.setAttribute('role', 'switch');
          sw.setAttribute('aria-checked', on ? 'true' : 'false');
          if (lite) {
            sw.className += ' is-disabled';
            sw.setAttribute('aria-disabled', 'true');
          }
          sw.tabIndex = 0;
          sw.addEventListener('click', () => toggleModule(m.id));
          sw.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleModule(m.id);
            }
          });

          const head = document.createElement('div');
          head.className = 'mod-card-head';

          const toggleWrap = document.createElement('div');
          toggleWrap.className = 'mod-card-toggle';
          toggleWrap.appendChild(sw);

          head.appendChild(copy);
          head.appendChild(toggleWrap);

          d.appendChild(head);
          d.appendChild(statusRow);
          grid.appendChild(d);
        });

      section.appendChild(grid);
      frag.appendChild(section);
    });

    ml.appendChild(frag);
  }

  const importBtn = document.querySelector('[data-action="data:import-pick"]');
  if (importBtn) {
    importBtn.disabled = !!lite;
    importBtn.title = lite ? lite.featureMessage('import', 'JSON import is disabled in Lite.') : '';
  }
  const importInput = document.getElementById('imp-file');
  if (importInput) importInput.disabled = !!lite;

  renderSettingsGuide();
  renderLiteUpgradeBox();
  renderPwaInstallBox();

  // Refresh backup-related controls after the settings panel re-render.
  if (typeof updateBackupUI === 'function') updateBackupUI();
  renderStorageReport();
}

function _getSettingsData() {
  return globalThis.AxiomSettingsData || null;
}

function _getLiteMode() {
  return globalThis.AxiomLite?.enabled ? globalThis.AxiomLite : null;
}

function _getLiteUpgradePromptCopy() {
  const lang = db?.settings?.lang || I18n?.lang || 'en';
  if (typeof globalThis.AxiomLite?.getUpgradeCopy === 'function') return globalThis.AxiomLite.getUpgradeCopy();
  return lang === 'it'
    ? { title: 'Disponibile nella versione completa', cta: 'Vai al full' }
    : { title: 'Available in the full version', cta: 'View full version' };
}

function _showLiteFeatureNotice(feature, fallback) {
  const lite = _getLiteMode();
  if (!lite || lite.canUseFeature?.(feature) !== false) return false;
  const message = lite.featureMessage(feature, fallback);
  const copy = _getLiteUpgradePromptCopy();
  if (typeof ConfirmModal?.show === 'function') {
    Promise.resolve(ConfirmModal.show({
      title: copy.title,
      body: message,
      icon: '⭐',
      okLabel: copy.cta,
      okClass: 'btn-primary'
    }))
      .then((ok) => {
        if (ok) lite.openUpgradeUrl?.();
      })
      .catch(() => {
        notify(message, '⭐', 'info');
      });
  } else {
    notify(message, '⭐', 'info');
  }
  return true;
}

function renderStorageReport() {
  return _getSettingsData()?.renderStorageReport?.();
}

function runStorageCleanup() {
  return _getSettingsData()?.runStorageCleanup?.();
}

// ══════════════════════════════════════════════════════════════
// LANGUAGE SYSTEM — lightweight bridge for modules that still refresh
// specific labels after a language change.
// ══════════════════════════════════════════════════════════════
function _translatedLabel(key, lang) {
  if (typeof I18n !== 'undefined') return I18n.t(key);
  if (key === 'nav_char_sheet') return lang === 'en' ? 'Character Sheet' : 'Scheda Personaggio';
  if (key === 'nav_fitness') return 'Fitness';
  return key;
}
function applyLanguage() {
  const lang = db?.settings?.lang || (typeof I18n !== 'undefined' ? I18n.lang : 'en') || 'en';
  document.documentElement.lang = lang;

  const niChar = document.querySelector('.ni[data-s="life-areas"] span:not(.ni-ic)');
  if (niChar) niChar.textContent = _translatedLabel('nav_char_sheet', lang);

  const niFit = document.querySelector('.ni[data-s="fitness"] span:not(.ni-ic)');
  if (niFit) niFit.textContent = _translatedLabel('nav_fitness', lang);

  const activeSection = _getShellState().getCurrentSection();
  if (activeSection === 'life-areas') renderLifeAreas();
  if (activeSection === 'fitness') renderFitness();
}

// ─── SETTINGS ACTIONS ─────────────────────────────────────────
function setLanguage(lang) {
  if (!['it','en'].includes(lang)) return;
  db.settings.lang = lang;
  db.settings.langChoiceDone = true;
  if (typeof I18n !== 'undefined') I18n.setLanguage(lang);
  else saveDB();
  applyLanguage();
  renderSettings();
  applyCustomizationSettings();
  if (typeof syncOnboardingLanguageUI === 'function') syncOnboardingLanguageUI();
  sectionTitles['life-areas'] = _translatedLabel('nav_char_sheet', lang);
  sectionTitles['fitness']    = _translatedLabel('nav_fitness', lang);
  EventBus.emit('settings:changed', { setting: 'language', value: lang });
  notify(I18n.t('settings_lang_set'), '🌐', 'info');
}

function saveName() {
  const result = InputValidator.validateName(
    document.getElementById('set-name').value,
    typeof I18n !== 'undefined' ? I18n.t('settings_name') : 'Name'
  );
  if (!result.valid) { notify(result.error, '⚠', 'info'); return; }
  db.user.name = result.value;
  saveDB();
  EventBus.emit('settings:changed', { setting: 'profile', field: 'name' });
  notify(I18n.t('settings_name_saved'), '👤', 'info');
}

function saveCustomizationSettings() {
  _ensureCustomizationSettings();
  const brandInput = document.getElementById('set-brand-name');
  const taglineInput = document.getElementById('set-brand-tagline');
  const densitySelect = document.getElementById('set-ui-density');
  const cornersSelect = document.getElementById('set-ui-corners');
  const backgroundSelect = document.getElementById('set-background-fx');

  db.settings.customization = {
    brandName: _sanitizeCustomizationText(brandInput?.value, 18),
    brandTagline: _sanitizeCustomizationText(taglineInput?.value, 44),
    density: ['comfortable', 'compact'].includes(densitySelect?.value) ? densitySelect.value : 'comfortable',
    corners: ['soft', 'standard', 'sharp'].includes(cornersSelect?.value) ? cornersSelect.value : 'standard',
    backgroundFx: backgroundSelect?.value === 'off' ? 'off' : 'on',
  };

  applyCustomizationSettings();
  saveDB();
  EventBus.emit('settings:changed', { setting: 'customization', value: { ...db.settings.customization } });
  notify(_settingsText('settings_customize_saved', 'Customization updated.'), '✨', 'info');
}

function resetCustomizationSettings() {
  db.settings.customization = { ...CUSTOMIZATION_DEFAULTS };
  applyCustomizationSettings();
  saveDB();
  renderSettings();
  EventBus.emit('settings:changed', { setting: 'customization-reset' });
  notify(_settingsText('settings_customize_reset_done', 'Customization reset.'), '✨', 'info');
}

function setAccent(a, b) {
  document.documentElement.style.setProperty('--accent', a);
  document.documentElement.style.setProperty('--ag', a+'26');
  db.settings.accentColor = a;
  db.settings.accentDark  = b;
  saveDB();
  EventBus.emit('settings:changed', { setting: 'accent', value: a });
  notify(I18n.t('settings_theme_saved'), '🎨', 'info');
}

function setReminder() {
  const t = document.getElementById('rem-time').value;
  if (!/^\d{2}:\d{2}$/.test(t)) {
    notify(I18n.t('settings_reminder_invalid'), '⚠', 'info');
    return;
  }
  db.settings.remTime = t;
  saveDB();
  EventBus.emit('settings:changed', { setting: 'reminder', value: t });
  const applyReminder = typeof ReminderManager !== 'undefined'
    ? ReminderManager.configure(t)
    : Promise.resolve({ permission: ('Notification' in window) ? Notification.permission : 'unsupported' });
  return applyReminder.then((state) => {
    if (state.permission === 'unsupported') {
      notify(I18n.t('settings_reminder_unsupported'), '🔕', 'info');
      return state;
    }
    if (state.permission === 'denied') {
      notify(I18n.t('settings_reminder_denied'), '🔕', 'info');
      return state;
    }
    notify(I18n.t('settings_reminder_set', t), '🔔', 'info');
    return state;
  }).catch((err) => {
    console.warn('[Reminder] configure failed:', err);
    notify(I18n.t('settings_reminder_saved_fallback'), '🔔', 'info');
    return { permission: 'error', error: err };
  });
}

function enableReminderNow() {
  const reminderTime = db.settings?.remTime || '08:00';
  db.settings.remTime = reminderTime;
  const input = document.getElementById('rem-time');
  if (input) input.value = reminderTime;
  saveDB();

  const applyReminder = typeof ReminderManager !== 'undefined'
    ? ReminderManager.configure(reminderTime)
    : Promise.resolve({ permission: ('Notification' in window) ? Notification.permission : 'unsupported' });

  return applyReminder.then((state) => {
    EventBus.emit('settings:changed', { setting: 'reminder', value: reminderTime });
    if (state.permission === 'unsupported') {
      notify(I18n.t('settings_reminder_unsupported'), '🔕', 'info');
      return state;
    }
    if (state.permission === 'denied') {
      notify(I18n.t('settings_reminder_denied'), '🔕', 'info');
      return state;
    }
    notify(I18n.t('settings_reminder_set', reminderTime), '🔔', 'info');
    return state;
  }).catch((err) => {
    console.warn('[Reminder] quick enable failed:', err);
    notify(I18n.t('settings_reminder_saved_fallback'), '🔔', 'info');
    return { permission: 'error', error: err };
  });
}

function exportData() {
  return _getSettingsData()?.exportData?.();
}

function importData(e) {
  return _getSettingsData()?.importData?.(e);
}

async function createAutoBackup() {
  return _getSettingsData()?.createAutoBackup?.();
}

async function hardReset() {
  return _getSettingsData()?.hardReset?.();
}


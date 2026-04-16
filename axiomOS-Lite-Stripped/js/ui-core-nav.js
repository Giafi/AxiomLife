// ══════════════════════════════════════════════════════════════
// ui-core-nav.js — Section navigation, time period helpers
//
// Depends on: app-shell-state.js (shell state),
//             ui-core.js (date helpers),
//             toast.js (notify),
//             modals.js (openModal, closeModal)
// ══════════════════════════════════════════════════════════════

// ─── PERIOD HELPERS ─────────────────────────────────────────────────────────
function _getShellState() {
  return globalThis.AxiomShellState || {
    getCurrentSection: () => globalThis.currentSection,
    setCurrentSection: (value) => { globalThis.currentSection = value; return globalThis.currentSection; },
    getTimeView: () => globalThis.timeView,
    setTimeView: (value) => { globalThis.timeView = value; return globalThis.timeView; },
    getPeriodOffset: () => globalThis.periodOffset,
    setPeriodOffset: (value) => { globalThis.periodOffset = value; return globalThis.periodOffset; },
    bumpPeriodOffset: (delta) => {
      globalThis.periodOffset = (globalThis.periodOffset || 0) + delta;
      return globalThis.periodOffset;
    },
    resetPeriodOffset: () => {
      globalThis.periodOffset = 0;
      return globalThis.periodOffset;
    },
  };
}

function periodDates() {
  const shell = _getShellState();
  const timeView = shell.getTimeView();
  const periodOffset = shell.getPeriodOffset();
  const now = new Date();
  if (timeView === 'day') {
    const d = new Date(now); d.setDate(d.getDate() + periodOffset);
    return [toKey(d)];
  }
  if (timeView === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + periodOffset * 7);
    const day = (d.getDay() + 6) % 7; // Mon = 0
    const mon = new Date(d); mon.setDate(d.getDate() - day);
    return Array.from({length:7}, (_,i) => {
      const x = new Date(mon); x.setDate(mon.getDate()+i); return toKey(x);
    });
  }
  if (timeView === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
    const days = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return Array.from({length:days}, (_,i) =>
      toKey(new Date(d.getFullYear(), d.getMonth(), i+1))
    );
  }
  return [today()];
}

function periodLabel() {
  const shell = _getShellState();
  const timeView = shell.getTimeView();
  const periodOffset = shell.getPeriodOffset();
  const now = new Date();
  const lang = (db?.settings?.lang || (typeof I18n !== 'undefined' ? I18n.lang : 'en') || 'en');
  const locale = lang === 'it' ? 'it-IT' : 'en-US';
  if (timeView === 'day') {
    if (periodOffset === 0) return I18n.t('label_today');
    if (periodOffset === -1) return I18n.t('label_yesterday');
    const d = new Date(now); d.setDate(d.getDate()+periodOffset);
    return d.toLocaleDateString(locale,{day:'2-digit',month:'short'});
  }
  if (timeView === 'week') {
    const dates = periodDates();
    return dates[0].slice(5) + ' - ' + dates[6].slice(5);
  }
  if (timeView === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth()+periodOffset, 1);
    return d.toLocaleDateString(locale,{month:'long',year:'numeric'});
  }
}

function setTimeView(v) {
  const shell = _getShellState();
  shell.setTimeView(v);
  shell.resetPeriodOffset();
  document.querySelectorAll('.tview-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.view===v)
  );
  document.getElementById('period-label').textContent = periodLabel();
  refreshCurrentSection();
}

function navigatePeriod(dir) {
  _getShellState().bumpPeriodOffset(dir);
  document.getElementById('period-label').textContent = periodLabel();
  refreshCurrentSection();
}

// ─── SECTION NAVIGATION ───────────────────────────────────────

// Cache DOM refs — avoids querySelectorAll on every click.
let _niItems  = null;
let _secItems = null;
let _niActive = null;

function _getNiItems()  { return _niItems  || (_niItems  = document.querySelectorAll('.ni')); }
function _getSecItems() { return _secItems || (_secItems = document.querySelectorAll('.sec')); }
function invalidateNavSurfaceCache() {
  _niItems = null;
  _secItems = null;
  _niActive = null;
}
function _getModuleRegistry() {
  const registry = globalThis.AxiomModuleRegistry;
  if (!registry) throw new Error('AxiomModuleRegistry is required before ui-core-nav.js');
  return registry;
}

const SECTION_TITLE_KEYS = {
  dashboard:'nav_dashboard',
  habits:'nav_habits',
  identity:'nav_identity',
  goals:'nav_goals',
  deepwork:'nav_deepwork',
  reflection:'nav_reflection',
  stats:'nav_stats',
  achievements:'nav_achievements',
  experiments:'nav_experiments',
  packages:'nav_packages',
  quotes:'nav_quotes',
  settings:'nav_settings',
  tomorrow:'nav_tomorrow',
  'life-areas':'nav_char_sheet',
  attributes:'nav_attributes',
  rewards:'nav_rewards',
  skills:'nav_skills',
  library:'nav_library',
  vision:'nav_vision_board',
  fitness:'nav_fitness'
};
const sectionTitles = {};

function isKnownSection(name) {
  return !!(name && document.getElementById('sec-' + name));
}

function getSectionFromLocation() {
  try {
    const name = new URLSearchParams(location.search || '').get('section');
    return isKnownSection(name) ? name : 'dashboard';
  } catch {
    return 'dashboard';
  }
}

function syncSectionToLocation(name, { replace = false } = {}) {
  try {
    const url = new URL(location.href);
    if (name && name !== 'dashboard') url.searchParams.set('section', name);
    else url.searchParams.delete('section');
    const method = replace ? 'replaceState' : 'pushState';
    if (history?.[method]) history[method](null, '', url);
  } catch {
    // Ignore URL/history sync failures in restricted contexts.
  }
}

function refreshSectionTitles() {
  Object.entries(SECTION_TITLE_KEYS).forEach(([section, key]) => {
    sectionTitles[section] = typeof I18n !== 'undefined' ? I18n.t(key) : key;
    const item = document.querySelector(`.ni[data-s="${section}"]`);
    const label = item?.querySelector('span:not(.ni-ic):not(.ni-badge)');
    if (label) label.textContent = sectionTitles[section];
    if (item) item.setAttribute('aria-label', sectionTitles[section]);
  });
}

refreshSectionTitles();

function getCoreNavPins() {
  const registry = _getModuleRegistry();
  const rawPins = db?.settings?.coreNavPins;
  const placementPins = Object.entries(db?.settings?.modulePlacement || {})
    .filter(([, placement]) => placement === 'pinned')
    .map(([moduleId]) => registry.PINNABLE_CORE_SECTION_ORDER.find((section) => registry.SECTION_TO_MODULE_ID[section] === moduleId))
    .filter(Boolean);
  const combined = [...(Array.isArray(rawPins) ? rawPins : []), ...placementPins];
  return [...new Set(combined.filter((section) => registry.PINNABLE_CORE_SECTION_ORDER.includes(section)))];
}

function applyNavSurfaceFromSettings() {
  const registry = _getModuleRegistry();
  const coreExtra = document.getElementById('nav-core-extra');
  const advancedMain = document.getElementById('nav-advanced-main');
  const labs = document.getElementById('nav-labs');
  if (!coreExtra || !advancedMain || !labs) return;

  const pinned = new Set(getCoreNavPins());
  registry.PINNABLE_CORE_SECTION_ORDER.forEach((section) => {
    const item = document.querySelector(`.ni[data-s="${section}"]`);
    if (!item) return;
    const target = pinned.has(section)
      ? coreExtra
      : registry.isLabSection(section)
        ? labs
        : advancedMain;
    if (item.parentElement !== target) target.appendChild(item);
  });

  const hasVisiblePinned = Array.from(coreExtra.querySelectorAll('.ni')).some((item) => {
    return !item.classList.contains('hidden');
  });
  coreExtra.classList.toggle('hidden', !hasVisiblePinned);
}

function showSection(name, options = {}) {
  const { syncUrl = true, replaceUrl = false } = options;
  const shell = _getShellState();
  const requestedSection = isKnownSection(name) ? name : 'dashboard';
  const sectionName = globalThis.AxiomLite?.isLockedSection?.(requestedSection) ? 'dashboard' : requestedSection;
  const target = document.getElementById('sec-' + sectionName);
  if (shell.getCurrentSection() === sectionName && target?.classList.contains('on')) {
    if (syncUrl) syncSectionToLocation(sectionName, { replace: replaceUrl });
    refreshCurrentSection();
    return;
  }

  shell.setCurrentSection(sectionName);

  const applyUpdate = () => {
    _getNiItems().forEach(i => {
      const isActive = i.dataset.s === sectionName;
      i.classList.toggle('on', isActive);
      if (isActive) i.setAttribute('aria-current', 'page');
      else          i.removeAttribute('aria-current');
    });
    _getSecItems().forEach(s => s.classList.remove('on'));
    if (target) target.classList.add('on');
    document.getElementById('page-title').textContent = sectionTitles[sectionName] || sectionName;
    if (syncUrl) syncSectionToLocation(sectionName, { replace: replaceUrl });
    refreshCurrentSection();
    EventBus.emit('section:changed', { name: sectionName });
  };

  applyUpdate();
}

// ─── REFRESH SECTION (rAF-deferred) ──────────────────────────
// Heavy sections stay deferred by one rAF to avoid blocking input,
// while lighter sections render immediately during navigation.
// ─────────────────────────────────────────────────────────────
function refreshCurrentSection() {
  const s = _getShellState().getCurrentSection();
  const heavy = ['stats','achievements','identity','goals','experiments','packages','quotes'];
  if (heavy.includes(s)) {
    requestAnimationFrame(() => {
      if (s === 'stats')            renderStats();
      else if (s === 'achievements') renderAchievements();
      else if (s === 'identity')    renderIdentities();
      else if (s === 'goals')       renderGoals();
      else if (s === 'experiments') renderExperiments();
      else if (s === 'packages')    renderPackages();
      else if (s === 'quotes')      renderQuotes();
    });
  } else {
    if      (s==='dashboard')   renderDashboard();
    else if (s==='habits')      renderHabits();
    else if (s==='deepwork')    renderDW();
    else if (s==='reflection')  renderReflection();
    else if (s==='tomorrow')    renderTomorrow();
    else if (s==='life-areas')  renderLifeAreas();
    else if (s==='fitness')     renderFitness();
    else if (s==='attributes')  renderAttributes();
    else if (s==='rewards')     renderRewards();
    else if (s==='skills')      renderSkills();
    else if (s==='library')     renderLibrary();
    else if (s==='vision')      renderVisionBoard();
    else if (s==='settings')    renderSettings();
  }
}

// ─── NAV EVENT DELEGATION ─────────────────────────────────────
// One delegated handler keeps navigation working even when settings move
// sections between the primary row and the secondary "More" group.
let _navDelegationBound = false;

function initSectionNavDelegation() {
  if (_navDelegationBound) return;
  _navDelegationBound = true;

  const sidebarNav = document.getElementById('sidebar-nav');
  if (!sidebarNav) return;

  sidebarNav.addEventListener('click', (event) => {
    const item = event.target.closest('.ni[data-s]');
    if (!item || !sidebarNav.contains(item)) return;
    showSection(item.dataset.s);
  });

  sidebarNav.addEventListener('keydown', (event) => {
    const item = event.target.closest('.ni[data-s]');
    if (!item || !sidebarNav.contains(item)) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      showSection(item.dataset.s);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const visibleItems = Array.from(sidebarNav.querySelectorAll('.ni[data-s]:not(.hidden)'));
    const idx = visibleItems.indexOf(item);
    if (idx === -1) return;
    const nextIdx = event.key === 'ArrowDown'
      ? Math.min(idx + 1, visibleItems.length - 1)
      : Math.max(idx - 1, 0);
    visibleItems[nextIdx]?.focus();
  });
}

initSectionNavDelegation();

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('popstate', () => {
    showSection(getSectionFromLocation(), { syncUrl: false });
  });
}

const qbadge = document.getElementById('daily-quest-badge');
if (qbadge) {
  qbadge.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showSection('dashboard');
      scrollToQuests();
    }
  });
}

// ─── SIDEBAR ADVANCED SECTION (collapsible) ───────────────────
// Persists open/closed state in localStorage.
(function initNavAdvanced() {
  const block  = document.getElementById('nav-advanced');
  const toggle = document.getElementById('nav-advanced-toggle');
  if (!block || !toggle) return;

  const stored = localStorage.getItem('nav_advanced_open');
  let open = stored === '1' || stored === 'true';

  function apply() {
    block.classList.toggle('open', open);
    const label = toggle.querySelector('[data-nav-more-label]');
    const arrow = toggle.querySelector('.nav-adv-arrow');
    if (label) label.textContent = typeof I18n !== 'undefined' ? I18n.t('nav_more') : 'More';
    if (arrow) arrow.textContent = open ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setOpen(next, persist = true) {
    open = !!next;
    if (persist) localStorage.setItem('nav_advanced_open', open ? '1' : '0');
    document.documentElement.dataset.navAdvancedOpen = open ? '1' : '0';
    apply();
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  });

  apply();
})();

document.addEventListener('i18n:change', () => {
  const shell = _getShellState();
  refreshSectionTitles();
  applyNavSurfaceFromSettings();
  const pageTitle = document.getElementById('page-title');
  if (pageTitle && shell.getCurrentSection()) pageTitle.textContent = sectionTitles[shell.getCurrentSection()] || shell.getCurrentSection();
  const period = document.getElementById('period-label');
  if (period) period.textContent = periodLabel();
  const toggle = document.getElementById('nav-advanced-toggle');
  if (toggle) {
    const label = toggle.querySelector('[data-nav-more-label]');
    if (label) label.textContent = I18n.t('nav_more');
    const arrow = toggle.querySelector('.nav-adv-arrow');
    const stored = localStorage.getItem('nav_advanced_open');
    const open = stored === '1' || stored === 'true';
    if (arrow) arrow.textContent = open ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
});

// ─── NAMESPACE: UIManager ─────────────────────────────────────
// Central namespace for UI orchestration.
// openModal / closeModal / notify remain globally defined in their
// source files; they are referenced here so callers can reach them
// through a single UIManager object if preferred.
const UIManager = {
  showSection,
  refreshCurrentSection,
  setTimeView,
  navigatePeriod,
  periodDates,
  periodLabel,
  getSectionFromLocation,
  applyNavSurfaceFromSettings,
  getCoreNavPins,
  invalidateNavSurfaceCache,
  openModal,   // defined in modals.js
  closeModal,  // defined in modals.js
  notify,      // defined in toast.js
};


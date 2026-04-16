// ══════════════════════════════════════════════════════════════
// ui-core-habits.js — Habit rendering, dashboard, completion
//
// Depends on: ui-core.js (shared date helpers),
//             ui-core-nav.js (periodDates, today),
//             ui-core-xp.js (addXP, updateSidebar, calcStreak),
//             habits.js (editHabit, deleteHabit, updateIdentityScore),
//             rpg.js (addLifeAreaXP),
//             entity-logic.js (checkAch, checkQuestProgress,
//                              generateDailyQuests, triggerEvent),
//             security.js (escapeHtml, escapeAttr),
//             constants.js (COLORS, CAT_ICONS, APP_CONSTANTS),
//             shared-text.js (AxiomText)
// ══════════════════════════════════════════════════════════════

// ─── HABIT HELPERS ───────────────────────────────────────────────────────

function isDoneToday(habitId, key) {
  return !!(db.completions[key] && db.completions[key][habitId]);
}

function normalizeHabitDays(days) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const normalized = days
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return normalized.length ? normalized : null;
}

function isHabitActiveOnDate(habit, dateKey) {
  const d = new Date(dateKey);
  const dayIdx = (d.getDay() + 6) % 7; // 0=Mon
  const normalizedDays = normalizeHabitDays(habit?.days);
  return !normalizedDays || normalizedDays.includes(dayIdx);
}

function recalcHabitStreak(habitId) {
  _invalidateStreakCache();
  let s = 0;
  const d = new Date();
  while (true) {
    const k = toKey(d);
    if (db.completions[k]?.[habitId]) { s++; d.setDate(d.getDate()-1); }
    else break;
  }
  const h = db.habits.find(x=>x.id===habitId);
  if (h) { h.streak=s; if(s>h.bestStreak) h.bestStreak=s; }
  const gs = calcStreak();
  if (gs >= 3)   checkAch('streak_3');
  if (gs >= 7)   checkAch('streak_7');
  if (gs >= 21)  checkAch('streak_21');
  if (gs >= 30)  checkAch('streak_30');
  if (gs >= 66)  checkAch('streak_66');
  if (gs >= 100) checkAch('streak_100');
  if (gs >= 365) checkAch('streak_365');
}

function calcMomentum() {
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = toKey(d);
    if (Object.keys(db.completions[k]||{}).length > 0) s++;
  }
  return s;
}

function HT(key, ...args) {
  return AxiomText.t(key, ...args);
}

function getCategoryLabel(cat) {
  const keyMap = {
    salute: 'cat_health',
    mente: 'cat_mind',
    studio: 'cat_study',
    fitness: 'cat_fitness',
    sociale: 'cat_social',
    creativo: 'cat_creative',
    produttività: 'cat_productivity',
    altro: 'cat_other',
  };
  return HT(keyMap[cat] || 'cat_other');
}

let _sessionQuoteId = null;
function pickSessionQuote(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const existing = pool.find((quote) => quote.id === _sessionQuoteId);
  if (existing) return existing;
  const randomQuote = pool[Math.floor(Math.random() * pool.length)];
  _sessionQuoteId = randomQuote?.id || null;
  return randomQuote || null;
}

const HABIT_XP_MULTIPLIERS = [1, 1, 1.5, 2, 3];

function getHabitBaseXP(habit) {
  const multiplier = HABIT_XP_MULTIPLIERS[habit?.difficulty || 1] || 1;
  return Math.round(20 * multiplier);
}

function getMomentumMultiplier(momentum) {
  return momentum >= 7 ? 1.5 : momentum >= 3 ? 1.2 : 1;
}

function getHabitAwardedXP(habit, momentum = calcMomentum()) {
  const baseXp = getHabitBaseXP(habit);
  const momentumMultiplier = getMomentumMultiplier(momentum);
  return {
    baseXp,
    momentum,
    momentumMultiplier,
    totalXp: Math.round(baseXp * momentumMultiplier),
  };
}

// ─── TARGETED DOM PATCHES ─────────────────────────────────────
// Surgical updates: no full list rebuild needed on single-habit changes.

function _patchHabitRows(habitId, isDone, dateKey) {
  const habit = db.habits.find(h => h.id === habitId);
  const rows  = document.querySelectorAll(`[data-habit-id="${habitId}"]`);
  rows.forEach(row => {
    row.classList.toggle('done', isDone);
    row.setAttribute('aria-checked', isDone ? 'true' : 'false');
    // XSS protection — habit.name in aria-label must be escaped as attribute.
    if (habit) row.setAttribute('aria-label', `${escapeAttr(habit.name)}${isDone ? ` - ${HT('habit_completed_suffix')}` : ''}`);

    const chk = row.querySelector('.habit-check');
    if (chk) chk.textContent = isDone ? '✓' : '';

    const streakEl = row.querySelector('.habit-streak');
    if (streakEl && habit) {
      streakEl.textContent = '🔥' + (habit.streak||0);
      streakEl.setAttribute('aria-label', HT('streak_label', habit.streak||0));
    }

    const xpEl = row.querySelector('.habit-xp');
    if (xpEl && habit) {
      const xpVal = getHabitBaseXP(habit);
      xpEl.textContent = '+' + xpVal + 'XP';
      xpEl.setAttribute('aria-label', '+' + xpVal + ' XP');
    }
  });
}

function _patchDashStats(dateKey) {
  const k = dateKey || (periodDates()[0] || today());
  const allActive = db.habits.filter(h=>isHabitActiveOnDate(h,k));
  const doneCount = allActive.filter(h => db.completions[k]?.[h.id]).length;
  const todayXp   = Object.values(db.completions[k]||{}).reduce((s,c)=>s+(c.xp||0),0);
  const dwMin     = db.deepWork.lastDate===k ? db.deepWork.todayMin : 0;
  const streak    = calcStreak();

  const cards = document.querySelectorAll('#dash-stats .stat-val');
  if (cards.length >= 4) {
    cards[0].textContent = `${doneCount}/${allActive.length}`;
    cards[1].textContent = streak;
    cards[2].textContent = todayXp;
    cards[3].textContent = dwMin + 'm';
  }
}

function _patchMomentumBar() {
  const m = calcMomentum();
  const nodes = document.querySelectorAll('#momentum-bar .mom-node');
  nodes.forEach((n, i) => {
    const shouldLit = i < m;
    const isLit = n.classList.contains('lit');
    if (shouldLit !== isLit) {
      n.classList.toggle('lit', shouldLit);
      n.textContent = shouldLit ? '✓' : '';
    }
  });
  const msg = document.getElementById('momentum-msg');
  if (!msg) return;
  _renderMomentumMessage(msg, m);
}

function _renderMomentumMessage(host, momentum) {
  if (!host) return;
  if (momentum < 3) {
    host.textContent = HT('momentum_progress', momentum);
    return;
  }

  const text = momentum >= 7 ? HT('momentum_max') : HT('momentum_active', momentum);
  const icon = momentum >= 7 ? '🔥' : '⚡';
  const color = momentum >= 7 ? 'var(--gold)' : 'var(--accent)';
  const current = `${icon} ${text}`;
  if (host.textContent === current && (host.childElementCount ?? 0) <= 1) return;

  host.textContent = '';
  const badge = document.createElement('span');
  badge.style.color = color;
  badge.textContent = current;
  if (typeof host.appendChild === 'function') host.appendChild(badge);
  else host.textContent = current;
}

function _renderSmallMessage(host, text) {
  if (!host) return;
  host.innerHTML = '';
  const message = document.createElement('div');
  message.className = 'dim small';
  message.textContent = text;
  host.appendChild(message);
}

// ─── HABIT COMPLETION ────────────────────────────────────────────────────

function completeHabit(habitId, fromDash=false) {
  const k = periodOffset === 0 ? today() : periodDates()[0];
  if (!db.completions[k]) db.completions[k] = {};

  const wasToggleOff = !!db.completions[k][habitId];
  if (wasToggleOff) {
    const completion = db.completions[k][habitId];
    const habit = db.habits.find(h=>h.id===habitId);
    const rollbackXp = Math.max(0, Math.round(Number(completion?.xp || 0)));

    delete db.completions[k][habitId];
    if (Object.keys(db.completions[k]).length === 0) delete db.completions[k];
    db.stats.totalComp = Math.max(0, (db.stats.totalComp || 0) - 1);
    recalcHabitStreak(habitId);
    if (habit?.identityId) updateIdentityScore(habit.identityId);
    if (habit?.cat && typeof removeLifeAreaXP === 'function') removeLifeAreaXP(habit.cat);
    if (rollbackXp > 0) removeXP(rollbackXp, { dateKey: k });
    _invalidateHeatmapCache();
    saveDB();
    _invalidateDashboard();
    _patchHabitRows(habitId, false, k);
    _patchDashStats(k);
    _patchMomentumBar();
    EventBus.emit('habit:completed', { habitId, dateKey: k, completed: false, xpDelta: -rollbackXp, fromDash: !!fromDash });
    return;
  }

  const habit = db.habits.find(h=>h.id===habitId);
  if (!habit) return;

  const xpDetails = getHabitAwardedXP(habit, calcMomentum());
  const xp = xpDetails.totalXp;

  db.completions[k][habitId] = {
    time: new Date().toISOString(),
    xp,
    baseXp: xpDetails.baseXp,
    momentumMultiplier: xpDetails.momentumMultiplier,
  };
  db.stats.totalComp = (db.stats.totalComp||0) + 1;
  _invalidateHeatmapCache();

  if (habit.identityId) updateIdentityScore(habit.identityId);
  if (habit.cat) addLifeAreaXP(habit.cat);
  recalcHabitStreak(habitId);
  addXP(xp, { dateKey: k });

  checkHabitAch();
  const hr = new Date().getHours();
  if (hr < 8)   checkAch('early_bird');
  if (hr >= 23) checkAch('night_owl');

  const todayHabs = db.habits.filter(h => isHabitActiveOnDate(h, k));
  const doneAll   = todayHabs.every(h => db.completions[k]?.[h.id]);
  if (doneAll && todayHabs.length > 0) {
    checkAch('perfect_day');
    notify(I18n.t('dash_perfect_day'),'🏆','ach');
    if (Math.random() < .5) triggerEvent();
  } else if (Math.random() < .12) triggerEvent();

  checkQuestProgress();
  saveDB();

  _invalidateDashboard();
  _patchHabitRows(habitId, true, k);
  _patchDashStats(k);
  _patchMomentumBar();
  EventBus.emit('habit:completed', { habitId, dateKey: k, completed: true, xpDelta: xp, fromDash: !!fromDash });

  notify(
    xpDetails.momentumMultiplier > 1 ? HT('xp_gain_momentum', xp, xpDetails.momentumMultiplier) : HT('xp_gain', xp),
    habit.icon,
    'xp'
  );
}

// ─── MOMENTUM RENDER ─────────────────────────────────────────────────────

function renderMomentum() {
  const m = calcMomentum();
  const bar = document.getElementById('momentum-bar');
  if (!bar) return;
  if (bar.children.length === 0) {
    const frag = document.createDocumentFragment();
    for (let i=0; i<7; i++) {
      const n = document.createElement('div');
      n.className = 'mom-node' + (i<m?' lit':'');
      n.textContent = i<m ? '✓' : '';
      frag.appendChild(n);
    }
    bar.appendChild(frag);
  } else {
    _patchMomentumBar();
  }
  const msg = document.getElementById('momentum-msg');
  if (!msg) return;
  _renderMomentumMessage(msg, m);
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────

// P7 — Version counter: increment whenever habits or completions change.
// This replaces the older JSON.stringify dirty-check, which was O(n)
// and unstable across object key ordering.
let _dashHabitsVersion    = 0;
let _dashHabitsLastRender = -1;

/**
 * Invalidates the dashboard render cache.
 * Call this whenever db.habits or db.completions changes.
 */
function _invalidateDashboard() {
  _dashHabitsVersion++;
}

function _getDailyDashboardUI() {
  return globalThis.AxiomDailyUI || (typeof window !== 'undefined' ? window.AxiomDailyUI : null);
}

function _getHabitPanelsUI() {
  return globalThis.AxiomHabitPanelsUI || (typeof window !== 'undefined' ? window.AxiomHabitPanelsUI : null);
}

function _getHabitSurfaceUI() {
  return globalThis.AxiomHabitSurfaceUI || (typeof window !== 'undefined' ? window.AxiomHabitSurfaceUI : null);
}

function buildDashStatCards() {
  const helper = _getDailyDashboardUI();
  if (!helper?.buildDashStatCards) return;
  helper.buildDashStatCards({ statsEl: document.getElementById('dash-stats'), document, HT, db });
}

function hasTomorrowPlan() {
  const helper = _getDailyDashboardUI();
  if (!helper?.hasTomorrowPlan) return false;
  return helper.hasTomorrowPlan(db.tomorrow || {});
}

function renderDailyFocus(dateKey) {
  const helper = _getDailyDashboardUI();
  if (!helper?.renderDailyFocus) return;
  helper.renderDailyFocus({
    host: document.getElementById('dash-daily-focus'),
    document,
    db,
    dateKey,
    HT,
    isHabitActiveOnDate,
    Notification: typeof Notification === 'undefined' ? undefined : Notification,
    showSection,
    renderDashboard,
  });
}

function renderDailyOptionalCards(dateKey) {
  const helper = _getDailyDashboardUI();
  if (!helper?.renderDailyOptionalCards) return;
  helper.renderDailyOptionalCards({
    host: document.getElementById('dash-optional-cards'),
    document,
    db,
    dateKey,
    HT
  });
}

// P5 — Error boundary: renderDashboard is the most critical render path.
// If it throws, show a recovery message and log the error details
// instead of leaving the UI stuck on a blank screen.
function renderDashboard() {
  try {
    _renderDashboardInner();
  } catch (err) {
    console.error('[axiomOS] renderDashboard error:', err);
    const list = document.getElementById('dash-habits-list');
    if (list) {
      list.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'dim small';
      errEl.style.cssText = 'padding:1rem;text-align:center';
      errEl.textContent = `⚠ ${HT('dash_error')}`;
      const reloadBtn = document.createElement('span');
      reloadBtn.textContent = HT('dash_reload');
      reloadBtn.style.cssText = 'color:var(--accent);cursor:pointer;text-decoration:underline';
      reloadBtn.addEventListener('click', () => window.location.reload());
      errEl.appendChild(reloadBtn);
      list.appendChild(errEl);
    }
  }
}

function _renderDashboardInner() {
  const k = today();
  const quotePool = Array.isArray(db.quotes) && db.quotes.length ? db.quotes : buildQuotes();
  const q = pickSessionQuote(quotePool);
  if (q) {
    document.getElementById('dq-text').textContent = q.text;
    document.getElementById('dq-author').textContent = '— ' + q.author;
  }

  if (!q) {
    document.getElementById('dq-text').textContent = HT('dash_no_quote');
    document.getElementById('dq-author').textContent = '';
  }

  document.getElementById('dash-date-sub').textContent = formatDate(k);

  renderDailyFocus(k);
  buildDashStatCards();
  _patchDashStats(k);
  renderDailyOptionalCards(k);

  const allActive = db.habits.filter(h=>isHabitActiveOnDate(h,k));
  const list      = document.getElementById('dash-habits-list');

  // P7: compare the version counter instead of recalculating a JSON hash.
  if (_dashHabitsVersion !== _dashHabitsLastRender || list.children.length === 0) {
    _dashHabitsLastRender = _dashHabitsVersion;
    list.innerHTML = '';
    if (allActive.length === 0) {
      const emptyMsg  = document.createElement('div');
      emptyMsg.className = 'dim small';
      const emptyLink = document.createElement('span');
      emptyLink.textContent = HT('dash_create_one');
      emptyLink.style.cssText = 'color:var(--accent);cursor:pointer';
      emptyLink.addEventListener('click', () => openModal('m-add-habit'));
      emptyMsg.append(HT('dash_no_habits_prefix'), emptyLink);
      list.appendChild(emptyMsg);
    } else {
      const frag = document.createDocumentFragment();
      allActive.slice(0,6).forEach(h => {
        frag.appendChild(buildHabitRow(h, !!db.completions[k]?.[h.id], k, true));
      });
      list.appendChild(frag);
      _initHabitDnD(list);
    }
  }

  renderQuests(k);
  renderMomentum();
  renderAlignment(k);
  renderInsights();
  renderHeatmap('dash-heatmap', 16);
  _renderDashTmrPreview();
  updateSidebar();
}

// ─── BUILD HABIT ROW ─────────────────────────────────────────────────────

function buildHabitRow(h, done, k, fromDash=false) {
  const helper = _getHabitPanelsUI();
  if (!helper?.buildHabitRow) {
    const fallback = document.createElement('div');
    fallback.textContent = h?.name || '';
    return fallback;
  }
  return helper.buildHabitRow({
    document,
    HT,
    colors: COLORS,
    categoryIcons: CAT_ICONS,
    getHabitBaseXP,
    getCategoryLabel,
    completeHabit,
    attachInlineEdit: _attachInlineEdit,
  }, h, done, k, fromDash);
}

// ─── RENDER HABITS (LAZY TABS) ───────────────────────────────────────────

let _activeHabTab = 'today';
let _habTabDirty  = { today:true, all:true, stacking:true, cat:true };
let _habitSurfaceReady = false;

function _markHabTabsDirty() {
  _habTabDirty.today    = true;
  _habTabDirty.all      = true;
  _habTabDirty.stacking = true;
  _habTabDirty.cat      = true;
  _invalidateDashboard(); // Any habit change also invalidates dashboard widgets.
}

function _ensureHabitSurfaceReady() {
  const helper = _getHabitSurfaceUI();
  if (!helper?.initHabitTabs || _habitSurfaceReady) return;
  helper.initHabitTabs({
    document,
    getActiveTab() {
      return _activeHabTab;
    },
    onSelectTab(tabName) {
      _activeHabTab = tabName;
      _renderHabTab(tabName);
    }
  });
  _habitSurfaceReady = true;
}

function renderHabits() {
  try {
    const k = today();
    _ensureHabitSurfaceReady();
    _markHabTabsDirty();
    _renderHabTab(_activeHabTab, k);
  } catch (err) {
    console.error('[axiomOS] renderHabits error:', err);
  }
}

// HABIT_CHUNK_SIZE is centralised in APP_CONSTANTS.UI — do not redeclare locally.
const HABIT_CHUNK = APP_CONSTANTS.UI.HABIT_CHUNK_SIZE;

function _renderHabitsChunked(container, habits, k, showActions) {
  const helper = _getHabitPanelsUI();
  if (!helper?.renderHabitsChunked) {
    _renderHabitsChunkedFallback(container, habits, k, showActions);
    return;
  }
  helper.renderHabitsChunked({
    document,
    db,
    HT,
    colors: COLORS,
    categoryIcons: CAT_ICONS,
    chunkSize: HABIT_CHUNK,
    openModal: typeof openModal === 'function' ? openModal : (() => {}),
    editHabit: typeof editHabit === 'function' ? editHabit : (() => {}),
    deleteHabit: typeof deleteHabit === 'function' ? deleteHabit : (() => {}),
    completeHabit: typeof completeHabit === 'function' ? completeHabit : (() => {}),
    getHabitBaseXP,
    getCategoryLabel,
    attachInlineEdit: _attachInlineEdit,
    requestAnimationFrame: typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null,
    buildHabitRow,
  }, {
    container,
    habits,
    dateKey: k,
    showActions,
  });
}

function _renderHabitsChunkedFallback(container, habits, k, showActions) {
  if (!container) return;
  container.innerHTML = '';

  if (!Array.isArray(habits) || habits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.append(`${HT('habits_empty')} `);

    const link = document.createElement('span');
    link.textContent = HT('habits_empty_cta');
    link.style.cssText = 'color:var(--accent);cursor:pointer';
    link.addEventListener('click', () => openModal('m-add-habit'));
    empty.appendChild(link);
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  habits.forEach((habit) => {
    const done = !!db.completions?.[k]?.[habit.id];
    const row = buildHabitRow(habit, done, k, false);

    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'habit-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-xs btn-ghost';
      editBtn.setAttribute('aria-label', `${HT('btn_edit')} ${habit.name}`);
      editBtn.textContent = '✏';
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        editHabit(habit.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-xs btn-danger';
      deleteBtn.setAttribute('aria-label', `${HT('btn_delete')} ${habit.name}`);
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteHabit(habit.id);
      });

      actions.append(editBtn, deleteBtn);
      row.appendChild(actions);
    }

    fragment.appendChild(row);
  });
  container.appendChild(fragment);
}

function _renderHabTab(tab, k) {
  const todayKey = today();
  const viewKey = tab === 'today' || tab === 'all'
    ? todayKey
    : (k || periodDates()[0] || todayKey);
  if (!_habTabDirty[tab]) return;
  _habTabDirty[tab] = false;

  if (tab === 'today') {
    const todayEl   = document.getElementById('hab-today');
    const todayHabs = db.habits.filter(h => isHabitActiveOnDate(h, viewKey));
    _renderHabitsChunked(todayEl, todayHabs, viewKey, true);
    _initHabitDnD(todayEl);
  }
  if (tab === 'all') {
    const allEl = document.getElementById('hab-all');
    _renderHabitsChunked(allEl, db.habits, viewKey, true);
    _initHabitDnD(allEl);
  }
  if (tab === 'stacking') {
    renderHabitStacking();
  }
  if (tab === 'cat') {
    const helper = _getHabitSurfaceUI();
    if (!helper?.renderCategoryTab) return;
    helper.renderCategoryTab({
      document,
      db,
      categoryIcons: CAT_ICONS,
      getCategoryLabel,
      buildHabitRow,
      host: document.getElementById('hab-cat'),
      dateKey: viewKey,
    });
  }
}

// ─── HABIT STACKING ───────────────────────────────────────────

function renderHabitStacking() {
  const helper = _getHabitSurfaceUI();
  if (!helper?.renderHabitStacking) return;
  helper.renderHabitStacking({
    document,
    db,
    HT,
    host: document.getElementById('stack-visual'),
    renderSmallMessage: _renderSmallMessage,
  });
}

// ─── ALIGNMENT INDICATOR ──────────────────────────────────────

function renderAlignment(k) {
  const helper = _getHabitSurfaceUI();
  if (!helper?.renderAlignment) return;
  helper.renderAlignment({
    document,
    db,
    HT,
    host: document.getElementById('align-indicator'),
    renderSmallMessage: _renderSmallMessage,
    calcIdentityScore,
    getLanguage() {
      return (typeof I18n !== 'undefined' && I18n.lang) || db.settings?.lang || 'en';
    }
  }, k);
}

// ─── DAILY QUESTS ─────────────────────────────────────────────

function generateDailyQuests() {
  const k = today();
  const lang = db.settings.lang || 'en';
  const existingQuests = db.quests?.[k];
  if (existingQuests?.length > 0) {
    const allTaggedForCurrentLanguage = existingQuests.every((quest) => quest && quest.lang === lang);
    if (allTaggedForCurrentLanguage) return;
  }
  if (!db.quests) db.quests = {};
  const quests = [];
  if (db.habits.length > 0) {
    quests.push({ id:'q1', title:HT('quest_habits_title'), desc:HT('quest_habits_desc'), done:false, xp:75, type:'completions', target:3, lang });
  }
  quests.push({ id:'q2', title:HT('quest_deepwork_title'), desc:HT('quest_deepwork_desc'), done:false, xp:100, type:'deepwork', target:30, lang });
  quests.push({ id:'q3', title:HT('quest_reflection_title'), desc:HT('quest_reflection_desc'), done:false, xp:50, type:'reflection', target:1, lang });
  if (calcStreak() >= 3) {
    quests.push({ id:'q4', title:HT('quest_streak_title'), desc:HT('quest_streak_desc', calcStreak()), done:false, xp:60, type:'streak', target:calcStreak(), lang });
  }
  db.quests[k] = quests;
  saveDB();
}

function checkQuestProgress() {
  const k = today();
  const quests = db.quests?.[k]||[];
  quests.forEach(q => {
    if (q.done) return;
    if (q.type === 'completions') {
      const cnt = Object.keys(db.completions[k]||{}).length;
      if (cnt >= q.target) { q.done=true; addXP(q.xp); notify(HT('quest_done', q.title, q.xp),'⚔','ach'); }
    }
  });
  if (db.quests) db.quests[k] = quests;
  saveDB();
}

function renderQuests(k) {
  generateDailyQuests();
  const helper = _getHabitPanelsUI();
  if (!helper?.renderQuests) return;
  helper.renderQuests({
    document,
    HT,
    getQuests(dateKey) {
      return db.quests?.[dateKey] || [];
    },
  }, k);
}

function completeQuest(k, qid) {
  const helper = _getHabitPanelsUI();
  if (!helper?.completeQuest) return;
  helper.completeQuest({
    document,
    HT,
    saveDB,
    addXP,
    notify,
    updateSidebar,
    patchDashStats: _patchDashStats,
    getQuests(dateKey) {
      return db.quests?.[dateKey] || [];
    },
  }, k, qid);
}

function scrollToQuests() {
  const focusHost = document.getElementById('dash-daily-focus');
  const questsHost = document.getElementById('daily-quests-list');
  const target = focusHost || questsHost;
  if (!target || typeof target.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ─── HEATMAP ─────────────────────────────────────────────────────────────

function renderHeatmap(id, weeks=16) {
  const helper = _getHabitPanelsUI();
  if (!helper?.renderHeatmap) return;
  helper.renderHeatmap({ document, HT, db, today, toKey }, id, weeks);
}

function _invalidateHeatmapCache() {
  const helper = _getHabitPanelsUI();
  if (!helper?.invalidateHeatmapCache) return;
  helper.invalidateHeatmapCache();
}

// ─── TOMORROW PREVIEW ─────────────────────────────────────────

function _renderDashTmrPreview() {
  const helper = _getDailyDashboardUI();
  if (!helper?.renderTomorrowPreview) return;
  helper.renderTomorrowPreview({
    host: document.getElementById('dash-tmr-preview-body'),
    document,
    HT,
    db,
    getTomorrowData: typeof _tmrData === 'function' ? _tmrData : null,
    showSection
  });
}

function _initHabitDnD(container) {
  const helper = _getHabitSurfaceUI();
  if (!helper?.initHabitDnD) return;
  helper.initHabitDnD({
    onReorder(sourceHabitId, targetHabitId) {
      const sourceIndex = db.habits.findIndex((habit) => habit?.id === sourceHabitId);
      const targetIndex = db.habits.findIndex((habit) => habit?.id === targetHabitId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
      const moved = db.habits.splice(sourceIndex, 1)[0];
      if (!moved) return;
      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      db.habits.splice(adjustedTargetIndex, 0, moved);
      _markHabTabsDirty();
      saveDB();
      EventBus.emit('habits:changed', { action: 'reordered', habitId: sourceHabitId, targetHabitId });
    }
  }, container);
}

// ─── INLINE EDIT HABIT NAME ───────────────────────────────────

function _attachInlineEdit(row, habit) {
  const nameEl = row.querySelector('.habit-name');
  if (!nameEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'habit-name-wrap';
  const editIcon = document.createElement('span');
  editIcon.innerHTML = '✎';
  editIcon.style.cssText = 'font-size:11px;color:var(--text3);opacity:0;transition:opacity .15s;cursor:pointer;flex-shrink:0;';
  editIcon.title = HT('habit_rename_hint');
  nameEl.parentNode.insertBefore(wrap, nameEl);
  wrap.appendChild(nameEl);
  wrap.appendChild(editIcon);

  row.addEventListener('mouseenter', () => editIcon.style.opacity = '1');
  row.addEventListener('mouseleave', () => editIcon.style.opacity = '0');

  function startEdit() {
    const inp = document.createElement('input');
    inp.className = 'habit-name-input';
    inp.value = habit.name;
    wrap.replaceChild(inp, nameEl);
    editIcon.style.display = 'none';
    inp.focus(); inp.select();
    function commit() {
      const val = inp.value.trim();
      if (val && val !== habit.name) {
        const nameResult = InputValidator.validateName(val, HT('habit_name'));
        if (!nameResult.valid) {
          notify(nameResult.error, '⚠', 'info');
          inp.focus();
          inp.select();
          return;
        }
        habit.name = nameResult.value;
        saveDB();
        notify(HT('habit_renamed', habit.name),'✏','info');
        _invalidateDashboard();
        EventBus.emit('habits:changed', { habitId: habit.id, action: 'renamed' });
      }
      nameEl.textContent = habit.name;
      wrap.replaceChild(nameEl, inp);
      editIcon.style.display = '';
    }
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key==='Enter') inp.blur();
      if (e.key==='Escape') { inp.value=habit.name; inp.blur(); }
    });
  }
  editIcon.addEventListener('click', e => { e.stopPropagation(); startEdit(); });
  nameEl.addEventListener('dblclick', e => { e.stopPropagation(); startEdit(); });
}

// ─── EVENT DELEGATION: QUEST BUTTONS ──────────────────────────
// Quest completion buttons use data-quest-date / data-quest-id instead
// of embedded DOM handlers. A single delegated listener handles all clicks.
// This is initialized once when the script loads. The list container
// already exists in the HTML before feature scripts run.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-quest-date][data-quest-id]');
  if (btn) completeQuest(btn.dataset.questDate, btn.dataset.questId);
});

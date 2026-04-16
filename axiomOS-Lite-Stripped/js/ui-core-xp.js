// ================================================================
// ui-core-xp.js - XP, levels, sidebar, streak freeze, insights
// ================================================================

function XT(key, ...args) {
  return AxiomText.t(key, ...args);
}

function XPDateLocale() {
  return AxiomText.locale();
}

function currentXpLanguage() {
  return AxiomText.lang();
}

const XP_BASE_THRESHOLD = 1000;
const XP_ATTR_IDS = ['strength', 'focus', 'intelligence', 'discipline', 'vitality', 'presence'];

function _ensureAttributes() {
  if (!db.attributes) {
    db.attributes = {
      strength: 10,
      focus: 10,
      intelligence: 10,
      discipline: 10,
      vitality: 10,
      presence: 10,
      points: 0,
    };
  }

  XP_ATTR_IDS.forEach((id) => {
    if (typeof db.attributes[id] !== 'number' || Number.isNaN(db.attributes[id])) {
      db.attributes[id] = 10;
    }
  });

  if (typeof db.attributes.points !== 'number' || Number.isNaN(db.attributes.points)) {
    db.attributes.points = 0;
  }

  return db.attributes;
}

function _spentAttributePoints() {
  const attrs = _ensureAttributes();
  return XP_ATTR_IDS.reduce((sum, id) => sum + Math.max(0, (attrs[id] || 10) - 10), 0);
}

function _syncXpStateFromTotal() {
  const totalXp = Math.max(0, Math.round(Number(db.user.totalXp || 0)));
  db.user.totalXp = totalXp;
  db.stats.totalXp = totalXp;

  let level = 1;
  let xpNext = XP_BASE_THRESHOLD;
  let remaining = totalXp;
  while (remaining >= xpNext) {
    remaining -= xpNext;
    level += 1;
    xpNext = Math.round(xpNext * APP_CONSTANTS.LEVEL.XP_MULTIPLIER);
  }

  db.user.level = level;
  db.user.xp = remaining;
  db.user.xpNext = xpNext;

  const attrs = _ensureAttributes();
  const earnedPoints = (level - 1) * APP_CONSTANTS.LEVEL.ATTR_POINTS_PER_LEVEL;
  attrs.points = Math.max(0, earnedPoints - _spentAttributePoints());

  return { level, xp: remaining, xpNext, totalXp };
}

function _updateXpLog(dateKey, delta) {
  const key = dateKey || today();
  if (!db.xpLog) db.xpLog = {};

  const nextValue = Math.max(0, Math.round(Number(db.xpLog[key] || 0) + delta));
  if (nextValue > 0) db.xpLog[key] = nextValue;
  else delete db.xpLog[key];
}

function _applyXpDelta(amount, direction) {
  const normalized = Math.max(0, Math.round(Number(amount) || 0));
  const prevLevel = db.user.level || 1;
  const prevTotal = Math.max(0, Math.round(Number(db.user.totalXp || 0)));

  db.user.totalXp = Math.max(0, prevTotal + (normalized * direction));
  const nextState = _syncXpStateFromTotal();

  return {
    amount: normalized,
    levelDelta: nextState.level - prevLevel,
    leveled: nextState.level > prevLevel,
    total: nextState.totalXp,
  };
}

function addXP(amount, options = {}) {
  const result = _applyXpDelta(amount, 1);
  if (result.amount === 0) return result;

  _updateXpLog(options.dateKey || today(), result.amount);

  if (result.levelDelta > 0) {
    for (let lv = db.user.level - result.levelDelta + 1; lv <= db.user.level; lv++) {
      notify(XT('level_up', lv), '⚡', 'ach');
    }
  }

  checkXPAch();
  EventBus.emit('xp:gained', { amount: result.amount, leveled: result.leveled, total: result.total });
  return result;
}

function removeXP(amount, options = {}) {
  const result = _applyXpDelta(amount, -1);
  if (result.amount === 0) return result;

  _updateXpLog(options.dateKey || today(), -result.amount);
  EventBus.emit('xp:gained', { amount: -result.amount, leveled: false, total: result.total, decreased: true });
  return result;
}

function updateSidebar() {
  const u = db.user;
  const fallbackName = XT('user_default_name');
  document.getElementById('sb-name').textContent = u.name || fallbackName;
  document.getElementById('sb-av').textContent = (u.name || fallbackName || 'U')[0].toUpperCase();
  document.getElementById('sb-lv').textContent = u.level;
  document.getElementById('sb-xp-txt').textContent = u.xp + ' / ' + u.xpNext + ' XP';

  const pct = Math.min(100, (u.xp / u.xpNext) * 100);
  document.getElementById('sb-xp-fill').style.width = pct + '%';

  const streak = calcStreak();
  document.getElementById('sb-streak').textContent = streak;

  const phase = u.level < 5
    ? XT('sb_beginner')
    : u.level < 15
      ? XT('sb_builder')
      : u.level < 30
        ? XT('sb_master')
        : XT('sb_elite');
  document.getElementById('sb-phase').textContent = phase;

  const key = today();
  const rem = db.habits.filter((h) => !isDoneToday(h.id, key)).length;
  const bdg = document.getElementById('bdg-hab');
  bdg.textContent = rem;
  bdg.classList.toggle('hidden', rem === 0);

  const newAch = db.achievements.filter((a) => isAchievementUnlocked(a) && !a.seen).length;
  const abdg = document.getElementById('bdg-ach');
  abdg.textContent = newAch;
  abdg.classList.toggle('hidden', newAch === 0);
}

let _streakCache = { value: -1, key: '' };

function _streakCacheKey() {
  return today() + '|' + (db.stats.totalComp || 0);
}

function calcStreak() {
  const ckey = _streakCacheKey();
  if (_streakCache.key === ckey) return _streakCache.value;

  let s = 0;
  let d = new Date();
  while (true) {
    const k = toKey(d);
    const done = Object.keys(db.completions[k] || {}).length;
    if (done > 0 || db.completions[k + '_freeze']) {
      s++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  if (s > (db.stats.bestStreak || 0)) db.stats.bestStreak = s;
  _streakCache = { value: s, key: ckey };
  return s;
}

function _invalidateStreakCache() {
  _streakCache.key = '';
}

function useStreakFreeze() {
  if ((db.user.freezes || 0) <= 0) {
    notify(XT('streak_no_freeze'), '❌', 'info');
    return;
  }

  db.user.freezes--;
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  db.completions[toKey(yest) + '_freeze'] = true;
  saveDB();
  notify(XT('streak_freeze_used'), '❄', 'info');
  updateSidebar();
}

let _insightsCache = { result: null, key: '' };

function _insightsCacheKey() {
  return (db.stats.totalComp || 0) + '|' + today() + '|' + db.identities.length + '|' + currentXpLanguage();
}

function renderInsights() {
  const el = document.getElementById('insights-list');
  if (!el) return;

  const insights = generateInsights();
  if (el.children.length === insights.length && el.dataset.insHash === _insightsCacheKey()) return;

  el.dataset.insHash = _insightsCacheKey();
  const frag = document.createDocumentFragment();
  insights.forEach((ins) => {
    const div = document.createElement('div');
    div.className = 'insight-chip';
    div.innerHTML = `<div class="insight-ic">${ins.ic}</div><div class="insight-txt">${ins.text}</div>`;
    frag.appendChild(div);
  });
  el.innerHTML = '';
  el.appendChild(frag);
}

function generateInsights() {
  const ckey = _insightsCacheKey();
  if (_insightsCache.key === ckey && _insightsCache.result) return _insightsCache.result;

  const insights = [];
  const streak = calcStreak();

  if (streak > 0) {
    insights.push({ ic: '🔥', text: XT('insight_streak', streak) });
  }

  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(db.completions).forEach(([dt, comps]) => {
    const d = new Date(dt);
    if (!isNaN(d)) {
      const idx = (d.getDay() + 6) % 7;
      dayTotals[idx] += Object.keys(comps).length;
    }
  });

  const maxDayTotal = Math.max(...dayTotals);
  if (maxDayTotal > 0) {
    const bestDay = dayTotals.indexOf(maxDayTotal);
    const dayName = new Intl.DateTimeFormat(XPDateLocale(), { weekday: 'long' })
      .format(new Date(Date.UTC(2024, 0, 1 + bestDay)));
    insights.push({ ic: '📈', text: XT('insight_best_day', dayName) });
  }

  const dwSessions = db.deepWork.sessions?.length || 0;
  if (dwSessions > 3) {
    const boost = Math.min(25, 10 + dwSessions * 2);
    insights.push({ ic: '🔗', text: XT('insight_deepwork', boost) });
  }

  db.identities.forEach((identity) => {
    const score = calcIdentityScore(identity.id);
    if (score < 30) {
      insights.push({ ic: '⚠', text: XT('insight_identity_low', escapeHtml(identity.name), score) });
    }
  });

  const totalDays = Object.keys(db.completions).length;
  if (totalDays > 7 && db.habits.length > 0) {
    const avgComp = Object.values(db.completions)
      .reduce((sum, day) => sum + Object.keys(day).length, 0) / (totalDays * db.habits.length) * 100;
    insights.push({ ic: '📊', text: XT('insight_avg_completion', avgComp) });
  }

  if (insights.length === 0) {
    insights.push({ ic: '💡', text: XT('insight_empty') });
  }

  const result = insights.slice(0, 4);
  _insightsCache = { result, key: ckey };
  return result;
}

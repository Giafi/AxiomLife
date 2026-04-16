// ================================================================
// rpg.js - Character sheet, life areas, and attribute rendering
//
// Depends on:
//   constants.js (APP_CONSTANTS)
//   db.js (db, saveDB, today, toKey)
//   toast.js (notify)
//   ui-core-xp.js (calcStreak)
//   ui-core-settings.js (L / I18n)
// ================================================================

function RT(key, ...args) {
  return AxiomText.t(key, ...args);
}

function currentRpgLanguage() {
  return AxiomText.lang();
}

function emitAttributesActivity(action, itemName = '', detail = '', icon = 'âš¡') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', {
    moduleId: 'attributes',
    section: 'attributes',
    action,
    itemName,
    detail,
    icon,
  });
}

function getAvatarTier(level) {
  if (level < 10) return { emoji: 'ðŸ¾', title: L('rpgClass', level), color: 'var(--text2)' };
  if (level < 25) return { emoji: 'ðŸ¦', title: L('rpgClass', level), color: 'var(--accent2)' };
  if (level < 50) return { emoji: 'ðŸ¦Š', title: L('rpgClass', level), color: 'var(--gold)' };
  if (level < 75) return { emoji: 'ðŸ»', title: L('rpgClass', level), color: 'var(--accent)' };
  return { emoji: 'ðŸ‰', title: L('rpgClass', level), color: 'var(--accent3)' };
}

const LA_DEF = [
  { id: 'corpo', labelKey: 'la_corpo', icon: 'ðŸ’ª', col: 'var(--accent3)', cats: ['salute', 'fitness'] },
  { id: 'mente', labelKey: 'la_mente', icon: 'ðŸ§ ', col: 'var(--accent2)', cats: ['mente', 'studio'] },
  { id: 'spirito', labelKey: 'la_spirito', icon: 'â¤ï¸', col: 'var(--red)', cats: ['creativo', 'altro'] },
  { id: 'vocazione', labelKey: 'la_vocazione', icon: 'ðŸ’¼', col: 'var(--purple)', cats: ['produttivitÃ '] },
  { id: 'finanze', labelKey: 'la_finanze', icon: 'ðŸ’°', col: 'var(--gold)', cats: [] },
  { id: 'sociale', labelKey: 'la_sociale', icon: 'ðŸ‘¥', col: 'var(--accent)', cats: ['sociale'] }
];

const ATTR_DEF = [
  { id: 'strength', icon: 'ðŸ’ª', labelKey: 'attr_strength' },
  { id: 'focus', icon: 'ðŸŽ¯', labelKey: 'attr_focus' },
  { id: 'intelligence', icon: 'ðŸ§ ', labelKey: 'attr_intelligence' },
  { id: 'discipline', icon: 'ðŸ”’', labelKey: 'attr_discipline' },
  { id: 'vitality', icon: 'âš¡', labelKey: 'attr_vitality' },
  { id: 'presence', icon: 'ðŸŒŸ', labelKey: 'attr_presence' }
];

const ATTRIBUTE_BASELINE = 10;
const LA_MAP = {};
LA_DEF.forEach((area) => area.cats.forEach((cat) => { LA_MAP[cat] = area.id; }));

const LIFE_AREA_BASE_THRESHOLD = 300;
const LIFE_AREA_XP_MULTIPLIER = 1.6;

function _ensureLifeArea(areaId) {
  if (!db.lifeAreas) db.lifeAreas = {};
  if (!db.lifeAreas[areaId]) db.lifeAreas[areaId] = { xp: 0, level: 1, xpNext: LIFE_AREA_BASE_THRESHOLD };
  return db.lifeAreas[areaId];
}

function _ensureAttributes() {
  if (!db.attributes) {
    db.attributes = {
      strength: ATTRIBUTE_BASELINE,
      focus: ATTRIBUTE_BASELINE,
      intelligence: ATTRIBUTE_BASELINE,
      discipline: ATTRIBUTE_BASELINE,
      vitality: ATTRIBUTE_BASELINE,
      presence: ATTRIBUTE_BASELINE,
      points: 0,
    };
  }
  return db.attributes;
}

function _getLifeAreaTotalXp(area) {
  let total = Math.max(0, Math.round(Number(area?.xp || 0)));
  let threshold = LIFE_AREA_BASE_THRESHOLD;
  const level = Math.max(1, Math.round(Number(area?.level || 1)));
  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    total += threshold;
    threshold = Math.round(threshold * LIFE_AREA_XP_MULTIPLIER);
  }
  return total;
}

function _syncLifeAreaFromTotal(areaId, totalXp) {
  const area = _ensureLifeArea(areaId);
  let level = 1;
  let xpNext = LIFE_AREA_BASE_THRESHOLD;
  let remaining = Math.max(0, Math.round(Number(totalXp || 0)));
  while (remaining >= xpNext) {
    remaining -= xpNext;
    level += 1;
    xpNext = Math.round(xpNext * LIFE_AREA_XP_MULTIPLIER);
  }
  area.level = level;
  area.xp = remaining;
  area.xpNext = xpNext;
  return area;
}

function addLifeAreaXP(cat, amount = 20) {
  const areaId = LA_MAP[cat];
  if (!areaId) return;

  const area = _ensureLifeArea(areaId);
  const prevLevel = area.level || 1;
  const delta = Math.max(0, Math.round(Number(amount || 0)));
  const totalXp = _getLifeAreaTotalXp(area) + delta;
  const nextArea = _syncLifeAreaFromTotal(areaId, totalXp);

  if ((nextArea.level || 1) > prevLevel) {
    const areaMeta = LA_DEF.find((item) => item.id === areaId);
    const areaName = areaMeta ? RT(areaMeta.labelKey) : areaId;
    for (let level = prevLevel + 1; level <= nextArea.level; level += 1) {
      notify(`${areaMeta?.icon || 'ðŸŒ'} ${areaName} - Lv.${level}!`, 'ðŸŒ', 'ach');
    }
  }

  if (typeof checkCharacterAchievements === 'function') checkCharacterAchievements();
}

function removeLifeAreaXP(cat, amount = 20) {
  const areaId = LA_MAP[cat];
  if (!areaId) return;

  const area = _ensureLifeArea(areaId);
  const delta = Math.max(0, Math.round(Number(amount || 0)));
  const totalXp = Math.max(0, _getLifeAreaTotalXp(area) - delta);
  _syncLifeAreaFromTotal(areaId, totalXp);
}

function _getLifeAreaEntries() {
  if (!db.lifeAreas) db.lifeAreas = {};
  return LA_DEF.map((areaMeta) => {
    const area = db.lifeAreas[areaMeta.id] || { xp: 0, level: 1, xpNext: LIFE_AREA_BASE_THRESHOLD };
    let recentComp = 0;

    for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      const key = toKey(date);
      const dayComps = db.completions[key] || {};
      db.habits.filter((habit) => areaMeta.cats.includes(habit.cat)).forEach((habit) => {
        if (dayComps[habit.id]) recentComp += 1;
      });
    }

    return {
      meta: areaMeta,
      area,
      areaName: RT(areaMeta.labelKey),
      linkedHabits: db.habits.filter((habit) => areaMeta.cats.includes(habit.cat)).length,
      recentComp,
      percent: Math.round((area.xp / area.xpNext) * 100),
      xpToNext: Math.max(0, (area.xpNext || LIFE_AREA_BASE_THRESHOLD) - (area.xp || 0)),
    };
  });
}

function _buildRpgBadge(achievement) {
  const badge = document.createElement('span');
  badge.className = 'rpg-badge';
  badge.title = achievement.d || '';
  badge.textContent = `${achievement.ic || 'ðŸ†'} ${achievement.n || ''}`;
  return badge;
}

function _buildRpgProfileCard(labelText, valueText, metaText, color = '') {
  const card = document.createElement('div');
  card.className = 'rpg-profile-card';

  const label = document.createElement('div');
  label.className = 'rpg-profile-label';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.className = 'rpg-profile-value';
  value.textContent = valueText;
  if (color) value.style.color = color;

  const meta = document.createElement('div');
  meta.className = 'rpg-profile-meta';
  meta.textContent = metaText;

  card.append(label, value, meta);
  return card;
}

function _renderCharacterProfileGrid(entries) {
  const host = document.getElementById('rpg-profile-grid');
  if (!host) return;

  const attrs = _ensureAttributes();
  const topAttribute = ATTR_DEF
    .map((def) => ({ def, value: attrs[def.id] || ATTRIBUTE_BASELINE }))
    .sort((left, right) => right.value - left.value)[0];

  const dominantArea = entries.slice().sort((left, right) => {
    if (right.area.level !== left.area.level) return right.area.level - left.area.level;
    return right.recentComp - left.recentComp;
  })[0];

  const growthArea = entries.slice().sort((left, right) => {
    if (left.area.level !== right.area.level) return left.area.level - right.area.level;
    return left.area.xp - right.area.xp;
  })[0];

  const fitnessSummary = typeof getFitnessSummary === 'function' ? getFitnessSummary() : null;
  const rhythmValue = fitnessSummary
    ? `${fitnessSummary.workoutsThisWeek}/${fitnessSummary.workoutGoal} ${RT('rpg_profile_workouts')}`
    : RT('rpg_profile_no_fitness');
  const rhythmMeta = fitnessSummary
    ? `${fitnessSummary.hydrationDays}/7 ${RT('rpg_profile_hydration_days')} Â· ${fitnessSummary.avgSleep === null ? RT('rpg_profile_sleep_missing') : RT('rpg_profile_sleep_avg', fitnessSummary.avgSleep.toFixed(1))}`
    : RT('rpg_profile_sleep_missing');

  const cards = [
    _buildRpgProfileCard(
      RT('rpg_profile_trait'),
      topAttribute ? RT(topAttribute.def.labelKey) : RT('attr_focus'),
      RT('rpg_profile_points', topAttribute?.value || ATTRIBUTE_BASELINE),
      'var(--accent)'
    ),
    _buildRpgProfileCard(
      RT('rpg_profile_domain'),
      dominantArea?.areaName || RT('la_corpo'),
      RT('rpg_profile_domain_meta', dominantArea?.area.level || 1, dominantArea?.recentComp || 0),
      dominantArea?.meta.col || 'var(--accent2)'
    ),
    _buildRpgProfileCard(
      RT('rpg_profile_growth'),
      growthArea?.areaName || RT('la_mente'),
      RT('rpg_profile_growth_meta', growthArea?.xpToNext || 0),
      growthArea?.meta.col || 'var(--accent3)'
    ),
    _buildRpgProfileCard(
      RT('rpg_profile_rhythm'),
      rhythmValue,
      rhythmMeta,
      'var(--gold)'
    ),
  ];

  host.innerHTML = '';
  const fragment = document.createDocumentFragment();
  cards.forEach((card) => fragment.appendChild(card));
  host.appendChild(fragment);
}

let _laHash = '';

function renderLifeAreas() {
  if (!db.lifeAreas) db.lifeAreas = {};

  const tier = getAvatarTier(db.user.level);
  const avatarEl = document.getElementById('rpg-avatar-emoji');
  const levelBadge = document.getElementById('rpg-level-badge');
  const charName = document.getElementById('rpg-char-name');
  const classLabel = document.getElementById('rpg-class-label');
  const xpFill = document.getElementById('rpg-xp-fill');
  const xpCur = document.getElementById('rpg-xp-cur');
  const xpNext = document.getElementById('rpg-xp-next');

  if (avatarEl) {
    avatarEl.textContent = tier.emoji;
    avatarEl.style.filter = `drop-shadow(0 0 8px ${tier.color})`;
  }
  if (levelBadge) {
    levelBadge.textContent = `Lv.${db.user.level}`;
    levelBadge.style.background = `linear-gradient(135deg,${tier.color},var(--accent2))`;
  }
  if (charName) charName.textContent = db.user.name || RT('rpg_default_name');
  if (classLabel) {
    classLabel.textContent = tier.title;
    classLabel.style.color = tier.color;
  }

  const pct = db.user.xpNext > 0 ? Math.min(100, (db.user.xp / db.user.xpNext) * 100) : 0;
  if (xpFill) xpFill.style.width = `${pct}%`;
  if (xpCur) xpCur.textContent = `${db.user.xp || 0} XP`;
  if (xpNext) xpNext.textContent = `/ ${db.user.xpNext} XP`;

  const streak = calcStreak();
  const setRpgStat = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setRpgStat('rpg-streak', streak);
  setRpgStat('rpg-streak-sub', RT(streak === 1 ? 'label_day' : 'label_days'));
  setRpgStat('rpg-total-xp', (db.stats.totalXp || 0).toLocaleString());
  setRpgStat('rpg-habits-done', db.stats.totalComp || 0);
  setRpgStat('rpg-best-streak', db.stats.bestStreak || 0);
  setRpgStat('rpg-dw-hours', `${Math.round((db.stats.dwTotal || 0) / 60)}h`);
  setRpgStat('rpg-habit-count', db.habits.length);

  const badgesRow = document.getElementById('rpg-badges-row');
  if (badgesRow) {
    badgesRow.innerHTML = '';
    const unlocked = (db.achievements || []).filter(isAchievementUnlocked).slice(0, 8);
    if (unlocked.length) {
      const fragment = document.createDocumentFragment();
      unlocked.forEach((achievement) => fragment.appendChild(_buildRpgBadge(achievement)));
      badgesRow.appendChild(fragment);
    } else {
      const hint = document.createElement('span');
      hint.className = 'dim small';
      hint.style.fontSize = '10px';
      hint.textContent = RT('rpg_badges_hint');
      badgesRow.appendChild(hint);
    }
  }

  const titleEl = document.getElementById('la-title-txt');
  const subEl = document.getElementById('la-sub-txt');
  if (titleEl) titleEl.textContent = L('laTitle');
  if (subEl) subEl.textContent = L('laSub');

  const grid = document.getElementById('la-grid');
  if (!grid) return;

  const entries = _getLifeAreaEntries();
  _renderCharacterProfileGrid(entries);

  const newHash = entries.map((entry) => `${entry.area.level}:${entry.area.xp}`).join('|')
    + `|${db.user.level}|${currentRpgLanguage()}`;
  if (newHash === _laHash && grid.children.length > 0) return;
  _laHash = newHash;

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'area-card';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '10px';
    header.style.marginBottom = '10px';

    const icon = document.createElement('span');
    icon.style.fontSize = '24px';
    icon.textContent = entry.meta.icon;

    const left = document.createElement('div');
    const areaName = document.createElement('div');
    areaName.style.fontSize = '11px';
    areaName.style.fontWeight = '700';
    areaName.style.textTransform = 'uppercase';
    areaName.style.letterSpacing = '1px';
    areaName.style.color = 'var(--text3)';
    areaName.textContent = entry.areaName;
    const level = document.createElement('div');
    level.style.fontFamily = 'var(--font-mono)';
    level.style.fontSize = '18px';
    level.style.fontWeight = '700';
    level.style.color = entry.meta.col;
    level.textContent = `Lv.${entry.area.level}`;
    left.append(areaName, level);

    const right = document.createElement('div');
    right.style.marginLeft = 'auto';
    right.style.textAlign = 'right';
    const percent = document.createElement('div');
    percent.style.fontSize = '10px';
    percent.style.fontFamily = 'var(--font-mono)';
    percent.style.color = entry.meta.col;
    percent.style.fontWeight = '700';
    percent.textContent = `${entry.percent}%`;
    const xp = document.createElement('div');
    xp.style.fontSize = '9px';
    xp.style.color = 'var(--text3)';
    xp.textContent = `${entry.area.xp}/${entry.area.xpNext} XP`;
    right.append(percent, xp);

    header.append(icon, left, right);

    const bar = document.createElement('div');
    bar.className = 'pbar mb2';
    const fill = document.createElement('div');
    fill.className = 'pbar-fill';
    fill.style.width = `${entry.percent}%`;
    fill.style.background = entry.meta.col;
    bar.appendChild(fill);

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.fontSize = '10px';
    footer.style.color = 'var(--text3)';
    const linked = document.createElement('span');
    linked.textContent = `${entry.linkedHabits} ${RT('la_habits_label')}`;
    const recent = document.createElement('span');
    recent.textContent = `ðŸ“† ${RT('rpg_recent_comp', entry.recentComp)}`;
    footer.append(linked, recent);

    card.append(header, bar, footer);
    fragment.appendChild(card);
  });

  grid.innerHTML = '';
  grid.appendChild(fragment);
  if (typeof checkCharacterAchievements === 'function') checkCharacterAchievements();
}

function spendAttrPoint(id) {
  const attrs = _ensureAttributes();
  const attrDef = ATTR_DEF.find((item) => item.id === id);
  if ((attrs.points || 0) <= 0) {
    notify(RT('attr_no_points'), 'âš ', 'info');
    return;
  }
  attrs[id] = (attrs[id] || ATTRIBUTE_BASELINE) + 1;
  attrs.points -= 1;
  saveDB();
  if (typeof checkCharacterAchievements === 'function') checkCharacterAchievements();
  emitAttributesActivity('upgraded', attrDef ? RT(attrDef.labelKey) : id, String(attrs[id]), '⚡');
  renderAttributes();
}

let _attrHash = '';

function renderAttributes() {
  const el = document.getElementById('attr-list');
  const ptsEl = document.getElementById('attr-pts');
  if (!el) return;

  const attrs = _ensureAttributes();
  if (ptsEl) ptsEl.textContent = attrs.points || 0;

  const newHash = ATTR_DEF.map((def) => attrs[def.id] || ATTRIBUTE_BASELINE).join(',')
    + `|${attrs.points || 0}|${currentRpgLanguage()}`;
  if (newHash === _attrHash && el.children.length > 0) {
    renderAttrRadar();
    return;
  }
  _attrHash = newHash;

  const max = Math.max(...ATTR_DEF.map((def) => attrs[def.id] || ATTRIBUTE_BASELINE), 30);
  const fragment = document.createDocumentFragment();

  ATTR_DEF.forEach((def) => {
    const val = attrs[def.id] || ATTRIBUTE_BASELINE;
    const pct = Math.round((val / max) * 100);

    const row = document.createElement('div');
    row.className = 'stat-row';

    const name = document.createElement('div');
    name.className = 'stat-name';
    name.textContent = `${def.icon} ${RT(def.labelKey)}`;

    const barWrap = document.createElement('div');
    barWrap.className = 'stat-bar-wrap';
    const fill = document.createElement('div');
    fill.className = 'stat-bar-fill';
    fill.style.width = `${pct}%`;
    barWrap.appendChild(fill);

    const value = document.createElement('div');
    value.className = 'stat-val-num';
    value.textContent = `${val}`;

    row.append(name, barWrap, value);

    if ((attrs.points || 0) > 0) {
      const button = document.createElement('button');
      button.className = 'btn btn-xs btn-primary';
      button.type = 'button';
      button.textContent = '+';
      button.setAttribute('aria-label', RT(def.labelKey));
      button.addEventListener('click', () => spendAttrPoint(def.id));
      row.appendChild(button);
    }

    fragment.appendChild(row);
  });

  el.innerHTML = '';
  el.appendChild(fragment);
  renderAttrRadar();
  if (typeof checkCharacterAchievements === 'function') checkCharacterAchievements();
}

function renderAttrRadar() {
  const el = document.getElementById('attr-radar');
  if (!el) return;

  const attrs = _ensureAttributes();
  const keys = ATTR_DEF.map((def) => def.id);
  const labels = ATTR_DEF.map((def) => RT(def.labelKey));
  const values = keys.map((key) => attrs[key] || ATTRIBUTE_BASELINE);
  const maxValue = Math.max(...values, 30);
  const cx = 120;
  const cy = 120;
  const radius = 80;
  const axisCount = ATTR_DEF.length;
  const angles = keys.map((_, index) => ((index * 2 * Math.PI) / axisCount) - Math.PI / 2);
  const gridPoints = (scale) => angles
    .map((angle) => `${cx + radius * scale * Math.cos(angle)},${cy + radius * scale * Math.sin(angle)}`)
    .join(' ');
  const grids = [0.25, 0.5, 0.75, 1].map((scale) =>
    `<polygon points="${gridPoints(scale)}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/>`
  ).join('');
  const spokes = angles.map((angle) =>
    `<line x1="${cx}" y1="${cy}" x2="${cx + radius * Math.cos(angle)}" y2="${cy + radius * Math.sin(angle)}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>`
  ).join('');
  const polygon = `<polygon points="${values.map((value, index) => {
    const ratio = value / maxValue;
    const angle = angles[index];
    return `${cx + radius * ratio * Math.cos(angle)},${cy + radius * ratio * Math.sin(angle)}`;
  }).join(' ')}" fill="var(--ag)" stroke="var(--accent)" stroke-width="2"/>`;
  const labelsSvg = labels.map((label, index) => {
    const angle = angles[index];
    return `<text x="${cx + (radius + 22) * Math.cos(angle)}" y="${cy + (radius + 22) * Math.sin(angle)}" text-anchor="middle" dominant-baseline="middle" fill="var(--text3)" font-size="9.5" font-family="var(--font-display)">${label}</text>`;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 240 240" width="100%" style="max-width:240px" xmlns="http://www.w3.org/2000/svg">${grids}${spokes}${polygon}${labelsSvg}</svg>`;
}

const RPGManager = {
  addLifeAreaXP,
  removeLifeAreaXP,
  renderLifeAreas,
  renderAttributes,
  renderAttrRadar,
  spendAttrPoint,
  getAvatarTier,
};

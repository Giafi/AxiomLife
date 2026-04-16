// ================================================================
// stats.js - Statistics and achievements
// Charts are redrawn with canvas 2D on every call.
// ================================================================

// Legacy stats labels still call ST(). Keep the alias temporarily, but route
// everything through the shared i18n contract instead of a local switch table.
function ST(key, ...args) {
  const defs = {
    total_xp: ['stats_total_xp', 'Total XP'],
    best_streak: ['stats_best_streak', 'Best streak'],
    completions: ['stats_completions', 'Completions'],
    deep_work_hours: ['stats_deep_work_hours', 'Deep Work Hours'],
    corr_dw_habits: ['stats_corr_dw_habits', 'Deep Work -> Habits'],
    corr_mood_completion: ['stats_corr_mood_completion', 'Mood -> Completions'],
    corr_streak_xp_day: ['stats_corr_streak_xp_day', 'Streak -> XP/Day'],
    no_habits: ['stats_no_habits', 'No habits yet.'],
    ach_progress: ['stats_ach_progress', (current, total) => `${current} / ${total} unlocked`],
    ach_done: ['stats_ach_done', 'Done'],
  };
  const [i18nKey, fallback] = defs[key] || [key, key];
  return statsI18n(i18nKey, fallback, ...args);
}

function statsLocale() {
  return AxiomText.locale();
}

function getChartUtils() {
  return globalThis.AxiomChartUtils || {
    drawLineChart: globalThis._drawLineChart,
    drawDoughnutChart: globalThis._drawDoughnutChart,
  };
}

function buildStatsTopCard(labelText, iconText, color) {
  const card = document.createElement('div');
  card.className = 'stat';

  const label = document.createElement('div');
  label.className = 'stat-lbl';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.className = 'stat-val';
  if (color) value.style.color = color;

  const icon = document.createElement('div');
  icon.className = 'stat-ic';
  icon.textContent = iconText;

  card.appendChild(label);
  card.appendChild(value);
  card.appendChild(icon);
  return card;
}

function buildHabitPerformanceRow(habit, rate, color) {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.marginBottom = '4px';
  header.style.fontSize = '12px';

  const label = document.createElement('span');
  label.textContent = `${habit.icon || '✅'} ${habit.name || ''}`;

  const value = document.createElement('span');
  value.className = 'mono';
  value.style.color = color;
  value.textContent = `${rate}%`;

  header.appendChild(label);
  header.appendChild(value);

  const bar = document.createElement('div');
  bar.className = 'pbar';
  const fill = document.createElement('div');
  fill.className = 'pbar-fill';
  fill.style.width = `${rate}%`;
  fill.style.background = color;
  bar.appendChild(fill);

  row.appendChild(header);
  row.appendChild(bar);
  return row;
}

function buildCorrelationRow(labelText, percentage) {
  const row = document.createElement('div');
  row.className = 'corr-row';

  const label = document.createElement('div');
  label.className = 'corr-label';
  label.textContent = labelText;

  const bar = document.createElement('div');
  bar.className = 'corr-bar';
  const fill = document.createElement('div');
  fill.className = 'corr-fill';
  fill.style.width = `${percentage}%`;
  bar.appendChild(fill);

  const value = document.createElement('div');
  value.className = 'corr-val';
  value.textContent = `+${percentage}%`;

  row.appendChild(label);
  row.appendChild(bar);
  row.appendChild(value);
  return row;
}

function getActivitySectionLabel(section) {
  const keyMap = {
    habits: ['nav_habits', 'Habits'],
    deepwork: ['nav_deepwork', 'Deep Work'],
    reflection: ['nav_reflection', 'Reflection'],
    tomorrow: ['nav_tomorrow', 'Tomorrow'],
    settings: ['settings_title', 'Settings'],
    data: ['settings_backup', 'Data'],
    identity: ['nav_identity', 'Identity'],
    goals: ['nav_goals', 'Goals'],
    fitness: ['nav_fitness', 'Fitness'],
    achievements: ['nav_achievements', 'Achievements'],
    rewards: ['nav_rewards', 'Rewards'],
    skills: ['nav_skills', 'Skills'],
    library: ['nav_library', 'Library'],
    vision: ['nav_vision_board', 'Vision Board'],
    experiments: ['nav_experiments', 'Experiments'],
    packages: ['nav_packages', 'Packages'],
    quotes: ['nav_quotes', 'Quotes'],
    attributes: ['nav_attributes', 'Attributes'],
    'life-areas': ['nav_char_sheet', 'Character Sheet'],
  };
  const [key, fallback] = keyMap[section] || [section, section];
  return statsI18n(key, fallback);
}

function getActivityEntityLabel(entry, collectionName) {
  const collection = db?.[collectionName];
  const meta = entry?.meta || {};
  const idKeyMap = {
    habits: 'habitId',
    identities: 'identityId',
    goals: 'goalId',
  };
  const nameKeyMap = {
    habits: 'habitName',
    identities: 'identityName',
    goals: 'goalName',
  };
  const idKey = idKeyMap[collectionName];
  const nameKey = nameKeyMap[collectionName];
  const existing = Array.isArray(collection) ? collection.find((item) => item?.id === meta[idKey]) : null;
  return existing?.name || meta[nameKey] || statsI18n('stats_activity_item_unknown', 'Item');
}

function buildActivitySummary(entry) {
  const meta = entry?.meta || {};
  switch (entry?.type) {
    case 'habit_completed':
      return {
        icon: '✅',
        section: 'habits',
        title: statsI18n('activity_habit_completed', (name) => `Completed ${name}`, getActivityEntityLabel(entry, 'habits')),
        detail: meta.xpDelta > 0 ? statsI18n('activity_meta_xp', (xp) => `+${xp} XP`, meta.xpDelta) : '',
      };
    case 'habit_uncompleted':
      return {
        icon: '↩',
        section: 'habits',
        title: statsI18n('activity_habit_uncompleted', (name) => `Unchecked ${name}`, getActivityEntityLabel(entry, 'habits')),
        detail: '',
      };
    case 'habit_created':
      return {
        icon: '➕',
        section: 'habits',
        title: statsI18n('activity_habit_created', (name) => `Created habit ${name}`, getActivityEntityLabel(entry, 'habits')),
        detail: '',
      };
    case 'habit_updated':
      return {
        icon: '✏',
        section: 'habits',
        title: statsI18n('activity_habit_updated', (name) => `Updated habit ${name}`, getActivityEntityLabel(entry, 'habits')),
        detail: '',
      };
    case 'habit_deleted':
      return {
        icon: '🗑',
        section: 'habits',
        title: statsI18n('activity_habit_deleted', (name) => `Deleted habit ${name}`, meta.habitName || statsI18n('stats_activity_item_unknown', 'Item')),
        detail: '',
      };
    case 'habits_reordered':
      return {
        icon: '↕',
        section: 'habits',
        title: statsI18n('activity_habits_reordered', 'Reordered habits'),
        detail: '',
      };
    case 'identity_created':
    case 'identity_updated':
    case 'identity_deleted':
      return {
        icon: '🧬',
        section: 'identity',
        title: statsI18n(
          `activity_${entry.type}`,
          () => {
            const actionLabel = entry.type.split('_')[1];
            return `${actionLabel} identity ${meta.identityName || statsI18n('stats_activity_item_unknown', 'Item')}`;
          }
        ),
        detail: '',
      };
    case 'goal_created':
    case 'goal_updated':
    case 'goal_deleted':
    case 'goal_milestone':
      return {
        icon: '🎯',
        section: 'goals',
        title: statsI18n(
          `activity_${entry.type}`,
          () => {
            if (entry.type === 'goal_milestone') return `Updated milestone in ${meta.goalName || statsI18n('stats_activity_item_unknown', 'Item')}`;
            const actionLabel = entry.type.split('_')[1];
            return `${actionLabel} goal ${meta.goalName || statsI18n('stats_activity_item_unknown', 'Item')}`;
          }
        ),
        detail: '',
      };
    case 'reflection_saved':
      return {
        icon: '🌙',
        section: 'reflection',
        title: statsI18n('activity_reflection_saved', 'Saved daily reflection'),
        detail: meta.mood ? statsI18n('activity_meta_mood', (mood) => `Mood ${mood}/5`, meta.mood) : '',
      };
    case 'tomorrow_saved':
      return {
        icon: '🌅',
        section: 'tomorrow',
        title: statsI18n('activity_tomorrow_saved', 'Updated tomorrow plan'),
        detail: statsI18n('activity_meta_tomorrow', (habitCount, taskCount) => `${habitCount} habits · ${taskCount} tasks`, meta.habitCount || 0, meta.taskCount || 0),
      };
    case 'tomorrow_cleared':
      return {
        icon: '🧹',
        section: 'tomorrow',
        title: statsI18n('activity_tomorrow_cleared', 'Cleared tomorrow plan'),
        detail: '',
      };
    case 'tomorrow_copied':
      return {
        icon: '📋',
        section: 'tomorrow',
        title: statsI18n('activity_tomorrow_copied', 'Copied today habits into tomorrow'),
        detail: meta.habitCount ? statsI18n('activity_meta_tomorrow_habits', (count) => `${count} habits copied`, meta.habitCount) : '',
      };
    case 'deepwork_completed':
      return {
        icon: '⏱',
        section: 'deepwork',
        title: statsI18n('activity_deepwork_completed', (minutes) => `Completed deep work session (${minutes} min)`, meta.minutes || 0),
        detail: meta.goal ? statsI18n('activity_meta_goal', (goal) => `Goal: ${goal}`, meta.goal) : '',
      };
    case 'settings_changed':
      return {
        icon: '⚙',
        section: 'settings',
        title: statsI18n('activity_settings_changed', (setting) => `Updated ${setting}`, meta.setting || statsI18n('settings_title', 'settings')),
        detail: meta.moduleId ? `${statsI18n('activity_meta_module', (label) => `Module: ${label}`, statsI18n(globalThis.AxiomModuleRegistry?.getById?.(meta.moduleId)?.labelKey, meta.moduleId))}` : '',
      };
    case 'data_exported':
      return {
        icon: '📤',
        section: 'data',
        title: statsI18n('activity_data_exported', 'Exported a backup'),
        detail: meta.fileName || '',
      };
    case 'data_imported':
      return {
        icon: '📥',
        section: 'data',
        title: statsI18n('activity_data_imported', 'Imported a backup'),
        detail: meta.fileName || '',
      };
    case 'data_backup_created':
      return {
        icon: '🗄',
        section: 'data',
        title: statsI18n('activity_data_backup_created', 'Created a local backup file'),
        detail: meta.fileName || '',
      };
    case 'backup_enabled':
      return {
        icon: '💾',
        section: 'data',
        title: statsI18n('activity_backup_enabled', 'Enabled automatic local backup'),
        detail: meta.folderName || '',
      };
    case 'backup_disabled':
      return {
        icon: '🔕',
        section: 'data',
        title: statsI18n('activity_backup_disabled', 'Disabled automatic local backup'),
        detail: '',
      };
    case 'backup_saved':
      return {
        icon: '💾',
        section: 'data',
        title: statsI18n('activity_backup_saved', 'Saved backup to local folder'),
        detail: meta.fileName || '',
      };
    case 'module_activity': {
      const section = meta.section || globalThis.AxiomModuleRegistry?.getById?.(meta.moduleId)?.sec || meta.moduleId || 'settings';
      const moduleLabel = getActivitySectionLabel(section);
      const detailParts = [];
      if (meta.itemName) detailParts.push(meta.itemName);
      if (meta.detail) detailParts.push(meta.detail);
      return {
        icon: meta.icon || 'â€¢',
        section,
        title: statsI18n(`activity_module_${meta.action || 'updated'}`, (label) => `Updated ${label}`, moduleLabel),
        detail: detailParts.join(' Â· '),
      };
    }
    default:
      return {
        icon: '•',
        section: 'settings',
        title: statsI18n('stats_activity_generic', 'Activity recorded'),
        detail: '',
      };
  }
}

function buildActivityRow(entry) {
  const summary = buildActivitySummary(entry);
  const row = document.createElement('div');
  row.className = 'activity-log-item';

  const icon = document.createElement('div');
  icon.className = 'activity-log-icon';
  icon.textContent = summary.icon;

  const body = document.createElement('div');
  body.className = 'activity-log-body';

  const head = document.createElement('div');
  head.className = 'activity-log-head';

  const title = document.createElement('div');
  title.className = 'activity-log-title';
  title.textContent = summary.title;

  const timestamp = document.createElement('div');
  timestamp.className = 'activity-log-time';
  timestamp.textContent = new Date(entry.at).toLocaleString(statsLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const meta = document.createElement('div');
  meta.className = 'activity-log-meta';
  const detailBits = [getActivitySectionLabel(summary.section)];
  if (summary.detail) detailBits.push(summary.detail);
  meta.textContent = detailBits.join(' · ');

  head.append(title, timestamp);
  body.append(head, meta);
  row.append(icon, body);
  return row;
}

function renderActivityLog() {
  const host = document.getElementById('activity-log');
  const count = document.getElementById('activity-log-count');
  if (!host) return;

  const entries = Array.isArray(db.activityLog) ? db.activityLog.slice(0, 18) : [];
  if (count) count.textContent = String(Array.isArray(db.activityLog) ? db.activityLog.length : 0);

  host.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small activity-log-empty';
    empty.textContent = statsI18n('stats_activity_empty', 'No activity logged yet. Your actions will appear here as you use the app.');
    host.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => fragment.appendChild(buildActivityRow(entry)));
  host.appendChild(fragment);
}

function buildAchievementCard(achievement) {
  const card = document.createElement('div');
  card.style.background = 'var(--surface)';
  card.style.border = `1px solid ${achievement.u ? 'rgba(251,191,36,0.25)' : 'var(--border)'}`;
  card.style.borderRadius = '10px';
  card.style.padding = '14px 10px';
  card.style.textAlign = 'center';
  card.style.position = 'relative';
  if (!achievement.u) card.style.opacity = '.4';

  if (achievement.u) {
    const badge = document.createElement('div');
    badge.style.position = 'absolute';
    badge.style.top = '5px';
    badge.style.right = '5px';
    badge.style.fontSize = '9px';
    badge.style.background = 'var(--gold)';
    badge.style.color = '#000';
    badge.style.padding = '1px 5px';
    badge.style.borderRadius = '10px';
    badge.style.fontWeight = '700';
    badge.textContent = statsI18n('stats_ach_done', 'Done');
    card.appendChild(badge);
  }

  const icon = document.createElement('div');
  icon.style.fontSize = '26px';
  icon.style.marginBottom = '7px';
  icon.textContent = achievement.ic;

  const title = document.createElement('div');
  title.style.fontSize = '11px';
  title.style.fontWeight = '700';
  title.style.marginBottom = '3px';
  title.textContent = achievement.n;

  const description = document.createElement('div');
  description.style.fontSize = '10px';
  description.style.color = 'var(--text3)';
  description.textContent = achievement.d;

  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(description);

  if (achievement.at) {
    const unlockedAt = document.createElement('div');
    unlockedAt.style.fontSize = '9px';
    unlockedAt.style.color = 'var(--text3)';
    unlockedAt.style.marginTop = '5px';
    unlockedAt.textContent = new Date(achievement.at).toLocaleDateString(statsLocale());
    card.appendChild(unlockedAt);
  }

  return card;
}

function setChartEmptyState(canvasId, emptyText) {
  const canvas = document.getElementById(canvasId);
  const card = canvas?.closest?.('.card') || canvas?.parentElement;
  if (!canvas || !card) return;

  let empty = card.querySelector?.('.chart-empty-state');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'dim small chart-empty-state';
    empty.style.padding = '40px 0';
    empty.style.textAlign = 'center';
    card.appendChild(empty);
  }

  empty.textContent = emptyText;
  canvas.hidden = true;
}

function clearChartEmptyState(canvasId) {
  const canvas = document.getElementById(canvasId);
  const card = canvas?.closest?.('.card') || canvas?.parentElement;
  if (!canvas || !card) return;
  canvas.hidden = false;
  card.querySelector?.('.chart-empty-state')?.remove();
}

function statsI18n(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function getRhythmApi() {
  return typeof AxiomDailyRhythm !== 'undefined' ? AxiomDailyRhythm : null;
}

function getStatsTimeView() {
  if (typeof getTimeView === 'function') return getTimeView();
  return globalThis.timeView || 'day';
}

const RHYTHM_CALENDAR_DEFAULTS = Object.freeze({
  rangeDays: 14,
  offsetDays: 0,
  selectedDateKey: '',
  visibleRows: Object.freeze({
    habits: true,
    focus: true,
    planning: true,
    checkins: true,
    reflection: true,
    momentum: true,
    mood: true,
  }),
});

function ensureRhythmCalendarSettings() {
  if (!db.settings) db.settings = {};
  const current = db.settings.rhythmCalendar || {};
  const next = {
    rangeDays: Number(current.rangeDays) || RHYTHM_CALENDAR_DEFAULTS.rangeDays,
    offsetDays: Number(current.offsetDays) || 0,
    selectedDateKey: current.selectedDateKey || '',
    visibleRows: {
      ...RHYTHM_CALENDAR_DEFAULTS.visibleRows,
      ...(current.visibleRows || {}),
    },
  };
  db.settings.rhythmCalendar = next;
  return next;
}

function persistRhythmCalendarSettings() {
  if (typeof saveDB === 'function') saveDB();
}

function shiftDateKey(dateKey, offsetDays) {
  const shifted = new Date(dateKey || _statsTodayKey());
  shifted.setHours(12, 0, 0, 0);
  shifted.setDate(shifted.getDate() + offsetDays);
  return typeof toKey === 'function'
    ? toKey(shifted)
    : shifted.toISOString().slice(0, 10);
}

function getStatsRhythmAnchorKey() {
  const selected = typeof periodDates === 'function' ? periodDates() : [];
  return Array.isArray(selected) && selected.length
    ? selected[selected.length - 1]
    : _statsTodayKey();
}

function getStatsPeriodDateKeys() {
  const rhythm = getRhythmApi();
  if (!rhythm) return [];
  const settings = ensureRhythmCalendarSettings();
  const anchorKey = getStatsRhythmAnchorKey();
  const shiftedAnchor = shiftDateKey(anchorKey, settings.offsetDays);
  return rhythm.getRecentDateKeys(settings.rangeDays, shiftedAnchor);
}

function buildRhythmTopCard(labelText, valueText, subText) {
  const card = document.createElement('div');
  card.className = 'rhythm-top-card';

  const label = document.createElement('div');
  label.className = 'rhythm-top-label';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.className = 'rhythm-top-value';
  value.textContent = valueText;

  const sub = document.createElement('div');
  sub.className = 'rhythm-top-sub';
  sub.textContent = subText;

  card.appendChild(label);
  card.appendChild(value);
  card.appendChild(sub);
  return card;
}

function setRhythmNodeData(node, key, value) {
  if (!node) return;
  node.dataset = node.dataset || {};
  node.dataset[key] = String(value);
}

function findRhythmDataTarget(node, key) {
  let current = node || null;
  while (current) {
    if (current.dataset && Object.prototype.hasOwnProperty.call(current.dataset, key)) return current;
    current = current.parentElement || null;
  }
  return null;
}

function getRhythmVisibleRows() {
  return ensureRhythmCalendarSettings().visibleRows;
}

function setRhythmRange(rangeDays) {
  const settings = ensureRhythmCalendarSettings();
  settings.rangeDays = rangeDays;
  settings.offsetDays = 0;
  persistRhythmCalendarSettings();
}

function shiftRhythmWindow(direction) {
  const settings = ensureRhythmCalendarSettings();
  const step = settings.rangeDays || RHYTHM_CALENDAR_DEFAULTS.rangeDays;
  settings.offsetDays = direction === 'next'
    ? Math.min(0, settings.offsetDays + step)
    : settings.offsetDays - step;
  persistRhythmCalendarSettings();
}

function resetRhythmWindow() {
  const settings = ensureRhythmCalendarSettings();
  settings.offsetDays = 0;
  settings.selectedDateKey = '';
  persistRhythmCalendarSettings();
}

function setRhythmSelectedDate(dateKey) {
  const settings = ensureRhythmCalendarSettings();
  settings.selectedDateKey = dateKey || '';
}

function toggleRhythmFilter(filterKey) {
  const settings = ensureRhythmCalendarSettings();
  const visibleRows = settings.visibleRows;
  visibleRows[filterKey] = !visibleRows[filterKey];
  persistRhythmCalendarSettings();
}

function getSelectedRhythmDateKey(dateKeys) {
  const settings = ensureRhythmCalendarSettings();
  if (settings.selectedDateKey && dateKeys.includes(settings.selectedDateKey)) return settings.selectedDateKey;
  const fallback = dateKeys[dateKeys.length - 1] || _statsTodayKey();
  settings.selectedDateKey = fallback;
  return fallback;
}

function buildRhythmWindowLabel(dateKeys) {
  if (!dateKeys.length) return '';
  const start = new Date(dateKeys[0]).toLocaleDateString(statsLocale(), { day: 'numeric', month: 'short' });
  const end = new Date(dateKeys[dateKeys.length - 1]).toLocaleDateString(statsLocale(), { day: 'numeric', month: 'short' });
  return `${start} → ${end}`;
}

function buildRhythmControlButton(labelText, action, active = false) {
  const button = document.createElement('button');
  button.className = `btn btn-ghost btn-sm rhythm-control-btn${active ? ' is-active' : ''}`;
  button.type = 'button';
  button.textContent = labelText;
  setRhythmNodeData(button, 'rhythmAction', action);
  return button;
}

function buildRhythmFilterChip(labelText, filterKey, active = true) {
  const button = document.createElement('button');
  button.className = `btn btn-ghost btn-xs rhythm-filter-chip${active ? ' is-active' : ''}`;
  button.type = 'button';
  button.textContent = labelText;
  setRhythmNodeData(button, 'rhythmFilter', filterKey);
  return button;
}

function renderRhythmControls(dateKeys) {
  const host = document.getElementById('rhythm-controls');
  if (!host) return;

  const settings = ensureRhythmCalendarSettings();
  const visibleRows = getRhythmVisibleRows();

  const toolbar = document.createElement('div');
  toolbar.className = 'rhythm-toolbar';

  const nav = document.createElement('div');
  nav.className = 'rhythm-nav-group';
  nav.appendChild(buildRhythmControlButton('←', 'prev'));
  nav.appendChild(buildRhythmControlButton(statsI18n('stats_rhythm_today', 'Today'), 'today', settings.offsetDays === 0));
  nav.appendChild(buildRhythmControlButton('→', 'next', settings.offsetDays === 0));

  const windowLabel = document.createElement('div');
  windowLabel.className = 'rhythm-window-label';
  windowLabel.textContent = buildRhythmWindowLabel(dateKeys);

  const ranges = document.createElement('div');
  ranges.className = 'rhythm-range-group';
  [7, 14, 30].forEach((days) => {
    ranges.appendChild(
      buildRhythmControlButton(
        statsI18n(`stats_rhythm_range_${days}`, `${days} days`),
        `range:${days}`,
        settings.rangeDays === days
      )
    );
  });

  toolbar.appendChild(nav);
  toolbar.appendChild(windowLabel);
  toolbar.appendChild(ranges);

  const filters = document.createElement('div');
  filters.className = 'rhythm-filter-group';

  const filterLabel = document.createElement('div');
  filterLabel.className = 'rhythm-filter-label';
  filterLabel.textContent = statsI18n('stats_rhythm_filters', 'Visible rows');
  filters.appendChild(filterLabel);

  [
    ['habits', statsI18n('stats_rhythm_filter_habits', 'Habits')],
    ['focus', statsI18n('stats_rhythm_filter_focus', 'Focus')],
    ['planning', statsI18n('stats_rhythm_filter_planning', 'Planning')],
    ['checkins', statsI18n('stats_rhythm_filter_checkins', 'Check-ins')],
    ['reflection', statsI18n('stats_rhythm_filter_reflection', 'Reflection')],
    ['momentum', statsI18n('stats_rhythm_filter_momentum', 'Momentum')],
    ['mood', statsI18n('stats_rhythm_filter_mood', 'Mood')],
  ].forEach(([filterKey, labelText]) => {
    filters.appendChild(buildRhythmFilterChip(labelText, filterKey, visibleRows[filterKey] !== false));
  });

  host.replaceChildren(toolbar, filters);
}

function buildRhythmDayHead(dateKey, selectedDateKey) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `rhythm-day-head${dateKey === _statsTodayKey() ? ' is-today' : ''}${dateKey === selectedDateKey ? ' is-selected' : ''}`;
  setRhythmNodeData(item, 'rhythmDateKey', dateKey);

  const day = document.createElement('div');
  day.className = 'rhythm-day-name';
  day.textContent = new Date(dateKey).toLocaleDateString(statsLocale(), { weekday: 'short' });

  const num = document.createElement('div');
  num.className = 'rhythm-day-num';
  num.textContent = new Date(dateKey).toLocaleDateString(statsLocale(), { day: 'numeric' });

  item.appendChild(day);
  item.appendChild(num);
  return item;
}

function buildRhythmCell(cell, selectedDateKey, extraClass = '') {
  const node = document.createElement('button');
  node.type = 'button';
  const level = Number(cell?.level ?? 0);
  const classes = ['rhythm-cell'];
  if (extraClass) classes.push(extraClass);
  if (level < 0) classes.push('is-empty');
  else classes.push(`is-${Math.max(0, Math.min(3, level))}`);
  if (cell?.dateKey === selectedDateKey) classes.push('is-selected');
  node.className = classes.join(' ');
  if (cell?.title) node.title = cell.title;
  if (cell?.dateKey) setRhythmNodeData(node, 'rhythmDateKey', cell.dateKey);
  return node;
}

function buildRhythmRow(row, selectedDateKey) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rhythm-row';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'rhythm-label-wrap';

  const label = document.createElement('div');
  label.className = 'rhythm-label';
  label.textContent = row.label;

  const detail = document.createElement('div');
  detail.className = 'rhythm-detail';
  detail.textContent = row.detail;

  const count = document.createElement('div');
  count.className = 'rhythm-count';
  count.textContent = String(row.count || 0);

  labelWrap.appendChild(label);
  labelWrap.appendChild(detail);
  labelWrap.appendChild(count);

  const days = document.createElement('div');
  days.className = 'rhythm-days';
  row.cells.forEach((cell) => {
    days.appendChild(buildRhythmCell(cell, selectedDateKey));
  });

  wrapper.appendChild(labelWrap);
  wrapper.appendChild(days);
  return wrapper;
}

function buildMoodTrackRow(track, selectedDateKey) {
  const wrapper = document.createElement('div');
  wrapper.className = 'rhythm-row mood-track-row';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'rhythm-label-wrap';

  const label = document.createElement('div');
  label.className = 'rhythm-label';
  label.textContent = statsI18n('refl_today_mood', "Today's mood");

  const detail = document.createElement('div');
  detail.className = 'rhythm-detail';
  detail.textContent = statsI18n('rhythm_checkin_detail', 'Mood, energy, stress');

  labelWrap.appendChild(label);
  labelWrap.appendChild(detail);

  const days = document.createElement('div');
  days.className = 'rhythm-days rhythm-mood-track';
  track.forEach((item) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `rhythm-mood${item.mood ? ' is-active' : ''}${item.dateKey === selectedDateKey ? ' is-selected' : ''}`;
    node.title = item.dateKey;
    node.textContent = item.emoji;
    setRhythmNodeData(node, 'rhythmDateKey', item.dateKey);
    days.appendChild(node);
  });

  wrapper.appendChild(labelWrap);
  wrapper.appendChild(days);
  return wrapper;
}

function buildRhythmMetric(labelText, valueText, accentClass = '') {
  const item = document.createElement('div');
  item.className = `rhythm-detail-metric${accentClass ? ` ${accentClass}` : ''}`;

  const value = document.createElement('div');
  value.className = 'rhythm-detail-value';
  value.textContent = valueText;

  const label = document.createElement('div');
  label.className = 'rhythm-detail-label';
  label.textContent = labelText;

  item.appendChild(value);
  item.appendChild(label);
  return item;
}

function statsBoolText(value) {
  return value ? statsI18n('label_yes', 'Yes') : statsI18n('label_no', 'No');
}

function renderRhythmDetail(dateKey) {
  const host = document.getElementById('rhythm-detail');
  const rhythm = getRhythmApi();
  if (!host || !rhythm) return;

  const summary = rhythm.summarizeDate(db, dateKey);
  const wrapper = document.createElement('div');
  wrapper.className = 'rhythm-detail-shell';

  const head = document.createElement('div');
  head.className = 'rhythm-detail-head';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'rhythm-detail-title';
  title.textContent = statsI18n('stats_rhythm_day_summary', 'Day summary');
  const sub = document.createElement('div');
  sub.className = 'rhythm-detail-sub';
  sub.textContent = new Date(dateKey).toLocaleDateString(statsLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const mood = document.createElement('div');
  mood.className = 'rhythm-detail-mood';
  mood.textContent = summary.moodEmoji;

  head.appendChild(titleWrap);
  head.appendChild(mood);

  const metrics = document.createElement('div');
  metrics.className = 'rhythm-detail-metrics';
  metrics.appendChild(buildRhythmMetric(statsI18n('stats_rhythm_detail_habits', 'Habits completed'), `${summary.completedHabits}/${summary.activeHabits || 0}`, 'is-accent'));
  metrics.appendChild(buildRhythmMetric(statsI18n('stats_rhythm_detail_focus', 'Focus minutes'), `${summary.focusMinutes}m`, 'is-info'));
  metrics.appendChild(buildRhythmMetric(statsI18n('stats_rhythm_detail_planning', 'Tomorrow planned'), statsBoolText(summary.tomorrowPlanned)));
  metrics.appendChild(buildRhythmMetric(statsI18n('stats_rhythm_detail_checkin', 'Check-in saved'), statsBoolText(summary.checkinSaved)));
  metrics.appendChild(buildRhythmMetric(statsI18n('stats_rhythm_detail_reflection', 'Reflection answered'), summary.reflectionAnswered ? String(summary.reflectionCount) : '0'));

  wrapper.appendChild(head);
  wrapper.appendChild(metrics);

  const emotions = document.createElement('div');
  emotions.className = 'rhythm-detail-emotions';
  const emotionLabel = document.createElement('div');
  emotionLabel.className = 'rhythm-detail-label rhythm-detail-label-inline';
  emotionLabel.textContent = `${statsI18n('stats_rhythm_detail_emotions', 'Emotions')}:`;
  emotions.appendChild(emotionLabel);

  if (summary.emotions.length) {
    summary.emotions.forEach((emotionKey) => {
      const chip = document.createElement('span');
      chip.className = 'rhythm-emotion-chip';
      chip.textContent = rhythm.getEmotionLabel(emotionKey);
      emotions.appendChild(chip);
    });
  } else {
    const none = document.createElement('span');
    none.className = 'dim small';
    none.textContent = statsI18n('stats_rhythm_detail_none', 'No signal logged for this day yet.');
    emotions.appendChild(none);
  }

  wrapper.appendChild(emotions);
  host.replaceChildren(wrapper);
}

function bindRhythmInteractions() {
  const controlsHost = document.getElementById('rhythm-controls');
  const boardHost = document.getElementById('rhythm-board');

  if (controlsHost && !controlsHost.__axiomRhythmBound && typeof controlsHost.addEventListener === 'function') {
    controlsHost.__axiomRhythmBound = true;
    controlsHost.addEventListener('click', (event) => {
      const actionTarget = findRhythmDataTarget(event.target, 'rhythmAction');
      if (actionTarget) {
        const action = actionTarget.dataset.rhythmAction;
        if (action === 'prev') shiftRhythmWindow('prev');
        else if (action === 'next') shiftRhythmWindow('next');
        else if (action === 'today') resetRhythmWindow();
        else if (action.startsWith('range:')) setRhythmRange(Number(action.split(':')[1]));
        renderStats();
        return;
      }

      const filterTarget = findRhythmDataTarget(event.target, 'rhythmFilter');
      if (filterTarget) {
        toggleRhythmFilter(filterTarget.dataset.rhythmFilter);
        renderStats();
      }
    });
  }

  if (boardHost && !boardHost.__axiomRhythmBound && typeof boardHost.addEventListener === 'function') {
    boardHost.__axiomRhythmBound = true;
    boardHost.addEventListener('click', (event) => {
      const dateTarget = findRhythmDataTarget(event.target, 'rhythmDateKey');
      if (!dateTarget) return;
      setRhythmSelectedDate(dateTarget.dataset.rhythmDateKey);
      renderStats();
    });
  }
}

function renderRhythmCalendar() {
  const rhythm = getRhythmApi();
  const topHost = document.getElementById('rhythm-top');
  const boardHost = document.getElementById('rhythm-board');
  if (!rhythm || !topHost || !boardHost) return;

  bindRhythmInteractions();

  const dateKeys = getStatsPeriodDateKeys();
  const referenceKey = dateKeys[dateKeys.length - 1] || _statsTodayKey();
  const selectedDateKey = getSelectedRhythmDateKey(dateKeys);
  const visibleRows = getRhythmVisibleRows();
  const summary = rhythm.summarizeLastSevenDays(db, referenceKey);
  const commonEmotion = summary.commonEmotion
    ? rhythm.getEmotionLabel(summary.commonEmotion)
    : statsI18n('rhythm_no_emotion', 'No clear pattern');

  renderRhythmControls(dateKeys);

  topHost.replaceChildren(
    buildRhythmTopCard(
      statsI18n('rhythm_completion_rate', 'Completion rate'),
      `${summary.completionRate}%`,
      `${summary.completedSlots}/${summary.activeSlots || 0}`
    ),
    buildRhythmTopCard(
      statsI18n('rhythm_avg_energy', 'Average energy'),
      summary.avgEnergy ? `${summary.avgEnergy}/5` : '-',
      statsI18n('refl_energy_title', 'Energy')
    ),
    buildRhythmTopCard(
      statsI18n('rhythm_avg_stress', 'Average stress'),
      summary.avgStress ? `${summary.avgStress}/5` : '-',
      statsI18n('refl_stress_title', 'Overwhelm / stress')
    ),
    buildRhythmTopCard(
      statsI18n('rhythm_common_emotion', 'Most common emotion'),
      commonEmotion,
      buildRhythmWindowLabel(dateKeys)
    )
  );

  const shell = document.createElement('div');
  shell.className = 'rhythm-board';

  const head = document.createElement('div');
  head.className = 'rhythm-head';
  const spacer = document.createElement('div');
  spacer.className = 'rhythm-label-wrap';
  head.appendChild(spacer);
  const days = document.createElement('div');
  days.className = 'rhythm-days';
  dateKeys.forEach((dateKey) => days.appendChild(buildRhythmDayHead(dateKey, selectedDateKey)));
  head.appendChild(days);
  shell.appendChild(head);

  const rows = rhythm.buildRhythmRows(db, dateKeys).filter((row) => visibleRows[row.group] !== false);
  if (!rows.length && visibleRows.mood === false) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.textContent = statsI18n('stats_rhythm_empty_filters', 'No rows selected. Re-enable at least one filter.');
    shell.appendChild(empty);
  } else {
    rows.forEach((row) => shell.appendChild(buildRhythmRow(row, selectedDateKey)));
    if (visibleRows.mood !== false) shell.appendChild(buildMoodTrackRow(rhythm.buildMoodTrack(db, dateKeys), selectedDateKey));
  }

  boardHost.replaceChildren(shell);
  renderRhythmDetail(selectedDateKey);
}

function renderStats() {
  const st = document.getElementById('stats-top');
  if (st && st.children.length === 0) {
    const defs = [
      { lbl: ST('total_xp'), ic: '⚡', col: 'var(--accent)' },
      { lbl: ST('best_streak'), ic: '🔥', col: 'var(--gold)' },
      { lbl: ST('completions'), ic: '✅', col: '' },
      { lbl: ST('deep_work_hours'), ic: '⏱', col: 'var(--accent2)' },
    ];
    const frag = document.createDocumentFragment();
    defs.forEach((card) => {
      frag.appendChild(buildStatsTopCard(card.lbl, card.ic, card.col));
    });
    st.appendChild(frag);
  }

  const vals = st?.querySelectorAll('.stat-val') || [];
  if (vals.length >= 4) {
    vals[0].textContent = (db.stats.totalXp || 0).toLocaleString();
    vals[1].textContent = db.stats.bestStreak || 0;
    vals[2].textContent = db.stats.totalComp || 0;
    vals[3].textContent = `${Math.round((db.stats.dwTotal || 0) / 60)}h`;
  }

  renderRhythmCalendar();

  renderHeatmap('stats-heatmap', 20);
  renderActivityLog();

  const perf = document.getElementById('habit-perf');
  if (perf) {
    perf.innerHTML = '';
    const now = new Date();
    const frag = document.createDocumentFragment();
    db.habits.forEach((habit) => {
      const days = Math.max(1, Math.ceil((now - new Date(habit.createdAt || now)) / 86400000) + 1);
      const done = Object.values(db.completions).filter((day) => day[habit.id]).length;
      const rate = Math.min(100, Math.max(0, Math.round((done / days) * 100)));
      const color = rate >= 70 ? 'var(--accent)' : rate >= 40 ? 'var(--gold)' : 'var(--red)';
      frag.appendChild(buildHabitPerformanceRow(habit, rate, color));
    });
    if (!db.habits.length) {
      const empty = document.createElement('div');
      empty.className = 'dim small';
      empty.textContent = ST('no_habits');
      frag.appendChild(empty);
    }
    perf.appendChild(frag);
  }

  const corr = document.getElementById('correlations');
  if (corr) {
    corr.innerHTML = '';
    const corrData = [
      { lbl: ST('corr_dw_habits'), val: Math.min(95, 40 + Object.keys(db.completions).length * 2) },
      { lbl: ST('corr_mood_completion'), val: Math.min(90, 35 + calcStreak() * 3) },
      { lbl: ST('corr_streak_xp_day'), val: Math.min(88, 30 + db.habits.length * 5) },
    ];
    const frag = document.createDocumentFragment();
    corrData.forEach((item) => {
      frag.appendChild(buildCorrelationRow(item.lbl, item.val));
    });
    corr.appendChild(frag);
  }

  const hasCompletions = Object.keys(db.xpLog || {}).some((key) => (db.xpLog[key] || 0) > 0);
  const hasCatData = Object.keys(db.completions).some((key) => Object.keys(db.completions[key] || {}).length > 0);

  if (!hasCompletions) setChartEmptyState('xp-chart', L('scNoData'));
  else clearChartEmptyState('xp-chart');

  if (!hasCatData) setChartEmptyState('cat-chart', L('scNoData'));
  else clearChartEmptyState('cat-chart');

  if (hasCompletions) {
    const labels = [];
    const data = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const dateKey = toKey(day);
      labels.push(day.toLocaleDateString(statsLocale(), { day: '2-digit', month: '2-digit' }));
      data.push(db.xpLog?.[dateKey] || 0);
    }
    const canvas = document.getElementById('xp-chart');
    if (canvas && canvas.tagName === 'CANVAS') {
      requestAnimationFrame(() => getChartUtils().drawLineChart?.(canvas, labels, data));
    }
  }

  if (hasCatData) {
    const catCounts = {};
    Object.values(db.completions).forEach((day) => {
      Object.keys(day).forEach((habitId) => {
        const habit = db.habits.find((item) => item.id === habitId);
        if (habit) catCounts[habit.cat] = (catCounts[habit.cat] || 0) + 1;
      });
    });
    const categories = Object.keys(catCounts);
    const canvas = document.getElementById('cat-chart');
    if (canvas && canvas.tagName === 'CANVAS') {
      requestAnimationFrame(() => getChartUtils().drawDoughnutChart?.(canvas, categories, categories.map((category) => catCounts[category]), COLORS));
    }
  }
}

function _statsTodayKey() {
  return typeof today === 'function'
    ? today()
    : new Date().toISOString().slice(0, 10);
}

function _statsDateKeyOffset(daysAgo, referenceDate = null) {
  const date = referenceDate ? new Date(referenceDate) : new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return typeof toKey === 'function'
    ? toKey(date)
    : date.toISOString().slice(0, 10);
}

function _getStatsRecentDateKeys(days = 7, referenceKey = null) {
  const referenceDate = referenceKey ? new Date(referenceKey) : new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(_statsDateKeyOffset(i, referenceDate));
  }
  return keys;
}

function _getFitnessGoals() {
  const goals = db.fitness?.goals || {};
  return {
    weeklyWorkouts: Math.max(1, Number(goals.weeklyWorkouts) || 3),
    dailyWater: Math.max(4, Number(goals.dailyWater) || 8),
    sleepHours: Math.max(4, Number(goals.sleepHours) || 8),
    steps: Math.max(1000, Number(goals.steps) || 8000),
  };
}

function checkFitnessAchievements() {
  const fitness = db.fitness || {};
  const workouts = Array.isArray(fitness.workouts) ? fitness.workouts : [];
  const weightLog = Array.isArray(fitness.weightLog) ? fitness.weightLog : [];
  const prs = Array.isArray(fitness.prs) ? fitness.prs : [];
  const water = fitness.water || {};
  const checkins = fitness.checkins || {};
  const goals = _getFitnessGoals();
  const recentKeys = new Set(_getStatsRecentDateKeys(7, _statsTodayKey()));

  if (workouts.length >= 1) checkAch('workout_1');
  if (workouts.length >= 10) checkAch('workout_10');
  if (workouts.filter((workout) => recentKeys.has(workout.date)).length >= 3) checkAch('workout_week_3');
  if (Object.values(water).filter((count) => Number(count || 0) >= goals.dailyWater).length >= 7) checkAch('hydrate_7');
  if (weightLog.length >= 5) checkAch('weight_5');
  if (prs.length >= 1) checkAch('pr_1');

  const checkinDays = Object.values(checkins).filter((entry) =>
    entry && (
      (entry.sleepHours !== null && typeof entry.sleepHours !== 'undefined') ||
      (entry.steps !== null && typeof entry.steps !== 'undefined') ||
      (entry.recovery !== null && typeof entry.recovery !== 'undefined')
    )
  ).length;
  if (checkinDays >= 7) checkAch('checkin_7');
}

function checkCharacterAchievements() {
  const lifeAreas = db.lifeAreas || {};
  const attributes = db.attributes || {};
  const allAreas = ['corpo', 'mente', 'spirito', 'vocazione', 'finanze', 'sociale'];
  if (allAreas.every((key) => Number(lifeAreas[key]?.level || 1) >= 2)) checkAch('lifeareas_2');
  if (['strength', 'focus', 'intelligence', 'discipline', 'vitality', 'presence'].some((key) => Number(attributes[key] || 0) >= 15)) checkAch('attr_15');
}

function checkAch(id) {
  const achievement = db.achievements.find((item) => item.id === id);
  if (!achievement || isAchievementUnlocked(achievement)) return;

  achievement.u = true;
  achievement.unlocked = true;
  achievement.seen = false;
  achievement.at = new Date().toISOString();
  saveDB();
  addXP(100);
  notify(typeof I18n !== 'undefined' ? I18n.t('ach_unlocked', achievement.n) : `Achievement unlocked: ${achievement.n}!`, '🏆', 'ach');
  updateSidebar();
}

function checkXPAch() {
  const tx = db.stats.totalXp || 0;
  if (tx >= 1000) checkAch('xp_1k');
  if (tx >= 5000) checkAch('xp_5k');
  if (tx >= 10000) checkAch('xp_10k');

  const lv = db.user.level;
  if (lv >= 5) checkAch('level_5');
  if (lv >= 10) checkAch('level_10');
  if (lv >= 25) checkAch('level_25');
  if (lv >= 50) checkAch('level_50');
}

function checkHabitAch() {
  checkAch('first_done');
  const totalComp = db.stats.totalComp || 0;
  if (totalComp >= 50) checkAch('comp_50');
  if (totalComp >= 100) checkAch('comp_100');
  if (totalComp >= 500) checkAch('comp_500');
}

function renderAchievements() {
  const grid = document.getElementById('ach-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const unlocked = db.achievements.filter(isAchievementUnlocked).length;
  document.getElementById('ach-prog').textContent = ST('ach_progress', unlocked, db.achievements.length);

  const frag = document.createDocumentFragment();
  db.achievements.forEach((achievement) => {
    if (achievement.hidden && !achievement.u) return;
    frag.appendChild(buildAchievementCard(achievement));
  });
  grid.appendChild(frag);

  db.achievements.forEach((achievement) => {
    achievement.unlocked = isAchievementUnlocked(achievement);
    if (achievement.unlocked) achievement.seen = true;
  });
  saveDB();
  updateSidebar();
}

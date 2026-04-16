// ================================================================
// fitness.js - Workout logging, hydration, recovery, and body stats
// ================================================================

const WORKOUT_ICONS = {
  strength: '💪',
  cardio: '🏃',
  hiit: '⚡',
  yoga: '🧘',
  sport: '⚽',
  walk: '🚶',
  swim: '🏊',
  cycling: '🚴',
  other: '✨',
};

const MUSCLE_ICONS = {
  chest: '🫁',
  back: '🔙',
  shoulders: '🏋',
  arms: '💪',
  legs: '🦵',
  glutes: '🍑',
  core: '🔥',
  cardio: '❤️',
};

const FITNESS_DEFAULT_GOALS = Object.freeze({
  weeklyWorkouts: 3,
  dailyWater: 8,
  sleepHours: 8,
  steps: 8000,
});

const FITNESS_SUMMARY_DAYS = 7;
const FT = (key, ...args) => (typeof I18n !== 'undefined' ? I18n.t(key, ...args) : key);

function _toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function _clampInteger(value, min, max, fallback) {
  const num = _toFiniteNumber(value);
  if (num === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function _clampFloat(value, min, max, fallback) {
  const num = _toFiniteNumber(value);
  if (num === null) return fallback;
  return Math.min(max, Math.max(min, Number(num)));
}

function _optionalInteger(value, min, max) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const num = _toFiniteNumber(value);
  if (num === null) return null;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function _optionalFloat(value, min, max) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const num = _toFiniteNumber(value);
  if (num === null) return null;
  return Math.min(max, Math.max(min, Number(num)));
}

function ensureFitnessState() {
  if (!db.fitness || typeof db.fitness !== 'object') db.fitness = {};
  if (!Array.isArray(db.fitness.workouts)) db.fitness.workouts = [];
  if (!Array.isArray(db.fitness.weightLog)) db.fitness.weightLog = [];
  if (!Array.isArray(db.fitness.prs)) db.fitness.prs = [];
  if (!db.fitness.water || typeof db.fitness.water !== 'object') db.fitness.water = {};
  if (!db.fitness.checkins || typeof db.fitness.checkins !== 'object') db.fitness.checkins = {};

  const rawGoals = db.fitness.goals && typeof db.fitness.goals === 'object' ? db.fitness.goals : {};
  db.fitness.goals = {
    weeklyWorkouts: _clampInteger(rawGoals.weeklyWorkouts, 1, 14, FITNESS_DEFAULT_GOALS.weeklyWorkouts),
    dailyWater: _clampInteger(rawGoals.dailyWater, 4, 12, FITNESS_DEFAULT_GOALS.dailyWater),
    sleepHours: _clampFloat(rawGoals.sleepHours, 4, 12, FITNESS_DEFAULT_GOALS.sleepHours),
    steps: _clampInteger(rawGoals.steps, 1000, 40000, FITNESS_DEFAULT_GOALS.steps),
  };
}

function getFitnessTargets() {
  ensureFitnessState();
  return { ...db.fitness.goals };
}

function _safeToday() {
  return typeof today === 'function'
    ? today()
    : new Date().toISOString().slice(0, 10);
}

function _dateKeyForOffset(daysAgo, referenceDate = null) {
  const date = referenceDate ? new Date(referenceDate) : new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return typeof toKey === 'function'
    ? toKey(date)
    : date.toISOString().slice(0, 10);
}

function _getRecentDateKeys(days = FITNESS_SUMMARY_DAYS, referenceKey = null) {
  const referenceDate = referenceKey ? new Date(referenceKey) : new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(_dateKeyForOffset(i, referenceDate));
  }
  return keys;
}

function _getCheckin(dateKey = _safeToday()) {
  ensureFitnessState();
  const raw = db.fitness.checkins[dateKey] || {};
  return {
    sleepHours: _optionalFloat(raw.sleepHours, 0, 24),
    steps: _optionalInteger(raw.steps, 0, 50000),
    recovery: _optionalInteger(raw.recovery, 1, 10),
  };
}

function _hasMeaningfulCheckin(checkin) {
  return Boolean(checkin && (
    checkin.sleepHours !== null ||
    checkin.steps !== null ||
    checkin.recovery !== null
  ));
}

function workoutTypeLabel(type) {
  const key = `ft_type_${type}`;
  const label = FT(key);
  return label === key ? (type || FT('ft_type_other')) : label;
}

function muscleLabel(key) {
  const i18nKey = `ft_muscle_${key}`;
  const label = FT(i18nKey);
  return label === i18nKey ? key : label;
}

function _formatFitnessDate(value) {
  if (typeof formatDate === 'function') return formatDate(value);
  const locale = (typeof I18n !== 'undefined' && I18n.lang === 'it') ? 'it-IT' : 'en-US';
  return new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function _formatCompact(value) {
  const num = _toFiniteNumber(value);
  if (num === null) return '—';
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return Math.round(num).toString();
}

function _average(values) {
  const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function _weightTrend() {
  const latest = db.fitness.weightLog[0]?.weight ?? null;
  const previous = db.fitness.weightLog[1]?.weight ?? null;
  if (latest === null || previous === null) return null;
  if (latest > previous) return 'up';
  if (latest < previous) return 'down';
  return 'flat';
}

function getFitnessSummary(referenceKey = _safeToday()) {
  ensureFitnessState();

  const goals = getFitnessTargets();
  const recentKeys = _getRecentDateKeys(FITNESS_SUMMARY_DAYS, referenceKey);
  const recentSet = new Set(recentKeys);
  const recentWorkouts = db.fitness.workouts.filter((workout) => recentSet.has(workout.date));
  const recentCheckins = recentKeys
    .map((key) => _getCheckin(key))
    .filter(_hasMeaningfulCheckin);

  const avgSleep = _average(recentCheckins.map((checkin) => checkin.sleepHours).filter((value) => value !== null));
  const avgSteps = _average(recentCheckins.map((checkin) => checkin.steps).filter((value) => value !== null));
  const avgRecovery = _average(recentCheckins.map((checkin) => checkin.recovery).filter((value) => value !== null));
  const hydrationDays = recentKeys.filter((key) => (db.fitness.water[key] || 0) >= goals.dailyWater).length;

  return {
    workoutGoal: goals.weeklyWorkouts,
    waterGoal: goals.dailyWater,
    sleepGoal: goals.sleepHours,
    stepsGoal: goals.steps,
    workoutsThisWeek: recentWorkouts.length,
    totalMinutesThisWeek: recentWorkouts.reduce((sum, workout) => sum + (Number(workout.duration) || 0), 0),
    hydrationDays,
    avgSleep,
    avgSteps,
    avgRecovery,
    latestWeight: db.fitness.weightLog[0]?.weight ?? null,
    weightTrend: _weightTrend(),
    checkinToday: _hasMeaningfulCheckin(_getCheckin(referenceKey)),
  };
}

function _buildMetricCard(labelText, valueText, metaText, color = '') {
  const card = document.createElement('div');
  card.className = 'fitness-summary-card';

  const label = document.createElement('div');
  label.className = 'fitness-summary-label';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.className = 'fitness-summary-value';
  value.textContent = valueText;
  if (color) value.style.color = color;

  const meta = document.createElement('div');
  meta.className = 'fitness-summary-meta';
  meta.textContent = metaText;

  card.append(label, value, meta);
  return card;
}

function _buildMusclePill(muscle, compact = false) {
  const pill = document.createElement('span');
  pill.className = 'muscle-chip active';
  pill.style.fontSize = compact ? '9px' : '10px';
  pill.style.padding = compact ? '2px 7px' : '3px 9px';
  pill.textContent = `${MUSCLE_ICONS[muscle] || WORKOUT_ICONS.other} ${muscleLabel(muscle)}`;
  return pill;
}

function _buildWorkoutHistoryEntry(workout) {
  const row = document.createElement('div');
  row.className = 'workout-log-entry';

  const icon = document.createElement('div');
  icon.style.fontSize = '22px';
  icon.style.flexShrink = '0';
  icon.textContent = WORKOUT_ICONS[workout.type] || WORKOUT_ICONS.other;

  const body = document.createElement('div');
  body.style.flex = '1';
  body.style.minWidth = '0';

  const title = document.createElement('div');
  title.style.fontSize = '12px';
  title.style.fontWeight = '700';
  title.style.marginBottom = '2px';
  const kcalText = workout.kcal ? ` · ${workout.kcal} kcal` : '';
  title.textContent = `${workoutTypeLabel(workout.type)} · ${workout.duration} min${kcalText}`;

  const meta = document.createElement('div');
  meta.style.fontSize = '10px';
  meta.style.color = 'var(--text3)';
  meta.style.marginBottom = '4px';
  meta.textContent = workout.note
    ? `${_formatFitnessDate(workout.date)} · ${workout.note}`
    : _formatFitnessDate(workout.date);

  body.append(title, meta);

  if (Array.isArray(workout.muscles) && workout.muscles.length) {
    const muscles = document.createElement('div');
    muscles.style.display = 'flex';
    muscles.style.flexWrap = 'wrap';
    muscles.style.gap = '2px';
    workout.muscles.forEach((muscle) => muscles.appendChild(_buildMusclePill(muscle, true)));
    body.appendChild(muscles);
  }

  const xpTag = document.createElement('span');
  xpTag.className = 'tag tb';
  xpTag.style.flexShrink = '0';
  xpTag.textContent = `+${workout.xp} XP`;

  row.append(icon, body, xpTag);
  return row;
}

function _buildWeightHistoryEntry(entry, isLatest, trend) {
  const row = document.createElement('div');
  row.className = 'body-weight-point';

  const dateText = document.createElement('span');
  dateText.style.fontSize = '11px';
  dateText.style.color = 'var(--text3)';
  dateText.textContent = _formatFitnessDate(entry.date);

  const value = document.createElement('span');
  value.style.marginLeft = 'auto';
  value.style.fontFamily = 'var(--font-mono)';
  value.style.fontWeight = '700';
  value.style.fontSize = '13px';
  value.textContent = `${entry.weight}kg`;

  row.append(dateText, value);

  if (isLatest && trend) {
    const arrow = document.createElement('span');
    arrow.style.fontWeight = '700';
    if (trend === 'down') {
      arrow.style.color = 'var(--accent)';
      arrow.textContent = '↓';
    } else if (trend === 'up') {
      arrow.style.color = 'var(--red)';
      arrow.textContent = '↑';
    } else {
      arrow.style.color = 'var(--text3)';
      arrow.textContent = '→';
    }
    row.appendChild(arrow);
  }

  return row;
}

function _buildPrRow(pr, index) {
  const row = document.createElement('div');
  row.className = 'pr-row';

  const title = document.createElement('div');
  title.style.fontSize = '12px';
  title.style.fontWeight = '600';
  title.textContent = `🏆 ${pr.exercise || ''}`;

  const value = document.createElement('div');
  value.style.fontFamily = 'var(--font-mono)';
  value.style.fontSize = '13px';
  value.style.color = 'var(--gold)';
  value.style.fontWeight = '700';
  value.textContent = `${pr.value || ''} ${pr.unit || ''}`.trim();

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger btn-xs';
  deleteBtn.textContent = '✕';
  deleteBtn.setAttribute('aria-label', FT('btn_delete'));
  deleteBtn.addEventListener('click', () => deletePR(index));

  row.append(title, value, deleteBtn);
  return row;
}

function renderWorkoutHistory() {
  const historyEl = document.getElementById('ft-workout-history');
  if (!historyEl) return;

  const workouts = db.fitness.workouts.slice(0, 30);
  historyEl.innerHTML = '';

  if (!workouts.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.textContent = FT('ft_no_workouts');
    historyEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  workouts.forEach((workout) => fragment.appendChild(_buildWorkoutHistoryEntry(workout)));
  historyEl.appendChild(fragment);
}

function renderWeightHistory() {
  const weightEl = document.getElementById('ft-weight-history');
  if (!weightEl) return;

  const log = db.fitness.weightLog.slice(0, 10);
  weightEl.innerHTML = '';

  if (!log.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.textContent = FT('ft_no_weight');
    weightEl.appendChild(empty);
    return;
  }

  const trend = _weightTrend();
  const fragment = document.createDocumentFragment();
  log.forEach((entry, index) => {
    fragment.appendChild(_buildWeightHistoryEntry(entry, index === 0, trend));
  });
  weightEl.appendChild(fragment);
}

function renderPRList() {
  const prEl = document.getElementById('ft-pr-list');
  if (!prEl) return;

  const prs = db.fitness.prs;
  prEl.innerHTML = '';

  if (!prs.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.textContent = FT('ft_no_pr');
    prEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  prs.forEach((pr, index) => fragment.appendChild(_buildPrRow(pr, index)));
  prEl.appendChild(fragment);
}

function renderFitnessSummary() {
  const host = document.getElementById('ft-summary-grid');
  if (!host) return;

  const summary = getFitnessSummary();
  const cards = [
    _buildMetricCard(
      FT('ft_summary_workouts'),
      `${summary.workoutsThisWeek}/${summary.workoutGoal}`,
      FT('ft_summary_workouts_meta', summary.totalMinutesThisWeek),
      'var(--accent3)'
    ),
    _buildMetricCard(
      FT('ft_summary_hydration'),
      `${summary.hydrationDays}/7`,
      FT('ft_summary_hydration_meta', summary.waterGoal),
      'var(--accent2)'
    ),
    _buildMetricCard(
      FT('ft_summary_sleep'),
      summary.avgSleep === null ? '—' : `${summary.avgSleep.toFixed(1)}h`,
      summary.avgSleep === null
        ? FT('ft_summary_sleep_empty', summary.sleepGoal)
        : FT('ft_summary_sleep_meta', summary.sleepGoal),
      'var(--accent)'
    ),
    _buildMetricCard(
      FT('ft_summary_steps'),
      summary.avgSteps === null ? '—' : _formatCompact(summary.avgSteps),
      summary.avgSteps === null
        ? FT('ft_summary_steps_empty', summary.stepsGoal)
        : FT('ft_summary_steps_meta', _formatCompact(summary.stepsGoal), summary.avgRecovery === null ? '—' : summary.avgRecovery.toFixed(1)),
      'var(--gold)'
    ),
  ];

  host.innerHTML = '';
  const fragment = document.createDocumentFragment();
  cards.forEach((card) => fragment.appendChild(card));
  host.appendChild(fragment);
}

function renderFitnessGoals() {
  const targets = getFitnessTargets();
  const goalWorkoutsEl = document.getElementById('ft-goal-workouts');
  const goalWaterEl = document.getElementById('ft-goal-water');
  const goalSleepEl = document.getElementById('ft-goal-sleep');
  const goalStepsEl = document.getElementById('ft-goal-steps');

  if (goalWorkoutsEl) goalWorkoutsEl.value = targets.weeklyWorkouts;
  if (goalWaterEl) goalWaterEl.value = targets.dailyWater;
  if (goalSleepEl) goalSleepEl.value = targets.sleepHours;
  if (goalStepsEl) goalStepsEl.value = targets.steps;
}

function renderFitnessCheckin() {
  const checkin = _getCheckin();
  const summary = getFitnessSummary();

  const sleepEl = document.getElementById('ft-sleep');
  const stepsEl = document.getElementById('ft-steps');
  const recoveryEl = document.getElementById('ft-recovery');
  const statusEl = document.getElementById('ft-checkin-status');

  if (sleepEl) sleepEl.value = checkin.sleepHours ?? '';
  if (stepsEl) stepsEl.value = checkin.steps ?? '';
  if (recoveryEl) recoveryEl.value = checkin.recovery ?? '';
  if (statusEl) {
    statusEl.className = summary.checkinToday ? 'tag tg' : 'tag tb';
    statusEl.textContent = summary.checkinToday ? FT('ft_checkin_status_done') : FT('ft_checkin_status_pending');
  }
}

function syncFitnessLocale() {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const setPlaceholder = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = FT(key);
  };

  setText('fitness-title-txt', `🏋 ${FT('nav_fitness')} Tracker`);
  setText('fitness-sub-txt', FT('fitness_subtitle'));
  setText('ft-log-today-lbl', FT('ft_log_today'));
  setText('ft-type-lbl', FT('ft_type'));
  setText('ft-dur-lbl', FT('ft_duration'));
  setText('ft-kcal-lbl', FT('ft_calories'));
  setText('ft-note-lbl', FT('ft_notes'));
  setText('ft-muscles-lbl', FT('ft_muscles'));
  setText('ft-log-btn', FT('ft_log_btn'));
  setText('ft-water-lbl', FT('ft_water'));
  setText('ft-add-water-btn', FT('ft_add_glass'));
  setText('ft-reset-water-btn', FT('ft_reset'));
  setText('ft-targets-lbl', FT('ft_targets'));
  setText('ft-goal-workouts-lbl', FT('ft_goal_workouts'));
  setText('ft-goal-water-lbl', FT('ft_goal_water'));
  setText('ft-goal-sleep-lbl', FT('ft_goal_sleep'));
  setText('ft-goal-steps-lbl', FT('ft_goal_steps'));
  setText('ft-save-goals-btn', FT('ft_save_goals'));
  setText('ft-checkin-lbl', FT('ft_daily_checkin'));
  setText('ft-sleep-lbl', FT('ft_sleep'));
  setText('ft-steps-lbl', FT('ft_steps'));
  setText('ft-recovery-lbl', FT('ft_recovery'));
  setText('ft-checkin-save-btn', FT('ft_save_checkin'));
  setText('ft-weight-lbl', FT('ft_weight'));
  setText('ft-pr-lbl', FT('ft_pr'));
  setText('ft-hist-lbl', FT('ft_history'));

  setPlaceholder('ft-note', 'ft_workout_notes_ph');
  setPlaceholder('ft-weight-val', 'ft_weight_ph');
  setPlaceholder('ft-sleep', 'ft_sleep_ph');
  setPlaceholder('ft-steps', 'ft_steps_ph');
  setPlaceholder('ft-recovery', 'ft_recovery_ph');

  document.querySelectorAll('#ft-type option').forEach((option) => {
    const icon = WORKOUT_ICONS[option.value] || WORKOUT_ICONS.other;
    option.textContent = `${icon} ${workoutTypeLabel(option.value)}`;
  });

  document.querySelectorAll('#ft-muscle-chips .muscle-chip').forEach((chip) => {
    const key = chip.dataset.m;
    chip.textContent = `${MUSCLE_ICONS[key] || WORKOUT_ICONS.other} ${muscleLabel(key)}`;
  });
}

function renderWaterTracker() {
  ensureFitnessState();

  const key = _safeToday();
  const target = getFitnessTargets().dailyWater;
  if ((db.fitness.water[key] || 0) > target) db.fitness.water[key] = target;
  const count = db.fitness.water[key] || 0;
  const countEl = document.getElementById('ft-water-count');
  if (countEl) countEl.textContent = `${count} / ${target}`;

  const drops = document.getElementById('ft-water-drops');
  if (!drops) return;

  drops.innerHTML = '';
  for (let i = 0; i < target; i += 1) {
    const drop = document.createElement('span');
    drop.className = `water-drop ${i < count ? 'filled' : 'empty'}`;
    drop.textContent = '💧';
    drop.addEventListener('click', () => {
      db.fitness.water[key] = i < count ? i : i + 1;
      saveDB();
      renderWaterTracker();
      renderFitnessSummary();
      _refreshFitnessLinkedViews();
    });
    drops.appendChild(drop);
  }
}

function _bindMuscleChipInteractions() {
  document.querySelectorAll('#ft-muscle-chips .muscle-chip').forEach((chip) => {
    if (chip.dataset.bound === '1') return;
    chip.dataset.bound = '1';
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
}

function _refreshFitnessLinkedViews() {
  if (typeof EventBus !== 'undefined' && EventBus?.emit) {
    EventBus.emit('fitness:changed');
  }
  if (typeof renderLifeAreas === 'function') renderLifeAreas();
}

function _emitFitnessActivity(action, itemName = '', detail = '', icon = 'ðŸ‹') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', {
    moduleId: 'fitness',
    section: 'fitness',
    action,
    itemName,
    detail,
    icon,
  });
}

function renderFitness() {
  ensureFitnessState();
  syncFitnessLocale();
  renderFitnessSummary();
  renderWaterTracker();
  renderFitnessGoals();
  renderFitnessCheckin();
  renderWorkoutHistory();
  renderWeightHistory();
  renderPRList();
  _bindMuscleChipInteractions();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
}

function addWater() {
  ensureFitnessState();
  const key = _safeToday();
  const target = getFitnessTargets().dailyWater;
  const previous = Math.min(target, db.fitness.water[key] || 0);
  db.fitness.water[key] = Math.min(target, previous + 1);

  if (db.fitness.water[key] === target && previous < target) {
    addXP(10);
    notify(FT('ft_water_done', target), '💧', 'xp');
    _emitFitnessActivity('completed', FT('ft_water'), `${target}/${target}`, 'ðŸ’§');
    if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  }

  saveDB();
  renderWaterTracker();
  renderFitnessSummary();
  _refreshFitnessLinkedViews();
}

function resetWater() {
  ensureFitnessState();
  db.fitness.water[_safeToday()] = 0;
  saveDB();
  renderWaterTracker();
  renderFitnessSummary();
}

function logWorkout() {
  const duration = _optionalInteger(document.getElementById('ft-duration')?.value, 1, 600);
  if (!duration) {
    notify(FT('ft_enter_duration'), '⚠', 'info');
    return;
  }

  const type = document.getElementById('ft-type')?.value || 'other';
  const kcal = _optionalInteger(document.getElementById('ft-kcal')?.value, 0, 10000) || 0;
  const note = (document.getElementById('ft-note')?.value || '').trim().slice(0, 200);
  const muscles = Array.from(document.querySelectorAll('#ft-muscle-chips .muscle-chip.active')).map((chip) => chip.dataset.m);

  const effectiveDuration = Math.min(duration, 90);
  const xp = Math.round(effectiveDuration * 1.5);

  ensureFitnessState();
  db.fitness.workouts.unshift({
    date: _safeToday(),
    type,
    duration,
    kcal,
    note,
    muscles,
    xp,
  });

  addLifeAreaXP('fitness', Math.round(duration * 0.5));
  addLifeAreaXP('salute', 10);
  addXP(xp);

  document.getElementById('ft-duration').value = '';
  document.getElementById('ft-kcal').value = '';
  document.getElementById('ft-note').value = '';
  document.querySelectorAll('#ft-muscle-chips .muscle-chip').forEach((chip) => chip.classList.remove('active'));

  saveDB();
  renderFitness();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('logged', FT('ft_log'), `${duration} min`, '🏋');
  notify(FT('ft_workout_done', duration, xp), '🏋', 'xp');
}

function logWeight() {
  const weight = _optionalFloat(document.getElementById('ft-weight-val')?.value, 20, 500);
  if (!weight) {
    notify(FT('ft_enter_valid_weight'), '⚠', 'info');
    return;
  }

  ensureFitnessState();
  db.fitness.weightLog.unshift({ date: _safeToday(), weight });
  addLifeAreaXP('salute', 5);
  addXP(5);

  document.getElementById('ft-weight-val').value = '';
  saveDB();
  renderFitness();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('logged', FT('ft_weight'), `${weight}`, '⚖️');
  notify(FT('ft_weight_done', weight), '⚖️', 'info');
}

function saveFitnessCheckin() {
  const sleepHours = _optionalFloat(document.getElementById('ft-sleep')?.value, 0, 24);
  const steps = _optionalInteger(document.getElementById('ft-steps')?.value, 0, 50000);
  const recovery = _optionalInteger(document.getElementById('ft-recovery')?.value, 1, 10);
  const nextCheckin = { sleepHours, steps, recovery };

  if (!_hasMeaningfulCheckin(nextCheckin)) {
    notify(FT('ft_enter_checkin'), '⚠', 'info');
    return;
  }

  ensureFitnessState();
  const key = _safeToday();
  const hadCheckin = _hasMeaningfulCheckin(_getCheckin(key));
  db.fitness.checkins[key] = nextCheckin;

  if (!hadCheckin) {
    addLifeAreaXP('salute', 8);
    addXP(8);
  }

  saveDB();
  renderFitness();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('updated', FT('ft_checkin'), '', '🌙');
  notify(FT('ft_checkin_saved'), '🌙', 'info');
}

function saveFitnessGoals() {
  const weeklyWorkouts = _optionalInteger(document.getElementById('ft-goal-workouts')?.value, 1, 14);
  const dailyWater = _optionalInteger(document.getElementById('ft-goal-water')?.value, 4, 12);
  const sleepHours = _optionalFloat(document.getElementById('ft-goal-sleep')?.value, 4, 12);
  const steps = _optionalInteger(document.getElementById('ft-goal-steps')?.value, 1000, 40000);

  if ([weeklyWorkouts, dailyWater, sleepHours, steps].some((value) => value === null)) {
    notify(FT('ft_invalid_goals'), '⚠', 'info');
    return;
  }

  ensureFitnessState();
  db.fitness.goals = { weeklyWorkouts, dailyWater, sleepHours, steps };
  db.fitness.water[_safeToday()] = Math.min(db.fitness.water[_safeToday()] || 0, dailyWater);

  saveDB();
  renderFitness();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('updated', FT('ft_goals'), '', '🎯');
  notify(FT('ft_goals_saved'), '🎯', 'info');
}

async function addPR() {
  const exercise = await InputModal.show({
    title: FT('ft_pr_exercise_prompt'),
    placeholder: FT('ft_pr_name_ph'),
    type: 'text',
  });
  if (!exercise) return;

  const exerciseCheck = typeof InputValidator !== 'undefined'
    ? InputValidator.validateName(exercise, FT('field_name'))
    : { valid: true, value: exercise.toString().trim() };
  if (!exerciseCheck.valid) {
    notify(exerciseCheck.error, '⚠', 'info');
    return;
  }

  const value = await InputModal.show({
    title: FT('ft_pr_value_prompt'),
    placeholder: FT('ft_pr_val_ph'),
    type: 'text',
  });
  if (!value) return;

  const unit = await InputModal.show({
    title: FT('ft_pr_unit_prompt'),
    placeholder: 'kg',
    type: 'text',
    defaultVal: 'kg',
  });

  ensureFitnessState();
  db.fitness.prs.push({
    exercise: exerciseCheck.value,
    value: value.toString().trim(),
    unit: (unit || 'kg').toString().trim(),
  });

  addXP(20);
  saveDB();
  renderFitness();
  if (typeof checkFitnessAchievements === 'function') checkFitnessAchievements();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('logged', exerciseCheck.value, value.toString().trim(), '🏆');
  notify(FT('ft_pr_added', exerciseCheck.value), '🏆', 'xp');
}

function deletePR(index) {
  ensureFitnessState();
  const deleted = db.fitness.prs[index];
  db.fitness.prs.splice(index, 1);
  saveDB();
  renderFitness();
  _refreshFitnessLinkedViews();
  _emitFitnessActivity('deleted', deleted?.exercise || FT('ft_pr'), '', '🏆');
}

const FitnessManager = {
  renderStats: renderFitness,
  renderWater: renderWaterTracker,
  addWater,
  resetWater,
  logWorkout,
  logWeight,
  addPR,
  deletePR,
  saveCheckin: saveFitnessCheckin,
  saveGoals: saveFitnessGoals,
  getSummary: getFitnessSummary,
  getTargets: getFitnessTargets,
};

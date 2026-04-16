// habits.js
// Habit, identity, and goal CRUD helpers.
//
// Depends on:
//   constants.js (generateId, ICONS, COLORS)
//   db.js (db, saveDB, today)
//   security.js (InputValidator, escapeHtml, escapeAttr)
//   toast.js (notify)
//   modals.js (openModal, closeModal, ConfirmModal, buildIconPicker, buildColorPicker)
//   entity-logic.js (checkAch)
//   ui-core-xp.js (addXP)
//   rpg.js (updateIdentityScore)
//   ui-core-habits.js (_alignHash, _questsHash, _markHabTabsDirty)
//   eventbus.js (EventBus)

function habitT(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function getLiteHabitMode() {
  return globalThis.AxiomLite?.enabled ? globalThis.AxiomLite : null;
}

function habitLiteUpgradeCopy() {
  const lang = db?.settings?.lang || I18n?.lang || 'en';
  if (typeof globalThis.AxiomLite?.getUpgradeCopy === 'function') return globalThis.AxiomLite.getUpgradeCopy();
  return lang === 'it'
    ? {
      title: 'Disponibile nella versione completa',
      limitTitle: 'Limite Lite raggiunto',
      cta: 'Vai al full'
    }
    : {
      title: 'Available in the full version',
      limitTitle: 'Lite limit reached',
      cta: 'View full version'
    };
}

function habitPromptLiteUpgrade(feature, fallback, options = {}) {
  const lite = getLiteHabitMode();
  if (!lite) return false;
  if (!options.force && lite.canUseFeature?.(feature) !== false) return false;

  const message = lite.featureMessage(feature, fallback);
  const copy = habitLiteUpgradeCopy();
  if (typeof ConfirmModal?.show === 'function') {
    Promise.resolve(ConfirmModal.show({
      title: options.title || copy.title,
      body: options.body || message,
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

function habitLiteBlocked(feature, fallback) {
  return habitPromptLiteUpgrade(feature, fallback);
}

function habitClear(node) {
  if (node) node.replaceChildren();
}

function habitEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'dim small';
  div.textContent = text;
  return div;
}

function habitAppendDefaultOption(select, label) {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = label;
  select.appendChild(option);
}

function habitTag(className, text) {
  const span = document.createElement('span');
  span.className = `tag ${className}`;
  span.textContent = text;
  return span;
}

function habitIconText(icon, text) {
  const span = document.createElement('span');
  if (icon) span.append(`${icon} `);
  span.append(text);
  return span;
}

function habitSvgCircle(attrs) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  Object.entries(attrs).forEach(([key, value]) => circle.setAttribute(key, String(value)));
  return circle;
}

function buildIdentityCard(identity) {
  const score = calcIdentityScore(identity.id);
  identity.score = score;

  const phase = score < 25
    ? habitT('identity_phase_beginner', 'Beginner')
    : score < 50
      ? habitT('identity_phase_builder', 'Builder')
      : score < 75
        ? habitT('identity_phase_master', 'Master')
        : habitT('identity_phase_elite', 'Elite');
  const phaseCol = score < 25
    ? 'var(--text3)'
    : score < 50
      ? 'var(--accent2)'
      : score < 75
        ? 'var(--gold)'
        : 'var(--accent)';
  const linkedHabits = db.habits.filter((habit) => habit.identityId === identity.id);
  const driftAlert = score < 30 && identity.history && identity.history.length > 7;
  const circ = 2 * Math.PI * 28;
  const offset = circ - (score / 100) * circ;

  const card = document.createElement('div');
  card.className = 'id-card';

  const layout = document.createElement('div');
  layout.style.cssText = 'display:flex;gap:14px;align-items:flex-start;';

  const ringWrap = document.createElement('div');
  ringWrap.className = 'id-score-ring';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.append(
    habitSvgCircle({ class: 'ring-bg', cx: 32, cy: 32, r: 28 }),
    habitSvgCircle({
      class: 'ring-fill',
      cx: 32,
      cy: 32,
      r: 28,
      stroke: phaseCol,
      'stroke-dasharray': circ,
      'stroke-dashoffset': offset
    })
  );
  const ringNum = document.createElement('div');
  ringNum.className = 'ring-num';
  ringNum.style.color = phaseCol;
  ringNum.textContent = String(score);
  ringWrap.append(svg, ringNum);

  const content = document.createElement('div');
  content.style.flex = '1';

  const heading = document.createElement('div');
  heading.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px;';
  const icon = document.createElement('span');
  icon.style.fontSize = '22px';
  icon.textContent = identity.icon || '🧬';
  const titleWrap = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:16px;font-weight:800';
  nameEl.textContent = identity.name || '';
  const phaseEl = document.createElement('div');
  phaseEl.style.cssText = `font-size:11px;color:${phaseCol};font-weight:700`;
  phaseEl.textContent = `${phase}${identity.trend ? ` ${identity.trend}` : ''}`;
  titleWrap.append(nameEl, phaseEl);
  heading.append(icon, titleWrap);
  content.appendChild(heading);

  if (identity.desc) {
    const desc = document.createElement('div');
    desc.className = 'dim small mb2';
    desc.textContent = identity.desc;
    content.appendChild(desc);
  }

  if (Array.isArray(identity.values) && identity.values.length) {
    const values = document.createElement('div');
    values.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;';
    identity.values.forEach((value) => values.appendChild(habitTag('tg', value)));
    content.appendChild(values);
  }

  const meta = document.createElement('div');
  meta.className = 'small dim';
  meta.textContent = `${habitT('identity_live_score', (value) => `You are living this identity at ${value}%`, score)} - ${habitT('identity_linked_habits', (count) => `${count} linked habits`, linkedHabits.length)}`;
  content.appendChild(meta);

  if (driftAlert) {
    const alert = document.createElement('div');
    alert.className = 'mt2';
    alert.style.cssText = 'color:var(--red);font-size:11px;font-weight:700';
    alert.textContent = habitT('identity_drift_alert', 'Identity drift detected. Take action today.');
    content.appendChild(alert);
  }

  layout.append(ringWrap, content);
  card.appendChild(layout);

  const actions = document.createElement('div');
  actions.className = 'id-card-actions';
  actions.style.cssText = 'display:flex;gap:6px;margin-top:12px;';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-ghost btn-xs';
  editBtn.textContent = habitT('btn_edit', 'Edit');
  editBtn.addEventListener('click', () => editIdentity(identity.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger btn-xs';
  deleteBtn.textContent = habitT('btn_delete', 'Delete');
  deleteBtn.addEventListener('click', () => deleteIdentity(identity.id));

  actions.append(editBtn, deleteBtn);
  card.appendChild(actions);
  return card;
}

function renderDirectionSummary(direction) {
  const dir = document.getElementById('dir-display');
  habitClear(dir);
  if (!direction.who && !direction.y1 && !direction.y5) return;

  if (direction.who) {
    const whoWrap = document.createElement('div');
    whoWrap.className = 'mb3';
    const whoTag = habitTag('tg mb2', habitT('direction_who_label', 'Who I want to become'));
    const whoText = document.createElement('div');
    whoText.className = 'small mt2';
    whoText.style.lineHeight = '1.6';
    whoText.textContent = direction.who;
    whoWrap.append(whoTag, whoText);
    dir.appendChild(whoWrap);
  }

  const grid = document.createElement('div');
  grid.className = 'g2';
  if (direction.y1) {
    const year1 = document.createElement('div');
    const tag1 = habitTag('tb', habitT('direction_1_year', '1 Year'));
    const text1 = document.createElement('div');
    text1.className = 'small mt2';
    text1.textContent = direction.y1;
    year1.append(tag1, text1);
    grid.appendChild(year1);
  }
  if (direction.y5) {
    const year5 = document.createElement('div');
    const tag5 = habitTag('ty', habitT('direction_5_year', '5 Years'));
    const text5 = document.createElement('div');
    text5.className = 'small mt2';
    text5.textContent = direction.y5;
    year5.append(tag5, text5);
    grid.appendChild(year5);
  }
  if (grid.childNodes.length) dir.appendChild(grid);
}

function buildGoalCard(goal) {
  const identity = db.identities.find((item) => item.id === goal.identityId);
  const done = (goal.milestones || []).filter((milestone) => milestone.done).length;
  const pct = goal.milestones?.length ? Math.round((done / goal.milestones.length) * 100) : goal.progress || 0;
  const dl = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const linkedHabits = db.habits.filter((habit) => habit.goalId === goal.id);

  const card = document.createElement('div');
  card.className = 'card mb3';

  const header = document.createElement('div');
  header.className = 'sh-card';
  const left = document.createElement('div');
  const name = document.createElement('div');
  name.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:4px';
  name.textContent = goal.name || '';
  left.appendChild(name);
  if (identity) {
    const tag = habitTag('tg', '');
    tag.textContent = `${identity.icon || '🧬'} ${identity.name || ''}`;
    left.appendChild(tag);
  }

  const right = document.createElement('div');
  right.style.textAlign = 'right';
  const pctEl = document.createElement('div');
  pctEl.style.cssText = 'font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--accent)';
  pctEl.textContent = `${pct}%`;
  right.appendChild(pctEl);
  if (dl !== null) {
    const due = document.createElement('div');
    due.className = 'dim';
    due.style.fontSize = '10px';
    due.textContent = dl > 0 ? habitT('goals_days_left', (days) => `${days}d`, dl) : habitT('goals_expired', 'Expired');
    right.appendChild(due);
  }
  header.append(left, right);
  card.appendChild(header);

  if (goal.desc) {
    const desc = document.createElement('div');
    desc.className = 'dim small mb3';
    desc.textContent = goal.desc;
    card.appendChild(desc);
  }

  const pbar = document.createElement('div');
  pbar.className = 'pbar mb3';
  const pbarFill = document.createElement('div');
  pbarFill.className = 'pbar-fill';
  pbarFill.style.width = `${pct}%`;
  pbarFill.style.background = 'linear-gradient(90deg,var(--accent2),var(--accent))';
  pbar.appendChild(pbarFill);
  card.appendChild(pbar);

  if (goal.milestones?.length) {
    const title = document.createElement('div');
    title.className = 'small bold mb2';
    title.textContent = habitT('goals_milestones', 'Milestones');
    card.appendChild(title);

    goal.milestones.forEach((milestone, index) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';

      const toggle = document.createElement('div');
      toggle.className = 'habit-check goal-milestone';
      toggle.dataset.gid = goal.id;
      toggle.dataset.idx = String(index);
      toggle.style.cssText = 'width:20px;height:20px;font-size:10px;cursor:pointer;';
      if (milestone.done) {
        toggle.style.background = 'var(--accent)';
        toggle.style.borderColor = 'var(--accent)';
        toggle.style.color = '#000';
        toggle.textContent = 'OK';
      }
      toggle.addEventListener('click', () => toggleMilestone(goal.id, index));

      const text = document.createElement('div');
      text.className = `small${milestone.done ? ' dim' : ''}`;
      if (milestone.done) text.style.textDecoration = 'line-through';
      text.textContent = milestone.text || '';

      row.append(toggle, text);
      card.appendChild(row);
    });
  }

  const linked = document.createElement('div');
  linked.className = 'dim';
  linked.style.cssText = 'font-size:10px;margin-top:8px';
  linked.textContent = habitT('goals_linked_habits', (count) => `${count} linked habits`, linkedHabits.length);
  card.appendChild(linked);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:10px;';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger btn-xs goal-delete';
  deleteBtn.dataset.gid = goal.id;
  deleteBtn.textContent = habitT('btn_delete', 'Delete');
  deleteBtn.addEventListener('click', () => deleteGoal(goal.id));
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
}

// Habit CRUD
function normalizeHabitModalDays(days) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const normalized = days
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return normalized.length ? normalized : null;
}

function populateHabitModal(h = null) {
  document.getElementById('mh-title').textContent = h
    ? `✏ ${habitT('edit_habit', 'Edit Habit')}`
    : `✅ ${habitT('new_habit', 'New Habit')}`;
  document.getElementById('mh-id').value = h?.id || '';
  document.getElementById('mh-name').value = h?.name || '';
  document.getElementById('mh-cat').value = h?.cat || 'salute';
  document.getElementById('mh-type').value = h?.type || 'boolean';
  document.getElementById('mh-diff').value = h?.difficulty || 1;
  document.getElementById('mh-trigger').value = h?.trigger || '';
  document.getElementById('mh-target').value = h?.target || '';

  const normalizedDays = normalizeHabitModalDays(h?.days);
  document.querySelectorAll('#mh-days .day-cb').forEach((cb, index) => {
    cb.classList.toggle('on', !h || !normalizedDays || normalizedDays.includes(index));
    cb.onclick = () => cb.classList.toggle('on');
  });

  const idSel = document.getElementById('mh-id-link');
  habitClear(idSel);
  habitAppendDefaultOption(idSel, habitT('habit_none', 'None'));
  db.identities.forEach((identity) => {
    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = `${identity.icon || '🧬'} ${identity.name}`;
    if (h?.identityId === identity.id) option.selected = true;
    idSel.appendChild(option);
  });

  const goalSel = document.getElementById('mh-goal-link');
  habitClear(goalSel);
  habitAppendDefaultOption(goalSel, habitT('habit_none', 'None'));
  db.goals.forEach((goal) => {
    const option = document.createElement('option');
    option.value = goal.id;
    option.textContent = goal.name;
    if (h?.goalId === goal.id) option.selected = true;
    goalSel.appendChild(option);
  });

  selIcon = h?.icon || ICONS[0];
  selColor = h?.color || COLORS[0];
  buildIconPicker('mh-ip', (icon) => { selIcon = icon; }, selIcon);
  buildColorPicker('mh-cp', (color) => { selColor = color; }, selColor);
}

function saveHabit() {
  const nameInput = document.getElementById('mh-name').value;
  const nameResult = InputValidator.validateName(nameInput, habitT('habit_name', 'Habit name'));
  if (!nameResult.valid) {
    notify(nameResult.error, '⚠', 'info');
    return;
  }

  const triggerInput = document.getElementById('mh-trigger').value.trim();
  const triggerResult = triggerInput
    ? InputValidator.validateName(triggerInput, habitT('habit_trigger', 'Trigger'))
    : { valid: true, value: '' };
  if (!triggerResult.valid) {
    notify(triggerResult.error, '⚠', 'info');
    return;
  }

  const days = Array.from(document.querySelectorAll('#mh-days .day-cb.on'))
    .map((cb) => parseInt(cb.dataset.d, 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  const normalizedDays = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  const existingId = document.getElementById('mh-id').value;

  const colorResult = InputValidator.validateColor(selColor);
  const iconResult = InputValidator.validateIcon(selIcon);
  const diffResult = InputValidator.validateInt(document.getElementById('mh-diff').value, 1, 4);
  const existingHabit = existingId ? db.habits.find((habit) => habit.id === existingId) : null;
  const lite = getLiteHabitMode();
  if (!existingId && lite) {
    const maxHabits = lite.getMaxHabits?.() || 5;
    if ((Array.isArray(db.habits) ? db.habits.length : 0) >= maxHabits) {
      habitPromptLiteUpgrade(
        'habitsLimit',
        `Lite includes up to ${maxHabits} habits. Upgrade to unlock more.`,
        { force: true, title: habitLiteUpgradeCopy().limitTitle }
      );
      return;
    }
  }

  const habit = {
    id: existingId || generateId('h'),
    name: nameResult.value,
    icon: iconResult.value,
    color: colorResult.value,
    cat: document.getElementById('mh-cat').value,
    type: document.getElementById('mh-type').value,
    difficulty: diffResult.value,
    trigger: triggerResult.value,
    target: document.getElementById('mh-target').value.trim().slice(0, 50),
    days: normalizedDays,
    identityId: document.getElementById('mh-id-link').value,
    goalId: document.getElementById('mh-goal-link').value,
    streak: existingHabit?.streak || 0,
    bestStreak: existingHabit?.bestStreak || 0,
    createdAt: existingHabit?.createdAt || today()
  };

  if (existingId) {
    const index = db.habits.findIndex((item) => item.id === existingId);
    if (index !== -1) db.habits[index] = habit;
  } else {
    db.habits.push(habit);
    checkAch('first_habit');
    if (db.habits.length >= 5) checkAch('habits_5');
    if (db.habits.length >= 10) checkAch('habits_10');
  }

  _markHabTabsDirty();
  _alignHash = '';
  _questsHash = '';
  _laHash = '';
  _attrHash = '';
  _rwHash = '';
  saveDB();
  closeModal('m-add-habit');
  generateDailyQuests();
  EventBus.emit('habits:changed', { habitId: habit.id, habitName: habit.name, action: existingId ? 'updated' : 'created' });
  notify(I18n.t(existingId ? 'habit_updated' : 'habit_saved'), '✅', 'info');
}

function editHabit(id) {
  populateHabitModal(db.habits.find((habit) => habit.id === id));
  openModal('m-add-habit');
}

async function deleteHabit(id) {
  const deletedHabit = db.habits.find((habit) => habit.id === id);
  const ok = await ConfirmModal.show({
    title: habitT('habit_delete_title', 'Delete habit?'),
    body: habitT('habit_delete_body', 'Streaks and completions will remain in the historical data.'),
    icon: '🗑',
    okLabel: habitT('btn_delete', 'Delete')
  });
  if (!ok) return;

  db.habits = db.habits.filter((habit) => habit.id !== id);
  _markHabTabsDirty();
  saveDB();
  EventBus.emit('habits:changed', { habitId: id, habitName: deletedHabit?.name || '', action: 'deleted' });
}

// Identity
function populateIdModal(identity = null) {
  document.getElementById('mid-id').value = identity?.id || '';
  document.getElementById('mid-name').value = identity?.name || '';
  document.getElementById('mid-desc').value = identity?.desc || '';
  document.getElementById('mid-vals').value = identity?.values?.join(', ') || '';
  selIdIcon = identity?.icon || '🧬';
  buildIconPicker('mid-ip', (icon) => { selIdIcon = icon; }, selIdIcon);
}

function saveIdentity() {
  if (habitLiteBlocked('identity', 'Identity is part of the full version.')) return;
  const nameResult = InputValidator.validateName(
    document.getElementById('mid-name').value,
    habitT('identity_name', 'Identity name')
  );
  if (!nameResult.valid) {
    notify(nameResult.error, '⚠', 'info');
    return;
  }

  const name = nameResult.value;
  const existingId = document.getElementById('mid-id').value;
  const existingIdentity = existingId ? db.identities.find((item) => item.id === existingId) : null;
  const identity = {
    id: existingId || generateId('id'),
    name,
    icon: selIdIcon,
    desc: document.getElementById('mid-desc').value,
    values: document.getElementById('mid-vals').value.split(',').map((value) => value.trim()).filter(Boolean),
    score: existingIdentity?.score || 0,
    history: existingIdentity?.history || [],
    createdAt: existingIdentity?.createdAt || today()
  };

  if (existingId) {
    const index = db.identities.findIndex((item) => item.id === existingId);
    if (index !== -1) db.identities[index] = identity;
  } else {
    db.identities.push(identity);
    checkAch('first_id');
  }

  saveDB();
  closeModal('m-add-id');
  EventBus.emit('identity:changed', { identityId: identity.id, identityName: identity.name, action: existingId ? 'updated' : 'created' });
  notify(I18n.t('identity_saved'), '🧬', 'info');
}

function calcIdentityScore(identityId) {
  const linkedHabits = db.habits.filter((habit) => habit.identityId === identityId);
  if (linkedHabits.length === 0) return 0;

  let total = 0;
  let count = 0;
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = toKey(date);
    const done = linkedHabits.filter((habit) => db.completions[key]?.[habit.id]).length;
    total += done / linkedHabits.length;
    count += 1;
  }
  return Math.min(99, Math.round((total / count) * 100));
}

function updateIdentityScore(identityId) {
  const identity = db.identities.find((item) => item.id === identityId);
  if (!identity) return;

  const prev = identity.score || 0;
  identity.score = calcIdentityScore(identityId);
  if (!identity.history) identity.history = [];
  identity.history.push({ date: today(), score: identity.score });
  if (identity.history.length > 90) identity.history.shift();
  identity.trend = identity.score >= prev ? '↑' : '↓';
}

function renderIdentities() {
  const list = document.getElementById('id-list');
  habitClear(list);
  if (db.identities.length === 0) {
    list.appendChild(habitEmptyState(I18n.t('identity_none')));
  } else {
    const fragment = document.createDocumentFragment();
    db.identities.forEach((identity) => fragment.appendChild(buildIdentityCard(identity)));
    list.appendChild(fragment);
  }

  renderDirectionSummary(db.direction);
}
function editIdentity(id) {
  populateIdModal(db.identities.find((identity) => identity.id === id));
  openModal('m-add-id');
}

async function deleteIdentity(id) {
  const ok = await ConfirmModal.show({
    title: habitT('identity_delete_title', 'Delete identity?'),
    body: habitT('identity_delete_body', 'Linked habits will not be deleted.'),
    icon: '🧬',
    okLabel: habitT('btn_delete', 'Delete')
  });
  if (!ok) return;

  db.identities = db.identities.filter((identity) => identity.id !== id);
  saveDB();
  EventBus.emit('identity:changed', { identityId: id, identityName: '', action: 'deleted' });
}

function saveDirection() {
  db.direction = {
    who: document.getElementById('md-who').value,
    y1: document.getElementById('md-1y').value,
    y5: document.getElementById('md-5y').value
  };
  saveDB();
  closeModal('m-direction');
  EventBus.emit('identity:changed', { action: 'direction' });
  notify(I18n.t('direction_saved'), '🧭', 'info');
}

// Goals
function populateGoalModal() {
  const select = document.getElementById('mg-id');
  habitClear(select);
  habitAppendDefaultOption(select, habitT('habit_none', 'None'));
  db.identities.forEach((identity) => {
    const option = document.createElement('option');
    option.value = identity.id;
    option.textContent = identity.name;
    select.appendChild(option);
  });
  document.getElementById('mg-name').value = '';
  document.getElementById('mg-desc').value = '';
  document.getElementById('mg-dead').value = '';
  document.getElementById('mg-miles').value = '';
}

function saveGoal() {
  if (habitLiteBlocked('goals', 'Goals are part of the full version.')) return;
  const name = document.getElementById('mg-name').value.trim();
  if (!name) {
    notify(I18n.t('goal_name_required'), '⚠', 'info');
    return;
  }

  const miles = document.getElementById('mg-miles').value
    .split('\n')
    .filter(Boolean)
    .map((text) => ({ text: text.trim(), done: false }));

  db.goals.push({
    id: generateId('g'),
    name,
    desc: document.getElementById('mg-desc').value,
    identityId: document.getElementById('mg-id').value,
    deadline: document.getElementById('mg-dead').value,
    milestones: miles,
    progress: 0,
    createdAt: today()
  });

  checkAch('first_goal');
  saveDB();
  closeModal('m-add-goal');
  EventBus.emit('goals:changed', { goalId: db.goals[db.goals.length - 1].id, goalName: name, action: 'created' });
  notify(I18n.t('goal_created'), '🎯', 'info');
}

function renderGoals() {
  const list = document.getElementById('goals-list');
  habitClear(list);
  if (db.goals.length === 0) {
    list.appendChild(habitEmptyState(I18n.t('goals_empty')));
    return;
  }

  const fragment = document.createDocumentFragment();
  db.goals.forEach((goal) => fragment.appendChild(buildGoalCard(goal)));
  list.appendChild(fragment);
}
function toggleMilestone(goalId, idx) {
  const goal = db.goals.find((item) => item.id === goalId);
  if (!goal) return;

  goal.milestones[idx].done = !goal.milestones[idx].done;
  if (goal.milestones[idx].done) addXP(30);
  goal.progress = Math.round((goal.milestones.filter((milestone) => milestone.done).length / goal.milestones.length) * 100);
  saveDB();
  EventBus.emit('goals:changed', { goalId, goalName: goal.name, action: 'milestone' });
}

async function deleteGoal(id) {
  const goal = db.goals.find((item) => item.id === id);
  const ok = await ConfirmModal.show({
    title: habitT('goal_delete_title', 'Delete goal?'),
    body: habitT('goal_delete_body', 'Associated milestones will be lost.'),
    icon: '🗑',
    okLabel: habitT('btn_delete', 'Delete')
  });
  if (!ok) return;

  db.goals = db.goals.filter((goal) => goal.id !== id);
  saveDB();
  EventBus.emit('goals:changed', { goalId: id, goalName: goal?.name || '', action: 'deleted' });
}

// Namespace: HabitManager
// The original function names remain global so legacy entrypoints keep working.
const HabitManager = {
  save: saveHabit,
  edit: editHabit,
  delete: deleteHabit,
  populate: populateHabitModal,
  saveIdentity,
  editIdentity,
  deleteIdentity,
  renderIdentities,
  saveDirection,
  saveGoal,
  renderGoals,
  deleteGoal,
  toggleMilestone,
};



// ================================================================
// experiments.js - Habit experiment tracking
//
// Depends on:
//   constants.js (generateId, APP_CONSTANTS)
//   db.js (db, saveDB, today, toKey)
//   toast.js (notify)
//   modals.js (closeModal, ConfirmModal)
//   security.js (escapeHtml)
//   ui-core-xp.js / stats.js (addXP, checkAch)
// ================================================================

function expt(key, fallback, ...args) {
  if (typeof I18n !== 'undefined') return I18n.t(key, ...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

function emitExperimentActivity(action, itemName = '', detail = '', icon = '🧪') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', {
    moduleId: 'experiments',
    section: 'experiments',
    action,
    itemName,
    detail,
    icon,
  });
  EventBus.emit('experiments:changed', { action, itemName, detail });
}

function expClear(node) {
  if (node) node.replaceChildren();
}

function expEmptyState(text) {
  const div = document.createElement('div');
  div.className = 'dim small';
  div.textContent = text;
  return div;
}

function buildExperimentCard(exp) {
  const start = new Date(exp.startDate);
  const end = new Date(exp.endDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
  const progress = Math.min(100, Math.round(((now - start) / (end - start)) * 100));
  const ended = now > end;

  if (ended && exp.active) {
    exp.active = false;
    exp.results = autoEvaluateExperiment(exp);
    saveDB();
  }

  const linkedHabit = db.habits.find((habit) => habit.id === exp.habitId);
  const card = document.createElement('div');
  card.className = 'card mb3';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;';
  const title = document.createElement('div');
  title.className = 'title-lg';
  title.textContent = exp.name || '';
  const badge = document.createElement('span');
  badge.className = `tag ${exp.active ? 'tb' : 'tg'}`;
  badge.textContent = exp.active ? `${daysLeft}d` : expt('experiments_completed', 'Completed');
  header.append(title, badge);
  card.appendChild(header);

  if (exp.hypothesis) {
    const hypothesis = document.createElement('div');
    hypothesis.className = 'dim small mb3';
    hypothesis.textContent = exp.hypothesis;
    card.appendChild(hypothesis);
  }

  if (linkedHabit) {
    const linked = document.createElement('div');
    linked.className = 'small mb3';
    linked.textContent = `${linkedHabit.icon || '✅'} ${linkedHabit.name || ''}`;
    card.appendChild(linked);
  }

  const range = document.createElement('div');
  range.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px;';
  const startEl = document.createElement('span');
  startEl.textContent = exp.startDate || '';
  const endEl = document.createElement('span');
  endEl.textContent = exp.endDate || '';
  range.append(startEl, endEl);
  card.appendChild(range);

  const pbar = document.createElement('div');
  pbar.className = 'pbar mb3';
  const fill = document.createElement('div');
  fill.className = 'pbar-fill';
  fill.style.width = `${progress}%`;
  fill.style.background = 'var(--accent2)';
  pbar.appendChild(fill);
  card.appendChild(pbar);

  if (exp.results) {
    const insight = document.createElement('div');
    insight.className = 'insight-chip';
    const icon = document.createElement('div');
    icon.className = 'insight-ic';
    icon.textContent = 'Lab';
    const text = document.createElement('div');
    text.className = 'insight-txt';
    text.textContent = exp.results;
    insight.append(icon, text);
    card.appendChild(insight);
  }

  if (exp.active) {
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

    const finishBtn = document.createElement('button');
    finishBtn.type = 'button';
    finishBtn.className = 'btn btn-ghost btn-xs';
    finishBtn.textContent = expt('experiments_finish', 'Finish');
    finishBtn.addEventListener('click', () => endExp(exp.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-danger btn-xs';
    deleteBtn.textContent = expt('btn_delete', 'Delete');
    deleteBtn.setAttribute('aria-label', expt('btn_delete', 'Delete'));
    deleteBtn.addEventListener('click', () => delExp(exp.id));

    actions.append(finishBtn, deleteBtn);
    card.appendChild(actions);
  }

  return card;
}
function populateExpModal() {
  const select = document.getElementById('me-hab');
  expClear(select);
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = expt('experiments_none_option', 'None');
  select.appendChild(placeholder);
  db.habits.forEach((habit) => {
    const option = document.createElement('option');
    option.value = habit.id;
    option.textContent = `${habit.icon} ${habit.name}`;
    select.appendChild(option);
  });
  document.getElementById('me-name').value = '';
  document.getElementById('me-hyp').value = '';
}
function saveExperiment() {
  const name = document.getElementById('me-name').value.trim();
  if (!name) {
    notify(expt('experiments_name_required', 'Enter a name!'), '⚠', 'info');
    return;
  }

  const duration = parseInt(document.getElementById('me-dur').value, 10);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + duration);

  if (!db.experiments) db.experiments = [];
  db.experiments.push({
    id: generateId('exp'),
    name,
    hypothesis: document.getElementById('me-hyp').value,
    habitId: document.getElementById('me-hab').value,
    duration,
    startDate: today(),
    endDate: toKey(endDate),
    active: true,
    results: null,
  });

  checkAch('experiment_1');
  saveDB();
  closeModal('m-add-exp');
  renderExperiments();
  emitExperimentActivity('created', name, `${duration}d`);
  notify(expt('experiments_started', 'Experiment started!'), '🧪', 'info');
}

function autoEvaluateExperiment(exp) {
  const habit = db.habits.find((item) => item.id === exp.habitId);
  if (!habit) return expt('experiments_habit_missing', 'Habit not found.');

  const dates = [];
  const start = new Date(exp.startDate);
  const end = new Date(exp.endDate);
  let day = new Date(start);
  while (day <= end) {
    dates.push(toKey(day));
    day.setDate(day.getDate() + 1);
  }

  const completed = dates.filter((key) => db.completions[key]?.[exp.habitId]).length;
  const rate = Math.round((completed / dates.length) * 100);
  const success = rate >= 70;

  return `${success ? `✅ ${expt('experiments_success', 'Success')}` : `⚠ ${expt('experiments_needs_work', 'Needs work')}`} - `
    + `Completed ${completed}/${dates.length} days (${rate}%). `
    + `${success
      ? expt('experiments_success_msg', 'This habit works for you.')
      : expt('experiments_needs_work_msg', 'Consider lowering the difficulty or changing the timing.')}`;
}

function renderExperiments() {
  const list = document.getElementById('exp-list');
  if (!list) return;

  expClear(list);
  if (!db.experiments?.length) {
    list.appendChild(expEmptyState(expt('experiments_empty', 'No experiments yet. Test a new habit.')));
    return;
  }

  const fragment = document.createDocumentFragment();
  db.experiments.forEach((exp) => fragment.appendChild(buildExperimentCard(exp)));
  list.appendChild(fragment);
}
function endExp(id) {
  const experiment = db.experiments.find((item) => item.id === id);
  if (!experiment) return;
  experiment.active = false;
  experiment.results = autoEvaluateExperiment(experiment);
  addXP(APP_CONSTANTS.XP.ACHIEVEMENT);
  saveDB();
  renderExperiments();
  emitExperimentActivity('completed', experiment.name, experiment.results || '');
  notify(
    expt('experiments_completed_notify', (xp) => `Experiment completed! +${xp} XP`, APP_CONSTANTS.XP.ACHIEVEMENT),
    '🧪',
    'xp'
  );
}

async function delExp(id) {
  const experiment = db.experiments.find((item) => item.id === id);
  const ok = await ConfirmModal.show({
    title: expt('experiments_delete_title', 'Delete experiment?'),
    icon: '🧪',
    okLabel: expt('btn_delete', 'Delete'),
  });
  if (!ok) return;
  db.experiments = db.experiments.filter((item) => item.id !== id);
  saveDB();
  renderExperiments();
  emitExperimentActivity('deleted', experiment?.name || '');
}

const ExperimentManager = {
  populate: populateExpModal,
  save: saveExperiment,
  render: renderExperiments,
  end: endExp,
  delete: delExp,
  evaluate: autoEvaluateExperiment,
};



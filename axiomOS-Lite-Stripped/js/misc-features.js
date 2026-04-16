// misc-features.js - Tomorrow planner
//
// Depends on:
//   db.js (db, saveDB, today, toKey)
//   toast.js (notify)
//   modals.js (ConfirmModal)
//   ui-core-habits.js (_renderDashTmrPreview)
//   eventbus.js (EventBus)
// ================================================================

function tomorrowLocale() {
  return (typeof I18n !== 'undefined' && I18n.lang === 'it') ? 'it-IT' : 'en-US';
}

function tomorrowText(key, ...args) {
  return typeof I18n !== 'undefined' ? I18n.t(key, ...args) : key;
}

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toKey(date);
}

function _tmrData() {
  if (!db.tomorrow) db.tomorrow = { habits: [], tasks: [], intention: '', p1: '', p2: '', p3: '' };
  if (!Array.isArray(db.tomorrow.habits)) db.tomorrow.habits = [];
  if (!Array.isArray(db.tomorrow.tasks)) db.tomorrow.tasks = [];
  return db.tomorrow;
}

function normalizeTomorrowHabitDays(days) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const normalized = days
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return normalized.length ? normalized : null;
}

function isHabitPlannableForDate(habit, dateKey) {
  const date = new Date(dateKey);
  const dayIdx = (date.getDay() + 6) % 7;
  const normalizedDays = normalizeTomorrowHabitDays(habit?.days);
  return !normalizedDays || normalizedDays.includes(dayIdx);
}

function _ensureTomorrowHistory() {
  if (!db.tomorrowHistory) db.tomorrowHistory = {};
  return db.tomorrowHistory;
}

function _snapshotTomorrowPlan(source) {
  const tmr = source || _tmrData();
  return {
    intention: String(tmr.intention || '').trim(),
    p1: String(tmr.p1 || '').trim(),
    p2: String(tmr.p2 || '').trim(),
    p3: String(tmr.p3 || '').trim(),
    habitCount: Array.isArray(tmr.habits) ? tmr.habits.length : 0,
    taskCount: Array.isArray(tmr.tasks) ? tmr.tasks.length : 0,
    savedAt: new Date().toISOString()
  };
}

function _persistTomorrowHistory() {
  _ensureTomorrowHistory()[today()] = _snapshotTomorrowPlan(_tmrData());
}

function _emitTomorrowChanged(action, extra = {}) {
  EventBus.emit('tomorrow:changed', { action, ...extra });
}

function toggleTomorrowHabit(habitId) {
  const tmr = _tmrData();
  const index = tmr.habits.indexOf(habitId);
  if (index === -1) tmr.habits.push(habitId);
  else tmr.habits.splice(index, 1);
  saveTomorrow();
  renderTomorrow();
}

function renderTomorrow() {
  const tk = tomorrowKey();
  const tmr = _tmrData();

  const sub = document.getElementById('tmr-date-sub');
  if (sub) {
    sub.textContent = new Date(tk).toLocaleDateString(tomorrowLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  const pillsEl = document.getElementById('tmr-habits-pills');
  if (pillsEl) {
    pillsEl.replaceChildren();
    const activeHabits = db.habits.filter((habit) => isHabitPlannableForDate(habit, tk));

    if (!activeHabits.length) {
      const empty = document.createElement('div');
      empty.className = 'dim small';
      empty.textContent = tomorrowText('tomorrow_no_habits');
      pillsEl.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      activeHabits.forEach((habit) => {
        const enabled = tmr.habits.includes(habit.id);
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `tmr-hab-pill${enabled ? ' active' : ''}`;
        pill.dataset.habitId = habit.id;
        pill.setAttribute('aria-pressed', enabled ? 'true' : 'false');

        const iconSpan = document.createElement('span');
        iconSpan.textContent = String(habit.icon || '✓').replace(/[<>"'&]/g, '');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = habit.name || '';

        pill.appendChild(iconSpan);
        pill.appendChild(document.createTextNode(' '));
        pill.appendChild(nameSpan);
        pill.addEventListener('click', () => toggleTomorrowHabit(habit.id));

        frag.appendChild(pill);
      });
      pillsEl.appendChild(frag);
    }
  }

  _renderTmrTasks();

  const intention = document.getElementById('tmr-intention');
  if (intention) intention.value = tmr.intention || '';

  ['p1', 'p2', 'p3'].forEach((key) => {
    const field = document.getElementById(`tmr-${key}`);
    if (field) field.value = tmr[key] || '';
  });
}

function _renderTmrTasks() {
  const host = document.getElementById('tmr-tasks-list');
  if (!host) return;

  const tmr = _tmrData();
  if (!tmr.tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small mb2';
    empty.textContent = tomorrowText('tomorrow_no_tasks');
    host.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  tmr.tasks.forEach((task, index) => {
    const row = document.createElement('div');
    row.className = 'tmr-task';

    const toggleBtn = document.createElement('div');
    toggleBtn.className = `tmr-check${task.done ? ' done' : ''}`;
    toggleBtn.textContent = task.done ? '✓' : '';
    toggleBtn.addEventListener('click', () => toggleTmrTask(index));

    const text = document.createElement('div');
    text.className = `small flex-1${task.done ? ' dim' : ''}`;
    text.style.flex = '1';
    if (task.done) text.style.textDecoration = 'line-through';
    text.textContent = task.text;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger btn-xs';
    removeBtn.style.flexShrink = '0';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeTmrTask(index));

    row.appendChild(toggleBtn);
    row.appendChild(text);
    row.appendChild(removeBtn);
    frag.appendChild(row);
  });

  host.replaceChildren(frag);
}

function addTomorrowTask() {
  const input = document.getElementById('tmr-task-input');
  const value = input?.value.trim();
  if (!value) return;

  _tmrData().tasks.push({ text: value, done: false });
  input.value = '';
  saveTomorrow();
  _renderTmrTasks();
}

function toggleTmrTask(index) {
  const task = _tmrData().tasks[index];
  if (!task) return;
  task.done = !task.done;
  saveTomorrow();
  _renderTmrTasks();
}

function removeTmrTask(index) {
  _tmrData().tasks.splice(index, 1);
  saveTomorrow();
  _renderTmrTasks();
}

function saveTomorrow() {
  const tmr = _tmrData();
  const intention = document.getElementById('tmr-intention');
  if (intention) tmr.intention = intention.value;

  ['p1', 'p2', 'p3'].forEach((key) => {
    const field = document.getElementById(`tmr-${key}`);
    if (field) tmr[key] = field.value;
  });

  _persistTomorrowHistory();
  _tmrPreviewHash = '';
  saveDB();
  _renderDashTmrPreview();
  _emitTomorrowChanged('saved', _snapshotTomorrowPlan(tmr));
}

async function clearTomorrow() {
  const ok = await ConfirmModal.show({
    title: tomorrowText('tomorrow_clear_title'),
    body: tomorrowText('tomorrow_clear_body'),
    icon: '🗑',
    okLabel: tomorrowText('tomorrow_clear_confirm')
  });
  if (!ok) return;

  db.tomorrow = { habits: [], tasks: [], intention: '', p1: '', p2: '', p3: '' };
  delete _ensureTomorrowHistory()[today()];
  _tmrPreviewHash = '';
  saveDB();
  renderTomorrow();
  _emitTomorrowChanged('cleared', { habitCount: 0, taskCount: 0 });
}

function copyTodayToTomorrow() {
  const tk = tomorrowKey();
  const tmr = _tmrData();
  tmr.habits = db.habits
    .filter((habit) => isHabitPlannableForDate(habit, tk))
    .map((habit) => habit.id);
  _persistTomorrowHistory();
  saveDB();
  renderTomorrow();
  _emitTomorrowChanged('copied', { habitCount: tmr.habits.length, taskCount: tmr.tasks.length });
  notify(tomorrowText('tomorrow_copy'), '🌅', 'info');
}

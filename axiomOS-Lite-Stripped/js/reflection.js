// reflection.js - Daily and weekly reflection views

function reflt(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function getRhythmApi() {
  return typeof AxiomDailyRhythm !== 'undefined' ? AxiomDailyRhythm : null;
}

function getReflectQuestions() {
  return [
    ['Wins', reflt('refl_q1_title', 'What went well today?'), reflt('refl_q1_placeholder', 'Write down your wins...')],
    ['Improve', reflt('refl_q2_title', 'What can you improve?'), reflt('refl_q2_placeholder', 'What would you change?')],
    ['Intent', reflt('refl_q3_title', 'What is your intention for tomorrow?'), reflt('refl_q3_placeholder', 'One concrete action...')],
    ['Emotion', reflt('refl_q4_title', 'How did you feel emotionally?'), reflt('refl_q4_placeholder', 'Your emotions today...')],
  ];
}

function buildReflectionQuestionField(question, index) {
  const field = document.createElement('div');
  field.className = 'fg';

  const label = document.createElement('label');
  label.className = 'fl';
  label.textContent = `${question[0]} ${question[1]}`;

  const textarea = document.createElement('textarea');
  textarea.className = 'fta';
  textarea.id = `rq-${index}`;
  textarea.placeholder = question[2];

  field.appendChild(label);
  field.appendChild(textarea);
  return field;
}

function buildWeeklyMetric(valueText, labelText, color, useMono = true) {
  const wrapper = document.createElement('div');
  wrapper.style.textAlign = 'center';

  const value = document.createElement('div');
  value.textContent = valueText;
  value.style.fontSize = '20px';
  if (useMono) value.className = 'mono';
  if (color) value.style.color = color;
  if (useMono) value.style.fontWeight = '700';

  const label = document.createElement('div');
  label.className = 'dim small';
  label.textContent = labelText;

  wrapper.appendChild(value);
  wrapper.appendChild(label);
  return wrapper;
}

function buildWeeklyReviewCard() {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  if (dayOfWeek < 5 && now.getHours() < 18) return null;

  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOfWeek + index);
    return toKey(date);
  });
  const weekHabits = weekDates.flatMap((key) => Object.keys(db.completions[key] || {})).length;
  const weekXP = weekDates.reduce((sum, key) => sum + (db.xpLog?.[key] || 0), 0);
  const weekMoods = weekDates.map((key) => db.reflections?.[key]?.mood || 0).filter(Boolean);
  const avgMood = weekMoods.length ? Math.round(weekMoods.reduce((a, b) => a + b, 0) / weekMoods.length) : 0;
  const moodEmojis = ['', '😞', '😕', '😐', '🙂', '😁'];
  const summary = weekHabits > (db.habits.length * 5)
    ? reflt('refl_weekly_msg_strong', 'Excellent week. You are building a solid base.')
    : weekHabits > (db.habits.length * 3)
      ? reflt('refl_weekly_msg_good', 'Good week. Aim for consistency, not perfection.')
      : reflt('refl_weekly_msg_reset', 'Tough week. Restart tomorrow with one habit.');

  const card = document.createElement('div');
  card.className = 'review-card mb3';

  const title = document.createElement('div');
  title.className = 'bold mb3';
  title.textContent = `📋 ${reflt('refl_weekly_review', 'Weekly Review')}`;

  const metrics = document.createElement('div');
  metrics.className = 'g3 mb3';
  metrics.style.gap = '8px';
  metrics.appendChild(buildWeeklyMetric(String(weekHabits), reflt('refl_weekly_completions', 'completions'), 'var(--accent)'));
  metrics.appendChild(buildWeeklyMetric(String(weekXP), reflt('refl_weekly_xp', 'XP earned'), 'var(--gold)'));
  metrics.appendChild(buildWeeklyMetric(moodEmojis[avgMood] || '-', reflt('refl_weekly_avg_mood', 'average mood'), '', false));

  const insight = document.createElement('div');
  insight.className = 'insight-chip';
  const insightIcon = document.createElement('div');
  insightIcon.className = 'insight-ic';
  insightIcon.textContent = '💡';
  const insightText = document.createElement('div');
  insightText.className = 'insight-txt';
  insightText.textContent = summary;
  insight.appendChild(insightIcon);
  insight.appendChild(insightText);

  card.appendChild(title);
  card.appendChild(metrics);
  card.appendChild(insight);
  return card;
}

let curEnergy = 0;
let curStress = 0;
let curEmotions = [];

function _getMoodEls() {
  return Array.from(document.querySelectorAll('.mood-o'));
}

function _normalizeReflectionState(reflection) {
  curMood = Number(reflection?.mood || 0);
  curEnergy = Number(reflection?.energy || 0);
  curStress = Number(reflection?.stress || 0);
  curEmotions = Array.isArray(reflection?.emotions) ? reflection.emotions.filter(Boolean) : [];
}

function _buildSignalChip(value, selected, onSelect) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `signal-chip${selected ? ' on' : ''}`;
  chip.textContent = String(value);
  chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
  chip.addEventListener('click', () => onSelect(value));
  return chip;
}

function _renderSignalRow(hostId, currentValue, onSelect) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const frag = document.createDocumentFragment();
  for (let value = 1; value <= 5; value += 1) {
    frag.appendChild(_buildSignalChip(value, value === currentValue, onSelect));
  }
  host.replaceChildren(frag);
}

function _renderEmotionChips() {
  const host = document.getElementById('reflect-emotions');
  if (!host) return;

  const rhythm = getRhythmApi();
  const defs = rhythm?.getEmotionDefs?.() || [];
  const frag = document.createDocumentFragment();

  defs.forEach((emotion) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `emotion-chip${curEmotions.includes(emotion.key) ? ' on' : ''}`;
    chip.setAttribute('aria-pressed', curEmotions.includes(emotion.key) ? 'true' : 'false');
    chip.addEventListener('click', () => toggleReflectionEmotion(emotion.key));

    const icon = document.createElement('span');
    icon.className = 'emotion-chip-ic';
    icon.textContent = emotion.icon;

    const label = document.createElement('span');
    label.textContent = rhythm?.getEmotionLabel?.(emotion.key) || emotion.key;

    chip.appendChild(icon);
    chip.appendChild(label);
    frag.appendChild(chip);
  });

  host.replaceChildren(frag);
}

function pickMood(m) {
  curMood = m;
  _getMoodEls().forEach((item) => item.classList.toggle('on', parseInt(item.dataset.mood || item.dataset.m, 10) === m));
}

function setReflectionEnergy(value) {
  curEnergy = Number(value || 0);
  _renderSignalRow('reflect-energy', curEnergy, setReflectionEnergy);
}

function setReflectionStress(value) {
  curStress = Number(value || 0);
  _renderSignalRow('reflect-stress', curStress, setReflectionStress);
}

function toggleReflectionEmotion(key) {
  if (!key) return;
  if (curEmotions.includes(key)) curEmotions = curEmotions.filter((item) => item !== key);
  else curEmotions = [...curEmotions, key];
  _renderEmotionChips();
}

function renderReflection() {
  const key = today();
  const reflection = db.reflections?.[key] || {};
  _normalizeReflectionState(reflection);
  pickMood(curMood);
  _renderSignalRow('reflect-energy', curEnergy, setReflectionEnergy);
  _renderSignalRow('reflect-stress', curStress, setReflectionStress);
  _renderEmotionChips();

  const questionsHost = document.getElementById('reflect-questions');
  const questions = getReflectQuestions();
  if (questionsHost.children.length === 0) {
    const frag = document.createDocumentFragment();
    questions.forEach((question, index) => {
      frag.appendChild(buildReflectionQuestionField(question, index));
    });
    questionsHost.appendChild(frag);
  }

  questions.forEach((question, index) => {
    const row = questionsHost.children[index];
    const label = row?.querySelector?.('label');
    const textarea = document.getElementById(`rq-${index}`);
    if (label) label.textContent = `${question[0]} ${question[1]}`;
    if (textarea) {
      textarea.placeholder = question[2];
      textarea.value = reflection[`q${index}`] || '';
    }
  });

  const weeklyReviewHost = document.getElementById('weekly-review-card');
  if (weeklyReviewHost) {
    const weeklyReview = buildWeeklyReviewCard();
    weeklyReviewHost.replaceChildren(...(weeklyReview ? [weeklyReview] : []));
  }

  loadReflectHistory();
}

function saveReflection() {
  const key = today();
  if (!db.reflections) db.reflections = {};
  const next = {
    mood: curMood,
    energy: curEnergy,
    stress: curStress,
    emotions: curEmotions.slice(),
    savedAt: new Date().toISOString()
  };
  getReflectQuestions().forEach((_, index) => {
    next[`q${index}`] = document.getElementById(`rq-${index}`)?.value || '';
  });
  db.reflections[key] = next;

  addXP(APP_CONSTANTS.XP.REFLECTION);
  checkAch('reflect_7');
  checkQuestProgress();
  saveDB();
  EventBus.emit('reflection:saved', {
    dateKey: key,
    mood: curMood,
    energy: curEnergy,
    stress: curStress,
    emotions: curEmotions.slice(),
  });
  loadReflectHistory();
  notify(reflt('refl_saved', (xp) => `Reflection saved! +${xp} XP 🌙`, APP_CONSTANTS.XP.REFLECTION), '🌙', 'xp');
}

function loadReflectHistory() {
  const host = document.getElementById('reflect-history');
  if (!host) return;

  const entries = Object.entries(db.reflections || {})
    .filter(([, value]) => value.savedAt)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 20);

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'dim small';
    empty.textContent = reflt('refl_no_entries', 'No reflections yet.');
    host.replaceChildren(empty);
    return;
  }

  const rhythm = getRhythmApi();
  const frag = document.createDocumentFragment();
  entries.forEach(([date, reflection]) => {
    const card = document.createElement('div');
    card.style.padding = '10px';
    card.style.border = '1px solid var(--border)';
    card.style.borderRadius = '8px';
    card.style.marginBottom = '8px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '5px';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'small bold';
    dateSpan.textContent = formatDate(date);

    const moodSpan = document.createElement('span');
    moodSpan.textContent = rhythm?.getMoodEmoji?.(reflection.mood) || ['','😞','😕','😐','🙂','😁'][reflection.mood] || '😐';

    header.appendChild(dateSpan);
    header.appendChild(moodSpan);
    card.appendChild(header);

    const metaBits = [];
    if (Number(reflection.energy || 0) > 0) metaBits.push(`${reflt('refl_energy_title', 'Energy')}: ${reflection.energy}/5`);
    if (Number(reflection.stress || 0) > 0) metaBits.push(`${reflt('refl_stress_title', 'Overwhelm / stress')}: ${reflection.stress}/5`);
    const emotionLabels = (Array.isArray(reflection.emotions) ? reflection.emotions : [])
      .map((emotion) => rhythm?.getEmotionLabel?.(emotion) || emotion);
    if (emotionLabels.length) metaBits.push(emotionLabels.join(', '));
    if (metaBits.length) {
      const meta = document.createElement('div');
      meta.className = 'dim small';
      meta.style.marginBottom = '6px';
      meta.textContent = metaBits.join(' · ');
      card.appendChild(meta);
    }

    if (reflection.q0) {
      const preview = document.createElement('div');
      preview.className = 'dim small';
      const text = String(reflection.q0);
      preview.textContent = text.length > 80 ? `${text.slice(0, 80)}...` : text;
      card.appendChild(preview);
    }

    frag.appendChild(card);
  });

  host.replaceChildren(frag);
}

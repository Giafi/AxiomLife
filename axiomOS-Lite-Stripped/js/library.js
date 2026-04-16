// ================================================================
// library.js - Skills tracker, learning library, and vision board
//
// Depends on:
//   constants.js (generateId, APP_CONSTANTS)
//   db.js (db, saveDB, today)
//   toast.js (notify)
//   modals.js (closeModal, ConfirmModal, InputModal)
//   security.js (escapeHtml)
//   ui-core-xp.js (addXP)
// ================================================================

const SKILL_RANKS = [
  { h: 0, name: 'Novice', col: 'var(--text3)' },
  { h: 10, name: 'Apprentice', col: 'var(--accent3)' },
  { h: 50, name: 'Practitioner', col: 'var(--accent2)' },
  { h: 200, name: 'Expert', col: 'var(--gold)' },
  { h: 500, name: 'Master', col: 'var(--accent)' },
];

function libt(key, fallback, ...args) {
  if (typeof I18n !== 'undefined') return I18n.t(key, ...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

function emitModuleActivity(moduleId, section, action, itemName = '', detail = '', icon = '•') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', { moduleId, section, action, itemName, detail, icon });
  EventBus.emit(`${section === 'vision' ? 'vision' : moduleId}:changed`, { action, itemName, detail });
}

function libClear(node) {
  if (node) node.replaceChildren();
}

function libEmptyState(text, style = '') {
  const div = document.createElement('div');
  div.className = 'dim small';
  if (style) div.style.cssText = style;
  div.textContent = text;
  return div;
}

function buildSkillRow(skill) {
  const hours = skill.hours || 0;
  const rank = skillRank(hours);
  const progress = Math.min(100, Math.round((hours / (skill.target || 100)) * 100));

  const row = document.createElement('div');
  row.className = 'skill-row';

  const header = document.createElement('div');
  header.className = 'flex-b mb2';

  const meta = document.createElement('div');
  meta.className = 'flex gap2';
  const name = document.createElement('span');
  name.style.cssText = 'font-size:13px;font-weight:700';
  name.textContent = skill.name || '';
  const rankBadge = document.createElement('span');
  rankBadge.style.cssText = `font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:${rank.col}22;color:${rank.col};border:1px solid ${rank.col}44`;
  rankBadge.textContent = rank.name;
  meta.append(name, rankBadge);

  const actions = document.createElement('div');
  actions.className = 'flex gap2';
  const practiceBtn = document.createElement('button');
  practiceBtn.type = 'button';
  practiceBtn.className = 'btn btn-xs btn-primary';
  practiceBtn.textContent = `Practice`;
  practiceBtn.addEventListener('click', () => openPractice(skill.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-xs btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.setAttribute('aria-label', libt('btn_delete', 'Delete'));
  deleteBtn.addEventListener('click', () => deleteSkill(skill.id));

  actions.append(practiceBtn, deleteBtn);
  header.append(meta, actions);
  row.appendChild(header);

  const pbar = document.createElement('div');
  pbar.className = 'pbar mb2';
  const fill = document.createElement('div');
  fill.className = 'pbar-fill';
  fill.style.width = `${progress}%`;
  fill.style.background = rank.col;
  pbar.appendChild(fill);
  row.appendChild(pbar);

  const details = document.createElement('div');
  details.className = 'flex gap3';
  const totalHours = document.createElement('span');
  totalHours.className = 'dim small';
  totalHours.textContent = libt('skills_total_hours', (h, target) => `${h}h / ${target}h`, hours.toFixed(1), skill.target);
  const sessions = document.createElement('span');
  sessions.className = 'dim small';
  sessions.textContent = libt('skills_sessions_count', (count) => `${count} sessions`, (skill.sessions || []).length);
  details.append(totalHours, sessions);
  if (skill.cat) {
    const cat = document.createElement('span');
    cat.className = 'dim small';
    cat.textContent = skill.cat;
    details.appendChild(cat);
  }
  row.appendChild(details);

  return row;
}

function buildLibraryRow(item) {
  const row = document.createElement('div');
  row.className = 'lib-item';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:26px;flex-shrink:0';
  icon.textContent = LIB_ICONS[item.type] || '📄';

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;min-width:0';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:3px';
  if (item.done) {
    title.style.textDecoration = 'line-through';
    title.style.opacity = '.6';
  }
  title.textContent = item.title || '';
  content.appendChild(title);

  if (item.author) {
    const author = document.createElement('div');
    author.className = 'dim small mb2';
    author.textContent = item.author;
    content.appendChild(author);
  }

  const pbar = document.createElement('div');
  pbar.className = 'pbar';
  pbar.style.height = '4px';
  const fill = document.createElement('div');
  fill.className = 'pbar-fill';
  fill.style.width = `${item.progress || 0}%`;
  fill.style.background = item.done ? 'var(--accent)' : 'var(--accent2)';
  pbar.appendChild(fill);
  content.appendChild(pbar);

  const actions = document.createElement('div');
  actions.className = 'flex gap2';
  actions.style.flexShrink = '0';

  if (!item.done) {
    const progressBtn = document.createElement('button');
    progressBtn.type = 'button';
    progressBtn.className = 'btn btn-xs btn-ghost';
    progressBtn.textContent = `${item.progress || 0}%`;
    progressBtn.addEventListener('click', () => setLibProgress(item.id));

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'btn btn-xs btn-primary';
    completeBtn.textContent = libt('library_done_badge', 'Done');
    completeBtn.setAttribute('aria-label', libt('library_done_badge', 'Done'));
    completeBtn.addEventListener('click', () => completeLibItem(item.id));
    actions.append(progressBtn, completeBtn);
  } else {
    const badge = document.createElement('span');
    badge.className = 'tag tg';
    badge.textContent = libt('library_done_badge', 'Done');
    actions.appendChild(badge);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-xs btn-danger';
  deleteBtn.textContent = libt('btn_delete', 'Delete');
  deleteBtn.setAttribute('aria-label', libt('btn_delete', 'Delete'));
  deleteBtn.addEventListener('click', () => deleteLibItem(item.id));
  actions.appendChild(deleteBtn);

  row.append(icon, content, actions);
  return row;
}

function buildVisionCard(cardData) {
  const color = VISION_COLS[cardData.area] || 'var(--accent)';
  const node = document.createElement('div');
  node.className = 'vision-card';
  node.style.borderLeftColor = color;

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:28px;margin-bottom:8px';
  icon.textContent = cardData.icon || '🌟';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;font-weight:800;margin-bottom:6px';
  title.textContent = cardData.title || '';

  node.append(icon, title);

  if (cardData.desc) {
    const desc = document.createElement('div');
    desc.className = 'dim small';
    desc.style.lineHeight = '1.5';
    desc.textContent = cardData.desc;
    node.appendChild(desc);
  }

  const actions = document.createElement('div');
  actions.className = 'flex gap2 mt3';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-xs btn-ghost';
  editBtn.textContent = libt('btn_edit', 'Edit');
  editBtn.setAttribute('aria-label', libt('btn_edit', 'Edit'));
  editBtn.addEventListener('click', () => editVision(cardData.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-xs btn-danger';
  deleteBtn.textContent = libt('btn_delete', 'Delete');
  deleteBtn.setAttribute('aria-label', libt('btn_delete', 'Delete'));
  deleteBtn.addEventListener('click', () => deleteVision(cardData.id));

  actions.append(editBtn, deleteBtn);
  node.appendChild(actions);
  return node;
}

function skillRank(hours) {
  return [...SKILL_RANKS].reverse().find((rank) => hours >= rank.h) || SKILL_RANKS[0];
}

function saveSkill() {
  const name = document.getElementById('msk-name').value.trim();
  if (!name) {
    notify(libt('skills_name_required', 'Enter a name!'), '⚠', 'info');
    return;
  }

  const existingId = document.getElementById('msk-id').value;
  const existing = existingId ? (db.skills || []).find((item) => item.id === existingId) : null;
  const skill = {
    id: existingId || generateId('sk'),
    name,
    cat: document.getElementById('msk-cat').value,
    target: parseInt(document.getElementById('msk-target').value, 10) || 100,
    note: document.getElementById('msk-note').value,
    hours: existing?.hours || 0,
    sessions: existing?.sessions || [],
  };

  if (!db.skills) db.skills = [];
  if (existingId) {
    const index = db.skills.findIndex((item) => item.id === existingId);
    if (index !== -1) db.skills[index] = skill;
  } else {
    db.skills.push(skill);
  }

  saveDB();
  closeModal('m-add-skill');
  renderSkills();
  emitModuleActivity('skills', 'skills', existingId ? 'updated' : 'created', skill.name, '', '🛠');
  notify(existingId ? libt('skills_updated', 'Skill updated!') : libt('skills_added', 'Skill added!'), '🛠', 'info');
}

function openPractice(id) {
  const skill = (db.skills || []).find((item) => item.id === id);
  if (!skill) return;
  document.getElementById('mp-sid').value = id;
  document.getElementById('mp-title').textContent = `📝 ${skill.name}`;
  document.getElementById('mp-min').value = '';
  document.getElementById('mp-note').value = '';
  openModal('m-log-practice');
}

function logPractice() {
  const minutes = parseInt(document.getElementById('mp-min').value, 10) || 0;
  if (minutes <= 0) {
    notify(libt('skills_enter_minutes', 'Enter minutes!'), '⚠', 'info');
    return;
  }

  const id = document.getElementById('mp-sid').value;
  const skill = (db.skills || []).find((item) => item.id === id);
  if (!skill) return;

  skill.hours = (skill.hours || 0) + minutes / 60;
  if (!skill.sessions) skill.sessions = [];
  skill.sessions.unshift({ date: today(), min: minutes, note: document.getElementById('mp-note').value });
  if (skill.sessions.length > APP_CONSTANTS.UI.MAX_HISTORY_ITEMS / 2) skill.sessions.pop();

  const xpEarned = Math.round(minutes * APP_CONSTANTS.XP.PRACTICE_PER_MIN * 2);
  addXP(xpEarned);
  saveDB();
  closeModal('m-log-practice');
  renderSkills();
  emitModuleActivity('skills', 'skills', 'logged', skill.name, `${minutes} min`, '🛠');
  notify(`+${xpEarned} XP · ${skill.hours.toFixed(1)}h total`, '🛠', 'xp');
}

async function deleteSkill(id) {
  const skill = (db.skills || []).find((item) => item.id === id);
  const ok = await ConfirmModal.show({
    title: libt('skills_delete_title', 'Delete skill?'),
    icon: '🛠',
    okLabel: libt('btn_delete', 'Delete')
  });
  if (!ok) return;
  db.skills = (db.skills || []).filter((item) => item.id !== id);
  saveDB();
  renderSkills();
  emitModuleActivity('skills', 'skills', 'deleted', skill?.name || '', '', '🛠');
}

function renderSkills() {
  const el = document.getElementById('skills-list');
  if (!el) return;
  if (!db.skills) db.skills = [];

  libClear(el);
  if (!db.skills.length) {
    el.appendChild(libEmptyState(libt('skills_empty', 'No skills yet. Add one.')));
    return;
  }

  const fragment = document.createDocumentFragment();
  db.skills.forEach((skill) => fragment.appendChild(buildSkillRow(skill)));
  el.appendChild(fragment);
}
const LIB_ICONS = { book: '📖', course: '🎓', article: '📄', podcast: '🎙', video: '🎬' };
let _libTab = 'all';

function saveLibItem() {
  const title = document.getElementById('ml-title').value.trim();
  if (!title) {
    notify(libt('library_name_required', 'Enter a title!'), '⚠', 'info');
    return;
  }

  const existingId = document.getElementById('ml-id').value;
  const existing = existingId ? (db.library || []).find((item) => item.id === existingId) : null;
  const item = {
    id: existingId || generateId('lib'),
    title,
    author: document.getElementById('ml-author').value,
    type: document.getElementById('ml-type').value,
    size: parseInt(document.getElementById('ml-size').value, 10) || 0,
    xpReward: parseInt(document.getElementById('ml-xp').value, 10) || 100,
    progress: existing?.progress || 0,
    done: existing?.done || false,
    addedAt: today(),
  };

  if (!db.library) db.library = [];
  if (existingId) {
    const index = db.library.findIndex((entry) => entry.id === existingId);
    if (index !== -1) db.library[index] = item;
  } else {
    db.library.push(item);
  }

  saveDB();
  closeModal('m-add-lib');
  renderLibrary();
  emitModuleActivity('library', 'library', existingId ? 'updated' : 'created', item.title, '', '📚');
  notify(existingId ? libt('library_item_updated', 'Item updated!') : libt('library_item_added', 'Added to library!'), '📚', 'info');
}

function completeLibItem(id) {
  const item = (db.library || []).find((entry) => entry.id === id);
  if (!item || item.done) return;

  item.done = true;
  item.progress = 100;
  item.completedAt = today();
  addXP(item.xpReward || 100);
  saveDB();
  renderLibrary();
  emitModuleActivity('library', 'library', 'completed', item.title, `+${item.xpReward || 100} XP`, '📚');
  notify(`"${item.title}" completed! +${item.xpReward || 100} XP`, '📚', 'xp');
}

async function setLibProgress(id) {
  const raw = await InputModal.show({
    title: libt('library_progress_prompt', 'Update progress (0-100):'),
    type: 'number',
    min: 0,
    max: 100,
    defaultVal: 0
  });
  if (raw === null) return;

  const progress = parseInt(raw, 10);
  if (Number.isNaN(progress) || progress < 0 || progress > 100) return;

  const item = (db.library || []).find((entry) => entry.id === id);
  if (!item) return;
  item.progress = progress;
  if (progress === 100) {
    completeLibItem(id);
    return;
  }
  saveDB();
  renderLibrary();
}

async function deleteLibItem(id) {
  const item = (db.library || []).find((entry) => entry.id === id);
  const ok = await ConfirmModal.show({
    title: libt('library_remove_title', 'Remove from library?'),
    icon: '📚',
    okLabel: libt('btn_delete', 'Delete')
  });
  if (!ok) return;
  db.library = (db.library || []).filter((entry) => entry.id !== id);
  saveDB();
  renderLibrary();
  emitModuleActivity('library', 'library', 'deleted', item?.title || '', '', '📚');
}

function renderLibrary() {
  const el = document.getElementById('lib-list');
  if (!el) return;
  if (!db.library) db.library = [];

  let items = db.library;
  if (_libTab === 'reading') items = items.filter((item) => !item.done);
  if (_libTab === 'done') items = items.filter((item) => item.done);

  libClear(el);
  if (!items.length) {
    el.appendChild(libEmptyState(libt('library_empty', 'No items yet. Add one.')));
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.appendChild(buildLibraryRow(item)));
  el.appendChild(fragment);
}
document.addEventListener('click', (event) => {
  const tab = event.target.closest('#lib-tabs .tab');
  if (!tab) return;
  _libTab = tab.dataset.tab;
  document.querySelectorAll('#lib-tabs .tab').forEach((node) => node.classList.toggle('on', node === tab));
  renderLibrary();
});

const VISION_COLS = {
  corpo: 'var(--accent3)',
  mente: 'var(--accent2)',
  spirito: 'var(--red)',
  vocazione: 'var(--purple)',
  finanze: 'var(--gold)',
  sociale: 'var(--accent)',
};

function saveVisionCard() {
  const title = document.getElementById('mv-title').value.trim();
  if (!title) {
    notify(libt('vision_title_required', 'Enter a title!'), '⚠', 'info');
    return;
  }

  const existingId = document.getElementById('mv-id').value;
  const card = {
    id: existingId || generateId('vc'),
    icon: document.getElementById('mv-ic').value || '🌟',
    area: document.getElementById('mv-area').value,
    title,
    desc: document.getElementById('mv-desc').value,
  };

  if (!db.visionBoard) db.visionBoard = [];
  if (existingId) {
    const index = db.visionBoard.findIndex((entry) => entry.id === existingId);
    if (index !== -1) db.visionBoard[index] = card;
  } else {
    db.visionBoard.push(card);
  }

  saveDB();
  closeModal('m-add-vision');
  renderVisionBoard();
  emitModuleActivity('visionBoard', 'vision', existingId ? 'updated' : 'created', card.title, '', '🌌');
  notify(libt('vision_saved', 'Vision card saved!'), '🌌', 'info');
}

async function deleteVision(id) {
  const card = (db.visionBoard || []).find((entry) => entry.id === id);
  const ok = await ConfirmModal.show({
    title: libt('vision_delete_title', 'Delete vision card?'),
    icon: '🌌',
    okLabel: libt('btn_delete', 'Delete')
  });
  if (!ok) return;
  db.visionBoard = (db.visionBoard || []).filter((entry) => entry.id !== id);
  saveDB();
  renderVisionBoard();
  emitModuleActivity('visionBoard', 'vision', 'deleted', card?.title || '', '', '🌌');
}

function editVision(id) {
  const card = (db.visionBoard || []).find((entry) => entry.id === id);
  if (!card) return;
  document.getElementById('mv-id').value = card.id;
  document.getElementById('mv-ic').value = card.icon;
  document.getElementById('mv-area').value = card.area;
  document.getElementById('mv-title').value = card.title;
  document.getElementById('mv-desc').value = card.desc || '';
  openModal('m-add-vision');
}

function renderVisionBoard() {
  const el = document.getElementById('vision-grid');
  if (!el) return;
  if (!db.visionBoard) db.visionBoard = [];

  libClear(el);
  if (!db.visionBoard.length) {
    el.appendChild(libEmptyState(libt('vision_empty', 'No vision cards yet. Start visualizing your future.'), 'grid-column:1/-1'));
    return;
  }

  const fragment = document.createDocumentFragment();
  db.visionBoard.forEach((card) => fragment.appendChild(buildVisionCard(card)));
  el.appendChild(fragment);
}
const LibraryManager = {
  skillRank,
  saveSkill,
  openPractice,
  logPractice,
  deleteSkill,
  renderSkills,
  saveLibItem,
  completeLibItem,
  setLibProgress,
  deleteLibItem,
  renderLibrary,
  saveVisionCard,
  editVision,
  deleteVision,
  renderVisionBoard,
};



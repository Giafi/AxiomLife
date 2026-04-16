// ================================================================
// rewards.js - Custom rewards and XP redemption
//
// Depends on:
//   constants.js (generateId, APP_CONSTANTS)
//   db.js (db, saveDB, today)
//   toast.js (notify)
//   modals.js (closeModal, ConfirmModal)
//   security.js (escapeHtml)
// ================================================================

let _rwHash = '';

function rwt(key, fallback, ...args) {
  if (typeof I18n !== 'undefined') return I18n.t(key, ...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

function emitRewardActivity(action, itemName = '', detail = '', icon = '🎁') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', {
    moduleId: 'rewards',
    section: 'rewards',
    action,
    itemName,
    detail,
    icon,
  });
  EventBus.emit('rewards:changed', { action, itemName, detail });
}

function currentRewardsLanguage() {
  return db?.settings?.lang || (typeof I18n !== 'undefined' ? I18n.lang : 'en');
}

function saveReward() {
  const name = document.getElementById('mr-name').value.trim();
  if (!name) {
    notify(rwt('skills_name_required', 'Enter a name!'), '⚠', 'info');
    return;
  }

  const existingId = document.getElementById('mr-id').value;
  const reward = {
    id: existingId || generateId('rw'),
    name,
    icon: document.getElementById('mr-ic').value || '🎁',
    cost: parseInt(document.getElementById('mr-cost').value, 10) || 200,
    cat: document.getElementById('mr-cat').value,
    desc: document.getElementById('mr-desc').value,
  };

  if (!db.rewards) db.rewards = [];
  if (existingId) {
    const index = db.rewards.findIndex((item) => item.id === existingId);
    if (index !== -1) db.rewards[index] = reward;
  } else {
    db.rewards.push(reward);
  }

  saveDB();
  closeModal('m-add-reward');
  renderRewards();
  emitRewardActivity(existingId ? 'updated' : 'created', reward.name, `${reward.cost} XP`, reward.icon || '🎁');
  notify(rwt('reward_saved', 'Reward saved!'), '🎁', 'info');
}

function redeemReward(id) {
  const reward = (db.rewards || []).find((item) => item.id === id);
  if (!reward) return;

  const spent = (db.rewardHistory || []).reduce((sum, item) => sum + item.cost, 0);
  const availableXp = (db.user.totalXp || 0) - spent;
  if (availableXp < reward.cost) {
    notify(rwt('rewards_not_enough_xp', (cost) => `Not enough XP. You need ${cost} XP.`, reward.cost), '❌', 'info');
    return;
  }

  if (!db.rewardHistory) db.rewardHistory = [];
  db.rewardHistory.unshift({ id: reward.id, name: reward.name, icon: reward.icon, cost: reward.cost, date: today() });
  if (db.rewardHistory.length > APP_CONSTANTS.UI.MAX_HISTORY_ITEMS) db.rewardHistory.pop();

  saveDB();
  renderRewards();
  emitRewardActivity('redeemed', reward.name, `-${reward.cost} XP`, reward.icon || '🎁');
  notify(`${reward.icon} ${rwt('reward_redeemed', (name) => `"${name}" redeemed!`, reward.name)} -${reward.cost} XP`, reward.icon, 'ach');
}

async function deleteReward(id) {
  const reward = (db.rewards || []).find((item) => item.id === id);
  const ok = await ConfirmModal.show({
    title: rwt('rewards_delete_title', 'Delete reward?'),
    icon: '🗑',
    okLabel: rwt('btn_delete', 'Delete')
  });
  if (!ok) return;
  db.rewards = (db.rewards || []).filter((item) => item.id !== id);
  saveDB();
  renderRewards();
  emitRewardActivity('deleted', reward?.name || '', reward?.cost ? `${reward.cost} XP` : '', reward?.icon || '🎁');
}

function renderRewards() {
  const grid = document.getElementById('rewards-grid');
  if (!grid) return;
  if (!db.rewards) db.rewards = [];
  if (!db.rewardHistory) db.rewardHistory = [];

  const spent = db.rewardHistory.reduce((sum, item) => sum + item.cost, 0);
  const availableXp = (db.user.totalXp || 0) - spent;
  const xpNode = document.getElementById('rw-xp');
  if (xpNode) xpNode.textContent = Math.max(0, availableXp);
  const countNode = document.getElementById('rw-cnt');
  if (countNode) countNode.textContent = db.rewardHistory.length;

  const newHash = db.rewards.map((item) => item.id + item.cost).join('|')
    + '|' + db.rewardHistory.length
    + '|' + currentRewardsLanguage();
  if (newHash !== _rwHash || grid.children.length === 0) {
    _rwHash = newHash;
    const fragment = document.createDocumentFragment();

    if (!db.rewards.length) {
      const empty = document.createElement('div');
      empty.className = 'dim small';
      empty.style.gridColumn = '1/-1';
      empty.textContent = rwt('rewards_empty', 'No rewards yet. Create one.');
      fragment.appendChild(empty);
    } else {
      db.rewards.forEach((reward) => {
        const card = document.createElement('div');
        card.className = 'reward-card';
        card.innerHTML = `
          <div style="font-size:28px;margin-bottom:6px">${escapeHtml(reward.icon || '🎁')}</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtml(reward.name || '')}</div>
          ${reward.desc ? `<div class="dim small mb2">${escapeHtml(reward.desc)}</div>` : ''}
          <div class="mono" style="font-size:11px;color:var(--accent);margin-bottom:8px">${reward.cost} XP</div>
        `;

        const actions = document.createElement('div');
        actions.className = 'flex gap2';
        actions.style.justifyContent = 'center';

        const redeemBtn = document.createElement('button');
        redeemBtn.type = 'button';
        redeemBtn.className = 'btn btn-primary btn-xs';
        redeemBtn.textContent = `🎁 ${rwt('rewards_redeem', 'Redeem')}`;
        redeemBtn.addEventListener('click', () => redeemReward(reward.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-xs';
        deleteBtn.textContent = '✕';
        deleteBtn.setAttribute('aria-label', rwt('btn_delete', 'Delete'));
        deleteBtn.addEventListener('click', () => deleteReward(reward.id));

        actions.append(redeemBtn, deleteBtn);
        card.appendChild(actions);
        fragment.appendChild(card);
      });
    }

    grid.innerHTML = '';
    grid.appendChild(fragment);
  }

  const history = document.getElementById('rewards-hist');
  if (!history) return;

  if (!db.rewardHistory.length) {
    history.innerHTML = `<div class="dim small">${rwt('rewards_no_history', 'No redemptions yet.')}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  db.rewardHistory.slice(0, 20).forEach((item) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;';
    row.innerHTML = `
      <span style="font-size:16px">${escapeHtml(item.icon || '🎁')}</span>
      <span style="flex:1">${escapeHtml(item.name || '')}</span>
      <span class="mono" style="color:var(--red);font-size:11px">−${item.cost} XP</span>
      <span class="dim small">${escapeHtml(item.date || '')}</span>`;
    fragment.appendChild(row);
  });
  history.innerHTML = '';
  history.appendChild(fragment);
}

const RewardManager = {
  save: saveReward,
  redeem: redeemReward,
  delete: deleteReward,
  render: renderRewards,
};

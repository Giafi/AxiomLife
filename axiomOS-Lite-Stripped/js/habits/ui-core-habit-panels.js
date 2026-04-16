// ui-core-habit-panels.js
// Habit list and progress panel rendering extracted from ui-core-habits.js.
// The main habit module remains the orchestrator and passes explicit runtime
// contracts into this helper instead of relying on hidden globals.

(function initHabitPanelsUI(global) {
  const heatmapCache = {};
  let questsHash = '';

  function getDocument(ctx) {
    return ctx?.document || global.document;
  }

  function getLanguage(ctx) {
    return ctx?.getLanguage?.()
      || ctx?.db?.settings?.lang
      || global.I18n?.lang
      || 'en';
  }

  function clearNode(node) {
    if (!node) return;
    if (typeof node.replaceChildren === 'function') {
      node.replaceChildren();
      return;
    }
    if (Array.isArray(node.children)) node.children.length = 0;
    if ('innerHTML' in node) node.innerHTML = '';
    if ('textContent' in node) node.textContent = '';
  }

  function scheduleRender(ctx, callback) {
    const raf = ctx?.requestAnimationFrame || global.requestAnimationFrame;
    if (typeof raf === 'function') {
      raf(callback);
      return;
    }
    callback();
  }

  function buildHabitRow(ctx, habit, done, dateKey, fromDash = false) {
    const doc = getDocument(ctx);
    const row = doc.createElement('div');
    row.className = 'habit-row' + (done ? ' done' : '');
    row.dataset.habitId = habit.id;
    row.setAttribute('role', 'checkbox');
    row.setAttribute('aria-checked', done ? 'true' : 'false');
    row.setAttribute('aria-label', `${habit.name}${done ? ` - ${ctx.HT('habit_completed_suffix')}` : ''}`);

    const xp = ctx.getHabitBaseXP(habit);
    const diffIcons = ['', '😊', '😐', '💪', '🔥'];
    const categoryLabel = ctx.getCategoryLabel(habit.cat || 'altro');

    const dragHandle = doc.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.title = ctx.HT('habit_drag_reorder');
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.textContent = '⠿';

    const check = doc.createElement('div');
    check.className = 'habit-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = done ? '✓' : '';

    const icon = doc.createElement('div');
    icon.className = 'habit-icon';
    icon.style.background = `${habit.color || ctx.colors?.[0] || '#4cc9f0'}22`;
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = habit.icon || '✅';

    const body = doc.createElement('div');
    body.className = 'habit-body';

    const name = doc.createElement('div');
    name.className = 'habit-name';
    name.textContent = habit.name;

    const meta = doc.createElement('div');
    meta.className = 'habit-meta';

    const category = doc.createElement('span');
    category.setAttribute('aria-label', ctx.HT('category_label', categoryLabel));
    category.textContent = `${ctx.categoryIcons?.[habit.cat] || '✨'} ${categoryLabel}`;

    const difficulty = doc.createElement('span');
    difficulty.setAttribute('aria-hidden', 'true');
    difficulty.textContent = diffIcons[habit.difficulty || 1];

    meta.append(category, difficulty);

    if (habit.trigger) {
      const trigger = doc.createElement('span');
      trigger.className = 'h-trigger';
      trigger.setAttribute('aria-label', ctx.HT('trigger_label', habit.trigger));
      trigger.textContent = `⚡ ${habit.trigger}`;
      meta.appendChild(trigger);
    }

    body.append(name, meta);

    const right = doc.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.alignItems = 'flex-end';
    right.style.gap = '3px';

    const streak = doc.createElement('div');
    streak.className = 'habit-streak';
    streak.setAttribute('aria-label', ctx.HT('streak_label', habit.streak || 0));
    streak.textContent = `🔥${habit.streak || 0}`;

    const xpNode = doc.createElement('div');
    xpNode.className = 'habit-xp';
    xpNode.setAttribute('aria-label', `+${xp} XP`);
    xpNode.textContent = `+${xp}XP`;

    right.append(streak, xpNode);
    row.append(dragHandle, check, icon, body, right);

    row.addEventListener('click', (event) => {
      if (event.target.closest('.drag-handle') || event.target.closest('.habit-name-input') || event.target.closest('.habit-actions')) return;
      ctx.completeHabit(habit.id, fromDash);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        ctx.completeHabit(habit.id, fromDash);
      }
    });
    if (typeof ctx.attachInlineEdit === 'function') ctx.attachInlineEdit(row, habit);
    return row;
  }

  function renderHabitsChunked(ctx, options) {
    const { container, habits, dateKey, showActions } = options;
    const doc = getDocument(ctx);
    clearNode(container);

    if (!habits.length) {
      const empty = doc.createElement('div');
      empty.className = 'dim small';
      empty.append(`${ctx.HT('habits_empty')} `);

      const link = doc.createElement('span');
      link.textContent = ctx.HT('habits_empty_cta');
      link.style.cssText = 'color:var(--accent);cursor:pointer';
      link.addEventListener('click', () => ctx.openModal('m-add-habit'));
      empty.appendChild(link);
      container.appendChild(empty);
      return;
    }

    let index = 0;
    const chunkSize = ctx.chunkSize || 20;

    function renderChunk() {
      const slice = habits.slice(index, index + chunkSize);
      if (!slice.length) return;

      const frag = doc.createDocumentFragment();
      slice.forEach((habit) => {
        const done = !!ctx.db.completions[dateKey]?.[habit.id];
        const row = buildHabitRow(ctx, habit, done, dateKey, false);

        if (showActions) {
          const actions = doc.createElement('div');
          actions.className = 'habit-actions';

          const editBtn = doc.createElement('button');
          editBtn.className = 'btn btn-xs btn-ghost';
          editBtn.setAttribute('aria-label', `${ctx.HT('btn_edit')} ${habit.name}`);
          editBtn.textContent = '✏';
          editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            ctx.editHabit(habit.id);
          });

          const deleteBtn = doc.createElement('button');
          deleteBtn.className = 'btn btn-xs btn-danger';
          deleteBtn.setAttribute('aria-label', `${ctx.HT('btn_delete')} ${habit.name}`);
          deleteBtn.textContent = '✕';
          deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            ctx.deleteHabit(habit.id);
          });

          actions.append(editBtn, deleteBtn);
          row.appendChild(actions);
        }

        frag.appendChild(row);
      });

      container.appendChild(frag);
      index += chunkSize;
      if (index < habits.length) {
        if (habits.length > 50) {
          const moreBtn = doc.createElement('button');
          moreBtn.className = 'btn btn-ghost btn-sm w100';
          moreBtn.style.marginTop = '8px';
          moreBtn.textContent = ctx.HT('habits_show_more', Math.min(chunkSize, habits.length - index));
          moreBtn.setAttribute('aria-label', ctx.HT('habits_show_more_aria', Math.min(chunkSize, habits.length - index)));
          moreBtn.addEventListener('click', () => {
            moreBtn.remove();
            scheduleRender(ctx, renderChunk);
          });
          container.appendChild(moreBtn);
        } else {
          scheduleRender(ctx, renderChunk);
        }
      }
    }

    renderChunk();
  }

  function renderQuests(ctx, dateKey) {
    const list = ctx.list || getDocument(ctx).getElementById('daily-quests-list');
    if (!list) return;

    const quests = ctx.getQuests(dateKey);
    const nextHash = quests.map((quest) => `${quest.id}|${quest.done ? '1' : '0'}|${quest.lang || ''}`).join('|');
    if (nextHash === questsHash && list.children.length > 0) return;
    questsHash = nextHash;

    clearNode(list);
    quests.forEach((quest) => {
      const card = getDocument(ctx).createElement('div');
      card.className = 'quest-card' + (quest.done ? ' quest-done' : '');

      const title = getDocument(ctx).createElement('div');
      title.className = 'quest-title';
      title.textContent = `${quest.done ? '✅ ' : ''}${quest.title}`;

      const desc = getDocument(ctx).createElement('div');
      desc.className = 'quest-desc';
      desc.textContent = quest.desc;

      const actions = getDocument(ctx).createElement('div');
      actions.className = 'sh-act';

      const xpTag = getDocument(ctx).createElement('span');
      xpTag.className = 'tag to';
      xpTag.textContent = `+${quest.xp} XP`;
      actions.appendChild(xpTag);

      if (!quest.done) {
        const button = getDocument(ctx).createElement('button');
        button.className = 'btn btn-orange btn-xs';
        button.dataset.questDate = dateKey;
        button.dataset.questId = quest.id;
        button.textContent = ctx.HT('quest_complete_manual');
        actions.appendChild(button);
      }

      card.append(title, desc, actions);
      list.appendChild(card);
    });
  }

  function completeQuest(ctx, dateKey, questId) {
    const quest = ctx.getQuests(dateKey).find((item) => item.id === questId);
    if (!quest || quest.done) return;

    quest.done = true;
    ctx.addXP(quest.xp);
    ctx.saveDB();

    const button = getDocument(ctx).querySelector(`[data-quest-date="${dateKey}"][data-quest-id="${questId}"]`);
    if (button) {
      const card = button.closest('.quest-card');
      if (card) {
        card.classList.add('quest-done');
        const title = card.querySelector('.quest-title');
        if (title && !title.textContent.startsWith('✅')) title.textContent = `✅ ${title.textContent}`;
        button.remove();
      }
    }

    if (typeof ctx.patchDashStats === 'function') ctx.patchDashStats(dateKey);
    if (typeof ctx.updateSidebar === 'function') ctx.updateSidebar();
    ctx.notify(ctx.HT('quest_reward', quest.title, quest.xp), '⚔', 'ach');
  }

  function renderHeatmap(ctx, id, weeks = 16) {
    const el = getDocument(ctx).getElementById(id);
    if (!el) return;

    const newHash = `${ctx.today()}|${ctx.db.stats.totalComp || 0}|${getLanguage(ctx)}`;
    const cached = heatmapCache[id];
    if (cached && cached.hash === newHash && cached.weeks === weeks && el.children.length > 0) return;
    heatmapCache[id] = { hash: newHash, weeks };

    const frag = getDocument(ctx).createDocumentFragment();
    for (let week = weeks - 1; week >= 0; week -= 1) {
      const col = getDocument(ctx).createElement('div');
      col.className = 'hmap-col';
      for (let day = 0; day < 7; day += 1) {
        const date = new Date();
        date.setDate(date.getDate() - (week * 7 + (6 - day)));
        const key = ctx.toKey(date);
        const count = Object.keys(ctx.db.completions[key] || {}).length;
        const cell = getDocument(ctx).createElement('div');
        cell.className = 'hmap-cell' + (count === 0 ? '' : count < 2 ? ' hc1' : count < 4 ? ' hc2' : count < 6 ? ' hc3' : ' hc4');
        cell.title = ctx.HT('heatmap_day_total', key, count);
        col.appendChild(cell);
      }
      frag.appendChild(col);
    }

    clearNode(el);
    el.appendChild(frag);
  }

  function invalidateHeatmapCache() {
    Object.keys(heatmapCache).forEach((key) => delete heatmapCache[key]);
  }

  global.AxiomHabitPanelsUI = {
    buildHabitRow,
    renderHabitsChunked,
    renderQuests,
    completeQuest,
    renderHeatmap,
    invalidateHeatmapCache,
  };
}(typeof window !== 'undefined' ? window : globalThis));

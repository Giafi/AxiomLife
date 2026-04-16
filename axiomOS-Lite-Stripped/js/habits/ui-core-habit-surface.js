// ui-core-habit-surface.js
// Habit tab orchestration, stacking, alignment, and drag/drop helpers
// extracted from ui-core-habits.js.

(function initHabitSurfaceUI(global) {
  let alignmentHash = '';
  let dragSourceIndex = null;
  let lastDragOverRow = null;

  function getDocument(ctx) {
    return ctx?.document || global.document;
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

  function renderSmallMessage(ctx, host, text) {
    if (typeof ctx?.renderSmallMessage === 'function') {
      ctx.renderSmallMessage(host, text);
      return;
    }
    const doc = getDocument(ctx);
    clearNode(host);
    const message = doc.createElement('div');
    message.className = 'dim small';
    message.textContent = text;
    host.appendChild(message);
  }

  function renderHabitStacking(ctx) {
    const doc = getDocument(ctx);
    const host = ctx.host || doc.getElementById('stack-visual');
    if (!host) return;

    clearNode(host);
    if ((ctx.db.habits || []).length < 2) {
      renderSmallMessage(ctx, host, ctx.HT('habits_stack_need_two'));
      return;
    }

    const groups = {};
    ctx.db.habits.forEach((habit) => {
      const trigger = habit.trigger || ctx.HT('habits_no_trigger');
      if (!groups[trigger]) groups[trigger] = [];
      groups[trigger].push(habit);
    });

    const fragment = doc.createDocumentFragment();
    Object.entries(groups).forEach(([trigger, habits]) => {
      if (habits.length < 2) return;

      const row = doc.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;';

      const triggerTag = doc.createElement('div');
      triggerTag.className = 'tag tb';
      triggerTag.style.marginRight = '4px';
      triggerTag.textContent = `⚡ ${trigger}`;
      row.appendChild(triggerTag);

      habits.forEach((habit, index) => {
        if (index > 0) {
          const arrow = doc.createElement('div');
          arrow.style.color = 'var(--text3)';
          arrow.style.fontSize = '12px';
          arrow.textContent = '→';
          row.appendChild(arrow);
        }

        const card = doc.createElement('div');
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.gap = '5px';
        card.style.padding = '6px 10px';
        card.style.background = 'var(--surface)';
        card.style.border = '1px solid var(--border)';
        card.style.borderRadius = '8px';
        card.style.fontSize = '12px';
        card.style.fontWeight = '600';
        card.textContent = `${habit.icon || '✅'} ${habit.name}`;
        row.appendChild(card);
      });

      fragment.appendChild(row);
    });

    host.appendChild(fragment);
    if (!host.children.length) renderSmallMessage(ctx, host, ctx.HT('habits_stack_same_trigger'));
  }

  function renderCategoryTab(ctx) {
    const doc = getDocument(ctx);
    const host = ctx.host || doc.getElementById('hab-cat');
    if (!host) return;

    clearNode(host);

    const categories = {};
    ctx.db.habits.forEach((habit) => {
      if (!categories[habit.cat]) categories[habit.cat] = [];
      categories[habit.cat].push(habit);
    });

    const fragment = doc.createDocumentFragment();
    Object.entries(categories).forEach(([category, habits]) => {
      const section = doc.createElement('div');

      const header = doc.createElement('div');
      header.className = 'bold mb3';
      header.style.marginTop = '16px';
      header.textContent = `${ctx.categoryIcons[category] || '✨'} ${ctx.getCategoryLabel(category)}`;
      section.appendChild(header);

      const group = doc.createDocumentFragment();
      habits.forEach((habit) => {
        group.appendChild(ctx.buildHabitRow(habit, !!ctx.db.completions[ctx.dateKey]?.[habit.id], ctx.dateKey));
      });
      section.appendChild(group);
      fragment.appendChild(section);
    });

    host.appendChild(fragment);
  }

  function renderAlignment(ctx) {
    const doc = getDocument(ctx);
    const host = ctx.host || doc.getElementById('align-indicator');
    if (!host) return;

    if (!ctx.db.identities.length) {
      renderSmallMessage(ctx, host, ctx.HT('alignment_none'));
      alignmentHash = '';
      return;
    }

    const avg = ctx.db.identities.reduce((sum, identity) => sum + ctx.calcIdentityScore(identity.id), 0) / ctx.db.identities.length;
    const avgRounded = Math.round(avg);
    const lang = typeof ctx.getLanguage === 'function' ? ctx.getLanguage() : (ctx.db.settings?.lang || '');
    const nextHash = `${avgRounded}|${ctx.db.identities.length}|${lang}`;
    if (nextHash === alignmentHash && host.children.length > 0) return;
    alignmentHash = nextHash;

    const color = avg >= 70 ? 'var(--accent)' : avg >= 40 ? 'var(--gold)' : 'var(--red)';
    const message = avg >= 70 ? ctx.HT('alignment_high') : avg >= 40 ? ctx.HT('alignment_mid') : ctx.HT('alignment_low');

    clearNode(host);

    const score = doc.createElement('div');
    score.style.fontSize = '28px';
    score.style.fontWeight = '800';
    score.style.color = color;
    score.style.fontFamily = 'var(--font-mono)';
    score.style.marginBottom = '6px';
    score.textContent = `${avgRounded}%`;

    const bar = doc.createElement('div');
    bar.className = 'pbar mb2';
    const fill = doc.createElement('div');
    fill.className = 'pbar-fill';
    fill.style.width = `${avg}%`;
    fill.style.background = color;
    bar.appendChild(fill);

    const text = doc.createElement('div');
    text.className = 'small';
    text.style.color = color;
    text.textContent = message;

    host.append(score, bar, text);
  }

  function setTabVisibility(ctx, tabName) {
    const doc = getDocument(ctx);
    ['today', 'all', 'stacking', 'cat'].forEach((view) => {
      const host = doc.getElementById(`hab-${view}`);
      if (host) host.classList.toggle('hidden', tabName !== view);
    });
  }

  function initHabitTabs(ctx) {
    const doc = getDocument(ctx);
    const tabs = Array.from(doc.querySelectorAll('#hab-tabs .tab'));
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      if (tab.dataset.habitSurfaceBound === '1') return;
      tab.dataset.habitSurfaceBound = '1';
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        tabs.forEach((node) => node.classList.toggle('on', node === tab));
        setTabVisibility(ctx, tabName);
        if (typeof ctx.onSelectTab === 'function') ctx.onSelectTab(tabName);
      });
    });

    const activeTab = typeof ctx.getActiveTab === 'function'
      ? ctx.getActiveTab()
      : (tabs.find((tab) => tab.classList?.contains?.('on'))?.dataset.tab || tabs[0].dataset.tab);
    if (!activeTab) return;

    tabs.forEach((tab) => tab.classList.toggle('on', tab.dataset.tab === activeTab));
    setTabVisibility(ctx, activeTab);
  }

  function initHabitDnD(ctx, container) {
    if (!container) return;
    const rows = container.querySelectorAll('.habit-row[data-habit-id]');
    rows.forEach((row, index) => {
      row.draggable = true;
      row.dataset.dndIdx = String(index);
      if (row.dataset.habitDndBound === '1') return;
      row.dataset.habitDndBound = '1';

      row.addEventListener('dragstart', (event) => {
        dragSourceIndex = parseInt(row.dataset.dndIdx, 10);
        row.classList.add('dragging');
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        if (lastDragOverRow) {
          lastDragOverRow.classList.remove('drag-over');
          lastDragOverRow = null;
        }
      });

      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (lastDragOverRow && lastDragOverRow !== row) lastDragOverRow.classList.remove('drag-over');
        row.classList.add('drag-over');
        lastDragOverRow = row;
      });

      row.addEventListener('dragleave', (event) => {
        if (!row.contains(event.relatedTarget)) {
          row.classList.remove('drag-over');
          if (lastDragOverRow === row) lastDragOverRow = null;
        }
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetIndex = parseInt(row.dataset.dndIdx, 10);
        const sourceHabitId = rows[dragSourceIndex]?.dataset?.habitId || null;
        const targetHabitId = row.dataset.habitId || null;
        if (dragSourceIndex === null || Number.isNaN(targetIndex) || dragSourceIndex === targetIndex) return;
        if (!sourceHabitId || !targetHabitId) return;
        if (typeof ctx.onReorder === 'function') ctx.onReorder(sourceHabitId, targetHabitId);
        dragSourceIndex = null;
        if (lastDragOverRow) {
          lastDragOverRow.classList.remove('drag-over');
          lastDragOverRow = null;
        }
      });
    });
  }

  global.AxiomHabitSurfaceUI = {
    renderHabitStacking,
    renderCategoryTab,
    renderAlignment,
    initHabitTabs,
    initHabitDnD,
  };
}(typeof window !== 'undefined' ? window : globalThis));

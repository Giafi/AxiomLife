// ui-core-dashboard.js
// Daily dashboard rendering helpers extracted from ui-core-habits.js.
// This module keeps ui-core-habits.js as the orchestrator while making the
// dashboard contract explicit and easier to maintain.

(function initDailyDashboardUI(global) {
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

  function toggleHiddenState(node, hidden) {
    if (!node) return;
    if (node.classList?.toggle) {
      node.classList.toggle('hidden', hidden);
      return;
    }
    const current = String(node.className || '').split(/\s+/).filter(Boolean);
    const classes = new Set(current);
    if (hidden) classes.add('hidden');
    else classes.delete('hidden');
    node.className = Array.from(classes).join(' ');
  }

  function appendChildren(parent, children) {
    if (!parent || !Array.isArray(children)) return;
    children.forEach((child) => {
      if (child && typeof parent.appendChild === 'function') parent.appendChild(child);
    });
  }

  function buildFocusButton(ctx, config) {
    const doc = getDocument(ctx);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = config.variant === 'primary' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    button.textContent = ctx.HT(config.labelKey);
    if (config.action) button.dataset.action = config.action;
    if (config.section) button.dataset.section = config.section;
    if (config.modal) button.dataset.modal = config.modal;
    if (config.view) button.dataset.view = config.view;
    if (typeof config.onClick === 'function') button.onclick = config.onClick;
    return button;
  }

  function buildFocusPill(ctx, text, tone = 'neutral') {
    const doc = getDocument(ctx);
    const pill = doc.createElement('span');
    pill.className = 'focus-pill' + (tone !== 'neutral' ? ` is-${tone}` : '');
    pill.textContent = text;
    return pill;
  }

  function hasTomorrowPlan(tomorrow) {
    const safeTomorrow = tomorrow || {};
    const fields = [safeTomorrow.intention, safeTomorrow.p1, safeTomorrow.p2, safeTomorrow.p3];
    return fields.some((value) => typeof value === 'string' && value.trim())
      || (safeTomorrow.habits || []).length > 0
      || (safeTomorrow.tasks || []).length > 0;
  }

  function getDeepWorkMinutesForDate(db, dateKey) {
    return db.deepWork?.lastDate === dateKey ? (db.deepWork.todayMin || 0) : 0;
  }

  function getReminderPermissionState(notificationApi) {
    if (typeof notificationApi === 'undefined') return 'unsupported';
    return notificationApi.permission;
  }

  const LITE_DASHBOARD_UPGRADE_DISMISS_KEY = 'lite_dashboard_upgrade_dismissed';

  function readLiteDashboardUpgradeDismissed() {
    try {
      return localStorage.getItem(LITE_DASHBOARD_UPGRADE_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeLiteDashboardUpgradeDismissed(value) {
    try {
      if (value) localStorage.setItem(LITE_DASHBOARD_UPGRADE_DISMISS_KEY, '1');
      else localStorage.removeItem(LITE_DASHBOARD_UPGRADE_DISMISS_KEY);
    } catch {}
  }

  function getLiteUpgradeCardCopy(ctx) {
    const lite = global.AxiomLite;
    if (lite?.getUpgradeCopy) return lite.getUpgradeCopy();
    return getLanguage(ctx) === 'it'
      ? {
        title: 'Sblocca la versione completa',
        body: 'Ottieni abitudini illimitate, moduli avanzati, import, backup e personalizzazione completa.',
        cta: 'Vai al full',
        dismiss: 'Non ora'
      }
      : {
        title: 'Unlock the full version',
        body: 'Get unlimited habits, advanced modules, import, backup, and full customization.',
        cta: 'View full version',
        dismiss: 'Not now'
      };
  }

  function handleDashboardLiteUpgradeOpen(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    global.AxiomLite?.openUpgradeUrl?.();
  }

  function handleDashboardLiteUpgradeDismiss(ctx, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    writeLiteDashboardUpgradeDismissed(true);
    renderDailyFocus(ctx);
  }

  function handleDashboardReminderEnable(ctx, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const refreshDashboard = () => {
      if (typeof ctx.renderDashboard === 'function') {
        ctx.renderDashboard();
        return;
      }
      if (typeof global.renderDashboard === 'function') global.renderDashboard();
    };

    if (typeof global.enableReminderNow !== 'function') {
      if (typeof ctx.showSection === 'function') ctx.showSection('settings');
      return;
    }

    Promise.resolve(global.enableReminderNow())
      .then((state) => {
        if ((state?.permission === 'unsupported' || state?.permission === 'denied')
          && typeof ctx.showSection === 'function') {
          ctx.showSection('settings');
        }
        refreshDashboard();
      })
      .catch(() => {
        if (typeof ctx.showSection === 'function') ctx.showSection('settings');
      });
  }

  function buildDashStatCards(ctx) {
    const statsEl = ctx.statsEl || getDocument(ctx).getElementById('dash-stats');
    if (!statsEl) return;

    const language = getLanguage(ctx);
    if (statsEl.dataset?.i18nLang === language && statsEl.children.length > 0) return;

    const defs = [
      { lbl: ctx.HT('dash_stats_completed'), ic: '✅', sub: ctx.HT('dash_stats_habits'), col: '' },
      { lbl: ctx.HT('dash_stats_streak'), ic: '🔥', sub: ctx.HT('dash_stats_days'), col: 'var(--gold)' },
      { lbl: ctx.HT('dash_stats_xp_today'), ic: '⚡', sub: ctx.HT('dash_stats_points'), col: 'var(--accent)' },
      { lbl: ctx.HT('dash_stats_deepwork'), ic: '⏱', sub: ctx.HT('dash_stats_today'), col: 'var(--accent2)' },
    ];

    clearNode(statsEl);
    if (statsEl.dataset) statsEl.dataset.i18nLang = language;
    const frag = getDocument(ctx).createDocumentFragment();
    defs.forEach((item) => {
      const card = getDocument(ctx).createElement('div');
      card.className = 'stat';

      const label = getDocument(ctx).createElement('div');
      label.className = 'stat-lbl';
      label.textContent = item.lbl;

      const value = getDocument(ctx).createElement('div');
      value.className = 'stat-val';
      if (item.col) value.style.color = item.col;
      value.textContent = '—';

      const sub = getDocument(ctx).createElement('div');
      sub.className = 'stat-sub';
      sub.textContent = item.sub;

      const icon = getDocument(ctx).createElement('div');
      icon.className = 'stat-ic';
      icon.textContent = item.ic;

      appendChildren(card, [label, value, sub, icon]);
      frag.appendChild(card);
    });

    statsEl.appendChild(frag);
  }

  function isModuleVisibleInSurface(ctx, moduleId) {
    const modules = ctx.db?.settings?.modules || {};
    const placement = ctx.db?.settings?.modulePlacement?.[moduleId];
    return modules[moduleId] !== false && placement !== 'hidden';
  }

  function getRecentDateKeys(days, referenceKey) {
    const base = referenceKey ? new Date(referenceKey) : new Date();
    base.setHours(12, 0, 0, 0);
    const keys = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(base);
      date.setDate(base.getDate() - offset);
      keys.push(typeof global.toKey === 'function' ? global.toKey(date) : date.toISOString().slice(0, 10));
    }
    return keys;
  }

  function buildOptionalCard(ctx, { icon, title, body, meta, section }) {
    const doc = getDocument(ctx);
    const card = doc.createElement('div');
    card.className = 'card daily-extra-card';

    const head = doc.createElement('div');
    head.className = 'daily-extra-head';

    const titleEl = doc.createElement('div');
    titleEl.className = 'daily-extra-title';
    titleEl.textContent = `${icon} ${title}`;

    const button = buildFocusButton(ctx, {
      labelKey: 'dash_daily_card_open',
      action: 'nav:section',
      section,
      variant: 'ghost'
    });
    button.className = 'btn btn-ghost btn-xs';

    head.appendChild(titleEl);
    head.appendChild(button);

    const bodyEl = doc.createElement('div');
    bodyEl.className = 'daily-extra-body';
    bodyEl.textContent = body;

    const metaEl = doc.createElement('div');
    metaEl.className = 'daily-extra-meta';
    metaEl.textContent = meta;

    card.appendChild(head);
    card.appendChild(bodyEl);
    card.appendChild(metaEl);
    return card;
  }

  function buildReflectionDailyCard(ctx, dateKey) {
    const reflection = ctx.db?.reflections?.[dateKey] || null;
    if (!reflection) {
      return buildOptionalCard(ctx, {
        icon: '🌙',
        title: ctx.HT('nav_reflection'),
        body: ctx.HT('dash_daily_reflection_empty'),
        meta: ctx.HT('dash_daily_reflection_meta'),
        section: 'reflection'
      });
    }
    const mood = reflection.mood ? `${ctx.HT('dash_daily_reflection_mood', reflection.mood)}` : ctx.HT('dash_daily_reflection_saved');
    const energy = reflection.energy ? ctx.HT('dash_daily_reflection_energy', reflection.energy) : ctx.HT('dash_daily_reflection_saved');
    return buildOptionalCard(ctx, {
      icon: '🌙',
      title: ctx.HT('nav_reflection'),
      body: mood,
      meta: energy,
      section: 'reflection'
    });
  }

  function buildGoalsDailyCard(ctx) {
    const goals = Array.isArray(ctx.db?.goals) ? ctx.db.goals.filter((goal) => !goal.archived) : [];
    if (!goals.length) {
      return buildOptionalCard(ctx, {
        icon: '🎯',
        title: ctx.HT('nav_goals'),
        body: ctx.HT('dash_daily_goals_empty'),
        meta: ctx.HT('dash_daily_goals_meta_empty'),
        section: 'goals'
      });
    }
    const lead = goals[0];
    const milestoneTotal = Array.isArray(lead.milestones) ? lead.milestones.length : 0;
    const milestoneDone = milestoneTotal ? lead.milestones.filter((item) => item.done).length : 0;
    return buildOptionalCard(ctx, {
      icon: '🎯',
      title: ctx.HT('nav_goals'),
      body: ctx.HT('dash_daily_goals_count', goals.length),
      meta: milestoneTotal
        ? ctx.HT('dash_daily_goals_meta_progress', lead.name || ctx.HT('nav_goals'), milestoneDone, milestoneTotal)
        : (lead.name || ctx.HT('nav_goals')),
      section: 'goals'
    });
  }

  function buildFitnessDailyCard(ctx, dateKey) {
    const fitness = ctx.db?.fitness || {};
    const workouts = Array.isArray(fitness.workouts) ? fitness.workouts : [];
    const recentKeys = getRecentDateKeys(7, dateKey);
    const recentSet = new Set(recentKeys);
    const weeklyWorkouts = workouts.filter((workout) => recentSet.has(workout.date)).length;
    const waterToday = Number(fitness.water?.[dateKey] || 0);
    const waterGoal = Math.max(4, Number(fitness.goals?.dailyWater) || 8);
    const hasCheckin = !!fitness.checkins?.[dateKey];
    return buildOptionalCard(ctx, {
      icon: '🏋',
      title: ctx.HT('nav_fitness'),
      body: ctx.HT('dash_daily_fitness_summary', weeklyWorkouts, waterToday, waterGoal),
      meta: hasCheckin ? ctx.HT('dash_daily_fitness_meta_done') : ctx.HT('dash_daily_fitness_meta_pending'),
      section: 'fitness'
    });
  }

  function buildAchievementsDailyCard(ctx) {
    const achievements = Array.isArray(ctx.db?.achievements) ? ctx.db.achievements : [];
    const unlocked = achievements.filter((item) => item?.u || item?.unlocked);
    const latest = unlocked.at(-1);
    return buildOptionalCard(ctx, {
      icon: '🏆',
      title: ctx.HT('nav_achievements'),
      body: unlocked.length
        ? ctx.HT('dash_daily_achievements_count', unlocked.length, achievements.length)
        : ctx.HT('dash_daily_achievements_empty'),
      meta: latest?.n || latest?.name || ctx.HT('dash_daily_achievements_meta'),
      section: 'achievements'
    });
  }

  function renderDailyOptionalCards(ctx) {
    const host = ctx.host || getDocument(ctx).getElementById('dash-optional-cards');
    if (!host) return;

    const active = ctx.db?.settings?.homeCards || {};
    const dateKey = ctx.dateKey || (typeof global.today === 'function' ? global.today() : new Date().toISOString().slice(0, 10));
    const cards = [];

    if (active.reflection && isModuleVisibleInSurface(ctx, 'reflection')) cards.push(buildReflectionDailyCard(ctx, dateKey));
    if (active.goals && isModuleVisibleInSurface(ctx, 'goals')) cards.push(buildGoalsDailyCard(ctx));
    if (active.fitness && isModuleVisibleInSurface(ctx, 'fitness')) cards.push(buildFitnessDailyCard(ctx, dateKey));
    if (active.achievements && isModuleVisibleInSurface(ctx, 'achievements')) cards.push(buildAchievementsDailyCard(ctx));

    clearNode(host);
    toggleHiddenState(host, cards.length === 0);
    if (!cards.length) return;

    const frag = getDocument(ctx).createDocumentFragment();
    cards.forEach((card) => frag.appendChild(card));
    host.appendChild(frag);
  }

  function renderDailyFocus(ctx) {
    const host = ctx.host || getDocument(ctx).getElementById('dash-daily-focus');
    if (!host) return;

    const activeHabits = ctx.db.habits.filter((habit) => ctx.isHabitActiveOnDate(habit, ctx.dateKey));
    const doneCount = activeHabits.filter((habit) => ctx.db.completions[ctx.dateKey]?.[habit.id]).length;
    const pendingCount = Math.max(activeHabits.length - doneCount, 0);
    const deepWorkMinutes = getDeepWorkMinutesForDate(ctx.db, ctx.dateKey);
    const tomorrowReady = hasTomorrowPlan(ctx.db.tomorrow);
    const reflectionDone = !!ctx.db.reflections?.[ctx.dateKey];
    const reminderPermission = getReminderPermissionState(ctx.Notification);

    let titleKey = 'dash_focus_aligned_title';
    let bodyKey = 'dash_focus_aligned_body';
    let bodyArgs = [];
    let primaryAction = { labelKey: 'dash_focus_open_stats', action: 'nav:section', section: 'stats', variant: 'primary' };
    let secondaryAction = null;

    if (activeHabits.length === 0) {
      titleKey = 'dash_focus_empty_title';
      bodyKey = 'dash_focus_empty_body';
      primaryAction = { labelKey: 'dash_focus_add_habit', action: 'modal:open', modal: 'm-add-habit', variant: 'primary' };
    } else if (pendingCount > 0) {
      titleKey = 'dash_focus_habits_title';
      bodyKey = 'dash_focus_habits_body';
      bodyArgs = [pendingCount];
      primaryAction = { labelKey: 'dash_focus_open_habits', action: 'nav:section', section: 'habits', variant: 'primary' };
      secondaryAction = { labelKey: 'dash_focus_open_deepwork', action: 'nav:section', section: 'deepwork' };
    } else if (deepWorkMinutes === 0) {
      titleKey = 'dash_focus_deepwork_title';
      bodyKey = 'dash_focus_deepwork_body';
      primaryAction = { labelKey: 'dash_focus_open_deepwork', action: 'nav:section', section: 'deepwork', variant: 'primary' };
      secondaryAction = { labelKey: 'dash_focus_open_tomorrow', action: 'nav:section', section: 'tomorrow' };
    } else if (!tomorrowReady) {
      titleKey = 'dash_focus_tomorrow_title';
      bodyKey = 'dash_focus_tomorrow_body';
      primaryAction = { labelKey: 'dash_focus_open_tomorrow', action: 'nav:section', section: 'tomorrow', variant: 'primary' };
      secondaryAction = { labelKey: 'dash_focus_open_reflection', action: 'nav:section', section: 'reflection' };
    } else if (!reflectionDone) {
      titleKey = 'dash_focus_reflection_title';
      bodyKey = 'dash_focus_reflection_body';
      primaryAction = { labelKey: 'dash_focus_open_reflection', action: 'nav:section', section: 'reflection', variant: 'primary' };
      secondaryAction = { labelKey: 'dash_focus_open_stats', action: 'nav:section', section: 'stats' };
    }

    clearNode(host);

    const card = getDocument(ctx).createElement('div');
    card.className = 'focus-card';

    const copy = getDocument(ctx).createElement('div');
    copy.className = 'focus-copy';

    const label = getDocument(ctx).createElement('div');
    label.className = 'focus-label';
    label.textContent = ctx.HT('dash_focus_label');

    const title = getDocument(ctx).createElement('div');
    title.className = 'focus-title';
    title.textContent = ctx.HT(titleKey);

    const body = getDocument(ctx).createElement('div');
    body.className = 'focus-body';
    body.textContent = ctx.HT(bodyKey, ...bodyArgs);

    const pills = getDocument(ctx).createElement('div');
    pills.className = 'focus-pills';
    appendChildren(pills, [
      buildFocusPill(ctx, ctx.HT('dash_focus_metric_done', doneCount, activeHabits.length), 'success'),
      buildFocusPill(ctx, ctx.HT('dash_focus_metric_pending', pendingCount), pendingCount > 0 ? 'warning' : 'neutral'),
      buildFocusPill(ctx, ctx.HT('dash_focus_metric_focus', deepWorkMinutes), deepWorkMinutes > 0 ? 'info' : 'neutral'),
      buildFocusPill(
        ctx,
        tomorrowReady ? ctx.HT('dash_focus_metric_plan_ready') : ctx.HT('dash_focus_metric_plan_missing'),
        tomorrowReady ? 'success' : 'warning'
      )
    ]);

    const actions = getDocument(ctx).createElement('div');
    actions.className = 'focus-actions';
    actions.appendChild(buildFocusButton(ctx, primaryAction));
    if (secondaryAction) actions.appendChild(buildFocusButton(ctx, secondaryAction));

    appendChildren(copy, [label, title, body, pills, actions]);
    card.appendChild(copy);

    const showReminderPrompt = activeHabits.length > 0
      && reminderPermission !== 'granted'
      && reminderPermission !== 'unsupported';
    const showLiteUpgradePrompt = !!global.AxiomLite?.enabled
      && !!global.AxiomLite?.getUpgradeUrl?.()
      && !readLiteDashboardUpgradeDismissed();

    if (showReminderPrompt || showLiteUpgradePrompt) {
      const side = getDocument(ctx).createElement('div');
      side.className = 'focus-side';

      if (showReminderPrompt) {
        const reminderCard = getDocument(ctx).createElement('div');
        reminderCard.className = 'focus-reminder';

        const reminderTitle = getDocument(ctx).createElement('div');
        reminderTitle.className = 'focus-reminder-title';
        reminderTitle.textContent = ctx.HT('dash_focus_reminder_title');

        const reminderBody = getDocument(ctx).createElement('div');
        reminderBody.className = 'focus-reminder-body';
        reminderBody.textContent = ctx.HT('dash_focus_reminder_body');

        reminderCard.appendChild(reminderTitle);
        reminderCard.appendChild(reminderBody);
        reminderCard.appendChild(buildFocusButton(ctx, {
          labelKey: 'dash_focus_reminder_enable',
          action: 'reminder:enable-now',
          variant: 'ghost',
          onClick: (event) => handleDashboardReminderEnable(ctx, event)
        }));
        side.appendChild(reminderCard);
      }

      if (showLiteUpgradePrompt) {
        const copy = getLiteUpgradeCardCopy(ctx);
        const upgradeCard = getDocument(ctx).createElement('div');
        upgradeCard.className = 'focus-reminder focus-upgrade-card';
        upgradeCard.dataset.liteUpgradeCard = '1';

        const upgradeTitle = getDocument(ctx).createElement('div');
        upgradeTitle.className = 'focus-reminder-title';
        upgradeTitle.textContent = copy.title;

        const upgradeBody = getDocument(ctx).createElement('div');
        upgradeBody.className = 'focus-reminder-body';
        upgradeBody.textContent = copy.body;

        const actionsWrap = getDocument(ctx).createElement('div');
        actionsWrap.className = 'focus-upgrade-actions';
        const openButton = getDocument(ctx).createElement('button');
        openButton.type = 'button';
        openButton.className = 'btn btn-primary btn-sm';
        openButton.dataset.action = 'lite:upgrade-open';
        openButton.textContent = copy.cta;
        openButton.onclick = handleDashboardLiteUpgradeOpen;

        const dismissButton = getDocument(ctx).createElement('button');
        dismissButton.type = 'button';
        dismissButton.className = 'btn btn-ghost btn-sm';
        dismissButton.dataset.action = 'lite:upgrade-dismiss';
        dismissButton.textContent = copy.dismiss;
        dismissButton.onclick = (event) => handleDashboardLiteUpgradeDismiss(ctx, event);

        actionsWrap.appendChild(openButton);
        actionsWrap.appendChild(dismissButton);

        upgradeCard.appendChild(upgradeTitle);
        upgradeCard.appendChild(upgradeBody);
        upgradeCard.appendChild(actionsWrap);
        side.appendChild(upgradeCard);
      }

      card.appendChild(side);
    }

    host.appendChild(card);
  }

  let tomorrowPreviewHash = '';

  function renderTomorrowPreview(ctx) {
    const host = ctx.host || getDocument(ctx).getElementById('dash-tmr-preview-body');
    if (!host) return;

    const tmr = typeof ctx.getTomorrowData === 'function'
      ? ctx.getTomorrowData()
      : { intention: '', p1: '', p2: '', p3: '', tasks: [], habits: [] };

    const newHash = [
      getLanguage(ctx),
      tmr.intention || '',
      tmr.p1 || '',
      tmr.p2 || '',
      tmr.p3 || '',
      tmr.tasks.map((task) => `${task.text || ''}:${task.done ? '1' : '0'}`).join('|'),
      tmr.habits.map((habit) => (typeof habit === 'string' ? habit : (habit?.id || habit?.name || ''))).join('|')
    ].join('||');
    if (newHash === tomorrowPreviewHash && host.children.length > 0) return;
    tomorrowPreviewHash = newHash;

    clearNode(host);

    const hasContent = tmr.p1 || tmr.intention || tmr.tasks.length || tmr.habits.length;
    if (!hasContent) {
      const empty = getDocument(ctx).createElement('div');
      empty.className = 'dim small';
      empty.textContent = `${ctx.HT('dash_tomorrow_empty')} `;

      const link = getDocument(ctx).createElement('span');
      link.textContent = ctx.HT('dash_tomorrow_cta');
      link.style.cssText = 'color:var(--purple);cursor:pointer';
      link.addEventListener('click', () => {
        if (typeof ctx.showSection === 'function') ctx.showSection('tomorrow');
      });

      empty.appendChild(link);
      host.appendChild(empty);
      return;
    }

    if (tmr.p1 || tmr.p2 || tmr.p3) {
      const heading = getDocument(ctx).createElement('div');
      heading.className = 'mb2';
      heading.textContent = ctx.HT('tomorrow_priorities_title');
      host.appendChild(heading);

      [tmr.p1, tmr.p2, tmr.p3].filter(Boolean).forEach((priority, index) => {
        const row = getDocument(ctx).createElement('div');
        row.className = 'flex gap2 mb2';

        const badge = getDocument(ctx).createElement('span');
        badge.className = `tag ${['tg', 'tb', 'tp'][index]}`;
        badge.textContent = String(index + 1);

        const text = getDocument(ctx).createElement('span');
        text.style.fontSize = '12px';
        text.textContent = priority;

        appendChildren(row, [badge, text]);
        host.appendChild(row);
      });
    }

    if (tmr.tasks.length) {
      const heading = getDocument(ctx).createElement('div');
      heading.className = 'mb2 mt2';
      heading.textContent = ctx.HT('tomorrow_tasks_count', tmr.tasks.length);
      host.appendChild(heading);

      tmr.tasks.slice(0, 3).forEach((task) => {
        const row = getDocument(ctx).createElement('div');
        row.className = 'flex gap2 mb1';

        const state = getDocument(ctx).createElement('span');
        state.style.cssText = 'color:var(--purple);font-size:12px';
        state.textContent = task.done ? '✓' : '-';

        const text = getDocument(ctx).createElement('span');
        text.className = `small${task.done ? ' dim' : ''}`;
        text.textContent = task.text;

        appendChildren(row, [state, text]);
        host.appendChild(row);
      });

      if (tmr.tasks.length > 3) {
        const more = getDocument(ctx).createElement('div');
        more.className = 'dim small';
        more.textContent = ctx.HT('tomorrow_more_tasks', tmr.tasks.length - 3);
        host.appendChild(more);
      }
    }

    if (tmr.habits.length) {
      const habits = getDocument(ctx).createElement('div');
      habits.className = 'mt2 dim small';
      habits.textContent = `🔁 ${ctx.HT('tomorrow_habits_planned_count', tmr.habits.length)}`;
      host.appendChild(habits);
    }
  }

  global.AxiomDailyUI = {
    buildDashStatCards,
    renderDailyOptionalCards,
    renderDailyFocus,
    renderTomorrowPreview,
    hasTomorrowPlan,
  };
}(typeof window !== 'undefined' ? window : globalThis));

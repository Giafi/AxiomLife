(() => {
  function readDemoFlags() {
    try {
      const params = new URLSearchParams(globalThis.location?.search || '');
      const pathname = String(globalThis.location?.pathname || '');
      const enabled =
        params.get('demo') === '1' ||
        params.get('demo') === 'true' ||
        pathname.endsWith('/demo-live.html');
      return {
        enabled,
        presentation: params.get('presentation') === '1' || params.get('presentation') === 'true',
      };
    } catch {
      return { enabled: false, presentation: false };
    }
  }

  const DEMO_FLAGS = readDemoFlags();
  if (!DEMO_FLAGS.enabled) return;

  const DEMO_IDB_NAME = 'nexus_idb_demo';
  const DEMO_STORAGE_KEY = 'nexus_v2_demo';
  const DEMO_FALLBACK_KEY = `${DEMO_STORAGE_KEY}_idb_fallback`;
  const DEMO_LIFECYCLE_KEY = 'nexus_demo_lifecycle_last_run';
  const DEMO_SEED_VERSION = '2026-04-07-live-demo-v1';
  const EVERYDAY = [0, 1, 2, 3, 4, 5, 6];
  const WEEKDAYS = [0, 1, 2, 3, 4];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function dateFromOffset(daysAgo) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return date;
  }

  function dateKey(daysAgo) {
    return dateFromOffset(daysAgo).toISOString().slice(0, 10);
  }

  function isoAt(daysAgo, hour, minute) {
    const date = dateFromOffset(daysAgo);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  function dayIndexFromKey(key) {
    const date = new Date(key);
    return (date.getDay() + 6) % 7;
  }

  function xpNextForLevel(level) {
    let xpNext = 1000;
    for (let current = 1; current < level; current += 1) {
      xpNext = Math.round(xpNext * 1.15);
    }
    return xpNext;
  }

  function baseXpForDifficulty(difficulty) {
    const multipliers = [1, 1, 1.5, 2, 3];
    return Math.round(20 * (multipliers[difficulty] || 1));
  }

  function addCompletion(seed, habit, daysAgo, options = {}) {
    const key = dateKey(daysAgo);
    const baseXp = options.baseXp || baseXpForDifficulty(habit.difficulty);
    const momentumMultiplier = options.momentumMultiplier || 1;
    const xp = options.xp || Math.round(baseXp * momentumMultiplier);

    if (!seed.completions[key]) seed.completions[key] = {};
    seed.completions[key][habit.id] = {
      time: isoAt(daysAgo, options.hour ?? 8, options.minute ?? 15),
      xp,
      baseXp,
      momentumMultiplier,
    };
    seed.xpLog[key] = Math.round(Number(seed.xpLog[key] || 0) + xp);
  }

  function calcCurrentStreak(seed, habitId, lookbackDays = 120) {
    let streak = 0;
    for (let daysAgo = 0; daysAgo <= lookbackDays; daysAgo += 1) {
      const key = dateKey(daysAgo);
      if (seed.completions[key]?.[habitId]) streak += 1;
      else break;
    }
    return streak;
  }

  function calcBestStreak(seed, habitId, lookbackDays = 120) {
    let best = 0;
    let current = 0;
    for (let daysAgo = lookbackDays; daysAgo >= 0; daysAgo -= 1) {
      const key = dateKey(daysAgo);
      if (seed.completions[key]?.[habitId]) {
        current += 1;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    }
    return best;
  }

  function calcIdentityScore(seed, identityId) {
    const linkedHabits = seed.habits.filter((habit) => habit.identityId === identityId);
    if (!linkedHabits.length) return 0;

    let total = 0;
    for (let daysAgo = 0; daysAgo < 14; daysAgo += 1) {
      const key = dateKey(daysAgo);
      const doneCount = linkedHabits.filter((habit) => seed.completions[key]?.[habit.id]).length;
      total += doneCount / linkedHabits.length;
    }

    return Math.min(99, Math.round((total / 14) * 100));
  }

  function makeHistory(currentScore, delta) {
    const history = [];
    for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
      const drift = Math.max(25, Math.min(99, currentScore - delta + Math.round((delta / 13) * (13 - daysAgo))));
      history.push({ date: dateKey(daysAgo), score: drift });
    }
    return history;
  }

  function unlockAchievements(achievements, ids) {
    const set = new Set(ids);
    return achievements.map((achievement) => {
      const unlocked = set.has(achievement.id);
      return {
        ...achievement,
        u: unlocked,
        unlocked,
        seen: unlocked,
      };
    });
  }

  function deleteIndexedDb(name) {
    return new Promise((resolve) => {
      if (!('indexedDB' in globalThis)) {
        resolve();
        return;
      }
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  async function resetDemoData() {
    const confirmed = globalThis.confirm?.(
      'Reset the live demo data in this browser and restore the seeded sample workspace?'
    );
    if (confirmed === false) return;

    try { localStorage.removeItem(DEMO_STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(DEMO_FALLBACK_KEY); } catch (_) {}
    try { localStorage.removeItem(DEMO_LIFECYCLE_KEY); } catch (_) {}
    await deleteIndexedDb(DEMO_IDB_NAME);
    globalThis.location.reload();
  }

  function mountDemoBanner() {
    if (!document.body || document.getElementById('axiom-demo-banner')) return;

    const banner = document.createElement('aside');
    banner.id = 'axiom-demo-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Demo controls');
    banner.style.cssText = [
      'position:fixed',
      'top:14px',
      'right:14px',
      'z-index:9999',
      'max-width:320px',
      'padding:14px 14px 12px',
      'border-radius:18px',
      'border:1px solid rgba(255,255,255,.12)',
      'background:linear-gradient(180deg, rgba(6,12,22,.96), rgba(4,8,14,.94))',
      'box-shadow:0 18px 50px rgba(0,0,0,.35)',
      'backdrop-filter:blur(14px)',
      'color:#f5fbff',
      'font:500 13px/1.45 "Plus Jakarta Sans", system-ui, sans-serif',
    ].join(';');

    const badge = document.createElement('div');
    badge.textContent = 'LIVE DEMO';
    badge.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'padding:4px 9px',
      'border-radius:999px',
      'background:rgba(0,229,160,.12)',
      'border:1px solid rgba(0,229,160,.22)',
      'color:#7df3cf',
      'font-size:11px',
      'font-weight:800',
      'letter-spacing:.08em',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Sample workspace loaded';
    title.style.cssText = 'margin-top:10px;font-size:15px;font-weight:800;';

    const body = document.createElement('div');
    body.textContent = 'This page runs the real app with seeded demo data stored only in this browser.';
    body.style.cssText = 'margin-top:6px;color:rgba(245,251,255,.76);';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;';

    const memoLink = document.createElement('a');
    memoLink.href = 'demo-memo.html';
    memoLink.textContent = 'Open memo';
    memoLink.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'min-height:36px',
      'padding:0 12px',
      'border-radius:12px',
      'border:1px solid rgba(255,255,255,.14)',
      'background:rgba(255,255,255,.05)',
      'color:#f5fbff',
      'font-weight:700',
      'text-decoration:none',
    ].join(';');

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset demo';
    resetButton.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'min-height:36px',
      'padding:0 12px',
      'border-radius:12px',
      'border:1px solid rgba(0,229,160,.22)',
      'background:rgba(0,229,160,.12)',
      'color:#7df3cf',
      'font-weight:800',
      'cursor:pointer',
    ].join(';');
    resetButton.addEventListener('click', () => {
      resetButton.disabled = true;
      resetDemoData().finally(() => {
        resetButton.disabled = false;
      });
    });

    actions.append(memoLink, resetButton);
    banner.append(badge, title, body, actions);
    document.body.appendChild(banner);
  }

  function buildSeed(base) {
    const seed = clone(base);
    const todayKey = dateKey(0);
    const unlockedIds = [
      'first_habit',
      'first_done',
      'first_id',
      'first_goal',
      'streak_3',
      'streak_7',
      'level_5',
      'xp_1k',
      'habits_5',
      'dw_60',
      'dw_300',
      'reflect_7',
      'workout_1',
      'workout_10',
      'workout_week_3',
      'pr_1',
      'checkin_7',
      'attr_15',
      'comp_50',
      'comp_100',
    ];

    seed.settings = {
      ...seed.settings,
      lang: 'en',
      langChoiceDone: true,
      onboarded: true,
      experienceMode: 'expanded',
      remTime: '07:30',
      modules: Object.fromEntries(Object.keys(seed.settings.modules).map((key) => [key, true])),
      modulePlacement: Object.fromEntries(Object.keys(seed.settings.modulePlacement).map((key) => [key, 'advanced'])),
      homeCards: {
        reflection: true,
        goals: true,
        fitness: true,
        achievements: true,
      },
    };

    seed.user = {
      name: 'Luca Rossi',
      level: 7,
      xp: 640,
      totalXp: 4820,
      xpNext: xpNextForLevel(7),
      freezes: 2,
    };

    seed.direction = {
      who: 'A calm operator who ships focused work without sacrificing health.',
      y1: 'Launch a polished template line, build recurring digital revenue, and keep a reliable weekly routine.',
      y5: 'Run a lean creative studio with strong systems, sharp energy, and location freedom.',
    };

    seed.identities = [
      {
        id: 'id_creator',
        name: 'Disciplined Creator',
        icon: '🧭',
        desc: 'Ships meaningful work in small consistent releases.',
        values: ['clarity', 'consistency', 'craft'],
        createdAt: dateKey(58),
      },
      {
        id: 'id_builder',
        name: 'Focused Operator',
        icon: '⚙️',
        desc: 'Protects deep work and closes loops every day.',
        values: ['focus', 'finish', 'leverage'],
        createdAt: dateKey(47),
      },
      {
        id: 'id_athlete',
        name: 'Strong Body',
        icon: '💪',
        desc: 'Builds durable energy through training, sleep, and walking.',
        values: ['energy', 'discipline', 'recovery'],
        createdAt: dateKey(44),
      },
    ];

    seed.goals = [
      {
        id: 'g_storefront',
        name: 'Launch the template storefront',
        desc: 'Publish a lean sales page, a safe brochure, and a live demo for outreach.',
        identityId: 'id_creator',
        deadline: dateKey(-32),
        milestones: [
          { text: 'Define product positioning', done: true },
          { text: 'Finish live demo flow', done: true },
          { text: 'Polish buyer documentation', done: true },
          { text: 'Prepare launch outreach list', done: false },
        ],
        progress: 75,
        createdAt: dateKey(26),
      },
      {
        id: 'g_focus',
        name: 'Hit 4 deep work blocks each week',
        desc: 'Protect focused build time before afternoon admin.',
        identityId: 'id_builder',
        deadline: dateKey(-18),
        milestones: [
          { text: 'Lock morning build window', done: true },
          { text: 'Reduce context switching after lunch', done: true },
          { text: 'Keep distraction log for one week', done: false },
        ],
        progress: 67,
        createdAt: dateKey(21),
      },
      {
        id: 'g_fitness',
        name: 'Train 16 times this month',
        desc: 'Balance lifting, mobility, and long walks to keep energy high.',
        identityId: 'id_athlete',
        deadline: dateKey(-23),
        milestones: [
          { text: 'Complete first 8 sessions', done: true },
          { text: 'Log body weight weekly', done: true },
          { text: 'Close month at 16 sessions', done: false },
        ],
        progress: 67,
        createdAt: dateKey(17),
      },
    ];

    seed.habits = [
      {
        id: 'h_plan',
        name: 'Morning planning',
        icon: '📝',
        color: '#00e5a0',
        cat: 'produttività',
        type: 'boolean',
        difficulty: 2,
        trigger: 'After coffee',
        target: '3 priorities',
        days: WEEKDAYS,
        identityId: 'id_creator',
        goalId: 'g_storefront',
        createdAt: dateKey(58),
      },
      {
        id: 'h_focus',
        name: 'Deep work block',
        icon: '⏱',
        color: '#0099ff',
        cat: 'produttività',
        type: 'time',
        difficulty: 3,
        trigger: '09:00 desk open',
        target: '50 min',
        days: WEEKDAYS,
        identityId: 'id_builder',
        goalId: 'g_focus',
        createdAt: dateKey(58),
      },
      {
        id: 'h_publish',
        name: 'Ship one visible improvement',
        icon: '🚀',
        color: '#fbbf24',
        cat: 'creativo',
        type: 'boolean',
        difficulty: 3,
        trigger: 'After the focus block',
        target: '1 meaningful push',
        days: [1, 3],
        identityId: 'id_creator',
        goalId: 'g_storefront',
        createdAt: dateKey(41),
      },
      {
        id: 'h_train',
        name: 'Workout or mobility',
        icon: '🏋️',
        color: '#ff6b35',
        cat: 'fitness',
        type: 'boolean',
        difficulty: 3,
        trigger: 'Late afternoon',
        target: '45 min',
        days: [0, 2, 4, 5],
        identityId: 'id_athlete',
        goalId: 'g_fitness',
        createdAt: dateKey(44),
      },
      {
        id: 'h_walk',
        name: '8k steps',
        icon: '🚶',
        color: '#8b5cf6',
        cat: 'salute',
        type: 'count',
        difficulty: 1,
        trigger: 'During the day',
        target: '8000',
        days: EVERYDAY,
        identityId: 'id_athlete',
        goalId: 'g_fitness',
        createdAt: dateKey(44),
      },
      {
        id: 'h_reflect',
        name: 'Evening reflection',
        icon: '🌙',
        color: '#00c2ff',
        cat: 'mente',
        type: 'boolean',
        difficulty: 2,
        trigger: 'Before sleep',
        target: '5 minutes',
        days: EVERYDAY,
        identityId: 'id_builder',
        goalId: 'g_focus',
        createdAt: dateKey(35),
      },
    ];

    const completionsByHabit = {
      h_plan: (daysAgo, dayIdx) => dayIdx < 5 && ![6, 19, 27, 34, 48].includes(daysAgo),
      h_focus: (daysAgo, dayIdx) => dayIdx < 5 && ![2, 9, 16, 23, 37, 45].includes(daysAgo),
      h_publish: (daysAgo, dayIdx) => [1, 3].includes(dayIdx) && ![10, 31].includes(daysAgo),
      h_train: (daysAgo, dayIdx) => [0, 2, 4, 5].includes(dayIdx) && ![5, 12, 26, 33, 47].includes(daysAgo),
      h_walk: (daysAgo) => ![3, 11, 24, 32, 39, 53].includes(daysAgo),
      h_reflect: (daysAgo) => ![4, 15, 22, 36, 49].includes(daysAgo),
    };

    for (let daysAgo = 0; daysAgo < 56; daysAgo += 1) {
      const key = dateKey(daysAgo);
      const dayIdx = dayIndexFromKey(key);
      for (const habit of seed.habits) {
        if (!habit.days.includes(dayIdx)) continue;
        const shouldComplete = completionsByHabit[habit.id]?.(daysAgo, dayIdx);
        if (!shouldComplete) continue;

        const hourMap = {
          h_plan: 7,
          h_focus: 9,
          h_publish: 11,
          h_train: 17,
          h_walk: 20,
          h_reflect: 22,
        };
        const minuteMap = {
          h_plan: 35,
          h_focus: 5,
          h_publish: 40,
          h_train: 30,
          h_walk: 10,
          h_reflect: 15,
        };
        const momentumMultiplier = daysAgo < 4 ? 1.2 : daysAgo < 11 ? 1.1 : 1;
        addCompletion(seed, habit, daysAgo, {
          hour: hourMap[habit.id],
          minute: minuteMap[habit.id],
          momentumMultiplier,
        });
      }
    }

    seed.habits = seed.habits.map((habit) => ({
      ...habit,
      streak: calcCurrentStreak(seed, habit.id),
      bestStreak: calcBestStreak(seed, habit.id),
    }));

    seed.identities = seed.identities.map((identity, index) => {
      const score = calcIdentityScore(seed, identity.id);
      const previousScore = [12, 8, 10][index] || 10;
      return {
        ...identity,
        score,
        history: makeHistory(score, previousScore),
        trend: '↑',
      };
    });

    seed.stats = {
      totalComp: Object.values(seed.completions).reduce((sum, day) => sum + Object.keys(day || {}).length, 0),
      bestStreak: Math.max(...seed.habits.map((habit) => habit.bestStreak || 0)),
      dwTotal: 535,
    };

    seed.deepWork = {
      sessions: [
        { date: todayKey, minutes: 55, goal: 'Demo flow cleanup', time: '09:05' },
        { date: dateKey(1), minutes: 45, goal: 'Buyer docs pass', time: '09:10' },
        { date: dateKey(2), minutes: 50, goal: 'Landing layout review', time: '09:00' },
        { date: dateKey(4), minutes: 40, goal: 'Refactor CTA copy', time: '08:55' },
        { date: dateKey(5), minutes: 60, goal: 'Template packaging', time: '09:15' },
        { date: dateKey(7), minutes: 35, goal: 'Metrics pass', time: '08:50' },
        { date: dateKey(8), minutes: 45, goal: 'Cloud demo prep', time: '09:20' },
        { date: dateKey(10), minutes: 55, goal: 'Accessibility cleanup', time: '09:05' },
        { date: dateKey(12), minutes: 70, goal: 'Dashboard polish', time: '08:45' },
        { date: dateKey(14), minutes: 80, goal: 'Release review', time: '09:00' },
      ],
      todayMin: 55,
      lastDate: todayKey,
      totalMin: 535,
      distractions: [
        { date: todayKey, time: '10:21', note: 'Checked marketplace competitors during build window' },
        { date: dateKey(3), time: '11:08', note: 'Jumped into admin before closing the current task' },
        { date: dateKey(8), time: '09:42', note: 'Opened analytics while still drafting copy' },
      ],
    };

    seed.studyPlan = {
      [todayKey]: [
        { topic: 'Finalize Cloudflare-ready demo files', done: true },
        { topic: 'Polish the seeded dashboard narrative', done: false },
        { topic: 'Prepare outreach notes for first buyers', done: false },
      ],
    };

    seed.reflections = {
      [todayKey]: {
        mood: 4,
        energy: 4,
        stress: 2,
        emotions: ['focused', 'grateful'],
        savedAt: isoAt(0, 22, 20),
        q0: 'The live demo finally feels credible and close to the real product.',
        q1: 'Closed the seeded dashboard, memo, and reset flow without bloating the codebase.',
        q2: 'Need one more pass on mobile spacing before publishing publicly.',
        q3: 'Keep tomorrow focused on launch assets, not on endless polishing.',
        q4: 'Calm, clear, and more decisive than yesterday.',
        goalReached: true,
      },
      [dateKey(1)]: {
        mood: 4,
        energy: 3,
        stress: 3,
        emotions: ['focused'],
        savedAt: isoAt(1, 22, 8),
        q0: 'The product pitch became much tighter.',
        q1: 'Defined the safe demo boundary and removed confusion around what gets shared.',
        q2: 'Spent too long comparing layouts before committing.',
        q3: 'Start from the actual product shell next time.',
        q4: 'Slightly tense but productive.',
      },
      [dateKey(2)]: {
        mood: 5,
        energy: 4,
        stress: 2,
        emotions: ['confident', 'focused'],
        savedAt: isoAt(2, 22, 2),
        q0: 'The dashboard now looks like a real daily workspace.',
        q1: 'Made visible progress that buyers can understand in seconds.',
        q2: 'Need a clearer memo for seeded content.',
        q3: 'Prepare a version that is easy to reset during demos.',
        q4: 'Sharp and optimistic.',
      },
      [dateKey(3)]: {
        mood: 3,
        energy: 3,
        stress: 3,
        emotions: ['tired'],
        savedAt: isoAt(3, 21, 52),
        q0: 'Some parts worked, others still felt too generic.',
        q1: 'Protected the morning work block.',
        q2: 'Need faster decisions on visual details.',
        q3: 'Ship the next pass with fewer revisions.',
        q4: 'A bit flat but steady.',
      },
      [dateKey(4)]: {
        mood: 4,
        energy: 4,
        stress: 2,
        emotions: ['steady'],
        savedAt: isoAt(4, 22, 11),
        q0: 'The buyer narrative is getting simpler.',
        q1: 'Clarified the difference between brochure, internal demo, and live demo.',
        q2: 'Still need a better launch checklist.',
        q3: 'Write the checklist first thing tomorrow.',
        q4: 'Grounded.',
      },
      [dateKey(5)]: {
        mood: 4,
        energy: 5,
        stress: 2,
        emotions: ['energized'],
        savedAt: isoAt(5, 22, 4),
        q0: 'Training helped reset the day.',
        q1: 'Finished the packaging pass faster than expected.',
        q2: 'Need to protect the afternoon from low-value tasks.',
        q3: 'Keep the next sprint front-loaded.',
        q4: 'Strong and clear.',
      },
      [dateKey(6)]: {
        mood: 4,
        energy: 4,
        stress: 2,
        emotions: ['grateful'],
        savedAt: isoAt(6, 21, 46),
        q0: 'The system feels usable, not theoretical.',
        q1: 'Stayed consistent across habits and work blocks.',
        q2: 'Need more sunlight and less desk time.',
        q3: 'Walk before lunch tomorrow.',
        q4: 'Content.',
      },
      [dateKey(7)]: {
        mood: 4,
        energy: 3,
        stress: 3,
        emotions: ['focused'],
        savedAt: isoAt(7, 22, 0),
        q0: 'A quieter day, but still a forward day.',
        q1: 'Closed small unfinished items instead of accumulating them.',
        q2: 'Could have started the hardest task earlier.',
        q3: 'Open with the high-friction task tomorrow.',
        q4: 'Measured.',
      },
    };

    seed.lifeAreas = {
      corpo: { xp: 260, level: 3, xpNext: 660 },
      mente: { xp: 210, level: 3, xpNext: 660 },
      spirito: { xp: 120, level: 2, xpNext: 500 },
      vocazione: { xp: 410, level: 4, xpNext: 900 },
      finanze: { xp: 150, level: 2, xpNext: 500 },
      sociale: { xp: 105, level: 2, xpNext: 500 },
    };

    seed.attributes = {
      strength: 14,
      focus: 17,
      intelligence: 15,
      discipline: 16,
      vitality: 13,
      presence: 12,
      points: 2,
    };

    seed.rewards = [
      { id: 'rw_coffee', name: 'Slow coffee break', icon: '☕', cost: 120, cat: 'small', desc: 'Step away for a real reset.' },
      { id: 'rw_dinner', name: 'Good dinner out', icon: '🍝', cost: 420, cat: 'lifestyle', desc: 'Celebrate a strong week with intention.' },
      { id: 'rw_dayoff', name: 'Offline half-day', icon: '🌿', cost: 900, cat: 'recovery', desc: 'Protect a real reset block without guilt.' },
    ];

    seed.rewardHistory = [
      { id: 'rw_coffee', name: 'Slow coffee break', icon: '☕', cost: 120, date: dateKey(6) },
    ];

    seed.skills = [
      {
        id: 'sk_copy',
        name: 'Offer positioning',
        cat: 'business',
        target: 60,
        note: 'Make the value obvious in one screen.',
        hours: 18.5,
        sessions: [
          { date: todayKey, min: 35, note: 'Tightened the live-demo promise.' },
          { date: dateKey(4), min: 45, note: 'Refined headline hierarchy.' },
          { date: dateKey(9), min: 30, note: 'Reworked the benefits stack.' },
        ],
      },
      {
        id: 'sk_ui',
        name: 'Product UI polish',
        cat: 'design',
        target: 80,
        note: 'Make the interface feel deliberate, not generic.',
        hours: 26.2,
        sessions: [
          { date: dateKey(1), min: 40, note: 'Dashboard spacing pass.' },
          { date: dateKey(6), min: 55, note: 'Improved hierarchy inside cards.' },
          { date: dateKey(13), min: 50, note: 'Aligned patterns across sections.' },
        ],
      },
    ];

    seed.library = [
      {
        id: 'lib_pressfield',
        title: 'The War of Art',
        author: 'Steven Pressfield',
        type: 'book',
        size: 190,
        xpReward: 120,
        progress: 64,
        done: false,
        addedAt: dateKey(20),
      },
      {
        id: 'lib_landing',
        title: 'High-converting landing page teardown',
        author: 'Internal notes',
        type: 'article',
        size: 1,
        xpReward: 60,
        progress: 100,
        done: true,
        addedAt: dateKey(12),
        completedAt: dateKey(5),
      },
      {
        id: 'lib_motion',
        title: 'Micro-interactions that feel premium',
        author: 'Design workshop',
        type: 'video',
        size: 42,
        xpReward: 90,
        progress: 35,
        done: false,
        addedAt: dateKey(8),
      },
    ];

    seed.visionBoard = [
      {
        id: 'vc_launch',
        icon: '🚀',
        area: 'vocazione',
        title: 'Launch a tiny portfolio of sellable templates',
        desc: 'A small catalog of products that can be shown, tested, and sold repeatedly.',
      },
      {
        id: 'vc_health',
        icon: '🌄',
        area: 'corpo',
        title: 'Steady mornings with movement and clarity',
        desc: 'Train, walk, and start the day without reactive phone time.',
      },
      {
        id: 'vc_freedom',
        icon: '🌍',
        area: 'finanze',
        title: 'Build recurring digital income',
        desc: 'Reduce dependence on one-off work by improving repeatable assets.',
      },
    ];

    seed.experiments = [
      {
        id: 'exp_publish',
        name: 'Ship before noon',
        hypothesis: 'Visible progress increases when the first public-facing task is closed before lunch.',
        habitId: 'h_publish',
        duration: 14,
        startDate: dateKey(10),
        endDate: dateKey(-3),
        active: true,
      },
      {
        id: 'exp_walk',
        name: 'Walk after lunch',
        hypothesis: 'A short walk reduces afternoon drift and improves second-block focus.',
        habitId: 'h_walk',
        duration: 10,
        startDate: dateKey(30),
        endDate: dateKey(20),
        active: false,
        results: '✅ Success - Afternoon focus improved and energy dips were lower on 7/10 days.',
      },
    ];

    seed.fitness = {
      goals: { weeklyWorkouts: 4, dailyWater: 8, sleepHours: 7.5, steps: 9000 },
      workouts: [
        { date: todayKey, type: 'Upper body', duration: 48, kcal: 410, note: 'Kept rest times tight.', muscles: ['push', 'pull'], xp: 72 },
        { date: dateKey(2), type: 'Leg day', duration: 54, kcal: 460, note: 'Good energy throughout.', muscles: ['legs'], xp: 81 },
        { date: dateKey(4), type: 'Mobility', duration: 30, kcal: 120, note: 'Focused on hips and thoracic spine.', muscles: ['mobility'], xp: 45 },
        { date: dateKey(6), type: 'Full body', duration: 50, kcal: 430, note: 'Solid compound work.', muscles: ['push', 'legs'], xp: 75 },
        { date: dateKey(9), type: 'Upper body', duration: 46, kcal: 395, note: 'Added one top set.', muscles: ['push', 'pull'], xp: 69 },
        { date: dateKey(11), type: 'Long walk', duration: 70, kcal: 250, note: 'Recovery session.', muscles: ['cardio'], xp: 60 },
      ],
      weightLog: [
        { date: todayKey, weight: 77.8 },
        { date: dateKey(7), weight: 78.1 },
        { date: dateKey(14), weight: 78.4 },
        { date: dateKey(21), weight: 78.6 },
        { date: dateKey(28), weight: 78.9 },
      ],
      prs: [
        { exercise: 'Bench Press', value: '92.5', unit: 'kg' },
        { exercise: 'Pull-up', value: '12', unit: 'reps' },
      ],
      water: {
        [todayKey]: 6,
        [dateKey(1)]: 8,
        [dateKey(2)]: 7,
        [dateKey(3)]: 8,
        [dateKey(4)]: 8,
        [dateKey(5)]: 6,
        [dateKey(6)]: 8,
      },
      checkins: {
        [todayKey]: { sleepHours: 7.3, steps: 8420, recovery: 7 },
        [dateKey(1)]: { sleepHours: 7.9, steps: 10120, recovery: 8 },
        [dateKey(2)]: { sleepHours: 7.1, steps: 8840, recovery: 7 },
        [dateKey(3)]: { sleepHours: 7.6, steps: 9360, recovery: 8 },
        [dateKey(4)]: { sleepHours: 7.8, steps: 11210, recovery: 9 },
        [dateKey(5)]: { sleepHours: 6.9, steps: 7650, recovery: 6 },
        [dateKey(6)]: { sleepHours: 8.0, steps: 10340, recovery: 8 },
      },
    };

    seed.achievements = unlockAchievements(seed.achievements, unlockedIds);
    seed.lastSave = new Date().toISOString();
    seed.tomorrow = {
      habits: ['h_plan', 'h_focus', 'h_walk', 'h_reflect'],
      tasks: [
        { text: 'Publish the live demo build to hosting', done: false },
        { text: 'Record a short walk-through video', done: false },
        { text: 'Draft outreach message for first buyers', done: true },
      ],
      intention: 'Keep tomorrow launch-oriented and avoid polishing loops.',
      p1: 'Ship the hosted demo and verify reset works from a clean browser.',
      p2: 'Tighten the template sales copy with one clearer promise.',
      p3: 'Prepare one concise message for outreach and feedback.',
    };

    return seed;
  }

  globalThis.AXIOM_DEMO_CONFIG = {
    enabled: true,
    storageKey: DEMO_STORAGE_KEY,
    legacyStorageKey: null,
    idbName: DEMO_IDB_NAME,
    lsFallbackKey: DEMO_FALLBACK_KEY,
    lifecycleLastRunKey: DEMO_LIFECYCLE_KEY,
    seedVersion: DEMO_SEED_VERSION,
    buildSeed,
  };

  if (!DEMO_FLAGS.presentation) {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', mountDemoBanner, { once: true });
    } else {
      mountDemoBanner();
    }
  }
})();

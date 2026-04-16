// ================================================================
// db-schema.js
// Shared database schema defaults + versioned migrations.
// Keeps db.js focused on persistence and reactive save lifecycle.
// ================================================================

(function initAxiomDbSchema(global) {
  const CURRENT_DB_VERSION = '2.2.2';

  function createDB() {
    return {
      user: { name:'', level:1, xp:0, totalXp:0, xpNext:1000, freezes:1 },
      habits: [],
      identities: [],
      goals: [],
      direction: { who:'', y1:'', y5:'' },
      completions: {},
      xpLog: {},
      activityLog: [],
      deepWork: { sessions:[], todayMin:0, lastDate:'', totalMin:0, distractions:[] },
      reflections: {},
      studyPlan: {},
      achievements: buildAchs(),
      experiments: [],
      packages: buildPkgs(),
      quotes: buildQuotes(),
      quests: {},
      events: [],
      settings: {
        accentColor:'#00e5a0', accentDark:'#00b87a',
        remTime:'08:00', reminderLastDate:'', theme:'nexus', lang:'en', langChoiceDone:false,
        experienceMode:'simple',
        coreNavPins: [],
        modules:{
          reflection:true, identity:true, goals:true,
          lifeAreas:true, fitness:true, attributes:true,
          rewards:true, skills:true, library:true, visionBoard:true,
          achievements:true, experiments:true, packages:true, quotes:true,
        },
        modulePlacement:{
          reflection:'advanced',
          identity:'advanced',
          goals:'advanced',
          lifeAreas:'advanced',
          fitness:'advanced',
          attributes:'advanced',
          rewards:'advanced',
          achievements:'advanced',
          skills:'hidden',
          library:'hidden',
          visionBoard:'hidden',
          experiments:'hidden',
          packages:'hidden',
          quotes:'hidden',
        },
        homeCards:{
          reflection:false,
          goals:false,
          fitness:false,
          achievements:false,
        },
        customization: {
          brandName: '',
          brandTagline: '',
          density: 'comfortable',
          corners: 'standard',
          backgroundFx: 'on',
        },
        rhythmCalendar: {
          rangeDays: 14,
          offsetDays: 0,
          selectedDateKey: '',
          visibleRows: {
            habits: true,
            focus: true,
            planning: true,
            checkins: true,
            reflection: true,
            momentum: true,
            mood: true,
          },
        },
      },
      lifeAreas:{
        corpo:    {xp:0,level:1,xpNext:500},
        mente:    {xp:0,level:1,xpNext:500},
        spirito:  {xp:0,level:1,xpNext:500},
        vocazione:{xp:0,level:1,xpNext:500},
        finanze:  {xp:0,level:1,xpNext:500},
        sociale:  {xp:0,level:1,xpNext:500},
      },
      attributes:{
        strength:10, focus:10, intelligence:10,
        discipline:10, vitality:10, presence:10, points:0,
      },
      rewards:[], rewardHistory:[], skills:[], library:[], visionBoard:[],
      stats: { totalComp:0, bestStreak:0, dwTotal:0 },
      fitness: {
        workouts:[],
        weightLog:[],
        prs:[],
        water:{},
        checkins:{},
        goals:{ weeklyWorkouts:3, dailyWater:8, sleepHours:8, steps:8000 },
      },
      lastSave: null,
      version: CURRENT_DB_VERSION,
      tomorrow: { habits:[], tasks:[], intention:'', p1:'', p2:'', p3:'' },
    };
  }

  function runDbMigrations(raw) {
    const version = raw.version || '2.0';

    if (_semverLt(version, '2.1')) {
      if (Array.isArray(raw.habits)) {
        raw.habits = raw.habits.map((habit) => ({ archived: false, ...habit }));
      }
      raw.version = '2.1';
      console.info('[AxiomDBSchema] Migration 2.0→2.1: archived field added.');
    }

    if (_semverLt(raw.version || version, '2.2')) {
      if (Array.isArray(raw.habits)) {
        raw.habits = raw.habits.map((habit) => ({ bestStreak: habit.streak || 0, ...habit }));
      }
      raw.version = '2.2';
      console.info('[AxiomDBSchema] Migration 2.1→2.2: bestStreak normalized.');
    }

    raw.version = CURRENT_DB_VERSION;
    return raw;
  }

  function _semverLt(a, b) {
    const [aMaj, aMin] = String(a).split('.').map(Number);
    const [bMaj, bMin] = String(b).split('.').map(Number);
    return aMaj < bMaj || (aMaj === bMaj && aMin < bMin);
  }

  global.AxiomDBSchema = Object.freeze({
    CURRENT_DB_VERSION,
    createDB,
    runDbMigrations,
  });

  global.CURRENT_DB_VERSION = CURRENT_DB_VERSION;
  global.createDB = createDB;
  global.runDbMigrations = runDbMigrations;
})(typeof globalThis !== 'undefined' ? globalThis : window);

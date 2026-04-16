// db.js — Data Layer v3 (schema upgrade: multi-store IDB)
//
// CHANGES FROM v2 (drop-in compatible):
//  • IDB_VERSION bumped 2 → 3 to trigger archive store creation
//    (handled transparently by onupgradeneeded).
//  • NexusDB.save() now uses structured clone of a SAFE COPY
//    of db — excludes Proxy wrappers to avoid IDB serialisation
//    issues with certain engines.
//  • Added NexusDB.estimateSize() helper for the storage report.
//  • All other public API identical to v2.
//
// DEPENDS ON: constants.js (KEY, APP_CONSTANTS), toast.js (Toast)

const CURRENT_DB_VERSION = globalThis.AxiomDBSchema?.CURRENT_DB_VERSION || '2.2.2';

const createDB = globalThis.AxiomDBSchema?.createDB || function createDB() {
  return {
    user: { name:'', level:1, xp:0, totalXp:0, xpNext:1000, freezes:1 },
    habits: [],
    identities: [],
    goals: [],
    direction: { who:'', y1:'', y5:'' },
    // ── Hot-tier keys ──────────────────────────────────────
    // completions and xpLog are the primary growth vectors.
    // DataLifecycleManager archives entries older than 90 days,
    // keeping these objects bounded to ~90 × activeHabits entries.
    completions: {},
    xpLog: {},
    activityLog: [],
    // ── Remainder of schema unchanged ─────────────────────
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
};

// NexusDB — IndexedDB Async Storage Layer v9
//
//  v9 changes (vs v8):
//    • IDB_VERSION = 3 — triggers archive store creation via
//      DataLifecycleManager's onupgradeneeded handler.
//      NexusDB only owns the `state` store; the `archive` store
//      is created by storage-lifecycle.js opening the same DB.
//      Both open IDB_VERSION=3 so upgrades happen once.
//    • _safeCopy() strips Proxy wrappers before IDB put() to
//      prevent "DataCloneError" on Safari / Firefox with Proxy.
//    • estimateSize() helper for storage health reporting.
//
const NexusDB = (() => {
  const DEMO_CFG = globalThis.AXIOM_DEMO_CONFIG?.enabled ? globalThis.AXIOM_DEMO_CONFIG : null;
  const BUILD_CFG = globalThis.AXIOM_BUILD || null;
  const hasDemoValue = (key) => !!(DEMO_CFG && Object.prototype.hasOwnProperty.call(DEMO_CFG, key));
  const hasBuildValue = (key) => !!(BUILD_CFG && Object.prototype.hasOwnProperty.call(BUILD_CFG, key));
  const STORAGE_KEY = hasDemoValue('storageKey') ? DEMO_CFG.storageKey : hasBuildValue('storageKey') ? BUILD_CFG.storageKey : KEY;
  const LEGACY_STORAGE_KEY = hasDemoValue('legacyStorageKey') ? DEMO_CFG.legacyStorageKey : hasBuildValue('legacyStorageKey') ? BUILD_CFG.legacyStorageKey : KEY;
  const IDB_NAME    = hasDemoValue('idbName') ? DEMO_CFG.idbName : hasBuildValue('idbName') ? BUILD_CFG.idbName : 'nexus_idb';
  const IDB_VERSION = 3;      // ← v3: archive store added
  const STORE       = hasDemoValue('storeName') ? DEMO_CFG.storeName : 'state';
  const REC_KEY     = hasDemoValue('recordKey') ? DEMO_CFG.recordKey : 'db';
  const LS_FALLBACK = hasDemoValue('lsFallbackKey') ? DEMO_CFG.lsFallbackKey : hasBuildValue('lsFallbackKey') ? BUILD_CFG.lsFallbackKey : STORAGE_KEY + '_idb_fallback';
  let _idb = null;
  let _idbAvailable = true;

  /** Opens IDB connection (cached). */
  function _open() {
    if (_idb) return Promise.resolve(_idb);
    if (!_idbAvailable) return Promise.reject(new Error('IDB not available'));

    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = (e) => {
          const idb    = e.target.result;
          const oldVer = e.oldVersion;

          // v0 → v1: create state store
          if (oldVer < 1) {
            idb.createObjectStore(STORE);
          }
          // v1 → v2: (reserved — no schema change in v2)
          // v2 → v3: archive store — created by storage-lifecycle.js
          //          which opens the same DB at IDB_VERSION=3.
          //          If storage-lifecycle.js loads first, the store
          //          already exists when NexusDB opens. If NexusDB
          //          opens first, we create it here proactively so
          //          the archive store is always present regardless
          //          of script load order.
          if (oldVer < 3) {
            if (!idb.objectStoreNames.contains('archive')) {
              const archiveStore = idb.createObjectStore('archive', { keyPath: 'period' });
              archiveStore.createIndex('by_type',    'type',      { unique: false });
              archiveStore.createIndex('by_created', 'createdAt', { unique: false });
            }
          }

          console.info(`[NexusDB] Schema upgraded v${oldVer} → ${IDB_VERSION}`);
        };

        req.onsuccess  = (e) => {
          _idb = e.target.result;
          _idb.onversionchange = () => { _idb.close(); _idb = null; };
          resolve(_idb);
        };
        req.onerror    = (e) => reject(e.target.error);
        req.onblocked  = ()  => console.warn('[NexusDB] IDB blocked by another tab');
      } catch (e) {
        _idbAvailable = false;
        reject(e);
      }
    });
  }

  async function _read() {
    const idb = await _open();
    return new Promise((resolve, reject) => {
      try {
        const req = idb.transaction(STORE, 'readonly')
                       .objectStore(STORE)
                       .get(REC_KEY);
        req.onsuccess = (e) => resolve(e.target.result ?? null);
        req.onerror   = (e) => reject(e.target.error);
      } catch (e) { reject(e); }
    });
  }

  /**
   * Strips Proxy wrappers from db.user and db.stats before serialisation.
   * IDB structured-clone throws DataCloneError on Proxy objects in some
   * browsers. JSON round-trip is the safest cross-browser approach.
   *
   * This is called inside save() — callers don't need to think about it.
   * @param {Object} data - raw db object
   * @returns {Object} plain object safe for IDB put()
   */
  function _safeCopy(data) {
    try {
      // JSON round-trip strips Proxies, functions, and undefined values
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      console.warn('[NexusDB] _safeCopy failed, using raw object:', e);
      return data;
    }
  }

  /**
   * Saves db to IDB with localStorage fallback.
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async function save(data) {
    const payload = _safeCopy(data);
    try {
      const idb = await _open();
      await new Promise((resolve, reject) => {
        const req = idb.transaction(STORE, 'readwrite')
                       .objectStore(STORE)
                       .put(payload, REC_KEY);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[NexusDB] IDB save failed, using localStorage:', e);
      _idbAvailable = false;
      try {
        localStorage.setItem(LS_FALLBACK, JSON.stringify(payload));
        if (!save._warnedFallback) {
          save._warnedFallback = true;
          Toast.show('⚠ Using local storage — export your data', '⚠', 'info', 6000);
        }
      } catch (le) {
        console.error('[NexusDB] localStorage also failed:', le);
        Toast.show('❌ Save failed! Export your data now.', '❌', 'info', 8000);
      }
    }
  }

  async function clear() {
    try {
      const idb = await _open();
      await new Promise((resolve, reject) => {
        const req = idb.transaction(STORE, 'readwrite')
                       .objectStore(STORE)
                       .delete(REC_KEY);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[NexusDB] clear failed:', e);
    }
    try { localStorage.removeItem(LS_FALLBACK); } catch (_) {}
  }

  /** Migration from v7 localStorage → IDB (runs once, then removes LS key). */
  async function _migrate() {
    if (!LEGACY_STORAGE_KEY) return null;
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        await save(parsed);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (LEGACY_STORAGE_KEY === KEY) localStorage.removeItem(KEY + '_backup');
        console.info('[NexusDB] ✅ Migration localStorage (v7) → IDB complete.');
        return parsed;
      }
    } catch (e) {
      console.warn('[NexusDB] v7 migration failed:', e);
    }
    try {
      const raw = localStorage.getItem(LS_FALLBACK);
      if (raw) {
        console.info('[NexusDB] Restoring from localStorage fallback.');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[NexusDB] localStorage fallback read failed:', e);
    }
    return null;
  }

  /** Incremental schema migrations on the data object. */
  const _runMigrations = globalThis.AxiomDBSchema?.runDbMigrations || function _runMigrations(raw) {
    const v = raw.version || '2.0';

    if (_semverLt(v, '2.1')) {
      if (Array.isArray(raw.habits)) {
        raw.habits = raw.habits.map((h) => ({ archived: false, ...h }));
      }
      raw.version = '2.1';
      console.info('[NexusDB] Migration 2.0→2.1: archived field added.');
    }

    if (_semverLt(v, '2.2')) {
      if (Array.isArray(raw.habits)) {
        raw.habits = raw.habits.map((h) => ({ bestStreak: h.streak || 0, ...h }));
      }
      raw.version = '2.2';
      console.info('[NexusDB] Migration 2.1→2.2: bestStreak normalised.');
    }

    // Future: add _semverLt(v, '2.3') blocks here.
    raw.version = CURRENT_DB_VERSION;

    return raw;
  };

  function _semverLt(a, b) {
    const [aMaj, aMin] = a.split('.').map(Number);
    const [bMaj, bMin] = b.split('.').map(Number);
    return aMaj < bMaj || (aMaj === bMaj && aMin < bMin);
  }

  /**
   * Estimates the serialised byte size of a data object.
   * Uses Blob if available (accurate), falls back to JSON.length (approx).
   * @param {Object} data
   * @returns {number} bytes
   */
  function estimateSize(data) {
    try {
      const json = JSON.stringify(data);
      if (typeof Blob !== 'undefined') {
        return new Blob([json]).size;
      }
      return new TextEncoder().encode(json).length;
    } catch {
      return -1;
    }
  }

  function _isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function _asArray(value, fallback) {
    return Array.isArray(value) ? value : fallback;
  }

  function _asObject(value, fallback) {
    return _isPlainObject(value) ? value : fallback;
  }

  function _normaliseAchievements(rawAchievements, defaultAchievements) {
    const incoming = Array.isArray(rawAchievements) ? rawAchievements : [];
    const incomingById = new Map(
      incoming
        .filter((achievement) => achievement && typeof achievement === 'object' && achievement.id)
        .map((achievement) => [achievement.id, achievement])
    );
    const knownIds = new Set(defaultAchievements.map((achievement) => achievement.id));

    const mergedDefaults = defaultAchievements.map((achievement) => {
      const rawAchievement = incomingById.get(achievement.id) || {};
      const unlocked = isAchievementUnlocked(rawAchievement);
      return {
        ...achievement,
        ...rawAchievement,
        u: unlocked,
        unlocked,
        seen: Boolean(rawAchievement.seen),
      };
    });

    const extraAchievements = incoming
      .filter((achievement) => achievement && typeof achievement === 'object' && !knownIds.has(achievement.id))
      .map((achievement) => {
        const unlocked = isAchievementUnlocked(achievement);
        return {
          ...achievement,
          u: unlocked,
          unlocked,
          seen: Boolean(achievement.seen),
        };
      });

    return mergedDefaults.concat(extraAchievements);
  }

  async function _bootstrapDemoSeed(raw) {
    if (!DEMO_CFG) return raw;

    const seedVersion = String(DEMO_CFG.seedVersion || '1');
    const meta = raw && typeof raw === 'object' ? raw.__demoMeta : null;
    const needsSeed = DEMO_CFG.forceReseed === true || !raw || meta?.seedVersion !== seedVersion;

    if (!needsSeed) return raw;

    let seeded = createDB();
    if (typeof DEMO_CFG.buildSeed === 'function') {
      try {
        const candidate = DEMO_CFG.buildSeed(createDB());
        if (candidate && typeof candidate === 'object') seeded = candidate;
      } catch (e) {
        console.warn('[NexusDB] Demo seed builder failed, using defaults:', e);
      }
    }

    seeded.__demoMeta = {
      ...(seeded.__demoMeta || {}),
      seedVersion,
      generatedAt: new Date().toISOString(),
    };

    await save(seeded);
    return seeded;
  }

  async function init() {
    try {
      let raw = await _read().catch(() => null);
      if (!raw) raw = await _migrate();
      raw = await _bootstrapDemoSeed(raw);
      if (raw) {
        raw = _runMigrations(raw);
        const def = createDB();
        const rawSettings = _asObject(raw.settings, {});
        const rawFitness = _asObject(raw.fitness, {});
        const rawDeepWork = _asObject(raw.deepWork, {});
        return {
          ...def,
          ..._asObject(raw, {}),
          user:         { ...def.user, ..._asObject(raw.user, {}) },
          habits:       _asArray(raw.habits, def.habits),
          identities:   _asArray(raw.identities, def.identities),
          goals:        _asArray(raw.goals, def.goals),
          direction:    { ...def.direction, ..._asObject(raw.direction, {}) },
          completions:  _asObject(raw.completions, def.completions),
          xpLog:        _asObject(raw.xpLog, def.xpLog),
          activityLog:  _asArray(raw.activityLog, def.activityLog),
          deepWork:     {
            ...def.deepWork,
            ...rawDeepWork,
            sessions: _asArray(rawDeepWork.sessions, def.deepWork.sessions),
            distractions: _asArray(rawDeepWork.distractions, def.deepWork.distractions),
          },
          reflections:  _asObject(raw.reflections, def.reflections),
          studyPlan:    _asObject(raw.studyPlan, def.studyPlan),
          achievements: _normaliseAchievements(raw.achievements, def.achievements),
          experiments:  _asArray(raw.experiments, def.experiments),
          packages:     _asArray(raw.packages, def.packages),
          quotes:       _asArray(raw.quotes, def.quotes),
          quests:       _asObject(raw.quests, def.quests),
          events:       _asArray(raw.events, def.events),
          settings:     {
            ...def.settings,
            ...rawSettings,
            langChoiceDone: rawSettings.langChoiceDone ?? Boolean(rawSettings.lang),
            experienceMode: rawSettings.experienceMode || def.settings.experienceMode,
            coreNavPins: _asArray(rawSettings.coreNavPins, def.settings.coreNavPins),
            modules: { ...def.settings.modules, ..._asObject(rawSettings.modules, {}) },
            modulePlacement: { ...def.settings.modulePlacement, ..._asObject(rawSettings.modulePlacement, {}) },
            homeCards: { ...def.settings.homeCards, ..._asObject(rawSettings.homeCards, {}) },
            customization: {
              ...def.settings.customization,
              ..._asObject(rawSettings.customization, {}),
            },
            rhythmCalendar: {
              ...def.settings.rhythmCalendar,
              ..._asObject(rawSettings.rhythmCalendar, {}),
              visibleRows: {
                ...def.settings.rhythmCalendar.visibleRows,
                ..._asObject(rawSettings.rhythmCalendar?.visibleRows, {}),
              },
            },
          },
          lifeAreas:    { ...def.lifeAreas, ..._asObject(raw.lifeAreas, {}) },
          attributes:   { ...def.attributes, ..._asObject(raw.attributes, {}) },
          rewards:      _asArray(raw.rewards, def.rewards),
          rewardHistory:_asArray(raw.rewardHistory, def.rewardHistory),
          skills:       _asArray(raw.skills, def.skills),
          library:      _asArray(raw.library, def.library),
          visionBoard:  _asArray(raw.visionBoard, def.visionBoard),
          stats:        { ...def.stats, ..._asObject(raw.stats, {}) },
      fitness:      {
        ...def.fitness,
        ...rawFitness,
        workouts: _asArray(rawFitness.workouts, def.fitness.workouts),
        weightLog: _asArray(rawFitness.weightLog, def.fitness.weightLog),
        prs: _asArray(rawFitness.prs, def.fitness.prs),
        water: _asObject(rawFitness.water, def.fitness.water),
        checkins: _asObject(rawFitness.checkins, def.fitness.checkins),
        goals: { ...def.fitness.goals, ..._asObject(rawFitness.goals, def.fitness.goals) },
      },
          lastSave:     raw.lastSave || def.lastSave,
          version:      CURRENT_DB_VERSION,
          tomorrow:     { ...def.tomorrow, ..._asObject(raw.tomorrow, {}) },
        };
      }
    } catch (e) {
      console.error('[NexusDB] Init failed, starting fresh:', e);
    }
    return createDB();
  }

  return { init, save, clear, estimateSize };
})();


let db = createDB();

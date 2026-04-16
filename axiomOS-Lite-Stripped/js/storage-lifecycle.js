// ══════════════════════════════════════════════════════════════
// storage-lifecycle.js — Data Lifecycle Manager v1.0
// ══════════════════════════════════════════════════════════════
//
// ARCHITECTURE OVERVIEW
// ─────────────────────
//  Hot tier  (0 – HOT_WINDOW_DAYS):
//    Full-resolution daily logs live in the main `db` object
//    (db.completions, db.xpLog) exactly as before — zero migration
//    needed for current data.
//
//  Cold tier (> HOT_WINDOW_DAYS):
//    Daily logs older than the hot window are aggregated into
//    monthly summaries and written to the IDB `archive` object
//    store. The raw daily entries are then deleted from the
//    main `db` object, keeping it lean forever.
//
//  Archive schema (IDB key: "monthly:YYYY-MM")
//  ────────────────────────────────────────────
//  {
//    type:    'monthly',
//    period:  'YYYY-MM',
//    habits: {
//      [habitId]: {
//        completions:     number,   // total days completed
//        daysScheduled:   number,   // days habit was active
//        completionRate:  number,   // 0–1
//        xpEarned:        number,
//        streakPeak:      number,
//      }
//    },
//    totals: {
//      daysWithAnyCompletion: number,
//      totalCompletions:      number,
//      totalXP:               number,
//      perfectDays:           number,
//      freezesUsed:           number,
//    },
//    createdAt:  ISO string,
//    updatedAt:  ISO string,
//    version:    1,
//  }
//
// QUOTA FAIL-SAFE
// ───────────────
//  If navigator.storage.estimate() shows usage > QUOTA_WARN_RATIO,
//  the oldest archived month(s) are deleted until usage drops
//  below the threshold. Non-critical cold data is sacrificed first.
//
// LOAD ORDER: after db.js, before init.js
// GLOBALS CONSUMED: db, saveDB, APP_CONSTANTS
// GLOBALS EXPOSED:  DataLifecycleManager (singleton)
//
// ══════════════════════════════════════════════════════════════

const DataLifecycleManager = (() => {
  'use strict';

  // ── Configuration ──────────────────────────────────────────
  const DEMO_CFG = globalThis.AXIOM_DEMO_CONFIG?.enabled ? globalThis.AXIOM_DEMO_CONFIG : null;
  const hasDemoValue = (key) => !!(DEMO_CFG && Object.prototype.hasOwnProperty.call(DEMO_CFG, key));
  const CFG = Object.freeze({
    /** Days to keep as full-resolution hot data. */
    HOT_WINDOW_DAYS: hasDemoValue('hotWindowDays') ? DEMO_CFG.hotWindowDays : 90,

    /** IDB database name (must match NexusDB in db.js). */
    IDB_NAME: hasDemoValue('idbName') ? DEMO_CFG.idbName : 'nexus_idb',

    /** IDB version for the multi-store schema (v3). */
    IDB_VERSION: hasDemoValue('idbVersion') ? DEMO_CFG.idbVersion : 3,

    /** Object store for the main db blob (existing). */
    STORE_STATE: 'state',

    /** Object store for cold aggregated archive records (new). */
    STORE_ARCHIVE: 'archive',

    /** localStorage key recording the last lifecycle run timestamp. */
    LAST_RUN_KEY: hasDemoValue('lifecycleLastRunKey') ? DEMO_CFG.lifecycleLastRunKey : 'nexus_lifecycle_last_run',

    /** Minimum hours between automatic lifecycle runs. */
    MIN_RUN_INTERVAL_H: 23,

    /** Storage usage ratio that triggers the fail-safe pruner. */
    QUOTA_WARN_RATIO: 0.82,

    /** Ratio at which pruning stops. */
    QUOTA_TARGET_RATIO: 0.70,

    /** Archive schema version — bump when shape changes. */
    ARCHIVE_VERSION: 2,
  });

  // ── IDB connection (separate from NexusDB to avoid coupling) ─
  let _db3 = null;

  /**
   * Opens the v3 IDB (creates archive store if upgrading from v1/v2).
   * @returns {Promise<IDBDatabase>}
   */
  function _openV3() {
    if (_db3) return Promise.resolve(_db3);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CFG.IDB_NAME, CFG.IDB_VERSION);

      req.onupgradeneeded = (e) => {
        const idb    = e.target.result;
        const oldVer = e.oldVersion;

        // v0 → v1: main state store (NexusDB already created this)
        if (oldVer < 1) {
          idb.createObjectStore(CFG.STORE_STATE);
        }

        // v2 → v3: cold archive store with period index
        if (oldVer < 3) {
          if (!idb.objectStoreNames.contains(CFG.STORE_ARCHIVE)) {
            const archiveStore = idb.createObjectStore(CFG.STORE_ARCHIVE, { keyPath: 'period' });
            // Index lets us query date ranges efficiently without full scan
            archiveStore.createIndex('by_type',   'type',      { unique: false });
            archiveStore.createIndex('by_created', 'createdAt', { unique: false });
          }
        }

        console.info(`[Lifecycle] IDB schema upgraded v${oldVer} → v${CFG.IDB_VERSION}`);
      };

      req.onsuccess = (e) => {
        _db3 = e.target.result;
        // Reopen cleanly if another tab upgrades the schema concurrently
        _db3.onversionchange = () => { _db3.close(); _db3 = null; };
        resolve(_db3);
      };

      req.onerror   = (e) => reject(e.target.error);
      req.onblocked = ()  => console.warn('[Lifecycle] IDB upgrade blocked by another tab.');
    });
  }

  // ── Archive I/O ───────────────────────────────────────────

  /**
   * Reads one archive record from IDB.
   * @param {string} period - 'YYYY-MM'
   * @returns {Promise<Object|null>}
   */
  async function _readArchive(period) {
    const idb = await _openV3();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(CFG.STORE_ARCHIVE, 'readonly')
                     .objectStore(CFG.STORE_ARCHIVE)
                     .get(period);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /**
   * Writes an archive record to IDB (upsert).
   * @param {Object} record - must include `period` as key
   * @returns {Promise<void>}
   */
  async function _writeArchive(record) {
    const idb = await _openV3();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(CFG.STORE_ARCHIVE, 'readwrite')
                     .objectStore(CFG.STORE_ARCHIVE)
                     .put(record);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /**
   * Reads all archive records, optionally filtered by period prefix.
   * @param {string} [prefix] - e.g. '2023' returns all months of 2023
   * @returns {Promise<Object[]>}
   */
  async function _listArchive(prefix) {
    const idb = await _openV3();
    return new Promise((resolve, reject) => {
      const store   = idb.transaction(CFG.STORE_ARCHIVE, 'readonly')
                         .objectStore(CFG.STORE_ARCHIVE);
      const range   = prefix
        ? IDBKeyRange.bound(prefix, prefix + '\uffff')
        : undefined;
      const req     = store.getAll(range);
      req.onsuccess = (e) => resolve(e.target.result ?? []);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /**
   * Deletes an archive record by period key.
   * @param {string} period
   * @returns {Promise<void>}
   */
  async function _deleteArchive(period) {
    const idb = await _openV3();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(CFG.STORE_ARCHIVE, 'readwrite')
                     .objectStore(CFG.STORE_ARCHIVE)
                     .delete(period);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── Date utilities ────────────────────────────────────────

  /**
   * Returns an ISO date string offset by `offsetDays` from today.
   * @param {number} offsetDays - negative = past
   * @returns {string} 'YYYY-MM-DD'
   */
  function _dateOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Returns all YYYY-MM months (sorted ascending) whose data sits fully
   * outside the hot window, i.e. every day in the month is older than
   * HOT_WINDOW_DAYS.
   *
   * Note: the CURRENT month is always excluded (it may still be active).
   * @param {string[]} dateKeys - all date keys present in db.completions
   * @returns {string[]} - e.g. ['2023-11', '2023-12']
   */
  function _coldMonths(dateKeys) {
    const cutoff    = _dateOffset(-CFG.HOT_WINDOW_DAYS); // 'YYYY-MM-DD'
    const cutoffYM  = cutoff.slice(0, 7);                // 'YYYY-MM'
    const currentYM = new Date().toISOString().slice(0, 7);

    const months = new Set();
    dateKeys.forEach((k) => {
      // Only date keys ('YYYY-MM-DD'), not freeze markers ('YYYY-MM-DD_freeze')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const ym = k.slice(0, 7);
      if (ym < cutoffYM && ym !== currentYM) months.add(ym);
    });

    return Array.from(months).sort();
  }

  function _sumNumbers(values) {
    return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function _monthEntriesFromObject(obj, yearMonth) {
    return Object.entries(obj || {}).filter(([key]) => key.startsWith(yearMonth));
  }

  function _monthEntriesFromArray(items, yearMonth, dateField = 'date') {
    return (items || []).filter((item) => typeof item?.[dateField] === 'string' && item[dateField].startsWith(yearMonth));
  }

  function _buildSupplementalAggregate(yearMonth) {
    const reflections = _monthEntriesFromObject(db?.reflections, yearMonth).map(([, value]) => value || {});
    const workouts = _monthEntriesFromArray(db?.fitness?.workouts, yearMonth);
    const weightLog = _monthEntriesFromArray(db?.fitness?.weightLog, yearMonth);
    const waterEntries = _monthEntriesFromObject(db?.fitness?.water, yearMonth);
    const sessions = _monthEntriesFromArray(db?.deepWork?.sessions, yearMonth);
    const distractions = _monthEntriesFromArray(db?.deepWork?.distractions, yearMonth);

    const moods = reflections.map((entry) => Number(entry.mood) || 0).filter(Boolean);
    const workoutMinutes = _sumNumbers(workouts.map((entry) => entry.duration));
    const workoutCalories = _sumNumbers(workouts.map((entry) => entry.kcal));
    const weights = weightLog.map((entry) => Number(entry.weight)).filter((value) => Number.isFinite(value));
    const waterValues = waterEntries.map(([, value]) => Number(value) || 0);
    const deepWorkMinutes = _sumNumbers(sessions.map((entry) => entry.minutes));

    return {
      deepWork: {
        sessions: sessions.length,
        totalMinutes: deepWorkMinutes,
        longestSession: sessions.reduce((max, entry) => Math.max(max, Number(entry.minutes) || 0), 0),
        distractions: distractions.length,
        activeDays: new Set(sessions.map((entry) => entry.date)).size,
      },
      reflections: {
        entries: reflections.length,
        moodAverage: moods.length ? Math.round((_sumNumbers(moods) / moods.length) * 100) / 100 : 0,
        goalReachedCount: reflections.filter((entry) => Boolean(entry.goalReached)).length,
      },
      fitness: {
        workouts: workouts.length,
        workoutMinutes,
        workoutCalories,
        weightEntries: weightLog.length,
        weightAverage: weights.length ? Math.round((_sumNumbers(weights) / weights.length) * 100) / 100 : 0,
        weightMin: weights.length ? Math.min(...weights) : null,
        weightMax: weights.length ? Math.max(...weights) : null,
        waterDays: waterEntries.length,
        waterTotal: _sumNumbers(waterValues),
      },
    };
  }

  // ── Aggregation ───────────────────────────────────────────

  /**
   * Builds a monthly archive record from raw daily completions and xpLog.
   *
   * @param {string}   yearMonth  - 'YYYY-MM'
   * @param {Object}   completions - db.completions slice for this month
   * @param {Object}   xpLog       - db.xpLog slice for this month
   * @param {Object[]} habits      - db.habits at time of archiving
   * @returns {Object} archive record
   */
  function _buildMonthlyAggregate(yearMonth, completions, xpLog, habits) {
    const habitMap = {};
    habits.forEach((h) => {
      habitMap[h.id] = {
        completions:    0,
        daysScheduled:  0,
        xpEarned:       0,
        streakPeak:     0,
      };
    });

    let daysWithAny   = 0;
    let totalComps    = 0;
    let totalXP       = 0;
    let perfectDays   = 0;
    let freezesUsed   = 0;

    // Track consecutive completions per habit within month for streakPeak
    const _habitStreak = {};

    // Iterate days of the month in order
    const daysInMonth = new Date(
      parseInt(yearMonth.slice(0, 4)),
      parseInt(yearMonth.slice(5, 7)),
      0
    ).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dayKey = `${yearMonth}-${String(d).padStart(2, '0')}`;
      const dayComps = completions[dayKey] || {};
      const isFrozen = !!completions[`${dayKey}_freeze`];

      if (isFrozen) { freezesUsed++; }

      const completedHabits = Object.keys(dayComps);
      if (completedHabits.length > 0 || isFrozen) daysWithAny++;

      // Determine scheduled habits for this day (by day-of-week)
      const dayOfWeek = new Date(dayKey).getDay(); // 0=Sun
      // Convert to Mon-based index (our app uses 0=Mon)
      const dow = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      let scheduledCount = 0;

      habits.forEach((h) => {
        if (!habitMap[h.id]) return;
        const scheduled = !h.days || h.days.length === 0 || h.days.includes(dow);
        if (scheduled) {
          habitMap[h.id].daysScheduled++;
          scheduledCount++;
        }

        const completed = !!dayComps[h.id] || (typeof dayComps[h.id] === 'number' && dayComps[h.id] > 0);
        if (completed) {
          habitMap[h.id].completions++;
          totalComps++;

          // Track intra-month streak peak
          _habitStreak[h.id] = (_habitStreak[h.id] || 0) + 1;
          if (_habitStreak[h.id] > habitMap[h.id].streakPeak) {
            habitMap[h.id].streakPeak = _habitStreak[h.id];
          }
        } else {
          _habitStreak[h.id] = 0;
        }
      });

      completedHabits.forEach((hid) => {
        if (habitMap[hid]) {
          // xpLog is per-day total, not per-habit — attribute proportionally
          // (exact per-habit XP isn't stored, this is a best-effort estimate)
        }
      });

      if (scheduledCount > 0 && completedHabits.length >= scheduledCount) perfectDays++;
    }

    // Attribute xpLog to the month
    Object.entries(xpLog).forEach(([dateKey, xp]) => {
      if (dateKey.startsWith(yearMonth)) totalXP += xp;
    });

    // Compute completion rates
    Object.values(habitMap).forEach((h) => {
      h.completionRate = h.daysScheduled > 0
        ? Math.round((h.completions / h.daysScheduled) * 1000) / 1000
        : 0;
    });

    const supplemental = _buildSupplementalAggregate(yearMonth);

    return {
      type:    'monthly',
      period:  yearMonth,
      habits:  habitMap,
      totals: {
        daysWithAnyCompletion: daysWithAny,
        totalCompletions:      totalComps,
        totalXP,
        perfectDays,
        freezesUsed,
        daysInMonth,
      },
      deepWork: supplemental.deepWork,
      reflections: supplemental.reflections,
      fitness: supplemental.fitness,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version:   CFG.ARCHIVE_VERSION,
    };
  }

  // ── Core lifecycle operations ─────────────────────────────

  /**
   * Archives cold months: aggregates them and strips daily logs from db.
   *
   * For each cold month:
   *  1. Build monthly aggregate from db.completions + db.xpLog
   *  2. Merge with any existing archive record for that month
   *  3. Write to IDB archive store
   *  4. Remove daily keys from db.completions and db.xpLog
   *
   * Mutates db in place. Caller must call saveDB() after.
   *
   * @returns {Promise<{ archived: number, bytesFreed: number }>}
   */
  async function archiveOldData() {
    if (!db || !db.completions) return { archived: 0, bytesFreed: 0 };

    const allKeys  = Object.keys(db.completions);
    const months   = _coldMonths(allKeys);

    if (months.length === 0) {
      console.info('[Lifecycle] No cold months to archive.');
      return { archived: 0, bytesFreed: 0 };
    }

    let archived    = 0;
    let bytesFreed  = 0;

    for (const ym of months) {
      try {
        // ── 1. Slice this month's completions ─────────────────
        const monthCompletions = {};
        const keysToDelete     = [];

        Object.entries(db.completions).forEach(([k, v]) => {
          if (k.startsWith(ym)) {
            monthCompletions[k] = v;
            keysToDelete.push(k);
          }
        });

        // ── 2. Slice this month's xpLog ──────────────────────
        const monthXpLog = {};
        const xpKeysToDelete = [];
        if (db.xpLog) {
          Object.entries(db.xpLog).forEach(([k, v]) => {
            if (k.startsWith(ym)) {
              monthXpLog[k] = v;
              xpKeysToDelete.push(k);
            }
          });
        }

        // ── 3. Build aggregate ───────────────────────────────
        const newRecord = _buildMonthlyAggregate(
          ym,
          monthCompletions,
          monthXpLog,
          db.habits || []
        );

        // ── 4. Merge with existing record (idempotent) ───────
        const existing = await _readArchive(ym);
        if (existing && existing.version === CFG.ARCHIVE_VERSION) {
          // Re-aggregate is preferred over naive merge to stay correct.
          // Existing record is simply replaced (data came from same source).
          newRecord.createdAt = existing.createdAt; // preserve original creation time
        }

        // ── 5. Write to IDB archive ──────────────────────────
        await _writeArchive(newRecord);

        // ── 6. Remove from hot db ────────────────────────────
        const before = JSON.stringify({
          completions: db.completions,
          xpLog: db.xpLog,
          deepWorkSessions: db.deepWork?.sessions,
          deepWorkDistractions: db.deepWork?.distractions,
          reflections: db.reflections,
          workouts: db.fitness?.workouts,
          weightLog: db.fitness?.weightLog,
          water: db.fitness?.water,
        }).length;

        keysToDelete.forEach((k)  => delete db.completions[k]);
        xpKeysToDelete.forEach((k) => { if (db.xpLog) delete db.xpLog[k]; });
        if (db.deepWork?.sessions) {
          db.deepWork.sessions = db.deepWork.sessions.filter((entry) => !String(entry?.date || '').startsWith(ym));
        }
        if (db.deepWork?.distractions) {
          db.deepWork.distractions = db.deepWork.distractions.filter((entry) => !String(entry?.date || '').startsWith(ym));
        }
        if (db.reflections) {
          Object.keys(db.reflections).forEach((key) => {
            if (key.startsWith(ym)) delete db.reflections[key];
          });
        }
        if (db.fitness?.workouts) {
          db.fitness.workouts = db.fitness.workouts.filter((entry) => !String(entry?.date || '').startsWith(ym));
        }
        if (db.fitness?.weightLog) {
          db.fitness.weightLog = db.fitness.weightLog.filter((entry) => !String(entry?.date || '').startsWith(ym));
        }
        if (db.fitness?.water) {
          Object.keys(db.fitness.water).forEach((key) => {
            if (key.startsWith(ym)) delete db.fitness.water[key];
          });
        }

        const after = JSON.stringify({
          completions: db.completions,
          xpLog: db.xpLog,
          deepWorkSessions: db.deepWork?.sessions,
          deepWorkDistractions: db.deepWork?.distractions,
          reflections: db.reflections,
          workouts: db.fitness?.workouts,
          weightLog: db.fitness?.weightLog,
          water: db.fitness?.water,
        }).length;
        bytesFreed += (before - after);

        archived++;
        console.info(`[Lifecycle] Archived ${ym}: ${keysToDelete.length} day entries → cold store.`);
      } catch (err) {
        console.error(`[Lifecycle] Failed to archive ${ym}:`, err);
        // Continue with next month — partial archival is safe
      }
    }

    return { archived, bytesFreed };
  }

  // ── Storage quota fail-safe ──────────────────────────────

  /**
   * Checks current storage quota via the Storage API.
   * @returns {Promise<{ usage: number, quota: number, ratio: number }|null>}
   */
  async function checkStorageQuota() {
    if (!navigator.storage?.estimate) return null;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
    } catch {
      return null;
    }
  }

  /**
   * If storage usage exceeds QUOTA_WARN_RATIO, deletes oldest archive
   * records until usage drops below QUOTA_TARGET_RATIO.
   *
   * This sacrifices cold data (which is historical and non-critical)
   * to protect hot data and app functionality.
   *
   * @returns {Promise<{ pruned: number }>}
   */
  async function pruneIfOverQuota() {
    const quota = await checkStorageQuota();
    if (!quota || quota.ratio < CFG.QUOTA_WARN_RATIO) return { pruned: 0 };

    console.warn(`[Lifecycle] Storage at ${(quota.ratio * 100).toFixed(1)}% — pruning cold archive.`);

    const archives = await _listArchive();
    // Sort ascending (oldest first) — these are deleted first
    archives.sort((a, b) => a.period.localeCompare(b.period));

    let pruned = 0;
    for (const record of archives) {
      const current = await checkStorageQuota();
      if (!current || current.ratio < CFG.QUOTA_TARGET_RATIO) break;

      await _deleteArchive(record.period);
      pruned++;
      console.info(`[Lifecycle] Pruned archive: ${record.period}`);
    }

    if (pruned > 0) {
      // Notify the user once (non-blocking)
      if (typeof notify === 'function') {
        notify(
          `⚠ Storage limit approaching — ${pruned} old month(s) pruned to free space.`,
          '⚠', 'info', 7000
        );
      }
    }

    return { pruned };
  }

  // ── Throttle: don't run more than once per day ────────────

  function _shouldRun() {
    try {
      const last = localStorage.getItem(CFG.LAST_RUN_KEY);
      if (!last) return true;
      const msSince = Date.now() - parseInt(last, 10);
      return msSince > CFG.MIN_RUN_INTERVAL_H * 3_600_000;
    } catch {
      return true;
    }
  }

  function _markRan() {
    try { localStorage.setItem(CFG.LAST_RUN_KEY, String(Date.now())); } catch (_) {}
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Main entry point. Call once on app startup (after NexusDB.init).
   *
   * Lifecycle steps (all async, non-blocking):
   *  1. Skip if already ran within MIN_RUN_INTERVAL_H
   *  2. Archive cold data (aggregate + strip)
   *  3. Save the slimmed db to IDB
   *  4. Prune archive if over quota
   *
   * @returns {Promise<void>}
   */
  async function runLifecycle() {
    if (!_shouldRun()) {
      console.info('[Lifecycle] Skipped — ran recently.');
      return;
    }

    console.info('[Lifecycle] Starting data lifecycle run…');
    const t0 = performance.now();

    try {
      const { archived, bytesFreed } = await archiveOldData();

      if (archived > 0) {
        // Persist the leaner db immediately after stripping cold keys
        if (typeof saveDB === 'function') saveDB(true);
        console.info(`[Lifecycle] Archived ${archived} month(s), freed ~${(bytesFreed / 1024).toFixed(1)} KB from hot data.`);
      }

      const { pruned } = await pruneIfOverQuota();

      _markRan();

      const elapsed = (performance.now() - t0).toFixed(0);
      console.info(`[Lifecycle] Complete in ${elapsed}ms — archived:${archived}, pruned:${pruned}.`);
    } catch (err) {
      console.error('[Lifecycle] runLifecycle failed:', err);
      // Non-fatal — app continues normally
    }
  }

  /**
   * Queries historical habit data across BOTH hot and cold tiers.
   *
   * Returns a unified view: monthly summaries for cold data,
   * raw daily data for hot data.
   *
   * @param {string} habitId
   * @param {string} fromYM - 'YYYY-MM' inclusive start
   * @param {string} toYM   - 'YYYY-MM' inclusive end
   * @returns {Promise<Object[]>} - array of { period, source, data }
   */
  async function queryHabitHistory(habitId, fromYM, toYM) {
    const results = [];

    // Cold tier: IDB archive
    try {
      const archives = await _listArchive();
      archives
        .filter((r) => r.period >= fromYM && r.period <= toYM && r.habits?.[habitId])
        .forEach((r) => {
          results.push({
            period: r.period,
            source: 'cold',
            data:   r.habits[habitId],
            totals: r.totals,
          });
        });
    } catch (err) {
      console.warn('[Lifecycle] queryHabitHistory cold read failed:', err);
    }

    // Hot tier: live db.completions
    if (db?.completions) {
      const currentYM = new Date().toISOString().slice(0, 7);
      const hotMonths = new Set();

      Object.keys(db.completions).forEach((k) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
        const ym = k.slice(0, 7);
        if (ym >= fromYM && ym <= toYM) hotMonths.add(ym);
      });

      for (const ym of hotMonths) {
        // Skip if already have this month from cold tier
        if (results.some((r) => r.period === ym)) continue;

        const monthCompletions = {};
        Object.entries(db.completions).forEach(([k, v]) => {
          if (k.startsWith(ym)) monthCompletions[k] = v;
        });
        const monthXP = {};
        if (db.xpLog) {
          Object.entries(db.xpLog).forEach(([k, v]) => {
            if (k.startsWith(ym)) monthXP[k] = v;
          });
        }

        const agg = _buildMonthlyAggregate(ym, monthCompletions, monthXP, db.habits || []);
        if (agg.habits[habitId]) {
          results.push({
            period: ym,
            source: 'hot',
            data:   agg.habits[habitId],
            totals: agg.totals,
          });
        }
      }
    }

    return results.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Returns a storage health report for the Settings screen.
   * @returns {Promise<Object>}
   */
  async function getStorageReport() {
    const quota     = await checkStorageQuota();
    const archives  = await _listArchive();
    const hotKeys   = db?.completions ? Object.keys(db.completions).length : 0;
    const lastRun   = localStorage.getItem(CFG.LAST_RUN_KEY);
    const sortedArchives = [...archives].sort((a, b) => a.period.localeCompare(b.period));

    return {
      hotKeys,
      coldMonths:   sortedArchives.length,
      oldestArchive: sortedArchives.length > 0
        ? sortedArchives[0].period
        : null,
      newestArchive: sortedArchives.length > 0
        ? sortedArchives[sortedArchives.length - 1].period
        : null,
      quota,
      lastRunAt: lastRun ? new Date(parseInt(lastRun)).toISOString() : null,
      hotWindowDays: CFG.HOT_WINDOW_DAYS,
      deepWorkSessions: db?.deepWork?.sessions?.length || 0,
      reflectionEntries: Object.keys(db?.reflections || {}).length,
      workoutEntries: db?.fitness?.workouts?.length || 0,
      weightEntries: db?.fitness?.weightLog?.length || 0,
      waterEntries: Object.keys(db?.fitness?.water || {}).length,
    };
  }

  /**
   * Force a full archive run immediately (useful for manual trigger in Settings).
   * Bypasses the throttle check.
   * @returns {Promise<void>}
   */
  async function forceRun() {
    try { localStorage.removeItem(CFG.LAST_RUN_KEY); } catch (_) {}
    await runLifecycle();
  }

  const api = {
    runLifecycle,
    forceRun,
    archiveOldData,
    pruneIfOverQuota,
    checkStorageQuota,
    queryHabitHistory,
    getStorageReport,
    CFG,
  };

  Object.defineProperty(api, '_debug', {
    value: Object.freeze({
      buildMonthlyAggregate: _buildMonthlyAggregate,
      buildSupplementalAggregate: _buildSupplementalAggregate,
      coldMonths: _coldMonths,
    }),
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return Object.freeze(api);

})();

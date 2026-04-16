// ================================================================
// activity-log.js
// Local activity timeline used to make user actions consultable inside the app.
// Keeps entries compact, serializable, and safe to persist in IndexedDB.
// ================================================================

(function initAxiomActivityLog(global) {
  const MAX_ACTIVITY_ENTRIES = 400;

  function getDb(targetDb) {
    return targetDb || global.db || null;
  }

  function ensureActivityLog(targetDb) {
    const dbRef = getDb(targetDb);
    if (!dbRef) return [];
    if (!Array.isArray(dbRef.activityLog)) dbRef.activityLog = [];
    return dbRef.activityLog;
  }

  function sanitizeValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 160);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeValue);
    if (typeof value === 'object') {
      const next = {};
      Object.entries(value).forEach(([key, nested]) => {
        if (typeof nested === 'function') return;
        next[key] = sanitizeValue(nested);
      });
      return next;
    }
    return String(value).slice(0, 160);
  }

  function buildEntry(type, meta) {
    const timestamp = new Date().toISOString();
    return {
      id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type: String(type || 'unknown'),
      at: timestamp,
      meta: sanitizeValue(meta || {}),
    };
  }

  function trimActivityLog(log) {
    if (log.length > MAX_ACTIVITY_ENTRIES) log.length = MAX_ACTIVITY_ENTRIES;
  }

  function record(type, meta, options = {}) {
    const log = ensureActivityLog(options.db);
    if (!Array.isArray(log)) return null;
    const entry = buildEntry(type, meta);
    log.unshift(entry);
    trimActivityLog(log);

    if (options.persist && typeof global.saveDB === 'function') {
      try { global.saveDB(); } catch {}
    }

    return entry;
  }

  function recent(limit = 20, options = {}) {
    return ensureActivityLog(options.db).slice(0, Math.max(0, limit));
  }

  global.AxiomActivityLog = Object.freeze({
    MAX_ACTIVITY_ENTRIES,
    ensure: ensureActivityLog,
    record,
    recent,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);

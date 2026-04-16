// ================================================================
// db-reactive.js - reactive wrappers and debounced persistence
// Depends on db.js providing createDB(), NexusDB, and the global db binding.
// ================================================================

const _reactiveWrappedObjects = new WeakSet();
let _saveTimer = null;

function _makeBatchedProxy(target, flushFn) {
  if (!target || typeof target !== 'object') return target;
  if (_reactiveWrappedObjects.has(target)) return target;
  let pending = false;
  const proxy = new Proxy(target, {
    set(obj, prop, value) {
      const changed = obj[prop] !== value;
      obj[prop] = value;
      if (changed && !pending) {
        pending = true;
        queueMicrotask(() => {
          pending = false;
          flushFn();
        });
      }
      return true;
    },
  });
  _reactiveWrappedObjects.add(proxy);
  return proxy;
}

function _wrapDbReactive() {
  db.user = _makeBatchedProxy(db.user, () => updateSidebar());
  db.stats = _makeBatchedProxy(db.stats, () => _invalidateStreakCache());
}

function saveDB(immediate = false) {
  if (immediate) {
    _flushSave();
    return;
  }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flushSave, 350);
}

function _flushSave() {
  clearTimeout(_saveTimer);
  _saveTimer = null;
  db.lastSave = new Date().toISOString();
  NexusDB.save(db)
    .then(() => {
      const el = document.getElementById('last-save-info');
      if (el) el.textContent = 'Last save: ' + new Date().toLocaleTimeString();
      if (typeof BackupManager !== 'undefined') BackupManager.markDirty();
    })
    .catch((e) => {
      console.error('[NEXUS] _flushSave error:', e);
    });
}

function manualSave() {
  _flushSave();
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 400);
  }
  notify(I18n.t('err_data_saved'), '💾', 'xp');
}

setInterval(() => saveDB(true), APP_CONSTANTS.TIMER.AUTOSAVE_MS);

globalThis.AxiomDbReactive = {
  wrapDbReactive: _wrapDbReactive,
  saveDB,
  flushSave: _flushSave,
  manualSave,
};

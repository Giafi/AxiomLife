// backup.js
// Automatic local-folder backup via the File System Access API.
// - No server, account, or cloud dependency.
// - The chosen folder handle is persisted in IndexedDB.
// - axiomOS writes a readable JSON backup every 60 seconds when data changed.
// - A best-effort write also runs when the tab is hidden or closed.

function backupT(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function emitBackupActivity(action, extra = {}) {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('backup:changed', { action, ...extra });
}

function getLiteBackupMode() {
  return globalThis.AxiomLite?.enabled ? globalThis.AxiomLite : null;
}

function getLiteBackupUpgradeCopy() {
  const lang = db?.settings?.lang || I18n?.lang || 'en';
  if (typeof globalThis.AxiomLite?.getUpgradeCopy === 'function') return globalThis.AxiomLite.getUpgradeCopy();
  return lang === 'it'
    ? { title: 'Disponibile nella versione completa', cta: 'Vai al full' }
    : { title: 'Available in the full version', cta: 'View full version' };
}

function backupLiteBlockedLegacy() {
  const lite = getLiteBackupMode();
  if (!lite || lite.canUseFeature?.('backup') !== false) return false;
  notify(lite.featureMessage('backup', 'Automatic folder backup is available in the full version.'), '⭐', 'info', 3500);
  return true;
}

function backupLiteBlocked() {
  const lite = getLiteBackupMode();
  if (!lite || lite.canUseFeature?.('backup') !== false) return false;
  const message = lite.featureMessage('backup', 'Automatic folder backup is available in the full version.');
  const copy = getLiteBackupUpgradeCopy();
  if (typeof ConfirmModal?.show === 'function') {
    Promise.resolve(ConfirmModal.show({
      title: copy.title,
      body: message,
      icon: '⭐',
      okLabel: copy.cta,
      okClass: 'btn-primary'
    }))
      .then((ok) => {
        if (ok) lite.openUpgradeUrl?.();
      })
      .catch(() => {
        notify(message, '⭐', 'info', 3500);
      });
  } else {
    notify(message, '⭐', 'info', 3500);
  }
  return true;
}

const BackupManager = (() => {
  // Dedicated IndexedDB store for persisted directory handles.
  const HANDLE_IDB_NAME = 'axiomOS-backup-handles';
  const HANDLE_IDB_VER = 1;
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'backupDir';
  const BACKUP_FILENAME = 'axiomOS-backup.json';
  const AUTOSAVE_INTERVAL_MS = 60 * 1000;

  let _dirHandle = null;
  let _idb = null;
  let _dirty = false;
  let _intervalId = null;
  let _isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  function _openHandleIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_IDB_NAME, HANDLE_IDB_VER);
      req.onupgradeneeded = (event) => {
        event.target.result.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = (event) => {
        _idb = event.target.result;
        resolve(_idb);
      };
      req.onerror = (event) => reject(event.target.error);
    });
  }

  async function _saveHandle(handle) {
    const idb = await _openHandleIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = (event) => reject(event.target.error);
    });
  }

  async function _loadHandle() {
    const idb = await _openHandleIDB();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(HANDLE_STORE, 'readonly')
        .objectStore(HANDLE_STORE)
        .get(HANDLE_KEY);
      req.onsuccess = (event) => resolve(event.target.result ?? null);
      req.onerror = (event) => reject(event.target.error);
    });
  }

  async function _deleteHandle() {
    const idb = await _openHandleIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = (event) => reject(event.target.error);
    });
  }

  /**
   * Writes the current DB snapshot to axiomOS-backup.json in the chosen folder.
   * This stays silent unless the caller asks for explicit success feedback.
   * @param {boolean} [showSuccess=false]
   */
  async function _writeBackup(showSuccess = false) {
    if (!_dirHandle) return;

    try {
      const permission = await _dirHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const requested = await _dirHandle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') {
          console.warn('[Backup] Write permission denied; skipping backup');
          return;
        }
      }

      const fileHandle = await _dirHandle.getFileHandle(BACKUP_FILENAME, { create: true });
      const writable = await fileHandle.createWritable();
      const payload = JSON.stringify(
        { ...db, _backupTimestamp: new Date().toISOString() },
        null,
        0
      );

      await writable.write(payload);
      await writable.close();

      _dirty = false;
      if (showSuccess) {
        notify(backupT('backup_saved', (filename) => `Backup saved to ${filename}`, BACKUP_FILENAME), '💾', 'success', 2500);
      }
      console.info('[Backup] Wrote', BACKUP_FILENAME, new Date().toLocaleTimeString());
    } catch (err) {
      // NotAllowedError can happen temporarily when the browser revokes access.
      if (err.name !== 'NotAllowedError') {
        console.warn('[Backup] Write failed:', err);
      }
    }
  }

  return {
    /**
     * Whether the browser supports the File System Access API.
     */
    get isSupported() {
      return _isSupported;
    },

    /**
     * Whether a backup folder is currently configured.
     */
    get isActive() {
      return _dirHandle !== null;
    },

    /**
     * Restores the persisted folder handle when available.
     * Called after the main DB bootstrap.
     */
    async init() {
      if (getLiteBackupMode()?.canUseFeature?.('backup') === false) return;
      if (!_isSupported) return;
      try {
        const handle = await _loadHandle();
        if (!handle) return;

        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted' || permission === 'prompt') {
          _dirHandle = handle;
          this._startAutoSave();
          console.info('[Backup] Restored folder handle:', handle.name);
        } else {
          await _deleteHandle();
        }
      } catch (err) {
        await _deleteHandle().catch(() => {});
        console.warn('[Backup] Stored handle is no longer valid:', err.message);
      }
    },

    /**
     * Opens the folder picker and enables automatic backup.
     */
    async setup() {
      if (backupLiteBlocked()) return;
      if (!_isSupported) {
        notify(backupT('backup_no_support', 'Your browser does not support auto folder backup. Use Chrome or Edge.'), '⚠', 'info', 5000);
        return;
      }

      try {
        const handle = await window.showDirectoryPicker({
          id: 'axiomOS-backup',
          mode: 'readwrite',
          startIn: 'documents'
        });
        _dirHandle = handle;
        await _saveHandle(handle);
        this._startAutoSave();
        await _writeBackup(true);
        emitBackupActivity('enabled', { folderName: handle?.name || '' });
        notify(`✅ ${handle.name}`, '🗂', 'success', 3500);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[Backup] Setup failed:', err);
        notify(backupT('backup_setup_failed', (message) => `Unable to configure backup: ${message}`, err.message), '⚠', 'info', 4000);
      }
    },

    /**
     * Disables automatic backup and removes the persisted folder handle.
     */
    async disable() {
      this._stopAutoSave();
      _dirHandle = null;
      await _deleteHandle();
      emitBackupActivity('disabled');
      notify(backupT('backup_auto_off', 'Auto-backup disabled'), '🔕', 'info', 2500);
    },

    /**
     * Forces an immediate backup.
     */
    async saveNow() {
      if (backupLiteBlocked()) return;
      if (!_dirHandle) {
        notify(backupT('backup_configure', 'Configure backup folder in settings first'), 'ℹ', 'info', 3000);
        return;
      }
      await _writeBackup(true);
      emitBackupActivity('saved', { fileName: BACKUP_FILENAME });
    },

    /**
     * Marks the DB as dirty so the next autosave cycle writes a snapshot.
     */
    markDirty() {
      _dirty = true;
    },

    /**
     * Starts the autosave loop and lifecycle listeners.
     * @private
     */
    _startAutoSave() {
      this._stopAutoSave();
      _intervalId = setInterval(async () => {
        if (_dirty) await _writeBackup();
      }, AUTOSAVE_INTERVAL_MS);

      window.addEventListener('visibilitychange', this._onVisibilityChange, { passive: true });
      window.addEventListener('beforeunload', this._onBeforeUnload);
    },

    _stopAutoSave() {
      if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
      }
      window.removeEventListener('visibilitychange', this._onVisibilityChange);
      window.removeEventListener('beforeunload', this._onBeforeUnload);
    },

    _onVisibilityChange() {
      if (document.visibilityState === 'hidden' && _dirty) {
        _writeBackup();
      }
    },

    _onBeforeUnload() {
      if (_dirty) _writeBackup();
    }
  };
})();

/**
 * Keeps the backup controls in the settings section aligned with runtime state.
 */
function updateBackupUI() {
  const statusEl = document.getElementById('backup-status');
  const setupBtn = document.getElementById('backup-setup-btn');
  const disableBtn = document.getElementById('backup-disable-btn');
  if (!statusEl) return;

  if (getLiteBackupMode()?.canUseFeature?.('backup') === false) {
    const lite = getLiteBackupMode();
    statusEl.textContent = lite.featureMessage('backup', 'Automatic folder backup is available in the full version.');
    statusEl.style.color = '';
    if (setupBtn) {
      setupBtn.disabled = true;
      setupBtn.textContent = '⭐ Full version';
    }
    if (disableBtn) disableBtn.style.display = 'none';
    return;
  }

  if (!BackupManager.isSupported) {
    statusEl.textContent = `⚠ ${backupT('backup_no_support', 'Your browser does not support auto folder backup. Use Chrome or Edge.')}`;
    if (setupBtn) {
      setupBtn.disabled = true;
      setupBtn.textContent = `📂 ${backupT('settings_backup_setup', 'Configure backup')}`;
    }
    if (disableBtn) disableBtn.style.display = 'none';
    return;
  }

  if (setupBtn) setupBtn.disabled = false;

  if (BackupManager.isActive) {
    statusEl.innerHTML = backupT('backup_status_active_html', '✅ <strong>Backup active</strong> — axiomOS saves automatically every 60s.');
    statusEl.style.color = 'var(--accent)';
    if (setupBtn) setupBtn.textContent = `💾 ${backupT('backup_save_now', 'Save now')}`;
    if (disableBtn) {
      disableBtn.style.display = '';
      disableBtn.textContent = `🔕 ${backupT('settings_backup_disable', 'Disable')}`;
    }
    return;
  }

  statusEl.textContent = backupT('settings_backup_not_configured', 'Automatic backup is not configured.');
  statusEl.style.color = '';
  if (setupBtn) setupBtn.textContent = `📂 ${backupT('settings_backup_setup', 'Configure backup')}`;
  if (disableBtn) disableBtn.style.display = 'none';
}

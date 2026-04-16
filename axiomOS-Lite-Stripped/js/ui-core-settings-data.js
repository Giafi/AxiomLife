// ================================================================
// ui-core-settings-data.js - settings storage and data actions
// Depends on globals provided by db.js, ui-core-settings.js and init.js.
// ================================================================

(function attachSettingsData(globalScope) {
  function getLiteMode() {
    return globalScope.AxiomLite?.enabled ? globalScope.AxiomLite : null;
  }

  function getLitePromptCopy() {
    const lang = globalScope.db?.settings?.lang || globalScope.I18n?.lang || 'en';
    if (typeof globalScope.AxiomLite?.getUpgradeCopy === 'function') return globalScope.AxiomLite.getUpgradeCopy();
    return lang === 'it'
      ? { title: 'Disponibile nella versione completa', cta: 'Vai al full' }
      : { title: 'Available in the full version', cta: 'View full version' };
  }

  function blockLiteFeature(feature, fallback) {
    const lite = getLiteMode();
    if (!lite || lite.canUseFeature?.(feature) !== false) return false;
    const message = lite.featureMessage(feature, fallback);
    const copy = getLitePromptCopy();

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
          notify(message, '⭐', 'info');
        });
    } else {
      notify(message, '⭐', 'info');
    }
    return true;
  }

  async function renderStorageReport() {
    const reportEl = document.getElementById('storage-report');
    if (!reportEl || typeof DataLifecycleManager === 'undefined') return;

    reportEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'dim small';
    loading.textContent = I18n.t('storage_refreshing');
    reportEl.appendChild(loading);

    try {
      const report = await DataLifecycleManager.getStorageReport();
      const quota = report.quota?.quota
        ? `${((report.quota.usage || 0) / 1024 / 1024).toFixed(2)} MB / ${(report.quota.quota / 1024 / 1024).toFixed(2)} MB`
        : 'n/a';
      const archiveRange = I18n.t('storage_archives_range', report.oldestArchive, report.newestArchive);

      reportEl.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'small storage-grid';

      const rows = [
        [I18n.t('storage_hot_window', report.hotWindowDays)],
        [I18n.t('storage_hot_keys'), String(report.hotKeys)],
        [I18n.t('storage_cold_months'), String(report.coldMonths)],
        [I18n.t('storage_quota'), quota],
        [I18n.t('storage_last_run'), report.lastRunAt ? new Date(report.lastRunAt).toLocaleString() : '-'],
        [I18n.t('storage_archive_range_label'), archiveRange],
        [I18n.t('storage_deepwork_sessions'), String(report.deepWorkSessions)],
        [I18n.t('storage_reflections'), String(report.reflectionEntries)],
        [I18n.t('storage_workouts'), String(report.workoutEntries)],
        [I18n.t('storage_weight_entries'), String(report.weightEntries)],
        [I18n.t('storage_water_days'), String(report.waterEntries)],
      ];

      rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        if (value === undefined) {
          row.textContent = label;
        } else {
          row.textContent = `${label}: `;
          const strong = document.createElement('strong');
          strong.textContent = value;
          row.appendChild(strong);
        }
        grid.appendChild(row);
      });

      reportEl.appendChild(grid);
    } catch (err) {
      console.warn('[Settings] storage report failed:', err);
      reportEl.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'dim small';
      error.textContent = I18n.t('storage_cleanup_failed');
      reportEl.appendChild(error);
    }
  }

  async function runStorageCleanup() {
    if (typeof DataLifecycleManager === 'undefined') return;
    try {
      await DataLifecycleManager.forceRun();
      notify(I18n.t('storage_cleanup_done'), '💾', 'info');
      renderStorageReport();
    } catch (err) {
      console.warn('[Settings] storage cleanup failed:', err);
      notify(I18n.t('storage_cleanup_failed'), '⚠', 'info');
    }
  }

  function exportData() {
    const a = document.createElement('a');
    const fileName = `axiomOS-backup-${today()}.json`;
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = fileName;
    a.click();
    EventBus.emit('data:exported', { fileName });
    notify(typeof I18n !== 'undefined' ? I18n.t('backup_exported') : 'Backup exported!', '📤', 'info');
  }

  function importData(e) {
    if (blockLiteFeature('import', 'JSON import is disabled in Lite.')) {
      if (e?.target) e.target.value = '';
      return;
    }
    const f = e.target.files[0];
    if (!f) return;

    const MAX_IMPORT_MB = 10;
    if (f.size > MAX_IMPORT_MB * 1024 * 1024) {
      notify(typeof I18n !== 'undefined' ? I18n.t('backup_too_large') : `File too large (max ${MAX_IMPORT_MB}MB)`, '⚠', 'info', 5000);
      e.target.value = '';
      return;
    }

    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const validation = validateImportSchema(raw);
        if (!validation.valid) {
          const summary = validation.errors.slice(0, 2).join(' · ');
          notify(`Import rejected: ${summary}`, '❌', 'info', 7000);
          return;
        }

        const ok = await ConfirmModal.show({
          title: typeof I18n !== 'undefined' ? I18n.t('backup_import_title') : 'Import backup?',
          body: typeof I18n !== 'undefined' ? I18n.t('backup_import_body') : 'Current data will be replaced. Make sure you already have a backup.',
          icon: '📥',
          okLabel: typeof I18n !== 'undefined' ? I18n.t('backup_import_cta') : 'Import',
          okClass: 'btn-orange'
        });
        if (!ok) return;

        const d = validation.sanitized;

        try {
          await NexusDB.save(d);
          const def = createDB();
          db = {
            ...def,
            ...d,
            user: { ...def.user, ...d.user },
            settings: { ...def.settings, ...(d.settings || {}) },
            stats: { ...def.stats, ...(d.stats || {}) },
            tomorrow: { ...def.tomorrow, ...(d.tomorrow || {}) }
          };
          _wrapDbReactive();
          _initEntityLogics();
          chartX = null;
          chartC = null;
          initApp();
          EventBus.emit('data:imported', { fileName: f.name || '' });
          notify(
            typeof I18n !== 'undefined' ? I18n.t('backup_imported') : 'Data imported successfully!',
            '📥',
            'info'
          );
        } catch (saveErr) {
          console.error('[importData] save error:', saveErr);
          notify(
            typeof I18n !== 'undefined' ? I18n.t('backup_import_error') : 'Error saving imported data',
            '❌',
            'info'
          );
        }
      } catch {
        notify(
          typeof I18n !== 'undefined' ? I18n.t('backup_invalid_json') : 'Invalid or corrupted JSON file!',
          '❌',
          'info'
        );
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  async function createAutoBackup() {
    if (blockLiteFeature('backup', 'Automatic backup is available in the full version.')) return;
    const a = document.createElement('a');
    const fileName = `axiomOS-auto-backup-${today()}.json`;
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = fileName;
    a.click();
    EventBus.emit('data:backup-created', { fileName });
    notify(typeof I18n !== 'undefined' ? I18n.t('backup_local_created') : 'Local backup created!', '🗄', 'info');
  }

  async function hardReset() {
    const ok = await ConfirmModal.show({
      title: typeof I18n !== 'undefined' ? I18n.t('reset_title') : 'Full reset?',
      body: typeof I18n !== 'undefined' ? I18n.t('reset_body') : 'All data, habits, streaks and achievements will be permanently deleted.',
      icon: '💥',
      okLabel: typeof I18n !== 'undefined' ? I18n.t('reset_cta') : 'Delete everything',
      okClass: 'btn-danger'
    });
    if (!ok) return;
    try { await NexusDB.clear(); } catch (err) { console.warn('[NEXUS] hardReset clear:', err); }
    db = createDB();
    _wrapDbReactive();
    _initEntityLogics();
    chartX = null;
    chartC = null;
    initApp();
    notify(typeof I18n !== 'undefined' ? I18n.t('reset_done') : 'App reset complete', '🗑', 'info');
  }

  globalScope.AxiomSettingsData = {
    renderStorageReport,
    runStorageCleanup,
    exportData,
    importData,
    createAutoBackup,
    hardReset,
  };
})(globalThis);

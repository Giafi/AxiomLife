// ================================================================
// lite-mode.js - axiomOS Lite runtime constraints
//
// Enables a buyer-facing free trial mode without forking the full app.
// Triggered by:
//   - index.html?lite=1
//   - index.html?lite=true
//   - lite.html
//
// Responsibilities:
// - isolate storage from the full app
// - expose lite-specific branding metadata
// - lock advanced modules and selected premium actions
// - cap the number of habits while keeping the core loop intact
// ================================================================

(function initLiteMode(global) {
  function readLiteFlags() {
    try {
      const params = new URLSearchParams(global.location?.search || '');
      const pathname = String(global.location?.pathname || '');
      return {
        enabled:
          params.get('lite') === '1' ||
          params.get('lite') === 'true' ||
          pathname.endsWith('/lite.html'),
      };
    } catch {
      return { enabled: false };
    }
  }

  const LITE_FLAGS = readLiteFlags();
  if (!LITE_FLAGS.enabled) return;

  const LOCKED_MODULES = Object.freeze([
    'reflection',
    'goals',
    'fitness',
    'achievements',
    'identity',
    'lifeAreas',
    'attributes',
    'rewards',
    'skills',
    'library',
    'visionBoard',
    'experiments',
    'packages',
    'quotes',
  ]);

  const LOCKED_SECTIONS = Object.freeze({
    reflection: 'reflection',
    goals: 'goals',
    fitness: 'fitness',
    achievements: 'achievements',
    identity: 'identity',
    lifeAreas: 'life-areas',
    attributes: 'attributes',
    rewards: 'rewards',
    skills: 'skills',
    library: 'library',
    visionBoard: 'vision',
    experiments: 'experiments',
    packages: 'packages',
    quotes: 'quotes',
  });

  const FEATURES = Object.freeze({
    moduleCustomization: false,
    corePromotion: false,
    experienceModes: false,
    import: false,
    backup: false,
    identity: false,
    goals: false,
  });

  const BUILD = Object.freeze({
    edition: 'lite',
    storageKey: 'nexus_v2_lite',
    legacyStorageKey: null,
    idbName: 'nexus_idb_lite',
    lsFallbackKey: 'nexus_v2_lite_idb_fallback',
    name: 'axiomOS Lite',
    version: '2.2.2-lite',
    tagline: 'Free habit + focus trial',
    description: 'Lite version of axiomOS with the core daily loop: dashboard, habits, deep work, tomorrow planning and statistics.',
    maxHabits: 5,
    upgradeUrl: 'https://axiomlife.gumroad.com/l/axiomlife',
  });

  const MESSAGE_MAP = Object.freeze({
    moduleCustomization: {
      en: 'Lite keeps only the core loop. Advanced modules are available in the full version.',
      it: 'La versione Lite mantiene solo il loop essenziale. I moduli avanzati sono disponibili nella versione completa.',
    },
    corePromotion: {
      en: 'Core module customization is reserved for the full version.',
      it: 'La personalizzazione dei moduli core e riservata alla versione completa.',
    },
    experienceModes: {
      en: 'Lite stays on the simple setup so the free version remains focused.',
      it: 'La Lite resta sul setup semplice per mantenere la prova gratuita focalizzata.',
    },
    import: {
      en: 'JSON import is disabled in Lite. Keep this version as a simple local trial.',
      it: 'L import JSON e disattivato nella Lite. Tieni questa versione come prova locale essenziale.',
    },
    backup: {
      en: 'Automatic folder backup is available in the full version.',
      it: 'Il backup automatico su cartella e disponibile nella versione completa.',
    },
    identity: {
      en: 'Identity is part of the full version. Lite focuses on habits, focus, tomorrow and stats.',
      it: 'Identity fa parte della versione completa. La Lite si concentra su abitudini, focus, domani e statistiche.',
    },
    goals: {
      en: 'Goals are part of the full version. Lite keeps the core daily workflow only.',
      it: 'Goals fa parte della versione completa. La Lite mantiene solo il workflow quotidiano essenziale.',
    },
    habitsLimit: {
      en: `Lite includes up to ${BUILD.maxHabits} habits. Upgrade to unlock more.`,
      it: `La Lite include fino a ${BUILD.maxHabits} abitudini. Passa alla versione completa per sbloccarne altre.`,
    },
  });

  function currentLang() {
    return global.db?.settings?.lang || global.I18n?.lang || 'en';
  }

  function featureMessage(feature, fallback) {
    const message = MESSAGE_MAP[feature]?.[currentLang()];
    return message || fallback || 'Available in the full version.';
  }

  function canUseFeature(feature) {
    return FEATURES[feature] !== false;
  }

  function getUpgradeUrl() {
    return BUILD.upgradeUrl || '';
  }

  function openUpgradeUrl() {
    const url = getUpgradeUrl();
    if (!url) return false;
    try {
      if (typeof global.open === 'function') {
        global.open(url, '_blank', 'noopener,noreferrer');
        return true;
      }
    } catch {}
    try {
      global.location.href = url;
      return true;
    } catch {}
    return false;
  }

  function getUpgradeCopy() {
    const lang = currentLang();
    if (lang === 'it') {
      return {
        title: 'Sblocca la versione completa',
        body: 'Ottieni abitudini illimitate, moduli avanzati, import, backup e personalizzazione completa.',
        cta: 'Vai al full',
        dismiss: 'Non ora',
        limitTitle: 'Limite Lite raggiunto',
        lockedTitle: 'Disponibile nella versione completa'
      };
    }
    return {
      title: 'Unlock the full version',
      body: 'Get unlimited habits, advanced modules, import, backup, and full customization.',
      cta: 'View full version',
      dismiss: 'Not now',
      limitTitle: 'Lite limit reached',
      lockedTitle: 'Available in the full version'
    };
  }

  function isLockedModule(moduleId) {
    return LOCKED_MODULES.includes(moduleId);
  }

  function isLockedSection(sectionName) {
    return Object.values(LOCKED_SECTIONS).includes(sectionName);
  }

  function applyToDb(db) {
    if (!db || typeof db !== 'object') return false;

    let changed = false;
    db.settings ||= {};
    db.settings.modules ||= {};
    db.settings.modulePlacement ||= {};
    db.settings.homeCards ||= {};
    db.settings.coreNavPins ||= [];

    if (db.settings.experienceMode !== 'simple') {
      db.settings.experienceMode = 'simple';
      changed = true;
    }

    LOCKED_MODULES.forEach((moduleId) => {
      if (db.settings.modules[moduleId] !== false) {
        db.settings.modules[moduleId] = false;
        changed = true;
      }
      if (db.settings.modulePlacement[moduleId] !== 'hidden') {
        db.settings.modulePlacement[moduleId] = 'hidden';
        changed = true;
      }
      if (db.settings.homeCards[moduleId] !== false) {
        db.settings.homeCards[moduleId] = false;
        changed = true;
      }
    });

    const lockedSections = new Set(Object.values(LOCKED_SECTIONS));
    const filteredPins = (Array.isArray(db.settings.coreNavPins) ? db.settings.coreNavPins : []).filter((section) => !lockedSections.has(section));
    if (filteredPins.length !== (db.settings.coreNavPins || []).length) {
      db.settings.coreNavPins = filteredPins;
      changed = true;
    }

    return changed;
  }

  global.AXIOM_BUILD = BUILD;
  global.AxiomLite = Object.freeze({
    enabled: true,
    build: BUILD,
    canUseFeature,
    featureMessage,
    isLockedModule,
    isLockedSection,
    getUpgradeUrl,
    openUpgradeUrl,
    getUpgradeCopy,
    getMaxHabits() {
      return BUILD.maxHabits;
    },
    applyToDb,
  });

  if (global.document?.documentElement?.dataset) {
    global.document.documentElement.dataset.axiomEdition = 'lite';
  }
})(typeof window !== 'undefined' ? window : globalThis);

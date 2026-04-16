// Package-local Lite bootstrap.
// This makes the Gumroad Lite build behave as Lite by default without
// requiring query params or a separate entrypoint.
(function initLitePackage(global) {
  global.__AXIOM_FORCE_LITE = true;
  global.AXIOM_BUILD = {
    edition: 'lite',
    storageKey: 'nexus_v2_lite',
    legacyStorageKey: null,
    idbName: 'nexus_idb_lite',
    lsFallbackKey: 'nexus_v2_lite_idb_fallback',
    name: 'axiomOS Lite',
    version: '2.2.2-lite',
    tagline: 'Free habit + focus trial',
    description: 'Free trial of axiomOS with the core daily loop: dashboard, habits, deep work, tomorrow planning and statistics.',
    maxHabits: 5,
    upgradeUrl: 'https://axiomlife.gumroad.com/l/axiomlife',
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ================================================================
// shared-text.js - shared i18n and locale helpers
// ================================================================

(function initSharedText(global) {
  function getI18n() {
    return global.I18n || globalThis.I18n || null;
  }

  function lang(defaultLang = 'en') {
    return global.db?.settings?.lang || getI18n()?.lang || defaultLang;
  }

  function locale(options = {}) {
    const current = lang(options.defaultLang || 'en');
    if (current === 'it') return options.it || 'it-IT';
    return options.en || 'en-US';
  }

  function t(key, ...args) {
    const i18n = getI18n();
    return i18n ? i18n.t(key, ...args) : key;
  }

  function tf(key, fallback, ...args) {
    const i18n = getI18n();
    if (i18n) {
      const resolved = i18n.t(key, ...args);
      if (resolved !== undefined && resolved !== null && resolved !== key) return resolved;
    }
    if (typeof fallback === 'function') return fallback(...args);
    return fallback ?? key;
  }

  global.AxiomText = {
    lang,
    locale,
    t,
    tf,
  };
  if (typeof globalThis !== 'undefined' && globalThis !== global) {
    globalThis.AxiomText = global.AxiomText;
  }
}(typeof window !== 'undefined' ? window : globalThis));

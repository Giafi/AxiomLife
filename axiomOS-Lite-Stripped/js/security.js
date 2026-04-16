// =================================================================
// SECURITY - XSS protection and input validation utilities
// =================================================================

function securityT(key, fallback, ...args) {
  if (typeof I18n !== 'undefined') return I18n.t(key, ...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

/**
 * Escapes a string for safe insertion into HTML text nodes.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Escapes a string for safe insertion into HTML attributes.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=]/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#96;',
      '=': '&#61;'
    };
    return entities[char];
  });
}

/**
 * Creates a DOM element using safe text insertion via textContent.
 * @param {string} tag
 * @param {Object} attrs
 * @param {string} text
 * @returns {HTMLElement}
 */
function createSafeElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else if (key === 'dataset') Object.entries(value).forEach(([k, v]) => { el.dataset[k] = v; });
    else el.setAttribute(key, value);
  });
  if (text) el.textContent = text;
  return el;
}

// =================================================================
// MODULE: InputValidator - central user-input validation
// =================================================================
/**
 * Centralized validator for user-controlled input.
 * Prevents injection, reduces XSS risk, and keeps the persisted DB coherent.
 */
const InputValidator = Object.freeze({
  // Maximum length by field type.
  MAX_LENGTH: Object.freeze({
    name: 100,
    description: 1000,
    trigger: 50,
    note: 500,
    goal: 200
  }),

  /**
   * Validates and sanitizes a user-visible name field.
   * @param {string} name
   * @param {string} fieldName
   * @returns {{valid: boolean, value: string, error?: string}}
   */
  validateName(name, fieldName = securityT('settings_name', 'Name')) {
    const label = String(fieldName || securityT('settings_name', 'Name'));
    if (typeof name !== 'string') {
      return {
        valid: false,
        value: '',
        error: securityT('validation_invalid_field', (field) => `${field} is invalid`, label)
      };
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return {
        valid: false,
        value: '',
        error: securityT('validation_required_field', (field) => `${field} is required`, label)
      };
    }

    if (trimmed.length > this.MAX_LENGTH.name) {
      return {
        valid: false,
        value: '',
        error: securityT(
          'validation_too_long',
          (field, max) => `${field} is too long (max ${max} characters)`,
          label,
          this.MAX_LENGTH.name
        )
      };
    }

    // Remove control characters before persisting user input.
    const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, '');
    return { valid: true, value: sanitized };
  },

  /**
   * Validates an identifier (alphanumeric, underscore, dash).
   * @param {string} id
   * @returns {{valid: boolean, value: string}}
   */
  validateId(id) {
    if (typeof id !== 'string') return { valid: false, value: '' };
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return { valid: sanitized.length > 0, value: sanitized };
  },

  /**
   * Validates a positive integer.
   * @param {*} value
   * @param {number} min
   * @param {number} max
   * @returns {{valid: boolean, value: number}}
   */
  validateInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = parseInt(value, 10);
    if (isNaN(num)) return { valid: false, value: 0 };
    const clamped = Math.max(min, Math.min(max, num));
    return { valid: true, value: clamped };
  },

  /**
   * Validates a hex color.
   * @param {string} color
   * @returns {{valid: boolean, value: string}}
   */
  validateColor(color) {
    if (typeof color !== 'string') return { valid: false, value: '#00e5a0' };
    // Accept #RGB or #RRGGBB only.
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
      return { valid: true, value: color };
    }
    return { valid: false, value: '#00e5a0' };
  },

  /**
   * Validates an emoji icon.
   * @param {string} icon
   * @returns {{valid: boolean, value: string}}
   */
  validateIcon(icon) {
    if (typeof icon !== 'string') return { valid: false, value: '✅' };
    // Keep the stored value short even for multi-codepoint emoji.
    const trimmed = icon.trim().slice(0, 8);
    // Strip dangerous characters before persisting the value.
    const safe = trimmed.replace(/[<>"'&]/g, '');
    return { valid: true, value: safe || '✅' };
  }
});

// =================================================================
// MODULE: validateImportSchema - structural validation for JSON import
// Integrated from a former standalone hardening patch in v2.2.1.
//
// Previously documented in CHANGELOG v2.2 but never loaded.
// Now lives here so it is available to importData() in
// ui-core-settings.js, which calls it before any data merge.
//
// Three-level validation:
//   1. Base type check (must be a plain object)
//   2. Required fields + type-checking (version, user, habits)
//   3. Deep sanitization of all user-supplied string values
//
// @see ui-core-settings.js -> importData()
// =================================================================

/**
 * Validates and sanitizes a parsed JSON object as an axiomOS backup.
 * @param {*} raw Parsed JS value from JSON.parse()
 * @returns {{ valid: boolean, errors: string[], sanitized: Object|null }}
 */
function validateImportSchema(raw) {
  const errors = [];

  // Level 1: base type.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: ['File does not contain a valid JSON object'],
      sanitized: null
    };
  }

  // Level 2: required fields + type checks.
  if (!raw.version || typeof raw.version !== 'string') {
    errors.push('Field "version" is missing or not a string');
  }

  if (!raw.user || typeof raw.user !== 'object' || Array.isArray(raw.user)) {
    errors.push('Field "user" is missing or not an object');
  } else {
    if (
      typeof raw.user.level !== 'number' ||
      !Number.isFinite(raw.user.level) ||
      raw.user.level < 1
    ) {
      errors.push('"user.level" must be a finite integer >= 1');
    }
    if (
      typeof raw.user.xp !== 'number' ||
      !Number.isFinite(raw.user.xp) ||
      raw.user.xp < 0
    ) {
      errors.push('"user.xp" must be a finite number >= 0');
    }
    if (
      raw.user.xpNext !== undefined &&
      (typeof raw.user.xpNext !== 'number' || raw.user.xpNext < 1)
    ) {
      errors.push('"user.xpNext" must be a number > 0');
    }
  }

  if (!Array.isArray(raw.habits)) {
    errors.push('Field "habits" is missing or not an array');
  }

  // Structural errors are fatal. Reject before sanitizing.
  if (errors.length > 0) {
    return { valid: false, errors, sanitized: null };
  }

  // Level 3: deep sanitization.
  // Uses escapeHtml() and InputValidator already present in this file.
  // Guarantees no imported string can trigger XSS or corrupt the DB.
  const sanitized = {
    ...raw,

    user: {
      ...raw.user,
      name: raw.user.name ? escapeHtml(String(raw.user.name)).slice(0, 100) : '',
      level: Math.max(1, Math.round(raw.user.level)),
      xp: Math.max(0, Number(raw.user.xp)),
      xpNext: Math.max(1, Number(raw.user.xpNext || 1000)),
      totalXp: Math.max(0, Number(raw.user.totalXp || 0)),
      freezes: Math.max(0, Math.round(Number(raw.user.freezes || 0)))
    },

    habits: raw.habits
      .map((h) => {
        if (!h || typeof h !== 'object') return null;
        return {
          ...h,
          name: h.name ? escapeHtml(String(h.name)).slice(0, 100) : 'Habit',
          icon: h.icon
            ? String(h.icon).replace(/[<>"'&]/g, '').slice(0, 8) || '✅'
            : '✅',
          archived: typeof h.archived === 'boolean' ? h.archived : false,
          streak: Math.max(0, Number(h.streak || 0)),
          bestStreak: Math.max(0, Number(h.bestStreak || 0)),
          difficulty: Math.max(1, Math.min(4, Math.round(Number(h.difficulty || 1))))
        };
      })
      .filter(Boolean),

    identities: Array.isArray(raw.identities)
      ? raw.identities
          .map((id) => (!id || typeof id !== 'object') ? null : {
            ...id,
            name: id.name ? escapeHtml(String(id.name)).slice(0, 100) : 'Identity'
          })
          .filter(Boolean)
      : [],

    goals: Array.isArray(raw.goals)
      ? raw.goals
          .map((g) => (!g || typeof g !== 'object') ? null : {
            ...g,
            name: g.name ? escapeHtml(String(g.name)).slice(0, 200) : 'Goal'
          })
          .filter(Boolean)
      : []
  };

  return { valid: true, errors: [], sanitized };
}

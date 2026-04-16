// ================================================================
// entity-logic.js - Generic CRUD factory
// ================================================================

/**
 * @typedef {Object} EntityLogicInstance
 * @property {function(Object): void} upsert
 * @property {function(string): Promise<boolean>} delete
 * @property {function(string): Object|undefined} find
 * @property {function(): Object[]} all
 */

/**
 * Creates a CRUD helper for one db collection.
 * `confirmDelete` can be a static object or a function, so delete dialogs can
 * react to the current language at the exact time the modal is opened.
 */
function EntityLogic(collection, idPrefix, {
  onAfterUpsert,
  onAfterDelete,
  confirmDelete = { title: 'Delete item?', body: 'This action cannot be undone.', icon: '🗑', okLabel: 'Delete' }
} = {}) {
  return {
    upsert(entity) {
      if (!db[collection]) db[collection] = [];
      if (!entity.id) entity.id = idPrefix + Date.now();
      const idx = db[collection].findIndex((item) => item.id === entity.id);
      if (idx !== -1) db[collection][idx] = entity;
      else db[collection].push(entity);
      saveDB();
      onAfterUpsert?.(entity);
    },

    async delete(id) {
      const dialog = typeof confirmDelete === 'function' ? confirmDelete(id) : confirmDelete;
      const ok = await ConfirmModal.show(dialog);
      if (!ok) return false;
      db[collection] = (db[collection] || []).filter((item) => item.id !== id);
      saveDB();
      onAfterDelete?.(id);
      return true;
    },

    find(id) {
      return (db[collection] || []).find((item) => item.id === id);
    },

    all() {
      return db[collection] || [];
    }
  };
}

let HabitLogic;
let GoalLogic;
let RewardLogic;
let SkillLogic;
let LibraryLogic;
let VisionLogic;
let IdentityLogic;
let ExperimentLogic;
let QuoteLogic;

function emitEntityCollectionChange(eventName, payload = {}) {
  EventBus.emit(eventName, payload);
}

function entityText(en, it) {
  return (typeof I18n !== 'undefined' && I18n.lang === 'it') ? it : en;
}

function _initEntityLogics() {
  HabitLogic = EntityLogic('habits', 'h_', {
    confirmDelete: () => ({
      title: entityText('Delete habit?', 'Eliminare abitudine?'),
      body: entityText('Streaks and completions will remain in the historical data.', 'Tutte le streak e i completamenti rimarranno nello storico.'),
      icon: '🗑',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('habits:changed', { habitId: id, action: 'deleted' })
  });

  GoalLogic = EntityLogic('goals', 'g_', {
    confirmDelete: () => ({
      title: entityText('Delete goal?', 'Eliminare obiettivo?'),
      body: entityText('Associated milestones will be lost.', 'Le milestone associate verranno perse.'),
      icon: '🗑',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('goals:changed', { goalId: id, action: 'deleted' })
  });

  RewardLogic = EntityLogic('rewards', 'rw_', {
    confirmDelete: () => ({
      title: entityText('Delete reward?', 'Eliminare ricompensa?'),
      icon: '🗑',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('rewards:changed', { rewardId: id, action: 'deleted' })
  });

  SkillLogic = EntityLogic('skills', 'sk_', {
    confirmDelete: () => ({
      title: entityText('Delete skill?', 'Eliminare abilita?'),
      icon: '🗑',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('skills:changed', { skillId: id, action: 'deleted' })
  });

  LibraryLogic = EntityLogic('library', 'lb_', {
    confirmDelete: () => ({
      title: entityText('Remove from library?', 'Rimuovere dalla libreria?'),
      icon: '📚',
      okLabel: entityText('Remove', 'Rimuovi')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('library:changed', { itemId: id, action: 'deleted' })
  });

  VisionLogic = EntityLogic('visionBoard', 'vc_', {
    confirmDelete: () => ({
      title: entityText('Delete vision card?', 'Eliminare vision card?'),
      icon: '🌌',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('vision:changed', { cardId: id, action: 'deleted' })
  });

  IdentityLogic = EntityLogic('identities', 'id_', {
    confirmDelete: () => ({
      title: entityText('Delete identity?', 'Eliminare identita?'),
      body: entityText('Linked habits will not be deleted.', 'Le abitudini collegate non verranno eliminate.'),
      icon: '🧬',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('identity:changed', { identityId: id, action: 'deleted' })
  });

  ExperimentLogic = EntityLogic('experiments', 'exp_', {
    confirmDelete: () => ({
      title: entityText('Delete experiment?', 'Eliminare esperimento?'),
      icon: '🧪',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('experiments:changed', { experimentId: id, action: 'deleted' })
  });

  QuoteLogic = EntityLogic('quotes', 'q_', {
    confirmDelete: () => ({
      title: entityText('Delete quote?', 'Eliminare citazione?'),
      icon: '💬',
      okLabel: entityText('Delete', 'Elimina')
    }),
    onAfterDelete: (id) => emitEntityCollectionChange('quotes:changed', { quoteId: id, action: 'deleted' })
  });
}

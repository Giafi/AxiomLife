// ================================================================
// module-registry.js - Shared module surface contract
//
// Keeps navigation and settings aligned on the same module metadata.
// This is intentionally UI-agnostic: it describes what a module is,
// where it belongs by default, and how sections map back to modules.
// ================================================================

const AxiomModuleRegistry = (() => {
  'use strict';

  const MODULE_DEF = Object.freeze([
    {id:'reflection',   labelKey:'nav_reflection',   icon:'🌙', sec:'reflection', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_reflection_desc'},
    {id:'goals',        labelKey:'nav_goals',        icon:'🎯', sec:'goals', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_goals_desc'},
    {id:'fitness',      labelKey:'nav_fitness',      icon:'🏋', sec:'fitness', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_fitness_desc'},
    {id:'achievements', labelKey:'nav_achievements', icon:'🏆', sec:'achievements', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_achievements_desc'},
    {id:'identity',     labelKey:'nav_identity',     icon:'🧬', sec:'identity', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_identity_desc'},
    {id:'lifeAreas',    labelKey:'nav_char_sheet',   icon:'🧙', sec:'life-areas', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_life_areas_desc'},
    {id:'attributes',   labelKey:'nav_attributes',   icon:'⚡', sec:'attributes', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_attributes_desc'},
    {id:'rewards',      labelKey:'nav_rewards',      icon:'🎁', sec:'rewards', defaultPlacement:'advanced', bucket:'advanced', guideKey:'settings_feature_rewards_desc'},
    {id:'skills',       labelKey:'nav_skills',       icon:'🛠', sec:'skills', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_skills_desc'},
    {id:'library',      labelKey:'nav_library',      icon:'📚', sec:'library', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_library_desc'},
    {id:'visionBoard',  labelKey:'nav_vision_board', icon:'🌌', sec:'vision', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_vision_desc'},
    {id:'experiments',  labelKey:'nav_experiments',  icon:'🧪', sec:'experiments', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_experiments_desc'},
    {id:'packages',     labelKey:'nav_packages',     icon:'📦', sec:'packages', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_packages_desc'},
    {id:'quotes',       labelKey:'nav_quotes',       icon:'💬', sec:'quotes', defaultPlacement:'hidden', bucket:'labs', guideKey:'settings_feature_quotes_desc'},
  ]);

  const MODULE_BY_ID = Object.freeze(Object.fromEntries(MODULE_DEF.map((item) => [item.id, item])));
  const MODULE_BY_SECTION = Object.freeze(Object.fromEntries(MODULE_DEF.map((item) => [item.sec, item])));
  const ADVANCED_MODULE_IDS = Object.freeze(MODULE_DEF.filter((item) => item.bucket === 'advanced').map((item) => item.id));
  const LAB_MODULE_IDS = Object.freeze(MODULE_DEF.filter((item) => item.bucket === 'labs').map((item) => item.id));
  const DAILY_CARD_MODULE_IDS = Object.freeze(['reflection', 'goals', 'fitness', 'achievements']);
  const MODULE_PLACEMENTS = Object.freeze(['pinned', 'advanced', 'hidden']);
  const PINNABLE_CORE_SECTION_ORDER = Object.freeze([
    'reflection',
    'identity',
    'goals',
    'achievements',
    'life-areas',
    'fitness',
    'attributes',
    'rewards',
    'skills',
    'library',
    'vision',
    'experiments',
    'packages',
    'quotes'
  ]);
  const LAB_SECTION_SET = new Set(['skills', 'library', 'vision', 'experiments', 'packages', 'quotes']);
  const SECTION_TO_MODULE_ID = Object.freeze(Object.fromEntries(
    MODULE_DEF.map((item) => [item.sec, item.id])
  ));

  function getById(id) {
    return MODULE_BY_ID[id] || null;
  }

  function getBySection(section) {
    return MODULE_BY_SECTION[section] || null;
  }

  function isLabSection(section) {
    return LAB_SECTION_SET.has(section);
  }

  return Object.freeze({
    MODULE_DEF,
    MODULE_BY_ID,
    MODULE_BY_SECTION,
    ADVANCED_MODULE_IDS,
    LAB_MODULE_IDS,
    DAILY_CARD_MODULE_IDS,
    MODULE_PLACEMENTS,
    PINNABLE_CORE_SECTION_ORDER,
    SECTION_TO_MODULE_ID,
    getById,
    getBySection,
    isLabSection,
  });
})();

if (typeof globalThis !== 'undefined') {
  globalThis.AxiomModuleRegistry = AxiomModuleRegistry;
}

// ================================================================
// app-shell-state.js - Shared shell state for the app runtime
//
// Centralizes the core shell state that was previously spread across
// multiple globals. Compatibility aliases are installed on globalThis
// so legacy modules can keep working during the incremental refactor.
// ================================================================

const AxiomShellState = (() => {
  'use strict';

  if (globalThis.AxiomShellState?.__axiomShellState === true) {
    return globalThis.AxiomShellState;
  }

  const state = {
    currentSection: typeof globalThis.currentSection === 'string' && globalThis.currentSection ? globalThis.currentSection : 'dashboard',
    timeView: ['day', 'week', 'month'].includes(globalThis.timeView) ? globalThis.timeView : 'day',
    periodOffset: Number.isFinite(globalThis.periodOffset) ? globalThis.periodOffset : 0,
  };

  function defineAlias(name, getter, setter) {
    const existing = Object.getOwnPropertyDescriptor(globalThis, name);
    if (existing && existing.configurable === false) return;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      get: getter,
      set: setter,
    });
  }

  const api = {
    __axiomShellState: true,
    getCurrentSection() {
      return state.currentSection;
    },
    setCurrentSection(value) {
      state.currentSection = typeof value === 'string' && value ? value : 'dashboard';
      return state.currentSection;
    },
    getTimeView() {
      return state.timeView;
    },
    setTimeView(value) {
      state.timeView = ['day', 'week', 'month'].includes(value) ? value : 'day';
      return state.timeView;
    },
    getPeriodOffset() {
      return state.periodOffset;
    },
    setPeriodOffset(value) {
      state.periodOffset = Number.isFinite(value) ? value : 0;
      return state.periodOffset;
    },
    bumpPeriodOffset(delta) {
      return api.setPeriodOffset(state.periodOffset + (Number.isFinite(delta) ? delta : 0));
    },
    resetPeriodOffset() {
      return api.setPeriodOffset(0);
    },
  };

  defineAlias('currentSection', () => api.getCurrentSection(), (value) => { api.setCurrentSection(value); });
  defineAlias('timeView', () => api.getTimeView(), (value) => { api.setTimeView(value); });
  defineAlias('periodOffset', () => api.getPeriodOffset(), (value) => { api.setPeriodOffset(value); });

  return Object.freeze(api);
})();

if (typeof globalThis !== 'undefined') {
  globalThis.AxiomShellState = AxiomShellState;
}

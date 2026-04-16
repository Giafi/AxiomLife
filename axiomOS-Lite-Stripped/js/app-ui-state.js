// ================================================================
// app-ui-state.js - shared UI runtime state
// ================================================================

// This file intentionally keeps classic global bindings for legacy scripts.
// The grouped AxiomUIState object mirrors the same state so newer code can
// depend on a structured contract while older files continue to work.

var selIcon = typeof selIcon !== 'undefined' ? selIcon : (globalThis.ICONS?.[0] || '✅');
var selIdIcon = typeof selIdIcon !== 'undefined' ? selIdIcon : '🧬';
var selColor = typeof selColor !== 'undefined' ? selColor : (globalThis.COLORS?.[0] || '#4cc9f0');

var curMood = typeof curMood !== 'undefined' ? curMood : 0;

var timerSec = typeof timerSec !== 'undefined' ? timerSec : 25 * 60;
var timerTotal = typeof timerTotal !== 'undefined' ? timerTotal : 25 * 60;
var timerRunning = typeof timerRunning !== 'undefined' ? timerRunning : false;
var timerStart = typeof timerStart !== 'undefined' ? timerStart : null;
var hardcoreMode = typeof hardcoreMode !== 'undefined' ? hardcoreMode : false;
var focusMode = typeof focusMode !== 'undefined' ? focusMode : false;

var xpChartInst = typeof xpChartInst !== 'undefined' ? xpChartInst : null;
var catChartInst = typeof catChartInst !== 'undefined' ? catChartInst : null;
var chartX = typeof chartX !== 'undefined' ? chartX : null;
var chartC = typeof chartC !== 'undefined' ? chartC : null;

var _evtTO = typeof _evtTO !== 'undefined' ? _evtTO : null;

(function initAppUiState(global) {
  const state = {
    selection: {
      get habitIcon() { return selIcon; },
      set habitIcon(value) { selIcon = value; },
      get identityIcon() { return selIdIcon; },
      set identityIcon(value) { selIdIcon = value; },
      get color() { return selColor; },
      set color(value) { selColor = value; },
    },
    reflection: {
      get mood() { return curMood; },
      set mood(value) { curMood = value; },
    },
    deepWork: {
      get timerSec() { return timerSec; },
      set timerSec(value) { timerSec = value; },
      get timerTotal() { return timerTotal; },
      set timerTotal(value) { timerTotal = value; },
      get timerRunning() { return timerRunning; },
      set timerRunning(value) { timerRunning = value; },
      get timerStart() { return timerStart; },
      set timerStart(value) { timerStart = value; },
      get hardcoreMode() { return hardcoreMode; },
      set hardcoreMode(value) { hardcoreMode = value; },
      get focusMode() { return focusMode; },
      set focusMode(value) { focusMode = value; },
    },
    charts: {
      get xpChartInst() { return xpChartInst; },
      set xpChartInst(value) { xpChartInst = value; },
      get catChartInst() { return catChartInst; },
      set catChartInst(value) { catChartInst = value; },
      get chartX() { return chartX; },
      set chartX(value) { chartX = value; },
      get chartC() { return chartC; },
      set chartC(value) { chartC = value; },
    },
    events: {
      get evtTimeout() { return _evtTO; },
      set evtTimeout(value) { _evtTO = value; },
    },
  };

  global.AxiomUIState = state;
  if (typeof globalThis !== 'undefined' && globalThis !== global) {
    globalThis.AxiomUIState = state;
  }
}(typeof window !== 'undefined' ? window : globalThis));

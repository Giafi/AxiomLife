// ================================================================
// head-state.js - Pre-paint UI flags
//
// Runs in the document head to expose local preference flags before the first
// sidebar paint. This avoids a visible flash for small persisted shell states.
// ================================================================

(function applyHeadState() {
  try {
    const advancedOpen = localStorage.getItem('nav_advanced_open') === '1';
    document.documentElement.dataset.navAdvancedOpen = advancedOpen ? '1' : '0';
  } catch {
    document.documentElement.dataset.navAdvancedOpen = '0';
  }
})();

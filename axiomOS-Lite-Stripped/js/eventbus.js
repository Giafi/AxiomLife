// EventBus
// Lightweight publish/subscribe helper used to decouple modules.
/**
 * Global application EventBus.
 * Lets modules communicate without direct dependencies.
 * @example
 *   EventBus.on('habit:completed', ({ id, xp }) => updateSidebar());
 *   EventBus.emit('habit:completed', { id, xp });
 *   const unsub = EventBus.on('habit:completed', fn);
 *   unsub(); // removes the listener
 */
const EventBus = (() => {
  /** @type {Record<string, Function[]>} */
  const _subs = Object.create(null);
  return {
    /**
     * Subscribes a handler to an event.
     * @param {string} event
     * @param {Function} fn
     * @returns {Function} unsubscribe
     */
    on(event, fn) {
      if (!_subs[event]) _subs[event] = [];
      _subs[event].push(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      if (_subs[event]) _subs[event] = _subs[event].filter(f => f !== fn);
    },
    /**
     * Emits an event with an optional payload.
     * Each subscriber is wrapped in try/catch for robustness.
     * @param {string} event
     * @param {*} [data]
     */
    emit(event, data) {
      (_subs[event] || []).slice().forEach(fn => {
        try { fn(data); } catch (e) { console.error(`[EventBus] ${event}:`, e); }
      });
    }
  };
})();

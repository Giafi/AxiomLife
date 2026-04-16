// =================================================================
// MODULE: TimerWorker - resilient Deep Work countdown timer
// =================================================================
//
// Why this exists:
// - Main-thread setInterval can be throttled or frozen when the tab goes to
//   the background.
// - A worker keeps timing more stable and avoids UI drift during long sessions.
// - Delta-time math based on Date.now() corrects interval jitter on each tick.
// - 250ms polling is enough for a countdown UI while staying inexpensive.

const TimerWorker = (() => {
  /**
   * Worker code stored as an inline Blob.
   * No external file is required, so this also works on file:// and static hosting.
   */
  const WORKER_CODE = `
    let _startedAt = 0;
    let _totalMs = 0;
    let _remaining = 0;
    let _running = false;
    let _interval = null;

    function _tick() {
      if (!_running) return;
      const elapsed = Date.now() - _startedAt;
      _remaining = Math.max(0, _totalMs - elapsed);
      const remSec = Math.ceil(_remaining / 1000);
      self.postMessage({ type: 'tick', remSec, totalSec: Math.round(_totalMs / 1000) });
      if (_remaining === 0) {
        _running = false;
        clearInterval(_interval);
        self.postMessage({ type: 'complete' });
      }
    }

    self.onmessage = ({ data }) => {
      switch (data.type) {
        case 'start':
          _totalMs = data.totalSeconds * 1000;
          _remaining = _totalMs;
          _startedAt = Date.now();
          _running = true;
          clearInterval(_interval);
          _interval = setInterval(_tick, 250);
          _tick();
          break;
        case 'pause':
          _running = false;
          clearInterval(_interval);
          break;
        case 'resume':
          _startedAt = Date.now() - (_totalMs - _remaining);
          _running = true;
          clearInterval(_interval);
          _interval = setInterval(_tick, 250);
          break;
        case 'reset':
          _running = false;
          clearInterval(_interval);
          _remaining = _totalMs;
          self.postMessage({ type: 'tick', remSec: Math.ceil(_remaining / 1000), totalSec: Math.round(_totalMs / 1000) });
          break;
        case 'setTotal':
          _running = false;
          clearInterval(_interval);
          _totalMs = data.seconds * 1000;
          _remaining = _totalMs;
          self.postMessage({ type: 'tick', remSec: Math.ceil(_remaining / 1000), totalSec: data.seconds });
          break;
      }
    };
  `;

  let _worker = null;
  let _onTick = null;
  let _onComplete = null;

  function _init() {
    if (_worker) return;

    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      _worker = new Worker(url);
      URL.revokeObjectURL(url);
      _worker.onmessage = ({ data }) => {
        if (data.type === 'tick' && _onTick) _onTick(data);
        if (data.type === 'complete' && _onComplete) _onComplete();
      };
      _worker.onerror = (e) => console.error('[TimerWorker] Worker error:', e);
    } catch (e) {
      console.warn('[TimerWorker] Worker not supported, falling back to setInterval:', e);

      // Offline fallback with the same public surface.
      let _ftTotalMs = 0;
      let _ftRemaining = 0;
      let _ftStartedAt = 0;
      let _ftRunning = false;
      let _ftInterval = null;

      function _ftTick() {
        if (!_ftRunning) return;
        const elapsed = Date.now() - _ftStartedAt;
        _ftRemaining = Math.max(0, _ftTotalMs - elapsed);
        const remSec = Math.ceil(_ftRemaining / 1000);
        if (_onTick) _onTick({ remSec, totalSec: Math.round(_ftTotalMs / 1000) });
        if (_ftRemaining === 0) {
          _ftRunning = false;
          clearInterval(_ftInterval);
          _ftInterval = null;
          if (_onComplete) _onComplete();
        }
      }

      _worker = {
        postMessage(data) {
          switch (data.type) {
            case 'start':
              _ftTotalMs = data.totalSeconds * 1000;
              _ftRemaining = _ftTotalMs;
              _ftStartedAt = Date.now();
              _ftRunning = true;
              clearInterval(_ftInterval);
              _ftInterval = setInterval(_ftTick, 250);
              _ftTick();
              break;
            case 'pause':
              _ftRunning = false;
              clearInterval(_ftInterval);
              _ftInterval = null;
              break;
            case 'resume':
              _ftStartedAt = Date.now() - (_ftTotalMs - _ftRemaining);
              _ftRunning = true;
              clearInterval(_ftInterval);
              _ftInterval = setInterval(_ftTick, 250);
              break;
            case 'reset':
              _ftRunning = false;
              clearInterval(_ftInterval);
              _ftInterval = null;
              _ftRemaining = _ftTotalMs;
              if (_onTick) _onTick({ remSec: Math.ceil(_ftRemaining / 1000), totalSec: Math.round(_ftTotalMs / 1000) });
              break;
            case 'setTotal':
              _ftRunning = false;
              clearInterval(_ftInterval);
              _ftInterval = null;
              _ftTotalMs = data.seconds * 1000;
              _ftRemaining = _ftTotalMs;
              if (_onTick) _onTick({ remSec: Math.ceil(_ftRemaining / 1000), totalSec: data.seconds });
              break;
          }
        }
      };
    }
  }

  return {
    /**
     * Starts the timer and registers callbacks.
     * @param {number} totalSeconds
     * @param {{onTick?: Function, onComplete?: Function}} handlers
     */
    start(totalSeconds, { onTick, onComplete } = {}) {
      _init();
      _onTick = onTick;
      _onComplete = onComplete;
      if (_worker) _worker.postMessage({ type: 'start', totalSeconds });
    },

    pause() {
      if (_worker) _worker.postMessage({ type: 'pause' });
    },

    resume() {
      if (_worker) _worker.postMessage({ type: 'resume' });
    },

    reset() {
      if (_worker) _worker.postMessage({ type: 'reset' });
    },

    /**
     * Changes the total duration without starting the timer.
     * @param {number} seconds
     */
    setTotal(seconds) {
      _init();
      if (_worker) _worker.postMessage({ type: 'setTotal', seconds });
    }
  };
})();

// ================================================================
// MODULE: Toast - optimized notification system (v8)
// ================================================================
//
//  - Replaces the old notify() / #notif-stack implementation.
//  - Groups identical messages within 800ms into one toast with a badge.
//  - Shows at most 4 visible toasts at the same time.
//  - Never blocks the main thread: animations are scheduled with rAF.
//
const Toast = (() => {
  const _stack  = document.getElementById('nx-toast-stack');
  const _MAX    = 4;
  /** @type {{msg:string, ic:string, type:string, el:HTMLElement, count:number, timer:number|null}[]} */
  const _active = [];
  let _lastMsg = '';
  let _lastTime = 0;

  /**
   * Displays a toast notification.
   * @param {string} msg
   * @param {string} [ic='ℹ']
   * @param {'xp'|'ach'|'evt'|'info'} [type='info']
   * @param {number} [dur=3500]
   */
  function show(msg, ic = 'ℹ', type = 'info', dur = 3500) {
    // Group identical messages arriving within 800ms into a single toast.
    const safeMsg = String(msg ?? '');
    const safeIc = String(ic ?? 'ℹ');
    const now = Date.now();

    if (safeMsg === _lastMsg && now - _lastTime < 800) {
      const existing = _active.find((t) => t.msg === safeMsg);
      if (existing) {
        existing.count++;
        const badge = existing.el.querySelector('.nx-toast-count');
        if (badge) badge.textContent = `×${existing.count}`;
        return;
      }
    }
    _lastMsg = safeMsg;
    _lastTime = now;

    // Remove the oldest toast when the stack reaches its cap.
    if (_active.length >= _MAX) _dismiss(_active[0]);

    const parts = safeMsg.split(' — ');
    const el = document.createElement('div');
    el.className = `nx-toast nx-toast-${type}`;
    el.setAttribute('role', 'status');

    const iconEl = document.createElement('div');
    iconEl.className = 'nx-toast-ic';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = safeIc;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'nx-toast-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'nt';
    titleEl.textContent = parts[0] || '';
    bodyEl.appendChild(titleEl);

    if (parts[1]) {
      const msgEl = document.createElement('div');
      msgEl.className = 'nm';
      msgEl.textContent = parts.slice(1).join(' — ');
      bodyEl.appendChild(msgEl);
    }

    const badgeEl = document.createElement('span');
    badgeEl.className = 'nx-toast-count';
    badgeEl.style.cssText = 'font-size:10px;color:var(--text3);margin-left:auto;flex-shrink:0';
    badgeEl.setAttribute('aria-hidden', 'true');

    el.appendChild(iconEl);
    el.appendChild(bodyEl);
    el.appendChild(badgeEl);

    _stack.appendChild(el);
    const record = { msg: safeMsg, ic: safeIc, type, el, count: 1, timer: null };
    _active.push(record);

    // Animate entry on the next frame.
    requestAnimationFrame(() => el.classList.add('in'));
    record.timer = setTimeout(() => _dismiss(record), dur);
  }

  function _dismiss(record) {
    clearTimeout(record.timer);
    const idx = _active.indexOf(record);
    if (idx !== -1) _active.splice(idx, 1);
    record.el.classList.remove('in');
    record.el.classList.add('out');
    setTimeout(() => record.el.remove(), 320);
  }

  return { show };
})();

/**
 * Global notify() alias kept for backwards compatibility.
 * @param {string} msg
 * @param {string} [ic]
 * @param {string} [type]
 * @param {number} [dur]
 */
function notify(msg, ic = 'ℹ', type = 'info', dur = 3500) {
  Toast.show(msg, ic, type, dur);
}

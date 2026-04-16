// ConfirmModal and InputModal replace blocking browser dialogs.
/**
 * @typedef {Object} ConfirmOptions
 * @property {string} title
 * @property {string} [body]
 * @property {string} [icon]
 * @property {string} [okLabel]
 * @property {string} [okClass]
 * @property {string} [cancelLabel]
 */

/**
 * @typedef {Object} InputOptions
 * @property {string} title
 * @property {string} [placeholder]
 * @property {string} [type]
 * @property {number} [min]
 * @property {number} [max]
 * @property {*} [defaultVal]
 */

function modalT(key, fallback, ...args) {
  if (typeof I18n !== 'undefined') return I18n.t(key, ...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

const ConfirmModal = (() => {
  let _resolve = null;
  const overlay = document.getElementById('nx-confirm-overlay');
  const btnOk = document.getElementById('nx-confirm-ok');
  const btnCancel = document.getElementById('nx-confirm-cancel');

  function _close(result) {
    overlay.classList.remove('open');
    overlay.removeAttribute('aria-hidden');
    _removeFocusTrap();
    if (_resolve) {
      _resolve(result);
      _resolve = null;
    }
  }

  btnOk.addEventListener('click', () => _close(true));
  btnCancel.addEventListener('click', () => _close(false));
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') _close(false);
    if (event.key === 'Enter') _close(true);
  });

  return {
    /**
     * Shows a non-blocking confirmation dialog.
     * @param {ConfirmOptions} opts
     * @returns {Promise<boolean>}
     */
    show({
      title,
      body = '',
      icon = '⚠️',
      okLabel = modalT('btn_confirm', 'Confirm'),
      okClass = 'btn-danger',
      cancelLabel = modalT('btn_cancel', 'Cancel')
    } = {}) {
      document.getElementById('nx-confirm-icon').textContent = icon;
      document.getElementById('nx-confirm-title').textContent = title;
      document.getElementById('nx-confirm-body').textContent = body;
      btnOk.textContent = okLabel;
      btnOk.className = `btn ${okClass}`;
      btnCancel.textContent = cancelLabel;
      _modalPrevFocus = document.activeElement;
      overlay.classList.add('open');
      _installFocusTrap(overlay);
      btnOk.focus();
      return new Promise((resolve) => { _resolve = resolve; });
    }
  };
})();

const InputModal = (() => {
  let _resolve = null;
  const overlay = document.getElementById('nx-input-overlay');
  const field = document.getElementById('nx-input-field');
  const btnOk = document.getElementById('nx-input-ok');
  const btnCancel = document.getElementById('nx-input-cancel');

  function _close(value) {
    overlay.classList.remove('open');
    if (_resolve) {
      _resolve(value);
      _resolve = null;
    }
  }

  btnOk.addEventListener('click', () => _close(field.value));
  btnCancel.addEventListener('click', () => _close(null));
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') _close(null);
    if (event.key === 'Enter') _close(field.value);
  });

  return {
    /**
     * Shows a non-blocking input dialog.
     * @param {InputOptions} opts
     * @returns {Promise<string|null>}
     */
    show({ title, placeholder = '', type = 'number', min, max, defaultVal = '' } = {}) {
      document.getElementById('nx-input-title').textContent = title;
      field.type = type;
      field.placeholder = placeholder;
      field.value = defaultVal;
      if (min !== undefined) field.min = min;
      if (max !== undefined) field.max = max;
      overlay.classList.add('open');
      field.focus();
      field.select();
      return new Promise((resolve) => { _resolve = resolve; });
    }
  };
})();

let _pickersBuilt = false;

function _ensurePickers() {
  if (_pickersBuilt) return;
  _pickersBuilt = true;
  buildIconPicker('mh-ip', (icon) => { selIcon = icon; }, selIcon);
  buildColorPicker('mh-cp', (color) => { selColor = color; }, selColor);
  buildIconPicker('mid-ip', (icon) => { selIdIcon = icon; }, selIdIcon);
}

function buildIconPicker(containerId, callback, current) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let selectedElement = null;
  if (container.children.length === 0) {
    ICONS.slice(0, 35).forEach((icon) => {
      const node = document.createElement('div');
      node.className = 'ip-o' + (icon === current ? ' on' : '');
      node.textContent = icon;
      node.dataset.ic = icon;
      if (icon === current) selectedElement = node;
      container.appendChild(node);
    });

    container.addEventListener('click', (event) => {
      const target = event.target.closest('.ip-o');
      if (!target) return;
      if (selectedElement) selectedElement.classList.remove('on');
      target.classList.add('on');
      selectedElement = target;
      callback(target.dataset.ic);
    }, { capture: false });
  } else {
    container.querySelectorAll('.ip-o').forEach((node) => {
      node.classList.toggle('on', node.dataset.ic === current);
      if (node.dataset.ic === current) selectedElement = node;
    });
  }
}

function buildColorPicker(containerId, callback, current) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let selectedElement = null;
  if (container.children.length === 0) {
    COLORS.forEach((color) => {
      const node = document.createElement('div');
      node.className = 'cp-o' + (color === current ? ' on' : '');
      node.style.background = color;
      node.dataset.col = color;
      if (color === current) selectedElement = node;
      container.appendChild(node);
    });

    container.addEventListener('click', (event) => {
      const target = event.target.closest('.cp-o');
      if (!target) return;
      if (selectedElement) selectedElement.classList.remove('on');
      target.classList.add('on');
      selectedElement = target;
      callback(target.dataset.col);
    }, { capture: false });
  } else {
    container.querySelectorAll('.cp-o').forEach((node) => {
      node.classList.toggle('on', node.dataset.col === current);
      if (node.dataset.col === current) selectedElement = node;
    });
  }
}

// Focus trap for modal accessibility.
let _modalPrevFocus = null;
let _trapHandler = null;

const FOCUSABLE_SEL = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';

/**
 * Installs a focus trap for the provided modal element.
 * @param {HTMLElement} modalEl
 */
function _installFocusTrap(modalEl) {
  if (_trapHandler) document.removeEventListener('keydown', _trapHandler);

  const getFocusable = () => [...modalEl.querySelectorAll(FOCUSABLE_SEL)]
    .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);

  _trapHandler = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', _trapHandler);
  requestAnimationFrame(() => {
    const focusable = getFocusable();
    if (focusable.length > 0) focusable[0].focus();
  });
}

function _removeFocusTrap() {
  if (_trapHandler) {
    document.removeEventListener('keydown', _trapHandler);
    _trapHandler = null;
  }

  if (_modalPrevFocus && typeof _modalPrevFocus.focus === 'function') {
    _modalPrevFocus.focus();
    _modalPrevFocus = null;
  }
}

function openModal(id) {
  _ensurePickers();
  if (id === 'm-add-reward') {
    document.getElementById('mr-id').value = '';
    document.getElementById('mr-name').value = '';
    document.getElementById('mr-ic').value = '';
    document.getElementById('mr-cost').value = '';
    document.getElementById('mr-desc').value = '';
  }
  if (id === 'm-add-skill') {
    document.getElementById('msk-id').value = '';
    document.getElementById('msk-name').value = '';
    document.getElementById('msk-target').value = '';
    document.getElementById('msk-note').value = '';
  }
  if (id === 'm-add-lib') {
    document.getElementById('ml-id').value = '';
    document.getElementById('ml-title').value = '';
    document.getElementById('ml-author').value = '';
    document.getElementById('ml-size').value = '';
    document.getElementById('ml-xp').value = '';
  }
  if (id === 'm-add-vision') {
    document.getElementById('mv-id').value = '';
    document.getElementById('mv-ic').value = '';
    document.getElementById('mv-title').value = '';
    document.getElementById('mv-desc').value = '';
  }
  if (id === 'm-add-habit') populateHabitModal();
  if (id === 'm-add-id') populateIdModal();
  if (id === 'm-add-goal') populateGoalModal();
  if (id === 'm-add-exp') populateExpModal();
  if (id === 'm-direction') {
    const direction = db.direction;
    document.getElementById('md-who').value = direction.who || '';
    document.getElementById('md-1y').value = direction.y1 || '';
    document.getElementById('md-5y').value = direction.y5 || '';
  }

  _modalPrevFocus = document.activeElement;
  const modalEl = document.getElementById(id);
  if (!modalEl) return;
  modalEl.classList.add('open');
  _installFocusTrap(modalEl);
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  _removeFocusTrap();
}

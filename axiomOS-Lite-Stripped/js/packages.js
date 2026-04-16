// ================================================================
// packages.js - Habit packages and motivational quotes
//
// Depends on:
//   constants.js (generateId, buildPkgs, buildQuotes)
//   db.js (db, saveDB, today)
//   toast.js (notify)
//   modals.js (closeModal)
//   security.js (escapeHtml)
//   ui-core-xp.js (updateSidebar)
//   eventbus.js (EventBus)
// ================================================================

function pkgText(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function emitPackageActivity(moduleId, section, action, itemName = '', detail = '', icon = '📦') {
  if (typeof EventBus === 'undefined' || typeof EventBus.emit !== 'function') return;
  EventBus.emit('module:activity', { moduleId, section, action, itemName, detail, icon });
  if (moduleId === 'packages') EventBus.emit('packages:changed', { action, itemName, detail });
  if (moduleId === 'quotes') EventBus.emit('quotes:changed', { action, itemName, detail });
}

function pkgClear(node) {
  if (node) node.replaceChildren();
}

function buildPackageCard(pkg) {
  const card = document.createElement('div');
  card.className = 'card mb3';
  card.style.cursor = 'pointer';

  const header = document.createElement('div');
  header.className = 'sh-card';
  const info = document.createElement('div');
  info.style.cssText = 'display:flex;gap:10px;align-items:center;';

  const icon = document.createElement('span');
  icon.style.fontSize = '28px';
  icon.textContent = pkg.ic || '📦';
  const textWrap = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'title-lg';
  name.textContent = pkg.n || '';
  const desc = document.createElement('div');
  desc.className = 'dim small';
  desc.textContent = pkg.d || '';
  textWrap.append(name, desc);
  info.append(icon, textWrap);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${pkg.active ? 'btn-danger' : 'btn-primary'}`;
  button.textContent = pkg.active
    ? pkgText('packages_pause', 'Pause')
    : pkgText('packages_activate', 'Activate');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePkg(pkg.id);
  });

  header.append(info, button);
  card.appendChild(header);

  const tags = document.createElement('div');
  tags.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  (pkg.habits || []).forEach((habit) => {
    const tag = document.createElement('span');
    tag.className = 'tag tg';
    tag.textContent = `${habit.icon || '✅'} ${habit.name || ''}`;
    tags.appendChild(tag);
  });
  card.appendChild(tags);

  if (pkg.active) {
    const badge = document.createElement('div');
    badge.className = 'mt3 small pkg-active-badge';
    badge.style.color = 'var(--accent)';
    badge.textContent = pkgText('packages_active_badge', 'Package active');
    card.appendChild(badge);
  }

  return card;
}

function buildQuoteBlock(quote, categoryClasses) {
  const block = document.createElement('div');
  block.className = 'quote-block';

  const mark = document.createElement('div');
  mark.className = 'quote-mark';
  mark.textContent = '"';
  const quoteText = document.createElement('blockquote');
  quoteText.textContent = quote.text;
  const meta = document.createElement('div');
  meta.className = 'sh-act';
  const cite = document.createElement('cite');
  cite.textContent = quote.author || pkgText('quote_anonymous', 'Anonymous');
  const tag = document.createElement('span');
  tag.className = `tag ${categoryClasses[quote.cat] || 'tb'}`;
  tag.textContent = quote.cat || '';
  meta.append(cite, tag);

  block.append(mark, quoteText, meta);
  return block;
}
function renderPackages() {
  const list = document.getElementById('pkg-list');
  if (!list) return;

  const fragment = document.createDocumentFragment();
  (db.packages || []).forEach((pkg) => fragment.appendChild(buildPackageCard(pkg)));
  pkgClear(list);
  list.appendChild(fragment);
}
function togglePkg(id) {
  const pkg = (db.packages || []).find((pack) => pack.id === id);
  if (!pkg) return;

  pkg.active = !pkg.active;
  if (pkg.active) {
    pkg.habits.forEach((packageHabit) => {
      if (!db.habits.find((habit) => habit.name === packageHabit.name)) {
        db.habits.push({
          id: generateId('h'),
          ...packageHabit,
          streak: 0,
          bestStreak: 0,
          days: [0, 1, 2, 3, 4, 5, 6],
          createdAt: today()
        });
      }
    });
    notify(pkgText('packages_activated', (name) => `Package "${name}" activated!`, pkg.n), '📦', 'info');
  } else {
    notify(pkgText('packages_paused', (name) => `Package "${name}" paused.`, pkg.n), '📦', 'info');
  }

  saveDB();
  renderPackages();
  EventBus.emit('habits:changed');
  emitPackageActivity('packages', 'packages', 'toggled', pkg.n, pkg.active ? pkgText('packages_activate', 'Activate') : pkgText('packages_pause', 'Pause'));
  updateSidebar();
}

function exportPackages() {
  const data = JSON.stringify({ packages: db.packages, habits: db.habits }, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  link.download = 'axiomOS-packages-' + today() + '.json';
  link.click();
}

function importPackages(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    notify(pkgText('backup_too_large', 'File too large (max 5MB)'), '⚠', 'info');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.packages) {
        db.packages = [...db.packages, ...data.packages.filter((pack) => !db.packages.find((existing) => existing.id === pack.id))];
      }
      if (data.habits) {
        data.habits.forEach((habit) => {
          if (!db.habits.find((existing) => existing.id === habit.id)) db.habits.push(habit);
        });
      }
      saveDB();
      renderPackages();
      emitPackageActivity('packages', 'packages', 'imported', file.name || '', '', '📦');
      notify(pkgText('packages_imported', 'Packages imported!'), '📦', 'info');
    } catch {
      notify(pkgText('backup_invalid_file', 'Invalid file!'), '❌', 'info');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function renderQuotes() {
  const grid = document.getElementById('quotes-grid');
  if (!grid) return;

  const categoryClasses = {
    discipline: 'tb',
    consistency: 'tg',
    identity: 'tp',
    growth: 'to',
    disciplina: 'tb',
    costanza: 'tg',
    identita: 'tp',
    crescita: 'to'
  };
  const fragment = document.createDocumentFragment();
  const quotePool = Array.isArray(db.quotes) && db.quotes.length ? db.quotes : buildQuotes();

  quotePool.forEach((quote) => fragment.appendChild(buildQuoteBlock(quote, categoryClasses)));
  pkgClear(grid);
  grid.appendChild(fragment);
}
function saveQuote() {
  const text = document.getElementById('mq-text').value.trim();
  if (!text) {
    notify(pkgText('quote_enter', 'Enter a quote first.'), '⚠', 'info');
    return;
  }

  db.quotes.push({
    id: generateId('q'),
    text,
    author: document.getElementById('mq-auth').value || pkgText('anonymous'),
    cat: document.getElementById('mq-cat').value
  });
  saveDB();
  closeModal('m-add-quote');
  renderQuotes();
  emitPackageActivity('quotes', 'quotes', 'created', text.slice(0, 60), '', '💬');
  notify(pkgText('quote_added', 'Quote added!'), '💬', 'info');
}

const PackageManager = {
  render: renderPackages,
  toggle: togglePkg,
  export: exportPackages,
  import: importPackages,
  renderQuotes,
  saveQuote,
};



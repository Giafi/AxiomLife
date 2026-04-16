// ══════════════════════════════════════════════════════════════
// deepwork.js — Deep Work timer and session management
//
// Timer architecture: a Web Worker (TimerWorker) drives the countdown
// on a separate OS thread, immune to Chrome/Firefox background-tab
// throttling. The main thread receives tick messages and updates the
// DOM via requestAnimationFrame — precise to the millisecond even
// after hours in background.
//
// Depends on: constants.js (APP_CONSTANTS),
//             db.js (db, saveDB, today, toKey),
//             timer-worker.js (TimerWorker),
//             toast.js (notify),
//             entity-logic.js (checkAch),
//             ui-core-xp.js (addXP, updateSidebar),
//             app-ui-state.js (shared timer state),
//             shared-text.js (AxiomText),
//             chart-utils.js (_drawLineChart, _drawDoughnutChart)
// ══════════════════════════════════════════════════════════════

let _timerRafId       = null;
let _timerLastRendered = -1;
let _timerRemSec       = 0; // updated by TimerWorker tick messages

function dwLocale() {
  return AxiomText.locale();
}

function dwt(key, fallback, ...args) {
  return AxiomText.tf(key, fallback, ...args);
}

function getDeepWorkState() {
  return globalThis.AxiomUIState?.deepWork || globalThis;
}

function setTimer(min) {
  const state = getDeepWorkState();
  if (state.timerRunning) return;
  state.timerTotal = min * 60;
  state.timerSec = state.timerTotal;
  _timerRemSec = state.timerSec;
  TimerWorker.setTotal(state.timerTotal);
  updateTimerDisplay();
}
function setCustomTimer() {
  const v = parseInt(document.getElementById('t-custom').value);
  if (v > 0) setTimer(v);
}
function toggleTimer() {
  const state = getDeepWorkState();
  if (state.timerRunning) {
    pauseTimer();
  } else if (state.timerStart === null) {
    // First call — start from scratch
    startTimer();
  } else {
    // Was paused — resume from exact position
    resumeTimer();
  }
}

function startTimer() {
  const state = getDeepWorkState();
  state.timerRunning = true;
  state.timerStart = Date.now();
  document.getElementById('t-btn').textContent   = dwt('dw_pause', 'Pause');
  document.getElementById('t-phase').textContent = dwt('dw_focus_phase', 'FOCUS');

  TimerWorker.start(state.timerSec, {
    onTick({ remSec }) {
      _timerRemSec = remSec;
      state.timerSec = remSec;
    },
    onComplete() {
      state.timerRunning = false;
      state.timerStart = null;
      if (_timerRafId) { cancelAnimationFrame(_timerRafId); _timerRafId = null; }
      completeSession();
    }
  });
  _startTimerRaf();
}

function _startTimerRaf() {
  if (_timerRafId) cancelAnimationFrame(_timerRafId);
  function rafLoop() {
    const state = getDeepWorkState();
    if (!state.timerRunning) { _timerRafId = null; return; }
    if (_timerRemSec !== _timerLastRendered) {
      _timerLastRendered = _timerRemSec;
      state.timerSec = _timerRemSec;
      _writeTimerToDOM();
    }
    _timerRafId = requestAnimationFrame(rafLoop);
  }
  _timerRafId = requestAnimationFrame(rafLoop);
}

function _writeTimerToDOM() {
  const state = getDeepWorkState();
  const t      = formatTime(state.timerSec);
  const pct    = state.timerTotal > 0 ? state.timerSec / state.timerTotal : 1;
  const offset = 565 - pct * 565;
  const el     = document.getElementById('t-display');
  const ring   = document.getElementById('t-ring-fill');
  const ft     = document.getElementById('focus-time');
  if (el)   el.textContent = t;
  if (ring) ring.style.strokeDashoffset = offset;
  if (ft && state.focusMode) ft.textContent = t;
}

function pauseTimer() {
  const state = getDeepWorkState();
  state.timerRunning = false;
  TimerWorker.pause();
  if (_timerRafId) { cancelAnimationFrame(_timerRafId); _timerRafId = null; }
  document.getElementById('t-btn').textContent   = dwt('dw_resume', 'Resume');
  document.getElementById('t-phase').textContent = dwt('dw_paused', 'PAUSED');
  const fb = document.getElementById('focus-toggle-btn');
  if (fb) fb.textContent = dwt('dw_resume', 'Resume');
}

function resumeTimer() {
  const state = getDeepWorkState();
  state.timerRunning = true;
  state.timerStart = Date.now();
  document.getElementById('t-btn').textContent   = dwt('dw_pause', 'Pause');
  document.getElementById('t-phase').textContent = dwt('dw_focus_phase', 'FOCUS');
  const fb = document.getElementById('focus-toggle-btn');
  if (fb) fb.textContent = dwt('dw_pause', 'Pause');
  TimerWorker.resume();
  _startTimerRaf();
}

function resetTimer() {
  const state = getDeepWorkState();
  state.timerRunning = false;
  state.timerStart = null;
  TimerWorker.reset();
  if (_timerRafId) { cancelAnimationFrame(_timerRafId); _timerRafId = null; }
  state.timerSec = state.timerTotal;
  _timerRemSec = state.timerTotal;
  _timerLastRendered = -1;
  document.getElementById('t-btn').textContent   = dwt('dw_start', 'Start');
  document.getElementById('t-phase').textContent = dwt('dw_ready', 'READY');
  updateTimerDisplay();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function updateTimerDisplay() {
  _timerLastRendered = -1;
  _writeTimerToDOM();
}

function completeSession() {
  const state = getDeepWorkState();
  pauseTimer();
  const goalInput = document.getElementById('t-goal-input');
  const goal = goalInput?.value||'';
  const actualMin = Math.max(1, Math.round((state.timerTotal - state.timerSec)/60) || Math.round(state.timerTotal/60));
  const k = today();
  if (!db.deepWork.sessions) db.deepWork.sessions=[];
  db.deepWork.sessions.unshift({ date:k, minutes:actualMin, goal, time:new Date().toLocaleTimeString(dwLocale(),{hour:'2-digit',minute:'2-digit'}) });
  if (db.deepWork.lastDate!==k) { db.deepWork.todayMin=0; db.deepWork.lastDate=k; }
  db.deepWork.todayMin+=actualMin;
  db.deepWork.totalMin=(db.deepWork.totalMin||0)+actualMin;
  db.stats.dwTotal=(db.stats.dwTotal||0)+actualMin;
  // Balanced: 1.2 XP per minute (reduced from 2.5 to prevent deep-work XP dominance)
  addXP(Math.round(actualMin * APP_CONSTANTS.XP.DEEPWORK_PER_MIN));
  if (db.deepWork.todayMin>=60) checkAch('dw_60');
  if (db.deepWork.totalMin>=300) checkAch('dw_300');
  checkQuestProgress();
  saveDB();
  EventBus.emit('deepwork:completed', {
    dateKey: k,
    minutes: actualMin,
    goal,
    xp: Math.round(actualMin * APP_CONSTANTS.XP.DEEPWORK_PER_MIN),
  });
  renderDW();
  notify(
    dwt(
      'dw_session_complete',
      (min, xp) => `Session ${min} min! +${xp} XP`,
      actualMin,
      Math.round(actualMin * APP_CONSTANTS.XP.DEEPWORK_PER_MIN)
    ),
    '⏱',
    'xp'
  );
  state.timerSec = state.timerTotal;
  updateTimerDisplay();
  if (state.focusMode) exitFocus();
}

function renderSmallEmptyState(host, text) {
  if (!host) return;
  host.innerHTML = '';
  const message = document.createElement('div');
  message.className = 'dim small';
  message.textContent = text;
  host.appendChild(message);
}

function buildDeepWorkSummaryRow(labelText, valueText, valueClassName, marginBottom = '0') {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.fontSize = '12px';
  if (marginBottom !== '0') row.style.marginBottom = marginBottom;

  const label = document.createElement('span');
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = `tag ${valueClassName}`;
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  return row;
}

function renderDW() {
  const k=today();
  const todayMin=db.deepWork.lastDate===k?db.deepWork.todayMin:0;
  const sessToday=(db.deepWork.sessions||[]).filter(s=>s.date===k);
  const el1=document.getElementById('t-sess-today');
  const el2=document.getElementById('t-total-min');
  if(el1) el1.textContent=sessToday.length;
  if(el2) el2.textContent=todayMin+'min';

  // Sessions list: build inside a fragment to avoid repeated reflow.
  const sl = document.getElementById('dw-sessions');
  if (sl) {
    if (!db.deepWork.sessions?.length) {
      renderSmallEmptyState(sl, dwt('dw_no_sessions', 'No sessions yet.'));
    } else {
      const frag = document.createDocumentFragment();
      db.deepWork.sessions.slice(0,15).forEach(s=>{
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '7px 0';
        row.style.borderBottom = '1px solid var(--border)';
        row.style.fontSize = '12px';

        const left = document.createElement('div');
        const time = document.createElement('span');
        time.className = 'mono';
        time.style.color = 'var(--text2)';
        time.textContent = `${s.date || ''} ${s.time || ''}`.trim();
        left.appendChild(time);

        if (s.goal) {
          const goal = document.createElement('div');
          goal.className = 'dim';
          goal.style.fontSize = '10px';
          goal.style.marginTop = '2px';
          goal.textContent = `🎯 ${s.goal}`;
          left.appendChild(goal);
        }

        const minutes = document.createElement('span');
        minutes.className = 'tag tb';
        minutes.textContent = `${s.minutes}min`;

        row.appendChild(left);
        row.appendChild(minutes);
        frag.appendChild(row);
      });
      sl.innerHTML = '';
      sl.appendChild(frag);
    }
  }

  // Distraction log: build inside a fragment for a single DOM commit.
  const dl = document.getElementById('dist-log');
  if (dl) {
    const dists = (db.deepWork.distractions||[]).slice(-10).reverse();
    if (!dists.length) {
      renderSmallEmptyState(dl, dwt('dw_no_distractions', 'No distractions logged.'));
    } else {
      const frag = document.createDocumentFragment();
      dists.forEach(d=>{
        const row = document.createElement('div');
        row.className = 'dist-item';

        const icon = document.createElement('span');
        icon.textContent = '⚠';

        const text = document.createElement('span');
        text.textContent = `${d.time || ''} — ${d.note || ''}`.trim();

        row.appendChild(icon);
        row.appendChild(text);
        frag.appendChild(row);
      });
      dl.innerHTML = '';
      dl.appendChild(frag);
    }
  }

  // Daily check
  const dc = document.getElementById('daily-check');
  if (dc) {
    const habDone=Object.keys(db.completions[k]||{}).length;
    dc.innerHTML = '';
    dc.appendChild(
      buildDeepWorkSummaryRow(
        dwt('dw_habits_label', 'Habits'),
        `${habDone}/${db.habits.length}`,
        habDone>=db.habits.length&&db.habits.length>0 ? 'tg' : 'tb',
        '6px'
      )
    );
    dc.appendChild(
      buildDeepWorkSummaryRow(
        dwt('nav_deepwork', 'Deep Work'),
        `${todayMin}min`,
        'tb'
      )
    );
  }
}

function enterFocus() {
  const state = getDeepWorkState();
  state.focusMode = true;
  document.getElementById('focus-overlay').classList.add('on');
  const goal=document.getElementById('t-goal-input')?.value||'';
  document.getElementById('focus-goal-text').textContent=goal?'🎯 '+goal:'';
  document.getElementById('focus-time').textContent = formatTime(state.timerSec);
  const fb = document.getElementById('focus-toggle-btn');
  if (!state.timerRunning) {
    startTimer();
    if (fb) fb.textContent = dwt('dw_pause', 'Pause');
  } else {
    if (fb) fb.textContent = dwt('dw_pause', 'Pause');
  }
}
function exitFocus() {
  const state = getDeepWorkState();
  state.focusMode = false;
  document.getElementById('focus-overlay').classList.remove('on');
}

function toggleHardcore() {
  const state = getDeepWorkState();
  state.hardcoreMode = !state.hardcoreMode;
  const hardcoreBtn = document.querySelector('.hardcore-btn');
  if (hardcoreBtn) {
    hardcoreBtn.textContent = state.hardcoreMode
      ? `☠ ${dwt('dw_hardcore_on_label', 'Hardcore ON')}`
      : `☠ ${dwt('dw_hardcore', 'Hardcore')}`;
  }
  notify(
    state.hardcoreMode ? dwt('dw_hardcore_on', 'Hardcore mode ON. Timer only.') : dwt('dw_hardcore_off', 'Hardcore mode OFF'),
    '☠',
    'info'
  );
}

async function logDistraction() {
  const note = await InputModal.show({
    title: dwt('dw_log_distraction_title', 'Describe the distraction:'),
    placeholder: dwt('dw_log_distraction_placeholder', 'e.g. Instagram, email notification...'),
    type:'text'
  });
  if (!note) return;
  if (!db.deepWork.distractions) db.deepWork.distractions = [];
  db.deepWork.distractions.push({ date: today(), time: new Date().toLocaleTimeString(dwLocale(),{hour:'2-digit',minute:'2-digit'}), note });
  saveDB(); renderDW();
  notify(dwt('dw_distraction_done', 'Distraction logged'), '⚠', 'info');
}

async function addStudyTopic() {
  const t = await InputModal.show({
    title: dwt('dw_add_study_title', 'Study topic:'),
    placeholder: dwt('dw_add_study_placeholder', 'e.g. Chapter 5, Mathematics...'),
    type:'text'
  });
  if (!t) return;
  const k = today();
  if (!db.studyPlan) db.studyPlan = {};
  if (!db.studyPlan[k]) db.studyPlan[k] = [];
  db.studyPlan[k].push({ topic: t, done: false });
  saveDB(); renderStudyPlan();
}

function renderStudyPlan() {
  const el=document.getElementById('study-plan');
  if (!el) return;
  const k=today();
  const topics=db.studyPlan?.[k]||[];
  if (!topics.length) {
    renderSmallEmptyState(el, dwt('dw_no_study_topics', 'No study topics yet. Add your plan.'));
    return;
  }
  el.innerHTML='';
  topics.forEach((t,i)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:7px;';

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='habit-check';
    toggle.style.cssText=`width:20px;height:20px;font-size:10px;cursor:pointer;${t.done?'background:var(--accent);border-color:var(--accent);color:#000':''}`;
    toggle.textContent=t.done?'✓':'';
    toggle.setAttribute('aria-label', t.done ? dwt('btn_uncheck', 'Uncheck') : dwt('btn_check', 'Check'));
    toggle.addEventListener('click', () => toggleStudy(i));

    const label=document.createElement('div');
    label.className='small'+(t.done?' dim':'');
    if (t.done) label.style.textDecoration='line-through';
    label.textContent=t.topic||'';

    const remove=document.createElement('button');
    remove.type='button';
    remove.className='btn btn-danger btn-xs';
    remove.style.marginLeft='auto';
    remove.textContent='✕';
    remove.setAttribute('aria-label', dwt('btn_delete', 'Delete'));
    remove.addEventListener('click', () => removeStudy(i));

    row.append(toggle, label, remove);
    el.appendChild(row);
  });
}

function toggleStudy(i) {
  const k=today();
  if (!db.studyPlan?.[k]) return;
  db.studyPlan[k][i].done=!db.studyPlan[k][i].done;
  if (db.studyPlan[k][i].done) addXP(25);
  saveDB(); renderStudyPlan();
}
function removeStudy(i) {
  const k=today();
  db.studyPlan?.[k]?.splice(i,1);
  saveDB(); renderStudyPlan();
}
function setGoalReached(v) {
  const k=today();
  if (!db.reflections) db.reflections={};
  if (!db.reflections[k]) db.reflections[k]={};
  db.reflections[k].goalReached=v;
  if (v) addXP(40);
  saveDB();
  const el=document.getElementById('goal-reached-msg');
  if (el) {
    el.textContent = v
      ? `✅ ${dwt('dw_goal_yes_msg', 'Great work. You are reinforcing who you want to become.')}`
      : `🔧 ${dwt('dw_goal_no_msg', 'That is okay. Restart tomorrow with more intent.')}`;
    el.style.color = v ? 'var(--accent)' : 'var(--gold)';
  }
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE CHARTS — inline Canvas 2D, no external dependency
// ═══════════════════════════════════════════════════════════════
// Chart.js was removed because it depended on a CDN and broke offline use.
// These lightweight Canvas helpers keep chart rendering self-contained.
// ───────────────────────────────────────────────────────────────

/**
 * Draws a line chart inside a <canvas> element.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 */
function _drawLineChart(canvas, labels, data) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
  const cssH = 180;
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = cssW, H = cssH;
  const pad = { top: 16, right: 16, bottom: 32, left: 42 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const n  = data.length;
  const maxV = Math.max(...data, 1);

  ctx.clearRect(0, 0, W, H);

  // Grid lines + Y labels
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = pad.top + ch - (i / steps) * ch;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    ctx.fillStyle = 'rgba(152,153,184,0.7)';
    ctx.font = `${9 * dpr / dpr}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV * i / steps), pad.left - 5, y + 3);
  }

  // X labels (every 2nd)
  ctx.fillStyle = 'rgba(152,153,184,0.7)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i += 2) {
    const x = pad.left + (i / (n - 1)) * cw;
    ctx.fillText(labels[i], x, H - 6);
  }

  // X axis line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ch); ctx.lineTo(pad.left + cw, pad.top + ch); ctx.stroke();

  // Filled area under curve
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = pad.left + (i / (n - 1)) * cw;
    const y = pad.top + ch - (data[i] / maxV) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(pad.left + (n - 1) / (n - 1) * cw, pad.top + ch);
  ctx.lineTo(pad.left, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,229,160,0.07)';
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#00e5a0';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const x = pad.left + (i / (n - 1)) * cw;
    const y = pad.top + ch - (data[i] / maxV) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#00e5a0';
  for (let i = 0; i < n; i++) {
    const x = pad.left + (i / (n - 1)) * cw;
    const y = pad.top + ch - (data[i] / maxV) * ch;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
}

/**
 * Draws a doughnut chart inside a <canvas> element.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string[]} colors
 */
function _drawDoughnutChart(canvas, labels, data, colors) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
  const cssH = 180;
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = cssW, H = cssH;
  const total = data.reduce((a, b) => a + b, 0);
  if (total === 0) return;

  // Pie area on left half, legend on right
  const pieSize = Math.min(H * 0.75, W * 0.4);
  const cx = pieSize * 0.65 + 8, cy = H / 2;
  const r  = pieSize / 2;

  ctx.clearRect(0, 0, W, H);

  let angle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const slice = (data[i] / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    angle += slice;
  }

  // Inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
  // Use the page background colour for the hole
  ctx.fillStyle = '#090d1a';
  ctx.fill();

  // Legend
  const legendX = cx + r + 18;
  const lineH   = 18;
  const startY  = cy - (labels.length * lineH) / 2 + lineH / 2;
  ctx.font = '10px sans-serif';
  for (let i = 0; i < labels.length; i++) {
    const y = startY + i * lineH;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legendX, y - 7, 10, 10);
    ctx.fillStyle = 'rgba(238,240,248,0.8)';
    const pct = Math.round((data[i] / total) * 100);
    ctx.fillText(`${labels[i]} (${pct}%)`, legendX + 14, y + 2);
  }
}

// ─── NAMESPACE: DeepWorkManager ───────────────────────────────
// Groups all deep-work timer and session functions under one object.
const DeepWorkManager = {
  start:          startTimer,
  pause:          pauseTimer,
  resume:         resumeTimer,
  stop:           resetTimer,
  toggle:         toggleTimer,
  setTimer,
  setCustomTimer,
  renderSessions: renderDW,
  completeSession,
  enterFocus,
  exitFocus,
  toggleHardcore,
};

// reminders.js - local reminder scheduling for the active app/PWA session
// Depends on: db.js (db, saveDB), ui-core.js (today), ui-core-habits.js (isHabitActiveOnDate)

const ReminderManager = (() => {
  const REMINDER_TAG = 'axiom-daily-reminder';
  let timerId = null;
  let started = false;

  function RT(key, ...args) {
    return AxiomText.t(key, ...args);
  }

  function hasValidTime(value) {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function currentDateKey(date = new Date()) {
    if (typeof today === 'function' && arguments.length === 0) return today();
    return date.toISOString().split('T')[0];
  }

  function reminderDate(time, base = new Date()) {
    if (!hasValidTime(time)) return null;
    const [hours, minutes] = time.split(':').map(Number);
    const due = new Date(base);
    due.setHours(hours, minutes, 0, 0);
    return due;
  }

  function countPendingHabits(dateKey) {
    const completions = db.completions?.[dateKey] || {};
    return (db.habits || []).filter((habit) => {
      if (habit?.archived) return false;
      if (typeof isHabitActiveOnDate === 'function' && !isHabitActiveOnDate(habit, dateKey)) return false;
      return !completions[habit.id];
    }).length;
  }

  async function ensurePermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'default') {
      try {
        return await Notification.requestPermission();
      } catch (error) {
        console.warn('[Reminder] permission request failed:', error);
      }
    }
    return Notification.permission;
  }

  async function showReminderNotification(pendingCount) {
    const body = pendingCount === 1
      ? RT('reminder_pending_one')
      : RT('reminder_pending_many', pendingCount);
    const options = {
      body,
      tag: REMINDER_TAG,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { section: 'habits' },
    };

    try {
      if (navigator.serviceWorker?.ready) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('axiomOS', options);
        return true;
      }
    } catch (error) {
      console.warn('[Reminder] service worker notification failed:', error);
    }

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('axiomOS', options);
      return true;
    }

    return false;
  }

  async function maybeSend(now = new Date()) {
    const time = db.settings?.remTime;
    if (!hasValidTime(time)) return false;

    const due = reminderDate(time, now);
    const dateKey = currentDateKey(now);
    if (!due || now < due) return false;
    if (db.settings?.reminderLastDate === dateKey) return false;

    const pendingCount = countPendingHabits(dateKey);
    if (pendingCount === 0) return false;

    const shown = await showReminderNotification(pendingCount);
    if (shown) {
      db.settings.reminderLastDate = dateKey;
      saveDB();
    }
    return shown;
  }

  function schedule() {
    clearTimer();
    const time = db.settings?.remTime;
    if (!hasValidTime(time)) return;

    const now = new Date();
    let nextRun = reminderDate(time, now);
    if (!nextRun) return;
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

    const delay = Math.min(Math.max(nextRun.getTime() - now.getTime(), 1000), 2147483647);
    timerId = setTimeout(async () => {
      await maybeSend(new Date());
      schedule();
    }, delay);
  }

  async function refresh() {
    await maybeSend(new Date());
    schedule();
  }

  async function configure(time) {
    if (!db.settings) db.settings = {};
    if (typeof time === 'string') db.settings.remTime = time;
    const permission = await ensurePermission();
    if (permission !== 'denied' && permission !== 'unsupported') {
      await refresh();
    } else {
      schedule();
    }
    return { permission };
  }

  function start() {
    if (started) return;
    started = true;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', () => refresh());
    window.addEventListener('online', () => refresh());
    refresh();
  }

  return {
    start,
    configure,
    refresh,
    maybeSendNow: () => maybeSend(new Date()),
  };
})();

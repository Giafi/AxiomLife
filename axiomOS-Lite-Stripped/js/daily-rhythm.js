// ================================================================
// daily-rhythm.js - Shared consistency and check-in aggregation
//
// Provides a small data contract used by reflection.js and stats.js
// for the calendar-based rhythm view. It stays data-first so UI layers
// can render it without duplicating business rules.
// ================================================================

(function initDailyRhythm(global) {
  'use strict';

  const EMOTION_DEFS = Object.freeze([
    { key: 'focused', icon: '🎯', labelKey: 'refl_emotion_focused' },
    { key: 'calm', icon: '🫶', labelKey: 'refl_emotion_calm' },
    { key: 'motivated', icon: '🔥', labelKey: 'refl_emotion_motivated' },
    { key: 'proud', icon: '🌟', labelKey: 'refl_emotion_proud' },
    { key: 'tired', icon: '😴', labelKey: 'refl_emotion_tired' },
    { key: 'stressed', icon: '😵', labelKey: 'refl_emotion_stressed' },
    { key: 'overwhelmed', icon: '🌊', labelKey: 'refl_emotion_overwhelmed' },
    { key: 'distracted', icon: '🌀', labelKey: 'refl_emotion_distracted' },
  ]);

  function rhythmText(key, fallback, ...args) {
    if (typeof global.I18n !== 'undefined') return global.I18n.t(key, ...args);
    return typeof fallback === 'function' ? fallback(...args) : fallback;
  }

  function toDateKey(date) {
    if (typeof global.toKey === 'function') return global.toKey(date);
    return new Date(date).toISOString().slice(0, 10);
  }

  function getDateKeyOffset(offset, referenceKey = null) {
    const date = referenceKey ? new Date(referenceKey) : new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return toDateKey(date);
  }

  function getRecentDateKeys(days = 14, referenceKey = null) {
    const keys = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      keys.push(getDateKeyOffset(-index, referenceKey));
    }
    return keys;
  }

  function getMoodEmoji(value) {
    const mood = Number(value || 0);
    return ['', '😞', '😕', '😐', '🙂', '😁'][mood] || '•';
  }

  function getEmotionDefs() {
    return EMOTION_DEFS.slice();
  }

  function getEmotionMeta(key) {
    return EMOTION_DEFS.find((item) => item.key === key) || null;
  }

  function getEmotionLabel(key) {
    const meta = getEmotionMeta(key);
    return meta ? rhythmText(meta.labelKey, key) : key;
  }

  function getReflections(db) {
    return db?.reflections || {};
  }

  function getReflectionEntry(db, dateKey) {
    return getReflections(db)[dateKey] || {};
  }

  function getEmotionTokens(entry) {
    return Array.isArray(entry?.emotions) ? entry.emotions.filter(Boolean) : [];
  }

  function hasCheckin(entry) {
    if (!entry) return false;
    return Number(entry.mood || 0) > 0
      || Number(entry.energy || 0) > 0
      || Number(entry.stress || 0) > 0
      || getEmotionTokens(entry).length > 0
      || !!entry.savedAt;
  }

  function hasReflection(entry) {
    if (!entry) return false;
    return ['q0', 'q1', 'q2', 'q3'].some((key) => String(entry[key] || '').trim().length > 0);
  }

  function getCompletionForDate(db, habitId, dateKey) {
    return db?.completions?.[dateKey]?.[habitId] || null;
  }

  function isHabitActive(habit, dateKey) {
    if (!habit || habit.archived) return false;
    if (typeof global.isHabitActiveOnDate === 'function') return global.isHabitActiveOnDate(habit, dateKey);
    return true;
  }

  function summarizeLastSevenDays(db, referenceKey = null) {
    const keys = getRecentDateKeys(7, referenceKey);
    const habits = Array.isArray(db?.habits) ? db.habits.filter((habit) => !habit.archived) : [];
    let activeSlots = 0;
    let completedSlots = 0;

    keys.forEach((dateKey) => {
      habits.forEach((habit) => {
        if (!isHabitActive(habit, dateKey)) return;
        activeSlots += 1;
        if (getCompletionForDate(db, habit.id, dateKey)) completedSlots += 1;
      });
    });

    const completionRate = activeSlots > 0 ? Math.round((completedSlots / activeSlots) * 100) : 0;
    const checkins = keys.map((dateKey) => getReflectionEntry(db, dateKey)).filter(hasCheckin);
    const energyValues = checkins.map((entry) => Number(entry.energy || 0)).filter((value) => value > 0);
    const stressValues = checkins.map((entry) => Number(entry.stress || 0)).filter((value) => value > 0);
    const emotionCounts = {};
    checkins.forEach((entry) => {
      getEmotionTokens(entry).forEach((emotion) => {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      });
    });
    const commonEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return {
      keys,
      completionRate,
      avgEnergy: energyValues.length ? Math.round(energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length) : 0,
      avgStress: stressValues.length ? Math.round(stressValues.reduce((sum, value) => sum + value, 0) / stressValues.length) : 0,
      commonEmotion,
      hasCheckins: checkins.length > 0,
      completedSlots,
      activeSlots,
    };
  }

  function getDeepWorkMinutesByDate(db, dateKey) {
    return (db?.deepWork?.sessions || [])
      .filter((session) => session.date === dateKey)
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  }

  function hasTomorrowSnapshot(snapshot) {
    if (!snapshot) return false;
    return !!(snapshot.intention || snapshot.p1 || snapshot.p2 || snapshot.p3 || snapshot.taskCount || snapshot.habitCount);
  }

  function countAnsweredReflectionFields(entry) {
    if (!entry) return 0;
    return ['q0', 'q1', 'q2', 'q3']
      .map((key) => String(entry[key] || '').trim())
      .filter(Boolean)
      .length;
  }

  function getTopHabitRows(db, dateKeys, limit = 4) {
    const habits = Array.isArray(db?.habits) ? db.habits.filter((habit) => !habit.archived) : [];
    return habits
      .map((habit) => {
        const completed = dateKeys.filter((dateKey) => !!getCompletionForDate(db, habit.id, dateKey)).length;
        const activeDays = dateKeys.filter((dateKey) => isHabitActive(habit, dateKey)).length;
        return {
          habit,
          score: completed * 10 + activeDays + Number(habit.streak || 0),
          completed,
          activeDays,
        };
      })
      .filter((item) => item.activeDays > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        id: `habit:${item.habit.id}`,
        label: item.habit.name || rhythmText('rhythm_unknown_habit', 'Habit'),
        detail: item.habit.trigger || rhythmText(`cat_${item.habit.cat}`, item.habit.cat || rhythmText('cat_other', 'Other')),
        count: item.completed,
        cells: dateKeys.map((dateKey) => {
          const active = isHabitActive(item.habit, dateKey);
          const completion = getCompletionForDate(db, item.habit.id, dateKey);
          return {
            dateKey,
            level: !active ? -1 : completion ? 3 : 0,
            title: `${item.habit.name || ''} ${dateKey}`,
          };
        }),
      }));
  }

  function buildRhythmRows(db, dateKeys) {
    const rows = getTopHabitRows(db, dateKeys, 4).map((row) => ({ ...row, group: 'habits' }));
    const tomorrowHistory = db?.tomorrowHistory || {};

    rows.push({
      id: 'focus',
      group: 'focus',
      label: rhythmText('rhythm_focus_label', 'Focus sessions'),
      detail: rhythmText('rhythm_focus_detail', 'Deep work logged'),
      count: dateKeys.filter((dateKey) => getDeepWorkMinutesByDate(db, dateKey) > 0).length,
      cells: dateKeys.map((dateKey) => {
        const minutes = getDeepWorkMinutesByDate(db, dateKey);
        return {
          dateKey,
          level: minutes >= 45 ? 3 : minutes >= 20 ? 2 : minutes > 0 ? 1 : 0,
          title: `${dateKey} - ${minutes}m`,
        };
      }),
    });

    rows.push({
      id: 'tomorrow',
      group: 'planning',
      label: rhythmText('rhythm_tomorrow_label', 'Tomorrow planned'),
      detail: rhythmText('rhythm_tomorrow_detail', 'Evening handoff'),
      count: dateKeys.filter((dateKey) => hasTomorrowSnapshot(tomorrowHistory[dateKey])).length,
      cells: dateKeys.map((dateKey) => ({
        dateKey,
        level: hasTomorrowSnapshot(tomorrowHistory[dateKey]) ? 2 : 0,
        title: dateKey,
      })),
    });

    rows.push({
      id: 'checkin',
      group: 'checkins',
      label: rhythmText('rhythm_checkin_label', 'Daily check-in'),
      detail: rhythmText('rhythm_checkin_detail', 'Mood, energy, stress'),
      count: dateKeys.filter((dateKey) => hasCheckin(getReflectionEntry(db, dateKey))).length,
      cells: dateKeys.map((dateKey) => {
        const entry = getReflectionEntry(db, dateKey);
        const score = Math.max(Number(entry.mood || 0), Number(entry.energy || 0), Number(entry.stress || 0));
        return {
          dateKey,
          level: hasCheckin(entry) ? Math.max(1, Math.min(3, score)) : 0,
          title: dateKey,
        };
      }),
    });

    rows.push({
      id: 'reflection',
      group: 'reflection',
      label: rhythmText('rhythm_reflection_label', 'Reflection'),
      detail: rhythmText('rhythm_reflection_detail', 'Wins, friction, tomorrow intent'),
      count: dateKeys.filter((dateKey) => hasReflection(getReflectionEntry(db, dateKey))).length,
      cells: dateKeys.map((dateKey) => {
        const entry = getReflectionEntry(db, dateKey);
        const answered = countAnsweredReflectionFields(entry);
        return {
          dateKey,
          level: answered >= 3 ? 3 : answered >= 1 ? 2 : 0,
          title: `${dateKey} - ${answered}`,
        };
      }),
    });

    rows.push({
      id: 'momentum',
      group: 'momentum',
      label: rhythmText('rhythm_momentum_label', 'Daily momentum'),
      detail: rhythmText('rhythm_momentum_detail', 'How complete the daily loop was'),
      count: dateKeys.filter((dateKey) => summarizeDate(db, dateKey).momentumLevel > 0).length,
      cells: dateKeys.map((dateKey) => {
        const summary = summarizeDate(db, dateKey);
        return {
          dateKey,
          level: summary.momentumLevel,
          title: `${dateKey} - ${summary.completedHabits}/${summary.activeHabits}`,
        };
      }),
    });

    return rows;
  }

  function buildMoodTrack(db, dateKeys) {
    return dateKeys.map((dateKey) => {
      const entry = getReflectionEntry(db, dateKey);
      return {
        dateKey,
        mood: Number(entry.mood || 0),
        emoji: getMoodEmoji(entry.mood),
      };
    });
  }

  function summarizeDate(db, dateKey) {
    const entry = getReflectionEntry(db, dateKey);
    const habits = Array.isArray(db?.habits) ? db.habits.filter((habit) => !habit.archived && isHabitActive(habit, dateKey)) : [];
    const completedHabits = habits.filter((habit) => !!getCompletionForDate(db, habit.id, dateKey)).length;
    const activeHabits = habits.length;
    const focusMinutes = getDeepWorkMinutesByDate(db, dateKey);
    const tomorrowPlanned = hasTomorrowSnapshot(db?.tomorrowHistory?.[dateKey]);
    const checkinSaved = hasCheckin(entry);
    const reflectionAnswered = hasReflection(entry);
    const reflectionCount = countAnsweredReflectionFields(entry);
    const momentumSignals = [
      activeHabits > 0 ? completedHabits / activeHabits : 0,
      focusMinutes >= 45 ? 1 : focusMinutes >= 20 ? 0.66 : focusMinutes > 0 ? 0.33 : 0,
      tomorrowPlanned ? 1 : 0,
      checkinSaved ? 1 : 0,
      reflectionAnswered ? 1 : 0,
    ];
    const momentumScore = momentumSignals.reduce((sum, value) => sum + value, 0) / momentumSignals.length;
    const momentumLevel = momentumScore >= 0.8 ? 3 : momentumScore >= 0.45 ? 2 : momentumScore > 0 ? 1 : 0;

    return {
      dateKey,
      activeHabits,
      completedHabits,
      focusMinutes,
      tomorrowPlanned,
      checkinSaved,
      reflectionAnswered,
      reflectionCount,
      mood: Number(entry.mood || 0),
      moodEmoji: getMoodEmoji(entry.mood),
      energy: Number(entry.energy || 0),
      stress: Number(entry.stress || 0),
      emotions: getEmotionTokens(entry),
      momentumLevel,
    };
  }

  global.AxiomDailyRhythm = {
    getEmotionDefs,
    getEmotionLabel,
    getMoodEmoji,
    getReflectionEntry,
    getEmotionTokens,
    hasCheckin,
    hasReflection,
    getRecentDateKeys,
    summarizeLastSevenDays,
    summarizeDate,
    buildRhythmRows,
    buildMoodTrack,
  };
}(typeof window !== 'undefined' ? window : globalThis));

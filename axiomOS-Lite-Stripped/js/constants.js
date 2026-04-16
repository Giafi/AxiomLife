// ─── CONSTANTS ───────────────────────────────────────────────
// Primitive globals shared by all modules.
// Loaded first — no dependencies.
const BUILD_META = Object.freeze({
  ...(globalThis.AXIOM_BUILD || {}),
});

const KEY = BUILD_META.storageKey || 'nexus_v2';
const ICONS = ['🌅','🏃','📚','💪','🧘','✍️','🎵','🎨','🧠','💧','🥗','🛌','📖','🎯','⚡','🌿','🔥','❄️','☀️','🌙','🍎','🏋','🚴','🧗','💻','✅','🎤','🤸','🧘','🏊','⚽','🎸','🥋','💊','🫧','🌱','🦁','🦅','🐉','💎','👑','⚔️','🛡','🔮','✨','🌟','🏆','🎖','🥇','📝','🧬'];
const COLORS = ['#00e5a0','#0099ff','#ff6b35','#8b5cf6','#fbbf24','#ef4444','#ec4899','#14b8a6','#84cc16','#f97316'];
const DAYS_IT = ['L','M','M','G','V','S','D'];
const CAT_ICONS = {salute:'💚',mente:'🧠',studio:'📚',fitness:'🏋',sociale:'👥',creativo:'🎨',produttività:'⚡',altro:'✨'};
const APP_META = Object.freeze({
  NAME: BUILD_META.name || 'axiomOS',
  VERSION: BUILD_META.version || '2.2.2',
  DEFAULT_TAGLINE: BUILD_META.tagline || 'Private habit + focus',
  DESCRIPTION: BUILD_META.description || 'Private habit and focus PWA. No signup, works offline, and helps you build daily momentum in seconds.',
  EDITION: BUILD_META.edition || 'full',
});

// ══════════════════════════════════════════════════════════════
// APP_CONSTANTS — centralised magic numbers and config values.
// Add new keys here instead of scattering literals through the code.
// ══════════════════════════════════════════════════════════════
const APP_CONSTANTS = Object.freeze({
  // Streak milestones — research-backed: 66 days = habit automation threshold.
  STREAK: { THREE_DAYS: 3, ONE_WEEK: 7, THREE_WEEKS: 21, ONE_MONTH: 30, AUTOMATION: 66, CENTURY: 100, YEAR: 365 },
  // XP economy — balanced to prevent inflation.
  // Base habit: 20 XP (difficulty multiplied up to ×3 = 60 XP max).
  // Momentum bonus adds 20 % or 50 % — theoretical max ~90 XP/habit.
  // Deep work: 1.2 XP/min → 72 XP for a 60-min session.
  XP: { QUEST_DAILY: 30, REFLECTION: 15, MILESTONE: 20, PRACTICE_PER_MIN: 0.8, DEEPWORK_PER_MIN: 1.2, ACHIEVEMENT: 75 },
  // Level curve — xpNext grows 15 % per level; level 50 ≈ 500k cumulative XP.
  LEVEL: { XP_MULTIPLIER: 1.15, ATTR_POINTS_PER_LEVEL: 3 },
  // Timer — DEFAULT_MINUTES is the standard Pomodoro length.
  TIMER: { DEFAULT_MINUTES: 25, TICK_INTERVAL_MS: 250, BG_FPS: 8, FOCUS_FPS: 20, AUTOSAVE_MS: 30000 },
  // UI caps and chunk sizes.
  UI: { MAX_TOASTS: 4, HABIT_CHUNK_SIZE: 20, MAX_HISTORY_ITEMS: 100, HEATMAP_WEEKS: 16 },
  // Difficulty XP multipliers — primary progression lever, do not change lightly.
  DIFFICULTY: { EASY: 1, MEDIUM: 1.5, HARD: 2, EXTREME: 3 },
  // Random suffix length used by generateId().
  ID_ENTROPY_LENGTH: 5
});

globalThis.BUILD_META = BUILD_META;
globalThis.APP_META = APP_META;
globalThis.APP_CONSTANTS = APP_CONSTANTS;

// ══════════════════════════════════════════════════════════════
// ID GENERATION
// ══════════════════════════════════════════════════════════════

/**
 * Generates a collision-resistant entity ID with a human-readable prefix.
 * Format: "<prefix>_<timestamp>_<randomSuffix>"
 * Example: generateId('h') → "h_1712345678901_x7k2p"
 *
 * Using both Date.now() and random entropy prevents collisions when two
 * entities are created within the same millisecond (e.g. bulk-import).
 *
 * @param {string} prefix - Short domain label ('h', 'g', 'id', 'exp', …)
 * @returns {string}
 */
function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 2 + APP_CONSTANTS.ID_ENTROPY_LENGTH);
}

// ══════════════════════════════════════════════════════════════
// DATA BUILDERS
// These builders must be available before createDB() is called.
// They live here (constants.js, loaded first) so that db.js can
// call createDB() safely regardless of script order.
// ══════════════════════════════════════════════════════════════
function buildAchs() {
  return [
    {id:'first_habit',n:'First Habit',d:'Create your first habit',ic:'🌱',u:false},
    {id:'first_done',n:'First Completion',d:'Complete a habit for the first time',ic:'✅',u:false},
    {id:'first_id',n:'Who I Am',d:'Create your first identity',ic:'🧬',u:false},
    {id:'first_goal',n:'Big Plan',d:'Create your first goal',ic:'🗺',u:false},
    {id:'streak_3',n:'3 Days',d:'Reach a 3-day streak',ic:'🔥',u:false},
    {id:'streak_7',n:'One Week',d:'Reach a 7-day streak',ic:'⚡',u:false},
    {id:'streak_21',n:'3 Weeks',d:'Reach a 21-day streak',ic:'💎',u:false},
    {id:'streak_30',n:'Golden Month',d:'Reach a 30-day streak',ic:'🏆',u:false},
    {id:'streak_66',n:'Automatic',d:'66 days - habit automated!',ic:'🧠',u:false},
    {id:'streak_100',n:'Centurion',d:'Reach a 100-day streak',ic:'👑',u:false},
    {id:'streak_365',n:'Legendary Year',d:'365 consecutive days',ic:'🐉',u:false,hidden:true},
    {id:'level_5',n:'Lv.5',d:'Reach level 5',ic:'⭐',u:false},
    {id:'level_10',n:'Lv.10 Veteran',d:'Reach level 10',ic:'🌟',u:false},
    {id:'level_25',n:'Lv.25 Expert',d:'Reach level 25',ic:'💫',u:false},
    {id:'level_50',n:'Lv.50 Master',d:'Reach level 50',ic:'🔮',u:false,hidden:true},
    {id:'xp_1k',n:'1,000 XP',d:'Accumulate 1,000 XP',ic:'⚡',u:false},
    {id:'xp_5k',n:'5,000 XP',d:'Accumulate 5,000 XP',ic:'💥',u:false},
    {id:'xp_10k',n:'10,000 XP',d:'Accumulate 10,000 XP',ic:'🌠',u:false,hidden:true},
    {id:'habits_5',n:'5 Pillars',d:'Create 5 habits',ic:'🏛',u:false},
    {id:'habits_10',n:'Decathlon',d:'Create 10 habits',ic:'🎯',u:false},
    {id:'perfect_day',n:'Perfect Day',d:'Complete all habits in one day',ic:'🌈',u:false},
    {id:'early_bird',n:'Early Bird',d:'Complete a habit before 8 AM',ic:'🌅',u:false},
    {id:'night_owl',n:'Night Owl',d:'Complete a habit after 11 PM',ic:'🦉',u:false,hidden:true},
    {id:'dw_60',n:'One Hour Focus',d:'60 minutes of deep work in one day',ic:'⏱',u:false},
    {id:'dw_300',n:'Machine',d:'300 total minutes of deep work',ic:'🔧',u:false},
    {id:'reflect_7',n:'Mirror',d:'Save 7 reflections',ic:'🪞',u:false},
    {id:'workout_1',n:'First Sweat',d:'Log your first workout',ic:'🏋',u:false},
    {id:'workout_10',n:'Training Arc',d:'Log 10 workouts',ic:'💪',u:false},
    {id:'workout_week_3',n:'Weekly Warrior',d:'Log 3 workouts in 7 days',ic:'📅',u:false},
    {id:'hydrate_7',n:'Hydration Protocol',d:'Hit your water goal on 7 days',ic:'💧',u:false},
    {id:'weight_5',n:'Body Check',d:'Log body weight 5 times',ic:'⚖',u:false},
    {id:'pr_1',n:'PR Hunter',d:'Add your first personal record',ic:'🏆',u:false},
    {id:'checkin_7',n:'Recovery Minded',d:'Save 7 recovery check-ins',ic:'🌙',u:false},
    {id:'lifeareas_2',n:'Balanced Build',d:'Reach level 2 in every life area',ic:'🌍',u:false},
    {id:'attr_15',n:'Specialist',d:'Raise one attribute to 15',ic:'⚡',u:false},
    {id:'comp_50',n:'50 Completions',d:'Reach 50 total completions',ic:'🎖',u:false},
    {id:'comp_100',n:'100 Completions',d:'Reach 100 total completions',ic:'🥇',u:false},
    {id:'comp_500',n:'500 Completions',d:'Reach 500 total completions',ic:'🏅',u:false,hidden:true},
  ].map((achievement) => ({
    seen: false,
    unlocked: Boolean(achievement.u),
    ...achievement,
  }));
}

function isAchievementUnlocked(achievement) {
  return Boolean(achievement && (achievement.u || achievement.unlocked));
}

function buildPkgs() {
  return [
    {id:'morning',n:'Morning Routine',ic:'🌅',d:'Start the day with clarity and energy',active:false,
      habits:[{name:'Meditation',icon:'🧘',color:'#00e5a0',cat:'mente',type:'boolean',diff:1,trigger:'on wake-up'},
               {name:'Water (500ml)',icon:'💧',color:'#0099ff',cat:'salute',type:'boolean',diff:1,trigger:'on wake-up'},
               {name:'Stretching',icon:'🤸',color:'#8b5cf6',cat:'fitness',type:'time',diff:1,trigger:'after water'},
               {name:'Journaling',icon:'✍️',color:'#fbbf24',cat:'mente',type:'boolean',diff:1,trigger:'after stretching'}]},
    {id:'study',n:'Study Routine',ic:'📚',d:'Maximize academic performance',active:false,
      habits:[{name:'Deep Work 25 min',icon:'⏱',color:'#0099ff',cat:'studio',type:'time',diff:2,trigger:'after breakfast'},
               {name:'Review Notes',icon:'📝',color:'#00e5a0',cat:'studio',type:'boolean',diff:2,trigger:'after deep work'},
               {name:'Read 20 min',icon:'📖',color:'#8b5cf6',cat:'studio',type:'time',diff:1,trigger:'evening'},
               {name:'Active Recall',icon:'🧠',color:'#ff6b35',cat:'studio',type:'boolean',diff:3,trigger:'before sleep'}]},
    {id:'fitness',n:'Fitness Routine',ic:'🏋',d:'Build a stronger and healthier body',active:false,
      habits:[{name:'Workout',icon:'💪',color:'#ff6b35',cat:'fitness',type:'boolean',diff:3,trigger:'afternoon'},
               {name:'8,000 Steps',icon:'🚶',color:'#00e5a0',cat:'fitness',type:'count',diff:1,trigger:'during the day'},
               {name:'Enough Protein',icon:'🥩',color:'#fbbf24',cat:'salute',type:'boolean',diff:1,trigger:'meals'},
               {name:'Evening Stretching',icon:'🧘',color:'#8b5cf6',cat:'fitness',type:'time',diff:1,trigger:'evening'}]},
    {id:'mindful',n:'Mindfulness',ic:'🧘',d:'Cultivate calm, presence and clarity',active:false,
      habits:[{name:'Meditation 10 min',icon:'🧘',color:'#8b5cf6',cat:'mente',type:'time',diff:2,trigger:'morning'},
               {name:'Mindful Breathing',icon:'💨',color:'#0099ff',cat:'salute',type:'boolean',diff:1,trigger:'break'},
               {name:'3 Gratitudes',icon:'🙏',color:'#fbbf24',cat:'mente',type:'boolean',diff:1,trigger:'evening'},
               {name:'No Social After 9 PM',icon:'📵',color:'#ff6b35',cat:'mente',type:'boolean',diff:2,trigger:'evening'}]},
  ];
}

function buildQuotes() {
  return [
    {id:'q1',text:'You are not your habits. But your habits shape who you become.',author:'James Clear',cat:'identity'},
    {id:'q2',text:'Every action you take is a vote for the type of person you wish to become.',author:'James Clear',cat:'identity'},
    {id:'q3',text:'Success is the product of daily habits, not sudden transformation.',author:'James Clear',cat:'consistency'},
    {id:'q4',text:'Do not raise the level of your goals. Raise the level of your systems.',author:'James Clear',cat:'discipline'},
    {id:'q5',text:'Motivation comes after action, not before it.',author:'Mark Manson',cat:'discipline'},
    {id:'q6',text:'Discipline is doing what must be done even when you do not feel like it.',author:'Anonymous',cat:'discipline'},
    {id:'q7',text:'Small habits create extraordinary results over time.',author:'Anonymous',cat:'consistency'},
    {id:'q8',text:'Consistency beats talent when talent is not consistent.',author:'Anonymous',cat:'consistency'},
    {id:'q9',text:'First you build the habit, then the habit builds you.',author:'Anonymous',cat:'identity'},
    {id:'q10',text:'Every day is a choice. Choose the best version of yourself.',author:'Anonymous',cat:'growth'},
    {id:'q11',text:'Strength is not built by easy things. It grows by overcoming hard ones.',author:'Anonymous',cat:'discipline'},
    {id:'q12',text:'Become the person who deserves the success you desire.',author:'Anonymous',cat:'identity'},
    {id:'q13',text:'Change is not an event. It is a process.',author:'Anonymous',cat:'growth'},
    {id:'q14',text:'Do something every day that your future self will thank you for.',author:'Anonymous',cat:'growth'},
    {id:'q15',text:'Discipline is the bridge between goals and results.',author:'Jim Rohn',cat:'discipline'},
    {id:'q16',text:'The body achieves what the mind commands.',author:'Anonymous',cat:'discipline'},
    {id:'q17',text:'You do not need to be perfect. You only need to keep going.',author:'Anonymous',cat:'consistency'},
    {id:'q18',text:'Whenever you think you cannot do it, remember why you started.',author:'Anonymous',cat:'growth'},
    {id:'q19',text:'Progress requires discomfort. Discomfort is the signal that you are growing.',author:'Anonymous',cat:'growth'},
    {id:'q20',text:'Do not wait for motivation. Build the ritual and motivation will follow.',author:'Anonymous',cat:'discipline'},
    {id:'q21',text:'Professionals do not wait for inspiration - they sit down and work.',author:'Steven Pressfield',cat:'discipline'},
    {id:'q22',text:'The difference between who you are and who you want to be is what you do.',author:'Anonymous',cat:'identity'},
    {id:'q23',text:'Willpower is like a muscle: it grows through daily practice.',author:'Anonymous',cat:'discipline'},
    {id:'q24',text:'Be the version of yourself that you dreamed of becoming seven years ago.',author:'Anonymous',cat:'identity'},
    {id:'q25',text:'A year from now you will regret not starting today.',author:'Karen Lamb',cat:'growth'},
    {id:'q26',text:'Growth is painful. Change is painful. But staying stuck hurts more.',author:'Anonymous',cat:'growth'},
    {id:'q27',text:'Do not count the days. Make the days count.',author:'Muhammad Ali',cat:'consistency'},
    {id:'q28',text:'Act like the person you want to become before you feel ready.',author:'Amy Cuddy',cat:'identity'},
    {id:'q29',text:'Your actions today become your character tomorrow.',author:'Anonymous',cat:'identity'},
    {id:'q30',text:'The only way to eat an elephant is one bite at a time.',author:'Creighton Abrams',cat:'consistency'},
  ];
}

/**
 * Highway Trivia — app.js
 * Guest-mode only. No frameworks. No npm.
 * TODO: Replace localStorage with Supabase for user accounts & cross-device sync.
 */

// ─── Feature Flags ────────────────────────────────────────────────────────────
const TIMER_ENABLED = false;  // Set true to enable 15s countdown bar in Streak Mode
const TIMER_SECONDS = 15;

// ─── localStorage Keys ────────────────────────────────────────────────────────
const KEY_DAILY_RESULTS = 'hst-daily-results'; // { "2026-05-18": { guessed: 0, correct: true } }
const KEY_DAILY_STREAK  = 'hst-daily-streak';  // { current: N, best: N, lastDate: "YYYY-MM-DD" }
const KEY_STREAK_BESTS  = 'hst-streak-bests';  // { interstate: N, us_routes: N, state_routes: N }

// ─── App State ────────────────────────────────────────────────────────────────
let allPuzzles       = [];    // loaded from puzzles.json
let currentMode      = null;  // 'home' | 'daily' | 'streak'
let dailyPuzzle      = null;
let streakPuzzle     = null;
let streakTier       = 'interstate';
let streakCount      = 0;
let timerInterval    = null;
let timerRemaining   = TIMER_SECONDS;

// ─── Helpers: Date ────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" (local time). */
function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Helpers: localStorage ────────────────────────────────────────────────────

function loadDailyStreak() {
  try { return JSON.parse(localStorage.getItem(KEY_DAILY_STREAK)) || { current: 0, best: 0, lastDate: null }; }
  catch { return { current: 0, best: 0, lastDate: null }; }
}

function saveDailyStreak(obj) {
  localStorage.setItem(KEY_DAILY_STREAK, JSON.stringify(obj));
}

function loadDailyResults() {
  try { return JSON.parse(localStorage.getItem(KEY_DAILY_RESULTS)) || {}; }
  catch { return {}; }
}

function saveDailyResults(obj) {
  localStorage.setItem(KEY_DAILY_RESULTS, JSON.stringify(obj));
}

function loadStreakBests() {
  try { return JSON.parse(localStorage.getItem(KEY_STREAK_BESTS)) || { interstate: 0, us_routes: 0, state_routes: 0 }; }
  catch { return { interstate: 0, us_routes: 0, state_routes: 0 }; }
}

function saveStreakBests(obj) {
  localStorage.setItem(KEY_STREAK_BESTS, JSON.stringify(obj));
}

// ─── Helpers: Daily Streak Logic ─────────────────────────────────────────────

/**
 * Update the daily streak after a guess.
 * Correct on today → increment (or start).
 * Wrong on today → reset to 0.
 */
function updateDailyStreak(correct) {
  const today  = todayString();
  const streak = loadDailyStreak();

  if (correct) {
    // Only increment if we haven't already counted today
    if (streak.lastDate !== today) {
      streak.current++;
      streak.lastDate = today;
      if (streak.current > streak.best) streak.best = streak.current;
    }
  } else {
    streak.current  = 0;
    streak.lastDate = today;
  }
  saveDailyStreak(streak);
  return streak;
}

/**
 * If the user skipped a day, reset their current streak.
 * Called on home-screen render.
 */
function checkDailyStreakDecay() {
  const today  = todayString();
  const streak = loadDailyStreak();
  if (!streak.lastDate) return streak;

  // If last interaction was not yesterday or today → reset current
  const last  = new Date(streak.lastDate);
  const now   = new Date(today);
  const diffMs = now - last;
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays > 1) {
    streak.current = 0;
    saveDailyStreak(streak);
  }
  return streak;
}

// ─── Helpers: Answer Normalisation (Streak Mode) ─────────────────────────────

/**
 * Strip highway prefixes, collapse whitespace/hyphens, lowercase.
 * Examples:
 *   "Interstate 70"  → "70"
 *   "I-70"           → "70"
 *   "i70"            → "70"
 *   "US Route 66"    → "66"
 *   "State Route 470"→ "470"
 *   "C-470"          → "470"  (Colorado uses C- prefix)
 */
function normalizeAnswer(raw) {
  let s = raw.trim().toLowerCase();

  // Remove common prefixes (order matters — longer phrases first)
  s = s.replace(/\bstate\s+route\b/g, '');
  s = s.replace(/\bus\s+route\b/g, '');
  s = s.replace(/\bus\s+highway\b/g, '');
  s = s.replace(/\binterstate\b/g, '');
  s = s.replace(/\bhighway\b/g, '');
  s = s.replace(/\broute\b/g, '');

  // Strip single-letter road codes (I-, US-, SR-, CO-, TX-, FL-, C-, E-)
  s = s.replace(/\b[a-z]{1,2}-/g, '');

  // Remove all spaces, hyphens, dots
  s = s.replace(/[\s\-\.]+/g, '');

  return s;
}

// ─── Screen Rendering ─────────────────────────────────────────────────────────

const app = document.getElementById('app');

/** Clears the app container and renders a new screen. */
function renderScreen(html) {
  app.innerHTML = html;
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────

function renderHome() {
  currentMode = 'home';
  clearTimer();

  const streak     = checkDailyStreakDecay();
  const bests      = loadStreakBests();
  const today      = todayString();
  const results    = loadDailyResults();
  const todayDone  = results[today] !== undefined;
  const todayRight = todayDone && results[today].correct;

  const streakEmoji = streak.current > 0 ? '🔥' : '💤';

  renderScreen(`
    <div class="ht-home">
      <!-- Ad: top banner -->
      <div id="ad-top" class="ht-ad ht-ad-top">
        <span>Advertisement</span>
      </div>

      <header class="ht-header">
        <div class="ht-logo">🛣️</div>
        <h1 class="ht-title">Highway Trivia</h1>
        <p class="ht-subtitle">Identify the missing route from the map</p>
      </header>

      <main class="ht-home-main">

        <!-- Daily Challenge card -->
        <div class="ht-mode-card ${todayRight ? 'ht-mode-card--done' : ''}">
          <button class="ht-big-btn ht-big-btn--daily" id="btn-daily" ${todayDone ? 'data-done="true"' : ''}>
            <span class="ht-big-btn-icon">📅</span>
            <span class="ht-big-btn-label">Daily Challenge</span>
            ${todayDone ? `<span class="ht-big-btn-badge">${todayRight ? '✓ Done' : '✗ Missed'}</span>` : ''}
          </button>
          <div class="ht-mode-meta">
            <span class="ht-streak-display">${streakEmoji} Daily streak: <strong>${streak.current}</strong></span>
            ${streak.best > 0 ? `<span class="ht-streak-best">Best: ${streak.best}</span>` : ''}
          </div>
        </div>

        <!-- Streak Mode card -->
        <div class="ht-mode-card">
          <button class="ht-big-btn ht-big-btn--streak" id="btn-streak">
            <span class="ht-big-btn-icon">⚡</span>
            <span class="ht-big-btn-label">Streak Mode</span>
          </button>

          <div class="ht-mode-meta">
            <label class="ht-tier-label">Difficulty:</label>
            <div class="ht-tier-selector">
              <button class="ht-tier-btn ${streakTier === 'interstate' ? 'active' : ''}" data-tier="interstate">Interstate</button>
              <button class="ht-tier-btn ${streakTier === 'us_routes' ? 'active' : ''}" data-tier="us_routes">US Routes</button>
              <button class="ht-tier-btn ${streakTier === 'state_routes' ? 'active' : ''}" data-tier="state_routes">State Routes</button>
            </div>
            <div class="ht-tier-bests">
              <span>🏆 Best: I-<strong>${bests.interstate}</strong> &nbsp;|&nbsp; US-<strong>${bests.us_routes}</strong> &nbsp;|&nbsp; SR-<strong>${bests.state_routes}</strong></span>
            </div>
          </div>
        </div>

      </main>
    </div>
  `);

  // Event: Daily button
  document.getElementById('btn-daily').addEventListener('click', startDaily);

  // Event: Streak button
  document.getElementById('btn-streak').addEventListener('click', startStreak);

  // Event: Tier selector buttons
  document.querySelectorAll('.ht-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      streakTier = btn.dataset.tier;
      document.querySelectorAll('.ht-tier-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ─── DAILY CHALLENGE ─────────────────────────────────────────────────────────

function startDaily() {
  const today   = todayString();
  const puzzle  = allPuzzles.find(p => p.type === 'daily' && p.date === today);

  if (!puzzle) {
    showToast('No puzzle available for today. Check back tomorrow!');
    return;
  }

  dailyPuzzle = puzzle;
  const results   = loadDailyResults();
  const alreadyDone = results[today] !== undefined;

  renderDailyPuzzle(puzzle, alreadyDone ? results[today] : null);
}

/**
 * Render the daily puzzle screen.
 * @param {Object} puzzle
 * @param {Object|null} priorResult  — if already answered, pass the stored result
 */
function renderDailyPuzzle(puzzle, priorResult) {
  currentMode = 'daily';

  const optionsHtml = puzzle.options.map((opt, i) => `
    <button class="bs-opt ht-opt ${priorResult ? (i === puzzle.correct_index ? 'reveal' : (priorResult.guessed === i ? 'wrong' : '')) : ''}"
            data-index="${i}"
            ${priorResult ? 'disabled' : ''}>
      <span class="bs-opt-inner">
        <span class="bs-opt-dot"></span>
        <span class="bs-opt-text">${opt}</span>
        <span class="bs-opt-arrow">→</span>
      </span>
    </button>
  `).join('');

  const resultHtml = priorResult ? buildResultPanel(puzzle, priorResult.correct, priorResult.guessed) : '';

  renderScreen(`
    <div class="ht-daily">
      <!-- Ad top -->
      <div id="ad-top" class="ht-ad ht-ad-top"><span>Advertisement</span></div>

      <header class="ht-screen-header">
        <button class="ht-back-btn" id="btn-back">← Back</button>
        <h2 class="ht-screen-title">Daily Challenge</h2>
        <span class="ht-screen-date">${puzzle.date}</span>
      </header>

      <div class="ht-puzzle-area">
        <div class="ht-region-badge">${puzzle.region}</div>
        <div class="ht-svg-wrap" id="svg-wrap">
          <img class="ht-puzzle-svg" src="${puzzle.svg_file}" alt="Highway map puzzle for ${puzzle.region}" id="puzzle-svg"/>
          <!-- Reveal overlay is injected here by JS -->
        </div>
        <p class="ht-prompt">Which route belongs at the <strong>?</strong> marker?</p>
      </div>

      <div class="bs-options ht-options" id="options-container">
        ${optionsHtml}
      </div>

      <div id="result-area">
        ${resultHtml}
      </div>

      ${priorResult ? '<div id="ad-bottom" class="ht-ad ht-ad-bottom"><span>Advertisement</span></div>' : ''}
    </div>
  `);

  document.getElementById('btn-back').addEventListener('click', renderHome);

  if (!priorResult) {
    document.querySelectorAll('.ht-opt').forEach(btn => {
      btn.addEventListener('click', () => handleDailyGuess(parseInt(btn.dataset.index)));
    });
  }
}

/**
 * Handle a daily guess click.
 */
function handleDailyGuess(guessIndex) {
  const puzzle  = dailyPuzzle;
  const correct = guessIndex === puzzle.correct_index;
  const today   = todayString();

  // Disable all buttons
  document.querySelectorAll('.ht-opt').forEach(btn => btn.disabled = true);

  // Apply correct/wrong classes
  document.querySelectorAll('.ht-opt').forEach(btn => {
    const i = parseInt(btn.dataset.index);
    if (i === puzzle.correct_index) btn.classList.add('reveal');
    else if (i === guessIndex && !correct) btn.classList.add('wrong');
  });

  // Save result
  const results = loadDailyResults();
  results[today] = { guessed: guessIndex, correct };
  saveDailyResults(results);

  const streak = updateDailyStreak(correct);

  // Answer reveal animation
  animateReveal(puzzle, correct);

  // If wrong, flash red background briefly
  if (!correct) {
    const svgWrap = document.getElementById('svg-wrap');
    svgWrap.classList.add('ht-flash-wrong');
    setTimeout(() => svgWrap.classList.remove('ht-flash-wrong'), 600);
  }

  // Show result panel after short delay
  setTimeout(() => {
    const resultArea = document.getElementById('result-area');
    resultArea.innerHTML = buildResultPanel(puzzle, correct, guessIndex, streak);
    // Insert bottom ad
    if (!document.getElementById('ad-bottom')) {
      const ad = document.createElement('div');
      ad.id = 'ad-bottom';
      ad.className = 'ht-ad ht-ad-bottom';
      ad.innerHTML = '<span>Advertisement</span>';
      resultArea.after(ad);
    }
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, correct ? 800 : 1100);
}

/**
 * Animate the correct shield badge overlaid on the SVG after a guess.
 */
function animateReveal(puzzle, correct) {
  const svgEl = document.getElementById('puzzle-svg');
  if (!svgEl) return;

  const rect = svgEl.getBoundingClientRect();
  const appRect = app.getBoundingClientRect();

  // Position roughly at center of SVG
  const x = rect.left - appRect.left + rect.width / 2;
  const y = rect.top  - appRect.top  + rect.height / 2;

  const badge = document.createElement('div');
  badge.className = `ht-reveal-badge ${correct ? 'ht-reveal-badge--correct' : 'ht-reveal-badge--wrong'}`;
  badge.textContent = puzzle.answer_display;
  badge.style.left  = `${x}px`;
  badge.style.top   = `${y}px`;

  app.style.position = 'relative';
  app.appendChild(badge);

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => badge.classList.add('ht-reveal-badge--visible'));
  });

  // Remove after animation
  setTimeout(() => badge.remove(), 2000);
}

/**
 * Build the result panel HTML.
 */
function buildResultPanel(puzzle, correct, guessIndex, streak) {
  const streakData = streak || loadDailyStreak();
  const verdict = correct
    ? `✅ Correct! That's <strong>${puzzle.answer_display}</strong>.`
    : `❌ Not quite. The answer was <strong>${puzzle.answer_display}</strong>.`;

  const shareText = buildShareString(puzzle, correct);

  return `
    <div class="ht-result-panel bs-result-panel">
      <p class="ht-verdict">${verdict}</p>

      <div class="ht-streak-result">
        🔥 Daily streak: <strong>${streakData.current}</strong>
        ${streakData.current > 1 ? ` &nbsp;|&nbsp; Best: <strong>${streakData.best}</strong>` : ''}
      </div>

      <div class="ht-fact-box">
        <p class="ht-fact-label">Fun Fact</p>
        <p class="ht-fact-text">${puzzle.fun_fact}</p>
      </div>

      <div class="ht-tricky-box">
        <p class="ht-fact-label">Why It's Tricky</p>
        <p class="ht-fact-text">${puzzle.why_tricky}</p>
      </div>

      <div class="ht-share-area">
        <pre class="ht-share-string" id="share-string">${shareText}</pre>
        <button class="bs-btn bs-btn-secondary ht-share-btn" id="btn-share">Copy Share Text</button>
      </div>

      <button class="bs-btn bs-btn-primary ht-home-btn" id="btn-result-home">← Home</button>
    </div>
  `;
}

/**
 * Build the share string (clipboard-ready).
 */
function buildShareString(puzzle, correct) {
  const icon = correct ? '🟩' : '🟥';
  return `Highway Trivia — ${puzzle.date}\n${puzzle.region}\n${icon} ${correct ? 'Correct' : 'Wrong'}\nhighway-trivia.app`;
}

// Delegated events for result panel buttons (rendered dynamically)
app.addEventListener('click', e => {
  if (e.target.id === 'btn-share') {
    const text = document.getElementById('share-string')?.textContent || '';
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
  }
  if (e.target.id === 'btn-result-home') renderHome();
  if (e.target.id === 'btn-gameover-retry') startStreakWithTier(streakTier);
  if (e.target.id === 'btn-gameover-home') renderHome();
});

// ─── STREAK MODE ─────────────────────────────────────────────────────────────

function startStreak() {
  startStreakWithTier(streakTier);
}

function startStreakWithTier(tier) {
  streakTier  = tier;
  streakCount = 0;
  drawNextStreakPuzzle();
}

/** Pick a random puzzle from the streak pool for the current tier. */
function drawNextStreakPuzzle() {
  const pool = allPuzzles.filter(p => p.type === 'streak' && p.difficulty === streakTier);
  if (pool.length === 0) {
    showToast(`No streak puzzles available for tier: ${streakTier}`);
    renderHome();
    return;
  }
  const idx = Math.floor(Math.random() * pool.length);
  streakPuzzle = pool[idx];
  renderStreakPuzzle();
}

function renderStreakPuzzle() {
  currentMode = 'streak';

  const tierLabel = { interstate: 'Interstate', us_routes: 'US Routes', state_routes: 'State Routes' }[streakTier] || streakTier;
  const bests     = loadStreakBests();
  const best      = bests[streakTier] || 0;

  const timerHtml = TIMER_ENABLED
    ? `<div class="ht-timer-bar-wrap"><div class="ht-timer-bar" id="timer-bar"></div></div>`
    : '';

  renderScreen(`
    <div class="ht-streak">
      <div id="ad-top" class="ht-ad ht-ad-top"><span>Advertisement</span></div>

      <header class="ht-screen-header">
        <button class="ht-back-btn" id="btn-back">← Home</button>
        <h2 class="ht-screen-title">Streak Mode</h2>
        <span class="ht-tier-pill">${tierLabel}</span>
      </header>

      <div class="ht-streak-scorebar">
        <span>⚡ Streak: <strong id="streak-counter">${streakCount}</strong></span>
        <span>🏆 Best: <strong>${best}</strong></span>
      </div>

      ${timerHtml}

      <div class="ht-puzzle-area">
        <div class="ht-region-badge">${streakPuzzle.region}</div>
        <div class="ht-svg-wrap" id="svg-wrap">
          <img class="ht-puzzle-svg" src="${streakPuzzle.svg_file}" alt="Highway map puzzle for ${streakPuzzle.region}" id="puzzle-svg"/>
        </div>
        <p class="ht-prompt">Type the route number at the <strong>?</strong> marker:</p>
      </div>

      <form class="ht-streak-form" id="streak-form" autocomplete="off">
        <input class="ht-streak-input" id="streak-input" type="text"
               placeholder="e.g. 70 or I-70" autocomplete="off" spellcheck="false" autofocus />
        <button class="bs-btn bs-btn-primary" type="submit">SUBMIT</button>
      </form>

      <p class="ht-streak-hint">Accepted formats: 70 &nbsp;|&nbsp; I-70 &nbsp;|&nbsp; Interstate 70</p>
    </div>
  `);

  document.getElementById('btn-back').addEventListener('click', () => {
    clearTimer();
    renderHome();
  });

  document.getElementById('streak-form').addEventListener('submit', handleStreakGuess);

  if (TIMER_ENABLED) startTimer();
}

/**
 * Handle streak form submission.
 */
function handleStreakGuess(e) {
  e.preventDefault();
  clearTimer();

  const input   = document.getElementById('streak-input');
  const userRaw = input.value;
  const userNorm = normalizeAnswer(userRaw);

  // Normalize all acceptable answers
  const correctNorm = normalizeAnswer(streakPuzzle.answer_display);

  const correct = userNorm === correctNorm || userNorm === normalizeAnswer(streakPuzzle.missing_routes[0]);

  if (correct) {
    streakCount++;
    // Update counter in DOM
    const counter = document.getElementById('streak-counter');
    if (counter) counter.textContent = streakCount;

    // Brief correct flash
    const svgWrap = document.getElementById('svg-wrap');
    if (svgWrap) {
      svgWrap.classList.add('ht-flash-correct');
      setTimeout(() => svgWrap.classList.remove('ht-flash-correct'), 500);
    }

    // Next puzzle after short delay
    setTimeout(drawNextStreakPuzzle, 700);
  } else {
    // Wrong → game over
    endStreak();
  }
}

/**
 * Game over screen for streak mode.
 */
function endStreak() {
  clearTimer();

  const bests  = loadStreakBests();
  const oldBest = bests[streakTier] || 0;
  const newBest = streakCount > oldBest;

  if (newBest) {
    bests[streakTier] = streakCount;
    saveStreakBests(bests);
  }

  const tierLabel = { interstate: 'Interstate', us_routes: 'US Routes', state_routes: 'State Routes' }[streakTier];
  const bestDisplay = newBest ? streakCount : oldBest;

  renderScreen(`
    <div class="ht-gameover">
      <div id="ad-top" class="ht-ad ht-ad-top"><span>Advertisement</span></div>

      <div class="ht-gameover-inner">
        <div class="ht-gameover-icon">💥</div>
        <h2 class="ht-gameover-title">Game Over</h2>

        <div class="ht-gameover-stats">
          <div class="ht-stat">
            <span class="ht-stat-label">Your Streak</span>
            <span class="ht-stat-value">${streakCount}</span>
          </div>
          <div class="ht-stat">
            <span class="ht-stat-label">Best (${tierLabel})</span>
            <span class="ht-stat-value">${bestDisplay} ${newBest ? '🏆' : ''}</span>
          </div>
        </div>

        <div class="ht-gameover-answer">
          The correct answer was: <strong>${streakPuzzle.answer_display}</strong>
        </div>

        <div class="ht-fact-box">
          <p class="ht-fact-label">Fun Fact</p>
          <p class="ht-fact-text">${streakPuzzle.fun_fact}</p>
        </div>

        <div class="ht-gameover-actions">
          <button class="bs-btn bs-btn-primary" id="btn-gameover-retry">Try Again</button>
          <button class="bs-btn bs-btn-secondary" id="btn-gameover-home">Home</button>
        </div>
      </div>

      <div id="ad-bottom" class="ht-ad ht-ad-bottom"><span>Advertisement</span></div>
    </div>
  `);
}

// ─── TIMER ────────────────────────────────────────────────────────────────────

function startTimer() {
  timerRemaining = TIMER_SECONDS;
  const bar = document.getElementById('timer-bar');
  if (!bar) return;

  bar.style.width = '100%';

  timerInterval = setInterval(() => {
    timerRemaining--;
    const pct = Math.max(0, (timerRemaining / TIMER_SECONDS) * 100);
    bar.style.width = `${pct}%`;

    if (pct < 33) bar.classList.add('ht-timer-bar--low');

    if (timerRemaining <= 0) {
      clearTimer();
      endStreak();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

function showToast(msg) {
  let toast = document.getElementById('ht-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ht-toast';
    toast.className = 'ht-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('ht-toast--visible');
  setTimeout(() => toast.classList.remove('ht-toast--visible'), 2500);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('data/puzzles.json');
    if (!res.ok) throw new Error(`Failed to load puzzles: ${res.status}`);
    allPuzzles = await res.json();
  } catch (err) {
    console.error(err);
    renderScreen(`<div class="ht-error">⚠️ Could not load puzzles. Please refresh.</div>`);
    return;
  }

  renderHome();
}

document.addEventListener('DOMContentLoaded', init);

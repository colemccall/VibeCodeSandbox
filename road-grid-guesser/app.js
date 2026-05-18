/**
 * Road Grid Guesser — app.js
 * Daily puzzle game: guess the city from its road grid pattern.
 *
 * Architecture:
 *  - Pure vanilla JS, no frameworks, no npm.
 *  - All persistence via localStorage (guest mode only).
 *  - TODO: Replace localStorage with Supabase for cross-device sync.
 *
 * localStorage keys:
 *  'rgcg-streak'  — { current: number, best: number, last_played_date: string }
 *  'rgcg-results' — { [puzzle_id]: { guessed: number, correct: boolean, date: string } }
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_STREAK  = 'rgcg-streak';
const LS_RESULTS = 'rgcg-results';

// ─── State ────────────────────────────────────────────────────────────────────

let allPuzzles   = [];   // full array loaded from puzzles.json
let todayPuzzle  = null; // puzzle object for today
let activePuzzle = null; // puzzle currently shown (today or archive pick)
let hasGuessed   = false;// whether the user has made a guess in the current puzzle

// ─── DOM helpers ──────────────────────────────────────────────────────────────

const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function getStreak() {
  const raw = localStorage.getItem(LS_STREAK);
  return raw ? JSON.parse(raw) : { current: 0, best: 0, last_played_date: null };
}

function saveStreak(s) {
  localStorage.setItem(LS_STREAK, JSON.stringify(s));
}

function getResults() {
  const raw = localStorage.getItem(LS_RESULTS);
  return raw ? JSON.parse(raw) : {};
}

function saveResults(r) {
  localStorage.setItem(LS_RESULTS, JSON.stringify(r));
}

// ─── Date utilities ───────────────────────────────────────────────────────────

/** Return today's date as YYYY-MM-DD in local time. */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return yesterday's date as YYYY-MM-DD. */
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a YYYY-MM-DD string as "May 18, 2026". */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Streak logic ─────────────────────────────────────────────────────────────

/**
 * Update streak after a guess.
 * Correct guess on a new day: increment streak.
 * Wrong guess: reset streak to 0.
 * Missed a day (last_played_date is not yesterday): reset streak to 0 before incrementing if correct.
 */
function updateStreak(wasCorrect) {
  const streak = getStreak();
  const today  = todayStr();
  const yest   = yesterdayStr();

  // Only update streak if this is today's puzzle being played for the first time today
  if (streak.last_played_date === today) {
    // Already played today — streak was already updated. No change.
    return streak;
  }

  if (wasCorrect) {
    // Streak continues only if last played yesterday; otherwise reset then set to 1
    if (streak.last_played_date === yest) {
      streak.current += 1;
    } else {
      streak.current = 1; // missed a day (or first ever correct) — restart
    }
    streak.best = Math.max(streak.best, streak.current);
  } else {
    // Wrong answer resets streak
    streak.current = 0;
  }

  streak.last_played_date = today;
  saveStreak(streak);
  return streak;
}

// ─── Puzzle loading ───────────────────────────────────────────────────────────

/** Fetch and return puzzles.json. */
async function loadPuzzles() {
  const res = await fetch('data/puzzles.json');
  if (!res.ok) throw new Error('Failed to load puzzles.json');
  return res.json();
}

/** Find the puzzle for today's date, or null if none. */
function findTodayPuzzle(puzzles) {
  const today = todayStr();
  return puzzles.find(p => p.date === today) || null;
}

// ─── UI rendering ─────────────────────────────────────────────────────────────

/** Render header streak/best badges from stored data. */
function renderBadges() {
  const streak = getStreak();
  $('badge-streak').textContent = streak.current;
  $('badge-best').textContent   = streak.best;
}

/** Shuffle an array in-place and return it (Fisher-Yates). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Load a puzzle into the game UI (main or archive puzzle).
 * @param {object} puzzle — puzzle object from puzzles.json
 * @param {boolean} isArchive — whether this is an archive pick
 */
function loadPuzzleUI(puzzle, isArchive = false) {
  activePuzzle = puzzle;
  hasGuessed   = false;

  const results = getResults();
  const prevResult = results[puzzle.id];

  // Hide result panel; show puzzle area
  $('result-panel').classList.remove('show');
  $('puzzle-area').style.display = '';

  // Puzzle image
  const img = $('puzzle-img');
  img.src = puzzle.svg_file;
  img.alt = `Road grid puzzle #${puzzle.id}`;

  // Puzzle meta
  $('puzzle-date').textContent = formatDate(puzzle.date);
  $('puzzle-num').textContent  = `#${puzzle.id}`;

  // Difficulty badge
  const badge = $('difficulty-badge');
  badge.textContent = puzzle.difficulty.toUpperCase();
  badge.className   = 'difficulty-badge diff-' + puzzle.difficulty;

  // Build shuffled options
  const optionsContainer = $('options');
  optionsContainer.innerHTML = '';

  // Create indexed option list, shuffle indices
  const indices = [0, 1, 2, 3];
  shuffle(indices);

  indices.forEach(optIdx => {
    const btn = document.createElement('button');
    btn.className   = 'bs-opt';
    btn.dataset.idx = optIdx;
    btn.innerHTML = `
      <span class="bs-opt-inner">
        <span class="bs-opt-dot"></span>
        <span class="bs-opt-text">${puzzle.options[optIdx]}</span>
      </span>
      <span class="bs-opt-arrow">›</span>
    `;

    // If already played this puzzle, disable and show result
    if (prevResult !== undefined) {
      btn.disabled = true;
      if (optIdx === puzzle.correct_index) {
        btn.classList.add(prevResult.correct ? 'correct' : 'reveal');
      } else if (optIdx === prevResult.guessed && !prevResult.correct) {
        btn.classList.add('wrong');
      }
    } else {
      btn.addEventListener('click', () => handleGuess(optIdx));
    }

    optionsContainer.appendChild(btn);
  });

  // If already played, show result panel immediately (no animation)
  if (prevResult !== undefined) {
    hasGuessed = true;
    showResultPanel(puzzle, prevResult.guessed, prevResult.correct, /* animated */ false);
  }
}

/** Handle a guess click. */
function handleGuess(chosenIdx) {
  if (hasGuessed) return;
  hasGuessed = true;

  const puzzle = activePuzzle;
  const isCorrect = chosenIdx === puzzle.correct_index;
  const isToday   = puzzle.date === todayStr();

  // Disable all buttons and apply state classes
  $$('#options .bs-opt').forEach(btn => {
    btn.disabled = true;
    const btnIdx = Number(btn.dataset.idx);
    if (btnIdx === puzzle.correct_index) {
      // Show correct answer
      btn.classList.add(isCorrect && btnIdx === chosenIdx ? 'correct' : 'reveal');
    } else if (btnIdx === chosenIdx) {
      // User's wrong choice
      btn.classList.add('wrong');
    }
  });

  // Animate wrong options
  if (!isCorrect) {
    const wrongBtn = document.querySelector(`#options .bs-opt[data-idx="${chosenIdx}"]`);
    if (wrongBtn) wrongBtn.classList.add('bs-anim-shake');
  }

  // Persist result
  const results = getResults();
  results[puzzle.id] = {
    guessed: chosenIdx,
    correct: isCorrect,
    date: todayStr(),
  };
  saveResults(results);

  // Update streak only for today's puzzle
  let streak = getStreak();
  if (isToday) {
    streak = updateStreak(isCorrect);
  }

  // Update badges
  renderBadges();

  // Show result panel with animation
  setTimeout(() => {
    showResultPanel(puzzle, chosenIdx, isCorrect, /* animated */ true);
  }, 400);
}

/**
 * Show the result panel after a guess.
 * @param {object} puzzle
 * @param {number} guessedIdx
 * @param {boolean} correct
 * @param {boolean} animated — whether to animate in
 */
function showResultPanel(puzzle, guessedIdx, correct, animated) {
  const panel = $('result-panel');

  // Verdict
  $('result-verdict').textContent = correct ? 'Correct!' : 'Not Quite';
  $('result-emoji').textContent   = correct ? '✅' : '❌';
  $('result-sub').textContent     = correct
    ? `You identified ${puzzle.city}, ${puzzle.state}!`
    : `It was ${puzzle.city}, ${puzzle.state}. You chose ${puzzle.options[guessedIdx]}.`;

  // Stats row
  const streak  = getStreak();
  const results = getResults();
  const played  = Object.keys(results).length;
  const wins    = Object.values(results).filter(r => r.correct).length;
  const pct     = played > 0 ? Math.round((wins / played) * 100) : 0;

  $('stat-streak').textContent  = streak.current;
  $('stat-best').textContent    = streak.best;
  $('stat-played').textContent  = played;
  $('stat-pct').textContent     = pct + '%';

  // Fun fact (pick a random one)
  const factIdx = Math.floor(Math.random() * puzzle.fun_facts.length);
  $('fun-fact-text').textContent = puzzle.fun_facts[factIdx];

  // Share string preview
  const shareStr = buildShareString(puzzle, correct, streak.current);
  $('share-preview').textContent = shareStr;

  // Show panel
  panel.classList.add('show');
  if (animated) {
    panel.classList.add('bs-anim-fade-up');
    panel.addEventListener('animationend', () => {
      panel.classList.remove('bs-anim-fade-up');
    }, { once: true });
    // Scroll to result
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Build the share string for a completed puzzle. */
function buildShareString(puzzle, correct, streakCurrent) {
  const icon = correct ? '✅' : '❌';
  return `Road Grid #${puzzle.id} ${icon}\nStreak: ${streakCurrent} 🗺️\nroadgrid.app`;
}

// ─── Share / Clipboard ────────────────────────────────────────────────────────

let toastTimer = null;

/** Show the toast notification with a message. */
function showToast(msg) {
  const toast = $('bs-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/** Copy the share string to clipboard and show toast. */
async function handleShare() {
  if (!activePuzzle) return;
  const results = getResults();
  const r = results[activePuzzle.id];
  if (!r) return;
  const streak = getStreak();
  const str = buildShareString(activePuzzle, r.correct, streak.current);
  try {
    await navigator.clipboard.writeText(str);
    showToast('Copied to clipboard! 🗺️');
  } catch {
    // Fallback for non-secure contexts
    showToast('Copy not supported — check browser permissions');
  }
}

// ─── Archive view ─────────────────────────────────────────────────────────────

/** Render the archive tab with past puzzle cards. */
function renderArchive() {
  const container = $('archive-grid');
  container.innerHTML = '';

  const results = getResults();
  const today   = todayStr();

  // Sort by date descending
  const sorted = [...allPuzzles].sort((a, b) => (a.date < b.date ? 1 : -1));

  sorted.forEach(puzzle => {
    const result     = results[puzzle.id];
    const isPast     = puzzle.date <= today;
    const isFuture   = puzzle.date > today;
    const isPlayed   = result !== undefined;
    const isToday    = puzzle.date === today;

    if (isFuture) return; // don't show future puzzles

    const card = document.createElement('div');
    card.className = 'archive-card';
    if (isPlayed) card.classList.add(result.correct ? 'played-correct' : 'played-wrong');

    // Difficulty badge color
    const diffLabel = puzzle.difficulty.toUpperCase();
    let statusIcon = '⬜'; // unplayed
    if (isPlayed) statusIcon = result.correct ? '✅' : '❌';

    card.innerHTML = `
      <div class="archive-thumb">
        <img src="${puzzle.svg_file}" alt="${puzzle.city} grid" loading="lazy"/>
      </div>
      <div class="archive-meta">
        <div class="archive-city">${puzzle.city}, ${puzzle.state}</div>
        <div class="archive-date">${formatDate(puzzle.date)}</div>
        <div class="archive-footer">
          <span class="difficulty-badge diff-${puzzle.difficulty}">${diffLabel}</span>
          <span class="archive-status">${statusIcon}</span>
        </div>
      </div>
    `;

    // Clicking an unplayed past card loads it; already-played cards are not re-playable
    if (!isPlayed) {
      card.classList.add('clickable');
      card.addEventListener('click', () => {
        showTab('game');
        loadPuzzleUI(puzzle, /* isArchive */ true);
      });
    } else {
      card.title = isPlayed ? `Played on ${formatDate(result.date)}` : '';
    }

    container.appendChild(card);
  });

  if (container.children.length === 0) {
    container.innerHTML = '<p class="archive-empty">No past puzzles yet. Check back tomorrow!</p>';
  }
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

/** Switch to a tab: 'game' or 'archive'. */
function showTab(tab) {
  // Update tab buttons
  $$('.bs-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show/hide panels
  $('panel-game').style.display    = tab === 'game'    ? '' : 'none';
  $('panel-archive').style.display = tab === 'archive' ? '' : 'none';

  if (tab === 'archive') renderArchive();
}

// ─── No-puzzle fallback ───────────────────────────────────────────────────────

/** Show a "no puzzle today" message in the game panel. */
function showNoPuzzle() {
  $('puzzle-area').style.display = 'none';
  $('no-puzzle-msg').style.display = '';
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  // Ctrl+Z — undo (no-op for this app per spec)
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    // No undo action in Road Grid Guesser
  }
});

// ─── App initialization ───────────────────────────────────────────────────────

async function init() {
  try {
    allPuzzles   = await loadPuzzles();
    todayPuzzle  = findTodayPuzzle(allPuzzles);

    // Render streak badges in header
    renderBadges();

    // Tab listeners
    $$('.bs-tab').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });

    // Share button
    $('btn-share').addEventListener('click', handleShare);

    // Load today's puzzle (or show fallback)
    if (todayPuzzle) {
      loadPuzzleUI(todayPuzzle, false);
    } else {
      showNoPuzzle();
    }

    // Start on game tab
    showTab('game');

  } catch (err) {
    console.error('Road Grid Guesser init error:', err);
    $('puzzle-area').style.display = 'none';
    $('no-puzzle-msg').style.display = '';
    $('no-puzzle-msg').textContent = 'Failed to load puzzles. Please refresh.';
  }
}

// Boot
init();

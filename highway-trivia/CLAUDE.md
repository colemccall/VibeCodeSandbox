# Highway Trivia — Claude Code Context

Highway identification game. Two modes: Daily Challenge (Wordle-style, one puzzle per day) and Streak Mode (rapid-fire free-text, how long can you last). Players identify missing route numbers from regional highway maps.

## Current State

**Built and working (open index.html to test):**
- Home screen with Daily Challenge and Streak Mode buttons
- Daily Challenge: SVG display, 4-option buttons, correct/wrong feedback, fun fact + why_tricky reveal
- Daily streak logic (correct increments, wrong or missed day resets)
- Streak Mode: difficulty tier selector, free text input, answer normalization
- Answer normalization: "Interstate 70" / "I-70" / "i70" / "70" all match
- Timer bar: controlled by `const TIMER_ENABLED = false` at top of app.js
- Answer reveal animation: shield badge overlay positioned over SVG
- Share strings for both modes
- Ad placeholders (#ad-top always, #ad-bottom on result/game-over only)
- 10 sample puzzles (5 daily + 5 streak) with placeholder SVGs

**Not yet built:**
- [ ] Supabase auth (email + Google OAuth)
- [ ] Supabase DB for daily streak + streak mode bests
- [ ] Real puzzle data (150+ puzzles) — waiting on user's OSMnx script
- [ ] Mobile responsive polish
- [ ] Railway deployment

## Design System

Uses `../../design-system/theme.css` (or `./design-system/theme.css` after repo split).
App theme class: `.app-highway` (amber `#B45309` → red `#DC2626`).
Fonts: Barlow Condensed (headlines) + Inter (body) via Google Fonts.

## Tech Stack

Vanilla HTML/CSS/JS. No framework. No build step.
Open `index.html` in browser — no server needed.

## Key Files

```
index.html          — app shell
app.js              — game logic, both modes, normalization, reveal animation
data/puzzles.json   — puzzle data (daily + streak pool)
puzzles/            — SVG highway maps
```

## Puzzle JSON Schema

```json
{
  "id": 1,
  "date": "2026-09-01",        // daily only — omit for streak puzzles
  "type": "daily",             // "daily" or "streak"
  "difficulty": "interstate",  // "interstate" | "us_routes" | "state_routes"
  "svg_file": "puzzles/001_i70_denver.svg",
  "missing_routes": ["I-70"],
  "answer_display": "I-70",
  "region": "Denver, CO area",
  "options": ["I-70","I-76","I-25","US-6"],  // daily only
  "correct_index": 0,                         // daily only
  "fun_fact": "...",
  "why_tricky": "..."
}
```

SVG format: viewBox "0 0 900 700", dark amber bg `#1a0f00`, road lines `#f5d07a`, route shields as rects with text, amber `?` badge for missing route.

## Answer Normalization (app.js)

The `normalizeAnswer()` function strips prefixes and punctuation before comparing. Test cases that must all match `"70"`:
- `"I-70"` ✓
- `"Interstate 70"` ✓
- `"i70"` ✓
- `"70"` ✓
- `" I - 70 "` ✓ (whitespace)

## Supabase Wiring (Next Session Priority)

Separate Supabase project from other apps.

```sql
create table user_highway_streaks (
  user_id uuid references auth.users primary key,
  daily_current int default 0,
  daily_best int default 0,
  daily_last_played date,
  streak_interstate_best int default 0,
  streak_us_routes_best int default 0,
  streak_state_routes_best int default 0
);

create table user_highway_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  puzzle_id int,
  correct boolean,
  played_at timestamptz default now(),
  mode text check (mode in ('daily','streak')),
  difficulty text
);
create unique index on user_highway_results(user_id, puzzle_id, mode);

alter table user_highway_streaks enable row level security;
alter table user_highway_results enable row level security;
create policy "own rows" on user_highway_streaks using (auth.uid() = user_id);
create policy "own rows" on user_highway_results using (auth.uid() = user_id);
```

## Remaining Work (Ordered)

1. Wire Supabase auth
2. Migrate localStorage → Supabase
3. Guest mode with "Sign in to sync" banner
4. Add real puzzle SVGs as they come from OSMnx script
5. Enable and tune timer bar (set TIMER_ENABLED = true to test)
6. Mobile layout: SVG scales, input full-width
7. Deploy to Railway

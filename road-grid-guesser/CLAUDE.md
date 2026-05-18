# Road Grid Guesser — Claude Code Context

Daily geography puzzle game. Players identify a US city from its unlabeled road network SVG. Wordle format — one guess, streak tracking, archive of past puzzles.

## Current State

**Built and working (open index.html to test):**
- Daily puzzle loads from `data/puzzles.json` by today's date
- 4 shuffled option buttons with correct/wrong feedback
- Streak logic (correct increments, wrong or missed day resets)
- Result panel: verdict, stats row, fun fact, share string
- Archive view: past puzzle cards with ✅/❌/unplayed status
- Clipboard share + toast notification
- Ad placeholder divs (#ad-top, #ad-bottom)
- 5 sample puzzles with hand-drawn SVGs (Phoenix, Chicago, Boston, Denver, Portland)

**Not yet built:**
- [ ] Supabase auth (email + Google OAuth)
- [ ] Supabase DB for streak/results (currently localStorage only)
- [ ] Real puzzle data (90+ puzzles) — waiting on user's Python/OSMnx SVG script
- [ ] Mobile responsive polish
- [ ] Railway deployment

## Design System

Uses `../../design-system/theme.css` (or `./design-system/theme.css` after repo split).
App theme class: `.app-road-grid` (blue `#1E40AF` → purple `#6D28D9`).
Fonts: Barlow Condensed (headlines) + Inter (body) via Google Fonts.

## Tech Stack

Vanilla HTML/CSS/JS. No framework. No build step. CDN only.
Open `index.html` directly in browser — no server needed for development.

## Key Files

```
index.html          — app shell, all layout
app.js              — all game logic, streak, archive, share
data/puzzles.json   — puzzle data (add real puzzles here)
puzzles/            — SVG files (add real OSMnx SVGs here)
```

## Adding Real Puzzles

1. Drop SVG files into `puzzles/` — naming: `{id:03d}_{city_lowercase}.svg`
2. Add entries to `data/puzzles.json` following the existing schema:
   ```json
   {
     "id": 6,
     "date": "2026-05-19",
     "city": "Atlanta",
     "state": "GA",
     "svg_file": "puzzles/006_atlanta.svg",
     "difficulty": "medium",
     "options": ["Atlanta, GA", "Charlotte, NC", "Nashville, TN", "Birmingham, AL"],
     "correct_index": 0,
     "lat": 33.749,
     "lng": -84.388,
     "fun_facts": ["fact 1", "fact 2", "fact 3"]
   }
   ```

## Supabase Wiring (Next Session Priority)

Replace the `// TODO: Replace localStorage with Supabase` sections in `app.js`.

**Create a new Supabase project** (separate from other apps — do not share).

Schema to create:
```sql
-- Streak tracking
create table user_streaks (
  user_id uuid references auth.users primary key,
  current_streak int default 0,
  best_streak int default 0,
  last_played_date date
);

-- Per-puzzle results
create table user_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  puzzle_id int,
  guessed text,
  correct boolean,
  played_at timestamptz default now(),
  source text check (source in ('daily','archive'))
);
create unique index on user_results(user_id, puzzle_id);

-- RLS: users can only read/write their own rows
alter table user_streaks enable row level security;
alter table user_results enable row level security;
create policy "own rows" on user_streaks using (auth.uid() = user_id);
create policy "own rows" on user_results using (auth.uid() = user_id);
```

Add Supabase JS CDN to index.html:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

## Remaining Work (Ordered)

1. Wire Supabase auth — sign up / sign in / sign out UI
2. Migrate localStorage streak + results → Supabase
3. Guest fallback: localStorage still works, show "Sign in to sync" banner
4. Add real puzzle data as it becomes available
5. Mobile responsive: SVG scales down, options stack full-width
6. Deploy to Railway

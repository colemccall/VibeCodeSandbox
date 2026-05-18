# Stadium Bucket List — Claude Code Context

Personal tracker for visiting all 133 FBS college football stadiums. Check off visited stadiums, earn conference completion badges, share progress cards.

## Current State

**Built and working (open index.html to test):**
- Grid view: 25 sample stadium cards, click to toggle visited
- Sort: visited first, then alphabetical
- Filters: conference (multi-select pills), state (dropdown), All/Visited/Unvisited toggle
- Map view: Leaflet with filled (visited) / hollow (unvisited) markers, popup with "Mark Visited" toggle
- Live visit count in header badge
- Conference completion badges: lock → unlock with flip animation
- Share card: html2canvas renders 600×400 PNG with progress bars
- Name input in sidebar (stored in localStorage)
- Ad placeholder divs (#ad-header 728×90, #ad-sidebar 300×250)
- 25 sample stadiums across 5 conferences

**Not yet built:**
- [ ] Supabase auth (email + Google OAuth)
- [ ] Supabase DB for visits (currently localStorage only)
- [ ] Full 133-stadium dataset — user needs to provide stadiums.json
- [ ] "Full House" badge animation (all 133 visited)
- [ ] Mobile responsive: sidebar collapses, filter drawer
- [ ] Railway deployment

## Design System

Uses `../../design-system/theme.css` (or `./design-system/theme.css` after repo split).
App theme class: `.app-stadium` (forest `#065F46` → navy `#1E40AF`).
Fonts: Barlow Condensed (headlines) + Inter (body) via Google Fonts.

## Tech Stack

Vanilla HTML/CSS/JS. Leaflet (map) + html2canvas (share card) via CDN.
Open `index.html` in browser — no server needed.

## Key Files

```
index.html          — full app shell + sidebar layout
app.js              — all logic: render, filters, map, badges, share card
data/stadiums.json  — stadium data (replace 25-sample with full 133)
```

## Replacing Sample Data

Drop the full `stadiums.json` into `data/` — the app reads it on load. Schema:
```json
{
  "id": "ohio-state",
  "team": "Ohio State Buckeyes",
  "conference": "Big Ten",
  "stadium": "Ohio Stadium",
  "city": "Columbus",
  "state": "OH",
  "capacity": 102780,
  "opened": 1922,
  "lat": 40.0017,
  "lng": -83.0199,
  "surface": "grass",
  "nickname": "The Horseshoe"
}
```

The badge system reads unique `conference` values from the data automatically — no hardcoding needed when the full dataset is added.

## Supabase Wiring (Next Session Priority)

Separate Supabase project from other apps.

```sql
create table user_stadium_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  stadium_id text,
  visited_at timestamptz default now(),
  unique (user_id, stadium_id)
);

-- Store display name for share cards
-- Add column to Supabase auth user_metadata or create:
create table user_profiles (
  user_id uuid references auth.users primary key,
  display_name text
);

alter table user_stadium_visits enable row level security;
alter table user_profiles enable row level security;
create policy "own rows" on user_stadium_visits using (auth.uid() = user_id);
create policy "own rows" on user_profiles using (auth.uid() = user_id);
```

On load: fetch all visits for current user, merge with localStorage visits for guest users who sign in.

## Remaining Work (Ordered)

1. Wire Supabase auth (email + Google)
2. Migrate localStorage visits → Supabase
3. Guest mode: localStorage works, "Sign in to sync" banner
4. Drop in full 133-stadium stadiums.json when ready
5. "Full House" badge: CSS confetti burst when all 133 visited
6. Mobile: sidebar collapses to top drawer, 1-col card grid
7. Share card polish: add small dot map (Canvas API, not Leaflet — faster for html2canvas)
8. Deploy to Railway

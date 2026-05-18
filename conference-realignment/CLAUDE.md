# Conference Realignment Simulator — Claude Code Context

Drag-and-drop CFB conference realignment tool. Move teams between conferences, watch live analytics update (travel burden, rivalry preservation, TV markets, balance). Voronoi map shows conference footprints. Share via URL hash or PNG export.

## Current State

**Built and working (open index.html to test):**
- Conference columns with team cards, HTML5 drag-and-drop between columns
- Live analytics: Haversine travel, rivalry %, TV market coverage, balance
- Delta indicators: green/red arrows vs. baseline
- URL hash state encoding/decoding (`#v1:sec=alabama,georgia|big-ten=...`)
- Undo/redo stack (Ctrl+Z / Ctrl+Y, max 50)
- Voronoi map: Leaflet + D3 Delaunay, SVG overlay, hover tooltips
- 4 presets: Current 2026, Super Conferences, Restore Traditions, TV Exec Mode
- Export: copies URL to clipboard + html2canvas PNG download
- "+ New Conference" and "×" dissolve column
- 20 sample teams, 4 conferences
- Ad placeholder divs (#ad-header, #ad-sidebar)

**Not yet built:**
- [ ] Full 130+ team dataset — user needs to provide teams.json
- [ ] Real conference data for all FBS conferences
- [ ] Mobile layout (map-first on small screens)
- [ ] Performance tuning for 130+ teams (Voronoi with many points)
- [ ] Railway deployment

No auth needed — fully anonymous. URL hash is the share mechanism.

## Design System

Uses `../../design-system/theme.css` (or `./design-system/theme.css` after repo split).
App theme class: `.app-realignment` (burgundy `#7C2D12` → bronze `#92400E`).
Fonts: Barlow Condensed (headlines) + Inter (body) via Google Fonts.

## Tech Stack

Vanilla HTML/CSS/JS. Leaflet + D3 v7 + html2canvas via CDN (ESM imports).
Open `index.html` in browser — no server needed.
**Note:** D3 and Leaflet are loaded as ES modules. `voronoi.js` uses `import` syntax. Run via a local server or VS Code Live Server extension if import maps cause issues.

## Key Files

```
index.html              — app shell, sidebar layout, tab switching
app.js                  — state, drag-drop, analytics engine, undo, hash, presets
voronoi.js              — Leaflet + D3 Voronoi SVG overlay
presets.js              — 4 preset alignment objects (window.PRESETS)
data/teams.json         — team data (replace with full 130-team dataset)
data/conferences.json   — conference metadata
```

## Replacing Sample Data

Drop the full `teams.json` into `data/`. Schema:
```json
{
  "id": "alabama",
  "name": "Alabama",
  "short": "ALA",
  "conference": "sec",
  "city": "Tuscaloosa",
  "state": "AL",
  "lat": 33.2098,
  "lng": -87.5692,
  "tv_market": "Birmingham",
  "tv_market_size": 40,
  "enrollment": 38000,
  "avg_attendance": 101821,
  "rivalries": ["georgia", "tennessee", "auburn"],
  "primary_color": "#9E1B32",
  "secondary_color": "#828A8F"
}
```

All FBS conferences must be in `conferences.json` with `id`, `name`, `full_name`, `color`, `tier`.

When updating presets.js with real data, update the `current2026` preset to mirror teams.json defaults exactly.

## Analytics Reference (app.js)

All in `recomputeAnalytics()`:
- **Travel**: Haversine on all N*(N-1)/2 pairs per conference, take mean
- **Rivalries**: count pairs where both teams in same conference / total possible rivalry pairs
- **TV Markets**: group unique `tv_market` values, sort by `tv_market_size` asc (lower=better)
- **Balance**: team counts per conference, warn if <8 or >20

Delta indicators compare to `state.baseline` (captured at load time).

## Performance Notes (for 130+ teams)

- Haversine on 130 teams = ~8,000 pairs across all conferences. Fast enough synchronously.
- Voronoi with 130 points: D3 handles this fine. Re-render is the bottleneck — debounce to 100ms.
- If drag feels slow: wrap `recomputeAnalytics()` in `requestAnimationFrame`.

## Remaining Work (Ordered)

1. Drop in full teams.json (130+ teams) and conferences.json (all FBS conferences) when user provides
2. Update presets.js current2026 to mirror full dataset
3. Performance test with 130 teams — tune Voronoi debounce if needed
4. Mobile: map view as primary, conference columns as scrollable list
5. Export PNG polish: make the Reddit-post image look great
6. Deploy to Railway

# CFB + Fitness App Suite — Handoff Guide

## Moving to Individual Repos

Each app in this monorepo should become its own repository. Steps per app:

```bash
# 1. Create new repo on GitHub (no README, no .gitignore)
# 2. Copy the app folder to a new local directory
cp -r conference-realignment/ ~/projects/conference-realignment
cd ~/projects/conference-realignment

# 3. Copy the shared design system in (apps link to it relatively)
cp -r ../design-system/ ./design-system

# 4. Initialize and push
git init
git add .
git commit -m "Initial commit from monorepo"
git remote add origin git@github.com:colemccall/<repo-name>.git
git push -u origin main
```

After splitting: update the `<link rel="stylesheet">` path in each app's `index.html` from
`../../design-system/theme.css` → `./design-system/theme.css`

---

## Five Apps — Status Overview

| App | Folder | State | Next priority |
|---|---|---|---|
| Road Grid Guesser | `road-grid-guesser/` | Draft complete | Supabase auth + real puzzle data |
| Highway Trivia | `highway-trivia/` | Draft complete | Supabase auth + real puzzle SVGs |
| Stadium Bucket List | `stadium-bucket-list/` | Draft complete | Supabase auth + full 133-stadium data |
| Conference Realignment | `conference-realignment/` | Draft complete | Full 130-team data + polish |
| Fitness Visualizer | `fitness-visualizer/` | Draft complete | End-to-end test with real ZIP files |

---

## Shared Design System

Location: `design-system/`
- `theme.css` — all CSS variables, components, animations
- `README.md` — full component reference with HTML snippets

All apps link to this file. When splitting into separate repos, copy `design-system/` into each app root and update the path.

---

## Backend Plan (Apps 1–3)

Road Grid, Highway Trivia, and Stadium List need Supabase for cross-device persistence.
Each app gets its **own Supabase project** (free tier, ~$0/month at launch scale).

See individual `CLAUDE.md` files in each app folder for schema and wiring instructions.

---

## Railway Deployment

Each app is a static site — no build step. Railway config per app:
1. New project → Deploy from GitHub repo
2. Build command: (none)
3. Start command: (none — static)
4. Root directory: `/` (after split into own repo)

Custom domains: set in Railway dashboard after first deploy.

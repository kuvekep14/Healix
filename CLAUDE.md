# Healix — Health Intelligence Dashboard

## Project Overview

Healix is a static web application that serves as a health intelligence dashboard. It connects wearable data (Apple HealthKit via HealthBite), bloodwork, meal logs, and fitness assessments into a unified AI-powered view. It shares the same Supabase backend as the HealthBite mobile app.

**Live site**: [tryhealix.xyz](https://tryhealix.xyz)

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **No build system** — statically served files, no npm/node
- **Backend**: Supabase (auth, database, edge functions) — shared with HealthBite
- **Deployment**: GitHub Pages via GitHub Actions (dual-branch: `main` + `dev`)
- **Fonts**: Cormorant Garamond (headings), DM Sans (body)

## File Structure

```
healix/
├── index.html          # Landing page
├── login.html          # Login (Supabase Auth)
├── signup.html         # Signup (Supabase Auth)
├── confirm.html        # Email confirmation
├── dashboard.html      # Main dashboard shell (sidebar + pages)
├── dashboard.js        # All application logic (~3750 lines)
├── dashboard.css       # Dashboard styles
├── chat.html           # AI chat interface (calls chat-with-ai edge function)
├── config.js           # Environment config (prod/dev/local Supabase switching)
├── CNAME               # GitHub Pages custom domain (tryhealix.xyz)
├── docs/
│   └── environments.md # Environment switching guide
└── .github/
    └── workflows/
        └── deploy-pages.yml  # Auto-deploy main + dev branches
```

## Architecture

### Single-File Application

`dashboard.js` contains all application logic — data fetching, rendering, calculations, and UI state. The dashboard uses a page-based navigation system (`showPage()`) with sections rendered in `dashboard.html`.

### Dashboard Pages/Sections

| Page | Function | Description |
|------|----------|-------------|
| Dashboard | `loadDashboardData()` | Vitality Age score, driver cards, health stats, meals, insights |
| Meals | `loadMealsPage()` | Day/week/month views, macro/micronutrient breakdown |
| Strength | `renderStrengthPage()` | Fitness test tracking, percentile benchmarks, VO2 max |
| Supplements | `loadSupplements()` | Supplement tracking, micronutrient totals |
| Documents | `loadDocumentsPage()` | PDF upload (bloodwork), document management |
| Profile | `populateProfileForm()` | User profile, medical history, family history |

### Vitality Age System

Core feature — calculates a "vitality age" from health metrics:

- `scoreHR()` — Heart rate scoring
- `scoreWeight()` — BMI-based weight scoring
- `scoreStrength()` — Strength percentile scoring
- `scoreVO2()` — VO2 max age-adjusted scoring
- `scoreSleep()` — Sleep duration/quality scoring
- `scoreBloodwork()` — Blood biomarker scoring
- `calcVitalityAge()` — Combines all scores into final age with confidence weighting

### Data Freshness System

Tracks how recently health data was synced from HealthBite:

- `getFreshnessLevel()` — Categorizes data as fresh/stale/very stale
- `renderFreshnessIndicator()` — Visual indicators per metric
- `renderSyncBanner()` — Banner when all metrics are stale

## Supabase Integration

### Authentication

Uses Supabase Auth REST API directly (no SDK):

```javascript
// All pages use this pattern
function supabaseRequest(endpoint, method, body, token) {
  return fetch(SUPABASE_URL + endpoint, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY)
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) { return r.json(); });
}
```

- Session stored in `localStorage` (`healix_session`)
- Token refresh every 50 minutes (`refreshSession()`)
- 30-minute inactivity timeout

### Database Tables Used

Accessed via PostgREST endpoints (`/rest/v1/<table>`):

| Table | Usage |
|-------|-------|
| `profiles` | User profile, medical history, body metrics |
| `meal_log` | Meal entries with nutrition data |
| `meal_nutrient` | Per-meal nutrient breakdowns |
| `apple_health_samples` | HealthKit data (heart rate, steps, sleep, etc.) |
| `blood_work_samples` | Lab results / biomarkers |
| `weekly_insights` | AI-generated health insights |
| `fitness_tests` | Strength/cardio assessment results |
| `weight_logs` | Weight tracking history |
| `supplements` | Supplement tracking |
| `uploads` | Uploaded documents (PDFs) |

### Edge Functions Called

| Function | Used In |
|----------|---------|
| `chat-with-ai` | `chat.html` — SSE streaming AI chat |
| `analyze-meal-ai` | `dashboard.js` — Text-based meal analysis |
| `process-document` | `dashboard.js` — PDF bloodwork extraction |

### Shared Backend

Healix and HealthBite share the same Supabase project and database. Data created in either app is visible in both. Auth users are shared.

## Environment Configuration

Three environments controlled via `config.js` + `?env=` query param:

| Param | Supabase Target |
|-------|----------------|
| `?env=prod` (default) | Production: `mfjfcfuwjbhqgqmtmhwe.supabase.co` |
| `?env=dev` | Dev project: `nuihvxluxdpdjgkvtdih.supabase.co` |
| `?env=local` | Local Docker: `127.0.0.1:54321` |

See `docs/environments.md` for full details.

## Design System

### Color Palette

```css
--cream: #F5F0E8;       /* Primary text */
--dark: #0B0B0B;        /* Background */
--dark-2: #0F0F0F;      /* Sidebar background */
--dark-3: #141414;      /* Card backgrounds */
--gold: #B8975A;        /* Accent / brand */
--gold-light: #D4B483;  /* Accent highlight */
--gold-faint: rgba(184,151,90,0.08);  /* Subtle gold tint */
--gold-border: rgba(184,151,90,0.18); /* Border color */
--muted: rgba(245,240,232,0.3);       /* Secondary text */
```

### Typography

- **Headings**: Cormorant Garamond (serif), light/regular weight, wide letter-spacing
- **Body**: DM Sans (sans-serif), 300-500 weight
- **Style**: Uppercase labels with letter-spacing for UI elements

### Visual Language

- Dark theme only (no light mode)
- Gold accent on dark backgrounds
- Minimal borders, subtle separators
- Data-dense layout with card-based sections

## Security

- Content Security Policy (CSP) headers on all pages restricting `connect-src` to allowed Supabase domains
- Session inactivity timeout (30 minutes)
- Proactive token refresh before expiration
- No server-side rendering — all client-side

## Deployment

GitHub Actions auto-deploys on push:
- `main` branch → root of site (`tryhealix.xyz/`)
- `dev` branch → `/dev/` subdirectory (`tryhealix.xyz/dev/`)

Both branches deploy the same static files with the same `config.js` — environment is controlled by the user via query param, not by branch.

## Common Tasks

### Local Development

```bash
cd ~/Projects/healix
python3 -m http.server 8080
# Open http://localhost:8080/login.html?env=local
```

Requires local Supabase running (from healthbite project):
```bash
cd ~/Projects/healthbite
supabase start
```

### Adding a New Dashboard Section

1. Add HTML markup in `dashboard.html` inside a new `<div class="page" id="page-<name>">`
2. Add sidebar link in the `<aside class="sidebar">` section
3. Add page logic in `dashboard.js`
4. Register in `showPage()` function
5. Add data loader function called from `init()` or on page switch

### Modifying Supabase Queries

All queries go through `supabaseRequest()`. Use PostgREST query syntax:

```javascript
// GET with filters
supabaseRequest('/rest/v1/meals?user_id=eq.' + userId + '&order=created_at.desc&limit=10', 'GET', null, token)

// POST (insert)
supabaseRequest('/rest/v1/weight_logs', 'POST', { user_id: userId, weight_kg: 75 }, token)

// PATCH (update)
supabaseRequest('/rest/v1/profiles?auth_user_id=eq.' + userId, 'PATCH', { first_name: 'John' }, token)
```

## Important Notes

- `dashboard.js` is large (~3750 lines) — consider the section comments (`// ── SECTION ──`) for navigation
- All data visualization is done with inline SVG and CSS — no charting library
- The app assumes data comes primarily from HealthBite (mobile) and displays it in a desktop-friendly format
- Sleep data uses session-based analysis (`identifySleepSessions()`) to group individual samples into sleep periods
- Fitness norms/benchmarks are hardcoded in `FITNESS_NORMS` and `FITNESS_CATEGORIES` objects

# Data Freshness System

Healix reads health metrics from Supabase but has no direct HealthKit access. HealthBite (the mobile app) is the sole writer — it syncs HealthKit data to the `apple_health_samples` table. If HealthBite hasn't been opened recently, Healix shows stale data.

This system addresses that with three layers: background sync, a sync log table, and per-metric transparency in the dashboard.

---

## 1. `health_sync_log` Table

A lightweight metadata table so Healix can check sync freshness with a single-row lookup instead of scanning thousands of health samples.

**Migration:** `healthbite/supabase/migrations/20260311000001_create_health_sync_log.sql`

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | uuid | Owner (FK to auth.users) |
| `device_id` | text | e.g. `healthbite-ios` |
| `device_name` | text | e.g. "Jonathan's iPhone" |
| `sync_status` | text | `in_progress`, `completed`, or `failed` |
| `sync_started_at` | timestamptz | When sync began |
| `sync_completed_at` | timestamptz | When sync finished |
| `metric_types` | text[] | Which metrics were synced |
| `sample_count` | integer | How many samples were written |
| `error_message` | text | Error details if failed |

RLS enforces user-scoped access. Indexed on `(user_id, sync_completed_at DESC)` for fast "last sync" queries.

Both foreground sync (`useAppleHealthDataStore.ts`) and background sync write to this table.

---

## 2. HealthBite Background Sync

**File:** `healthbite/src/tasks/backgroundHealthTask.ts`

Uses `expo-background-fetch` + `expo-task-manager` to sync HealthKit data without the user opening the app. iOS runs this task periodically via Background App Refresh.

### How it works

1. `TaskManager.defineTask()` runs at module scope (Expo requirement)
2. Registered in `_layout.tsx` with `minimumInterval: 15 minutes` (iOS minimum)
3. On each invocation:
   - Checks for active Supabase session (persisted in AsyncStorage)
   - Throttles: skips if last sync was <30 minutes ago
   - Incremental fetch: only HealthKit data since last sync (with 5-min overlap buffer)
   - Batches upsert/insert to `apple_health_samples` in chunks of 500
   - Writes `health_sync_log` entry with status tracking

### What we're NOT doing

- **No HealthKit native observers** — `react-native-health` observers don't support StepCount or SleepAnalysis
- **No AppDelegate modifications** — uses iOS Background App Refresh, not HealthKit's `enableBackgroundDeliveryForType`
- **No silent push notifications** — can be added later if background fetch proves insufficient

---

## 3. Healix Dashboard Transparency

### Per-metric freshness thresholds

Different metrics have different natural data cadences:

| Metric | Fresh | Warning | Stale |
|--------|-------|---------|-------|
| Heart Rate | 24h | 48h | 72h |
| Sleep | 36h | 60h | 96h |
| Steps | 18h | 36h | 72h |
| Weight | 7d | 21d | 30d |
| Strength | 30d | 90d | 180d |
| VO2 Max | 30d | 90d | 180d |
| Bloodwork | 90d | 180d | 365d |

### Visual indicators

Each driver card shows a freshness line beneath its label:

- **Green dot** (fresh): Relative timestamp only ("2h ago")
- **Amber dot** (warning): Timestamp, no CTA — avoids nagging
- **Stale** (red dot): Timestamp + actionable CTA ("Open HealthBite to sync", "Log new weight", etc.)

Stale cards also get a dashed border treatment.

### Global sync banner

A thin banner at the top of the dashboard appears **only when all HealthKit metrics** (heart rate, sleep, steps) are warning or stale. Queries `health_sync_log` to show when the last sync happened and from which device.

### Vitality Age confidence line

Below the hero section:
- Partial staleness: "Based on data up to 3 days old"
- Heavy staleness (>1 week): "Some data is over a week old — scores may not reflect current health" (amber)
- All fresh: no line shown

### localStorage caching

Dashboard data is cached in `localStorage` for instant render on page load. Cache TTL is 10 minutes. On load, the cached data renders immediately, then `loadDashboardData()` fetches fresh data and overwrites it.

---

## Files involved

| File | Repo | Change |
|------|------|--------|
| `supabase/migrations/20260311000001_*` | healthbite | `health_sync_log` table + RLS |
| `src/hooks/useAppleHealthDataStore.ts` | healthbite | Sync log writes in foreground sync |
| `src/tasks/backgroundHealthTask.ts` | healthbite | Background sync task (full rewrite) |
| `src/app/_layout.tsx` | healthbite | Background fetch registration |
| `dashboard.js` | Healix | Freshness utils, timestamp capture, indicators, banner, cache |
| `dashboard.html` | Healix | Freshness DOM elements, sync banner, confidence line |
| `dashboard.css` | Healix | Freshness dot/text styles, stale card treatment, banner |

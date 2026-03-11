# HealthKit Data Sync Patterns

HealthBite is the sole writer of HealthKit data. Healix only reads from `apple_health_samples`. Understanding how data is written is critical for correct reads.

## How Data Flows

```
Apple HealthKit (device)
  → HealthBite (React Native via rn-healthkit.ts)
    → Supabase (apple_health_samples table)
      → Healix reads & displays
```

## Sync Logic (HealthBite)

**Source:** `~/Projects/healthbite/src/lib/rn-healthkit.ts`

1. HealthBite queries HealthKit for samples within a date range per metric type
2. Each sample is transformed into a row:
   ```typescript
   {
     user_id: userId,
     metric_type: metricType,       // e.g., "heart_rate", "sleep_analysis"
     value: sample.value,           // numeric (null for sleep)
     text_value: sample.textValue,  // sleep stage string
     unit: sample.unit,
     recorded_at: sample.endDate,   // HealthKit endDate
     start_date: sample.startDate,
     end_date: sample.endDate,
     source_id: sample.sourceId,
     source_name: sample.sourceName,
     apple_health_id: sample.uuid,  // HealthKit native UUID
     metadata: sample.metadata      // extra HealthKit metadata
   }
   ```
3. Rows are upserted with deduplication on `apple_health_id` or composite key

## Deduplication Strategy

Two partial unique indexes prevent duplicate samples:
1. **Primary:** `(user_id, apple_health_id)` WHERE apple_health_id IS NOT NULL
2. **Fallback:** `(user_id, metric_type, start_date, end_date, source_id)` WHERE all NOT NULL

HealthBite uses ON CONFLICT to upsert, so re-syncing the same data is safe.

## Sleep Data Specifics

Sleep is the most complex metric type. Key details:

- **metric_type:** `sleep_analysis`
- **value:** null (categorical, not numeric)
- **text_value:** Stage string — one of: `ASLEEP`, `DEEP`, `REM`, `CORE`, `AWAKE`, `IN_BED`
- **metadata:** May contain `{ sleep_state: "deep" }` as alternate source
- **start_date / end_date:** Each sample represents one stage interval (e.g., 11:05pm–11:47pm DEEP)
- **Multiple samples per night:** A single sleep session is 10-30+ individual stage samples

**Healix must group these into sessions** using `identifySleepSessions()` — raw samples alone are just fragments.

## Heart Rate Data

- **metric_type:** `heart_rate` (instantaneous), `resting_heart_rate` (daily), `walking_heart_rate_average` (daily)
- **value:** BPM as numeric
- **unit:** `bpm`
- **start_date = end_date = recorded_at** (point-in-time measurement)

## Step / Distance / Energy Data

- **metric_type:** `step_count`, `distance_walking_running`, `active_energy_burned`, etc.
- **value:** Numeric aggregate
- **unit:** `count`, `km`, `kcal`, `min`
- **start_date ≠ end_date:** These are interval aggregates (e.g., hourly or daily totals)

## Querying Health Data (Healix Pattern)

```javascript
// Fetch last 21 days of health data for dashboard
var daysAgo = new Date();
daysAgo.setDate(daysAgo.getDate() - 21);

var data = await supabaseRequest(
  '/rest/v1/apple_health_samples' +
  '?select=metric_type,start_date,end_date,value,text_value,recorded_at' +
  '&user_id=eq.' + userId +
  '&recorded_at=gte.' + daysAgo.toISOString() +
  '&order=recorded_at.desc',
  'GET', null, token
);

// Group by metric type
var byType = {};
data.forEach(function(r) {
  if (!byType[r.metric_type]) byType[r.metric_type] = [];
  byType[r.metric_type].push(r);
});
```

## Health Sync Log

HealthBite writes sync operations to `health_sync_log` with status, metric types synced, and sample count. Healix can use this to determine when data was last synced for freshness indicators.

```javascript
// Get latest sync for the user
var sync = await supabaseRequest(
  '/rest/v1/health_sync_log?user_id=eq.' + userId +
  '&sync_status=eq.completed&order=completed_at.desc&limit=1',
  'GET', null, token
);
```

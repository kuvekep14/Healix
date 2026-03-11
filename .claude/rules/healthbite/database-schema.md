# Shared Database Schema

All tables have Row-Level Security (RLS) — users can only access their own data. Migrations live in `~/Projects/healthbite/supabase/migrations/`.

## Core Tables

### profiles
User profile, goals, body metrics, activity level. Shared auth — same profile in both apps.

### apple_health_samples
Primary health data table. HealthBite syncs HealthKit data here.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| metric_type | text | NOT NULL — one of 16 types (see below) |
| value | numeric | Numeric measurement (null for categorical like sleep) |
| text_value | text | Categorical data — sleep stages: ASLEEP, DEEP, REM, CORE, AWAKE |
| unit | text | Measurement unit (count, km, bpm, kcal, min, %, etc.) |
| recorded_at | timestamptz | When the measurement was taken (maps to HealthKit endDate) |
| start_date | timestamptz | Interval start (same as recorded_at for point-in-time metrics) |
| end_date | timestamptz | Interval end (differs from start for sleep sessions, daily aggregates) |
| source_id | text | HealthKit source identifier (e.g., com.apple.health) |
| source_name | text | Human-readable source name (e.g., "Apple Watch", "iPhone") |
| apple_health_id | text | HealthKit native UUID — primary dedup key (partial unique index) |
| metadata | jsonb | Extra HealthKit metadata (e.g., sleep_state) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**Active metric types (16):**
`step_count`, `distance_walking_running`, `distance_cycling`, `flights_climbed`, `active_energy_burned`, `basal_energy_burned`, `apple_exercise_time`, `heart_rate`, `resting_heart_rate`, `walking_heart_rate_average`, `respiratory_rate`, `sleep_analysis`, `apple_walking_steadiness`, `walking_speed`, `walking_asymmetry_percentage`, `walking_double_support_percentage`

**Indexes:**
- `(user_id, metric_type, created_at DESC)` — primary query index
- `(user_id, apple_health_id)` WHERE apple_health_id IS NOT NULL — dedup
- `(user_id, metric_type, start_date, end_date, source_id)` WHERE all NOT NULL — composite dedup

**Sleep data specifics:**
- Sleep samples use `text_value` for stage (ASLEEP, DEEP, REM, CORE, AWAKE) or `metadata.sleep_state`
- Each sample has `start_date`/`end_date` representing one sleep stage interval
- Healix groups these into sessions via `identifySleepSessions()`

### meal_log
Meal entries with full nutrition data in a JSON blob.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| meal_type | text | Breakfast, Lunch, Dinner, Snack |
| meal_time | timestamptz | When the meal was eaten |
| description | text | User's text description of the meal |
| data | jsonb | Full nutrition breakdown (categories → nutrients) |
| created_at | timestamptz | |

**data JSON structure:**
```json
{
  "Macronutrients": [
    { "name": "Calories", "value": 450, "unit": "kcal" },
    { "name": "Protein", "value": 30, "unit": "g" },
    { "name": "Total Carbohydrates", "value": 45, "unit": "g" },
    { "name": "Total Fat", "value": 15, "unit": "g" }
  ],
  "Vitamins": [...],
  "Minerals": [...]
}
```

### meal_nutrient
Per-meal nutrient rows (fallback when `meal_log.data` is empty).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| meal_id | uuid | FK → meal_log |
| user_id | uuid | FK → auth.users |
| nutrient_name | text | e.g., "Calories", "Protein" |
| value | numeric | Amount |
| unit | text | e.g., "kcal", "g", "mg" |

### blood_work_samples
Lab biomarker results, typically extracted from uploaded PDF lab reports.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| biomarker_name | text | Canonical name (e.g., "Glucose", "LDL Cholesterol") |
| value | numeric | Numeric result |
| value_text | text | Qualitative results (NON-REACTIVE, NEGATIVE, POSITIVE, NO GROWTH) |
| unit | text | e.g., "mg/dL", "mmol/L" |
| reference_range | text | Lab reference range string (e.g., "70-100") |
| test_date | date | When the lab test was performed |
| category | text | Grouping (e.g., "Lipid Panel", "CBC", "Metabolic") |
| is_flagged | boolean | Whether the result is out of range (legacy) |
| flag | text | Typed flag: H (high), L (low), A (abnormal) |
| upload_id | uuid | FK → uploads (source PDF document) |
| specimen_id | text | Lab specimen/accession number for deduplication |
| ordering_physician | text | Physician name from lab report |
| created_at | timestamptz | |

### uploads
Uploaded documents (PDFs, images). Used for blood work reports.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| title | text | Document title |
| content | text | Extracted text content |
| file_url | text | Supabase storage URL |
| file_type | text | MIME type |
| file_size | integer | Bytes |
| document_type | text | e.g., "blood_work", "general" |
| status | text | processing, completed, failed |
| metadata | jsonb | Extra info (original_filename, etc.) |
| created_at | timestamptz | |

### fitness_tests
Strength/cardio assessment results entered by user.

### weight_logs
Weight tracking history.

### supplements
Supplement tracking entries.

### weekly_insights
AI-generated health insights grouped by week.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| week_start | date | Monday of the insight week |
| insight_category | text | e.g., "sleep", "nutrition", "activity" |
| insight_text | text | The AI-generated insight |
| risk_level | text | low, moderate, high |
| confidence_score | numeric | 0-1 |
| created_at | timestamptz | |

### Chat v2 Tables

| Table | Purpose |
|-------|---------|
| conversations | Groups messages — user_id, title, message_count, is_archived |
| messages | Chat messages — conversation_id links to conversations |
| conversation_memory | Rolling summaries per conversation |
| user_memory | Long-term user facts (preferences, goals, health context) |
| user_health_summaries | Precomputed health summaries (daily, weekly, monthly, 90-day) |

### health_sync_log
Tracks HealthKit sync operations from HealthBite.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| sync_status | text | in_progress, completed, failed |
| metric_types | text[] | Array of metric types synced |
| sample_count | integer | Number of samples synced |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| error_message | text | If failed |
| created_at | timestamptz | |

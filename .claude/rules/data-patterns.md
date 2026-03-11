# Data Transformation & Query Patterns

## Supabase PostgREST Queries

All database access goes through `supabaseRequest()` using PostgREST syntax:

```javascript
// GET with filters and ordering
supabaseRequest('/rest/v1/table?select=col1,col2&user_id=eq.' + userId + '&order=created_at.desc&limit=100', 'GET', null, token)

// Common filter operators: eq., gte., lte., in.(), neq., is.null
// Array filter example:
'/rest/v1/apple_health_samples?metric_type=in.(sleep_analysis,heart_rate,steps)'

// INSERT
supabaseRequest('/rest/v1/table', 'POST', { field: 'value' }, token)

// UPDATE (PATCH with filter)
supabaseRequest('/rest/v1/profiles?auth_user_id=eq.' + userId, 'PATCH', { first_name: 'John' }, token)
```

### Error Handling

Always check for error objects in responses:

```javascript
var data = await supabaseRequest(endpoint, 'GET', null, token);
if (!data || data.error || !Array.isArray(data)) {
  console.error('[Section] Error:', data?.error);
  return;
}
```

## Date Handling (CRITICAL)

**Always use `localDateStr()` for date comparisons.** Never compare raw Date objects or rely on UTC.

```javascript
// Correct: local timezone string comparison
meals.filter(function(m) {
  return localDateStr(new Date(m.meal_time)) === selectedDateStr;
});

// Wrong: UTC-based comparison — will shift dates near midnight
meals.filter(function(m) {
  return new Date(m.meal_time).toISOString().slice(0, 10) === selectedDateStr;
});
```

`localDateStr()` returns `"YYYY-MM-DD"` in the user's local timezone. This prevents meals logged at 11pm from appearing on the next day.

## Meal Data Extraction

Meal nutrition lives in two places with a priority order:

1. **Primary**: `meal_log.data` — JSON object with categories containing nutrients
2. **Fallback**: `meal_nutrient` table — rows per nutrient per meal

### Nutrient Lookup Pattern

Use multi-name matching to handle variant naming from AI analysis:

```javascript
// Tries multiple names in order, returns first match
getNutrientFirstMatch(mealData, ['Calories', 'Energy', 'Calorie', 'Total Calories']);
getNutrientFirstMatch(mealData, ['Protein', 'Total Protein']);
getNutrientFirstMatch(mealData, ['Total Carbohydrates', 'Carbs', 'Carbohydrates']);
getNutrientFirstMatch(mealData, ['Total Fat', 'Fat', 'Total Fats']);
```

This handles inconsistent naming from the AI meal analysis edge function.

## Biomarker Name Mapping

Blood work biomarker names from lab PDFs vary widely. The scoring system maps 40+ variants to canonical keys:

```javascript
// These all map to 'glucose':
'Glucose', 'glucose', 'Fasting Glucose', 'Blood Glucose', 'GLUCOSE'

// These all map to 'ldl':
'LDL Cholesterol', 'LDL-C', 'Low Density Lipoprotein', 'LDL CHOL'
```

**Only the latest `test_date` is used** — all older blood work is ignored for scoring purposes.

## Numeric Precision

- Use `parseFloat(value || 0)` before calculations — never assume numeric types from API
- Round with `Math.round()` only at display time, not during intermediate calculations
- BMI formula: `weightKg / Math.pow(heightCm / 100, 2)` — height MUST be in centimeters

## Data Load Sequence

`loadDashboardData()` follows this order (dependencies matter):

1. Profile → sets `window.userProfileData` (needed for age, sex, height)
2. Health samples (21 days) → grouped by `metric_type`
3. Meals → filtered to timeframe
4. Fitness tests → percentile calculation needs profile data
5. Weight logs → latest entry
6. VO2 max → needs profile for age-adjusted lookup
7. Blood work → latest test_date only

### Caching

Dashboard data is cached in `localStorage` with 10-minute TTL (`healix_dashboard_cache`). On load, cached data renders immediately, then fresh data is fetched in the background. All cache writes must be wrapped in try/catch (quota exceeded possible).

## Auth Session Pattern

Every page follows the same auth check:

```javascript
var session = getSession();
if (!session || !session.access_token) {
  window.location.href = 'login.html';
  return;
}
```

Token refresh runs every 50 minutes. The `currentSession` global may hold a stale token between refreshes — always re-read from `getSession()` for critical operations.

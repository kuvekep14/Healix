# Vitality Age Scoring System

The Vitality Age is Healix's core feature — a single number representing the user's biological age derived from health metrics. All scoring functions live in `dashboard.js`.

## Individual Scores (0–100 scale)

### Heart Rate — `scoreHR(hr)`
- Gaussian curve centered at optimal zone (50–62 bpm resting)
- σ ≈ 15: scores drop gradually outside optimal range
- 100 = elite athletic resting HR, 0 = dangerously high/low

### Weight — `scoreWeight(weightKg, heightCm)`
- BMI-based J-shaped mortality curve
- Optimal BMI ~22: penalizes both under and overweight
- Asymmetric: obesity penalized more than underweight

### Sleep — `scoreSleep(sleepData)` (3 components)
- **Duration** (35pts): 7–8h optimal, penalties both directions
- **Sleep debt** (30pts): Cumulative deficit over recent days
- **Consistency** (35pts): Variance in sleep timing
- **Gotcha**: Oversleeping (>9h) penalized more than undersleeping (<5h)
- Uses session-based processing (`identifySleepSessions()`) — raw samples alone are incomplete

### Strength — `scoreStrength(strengthData)`
- Direct percentile from fitness test results (0–100)
- Looks up in `FITNESS_NORMS` by test key, age group, sex
- Multiple test types: bench_1rm, squat_1rm, deadlift_1rm, pushup, pullup

### VO2 Max — `scoreVO2(vo2, profile)`
- Age/sex-adjusted percentile from `FITNESS_NORMS` lookup table
- Uses Cooper test or direct input
- Percentile maps directly to 0–100 score

### Blood Work — `scoreBloodwork(bw)`
- Average of U-shaped risk curves per biomarker
- Each biomarker has an optimal range; score decreases as value moves away
- Biomarkers: glucose, HbA1c, LDL, HDL, triglycerides, CRP, creatinine, etc.
- **Only uses latest test_date** — historical trends not factored into score

## Composite Score — `calcVitalityAge(metrics)`

### Weight Distribution

Default weights when all metrics are present:

| Metric | Weight |
|--------|--------|
| Blood Work | 40% |
| Heart Rate | 25% |
| Weight | 20% |
| Sleep | 15% |
| Strength | 10% |
| VO2 Max | 5% |

**Auto-redistribution**: When metrics are missing, their weight is redistributed proportionally among available metrics. Example: if blood work is missing, HR becomes ~42%, weight ~33%, etc.

### Age Calculation

```
adjustment = (compositeScore - 70) / 5
vitalityAge = realAge - adjustment
```

- Score of 70 → vitality age = chronological age (baseline)
- Score of 90 → 4 years younger
- Score of 50 → 4 years older
- **Clamped** to realAge ± 20 years

### Confidence

The system reports confidence based on how many metrics have data and how fresh it is. Low confidence is shown when most metrics are stale or missing.

## Modifying Scoring

When changing any scoring function:

1. Keep all scores on 0–100 scale — the composite calculation depends on this
2. Test edge cases: missing data (null/undefined), extreme values, zero values
3. Don't change weight distribution without updating the redistribution logic
4. The vitality age display (`renderVitalityAge`) expects a specific result object shape — match it
5. Driver cards (`renderDriverCards`) read individual scores from the same result — keep the keys consistent

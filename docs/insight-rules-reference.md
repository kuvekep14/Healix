# Insight Rules Reference

Complete reference for the `INSIGHT_RULES` engine in `dashboard.js`. These rules run client-side against the user's health context and surface up to 4 insights on the dashboard, sorted by severity (`alert > attention > positive > neutral`).

---

## Table of Contents

1. [Tier 1: Threshold Crossings](#tier-1-threshold-crossings)
2. [Tier 2: Trends](#tier-2-trends)
3. [Goal-Aware Rules](#goal-aware-rules)
4. [Cross-Domain Correlations (Research-Backed)](#cross-domain-correlations-research-backed)
5. [Nutrition Correlations](#nutrition-correlations)
6. [Family History Integration](#family-history-integration)
7. [Protein Distribution](#protein-distribution)
8. [Strength Imbalances](#strength-imbalances)
9. [Additional Micronutrient Rules](#additional-micronutrient-rules)
10. [Doctor-Level Escalation Rules](#doctor-level-escalation-rules)
11. [Strength-to-Bodyweight Ratios](#strength-to-bodyweight-ratios)

---

## Tier 1: Threshold Crossings

These fire when a metric crosses from one scoring tier to another (good/fair/low) or when hard thresholds are breached.

### #1 — `hr_threshold_crossed`

| Field | Value |
|-------|-------|
| **Domain** | heart |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.hr`, `ctx.vaHistory` (previous VA driver scores) |
| **Goal filter** | None |

**Detection logic**: Scores resting HR via `scoreHR()`, buckets into good (>=70) / fair (>=40) / low (<40). Fires only if the tier changed from the previous vitality age snapshot.

**Headline variants**:
- `Resting HR improved to good`
- `Resting HR dropped to fair`
- `Resting HR dropped to low`

**Body**: "Your resting heart rate of {hr} bpm moved from {prevTier} to {tier} zone."

**Action**: "How can I improve my resting heart rate?"

---

### #2 — `weight_threshold_crossed`

| Field | Value |
|-------|-------|
| **Domain** | weight |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.weightScore`, `ctx.vaHistory` (previous VA driver scores) |
| **Goal filter** | None |

**Detection logic**: Uses the existing weight score. Buckets into good/fair/low. Fires only on tier change vs previous snapshot.

**Headline variants**:
- `Weight score improved to good`
- `Weight score dropped to fair`

**Body**: "Your BMI-based weight score moved from {prevTier} to {tier} range."

**Action**: "What should I do about my weight trend?"

---

### #3 — `bloodwork_flagged`

| Field | Value |
|-------|-------|
| **Domain** | bloodwork |
| **Severity** | alert |
| **Data needed** | `ctx.metrics.bloodwork` (glucose, hba1c, ldl, hdl, triglycerides, crp) |
| **Goal filter** | None |

**Detection logic**: Checks each biomarker against optimal ranges. Flags values below 70% of range minimum or above 150% of range maximum.

| Biomarker | Optimal Range |
|-----------|--------------|
| Glucose | 70-100 mg/dL |
| HbA1c | 4.0-5.6% |
| LDL | 0-100 mg/dL |
| HDL | 40+ mg/dL |
| Triglycerides | 0-150 mg/dL |
| hs-CRP | 0-1 mg/L |

**Headline**: "{count} biomarker(s) flagged"

**Body**: "{names} is/are outside optimal range. Review your latest bloodwork results."

**Action**: "Which of my blood biomarkers should I focus on?"

---

### #4 — `sleep_debt_high`

| Field | Value |
|-------|-------|
| **Domain** | sleep |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.sleepData.debt`, `ctx.profile.primary_goal` |
| **Goal filter** | None (fires for all users), but body text adapts to goal |

**Detection logic**: Fires when sleep debt exceeds 7 hours over the past week.

**Headline**: "Sleep debt is high"

**Body**: "You've accumulated {debt} hours of sleep debt over the past week."

**Goal-specific body additions**:

| Goal contains | Extra text |
|---------------|-----------|
| `strength` | "Sleep debt impairs muscle recovery and strength gains." |
| `weight` | "Poor sleep increases hunger hormones and makes fat loss harder." |
| `sleep` | "This is your primary goal -- prioritize consistent bedtimes." |
| `cardio` | "Recovery suffers without sleep -- your training quality will drop." |

**Action**: "How can I reduce my sleep debt?"

---

## Tier 2: Trends

These detect directional movement over 7-14 day windows.

### #5 — `hr_trend`

| Field | Value |
|-------|-------|
| **Domain** | heart |
| **Severity** | positive (base), dynamically set to `attention` if worsening |
| **Data needed** | `ctx.healthData['resting_heart_rate']` or `ctx.healthData['heart_rate']` |
| **Goal filter** | None |

**Detection logic**: Runs `computeMetricTrend()` on 7 days of HR samples. Fires if direction is not stable. For HR, "down" = improving.

**Headline variants**:
- `Resting HR trending down` (positive)
- `Resting HR trending up` (attention)

**Body variants**:
- *Improving*: "Down ~{slope} bpm over 7 days -- a sign of improving cardiovascular recovery."
- *Worsening*: "Up ~{slope} bpm over 7 days -- elevated stress or reduced recovery may be contributing."

**Action variants**:
- *Improving*: "What's driving my heart rate improvement?"
- *Worsening*: "Why is my resting heart rate going up?"

---

### #6 — `sleep_trend`

| Field | Value |
|-------|-------|
| **Domain** | sleep |
| **Severity** | positive (base), dynamically set to `attention` if declining |
| **Data needed** | `ctx.metrics.sleepData.trend` (direction, thisWeekAvg, lastWeekAvg, deltaHours) |
| **Goal filter** | None |

**Detection logic**: Uses pre-computed sleep trend. Fires if direction is not stable.

**Headline variants**:
- `Sleep duration improving` (positive)
- `Sleep duration declining` (attention)

**Body**: "Averaging {thisWeek}h this week vs {lastWeek}h last week (+/-{delta}h)."

**Action variants**:
- *Improving*: "What's helping my sleep improve?"
- *Declining*: "Why is my sleep getting worse?"

---

### #7 — `weight_trend`

| Field | Value |
|-------|-------|
| **Domain** | weight |
| **Severity** | neutral |
| **Data needed** | `weightEntries` (global), 14-day trend via `computeMetricTrend()` |
| **Goal filter** | None |

**Detection logic**: Requires 2+ weight entries. Runs 14-day trend. Fires if weekly change >= 0.2 kg.

**Headline variants**:
- `Weight trending down`
- `Weight trending up`

**Body**: "{Down/Up} ~{weeklyChange} kg/week. Current average: {avg} kg."

**Action variants**:
- *Down*: "What's driving my weight loss?"
- *Up*: "What's driving my weight gain?"

---

### #8 — `steps_trend`

| Field | Value |
|-------|-------|
| **Domain** | heart |
| **Severity** | positive (base), dynamically set to `attention` if declining |
| **Data needed** | `ctx.healthData['step_count']` (7-day and 14-day windows) |
| **Goal filter** | None |

**Detection logic**: Compares this-week vs last-week daily step averages. Fires if percentage change >= 10%.

**Headline variants**:
- `Steps up {pct}% vs last week` (positive)
- `Steps down {pct}% vs last week` (attention)

**Body**: "Averaging {thisAvg} steps/day this week vs {lastAvg} last week."

**Action variants**:
- *Up*: "How does my step count affect my vitality age?"
- *Down*: "How can I increase my daily step count?"

---

## Goal-Aware Rules

These only fire when the user's `primary_goal` matches specific keywords.

### #9 — `protein_deficit`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.profile.primary_goal`, `ctx.meals`, `getMacroTargets().prot` |
| **Goal filter** | `strength` or `weight` |

**Detection logic**: Over the past 7 days, checks how many days protein intake reached 80% of target. Fires if the user missed target on more than 1 of the tracked days. Requires 3+ days of meal data.

**Headline**: "Protein target hit {daysHit} of {daysChecked} days"

**Body variants**:
- *Strength goal*: "Consistent protein intake is critical for strength gains and recovery. Target: {target}g/day."
- *Weight goal*: "Adequate protein preserves muscle mass during a calorie deficit. Target: {target}g/day."

**Action**: "How can I hit my protein goal more consistently?"

---

### #10 — `protein_on_track`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | positive |
| **Data needed** | `ctx.profile.primary_goal`, `ctx.meals`, `getMacroTargets().prot` |
| **Goal filter** | `strength` or `weight` |

**Detection logic**: Inverse of `protein_deficit`. Fires when the user hit 80% of protein target on all but at most 1 of the tracked days. Requires 3+ days.

**Headline**: "Protein on target {daysHit} of {daysChecked} days"

**Body**: "Keep it up -- consistent protein fuels recovery and adaptation."

**Action**: "What else can I do to optimize my nutrition?"

---

### #11 — `lift_pr`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | positive |
| **Data needed** | `ctx.metrics.strengthData.tests` (bench_1rm, squat_1rm, deadlift_1rm, pullup, pushup) |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Groups fitness tests by key. For each lift, compares latest vs previous value. Fires if latest > previous (using `FITNESS_NORMS.higherBetter`).

**Headline**: "New PR: {label} {latest} {unit}"

**Body**: "Up {delta} {unit} from your previous test. {pctl}th percentile for your age group. Plus {n} other PR(s)." (conditional segments)

**Action**: "How can I keep progressing on my lifts?"

---

### #12 — `lift_stall`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.strengthData.tests` (bench_1rm, squat_1rm, deadlift_1rm), `ctx.meals`, `getMacroTargets().prot` |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: For big-3 lifts, flags when latest <= previous AND 28+ days between tests. Also checks if protein intake is under 50% of target (cross-references nutrition).

**Headline**: "{label} hasn't improved in {weeks}+ weeks"

**Body**: "{label} has been flat at {latest} {unit} for {weeks}+ weeks."
- *If protein low*: adds "Your protein intake has been under target -- that may be limiting recovery."

**Action**: "Why are my lifts stalling and how do I break through?"

---

### #13 — `recovery_readiness`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention (base), dynamically set to `positive` or `attention` |
| **Data needed** | `ctx.profile.primary_goal`, `ctx.metrics.sleepData.debt`, `ctx.healthData['resting_heart_rate']` |
| **Goal filter** | `strength` or `cardio` |

**Detection logic**: Checks sleep debt (>7h = bad, <=3h = good) and resting HR trend (up = bad, down = good). Fires if at least one signal is bad or good (but not mixed).

**Headline variants**:
- *Bad*: "Recovery may be compromised" (attention)
- *Good*: "Recovery looks solid" (positive)

**Body variants**:
- *Bad*: "Your {sleep debt is high / resting HR is trending up}. Consider a lighter session or active recovery today."
- *Good*: "Your {sleep debt is low / resting HR is trending down}. Good day to push hard."

**Action variants**:
- *Bad*: "How does recovery affect my training performance?"
- *Good*: "How can I maximize my training when recovery is good?"

---

### #14 — `domain_incomplete`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | neutral |
| **Data needed** | `ctx.metrics.strengthData` (via `getCompletedDomains()`) |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Fires when some (but not all) of the 5 strength domains have tests logged. Does not nag if zero domains are completed.

**Headline**: "{completed} of 5 strength domains tested"

**Body**: "Complete {missing domains} for a confirmed fitness score."

**Action**: "Which fitness tests should I do next?"

---

### #15 — `training_stale`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | attention |
| **Data needed** | `ctx.timestamps.strength` |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Fires when no fitness test has been logged in 21+ days.

**Headline**: "No fitness tests logged in {weeks}+ weeks"

**Body**: "Track a session to keep your strength progress visible."

**Action**: "What should I test to track my strength progress?"

---

### #16 — `calorie_surplus`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.meals`, `getMacroTargets().cal` |
| **Goal filter** | `weight` (via `goalIncludes()`) |

**Detection logic**: Over 7 days, counts days where logged calories exceeded target by >10%. Fires if 3+ of the tracked days were over. Requires 3+ days of data.

**Headline**: "Calories over target {daysOver} of {daysChecked} days"

**Body**: "Your calorie target is {target} kcal/day for weight loss. Consistent surplus will slow progress."

**Action**: "How can I manage my calorie intake better?"

---

## Cross-Domain Correlations (Research-Backed)

These combine data from two or more domains and include citations from published research.

### #17 — `vo2_deep_sleep`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.vo2max`, `ctx.metrics.sleepData.stages.deep.pct` |
| **Goal filter** | None |

**Detection logic**: Fires when both VO2 max and deep sleep percentage are available. Deep sleep >= 15% = good.

| Variant | Severity | Headline |
|---------|----------|----------|
| Good | positive | "Aerobic fitness supporting deep sleep" |
| Low deep sleep | attention | "Deep sleep below target" |

**Body (good)**: "Your VO2 max of {vo2} ml/kg/min and {deepPct}% deep sleep are consistent with research showing higher aerobic fitness is one of the strongest predictors of deep sleep quality."

**Body (low)**: "Your deep sleep is {deepPct}% (target: 15-20%). Research shows aerobic fitness is the strongest behavioral predictor of deep sleep. Your VO2 max of {vo2} -- improving it through cardio could directly boost deep sleep."

**Action (good)**: "How does VO2 max affect my sleep quality?"
**Action (low)**: "How can I increase my deep sleep percentage?"

---

### #18 — `sleep_rhr_correlation`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.hr`, `ctx.metrics.sleepData.avg` or `.latest` |
| **Goal filter** | None |

**Detection logic**: Fires when average sleep < 6h AND resting HR > 72 bpm.

**Headline**: "Short sleep is elevating your heart rate"

**Body**: "You're averaging {sleep}h of sleep and your resting HR is {hr} bpm. Research shows sleeping under 6 hours raises resting HR by 4-8 bpm through sympathetic nervous system activation. Improving sleep to 7+ hours could directly lower your resting HR."

**Research**: Sympathetic nervous system activation from sleep restriction raises resting HR 4-8 bpm.

**Action**: "How does sleep affect my resting heart rate?"

---

### #19 — `steps_sleep_efficiency`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.steps`, `ctx.metrics.sleepData.efficiency` |
| **Goal filter** | None |

**Detection logic**: Two trigger conditions:
- Low: steps < 4,000 AND efficiency < 82%
- High: steps >= 7,000 AND efficiency >= 88%

| Variant | Severity | Headline |
|---------|----------|----------|
| Low activity | attention | "Low activity may be hurting sleep quality" |
| High activity | positive | "Activity level supporting sleep quality" |

**Body (low)**: "You logged {steps} steps today and your sleep efficiency is {efficiency}%. Research shows people hitting 7,000+ steps sleep significantly more efficiently. More daytime movement could improve how well you sleep."

**Body (high)**: "Your {steps} daily steps and {efficiency}% sleep efficiency are consistent with research linking 7,000+ steps to better sleep quality."

**Research**: 7,000+ daily steps linked to significantly better sleep efficiency.

**Action (low)**: "How does physical activity affect my sleep?"
**Action (high)**: "What else can I do to optimize my sleep?"

---

### #20 — `grip_strength_longevity`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.strengthData.tests` (test_key: `grip_strength`) |
| **Goal filter** | None |

**Detection logic**: Fires when grip strength test data exists. Uses percentile to determine variant.

| Variant | Severity | Headline |
|---------|----------|----------|
| >= 50th pctl | positive | "Grip strength: strong longevity signal" |
| < 50th pctl | attention | "Grip strength: worth improving" |

**Body (strong)**: "Your grip strength of {value} lbs ({pctl}th percentile) is a powerful longevity signal. A Lancet study of 140,000 people found grip strength predicts cardiovascular death better than blood pressure."

**Body (weak)**: "Your grip strength of {value} lbs ({pctl}th percentile) has room to improve. A Lancet study of 140,000 people found each 5 kg decrease in grip strength increases cardiovascular mortality by 17%. Dead hangs and farmer's walks are high-ROI exercises."

**Research**: Lancet study (n=140,000) -- grip strength predicts cardiovascular death better than blood pressure; each 5 kg decrease = 17% higher cardiovascular mortality.

**Action**: "Why is grip strength important for longevity?"

---

### #21 — `pushup_cardiovascular`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.strengthData.tests` (test_key: `pushup`) |
| **Goal filter** | None |

**Detection logic**: Fires when pushup test data exists. Three tiers based on rep count.

| Reps | Severity | Headline |
|------|----------|----------|
| >= 40 | positive | "Pushups: cardiovascular risk indicator" |
| 10-39 | neutral | "Pushups: cardiovascular risk indicator" |
| < 10 | attention | "Pushups: cardiovascular risk indicator" |

**Body (40+)**: "You logged {reps} pushups. A Harvard-affiliated study found that men completing 40+ pushups had a 96% lower risk of heart events over 10 years. You're in the protective zone."

**Body (10-39)**: "You logged {reps} pushups. Research shows 40+ pushups is associated with 96% lower cardiovascular event risk. Building toward that threshold is a meaningful heart health goal."

**Body (<10)**: "You logged {reps} pushups. Research links low pushup capacity (<10) to significantly higher cardiovascular risk. This is one of the simplest, most predictive fitness tests -- worth building up."

**Research**: Harvard-affiliated study -- 40+ pushups associated with 96% lower cardiovascular event risk over 10 years.

**Action**: "How do pushups relate to heart health?"

---

### #22 — `vo2_rhr_consistency`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral (base), dynamically set |
| **Data needed** | `ctx.metrics.vo2max`, `ctx.metrics.hr` |
| **Goal filter** | None |

**Detection logic**: Checks alignment between VO2 max and resting HR. Flags inconsistency (high VO2 + high HR, or low VO2 + low HR). Confirms consistency (high VO2 + low HR).

| Variant | Severity | Headline |
|---------|----------|----------|
| Inconsistent | attention | "VO2 max and resting HR are misaligned" |
| Consistent | positive | "Fitness and heart rate well aligned" |

**Body (inconsistent)**: "Your VO2 max of {vo2} ml/kg/min and resting HR of {rhr} bpm don't match typical patterns. Research shows each 1-point VO2 increase lowers resting HR by ~0.5 bpm. A mismatch may indicate stress, dehydration, or overtraining."

**Body (consistent)**: "Your VO2 max of {vo2} ml/kg/min and resting HR of {rhr} bpm are consistent. Research shows each 1-point VO2 increase lowers resting HR by ~0.5 bpm -- your cardiovascular system is adapting to your fitness level."

**Research**: Each 1-point VO2 increase lowers resting HR by ~0.5 bpm.

**Action (inconsistent)**: "Why is my resting heart rate higher than expected for my fitness level?"
**Action (consistent)**: "How can I continue improving my cardiovascular fitness?"

---

### #23 — `sleep_glucose`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.sleepData.avg` or `.latest`, `ctx.metrics.bloodwork.glucose`, `ctx.metrics.bloodwork.hba1c` |
| **Goal filter** | None |

**Detection logic**: Fires when average sleep < 6.5h AND (glucose > 100 mg/dL OR HbA1c > 5.6%).

**Headline**: "Short sleep may be affecting blood sugar"

**Body**: "You're averaging {sleep}h of sleep with {fasting glucose of X mg/dL / HbA1c of X%}. Research shows sleeping under 6 hours reduces insulin sensitivity by up to 30%. Improving sleep to 7+ hours could be as impactful as dietary changes for glucose management."

**Research**: Sleeping under 6 hours reduces insulin sensitivity by up to 30%.

**Action**: "How does sleep affect my blood sugar levels?"

---

### #24 — `sleep_weight_gain`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.sleepData.avg` or `.latest`, `weightEntries` (global, 14-day trend) |
| **Goal filter** | None |

**Detection logic**: Fires when average sleep < 6.5h AND weight is trending up >= 0.2 kg/week over 14 days.

**Headline**: "Short sleep linked to weight gain pattern"

**Body**: "You're averaging {sleep}h of sleep and your weight is trending up ~{weeklyGain} kg/week. Research shows sleeping under 6 hours increases hunger hormones and drives 200-500 extra calories of intake per day. Fixing sleep is one of the most underrated weight management strategies."

**Research**: Sleeping under 6 hours increases hunger hormones, driving 200-500 extra kcal/day.

**Action**: "How does sleep affect my weight?"

---

### #25 — `activity_triglycerides`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.steps`, `ctx.metrics.bloodwork.triglycerides` |
| **Goal filter** | None |

**Detection logic**: Fires when triglycerides > 150 mg/dL. Checks if steps < 6,000 for low-activity variant.

**Headline**: "Activity level and triglycerides"

**Body (low activity)**: "Your triglycerides are {trig} mg/dL (above the 150 optimal threshold) and you're averaging {steps} steps/day. Exercise is one of the most potent triglyceride-lowering interventions -- research shows regular activity reduces them by 10-20%. Increasing to 8,000+ steps could meaningfully impact this at your next blood draw."

**Body (moderate+ activity)**: "...While your activity level is reasonable, research shows exercise reduces triglycerides by 10-20%. Higher-intensity sessions or longer walks may provide additional benefit."

**Research**: Regular exercise reduces triglycerides by 10-20%.

**Action**: "How can I lower my triglycerides through exercise?"

---

### #26 — `vo2_hdl`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.vo2max`, `ctx.metrics.bloodwork.hdl` |
| **Goal filter** | None |

**Detection logic**: Fires when both VO2 max and HDL are available.

| Variant | Severity | Headline |
|---------|----------|----------|
| HDL < 40 | attention | "Low HDL -- aerobic fitness can help" |
| HDL >= 40 | positive | "Aerobic fitness supporting HDL levels" |

**Body (low HDL)**: "Your HDL is {hdl} mg/dL (below the 40 mg/dL threshold) with a VO2 max of {vo2}. Research shows each 1-point VO2 increase raises HDL by ~0.4 mg/dL. Aerobic exercise is the most effective non-pharmaceutical HDL intervention."

**Body (normal HDL)**: "Your VO2 max of {vo2} and HDL of {hdl} mg/dL are consistent with research showing aerobic fitness is the strongest behavioral predictor of HDL. Each 1-point VO2 increase corresponds to ~0.4 mg/dL higher HDL."

**Research**: Each 1-point VO2 increase raises HDL by ~0.4 mg/dL. Aerobic fitness is the strongest behavioral predictor of HDL.

**Action (low)**: "How can I raise my HDL cholesterol?"
**Action (normal)**: "What else affects my HDL cholesterol?"

---

### #27 — `strength_crp`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.strengthData.avgPercentile`, `ctx.metrics.bloodwork.crp` |
| **Goal filter** | None |

**Detection logic**: Fires when both strength percentile and CRP are available.

| Variant | Severity | Headline |
|---------|----------|----------|
| CRP > 1 AND strength < 50th pctl | attention | "Strength and inflammation" |
| CRP <= 1 AND strength >= 50th pctl | positive | "Strength and inflammation" |
| Other combinations | neutral (implicit) | "Strength and inflammation" |

**Body (high CRP, low strength)**: "Your CRP is {crp} mg/L (elevated) and your strength is at the {pctl}th percentile. Research shows people in the top third of strength have 32% lower CRP -- muscle secretes anti-inflammatory molecules (myokines) when it contracts. Consistent training may help bring inflammation down."

**Body (low CRP, high strength)**: "Your CRP of {crp} mg/L (low inflammation) and {pctl}th percentile strength are aligned. Muscle acts as an anti-inflammatory organ -- research shows stronger individuals have 32% lower CRP."

**Body (mixed)**: "Your CRP is {crp} mg/L and strength is at the {pctl}th percentile. Research links higher muscular strength to 32% lower chronic inflammation through anti-inflammatory myokine release during muscle contraction."

**Research**: Top-third strength = 32% lower CRP. Myokines (anti-inflammatory molecules) released during muscle contraction.

**Action**: "How does strength training affect inflammation?"

---

### #28 — `weight_rhr`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.hr`, `ctx.profile.current_weight_kg`, `ctx.profile.height_cm` |
| **Goal filter** | None |

**Detection logic**: Fires when BMI >= 25 AND resting HR > 72 bpm.

**Headline**: "Elevated BMI contributing to higher heart rate"

**Body**: "Your BMI of {bmi} and resting HR of {rhr} bpm are connected. Research shows each 1-point BMI increase raises resting HR by ~1.3 bpm. A 5-point BMI reduction typically corresponds to a 6-7 bpm drop in resting heart rate."

**Research**: Each 1-point BMI increase raises resting HR by ~1.3 bpm. 5-point BMI reduction = 6-7 bpm drop.

**Action**: "How does my weight affect my heart health?"

---

### #29 — `protein_sleep_quality`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral (base), dynamically set |
| **Data needed** | `ctx.meals`, `ctx.metrics.sleepData.stages.deep.pct`, `ctx.profile.current_weight_kg` |
| **Goal filter** | None |

**Detection logic**: Calculates average daily protein per kg of body weight from recent meals (requires 3+ days). Fires in two cases:
- Good: protein >= 1.2 g/kg AND deep sleep >= 15%
- Low: protein < 1.0 g/kg AND deep sleep < 15%

| Variant | Severity | Headline |
|---------|----------|----------|
| Good | positive | "Protein intake supporting sleep quality" |
| Low | attention | "Low protein may be affecting deep sleep" |

**Body (good)**: "Your {perKg} g/kg daily protein and {deepPct}% deep sleep align with research showing higher protein intake (>1.2 g/kg) improves deep sleep through tryptophan pathways."

**Body (low)**: "Your protein intake of {perKg} g/kg and {deepPct}% deep sleep (target: 15-20%) are both below ideal. Research shows protein above 1.2 g/kg/day supports better sleep quality through tryptophan -- a serotonin/melatonin precursor."

**Research**: Protein >1.2 g/kg improves deep sleep via tryptophan (serotonin/melatonin precursor).

**Action (good)**: "How does protein affect my sleep quality?"
**Action (low)**: "Can increasing protein improve my sleep?"

---

### #30 — `activity_glucose`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.steps`, `ctx.metrics.bloodwork.glucose` |
| **Goal filter** | None |

**Detection logic**: Fires when fasting glucose > 100 mg/dL.

**Headline**: "Activity and blood sugar"

**Body (low activity, <6,000 steps)**: "Your fasting glucose is {glucose} mg/dL (above optimal) and you're averaging {steps} steps/day. Research shows each additional 2,000 steps/day lowers fasting glucose by about 1.5 mg/dL. Even a 10-15 minute walk after meals reduces glucose spikes by 20-30%."

**Body (moderate+ activity)**: "...While your activity level is decent, post-meal walking (even 10-15 minutes) can reduce glucose spikes by 20-30% -- one of the most underrated glucose management tools."

**Research**: Each additional 2,000 steps/day lowers fasting glucose ~1.5 mg/dL. Post-meal walking reduces glucose spikes by 20-30%.

**Action**: "How does walking after meals affect my blood sugar?"

---

### #31 — `overtraining_signal`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | alert |
| **Data needed** | `ctx.healthData['resting_heart_rate']`, `ctx.metrics.steps`, `ctx.metrics.sleepData.avg` |
| **Goal filter** | None |

**Detection logic**: Checks three signals and fires when 2+ are present:
1. Resting HR trending up >= 3 bpm/week
2. Steps > 10,000/day (high activity load)
3. Average sleep < 6h

**Headline**: "Overtraining warning"

**Body**: "Multiple recovery signals are flagged: {resting HR is trending up, sleep is under 6 hours, activity load is high}. This pattern is an early indicator of overtraining -- your body isn't recovering as fast as you're training. Consider 2-3 days of active recovery or deload."

**Action**: "How do I know if I'm overtraining and what should I do?"

---

### #32 — `sleep_strength_performance`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.sleepData.avg` or `.latest`, `ctx.metrics.strengthData.tests` (bench/squat/deadlift) |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Fires when average sleep < 6.5h AND at least one big-3 lift is stalling (latest <= previous).

**Headline**: "Sleep may be limiting your strength gains"

**Body**: "You're averaging {sleep}h of sleep and your lifts have stalled. Research shows sleeping under 6 hours reduces maximal strength by 5-10% -- and testosterone, which drives strength adaptation, is produced primarily during deep sleep. Prioritizing 7+ hours could break the plateau without changing your training."

**Research**: Sleeping under 6 hours reduces maximal strength by 5-10%. Testosterone is produced primarily during deep sleep.

**Action**: "How does sleep affect my strength and muscle growth?"

---

### #33 — `weight_hba1c`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.bloodwork.hba1c`, `weightEntries` (global, 30-day trend) |
| **Goal filter** | None |

**Detection logic**: Fires when HbA1c > 5.6% and weight entries exist (2+).

**Headline**: "Weight and blood sugar are connected"

**Body (weight trending up)**: "Your HbA1c of {hba1c}% is above the optimal 5.6% threshold. Your weight is also trending up. The Diabetes Prevention Program -- one of the most replicated studies in medicine -- showed that losing just 5-7% of body weight reduces diabetes risk by 58% and HbA1c by up to 1 full point."

**Body (weight trending down)**: "...The good news: your weight is trending down (~{weeklyChange} kg/week), which should improve HbA1c at your next blood draw. Losing 5-7% of body weight can reduce HbA1c by up to 1 point."

**Research**: Diabetes Prevention Program -- 5-7% body weight loss reduces diabetes risk by 58% and HbA1c by up to 1 point.

**Action**: "How does weight loss affect my HbA1c?"

---

### #34 — `recovery_compound`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | positive (base), dynamically set |
| **Data needed** | `ctx.metrics.sleepData.efficiency`, `ctx.metrics.hr`, `ctx.meals`, `getMacroTargets().prot` |
| **Goal filter** | None |

**Detection logic**: Checks three "recovery pillars":
1. Sleep efficiency >= 85%
2. Resting HR <= 65 bpm
3. Today's protein >= 80% of target

Fires when 2+ pillars are in check.

| Variant | Severity | Headline |
|---------|----------|----------|
| All 3 good | positive | "All three recovery pillars in check" |
| 2 of 3 good | neutral | "Recovery: 2 of 3 pillars in check" |

**Body (all 3)**: "Sleep efficiency, resting heart rate, and protein intake are all in good shape. Research from the International Olympic Committee identifies these as the three pillars of recovery -- you're covering all of them."

**Body (2 of 3)**: "Your {weak pillars} could use attention. IOC research shows recovery is only as strong as its weakest pillar -- focus on {weakest} this week."

**Research**: International Olympic Committee -- three pillars of recovery (sleep, heart rate, nutrition).

**Action (all 3)**: "How can I maximize my training when recovery is dialed in?"
**Action (2 of 3)**: "What are the three pillars of recovery?"

---

## Nutrition Correlations

These cross-reference micronutrient intake from meal logs with sleep, bloodwork, and fitness data. All require 5+ meals logged in the past 7 days.

### #35 — `magnesium_sleep`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.sleepData.efficiency` or `.avg` |
| **Goal filter** | None |

**Detection logic**: Daily magnesium < 70% of 400mg RDA AND (sleep efficiency < 85% OR average sleep < 6.5h).

**Headline**: "Low magnesium may be affecting sleep"

**Body**: "You're averaging {dailyMg}mg magnesium/day ({pctRda}% of RDA) and your sleep quality is below target. Magnesium regulates GABA receptors and melatonin production -- a 2012 study in the Journal of Research in Medical Sciences found supplementing 500mg improved sleep quality, onset latency, and duration in elderly adults."

**Research**: Journal of Research in Medical Sciences (2012) -- 500mg magnesium supplementation improved sleep quality, onset latency, and duration.

**Action**: "Should I take magnesium for sleep?"

---

### #36 — `fiber_cholesterol`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.bloodwork.ldl` |
| **Goal filter** | None |

**Detection logic**: LDL > 100 mg/dL AND daily fiber < 25g.

**Headline**: "Low fiber linked to elevated LDL"

**Body**: "You're averaging {fiber}g fiber/day (target: 25-30g) with LDL at {ldl} mg/dL. Soluble fiber binds bile acids and directly lowers LDL -- a meta-analysis in the American Journal of Clinical Nutrition found each 5-10g increase reduces LDL by 5-10 mg/dL."

**Research**: American Journal of Clinical Nutrition meta-analysis -- each 5-10g fiber increase reduces LDL by 5-10 mg/dL.

**Action**: "What foods should I eat to lower my LDL cholesterol?"

---

### #37 — `omega3_triglycerides`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.bloodwork.triglycerides` |
| **Goal filter** | None |

**Detection logic**: Triglycerides > 150 mg/dL AND daily omega-3 < 1.5g.

**Headline**: "Low omega-3 with elevated triglycerides"

**Body**: "Your triglycerides are {trig} mg/dL and you're averaging only {omega3}g omega-3/day. EPA and DHA from fish oil reduce triglycerides by 15-30% at therapeutic doses (2-4g/day). Even 2-3 servings of fatty fish per week can meaningfully lower triglycerides."

**Research**: EPA/DHA reduce triglycerides by 15-30% at 2-4g/day.

**Action**: "How do omega-3s affect my triglycerides?"

---

### #38 — `omega3_inflammation`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.bloodwork.crp` |
| **Goal filter** | None |

**Detection logic**: CRP > 1 mg/L AND daily omega-3 < 1.5g.

**Headline**: "Low omega-3 with elevated inflammation"

**Body**: "Your CRP is {crp} mg/L (elevated) and omega-3 intake is {omega3}g/day. Omega-3 fatty acids are among the most potent dietary anti-inflammatories -- a 2017 meta-analysis showed they reduce CRP by 0.2-0.5 mg/L. Fatty fish, walnuts, and flaxseed are the best food sources."

**Research**: 2017 meta-analysis -- omega-3s reduce CRP by 0.2-0.5 mg/L.

**Action**: "What anti-inflammatory foods should I eat?"

---

### #39 — `saturated_fat_ldl`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.bloodwork.ldl` |
| **Goal filter** | None |

**Detection logic**: LDL > 100 mg/dL AND daily saturated fat > 15g.

**Headline**: "High saturated fat linked to elevated LDL"

**Body**: "You're averaging {satFat}g saturated fat/day (target: under 15-20g) with LDL at {ldl} mg/dL. A Cochrane review found that replacing saturated fat with unsaturated sources (olive oil, nuts, avocado) reduces cardiovascular events by 17%."

**Research**: Cochrane review -- replacing saturated fat with unsaturated sources reduces cardiovascular events by 17%.

**Action**: "How should I adjust my fat intake to lower LDL?"

---

### #40 — `vitamin_d_status`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral (base), dynamically overridden to `attention` |
| **Data needed** | `ctx.meals` (7-day), `ctx.profile.primary_goal`, `ctx.metrics.strengthData` |
| **Goal filter** | None (fires for all users), but body adapts to `strength` goal |

**Detection logic**: Daily vitamin D < 15 mcg (600 IU). RDA used for % calculation is 20 mcg (800 IU).

**Headline**: "Vitamin D intake is low"

**Body**: "You're averaging {dailyD} mcg vitamin D/day ({pctRda}% of RDA). Most people are deficient -- vitamin D is critical for bone density, immune function, and muscle strength."
- *Strength goal addition*: "Low vitamin D is linked to 15-20% lower testosterone and impaired muscle protein synthesis."
- "Consider supplementing 1000-2000 IU/day, especially in winter months."

**Research**: Low vitamin D linked to 15-20% lower testosterone and impaired muscle protein synthesis.

**Action**: "Should I supplement vitamin D?"

---

### #41 — `iron_energy`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.profile.sex`, `ctx.metrics.vo2max` (optional) |
| **Goal filter** | None |

**Detection logic**: Daily iron < 60% of RDA (RDA: 18mg female, 8mg male). Optionally checks if VO2 max < 35.

**Headline**: "Iron intake below target"

**Body**: "You're averaging {dailyIron}mg iron/day ({pctRda}% of your {rda}mg RDA). Iron carries oxygen to muscles -- deficiency is the most common nutritional deficiency worldwide and directly impairs exercise capacity."
- *Low VO2 addition*: "Your VO2 max is also below average -- iron supplementation or iron-rich foods (red meat, spinach, lentils) could help both."

**Research**: Iron deficiency is the most common nutritional deficiency worldwide; directly impairs exercise capacity.

**Action**: "How does iron affect my energy and exercise performance?"

---

### #42 — `zinc_recovery`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day) |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Daily zinc < 8mg. RDA used for % calculation is 11mg.

**Headline**: "Low zinc may limit strength recovery"

**Body**: "You're averaging {dailyZinc}mg zinc/day ({pctRda}% of RDA). Zinc is essential for testosterone production and muscle protein synthesis -- a 1996 Wayne State study found zinc deficiency reduced testosterone by 75% in young men. Red meat, oysters, pumpkin seeds, and legumes are rich sources."

**Research**: Wayne State University (1996) -- zinc deficiency reduced testosterone by 75% in young men.

**Action**: "How does zinc affect testosterone and recovery?"

---

### #43 — `sodium_potassium_ratio`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day) |
| **Goal filter** | None |

**Detection logic**: Fires when daily sodium >= 2,500mg AND daily potassium < 3,500mg AND sodium:potassium ratio >= 1.5.

**Headline**: "Sodium-to-potassium ratio is off"

**Body**: "You're averaging {sodium}mg sodium vs {potassium}mg potassium/day (ratio: {ratio}:1). A 2014 WHO meta-analysis found that improving the sodium:potassium ratio is more predictive of cardiovascular outcomes than reducing sodium alone. Bananas, potatoes, spinach, and avocado are potassium-dense."

**Research**: WHO meta-analysis (2014) -- sodium:potassium ratio is more predictive of cardiovascular outcomes than sodium alone.

**Action**: "How should I balance sodium and potassium in my diet?"

---

### #44 — `leucine_muscle_synthesis`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral (base), dynamically set |
| **Data needed** | `ctx.meals` (7-day) |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Daily leucine must be > 0 (data present in meal logs). Two variants:
- Adequate: >= 2.5g/day
- Low: < 2.5g/day

| Variant | Severity | Headline |
|---------|----------|----------|
| Adequate | positive | "Leucine intake supporting muscle growth" |
| Low | attention | "Leucine may be below the anabolic threshold" |

**Body (adequate)**: "You're averaging {dailyLeucine}g leucine/day. Research shows 2.5g+ per meal triggers maximal muscle protein synthesis -- the 'leucine threshold.' You're hitting it."

**Body (low)**: "You're averaging {dailyLeucine}g leucine/day. The 'leucine threshold' -- the minimum needed to trigger muscle protein synthesis -- is about 2.5g per meal. Whey protein, eggs, chicken, and beef are the richest sources."

**Research**: 2.5g leucine per meal triggers maximal muscle protein synthesis (the "leucine threshold").

**Action (adequate)**: "What else optimizes muscle protein synthesis?"
**Action (low)**: "What is the leucine threshold and why does it matter?"

---

### #45 — `late_eating_sleep`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.sleepData.bedtime`, `ctx.metrics.sleepData.efficiency` |
| **Goal filter** | None |

**Detection logic**: Counts meals eaten within 2 hours of bedtime over the past 7 days. Fires when 3+ late meals detected.

**Headline**: "Late eating affecting sleep quality"

**Body**: "You ate within 2 hours of bedtime on {count} occasions this week."
- *If sleep efficiency < 85%*: "Your sleep efficiency of {efficiency}% is below the 85% target."
- "A British Journal of Nutrition study found late meals reduce sleep efficiency by 4-8% and deep sleep by 10-15 minutes due to elevated core body temperature. Try finishing your last meal 3+ hours before bed."

**Research**: British Journal of Nutrition -- late meals reduce sleep efficiency by 4-8% and deep sleep by 10-15 minutes.

**Action**: "How does meal timing affect my sleep?"

---

### #46 — `high_carb_glucose`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day), `ctx.metrics.bloodwork.glucose`, `ctx.metrics.bloodwork.hba1c` |
| **Goal filter** | None |

**Detection logic**: (glucose > 100 OR HbA1c > 5.6%) AND daily carbs >= 250g.

**Headline**: "High carb intake with elevated blood sugar"

**Body**: "You're averaging {carbs}g carbs/day with {fasting glucose of X / HbA1c of X%}. A BMJ meta-analysis showed reducing refined carbs by 20-30% can lower HbA1c by 0.3-0.5%. Focus on swapping refined carbs for complex sources -- whole grains, vegetables, legumes."

**Research**: BMJ meta-analysis -- reducing refined carbs by 20-30% lowers HbA1c by 0.3-0.5%.

**Action**: "Which carbs should I eat and which should I avoid?"

---

### #47 — `calorie_weight_discrepancy`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral |
| **Data needed** | `ctx.meals` (14-day), `weightEntries` (global, 14-day trend), `getMacroTargets().cal` |
| **Goal filter** | None |

**Detection logic**: Requires 10+ meals over 14 days. Compares predicted weekly weight change (from calorie balance) vs actual weight trend. Fires when the discrepancy is >= 0.3 kg/week AND one of:
- Gaining weight despite logging a calorie deficit (>200 kcal under target)
- Losing weight despite logging a calorie surplus (>200 kcal over target)

**Headline**: "Logged calories don't match weight trend"

**Body (gaining on deficit)**: "You're logging {dailyCal} kcal/day (under your {target} target) but your weight is still trending up. Research shows people underreport intake by 20-40% on average. Some meals may not be logged, or portion estimates may be off. Try logging everything for one strict week to calibrate."

**Body (losing on surplus)**: "You're logging {dailyCal} kcal/day (above your {target} target) but losing weight. You may be more active than your calorie target accounts for, or some high-calorie items in your logs may be overestimated. Either way, your body is in a deficit."

**Research**: Self-reported intake underreporting averages 20-40%.

**Action**: "Why is my weight not matching my calorie intake?"

---

### #48 — `calcium_bone_strength`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day, micronutrients: Calcium, Vitamin D) |
| **Goal filter** | None |

**Detection logic**: Daily calcium < 800mg. Also checks if vitamin D is simultaneously low (< 15 mcg).

**Headline**: "Calcium intake below target"

**Body**: "You're averaging {calcium}mg calcium/day ({pctRda}% of RDA). Calcium is essential for bone density and muscle contraction."
- *If both calcium and vitamin D are low*: "Combined with low vitamin D, calcium absorption is further impaired -- vitamin D is required to absorb calcium from the gut."
- "Dairy, fortified plant milks, sardines, and leafy greens are calcium-rich."

**Research**: Vitamin D is required for calcium absorption from the gut.

**Action**: "How much calcium do I need and what are the best sources?"

---

## Family History Integration

These cross-reference the user's family history (from their profile) with current biomarkers to flag genetic risk amplifiers.

### #49 -- `family_diabetes_glucose`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.profile.family_history` (Type 2 Diabetes or Type 1 Diabetes), `ctx.metrics.bloodwork.glucose`, `ctx.metrics.bloodwork.hba1c` |
| **Goal filter** | None |

**Detection logic**: Parses family history JSON. Fires when a diabetes entry exists (Type 2 or Type 1) AND at least one glucose marker is borderline (glucose > 90 mg/dL OR HbA1c > 5.4%).

**Headline**: "Family diabetes history + borderline blood sugar"

**Body**: "You have family history of diabetes ({members}) and your {fasting glucose of X mg/dL / HbA1c of X%} is approaching the pre-diabetic threshold. With genetic predisposition, maintaining healthy glucose is more important than for the general population. Focus on sleep (>7h), daily walking, and limiting refined carbs."

**Action**: "What should I do about borderline blood sugar with family history of diabetes?"

---

### #50 -- `family_heart_disease_risk`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention (base), dynamically escalated to `alert` via template |
| **Data needed** | `ctx.profile.family_history` (Heart disease, High blood pressure, High cholesterol, Stroke, Sudden cardiac death), `ctx.metrics.bloodwork` (LDL, HDL, triglycerides, CRP), `ctx.metrics.hr` |
| **Goal filter** | None |

**Detection logic**: Checks family history for any of 5 cardiovascular conditions. If at least one is present, scans current markers for concerns: LDL > 100, HDL < 45, triglycerides > 150, CRP > 1, resting HR > 75. Fires only when both family history AND at least one biomarker concern exist.

**Headline**: "Cardiovascular risk factors with family history"

**Body**: "Your family history includes {conditions}. Combined with {concerns}, your cardiovascular risk profile deserves attention. Consider discussing these markers with your doctor at your next visit."

**Action**: "What lifestyle changes lower cardiovascular risk with family history?"

---

### #51 -- `family_cholesterol_ldl`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | attention |
| **Data needed** | `ctx.profile.family_history` (High cholesterol), `ctx.metrics.bloodwork.ldl` |
| **Goal filter** | None |

**Detection logic**: Fires when family history includes "High cholesterol" AND current LDL > 100 mg/dL.

**Headline**: "Elevated LDL with family cholesterol history"

**Body**: "Your LDL of {ldl} mg/dL is above optimal, and your family ({members}) has a history of high cholesterol. Familial hypercholesterolemia affects ~1 in 250 people -- if your LDL stays elevated despite diet and exercise, discuss genetic screening with your doctor."

**Research**: Familial hypercholesterolemia prevalence ~1 in 250.

**Action**: "Should I be concerned about familial high cholesterol?"

---

## Protein Distribution

### #52 -- `protein_distribution`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (today's meals, via `getMacrosFromMeal()`) |
| **Goal filter** | `strength` or `weight` (via `goalIncludes()`) |

**Detection logic**: Looks at today's meals (requires 2+ meals logged). Calculates protein per meal. Fires when >60% of total daily protein came from a single meal AND total protein >= 30g.

**Headline**: "{pct}% of today's protein in one meal"

**Body**: "{maxMeal}g of your {total}g protein came from a single meal. Research shows muscle protein synthesis maxes out at ~40-50g per meal -- spreading protein across 3-4 meals triggers more total synthesis than one large serving. Aim for 30-50g per meal."

**Research**: Muscle protein synthesis maxes out at ~40-50g per meal; distributed intake triggers more total synthesis.

**Action**: "How should I distribute protein across meals?"

---

## Strength Imbalances

These detect asymmetries in the user's fitness test profile that may indicate injury risk or training gaps.

### #53 -- `push_pull_imbalance`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | attention |
| **Data needed** | `ctx.metrics.strengthData.tests` (bench_1rm or pushup AND pullup or dead_hang, with percentiles) |
| **Goal filter** | None |

**Detection logic**: Groups tests into push (bench_1rm or pushup) and pull (pullup or dead_hang). Compares their percentiles. Fires when the gap between push and pull percentiles is >= 25 points.

**Headline**: "Push/pull strength imbalance"

**Body**: "{strong lift} is at the {strongPctl}th percentile but {weak lift} is only {weakPctl}th. A {gap}-point gap between push and pull increases shoulder injury risk. Prioritize {weak lift} training to close the gap."

**Action**: "How do I fix a push/pull strength imbalance?"

---

### #54 -- `cardio_strength_balance`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | neutral (base), dynamically set to `attention` via template |
| **Data needed** | `ctx.metrics.vo2max`, `ctx.metrics.strengthData.avgPercentile` |
| **Goal filter** | None |

**Detection logic**: Scores VO2 max via `scoreVO2()` and reads strength average percentile. Fires when the gap between the two scores is >= 25 points.

**Headline variants**:
- *Cardio weak*: "Strong but aerobically underdeveloped"
- *Strength weak*: "Good cardio but strength lagging"

**Body (cardio weak)**: "Your strength is at the {strScore}th percentile but VO2 max is only {vo2Score}th -- a {gap}-point gap. VO2 max is the single strongest predictor of all-cause mortality. Adding 2-3 cardio sessions per week would dramatically improve your longevity profile without sacrificing strength."

**Body (strength weak)**: "Your VO2 max is at the {vo2Score}th percentile but strength is only {strScore}th -- a {gap}-point gap. Muscle mass and strength independently predict longevity. Adding 2-3 resistance training sessions per week would balance your fitness profile."

**Action (cardio weak)**: "How can I improve cardio without losing strength?"
**Action (strength weak)**: "How can I build strength without losing cardio fitness?"

---

## Additional Micronutrient Rules

These extend the nutrition correlations with additional micronutrient checks and absorption interactions. All require 5+ meals logged in the past 7 days.

### #55 -- `b12_deficiency`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | attention |
| **Data needed** | `ctx.meals` (7-day, micronutrients via `getMicroTotalsFromMeals()`) |
| **Goal filter** | None |

**Detection logic**: Calculates daily Vitamin B12 average from recent meals (requires 5+ meals in 7 days). Fires when daily B12 < 2.0 mcg (~83% of 2.4 mcg RDA).

**Headline**: "Vitamin B12 intake is low"

**Body**: "You're averaging {daily} mcg B12/day ({pctRda}% of RDA). B12 is essential for energy production, nerve function, and red blood cell formation. Deficiency causes fatigue, weakness, and cognitive issues. Found primarily in animal products -- vegetarians and vegans are especially at risk. Supplementation is cheap and effective."

**Research**: B12 deficiency causes fatigue, weakness, and cognitive issues; vegetarians and vegans are at highest risk.

**Action**: "Should I supplement vitamin B12?"

---

### #56 -- `iron_vitamin_c_synergy`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | neutral (base), dynamically set to `attention` via template |
| **Data needed** | `ctx.meals` (7-day, micronutrients: Iron, Vitamin C), `ctx.profile.sex` |
| **Goal filter** | None |

**Detection logic**: Calculates daily iron and vitamin C averages. Uses sex-specific iron RDA (18mg female, 8mg male). Fires when iron < 70% of RDA AND vitamin C < 60mg.

**Headline**: "Low iron + low vitamin C impairs absorption"

**Body**: "You're averaging {iron}mg iron/day (RDA: {ironRda}mg) and only {vitC}mg vitamin C. Vitamin C increases non-heme iron absorption by 2-3x -- pairing iron-rich foods with citrus, peppers, or tomatoes is one of the simplest nutritional optimizations you can make."

**Research**: Vitamin C increases non-heme iron absorption by 2-3x.

**Action**: "How can I improve my iron absorption?"

---

### #57 -- `calcium_iron_conflict`

| Field | Value |
|-------|-------|
| **Domain** | nutrition |
| **Severity** | neutral |
| **Data needed** | `ctx.meals` (7-day, micronutrients: Iron, Calcium), `ctx.profile.sex` |
| **Goal filter** | None |

**Detection logic**: Calculates daily iron and calcium averages. Uses sex-specific iron RDA. Fires when iron < 60% of RDA AND calcium >= 800mg (suggesting calcium may be inhibiting iron absorption).

**Headline**: "Calcium may be blocking iron absorption"

**Body**: "Your iron intake is only {iron}mg/day (RDA: {ironRda}mg) while calcium is {calcium}mg/day. Calcium inhibits iron absorption when consumed together. Try separating calcium-rich foods (dairy, supplements) from iron-rich meals by 2+ hours."

**Research**: Calcium inhibits non-heme iron absorption when consumed together.

**Action**: "How do calcium and iron interact in my diet?"

---

## Doctor-Level Escalation Rules

These fire at `alert` severity for combinations of markers that warrant medical evaluation. They are designed to surface serious patterns the user should discuss with a physician.

### #58 -- `see_doctor_crp_weight_loss`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | alert |
| **Data needed** | `ctx.metrics.bloodwork.crp`, `weightEntries` (global, 30-day trend via `computeMetricTrend()`), `ctx.profile.current_weight_kg`, `ctx.profile.primary_goal` |
| **Goal filter** | Inverse: does NOT fire if goal includes `weight` (intentional weight loss is excluded) |

**Detection logic**: Fires when CRP > 3 mg/L AND weight is trending down AND monthly weight loss exceeds 3% of body weight AND user does NOT have a weight loss goal.

**Headline**: "Talk to your doctor: high inflammation + unexplained weight loss"

**Body**: "Your CRP is {crp} mg/L (significantly elevated) and you've lost ~{monthlyLoss} kg ({pctLoss}%) this month without a weight loss goal. This combination warrants medical evaluation -- please discuss with your doctor."

**Action**: "What could cause high CRP with unexplained weight loss?"

---

### #59 -- `see_doctor_glucose_spike`

| Field | Value |
|-------|-------|
| **Domain** | cross |
| **Severity** | alert |
| **Data needed** | `ctx.metrics.bloodwork.glucose`, `ctx.metrics.bloodwork.hba1c` |
| **Goal filter** | None |

**Detection logic**: Fires when fasting glucose >= 126 mg/dL OR HbA1c >= 6.5% (diabetic thresholds per ADA criteria).

**Headline**: "Talk to your doctor: {marker} in diabetic range"

**Body**: "Your {marker} of {value} is at or above {threshold}. This needs medical evaluation -- schedule an appointment with your doctor to discuss next steps."

**Action**: "What does a diabetic-range blood sugar result mean?"

---

### #60 -- `see_doctor_rhr_extreme`

| Field | Value |
|-------|-------|
| **Domain** | heart |
| **Severity** | alert |
| **Data needed** | `ctx.metrics.hr`, `ctx.metrics.vo2max` (optional, used to exclude elite athletes from bradycardia flag) |
| **Goal filter** | None |

**Detection logic**: Two trigger conditions:
- Tachycardia: resting HR >= 100 bpm
- Bradycardia: resting HR <= 40 bpm AND VO2 max is NOT >= 50 (excludes elite athletes whose low HR is normal)

**Headline**: "Talk to your doctor: {condition}"

**Body**: "Your resting heart rate of {hr} bpm may indicate {condition}. While this can have benign causes, it warrants medical evaluation -- especially if you experience dizziness, fatigue, or shortness of breath."

**Action**: "What causes an abnormal resting heart rate?"

---

## Strength-to-Bodyweight Ratios

### #61 -- `strength_bodyweight_ratio`

| Field | Value |
|-------|-------|
| **Domain** | strength |
| **Severity** | positive (base), dynamically set to `neutral` via template |
| **Data needed** | `ctx.metrics.strengthData.tests` (bench_1rm, squat_1rm, deadlift_1rm), `ctx.profile.current_weight_kg` |
| **Goal filter** | `strength` (via `goalIncludes()`) |

**Detection logic**: Converts body weight to lbs. For each available big-3 lift (bench, squat, deadlift), calculates the ratio of lift weight to body weight. Classifies each ratio against standard thresholds:

| Lift | Beginner | Novice | Intermediate | Advanced |
|------|----------|--------|--------------|----------|
| Bench | < 0.75x | 0.75-1.0x | 1.0-1.25x | >= 1.5x |
| Squat | < 1.0x | 1.0-1.25x | 1.25-1.5x | >= 2.0x |
| Deadlift | < 1.0x | 1.0-1.5x | 1.5-2.0x | >= 2.5x |

Fires when at least one lift has data.

**Headline**: "Strength-to-bodyweight ratios at {weightLbs} lbs"

**Body**: "{Bench: X lbs (Y.Yx bodyweight, level). Squat: ...}. These ratios are more meaningful than raw numbers -- they normalize for body size and are how strength standards are measured."

**Action**: "What are good strength-to-bodyweight ratios for my level?"

---

## Summary Table

| # | Rule ID | Domain | Default Severity | Goal Filter | Key Data Sources |
|---|---------|--------|-----------------|-------------|-----------------|
| 1 | `hr_threshold_crossed` | heart | attention | -- | HR, VA history |
| 2 | `weight_threshold_crossed` | weight | attention | -- | Weight score, VA history |
| 3 | `bloodwork_flagged` | bloodwork | alert | -- | Bloodwork panel |
| 4 | `sleep_debt_high` | sleep | attention | -- (adapts body) | Sleep debt, goal |
| 5 | `hr_trend` | heart | positive/attention | -- | HR samples (7d) |
| 6 | `sleep_trend` | sleep | positive/attention | -- | Sleep trend |
| 7 | `weight_trend` | weight | neutral | -- | Weight entries (14d) |
| 8 | `steps_trend` | heart | positive/attention | -- | Step count (7d vs 14d) |
| 9 | `protein_deficit` | nutrition | attention | strength, weight | Meals, macro targets |
| 10 | `protein_on_track` | nutrition | positive | strength, weight | Meals, macro targets |
| 11 | `lift_pr` | strength | positive | strength | Fitness tests |
| 12 | `lift_stall` | strength | attention | strength | Fitness tests, meals |
| 13 | `recovery_readiness` | cross | attention/positive | strength, cardio | Sleep debt, HR trend |
| 14 | `domain_incomplete` | strength | neutral | strength | Strength domains |
| 15 | `training_stale` | strength | attention | strength | Timestamp |
| 16 | `calorie_surplus` | nutrition | attention | weight | Meals, calorie target |
| 17 | `vo2_deep_sleep` | cross | positive/attention | -- | VO2 max, deep sleep % |
| 18 | `sleep_rhr_correlation` | cross | attention | -- | Sleep avg, HR |
| 19 | `steps_sleep_efficiency` | cross | positive/attention | -- | Steps, sleep efficiency |
| 20 | `grip_strength_longevity` | cross | positive/attention | -- | Grip strength test |
| 21 | `pushup_cardiovascular` | cross | positive/neutral/attention | -- | Pushup test |
| 22 | `vo2_rhr_consistency` | cross | neutral/positive/attention | -- | VO2 max, HR |
| 23 | `sleep_glucose` | cross | attention | -- | Sleep avg, glucose/HbA1c |
| 24 | `sleep_weight_gain` | cross | attention | -- | Sleep avg, weight trend |
| 25 | `activity_triglycerides` | cross | attention | -- | Steps, triglycerides |
| 26 | `vo2_hdl` | cross | positive/attention | -- | VO2 max, HDL |
| 27 | `strength_crp` | cross | positive/attention | -- | Strength pctl, CRP |
| 28 | `weight_rhr` | cross | attention | -- | BMI, HR |
| 29 | `protein_sleep_quality` | cross | neutral/positive/attention | -- | Meals (protein/kg), deep sleep % |
| 30 | `activity_glucose` | cross | attention | -- | Steps, glucose |
| 31 | `overtraining_signal` | cross | alert | -- | HR trend, steps, sleep |
| 32 | `sleep_strength_performance` | cross | attention | strength | Sleep avg, lift history |
| 33 | `weight_hba1c` | cross | attention | -- | HbA1c, weight trend |
| 34 | `recovery_compound` | cross | positive/neutral | -- | Sleep eff, HR, protein |
| 35 | `magnesium_sleep` | cross | attention | -- | Meals (Mg), sleep |
| 36 | `fiber_cholesterol` | cross | attention | -- | Meals (fiber), LDL |
| 37 | `omega3_triglycerides` | cross | attention | -- | Meals (omega-3), triglycerides |
| 38 | `omega3_inflammation` | cross | attention | -- | Meals (omega-3), CRP |
| 39 | `saturated_fat_ldl` | cross | attention | -- | Meals (sat fat), LDL |
| 40 | `vitamin_d_status` | cross | attention | -- (adapts body) | Meals (vit D), goal |
| 41 | `iron_energy` | cross | attention | -- | Meals (iron), sex, VO2 |
| 42 | `zinc_recovery` | cross | attention | strength | Meals (zinc) |
| 43 | `sodium_potassium_ratio` | nutrition | attention | -- | Meals (Na, K) |
| 44 | `leucine_muscle_synthesis` | cross | neutral/positive/attention | strength | Meals (leucine) |
| 45 | `late_eating_sleep` | cross | attention | -- | Meals (timing), bedtime |
| 46 | `high_carb_glucose` | cross | attention | -- | Meals (carbs), glucose/HbA1c |
| 47 | `calorie_weight_discrepancy` | cross | neutral | -- | Meals (calories), weight trend |
| 48 | `calcium_bone_strength` | nutrition | attention | -- | Meals (Ca, vit D) |
| 49 | `family_diabetes_glucose` | cross | attention | -- | Family history, glucose/HbA1c |
| 50 | `family_heart_disease_risk` | cross | attention/alert | -- | Family history, LDL/HDL/trig/CRP/HR |
| 51 | `family_cholesterol_ldl` | cross | attention | -- | Family history (cholesterol), LDL |
| 52 | `protein_distribution` | nutrition | attention | strength, weight | Meals (per-meal protein) |
| 53 | `push_pull_imbalance` | strength | attention | -- | Strength tests (push vs pull percentiles) |
| 54 | `cardio_strength_balance` | cross | neutral/attention | -- | VO2 max score, strength percentile |
| 55 | `b12_deficiency` | nutrition | attention | -- | Meals (Vitamin B12) |
| 56 | `iron_vitamin_c_synergy` | nutrition | neutral/attention | -- | Meals (iron, Vitamin C), sex |
| 57 | `calcium_iron_conflict` | nutrition | neutral | -- | Meals (iron, calcium), sex |
| 58 | `see_doctor_crp_weight_loss` | cross | alert | NOT weight | CRP, weight trend, goal |
| 59 | `see_doctor_glucose_spike` | cross | alert | -- | Glucose, HbA1c |
| 60 | `see_doctor_rhr_extreme` | heart | alert | -- | HR, VO2 max (optional) |
| 61 | `strength_bodyweight_ratio` | strength | positive/neutral | strength | Strength tests (big 3), body weight |

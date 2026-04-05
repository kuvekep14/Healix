# Insight Rules Reference

Complete reference for the deterministic insight rules engine in HealthBite (`src/services/insights/rules/`). These rules run client-side against the user's health context and surface prioritized insights sorted by severity (`alert > attention > positive > neutral`).

**Total active rules: 72**

Last updated: 2026-04-02

---

## Heart (7 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `hr_threshold_crossed` | attention | Resting HR score crossed between tiers (good/fair/low) compared to previous VA entry | Review recent activity (if improved) or check sleep/stress (if dropped) |
| `hr_trend` | neutral | Resting HR score trending up or down by 5+ points over recent VA history entries | Maintain routine (if improving) or prioritize rest and hydration (if worsening) |
| `hrv_trend` | neutral | HRV trend changes (stub -- HRV not yet available in processedMetrics) | -- |
| `hrv_low_baseline` | attention | Low HRV baseline (stub -- HRV not yet available in processedMetrics) | -- |
| `see_doctor_rhr_extreme` | alert | Resting HR >= 100 bpm (tachycardia) or <= 40 bpm without elite VO2 max (bradycardia) | Speak with a healthcare provider |
| `achievement_rhr_elite` | positive | Resting HR <= 55 bpm, indicating athlete-level cardiovascular conditioning | Keep training consistently |
| `wellness_rhr_elevated` | attention | Goal includes "feel", resting HR > 75 bpm, and steps < 12,000 | Add a short walk or light cardio session |

## Sleep (11 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `sleep_debt_high` | attention | Sleep debt exceeds 7 hours | Aim for an extra 30-60 min of sleep each night |
| `sleep_trend` | neutral | Sleep duration trending up or down vs. previous week | Maintain bedtime routine (if improving) or set wind-down alarm (if declining) |
| `achievement_sleep_consistency` | positive | Avg sleep >= 7h, efficiency >= 85%, and debt <= 3h | Keep doing what you're doing |
| `win_sleep_efficiency_high` | positive | Sleep efficiency >= 85% with avg sleep >= 7h | Maintain current sleep environment and habits |
| `sleep_efficiency_focus` | attention | Sleep efficiency below 85% | Try CBT-I techniques (stimulus control, sleep restriction) |
| `sleep_deep_pct_low` | attention | Deep sleep percentage below 13% | Improve deep sleep (linked to all-cause mortality) |
| `sleep_deep_pct_good` | positive | Deep sleep percentage at or above 15% | Maintain good deep sleep habits |
| `sleep_rem_pct_low` | attention | REM sleep percentage below 18% | Reduce alcohol, extend sleep duration to protect REM |
| `sleep_rem_pct_good` | positive | REM sleep percentage at or above 20% | Continue current habits for brain health |
| `sleep_bedtime_consistency` | attention | Bedtime consistency variance (stub -- needs raw bedtime samples; only checks sleep goal) | Keep bedtime within a 30-minute window |
| `wellness_sleep_foundation` | attention | Goal includes "feel" and avg sleep < 6.5h | Prioritize an earlier bedtime |

## Weight (3 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `weight_threshold_crossed` | attention | Weight score crossed between tiers (good/fair/low) compared to previous VA entry | Stay consistent (if improved) or review nutrition/activity (if dropped) |
| `weight_trend` | neutral | Weight trend direction (stub -- needs weight log history) | -- |
| `achievement_weight_goal_progress` | positive | Progress toward weight goal (stub -- needs weight log history) | -- |

## Nutrition (15 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `protein_deficit` | attention | Strength/weight goal set, protein intake < 80% of 1.6 g/kg target on most days | Add high-protein snack or increase portion sizes |
| `protein_on_track` | positive | Strength/weight goal set, protein intake meets 80%+ of 1.6 g/kg target consistently | Keep it up |
| `calorie_surplus` | attention | Weight goal set, calories exceed estimated maintenance by 10%+ on 3+ of last 7 days | Review portion sizes and high-calorie items |
| `protein_distribution` | attention | Strength/weight goal, > 60% of daily protein concentrated in one meal | Spread protein across meals (20-30g per meal) |
| `sodium_potassium_ratio` | attention | Sodium > 2,500 mg/day, potassium < 3,500 mg/day, and Na:K ratio > 1.5 | Add potassium-rich foods (bananas, sweet potatoes, spinach) |
| `calcium_bone_strength` | attention | Daily calcium intake below 800 mg | Add dairy, fortified plant milks, or leafy greens |
| `b12_deficiency` | attention | Daily vitamin B12 intake below 2.0 mcg | Include animal products, fortified cereals, or B12 supplement |
| `iron_vitamin_c_synergy` | attention | Both daily iron (< 18 mg) and vitamin C (< 90 mg) are below recommended levels | Pair iron-rich foods with vitamin C sources |
| `calcium_iron_conflict` | neutral | Iron intake below 18 mg/day while calcium is adequate (> 800 mg), suggesting absorption conflict | Separate calcium-rich and iron-rich foods into different meals |
| `energy_balance_daily` | neutral | Daily energy balance (stub -- needs basal/active energy data) | -- |
| `energy_balance_weekly` | neutral | Weekly energy balance (stub -- needs basal/active energy data) | -- |
| `deficit_too_aggressive` | attention | Calorie deficit too aggressive (stub -- needs basal/active energy data) | -- |
| `energy_deficiency_triad` | attention | Goal includes "feel" and 2+ of Iron/B12/Vitamin D are below RDA | Focus on nutrient-dense whole foods or discuss supplementation |
| `wellness_nutrition_completeness` | attention | Goal includes "feel" and 3+ key micronutrients below 60% of RDA | Increase meal variety -- colorful fruits, vegetables, whole grains |
| `win_meal_logging_consistency` | positive | Meals logged on 5+ of the last 7 days | Keep the logging streak going |

## Strength (8 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `lift_pr` | positive | New personal record on one or more lifts (latest > previous) | Log next session to keep tracking progress |
| `lift_stall` | attention | Lift(s) plateaued for 4+ weeks with no improvement; checks protein context | Increase protein (if low) and adjust training program |
| `domain_incomplete` | neutral | Strength goal set but not all 6 fitness domains tested (Upper Push/Pull, Lower, Carry/Grip, Core, Aerobic) | Add a test in a missing domain |
| `training_stale` | attention | Strength goal set but last fitness test was 21+ days ago | Schedule a fitness test this week |
| `push_pull_imbalance` | attention | Push vs. pull average percentile gap >= 25 points | Prioritize the weaker movement pattern |
| `strength_bodyweight_ratio` | neutral | Strength goal set and bodyweight available; classifies bench/squat/deadlift ratios as beginner/novice/intermediate/advanced | Use levels to set progressive training targets |
| `achievement_strength_progress` | positive | 10%+ improvement on any lift from first to latest test | Document what's working to replicate it |
| `achievement_all_domains` | positive | All 6 fitness domains have at least one test logged | Re-test periodically to track changes |

## Bloodwork (3 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `bloodwork_flagged` | attention | One or more biomarkers significantly outside optimal range (< 70% of min or > 150% of max) | Discuss results with healthcare provider |
| `see_doctor_crp_weight_loss` | alert | Elevated CRP with unexplained weight loss (stub -- needs weight log history) | -- |
| `see_doctor_glucose_spike` | alert | Fasting glucose >= 126 mg/dL or HbA1c >= 6.5% (diabetic range) | Schedule appointment with healthcare provider ASAP |

## Cross-Domain (38 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `vo2_deep_sleep` | positive | VO2 max and deep sleep data both present; checks if deep sleep >= 15% (good) or below target | Improve cardio to boost deep sleep (if low) or maintain (if good) |
| `sleep_rhr_correlation` | attention | Avg sleep < 6h and resting HR > 72 bpm | Improve sleep to 7+ hours to lower resting HR |
| `steps_sleep_efficiency` | positive | Steps < 4,000 with efficiency < 82% (bad combo) or steps >= 7,000 with efficiency >= 88% (good combo) | Increase daily movement to improve sleep quality |
| `grip_strength_longevity` | positive | Grip strength or dead hang test present; contextualizes with Lancet 140k-person longevity study | Maintain grip strength (if >= 50th pctl) or train dead hangs/farmer's walks (if below) |
| `pushup_cardiovascular` | positive | Pushup test logged; contextualizes with Harvard cardiovascular study (40+ pushup threshold) | Build toward 40+ pushups for heart health protection |
| `vo2_rhr_consistency` | neutral | Both VO2 max and resting HR present; flags mismatch (high fitness + high HR or low fitness + low HR) | Investigate stress/dehydration/overtraining (if mismatched) |
| `sleep_glucose` | attention | Avg sleep < 6.5h with fasting glucose > 100 or HbA1c > 5.6% | Improve sleep to 7+ hours for insulin sensitivity |
| `sleep_weight_gain` | attention | Sleep + weight gain correlation (stub -- needs weight entries) | -- |
| `activity_triglycerides` | attention | Triglycerides > 150 mg/dL with any step count; flags low activity (< 6,000 steps) | Increase steps to 8,000+ to lower triglycerides by 10-20% |
| `vo2_hdl` | positive | VO2 max and HDL both present; flags low HDL (< 40 mg/dL) or celebrates alignment | Improve aerobic fitness to raise HDL (if low) |
| `strength_crp` | positive | Both CRP and strength percentile available; evaluates muscle's anti-inflammatory role | Train consistently to lower CRP through myokine release |
| `weight_rhr` | attention | BMI >= 25 and resting HR > 72 bpm | Reduce BMI to lower resting HR (~1.3 bpm per BMI point) |
| `protein_sleep_quality` | neutral | Protein per kg and deep sleep % both available; flags correlation (both low or both good) | Increase protein above 1.2 g/kg/day to support deep sleep via tryptophan |
| `activity_glucose` | attention | Fasting glucose > 100 mg/dL with any step count; flags low activity | Walk 10-15 min after meals to reduce glucose spikes by 20-30% |
| `overtraining_signal` | alert | 2+ of: resting HR > 75, steps > 10,000, avg sleep < 6h | Take 2-3 days of active recovery or deload |
| `sleep_strength_performance` | attention | Strength goal, avg sleep < 6.5h, and lifts have stalled | Prioritize 7+ hours of sleep to break the plateau |
| `weight_hba1c` | attention | Weight gain + HbA1c correlation (stub -- needs weight entries) | -- |
| `recovery_compound` | positive | 2+ of 3 recovery pillars met: sleep efficiency >= 85%, resting HR <= 65, protein >= 80% of target | Focus on the weakest recovery pillar |
| `magnesium_sleep` | attention | Daily magnesium < 70% of 400 mg RDA, with sleep issues or sleep goal | Consider magnesium supplementation (500 mg) for sleep |
| `fiber_cholesterol` | attention | Daily fiber < 25g and LDL > 100 mg/dL | Increase fiber by 5-10g to lower LDL by 5-10 mg/dL |
| `omega3_triglycerides` | attention | Daily omega-3 < 1.5g and triglycerides > 150 mg/dL | Eat 2-3 servings of fatty fish per week or supplement EPA/DHA |
| `omega3_inflammation` | attention | Daily omega-3 < 1.5g and CRP > 1 mg/L | Add fatty fish, walnuts, and flaxseed for anti-inflammatory omega-3s |
| `saturated_fat_ldl` | attention | Daily saturated fat > 15g and LDL > 100 mg/dL | Replace saturated fat with unsaturated sources (olive oil, nuts, avocado) |
| `vitamin_d_status` | neutral | Daily vitamin D < 15 mcg (600 IU); contextualizes with strength goal if present | Supplement 1,000-2,000 IU/day, especially in winter |
| `iron_energy` | attention | Daily iron < 60% of sex-adjusted RDA (18 mg female, 8 mg male); flags low VO2 if present | Eat iron-rich foods (red meat, spinach, lentils) |
| `zinc_recovery` | attention | Strength goal set and daily zinc < 8 mg | Eat zinc-rich foods (red meat, oysters, pumpkin seeds, legumes) |
| `late_eating_sleep` | attention | 2-3+ days with meals after 9 PM this week, with sleep data present | Finish last meal 3+ hours before bed |
| `high_carb_glucose` | attention | Daily carbs > 250g with fasting glucose > 100 or HbA1c > 5.6% | Swap refined carbs for complex sources (whole grains, vegetables, legumes) |
| `calorie_weight_discrepancy` | neutral | Calorie intake vs. weight discrepancy (stub -- needs weight entries) | -- |
| `energy_predicted_vs_actual_weight` | attention | Energy predicted vs. actual weight (stub -- needs weight entries) | -- |
| `strength_in_deficit_warning` | attention | Strength training in calorie deficit (stub -- needs energy balance) | -- |
| `sleep_caffeine_proxy` | attention | Sleep goal, efficiency < 85%, and caffeine keywords detected in afternoon/evening meals | Cut caffeine by noon for two weeks |
| `sleep_activity_connection` | attention | Sleep goal, steps < 5,000, and poor sleep (efficiency < 85% or avg < 6.5h) | Add a daily walk -- most accessible sleep intervention |
| `sleep_alcohol_proxy` | attention | Sleep goal, poor REM (< 18%) or efficiency (< 85%), and alcohol keywords detected in meals | Track alcohol-free nights vs. drinking nights to see the difference |
| `cardio_strength_balance` | neutral | VO2 score and strength percentile both present with a gap >= 25 points | Add cardio (if strength-dominant) or resistance training (if cardio-dominant) |
| `wellness_vitality_trend` | neutral | Goal includes "feel", 7+ VA history entries, and vitality age changed by 0.3+ years | Check which health drivers improved most (if improving) or focus on sleep/steps/protein (if declining) |
| `wellness_inflammation` | attention | Goal includes "feel", CRP > 1.5, and 1+ lifestyle flags (poor sleep, low activity, high BMI) | Fix the biggest lifestyle gap first -- each factor reduces CRP by 20-30% |
| `wellness_activity_baseline` | attention | Goal includes "feel" and steps < 5,000/day | Get to 7,000 steps -- each additional 1,000 reduces mortality by 15% |

## Unlock (6 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `unlock_bloodwork` | neutral | No bloodwork uploaded but has wearable data (HR, sleep, or steps) | Upload bloodwork in the Documents tab |
| `unlock_meals` | neutral | Fewer than 5 meals logged but has wearable data (HR or sleep) | Log meals to unlock nutrition insights |
| `unlock_strength` | neutral | No strength data and goal includes "strength" | Add a fitness test in the Strength tab |
| `unlock_sleep` | neutral | No sleep data but has HR data | Connect a sleep-tracking wearable in Settings |
| `unlock_vo2` | neutral | No VO2 max data but has strength or bloodwork data | Sync VO2 max from wearable or enter manually |
| `unlock_family_history` | neutral | No family history on profile but has bloodwork data | Add family history in Settings |

## Achievement (3 rules)

| Rule ID | Severity | What it detects | Recommendation |
|---------|----------|----------------|----------------|
| `achievement_va_improved` | positive | 7+ VA history entries and vitality age improved by 1+ year since first entry | Keep the momentum going |
| `achievement_composite_80` | positive | Composite health score >= 80/100 | Review individual scores to push further |
| `win_vitality_improving` | positive | 5+ VA history entries and vitality age improved by 0.5+ years over recent check-ins | Check which health drivers improved the most |

---

## Summary by Domain

| Domain | Active Rules | Alert | Attention | Positive | Neutral |
|--------|-------------|-------|-----------|----------|---------|
| Heart | 7 | 1 | 3 | 1 | 2 |
| Sleep | 11 | 0 | 5 | 4 | 2 |
| Weight | 3 | 0 | 1 | 1 | 1 |
| Nutrition | 15 | 0 | 9 | 2 | 4 |
| Strength | 8 | 0 | 3 | 3 | 2 |
| Bloodwork | 3 | 2 | 1 | 0 | 0 |
| Cross-Domain | 38 | 1 | 22 | 5 | 10 |
| Unlock | 6 | 0 | 0 | 0 | 6 |
| Achievement | 3 | 0 | 0 | 3 | 0 |
| **Total** | **94** | **4** | **44** | **19** | **27** |

**Note on active vs. functional:** All 94 rules are in the export arrays and will be evaluated. However, 12 rules are **stubs** that always return `null` because they depend on data not yet available in the mobile context (HRV data, weight log history, energy balance data). These are:

- `hrv_trend`, `hrv_low_baseline` (need HRV data)
- `weight_trend`, `achievement_weight_goal_progress` (need weight log history)
- `sleep_bedtime_consistency` (needs raw bedtime samples)
- `energy_balance_daily`, `energy_balance_weekly`, `deficit_too_aggressive` (need basal/active energy data)
- `see_doctor_crp_weight_loss` (needs weight log history)
- `sleep_weight_gain`, `weight_hba1c` (need weight entries)
- `calorie_weight_discrepancy`, `energy_predicted_vs_actual_weight`, `strength_in_deficit_warning` (need weight/energy data)

**Functional rules that can actually fire: 79**

## Excluded Rules (defined but not exported)

Three family history rules are defined in `crossDomainRules.ts` but intentionally excluded from the export array:

- `family_diabetes_glucose` -- Family diabetes history + borderline glucose
- `family_heart_disease_risk` -- Family heart disease + borderline cardiovascular markers
- `family_cholesterol_ldl` -- Family cholesterol history + elevated LDL

Reason: "low-value, states the obvious, already covered by doctors in regular visits."

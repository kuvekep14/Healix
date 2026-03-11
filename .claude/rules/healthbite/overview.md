# HealthBite — Shared Backend Context

Healix is an extension of HealthBite. They share the same Supabase project, database, auth users, and edge functions. Data created in either app is visible in both.

## What is HealthBite?

React Native (Expo 52) mobile app that syncs Apple HealthKit data, logs meals, tracks supplements, and provides AI-powered health chat. It is the **primary data source** — most data in the shared database originates from HealthBite.

## Shared Infrastructure

| Resource | Details |
|----------|---------|
| **Supabase project** | Same prod/dev/local instances |
| **Auth** | Same `auth.users` — login in either app works |
| **Database** | Same tables, same RLS policies |
| **Edge functions** | Same functions called by both apps |
| **Storage** | Same Supabase storage buckets (documents) |

## Key Principle

HealthBite is the **source of truth** for:
- Database schema and migrations (`~/Projects/healthbite/supabase/migrations/`)
- Edge function implementations (`~/Projects/healthbite/supabase/functions/`)
- HealthKit data sync logic (what gets written to `apple_health_samples`)
- Meal analysis pipeline (how `meal_log` and `meal_nutrient` rows are created)
- Blood work extraction (how `blood_work_samples` rows are created)

When adding features to Healix that read shared data, **always check HealthBite's code first** to understand the data shape and conventions.

## HealthBite Source Locations

| What | Path |
|------|------|
| Migrations | `~/Projects/healthbite/supabase/migrations/` |
| Edge functions | `~/Projects/healthbite/supabase/functions/` |
| HealthKit sync | `~/Projects/healthbite/src/lib/rn-healthkit.ts` |
| Health data store | `~/Projects/healthbite/src/hooks/useAppleHealthDataStore.ts` |
| Meal analysis | `~/Projects/healthbite/src/services/meals/` |
| Document processing | `~/Projects/healthbite/src/services/documents/documentService.ts` |
| Chat v2 | `~/Projects/healthbite/src/hooks/useChatV2.ts` |
| Type definitions | `~/Projects/healthbite/src/types/` |

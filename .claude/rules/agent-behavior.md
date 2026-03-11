# Agent Behavior

## Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or changes across multiple files)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building

## Simplicity First

- This is a static site — keep it simple. No build tools, no npm, no bundlers.
- Prefer inline changes over introducing new abstractions
- `dashboard.js` is intentionally a single file — don't split it unless explicitly asked

## Verification Before Done

- Test changes by opening in browser — verify visually
- Check that CSP headers allow any new external connections
- Ensure `config.js` globals are used instead of hardcoded URLs
- If modifying HTML, verify the page still loads without JS errors

## Shared Backend Awareness

- Healix shares its Supabase database with HealthBite (mobile app)
- Schema changes must be coordinated — don't modify tables without considering HealthBite impact
- Migrations live in the HealthBite project (`~/Projects/healthbite/supabase/migrations/`)

## Core Principles

- **No Laziness**: Find root causes. No temporary fixes.
- **Minimal Impact**: Changes should only touch what's necessary.
- **No Over-Engineering**: This is a static site. Keep it that way.

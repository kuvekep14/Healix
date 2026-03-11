---
name: reviewing-code
description: Reviews code/changes for convention compliance and fixes violations with user confirmation. Use for code quality checks, linting, verifying standards, or when user mentions "review", "analyze", "check", "critique", "evaluate", "assess", or asks for feedback on code/changes.
---

# Reviewing Code

Review code for convention compliance. Fix violations with user confirmation.

## Principles

- **Fix, don't track** — Find violations and fix immediately (with confirmation)
- **Trust auto-loaded rules** — Conventions load automatically via `.claude/rules/` based on file paths.
- **Convention-first** — If a rule seems wrong, suggest updating the convention

## Workflow

1. **Clarify scope** (if ambiguous): recent commits, staged changes, specific files/dirs
2. **Read the code**: Read files in scope.
3. **Identify violations**: Compare code against loaded rules and CLAUDE.md conventions.
4. **Present violations**: Use `AskUserQuestion` with Fix/Skip/Bad-rule options. Batch similar violations.
5. **Apply fixes**: After user confirmation, fix immediately.

## Healix-Specific Checks

- Supabase client configured correctly (environment switching via `config.js`)
- No hardcoded API keys or secrets
- Proper error handling with user-friendly messages
- Clean HTML structure and semantic markup
- JavaScript uses modern ES6+ patterns
- CSS is organized and avoids !important overuse
- Data fetched from Supabase uses parameterized queries
- Environment switching works correctly (`?env=dev` query param)

## Scoping

- **"Review this file"** — Read and review the specified file
- **"Review my changes"** — Use `git diff` for unstaged, `git diff --staged` for staged
- **"Review recent work"** — Use `git log` + `git diff` against base branch
- **"Review this directory"** — Glob for files, review each

## Checklist

- [ ] Scope clarified
- [ ] Code read
- [ ] Violations identified against conventions
- [ ] Violations presented via AskUserQuestion
- [ ] User confirmed before each fix

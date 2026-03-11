# Coding Style

## JavaScript Conventions

- Vanilla JS only — no frameworks, no npm, no build tools
- Use `var` for variable declarations (existing codebase convention, ES5-compatible)
- Use `function` declarations (not arrow functions) for named functions
- Use `async/await` for async operations
- Quote strings with single quotes
- Semicolons at end of statements

## File Organization

- `dashboard.js` is the main application file — use section comments (`// ── SECTION ──`) to delimit features
- Each HTML page is self-contained with inline `<style>` and `<script>` blocks (except dashboard which uses external files)
- `config.js` is the only shared script — loaded before all others

## Naming

- `camelCase` for functions and variables
- `UPPER_SNAKE_CASE` for constants
- DOM element IDs use kebab-case: `drv-heart-val`, `sync-banner`
- CSS classes use kebab-case: `.driver-card`, `.vitality-hero`

## DOM Manipulation

- Use `document.getElementById()` for element access
- Use helper functions for common patterns:
  - `setEl(id, val)` — set textContent
  - `setHTML(id, val)` — set innerHTML
  - `escapeHtml(str)` — sanitize user content before inserting as HTML

## Error Handling

- Wrap async operations in try/catch
- Show user-friendly errors (no raw error objects)
- Always handle fetch failures gracefully
- Log errors to console with `[Category]` prefix

## Security

- NEVER hardcode secrets — use `config.js` for Supabase credentials
- Always use `escapeHtml()` when inserting user-generated content
- CSP headers must be kept in sync across all HTML files
- Validate/sanitize inputs before sending to Supabase

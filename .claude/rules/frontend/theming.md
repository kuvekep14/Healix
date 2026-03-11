# Theming

## Centralized Theme

All design tokens live in `theme.css`. Every HTML page and `dashboard.css` imports it. To change the look of Healix, edit `theme.css` — never hardcode color values in individual files.

### File: `theme.css`

Contains:
- Universal box-sizing reset (`*, *::before, *::after`)
- All CSS custom properties in `:root`

### Load Order

1. Google Fonts `<link>` (in each HTML `<head>`)
2. `<link rel="stylesheet" href="theme.css">` — must come before any page styles
3. Page-specific `<style>` block or `dashboard.css`

For `dashboard.html`, the order is: `theme.css` → `dashboard.css` (no inline styles).

## Variable Categories

### Core Palette

| Variable | Value | Usage |
|----------|-------|-------|
| `--cream` | `#F5F0E8` | Primary text |
| `--cream-dim` | `rgba(245,240,232,0.5)` | Secondary text |
| `--cream-faint` | `rgba(245,240,232,0.08)` | Subtle cream tint |
| `--dark` | `#0B0B0B` | Page background |
| `--dark-2` | `#0F0F0F` | Sidebar / secondary bg |
| `--dark-3` | `#141414` | Card backgrounds |
| `--dark-4` | `#1A1A1A` | Elevated surfaces / hover states |
| `--gold` | `#B8975A` | Brand accent |
| `--gold-light` | `#D4B483` | Accent highlight / hover |
| `--gold-faint` | `rgba(184,151,90,0.08)` | Subtle gold tint backgrounds |
| `--gold-border` | `rgba(184,151,90,0.18)` | Default border color |
| `--gold-focus` | `rgba(184,151,90,0.5)` | Input focus border |
| `--gold-glow` | `rgba(184,151,90,0.25)` | Box-shadow glow on hover |
| `--gold-hover` | `rgba(184,151,90,0.4)` | Hover border-color |
| `--muted` | `rgba(245,240,232,0.3)` | Disabled / tertiary text |
| `--neutral` | `rgba(245,240,232,0.4)` | Neutral state text |

### Status Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--up` | `#6fcf8a` | Positive / improvement / success |
| `--down` | `#e07070` | Negative / decline / error |
| `--error` | `#e07070` | Error states (alias of `--down`) |
| `--warn` | `#e0a070` | Warning / moderate risk |

### Alert Tokens

| Variable | Value | Usage |
|----------|-------|-------|
| `--error-border` | `rgba(224,112,112,0.4)` | Error alert border |
| `--error-bg` | `rgba(224,112,112,0.06)` | Error alert background |
| `--success-border` | `rgba(111,207,138,0.4)` | Success alert border |
| `--success-bg` | `rgba(111,207,138,0.06)` | Success alert background |

### Typography

| Variable | Value |
|----------|-------|
| `--F` | `'Cormorant Garamond', serif` (headings) |
| `--B` | `'DM Sans', sans-serif` (body) |

## Rules

1. **Never hardcode colors** — use `var(--*)` in CSS and `'var(--*)'` when setting `element.style` from JS.
2. **One-off decorative opacities are OK** — Decorative gradients and animation-specific `rgba()` values (e.g., background gradient at 0.04 opacity) can stay inline. Only extract to a variable if it's used in 3+ places.
3. **Page-specific layout variables** go in that page's `<style>` block, not in `theme.css`. Example: `--sidebar-w` and `--topbar-h` differ between `dashboard.css` and `chat.html`.
4. **Adding new variables** — Add to `theme.css` `:root` block. Group with related variables. Update this document.
5. **SVG attributes** don't support `var()`. Use `style="stroke: var(--gold-border)"` instead of `stroke="..."` attribute syntax when possible.

## What NOT to Put in `theme.css`

- Component styles (cards, buttons, modals) — these stay in `dashboard.css` or page inline styles
- Layout-specific variables (`--sidebar-w`, `--topbar-h`)
- Page-specific body styles (`overflow`, `display`, `grid-template-columns`)
- Google Fonts `@import` — keep the `<link>` tag in each HTML `<head>` for performance

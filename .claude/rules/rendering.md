# Rendering & UI Patterns

## HTML String Building

Healix builds UI dynamically via string concatenation + `.innerHTML`. This is the core rendering pattern — not a framework.

```javascript
var html = '';
items.forEach(function(item) {
  html += '<div class="card">';
  html += '<div class="card-title">' + escapeHtml(item.name) + '</div>';
  html += '<div class="card-value">' + Math.round(item.value) + '</div>';
  html += '</div>';
});
container.innerHTML = html;
```

### Security Rules

- **Always `escapeHtml()` user-generated content** before inserting via innerHTML
- Use `setEl(id, val)` (textContent) for simple text — it's inherently safe
- Use `setHTML(id, val)` only for trusted/computed HTML
- The markdown parser only supports `**bold**` and `\n` → `<br>` — no other HTML tags

### DOM Helpers

```javascript
setEl(id, val)          // Safe: sets textContent
setHTML(id, val)        // Sets innerHTML — sanitize first
setClass(id, cls)       // Overwrites className entirely (not classList.toggle)
escapeHtml(str)         // Strips all HTML via div.textContent trick
```

## CSS Design System

### Theme Variables (Dark Only)

```css
--cream: #F5F0E8;                      /* Primary text */
--cream-dim: rgba(245,240,232,0.5);    /* Dimmed text */
--dark: #0B0B0B;                       /* Page background */
--dark-2: #0F0F0F;                     /* Sidebar, secondary bg */
--dark-3: #141414;                     /* Card backgrounds */
--dark-4: #181818;                     /* Elevated surfaces */
--gold: #B8975A;                       /* Brand accent */
--gold-light: #D4B483;                 /* Accent highlight */
--gold-faint: rgba(184,151,90,0.08);   /* Subtle gold tint */
--gold-border: rgba(184,151,90,0.18);  /* Border color */
--muted: rgba(245,240,232,0.3);        /* Secondary/disabled text */
```

### Status Colors

```css
--up: #6fcf8a;     /* Positive / improvement */
--down: #e07070;   /* Negative / decline */
--error: #e07070;  /* Error states */
```

### Typography

- **Display/headings**: `var(--F)` = Cormorant Garamond, serif
- **Body/UI**: `var(--B)` = DM Sans, sans-serif
- **Labels**: Uppercase, letter-spacing 0.15–0.22em, font-size 10–11px
- **Values**: Regular weight, larger size (18–32px for key metrics)

### Layout Patterns

- **Page grid**: Sidebar (220px fixed) + content (flex: 1)
- **Driver cards**: `grid-template-columns: 1fr 1fr 1fr` (3-column)
- **Responsive cards**: `repeat(auto-fill, minmax(280px, 1fr))`
- **Profile forms**: 2-column grid

### Naming Conventions

- CSS classes use **kebab-case**: `.driver-card`, `.vitality-hero`, `.sync-banner`
- DOM IDs use **kebab-case**: `drv-heart-val`, `va-age`, `sync-banner-text`
- Prefix patterns:
  - `drv-` = driver card elements
  - `va-` = vitality age elements
  - `page-` = page containers

## Data Visualization

All charts are built with CSS and inline SVG — no charting libraries.

### Mini Bar Charts
CSS `height` as percentage with transition animation:

```javascript
bars.forEach(function(bar, i) {
  bar.style.height = (values[i] / max * 100) + '%';
});
```

### SVG Arc (Vitality Score Ring)
Stroke-dasharray/offset animation for the circular progress indicator:

```javascript
var circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference * (1 - score / 100);
```

### Nutrition Bars
Gradient fills with consistent colors:
- Protein: green tones
- Carbs: gold tones
- Fat: orange tones

### Sparklines
Built via SVG polyline points. **Note**: For metrics where lower is better (heart rate), the y-axis is reversed.

## Page Navigation

Single-page architecture with visibility toggling:

```javascript
function showPage(id, btn) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  // Show target
  document.getElementById('page-' + id).classList.add('active');
  // Update sidebar active state
  // Load page data lazily
}
```

## Modal System

```javascript
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
```

- Overlay with backdrop blur
- Animation: `modalIn .2s ease` (fade + slide up)
- Max width 480px, max-width 90vw for mobile
- Close on outside click via `closeModalOutside(e, id)`

## Empty States

Centered emoji + muted text, consistent across all sections:

```html
<div class="empty-state">🍽 No meals logged yet</div>
```

## Percentile Badges

Color-coded status classes for fitness test results:

| Class | Color | Meaning |
|-------|-------|---------|
| `.pct-elite` | Green | Top percentile |
| `.pct-good` | Gold | Above average |
| `.pct-avg` | Neutral | Average |
| `.pct-low` | Muted | Below average |
| `.pct-poor` | Red | Needs improvement |

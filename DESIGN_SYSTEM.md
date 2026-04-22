# Healix Design System

Single source of truth for both the mobile app and website dashboard. The landing page (index.html) has its own editorial identity and is excluded from this system.

## Fonts

**Primary font:** DM Sans (Google Fonts)

| Weight | Name | Usage |
|--------|------|-------|
| 300 | Light | Display numbers (Vitality Age, large metrics) |
| 400 | Regular | Body text, descriptions, form inputs |
| 500 | Medium | Labels, section headers, navigation items |
| 600 | SemiBold | Card titles, button text, emphasis |
| 700 | Bold | Page titles, primary headings |

**Rules:**
- No serif fonts in the product UI (Cormorant Garamond is landing page only)
- Display numbers (Vitality Age, big metrics) use weight 300 at 28px+
- Body text minimum 14px, labels minimum 12px
- Uppercase labels: 12px, medium weight, letter-spacing 1-1.5px
- Never go below 11px for any text

## Colors

### Brand

| Token | Hex | Usage |
|-------|-----|-------|
| **Brand Gold** | `#B8975A` | Vitality Age arc, logo, premium badges, section eyebrow labels |
| **Brand Gold Light** | `#D4B483` | Gold gradient endpoints, hover states |

### Interactive

| Token | Hex | Usage |
|-------|-----|-------|
| **Teal** | `#14b8a6` | Buttons, links, active nav, toggles, selected states |
| **Teal Light** | `#2DD4BF` | Dark mode teal, hover states |
| **Secondary Blue** | `#3b82f6` | Secondary actions, info states |

### Status

| Token | Hex | Usage |
|-------|-----|-------|
| **Success** | `#34d399` (app) / `#6fcf8a` (web) | Positive trends, good scores |
| **Error** | `#ef4444` (app) / `#e07070` (web) | Negative trends, alerts, errors |
| **Warning** | `#fbbf24` (app) / `#e0a070` (web) | Moderate risk, attention needed |

### Surfaces (Light Mode — App Default)

| Token | Hex | Usage |
|-------|-----|-------|
| **Background** | `#f8f8f6` | Page background (warm cream-white) |
| **Surface** | `#ffffff` | Cards, elevated elements |
| **Text Default** | `#1f2937` | Primary body text |
| **Text Secondary** | `#6b7280` | Supporting text |
| **Text Subtle** | `#9ca3af` | Placeholders, disabled text |
| **Border Subtle** | `#f3f4f6` | Faint dividers |
| **Border Default** | `#e5e7eb` | Standard borders |

### Surfaces (Dark Mode — Website Dashboard)

| Token | Hex | Usage |
|-------|-----|-------|
| **Background** | `#0B0B0B` | Page background |
| **Surface** | `#141414` | Cards |
| **Surface Elevated** | `#1A1A1A` | Hover states, elevated cards |
| **Text Default** | `#F5F0E8` | Primary text (warm cream, not pure white) |
| **Text Dim** | `rgba(245,240,232,0.65)` | Secondary text |
| **Text Muted** | `rgba(245,240,232,0.5)` | Tertiary text |
| **Border** | `rgba(184,151,90,0.18)` | Gold-tinted borders |

### Domain Colors

| Domain | Base | Background | Text |
|--------|------|------------|------|
| **Activity** | `#10b981` (emerald) | `#ecfdf5` | `#065f46` |
| **Vitals** | `#ef4444` (red) | `#fef2f2` | `#991b1b` |
| **Sleep** | `#6366f1` (indigo) | `#eef2ff` | `#3730a3` |
| **Nutrition** | `#f59e0b` (amber) | `#fffbeb` | `#92400e` |

## Icons

**Library:** FontAwesome 6 (solid variant default)

### Standard icon mappings

| Concept | Icon Name | Context |
|---------|-----------|---------|
| Home/Dashboard | `home` | Tab bar, navigation |
| Insights | `chartSimple` | Tab bar |
| Chat | `message` | Tab bar |
| Log/Add | `book` | Tab bar |
| Settings | `gear` | Header button |
| Profile | `user` | Settings, account |
| Documents | `fileLines` | Settings, document list |
| Camera | `camera` | Meal photo |
| Microphone | `microphone` | Voice input |
| Heart | `heart` | Heart rate metrics |
| Close/Dismiss | `xMark` | Modal close, card dismiss |
| Back | `chevronLeft` | Navigation back |
| Forward/Detail | `chevronRight` | List row disclosure |
| New/Add | `penToSquare` | New chat, new entry |
| History | `clock` | Chat history |
| Bell | `bell` | Notifications |
| Send | `paperPlaneTop` | Chat send |
| Lock | `lock` | Premium gate |

**Rules:**
- Use `solid` variant by default
- Size 20px for standard icons, 16px for inline/small, 22px for header actions
- Tab bar icons: 20px
- Color follows context: `textDefault` for primary, `textSecondary` for secondary, `primaryBg` (teal) for active/accent

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| xxxs | 2px | Hairline adjustments |
| xxs | 4px | Tight gaps, icon spacing |
| xs | 8px | Small gaps, button padding |
| sm | 12px | Input padding, element spacing |
| md | 16px | Standard spacing |
| lg | 24px | Card padding, section spacing |
| xl | 32px | Modal padding, major breaks |
| xxl | 40px | Large section dividers |
| xxxl | 64px | Hero margins |

**Rules:**
- Card internal padding: `lg` (24px)
- Gap between cards: `sm` (12px)
- Section gaps: `lg` (24px)
- Page horizontal padding: `md` (16px)

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tags, small chips |
| sm | 8px | Inputs, small buttons |
| md | 12px | Cards, modals |
| lg | 16px | Large cards, dashboard cards |
| xl | 20px | Feature elements |
| pill | 50px | Pill buttons, segmented controls |
| round | 9999px | Circles, avatars |

## Shadows

Cards use **no shadows** by default — visual separation comes from borders and whitespace. Shadows only for floating elements:

| Element | Shadow |
|---------|--------|
| Cards | None (borderSubtle only) |
| Floating buttons | Subtle elevation |
| Modals | Medium elevation |
| Menus/dropdowns | Medium elevation |

## Component Patterns

### Cards
- Background: `surfaceDefault`
- Border: 1px `borderSubtle`
- Radius: `lg` (16px)
- Padding: `lg` (24px)
- No shadow

### Buttons (Primary)
- Background: teal (`#14b8a6`)
- Text: white, semiBold
- Radius: `sm` (8px)
- Height: 48-50px

### Section Headers
- Uppercase text
- Weight: medium (500)
- Size: 12px
- Letter-spacing: 1-1.5px
- Color: `textDefault` (not subtle/muted)

### Metric Display Numbers
- Weight: light (300)
- Size: 28-48px depending on context
- Color: `textDefault` or `brandGold` for Vitality Age

## Platform-Specific

### Mobile App (React Native)
- Theme file: `src/theme/`
- Font package: `@expo-google-fonts/dm-sans`
- Light mode default, dark mode available
- ThemedStyle pattern for all components

### Website Dashboard
- Theme file: `theme.css` (CSS custom properties)
- Font via Google Fonts CDN `<link>` tag
- Dark mode only (for now)
- `var(--B)` = DM Sans for all product UI
- `var(--F)` = Cormorant Garamond for landing page only

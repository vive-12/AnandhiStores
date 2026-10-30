# Theme & Tokens Guide — Anandhi Stores

This document defines the official design tokens, color palettes, spacing systems, border radii, and elevation standards for Anandhi Stores.

All values are centralized in [`mobile/theme/index.ts`](../../mobile/theme/index.ts).

---

## 1. Color Palette Tokens (`Colors`)

The palette reflects fresh, natural, organic hydration and groceries with deep forest green brand anchors and warm cream surfaces.

```typescript
export const Colors = {
  // Brand Greens
  green900: '#123524', // Deep Forest Green (Primary Brand Header & Status Bar)
  green700: '#1F5B3C', // Signature Emerald (Active Tabs, Primary Buttons, Key Accents)
  green500: '#2E8B57', // Sea Green (Success alerts, delivered status, completed tasks)

  // Accents
  amber:    '#E8A33D', // Warm Gold (Placed status, CTA highlights, badges)
  coral:    '#E1604A', // Soft Coral (Cancelled status, warning pills)
  red:      '#DC2626', // Danger Crimson (Critical deletions, logout, errors)
  redLight: '#FEE2E2', // Soft Red Tint (Error banners, background tints)

  // Surfaces & Backgrounds
  cream:    '#FBF8F1', // Warm Eggshell Paper (Primary application background)
  card:     '#FFFFFF', // Pure Crisp White (Card surfaces, modals, popovers)

  // Text & Content
  ink:      '#16221B', // Deep Charcoal Ink (Headings, primary values, body)
  inkSoft:  '#5C6B62', // Muted Sage Charcoal (Secondary labels, timestamps, icons)

  // Borders & Dividers
  line:     '#E7E1D3', // Subtle Warm Gray Border (Dividers, outlines, input strokes)
} as const;
```

### Visual Palette Reference

| Color Name | Token Key | Hex Code | Visual Sample | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Forest Brand** | `Colors.green900` | `#123524` | 🟩 `[#123524]` | Screen headers, splash screen, status bar, bottom bar backgrounds |
| **Emerald Accent** | `Colors.green700` | `#1F5B3C` | 🟩 `[#1F5B3C]` | Primary buttons, active tab icons, key links, active badges |
| **Sea Green** | `Colors.green500` | `#2E8B57` | 🟩 `[#2E8B57]` | Success toasts, delivered orders, verified checkmarks |
| **Warm Gold** | `Colors.amber` | `#E8A33D` | 🟨 `[#E8A33D]` | "Placed" order state, special offers, highlighted notices |
| **Coral Red** | `Colors.coral` | `#E1604A` | 🟧 `[#E1604A]` | "Cancelled" state, attention tags |
| **Crimson** | `Colors.red` | `#DC2626` | 🟥 `[#DC2626]` | Destructive actions, stock-out alerts, error banners |
| **Warm Cream** | `Colors.cream` | `#FBF8F1` | ⬜ `[#FBF8F1]` | Main app background, scroll views |
| **Pure White** | `Colors.card` | `#FFFFFF` | ⬜ `[#FFFFFF]` | Content cards, bottom sheets, modals |
| **Deep Ink** | `Colors.ink` | `#16221B` | ⬛ `[#16221B]` | Primary headings, customer names, rupee amounts |
| **Soft Ink** | `Colors.inkSoft` | `#5C6B62` | 🔲 `[#5C6B62]` | Subtitles, phone numbers, timestamps, placeholder text |
| **Line Gray** | `Colors.line` | `#E7E1D3` | ▫️ `[#E7E1D3]` | Card outlines, row dividers, input field borders |

---

## 2. Order Lifecycle Status Colors (`StatusColors`)

Every order transition maps to a dedicated status color:

```typescript
export const StatusColors: Record<OrderStatus, string> = {
  placed:           '#E8A33D', // Amber / Pending store packing
  packed:           '#5B5BD6', // Indigo / Packed & ready for agent pickup
  out_for_delivery: '#2F80ED', // Blue / Out on road with agent
  delivered:        '#2E8B57', // Emerald Green / Completed & cash collected
  cancelled:        '#E1604A', // Coral / Order voided
};
```

These colors are automatically consumed by the [`StatusPill`](../../mobile/components/ui/StatusPill.tsx) component.

---

## 3. Spacing System (`Spacing`)

Spacing follows a consistent **4-point grid**:

```typescript
export const Spacing = {
  xs:  4,  // Micro gaps (icon-to-text, chip padding)
  sm:  8,  // Compact padding (inside list items, small buttons)
  md:  12, // Medium padding (card gap, input field internal padding)
  lg:  16, // Standard screen horizontal padding, card content padding
  xl:  24, // Major section spacing, modal separation
  xxl: 32, // Hero component margins, empty state vertical gutters
} as const;
```

### Spacing Usage Rules
* **Screen Edge Gutters**: Always use `Spacing.lg` (16px) for left and right margins of screen content.
* **Card Internal Padding**: Always use `Spacing.lg` (16px) or `Spacing.md` (12px).
* **List Row Separation**: Always use `gap: Spacing.sm` (8px) or `gap: Spacing.md` (12px).

---

## 4. Border Radii System (`Radius`)

```typescript
export const Radius = {
  sm:     8,   // Small inputs, thumbnail badges
  md:     12,  // Medium inputs, dropdown sheets
  button: 14,  // Standard interactive buttons
  card:   18,  // Content cards, summary modules
  chip:   100, // Pill badges, circular avatar wrappers, status pills
} as const;
```

---

## 5. Shadows & Elevation (`Shadow`)

For cross-platform depth (iOS `shadow*` + Android `elevation`):

```typescript
export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
```

---

## 6. Role-Based Color Guidelines

| Role | Primary Header Background | Accent Color | Visual Identity |
| :--- | :--- | :--- | :--- |
| **Customer** | `Colors.green900` | `Colors.green700` | Friendly, inviting, warm cream background, easy shopping stepper. |
| **Delivery Agent** | `Colors.green900` | `Colors.green700` | High-contrast, tactile, checklist indicators, bold swipe buttons. |
| **Store Admin** | `Colors.green900` | `Colors.amber` | Deep green navigation bar with amber highlights, KPI metric cards. |

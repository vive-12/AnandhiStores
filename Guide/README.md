# Anandhi Stores (AquaRush) — Design System & Engineering Guide

Welcome to the **Anandhi Stores Design System & Engineering Guide**. This repository houses all design tokens, typography specifications, UI primitives, and standardized screen templates used across the Customer, Delivery Agent, and Store Admin experiences.

---

## 📚 Guide Index

| Guide Document | Description | Direct Link |
| :--- | :--- | :--- |
| **Font Guide** | Complete typography breakdown, Manrope font family variants, font size scale, line heights, and usage hierarchy. | [FONT_GUIDE.md](./FONT_GUIDE.md) |
| **Theme & Tokens Guide** | Color palettes, status badges, spacing scales, border radii, card elevation shadows, and role-based themes. | [THEME_GUIDE.md](./THEME_GUIDE.md) |
| **UI Components Guide** | Comprehensive catalog of all 15 reusable UI primitives with props APIs, code snippets, and behavior guidelines. | [UI_COMPONENTS_GUIDE.md](./UI_COMPONENTS_GUIDE.md) |
| **Standard Screen Templates** | Canonical layouts, screen blueprints (Catalog, Detail, Form, Dashboard), and role-specific UI standards. | [STANDARD_SCREEN_TEMPLATES.md](./STANDARD_SCREEN_TEMPLATES.md) |

---

## 🎨 Design Philosophy & Principles

1. **Minimalist Luxury with High Readability**:
   * Uses rich organic forest greens (`#123524`, `#1F5B3C`), warm creamy paper backgrounds (`#FBF8F1`), and high-contrast deep ink text (`#16221B`).
   * Clean typography powered by Google's **Manrope** font family across 4 tuned weights (Medium 500, SemiBold 600, Bold 700, ExtraBold 800).

2. **Single Source of Truth (`mobile/theme/index.ts`)**:
   * **Rule**: Never hardcode colors (`#fff`, `#000`), raw font sizes (`24`), or ad-hoc margins/paddings (`15`) inside components or screens.
   * Always import `{ Colors, Spacing, Radius, FontSize, FontWeight, Shadow, StatusColors }` from `'../theme'` or `'../../theme'`.

3. **Role-Tailored Ergonomics**:
   * **Customer**: Soft, welcoming, friction-free purchasing, clean product grids, floating sticky checkout bars.
   * **Delivery Agent**: High-contrast, tactile, outdoor-friendly buttons, swipe-to-confirm sliders, checklist guards, one-tap calling.
   * **Store Admin**: Dense data cards, real-time KPI metrics, fast search filters, live activity alerts, quick action menus.

4. **Zero Layout Shifts & Graceful Fallbacks**:
   * Skeleton loaders (`CardSkeleton`, `ItemRowSkeleton`) match exact content dimensions.
   * Every list incorporates an `EmptyState` and network `ErrorState` with retry triggers.
   * Global `OfflineBanner` alerts users whenever network connection drops without breaking active sessions.

---

## 🚀 Quick Starter

To import design tokens and UI components in any screen:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme';
import { ScreenHeader, Card, Button, StatusPill } from '../components/ui';

export default function ExampleScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="Example Screen" showBack />
      <Card style={styles.card}>
        <Text style={styles.heading}>Welcome to Anandhi Stores</Text>
        <Text style={styles.body}>Fresh water and grocery delivery at your doorstep.</Text>
        <Button label="Continue" variant="primary" onPress={() => {}} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  card: {
    margin: Spacing.lg,
    padding: Spacing.lg,
  },
  heading: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginBottom: Spacing.md,
  },
});
```

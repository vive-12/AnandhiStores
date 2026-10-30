# Typography & Font Guide — Anandhi Stores

This document serves as the comprehensive typography standard for the Anandhi Stores (AquaRush) mobile application.

---

## 1. Primary Font Family: Manrope

The application exclusively uses the **Manrope** geometric sans-serif typeface, loaded via `@expo-google-fonts/manrope`. Manrope was selected for its modern open aperture, high legibility on outdoor mobile screens, and clean contemporary feel.

### Loaded Font Variants

The following four font weights are preloaded at application startup in [`mobile/app/_layout.tsx`](../../mobile/app/_layout.tsx):

| Font Family Identifier | Weight | Numerical | Intended Purpose |
| :--- | :--- | :--- | :--- |
| **`Manrope_500Medium`** | Medium | `500` | Standard body text, descriptions, timestamps, secondary captions, form field inputs, and helper messages. |
| **`Manrope_600SemiBold`** | SemiBold | `600` | Interactive controls, button labels, category chips, navigation tab labels, table header titles, and badges. |
| **`Manrope_700Bold`** | Bold | `700` | Strong emphasis, highlighted numerical figures, drawer clear actions, and prominent price tags. |
| **`Manrope_800ExtraBold`** | ExtraBold | `800` | Major screen headings, modal titles, primary KPI metrics, brand headers, and currency amounts. |

---

## 2. Startup Font Preloading Architecture

Fonts are initialized in [`mobile/app/_layout.tsx`](../../mobile/app/_layout.tsx) before any screen renders. The native splash screen is kept visible until font assets are 100% loaded:

```tsx
import {
  useFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
  }

  // App renders safely with zero layout shifts or font flickering
  return ( ... );
}
```

---

## 3. Font Size Scale (`FontSize`)

All font sizes are defined as immutable tokens in [`mobile/theme/index.ts`](../../mobile/theme/index.ts):

```typescript
export const FontSize = {
  xs: 12, // Captions, timestamps, badges, tiny tags
  sm: 14, // Standard body, list descriptions, input labels, secondary buttons
  md: 16, // Subtitles, card titles, main button text, form inputs
  lg: 20, // Section headers, price summaries, sheet titles
  xl: 26, // Main screen titles, hero metrics, wallet balances
} as const;
```

---

## 4. Typography Hierarchy Table

Use the following hierarchy when building or modifying screens:

| Element | Font Variant | Token Size | Color Token | Example Code |
| :--- | :--- | :--- | :--- | :--- |
| **Page Header Title** | `Manrope_800ExtraBold` | `FontSize.xl` (26px) | `Colors.ink` or `#fff` | `<Text style={s.pageTitle}>Dashboard</Text>` |
| **Section Header** | `Manrope_800ExtraBold` | `FontSize.lg` (20px) | `Colors.ink` | `<Text style={s.sectionTitle}>Active Orders</Text>` |
| **Card / Item Title** | `Manrope_800ExtraBold` | `FontSize.md` (16px) | `Colors.ink` | `<Text style={s.cardTitle}>20L Water Can</Text>` |
| **Primary Metric (KPI)** | `Manrope_800ExtraBold` | `32px` – `36px` | `Colors.green700` | `<Text style={s.kpiValue}>₹14,520</Text>` |
| **Button Text** | `Manrope_600SemiBold` | `FontSize.sm` / `md` | `#fff` or `Colors.green700` | `<Button label="Proceed to Checkout" />` |
| **Chips / Filter Tags** | `Manrope_600SemiBold` | `FontSize.xs` / `sm` | Active: `#fff` / Inactive: `Colors.inkSoft` | `<Chip label="Vegetables (12)" />` |
| **Status Badges** | `Manrope_600SemiBold` | `FontSize.xs` (12px) | Status text color | `<StatusPill status="out_for_delivery" />` |
| **Body Paragraph** | `Manrope_500Medium` | `FontSize.sm` (14px) | `Colors.inkSoft` | `<Text style={s.body}>Doorstep delivery in 30 mins</Text>` |
| **Input Value** | `Manrope_500Medium` | `FontSize.md` (16px) | `Colors.ink` | `<TextInput style={s.input} />` |
| **Timestamp / Tag** | `Manrope_500Medium` | `FontSize.xs` (12px) | `Colors.inkSoft` | `<Text style={s.timestamp}>Today, 10:45 AM</Text>` |

---

## 5. Icon Fonts & Symbol Support

In addition to Manrope typography, the app incorporates vector icons for visual navigation:

1. **`@expo/vector-icons/Ionicons`**:
   * Used for navigation tabs, action buttons, arrows, status icons, and checklist checkboxes.
   * Example: `<Ionicons name="checkmark-circle" size={20} color={Colors.green500} />`
2. **`lucide-react-native`**:
   * Used for modern, clean line icons in dashboards and account settings (e.g. `Package`, `Clock`, `Truck`, `Phone`).
3. **Currency Display**:
   * Indian Rupee symbol (`₹`) is rendered alongside Manrope figures:
   * Recommended: `₹{amount.toLocaleString('en-IN')}`

---

## 6. Strict Rules & Best Practices

### ✅ DO:
1. **Always use font tokens**:
   ```tsx
   import { FontSize, Colors } from '../../theme';
   // In StyleSheet:
   title: {
     fontSize: FontSize.lg,
     fontFamily: 'Manrope_800ExtraBold',
     color: Colors.ink,
   }
   ```
2. **Match font family with weight**:
   * When using `Manrope_800ExtraBold`, do **not** also apply `fontWeight: '800'`. On Android, setting both `fontFamily` and numerical `fontWeight` can cause system font synthesis bugs.
3. **Use `includeFontPadding: false` for tight vertical alignment on Android**:
   * When centering badges or pill text vertically, add `includeFontPadding: false` to ensure perfect vertical optical centering.

### ❌ DON'T:
1. **Never use raw system fonts** (e.g., `fontFamily: 'Arial'`, `'Helvetica'`, `'Roboto'`).
2. **Never omit `fontFamily`**: Omitting `fontFamily` falls back to device system fonts, causing visual inconsistency between iOS and Android.
3. **Never hardcode pixel font sizes** (e.g. `fontSize: 17`). Stick to `FontSize.xs`, `FontSize.sm`, `FontSize.md`, `FontSize.lg`, `FontSize.xl`.

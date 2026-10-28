# UI Components Guide — Anandhi Stores

This document serves as the interactive catalog and API reference for the **15 core reusable UI components** in Anandhi Stores (`mobile/components/ui`).

All components are imported via the barrel export:
```tsx
import {
  Button,
  Card,
  Chip,
  StatusPill,
  QtyStepper,
  Skeleton,
  ItemRowSkeleton,
  CardSkeleton,
  EmptyState,
  ErrorState,
  ToastProvider,
  useToast,
  BottomSheet,
  StickyBar,
  SwipeToConfirm,
  ScreenHeader,
  NotificationBell,
} from '../../components/ui';
```

---

## 1. Button (`Button.tsx`)

A spring-animated tactile button with built-in haptic feedback, loading state, and 4 semantic variants.

### Props API
```typescript
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean; // Defaults to true
}
```

### Variants
* **`primary`**: Solid Emerald (`Colors.green700`), white text. Used for main conversions ("Place Order", "Login").
* **`secondary`**: Cream surface with border (`Colors.line`), ink text. Used for secondary options ("Change Address").
* **`ghost`**: Transparent background, emerald text. Used for inline utility actions ("Cancel", "Skip").
* **`danger`**: Deep crimson background (`Colors.red`), white text. Used for irreversible actions ("Delete", "Logout").

### Example
```tsx
<Button
  label="Place Order (₹420)"
  variant="primary"
  loading={isSubmitting}
  onPress={handleCheckout}
/>
```

---

## 2. Card (`Card.tsx`)

A rounded surface container (`Radius.card` = 18px) supporting spring touch physics and optional drop elevation.

### Props API
```typescript
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  elevated?: boolean; // Uses Shadow.elevated if true, Shadow.card if false
  onPress?: () => void; // Turns card into an animated pressable with haptic feedback
  activeOpacity?: number; // Defaults to 0.9
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'none';
}
```

### Example
```tsx
<Card elevated onPress={() => router.push(`/track/${order.id}`)}>
  <Text style={styles.cardTitle}>Order #{order.orderNumber}</Text>
  <Text style={styles.cardSubtitle}>₹{order.total} • {order.items.length} items</Text>
</Card>
```

---

## 3. Chip (`Chip.tsx`)

Interactive filter pills used for product categories, status filters, and toggleable badges.

### Props API
```typescript
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  count?: number; // Optional numerical badge counter inside chip
  style?: ViewStyle;
}
```

### Example
```tsx
<Chip
  label="Vegetables"
  count={14}
  selected={selectedCategory === 'Vegetables'}
  onPress={() => setSelectedCategory('Vegetables')}
/>
```

---

## 4. StatusPill (`StatusPill.tsx`)

Semantic order status pill with automatic background tinting, bold text, and translated lifecycle labels.

### Props API
```typescript
interface StatusPillProps {
  status: 'placed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';
  style?: ViewStyle;
}
```

### Automatic Visual Mapping
* `placed`: Warm Amber (`#E8A33D`) &rarr; Label: **Placed**
* `packed`: Deep Indigo (`#5B5BD6`) &rarr; Label: **Packed**
* `out_for_delivery`: Vivid Blue (`#2F80ED`) &rarr; Label: **Out for Delivery**
* `delivered`: Emerald Green (`#2E8B57`) &rarr; Label: **Delivered**
* `cancelled`: Coral Red (`#E1604A`) &rarr; Label: **Cancelled**

### Example
```tsx
<StatusPill status={order.status} />
```

---

## 5. QtyStepper (`QtyStepper.tsx`)

High-precision quantity stepper with haptic clicks and minimum/maximum boundary enforcement.

### Props API
```typescript
interface QtyStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number; // Defaults to 0
  max?: number; // Defaults to 99
  unit?: string; // Optional suffix (e.g. "kg", "can")
  size?: 'sm' | 'md';
}
```

### Example
```tsx
<QtyStepper
  quantity={cart[item.id] || 0}
  onIncrement={() => addToCart(item)}
  onDecrement={() => removeFromCart(item.id)}
  unit="can"
/>
```

---

## 6. Skeletons (`Skeleton.tsx`)

Shimmering placeholders that match live content layout to prevent layout shifts during network fetches.

### Variants
* **`Skeleton`**: Base primitive with customizable width, height, and border radius.
* **`ItemRowSkeleton`**: Prebuilt placeholder mimicking a grocery/can product row with image, title, and stepper.
* **`CardSkeleton`**: Prebuilt card placeholder with header, subtitle, and action button slots.

### Example
```tsx
{loading ? (
  <View style={{ gap: Spacing.md }}>
    <CardSkeleton />
    <CardSkeleton />
  </View>
) : (
  <FlatList data={orders} ... />
)}
```

---

## 7. EmptyState (`EmptyState.tsx`)

Zero-state illustration and action handler when search, filters, or list queries return empty.

### Props API
```typescript
interface EmptyStateProps {
  title: string;
  description: string;
  iconName?: keyof typeof Ionicons.glyphMap; // Defaults to 'basket-outline'
  actionLabel?: string;
  onAction?: () => void;
}
```

### Example
```tsx
<EmptyState
  title="No active orders"
  description="You don't have any water cans or groceries on the way right now."
  actionLabel="Order Fresh Water"
  onAction={() => router.push('/(customer)')}
/>
```

---

## 8. ErrorState (`ErrorState.tsx`)

Network or data failure recovery card with an automatic retry callback.

### Props API
```typescript
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}
```

---

## 9. ScreenHeader (`ScreenHeader.tsx`)

The signature curved deep forest green (`Colors.green900`) header with back button and safe area insets handling.

### Props API
```typescript
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean; // Defaults to false
  onBack?: () => void; // Defaults to router.back()
  right?: React.ReactNode; // Optional right action icon (e.g., NotificationBell or Filter)
}
```

### Example
```tsx
<ScreenHeader
  title="Order History"
  subtitle="All your past deliveries"
  showBack
  right={<NotificationBell />}
/>
```

---

## 10. NotificationBell (`NotificationBell.tsx`)

Top-bar notification bell featuring an unread counter badge and a slide-out animated notification drawer with clear-all actions.

### Features
* Real-time Firestore snapshot listener for user-specific alerts.
* Spring-animated badge that updates dynamically on new arrivals.
* Slide-out modal drawer with swipe dismiss, single-item delete, and mark-all-read triggers.

---

## 11. SwipeToConfirm (`SwipeToConfirm.tsx`)

A physical swipe-right gesture slider that prevents accidental destructive or irreversible actions (e.g. marking delivery complete).

### Props API
```typescript
interface SwipeToConfirmProps {
  label?: string; // Defaults to 'Swipe to confirm'
  onConfirm: () => void;
  disabled?: boolean;
}
```

### Example
```tsx
<SwipeToConfirm
  label="Slide to Mark Delivered"
  onConfirm={handleConfirmDelivery}
  disabled={!allChecklistItemsChecked}
/>
```

---

## 12. StickyBar (`StickyBar.tsx`)

A floating bottom checkout / action dock positioned above bottom tab bars and safe area insets.

### Props API
```typescript
interface StickyBarProps {
  itemCount: number;
  total: number;
  onPress: () => void;
  label?: string; // Defaults to 'View Cart'
}
```

---

## 13. Toast (`Toast.tsx`)

A non-blocking top notification banner triggered from any component via the `useToast` hook.

### Usage
```tsx
const { showToast } = useToast();

// Trigger anywhere:
showToast('Order placed successfully!', 'success'); // variants: 'success' | 'error' | 'info'
```

---

## 14. BottomSheet (`BottomSheet.tsx`)

A Gorhom BottomSheet wrapper styled with Anandhi Stores rounded corners (`Radius.card`) and cream paper surface for modal selections.

---

## 15. OfflineBanner (`OfflineBanner.tsx`)

A persistent connectivity listener that renders a subtle warning banner whenever network drops, preventing data loss during offline usage.

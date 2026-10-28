# Standard Screen Templates — Anandhi Stores

This document provides standardized, copy-pasteable architectural blueprints for building screens in Anandhi Stores. Following these templates ensures 100% visual consistency across Customer, Agent, and Admin roles.

---

## 🏗️ Screen Anatomy Checklist

Every screen in the codebase must follow this standardized layer hierarchy:

```
┌────────────────────────────────────────────────────────┐
│ 1. StatusBar (light-content, backgroundColor: green900)│
├────────────────────────────────────────────────────────┤
│ 2. ScreenHeader (title, subtitle, showBack, rightIcon) │
├────────────────────────────────────────────────────────┤
│ 3. Filter Chips / Search Bar (Optional subheader)      │
├────────────────────────────────────────────────────────┤
│ 4. Main ScrollView / FlatList (Colors.cream background)│
│    ├─ Skeleton Loading State (While fetching)          │
│    ├─ ErrorState with Retry (If query fails)           │
│    ├─ EmptyState with CTA (If dataset is empty)        │
│    └─ Content Cards & Sections                         │
├────────────────────────────────────────────────────────┤
│ 5. Sticky Bottom Bar / CTA (Floating above tab bar)    │
└────────────────────────────────────────────────────────┘
```

---

## 📋 Template 1: Catalog & List Screen Blueprint

Use this template for screens displaying collections of data (e.g., product catalog, order history, customer directory, alerts list).

```tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, Radius, Shadow } from '../../theme';
import {
  ScreenHeader,
  Chip,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  StatusPill,
  StickyBar,
} from '../../components/ui';

interface ListItem {
  id: string;
  title: string;
  subtitle: string;
  status: 'placed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';
}

export default function StandardListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active'>('all');
  const [items, setItems] = useState<ListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    // Fetch data...
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: ListItem }) => (
    <Card
      style={styles.card}
      onPress={() => router.push(`/details/${item.id}`)}
      elevated
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <StatusPill status={item.status} />
      </View>
      <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Orders"
        subtitle="Live delivery status"
        showBack
      />

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <Chip
          label="All"
          selected={selectedFilter === 'all'}
          onPress={() => setSelectedFilter('all')}
        />
        <Chip
          label="Active Only"
          selected={selectedFilter === 'active'}
          onPress={() => setSelectedFilter('active')}
        />
      </View>

      {/* State Renderers */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={onRefresh} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No items found"
          description="There are currently no records matching your filter."
          actionLabel="Refresh List"
          onAction={onRefresh}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xxl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.green700}
              colors={[Colors.green700]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  skeletonContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  cardSubtitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
});
```

---

## 📋 Template 2: Detail & Action Screen Blueprint

Use this template for detailed record inspection, doorstep checklists, or active delivery tracking.

```tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, Radius, Shadow } from '../../theme';
import {
  ScreenHeader,
  Card,
  Button,
  StatusPill,
} from '../../components/ui';

export default function StandardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={`Order #${id}`}
        subtitle="Placed Today at 10:30 AM"
        showBack
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xxl },
        ]}
      >
        {/* Status Card */}
        <Card elevated style={styles.sectionCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeading}>Current Status</Text>
            <StatusPill status="out_for_delivery" />
          </View>
          <Text style={styles.statusHelper}>
            Your delivery partner is on the way to your doorstep.
          </Text>
        </Card>

        {/* Breakdown Card */}
        <Card elevated style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Order Breakdown</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemTitle}>20L Water Can (x2)</Text>
            <Text style={styles.itemPrice}>₹80</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.totalLabel}>Total Payable (COD)</Text>
            <Text style={styles.totalAmount}>₹80</Text>
          </View>
        </Card>

        {/* Primary Action Button */}
        <Button
          label="Track on Live Map"
          variant="primary"
          onPress={() => router.push(`/track/${id}`)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionCard: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeading: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusHelper: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  itemTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  itemPrice: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.xs,
  },
  totalLabel: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  totalAmount: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
});
```

---

## 📋 Template 3: Form & Modal Sheet Blueprint

Use this template for user input (e.g. Add product, Update customer PIN, Set delivery address).

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Colors, Spacing, FontSize, Radius } from '../../theme';
import { Button, useToast } from '../../components/ui';

export default function StandardFormSheet({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('Product name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      // Save data...
      showToast('Product added successfully', 'success');
      onClose();
    } catch {
      showToast('Failed to save product', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.formContainer}
    >
      <ScrollView contentContainerStyle={styles.formContent}>
        <Text style={styles.sheetTitle}>Add New Product</Text>

        {/* Input Field 1 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Product Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 20L Water Can"
            placeholderTextColor={Colors.inkSoft}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Input Field 2 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Price (₹)</Text>
          <TextInput
            style={styles.input}
            placeholder="40"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
        </View>

        {/* Form Action Buttons */}
        <View style={styles.buttonRow}>
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Button
            label="Save Product"
            variant="primary"
            loading={saving}
            fullWidth={false}
            onPress={handleSubmit}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  formContent: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  fieldGroup: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    backgroundColor: Colors.cream,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
```

---

## 📋 Template 4: KPI Dashboard Blueprint

Use this template for Admin analytics, Agent metrics, and live store operational dashboards.

```tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors, Spacing, FontSize, Radius, Shadow } from '../../theme';
import { ScreenHeader, Card, NotificationBell } from '../../components/ui';

export default function StandardDashboardScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Admin Control"
        subtitle="Today's live store metrics"
        right={<NotificationBell />}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Metric Cards Grid */}
        <View style={styles.kpiGrid}>
          <Card elevated style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Today's Sales</Text>
            <Text style={styles.kpiValue}>₹14,850</Text>
            <Text style={styles.kpiSub}>+18% from yesterday</Text>
          </Card>

          <Card elevated style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Cans Outside</Text>
            <Text style={[styles.kpiValue, { color: Colors.amber }]}>48</Text>
            <Text style={styles.kpiSub}>Pending collection</Text>
          </Card>
        </View>

        {/* Quick Operations Section */}
        <Card elevated style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick Operations</Text>
          <View style={styles.actionRow}>
            <Text style={styles.actionTxt}>Active Delivery Drivers (3 Online)</Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  kpiCard: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  kpiLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  kpiSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  sectionCard: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  actionRow: {
    paddingVertical: Spacing.sm,
  },
  actionTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
});
```

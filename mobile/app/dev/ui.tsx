// app/dev/ui.tsx — DEV ONLY: showcase of all UI components
// Remove this route before production build (add to .easignore or gate with __DEV__)
import React, { useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  StickyBar,
  SwipeToConfirm,
  ScreenHeader,
  useToast,
} from '../../components/ui';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Colors, Spacing, FontSize } from '../../theme';
import type RNBottomSheet from '@gorhom/bottom-sheet';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function UIShowcase() {
  const { showToast } = useToast();
  const [qty1, setQty1] = useState(0);
  const [qty2, setQty2] = useState(2);
  const [chip, setChip] = useState('All');
  const sheetRef = useRef<RNBottomSheet>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cream }} edges={['bottom']}>
      <ScreenHeader title="UI Showcase" subtitle="Dev only — all components" />

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>

        {/* Buttons */}
        <Section title="Button">
          <Button label="Primary (amber)" onPress={() => showToast('Primary tapped', 'success')} variant="primary" style={{ marginBottom: 8 }} />
          <Button label="Secondary (green)" onPress={() => showToast('Secondary', 'info')} variant="secondary" style={{ marginBottom: 8 }} />
          <Button label="Ghost" onPress={() => {}} variant="ghost" style={{ marginBottom: 8 }} />
          <Button label="Danger" onPress={() => showToast('Danger!', 'error')} variant="danger" style={{ marginBottom: 8 }} />
          <Button label="Loading..." onPress={() => {}} loading style={{ marginBottom: 8 }} />
          <Button label="Disabled" onPress={() => {}} disabled />
        </Section>

        {/* StatusPill */}
        <Section title="StatusPill">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['placed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'].map(s => (
              <StatusPill key={s} status={s} />
            ))}
          </View>
        </Section>

        {/* Chips */}
        <Section title="Chip">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['All', 'Vegetables', 'Fruits', 'Water', 'Groceries'].map(c => (
              <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
            ))}
          </ScrollView>
        </Section>

        {/* QtyStepper */}
        <Section title="QtyStepper">
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={s.label}>Starts at 0:</Text>
              <QtyStepper
                qty={qty1}
                onAdd={() => setQty1(1)}
                onIncrement={() => setQty1(q => q + 1)}
                onDecrement={() => setQty1(q => Math.max(0, q - 1))}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={s.label}>Starts at 2:</Text>
              <QtyStepper
                qty={qty2}
                onAdd={() => setQty2(1)}
                onIncrement={() => setQty2(q => q + 1)}
                onDecrement={() => setQty2(q => Math.max(0, q - 1))}
                max={5}
              />
            </View>
          </View>
        </Section>

        {/* Skeleton */}
        <Section title="Skeleton">
          <View style={{ gap: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="45%" />
            <ItemRowSkeleton />
            <CardSkeleton />
          </View>
        </Section>

        {/* Card */}
        <Section title="Card">
          <Card style={{ padding: Spacing.lg }}>
            <Text style={s.label}>This is a Card component</Text>
            <Text style={s.sub}>White bg · radius 18 · soft shadow</Text>
          </Card>
        </Section>

        {/* Toasts */}
        <Section title="Toast">
          <Button label="Success toast" onPress={() => showToast('Order placed successfully!', 'success')} variant="secondary" style={{ marginBottom: 8 }} />
          <Button label="Error toast" onPress={() => showToast('Something went wrong. Please try again.', 'error')} variant="danger" style={{ marginBottom: 8 }} />
          <Button label="Info toast" onPress={() => showToast('Price updated for Tomato.', 'info')} variant="ghost" />
        </Section>

        {/* BottomSheet */}
        <Section title="BottomSheet">
          <Button
            label="Open bottom sheet"
            onPress={() => sheetRef.current?.expand()}
            variant="secondary"
          />
        </Section>

        {/* SwipeToConfirm */}
        <Section title="SwipeToConfirm">
          <SwipeToConfirm
            label="Swipe to mark delivered"
            onConfirm={() => showToast('Delivered! 🎉', 'success')}
          />
        </Section>

        {/* EmptyState */}
        <Section title="EmptyState">
          <View style={{ height: 220 }}>
            <EmptyState
              icon="📭"
              title="No orders yet"
              subtitle="Your orders will appear here once you place one."
              actionLabel="Browse items"
              onAction={() => showToast('Navigate to browse', 'info')}
            />
          </View>
        </Section>

        {/* ErrorState */}
        <Section title="ErrorState">
          <View style={{ height: 200 }}>
            <ErrorState message="Couldn't load orders. Check your connection." onRetry={() => showToast('Retrying…', 'info')} />
          </View>
        </Section>

      </ScrollView>

      {/* StickyBar — always visible in showcase */}
      <StickyBar itemCount={qty1 + qty2} total={(qty1 + qty2) * 30} onPress={() => showToast('Cart tapped', 'info')} />

      <BottomSheet ref={sheetRef} title="Example Bottom Sheet" snapPoints={['40%', '75%']}>
        <Text style={s.label}>Bottom sheets replace modals for item detail, filters and agent picker.</Text>
        <View style={{ marginTop: Spacing.lg }}>
          <Button label="Close" onPress={() => sheetRef.current?.close()} variant="ghost" />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  sub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 4,
  },
});

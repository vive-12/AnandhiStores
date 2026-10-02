// components/ui/StatusPill.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusColors } from '../../theme';
import { FontSize, Radius, Spacing } from '../../theme';

const STATUS_LABEL: Record<string, string> = {
  placed:           'Placed',
  packed:           'Packed',
  out_for_delivery: 'Out for delivery',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
};

interface StatusPillProps {
  status: string;
}

export function StatusPill({ status }: StatusPillProps) {
  const color = StatusColors[status] ?? '#888';
  const label = STATUS_LABEL[status] ?? status;

  return (
    <View style={[styles.pill, { backgroundColor: color + '1A', borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chip,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
  },
});

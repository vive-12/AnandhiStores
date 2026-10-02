// components/ui/Skeleton.tsx
// Animated shimmer skeleton loader — replaces spinners while data loads.
import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius } from '../../theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.line, '#F0EDE7'],
    ),
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius }, animStyle, style]}
    />
  );
}

/** Pre-built skeleton for a single item row */
export function ItemRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="35%" />
      </View>
      <Skeleton width={70} height={34} radius={100} />
    </View>
  );
}

/** Pre-built skeleton for a card (e.g. order card) */
export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={14} width="50%" style={{ marginBottom: 8 }} />
      <Skeleton height={12} width="80%" style={{ marginBottom: 6 }} />
      <Skeleton height={12} width="65%" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: 16,
    marginBottom: 12,
  },
});

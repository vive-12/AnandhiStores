import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { Colors, FontSize, Spacing, Shadow } from '../../theme';

interface StickyBarProps {
  itemCount: number;
  total: number;
  onPress: () => void;
}

export function StickyBar({ itemCount, total, onPress }: StickyBarProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(itemCount > 0 ? 0 : 100);

  useEffect(() => {
    translateY.value = withSpring(itemCount > 0 ? 0 : 100, { damping: 16 });
  }, [itemCount]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (itemCount === 0) return null;

  return (
    <Animated.View style={[styles.wrapper, { paddingBottom: insets.bottom + Spacing.sm }, animStyle]}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.bar}>
        <View style={styles.left}>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{itemCount}</Text>
          </View>
          <Text style={styles.itemsTxt}>
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </Text>
        </View>
        <Text style={styles.total}>Rs {total.toFixed(0)}</Text>
        <Text style={styles.cta}>View cart →</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    backgroundColor: 'transparent',
  },
  bar: {
    backgroundColor: Colors.green900,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.elevated,
    gap: Spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.sm },
  badge: {
    backgroundColor: Colors.amber,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  itemsTxt: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold' },
  total: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Manrope_800ExtraBold' },
  cta: { color: Colors.amber, fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold' },
});

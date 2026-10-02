// components/ui/Chip.tsx
import React, { useCallback } from 'react';
import { Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius, FontSize, Spacing } from '../../theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(() => { scale.value = withSpring(0.94); }, [scale]);
  const handlePressOut = useCallback(() => { scale.value = withSpring(1); }, [scale]);

  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.chip,
        selected ? styles.selected : styles.idle,
        animStyle,
        style,
      ]}
    >
      <Text style={[styles.label, { color: selected ? '#fff' : Colors.inkSoft }]}>
        {label}
      </Text>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.chip,
    marginRight: Spacing.sm,
    borderWidth: 1.5,
  },
  idle: {
    backgroundColor: Colors.card,
    borderColor: Colors.line,
  },
  selected: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
  },
});

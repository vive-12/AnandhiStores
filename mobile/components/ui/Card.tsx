// components/ui/Card.tsx
import React, { useCallback } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Shadow } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  elevated?: boolean;
  onPress?: () => void;
  activeOpacity?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'none';
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Card({
  children,
  style,
  elevated = false,
  onPress,
  activeOpacity = 0.9,
  accessibilityLabel,
  accessibilityRole,
}: CardProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  if (onPress) {
    return (
      <AnimatedTouchable
        activeOpacity={activeOpacity}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole ?? 'button'}
        style={[styles.card, elevated && Shadow.elevated, style, animStyle]}
      >
        {children}
      </AnimatedTouchable>
    );
  }

  return (
    <View style={[styles.card, elevated && Shadow.elevated, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    ...Shadow.card,
    overflow: 'hidden',
  },
});


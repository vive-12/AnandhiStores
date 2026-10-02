// components/ui/SwipeToConfirm.tsx
// Swipe-right-to-confirm slider — used for "Mark Delivered".
// Uses RNGH v2 Gesture API (compatible with Reanimated v4).
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolateColor,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, FontSize, Radius, Spacing } from '../../theme';

interface SwipeToConfirmProps {
  label?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const TRACK_WIDTH = 280;
const THUMB_SIZE = 52;
const MAX_SWIPE = TRACK_WIDTH - THUMB_SIZE - 8;
const CONFIRM_THRESHOLD = MAX_SWIPE * 0.85;

export function SwipeToConfirm({
  label = 'Swipe to confirm',
  onConfirm,
  disabled = false,
}: SwipeToConfirmProps) {
  const x = useSharedValue(0);
  const confirmed = useSharedValue(false);
  const startX = useSharedValue(0);

  const triggerConfirm = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  }, [onConfirm]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      startX.value = x.value;
    })
    .onUpdate((e) => {
      if (confirmed.value) return;
      x.value = Math.max(0, Math.min(startX.value + e.translationX, MAX_SWIPE));
    })
    .onEnd(() => {
      if (confirmed.value) return;
      if (x.value >= CONFIRM_THRESHOLD) {
        x.value = withSpring(MAX_SWIPE);
        confirmed.value = true;
        runOnJS(triggerConfirm)();
      } else {
        x.value = withSpring(0, { damping: 14 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    backgroundColor: interpolateColor(
      x.value,
      [0, MAX_SWIPE],
      [Colors.amber, Colors.green500],
    ),
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      x.value,
      [0, MAX_SWIPE],
      ['#E8A33D22', Colors.green500 + '33'],
    ),
  }));

  const labelOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, MAX_SWIPE * 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.outer, disabled && { opacity: 0.5 }]}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.Text style={[styles.label, labelOpacity]}>{label}</Animated.Text>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.thumb, thumbStyle]}>
            <Text style={styles.arrow}>›</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center', paddingVertical: Spacing.sm },
  track: {
    width: TRACK_WIDTH,
    height: THUMB_SIZE + 8,
    borderRadius: Radius.chip,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
    borderWidth: 1.5,
    borderColor: Colors.amber + '66',
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    letterSpacing: 0.3,
  },
  thumb: {
    position: 'absolute',
    left: 4,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'Manrope_800ExtraBold',
    lineHeight: 32,
    marginTop: -2,
  },
});

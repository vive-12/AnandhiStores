// components/ui/QtyStepper.tsx
// ADD button changes into - qty + stepper with immediate responsiveness and zero opacity glitch.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, FontSize, Spacing } from '../../theme';

interface QtyStepperProps {
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  max?: number;
  disabled?: boolean;
}

export function QtyStepper({
  qty,
  onAdd,
  onIncrement,
  onDecrement,
  max = 20,
  disabled = false,
}: QtyStepperProps) {
  const handleAdd = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd();
  };

  const handleDecrement = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecrement();
  };

  const handleIncrement = () => {
    if (disabled || qty >= max) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onIncrement();
  };

  if (qty <= 0) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleAdd}
          disabled={disabled}
          style={[styles.addBtn, disabled && styles.disabledBtn]}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.addTxt}>ADD</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.stepper}>
        <TouchableOpacity
          onPress={handleDecrement}
          style={styles.stepTouch}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.stepBtn}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qty}>{qty}</Text>
        <TouchableOpacity
          onPress={handleIncrement}
          disabled={qty >= max}
          style={styles.stepTouch}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.stepBtn, qty >= max && { color: Colors.line }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 88,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: Colors.green700,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.4 },
  addTxt: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.xs,
    height: 34,
    minWidth: 88,
    justifyContent: 'space-between',
  },
  stepTouch: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtn: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_600SemiBold',
    lineHeight: 22,
  },
  qty: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    minWidth: 20,
    textAlign: 'center',
  },
});

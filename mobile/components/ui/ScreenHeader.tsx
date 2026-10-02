// components/ui/ScreenHeader.tsx
// Curved green900 header with title and optional subtitle + back button.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Spacing } from '../../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, showBack = false, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.green900} />
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rightSlot}>{right ?? <View style={{ width: 40 }} />}</View>
      </View>
      {/* Curved bottom */}
      <View style={styles.curve} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.green900,
    paddingBottom: 28,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_600SemiBold',
  },
  center: { flex: 1, alignItems: 'center' },
  title: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    marginTop: 2,
  },
  rightSlot: { width: 40, alignItems: 'flex-end' },
  curve: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: Colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});

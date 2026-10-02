// components/ui/BottomSheet.tsx
// Wrapper around @gorhom/bottom-sheet with Anandhi Stores styling.
import React, { forwardRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import RNBottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Colors, Radius, Spacing, FontSize } from '../../theme';

interface BottomSheetProps {
  title?: string;
  snapPoints?: (string | number)[];
  children: React.ReactNode;
  onClose?: () => void;
}

export const BottomSheet = forwardRef<RNBottomSheet, BottomSheetProps>(
  ({ title, snapPoints = ['50%', '90%'], children, onClose }, ref) => {
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    return (
      <RNBottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.background}
        onClose={onClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {onClose ? (
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {children}
        </BottomSheetScrollView>
      </RNBottomSheet>
    );
  },
);

BottomSheet.displayName = 'BottomSheet';

const styles = StyleSheet.create({
  handle: {
    backgroundColor: Colors.line,
    width: 36,
    height: 4,
  },
  background: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  closeBtn: {
    fontSize: FontSize.md,
    color: Colors.inkSoft,
  },
});

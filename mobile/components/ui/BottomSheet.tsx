// components/ui/BottomSheet.tsx
// Wrapper around @gorhom/bottom-sheet with Anandhi Stores styling.
// Mounts conditionally to avoid invisible layout overlays intercepting Android touch events when closed.
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
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
    const [isOpen, setIsOpen] = useState(false);
    const innerRef = useRef<RNBottomSheet>(null);

    useImperativeHandle(
      ref,
      () =>
        ({
          expand: () => {
            setIsOpen(true);
          },
          collapse: () => {
            innerRef.current?.collapse();
          },
          close: () => {
            innerRef.current?.close();
            setIsOpen(false);
          },
          snapToIndex: (index: number) => {
            if (index === -1) {
              innerRef.current?.close();
              setIsOpen(false);
            } else {
              setIsOpen(true);
              setTimeout(() => innerRef.current?.snapToIndex(index), 30);
            }
          },
          snapToPosition: (pos: string | number) => {
            setIsOpen(true);
            setTimeout(() => innerRef.current?.snapToPosition(pos), 30);
          },
          forceClose: () => {
            innerRef.current?.forceClose();
            setIsOpen(false);
          },
        } as any),
      [],
    );

    const handleClose = useCallback(() => {
      setIsOpen(false);
      onClose?.();
    }, [onClose]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
          pressBehavior="close"
        />
      ),
      [],
    );

    if (!isOpen) return null;

    return (
      <RNBottomSheet
        ref={innerRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.background}
        onClose={handleClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
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

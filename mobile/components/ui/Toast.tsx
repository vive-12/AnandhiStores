// components/ui/Toast.tsx
// In-app toast notifications — success, error, info.
// Usage: const { showToast } = useToast();  (from ToastProvider in root layout)
import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Radius, Spacing } from '../../theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const COLORS: Record<ToastType, string> = {
  success: Colors.green500,
  error:   Colors.coral,
  info:    Colors.green700,
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
};

function ToastItem({ toast, onDone }: { toast: ToastMessage; onDone: (id: number) => void }) {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(-20)).current;

  React.useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 15 }),
    ]).start();

    const timer = setTimeout(() => {
      RNAnimated.parallel([
        RNAnimated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        RNAnimated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(() => onDone(toast.id));
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const bg = COLORS[toast.type];

  return (
    <RNAnimated.View style={[styles.toast, { backgroundColor: bg, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.icon}>{ICONS[toast.type]}</Text>
      <Text style={styles.msg} numberOfLines={2}>{toast.message}</Text>
    </RNAnimated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = counter.current++;
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const onDone = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.container, { top: insets.top + Spacing.md }]} pointerEvents="none">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onDone={onDone} />)}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    gap: Spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  icon: { color: '#fff', fontSize: FontSize.md, fontFamily: 'Manrope_800ExtraBold' },
  msg: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', flex: 1 },
});

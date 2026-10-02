// app/auth/admin-login.tsx — Admin PIN entry (replaces hardcoded ADMIN_PIN)
// Admin is a user in Firestore with role:'admin'. No hardcoded PIN.
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useSession } from '../../hooks/useSession';
import { loginAsAdmin } from '../../services/auth';
import { isValidPin } from '../../utils/compute';
import { Colors, FontSize, Spacing, Radius } from '../../theme';

export default function AdminLoginScreen() {
  const { showToast }  = useToast();
  const { setSession } = useSession();

  const [pin,        setPin]        = useState('');
  const [pinErr,     setPinErr]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = useCallback(async () => {
    if (!isValidPin(pin)) { setPinErr('PIN must be exactly 4 digits'); return; }
    setPinErr('');
    if (submitting) return;
    setSubmitting(true);
    try {
      const user = await loginAsAdmin(pin);
      setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
    } catch (e: any) {
      showToast(e.message ?? 'Login failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [pin, submitting, setSession, showToast]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <View style={styles.container}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.title}>Admin access</Text>
        <Text style={styles.subtitle}>Enter your 4-digit admin PIN</Text>

        <View style={styles.field}>
          <TextInput
            style={[styles.input, pinErr ? styles.inputErr : null]}
            placeholder="• • • •"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={v => { setPin(v); setPinErr(''); }}
            autoFocus
            onSubmitEditing={handleLogin}
          />
          {pinErr ? <Text style={styles.errTxt}>{pinErr}</Text> : null}
        </View>

        <Button label="Unlock" onPress={handleLogin} loading={submitting} disabled={submitting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.cream },
  container: { flex: 1, padding: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  icon:      { fontSize: 56, marginBottom: Spacing.lg },
  title:     { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900, marginBottom: 4 },
  subtitle:  { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginBottom: Spacing.xxl },
  field:     { width: '100%', marginBottom: Spacing.xl },
  input: {
    height: 64, borderWidth: 1.5, borderColor: Colors.line, borderRadius: Radius.button,
    fontSize: 28, fontFamily: 'Manrope_800ExtraBold', color: Colors.ink,
    backgroundColor: Colors.card, textAlign: 'center', letterSpacing: 16,
  },
  inputErr:  { borderColor: Colors.coral },
  errTxt:    { fontSize: FontSize.xs, color: Colors.coral, fontFamily: 'Manrope_500Medium', marginTop: 4, textAlign: 'center' },
});

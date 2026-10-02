// app/auth/reset-pin.tsx — Customer-initiated PIN reset (after admin triggers it)
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useSession } from '../../hooks/useSession';
import { hashPin } from '../../services/auth';
import { resetPin } from '../../services/users';
import { loginWithPhone } from '../../services/auth';
import { isValidPin } from '../../utils/compute';
import { Colors, FontSize, Spacing, Radius } from '../../theme';

export default function ResetPinScreen() {
  const router         = useRouter();
  const { showToast }  = useToast();
  const { setSession } = useSession();
  const params         = useLocalSearchParams<{ uid: string; phone: string }>();

  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPinErr,  setNewPinErr]  = useState('');
  const [confErr,    setConfErr]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReset = useCallback(async () => {
    let ok = true;
    if (!isValidPin(newPin)) { setNewPinErr('PIN must be exactly 4 digits'); ok = false; }
    else setNewPinErr('');
    if (newPin !== confirmPin) { setConfErr('PINs do not match'); ok = false; }
    else setConfErr('');
    if (!ok || submitting) return;

    setSubmitting(true);
    try {
      const hashed = await hashPin(newPin, params.phone!);
      await resetPin(params.uid!, hashed);
      showToast('PIN updated successfully', 'success');
      // Now log them in with new PIN
      const user = await loginWithPhone({ phone: params.phone!, pin: newPin });
      setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
    } catch (e: any) {
      showToast(e.message ?? 'Failed to reset PIN.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [newPin, confirmPin, submitting, params, setSession, showToast]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <View style={styles.container}>
        <Text style={styles.title}>Set new PIN</Text>
        <Text style={styles.subtitle}>Choose a new 4-digit PIN for your account.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>New PIN</Text>
          <TextInput
            style={[styles.input, newPinErr ? styles.inputErr : null]}
            placeholder="• • • •"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={newPin}
            onChangeText={v => { setNewPin(v); setNewPinErr(''); }}
          />
          {newPinErr ? <Text style={styles.errTxt}>{newPinErr}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm new PIN</Text>
          <TextInput
            style={[styles.input, confErr ? styles.inputErr : null]}
            placeholder="• • • •"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={confirmPin}
            onChangeText={v => { setConfirmPin(v); setConfErr(''); }}
          />
          {confErr ? <Text style={styles.errTxt}>{confErr}</Text> : null}
        </View>

        <View style={{ marginTop: Spacing.xl }}>
          <Button label="Save new PIN" onPress={handleReset} loading={submitting} disabled={submitting} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.cream },
  container: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  title:     { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900, marginBottom: 4 },
  subtitle:  { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginBottom: Spacing.xxl },
  field:     { marginBottom: Spacing.lg },
  label:     { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.ink, marginBottom: Spacing.xs },
  input: {
    height: 52, borderWidth: 1.5, borderColor: Colors.line, borderRadius: Radius.button,
    paddingHorizontal: Spacing.lg, fontSize: FontSize.md, fontFamily: 'Manrope_500Medium',
    color: Colors.ink, backgroundColor: Colors.card, letterSpacing: 8,
  },
  inputErr: { borderColor: Colors.coral },
  errTxt:   { fontSize: FontSize.xs, color: Colors.coral, fontFamily: 'Manrope_500Medium', marginTop: 4 },
});

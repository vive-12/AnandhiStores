// app/auth/login.tsx — Unified login for customer and agent
// Admin has a separate PIN entry on the home screen (app/index.jsx kept for now;
// migrated to Firestore admin user in P4).
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useSession } from '../../hooks/useSession';
import { loginWithPhone } from '../../services/auth';
import { isValidPhone, isValidPin, normalisePhone } from '../../utils/compute';
import { Colors, FontSize, Spacing, Radius } from '../../theme';

export default function LoginScreen() {
  const router          = useRouter();
  const { showToast }   = useToast();
  const { setSession }  = useSession();

  const [phone,      setPhone]      = useState('');
  const [pin,        setPin]        = useState('');
  const [phoneErr,   setPhoneErr]   = useState('');
  const [pinErr,     setPinErr]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateInputs = useCallback(() => {
    let ok = true;
    const p = normalisePhone(phone);
    if (!isValidPhone(p)) { setPhoneErr('Enter a valid 10-digit mobile number'); ok = false; }
    else setPhoneErr('');
    if (!isValidPin(pin)) { setPinErr('PIN must be exactly 4 digits'); ok = false; }
    else setPinErr('');
    return ok;
  }, [phone, pin]);

  const handleLogin = useCallback(async () => {
    if (!validateInputs() || submitting) return;
    setSubmitting(true);
    try {
      const user = await loginWithPhone({ phone: normalisePhone(phone), pin });
      setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
      // RouteGuard in _layout handles redirect
    } catch (e: any) {
      showToast(e.message ?? 'Login failed. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [phone, pin, submitting, validateInputs, setSession, showToast]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>🛒</Text>
          <Text style={styles.title}>Anandhi Stores</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Phone */}
        <View style={styles.field}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={[styles.input, phoneErr ? styles.inputErr : null]}
            placeholder="9xxxxxxxxx"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="phone-pad"
            maxLength={10}
            value={phone}
            onChangeText={v => { setPhone(v); setPhoneErr(''); }}
            returnKeyType="next"
            autoComplete="tel"
          />
          {phoneErr ? <Text style={styles.errTxt}>{phoneErr}</Text> : null}
        </View>

        {/* PIN */}
        <View style={styles.field}>
          <Text style={styles.label}>4-digit PIN</Text>
          <TextInput
            style={[styles.input, pinErr ? styles.inputErr : null]}
            placeholder="• • • •"
            placeholderTextColor={Colors.inkSoft}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={v => { setPin(v); setPinErr(''); }}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          {pinErr ? <Text style={styles.errTxt}>{pinErr}</Text> : null}
        </View>

        <View style={{ marginTop: Spacing.xl }}>
          <Button
            label="Sign in"
            onPress={handleLogin}
            loading={submitting}
            disabled={submitting}
          />
        </View>

        {/* Quick Demo Logins for Fast Pair Testing */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>⚡ Quick Demo Accounts</Text>
          <View style={styles.demoRow}>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => { setPhone('9789042245'); setPin('1211'); }}
            >
              <Text style={styles.demoBtnRole}>👤 Shivani</Text>
              <Text style={styles.demoBtnDetail}>9789042245 • 1211</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => { setPhone('9940405016'); setPin('1211'); }}
            >
              <Text style={styles.demoBtnRole}>🛵 Smallvivek</Text>
              <Text style={styles.demoBtnDetail}>9940405016 • 1211</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.demoBtn, styles.demoBtnAdmin]}
              onPress={() => { setPhone('9999999999'); setPin('1234'); }}
            >
              <Text style={[styles.demoBtnRole, { color: Colors.green900 }]}>👑 Admin</Text>
              <Text style={styles.demoBtnDetail}>9999999999 • 1234</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/auth/admin-login')} style={styles.adminLink}>
          <Text style={styles.adminLinkTxt}>🔐 Switch to Admin PIN Unlock</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.link}>
          <Text style={styles.linkTxt}>New customer? <Text style={styles.linkBold}>Create account</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: Colors.cream },
  container:  { flexGrow: 1, padding: Spacing.xl, justifyContent: 'center' },
  header:     { alignItems: 'center', marginBottom: Spacing.xl },
  emoji:      { fontSize: 52, marginBottom: Spacing.sm },
  title:      { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900 },
  subtitle:   { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginTop: 4 },
  field:      { marginBottom: Spacing.lg },
  label:      { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.ink, marginBottom: Spacing.xs },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSize.md,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    backgroundColor: Colors.card,
  },
  inputErr:   { borderColor: Colors.coral },
  errTxt:     { fontSize: FontSize.xs, fontFamily: 'Manrope_500Medium', color: Colors.coral, marginTop: 4 },
  demoSection: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: 'rgba(6,35,25,0.03)',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  demoTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  demoRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'space-between',
  },
  demoBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  demoBtnAdmin: {
    borderColor: Colors.amber,
    backgroundColor: '#FFF9E6',
  },
  demoBtnRole: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: 2,
  },
  demoBtnDetail: {
    fontSize: 9,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  adminLink:  { marginTop: Spacing.lg, alignItems: 'center' },
  adminLinkTxt: { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
  link:       { marginTop: Spacing.md, alignItems: 'center', marginBottom: Spacing.lg },
  linkTxt:    { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft },
  linkBold:   { fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
});

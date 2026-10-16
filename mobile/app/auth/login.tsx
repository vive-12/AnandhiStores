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
import { getDemoCredentials } from '../../config/demoCredentials';
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
  const demoCredentials = getDemoCredentials();

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
      setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status, mustChangePin: user.mustChangePin });
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

        {demoCredentials.length > 0 ? (
          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Development test logins</Text>
            <Text style={styles.demoHint}>Tap a role to fill the phone and PIN fields.</Text>
            {demoCredentials.map(({ role, credential }) => (
              <TouchableOpacity
                key={role}
                style={styles.demoRow}
                onPress={() => {
                  setPhone(credential.phone);
                  setPin(credential.pin);
                  setPhoneErr('');
                  setPinErr('');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Fill ${role} test login`}
              >
                <Text style={styles.demoRole}>{role === 'agent' ? credential.name ?? 'Agent' : role[0].toUpperCase() + role.slice(1)}</Text>
                <Text style={styles.demoCredentials}>Phone {credential.phone}  ·  PIN {credential.pin}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: Spacing.xl }}>
          <Button
            label="Sign in"
            onPress={handleLogin}
            loading={submitting}
            disabled={submitting}
          />
        </View>

        <TouchableOpacity
          onPress={() => router.push('/auth/register')}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel="New customer? Create account"
        >
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
  adminLink:  { marginTop: Spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  adminLinkTxt: { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
  link:       { marginTop: Spacing.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkTxt:    { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft },
  linkBold:   { fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
  demoBox:    { marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radius.button, backgroundColor: '#EAF3ED', borderWidth: 1, borderColor: Colors.line },
  demoTitle:  { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.green900 },
  demoHint:   { fontSize: FontSize.xs, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginTop: 3, marginBottom: Spacing.xs },
  demoRow:    { paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.line },
  demoRole:   { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
  demoCredentials: { fontSize: FontSize.xs, fontFamily: 'Manrope_500Medium', color: Colors.ink, marginTop: 2 },
});

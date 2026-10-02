// app/auth/register.tsx — Customer registration
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useSession } from '../../hooks/useSession';
import { registerCustomer } from '../../services/auth';
import { isValidPhone, isValidPin, normalisePhone } from '../../utils/compute';
import { Colors, FontSize, Spacing, Radius } from '../../theme';
import type { Address } from '../../types';

type Field = { value: string; error: string };
const field = (value = ''): Field => ({ value, error: '' });

export default function RegisterScreen() {
  const router         = useRouter();
  const { showToast }  = useToast();
  const { setSession } = useSession();

  const [name,     setName]     = useState(field());
  const [phone,    setPhone]    = useState(field());
  const [pin,      setPin]      = useState(field());
  const [pinConf,  setPinConf]  = useState(field());
  const [door,     setDoor]     = useState(field());
  const [street,   setStreet]   = useState(field());
  const [locality, setLocality] = useState(field());
  const [landmark, setLandmark] = useState(field());
  const [city,     setCity]     = useState({ value: 'Chennai', error: '' });

  const [submitting, setSubmitting] = useState(false);

  const set = (setter: React.Dispatch<React.SetStateAction<Field>>) =>
    (value: string) => setter(f => ({ value, error: '' }));

  const validate = useCallback(() => {
    let ok = true;

    if (!name.value.trim()) { setName(f => ({ ...f, error: 'Name is required' })); ok = false; }
    const p = normalisePhone(phone.value);
    if (!isValidPhone(p)) { setPhone(f => ({ ...f, error: 'Enter a valid 10-digit number' })); ok = false; }
    if (!isValidPin(pin.value)) { setPin(f => ({ ...f, error: 'PIN must be exactly 4 digits' })); ok = false; }
    if (pin.value !== pinConf.value) { setPinConf(f => ({ ...f, error: 'PINs do not match' })); ok = false; }
    if (!door.value.trim()) { setDoor(f => ({ ...f, error: 'Door / flat number required' })); ok = false; }
    if (!street.value.trim()) { setStreet(f => ({ ...f, error: 'Street required' })); ok = false; }
    if (!locality.value.trim()) { setLocality(f => ({ ...f, error: 'Locality required' })); ok = false; }

    return ok;
  }, [name, phone, pin, pinConf, door, street, locality]);

  const handleRegister = useCallback(async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const address: Address = {
        door:     door.value.trim(),
        street:   street.value.trim(),
        locality: locality.value.trim(),
        city:     city.value.trim() || 'Chennai',
        landmark: landmark.value.trim(),
        lat:      null,
        lng:      null,
      };
      const user = await registerCustomer({
        name:    name.value.trim(),
        phone:   normalisePhone(phone.value),
        pin:     pin.value,
        address,
      });
      setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
      // RouteGuard will redirect pending customer to awaiting-approval
    } catch (e: any) {
      showToast(e.message ?? 'Registration failed. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [validate, submitting, name, phone, pin, door, street, locality, city, landmark, setSession, showToast]);

  const InputField = ({ label, f, setter, ...props }: any) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, f.error ? styles.inputErr : null]}
        value={f.value}
        onChangeText={set(setter)}
        placeholderTextColor={Colors.inkSoft}
        {...props}
      />
      {f.error ? <Text style={styles.errTxt}>{f.error}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Fill in your details to get started</Text>

        <Text style={styles.section}>Personal details</Text>
        <InputField label="Full name" f={name} setter={setName} placeholder="e.g. Anandhi Ravi" autoCapitalize="words" />
        <InputField label="Phone number" f={phone} setter={setPhone} placeholder="9xxxxxxxxx" keyboardType="phone-pad" maxLength={10} />
        <InputField label="4-digit PIN" f={pin} setter={setPin} placeholder="• • • •" keyboardType="number-pad" secureTextEntry maxLength={4} />
        <InputField label="Confirm PIN" f={pinConf} setter={setPinConf} placeholder="• • • •" keyboardType="number-pad" secureTextEntry maxLength={4} />

        <Text style={styles.section}>Delivery address</Text>
        <InputField label="Door / flat no." f={door} setter={setDoor} placeholder="e.g. 4B, Ground floor" />
        <InputField label="Street" f={street} setter={setStreet} placeholder="e.g. Anna Salai" />
        <InputField label="Locality" f={locality} setter={setLocality} placeholder="e.g. Adyar" />
        <InputField label="City" f={city} setter={setCity} placeholder="Chennai" />
        <InputField label="Landmark (optional)" f={landmark} setter={setLandmark} placeholder="e.g. Near bus stop" />

        <View style={{ marginTop: Spacing.xl }}>
          <Button label="Create account" onPress={handleRegister} loading={submitting} disabled={submitting} />
        </View>

        <TouchableOpacity onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkTxt}>Already have an account? <Text style={styles.linkBold}>Sign in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.cream },
  container: { flexGrow: 1, padding: Spacing.xl, paddingTop: Spacing.xxl },
  title:     { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900, marginBottom: 4 },
  subtitle:  { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginBottom: Spacing.xl },
  section:   { fontSize: FontSize.sm, fontFamily: 'Manrope_800ExtraBold', color: Colors.inkSoft, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md, marginTop: Spacing.lg },
  field:     { marginBottom: Spacing.lg },
  label:     { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.ink, marginBottom: Spacing.xs },
  input: {
    height: 52, borderWidth: 1.5, borderColor: Colors.line, borderRadius: Radius.button,
    paddingHorizontal: Spacing.lg, fontSize: FontSize.md, fontFamily: 'Manrope_500Medium',
    color: Colors.ink, backgroundColor: Colors.card,
  },
  inputErr:  { borderColor: Colors.coral },
  errTxt:    { fontSize: FontSize.xs, fontFamily: 'Manrope_500Medium', color: Colors.coral, marginTop: 4 },
  link:      { marginTop: Spacing.xl, alignItems: 'center', paddingBottom: Spacing.xxl },
  linkTxt:   { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft },
  linkBold:  { fontFamily: 'Manrope_600SemiBold', color: Colors.green700 },
});

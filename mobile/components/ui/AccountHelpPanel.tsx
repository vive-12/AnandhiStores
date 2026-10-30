import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Linking, ScrollView } from 'react-native';
import { listenAccountHelp, clearPinFailures, AccountHelp } from '../../services/accountHelp';
import { findUserByPhone } from '../../services/users';
import { adminResetPin } from '../../services/auth';
import { Button } from './Button';
import { Colors, Spacing, FontSize } from '../../theme';
export function AccountHelpPanel() {
  const [rows, setRows] = useState<AccountHelp[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => listenAccountHelp(setRows, e => setError(e.message)), []);
  const reset = async () => {
    if (!selected || !/^\d{4}$/.test(pin) || busy) return;
    setBusy(true); setError('');
    try {
      const user = await findUserByPhone(selected);
      if (!user) throw new Error('No profile found for this phone. Contact them before creating an account.');
      await adminResetPin(user.id, user.phone, pin);
      await clearPinFailures(selected);
      setPin(''); setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reset PIN.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}>
    <Text style={{ color: Colors.ink, fontSize: FontSize.md }}>PIN help requests ({rows.length})</Text>
    {error ? <Text style={{ color: Colors.coral }}>{error}</Text> : null}
    {rows.length === 0 && <Text style={{ color: Colors.inkSoft }}>No unresolved requests.</Text>}
    {rows.map(row => <View key={row.id} style={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}>
      <Text style={{ color: Colors.ink }}>{row.name || row.phone} · {row.phone} · {row.attempts} attempts · {row.context === 'login' ? 'Sign-in' : 'Change PIN'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <Button label="Call" onPress={() => { Linking.openURL('tel:+91' + row.phone).catch(() => {}); }} />
        <Button label="Set temporary PIN" onPress={() => { setSelected(row.phone); setPin(''); }} />
        <Button label="Resolved" variant="secondary" onPress={() => { clearPinFailures(row.phone).catch(e => setError(e.message)); }} />
      </View>
    </View>)}
    {selected && <View style={{ gap: Spacing.sm }}>
      <Text style={{ color: Colors.ink }}>Temporary PIN for {selected}. Share it directly; their orders remain linked.</Text>
      <TextInput accessibilityLabel="Temporary PIN" secureTextEntry maxLength={4} keyboardType="number-pad" value={pin} onChangeText={setPin} style={{ borderWidth: 1, borderColor: Colors.line, padding: Spacing.md, color: Colors.ink }} />
      <Button label="Reset PIN" loading={busy} disabled={pin.length !== 4 || busy} onPress={reset} />
    </View>}
  </ScrollView>;
}

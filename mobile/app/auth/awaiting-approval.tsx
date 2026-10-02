// app/auth/awaiting-approval.tsx — Screen for pending customers
// Shown after registration until admin approves the account.
// RouteGuard redirects here automatically when status === 'pending'.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { listenUser } from '../../services/users';
import { logout } from '../../services/auth';
import { Colors, FontSize, Spacing } from '../../theme';

export default function AwaitingApprovalScreen() {
  const { uid, name, phone, setSession, clearSession } = useSession();

  // Listen for approval — when admin approves, status changes → RouteGuard redirects
  useEffect(() => {
    if (!uid) return;
    const unsub = listenUser(uid, user => {
      if (user && user.status === 'approved') {
        setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
      } else if (user && user.status === 'blocked') {
        clearSession();
        logout();
      }
    });
    return unsub;
  }, [uid]);

  const handleLogout = async () => {
    await logout();
    clearSession();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>⏳</Text>
        <Text style={styles.title}>Awaiting approval</Text>
        <Text style={styles.body}>
          Hi <Text style={styles.bold}>{name}</Text>, your account is pending review.
          {'\n\n'}
          The store will verify your details and approve your account shortly.
          Once approved you can start ordering — no action needed from you!
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Registered phone</Text>
          <Text style={styles.cardValue}>{phone}</Text>
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutTxt}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.cream },
  container:   { flex: 1, padding: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  icon:        { fontSize: 72, marginBottom: Spacing.xl },
  title:       { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900, marginBottom: Spacing.lg, textAlign: 'center' },
  body:        { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.xl },
  bold:        { fontFamily: 'Manrope_600SemiBold', color: Colors.ink },
  card:        { backgroundColor: Colors.card, borderRadius: 14, padding: Spacing.lg, width: '100%', marginBottom: Spacing.xl, alignItems: 'center' },
  cardLabel:   { fontSize: FontSize.xs, fontFamily: 'Manrope_600SemiBold', color: Colors.inkSoft, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardValue:   { fontSize: FontSize.lg, fontFamily: 'Manrope_800ExtraBold', color: Colors.green900 },
  logoutBtn:   { padding: Spacing.md },
  logoutTxt:   { fontSize: FontSize.sm, fontFamily: 'Manrope_600SemiBold', color: Colors.coral },
});

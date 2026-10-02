// app/dev/seed-admin.tsx — One-time screen to bootstrap the admin user in Firestore
// Navigate here: /dev/seed-admin
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { doc, setDoc, collection, query, where, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { hashPin } from '../../services/auth';
import { Colors, Spacing, FontSize, Radius } from '../../theme';

const ADMIN_PHONE = '9876543219';
const ADMIN_PIN   = '1234';
const ADMIN_NAME  = 'Store Admin';

export default function SeedAdmin() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    setStatus('Checking if admin already exists...');

    try {
      // Check if admin already exists
      const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const existing = snap.docs[0].data();
        setStatus(`✅ Admin already exists!\n\nDoc ID: ${snap.docs[0].id}\nName: ${existing.name}\nPhone: ${existing.phone}\nRole: ${existing.role}\nStatus: ${existing.status}\n\nYou can log in with this account.`);
        setDone(true);
        setLoading(false);
        return;
      }

      setStatus('Creating admin user...');

      // Hash the PIN
      const hashedPin = await hashPin(ADMIN_PIN, ADMIN_PHONE);

      // Create the admin user doc with a generated ID
      const adminRef = doc(collection(db, 'users'));
      await setDoc(adminRef, {
        role: 'admin',
        name: ADMIN_NAME,
        phone: ADMIN_PHONE,
        pin: hashedPin,
        plainPin: ADMIN_PIN,
        status: 'approved',
        isOnline: false,
        createdAt: serverTimestamp(),
      });

      setStatus(
        `✅ Admin user created successfully!\n\n` +
        `Doc ID: ${adminRef.id}\n` +
        `Name: ${ADMIN_NAME}\n` +
        `Phone: ${ADMIN_PHONE}\n` +
        `PIN: ${ADMIN_PIN}\n\n` +
        `You can now log in from the login screen using:\n` +
        `  Phone: ${ADMIN_PHONE}\n` +
        `  PIN: ${ADMIN_PIN}\n\n` +
        `Or use the 👑 Admin demo button.`
      );
      setDone(true);
    } catch (err: any) {
      setStatus(`❌ Error: ${err.message}`);
      console.error('Seed admin error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🔧 Admin Seed</Text>
      <Text style={styles.subtitle}>Bootstrap the admin user in Firestore</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Admin Account Details</Text>
        <Text style={styles.detail}>📱 Phone: {ADMIN_PHONE}</Text>
        <Text style={styles.detail}>🔑 PIN: {ADMIN_PIN}</Text>
        <Text style={styles.detail}>👤 Name: {ADMIN_NAME}</Text>
      </View>

      {!done && (
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSeed}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Create Admin User</Text>
          )}
        </TouchableOpacity>
      )}

      {status ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: Spacing.xl,
    paddingTop: 80,
    backgroundColor: Colors.cream,
  },
  title: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: Spacing.xl,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  detail: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    marginBottom: 6,
  },
  btn: {
    backgroundColor: Colors.green700,
    paddingVertical: 14,
    borderRadius: Radius.button,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontFamily: 'Manrope_700Bold',
  },
  statusBox: {
    marginTop: Spacing.xl,
    backgroundColor: '#F0FFF4',
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  statusText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    lineHeight: 22,
  },
});

// app/(customer)/account.tsx — Customer Profile, Address & Settings Screen
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useCart } from '../../hooks/useCart';
import { getUser, updateAddress, updateUser } from '../../services/users';
import { logout } from '../../services/auth';
import {
  ScreenHeader,
  Card,
  Button,
  NotificationBell,
  useToast,
} from '../../components/ui';
import type { Address } from '../../types';

export default function AccountScreen() {
  const router = useRouter();
  const { uid, name: sessionName, phone: sessionPhone, clearSession } = useSession();
  const { clearCart } = useCart();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Profile Form state
  const [name, setName] = useState(sessionName || '');
  const [door, setDoor] = useState('');
  const [street, setStreet] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('Chennai');
  const [landmark, setLandmark] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Load user profile from Firestore on mount
  useEffect(() => {
    async function loadProfile() {
      if (!uid) return;
      try {
        const u = await getUser(uid);
        if (u) {
          setName(u.name || sessionName || '');
          if (u.address) {
            setDoor(u.address.door || '');
            setStreet(u.address.street || '');
            setLocality(u.address.locality || '');
            setCity(u.address.city || 'Chennai');
            setLandmark(u.address.landmark || '');
            setLat(u.address.lat ?? null);
            setLng(u.address.lng ?? null);
          }
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [uid]);

  // GPS Location detection using expo-location
  const handleDetectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Needed',
          'Please allow location access to auto-detect your delivery address.',
          [{ text: 'OK' }],
        );
        setLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setLat(latitude);
      setLng(longitude);

      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });

        if (geo) {
          if (geo.street || geo.name) {
            setStreet([geo.name, geo.street].filter(Boolean).join(', '));
          }
          if (geo.district || geo.subregion) {
            setLocality(geo.district || geo.subregion || '');
          }
          if (geo.city) {
            setCity(geo.city);
          }
        }
        showToast(`Location detected: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
      } catch (_) {
        showToast(`GPS captured: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'info');
      }
    } catch (err: any) {
      console.error('Location error:', err);
      Alert.alert(
        'GPS Detection Failed',
        'Could not obtain your current location. Please ensure location/GPS is enabled on your phone and try again.',
      );
    } finally {
      setLocating(false);
    }
  };

  // Save address and profile
  const handleSave = async () => {
    if (saving || !uid) return;

    if (!locality.trim() && !street.trim()) {
      Alert.alert('Required Fields', 'Please enter your street name and locality.');
      return;
    }

    setSaving(true);
    try {
      const updatedAddress: Address = {
        door: door.trim(),
        street: street.trim(),
        locality: locality.trim(),
        city: city.trim() || 'Chennai',
        landmark: landmark.trim(),
        lat,
        lng,
      };

      await updateAddress(uid, updatedAddress);

      if (name.trim() && name.trim() !== sessionName) {
        await updateUser(uid, { name: name.trim() });
      }

      showToast('Delivery address updated successfully! 📍', 'success');
    } catch (err: any) {
      console.error('Failed to save address:', err);
      showToast(err.message || 'Could not update address. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Logout
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Anandhi Stores?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              clearCart();
              clearSession();
            } catch (err) {
              console.error('Logout error:', err);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Account"
        subtitle="Manage your profile and delivery address"
        right={<NotificationBell />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.green700} />
            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        ) : (
          <>
            {/* ─── Profile Overview Card ────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.profileHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {name ? name.charAt(0).toUpperCase() : '👤'}
                  </Text>
                </View>
                <View style={styles.profileDetails}>
                  <Text style={styles.profileName}>{name || 'Customer'}</Text>
                  <Text style={styles.profilePhone}>+91 {sessionPhone}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeDot}>●</Text>
                    <Text style={styles.statusBadgeText}>Approved Customer</Text>
                  </View>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter full name"
                  placeholderTextColor={Colors.inkSoft}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            {/* ─── Delivery Address Card ────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.addressHeader}>
                <Text style={styles.cardTitle}>Delivery Address</Text>
                <TouchableOpacity
                  style={styles.gpsBtn}
                  onPress={handleDetectLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={Colors.green700} />
                  ) : (
                    <>
                      <Text style={styles.gpsBtnIcon}>📍</Text>
                      <Text style={styles.gpsBtnText}>Use GPS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.cardSubtitle}>
                Orders will be delivered to this address via Cash on Delivery.
              </Text>

              {/* GPS Coordinates Notice */}
              {lat && lng ? (
                <View style={styles.coordsChip}>
                  <Text style={styles.coordsIcon}>🧭</Text>
                  <Text style={styles.coordsText}>
                    GPS Pin: {lat.toFixed(5)}, {lng.toFixed(5)}
                  </Text>
                </View>
              ) : null}

              {/* Form Fields */}
              <View style={styles.formGrid}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Door / Flat / Building No.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Flat 3B, Sunshine Apts, #12"
                    placeholderTextColor={Colors.inkSoft}
                    value={door}
                    onChangeText={setDoor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Street / Road *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2nd Main Road, Gandhi Nagar"
                    placeholderTextColor={Colors.inkSoft}
                    value={street}
                    onChangeText={setStreet}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Locality / Area *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Adyar, Velachery, T. Nagar"
                    placeholderTextColor={Colors.inkSoft}
                    value={locality}
                    onChangeText={setLocality}
                  />
                </View>

                <View style={styles.rowFields}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>City</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Chennai"
                      placeholderTextColor={Colors.inkSoft}
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>

                  <View style={[styles.fieldGroup, { flex: 1.5 }]}>
                    <Text style={styles.fieldLabel}>Landmark</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Near Bus Stop"
                      placeholderTextColor={Colors.inkSoft}
                      value={landmark}
                      onChangeText={setLandmark}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.saveBtnWrap}>
                <Button
                  label={saving ? 'Saving Address...' : 'Save Address'}
                  variant="primary"
                  loading={saving}
                  disabled={saving}
                  onPress={handleSave}
                />
              </View>
            </View>

            {/* ─── Store Help & Contact Card ─────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Store & Customer Support</Text>
              <Text style={styles.cardSubtitle}>
                Need to add items, modify an order, or check timings?
              </Text>

              <View style={styles.supportButtons}>
                <TouchableOpacity
                  style={[styles.supportBtn, { backgroundColor: '#25D366' }]}
                  onPress={() =>
                    Linking.openURL(
                      'whatsapp://send?phone=919600102028&text=Hi%20Anandhi%20Stores,%20I%20have%20a%20question%20regarding%20my%20order.',
                    ).catch(() =>
                      Alert.alert('Error', 'WhatsApp is not installed.'),
                    )
                  }
                >
                  <Text style={styles.supportBtnIcon}>💬</Text>
                  <Text style={styles.supportBtnText}>WhatsApp Store</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.supportBtn, { backgroundColor: Colors.green700 }]}
                  onPress={() =>
                    Linking.openURL('tel:9600102028').catch(() =>
                      Alert.alert('Error', 'Calling not supported.'),
                    )
                  }
                >
                  <Text style={styles.supportBtnIcon}>📞</Text>
                  <Text style={styles.supportBtnText}>Call Store</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ─── Logout Button ────────────────────────────────────────────── */}
            <View style={styles.logoutWrap}>
              <Button
                label="Log Out"
                variant="danger"
                onPress={handleLogout}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  loadingBox: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.green900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    color: '#ffffff',
    fontFamily: 'Manrope_800ExtraBold',
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  profilePhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusBadgeDot: {
    fontSize: 8,
    color: Colors.green500,
  },
  statusBadgeText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green500,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  cardSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginBottom: Spacing.md,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.green700,
  },
  gpsBtnIcon: {
    fontSize: 12,
  },
  gpsBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  coordsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  coordsIcon: {
    fontSize: 14,
  },
  coordsText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: '#1D4ED8',
  },
  formGrid: {
    gap: Spacing.md,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  input: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  saveBtnWrap: {
    marginTop: Spacing.lg,
  },
  supportButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  supportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.button,
    gap: 6,
  },
  supportBtnIcon: {
    fontSize: 16,
  },
  supportBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#ffffff',
  },
  logoutWrap: {
    marginTop: Spacing.sm,
  },
});

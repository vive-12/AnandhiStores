import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import axios from 'axios';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { API_BASE } from '../../config/api';

export default function AccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [capturedAddress, setCapturedAddress] = useState(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', 
    door_number: '', flat_house_name: '', street_number: '', locality: '', city: '', landmark: '',
    lat: null, lng: null,
  });

  useEffect(() => {
    const loadUser = async () => {
      const data = await AsyncStorage.getItem('user');
      if (data) {
        const parsed = JSON.parse(data);
        const u = parsed.user || parsed;
        setUser(u);
        setForm({
          first_name: u.first_name || '', last_name: u.last_name || '', phone: u.phone || '',
          door_number: u.door_number || '', flat_house_name: u.flat_house_name || '', 
          street_number: u.street_number || '', locality: u.locality || '', 
          city: u.city || '', landmark: u.landmark || '',
          lat: u.lat || null, lng: u.lng || null,
        });
        if (u.lat && u.lng) setCapturedAddress(`GPS stored: ${Number(u.lat).toFixed(5)}, ${Number(u.lng).toFixed(5)}`);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    router.replace('/auth/login');
  };

  const getLocation = async () => {
    setLocating(true);
    setCapturedAddress(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Needed',
          'Go to Settings → AquaRush → Location → Allow While Using App',
          [{ text: 'OK' }]
        );
        setLocating(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;
      setForm(prev => ({ ...prev, lat: latitude, lng: longitude }));
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          const parts = [geo.streetNumber, geo.street, geo.district, geo.subregion, geo.city, geo.region].filter(Boolean);
          setCapturedAddress(parts.join(', '));
          setForm(prev => ({
            ...prev,
            street_number: prev.street_number || [geo.streetNumber, geo.street].filter(Boolean).join(' '),
            locality: prev.locality || geo.district || geo.subregion || '',
            city: prev.city || geo.city || geo.subregion || '',
          }));
        }
      } catch (_) { setCapturedAddress(`GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`); }
    } catch (e) {
      Alert.alert('Error', 'Could not get location. Make sure GPS is ON.');
    }
    setLocating(false);
  };

  const handleMapDrag = async (coordinate) => {
    const { latitude, longitude } = coordinate;
    setForm(prev => ({ ...prev, lat: latitude, lng: longitude }));
    
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo) {
        const parts = [geo.streetNumber, geo.street, geo.district, geo.subregion, geo.city, geo.region].filter(Boolean);
        setCapturedAddress(parts.join(', '));
        setForm(prev => ({
          ...prev,
          street_number: [geo.streetNumber, geo.street].filter(Boolean).join(' ') || prev.street_number,
          locality: geo.district || geo.subregion || prev.locality,
          city: geo.city || geo.subregion || prev.city,
        }));
      }
    } catch (_) {}
  };

  const handleUpdate = async () => {
    if (!form.first_name || !form.phone || !form.door_number || !form.locality || !form.city) {
      return Alert.alert('Error', 'Please fill all required fields');
    }
    setLoading(true);
    try {
      await axios.patch(`${API_BASE}/users/${user.id}/profile`, form);
      await AsyncStorage.removeItem('user');
      Alert.alert('Profile Updated', 'Your profile has been updated and sent to admin for review. You will be logged out until approved.', [
        { text: 'OK', onPress: () => router.replace('/auth/login') }
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  if (!user) return <ActivityIndicator style={{flex: 1}} />;

  if (editing) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#f0f9ff' }}>
        <ScrollView style={styles.container} contentContainerStyle={{paddingBottom: 250}} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => setEditing(false)}>
          <Ionicons name="arrow-back" size={24} color="#64748b" />
          <Text style={{color: '#64748b', fontSize: 16, marginLeft: 8}}>Cancel Edit</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Edit Profile</Text>
        
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput style={styles.input} placeholder="First Name *" value={form.first_name} onChangeText={t => setForm({...form, first_name: t})} />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput style={styles.input} placeholder="Last Name" value={form.last_name} onChangeText={t => setForm({...form, last_name: t})} />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput style={styles.input} placeholder="Phone Number *" keyboardType="phone-pad" maxLength={10} value={form.phone} onChangeText={t => setForm({...form, phone: t})} />
        </View>

        <Text style={[styles.subtitle, {marginTop: 10, marginBottom: 10}]}>Address Details</Text>

        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={[styles.inputContainer, {flex: 1}]}>
            <TextInput style={styles.input} placeholder="Door No. *" value={form.door_number} onChangeText={t => setForm({...form, door_number: t})} />
          </View>
          <View style={[styles.inputContainer, {flex: 1}]}>
            <TextInput style={styles.input} placeholder="Flat/House Name" value={form.flat_house_name} onChangeText={t => setForm({...form, flat_house_name: t})} />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Street Number/Name" value={form.street_number} onChangeText={t => setForm({...form, street_number: t})} />
        </View>

        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Locality/Area *" value={form.locality} onChangeText={t => setForm({...form, locality: t})} />
        </View>

        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={[styles.inputContainer, {flex: 1}]}>
            <TextInput style={styles.input} placeholder="City *" value={form.city} onChangeText={t => setForm({...form, city: t})} />
          </View>
          <View style={[styles.inputContainer, {flex: 1}]}>
            <TextInput style={styles.input} placeholder="Landmark" value={form.landmark} onChangeText={t => setForm({...form, landmark: t})} />
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.locationBox}>
          <View style={styles.locationHeader}>
            <Ionicons name="location" size={22} color={form.lat ? '#10b981' : '#0ea5e9'} />
            <Text style={styles.locationTitle}>
              {form.lat ? '📍 Location Captured!' : '📍 Set Your Exact Location'}
            </Text>
          </View>

          {capturedAddress ? (
            <Text style={styles.capturedAddr}>{capturedAddress}</Text>
          ) : null}

          {form.lat && form.lng ? (
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: parseFloat(form.lat),
                  longitude: parseFloat(form.lng),
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                onRegionChangeComplete={(region) => handleMapDrag(region)}
              />
              <View style={styles.centerPinMarker} pointerEvents="none">
                <Ionicons name="location" size={40} color="#ef4444" />
              </View>
              <Text style={styles.mapInstruction}>
                <Ionicons name="move" size={14} color="#64748b" /> Drag the map to place the pin at your exact location.
              </Text>
              <TouchableOpacity style={styles.locBtnSmall} onPress={getLocation} disabled={locating}>
                {locating ? <ActivityIndicator color="#0ea5e9" size="small" /> : <Ionicons name="locate" size={16} color="#0ea5e9" />}
                <Text style={styles.locBtnSmallTxt}>Reset to Current Location</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.locationHint}>
                Tap below to update your location.
              </Text>
              <TouchableOpacity
                style={styles.locBtn}
                onPress={getLocation}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="navigate" size={20} color="#fff" />
                )}
                <Text style={styles.locBtnTxt}>
                  {locating ? 'Getting Location…' : 'Get My Current Location'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity style={[styles.btn, {marginTop: 20}]} onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submit for Review</Text>}
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="#0ea5e9" />
        </View>
        <Text style={styles.name}>{user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.name}</Text>
        <Text style={styles.phone}>{user.phone}</Text>
      </View>

      <View style={styles.menuGroup}>
        <TouchableOpacity style={styles.menuItem} onPress={() => setEditing(true)}>
          <Ionicons name="create-outline" size={24} color="#64748b" />
          <Text style={styles.menuTxt}>Edit Profile & Address</Text>
          <Ionicons name="chevron-forward" size={20} color="#cbd5e1" style={styles.menuArrow} />
        </TouchableOpacity>
        
        <View style={styles.divider} />
        
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="headset-outline" size={24} color="#64748b" />
          <Text style={styles.menuTxt}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color="#cbd5e1" style={styles.menuArrow} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color="#ef4444" />
        <Text style={styles.logoutTxt}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff', padding: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginBottom: 20 },
  subtitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  profileCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  name: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  phone: { fontSize: 16, color: '#64748b' },
  menuGroup: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuTxt: { flex: 1, fontSize: 16, color: '#334155', marginLeft: 16, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 56 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#fecaca', gap: 8 },
  logoutTxt: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, marginBottom: 12 },
  icon: { marginRight: 12 },
  input: { flex: 1, height: 50, fontSize: 16, color: '#1e293b' },
  locationBox: { backgroundColor: '#f0f9ff', borderWidth: 1.5, borderColor: '#bae6fd', borderRadius: 16, padding: 16, marginBottom: 12, marginTop: 12 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  locationTitle: { fontSize: 16, fontWeight: '800', color: '#0369a1' },
  locationHint: { fontSize: 13, color: '#0369a1', marginBottom: 12, lineHeight: 18 },
  capturedAddr: { fontSize: 13, color: '#0f172a', marginBottom: 8, lineHeight: 18, fontWeight: '500' },
  locBtn: { backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  locBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mapContainer: { marginTop: 8, overflow: 'hidden', position: 'relative' },
  map: { width: '100%', height: 200, borderRadius: 12, marginBottom: 8 },
  centerPinMarker: { position: 'absolute', top: 100 - 40, left: '50%', marginLeft: -20, zIndex: 10 },
  mapInstruction: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 },
  locBtnSmall: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#e0f2fe', paddingVertical: 10, borderRadius: 10 },
  locBtnSmallTxt: { color: '#0ea5e9', fontWeight: '700', fontSize: 14 },
  btn: { backgroundColor: '#0ea5e9', height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' }
});

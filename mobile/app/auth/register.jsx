import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { API_BASE } from '../../config/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ 
    first_name: '', last_name: '', phone: '', 
    door_number: '', flat_house_name: '', street_number: '', locality: '', city: '', landmark: '',
    lat: null, lng: null 
  });
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [capturedAddress, setCapturedAddress] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const getLocation = async () => {
    setLocating(true);
    setCapturedAddress(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Needed',
          'Please allow location access in your phone Settings → AquaRush → Location → While Using the App',
          [{ text: 'OK' }]
        );
        setLocating(false);
        return;
      }

      Alert.alert('Getting Location', 'Please wait while we find your exact location…');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;
      setForm(prev => ({ ...prev, lat: latitude, lng: longitude }));

      // Reverse geocode to show human-readable address
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          const parts = [geo.streetNumber, geo.street, geo.district, geo.subregion, geo.city, geo.region].filter(Boolean);
          setCapturedAddress(parts.join(', '));
          // Auto-fill address fields if they are empty
          setForm(prev => ({
            ...prev,
            street_number: prev.street_number || [geo.streetNumber, geo.street].filter(Boolean).join(' '),
            locality: prev.locality || geo.district || geo.subregion || '',
            city: prev.city || geo.city || geo.subregion || '',
          }));
        }
      } catch (_) {}
    } catch (e) {
      Alert.alert('Location Error', 'Could not get location. Make sure GPS is turned on and try again.');
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

  const handleRegister = async () => {
    if (!form.first_name || !form.phone || !form.door_number || !form.locality || !form.city) {
      return Alert.alert('Error', 'Please fill all required fields');
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/users/register`, form);
      Alert.alert('Success', 'Profile created! It is pending review. An agent will visit your location to approve and generate your PIN.', [
        { text: 'OK', onPress: () => router.replace('/') }
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 250 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Profile</Text>
        <Text style={styles.subtitle}>Register for AquaRush delivery</Text>

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
                Tap below so our agent can find you accurately for the first visit.
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

          {!form.lat && (
            <Text style={styles.locationNote}>
              ⚠️ Make sure your phone's GPS is turned ON before tapping.
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submit Profile</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '800', color: '#0ea5e9', marginBottom: 8, marginTop: 40 },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, marginBottom: 12 },
  icon: { marginRight: 12 },
  input: { flex: 1, minHeight: 56, fontSize: 16, color: '#1e293b', paddingTop: 16, paddingBottom: 16 },
  locationBox: { backgroundColor: '#f0f9ff', borderWidth: 1.5, borderColor: '#bae6fd', borderRadius: 16, padding: 16, marginBottom: 24, marginTop: 8 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  locationTitle: { fontSize: 16, fontWeight: '800', color: '#0369a1' },
  locationHint: { fontSize: 13, color: '#0369a1', marginBottom: 12, lineHeight: 18 },
  capturedAddr: { fontSize: 13, color: '#0f172a', marginBottom: 8, lineHeight: 18, fontWeight: '500' },
  gpsCoords: { fontSize: 12, color: '#10b981', fontWeight: '700', marginBottom: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  locationNote: { fontSize: 12, color: '#b45309', marginTop: 10, textAlign: 'center' },
  locBtn: { backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  locBtnSuccess: { backgroundColor: '#10b981' },
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

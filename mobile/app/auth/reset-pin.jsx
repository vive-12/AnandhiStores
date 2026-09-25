import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../../config/api';

export default function ResetPinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('tempUser').then(data => {
      if (data) setUser(JSON.parse(data));
    });
  }, []);

  const handleSetPin = async () => {
    if (!user) return;
    if (pin.length !== 4) return Alert.alert('Error', 'PIN must be 4 digits');
    if (pin !== confirmPin) return Alert.alert('Error', 'PINs do not match');
    setLoading(true);
    try {
      const { data } = await axios.patch(`${API_BASE}/users/${user.id}/set_pin`, { pin });
      await AsyncStorage.setItem('user', JSON.stringify(data));
      await AsyncStorage.removeItem('tempUser');
      router.replace('/(customer)');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Set New PIN</Text>
        <Text style={styles.subtitle}>Please set your new 4-digit PIN for future logins.</Text>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="New 4-Digit PIN"
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Confirm PIN"
            keyboardType="number-pad"
            secureTextEntry
            value={confirmPin}
            onChangeText={setConfirmPin}
            maxLength={4}
          />
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleSetPin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save PIN</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: '#0ea5e9', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 32 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, marginBottom: 16 },
  icon: { marginRight: 12 },
  input: { flex: 1, height: 56, fontSize: 16, color: '#1e293b' },
  btn: { backgroundColor: '#0ea5e9', height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' }
});

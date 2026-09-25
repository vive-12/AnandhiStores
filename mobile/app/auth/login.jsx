import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../../config/api';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !pin) return Alert.alert('Error', 'Please enter phone and PIN');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/users/login`, { phone, pin });
      if (data.requireNewPin) {
        await AsyncStorage.setItem('tempUser', JSON.stringify(data.user));
        setLoading(false);
        return router.push({ pathname: '/auth/reset-pin', params: { phone, currentPin: pin } });
      }
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      router.replace('/(customer)');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>AquaRush 💧</Text>
        <Text style={styles.subtitle}>Enter your phone number and PIN to continue</Text>

        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={10}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="4-Digit PIN"
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
          />
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Login</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.push('/auth/register')} style={{marginTop: 20}}>
          <Text style={{color: '#0ea5e9', textAlign: 'center', fontSize: 16}}>Don't have an account? Register</Text>
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

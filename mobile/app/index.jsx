import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  const router = useRouter();
  
  const handleCustomerPress = async () => {
    const user = await AsyncStorage.getItem('user');
    if (user) {
      router.push('/(customer)');
    } else {
      router.push('/auth/login');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.dropEmoji}>💧</Text>
        <Text style={styles.appName}>AquaRush</Text>
        <Text style={styles.tagline}>20L Water Can  •  15 Minutes  •  ₹30</Text>
      </View>

      <Text style={styles.sectionTitle}>I am a…</Text>

      <TouchableOpacity style={[styles.card, { backgroundColor: '#0ea5e9' }]} onPress={handleCustomerPress}>
        <Ionicons name="water" size={36} color="#fff" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Customer</Text>
          <Text style={styles.cardSub}>Order water cans in 15 min</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, { backgroundColor: '#10b981' }]} onPress={() => router.push('/agent/dashboard')}>
        <Ionicons name="bicycle" size={36} color="#fff" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Delivery Agent</Text>
          <Text style={styles.cardSub}>View and fulfill pending orders</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, { backgroundColor: '#8b5cf6' }]} onPress={() => router.push('/admin/alerts')}>
        <Ionicons name="shield-checkmark" size={36} color="#fff" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Admin</Text>
          <Text style={styles.cardSub}>Alerts and empty can returns</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.footer}>Cash on Delivery only  •  Free delivery</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f0f9ff', padding: 24, paddingTop: 60 },
  hero:        { alignItems: 'center', marginBottom: 40 },
  dropEmoji:   { fontSize: 64, marginBottom: 8 },
  appName:     { fontSize: 36, fontWeight: '900', color: '#0ea5e9', letterSpacing: 2 },
  tagline:     { fontSize: 13, color: '#64748b', marginTop: 4 },
  sectionTitle:{ fontSize: 16, color: '#64748b', fontWeight: '600', marginBottom: 12 },
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 20, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  cardText:    { flex: 1, marginLeft: 16 },
  cardTitle:   { fontSize: 18, fontWeight: '700', color: '#fff' },
  cardSub:     { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  footer:      { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 24 },
});

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert } from 'react-native';
import axios from 'axios';
import { ENDPOINTS } from '../../config/api';

export default function AdminLayout() {
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [dismissedOrders, setDismissedOrders] = useState([]);

  useEffect(() => {
    // Poll for new orders every 5 seconds
    const interval = setInterval(async () => {
      if (newOrderAlert) return; // don't poll if already alerting
      try {
        const { data } = await axios.get(ENDPOINTS.orders);
        const placedOrders = data.filter(o => o.status === 'placed');
        
        // Find a placed order that we haven't dismissed yet
        const newOrder = placedOrders.find(o => !dismissedOrders.includes(o.id));
        if (newOrder) {
          // Trigger alert
          setNewOrderAlert(newOrder);
        }
      } catch (e) {
        // ignore errors for polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [newOrderAlert, dismissedOrders]);

  const dismissAlert = () => {
    if (newOrderAlert) {
      setDismissedOrders(prev => [...prev, newOrderAlert.id]);
    }
    setNewOrderAlert(null);
  };

  return (
    <>
      <Tabs screenOptions={{
        headerStyle: { backgroundColor: '#8b5cf6' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#8b5cf6',
      }}>
        <Tabs.Screen 
          name="alerts" 
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} />
          }} 
        />
        <Tabs.Screen 
          name="profiles" 
          options={{
            title: 'Profiles',
            tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} />
          }} 
        />
        <Tabs.Screen 
          name="agents" 
          options={{
            title: 'Agents',
            tabBarIcon: ({ color }) => <Ionicons name="bicycle" size={24} color={color} />
          }} 
        />
        <Tabs.Screen 
          name="inventory" 
          options={{
            title: 'Inventory',
            tabBarIcon: ({ color }) => <Ionicons name="cube" size={24} color={color} />
          }} 
        />
        <Tabs.Screen 
          name="offers" 
          options={{
            title: 'Offers',
            tabBarIcon: ({ color }) => <Ionicons name="megaphone" size={24} color={color} />
          }} 
        />
      </Tabs>

      {newOrderAlert && (
        <Modal transparent animationType="fade">
          <View style={styles.alertBg}>
            <View style={styles.alertCard}>
              <Ionicons name="notifications-circle" size={80} color="#ef4444" style={styles.bellIcon} />
              <Text style={styles.alertTitle}>🚨 NEW ORDER ALERT 🚨</Text>
              <Text style={styles.alertMsg}>
                New order #{newOrderAlert.id} received from {newOrderAlert.customer_name}.
              </Text>
              <Text style={styles.alertSub}>Tap to dismiss this notification.</Text>
              
              <TouchableOpacity style={styles.dismissBtn} onPress={dismissAlert}>
                <Text style={styles.dismissTxt}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  alertBg: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.9)', // Red translucent background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  bellIcon: {
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ef4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  alertMsg: {
    fontSize: 18,
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600'
  },
  alertSub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  dismissBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  dismissTxt: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
  }
});

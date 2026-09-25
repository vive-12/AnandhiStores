import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function CustomerLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: true,
      tabBarActiveTintColor: '#0ea5e9',
      tabBarInactiveTintColor: '#94a3b8',
      tabBarStyle: {
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        elevation: 0,
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
      },
      headerStyle: {
        backgroundColor: '#fff',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
      },
      headerTitleStyle: {
        fontWeight: '800',
        color: '#0f172a',
      }
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Order Water',
          tabBarLabel: 'Order',
          tabBarIcon: ({ color, size }) => <Ionicons name="water" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Order History',
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'My Account',
          tabBarLabel: 'Account',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />
        }}
      />
    </Tabs>
  );
}

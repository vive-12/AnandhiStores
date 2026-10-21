// app/(customer)/_layout.tsx — Customer tabs with auth guard
import React from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';
import { Colors, FontSize } from '../../theme';

export default function CustomerLayout() {
  const { uid, role, status, isLoading } = useSession();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
  const tabHeight = 56 + bottomInset;

  // Still restoring session — render nothing (root layout shows branded splash)
  if (isLoading) return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;

  if (!uid || role !== 'customer') {
    return <Redirect href="/auth/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown:             false,   // Each screen uses ScreenHeader
        tabBarActiveTintColor:   Colors.green700,
        tabBarInactiveTintColor: Colors.inkSoft,
        tabBarStyle: {
          borderTopWidth:    1,
          borderTopColor:    Colors.line,
          backgroundColor:   Colors.card,
          height:            tabHeight,
          paddingBottom:     bottomInset,
          paddingTop:        8,
          paddingLeft:       Math.max(insets.left, 4),
          paddingRight:      Math.max(insets.right, 4),
        },
        tabBarLabelStyle: {
          fontSize:   10,
          fontFamily: 'Manrope_600SemiBold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🛒</Text>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarLabel: 'Orders',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📦</Text>,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}

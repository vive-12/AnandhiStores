// app/(customer)/_layout.tsx — Customer tabs with auth guard
import React from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSession } from '../../hooks/useSession';
import { Colors, FontSize } from '../../theme';

export default function CustomerLayout() {
  const { uid, role, status, isLoading } = useSession();

  // Still restoring session — render nothing (root layout shows branded splash)
  if (isLoading) return null;

  if (!uid || role !== 'customer') {
    return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
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
          height:            60,
          paddingBottom:     8,
          paddingTop:        8,
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
        name="account"
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}

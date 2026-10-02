// app/agent/_layout.tsx — Agent Stack with auth guard
// Agent screens use a Stack (not Tabs) — dashboard is the root, delivery detail pushes on top.
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../../hooks/useSession';
import { Colors } from '../../theme';

export default function AgentLayout() {
  const { uid, role, isLoading } = useSession();

  if (isLoading) return null;
  if (!uid || role !== 'agent') return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;

  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: Colors.green900 },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18 },
        contentStyle:     { backgroundColor: Colors.cream },
      }}
    />
  );
}

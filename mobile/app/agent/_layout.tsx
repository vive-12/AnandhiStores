// app/agent/_layout.tsx — Agent Stack with auth guard
// Agent screens use a Stack (not Tabs) — dashboard is the root, delivery detail pushes on top.
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../../hooks/useSession';
import { Colors } from '../../theme';

export default function AgentLayout() {
  const { uid, role, isLoading } = useSession();

  // Wait for session restoration before deciding
  if (isLoading) return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
  // Not an agent → redirect to login (works correctly on both iOS & Android)
  if (!uid || role !== 'agent') return <Redirect href="/auth/login" />;

  return (
    <Stack
      id="agent-stack"
      screenOptions={{
        headerStyle:      { backgroundColor: Colors.green900 },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18 },
        contentStyle:     { backgroundColor: Colors.cream },
      }}
    />
  );
}

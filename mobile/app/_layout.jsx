import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0ea5e9" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0ea5e9' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        }}
      />
    </>
  );
}

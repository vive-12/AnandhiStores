// app/index.tsx — Root index
// This file only renders briefly before RouteGuard (in _layout.tsx)
// redirects the user to their role-specific dashboard or the login screen.
import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../theme';

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.amber} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.green900,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

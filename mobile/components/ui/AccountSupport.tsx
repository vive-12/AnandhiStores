import React from 'react';
import { View, Text, Linking } from 'react-native';
import { Button } from './Button';
import { Colors, Spacing } from '../../theme';
import { SUPPORT_PHONE } from '../../services/accountHelp';
export function AccountSupport() {
  return <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
    <Text style={{ color: Colors.ink }}>Having trouble with your PIN? Vivek can help. Your orders and can balances are safe.</Text>
    <Button label="Call Vivek" onPress={() => { Linking.openURL('tel:+91' + SUPPORT_PHONE).catch(() => {}); }} />
    <Button label="WhatsApp Vivek" variant="secondary" onPress={() => { Linking.openURL('https://wa.me/91' + SUPPORT_PHONE + '?text=' + encodeURIComponent('I need help signing in or changing my Anandhi Stores PIN.')).catch(() => {}); }} />
  </View>;
}

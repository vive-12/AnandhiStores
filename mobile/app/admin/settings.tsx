// app/admin/settings.tsx — Store Settings & Configuration screen for Admin
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useSettings } from '../../hooks/useSettings';
import { useSession } from '../../hooks/useSession';
import { saveSettings } from '../../services/settings';
import { logout } from '../../services/auth';
import { ScreenHeader, Button, useToast } from '../../components/ui';
import type { Settings } from '../../types';

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { clearSession } = useSession();
  const { settings, loading, error } = useSettings();

  const [saving, setSaving] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Admin Log Out',
      'Are you sure you want to sign out of the Admin panel?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              clearSession();
            } catch (err) {
              console.error('Logout error:', err);
            }
          },
        },
      ],
    );
  };

  // Form states
  const [minOrderValue, setMinOrderValue] = useState('99');
  const [deliveryFee, setDeliveryFee] = useState('20');
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState('299');
  const [openTime, setOpenTime] = useState('07:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [isStoreOpenOverride, setIsStoreOpenOverride] = useState<null | true | false>(null);
  const [slots, setSlots] = useState<string[]>(['ASAP', 'Morning 7–9 AM', 'Evening 5–7 PM']);
  const [newSlotInput, setNewSlotInput] = useState('');
  const [agentFeePerDelivery, setAgentFeePerDelivery] = useState('30');

  // Populate from Firestore
  useEffect(() => {
    if (settings) {
      setMinOrderValue(String(settings.minOrderValue ?? 99));
      setDeliveryFee(String(settings.deliveryFee ?? 20));
      setFreeDeliveryAbove(String(settings.freeDeliveryAbove ?? 299));
      setOpenTime(settings.openTime || '07:00');
      setCloseTime(settings.closeTime || '21:00');
      setIsStoreOpenOverride(settings.isStoreOpenOverride ?? null);
      if (Array.isArray(settings.slots) && settings.slots.length > 0) {
        setSlots(settings.slots);
      }
      setAgentFeePerDelivery(String(settings.agentFeePerDelivery ?? 30));
    }
  }, [settings]);

  // Add a new delivery slot
  const handleAddSlot = () => {
    const trimmed = newSlotInput.trim();
    if (!trimmed) return;
    if (slots.includes(trimmed)) {
      showToast('Slot already exists', 'info');
      return;
    }
    setSlots(prev => [...prev, trimmed]);
    setNewSlotInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Remove a delivery slot
  const handleRemoveSlot = (indexToRemove: number) => {
    if (slots.length <= 1) {
      Alert.alert('Required', 'At least one delivery slot is required.');
      return;
    }
    setSlots(prev => prev.filter((_, idx) => idx !== indexToRemove));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Move slot up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSlots(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
    Haptics.selectionAsync();
  };

  // Move slot down
  const handleMoveDown = (index: number) => {
    if (index === slots.length - 1) return;
    setSlots(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
    Haptics.selectionAsync();
  };

  // Validate and Save
  const handleSave = async () => {
    if (saving) return;

    const minOrder = parseFloat(minOrderValue);
    const fee = parseFloat(deliveryFee);
    const freeAbove = parseFloat(freeDeliveryAbove);
    const agentFee = parseFloat(agentFeePerDelivery);

    if (isNaN(minOrder) || minOrder < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid minimum order value.');
      return;
    }
    if (isNaN(fee) || fee < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid delivery fee.');
      return;
    }
    if (isNaN(freeAbove) || freeAbove < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid free delivery threshold.');
      return;
    }
    if (isNaN(agentFee) || agentFee < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid agent delivery fee.');
      return;
    }

    // Time validation (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(openTime.trim()) || !timeRegex.test(closeTime.trim())) {
      Alert.alert('Invalid Time', 'Store hours must be in 24-hour HH:mm format (e.g. 07:00, 21:30).');
      return;
    }

    if (slots.length === 0) {
      Alert.alert('Delivery Slots', 'Please add at least one delivery slot.');
      return;
    }

    setSaving(true);
    try {
      const updatedSettings: Settings = {
        minOrderValue: minOrder,
        deliveryFee: fee,
        freeDeliveryAbove: freeAbove,
        openTime: openTime.trim(),
        closeTime: closeTime.trim(),
        isStoreOpenOverride,
        slots,
        agentFeePerDelivery: agentFee,
      };

      await saveSettings(updatedSettings);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Store settings updated live! ⚙️', 'success');
      router.back();
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      showToast(err.message || 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Store Settings"
        subtitle="Delivery fees, hours, slots & payouts"
        showBack
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.green700} />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            {/* ─── Store Operational Status (Override) ────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Store Open / Closed Status</Text>
              <Text style={styles.cardSubtitle}>
                Control whether customers can place orders right now.
              </Text>

              <View style={styles.overrideOptions}>
                {/* Auto Mode */}
                <TouchableOpacity
                  style={[
                    styles.overrideBtn,
                    isStoreOpenOverride === null && styles.overrideBtnActive,
                  ]}
                  onPress={() => setIsStoreOpenOverride(null)}
                >
                  <Text style={styles.overrideBtnIcon}>⏰</Text>
                  <Text
                    style={[
                      styles.overrideBtnText,
                      isStoreOpenOverride === null && styles.overrideBtnTextActive,
                    ]}
                  >
                    Auto (Hours)
                  </Text>
                </TouchableOpacity>

                {/* Force Open */}
                <TouchableOpacity
                  style={[
                    styles.overrideBtn,
                    isStoreOpenOverride === true && styles.overrideBtnOpenActive,
                  ]}
                  onPress={() => setIsStoreOpenOverride(true)}
                >
                  <Text style={styles.overrideBtnIcon}>🟢</Text>
                  <Text
                    style={[
                      styles.overrideBtnText,
                      isStoreOpenOverride === true && styles.overrideBtnTextActive,
                    ]}
                  >
                    Force Open
                  </Text>
                </TouchableOpacity>

                {/* Force Closed */}
                <TouchableOpacity
                  style={[
                    styles.overrideBtn,
                    isStoreOpenOverride === false && styles.overrideBtnClosedActive,
                  ]}
                  onPress={() => setIsStoreOpenOverride(false)}
                >
                  <Text style={styles.overrideBtnIcon}>🔴</Text>
                  <Text
                    style={[
                      styles.overrideBtnText,
                      isStoreOpenOverride === false && styles.overrideBtnTextActive,
                    ]}
                  >
                    Force Closed
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ─── Operating Hours (IST) ─────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Daily Store Hours (IST)</Text>
              <Text style={styles.cardSubtitle}>
                Format: 24-hour HH:mm (e.g. 07:00 to 21:00)
              </Text>

              <View style={styles.rowFields}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Opening Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="07:00"
                    placeholderTextColor={Colors.inkSoft}
                    value={openTime}
                    onChangeText={setOpenTime}
                    maxLength={5}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Closing Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="21:00"
                    placeholderTextColor={Colors.inkSoft}
                    value={closeTime}
                    onChangeText={setCloseTime}
                    maxLength={5}
                  />
                </View>
              </View>
            </View>

            {/* ─── Order Pricing & Delivery Rules ─────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Order Value & Delivery Charges</Text>
              <Text style={styles.cardSubtitle}>
                Updated values apply live to active carts and checkout.
              </Text>

              <View style={styles.formGrid}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Minimum Order Value (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="99"
                    placeholderTextColor={Colors.inkSoft}
                    keyboardType="numeric"
                    value={minOrderValue}
                    onChangeText={setMinOrderValue}
                  />
                  <Text style={styles.fieldHint}>
                    Checkout is disabled if the item subtotal is below this amount.
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Standard Delivery Fee (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="20"
                    placeholderTextColor={Colors.inkSoft}
                    keyboardType="numeric"
                    value={deliveryFee}
                    onChangeText={setDeliveryFee}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Free Delivery Threshold (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="299"
                    placeholderTextColor={Colors.inkSoft}
                    keyboardType="numeric"
                    value={freeDeliveryAbove}
                    onChangeText={setFreeDeliveryAbove}
                  />
                  <Text style={styles.fieldHint}>
                    Subtotals above this qualify for free delivery with a progress bar.
                  </Text>
                </View>
              </View>
            </View>

            {/* ─── Agent Payout / Commission ──────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery Agent Payout</Text>
              <Text style={styles.cardSubtitle}>
                Fixed commission credited to the agent per completed order.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Agent Fee per Delivery (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="30"
                  placeholderTextColor={Colors.inkSoft}
                  keyboardType="numeric"
                  value={agentFeePerDelivery}
                  onChangeText={setAgentFeePerDelivery}
                />
                <Text style={styles.fieldHint}>
                  Applies to future order assignments (stored as a snapshot on the order).
                </Text>
              </View>
            </View>

            {/* ─── Delivery Slot Labels ───────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery Slots</Text>
              <Text style={styles.cardSubtitle}>
                Add, reorder, or remove slot options presented at checkout.
              </Text>

              <View style={styles.slotList}>
                {slots.map((slot, idx) => (
                  <View key={`${slot}-${idx}`} style={styles.slotRow}>
                    <View style={styles.slotReorderControls}>
                      <TouchableOpacity
                        onPress={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        style={[styles.reorderBtn, idx === 0 && styles.reorderBtnDisabled]}
                      >
                        <Text style={styles.reorderArrow}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMoveDown(idx)}
                        disabled={idx === slots.length - 1}
                        style={[
                          styles.reorderBtn,
                          idx === slots.length - 1 && styles.reorderBtnDisabled,
                        ]}
                      >
                        <Text style={styles.reorderArrow}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.slotLabel}>{slot}</Text>

                    <TouchableOpacity
                      onPress={() => handleRemoveSlot(idx)}
                      style={styles.removeSlotBtn}
                      hitSlop={8}
                    >
                      <Text style={styles.removeSlotText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Add New Slot Input */}
              <View style={styles.addSlotRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="e.g. Afternoon 1–3 PM"
                  placeholderTextColor={Colors.inkSoft}
                  value={newSlotInput}
                  onChangeText={setNewSlotInput}
                  onSubmitEditing={handleAddSlot}
                />
                <TouchableOpacity
                  style={styles.addSlotBtn}
                  onPress={handleAddSlot}
                  disabled={!newSlotInput.trim()}
                >
                  <Text style={styles.addSlotBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ─── Save Button ────────────────────────────────────────────── */}
            <View style={styles.saveWrap}>
              <Button
                label={saving ? 'Saving Settings...' : 'Save Settings'}
                variant="primary"
                loading={saving}
                disabled={saving}
                onPress={handleSave}
              />
            </View>

            {/* ─── Admin Session / Logout Card ───────────────────────────── */}
            <View style={[styles.card, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', marginTop: Spacing.md }]}>
              <Text style={[styles.cardTitle, { color: '#B91C1C' }]}>Administrator Session</Text>
              <Text style={styles.cardSubtitle}>
                Log out of the Store Administrator session and return to the main login screen.
              </Text>
              <Button
                label="Log Out as Admin"
                variant="danger"
                onPress={handleLogout}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  loadingBox: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginBottom: Spacing.md,
  },
  overrideOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  overrideBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.button,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  overrideBtnActive: {
    borderColor: Colors.green700,
    backgroundColor: '#EAF8F0',
  },
  overrideBtnOpenActive: {
    borderColor: Colors.green500,
    backgroundColor: '#EAF8F0',
  },
  overrideBtnClosedActive: {
    borderColor: Colors.coral,
    backgroundColor: '#FEF2F2',
  },
  overrideBtnIcon: {
    fontSize: 18,
  },
  overrideBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  overrideBtnTextActive: {
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  formGrid: {
    gap: Spacing.md,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  input: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
  },
  slotList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  slotReorderControls: {
    flexDirection: 'column',
    marginRight: Spacing.sm,
  },
  reorderBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.25,
  },
  reorderArrow: {
    fontSize: 9,
    color: Colors.ink,
  },
  slotLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  removeSlotBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeSlotText: {
    fontSize: 12,
    color: Colors.coral,
    fontFamily: 'Manrope_800ExtraBold',
  },
  addSlotRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addSlotBtn: {
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlotBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#ffffff',
  },
  saveWrap: {
    marginTop: Spacing.sm,
  },
});

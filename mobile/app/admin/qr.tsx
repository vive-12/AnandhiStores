// app/admin/qr.tsx — Store UPI QR Codes & Sales Management Screen
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useQRCodes } from '../../hooks/useQRCodes';
import { useStats } from '../../hooks/useStats';
import {
  saveQRCode,
  setDefaultQRCode,
  deleteQRCode,
  generateUPIUri,
  getQRCodeImageUrl,
  MAX_QR_CODES,
} from '../../services/qr';
import { ScreenHeader, Card, Button, useToast, CardSkeleton } from '../../components/ui';
import type { QRCodeItem } from '../../types';

export default function AdminQRScreen() {
  const { showToast } = useToast();
  const { qrCodes, defaultQR, loading, refresh } = useQRCodes();
  const { computeMetrics } = useStats();

  // Timeframe filter state: 'today' (12 AM) | 'week' (Sun 12 AM) | 'month' (1st 12 AM) | 'all'
  const [qrTimeframe, setQrTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [clickTime, setClickTime] = useState<Date>(new Date());

  // Modal State for Add / Edit
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('Anandhi Stores');
  const [imageUrl, setImageUrl] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Preview QR Modal
  const [previewQR, setPreviewQR] = useState<QRCodeItem | null>(null);

  // Stats for the active timeframe
  const statsMetrics = useMemo(() => {
    if (qrTimeframe === 'all') return null;
    return computeMetrics(qrTimeframe, clickTime);
  }, [computeMetrics, qrTimeframe, clickTime]);

  // Aggregated Sales Metrics for active default QR (or overall if no default)
  const displayQRRevenue = useMemo(() => {
    if (defaultQR) {
      if (qrTimeframe === 'all') return defaultQR.totalSales || 0;
      return statsMetrics?.qrSalesMap?.[defaultQR.id] || 0;
    }
    if (qrTimeframe === 'all') {
      return qrCodes.reduce((sum, q) => sum + (q.totalSales || 0), 0);
    }
    return statsMetrics?.upiRevenue || 0;
  }, [qrCodes, defaultQR, qrTimeframe, statsMetrics]);

  const displayQROrders = useMemo(() => {
    if (defaultQR) {
      if (qrTimeframe === 'all') return defaultQR.orderCount || 0;
      return statsMetrics?.qrOrdersMap?.[defaultQR.id] || 0;
    }
    if (qrTimeframe === 'all') {
      return qrCodes.reduce((sum, q) => sum + (q.orderCount || 0), 0);
    }
    return statsMetrics?.upiOrders || 0;
  }, [qrCodes, defaultQR, qrTimeframe, statsMetrics]);

  const canAddMore = qrCodes.length < MAX_QR_CODES;

  const handleOpenAddModal = () => {
    if (!canAddMore) {
      Alert.alert(
        'Limit Reached',
        `You have saved all ${MAX_QR_CODES} allowed QR codes. Please delete or edit an existing QR code to add another.`,
      );
      return;
    }
    setEditingId(null);
    setName('');
    setUpiId('');
    setMerchantName('Anandhi Stores');
    setImageUrl('');
    setMakeDefault(qrCodes.length === 0);
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: QRCodeItem) => {
    setEditingId(item.id);
    setName(item.name);
    setUpiId(item.upiId);
    setMerchantName(item.merchantName || 'Anandhi Stores');
    setImageUrl(item.imageUrl || '');
    setMakeDefault(Boolean(item.isDefault));
    setModalVisible(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUpi = upiId.trim();

    if (!trimmedName) {
      showToast('Please enter a display name for the QR code', 'info');
      return;
    }
    if (!trimmedUpi || !trimmedUpi.includes('@')) {
      showToast('Please enter a valid UPI ID (e.g. storename@okaxis)', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await saveQRCode({
        id: editingId || undefined,
        name: trimmedName,
        upiId: trimmedUpi,
        merchantName: merchantName.trim() || 'Anandhi Stores',
        imageUrl: imageUrl.trim() || undefined,
        isDefault: makeDefault,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        editingId ? 'QR code updated successfully!' : 'New QR code saved!',
        'success',
      );
      setModalVisible(false);
      refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save QR code', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (qr: QRCodeItem) => {
    if (qr.isDefault) return;
    try {
      Haptics.selectionAsync();
      await setDefaultQRCode(qr.id);
      showToast(`"${qr.name}" is now the active default QR!`, 'success');
      refresh();
    } catch (err: any) {
      showToast('Failed to update default QR', 'error');
    }
  };

  const handleDelete = (qr: QRCodeItem) => {
    if (qrCodes.length <= 1) {
      Alert.alert('Cannot Delete', 'At least one QR code is required for customer UPI payments.');
      return;
    }

    Alert.alert(
      'Delete QR Code',
      `Are you sure you want to remove "${qr.name}"?\n(Past sales entries are permanently preserved)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQRCode(qr.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              showToast(`Deleted "${qr.name}"`, 'info');
              refresh();
            } catch (err) {
              showToast('Failed to delete QR code', 'error');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.container}>
      <ScreenHeader
        title="QR Code Management"
      />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Sales & Capacity Hero Banner */}
        <View style={s.heroCard}>
          {/* Timeframe Switcher */}
          <View style={s.qrTimeframeBar}>
            <TouchableOpacity
              style={[s.qrTfChip, qrTimeframe === 'today' && s.qrTfChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setQrTimeframe('today');
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Filter today QR sales"
            >
              <Text style={[s.qrTfTxt, qrTimeframe === 'today' && s.qrTfTxtActive]}>Today</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.qrTfChip, qrTimeframe === 'week' && s.qrTfChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setQrTimeframe('week');
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Filter weekly QR sales"
            >
              <Text style={[s.qrTfTxt, qrTimeframe === 'week' && s.qrTfTxtActive]}>Weekly</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.qrTfChip, qrTimeframe === 'month' && s.qrTfChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setQrTimeframe('month');
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Filter monthly QR sales"
            >
              <Text style={[s.qrTfTxt, qrTimeframe === 'month' && s.qrTfTxtActive]}>Monthly</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.qrTfChip, qrTimeframe === 'all' && s.qrTfChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setQrTimeframe('all');
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View all-time lifetime QR sales"
            >
              <Text style={[s.qrTfTxt, qrTimeframe === 'all' && s.qrTfTxtActive]}>All Time</Text>
            </TouchableOpacity>
          </View>

          {/* Revenue & Slot Capacity Row */}
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>REVENUE</Text>
              <Text style={s.heroRevenue}>₹{displayQRRevenue.toLocaleString('en-IN')}</Text>
            </View>
            <View style={s.capacityPill}>
              <Ionicons name="hardware-chip-outline" size={14} color={Colors.green900} />
              <Text style={s.capacityTxt}>
                {qrCodes.length} / {MAX_QR_CODES} Slots Used
              </Text>
            </View>
          </View>

          {/* Stats Summary Row */}
          <View style={s.heroStatsRow}>
            <View style={s.heroStatItem}>
              <Text style={s.heroStatVal}>{displayQROrders}</Text>
              <Text style={s.heroStatSub}>Orders Paid via QR</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStatItem}>
              <Text style={s.heroStatVal} numberOfLines={1}>
                {defaultQR?.name || 'None'}
              </Text>
              <Text style={s.heroStatSub}>Active Default QR</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ gap: Spacing.md }}>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        ) : qrCodes.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="qr-code-outline" size={48} color={Colors.inkSoft} />
            <Text style={s.emptyTitle}>No QR Codes Configured</Text>
            <Text style={s.emptySub}>
              Tap the button below to add your primary Google Pay or PhonePe QR code.
            </Text>
            <Button label="+ Add First QR Code" onPress={handleOpenAddModal} />
          </View>
        ) : (
          qrCodes.map((item, idx) => {
            const upiUri = generateUPIUri({
              upiId: item.upiId,
              merchantName: item.merchantName,
              amount: 100, // sample
            });
            const qrImage = item.imageUrl || getQRCodeImageUrl(upiUri, 200);

            const rawTs = item.lastUsedAt as any;
            const lastUsedFormatted = rawTs
              ? (typeof rawTs.toDate === 'function'
                  ? rawTs.toDate()
                  : new Date(rawTs.seconds ? rawTs.seconds * 1000 : rawTs)
                ).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Never used';

            const periodSales = qrTimeframe === 'all'
              ? (item.totalSales || 0)
              : (statsMetrics?.qrSalesMap?.[item.id] || 0);

            const periodOrders = qrTimeframe === 'all'
              ? (item.orderCount || 0)
              : (statsMetrics?.qrOrdersMap?.[item.id] || 0);

            return (
              <Card
                key={item.id}
                style={[s.qrCard, item.isDefault && s.qrCardDefault]}
              >
                {/* Header Row */}
                <View style={s.qrCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={s.qrTitleRow}>
                      <Text style={s.qrName}>{item.name}</Text>
                      {item.isDefault && (
                        <View style={s.activeBadge}>
                          <Text style={s.activeBadgeTxt}>⭐ ACTIVE DEFAULT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.qrUpiId}>{item.upiId}</Text>
                  </View>

                  {/* Thumbnail */}
                  <TouchableOpacity
                    onPress={() => setPreviewQR(item)}
                    activeOpacity={0.8}
                    style={s.qrThumbContainer}
                    accessibilityRole="button"
                    accessibilityLabel="Preview enlarged QR code"
                  >
                    <Image source={{ uri: qrImage }} style={s.qrThumb} />
                    <View style={s.qrThumbZoom}>
                      <Ionicons name="scan-outline" size={12} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Sales Tracking Box */}
                <View style={s.salesBox}>
                  <View style={s.salesCol}>
                    <Text style={s.salesVal}>₹{periodSales.toLocaleString('en-IN')}</Text>
                    <Text style={s.salesLabel} numberOfLines={1}>
                      {qrTimeframe === 'today'
                        ? 'Today Sales'
                        : qrTimeframe === 'week'
                        ? 'Weekly Sales'
                        : qrTimeframe === 'month'
                        ? 'Monthly Sales'
                        : 'All-Time Sales'}
                    </Text>
                  </View>
                  <View style={s.salesDivider} />
                  <View style={s.salesCol}>
                    <Text style={s.salesVal}>{periodOrders}</Text>
                    <Text style={s.salesLabel}>Orders Paid</Text>
                  </View>
                  <View style={s.salesDivider} />
                  <View style={s.salesCol}>
                    <Text style={s.salesVal}>₹{(item.totalSales || 0).toLocaleString('en-IN')}</Text>
                    <Text style={s.salesLabel}>All-Time Total</Text>
                  </View>
                </View>

                {/* Actions Footer */}
                <View style={s.qrActions}>
                  {!item.isDefault ? (
                    <TouchableOpacity
                      style={s.setDefaultBtn}
                      onPress={() => handleSetDefault(item)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Make this QR the active default"
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={Colors.green900} />
                      <Text style={s.setDefaultBtnTxt}>Set as Default</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.defaultConfirmedTag}>
                      <Ionicons name="checkmark-done" size={16} color={Colors.green700} />
                      <Text style={s.defaultConfirmedTxt}>Active on Agent Screens</Text>
                    </View>
                  )}

                  <View style={s.qrActionRight}>
                    <TouchableOpacity
                      style={s.iconActionBtn}
                      onPress={() => handleOpenEditModal(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Edit QR code details"
                    >
                      <Ionicons name="pencil" size={18} color={Colors.inkSoft} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={s.iconActionBtn}
                      onPress={() => handleDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete QR code"
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.coral} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        {/* Add QR Button at bottom */}
        {canAddMore && qrCodes.length > 0 && (
          <TouchableOpacity
            style={s.bottomAddBtn}
            onPress={handleOpenAddModal}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.green900} />
            <Text style={s.bottomAddTxt}>
              Add Another QR Code ({MAX_QR_CODES - qrCodes.length} remaining)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Add / Edit QR Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editingId ? 'Edit QR Code' : 'Add New QR Code'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={Colors.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalForm}>
              <View style={s.field}>
                <Text style={s.label}>Display Name *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Primary GPay, Counter Paytm"
                  placeholderTextColor={Colors.inkSoft}
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>UPI ID (VPA) *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. anandhistores@okaxis"
                  placeholderTextColor={Colors.inkSoft}
                  value={upiId}
                  onChangeText={setUpiId}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>Merchant / Payee Name</Text>
                <TextInput
                  style={s.input}
                  placeholder="Anandhi Stores"
                  placeholderTextColor={Colors.inkSoft}
                  value={merchantName}
                  onChangeText={setMerchantName}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>Custom QR Image URL (Optional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="https://... (leave blank to auto-generate)"
                  placeholderTextColor={Colors.inkSoft}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={s.toggleRow}
                onPress={() => setMakeDefault(!makeDefault)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={makeDefault ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={makeDefault ? Colors.green700 : Colors.inkSoft}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={s.toggleTitle}>Set as Active Default QR</Text>
                  <Text style={s.toggleSub}>
                    Agents will present this QR to customers during delivery
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={s.modalBtnRow}>
                <Button
                  label={submitting ? 'Saving...' : editingId ? 'Update QR' : 'Save QR Code'}
                  onPress={handleSave}
                  loading={submitting}
                  disabled={submitting}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Enlarged QR Preview Modal */}
      <Modal
        visible={previewQR !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewQR(null)}
      >
        <View style={s.previewOverlay}>
          <View style={s.previewCard}>
            <View style={s.previewTop}>
              <Text style={s.previewTitle}>{previewQR?.name}</Text>
              <TouchableOpacity onPress={() => setPreviewQR(null)}>
                <Ionicons name="close" size={24} color={Colors.ink} />
              </TouchableOpacity>
            </View>

            {previewQR && (
              <View style={s.previewBody}>
                <Image
                  source={{
                    uri:
                      previewQR.imageUrl ||
                      getQRCodeImageUrl(
                        generateUPIUri({
                          upiId: previewQR.upiId,
                          merchantName: previewQR.merchantName,
                          amount: 100,
                        }),
                        350,
                      ),
                  }}
                  style={s.previewImage}
                />
                <Text style={s.previewUpi}>{previewQR.upiId}</Text>
                <Text style={s.previewPayee}>Payee: {previewQR.merchantName}</Text>
                <Text style={s.previewHint}>
                  Scan using Google Pay, PhonePe, Paytm, or BHIM UPI
                </Text>
              </View>
            )}

            <Button label="Close Preview" onPress={() => setPreviewQR(null)} variant="secondary" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 3,
    gap: Spacing.lg,
  },

  // Hero Card
  heroCard: {
    backgroundColor: Colors.green900,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  qrTimeframeBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.button,
    padding: 3,
    marginBottom: Spacing.md,
    gap: 4,
  },
  qrTfChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.button - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTfChipActive: {
    backgroundColor: Colors.amber,
  },
  qrTfTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: 'rgba(255,255,255,0.7)',
  },
  qrTfTxtActive: {
    color: Colors.green900,
    fontFamily: 'Manrope_800ExtraBold',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  heroLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.amber,
    letterSpacing: 1.2,
  },
  heroRevenue: {
    fontSize: 28,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  capacityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: Radius.chip,
  },
  capacityTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.button,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  heroStatSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // QR Cards
  qrCard: {
    padding: Spacing.md,
    borderRadius: Radius.card,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  qrCardDefault: {
    borderColor: Colors.green700,
    backgroundColor: '#F0FDF4',
  },
  qrCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  qrTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  qrName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  activeBadge: {
    backgroundColor: Colors.green700,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  activeBadgeTxt: {
    color: '#FFFFFF',
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: 0.4,
  },
  qrUpiId: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green900,
    marginTop: 4,
  },
  qrThumbContainer: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
  },
  qrThumb: {
    width: '100%',
    height: '100%',
  },
  qrThumbZoom: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },

  // Sales Box
  salesBox: {
    flexDirection: 'row',
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  salesCol: {
    flex: 1,
    alignItems: 'center',
  },
  salesVal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  salesLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  salesDivider: {
    width: 1,
    backgroundColor: Colors.line,
  },

  // Actions
  qrActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  setDefaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.button,
  },
  setDefaultBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },
  defaultConfirmedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  defaultConfirmedTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  qrActionRight: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },

  bottomAddBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.green700,
    borderRadius: Radius.card,
    padding: Spacing.md,
    backgroundColor: 'rgba(21, 128, 61, 0.05)',
  },
  bottomAddTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },

  emptyBox: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  emptySub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  modalForm: {
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    backgroundColor: Colors.cream,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  toggleTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  toggleSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  modalBtnRow: {
    marginTop: Spacing.sm,
  },

  // Preview Modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadow.card,
  },
  previewTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  previewTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  previewBody: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  previewImage: {
    width: 240,
    height: 240,
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: Spacing.md,
  },
  previewUpi: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  previewPayee: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  previewHint: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 6,
    textAlign: 'center',
  },
});

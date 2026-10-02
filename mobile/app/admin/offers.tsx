// app/admin/offers.tsx — Promotional Banners & Offers Management
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import {
  listenAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive,
  AppBanner,
} from '../../services/banners';
import { useItems } from '../../hooks/useItems';
import {
  ScreenHeader,
  Card,
  Button,
  EmptyState,
  CardSkeleton,
  useToast,
} from '../../components/ui';

const PRESET_COLORS = [
  '#1F5B3C', // Brand Green
  '#123524', // Deep Green
  '#E8A33D', // Amber Gold
  '#0284C7', // Sky Blue
  '#7C3AED', // Royal Purple
  '#E1604A', // Coral Red
];

export default function OffersScreen() {
  const { showToast } = useToast();
  const { items: inventoryItems } = useItems();

  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AppBanner | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [linkedItemName, setLinkedItemName] = useState<string | null>(null);
  const [productInputFocused, setProductInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Product picker modal
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Keyboard show/hide listeners for drag-dismiss & toolbar
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Live matching inventory records as user types
  const matchingProducts = React.useMemo(() => {
    if (!linkedItemName || !linkedItemName.trim()) return [];
    const q = linkedItemName.toLowerCase().trim();
    return inventoryItems
      .filter(i => !i.isDeleted)
      .filter(i => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q)))
      .slice(0, 4);
  }, [linkedItemName, inventoryItems]);

  useEffect(() => {
    setLoading(true);
    const unsub = listenAllBanners(
      data => {
        setBanners(data);
        setLoading(false);
      },
      err => {
        console.error('Error listening to banners:', err);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  const openAdd = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setSelectedColor(PRESET_COLORS[0]);
    setIsActive(true);
    setLinkedItemId(null);
    setLinkedItemName(null);
    setModalVisible(true);
  };

  const openEdit = (b: AppBanner) => {
    setEditingBanner(b);
    setTitle(b.title);
    setSubtitle(b.subtitle || '');
    setSelectedColor(b.color || PRESET_COLORS[0]);
    setIsActive(b.isActive);
    setLinkedItemId(b.linkedItemId || null);
    setLinkedItemName(b.linkedItemName || null);
    setModalVisible(true);
  };

  const handleToggle = async (b: AppBanner) => {
    try {
      Haptics.selectionAsync();
      const nextActive = !b.isActive;
      await toggleBannerActive(b.id, nextActive);
      showToast(
        `Banner is now ${nextActive ? 'ACTIVE on Home' : 'HIDDEN from Home'}`,
        nextActive ? 'success' : 'info',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update banner';
      showToast(msg, 'error');
    }
  };

  const handleDelete = (b: AppBanner) => {
    Alert.alert(
      'Delete Banner',
      `Are you sure you want to delete banner "${b.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBanner(b.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast('Banner deleted', 'info');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not delete';
              showToast(msg, 'error');
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showToast('Please enter banner title', 'error');
      return;
    }

    try {
      setSaving(true);
      if (editingBanner) {
        await updateBanner(editingBanner.id, {
          title: trimmedTitle,
          subtitle: subtitle.trim(),
          color: selectedColor,
          isActive,
          linkedItemId: linkedItemId || null,
          linkedItemName: linkedItemName || null,
        });
        showToast('Banner updated', 'success');
      } else {
        await createBanner({
          title: trimmedTitle,
          subtitle: subtitle.trim(),
          color: selectedColor,
          imageUrl: null,
          isActive,
          sortOrder: banners.length + 1,
          linkedItemId: linkedItemId || null,
          linkedItemName: linkedItemName || null,
        });
        showToast('Banner published to Home screen', 'success');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save banner';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderBannerCard = ({ item }: { item: AppBanner }) => (
    <View style={s.bannerCard}>
      {/* Banner Visual Preview */}
      <View style={[s.bannerPreview, { backgroundColor: item.color || '#1F5B3C' }]}>
        <View style={s.previewContent}>
          <Text style={s.previewTitle}>{item.title}</Text>
          {item.subtitle ? (
            <Text style={s.previewSub}>{item.subtitle}</Text>
          ) : null}
          {item.linkedItemName && (
            <View style={s.previewLinkedBadge}>
              <Ionicons name="pricetag" size={12} color="#FFFFFF" />
              <Text style={s.previewLinkedTxt}>Offer: {item.linkedItemName}</Text>
            </View>
          )}
        </View>
        <Ionicons name="sparkles" size={28} color="rgba(255,255,255,0.4)" />
      </View>

      {/* Settings Row */}
      <View style={s.cardBody}>
        {item.linkedItemName && (
          <View style={s.linkedBadge}>
            <Ionicons name="link" size={13} color={Colors.green700} />
            <Text style={s.linkedBadgeTxt}>Links to Product: <Text style={{ fontFamily: 'Manrope_700Bold' }}>{item.linkedItemName}</Text></Text>
          </View>
        )}

        <View style={s.statusRow}>
          <Text style={[s.statusTxt, item.isActive ? s.statusActive : s.statusInactive]}>
            {item.isActive ? 'Active on Home' : 'Disabled (Hidden)'}
          </Text>
          <Switch
            value={item.isActive}
            onValueChange={() => handleToggle(item)}
            trackColor={{ false: Colors.line, true: Colors.green500 }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={s.cardFooter}>
          <TouchableOpacity
            style={s.footerBtn}
            onPress={() => openEdit(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={15} color={Colors.green700} />
            <Text style={s.footerBtnTxt}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.footerBtn, { borderColor: Colors.coral }]}
            onPress={() => handleDelete(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={15} color={Colors.coral} />
            <Text style={[s.footerBtnTxt, { color: Colors.coral }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Banners & Offers"
        subtitle="Manage customer home carousel banners"
      />

      {/* Action Bar */}
      <View style={s.actionBar}>
        <Text style={s.bannerCountTxt}>
          {banners.length} Total Banner{banners.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={s.addBtnTxt}>New Banner</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : (
        <FlatList
          data={banners}
          keyExtractor={item => item.id}
          renderItem={renderBannerCard}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              title="No Banners Yet"
              subtitle="Add banners to show offers and announcements on the customer home screen."
              actionLabel="+ Create New Banner"
              onAction={openAdd}
            />
          }
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={[s.modalOverlay, isKeyboardVisible && { justifyContent: 'flex-end', paddingBottom: 0, paddingHorizontal: 0 }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
              <View style={[s.modalContent, isKeyboardVisible && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, width: '100%' }]}>
                {/* Top Modal Header with Quick Action Buttons */}
                <View style={s.modalHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setModalVisible(false);
                    }}
                    style={s.headerCancelBtn}
                  >
                    <Text style={s.headerCancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={s.modalTitle}>
                    {editingBanner ? 'Edit Banner' : 'Create Banner'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      handleSave();
                    }}
                    disabled={saving}
                    style={s.headerSaveBtn}
                    activeOpacity={0.8}
                  >
                    <Text style={s.headerSaveTxt}>{saving ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Keyboard Dismiss Helper Bar */}
                {isKeyboardVisible && (
                  <TouchableOpacity
                    style={s.keyboardDismissBar}
                    onPress={() => Keyboard.dismiss()}
                    activeOpacity={0.8}
                  >
                    <Text style={s.keyboardDismissTxt}>✕ Tap or drag down to dismiss keyboard</Text>
                  </TouchableOpacity>
                )}

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: isKeyboardVisible ? 320 : 480 }}
                  contentContainerStyle={{ paddingBottom: Spacing.xl * 2 }}
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled
                >
                  <View style={s.formGap}>
                    {/* Live Preview */}
                    <View style={[s.bannerPreview, { backgroundColor: selectedColor, marginBottom: Spacing.xs }]}>
                      <View style={s.previewContent}>
                        <Text style={s.previewTitle}>
                          {title.trim() || 'Banner Headline'}
                        </Text>
                        <Text style={s.previewSub}>
                          {subtitle.trim() || 'Sub-headline / special offer text'}
                        </Text>
                        {linkedItemName ? (
                          <View style={s.previewLinkedBadge}>
                            <Ionicons name="pricetag" size={11} color="#FFFFFF" />
                            <Text style={s.previewLinkedTxt}>Offer: {linkedItemName}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Ionicons name="sparkles" size={24} color="rgba(255,255,255,0.4)" />
                    </View>

                    {/* Title */}
                    <View style={s.inputGroup}>
                      <Text style={s.inputLabel}>Banner Headline *</Text>
                      <TextInput
                        style={s.textInput}
                        placeholder="e.g. Free Delivery on First Order!"
                        placeholderTextColor={Colors.inkSoft}
                        value={title}
                        onChangeText={setTitle}
                      />
                    </View>

                    {/* Subtitle */}
                    <View style={s.inputGroup}>
                      <Text style={s.inputLabel}>Subtitle / Description</Text>
                      <TextInput
                        style={s.textInput}
                        placeholder="e.g. Fresh groceries delivered in 30 minutes"
                        placeholderTextColor={Colors.inkSoft}
                        value={subtitle}
                        onChangeText={setSubtitle}
                      />
                    </View>

                    {/* Link to Inventory Product — Editable Name + Browse Button */}
                    <View style={s.inputGroup}>
                      <View style={s.labelRow}>
                        <Text style={s.inputLabel}>Linked Product in Inventory</Text>
                        <TouchableOpacity
                          style={s.browseCatalogBtn}
                          onPress={() => {
                            Keyboard.dismiss();
                            setPickerSearch('');
                            setPickerModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="search" size={13} color={Colors.green700} />
                          <Text style={s.browseCatalogBtnTxt}>Browse Inventory</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Display Selected Linked Product Card if Linked */}
                      {linkedItemId && linkedItemName ? (
                        <View style={s.linkedCardBox}>
                          <View style={s.linkedCardRow}>
                            <View style={s.linkedIconBox}>
                              <Ionicons name="pricetag" size={18} color={Colors.green700} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.linkedCardTitle}>{linkedItemName}</Text>
                              {(() => {
                                const found = inventoryItems.find(i => i.id === linkedItemId);
                                return found ? (
                                  <Text style={s.linkedCardSub}>₹{found.price} • {found.unit} • In Stock</Text>
                                ) : (
                                  <Text style={s.linkedCardSub}>Linked Product ID: {linkedItemId}</Text>
                                );
                              })()}
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                setLinkedItemId(null);
                                setLinkedItemName(null);
                                Haptics.selectionAsync();
                              }}
                              hitSlop={10}
                              style={s.unlinkActionBtn}
                            >
                              <Ionicons name="close-circle" size={20} color={Colors.coral} />
                              <Text style={s.unlinkActionTxt}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={s.inputHelper}>
                            ⚡ Tapping this banner on Customer Home will automatically add {linkedItemName} to cart!
                          </Text>
                        </View>
                      ) : (
                        /* Unlinked Search Box */
                        <View style={[s.productInputWrapper, productInputFocused && s.productInputWrapperActive]}>
                          <Ionicons
                            name="search-outline"
                            size={18}
                            color={Colors.inkSoft}
                          />
                          <TextInput
                            style={s.productNameTextInput}
                            placeholder="Type product name to link (e.g. Tomato)..."
                            placeholderTextColor={Colors.inkSoft}
                            value={linkedItemName || ''}
                            onFocus={() => setProductInputFocused(true)}
                            onChangeText={txt => {
                              setLinkedItemName(txt);
                              setProductInputFocused(true);
                              // Auto-match exact name if typed
                              const match = inventoryItems.find(
                                i => !i.isDeleted && i.name.toLowerCase().trim() === txt.toLowerCase().trim(),
                              );
                              setLinkedItemId(match ? match.id : null);
                            }}
                          />
                          {linkedItemName ? (
                            <TouchableOpacity
                              onPress={() => {
                                setLinkedItemId(null);
                                setLinkedItemName(null);
                              }}
                              hitSlop={10}
                              style={s.clearInputBtn}
                            >
                              <Ionicons name="close-circle" size={20} color={Colors.coral} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}

                      {/* Live matching products autocomplete list (ALWAYS stays visible when text matches) */}
                      {!linkedItemId && matchingProducts.length > 0 && (
                        <View style={s.matchingListContainer}>
                          <Text style={s.matchingHeaderTxt}>Tap to Link Product:</Text>
                          {matchingProducts.map(item => (
                            <TouchableOpacity
                              key={item.id}
                              style={s.matchingItemRow}
                              onPress={() => {
                                Keyboard.dismiss();
                                setLinkedItemId(item.id);
                                setLinkedItemName(item.name);
                                setProductInputFocused(false);
                                Haptics.selectionAsync();
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 16 }}>📦</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={s.matchingItemName}>{item.name}</Text>
                                <Text style={s.matchingItemSub}>₹{item.price} • {item.unit}</Text>
                              </View>
                              <View style={s.matchingSelectPill}>
                                <Text style={s.matchingSelectPillTxt}>+ Link</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {!linkedItemId && linkedItemName && matchingProducts.length === 0 && (
                        <Text style={s.inputWarningHelper}>
                          ⚠️ "{linkedItemName}" is not linked to any inventory item. Tap "Browse Inventory" to pick a product.
                        </Text>
                      )}

                      {!linkedItemId && !linkedItemName && (
                        <Text style={s.inputSubHelper}>
                          Optional: Link to a specific product so customers can tap the banner on Home to add it directly to cart.
                        </Text>
                      )}
                    </View>

                {/* Color Palette */}
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Card Color</Text>
                  <View style={s.colorRow}>
                    {PRESET_COLORS.map(c => {
                      const isSel = selectedColor === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[s.colorCircle, { backgroundColor: c }, isSel && s.colorCircleActive]}
                          onPress={() => setSelectedColor(c)}
                        >
                          {isSel && (
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Active Toggle */}
                <View style={s.activeToggleRow}>
                  <View>
                    <Text style={s.activeToggleTitle}>Visible on Home Carousel</Text>
                    <Text style={s.activeToggleSub}>
                      Live for all customer app sessions
                    </Text>
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={setIsActive}
                    trackColor={{ false: Colors.line, true: Colors.green500 }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={s.modalBtnRow}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1 }}
                fullWidth={false}
              />
              <Button
                label={saving ? 'Saving...' : editingBanner ? 'Save Changes' : 'Publish Banner'}
                variant="primary"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                style={{ flex: 2 }}
                fullWidth={false}
              />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>

      {/* Product Picker Modal */}
      <Modal visible={pickerModalVisible} transparent animationType="slide">
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select Inventory Product</Text>
              <TouchableOpacity
                onPress={() => setPickerModalVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={Colors.ink} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={s.pickerSearchBox}>
              <Ionicons name="search" size={18} color={Colors.inkSoft} />
              <TextInput
                style={s.pickerSearchInput}
                placeholder="Search products by name or category..."
                placeholderTextColor={Colors.inkSoft}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoCorrect={false}
              />
              {pickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.inkSoft} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              {/* Option: None */}
              <TouchableOpacity
                style={[
                  s.pickerItem,
                  !linkedItemId && s.pickerItemSelected,
                ]}
                onPress={() => {
                  setLinkedItemId(null);
                  setLinkedItemName(null);
                  setPickerModalVisible(false);
                }}
              >
                <View style={s.pickerItemLeft}>
                  <Ionicons name="ban-outline" size={20} color={Colors.inkSoft} />
                  <Text style={s.pickerItemNone}>None (Informational banner only)</Text>
                </View>
                {!linkedItemId && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.green700} />
                )}
              </TouchableOpacity>

              {/* Inventory items */}
              {inventoryItems
                .filter(i => !i.isDeleted)
                .filter(i => {
                  if (!pickerSearch.trim()) return true;
                  const q = pickerSearch.toLowerCase();
                  return (
                    i.name.toLowerCase().includes(q) ||
                    (i.category && i.category.toLowerCase().includes(q))
                  );
                })
                .map(item => {
                  const isSelected = linkedItemId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        s.pickerItem,
                        isSelected && s.pickerItemSelected,
                      ]}
                      onPress={() => {
                        setLinkedItemId(item.id);
                        setLinkedItemName(item.name);
                        setPickerModalVisible(false);
                        Haptics.selectionAsync();
                      }}
                    >
                      <View style={s.pickerItemLeft}>
                        <View style={s.pickerItemBullet}>
                          <Text style={{ fontSize: 16 }}>📦</Text>
                        </View>
                        <View>
                          <Text style={s.pickerItemName}>{item.name}</Text>
                          <Text style={s.pickerItemSub}>
                            ₹{item.price} • {item.unit} {item.category ? `• ${item.category}` : ''}
                          </Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={Colors.line} />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
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
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  bannerCountTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.button,
    gap: 4,
  },
  addBtnTxt: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },

  // Banner Card
  bannerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  bannerPreview: {
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.card - 2,
  },
  previewContent: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  previewTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  previewSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  cardBody: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
  },
  statusActive: {
    color: Colors.green700,
  },
  statusInactive: {
    color: Colors.inkSoft,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 4,
  },
  footerBtnTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    gap: Spacing.md,
    ...Shadow.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  headerCancelTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  headerSaveBtn: {
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.button,
  },
  headerSaveTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  formGap: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    backgroundColor: Colors.cream,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
  },
  activeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
  },
  activeToggleTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  activeToggleSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    width: '100%',
  },

  // Linked Product Styles
  previewLinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    marginTop: 6,
  },
  previewLinkedTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF8F0',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: '#C3ECD4',
    alignSelf: 'flex-start',
  },
  linkedBadgeTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionalTag: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  browseCatalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAF8F0',
    borderWidth: 1,
    borderColor: '#C3ECD4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
  },
  browseCatalogBtnTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  productInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingRight: Spacing.sm,
    gap: 6,
  },
  productInputWrapperActive: {
    borderColor: Colors.green500,
    backgroundColor: '#F5FAF7',
  },
  productNameTextInput: {
    flex: 1,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  clearInputBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputHelper: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
    marginTop: 2,
  },
  inputSubHelper: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  inputWarningHelper: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.amber,
    marginTop: 4,
  },
  linkedCardBox: {
    backgroundColor: '#F4FBF6',
    borderWidth: 1,
    borderColor: '#C3ECD4',
    borderRadius: Radius.button,
    padding: Spacing.sm,
    gap: 4,
  },
  linkedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  linkedIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkedCardTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  linkedCardSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
    marginTop: 1,
  },
  unlinkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  unlinkActionTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.coral,
  },
  keyboardDismissBar: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.chip,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  keyboardDismissTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },

  // Autocomplete matching items styles
  matchingListContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C3ECD4',
    borderRadius: Radius.button,
    padding: Spacing.xs,
    marginTop: 4,
    ...Shadow.card,
  },
  matchingHeaderTxt: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
  },
  matchingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  matchingItemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  matchingItemSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  matchingSelectPill: {
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: '#A3D9B8',
  },
  matchingSelectPillTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },

  // Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    ...Shadow.card,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  pickerTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    paddingVertical: 4,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.chip,
    marginBottom: 4,
  },
  pickerItemSelected: {
    backgroundColor: '#EAF8F0',
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  pickerItemBullet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  pickerItemSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  pickerItemNone: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
});

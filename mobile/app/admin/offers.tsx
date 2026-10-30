// app/admin/offers.tsx — Promotional Banners & Offers Management
import React, { useState, useEffect, useRef } from 'react';
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
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { preparePhoto } from '../../services/photos';
import { Image } from 'expo-image';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { getBannerPalette } from '../../utils/bannerPalette';
import {
  listenAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive,
  AppBanner,
  MAX_BANNERS,
} from '../../services/banners';
import { useItems } from '../../hooks/useItems';
import {
  ScreenHeader,
  Card,
  Button,
  EmptyState,
  CardSkeleton,
  ErrorState,
  useToast,
} from '../../components/ui';

const PRESET_COLORS = [
  '#0EA5E9', // Water Can (Aqua -> Deep Blue)
  '#F87171', // Tomatoes (Soft Red -> Brick)
  '#FBBF24', // Pickles (Honey -> Amber)
  '#F9A8D4', // Ice Creams (Pink -> Berry)
  '#34D399', // Default Brand (Mint -> Forest)
];

// Helper: converts stored offset to proportional pixel translation for a circle of size D
// (supports normalized ratios e.g. 0.05 and auto-converts any legacy pixel offsets e.g. 30)
export const getNormOffset = (val?: number | null, diameter: number = 200): number => {
  if (!val) return 0;
  const ratio = Math.abs(val) > 1 ? val / 200 : val;
  return ratio * diameter;
};

// Helper: strictly clamps offset ratio so picture edges NEVER leave the circle viewfinder
export const clampNormOffset = (val: number, scale: number): number => {
  const maxRatio = Math.max(0, (scale - 1) / 2);
  return Math.max(-maxRatio, Math.min(maxRatio, val));
};

interface OffersScreenProps {
  showHeader?: boolean;
}

export default function OffersScreen({ showHeader = true }: OffersScreenProps = {}) {
  const { showToast } = useToast();
  const { items: inventoryItems } = useItems();

  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AppBanner | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const [linkedItemName, setLinkedItemName] = useState<string | null>(null);
  const [productInputFocused, setProductInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [uploadOptionsVisible, setUploadOptionsVisible] = useState(false);

  // Round Crop & Zoom Modal state
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [tempScale, setTempScale] = useState<number>(1);
  const [tempOffsetX, setTempOffsetX] = useState<number>(0);
  const [tempOffsetY, setTempOffsetY] = useState<number>(0);
  const [tempRotation, setTempRotation] = useState<number>(0);

  // Synchronize scale ref for touch pan bounds calculation
  const scaleRef = useRef(1);
  useEffect(() => {
    scaleRef.current = tempScale;
  }, [tempScale]);

  // Keep ref synchronized with current offsets for gesture initiation
  const tempOffsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    tempOffsetRef.current = { x: tempOffsetX, y: tempOffsetY };
  }, [tempOffsetX, tempOffsetY]);

  // Helper to change zoom and automatically clamp offsets so zoomed-out image never leaves edges
  const updateTempScale = (newScale: number) => {
    const next = Math.max(1, Math.min(3.5, Math.round(newScale * 100) / 100));
    setTempScale(next);
    setTempOffsetX(prev => clampNormOffset(prev, next));
    setTempOffsetY(prev => clampNormOffset(prev, next));
  };

  // Touch and drag pan responder to move image inside circular viewfinder with strict edge clamping
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { ...tempOffsetRef.current };
      },
      onPanResponderMove: (_, gestureState) => {
        // 200 is viewfinder diameter: convert drag delta in pixels into normalized ratio
        const rawRatioX = dragStartRef.current.x + gestureState.dx / 200;
        const rawRatioY = dragStartRef.current.y + gestureState.dy / 200;
        setTempOffsetX(clampNormOffset(rawRatioX, scaleRef.current));
        setTempOffsetY(clampNormOffset(rawRatioY, scaleRef.current));
      },
    }),
  ).current;

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
        setLoadError(null);
        setBanners(data);
        setLoading(false);
      },
      err => {
        setLoadError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [reload]);

  // Image picking handler with camera or gallery
  const pickImage = async (useCamera: boolean) => {
    try {
      setPickingImage(true);
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        shape: 'oval',
        quality: 0.8,
        base64: true,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = await preparePhoto(asset, 'offer');
        // Clean fresh selection: reset scale, offsets and rotation to exact center
        setImageUrl(uri);
        setImageScale(1);
        setImageOffsetX(0);
        setImageOffsetY(0);
        setImageRotation(0);
        setTempScale(1);
        setTempOffsetX(0);
        setTempOffsetY(0);
        setTempRotation(0);
        // Ready to publish; optional crop controls remain available.
        Haptics.selectionAsync();
        showToast('Photo loaded! Centered and ready to adjust', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not pick image';
      showToast(msg, 'error');
    } finally {
      setPickingImage(false);
    }
  };

  const handlePhotoAction = () => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setUploadOptionsVisible(true);
  };

  const openAdd = () => {
    if (banners.length >= MAX_BANNERS) {
      Alert.alert(
        'Banner Limit Reached',
        `You can have up to ${MAX_BANNERS} promotional banners. Please edit or delete an existing banner before creating a new one.`,
        [{ text: 'OK' }],
      );
      return;
    }
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImageUrl(null);
    setImageScale(1);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setImageRotation(0);
    setSelectedColor(PRESET_COLORS[0]);
    setIsActive(true);
    setLinkedItemId(null);
    setLinkedItemName(null);
    setModalVisible(true);
  };

  const openEdit = (b: AppBanner) => {
    const bScale = b.imageScale ?? 1;
    const bOffX = b.imageOffsetX ? (Math.abs(b.imageOffsetX) > 1 ? b.imageOffsetX / 200 : b.imageOffsetX) : 0;
    const bOffY = b.imageOffsetY ? (Math.abs(b.imageOffsetY) > 1 ? b.imageOffsetY / 200 : b.imageOffsetY) : 0;
    setEditingBanner(b);
    setTitle(b.title);
    setSubtitle(b.subtitle || '');
    setImageUrl(b.imageUrl || null);
    setImageScale(bScale);
    setImageOffsetX(clampNormOffset(bOffX, bScale));
    setImageOffsetY(clampNormOffset(bOffY, bScale));
    setImageRotation(b.imageRotation ?? 0);
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
          imageUrl: imageUrl || null,
          imageScale: imageScale || 1,
          imageOffsetX: imageOffsetX || 0,
          imageOffsetY: imageOffsetY || 0,
          imageRotation: imageRotation || 0,
          isActive,
          linkedItemId: linkedItemId || null,
          linkedItemName: linkedItemName || null,
        });
        showToast('Banner updated', 'success');
      } else {
        if (banners.length >= MAX_BANNERS) {
          showToast(`Limit reached: maximum ${MAX_BANNERS} banners allowed`, 'error');
          return;
        }
        await createBanner({
          title: trimmedTitle,
          subtitle: subtitle.trim(),
          color: selectedColor,
          imageUrl: imageUrl || null,
          imageScale: imageScale || 1,
          imageOffsetX: imageOffsetX || 0,
          imageOffsetY: imageOffsetY || 0,
          imageRotation: imageRotation || 0,
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

  const renderBannerCard = ({ item }: { item: AppBanner }) => {
    const palette = getBannerPalette(item);
    return (
      <View style={s.bannerCard}>
        {/* Banner Visual Preview */}
        <LinearGradient
          colors={[palette.colors[0], palette.colors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.bannerPreview}
        >
          <View style={s.previewDecoCircle} />
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
          <View style={s.previewEmojiBadge}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={[
                  s.previewBadgeImg,
                  {
                    transform: [
                      { rotate: `${item.imageRotation || 0}deg` },
                      { scale: item.imageScale || 1 },
                      { translateX: getNormOffset(item.imageOffsetX, 48) },
                      { translateY: getNormOffset(item.imageOffsetY, 48) },
                    ],
                  },
                ]}
                contentFit="cover"
              />
            ) : (
              <Text style={s.previewEmojiTxt}>{palette.emoji}</Text>
            )}
          </View>
        </LinearGradient>

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
};

  return (
    <View style={s.container}>
      {showHeader && (
        <ScreenHeader
          title="Banners & Offers"
          subtitle="Manage customer home carousel banners"
        />
      )}

      {/* Action Bar */}
      <View style={s.actionBar}>
        <View style={s.bannerCountWrap}>
          <Text style={s.bannerCountTxt}>
            {banners.length} / {MAX_BANNERS} Banners
          </Text>
          {banners.length >= MAX_BANNERS && (
            <Text style={s.bannerLimitNotice}>Max limit (5) reached</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.addBtn, banners.length >= MAX_BANNERS && s.addBtnDisabled]}
          onPress={openAdd}
          activeOpacity={banners.length >= MAX_BANNERS ? 1 : 0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={s.addBtnTxt}>New Banner</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loadError ? <ErrorState message={loadError.message} onRetry={() => setReload(n => n + 1)} /> : loading ? (
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
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setModalVisible(false);
        }}
      >
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
                    {(() => {
                      const previewPalette = getBannerPalette({
                        title,
                        subtitle,
                        linkedItemName,
                        color: selectedColor,
                      });
                      return (
                        <LinearGradient
                          colors={[previewPalette.colors[0], previewPalette.colors[1]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[s.bannerPreview, { marginBottom: Spacing.xs }]}
                        >
                          <View style={s.previewDecoCircle} />
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
                          <View style={s.previewEmojiBadge}>
                            {imageUrl ? (
                              <Image
                                source={{ uri: imageUrl }}
                                style={[
                                  s.previewBadgeImg,
                                  {
                                    transform: [
                                      { rotate: `${imageRotation || 0}deg` },
                                      { scale: imageScale },
                                      { translateX: getNormOffset(imageOffsetX, 48) },
                                      { translateY: getNormOffset(imageOffsetY, 48) },
                                    ],
                                  },
                                ]}
                                contentFit="cover"
                              />
                            ) : (
                              <Text style={s.previewEmojiTxt}>{previewPalette.emoji}</Text>
                            )}
                          </View>
                        </LinearGradient>
                      );
                    })()}

                    {/* Title */}
                    <View style={s.inputGroup}>
                      <Text style={s.inputLabel}>Start with a template, then upload your photo</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {[{ title: 'Fresh groceries', subtitle: 'Shop today’s available essentials', color: Colors.green700 }, { title: '20L water cans', subtitle: 'Order water for your home', color: Colors.green900 }, { title: 'Weekend picks', subtitle: 'Browse our latest arrivals', color: Colors.amber }].map(template => <Button key={template.title} label={template.title} variant="secondary" onPress={() => { setTitle(template.title); setSubtitle(template.subtitle); setSelectedColor(template.color); }} />)}
              </View>
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

                    {/* Round Product Badge Picture Upload */}
                    <View style={s.inputGroup}>
                      <Text style={s.inputLabel}>Round Badge Picture (Product Icon)</Text>
                      <View style={s.imageUploadRow}>
                        <TouchableOpacity
                          style={s.badgeUploadCircle}
                          onPress={handlePhotoAction}
                          disabled={pickingImage}
                          activeOpacity={0.8}
                        >
                          {imageUrl ? (
                            <Image
                              source={{ uri: imageUrl }}
                              style={[
                                s.badgeUploadImg,
                                {
                                  transform: [
                                    { rotate: `${imageRotation || 0}deg` },
                                    { scale: imageScale },
                                    { translateX: getNormOffset(imageOffsetX, 58) },
                                    { translateY: getNormOffset(imageOffsetY, 58) },
                                  ],
                                },
                              ]}
                              contentFit="cover"
                            />
                          ) : (
                            <Text style={{ fontSize: 26 }}>
                              {getBannerPalette({ title, subtitle, linkedItemName, color: selectedColor }).emoji}
                            </Text>
                          )}
                        </TouchableOpacity>

                        <View style={{ flex: 1, gap: 5 }}>
                          <TouchableOpacity
                            style={s.uploadBtn}
                            onPress={handlePhotoAction}
                            disabled={pickingImage}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={imageUrl ? 'image-outline' : 'cloud-upload-outline'}
                              size={16}
                              color={Colors.green700}
                            />
                            <Text style={s.uploadBtnTxt}>
                              {pickingImage ? 'Loading photo...' : imageUrl ? 'Change Picture' : 'Upload Custom Picture'}
                            </Text>
                          </TouchableOpacity>
                          <Text style={s.uploadHintTxt}>
                            {imageUrl
                              ? 'Custom picture attached • Tap to change or remove'
                              : 'Upload any product picture from gallery, or keep the category emoji'}
                          </Text>
                        </View>
                      </View>
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
      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPickerModalVisible(false)}
      >
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

      {/* Round Crop & Zoom Adjuster Modal */}
      <Modal
        visible={cropModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCropModalVisible(false)}
      >
        <TouchableOpacity
          style={s.cropModalOverlay}
          activeOpacity={1}
          onPress={() => setCropModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            <View style={s.cropModalCard}>
              {/* Header */}
              <View style={s.cropModalHeader}>
                <View>
                  <Text style={s.cropModalTitle}>Crop Round Icon</Text>
                  <Text style={s.cropModalSub}>Drag image to pan • Tap rotate • Zoom in & out</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCropModalVisible(false)}
                  hitSlop={10}
                  style={s.cropCloseBtn}
                >
                  <Ionicons name="close" size={22} color={Colors.ink} />
                </TouchableOpacity>
              </View>

              {/* Circular Viewfinder */}
              <View style={s.viewfinderContainer}>
                <View style={s.viewfinderCircleOuter}>
                  <View
                    style={s.viewfinderCircle}
                    {...panResponder.panHandlers}
                  >
                    {imageUrl ? (
                      <Image
                        source={{ uri: imageUrl }}
                        style={[
                          s.viewfinderImg,
                          {
                            transform: [
                              { rotate: `${tempRotation}deg` },
                              { scale: tempScale },
                              { translateX: tempOffsetX * 200 },
                              { translateY: tempOffsetY * 200 },
                            ],
                          },
                        ]}
                        contentFit="cover"
                      />
                    ) : null}
                  </View>
                  <View style={s.viewfinderRing} pointerEvents="none" />

                  {/* Touch-to-Rotate Button on Circle */}
                  <TouchableOpacity
                    style={s.viewfinderRotatePill}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTempRotation(prev => (prev + 90) % 360);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sync" size={13} color="#FFFFFF" />
                    <Text style={s.viewfinderRotatePillTxt}>{tempRotation}°</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.dragHintTxt}>
                  {tempScale <= 1.05
                    ? '✨ Picture fills circle completely • Zoom in to reposition'
                    : '👆 Touch & drag inside circle to pan • Edges locked to prevent gaps'}
                </Text>
              </View>

              {/* Rotation Controls */}
              <View style={s.rotateSection}>
                <View style={s.rotateHeaderRow}>
                  <Text style={s.sectionMiniLabel}>Rotation:</Text>
                  <TouchableOpacity
                    style={s.rotateActionBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTempRotation(prev => (prev + 90) % 360);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={15} color={Colors.green700} />
                    <Text style={s.rotateActionTxt}>Rotate 90° ({tempRotation}°)</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.angleChipsRow}>
                  {[0, 90, 180, 270].map(angle => {
                    const isSel = tempRotation === angle;
                    return (
                      <TouchableOpacity
                        key={angle}
                        style={[s.angleChip, isSel && s.angleChipActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTempRotation(angle);
                        }}
                      >
                        <Text style={[s.angleChipTxt, isSel && s.angleChipTxtActive]}>
                          {angle}°
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Zoom In & Zoom Out Controls */}
              <View style={s.zoomSection}>
                <View style={s.zoomControlsRow}>
                  <TouchableOpacity
                    style={[s.zoomStepBtn, tempScale <= 1 && s.zoomBtnDisabled]}
                    onPress={() => updateTempScale(tempScale - 0.2)}
                    disabled={tempScale <= 1}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color={tempScale <= 1 ? Colors.inkSoft : Colors.green700} />
                    <Text style={[s.zoomStepTxt, tempScale <= 1 && { color: Colors.inkSoft }]}>Zoom Out</Text>
                  </TouchableOpacity>

                  <View style={s.currentZoomBadge}>
                    <Text style={s.currentZoomLabel}>Zoom Size</Text>
                    <Text style={s.currentZoomTxt}>{tempScale.toFixed(2)}x</Text>
                  </View>

                  <TouchableOpacity
                    style={[s.zoomStepBtn, tempScale >= 3.5 && s.zoomBtnDisabled]}
                    onPress={() => updateTempScale(tempScale + 0.2)}
                    disabled={tempScale >= 3.5}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={tempScale >= 3.5 ? Colors.inkSoft : Colors.green700} />
                    <Text style={[s.zoomStepTxt, tempScale >= 3.5 && { color: Colors.inkSoft }]}>Zoom In</Text>
                  </TouchableOpacity>
                </View>

                {/* Preset Zoom Chips */}
                <View style={s.presetChipsRow}>
                  {[1.0, 1.25, 1.5, 2.0, 2.5, 3.0].map(val => (
                    <TouchableOpacity
                      key={val}
                      style={[s.presetChip, Math.abs(tempScale - val) < 0.05 && s.presetChipActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        updateTempScale(val);
                      }}
                    >
                      <Text style={[s.presetChipTxt, Math.abs(tempScale - val) < 0.05 && s.presetChipTxtActive]}>
                        {val.toFixed(2)}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={s.recenterBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTempOffsetX(0);
                      setTempOffsetY(0);
                    }}
                  >
                    <Ionicons name="locate" size={13} color={Colors.green700} />
                    <Text style={s.recenterBtnTxt}>Center</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.resetPositionBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTempScale(1);
                      setTempOffsetX(0);
                      setTempOffsetY(0);
                      setTempRotation(0);
                    }}
                  >
                    <Ionicons name="refresh" size={13} color={Colors.inkSoft} />
                    <Text style={s.resetPositionTxt}>Reset All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Actions */}
              <View style={s.cropActionsRow}>
                <TouchableOpacity
                  style={s.cropCancelBtn}
                  onPress={() => setCropModalVisible(false)}
                >
                  <Text style={s.cropCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cropApplyBtn}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setImageScale(tempScale);
                    setImageOffsetX(tempOffsetX);
                    setImageOffsetY(tempOffsetY);
                    setImageRotation(tempRotation);
                    setCropModalVisible(false);
                    showToast('Round crop & zoom applied!', 'success');
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={s.cropApplyTxt}>Apply Round Crop</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Upload Picture Options Sheet / Dialog */}
      <Modal
        visible={uploadOptionsVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setUploadOptionsVisible(false)}
      >
        <TouchableOpacity
          style={s.uploadModalOverlay}
          activeOpacity={1}
          onPress={() => setUploadOptionsVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            <View style={s.uploadModalCard}>
              <View style={s.uploadModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.uploadModalTitle}>Product Badge Picture</Text>
                  <Text style={s.uploadModalSub}>Upload a photo or adjust the round crop</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setUploadOptionsVisible(false)}
                  hitSlop={10}
                  style={s.cropCloseBtn}
                >
                  <Ionicons name="close" size={22} color={Colors.ink} />
                </TouchableOpacity>
              </View>

              <View style={s.uploadOptionsList}>
                <TouchableOpacity
                  style={s.uploadOptionRow}
                  onPress={() => {
                    setUploadOptionsVisible(false);
                    pickImage(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[s.uploadOptionIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="camera" size={20} color={Colors.green700} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.uploadOptionLabel}>Take Photo</Text>
                    <Text style={s.uploadOptionSub}>Use phone camera to capture item</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.inkSoft} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.uploadOptionRow}
                  onPress={() => {
                    setUploadOptionsVisible(false);
                    pickImage(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[s.uploadOptionIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="images" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.uploadOptionLabel}>Choose from Gallery</Text>
                    <Text style={s.uploadOptionSub}>Select existing product photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.inkSoft} />
                </TouchableOpacity>

                {imageUrl && (
                  <>
                    <TouchableOpacity
                      style={s.uploadOptionRow}
                      onPress={() => {
                        setUploadOptionsVisible(false);
                        const safeScale = imageScale || 1;
                        setTempScale(safeScale);
                        setTempOffsetX(clampNormOffset(imageOffsetX || 0, safeScale));
                        setTempOffsetY(clampNormOffset(imageOffsetY || 0, safeScale));
                        setTempRotation(imageRotation || 0);
                        setCropModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[s.uploadOptionIconBox, { backgroundColor: '#F3E8FF' }]}>
                        <Ionicons name="crop" size={20} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.uploadOptionLabel}>Adjust Round Crop & Zoom</Text>
                        <Text style={s.uploadOptionSub}>Pan, rotate or resize current picture</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.inkSoft} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.uploadOptionRow, { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setUploadOptionsVisible(false);
                        setImageUrl(null);
                        setImageScale(1);
                        setImageOffsetX(0);
                        setImageOffsetY(0);
                        setImageRotation(0);
                        showToast('Custom picture removed (using emoji)', 'info');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[s.uploadOptionIconBox, { backgroundColor: '#FEE2E2' }]}>
                        <Ionicons name="trash" size={20} color={Colors.coral} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.uploadOptionLabel, { color: Colors.coral }]}>Remove Picture</Text>
                        <Text style={s.uploadOptionSub}>Switch back to category emoji icon</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.inkSoft} />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Prominent Cancel Button */}
              <TouchableOpacity
                style={s.uploadModalCancelBtn}
                onPress={() => setUploadOptionsVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={s.uploadModalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
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
    position: 'relative',
    overflow: 'hidden',
  },
  previewDecoCircle: {
    position: 'absolute',
    top: -15,
    right: -15,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  previewEmojiBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  previewBadgeImg: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  bannerCountWrap: {
    gap: 2,
  },
  bannerLimitNotice: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.coral,
  },
  addBtnDisabled: {
    backgroundColor: Colors.inkSoft,
    opacity: 0.85,
  },
  imageUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.cream,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  badgeUploadCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.green700,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  badgeUploadImg: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.green700,
    borderRadius: Radius.button,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    alignSelf: 'flex-start',
  },
  uploadBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  uploadHintTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    lineHeight: 14,
  },

  // Crop & Zoom Modal Styles
  cropModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  cropModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.card,
  },
  cropModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    paddingBottom: Spacing.sm,
  },
  cropModalTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  cropModalSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  cropCloseBtn: {
    padding: 4,
  },
  viewfinderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  viewfinderCircleOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  viewfinderCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  viewfinderRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: Colors.green500,
  },
  viewfinderImg: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  dragHintTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 8,
  },
  zoomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  zoomStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  zoomBtnDisabled: {
    opacity: 0.4,
  },
  zoomStepTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  currentZoomBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.green700,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentZoomLabel: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentZoomTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  presetChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  presetChipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  presetChipTxtActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  recenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.green700,
  },
  recenterBtnTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  resetPositionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    backgroundColor: '#F3F4F6',
  },
  resetPositionTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  viewfinderRotatePill: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.green700,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  viewfinderRotatePillTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  rotateSection: {
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 6,
  },
  rotateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionMiniLabel: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
  rotateActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.green700,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  rotateActionTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  angleChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  angleChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  angleChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  angleChipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  angleChipTxtActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  zoomSection: {
    gap: 8,
  },
  cropActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  cropCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cropCancelTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
  cropApplyBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.green700,
    borderRadius: Radius.button,
    paddingVertical: 10,
  },
  cropApplyTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
  },
  previewEmojiTxt: {
    fontSize: 22,
  },
  previewContent: {
    flex: 1,
    paddingRight: Spacing.md,
    zIndex: 2,
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

  // Upload Options Sheet Styles
  uploadModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Spacing.md,
  },
  uploadModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Platform.OS === 'ios' ? 20 : 10,
    ...Shadow.card,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    paddingBottom: Spacing.sm,
  },
  uploadModalTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  uploadModalSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  uploadOptionsList: {
    gap: 4,
  },
  uploadOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
  },
  uploadOptionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOptionLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  uploadOptionSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  uploadModalCancelBtn: {
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  uploadModalCancelTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
});

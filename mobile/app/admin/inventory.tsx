// app/admin/inventory.tsx — Store Inventory & Stock Management
import React, { useState, useMemo, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { preparePhoto } from '../../services/photos';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useItems } from '../../hooks/useItems';
import {
  createItem,
  updateItem,
  softDeleteItem,
  toggleStock,
} from '../../services/items';
import {
  ScreenHeader,
  Card,
  Button,
  EmptyState,
  ErrorState,
  CardSkeleton,
  useToast,
} from '../../components/ui';
import { getProductImage, getSuggestedPreset } from '../../utils/productImages';
import type { Item } from '../../types';
import OffersScreen from './offers';

const CATEGORIES = ['All', 'Vegetables', 'Fruits', 'Groceries', 'Water', 'Other'];
const UNITS = ['kg', 'g', 'ltr', 'ml', 'piece', 'bunch', 'can', 'packet'];

export default function InventoryScreen() {
  const { items, loading, error, refresh } = useItems(false);
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<'products' | 'offers'>('products');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  // Add / Edit Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Focus ref for rapid successive entry
  const nameInputRef = useRef<any>(null);

  // Form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('kg');
  const [inStock, setInStock] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesCategory =
        selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        (item.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (item.category || '').toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesStock =
        stockFilter === 'all'
          ? true
          : stockFilter === 'in_stock'
          ? item.inStock
          : !item.inStock;
      return matchesCategory && matchesSearch && matchesStock;
    });
  }, [items, selectedCategory, searchQuery, stockFilter]);

  // Inventory summary counts
  const summary = useMemo(() => {
    const total = items.length;
    const inStockCount = items.filter(i => i.inStock).length;
    const outOfStockCount = total - inStockCount;
    return { total, inStockCount, outOfStockCount };
  }, [items]);

  const openAdd = () => {
    setEditingItem(null);
    setName('');
    setCategory(selectedCategory !== 'All' ? selectedCategory : 'Vegetables');
    setPrice('');
    setUnit('kg');
    setInStock(true);
    setImageUrl(null);
    setSuccessBanner(null);
    setModalVisible(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 200);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setPrice(String(item.price));
    setUnit(item.unit);
    setInStock(item.inStock);
    setImageUrl(item.imageUrl || null);
    setSuccessBanner(null);
    setModalVisible(true);
  };

  // Image picking handler with camera or gallery
  const pickImage = async (useCamera: boolean) => {
    try {
      setPickingImage(true);
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = await preparePhoto(asset, 'product');
        setImageUrl(uri);
        Haptics.selectionAsync();
        showToast('Photo attached to product!', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not pick image';
      showToast(msg, 'error');
    } finally {
      setPickingImage(false);
    }
  };

  const handlePhotoAction = () => {
    Alert.alert(
      'Product Photo',
      'Choose an option for the product image:',
      [
        { text: '📷 Take Photo', onPress: () => pickImage(true) },
        { text: '🖼️ Choose from Gallery', onPress: () => pickImage(false) },
        imageUrl
          ? {
              text: '✕ Revert to Auto-Preset',
              style: 'destructive',
              onPress: () => {
                setImageUrl(null);
                showToast('Reverted to smart auto-preset', 'info');
              },
            }
          : { text: 'Cancel', style: 'cancel' },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // Stock toggle
  const handleToggleStock = async (item: Item) => {
    try {
      Haptics.selectionAsync();
      const newStatus = !item.inStock;
      await toggleStock(item.id, newStatus);
      showToast(
        `${item.name} is now ${newStatus ? 'IN STOCK' : 'OUT OF STOCK'}`,
        newStatus ? 'success' : 'info',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update stock';
      showToast(msg, 'error');
    }
  };

  // Soft delete
  const handleDelete = (item: Item) => {
    Alert.alert(
      'Remove Item',
      `Are you sure you want to remove "${item.name}" from the store catalog? Existing orders will preserve their item snapshot.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteItem(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast(`Removed "${item.name}"`, 'info');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not remove item';
              showToast(msg, 'error');
            }
          },
        },
      ],
    );
  };

  // Save Item (Create or Update)
  // keepOpen: if true, saves, clears inputs, keeps modal open, and focuses name field for rapid adding
  const handleSave = async (keepOpen = false) => {
    const trimmedName = name.trim();
    const numPrice = parseFloat(price);

    if (!trimmedName) {
      showToast('Please enter product name', 'error');
      nameInputRef.current?.focus();
      return;
    }
    if (isNaN(numPrice) || numPrice < 0) {
      showToast('Please enter a valid price (₹)', 'error');
      return;
    }

    try {
      setSaving(true);
      if (editingItem) {
        await updateItem(editingItem.id, {
          name: trimmedName,
          category,
          price: numPrice,
          unit: unit.trim(),
          inStock,
          imageUrl: imageUrl || null,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Updated "${trimmedName}"`, 'success');
        setModalVisible(false);
      } else {
        await createItem({
          name: trimmedName,
          category,
          price: numPrice,
          unit: unit.trim(),
          inStock,
          imageUrl: imageUrl || null,
          sortOrder: items.length + 1,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (keepOpen) {
          // Rapid-entry mode: clear name & price, keep window open, refocus for next item
          setName('');
          setPrice('');
          setImageUrl(null);
          setSuccessBanner(`✓ "${trimmedName}" saved! Enter next product.`);
          showToast(`"${trimmedName}" saved! Enter next product.`, 'success');
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 150);
        } else {
          showToast(`"${trimmedName}" added to catalog`, 'success');
          setModalVisible(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save item';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Item }) => (
    <View style={s.itemCard}>
      <View style={s.itemMain}>
        <Image
          source={{ uri: getProductImage(item) }}
          style={s.itemThumb}
          contentFit="cover"
          transition={200}
        />
        <View style={s.itemInfo}>
          <Text style={s.itemName}>{item.name}</Text>
          <View style={s.itemMetaRow}>
            <View style={s.categoryBadge}>
              <Text style={s.categoryBadgeTxt}>{item.category}</Text>
            </View>
            <Text style={s.unitTxt}>per {item.unit}</Text>
          </View>
          <Text style={s.priceTxt}>₹{item.price}</Text>
        </View>

        {/* Stock Switch */}
        <View style={s.switchGroup}>
          <Text
            style={[
              s.stockLabel,
              item.inStock ? s.stockLabelIn : s.stockLabelOut,
            ]}
          >
            {item.inStock ? 'In Stock' : 'Out of Stock'}
          </Text>
          <Switch
            value={item.inStock}
            onValueChange={() => handleToggleStock(item)}
            trackColor={{ false: Colors.line, true: Colors.green500 }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Action Footer */}
      <View style={s.cardFooter}>
        <TouchableOpacity
          style={s.footerBtn}
          onPress={() => openEdit(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={15} color={Colors.green700} />
          <Text style={s.footerBtnTxt}>Edit Item</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.footerBtn, { borderColor: Colors.coral }]}
          onPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={15} color={Colors.coral} />
          <Text style={[s.footerBtnTxt, { color: Colors.coral }]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <ScreenHeader
        title={activeSection === 'products' ? 'Inventory & Stock' : 'Offers & Banners'}
        subtitle={
          activeSection === 'products'
            ? 'Manage product availability & prices'
            : 'Configure promo banners & discount offers'
        }
      />

      {/* Top Section Switcher: Products vs Offers */}
      <View style={s.sectionSwitcher}>
        <TouchableOpacity
          style={[s.sectionTab, activeSection === 'products' && s.sectionTabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveSection('products');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="cube-outline"
            size={16}
            color={activeSection === 'products' ? Colors.green700 : Colors.inkSoft}
          />
          <Text
            style={[
              s.sectionTabTxt,
              activeSection === 'products' && s.sectionTabTxtActive,
            ]}
          >
            Products ({items.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.sectionTab, activeSection === 'offers' && s.sectionTabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveSection('offers');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="pricetag-outline"
            size={16}
            color={activeSection === 'offers' ? Colors.green700 : Colors.inkSoft}
          />
          <Text
            style={[
              s.sectionTabTxt,
              activeSection === 'offers' && s.sectionTabTxtActive,
            ]}
          >
            Offers & Banners
          </Text>
        </TouchableOpacity>
      </View>

      {activeSection === 'offers' ? (
        <OffersScreen showHeader={false} />
      ) : (
        <>
          {/* Summary Strip — Interactive Quick Filtering */}
          <View style={s.summaryStrip}>
            <TouchableOpacity
              style={[s.summaryItem, stockFilter === 'all' && s.summaryItemActiveAll]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('all');
              }}
              activeOpacity={0.7}
            >
              <Text style={s.summaryVal}>{summary.total}</Text>
              <Text style={s.summaryLabel}>Total Items</Text>
            </TouchableOpacity>

            <View style={s.summaryDiv} />

            <TouchableOpacity
              style={[s.summaryItem, stockFilter === 'in_stock' && s.summaryItemActiveIn]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('in_stock');
              }}
              activeOpacity={0.7}
            >
              <Text style={[s.summaryVal, { color: Colors.green700 }]}>
                {summary.inStockCount}
              </Text>
              <Text style={s.summaryLabel}>In Stock</Text>
            </TouchableOpacity>

            <View style={s.summaryDiv} />

            <TouchableOpacity
              style={[s.summaryItem, stockFilter === 'out_of_stock' && s.summaryItemActiveOut]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('out_of_stock');
              }}
              activeOpacity={0.7}
            >
              <Text style={[s.summaryVal, { color: Colors.coral }]}>
                {summary.outOfStockCount}
              </Text>
              <Text style={[s.summaryLabel, summary.outOfStockCount > 0 && { color: Colors.coral, fontFamily: 'Manrope_700Bold' }]}>
                {summary.outOfStockCount > 0 ? 'Out of Stock ⚠️' : 'Out of Stock'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search & Add Action Bar */}
          <View style={s.actionBar}>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={Colors.inkSoft} style={{ marginRight: 6 }} />
              <TextInput
                style={s.searchInput}
                placeholder="Search items..."
                placeholderTextColor={Colors.inkSoft}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.inkSoft} />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={s.addBtnTxt}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {/* Stock Status Filter Bar */}
          <View style={s.stockFilterRow}>
            <TouchableOpacity
              style={[s.stockChip, stockFilter === 'all' && s.stockChipActiveAll]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('all');
              }}
              activeOpacity={0.7}
            >
              <Text style={[s.stockChipTxt, stockFilter === 'all' && s.stockChipTxtActiveAll]}>
                📦 All ({summary.total})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.stockChip, stockFilter === 'in_stock' && s.stockChipActiveIn]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('in_stock');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="checkmark-circle"
                size={13}
                color={stockFilter === 'in_stock' ? '#FFFFFF' : Colors.green700}
              />
              <Text style={[s.stockChipTxt, stockFilter === 'in_stock' && s.stockChipTxtActiveIn]}>
                In Stock ({summary.inStockCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.stockChip, stockFilter === 'out_of_stock' && s.stockChipActiveOut]}
              onPress={() => {
                Haptics.selectionAsync();
                setStockFilter('out_of_stock');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="alert-circle"
                size={13}
                color={stockFilter === 'out_of_stock' ? '#FFFFFF' : Colors.coral}
              />
              <Text style={[s.stockChipTxt, stockFilter === 'out_of_stock' && s.stockChipTxtActiveOut]}>
                Out of Stock ({summary.outOfStockCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Refill Prompt Banner when viewing Out of Stock */}
          {stockFilter === 'out_of_stock' && (
            <View style={s.refillBanner}>
              <Ionicons name="refresh-circle" size={20} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={s.refillBannerTitle}>
                  {summary.outOfStockCount > 0
                    ? `${summary.outOfStockCount} Product${summary.outOfStockCount > 1 ? 's' : ''} Need Refilling`
                    : 'All Products In Stock'}
                </Text>
                <Text style={s.refillBannerSub}>
                  {summary.outOfStockCount > 0
                    ? 'Check items below and toggle the stock switch once refilled to make them available for customers.'
                    : 'Everything is currently stocked and ready for customer orders!'}
                </Text>
              </View>
            </View>
          )}

          {/* Category Pills */}
          <View style={s.categoryBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.categoryScroll}
            >
              {CATEGORIES.map(cat => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[s.categoryChip, isSelected && s.categoryChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedCategory(cat);
                    }}
                  >
                    <Text
                      style={[s.categoryChipTxt, isSelected && s.categoryChipTxtActive]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

      {/* List */}
      {error ? (
        <ErrorState
          message={`Could not load products. ${error.message}`}
          onRetry={refresh}
        />
      ) : loading ? (
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={Colors.green700}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                stockFilter === 'out_of_stock'
                  ? 'All Items In Stock! 🎉'
                  : 'No Items Found'
              }
              subtitle={
                stockFilter === 'out_of_stock'
                  ? 'Great job! There are currently no out of stock items to refill in this category.'
                  : searchQuery
                  ? `No items matching "${searchQuery}".`
                  : `No products listed in ${selectedCategory}.`
              }
              actionLabel={
                stockFilter !== 'all'
                  ? 'Show All Items'
                  : '+ Add New Product'
              }
              onAction={
                stockFilter !== 'all'
                  ? () => setStockFilter('all')
                  : openAdd
              }
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
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent}>
            {/* Top Modal Header with Quick Action Buttons */}
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.headerCancelBtn}>
                <Text style={s.headerCancelTxt}>{editingItem ? 'Cancel' : 'Close'}</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>
                {editingItem ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity
                onPress={() => handleSave(false)}
                disabled={saving}
                style={s.headerSaveBtn}
                activeOpacity={0.8}
              >
                <Text style={s.headerSaveTxt}>
                  {saving ? 'Saving...' : editingItem ? 'Save' : 'Save & Close'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ paddingBottom: Spacing.md }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.formGap}>
                {/* Rapid-entry success banner */}
                {successBanner ? (
                  <View style={s.successBanner}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.green700} />
                    <Text style={s.successBannerTxt}>{successBanner}</Text>
                  </View>
                ) : null}

                {/* Product Photo Selector */}
                <View style={s.photoPickerRow}>
                  <TouchableOpacity
                    style={s.photoBox}
                    onPress={handlePhotoAction}
                    activeOpacity={0.8}
                    disabled={pickingImage}
                  >
                    {pickingImage ? (
                      <ActivityIndicator size="small" color={Colors.green700} />
                    ) : (
                      <>
                        <Image
                          source={{ uri: imageUrl || getProductImage({ name, category, imageUrl }) }}
                          style={s.photoImg}
                          contentFit="cover"
                          transition={150}
                        />
                        <View style={s.photoEditBadge}>
                          <Ionicons name="camera" size={13} color="#FFFFFF" />
                        </View>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={s.photoMeta}>
                    <View style={s.photoBadgeRow}>
                      <View style={[s.photoStatusPill, imageUrl ? s.photoStatusCustom : s.photoStatusAuto]}>
                        <Text style={[s.photoStatusTxt, imageUrl ? s.photoStatusTxtCustom : s.photoStatusTxtAuto]}>
                          {imageUrl ? '★ Custom Photo' : '✨ Auto-Matched Preset'}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.photoHint} numberOfLines={1}>
                      {imageUrl
                        ? 'Custom photo attached'
                        : `Preview: ${getSuggestedPreset(name, category)?.label || category}`}
                    </Text>
                    <TouchableOpacity
                      onPress={handlePhotoAction}
                      style={s.photoActionLink}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="images-outline" size={14} color={Colors.green700} />
                      <Text style={s.photoActionLinkTxt}>
                        {imageUrl ? 'Change Photo' : 'Snap / Upload Photo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Product Name */}
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Product Name *</Text>
                  <TextInput
                    ref={nameInputRef}
                    style={s.textInput}
                    placeholder="e.g. Fresh Tomatoes"
                    placeholderTextColor={Colors.inkSoft}
                    value={name}
                    onChangeText={setName}
                    returnKeyType="next"
                  />
                </View>

                {/* Category Picker */}
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Category</Text>
                  <View style={s.pickerRow}>
                    {CATEGORIES.filter(c => c !== 'All').map(c => {
                      const isSel = category === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[s.pickerPill, isSel && s.pickerPillActive]}
                          onPress={() => setCategory(c)}
                        >
                          <Text
                            style={[s.pickerPillTxt, isSel && s.pickerPillTxtActive]}
                          >
                            {c}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Price & Unit Row */}
                <View style={s.rowTwo}>
                  <View style={[s.inputGroup, { flex: 1 }]}>
                    <Text style={s.inputLabel}>Price (₹) *</Text>
                    <TextInput
                      style={s.textInput}
                      placeholder="0.00"
                      placeholderTextColor={Colors.inkSoft}
                      keyboardType="numeric"
                      value={price}
                      onChangeText={setPrice}
                    />
                  </View>

                  <View style={[s.inputGroup, { flex: 1 }]}>
                    <Text style={s.inputLabel}>Unit</Text>
                    <TextInput
                      style={s.textInput}
                      placeholder="kg, bunch, can"
                      placeholderTextColor={Colors.inkSoft}
                      value={unit}
                      onChangeText={setUnit}
                    />
                  </View>
                </View>

                {/* In Stock Toggle */}
                <View style={s.stockToggleRow}>
                  <View>
                    <Text style={s.stockToggleTitle}>Product In Stock</Text>
                    <Text style={s.stockToggleSub}>
                      Available for customer orders
                    </Text>
                  </View>
                  <Switch
                    value={inStock}
                    onValueChange={setInStock}
                    trackColor={{ false: Colors.line, true: Colors.green500 }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={s.modalBtnRow}>
              {editingItem ? (
                <>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setModalVisible(false)}
                    style={{ flex: 1 }}
                    fullWidth={false}
                  />
                  <Button
                    label={saving ? 'Saving...' : 'Save Changes'}
                    variant="primary"
                    onPress={() => handleSave(false)}
                    loading={saving}
                    disabled={saving}
                    style={{ flex: 2 }}
                    fullWidth={false}
                  />
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={s.closeModalBtn}
                    onPress={() => setModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.closeModalBtnTxt}>Done</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.addNextBtn}
                    onPress={() => handleSave(true)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                    <Text style={s.addNextBtnTxt}>
                      {saving ? 'Adding...' : 'Add & Next'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.saveCloseBtn}
                    onPress={() => handleSave(false)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Text style={s.saveCloseBtnTxt}>Save & Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },

  // Section Switcher
  sectionSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    padding: 3,
    borderRadius: Radius.chip,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.chip,
    gap: 6,
  },
  sectionTabActive: {
    backgroundColor: '#FFFFFF',
    ...Shadow.card,
  },
  sectionTabTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
  sectionTabTxtActive: {
    color: Colors.green700,
  },

  // Summary
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: Radius.sm,
  },
  summaryItemActiveAll: {
    backgroundColor: '#F3F4F6',
  },
  summaryItemActiveIn: {
    backgroundColor: '#F0FDF4',
  },
  summaryItemActiveOut: {
    backgroundColor: '#FEF2F2',
  },
  summaryVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  summaryLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  summaryDiv: {
    width: 1,
    height: 24,
    backgroundColor: Colors.line,
    alignSelf: 'center',
  },

  // Stock Filter
  stockFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    gap: Spacing.xs,
    backgroundColor: Colors.cream,
  },
  stockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.chip,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  stockChipActiveAll: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  stockChipActiveIn: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  stockChipActiveOut: {
    backgroundColor: Colors.coral,
    borderColor: Colors.coral,
  },
  stockChipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
  stockChipTxtActiveAll: {
    color: '#FFFFFF',
  },
  stockChipTxtActiveIn: {
    color: '#FFFFFF',
  },
  stockChipTxtActiveOut: {
    color: '#FFFFFF',
  },
  refillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  refillBannerTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#92400E',
  },
  refillBannerSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: '#78350F',
    marginTop: 1,
    lineHeight: 15,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.md,
    height: 40,
    borderRadius: Radius.button,
    gap: 4,
  },
  addBtnTxt: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
  },

  // Categories
  categoryBar: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  categoryScroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  categoryChipActive: {
    backgroundColor: Colors.green900,
    borderColor: Colors.green900,
  },
  categoryChipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  categoryChipTxtActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_800ExtraBold',
  },

  // Items list
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl * 2,
  },
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
    gap: Spacing.sm,
  },
  itemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  categoryBadge: {
    backgroundColor: Colors.cream,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  categoryBadgeTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  unitTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  priceTxt: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginTop: 2,
  },
  switchGroup: {
    alignItems: 'flex-end',
    gap: 4,
  },
  stockLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
  },
  stockLabelIn: {
    color: Colors.green700,
  },
  stockLabelOut: {
    color: Colors.coral,
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
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pickerPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.chip,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  pickerPillActive: {
    backgroundColor: Colors.green900,
    borderColor: Colors.green900,
  },
  pickerPillTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  pickerPillTxtActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  stockToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
  },
  stockToggleTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  stockToggleSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    width: '100%',
    alignItems: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#E8F5E9',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  successBannerTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green900,
  },
  closeModalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
  },
  addNextBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.button,
    backgroundColor: '#E65100',
  },
  addNextBtnTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
  },
  saveCloseBtn: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.button,
    backgroundColor: Colors.green700,
  },
  saveCloseBtnTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
  },

  // Item List Thumbnail
  itemThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    marginRight: Spacing.sm,
  },

  // Modal Photo Selector
  photoPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    padding: Spacing.sm,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  photoBox: {
    width: 68,
    height: 68,
    borderRadius: Radius.md,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(18, 53, 36, 0.85)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMeta: {
    flex: 1,
    gap: 3,
  },
  photoBadgeRow: {
    flexDirection: 'row',
  },
  photoStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  photoStatusAuto: {
    backgroundColor: '#E8F5E9',
  },
  photoStatusCustom: {
    backgroundColor: '#FFF3E0',
  },
  photoStatusTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
  },
  photoStatusTxtAuto: {
    color: Colors.green900,
  },
  photoStatusTxtCustom: {
    color: '#E65100',
  },
  photoHint: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  photoActionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  photoActionLinkTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
});

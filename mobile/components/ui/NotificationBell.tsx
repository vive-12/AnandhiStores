// components/ui/NotificationBell.tsx — Bell icon with unread badge & side notifications drawer
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useNotifications } from '../../hooks/useNotifications';
import { markRead, markAllRead, deleteNotification, clearAllNotifications } from '../../services/notifications';
import { updateUser } from '../../services/users';
import type { AppNotification } from '../../types';

// Safely resolve expo-notifications only if available (gracefully bypassed on web & Expo Go)
let NotificationsModule: typeof import('expo-notifications') | null = null;
try {
  if (Platform.OS !== 'web') {
    NotificationsModule = require('expo-notifications');
  }
} catch {
  // Gracefully ignored in environments without native push support
}

interface NotificationBellProps {
  color?: string;
  size?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.84, 350);

const isToday = (createdAt: any): boolean => {
  if (!createdAt) return true;
  let date: Date;
  if (createdAt?.seconds) {
    date = new Date(createdAt.seconds * 1000);
  } else if (typeof createdAt?.toDate === 'function') {
    date = createdAt.toDate();
  } else if (typeof createdAt?.toMillis === 'function') {
    date = new Date(createdAt.toMillis());
  } else if (createdAt instanceof Date) {
    date = createdAt;
  } else if (typeof createdAt === 'number') {
    date = new Date(createdAt);
  } else {
    date = new Date(createdAt);
  }

  if (isNaN(date.getTime())) return true;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

export function NotificationBell({ color = '#FFFFFF', size = 22 }: NotificationBellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid, role } = useSession();
  const { notifications } = useNotifications(uid);

  // Filter to only today's notifications
  const todayNotifications = useMemo(() => {
    return notifications.filter(n => isToday(n.createdAt));
  }, [notifications]);

  const todayUnreadCount = useMemo(() => {
    return todayNotifications.filter(n => !n.read).length;
  }, [todayNotifications]);

  const [isOpen, setIsOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // In-app banner for incoming notifications
  const [latestBanner, setLatestBanner] = useState<AppNotification | null>(null);
  const prevCountRef = useRef(todayUnreadCount);

  // Push notification token registration (graceful in Expo Go)
  useEffect(() => {
    if (!uid || !NotificationsModule?.getPermissionsAsync) return;

    async function registerForPush() {
      try {
        const { status: existingStatus } = await NotificationsModule!.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await NotificationsModule!.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus === 'granted') {
          const tokenData = await NotificationsModule!.getExpoPushTokenAsync();
          if (tokenData?.data) {
            await updateUser(uid!, { pushToken: tokenData.data } as Record<string, unknown>);
          }
        }
      } catch (err) {
        console.log('Push token registration skipped or unsupported in environment:', err);
      }
    }

    registerForPush();
  }, [uid]);

  // Live in-app banner trigger for today's new notifications
  useEffect(() => {
    if (todayNotifications.length > 0 && todayUnreadCount > prevCountRef.current) {
      const newest = todayNotifications[0];
      if (!newest.read) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLatestBanner(newest);
        const timer = setTimeout(() => setLatestBanner(null), 4000);
        return () => clearTimeout(timer);
      }
    }
    prevCountRef.current = todayUnreadCount;
  }, [todayUnreadCount, todayNotifications]);

  const handleOpenDrawer = () => {
    Haptics.selectionAsync();
    setLatestBanner(null);
    setIsOpen(true);

    // Automatically mark today's notifications as read when clicked
    if (todayNotifications.some(n => !n.read)) {
      markAllRead(todayNotifications).catch(err => console.log('Auto mark read error', err));
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCloseDrawer = () => {
    // Automatically clear unread status when closing / unclicking
    if (todayNotifications.some(n => !n.read)) {
      markAllRead(todayNotifications).catch(err => console.log('Auto mark read error', err));
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsOpen(false);
    });
  };

  const handleToggle = () => {
    if (isOpen) {
      handleCloseDrawer();
    } else {
      handleOpenDrawer();
    }
  };

  const handleClearTodayAll = async () => {
    Haptics.selectionAsync();
    try {
      await clearAllNotifications(todayNotifications);
    } catch (e) {
      console.error('Failed to clear notifications', e);
    }
  };

  const handleDeleteOne = async (id: string) => {
    Haptics.selectionAsync();
    try {
      await deleteNotification(id);
    } catch (e) {
      console.error('Failed to delete notification', e);
    }
  };

  const handleTapNotification = async (item: AppNotification) => {
    Haptics.selectionAsync();
    try {
      if (!item.read) {
        await markRead(item.id);
      }
      handleCloseDrawer();

      // Navigate to destination
      if (item.orderId) {
        if (role === 'customer') {
          router.push(`/track/${item.orderId}`);
        } else if (role === 'agent') {
          router.push(`/agent/delivery/${item.orderId}`);
        } else if (role === 'admin') {
          router.push('/admin/alerts');
        }
      }
    } catch (e) {
      console.error('Error handling notification tap', e);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_placed':
        return { name: 'cart' as const, color: Colors.green700, bg: '#E8F5E9' };
      case 'order_assigned':
        return { name: 'bicycle' as const, color: '#0284C7', bg: '#E0F2FE' };
      case 'order_packed':
        return { name: 'cube' as const, color: '#5B5BD6', bg: '#EEF2FF' };
      case 'order_picked_up':
        return { name: 'navigate' as const, color: Colors.amber, bg: '#FEF3C7' };
      case 'order_delivered':
        return { name: 'checkmark-circle' as const, color: Colors.green500, bg: '#E8F5E9' };
      case 'order_cancelled':
        return { name: 'close-circle' as const, color: Colors.coral, bg: '#FEE2E2' };
      default:
        return { name: 'notifications' as const, color: Colors.green700, bg: '#E8F5E9' };
    }
  };

  const formatElapsed = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    const ms = createdAt.toMillis ? createdAt.toMillis() : Date.now();
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  };

  return (
    <>
      {/* Bell Trigger */}
      <TouchableOpacity
        style={styles.bellBtn}
        onPress={handleToggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.8}
        accessibilityLabel="Today's Notifications"
      >
        <Ionicons name="notifications-outline" size={size} color={color} />
        {todayUnreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {todayUnreadCount > 9 ? '9+' : todayUnreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Floating In-App Banner */}
      {latestBanner && (
        <TouchableOpacity
          style={styles.floatingBanner}
          onPress={() => handleTapNotification(latestBanner)}
          activeOpacity={0.9}
        >
          <View style={styles.bannerIconWrap}>
            <Ionicons name="notifications" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{latestBanner.title}</Text>
            <Text style={styles.bannerBody} numberOfLines={1}>
              {latestBanner.body}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setLatestBanner(null)}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Notifications Side Drawer Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={handleCloseDrawer}
      >
        <View style={styles.modalOverlay}>
          {/* Dimmed backdrop covering the left area */}
          <Animated.View style={[styles.modalBackdrop, { opacity: fadeAnim }]}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleCloseDrawer}
            />
          </Animated.View>

          {/* Side Drawer sliding in from the right */}
          <Animated.View
            style={[
              styles.sideDrawer,
              {
                width: DRAWER_WIDTH,
                paddingTop: Math.max(insets.top, 16),
                paddingBottom: Math.max(insets.bottom, 16),
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.headerTitleRow}>
                <View style={styles.titleWithIcon}>
                  <View style={styles.headerIconCircle}>
                    <Ionicons name="notifications" size={16} color={Colors.green700} />
                  </View>
                  <View>
                    <Text style={styles.drawerTitle}>Today's Orders</Text>
                    <Text style={styles.drawerSubDate}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>

                {/* Close toggle button on the side */}
                <TouchableOpacity
                  onPress={handleCloseDrawer}
                  hitSlop={12}
                  style={styles.closeBtn}
                  accessibilityLabel="Close notifications"
                >
                  <Ionicons name="close" size={22} color={Colors.ink} />
                </TouchableOpacity>
              </View>

              <View style={styles.drawerHeaderMetaRow}>
                <Text style={styles.drawerCountTxt}>
                  {todayNotifications.length === 0
                    ? 'No orders today'
                    : `${todayNotifications.length} today`}
                </Text>
                {todayNotifications.length > 0 && (
                  <TouchableOpacity
                    onPress={handleClearTodayAll}
                    hitSlop={8}
                    style={styles.clearBtnRow}
                  >
                    <Ionicons name="trash-outline" size={12} color={Colors.coral} />
                    <Text style={styles.clearAllTxt}>Clear Today</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Notification items list */}
            {todayNotifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="calendar-clear-outline" size={32} color={Colors.green700} />
                </View>
                <Text style={styles.emptyTitle}>No Orders Today</Text>
                <Text style={styles.emptySub}>
                  Live order status updates and delivery alerts placed today will appear here.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.drawerScroll}
                contentContainerStyle={styles.drawerScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {todayNotifications.map(item => {
                  const iconMeta = getNotificationIcon(item.type);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.notifItem, !item.read && styles.notifItemUnread]}
                      onPress={() => handleTapNotification(item)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.iconBox, { backgroundColor: iconMeta.bg }]}>
                        <Ionicons name={iconMeta.name} size={18} color={iconMeta.color} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={styles.itemTitleRow}>
                          <Text style={[styles.itemTitle, !item.read && styles.itemTitleBold]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.itemTime}>{formatElapsed(item.createdAt)}</Text>
                        </View>
                        <Text style={styles.itemBody} numberOfLines={2}>
                          {item.body}
                        </Text>
                      </View>

                      {!item.read && (
                        <View style={styles.newTagBadge}>
                          <Text style={styles.newTagTxt}>NEW</Text>
                        </View>
                      )}

                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleDeleteOne(item.id);
                        }}
                        hitSlop={10}
                        style={styles.deleteBtn}
                        accessibilityLabel="Delete notification"
                      >
                        <Ionicons name="close-circle-outline" size={18} color={Colors.inkSoft} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    position: 'relative',
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.coral,
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'Manrope_800ExtraBold',
  },

  // Floating Banner
  floatingBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 36,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.green900,
    borderRadius: Radius.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.card,
    zIndex: 9999,
  },
  bannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.green700,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  bannerBody: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },

  // Side Drawer Modal
  modalOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sideDrawer: {
    height: '100%',
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    ...Shadow.card,
    elevation: 16,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    paddingBottom: Spacing.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  drawerSubDate: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: Colors.cream,
  },
  drawerHeaderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  drawerCountTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  clearBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearAllTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: Colors.coral,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.button,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: Spacing.sm,
  },
  notifItemUnread: {
    backgroundColor: '#F4FBF6',
    borderColor: Colors.green700 + '33',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    flex: 1,
  },
  itemTitleBold: {
    fontFamily: 'Manrope_800ExtraBold',
  },
  itemTime: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginLeft: 4,
  },
  itemBody: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  newTagBadge: {
    backgroundColor: Colors.coral,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  newTagTxt: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Manrope_800ExtraBold',
  },
  deleteBtn: {
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  emptySub: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textAlign: 'center',
    lineHeight: 18,
  },
});


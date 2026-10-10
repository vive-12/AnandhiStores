// app/dev/logs — In-app log viewer & exporter
// Navigate to this screen: /dev/logs
// Tap "Share Logs" → share/copy the full log text → paste to Antigravity for debugging.
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Share, Alert, ActivityIndicator, ScrollView,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getLogs, getLogsByCategory, getLogsByLevel,
  clearLogs, formatLogsForSharing,
  type LogEntry, type LogCategory, type LogLevel,
} from "../../utils/logger";
import { Colors, Spacing, FontSize, Radius } from "../../theme";

// ─── Category filter chips ────────────────────────────────────────────────────
const CATEGORIES: Array<LogCategory | "ALL"> = [
  "ALL", "AUTH", "ORDERS", "AGENT", "ADMIN", "OUTBOX", "FIRESTORE", "NAV",
];
const LEVEL_FILTERS: Array<"ALL" | "WARN" | "ERROR"> = ["ALL", "WARN", "ERROR"];

const CAT_COLOR: Record<string, string> = {
  AUTH:      "#06B6D4",
  ORDERS:    "#A855F7",
  AGENT:     "#22C55E",
  ADMIN:     "#EAB308",
  OUTBOX:    "#3B82F6",
  FIRESTORE: "#9CA3AF",
  NAV:       "#F9FAFB",
  ALL:       "#FFFFFF",
};
const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO:  "#22C55E",
  WARN:  "#EAB308",
  ERROR: "#EF4444",
  DEBUG: "#9CA3AF",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [catFilter, setCatFilter]   = useState<LogCategory | "ALL">("ALL");
  const [lvlFilter, setLvlFilter]   = useState<"ALL" | "WARN" | "ERROR">("ALL");
  const [sharing, setSharing]       = useState(false);
  const [clearing, setClearing]     = useState(false);

  const refresh = useCallback(() => {
    let data = getLogs().reverse(); // newest first
    if (catFilter !== "ALL") data = data.filter(e => e.category === catFilter);
    if (lvlFilter !== "ALL") {
      const levels: LogLevel[] = lvlFilter === "ERROR" ? ["ERROR"] : ["WARN", "ERROR"];
      data = data.filter(e => levels.includes(e.level));
    }
    setEntries(data);
  }, [catFilter, lvlFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Share / export ──────────────────────────────────────────────────────────
  const handleShare = async () => {
    setSharing(true);
    try {
      // Share the filtered view (or all if no filter)
      const filtered = catFilter !== "ALL" || lvlFilter !== "ALL" ? entries.slice().reverse() : undefined;
      const text = formatLogsForSharing(filtered);
      await Share.share({
        title: "Anandhi Stores — App Logs",
        message: text,
      });
    } catch (err: unknown) {
      Alert.alert("Share failed", String(err));
    } finally {
      setSharing(false);
    }
  };

  // ── Clear ───────────────────────────────────────────────────────────────────
  const handleClear = () => {
    Alert.alert(
      "Clear All Logs",
      "This will permanently delete all stored logs. Cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            await clearLogs();
            setEntries([]);
            setClearing(false);
          },
        },
      ],
    );
  };

  // ── Render entry ────────────────────────────────────────────────────────────
  const renderEntry = ({ item, index }: { item: LogEntry; index: number }) => {
    const catColor  = CAT_COLOR[item.category] ?? "#fff";
    const lvlColor  = LEVEL_COLOR[item.level];
    const dataStr   = item.data ? JSON.stringify(item.data, null, 2) : null;
    const isError   = item.level === "ERROR" || item.level === "WARN";

    return (
      <View style={[s.entry, isError && s.entryHighlight]}>
        {/* Row 1: time + category + level */}
        <View style={s.entryHeader}>
          <Text style={s.entryTime}>{item.time}</Text>
          <View style={[s.catBadge, { backgroundColor: catColor + "22", borderColor: catColor }]}>
            <Text style={[s.catBadgeTxt, { color: catColor }]}>{item.category}</Text>
          </View>
          <View style={[s.lvlBadge, { backgroundColor: lvlColor + "22" }]}>
            <Text style={[s.lvlBadgeTxt, { color: lvlColor }]}>{item.level}</Text>
          </View>
        </View>

        {/* Row 2: message */}
        <Text style={[s.entryMsg, isError && { color: "#FCA5A5" }]}>{item.message}</Text>

        {/* Row 3: data (if any) */}
        {dataStr ? (
          <Text style={s.entryData}>{dataStr}</Text>
        ) : null}
      </View>
    );
  };

  const entryCount = getLogs().length;

  return (
    <>
      <Stack.Screen
        options={{
          title: "App Logs",
          headerStyle:      { backgroundColor: "#111827" },
          headerTintColor:  "#fff",
          headerTitleStyle: { fontFamily: "Manrope_800ExtraBold", fontSize: 18 },
          headerRight: () => (
            <TouchableOpacity onPress={handleShare} disabled={sharing} style={s.shareBtn}>
              {sharing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="share-outline" size={22} color="#fff" />
              }
            </TouchableOpacity>
          ),
        }}
      />

      <View style={[s.container, { paddingTop: 0 }]}>

        {/* Stats bar */}
        <View style={s.statsBar}>
          <Text style={s.statsText}>
            {entries.length} shown · {entryCount} total stored
          </Text>
          <TouchableOpacity onPress={refresh} style={s.refreshBtn}>
            <Ionicons name="refresh" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterRow}
          contentContainerStyle={s.filterRowContent}
        >
          {CATEGORIES.map(cat => {
            const active = catFilter === cat;
            const color  = CAT_COLOR[cat] ?? "#fff";
            return (
              <TouchableOpacity
                key={cat}
                style={[s.chip, active && { backgroundColor: color, borderColor: color }]}
                onPress={() => setCatFilter(cat as LogCategory | "ALL")}
              >
                <Text style={[s.chipTxt, active && { color: "#000" }]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Level filter */}
        <View style={s.lvlRow}>
          {LEVEL_FILTERS.map(lvl => {
            const active = lvlFilter === lvl;
            return (
              <TouchableOpacity
                key={lvl}
                style={[s.lvlChip, active && s.lvlChipActive]}
                onPress={() => setLvlFilter(lvl)}
              >
                <Text style={[s.lvlChipTxt, active && s.lvlChipTxtActive]}>{lvl}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Clear button — right-aligned */}
          <TouchableOpacity
            onPress={handleClear}
            disabled={clearing}
            style={s.clearBtn}
          >
            {clearing
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <Text style={s.clearBtnTxt}>Clear All</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Log list */}
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderEntry}
          contentContainerStyle={entries.length === 0 ? s.emptyContainer : s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="document-text-outline" size={40} color="#374151" />
              <Text style={s.emptyTxt}>No logs yet</Text>
              <Text style={s.emptySubTxt}>Use the app then come back here</Text>
            </View>
          }
        />

        {/* Bottom action bar */}
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <TouchableOpacity style={s.shareFullBtn} onPress={handleShare} disabled={sharing}>
            {sharing
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={s.shareFullBtnTxt}>Share Logs with Developer</Text>
                </>
            }
          </TouchableOpacity>
        </View>

      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },

  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  statsText: {
    fontSize: FontSize.xs,
    fontFamily: "Manrope_500Medium",
    color: "#6B7280",
  },
  refreshBtn: {
    padding: 4,
  },

  // Filters
  filterRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  filterRowContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  chipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: "Manrope_700Bold",
    color: "#9CA3AF",
  },
  lvlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  lvlChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  lvlChipActive: {
    backgroundColor: "#374151",
    borderColor: "#6B7280",
  },
  lvlChipTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: "Manrope_700Bold",
    color: "#6B7280",
  },
  lvlChipTxtActive: {
    color: "#F9FAFB",
  },
  clearBtn: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  clearBtnTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: "Manrope_700Bold",
    color: "#EF4444",
  },

  // List
  listContent: {
    padding: Spacing.sm,
    gap: 2,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    gap: Spacing.sm,
  },
  emptyTxt: {
    fontSize: FontSize.md,
    fontFamily: "Manrope_800ExtraBold",
    color: "#374151",
  },
  emptySubTxt: {
    fontSize: FontSize.xs,
    fontFamily: "Manrope_500Medium",
    color: "#4B5563",
  },

  // Log entry
  entry: {
    backgroundColor: "#1F2937",
    borderRadius: Radius.button,
    padding: Spacing.sm,
    gap: 3,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
  },
  entryHighlight: {
    borderLeftColor: "#EF4444",
    backgroundColor: "#1F1515",
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  entryTime: {
    fontSize: 10,
    fontFamily: "Manrope_500Medium",
    color: "#4B5563",
    fontVariant: ["tabular-nums"],
  },
  catBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  catBadgeTxt: {
    fontSize: 9,
    fontFamily: "Manrope_800ExtraBold",
  },
  lvlBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  lvlBadgeTxt: {
    fontSize: 9,
    fontFamily: "Manrope_800ExtraBold",
  },
  entryMsg: {
    fontSize: FontSize.xs,
    fontFamily: "Manrope_500Medium",
    color: "#D1D5DB",
  },
  entryData: {
    fontSize: 10,
    fontFamily: "Manrope_500Medium",
    color: "#6B7280",
    backgroundColor: "#111827",
    borderRadius: 4,
    padding: Spacing.xs,
    marginTop: 2,
  },

  // Share header button
  shareBtn: {
    padding: 8,
  },

  // Bottom bar
  bottomBar: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  shareFullBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: Radius.button,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  shareFullBtnTxt: {
    fontSize: FontSize.sm,
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
  },
});

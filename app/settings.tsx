import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, FONTS, GRADIENTS } from "@/lib/astral-theme";

const K_SESSION = "astral_session";
const K_CHATS = "astral_chats";
const K_STATS = "astral_user_stats";
const K_PREFS = "astral_prefs";

interface UserStats {
  messageCount: number;
  imageCount: number;
  chatCount: number;
  memberSince: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [stats, setStats] = useState<UserStats>({
    messageCount: 0,
    imageCount: 0,
    chatCount: 0,
    memberSince: "—",
  });
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const sessionData = await AsyncStorage.getItem(K_SESSION);
      if (!sessionData) {
        router.replace("/signin");
        return;
      }
      const parsed = JSON.parse(sessionData);
      setSession(parsed);

      const prefsRaw = await AsyncStorage.getItem(K_PREFS);
      const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
      setVoiceEnabled(prefs.voiceEnabled !== false); // default on, matches chat screen
      setSpeechEnabled(prefs.speechEnabled || false);
      setCompactMode(prefs.compactMode || false);

      const statsRaw = await AsyncStorage.getItem(K_STATS);
      const userStats = statsRaw ? JSON.parse(statsRaw) : {};

      // Chat count is authoritative from the actual chats list, not a stale counter
      const chatsRaw = await AsyncStorage.getItem(K_CHATS);
      const chatCount = chatsRaw ? JSON.parse(chatsRaw).length : 0;

      setStats({
        messageCount: userStats.messageCount || 0,
        imageCount: userStats.imageCount || 0,
        chatCount,
        memberSince: userStats.memberSince || new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      router.replace("/signin");
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async (key: string, value: boolean) => {
    const raw = await AsyncStorage.getItem(K_PREFS);
    const prefs = raw ? JSON.parse(raw) : {};
    prefs[key] = value;
    await AsyncStorage.setItem(K_PREFS, JSON.stringify(prefs));
  };

  const handleVoiceToggle = (value: boolean) => {
    setVoiceEnabled(value);
    savePreferences("voiceEnabled", value);
  };

  const handleSpeechToggle = (value: boolean) => {
    setSpeechEnabled(value);
    savePreferences("speechEnabled", value);
  };

  const handleCompactToggle = (value: boolean) => {
    setCompactMode(value);
    savePreferences("compactMode", value);
  };

  const handleClearChats = () => {
    Alert.alert("Clear All Chats", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(K_CHATS);
          setStats((prev) => ({ ...prev, chatCount: 0 }));
          Alert.alert("Success", "All chats have been cleared.");
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(K_SESSION);
          router.replace("/signin");
        },
      },
    ]);
  };

  if (loading || !session) {
    return (
      <ScreenContainer containerClassName="bg-[#06080f]" className="items-center justify-center">
        <ActivityIndicator color={COLORS.cyan} size="large" />
      </ScreenContainer>
    );
  }

  const userInitial = (session.name || "U").charAt(0).toUpperCase();

  return (
    <ScreenContainer containerClassName="bg-[#06080f]" className="p-0">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header — mirrors .settings-header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={COLORS.textMid} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>⚙ SETTINGS</Text>
          <View style={{ width: 20 }} />
        </View>

        {/* Profile — mirrors .profile-block */}
        <View style={styles.section}>
          <SectionLabel>Profile</SectionLabel>
          <View style={styles.profileBlock}>
            <LinearGradient colors={GRADIENTS.avatar} style={styles.profileAvatar}>
              <Text style={styles.profileAvatarLetter}>{userInitial}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {session.name}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {session.email}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats — mirrors .stat-cards */}
        <View style={styles.section}>
          <SectionLabel>Your Stats</SectionLabel>
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{stats.messageCount}</Text>
              <Text style={styles.statLbl}>Messages sent</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{stats.imageCount}</Text>
              <Text style={styles.statLbl}>Images shared</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{stats.chatCount}</Text>
              <Text style={styles.statLbl}>Conversations</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { fontSize: 13 }]}>{stats.memberSince}</Text>
              <Text style={styles.statLbl}>Member since</Text>
            </View>
          </View>
        </View>

        {/* Preferences — mirrors .settings-row + .toggle-switch */}
        <View style={styles.section}>
          <SectionLabel>Preferences</SectionLabel>

          <View style={styles.settingsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Voice Responses</Text>
              <Text style={styles.rowSub}>Read AI replies aloud</Text>
            </View>
            <Switch
              value={voiceEnabled}
              onValueChange={handleVoiceToggle}
              trackColor={{ false: "rgba(255,255,255,0.08)", true: "rgba(0,234,255,0.3)" }}
              thumbColor={voiceEnabled ? COLORS.cyan : COLORS.textLo}
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Speech Input</Text>
              <Text style={styles.rowSub}>Dictate messages with mic</Text>
            </View>
            <Switch
              value={speechEnabled}
              onValueChange={handleSpeechToggle}
              trackColor={{ false: "rgba(255,255,255,0.08)", true: "rgba(0,234,255,0.3)" }}
              thumbColor={speechEnabled ? COLORS.cyan : COLORS.textLo}
            />
          </View>

          <View style={[styles.settingsRow, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Compact Bubbles</Text>
              <Text style={styles.rowSub}>Smaller message padding</Text>
            </View>
            <Switch
              value={compactMode}
              onValueChange={handleCompactToggle}
              trackColor={{ false: "rgba(255,255,255,0.08)", true: "rgba(0,234,255,0.3)" }}
              thumbColor={compactMode ? COLORS.cyan : COLORS.textLo}
            />
          </View>
        </View>

        {/* Account — mirrors .settings-btn / .settings-btn.danger */}
        <View style={[styles.section, { borderBottomWidth: 0, paddingBottom: 36 }]}>
          <SectionLabel>Account</SectionLabel>

          <TouchableOpacity onPress={handleClearChats} style={styles.settingsBtn}>
            <Feather name="trash-2" size={15} color={COLORS.textMid} />
            <Text style={styles.settingsBtnText}>Clear All Chats</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={[styles.settingsBtn, styles.settingsBtnDanger]}>
            <Feather name="log-out" size={15} color={COLORS.danger} />
            <Text style={[styles.settingsBtnText, { color: COLORS.danger }]}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 15, letterSpacing: 1.5 },

  section: { paddingHorizontal: 22, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionLabel: {
    color: COLORS.textLo,
    fontFamily: FONTS.display,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  profileBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: "rgba(0,234,255,0.04)",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.cyanMid,
  },
  profileAvatarLetter: { color: "#030810", fontFamily: FONTS.displayExtraBold, fontSize: 19 },
  profileName: { color: COLORS.textHi, fontFamily: FONTS.bodyMedium, fontSize: 14.5 },
  profileEmail: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "rgba(0,234,255,0.04)",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 14,
  },
  statVal: { color: COLORS.cyan, fontFamily: FONTS.displayExtraBold, fontSize: 22 },
  statLbl: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11.5, marginTop: 3 },

  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.md,
    marginBottom: 8,
  },
  rowLabel: { color: COLORS.textMid, fontFamily: FONTS.bodyMedium, fontSize: 13.5 },
  rowSub: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },

  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  settingsBtnDanger: { backgroundColor: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.25)" },
  settingsBtnText: { color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 13.5 },
});

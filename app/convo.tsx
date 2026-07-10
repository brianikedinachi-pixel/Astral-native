import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import ConvoOrb from "@/src/convo/ConvoOrb";
import { useConvoEngine } from "@/src/convo/useConvoEngine";
import { COLORS, FONTS, CONVO_STATE_COLORS } from "@/lib/astral-theme";

const K_SESSION = "astral_session";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ConvoScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [session, setSession] = useState<{ user_id?: string; email?: string; name?: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(K_SESSION).then((raw) => {
      if (raw) {
        try {
          setSession(JSON.parse(raw));
        } catch (e) {
          // ignore malformed session
        }
      }
    });
  }, []);

  const { state, transcriptPreview, caption, lastError, elapsedMs, muted, wordPulse, start, stop, retry, toggleMute } =
    useConvoEngine({
      session,
      // Tapping the floating bubble while backgrounded brings Astral to the
      // foreground natively, then this fires so the screen shows the same
      // "Stop the conversation?" popover a tap on the in-app orb would.
      onBubblePress: () => setConfirmOpen(true),
    });

  // Enter Convo Mode the instant this screen mounts -- the user already
  // made the intentional gesture of tapping the convo button to get here.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [fadeIn]);

  const stateColors = CONVO_STATE_COLORS[state] ?? CONVO_STATE_COLORS.listening;
  const orbSize = Math.min(width, height) * 0.5;

  const requestEnd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setConfirmOpen(true);
  };

  const confirmEnd = () => {
    setConfirmOpen(false);
    stop();
    router.back();
  };

  const handleOrbPress = () => {
    if (state === "error") {
      retry();
      return;
    }
    requestEnd();
  };

  const handleMutePress = () => {
    Haptics.selectionAsync().catch(() => {});
    toggleMute();
  };

  // What to show under the orb: the user's live partial speech while
  // listening, the AI's caption while it's replying, or nothing while idle.
  const showingUserPreview = (state === "listening" || state === "connecting") && !!transcriptPreview;
  const showingCaption = (state === "loading" || state === "speaking") && !!caption;

  return (
    <ScreenContainer containerClassName="bg-[#06080f]" edges={["top", "left", "right", "bottom"]} className="p-0">
      <LinearGradient
        colors={["#06080f", "#0a0f1c", "#06080f"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View style={[styles.container, { opacity: fadeIn }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={requestEnd} hitSlop={10}>
            <Feather name="chevron-down" size={22} color={COLORS.textMid} />
          </TouchableOpacity>
          <View style={styles.timerPill}>
            <View style={[styles.timerDot, { backgroundColor: stateColors.primary }]} />
            <Text style={styles.timerText}>{formatElapsed(elapsedMs)}</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {/* Orb + status */}
        <View style={styles.orbArea}>
          <ConvoOrb
            state={state}
            onPress={handleOrbPress}
            onMutePress={handleMutePress}
            muted={muted}
            wordPulse={wordPulse}
            size={orbSize}
          />
          <Text style={[styles.stateLabel, { color: stateColors.primary }]}>
            {state === "error" ? lastError ?? stateColors.label : stateColors.label}
          </Text>

          <View style={styles.captionBox}>
            {showingUserPreview && (
              <Text style={styles.previewText} numberOfLines={3}>
                “{transcriptPreview}”
              </Text>
            )}
            {showingCaption && (
              <Text style={styles.captionText} numberOfLines={5}>
                {caption}
              </Text>
            )}
            {state === "error" && !!lastError && (
              <TouchableOpacity onPress={retry} style={styles.retryBtn}>
                <Feather name="refresh-cw" size={14} color={COLORS.danger} />
                <Text style={styles.retryText}>Tap to try again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomArea}>
          <TouchableOpacity style={styles.endBtn} onPress={requestEnd} activeOpacity={0.85}>
            <Feather name="phone-off" size={16} color={COLORS.danger} />
            <Text style={styles.endBtnText}>End Conversation</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Leave the app — Astral keeps the conversation going in the background.</Text>
        </View>
      </Animated.View>

      {/* Confirm-stop popover, styled like a modal sheet */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmOpen(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Stop the conversation?</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.confirmCancelText}>Keep going</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmStop} onPress={confirmEnd}>
                <Text style={styles.confirmStopText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(13,20,34,0.7)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerDot: { width: 7, height: 7, borderRadius: 4 },
  timerText: { color: COLORS.textMid, fontFamily: FONTS.mono, fontSize: 13, letterSpacing: 0.5 },
  orbArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 22 },
  stateLabel: { fontFamily: FONTS.bodyMedium, fontSize: 15, letterSpacing: 0.2 },
  captionBox: { minHeight: 64, maxWidth: 340, alignItems: "center", justifyContent: "flex-start" },
  previewText: {
    color: COLORS.textMid,
    fontFamily: FONTS.body,
    fontSize: 15,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 21,
  },
  captionText: {
    color: COLORS.textHi,
    fontFamily: FONTS.body,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 23,
  },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  retryText: { color: COLORS.danger, fontFamily: FONTS.bodyMedium, fontSize: 13 },
  bottomArea: { alignItems: "center", gap: 12, paddingBottom: 28, paddingHorizontal: 24 },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    backgroundColor: COLORS.dangerDim,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 28,
  },
  endBtnText: { color: COLORS.danger, fontFamily: FONTS.bodyMedium, fontSize: 14 },
  hint: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 12, textAlign: "center", maxWidth: 280 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(3,5,10,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 16,
  },
  confirmTitle: { color: COLORS.textHi, fontFamily: FONTS.displaySemiBold, fontSize: 16, textAlign: "center" },
  confirmRow: { flexDirection: "row", gap: 10 },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: COLORS.cyanFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCancelText: { color: COLORS.textMid, fontFamily: FONTS.bodyMedium, fontSize: 14 },
  confirmStop: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: COLORS.dangerDim,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
  },
  confirmStopText: { color: COLORS.danger, fontFamily: FONTS.bodyMedium, fontSize: 14 },
});

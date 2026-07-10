import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { CONVO_STATE_COLORS } from "@/lib/astral-theme";
import type { ConvoState } from "./useConvoEngine";

const BREATHE_MS: Partial<Record<ConvoState, number>> = {
  connecting: 1600,
  listening: 1900,
  thinking: 950,
  analyzing: 2400,
  loading: 1100,
  speaking: 1300,
  muted: 2400,
  error: 1700,
};

const FADE_MS = 420;

interface ConvoOrbProps {
  state: ConvoState;
  onPress?: () => void;
  onMutePress?: () => void;
  muted?: boolean;
  /** Bumped every time a new word is revealed while speaking -- drives a
   * quick pulse so the orb feels like it's actually "talking". */
  wordPulse?: number;
  size?: number;
}

export default function ConvoOrb({
  state,
  onPress,
  onMutePress,
  muted = false,
  wordPulse = 0,
  size = 210,
}: ConvoOrbProps) {
  const colors = CONVO_STATE_COLORS[state] ?? CONVO_STATE_COLORS.listening;

  const breathe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Two-layer colour cross-fade (plain, static colour arrays + animated
  // opacity) -- the CSS `transition: fill 0.5s` equivalent, done with a
  // technique that's safe under both the JS and native Animated drivers.
  const layerAOpacity = useRef(new Animated.Value(1)).current;
  const layerBOpacity = useRef(new Animated.Value(0)).current;
  const [layerAColors, setLayerAColors] = useState<[string, string]>([colors.primary, colors.secondary]);
  const [layerBColors, setLayerBColors] = useState<[string, string]>([colors.primary, colors.secondary]);
  const [glowColor, setGlowColor] = useState(colors.glow);
  const topIsA = useRef(true);

  useEffect(() => {
    const showA = !topIsA.current;
    if (showA) {
      setLayerAColors([colors.primary, colors.secondary]);
      layerAOpacity.setValue(0);
      Animated.timing(layerAOpacity, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.timing(layerBOpacity, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      setLayerBColors([colors.primary, colors.secondary]);
      layerBOpacity.setValue(0);
      Animated.timing(layerBOpacity, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.timing(layerAOpacity, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    topIsA.current = showA;
    setGlowColor(colors.glow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const duration = BREATHE_MS[state] ?? 1800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, state]);

  // Quick pulse bump triggered any time a new word lands during speech.
  useEffect(() => {
    if (!wordPulse) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [pulse, wordPulse]);

  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.18] });
  const coreBreatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size * 1.7,
            height: size * 1.7,
            borderRadius: size * 0.85,
            backgroundColor: glowColor,
            transform: [{ scale: haloScale }],
            opacity: haloOpacity,
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.haloInner,
          {
            width: size * 1.32,
            height: size * 1.32,
            borderRadius: size * 0.66,
            backgroundColor: glowColor,
            transform: [{ scale: haloScale }],
          },
        ]}
      />

      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onPress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Conversation active — tap for options"
      >
        <Animated.View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: Animated.multiply(coreBreatheScale, pulseScale) }],
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
          }}
        >
          {/* Base layer -- always visible underneath the cross-fading layer above it */}
          <LinearGradient
            colors={layerAColors}
            start={{ x: 0.25, y: 0.15 }}
            end={{ x: 0.85, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.core, { borderRadius: size / 2, opacity: 1 }]}
          />
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: layerBOpacity }]}>
            <LinearGradient
              colors={layerBColors}
              start={{ x: 0.25, y: 0.15 }}
              end={{ x: 0.85, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.core, { borderRadius: size / 2 }]}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: layerAOpacity }]}>
            <LinearGradient
              colors={layerAColors}
              start={{ x: 0.25, y: 0.15 }}
              end={{ x: 0.85, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.core, { borderRadius: size / 2 }]}
            />
          </Animated.View>

          {/* Faux glass sheen, upper-left highlight like the web orb's radial gradient */}
          <View
            pointerEvents="none"
            style={[
              styles.sheen,
              { width: size * 0.62, height: size * 0.62, borderRadius: size * 0.31, top: size * 0.08, left: size * 0.1 },
            ]}
          />
          <View pointerEvents="none" style={[styles.rim, { width: size, height: size, borderRadius: size / 2 }]} />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.muteBtn, muted && styles.muteBtnActive]}
        onPress={onMutePress}
        hitSlop={10}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={muted ? "Unmute microphone" : "Mute microphone"}
      >
        <Feather name={muted ? "mic-off" : "mic"} size={16} color={muted ? "#5b6b7a" : "#e8f4ff"} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute" },
  haloInner: { position: "absolute", opacity: 0.3 },
  core: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  rim: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  muteBtn: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(9,13,24,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteBtnActive: {
    borderColor: "rgba(91,107,122,0.4)",
    backgroundColor: "rgba(9,13,24,0.6)",
  },
});

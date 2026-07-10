/**
 * Astral design tokens — ported 1:1 from the web frontend's
 * `styles/index.css` :root custom properties, so the native app and the
 * PWA share exactly the same palette, radii, and type scale.
 *
 * Source of truth: Astral-static-main/styles/index.css
 */
import { Platform } from "react-native";

export const COLORS = {
  cyan: "#00eaff",
  cyanDim: "rgba(0,234,255,0.18)",
  cyanFaint: "rgba(0,234,255,0.07)",
  cyanFaint2: "rgba(0,234,255,0.04)",
  cyanMid: "rgba(0,234,255,0.45)",
  cyanBorder: "rgba(0,234,255,0.28)",
  violet: "#a855f7",
  violetDim: "rgba(168,85,247,0.15)",
  bgDeep: "#06080f",
  bgPanel: "#090d18",
  bgCard: "#0d1422",
  bgHuman: "#101c2c",
  border: "rgba(0,234,255,0.18)",
  textHi: "#e8f4ff",
  textLo: "#4a6a88",
  textMid: "#8bb0cc",
  placeholder: "rgba(130,170,200,0.38)",
  danger: "#f87171",
  dangerDim: "rgba(248,113,113,0.1)",
  success: "#34d399",
  gold: "#fbbf24",
  code: "#7df9ff",
} as const;

export const RADIUS = {
  pill: 28,
  card: 16,
  lg: 20,
  md: 14,
  sm: 10,
} as const;

export const LAYOUT = {
  headerH: 62,
  sidebarW: 260,
  /** Breakpoint above which the sidebar docks permanently, mirroring the
   * web frontend's `@media (min-width: 769px)` desktop rules. */
  desktopBreakpoint: 769,
} as const;

/**
 * Font families. Real Syne / DM Sans weights are loaded via
 * @expo-google-fonts in app/_layout.tsx — these keys match the family
 * names registered there. Until fonts finish loading, RN silently falls
 * back to the system font, so it's always safe to reference these.
 */
export const FONTS = {
  display: "Syne_700Bold",
  displayExtraBold: "Syne_800ExtraBold",
  displaySemiBold: "Syne_600SemiBold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyItalic: "DMSans_400Regular_Italic",
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
} as const;

/**
 * Convo Mode orb state palette — mirrors the web frontend's
 * `#convo-orb-wrap.state-*` colours 1:1 (see styles/index.css) so voice
 * mode feels identical between the PWA and the native app.
 */
export const CONVO_STATE_COLORS: Record<
  string,
  { primary: string; secondary: string; glow: string; label: string }
> = {
  connecting: { primary: "#d7e2ee", secondary: "#93a6ba", glow: "rgba(255,255,255,0.22)", label: "Connecting…" },
  listening: { primary: "#00eaff", secondary: "#0aa0d2", glow: "rgba(0,234,255,0.42)", label: "Listening…" },
  thinking: { primary: "#a855f7", secondary: "#6d28d9", glow: "rgba(124,58,237,0.42)", label: "Thinking…" },
  analyzing: { primary: "#2dd4bf", secondary: "#14b8a6", glow: "rgba(45,212,191,0.42)", label: "Reading your mood…" },
  loading: { primary: "#818cf8", secondary: "#4f46e5", glow: "rgba(129,140,248,0.42)", label: "Getting ready…" },
  speaking: { primary: "#e879f9", secondary: "#a21caf", glow: "rgba(192,38,211,0.45)", label: "Speaking…" },
  muted: { primary: "#5b6b7a", secondary: "#37424c", glow: "rgba(91,107,122,0.28)", label: "Muted — tap mic to resume" },
  error: { primary: "#ff8095", secondary: "#e0435a", glow: "rgba(255,77,109,0.4)", label: "Something went wrong" },
} as const;

export const GRADIENTS = {
  /** .es-title — cyan -> violet -> coral */
  title: ["#00eaff", "#a855f7", "#ff6b6b"] as const,
  /** .avatar-btn / .profile-avatar */
  avatar: ["#00eaff", "#7c3aed"] as const,
  /** .new-chat-btn */
  newChat: ["rgba(0,234,255,0.15)", "rgba(168,85,247,0.1)"] as const,
  /** .gap-btn */
  install: ["#00eaff", "#a855f7"] as const,
  /** .human-response */
  humanBubble: ["rgba(29,39,68,0.9)", "rgba(16,22,44,0.95)"] as const,
};

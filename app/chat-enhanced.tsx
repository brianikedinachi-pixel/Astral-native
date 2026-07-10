import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Image,
  Animated,
  StyleSheet,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "@/components/screen-container";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Markdown from "react-native-markdown-display";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { speak, stopSpeaking } from "@/src/convo/tts";
import { startListening, stopListening, requestMicPermission } from "@/src/convo/speech";
import { COLORS, RADIUS, LAYOUT, FONTS, GRADIENTS } from "@/lib/astral-theme";

const BACKEND_URL = "https://astral-1-sb1i.onrender.com";

/* ── Storage keys (kept in sync with settings.tsx) ───────────────────── */
const K_SESSION = "astral_session";
const K_CHATS = "astral_chats";
const K_USER_ID = "astral_user_id";
const K_STATS = "astral_user_stats";
const K_PREFS = "astral_prefs";

/* ── Data model mirrors the backend's message-log shape 1:1 so reactions
   and comments (which are keyed by index) line up with the server ──── */
interface Comment {
  id: string;
  ts: string;
  user_email: string;
  user_name: string;
  text: string;
}

interface FileCard {
  fileId: string;
  filename: string;
  fmt: string;
  textContent?: string | null;
  dataUri?: string; // base64 data URI, kept so the card survives app reloads
}

interface ChatLog {
  humanText: string;
  humanImage?: string | null; // data URI, for local display only
  aiText: string;
  thinking?: boolean;
  likes?: number;
  dislikes?: number;
  reaction?: "like" | "dislike" | null;
  comments?: Comment[];
  fileCard?: FileCard | null;
}

/* ── File type → icon + "open straight away" set, mirrors web's _fileIcon /
   DIRECT_DOWNLOAD_FMTS so a docx/zip goes straight to Share while txt/md/js/
   json/html/css/py open in the in-app preview modal first ─────────────── */
const FILE_ICONS: Record<string, string> = {
  docx: "📝",
  txt: "📄",
  html: "🌐",
  md: "📋",
  js: "📜",
  py: "🐍",
  json: "📦",
  css: "🎨",
  zip: "🗜️",
};
const DIRECT_DOWNLOAD_FMTS = new Set(["docx", "zip"]);

const ACTIVITY_STAGE_LABELS: Record<string, string> = {
  web: "🌐 Searching the web for",
  filegen: "📄 Creating your file",
  gemini: "",
  mem: "",
};

interface Chat {
  id: string;
  title: string;
  messages: ChatLog[];
  created_at: number;
  updated_at: number;
}

const CHIPS = [
  "💙 I'm struggling today",
  "🔥 Day 1 of my recovery",
  "🧠 Help me think through something",
  "📚 Explain something to me",
];

async function getUserId(): Promise<string> {
  let uid = await AsyncStorage.getItem(K_USER_ID);
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
    await AsyncStorage.setItem(K_USER_ID, uid);
  }
  return uid;
}

async function bumpStats(patch: { messageCount?: number; imageCount?: number; chatCount?: number }) {
  try {
    const raw = await AsyncStorage.getItem(K_STATS);
    const stats = raw
      ? JSON.parse(raw)
      : { messageCount: 0, imageCount: 0, chatCount: 0, memberSince: new Date().toISOString().slice(0, 10) };
    if (patch.messageCount) stats.messageCount = (stats.messageCount || 0) + patch.messageCount;
    if (patch.imageCount) stats.imageCount = (stats.imageCount || 0) + patch.imageCount;
    if (patch.chatCount !== undefined) stats.chatCount = patch.chatCount;
    if (!stats.memberSince) stats.memberSince = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(K_STATS, JSON.stringify(stats));
  } catch {}
}

/* ── Small building blocks (mirror .es-title, .tl-arc, etc.) ─────────── */

/** Gradient "ASTRAL" wordmark — mirrors .es-title's cyan→violet→coral text-fill */
function GradientTitle({ text, size = 34 }: { text: string; size?: number }) {
  const width = text.length * size * 0.78;
  return (
    <Svg width={width} height={size * 1.3}>
      <Defs>
        <SvgLinearGradient id="astralTitleGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GRADIENTS.title[0]} />
          <Stop offset="0.5" stopColor={GRADIENTS.title[1]} />
          <Stop offset="1" stopColor={GRADIENTS.title[2]} />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        fill="url(#astralTitleGrad)"
        fontSize={size}
        fontWeight="900"
        x="0"
        y={size * 0.95}
        letterSpacing={size * 0.05}
        fontFamily={FONTS.displayExtraBold}
      >
        {text}
      </SvgText>
    </Svg>
  );
}

/** Three-dot orbital pulse — mirrors .tl-arc's cyan/violet dotPulse loader.
   `stageText`, when set, replaces "Astral is thinking…" with a live status
   line (e.g. "🌐 Searching the web for (your query)") — mirrors web's
   .tl-text element driven by the /stream-log SSE. */
function ThinkingDots({ stageText }: { stageText?: string }) {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 220),
          Animated.timing(a, { toValue: 1, duration: 480, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 480, useNativeDriver: true }),
          Animated.delay((2 - i) * 220),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const dotColors = [COLORS.cyan, COLORS.violet, COLORS.violet];

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlArc}>
        {anims.map((a, i) => (
          <Animated.View
            key={i}
            style={[
              styles.tlDot,
              i === 1 && { width: 7, height: 7 },
              {
                backgroundColor: dotColors[i],
                shadowColor: dotColors[i],
                opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [
                  { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
                  { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.1] }) },
                ],
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.tlText}>{stageText || "Astral is thinking…"}</Text>
    </View>
  );
}

/** Soft fade + rise-in for newly appended bubbles — small enough to feel
   native rather than flashy, and skipped entirely when a whole chat is
   loaded at once (see `animate` prop) so switching chats stays instant. */
function FadeInMessage({ children, animate }: { children: React.ReactNode; animate: boolean }) {
  const anim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [animate, anim]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const MARKDOWN_STYLE = {
  body: { color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 14.5, lineHeight: 22 },
  heading1: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 20, marginTop: 12, marginBottom: 6 },
  heading2: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 17.5, marginTop: 10, marginBottom: 5 },
  heading3: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 15.5, marginTop: 8, marginBottom: 4 },
  strong: { color: COLORS.textHi, fontFamily: FONTS.bodyMedium },
  em: { color: "#a8d8ff", fontFamily: FONTS.bodyItalic },
  link: { color: COLORS.cyan },
  blockquote: {
    borderLeftColor: COLORS.cyan,
    borderLeftWidth: 3,
    paddingLeft: 14,
    backgroundColor: "transparent",
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: COLORS.cyanFaint,
    color: COLORS.code,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    fontFamily: FONTS.mono,
  },
  code_block: {
    backgroundColor: "rgba(0,5,15,0.75)",
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  fence: {
    backgroundColor: "rgba(0,5,15,0.75)",
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  bullet_list_icon: { color: COLORS.cyan },
  ordered_list_icon: { color: COLORS.cyan },
  table: { borderColor: "rgba(0,234,255,0.25)", borderWidth: 1, borderRadius: 8 },
  th: { backgroundColor: COLORS.cyanFaint, color: COLORS.cyan, padding: 6 },
  td: { borderColor: "rgba(0,234,255,0.1)", padding: 6 },
} as const;

export default function ChatEnhancedScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= LAYOUT.desktopBreakpoint;

  const [session, setSession] = useState<any>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatLog[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string; mime: string } | null>(null);
  const [cameraChoiceOpen, setCameraChoiceOpen] = useState(false);

  const [micActive, setMicActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "online" | "offline" | "" } | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const sidebarAnim = useRef(new Animated.Value(0)).current;

  const [commentModal, setCommentModal] = useState<{ idx: number } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentStatus, setCommentStatus] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [existingComments, setExistingComments] = useState<Comment[]>([]);

  const [greetingText, setGreetingText] = useState("Hey there 👋");
  const [typedSub, setTypedSub] = useState("");

  // Live "what Astral is doing" status while a reply is in flight — mirrors
  // web's /stream-log SSE (web search / file generation stages).
  const [activityStage, setActivityStage] = useState("");
  const activitySSERef = useRef<any>(null);

  // Full-screen preview for generated/converted files (docx/txt/md/etc.)
  const [fileModal, setFileModal] = useState<FileCard | null>(null);
  const filesRef = useRef<Record<string, FileCard>>({});

  // Gold "you're Astral's #1 user" / demotion toast — separate from the
  // online/offline toast since it has its own look + longer lifetime.
  const [topToast, setTopToast] = useState<{ msg: string; demoted: boolean } | null>(null);
  const topToastAnim = useRef(new Animated.Value(0)).current;

  const scrollViewRef = useRef<ScrollView>(null);
  const stopListenRef = useRef<null | (() => void)>(null);

  /* ── Boot ────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadSession();
    loadPrefs();
    setGreetingText(timeGreeting());
    return () => {
      stopListenRef.current?.();
      if (activitySSERef.current) {
        try {
          activitySSERef.current.close();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: sidebarOpen ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [sidebarOpen]);

  // Settings lives on its own route, so this screen stays mounted the whole
  // time the user is there — re-read prefs on refocus so toggles like
  // "Compact Bubbles" or "Voice Responses" take effect the moment you come back.
  useFocusEffect(
    useCallback(() => {
      loadPrefs();
    }, [])
  );

  useEffect(() => {
    if (messages.length > 0) return;
    const phrases = ["always here", "never judging", "what's on your mind?"];
    let pi = 0,
      ci = 0,
      deleting = false,
      timer: any;
    const tick = () => {
      const phrase = phrases[pi];
      if (!deleting) {
        ci++;
        setTypedSub(phrase.slice(0, ci));
        if (ci < phrase.length) timer = setTimeout(tick, 55);
        else
          timer = setTimeout(() => {
            deleting = true;
            tick();
          }, 1800);
      } else {
        ci--;
        setTypedSub(phrase.slice(0, ci));
        if (ci > 0) timer = setTimeout(tick, 32);
        else {
          deleting = false;
          pi = (pi + 1) % phrases.length;
          timer = setTimeout(tick, 420);
        }
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [messages.length]);

  /* ── Online/offline (web only — RN has no built-in equivalent without
     @react-native-community/netinfo, which isn't installed) ─────────── */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const goOnline = () => {
      setIsOnline(true);
      showToast("✅ Back online — you can send messages again", "online");
    };
    const goOffline = () => {
      setIsOnline(false);
      showToast("📡 You're offline — chats are still viewable", "offline");
    };
    // @ts-ignore - window exists on web
    window.addEventListener("online", goOnline);
    // @ts-ignore
    window.addEventListener("offline", goOffline);
    return () => {
      // @ts-ignore
      window.removeEventListener("online", goOnline);
      // @ts-ignore
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 5) return "Still up? 🌙";
    if (h < 12) return "Good morning ☀️";
    if (h < 18) return "Good afternoon 👋";
    return "Good evening 🌆";
  }

  function timeGreetingColor() {
    const h = new Date().getHours();
    if (h < 5) return "#a78bfa"; // .time-night
    if (h < 12) return "#fbbf24"; // .time-morning
    if (h < 18) return "#5fb8d4"; // .time-afternoon
    return "#5fb8d4";
  }

  function showToast(msg: string, type: "online" | "offline" | "") {
    setToast({ msg, type });
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 3200);
  }

  function showTopToast(msg: string, demoted: boolean) {
    setTopToast({ msg, demoted });
    Animated.timing(topToastAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(topToastAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start(() =>
        setTopToast(null)
      );
    }, demoted ? 8000 : 6000);
  }

  /* ── "You're Astral's #1 user" gamification toast — mirrors web's
     checkTopUserStatus(). Web defines this but never calls it; we wire it up
     for real here since it's a genuine, finished feature worth surfacing. */
  const checkTopUserStatus = async (allChats: Chat[]) => {
    // Read session from storage directly (not the `session` state closure)
    // so this works right after sign-in, before the state update has flushed.
    let activeSession = session;
    if (!activeSession?.email) {
      try {
        const raw = await AsyncStorage.getItem(K_SESSION);
        activeSession = raw ? JSON.parse(raw) : null;
      } catch {}
    }
    if (!activeSession?.email) return;
    let totalMsgs = 0;
    for (const c of allChats) {
      for (const m of c.messages || []) {
        if (m.humanText || m.humanImage) totalMsgs++;
      }
    }
    let profileCount = 0;
    try {
      const raw = await AsyncStorage.getItem(K_STATS);
      profileCount = raw ? JSON.parse(raw).messageCount || 0 : 0;
    } catch {}
    const localCount = Math.max(totalMsgs, profileCount);

    const flagKey = `astral_was_top_${activeSession.email}`;
    const wasTop = (await AsyncStorage.getItem(flagKey)) === "true";
    if (localCount < 3) {
      if (wasTop) await AsyncStorage.setItem(flagKey, "false");
      return;
    }
    try {
      const r = await fetch(
        `${BACKEND_URL}/admin-stats?admin_email=check_top&user_email=${encodeURIComponent(activeSession.email)}`
      );
      if (!r.ok) throw new Error("stats unavailable");
      const d = await r.json();
      if (d.is_top_user) {
        if (!wasTop) {
          showTopToast(`You're Astral's #1 user — ${d.top_message_count || localCount} messages! Thank you, we're grateful you're here 💙`, false);
          await AsyncStorage.setItem(flagKey, "true");
        }
      } else if (wasTop) {
        showTopToast("You're no longer Astral's #1 user — keep chatting to reclaim the top spot! 💪", true);
        await AsyncStorage.setItem(flagKey, "false");
      }
    } catch {
      if (!wasTop) {
        showTopToast(`You're Astral's #1 user — ${localCount} messages! Thank you, we're grateful you're here 💙`, false);
        await AsyncStorage.setItem(flagKey, "true");
      }
    }
  };

  /* ── Live activity status (web search / file generation) while a reply is
     in flight. Only wired on web (RN has no built-in EventSource); native
     falls back gracefully to the plain "Astral is thinking…" dots. */
  const startActivity = () => {
    setActivityStage("");
    if (Platform.OS !== "web" || typeof (globalThis as any).EventSource === "undefined") return;
    try {
      const es = new (globalThis as any).EventSource(`${BACKEND_URL}/stream-log`);
      activitySSERef.current = es;
      es.onmessage = (e: any) => {
        try {
          const data = JSON.parse(e.data);
          const label = ACTIVITY_STAGE_LABELS[data.stage];
          if (!label) return;
          let snippet = "";
          if (data.stage === "web" && data.msg) {
            let q = String(data.msg).trim();
            if (q.length > 32) q = q.slice(0, 32) + "…";
            snippet = ` (${q})`;
          }
          setActivityStage(label + snippet);
        } catch {}
      };
      es.onerror = () => {
        try {
          es.close();
        } catch {}
        activitySSERef.current = null;
      };
    } catch {}
  };

  const stopActivity = () => {
    if (activitySSERef.current) {
      try {
        activitySSERef.current.close();
      } catch {}
      activitySSERef.current = null;
    }
    setActivityStage("");
  };

  /* ── Generated-file cards (docx/txt/md/etc. the AI returns) ─────────── */
  const openFileCard = async (card: FileCard) => {
    if (DIRECT_DOWNLOAD_FMTS.has(card.fmt)) {
      await saveOrShareFile(card);
      return;
    }
    setFileModal(card);
  };

  const saveOrShareFile = async (card: FileCard) => {
    if (!card.dataUri) return;
    if (Platform.OS === "web") {
      try {
        const a = document.createElement("a");
        a.href = card.dataUri;
        a.download = card.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        showToast("Couldn't download that file", "offline");
      }
      return;
    }
    try {
      // SDK 54 made the new object-oriented API the default export of
      // "expo-file-system" — this code uses the old cacheDirectory/
      // writeAsStringAsync-style API, which now lives at the /legacy subpath.
      const FileSystem = require("expo-file-system/legacy");
      const Sharing = require("expo-sharing");
      const base64 = card.dataUri.split(",")[1] || "";
      const dest = `${FileSystem.cacheDirectory}${card.filename}`;
      await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest);
      }
    } catch {
      showToast("Install expo-file-system + expo-sharing to save files on device", "offline");
    }
  };

  const setVoicePref = async (value: boolean) => {
    setVoiceEnabled(value);
    try {
      const raw = await AsyncStorage.getItem(K_PREFS);
      const prefs = raw ? JSON.parse(raw) : {};
      prefs.voiceEnabled = value;
      await AsyncStorage.setItem(K_PREFS, JSON.stringify(prefs));
    } catch {}
  };

  async function loadPrefs() {
    try {
      const raw = await AsyncStorage.getItem(K_PREFS);
      const prefs = raw ? JSON.parse(raw) : {};
      setVoiceEnabled(prefs.voiceEnabled !== false);
      setCompactMode(!!prefs.compactMode);
    } catch {}
  }

  const loadSession = async () => {
    try {
      const sessionData = await AsyncStorage.getItem(K_SESSION);
      if (!sessionData) {
        router.replace("/signin");
        return;
      }
      const parsed = JSON.parse(sessionData);
      setSession(parsed);
      loadChats();
    } catch (err) {
      router.replace("/signin");
    }
  };

  const loadChats = async () => {
    try {
      const chatsData = await AsyncStorage.getItem(K_CHATS);
      const parsedChats: Chat[] = chatsData ? JSON.parse(chatsData) : [];
      setChats(parsedChats);
      bumpStats({ chatCount: parsedChats.length });

      if (parsedChats.length > 0) {
        setCurrentChatId(parsedChats[0].id);
        setMessages(parsedChats[0].messages);
      } else {
        createNewChat(parsedChats);
      }
      checkTopUserStatus(parsedChats);
    } catch (err) {
      console.error("Error loading chats:", err);
    }
  };

  const createNewChat = (base?: Chat[]) => {
    const newChat: Chat = {
      id: `chat_${Date.now()}`,
      title: "New Conversation",
      messages: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const nextChats = [newChat, ...(base ?? chats)];
    setChats(nextChats);
    setCurrentChatId(newChat.id);
    setMessages([]);
    setSidebarOpen(false);
    AsyncStorage.setItem(K_CHATS, JSON.stringify(nextChats));
    bumpStats({ chatCount: nextChats.length });
  };

  const loadChat = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setCurrentChatId(chatId);
      setMessages(chat.messages);
      setSidebarOpen(false);
    }
  };

  const persistMessages = async (chatId: string, updatedMessages: ChatLog[], title?: string) => {
    setChats((prev) => {
      const updated = prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: updatedMessages,
              updated_at: Date.now(),
              title: title ?? chat.title,
            }
          : chat
      );
      AsyncStorage.setItem(K_CHATS, JSON.stringify(updated));
      return updated;
    });
  };

  const syncToBackend = async (chatMessages: ChatLog[], chatId: string) => {
    if (!session) return;
    try {
      await fetch(`${BACKEND_URL}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: await getUserId(),
          email: session.email,
          chat_id: chatId,
          messages: chatMessages,
        }),
      });
    } catch (err) {
      // Best-effort only — local storage already has the source of truth.
    }
  };

  /* ── Image attach ───────────────────────────────────────────────── */
  const pickImage = async (fromCamera: boolean) => {
    setCameraChoiceOpen(false);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Astral needs access to continue.");
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ["images"] });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      setAttachedImage({ uri: asset.uri, base64: asset.base64!, mime });
    } catch (err) {
      Alert.alert("Error", "Couldn't attach that image.");
    }
  };

  const removeImage = () => setAttachedImage(null);

  /* ── Mic input ──────────────────────────────────────────────────── */
  const toggleMic = async () => {
    if (micActive) {
      stopListening();
      stopListenRef.current?.();
      stopListenRef.current = null;
      setMicActive(false);
      return;
    }
    const granted = await requestMicPermission();
    if (!granted) {
      Alert.alert("Permission needed", "Astral needs microphone access to listen.");
      return;
    }
    setMicActive(true);
    stopListenRef.current = startListening({
      onPartial: (text) => setInput(text),
      onFinal: (text) => {
        setInput(text);
        setMicActive(false);
        stopListenRef.current?.();
        stopListenRef.current = null;
      },
      onError: () => {
        setMicActive(false);
        stopListenRef.current?.();
        stopListenRef.current = null;
      },
    });
  };

  /* ── Speak a single reply aloud ─────────────────────────────────── */
  const toggleSpeak = (idx: number, text: string) => {
    if (speakingIdx === idx) {
      stopSpeaking();
      setSpeakingIdx(null);
      return;
    }
    stopSpeaking();
    setSpeakingIdx(idx);
    speak(text, () => setSpeakingIdx((cur) => (cur === idx ? null : cur)));
  };

  /* ── Send ───────────────────────────────────────────────────────── */
  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || !session || !currentChatId) return;
    if (Platform.OS === "web" && !isOnline) {
      showToast("📡 No internet — can't send messages offline", "offline");
      return;
    }

    const hasImage = !!attachedImage;
    const humanImage = hasImage ? `data:${attachedImage!.mime};base64,${attachedImage!.base64}` : null;

    const newLog: ChatLog = {
      humanText: text,
      humanImage,
      aiText: "",
      thinking: true,
      likes: 0,
      dislikes: 0,
      reaction: null,
      comments: [],
    };
    const updated = [...messages, newLog];
    setMessages(updated);
    setInput("");
    removeImage();
    setLoading(true);

    const title =
      updated.length === 1 ? (text.slice(0, 42) || "Image message") + (text.length > 42 ? "..." : "") : undefined;
    await persistMessages(currentChatId, updated, title);
    bumpStats({ messageCount: 1, imageCount: hasImage ? 1 : 0 });

    const targetChatId = currentChatId;
    const targetIdx = updated.length - 1;
    startActivity();

    try {
      const convHistory: { role: "user" | "model"; text: string }[] = [];
      for (const entry of messages.slice(-20)) {
        if (entry.humanText) convHistory.push({ role: "user", text: entry.humanText });
        if (entry.aiText) convHistory.push({ role: "model", text: entry.aiText });
      }

      const body: any = {
        text,
        user_id: await getUserId(),
        user_email: session.email,
        user_name: session.name || "",
        conversation_history: convHistory,
      };
      if (hasImage) {
        body.image_base64 = attachedImage!.base64;
        body.image_mime = attachedImage!.mime;
      }

      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      const reply = data.reply || "[No response]";

      // Auto file card from AI (generated docx/txt/md/etc.) — mirrors web's
      // handleSend file_card handling.
      let fileCard: FileCard | null = null;
      if (data.file_card) {
        const fc = data.file_card;
        const fileId = "f_" + Date.now();
        const fname =
          (fc.filename && fc.filename.trim()) ||
          `${text.trim().replace(/[^\w\s]/g, "").split(/\s+/).slice(0, 5).join("_").toLowerCase() || "document"}.${fc.ext}`;
        fileCard = {
          fileId,
          filename: fname,
          fmt: fc.ext,
          textContent: fc.text_preview || null,
          dataUri: `data:${fc.mime || "application/octet-stream"};base64,${fc.data_b64}`,
        };
        filesRef.current[fileId] = fileCard;
      }

      setMessages((cur) => {
        const next = [...cur];
        if (next[targetIdx]) next[targetIdx] = { ...next[targetIdx], thinking: false, aiText: reply, fileCard };
        persistMessages(targetChatId, next, title);
        return next;
      });

      if (voiceEnabled) {
        setSpeakingIdx(targetIdx);
        speak(reply, () => setSpeakingIdx((cur) => (cur === targetIdx ? null : cur)));
      }

      // Auto-open the preview for text-based formats, same as web
      if (fileCard && !DIRECT_DOWNLOAD_FMTS.has(fileCard.fmt)) {
        setTimeout(() => setFileModal(fileCard), 150);
      }

      checkTopUserStatus(chats.map((c) => (c.id === targetChatId ? { ...c, messages: updated } : c)));
    } catch (err) {
      const fallback =
        text.length < 6 ? "Tell me a bit more so I can help." : "I hear you. Would you like advice or just to talk more?";
      setMessages((cur) => {
        const next = [...cur];
        if (next[targetIdx]) next[targetIdx] = { ...next[targetIdx], thinking: false, aiText: fallback };
        persistMessages(targetChatId, next, title);
        return next;
      });
      showToast("📡 Couldn't reach Astral — saved locally", "offline");
    } finally {
      setLoading(false);
      stopActivity();
      setMessages((cur) => {
        syncToBackend(cur, targetChatId);
        return cur;
      });
    }
  };

  const useChip = (text: string) => setInput(text);

  /* ── Reactions ──────────────────────────────────────────────────── */
  const addReaction = async (idx: number, type: "like" | "dislike") => {
    if (!currentChatId) return;
    const updated = messages.map((log, i) => {
      if (i !== idx) return log;
      const prev = log.reaction;
      let likes = log.likes || 0,
        dislikes = log.dislikes || 0,
        reaction: "like" | "dislike" | null = type;
      if (prev === type) {
        reaction = null;
        if (type === "like") likes = Math.max(0, likes - 1);
        else dislikes = Math.max(0, dislikes - 1);
      } else {
        if (prev === "like") likes = Math.max(0, likes - 1);
        if (prev === "dislike") dislikes = Math.max(0, dislikes - 1);
        if (type === "like") likes += 1;
        else dislikes += 1;
      }
      return { ...log, likes, dislikes, reaction };
    });
    setMessages(updated);
    await persistMessages(currentChatId, updated);

    const log = updated[idx];
    try {
      await fetch(`${BACKEND_URL}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: await getUserId(),
          user_email: session?.email || "",
          user_name: session?.name || "",
          msg_idx: idx,
          reaction: log.reaction,
          likes: log.likes || 0,
          dislikes: log.dislikes || 0,
          chat_id: currentChatId,
          ai_text_preview: (log.aiText || "").slice(0, 100),
        }),
      });
    } catch {}
  };

  /* ── Comments ───────────────────────────────────────────────────── */
  const openComments = async (idx: number) => {
    setCommentModal({ idx });
    setCommentText("");
    setCommentStatus("");
    setExistingComments(messages[idx]?.comments || []);
    try {
      const key = `${currentChatId || "default"}_${idx}`;
      const r = await fetch(`${BACKEND_URL}/comments?comment_key=${encodeURIComponent(key)}`);
      if (r.ok) {
        const d = await r.json();
        if (d.comments?.length) setExistingComments(d.comments);
      }
    } catch {}
  };

  const submitComment = async () => {
    if (!commentModal || !currentChatId) return;
    const text = commentText.trim();
    if (!text) {
      setCommentStatus("Please write something first.");
      return;
    }
    const idx = commentModal.idx;
    setPostingComment(true);
    const newComment: Comment = {
      id: Date.now().toString(),
      ts: new Date().toISOString(),
      user_email: session?.email || "",
      user_name: session?.name || "",
      text,
    };
    try {
      const key = `${currentChatId}_${idx}`;
      const resp = await fetch(`${BACKEND_URL}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment_key: key,
          user_email: newComment.user_email,
          user_name: newComment.user_name,
          text,
          chat_id: currentChatId,
          msg_idx: idx,
          ai_text_preview: (messages[idx]?.aiText || "").slice(0, 100),
        }),
      });
      const data = resp.ok ? await resp.json() : null;
      const saved: Comment = data?.ok && data.comment ? data.comment : newComment;
      const updated = messages.map((log, i) => (i === idx ? { ...log, comments: [...(log.comments || []), saved] } : log));
      setMessages(updated);
      await persistMessages(currentChatId, updated);
      setCommentStatus("✅ Comment posted!");
      setCommentText("");
      setTimeout(() => setCommentModal(null), 1000);
    } catch {
      const updated = messages.map((log, i) =>
        i === idx ? { ...log, comments: [...(log.comments || []), newComment] } : log
      );
      setMessages(updated);
      await persistMessages(currentChatId, updated);
      setCommentStatus("💾 Saved locally (no connection).");
      setCommentText("");
      setTimeout(() => setCommentModal(null), 1200);
    } finally {
      setPostingComment(false);
    }
  };

  const deleteChat = (chatId: string) => {
    Alert.alert("Delete Chat", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updated = chats.filter((c) => c.id !== chatId);
          setChats(updated);
          await AsyncStorage.setItem(K_CHATS, JSON.stringify(updated));
          bumpStats({ chatCount: updated.length });
          if (currentChatId === chatId) {
            if (updated.length > 0) loadChat(updated[0].id);
            else createNewChat(updated);
          }
        },
      },
    ]);
  };

  const doLogout = () => {
    setUserMenuOpen(false);
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

  if (!session) {
    return (
      <ScreenContainer containerClassName="bg-[#06080f]" className="items-center justify-center">
        <ActivityIndicator color={COLORS.cyan} size="large" />
      </ScreenContainer>
    );
  }

  const userInitial = (session.name || "U").charAt(0).toUpperCase();

  /* ── Sidebar content (shared between docked desktop rail + mobile drawer) */
  const SidebarBody = (
    <View style={styles.sidebarInner}>
      <TouchableOpacity onPress={() => createNewChat()} activeOpacity={0.85}>
        <LinearGradient colors={GRADIENTS.newChat} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newChatBtn}>
          <Feather name="plus" size={16} color={COLORS.cyan} />
          <Text style={styles.newChatLabel}>NEW CHAT</Text>
        </LinearGradient>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 12 }}>
        {chats.map((chat) => {
          const active = currentChatId === chat.id;
          return (
            <TouchableOpacity
              key={chat.id}
              onPress={() => loadChat(chat.id)}
              activeOpacity={0.8}
              style={[styles.chatItem, active && styles.chatItemActive]}
            >
              <Text style={[styles.chatItemTitle, active && { color: COLORS.cyan }]} numberOfLines={1}>
                {chat.title}
              </Text>
              <TouchableOpacity onPress={() => deleteChat(chat.id)} hitSlop={8} style={styles.chatDeleteBtn}>
                <Feather name="trash-2" size={13} color={COLORS.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <ScreenContainer containerClassName="bg-[#06080f]" className="p-0" edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        {/* ══ Ambient glow wash — softer, two-tone depth behind everything.
            Web only has a single bottom-center radial glow behind the empty
            state; this extends the same language across the whole screen. ══ */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,234,255,0.10)", "transparent"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.6, y: 0.5 }}
          style={styles.ambientGlowTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(168,85,247,0.08)", "transparent"]}
          start={{ x: 1, y: 1 }}
          end={{ x: 0.4, y: 0.5 }}
          style={styles.ambientGlowBottom}
        />

        {/* ══ Docked sidebar (desktop / tablet) ══ */}
        {isDesktop && <View style={styles.sidebarDocked}>{SidebarBody}</View>}

        <View style={{ flex: 1 }}>
          {/* ══ Offline banner ══ */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineIcon}>📡</Text>
              <Text style={styles.offlineText} numberOfLines={2}>
                You're offline — your chats are still here, but you can't send new messages until you reconnect.
              </Text>
            </View>
          )}

          {/* ══ Header — matches the web frontend: fully transparent, no
               blur panel, no logo/title branding, just the sidebar toggle
               and the avatar floating over the content. ══ */}
          <View style={styles.header} pointerEvents="box-none">
            {!isDesktop && (
              <TouchableOpacity onPress={() => setSidebarOpen(true)} style={styles.sidebarToggle} hitSlop={8}>
                <Feather name="menu" size={20} color={COLORS.cyan} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setUserMenuOpen((v) => !v)} style={styles.avatarBtnWrap} hitSlop={6}>
              <LinearGradient colors={GRADIENTS.avatar} style={styles.avatarBtn}>
                <Text style={styles.avatarLetter}>{userInitial}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ══ User dropdown ══ */}
          {userMenuOpen && (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setUserMenuOpen(false)} />
              <View style={styles.userDropdown}>
                <View style={styles.ddHeader}>
                  <Text style={styles.ddName} numberOfLines={1}>
                    {session.name || "User"}
                  </Text>
                  <Text style={styles.ddEmail} numberOfLines={1}>
                    {session.email}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.ddItem}
                  onPress={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  <Feather name="settings" size={15} color={COLORS.textMid} />
                  <Text style={styles.ddItemText}>Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ddItem, styles.ddItemDanger]} onPress={doLogout}>
                  <Feather name="log-out" size={15} color={COLORS.danger} />
                  <Text style={[styles.ddItemText, { color: COLORS.danger }]}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ══ Chat display ══ */}
          {messages.length === 0 ? (
            <View style={styles.emptyState} pointerEvents="box-none">
              <View style={styles.esLogoWrap}>
                <Image source={require("@/assets/images/icon-mark.png")} style={styles.esMark} />
              </View>
              <Text style={[styles.esGreeting, { color: timeGreetingColor() }]}>{greetingText}</Text>
              <Text style={styles.esSub}>
                Your AI companion — <Text style={styles.esSubTyped}>{typedSub}</Text>
                <Text style={styles.esCursor}>|</Text>
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatDisplay}
              contentContainerStyle={{ paddingVertical: 20, paddingBottom: 160 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((log, idx) => (
                <FadeInMessage key={idx} animate={idx === messages.length - 1}>
                <View style={{ marginBottom: compactMode ? 2 : 6 }}>
                  {/* Human bubble */}
                  {(log.humanText || log.humanImage) && (
                    <View style={styles.humanRow}>
                      <LinearGradient
                        colors={GRADIENTS.humanBubble}
                        style={[styles.humanBubble, compactMode && styles.humanBubbleCompact]}
                      >
                        {log.humanImage && (
                          <Image
                            source={{ uri: log.humanImage }}
                            style={{ width: 180, height: 180, borderRadius: 12, marginBottom: log.humanText ? 8 : 0 }}
                            resizeMode="cover"
                          />
                        )}
                        {!!log.humanText && <Text style={styles.humanText}>{log.humanText}</Text>}
                      </LinearGradient>
                    </View>
                  )}

                  {/* AI response */}
                  {(log.aiText || log.thinking || log.fileCard) && (
                    <View style={[styles.aiResponse, compactMode && styles.aiResponseCompact]}>
                      {log.thinking ? (
                        <ThinkingDots stageText={idx === messages.length - 1 ? activityStage : undefined} />
                      ) : (
                        <>
                          {!!log.aiText && <Markdown style={MARKDOWN_STYLE as any}>{log.aiText}</Markdown>}

                          {log.fileCard && (
                            <TouchableOpacity
                              style={styles.fileCard}
                              activeOpacity={0.8}
                              onPress={() => openFileCard(log.fileCard!)}
                            >
                              <Text style={styles.fileCardIcon}>{FILE_ICONS[log.fileCard.fmt] || "📄"}</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.fileCardName} numberOfLines={1}>
                                  {log.fileCard.filename}
                                </Text>
                                <Text style={styles.fileCardHint}>
                                  {DIRECT_DOWNLOAD_FMTS.has(log.fileCard.fmt) ? "Tap to save / share" : "Tap to preview"}
                                </Text>
                              </View>
                              <Feather name="download" size={15} color={COLORS.cyan} />
                            </TouchableOpacity>
                          )}

                          <View style={styles.reactionRow}>
                            <TouchableOpacity
                              onPress={() => toggleSpeak(idx, log.aiText)}
                              style={[styles.reactBtn, speakingIdx === idx && styles.reactBtnLiked]}
                            >
                              <Feather
                                name={speakingIdx === idx ? "volume-x" : "volume-2"}
                                size={12}
                                color={speakingIdx === idx ? COLORS.cyan : COLORS.textLo}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => addReaction(idx, "like")}
                              style={[styles.reactBtn, log.reaction === "like" && styles.reactBtnLiked]}
                            >
                              <Feather
                                name="thumbs-up"
                                size={12}
                                color={log.reaction === "like" ? COLORS.cyan : COLORS.textLo}
                              />
                              {!!log.likes && <Text style={styles.reactCount}>{log.likes}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => addReaction(idx, "dislike")}
                              style={[styles.reactBtn, log.reaction === "dislike" && styles.reactBtnDisliked]}
                            >
                              <Feather
                                name="thumbs-down"
                                size={12}
                                color={log.reaction === "dislike" ? COLORS.danger : COLORS.textLo}
                              />
                              {!!log.dislikes && <Text style={styles.reactCount}>{log.dislikes}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => openComments(idx)} style={styles.reactBtn}>
                              <Feather name="message-circle" size={12} color={COLORS.textLo} />
                              {!!(log.comments && log.comments.length) && (
                                <Text style={styles.reactCount}>{log.comments.length}</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
                </FadeInMessage>
              ))}
            </ScrollView>
          )}

          {/* ══ Floating input pill ══ */}
          <View style={[styles.inputWrap, isDesktop && styles.inputWrapDesktop]}>
            {attachedImage && (
              <View style={styles.imgPreviewBar}>
                <Image source={{ uri: attachedImage.uri }} style={styles.imgThumb} />
                <Text style={styles.imgFname} numberOfLines={1}>
                  Image attached
                </Text>
                <TouchableOpacity onPress={removeImage} hitSlop={8}>
                  <Feather name="x" size={15} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            )}

            {cameraChoiceOpen && (
              <View style={styles.cameraPopup}>
                <TouchableOpacity style={styles.camChoiceBtn} onPress={() => pickImage(true)}>
                  <Feather name="camera" size={16} color={COLORS.cyan} />
                  <Text style={styles.camChoiceText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.camChoiceBtn} onPress={() => pickImage(false)}>
                  <Feather name="image" size={16} color={COLORS.cyan} />
                  <Text style={styles.camChoiceText}>Choose from Gallery</Text>
                </TouchableOpacity>
              </View>
            )}

            {moreMenuOpen && (
              <View style={styles.moreMenu}>
                <TouchableOpacity
                  style={[styles.moreMenuBtn, !voiceEnabled && styles.moreMenuBtnOff]}
                  onPress={() => setVoicePref(!voiceEnabled)}
                >
                  <Feather name={voiceEnabled ? "volume-2" : "volume-x"} size={17} color={voiceEnabled ? "#030810" : COLORS.textLo} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.moreMenuBtn, micActive && styles.moreMenuBtnListening]}
                  onPress={toggleMic}
                >
                  <Feather name="mic" size={17} color={micActive ? "#fff" : "#030810"} />
                </TouchableOpacity>
              </View>
            )}

            <BlurView intensity={50} tint="dark" style={[styles.inputInner, !isOnline && { opacity: 0.5 }]}>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => setCameraChoiceOpen((v) => !v)}
                disabled={!isOnline}
              >
                <Feather name="image" size={16} color={COLORS.cyan} />
              </TouchableOpacity>

              <TextInput
                placeholder="Ask me anything…"
                placeholderTextColor={COLORS.placeholder}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                editable={!loading && isOnline}
                style={styles.textInput}
                onKeyPress={
                  Platform.OS === "web"
                    ? (e: any) => {
                        const native = e.nativeEvent;
                        if (native?.key === "Enter" && !native?.shiftKey) {
                          e.preventDefault?.();
                          sendMessage();
                        }
                      }
                    : undefined
                }
              />

              <TouchableOpacity
                onPress={sendMessage}
                disabled={(!input.trim() && !attachedImage) || loading || !isOnline}
                style={[styles.sendBtn, loading && styles.sendBtnSending]}
              >
                {loading ? (
                  <Feather name="square" size={15} color="#030810" />
                ) : (
                  <Feather name="arrow-up" size={17} color="#030810" />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.convoBtn} onPress={() => router.push("/convo")}>
                <Feather name="activity" size={17} color="#030810" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.moreBtn} onPress={() => setMoreMenuOpen((v) => !v)}>
                <Feather name="more-vertical" size={16} color="#030810" />
              </TouchableOpacity>
            </BlurView>
          </View>

          {/* ══ Toast ══ */}
          {toast && (
            <Animated.View
              style={[
                styles.toast,
                toast.type === "offline" ? styles.toastOffline : styles.toastOnline,
                {
                  opacity: toastAnim,
                  transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                },
              ]}
            >
              <Text style={[styles.toastText, toast.type === "offline" ? { color: "#ffcc80" } : { color: "#80ffb0" }]}>
                {toast.msg}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* ══ Mobile sidebar drawer ══ */}
        {!isDesktop && sidebarOpen && (
          <>
            <Pressable style={styles.drawerBackdrop} onPress={() => setSidebarOpen(false)} />
            <Animated.View
              style={[
                styles.sidebarDrawer,
                {
                  transform: [
                    {
                      translateX: sidebarAnim.interpolate({ inputRange: [0, 1], outputRange: [-240, 0] }),
                    },
                  ],
                },
              ]}
            >
              {SidebarBody}
            </Animated.View>
          </>
        )}
      </View>

      {/* ══ Comment modal ══ */}
      <Modal visible={!!commentModal} transparent animationType="fade" onRequestClose={() => setCommentModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.commentModal}>
            <View style={styles.commentModalHeader}>
              <Text style={styles.commentModalTitle}>💬 Leave a comment</Text>
              <TouchableOpacity onPress={() => setCommentModal(null)} hitSlop={8}>
                <Feather name="x" size={18} color={COLORS.textLo} />
              </TouchableOpacity>
            </View>

            {existingComments.length > 0 && (
              <ScrollView style={{ maxHeight: 140, marginBottom: 12 }}>
                <Text style={styles.commentCountLabel}>
                  {existingComments.length} comment{existingComments.length > 1 ? "s" : ""} so far
                </Text>
                {existingComments.map((c) => (
                  <View key={c.id} style={styles.inlineComment}>
                    <Text style={styles.icAuthor}>{c.user_name || c.user_email || "anon"}</Text>
                    <Text style={styles.icText}>{c.text}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <TextInput
              placeholder="Write your comment here…"
              placeholderTextColor={COLORS.placeholder}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              style={styles.commentInput}
              textAlignVertical="top"
            />
            {!!commentStatus && <Text style={styles.commentStatus}>{commentStatus}</Text>}
            <View style={styles.commentModalActions}>
              <TouchableOpacity onPress={() => setCommentModal(null)} style={styles.commentCancelBtn}>
                <Text style={styles.commentCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitComment} disabled={postingComment} style={styles.commentPostBtn}>
                <Text style={styles.commentPostText}>{postingComment ? "Posting…" : "Post Comment"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ File preview modal (text-based generated files) ══ */}
      <Modal visible={!!fileModal} transparent animationType="fade" onRequestClose={() => setFileModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.fileModalBox}>
            <View style={styles.commentModalHeader}>
              <Text style={styles.commentModalTitle} numberOfLines={1}>
                {fileModal?.filename}
              </Text>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <TouchableOpacity onPress={() => fileModal && saveOrShareFile(fileModal)} hitSlop={8}>
                  <Feather name="download" size={18} color={COLORS.cyan} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFileModal(null)} hitSlop={8}>
                  <Feather name="x" size={18} color={COLORS.textLo} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.fileModalContent}>
              <Text style={styles.fileModalText}>{fileModal?.textContent || "(empty)"}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══ "You're Astral's #1 user" gamification toast ══ */}
      {topToast && (
        <Animated.View
          style={[
            styles.topToast,
            topToast.demoted ? styles.topToastDemoted : styles.topToastGold,
            {
              opacity: topToastAnim,
              transform: [{ translateY: topToastAnim.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
            },
          ]}
        >
          <Text style={styles.topToastIcon}>{topToast.demoted ? "📉" : "🏆"}</Text>
          <Text style={[styles.topToastText, topToast.demoted && { color: "#cbd5e1" }]}>{topToast.msg}</Text>
          <TouchableOpacity onPress={() => setTopToast(null)} hitSlop={8}>
            <Feather name="x" size={14} color={topToast.demoted ? "#cbd5e1" : "#a3724a"} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: COLORS.bgDeep },
  ambientGlowTop: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 420,
    height: 420,
    borderRadius: 999,
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -100,
    right: -80,
    width: 480,
    height: 480,
    borderRadius: 999,
  },

  /* ── Sidebar ── */
  sidebarDocked: {
    width: LAYOUT.sidebarW,
    backgroundColor: COLORS.bgPanel,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  sidebarDrawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: COLORS.bgPanel,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    zIndex: 500,
    elevation: 20,
  },
  drawerBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 400,
  },
  sidebarInner: { flex: 1, padding: 14, gap: 12 },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.cyanMid,
    paddingVertical: 12,
    minHeight: 42,
  },
  newChatLabel: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 12, letterSpacing: 1.2 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(0,234,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.1)",
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginBottom: 6,
  },
  chatItemActive: { backgroundColor: "rgba(0,234,255,0.12)", borderColor: COLORS.cyan },
  chatItemTitle: { flex: 1, color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 13 },
  chatDeleteBtn: { width: 22, height: 22, alignItems: "center", justifyContent: "center", opacity: 0.7 },

  /* ── Header ── */
  header: {
    height: LAYOUT.headerH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "transparent",
  },
  sidebarToggle: {
    position: "absolute",
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtnWrap: { position: "absolute", right: 12 },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.cyanMid,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  avatarLetter: { color: "#030810", fontFamily: FONTS.display, fontSize: 14 },

  /* ── User dropdown ── */
  userDropdown: {
    position: "absolute",
    right: 12,
    top: LAYOUT.headerH + 10,
    width: 220,
    backgroundColor: COLORS.bgPanel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    overflow: "hidden",
    zIndex: 2000,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  ddHeader: { padding: 14, backgroundColor: "rgba(0,234,255,0.05)", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ddName: { color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 14 },
  ddEmail: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  ddItem: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, paddingHorizontal: 16 },
  ddItemDanger: {},
  ddItemText: { color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 13.5 },

  /* ── Offline banner ── */
  offlineBanner: {
    backgroundColor: "#1a0a00",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255,160,0,0.45)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineIcon: { fontSize: 14 },
  offlineText: { color: "#ffcc80", fontFamily: FONTS.body, fontSize: 11.5, flex: 1 },

  /* ── Empty state ── */
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  esLogoWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  esMark: {
    width: 56,
    height: 56,
    resizeMode: "contain",
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  esGreeting: { fontFamily: FONTS.bodyMedium, fontSize: 17 },
  esSub: {
    color: "#3a7a94",
    fontFamily: FONTS.bodyItalic,
    fontSize: 13,
    maxWidth: 300,
    textAlign: "center",
    marginTop: 4,
  },
  esSubTyped: { color: COLORS.cyan, fontFamily: FONTS.bodyItalic },
  esCursor: { color: COLORS.cyan },
  esChips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14, maxWidth: 420 },
  esChip: {
    backgroundColor: "rgba(0,234,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.22)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  esChipText: { color: "#8fd6ff", fontFamily: FONTS.body, fontSize: 12.5 },

  /* ── Chat display / bubbles ── */
  chatDisplay: { flex: 1, backgroundColor: COLORS.bgDeep },
  humanRow: { alignItems: "flex-end", marginHorizontal: 16, marginBottom: 2, marginTop: 10 },
  humanBubble: {
    maxWidth: "76%",
    borderRadius: 20,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,170,255,0.15)",
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  humanText: { color: "#eaf4ff", fontFamily: FONTS.body, fontSize: 14.5 },
  humanBubbleCompact: { paddingVertical: 7, paddingHorizontal: 12 },
  aiResponse: { paddingVertical: 12, paddingHorizontal: 22 },
  aiResponseCompact: { paddingVertical: 10, paddingHorizontal: 20 },

  tlRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 6 },
  tlArc: { flexDirection: "row", alignItems: "center", gap: 7, height: 22 },
  tlDot: { width: 5, height: 5, borderRadius: 4, shadowOpacity: 0.7, shadowRadius: 4 },
  tlText: { color: "#5cb8d0", fontFamily: FONTS.bodyItalic, fontSize: 12.5 },

  reactionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  reactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.14)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 11,
  },
  reactBtnLiked: { borderColor: COLORS.cyan, backgroundColor: COLORS.cyanDim },
  reactBtnDisliked: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerDim },
  reactCount: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11 },

  /* ── Floating input ── */
  inputWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  inputWrapDesktop: { left: LAYOUT.sidebarW + 24, right: 24, bottom: 22, maxWidth: 700, alignSelf: "center" },
  inputInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.cyanBorder,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(9,13,24,0.75)",
    overflow: "hidden",
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cyanBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    color: COLORS.textHi,
    fontFamily: FONTS.body,
    fontSize: 14.5,
    maxHeight: 100,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cyan,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.55,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  sendBtnSending: { backgroundColor: COLORS.violet, shadowColor: COLORS.violet },
  convoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cyan,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.4,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  moreBtn: {
    width: 32,
    height: 36,
    borderRadius: 16,
    backgroundColor: COLORS.cyan,
    alignItems: "center",
    justifyContent: "center",
  },

  imgPreviewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,234,255,0.05)",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    borderRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 4,
  },
  imgThumb: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: COLORS.cyanMid },
  imgFname: { flex: 1, color: "#8fd6ff", fontFamily: FONTS.body, fontSize: 12.5 },

  cameraPopup: {
    position: "absolute",
    bottom: 70,
    left: 4,
    backgroundColor: COLORS.bgPanel,
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.4)",
    borderRadius: 16,
    padding: 8,
    minWidth: 190,
    gap: 4,
    zIndex: 2000,
    elevation: 12,
  },
  camChoiceBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  camChoiceText: { color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 13.5 },

  moreMenu: {
    position: "absolute",
    bottom: 70,
    right: 4,
    flexDirection: "column",
    gap: 8,
    backgroundColor: COLORS.bgPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.45)",
    padding: 8,
    zIndex: 2000,
    elevation: 12,
  },
  moreMenuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.cyan, alignItems: "center", justifyContent: "center" },
  moreMenuBtnOff: { backgroundColor: "#1e2d3d" },
  moreMenuBtnListening: { backgroundColor: "#ff6b35" },

  /* ── Toast ── */
  toast: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    borderRadius: 50,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  toastOffline: { backgroundColor: "rgba(20,10,0,0.95)", borderColor: "rgba(255,160,0,0.4)" },
  toastOnline: { backgroundColor: "rgba(0,20,10,0.95)", borderColor: "rgba(0,200,100,0.4)" },
  toastText: { fontFamily: FONTS.body, fontSize: 12.5 },

  /* ── Comment modal ── */
  modalBackdrop: { flex: 1, backgroundColor: "rgba(4,6,12,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  commentModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.bgPanel,
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.2)",
    borderRadius: 24,
    padding: 20,
  },
  commentModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  commentModalTitle: { color: COLORS.textHi, fontFamily: FONTS.display, fontSize: 15 },
  commentCountLabel: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 10.5, textTransform: "uppercase", marginBottom: 8 },
  inlineComment: {
    backgroundColor: "rgba(168,85,247,0.06)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.15)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  icAuthor: { color: "#c084fc", fontFamily: FONTS.bodyMedium, fontSize: 12 },
  icText: { color: "#94a3b8", fontFamily: FONTS.body, fontSize: 13, marginTop: 3 },
  commentInput: {
    minHeight: 90,
    color: COLORS.textHi,
    fontFamily: FONTS.body,
    fontSize: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  commentStatus: { color: COLORS.cyan, fontFamily: FONTS.body, fontSize: 12, marginTop: 8 },
  commentModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  commentCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  commentCancelText: { color: COLORS.textMid, fontFamily: FONTS.body, fontSize: 13 },
  commentPostBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: COLORS.cyan },
  commentPostText: { color: "#030810", fontFamily: FONTS.display, fontSize: 13 },

  /* ── File card (generated/converted files in chat) ── */
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.cyanFaint,
    borderWidth: 1,
    borderColor: "rgba(0,234,255,0.25)",
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  fileCardIcon: { fontSize: 20 },
  fileCardName: { color: COLORS.textHi, fontFamily: FONTS.bodyMedium, fontSize: 13 },
  fileCardHint: { color: COLORS.textLo, fontFamily: FONTS.body, fontSize: 11, marginTop: 1 },

  /* ── File preview modal ── */
  fileModalBox: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: COLORS.bgPanel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
  },
  fileModalContent: {
    marginTop: 10,
    backgroundColor: "rgba(0,5,15,0.75)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  fileModalText: { color: COLORS.textMid, fontFamily: FONTS.mono, fontSize: 12.5, lineHeight: 19 },

  /* ── Top-user gamification toast ── */
  topToast: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    maxWidth: "92%",
    zIndex: 999,
  },
  topToastGold: {
    backgroundColor: "rgba(10,14,28,0.97)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.45)",
    shadowColor: "#fbbf24",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  topToastDemoted: {
    backgroundColor: "rgba(14,8,24,0.97)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
  },
  topToastIcon: { fontSize: 16 },
  topToastText: { flex: 1, color: "#fde68a", fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 17 },
});

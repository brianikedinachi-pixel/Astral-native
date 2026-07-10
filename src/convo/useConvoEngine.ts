import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as KeepAwake from "expo-keep-awake";
import * as speech from "./speech";
import * as tts from "./tts";
import * as native from "./nativeBridge";
import { sendConvoMessage, ConvoSession, ConvoTurn } from "./api";

// Mirrors the web app's convo-mode state machine 1:1 (_convoCurrentState /
// _CONVO_STATE_LABELS in brain.js), minus "analyzing" which the web client
// itself has disabled. The mic is fully OFF during "thinking" and
// "speaking" -- it snaps back on the instant playback finishes, same as
// the web app's ChatGPT-style turn taking.
export type ConvoState = "connecting" | "listening" | "thinking" | "analyzing" | "loading" | "speaking" | "muted" | "error";

const MAX_MIC_FAILS = 6;
const KEEP_AWAKE_TAG = "astral-convo";
const GREETING = "Hey, I'm listening. What's on your mind?";

interface UseConvoEngineArgs {
  session: ConvoSession | null;
  /** Fired when the floating bubble is tapped while backgrounded — mirrors
   * tapping the in-app orb, so the screen should react by opening the same
   * "Stop the conversation?" confirmation the moment the app comes forward. */
  onBubblePress?: () => void;
}

export function useConvoEngine({ session, onBubblePress }: UseConvoEngineArgs) {
  const [state, setState] = useState<ConvoState>("connecting");
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [wordPulse, setWordPulse] = useState(0);

  const historyRef = useRef<ConvoTurn[]>([]);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const stopSpeechRef = useRef<(() => void) | null>(null);
  const stopTtsRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micFailRef = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (state === "listening" || state === "thinking" || state === "speaking") {
      native.setBubbleState(state as "listening" | "thinking" | "speaking");
    }
  }, [state]);

  const clearTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    clearTicker();
    tickRef.current = setInterval(() => {
      if (startTimeRef.current) setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);
  }, [clearTicker]);

  const stopMic = useCallback(() => {
    stopSpeechRef.current?.();
    stopSpeechRef.current = null;
    speech.stopListening();
  }, []);

  // handleFinal is defined below but referenced by startMic before its own
  // declaration exists (both close over each other) -- route through a ref
  // so startMic always calls the latest version without re-subscribing.
  const handleFinalRef = useRef<(text: string) => void>(() => {});

  const startMic = useCallback(() => {
    if (!activeRef.current || mutedRef.current) return;
    stopSpeechRef.current = speech.startListening({
      onFinal: (text) => handleFinalRef.current(text),
      onPartial: (t) => setTranscriptPreview(t),
      onError: () => {
        micFailRef.current++;
        if (micFailRef.current >= MAX_MIC_FAILS) {
          setLastError("Lost the mic — tap the orb to try again.");
          setState("error");
        }
      },
    });
  }, []);

  const speakReply = useCallback(
    (text: string, isGreeting = false) => {
      setCaption("");
      setState("loading");
      stopTtsRef.current = tts.speak(text, {
        onStart: () => setState("speaking"),
        onWord: (_i, word) => {
          setCaption((c) => (c ? c + " " + word : word));
          setWordPulse((p) => p + 1);
        },
        onDone: () => {
          stopTtsRef.current = null;
          if (!activeRef.current) return;
          if (!isGreeting) historyRef.current.push({ role: "model", text });
          setCaption(text);
          micFailRef.current = 0;
          if (mutedRef.current) {
            setState("muted");
          } else {
            setState("listening");
            startMic();
          }
        },
      });
    },
    [startMic]
  );

  const handleFinal = useCallback(
    async (text: string) => {
      if (!activeRef.current || mutedRef.current) return;
      setTranscriptPreview("");
      stopMic();
      historyRef.current.push({ role: "user", text });
      setState("thinking");
      micFailRef.current = 0;

      // Speak a filler phrase immediately so there's never dead air while
      // waiting on the backend -- cancelled the instant the real reply lands.
      stopTtsRef.current = tts.speak(tts.randomFillerPhrase(), {
        onDone: () => {
          stopTtsRef.current = null;
        },
      });

      try {
        const reply = await sendConvoMessage(text, historyRef.current, sessionRef.current);
        tts.stopSpeaking();
        stopTtsRef.current = null;
        if (!activeRef.current) return;
        speakReply(reply);
      } catch (e: any) {
        tts.stopSpeaking();
        stopTtsRef.current = null;
        const msg = e?.message ?? "Sorry, something went wrong there. Say that again?";
        setLastError(msg);
        if (!activeRef.current) return;
        speakReply(msg);
      }
    },
    [speakReply, stopMic]
  );

  useEffect(() => {
    handleFinalRef.current = handleFinal;
  }, [handleFinal]);

  const start = useCallback(async () => {
    if (activeRef.current) return;

    const granted = await speech.requestMicPermission();
    if (!granted) {
      setLastError("Microphone permission is needed for Convo Mode.");
      setState("error");
      return;
    }
    if (native.isAvailable()) {
      const hasOverlay = await native.hasOverlayPermission();
      // Opens a system settings screen; can't be silently auto-granted.
      // Convo Mode still works fully in-app either way -- this only
      // affects whether the floating orb can draw once backgrounded.
      if (!hasOverlay) await native.requestOverlayPermission();
    }

    activeRef.current = true;
    mutedRef.current = false;
    setMuted(false);
    setLastError(null);
    setCaption("");
    setTranscriptPreview("");
    historyRef.current = [];
    micFailRef.current = 0;
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    startTicker();
    setState("connecting");

    try {
      await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch (e) {
      // best-effort
    }

    setTimeout(() => {
      if (!activeRef.current) return;
      speakReply(GREETING, true);
    }, 350);
  }, [speakReply, startTicker]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    mutedRef.current = false;
    setMuted(false);
    stopMic();
    stopTtsRef.current?.();
    stopTtsRef.current = null;
    tts.stopSpeaking();
    native.stopBackgroundConvo();
    clearTicker();
    startTimeRef.current = null;
    setElapsedMs(0);
    setState("connecting");
    setTranscriptPreview("");
    setCaption("");
    setLastError(null);
    historyRef.current = [];
    try {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch (e) {
      // best-effort
    }
  }, [stopMic, clearTicker]);

  const toggleMute = useCallback(() => {
    if (!activeRef.current) return;
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (mutedRef.current) {
      stopMic();
      setState("muted");
    } else {
      micFailRef.current = 0;
      setState("listening");
      setTimeout(startMic, 150);
    }
  }, [stopMic, startMic]);

  const retry = useCallback(() => {
    activeRef.current = false;
    start();
  }, [start]);

  // Background handling: when the app leaves the foreground while Convo
  // Mode is active, hand off to the native foreground service + floating
  // bubble so the conversation keeps running instead of being killed.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (!activeRef.current) return;
      if (next === "background") {
        native.startBackgroundConvo();
      } else if (next === "active") {
        native.stopBackgroundConvo();
      }
    });
    return () => sub.remove();
  }, []);

  // Native-side events: notification "End Convo" action, or the bubble's tap.
  useEffect(() => {
    const endSub = native.addConvoEventListener("endConvo", () => stop());
    return () => endSub.remove();
  }, [stop]);

  // Bubble tap: the native side already brings the app to the foreground —
  // this just makes the screen respond exactly like tapping the in-app orb.
  const onBubblePressRef = useRef(onBubblePress);
  onBubblePressRef.current = onBubblePress;
  useEffect(() => {
    const sub = native.addConvoEventListener("bubblePress", () => onBubblePressRef.current?.());
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      // Safety net on unmount.
      activeRef.current = false;
      stopSpeechRef.current?.();
      speech.stopListening();
      tts.stopSpeaking();
      native.stopBackgroundConvo();
      clearTicker();
      try {
        KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch (e) {
        // best-effort
      }
    };
  }, [clearTicker]);

  return {
    state,
    transcriptPreview,
    caption,
    lastError,
    elapsedMs,
    muted,
    wordPulse,
    start,
    stop,
    retry,
    toggleMute,
  };
}

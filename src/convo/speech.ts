import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

// Plain start/stop functions for the convo engine (not a hook). Mirrors the
// web app's "always-on mic" engine in brain.js: results stream in as
// interim + final chunks, finals are merged (trimming any overlap the
// recognizer re-emits), and an utterance is only "committed" to the caller
// after a short silence gap -- this avoids splitting one sentence into
// several separate sends whenever the recognizer finalizes early.

export async function requestMicPermission(): Promise<boolean> {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return !!result.granted;
}

type StartOpts = {
  onFinal: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
};

const SILENCE_COMMIT_MS = 900;
const RECOGNIZER_OPTS = {
  lang: "en-US",
  interimResults: true,
  continuous: true,
  requiresOnDeviceRecognition: false,
  addsPunctuation: true,
} as const;

let active = false;
let pendingFinal = "";
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let currentOpts: StartOpts | null = null;

/** Trims any leading words of `incoming` that already match the trailing
 * words of `existing` before appending -- kills the "hello hello how how"
 * stutter some Android recognizers produce on continuous sessions. */
function dedupeAppend(existing: string, incoming: string): string {
  const existWords = existing.trim().split(/\s+/).filter(Boolean);
  const incWords = incoming.trim().split(/\s+/).filter(Boolean);
  if (!existWords.length || !incWords.length) {
    return (existing.trim() + " " + incoming.trim()).trim();
  }
  const maxOverlap = Math.min(existWords.length, incWords.length);
  let overlap = 0;
  for (let n = maxOverlap; n > 0; n--) {
    const tail = existWords.slice(existWords.length - n).join(" ").toLowerCase();
    const head = incWords.slice(0, n).join(" ").toLowerCase();
    if (tail === head) {
      overlap = n;
      break;
    }
  }
  return (existing.trim() + " " + incWords.slice(overlap).join(" ")).trim();
}

function commit() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  const text = pendingFinal.trim();
  pendingFinal = "";
  if (!text || !active) return;
  currentOpts?.onFinal(text);
}

export function startListening(opts: StartOpts) {
  active = true;
  pendingFinal = "";
  currentOpts = opts;

  ExpoSpeechRecognitionModule.start(RECOGNIZER_OPTS);

  const resultSub = ExpoSpeechRecognitionModule.addListener("result", (event) => {
    if (!active) return;
    const text = event.results?.[0]?.transcript ?? "";
    if (!text.trim()) return;
    if (event.isFinal) {
      pendingFinal = dedupeAppend(pendingFinal, text.trim());
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(commit, SILENCE_COMMIT_MS);
      currentOpts?.onPartial?.(pendingFinal);
    } else {
      currentOpts?.onPartial?.(text);
    }
  });

  const errorSub = ExpoSpeechRecognitionModule.addListener("error", (e: any) => {
    if (!active) return;
    // "no-speech" is completely normal in always-on mode -- the recognizer
    // just reset; `end` below will restart it.
    if (e.error === "no-speech" || e.error === "aborted") return;
    currentOpts?.onError?.(e.message ?? e.error ?? "speech recognition error");
  });

  // Android's recognizer stops after a pause even in continuous mode --
  // restart automatically so the mic stays effectively always-on for as
  // long as the caller hasn't torn it down.
  const endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
    if (!active) return;
    if (pendingFinal.trim()) commit();
    try {
      ExpoSpeechRecognitionModule.start(RECOGNIZER_OPTS);
    } catch (e) {
      currentOpts?.onError?.("speech recognition restart failed");
    }
  });

  return () => {
    resultSub.remove();
    errorSub.remove();
    endSub.remove();
  };
}

export function stopListening() {
  active = false;
  currentOpts = null;
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  pendingFinal = "";
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch (e) {
    // no-op -- already stopped
  }
}

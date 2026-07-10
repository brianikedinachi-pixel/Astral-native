import * as Speech from "expo-speech";

// Same "thinking sound" phrase pool as the web app's _CONVO_THINKING_SOUNDS,
// spoken back to the user (via device TTS) the instant their turn ends so
// there's never a dead silence while the backend replies.
const THINKING_PHRASES = [
  "Hmm, let me think about that.",
  "Good question, give me a sec.",
  "Let me think on that for a moment.",
  "Okay, let me work through that.",
  "Right, let me consider that.",
  "One sec, thinking it through.",
  "Got it, give me a moment.",
  "Let's see here.",
  "Okay, one moment.",
  "Hmm, interesting — let me think.",
  "Give me just a second.",
  "Let me piece that together.",
  "Alright, thinking on it.",
  "Sure, hold on a sec.",
  "Let me figure that out.",
];

let lastPhrase: string | null = null;

export function randomFillerPhrase(): string {
  const pool = THINKING_PHRASES;
  let phrase = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (phrase === lastPhrase && guard++ < 5) {
    phrase = pool[Math.floor(Math.random() * pool.length)];
  }
  lastPhrase = phrase;
  return phrase;
}

/** Duration-weighted word timings, the same idea as the web app's caption
 * fallback estimator: longer words and words followed by punctuation get
 * proportionally more of the estimated speaking time. Device TTS doesn't
 * expose real per-word timestamps, so this is the closest equivalent --
 * good enough to make captions track the voice convincingly. */
function estimateWordDelaysMs(text: string): number[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((w) => {
    let weight = Math.max(w.length, 2);
    if (/[.!?]$/.test(w)) weight += 5;
    else if (/[,;:—–-]$/.test(w)) weight += 2;
    return weight;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  // ~13 chars/sec at the rate=0.97 we speak with -- tuned by ear, not measured.
  const totalMs = Math.max(700, (text.length / 13) * 1000);
  const delays: number[] = [];
  let running = 0;
  for (const w of weights) {
    running += (w / totalWeight) * totalMs;
    delays.push(running);
  }
  return delays;
}

export interface SpeakOpts {
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onWord?: (index: number, word: string) => void;
  onDone?: () => void;
}

let activeId = 0;

/** Speaks `text` and returns a cancel function. `onWord` fires on an
 * estimated schedule as each word would be spoken, so a live caption can
 * reveal words in sync the way the web app's real-timing captions do. */
export function speak(text: string, opts: SpeakOpts = {}): () => void {
  Speech.stop();
  const id = ++activeId;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const delays = estimateWordDelaysMs(text);
  const timers: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
  };

  Speech.speak(text, {
    rate: opts.rate ?? 0.97,
    pitch: opts.pitch ?? 0.95,
    onStart: () => {
      if (id !== activeId) return;
      opts.onStart?.();
      words.forEach((word, i) => {
        timers.push(
          setTimeout(() => {
            if (id === activeId) opts.onWord?.(i, word);
          }, delays[i])
        );
      });
    },
    onDone: () => {
      if (id !== activeId) return;
      clearTimers();
      opts.onDone?.();
    },
    onStopped: () => {
      if (id !== activeId) return;
      clearTimers();
      opts.onDone?.();
    },
    onError: () => {
      if (id !== activeId) return;
      clearTimers();
      opts.onDone?.();
    },
  });

  return () => {
    activeId++;
    clearTimers();
    Speech.stop();
  };
}

export function stopSpeaking() {
  activeId++;
  Speech.stop();
}

export async function isSpeaking() {
  return Speech.isSpeakingAsync();
}

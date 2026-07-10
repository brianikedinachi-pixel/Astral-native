const BACKEND_URL = "https://astral-1-sb1i.onrender.com";

// Same shape the web frontend keeps in `_convoHistory` — role is "model"
// (not "assistant") because that's what the /convo-chat endpoint expects.
export interface ConvoTurn {
  role: "user" | "model";
  text: string;
}

export interface ConvoSession {
  user_id?: string;
  email?: string;
  name?: string;
}

/**
 * Sends one utterance to the same `/convo-chat` endpoint the web app's
 * conversation mode uses (as opposed to the general `/chat` endpoint used
 * by the regular text chat screen) so voice replies match the web
 * experience -- same persona tuning, same short-form spoken-style replies.
 */
export async function sendConvoMessage(
  text: string,
  history: ConvoTurn[],
  session: ConvoSession | null
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const resp = await fetch(`${BACKEND_URL}/convo-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        user_id: session?.email || session?.user_id || "anon",
        user_email: session?.email || "",
        user_name: session?.name || "",
        conversation_history: history.slice(-10),
        // Emotion detection is disabled server-side for now (mirrors the
        // web client, which hardcodes this to avoid a second mic stream
        // conflicting with the always-on recognizer).
        user_emotion: "neutral",
        emotion_confidence: 0.5,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.reply || "").trim() || "Hmm, I missed that -- say it again?";
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      throw new Error("Sorry, that took too long. Could you say it again?");
    }
    throw new Error("Sorry, something went wrong. Say that again?");
  }
}

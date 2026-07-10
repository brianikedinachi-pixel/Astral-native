import { NativeEventEmitter, NativeModules, Platform } from "react-native";

// Backed by AstralConvoModule.kt, registered via the withAstralConvoNative
// config plugin. Everything here safely no-ops on iOS/web — those platforms
// simply don't get the floating bubble or the persistent foreground
// service; Convo Mode still works while the app is open on every platform.

const { AstralConvo } = NativeModules;
const emitter = AstralConvo ? new NativeEventEmitter(AstralConvo) : null;

const isAndroidNative = Platform.OS === "android" && !!AstralConvo;

export function isAvailable() {
  return isAndroidNative;
}

/** Ask for "draw over other apps" — required once, sends user to a system
 * settings screen; cannot be silently auto-granted. */
export async function requestOverlayPermission(): Promise<boolean> {
  if (!isAndroidNative) return false;
  return AstralConvo.requestOverlayPermission();
}

export async function hasOverlayPermission(): Promise<boolean> {
  if (!isAndroidNative) return false;
  return AstralConvo.hasOverlayPermission();
}

/** Starts the foreground service (keeps the process alive + shows the
 * "Astral is listening" notification with Go to App / End Convo actions)
 * and shows the draggable floating orb bubble. */
export function startBackgroundConvo() {
  if (!isAndroidNative) return;
  AstralConvo.startForegroundService();
  AstralConvo.showBubble();
}

export function stopBackgroundConvo() {
  if (!isAndroidNative) return;
  AstralConvo.hideBubble();
  AstralConvo.stopForegroundService();
}

export function setBubbleState(state: "listening" | "thinking" | "speaking") {
  if (!isAndroidNative) return;
  AstralConvo.setBubbleState(state);
}

/** Fires when the notification's "End Convo" action or the bubble's
 * "Remove Astral's essence" menu item is tapped, from native code. */
export function addConvoEventListener(
  event: "endConvo" | "openApp" | "bubblePress",
  handler: () => void
) {
  if (!emitter) return { remove: () => {} };
  return emitter.addListener(event, handler);
}

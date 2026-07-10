# Astral — Convo Mode + Floating Bubble (Android)

**Update:** refined the bubble's tap behavior and the notification's look, per request #2 (background notification + mini orb parity). Touched: `ConvoForegroundService.kt` (tap vs. long-press split, styled notification), `plugins/withAstralConvoNative/index.js` (copies a full-color large icon), `src/convo/useConvoEngine.ts` and `app/convo.tsx` (screen now reacts to a bubble tap the same way it reacts to tapping the in-app orb). Everything else from the original build below is unchanged. Convo mode's own UI/UX parity with web (request #1) and the rest of the app's design overhaul (request #3) are intentionally untouched — hold for your go-ahead.

## What was added to your uploaded project

**New files:**
- `src/convo/tts.ts` — text-to-speech via `expo-speech` (already your dependency)
- `src/convo/speech.ts` — speech-to-text via `expo-speech-recognition` (new dependency)
- `src/convo/api.ts` — talks to your existing backend (`/chat` on `astral-1-sb1i.onrender.com`)
- `src/convo/nativeBridge.ts` — JS bridge to the native Android module below
- `src/convo/useConvoEngine.ts` — the listening → thinking → speaking state machine
- `src/convo/ConvoOrb.tsx` — animated orb, colored by state
- `app/convo.tsx` — the Convo Mode screen
- `plugins/withAstralConvoNative/` — Expo config plugin + Kotlin native module

**Edited files:**
- `app/_layout.tsx` — registered the `/convo` route
- `app/chat-enhanced.tsx` — added a ✨ button in the header that opens Convo Mode
- `app.config.ts` — added permissions and registered the two new plugins
- `package.json` — added `expo-speech-recognition`

## What this actually gets you

- **Floating orb bubble** that draws over other apps/home screen, draggable, top-right by default.
  - **Tap** it (without dragging) → does exactly what tapping the in-app orb does: brings Astral to the foreground *and* opens the same "Stop the conversation?" confirmation, in one motion.
  - **Long-press** (~450ms, no drag) → the extra menu: **Go to app / End convo / Remove Astral's essence**, for anyone who wants to end things without fully reopening the app.
- **Foreground service** that keeps the app process alive when backgrounded, so the conversation doesn't just die the moment you leave.
- **Styled notification** titled "✨ Astral is listening", using Astral's cyan accent color and a full-color large icon (not just the flat system silhouette), with an expandable body and **Go to App** / **End Convo** actions.
- All Android-only, as discussed — iOS still cannot draw over other apps or the home screen, by Apple's platform rule, not a limitation of this code.

## Important: this cannot be fully tested in the environment that built it

I wrote, syntax-checked, and did a manual debug pass on the JS/TS/Kotlin here, but there is no Android SDK, emulator, or network access available to me — so **it has not been compiled or run.** Treat it as a strong, real draft that needs a normal build-and-fix pass, not verified-working code.

**What the debug pass fixed:**
1. Replaced `android.widget.PopupMenu` (which needs a proper Activity window token and can crash/no-op from inside a bare overlay Service) with a hand-built `PopupWindow`-style menu drawn the same way as the bubble itself — more reliable in this exact context.
2. Notification taps ("Go to App" and the notification body) now use `PendingIntent.getActivity()` directly instead of routing through the service — avoids Android 10+'s background-activity-start restrictions.
3. Fixed a bug where the JS bubble-state sync could send "speaking" to the native bubble color even when Convo Mode was idle/errored.
4. Added the actual "Remove Astral's essence" behavior (was previously just deleting the bubble with no way back) — it now leaves a small reappear tab in the corner, tap to restore, matching the web version exactly.

**One known simplification, not a bug:** the bubble's popup menu has no "tap outside to dismiss" — it closes when you tap a menu item, or you can tap the bubble again to refresh it. Making outside-taps dismiss it would require a full-screen transparent touch-catcher window, which felt like more invasiveness than this feature needs; say the word if you want that added.

**Spot to double check once building:** the `withMainApplication` config-plugin patch that inserts `AstralConvoPackage()` — it does a text match against the standard Expo template. After running `expo prebuild`, open `android/app/src/main/java/.../MainApplication.kt` and confirm `packages.add(AstralConvoPackage())` is actually there; add it by hand if the plugin's pattern didn't match your exact template.

## Build steps

This requires a custom dev client / bare build — **not Expo Go**, since it has custom native code.

1. `pnpm install` (or npm/yarn) to pull in `expo-speech-recognition`.
2. `npx expo prebuild -p android --clean` — this generates the `android/` folder and runs the config plugin (copies the Kotlin files, patches the manifest and `MainApplication.kt`).
3. Open `android/` in Android Studio, or run `npx expo run:android` with a device/emulator connected.
4. On first Convo Mode launch: grant microphone permission, then you'll be sent to a system settings screen for "draw over other apps" — grant it there and return to the app.
5. Test: start Convo Mode, background the app (home button), confirm the notification appears and the bubble is draggable in the top-right corner, then talk and confirm a reply comes back.
6. Once confirmed working, build a release with `eas build -p android` (or a local release build) to share/install outside of dev mode.

## What's still just as true as before

- iOS: no floating bubble, ever — confirmed platform rule, not solvable by more code.
- This uses live continuous recognition (not Median's chunked approach), so replies should feel close to real-time as long as Android doesn't kill the process — which is exactly what the foreground service is for.

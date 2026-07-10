package __PACKAGE__.convo

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import __PACKAGE__.R

/**
 * Keeps Convo Mode alive while the app is backgrounded:
 *  - a foreground notification ("Astral is listening", Go to App / End Convo)
 *  - a small draggable orb bubble drawn over other apps, top-right by default
 *
 * Debug notes (read before assuming a crash is your fault):
 *  - The bubble menu is a hand-built PopupWindow, not android.widget.PopupMenu.
 *    PopupMenu needs a proper Activity-themed window token, which a bare
 *    overlay Service doesn't reliably have — it can crash/no-op silently
 *    from a Service context. PopupWindow drawn via WindowManager sidesteps
 *    that entirely, which is why it's used here instead.
 *  - Notification taps go through PendingIntent.getActivity directly (not
 *    routed through the service). Launching an Activity indirectly from
 *    inside a Service's onStartCommand can hit Android 10+'s background-
 *    activity-start restrictions; a direct getActivity() PendingIntent from
 *    a user's notification tap is exempt from that restriction.
 */
class ConvoForegroundService : Service() {

    companion object {
        const val ACTION_START = "astral.convo.START"
        const val ACTION_STOP = "astral.convo.STOP"
        const val ACTION_SHOW_BUBBLE = "astral.convo.SHOW_BUBBLE"
        const val ACTION_HIDE_BUBBLE = "astral.convo.HIDE_BUBBLE"
        const val ACTION_END_CONVO = "astral.convo.END_CONVO_ACTION"

        const val CHANNEL_ID = "astral_convo_channel"
        const val NOTIF_ID = 4471

        var instance: ConvoForegroundService? = null
        var currentState: String = "listening" // listening | thinking | speaking
    }

    private var windowManager: WindowManager? = null
    private var bubbleView: FrameLayout? = null
    private var essenceTabView: FrameLayout? = null
    private var menuView: LinearLayout? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForeground(NOTIF_ID, buildNotification())
                showBubble()
            }
            ACTION_STOP -> {
                teardownOverlays()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_SHOW_BUBBLE -> showBubble()
            ACTION_HIDE_BUBBLE -> hideBubble()
            ACTION_END_CONVO -> {
                AstralConvoModule.emit("endConvo")
                teardownOverlays()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        instance = null
        teardownOverlays()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun teardownOverlays() {
        longPressHandler.removeCallbacksAndMessages(null)
        dismissMenu()
        hideBubble()
        hideEssenceTab()
    }

    // ── Notification ────────────────────────────────────────────────────
    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Astral Conversation", NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Shown while a live conversation with Astral is active." }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openPending = buildOpenAppPendingIntent(1)
        val endPending = PendingIntent.getService(
            this, 2, serviceIntent(ACTION_END_CONVO),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Branded look: Astral's signature cyan accent (matches the web app's
        // --accent-cyan / the app's COLORS.cyan), a full-color large icon
        // (small icon must stay a flat white silhouette per Android rules),
        // and an expandable body so the notification reads as "Astral", not
        // a generic system alert.
        val largeIcon = runCatching {
            BitmapFactory.decodeResource(resources, R.drawable.notification_large_icon)
        }.getOrNull()

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("✨ Astral is listening")
            .setContentText("Conversation is still going · tap to return")
            .setSmallIcon(R.drawable.notification_icon) // white silhouette, added by the plugin
            .setColor(0xFF00EAFF.toInt())
            .setColorized(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPending)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("Conversation is still going · tap to return, or use the floating orb to check in without opening the app.")
            )
            .addAction(0, "Go to App", openPending)
            .addAction(0, "End Convo", endPending)

        if (largeIcon != null) builder.setLargeIcon(largeIcon)
        return builder.build()
    }

    private fun buildOpenAppPendingIntent(requestCode: Int): PendingIntent {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent()
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
        return PendingIntent.getActivity(
            this, requestCode, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun serviceIntent(action: String) =
        Intent(this, ConvoForegroundService::class.java).setAction(action)

    private fun openAppDirectly() {
        AstralConvoModule.emit("openApp")
        try {
            buildOpenAppPendingIntent(3).send()
        } catch (e: PendingIntent.CanceledException) { /* app not launchable — ignore */ }
    }

    // ── Floating bubble ─────────────────────────────────────────────────
    fun showBubble() {
        hideEssenceTab()
        if (bubbleView != null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !android.provider.Settings.canDrawOverlays(this)
        ) return // permission not granted — silently skip, JS already checked before calling

        val size = dp(48)
        val dot = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xFF0D1422.toInt())
                setStroke(dp(2), stateColor())
            }
        }
        val frame = FrameLayout(this).apply { addView(dot, FrameLayout.LayoutParams(size, size)) }
        bubbleView = frame

        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(14)
            y = dp(60)
        }
        // Single tap = same function as the in-app orb: bring Astral to the
        // foreground and pop the same "Stop the conversation?" confirmation.
        // Long-press = the extra menu (End convo without opening the app /
        // Remove Astral's essence), kept as a secondary, opt-in path.
        attachDragAndTap(
            frame,
            params,
            onTap = {
                AstralConvoModule.emit("bubblePress")
                openAppDirectly()
            },
            onLongPress = { showBubbleMenu(frame) }
        )
        windowManager?.addView(frame, params)
    }

    fun hideBubble() {
        bubbleView?.let { runCatching { windowManager?.removeView(it) } }
        bubbleView = null
    }

    fun refreshBubbleColor() {
        val dot = (bubbleView?.getChildAt(0)) ?: return
        (dot.background as? GradientDrawable)?.setStroke(dp(2), stateColor())
    }

    private fun stateColor(): Int = when (currentState) {
        "thinking" -> 0xFFA855F7.toInt()
        "speaking" -> 0xFFC026D3.toInt()
        else -> 0xFF00EAFF.toInt() // listening
    }

    private val longPressHandler = Handler(Looper.getMainLooper())

    /** Shared drag / tap / long-press touch handling for the bubble and the essence tab. */
    private fun attachDragAndTap(
        view: View,
        params: WindowManager.LayoutParams,
        onTap: () -> Unit,
        onLongPress: (() -> Unit)? = null
    ) {
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        var moved = false; var longPressed = false
        val longPressRunnable = Runnable {
            longPressed = true
            onLongPress?.invoke()
        }
        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX; downY = event.rawY
                    startX = params.x; startY = params.y
                    moved = false; longPressed = false
                    if (onLongPress != null) longPressHandler.postDelayed(longPressRunnable, 450)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (downX - event.rawX).toInt() // END gravity: moving left increases x
                    val dy = (event.rawY - downY).toInt()
                    if (kotlin.math.abs(dx) > 6 || kotlin.math.abs(dy) > 6) {
                        if (!moved) longPressHandler.removeCallbacks(longPressRunnable)
                        moved = true
                    }
                    params.x = startX + dx
                    params.y = startY + dy
                    runCatching { windowManager?.updateViewLayout(view, params) }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    longPressHandler.removeCallbacks(longPressRunnable)
                    if (!moved && !longPressed) onTap()
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    longPressHandler.removeCallbacks(longPressRunnable)
                    true
                }
                else -> false
            }
        }
    }

    // ── "Remove Astral's essence" — hides the full orb, leaves a small
    // reappear tab in the same corner, matching the web version's behavior.
    private fun hideEssenceTab() {
        essenceTabView?.let { runCatching { windowManager?.removeView(it) } }
        essenceTabView = null
    }

    private fun showEssenceTab() {
        hideBubble()
        if (essenceTabView != null) return

        val size = dp(22)
        val dot = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xFF090D18.toInt())
                setStroke(dp(1), 0xFF00EAFF.toInt())
            }
        }
        val frame = FrameLayout(this).apply { addView(dot, FrameLayout.LayoutParams(size, size)) }
        essenceTabView = frame

        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(18); y = dp(70)
        }
        attachDragAndTap(frame, params, onTap = { showBubble() })
        windowManager?.addView(frame, params)
    }

    // ── Bubble tap menu: Go to app / End convo / Remove Astral's essence ──
    // Hand-built PopupWindow instead of android.widget.PopupMenu — see the
    // class-level debug note for why.
    private fun showBubbleMenu(anchor: View) {
        dismissMenu()

        fun menuItem(label: String, action: () -> Unit): TextView =
            TextView(this).apply {
                text = label
                setTextColor(0xFFE8F4FF.toInt())
                setPadding(dp(16), dp(12), dp(16), dp(12))
                textSize = 14f
                setOnClickListener { dismissMenu(); action() }
            }

        val menu = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(0xFF0D1422.toInt())
                cornerRadius = dp(14).toFloat()
                setStroke(dp(1), 0x4D00EAFF.toInt())
            }
            addView(menuItem("Go to app") { openAppDirectly() })
            addView(menuItem("End convo") {
                AstralConvoModule.emit("endConvo")
                startService(serviceIntent(ACTION_END_CONVO))
            })
            addView(menuItem("Remove Astral's essence") { showEssenceTab() })
        }
        menuView = menu

        val type =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(14)
            y = dp(60) + dp(56) // just below the bubble
        }
        windowManager?.addView(menu, params)
        // Note: this menu only dismisses when an item is tapped or the bubble
        // is tapped again — there's no outside-tap-to-dismiss catcher. Adding
        // one would mean a full-screen transparent overlay intercepting all
        // touches, which is more invasive than this feature needs.
    }

    private fun dismissMenu() {
        menuView?.let { runCatching { windowManager?.removeView(it) } }
        menuView = null
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}

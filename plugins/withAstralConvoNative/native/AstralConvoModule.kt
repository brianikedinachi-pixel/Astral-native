package __PACKAGE__.convo

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class AstralConvoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        // Static ref so the Service/BroadcastReceiver (which aren't React
        // components) can still emit events back into JS.
        @Volatile
        var reactContextRef: ReactApplicationContext? = null

        fun emit(event: String, params: WritableMap? = null) {
            reactContextRef
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(event, params)
        }
    }

    init {
        reactContextRef = reactContext
    }

    override fun getName() = "AstralConvo"

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        val granted =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(reactApplicationContext)
            else true
        promise.resolve(granted)
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(reactApplicationContext)
        ) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactApplicationContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            // Can't synchronously know the result of a system settings screen —
            // JS should call hasOverlayPermission() again when the app resumes.
            promise.resolve(false)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun startForegroundService() {
        val intent = Intent(reactApplicationContext, ConvoForegroundService::class.java)
        intent.action = ConvoForegroundService.ACTION_START
        reactApplicationContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stopForegroundService() {
        val intent = Intent(reactApplicationContext, ConvoForegroundService::class.java)
        intent.action = ConvoForegroundService.ACTION_STOP
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun showBubble() {
        val intent = Intent(reactApplicationContext, ConvoForegroundService::class.java)
        intent.action = ConvoForegroundService.ACTION_SHOW_BUBBLE
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun hideBubble() {
        val intent = Intent(reactApplicationContext, ConvoForegroundService::class.java)
        intent.action = ConvoForegroundService.ACTION_HIDE_BUBBLE
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun setBubbleState(state: String) {
        ConvoForegroundService.currentState = state
        ConvoForegroundService.instance?.refreshBubbleColor()
    }
}

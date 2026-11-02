package expo.modules.ottocapture

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.lang.ref.WeakReference

/**
 * The app's side of lançamento automático: the listener's switch and queue, what was shared into
 * OTTO, and on-device reading of receipts.
 */
class OttoCaptureModule : Module() {
  companion object {
    private var instance: WeakReference<OttoCaptureModule>? = null

    /** Called by the listener: if the app is running, it refreshes its inbox now. */
    fun emit(id: String) {
      instance?.get()?.sendEvent("onCapture", mapOf("id" to id))
    }
  }

  private var shared: Map<String, Any?>? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("OttoCapture")
    Events("onCapture", "onShare")

    OnCreate {
      instance = WeakReference(this@OttoCaptureModule)
    }

    Function("isListenerEnabled") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    /** Straight to OTTO's own switch where the system allows it; to the list where it does not. */
    Function("openListenerSettings") {
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
            Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
            ComponentName(context, CaptureListener::class.java).flattenToString(),
          )
        } else {
          Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        }
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: Exception) {
        context.startActivity(
          Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
    }

    /** App info — where "Permitir configurações restritas" lives for an app installed outside the Play Store. */
    Function("openAppDetails") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    Function("setWatched") { packages: List<String> -> CaptureStore.setWatched(context, packages) }
    Function("setAnnounce") { on: Boolean -> CaptureStore.setAnnounce(context, on) }
    Function("announces") { CaptureStore.announce(context) }
    Function("pending") { CaptureStore.all(context) }
    Function("remove") { ids: List<String> -> CaptureStore.remove(context, ids) }

    /** What was shared into OTTO since the last call, once. */
    Function("takeShared") {
      appContext.currentActivity?.intent?.let { read(it) }
      val out = shared
      shared = null
      out
    }

    AsyncFunction("recognize") { uri: String, mime: String?, promise: Promise ->
      Recognizer.run(context, uri, mime, promise)
    }

    OnNewIntent { intent ->
      if (read(intent)) sendEvent("onShare", mapOf<String, Any?>())
    }
  }

  /**
   * A share (ACTION_SEND) into OTTO: text as it came, a file copied into the cache while the grant to
   * read it is still valid. The intent is then marked spent so returning to the app never re-reads it.
   */
  private fun read(intent: Intent): Boolean {
    if (intent.action != Intent.ACTION_SEND) return false
    val mime = intent.type
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)
    val stream: Uri? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
    var file: String? = null
    if (stream != null) {
      val ext = if (mime == "application/pdf") "pdf" else "img"
      val target = File(context.cacheDir, "share-${System.currentTimeMillis()}.$ext")
      context.contentResolver.openInputStream(stream)?.use { input ->
        target.outputStream().use { input.copyTo(it) }
      }
      file = Uri.fromFile(target).toString()
    }
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_STREAM)
    intent.removeExtra(Intent.EXTRA_TEXT)
    if (text == null && file == null) return false
    shared = mapOf("text" to text, "uri" to file, "mime" to mime)
    return true
  }
}

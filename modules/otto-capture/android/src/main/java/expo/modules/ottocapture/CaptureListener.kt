package expo.modules.ottocapture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Hears a bank app's notification, keeps it for the owner, and says so.
 *
 * Only packages on the watched list are read; everything else is ignored before its text is even
 * looked at. A notification with no R$ figure in it is not money and is dropped here. The full
 * reading — direction, merchant, category — happens in the app (`capture.ts`), which is the one
 * place it can be tested; this side only needs enough to say "R$ 45,90 detectado".
 */
class CaptureListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      val pkg = sbn.packageName ?: return
      if (pkg == packageName || !CaptureStore.watched(this).contains(pkg)) return
      val n = sbn.notification ?: return
      if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

      val extras = n.extras
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
      val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
      val all = "$title $text"
      val amount = AMOUNT.find(all)?.value ?: return
      if (SKIP.containsMatchIn(all)) return

      // Same words in the same minute are the same notification posted twice.
      val id = "$pkg:${(title + "|" + text).hashCode()}:${sbn.postTime / 60000}"
      val item = JSONObject()
        .put("id", id)
        .put("pkg", pkg)
        .put("title", title)
        .put("text", text)
        .put("postedAt", sbn.postTime)

      if (!CaptureStore.add(this, item)) return
      OttoCaptureModule.emit(id)
      if (CaptureStore.announce(this)) announce(this, id, amount, text.ifBlank { title }, INFLOW.containsMatchIn(all))
    } catch (_: Exception) {
      // A listener that throws is unbound by the system; one unreadable notification must not cost
      // the owner every capture after it.
    }
  }

  companion object {
    private const val CHANNEL = "otto.capture"
    private val AMOUNT = Regex("""R\$\s*-?\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?""")
    private val INFLOW = Regex("""(?i)(recebeu|recebid|dep[oó]sito|estorno|reembolso|devolu)""")
    private val SKIP = Regex("""(?i)(fatura\s+(?:fecha|fechou|fechada|vence)|limite|oferta|promo|pr[eé]-?aprovad|rendeu|rendimento|c[oó]digo|senha|token|vencimento)""")

    private fun announce(ctx: Context, id: String, amount: String, text: String, inflow: Boolean) {
      val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL, "Lançamentos detectados", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Quando o OTTO lê um gasto ou uma entrada nas notificações do seu banco."
            setShowBadge(true)
          }
        )
      }
      val open = link(ctx, "otto://capturas", id.hashCode())
      val confirm = link(ctx, "otto://capturas?confirm=${Uri.encode(id)}", id.hashCode() + 1)
      val icon = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
        .takeIf { it != 0 } ?: ctx.applicationInfo.icon
      val builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(ctx)
      val notification = builder
        .setSmallIcon(icon)
        .setColor(0xFFF2F4F7.toInt())
        .setContentTitle(if (inflow) "Entrada detectada: $amount" else "Gasto detectado: $amount")
        .setContentText(text.take(140))
        .setStyle(Notification.BigTextStyle().bigText(text.take(280)))
        .setContentIntent(open)
        .setAutoCancel(true)
        .addAction(Notification.Action.Builder(null, "Lançar", confirm).build())
        .addAction(Notification.Action.Builder(null, "Revisar", open).build())
        .build()
      manager.notify(id.hashCode(), notification)
    }

    private fun link(ctx: Context, uri: String, code: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}

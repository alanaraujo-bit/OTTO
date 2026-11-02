package expo.modules.ottocapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The queue of captures waiting for the owner, kept on the device.
 *
 * The listener runs whether or not OTTO is open, so what it hears has to be written somewhere the
 * app will find it later. Ids already decided (lançado or ignorado) are remembered for a while, so a
 * bank that re-posts the same notification never brings a decided purchase back.
 */
object CaptureStore {
  private const val PREFS = "otto.capture"
  private const val QUEUE = "queue"
  private const val DECIDED = "decided"
  private const val WATCHED = "watched"
  private const val ANNOUNCE = "announce"
  private const val MAX_QUEUE = 200
  private const val MAX_DECIDED = 500

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(ctx: Context, key: String): JSONArray =
    try { JSONArray(prefs(ctx).getString(key, "[]")) } catch (_: Exception) { JSONArray() }

  /** True when the item is new and was queued. */
  @Synchronized
  fun add(ctx: Context, item: JSONObject): Boolean {
    val id = item.getString("id")
    val queue = read(ctx, QUEUE)
    val decided = read(ctx, DECIDED)
    for (i in 0 until queue.length()) if (queue.getJSONObject(i).optString("id") == id) return false
    for (i in 0 until decided.length()) if (decided.optString(i) == id) return false
    queue.put(item)
    val trimmed = JSONArray()
    val from = maxOf(0, queue.length() - MAX_QUEUE)
    for (i in from until queue.length()) trimmed.put(queue.get(i))
    prefs(ctx).edit().putString(QUEUE, trimmed.toString()).apply()
    return true
  }

  fun all(ctx: Context): List<Map<String, Any?>> {
    val queue = read(ctx, QUEUE)
    return (0 until queue.length()).map { i ->
      val o = queue.getJSONObject(i)
      mapOf(
        "id" to o.optString("id"),
        "pkg" to o.optString("pkg"),
        "title" to o.optString("title"),
        "text" to o.optString("text"),
        "postedAt" to o.optLong("postedAt").toDouble(),
      )
    }
  }

  @Synchronized
  fun remove(ctx: Context, ids: List<String>) {
    val gone = ids.toSet()
    val queue = read(ctx, QUEUE)
    val kept = JSONArray()
    for (i in 0 until queue.length()) {
      val o = queue.getJSONObject(i)
      if (!gone.contains(o.optString("id"))) kept.put(o)
    }
    val decided = read(ctx, DECIDED)
    ids.forEach { decided.put(it) }
    val trimmedDecided = JSONArray()
    val from = maxOf(0, decided.length() - MAX_DECIDED)
    for (i in from until decided.length()) trimmedDecided.put(decided.get(i))
    prefs(ctx).edit().putString(QUEUE, kept.toString()).putString(DECIDED, trimmedDecided.toString()).apply()
  }

  fun watched(ctx: Context): Set<String> = prefs(ctx).getStringSet(WATCHED, null) ?: DEFAULT_WATCHED

  fun setWatched(ctx: Context, packages: List<String>) {
    prefs(ctx).edit().putStringSet(WATCHED, packages.toSet()).apply()
  }

  fun announce(ctx: Context): Boolean = prefs(ctx).getBoolean(ANNOUNCE, true)

  fun setAnnounce(ctx: Context, on: Boolean) {
    prefs(ctx).edit().putBoolean(ANNOUNCE, on).apply()
  }

  /** Used only until the app has told the listener its list (`BANK_APPS` in capture.ts). */
  private val DEFAULT_WATCHED = setOf(
    "com.nu.production", "com.itau", "br.com.intermedium", "com.c6bank.app", "com.bradesco",
    "com.santander.app", "br.com.bb.android", "br.com.gabba.Caixa", "com.picpay", "com.mercadopago.wallet",
  )
}

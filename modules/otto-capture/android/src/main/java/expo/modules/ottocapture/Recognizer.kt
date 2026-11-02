package expo.modules.ottocapture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import java.io.File

/**
 * Reads the words in a receipt — a print, a photo, the first pages of a PDF — on the device.
 *
 * ML Kit's bundled Latin model: no network, no cost per use, and the receipt never leaves the phone.
 * Only the text comes back; turning it into a lançamento is `readReceiptText` in the app.
 */
object Recognizer {
  fun run(ctx: Context, uri: String, mime: String?, promise: Promise) {
    try {
      val u = Uri.parse(uri)
      val pages = if (mime == "application/pdf" || uri.endsWith(".pdf", true)) pdf(u) else listOf(InputImage.fromFilePath(ctx, u))
      if (pages.isEmpty()) return promise.resolve("")
      val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val out = StringBuilder()
      fun next(i: Int) {
        if (i >= pages.size) {
          client.close()
          return promise.resolve(out.toString())
        }
        client.process(pages[i])
          .addOnSuccessListener { result ->
            out.append(result.text).append('\n')
            next(i + 1)
          }
          .addOnFailureListener { e ->
            client.close()
            promise.reject("ERR_RECOGNIZE", e.message ?: "Não foi possível ler a imagem.", e)
          }
      }
      next(0)
    } catch (e: Exception) {
      promise.reject("ERR_RECOGNIZE", e.message ?: "Não foi possível ler o arquivo.", e)
    }
  }

  /** Up to two pages, rendered at twice their size on white: comprovantes are short and small-print. */
  private fun pdf(uri: Uri): List<InputImage> {
    val file = File(uri.path ?: return emptyList())
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
      PdfRenderer(fd).use { renderer ->
        return (0 until minOf(2, renderer.pageCount)).map { i ->
          renderer.openPage(i).use { page ->
            val bitmap = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            InputImage.fromBitmap(bitmap, 0)
          }
        }
      }
    }
  }
}

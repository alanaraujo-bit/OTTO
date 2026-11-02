import { router } from 'expo-router';
import { OttoCapture } from '../../modules/otto-capture';
import { readBankText, readReceiptText } from '@/domain/capture';
import { captureId, useCapture } from '@/state/capture';

/**
 * Something was shared into OTTO — the text of a comprovante, a print, a PDF.
 *
 * A file is read on the device (`recognize`, ML Kit) and its words are treated like any receipt; a
 * bare text is tried first as a bank notification and then as a receipt. What reads lands in
 * Detectados, ready to confirm. What does not opens the keypad, so a share is never a dead end.
 */
export async function readShare(): Promise<void> {
  const shared = OttoCapture?.takeShared();
  if (!shared) return;
  let text = shared.text ?? '';
  try {
    if (shared.uri && OttoCapture) text = `${text}\n${await OttoCapture.recognize(shared.uri, shared.mime)}`;
  } catch {
    // An unreadable image still leaves whatever text came with it.
  }
  const id = captureId('share');
  const d =
    readBankText({ id, source: 'share', bank: null, text, at: new Date().toISOString() }) ?? readReceiptText(text, id);
  if (d) {
    useCapture.getState().add(d);
    router.push('/capturas');
  } else {
    router.push({ pathname: '/lancar', params: { title: 'Comprovante' } });
  }
}

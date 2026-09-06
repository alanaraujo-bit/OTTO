import { ApiError, OfflineError } from './api';

/**
 * One sentence, in the app's voice, for anything that went wrong.
 *
 * Every screen used to do `e instanceof Error ? e.message : '…'`, which reads as careful and is not:
 * the messages that actually reach a phone are written by Android's HTTP stack, not by this project.
 * "Network request failed" is not something anyone should be shown by an app about their own money —
 * it names a layer the owner has no relationship with, and it does not say what to do.
 *
 * Three rules hold everything below together:
 *
 *  1. **Say what happened to them, not what happened to us.** A 401 is not "unauthorized", it is
 *     "sua sessão expirou".
 *  2. **Never claim a write failed unless it did.** A dropped connection says nothing about whether
 *     the server committed — see `OfflineError`. So its wording asks the owner to look rather than
 *     asserting a loss, because asserting one is how somebody ends up recording the same money
 *     twice.
 *  3. **No apologies and no jargon.** One line, lowercase-plain, ending in something actionable
 *     wherever there is an action.
 */
export function saidPlainly(e: unknown): string {
  if (e instanceof OfflineError) {
    return 'Sem resposta do servidor. Verifique antes de lançar de novo.';
  }
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return 'Sua sessão expirou. Entre de novo.';
    if (e.status === 0) return 'Este build não está apontando para o servidor.';
    if (e.status >= 500) return 'O servidor tropeçou. Tente de novo em instantes.';
    // A 4xx carries the server's own words, which are written in this app's voice by design.
    return e.message;
  }
  return 'Algo não saiu como devia.';
}

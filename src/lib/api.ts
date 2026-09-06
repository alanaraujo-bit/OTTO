import { useSession } from './auth/session';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

/**
 * How long a single attempt may take before it is treated as lost.
 *
 * Explicit, because without it the client inherits whatever the platform's HTTP stack decides —
 * which on Android is generous and silent. A request that will never answer should say so while the
 * owner is still looking at the screen, not two minutes later.
 */
const TIMEOUT_MS = 12_000;

/** The server answered, and said no. `status` is its answer. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * The server never answered — or answered somewhere the phone could not hear.
 *
 * Kept apart from `ApiError` because the two demand opposite things. A rejected request is a fact
 * about the request: it did not happen, and saying so is honest. A dropped one is a fact about the
 * *connection*, and it says nothing at all about whether the write landed — the request may well
 * have been received, executed and committed, with only the answer lost on the way back. Anything
 * that reports "não salvou" on one of these is guessing, and the guess is usually wrong.
 */
export class OfflineError extends Error {
  constructor(readonly where: string) {
    super('Sem resposta do servidor.');
  }
}

function url(path: string) {
  if (!baseUrl) throw new ApiError('A API do OTTO não está configurada neste build.', 0);
  return `${baseUrl}${path}`;
}

export async function api<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const token = useSession.getState().session?.accessToken;
  const method = init.method ?? 'GET';

  let response: Response;
  try {
    response = await fetch(url(path), {
      ...init,
      // Bounded rather than open-ended, and abortable, so a stalled request ends as a decision
      // instead of as a hang.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(authenticated && token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // Every transport failure looks the same here on purpose. `Network request failed`, a timeout
    // and a reset socket are one situation as far as the owner is concerned, and the platform's
    // wording for them is not something anyone should have to read.
    throw new OfflineError(`${method} ${path}`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A body that will not parse on an otherwise fine response is not worth failing over: the
    // status already carried the verdict. On a 2xx this leaves `payload` null and the caller gets
    // what the server would have sent if it had sent nothing.
    if (!response.ok) throw new ApiError('O servidor respondeu de um jeito que não entendi.', response.status);
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'Não foi possível comunicar com o servidor.';
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

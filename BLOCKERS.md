# BLOCKERS

Items that need Alan. None of these stop other work — the affected part is stubbed behind an
interface and the rest continues.

## B1 — Google OAuth client ID  (Fase 1, non-blocking)
**Status:** open
**Needed:** an OAuth 2.0 Web + Android client ID from Google Cloud Console for the package
`com.alanaraujo.otto`, plus the SHA-1 of the signing key.
**Meanwhile:** the Google button is fully built and wired to `expo-auth-session`; it currently calls
the auth provider stub, which completes a local session. Dropping the client ID into
`src/lib/auth/config.ts` activates the real flow with no UI change.

## B2 — Apple Sign In on Android  (Fase 1, informational)
**Status:** open by design
**Fact:** Apple Sign In has no Android SDK. On Android it can only run as a web OAuth flow, which
requires an Apple Developer Program membership (paid) and a Services ID.
**Decision:** the button is built to spec and present, as requested. Without B2 it surfaces an
explanatory snackbar instead of failing silently. Since OTTO ships only to Android for its single
owner, this is expected to stay open.

## B3 — Real push notifications  (Fase 8)
**Status:** open, has a local workaround
**Fact:** Expo Go on Android dropped remote push in SDK 53, and Expo Go's fixed manifest cannot
declare `SCHEDULE_EXACT_ALARM` or a boot receiver — so schedules would not survive a reboot.
**Meanwhile:** the Android SDK and JDK 17 are both installed on this machine, so
`npx expo run:android` can produce a real dev build locally when Fase 8 starts. No account or
credential needed. The notification layer is written against one interface with two implementations
from day one.

## B4 — Android emulator has no hardware acceleration  (verification, non-blocking)
**Status:** open, needs one elevated command
**Fact:** `emulator -accel-check` reports the Android Emulator hypervisor driver (AEHD) is not
installed. The driver package was downloaded to
`C:\Android\sdk\extras\google\Android_Emulator_Hypervisor_Driver`, but `silent_install.bat` needs an
Administrator prompt, which this session cannot raise. Virtualization is enabled in firmware, so the
install should succeed.
**What to run (as Administrator, once):**
```
cd C:\Android\sdk\extras\google\Android_Emulator_Hypervisor_Driver
silent_install.bat
```
**Impact meanwhile:** screenshots come from the react-native-web render (same component tree, same
tokens, same layout logic) plus the real handset over Expo Go. Native-only truth — 120Hz frame
pacing, haptics, the actual curved-panel rim light, real font-scale behaviour — is verified on the
handset, not in a browser.

---

## Nota sobre B4 — por que ele passou a ser prioritário
Dois defeitos chegaram ao aparelho porque a verificação era só web, e web não carrega módulo nativo:
o ABI do worklets (B-fix 10) e o alpha descartado no gradiente SVG (B-fix 11). Ambos passavam limpos
em screenshot de navegador. Resolver o B4 (uma execução elevada, uma vez) habilita captura real via
`adb exec-out screencap`, que fecha essa classe inteira de erro.
Até lá, valem as guardas estáticas: `tools/native-check.mjs` e `tools/svg-guard.mjs`.

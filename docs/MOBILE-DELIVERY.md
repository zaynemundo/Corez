# CoreZ Mobile — delivery summary

Status as of 2026-11-08. The Android client, the Worker auth changes and the
shared package are complete, tested and pushed. One Phase 0 check — the
signed-in device spike — is still waiting for an authorized phone.

## What is delivered

| Area | Location | State |
|---|---|---|
| Android client (Expo SDK 58 / RN 0.88 / Expo Router) | `mobile/` | Built, tested, released as an installable APK |
| Native bearer auth on the Cloudflare Worker | `worker/auth.js` (+ tests) | Deployed; live login/refresh endpoints answer correctly |
| Shared logic (intent, model, skills, user facts, i18n, PDF/ZIP bytes) | `packages/corez-shared` | Web and mobile import the same modules |
| Android App Links | `worker/index.js`, `wrangler.jsonc`, `mobile/app.json` | Live and verified on Android 16 (state `1024`) |
| Release APK | `mobile/build-artifacts/app-release.apk` | 98.18 MB, V2 debug-certificate signed |
| Build automation | `scripts/mobile/build-apk-windows.ps1` | Validated from a clean directory (641/641 tasks, 12m58s) |
| Device spike helper | `scripts/mobile/verify-device-spike.ps1` | Install stage exercised on the emulator |

### Mobile features

- Auth: login/signup/settings, bearer token in Android Keystore, refresh.
- Chat: conversation list/history (rename, pin, delete), streamed answers with
  thinking panel and Stop, markdown (headings, lists, code, tables, links,
  images), image fullscreen viewer (share, copy link), offline chat cache.
- Input: camera/gallery/file attachments, voice dictation via `/api/transcribe`,
  bilingual English/Arabic UI.
- Creation: canvas WebView preview for complete HTML/canvas artifacts, copy and
  native share/save, publish to a public link, Sites screen (open/share/copy/
  unpublish), per-site analytics (7/30/90 days).
- Documents: generated PDF/ZIP/Office links download to the device and open the
  native share sheet.
- Sharing: share a conversation as a frozen public link; read-only viewer on
  `/share/chat/<token>`.
- Images: native image studio (`POST /api/image`) with styles, preview, history,
  save/share for both R2 URLs and inline data URLs.
- Links: `corez://` scheme plus verified `https://corez.pro` App Links for
  `/chat`, `/sites` and `/share/chat`.

## Verification evidence

- Mobile: **121 Jest tests**, TypeScript and ESLint clean, Hermes Android export
  passes (`npx expo export --platform android`).
- Web/Worker/shared: **196 test files / 2161 tests**, root lint and production
  build pass.
- Release APK installed and launched on a Pixel 7 / **Android 16 (API 36)**
  emulator: `MainActivity` resumed, login screen rendered, wrong credentials
  produced the production API's `Invalid email or password`, and `corez://`
  links reopened the app.
- App Links: the live `/.well-known/assetlinks.json` returns the signing
  fingerprint; Android reports `corez.pro: 1024` (verified) and
  `https://corez.pro/chat/...` resolves to `pro.corez.app/.MainActivity`.
- Shared viewer: `corez://share/chat/<token>` renders the public viewer without
  a session and reports revoked/unknown tokens honestly.
- Clean-path build: `build-apk-windows.ps1 -Variant release -Destination
  C:\czbuild-fresh` produced the APK from an empty directory with no manual
  steps.

## Install

1. Copy `mobile/build-artifacts/app-release.apk` to the phone.
2. Allow "install unknown apps" for the file manager/browser.
3. Install (Android may warn about the debug certificate — expected for this
   internal test build).

## Known gaps / next steps

1. **Signed-in Phase 0 spike** — login → streaming → Stop → relaunch session
   survival → sign-out. Needs an authorized USB device with adb access and the
   user's account (or permission to create a test account). Use
   `scripts/mobile/verify-device-spike.ps1` stages `install`, `chat`,
   `relaunch`, `signout`.
2. **Production signing** — replace the debug certificate with a release
   keystore and a gitignored `android/keystore.properties`; update
   `ANDROID_APP_SHA256` on the Worker to the new fingerprint.
3. **Push notifications** — needs a Firebase project / `google-services.json`
   and the corresponding Worker push path.
4. Canvas limitations: the web's multi-page document splitting and React/JSX
   compilation are not ported; artifacts preview as their raw first document.
5. Dictation transcribes after recording (no live partial transcript), and PDF
   text extraction for attachments is not ported.

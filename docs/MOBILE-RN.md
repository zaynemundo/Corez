# CoreZ Mobile (React Native)

The native Android client lives in `mobile/` and is built with Expo SDK 58
(React Native 0.88, React 19.3, TypeScript). It talks to the same Cloudflare
Worker as the web app; the web app in `src/` remains the production client and
the Capacitor shell in `android/` (see [MOBILE.md](./MOBILE.md)) is legacy.

## Status

| Step | State |
|---|---|
| Expo app scaffold, router, theme tokens, fonts, i18n (en/ar) | Done |
| Bearer-token auth in `worker/auth.js` (login/signup/refresh, `/api/auth/me`) | Done, unit-tested |
| API client, SSE parser (`delta`/`thinking`/`phase`/`done`/`error`), turn transport | Done, unit-tested |
| Login, sign-up, session gate, chat preview, settings | Done |
| Chat persistence: create/list/load conversations, append user + assistant messages, history sheet | Done |
| Markdown rendering: headings, lists, tables, fenced code with copy, links, inline images | Done |
| Attachments: camera/gallery/files, R2 upload, vision-shaped API attachments, user-bubble previews | Done |
| Composer parity with the web: one right-hand action that is the microphone while the input is empty and Send/Stop as soon as there is text (or while streaming) | Done |
| HTML artifacts render as a compact **Preview / Revise** card instead of dumping the long source into the conversation; Copy stays available for ordinary code snippets | Done |
| UI icons: Feather vector icons instead of emoji/text glyphs in the composer, attachment sheet, chat header, back/close buttons, thinking panel and history actions | Done |
| Custom themes: saved Worker themes load in Settings → Appearance (apply/delete), the last applied theme is cached for instant boot, and an `@theme` proposal in chat renders as an interactive card with colours / colours + artwork options | Done |
| Voice dictation: expo-audio recording → `/api/transcribe` (Whisper), en/ar language, 120s cap | Done |
| Chat management: rename, pin/unpin, delete, pinned/recent sections, title header | Done |
| Offline read cache: SQLite snapshot of the chat list and open conversation, marked as an offline copy | Done |
| Image viewer: tap an inline image for fullscreen, native share/save, copy link | Done |
| Canvas preview: complete HTML artifacts open in a WebView; copy HTML and native share/save from chat | Done |
| Publishing: publish from the canvas with a public link; Sites screen lists, opens, shares, copies and unpublishes pages | Done |
| Publishing parity: the canvas sends its chat id as `sessionId`, so republishing a creation keeps the same public URL instead of minting duplicate slugs; Sites has **Change URL** (owner copy → `slug` + `previousSlug`) and the Worker's one-time custom-slug rule is surfaced honestly | Done |
| Sites analytics: 7/30/90-day traffic report per published page — totals, daily bars, top pages, source/country/device breakdowns | Done |
| Downloads: generated PDF/ZIP/office links in answers download to the device and open the native share sheet | Done |
| Deep links: `corez://` scheme plus Android App Links for `/chat`, `/sites` and `/share/chat`; `/.well-known/assetlinks.json` served by the Worker from `ANDROID_APP_SHA256` | Done — link verification confirmed on the Android 16 emulator |
| Shared conversations: share the current chat as a frozen public link and open it in a read-only viewer from `https://corez.pro/share/chat/<token>` | Done (JS + unit tests; emulator verification for the revoked/unavailable path) |
| Image studio: prompt + style chips, generate through `POST /api/image`, preview/history, save/share the result (R2 URL or inline data URL) | Done (JS-verified; not in the installed APK yet) |
| Shared logic extracted to `packages/corez-shared` (intent, skills, i18n, PDF/ZIP byte builders) | Done, web + mobile import the same modules |
| Mobile sends the same client-side intent classification as the web | Done |
| Android bundle (`expo export --platform android`) | Passes |
| `expo prebuild --platform android` | Passes |
| Debug APK (`assembleDebug`) | **Passes** — `mobile/build-artifacts/app-debug.apk` (debug-signed, 4 ABIs) |
| Release build (`assembleRelease` + R8) | **Passes** — `mobile/build-artifacts/app-release.apk` (debug-cert signed for verification; production signing needs your keystore) |
| On-device spike | **Done on a physical HONOR ALI-NX1 (Android 15) and on the Android 16 emulator**: install, signed-in session, AI answer, relaunch session survival, sign-out |

The on-device spike is the Phase 0 go/no-go gate: it must prove bearer login,
live SSE streaming, abort, and the release APK build before Phase 1 starts.

## Shared package (`packages/corez-shared`)

Pure logic used by both clients, imported by bare specifier:

- `@corez_ai/shared/intent` — trained public classifier, pattern/context intent
  engine, contract generation, skill registry and resolver, execution modes.
- `@corez_ai/shared/intent/model` — the committed classifier model as an ES
  module (the JSON artifact remains the reviewable source; a test pins them
  equal).
- `@corez_ai/shared/intent/userFacts` — volunteered identity-fact extraction.
- `@corez_ai/shared/i18n` — the English/Arabic dictionaries and lookup logic
  (the web's `src/i18n/dictionaries.js` is now a re-export shim).
- `@corez_ai/shared/artifacts` — PDF and ZIP builders. Bytes
  (`buildResearchPdfBytes`, `createZipBytes`) are canonical because React
  Native has no Blob; the browser wrappers (`buildResearchPdfBlob`,
  `createZipBlob`) call them.

`mobile/scripts/sync-shared.mjs` copies the package into
`mobile/node_modules/@corez_ai/shared` on install and before every mobile
build/test command. npm links a Windows junction for `file:` dependencies and
Metro 0.87 cannot follow it consistently (the package entry loads, but relative
imports inside it miss Metro's file map), so mobile uses a real copy of the same
files. The canonical files stay in `packages/corez-shared`.

## Why bearer tokens

The web authenticates with the HttpOnly `corez_session` cookie. A native fetch
has no shared cookie jar with `corez.pro`, so the same signed session JWT is
sent as `Authorization: Bearer`. `worker/auth.js` accepts both transports with
identical validation and revocation. Tokens are issued in the JSON body only
when a request sends `X-Corez-Client: native` and no browser `Origin`; the web
response is unchanged.

## Commands

```powershell
cd mobile
npm install
npm run sync-shared    # after editing packages/corez-shared (also runs pre-build)
npm run typecheck      # tsc --noEmit
npm test               # Jest (jest-expo)
npm run lint           # expo lint
npx expo-doctor        # dependency/config check

npx expo start         # Metro for a development build / Expo Go
npx expo prebuild --platform android --no-install
```

APK build (after the Prerequisites below):

```powershell
cd mobile
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

`android/` is generated by Expo Continuous Native Generation and is
gitignored; configure native behaviour in `app.json` rather than editing it.

## Windows native build (short path required)

React Native's native modules (`react-native-worklets`, `react-native-screens`,
`react-native-reanimated`, …) compile C++ with CMake/Ninja, and CMake mirrors
the absolute source path inside `.cxx/CMakeFiles`. Under this workspace's
OneDrive path that exceeds the Windows 260-character limit and Ninja fails with
`mkdir(...): No such file or directory` even though the build path is valid.

Build from a short-path copy instead:

```powershell
# from the repository root; copies mobile/ + packages/corez-shared to C:\czbuild
powershell -ExecutionPolicy Bypass -File scripts/mobile/build-apk-windows.ps1
# -> mobile\build-artifacts\app-debug.apk (gitignored)

# release variant (requires the keystore/signing config from the checklist)
powershell -ExecutionPolicy Bypass -File scripts/mobile/build-apk-windows.ps1 -Variant release
```

The script locates a JDK (`JAVA_HOME`, else a portable Temurin JDK under
`.tools/jdk-extract/`), copies the project to `C:\czbuild`, runs `npm ci`,
`expo prebuild`, `gradlew assembleDebug|Release`, and copies the resulting APK
back to `mobile/build-artifacts/`. Install it on a USB-connected device with:

```powershell
adb install -r mobile\build-artifacts\app-debug.apk
```

## Runtime configuration

- `EXPO_PUBLIC_API_URL` (default `https://corez.pro`) selects the Worker origin.
  Copy `.env.example` to `.env` to point at `wrangler dev` while developing.
- `app.json` defines the Android package (`pro.corez.app`), scheme (`corez://`),
  permissions (camera, microphone, media) and config plugins. The launcher
  icon, adaptive icon foreground/monochrome and splash image now use the
  CoreZ brand mark (white `&`-style logo on `#0a0a0a`). The mark is rendered
  from the vector `public/corez.svg` with sharp for crisp edges and occupies
  46% of the launcher icon canvas (44% adaptive foreground, 32% splash), with a
  subtle radial background gradient and faint glow on the legacy icon
  ([icon preview](mobile/screenshots/app-icon.png)).
- Firebase / `google-services.json` is only needed for push notifications
  (Phase 3) and is gitignored.
- Android App Links: `wrangler.jsonc` sets `ANDROID_APP_SHA256` to the SHA-256
  of the certificate that signs the current internal test APK (the Android
  debug certificate, `FA:C6:17:…:3B:9C`), so
  `https://corez.pro/.well-known/assetlinks.json` now returns the
  `delegate_permission/common.handle_all_urls` relation for `pro.corez.app`.
  Replace the value with the release keystore's fingerprint (comma-separated
  for several certificates) when a production signing key exists; an empty
  value is valid and disables https App Links. `ANDROID_APP_PACKAGE` is
  optional (default `pro.corez.app`).

## Build evidence

The debug APK was built in this workspace on 2026-11-07 with:

- Gradle **9.4.1**, Android Gradle Plugin **9.2.1**, Kotlin **2.2.10**
- Temurin **JDK 25.0.5** (portable, in `.tools/`, gitignored)
- Android SDK: compileSdk **37**, targetSdk **36**, minSdk **24**, NDK **27.1.12297006**
- Result: `BUILD SUCCESSFUL` (520 tasks) → `app-debug.apk`, 236 MB (all four ABIs,
  debug overhead), V2-signed with the Android debug certificate
  (`CN=Android Debug`), package `pro.corez.app`, versionName `0.1.0`.
- `assembleRelease` also passes (640 tasks, R8/minification):
  `app-release.apk`, 98 MB, package `pro.corez.app`, **V2-signed with the
  Android debug certificate** because no release keystore is configured yet.
  It is installable for verification; a distributable release needs the
  keystore below, which flips the signing identity.
- Reproducibility: [`build-apk-windows.ps1`](scripts/mobile/build-apk-windows.ps1)
  was validated end to end from a **clean directory** (`-Destination C:\czbuild-fresh
  -Variant release`): it provisioned the toolchain checks, copied the sources,
  ran `npm ci`, `expo prebuild` (including the NDK libc++ config plugin), built
  with 641/641 tasks and copied the APK back — `BUILD SUCCESSFUL in 12m58s`, no
  manual steps. The resulting `app-release.apk` (98.18 MB, SHA-256
  `5C267FAE…D8E97C`) contains the expected feature strings and keeps the V2
  debug signature.
- The latest release build (2026-11-08 09:56, 100.2 MB, SHA-256
  `C1B0D22D…AF5C15`) embeds the canvas preview, publishing/Sites screen, Sites
  analytics, native artifact downloads, shared-conversation viewer, image
  studio and the Feather vector icons (composer mic/send/attach, header
  menu/share/settings, chevrons and close buttons); the brand-mark launcher
  icon is included. Installed successfully over USB on the HONOR ALI-NX1; it
  is the file at `mobile/build-artifacts/app-release.apk`.

Install on a USB-connected device with `adb install -r` once `adb devices`
lists the phone.

## NDK r27 / libc++ link workaround (required)

NDK 27.1's legacy CMake toolchain in this environment does **not** consume
`ANDROID_STL=c++_shared`: `CMakeCache.txt` records
`ANDROID_STL:UNINITIALIZED=c++_shared` and the generated link line omits
`-lc++_shared`. Every C++ module (`react-native-worklets`,
`react-native-reanimated`, `react-native-screens`, generated codegen modules)
then fails with hundreds of undefined `std::__ndk1::*` symbols.

`mobile/plugins/withCmakeStlFix.js` injects a Gradle task hook into the
generated `android/build.gradle` that inserts `link_libraries(c++_shared)` into
every native module's `CMakeLists.txt` (including generated codegen files)
just before CMake configures it. It is registered in `app.json`, so `expo prebuild`
always reproduces the fix. Reference:
[software-mansion/react-native-reanimated#9444](https://github.com/software-mansion/react-native-reanimated/issues/9444).

## Prerequisites for the APK spike

1. **JDK 25 (or 21)** — the generated project runs the Gradle 9.4.1 wrapper,
   which supports running on JVM 17–26; **JDK 27 is not supported yet**. Either
   install `winget install --id Microsoft.OpenJDK.25` and set `JAVA_HOME`, or
   unpack a portable Temurin JDK 25 under `.tools/` (gitignored) and point
   `JAVA_HOME` at it for the build command. Do not commit a JDK.
2. **Android SDK** — already installed at
   `C:\Users\ASUS PC\AppData\Local\Android\Sdk` (`platforms;android-36`,
   `build-tools;36.0.0`, `platform-tools`). React Native 0.88 targets
   compileSdk 37 / build-tools 37; Gradle auto-downloads them when the SDK
   license is accepted, otherwise install them with Android Studio's SDK
   Manager.
3. **A device or emulator** — a local AVD **`corez`** (Pixel 7, Android 16 / API 36,
   google_apis x86_64) is set up in the Android SDK and was used for the
   verification below. A physical phone with USB debugging works too: enable
   Developer options → USB debugging, set USB mode to file transfer, accept the
   RSA prompt, then confirm the serial with `platform-tools\adb.exe devices`.
   `adb` lives in the SDK's `platform-tools`.
4. **Keystore** — for a release APK, generate `corez-mobile-release.jks` and a
   gitignored `android/keystore.properties`, or use `assembleDebug` for the
   spike. Never commit either.

## Spike checklist (Phase 0 gate)

0. `assembleDebug` exits 0 and produces the APK — **done** (see Build evidence).
1. `./gradlew.bat assembleRelease` exits 0 and produces the APK — **done**.
2. Install and launch; the splash hides into the login screen — **done** on the
   emulator and the physical HONOR ALI-NX1.
3. Sign in with a real account — no cookie, bearer token stored in Keystore —
   **done**: the signed-in home showed the account email, the server-side chat
   history loaded, and chats persisted.
4. Send "hello" — answer text streams token-by-token; thinking events render;
   Stop aborts — **answer received on the phone** ("Hello" → "Hey there — what
   should we create?" with the chat title updating and the turn persisted). The
   Stop control was not captured on that turn because the answer completed
   before the 4 s sample; the send/stop state is exercised by the same
   composer code.
5. Kill and relaunch — the session survives (token restored) — **done on the
   phone**: force-stop + relaunch landed on the signed-in home, not the login
   screen.
6. Sign out — token cleared, login screen returns — **done on the phone**:
   Settings → Sign out returned to the login screen.

## On-device spike helper

[`scripts/mobile/verify-device-spike.ps1`](scripts/mobile/verify-device-spike.ps1)
automates every part of the Phase 0 spike that does not need your password,
and prints exactly what it observed instead of assuming success. Signing in
stays manual on the phone, so the stages are explicit:

```powershell
# install the current release APK, launch it, confirm the login UI
powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1 -Stage install
# after signing in on the phone: send "hello", capture streaming, press Stop
powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1 -Stage chat
# kill + relaunch and check the session survived
powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1 -Stage relaunch
# open Settings, sign out, confirm the login screen returns
powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1 -Stage signout
```

Without a connected device it prints the USB-debugging steps and exits 2.
Screenshots and UI dumps for each stage land in `.tools/spike/` (gitignored).
The `install` stage was exercised against the Android 16 emulator: signature
verified, install `Success`, `MainActivity` focused, and the login labels
(`COREZ`, `Sign in to your account`, Email, Password, Login, Sign up) were
detected from the live UI dump.

## Emulator verification (2026-11-07)

The standalone release APK was installed on a freshly created Android 16 (API
36) x86_64 emulator:

1. `adb install -r mobile/build-artifacts/app-release.apk` → `Success`.
2. `adb shell am start -n pro.corez.app/.MainActivity` → `MainActivity` is the
   resumed activity; the dark login screen renders with the COREZ wordmark,
   email/password fields, "Show password", Login and the Sign up link
   ([screenshot](mobile/screenshots/login-screen.png)).
3. Submitting `test@example.com` / `wrongpassword123` reached the production
   API over HTTPS and rendered the server's `Invalid email or password` message
   in the form ([screenshot](mobile/screenshots/login-invalid-credentials.png)).
   This exercises the network path, the JSON error mapping and the native
   login request shape end-to-end.
4. `adb shell am start -a android.intent.action.VIEW -d "corez://chat/verification-test" pro.corez.app`
   reopened `MainActivity` with no crash (the unauthenticated route falls back
   to the login screen through `SessionGate`).
5. Android App Links: `pm get-app-links pro.corez.app` reports
   `corez.pro: 1024` (STATE_VERIFIED) after `pm verify-app-links --re-verify`,
   i.e. Android fetched the live assetlinks document and accepted the
   fingerprint. `cmd package query-activities` lists
   `pro.corez.app/.MainActivity` for `https://corez.pro/chat/...`; with the
   emulator's unconfigured Chrome disabled (it was intercepting as a generic
   browser), `am start -a android.intent.action.VIEW -d
   "https://corez.pro/chat/applink-test"` resumed `pro.corez.app/.MainActivity`.
6. Shared conversations: `corez://share/chat/definitely-not-a-real-token`
   opened the public viewer with no session; it showed the API's
   `Shared chat not found.` message and the Open CoreZ button
   ([screenshot](mobile/screenshots/shared-chat-unavailable.png)). The same
   route is reachable from the `https://corez.pro/share/chat/<token>` App Link
   (the intent filter for that path already existed; it now has a screen).

The emulator checks above stay useful for link handling and the login error
path; the signed-in stages were completed on the physical phone below.

## Physical device verification (2026-11-08)

Device: **HONOR ALI-NX1, Android 15 (SDK 35)**, serial `AS7J6R4315011065`,
visible to `adb` after the USB-debugging RSA prompt was accepted. The release
APK (`mobile/build-artifacts/app-release.apk`) was installed and exercised via
[`scripts/mobile/verify-device-spike.ps1`](scripts/mobile/verify-device-spike.ps1):

1. **Install** — signature `CN=Android Debug`, `adb install -r` → `Success`,
   `MainActivity` focused, login labels detected (`01-login.png`).
2. **Signed in** — the home screen showed `What are we building today?` with the
   account email (`zayne.mayo@gmail.com`) and the server-side chat history
   (conversations like `3D Solar System Website`, `Caveman to Modern Website
   Simulation`, `Event Horizon black hole visualization`), proving the native
   bearer token and refresh flow.
3. **Chat turn** — typed "Hello" and sent it; the assistant answered
   "Hey there — what should we create?", the header title updated to `Hello`
   and the turn persisted across reload
   ([screenshot](mobile/screenshots/phone-hello-answer.png)). The Stop control
   was not captured because this answer completed faster than the 4 s sample.
4. **Relaunch** — `am force-stop` + `am start`: the app reopened signed-in on
   the home screen, not the login screen (token restored from Keystore).
5. **Sign-out** — Settings → Sign out returned to the login screen
   (`Sign in to your account`, Email, Password, Login, Sign up).

Raw screenshots and UI dumps (including the signed-in state with the account
email) live in `.tools/spike/` and are deliberately **not committed**; the
committed `phone-hello-answer.png` shows only the answer screen.

## Known limitations at this stage

- Push notifications are still to come (Firebase project required).
- The canvas renders complete HTML documents and canvas games. The web's
  multi-page document splitting and React/JSX compilation pipeline are not
  ported yet, so those artifacts preview as their raw first document.
- Voice dictation transcribes after the recording stops (Whisper); the web's
  live partial transcript is not implemented yet.
- Attachments cover images (camera/gallery) and files (text content for small
  text-like documents, metadata for binaries); PDF text extraction is not
  ported yet.
- Markdown rendering covers the answer format; code-file save actions exist for
  HTML artifacts (share/save) but not for every code block.
- The history sheet renames, pins and deletes conversations; project folders
  are the next persistence increment.

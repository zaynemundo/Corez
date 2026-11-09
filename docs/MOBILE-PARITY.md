# Mobile ↔ Web parity audit

CoreZ native (Android now, iOS configured) is the same React Native app in
`mobile/`. The mobile UI intentionally stays the native design built in this
session; this document tracks **feature parity with corez.pro**, not visual
parity.

Status: ✅ same behaviour · ⚠️ partial · ❌ not ported yet

| Area | Web (corez.pro) | Mobile | Status |
| --- | --- | --- | --- |
| Auth | login, signup, forgot/reset, consent, legal links | login, signup, forgot + consent; reset link continues on web | ⚠️ |
| Session | cookie → bearer token, refresh | bearer + SecureStore refresh | ✅ |
| Chat | streaming answers, thinking trace, stop | same | ✅ |
| Chat commands | `@website`, `@game`, `@research`, `@image`, `@theme` | `@` suggestion menu; website/game go to the AI, image uses the provider fallback, theme calls the proposal pipeline | ⚠️ research report pipeline not ported |
| Conversation mode | two personas, mentions, alternating replies | same, speaker avatars + @mention targeting | ✅ |
| Custom themes | propose/apply/list/delete, artwork backgrounds | same (list/delete/apply, wallpaper + translucent surfaces) | ✅ |
| Shared conversations | public viewer, read-only theme proposals | same, cards now read-only in the public viewer | ✅ |
| Attachments | camera, gallery, files, URL context | camera, gallery, files (text-like extraction); no PDF text extraction, URL context not ported | ⚠️ |
| Dictation | live partial transcript → whisper | record then transcribe (no live partial) | ⚠️ |
| Markdown | headings, lists, bold, tables, links, images, code | same + inline markdown inside lists | ✅ |
| Canvas | full HTML preview, revise, publish | same | ✅ |
| Publish | single + multi-page sites, badge policy, change URL, unpublish | single-page publish, change URL, unpublish; multi-page publish not ported | ⚠️ |
| React/JSX artifacts | transpiled preview | raw first document | ❌ |
| Research reports | sourced report + PDF export | normal answer (no sourced pipeline / PDF) | ❌ |
| Artifact downloads | PDF/ZIP/office sharing | HTML/code share + asset share; office converters not ported | ⚠️ |
| Chat history | pinned, rename, delete, offline cache | same; projects/folders and search not ported | ⚠️ |
| Sites | open, copy, share, stats, change URL, unpublish, edit-in-chat | all except edit-in-chat | ⚠️ |
| Analytics | site analytics panel | same panel | ✅ |
| Image studio | prompt/styles/generate/share | same; now falls back to the keyless provider | ✅ |
| Model labels | not shown | hidden after this pass (image message + studio) | ✅ |
| Settings | account, theme, language, legal, billing/usage, privacy/cookie prefs, clear history | account, theme, language, image studio, sites, update check, sign out; billing/usage, privacy prefs and clear-history missing | ⚠️ |
| Pricing / upgrade / payments | pricing page, Ziina checkout, payment status | not in-app yet (web link only) | ❌ |
| Notifications | web push / email | no push (Firebase project needed) | ❌ |
| Deep links | `/chat/:id`, `/sites`, `/share/chat/:token` | Android App Links verified; iOS AASA configured, build pending Apple account | ⚠️ |
| Legal pages | in-app privacy/terms/cookies/refunds | links open the web versions | ⚠️ |
| Updates | browser reload | in-app update gate compares versionCode with `/download/latest.json` | ✅ |
| Languages | en/ar, RTL | en/ar, RTL | ✅ |
| Offline | service worker cache | SQLite cache for chats + offline hints | ⚠️ |
| iOS | n/a | target configured, EAS build pending Apple Developer enrolment | ⚠️ |

## Highest-value gaps to close next

1. Settings **billing & usage** (plan, limits, manage/upgrade) and **privacy**
   (policy links, cookie preferences) — mostly API + link-out work.
2. Sites **edit-in-chat** (load the owner copy into a new chat) and multi-page
   publishes.
3. `@research` sourced reports + PDF export, and PDF text extraction for
   attachments.
4. Projects/folders in the sidebar and chat search.
5. Push notifications + iOS TestFlight once the Apple account is connected.
6. Multi-page/JSX canvas compilation.

Everything above was checked against the current web source (`src/`) and the
native routes/APIs (`mobile/src/`); no web-only screen was copied into the
mobile UI.

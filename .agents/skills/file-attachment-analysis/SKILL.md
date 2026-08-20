---
name: file-attachment-analysis
description: Use when a CoreZ request includes attached files or attachment handling code; distinguish injected text from metadata-only binaries and never claim unsupported binary or vision inspection.
---

# File Attachment Analysis

## Current ingestion behavior (MiMo V2.5 -> Muse Spark 1.2 pipeline)

- `src/components/ChatInput.jsx` + `src/utils/fileAttachmentUtils.js` accept multiple files: image/*, video/*, audio/*, pdf, and text-like files.
- Text-like files up to 200 KiB are read and injected with filename/type/size; larger or binary files route through the MiMo pre-pass.
- Images up to 1.5 MiB (video/audio up to 8 MiB) get a data URL thumb and an R2 upload (`/api/assets/upload`) for persistence. The Worker stores all types (image/png, video/mp4, audio/mpeg, application/pdf, etc.).
- **Two-stage pipeline for corez.pro:** every attachment (image, file, video, audio, and more) is first described by **MiMo V2.5** (`worker/mimo.js`) — vision for images/video, transcription for audio, summarization for files — then the textual description is injected as grounded system context for **Muse Spark 1.2**, which does the final generation. Muse is text-only via the gateway; MiMo is the eyes/ears.
- Attachment content is omitted from local session persistence to avoid storing large or private payloads indefinitely.

## Workflow

1. Inventory each attachment by name, type, size, and whether `content` exists.
2. Analyze only the supplied text content. Treat metadata as metadata, not as
   evidence about a file's contents.
3. Quote or transform bounded excerpts and preserve source meaning.
4. If a binary must be inspected, state that the current path cannot read it
   and request a supported text export or a separate capable tool.
5. Avoid reproducing secrets or unnecessary personal data from attachments in
   the final response.

## Guardrails

- Never say an image, PDF, archive, office document, or executable was visually
  or structurally inspected when only its filename and MIME type were supplied.
- Never infer hidden content from a filename.
- Do not increase ingestion limits without reviewing prompt size, browser
  memory, local storage, and privacy impact.

## Verification

Run `npx vitest run tests/chat-attachments.test.jsx` and test both text-content
and metadata-only attachments.

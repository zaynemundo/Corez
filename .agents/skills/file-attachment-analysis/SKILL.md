---
name: file-attachment-analysis
description: Use when a request includes attachments - summarize this PDF, what is in the attached file, analyze this image, read my attachment, or debug attachment ingestion and the image vision path. Not for generating or editing images - use `image-generation` instead.
---

# File Attachment Analysis

## When to use

- The request has attachments - "summarize this PDF", "what is in the attached
  file", "analyze this image", "read my attachment".
- Debugging ingestion limits or the attachment vision path in
  `src/components/ChatInput.jsx`, `src/utils/fileAttachmentUtils.js`, or
  `worker/attachmentVision.js`.
- Deciding whether supplied `content` is real file text or only filename and
  MIME metadata.

## When not to use

- Generating or editing images - use `image-generation`.
- Visual inspection and art direction beyond supplied metadata - use
  `visual-creative`.
- Reviewing and testing attachment handling changes - use
  `code-review-testing`.

## Current ingestion behavior (attachments -> Muse Spark 1.3 Contributor)

- `src/components/ChatInput.jsx` + `src/utils/fileAttachmentUtils.js` accept multiple files: image/*, video/*, audio/*, pdf, and text-like files.
- Text-like files up to 200 KiB (`MAX_TEXT_CONTENT_BYTES`) are read and injected with filename/type/size.
- Images up to 1.5 MiB (`MAX_IMAGE_THUMB_BYTES`), and video/audio up to 8 MiB (`MAX_MEDIA_THUMB_BYTES`), get a data URL thumb plus an R2 upload (`/api/assets/upload`) for persistence. The Worker stores all types (image/png, video/mp4, audio/mpeg, application/pdf, etc.).
- `worker/attachmentVision.js` builds the request. **Image attachments on the current user turn travel as real vision input**: an `input_image` part carrying the inline thumb data URL (or the R2 URL when no thumb exists) plus the usual metadata/URL text hint. Vision was verified live against the gateway's Responses API with randomized striped-color images (correct color names); the same model rejects the chat-completions protocol, so `/responses` stays the only transport.
- Only the CURRENT turn's images are sent as pixels; older history attachments stay metadata + URL text so the gateway does not re-download every old asset on each follow-up.
- Video and audio are **metadata only** — their bytes are never sent, so the model cannot watch or listen. Documents (pdf, text) arrive as metadata plus extracted text when available.
- A remote image URL that fails to download is a hard provider error (`media_url_origin_error`, HTTP 400, "failed to download media") that fails the whole request — which is why the inline thumb data URL is preferred over the R2 URL, and why dead assets are never re-sent from history.
- Attachment content is omitted from local session persistence to avoid storing large or private payloads indefinitely.

## Workflow

1. Inventory each attachment by name, type, size, and whether `content` exists.
2. Current-turn images are visible as pixels — describe, analyse and OCR them
   directly. Older attachments and every video/audio file are metadata only:
   state plainly when something cannot be inspected rather than guessing.
3. Quote or transform bounded excerpts and preserve source meaning.
4. If a binary must be inspected and it is not a current-turn image, state that
   the current path cannot read it and request a supported text export or a
   separate capable tool.
5. Avoid reproducing secrets or unnecessary personal data from attachments in
   the final response.

## Guardrails

- Never say a video, audio file, PDF, archive, office document, or executable
  was visually or structurally inspected when only its filename and MIME type
  were supplied.
- Images from earlier turns are not re-supplied as pixels: do not claim to see
  them again just because they appear in the history as URL hints.
- Never infer hidden content from a filename.
- Do not increase ingestion limits without reviewing prompt size, browser
  memory, local storage, and privacy impact.

## Verification

Run `npx vitest run tests/chat-attachments.test.jsx` and test both text-content
and metadata-only attachments.

## Related skills

- `image-generation` - creating images, which this skill does not do.
- `visual-creative` - visual inspection workflows beyond supplied metadata.
- `code-review-testing` - tests and review for attachment handling changes.

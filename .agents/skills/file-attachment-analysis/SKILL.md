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

## Current ingestion behavior (attachments -> DeepSeek V4.1 Flash)

- `src/components/ChatInput.jsx` + `src/utils/fileAttachmentUtils.js` accept multiple files: image/*, video/*, audio/*, pdf, and text-like files.
- Text-like files up to 200 KiB (`MAX_TEXT_CONTENT_BYTES`) are read and injected with filename/type/size.
- Images up to 1.5 MiB (`MAX_IMAGE_THUMB_BYTES`), and video/audio up to 8 MiB (`MAX_MEDIA_THUMB_BYTES`), get a data URL thumb plus an R2 upload (`/api/assets/upload`) for persistence. The Worker stores all types (image/png, video/mp4, audio/mpeg, application/pdf, etc.).
- `worker/attachmentVision.js` builds the request: the message text gains a URL hint per attachment, and every image that carries a data-URL thumb is appended as a real image part. **DeepSeek V4.1 Flash has native vision**, so attached images are genuinely seen by the model rather than described by a separate vision model.
- An R2 URL is never used as image input. The gateway cannot fetch remote URLs - it answers HTTP 400 "Failed to download image", which fails the entire request - so R2 URLs remain text hints for markup and only a self-contained data-URL thumb becomes image input. Capped at 4 images and 4 MB per thumb per request.
- Video and audio are **metadata only**: the model receives filename, type, size and a URL, never the stream, so it cannot watch or listen.
- Attachment content is omitted from local session persistence to avoid storing large or private payloads indefinitely.

## Workflow

1. Inventory each attachment by name, type, size, and whether `content` exists.
2. Attached images are visible to you - describe them from what you actually
   observe. For everything else, analyze only the supplied text content and
   treat metadata as metadata, not as evidence about a file's contents.
3. Quote or transform bounded excerpts and preserve source meaning.
4. If a binary must be inspected and it is not an image, state that the current
   path cannot read it and request a supported text export or a separate
   capable tool.
5. Avoid reproducing secrets or unnecessary personal data from attachments in
   the final response.

## Guardrails

- Never say an image, PDF, archive, office document, or executable was visually
  or structurally inspected when only its filename and MIME type were supplied.
- Attached images ARE visible, so do not claim you cannot view an image that was
  actually supplied - but never extend that to video and audio, which arrive as
  metadata only, or to files whose text was never extracted.
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

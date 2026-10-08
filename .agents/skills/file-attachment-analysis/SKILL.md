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
- `worker/attachmentVision.js` builds the request: the message text gains a metadata/URL hint per attachment, and content is always plain text. **Muse Spark 1.3 Contributor is text-only through the gateway**, so no image data is ever sent - the model never sees pixels and the system prompt states that plainly so it cannot invent a description.
- No attachment is ever used as image input, so the gateway's remote-URL HTTP 400 trap ("Failed to download image") cannot be triggered by attachments; R2 URLs remain text hints for markup.
- Image, video and audio are all **metadata only**: the model receives filename, type, size and a URL, never the stream or the pixels, so it cannot describe, watch or listen.
- Attachment content is omitted from local session persistence to avoid storing large or private payloads indefinitely.

## Workflow

1. Inventory each attachment by name, type, size, and whether `content` exists.
2. No attachment pixel content is available - analyze only the supplied text
   content, and treat metadata as metadata, not as evidence about a file's
   contents. State plainly when something cannot be inspected.
3. Quote or transform bounded excerpts and preserve source meaning.
4. If a binary must be inspected and it is not an image, state that the current
   path cannot read it and request a supported text export or a separate
   capable tool.
5. Avoid reproducing secrets or unnecessary personal data from attachments in
   the final response.

## Guardrails

- Never say an image, PDF, archive, office document, or executable was visually
  or structurally inspected when only its filename and MIME type were supplied.
- Attachments arrive as metadata only: do not claim to have seen, watched or
  heard any attachment, and do not treat a supplied filename or URL as evidence
  about its contents. Files whose text was never extracted stay unreadable.
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

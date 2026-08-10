---
name: file-attachment-analysis
description: Use when a CoreZ request includes attached files or attachment handling code; distinguish injected text from metadata-only binaries and never claim unsupported binary or vision inspection.
---

# File Attachment Analysis

## Current ingestion behavior

- `src/components/ChatInput.jsx` accepts multiple files.
- Text-like files up to 200 KiB are read and their contents are injected into
  the model prompt with filename, type, and size metadata.
- Images up to 1.5 MiB may receive a local thumbnail for display, but image
  bytes are not sent to a vision model through this attachment path.
- Other files, oversized text files, and unsupported binaries contribute only
  metadata. Their contents have not been inspected.
- Attachment content is omitted from local session persistence to avoid
  storing large or private payloads indefinitely.

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

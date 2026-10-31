import { useId, useState } from "react";
import { Layers, Check, Maximize2 } from "lucide-react";
import { extractCodeFromMessage } from "../services/aiService";
import ThinkingPanel from "./ThinkingPanel.jsx";
import { useI18n } from "../i18n/index.jsx";
import {
  isExecutableCodeBlock,
  extractUnfencedDeliverable,
  CodeSnippetBlock,
  ExecutableCodeBlock,
} from "./chat/CodeBlocks.jsx";
import {
  parseEmailContent,
  splitTextAndEmail,
  EmailCard,
} from "./chat/EmailCard.jsx";
import {
  fetchImageAsPngBlob,
  copyImageToClipboard,
  MessageActions,
} from "./chat/MessageActions.jsx";
import { ImageFullscreenModal } from "./chat/ImageFullscreenModal.jsx";

export {
  extractUnfencedDeliverable,
  fetchImageAsPngBlob,
  copyImageToClipboard,
  parseEmailContent,
  splitTextAndEmail,
};

// Contract reference: chat.message.code.openPreview is wired by CodeSnippetBlock in ./chat/CodeBlocks.jsx

function safeImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  // Same-origin relative paths (e.g. the worker's R2 asset URLs like /api/assets/image_*.png)
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (
    url.startsWith("data:image/png") ||
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/webp") ||
    url.startsWith("data:image/svg+xml")
  )
    return url;
  return "";
}

function isPreviewableImageAttachment(attachment) {
  return (
    String(attachment?.type || "").startsWith("image/") &&
    Boolean(safeImageUrl(attachment.thumb || attachment.assetUrl))
  );
}

function safeHref(url) {
  if (!url || typeof url !== "string") return "";
  if (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("mailto:") ||
    url.startsWith("#")
  )
    return url;
  return "";
}

/**
 * Reasoning disclosure attached to a finished assistant message.
 * The same panel streams live while the model works (App renders that one);
 * keeping it afterwards lets the user inspect how the answer was reached. It is
 * collapsed by default so the answer owns the view, and it is display-only —
 * `message.thinking` is never part of `message.content`.
 */
export function ThinkingDisclosure({ text, seconds = 0 }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  return (
    <ThinkingPanel
      text={value}
      seconds={seconds}
      expanded={open}
      onToggle={() => setOpen((prev) => !prev)}
      bodyId={bodyId}
    />
  );
}

export default function ChatMessage({
  message,
  onRunInCanvas,
  onReviseCode,
  readOnly = false,
}) {
  const { t } = useI18n();
  const isUser = message.role === "user";
  const isConversation = Boolean(message.speakerId);
  const speakerName = String(message.speakerName || "").trim();
  const speakerInitials = speakerName
    ? speakerName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const renderImageAttachments = (attachments) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;
    return (
      <div
        className="message-image-attachments"
        role="group"
        aria-label={t("chat.attachments.label")}
      >
        {attachments.map((attachment) => {
          const source = attachment.thumb || attachment.assetUrl;
          const safeUrl = safeImageUrl(source);
          if (!safeUrl) return null;
          return (
            <button
              type="button"
              key={attachment.id || attachment.name}
              className="message-image-attachment"
              onClick={() =>
                setFullscreenImage({ url: safeUrl, alt: attachment.name })
              }
              aria-label={t("chat.message.image.viewFullscreenAria", {
                alt:
                  attachment.name || t("chat.message.image.imageFallback"),
              })}
              title={attachment.name}
            >
              <img src={safeUrl} alt={attachment.name || ""} />
            </button>
          );
        })}
      </div>
    );
  };

  const renderFileAttachments = (attachments) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;
    return (
      <div className="message-attachments" aria-label={t("chat.attachments.label")}>
        {attachments.map((attachment) => (
          <span
            key={attachment.id || attachment.name}
            className="message-attachment-chip"
          >
            {attachment.thumb && (
              <img
                src={attachment.thumb}
                alt=""
                className="attachment-chip-thumb"
              />
            )}
            <span className="chip-filename" title={attachment.name}>
              {attachment.name}
            </span>
          </span>
        ))}
      </div>
    );
  };

  const renderInlineFormattedText = (text) => {
    if (!text) return null;

    // Tokenize markdown links [text](url), images ![alt](url), code, bold, italic
    const regex = /(!?\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const tokens = text.split(regex);

    return tokens.map((token, i) => {
      if (!token) return null;

      // Image token ![alt](url)
      const imgMatch = token.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        const rawUrl = imgMatch[2];
        const safeUrl = safeImageUrl(rawUrl);
        const altText = imgMatch[1] || "";
        return (
          <span
            key={i}
            className="markdown-inline-img-wrapper"
            role="button"
            tabIndex={0}
            aria-label={t("chat.message.image.viewFullscreenAria", {
              alt: altText || t("chat.message.image.imageFallback"),
            })}
            onClick={() =>
              safeUrl && setFullscreenImage({ url: safeUrl, alt: altText })
            }
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && safeUrl) {
                e.preventDefault();
                setFullscreenImage({ url: safeUrl, alt: altText });
              }
            }}
          >
            <img src={safeUrl} alt={altText} className="markdown-inline-img" />
          </span>
        );
      }

      // Link token [text](url)
      const linkMatch = token.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const href = safeHref(linkMatch[2]);
        const isLinkedIn = /linkedin\.com/i.test(linkMatch[2]);
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`markdown-link${isLinkedIn ? " linkedin-link" : ""}`}
          >
            {isLinkedIn && (
              <svg
                className="linkedin-icon"
                viewBox="-2 -2 24 24"
                width="14"
                height="14"
                role="img"
                aria-label="LinkedIn"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="currentColor"
                  d="M19.959 11.719v7.379h-4.278v-6.885c0-1.73-.619-2.91-2.167-2.91-1.182 0-1.886.796-2.195 1.565-.113.275-.142.658-.142 1.043v7.187h-4.28s.058-11.66 0-12.869h4.28v1.824l-.028.042h.028v-.042c.568-.875 1.583-2.126 3.856-2.126 2.815 0 4.926 1.84 4.926 5.792zM2.421.026C.958.026 0 .986 0 2.249c0 1.235.93 2.224 2.365 2.224h.028c1.493 0 2.42-.989 2.42-2.224C4.787.986 3.887.026 2.422.026zM.254 19.098h4.278V6.229H.254v12.869z"
                />
              </svg>
            )}
            {linkMatch[1]}
          </a>
        );
      }

      if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
        return (
          <code key={i} className="inline-code">
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
        return (
          <strong key={i}>
            {renderInlineFormattedText(token.slice(2, -2))}
          </strong>
        );
      }
      if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
        return <em key={i}>{renderInlineFormattedText(token.slice(1, -1))}</em>;
      }
      return token;
    });
  };

  const isTableDelimiter = (line) =>
    /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(line.trim());

  const parseTableBlock = (tableLines) => {
    if (tableLines.length < 2) return null;
    const parseRow = (line) => {
      const trimmed = line.trim().replace(/^\||\|$/g, "");
      return trimmed.split("|").map((cell) => cell.trim());
    };

    const headers = parseRow(tableLines[0]);
    const bodyLines = isTableDelimiter(tableLines[1])
      ? tableLines.slice(2)
      : tableLines.slice(1);
    const bodyRows = bodyLines
      .filter((line) => !isTableDelimiter(line))
      .map(parseRow);

    return { headers, bodyRows };
  };

  const renderTextAndTables = (textBlock) => {
    const lines = textBlock.split("\n");
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Table detection: line starting with |
      if (trimmed.startsWith("|")) {
        const tableLines = [];
        let j = i;
        while (j < lines.length) {
          const lTrim = lines[j].trim();
          if (lTrim.startsWith("|")) {
            tableLines.push(lTrim);
            j++;
          } else if (
            lTrim === "" &&
            j + 1 < lines.length &&
            lines[j + 1].trim().startsWith("|")
          ) {
            j++; // skip blank line between table rows
          } else {
            break;
          }
        }
        if (tableLines.length >= 2) {
          const tableData = parseTableBlock(tableLines);
          if (tableData) {
            elements.push(
              <div key={`table-${i}`} className="markdown-table-wrapper">
                <table className="markdown-table">
                  <thead>
                    <tr>
                      {tableData.headers.map((h, hIdx) => (
                        <th key={hIdx}>{renderInlineFormattedText(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.bodyRows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>{renderInlineFormattedText(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            );
            i = j;
            continue;
          }
        }
      }

      // Blank lines render nothing: paragraph blocks carry their own
      // spacing, so no spacer element is emitted.
      if (!trimmed) {
        i++;
        continue;
      }

      // Drop horizontal-rule lines (e.g. "---", "* * *", "___") entirely:
      // they render no divider and no literal text.
      if (/^(\s*[-*_]\s*){3,}$/.test(trimmed)) {
        i++;
        continue;
      }

      // Standalone Image ![caption](url)
      const standaloneImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (standaloneImgMatch) {
        const rawUrl = standaloneImgMatch[2];
        const safeUrl = safeImageUrl(rawUrl);
        const altText = standaloneImgMatch[1] || "";
        elements.push(
          <div key={`img-${i}`} className="markdown-image-wrapper">
            <div
              className="markdown-image-card"
              role="button"
              tabIndex={0}
              aria-label={t("chat.message.image.viewFullscreenAria", {
                alt: altText || t("chat.message.image.imageFallback"),
              })}
              onClick={() =>
                safeUrl && setFullscreenImage({ url: safeUrl, alt: altText })
              }
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && safeUrl) {
                  e.preventDefault();
                  setFullscreenImage({ url: safeUrl, alt: altText });
                }
              }}
            >
              <img src={safeUrl} alt={altText} className="markdown-image" />
              <div className="markdown-image-overlay">
                <button
                  type="button"
                  className="image-action-badge"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (safeUrl)
                      setFullscreenImage({ url: safeUrl, alt: altText });
                  }}
                  aria-label={t("chat.message.image.viewFullscreen")}
                  title={t("chat.message.image.viewFullscreen")}
                >
                  <Maximize2 size={13} strokeWidth={2} />
                  <span>{t("chat.message.image.fullscreen")}</span>
                </button>
              </div>
            </div>
            {altText && (
              <span className="markdown-image-caption">{altText}</span>
            )}
          </div>,
        );
        i++;
        continue;
      }

      if (
        trimmed.startsWith("# ") ||
        trimmed.startsWith("## ") ||
        trimmed.startsWith("### ")
      ) {
        const level = Math.min(3, trimmed.match(/^(#+)/)[1].length);
        const headingText = trimmed.replace(/^#+\s*/, "");
        const HeadingTag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
        elements.push(
          <HeadingTag
            key={`h-${i}`}
            className={`markdown-heading level-${level}`}
          >
            {renderInlineFormattedText(headingText)}
          </HeadingTag>,
        );
        i++;
        continue;
      }

      // Blockquote, upgraded to a callout when it opens with a bold keyword
      // ("**Note:** ...", "**Tip:** ...") or a status emoji.
      if (trimmed.startsWith("> ")) {
        const quoteText = trimmed.slice(2);
        const CALL_OUT_TYPES = [
          "note",
          "info",
          "tip",
          "warning",
          "caution",
          "important",
          "danger",
          "success",
        ];
        // "**Note:** ..." (colon inside the bold) or "**Tip** — ..." (separator outside).
        const calloutMatch = quoteText.match(
          /^\*\*([A-Za-z]+):?\*\*\s*[:—-]?\s*/i,
        );
        const keyword = calloutMatch ? calloutMatch[1].toLowerCase() : null;
        const calloutType =
          keyword && CALL_OUT_TYPES.includes(keyword) ? keyword : null;
        const emojiMatch =
          !calloutType && quoteText.match(/^(💡|ℹ️|⚠️|❌|✅|🔥|🚀|📌)\s*/);
        const isCallout = !!calloutType || !!emojiMatch;
        const body = calloutType
          ? quoteText.slice(calloutMatch[0].length)
          : emojiMatch
            ? quoteText.slice(emojiMatch[0].length)
            : quoteText;
        const typeClass = calloutType
          ? `callout-${calloutType === "caution" ? "warning" : calloutType}`
          : "";
        elements.push(
          <blockquote
            key={`q-${i}`}
            className={`markdown-blockquote ${isCallout ? `markdown-callout ${typeClass}`.trim() : ""}`.trim()}
          >
            {calloutType && (
              <strong className="callout-label">{calloutMatch[1]}</strong>
            )}
            {renderInlineFormattedText(body)}
          </blockquote>,
        );
        i++;
        continue;
      }

      // List detection: group consecutive bullet or numbered items into a real
      // <ul>/<ol> with styled markers; "[x]"/"[ ]" task items become checkboxes.
      const listItemMatch = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (listItemMatch) {
        const ordered = /^\d+\.\s/.test(trimmed);
        const items = [];
        while (i < lines.length) {
          const innerLine = lines[i].trim();
          const innerMatch = innerLine.match(/^([-*]|\d+\.)\s+(.*)$/);
          if (
            !innerMatch ||
            (ordered && !/^\d+\.\s/.test(innerLine)) ||
            (!ordered && !/^[-*]\s/.test(innerLine))
          )
            break;
          items.push(innerMatch[2]);
          i++;
        }
        const ListTag = ordered ? "ol" : "ul";
        elements.push(
          <ListTag
            key={`list-${i}`}
            className={`markdown-list ${ordered ? "ordered" : ""}`}
          >
            {items.map((itemText, itemIdx) => {
              const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
              if (taskMatch) {
                const checked = taskMatch[1].toLowerCase() === "x";
                return (
                  <li
                    key={itemIdx}
                    className="markdown-list-item markdown-task-list-item"
                  >
                    <span
                      className={`markdown-checkbox ${checked ? "checked" : ""}`}
                      aria-hidden="true"
                    >
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={checked ? "markdown-task-done" : ""}>
                      {renderInlineFormattedText(taskMatch[2])}
                    </span>
                  </li>
                );
              }
              return (
                <li key={itemIdx} className="markdown-list-item">
                  {renderInlineFormattedText(itemText)}
                </li>
              );
            })}
          </ListTag>,
        );
        continue;
      }

      elements.push(<p key={`p-${i}`}>{renderInlineFormattedText(line)}</p>);
      i++;
    }

    return elements;
  };

  const renderFormattedText = (content) => {
    if (!content) return null;

    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
    let parts = [];
    let lastIndex = 0;
    let match;
    let blockCount = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          content: content.slice(lastIndex, match.index),
        });
      }

      const lang = match[1] || "code";
      const code = match[2].trim();
      const isExecutable = isExecutableCodeBlock(lang, code);

      parts.push({
        type: "code",
        lang: lang,
        code: code,
        isExecutable: isExecutable,
        index: blockCount++,
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex),
      });
    }

    // Post-process: orphaned HTML closing tags (e.g. </body></html>) that
    // trail the last code block should be merged INTO that block rather than
    // rendered as raw plain text.  The harness occasionally emits them outside
    // the fenced code block due to continuation stitching.
    const ORPHANED_TAG_RE =
      /^\s*(?:<\/(?:script|style|body|html|div|section|main|head|head)>\s*)+$/i;
    for (let i = parts.length - 1; i > 0; i--) {
      if (parts[i].type === "text" && ORPHANED_TAG_RE.test(parts[i].content)) {
        // Find the preceding code block.
        for (let j = i - 1; j >= 0; j--) {
          if (parts[j].type === "code") {
            parts[j].code += "\n" + parts[i].content.trim();
            parts.splice(i, 1);
            break;
          }
        }
      }
    }

    // Multi-page sites are often emitted as ONE fence per page with the
    // <!-- PAGE: name.html --> markers sitting BETWEEN the fences. Those
    // blocks are merged back into a single multi-page code block so "Open
    // Canvas Preview" runs the WHOLE site — a lone page would render with
    // dead nav links (blank pages on click) and a broken published link.
    // Marker lines are pulled out of any text part (prose around them is
    // kept as its own text) and attached to the following code block, or
    // spliced into the previous block when the text sat between two blocks.
    const MARKER_LINE_RE = /^\s*<!--\s*(?:PAGE|CORESITE-PAGES):[^\n]*-->\s*$/gm;
    const mergeableParts = [];
    let pendingMarkers = null;
    for (const p of parts) {
      if (p.type === "text") {
        // A text part that already contains the documents themselves (an
        // unfenced deliverable) keeps its markers — the later
        // extractUnfencedDeliverable pass preserves them. Only marker text
        // BETWEEN fenced blocks (no document content) is spliced here.
        const containsDocuments = /<!DOCTYPE\s+html|<html[\s>]/.test(p.content);
        const markerLines = containsDocuments
          ? []
          : (p.content.match(MARKER_LINE_RE) || []).map((m) => m.trim());
        if (markerLines.length > 0) {
          const prose = p.content.replace(MARKER_LINE_RE, "").trim();
          if (prose) mergeableParts.push({ type: "text", content: prose });
          pendingMarkers = pendingMarkers
            ? `${pendingMarkers}\n${markerLines.join("\n")}`
            : markerLines.join("\n");
          continue;
        }
        mergeableParts.push(p);
        continue;
      }
      if (p.type === "code" && pendingMarkers) {
        if (
          mergeableParts.length > 0 &&
          mergeableParts[mergeableParts.length - 1].type === "code"
        ) {
          const prev = mergeableParts[mergeableParts.length - 1];
          prev.code = `${prev.code}\n\n${pendingMarkers}\n\n${p.code}`;
          prev.lang = "html";
          prev.isExecutable = true;
          pendingMarkers = null;
          continue;
        }
        p.code = `${pendingMarkers}\n\n${p.code}`;
        p.lang = "html";
        p.isExecutable = true;
        pendingMarkers = null;
      }
      mergeableParts.push(p);
    }
    parts = mergeableParts;

    const processedParts = [];
    for (const p of parts) {
      if (p.type === "text") {
        const unfenced = extractUnfencedDeliverable(p.content);
        if (unfenced) {
          if (unfenced.preamble) {
            processedParts.push({ type: "text", content: unfenced.preamble });
          }
          processedParts.push({
            type: "code",
            lang: "html",
            code: unfenced.code,
            isExecutable: true,
            index: blockCount++,
          });
        } else {
          processedParts.push(p);
        }
      } else {
        processedParts.push(p);
      }
    }

    const expandedParts = [];
    for (const p of processedParts) {
      if (p.type === "text") {
        const subParts = splitTextAndEmail(p.content);
        expandedParts.push(...subParts);
      } else {
        expandedParts.push(p);
      }
    }

    const fullDeliverableCode = !isUser
      ? extractCodeFromMessage(content)
      : null;
    let hasRenderedExecutableBar = false;

    return expandedParts.map((part, idx) => {
      if (part.type === "code") {
        if (part.isExecutable && !isUser) {
          if (!hasRenderedExecutableBar) {
            hasRenderedExecutableBar = true;
            return (
              <ExecutableCodeBlock
                key={idx}
                code={fullDeliverableCode || part.code}
                lang={part.lang}
                onRunInCanvas={onRunInCanvas}
                onReviseCode={onReviseCode}
              />
            );
          }
          return (
            <CodeSnippetBlock key={idx} code={part.code} lang={part.lang} />
          );
        }

        if (isUser) {
          return (
            <div
              key={idx}
              style={{
                margin: "0.4rem 0",
                padding: "0.4rem 0.65rem",
                backgroundColor: "rgba(0,0,0,0.15)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
              }}
            >
              <Layers size={14} strokeWidth={1.5} />
              <span>
                {t("chat.message.attachedCodeBlock", {
                  count: part.code.split("\n").length,
                })}
              </span>
            </div>
          );
        }

        return <CodeSnippetBlock key={idx} code={part.code} lang={part.lang} />;
      }

      if (part.type === "email") {
        return (
          <EmailCard
            key={idx}
            content={part.content}
            renderBody={renderTextAndTables}
          />
        );
      }

      return (
        <div key={idx} className="markdown-body">
          {renderTextAndTables(part.content)}
        </div>
      );
    });
  };

  const userAttachments =
    isUser && Array.isArray(message.attachments) ? message.attachments : [];
  const userImages = userAttachments.filter(isPreviewableImageAttachment);
  const userFiles = userAttachments.filter(
    (attachment) => !isPreviewableImageAttachment(attachment),
  );
  const showMessageContent =
    !isUser ||
    Boolean(String(message.content || "").trim()) ||
    userFiles.length > 0;

  return (
    <div
      className={`message-wrapper ${isUser ? "user" : "ai"}${
        isConversation ? " conversation" : ""
      }`}
      data-speaker={message.speakerId || undefined}
    >
      <div className="message-body">
        {!isUser && isConversation && speakerName ? (
          <div className="message-speaker">
            <span className="message-speaker-avatar" aria-hidden="true">
              {speakerInitials}
            </span>
            <span className="message-speaker-name">{speakerName}</span>
          </div>
        ) : null}
        {!isUser && message.thinking && (
          <ThinkingDisclosure
            text={message.thinking}
            seconds={message.thinkingSeconds}
          />
        )}
        {isUser && renderImageAttachments(userImages)}
        {showMessageContent && (
          <div className="message-content">
            {isUser && renderFileAttachments(userFiles)}
            {renderFormattedText(message.content)}
          </div>
        )}
        {!isUser && !readOnly && (
          <MessageActions content={message.content || ""} />
        )}
      </div>

      <ImageFullscreenModal
        fullscreenImage={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
    </div>
  );
}

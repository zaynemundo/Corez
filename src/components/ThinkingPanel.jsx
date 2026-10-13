/**
 * Reasoning panel shared by the live stream (App) and the finished message
 * (ChatMessage).
 *
 * Header: the CoreZ mark, a status label ("Thinking" while the model works,
 * "Thought for Ns" once the turn finished) and a chevron. Body: a compact
 * markdown-lite rendering of the reasoning text — paragraphs, nested bullet
 * and numbered lists, **bold** lead-ins and `inline code` — so long reasoning
 * stays readable instead of arriving as one pre-wrapped blob.
 *
 * Display only: the reasoning is never mixed into `message.content`.
 */
import { ChevronDown } from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

const BULLET_RE = /^[-*•]\s+(.*)$/;
const ORDERED_RE = /^(\d+)[.)]\s+(.*)$/;
const HEADING_RE = /^#{1,4}\s+(.*)$/;
const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/** Bold and inline-code spans inside one line of reasoning. */
function inlineParts(text, keyPrefix) {
  const parts = [];
  let last = 0;
  let match;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-b${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={`${keyPrefix}-c${match.index}`}>{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Indent level from leading whitespace (2 spaces or 1 tab per level). */
function indentLevel(line) {
  const leading = /^\s*/.exec(line)[0].replace(/\t/g, "  ");
  return Math.min(3, Math.floor(leading.length / 2));
}

/**
 * Structural pass over the reasoning text: empty lines separate paragraphs,
 * bullet / numbered runs become lists, indentation nests them, and headings
 * become emphasised paragraphs.
 */
function ThinkingBody({ text }) {
  const blocks = [];
  let list = null;
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushList();
      continue;
    }
    const level = indentLevel(line);
    const content = line.trim();
    const bullet = BULLET_RE.exec(content);
    const ordered = ORDERED_RE.exec(content);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered || list.level !== level) {
        flushList();
        list = { type: "list", ordered: isOrdered, level, items: [] };
      }
      list.items.push(isOrdered ? ordered[2] : bullet[1]);
      continue;
    }
    flushList();
    const heading = HEADING_RE.exec(content);
    blocks.push({ type: "p", level, text: heading ? heading[1] : content });
  }
  flushList();

  return (
    <div className="thinking-panel-body-inner">
      {blocks.map((block, index) => {
        const style = block.level
          ? { marginLeft: `${block.level * 0.9}rem` }
          : undefined;
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineParts(item, `${index}-${itemIndex}`)}</li>
          ));
          return block.ordered ? (
            <ol key={index} className="thinking-list" style={style}>
              {items}
            </ol>
          ) : (
            <ul key={index} className="thinking-list" style={style}>
              {items}
            </ul>
          );
        }
        return (
          <p key={index} style={style}>
            {inlineParts(block.text, String(index))}
          </p>
        );
      })}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.text Reasoning text (blank renders nothing).
 * @param {number} [props.seconds] Thinking duration; > 0 switches the label to
 *   "Thought for Ns" on the finished message.
 * @param {boolean} [props.expanded] Whether the body is visible.
 * @param {() => void} props.onToggle Header activation handler.
 * @param {string} props.bodyId id of the expandable body (aria-controls).
 * @param {boolean} [props.live] True while the model is still working.
 */
export function ThinkingPanel({
  text,
  seconds = 0,
  expanded = false,
  onToggle,
  bodyId,
  live = false,
}) {
  const { t } = useI18n();
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  const label =
    !live && seconds > 0
      ? t("common.thinking.thoughtForSeconds", { seconds })
      : t("common.thinking.label");
  return (
    <div
      className={`thinking-panel${live ? " thinking-panel-live" : " thinking-panel-persisted"}`}
    >
      <button
        type="button"
        className="thinking-panel-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="thinking-panel-logo" aria-hidden="true" />
        <span className="thinking-panel-title">{label}</span>
        <ChevronDown
          className={`thinking-panel-chevron${expanded ? " is-open" : ""}`}
          size={15}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="thinking-panel-body" id={bodyId}>
          <ThinkingBody text={value} />
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;

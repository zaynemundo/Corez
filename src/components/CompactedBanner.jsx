import { Archive, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

export default function CompactedBanner({
  meta,
  onExpand,
  onCollapse,
  isExpanded,
}) {
  const { t } = useI18n();
  if (!meta || !meta.isCompactSummary) return null;
  const count = meta.compactedCount || 0;
  const topics = Array.isArray(meta.topics) ? meta.topics.slice(0, 6) : [];
  const summaryLine =
    meta.summaryLine ||
    t("chat.message.compacted.summaryLine", { count });
  const persisted = meta.persisted;

  return (
    <div
      className="compact-banner"
      style={{
        margin: "0.75rem 0 1rem",
        padding: "0.85rem 1rem",
        background: "var(--bg-secondary, #1a1a1e)",
        border: "1px solid var(--border-color, #2a2a30)",
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "var(--bg-tertiary, #25252b)",
            border: "1px solid var(--border-color)",
            padding: "0.25rem 0.6rem",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          <Archive size={13} strokeWidth={1.7} />
          {t("chat.message.compacted.badge", { count })}
        </span>
        {topics.length > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            <Sparkles size={12} strokeWidth={1.5} />
            {topics.join(" • ")}
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={isExpanded ? onCollapse : onExpand}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.7rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "999px",
              border: "1px solid var(--border-color)",
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              cursor: "pointer",
            }}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={13} /> {t("chat.message.compacted.collapse")}
              </>
            ) : (
              <>
                <ChevronDown size={13} />{" "}
                {t("chat.message.compacted.showFullHistory")}
              </>
            )}
          </button>
        </span>
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          lineHeight: 1.5,
          color: "var(--text-secondary)",
        }}
      >
        {summaryLine}
        {persisted === false && (
          <span
            style={{
              marginLeft: "0.5rem",
          color: "var(--text-tertiary, var(--text-muted, #8a8a90))",
              fontStyle: "italic",
            }}
          >
            {t("chat.message.compacted.inSessionOnly")}
          </span>
        )}
        {persisted && (
          <span style={{ marginLeft: "0.5rem", color: "var(--text-tertiary, var(--text-muted, #8a8a90))" }}>
            {t("chat.message.compacted.retrievable")}
          </span>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Copy, Check, Send, Pencil, X } from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";

export function parseEmailContent(content) {
  const emailLines = String(content || "").split("\n");
  let subject = "";
  let recipients = "";
  let bodyStart = 0;

  for (let j = 0; j < emailLines.length; j++) {
    const ln = emailLines[j].trim();
    const subjectMatch = ln.match(/^(?:\*\*)?Subject:\s*(.*?)(?:\*\*)?$/i);
    if (subjectMatch) {
      subject = subjectMatch[1].replace(/\*\*/g, "").trim();
      bodyStart = j + 1;
      continue;
    }
    const toMatch = ln.match(/^(?:\*\*)?To:\s*(.*?)(?:\*\*)?$/i);
    if (toMatch) {
      recipients = toMatch[1].replace(/\*\*/g, "").trim();
      bodyStart = j + 1;
      continue;
    }
    const fromMatch = ln.match(/^(?:\*\*)?From:\s*(.*?)(?:\*\*)?$/i);
    if (fromMatch) {
      bodyStart = j + 1;
      continue;
    }
    const ccMatch = ln.match(/^(?:\*\*)?Cc:\s*(.*?)(?:\*\*)?$/i);
    if (ccMatch) {
      bodyStart = j + 1;
      continue;
    }
    const dateMatch = ln.match(/^(?:\*\*)?Date:\s*(.*?)(?:\*\*)?$/i);
    if (dateMatch) {
      bodyStart = j + 1;
      continue;
    }
    if (ln === "") {
      // Check if subsequent lines have another header
      const nextLines = emailLines.slice(j + 1);
      const nextHeader = nextLines.find((l) => l.trim() !== "");
      if (
        nextHeader &&
        /^(?:\*\*)?(?:Subject|To|From|Cc|Bcc|Date):\s*/i.test(nextHeader.trim())
      ) {
        bodyStart = j + 1;
        continue;
      }
      bodyStart = j + 1;
      break;
    }
    bodyStart = j;
    break;
  }

  return {
    subject,
    recipients,
    body: emailLines.slice(bodyStart).join("\n").trim(),
  };
}

const EMAIL_HEADER_START_RE = /^(?:\*\*)?(?:Subject|To|From):\s*(.+)$/i;
const EMAIL_SIGNOFF_RE =
  /^(?:Best regards|Warm regards|Kind regards|With regards|Regards|Sincerely|Thanks|Thank you|Best|Cheers|Respectfully|Yours truly|With appreciation)[,\s]*$/i;

export function splitTextAndEmail(text) {
  if (!text || typeof text !== "string") return [{ type: "text", content: "" }];

  const lines = text.split("\n");
  let headerStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (EMAIL_HEADER_START_RE.test(trimmed)) {
      let hasFollowup = false;
      let checkLimit = Math.min(lines.length, i + 6);
      for (let k = i + 1; k < checkLimit; k++) {
        const nextTrimmed = lines[k].trim();
        if (
          /^(?:\*\*)?(?:Subject|To|From|Cc|Bcc|Date):\s*/i.test(nextTrimmed) ||
          /^(?:Hi|Dear|Hello|Hey|Good morning|Good afternoon|To whom|Team)[,\s]/i.test(
            nextTrimmed,
          ) ||
          (nextTrimmed.length > 0 && !nextTrimmed.startsWith("#"))
        ) {
          hasFollowup = true;
          break;
        }
      }
      if (hasFollowup) {
        headerStartIdx = i;
        break;
      }
    }
  }

  if (headerStartIdx === -1) {
    return [{ type: "text", content: text }];
  }

  let emailEndIdx = lines.length;
  for (let i = headerStartIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (EMAIL_SIGNOFF_RE.test(trimmed)) {
      let sigEnd = i + 1;
      while (
        sigEnd < lines.length &&
        sigEnd <= i + 3 &&
        lines[sigEnd].trim() !== ""
      ) {
        sigEnd++;
      }
      emailEndIdx = sigEnd;
      break;
    }
    if (
      i > headerStartIdx + 3 &&
      (trimmed.startsWith("##") || trimmed === "---" || trimmed === "***")
    ) {
      emailEndIdx = i;
      break;
    }
  }

  const beforeText = lines.slice(0, headerStartIdx).join("\n").trim();
  const emailText = lines.slice(headerStartIdx, emailEndIdx).join("\n").trim();
  const afterText = lines.slice(emailEndIdx).join("\n").trim();

  const parsed = parseEmailContent(emailText);
  if (!parsed.subject && !parsed.recipients) {
    return [{ type: "text", content: text }];
  }
  if (!parsed.body || parsed.body.length < 10) {
    return [{ type: "text", content: text }];
  }

  const result = [];
  if (beforeText) {
    result.push({ type: "text", content: beforeText });
  }
  result.push({ type: "email", content: emailText });
  if (afterText) {
    result.push({ type: "text", content: afterText });
  }
  return result;
}

export function EmailCard({ content, renderBody }) {
  const { t } = useI18n();
  const initial = parseEmailContent(content);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(initial.subject);
  const [recipients, setRecipients] = useState(initial.recipients);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const fullText = [
    `Subject: ${subject}`,
    ...(recipients ? [`To: ${recipients}`] : []),
    "",
    body,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const handleCopy = async () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullText).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    const to = /@/.test(recipients) ? recipients : "";
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  const startEdit = () => {
    setEditing(true);
  };

  const cancelEdit = () => {
    setSubject(initial.subject);
    setRecipients(initial.recipients);
    setBody(initial.body);
    setEditing(false);
  };

  const saveEdit = () => {
    setEditing(false);
  };

  return (
    <div className="markdown-email-wrapper">
      <div className="email-toolbar">
        <div className="email-toolbar-left">
          <button
            type="button"
            className={`email-action-btn ${editing ? "active" : ""}`}
            onClick={editing ? cancelEdit : startEdit}
            aria-label={
              editing
                ? t("chat.message.email.cancelEditing")
                : t("chat.message.email.edit")
            }
            title={
              editing
                ? t("common.action.cancel")
                : t("chat.message.email.editAction")
            }
          >
            {editing ? <X size={13} /> : <Pencil size={13} />}
          </button>
          <span className="email-action-label">
            {editing
              ? t("common.action.cancel")
              : t("chat.message.email.editAction")}
          </span>
        </div>
        <div className="email-toolbar-right">
          {editing ? (
            <button
              type="button"
              className="email-save-btn"
              onClick={saveEdit}
              aria-label={t("chat.message.email.save")}
            >
              <Check size={14} /> {t("common.action.save")}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`email-icon-btn ${copied ? "active" : ""}`}
                onClick={handleCopy}
                aria-label={
                  copied
                    ? t("chat.message.email.copied")
                    : t("chat.message.email.copy")
                }
                title={
                  copied ? t("common.action.copied") : t("chat.message.email.copy")
                }
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                className={`email-send-btn ${sent ? "sent" : ""}`}
                onClick={handleSend}
              >
                {sent ? <Check size={14} /> : <Send size={14} />}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="email-edit-fields">
          <label className="email-edit-field">
            <span className="email-edit-label">
              {t("chat.message.email.recipients")}
            </span>
            <input
              name="email-recipients"
              className="email-edit-input"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label className="email-edit-field">
            <span className="email-edit-label">
              {t("chat.message.email.subject")}
            </span>
            <input
              name="email-subject"
              className="email-edit-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("chat.message.email.subjectPlaceholder")}
            />
          </label>
          <label className="email-edit-field">
            <span className="email-edit-label">
              {t("chat.message.email.message")}
            </span>
            <textarea
              name="email-body"
              className="email-edit-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(10, Math.max(4, body.split("\n").length))}
            />
          </label>
        </div>
      ) : (
        <>
          {recipients && (
            <div className="email-recipients">
              <span className="email-recipients-value">{recipients}</span>
            </div>
          )}
          {subject && <div className="email-subject">{subject}</div>}
          <div className="email-body">{renderBody(body)}</div>
        </>
      )}
    </div>
  );
}

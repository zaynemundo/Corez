import { useRef, useEffect, useLayoutEffect, useState } from "react";
import {
  ArrowUp,
  Square,
  ChevronRight,
  Globe,
  Gamepad2,
  Mic,
  MicOff,
  Loader2,
  Search,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { PlusIcon } from "./icons";
import { useI18n } from "../i18n/index.jsx";
import {
  createDictationSession,
  isDictationSupported,
} from "../utils/dictation";
import {
  processFiles,
  formatBytes,
  hasFiles,
  extractFilesFromClipboard,
  MAX_IMAGE_THUMB_BYTES,
} from "../utils/fileAttachmentUtils";

// Commands offered as suggestions when the user types "@".
// Keep in sync with parseSlashCommand in services/aiService.js.
const COMMANDS = [
  {
    command: "website",
    label: "@website",
    name: "Website",
    descriptionKey: "chat.composer.commands.website",
    icon: Globe,
    placeholder: "Describe the website you want to build...",
  },
  {
    command: "game",
    label: "@game",
    name: "Game",
    descriptionKey: "chat.composer.commands.game",
    icon: Gamepad2,
    placeholder: "Describe the game you want to build...",
  },
  {
    command: "research",
    label: "@research",
    name: "Research",
    descriptionKey: "chat.composer.commands.research",
    icon: Search,
    placeholder: "Enter a research topic or question...",
  },
  {
    command: "image",
    label: "@image",
    name: "Image",
    descriptionKey: "chat.composer.commands.image",
    icon: ImageIcon,
    placeholder: "Describe the image you want to generate...",
  },
];

export default function ChatInput({
  input,
  setInput,
  onSendMessage,
  onStopMessage,
  isStreaming,
  textareaRef,
  attachments: externalAttachments,
  setAttachments: externalSetAttachments,
  onAddFiles,
  /**
   * "hero" is the new-chat composer: a wider, softly rounded bar under the
   * opening question instead of a bar resting on the bottom edge of the
   * conversation. The controls themselves are identical.
   */
  variant = "composer",
  /**
   * Extra content under the composer, inside the same width-limited container
   * (the new-chat command grid). The composer owns the width so the grid can
   * never drift out of line with the input it fills.
   */
  footer = null,
}) {
  const { t, language } = useI18n();
  const internalRef = useRef(null);
  const refToUse = textareaRef || internalRef;
  const [showSuggestions, setShowSuggestions] = useState(() =>
    String(input || "").startsWith("@"),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionsRef = useRef(null);
  const fileInputRef = useRef(null);
  const submitRetryRef = useRef(0);

  // Voice dictation: the microphone is rendered only where the browser can do
  // it, so an unsupported browser never shows a button that cannot work.
  const dictationAvailable = isDictationSupported();
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const dictationRef = useRef(null);
  const dictationBaseRef = useRef("");

  const [internalAttachments, setInternalAttachments] = useState([]);
  const attachments =
    externalAttachments !== undefined
      ? externalAttachments
      : internalAttachments;
  const setAttachments = externalSetAttachments || setInternalAttachments;

  const [isDragOverInput, setIsDragOverInput] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const dragInputCounterRef = useRef(0);
  const imageAttachments = attachments.filter((a) =>
    String(a.type || "").startsWith("image/"),
  );
  const fileAttachments = attachments.filter(
    (a) => !String(a.type || "").startsWith("image/"),
  );
  const hasImage = imageAttachments.length > 0;
  const hasPendingImage = attachments.some(
    (a) =>
      (a.type?.startsWith("image/") &&
        !a.thumb &&
        a.size <= MAX_IMAGE_THUMB_BYTES) ||
      a.uploading,
  );

  useEffect(() => {
    const textarea = refToUse.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${nextHeight}px`;
    // Wrapping is not visible in the value alone, so measure it. Explicit
    // newlines also count even before the browser reports a scroll height.
    setIsMultiline(nextHeight > 36 || String(input).includes("\n"));
  }, [input, refToUse]);

  // The multiline layout gives the textarea the full width. Re-measure after
  // that reflow, otherwise the textarea keeps the taller height it needed in
  // the one-row layout and leaves a blank band above the controls.
  useLayoutEffect(() => {
    if (!isMultiline) return;
    const textarea = refToUse.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [isMultiline, refToUse]);

  // Show suggestions when the input starts with "@" (optionally followed by
  // partial command text) and is not streaming.
  const match =
    !isStreaming && input.startsWith("@") ? input.match(/^@([a-z]*)$/i) : null;
  const show = showSuggestions && match !== null;
  const typed = match ? match[1].toLowerCase() : "";
  const filtered = typed
    ? COMMANDS.filter((c) => c.command.startsWith(typed))
    : COMMANDS;

  // Reset selection whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [typed, showSuggestions]);

  // Dismiss on click outside.
  useEffect(() => {
    if (!show) return;
    const onClick = (e) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target) &&
        refToUse.current &&
        !refToUse.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [show, refToUse]);

  const applySuggestion = (command) => {
    // Fill the @command token with a trailing space
    setInput(`@${command} `);
    setShowSuggestions(false);
    setActiveIndex(0);
    if (refToUse.current) {
      refToUse.current.focus();
      const pos = `@${command} `.length;
      refToUse.current.setSelectionRange(pos, pos);
    }
  };

  const handleFileSelect = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processFiles(files, setAttachments);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (refToUse.current) {
      refToUse.current.focus();
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => (prev || []).filter((a) => a.id !== id));
  };

  const handleInputDragEnter = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragInputCounterRef.current += 1;
    setIsDragOverInput(true);
  };

  const handleInputDragLeave = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragInputCounterRef.current = Math.max(0, dragInputCounterRef.current - 1);
    if (dragInputCounterRef.current === 0) {
      setIsDragOverInput(false);
    }
  };

  const handleInputDragOver = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleInputDrop = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragInputCounterRef.current = 0;
    setIsDragOverInput(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files, setAttachments);
      if (onAddFiles) onAddFiles(files);
      if (refToUse.current) {
        refToUse.current.focus();
      }
    }
  };

  const handleInputPaste = (e) => {
    let clipboardData;
    try {
      clipboardData = e.clipboardData || e.nativeEvent?.clipboardData || null;
    } catch {
      clipboardData = null;
    }
    if (!clipboardData) return;
    let pastedFiles;
    try {
      pastedFiles = extractFilesFromClipboard(clipboardData);
    } catch {
      return;
    }
    if (pastedFiles.length === 0) return;
    // Files present (e.g. screenshot, copied image): attach them instead of
    // inserting binary/text into the textarea. Text-only pastes fall through
    // to the default behavior.
    e.preventDefault();
    e.stopPropagation();
    processFiles(pastedFiles, setAttachments);
    if (onAddFiles) onAddFiles(pastedFiles);
    if (refToUse.current) {
      refToUse.current.focus();
    }
  };

  const stopDictation = () => {
    const session = dictationRef.current;
    if (!session) return;
    setIsDictating(false);
    setIsTranscribing(true);
    session.stop();
  };

  const discardDictation = () => {
    const session = dictationRef.current;
    dictationRef.current = null;
    dictationBaseRef.current = "";
    setIsDictating(false);
    setIsTranscribing(false);
    session?.abort();
  };

  const startDictation = () => {
    if (dictationRef.current || isTranscribing) return;
    // The final Whisper transcript replaces the live browser preview; holding
    // the text from before the microphone started keeps both in one draft.
    dictationBaseRef.current = String(input || "");
    const withBase = (text) => {
      const base = dictationBaseRef.current;
      return base.trim()
        ? `${base.replace(/\s+$/, "")} ${text}`
        : text;
    };
    const session = createDictationSession({
      language,
      onLiveTranscript: ({ finalText, interimText }) => {
        setInput(withBase(`${finalText}${interimText}`));
      },
      onTranscript: (text) => {
        if (!text) return;
        setInput(withBase(text));
        if (refToUse.current) refToUse.current.focus();
      },
      onRecordingStop: () => {
        setIsDictating(false);
        setIsTranscribing(true);
      },
      onEnd: () => {
        dictationRef.current = null;
        dictationBaseRef.current = "";
        setIsDictating(false);
        setIsTranscribing(false);
      },
      onError: () => {
        dictationRef.current = null;
        dictationBaseRef.current = "";
        setIsDictating(false);
        setIsTranscribing(false);
      },
    });
    if (!session) return;
    dictationRef.current = session;
    setIsDictating(true);
  };

  // Dictation must not outlive its composer, and it must never keep writing
  // into a textarea that a streaming answer has taken over.
  useEffect(() => {
    return () => {
      const session = dictationRef.current;
      dictationRef.current = null;
      dictationBaseRef.current = "";
      session?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isStreaming) return;
    const session = dictationRef.current;
    if (!session) return;
    dictationRef.current = null;
    dictationBaseRef.current = "";
    setIsDictating(false);
    setIsTranscribing(false);
    session.abort();
  }, [isStreaming]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isStreaming) {
      if (onStopMessage) onStopMessage();
      return;
    }
    if (isTranscribing) return;
    const textToSend = input.trim();
    if (!textToSend && attachments.length === 0) return;
    const hasPending = attachments.some(
      (a) =>
        Boolean(a.uploading) ||
        (a.type?.startsWith("image/") &&
          !a.thumb &&
          a.size <= MAX_IMAGE_THUMB_BYTES),
    );
    if (hasPending) {
      // Image thumb still generating or R2 upload in flight — wait briefly and
      // retry (the chip shows loading/uploading). The wait is bounded: after
      // ~6s the composer stops retrying instead of looping forever, and the
      // user can press send again once the chip settles.
      if (submitRetryRef.current >= 40) {
        submitRetryRef.current = 0;
        return;
      }
      submitRetryRef.current += 1;
      setTimeout(() => handleSubmit(e), 150);
      return;
    }
    submitRetryRef.current = 0;
    // A recording that has not been transcribed yet cannot keep writing into a
    // message that is already leaving; discard it rather than race the reply.
    discardDictation();
    onSendMessage(textToSend, attachments);
    setInput("");
    setAttachments([]);
    setShowSuggestions(false);
    setIsMultiline(false);
    if (refToUse.current) {
      refToUse.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (show && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        const selected = filtered[activeIndex];
        if (selected) {
          e.preventDefault();
          applySuggestion(selected.command);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasComposerContent =
    Boolean(String(input || "").trim()) || attachments.length > 0;
  // ChatGPT-style single action: dictate while empty, send once there is
  // something to send. While recording, the stop control must remain even as
  // live words fill the composer. An unsupported browser falls back to a
  // disabled send.
  const showDictationAction =
    (!hasComposerContent || isDictating) && dictationAvailable;

  return (
    <div className="input-container">
      <form
        onSubmit={handleSubmit}
        className={`input-box${variant === "hero" ? " hero" : ""}${
          hasImage ? " has-image" : ""
        }${isMultiline ? " is-multiline" : ""}${
          isDragOverInput ? " drag-over" : ""
        }`}
        onDragEnter={handleInputDragEnter}
        onDragOver={handleInputDragOver}
        onDragLeave={handleInputDragLeave}
        onDrop={handleInputDrop}
      >
        {show && filtered.length > 0 && (
          <div
            className="slash-suggestions"
            ref={suggestionsRef}
            role="listbox"
            aria-label={t("chat.composer.commandsLabel")}
          >
            {filtered.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.command}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-label={t("chat.composer.suggestionLabel", {
                    label: entry.label,
                    description: t(entry.descriptionKey),
                  })}
                  className={`slash-suggestion-item ${index === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => applySuggestion(entry.command)}
                >
                  <span className="slash-suggestion-icon">
                    <Icon size={15} strokeWidth={1.5} />
                  </span>
                  <span className="slash-suggestion-desc">
                    {t(entry.descriptionKey)}
                  </span>
                  <ChevronRight
                    size={14}
                    strokeWidth={1.5}
                    className="slash-suggestion-chevron"
                  />
                </button>
              );
            })}
          </div>
        )}
        {fileAttachments.length > 0 && (
          <div className="attachment-chips-bar" aria-label={t("chat.attachments.label")}>
            {fileAttachments.map((attachment) => {
              const isPendingThumb =
                attachment.type?.startsWith("image/") &&
                !attachment.thumb &&
                attachment.size <= MAX_IMAGE_THUMB_BYTES;
              const isUploading = Boolean(attachment.uploading);
              const isPending = isPendingThumb || isUploading;
              return (
                <span key={attachment.id} className="attachment-chip">
                  {attachment.thumb ? (
                    <img
                      src={attachment.thumb}
                      alt=""
                      className="attachment-chip-thumb"
                      style={isUploading ? { opacity: 0.6 } : undefined}
                    />
                  ) : isPendingThumb ? (
                    <span
                      className="attachment-chip-thumb"
                      style={{
                        display: "inline-block",
                        width: 24,
                        height: 24,
                        background: "#333",
                        borderRadius: 4,
                        textAlign: "center",
                        lineHeight: "24px",
                        fontSize: 10,
                        color: "#888",
                      }}
                    >
                      …
                    </span>
                  ) : null}
                  <span
                    className="chip-filename"
                    title={t("chat.attachments.fileTitle", {
                      name: attachment.name,
                      size: formatBytes(attachment.size),
                    })}
                  >
                    {attachment.name}{" "}
                    {isPending
                      ? isUploading
                        ? t("chat.attachments.uploading")
                        : t("chat.attachments.loading")
                      : attachment.assetUrl
                        ? "✓"
                        : ""}
                  </span>
                  <button
                    type="button"
                    className="remove-chip-btn"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t("chat.attachments.remove", {
                      name: attachment.name,
                    })}
                    title={t("chat.attachments.removeTitle")}
                    disabled={isStreaming}
                  >
                    <X size={12} strokeWidth={1.5} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {hasImage && (
          <div
            className="attachment-preview-grid"
            role="group"
            aria-label={t("chat.attachments.label")}
          >
            {imageAttachments.map((attachment) => {
              const isPendingThumb =
                !attachment.thumb &&
                attachment.size <= MAX_IMAGE_THUMB_BYTES;
              const isUploading = Boolean(attachment.uploading);
              const isPending = isPendingThumb || isUploading;
              return (
                <div
                  key={attachment.id}
                  className="attachment-preview"
                  title={t("chat.attachments.fileTitle", {
                    name: attachment.name,
                    size: formatBytes(attachment.size),
                  })}
                >
                  {attachment.thumb ? (
                    <img
                      src={attachment.thumb}
                      alt={attachment.name}
                      className="attachment-preview-image"
                    />
                  ) : (
                    <span
                      className="attachment-preview-image is-placeholder"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  )}
                  {isPending && (
                    <span className="attachment-preview-status">
                      {isUploading
                        ? t("chat.attachments.uploading")
                        : t("chat.attachments.loading")}
                    </span>
                  )}
                  <button
                    type="button"
                    className="attachment-preview-remove"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t("chat.attachments.remove", {
                      name: attachment.name,
                    })}
                    title={t("chat.attachments.removeTitle")}
                    disabled={isStreaming}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title={t("chat.composer.attachFiles")}
          aria-label={t("chat.composer.attachFiles")}
          disabled={isStreaming}
        >
          <PlusIcon size={18} strokeWidth={2} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          name="attachments"
          className="visually-hidden-file-input"
          onChange={handleFileSelect}
          tabIndex={-1}
          aria-hidden="true"
        />
        <textarea
          ref={refToUse}
          id="corez-chat-input"
          name="message"
          className="chat-textarea"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handleInputPaste}
          placeholder={
            isStreaming
              ? t("chat.composer.placeholderStreaming")
              : t("chat.composer.placeholder")
          }
          aria-label={
            isStreaming
              ? t("chat.composer.ariaStreaming")
              : t("chat.composer.ariaMessage")
          }
          rows={1}
        />
        <div className="input-actions-bar">
          {isStreaming ? (
            <button
              type="button"
              className="send-btn stop-btn"
              onClick={onStopMessage}
              title={t("chat.composer.stopGeneration")}
            >
              <Square size={13} fill="currentColor" strokeWidth={1.5} />
            </button>
          ) : showDictationAction ? (
            <button
              type="button"
              className={`send-btn${isDictating ? " is-listening" : ""}`}
              onClick={() => {
                if (isDictating) stopDictation();
                else if (!isTranscribing) startDictation();
              }}
              aria-pressed={isDictating}
              aria-label={
                isTranscribing
                  ? t("chat.composer.transcribing")
                  : isDictating
                    ? t("chat.composer.dictating")
                    : t("chat.composer.dictate")
              }
              title={
                isTranscribing
                  ? t("chat.composer.transcribing")
                  : isDictating
                    ? t("chat.composer.dictating")
                    : t("chat.composer.dictate")
              }
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <Loader2
                  className="spin-icon"
                  size={17}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ) : isDictating ? (
                <MicOff size={17} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Mic size={17} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!hasComposerContent || hasPendingImage || isTranscribing}
              title={
                isTranscribing
                  ? t("chat.composer.transcribing")
                  : hasPendingImage
                    ? t("chat.composer.imageLoading")
                    : t("chat.composer.sendMessage")
              }
              aria-label={
                isTranscribing
                  ? t("chat.composer.transcribing")
                  : t("chat.composer.sendMessage")
              }
            >
              {isTranscribing ? (
                <Loader2
                  className="spin-icon"
                  size={17}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ) : (
                <ArrowUp size={17} strokeWidth={2.1} />
              )}
            </button>
          )}
        </div>
      </form>
      {footer}
    </div>
  );
}

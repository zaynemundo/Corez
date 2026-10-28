import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import ChatMessage from "../components/ChatMessage";
import { useI18n } from "../i18n/index.jsx";

/**
 * Public, read-only view of a shared conversation. It deliberately has no
 * composer, sidebar or message actions: the token only grants reading.
 */
export default function SharedChat() {
  const { token } = useParams();
  const { t } = useI18n();
  const [state, setState] = useState({
    loading: true,
    error: null,
    share: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, share: null });

    fetch(`/api/share/chat/${encodeURIComponent(token || "")}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            response.status === 404 ? "not-found" : "unavailable",
          );
        }
        return data;
      })
      .then((share) => {
        setState({ loading: false, error: null, share });
        document.title = `${share.title || t("chat.share.sharedLabel")} · COREZ`;
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState({
          loading: false,
          error: error?.message || "unavailable",
          share: null,
        });
      });

    return () => controller.abort();
  }, [token, t]);

  if (state.loading) {
    return (
      <div className="shared-chat-page" role="status" aria-live="polite">
        <div className="shared-chat-loading">
          <Loader2 className="spin-icon" size={20} strokeWidth={1.6} />
          <span>{t("common.status.loadingCorez")}</span>
        </div>
      </div>
    );
  }

  if (state.error || !state.share) {
    return (
      <div className="shared-chat-page">
        <header className="shared-chat-header">
          <Link to="/" className="shared-chat-brand">
            COREZ
          </Link>
        </header>
        <main className="shared-chat-unavailable">
          <Lock size={22} strokeWidth={1.5} aria-hidden="true" />
          <h1>{t("chat.share.unavailable")}</h1>
          <p>{t("chat.share.unavailableHint")}</p>
          <Link to="/" className="shared-chat-back">
            <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
            {t("chat.share.back")}
          </Link>
        </main>
      </div>
    );
  }

  const { share } = state;
  return (
    <div className="shared-chat-page">
      <header className="shared-chat-header">
        <Link to="/" className="shared-chat-brand">
          COREZ
        </Link>
        <span className="shared-chat-readonly">
          <Lock size={12} strokeWidth={1.8} aria-hidden="true" />
          {t("chat.share.readOnly")}
        </span>
      </header>

      <main className="shared-chat-main">
        <div className="shared-chat-title-block">
          <span className="shared-chat-kicker">
            {t("chat.share.sharedLabel")}
          </span>
          <h1>{share.title || t("common.sidebar.untitledChat")}</h1>
          <p>
            {t("chat.share.messages", {
              count: share.messages?.length || 0,
            })}
          </p>
        </div>

        <div className="shared-chat-messages">
          {(share.messages || []).map((message, index) => (
            <ChatMessage
              key={`${message.createdAt || "msg"}-${index}`}
              message={message}
              readOnly
            />
          ))}
        </div>

        <footer className="shared-chat-footer">
          <span>{t("chat.share.footer")}</span>
        </footer>
      </main>
    </div>
  );
}

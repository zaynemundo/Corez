import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, MessageCircle } from "lucide-react";

export function RailQuickSearchModal({
  railSearchOpen,
  railSearchPos,
  railSearchQuery,
  setRailSearchQuery,
  railSearchResults,
  activeSessionId,
  railSearchButtonRef,
  closeRailSearch,
  openRailSearchResult,
  t,
}) {
  const railSearchInputRef = useRef(null);

  useEffect(() => {
    if (!railSearchOpen) return undefined;
    railSearchInputRef.current?.focus();
    const dismissOnOutsidePress = (event) => {
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest(".sidebar-rail-search") ||
        railSearchButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      closeRailSearch();
    };
    const dismissOnEscape = (event) => {
      if (event.key !== "Escape") return;
      closeRailSearch();
      railSearchButtonRef.current?.focus();
    };
    const dismissOnViewportChange = (event) => {
      // Scrolling the result list itself is not the shell moving under the
      // popover; only a scroll outside the panel should dismiss it.
      if (
        event?.target instanceof Element &&
        event.target.closest(".sidebar-rail-search")
      ) {
        return;
      }
      closeRailSearch();
    };
    document.addEventListener("mousedown", dismissOnOutsidePress);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("resize", dismissOnViewportChange);
    window.addEventListener("scroll", dismissOnViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", dismissOnOutsidePress);
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("resize", dismissOnViewportChange);
      window.removeEventListener("scroll", dismissOnViewportChange, true);
    };
  }, [railSearchOpen, railSearchButtonRef, closeRailSearch]);

  if (!railSearchOpen) return null;

  return createPortal(
    <div
      id="sidebar-rail-search"
      className="sidebar-rail-search"
      role="dialog"
      aria-label={t("common.sidebar.searchChats")}
      style={{
        left: railSearchPos?.left ?? 0,
        top: railSearchPos?.top ?? 0,
      }}
    >
      <div className="sidebar-rail-search-field">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <input
          ref={railSearchInputRef}
          type="search"
          className="sidebar-rail-search-input"
          value={railSearchQuery}
          onChange={(event) => setRailSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && railSearchResults.length > 0) {
              event.preventDefault();
              openRailSearchResult(railSearchResults[0].id);
            }
          }}
          placeholder={t("common.sidebar.searchPlaceholder")}
          aria-label={t("common.sidebar.searchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {railSearchResults.length === 0 ? (
        <p className="sidebar-rail-search-empty" role="status">
          {t("common.sidebar.searchEmpty")}
        </p>
      ) : (
        <div className="sidebar-rail-search-results">
          {railSearchResults.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`sidebar-rail-search-result${
                session.id === activeSessionId ? " is-current" : ""
              }`}
              onClick={() => openRailSearchResult(session.id)}
              aria-current={
                session.id === activeSessionId ? "true" : undefined
              }
              title={session.title}
            >
              <MessageCircle size={15} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-rail-search-title">
                {session.title || t("common.sidebar.untitledChat")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

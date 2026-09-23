import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/index.jsx";
import {
  Settings,
  PanelLeft,
  MoreVertical,
  Trash2,
  SquarePen,
} from "lucide-react";

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onDeleteSession,
  activeView,
  theme,
  onToggleTheme,
  onCloseSidebar,
}) {
  // theme/onToggleTheme kept for backwards compat but now live inside SettingsModal
  void theme;
  void onToggleTheme;
  const { t } = useI18n();
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".history-item-menu")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <aside
      className={`sidebar ${isOpen ? "" : "collapsed"}`}
      aria-hidden={!isOpen}
      inert={!isOpen || undefined}
    >
      <div className="sidebar-header">
        <button
          className="brand-icon-toggle"
          onClick={onCloseSidebar}
          title={t("common.sidebar.collapse")}
        >
          <span className="brand-wordmark">COREZ</span>
        </button>
        <button
          className="sidebar-close-btn"
          onClick={onCloseSidebar}
          title={t("common.sidebar.collapse")}
          aria-label={t("common.sidebar.collapse")}
        >
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="sidebar-action-box">
        <button
          className="new-chat-btn"
          onClick={onNewChat}
          title={t("common.sidebar.newChatTitle")}
        >
          <SquarePen
            className="new-chat-icon"
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>{t("common.sidebar.newChat")}</span>
        </button>
      </div>

      <div className="chat-history-list">
        <div className="sidebar-chats-label">{t("common.sidebar.chats")}</div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item ${activeView === "chat" && session.id === activeSessionId ? "active" : ""}`}
            onClick={() => onSelectSession(session.id)}
            onKeyDown={(e) => {
              // Keyboard activation belongs to the container itself; key
              // events from nested buttons (options menu, delete) bubble up
              // here and must not select the conversation or block the
              // button's own activation.
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSession(session.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={t("common.sidebar.openConversation", {
              title: session.title,
            })}
            title={session.title}
          >
            <span className="history-item-title">{session.title}</span>
            <div className="history-item-menu">
              <button
                type="button"
                className="history-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === session.id ? null : session.id);
                }}
                title={t("common.sidebar.chatOptions")}
                aria-label={t("common.sidebar.optionsFor", {
                  title: session.title,
                })}
                aria-expanded={openMenuId === session.id}
              >
                <MoreVertical size={14} strokeWidth={1.5} />
              </button>
              {openMenuId === session.id && (
                <div
                  className="history-menu-dropdown"
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="history-menu-item delete"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onDeleteSession(session.id);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                    <span>{t("common.sidebar.delete")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <SidebarProfileRow onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

function SidebarProfileRow({ onOpenSettings }) {
  const { t } = useI18n();
  let auth;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const email = auth?.user?.email || "";
  const username = email ? email.split("@")[0] : t("common.sidebar.guest");
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const initial = displayName.charAt(0).toUpperCase() || "G";
  return (
    <div className="sidebar-profile-row">
      <div className="sidebar-profile-left" title={email}>
        <div className="sidebar-avatar" aria-hidden="true">
          {initial}
        </div>
        <span className="sidebar-username">{displayName}</span>
      </div>
      <button
        type="button"
        className="sidebar-settings-icon"
        onClick={onOpenSettings}
        aria-label={t("common.sidebar.openSettings")}
        title={t("common.sidebar.settings")}
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

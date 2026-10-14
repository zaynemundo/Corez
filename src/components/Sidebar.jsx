import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/index.jsx";
import {
  Settings,
  PanelLeft,
  MoreVertical,
  Trash2,
  SquarePen,
  ChevronRight,
  Check,
  Pencil,
  Plus,
} from "lucide-react";

// The tallest menu a row can open: move-to-project (label + its 180px list +
// separator + delete). Less room than this below the row means the menu would
// be clipped by the sidebar's scroll container.
const MENU_ROOM_PX = 260;

/**
 * True when a menu opened from `element` must grow upward. The menus are
 * absolutely positioned inside the sidebar's scrolling list, which clips
 * whatever passes its bottom edge — the user sees half a menu and no way to
 * scroll to the rest.
 */
function menuOpensUp(element) {
  const list = element?.closest?.(".chat-history-list");
  if (!list) return false;
  const row = element.getBoundingClientRect();
  const boundary = list.getBoundingClientRect();
  return boundary.bottom - row.bottom < MENU_ROOM_PX;
}

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
  // Project folders. `sessions[].projectId` is the grouping key; a chat whose
  // project is unknown (deleted in another tab) falls back to the plain list.
  projects = [],
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onMoveSessionToProject,
  onNewChatInProject,
}) {
  // theme/onToggleTheme kept for backwards compat but now live inside SettingsModal
  void theme;
  void onToggleTheme;
  const { t } = useI18n();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openProjectMenuId, setOpenProjectMenuId] = useState(null);
  // Which way the open menu grows. Recomputed on every open, never while it is
  // open, so scrolling under an open menu cannot flip it mid-interaction.
  const [menuDropUp, setMenuDropUp] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [busyProjectId, setBusyProjectId] = useState(null);
  // The plain "Chats" list is a disclosure: open by default, collapsed only
  // when the user says so (an explicit toggle must never spring back open).
  const [chatsOpen, setChatsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".history-item-menu")) {
        setOpenMenuId(null);
      }
      if (!event.target.closest(".project-item-menu")) {
        setOpenProjectMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const sessionsByProject = useMemo(() => {
    const grouped = new Map();
    for (const session of sessions) {
      if (!session?.projectId || !projectIds.has(session.projectId)) continue;
      const list = grouped.get(session.projectId);
      if (list) list.push(session);
      else grouped.set(session.projectId, [session]);
    }
    return grouped;
  }, [sessions, projectIds]);
  const ungroupedSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !session?.projectId || !projectIds.has(session.projectId),
      ),
    [sessions, projectIds],
  );

  // The chat being viewed must be reachable: its folder opens with it.
  const activeProjectId = useMemo(() => {
    const active = sessions.find((session) => session.id === activeSessionId);
    return active?.projectId && projectIds.has(active.projectId)
      ? active.projectId
      : null;
  }, [sessions, activeSessionId, projectIds]);
  useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjectIds((prev) => {
      if (prev.has(activeProjectId)) return prev;
      const next = new Set(prev);
      next.add(activeProjectId);
      return next;
    });
  }, [activeProjectId]);

  const toggleProject = (projectId) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const closeCreateProject = () => {
    setCreatingProject(false);
    setNewProjectName("");
  };

  const submitNewProject = async (event) => {
    event?.preventDefault();
    const name = newProjectName.trim();
    // `savingProject` also swallows a second Enter while the first request is
    // still in flight — two folders for one name is never what the user meant.
    if (!name || savingProject || typeof onCreateProject !== "function") return;
    setSavingProject(true);
    try {
      const created = await onCreateProject(name);
      closeCreateProject();
      if (created?.id) {
        setExpandedProjectIds((prev) => new Set(prev).add(created.id));
      }
    } catch {
      // The name stays in the field so the user can retry the same one.
    } finally {
      setSavingProject(false);
    }
  };

  const startChatInProject = async (projectId) => {
    if (busyProjectId || typeof onNewChatInProject !== "function") return;
    setBusyProjectId(projectId);
    try {
      await onNewChatInProject(projectId);
    } finally {
      setBusyProjectId(null);
    }
  };

  const startRenameProject = (project) => {
    setOpenProjectMenuId(null);
    setEditingProjectId(project.id);
    setEditingName(project.name);
  };

  const submitRenameProject = (projectId) => {
    const name = editingName.replace(/\s+/g, " ").trim();
    setEditingProjectId(null);
    setEditingName("");
    if (!name || typeof onRenameProject !== "function") return;
    onRenameProject(projectId, name);
  };

  // One renderer for a chat row, used inside a project and in the plain list.
  // `currentProjectId` is null in the plain list.
  const renderSessionRow = (session, currentProjectId) => (
    <div
      key={session.id}
      className={`history-item ${
        activeView === "chat" && session.id === activeSessionId ? "active" : ""
      }`}
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
            const opening = openMenuId !== session.id;
            if (opening) setMenuDropUp(menuOpensUp(e.currentTarget));
            setOpenMenuId(opening ? session.id : null);
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
            className={`history-menu-dropdown ${menuDropUp ? "drop-up" : ""}`}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {projects.length > 0 && (
              <>
                <div className="history-menu-label">
                  {t("common.sidebar.moveToProject")}
                </div>
                <div className="history-menu-scroll">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={`history-menu-item ${
                        project.id === currentProjectId ? "selected" : ""
                      }`}
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        if (project.id !== currentProjectId) {
                          onMoveSessionToProject(session.id, project.id);
                        }
                      }}
                    >
                      <span className="history-menu-item-title">
                        {project.name}
                      </span>
                      {project.id === currentProjectId && (
                        <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                  {currentProjectId && (
                    <button
                      type="button"
                      className="history-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        onMoveSessionToProject(session.id, null);
                      }}
                    >
                      <span className="history-menu-item-title">
                        {t("common.sidebar.noProject")}
                      </span>
                    </button>
                  )}
                </div>
                <div className="history-menu-separator" role="separator" />
              </>
            )}
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
  );

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
          onClick={() => {
            // A brand-new chat lands in the plain list: never leave it in a
            // section the user had folded away.
            setChatsOpen(true);
            onNewChat();
          }}
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
        <div className="sidebar-section-row">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => setProjectsOpen((prev) => !prev)}
            title={
              projectsOpen
                ? t("common.sidebar.collapseProjects")
                : t("common.sidebar.expandProjects")
            }
            aria-expanded={projectsOpen}
            aria-controls="sidebar-projects-list"
          >
            <span className="sidebar-section-label">
              {t("common.sidebar.projects")}
            </span>
            <ChevronRight
              className={`sidebar-chevron ${projectsOpen ? "expanded" : ""}`}
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="sidebar-section-add"
            onClick={() => {
              // Creating one implies seeing it: never open a field inside a
              // section the user had folded away.
              setProjectsOpen(true);
              setCreatingProject(true);
              setNewProjectName("");
            }}
            title={t("common.sidebar.newProject")}
            aria-label={t("common.sidebar.newProject")}
          >
            <Plus size={15} strokeWidth={1.5} />
          </button>
        </div>

        {projectsOpen && (
          <div className="sidebar-projects-list" id="sidebar-projects-list">
            {creatingProject && (
              <form className="project-name-form" onSubmit={submitNewProject}>
                <input
                  className="project-name-input"
                  autoFocus
                  value={newProjectName}
                  placeholder={t("common.sidebar.projectNamePlaceholder")}
                  aria-label={t("common.sidebar.projectNamePlaceholder")}
                  maxLength={60}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeCreateProject();
                  }}
                  onBlur={() => {
                    if (!newProjectName.trim()) closeCreateProject();
                  }}
                />
              </form>
            )}

            {projects.map((project) => {
              const isExpanded = expandedProjectIds.has(project.id);
              const projectSessions = sessionsByProject.get(project.id) || [];
              const isEditing = editingProjectId === project.id;
              const chatsRegionId = `project-chats-${project.id}`;
              return (
                <div className="project-group" key={project.id}>
                  <div
                    className={`history-item project-item ${
                      project.id === activeProjectId ? "active" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? chatsRegionId : undefined}
                    aria-label={t("common.sidebar.openProject", {
                      name: project.name,
                    })}
                    title={project.name}
                    onClick={() => {
                      if (!isEditing) toggleProject(project.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!isEditing) toggleProject(project.id);
                      }
                    }}
                  >
                    <ChevronRight
                      className={`sidebar-chevron ${isExpanded ? "expanded" : ""}`}
                      size={14}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {isEditing ? (
                      <input
                        className="project-name-input project-rename-input"
                        autoFocus
                        value={editingName}
                        aria-label={t("common.sidebar.renameProject")}
                        maxLength={60}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => submitRenameProject(project.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitRenameProject(project.id);
                          }
                          if (e.key === "Escape") {
                            setEditingProjectId(null);
                            setEditingName("");
                          }
                        }}
                      />
                    ) : (
                      <span className="history-item-title">{project.name}</span>
                    )}
                    {projectSessions.length > 0 && (
                      <span className="project-chat-count" aria-hidden="true">
                        {projectSessions.length}
                      </span>
                    )}
                    <div className="history-item-menu project-item-menu">
                      <button
                        type="button"
                        className="history-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const opening = openProjectMenuId !== project.id;
                          if (opening) setMenuDropUp(menuOpensUp(e.currentTarget));
                          setOpenProjectMenuId(opening ? project.id : null);
                        }}
                        title={t("common.sidebar.projectOptions")}
                        aria-label={t("common.sidebar.optionsForProject", {
                          name: project.name,
                        })}
                        aria-expanded={openProjectMenuId === project.id}
                      >
                        <MoreVertical size={14} strokeWidth={1.5} />
                      </button>
                      {openProjectMenuId === project.id && (
                        <div
                          className={`history-menu-dropdown ${menuDropUp ? "drop-up" : ""}`}
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="history-menu-item"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenameProject(project);
                            }}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                            <span>{t("common.sidebar.renameProject")}</span>
                          </button>
                          <button
                            type="button"
                            className="history-menu-item delete"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenProjectMenuId(null);
                              onDeleteProject(project.id);
                            }}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                            <span>{t("common.sidebar.deleteProject")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="project-chats" id={chatsRegionId}>
                      <button
                        type="button"
                        className="history-item project-new-chat"
                        onClick={() => startChatInProject(project.id)}
                        disabled={busyProjectId === project.id}
                        title={t("common.sidebar.newChatInProject", {
                          name: project.name,
                        })}
                        aria-label={t("common.sidebar.newChatInProject", {
                          name: project.name,
                        })}
                      >
                        <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                        <span className="history-item-title">
                          {t("common.sidebar.newChat")}
                        </span>
                      </button>
                      {projectSessions.length === 0 ? (
                        <div className="project-empty">
                          {t("common.sidebar.emptyProject")}
                        </div>
                      ) : (
                        projectSessions.map((session) =>
                          renderSessionRow(session, project.id),
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="sidebar-section-row">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => setChatsOpen((prev) => !prev)}
            title={
              chatsOpen
                ? t("common.sidebar.collapseChats")
                : t("common.sidebar.expandChats")
            }
            aria-expanded={chatsOpen}
            aria-controls="sidebar-chats-list"
          >
            <span className="sidebar-section-label">
              {t("common.sidebar.chats")}
            </span>
            <ChevronRight
              className={`sidebar-chevron ${chatsOpen ? "expanded" : ""}`}
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </div>

        {chatsOpen && (
          <div className="sidebar-chats-list" id="sidebar-chats-list">
            {ungroupedSessions.map((session) => renderSessionRow(session, null))}
          </div>
        )}
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

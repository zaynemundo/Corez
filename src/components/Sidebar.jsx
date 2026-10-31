import { useState, useEffect, useMemo, useRef } from "react";
import { useI18n } from "../i18n/index.jsx";
import { orderedListMembers } from "../services/chatOrdering";
import {
  PanelLeft,
  MoreVertical,
  SquarePen,
  ChevronRight,
  Folder,
  FolderOpen,
  Pin,
  PinOff,
  Plus,
  LayoutGrid,
} from "lucide-react";
import {
  menuPlacement,
  useSidebarMenuDismissal,
  SessionOptionsMenu,
  ProjectOptionsMenu,
} from "./sidebar/SidebarMenus.jsx";
import { SidebarProfileRow } from "./sidebar/SidebarProfiles.jsx";

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  // The Sites screen: every published page, with edits handed to a new chat.
  // Optional so the sidebar can render without it in isolation (tests, previews).
  onOpenSites,
  onOpenSettings,
  onDeleteSession,
  onShareSession,
  activeView,
  theme,
  onToggleTheme,
  onCloseSidebar,
  // The collapsed icon rail is still part of the shell, so its brand and
  // Recents controls expand the full panel through the app rather than
  // reaching for the parent's state.
  onOpenSidebar,
  // Project folders. `sessions[].projectId` is the grouping key; a chat whose
  // project is unknown (deleted in another tab) falls back to the plain list.
  projects = [],
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onMoveSessionToProject,
  onNewChatInProject,
  // Pinned chats. `sessions[].pinnedAt` is the flag; pinned chats are held in
  // their own section above the projects and leave the lists they came from.
  onTogglePinSession,
  // Manual drag order. `manualLists` holds the display lists the account has
  // arranged (`pinned`, `recents`, `project:<id>`); those sort by explicit
  // position and the rest by recency. `onReorderSession` persists one move.
  manualLists = [],
  onReorderSession,
}) {
  // theme/onToggleTheme kept for backwards compat but now live inside SettingsModal
  void theme;
  void onToggleTheme;
  const { t } = useI18n();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openProjectMenuId, setOpenProjectMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [gap, setGap] = useState(null);
  const [onto, setOnto] = useState(null);

  const clearDrag = () => {
    setDragging(null);
    setGap(null);
    setOnto(null);
  };

  function startRowDrag(event, session, listId) {
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, textarea, a")
    ) {
      event.preventDefault();
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", session.id);
      event.dataTransfer.effectAllowed = "move";
    }
    setDragging({ id: session.id, listId });
  }

  function rowDropPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [busyProjectId, setBusyProjectId] = useState(null);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const railBrandRef = useRef(null);
  const sidebarCloseRef = useRef(null);
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (wasOpen === isOpen) return;
    const desktop =
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(max-width: 767px)").matches;
    if (isOpen) {
      sidebarCloseRef.current?.focus({ preventScroll: true });
    } else if (desktop) {
      railBrandRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  useSidebarMenuDismissal({
    openMenuId,
    openProjectMenuId,
    setOpenMenuId,
    setOpenProjectMenuId,
    menuPos,
    setMenuPos,
    menuRef,
  });

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const sessionsByProject = useMemo(() => {
    const grouped = new Map();
    for (const project of projects) {
      const members = orderedListMembers(
        sessions,
        `project:${project.id}`,
        projectIds,
        manualLists,
      );
      if (members.length > 0) grouped.set(project.id, members);
    }
    return grouped;
  }, [sessions, projects, projectIds, manualLists]);

  const pinnedSessions = useMemo(
    () => orderedListMembers(sessions, "pinned", projectIds, manualLists),
    [sessions, projectIds, manualLists],
  );

  const ungroupedSessions = useMemo(
    () => orderedListMembers(sessions, "recents", projectIds, manualLists),
    [sessions, projectIds, manualLists],
  );

  const activeProjectId = useMemo(() => {
    const active = sessions.find((session) => session.id === activeSessionId);
    return active?.projectId && projectIds.has(active.projectId)
      ? active.projectId
      : null;
  }, [sessions, activeSessionId, projectIds]);
  useEffect(() => {
    if (!activeProjectId) return;
    setProjectsOpen(true);
    setExpandedProjectIds((prev) => {
      if (prev.has(activeProjectId)) return prev;
      const next = new Set(prev);
      next.add(activeProjectId);
      return next;
    });
  }, [activeProjectId]);

  const activeIsPinned = useMemo(() => {
    const active = sessions.find((session) => session.id === activeSessionId);
    return Boolean(active?.pinnedAt);
  }, [sessions, activeSessionId]);
  useEffect(() => {
    if (activeIsPinned) setPinnedOpen(true);
  }, [activeIsPinned]);

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

  const renderSessionRow = (session, currentProjectId, listId) => (
    <div
      key={session.id}
      className={`history-item ${
        activeView === "chat" && session.id === activeSessionId ? "active" : ""
      }${dragging?.id === session.id ? " dragging" : ""}${
        gap?.rowId === session.id
          ? gap.position === "before"
            ? " drop-before"
            : " drop-after"
          : ""
      }`}
      draggable
      onDragStart={(e) => startRowDrag(e, session, listId)}
      onDragEnd={clearDrag}
      onDragOver={(e) => {
        if (!dragging || dragging.id === session.id || dragging.listId !== listId) {
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const position = rowDropPosition(e);
        setGap((prev) =>
          prev?.rowId === session.id && prev?.position === position
            ? prev
            : { rowId: session.id, position },
        );
      }}
      onDrop={(e) => {
        if (!dragging || dragging.id === session.id || dragging.listId !== listId) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const drag = dragging;
        const position = rowDropPosition(e);
        clearDrag();
        if (typeof onReorderSession !== "function") return;
        onReorderSession(
          drag.id,
          position === "before"
            ? { beforeId: session.id }
            : { afterId: session.id },
        );
      }}
      onClick={() => onSelectSession(session.id)}
      onKeyDown={(e) => {
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
        {typeof onTogglePinSession === "function" && (
          <button
            type="button"
            className={`chat-pin-btn ${session.pinnedAt ? "pinned" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinSession(session.id);
            }}
            title={
              session.pinnedAt
                ? t("common.sidebar.unpin")
                : t("common.sidebar.pin")
            }
            aria-label={
              session.pinnedAt
                ? t("common.sidebar.unpin")
                : t("common.sidebar.pin")
            }
            aria-pressed={Boolean(session.pinnedAt)}
          >
            {session.pinnedAt ? (
              <PinOff size={14} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Pin size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          className="history-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            const opening = openMenuId !== session.id;
            if (opening) {
              setOpenProjectMenuId(null);
              setMenuPos(menuPlacement(e.currentTarget));
            }
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
          <SessionOptionsMenu
            session={session}
            currentProjectId={currentProjectId}
            projects={projects}
            menuRef={menuRef}
            menuPos={menuPos}
            setOpenMenuId={setOpenMenuId}
            onTogglePinSession={onTogglePinSession}
            onMoveSessionToProject={onMoveSessionToProject}
            onShareSession={onShareSession}
            onDeleteSession={onDeleteSession}
            t={t}
          />
        )}
      </div>
    </div>
  );

  return (
    <aside className={`sidebar ${isOpen ? "" : "collapsed"}`}>
      <div
        id="corez-sidebar-panel"
        className="sidebar-full"
        aria-hidden={!isOpen || undefined}
        inert={!isOpen ? "" : undefined}
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
            ref={sidebarCloseRef}
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

          {typeof onOpenSites === "function" && (
            <button
              type="button"
              className={`new-chat-btn sites-nav-btn${
                activeView === "sites" ? " active" : ""
              }`}
              onClick={onOpenSites}
              title={t("common.sidebar.sitesTitle")}
              aria-current={activeView === "sites" ? "page" : undefined}
            >
              <LayoutGrid
                className="new-chat-icon"
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{t("common.sidebar.sites")}</span>
            </button>
          )}
        </div>

        <div
          className="chat-history-list"
          onDragOver={(e) => {
            if (!dragging) return;
            if (
              e.target instanceof Element &&
              e.target.closest(
                ".history-item, .project-group, .sidebar-pinned-section",
              )
            ) {
              return;
            }
            setGap(null);
            setOnto(null);
          }}
        >
          <div
            className={`sidebar-pinned-section${
              onto?.kind === "pinned" ? " drop-target-active" : ""
            }`}
            onDragOver={(e) => {
              if (!dragging || dragging.listId === "pinned") return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
              setOnto((prev) =>
                prev?.kind === "pinned" ? prev : { kind: "pinned" },
              );
            }}
            onDrop={(e) => {
              if (!dragging || dragging.listId === "pinned") return;
              e.preventDefault();
              e.stopPropagation();
              const drag = dragging;
              clearDrag();
              if (typeof onTogglePinSession !== "function") return;
              onTogglePinSession(drag.id);
            }}
          >
            <div className="sidebar-section-row">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setPinnedOpen((prev) => !prev)}
                title={
                  pinnedOpen
                    ? t("common.sidebar.collapsePinned")
                    : t("common.sidebar.expandPinned")
                }
                aria-expanded={pinnedOpen}
                aria-controls="sidebar-pinned-list"
              >
                <span className="sidebar-section-label">
                  {t("common.sidebar.pinned")}
                </span>
                <ChevronRight
                  className={`sidebar-chevron ${pinnedOpen ? "expanded" : ""}`}
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </div>

            {pinnedOpen && (
              <div className="sidebar-pinned-list" id="sidebar-pinned-list">
                {pinnedSessions.map((session) =>
                  renderSessionRow(
                    session,
                    session.projectId || null,
                    "pinned",
                  ),
                )}
              </div>
            )}
          </div>

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
                  <div
                    className={`project-group${
                      onto?.kind === "project" && onto?.id === project.id
                        ? " drop-target-active"
                        : ""
                    }`}
                    key={project.id}
                    onDragOver={(e) => {
                      if (
                        !dragging ||
                        dragging.listId === `project:${project.id}`
                      ) {
                        return;
                      }
                      e.preventDefault();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                      setOnto((prev) =>
                        prev?.kind === "project" && prev?.id === project.id
                          ? prev
                          : { kind: "project", id: project.id },
                      );
                    }}
                    onDrop={(e) => {
                      if (
                        !dragging ||
                        dragging.listId === `project:${project.id}`
                      ) {
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      const drag = dragging;
                      clearDrag();
                      if (typeof onMoveSessionToProject !== "function") return;
                      onMoveSessionToProject(drag.id, project.id);
                    }}
                  >
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
                      {isExpanded ? (
                        <FolderOpen
                          className="project-folder-icon"
                          size={15}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      ) : (
                        <Folder
                          className="project-folder-icon"
                          size={15}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      )}
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
                        <span className="history-item-title">
                          {project.name}
                        </span>
                      )}
                      {projectSessions.length > 0 && (
                        <span className="project-chat-count" aria-hidden="true">
                          {projectSessions.length}
                        </span>
                      )}
                      {isExpanded && (
                        <button
                          type="button"
                          className="project-new-chat-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startChatInProject(project.id);
                          }}
                          disabled={busyProjectId === project.id}
                          title={t("common.sidebar.newChatInProject", {
                            name: project.name,
                          })}
                          aria-label={t("common.sidebar.newChatInProject", {
                            name: project.name,
                          })}
                        >
                          <SquarePen
                            className="new-chat-icon"
                            size={16}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      <div className="history-item-menu project-item-menu">
                        <button
                          type="button"
                          className="history-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const opening = openProjectMenuId !== project.id;
                            if (opening) {
                              setOpenMenuId(null);
                              setMenuPos(menuPlacement(e.currentTarget));
                            }
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
                          <ProjectOptionsMenu
                            project={project}
                            menuRef={menuRef}
                            menuPos={menuPos}
                            setOpenProjectMenuId={setOpenProjectMenuId}
                            startRenameProject={startRenameProject}
                            onDeleteProject={onDeleteProject}
                            t={t}
                          />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="project-chats" id={chatsRegionId}>
                        {projectSessions.length === 0 ? (
                          <div className="project-empty">
                            {t("common.sidebar.emptyProject")}
                          </div>
                        ) : (
                          projectSessions.map((session) =>
                            renderSessionRow(
                              session,
                              project.id,
                              `project:${project.id}`,
                            ),
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
              {ungroupedSessions.map((session) =>
                renderSessionRow(session, null, "recents"),
              )}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <SidebarProfileRow onOpenSettings={onOpenSettings} />
        </div>
      </div>

      <div className="sidebar-rail">
        <div className="sidebar-rail-top">
          <button
            ref={railBrandRef}
            type="button"
            className="sidebar-rail-brand"
            onClick={() =>
              isOpen ? onCloseSidebar?.() : onOpenSidebar?.()
            }
            title={
              isOpen
                ? t("common.sidebar.railToggle")
                : t("common.shell.openSidebar")
            }
            aria-label={
              isOpen
                ? t("common.sidebar.railToggle")
                : t("common.shell.openSidebar")
            }
            aria-controls="corez-sidebar-panel"
            aria-expanded={isOpen}
          >
            <img
              src="/corez-white.png"
              alt=""
              className="sidebar-rail-logo"
              aria-hidden="true"
            />
          </button>
        </div>

        <nav
          className="sidebar-rail-nav"
          aria-label={t("common.sidebar.primaryNavigation")}
        >
          <button
            type="button"
            className={`sidebar-rail-action${
              activeView === "chat" ? " sidebar-rail-action-primary" : ""
            }`}
            onClick={() => {
              setChatsOpen(true);
              onNewChat();
            }}
            title={t("common.sidebar.railNewChat")}
            aria-label={t("common.sidebar.railNewChat")}
          >
            <SquarePen size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>

          {typeof onOpenSites === "function" && (
            <button
              type="button"
              className={`sidebar-rail-action${
                activeView === "sites" ? " is-active" : ""
              }`}
              onClick={onOpenSites}
              title={t("common.sidebar.railSites")}
              aria-label={t("common.sidebar.railSites")}
              aria-current={activeView === "sites" ? "page" : undefined}
            >
              <LayoutGrid size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}

        </nav>
      </div>
    </aside>
  );
}

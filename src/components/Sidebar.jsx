import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/index.jsx";
import {
  orderedListMembers,
} from "../services/chatOrdering";
import {
  Settings,
  PanelLeft,
  MoreVertical,
  Trash2,
  SquarePen,
  ChevronRight,
  Folder,
  FolderOpen,
  Globe,
  Pin,
  PinOff,
  Check,
  Pencil,
  Plus,
} from "lucide-react";

// Fixed width of `.history-menu-dropdown` in index.css. The floating menu is
// placed from this number before it has ever rendered, so the two must stay in
// step (the responsive contract pins the 200px width).
const MENU_WIDTH_PX = 200;
const MENU_GAP_PX = 8;

/**
 * Where a row's menu floats for a given trigger. The menu is portaled to the
 * document body and pinned with `position: fixed`, so it escapes the sidebar's
 * clipping entirely: it opens just OUTSIDE the sidebar, beside its row, over
 * the content area — mirrored in RTL, where the sidebar sits on the right.
 * Both axes are clamped so a menu opened near an edge stays fully visible.
 */
function menuPlacement(trigger) {
  const rect = trigger.getBoundingClientRect();
  const rtl = document.documentElement.getAttribute("dir") === "rtl";
  const beside = rtl
    ? rect.left - MENU_WIDTH_PX - MENU_GAP_PX
    : rect.right + MENU_GAP_PX;
  const maxLeft = window.innerWidth - MENU_WIDTH_PX - MENU_GAP_PX;
  return {
    left: Math.max(MENU_GAP_PX, Math.min(beside, maxLeft)),
    top: rect.top,
  };
}

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  // The Sites screen: every published page, editable in place. Optional so the
  // sidebar can render without it in isolation (tests, story-style previews).
  onOpenSites,
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
  // Viewport position of the open menu (only one is ever open at a time).
  // Recomputed on every open; scrolling or resizing dismisses the menu instead
  // of letting it drift away from the row it belongs to.
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);
  // Drag and drop. `dragging` is the chat in flight (its id plus the list it
  // was picked up from); `gap` is a between-rows position inside the SAME
  // list; `onto` is a folder — or the Pinned section — under the pointer.
  // Only one is ever set. Touch devices have no HTML5 drag: the row menu
  // stays their path, so nothing here is the only way to file or pin.
  const [dragging, setDragging] = useState(null);
  const [gap, setGap] = useState(null);
  const [onto, setOnto] = useState(null);

  const clearDrag = () => {
    setDragging(null);
    setGap(null);
    setOnto(null);
  };

  // A drag starts from the row surface, never from its controls: beginning on
  // a button or inside the rename field would fight clicks and text selection.
  function startRowDrag(event, session, listId) {
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, textarea, a")
    ) {
      event.preventDefault();
      return;
    }
    // Firefox only drags when a payload is set.
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", session.id);
      event.dataTransfer.effectAllowed = "move";
    }
    setDragging({ id: session.id, listId });
  }

  // Gap position inside the hovered row: upper half lands before it, lower
  // half after it. Recomputed from the event at drop time, so the indicator
  // state can never disagree with where the pointer actually is.
  function rowDropPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [busyProjectId, setBusyProjectId] = useState(null);
  // Section disclosures. Recents ("Chats") is open on load; Pinned and
  // Projects start collapsed so the sidebar lands compact — they still expand
  // by click, and creating a project (or a new chat) opens the section its
  // content lands in. An explicit toggle must never spring back open.
  const [chatsOpen, setChatsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    const handleClickOutside = (event) => {
      // The menu is portaled to the body, so it is no longer a descendant of
      // the row that owns it: a mousedown inside the panel must not be read as
      // a click outside, or the item under the pointer would unmount before
      // its click fires.
      const insideMenu = Boolean(
        event.target.closest?.(".history-menu-dropdown"),
      );
      if (!insideMenu && !event.target.closest(".history-item-menu")) {
        setOpenMenuId(null);
      }
      if (!insideMenu && !event.target.closest(".project-item-menu")) {
        setOpenProjectMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The panel is measured after paint and nudged up when it would run past the
  // bottom edge; a panel taller than the viewport pins to the top gap.
  useLayoutEffect(() => {
    if (!menuPos || !menuRef.current) return;
    const { height } = menuRef.current.getBoundingClientRect();
    const maxTop = window.innerHeight - height - MENU_GAP_PX;
    const top = Math.max(MENU_GAP_PX, Math.min(menuPos.top, maxTop));
    if (top !== menuPos.top) setMenuPos((prev) => ({ ...prev, top }));
  }, [menuPos]);

  const anyMenuOpen = openMenuId !== null || openProjectMenuId !== null;
  useEffect(() => {
    if (!anyMenuOpen) return undefined;
    // A floating menu is pinned to viewport coordinates: the shell moving
    // under it would leave it pointing at nothing, so dismiss instead.
    // Scrolling the menu's own project list must not dismiss it.
    const dismiss = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".history-menu-dropdown")
      ) {
        return;
      }
      setOpenMenuId(null);
      setOpenProjectMenuId(null);
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [anyMenuOpen]);

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  // Each folder in display order: manual position when the account has
  // arranged that folder, otherwise most recently active first. Only folders
  // holding visible (unpinned) chats get an entry, as before.
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

  // Pinned chats in display order: manual position when the account has
  // arranged Pinned, otherwise most recently pinned first.
  const pinnedSessions = useMemo(
    () => orderedListMembers(sessions, "pinned", projectIds, manualLists),
    [sessions, projectIds, manualLists],
  );

  const ungroupedSessions = useMemo(
    () =>
      orderedListMembers(sessions, "recents", projectIds, manualLists),
    [sessions, projectIds, manualLists],
  );

  // The chat being viewed must be reachable: its section and its folder open
  // with it. Keyed on the project (not the session), so the effect only fires
  // when the viewed chat moves between places — folding a section and then
  // viewing another chat inside the same place never springs it back open.
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

  // Same reachability rule for a pinned chat being viewed: its section opens
  // with it. Keyed on the boolean, so unrelated session updates cannot refire
  // it and spring a deliberately folded section back open.
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
  // `currentProjectId` is the folder the row is shown in (null in the plain
  // list); `listId` is the display list it belongs to (`pinned`, `recents`,
  // `project:<id>`) and decides which drops a row accepts.
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
        // Gaps only join rows of the same list: reordering never files or
        // pins — dropping onto a folder or the Pinned section does that.
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
          // Not ours (a cross-list hover over a row): let it bubble to the
          // folder or Pinned section below, which may want it.
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
        {/* One-click pin toggle beside the options menu: no need to open the
            menu for the most common row action. */}
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
              // Only one menu is ever open, so only one position is tracked.
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
        {openMenuId === session.id &&
          createPortal(
            <div
              ref={menuRef}
              className="history-menu-dropdown"
              role="menu"
              style={{ left: menuPos?.left ?? 0, top: menuPos?.top ?? 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {typeof onTogglePinSession === "function" && (
                <>
                  <button
                    type="button"
                    className="history-menu-item"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onTogglePinSession(session.id);
                    }}
                  >
                    {session.pinnedAt ? (
                      <PinOff size={14} strokeWidth={1.5} />
                    ) : (
                      <Pin size={14} strokeWidth={1.5} />
                    )}
                    <span>
                      {session.pinnedAt
                        ? t("common.sidebar.unpin")
                        : t("common.sidebar.pin")}
                    </span>
                  </button>
                  <div className="history-menu-separator" role="separator" />
                </>
              )}
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
                          <Check
                            size={14}
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
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
            </div>,
            document.body,
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

        {typeof onOpenSites === "function" && (
          // Same row shape as New Chat: Sites is a place you go, not a section
          // you fold. aria-current marks it while the Sites screen is open.
          <button
            type="button"
            className={`new-chat-btn sites-nav-btn${
              activeView === "sites" ? " active" : ""
            }`}
            onClick={onOpenSites}
            title={t("common.sidebar.sitesTitle")}
            aria-current={activeView === "sites" ? "page" : undefined}
          >
            <Globe
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
          // Hovering empty list background is hovering no target: clear a
          // stale gap line or folder highlight. Rows, folders and the Pinned
          // section manage their own state below, so leave those alone.
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
        {/* Pinned chats sit above the projects, and the section is always
            there — an empty Pinned still shows its heading, so pinned chats
            have a visible home to return to. The whole section is a drop
            target: dropping a chat anywhere in it pins the chat. */}
        <div
          className={`sidebar-pinned-section${
            onto?.kind === "pinned" ? " drop-target-active" : ""
          }`}
          onDragOver={(e) => {
            if (!dragging || dragging.listId === "pinned") return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            setOnto((prev) => (prev?.kind === "pinned" ? prev : { kind: "pinned" }));
          }}
          onDrop={(e) => {
            if (!dragging || dragging.listId === "pinned") return;
            e.preventDefault();
            e.stopPropagation();
            const drag = dragging;
            clearDrag();
            // The section only ever shows unpinned chats arriving: a chat
            // that is already pinned has nothing to do here.
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
            {/* The row keeps its real folder so the menu can still offer
                "No project"; only the rendering place changes. An empty
                Pinned renders nothing: the section heading above is the
                whole empty state. */}
            {pinnedSessions.map((session) =>
              renderSessionRow(session, session.projectId || null, "pinned"),
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
                <div
                  className={`project-group${
                    onto?.kind === "project" && onto?.id === project.id
                      ? " drop-target-active"
                      : ""
                  }`}
                  key={project.id}
                  // The whole folder — header row and its chats — is one drop
                  // target: dropping files the chat into it. A same-list gap
                  // drop on one of its rows stops below and never reaches
                  // here; anything arriving here is a chat from elsewhere.
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
                      <span className="history-item-title">{project.name}</span>
                    )}
                    {projectSessions.length > 0 && (
                      <span className="project-chat-count" aria-hidden="true">
                        {projectSessions.length}
                      </span>
                    )}
                    {/* New chat lives on the folder row, beside the options
                        menu, so an open project never needs a trip into the
                        nested list to start its next chat. */}
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
                            // Only one menu is ever open, so only one position
                            // is tracked.
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
                      {openProjectMenuId === project.id &&
                        createPortal(
                          <div
                            ref={menuRef}
                            className="history-menu-dropdown"
                            role="menu"
                            style={{
                              left: menuPos?.left ?? 0,
                              top: menuPos?.top ?? 0,
                            }}
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
                          </div>,
                          document.body,
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

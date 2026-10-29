import { useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  Pin,
  PinOff,
  Check,
  Share2,
  Trash2,
  Pencil,
} from "lucide-react";

// Fixed width of `.history-menu-dropdown` in index.css. The floating menu is
// placed from this number before it has ever rendered, so the two must stay in
// step (the responsive contract pins the 200px width).
export const MENU_WIDTH_PX = 200;
export const MENU_GAP_PX = 8;

/**
 * Where a row's menu floats for a given trigger. The menu is portaled to the
 * document body and pinned with `position: fixed`, so it escapes the sidebar's
 * clipping entirely: it opens just OUTSIDE the sidebar, beside its row, over
 * the content area — mirrored in RTL, where the sidebar sits on the right.
 * Both axes are clamped so a menu opened near an edge stays fully visible.
 */
export function menuPlacement(trigger) {
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

export function useSidebarMenuDismissal({
  openMenuId,
  openProjectMenuId,
  setOpenMenuId,
  setOpenProjectMenuId,
  menuPos,
  setMenuPos,
  menuRef,
}) {
  useEffect(() => {
    const handleClickOutside = (event) => {
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
  }, [setOpenMenuId, setOpenProjectMenuId]);

  useLayoutEffect(() => {
    if (!menuPos || !menuRef.current) return;
    const { height } = menuRef.current.getBoundingClientRect();
    const maxTop = window.innerHeight - height - MENU_GAP_PX;
    const top = Math.max(MENU_GAP_PX, Math.min(menuPos.top, maxTop));
    if (top !== menuPos.top) setMenuPos((prev) => ({ ...prev, top }));
  }, [menuPos, setMenuPos, menuRef]);

  const anyMenuOpen = openMenuId !== null || openProjectMenuId !== null;
  useEffect(() => {
    if (!anyMenuOpen) return undefined;
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
  }, [anyMenuOpen, setOpenMenuId, setOpenProjectMenuId]);
}

export function SessionOptionsMenu({
  session,
  currentProjectId,
  projects,
  menuRef,
  menuPos,
  setOpenMenuId,
  onTogglePinSession,
  onMoveSessionToProject,
  onShareSession,
  onDeleteSession,
  t,
}) {
  return createPortal(
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
      {typeof onShareSession === "function" && (
        <>
          <button
            type="button"
            className="history-menu-item"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(null);
              onShareSession(session.id);
            }}
          >
            <Share2 size={14} strokeWidth={1.5} />
            <span>{t("common.sidebar.shareChat")}</span>
          </button>
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
  );
}

export function ProjectOptionsMenu({
  project,
  menuRef,
  menuPos,
  setOpenProjectMenuId,
  startRenameProject,
  onDeleteProject,
  t,
}) {
  return createPortal(
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
  );
}

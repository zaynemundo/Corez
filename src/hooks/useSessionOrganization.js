import { useState, useEffect, useRef, useCallback } from "react";
import * as chatService from "../services/chatService";
import { displayListKey, orderedListMembers } from "../services/chatOrdering";
import { takeChat, takeChatList } from "../services/chatPrefetch";
import {
  deleteSessionAppsInR2,
  unpublishSessionPages,
  claimPublishLineage,
} from "../services/appStorageService";
import { compactChatMessages, shouldCompact } from "../services/smartCompact";

// The chat read and the chat list boot in parallel. The list can land last and
// must not replace a transcript that has already loaded for the same id.
export function mergeLoadedSessions(incoming, previous) {
  if (!Array.isArray(previous) || previous.length === 0) return incoming;
  const loadedById = new Map();
  for (const session of previous) {
    if (session?._loaded) loadedById.set(session.id, session);
  }
  if (loadedById.size === 0) return incoming;
  return incoming.map((session) => {
    const loaded = loadedById.get(session.id);
    if (!loaded) return session;
    return {
      ...session,
      messages: loaded.messages || [],
      _loaded: true,
      _compactMeta: loaded._compactMeta,
      _fullMessages: loaded._fullMessages,
    };
  });
}

export function useSessionOrganization({
  user,
  activeSessionId,
  navigate,
  setActiveView,
  setCanvasOpen,
  setCanvasFullScreen,
  setActiveCanvasCode,
  setRevisionContextCode,
  setSettingsOpen,
}) {
  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [projects, setProjects] = useState([]);
  // Display lists the account has manually arranged (`pinned`, `recents`,
  // `project:<id>`). The sidebar sorts those by explicit position and the
  // rest by recency; a successful reorder adds its list here.
  const [manualLists, setManualLists] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedCompactIds, setExpandedCompactIds] = useState(() => new Set());

  const lineageSyncedRef = useRef(false);
  const fetchingChatIdsRef = useRef(new Set());

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const manualListsRef = useRef(manualLists);
  useEffect(() => {
    manualListsRef.current = manualLists;
  }, [manualLists]);

  // -------------------------------------------------------------
  // Fetch chat list on mount / user change
  // -------------------------------------------------------------
  const fetchChatList = useCallback(async () => {
    if (!user) return;
    try {
      const [chatBody, projectList] = await Promise.all([
        takeChatList() ?? chatService.listChats(),
        chatService.listProjects().catch((e) => {
          console.warn("Failed to list projects:", e);
          return [];
        }),
      ]);
      const chats = Array.isArray(chatBody) ? chatBody : chatBody?.chats || [];
      const mapped = chats.map((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        projectId: c.projectId || null,
        pinnedAt: c.pinnedAt || null,
        sortOrder: c.sortOrder ?? null,
        _loaded: false,
      }));
      setSessions((prev) => mergeLoadedSessions(mapped, prev));
      setManualLists(
        Array.isArray(chatBody) ? [] : chatBody?.manualLists || [],
      );
      setProjects(
        projectList.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      );
      setSessionsLoaded(true);

      // Migration: if server has 0 chats but localStorage has sessions, migrate in BACKGROUND
      if (mapped.length === 0) {
        try {
          const saved = localStorage.getItem("corez_sessions");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const toMigrate = parsed
                .filter(
                  (s) =>
                    s && Array.isArray(s.messages) && s.messages.length > 0,
                )
                .slice(0, 5);
              if (toMigrate.length > 0) {
                (async () => {
                  try {
                    await Promise.all(
                      toMigrate.map(async (local) => {
                        try {
                          const title = local.title || "Migrated Conversation";
                          const created = await chatService.createChat({
                            title,
                          });
                          if (local.messages && local.messages.length > 0) {
                            const sanitized = local.messages.map((m, idx) => ({
                              role: m.role || "user",
                              content:
                                typeof m.content === "string" ? m.content : "",
                              attachments: m.attachments || null,
                              createdAt: Date.now() + idx,
                            }));
                            await chatService.putChat(created.id, {
                              messages: sanitized,
                            });
                          }
                        } catch (e) {
                          console.warn(
                            "Migration failed for session",
                            local.id,
                            e,
                          );
                        }
                      }),
                    );
                    const after = await chatService.listChats();
                    const afterChats = Array.isArray(after)
                      ? after
                      : after?.chats || [];
                    setSessions((prev) =>
                      mergeLoadedSessions(
                        afterChats.map((c) => ({
                          id: c.id,
                          title: c.title,
                          messages: [],
                          createdAt: c.createdAt,
                          updatedAt: c.updatedAt,
                          projectId: c.projectId || null,
                          pinnedAt: c.pinnedAt || null,
                          sortOrder: c.sortOrder ?? null,
                          _loaded: false,
                        })),
                        prev,
                      ),
                    );
                    setManualLists(
                      Array.isArray(after) ? [] : after?.manualLists || [],
                    );
                    try {
                      localStorage.removeItem("corez_sessions");
                    } catch {}
                  } catch (e) {
                    console.warn("Background migration failed", e);
                  }
                })();
              }
            }
          }
        } catch (e) {
          console.warn("Chat migration check failed", e);
        }
      }
    } catch (e) {
      console.warn("Failed to list chats, falling back to localStorage:", e);
      try {
        const saved = localStorage.getItem("corez_sessions");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const conforming = parsed.filter(
              (s) => s && Array.isArray(s.messages),
            );
            setSessions(conforming.map((s) => ({ ...s, _loaded: true })));
          }
        }
      } catch {}
      setSessionsLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    fetchChatList();
  }, [fetchChatList]);

  useEffect(() => {
    if (!sessionsLoaded || lineageSyncedRef.current) return;
    lineageSyncedRef.current = true;
    claimPublishLineage().catch((err) =>
      console.warn("Could not sync the publish lineage:", err),
    );
  }, [sessionsLoaded]);

  // -------------------------------------------------------------
  // Fetch messages for active chat when URL changes — parallel, not blocked by chat list
  // -------------------------------------------------------------
  useEffect(() => {
    if (!activeSessionId) return;
    if (!user) return;
    const existing = sessionsRef.current.find((s) => s.id === activeSessionId);
    if (existing && existing._loaded) return;
    if (fetchingChatIdsRef.current.has(activeSessionId)) return;
    fetchingChatIdsRef.current.add(activeSessionId);

    let cancelled = false;
    const load = async () => {
      setChatLoading(true);
      try {
        const isExpanded = expandedCompactIds.has(activeSessionId);
        const prefetched = takeChat(activeSessionId);
        const data =
          !isExpanded && prefetched
            ? await prefetched
            : isExpanded
              ? await chatService.getChat(activeSessionId, { compact: false })
              : await chatService.getChat(activeSessionId, {
                  compact: true,
                  keep: 30,
                });
        if (cancelled) return;
        let msgs = Array.isArray(data.messages)
          ? data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments || undefined,
              ...(m._compactMeta ? { _compactMeta: m._compactMeta } : {}),
            }))
          : [];
        let compactMeta = data.compactMeta || null;
        let fullMessages = null;
        const bannerFromServer = msgs.find(
          (m) => m._compactMeta?.isCompactSummary,
        );
        if (bannerFromServer && !compactMeta)
          compactMeta = bannerFromServer._compactMeta;
        if (!compactMeta && !isExpanded && shouldCompact(msgs)) {
          const result = compactChatMessages(msgs);
          if (result.compacted) {
            msgs = result.displayMessages;
            compactMeta = result.meta;
            fullMessages = result.originalMessages;
          }
        }
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === activeSessionId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = {
              ...prev[idx],
              title: data.title,
              messages: msgs,
              _loaded: true,
              _compactMeta: compactMeta,
              _fullMessages: fullMessages,
            };
            return next;
          }
          return [
            {
              id: data.id,
              title: data.title,
              messages: msgs,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              projectId: data.projectId || null,
              _loaded: true,
              _compactMeta: compactMeta,
              _fullMessages: fullMessages,
            },
            ...prev,
          ];
        });
      } catch (e) {
        if (e?.status === 404 || e?.status === 403) {
          console.warn(
            "Chat not found or not authorized, redirecting to /",
            activeSessionId,
          );
          if (!cancelled) navigate("/", { replace: true });
        } else {
          console.warn("Failed to load chat", activeSessionId, e);
        }
      } finally {
        if (!cancelled) setChatLoading(false);
        fetchingChatIdsRef.current.delete(activeSessionId);
      }
    };
    load();
    return () => {
      cancelled = true;
      fetchingChatIdsRef.current.delete(activeSessionId);
    };
  }, [activeSessionId, user, navigate, expandedCompactIds]);

  const handleExpandCompact = async () => {
    if (!activeSessionId) return;
    const active = sessions.find((s) => s.id === activeSessionId);
    if (
      active?._fullMessages &&
      Array.isArray(active._fullMessages) &&
      active._fullMessages.length > 0
    ) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: active._fullMessages,
                _compactMeta: null,
                _fullMessages: null,
              }
            : s,
        ),
      );
      setExpandedCompactIds((prev) => {
        const n = new Set(prev);
        n.add(activeSessionId);
        return n;
      });
      return;
    }
    setChatLoading(true);
    try {
      const data = await chatService.getChat(activeSessionId, {
        compact: false,
      });
      const msgs = Array.isArray(data.messages)
        ? data.messages.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments || undefined,
          }))
        : [];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: msgs,
                _compactMeta: null,
                _fullMessages: null,
                _loaded: true,
              }
            : s,
        ),
      );
      setExpandedCompactIds((prev) => {
        const n = new Set(prev);
        n.add(activeSessionId);
        return n;
      });
    } catch (e) {
      console.warn("Failed to expand compacted chat", e);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCollapseCompact = () => {
    if (!activeSessionId) return;
    const active = sessions.find((s) => s.id === activeSessionId);
    const full = active?.messages;
    if (!full || !Array.isArray(full) || full.length === 0) return;
    if (shouldCompact(full)) {
      const result = compactChatMessages(full);
      if (result.compacted) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  messages: result.displayMessages,
                  _compactMeta: result.meta,
                  _fullMessages: result.originalMessages,
                }
              : s,
          ),
        );
      }
    }
    setExpandedCompactIds((prev) => {
      const n = new Set(prev);
      n.delete(activeSessionId);
      return n;
    });
  };

  const handleDeleteSession = async (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        navigate(`/chat/${remaining[0].id}`);
      } else {
        navigate("/");
      }
    }
    try {
      await chatService.deleteChat(id);
    } catch (e) {
      console.warn("Server delete failed, keeping optimistic", e);
    }
    deleteSessionAppsInR2(id).catch((err) =>
      console.warn("Failed to clean up session R2 apps:", err),
    );
    unpublishSessionPages(id).catch((err) =>
      console.warn("Failed to unpublish the deleted chat's page:", err),
    );
  };

  const handleClearAllHistory = async () => {
    const ids = sessions.map((s) => s.id);
    setSessions([]);
    setProjects([]);
    navigate("/");
    setActiveCanvasCode("");
    setSettingsOpen(false);
    try {
      await chatService.deleteAllChats();
    } catch (e) {
      console.warn("Server clear all failed", e);
      for (const id of ids) {
        chatService.deleteChat(id).catch(() => {});
      }
    }
    ids.forEach((id) => deleteSessionAppsInR2(id).catch(() => {}));
    ids.forEach((id) => unpublishSessionPages(id).catch(() => {}));
  };

  const handleCreateProject = useCallback(async (name) => {
    const created = await chatService.createProject({ name });
    const project = {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    setProjects((prev) => [
      project,
      ...prev.filter((p) => p.id !== project.id),
    ]);
    return project;
  }, []);

  const handleRenameProject = useCallback(async (projectId, name) => {
    const previousName =
      projectsRef.current.find((p) => p.id === projectId)?.name ?? null;
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name } : p)),
    );
    try {
      await chatService.renameProject(projectId, name);
    } catch (e) {
      console.warn("Failed to rename project:", e);
      if (previousName != null) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId ? { ...p, name: previousName } : p,
          ),
        );
      }
    }
  }, []);

  const handleDeleteProject = useCallback(async (projectId) => {
    const index = projectsRef.current.findIndex((p) => p.id === projectId);
    const project = index >= 0 ? projectsRef.current[index] : null;
    const affectedChatIds = sessionsRef.current
      .filter((s) => s.projectId === projectId)
      .map((s) => s.id);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setSessions((prev) =>
      prev.map((s) =>
        s.projectId === projectId ? { ...s, projectId: null } : s,
      ),
    );
    try {
      await chatService.deleteProject(projectId);
    } catch (e) {
      console.warn("Failed to delete project:", e);
      if (project) {
        setProjects((prev) => {
          if (prev.some((p) => p.id === projectId)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, project);
          return next;
        });
      }
      if (affectedChatIds.length > 0) {
        const affected = new Set(affectedChatIds);
        setSessions((prev) =>
          prev.map((s) => (affected.has(s.id) ? { ...s, projectId } : s)),
        );
      }
    }
  }, []);

  const handleMoveSessionToProject = useCallback(
    async (sessionId, projectId) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      const previousProjectId = session?.projectId || null;
      if (previousProjectId === projectId) return;
      const next = sessionsRef.current.map((s) =>
        s.id === sessionId ? { ...s, projectId: projectId || null } : s,
      );
      sessionsRef.current = next;
      setSessions(next);
      try {
        if (projectId) {
          await chatService.addChatToProject(projectId, sessionId);
        } else if (previousProjectId) {
          await chatService.removeChatFromProject(previousProjectId, sessionId);
        }
      } catch (e) {
        console.warn("Failed to move the chat:", e);
        const reverted = sessionsRef.current.map((s) =>
          s.id === sessionId ? { ...s, projectId: previousProjectId } : s,
        );
        sessionsRef.current = reverted;
        setSessions(reverted);
      }
    },
    [],
  );

  const handleTogglePinSession = useCallback(async (sessionId) => {
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    const previousPinnedAt = session?.pinnedAt || null;
    const pinned = !previousPinnedAt;
    const next = sessionsRef.current.map((s) =>
      s.id === sessionId ? { ...s, pinnedAt: pinned ? Date.now() : null } : s,
    );
    sessionsRef.current = next;
    setSessions(next);
    try {
      await chatService.setChatPinned(sessionId, pinned);
    } catch (e) {
      console.warn("Failed to pin the chat:", e);
      const reverted = sessionsRef.current.map((s) =>
        s.id === sessionId ? { ...s, pinnedAt: previousPinnedAt } : s,
      );
      sessionsRef.current = reverted;
      setSessions(reverted);
    }
  }, []);

  const handleReorderSession = useCallback(
    async (sessionId, { beforeId = null, afterId = null } = {}) => {
      const prev = sessionsRef.current;
      const prevManual = manualListsRef.current;
      const session = prev.find((s) => s.id === sessionId);
      if (!session) return;
      const projectIds = new Set(projectsRef.current.map((p) => p.id));
      const listKey = displayListKey(session, projectIds);
      const members = orderedListMembers(prev, listKey, projectIds, prevManual);
      if (!members.some((s) => s.id === sessionId)) return;
      const without = members.filter((s) => s.id !== sessionId);
      let to;
      if (beforeId !== null) {
        to = without.findIndex((s) => s.id === beforeId);
        if (to === -1) return;
      } else if (afterId !== null) {
        const after = without.findIndex((s) => s.id === afterId);
        if (after === -1) return;
        to = after + 1;
      } else {
        return;
      }
      const moved = [
        ...without.slice(0, to).map((s) => s.id),
        sessionId,
        ...without.slice(to).map((s) => s.id),
      ];
      const before = members.map((s) => s.id);
      if (
        moved.length === before.length &&
        moved.every((id, i) => id === before[i])
      ) {
        return;
      }
      const top = without.length + 1;
      const optimistic = new Map(moved.map((id, i) => [id, top - i]));
      const next = prev.map((s) =>
        optimistic.has(s.id) ? { ...s, sortOrder: optimistic.get(s.id) } : s,
      );
      const nextManual = prevManual.includes(listKey)
        ? prevManual
        : [...prevManual, listKey];
      sessionsRef.current = next;
      manualListsRef.current = nextManual;
      setSessions(next);
      setManualLists(nextManual);
      try {
        const result = await chatService.reorderChat(sessionId, {
          beforeId,
          afterId,
        });
        if (result && typeof result.sortOrder === "number") {
          const canonical = sessionsRef.current.map((s) =>
            s.id === sessionId ? { ...s, sortOrder: result.sortOrder } : s,
          );
          sessionsRef.current = canonical;
          setSessions(canonical);
        }
      } catch (e) {
        console.warn("Failed to reorder the chat:", e);
        sessionsRef.current = prev;
        manualListsRef.current = prevManual;
        setSessions(prev);
        setManualLists(prevManual);
      }
    },
    [],
  );

  const handleNewChatInProject = useCallback(
    async (projectId) => {
      setActiveView("chat");
      setCanvasOpen(false);
      setCanvasFullScreen(false);
      setActiveCanvasCode(null);
      setRevisionContextCode("");
      try {
        const created = await chatService.createChat({});
        let assigned = true;
        try {
          await chatService.addChatToProject(projectId, created.id);
        } catch (e) {
          assigned = false;
          console.warn("Failed to file the new chat into its project:", e);
        }
        const newSession = {
          id: created.id,
          title: created.title,
          messages: [],
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          projectId: assigned ? projectId : null,
          pinnedAt: null,
          sortOrder: created.sortOrder ?? null,
          _loaded: true,
        };
        setSessions((prev) => [newSession, ...prev]);
        navigate(`/chat/${created.id}`);
      } catch (e) {
        console.warn("Failed to create a chat in the project:", e);
        navigate("/");
      }
    },
    [
      navigate,
      setActiveView,
      setCanvasOpen,
      setCanvasFullScreen,
      setActiveCanvasCode,
      setRevisionContextCode,
    ],
  );

  return {
    sessions,
    setSessions,
    sessionsLoaded,
    projects,
    manualLists,
    chatLoading,
    expandedCompactIds,
    handleExpandCompact,
    handleCollapseCompact,
    handleDeleteSession,
    handleClearAllHistory,
    handleCreateProject,
    handleRenameProject,
    handleDeleteProject,
    handleMoveSessionToProject,
    handleTogglePinSession,
    handleReorderSession,
    handleNewChatInProject,
  };
}

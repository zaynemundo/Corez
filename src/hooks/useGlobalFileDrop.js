import { useEffect, useRef, useState } from "react";
import {
  processFiles,
  hasFiles,
  extractFilesFromClipboard,
} from "../utils/fileAttachmentUtils";

export function useGlobalFileDrop({ chatInputRef, setAttachments }) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleWindowDragEnter = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDraggingOver(true);
      }
    };
    const handleWindowDragLeave = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false);
      }
    };
    const handleWindowDragOver = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const handleWindowDrop = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processFiles(files, setAttachments);
        if (chatInputRef.current) {
          chatInputRef.current.focus();
        }
      }
    };
    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    // Global paste fallback: attach clipboard images pasted anywhere, including
    // as a safety net if the chat input's own onPaste did not handle the event
    // (already-handled pastes are skipped via defaultPrevented, and the input
    // handler's stopPropagation normally prevents double-processing).
    const handleWindowPaste = (e) => {
      if (e.defaultPrevented) return;
      let pastedFiles;
      try {
        pastedFiles = extractFilesFromClipboard(e.clipboardData);
      } catch {
        return;
      }
      if (pastedFiles.length === 0) return;
      e.preventDefault();
      processFiles(pastedFiles, setAttachments);
      if (chatInputRef.current) {
        chatInputRef.current.focus();
      }
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [chatInputRef, setAttachments]);

  const handleOverlayDrop = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files, setAttachments);
      if (chatInputRef.current) {
        chatInputRef.current.focus();
      }
    }
  };

  const handleOverlayDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
  };

  const handleOverlayDragOver = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  return {
    isDraggingOver,
    handleOverlayDrop,
    handleOverlayDragLeave,
    handleOverlayDragOver,
  };
}

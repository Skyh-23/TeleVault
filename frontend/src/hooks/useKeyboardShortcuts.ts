import { useCallback, useEffect } from "react";

interface KeyboardShortcutHandlers {
  onSelectAll: () => void;
  onDelete: () => void;
  onEscape: () => void;
  onSearch: () => void;
  onEnter?: () => void;
}

interface UseKeyboardShortcutsOptions extends KeyboardShortcutHandlers {
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

export function useKeyboardShortcuts({
  onSelectAll,
  onDelete,
  onEscape,
  onSearch,
  onEnter,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement | null;

      if (isEditableTarget(target)) {
        if (event.key === "Escape") {
          target?.blur();
          onEscape();
        }
        return;
      }

      const isModified = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isModified && key === "a") {
        event.preventDefault();
        onSelectAll();
        return;
      }

      if (isModified && key === "f") {
        event.preventDefault();
        onSearch();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onEnter?.();
      }
    },
    [enabled, onSelectAll, onDelete, onEscape, onSearch, onEnter]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

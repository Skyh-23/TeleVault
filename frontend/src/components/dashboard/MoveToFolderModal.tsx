import { Folder, HardDrive, X } from "lucide-react";
import { TelegramFolder } from "../../types";

interface MoveToFolderModalProps {
  folders: TelegramFolder[];
  onClose: () => void;
  onSelect: (id: number | null) => void;
  activeFolderId: number | null;
}

export function MoveToFolderModal({
  folders,
  onClose,
  onSelect,
  activeFolderId,
}: MoveToFolderModalProps) {
  const candidates = [
    ...(activeFolderId !== null
      ? [{ key: "root", id: null as number | null, label: "Saved Messages", isRoot: true }]
      : []),
    ...folders
      .filter((folder) => folder.id !== activeFolderId)
      .map((folder) => ({
        key: String(folder.id),
        id: folder.id as number | null,
        label: String(folder.name ?? "Folder"),
        isRoot: false,
      })),
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-telegram-border p-4">
          <h3 className="font-medium text-telegram-text">Move to folder</h3>
          <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {candidates.map((entry) => (
            <button
              key={entry.key}
              onClick={() => onSelect(entry.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-telegram-text transition-colors hover:bg-telegram-hover"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded ${
                  entry.isRoot
                    ? "bg-telegram-primary/20 text-telegram-primary"
                    : "bg-telegram-hover text-telegram-text"
                }`}
              >
                {entry.isRoot ? <HardDrive className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              </span>
              <span className="font-medium">{entry.label}</span>
            </button>
          ))}

          {candidates.length === 0 && (
            <p className="p-4 text-center text-xs text-telegram-subtext">
              No other folders available. Create one first!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

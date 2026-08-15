import { useState } from "react";
import { Download, Eye, Folder, Share2, Trash2 } from "lucide-react";
import { TelegramFile } from "../types";
import { FileTypeIcon } from "./FileTypeIcon";

interface FileRowProps {
  file: TelegramFile;
  selected: boolean;
  onFileClick: (e: React.MouseEvent, id: number) => void;
  onContextMenu: (e: React.MouseEvent, file: TelegramFile) => void;
  onPreview: (file: TelegramFile) => void;
  onShare: (file: TelegramFile) => void;
  onDownload: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onDragStart?: (fileId: number) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent, folderId: number) => void;
}

export function FileRow({
  file, selected, onFileClick, onContextMenu, onPreview, onShare, onDownload, onDelete, onDragStart, onDragEnd, onDrop,
}: FileRowProps) {
  const isFolder = file.type === "folder";
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onClick={(e) => onFileClick(e, file.id)}
      onContextMenu={(e) => onContextMenu(e, file)}
      draggable
      onDragStart={(e) => {
        onDragStart?.(file.id);
        e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => {
        if (isFolder) { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }
      }}
      onDragLeave={(e) => {
        if (isFolder) { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }
      }}
      onDrop={(e) => {
        if (isFolder) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          onDrop?.(e, file.id);
        }
      }}
      className={`group grid grid-cols-[2.5rem_2fr_6rem_9rem] gap-4 items-center px-4 py-3 rounded-2xl cursor-pointer border transition-all
        ${selected
          ? "bg-aurora-lavender/15 border-aurora-lavender/50"
          : "border-transparent hover:bg-white/60 dark:hover:bg-white/5"}
        ${isDragOver ? "ring-2 ring-aurora-mint bg-aurora-mint/15" : ""}`}
    >
      <div className="flex justify-center">
        {isFolder
          ? <Folder className="w-5 h-5 text-aurora-violet" />
          : <FileTypeIcon filename={file.name} className="w-5 h-5" />}
      </div>

      <div className="min-w-0 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-aurora-ink tracking-tight">{file.name}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
          <RowAction onClick={() => onPreview(file)} title="Preview"><Eye className="w-3.5 h-3.5" /></RowAction>
          {file.type !== "folder" && <RowAction onClick={() => onShare(file)} title="Share"><Share2 className="w-3.5 h-3.5" /></RowAction>}
          <RowAction onClick={() => onDownload(file.id, file.name)} title="Download"><Download className="w-3.5 h-3.5" /></RowAction>
          <RowAction danger onClick={() => onDelete(file.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></RowAction>
        </div>
      </div>

      <div className="text-right text-xs font-medium text-aurora-muted truncate">{file.sizeStr}</div>
      <div className="text-right text-[11px] text-aurora-faint font-mono truncate">{formatDate(file.created_at)}</div>
    </div>
  );
}

function formatDate(value?: string | number): string {
  if (!value) return "â€”";
  if (typeof value === "number") {
    // SQLite rows return epoch seconds.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toLocaleDateString();
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function RowAction({
  title, onClick, danger = false, children,
}: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-lg text-aurora-muted hover:bg-white/80 dark:hover:bg-white/10 transition-colors ${danger ? "hover:text-aurora-rose" : "hover:text-aurora-violet"}`}
    >
      {children}
    </button>
  );
}

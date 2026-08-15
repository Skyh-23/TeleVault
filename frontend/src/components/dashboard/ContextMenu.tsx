import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Pencil,
  Play,
  Share2,
  Trash2,
} from "lucide-react";
import { TelegramFile } from "../../types";
import { isMediaFile, isPdfFile } from "../../utils";

interface ContextMenuProps {
  x: number;
  y: number;
  file: TelegramFile;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onShare?: () => void;
}

interface MenuActionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

function MenuAction({ icon, label, onClick, className = "" }: MenuActionProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 rounded-xl transition-all text-left w-full ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

function clampMenuPosition(x: number, y: number, menuWidth: number, menuHeight: number) {
  return {
    left: x + menuWidth > window.innerWidth ? Math.max(x - menuWidth, 0) : x,
    top: y + menuHeight > window.innerHeight ? Math.max(y - menuHeight, 0) : y,
  };
}

export function ContextMenu({
  x,
  y,
  file,
  onClose,
  onDownload,
  onDelete,
  onPreview,
  onShare,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPlacement(clampMenuPosition(x, y, bounds.width, bounds.height));
  }, [x, y]);

  useLayoutEffect(() => {
    const dismiss = () => onClose();
    window.addEventListener("click", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("contextmenu", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("contextmenu", dismiss);
    };
  }, [onClose]);

  const previewLabel =
    file.type === "folder"
      ? "Open folder"
      : isMediaFile(file.name)
        ? "Play media"
        : isPdfFile(file.name)
          ? "View PDF document"
          : "Quick preview";

  const previewIcon =
    file.type === "folder" ? (
      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
    ) : isMediaFile(file.name) ? (
      <Play className="w-3.5 h-3.5 text-indigo-400" />
    ) : isPdfFile(file.name) ? (
      <FileText className="w-3.5 h-3.5 text-rose-400" />
    ) : (
      <Eye className="w-3.5 h-3.5 text-cyan-400" />
    );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[210px] bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-white/10 dark:border-slate-800 rounded-2xl shadow-2xl shadow-black/50 p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
      style={placement}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[190px] border-b border-white/5 dark:border-slate-800 mb-1">
        {file.name}
      </div>

      <MenuAction icon={previewIcon} label={previewLabel} onClick={onPreview} />

      <MenuAction
        icon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
        label="Download to PC"
        onClick={onDownload}
        className="hover:bg-emerald-500/20 hover:text-emerald-300"
      />

      {file.type !== "folder" && onShare && (
        <MenuAction
          icon={<Share2 className="w-3.5 h-3.5 text-purple-400" />}
          label="Share secure link"
          onClick={onShare}
          className="hover:bg-purple-500/20 hover:text-purple-300"
        />
      )}

      <button
        disabled
        className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-500 rounded-xl text-left w-full cursor-not-allowed opacity-40"
      >
        <Pencil className="w-3.5 h-3.5" />
        Rename item
      </button>

      <div className="h-px bg-white/5 dark:bg-slate-800 my-1" />

      <MenuAction
        icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
        label="Delete permanently"
        onClick={onDelete}
        className="text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Download, Eye, Folder, Share2, Trash2 } from "lucide-react";
import { TelegramFile } from "../types";
import { FileTypeIcon } from "./FileTypeIcon";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "mkv"];

const isImage = (name: string) => IMAGE_EXTS.includes(name.split(".").pop()?.toLowerCase() || "");
const isVideo = (name: string) => VIDEO_EXTS.includes(name.split(".").pop()?.toLowerCase() || "");

// â”€â”€ Thumbnail fetch concurrency guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The backend downloads thumbnail blocks from Telegram on cache misses.
// Firing 10+ at once (one per visible tile) can strain the MTProto session
// and contribute to disconnects. Cap concurrent fetches at 3.
const THUMB_MAX_CONCURRENT = 3;
let thumbActive = 0;
const thumbQueue: Array<() => void> = [];

function thumbRunNext() {
  if (thumbActive < THUMB_MAX_CONCURRENT && thumbQueue.length > 0) {
    thumbActive++;
    thumbQueue.shift()!();
  }
}

function fetchThumbnailLimited(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const task = () => {
      fetch(url)
        .then((res) => { thumbActive--; thumbRunNext(); resolve(res); })
        .catch((err) => { thumbActive--; thumbRunNext(); reject(err); });
    };
    thumbQueue.push(task);
    thumbRunNext();
  });
}

interface FileTileProps {
  file: TelegramFile;
  isSelected: boolean;
  height: number;
  activeFolderId: number | null;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onDownload: () => void;
  onShare: () => void;
  onPreview: () => void;
  onToggleSelection: () => void;
  onDrop?: (e: React.DragEvent, folderId: number) => void;
  onDragStart?: (fileId: number) => void;
  onDragEnd?: () => void;
}

export function FileTile({
  file, isSelected, activeFolderId, onClick, onContextMenu,
  onDelete, onDownload, onShare, onPreview, onToggleSelection,
  onDrop, onDragStart, onDragEnd,
}: FileTileProps) {
  const isFolder = file.type === "folder";
  const [isDragOver, setIsDragOver] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
    }, { threshold: 0.1 });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || isFolder || (!isImage(file.name) && !isVideo(file.name))) return;
    let mounted = true;
    fetchThumbnailLimited(`http://127.0.0.1:8765/thumbnail?message_id=${file.id}&folder_id=${activeFolderId || ""}`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("no thumbnail"))))
      .then((blob) => {
        if (!mounted) return;
        setThumbnail(URL.createObjectURL(blob));
      })
      .catch(() => { /* fall back to icon */ });
    return () => { mounted = false; };
  }, [file.id, file.name, activeFolderId, isFolder, isVisible]);

  return (
    <div
      ref={cardRef}
      className="relative h-full"
      onContextMenu={onContextMenu}
      onClick={onClick}
      onDragOver={(e) => {
        if (isFolder) { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }
      }}
      onDragLeave={(e) => {
        if (isFolder) { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }
      }}
      onDrop={(e) => {
        if (isFolder && onDrop) { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); onDrop(e, file.id); }
      }}
    >
      <motion.div
        layout
        draggable={!isFolder}
        onDragStart={(e: any) => {
          onDragStart?.(file.id);
          e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => onDragEnd?.()}
        whileHover={{ y: -4 }}
        className={`group relative h-full rounded-[22px] overflow-hidden glass-chip transition-all duration-200 cursor-pointer
          ${isSelected ? "ring-2 ring-aurora-violet bg-aurora-lavender/15" : "hover:border-aurora-line-strong"}
          ${isDragOver ? "ring-2 ring-aurora-mint scale-[1.03] bg-aurora-mint/15" : ""}`}
      >
        {/* Thumbnail or pastel icon area â€” no gradient wash over thumbnails */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={file.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isFolder ? (
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-aurora-violet/20 to-aurora-sky/20 flex items-center justify-center text-aurora-violet group-hover:scale-110 transition-transform">
                <Folder className="w-8 h-8" />
              </div>
            ) : (
              <FileTypeIcon filename={file.name} size="lg" />
            )}
          </div>
        )}

        {/* Selection checkbox */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelection(); }}
          className={`absolute top-3 left-3 w-[22px] h-[22px] rounded-lg border flex items-center justify-center transition-all z-20 cursor-pointer backdrop-blur-md
            ${isSelected ? "bg-gradient-to-tr from-aurora-violet to-aurora-lavender border-transparent text-white shadow-lavender" : "border-aurora-line-strong bg-white/70 opacity-0 group-hover:opacity-100"}`}
        >
          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </div>

        {/* Quick actions */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1 z-20">
          <TileAction title="Preview" onClick={onPreview}><Eye className="w-3.5 h-3.5" /></TileAction>
          {file.type !== "folder" && <TileAction title="Share" onClick={onShare}><Share2 className="w-3.5 h-3.5" /></TileAction>}
          <TileAction title="Download" onClick={onDownload}><Download className="w-3.5 h-3.5" /></TileAction>
          <TileAction title="Delete" danger onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></TileAction>
        </div>

        {/* Name + size â€” floating glass pill, keeps thumbnails clean */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10">
          <div className="rounded-xl bg-white/80 dark:bg-aurora-surface/85 backdrop-blur-md border border-white/70 dark:border-white/10 px-2.5 py-1.5 shadow-sm">
            <h3 className="text-[11px] font-bold text-aurora-ink truncate w-full tracking-tight" title={file.name}>{file.name}</h3>
            <p className="text-[10px] mt-0.5 font-medium text-aurora-muted">{file.sizeStr}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TileAction({
  title, onClick, danger = false, children,
}: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-lg backdrop-blur-md transition-all shadow-md ${
        danger ? "bg-white/80 text-aurora-rose hover:bg-aurora-rose hover:text-white" : "bg-white/80 text-aurora-ink-soft hover:bg-gradient-to-tr hover:from-aurora-violet hover:to-aurora-lavender hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

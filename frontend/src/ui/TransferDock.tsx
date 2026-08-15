import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Check, GripHorizontal, Minus, RefreshCw, X } from "lucide-react";
import { QueueItem, DownloadItem } from "../types";
import { ProgressTrack } from "./primitives";

interface TransferDockProps {
  uploads: QueueItem[];
  downloads: DownloadItem[];
  onClearUploads: () => void;
  onClearDownloads: () => void;
  onCancelUploads: () => void;
  onCancelDownloads: () => void;
  onResumeUpload: (id: string) => void;
  onResumeDownload: (id: string) => void;
  onRemoveUpload: (id: string) => void;
  onRemoveDownload: (id: string) => void;
}

type Tab = "uploads" | "downloads";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-aurora-lemon",
  resuming: "bg-aurora-lavender animate-pulse",
  uploading: "bg-aurora-violet animate-pulse",
  downloading: "bg-aurora-sky animate-pulse",
  success: "bg-aurora-mint",
  error: "bg-aurora-rose",
  cancelled: "bg-aurora-faint",
};

const DOCK_W = 380;
const MIN_X = 8;
const MIN_Y = 8;

export function TransferDock({
  uploads, downloads, onClearUploads, onClearDownloads,
  onCancelUploads, onCancelDownloads, onResumeUpload, onResumeDownload,
  onRemoveUpload, onRemoveDownload,
}: TransferDockProps) {
  const [tab, setTab] = useState<Tab>("uploads");
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef({ dx: 0, dy: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);

  const hasItems = uploads.length > 0 || downloads.length > 0;
  const activeUploads = uploads.filter((i) => i.status === "uploading" || i.status === "pending" || i.status === "resuming").length;
  const activeDownloads = downloads.filter((i) => i.status === "downloading" || i.status === "pending" || i.status === "resuming").length;
  const activeCount = activeUploads + activeDownloads;

  useEffect(() => {
    const saved = localStorage.getItem("tv_dock_pos");
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPosition({
          x: Math.min(Math.max(p.x, MIN_X), window.innerWidth - DOCK_W),
          y: Math.min(Math.max(p.y, MIN_Y), window.innerHeight - 120),
        });
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (position) localStorage.setItem("tv_dock_pos", JSON.stringify(position));
  }, [position]);

  // Drag works from the very first attempt — fall back to the element's
  // current rect when no saved position exists yet.
  const startDrag = (e: React.MouseEvent, el: HTMLElement | null) => {
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    setDragging(true);
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragMovedRef.current = false;
    if (!position) setPosition({ x: rect.left, y: rect.top });
  };

  const onDockMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // don't hijack header buttons
    startDrag(e, dockRef.current);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      // Track whether this press turned into a real drag (used by the pill
      // to avoid expanding when the user only meant to move it).
      if (Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y) > 6) {
        dragMovedRef.current = true;
      }
      const x = Math.min(Math.max(e.clientX - dragRef.current.dx, MIN_X), window.innerWidth - DOCK_W);
      const y = Math.min(Math.max(e.clientY - dragRef.current.dy, MIN_Y), window.innerHeight - 120);
      setPosition({ x, y });
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  // Explicit position, or bottom-center. Never mix `bottom` with `top` so the
  // panel keeps its natural height.
  const style = position
    ? { left: position.x, top: position.y }
    : { left: "calc(50% - 190px)", bottom: 24 };
  const pillStyle = position
    ? { left: position.x, top: position.y }
    : { right: 24, bottom: 24 };

  const items = tab === "uploads" ? uploads : downloads;
  const label = tab === "uploads" ? "Uploads" : "Downloads";
  const percentOf = (i: QueueItem | DownloadItem) => i.progress;

  // Minimized → compact restore pill. It always stays visible (even with zero
  // items) so the transfer history can never be lost.
  if (minimized) {
    return (
      <motion.button
        key="dock-pill"
        ref={pillRef}
        onClick={() => { if (dragMovedRef.current) return; setMinimized(false); }}
        onMouseDown={(e) => startDrag(e, pillRef.current)}
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        title="Open transfer history"
        className="fixed z-[80] flex items-center gap-2.5 rounded-full glass-panel-strong pl-3.5 pr-4 py-2.5 cursor-grab active:cursor-grabbing select-none touch-none shadow-[0_18px_45px_-18px_rgba(64,56,128,0.55)] hover:border-aurora-lavender/50 transition-colors"
        style={pillStyle}
      >
        {activeCount > 0 && (
          <span className="relative flex w-2 h-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aurora-violet opacity-60" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-aurora-violet" />
          </span>
        )}
        <span className={`flex items-center gap-1.5 text-[11px] font-bold ${activeUploads > 0 ? "text-aurora-violet" : "text-aurora-muted"}`}>
          <ArrowUpFromLine className="w-3.5 h-3.5" /> {uploads.length}
        </span>
        <span className="w-px h-4 bg-aurora-line/70" />
        <span className={`flex items-center gap-1.5 text-[11px] font-bold ${activeDownloads > 0 ? "text-aurora-sky" : "text-aurora-muted"}`}>
          <ArrowDownToLine className="w-3.5 h-3.5" /> {downloads.length}
        </span>
        <span className="text-[10px] font-semibold text-aurora-muted hidden sm:inline">history</span>
      </motion.button>
    );
  }

  return (
    <motion.div
      ref={dockRef}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="fixed z-[80]"
      style={style}
    >
      <div className="w-[380px] max-w-[92vw] rounded-[26px] glass-panel-strong overflow-hidden shadow-[0_28px_70px_-24px_rgba(64,56,128,0.45)]">
        {/* Dock header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-aurora-line/60 cursor-move select-none" onMouseDown={onDockMouseDown}>
          <GripHorizontal className="w-4 h-4 text-aurora-faint shrink-0" />
          <div className="flex items-center gap-1.5 flex-1">
            <DockTab active={tab === "uploads"} onClick={() => setTab("uploads")} icon={ArrowUpFromLine} label="Uploads" count={activeUploads} />
            <DockTab active={tab === "downloads"} onClick={() => setTab("downloads")} icon={ArrowDownToLine} label="Downloads" count={activeDownloads} />
          </div>
          <button onClick={() => setMinimized(true)} title="Minimize" className="p-1.5 rounded-full text-aurora-muted hover:text-aurora-ink hover:bg-aurora-line/40 transition-colors">
            <Minus className="w-4 h-4" />
          </button>
          {hasItems && (
            <button
              onClick={tab === "uploads" ? onClearUploads : onClearDownloads}
              title="Clear finished"
              className="text-[10px] font-bold text-aurora-muted hover:text-aurora-violet transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <AnimatePresence>
          {!minimized && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-h-64 overflow-y-auto p-2.5 space-y-2"
            >
              {activeCount > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={tab === "uploads" ? onCancelUploads : onCancelDownloads}
                    className="text-[10px] font-bold text-aurora-rose hover:text-rose-600 transition-colors"
                  >
                    Cancel all
                  </button>
                </div>
              )}
              {items.length === 0 && (
                <p className="text-center text-xs text-aurora-muted py-6">
                  Nothing {label.toLowerCase()} right now — new transfers appear here.
                </p>
              )}
              {items.map((item) => {
                const name = "filename" in item ? item.filename : (item.path.split(/[/\\]/).pop() || item.path);
                const status = item.status;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-white/60 dark:bg-white/5 border border-aurora-line/50 p-2.5"
                  >
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[status] || "bg-aurora-faint"}`} />
                      <span className="flex-1 truncate text-aurora-ink font-medium text-[11px]" title={name}>{name}</span>
                      {status === "success" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                      {status === "error" && (
                        <button onClick={() => (tab === "uploads" ? onResumeUpload(item.id) : onResumeDownload(item.id))} className="flex items-center gap-1 text-[10px] font-bold text-aurora-lavender hover:text-aurora-violet">
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      )}
                      <button onClick={() => (tab === "uploads" ? onRemoveUpload(item.id) : onRemoveDownload(item.id))} className="text-aurora-faint hover:text-aurora-ink transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {(status === "uploading" || status === "downloading" || status === "resuming" || status === "pending") && (
                      <ProgressTrack percent={percentOf(item)} variant={tab === "uploads" ? "aurora" : "rose"} className="mt-2" />
                    )}
                    {status === "error" && item.error && (
                      <p className="mt-1.5 text-[10px] text-aurora-rose/80 truncate">{item.error}</p>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DockTab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof ArrowUpFromLine; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
        active
          ? "bg-gradient-to-r from-aurora-violet/20 to-aurora-sky/20 text-aurora-violet border border-aurora-lavender/40"
          : "text-aurora-muted hover:text-aurora-ink"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count > 0 && (
        <span className={`px-1.5 rounded-full text-[9px] ${active ? "bg-aurora-violet text-white" : "bg-aurora-line text-aurora-muted"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

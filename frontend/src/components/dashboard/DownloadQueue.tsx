import {
  AlertCircle,
  Check,
  Download,
  GripHorizontal,
  Maximize2,
  Minus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DownloadItem } from "../../types";

interface DownloadQueueProps {
  items: DownloadItem[];
  onClearFinished: () => void;
  onCancelAll: () => void;
  onResume: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

const POSITION_STORAGE_KEY = "download_panel_pos";
const PANEL_OFFSET_X = 340;
const PANEL_OFFSET_Y = 180;
const AUTO_CLEANUP_MS = 4000;

const isBusy = (item: DownloadItem) =>
  item.status === "pending" || item.status === "resuming" || item.status === "downloading";

function StatusBadge({ item }: { item: DownloadItem }) {
  const status = item.status;

  if (status === "pending") {
    return (
      <span className="w-3 h-3 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center">
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
      </span>
    );
  }
  if (status === "resuming") {
    return (
      <span className="w-3 h-3 rounded-full bg-purple-400/20 border border-purple-400/50 flex items-center justify-center">
        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
      </span>
    );
  }
  if (status === "downloading") {
    return <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />;
  }
  if (status === "success") {
    return (
      <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
        <Check className="w-2 h-2 text-emerald-400" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center">
        <X className="w-2 h-2 text-rose-400" />
      </span>
    );
  }
  return (
    <span className="w-3 h-3 rounded-full bg-slate-600/50 flex items-center justify-center">
      <X className="w-2 h-2 text-slate-400" />
    </span>
  );
}

function ProgressTrack({ item }: { item: DownloadItem }) {
  const showProgress = item.status === "downloading" || item.status === "resuming";
  if (!showProgress) return null;

  return (
    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
      {item.progress !== undefined ? (
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
          style={{ width: `${item.progress}%` }}
        />
      ) : (
        <div className="bg-cyan-500 h-full w-full animate-progress-indeterminate" />
      )}
    </div>
  );
}

function QueueRow({
  item,
  onResume,
  onRemoveItem,
}: {
  item: DownloadItem;
  onResume: (id: string) => void;
  onRemoveItem: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-shrink-0">
          <StatusBadge item={item} />
        </div>
        <div className="flex-1 truncate text-slate-300 text-[11px] font-medium" title={item.filename}>
          {item.filename}
        </div>
        {(item.status === "downloading" || item.status === "resuming") &&
          item.progress !== undefined && (
            <div className="text-[10px] text-cyan-400 font-mono font-bold">{item.progress}%</div>
          )}
        {item.status === "success" && <div className="text-[10px] text-emerald-400 font-semibold">Done</div>}
        {item.status === "cancelled" && <div className="text-[10px] text-slate-500">Cancelled</div>}
        <button
          onClick={() => onRemoveItem(item.id)}
          className="text-slate-500 hover:text-white transition-colors opacity-50 hover:opacity-100 ml-1"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <ProgressTrack item={item} />

      {item.status === "error" && (
        <button
          onClick={() => onResume(item.id)}
          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors font-semibold text-left"
        >
          ↻ Resume download
        </button>
      )}
      {item.status === "error" && item.error && (
        <div className="flex items-center gap-1 text-[10px] text-rose-400">
          <AlertCircle className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{item.error}</span>
        </div>
      )}
    </div>
  );
}

export function DownloadQueue({
  items,
  onClearFinished,
  onCancelAll,
  onResume,
  onRemoveItem,
}: DownloadQueueProps) {
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({
    x: window.innerWidth - PANEL_OFFSET_X,
    y: window.innerHeight - PANEL_OFFSET_Y,
  });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) setPosition(JSON.parse(saved));
    } catch {
      // Corrupt saved position — fall back to defaults.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  const beginDrag = (e: React.MouseEvent) => {
    setDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    if (!dragging) return;

    const move = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const stop = () => setDragging(false);

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging]);

  useEffect(() => {
    const timer = setInterval(() => {
      items.forEach((item) => {
        if (item.status === "cancelled" || item.status === "error" || item.status === "success") {
          onRemoveItem(item.id);
        }
      });
    }, AUTO_CLEANUP_MS);
    return () => clearInterval(timer);
  }, [items, onRemoveItem]);

  if (items.length === 0) return null;

  const activeCount = items.filter(isBusy).length;
  const completedCount = items.filter((item) => item.status === "success").length;

  return (
    <div
      className="fixed w-80 bg-slate-900/95 dark:bg-slate-950/95 border border-white/10 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[40] backdrop-blur-2xl"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2 cursor-move"
        onMouseDown={beginDrag}
      >
        <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
        <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <h4 className="text-xs font-bold text-white flex-1">Downloads</h4>
        {activeCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full">
            {activeCount} active
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMinimized((value) => !value);
          }}
          className="text-slate-500 hover:text-white transition-colors ml-1"
        >
          {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!minimized && (
        <>
          <div className="px-3 py-1.5 border-b border-white/5 flex justify-end gap-3">
            {activeCount > 0 && (
              <button
                onClick={onCancelAll}
                className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition-colors"
              >
                Cancel all
              </button>
            )}
            {completedCount > 0 && (
              <button
                onClick={onClearFinished}
                className="text-[10px] font-semibold text-cyan-400 hover:text-white transition-colors"
              >
                Clear finished
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
            {items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onResume={onResume}
                onRemoveItem={onRemoveItem}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

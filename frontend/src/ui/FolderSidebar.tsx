import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CloudSun, Folder as FolderIcon, FolderPlus, HardDrive, RefreshCw, Rocket, Trash2,
} from "lucide-react";
import { invoke } from "../lib/api";
import { formatBytes } from "../utils";
import { isAndroidNative } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { GlassButton } from "./primitives";
import type { Store } from "@tauri-apps/plugin-store";

interface FolderSidebarProps {
  folders: Array<{ id: number; name: string }>;
  activeFolderId: number | null;
  isSyncing: boolean;
  isConnected: boolean;
  store: Store | null;
  onSelect: (id: number | null) => void;
  onDrop: (e: React.DragEvent, folderId: number | null) => void;
  onDelete: (id: number, name: string) => void;
  onCreate: (name: string) => Promise<void>;
  onSync: () => void;
  onSyncAll: () => void;
}

interface FolderStats {
  files: number;
  size: number;
  latest?: string;
}

const EMPTY: FolderStats = { files: 0, size: 0 };

export function FolderSidebar({
  folders, activeFolderId, isSyncing, isConnected, store,
  onSelect, onDrop, onDelete, onCreate, onSync, onSyncAll,
}: FolderSidebarProps) {
  const [stats, setStats] = useState<Map<number | null, FolderStats>>(new Map());
  const [loadingStats, setLoadingStats] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // ── Fetch per-folder stats (count, size, latest file date) ─────────
  useEffect(() => {
    if (!store) return;
    let cancelled = false;

    const load = async () => {
      setLoadingStats(true);
      const targets: Array<number | null> = [null, ...folders.map((f) => f.id)];
      const results = await Promise.all(
        targets.map(async (id): Promise<[number | null, FolderStats]> => {
          try {
            const res = await invoke<any[]>("cmd_get_files", { folderId: id });
            let size = 0;
            let latest: string | undefined;
            for (const f of res) {
              const s = Number(f.size) || 0;
              size += s;
              const d = f.created_at;
              if (d && (!latest || String(d) > latest)) latest = String(d);
            }
            return [id, { files: res.length, size, latest }];
          } catch {
            return [id, { ...EMPTY }];
          }
        })
      );
      if (cancelled) return;
      setStats(new Map(results));
      setLoadingStats(false);
    };

    load();
    return () => { cancelled = true; };
    // Refetch after a sync completes (isSyncing flips false) and when folder list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, folders, isSyncing]);

  const allTargets: Array<number | null> = [null, ...folders.map((f) => f.id)];
  const totalFiles = allTargets.reduce<number>((acc, id) => acc + (stats.get(id)?.files ?? 0), 0);
  const totalSize = allTargets.reduce<number>((acc, id) => acc + (stats.get(id)?.size ?? 0), 0);

  const submitCreate = async () => {
    if (!newFolderName.trim()) return;
    try {
      await onCreate(newFolderName.trim());
      setNewFolderName("");
      setCreating(false);
    } catch { /* handled upstream */ }
  };

  const mobileVault = isAndroidNative();

  return (
    <aside className="relative z-20 w-[300px] shrink-0 h-full flex flex-col glass-panel rounded-l-[28px]! border-y-0 border-r-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-aurora-violet" />
          <span className="text-sm font-extrabold text-aurora-ink tracking-tight">Vault folders</span>
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-aurora-mint shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-aurora-rose"}`}
            title={isConnected ? "Connected to Telegram" : "Offline"}
          />
        </div>
        <ThemeToggle />
      </div>

      {/* Vault overview card */}
      <div className="px-4 pb-3">
        <div className="rounded-3xl bg-gradient-to-tr from-aurora-violet/15 via-aurora-sky/10 to-aurora-mint/15 border border-white/70 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-aurora-muted">Vault overview</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-2xl font-extrabold text-aurora-ink tracking-tight">{totalFiles}</p>
              <p className="text-[11px] font-semibold text-aurora-muted">files stored</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold text-aurora-violet">{formatBytes(totalSize)}</p>
              <p className="text-[11px] font-semibold text-aurora-muted">total size</p>
            </div>
          </div>
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-2 space-y-1.5">
        <FolderRow
          icon={<CloudSun className="w-4 h-4" />}
          name={mobileVault ? "Mobile Vault" : "Saved Messages"}
          active={activeFolderId === null}
          stats={stats.get(null)}
          loading={loadingStats}
          onClick={() => onSelect(null)}
          onDelete={undefined}
          onDrop={(e) => onDrop(e, null)}
        />
        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            icon={<FolderIcon className="w-4 h-4" />}
            name={folder.name}
            active={activeFolderId === folder.id}
            stats={stats.get(folder.id)}
            loading={loadingStats}
            onClick={() => onSelect(folder.id)}
            onDelete={() => onDelete(folder.id, folder.name)}
            onDrop={(e) => onDrop(e, folder.id)}
          />
        ))}

        {folders.length === 0 && (
          <p className="text-center text-[11px] text-aurora-faint py-6 px-4">
            No folders yet. Create one to organize your files.
          </p>
        )}
      </div>

      {/* Footer: create + sync */}
      <div className="px-4 pb-4 pt-2 space-y-2 border-t border-aurora-line/60">
        <AnimatePresence>
          {creating ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <input
                autoFocus
                name="new-folder-sidebar"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate();
                  if (e.key === "Escape") { setCreating(false); setNewFolderName(""); }
                }}
                onBlur={() => { if (!newFolderName.trim()) setCreating(false); }}
                placeholder="Folder name…"
                className="w-full rounded-2xl glass-panel px-4 py-2.5 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
              />
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border-2 border-dashed border-aurora-line-strong text-aurora-muted hover:text-aurora-violet hover:border-aurora-lavender text-xs font-bold transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> New folder
            </motion.button>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2">
          <GlassButton variant="primary" className="py-2! px-3! text-xs" onClick={onSync} disabled={isSyncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Scanning…" : "Scan"}
          </GlassButton>
          <GlassButton variant="sky" className="py-2! px-3! text-xs" onClick={onSyncAll} disabled={isSyncing}>
            <Rocket className="w-3.5 h-3.5" /> Sync all
          </GlassButton>
        </div>
      </div>
    </aside>
  );
}

function FolderRow({
  icon, name, active, stats, loading, onClick, onDelete, onDrop,
}: {
  icon: React.ReactNode;
  name: string;
  active: boolean;
  stats?: FolderStats;
  loading: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      onContextMenu={(e) => {
        if (onDelete) { e.preventDefault(); onDelete(); }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setIsOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        onDrop(e);
      }}
      className={`group cursor-pointer rounded-2xl px-3.5 py-3 border transition-all duration-200 ${
        active
          ? "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender"
          : isOver
            ? "bg-aurora-mint/15 border-aurora-mint/60 ring-2 ring-aurora-mint"
            : "border-transparent hover:bg-white/70 dark:hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            active ? "bg-white/20 text-white" : "bg-aurora-lavender/12 text-aurora-violet"
          }`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold truncate ${active ? "text-white" : "text-aurora-ink"}`}>{name}</p>
          <p className={`text-[10px] font-medium truncate mt-0.5 ${active ? "text-white/70" : "text-aurora-muted"}`}>
            {loading ? "…" : stats ? `${stats.files} file${stats.files === 1 ? "" : "s"} · ${formatBytes(stats.size)}` : "0 files"}
            {stats?.latest && ` · ${formatLatest(stats.latest)}`}
          </p>
        </div>

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete folder"
            className={`p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
              active ? "text-white/80 hover:bg-white/20" : "text-aurora-rose hover:bg-aurora-rose/15"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function formatLatest(value: string): string {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    const n = Number(value);
    if (!isNaN(n) && n > 0) return new Date(n > 1e12 ? n : n * 1000).toLocaleDateString();
    return value;
  }
  return parsed.toLocaleDateString();
}

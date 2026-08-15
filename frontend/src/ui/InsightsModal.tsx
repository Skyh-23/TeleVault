import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive, BarChart3, FileAudio, FileText, HardDrive, Image, RefreshCw, Video,
} from "lucide-react";
import { api } from "../lib/api";
import { tryReconnectTelegram, isNotConnectedError } from "../lib/reconnect";
import { formatBytes } from "../utils";
import { Modal, GlassButton } from "./primitives";

interface InsightsModalProps {
  activeFolderId: number | null;
  currentFolderName: string;
  onReconnect?: () => Promise<boolean>;
  onClose: () => void;
}

const CATEGORY_STYLE: Record<string, { label: string; icon: ReactNode; bar: string; chip: string }> = {
  videos: { label: "Videos", icon: <Video className="w-4 h-4" />, bar: "from-aurora-violet to-aurora-lavender", chip: "bg-aurora-violet/15 text-aurora-violet" },
  images: { label: "Images", icon: <Image className="w-4 h-4" />, bar: "from-aurora-sky to-aurora-cyan", chip: "bg-aurora-sky/15 text-sky-600" },
  audio: { label: "Audio", icon: <FileAudio className="w-4 h-4" />, bar: "from-aurora-mint to-emerald-400", chip: "bg-aurora-mint/20 text-emerald-600" },
  archives: { label: "Archives", icon: <Archive className="w-4 h-4" />, bar: "from-aurora-lemon to-amber-400", chip: "bg-aurora-lemon/25 text-amber-600" },
  documents: { label: "Documents", icon: <FileText className="w-4 h-4" />, bar: "from-aurora-rose to-pink-400", chip: "bg-aurora-rose/20 text-pink-600" },
  other: { label: "Other", icon: <HardDrive className="w-4 h-4" />, bar: "from-aurora-faint to-aurora-muted", chip: "bg-aurora-line text-aurora-ink-soft" },
};

export function InsightsModal({ activeFolderId, currentFolderName, onReconnect, onClose }: InsightsModalProps) {
  const [allFolders, setAllFolders] = useState(activeFolderId === null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (activeFolderId === null) setAllFolders(true);
  }, [activeFolderId]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["insights", activeFolderId, allFolders],
    queryFn: () => api.storageStats(activeFolderId, allFolders),
    retry: false,
  });

  // Reconnect first (if the session dropped), then refetch.
  const handleRetry = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      if (onReconnect && error && isNotConnectedError(error)) {
        await onReconnect();
      } else if (error && isNotConnectedError(error)) {
        await tryReconnectTelegram();
      }
    } finally {
      setReconnecting(false);
      refetch();
    }
  };

  const title = allFolders ? "Whole vault analytics" : `${currentFolderName} analytics`;

  return (
    <Modal
      title={title}
      subtitle="Everything about your vault, at a glance"
      onClose={onClose}
      maxWidth="max-w-3xl"
      icon={BarChart3}
    >
      {/* Scope toggle */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 rounded-full glass-chip p-1">
          <button
            onClick={() => setAllFolders(false)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${!allFolders ? "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender" : "text-aurora-muted hover:text-aurora-ink"}`}
          >
            Current folder
          </button>
          <button
            onClick={() => setAllFolders(true)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${allFolders ? "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender" : "text-aurora-muted hover:text-aurora-ink"}`}
          >
            All folders
          </button>
        </div>
        <GlassButton variant="soft" className="py-1.5! px-3! text-xs" onClick={handleRetry}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching || reconnecting ? "animate-spin" : ""}`} /> Refresh
        </GlassButton>
      </div>

      {isLoading ? (
        <div className="h-44 flex items-center justify-center text-sm text-aurora-muted">
          <div className="w-6 h-6 rounded-full border-2 border-aurora-lavender border-t-transparent animate-spin mr-3" />
          Calculating…
        </div>
      ) : error ? (
        <div className="rounded-3xl glass-chip border-aurora-rose/40 p-6 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-aurora-rose/15 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-aurora-rose" />
          </div>
          <div>
            <p className="text-sm font-bold text-aurora-ink">Analytics unavailable</p>
            <p className="mt-1 text-xs text-aurora-muted max-w-sm">
              {isNotConnectedError(error)
                ? "The Telegram session dropped. Reconnect to Telegram, then try again."
                : `Backend error: ${String(error)}`}
            </p>
          </div>
          <GlassButton variant="primary" className="py-2! px-4! text-xs" onClick={handleRetry} disabled={reconnecting}>
            <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
            {reconnecting ? "Reconnecting…" : "Retry"}
          </GlassButton>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Total files" value={String(data.total_files)} tone="violet" />
            <StatCard label="Total storage" value={formatBytes(data.total_size)} tone="sky" />
            <StatCard label="Network used" value={formatBytes((data.bandwidth?.up_bytes || 0) + (data.bandwidth?.down_bytes || 0))} tone="mint" sub={`↑ ${formatBytes(data.bandwidth?.up_bytes || 0)} · ↓ ${formatBytes(data.bandwidth?.down_bytes || 0)}`} />
            <StatCard label="Videos" value={String(data.videos)} tone="violet" />
            <StatCard label="Images" value={String(data.images)} tone="sky" />
            <StatCard label="Documents" value={String(data.docs)} tone="rose" />
          </div>

          {/* Category bars */}
          <section className="rounded-3xl glass-chip p-5">
            <h4 className="text-sm font-bold text-aurora-ink mb-4">Storage by file type</h4>
            <div className="space-y-3.5">
              {Object.entries(CATEGORY_STYLE).map(([key, style]) => {
                const cat = data.categories?.[key] || { files: 0, size: 0 };
                const percentage = data.total_size ? Math.round((cat.size / data.total_size) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                      <span className={`flex items-center gap-2 font-semibold px-2.5 py-0.5 rounded-full ${style.chip}`}>
                        {style.icon}{style.label}
                        <span className="opacity-70">{cat.files}</span>
                      </span>
                      <span className="text-aurora-ink-soft font-medium">{formatBytes(cat.size)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-aurora-line/40 overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-700`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Largest files */}
            <section className="rounded-3xl glass-chip p-5">
              <h4 className="text-sm font-bold text-aurora-ink mb-3">Largest files</h4>
              <div className="space-y-2.5">
                {data.largest_files?.length ? data.largest_files.map((file, index) => (
                  <div key={`${file.id}-${index}`} className="flex items-center gap-3 text-xs">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${index === 0 ? "bg-gradient-to-tr from-aurora-violet to-aurora-lavender text-white" : "bg-aurora-line text-aurora-muted"}`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-aurora-ink font-medium" title={file.name}>{file.name}</span>
                    <span className="shrink-0 text-aurora-muted">{formatBytes(file.size)}</span>
                  </div>
                )) : <p className="text-xs text-aurora-muted">No files found.</p>}
              </div>
            </section>

            {/* Folder usage */}
            <section className="rounded-3xl glass-chip p-5">
              <h4 className="text-sm font-bold text-aurora-ink mb-3">Usage by folder</h4>
              <div className="space-y-2.5">
                {data.folder_usage?.length ? data.folder_usage.map((folder) => (
                  <div key={String(folder.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 dark:bg-white/5 border border-aurora-line/50 px-3.5 py-2.5 text-xs">
                    <span className="truncate text-aurora-ink font-medium">
                      {folder.name}
                      <span className="text-aurora-muted font-normal"> · {folder.files} files</span>
                    </span>
                    <span className="shrink-0 text-aurora-muted">{formatBytes(folder.size)}</span>
                  </div>
                )) : <p className="text-xs text-aurora-muted">No folder usage data yet.</p>}
              </div>
            </section>
          </div>

          <p className="text-[11px] text-aurora-faint">
            Insights come from local metadata. Scanned folders: <span className="text-aurora-ink-soft font-semibold">{data.folders_scanned}</span>
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

const TONES: Record<string, string> = {
  violet: "from-aurora-violet/15 to-aurora-lavender/10 text-aurora-violet",
  sky: "from-aurora-sky/15 to-aurora-cyan/10 text-sky-600",
  mint: "from-aurora-mint/20 to-emerald-400/10 text-emerald-600",
  rose: "from-aurora-rose/20 to-pink-400/10 text-pink-600",
};

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-3xl border border-white/70 bg-gradient-to-br p-4 ${TONES[tone] || TONES.violet}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1.5 text-xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] font-medium opacity-60">{sub}</p>}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Clock3, Copy, Link2, Shield } from "lucide-react";
import { toast } from "sonner";
import { TelegramFile } from "../types";
import { api, ShareCreateResponse } from "../lib/api";
import { Modal, GlassButton } from "./primitives";

interface ShareModalProps {
  file: TelegramFile;
  activeFolderId: number | null;
  onClose: () => void;
}

function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    toast.success("Copied to clipboard");
  }
}

export function ShareModal({ file, activeFolderId, onClose }: ShareModalProps) {
  const [mode, setMode] = useState<"easy" | "secure">("secure");
  const [expiryHours, setExpiryHours] = useState("24");
  const [customKey, setCustomKey] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<ShareCreateResponse | null>(null);

  const { data: shares = [], isLoading, refetch } = useQuery({
    queryKey: ["shares", file.id],
    queryFn: () => api.listShares(file.id, true),
  });

  const activeShares = useMemo(() => shares.filter((s) => s.active), [shares]);

  const handleCreateShare = async () => {
    const hours = Number(expiryHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error("Expiry must be greater than 0 hours");
      return;
    }
    setIsCreating(true);
    try {
      const response = await api.createShare({
        messageId: file.id,
        folderId: activeFolderId,
        mode,
        expiresInSeconds: Math.floor(hours * 3600),
        key: customKey.trim() || undefined,
      });
      setCreatedShare(response);
      await refetch();
      toast.success("Share link generated");
    } catch (error) {
      toast.error(`Failed to create share: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (revokeId: string) => {
    setRevokingId(revokeId);
    try {
      await api.revokeShare(revokeId);
      await refetch();
      toast.success("Share revoked");
    } catch (error) {
      toast.error(`Failed to revoke: ${error}`);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Modal title="Share a link" subtitle={file.name} onClose={onClose} maxWidth="max-w-2xl" icon={Link2}>
      {/* Mode picker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <ModeCard
          active={mode === "secure"}
          onClick={() => setMode("secure")}
          icon={<Shield className="w-5 h-5" />}
          title="Secure share"
          desc="Link and key travel separately — recommended"
          tone="violet"
        />
        <ModeCard
          active={mode === "easy"}
          onClick={() => setMode("easy")}
          icon={<Link2 className="w-5 h-5" />}
          title="Easy share"
          desc="Single link that includes the key"
          tone="sky"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Expiry (hours)</span>
          <input
            type="number"
            min={1}
            max={720}
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
            className="w-full rounded-2xl glass-panel px-4 py-2.5 text-sm text-aurora-ink focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Custom key (optional)</span>
          <input
            type="text"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full rounded-2xl glass-panel px-4 py-2.5 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
          />
        </label>
      </div>

      <div className="flex justify-end mb-5">
        <GlassButton onClick={handleCreateShare} disabled={isCreating}>
          {isCreating ? "Generating…" : "Generate share link"}
        </GlassButton>
      </div>

      {createdShare && (
        <div className="rounded-3xl glass-chip p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-aurora-ink">Latest share</span>
            <span className="text-[11px] text-aurora-muted flex items-center gap-1.5">
              <Clock3 className="w-3 h-3" /> Expires {formatTimestamp(createdShare.expiry)}
            </span>
          </div>
          <CopyField label="Link" value={createdShare.link} />
          {createdShare.key && <CopyField label="Key (share separately)" value={createdShare.key} />}
          <p className="text-[11px] text-aurora-faint">Revoke ID: <span className="font-mono text-aurora-ink-soft">{createdShare.revokeId}</span></p>
        </div>
      )}

      {/* Active shares */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-aurora-ink">Active shares</h4>
        <button onClick={() => refetch()} className="text-xs font-semibold text-aurora-muted hover:text-aurora-violet transition-colors">Refresh</button>
      </div>

      {isLoading ? (
        <p className="text-sm text-aurora-muted">Loading shares…</p>
      ) : activeShares.length === 0 ? (
        <p className="text-sm text-aurora-muted">No active shares for this file.</p>
      ) : (
        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {activeShares.map((share) => (
            <div key={share.revokeId} className="flex items-center justify-between gap-3 rounded-2xl glass-chip px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-mono text-aurora-ink truncate">{share.revokeId}</div>
                <div className="text-[11px] text-aurora-muted mt-0.5">
                  {share.mode === "secure" ? "Secure" : "Easy"} · expires {formatTimestamp(share.expiry)}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(share.revokeId)}
                disabled={revokingId === share.revokeId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-aurora-rose bg-aurora-rose/10 hover:bg-aurora-rose/20 transition-colors disabled:opacity-60"
              >
                <Ban className="w-3 h-3" />
                {revokingId === share.revokeId ? "Revoking…" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ModeCard({ active, onClick, icon, title, desc, tone }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string; tone: "violet" | "sky" }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-3xl border p-4 transition-all ${
        active
          ? tone === "violet"
            ? "border-aurora-lavender/60 bg-aurora-lavender/10 shadow-lavender"
            : "border-aurora-sky/60 bg-aurora-sky/10 shadow-sky"
          : "glass-chip hover:border-aurora-line-strong"
      }`}
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-2.5 ${tone === "violet" ? "bg-aurora-violet/15 text-aurora-violet" : "bg-aurora-sky/15 text-sky-600"}`}>
        {icon}
      </div>
      <p className="text-sm font-bold text-aurora-ink">{title}</p>
      <p className="text-xs text-aurora-muted mt-0.5">{desc}</p>
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-aurora-muted mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          className="flex-1 min-w-0 rounded-xl bg-white/70 dark:bg-white/5 border border-aurora-line/60 px-3 py-2 text-xs text-aurora-ink font-mono"
        />
        <GlassButton variant="soft" className="p-2! px-3! py-1.5! text-xs!" onClick={() => copyText(value)}>
          <Copy className="w-3.5 h-3.5" /> Copy
        </GlassButton>
      </div>
    </div>
  );
}

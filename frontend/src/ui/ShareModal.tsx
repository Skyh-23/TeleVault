import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Clock3, Copy, KeyRound, Link2, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { TelegramFile } from "../types";
import { api, ChannelShareCreateResponse, ShareCreateResponse } from "../lib/api";
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

type ShareMode = "easy" | "secure" | "channel" | "strong";

const ACCESS_KEY_PREFIX = "SKYH256:";
const ACCESS_KEY_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$%&*()!+-_=?@#";

function generateAccessKey(): string {
  let random = "";
  for (let i = 0; i < 20; i++) {
    random += ACCESS_KEY_CHARS[Math.floor(Math.random() * ACCESS_KEY_CHARS.length)];
  }
  return `${ACCESS_KEY_PREFIX}${random}`;
}

export function ShareModal({ file, activeFolderId, onClose }: ShareModalProps) {
  // Default to the E2E channel share — the recommended flow for recipients.
  const [mode, setMode] = useState<ShareMode>("channel");
  const [expiryHours, setExpiryHours] = useState("24");
  const [customKey, setCustomKey] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [accessKey, setAccessKey] = useState(generateAccessKey);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<ShareCreateResponse | ChannelShareCreateResponse | null>(null);

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
    if ((mode === "channel" || mode === "strong") && sharePassword.trim().length < 12) {
      toast.error("Channel shares require a password of at least 12 characters");
      return;
    }
    setIsCreating(true);
    try {
      if (mode === "channel" || mode === "strong") {
        const response = await api.shareChannelCreate({
          messageId: file.id,
          folderId: activeFolderId,
          password: sharePassword.trim(),
          accessKey: mode === "strong" ? accessKey : undefined,
          expiresInSeconds: Math.floor(hours * 3600),
        });
        setCreatedShare(response);
        toast.success(
          mode === "strong" ? "Strong E2E share created (link + access key + password)" : "Encrypted channel share created"
        );
      } else {
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
      }
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <ModeCard
          active={mode === "secure"}
          onClick={() => setMode("secure")}
          icon={<Shield className="w-5 h-5" />}
          title="Secure link"
          desc="Link and key travel separately"
          tone="violet"
        />
        <ModeCard
          active={mode === "easy"}
          onClick={() => setMode("easy")}
          icon={<Link2 className="w-5 h-5" />}
          title="Easy link"
          desc="Single link that includes the key"
          tone="sky"
        />
        <ModeCard
          active={mode === "channel"}
          onClick={() => setMode("channel")}
          icon={<KeyRound className="w-5 h-5" />}
          title="Channel share"
          desc="E2E encrypted channel with password"
          tone="mint"
        />
        <ModeCard
          active={mode === "strong"}
          onClick={() => setMode("strong")}
          icon={<Shield className="w-5 h-5" />}
          title="Strong share"
          desc="Link + SKYH256 access key + password"
          tone="rose"
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
        {mode === "channel" || mode === "strong" ? (
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Share password (required)</span>
            <input
              type="password"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
              placeholder="At least 12 characters"
              className="w-full rounded-2xl glass-panel px-4 py-2.5 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
            />
          </label>
        ) : (
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
        )}
      </div>

      {mode === "channel" && (
        <p className="mb-4 text-[11px] leading-relaxed text-aurora-muted -mt-2">
          Creates a private Telegram channel, forwards this file's encrypted blocks into it, and
          locks everything with your password. The recipient joins with their own TeleVault account
          and enters the password to unlock — the file stays AES-256-GCM encrypted end-to-end.
        </p>
      )}

      {mode === "strong" && (
        <div className="mb-4 space-y-3 -mt-2">
          <p className="text-[11px] leading-relaxed text-aurora-muted">
            Strongest option: the recipient needs the link, the SKYH256 access key, AND the
            password. The access key is a random second factor — regenerate it as many times as
            you like before creating the share.
          </p>
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Access key (SKYH256:…)</span>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={accessKey}
                className="flex-1 min-w-0 rounded-xl bg-white/70 dark:bg-white/5 border border-aurora-line/60 px-3 py-2 text-xs text-aurora-ink font-mono"
              />
              <GlassButton variant="soft" className="p-2! px-3! py-1.5! text-xs!" onClick={() => setAccessKey(generateAccessKey())}>
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </GlassButton>
            </div>
          </label>
        </div>
      )}

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
          {"key" in createdShare && createdShare.key && <CopyField label="Key (share separately)" value={createdShare.key} />}
          {"mode" in createdShare && createdShare.mode === "strong" && createdShare.accessKey && (
            <CopyField label="Access key (share separately)" value={createdShare.accessKey} />
          )}
          <p className="text-[11px] text-aurora-faint">
            Revoke ID: <span className="font-mono text-aurora-ink-soft">{createdShare.revokeId}</span>
            {"mode" in createdShare && createdShare.mode === "password" && (
              <span className="ml-2 text-emerald-600">E2E channel share</span>
            )}
            {"mode" in createdShare && createdShare.mode === "strong" && (
              <span className="ml-2 text-rose-600">Strong share · access key + password</span>
            )}
          </p>
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
                  {share.kind === "channel" ? "E2E channel" : share.mode === "secure" ? "Secure" : "Easy"} · expires {formatTimestamp(share.expiry)}
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

function ModeCard({ active, onClick, icon, title, desc, tone }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string; tone: "violet" | "sky" | "mint" | "rose" }) {
  const activeStyles = {
    violet: "border-aurora-lavender/60 bg-aurora-lavender/10 shadow-lavender",
    sky: "border-aurora-sky/60 bg-aurora-sky/10 shadow-sky",
    mint: "border-emerald-300/60 bg-emerald-400/10 shadow-[0_0_20px_-5px_rgba(52,211,153,0.5)]",
    rose: "border-rose-300/60 bg-rose-400/10 shadow-[0_0_20px_-5px_rgba(251,113,133,0.5)]",
  }[tone];
  const iconStyles = {
    violet: "bg-aurora-violet/15 text-aurora-violet",
    sky: "bg-aurora-sky/15 text-sky-600",
    mint: "bg-emerald-400/15 text-emerald-600",
    rose: "bg-rose-400/15 text-rose-600",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-3xl border p-4 transition-all ${active ? activeStyles : "glass-chip hover:border-aurora-line-strong"}`}
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-2.5 ${iconStyles}`}>
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

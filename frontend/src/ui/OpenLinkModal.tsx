import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Eye, KeyRound, Link2, LoaderCircle, ShieldCheck, Unlock } from "lucide-react";
import { toast } from "sonner";
import { api, ChannelShareJoinResponse } from "../lib/api";
import { formatBytes } from "../utils";
import { GlassButton, Modal, ProgressTrack } from "./primitives";

interface OpenLinkModalProps {
  onClose: () => void;
}

type Step = "enter" | "joined" | "assembling" | "ready" | "error";

interface AssembledFile {
  blobUrl: string;
  name: string;
  mime: string;
}

export function OpenLinkModal({ onClose }: OpenLinkModalProps) {
  const [link, setLink] = useState("");
  const [password, setPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [step, setStep] = useState<Step>("enter");
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState<ChannelShareJoinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [assembled, setAssembled] = useState<AssembledFile | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const assembledRef = useRef<Blob | null>(null);

  const isMedia = useMemo(() => {
    const mime = joined?.file?.mime || "";
    return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  }, [joined]);

  const requiresAccessKey = useMemo(() => {
    // Detect the ak=1 marker in the pasted link so we can prompt for the key.
    const match = link.match(/[?&]ak=1([&\s]|$)/);
    return Boolean(match);
  }, [link]);

  const handleJoin = async () => {
    const trimmed = link.trim();
    if (!trimmed) {
      toast.error("Paste a TeleVault share link first");
      return;
    }
    if (!trimmed.startsWith("televault://share")) {
      setError("This doesn't look like a channel-share link. Channel-share links start with televault://share?rid=… Make sure the sharer used the \"Channel share\" option.");
      setStep("error");
      return;
    }
    if (!password) {
      toast.error("Enter the share password");
      return;
    }
    if (requiresAccessKey && !accessKey.trim()) {
      toast.error("This share requires the SKYH256 access key");
      return;
    }
    setError(null);
    setIsJoining(true);
    try {
      const result = await api.shareJoin(link.trim(), password, accessKey.trim() || undefined);
      setJoined(result);
      setStep("joined");
      toast.success("Link unlocked — file ready to receive");
    } catch (e) {
      setError(String(e));
      setStep("error");
    } finally {
      setIsJoining(false);
    }
  };

  const assemble = async () => {
    if (!joined) return;
    setStep("assembling");
    setProgress(0);
    try {
      const parts: ArrayBuffer[] = [];
      const total = joined.file.blocks.length;
      for (let i = 0; i < total; i++) {
        const block = await api.shareDownloadBlock(link.trim(), password, i, accessKey.trim() || undefined);
        parts.push(block);
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      const blob = new Blob(parts, { type: joined.file.mime || "application/octet-stream" });
      assembledRef.current = blob;
      setAssembled({
        blobUrl: URL.createObjectURL(blob),
        name: joined.file.name,
        mime: joined.file.mime || "application/octet-stream",
      });
      setStep("ready");
    } catch (e) {
      setError(String(e));
      setStep("error");
    }
  };

  const handleDownload = async () => {
    if (!assembled) {
      await assemble();
      if (!assembledRef.current) return;
    }
    const blob = assembledRef.current;
    if (!blob) return;
    const url = assembled?.blobUrl || URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = joined?.file?.name || "shared-file";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Download started");
  };

  const reset = () => {
    if (assembled?.blobUrl) URL.revokeObjectURL(assembled.blobUrl);
    assembledRef.current = null;
    setAssembled(null);
    setJoined(null);
    setStep("enter");
    setError(null);
    setProgress(0);
    setPreviewing(false);
    setAccessKey("");
  };

  return (
    <Modal
      title="Open a shared link"
      subtitle="Receive a file sent through a TeleVault channel share"
      onClose={onClose}
      maxWidth="max-w-xl"
      icon={Link2}
    >
      {step === "enter" || step === "error" ? (
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Share link</span>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="televault://share?rid=…&exp=…&inv=…&mid=…"
              className="w-full rounded-2xl glass-panel px-4 py-3 text-sm text-aurora-ink font-mono placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="The password the sharer set"
              className="w-full rounded-2xl glass-panel px-4 py-3 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
            />
          </label>
          {requiresAccessKey && (
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">Access key (SKYH256:…)</span>
              <input
                type="text"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="The SKYH256:… key shared separately by the sender"
                className="w-full rounded-2xl glass-panel px-4 py-3 text-sm text-aurora-ink font-mono placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60"
              />
            </label>
          )}

          {step === "error" && error && (
            <div className="rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 px-4 py-3 text-xs font-semibold text-aurora-rose">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-aurora-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Joined with your own Telegram account · E2E encrypted
            </p>
            <GlassButton onClick={handleJoin} disabled={isJoining}>
              {isJoining ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              {isJoining ? "Unlocking…" : "Unlock & join"}
            </GlassButton>
          </div>
        </div>
      ) : joined ? (
        <div className="space-y-4">
          {/* File card */}
          <div className="flex items-center gap-4 rounded-3xl glass-chip p-4">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-tr from-aurora-violet/20 to-aurora-sky/20 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-aurora-violet" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-aurora-ink truncate">{joined.file.name}</p>
              <p className="text-xs text-aurora-muted mt-0.5">
                {formatBytes(joined.file.size)} · {joined.file.blocks.length} block{joined.file.blocks.length === 1 ? "" : "s"}
              </p>
            </div>
            {joined.expiresAt > 0 && (
              <span className="text-[10px] font-bold text-aurora-faint shrink-0">
                Expires {new Date(joined.expiresAt * 1000).toLocaleString()}
              </span>
            )}
          </div>

          {/* Progress while assembling */}
          <AnimatePresence>
            {step === "assembling" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-aurora-muted">
                  <span>Decrypting blocks from the channel…</span>
                  <span>{progress}%</span>
                </div>
                <ProgressTrack percent={progress} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Preview */}
          <AnimatePresence>
            {assembled && step === "ready" && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {previewing && (
                  <div className="rounded-3xl overflow-hidden glass-panel-strong max-h-72 flex items-center justify-center">
                    {assembled.mime.startsWith("image/") ? (
                      <img src={assembled.blobUrl} alt={assembled.name} className="max-h-72 w-auto object-contain" />
                    ) : assembled.mime.startsWith("video/") ? (
                      <video src={assembled.blobUrl} controls className="max-h-72 w-full object-contain" />
                    ) : assembled.mime.startsWith("audio/") ? (
                      <div className="p-6 w-full">
                        <audio src={assembled.blobUrl} controls className="w-full" />
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <GlassButton variant="sky" onClick={handleDownload}>
                    <Download className="w-4 h-4" /> Download
                  </GlassButton>
                  {isMedia && (
                    <GlassButton variant="soft" onClick={() => setPreviewing((p) => !p)}>
                      <Eye className="w-4 h-4" /> {previewing ? "Hide preview" : "Preview"}
                    </GlassButton>
                  )}
                  <div className="ml-auto" />
                  <button
                    onClick={reset}
                    className="text-xs font-semibold text-aurora-muted hover:text-aurora-ink transition-colors"
                  >
                    Open another link
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {step === "joined" && (
            <div className="flex justify-end">
              <GlassButton onClick={assemble}>
                <Download className="w-4 h-4" /> Receive file
              </GlassButton>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

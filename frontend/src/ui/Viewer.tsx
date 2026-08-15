import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, LoaderCircle, Maximize, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { convertFileSrc, isAndroidNative } from "../lib/api";
import { tryReconnectTelegram, isNotConnectedError } from "../lib/reconnect";
import { TelegramFile } from "../types";
import { isPdfFile, isVideoFile, isAudioFile, isImageFile } from "../utils";

// Use the legacy build — compatible with Tauri's WebKit WebView.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface ViewerProps {
  file: TelegramFile;
  activeFolderId: number | null;
  currentIndex: number;
  totalItems: number;
  onReconnect?: () => Promise<boolean>;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Viewer({ file, activeFolderId, currentIndex, totalItems, onReconnect, onClose, onNext, onPrev }: ViewerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (e.key === "ArrowRight" || key === "l") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft" || key === "j") { e.preventDefault(); onPrev(); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrev]);

  const isPdf = isPdfFile(file.name);
  const isVideo = isVideoFile(file.name);
  const isAudio = isAudioFile(file.name);
  const isImage = isImageFile(file.name);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] bg-aurora-ink/60 backdrop-blur-xl flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative w-full h-full flex flex-col items-center justify-center p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <ViewerNav onClick={onPrev} side="left" />
        <ViewerNav onClick={onNext} side="right" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2.5 rounded-full glass-panel-strong text-aurora-ink-soft hover:text-aurora-ink transition-all"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="w-full max-w-6xl max-h-[86vh] flex items-center justify-center">
          {isPdf ? (
            <PdfCanvas file={file} activeFolderId={activeFolderId} onReconnect={onReconnect} />
          ) : isVideo || isAudio ? (
            <MediaStage file={file} activeFolderId={activeFolderId} isVideo={isVideo} onReconnect={onReconnect} />
          ) : isImage ? (
            <ImageStage file={file} activeFolderId={activeFolderId} onReconnect={onReconnect} />
          ) : (
            <div className="glass-panel-strong rounded-[28px] p-10 text-center">
              <p className="text-lg font-bold text-aurora-ink mb-1">{file.name}</p>
              <p className="text-sm text-aurora-muted">Preview not supported for this file type.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 glass-panel-strong rounded-full px-5 py-2.5 flex items-center gap-4 text-xs text-aurora-ink-soft">
          <span className="font-bold max-w-[320px] truncate">{file.name}</span>
          {totalItems > 0 && currentIndex >= 0 && (
            <span className="text-aurora-violet font-bold">{currentIndex + 1}/{totalItems}</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ViewerNav({ onClick, side }: { onClick: () => void; side: "left" | "right" }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-4" : "right-4"} p-3 rounded-full glass-panel-strong text-aurora-ink-soft hover:text-aurora-violet hover:scale-105 transition-all`}
      title={side === "left" ? "Previous (← / J)" : "Next (→ / L)"}
    >
      {side === "left" ? <ChevronLeft className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
    </button>
  );
}

/* ── Media stage ─────────────────────────────────────────────────── */
type ProbeState = "checking" | "ready" | "failed";

function MediaStage({
  file, activeFolderId, isVideo, onReconnect,
}: {
  file: TelegramFile;
  activeFolderId: number | null;
  isVideo: boolean;
  onReconnect?: () => Promise<boolean>;
}) {
  const [buffering, setBuffering] = useState(false);
  const [probe, setProbe] = useState<ProbeState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const streamUrl = convertFileSrc(file.id.toString(), activeFolderId);

  // Probe the stream endpoint with a tiny range request so we can surface
  // a real error (e.g. "Not connected to Telegram") instead of a black screen.
  // Skipped on native Android (the bridge fileUrl can't be fetched) — there we
  // just attempt playback directly.
  const probeStream = useCallback(async () => {
    if (isAndroidNative()) {
      setProbe("ready");
      return;
    }
    setProbe("checking");
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(streamUrl, { headers: { Range: "bytes=0-1023" }, signal: controller.signal });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) detail = String(data.error);
        } catch { /* not json */ }
        throw new Error(detail);
      }
      setProbe("ready");
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setProbe("failed");
      setError(aborted ? "Timed out contacting the backend." : String(e));
    } finally {
      clearTimeout(timer);
    }
  }, [streamUrl]);

  useEffect(() => { probeStream(); }, [probeStream]);

  const handleRetry = async () => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      if (onReconnect) {
        await onReconnect();
      } else if (error && isNotConnectedError(error)) {
        await tryReconnectTelegram();
      }
      await probeStream();
    } finally {
      setReconnecting(false);
    }
  };

  if (probe === "checking") {
    return (
      <div className="w-full aspect-video max-w-4xl mx-auto rounded-[28px] glass-panel-strong flex flex-col items-center justify-center gap-3">
        <LoaderCircle className="w-7 h-7 animate-spin text-aurora-violet" />
        <p className="text-xs font-semibold text-aurora-muted">Contacting your vault…</p>
      </div>
    );
  }

  if (probe === "failed") {
    return (
      <div className="w-full max-w-xl mx-auto rounded-[28px] glass-panel-strong border-aurora-rose/40 p-8 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-aurora-rose/15 flex items-center justify-center">
          <X className="w-6 h-6 text-aurora-rose" />
        </div>
        <p className="text-sm font-bold text-aurora-ink">Playback unavailable</p>
        <p className="text-xs text-aurora-muted max-w-sm">
          {isNotConnectedError(error)
            ? "The Telegram session dropped. Reconnect and try again."
            : error}
        </p>
        <button
          onClick={handleRetry}
          disabled={reconnecting}
          className="mt-1 flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white text-xs font-bold px-5 py-2.5 shadow-lavender hover:brightness-110 active:scale-95 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
          {reconnecting ? "Reconnecting…" : "Reconnect & retry"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {isVideo ? (
        <div className="relative w-full aspect-video rounded-[28px] overflow-hidden glass-panel-strong flex items-center justify-center">
          <video
            src={streamUrl}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
          />
          {buffering && (
            <div className="absolute inset-0 bg-aurora-ink/40 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 glass-panel-strong rounded-full px-4 py-2 text-xs font-bold text-aurora-ink">
                <LoaderCircle className="w-4 h-4 animate-spin text-aurora-violet" /> Buffering…
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-xl mx-auto rounded-[28px] glass-panel-strong p-10 flex flex-col items-center gap-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-aurora-violet/25 to-aurora-sky/25 flex items-center justify-center animate-float-soft">
            <svg viewBox="0 0 24 24" className="w-12 h-12 text-aurora-violet" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <audio src={streamUrl} controls autoPlay className="w-full" onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} />
          {buffering && <p className="text-xs text-aurora-muted flex items-center gap-2"><LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Buffering…</p>}
        </div>
      )}
    </div>
  );
}

/* ── Image stage ──────────────────────────────────────────────────── */
function ImageStage({
  file, activeFolderId, onReconnect,
}: {
  file: TelegramFile;
  activeFolderId: number | null;
  onReconnect?: () => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const streamUrl = convertFileSrc(file.id.toString(), activeFolderId);

  if (failed) {
    return (
      <div className="max-w-xl mx-auto rounded-[28px] glass-panel-strong border-aurora-rose/40 p-8 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-aurora-rose/15 flex items-center justify-center">
          <X className="w-6 h-6 text-aurora-rose" />
        </div>
        <p className="text-sm font-bold text-aurora-ink">Could not load image</p>
        <p className="text-xs text-aurora-muted max-w-sm">The Telegram session may have dropped.</p>
        <button
          onClick={async () => {
            if (reconnecting) return;
            setReconnecting(true);
            try {
              if (onReconnect) await onReconnect();
              else await tryReconnectTelegram();
              setFailed(false);
            } finally {
              setReconnecting(false);
            }
          }}
          disabled={reconnecting}
          className="mt-1 flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white text-xs font-bold px-5 py-2.5 shadow-lavender hover:brightness-110 active:scale-95 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
          {reconnecting ? "Reconnecting…" : "Reconnect & retry"}
        </button>
      </div>
    );
  }

  return (
    <img
      src={streamUrl}
      onError={() => setFailed(true)}
      className="max-w-full max-h-[82vh] object-contain rounded-3xl shadow-2xl"
      alt={file.name}
    />
  );
}

/* ── PDF canvas ───────────────────────────────────────────────────── */
function PdfCanvas({
  file, activeFolderId, onReconnect,
}: {
  file: TelegramFile;
  activeFolderId: number | null;
  onReconnect?: () => Promise<boolean>;
}) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setNumPages(0);

    const streamUrl = convertFileSrc(file.id.toString(), activeFolderId);
    const loadingTask = pdfjsLib.getDocument(streamUrl);
    loadingTask.promise.then(
      (doc) => {
        if (cancelled) { doc.destroy(); return; }
        pdfRef.current?.destroy();
        pdfRef.current = doc;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      },
      () => {
        if (!cancelled) { setError("Failed to load PDF document."); setLoading(false); }
      }
    );
    return () => { cancelled = true; loadingTask.destroy(); };
  }, [file.id, activeFolderId, reloadKey]);

  useEffect(() => {
    return () => { pdfRef.current?.destroy(); pdfRef.current = null; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === "=" || key === "+") { e.preventDefault(); setScale((s) => Math.min(s + 0.15, 3)); }
      if (e.key === "-") { e.preventDefault(); setScale((s) => Math.max(s - 0.15, 0.5)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const adjust = useCallback((delta: number) => setScale((s) => Math.min(Math.max(s + delta, 0.5), 3)), []);

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      {/* Zoom bar */}
      <div className="flex items-center gap-2 glass-panel-strong rounded-full px-3 py-1.5 mb-4">
        <PdfZoom onClick={() => adjust(-0.15)}><ZoomOut className="w-4 h-4" /></PdfZoom>
        <span className="text-xs font-bold text-aurora-ink min-w-[3.2rem] text-center">{Math.round(scale * 100)}%</span>
        <PdfZoom onClick={() => adjust(0.15)}><ZoomIn className="w-4 h-4" /></PdfZoom>
        <div className="w-px h-4 bg-aurora-line mx-1" />
        <PdfZoom onClick={() => setScale(1.1)}><Maximize className="w-4 h-4" /></PdfZoom>
      </div>

      <div ref={containerRef} className="w-full flex-1 overflow-auto custom-scrollbar flex flex-col items-center pb-8">
        {loading && (
          <div className="flex flex-col items-center gap-4 py-16 text-aurora-muted">
            <div className="w-10 h-10 rounded-full border-[3px] border-aurora-lavender border-t-transparent animate-spin" />
            <p className="text-xs font-medium">Opening document…</p>
          </div>
        )}
        {error && (
          <div className="py-12 flex flex-col items-center gap-3">
            <p className="text-sm text-aurora-rose">
              {isNotConnectedError(error)
                ? "Could not open the document — the Telegram session dropped."
                : error}
            </p>
            <button
              onClick={async () => {
                if (onReconnect) await onReconnect();
                else if (isNotConnectedError(error)) await tryReconnectTelegram();
                setReloadKey((k) => k + 1);
              }}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white text-xs font-bold px-5 py-2 shadow-lavender hover:brightness-110 active:scale-95 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reconnect & retry
            </button>
          </div>
        )}
        {pdf && numPages > 0 && (
          <div className="flex flex-col gap-5 items-center">
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPage key={`${file.id}_p${i + 1}`} pdf={pdf} pageNumber={i + 1} scale={scale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfZoom({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="p-2 rounded-full text-aurora-muted hover:text-aurora-violet hover:bg-aurora-lavender/10 transition-colors">
      {children}
    </button>
  );
}

function PdfPage({ pdf, pageNumber, scale }: { pdf: pdfjsLib.PDFDocumentProxy; pageNumber: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: "900px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !pdf) return;
    let cancelled = false;
    pdf.getPage(pageNumber).then((p) => !cancelled && setPage(p)).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, pdf, pageNumber]);

  useEffect(() => {
    if (!page || !canvasRef.current || !visible) return;
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderRef.current?.cancel();
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    const task = page.render({ canvasContext: ctx, viewport, canvas });
    renderRef.current = task;
    task.promise.catch((err) => { if (err?.name !== "RenderingCancelledException") console.error(err); });
    return () => { task.cancel(); renderRef.current = null; };
  }, [page, scale, visible, pageNumber]);

  return (
    <div ref={containerRef} className="relative rounded-xl overflow-hidden bg-white shadow-[0_18px_50px_-18px_rgba(64,56,128,0.4)]">
      <canvas ref={canvasRef} className="max-w-full h-auto" />
      {!page && visible && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-aurora-lavender border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}

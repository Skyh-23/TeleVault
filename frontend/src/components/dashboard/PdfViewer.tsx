import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import { convertFileSrc } from "../../lib/api";
// Legacy build — required for Tauri's WebKit WebView (no Map.getOrInsertComputed).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { TelegramFile } from "../../types";

// Vite ?url import gives a bundled asset URL for the worker.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  file: TelegramFile;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  currentIndex?: number;
  totalItems?: number;
  activeFolderId: number | null;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const DEFAULT_SCALE = 1.2;
const ZOOM_STEP = 0.2;
const OBSERVER_MARGIN = "1000px 0px";

function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFitWidth,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pointer-events-auto bg-black/40 backdrop-blur-md p-1.5 rounded-full border border-white/10">
      <button
        onClick={onZoomOut}
        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        title="Zoom out (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <span className="text-xs text-white/90 font-medium min-w-[3rem] text-center">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        title="Zoom in (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-white/20 mx-1" />
      <button
        onClick={onFitWidth}
        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        title="Fit width"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}

function RoundButton({
  onClick,
  className = "",
  title,
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3 text-white/50 hover:text-white bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all z-10 border border-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

export function PdfViewer({
  file,
  onClose,
  onNext,
  onPrev,
  currentIndex,
  totalItems,
  activeFolderId,
}: PdfViewerProps) {
  const [document, setDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocument(null);
    setPageCount(0);

    const url = convertFileSrc(file.id.toString(), activeFolderId);
    const loadTask = pdfjsLib.getDocument(url);

    loadTask.promise.then(
      (loaded) => {
        if (cancelled) {
          loaded.destroy();
          return;
        }
        docRef.current?.destroy();
        docRef.current = loaded;
        setDocument(loaded);
        setPageCount(loaded.numPages);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        console.error("Failed to load PDF:", err);
        setError("Could not load this PDF document.");
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      loadTask.destroy();
    };
  }, [activeFolderId, file.id]);

  useEffect(() => {
    return () => {
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.key === "ArrowRight" || key === "l") {
        e.preventDefault();
        onNext?.();
      } else if (e.key === "ArrowLeft" || key === "j") {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "=" || key === "+") {
        e.preventDefault();
        setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
      } else if (e.key === "-") {
        e.preventDefault();
        setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrev]);

  const zoomIn = () => setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
  const zoomOut = () => setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE));
  const fitWidth = () => setScale(DEFAULT_SCALE);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex flex-col p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-8 z-10 pointer-events-none">
        <div className="text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-full pointer-events-auto border border-white/10">
          <h3 className="text-sm font-medium px-2 max-w-sm truncate">{file.name}</h3>
        </div>

        <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onFitWidth={fitWidth} />
      </div>

      <RoundButton
        onClick={(e) => {
          e.stopPropagation();
          onPrev?.();
        }}
        className="absolute left-4 top-1/2 -translate-y-1/2"
        title="Previous file (ArrowLeft / J)"
      >
        <ChevronLeft className="w-6 h-6" />
      </RoundButton>

      <RoundButton
        onClick={(e) => {
          e.stopPropagation();
          onNext?.();
        }}
        className="absolute right-4 top-1/2 -translate-y-1/2"
        title="Next file (ArrowRight / L)"
      >
        <ChevronRight className="w-6 h-6" />
      </RoundButton>

      <RoundButton onClick={onClose} className="absolute top-4 right-4" title="Close">
        <X className="w-6 h-6" />
      </RoundButton>

      <div
        ref={scrollRef}
        className="flex-1 w-full overflow-auto custom-scrollbar flex flex-col items-center pt-20 pb-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center flex-1 text-white absolute inset-0">
            <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p>Loading document...</p>
            <p className="text-xs text-white/50 mt-1">Downloading from Telegram...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center text-white bg-red-500/20 p-6 rounded-xl border border-red-500/50 mt-20">
            <p className="font-bold mb-2">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {document && pageCount > 0 && (
          <div className="flex flex-col gap-4 w-full items-center">
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPage
                key={`${file.id}_page_${index + 1}`}
                pageNumber={index + 1}
                document={document}
                scale={scale}
              />
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full pointer-events-none border border-white/10">
        {typeof currentIndex === "number" && typeof totalItems === "number" && totalItems > 0 && (
          <span className="mr-3 border-r border-white/20 pr-3">
            File {currentIndex + 1} of {totalItems}
          </span>
        )}
        <span>
          {pageCount} {pageCount === 1 ? "page" : "pages"}
        </span>
      </div>
    </div>
  );
}

interface PdfPageProps {
  pageNumber: number;
  document: pdfjsLib.PDFDocumentProxy;
  scale: number;
}

const LETTER_HEIGHT = 1056;
const LETTER_WIDTH = 816;

function PdfPage({ pageNumber, document, scale }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy["render"]> | null>(null);
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible(true);
      },
      { rootMargin: OBSERVER_MARGIN }
    );

    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !document) return;

    let cancelled = false;
    document
      .getPage(pageNumber)
      .then((loaded) => {
        if (!cancelled) setPage(loaded);
      })
      .catch((err) => console.error(`Error loading page ${pageNumber}:`, err));

    return () => {
      cancelled = true;
    };
  }, [visible, document, pageNumber]);

  useEffect(() => {
    if (!page || !canvasRef.current || !visible) return;

    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    context.clearRect(0, 0, viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      canvas,
    });
    renderTaskRef.current = renderTask;

    renderTask.promise.catch((err) => {
      if (err?.name !== "RenderingCancelledException") {
        console.error(`Render error on page ${pageNumber}:`, err);
      }
    });

    return () => {
      renderTask.cancel();
      renderTaskRef.current = null;
    };
  }, [page, scale, visible, pageNumber]);

  const placeholderHeight = LETTER_HEIGHT * scale;
  const placeholderWidth = LETTER_WIDTH * scale;

  return (
    <div
      ref={shellRef}
      className="relative flex flex-col items-center my-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden bg-white/5 transition-shadow"
      style={{
        minHeight: page ? undefined : `${placeholderHeight}px`,
        minWidth: page ? undefined : `${placeholderWidth}px`,
      }}
    >
      <canvas ref={canvasRef} className="max-w-full h-auto bg-white" />

      {!page && visible && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white/30">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

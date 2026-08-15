import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { convertFileSrc } from "../../lib/api";
import { TelegramFile } from "../../types";
import { isAudioFile, isVideoFile } from "../../utils";

interface MediaPlayerProps {
  file: TelegramFile;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  currentIndex?: number;
  totalItems?: number;
  activeFolderId: number | null;
}

const isTypingTarget = (element: EventTarget | null): boolean => {
  const node = element as HTMLElement | null;
  if (!node) return false;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable;
};

function NavigationButton({
  side,
  onClick,
  label,
  children,
}: {
  side: "left" | "right";
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const alignClass = side === "left" ? "left-2" : "right-2";
  return (
    <button
      onClick={onClick}
      className={`absolute ${alignClass} top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10`}
      title={label}
    >
      {children}
    </button>
  );
}

export function MediaPlayer({
  file,
  onClose,
  onNext,
  onPrev,
  currentIndex,
  totalItems,
  activeFolderId,
}: MediaPlayerProps) {
  const streamUrl = convertFileSrc(file.id.toString(), activeFolderId);
  const [buffering, setBuffering] = useState(false);

  const isVideo = isVideoFile(file.name);
  const isAudio = isAudioFile(file.name);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrev]);

  const mediaEvents = {
    onWaiting: () => setBuffering(true),
    onPlaying: () => setBuffering(false),
    onCanPlay: () => setBuffering(false),
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <NavigationButton side="left" onClick={() => onPrev?.()} label="Previous (ArrowLeft / J)">
          <ChevronLeft className="w-6 h-6" />
        </NavigationButton>

        <NavigationButton side="right" onClick={() => onNext?.()} label="Next (ArrowRight / L)">
          <ChevronRight className="w-6 h-6" />
        </NavigationButton>

        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
          {isVideo ? (
            <video src={streamUrl} controls autoPlay className="w-full h-full object-contain" {...mediaEvents} />
          ) : isAudio ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-telegram-primary/20 to-black">
              <div className="w-32 h-32 rounded-full bg-telegram-surface flex items-center justify-center mb-8 shadow-xl animate-pulse-slow">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-12 h-12 text-telegram-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <audio src={streamUrl} controls autoPlay className="w-full max-w-md" {...mediaEvents} />
            </div>
          ) : (
            <div className="text-white">Unsupported media type</div>
          )}

          {buffering && (
            <div className="absolute inset-0 bg-black/45 flex items-center justify-center pointer-events-none">
              <div className="px-3 py-1.5 rounded-full bg-black/70 text-white text-xs flex items-center gap-2">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                Buffering...
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <h3 className="text-lg font-medium text-white">{file.name}</h3>
          <p className="text-sm text-white/50">
            Streaming from encrypted vault
            {typeof currentIndex === "number" && typeof totalItems === "number" && totalItems > 0 && (
              <span className="ml-2">
                • {currentIndex + 1}/{totalItems}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

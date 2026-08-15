import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw, Sparkles, X } from "lucide-react";

interface UpdateBannerProps {
  available: boolean;
  version: string | null;
  downloading: boolean;
  progress: number;
  onUpdate: () => void;
  onDismiss: () => void;
}

function DownloadProgress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <RefreshCw className="w-4 h-4 text-white animate-spin" />
      <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function UpdateAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-1.5 bg-white text-telegram-primary font-semibold rounded-full hover:bg-white/90 transition-colors shadow-md"
    >
      <Download className="w-4 h-4" />
      Update Now
    </button>
  );
}

export function UpdateBanner({
  available,
  version,
  downloading,
  progress,
  onUpdate,
  onDismiss,
}: UpdateBannerProps) {
  return (
    <AnimatePresence>
      {available && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50 p-3 bg-gradient-to-r from-telegram-primary/90 via-blue-500/90 to-purple-500/90 backdrop-blur-sm shadow-lg"
        >
          <div className="flex items-center justify-center gap-4 max-w-screen-lg mx-auto">
            <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />

            <span className="text-white font-medium">
              {downloading
                ? `Downloading update... ${progress}%`
                : `A new version (${version}) is available!`}
            </span>

            {downloading ? <DownloadProgress value={progress} /> : <UpdateAction onClick={onUpdate} />}

            {!downloading && (
              <button
                onClick={onDismiss}
                className="p-1 text-white/70 hover:text-white transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

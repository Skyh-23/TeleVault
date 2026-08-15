import { motion } from "framer-motion";
import { CloudUpload } from "lucide-react";

const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const cardMotion = {
  initial: { scale: 0.9, y: 8, opacity: 0 },
  animate: { scale: 1, y: 0, opacity: 1 },
  exit: { scale: 0.9, y: 8, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 320, damping: 24 },
};

export function DragDropOverlay() {
  return (
    <motion.div
      {...overlayMotion}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none"
    >
      <motion.div
        {...cardMotion}
        className="glass flex flex-col items-center gap-4 rounded-2xl border border-telegram-primary/50 bg-telegram-surface p-8 text-telegram-text shadow-2xl"
      >
        <div className="flex items-center gap-3 rounded-full bg-telegram-primary/10 px-5 py-3">
          <CloudUpload className="h-8 w-8 animate-bounce text-telegram-primary" />
          <div className="text-left">
            <p className="text-base font-bold leading-tight">Release to upload</p>
            <p className="text-xs text-telegram-subtext">Files land in the current folder</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

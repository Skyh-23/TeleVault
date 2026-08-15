import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "info";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

function ConfirmDialog({
  options,
  onAnswer,
}: {
  options: ConfirmOptions;
  onAnswer: (accepted: boolean) => void;
}) {
  const danger = options.variant === "danger";
  const accentClass = danger
    ? "bg-gradient-to-r from-aurora-rose to-aurora-peach text-white hover:brightness-105"
    : "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white hover:brightness-105";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-aurora-ink/30 backdrop-blur-sm">
      <div
        className="glass-panel-strong w-96 animate-in zoom-in-95 rounded-[24px] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-aurora-ink">{options.title}</h3>
        <p className="mb-6 whitespace-pre-line text-sm text-aurora-muted">{options.message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => onAnswer(false)}
            className="rounded-full px-4 py-2 text-sm font-medium text-aurora-muted transition hover:bg-aurora-line/40 hover:text-aurora-ink"
          >
            {options.cancelText || "Cancel"}
          </button>
          <button onClick={() => onAnswer(true)} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${accentClass}`}>
            {options.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const pendingAnswer = useRef<((accepted: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      pendingAnswer.current = resolve;
    });
  }, []);

  const answer = useCallback((accepted: boolean) => {
    setDialog(null);
    pendingAnswer.current?.(accepted);
    pendingAnswer.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && <ConfirmDialog options={dialog} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}

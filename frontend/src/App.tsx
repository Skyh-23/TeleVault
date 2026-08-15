import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { APIError, isAndroidNative } from "./lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw, X } from "lucide-react";
import { Onboarding } from "./ui/Onboarding";
import { Shell } from "./ui/Shell";
import { TermsGate } from "./ui/TermsGate";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import "./App.css";

import { Toaster } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";

const queryClient = new QueryClient();

// Startup auth states:
//   "checking"       â€” attempting auto-connect with saved session
//   "authenticated"  â€” session valid, show Shell
//   "unauthenticated"â€” no session / session expired, show Onboarding
type AuthState = "checking" | "authenticated" | "unauthenticated";

function AppContent() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("televault_terms_accepted") === "1";
    } catch {
      return false;
    }
  });
  const { theme } = useTheme();
  const { available, version, downloading, progress, downloadAndInstall, dismissUpdate } = useUpdateCheck();

  const handleLogout = useCallback(() => {
    setAuthState("unauthenticated");
  }, []);

  const handleLogin = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  const handleAcceptTerms = useCallback(() => {
    try {
      localStorage.setItem("televault_terms_accepted", "1");
    } catch {
      // Storage unavailable â€” accept for this session only.
    }
    setTermsAccepted(true);
  }, []);

  const savePhone = useCallback((phone: string) => {
    localStorage.setItem("televault_phone", phone);
  }, []);

  // â”€â”€ Startup auto-connect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Reconnect with the saved session BEFORE choosing a screen so the
  // OTP prompt never flashes for users with a valid session.
  useEffect(() => {
    let cancelled = false;

    const tryAutoConnect = async () => {
      try {
        if (isAndroidNative()) {
          if (!cancelled) setAuthState("authenticated");
          return;
        }

        const store = await load("config.json");
        const apiIdStr = await store.get<string>("api_id");
        const apiId = apiIdStr ? parseInt(apiIdStr, 10) : NaN;
        const connectArgs = !isNaN(apiId) ? { apiId } : {};

        try {
          await invoke("cmd_connect", connectArgs);
          if (!cancelled) setAuthState("authenticated");
        } catch (err: unknown) {
          const isSessionExpired =
            (err instanceof APIError && err.statusCode === 401) ||
            String(err).includes("SESSION_EXPIRED") ||
            String(err).includes("401");

          if (isSessionExpired) {
            if (!cancelled) setAuthState("unauthenticated");
          } else {
            // Network blip / 503 / unknown â€” stay in the app.
            console.warn("[TeleVault] Auto-connect non-auth error:", err);
            if (!cancelled) setAuthState("authenticated");
          }
        }
      } catch {
        try {
          await invoke("cmd_connect", {});
          if (!cancelled) setAuthState("authenticated");
        } catch {
          if (!cancelled) setAuthState("unauthenticated");
        }
      }
    };

    tryAutoConnect();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="h-screen w-screen text-aurora-ink overflow-hidden relative">
      <AnimatePresence>{available && <UpdatePill downloading={downloading} progress={progress} version={version} onUpdate={downloadAndInstall} onDismiss={dismissUpdate} />}</AnimatePresence>
      <Toaster theme={theme} position="bottom-center" />

      {!termsAccepted ? (
        <TermsGate onAccept={handleAcceptTerms} />
      ) : authState === "checking" && (
        <div className="h-full w-full flex flex-col items-center justify-center gap-5 relative">
          <div className="relative">
            <div className="w-16 h-16 rounded-[22px] bg-gradient-to-tr from-aurora-violet to-aurora-sky p-[2px] shadow-lavender">
              <div className="w-full h-full rounded-[20px] bg-white/85 dark:bg-aurora-surface flex items-center justify-center">
                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-9 h-9" />
              </div>
            </div>
            <div className="absolute -inset-3 rounded-[30px] bg-aurora-lavender/25 blur-xl animate-pulse" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-aurora-muted">Opening your vaultâ€¦</p>
        </div>
      )}

      {termsAccepted && authState === "authenticated" && <Shell onLogout={handleLogout} />}

      {termsAccepted && authState === "unauthenticated" && <Onboarding onLogin={handleLogin} savePhone={savePhone} />}
    </main>
  );
}

function UpdatePill({
  downloading, progress, version, onUpdate, onDismiss,
}: {
  downloading: boolean;
  progress: number;
  version: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[130]"
    >
      <div className="flex items-center gap-3 rounded-full glass-panel-strong px-5 py-2.5 shadow-2xl">
        <RefreshCw className={`w-4 h-4 text-aurora-violet ${downloading ? "animate-spin" : ""}`} />
        <span className="text-xs font-bold text-aurora-ink">
          {downloading ? `Updatingâ€¦ ${progress}%` : `Version ${version} available`}
        </span>
        {downloading ? (
          <div className="w-24 h-1.5 rounded-full bg-aurora-line/50 overflow-hidden">
            <div className="h-full progress-aurora rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        ) : (
          <button
            onClick={onUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white text-[11px] font-bold hover:brightness-105 transition-all"
          >
            <Download className="w-3 h-3" /> Update now
          </button>
        )}
        {!downloading && (
          <button onClick={onDismiss} className="p-1 rounded-full text-aurora-muted hover:text-aurora-ink transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ConfirmProvider>
            <DropZoneProvider>
              <AppContent />
            </DropZoneProvider>
          </ConfirmProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

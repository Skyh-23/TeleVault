import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { APIError, isAndroidNative } from "./lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthWizard } from "./components/AuthWizard";
import { Dashboard } from "./components/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import "./App.css";

import { Toaster } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";

const queryClient = new QueryClient();

// Startup auth states:
//   "checking"       — attempting auto-connect with saved session
//   "authenticated"  — session valid, show Dashboard
//   "unauthenticated"— no session / session expired, show AuthWizard
type AuthState = "checking" | "authenticated" | "unauthenticated";

function AppContent() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const { theme } = useTheme();
  const { available, version, downloading, progress, downloadAndInstall, dismissUpdate } = useUpdateCheck();

  // Stable logout callback — won't cause useEffect re-runs in children
  const handleLogout = useCallback(() => {
    setAuthState("unauthenticated");
  }, []);

  const handleLogin = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  const savePhone = useCallback((phone: string) => {
    localStorage.setItem("televault_phone", phone);
  }, []);

  // ── Startup auto-connect ──────────────────────────────────────────────────
  // Try to reconnect with the saved session BEFORE deciding which screen
  // to show. This prevents the OTP prompt from appearing when a valid
  // session already exists on disk.
  useEffect(() => {
    let cancelled = false;

    const tryAutoConnect = async () => {
      try {
        if (isAndroidNative()) {
          if (!cancelled) setAuthState("authenticated");
          return;
        }

        // Load api_id from the local app store (saved on first setup).
        const store = await load("config.json");
        const apiIdStr = await store.get<string>("api_id");

        const apiId = apiIdStr ? parseInt(apiIdStr, 10) : NaN;
        const connectArgs = !isNaN(apiId) ? { apiId } : {};

        // Ask backend to reconnect using the saved session file.
        // Backend returns:
        //   200  → session valid, skip OTP
        //   401  → session expired, OTP required
        //   503  → network error, retry later
        try {
          await invoke("cmd_connect", connectArgs);
          if (!cancelled) setAuthState("authenticated");
        } catch (err: unknown) {
          // APIError with 401 = SESSION_EXPIRED → must re-authenticate
          const isSessionExpired =
            (err instanceof APIError && err.statusCode === 401) ||
            String(err).includes("SESSION_EXPIRED") ||
            String(err).includes("401");

          if (isSessionExpired) {
            if (!cancelled) setAuthState("unauthenticated");
          } else {
            // Network blip / 503 / unknown — keep user on Dashboard;
            // operations will show errors inline. Don't force a full re-login.
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
  }, []); // Run once on mount only

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative">
      <UpdateBanner
        available={available}
        version={version}
        downloading={downloading}
        progress={progress}
        onUpdate={downloadAndInstall}
        onDismiss={dismissUpdate}
      />
      <Toaster theme={theme} position="bottom-center" />

      {authState === "checking" && (
        // Minimal splash while we probe the session — avoids a flash of the
        // login screen for users who are already authenticated.
        <div className="h-full w-full flex flex-col items-center justify-center auth-gradient gap-5">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-16 h-16 animate-pulse" />
          <p className="text-white/50 text-sm tracking-widest uppercase">Connecting…</p>
        </div>
      )}

      {authState === "authenticated" && (
        <Dashboard onLogout={handleLogout} />
      )}

      {authState === "unauthenticated" && (
        <AuthWizard onLogin={handleLogin} savePhone={savePhone} />
      )}
    </main>
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

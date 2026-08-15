import { useCallback, useEffect, useState } from "react";
import { check, relaunch } from "../lib/tauri-extras";

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  version: string | null;
}

interface ReleaseHandle {
  version: string;
  downloadAndInstall: (listener: (evt: { event: string; data?: unknown }) => void) => Promise<void>;
}

const toMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "Update failed unexpectedly";

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    progress: 0,
    error: null,
    version: null,
  });
  const [release, setRelease] = useState<ReleaseHandle | null>(null);

  const checkForUpdates = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const found = (await check()) as ReleaseHandle | null;
      if (!found) {
        setState((s) => ({ ...s, checking: false, available: false }));
        return;
      }
      setRelease(found);
      setState((s) => ({ ...s, checking: false, available: true, version: found.version }));
    } catch (err) {
      setState((s) => ({ ...s, checking: false, error: toMessage(err) }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!release) return;
    setState((s) => ({ ...s, downloading: true, progress: 0 }));
    try {
      let received = 0;
      let total = 0;
      await release.downloadAndInstall((evt) => {
        if (evt.event === "Started") {
          const data = evt.data as { contentLength?: number };
          total = data.contentLength ?? 0;
        } else if (evt.event === "Progress") {
          const data = evt.data as { chunkLength?: number };
          received += data.chunkLength ?? 0;
          if (total > 0) {
            setState((s) => ({
              ...s,
              progress: Math.min(Math.round((received / total) * 100), 100),
            }));
          }
        }
      });
      await relaunch();
    } catch (err) {
      setState((s) => ({ ...s, downloading: false, error: toMessage(err) }));
    }
  }, [release]);

  const dismissUpdate = useCallback(() => {
    setState((s) => ({ ...s, available: false }));
    setRelease(null);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkForUpdates();
    }, 5000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  };
}

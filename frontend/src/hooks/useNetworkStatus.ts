import { useEffect, useState } from "react";
import { isAndroidNative } from "../lib/api";

const HEALTH_URL = "http://127.0.0.1:8765/health";
const POLL_INTERVAL_MS = 30000;

/**
 * Watches backend reachability. On native Android the local bridge owns the
 * connection, so we assume online and skip polling entirely.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (isAndroidNative()) {
      setOnline(true);
      return;
    }

    const probe = async (): Promise<void> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timer);
        setOnline(response.ok);
      } catch {
        setOnline(false);
      }
    };

    probe();
    const interval = setInterval(probe, POLL_INTERVAL_MS);

    const onBrowserOnline = () => setOnline(true);

    window.addEventListener("online", onBrowserOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onBrowserOnline);
    };
  }, []);

  return online;
}

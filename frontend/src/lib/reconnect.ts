import { invoke } from "./api";
import { load } from "./tauri-store";

/**
 * reconnect.ts
 * The backend session can silently drop (Telethon disconnect), after which every
 * Telegram-dependent operation fails with "Not connected to Telegram" (HTTP 400).
 * The backend's own `cmd_connect` (with no args — it reloads the saved api_id from
 * disk) re-establishes the session. This helper wraps that, deduping concurrent calls.
 */

let inFlight: Promise<boolean> | null = null;

export async function tryReconnectTelegram(): Promise<boolean> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Backend loads the saved api_id itself when none is provided.
      const res = await invoke<{ ok?: boolean }>("cmd_connect", {});
      return res?.ok === true;
    } catch {
      // Fallback: pass the stored api_id explicitly.
      try {
        const store = await load("config.json");
        const apiIdStr = await store.get<string>("api_id");
        const apiId = apiIdStr ? parseInt(apiIdStr, 10) : NaN;
        if (!isNaN(apiId)) {
          const res = await invoke<{ ok?: boolean }>("cmd_connect", { apiId });
          return res?.ok === true;
        }
      } catch {
        /* ignore */
      }
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** True when the error is the session/connection failure we can self-heal. */
export function isNotConnectedError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("not connected to telegram") ||
    msg.includes("session expired") ||
    msg.includes("network error") ||
    msg.includes("connection") ||
    msg.includes("failed to fetch")
  );
}

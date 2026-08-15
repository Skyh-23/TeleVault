// Replaces plugin-shell, plugin-dialog, plugin-updater, plugin-process
// Bridges to TeleVault Python backend for native OS dialogs

const API = 'http://127.0.0.1:8765';

declare global {
    interface Window {
        TeleVaultAndroid?: {
            invoke?: (cmd: string, argsJson: string) => string;
            invokeAsync?: (callbackId: string, cmd: string, argsJson: string) => void;
            fileUrl?: (id: string, folderId?: string) => string;
            openExternal?: (url: string) => void;
        };
        __teleVaultNativeResolve?: (callbackId: string, ok: boolean, payloadJson: string) => void;
    }
}

function isAndroidNative(): boolean {
    return typeof window !== 'undefined' && !!window.TeleVaultAndroid;
}

function androidInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const bridge = window.TeleVaultAndroid;
    if (!bridge) return Promise.reject(new Error('Android bridge unavailable'));

    if (bridge.invokeAsync) {
        const callbackId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const invokeAsync = bridge.invokeAsync;
        return new Promise<T>((resolve, reject) => {
            const holder = window as unknown as { __teleVaultNativeCallbacks?: Record<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> };
            holder.__teleVaultNativeCallbacks = holder.__teleVaultNativeCallbacks || {};
            holder.__teleVaultNativeCallbacks[callbackId] = { resolve: resolve as (value: unknown) => void, reject };
            window.__teleVaultNativeResolve = window.__teleVaultNativeResolve || ((id, ok, payloadJson) => {
                const pending = (window as unknown as { __teleVaultNativeCallbacks?: Record<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> }).__teleVaultNativeCallbacks;
                const callback = pending?.[id];
                if (!callback) return;
                delete pending[id];
                try {
                    const payload = payloadJson ? JSON.parse(payloadJson) : null;
                    ok ? callback.resolve(payload) : callback.reject(new Error(String(payload?.message || payload || 'Native command failed')));
                } catch (error) {
                    callback.reject(error);
                }
            });
            invokeAsync(callbackId, cmd, JSON.stringify(args ?? {}));
        });
    }

    if (!bridge.invoke) return Promise.reject(new Error('Android bridge invoke unavailable'));
    const raw = bridge.invoke(cmd, JSON.stringify(args ?? {}));
    return Promise.resolve(raw ? JSON.parse(raw) as T : null as T);
}

export async function open(opts: string | { multiple?: boolean; directory?: boolean; title?: string }): Promise<any> {
    if (typeof opts === 'string') {
        if (isAndroidNative() && window.TeleVaultAndroid?.openExternal) {
            window.TeleVaultAndroid.openExternal(opts);
            return;
        }
        window.open(opts, '_blank');
        return;
    }

    if (isAndroidNative()) {
        return androidInvoke('cmd_pick_file', {
            multiple: opts?.multiple || false,
            directory: opts?.directory || false,
            title: opts?.title || '',
        });
    }

    try {
        const res = await fetch(`${API}/cmd_pick_file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                multiple: opts?.multiple || false,
                directory: opts?.directory || false,
            }),
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        // Fallback: use HTML input if backend is down
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (opts?.multiple) input.multiple = true;
            // Note: directory selection not supported via HTML input
            input.onchange = () => {
                if (input.files && input.files.length > 0) {
                    const paths = Array.from(input.files).map(f => f.name);
                    resolve(opts?.multiple ? paths : paths[0]);
                } else {
                    resolve(null);
                }
            };
            input.click();
        });
    }
}

// File save dialog — calls backend's native tkinter dialog
export async function save(opts?: {
    defaultPath?: string;
    filters?: unknown[];
}): Promise<string | null> {
    if (isAndroidNative()) {
        return androidInvoke<string | null>('cmd_pick_save_path', {
            defaultPath: opts?.defaultPath || '',
        });
    }

    try {
        const res = await fetch(`${API}/cmd_pick_save_path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                defaultPath: opts?.defaultPath || '',
            }),
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return prompt("Save path:", opts?.defaultPath ?? "");
    }
}

// Event listener — connects to SSE endpoint for real-time progress
export type UnlistenFn = () => void;
export interface TauriEvent<T = unknown> {
    payload: T;
}

const sseListeners: Map<string, Set<(e: TauriEvent<unknown>) => void>> = new Map();
let sseConnection: EventSource | null = null;

function ensureSSEConnection() {
    if (isAndroidNative()) return;
    if (sseConnection && sseConnection.readyState !== EventSource.CLOSED) return;

    sseConnection = new EventSource(`${API}/events`);

    sseConnection.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // Progress events come as { id, percent }.
            // Both upload and download queues filter by transfer id.
            const uploadListeners = sseListeners.get('upload-progress');
            const downloadListeners = sseListeners.get('download-progress');

            // Broadcast to all progress listeners
            if (uploadListeners) {
                uploadListeners.forEach(cb => cb({ payload: data }));
            }
            if (downloadListeners) {
                downloadListeners.forEach(cb => cb({ payload: data }));
            }
        } catch {
            // Ignore parse errors (keepalive pings etc)
        }
    };

    sseConnection.onerror = () => {
        // Let EventSource reconnect automatically; don't close it here.
        console.log('[SSE] Connection lost, retrying...');
    };
}

export async function listen<T = unknown>(event: string, cb: (e: TauriEvent<T>) => void): Promise<UnlistenFn> {
    if (!sseListeners.has(event)) {
        sseListeners.set(event, new Set());
    }
    sseListeners.get(event)!.add(cb as (e: TauriEvent<unknown>) => void);
    ensureSSEConnection();

    return () => {
        sseListeners.get(event)?.delete(cb as (e: TauriEvent<unknown>) => void);
        // Close SSE if no more listeners
        if ([...sseListeners.values()].every(s => s.size === 0)) {
            sseConnection?.close();
            sseConnection = null;
        }
    };
}

// Updater stubs
export const check = async () => null;
export const relaunch = async () => window.location.reload();

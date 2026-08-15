/**
 * api.ts
 * ======
 * Enhanced API client for TeleVault backend with error handling,
 * retries, and timeout support.
 */

const API_BASE = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const LONG_TIMEOUT = 300000; // 5 minutes for large file operations
const STATS_TIMEOUT = 180000; // 3 minutes for storage analytics (folder scans can be slow)
const MAX_RETRIES = 3;

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

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function generateTransferId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isAndroidNative(): boolean {
  return typeof window !== 'undefined' && !!window.TeleVaultAndroid;
}

const asyncAndroidCommands = new Set([
  'cmd_pick_file',
  'cmd_pick_save_path',
]);

function invokeAndroid<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = window.TeleVaultAndroid;
  if (!bridge) {
    return Promise.reject(new APIError('Android bridge is not available'));
  }

  const argsJson = JSON.stringify(args ?? {});

  if (asyncAndroidCommands.has(cmd) && bridge.invokeAsync) {
    const callbackId = generateTransferId();
    const invokeAsync = bridge.invokeAsync;
    return new Promise<T>((resolve, reject) => {
      window.__teleVaultNativeResolve = window.__teleVaultNativeResolve || ((id, ok, payloadJson) => {
        const pending = (window as unknown as { __teleVaultNativeCallbacks?: Record<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> }).__teleVaultNativeCallbacks;
        const callback = pending?.[id];
        if (!callback) return;
        delete pending[id];
        try {
          const payload = payloadJson ? JSON.parse(payloadJson) : null;
          ok ? callback.resolve(payload) : callback.reject(new APIError(String(payload?.message || payload || 'Native command failed')));
        } catch (error) {
          callback.reject(error);
        }
      });
      const holder = window as unknown as { __teleVaultNativeCallbacks?: Record<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> };
      holder.__teleVaultNativeCallbacks = holder.__teleVaultNativeCallbacks || {};
      holder.__teleVaultNativeCallbacks[callbackId] = { resolve: resolve as (value: unknown) => void, reject };
      invokeAsync(callbackId, cmd, argsJson);
    });
  }

  if (!bridge.invoke) {
    return Promise.reject(new APIError('Android bridge invoke is not available'));
  }

  try {
    const raw = bridge.invoke(cmd, argsJson);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.ok === false && parsed.error) {
      throw new APIError(String(parsed.error));
    }
    return Promise.resolve(parsed as T);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new APIError(String(error)));
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function invokeWithRetry<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
  options: { timeout?: number; retries?: number } = {}
): Promise<T> {
  if (isAndroidNative()) {
    return invokeAndroid<T>(cmd, args);
  }

  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES } = options;
  const url = `${API_BASE}/${cmd}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args ?? {}),
        },
        timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new APIError(
          `HTTP ${response.status}: ${errorText}`,
          response.status,
          errorText
        );
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on 4xx errors (client errors)
      if (error instanceof APIError && error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }

      // Don't retry on abort (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new APIError(`Request timeout after ${timeout}ms`);
      }

      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        console.warn(`API call failed (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new APIError('Max retries exceeded');
}

// Main invoke function (backward compatible)
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  return invokeWithRetry<T>(cmd, args);
}

// Streaming URL converter for media playback
export function convertFileSrc(path: string, folderId?: number | null): string {
  if (isAndroidNative() && window.TeleVaultAndroid?.fileUrl) {
    return window.TeleVaultAndroid.fileUrl(path, folderId == null ? '' : String(folderId));
  }

  const params = new URLSearchParams();
  params.set('path', path);
  if (folderId !== null && folderId !== undefined) {
    params.set('folderId', folderId.toString());
  }
  return `${API_BASE}/stream?${params.toString()}`;
}

// Health check
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/health`,
      { method: 'GET' },
      3000
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Typed API wrappers
export interface Folder {
  id: number;
  name: string;
}

export interface FileItem {
  id: number;
  name: string;
  size: number;
  sizeStr?: string;
  created_at: string;
  icon_type: string;
  password_protected?: boolean;
}

export interface UploadOptions {
  path: string;
  folderId?: number | null;
  transferId: string;
  password?: string | null;
  resume?: boolean;
}

export interface DownloadOptions {
  messageId: number;
  savePath: string;
  folderId?: number | null;
  transferId: string;
  password?: string | null;
  resume?: boolean;
  rid?: string;
  exp?: number;
  key?: string;
}

export interface StorageStats {
  total_files: number;
  total_size: number;
  videos: number;
  images: number;
  docs: number;
  bandwidth: {
    up_bytes: number;
    down_bytes: number;
  };
  folders_scanned: number;
  categories: Record<string, { files: number; size: number }>;
  largest_files: Array<{ id: number; name: string; size: number; created_at?: string | number | null }>;
  folder_usage: Array<{ id: number | null; name: string; files: number; size: number }>;
}

export interface ShareCreateOptions {
  messageId: number;
  folderId?: number | null;
  mode?: 'easy' | 'secure';
  expiresInSeconds?: number;
  key?: string;
}

export interface ShareCreateResponse {
  ok: boolean;
  mode: 'easy' | 'secure';
  revokeId: string;
  expiry: number;
  link: string;
  key?: string;
}

export interface ShareRecord {
  revokeId: string;
  fileId: number;
  folderId: number | null;
  mode: 'easy' | 'secure';
  active: boolean;
  expiry: number;
  createdAt: number;
  revokedAt?: number | null;
}

export const api = {
  // Auth
  authRequestCode: (phone: string, apiId: number, apiHash: string) =>
    invoke<void>('cmd_auth_request_code', { phone, apiId, apiHash }),

  authSignIn: (code: string) =>
    invoke<{ success: boolean; next_step?: string }>('cmd_auth_sign_in', { code }),

  authCheckPassword: (password: string) =>
    invoke<{ success: boolean }>('cmd_auth_check_password', { password }),

  connect: (apiId: number) =>
    invoke<void>('cmd_connect', { apiId }),

  logout: () =>
    invoke<void>('cmd_logout'),

  // Folders
  scanFolders: () =>
    invoke<Folder[]>('cmd_scan_folders'),

  syncAllFolders: () =>
    invoke<{ folders: Folder[]; files: FileItem[]; total_files: number }>('cmd_sync_all_folders'),

  createFolder: (name: string) =>
    invoke<Folder>('cmd_create_folder', { name }),

  deleteFolder: (folderId: number) =>
    invoke<void>('cmd_delete_folder', { folderId }),

  // Files
  getFiles: (folderId?: number | null) =>
    invoke<FileItem[]>('cmd_get_files', { folderId }),

  uploadFile: (options: UploadOptions) =>
    invokeWithRetry<void>('cmd_upload_file', options as unknown as Record<string, unknown>, { timeout: LONG_TIMEOUT, retries: 2 }),

  downloadFile: (options: DownloadOptions) =>
    invokeWithRetry<void>('cmd_download_file', options as unknown as Record<string, unknown>, { timeout: LONG_TIMEOUT, retries: 2 }),

  deleteFile: (messageId: number, folderId?: number | null) =>
    invoke<void>('cmd_delete_file', { messageId, folderId }),

  moveFiles: (messageIds: number[], sourceFolderId: number | null, targetFolderId: number | null) =>
    invoke<void>('cmd_move_files', { messageIds, sourceFolderId, targetFolderId }),

  // Search
  searchGlobal: (query: string) =>
    invoke<FileItem[]>('cmd_search_global', { query }),

  // Vault
  exportVault: (password: string) =>
    invoke<{ backup: string }>('cmd_export_vault', { password }),

  exportVaultFile: (password: string, path: string) =>
    invoke<{ ok: boolean; path: string }>('cmd_export_vault_file', { password, path }),

  importVault: (backup: string, password: string) =>
    invoke<void>('cmd_import_vault', { backup, password }),

  importVaultFile: (password: string, path: string) =>
    invoke<{ ok: boolean; message: string }>('cmd_import_vault_file', { password, path }),

  vaultStatus: () =>
    invoke<{ exists: boolean; path: string }>('cmd_vault_status'),

  // Utils
  getBandwidth: () =>
    invoke<{ up_bytes: number; down_bytes: number }>('cmd_get_bandwidth'),

  storageStats: (folderId?: number | null, allFolders: boolean = folderId == null) =>
    invokeWithRetry<StorageStats>('cmd_storage_stats', { folderId, allFolders }, { timeout: STATS_TIMEOUT, retries: 2 }),

  cleanCache: () =>
    invoke<void>('cmd_clean_cache'),

  isNetworkAvailable: () =>
    invoke<boolean>('cmd_is_network_available'),

  pickFile: (multiple?: boolean) =>
    invoke<string | string[] | null>('cmd_pick_file', { multiple }),

  pickSavePath: (defaultPath?: string) =>
    invoke<string | null>('cmd_pick_save_path', { defaultPath }),

  pickDirectory: () =>
    invoke<string | null>('cmd_pick_file', { directory: true }),

  createShare: (options: ShareCreateOptions) =>
    invoke<ShareCreateResponse>('cmd_create_share', options as unknown as Record<string, unknown>),

  revokeShare: (revokeId: string) =>
    invoke<{ ok: boolean; revokeId: string; active: boolean }>('cmd_revoke_share', { revokeId }),

  listShares: (fileId?: number, includeInactive: boolean = true) =>
    invoke<ShareRecord[]>('cmd_list_shares', { fileId, includeInactive }),
};

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder } from '../types';
import { useNetworkStatus } from './useNetworkStatus';

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    // Store onLogoutParent in a ref so changes to the callback don't cause
    // the useEffect below to re-run (it was creating infinite re-runs before).
    const onLogoutRef = useRef(onLogoutParent);
    useEffect(() => { onLogoutRef.current = onLogoutParent; }, [onLogoutParent]);

    const networkIsOnline = useNetworkStatus();

    // ── Dashboard initialisation ──────────────────────────────────────────────
    // App.tsx already performed the auto-connect before mounting Dashboard,
    // so here we only need to:
    //   1. Load the local app store (folders, active folder, api_id)
    //   2. Restore UI state (folder list, active folder)
    //   3. Refresh file list
    //
    // We do NOT re-attempt cmd_connect here — App.tsx owns that responsibility.
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            try {
                // Resolve the right store file
                let _store = await Store.load('config.json');
                const checkId = await _store.get<string>('api_id');
                if (!checkId) {
                    _store = await Store.load('settings.json');
                }
                if (cancelled) return;
                setStore(_store);

        // Restore folder list
                const savedFolders = await _store.get<TelegramFolder[]>('folders');
                if (savedFolders && !cancelled) setFolders(savedFolders);

                // Restore active folder
                const savedActiveFolderId = await _store.get<number | null>('activeFolderId');
                if (savedActiveFolderId !== undefined && !cancelled) {
                    setActiveFolderId(savedActiveFolderId);
                }

                // Auto-cleanup stale folders: scan real Telegram folders and remove
                // any locally saved folder that no longer exists on Telegram.
                if (savedFolders && savedFolders.length > 0) {
                    try {
                        const realFolders = await invoke<TelegramFolder[]>('cmd_scan_folders');
                        const realIds = new Set(realFolders.map(f => f.id));
                        const cleanFolders = savedFolders.filter(f => realIds.has(f.id));

                        if (cleanFolders.length !== savedFolders.length && !cancelled) {
                            const removed = savedFolders.length - cleanFolders.length;
                            console.info(`[TeleVault] Removed ${removed} stale folder(s) from store`);
                            setFolders(cleanFolders);
                            await _store.set('folders', cleanFolders);
                            await _store.save();

                            // If the active folder was stale, reset to Saved Messages
                            if (savedActiveFolderId && !realIds.has(savedActiveFolderId) && !cancelled) {
                                setActiveFolderId(null);
                                await _store.set('activeFolderId', null);
                                await _store.save();
                            }
                        }
                    } catch {
                        // Non-critical — ignore scan errors (offline, etc.)
                    }
                }

                // Refresh file list now that we know we're connected
                queryClient.invalidateQueries({ queryKey: ['files'] });

            } catch (err) {
                console.error('[TeleVault] Dashboard init error:', err);
                // Don't log out on store errors — non-critical
            }
        };

        init();
        return () => { cancelled = true; };
    }, [queryClient]); // stable deps only — no onLogoutParent, no phoneNumber


    // ── Network status sync ───────────────────────────────────────────────────
    useEffect(() => {
        setIsConnected(networkIsOnline);
    }, [networkIsOnline]);


    // ── Helpers ───────────────────────────────────────────────────────────────

    const isNetworkError = (error: string): boolean => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'EOF', 'ECONNREFUSED', 'overflow', 'NETWORK_ERROR'];
        return keywords.some(k => error.toLowerCase().includes(k.toLowerCase()));
    };

    // forceLogout: called only for true session expiry (401/SESSION_EXPIRED).
    // Network errors should NOT call this — they should retry instead.
    const forceLogout = async () => {
        setIsConnected(false);
        try {
            await invoke('cmd_clean_cache').catch(() => { });
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
            // Note: we intentionally keep 'televault_phone' in localStorage
            // so the phone field is pre-filled if the user logs in again.
        } catch {
            // best effort cleanup
        }
        toast.error("Session expired. Please log in again.");
        onLogoutRef.current();
    };

    const handleLogout = async () => {
        if (!await confirm({
            title: "Sign Out",
            message: "Are you sure you want to sign out? This will disconnect your active session.",
            confirmText: "Sign Out",
            variant: 'danger'
        })) return;

        try {
            await invoke('cmd_logout');
            await invoke('cmd_clean_cache');
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
            localStorage.removeItem('televault_phone');
            onLogoutRef.current();
        } catch {
            toast.error("Error signing out");
            onLogoutRef.current();
        }
    };

    const handleSyncFolders = async () => {
        if (!store) return;
        setIsSyncing(true);
        try {
            const foundFolders = await invoke<TelegramFolder[]>('cmd_scan_folders');
            const merged = [...folders];
            let added = 0;
            for (const f of foundFolders) {
                if (!merged.find(existing => existing.id === f.id)) {
                    merged.push(f);
                    added++;
                }
            }
            if (added > 0) {
                setFolders(merged);
                await store.set('folders', merged);
                await store.save();
                toast.success(`Scan complete. Found ${added} new folders.`);
            } else {
                toast.info("Scan complete. No new folders found.");
            }
        } catch {
            toast.error("Sync failed");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await invoke<TelegramFolder>('cmd_create_folder', { name });
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error("Failed to create folder: " + e);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: "Delete Folder",
            message: `Are you sure you want to delete "${folderName}"?\nThis will delete the channel on Telegram.`,
            confirmText: "Delete",
            variant: 'danger'
        })) return;

        try {
            await invoke('cmd_delete_folder', { folderId });
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
        } catch (e: unknown) {
            const errStr = String(e);
            if (errStr.includes("not found")) {
                if (await confirm({
                    title: "Folder Not Found",
                    message: `Folder "${folderName}" not found on Telegram (it may have been deleted externally).\nRemove from this app?`,
                    confirmText: "Remove",
                    variant: 'info'
                })) {
                    const updated = folders.filter(f => f.id !== folderId);
                    setFolders(updated);
                    if (store) {
                        await store.set('folders', updated);
                        await store.save();
                    }
                    if (activeFolderId === folderId) setActiveFolderId(null);
                }
            } else {
                toast.error(`Failed to delete folder: ${e}`);
            }
        }
    };


    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
            await store.save();
        }
    };

    return {
        store,
        folders,
        activeFolderId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        isNetworkError,
        forceLogout
    };
}

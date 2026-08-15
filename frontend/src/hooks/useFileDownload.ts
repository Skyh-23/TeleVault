import { useState, useEffect, useRef } from 'react';
import { save, open, listen, UnlistenFn } from '../lib/tauri-extras';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile } from '../types';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
}

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function isRetryableError(error: unknown): boolean {
    const message = String(error).toLowerCase();
    if (
        message.includes('http 400') ||
        message.includes('http 401') ||
        message.includes('http 403') ||
        message.includes('http 404')
    ) {
        return false;
    }
    return (
        message.includes('network') ||
        message.includes('failed to fetch') ||
        message.includes('timeout') ||
        message.includes('abort') ||
        message.includes('connection')
    );
}

export function useFileDownload(store: Store | null) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    // Listen for progress events from the backend SSE bridge
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
            setDownloadQueue(q => q.map(i =>
                i.id === event.payload.id ? { ...i, progress: event.payload.percent } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Load saved queue on mount
    useEffect(() => {
        if (!store || initialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const restorable = saved
                    .filter(i => i.status !== 'success' && i.status !== 'cancelled')
                    .map((item) => ({
                        ...item,
                        retryCount: item.retryCount ?? 0,
                        status: item.status === 'downloading' ? 'resuming' as const : item.status,
                    }));
                if (restorable.length > 0) {
                    setDownloadQueue(restorable);
                    toast.info(`Restored ${restorable.length} pending downloads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    // Save queue when it changes (only pending items)
    useEffect(() => {
        if (!store || !initialized) return;
        const restorable = downloadQueue.filter(i => i.status !== 'success' && i.status !== 'cancelled');
        store.set('downloadQueue', restorable).then(() => store.save());
    }, [store, downloadQueue, initialized]);

    // Queue Processor
    useEffect(() => {
        if (processing) return;
        const nextItem = downloadQueue.find(i => i.status === 'pending' || i.status === 'resuming');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [downloadQueue, processing]);

    const processItem = async (item: DownloadItem) => {
        setProcessing(true);
        const isResume = item.status === 'resuming' || (item.retryCount ?? 0) > 0;
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: i.progress ?? 0, error: undefined } : i));
        if (isResume) {
            toast.info(`Resuming download: ${item.filename}`);
        }

        try {
            let savePath = item.savePath;
            if (!savePath) {
                const selectedPath = await save({ defaultPath: item.filename });
                if (!selectedPath) {
                    setDownloadQueue(q => q.filter(i => i.id !== item.id));
                    setProcessing(false);
                    return;
                }
                savePath = selectedPath;
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, savePath } : i));
            }

            await api.downloadFile({
                messageId: item.messageId,
                savePath,
                folderId: item.folderId,
                transferId: item.id,
                resume: true
            });

            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100, retryCount: 0 } : i));
                toast.success(`Downloaded: ${item.filename}`);
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                const retryCount = item.retryCount ?? 0;
                if (isRetryableError(e) && retryCount < MAX_AUTO_RETRIES) {
                    const nextRetry = retryCount + 1;
                    setDownloadQueue(q => q.map(i => i.id === item.id ? {
                        ...i,
                        status: 'resuming',
                        retryCount: nextRetry,
                        error: `Network issue. Retry ${nextRetry}/${MAX_AUTO_RETRIES}...`
                    } : i));
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * nextRetry));
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'pending' } : i));
                } else {
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                    toast.error(`Download failed: ${item.filename}`);
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            status: 'pending',
            retryCount: 0
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const queueBulkDownload = async (files: TelegramFile[], folderId: number | null) => {
        const dirPath = await open({
            directory: true,
            multiple: false,
            title: "Select Download Destination"
        });
        if (!dirPath) return;
        const baseDir = Array.isArray(dirPath) ? dirPath[0] : dirPath;

        for (const file of files) {
            const newItem: DownloadItem = {
                id: Math.random().toString(36).substr(2, 9),
                messageId: file.id,
                filename: file.name,
                folderId,
                savePath: `${baseDir}\\${file.name}`,
                status: 'pending',
                retryCount: 0
            };
            setDownloadQueue(prev => [...prev, newItem]);
        }

        toast.info(`Queued ${files.length} files for download`);
    };

    const resumeItem = (id: string) => {
        setDownloadQueue(q => q.map(i => i.id === id ? { ...i, status: 'resuming' } : i));
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
    };

    const cancelAll = () => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading' || i.status === 'resuming');
            if (downloading) cancelledRef.current.add(downloading.id);
            return q
                .filter(i => i.status !== 'pending' && i.status !== 'resuming')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All downloads cancelled');
    };

    const removeItem = (id: string) => {
        setDownloadQueue(q => q.filter(i => i.id !== id));
    };

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        resumeItem,
        clearFinished,
        cancelAll,
        removeItem
    };
}

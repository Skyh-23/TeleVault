import { useState, useEffect, useRef } from 'react';
import { open, listen, UnlistenFn } from '../lib/tauri-extras';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueueItem } from '../types';
import { useFileDrop } from './useFileDrop';
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

export function useFileUpload(activeFolderId: number | null, store: Store | null) {
    const queryClient = useQueryClient();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    // Listen for progress events from the backend SSE bridge
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('upload-progress', (event) => {
            setUploadQueue(q => q.map(i =>
                i.id === event.payload.id ? { ...i, progress: event.payload.percent } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    useEffect(() => {
        if (!store || initialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const restorable = saved
                    .filter(i => i.status !== 'success' && i.status !== 'cancelled')
                    .map((item) => ({
                        ...item,
                        retryCount: item.retryCount ?? 0,
                        status: item.status === 'uploading' ? 'resuming' as const : item.status,
                    }));
                if (restorable.length > 0) {
                    setUploadQueue(restorable);
                    toast.info(`Restored ${restorable.length} pending uploads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const restorable = uploadQueue.filter(i => i.status !== 'success' && i.status !== 'cancelled');
        store.set('uploadQueue', restorable).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    useEffect(() => {
        if (processing) return;
        const nextItem = uploadQueue.find(i => i.status === 'pending' || i.status === 'resuming');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [uploadQueue, processing]);

    const processItem = async (item: QueueItem) => {
        setProcessing(true);
        const fileName = item.path.split(/[/\\]/).pop() || item.path;
        const isResume = item.status === 'resuming' || (item.retryCount ?? 0) > 0;
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: i.progress ?? 0, error: undefined } : i));
        if (isResume) {
            toast.info(`Resuming upload: ${fileName}`);
        }
        try {
            await api.uploadFile({
                path: item.path,
                folderId: item.folderId,
                transferId: item.id,
                resume: true
            });
            // Check if cancelled during upload
            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100, retryCount: 0 } : i));
                queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                const retryCount = item.retryCount ?? 0;
                if (isRetryableError(e) && retryCount < MAX_AUTO_RETRIES) {
                    const nextRetry = retryCount + 1;
                    setUploadQueue(q => q.map(i => i.id === item.id ? {
                        ...i,
                        status: 'resuming',
                        retryCount: nextRetry,
                        error: `Network issue. Retry ${nextRetry}/${MAX_AUTO_RETRIES}...`
                    } : i));
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * nextRetry));
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'pending' } : i));
                } else {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                    toast.error(`Upload failed for ${fileName}: ${e}`);
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleManualUpload = async () => {
        try {
            const selected = await open({ multiple: true, directory: false });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                const newItems: QueueItem[] = paths.map((path: string) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    path,
                    folderId: activeFolderId,
                    status: 'pending',
                    retryCount: 0
                }));
                setUploadQueue(prev => [...prev, ...newItems]);
                toast.info(`Queued ${paths.length} files for upload`);
            }
        } catch {
            toast.error("Failed to open file dialog");
        }
    };

    const resumeItem = (id: string) => {
        setUploadQueue(q => q.map(i => i.id === id ? { ...i, status: 'resuming' } : i));
    };

    const cancelAll = () => {
        setUploadQueue(q => {
            const uploading = q.find(i => i.status === 'uploading' || i.status === 'resuming');
            if (uploading) cancelledRef.current.add(uploading.id);
            return q
                .filter(i => i.status !== 'pending' && i.status !== 'resuming')
                .map(i => i.status === 'uploading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    };

    const removeItem = (id: string) => {
        setUploadQueue(q => q.filter(i => i.id !== id));
    };

    const { isDragging } = useFileDrop();

    return {
        uploadQueue,
        setUploadQueue,
        handleManualUpload,
        resumeItem,
        cancelAll,
        removeItem,
        isDragging
    };
}

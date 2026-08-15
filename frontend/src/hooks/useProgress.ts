/**
 * useProgress.ts
 * ============
 * Hook for tracking upload/download progress via Server-Sent Events.
 * Connects to backend /events endpoint for real-time updates.
 */

import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:8765';

interface ProgressState {
  percent: number;
  status: 'idle' | 'connecting' | 'transferring' | 'completed' | 'error';
  error?: string;
}

export function useProgress(transferId: string | null) {
  const [progress, setProgress] = useState<ProgressState>({
    percent: 0,
    status: 'idle',
  });

  useEffect(() => {
    if (!transferId) {
      setProgress({ percent: 0, status: 'idle' });
      return;
    }

    setProgress({ percent: 0, status: 'connecting' });

    // Connect to SSE endpoint with transfer_id
    const evtSource = new EventSource(`${API}/events?transfer_id=${encodeURIComponent(transferId)}`);

    evtSource.onopen = () => {
      setProgress(prev => ({ ...prev, status: 'transferring' }));
    };

    evtSource.onmessage = (event) => {
      // Handle keepalive comments (start with ":")
      if (event.data.startsWith(':')) return;

      try {
        const data = JSON.parse(event.data);
        const percent = Math.min(data.percent || 0, 100);
        const status = percent >= 100 ? 'completed' : 'transferring';

        setProgress({
          percent,
          status,
        });

        // Auto-close on completion
        if (percent >= 100) {
          evtSource.close();
        }
      } catch (e) {
        console.error('Failed to parse progress event:', e);
      }
    };

    evtSource.onerror = (error) => {
      console.error('SSE error:', error);
      setProgress(prev => ({
        ...prev,
        status: prev.percent >= 100 ? 'completed' : 'error',
        error: 'Connection lost',
      }));
      evtSource.close();
    };

    return () => {
      evtSource.close();
    };
  }, [transferId]);

  const reset = useCallback(() => {
    setProgress({ percent: 0, status: 'idle' });
  }, []);

  return {
    percent: progress.percent,
    status: progress.status,
    error: progress.error,
    reset,
    isActive: progress.status === 'connecting' || progress.status === 'transferring',
    isComplete: progress.status === 'completed',
  };
}

/**
 * Hook for managing multiple concurrent transfers
 */
export function useTransferManager() {
  const [transfers, setTransfers] = useState<Map<string, number>>(new Map());

  const addTransfer = useCallback((id: string) => {
    setTransfers(prev => new Map(prev).set(id, 0));
  }, []);

  const updateProgress = useCallback((id: string, percent: number) => {
    setTransfers(prev => new Map(prev).set(id, percent));
  }, []);

  const removeTransfer = useCallback((id: string) => {
    setTransfers(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const overallProgress = transfers.size > 0
    ? Array.from(transfers.values()).reduce((a, b) => a + b, 0) / transfers.size
    : 0;

  return {
    transfers,
    addTransfer,
    updateProgress,
    removeTransfer,
    overallProgress,
    activeCount: transfers.size,
  };
}

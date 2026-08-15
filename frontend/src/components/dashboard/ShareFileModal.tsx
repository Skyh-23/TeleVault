import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Link2, Shield, Clock3, X, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { TelegramFile } from '../../types';
import { api, ShareCreateResponse } from '../../lib/api';

interface ShareFileModalProps {
    file: TelegramFile;
    activeFolderId: number | null;
    onClose: () => void;
}

function formatTimestamp(ts: number | null | undefined): string {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleString();
}

async function copyText(value: string) {
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        toast.success('Copied to clipboard');
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('Copied to clipboard');
    }
}

export function ShareFileModal({ file, activeFolderId, onClose }: ShareFileModalProps) {
    const [mode, setMode] = useState<'easy' | 'secure'>('secure');
    const [expiryHours, setExpiryHours] = useState('24');
    const [customKey, setCustomKey] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [createdShare, setCreatedShare] = useState<ShareCreateResponse | null>(null);

    const {
        data: shares = [],
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['shares', file.id],
        queryFn: () => api.listShares(file.id, true),
    });

    const activeShares = useMemo(() => shares.filter(s => s.active), [shares]);

    const handleCreateShare = async () => {
        const hours = Number(expiryHours);
        if (!Number.isFinite(hours) || hours <= 0) {
            toast.error('Expiry hours must be greater than 0');
            return;
        }

        setIsCreating(true);
        try {
            const response = await api.createShare({
                messageId: file.id,
                folderId: activeFolderId,
                mode,
                expiresInSeconds: Math.floor(hours * 3600),
                key: customKey.trim() || undefined,
            });
            setCreatedShare(response);
            await refetch();
            toast.success('Share link generated');
        } catch (error) {
            toast.error(`Failed to create share: ${error}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevoke = async (revokeId: string) => {
        setRevokingId(revokeId);
        try {
            await api.revokeShare(revokeId);
            await refetch();
            toast.success('Share revoked');
        } catch (error) {
            toast.error(`Failed to revoke share: ${error}`);
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-2xl bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <div>
                        <h3 className="text-telegram-text font-semibold">Share File</h3>
                        <p className="text-xs text-telegram-subtext truncate max-w-[520px] mt-1">{file.name}</p>
                    </div>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4 border-b border-telegram-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                            onClick={() => setMode('secure')}
                            className={`text-left border rounded-lg p-3 transition-colors ${
                                mode === 'secure'
                                    ? 'border-telegram-primary/50 bg-telegram-primary/10'
                                    : 'border-telegram-border hover:bg-telegram-hover'
                            }`}
                        >
                            <div className="flex items-center gap-2 text-telegram-text font-medium">
                                <Shield className="w-4 h-4 text-telegram-primary" />
                                Secure Share
                            </div>
                            <div className="text-xs text-telegram-subtext mt-1">Link and key separate (recommended)</div>
                        </button>

                        <button
                            onClick={() => setMode('easy')}
                            className={`text-left border rounded-lg p-3 transition-colors ${
                                mode === 'easy'
                                    ? 'border-telegram-primary/50 bg-telegram-primary/10'
                                    : 'border-telegram-border hover:bg-telegram-hover'
                            }`}
                        >
                            <div className="flex items-center gap-2 text-telegram-text font-medium">
                                <Link2 className="w-4 h-4 text-telegram-primary" />
                                Easy Share
                            </div>
                            <div className="text-xs text-telegram-subtext mt-1">Single link includes key (less secure)</div>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1">
                            <span className="text-xs text-telegram-subtext">Expiry (hours)</span>
                            <input
                                type="number"
                                min={1}
                                max={720}
                                value={expiryHours}
                                onChange={(e) => setExpiryHours(e.target.value)}
                                className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs text-telegram-subtext">Custom key (optional)</span>
                            <input
                                type="text"
                                value={customKey}
                                onChange={(e) => setCustomKey(e.target.value)}
                                placeholder="Auto-generate if empty"
                                className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50"
                            />
                        </label>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleCreateShare}
                            disabled={isCreating}
                            className="px-4 py-2 rounded-lg bg-telegram-primary/20 text-telegram-primary hover:bg-telegram-primary/30 transition-colors text-sm font-medium disabled:opacity-60"
                        >
                            {isCreating ? 'Generating...' : 'Generate Share Link'}
                        </button>
                    </div>

                    {createdShare && (
                        <div className="border border-telegram-border rounded-lg p-3 bg-telegram-hover space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-telegram-text font-medium">Latest Share</span>
                                <span className="text-[11px] text-telegram-subtext flex items-center gap-1">
                                    <Clock3 className="w-3 h-3" />
                                    Expires: {formatTimestamp(createdShare.expiry)}
                                </span>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-telegram-subtext">Link</div>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={createdShare.link}
                                        className="flex-1 bg-black/20 border border-telegram-border rounded-md px-2 py-1.5 text-xs text-telegram-text"
                                    />
                                    <button
                                        onClick={() => copyText(createdShare.link)}
                                        className="px-2.5 py-1.5 text-xs rounded-md border border-telegram-border hover:bg-telegram-surface transition-colors text-telegram-text flex items-center gap-1"
                                    >
                                        <Copy className="w-3 h-3" />
                                        Copy
                                    </button>
                                </div>
                            </div>

                            {createdShare.key && (
                                <div className="space-y-2">
                                    <div className="text-xs text-telegram-subtext">Key (share separately)</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            readOnly
                                            value={createdShare.key}
                                            className="flex-1 bg-black/20 border border-telegram-border rounded-md px-2 py-1.5 text-xs text-telegram-text"
                                        />
                                        <button
                                            onClick={() => copyText(createdShare.key!)}
                                            className="px-2.5 py-1.5 text-xs rounded-md border border-telegram-border hover:bg-telegram-surface transition-colors text-telegram-text flex items-center gap-1"
                                        >
                                            <Copy className="w-3 h-3" />
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="text-[11px] text-telegram-subtext">
                                Revoke ID: <span className="font-mono text-telegram-text">{createdShare.revokeId}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm text-telegram-text font-medium">Active Shares</h4>
                        <button
                            onClick={() => refetch()}
                            className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors"
                        >
                            Refresh
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="text-sm text-telegram-subtext">Loading shares...</div>
                    ) : activeShares.length === 0 ? (
                        <div className="text-sm text-telegram-subtext">No active share links for this file.</div>
                    ) : (
                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                            {activeShares.map((share) => (
                                <div key={share.revokeId} className="bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-xs text-telegram-text truncate font-mono">{share.revokeId}</div>
                                        <div className="text-[11px] text-telegram-subtext">
                                            {share.mode === 'secure' ? 'Secure' : 'Easy'} • Expires {formatTimestamp(share.expiry)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRevoke(share.revokeId)}
                                        disabled={revokingId === share.revokeId}
                                        className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors flex items-center gap-1 disabled:opacity-60"
                                    >
                                        <Ban className="w-3 h-3" />
                                        {revokingId === share.revokeId ? 'Revoking...' : 'Revoke'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

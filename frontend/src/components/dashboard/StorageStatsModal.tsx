import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, BarChart3, FileAudio, HardDrive, Image, FileText, Video, RefreshCw, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes } from '../../utils';

interface StorageStatsModalProps {
    activeFolderId: number | null;
    currentFolderName: string;
    onClose: () => void;
}

function StatCard({
    label,
    value,
    icon,
    subText,
}: {
    label: string;
    value: string;
    icon: ReactNode;
    subText?: string;
}) {
    return (
        <div className="bg-telegram-hover border border-telegram-border rounded-lg p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs text-telegram-subtext">{label}</span>
                <span className="text-telegram-subtext">{icon}</span>
            </div>
            <div className="mt-2 text-lg font-semibold text-telegram-text">{value}</div>
            {subText && <div className="text-[11px] text-telegram-subtext mt-1">{subText}</div>}
        </div>
    );
}

export function StorageStatsModal({ activeFolderId, currentFolderName, onClose }: StorageStatsModalProps) {
    const [allFolders, setAllFolders] = useState(activeFolderId === null);

    useEffect(() => {
        if (activeFolderId === null) {
            setAllFolders(true);
        }
    }, [activeFolderId]);

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['storage-stats-modal', activeFolderId, allFolders],
        queryFn: () => api.storageStats(activeFolderId, allFolders),
    });

    const title = allFolders ? 'All Folders Analytics' : `${currentFolderName} Analytics`;
    const categoryItems = data ? [
        { key: 'videos', label: 'Video', icon: <Video className="w-4 h-4" /> },
        { key: 'images', label: 'Images', icon: <Image className="w-4 h-4" /> },
        { key: 'audio', label: 'Audio', icon: <FileAudio className="w-4 h-4" /> },
        { key: 'archives', label: 'Archives', icon: <Archive className="w-4 h-4" /> },
        { key: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
        { key: 'other', label: 'Other', icon: <HardDrive className="w-4 h-4" /> },
    ].map(item => ({ ...item, ...(data.categories?.[item.key] || { files: 0, size: 0 }) })) : [];
    const largestCategory = [...categoryItems].sort((a, b) => b.size - a.size)[0];

    return (
        <div className="fixed inset-0 z-[210] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-3xl bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-telegram-primary" />
                        <h3 className="text-telegram-text font-semibold">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-telegram-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                        <button
                            onClick={() => setAllFolders(false)}
                            className={`px-3 py-1.5 rounded-md border transition-colors ${
                                !allFolders
                                    ? 'bg-telegram-primary/20 text-telegram-primary border-telegram-primary/40'
                                    : 'text-telegram-subtext border-telegram-border hover:bg-telegram-hover'
                            }`}
                        >
                            Current Folder
                        </button>
                        <button
                            onClick={() => setAllFolders(true)}
                            className={`px-3 py-1.5 rounded-md border transition-colors ${
                                allFolders
                                    ? 'bg-telegram-primary/20 text-telegram-primary border-telegram-primary/40'
                                    : 'text-telegram-subtext border-telegram-border hover:bg-telegram-hover'
                            }`}
                        >
                            All Folders
                        </button>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="px-3 py-1.5 text-sm rounded-md border border-telegram-border text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <div className="p-4 min-h-[240px]">
                    {isLoading ? (
                        <div className="h-40 flex items-center justify-center text-telegram-subtext">
                            <div className="w-6 h-6 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin mr-3" />
                            Loading storage analytics...
                        </div>
                    ) : error ? (
                        <div className="h-40 flex items-center justify-center text-red-400 text-sm">
                            Failed to load storage analytics
                        </div>
                    ) : data ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                <StatCard
                                    label="Total Files"
                                    value={String(data.total_files)}
                                    icon={<FileText className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="Total Storage"
                                    value={formatBytes(data.total_size)}
                                    icon={<HardDrive className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="Largest category"
                                    value={largestCategory?.label || '—'}
                                    icon={<Video className="w-4 h-4" />}
                                    subText={formatBytes(largestCategory?.size || 0)}
                                />
                                <StatCard
                                    label="Images"
                                    value={String(data.images)}
                                    icon={<Image className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="File types"
                                    value={`${categoryItems.filter(item => item.files > 0).length} categories`}
                                    icon={<FileText className="w-4 h-4" />}
                                />
                                <StatCard
                                    label="Network Usage"
                                    value={formatBytes((data.bandwidth?.up_bytes || 0) + (data.bandwidth?.down_bytes || 0))}
                                    icon={<BarChart3 className="w-4 h-4" />}
                                    subText={`↑ ${formatBytes(data.bandwidth?.up_bytes || 0)} • ↓ ${formatBytes(data.bandwidth?.down_bytes || 0)}`}
                                />
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <section className="rounded-xl border border-telegram-border p-4">
                                    <h4 className="text-sm font-semibold text-telegram-text">Storage by file type</h4>
                                    <div className="mt-3 space-y-3">
                                        {categoryItems.map(item => {
                                            const percentage = data.total_size ? Math.round((item.size / data.total_size) * 100) : 0;
                                            return <div key={item.key}>
                                                <div className="flex items-center justify-between gap-3 text-xs">
                                                    <span className="flex items-center gap-2 text-telegram-subtext">{item.icon}{item.label} <span className="text-telegram-text">{item.files}</span></span>
                                                    <span className="text-telegram-text">{formatBytes(item.size)}</span>
                                                </div>
                                                <div className="mt-1.5 h-1.5 rounded-full bg-telegram-hover overflow-hidden"><div className="h-full rounded-full bg-telegram-primary" style={{ width: `${percentage}%` }} /></div>
                                            </div>;
                                        })}
                                    </div>
                                </section>
                                <section className="rounded-xl border border-telegram-border p-4">
                                    <h4 className="text-sm font-semibold text-telegram-text">Largest files</h4>
                                    <div className="mt-3 space-y-2">
                                        {data.largest_files?.length ? data.largest_files.map((file, index) => <div key={`${file.id}-${index}`} className="flex items-center gap-3 text-xs">
                                            <span className="w-5 text-telegram-subtext">{index + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-telegram-text" title={file.name}>{file.name}</span>
                                            <span className="shrink-0 text-telegram-subtext">{formatBytes(file.size)}</span>
                                        </div>) : <p className="text-xs text-telegram-subtext">No files found.</p>}
                                    </div>
                                </section>
                            </div>
                            <section className="rounded-xl border border-telegram-border p-4">
                                <h4 className="text-sm font-semibold text-telegram-text">Usage by folder</h4>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {data.folder_usage?.length ? data.folder_usage.map(folder => <div key={String(folder.id)} className="flex items-center justify-between gap-3 rounded-lg bg-telegram-hover px-3 py-2 text-xs">
                                        <span className="truncate text-telegram-text">{folder.name} <span className="text-telegram-subtext">· {folder.files} files</span></span>
                                        <span className="shrink-0 text-telegram-subtext">{formatBytes(folder.size)}</span>
                                    </div>) : <p className="text-xs text-telegram-subtext">No folder usage data found.</p>}
                                </div>
                            </section>
                            <div className="text-xs text-telegram-subtext">
                                All insights are calculated from local file metadata. Scanned folders: <span className="text-telegram-text font-medium">{data.folders_scanned}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

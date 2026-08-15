import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Folder, Eye, Trash2, Share2, Download, Check } from 'lucide-react';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileCardProps {
    file: TelegramFile;
    onDelete: () => void;
    onDownload: () => void;
    onShare?: () => void;
    onPreview?: () => void;
    isSelected: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    activeFolderId?: number | null;
    height?: number;
    onToggleSelection?: () => void;
}

function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
}

function isVideoFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext);
}

export function FileCard({ file, onDelete, onDownload, onShare, onPreview, isSelected, onClick, onContextMenu, onDrop, onDragStart, onDragEnd, activeFolderId, height, onToggleSelection }: FileCardProps) {
    const isFolder = file.type === 'folder';
    const [isDragOver, setIsDragOver] = useState(false);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.1 }
        );

        if (cardRef.current) observer.observe(cardRef.current);

        return () => {
            if (cardRef.current) observer.unobserve(cardRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isVisible || isFolder || (!isImageFile(file.name) && !isVideoFile(file.name))) return;

        let isMounted = true;
        const thumbnailUrl = `http://127.0.0.1:8765/thumbnail?message_id=${file.id}&folder_id=${activeFolderId || ''}`;
        
        fetch(thumbnailUrl)
            .then(res => {
                if (!res.ok) throw new Error('Thumbnail not available');
                return res.blob();
            })
            .then(blob => {
                if (!isMounted) return;
                const url = URL.createObjectURL(blob);
                setThumbnail(url);
            })
            .catch(() => {
                // Fallback to default file icon
            });

        return () => {
            isMounted = false;
        };
    }, [file.id, file.name, activeFolderId, isFolder, isVisible]);

    return (
        <div
            ref={cardRef}
            className="relative"
            onContextMenu={onContextMenu}
            onClick={onClick}
            onDragOver={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDragOver) setIsDragOver(true);
                }
            }}
            onDragLeave={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                }
            }}
            onDrop={(e) => {
                if (isFolder && onDrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    onDrop(e, file.id);
                }
            }}
        >
            <motion.div
                layout
                draggable={!isFolder}
                onDragStart={(e: any) => {
                    if (onDragStart) onDragStart(file.id);
                    e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                    if (onDragEnd) onDragEnd();
                }}
                whileHover={{ y: -3 }}
                className={`group cursor-pointer bg-slate-900/70 dark:bg-slate-900/90 rounded-2xl overflow-hidden border backdrop-blur-md transition-all duration-200 relative shadow-md hover:shadow-xl hover:shadow-indigo-500/10
                ${isSelected ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/50' : 'border-white/10 dark:border-slate-800 hover:border-indigo-500/40'}
                ${isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-500/20 scale-105' : ''}`}
                style={height ? { height: `${height}px` } : { aspectRatio: '4/3' }}
            >
                {/* Thumbnail or Icon Display */}
                {thumbnail ? (
                    <div className="absolute inset-0">
                        <img
                            src={thumbnail}
                            alt={file.name}
                            className="w-full h-full object-cover pointer-events-none transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        {isFolder ? (
                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                <Folder className="w-7 h-7" />
                            </div>
                        ) : (
                            <FileTypeIcon filename={file.name} size="lg" />
                        )}
                    </div>
                )}

                {/* Checkbox Selector */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleSelection) onToggleSelection();
                    }}
                    className={`absolute top-3 left-3 w-5 h-5 rounded-md border flex items-center justify-center transition-all z-20 cursor-pointer ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white shadow-md' : 'border-white/20 bg-slate-950/60 opacity-0 group-hover:opacity-100 hover:border-indigo-400'}`}
                >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                {/* Quick Action Floating Bar */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1 z-20">
                    {onPreview && (
                        <button onClick={(e) => { e.stopPropagation(); onPreview(); }} className="p-1.5 bg-slate-950/80 hover:bg-indigo-600 rounded-lg text-white/80 hover:text-white backdrop-blur-md transition-all shadow-md" title="Preview">
                            <Eye className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {file.type !== 'folder' && onShare && (
                        <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="p-1.5 bg-slate-950/80 hover:bg-purple-600 rounded-lg text-white/80 hover:text-white backdrop-blur-md transition-all shadow-md" title="Share">
                            <Share2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onDownload(); }} className="p-1.5 bg-slate-950/80 hover:bg-emerald-600 rounded-lg text-white/80 hover:text-white backdrop-blur-md transition-all shadow-md" title="Download">
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 bg-slate-950/80 hover:bg-rose-600 rounded-lg text-white/80 hover:text-white backdrop-blur-md transition-all shadow-md" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* File Details Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10">
                    <h3 className="text-xs font-bold text-white truncate w-full tracking-tight" title={file.name}>{file.name}</h3>
                    <p className="text-[11px] mt-0.5 text-slate-400 font-medium">{file.sizeStr}</p>
                </div>
            </motion.div>
        </div>
    );
}


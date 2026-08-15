import { useState } from 'react';
import { Folder, Eye, Download, Trash2, Share2 } from 'lucide-react';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileListItemProps {
    file: TelegramFile;
    selectedIds: number[];
    onFileClick: (e: React.MouseEvent, id: number) => void;
    handleContextMenu: (e: React.MouseEvent, file: TelegramFile) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onPreview: (file: TelegramFile) => void;
    onShare?: (file: TelegramFile) => void;
    onDownload: (id: number, name: string) => void;
    onDelete: (id: number) => void;
}

export function FileListItem({
    file, selectedIds, onFileClick, handleContextMenu,
    onDragStart, onDragEnd, onDrop,
    onPreview, onShare, onDownload, onDelete
}: FileListItemProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFolder = file.type === 'folder';

    return (
        <div
            onClick={(e) => onFileClick(e, file.id)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable
            onDragStart={(e) => {
                if (onDragStart) onDragStart(file.id);
                e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
                if (onDragEnd) onDragEnd();
            }}
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
            className={`group grid grid-cols-[2.5rem_2fr_6rem_8rem] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer border border-transparent transition-all hover:bg-white/5 dark:hover:bg-slate-800/60 
                ${selectedIds.includes(file.id) ? 'bg-indigo-500/10 border-indigo-500/30' : ''}
                ${isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : ''}
            `}
        >
            <div className="flex justify-center">
                {isFolder ? <Folder className="w-5 h-5 text-indigo-400" /> : <FileTypeIcon filename={file.name} className="w-5 h-5" />}
            </div>
            <div className="truncate text-xs font-semibold text-white tracking-tight relative pr-8 flex items-center justify-between">
                <span className="truncate">{file.name}</span>
                {/* List Action Bar */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center bg-slate-900 border border-white/10 shadow-lg rounded-lg p-1 space-x-1 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onPreview(file); }} className="p-1 hover:text-indigo-400 text-slate-400 transition-colors" title="Preview"><Eye className="w-3.5 h-3.5" /></button>
                    {file.type !== 'folder' && onShare && (
                        <button onClick={(e) => { e.stopPropagation(); onShare(file); }} className="p-1 hover:text-purple-400 text-slate-400 transition-colors" title="Share"><Share2 className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.name); }} className="p-1 hover:text-emerald-400 text-slate-400 transition-colors" title="Download"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} className="p-1 hover:text-rose-400 text-slate-400 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            </div>
            <div className="text-right text-xs font-medium text-slate-400 truncate">{file.sizeStr}</div>
            <div className="text-right text-xs text-slate-500 font-mono truncate">{file.created_at || '-'}</div>
        </div>
    );
}


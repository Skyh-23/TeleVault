import { useState } from 'react';
import { Plus } from 'lucide-react';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDelete?: () => void;
    folderId: number | null;
}

export function SidebarItem({ icon: Icon, label, active = false, onClick, onDrop, onDelete }: SidebarItemProps) {
    const [isOver, setIsOver] = useState(false);

    return (
        <button
            onClick={onClick}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    setIsOver(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(false);
                if (onDrop) onDrop(e);
            }}
            onContextMenu={(e) => {
                if (onDelete) {
                    e.preventDefault();
                    onDelete();
                }
            }}
            className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${active
                ? 'bg-gradient-to-r from-indigo-500/20 to-indigo-500/10 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                : isOver
                    ? 'bg-indigo-500/30 text-white ring-2 ring-indigo-500 scale-[1.02] shadow-lg'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                }`}
        >
            <Icon className={`w-4 h-4 transition-colors ${active ? 'text-indigo-400' : isOver ? 'text-indigo-300' : 'text-slate-400 group-hover:text-slate-200'}`} />
            <span className="flex-1 text-left truncate">{label}</span>
            {onDelete && (
                <div onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 rounded-md hover:bg-rose-500/10 transition-all">
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                </div>
            )}
        </button>
    );
}


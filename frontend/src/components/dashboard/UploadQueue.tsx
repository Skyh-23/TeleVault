import { QueueItem } from "../../types";
import { X, Minus, Maximize2, GripHorizontal, Upload } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface UploadQueueProps {
    items: QueueItem[];
    onClearFinished: () => void;
    onCancelAll: () => void;
    onResume: (id: string) => void;
    onRemoveItem: (id: string) => void;
}

export function UploadQueue({ items, onClearFinished, onCancelAll, onResume, onRemoveItem }: UploadQueueProps) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 380 });
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef({ offsetX: 0, offsetY: 0 });

    useEffect(() => {
        const saved = localStorage.getItem("upload_panel_pos");
        if (saved) {
            try {
                setPosition(JSON.parse(saved));
            } catch (e) {}
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("upload_panel_pos", JSON.stringify(position));
    }, [position]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setDragging(true);
        dragRef.current = {
            offsetX: e.clientX - position.x,
            offsetY: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            setPosition({
                x: e.clientX - dragRef.current.offsetX,
                y: e.clientY - dragRef.current.offsetY
            });
        };

        const handleMouseUp = () => setDragging(false);

        if (dragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragging]);

    // Auto cleanup timer
    useEffect(() => {
        const timer = setInterval(() => {
            items.forEach(item => {
                if (item.status === 'cancelled' || item.status === 'error' || item.status === 'success') {
                    onRemoveItem(item.id);
                }
            });
        }, 4000);

        return () => clearInterval(timer);
    }, [items, onRemoveItem]);

    if (items.length === 0) return null;

    const hasPendingOrActive = items.some(i => i.status === 'pending' || i.status === 'resuming' || i.status === 'uploading');
    const activeCount = items.filter(i => i.status === 'pending' || i.status === 'resuming' || i.status === 'uploading').length;

    return (
        <div 
            className="fixed w-80 bg-slate-900/95 dark:bg-slate-950/95 border border-white/10 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[40] backdrop-blur-2xl"
            style={{ left: position.x, top: position.y }}
        >
            <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2 cursor-move" onMouseDown={handleMouseDown}>
                <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
                <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <h4 className="text-xs font-bold text-white flex-1">Uploads</h4>
                {activeCount > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                        {activeCount} active
                    </span>
                )}
                <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="text-slate-500 hover:text-white transition-colors ml-1">
                    {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
            </div>
            
            {!isMinimized && (
                <>
                    <div className="px-3 py-1.5 border-b border-white/5 flex justify-end gap-3">
                        {hasPendingOrActive && (
                            <button onClick={onCancelAll} className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition-colors">Cancel All</button>
                        )}
                        <button onClick={onClearFinished} className="text-[10px] font-semibold text-indigo-400 hover:text-white transition-colors">
                            Clear Finished
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
                        {items.map(item => (
                            <div key={item.id} className="flex flex-col gap-1 p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
                                <div className="flex items-center gap-2 text-xs">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.status === 'pending' ? 'bg-amber-400' :
                                        item.status === 'resuming' ? 'bg-purple-400 animate-pulse' :
                                            item.status === 'uploading' ? 'bg-indigo-400 animate-pulse' :
                                            item.status === 'cancelled' ? 'bg-slate-500' :
                                                item.status === 'error' ? 'bg-rose-500' : 'bg-emerald-400'
                                        }`} />
                                    <div className="flex-1 truncate text-slate-300 text-[11px] font-medium" title={item.path}>
                                        {item.path.split(/[/\\]/).pop()}
                                    </div>
                                    {(item.status === 'uploading' || item.status === 'resuming') && item.progress !== undefined && (
                                        <div className="text-[10px] text-indigo-400 font-mono font-bold">{item.progress}%</div>
                                    )}
                                    {item.status === 'error' && <div className="text-[10px] text-rose-400 font-semibold">Error</div>}
                                    {item.status === 'cancelled' && <div className="text-[10px] text-slate-500">Cancelled</div>}
                                    {item.status === 'success' && <div className="text-[10px] text-emerald-400 font-semibold">Done</div>}
                                    <button onClick={() => onRemoveItem(item.id)} className="text-slate-500 hover:text-white transition-colors opacity-50 hover:opacity-100 ml-1">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                {(item.status === 'uploading' || item.status === 'resuming') && (
                                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                        {item.progress !== undefined ? (
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
                                                style={{ width: `${item.progress}%` }}
                                            />
                                        ) : (
                                            <div className="bg-indigo-500 h-full w-full animate-progress-indeterminate" />
                                        )}
                                    </div>
                                )}
                                {item.status === 'error' && (
                                    <button onClick={() => onResume(item.id)} className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors font-semibold text-left">
                                        ↻ Resume Upload
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

import { HardDrive, LayoutGrid, List, Sun, Moon, ShieldCheck, BarChart3, Search, FolderDown, Trash2, FolderInput } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    onShowMoveModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    onOpenStorageStats: () => void;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
}

export function TopBar({
    currentFolderName, selectedIds, onShowMoveModal, onBulkDownload, onBulkDelete,
    onDownloadFolder, onOpenStorageStats, viewMode, setViewMode, searchTerm, onSearchChange
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="h-16 border-b border-white/5 dark:border-slate-800/80 flex items-center px-6 justify-between bg-slate-900/60 dark:bg-slate-950/60 backdrop-blur-xl sticky top-0 z-20" onClick={e => e.stopPropagation()}>
            {/* Breadcrumb Path */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold select-none bg-white/5 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-white/10 dark:border-slate-800">
                    <span className="text-slate-400">Vault</span>
                    <span className="text-slate-600 dark:text-slate-600">/</span>
                    <span className="text-indigo-400 font-bold">{currentFolderName}</span>
                </div>
            </div>

            {/* Global Search Bar */}
            <div className="flex-1 max-w-md mx-6">
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search files in vault..."
                        className="w-full bg-slate-950/60 border border-white/10 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            {/* Right Action Icons & Security Badge */}
            <div className="flex items-center gap-3">
                {/* Security Tag */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-300 font-semibold tracking-wide">AES-256-GCM</span>
                </div>

                {/* Bulk Actions Toolbar */}
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-indigo-500/30 px-3 py-1 rounded-xl shadow-lg shadow-indigo-500/10 animate-in fade-in zoom-in-95">
                        <span className="text-xs font-semibold text-indigo-300 mr-1">{selectedIds.length} Selected</span>
                        <button onClick={onShowMoveModal} className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5">
                            <FolderInput className="w-3.5 h-3.5" /> Move
                        </button>
                        <button onClick={onBulkDownload} className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5">
                            <FolderDown className="w-3.5 h-3.5" /> Download
                        </button>
                        <button onClick={onBulkDelete} className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                    </div>
                )}

                {/* Tools Buttons */}
                <button
                    onClick={onDownloadFolder}
                    className="p-2 hover:bg-white/5 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10 relative group"
                    title="Download All Folder Files"
                >
                    <HardDrive className="w-4 h-4" />
                </button>

                <button
                    onClick={onOpenStorageStats}
                    className="p-2 hover:bg-white/5 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10 relative group"
                    title="Storage Analytics"
                >
                    <BarChart3 className="w-4 h-4" />
                </button>

                <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="p-2 hover:bg-white/5 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10 relative group"
                    title={viewMode === 'grid' ? 'Switch to List' : 'Switch to Grid'}
                >
                    {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                </button>

                <div className="w-px h-5 bg-white/10 dark:bg-slate-800 mx-0.5" />

                <button
                    onClick={toggleTheme}
                    className="p-2 hover:bg-white/5 dark:hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10 relative group"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                </button>
            </div>
        </header>
    );
}


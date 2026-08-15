import { useState } from 'react';
import { HardDrive, Folder, Plus, RefreshCw, LogOut, Layers, Info, Shield } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { TelegramFolder, BandwidthStats } from '../../types';
import { isAndroidNative } from '../../lib/api';

interface SidebarProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    setActiveFolderId: (id: number | null) => void;
    onDrop: (e: React.DragEvent, folderId: number | null) => void;
    onDelete: (id: number, name: string) => void;
    onCreate: (name: string) => Promise<void>;
    isSyncing: boolean;
    isConnected: boolean;
    onSync: () => void;
    onSyncAll: () => void;
    onLogout: () => void;
    onShowAbout: () => void;
    onOpenVaultRecovery: () => void;
    bandwidth: BandwidthStats | null;
}

export function Sidebar({
    folders, activeFolderId, setActiveFolderId, onDrop, onDelete, onCreate,
    isSyncing, isConnected, onSync, onSyncAll, onLogout, onShowAbout, onOpenVaultRecovery, bandwidth
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const mobileVault = isAndroidNative();

    const submitCreate = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onCreate(newFolderName);
            setNewFolderName("");
            setShowNewFolderInput(false);
        } catch {
            // handled by parent
        }
    }

    return (
        <aside className="w-64 bg-slate-900/80 dark:bg-slate-950/90 border-r border-white/10 dark:border-slate-800/80 flex flex-col backdrop-blur-xl relative z-20" onClick={e => e.stopPropagation()}>
            {/* Header Brand */}
            <div className="p-4 flex items-center justify-between border-b border-white/5 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 p-0.5 shadow-md shadow-indigo-500/20">
                        <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center p-1.5">
                            <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-full h-full" alt="Logo" />
                        </div>
                    </div>
                    <div>
                        <span className="font-bold text-sm text-white tracking-tight block">TeleVault</span>
                        <span className="text-[10px] text-slate-400 font-medium">Encrypted Storage</span>
                    </div>
                </div>

                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-500'}`} title={isConnected ? "Connected to Telegram" : "Disconnected"} />
            </div>

            {/* Folder Navigation */}
            <div className="px-3 pt-4 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-2">Vault Folders</span>
            </div>

            <nav className="flex-1 px-2.5 space-y-1 overflow-y-auto min-h-0">
                <SidebarItem
                    icon={HardDrive}
                    label={mobileVault ? "Mobile Vault" : "Saved Messages"}
                    active={activeFolderId === null}
                    onClick={() => setActiveFolderId(null)}
                    onDrop={(e: React.DragEvent) => onDrop(e, null)}
                    folderId={null}
                />
                {folders.map(folder => (
                    <SidebarItem
                        key={folder.id}
                        icon={Folder}
                        label={folder.name}
                        active={activeFolderId === folder.id}
                        onClick={() => setActiveFolderId(folder.id)}
                        onDrop={(e: React.DragEvent) => onDrop(e, folder.id)}
                        onDelete={() => onDelete(folder.id, folder.name)}
                        folderId={folder.id}
                    />
                ))}
            </nav>

            {/* Create Folder & Sync Controls */}
            <div className="p-3 border-t border-white/5 dark:border-slate-800/60 space-y-2">
                {showNewFolderInput ? (
                    <div className="p-1">
                        <input
                            autoFocus
                            type="text"
                            className="w-full bg-slate-950 rounded-xl px-3 py-2 text-xs text-white border border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="New Folder Name..."
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitCreate()}
                            onBlur={() => !newFolderName && setShowNewFolderInput(false)}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewFolderInput(true)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-dashed border-white/10 dark:border-slate-800"
                    >
                        <Plus className="w-4 h-4 text-indigo-400" />
                        Create New Folder
                    </button>
                )}
                
                <button
                    onClick={onSyncAll}
                    disabled={isSyncing}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-dashed border-white/10 dark:border-slate-800 disabled:opacity-50"
                >
                    <Layers className="w-4 h-4 text-cyan-400" />
                    {mobileVault ? "Refresh All Folders" : "Sync All Folders"}
                </button>
            </div>

            {/* Bottom Actions Footer */}
            <div className="p-3 border-t border-white/5 dark:border-slate-800/60 bg-slate-950/40 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl transition-all ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing' : 'Sync'}
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                        onClick={onShowAbout}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-semibold text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all"
                    >
                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                        About
                    </button>
                    <button
                        onClick={onOpenVaultRecovery}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-semibold text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all"
                    >
                        <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        Backup
                    </button>
                </div>

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}
            </div>
        </aside>
    );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3, FolderDown, FolderInput,
  LayoutGrid, List, Search,
  Trash2, DownloadCloud, Folder as FolderIcon,
} from "lucide-react";
import { invoke, isAndroidNative } from "../lib/api";
import { tryReconnectTelegram, isNotConnectedError } from "../lib/reconnect";
import { TelegramFile, BandwidthStats } from "../types";
import { formatBytes } from "../utils";

import { useTelegramConnection } from "../hooks/useTelegramConnection";
import { useFileOperations } from "../hooks/useFileOperations";
import { useFileUpload } from "../hooks/useFileUpload";
import { useFileDownload } from "../hooks/useFileDownload";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

import { AuroraBackground } from "./AuroraBackground";
import { IconButton, Modal, EmptyState } from "./primitives";
import { NavSidebar } from "./NavSidebar";
import { FolderSidebar } from "./FolderSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { Library } from "./Library";
import { TransferDock } from "./TransferDock";
import { InsightsModal } from "./InsightsModal";
import { ShareModal } from "./ShareModal";
import { OpenLinkModal } from "./OpenLinkModal";
import { VaultBackupModal } from "./VaultBackupModal";
import { AboutModal } from "./AboutModal";
import { Viewer } from "./Viewer";

type ViewMode = "grid" | "list";

export function Shell({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();

  const {
    store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
    handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete,
  } = useTelegramConnection(onLogout);

  const [viewerFile, setViewerFile] = useState<TelegramFile | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [openLinkOpen, setOpenLinkOpen] = useState(false);
  const [shareFile, setShareFile] = useState<TelegramFile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const internalDragRef = useRef<number | null>(null);
  const [viewerContextFiles, setViewerContextFiles] = useState<TelegramFile[]>([]);
  const [viewerContextIndex, setViewerContextIndex] = useState(-1);

  // ── Persisted view mode ────────────────────────────────────────────
  useEffect(() => {
    if (store) store.get<ViewMode>("viewMode").then((saved) => saved && setViewMode(saved));
  }, [store]);

  useEffect(() => {
    if (store) store.set("viewMode", viewMode).then(() => store.save());
  }, [store, viewMode]);

  // ── Files query (self-heals a dropped Telegram session) ───────────
  const { data: allFiles = [], isLoading, error } = useQuery({
    queryKey: ["files", activeFolderId],
    queryFn: async () => {
      const mapRawFiles = (res: any[]): TelegramFile[] => res.map((f) => ({
        ...f,
        sizeStr: formatBytes(f.size),
        type: f.icon_type || (f.name.endsWith("/") ? "folder" : "file"),
      })) as TelegramFile[];

      const fetchFiles = () => invoke<any[]>("cmd_get_files", { folderId: activeFolderId }).then(mapRawFiles);
      try {
        return await fetchFiles();
      } catch (e) {
        // Session dropped mid-flight → reconnect once, then retry.
        if (isNotConnectedError(e)) {
          const ok = await tryReconnectTelegram();
          if (ok) {
            try { return await fetchFiles(); } catch { /* fall through to error handling */ }
          }
        }
        const errStr = String(e);
        if (errStr.includes("not found") || errStr.includes("Not Found") || errStr.includes("400")) return [];
        throw e;
      }
    },
    enabled: !!store,
    staleTime: 60_000,
    retry: false,
  });

  const displayedFiles = searchTerm.length > 2
    ? searchResults
    : allFiles.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const { data: bandwidth } = useQuery({
    queryKey: ["bandwidth"],
    queryFn: () => invoke<BandwidthStats>("cmd_get_bandwidth"),
    refetchInterval: 5000,
    enabled: !!store,
  });

  const {
    handleDelete, handleBulkDelete, handleBulkDownload, handleBulkMove, handleDownloadFolder, handleGlobalSearch,
  } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles);

  const {
    uploadQueue, setUploadQueue, handleManualUpload, resumeItem: resumeUpload,
    cancelAll: cancelUploads, removeItem: removeUploadItem,
  } = useFileUpload(activeFolderId, store);

  const {
    downloadQueue, queueDownload, resumeItem: resumeDownload,
    clearFinished: clearDownloads, cancelAll: cancelDownloads, removeItem: removeDownloadItem,
  } = useFileDownload(store);

  // ── Sync all ───────────────────────────────────────────────────────
  const handleSyncAll = async () => {
    try {
      await handleSyncFolders();
      const res = await invoke<{ files: any[] }>("cmd_sync_all_folders");
      const filesByFolder = new Map<number | null, TelegramFile[]>();
      filesByFolder.set(null, []);
      for (const rawFile of res.files) {
        const folderId = rawFile.folder_id ?? rawFile.folderId ?? null;
        const normalized = folderId === null || folderId === undefined || folderId === "" ? null : Number(folderId);
        filesByFolder.set(normalized, [...(filesByFolder.get(normalized) || []), {
          ...rawFile,
          folder_id: normalized,
          sizeStr: formatBytes(rawFile.size),
          type: rawFile.icon_type || (rawFile.name.endsWith("/") ? "folder" : "file"),
        } as TelegramFile]);
      }
      for (const [folderId, files] of filesByFolder) queryClient.setQueryData(["files", folderId], files);
      toast.success(`Synced ${res.files.length} file(s).`);
    } catch (error) {
      toast.error(`Sync failed: ${error}`);
    }
  };

  // ── Reconnect (self-heal a dropped Telegram session) ─────────────
  const handleReconnect = async (): Promise<boolean> => {
    if (reconnecting) return false;
    setReconnecting(true);
    try {
      const ok = await tryReconnectTelegram();
      if (ok) {
        toast.success("Reconnected to Telegram.");
        queryClient.invalidateQueries();
      } else {
        toast.error("Reconnect failed. Check your network connection.");
      }
      return ok;
    } catch {
      toast.error("Reconnect failed.");
      return false;
    } finally {
      setReconnecting(false);
    }
  };

  // ── Search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTerm.length <= 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await handleGlobalSearch(searchTerm);
      setSearchResults(results);
      setIsSearching(false);
    }, 450);
    return () => clearTimeout(timer);
    // Note: handleGlobalSearch is recreated each render; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // ── Reset transient state on folder change ────────────────────────
  useEffect(() => {
    setSelectedIds([]);
    setMoveOpen(false);
    setSearchTerm("");
    setSearchResults([]);
    setViewerFile(null);
    setViewerContextFiles([]);
    setViewerContextIndex(-1);
  }, [activeFolderId]);

  // ── Selection / preview ────────────────────────────────────────────
  const handleFileClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
    } else {
      setSelectedIds([id]);
    }
  };

  const handleToggleSelection = useCallback((id: number) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }, []);

  const handlePreview = (file: TelegramFile, orderedFiles?: TelegramFile[]) => {
    const contextFiles = (orderedFiles || displayedFiles).filter((f) => f.type !== "folder");
    const contextIndex = contextFiles.findIndex((f) => f.id === file.id);
    setViewerContextFiles(contextFiles);
    setViewerContextIndex(contextIndex);
    setViewerFile(file);
  };

  const navigatePreview = useCallback((step: 1 | -1) => {
    if (viewerContextFiles.length === 0 || !viewerFile) return;
    const currentIdx = viewerContextFiles.findIndex((f) => f.id === viewerFile.id);
    if (currentIdx === -1) return;
    const nextIndex = (currentIdx + step + viewerContextFiles.length) % viewerContextFiles.length;
    const next = viewerContextFiles[nextIndex];
    if (!next) return;
    setViewerContextIndex(nextIndex);
    setViewerFile(next);
  }, [viewerContextFiles, viewerFile]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  const handleSelectAll = useCallback(() => setSelectedIds(displayedFiles.map((f) => f.id)), [displayedFiles]);
  const handleKeyboardDelete = useCallback(() => { if (selectedIds.length > 0) handleBulkDelete(); }, [selectedIds, handleBulkDelete]);
  const handleEscape = useCallback(() => {
    setSelectedIds([]); setSearchTerm(""); setViewerFile(null);
    setMoveOpen(false); setInsightsOpen(false); setAboutOpen(false); setBackupOpen(false); setShareFile(null);
    setOpenLinkOpen(false);
  }, []);
  const handleFocusSearch = useCallback(() => {
    document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
  }, []);
  const handleEnter = useCallback(() => {
    if (selectedIds.length === 1) {
      const selected = displayedFiles.find((f) => f.id === selectedIds[0]);
      if (selected) {
        if (selected.type === "folder") setActiveFolderId(selected.id);
        else handlePreview(selected, displayedFiles);
      }
    }
  }, [selectedIds, displayedFiles, setActiveFolderId]);

  useKeyboardShortcuts({
    onSelectAll: handleSelectAll, onDelete: handleKeyboardDelete, onEscape: handleEscape,
    onSearch: handleFocusSearch, onEnter: handleEnter,
    enabled: !viewerFile && !moveOpen && !insightsOpen && !aboutOpen && !backupOpen && !shareFile && !openLinkOpen,
  });

  // ── Drag & drop between folders ────────────────────────────────────
  const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeFolderId === targetFolderId) return;
    const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");
    const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId, 10) : null);
    if (fileId) {
      try {
        const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];
        await invoke("cmd_move_files", { messageIds: idsToMove, sourceFolderId: activeFolderId, targetFolderId });
        queryClient.invalidateQueries({ queryKey: ["files", activeFolderId] });
        if (selectedIds.includes(fileId)) setSelectedIds([]);
        toast.success(`Moved ${idsToMove.length} file(s).`);
      } catch {
        toast.error("Failed to move file(s).");
      }
    }
    internalDragRef.current = null;
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    if (internalDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const currentFolderName = activeFolderId === null
    ? (isAndroidNative() ? "Mobile Vault" : "Saved Messages")
    : folders.find((f) => f.id === activeFolderId)?.name || "Folder";

  return (
    <div className="relative h-full w-full flex overflow-hidden" onClick={() => setSelectedIds([])} onDragOver={handleRootDragOver}>
      <AuroraBackground />

      {/* ── Left navigation sidebar ──────────────────────────────────── */}
      <NavSidebar
        isConnected={isConnected}
        isReconnecting={reconnecting}
        bandwidth={bandwidth}
        onSelectLibrary={() => setActiveFolderId(null)}
        onOpenInsights={() => setInsightsOpen(true)}
        onOpenBackup={() => setBackupOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        onOpenLink={() => setOpenLinkOpen(true)}
        onReconnect={handleReconnect}
        onLogout={handleLogout}
      />

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        {/* Floating quick bar */}
        <div className="px-5 pt-5 pb-2">
          <div className="glass-panel rounded-[24px] px-4 py-3 flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold select-none shrink-0">
              <span className="text-aurora-muted">Vault</span>
              <span className="text-aurora-faint">/</span>
              <span className="text-aurora-violet font-bold">{currentFolderName}</span>
            </div>

            <div className="flex-1 min-w-0 max-w-xl mx-auto relative">
              <Search className="w-4 h-4 text-aurora-muted absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="vault-search"
                placeholder="Search your vault…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-full glass-chip pl-11 pr-4 py-2.5 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60 transition-all"
              />
            </div>

            <AnimatePresence>
              {selectedIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="flex items-center gap-1.5 shrink-0 bg-gradient-to-r from-aurora-violet/15 to-aurora-sky/15 border border-aurora-lavender/40 rounded-full px-2 py-1"
                >
                  <span className="text-xs font-bold text-aurora-violet px-1.5">{selectedIds.length} selected</span>
                  <QuickAction icon={FolderInput} label="Move" onClick={() => setMoveOpen(true)} />
                  <QuickAction icon={DownloadCloud} label="Download" onClick={handleBulkDownload} />
                  <QuickAction icon={Trash2} label="Delete" danger onClick={handleBulkDelete} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-1.5 shrink-0">
              <IconButton title="Download folder" onClick={handleDownloadFolder}>
                <FolderDown className="w-4 h-4" />
              </IconButton>
              <IconButton title="Storage insights" onClick={() => setInsightsOpen(true)}>
                <BarChart3 className="w-4 h-4" />
              </IconButton>
              <IconButton
                title={viewMode === "grid" ? "Switch to list" : "Switch to grid"}
                onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
              >
                {viewMode === "grid" ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              </IconButton>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Search status */}
        {searchTerm.length > 2 && (
          <div className="px-6 pt-2">
            <p className="text-xs font-semibold text-aurora-muted">
              Results for <span className="text-aurora-violet font-bold">"{searchTerm}"</span>
            </p>
          </div>
        )}

        {/* Library */}
        <div className="flex-1 min-h-0 px-5 pb-40">
          <Library
            files={displayedFiles}
            loading={isLoading || isSearching}
            error={error as Error | null}
            viewMode={viewMode}
            selectedIds={selectedIds}
            activeFolderId={activeFolderId}
            onFileClick={handleFileClick}
            onDelete={handleDelete}
            onDownload={(id, name) => queueDownload(id, name, activeFolderId)}
            onShare={(file) => setShareFile(file)}
            onPreview={handlePreview}
            onManualUpload={handleManualUpload}
            onSelectionClear={() => setSelectedIds([])}
            onToggleSelection={handleToggleSelection}
            onDrop={handleDropOnFolder}
            onDragStart={(fileId) => { internalDragRef.current = fileId; }}
            onDragEnd={() => setTimeout(() => { internalDragRef.current = null; }, 60)}
          />
        </div>
      </div>

      {/* ── Folder details sidebar (right) ────────────────────────────── */}
      <FolderSidebar
        folders={folders}
        activeFolderId={activeFolderId}
        isSyncing={isSyncing}
        isConnected={isConnected}
        store={store}
        onSelect={setActiveFolderId}
        onDrop={handleDropOnFolder}
        onDelete={handleFolderDelete}
        onCreate={handleCreateFolder}
        onSync={handleSyncFolders}
        onSyncAll={handleSyncAll}
      />

      {/* ── Transfer dock ─────────────────────────────────────────────── */}
      <TransferDock
        uploads={uploadQueue}
        downloads={downloadQueue}
        onClearUploads={() => setUploadQueue((q) => q.filter((i) => i.status !== "success" && i.status !== "error" && i.status !== "cancelled"))}
        onClearDownloads={clearDownloads}
        onCancelUploads={cancelUploads}
        onCancelDownloads={cancelDownloads}
        onResumeUpload={resumeUpload}
        onResumeDownload={resumeDownload}
        onRemoveUpload={removeUploadItem}
        onRemoveDownload={removeDownloadItem}
      />

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moveOpen && (
          <MoveModal
            folders={folders}
            activeFolderId={activeFolderId}
            onClose={() => setMoveOpen(false)}
            onSelect={async (id) => {
              await handleBulkMove(id, () => setMoveOpen(false));
            }}
          />
        )}
        {insightsOpen && (
          <InsightsModal
            activeFolderId={activeFolderId}
            currentFolderName={currentFolderName}
            onReconnect={handleReconnect}
            onClose={() => setInsightsOpen(false)}
          />
        )}
        {backupOpen && <VaultBackupModal onClose={() => setBackupOpen(false)} />}
        {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
        {openLinkOpen && <OpenLinkModal onClose={() => setOpenLinkOpen(false)} />}
        {shareFile && <ShareModal file={shareFile} activeFolderId={activeFolderId} onClose={() => setShareFile(null)} />}
        {viewerFile && (
          <Viewer
            file={viewerFile}
            activeFolderId={activeFolderId}
            currentIndex={viewerContextIndex}
            totalItems={viewerContextFiles.length}
            onReconnect={handleReconnect}
            onClose={() => setViewerFile(null)}
            onNext={() => navigatePreview(1)}
            onPrev={() => navigatePreview(-1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Small internal pieces
   ──────────────────────────────────────────────────────────────── */

function QuickAction({
  icon: Icon, label, onClick, danger = false,
}: { icon: typeof FolderInput; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
        danger
          ? "text-aurora-rose hover:bg-aurora-rose/15"
          : "text-aurora-violet hover:bg-aurora-violet/15"
      }`}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

function MoveModal({
  folders, activeFolderId, onClose, onSelect,
}: {
  folders: Array<{ id: number; name: string }>;
  activeFolderId: number | null;
  onClose: () => void;
  onSelect: (id: number | null) => void;
}) {
  const targets = [{ id: null as number | null, name: "Saved Messages" }, ...folders].filter(
    (f) => f.id !== activeFolderId
  );
  return (
    <Modal title="Move files to…" subtitle="Choose a destination folder" onClose={onClose} maxWidth="max-w-sm" icon={FolderInput}>
      {targets.length === 0 ? (
        <EmptyState icon={FolderIcon} title="No other folders" body="Create a folder first, then move files into it." />
      ) : (
        <div className="space-y-2">
          {targets.map((folder) => (
            <button
              key={String(folder.id)}
              onClick={() => onSelect(folder.id)}
              className="w-full flex items-center gap-3 rounded-2xl glass-chip px-4 py-3 text-sm font-semibold text-aurora-ink-soft hover:text-aurora-violet hover:border-aurora-line-strong transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-aurora-violet/15 to-aurora-sky/15 flex items-center justify-center">
                <FolderIcon className="w-4 h-4 text-aurora-violet" />
              </div>
              {folder.name}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, FileText, FolderOpen, Play, Plus, Share2, Trash2,
} from "lucide-react";
import { TelegramFile } from "../types";
import { isMediaFile, isPdfFile } from "../utils";
import { EmptyState, ContextMenu } from "./primitives";
import { FileTile } from "./FileTile";
import { FileRow } from "./FileRow";

type SortField = "name" | "size" | "date";
type SortDirection = "asc" | "desc";

interface LibraryProps {
  files: TelegramFile[];
  loading: boolean;
  error: Error | null;
  viewMode: "grid" | "list";
  selectedIds: number[];
  activeFolderId: number | null;
  onFileClick: (e: React.MouseEvent, id: number) => void;
  onDelete: (id: number) => void;
  onDownload: (id: number, name: string) => void;
  onShare: (file: TelegramFile) => void;
  onPreview: (file: TelegramFile, orderedFiles?: TelegramFile[]) => void;
  onManualUpload: () => void;
  onSelectionClear: () => void;
  onToggleSelection: (id: number) => void;
  onDrop?: (e: React.DragEvent, folderId: number) => void;
  onDragStart?: (fileId: number) => void;
  onDragEnd?: () => void;
}

function useGridColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(4);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    if (!ref.current) return;
    const update = () => {
      const w = ref.current?.clientWidth || 800;
      setWidth(w);
      if (w < 640) setColumns(2);
      else if (w < 820) setColumns(3);
      else if (w < 1024) setColumns(4);
      else if (w < 1280) setColumns(5);
      else setColumns(6);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return { columns, width };
}

export function Library({
  files, loading, error, viewMode, selectedIds, activeFolderId,
  onFileClick, onDelete, onDownload, onShare, onPreview, onManualUpload, onSelectionClear,
  onToggleSelection, onDrop, onDragStart, onDragEnd,
}: LibraryProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: TelegramFile } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const { columns, width } = useGridColumns(parentRef);

  const GAP = 14;
  const cardWidth = (width - GAP * (columns - 1)) / columns;
  const cardHeight = cardWidth * 0.72;
  const rowHeight = Math.max(cardHeight + GAP, 150);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "size") cmp = (a.size || 0) - (b.size || 0);
      else cmp = (a.created_at || "").localeCompare(b.created_at || "");
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [files, sortField, sortDirection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: TelegramFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const handlePreviewRequest = useCallback((file: TelegramFile) => {
    onPreview(file, sortedFiles);
  }, [onPreview, sortedFiles]);

  const gridRows = useMemo(() => {
    const rows: (TelegramFile | "upload")[][] = [];
    const items: (TelegramFile | "upload")[] = activeFolderId === null ? [...sortedFiles, "upload"] : [...sortedFiles];
    for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
    return rows;
  }, [sortedFiles, columns, activeFolderId]);

  const listItems = useMemo(
    () => (activeFolderId === null ? [...sortedFiles, "upload" as const] : sortedFiles),
    [sortedFiles, activeFolderId]
  );

  const gridVirtualizer = useVirtualizer({
    count: gridRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan: 2,
    gap: GAP,
  });

  const listVirtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  useEffect(() => { gridVirtualizer.measure(); }, [rowHeight, gridVirtualizer]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3 h-3 text-aurora-violet" />
      : <ArrowDown className="w-3 h-3 text-aurora-violet" />;
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5">
        <div className="w-10 h-10 rounded-full border-[3px] border-aurora-lavender border-t-transparent animate-spin" />
        <p className="text-xs font-medium text-aurora-muted">Gathering your vault…</p>
      </div>
    );
  }

  if (error) {
    return <div className="h-full flex items-center justify-center text-sm text-aurora-rose">Failed to load files</div>;
  }

  if (files.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <EmptyState
          icon={Plus}
          title="This folder is empty"
          body="Drop files in from your device and they will be encrypted here, piece by piece."
          actionLabel="Upload files"
          onAction={onManualUpload}
        />
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto custom-scrollbar pb-6"
      onClick={(e) => { if (e.target === e.currentTarget) onSelectionClear(); }}
    >
      {viewMode === "grid" ? (
        <>
          {/* Sort bar */}
          <div className="flex items-center gap-2 mb-4 sticky top-0 z-10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-aurora-faint mr-1">Sort</span>
            {(["name", "size", "date"] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  sortField === field
                    ? "bg-gradient-to-r from-aurora-violet/20 to-aurora-lavender/15 text-aurora-violet border border-aurora-lavender/40"
                    : "text-aurora-muted hover:text-aurora-ink hover:bg-white/60 dark:hover:bg-white/5"
                }`}
              >
                {field === "name" ? "Name" : field === "size" ? "Size" : "Date"} <SortIcon field={field} />
              </button>
            ))}
          </div>

          <div className="relative w-full" style={{ height: `${gridVirtualizer.getTotalSize()}px` }}>
            {gridVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = gridRows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 w-full grid"
                  style={{
                    height: `${cardHeight}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: `${GAP}px`,
                  }}
                >
                  {row.map((item) => {
                    if (item === "upload") {
                      return (
                        <button
                          key="upload"
                          onClick={(e) => { e.stopPropagation(); onManualUpload(); }}
                          className="rounded-[22px] border-2 border-dashed border-aurora-line-strong text-aurora-muted hover:border-aurora-lavender hover:text-aurora-violet hover:bg-aurora-lavender/10 transition-all group"
                          style={{ height: `${cardHeight}px` }}
                        >
                          <Plus className="w-9 h-9 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold">Upload file</span>
                        </button>
                      );
                    }
                    const file = item;
                    return (
                      <FileTile
                        key={file.id}
                        file={file}
                        isSelected={selectedIds.includes(file.id)}
                        height={cardHeight}
                        activeFolderId={activeFolderId}
                        onClick={(e) => onFileClick(e, file.id)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        onDelete={() => onDelete(file.id)}
                        onDownload={() => onDownload(file.id, file.name)}
                        onShare={() => onShare(file)}
                        onPreview={() => handlePreviewRequest(file)}
                        onToggleSelection={() => onToggleSelection(file.id)}
                        onDrop={onDrop}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col w-full">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_2fr_6rem_9rem] gap-4 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-aurora-faint border-b border-aurora-line/60 mb-1.5 select-none items-center">
            <div className="text-center">#</div>
            <button onClick={() => toggleSort("name")} className={`flex items-center gap-1.5 text-left hover:text-aurora-ink transition-colors ${sortField === "name" ? "text-aurora-violet" : ""}`}>Name <SortIcon field="name" /></button>
            <button onClick={() => toggleSort("size")} className={`flex items-center gap-1.5 justify-end hover:text-aurora-ink transition-colors ${sortField === "size" ? "text-aurora-violet" : ""}`}>Size <SortIcon field="size" /></button>
            <button onClick={() => toggleSort("date")} className={`flex items-center gap-1.5 justify-end hover:text-aurora-ink transition-colors ${sortField === "date" ? "text-aurora-violet" : ""}`}>Date <SortIcon field="date" /></button>
          </div>

          <div className="relative w-full" style={{ height: `${listVirtualizer.getTotalSize()}px` }}>
            {listVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = listItems[virtualItem.index];
              return (
                <div key={item === "upload" ? "upload" : item.id} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${virtualItem.start}px)` }}>
                  {item === "upload" ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onManualUpload(); }}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl border-2 border-dashed border-aurora-line-strong text-aurora-muted hover:text-aurora-violet hover:border-aurora-lavender transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-xs font-bold">Upload file…</span>
                    </button>
                  ) : (
                    <FileRow
                      file={item}
                      selected={selectedIds.includes(item.id)}
                      onFileClick={onFileClick}
                      onContextMenu={handleContextMenu}
                      onPreview={handlePreviewRequest}
                      onShare={onShare}
                      onDownload={onDownload}
                      onDelete={onDelete}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onDrop={onDrop}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
          items={[
            {
              icon: contextMenu.file.type === "folder" ? FolderOpen : (isMediaFile(contextMenu.file.name) ? Play : isPdfFile(contextMenu.file.name) ? FileText : Eye),
              label: contextMenu.file.type === "folder" ? "Open folder" : isMediaFile(contextMenu.file.name) ? "Play media" : isPdfFile(contextMenu.file.name) ? "View PDF" : "Quick preview",
              onClick: () => {
                if (contextMenu.file.type === "folder") onFileClick({ preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent, contextMenu.file.id);
                else handlePreviewRequest(contextMenu.file);
              },
            },
            { icon: Download, label: "Download", onClick: () => onDownload(contextMenu.file.id, contextMenu.file.name) },
            ...(contextMenu.file.type !== "folder" ? [{ icon: Share2, label: "Share link", onClick: () => onShare(contextMenu.file) }] : []),
            { icon: Trash2, label: "Delete permanently", tone: "danger" as const, onClick: () => onDelete(contextMenu.file.id) },
          ]}
        />
      )}
    </div>
  );
}

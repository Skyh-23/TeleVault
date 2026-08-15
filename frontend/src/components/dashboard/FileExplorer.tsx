import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu } from "./ContextMenu";
import { EmptyState } from "./EmptyState";
import { FileCard } from "./FileCard";
import { FileListItem } from "./FileListItem";
import { TelegramFile } from "../../types";

type SortField = "name" | "size" | "date";
type SortDirection = "asc" | "desc";

interface FileExplorerProps {
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

type GridItem = TelegramFile | "upload";

const GRID_GAP = 6;
const MIN_ROW_HEIGHT = 150;
const LIST_ROW_HEIGHT = 48;

function useResponsiveColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(4);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || 800;
      setWidth(w);
      if (w < 640) setColumns(2);
      else if (w < 768) setColumns(3);
      else if (w < 1024) setColumns(4);
      else if (w < 1280) setColumns(5);
      else setColumns(6);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return { columns, width };
}

function compareFiles(a: TelegramFile, b: TelegramFile, field: SortField): number {
  switch (field) {
    case "size":
      return (a.size || 0) - (b.size || 0);
    case "date":
      return (a.created_at || "").localeCompare(b.created_at || "");
    default:
      return a.name.localeCompare(b.name);
  }
}

function SortToggle({ field, active, direction, onToggle }: {
  field: SortField;
  active: boolean;
  direction: SortDirection;
  onToggle: (field: SortField) => void;
}) {
  const icon = !active ? (
    <ArrowUpDown className="w-3 h-3 opacity-30" />
  ) : direction === "asc" ? (
    <ArrowUp className="w-3 h-3 text-indigo-400" />
  ) : (
    <ArrowDown className="w-3 h-3 text-indigo-400" />
  );

  const label = field.charAt(0).toUpperCase() + field.slice(1);

  return (
    <button
      onClick={() => onToggle(field)}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
        active
          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
          : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
      }`}
    >
      {label} {icon}
    </button>
  );
}

function UploadTile({ height, onUpload }: { height: number; onUpload: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onUpload();
      }}
      className="border-2 border-dashed border-white/10 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:border-indigo-500/50 hover:text-indigo-400 transition-all group"
      style={{ height: `${height}px` }}
    >
      <Plus className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
      <span className="text-xs font-semibold">Upload file</span>
    </button>
  );
}

export function FileExplorer({
  files,
  loading,
  error,
  viewMode,
  selectedIds,
  activeFolderId,
  onFileClick,
  onDelete,
  onDownload,
  onShare,
  onPreview,
  onManualUpload,
  onSelectionClear,
  onToggleSelection,
  onDrop,
  onDragStart,
  onDragEnd,
}: FileExplorerProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [menu, setMenu] = useState<{ x: number; y: number; file: TelegramFile } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { columns, width: containerWidth } = useResponsiveColumns(scrollRef);

  const cardWidth = (containerWidth - GRID_GAP * (columns - 1)) / columns;
  const cardHeight = cardWidth * 0.75;
  const gridRowHeight = Math.max(cardHeight + GRID_GAP, MIN_ROW_HEIGHT);

  const openContextMenu = useCallback((e: React.MouseEvent, file: TelegramFile) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const sorted = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      const result = compareFiles(a, b, sortField);
      return sortDirection === "asc" ? result : -result;
    });
    return copy;
  }, [files, sortField, sortDirection]);

  const requestPreview = useCallback(
    (file: TelegramFile) => onPreview(file, sorted),
    [onPreview, sorted]
  );

  const changeSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const gridRows = useMemo(() => {
    const rows: GridItem[][] = [];
    const entries: GridItem[] = [...sorted, "upload"];
    for (let i = 0; i < entries.length; i += columns) {
      rows.push(entries.slice(i, i + columns));
    }
    return rows;
  }, [sorted, columns]);

  const listEntries = useMemo(
    () => (activeFolderId === null ? [...sorted, "upload" as const] : sorted),
    [sorted, activeFolderId]
  );

  const gridVirtualizer = useVirtualizer({
    count: gridRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(() => gridRowHeight, [gridRowHeight]),
    overscan: 2,
    gap: GRID_GAP,
  });

  useEffect(() => {
    gridVirtualizer.measure();
  }, [gridRowHeight, gridVirtualizer]);

  const listVirtualizer = useVirtualizer({
    count: listEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ROW_HEIGHT,
    overscan: 5,
  });

  if (loading) {
    return (
      <div className="flex-1 p-6 flex justify-center items-center flex-col gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading vault contents...</p>
      </div>
    );
  }

  if (error) {
    return <div className="flex-1 p-6 flex justify-center items-center text-red-400">Error loading files</div>;
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 p-6 overflow-auto">
        <EmptyState onUpload={onManualUpload} />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 p-6 overflow-auto custom-scrollbar"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectionClear();
      }}
    >
      {viewMode === "grid" ? (
        <>
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Sort</span>
            <SortToggle field="name" active={sortField === "name"} direction={sortDirection} onToggle={changeSort} />
            <SortToggle field="size" active={sortField === "size"} direction={sortDirection} onToggle={changeSort} />
            <SortToggle field="date" active={sortField === "date"} direction={sortDirection} onToggle={changeSort} />
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
                    gap: `${GRID_GAP}px`,
                  }}
                >
                  {row.map((item) => {
                    if (item === "upload") {
                      return <UploadTile key="upload" height={cardHeight} onUpload={onManualUpload} />;
                    }
                    return (
                      <FileCard
                        key={item.id}
                        file={item}
                        isSelected={selectedIds.includes(item.id)}
                        onClick={(e) => onFileClick(e, item.id)}
                        onContextMenu={(e) => openContextMenu(e, item)}
                        onDelete={() => onDelete(item.id)}
                        onDownload={() => onDownload(item.id, item.name)}
                        onShare={() => onShare(item)}
                        onPreview={() => requestPreview(item)}
                        onDrop={onDrop}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        activeFolderId={activeFolderId}
                        height={cardHeight}
                        onToggleSelection={() => onToggleSelection(item.id)}
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
          <div className="grid grid-cols-[2.5rem_2fr_6rem_8rem] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 dark:border-slate-800/80 mb-2 select-none items-center">
            <div className="text-center">#</div>
            <button
              onClick={() => changeSort("name")}
              className={`flex items-center gap-1 hover:text-slate-300 transition-colors ${sortField === "name" ? "text-indigo-400" : ""}`}
            >
              Name <SortToggle field="name" active={sortField === "name"} direction={sortDirection} onToggle={changeSort} />
            </button>
            <button
              onClick={() => changeSort("size")}
              className={`flex items-center gap-1 justify-end hover:text-slate-300 transition-colors ${sortField === "size" ? "text-indigo-400" : ""}`}
            >
              Size <SortToggle field="size" active={sortField === "size"} direction={sortDirection} onToggle={changeSort} />
            </button>
            <button
              onClick={() => changeSort("date")}
              className={`flex items-center gap-1 justify-end hover:text-slate-300 transition-colors ${sortField === "date" ? "text-indigo-400" : ""}`}
            >
              Date <SortToggle field="date" active={sortField === "date"} direction={sortDirection} onToggle={changeSort} />
            </button>
          </div>

          <div className="relative w-full" style={{ height: `${listVirtualizer.getTotalSize()}px` }}>
            {listVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = listEntries[virtualItem.index];
              if (item === "upload") {
                return (
                  <div
                    key="upload"
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onManualUpload();
                      }}
                      className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer border border-dashed border-white/10 dark:border-slate-800 text-slate-500 hover:text-indigo-400 hover:border-indigo-500/40 w-full transition-all"
                    >
                      <div className="w-5 h-5 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold">Upload file...</span>
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <FileListItem
                    file={item}
                    selectedIds={selectedIds}
                    onFileClick={onFileClick}
                    handleContextMenu={openContextMenu}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDrop={onDrop}
                    onPreview={requestPreview}
                    onShare={onShare}
                    onDownload={onDownload}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          file={menu.file}
          onClose={() => setMenu(null)}
          onDownload={() => {
            onDownload(menu.file.id, menu.file.name);
            setMenu(null);
          }}
          onShare={() => {
            onShare(menu.file);
            setMenu(null);
          }}
          onDelete={() => {
            onDelete(menu.file.id);
            setMenu(null);
          }}
          onPreview={() => {
            if (menu.file.type === "folder") {
              onFileClick(
                { preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent,
                menu.file.id
              );
            } else {
              requestPreview(menu.file);
            }
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

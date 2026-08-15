import {
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
  FileType,
} from "lucide-react";

type IconComponent = typeof File;

interface TypeStyle {
  icon: IconComponent;
  color: string;
  bg: string;
}

interface TypeCategory {
  extensions: string[];
  style: TypeStyle;
}

const TYPE_CATEGORIES: TypeCategory[] = [
  {
    extensions: ["jpg", "jpeg", "png", "webp", "bmp", "heic", "gif"],
    style: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  },
  {
    extensions: ["svg"],
    style: { icon: FileImage, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  },
  {
    extensions: ["mp4", "mov", "webm", "avi"],
    style: { icon: FileVideo, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  },
  {
    extensions: ["mkv"],
    style: { icon: FileVideo, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  },
  {
    extensions: ["mp3", "flac", "ogg"],
    style: { icon: FileAudio, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  },
  {
    extensions: ["wav"],
    style: { icon: FileAudio, color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/20" },
  },
  {
    extensions: ["aac"],
    style: { icon: FileAudio, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  },
  {
    extensions: ["doc", "docx"],
    style: { icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  },
  {
    extensions: ["txt", "rtf"],
    style: { icon: FileText, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
  },
  {
    extensions: ["md"],
    style: { icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  },
  {
    extensions: ["pdf"],
    style: { icon: FileType, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  },
  {
    extensions: ["xls", "xlsx", "csv"],
    style: { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  },
  {
    extensions: ["ppt", "pptx", "key"],
    style: { icon: Presentation, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  },
  {
    extensions: ["zip", "rar", "7z", "tar", "gz"],
    style: { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  },
  {
    extensions: ["js", "jsx", "ts", "tsx", "py", "rs", "go", "java", "html", "css", "json"],
    style: { icon: FileCode, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  },
];

const FALLBACK_STYLE: TypeStyle = {
  icon: File,
  color: "text-indigo-400",
  bg: "bg-indigo-500/10 border-indigo-500/20",
};

export function getFileTypeInfo(filename: string): TypeStyle {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  for (const group of TYPE_CATEGORIES) {
    if (group.extensions.includes(ext)) {
      return group.style;
    }
  }
  return FALLBACK_STYLE;
}

interface FileTypeIconProps {
  filename: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const ICON_SIZES: Record<NonNullable<FileTypeIconProps["size"]>, string> = {
  sm: "w-4 h-4",
  md: "w-9 h-9",
  lg: "w-11 h-11",
};

export function FileTypeIcon({ filename, className, size = "md" }: FileTypeIconProps) {
  const { icon: Icon, color } = getFileTypeInfo(filename);
  const iconClass = className ?? ICON_SIZES[size];
  return (
    <Icon
      className={`${iconClass} ${color} pointer-events-none select-none transition-transform duration-200 hover:scale-105`}
    />
  );
}

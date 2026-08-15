import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
} from "lucide-react";

const extensionMap: Record<string, { icon: typeof File; color: string; bg: string }> = {
  jpg: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  jpeg: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  png: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  gif: { icon: FileImage, color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
  webp: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  svg: { icon: FileImage, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  bmp: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  heic: { icon: FileImage, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  mp4: { icon: FileVideo, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  mov: { icon: FileVideo, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  avi: { icon: FileVideo, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  mkv: { icon: FileVideo, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  webm: { icon: FileVideo, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  mp3: { icon: FileAudio, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  wav: { icon: FileAudio, color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/20" },
  flac: { icon: FileAudio, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  aac: { icon: FileAudio, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  ogg: { icon: FileAudio, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  pdf: { icon: FileType, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  doc: { icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  docx: { icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  txt: { icon: FileText, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
  rtf: { icon: FileText, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
  md: { icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  xls: { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  xlsx: { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  csv: { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  ppt: { icon: Presentation, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  pptx: { icon: Presentation, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  key: { icon: Presentation, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  zip: { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  rar: { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  "7z": { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  tar: { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  gz: { icon: FileArchive, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  js: { icon: FileCode, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  ts: { icon: FileCode, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  jsx: { icon: FileCode, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  tsx: { icon: FileCode, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  py: { icon: FileCode, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  rs: { icon: FileCode, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  go: { icon: FileCode, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  java: { icon: FileCode, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  html: { icon: FileCode, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  css: { icon: FileCode, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  json: { icon: FileCode, color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20" },
};

export function getFileTypeInfo(filename: string): { icon: typeof File; color: string; bg: string } {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return extensionMap[ext] || { icon: File, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" };
}

interface FileTypeIconProps {
  filename: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

export function FileTypeIcon({ filename, className, size = "md" }: FileTypeIconProps) {
  const { icon: Icon, color } = getFileTypeInfo(filename);
  const sizeClass = className ?? sizeMap[size];
  return <Icon className={`${sizeClass} ${color} pointer-events-none select-none transition-transform duration-200 hover:scale-105`} />;
}
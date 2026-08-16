import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { BarChart3, CloudSun, Info, Link2, LogOut, RefreshCw, Shield } from "lucide-react";
import { BandwidthStats } from "../types";
import { formatBytes } from "../utils";
import { StatusDot } from "./primitives";

interface NavSidebarProps {
  isConnected: boolean;
  isReconnecting: boolean;
  bandwidth?: BandwidthStats;
  onSelectLibrary: () => void;
  onOpenInsights: () => void;
  onOpenBackup: () => void;
  onOpenAbout: () => void;
  onOpenLink: () => void;
  onReconnect: () => void;
  onLogout: () => void;
}

export function NavSidebar({
  isConnected,
  isReconnecting,
  bandwidth,
  onSelectLibrary,
  onOpenInsights,
  onOpenBackup,
  onOpenAbout,
  onOpenLink,
  onReconnect,
  onLogout,
}: NavSidebarProps) {
  return (
    <aside className="relative z-20 flex h-full w-[236px] shrink-0 flex-col overflow-hidden rounded-r-[28px] border-y-0 border-l-0 glass-panel">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-tr from-aurora-violet to-aurora-sky p-[2px] shadow-lavender">
          <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white/85 dark:bg-aurora-surface">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="h-6 w-6" />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="leading-none text-sm font-extrabold tracking-tight text-aurora-ink">TeleVault</h1>
          <p className="mt-1 text-[10px] font-semibold text-aurora-muted">Encrypted cloud drive</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div
          className={`rounded-3xl border p-3.5 transition-colors ${
            isConnected
              ? "border-emerald-300/50 bg-gradient-to-tr from-aurora-mint/15 to-emerald-400/10"
              : "border-aurora-rose/30 bg-gradient-to-tr from-aurora-rose/10 to-pink-400/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <StatusDot online={isConnected} pulse />
            <span className={`text-xs font-bold ${isConnected ? "text-emerald-600" : "text-aurora-rose"}`}>
              {isReconnecting ? "Reconnecting..." : isConnected ? "Connected" : "Offline"}
            </span>
          </div>
          {!isConnected && !isReconnecting && (
            <button
              onClick={onReconnect}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-aurora-rose py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <RefreshCw className="h-3 w-3" /> Reconnect
            </button>
          )}
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 pb-2">
        <p className="px-3 pb-2 pt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-aurora-faint">Menu</p>
        <NavButton icon={<CloudSun className="h-4 w-4" />} label="Library" hint="Your files" active={true} onClick={onSelectLibrary} />
        <NavButton icon={<BarChart3 className="h-4 w-4" />} label="Insights" hint="Storage analytics" active={false} onClick={onOpenInsights} />
        <NavButton icon={<Link2 className="h-4 w-4" />} label="Open link" hint="Receive a shared file" active={false} onClick={onOpenLink} />
        <NavButton icon={<Shield className="h-4 w-4" />} label="Backup vault" hint="Export recovery file" active={false} onClick={onOpenBackup} />
        <NavButton icon={<Info className="h-4 w-4" />} label="About" hint="Version and help" active={false} onClick={onOpenAbout} />

        {bandwidth && (
          <div className="pt-3">
            <p className="px-3 pb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-aurora-faint">Session</p>
            <div className="mx-3 flex items-center justify-between rounded-2xl glass-chip px-3.5 py-2.5 text-[11px] font-bold">
              <span className="text-emerald-600">Up {formatBytes(bandwidth.up_bytes)}</span>
              <span className="text-aurora-faint">/</span>
              <span className="text-sky-600">Down {formatBytes(bandwidth.down_bytes)}</span>
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-aurora-line/60 px-4 pb-5 pt-2">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-aurora-muted transition-colors hover:bg-aurora-rose/10 hover:text-aurora-rose"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}

function NavButton({
  icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-200 ${
        active
          ? "border-transparent bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender"
          : "border-transparent hover:border-aurora-line/60 hover:bg-white/70 dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-white/20 text-white" : "bg-aurora-lavender/12 text-aurora-violet"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-xs font-bold ${active ? "text-white" : "text-aurora-ink"}`}>{label}</span>
        <span className={`block truncate text-[10px] font-medium ${active ? "text-white/70" : "text-aurora-faint"}`}>{hint}</span>
      </span>
    </motion.button>
  );
}

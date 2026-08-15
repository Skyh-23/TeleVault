import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { X, LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { TelegramFile } from "../types";

/* ────────────────────────────────────────────────────────────────
   Aurora Glass — shared primitives
   ──────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "soft" | "ghost" | "danger" | "sky";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender hover:brightness-105 hover:-translate-y-px",
  sky: "bg-gradient-to-r from-aurora-sky to-aurora-cyan text-white shadow-sky hover:brightness-105 hover:-translate-y-px",
  soft: "bg-white/70 border border-aurora-line text-aurora-ink-soft hover:bg-white hover:border-aurora-line-strong shadow-sm",
  ghost: "text-aurora-ink-soft hover:bg-aurora-line/40 hover:text-aurora-ink",
  danger: "bg-gradient-to-r from-aurora-rose to-aurora-peach text-white shadow-rose hover:brightness-105 hover:-translate-y-px",
};

export function GlassButton({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${buttonStyles[variant]} ${className}`}
    />
  );
}

export function IconButton({
  className = "",
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      title={title}
      className={`p-2.5 rounded-full glass-chip text-aurora-ink-soft hover:text-aurora-violet hover:scale-105 active:scale-95 transition-all duration-200 ${className}`}
    />
  );
}

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  icon?: LucideIcon;
  hint?: string;
}

export function GlassInput({ label, icon: Icon, hint, className = "", ...props }: GlassInputProps) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] font-bold uppercase tracking-wider text-aurora-muted mb-1.5">
          {label}
        </span>
      )}
      <span className="relative block group">
        {Icon && (
          <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-aurora-muted group-focus-within:text-aurora-violet transition-colors" />
        )}
        <input
          {...props}
          name={props.name ?? (typeof label === "string" ? label.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "field")}
          className={`w-full rounded-2xl glass-panel px-4 py-3 text-sm text-aurora-ink placeholder:text-aurora-faint focus:outline-none focus:ring-2 focus:ring-aurora-lavender/60 transition-all ${Icon ? "pl-11" : ""} ${className}`}
        />
      </span>
      {hint && <span className="block mt-1.5 text-[11px] text-aurora-muted">{hint}</span>}
    </label>
  );
}

export function Chip({
  active = false,
  className = "",
  icon: Icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: LucideIcon }) {
  return (
    <button
      {...props}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
        active
          ? "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender"
          : "glass-chip text-aurora-ink-soft hover:text-aurora-ink hover:border-aurora-line-strong"
      } ${className}`}
    >
      {Icon && <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-aurora-lavender"}`} />}
      {children}
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-xl",
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  icon?: LucideIcon;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-aurora-ink/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.section
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className={`w-full ${maxWidth} max-h-[88vh] overflow-y-auto rounded-[28px] glass-panel-strong p-6 relative`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-aurora-violet/15 to-aurora-sky/15 text-aurora-violet flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-aurora-ink tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-aurora-muted mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-aurora-muted hover:text-aurora-ink hover:bg-aurora-line/40 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

export function ProgressTrack({
  percent,
  variant = "aurora",
  className = "",
}: {
  percent?: number;
  variant?: "aurora" | "rose";
  className?: string;
}) {
  const fill = variant === "aurora" ? "progress-aurora" : "progress-rose";
  return (
    <div className={`h-1.5 rounded-full bg-aurora-line/50 overflow-hidden ${className}`}>
      {percent !== undefined ? (
        <div className={`h-full rounded-full ${fill} transition-all duration-300`} style={{ width: `${Math.min(percent, 100)}%` }} />
      ) : (
        <div className={`h-full w-1/3 rounded-full ${fill} animate-indeterminate`} />
      )}
    </div>
  );
}

export function StatusDot({ online, pulse = false }: { online: boolean; pulse?: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {online && pulse && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-aurora-mint opacity-60 animate-ping" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          online ? "bg-aurora-mint shadow-[0_0_10px_rgba(52,211,153,0.7)]" : "bg-aurora-rose shadow-[0_0_10px_rgba(244,114,182,0.7)]"
        }`}
      />
    </span>
  );
}

export function ContextMenu({
  x,
  y,
  file,
  onClose,
  items,
}: {
  x: number;
  y: number;
  file: TelegramFile;
  onClose: () => void;
  items: Array<{ icon: LucideIcon; label: string; onClick: () => void; tone?: "default" | "danger" }>;
}) {
  const style = {
    left: Math.min(x, window.innerWidth - 230),
    top: Math.min(y, window.innerHeight - 260),
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed z-[120] min-w-[210px] rounded-2xl glass-panel-strong p-1.5 flex flex-col gap-0.5"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-aurora-muted truncate max-w-[190px] border-b border-aurora-line/60 mb-1">
        {file.name}
      </div>
      {items.map(({ icon: Icon, label, onClick, tone = "default" }) => (
        <button
          key={label}
          onClick={() => {
            onClick();
            onClose();
          }}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left w-full transition-colors ${
            tone === "danger"
              ? "text-aurora-rose hover:bg-aurora-rose/10"
              : "text-aurora-ink-soft hover:bg-aurora-lavender/10 hover:text-aurora-violet"
          }`}
        >
          <Icon className={`w-3.5 h-3.5 ${tone === "danger" ? "text-aurora-rose" : "text-aurora-lavender"}`} />
          {label}
        </button>
      ))}
    </motion.div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon: Icon,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="w-24 h-24 rounded-[32px] glass-panel flex items-center justify-center text-aurora-violet mb-7 animate-float-soft"
      >
        <Icon className="w-10 h-10" />
      </motion.div>
      <h3 className="text-lg font-bold text-aurora-ink mb-2">{title}</h3>
      <p className="text-sm text-aurora-muted mb-7 max-w-xs leading-relaxed">{body}</p>
      {actionLabel && onAction && (
        <GlassButton onClick={onAction}>
          <span className="text-white/90">{actionLabel}</span>
        </GlassButton>
      )}
    </div>
  );
}

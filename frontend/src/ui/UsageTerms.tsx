import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, CheckCircle2, FlaskConical, GraduationCap, HeartHandshake,
  Lightbulb, Lock, Scale, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { AuroraBackground } from "./AuroraBackground";
import { ThemeToggle } from "./ThemeToggle";
import { GlassButton } from "./primitives";

const USAGE_SECTIONS = [
  {
    icon: Sparkles,
    title: "What TeleVault is",
    body:
      "TeleVault is a free, open, client-side encrypted drive that lets you keep files inside the storage of your own Telegram account. It is designed to be simple, transparent, and privacy-first — no servers to pay for, no middlemen, no data collectors.",
  },
  {
    icon: Lock,
    title: "Privacy by design",
    body:
      "Files are encrypted locally with AES-256-GCM before they ever leave your device. Your master key, API keys, and recovery password never leave your machine. TeleVault cannot read your files — even in principle.",
  },
  {
    icon: ShieldCheck,
    title: "Zero-knowledge architecture",
    body:
      "TeleVault operates as a thin, auditable client. There is no TeleVault server storing your content, no account system to compromise, and no tracking of what you store. The code is open for anyone to inspect.",
  },
  {
    icon: GraduationCap,
    title: "For education & research",
    body:
      "This project is intended for educational and research purposes — to demonstrate and study client-side encryption, key derivation (Argon2id), authenticated ciphers (AES-256-GCM), chunked transfers, and zero-knowledge storage architectures. It is a learning tool, not a commercial service.",
  },
  {
    icon: FlaskConical,
    title: "Use it to learn",
    body:
      "Use TeleVault to explore how modern cryptography protects data at rest, how manifests keep large vaults organized, and how peer-to-peer style transfers can be built on top of a personal account. Curiosity is welcome — abuse is not.",
  },
  {
    icon: BookOpen,
    title: "Respect third-party terms",
    body:
      "Because TeleVault runs on Telegram's API, your usage must also respect Telegram's Terms of Service and API rules. High-volume, abusive, or automated misuse of any underlying service is your responsibility and not encouraged.",
  },
  {
    icon: Scale,
    title: "Personal & lawful use only",
    body:
      "You agree to use TeleVault only for personal, educational, or research purposes, and only for lawful content. Do not use it to store, share, or distribute anything illegal, infringing, malicious, or harmful. You alone are responsible for the content you store.",
  },
  {
    icon: HeartHandshake,
    title: "An honest disclaimer",
    body:
      "TeleVault is provided with good intentions but comes with no guarantees. Features may change, and the project may evolve or be discontinued at any time. Nothing here should be treated as legal, financial, or security advice.",
  },
];

export function UsageTerms({
  onBack,
  onClose,
  standalone = false,
}: {
  onBack: () => void;
  onClose: () => void;
  /** "standalone" renders as a full page (first-run), otherwise an overlay. */
  standalone?: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-y-auto">
      <AuroraBackground />
      <div className="relative z-10 min-h-full flex items-center justify-center p-4 sm:p-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-3xl rounded-[32px] glass-panel-strong p-6 sm:p-8 shadow-2xl"
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-aurora-violet to-aurora-sky p-[2px] shadow-lavender shrink-0">
                <div className="w-full h-full rounded-[14px] bg-white/85 dark:bg-aurora-surface flex items-center justify-center">
                  <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-7 h-7" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-aurora-ink tracking-tight">Terms of Usage</h1>
                <p className="text-xs font-medium text-aurora-muted">The spirit of this project — read before agreeing.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!standalone && (
                <button
                  onClick={onClose}
                  className="p-2 rounded-full text-aurora-muted hover:text-aurora-ink hover:bg-aurora-line/40 transition-colors"
                  aria-label="Close usage terms"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-aurora-mint/40 bg-aurora-mint/10 px-4 py-3 flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-emerald-700 font-medium">
              TeleVault is an <strong>educational &amp; research project</strong> — it exists to teach privacy-first,
              zero-knowledge storage. Use it kindly, use it lawfully, and use it to learn.
            </p>
          </div>

          {/* ── Scrollable sections ────────────────────────────────── */}
          <div className="mt-4 max-h-[46vh] sm:max-h-[52vh] overflow-y-auto pr-2 space-y-3.5 terms-scroll">
            {USAGE_SECTIONS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl glass-chip p-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-aurora-mint/20 to-aurora-sky/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-aurora-ink">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-aurora-muted">{body}</p>
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-aurora-mint/30 bg-aurora-mint/10 px-4 py-3 text-[11px] leading-relaxed text-emerald-700 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                By agreeing to the Terms of Usage you confirm you understand TeleVault is a privacy and
                education-focused tool for personal, lawful use — not a commercial service and not affiliated with any
                third-party messaging platform.
              </span>
            </div>
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <GlassButton variant="sky" className="flex-1" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" /> Back to Terms &amp; Conditions
            </GlassButton>
            {!standalone && (
              <GlassButton variant="primary" className="flex-1" onClick={onClose}>
                <CheckCircle2 className="w-4 h-4" /> Got it
              </GlassButton>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

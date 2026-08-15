import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Check, FileWarning, Gavel, Info, Lock, Scale, ShieldAlert,
  ShieldCheck, UserX, X,
} from "lucide-react";
import { AuroraBackground } from "./AuroraBackground";
import { ThemeToggle } from "./ThemeToggle";
import { GlassButton } from "./primitives";
import { UsageTerms } from "./UsageTerms";

const TERMS_SECTIONS = [
  {
    icon: Info,
    title: "Independent software",
    body:
      "TeleVault is an independent, open client application. It is NOT affiliated with, endorsed by, sponsored by, or a partner of Telegram FZ-LLC, Telegram Messenger Inc., or any of their subsidiaries, and it is not an official Telegram product.",
  },
  {
    icon: ShieldAlert,
    title: "Use at your own risk",
    body:
      "TeleVault stores files inside YOUR personal Telegram account using the Telegram API. You use this software entirely at your own risk. The developers make no guarantees about availability, durability, security, or the continued operation of the underlying Telegram service.",
  },
  {
    icon: FileWarning,
    title: "No warranty - provided \"AS IS\"",
    body:
      "This software is provided \"AS IS\" and \"AS AVAILABLE\", without warranty of any kind, express or implied - including, but not limited to, the implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
  },
  {
    icon: Gavel,
    title: "Limitation of liability",
    body:
      "To the maximum extent permitted by law, the developers shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages - including loss of data, files, profits, accounts, or access - arising from the use or inability to use this software, even if advised of the possibility of such damages.",
  },
  {
    icon: UserX,
    title: "No responsibility for account actions",
    body:
      "You are solely responsible for your Telegram account, API keys, phone number, and anything done through them. The developers are not responsible if your Telegram account is limited, banned, flagged, or terminated as a result of using this software or automated access.",
  },
  {
    icon: Lock,
    title: "Data loss and backups",
    body:
      "You are responsible for backing up your recovery key and encrypted vault. If you lose your recovery password or master key, or if Telegram content is deleted, files may become permanently unrecoverable. The developers cannot recover or restore your data.",
  },
  {
    icon: Scale,
    title: "Legal and content compliance",
    body:
      "You agree to use TeleVault only for lawful purposes and to comply with Telegram's Terms of Service, the Telegram API terms, and all applicable laws. The developers are not responsible for how you use the software or for the content you store.",
  },
  {
    icon: ShieldCheck,
    title: "Third-party services",
    body:
      "TeleVault relies on third-party services you do not control - including Telegram's servers and your own internet connection. The developers are not responsible for the acts, omissions, outages, or data handling of any third party.",
  },
];

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="group flex cursor-pointer select-none items-start gap-3">
      <span
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200 ${
          checked
            ? "border-transparent bg-gradient-to-br from-aurora-violet to-aurora-sky shadow-lavender"
            : "border-aurora-line-strong bg-white/50 dark:bg-white/5 group-hover:border-aurora-violet/60"
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-xs font-semibold leading-relaxed text-aurora-ink">{label}</span>
    </label>
  );
}

export function TermsGate({
  onAccept,
  variant = "gate",
}: {
  onAccept: () => void;
  variant?: "gate" | "modal";
}) {
  const [checked, setChecked] = useState(false);
  const [checkedUsage, setCheckedUsage] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [view, setView] = useState<"terms" | "usage">("terms");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canAccept = checked && checkedUsage;

  const handleAccept = () => {
    if (!canAccept) return;
    onAccept();
  };

  const handleDecline = () => {
    setDeclined(true);
  };

  if (view === "usage") {
    return (
      <UsageTerms
        onBack={() => setView("terms")}
        onClose={variant === "modal" ? onAccept : () => setView("terms")}
        standalone={variant === "gate"}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-full items-center justify-center p-4 sm:p-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-3xl rounded-[32px] glass-panel-strong p-6 shadow-2xl sm:p-8"
        >
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-tr from-aurora-violet to-aurora-sky p-[2px] shadow-lavender">
                <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white/85 dark:bg-aurora-surface">
                  <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="h-7 w-7" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-aurora-ink">Terms &amp; Conditions</h1>
                <p className="text-xs font-medium text-aurora-muted">Please read carefully before using TeleVault.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {variant === "modal" && (
                <button
                  onClick={onAccept}
                  className="rounded-full p-2 text-aurora-muted transition-colors hover:bg-aurora-line/40 hover:text-aurora-ink"
                  aria-label="Close terms"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-aurora-rose/35 bg-aurora-rose/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <p className="text-xs font-medium leading-relaxed text-rose-600">
              This product is <strong>not affiliated with, endorsed by, or a partner of Telegram FZ-LLC</strong>.
              It is an independent tool. You use it entirely at your own risk.
            </p>
          </div>

          <div
            ref={scrollRef}
            className="terms-scroll mt-4 max-h-[42vh] space-y-3.5 overflow-y-auto pr-2 sm:max-h-[46vh]"
          >
            {TERMS_SECTIONS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl glass-chip p-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-aurora-violet/15 to-aurora-sky/15">
                  <Icon className="h-4 w-4 text-aurora-violet" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-aurora-ink">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-aurora-muted">{body}</p>
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-aurora-mint/30 bg-aurora-mint/10 px-4 py-3 text-[11px] leading-relaxed text-emerald-700">
              By accepting, you acknowledge you have read and understood all of the above and agree to be bound by
              these terms. You may stop using TeleVault at any time.
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <CheckRow
              checked={checked}
              onChange={setChecked}
              label={
                <>
                  I have read and agree to the{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="font-bold text-aurora-violet underline decoration-aurora-violet/50 underline-offset-4 transition-colors hover:text-aurora-lavender"
                  >
                    Terms &amp; Conditions
                  </button>
                  , and I understand TeleVault is not affiliated with Telegram and that I use it at my own risk.
                </>
              }
            />
            <CheckRow
              checked={checkedUsage}
              onChange={setCheckedUsage}
              label={
                <>
                  I have read and agree to the{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setView("usage");
                    }}
                    className="font-bold text-aurora-sky underline decoration-aurora-sky/60 underline-offset-4 transition-colors hover:text-aurora-cyan"
                  >
                    Terms of Usage
                  </button>{" "}
                  (educational &amp; research purposes).
                </>
              }
            />
          </div>

          {variant === "modal" ? (
            <div className="mt-6">
              <GlassButton variant="primary" className="w-full" onClick={onAccept}>
                <Check className="h-4 w-4" /> Close
              </GlassButton>
            </div>
          ) : declined ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 p-4"
            >
              <p className="text-xs font-medium leading-relaxed text-rose-600">
                You declined the Terms &amp; Conditions. TeleVault cannot be used without accepting them. If you change
                your mind, you can review and accept them below.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <GlassButton variant="sky" className="text-xs" onClick={() => setDeclined(false)}>
                  <X className="h-3.5 w-3.5" /> Back to terms
                </GlassButton>
                <GlassButton
                  variant="danger"
                  className="text-xs"
                  onClick={() => {
                    window.close();
                    setTimeout(() => setCloseBlocked(true), 150);
                  }}
                >
                  <UserX className="h-3.5 w-3.5" /> Close app
                </GlassButton>
              </div>
              {closeBlocked && (
                <p className="mt-3 text-[10px] leading-relaxed text-aurora-muted">
                  Your browser blocked auto-closing the window. Please close it manually - TeleVault will not continue
                  without your acceptance.
                </p>
              )}
            </motion.div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <GlassButton
                variant="primary"
                className="flex-1"
                disabled={!canAccept}
                onClick={handleAccept}
              >
                <ShieldCheck className="h-4 w-4" /> I Agree - Continue
              </GlassButton>
              <GlassButton variant="ghost" className="text-aurora-rose hover:text-rose-500" onClick={handleDecline}>
                Decline
              </GlassButton>
            </div>
          )}

          {variant !== "modal" && !declined && !canAccept && (
            <p className="mt-3 text-center text-[11px] text-aurora-muted">
              Tick both checkboxes above to enable the "I Agree - Continue" button.
            </p>
          )}
        </motion.section>
      </div>
    </div>
  );
}
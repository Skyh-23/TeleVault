import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, ExternalLink, HelpCircle, KeyRound, Lock, Phone,
  ShieldCheck, Sparkles, X, Feather, CloudSun, KeySquare,
} from "lucide-react";
import { invoke } from "../lib/api";
import { load } from "../lib/tauri-store";
import { open } from "../lib/tauri-extras";
import { GlassButton, GlassInput } from "./primitives";
import { AuroraBackground } from "./AuroraBackground";
import { ThemeToggle } from "./ThemeToggle";
import { AboutModal } from "./AboutModal";
import { TermsGate } from "./TermsGate";

type Step = "setup" | "phone" | "code" | "password";

const stepCopy: Record<Step, { eyebrow: string; title: string; body: string }> = {
  setup: {
    eyebrow: "Step 1 of 4 - Keys",
    title: "Pair your Telegram keys",
    body: "Your API keys stay on this device only. Nothing is ever sent to us.",
  },
  phone: {
    eyebrow: "Step 2 of 4 - Identity",
    title: "Your phone number",
    body: "The number linked to your Telegram account begins the encrypted session.",
  },
  code: {
    eyebrow: "Step 3 of 4 - Verify",
    title: "Verification code",
    body: "Enter the code that Telegram just sent you.",
  },
  password: {
    eyebrow: "Step 4 of 4 - Unlock",
    title: "Two-step password",
    body: "Your account has 2FA enabled - enter it to open the vault.",
  },
};

export function Onboarding({ onLogin, savePhone }: { onLogin: () => void; savePhone: (phone: string) => void }) {
  const [step, setStep] = useState<Step>("setup");
  const [loading, setLoading] = useState(false);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [floodWait, setFloodWait] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const current = stepCopy[step];
  const progress = useMemo(() => ["setup", "phone", "code", "password"].indexOf(step) + 1, [step]);

  useEffect(() => {
    if (!floodWait) return;
    const interval = setInterval(() => {
      setFloodWait((prev) => (prev === null || prev <= 1 ? null : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [floodWait]);

  useEffect(() => {
    const initStore = async () => {
      try {
        const store = await load("config.json");
        const savedId = await store.get<string>("api_id");
        const savedHash = await store.get<string>("api_hash");
        if (savedId && savedHash) {
          setApiId(savedId);
          setApiHash(savedHash);
        }
      } catch {
        // Optional - local config may not exist yet.
      }
    };
    initStore();
  }, []);

  const saveCredentials = async () => {
    try {
      const store = await load("config.json");
      await store.set("api_id", apiId);
      await store.set("api_hash", apiHash);
      await store.save();
    } catch {
      // Backend still receives credentials directly during auth.
    }
  };

  const handleSetupSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiId.trim() || !apiHash.trim()) return setError("API ID and API hash are required.");
    if (apiId.includes(" ") || apiHash.includes(" ")) return setError("Keys cannot contain spaces.");
    if (Number.isNaN(Number.parseInt(apiId, 10))) return setError("API ID must be a number.");
    setError(null);
    await saveCredentials();
    setStep("phone");
  };

  const handlePhoneSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const idInt = Number.parseInt(apiId, 10);
      if (Number.isNaN(idInt)) throw new Error("API ID must be a number.");
      await invoke("cmd_auth_request_code", { phone, apiId: idInt, apiHash });
      setStep("code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      if (msg.includes("FLOOD_WAIT_")) {
        const seconds = Number.parseInt(msg.split("FLOOD_WAIT_")[1] || "", 10);
        if (!Number.isNaN(seconds)) {
          setFloodWait(seconds);
          return;
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_sign_in", { code });
      if (res.success) {
        savePhone(phone);
        onLogin();
      } else if (res.next_step === "password") {
        setStep("password");
      } else {
        setError("Telegram did not accept the code.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<{ success: boolean }>("cmd_auth_check_password", { password });
      if (!res.success) {
        setError("Password verification failed.");
        return;
      }
      savePhone(phone);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <AuroraBackground />
      <div className="relative z-10 flex min-h-full items-center justify-center p-5">
        <div className="grid w-full max-w-4xl items-stretch gap-6 lg:grid-cols-[1.05fr_400px]">
          <section className="relative hidden flex-col justify-between overflow-hidden rounded-[36px] glass-panel-strong p-9 lg:flex">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-aurora-lavender/25 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-aurora-sky/25 blur-3xl" />

            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-aurora-violet to-aurora-sky p-[2px] shadow-lavender">
                  <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white/85">
                    <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="h-7 w-7" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-aurora-ink">TeleVault</h1>
                  <p className="text-xs font-medium text-aurora-muted">Version 1.6</p>
                </div>
              </div>

              <div className="mt-12">
                <div className="inline-flex items-center gap-2 rounded-full border border-aurora-mint/40 bg-aurora-mint/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  AES-256-GCM - Zero-knowledge
                </div>
                <h2 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-aurora-ink">
                  Your files, <span className="text-aurora-gradient">wrapped in light.</span>
                </h2>
                <p className="mt-5 text-sm leading-relaxed text-aurora-ink-soft">
                  An encrypted drive inside your own Telegram account - private by default, with your keys staying on your device.
                </p>
              </div>
            </div>

            <div className="relative z-10 mt-12 grid grid-cols-3 gap-3">
              <Feature icon={Lock} title="Local keys" desc="Master key never leaves your device." />
              <Feature icon={CloudSun} title="Zero middlemen" desc="No servers, no storage fees." />
              <Feature icon={Sparkles} title="Fast sync" desc="Parallel chunked transfers." />
            </div>
          </section>

          <section className="relative z-10 rounded-[36px] glass-panel-strong p-7 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <span className="rounded-full border border-aurora-line bg-white/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-aurora-muted">
                {current.eyebrow}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAbout(true)}
                  className="text-xs font-semibold text-aurora-muted transition-colors hover:text-aurora-violet"
                >
                  About
                </button>
                <ThemeToggle />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold tracking-tight text-aurora-ink">{current.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-aurora-muted">{current.body}</p>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-aurora-line/50">
              <motion.div
                className="h-full rounded-full progress-aurora"
                animate={{ width: `${(progress / 4) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            <div className="mt-7">
              <AnimatePresence mode="wait">
                {floodWait ? (
                  <motion.div key="flood" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                    <div className="rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 p-4">
                      <h3 className="text-sm font-bold text-rose-600">Telegram rate limit active</h3>
                      <p className="mt-1 text-xs text-rose-500/80">Please wait for the timer before retrying.</p>
                    </div>
                    <div className="py-2 text-center font-mono text-5xl font-bold tracking-tight text-aurora-ink">
                      {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, "0")}
                    </div>
                  </motion.div>
                ) : (
                  <>
                    {step === "setup" && (
                      <StepForm key="setup" onSubmit={handleSetupSubmit}>
                        <GlassInput label="Telegram API ID" icon={KeySquare} value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="e.g. 12345678" />
                        <GlassInput label="Telegram API Hash" icon={KeyRound} value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="0123456789abcdef..." />
                        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender px-5 py-3 text-sm font-semibold text-white shadow-lavender transition-all hover:brightness-105">
                          Continue to sign in <ArrowRight className="h-4 w-4" />
                        </button>
                        <TextAction onClick={() => setShowHelp(true)} icon={HelpCircle} label="How do I get API keys?" />
                        {import.meta.env.DEV && <TextAction onClick={onLogin} label="Preview dashboard (dev mode)" />}
                      </StepForm>
                    )}

                    {step === "phone" && (
                      <StepForm key="phone" onSubmit={handlePhoneSubmit}>
                        <GlassInput label="Phone number" icon={Phone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
                        <GlassButton variant="primary" className="w-full" disabled={loading}>
                          {loading ? "Sending code..." : "Send verification code"}
                        </GlassButton>
                        <TextAction onClick={() => setStep("setup")} label="<- Back to API keys" />
                      </StepForm>
                    )}

                    {step === "code" && (
                      <StepForm key="code" onSubmit={handleCodeSubmit}>
                        <GlassInput label="Verification code" icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
                        <GlassButton variant="primary" className="w-full" disabled={loading}>
                          {loading ? "Verifying..." : "Verify and unlock"}
                        </GlassButton>
                        <TextAction onClick={() => setStep("phone")} label="<- Change phone number" />
                      </StepForm>
                    )}

                    {step === "password" && (
                      <StepForm key="password" onSubmit={handlePasswordSubmit}>
                        <GlassInput label="2FA password" type="password" icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your Telegram password" />
                        <GlassButton variant="primary" className="w-full" disabled={loading || !password}>
                          {loading ? "Unlocking..." : "Unlock vault"}
                        </GlassButton>
                        <TextAction onClick={() => setStep("code")} label="<- Back to code entry" />
                      </StepForm>
                    )}
                  </>
                )}
              </AnimatePresence>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 flex items-center justify-between rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 p-3.5 text-xs font-medium text-rose-600"
              >
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            )}

            <p className="mt-7 text-center text-[11px] leading-relaxed text-aurora-faint">
              All encryption happens locally, on your device. Not affiliated with Telegram FZ-LLC.
            </p>
            <p className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-[11px] font-semibold text-aurora-muted underline decoration-aurora-line-strong underline-offset-4 transition-colors hover:text-aurora-violet"
              >
                View Terms &amp; Conditions
              </button>
            </p>
          </section>
        </div>
      </div>

      <AnimatePresence>{showAbout && <AboutModal onClose={() => setShowAbout(false)} />}</AnimatePresence>
      <AnimatePresence>{showHelp && <ApiHelpModal onClose={() => setShowHelp(false)} />}</AnimatePresence>
      <AnimatePresence>
        {showTerms && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] overflow-y-auto"
          >
            <TermsGate variant="modal" onAccept={() => setShowTerms(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Lock; title: string; desc: string }) {
  return (
    <div className="rounded-2xl glass-chip p-3.5">
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-aurora-violet/15 to-aurora-sky/15">
        <Icon className="h-4 w-4 text-aurora-violet" />
      </div>
      <p className="text-xs font-bold text-aurora-ink">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-aurora-muted">{desc}</p>
    </div>
  );
}

function StepForm({ children, onSubmit }: { children: ReactNode; onSubmit: (event: FormEvent) => void }) {
  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onSubmit={onSubmit}
      className="space-y-4"
    >
      {children}
    </motion.form>
  );
}

function TextAction({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: typeof HelpCircle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-aurora-muted transition-colors hover:bg-aurora-lavender/10 hover:text-aurora-violet"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function ApiHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-aurora-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.section
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="w-full max-w-md rounded-[28px] glass-panel-strong p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-aurora-violet/15 to-aurora-sky/15">
              <Feather className="h-5 w-5 text-aurora-violet" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-aurora-ink">Getting API keys</h2>
              <p className="mt-0.5 text-xs text-aurora-muted">Two keys unlock the bridge to your account.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-aurora-muted hover:bg-aurora-line/40 hover:text-aurora-ink"><X className="h-5 w-5" /></button>
        </div>

        <ol className="mt-5 space-y-3 text-xs text-aurora-ink-soft">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-violet/15 font-bold text-aurora-violet">1</span>
            <span>Visit <strong className="text-aurora-ink">my.telegram.org</strong> and enter your phone number.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-sky/15 font-bold text-aurora-sky">2</span>
            <span>Open <strong className="text-aurora-ink">API development tools</strong>.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aurora-mint/20 font-bold text-emerald-600">3</span>
            <span>Create an app to receive your <strong className="text-aurora-ink">api_id</strong> and <strong className="text-aurora-ink">api_hash</strong>.</span>
          </li>
        </ol>

        <GlassButton
          className="mt-6 w-full"
          onClick={() => {
            void open("https://my.telegram.org");
          }}
        >
          <ExternalLink className="h-4 w-4" /> Open my.telegram.org
        </GlassButton>
      </motion.section>
    </motion.div>
  );
}
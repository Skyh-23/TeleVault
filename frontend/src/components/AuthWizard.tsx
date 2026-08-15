import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, HelpCircle, KeyRound, Lock, Phone, ServerCog, ShieldCheck, X, Sparkles } from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-shell";
import { ThemeToggle } from "./ThemeToggle";
import { AboutTeleVaultModal } from "./AboutTeleVaultModal";

type Step = "setup" | "phone" | "code" | "password";

const stepCopy: Record<Step, { eyebrow: string; title: string; body: string }> = {
    setup: {
        eyebrow: "Step 1 of 4",
        title: "Connect Telegram API",
        body: "TeleVault connects securely using your private Telegram API credentials stored locally on your device.",
    },
    phone: {
        eyebrow: "Step 2 of 4",
        title: "Verify Phone Number",
        body: "Enter the phone number associated with your Telegram account to initialize local end-to-end vault session.",
    },
    code: {
        eyebrow: "Step 3 of 4",
        title: "Security Verification Code",
        body: "Enter the 5-digit verification code sent directly to your Telegram app.",
    },
    password: {
        eyebrow: "Step 4 of 4",
        title: "Two-Step Verification",
        body: "Your Telegram account has 2-Step Verification enabled. Enter your password to unlock the encrypted drive.",
    },
};

export function AuthWizard({ onLogin, savePhone }: { onLogin: () => void; savePhone: (phone: string) => void }) {
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

    const current = stepCopy[step];
    const progress = useMemo(() => ["setup", "phone", "code", "password"].indexOf(step) + 1, [step]);

    useEffect(() => {
        if (!floodWait) return;
        const interval = setInterval(() => {
            setFloodWait((prev) => {
                if (prev === null || prev <= 1) return null;
                return prev - 1;
            });
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
                // Optional local config does not exist yet.
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
            // Backend can still receive credentials directly during auth.
        }
    };

    const handleSetupSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!apiId.trim() || !apiHash.trim()) {
            setError("API ID and API hash are required.");
            return;
        }
        if (apiId.includes(" ") || apiHash.includes(" ")) {
            setError("API ID and API hash cannot contain spaces.");
            return;
        }
        if (Number.isNaN(Number.parseInt(apiId, 10))) {
            setError("API ID must be a number.");
            return;
        }
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
        } catch (err: unknown) {
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
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full auth-gradient flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_420px] gap-5 items-stretch">
                {/* Brand Hero Panel */}
                <section className="rounded-2xl border border-white/10 dark:border-slate-800 bg-slate-900/60 dark:bg-slate-900/80 p-8 sm:p-10 flex flex-col justify-between backdrop-blur-2xl shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/25 transition-all duration-700" />
                    <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/25 transition-all duration-700" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/20">
                                    <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center p-2">
                                        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-full h-full" />
                                    </div>
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                        TeleVault
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v1.0 Pro</span>
                                    </h1>
                                    <p className="text-xs text-slate-400 font-medium">Encrypted Cloud Storage</p>
                                </div>
                            </div>
                            <ThemeToggle />
                        </div>

                        <div className="mt-10 max-w-lg">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-md">
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                AES-256-GCM Zero-Knowledge Encryption
                            </div>
                            <h2 className="mt-6 text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                Unlimited Cloud. <br />
                                <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
                                    Complete Privacy.
                                </span>
                            </h2>
                            <p className="mt-4 text-sm text-slate-300 leading-relaxed font-normal">
                                TeleVault turns your Telegram account into an unlimited, zero-knowledge encrypted drive. Your files are split, encrypted locally, and stored safely in your account.
                            </p>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3.5 mt-10 relative z-10">
                        <AuthFeatureCard icon={Lock} title="Local Master Key" desc="Vault key stays 100% on your device." />
                        <AuthFeatureCard icon={ServerCog} title="Direct Bridge" desc="Zero middleman servers or storage fees." />
                        <AuthFeatureCard icon={Sparkles} title="High Speed" desc="Parallel multi-chunk uploading engine." />
                    </div>
                </section>

                {/* Form Wizard Glass Panel */}
                <section className="rounded-2xl border border-white/10 dark:border-slate-800 bg-slate-900/80 dark:bg-slate-900/90 p-7 sm:p-8 shadow-2xl backdrop-blur-2xl flex flex-col justify-between relative z-10">
                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
                                {current.eyebrow}
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowAbout(true)}
                                className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                            >
                                About App
                            </button>
                        </div>

                        <h2 className="mt-5 text-2xl font-bold text-white tracking-tight">{current.title}</h2>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">{current.body}</p>

                        <div className="mt-5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                                animate={{ width: `${(progress / 4) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>

                        <div className="mt-7">
                            <AnimatePresence mode="wait">
                                {floodWait ? (
                                    <motion.div key="flood" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                                            <h3 className="text-sm font-semibold text-red-200">Telegram Rate Limit Active</h3>
                                            <p className="mt-1 text-xs text-red-300/80">Please wait for the timer before retrying.</p>
                                        </div>
                                        <div className="text-4xl font-mono font-bold text-center text-white py-2">
                                            {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, "0")}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <>
                                        {step === "setup" && (
                                            <StepForm key="setup" onSubmit={handleSetupSubmit}>
                                                <Field label="Telegram API ID" icon={KeyRound} value={apiId} onChange={setApiId} placeholder="e.g. 12345678" mono />
                                                <Field label="Telegram API Hash" icon={KeyRound} value={apiHash} onChange={setApiHash} placeholder="e.g. 0123456789abcdef..." mono />
                                                <PrimaryButton loading={loading} label="Continue to Sign In" />
                                                <TextAction onClick={() => setShowHelp(true)} icon={HelpCircle} label="How to get API ID & Hash?" />
                                                {import.meta.env.DEV && <TextAction onClick={onLogin} label="Open Dashboard (Dev Mode)" />}
                                            </StepForm>
                                        )}

                                        {step === "phone" && (
                                            <StepForm key="phone" onSubmit={handlePhoneSubmit}>
                                                <Field label="Phone Number" icon={Phone} value={phone} onChange={setPhone} placeholder="+1 234 567 8900" />
                                                <PrimaryButton loading={loading} label="Send Verification Code" />
                                                <TextAction onClick={() => setStep("setup")} label="← Back to API Credentials" />
                                            </StepForm>
                                        )}

                                        {step === "code" && (
                                            <StepForm key="code" onSubmit={handleCodeSubmit}>
                                                <Field label="Verification Code" icon={KeyRound} value={code} onChange={setCode} placeholder="12345" mono />
                                                <PrimaryButton loading={loading} label="Verify & Sign In" />
                                                <TextAction onClick={() => setStep("phone")} label="← Change Phone Number" />
                                            </StepForm>
                                        )}

                                        {step === "password" && (
                                            <StepForm key="password" onSubmit={handlePasswordSubmit}>
                                                <Field label="2-Step Password" icon={Lock} value={password} onChange={setPassword} placeholder="Your Telegram 2FA password" type="password" />
                                                <PrimaryButton loading={loading} label="Unlock Vault" disabled={!password} />
                                                <TextAction onClick={() => setStep("code")} label="← Back to Code Entry" />
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
                                className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-200 flex items-center justify-between"
                            >
                                <span>{error}</span>
                                <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white">
                                    <X className="w-4 h-4" />
                                </button>
                            </motion.div>
                        )}
                    </div>

                    <p className="mt-6 text-[11px] text-center text-slate-500 leading-relaxed">
                        TeleVault processes all encryption locally on device. <br /> Not affiliated with Telegram FZ-LLC.
                    </p>
                </section>
            </div>

            <AnimatePresence>{showAbout && <AboutTeleVaultModal onClose={() => setShowAbout(false)} />}</AnimatePresence>
            <AnimatePresence>{showHelp && <ApiHelpModal onClose={() => setShowHelp(false)} />}</AnimatePresence>
        </div>
    );
}

function StepForm({ children, onSubmit }: { children: ReactNode; onSubmit: (event: FormEvent) => void }) {
    return (
        <motion.form
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onSubmit={onSubmit}
            className="space-y-4"
        >
            {children}
        </motion.form>
    );
}

function Field({
    label,
    icon: Icon,
    value,
    onChange,
    placeholder,
    type = "text",
    mono = false,
}: {
    label: string;
    icon: typeof KeyRound;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    type?: string;
    mono?: boolean;
}) {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</span>
            <span className="relative block">
                <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type={type}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border border-white/10 bg-slate-950/60 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all ${mono ? "font-mono text-xs" : ""}`}
                />
            </span>
        </label>
    );
}

function PrimaryButton({ label, loading, disabled }: { label: string; loading?: boolean; disabled?: boolean }) {
    return (
        <button
            type="submit"
            disabled={loading || disabled}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3 font-semibold text-sm text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99]"
        >
            {loading ? "Connecting..." : label}
            {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
    );
}

function TextAction({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: typeof HelpCircle }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
        >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </button>
    );
}

function AuthFeatureCard({ icon: Icon, title, desc }: { icon: typeof Lock; title: string; desc: string }) {
    return (
        <div className="rounded-xl border border-white/5 bg-slate-950/40 p-3.5 backdrop-blur-md">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2.5">
                <Icon className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-xs font-bold text-white">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{desc}</p>
        </div>
    );
}

function ApiHelpModal({ onClose }: { onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.section
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-white">How to Get Telegram API Key</h2>
                        <p className="mt-1 text-xs text-slate-400">Telegram API credentials allow TeleVault to communicate with Telegram servers.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <ol className="mt-4 space-y-3 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">1</span>
                        <span>Visit <strong className="text-white">my.telegram.org</strong> and enter your phone number.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">2</span>
                        <span>Click on <strong className="text-white">API development tools</strong>.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0">3</span>
                        <span>Fill in app details (App title: TeleVault) to get your <strong className="text-white">api_id</strong> & <strong className="text-white">api_hash</strong>.</span>
                    </li>
                </ol>

                <button
                    type="button"
                    onClick={() => open("https://my.telegram.org")}
                    className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
                >
                    <ExternalLink className="w-4 h-4" />
                    Open my.telegram.org
                </button>
            </motion.section>
        </motion.div>
    );
}


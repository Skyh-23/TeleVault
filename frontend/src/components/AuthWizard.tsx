import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, HelpCircle, KeyRound, Lock, Moon, Phone, ServerCog, ShieldCheck, Sun, X } from "lucide-react";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-shell";
import { useTheme } from "../context/ThemeContext";
import { AboutTeleVaultModal } from "./AboutTeleVaultModal";

type Step = "setup" | "phone" | "code" | "password";

const stepCopy: Record<Step, { eyebrow: string; title: string; body: string }> = {
    setup: {
        eyebrow: "Step 1",
        title: "Connect your Telegram API credentials",
        body: "TeleVault uses your own Telegram API ID and hash to create a private encrypted vault session on this device.",
    },
    phone: {
        eyebrow: "Step 2",
        title: "Verify your Telegram account",
        body: "Enter the phone number connected to the Telegram account you want to use for encrypted storage.",
    },
    code: {
        eyebrow: "Step 3",
        title: "Enter the login code",
        body: "Telegram sent a sign-in code to your account. TeleVault stores the resulting session locally.",
    },
    password: {
        eyebrow: "Step 4",
        title: "Unlock two-step verification",
        body: "Your Telegram account has a cloud password enabled. Enter it to finish the local session setup.",
    },
};

function AuthThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
            {theme === "dark" ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-white" />}
        </button>
    );
}

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
        <div className="h-full w-full auth-gradient flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-6xl grid lg:grid-cols-[1fr_440px] gap-4">
                <section className="min-h-[520px] rounded-lg border border-white/10 bg-black/25 p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/10 p-2">
                                    <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-full h-full" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-white/55 font-semibold">Student research build</p>
                                    <h1 className="text-2xl font-bold text-white">TeleVault</h1>
                                </div>
                            </div>
                            <AuthThemeToggle />
                        </div>

                        <div className="mt-12 max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                <ShieldCheck className="w-4 h-4" />
                                Local encryption before upload
                            </div>
                            <h2 className="mt-5 text-4xl sm:text-5xl font-bold text-white leading-tight">
                                A private vault on top of your Telegram account.
                            </h2>
                            <p className="mt-5 text-base text-white/70 leading-relaxed">
                                TeleVault encrypts files on your device, stores encrypted blocks in your Telegram account,
                                and keeps the vault key under your control.
                            </p>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3 mt-10">
                        <AuthInfo icon={Lock} title="Device key" body="The vault key stays local unless you export an encrypted recovery file." />
                        <AuthInfo icon={ServerCog} title="Direct session" body="The app connects with your own Telegram API credentials." />
                        <AuthInfo icon={KeyRound} title="Recovery aware" body="Move your vault using password-protected recovery files." />
                    </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-telegram-surface p-6 sm:p-7 shadow-2xl">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase font-semibold text-telegram-primary">{current.eyebrow} of 4</p>
                            <h2 className="mt-2 text-2xl font-bold text-telegram-text">{current.title}</h2>
                            <p className="mt-2 text-sm leading-relaxed text-telegram-subtext">{current.body}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAbout(true)}
                            className="shrink-0 rounded-lg border border-telegram-border px-3 py-2 text-xs font-semibold text-telegram-text hover:bg-telegram-hover"
                        >
                            About
                        </button>
                    </div>

                    <div className="mt-5 h-1.5 rounded-full bg-telegram-hover overflow-hidden">
                        <div className="h-full bg-telegram-primary transition-all" style={{ width: `${(progress / 4) * 100}%` }} />
                    </div>

                    <div className="mt-7">
                        <AnimatePresence mode="wait">
                            {floodWait ? (
                                <motion.div key="flood" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                                    <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4">
                                        <h3 className="text-lg font-semibold text-red-200">Telegram rate limit active</h3>
                                        <p className="mt-2 text-sm text-red-100/75">Wait before trying another login request.</p>
                                    </div>
                                    <div className="text-5xl font-mono text-telegram-text">
                                        {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, "0")}
                                    </div>
                                </motion.div>
                            ) : (
                                <>
                                    {step === "setup" && (
                                        <StepForm key="setup" onSubmit={handleSetupSubmit}>
                                            <Field label="API ID" icon={KeyRound} value={apiId} onChange={setApiId} placeholder="12345678" mono />
                                            <Field label="API Hash" icon={KeyRound} value={apiHash} onChange={setApiHash} placeholder="abcdef123456..." mono />
                                            <PrimaryButton loading={loading} label="Save and continue" />
                                            <TextAction onClick={() => setShowHelp(true)} icon={HelpCircle} label="How to get Telegram API credentials" />
                                            {import.meta.env.DEV && <TextAction onClick={onLogin} label="Open dashboard in dev mode" />}
                                        </StepForm>
                                    )}

                                    {step === "phone" && (
                                        <StepForm key="phone" onSubmit={handlePhoneSubmit}>
                                            <Field label="Phone number" icon={Phone} value={phone} onChange={setPhone} placeholder="+1 234 567 8900" />
                                            <PrimaryButton loading={loading} label="Request login code" />
                                            <TextAction onClick={() => setStep("setup")} label="Back to API credentials" />
                                        </StepForm>
                                    )}

                                    {step === "code" && (
                                        <StepForm key="code" onSubmit={handleCodeSubmit}>
                                            <Field label="Telegram code" icon={KeyRound} value={code} onChange={setCode} placeholder="12345" mono />
                                            <PrimaryButton loading={loading} label="Verify code" />
                                            <TextAction onClick={() => setStep("phone")} label="Use a different phone number" />
                                        </StepForm>
                                    )}

                                    {step === "password" && (
                                        <StepForm key="password" onSubmit={handlePasswordSubmit}>
                                            <Field label="Two-step password" icon={Lock} value={password} onChange={setPassword} placeholder="Telegram cloud password" type="password" />
                                            <PrimaryButton loading={loading} label="Unlock vault session" disabled={!password} />
                                            <TextAction onClick={() => setStep("code")} label="Back to code entry" />
                                        </StepForm>
                                    )}
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    {error && (
                        <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <p className="mt-6 text-xs leading-relaxed text-telegram-subtext">
                        TeleVault is not an official Telegram product. It is an educational student project for
                        experimenting with user-side encryption and personal storage.
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
            <span className="block text-xs font-semibold uppercase text-telegram-subtext mb-2">{label}</span>
            <span className="relative block">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-telegram-subtext" />
                <input
                    type={type}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-lg border border-telegram-border bg-telegram-bg px-10 py-3 text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:border-telegram-primary ${mono ? "font-mono" : ""}`}
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
            className="w-full rounded-lg bg-telegram-primary px-4 py-3 font-bold text-black hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {loading ? "Working..." : label}
            {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
    );
}

function TextAction({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon?: typeof HelpCircle }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text flex items-center justify-center gap-2"
        >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
        </button>
    );
}

function AuthInfo({ icon: Icon, title, body }: { icon: typeof Lock; title: string; body: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <Icon className="w-5 h-5 text-telegram-primary" />
            <p className="mt-3 text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">{body}</p>
        </div>
    );
}

function ApiHelpModal({ onClose }: { onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="w-full max-w-lg rounded-lg border border-telegram-border bg-telegram-surface p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-telegram-text">Telegram API credentials</h2>
                        <p className="mt-2 text-sm text-telegram-subtext">TeleVault needs your own API ID and hash to create a local Telegram session.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <ol className="mt-5 space-y-4 text-sm text-telegram-subtext">
                    <li><strong className="text-telegram-text">1.</strong> Open my.telegram.org and sign in.</li>
                    <li><strong className="text-telegram-text">2.</strong> Choose API development tools.</li>
                    <li><strong className="text-telegram-text">3.</strong> Create an application and copy the API ID and API hash.</li>
                    <li><strong className="text-telegram-text">4.</strong> Paste them into TeleVault. They stay on this device.</li>
                </ol>

                <button
                    type="button"
                    onClick={() => open("https://my.telegram.org")}
                    className="mt-6 w-full rounded-lg bg-telegram-primary px-4 py-3 font-bold text-black hover:brightness-110 flex items-center justify-center gap-2"
                >
                    <ExternalLink className="w-4 h-4" />
                    Open my.telegram.org
                </button>
            </motion.section>
        </motion.div>
    );
}

import { motion } from "framer-motion";
import { BookOpen, Github, ShieldCheck, Smartphone, X, Sparkles, UserCheck } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

const GITHUB_URL = "https://github.com/Skyh-23";

interface AboutTeleVaultModalProps {
    onClose: () => void;
}

export function AboutTeleVaultModal({ onClose }: AboutTeleVaultModalProps) {
    const openExternal = (url: string) => {
        void open(url);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-televault-title"
        >
            <motion.section
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 dark:border-slate-800 bg-slate-900/95 dark:bg-slate-950/95 shadow-2xl p-6 sm:p-8 backdrop-blur-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/20">
                            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center p-2">
                                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-full h-full" />
                            </div>
                        </div>
                        <div>
                            <h1 id="about-televault-title" className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                TeleVault
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v1.6 Pro</span>
                            </h1>
                            <p className="text-xs text-slate-400 font-medium">Encrypted Cloud Storage Bridge</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close About TeleVault"
                        className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="mt-5 text-xs leading-relaxed text-slate-300 font-normal">
                    TeleVault transforms your personal Telegram cloud space into a zero-knowledge encrypted drive. Files are chunked, encrypted locally with AES-256-GCM, and stored across private channels.
                </p>

                <div className="grid gap-3 mt-5 sm:grid-cols-2">
                    <InfoCard icon={ShieldCheck} title="Zero-Knowledge" description="AES-256-GCM local key master encryption." />
                    <InfoCard icon={Sparkles} title="High Speed Parallel" description="Multi-block stream file chunking." />
                    <InfoCard icon={BookOpen} title="Open Architecture" description="Transparent API schemas & manifest engine." />
                    <InfoCard icon={Smartphone} title="Cross Platform" description="Desktop Tauri app + Native Android build." />
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                        <UserCheck className="w-4 h-4 text-indigo-400" />
                        Project Credits & Development
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        Designed & Developed by <strong className="text-white">Liethueis-Foundation</strong>.
                    </p>
                </div>

                <div className="mt-5 flex gap-3">
                    <button
                        type="button"
                        onClick={() => openExternal(GITHUB_URL)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 transition-all"
                    >
                        <Github className="w-4 h-4" />
                        GitHub Repository
                    </button>
                </div>
            </motion.section>
        </motion.div>
    );
}

function InfoCard({ icon: Icon, title, description }: { icon: typeof ShieldCheck; title: string; description: string }) {
    return (
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2">
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <p className="text-xs font-bold text-white">{title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{description}</p>
        </div>
    );
}


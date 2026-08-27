import { motion } from "framer-motion";
import { BookOpen, Github, GraduationCap, ShieldCheck, Smartphone, X } from "lucide-react";
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
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-televault-title"
        >
            <motion.section
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-lg bg-telegram-bg border border-telegram-border p-2">
                                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TeleVault" className="w-full h-full" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase text-telegram-primary">Student research project</p>
                                <h1 id="about-televault-title" className="mt-1 text-2xl font-bold text-telegram-text">TeleVault</h1>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close About TeleVault"
                            className="p-2 rounded-lg text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <p className="mt-6 text-sm leading-relaxed text-telegram-subtext">
                        TeleVault is a personal encrypted vault experiment built to explore user-side file
                        encryption, Telegram account storage, recovery keys, and cross-device access. It is
                        transparent by design and intended for education, research, and personal learning.
                    </p>

                    <div className="grid gap-3 mt-6 sm:grid-cols-2">
                        <InfoCard icon={ShieldCheck} title="Security first" description="Files are encrypted locally before storage." />
                        <InfoCard icon={BookOpen} title="Transparent" description="The API, crypto flow, and build notes are documented." />
                        <InfoCard icon={GraduationCap} title="Student built" description="Created as a learning project, not a commercial service." />
                        <InfoCard icon={Smartphone} title="Android in progress" description="The native Android app is included, but still evolving." />
                    </div>

                    <div className="mt-6 rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
                        <p className="text-sm font-semibold text-amber-200">Important notice</p>
                        <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
                            TeleVault is not an official Telegram project and is not endorsed by Telegram.
                            Use it responsibly, follow Telegram's terms, and keep independent backups of
                            important files. No warranty is provided.
                        </p>
                    </div>

                    <div className="mt-6 rounded-lg border border-telegram-border bg-telegram-bg/45 p-4">
                        <p className="text-sm font-semibold text-telegram-text">Credits</p>
                        <p className="mt-2 text-sm text-telegram-subtext">Built by Hiren Sumra.</p>
                        <p className="mt-1 text-xs leading-relaxed text-telegram-subtext">
                            Inspired by Telegram Drive by caamer20. Thanks to caamer20 for the original
                            Telegram-as-a-drive idea and for permission to modify frontend/backend work.
                        </p>
                    </div>

                    <div className="grid gap-3 mt-5">\r\n                        <button\r\n                            type="button"\r\n                            onClick={() => openExternal(GITHUB_URL)}\r\n                            className="flex items-center justify-center gap-2 rounded-lg border border-telegram-border px-4 py-3 text-sm font-semibold text-telegram-text hover:bg-telegram-hover transition-colors"\r\n                        >\r\n                            <Github className="w-4 h-4" />\r\n                            GitHub\r\n                        </button>\r\n                    </div>
                </div>
            </motion.section>
        </motion.div>
    );
}

function InfoCard({ icon: Icon, title, description }: { icon: typeof ShieldCheck; title: string; description: string }) {
    return (
        <div className="rounded-lg border border-telegram-border bg-telegram-bg/35 p-4">
            <Icon className="w-5 h-5 text-telegram-primary" />
            <p className="mt-3 text-sm font-semibold text-telegram-text">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-telegram-subtext">{description}</p>
        </div>
    );
}

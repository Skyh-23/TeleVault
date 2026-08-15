import { BookOpen, Github, Heart, ShieldCheck, Smartphone, Sparkles, UserCheck } from "lucide-react";
import { open } from "../lib/tauri-extras";
import { GlassButton, Modal } from "./primitives";

const GITHUB_URL = "https://github.com/Skyh-23";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="TeleVault"
      subtitle="End-to-end encrypted personal cloud drive"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <p className="mb-5 text-xs leading-relaxed text-aurora-ink-soft">
        TeleVault turns your personal Telegram storage into a zero-knowledge encrypted drive.
        Files are chunked, encrypted locally with AES-256-GCM, and stored across private channels.
        Nothing is ever decrypted off-device.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Feature icon={ShieldCheck} title="Zero-knowledge" desc="AES-256-GCM, keys stay local" tone="mint" />
        <Feature icon={Sparkles} title="Fast transfers" desc="Parallel multi-block engine" tone="violet" />
        <Feature icon={BookOpen} title="Open architecture" desc="Transparent manifest design" tone="sky" />
        <Feature icon={Smartphone} title="Cross-platform" desc="Desktop and native Android" tone="rose" />
      </div>

      <div className="mb-5 rounded-3xl glass-chip p-4">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-aurora-violet">
          <UserCheck className="h-4 w-4" /> Project credits
        </div>
        <p className="text-xs leading-relaxed text-aurora-ink-soft">
          Built and maintained by <strong className="text-aurora-ink">Liethueis-Foundation</strong>.
          Built under <strong className="text-aurora-ink">Liethueis-Foundation</strong>.
        </p>
      </div>

      <GlassButton
        className="w-full"
        onClick={() => {
          void open(GITHUB_URL);
        }}
      >
        <Github className="h-4 w-4" /> GitHub Repository
      </GlassButton>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-aurora-muted">
        Made with <Heart className="h-3 w-3 fill-aurora-rose text-aurora-rose" /> Not affiliated with Telegram FZ-LLC
      </p>
    </Modal>
  );
}

const TONES: Record<string, string> = {
  mint: "from-aurora-mint/25 to-emerald-400/10 text-emerald-600",
  violet: "from-aurora-violet/15 to-aurora-lavender/10 text-aurora-violet",
  sky: "from-aurora-sky/15 to-aurora-cyan/10 text-sky-600",
  rose: "from-aurora-rose/20 to-pink-400/10 text-pink-600",
};

function Feature({ icon: Icon, title, desc, tone }: { icon: typeof ShieldCheck; title: string; desc: string; tone: string }) {
  return (
    <div className="rounded-3xl glass-chip p-4">
      <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-bold text-aurora-ink">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-aurora-muted">{desc}</p>
    </div>
  );
}
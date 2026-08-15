import { useState } from "react";
import { Download, KeyRound, LockKeyhole, Shield, Upload } from "lucide-react";
import { toast } from "sonner";
import { open, save } from "../lib/tauri-extras";
import { api } from "../lib/api";
import { Modal, GlassButton, GlassInput } from "./primitives";

type Mode = "backup" | "restore";

export function VaultBackupModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("backup");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryPath, setRecoveryPath] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const createBackup = async () => {
    if (password.length < 12) {
      toast.error("Use a recovery password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("The recovery passwords do not match.");
      return;
    }
    const destination = await save({ defaultPath: "TeleVault-vault-recovery.televault-recovery" });
    if (!destination) return;

    setBusy(true);
    try {
      await api.exportVaultFile(password, destination);
      toast.success("Encrypted recovery file created — store it somewhere safe.");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(`Could not create recovery file: ${error}`);
    } finally {
      setBusy(false);
    }
  };

  const selectRecoveryFile = async () => {
    const selected = await open({ multiple: false, title: "Select TeleVault recovery file" });
    if (typeof selected === "string") setRecoveryPath(selected);
  };

  const restoreBackup = async () => {
    if (!recoveryPath) return toast.error("Select a recovery file first.");
    if (!password) return toast.error("Enter the recovery password.");
    if (restoreConfirmation !== "RESTORE") return toast.error("Type RESTORE to confirm replacement.");

    setBusy(true);
    try {
      const result = await api.importVaultFile(password, recoveryPath);
      if (!result.ok) throw new Error(result.message || "The recovery file was not restored.");
      toast.success("Vault restored. Sync your folders to access the recovered files.");
      setPassword("");
      setRestoreConfirmation("");
    } catch (error) {
      toast.error(`Could not restore vault: ${error}`);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setRestoreConfirmation("");
  };

  return (
    <Modal
      title="Recovery & backup"
      subtitle="Move your encrypted vault safely to a new device"
      onClose={onClose}
      maxWidth="max-w-lg"
      icon={KeyRound}
    >
      <div className="grid grid-cols-2 gap-1.5 rounded-full glass-chip p-1 mb-6">
        <button
          onClick={() => switchMode("backup")}
          className={`rounded-full py-2.5 text-sm font-bold transition-all ${mode === "backup" ? "bg-gradient-to-r from-aurora-violet to-aurora-lavender text-white shadow-lavender" : "text-aurora-muted hover:text-aurora-ink"}`}
        >
          Create backup
        </button>
        <button
          onClick={() => switchMode("restore")}
          className={`rounded-full py-2.5 text-sm font-bold transition-all ${mode === "restore" ? "bg-gradient-to-r from-aurora-rose to-aurora-peach text-white shadow-rose" : "text-aurora-muted hover:text-aurora-ink"}`}
        >
          Restore backup
        </button>
      </div>

      {mode === "backup" ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-aurora-mint/40 bg-aurora-mint/10 p-4 flex gap-3">
            <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-aurora-ink-soft">
              Your vault key is wrapped with your recovery password using <strong className="text-aurora-ink">AES-256-GCM</strong>. The raw key never leaves this device.
            </p>
          </div>
          <GlassInput label="New recovery password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" />
          <GlassInput label="Confirm recovery password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" />
          <GlassButton className="w-full" disabled={busy} onClick={createBackup}>
            <Download className="w-4 h-4" />
            {busy ? "Creating encrypted backup…" : "Save encrypted recovery file"}
          </GlassButton>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border border-aurora-rose/40 bg-aurora-rose/10 p-4 flex gap-3">
            <LockKeyhole className="w-5 h-5 text-aurora-rose shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-aurora-ink-soft">
              Restoring replaces this device's current vault key. Continue only when moving your own vault to this device.
            </p>
          </div>

          <button
            onClick={selectRecoveryFile}
            className="w-full flex items-center justify-between gap-3 rounded-3xl border-2 border-dashed border-aurora-line-strong px-4 py-3.5 text-left hover:border-aurora-lavender transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-aurora-ink">{recoveryPath ? "Recovery file selected" : "Select recovery file"}</span>
              <span className="block truncate text-xs text-aurora-muted mt-0.5">{recoveryPath || "Choose your .televault-recovery file"}</span>
            </span>
            <Upload className="w-4 h-4 shrink-0 text-aurora-violet" />
          </button>

          <GlassInput label="Recovery password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password used when the backup was created" />
          <GlassInput
            label={
              <span>
                Type <span className="font-mono text-aurora-violet">RESTORE</span> to confirm
              </span>
            }
            value={restoreConfirmation}
            onChange={(e) => setRestoreConfirmation(e.target.value)}
            placeholder="RESTORE"
          />
          <GlassButton variant="danger" className="w-full" disabled={busy} onClick={restoreBackup}>
            <LockKeyhole className="w-4 h-4" />
            {busy ? "Restoring vault…" : "Restore & replace vault"}
          </GlassButton>
        </div>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Download, KeyRound, LockKeyhole, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';

type Mode = 'backup' | 'restore';

export function VaultRecoveryModal({ onClose }: { onClose: () => void }) {
    const [mode, setMode] = useState<Mode>('backup');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [recoveryPath, setRecoveryPath] = useState('');
    const [restoreConfirmation, setRestoreConfirmation] = useState('');
    const [busy, setBusy] = useState(false);

    const createBackup = async () => {
        if (password.length < 12) {
            toast.error('Use a recovery password with at least 12 characters.');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('The recovery passwords do not match.');
            return;
        }

        const destination = await save({ defaultPath: 'TeleVault-vault-recovery.televault-recovery' });
        if (!destination) return;

        setBusy(true);
        try {
            await api.exportVaultFile(password, destination);
            toast.success('Encrypted recovery file created. Store it somewhere safe.');
            setPassword('');
            setConfirmPassword('');
        } catch (error) {
            toast.error(`Could not create recovery file: ${error}`);
        } finally {
            setBusy(false);
        }
    };

    const selectRecoveryFile = async () => {
        const selected = await open({ multiple: false, title: 'Select TeleVault recovery file' });
        if (typeof selected === 'string') setRecoveryPath(selected);
    };

    const restoreBackup = async () => {
        if (!recoveryPath) {
            toast.error('Select a recovery file first.');
            return;
        }
        if (!password) {
            toast.error('Enter the recovery password.');
            return;
        }
        if (restoreConfirmation !== 'RESTORE') {
            toast.error('Type RESTORE to confirm replacement of this device vault.');
            return;
        }

        setBusy(true);
        try {
            const result = await api.importVaultFile(password, recoveryPath);
            if (!result.ok) {
                throw new Error(result.message || 'The recovery file was not restored.');
            }
            toast.success('Vault restored. Sync your folders to access the recovered files.');
            setPassword('');
            setRestoreConfirmation('');
        } catch (error) {
            toast.error(`Could not restore vault: ${error}`);
        } finally {
            setBusy(false);
        }
    };

    const switchMode = (nextMode: Mode) => {
        setMode(nextMode);
        setPassword('');
        setConfirmPassword('');
        setRestoreConfirmation('');
    };

    return (
        <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <section className="w-full max-w-xl bg-telegram-surface border border-telegram-border rounded-2xl shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()} aria-labelledby="vault-recovery-title">
                <div className="p-5 border-b border-telegram-border flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                        <div className="p-2.5 rounded-xl bg-telegram-primary/15 text-telegram-primary"><KeyRound className="w-5 h-5" /></div>
                        <div>
                            <h2 id="vault-recovery-title" className="font-semibold text-telegram-text">Recovery & Backup</h2>
                            <p className="text-xs text-telegram-subtext mt-1">Move your encrypted vault safely to a new device.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 text-telegram-subtext hover:text-telegram-text"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-5">
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-telegram-hover p-1">
                        <button onClick={() => switchMode('backup')} className={`rounded-lg py-2 text-sm font-medium transition-colors ${mode === 'backup' ? 'bg-telegram-surface text-telegram-text shadow-sm' : 'text-telegram-subtext'}`}>Create backup</button>
                        <button onClick={() => switchMode('restore')} className={`rounded-lg py-2 text-sm font-medium transition-colors ${mode === 'restore' ? 'bg-telegram-surface text-telegram-text shadow-sm' : 'text-telegram-subtext'}`}>Restore backup</button>
                    </div>

                    {mode === 'backup' ? (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-telegram-primary/20 bg-telegram-primary/5 p-4 text-sm text-telegram-subtext leading-relaxed">
                                Your vault key is wrapped with your recovery password using AES-256-GCM. The raw key is never shown or uploaded.
                            </div>
                            <PasswordField label="New recovery password" value={password} onChange={setPassword} placeholder="At least 12 characters" />
                            <PasswordField label="Confirm recovery password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter it again" />
                            <button disabled={busy} onClick={createBackup} className="w-full flex items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-3 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-60">
                                <Download className="w-4 h-4" />
                                {busy ? 'Creating encrypted backup...' : 'Save encrypted recovery file'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-telegram-subtext leading-relaxed">
                                Restoring replaces this device’s current vault key. Continue only when you are moving your own vault to this device.
                            </div>
                            <button onClick={selectRecoveryFile} className="w-full flex items-center justify-between gap-3 rounded-xl border border-dashed border-telegram-border px-4 py-3 text-left hover:bg-telegram-hover transition-colors">
                                <span className="min-w-0"><span className="block text-sm font-medium text-telegram-text">{recoveryPath ? 'Recovery file selected' : 'Select recovery file'}</span><span className="block truncate text-xs text-telegram-subtext mt-1">{recoveryPath || 'Choose your .televault-recovery file'}</span></span>
                                <Upload className="w-4 h-4 shrink-0 text-telegram-primary" />
                            </button>
                            <PasswordField label="Recovery password" value={password} onChange={setPassword} placeholder="Password used when backup was created" />
                            <label className="block text-xs text-telegram-subtext">Type <span className="font-mono text-telegram-text">RESTORE</span> to confirm
                                <input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} className="mt-1.5 w-full rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/60" />
                            </label>
                            <button disabled={busy} onClick={restoreBackup} className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/90 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                                <LockKeyhole className="w-4 h-4" />
                                {busy ? 'Restoring vault...' : 'Restore and replace vault'}
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function PasswordField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
    return <label className="block text-xs text-telegram-subtext">{label}
        <input type="password" autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2.5 text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:border-telegram-primary/60" />
    </label>;
}

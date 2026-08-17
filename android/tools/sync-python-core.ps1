$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source = Join-Path $root "backend"
$target = Join-Path $root "android\app\src\main\python"

$files = @(
    "aes_gcm_crypto.py",
    "db.py",
    "manifest.py",
    "telegram.py",
    "televault_crypto.py",
    "transfer_progress.py",
    "vault.py"
)

foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $source $file) -Destination (Join-Path $target $file) -Force
}

Write-Host "Synced TeleVault Python core into android/app/src/main/python"

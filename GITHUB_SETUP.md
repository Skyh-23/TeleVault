# GitHub Repository Security & Maintenance

This document contains repository-maintenance checks for TeleVault.

## Before Every Push

Run:

```bash
git status
```

Confirm that no sensitive or generated files are staged.

Look for:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
backend/data/
node_modules/
dist/
build/
android/local.properties
```

## Check Tracked Files

List tracked files:

```bash
git ls-files
```

Search tracked files for common sensitive terms:

```bash
git ls-files | xargs grep -n "api_hash" || true
git ls-files | xargs grep -n "vault.key" || true
git ls-files | xargs grep -n "\.session" || true
```

Review matches manually before pushing.

## If a Secret Was Accidentally Committed

Removing a file from the current working tree is not enough if the secret exists in Git history.

Immediately rotate/revoke the affected credential where possible.

Then remove the secret from Git history using an appropriate history-rewriting tool and force-push only after understanding the consequences.

For a public repository, assume an exposed secret may already have been copied.

## Repository Hygiene

Do not commit:

- `node_modules/`
- Python virtual environments
- `dist/`
- `build/`
- local IDE files
- Android `local.properties`
- personal test files
- Telegram session files
- vault keys
- local databases

## Pull Requests

Before merging:

1. Review the changed files.
2. Check for secrets.
3. Test the affected feature.
4. Update documentation if behavior changed.
5. Check that generated artifacts are not included.

## Releases

Before publishing a release:

- Build from a clean environment.
- Verify the application starts.
- Verify authentication.
- Test upload.
- Test download.
- Test encryption/decryption.
- Test recovery.
- Verify no private data is included in the release artifact.

## License

The repository license is defined by `LICENSE`.

Do not add third-party code or assets without checking their applicable license and notice requirements.

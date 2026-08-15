"""
TeleVault Transfer Progress Manager
====================================
Manages upload/download resume capability with encryption.
Tracks progress to allow resuming after network failures.

All resume data is encrypted with vault key for privacy.

Author: Liethueis-Foundation © 2026
"""

import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import DATA_DIR
from vault import load_vault_key


# ─────────────────────────────────────────────
#  Transfer Progress Storage
# ─────────────────────────────────────────────

TRANSFERS_DIR = os.path.join(DATA_DIR, "transfers")
os.makedirs(TRANSFERS_DIR, exist_ok=True)


class TransferProgress:
    """Track upload/download progress for resume capability (secure, minimal metadata)."""

    TRANSFER_TYPES = ["upload", "download"]

    def __init__(
        self,
        transfer_type: str,
        file_path: str,  # Only used for validation, NOT stored
        total_blocks: int,
        folder_id: Optional[int] = None,
        message_id: Optional[int] = None,
        save_path: Optional[str] = None,  # Only used for validation, NOT stored
        file_size: Optional[int] = None,
        block_size: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        if transfer_type not in self.TRANSFER_TYPES:
            raise ValueError(f"transfer_type must be one of {self.TRANSFER_TYPES}")

        self.transfer_id = str(uuid.uuid4())
        self.transfer_type = transfer_type
        # ❌ DO NOT store file_path or save_path - privacy leak
        self.total_blocks = int(total_blocks)
        self.folder_id = folder_id
        self.message_id = message_id  # For downloads: manifest message_id
        self.file_size = file_size
        self.block_size = block_size
        self.uploaded_blocks: List[int] = []
        self.downloaded_blocks: List[int] = []
        self.block_message_ids: Dict[int, int] = {}  # block_index -> message_id
        self.metadata: Dict[str, Any] = metadata or {}
        self.created_at = datetime.now().isoformat()
        self.updated_at = datetime.now().isoformat()
        self.status = "in_progress"  # in_progress, completed, failed

    def add_block(self, block_index: int) -> None:
        """Mark a block as completed."""
        idx = int(block_index)
        if self.transfer_type == "upload":
            if idx not in self.uploaded_blocks:
                self.uploaded_blocks.append(idx)
        else:
            if idx not in self.downloaded_blocks:
                self.downloaded_blocks.append(idx)
        self.touch()
        self.save()

    def touch(self) -> None:
        self.updated_at = datetime.now().isoformat()

    def set_block_message_id(self, block_index: int, message_id: int) -> None:
        """Store the Telegram message ID for a block."""
        self.block_message_ids[int(block_index)] = int(message_id)
        self.touch()
        self.save()

    def get_block_message_id(self, block_index: int) -> Optional[int]:
        """Get the Telegram message ID for a block."""
        return self.block_message_ids.get(int(block_index))

    def set_metadata(self, key: str, value: Any) -> None:
        self.metadata[key] = value
        self.touch()
        self.save()

    def get_metadata(self, key: str, default: Any = None) -> Any:
        return self.metadata.get(key, default)

    def get_completed_blocks(self) -> List[int]:
        """Get list of completed block indices."""
        blocks = self.uploaded_blocks if self.transfer_type == "upload" else self.downloaded_blocks
        return sorted({int(b) for b in blocks})

    def is_block_completed(self, block_index: int) -> bool:
        """Check if a specific block is already completed."""
        idx = int(block_index)
        if self.transfer_type == "upload":
            return idx in self.uploaded_blocks
        return idx in self.downloaded_blocks

    def is_complete(self) -> bool:
        """Check if all blocks are completed."""
        completed = len(self.get_completed_blocks())
        return completed >= self.total_blocks

    def mark_complete(self) -> None:
        """Mark transfer as completed."""
        self.status = "completed"
        self.touch()
        self.save()

    def mark_failed(self) -> None:
        """Mark transfer as failed."""
        self.status = "failed"
        self.touch()
        self.save()

    def get_progress_percent(self) -> float:
        """Get progress percentage (0-100)."""
        completed = len(self.get_completed_blocks())
        if self.total_blocks <= 0:
            return 0.0
        return (completed / self.total_blocks) * 100

    def get_file_path(self) -> str:
        """Get the file path for this transfer."""
        return os.path.join(TRANSFERS_DIR, f"{self.transfer_id}.json")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transfer_id": self.transfer_id,
            "transfer_type": self.transfer_type,
            # ❌ file_path and save_path removed for privacy
            "total_blocks": self.total_blocks,
            "folder_id": self.folder_id,
            "message_id": self.message_id,
            "file_size": self.file_size,
            "block_size": self.block_size,
            "uploaded_blocks": self.uploaded_blocks,
            "downloaded_blocks": self.downloaded_blocks,
            "block_message_ids": self.block_message_ids,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
        }

    def save(self) -> None:
        """Save progress to disk (encrypted with vault key)."""
        from aes_gcm_crypto import AESGCMCrypto
        
        # Serialize to JSON
        data = json.dumps(self.to_dict(), indent=2).encode('utf-8')
        
        # Encrypt with vault key
        vault_key = load_vault_key()
        crypto = AESGCMCrypto(vault_key, b'\x00' * 32)  # Fixed salt for resume files
        encrypted = crypto.encrypt_block(data, 0)  # Block index 0 for resume files
        crypto.close()
        
        # Write encrypted data
        with open(self.get_file_path(), "wb") as f:
            f.write(encrypted)

    @classmethod
    def load(cls, transfer_id: str) -> Optional["TransferProgress"]:
        """Load progress from disk (decrypt with vault key)."""
        from aes_gcm_crypto import AESGCMCrypto
        
        file_path = os.path.join(TRANSFERS_DIR, f"{transfer_id}.json")
        if not os.path.exists(file_path):
            return None

        try:
            # Read encrypted data
            with open(file_path, "rb") as f:
                encrypted = f.read()
            
            # Decrypt with vault key
            vault_key = load_vault_key()
            crypto = AESGCMCrypto(vault_key, b'\x00' * 32)  # Fixed salt for resume files
            decrypted = crypto.decrypt_block(encrypted, 0)  # Block index 0 for resume files
            crypto.close()
            
            # Parse JSON
            data = json.loads(decrypted.decode('utf-8'))
        except Exception:
            return None

        if not isinstance(data, dict):
            return None

        transfer_type = data.get("transfer_type")
        if transfer_type not in cls.TRANSFER_TYPES:
            return None

        obj = cls(
            transfer_type=transfer_type,
            file_path="",  # ❌ Not stored, empty for compatibility
            total_blocks=int(data.get("total_blocks", 0) or 0),
            folder_id=data.get("folder_id"),
            message_id=data.get("message_id"),
            save_path="",  # ❌ Not stored, empty for compatibility
            file_size=data.get("file_size"),
            block_size=data.get("block_size"),
            metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
        )
        obj.transfer_id = data.get("transfer_id", transfer_id)
        obj.uploaded_blocks = [int(b) for b in data.get("uploaded_blocks", []) if isinstance(b, int) or str(b).isdigit()]
        obj.downloaded_blocks = [int(b) for b in data.get("downloaded_blocks", []) if isinstance(b, int) or str(b).isdigit()]
        raw_ids = data.get("block_message_ids", {})
        if isinstance(raw_ids, dict):
            normalized: Dict[int, int] = {}
            for k, v in raw_ids.items():
                try:
                    normalized[int(k)] = int(v)
                except Exception:
                    continue
            obj.block_message_ids = normalized
        obj.created_at = data.get("created_at", obj.created_at)
        obj.updated_at = data.get("updated_at", obj.updated_at)
        obj.status = data.get("status", "in_progress")
        return obj

    def delete(self) -> None:
        """Delete progress file."""
        file_path = self.get_file_path()
        if os.path.exists(file_path):
            os.remove(file_path)

    @classmethod
    def list_active_transfers(cls) -> List["TransferProgress"]:
        """List all in-progress transfers."""
        transfers = []
        for filename in os.listdir(TRANSFERS_DIR):
            if not filename.endswith(".json"):
                continue
            transfer_id = filename[:-5]
            transfer = cls.load(transfer_id)
            if transfer and transfer.status == "in_progress":
                transfers.append(transfer)
        return transfers

    @classmethod
    def cleanup_old_transfers(cls, max_age_hours: int = 24) -> int:
        """Clean up old transfer state files. Returns deleted count."""
        deleted = 0
        now = datetime.now()
        for filename in os.listdir(TRANSFERS_DIR):
            if not filename.endswith(".json"):
                continue
            transfer_id = filename[:-5]
            transfer = cls.load(transfer_id)
            if not transfer:
                try:
                    os.remove(os.path.join(TRANSFERS_DIR, filename))
                    deleted += 1
                except OSError:
                    pass
                continue
            try:
                updated = datetime.fromisoformat(transfer.updated_at)
            except Exception:
                transfer.delete()
                deleted += 1
                continue

            age_hours = (now - updated).total_seconds() / 3600
            if age_hours > max_age_hours:
                transfer.delete()
                deleted += 1
        return deleted

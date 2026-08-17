"""
TeleVault Telegram Client
===========================
Wraps Telethon to handle all Telegram operations:
- Authentication (phone → code → 2FA)
- Folder management (channels as folders)
- File upload/download (encrypted blocks)
- Search, move, delete

Each "folder" is a private Telegram channel with the prefix "TeleVault-".
Saved Messages (folder_id=None) is used as the default storage.

Author: Hiren Sumra — Liethueis Foundation © 2026
"""

import os
import asyncio
import time
import uuid
import logging
from typing import List, Optional, Dict, Any

from telethon import TelegramClient, errors
import random
from telethon.tl.functions.channels import (
    CreateChannelRequest,
    DeleteChannelRequest,
    EditPhotoRequest,
)
from telethon.tl.functions.messages import (
    SearchGlobalRequest,
    GetDialogsRequest,
    CheckChatInviteRequest,
    ExportChatInviteRequest,
    ImportChatInviteRequest,
)
from telethon.tl.types import (
    Channel,
    ChatInvite,
    ChatInviteAlready,
    InputPeerChannel,
    InputPeerSelf,
    DocumentAttributeFilename,
    MessageMediaDocument,
    InputChannel,
    Document,
)
from telethon.tl.functions.messages import ForwardMessagesRequest

from share import extract_invite_hash, SHARE_FORWARD_CHUNK

from config import (
    SESSION_FILE,
    DATA_DIR,
    CHANNEL_PREFIX,
)

logger = logging.getLogger("televault.telegram")

# Prefix used for one-channel-per-share channels created by the sharer.
SHARE_CHANNEL_PREFIX = "TeleVault-Share-"


def _with_flood_retry(max_retries: int = 5):
    """
    Decorator that adds exponential backoff for Telegram flood limits.
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except errors.FloodWaitError as e:
                    # For small files, use shorter wait time to avoid excessive delays
                    wait_time = min(e.seconds, 5) + random.uniform(0.1, 0.5)
                    logger.warning(f"FloodWait: sleeping {wait_time:.1f}s (attempt {attempt + 1}/{max_retries}), original wait: {e.seconds}s")
                    await asyncio.sleep(wait_time)
                except errors.AuthKeyUnregisteredError:
                    logger.error("Session expired during operation")
                    raise RuntimeError("Session expired. Please log in again.")
                except ConnectionError:
                    # Connection is down — don't blind-retry 5x here. Callers
                    # (stream server, command handlers) own the reconnect
                    # strategy and should fail fast instead of hanging.
                    raise
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    logger.warning(f"Retry {attempt + 1}/{max_retries}: {e}")
                    await asyncio.sleep(1.0 * (attempt + 1))
            return None
        return wrapper
    return decorator


class TeleVaultTelegram:
    """
    Manages all Telegram interactions for TeleVault.
    Wraps a Telethon client with higher-level operations.
    """

    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self.api_id: Optional[int] = None
        self.api_hash: Optional[str] = None
        self.phone: Optional[str] = None
        self.phone_code_hash: Optional[str] = None
        self._connected = False

        # Bandwidth tracking
        self._bytes_uploaded = 0
        self._bytes_downloaded = 0

        # Entity cache
        self._folder_cache: Dict[int, Any] = {}

    def _set_api_hash(self, api_id: int, api_hash: str) -> None:
        """Store API credentials."""
        self.api_id = api_id
        self.api_hash = api_hash

    def _clear_api_hash(self) -> None:
        """Clear stored API credentials."""
        self.api_id = None
        self.api_hash = None

    # ─────────────────────────────────────────
    #  Auth Flow
    # ─────────────────────────────────────────

    async def request_code(self, phone: str, api_id: int, api_hash: str) -> None:
        """
        Step 1 of auth: Request verification code.

        Args:
            phone: phone number with country code
            api_id: Telegram API ID
            api_hash: Telegram API Hash
        """
        self._set_api_hash(api_id, api_hash)
        self.phone = phone

        # Create client with session file
        self.client = TelegramClient(SESSION_FILE, api_id, api_hash, use_ipv6=False)
        await self.client.connect()

        try:
            result = await self.client.send_code_request(phone)
            self.phone_code_hash = result.phone_code_hash
            self._connected = True
            logger.info(f"Code sent to {phone}")
        except (errors.AuthRestartError, errors.AuthKeyUnregisteredError) as e:
            logger.warning(f"Session issue during code request: {e}")
            # For AuthRestartError, we need to disconnect and retry
            try:
                await self.client.disconnect()
            except Exception:
                pass
            # Delete corrupted session
            for ext in [".session", ".session-journal"]:
                path = SESSION_FILE + ext
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
            # Try again with fresh session
            self.client = TelegramClient(SESSION_FILE, api_id, api_hash, use_ipv6=False)
            await self.client.connect()
            result = await self.client.send_code_request(phone)
            self.phone_code_hash = result.phone_code_hash
            self._connected = True
            logger.info(f"Code sent to {phone} (retry)")

    async def sign_in(self, code: str) -> dict:
        """
        Step 2 of auth: Verify the code.
        Returns { success: True } or { success: False, next_step: "password" }
        """
        if not self.client or not self.phone:
            raise RuntimeError("Call request_code first")

        try:
            await self.client.sign_in(
                phone=self.phone,
                code=code,
                phone_code_hash=self.phone_code_hash,
            )
            self._connected = True
            # Persist api_hash so reconnect works after restart
            if self.api_id and self.api_hash:
                self._save_api_credentials(self.api_id, self.api_hash)
            logger.info("Signed in successfully")
            return {"success": True}
        except errors.SessionPasswordNeededError:
            logger.info("2FA required")
            return {"success": False, "next_step": "password"}

    async def check_password(self, password: str) -> dict:
        """
        Step 3 of auth (optional): Handle 2FA password.
        """
        if not self.client:
            raise RuntimeError("Call request_code and sign_in first")

        await self.client.sign_in(password=password)
        self._connected = True
        # Persist api_hash so reconnect works after restart
        if self.api_id and self.api_hash:
            self._save_api_credentials(self.api_id, self.api_hash)
        logger.info("2FA password accepted")
        return {"success": True}

    async def connect(self, api_id: int) -> None:
        """
        Reconnect using an existing saved session.
        Called on every app startup — skips OTP if session is still valid.

        Raises RuntimeError with message containing 'SESSION_EXPIRED' when
        the session is invalid (so the caller can distinguish auth failures
        from transient network errors).
        """
        # Already connected and authorized — nothing to do
        if self.client and self._connected:
            try:
                if await self.client.is_user_authorized():
                    return
            except Exception:
                pass  # Fall through to reconnect

        # Load api_hash from disk (saved on first successful sign-in)
        api_hash = self._load_api_hash()
        if not api_hash:
            raise RuntimeError(
                "SESSION_EXPIRED: No saved API credentials. Please log in."
            )

        self.api_id = api_id
        self.api_hash = api_hash

        if self.client:
            try:
                await self.client.disconnect()
            except Exception:
                pass

        self.client = TelegramClient(
            SESSION_FILE,
            api_id,
            api_hash,
            use_ipv6=False,
            timeout=10,
            connection_retries=2,
            retry_delay=1,
        )
        try:
            await self.client.connect()
        except (OSError, ConnectionError, TimeoutError) as e:
            # Transient network error — raise as NETWORK_ERROR so caller can retry
            raise RuntimeError(f"NETWORK_ERROR: {e}") from e

        try:
            authorized = await self.client.is_user_authorized()
        except (OSError, ConnectionError, TimeoutError) as e:
            raise RuntimeError(f"NETWORK_ERROR: {e}") from e

        if not authorized:
            raise RuntimeError(
                "SESSION_EXPIRED: Session is no longer valid. Please log in again."
            )

        self._connected = True
        logger.info("Reconnected to Telegram using saved session")

    async def logout(self) -> None:
        """Disconnect and remove session."""
        if self.client:
            try:
                await self.client.log_out()
            except Exception:
                pass
            finally:
                try:
                    await self.client.disconnect()
                except Exception:
                    pass

        # Remove session file
        session_path = SESSION_FILE + ".session"
        if os.path.exists(session_path):
            os.remove(session_path)

        self._connected = False
        self._folder_cache.clear()
        self._clear_api_hash()
        logger.info("Logged out")

    def _save_api_hash(self, api_hash: str) -> None:
        """Save api_hash to disk for reconnection."""
        path = os.path.join(DATA_DIR, "api_hash.txt")
        with open(path, 'w') as f:
            f.write(api_hash)

    def _save_api_id(self, api_id: int) -> None:
        """Save api_id to disk for reconnection."""
        path = os.path.join(DATA_DIR, "api_id.txt")
        with open(path, 'w') as f:
            f.write(str(api_id))

    def _save_api_credentials(self, api_id: int, api_hash: str) -> None:
        """Save Telegram API credentials needed for session reconnect."""
        self._save_api_id(api_id)
        self._save_api_hash(api_hash)

    def _load_api_id(self) -> Optional[int]:
        """Load saved api_id."""
        path = os.path.join(DATA_DIR, "api_id.txt")
        if os.path.exists(path):
            try:
                return int(open(path, 'r').read().strip())
            except (OSError, ValueError):
                return None
        return None

    def _load_api_hash(self) -> Optional[str]:
        """Load saved api_hash."""
        path = os.path.join(DATA_DIR, "api_hash.txt")
        if os.path.exists(path):
            with open(path, 'r') as f:
                return f.read().strip()
        return None

    def _clear_api_hash(self) -> None:
        """Remove saved api_hash."""
        for name in ("api_hash.txt", "api_id.txt"):
            path = os.path.join(DATA_DIR, name)
            if os.path.exists(path):
                os.remove(path)

    def _ensure_connected(self) -> None:
        """Raise if not connected."""
        if not self.client or not self._connected:
            raise RuntimeError("Not connected to Telegram")

    # ─────────────────────────────────────────
    #  Folder Operations (Channels)
    # ─────────────────────────────────────────

    async def scan_folders(self) -> List[dict]:
        """
        List all TeleVault channels (folders) owned by the user.
        Returns: [{ id, name }]
        """
        self._ensure_connected()
        folders = []

        async for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            if isinstance(entity, Channel) and entity.creator:
                title = entity.title or ""
                if title.startswith(CHANNEL_PREFIX):
                    display_name = title[len(CHANNEL_PREFIX):]
                    folder = {"id": entity.id, "name": display_name}
                    folders.append(folder)
                    self._folder_cache[entity.id] = entity

        logger.info(f"Found {len(folders)} TeleVault folders")
        return folders

    async def create_folder(self, name: str) -> dict:
        """
        Create a new private channel as a TeleVault folder.
        Returns: { id, name }
        """
        self._ensure_connected()
        channel_title = f"{CHANNEL_PREFIX}{name}"

        result = await self.client(CreateChannelRequest(
            title=channel_title,
            about=f"TeleVault encrypted storage folder: {name}",
            megagroup=False,
        ))

        # Extract the channel from the result
        channel = None
        for chat in result.chats:
            if isinstance(chat, Channel):
                channel = chat
                break

        if not channel:
            raise RuntimeError("Failed to create channel")

        self._folder_cache[channel.id] = channel
        logger.info(f"Created folder: {name} (id={channel.id})")
        return {"id": channel.id, "name": name}

    async def delete_folder(self, folder_id: int) -> None:
        """Delete a TeleVault channel/folder."""
        self._ensure_connected()
        entity = await self._get_entity(folder_id)
        await self.client(DeleteChannelRequest(channel=entity))
        self._folder_cache.pop(folder_id, None)
        logger.info(f"Deleted folder: {folder_id}")

    async def _get_entity(self, folder_id: int):
        """Get a Telegram entity by folder ID, using cache."""
        if folder_id in self._folder_cache:
            return self._folder_cache[folder_id]

        # Try to find it in dialogs
        async for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            if isinstance(entity, Channel) and entity.id == folder_id:
                self._folder_cache[folder_id] = entity
                return entity

        raise ValueError(f"Folder not found: {folder_id}")

    # ─────────────────────────────────────────
    #  Share Channels (E2E sharing)
    # ─────────────────────────────────────────

    async def create_share_channel(self, tag: str) -> Channel:
        """
        Create a dedicated private channel for one E2E share.
        Each share gets its own randomly-named channel so link holders
        can never see other people's shares.
        """
        self._ensure_connected()
        result = await self.client(CreateChannelRequest(
            title=f"{SHARE_CHANNEL_PREFIX}{tag}",
            about=(
                "TeleVault encrypted share. Do not join unless you were "
                "sent the matching link by the owner."
            ),
            megagroup=False,
        ))

        channel = None
        for chat in result.chats:
            if isinstance(chat, Channel):
                channel = chat
                break
        if not channel:
            raise RuntimeError("Failed to create share channel")

        self._folder_cache[channel.id] = channel
        logger.info(f"Created share channel {channel.id}")
        return channel

    async def forward_blocks_to_channel(
        self,
        source_folder_id: Optional[int],
        block_ids: List[int],
        channel: Channel,
    ) -> List[int]:
        """
        Forward encrypted block messages into a share channel.
        Telegram copies the file server-side — no re-upload of bytes.
        Returns the new message IDs as seen inside the share channel.
        """
        self._ensure_connected()
        if source_folder_id is None:
            source_peer = "me"
        else:
            source_peer = await self._get_entity(source_folder_id)

        new_ids: List[int] = []
        for start in range(0, len(block_ids), SHARE_FORWARD_CHUNK):
            chunk = block_ids[start : start + SHARE_FORWARD_CHUNK]
            forwarded = await self.client.forward_messages(channel, chunk, source_peer)
            if forwarded is None:
                continue
            if not isinstance(forwarded, list):
                forwarded = [forwarded]
            new_ids.extend([m.id for m in forwarded])

        logger.info(f"Forwarded {len(new_ids)} blocks into share channel {channel.id}")
        return new_ids

    async def export_channel_invite(self, channel: Channel) -> str:
        """Export a chat invite for the share channel; returns the invite hash."""
        self._ensure_connected()
        result = await self.client(ExportChatInviteRequest(peer=channel))
        link = getattr(result, "link", "") or ""
        return extract_invite_hash(link)

    async def join_channel_by_invite(self, invite_hash: str) -> Channel:
        """
        Join a share channel using its invite hash (recipient side).
        Joining with the local Telegram account is idempotent — already
        being a member returns the channel directly.

        Telethon's CheckChatInviteRequest returns two different objects:
        - ChatInviteAlready: the local account is already a member (has .chat)
        - ChatInvite: the local account is NOT a member yet (no .chat) —
          the invite must be imported to actually join.
        """
        self._ensure_connected()
        hash_token = extract_invite_hash(invite_hash)
        if not hash_token:
            raise ValueError("Invalid invite link")

        check = await self.client(CheckChatInviteRequest(hash=hash_token))

        # Already a member — the invite resolves straight to the chat.
        if isinstance(check, ChatInviteAlready):
            chat = check.chat
            if not isinstance(chat, Channel):
                raise ValueError("Could not resolve the shared channel")
            self._folder_cache[chat.id] = chat
            logger.info(f"Already a member of share channel {chat.id}")
            return chat

        if not isinstance(check, ChatInvite):
            raise ValueError("Invalid invite link")

        # Fresh recipient — import the invite to actually join.
        try:
            result = await self.client(ImportChatInviteRequest(hash=hash_token))
        except errors.InviteHashExpiredError:
            raise ValueError("Invite link has expired")
        except errors.InviteHashInvalidError:
            raise ValueError("Invalid invite link")
        except errors.UserAlreadyParticipantError:
            # Joined between the check and the import — resolve the chat now.
            recheck = await self.client(CheckChatInviteRequest(hash=hash_token))
            if isinstance(recheck, ChatInviteAlready) and isinstance(recheck.chat, Channel):
                self._folder_cache[recheck.chat.id] = recheck.chat
                logger.info(f"Already a member of share channel {recheck.chat.id}")
                return recheck.chat
            raise ValueError("Could not resolve the shared channel")

        # ImportChatInviteRequest returns an updates object carrying chats.
        updates = getattr(result, "updates", None) or result
        channel = None
        for c in getattr(updates, "chats", []) or []:
            if isinstance(c, Channel):
                channel = c
                break
        if channel is None:
            raise ValueError("Could not resolve the shared channel")

        self._folder_cache[channel.id] = channel
        logger.info(f"Joined share channel {channel.id}")
        return channel

    async def post_share_metadata(self, channel: Channel, data: bytes) -> int:
        """Upload the encrypted share envelope into the channel."""
        self._ensure_connected()
        message = await self.client.send_file(
            channel,
            file=data,
            file_name="tvshare.bin",
            force_document=True,
            caption="",
        )
        return message.id

    async def download_share_metadata(self, channel: Channel, message_id: int) -> bytes:
        """Download the encrypted share envelope from the channel."""
        self._ensure_connected()
        message = await self.client.get_messages(channel, ids=message_id)
        if not message or not message.media:
            raise ValueError(f"Share metadata message {message_id} not found")
        return await self.client.download_media(message, file=bytes)

    async def delete_share_channel(self, channel) -> None:
        """Delete a share channel by entity or channel id."""
        self._ensure_connected()
        if isinstance(channel, Channel):
            entity = channel
            channel_id = channel.id
        else:
            channel_id = int(channel)
            entity = await self._get_entity(channel_id)
        await self.client(DeleteChannelRequest(channel=entity))
        self._folder_cache.pop(channel_id, None)
        logger.info(f"Deleted share channel {channel_id}")

    def _get_peer(self, folder_id: Optional[int]):
        """Get the peer for a folder. None = Saved Messages."""
        if folder_id is None:
            return InputPeerSelf()
        return self._folder_cache.get(folder_id)

    async def count_manifests(self, folder_id: Optional[int]) -> int:
        """
        Count .tvmanifest documents in a folder WITHOUT downloading them.

        Used to detect a vault-key mismatch: if manifests exist here but the
        current vault key cannot decrypt any of them, the app can prompt the
        user to restore their backup instead of showing a misleading empty vault.
        """
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        count = 0
        async for message in self.client.iter_messages(peer, limit=1000):
            if not message.media:
                continue
            if not isinstance(message.media, MessageMediaDocument):
                continue
            doc = message.media.document
            if not doc:
                continue
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeFilename):
                    if attr.file_name and attr.file_name.endswith(".tvmanifest"):
                        count += 1
                    break
        return count

    # ─────────────────────────────────────────
    #  File Operations
    # ─────────────────────────────────────────

    async def get_files(self, folder_id: Optional[int]) -> List[dict]:
        """
        List all files in a folder (channel) or Saved Messages.
        Uses hybrid approach: reads message captions + manifest data.

        Returns: [{ id, name, size, created_at, icon_type }]
        """
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        files = []
        async for message in self.client.iter_messages(peer, limit=500):
            if not message.media:
                continue

            if not isinstance(message.media, MessageMediaDocument):
                continue

            doc = message.media.document
            if not doc:
                continue

            # Extract filename from attributes
            filename = None
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeFilename):
                    filename = attr.file_name
                    break

            if not filename:
                continue

            # Skip system manifests (hidden from user)
            if filename.endswith(".tvmanifest"):
                # This is a manifest — parse it for the real file info
                # We'll handle this in manifest.py
                continue

            # For now, show raw uploaded files
            file_info = {
                "id": message.id,
                "name": filename,
                "size": doc.size or 0,
                "created_at": message.date.isoformat() if message.date else "",
                "icon_type": "file",
            }
            files.append(file_info)

        return files

    @_with_flood_retry(max_retries=5)
    async def upload_block(
        self,
        data: bytes,
        filename: str,
        folder_id: Optional[int],
        caption: str = "",
        progress_callback=None,
    ) -> int:
        """
        Upload an encrypted block as a document to a folder.

        Args:
            data: encrypted block bytes
            filename: filename on Telegram (random UUID)
            folder_id: target folder (None = Saved Messages)
            caption: optional caption
            progress_callback: fn(sent, total) for progress

        Returns: message ID of the uploaded file
        """
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        last_sent = 0

        def _track_progress(sent, total):
            nonlocal last_sent
            delta = sent - last_sent
            self._bytes_uploaded += delta
            last_sent = sent
            if progress_callback:
                progress_callback(sent, total)

        # Add filename as an attribute to ensure it's preserved
        attributes = [DocumentAttributeFilename(file_name=filename)]

        message = await self.client.send_file(
            peer,
            file=data,
            caption=caption,
            file_name=filename,
            force_document=True,
            attributes=attributes,
            progress_callback=_track_progress,
        )

        logger.debug(f"Uploaded block: {filename} → msg_id={message.id}")
        return message.id

    @_with_flood_retry(max_retries=5)
    async def download_block(
        self,
        message_id: int,
        folder_id: Optional[int],
        progress_callback=None,
        parallelism: int = 6,
    ) -> bytes:
        """
        Download a file/block from a Telegram message.

        Media blocks are fetched as PARALLEL segments and stitched together.
        On high-latency links (phone tethering, ~1.5s RTT per 1 MiB part) a
        sequential download is RTT-bound and crawls; parallel segments finish
        several times faster. Small files fall back to one fetch.

        Returns: raw bytes of the downloaded file
        """
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        # Get the message
        message = await self.client.get_messages(peer, ids=message_id)
        if not message or not message.media:
            raise ValueError(f"Message {message_id} not found or has no media")

        document = message.media.document
        total = int(document.size or 0)
        print(f"[dl] block {message_id} size={total} parallelism={parallelism}")

        # Small files (manifests, thumbnails, tiny media): single fetch.
        if parallelism <= 1 or total <= 0 or total < 2 * 1024 * 1024:
            data = await self.client.download_media(
                message,
                file=bytes,
                progress_callback=progress_callback,
            )
            self._bytes_downloaded += len(data) if data else 0
            return data

        # Split into parallel segments and fetch concurrently (pipelined on
        # the single MTProto connection, so latency is amortised). Small parts
        # (128 KiB) survive lossy links much better than 512 KiB ones.
        part = max(1, (total + parallelism - 1) // parallelism)
        segments = []
        for offset in range(0, total, part):
            size = min(part, total - offset)
            segments.append((offset, size))

        async def _fetch_segment(offset: int, size: int) -> bytes:
            chunks = []
            got = 0
            # iter_download yields parts starting at `offset` — the exact API
            # for parallel segment fetches.
            try:
                async for chunk in self.client.iter_download(
                    document,
                    offset=offset,
                    request_size=128 * 1024,
                    file_size=size,
                ):
                    chunks.append(bytes(chunk))
                    got += len(chunk)
                    if got >= size:
                        break
            except Exception as exc:
                print(f"[dl] segment {offset} failed: {exc}")
                raise
            data = b"".join(chunks)
            if progress_callback:
                progress_callback(offset + len(data), total)
            return data[:size]

        import time as _time
        t0 = _time.time()
        chunks = await asyncio.gather(*(_fetch_segment(o, s) for o, s in segments))
        data = b"".join(chunks)
        self._bytes_downloaded += len(data)
        print(f"[dl] block {message_id} completed {len(data)}B in {_time.time() - t0:.1f}s")
        return data

    async def delete_file(self, message_id: int, folder_id: Optional[int]) -> None:
        """Delete a file (message) from a folder."""
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        await self.client.delete_messages(peer, [message_id])
        logger.info(f"Deleted message {message_id} from folder {folder_id}")

    async def delete_messages(self, message_ids: List[int], folder_id: Optional[int]) -> None:
        """Delete multiple messages from a folder."""
        self._ensure_connected()

        if folder_id is None:
            peer = "me"
        else:
            peer = await self._get_entity(folder_id)

        await self.client.delete_messages(peer, message_ids)

    async def move_files(
        self,
        message_ids: List[int],
        source_folder_id: Optional[int],
        target_folder_id: Optional[int],
    ) -> None:
        """
        Move files from one folder to another.
        Forwards messages then deletes originals.
        """
        self._ensure_connected()

        if source_folder_id is None:
            source_peer = "me"
        else:
            source_peer = await self._get_entity(source_folder_id)

        if target_folder_id is None:
            target_peer = "me"
        else:
            target_peer = await self._get_entity(target_folder_id)

        # Forward messages to target
        await self.client.forward_messages(target_peer, message_ids, source_peer)

        # Delete from source
        await self.client.delete_messages(source_peer, message_ids)
        logger.info(f"Moved {len(message_ids)} files: {source_folder_id} → {target_folder_id}")

    async def search_global(self, query: str) -> List[dict]:
        """
        Search for files across all TeleVault folders.
        Returns: [{ id, name, size, created_at }]
        """
        self._ensure_connected()
        results = []

        # Search in Saved Messages
        async for message in self.client.iter_messages("me", search=query, limit=50):
            if message.media and isinstance(message.media, MessageMediaDocument):
                doc = message.media.document
                filename = None
                for attr in doc.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        filename = attr.file_name
                        break
                if filename and not filename.endswith(".tvmanifest"):
                    results.append({
                        "id": message.id,
                        "name": filename,
                        "size": doc.size or 0,
                        "created_at": message.date.isoformat() if message.date else "",
                    })

        # Search in all TeleVault channels
        for folder_id, entity in self._folder_cache.items():
            try:
                async for message in self.client.iter_messages(entity, search=query, limit=50):
                    if message.media and isinstance(message.media, MessageMediaDocument):
                        doc = message.media.document
                        filename = None
                        for attr in doc.attributes:
                            if isinstance(attr, DocumentAttributeFilename):
                                filename = attr.file_name
                                break
                        if filename and not filename.endswith(".tvmanifest"):
                            results.append({
                                "id": message.id,
                                "name": filename,
                                "size": doc.size or 0,
                                "created_at": message.date.isoformat() if message.date else "",
                            })
            except Exception as e:
                logger.warning(f"Search failed in folder {folder_id}: {e}")
                continue

        return results

    # ─────────────────────────────────────────
    #  Bandwidth
    # ─────────────────────────────────────────

    def get_bandwidth(self) -> dict:
        """Get session bandwidth stats."""
        return {
            "up_bytes": self._bytes_uploaded,
            "down_bytes": self._bytes_downloaded,
        }

    def reset_bandwidth(self) -> None:
        """Reset bandwidth counters."""
        self._bytes_uploaded = 0
        self._bytes_downloaded = 0

    # ─────────────────────────────────────────
    #  Cache Management
    # ─────────────────────────────────────────

    async def clean_cache(self) -> None:
        """Clean temporary download cache."""
        from config import CACHE_DIR
        import shutil
        if os.path.exists(CACHE_DIR):
            shutil.rmtree(CACHE_DIR)
            os.makedirs(CACHE_DIR, exist_ok=True)
        logger.info("Cache cleaned")

    # ─────────────────────────────────────────
    #  Cleanup
    # ─────────────────────────────────────────

    async def disconnect(self) -> None:
        """Gracefully disconnect from Telegram."""
        if self.client:
            try:
                await self.client.disconnect()
            except Exception:
                pass
        self._connected = False

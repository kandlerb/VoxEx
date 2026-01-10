"""
Save manager - handles saving and loading world state.

Provides complete save/load functionality including:
- Named saves with metadata
- Quick save/load (F5/F9)
- RLE-compressed chunk storage
- Modified chunk tracking
- Playtime tracking
"""

import time
from pathlib import Path
from typing import Optional, List, Callable, TYPE_CHECKING

from .constants import (
    SAVE_EXTENSION, CHUNK_EXTENSION, QUICK_SAVE_NAME,
    get_save_directory, SAVE_VERSION
)
from .compression import compress_chunk, decompress_chunk
from .save_data import SaveFile, SaveMetadata, PlayerSaveData, WorldSaveData
from .chunk_tracker import ModifiedChunkTracker

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState
    from voxel_engine.world.chunk import Chunk


class SaveManager:
    """
    Manages saving and loading game state.
    """

    __slots__ = (
        '_save_dir', '_chunk_tracker', '_current_save_name',
        '_session_start_time', '_total_playtime'
    )

    def __init__(self, save_dir: Optional[Path] = None):
        """
        Initialize save manager.

        Args:
            save_dir: Custom save directory (defaults to platform standard).
        """
        self._save_dir = save_dir or get_save_directory()
        self._chunk_tracker = ModifiedChunkTracker()
        self._current_save_name: Optional[str] = None
        self._session_start_time = time.time()
        self._total_playtime = 0.0

    @property
    def chunk_tracker(self) -> ModifiedChunkTracker:
        """Get the chunk modification tracker."""
        return self._chunk_tracker

    @property
    def current_save_name(self) -> Optional[str]:
        """Get the name of the currently loaded save."""
        return self._current_save_name

    def _sanitize_name(self, name: str) -> str:
        """
        Sanitize save name for use in filesystem.

        Args:
            name: Raw save name.

        Returns:
            str: Filesystem-safe name.
        """
        return "".join(c for c in name if c.isalnum() or c in '-_')

    def _get_save_path(self, name: str) -> Path:
        """
        Get path for save file.

        Args:
            name: Save name.

        Returns:
            Path: Full path to save file.
        """
        safe_name = self._sanitize_name(name)
        return self._save_dir / f"{safe_name}{SAVE_EXTENSION}"

    def _get_chunks_dir(self, name: str) -> Path:
        """
        Get directory for chunk data.

        Args:
            name: Save name.

        Returns:
            Path: Path to chunks directory.
        """
        safe_name = self._sanitize_name(name)
        chunks_dir = self._save_dir / f"{safe_name}_chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)
        return chunks_dir

    def _get_chunk_path(self, chunks_dir: Path, cx: int, cz: int) -> Path:
        """
        Get path for individual chunk file.

        Args:
            chunks_dir: Base chunks directory.
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            Path: Full path to chunk file.
        """
        return chunks_dir / f"chunk_{cx}_{cz}{CHUNK_EXTENSION}"

    def list_saves(self) -> List[SaveMetadata]:
        """
        List all available saves.

        Returns:
            List[SaveMetadata]: Save metadata sorted by modification time.
        """
        saves = []

        for path in self._save_dir.glob(f"*{SAVE_EXTENSION}"):
            try:
                with open(path, 'r') as f:
                    save_file = SaveFile.from_json(f.read())
                    saves.append(save_file.metadata)
            except Exception:
                pass  # Skip corrupted saves

        # Sort by modification time (newest first)
        saves.sort(key=lambda s: s.modified_at, reverse=True)
        return saves

    def save(
        self,
        state: "GameState",
        name: str,
        on_progress: Optional[Callable[[float, str], None]] = None
    ) -> bool:
        """
        Save game state to disk.

        Args:
            state: Current game state.
            name: Save name.
            on_progress: Optional callback (progress 0-1, message).

        Returns:
            bool: True if save successful.
        """
        try:
            # Update playtime
            session_time = time.time() - self._session_start_time
            total_playtime = self._total_playtime + session_time

            # Build save file
            save_file = SaveFile()
            save_file.metadata.name = name
            save_file.metadata.version = SAVE_VERSION
            save_file.metadata.playtime_seconds = total_playtime
            save_file.metadata.modified_at = time.time()

            if self._current_save_name is None:
                save_file.metadata.created_at = time.time()

            # Player data
            player = state.player
            save_file.player = PlayerSaveData(
                position=player.position.tolist(),
                velocity=player.velocity.tolist(),
                yaw=float(player.yaw),
                pitch=float(player.pitch),
                is_flying=player.is_flying,
                selected_slot=player.selected_slot,
                torch_active=player.torch_active,
            )

            # World data
            save_file.world = WorldSaveData(
                seed=state.world.seed,
                world_time=state.world.world_time,
                day_length=state.world.day_length,
                tick_count=state.tick_count,
            )

            if on_progress:
                on_progress(0.1, "Collecting modified chunks...")

            # Find and save modified chunks
            chunks_dir = self._get_chunks_dir(name)
            modified_chunks = []

            # Get all loaded chunks
            all_chunks = list(state.world.iter_chunks())
            total_chunks = len(all_chunks)

            for i, (cx, cz, chunk) in enumerate(all_chunks):
                # Check if modified (either tracked or in world's modified set)
                is_modified = (
                    self._chunk_tracker.is_modified(cx, cz) or
                    self._chunk_tracker.check_modification(cx, cz, chunk.blocks)
                )

                if is_modified:
                    # Get chunk data
                    blocks_flat = chunk.blocks.flatten()
                    sky_flat = chunk.sky_light.flatten()
                    block_flat = chunk.block_light.flatten()

                    # Compress and save chunk
                    compressed = compress_chunk(blocks_flat, sky_flat, block_flat)
                    chunk_path = self._get_chunk_path(chunks_dir, cx, cz)

                    with open(chunk_path, 'wb') as f:
                        f.write(compressed)

                    modified_chunks.append((cx, cz))

                if on_progress and total_chunks > 0:
                    progress = 0.1 + 0.8 * (i / total_chunks)
                    on_progress(progress, f"Saving chunk {i + 1}/{total_chunks}")

            save_file.modified_chunks = modified_chunks
            save_file.metadata.chunk_count = len(modified_chunks)

            if on_progress:
                on_progress(0.95, "Writing save file...")

            # Write main save file
            save_path = self._get_save_path(name)
            with open(save_path, 'w') as f:
                f.write(save_file.to_json())

            self._current_save_name = name

            if on_progress:
                on_progress(1.0, "Save complete!")

            return True

        except Exception as e:
            print(f"[Save] Failed: {e}")
            return False

    def load(
        self,
        name: str,
        state: "GameState",
        on_progress: Optional[Callable[[float, str], None]] = None
    ) -> bool:
        """
        Load game state from disk.

        Args:
            name: Save name to load.
            state: GameState to populate.
            on_progress: Optional progress callback.

        Returns:
            bool: True if load successful.
        """
        try:
            from voxel_engine.world.chunk import Chunk

            save_path = self._get_save_path(name)

            if not save_path.exists():
                print(f"[Save] Not found: {name}")
                return False

            if on_progress:
                on_progress(0.1, "Reading save file...")

            # Load save file
            with open(save_path, 'r') as f:
                save_file = SaveFile.from_json(f.read())

            # Version check
            if save_file.metadata.version > SAVE_VERSION:
                print(f"[Save] Version {save_file.metadata.version} newer than "
                      f"supported {SAVE_VERSION}")
                return False

            # Clear current state
            self._clear_world(state)

            # Restore world metadata
            state.world.seed = save_file.world.seed
            state.world.world_time = save_file.world.world_time
            state.world.day_length = save_file.world.day_length
            state.tick_count = save_file.world.tick_count

            if on_progress:
                on_progress(0.2, "Loading player state...")

            # Restore player
            player_data = save_file.player
            state.player.position[:] = player_data.position
            state.player.velocity[:] = player_data.velocity
            state.player.prev_position[:] = player_data.position
            state.player.yaw = player_data.yaw
            state.player.pitch = player_data.pitch
            state.player.is_flying = player_data.is_flying
            state.player.selected_slot = player_data.selected_slot
            state.player.torch_active = player_data.torch_active

            if on_progress:
                on_progress(0.3, "Loading modified chunks...")

            # Load modified chunks
            chunks_dir = self._get_chunks_dir(name)
            total_chunks = len(save_file.modified_chunks)
            chunk_size = state.world.chunk_size
            chunk_height = state.world.chunk_height
            chunk_volume = chunk_size * chunk_height * chunk_size

            for i, (cx, cz) in enumerate(save_file.modified_chunks):
                chunk_path = self._get_chunk_path(chunks_dir, cx, cz)

                if chunk_path.exists():
                    with open(chunk_path, 'rb') as f:
                        compressed = f.read()

                    blocks, skylight, blocklight = decompress_chunk(
                        compressed, chunk_volume
                    )

                    # Reshape arrays to chunk dimensions
                    shape = (chunk_size, chunk_height, chunk_size)
                    blocks_3d = blocks.reshape(shape)
                    sky_3d = skylight.reshape(shape)
                    block_3d = blocklight.reshape(shape)

                    # Create chunk and set data
                    chunk = Chunk(cx, cz, chunk_size, chunk_height)
                    chunk.blocks = blocks_3d.copy()
                    chunk.sky_light = sky_3d.copy()
                    chunk.block_light = block_3d.copy()
                    chunk.dirty = True

                    state.world.set_chunk(cx, cz, chunk)
                    self._chunk_tracker.mark_modified(cx, cz)

                if on_progress and total_chunks > 0:
                    progress = 0.3 + 0.6 * (i / total_chunks)
                    on_progress(progress, f"Loading chunk {i + 1}/{total_chunks}")

            # Restore playtime tracking
            self._total_playtime = save_file.metadata.playtime_seconds
            self._session_start_time = time.time()
            self._current_save_name = name

            if on_progress:
                on_progress(1.0, "Load complete!")

            return True

        except Exception as e:
            print(f"[Save] Load failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _clear_world(self, state: "GameState") -> None:
        """
        Clear world state for loading.

        Args:
            state: GameState to clear.
        """
        # Clear chunks
        state.world.chunks.clear()
        state.world.dirty_chunks.clear()
        state.world.modified_chunks.clear()

        # Clear tracker
        self._chunk_tracker.clear_all()

    def quick_save(self, state: "GameState") -> bool:
        """
        Perform quick save.

        Args:
            state: Game state to save.

        Returns:
            bool: True if successful.
        """
        return self.save(state, QUICK_SAVE_NAME)

    def quick_load(self, state: "GameState") -> bool:
        """
        Perform quick load.

        Args:
            state: Game state to load into.

        Returns:
            bool: True if successful.
        """
        return self.load(QUICK_SAVE_NAME, state)

    def has_quick_save(self) -> bool:
        """
        Check if quick save exists.

        Returns:
            bool: True if quick save exists.
        """
        return self._get_save_path(QUICK_SAVE_NAME).exists()

    def delete_save(self, name: str) -> bool:
        """
        Delete a save and its chunk data.

        Args:
            name: Save name to delete.

        Returns:
            bool: True if deletion successful.
        """
        try:
            # Delete main save file
            save_path = self._get_save_path(name)
            if save_path.exists():
                save_path.unlink()

            # Delete chunks directory
            chunks_dir = self._get_chunks_dir(name)
            if chunks_dir.exists():
                for chunk_file in chunks_dir.glob(f"*{CHUNK_EXTENSION}"):
                    chunk_file.unlink()
                chunks_dir.rmdir()

            return True
        except Exception as e:
            print(f"[Save] Delete failed: {e}")
            return False

    def get_playtime(self) -> float:
        """
        Get total playtime including current session.

        Returns:
            float: Total playtime in seconds.
        """
        session_time = time.time() - self._session_start_time
        return self._total_playtime + session_time

    def reset_session(self) -> None:
        """Reset session tracking for new game."""
        self._current_save_name = None
        self._total_playtime = 0.0
        self._session_start_time = time.time()
        self._chunk_tracker.clear_all()

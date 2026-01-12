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

    def get_world_storage_info(self, name: str) -> dict:
        """
        Get storage statistics for a world.

        Args:
            name: Save name.

        Returns:
            dict: Storage info with keys:
                - chunk_count: Number of modified chunks
                - cache_size_bytes: Total chunk cache size
                - metadata_size_bytes: Save metadata size
        """
        result = {
            'chunk_count': 0,
            'cache_size_bytes': 0,
            'metadata_size_bytes': 0,
        }

        try:
            # Get metadata size from main save file
            save_path = self._get_save_path(name)
            if save_path.exists():
                result['metadata_size_bytes'] = save_path.stat().st_size

            # Get chunk count and cache size
            chunks_dir = self._get_chunks_dir(name)
            if chunks_dir.exists():
                chunk_files = list(chunks_dir.glob(f"*{CHUNK_EXTENSION}"))
                result['chunk_count'] = len(chunk_files)
                result['cache_size_bytes'] = sum(f.stat().st_size for f in chunk_files)

        except Exception as e:
            print(f"[Save] Failed to get storage info: {e}")

        return result

    def rename_world(self, old_name: str, new_name: str) -> bool:
        """
        Rename a saved world.

        Args:
            old_name: Current save name.
            new_name: New save name.

        Returns:
            bool: True if rename successful.
        """
        try:
            # Check if new name already exists
            new_save_path = self._get_save_path(new_name)
            if new_save_path.exists():
                print(f"[Save] Cannot rename: '{new_name}' already exists")
                return False

            old_save_path = self._get_save_path(old_name)
            if not old_save_path.exists():
                print(f"[Save] Cannot rename: '{old_name}' not found")
                return False

            # Read and update save file
            with open(old_save_path, 'r') as f:
                save_file = SaveFile.from_json(f.read())

            save_file.metadata.name = new_name
            save_file.metadata.modified_at = time.time()

            # Write to new location
            with open(new_save_path, 'w') as f:
                f.write(save_file.to_json())

            # Rename chunks directory
            old_chunks_dir = self._save_dir / f"{self._sanitize_name(old_name)}_chunks"
            new_chunks_dir = self._save_dir / f"{self._sanitize_name(new_name)}_chunks"

            if old_chunks_dir.exists():
                old_chunks_dir.rename(new_chunks_dir)

            # Delete old save file
            old_save_path.unlink()

            # Update current save name if this is the active save
            if self._current_save_name == old_name:
                self._current_save_name = new_name

            return True

        except Exception as e:
            print(f"[Save] Rename failed: {e}")
            return False

    def duplicate_world(self, source_name: str, new_name: str) -> bool:
        """
        Create a copy of a saved world.

        Args:
            source_name: Name of world to copy.
            new_name: Name for the copy.

        Returns:
            bool: True if duplication successful.
        """
        try:
            import shutil

            # Check if new name already exists
            new_save_path = self._get_save_path(new_name)
            if new_save_path.exists():
                print(f"[Save] Cannot duplicate: '{new_name}' already exists")
                return False

            source_save_path = self._get_save_path(source_name)
            if not source_save_path.exists():
                print(f"[Save] Cannot duplicate: '{source_name}' not found")
                return False

            # Read source save file
            with open(source_save_path, 'r') as f:
                save_file = SaveFile.from_json(f.read())

            # Update metadata for new world
            save_file.metadata.name = new_name
            save_file.metadata.created_at = time.time()
            save_file.metadata.modified_at = time.time()

            # Write new save file
            with open(new_save_path, 'w') as f:
                f.write(save_file.to_json())

            # Copy chunks directory
            source_chunks_dir = self._save_dir / f"{self._sanitize_name(source_name)}_chunks"
            new_chunks_dir = self._save_dir / f"{self._sanitize_name(new_name)}_chunks"

            if source_chunks_dir.exists():
                shutil.copytree(source_chunks_dir, new_chunks_dir)

            return True

        except Exception as e:
            print(f"[Save] Duplicate failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def clear_chunk_cache(self, name: str) -> bool:
        """
        Delete all cached chunks for a world, keeping metadata.

        Args:
            name: Save name.

        Returns:
            bool: True if cache cleared successfully.
        """
        try:
            chunks_dir = self._get_chunks_dir(name)
            if chunks_dir.exists():
                # Delete all chunk files
                for chunk_file in chunks_dir.glob(f"*{CHUNK_EXTENSION}"):
                    chunk_file.unlink()

            # Update save file to reflect no modified chunks
            save_path = self._get_save_path(name)
            if save_path.exists():
                with open(save_path, 'r') as f:
                    save_file = SaveFile.from_json(f.read())

                save_file.modified_chunks = []
                save_file.metadata.chunk_count = 0
                save_file.metadata.modified_at = time.time()

                with open(save_path, 'w') as f:
                    f.write(save_file.to_json())

            return True

        except Exception as e:
            print(f"[Save] Clear cache failed: {e}")
            return False

    def export_world(self, name: str, filepath: str) -> bool:
        """
        Export world to a file.

        Args:
            name: Save name to export.
            filepath: Destination file path.

        Returns:
            bool: True if export successful.
        """
        try:
            import json
            import gzip

            save_path = self._get_save_path(name)
            if not save_path.exists():
                print(f"[Save] Cannot export: '{name}' not found")
                return False

            # Read save file
            with open(save_path, 'r') as f:
                save_file = SaveFile.from_json(f.read())

            # Collect chunk data
            chunks_data = {}
            chunks_dir = self._get_chunks_dir(name)
            if chunks_dir.exists():
                for chunk_file in chunks_dir.glob(f"*{CHUNK_EXTENSION}"):
                    with open(chunk_file, 'rb') as f:
                        chunks_data[chunk_file.stem] = f.read().hex()

            # Build export data
            export_data = {
                'version': 1,
                'format': 'voxex_export',
                'exported_at': time.time(),
                'save_data': save_file.to_json(),
                'chunks': chunks_data,
            }

            # Write compressed export file
            with gzip.open(filepath, 'wt', encoding='utf-8') as f:
                json.dump(export_data, f)

            return True

        except Exception as e:
            print(f"[Save] Export failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def import_world(self, filepath: str) -> Optional[str]:
        """
        Import world from file.

        Args:
            filepath: Source file path.

        Returns:
            str: Imported world name, or None if failed.
        """
        try:
            import json
            import gzip

            # Read compressed export file
            with gzip.open(filepath, 'rt', encoding='utf-8') as f:
                export_data = json.load(f)

            # Validate format
            if export_data.get('format') != 'voxex_export':
                print("[Save] Invalid export format")
                return None

            # Parse save data
            save_file = SaveFile.from_json(export_data['save_data'])
            original_name = save_file.metadata.name

            # Generate unique name if needed
            final_name = original_name
            counter = 1
            while self._get_save_path(final_name).exists():
                final_name = f"{original_name} ({counter})"
                counter += 1

            # Update metadata
            save_file.metadata.name = final_name
            save_file.metadata.modified_at = time.time()

            # Write save file
            save_path = self._get_save_path(final_name)
            with open(save_path, 'w') as f:
                f.write(save_file.to_json())

            # Write chunk files
            chunks_data = export_data.get('chunks', {})
            if chunks_data:
                chunks_dir = self._get_chunks_dir(final_name)
                for chunk_name, hex_data in chunks_data.items():
                    chunk_path = chunks_dir / f"{chunk_name}{CHUNK_EXTENSION}"
                    with open(chunk_path, 'wb') as f:
                        f.write(bytes.fromhex(hex_data))

            return final_name

        except Exception as e:
            print(f"[Save] Import failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_export_directory(self) -> Path:
        """
        Get the export directory path, creating it if needed.

        Returns:
            Path: Export directory path.
        """
        import os
        export_dir = Path(os.path.expanduser("~")) / "VoxEx_Exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        return export_dir

    def get_default_export_path(self, name: str) -> str:
        """
        Generate a default export file path.

        Args:
            name: World name.

        Returns:
            str: Full path for export file.
        """
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = self._sanitize_name(name)
        filename = f"{safe_name}_{timestamp}.voxex"
        return str(self.get_export_directory() / filename)

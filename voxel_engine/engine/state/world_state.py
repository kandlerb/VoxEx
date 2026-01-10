"""
World state for VoxEx.

Manages loaded chunks using Dict[int, Chunk] with numeric keys.
Key formula: cx * 1048576 + cz (avoids string allocation).

Usage:
    from voxel_engine.engine.state import WorldState

    world = WorldState(seed=12345)
    chunk = world.get_chunk(0, 0)
    block = world.get_block(8, 64, 8)
"""

from typing import Dict, Optional, Set, Tuple, Iterator
from voxel_engine.world.chunk import Chunk


def chunk_key(cx: int, cz: int) -> int:
    """
    Create numeric chunk key from coordinates.

    Uses cx * 1048576 + cz to pack coords into single int.
    Supports coordinates in range [-512, 511] for each axis.

    Args:
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.

    Returns:
        int: Unique key for this chunk position.
    """
    # Offset to handle negative coords: add 524288 (2^19)
    return ((cx + 524288) << 20) | (cz + 524288)


def key_to_coords(key: int) -> Tuple[int, int]:
    """
    Extract chunk coordinates from numeric key.

    Args:
        key: Numeric chunk key.

    Returns:
        Tuple[int, int]: (cx, cz) coordinates.
    """
    cz = (key & 0xFFFFF) - 524288
    cx = (key >> 20) - 524288
    return (cx, cz)


class WorldState:
    """
    Container for world data: chunks, seed, time.

    Chunks are stored in Dict[int, Chunk] for O(1) access.
    Provides block access that spans chunk boundaries.
    """

    __slots__ = [
        "seed", "chunks", "chunk_size", "chunk_height", "sea_level",
        "world_time", "day_length", "dirty_chunks", "modified_chunks"
    ]

    def __init__(
        self,
        seed: int = 0,
        chunk_size: int = 16,
        chunk_height: int = 320,
        sea_level: int = 60,
        day_length: float = 1200.0
    ):
        """
        Initialize world state.

        Args:
            seed: World generation seed.
            chunk_size: Chunk X/Z dimension (default 16).
            chunk_height: Chunk Y dimension (default 320).
            sea_level: Sea level Y coordinate.
            day_length: Length of full day/night cycle in seconds.
        """
        self.seed = seed
        self.chunk_size = chunk_size
        self.chunk_height = chunk_height
        self.sea_level = sea_level

        # Chunk storage: numeric key -> Chunk
        self.chunks: Dict[int, Chunk] = {}

        # Time tracking
        self.world_time: float = 0.0  # Time in seconds
        self.day_length: float = day_length

        # Chunks needing mesh rebuild
        self.dirty_chunks: Set[int] = set()

        # Chunks modified by player (for saving)
        self.modified_chunks: Set[int] = set()

    # =========================================================================
    # CHUNK ACCESS
    # =========================================================================

    def get_chunk(self, cx: int, cz: int) -> Optional[Chunk]:
        """
        Get chunk at coordinates, or None if not loaded.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            Chunk or None.
        """
        return self.chunks.get(chunk_key(cx, cz))

    def set_chunk(self, cx: int, cz: int, chunk: Chunk) -> None:
        """
        Store a chunk at coordinates.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            chunk: Chunk to store.
        """
        key = chunk_key(cx, cz)
        self.chunks[key] = chunk
        self.dirty_chunks.add(key)

    def has_chunk(self, cx: int, cz: int) -> bool:
        """Check if chunk is loaded."""
        return chunk_key(cx, cz) in self.chunks

    def remove_chunk(self, cx: int, cz: int) -> Optional[Chunk]:
        """
        Remove and return a chunk.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            Removed Chunk or None.
        """
        key = chunk_key(cx, cz)
        self.dirty_chunks.discard(key)
        return self.chunks.pop(key, None)

    def chunk_count(self) -> int:
        """Get number of loaded chunks."""
        return len(self.chunks)

    def iter_chunks(self) -> Iterator[Tuple[int, int, Chunk]]:
        """
        Iterate over all loaded chunks.

        Yields:
            Tuple[int, int, Chunk]: (cx, cz, chunk) for each loaded chunk.
        """
        for key, chunk in self.chunks.items():
            cx, cz = key_to_coords(key)
            yield (cx, cz, chunk)

    # =========================================================================
    # BLOCK ACCESS (Cross-chunk)
    # =========================================================================

    def get_block(self, gx: int, gy: int, gz: int) -> int:
        """
        Get block at global coordinates.

        Args:
            gx: Global X coordinate.
            gy: Global Y coordinate (0-319).
            gz: Global Z coordinate.

        Returns:
            int: Block ID, or 0 (AIR) if chunk not loaded or out of bounds.
        """
        if gy < 0 or gy >= self.chunk_height:
            return 0

        # Calculate chunk coordinates
        cx = gx // self.chunk_size if gx >= 0 else (gx - self.chunk_size + 1) // self.chunk_size
        cz = gz // self.chunk_size if gz >= 0 else (gz - self.chunk_size + 1) // self.chunk_size

        chunk = self.get_chunk(cx, cz)
        if chunk is None:
            return 0

        # Calculate local coordinates
        lx = ((gx % self.chunk_size) + self.chunk_size) % self.chunk_size
        lz = ((gz % self.chunk_size) + self.chunk_size) % self.chunk_size

        return chunk.get_block(lx, gy, lz)

    def set_block(self, gx: int, gy: int, gz: int, block_id: int) -> bool:
        """
        Set block at global coordinates.

        Args:
            gx: Global X coordinate.
            gy: Global Y coordinate (0-319).
            gz: Global Z coordinate.
            block_id: Block ID to set.

        Returns:
            bool: True if block was set, False if chunk not loaded.
        """
        if gy < 0 or gy >= self.chunk_height:
            return False

        # Calculate chunk coordinates
        cx = gx // self.chunk_size if gx >= 0 else (gx - self.chunk_size + 1) // self.chunk_size
        cz = gz // self.chunk_size if gz >= 0 else (gz - self.chunk_size + 1) // self.chunk_size

        chunk = self.get_chunk(cx, cz)
        if chunk is None:
            return False

        # Calculate local coordinates
        lx = ((gx % self.chunk_size) + self.chunk_size) % self.chunk_size
        lz = ((gz % self.chunk_size) + self.chunk_size) % self.chunk_size

        chunk.set_block(lx, gy, lz, block_id)

        # Mark chunk as dirty and modified
        key = chunk_key(cx, cz)
        self.dirty_chunks.add(key)
        self.modified_chunks.add(key)

        # Mark adjacent chunks dirty if block is on edge
        if lx == 0:
            self._mark_neighbor_dirty(cx - 1, cz)
        elif lx == self.chunk_size - 1:
            self._mark_neighbor_dirty(cx + 1, cz)
        if lz == 0:
            self._mark_neighbor_dirty(cx, cz - 1)
        elif lz == self.chunk_size - 1:
            self._mark_neighbor_dirty(cx, cz + 1)

        return True

    def _mark_neighbor_dirty(self, cx: int, cz: int) -> None:
        """Mark a neighbor chunk dirty if it exists."""
        key = chunk_key(cx, cz)
        if key in self.chunks:
            self.dirty_chunks.add(key)

    def get_light(self, gx: int, gy: int, gz: int) -> int:
        """
        Get combined light level at global coordinates.

        Args:
            gx: Global X coordinate.
            gy: Global Y coordinate.
            gz: Global Z coordinate.

        Returns:
            int: Light level 0-15, or 15 if out of bounds (sky).
        """
        if gy < 0:
            return 0
        if gy >= self.chunk_height:
            return 15  # Above world = full sky light

        cx = gx // self.chunk_size if gx >= 0 else (gx - self.chunk_size + 1) // self.chunk_size
        cz = gz // self.chunk_size if gz >= 0 else (gz - self.chunk_size + 1) // self.chunk_size

        chunk = self.get_chunk(cx, cz)
        if chunk is None:
            return 15  # Unloaded = assume sky

        lx = ((gx % self.chunk_size) + self.chunk_size) % self.chunk_size
        lz = ((gz % self.chunk_size) + self.chunk_size) % self.chunk_size

        return chunk.get_light(lx, gy, lz)

    # =========================================================================
    # TIME
    # =========================================================================

    def advance_time(self, dt: float) -> None:
        """
        Advance world time.

        Args:
            dt: Time delta in seconds.
        """
        self.world_time += dt

    def get_day_progress(self) -> float:
        """
        Get progress through current day/night cycle.

        Returns:
            float: Value in [0, 1) where 0.25 = noon, 0.75 = midnight.
        """
        return (self.world_time % self.day_length) / self.day_length

    def is_daytime(self) -> bool:
        """Check if it's currently daytime (sun up)."""
        progress = self.get_day_progress()
        return 0.0 <= progress < 0.5

    # =========================================================================
    # DIRTY TRACKING
    # =========================================================================

    def pop_dirty_chunks(self) -> Set[Tuple[int, int]]:
        """
        Get and clear set of dirty chunk coordinates.

        Returns:
            Set of (cx, cz) tuples for chunks needing mesh rebuild.
        """
        result = {key_to_coords(key) for key in self.dirty_chunks}
        self.dirty_chunks.clear()
        return result

    def mark_chunk_dirty(self, cx: int, cz: int) -> None:
        """Mark a chunk as needing mesh rebuild."""
        self.dirty_chunks.add(chunk_key(cx, cz))

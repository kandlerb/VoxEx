"""
Chunk data structure for VoxEx voxel storage.

Uses NumPy arrays for efficient block and light data storage.
A chunk is a 16x320x16 column of blocks with associated lighting.

Usage:
    chunk = Chunk(cx=0, cz=0)
    chunk.set_block(8, 64, 8, GRASS_ID)
    block_type = chunk.get_block(8, 64, 8)
"""

import numpy as np
from typing import Optional, Dict, Any, Tuple


# Default chunk dimensions (can be overridden via world config)
DEFAULT_CHUNK_SIZE = 16
DEFAULT_CHUNK_HEIGHT = 320


class Chunk:
    """
    A 3D column of voxels with lighting data.

    Attributes:
        cx: Chunk X coordinate (world space).
        cz: Chunk Z coordinate (world space).
        blocks: 3D array of block IDs (uint8).
        sky_light: 3D array of sky light levels (uint8, 0-15).
        block_light: 3D array of block light levels (uint8, 0-15).
        dirty: Flag indicating the chunk needs remeshing.
        mesh_data: Cached mesh data (vertices, indices, etc).
    """

    __slots__ = [
        "cx", "cz",
        "blocks", "sky_light", "block_light",
        "dirty", "mesh_data",
        "_size", "_height"
    ]

    def __init__(
        self,
        cx: int,
        cz: int,
        size: int = DEFAULT_CHUNK_SIZE,
        height: int = DEFAULT_CHUNK_HEIGHT
    ):
        """
        Initialize a new chunk at the given coordinates.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            size: Chunk size in X/Z (default 16).
            height: Chunk height in Y (default 320).
        """
        self.cx = cx
        self.cz = cz
        self._size = size
        self._height = height

        # Block data: (X, Y, Z) layout for cache-friendly column iteration
        # Shape: (size, height, size) = (16, 320, 16)
        self.blocks = np.zeros((size, height, size), dtype=np.uint8)

        # Light arrays: same shape as blocks
        # Values 0-15 (0 = no light, 15 = full brightness)
        self.sky_light = np.zeros((size, height, size), dtype=np.uint8)
        self.block_light = np.zeros((size, height, size), dtype=np.uint8)

        # Dirty flag for mesh rebuilding
        self.dirty = True

        # Cached mesh data (set by meshing system)
        self.mesh_data: Optional[Dict[str, Any]] = None

    # =========================================================================
    # BLOCK ACCESS
    # =========================================================================

    def get_block(self, lx: int, ly: int, lz: int) -> int:
        """
        Get the block type at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).

        Returns:
            int: Block ID at the position.
        """
        return int(self.blocks[lx, ly, lz])

    def set_block(self, lx: int, ly: int, lz: int, block_id: int) -> None:
        """
        Set the block type at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).
            block_id: Block ID to set (0-255).
        """
        self.blocks[lx, ly, lz] = block_id
        self.dirty = True

    def fill_blocks(
        self,
        block_id: int,
        min_coords: Tuple[int, int, int] = None,
        max_coords: Tuple[int, int, int] = None
    ) -> None:
        """
        Fill a region with a block type.

        Args:
            block_id: Block ID to fill with.
            min_coords: (lx, ly, lz) minimum corner (inclusive).
            max_coords: (lx, ly, lz) maximum corner (exclusive).
        """
        if min_coords is None:
            min_coords = (0, 0, 0)
        if max_coords is None:
            max_coords = (self._size, self._height, self._size)

        self.blocks[
            min_coords[0]:max_coords[0],
            min_coords[1]:max_coords[1],
            min_coords[2]:max_coords[2]
        ] = block_id
        self.dirty = True

    def get_column(self, lx: int, lz: int) -> np.ndarray:
        """
        Get a vertical column of blocks.

        Args:
            lx: Local X coordinate (0-15).
            lz: Local Z coordinate (0-15).

        Returns:
            np.ndarray: 1D array of block IDs (length = height).
        """
        return self.blocks[lx, :, lz]

    def set_column(self, lx: int, lz: int, column: np.ndarray) -> None:
        """
        Set a vertical column of blocks.

        Args:
            lx: Local X coordinate (0-15).
            lz: Local Z coordinate (0-15).
            column: 1D array of block IDs (length = height).
        """
        self.blocks[lx, :, lz] = column
        self.dirty = True

    # =========================================================================
    # SKY LIGHT ACCESS
    # =========================================================================

    def get_sky_light(self, lx: int, ly: int, lz: int) -> int:
        """
        Get the sky light level at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).

        Returns:
            int: Sky light level (0-15).
        """
        return int(self.sky_light[lx, ly, lz])

    def set_sky_light(self, lx: int, ly: int, lz: int, level: int) -> None:
        """
        Set the sky light level at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).
            level: Light level (0-15).
        """
        self.sky_light[lx, ly, lz] = level

    def fill_sky_light(self, level: int) -> None:
        """
        Fill the entire chunk with a sky light level.

        Args:
            level: Light level (0-15).
        """
        self.sky_light.fill(level)

    # =========================================================================
    # BLOCK LIGHT ACCESS
    # =========================================================================

    def get_block_light(self, lx: int, ly: int, lz: int) -> int:
        """
        Get the block light level at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).

        Returns:
            int: Block light level (0-15).
        """
        return int(self.block_light[lx, ly, lz])

    def set_block_light(self, lx: int, ly: int, lz: int, level: int) -> None:
        """
        Set the block light level at local coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).
            level: Light level (0-15).
        """
        self.block_light[lx, ly, lz] = level

    # =========================================================================
    # COMBINED LIGHT
    # =========================================================================

    def get_light(self, lx: int, ly: int, lz: int) -> int:
        """
        Get the maximum light level (sky or block) at coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).

        Returns:
            int: Maximum light level (0-15).
        """
        return max(
            int(self.sky_light[lx, ly, lz]),
            int(self.block_light[lx, ly, lz])
        )

    # =========================================================================
    # COORDINATE HELPERS
    # =========================================================================

    def local_to_global(self, lx: int, ly: int, lz: int) -> Tuple[int, int, int]:
        """
        Convert local coordinates to global world coordinates.

        Args:
            lx: Local X coordinate (0-15).
            ly: Local Y coordinate (0-319).
            lz: Local Z coordinate (0-15).

        Returns:
            Tuple[int, int, int]: (gx, gy, gz) global coordinates.
        """
        gx = self.cx * self._size + lx
        gz = self.cz * self._size + lz
        return (gx, ly, gz)

    def is_valid_local(self, lx: int, ly: int, lz: int) -> bool:
        """
        Check if local coordinates are within chunk bounds.

        Args:
            lx: Local X coordinate.
            ly: Local Y coordinate.
            lz: Local Z coordinate.

        Returns:
            bool: True if coordinates are valid.
        """
        return (
            0 <= lx < self._size and
            0 <= ly < self._height and
            0 <= lz < self._size
        )

    # =========================================================================
    # PROPERTIES
    # =========================================================================

    @property
    def size(self) -> int:
        """Chunk X/Z size."""
        return self._size

    @property
    def height(self) -> int:
        """Chunk Y height."""
        return self._height

    @property
    def key(self) -> str:
        """Chunk key string 'cx,cz'."""
        return f"{self.cx},{self.cz}"

    @property
    def memory_bytes(self) -> int:
        """Approximate memory usage in bytes."""
        return (
            self.blocks.nbytes +
            self.sky_light.nbytes +
            self.block_light.nbytes
        )

    # =========================================================================
    # SERIALIZATION
    # =========================================================================

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize chunk to a dictionary (for saving).

        Returns:
            Dict with chunk data.
        """
        return {
            "cx": self.cx,
            "cz": self.cz,
            "blocks": self.blocks.tobytes(),
            "sky_light": self.sky_light.tobytes(),
            "block_light": self.block_light.tobytes(),
        }

    @classmethod
    def from_dict(
        cls,
        data: Dict[str, Any],
        size: int = DEFAULT_CHUNK_SIZE,
        height: int = DEFAULT_CHUNK_HEIGHT
    ) -> "Chunk":
        """
        Deserialize chunk from a dictionary.

        Args:
            data: Dict with chunk data.
            size: Chunk size in X/Z.
            height: Chunk height in Y.

        Returns:
            Chunk: Reconstructed chunk.
        """
        chunk = cls(data["cx"], data["cz"], size, height)

        shape = (size, height, size)
        chunk.blocks = np.frombuffer(data["blocks"], dtype=np.uint8).reshape(shape)
        chunk.sky_light = np.frombuffer(data["sky_light"], dtype=np.uint8).reshape(shape)
        chunk.block_light = np.frombuffer(data["block_light"], dtype=np.uint8).reshape(shape)

        chunk.dirty = True
        return chunk

    # =========================================================================
    # UTILITY
    # =========================================================================

    def mark_dirty(self) -> None:
        """Mark chunk as needing remeshing."""
        self.dirty = True

    def mark_clean(self) -> None:
        """Mark chunk as up-to-date (after meshing)."""
        self.dirty = False

    def clear_mesh_data(self) -> None:
        """Clear cached mesh data."""
        self.mesh_data = None

    def __repr__(self) -> str:
        """String representation."""
        return f"Chunk({self.cx}, {self.cz}, dirty={self.dirty})"

    def __eq__(self, other: object) -> bool:
        """Check equality by coordinates."""
        if not isinstance(other, Chunk):
            return NotImplemented
        return self.cx == other.cx and self.cz == other.cz


def create_chunk_key(cx: int, cz: int) -> str:
    """
    Create a chunk key string from coordinates.

    Args:
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.

    Returns:
        str: Key in format "cx,cz".
    """
    return f"{cx},{cz}"


def parse_chunk_key(key: str) -> Tuple[int, int]:
    """
    Parse a chunk key string into coordinates.

    Args:
        key: Key in format "cx,cz".

    Returns:
        Tuple[int, int]: (cx, cz) coordinates.
    """
    parts = key.split(",")
    return int(parts[0]), int(parts[1])

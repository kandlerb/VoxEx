"""
Track which chunks have been modified from procedural generation.

Only modified chunks need to be saved, reducing save file size.
"""

import hashlib
from typing import Set, Tuple, Dict

import numpy as np
from numpy.typing import NDArray


class ModifiedChunkTracker:
    """
    Tracks chunks that differ from their procedurally generated state.

    Only modified chunks need to be saved.
    """

    __slots__ = ('_modified', '_original_hashes')

    def __init__(self):
        """Initialize the tracker."""
        self._modified: Set[Tuple[int, int]] = set()
        self._original_hashes: Dict[Tuple[int, int], bytes] = {}

    def register_generated(
        self,
        cx: int,
        cz: int,
        chunk_data: NDArray[np.uint8]
    ) -> None:
        """
        Register the original procedurally generated state of a chunk.

        Call this after terrain generation, before any modifications.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            chunk_data: Block data array (will be flattened if needed).
        """
        key = (cx, cz)
        # Flatten if needed and store hash of original data
        data = chunk_data.flatten() if chunk_data.ndim > 1 else chunk_data
        self._original_hashes[key] = hashlib.md5(data.tobytes()).digest()

    def mark_modified(self, cx: int, cz: int) -> None:
        """
        Mark a chunk as modified.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        self._modified.add((cx, cz))

    def is_modified(self, cx: int, cz: int) -> bool:
        """
        Check if chunk has been modified.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            bool: True if chunk is marked as modified.
        """
        return (cx, cz) in self._modified

    def check_modification(
        self,
        cx: int,
        cz: int,
        current_data: NDArray[np.uint8]
    ) -> bool:
        """
        Check if chunk data differs from original.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            current_data: Current block data array.

        Returns:
            bool: True if modified, False if same as generated.
        """
        key = (cx, cz)

        if key not in self._original_hashes:
            # No original recorded - assume modified
            return True

        data = current_data.flatten() if current_data.ndim > 1 else current_data
        current_hash = hashlib.md5(data.tobytes()).digest()
        return current_hash != self._original_hashes[key]

    def get_modified_chunks(self) -> Set[Tuple[int, int]]:
        """
        Get set of all modified chunk coordinates.

        Returns:
            Set[Tuple[int, int]]: Copy of modified chunk set.
        """
        return self._modified.copy()

    def clear_modification(self, cx: int, cz: int) -> None:
        """
        Clear modification flag for a chunk.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        self._modified.discard((cx, cz))

    def clear_all(self) -> None:
        """Clear all tracking data."""
        self._modified.clear()
        self._original_hashes.clear()

    def clear_hashes(self) -> None:
        """Clear original hashes only (keep modification flags)."""
        self._original_hashes.clear()

    @property
    def modified_count(self) -> int:
        """Get count of modified chunks."""
        return len(self._modified)

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"ModifiedChunkTracker(modified={len(self._modified)}, "
            f"tracked={len(self._original_hashes)})"
        )

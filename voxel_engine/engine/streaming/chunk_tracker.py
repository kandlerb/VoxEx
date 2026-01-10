"""
Track chunk loading state and distances.

Manages the state machine for chunks as they progress through:
UNLOADED -> GENERATING -> GENERATED -> MESHING -> MESHED -> UPLOADED

Also tracks which chunks need re-meshing (DIRTY state).
"""

from typing import Dict, Tuple, List
from enum import Enum, auto


class ChunkState(Enum):
    """States a chunk can be in during the streaming lifecycle."""
    UNLOADED = auto()     # Not in memory
    GENERATING = auto()   # Terrain generation in progress
    GENERATED = auto()    # Terrain data ready, needs mesh
    MESHING = auto()      # Mesh building in progress
    MESHED = auto()       # Mesh ready, needs GPU upload
    UPLOADED = auto()     # Fully ready for rendering
    DIRTY = auto()        # Needs re-mesh (block changed)


class ChunkTracker:
    """
    Tracks the state of all chunks in the streaming system.

    Provides efficient queries for:
    - Chunk state lookups
    - Distance-based chunk sorting
    - Finding dirty/far chunks

    Attributes:
        player_chunk: Current chunk coordinates the player is in.
        loaded_count: Number of chunks in UPLOADED state.
        total_tracked: Total number of chunks being tracked.
    """

    __slots__ = ('_states', '_load_times', '_last_player_chunk')

    def __init__(self):
        """Initialize chunk tracker."""
        self._states: Dict[Tuple[int, int], ChunkState] = {}
        self._load_times: Dict[Tuple[int, int], float] = {}
        self._last_player_chunk: Tuple[int, int] = (0, 0)

    def get_state(self, cx: int, cz: int) -> ChunkState:
        """
        Get current state of chunk.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.

        Returns:
            ChunkState: Current state, or UNLOADED if not tracked.
        """
        return self._states.get((cx, cz), ChunkState.UNLOADED)

    def set_state(self, cx: int, cz: int, state: ChunkState,
                  time: float = 0.0) -> None:
        """
        Set chunk state.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            state: New state for chunk.
            time: Current time (used to track load times for UPLOADED).
        """
        key = (cx, cz)
        self._states[key] = state
        if state == ChunkState.UPLOADED:
            self._load_times[key] = time

    def mark_dirty(self, cx: int, cz: int) -> None:
        """
        Mark chunk as needing re-mesh.

        Only affects chunks that are currently UPLOADED.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        key = (cx, cz)
        if key in self._states and self._states[key] == ChunkState.UPLOADED:
            self._states[key] = ChunkState.DIRTY

    def remove(self, cx: int, cz: int) -> None:
        """
        Remove chunk from tracking.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
        """
        key = (cx, cz)
        self._states.pop(key, None)
        self._load_times.pop(key, None)

    def get_loaded_chunks(self) -> List[Tuple[int, int]]:
        """
        Get all chunks that are fully loaded (UPLOADED state).

        Returns:
            List[Tuple[int, int]]: Coordinates of loaded chunks.
        """
        return [k for k, v in self._states.items()
                if v == ChunkState.UPLOADED]

    def get_dirty_chunks(self) -> List[Tuple[int, int]]:
        """
        Get chunks needing re-mesh.

        Returns:
            List[Tuple[int, int]]: Coordinates of dirty chunks.
        """
        return [k for k, v in self._states.items()
                if v == ChunkState.DIRTY]

    def get_chunks_beyond_distance(self, player_cx: int, player_cz: int,
                                   distance: int) -> List[Tuple[int, int]]:
        """
        Get loaded/dirty chunks beyond given Chebyshev distance from player.

        Uses Chebyshev distance (max of dx, dz) for square render area.

        Args:
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.
            distance: Minimum distance threshold.

        Returns:
            List[Tuple[int, int]]: Coordinates of far chunks.
        """
        far_chunks = []
        for (cx, cz), state in self._states.items():
            if state in (ChunkState.UPLOADED, ChunkState.DIRTY):
                dx = abs(cx - player_cx)
                dz = abs(cz - player_cz)
                if max(dx, dz) > distance:
                    far_chunks.append((cx, cz))
        return far_chunks

    def get_chunks_sorted_by_distance(self, player_cx: int, player_cz: int,
                                      reverse: bool = False) -> List[Tuple[int, int]]:
        """
        Get all tracked chunks sorted by distance to player.

        Uses squared Euclidean distance for sorting (avoids sqrt).

        Args:
            player_cx: Player's chunk X coordinate.
            player_cz: Player's chunk Z coordinate.
            reverse: If True, sort furthest first.

        Returns:
            List[Tuple[int, int]]: Sorted chunk coordinates.
        """
        def dist_sq(chunk: Tuple[int, int]) -> int:
            cx, cz = chunk
            dx = cx - player_cx
            dz = cz - player_cz
            return dx * dx + dz * dz

        chunks = list(self._states.keys())
        return sorted(chunks, key=dist_sq, reverse=reverse)

    def update_player_chunk(self, cx: int, cz: int) -> bool:
        """
        Update player's current chunk.

        Args:
            cx: New chunk X coordinate.
            cz: New chunk Z coordinate.

        Returns:
            bool: True if chunk changed from previous.
        """
        new_chunk = (cx, cz)
        if new_chunk != self._last_player_chunk:
            self._last_player_chunk = new_chunk
            return True
        return False

    @property
    def player_chunk(self) -> Tuple[int, int]:
        """Get player's current chunk coordinates."""
        return self._last_player_chunk

    @property
    def loaded_count(self) -> int:
        """Number of chunks in UPLOADED state."""
        return sum(1 for v in self._states.values()
                   if v == ChunkState.UPLOADED)

    @property
    def total_tracked(self) -> int:
        """Total number of chunks being tracked."""
        return len(self._states)

    def clear(self) -> None:
        """Clear all tracking data."""
        self._states.clear()
        self._load_times.clear()

    def __repr__(self) -> str:
        """String representation."""
        return (f"ChunkTracker(loaded={self.loaded_count}, "
                f"total={self.total_tracked}, "
                f"player={self._last_player_chunk})")

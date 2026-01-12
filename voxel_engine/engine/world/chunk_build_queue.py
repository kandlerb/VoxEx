"""
Chunk build queue system for VoxEx.

Manages which chunks need mesh building and prioritizes by distance to player.
Uses a priority queue to ensure closest chunks are built first.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Set
from enum import IntEnum
import heapq
import time


class ChunkBuildPriority(IntEnum):
    """
    Priority levels for chunk building.

    Lower values = higher priority (processed first).
    """
    IMMEDIATE = 0    # Player's current chunk
    HIGH = 1         # Adjacent to player
    NORMAL = 2       # Within render distance
    LOW = 3          # Near edge of render distance
    BACKGROUND = 4   # Pre-generation beyond render distance


@dataclass(order=True)
class ChunkBuildRequest:
    """
    Request to build a chunk mesh.

    Ordered by priority for heap-based queue.

    Attributes:
        priority: Build priority (lower = higher priority).
        timestamp: Time when request was created.
        chunk_x: Chunk X coordinate.
        chunk_z: Chunk Z coordinate.
        rebuild: True if rebuilding an existing mesh.
    """
    priority: int
    timestamp: float = field(compare=False)
    chunk_x: int = field(compare=False)
    chunk_z: int = field(compare=False)
    rebuild: bool = field(compare=False, default=False)

    @property
    def key(self) -> Tuple[int, int]:
        """Get chunk coordinate tuple."""
        return (self.chunk_x, self.chunk_z)


class ChunkBuildQueue:
    """
    Priority queue for chunk build requests.

    Chunks closer to the player are built first.
    Duplicate requests for the same chunk are deduplicated.

    Attributes:
        max_queued: Maximum number of chunks in queue.
    """

    __slots__ = ('_heap', '_pending', '_building', 'max_queued')

    def __init__(self, max_queued: int = 100):
        """
        Initialize the chunk build queue.

        @param max_queued: Maximum chunks allowed in queue.
        """
        self._heap: List[ChunkBuildRequest] = []
        self._pending: Set[Tuple[int, int]] = set()  # Track what's in queue
        self._building: Set[Tuple[int, int]] = set()  # Track what's being built
        self.max_queued = max_queued

    def enqueue(
        self,
        chunk_x: int,
        chunk_z: int,
        priority: ChunkBuildPriority = ChunkBuildPriority.NORMAL,
        rebuild: bool = False
    ) -> bool:
        """
        Add a chunk to the build queue.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        @param priority: Build priority level.
        @param rebuild: True if rebuilding existing mesh.
        @returns: True if added, False if already queued/building or queue full.
        """
        key = (chunk_x, chunk_z)

        # Skip if already pending or being built
        if key in self._pending or key in self._building:
            return False

        # Skip if queue is full (except for immediate priority)
        if len(self._heap) >= self.max_queued and priority != ChunkBuildPriority.IMMEDIATE:
            return False

        request = ChunkBuildRequest(
            priority=priority,
            timestamp=time.time(),
            chunk_x=chunk_x,
            chunk_z=chunk_z,
            rebuild=rebuild
        )

        heapq.heappush(self._heap, request)
        self._pending.add(key)
        return True

    def dequeue(self) -> Optional[ChunkBuildRequest]:
        """
        Get the highest priority chunk to build.

        @returns: ChunkBuildRequest or None if queue is empty.
        """
        while self._heap:
            request = heapq.heappop(self._heap)
            key = request.key

            # Remove from pending, add to building
            if key in self._pending:
                self._pending.remove(key)
                self._building.add(key)
                return request

        return None

    def dequeue_batch(self, max_count: int) -> List[ChunkBuildRequest]:
        """
        Get multiple highest priority chunks to build.

        @param max_count: Maximum number of chunks to dequeue.
        @returns: List of ChunkBuildRequest objects.
        """
        requests = []
        for _ in range(max_count):
            request = self.dequeue()
            if request is None:
                break
            requests.append(request)
        return requests

    def mark_complete(self, chunk_x: int, chunk_z: int) -> None:
        """
        Mark a chunk as done building.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        """
        key = (chunk_x, chunk_z)
        self._building.discard(key)

    def mark_failed(self, chunk_x: int, chunk_z: int) -> None:
        """
        Mark a chunk build as failed (allows retry).

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        """
        key = (chunk_x, chunk_z)
        self._building.discard(key)

    def cancel(self, chunk_x: int, chunk_z: int) -> None:
        """
        Cancel a pending build request.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        """
        key = (chunk_x, chunk_z)
        self._pending.discard(key)
        # Note: Can't easily remove from heap, but dequeue will skip it

    def cancel_all_pending(self) -> None:
        """Cancel all pending requests (not in-progress builds)."""
        self._heap.clear()
        self._pending.clear()

    def clear(self) -> None:
        """Clear all pending requests."""
        self._heap.clear()
        self._pending.clear()
        # Don't clear _building - those are in progress

    def is_pending(self, chunk_x: int, chunk_z: int) -> bool:
        """
        Check if a chunk is pending build.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        @returns: True if chunk is in pending queue.
        """
        return (chunk_x, chunk_z) in self._pending

    def is_building(self, chunk_x: int, chunk_z: int) -> bool:
        """
        Check if a chunk is currently being built.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        @returns: True if chunk is being built.
        """
        return (chunk_x, chunk_z) in self._building

    def is_queued_or_building(self, chunk_x: int, chunk_z: int) -> bool:
        """
        Check if a chunk is pending or being built.

        @param chunk_x: Chunk X coordinate.
        @param chunk_z: Chunk Z coordinate.
        @returns: True if chunk is in queue or being built.
        """
        key = (chunk_x, chunk_z)
        return key in self._pending or key in self._building

    @property
    def pending_count(self) -> int:
        """Number of chunks waiting to be built."""
        return len(self._pending)

    @property
    def building_count(self) -> int:
        """Number of chunks currently being built."""
        return len(self._building)

    @property
    def is_empty(self) -> bool:
        """Check if queue has no pending chunks."""
        return len(self._heap) == 0

    @property
    def is_idle(self) -> bool:
        """Check if no chunks are pending or building."""
        return len(self._pending) == 0 and len(self._building) == 0

    def __len__(self) -> int:
        """Return number of chunks in queue."""
        return len(self._heap)

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"ChunkBuildQueue(pending={self.pending_count}, "
            f"building={self.building_count}, max={self.max_queued})"
        )

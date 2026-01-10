"""
Priority queue for chunk operations.

Manages queued chunk tasks (generate, mesh, upload, unload) with
priority-based ordering. Lower priority values are processed first.
"""

import heapq
from typing import List, Tuple, Set, Optional
from dataclasses import dataclass, field
from enum import Enum, auto


class ChunkTaskType(Enum):
    """Types of chunk operations that can be queued."""
    GENERATE = auto()  # Generate terrain data
    MESH = auto()      # Build mesh from data
    UPLOAD = auto()    # Upload mesh to GPU
    UNLOAD = auto()    # Remove from memory/GPU


@dataclass(order=True)
class ChunkTask:
    """
    A queued chunk operation.

    Comparison is based on priority only (for heap ordering).
    Lower priority values are processed first.

    Attributes:
        priority: Task priority (lower = higher priority).
        cx: Chunk X coordinate.
        cz: Chunk Z coordinate.
        task_type: Type of operation to perform.
    """
    priority: int
    cx: int = field(compare=False)
    cz: int = field(compare=False)
    task_type: ChunkTaskType = field(compare=False)

    @property
    def key(self) -> Tuple[int, int]:
        """Get chunk coordinate tuple."""
        return (self.cx, self.cz)


class ChunkQueue:
    """
    Priority queue for chunk tasks.

    Lower priority values are processed first.
    Prevents duplicate entries for same chunk+task combination.

    Attributes:
        max_size: Maximum number of tasks allowed in queue.
    """

    __slots__ = ('_heap', '_entries', '_max_size')

    def __init__(self, max_size: int = 256):
        """
        Initialize chunk queue.

        Args:
            max_size: Maximum tasks in queue before rejecting new ones.
        """
        self._heap: List[ChunkTask] = []
        self._entries: Set[Tuple[int, int, ChunkTaskType]] = set()
        self._max_size = max_size

    def push(self, cx: int, cz: int, task_type: ChunkTaskType,
             priority: int) -> bool:
        """
        Add task to queue if not already present.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            task_type: Type of operation.
            priority: Task priority (lower = processed first).

        Returns:
            bool: True if added, False if duplicate or queue full.
        """
        entry_key = (cx, cz, task_type)

        if entry_key in self._entries:
            return False

        if len(self._heap) >= self._max_size:
            return False

        task = ChunkTask(priority=priority, cx=cx, cz=cz, task_type=task_type)
        heapq.heappush(self._heap, task)
        self._entries.add(entry_key)
        return True

    def pop(self) -> Optional[ChunkTask]:
        """
        Remove and return highest priority task.

        Handles lazy deletion by skipping tasks that were removed.

        Returns:
            ChunkTask: Highest priority task, or None if empty.
        """
        while self._heap:
            task = heapq.heappop(self._heap)
            entry_key = (task.cx, task.cz, task.task_type)

            # Skip if task was lazily removed
            if entry_key in self._entries:
                self._entries.discard(entry_key)
                return task

        return None

    def pop_batch(self, max_count: int) -> List[ChunkTask]:
        """
        Remove and return up to max_count tasks.

        Args:
            max_count: Maximum number of tasks to return.

        Returns:
            List[ChunkTask]: Up to max_count highest priority tasks.
        """
        tasks = []
        for _ in range(max_count):
            task = self.pop()
            if task is None:
                break
            tasks.append(task)
        return tasks

    def contains(self, cx: int, cz: int, task_type: ChunkTaskType) -> bool:
        """
        Check if task is in queue.

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            task_type: Type of operation.

        Returns:
            bool: True if task exists in queue.
        """
        return (cx, cz, task_type) in self._entries

    def remove(self, cx: int, cz: int, task_type: ChunkTaskType) -> bool:
        """
        Mark task as removed (lazy deletion).

        The task stays in the heap but won't be returned by pop().

        Args:
            cx: Chunk X coordinate.
            cz: Chunk Z coordinate.
            task_type: Type of operation.

        Returns:
            bool: True if task was found and removed.
        """
        entry_key = (cx, cz, task_type)
        if entry_key in self._entries:
            self._entries.discard(entry_key)
            return True
        return False

    def clear(self) -> None:
        """Remove all tasks from queue."""
        self._heap.clear()
        self._entries.clear()

    def __len__(self) -> int:
        """Return number of active tasks in queue."""
        return len(self._entries)

    @property
    def is_empty(self) -> bool:
        """Check if queue has no tasks."""
        return len(self._entries) == 0

    @property
    def max_size(self) -> int:
        """Maximum queue size."""
        return self._max_size

    @max_size.setter
    def max_size(self, value: int) -> None:
        """Set maximum queue size."""
        self._max_size = max(1, value)

    def __repr__(self) -> str:
        """String representation."""
        return f"ChunkQueue(tasks={len(self._entries)}, max={self._max_size})"

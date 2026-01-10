"""
Debug system for testing game loop.

Prints tick/frame info to verify loop timing.
"""

from .base import TickSystem, FrameSystem
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState


class DebugTickSystem(TickSystem):
    """Logs tick info for debugging."""

    __slots__ = ["log_interval", "_tick_count"]

    def __init__(self, log_interval: int = 20):
        """
        Args:
            log_interval: Ticks between log messages.
        """
        super().__init__(priority=1000)  # Run last
        self.log_interval = log_interval
        self._tick_count = 0

    def tick(self, state: "GameState", dt: float) -> None:
        self._tick_count += 1
        if self._tick_count % self.log_interval == 0:
            print(f"[Tick {state.tick_count}] "
                  f"World time: {state.world.world_time:.1f}s, "
                  f"Chunks: {state.world.chunk_count()}, "
                  f"Entities: {state.entities.count()}")


class DebugFrameSystem(FrameSystem):
    """Logs frame info for debugging."""

    __slots__ = ["log_interval", "_frame_count"]

    def __init__(self, log_interval: int = 60):
        """
        Args:
            log_interval: Frames between log messages.
        """
        super().__init__(priority=1000)
        self.log_interval = log_interval
        self._frame_count = 0

    def frame(self, state: "GameState", dt: float, alpha: float) -> None:
        self._frame_count += 1
        if self._frame_count % self.log_interval == 0:
            print(f"[Frame {self._frame_count}] "
                  f"FPS: {state.fps:.1f}, "
                  f"dt: {dt*1000:.2f}ms, "
                  f"alpha: {alpha:.3f}")

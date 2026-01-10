"""
Base system class for VoxEx ECS-lite architecture.

Systems process GameState each tick or frame.
Inherit from TickSystem for game logic, FrameSystem for rendering.

Usage:
    class PhysicsSystem(TickSystem):
        def tick(self, state: GameState, dt: float) -> None:
            # Update physics
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState


class System(ABC):
    """
    Abstract base for all systems.

    Systems are stateless processors that operate on GameState.
    """

    __slots__ = ["enabled", "priority"]

    def __init__(self, priority: int = 0):
        """
        Initialize system.

        Args:
            priority: Execution order (lower = earlier).
        """
        self.enabled = True
        self.priority = priority

    def initialize(self, state: "GameState") -> None:
        """
        Called once when game starts.

        Override to perform one-time setup.

        Args:
            state: Game state for initialization.
        """
        pass

    def shutdown(self) -> None:
        """
        Called once when game ends.

        Override to clean up resources.
        """
        pass


class TickSystem(System):
    """
    System that runs at fixed tick rate (20 TPS).

    Used for physics, AI, game logic.
    """

    @abstractmethod
    def tick(self, state: "GameState", dt: float) -> None:
        """
        Process one game tick.

        Args:
            state: Game state to update.
            dt: Fixed tick delta (typically 0.05s).
        """
        pass


class FrameSystem(System):
    """
    System that runs every frame (variable rate).

    Used for rendering, interpolation, input.
    """

    @abstractmethod
    def frame(self, state: "GameState", dt: float, alpha: float) -> None:
        """
        Process one frame.

        Args:
            state: Game state (read-only for rendering).
            dt: Frame delta time.
            alpha: Interpolation factor [0, 1) between ticks.
        """
        pass

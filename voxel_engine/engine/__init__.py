"""
VoxEx game engine core.

Provides state management, game loop, and system orchestration.
"""

from .state import (
    GameState, PlayerState, WorldState, EntityState,
    GameMode, GamePhase
)
from .loops import GameLoop, Clock, Accumulator
from .systems import System, TickSystem, FrameSystem

__all__ = [
    # State
    "GameState", "PlayerState", "WorldState", "EntityState",
    "GameMode", "GamePhase",
    # Loops
    "GameLoop", "Clock", "Accumulator",
    # Systems
    "System", "TickSystem", "FrameSystem",
]

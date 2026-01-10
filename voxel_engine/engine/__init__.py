"""
VoxEx game engine core.

Provides state management, game loop, system orchestration,
window management, and input handling.
"""

from .state import (
    GameState, PlayerState, WorldState, EntityState,
    GameMode, GamePhase
)
from .loops import GameLoop, Clock, Accumulator
from .systems import System, TickSystem, FrameSystem, InputSystem, RenderSystem
from .window import Window, Keys, MouseButtons, GLFW_AVAILABLE, MODERNGL_AVAILABLE
from .input import InputState

__all__ = [
    # State
    "GameState", "PlayerState", "WorldState", "EntityState",
    "GameMode", "GamePhase",
    # Loops
    "GameLoop", "Clock", "Accumulator",
    # Systems
    "System", "TickSystem", "FrameSystem",
    "InputSystem", "RenderSystem",
    # Window
    "Window", "Keys", "MouseButtons",
    "GLFW_AVAILABLE", "MODERNGL_AVAILABLE",
    # Input
    "InputState",
]

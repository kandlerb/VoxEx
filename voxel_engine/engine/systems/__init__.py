"""
VoxEx game systems.

Systems process GameState at fixed (tick) or variable (frame) rates.

Tick systems run at 20 TPS (fixed timestep):
- InputSystem: Samples input, updates PlayerState (priority 0)

Frame systems run every frame (variable rate):
- RenderSystem: Clears screen, renders world (priority 100)

Usage:
    from voxel_engine.engine.systems import InputSystem, RenderSystem
    from voxel_engine.engine.window import Window

    window = Window()
    game_loop.add_tick_system(InputSystem(window))
    game_loop.add_frame_system(RenderSystem(window))
"""

from .base import System, TickSystem, FrameSystem
from .input_system import InputSystem
from .render_system import RenderSystem

__all__ = [
    "System",
    "TickSystem",
    "FrameSystem",
    "InputSystem",
    "RenderSystem",
]

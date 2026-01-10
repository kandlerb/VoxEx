"""
VoxEx game systems.

Systems process GameState at fixed (tick) or variable (frame) rates.

Tick systems run at 20 TPS (fixed timestep):
- InputSystem: Samples input, updates PlayerState (priority 0)
- PhysicsSystem: Movement and collision (priority 10)

Frame systems run every frame (variable rate):
- RenderSystem: Clears screen, renders world (priority 100)

Usage:
    from voxel_engine.engine.systems import InputSystem, PhysicsSystem, RenderSystem
    from voxel_engine.engine.window import Window

    window = Window()
    game_loop.add_tick_system(InputSystem(window))
    game_loop.add_tick_system(PhysicsSystem())
    game_loop.add_frame_system(RenderSystem(window))
"""

from .base import System, TickSystem, FrameSystem
from .input_system import InputSystem
from .physics_system import PhysicsSystem
from .render_system import RenderSystem

__all__ = [
    "System",
    "TickSystem",
    "FrameSystem",
    "InputSystem",
    "PhysicsSystem",
    "RenderSystem",
]

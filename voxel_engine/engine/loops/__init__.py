"""
VoxEx game loop system.

Provides fixed-timestep game logic and variable-rate rendering.

Usage:
    from voxel_engine.engine.loops import GameLoop, Clock, Accumulator

    loop = GameLoop(state, tick_rate=20, target_fps=60)
    loop.add_tick_system(PhysicsSystem())
    loop.run()
"""

from .clock import Clock, Accumulator
from .game_loop import GameLoop

__all__ = ["Clock", "Accumulator", "GameLoop"]

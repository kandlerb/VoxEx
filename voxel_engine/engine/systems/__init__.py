"""
VoxEx game systems.

Systems process GameState at fixed (tick) or variable (frame) rates.
"""

from .base import System, TickSystem, FrameSystem

__all__ = ["System", "TickSystem", "FrameSystem"]

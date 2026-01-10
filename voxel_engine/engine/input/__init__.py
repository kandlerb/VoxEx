"""
VoxEx input state management.

Provides input state snapshots for deterministic input handling.
InputState captures keyboard/mouse state at a point in time.

Usage:
    from voxel_engine.engine.input import InputState
    from voxel_engine.engine.window import Window

    window = Window()
    input_state = InputState.from_window(window)

    if input_state.move_forward:
        # Handle forward movement
"""

from .input_state import InputState

__all__ = [
    "InputState",
]

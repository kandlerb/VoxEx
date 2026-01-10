"""
Input system for VoxEx.

Samples input from Window and updates PlayerState each tick.
Runs with priority 0 (first in tick order) so other systems see current input.

Usage:
    from voxel_engine.engine.systems import InputSystem
    from voxel_engine.engine.window import Window

    window = Window()
    input_system = InputSystem(window, sensitivity=0.002)
    game_loop.add_tick_system(input_system)
"""

import numpy as np
from typing import TYPE_CHECKING, Optional

from .base import TickSystem

if TYPE_CHECKING:
    from voxel_engine.engine.state import GameState
    from voxel_engine.engine.window.window import Window
    from voxel_engine.engine.input.input_state import InputState


class InputSystem(TickSystem):
    """
    Processes input and updates PlayerState each tick.

    Samples keyboard/mouse state from Window and applies to PlayerState.
    Handles mouse look sensitivity and pitch clamping.
    Detects double-tap jump for flight toggle.

    Priority: 0 (runs first, before physics/movement systems)
    """

    __slots__ = (
        '_window', '_prev_input', '_sensitivity',
        '_last_jump_time', '_double_tap_threshold'
    )

    # Pitch limits (radians) - prevent camera flip
    PITCH_MIN: float = -np.pi / 2 + 0.01  # Just above -90 degrees
    PITCH_MAX: float = np.pi / 2 - 0.01   # Just below +90 degrees

    def __init__(
        self,
        window: "Window",
        sensitivity: float = 0.002,
        double_tap_threshold: float = 0.3
    ):
        """
        Initialize input system.

        Args:
            window: Window to read input from.
            sensitivity: Mouse sensitivity multiplier.
            double_tap_threshold: Max time between jumps for flight toggle.
        """
        super().__init__(priority=0)
        self._window = window
        self._prev_input: Optional["InputState"] = None
        self._sensitivity = sensitivity
        self._last_jump_time = -1.0  # Negative = never jumped
        self._double_tap_threshold = double_tap_threshold

    def initialize(self, state: "GameState") -> None:
        """
        Initialize input system.

        Args:
            state: Game state for initialization.
        """
        # Capture cursor for FPS controls
        if self._window is not None:
            self._window.set_cursor_captured(True)

    def shutdown(self) -> None:
        """Clean up input system."""
        # Release cursor on shutdown
        if self._window is not None:
            self._window.set_cursor_captured(False)

    def tick(self, state: "GameState", dt: float) -> None:
        """
        Sample input and update player state.

        Args:
            state: Game state to update.
            dt: Fixed tick delta time.
        """
        if self._window is None:
            return

        from voxel_engine.engine.input.input_state import InputState

        # Create input snapshot
        input_state = InputState.from_window(self._window, self._prev_input)

        # Update player state from input
        player = state.player

        # Reset movement intent flags before applying new input
        player.reset_movement_intent()

        # Movement input (held keys)
        player.move_forward = input_state.move_forward
        player.move_backward = input_state.move_backward
        player.move_left = input_state.move_left
        player.move_right = input_state.move_right
        player.jump_pressed = input_state.jump
        player.crouch_pressed = input_state.crouch
        player.sprint_pressed = input_state.sprint

        # Block interaction input (mouse buttons)
        player.input_primary_action = input_state.primary_action
        player.input_secondary_action = input_state.secondary_action

        # Mouse look - apply sensitivity and update yaw/pitch
        if input_state.mouse_dx != 0.0 or input_state.mouse_dy != 0.0:
            player.yaw -= input_state.mouse_dx * self._sensitivity
            player.pitch -= input_state.mouse_dy * self._sensitivity

            # Clamp pitch to prevent camera flip
            player.pitch = np.clip(player.pitch, self.PITCH_MIN, self.PITCH_MAX)

            # Normalize yaw to [0, 2*pi)
            player.yaw = player.yaw % (2 * np.pi)

        # Flight toggle (double-tap jump)
        self._handle_flight_toggle(state, input_state, dt)

        # Torch toggle
        if input_state.toggle_torch:
            player.torch_active = not player.torch_active

        # Hotbar selection
        if input_state.hotbar_slot >= 0:
            player.selected_slot = input_state.hotbar_slot

        # Debug overlay toggle
        if input_state.toggle_debug:
            state.debug_overlay = not state.debug_overlay

        # Pause toggle
        if input_state.pause:
            state.toggle_pause()

        # Window close check
        if self._window.should_close:
            state.should_quit = True

        # Store for next tick's edge detection
        self._prev_input = input_state

    def _handle_flight_toggle(
        self,
        state: "GameState",
        input_state: "InputState",
        dt: float
    ) -> None:
        """
        Handle double-tap jump for flight toggle.

        Flight can only be toggled in creative/spectator mode.

        Args:
            state: Game state.
            input_state: Current input snapshot.
            dt: Tick delta time.
        """
        from voxel_engine.engine.state import GameMode

        player = state.player

        # Only allow flight toggle in creative/spectator
        if state.mode not in (GameMode.CREATIVE, GameMode.SPECTATOR):
            return

        # Detect jump press edge (just pressed this tick)
        jump_just_pressed = (
            input_state.jump and
            (self._prev_input is None or not self._prev_input.jump)
        )

        if jump_just_pressed:
            current_time = state.total_time

            # Check for double-tap
            if self._last_jump_time >= 0:
                time_since_last = current_time - self._last_jump_time
                if time_since_last <= self._double_tap_threshold:
                    # Double-tap detected - toggle flight
                    player.is_flying = not player.is_flying
                    self._last_jump_time = -1.0  # Reset to prevent triple-tap
                    return

            self._last_jump_time = current_time

    @property
    def sensitivity(self) -> float:
        """Get current mouse sensitivity."""
        return self._sensitivity

    @sensitivity.setter
    def sensitivity(self, value: float) -> None:
        """Set mouse sensitivity."""
        self._sensitivity = max(0.0001, value)  # Prevent zero/negative

    @property
    def double_tap_threshold(self) -> float:
        """Get double-tap threshold for flight toggle."""
        return self._double_tap_threshold

    @double_tap_threshold.setter
    def double_tap_threshold(self, value: float) -> None:
        """Set double-tap threshold for flight toggle."""
        self._double_tap_threshold = max(0.1, min(1.0, value))

"""
Input state snapshot for VoxEx.

Provides an immutable snapshot of input state for a single tick.
Systems read InputState; InputSystem writes to PlayerState.

Usage:
    from voxel_engine.engine.input import InputState
    from voxel_engine.engine.window import Window, Keys

    # Sample current input
    input_state = InputState.from_window(window, prev_input)

    # Check movement
    if input_state.move_forward:
        # Apply forward movement
"""

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from voxel_engine.engine.window.window import Window


class InputState:
    """
    Snapshot of input state for a single tick.

    Created by sampling Window input each tick. Read-only after creation.
    Toggle detection requires previous InputState for edge detection.
    """

    __slots__ = (
        # Movement (held keys)
        'move_forward', 'move_backward', 'move_left', 'move_right',
        # Actions (held keys/buttons)
        'jump', 'crouch', 'sprint',
        'primary_action', 'secondary_action',
        # Mouse look (delta since last tick)
        'mouse_dx', 'mouse_dy',
        # UI toggles (edge-triggered)
        'hotbar_slot',
        'toggle_flight', 'toggle_torch', 'toggle_inventory',
        'toggle_debug', 'pause',
        # Quick save/load
        'quick_save', 'quick_load'
    )

    def __init__(self) -> None:
        """Initialize with safe defaults (no input)."""
        # Movement (bool - held state)
        self.move_forward: bool = False
        self.move_backward: bool = False
        self.move_left: bool = False
        self.move_right: bool = False

        # Actions (bool - held state)
        self.jump: bool = False
        self.crouch: bool = False
        self.sprint: bool = False
        self.primary_action: bool = False    # Left click - mine
        self.secondary_action: bool = False  # Right click - place

        # Mouse look (float - delta since last tick)
        self.mouse_dx: float = 0.0
        self.mouse_dy: float = 0.0

        # UI (edge-triggered toggles)
        self.hotbar_slot: int = -1  # -1 = no change, 0-8 = select slot
        self.toggle_flight: bool = False     # Double-tap jump
        self.toggle_torch: bool = False      # F key pressed
        self.toggle_inventory: bool = False  # E key pressed
        self.toggle_debug: bool = False      # ~ key pressed
        self.pause: bool = False             # ESC key pressed

        # Quick save/load (edge-triggered)
        self.quick_save: bool = False  # F5
        self.quick_load: bool = False  # F9

    @classmethod
    def from_window(
        cls,
        window: "Window",
        prev_state: Optional["InputState"] = None
    ) -> "InputState":
        """
        Create InputState by sampling current window input.

        Args:
            window: Window to sample input from.
            prev_state: Previous tick's InputState for edge detection.

        Returns:
            InputState: New snapshot of current input.
        """
        from voxel_engine.engine.window.keys import Keys, MouseButtons

        state = cls()

        # Sample movement keys (held state)
        state.move_forward = window.get_key(Keys.W)
        state.move_backward = window.get_key(Keys.S)
        state.move_left = window.get_key(Keys.A)
        state.move_right = window.get_key(Keys.D)

        # Sample action keys (held state)
        state.jump = window.get_key(Keys.SPACE)
        state.crouch = window.get_key(Keys.C)
        state.sprint = window.get_key(Keys.LEFT_SHIFT) or window.get_key(Keys.RIGHT_SHIFT)
        state.primary_action = window.get_mouse_button(MouseButtons.LEFT)
        state.secondary_action = window.get_mouse_button(MouseButtons.RIGHT)

        # Mouse delta
        dx, dy = window.get_mouse_delta()
        state.mouse_dx = dx
        state.mouse_dy = dy

        # Edge detection for toggles (pressed this tick, not last)
        def just_pressed(key: int) -> bool:
            """Check if key was just pressed (edge detection)."""
            current = window.get_key(key)
            if prev_state is None:
                return current
            # Key is pressed now, wasn't pressed last tick
            return current and not _was_key_pressed(prev_state, key)

        def just_pressed_button(button: int) -> bool:
            """Check if mouse button was just pressed (edge detection)."""
            current = window.get_mouse_button(button)
            if prev_state is None:
                return current
            return current and not _was_button_pressed(prev_state, button)

        # Toggle detection
        state.toggle_torch = just_pressed(Keys.F)
        state.toggle_inventory = just_pressed(Keys.E)
        state.toggle_debug = just_pressed(Keys.GRAVE_ACCENT)
        state.pause = just_pressed(Keys.ESCAPE)
        state.quick_save = just_pressed(Keys.F5)
        state.quick_load = just_pressed(Keys.F9)

        # Hotbar slot selection (number keys 1-9)
        for key in range(Keys.KEY_1, Keys.KEY_9 + 1):
            if just_pressed(key):
                state.hotbar_slot = Keys.get_hotbar_slot(key)
                break

        # Double-tap jump for flight toggle
        # This is typically handled by InputSystem with timing logic
        # For now, we just pass the jump state

        return state


def _was_key_pressed(prev_state: "InputState", key: int) -> bool:
    """
    Check if a key was pressed in the previous state.

    Helper for edge detection. Maps key codes to InputState fields.

    Args:
        prev_state: Previous tick's InputState.
        key: GLFW key code.

    Returns:
        bool: True if key was pressed last tick.
    """
    from voxel_engine.engine.window.keys import Keys

    # Map key codes to InputState boolean fields
    key_map = {
        Keys.W: 'move_forward',
        Keys.S: 'move_backward',
        Keys.A: 'move_left',
        Keys.D: 'move_right',
        Keys.SPACE: 'jump',
        Keys.C: 'crouch',
        Keys.F: 'toggle_torch',
        Keys.E: 'toggle_inventory',
        Keys.GRAVE_ACCENT: 'toggle_debug',
        Keys.ESCAPE: 'pause',
        Keys.F5: 'quick_save',
        Keys.F9: 'quick_load',
    }

    # For shift keys, check sprint
    if key in (Keys.LEFT_SHIFT, Keys.RIGHT_SHIFT):
        return prev_state.sprint

    field = key_map.get(key)
    if field:
        return getattr(prev_state, field, False)

    # For number keys, check if hotbar was selected
    if Keys.KEY_1 <= key <= Keys.KEY_9:
        slot = Keys.get_hotbar_slot(key)
        return prev_state.hotbar_slot == slot

    return False


def _was_button_pressed(prev_state: "InputState", button: int) -> bool:
    """
    Check if a mouse button was pressed in the previous state.

    Args:
        prev_state: Previous tick's InputState.
        button: GLFW mouse button code.

    Returns:
        bool: True if button was pressed last tick.
    """
    from voxel_engine.engine.window.keys import MouseButtons

    if button == MouseButtons.LEFT:
        return prev_state.primary_action
    if button == MouseButtons.RIGHT:
        return prev_state.secondary_action

    return False

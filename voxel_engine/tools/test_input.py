"""
Tests for window and input systems.

Tests key constants, input state, and system behavior.
Window creation tests are skipped if no display is available.

Usage:
    python -m pytest voxel_engine/tools/test_input.py -v
    python voxel_engine/tools/test_input.py  # Direct execution
"""

import sys
import numpy as np
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def test_keys_constants():
    """Verify key constants are defined."""
    from voxel_engine.engine.window import Keys, MouseButtons

    # Movement keys
    assert hasattr(Keys, 'W')
    assert hasattr(Keys, 'A')
    assert hasattr(Keys, 'S')
    assert hasattr(Keys, 'D')

    # Action keys
    assert hasattr(Keys, 'SPACE')
    assert hasattr(Keys, 'LEFT_SHIFT')
    assert hasattr(Keys, 'C')
    assert hasattr(Keys, 'F')
    assert hasattr(Keys, 'E')

    # Special keys
    assert hasattr(Keys, 'ESCAPE')
    assert hasattr(Keys, 'F5')
    assert hasattr(Keys, 'F9')
    assert hasattr(Keys, 'GRAVE_ACCENT')

    # Number keys
    assert hasattr(Keys, 'KEY_1')
    assert hasattr(Keys, 'KEY_9')

    # Mouse buttons
    assert hasattr(MouseButtons, 'LEFT')
    assert hasattr(MouseButtons, 'RIGHT')
    assert hasattr(MouseButtons, 'MIDDLE')


def test_keys_hotbar_slot():
    """Test hotbar slot conversion from key codes."""
    from voxel_engine.engine.window import Keys

    # Valid number keys map to slots 0-8
    assert Keys.get_hotbar_slot(Keys.KEY_1) == 0
    assert Keys.get_hotbar_slot(Keys.KEY_5) == 4
    assert Keys.get_hotbar_slot(Keys.KEY_9) == 8

    # Non-number keys return -1
    assert Keys.get_hotbar_slot(Keys.W) == -1
    assert Keys.get_hotbar_slot(Keys.SPACE) == -1


def test_input_state_defaults():
    """InputState initializes with safe defaults."""
    from voxel_engine.engine.input import InputState

    state = InputState()

    # Movement defaults to False
    assert state.move_forward is False
    assert state.move_backward is False
    assert state.move_left is False
    assert state.move_right is False

    # Actions default to False
    assert state.jump is False
    assert state.crouch is False
    assert state.sprint is False
    assert state.primary_action is False
    assert state.secondary_action is False

    # Mouse delta defaults to 0
    assert state.mouse_dx == 0.0
    assert state.mouse_dy == 0.0

    # Hotbar slot defaults to -1 (no change)
    assert state.hotbar_slot == -1

    # Toggles default to False
    assert state.toggle_flight is False
    assert state.toggle_torch is False
    assert state.toggle_inventory is False
    assert state.toggle_debug is False
    assert state.pause is False


def test_input_state_slots():
    """InputState uses __slots__ for memory efficiency."""
    from voxel_engine.engine.input import InputState

    state = InputState()

    # Should have __slots__ defined
    assert hasattr(InputState, '__slots__')

    # Should not allow arbitrary attribute assignment
    try:
        state.random_attribute = True
        has_slots = False
    except AttributeError:
        has_slots = True

    assert has_slots, "InputState should use __slots__ to prevent arbitrary attributes"


def test_input_system_priority():
    """InputSystem has priority 0 (runs first)."""
    from voxel_engine.engine.systems import InputSystem

    # Create with mock window (None)
    system = InputSystem(window=None)

    assert system.priority == 0
    assert system.enabled is True


def test_input_system_sensitivity():
    """InputSystem sensitivity can be configured."""
    from voxel_engine.engine.systems import InputSystem

    system = InputSystem(window=None, sensitivity=0.005)

    assert system.sensitivity == 0.005

    # Test setter
    system.sensitivity = 0.001
    assert system.sensitivity == 0.001

    # Test minimum clamping
    system.sensitivity = 0.0
    assert system.sensitivity > 0.0  # Should clamp to minimum


def test_render_system_priority():
    """RenderSystem has high priority (runs last)."""
    from voxel_engine.engine.systems import RenderSystem

    system = RenderSystem(window=None)

    assert system.priority == 100
    assert system.enabled is True


def test_player_state_input_fields():
    """PlayerState has input tracking fields."""
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()

    # Movement flags
    assert hasattr(player, 'move_forward')
    assert hasattr(player, 'move_backward')
    assert hasattr(player, 'move_left')
    assert hasattr(player, 'move_right')

    # Action flags
    assert hasattr(player, 'jump_pressed')
    assert hasattr(player, 'crouch_pressed')
    assert hasattr(player, 'sprint_pressed')

    # Look direction
    assert hasattr(player, 'yaw')
    assert hasattr(player, 'pitch')

    # State flags
    assert hasattr(player, 'is_flying')
    assert hasattr(player, 'torch_active')
    assert hasattr(player, 'selected_slot')


def test_player_state_vectors_are_numpy():
    """PlayerState position/velocity are NumPy arrays."""
    from voxel_engine.engine.state import PlayerState

    player = PlayerState()

    assert isinstance(player.position, np.ndarray)
    assert isinstance(player.velocity, np.ndarray)
    assert isinstance(player.prev_position, np.ndarray)

    assert player.position.dtype == np.float64
    assert len(player.position) == 3


def test_pitch_clamping():
    """Pitch is clamped to prevent camera flip."""
    from voxel_engine.engine.state import PlayerState
    from voxel_engine.engine.systems import InputSystem

    player = PlayerState()

    # Get pitch limits from InputSystem
    pitch_min = InputSystem.PITCH_MIN
    pitch_max = InputSystem.PITCH_MAX

    # Simulate looking up past limit
    player.pitch = 2.0  # Over 90 degrees
    player.pitch = np.clip(player.pitch, pitch_min, pitch_max)
    assert player.pitch < np.pi / 2

    # Simulate looking down past limit
    player.pitch = -2.0  # Below -90 degrees
    player.pitch = np.clip(player.pitch, pitch_min, pitch_max)
    assert player.pitch > -np.pi / 2


def test_system_inheritance():
    """InputSystem and RenderSystem inherit from correct base classes."""
    from voxel_engine.engine.systems import (
        System, TickSystem, FrameSystem,
        InputSystem, RenderSystem
    )

    # InputSystem should be a TickSystem
    assert issubclass(InputSystem, TickSystem)
    assert issubclass(InputSystem, System)

    # RenderSystem should be a FrameSystem
    assert issubclass(RenderSystem, FrameSystem)
    assert issubclass(RenderSystem, System)


def test_render_system_sky_colors():
    """RenderSystem has sky color constants."""
    from voxel_engine.engine.systems import RenderSystem

    # Check color constants exist
    assert hasattr(RenderSystem, 'SKY_DAY')
    assert hasattr(RenderSystem, 'SKY_SUNSET')
    assert hasattr(RenderSystem, 'SKY_NIGHT')

    # Colors should be RGBA tuples
    assert len(RenderSystem.SKY_DAY) == 4
    assert len(RenderSystem.SKY_SUNSET) == 4
    assert len(RenderSystem.SKY_NIGHT) == 4


def test_render_system_color_lerp():
    """RenderSystem color interpolation works correctly."""
    from voxel_engine.engine.systems import RenderSystem

    c1 = (0.0, 0.0, 0.0, 1.0)
    c2 = (1.0, 1.0, 1.0, 1.0)

    # t=0 should return c1
    result = RenderSystem._lerp_color(c1, c2, 0.0)
    assert result == c1

    # t=1 should return c2
    result = RenderSystem._lerp_color(c1, c2, 1.0)
    assert result == c2

    # t=0.5 should return midpoint
    result = RenderSystem._lerp_color(c1, c2, 0.5)
    assert abs(result[0] - 0.5) < 0.001
    assert abs(result[1] - 0.5) < 0.001
    assert abs(result[2] - 0.5) < 0.001


def test_glfw_availability_flag():
    """GLFW availability flag is exported."""
    from voxel_engine.engine.window import GLFW_AVAILABLE

    # Should be a boolean
    assert isinstance(GLFW_AVAILABLE, bool)


def test_moderngl_availability_flag():
    """ModernGL availability flag is exported."""
    from voxel_engine.engine.window import MODERNGL_AVAILABLE

    # Should be a boolean
    assert isinstance(MODERNGL_AVAILABLE, bool)


# ============================================================================
# Integration tests (require display - skip in CI)
# ============================================================================

def test_window_creation():
    """Window creates valid ModernGL context."""
    try:
        import glfw
        import moderngl
    except ImportError:
        print("SKIP: GLFW/ModernGL not installed")
        return

    from voxel_engine.engine.window import Window

    try:
        window = Window(width=800, height=600, title="Test Window")

        # Check properties
        assert window.ctx is not None
        assert window.width == 800
        assert window.height == 600
        assert window.should_close is False

        # Clean up
        window.close()

    except RuntimeError as e:
        # No display available (headless environment)
        print(f"SKIP: No display available - {e}")


def test_window_input_polling():
    """Window input polling works correctly."""
    try:
        import glfw
        import moderngl
    except ImportError:
        print("SKIP: GLFW/ModernGL not installed")
        return

    from voxel_engine.engine.window import Window, Keys, MouseButtons

    try:
        window = Window(width=800, height=600, title="Test Input")

        # Poll events
        window.poll_events()

        # Check key state (all should be False initially)
        assert window.get_key(Keys.W) is False
        assert window.get_key(Keys.SPACE) is False

        # Check mouse state
        assert window.get_mouse_button(MouseButtons.LEFT) is False

        # Check mouse position returns tuple
        pos = window.get_mouse_position()
        assert isinstance(pos, tuple)
        assert len(pos) == 2

        # Check mouse delta returns tuple
        delta = window.get_mouse_delta()
        assert isinstance(delta, tuple)
        assert len(delta) == 2

        window.close()

    except RuntimeError as e:
        print(f"SKIP: No display available - {e}")


def test_window_cursor_capture():
    """Window cursor capture works."""
    try:
        import glfw
        import moderngl
    except ImportError:
        print("SKIP: GLFW/ModernGL not installed")
        return

    from voxel_engine.engine.window import Window

    try:
        window = Window(width=800, height=600, title="Test Cursor")

        # Initially not captured
        assert window.cursor_captured is False

        # Capture cursor
        window.set_cursor_captured(True)
        assert window.cursor_captured is True

        # Release cursor
        window.set_cursor_captured(False)
        assert window.cursor_captured is False

        window.close()

    except RuntimeError as e:
        print(f"SKIP: No display available - {e}")


def test_window_context_manager():
    """Window works as context manager."""
    try:
        import glfw
        import moderngl
    except ImportError:
        print("SKIP: GLFW/ModernGL not installed")
        return

    from voxel_engine.engine.window import Window

    try:
        with Window(width=640, height=480, title="Context Test") as window:
            assert window.ctx is not None
            assert window.width == 640
            window.poll_events()

        # After context exit, window should be cleaned up
        # (can't easily verify this, but no exception means success)

    except RuntimeError as e:
        print(f"SKIP: No display available - {e}")


# ============================================================================
# Main execution
# ============================================================================

if __name__ == '__main__':
    print("Running input system tests...\n")

    tests = [
        test_keys_constants,
        test_keys_hotbar_slot,
        test_input_state_defaults,
        test_input_state_slots,
        test_input_system_priority,
        test_input_system_sensitivity,
        test_render_system_priority,
        test_player_state_input_fields,
        test_player_state_vectors_are_numpy,
        test_pitch_clamping,
        test_system_inheritance,
        test_render_system_sky_colors,
        test_render_system_color_lerp,
        test_glfw_availability_flag,
        test_moderngl_availability_flag,
        # Integration tests
        test_window_creation,
        test_window_input_polling,
        test_window_cursor_capture,
        test_window_context_manager,
    ]

    passed = 0
    failed = 0
    skipped = 0

    for test in tests:
        try:
            print(f"  {test.__name__}...", end=" ")
            test()
            print("PASSED")
            passed += 1
        except AssertionError as e:
            print(f"FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)

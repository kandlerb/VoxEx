"""Tests for UI system.

Tests pure Python components of the UI system.
ModernGL-dependent components (BitmapFont, UIRenderer) are tested separately
when running with OpenGL support.
"""
import numpy as np
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_orthographic_matrix_shape():
    """Orthographic matrix is 4x4."""
    from engine.ui.orthographic import orthographic_matrix
    mat = orthographic_matrix(1920, 1080)
    assert mat.shape == (4, 4)
    assert mat.dtype == np.float32


def test_orthographic_corners():
    """Orthographic matrix maps corners correctly."""
    from engine.ui.orthographic import orthographic_matrix
    mat = orthographic_matrix(800, 600)

    # Matrix is stored for GLSL column-major, use transpose for NumPy testing
    mat_np = mat.T

    # Top-left (0, 0) should map to (-1, 1)
    tl = mat_np @ np.array([0, 0, 0, 1], dtype=np.float32)
    assert abs(tl[0] - (-1)) < 0.01, f"Expected -1, got {tl[0]}"
    assert abs(tl[1] - 1) < 0.01, f"Expected 1, got {tl[1]}"

    # Bottom-right (800, 600) should map to (1, -1)
    br = mat_np @ np.array([800, 600, 0, 1], dtype=np.float32)
    assert abs(br[0] - 1) < 0.01, f"Expected 1, got {br[0]}"
    assert abs(br[1] - (-1)) < 0.01, f"Expected -1, got {br[1]}"


def test_orthographic_center():
    """Orthographic matrix maps center correctly."""
    from engine.ui.orthographic import orthographic_matrix
    mat = orthographic_matrix(800, 600)

    # Matrix is stored for GLSL column-major, use transpose for NumPy testing
    mat_np = mat.T

    # Center (400, 300) should map to (0, 0)
    center = mat_np @ np.array([400, 300, 0, 1], dtype=np.float32)
    assert abs(center[0]) < 0.01, f"Expected 0, got {center[0]}"
    assert abs(center[1]) < 0.01, f"Expected 0, got {center[1]}"


def test_crosshair_defaults():
    """Crosshair has sensible defaults."""
    from engine.ui.constants import CROSSHAIR_SIZE
    from engine.ui.hud import Crosshair
    ch = Crosshair()
    assert ch._size == CROSSHAIR_SIZE


def test_crosshair_custom():
    """Crosshair accepts custom parameters."""
    from engine.ui.hud import Crosshair
    ch = Crosshair(size=30, thickness=4, color=(255, 0, 0, 255))
    assert ch._size == 30
    assert ch._thickness == 4
    assert ch._color == (255, 0, 0, 255)


def test_hotbar_slot_bounds():
    """Hotbar clamps slot selection."""
    from engine.ui.hud import Hotbar

    hotbar = Hotbar()

    hotbar.set_selected(-5)
    assert hotbar._selected == 0

    hotbar.set_selected(100)
    assert hotbar._selected == 8

    hotbar.set_selected(4)
    assert hotbar._selected == 4


def test_hotbar_block_ids():
    """Hotbar returns correct block IDs."""
    from engine.ui.hud import Hotbar

    hotbar = Hotbar()

    # Default hotbar has 9 blocks
    assert len(hotbar._block_ids) == 9

    # Get valid slot
    assert hotbar.get_block_id(0) == 1  # First block
    assert hotbar.get_block_id(8) == 10  # Last block

    # Get invalid slot
    assert hotbar.get_block_id(-1) == 0
    assert hotbar.get_block_id(100) == 0


def test_debug_overlay_toggle():
    """Debug overlay toggles visibility."""
    from engine.ui.hud import DebugOverlay

    debug = DebugOverlay()
    assert debug.visible is False

    debug.toggle()
    assert debug.visible is True

    debug.toggle()
    assert debug.visible is False


def test_debug_overlay_setter():
    """Debug overlay visibility setter works."""
    from engine.ui.hud import DebugOverlay

    debug = DebugOverlay()
    debug.visible = True
    assert debug.visible is True

    debug.visible = False
    assert debug.visible is False


def test_pause_menu_buttons():
    """Pause menu creates buttons."""
    from engine.ui.pause_menu import PauseMenu, MenuAction

    menu = PauseMenu()
    assert menu.visible is False

    menu.show(1920, 1080)
    assert menu.visible is True
    assert len(menu._buttons) == 3

    # Check button actions
    actions = [b.action for b in menu._buttons]
    assert MenuAction.RESUME in actions
    assert MenuAction.SETTINGS in actions
    assert MenuAction.QUIT in actions

    menu.hide()
    assert menu.visible is False
    assert len(menu._buttons) == 0


def test_button_contains():
    """Button hit detection works."""
    from engine.ui.pause_menu import Button, MenuAction

    btn = Button("Test", 100, 100, 200, 50, MenuAction.RESUME)

    assert btn.contains(150, 125) is True   # Inside
    assert btn.contains(50, 125) is False   # Left
    assert btn.contains(350, 125) is False  # Right
    assert btn.contains(150, 50) is False   # Above
    assert btn.contains(150, 200) is False  # Below

    # Edge cases (on boundary)
    assert btn.contains(100, 100) is True   # Top-left corner
    assert btn.contains(300, 150) is True   # Bottom-right corner


def test_button_hover():
    """Button hover state works."""
    from engine.ui.pause_menu import Button, MenuAction

    btn = Button("Test", 100, 100, 200, 50, MenuAction.RESUME)

    assert btn.hovered is False

    btn.hovered = True
    assert btn.hovered is True


def test_menu_action_enum():
    """MenuAction enum has expected values."""
    from engine.ui.pause_menu import MenuAction

    assert MenuAction.NONE is not None
    assert MenuAction.RESUME is not None
    assert MenuAction.SETTINGS is not None
    assert MenuAction.QUIT is not None

    # Values are unique
    assert MenuAction.NONE != MenuAction.RESUME
    assert MenuAction.RESUME != MenuAction.QUIT


def test_pause_menu_click():
    """Pause menu click detection works."""
    from engine.ui.pause_menu import PauseMenu, MenuAction

    menu = PauseMenu()
    menu.show(800, 600)

    # Find the resume button position
    resume_btn = menu._buttons[0]
    center_x = resume_btn.x + resume_btn.width / 2
    center_y = resume_btn.y + resume_btn.height / 2

    # Click on button
    action = menu.click(center_x, center_y)
    assert action == MenuAction.RESUME

    # Click outside buttons
    action = menu.click(0, 0)
    assert action == MenuAction.NONE


def test_pause_menu_hover_update():
    """Pause menu updates hover states."""
    from engine.ui.pause_menu import PauseMenu

    menu = PauseMenu()
    menu.show(800, 600)

    resume_btn = menu._buttons[0]
    center_x = resume_btn.x + resume_btn.width / 2
    center_y = resume_btn.y + resume_btn.height / 2

    # Initially not hovered
    assert resume_btn.hovered is False

    # Update with mouse over button
    menu.update_mouse(center_x, center_y)
    assert resume_btn.hovered is True

    # Update with mouse away
    menu.update_mouse(0, 0)
    assert resume_btn.hovered is False


def test_bitmap_font_char_data():
    """Bitmap font has character data."""
    from engine.ui.bitmap_font import FONT_DATA

    # Check essential characters exist
    assert ' ' in FONT_DATA
    assert '0' in FONT_DATA
    assert '9' in FONT_DATA
    assert 'A' in FONT_DATA
    assert 'Z' in FONT_DATA
    assert 'a' in FONT_DATA
    assert 'z' in FONT_DATA
    assert '.' in FONT_DATA
    assert ':' in FONT_DATA

    # Each char is 8 bytes
    assert len(FONT_DATA['A']) == 8
    assert len(FONT_DATA['0']) == 8


def test_font_data_has_letters():
    """Bitmap font has all uppercase letters."""
    from engine.ui.bitmap_font import FONT_DATA

    for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
        assert c in FONT_DATA, f"Missing uppercase letter: {c}"


def test_font_data_has_digits():
    """Bitmap font has all digits."""
    from engine.ui.bitmap_font import FONT_DATA

    for c in '0123456789':
        assert c in FONT_DATA, f"Missing digit: {c}"


def test_constants_defined():
    """UI constants are defined with expected types."""
    from engine.ui.constants import (
        CROSSHAIR_SIZE, CROSSHAIR_THICKNESS, CROSSHAIR_COLOR,
        HOTBAR_SLOTS, HOTBAR_SLOT_SIZE, MENU_BUTTON_WIDTH
    )

    assert isinstance(CROSSHAIR_SIZE, int)
    assert isinstance(CROSSHAIR_THICKNESS, int)
    assert isinstance(CROSSHAIR_COLOR, tuple)
    assert len(CROSSHAIR_COLOR) == 4  # RGBA

    assert isinstance(HOTBAR_SLOTS, int)
    assert HOTBAR_SLOTS == 9

    assert isinstance(HOTBAR_SLOT_SIZE, int)
    assert isinstance(MENU_BUTTON_WIDTH, int)


def test_shaders_defined():
    """UI shaders are defined."""
    from engine.ui.shaders import (
        UI_VERTEX_SHADER, UI_FRAGMENT_SHADER,
        SOLID_VERTEX_SHADER, SOLID_FRAGMENT_SHADER,
        TEXT_VERTEX_SHADER, TEXT_FRAGMENT_SHADER
    )

    # Check shaders have content
    assert len(UI_VERTEX_SHADER) > 100
    assert len(UI_FRAGMENT_SHADER) > 100
    assert len(SOLID_VERTEX_SHADER) > 50
    assert len(SOLID_FRAGMENT_SHADER) > 50
    assert len(TEXT_VERTEX_SHADER) > 100
    assert len(TEXT_FRAGMENT_SHADER) > 50

    # Check shaders have version directive
    assert '#version 330' in UI_VERTEX_SHADER
    assert '#version 330' in SOLID_FRAGMENT_SHADER


def run_tests():
    """Run all tests and report results."""
    import traceback

    tests = [
        test_orthographic_matrix_shape,
        test_orthographic_corners,
        test_orthographic_center,
        test_crosshair_defaults,
        test_crosshair_custom,
        test_hotbar_slot_bounds,
        test_hotbar_block_ids,
        test_debug_overlay_toggle,
        test_debug_overlay_setter,
        test_pause_menu_buttons,
        test_button_contains,
        test_button_hover,
        test_menu_action_enum,
        test_pause_menu_click,
        test_pause_menu_hover_update,
        test_bitmap_font_char_data,
        test_font_data_has_letters,
        test_font_data_has_digits,
        test_constants_defined,
        test_shaders_defined,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            print(f"  PASS: {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {test.__name__}")
            print(f"        {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {test.__name__}")
            print(f"         {e}")
            traceback.print_exc()
            failed += 1

    print()
    print(f"Results: {passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    print("Running UI System Tests")
    print("=" * 40)
    success = run_tests()
    sys.exit(0 if success else 1)

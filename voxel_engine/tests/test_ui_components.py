"""UI component unit tests for VoxEx.

Tests individual UI components in isolation to verify:
- Initialization and default values
- State changes
- Input handling (clicks, keys)
- Value getting/setting
- Bounds checking

Uses test_helpers to load modules directly, bypassing engine/__init__.py
which requires numpy.
"""

import sys
import os

# Get directory paths
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PACKAGE_DIR = os.path.dirname(TESTS_DIR)  # voxel_engine/
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)  # VoxEx/

# Add both paths to allow different import styles
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PACKAGE_DIR)

# Import helper functions for loading modules
from tests.test_helpers import (
    get_text_input, get_checkbox, get_slider, get_dropdown,
    get_collapsible, get_modal, get_progress_bar
)


def test_text_input():
    """Test TextInput component functionality."""
    TextInput = get_text_input()

    # Test initialization
    input_field = TextInput(x=0, y=0, width=200, height=32)
    assert input_field.text == ""
    assert input_field.focused is False
    assert input_field.cursor_pos == 0

    # Test text entry
    input_field.focused = True
    input_field.handle_key('a', 0)
    input_field.handle_key('b', 0)
    input_field.handle_key('c', 0)
    assert input_field.text == "abc"
    assert input_field.cursor_pos == 3

    # Test backspace
    input_field.handle_key('backspace', 0)
    assert input_field.text == "ab"
    assert input_field.cursor_pos == 2

    # Test cursor movement
    input_field.handle_key('left', 0)
    assert input_field.cursor_pos == 1
    input_field.handle_key('home', 0)
    assert input_field.cursor_pos == 0
    input_field.handle_key('end', 0)
    assert input_field.cursor_pos == 2

    # Test max length
    input_field.max_length = 5
    input_field.text = ""
    input_field.cursor_pos = 0
    for c in "abcdefgh":
        input_field.handle_key(c, 0)
    assert len(input_field.text) == 5

    # Test numeric only
    input_field2 = TextInput(numeric_only=True)
    input_field2.focused = True
    input_field2.handle_key('1', 0)
    input_field2.handle_key('a', 0)  # Should be ignored
    input_field2.handle_key('2', 0)
    assert input_field2.text == "12"

    # Test click handling
    input_field3 = TextInput(x=0, y=0, width=200, height=32)
    assert input_field3.contains(100, 16) is True
    assert input_field3.contains(300, 16) is False

    # Test set_text and get_value
    input_field3.set_text("test value")
    assert input_field3.get_value() == "test value"

    # Test get_int_value
    input_field3.set_text("123")
    assert input_field3.get_int_value() == 123
    input_field3.set_text("not a number")
    assert input_field3.get_int_value(42) == 42

    # Test clear
    input_field3.clear()
    assert input_field3.text == ""
    assert input_field3.cursor_pos == 0

    print("  TextInput tests passed")


def test_checkbox():
    """Test Checkbox component functionality."""
    Checkbox = get_checkbox()

    # Test initialization
    cb = Checkbox(x=0, y=0, label="Test Option")
    assert cb.checked is True  # Default
    assert cb.enabled is True

    # Test toggle via handle_click
    cb.handle_click(10, 10)  # Within checkbox
    assert cb.checked is False
    cb.handle_click(10, 10)
    assert cb.checked is True

    # Test disabled state
    cb.enabled = False
    cb.handle_click(10, 10)
    assert cb.checked is True  # Should not toggle

    # Test bounds with contains
    cb2 = Checkbox(x=0, y=0, size=18, label="Test")
    assert cb2.contains(10, 10) is True
    assert cb2.contains_box(10, 10) is True
    assert cb2.contains(1000, 1000) is False

    # Test callback
    callback_called = {'value': None}

    def on_change(checked):
        callback_called['value'] = checked

    cb3 = Checkbox(x=0, y=0, enabled=True, checked=False, on_change=on_change)
    cb3.handle_click(5, 5)
    assert callback_called['value'] is True

    # Test set_checked
    cb3.set_checked(False)
    assert callback_called['value'] is False

    print("  Checkbox tests passed")


def test_slider():
    """Test Slider component functionality."""
    Slider = get_slider()

    # Test initialization
    slider = Slider(x=0, y=0, width=200, min_value=0, max_value=100, step=10)
    assert slider.value == 50  # Default middle value

    # Test value setting with clamping
    slider.set_value(50)
    assert slider.value == 50

    slider.set_value(150)
    assert slider.value == 100  # Clamped to max

    slider.set_value(-10)
    assert slider.value == 0  # Clamped to min

    # Test step snapping
    slider.set_value(53)
    assert slider.value in [50, 60]  # Should snap to nearest step

    # Test normalized property
    slider.set_value(50)
    assert slider.normalized == 0.5

    slider.set_value(0)
    assert slider.normalized == 0.0

    slider.set_value(100)
    assert slider.normalized == 1.0

    # Test set_normalized
    slider.set_normalized(0.5)
    assert slider.value == 50

    # Test contains
    assert slider.contains(100, 10) is True
    assert slider.contains(300, 10) is False

    # Test callback
    callback_called = {'value': None}

    def on_change(val):
        callback_called['value'] = val

    slider2 = Slider(x=0, y=0, width=200, min_value=0, max_value=100,
                     step=1, value=0, on_change=on_change)
    slider2.set_value(75)
    assert callback_called['value'] == 75

    # Test get_value and get_int_value
    slider2.set_value(45.6)
    assert slider2.get_value() == 46  # Step snapped
    assert slider2.get_int_value() == 46

    print("  Slider tests passed")


def test_dropdown():
    """Test Dropdown component functionality."""
    Dropdown = get_dropdown()

    # Test initialization
    dd = Dropdown(
        x=0, y=0, width=150, height=28,
        options=[('Low', 1), ('Medium', 2), ('High', 3)]
    )
    assert dd.selected_index == 0
    assert dd.selected_value == 1
    assert dd.selected_text == 'Low'
    assert dd.is_open is False

    # Test expand/collapse via click
    dd.handle_click(75, 14)  # Click on dropdown
    assert dd.is_open is True
    dd.handle_click(75, 14)  # Click again
    assert dd.is_open is False

    # Test selection - click on second option
    dd.is_open = True
    # Options appear below the dropdown, starting at y=28
    # Option height is 26 by default, so:
    # Option 0: y=28 to y=54, Option 1: y=54 to y=80
    dd.handle_click(75, 28 + 26 + 13)  # Click on second option (index 1)
    assert dd.selected_index == 1
    assert dd.selected_value == 2
    assert dd.is_open is False

    # Test set_value
    dd.set_value(3)
    assert dd.selected_index == 2
    assert dd.selected_text == 'High'

    # Test contains
    assert dd.contains(75, 14) is True
    assert dd.contains(300, 14) is False

    # Test callback
    callback_called = {'value': None}

    def on_change(val):
        callback_called['value'] = val

    dd2 = Dropdown(
        x=0, y=0, width=150, height=28,
        options=[('A', 'a'), ('B', 'b')],
        on_change=on_change
    )
    dd2.is_open = True
    dd2.handle_click(75, 28 + 26 + 13)  # Select second option (y=67)
    assert callback_called['value'] == 'b'

    print("  Dropdown tests passed")


def test_collapsible():
    """Test CollapsibleSection component functionality."""
    CollapsibleSection = get_collapsible()

    # Test initialization
    section = CollapsibleSection(x=0, y=0, width=300, title="Test Section")
    assert section.expanded is False  # Default collapsed

    # Test toggle
    section.handle_click(150, 10)  # Click on header
    assert section.expanded is True
    section.handle_click(150, 10)
    assert section.expanded is False

    # Test expand/collapse methods
    section.expand()
    assert section.expanded is True
    section.collapse()
    assert section.expanded is False

    # Test content Y calculation
    section.expand()
    content_y = section.get_content_y()
    assert content_y > section.y  # Content below header
    assert content_y == section.y + section.header_height + 8

    # Test contains_header
    assert section.contains_header(150, 10) is True
    assert section.contains_header(150, 100) is False

    # Test callback
    callback_called = {'expanded': None}

    def on_toggle(expanded):
        callback_called['expanded'] = expanded

    section2 = CollapsibleSection(x=0, y=0, width=300, on_toggle=on_toggle)
    section2.handle_click(150, 10)
    assert callback_called['expanded'] is True

    print("  CollapsibleSection tests passed")


def test_modal():
    """Test Modal base component functionality."""
    Modal, ConfirmDialog, ModalResult = get_modal()

    # Test initialization
    modal = Modal(title="Test Modal", width=400, height=300)
    modal.screen_width = 800
    modal.screen_height = 600
    assert modal.visible is False

    # Test centering
    assert modal.x == 200  # (800-400)/2
    assert modal.y == 150  # (600-300)/2

    # Test show/hide
    modal.show()
    assert modal.visible is True
    modal.hide()
    assert modal.visible is False

    # Test click outside closes
    modal.show()
    result = modal.handle_click(50, 50)  # Outside modal
    assert modal.visible is False
    assert result == ModalResult.CLOSED

    # Test escape closes
    modal.show()
    handled = modal.handle_key('escape', 0)
    assert modal.visible is False
    assert handled is True

    # Test contains
    modal.show()
    assert modal.contains(400, 300) is True  # Center
    assert modal.contains(50, 50) is False  # Outside

    # Test update_screen_size
    modal.update_screen_size(1920, 1080)
    assert modal.screen_width == 1920
    assert modal.screen_height == 1080
    # Center should update
    assert modal.x == (1920 - 400) / 2
    assert modal.y == (1080 - 300) / 2

    print("  Modal tests passed")


def test_confirm_dialog():
    """Test ConfirmDialog functionality."""
    Modal, ConfirmDialog, ModalResult = get_modal()

    # Test initialization
    dialog = ConfirmDialog(message="Are you sure?")
    dialog.screen_width = 800
    dialog.screen_height = 600

    assert dialog.visible is False
    assert dialog.message == "Are you sure?"

    # Test callbacks
    confirm_called = {'called': False}
    cancel_called = {'called': False}

    def on_confirm():
        confirm_called['called'] = True

    def on_cancel():
        cancel_called['called'] = True

    dialog.on_confirm = on_confirm
    dialog.on_cancel = on_cancel

    dialog.show()

    # Test confirm with Enter key
    dialog.handle_key('return', 0)
    assert confirm_called['called'] is True
    assert dialog.visible is False

    # Reset and test cancel
    confirm_called['called'] = False
    dialog.show()

    # Get cancel button position and click it
    cx, cy, cw, ch = dialog._get_cancel_button_rect()
    dialog.handle_click(cx + cw / 2, cy + ch / 2)
    assert cancel_called['called'] is True
    assert dialog.visible is False

    print("  ConfirmDialog tests passed")


def test_progress_bar():
    """Test ProgressBar component functionality."""
    ProgressBar = get_progress_bar()

    # Test initialization
    bar = ProgressBar(x=0, y=0, width=200, height=20)
    assert bar.value == 0.0
    assert bar.percent == 0.0

    # Test value setting
    bar.set_value(50, 100)
    assert bar.value == 50
    assert bar.max_value == 100
    assert bar.percent == 0.5
    assert bar.percent_display == 50.0

    # Test color thresholds
    bar.set_value(60, 100)
    assert bar.current_fill_color == bar.fill_color  # Normal green

    bar.set_value(80, 100)
    assert bar.current_fill_color == bar.warning_color  # Warning yellow

    bar.set_value(95, 100)
    assert bar.current_fill_color == bar.danger_color  # Danger red

    # Test custom thresholds
    bar2 = ProgressBar(warning_threshold=0.5, danger_threshold=0.8)
    bar2.set_value(50, 100)
    assert bar2.current_fill_color == bar2.warning_color  # At 50% threshold
    bar2.set_value(80, 100)
    assert bar2.current_fill_color == bar2.danger_color  # At 80% threshold

    # Test label generation
    bar.label_format = "{percent:.0f}%"
    bar.set_value(75, 100)
    assert bar.get_label_text() == "75%"

    bar.label_format = "{value:.0f}/{max:.0f}"
    assert bar.get_label_text() == "75/100"

    print("  ProgressBar tests passed")


def run_all_component_tests():
    """Run all UI component tests."""
    print("Running UI component tests...\n")

    passed = 0
    failed = 0
    errors = []

    tests = [
        ("TextInput", test_text_input),
        ("Checkbox", test_checkbox),
        ("Slider", test_slider),
        ("Dropdown", test_dropdown),
        ("CollapsibleSection", test_collapsible),
        ("Modal", test_modal),
        ("ConfirmDialog", test_confirm_dialog),
        ("ProgressBar", test_progress_bar),
    ]

    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((name, f"Assertion failed: {e}"))
        except Exception as e:
            failed += 1
            errors.append((name, f"Error: {e}"))
            import traceback
            traceback.print_exc()

    print(f"\nResults: {passed} passed, {failed} failed")

    if errors:
        print("\nFailures:")
        for name, error in errors:
            print(f"  {name}: {error}")
        return False

    print("\nAll component tests passed!")
    return True


if __name__ == "__main__":
    success = run_all_component_tests()
    sys.exit(0 if success else 1)

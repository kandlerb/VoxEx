#!/usr/bin/env python3
"""Debug script to test Create World flow in isolation.

This script tests the "Create New World" button click flow without
requiring the full game to run. It validates:
- Button positioning and bounds
- Click detection
- MenuAction return values
- Seed parsing
- Settings flow

Usage:
    python voxel_engine/tools/debug_create_world.py
"""

import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Enable all debug flags
import os
os.environ['VOXEX_DEBUG'] = '1'


def test_seed_parsing():
    """Test seed parsing logic."""
    print("\n" + "=" * 60)
    print("Testing Seed Parsing")
    print("=" * 60)

    from voxel_engine.engine.ui.text_input import TextInput

    # Create mock text input
    seed_input = TextInput(
        text="",
        placeholder="Enter seed...",
        max_length=12,
        numeric_only=True
    )

    # Test cases
    test_seeds = [
        ("12345", "Valid integer"),
        ("  67890  ", "Integer with whitespace"),
        ("", "Empty (should return 0 or use default)"),
        ("0", "Zero"),
        ("999999999999", "Large number"),
    ]

    print()
    for seed_str, description in test_seeds:
        seed_input.set_text(seed_str)
        result = seed_input.get_int_value(0)
        print(f"  Input: '{seed_str}' ({description})")
        print(f"    Result: {result} (type: {type(result).__name__})")
        print()


def test_button_bounds():
    """Test button positioning and click detection."""
    print("\n" + "=" * 60)
    print("Testing Button Bounds")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu

    # Create menu with known screen size
    screen_width = 1280
    screen_height = 720

    print(f"\n  Screen size: {screen_width}x{screen_height}")

    menu = StartMenu()
    menu.show(screen_width, screen_height)

    # Get button info
    print(f"\n  Number of buttons: {len(menu._buttons)}")

    for i, button in enumerate(menu._buttons):
        print(f"\n  Button[{i}]: '{button.text}'")
        print(f"    Position: ({button.x}, {button.y})")
        print(f"    Size: {button.width} x {button.height}")
        print(f"    Action: {button.action.name}")

        # Calculate center
        cx = button.x + button.width / 2
        cy = button.y + button.height / 2
        print(f"    Center: ({cx}, {cy})")

        # Test click detection at various positions
        test_positions = [
            (cx, cy, "center"),
            (button.x, button.y, "top-left corner"),
            (button.x + button.width, button.y + button.height, "bottom-right"),
            (button.x - 1, cy, "just outside left"),
            (cx, button.y - 1, "just outside top"),
        ]

        print(f"    Click tests:")
        for x, y, desc in test_positions:
            result = button.contains(x, y)
            status = "HIT" if result else "miss"
            print(f"      ({x:.0f}, {y:.0f}) [{desc}]: {status}")


def test_menu_action_flow():
    """Test the menu action return flow."""
    print("\n" + "=" * 60)
    print("Testing Menu Action Flow")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu
    from voxel_engine.engine.ui.pause_menu import MenuAction

    screen_width = 1280
    screen_height = 720

    menu = StartMenu()
    menu.show(screen_width, screen_height)

    # Find the "Create New World" button
    create_button = None
    for button in menu._buttons:
        if button.text == "Create New World":
            create_button = button
            break

    if create_button is None:
        print("\n  ERROR: No 'Create New World' button found!")
        print(f"  Available buttons: {[b.text for b in menu._buttons]}")
        return

    print(f"\n  Found 'Create New World' button:")
    print(f"    Position: ({create_button.x}, {create_button.y})")
    print(f"    Size: {create_button.width} x {create_button.height}")
    print(f"    Action: {create_button.action.name}")

    # Simulate click at button center
    cx = create_button.x + create_button.width / 2
    cy = create_button.y + create_button.height / 2

    print(f"\n  Simulating click at ({cx:.0f}, {cy:.0f})...")
    result = menu.click(cx, cy)

    print(f"\n  Result: {result}")
    print(f"  Result type: {type(result)}")
    print(f"  Result name: {result.name}")

    if result == MenuAction.NONE:
        print("\n  WARNING: Result is NONE - the button click did not return an action!")
        print("  This would cause nothing to happen when clicking the button.")
    elif result == MenuAction.CREATE_WORLD:
        print("\n  SUCCESS: Got CREATE_WORLD action")
        print("  The button is correctly configured to return CREATE_WORLD.")
        print("\n  Next step: demo_world.py should handle CREATE_WORLD to show CreateWorldPanel")
    elif result == MenuAction.START_GAME:
        print("\n  Got START_GAME action (may be expected for direct start)")
    else:
        print(f"\n  Got different action: {result.name}")


def test_create_world_panel():
    """Test CreateWorldPanel flow."""
    print("\n" + "=" * 60)
    print("Testing CreateWorldPanel")
    print("=" * 60)

    from voxel_engine.engine.ui.create_world_panel import CreateWorldPanel
    from voxel_engine.engine.ui.pause_menu import MenuAction

    screen_width = 1280
    screen_height = 720

    panel = CreateWorldPanel()
    panel.show(screen_width, screen_height)

    print(f"\n  Panel visible: {panel.visible}")
    print(f"  Panel position: ({panel._panel_x}, {panel._panel_y})")
    print(f"  Panel size: {panel._panel_width} x {panel._panel_height}")

    # Find Start Game button
    start_button = panel._start_button
    print(f"\n  Start Game button:")
    print(f"    Position: ({start_button.x}, {start_button.y})")
    print(f"    Size: {start_button.width} x {start_button.height}")
    print(f"    Action: {start_button.action.name}")

    # Simulate click on Start Game
    cx = start_button.x + start_button.width / 2
    cy = start_button.y + start_button.height / 2

    print(f"\n  Simulating click at ({cx:.0f}, {cy:.0f})...")
    result = panel.handle_click(cx, cy)

    print(f"\n  Result: {result.name}")

    if result == MenuAction.START_GAME:
        print("  SUCCESS: Got START_GAME action from CreateWorldPanel")

        # Test get_settings
        settings = panel.get_settings()
        print(f"\n  Settings retrieved:")
        print(f"    name: {settings.name}")
        print(f"    seed: {settings.seed}")
        print(f"    preset: {settings.preset}")
    else:
        print(f"  WARNING: Expected START_GAME, got {result.name}")


def test_full_flow():
    """Test the full flow from StartMenu to CreateWorldPanel."""
    print("\n" + "=" * 60)
    print("Testing Full Flow: StartMenu -> CreateWorldPanel")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu
    from voxel_engine.engine.ui.create_world_panel import CreateWorldPanel
    from voxel_engine.engine.ui.pause_menu import MenuAction

    screen_width = 1280
    screen_height = 720

    # Step 1: Create and show StartMenu
    print("\n  Step 1: Show StartMenu")
    start_menu = StartMenu()
    start_menu.show(screen_width, screen_height)
    print(f"    StartMenu visible: {start_menu.visible}")

    # Step 2: Click "Create New World"
    print("\n  Step 2: Click 'Create New World' button")
    for button in start_menu._buttons:
        if button.text == "Create New World":
            cx = button.x + button.width / 2
            cy = button.y + button.height / 2
            print(f"    Clicking at ({cx:.0f}, {cy:.0f})")
            action = start_menu.click(cx, cy)
            print(f"    Action: {action.name}")
            break

    # Step 3: Handle CREATE_WORLD action
    if action == MenuAction.CREATE_WORLD:
        print("\n  Step 3: Handle CREATE_WORLD action")
        print("    - Hiding StartMenu")
        start_menu.hide()
        print(f"    StartMenu visible: {start_menu.visible}")

        print("    - Showing CreateWorldPanel")
        create_panel = CreateWorldPanel()
        create_panel.show(screen_width, screen_height)
        print(f"    CreateWorldPanel visible: {create_panel.visible}")

        # Step 4: Click "Start Game" in CreateWorldPanel
        print("\n  Step 4: Click 'Start Game' in CreateWorldPanel")
        start_btn = create_panel._start_button
        cx = start_btn.x + start_btn.width / 2
        cy = start_btn.y + start_btn.height / 2
        print(f"    Clicking at ({cx:.0f}, {cy:.0f})")
        action = create_panel.handle_click(cx, cy)
        print(f"    Action: {action.name}")

        if action == MenuAction.START_GAME:
            print("\n  Step 5: Get settings and start game")
            settings = create_panel.get_settings()
            print(f"    Settings: name='{settings.name}', seed={settings.seed}")
            print("\n  FULL FLOW SUCCESS!")
        else:
            print(f"\n  ERROR: Expected START_GAME, got {action.name}")
    else:
        print(f"\n  ERROR: Expected CREATE_WORLD, got {action.name}")


def main():
    """Run all debug tests."""
    print("=" * 60)
    print("VoxEx Create World Debug Script")
    print("=" * 60)
    print("\nThis script tests the 'Create New World' button flow")
    print("without requiring the full graphics context.\n")

    try:
        test_seed_parsing()
    except Exception as e:
        print(f"\n  TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_button_bounds()
    except Exception as e:
        print(f"\n  TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_menu_action_flow()
    except Exception as e:
        print(f"\n  TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_create_world_panel()
    except Exception as e:
        print(f"\n  TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

    try:
        test_full_flow()
    except Exception as e:
        print(f"\n  TEST FAILED: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("Debug script complete")
    print("=" * 60)


if __name__ == '__main__':
    main()

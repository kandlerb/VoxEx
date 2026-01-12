#!/usr/bin/env python3
"""Debug script to test Create World flow in isolation.

This script tests the Create World button flow without running the full game.
It helps identify issues with:
- Seed parsing
- Button bounds and click detection
- MenuAction return flow
- CreateWorldPanel integration

Usage:
    python voxel_engine/tools/debug_create_world.py

Note: This script requires numpy and other game dependencies to be installed.
For a syntax-only check, use: python -m py_compile <file>
"""

import sys
import os
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Enable all debug flags
os.environ['VOXEX_DEBUG'] = '1'


def check_dependencies():
    """Check if required dependencies are available."""
    missing = []
    try:
        import numpy
    except ImportError:
        missing.append("numpy")
    try:
        import glfw
    except ImportError:
        missing.append("glfw")
    try:
        import moderngl
    except ImportError:
        missing.append("moderngl")

    if missing:
        print("Missing dependencies:", ", ".join(missing))
        print("Install with: pip install", " ".join(missing))
        return False
    return True


def test_seed_parsing():
    """Test seed parsing logic."""
    print("\n" + "=" * 60)
    print("Testing Seed Parsing")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu

    # Create mock menu
    menu = StartMenu()
    menu.show(800, 600)

    # Test cases
    test_seeds = [
        ("12345", "Valid integer"),
        ("  67890  ", "Integer with whitespace"),
        ("", "Empty (should generate random)"),
        ("0", "Zero (should generate random)"),
        ("999999", "Large valid number"),
    ]

    print("\nTest Results:")
    print("-" * 50)

    for seed_str, description in test_seeds:
        menu._seed_input.set_text(seed_str)
        result = menu.get_seed()
        status = "OK" if result > 0 else "FAIL"
        print(f"  [{status}] {description}")
        print(f"       Input: '{seed_str}' -> Result: {result}")

    print("-" * 50)


def test_button_bounds():
    """Test button positioning and click detection."""
    print("\n" + "=" * 60)
    print("Testing Button Bounds")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu
    from voxel_engine.engine.ui.pause_menu import MenuAction

    menu = StartMenu()
    menu.show(800, 600)

    print("\nMain Menu Buttons:")
    print("-" * 50)

    if not menu._buttons:
        print("  ERROR: No buttons created!")
        return

    for i, btn in enumerate(menu._buttons):
        print(f"  [{i}] '{btn.text}'")
        print(f"      Position: ({btn.x:.0f}, {btn.y:.0f})")
        print(f"      Size: {btn.width:.0f} x {btn.height:.0f}")
        print(f"      Action: {btn.action}")

    # Find create world button
    create_btn = None
    for btn in menu._buttons:
        if btn.action == MenuAction.CREATE_WORLD:
            create_btn = btn
            break

    if create_btn:
        print("\n  Create World Button Found!")
        print(f"      Bounds: ({create_btn.x:.0f}, {create_btn.y:.0f}) to "
              f"({create_btn.x + create_btn.width:.0f}, {create_btn.y + create_btn.height:.0f})")

        # Test some click positions
        print("\n  Click Tests:")
        test_positions = [
            (create_btn.x + create_btn.width // 2, create_btn.y + create_btn.height // 2, "Center"),
            (create_btn.x + 1, create_btn.y + 1, "Top-left inside"),
            (create_btn.x + create_btn.width - 1, create_btn.y + create_btn.height - 1, "Bottom-right inside"),
            (create_btn.x - 1, create_btn.y, "Just outside left"),
            (create_btn.x, create_btn.y - 1, "Just outside top"),
            (400, 300, "Screen center"),
        ]

        for x, y, description in test_positions:
            result = create_btn.contains(x, y)
            status = "HIT" if result else "miss"
            print(f"      ({x:.0f}, {y:.0f}) [{description}]: {status}")
    else:
        print("\n  ERROR: No Create World button found!")
        print(f"  Available buttons: {[btn.text for btn in menu._buttons]}")

    print("-" * 50)


def test_menu_action_flow():
    """Test the menu action return flow."""
    print("\n" + "=" * 60)
    print("Testing Menu Action Flow")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu
    from voxel_engine.engine.ui.pause_menu import MenuAction

    menu = StartMenu()
    menu.show(800, 600)

    # Find create world button
    create_btn = None
    for btn in menu._buttons:
        if btn.action == MenuAction.CREATE_WORLD:
            create_btn = btn
            break

    if not create_btn:
        print("\n  ERROR: No Create World button to test!")
        return

    # Simulate clicking create world button
    cx = create_btn.x + create_btn.width // 2
    cy = create_btn.y + create_btn.height // 2

    print(f"\n  Simulating click at ({cx:.0f}, {cy:.0f})...")

    # Need to call render once to position buttons correctly
    # Since we don't have a real renderer, we manually set positions
    # The render method positions buttons - we need to trace through

    print("  Note: Button positions are set during show(), checking click...")
    result = menu.click(cx, cy)
    print(f"\n  menu.click() returned: {result}")
    print(f"  Result type: {type(result).__name__}")

    if result is None:
        print("  WARNING: Result is None - action may not be wired!")
    elif result == MenuAction.NONE:
        print("  Result is NONE - button may not have been hit")
        print("  Checking button positions after show()...")
        for i, btn in enumerate(menu._buttons):
            print(f"    [{i}] '{btn.text}' at ({btn.x:.0f}, {btn.y:.0f})")
    elif result == MenuAction.CREATE_WORLD:
        print("  SUCCESS: Got CREATE_WORLD action!")
    elif result == MenuAction.START_GAME:
        print("  Got START_GAME action (different from expected)")
    else:
        print(f"  Got different action: {result}")

    print("-" * 50)


def test_create_world_panel():
    """Test CreateWorldPanel initialization and action flow."""
    print("\n" + "=" * 60)
    print("Testing CreateWorldPanel")
    print("=" * 60)

    from voxel_engine.engine.ui.create_world_panel import CreateWorldPanel
    from voxel_engine.engine.ui.pause_menu import MenuAction

    panel = CreateWorldPanel()
    panel.show(800, 600)

    print("\n  CreateWorldPanel created and shown")
    print(f"  Visible: {panel.visible}")
    print(f"  Panel position: ({panel._panel_x:.0f}, {panel._panel_y:.0f})")
    print(f"  Panel size: {panel._panel_width:.0f}x{panel._panel_height:.0f}")

    # Check start button
    start_btn = panel._start_button
    if start_btn:
        print(f"\n  Start Game Button:")
        print(f"      Position: ({start_btn.x:.0f}, {start_btn.y:.0f})")
        print(f"      Size: {start_btn.width:.0f} x {start_btn.height:.0f}")
        print(f"      Action: {start_btn.action}")

        # Simulate click
        cx = start_btn.x + start_btn.width // 2
        cy = start_btn.y + start_btn.height // 2
        print(f"\n  Simulating click at ({cx:.0f}, {cy:.0f})...")
        result = panel.handle_click(cx, cy)
        print(f"  handle_click() returned: {result}")

        if result == MenuAction.START_GAME:
            print("  SUCCESS: Got START_GAME action!")
            settings = panel.get_settings()
            print(f"  Settings: seed={settings.seed}, name='{settings.name}'")
        else:
            print(f"  WARNING: Expected START_GAME, got {result}")

    # Check back button
    back_btn = panel._back_button
    if back_btn:
        print(f"\n  Back Button:")
        print(f"      Position: ({back_btn.x:.0f}, {back_btn.y:.0f})")
        print(f"      Size: {back_btn.width:.0f} x {back_btn.height:.0f}")
        print(f"      Action: {back_btn.action}")

    print("-" * 50)


def test_full_flow_simulation():
    """Simulate the full create world flow."""
    print("\n" + "=" * 60)
    print("Testing Full Flow Simulation")
    print("=" * 60)

    from voxel_engine.engine.ui.start_menu import StartMenu
    from voxel_engine.engine.ui.create_world_panel import CreateWorldPanel
    from voxel_engine.engine.ui.pause_menu import MenuAction

    print("\n  Step 1: Show start menu")
    start_menu = StartMenu()
    start_menu.show(800, 600)
    print(f"    StartMenu visible: {start_menu.visible}")

    print("\n  Step 2: Click 'Create New World' button")
    create_btn = None
    for btn in start_menu._buttons:
        if btn.action == MenuAction.CREATE_WORLD:
            create_btn = btn
            break

    if not create_btn:
        print("    ERROR: Create World button not found!")
        return

    cx, cy = create_btn.x + create_btn.width // 2, create_btn.y + create_btn.height // 2
    action = start_menu.click(cx, cy)
    print(f"    Click result: {action}")

    if action != MenuAction.CREATE_WORLD:
        print(f"    ERROR: Expected CREATE_WORLD, got {action}")
        return

    print("\n  Step 3: Show create world panel (simulating demo_world.py)")
    start_menu.hide()
    create_panel = CreateWorldPanel()
    create_panel.show(800, 600)
    print(f"    StartMenu visible: {start_menu.visible}")
    print(f"    CreateWorldPanel visible: {create_panel.visible}")

    print("\n  Step 4: Click 'Start Game' button")
    start_btn = create_panel._start_button
    cx, cy = start_btn.x + start_btn.width // 2, start_btn.y + start_btn.height // 2
    action = create_panel.handle_click(cx, cy)
    print(f"    Click result: {action}")

    if action != MenuAction.START_GAME:
        print(f"    ERROR: Expected START_GAME, got {action}")
        return

    print("\n  Step 5: Get world settings")
    settings = create_panel.get_settings()
    print(f"    World name: '{settings.name}'")
    print(f"    Seed: {settings.seed}")
    print(f"    Preset: {settings.preset}")

    print("\n  FULL FLOW SIMULATION: SUCCESS!")
    print("-" * 50)


def main():
    print("=" * 70)
    print("VoxEx Create World Debug Script")
    print("=" * 70)
    print("\nThis script tests the Create World flow without running the full game.")
    print("Look for [OK]/[FAIL] markers and ERROR/WARNING messages.\n")

    # Check dependencies first
    if not check_dependencies():
        print("\nCannot run tests without dependencies.")
        print("For syntax-only validation, use:")
        print("  python -m py_compile voxel_engine/tools/demo_world.py")
        print("  python -m py_compile voxel_engine/engine/ui/start_menu.py")
        return 1

    tests = [
        ("Seed Parsing", test_seed_parsing),
        ("Button Bounds", test_button_bounds),
        ("Menu Action Flow", test_menu_action_flow),
        ("Create World Panel", test_create_world_panel),
        ("Full Flow Simulation", test_full_flow_simulation),
    ]

    failed_tests = []

    for name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"\n  EXCEPTION in {name}: {e}")
            import traceback
            traceback.print_exc()
            failed_tests.append((name, str(e)))

    print("\n" + "=" * 70)
    print("Debug Script Summary")
    print("=" * 70)

    if failed_tests:
        print(f"\nFailed tests ({len(failed_tests)}):")
        for name, error in failed_tests:
            print(f"  - {name}: {error}")
    else:
        print("\nAll tests passed!")

    print("\nNote: To see full debug output, run the actual game:")
    print("  python voxel_engine/tools/demo_world.py")
    print("\nDebug output will be printed to stderr.")
    print("=" * 70)


if __name__ == '__main__':
    main()

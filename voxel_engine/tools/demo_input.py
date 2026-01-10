#!/usr/bin/env python3
"""
Interactive demo showing input system working with game loop.

Creates a window and displays real-time input state in the console.
Move the mouse to look around, use WASD to show movement input.
Press ESC to quit.

Usage:
    python voxel_engine/tools/demo_input.py

Requirements:
    pip install glfw moderngl numpy
"""

import sys
import time
import numpy as np
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def main():
    """Run the input demo."""
    # Check dependencies
    try:
        import glfw
        import moderngl
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        print("Install with: pip install glfw moderngl")
        return 1

    from voxel_engine.engine.window import Window
    from voxel_engine.engine.state import GameState, GameMode
    from voxel_engine.engine.loops import GameLoop
    from voxel_engine.engine.systems import InputSystem, RenderSystem

    print("=" * 60)
    print("VoxEx Input Demo")
    print("=" * 60)
    print()
    print("Controls:")
    print("  WASD      - Movement (shown in console)")
    print("  Mouse     - Look around")
    print("  Space     - Jump (double-tap for flight toggle)")
    print("  Shift     - Sprint")
    print("  C         - Crouch")
    print("  F         - Toggle torch")
    print("  E         - Toggle inventory (shown)")
    print("  1-9       - Select hotbar slot")
    print("  ~         - Toggle debug overlay")
    print("  ESC       - Quit")
    print()
    print("Starting window...")
    print()

    try:
        # Create window
        window = Window(
            width=1280,
            height=720,
            title="VoxEx - Input Demo"
        )

        # Capture cursor for FPS-style controls
        window.set_cursor_captured(True)

        # Create game state in creative mode (allows flight)
        state = GameState.create(seed=12345, mode=GameMode.CREATIVE)

        # Create game loop
        loop = GameLoop(state, tick_rate=20.0, target_fps=60.0)

        # Add systems
        input_system = InputSystem(window, sensitivity=0.002)
        render_system = RenderSystem(window)

        loop.add_tick_system(input_system)
        loop.add_frame_system(render_system)

        # Track last print time (don't spam console)
        last_print = 0.0
        print_interval = 0.1  # Print every 100ms

        # Custom tick callback to show input state
        def on_tick(game_state, dt):
            nonlocal last_print

            current_time = time.perf_counter()
            if current_time - last_print < print_interval:
                return

            last_print = current_time
            p = game_state.player

            # Build movement indicator
            movement = ""
            if p.move_forward:
                movement += "W"
            if p.move_left:
                movement += "A"
            if p.move_backward:
                movement += "S"
            if p.move_right:
                movement += "D"
            if not movement:
                movement = "-"

            # Build action indicator
            actions = ""
            if p.jump_pressed:
                actions += "Jump "
            if p.sprint_pressed:
                actions += "Sprint "
            if p.crouch_pressed:
                actions += "Crouch "
            if not actions:
                actions = "-"

            # Build status
            status = ""
            if p.is_flying:
                status += "FLYING "
            if p.torch_active:
                status += "TORCH "
            if game_state.debug_overlay:
                status += "DEBUG "
            if not status:
                status = "-"

            # Format output
            yaw_deg = np.degrees(p.yaw) % 360
            pitch_deg = np.degrees(p.pitch)

            print(
                f"\rMove: {movement:4s} | "
                f"Actions: {actions:20s} | "
                f"Look: ({yaw_deg:6.1f}, {pitch_deg:5.1f}) | "
                f"Slot: {p.selected_slot} | "
                f"Status: {status:15s} | "
                f"FPS: {game_state.fps:5.1f}",
                end="",
                flush=True
            )

        loop.on_tick(on_tick)

        # Initialize and run
        print("Running game loop... Press ESC to quit.\n")
        loop.run()

        print("\n\nShutting down...")
        window.close()

        print("Demo complete!")
        return 0

    except RuntimeError as e:
        print(f"ERROR: Failed to create window - {e}")
        print("Make sure you have a display available (not headless).")
        return 1

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        return 0


if __name__ == '__main__':
    sys.exit(main())

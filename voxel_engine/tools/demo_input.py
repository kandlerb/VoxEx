#!/usr/bin/env python3
"""
Interactive demo showing input and physics systems working with game loop.

Creates a window and displays real-time player state in the console.
Move the mouse to look around, use WASD to move, Space to jump.
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
    """Run the input and physics demo."""
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
    from voxel_engine.engine.systems import InputSystem, PhysicsSystem, RenderSystem

    print("=" * 60)
    print("VoxEx Input + Physics Demo")
    print("=" * 60)
    print()
    print("Controls:")
    print("  WASD      - Movement")
    print("  Mouse     - Look around")
    print("  Space     - Jump (double-tap for flight toggle)")
    print("  Shift     - Sprint")
    print("  C         - Crouch")
    print("  F         - Toggle torch")
    print("  E         - Toggle inventory")
    print("  1-9       - Select hotbar slot")
    print("  ~         - Toggle debug overlay")
    print("  ESC       - Quit")
    print()
    print("Note: Without loaded chunks, you'll fall through the void.")
    print("      Toggle flight (double-tap Space) to explore freely.")
    print()
    print("Starting window...")
    print()

    try:
        # Create window
        window = Window(
            width=1280,
            height=720,
            title="VoxEx - Input + Physics Demo"
        )

        # Capture cursor for FPS-style controls
        window.set_cursor_captured(True)

        # Create game state in creative mode (allows flight)
        state = GameState.create(seed=12345, mode=GameMode.CREATIVE)

        # Position player above origin (will fall without terrain)
        state.player.position[:] = [0.0, 70.0, 0.0]

        # Create game loop
        loop = GameLoop(state, tick_rate=20.0, target_fps=60.0)

        # Add systems in priority order
        input_system = InputSystem(window, sensitivity=0.002)
        physics_system = PhysicsSystem()
        render_system = RenderSystem(window)

        loop.add_tick_system(input_system)   # Priority 0
        loop.add_tick_system(physics_system)  # Priority 10
        loop.add_frame_system(render_system)  # Priority 100

        # Track last print time (don't spam console)
        last_print = 0.0
        print_interval = 0.1  # Print every 100ms

        # Custom tick callback to show state
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

            # Build status
            status = ""
            if p.is_flying:
                status += "FLY "
            if p.on_ground:
                status += "GND "
            if p.in_water:
                status += "H2O "
            if p.is_sprinting:
                status += "SPR "
            if p.is_crouching:
                status += "CRO "
            if not status:
                status = "-"

            # Format position
            pos_str = f"({p.position[0]:7.2f}, {p.position[1]:7.2f}, {p.position[2]:7.2f})"

            # Format velocity
            vel_str = f"({p.velocity[0]:6.2f}, {p.velocity[1]:6.2f}, {p.velocity[2]:6.2f})"

            # Format output
            print(
                f"\rPos: {pos_str} | "
                f"Vel: {vel_str} | "
                f"Move: {movement:4s} | "
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

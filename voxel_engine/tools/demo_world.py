#!/usr/bin/env python3
"""
Full world demo with rendering and block interaction.

Creates a window with procedurally generated terrain, camera controls,
real-time voxel rendering, and block interaction (mining/placing).

Controls:
    WASD        - Move
    Mouse       - Look around
    Space       - Jump (double-tap for flight toggle)
    Shift       - Sprint
    C           - Crouch
    F           - Toggle torch
    1-9         - Select hotbar slot
    Left Click  - Break block
    Right Click - Place block
    ~           - Toggle debug overlay
    ESC         - Pause menu (Resume/Settings/Quit)

Usage:
    python voxel_engine/tools/demo_world.py

Requirements:
    pip install glfw moderngl numpy
"""

import sys
import time
import math
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def main():
    """Run the full world rendering demo."""
    # Check dependencies
    try:
        import glfw
        import moderngl
        import numpy as np
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        print("Install with: pip install glfw moderngl numpy")
        return 1

    from voxel_engine.engine.window import Window, Keys
    from voxel_engine.engine.state import GameState, GameMode
    from voxel_engine.engine.loops import GameLoop, Clock
    from voxel_engine.engine.systems import (
        InputSystem, PhysicsSystem, InteractionSystem, WorldRenderSystem, UISystem
    )
    from voxel_engine.engine.ui import MenuAction
    from voxel_engine.engine.meshing import ChunkBuilder
    from voxel_engine.engine.registry import Registry
    from voxel_engine.engine.interaction import BlockSelector
    from voxel_engine.engine.rendering import BlockOutlineRenderer
    from voxel_engine.systems.world.generation_system import TerrainGenerator

    print("=" * 60)
    print("VoxEx - Full World Rendering Demo")
    print("=" * 60)
    print()
    print("Controls:")
    print("  WASD        - Movement")
    print("  Mouse       - Look around")
    print("  Space       - Jump (double-tap for flight toggle)")
    print("  Shift       - Sprint")
    print("  C           - Crouch / Fly down")
    print("  1-9         - Select hotbar slot")
    print("  Left Click  - Break block")
    print("  Right Click - Place block")
    print("  ~           - Toggle debug overlay")
    print("  ESC         - Pause menu")
    print()
    print("Initializing...")

    # Configuration
    SEED = 12345
    RENDER_DISTANCE = 4  # chunks in each direction
    WINDOW_WIDTH = 1280
    WINDOW_HEIGHT = 720

    try:
        # Initialize Registry (required for block/biome configs)
        content_path = project_root / "voxel_engine" / "content"
        config_path = project_root / "voxel_engine" / "config"

        if content_path.exists() and config_path.exists():
            try:
                Registry.initialize(content_path, config_path)
                print(f"  Registry initialized: {Registry.block_count()} blocks, {Registry.biome_count()} biomes")
            except Exception as e:
                print(f"  Warning: Registry init failed ({e}), using fallback")
                Registry._initialize_fallback()
        else:
            print("  Using fallback block/biome definitions")
            Registry._initialize_fallback()

        # Create window
        print("  Creating window...")
        window = Window(
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            title="VoxEx - World Demo"
        )
        window.set_cursor_captured(True)

        # Create game state
        print("  Creating game state...")
        state = GameState.create(seed=SEED, mode=GameMode.CREATIVE)

        # Create terrain generator
        print("  Initializing terrain generator...")
        biomes = {}
        blocks = {}

        # Get biome and block configs from Registry
        for biome_name in Registry.biome_names():
            biomes[biome_name] = Registry.get_biome(biome_name)

        for block_id in range(Registry.block_count()):
            block = Registry.get_block(block_id)
            if block:
                blocks[block_id] = block

        generator = TerrainGenerator(
            biomes=biomes,
            blocks=blocks,
            seed=SEED,
            chunk_size=16,
            chunk_height=320,
            sea_level=60
        )

        # Generate initial chunks
        print(f"  Generating {(2*RENDER_DISTANCE+1)**2} chunks...")
        t0 = time.perf_counter()

        for dx in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
            for dz in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
                chunk = generator.generate_chunk(dx, dz)
                generator.calculate_initial_skylight(chunk)
                state.world.set_chunk(dx, dz, chunk)

        gen_time = time.perf_counter() - t0
        print(f"  Terrain generated in {gen_time:.2f}s")

        # Find spawn point (highest block near origin)
        spawn_x, spawn_z = 8, 8
        spawn_y = 64.0
        for y in range(319, 0, -1):
            block = state.world.get_block(spawn_x, y, spawn_z)
            if block != 0:  # Not air
                spawn_y = float(y + 2)  # Stand above surface
                break

        state.player.position[:] = [float(spawn_x), spawn_y, float(spawn_z)]
        state.player.prev_position[:] = state.player.position
        print(f"  Spawn position: ({spawn_x}, {spawn_y:.0f}, {spawn_z})")

        # Create game loop and systems
        print("  Setting up game loop...")
        clock = Clock(target_fps=60.0)
        loop = GameLoop(state, tick_rate=20.0, target_fps=60.0)

        input_system = InputSystem(window, sensitivity=0.002)
        physics_system = PhysicsSystem()
        render_system = WorldRenderSystem(window, render_distance=RENDER_DISTANCE)
        ui_system = UISystem(window, clock)

        # Create block interaction system
        block_selector = BlockSelector(state.world)
        interaction_system = InteractionSystem(block_selector)

        # Create block outline renderer
        outline_renderer = BlockOutlineRenderer(window.ctx)

        loop.add_tick_system(input_system)        # Priority 0
        loop.add_tick_system(physics_system)      # Priority 10
        loop.add_tick_system(interaction_system)  # Priority 20
        loop.add_frame_system(render_system)      # Priority 100
        loop.add_frame_system(ui_system)          # Priority 110

        # Initialize render system and UI system
        print("  Initializing systems...")
        render_system.initialize(state)
        ui_system.initialize(state)

        # Build chunk meshes
        print("  Building chunk meshes...")

        chunk_builder = ChunkBuilder(state.world)
        t0 = time.perf_counter()

        for dx in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
            for dz in range(-RENDER_DISTANCE, RENDER_DISTANCE + 1):
                mesh = chunk_builder.build(dx, dz)
                render_system.upload_chunk_mesh(mesh)

        mesh_time = time.perf_counter() - t0
        print(f"  Meshes built in {mesh_time:.2f}s")

        # Set up chunk dirty callback for block interaction
        dirty_chunks = set()

        def on_chunk_dirty(cx, cz):
            """Mark a chunk as needing re-mesh due to block changes."""
            dirty_chunks.add((cx, cz))

        interaction_system.set_chunk_dirty_callback(on_chunk_dirty)

        # Stats tracking
        last_print = 0.0
        print_interval = 1.0
        debug_key_pressed = False
        pause_key_pressed = False

        def on_tick(game_state, dt):
            nonlocal last_print, dirty_chunks, debug_key_pressed, pause_key_pressed
            current_time = time.perf_counter()

            # Update clock for FPS tracking
            clock.tick()

            # Handle debug toggle (~ key / grave accent)
            if window.get_key(Keys.GRAVE_ACCENT):
                if not debug_key_pressed:
                    ui_system.toggle_debug()
                    debug_key_pressed = True
            else:
                debug_key_pressed = False

            # Handle pause toggle (ESC key)
            if window.get_key(Keys.ESCAPE):
                if not pause_key_pressed:
                    if ui_system.paused:
                        # If paused, resume game
                        ui_system.toggle_pause()
                    else:
                        # Show pause menu
                        ui_system.toggle_pause()
                    pause_key_pressed = True
            else:
                pause_key_pressed = False

            # Handle pause menu clicks
            if ui_system.paused:
                # Check for mouse click in pause menu
                from voxel_engine.engine.window import MouseButtons
                if window.get_mouse_button(MouseButtons.LEFT):
                    mx, my = window.get_mouse_position()
                    action = ui_system.handle_click(mx, my)
                    if action == MenuAction.RESUME:
                        ui_system.toggle_pause()
                    elif action == MenuAction.QUIT:
                        game_state.should_quit = True

            # Update UI stats
            render_stats = render_system.get_stats()
            ui_system.set_stats(
                render_stats.get('draw_calls', 0),
                render_stats.get('visible_chunks', 0)
            )

            # Skip game logic updates if paused
            if ui_system.paused:
                return

            # Rebuild dirty chunks from block interactions
            if dirty_chunks:
                for cx, cz in dirty_chunks:
                    # Check if chunk exists
                    if state.world.get_chunk(cx, cz) is not None:
                        mesh = chunk_builder.build(cx, cz)
                        render_system.upload_chunk_mesh(mesh)
                dirty_chunks.clear()

            if current_time - last_print < print_interval:
                return

            last_print = current_time
            p = game_state.player

            # Build status
            status = ""
            if p.is_flying:
                status += "FLY "
            if p.on_ground:
                status += "GND "
            if p.is_sprinting:
                status += "SPR "
            if not status:
                status = "-"

            # Get render stats
            stats = render_system.get_stats()

            # Show targeted block
            target_str = "---"
            if block_selector.has_target:
                pos = block_selector.get_target_block_pos()
                if pos:
                    target_str = f"{pos[0]},{pos[1]},{pos[2]}"

            print(
                f"\rPos: ({p.position[0]:7.1f}, {p.position[1]:7.1f}, {p.position[2]:7.1f}) | "
                f"Target: {target_str:12s} | "
                f"Slot: {p.selected_slot+1} | "
                f"FPS: {game_state.fps:5.1f} | "
                f"Chunks: {stats.get('visible_chunks', 0):3d}",
                end="",
                flush=True
            )

        loop.on_tick(on_tick)

        # Custom frame hook to render block outline after world
        def on_frame(game_state, dt, alpha):
            # Update outline position
            if block_selector.has_target:
                outline_renderer.set_target(block_selector.get_target_block_pos())
            else:
                outline_renderer.set_target(None)

            # Render outline after world rendering (render_system handles this)
            if outline_renderer.visible:
                # Get camera matrices from render system
                if hasattr(render_system, '_camera') and render_system._camera is not None:
                    cam = render_system._camera
                    outline_renderer.render(cam.view, cam.projection)

        loop.on_frame(on_frame)

        print()
        print("=" * 60)
        print("Running! Press ESC to quit.")
        print("=" * 60)
        print()

        # Run the game loop
        loop.run()

        print("\n\nShutting down...")
        outline_renderer.release()
        ui_system.shutdown()
        render_system.shutdown()
        window.close()

        print("Demo complete!")
        return 0

    except RuntimeError as e:
        print(f"ERROR: {e}")
        return 1

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        return 0


# Fallback initialization for Registry when config files are missing
def _initialize_fallback(cls):
    """Initialize Registry with minimal hardcoded definitions."""
    cls._initialized = True

    # Minimal block definitions
    cls._blocks = {
        0: {"id": 0, "name": "Air", "internal_name": "air", "tags": ["transparent"]},
        1: {"id": 1, "name": "Grass", "internal_name": "grass", "tags": ["solid"]},
        2: {"id": 2, "name": "Dirt", "internal_name": "dirt", "tags": ["solid"]},
        3: {"id": 3, "name": "Stone", "internal_name": "stone", "tags": ["solid"]},
        4: {"id": 4, "name": "Wood", "internal_name": "wood", "tags": ["solid"]},
        5: {"id": 5, "name": "Log", "internal_name": "log", "tags": ["solid"]},
        6: {"id": 6, "name": "Leaves", "internal_name": "leaves", "tags": ["transparent"]},
        7: {"id": 7, "name": "Bedrock", "internal_name": "bedrock", "tags": ["solid"]},
        8: {"id": 8, "name": "Sand", "internal_name": "sand", "tags": ["solid"]},
        9: {"id": 9, "name": "Water", "internal_name": "water", "tags": ["transparent", "fluid"]},
        10: {"id": 10, "name": "Torch", "internal_name": "torch", "tags": ["transparent"]},
        11: {"id": 11, "name": "Snow", "internal_name": "snow", "tags": ["solid"]},
        12: {"id": 12, "name": "Gravel", "internal_name": "gravel", "tags": ["solid"]},
    }

    cls._block_by_name = {
        b["internal_name"]: b for b in cls._blocks.values()
    }

    # Minimal biome definitions
    cls._biomes = {
        "plains": {
            "name": "plains",
            "weight": 2.0,
            "base_height": 62,
            "amplitude": 8,
            "roughness": 0.01,
            "height_func": "plains",
            "tags": [],
        },
        "hills": {
            "name": "hills",
            "weight": 2.0,
            "base_height": 64,
            "amplitude": 40,
            "roughness": 0.01,
            "height_func": "hills",
            "tags": [],
        },
        "forests": {
            "name": "forests",
            "weight": 2.0,
            "base_height": 64,
            "amplitude": 15,
            "roughness": 0.01,
            "height_func": "default",
            "tags": ["forested"],
        },
        "mountains": {
            "name": "mountains",
            "weight": 1.0,
            "base_height": 70,
            "amplitude": 180,
            "roughness": 0.003,
            "height_func": "mountains",
            "tags": ["mountain"],
        },
    }

    # Build lookups
    cls._solid_blocks = {bid for bid, b in cls._blocks.items() if "solid" in b.get("tags", [])}
    cls._transparent_blocks = {bid for bid, b in cls._blocks.items() if "transparent" in b.get("tags", [])}
    cls._fluid_blocks = {bid for bid, b in cls._blocks.items() if "fluid" in b.get("tags", [])}
    cls._light_emitting_blocks = {}

    cls._tiles = {}
    cls._world_config = {"chunk_size": 16, "chunk_height": 320, "sea_level": 60}
    cls._settings = {}
    cls._physics = {}


# Attach fallback method to Registry class
try:
    from voxel_engine.engine.registry import Registry
    if not hasattr(Registry, '_initialize_fallback'):
        Registry._initialize_fallback = classmethod(lambda cls: _initialize_fallback(cls))
except ImportError:
    pass


if __name__ == '__main__':
    sys.exit(main())

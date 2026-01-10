#!/usr/bin/env python3
"""
Full world demo with chunk streaming.

Creates a window with procedurally generated terrain that streams in
dynamically as the player moves. Chunks beyond render distance are
unloaded to manage memory.

Controls:
    WASD        - Move
    Mouse       - Look around
    Space       - Jump (double-tap for flight toggle)
    Shift       - Sprint
    C           - Crouch
    F           - Toggle torch
    ~           - Toggle debug overlay
    ESC         - Quit

Usage:
    python voxel_engine/tools/demo_streaming.py

Requirements:
    pip install glfw moderngl numpy
"""

import sys
import time
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def main():
    """Run the chunk streaming demo."""
    # Check dependencies
    try:
        import glfw
        import moderngl
        import numpy as np
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        print("Install with: pip install glfw moderngl numpy")
        return 1

    from voxel_engine.engine.window import Window
    from voxel_engine.engine.state import GameState, GameMode
    from voxel_engine.engine.loops import GameLoop
    from voxel_engine.engine.systems import (
        InputSystem, PhysicsSystem, WorldRenderSystem,
        ChunkStreamingSystem, ChunkUploadSystem
    )
    from voxel_engine.engine.meshing import ChunkBuilder
    from voxel_engine.engine.registry import Registry
    from voxel_engine.engine.streaming import ChunkStreamer
    from voxel_engine.systems.world.generation_system import TerrainGenerator

    print("=" * 60)
    print("VoxEx - Chunk Streaming Demo")
    print("=" * 60)
    print()
    print("Controls:")
    print("  WASD      - Movement")
    print("  Mouse     - Look around")
    print("  Space     - Jump (double-tap for flight toggle)")
    print("  Shift     - Sprint")
    print("  C         - Crouch / Fly down")
    print("  ~         - Toggle debug overlay")
    print("  ESC       - Quit")
    print()
    print("Chunks will stream in dynamically as you move around!")
    print()
    print("Initializing...")

    # Configuration
    SEED = 12345
    RENDER_DISTANCE = 6  # chunks in each direction
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
                _initialize_fallback(Registry)
        else:
            print("  Using fallback block/biome definitions")
            _initialize_fallback(Registry)

        # Create window
        print("  Creating window...")
        window = Window(
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            title="VoxEx - Streaming Demo"
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

        # Create chunk builder
        chunk_builder = ChunkBuilder(state.world)

        # Create chunk streamer
        print(f"  Creating chunk streamer (render_distance={RENDER_DISTANCE})...")
        streamer = ChunkStreamer(
            world=state.world,
            generator=generator,
            builder=chunk_builder,
            render_distance=RENDER_DISTANCE
        )

        # Set player spawn position
        spawn_x, spawn_z = 8, 8
        spawn_y = 80.0  # Will adjust when terrain generates
        state.player.position[:] = [float(spawn_x), spawn_y, float(spawn_z)]
        state.player.prev_position[:] = state.player.position

        # Create game loop and systems
        print("  Setting up game loop...")
        loop = GameLoop(state, tick_rate=20.0, target_fps=60.0)

        input_system = InputSystem(window, sensitivity=0.002)
        physics_system = PhysicsSystem()
        chunk_system = ChunkStreamingSystem(streamer, chunks_per_tick=4)
        upload_system = ChunkUploadSystem(streamer, uploads_per_frame=2)
        render_system = WorldRenderSystem(window, render_distance=RENDER_DISTANCE)

        # Connect streamer to renderer
        streamer.set_callbacks(
            on_ready=render_system.upload_chunk_mesh,
            on_unload=render_system.remove_chunk
        )

        loop.add_tick_system(input_system)    # Priority 0
        loop.add_tick_system(physics_system)  # Priority 10
        loop.add_tick_system(chunk_system)    # Priority 50
        loop.add_frame_system(upload_system)  # Priority 90
        loop.add_frame_system(render_system)  # Priority 100

        # Initialize render system
        print("  Initializing renderer...")
        render_system.initialize(state)

        # Generate initial chunks around spawn
        print("  Generating initial chunks...")
        t0 = time.perf_counter()

        # Process several rounds of generation to get initial chunks loaded
        for _ in range(50):
            streamer.update_player_position(spawn_x, spawn_z)
            streamer.process_generation_queue(8)
            streamer.process_mesh_queue(8)
            streamer.process_upload_queue(8)

        init_time = time.perf_counter() - t0
        stats = streamer.get_stats()
        print(f"  Initial chunks loaded: {stats['loaded_chunks']} in {init_time:.2f}s")

        # Find actual ground level at spawn
        for y in range(319, 0, -1):
            block = state.world.get_block(spawn_x, y, spawn_z)
            if block != 0:  # Not air
                state.player.position[1] = float(y + 2)
                state.player.prev_position[1] = state.player.position[1]
                print(f"  Spawn adjusted to y={y + 2}")
                break

        # Stats tracking
        last_print = 0.0
        print_interval = 1.0
        tick_count = [0]

        def on_tick(game_state, dt):
            nonlocal last_print
            tick_count[0] += 1
            current_time = time.perf_counter()

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

            # Get streaming stats
            stream_stats = streamer.get_stats()

            # Get render stats
            render_stats = render_system.get_stats()

            print(
                f"\rPos: ({p.position[0]:7.1f}, {p.position[1]:7.1f}, {p.position[2]:7.1f}) | "
                f"Chunks: {stream_stats['loaded_chunks']:3d} | "
                f"GenQ: {stream_stats['gen_queue']:3d} | "
                f"MeshQ: {stream_stats['mesh_queue']:3d} | "
                f"FPS: {game_state.fps:5.1f} | "
                f"Draw: {render_stats.get('draw_calls', 0):3d}",
                end="",
                flush=True
            )

        loop.on_tick(on_tick)

        print()
        print("=" * 60)
        print("Running! Move around to see chunks stream in/out.")
        print("Press ESC to quit.")
        print("=" * 60)
        print()

        # Run the game loop
        loop.run()

        print("\n\nShutting down...")
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


if __name__ == '__main__':
    sys.exit(main())

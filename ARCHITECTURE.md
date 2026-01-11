# VoxEx Python Engine Architecture Report

## Executive Summary

This document provides a comprehensive architecture report for the **Python voxel_engine/** implementation - a modular, ECS-lite voxel game engine. The engine comprises ~142 Python files organized into distinct subsystems with clear separation of concerns.

---

## 1. Complete Directory Structure

```
voxel_engine/
├── main.py                              # Entry point (placeholder)
├── requirements.txt                     # Python dependencies
│
├── config/                              # Configuration schemas
│   └── schemas/
│
├── content/                             # Game content definitions (data-driven)
│   ├── biomes/                          # Biome definitions (6 files)
│   │   ├── plains.yaml
│   │   ├── hills.yaml
│   │   ├── forests.yaml
│   │   ├── mountains.yaml
│   │   ├── swamp.yaml
│   │   └── longwoods.yaml
│   ├── blocks/                          # Block definitions (15 files)
│   │   ├── air.yaml
│   │   ├── grass.yaml
│   │   ├── dirt.yaml
│   │   ├── stone.yaml
│   │   ├── wood.yaml
│   │   ├── log.yaml
│   │   ├── leaves.yaml
│   │   ├── bedrock.yaml
│   │   ├── sand.yaml
│   │   ├── water.yaml
│   │   ├── torch.yaml
│   │   ├── snow.yaml
│   │   ├── gravel.yaml
│   │   ├── longwood_log.yaml
│   │   └── longwood_leaves.yaml
│   ├── features/                        # Procedural features (trees, etc.)
│   ├── items/                           # Item definitions
│   ├── meshes/                          # Entity mesh definitions
│   └── mobs/                            # Mob definitions
│       ├── zombie.yaml
│       └── player.yaml
│
├── engine/                              # Core game engine (72 files)
│   ├── __init__.py                      # Public engine API exports
│   ├── game.py                          # Main game orchestrator
│   │
│   ├── audio/                           # Audio system (6 files)
│   │   ├── __init__.py
│   │   ├── audio_backend.py             # Low-level audio playback
│   │   ├── audio_manager.py             # High-level audio API
│   │   ├── constants.py                 # Audio configuration
│   │   ├── envelope.py                  # ADSR envelope for synthesis
│   │   ├── oscillator.py                # Waveform generators
│   │   └── sounds.py                    # Sound effect generation
│   │
│   ├── context/                         # Generation contexts (3 files)
│   │   ├── __init__.py
│   │   ├── biome_context.py             # Biome generation context
│   │   ├── feature_context.py           # Feature generation context
│   │   └── mob_context.py               # Mob spawning context
│   │
│   ├── events/                          # Event system (1 file)
│   │   ├── __init__.py
│   │   └── event_bus.py                 # Pub/sub event system
│   │
│   ├── input/                           # Input handling (1 file)
│   │   ├── __init__.py
│   │   └── input_state.py               # Input state container
│   │
│   ├── interaction/                     # Block interaction (4 files)
│   │   ├── __init__.py
│   │   ├── block_actions.py             # Mine/place operations
│   │   ├── block_selector.py            # Block targeting/raycasting
│   │   ├── constants.py                 # Interaction config
│   │   └── raycast.py                   # DDA raycasting algorithm
│   │
│   ├── loops/                           # Game loop infrastructure (4 files)
│   │   ├── __init__.py
│   │   ├── clock.py                     # Frame timing and FPS
│   │   ├── game_loop.py                 # Main loop orchestrator
│   │   ├── interpolation.py             # Fixed timestep accumulator
│   │   └── render_loop.py               # Frame rendering loop
│   │
│   ├── meshing/                         # Mesh generation (6 files)
│   │   ├── __init__.py
│   │   ├── ambient_occlusion.py         # AO calculation
│   │   ├── chunk_builder.py             # Chunk → mesh conversion
│   │   ├── chunk_mesh.py                # Mesh data structure
│   │   ├── constants.py                 # Meshing constants
│   │   ├── face_culling.py              # Visible face detection
│   │   └── mesh_pool.py                 # Geometry reuse pool
│   │
│   ├── persistence/                     # Save/load system (5 files)
│   │   ├── __init__.py
│   │   ├── chunk_tracker.py             # Modified chunk tracking
│   │   ├── compression.py               # RLE compression
│   │   ├── constants.py                 # Persistence config
│   │   ├── save_data.py                 # Save file structures
│   │   └── save_manager.py              # Save/load orchestrator
│   │
│   ├── physics/                         # Physics system (4 files)
│   │   ├── __init__.py
│   │   ├── aabb.py                      # Axis-aligned bounding boxes
│   │   ├── collision.py                 # Collision detection
│   │   ├── constants.py                 # Physics constants
│   │   └── movement.py                  # Movement calculations
│   │
│   ├── registry/                        # Content registry (3 files)
│   │   ├── __init__.py
│   │   ├── loader.py                    # Config file loader
│   │   ├── registry.py                  # Central content registry
│   │   └── schema.py                    # Content validation
│   │
│   ├── rendering/                       # Graphics rendering (7 files)
│   │   ├── __init__.py
│   │   ├── block_outline.py             # Selected block highlight
│   │   ├── camera.py                    # Camera and projection
│   │   ├── chunk_renderer.py            # Chunk GPU management
│   │   ├── frustum.py                   # Frustum culling
│   │   ├── shaders.py                   # GLSL shader code
│   │   ├── sky_renderer.py              # Sky/skybox rendering
│   │   └── texture.py                   # Texture atlas generation
│   │
│   ├── state/                           # Game state containers (5 files)
│   │   ├── __init__.py
│   │   ├── entity_state.py              # Entity collection
│   │   ├── game_state.py                # Top-level game state
│   │   ├── player_state.py              # Player position/input
│   │   └── world_state.py               # Chunk and world data
│   │
│   ├── streaming/                       # Chunk streaming (4 files)
│   │   ├── __init__.py
│   │   ├── chunk_queue.py               # Priority queue for tasks
│   │   ├── chunk_streamer.py            # Streaming orchestrator
│   │   ├── chunk_tracker.py             # Chunk lifecycle tracking
│   │   └── constants.py                 # Streaming config
│   │
│   ├── systems/                         # ECS-style systems (13 files)
│   │   ├── __init__.py
│   │   ├── base.py                      # System base classes
│   │   ├── audio_system.py              # Audio updates (tick)
│   │   ├── chunk_system.py              # Chunk streaming (tick)
│   │   ├── chunk_upload_system.py       # GPU mesh upload (frame)
│   │   ├── debug_system.py              # Debug overlay (frame)
│   │   ├── input_system.py              # Input processing (tick)
│   │   ├── interaction_system.py        # Block mine/place (tick)
│   │   ├── physics_system.py            # Movement/collision (tick)
│   │   ├── render_system.py             # OpenGL setup (frame)
│   │   ├── save_system.py               # Save/load (tick)
│   │   ├── ui_system.py                 # UI rendering (frame)
│   │   └── world_render_system.py       # World rendering (frame)
│   │
│   ├── threading/                       # Threading utilities (4 files)
│   │   ├── __init__.py
│   │   ├── locks.py                     # Thread-safe locks
│   │   ├── process_pools.py             # Worker process pools
│   │   ├── task_queue.py                # Thread-safe task queue
│   │   └── thread_manager.py            # Thread management
│   │
│   ├── ui/                              # User interface (8 files)
│   │   ├── __init__.py
│   │   ├── bitmap_font.py               # Bitmap font rendering
│   │   ├── constants.py                 # UI configuration
│   │   ├── hud.py                       # HUD elements
│   │   ├── orthographic.py              # Orthographic projection
│   │   ├── pause_menu.py                # Pause menu UI
│   │   ├── shaders.py                   # UI shader code
│   │   ├── start_menu.py                # Main menu UI
│   │   └── ui_renderer.py               # UI rendering system
│   │
│   └── window/                          # Window management (3 files)
│       ├── __init__.py
│       ├── keys.py                      # Keyboard key constants
│       └── window.py                    # GLFW window + ModernGL
│
├── entities/                            # Legacy entity classes (5 files)
│   ├── __init__.py
│   ├── entity.py                        # Base entity (empty)
│   ├── item_entity.py                   # Item entity class
│   ├── mob.py                           # Mob entity class
│   └── player.py                        # Player entity class
│
├── rendering/                           # Legacy rendering (deprecated)
│   ├── __init__.py
│   ├── camera.py
│   ├── frustum.py
│   ├── mesh.py
│   ├── shader.py
│   ├── texture.py
│   ├── textures/
│   └── window.py
│
├── systems/                             # Legacy systems (deprecated)
│   ├── __init__.py
│   ├── entity/
│   ├── physics/
│   ├── player/
│   ├── render/
│   └── world/
│
├── tools/                               # Testing and demo tools
│   ├── benchmark_meshing.py
│   ├── demo_*.py                        # Various demo scripts
│   └── test_*.py                        # Unit tests
│
├── utils/                               # Utility functions (3 files)
│   ├── __init__.py
│   ├── aabb.py                          # Bounding box utilities
│   ├── timer.py                         # Performance timer
│   └── vec.py                           # Vector utilities
│
└── world/                               # World/chunk structures (4 files)
    ├── __init__.py
    ├── chunk.py                         # Chunk data structure
    ├── chunk_mesh.py                    # (Duplicate - use engine/meshing)
    └── noise.py                         # Perlin/Simplex noise
```

---

## 2. Architecture Overview

The engine uses a **layered ECS-lite architecture** with clear separation between state, systems, and rendering.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           GAME LOOP                                 │
│           (Fixed 20 TPS ticks + Variable FPS rendering)             │
└──────────────┬──────────────────────────────────────┬───────────────┘
               │                                      │
               ▼ Tick Systems (20 TPS)                ▼ Frame Systems (Variable FPS)
    ┌───────────────────────────┐          ┌──────────────────────────┐
    │ 0:  InputSystem           │          │ 90:  ChunkUploadSystem   │
    │ 10: PhysicsSystem         │          │ 100: RenderSystem        │
    │ 15: AudioSystem           │          │ 100: WorldRenderSystem   │
    │ 20: InteractionSystem     │          │ 110: UISystem            │
    │ 50: ChunkStreamingSystem  │          └──────────────────────────┘
    │ 60: SaveSystem            │
    └───────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                        GAME STATE                               │
    │  ├── PlayerState (position, velocity, input flags)              │
    │  ├── WorldState (chunks, dirty tracking, time)                  │
    │  ├── EntityState (mobs, items, pooling)                         │
    │  ├── GameMode (SURVIVAL, CREATIVE, SPECTATOR)                   │
    │  └── GamePhase (LOADING, MENU, GENERATING, PLAYING, PAUSED)     │
    └─────────────────────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                        DATA LAYERS                              │
    ├─────────────────────────────────────────────────────────────────┤
    │ Chunk System    │ 16×320×16 blocks, NumPy arrays, RLE compress  │
    ├─────────────────────────────────────────────────────────────────┤
    │ Meshing System  │ Face culling, AO, vertex generation           │
    ├─────────────────────────────────────────────────────────────────┤
    │ Rendering       │ ModernGL, VAOs, frustum culling, two-pass     │
    ├─────────────────────────────────────────────────────────────────┤
    │ Physics         │ AABB collision, movement, gravity, friction   │
    ├─────────────────────────────────────────────────────────────────┤
    │ Persistence     │ RLE compression, chunk tracking, save files   │
    └─────────────────────────────────────────────────────────────────┘
```

---

## 3. File Dependency Graph

### 3.1 Core State Files

```
engine/state/game_state.py
    ├── imports: player_state, world_state, entity_state
    └── used by: game_loop, ALL systems

engine/state/player_state.py
    ├── imports: numpy
    └── used by: physics_system, input_system, interaction_system, rendering

engine/state/world_state.py
    ├── imports: world/chunk
    └── used by: ALL systems (chunk access)

engine/state/entity_state.py
    ├── imports: numpy, collections
    └── used by: entity systems, mob systems
```

### 3.2 Game Loop

```
engine/loops/game_loop.py
    ├── imports: clock, interpolation, systems/base
    └── orchestrates: ALL tick and frame systems

engine/loops/clock.py
    ├── imports: time, collections.deque
    └── used by: game_loop

engine/loops/interpolation.py
    ├── imports: (none - pure math)
    └── used by: game_loop
```

### 3.3 Systems → Dependencies

```
engine/systems/input_system.py
    ├── imports: base, window
    └── writes: PlayerState (movement flags, camera rotation)

engine/systems/physics_system.py
    ├── imports: base, state, physics/*
    └── reads: PlayerState, WorldState
    └── writes: PlayerState (position, velocity, flags)

engine/systems/audio_system.py
    ├── imports: base, audio/audio_manager
    └── reads: PlayerState (position, velocity)

engine/systems/interaction_system.py
    ├── imports: base, interaction/*
    └── reads: PlayerState, WorldState
    └── writes: WorldState (blocks)

engine/systems/chunk_system.py
    ├── imports: base, streaming/chunk_streamer
    └── reads: PlayerState (position)
    └── writes: WorldState (chunks)

engine/systems/chunk_upload_system.py
    ├── imports: base, streaming/chunk_streamer
    └── writes: GPU (VAO/VBO)

engine/systems/render_system.py
    ├── imports: base, window, moderngl
    └── writes: OpenGL state

engine/systems/world_render_system.py
    ├── imports: base, rendering/*
    └── reads: GameState, WorldState, chunks
    └── writes: Framebuffer

engine/systems/ui_system.py
    ├── imports: base, ui/*
    └── reads: GameState, PlayerState
    └── writes: Framebuffer (UI overlay)

engine/systems/save_system.py
    ├── imports: base, persistence/*
    └── reads/writes: GameState ↔ Disk
```

### 3.4 Rendering Pipeline

```
engine/rendering/camera.py
    ├── imports: numpy, math
    └── used by: world_render_system

engine/rendering/texture.py
    ├── imports: numpy, meshing/constants
    └── used by: world_render_system (atlas generation)

engine/rendering/chunk_renderer.py
    ├── imports: numpy, meshing/chunk_mesh, moderngl
    └── used by: world_render_system

engine/rendering/frustum.py
    ├── imports: numpy
    └── used by: world_render_system (culling)

engine/rendering/sky_renderer.py
    ├── imports: moderngl, numpy
    └── used by: world_render_system

engine/rendering/shaders.py
    ├── imports: (none - string literals)
    └── used by: world_render_system, ui_renderer
```

### 3.5 Meshing Pipeline

```
engine/meshing/chunk_builder.py
    ├── imports: numpy, face_culling, ambient_occlusion, constants
    │            state/WorldState, registry
    └── used by: streaming/chunk_streamer

engine/meshing/chunk_mesh.py
    ├── imports: numpy, dataclasses
    └── used by: chunk_builder, chunk_renderer, chunk_streamer

engine/meshing/face_culling.py
    ├── imports: numpy, constants
    └── used by: chunk_builder

engine/meshing/ambient_occlusion.py
    ├── imports: numpy
    └── used by: chunk_builder

engine/meshing/mesh_pool.py
    ├── imports: chunk_mesh
    └── used by: chunk_streamer
```

### 3.6 Streaming System

```
engine/streaming/chunk_streamer.py
    ├── imports: chunk_queue, chunk_tracker, meshing/chunk_builder
    │            mesh_pool, state/WorldState, constants
    └── used by: chunk_system, chunk_upload_system

engine/streaming/chunk_queue.py
    ├── imports: typing, enum
    └── used by: chunk_streamer

engine/streaming/chunk_tracker.py
    ├── imports: enum
    └── used by: chunk_streamer
```

### 3.7 Physics System

```
engine/physics/movement.py
    ├── imports: numpy, constants
    └── used by: physics_system

engine/physics/collision.py
    ├── imports: numpy, aabb, constants, world_state
    └── used by: physics_system

engine/physics/aabb.py
    ├── imports: numpy
    └── used by: collision, interaction/raycast
```

### 3.8 Interaction System

```
engine/interaction/block_selector.py
    ├── imports: raycast, constants, state/*
    └── used by: interaction_system

engine/interaction/block_actions.py
    ├── imports: state/WorldState, registry, constants
    └── used by: interaction_system

engine/interaction/raycast.py
    ├── imports: numpy, physics/aabb
    └── used by: block_selector
```

### 3.9 Audio System

```
engine/audio/audio_manager.py
    ├── imports: audio_backend, sounds, constants
    └── used by: audio_system

engine/audio/sounds.py
    ├── imports: numpy, oscillator, envelope
    └── used by: audio_manager

engine/audio/oscillator.py
    ├── imports: numpy
    └── used by: sounds

engine/audio/envelope.py
    ├── imports: numpy
    └── used by: sounds
```

### 3.10 Persistence System

```
engine/persistence/save_manager.py
    ├── imports: compression, chunk_tracker, save_data, constants, pathlib
    └── used by: save_system

engine/persistence/compression.py
    ├── imports: numpy, pathlib
    └── used by: save_manager
```

### 3.11 Registry (Singleton)

```
engine/registry/registry.py
    ├── imports: pathlib, loader
    └── used by: chunk_builder, ALL systems (block properties)

engine/registry/loader.py
    ├── imports: yaml, json, pathlib
    └── used by: registry
```

### 3.12 World Data

```
world/chunk.py
    ├── imports: numpy
    └── used by: state/world_state, meshing, streaming
```

---

## 4. State Management

### 4.1 GameState (engine/state/game_state.py)

Central state container - single source of truth.

```python
class GameState:
    player: PlayerState       # Position, velocity, input
    world: WorldState         # Chunks, time, dirty tracking
    entities: EntityState     # Entity collection with pooling
    mode: GameMode            # SURVIVAL | CREATIVE | SPECTATOR
    phase: GamePhase          # LOADING | MENU | GENERATING | PLAYING | PAUSED
    tick_count: int           # Game ticks elapsed
    total_time: float         # Total elapsed seconds
    fps: float                # Current frames per second
    should_quit: bool         # Exit signal
```

### 4.2 PlayerState (engine/state/player_state.py)

Player position, velocity, and input state using NumPy arrays for Numba compatibility.

```python
class PlayerState:
    # Position (NumPy float64 arrays)
    position: np.ndarray[3]
    velocity: np.ndarray[3]
    prev_position: np.ndarray[3]    # For interpolation
    yaw: float
    pitch: float

    # Movement intent flags
    move_forward: bool
    move_backward: bool
    move_left: bool
    move_right: bool
    jump_pressed: bool
    crouch_pressed: bool
    sprint_pressed: bool

    # State flags
    on_ground: bool
    in_water: bool
    is_flying: bool
    is_sprinting: bool
    is_crouching: bool

    # Interaction
    selected_slot: int              # Hotbar (0-8)
    torch_active: bool
    input_primary_action: bool      # Mine
    input_secondary_action: bool    # Place
```

### 4.3 WorldState (engine/state/world_state.py)

Chunk storage with cross-chunk block access.

```python
class WorldState:
    seed: int
    chunks: Dict[int, Chunk]        # Numeric key for O(1) lookup
    chunk_size: int = 16
    chunk_height: int = 320
    sea_level: int = 60
    world_time: float
    day_length: float = 1200        # 20 minutes
    dirty_chunks: Set[int]          # Need mesh rebuild
    modified_chunks: Set[int]       # Need saving

    # Chunk key formula (supports -512 to 511 range)
    def chunk_key(cx, cz) -> int:
        return ((cx + 524288) << 20) | (cz + 524288)
```

### 4.4 EntityState (engine/state/entity_state.py)

Entity collection with object pooling.

```python
class EntityState:
    entities: Dict[int, Entity]           # By ID
    entities_by_type: Dict[str, Set[int]] # Grouped
    pools: Dict[str, deque]               # Object pools
    max_entities: int
```

---

## 5. System Architecture (ECS-lite)

All systems inherit from base classes:

```python
class System:
    priority: int           # Execution order (lower = earlier)
    enabled: bool

    def initialize(state: GameState): ...
    def shutdown(): ...

class TickSystem(System):
    def tick(state: GameState, dt: float): ...

class FrameSystem(System):
    def render(state: GameState, alpha: float): ...
```

### 5.1 Tick Systems (20 TPS - Fixed Timestep)

| Priority | System | Purpose |
|----------|--------|---------|
| 0 | InputSystem | Poll keyboard/mouse, update PlayerState |
| 10 | PhysicsSystem | Movement, collision, gravity |
| 15 | AudioSystem | Footsteps, ambient sounds |
| 20 | InteractionSystem | Block mining and placement |
| 50 | ChunkStreamingSystem | Chunk generation and meshing |
| 60 | SaveSystem | Periodic world saving |

### 5.2 Frame Systems (Variable FPS)

| Priority | System | Purpose |
|----------|--------|---------|
| 90 | ChunkUploadSystem | Upload meshes to GPU |
| 100 | RenderSystem | OpenGL setup, clear buffers |
| 100 | WorldRenderSystem | Render voxel world |
| 110 | UISystem | HUD, menus |

---

## 6. Game Loop (engine/loops/game_loop.py)

```
┌─────────────────────────────────────────────────────┐
│ GameLoop.run()                                      │
├─────────────────────────────────────────────────────┤
│ 1. initialize() - call all system.initialize()     │
│ 2. Main loop:                                       │
│    ├── clock.tick() - Measure frame time           │
│    ├── accumulator.add(dt) - Accumulate time       │
│    ├── while should_tick():                        │
│    │   ├── store_previous_position()               │
│    │   ├── Run tick systems (priority order)       │
│    │   └── advance_tick()                          │
│    ├── alpha = accumulator.get_alpha()             │
│    └── Run frame systems (priority order)          │
│ 3. shutdown() - call all system.shutdown()         │
└─────────────────────────────────────────────────────┘
```

**Clock** (engine/loops/clock.py): High-precision timing with smoothed FPS.

**Accumulator** (engine/loops/interpolation.py): Fixed timestep preventing "spiral of death".

---

## 7. Chunk System

### 7.1 Chunk Data Structure (world/chunk.py)

```python
class Chunk:
    cx, cz: int                                    # Chunk coordinates
    blocks: np.ndarray[16, 320, 16, uint8]         # Block IDs (0-255)
    sky_light: np.ndarray[16, 320, 16, uint8]      # Sky light (0-15)
    block_light: np.ndarray[16, 320, 16, uint8]    # Torch light (0-15)
    dirty: bool                                    # Needs remeshing
    mesh_data: Optional[ChunkMesh]                 # Cached geometry
```

### 7.2 Chunk Streaming (engine/streaming/chunk_streamer.py)

```
ChunkStreamer
├── _tracker: ChunkTracker     # Lifecycle: unloaded → pending → loaded → unload
├── _gen_queue: ChunkQueue     # Priority queue for generation
├── _mesh_queue: ChunkQueue    # Priority queue for meshing
├── _unload_queue: ChunkQueue  # Queue for unload
├── _generator                 # Terrain algorithm
├── _builder: ChunkBuilder     # Mesh builder
└── _mesh_pool: MeshPool       # Geometry reuse
```

**Priority Levels:**
```python
PRIORITY_PLAYER_CHUNK = 0      # Chunk player is in
PRIORITY_ADJACENT = 10         # Adjacent chunks
PRIORITY_NEAR = 20             # Within render distance
PRIORITY_FAR = 100             # Beyond render distance
```

---

## 8. Meshing Pipeline

### 8.1 ChunkBuilder (engine/meshing/chunk_builder.py)

```
1. Iterate all blocks in chunk
2. For each non-air block:
   ├── Get material (transparency, texture ID)
   └── For each of 6 faces:
       ├── Check if visible (adjacent block is air/transparent)
       └── If visible:
           ├── Get face vertices and normals
           ├── Get texture UV from block texture ID
           ├── Calculate Ambient Occlusion (AO)
           └── Add to opaque or transparent list
3. Return ChunkMesh
```

### 8.2 ChunkMesh (engine/meshing/chunk_mesh.py)

```python
class ChunkMesh:
    # Opaque geometry
    opaque_positions: np.ndarray[float32]
    opaque_normals: np.ndarray[float32]
    opaque_uvs: np.ndarray[float32]
    opaque_colors: np.ndarray[float32]    # AO-based
    opaque_indices: np.ndarray[uint32]
    opaque_vao: int                        # GPU handle

    # Transparent geometry (same structure)
    transparent_*
```

---

## 9. Rendering Pipeline

### 9.1 Two-Pass Rendering

```
renderFrame()
├── Update camera from player position + interpolation
├── Calculate frustum planes
├── Frustum cull visible chunks
├── Pass 1: Render opaque geometry (depth write ON)
├── Sort transparent chunks by distance (back-to-front)
├── Pass 2: Render transparent geometry (depth write OFF, blend ON)
├── Render sky in background
└── Apply fog based on distance
```

### 9.2 Texture Atlas (engine/rendering/texture.py)

17 procedurally generated 16×16 pixel art textures:

| Index | Texture |
|-------|---------|
| 0 | Grass top |
| 1 | Grass side |
| 2 | Dirt |
| 3 | Stone |
| 4 | Wood planks |
| 5 | Log side |
| 6 | Log top |
| 7 | Leaves |
| 8 | Bedrock |
| 9 | Sand |
| 10 | Water |
| 11 | Torch |
| 12 | Snow |
| 13 | Gravel |
| 14 | Longwood log |
| 15 | Longwood leaves |
| 16 | Glass |

---

## 10. Physics System

### 10.1 Constants (engine/physics/constants.py)

```python
WALK_SPEED = 4.3           # m/s
SPRINT_SPEED = 5.6         # m/s
CROUCH_SPEED = 1.3         # m/s
FLY_SPEED = 10.8           # m/s
GRAVITY = 20.0             # m/s²
JUMP_VELOCITY = 8.5        # m/s
TERMINAL_VELOCITY = 70.0   # m/s
```

### 10.2 AABB (engine/physics/aabb.py)

```python
class AABB:
    min: np.ndarray[3]     # Lower corner
    max: np.ndarray[3]     # Upper corner

    def offset(dx, dy, dz) -> AABB
    def contains(point) -> bool
    def overlaps(other) -> bool
    def intersects_ray(ray) -> Optional[float]
```

### 10.3 Collision (engine/physics/collision.py)

```python
def move_and_collide(world, pos, vel, aabb) -> Tuple[pos, vel]
def check_grounded(world, pos, width) -> bool
def check_in_fluid(world, pos, height) -> bool
```

---

## 11. Persistence System

### 11.1 Save Format

```python
SaveFile:
├── metadata: SaveMetadata
│   ├── name: str
│   ├── seed: int
│   ├── created: datetime
│   ├── last_modified: datetime
│   └── playtime: float
├── player_data: PlayerSaveData
│   ├── position: Tuple[x, y, z]
│   ├── rotation: Tuple[yaw, pitch]
│   └── inventory: List[int]
├── world_data: WorldSaveData
│   └── modified_chunks: Dict[key, compressed_data]
└── metadata_version: int
```

### 11.2 RLE Compression (engine/persistence/compression.py)

Format: `[count, block_id, count, block_id, ...]`

Typical compression ratio: 5-10x for generated terrain.

---

## 12. Registry System (engine/registry/)

Singleton pattern for centralized content access.

```python
class Registry:
    _blocks: Dict[int, Dict]           # By ID
    _block_by_name: Dict[str, Dict]    # By name
    _biomes: Dict[str, Dict]
    _tiles: Dict[str, int]             # Texture indices
    _solid_blocks: Set[int]            # Precomputed lookups
    _transparent_blocks: Set[int]
    _fluid_blocks: Set[int]
    _light_emitting_blocks: Dict[int, int]
```

Loads from `content/` YAML files at startup.

---

## 13. Content Definitions

### 13.1 Block Schema (content/blocks/*.yaml)

```yaml
internal_name: grass_block
display_name: Grass Block
texture_id: 0
properties:
  solid: true
  transparent: false
  light_emitting: false
```

### 13.2 Biome Schema (content/biomes/*.yaml)

```yaml
name: plains
weight: 2.0
height_base: 62
height_amplitude: 20
properties:
  - forested
temperature: 0.8
rainfall: 0.4
```

---

## 14. Coordinate Systems

| System | Range | Description |
|--------|-------|-------------|
| Global (gx, gy, gz) | X/Z: unlimited, Y: 0-319 | Absolute world position |
| Chunk (cx, cz) | -512 to 511 | Chunk grid position |
| Local (lx, ly, lz) | X/Z: 0-15, Y: 0-319 | Position within chunk |
| Chunk Key | 40-bit int | `((cx + 524288) << 20) \| (cz + 524288)` |

---

## 15. External Dependencies

| Library | Purpose |
|---------|---------|
| numpy | Numerical arrays, vectors |
| glfw | Window and input |
| moderngl | OpenGL 3.3 core context |
| pyyaml | Configuration file parsing |
| numba | JIT compilation (optional) |

---

## 16. Performance Optimizations

1. **NumPy Arrays** - All physics vectors use `np.ndarray[float64]`
2. **Typed Arrays** - Chunk blocks/light use `uint8`
3. **Face Culling** - Skip 80-90% of faces
4. **Frustum Culling** - Skip chunks outside view
5. **Mesh Pooling** - Reuse ChunkMesh allocations
6. **RLE Compression** - 5-10x disk savings
7. **Priority Queues** - Load nearest chunks first
8. **Fixed Timestep** - 20 TPS for deterministic physics
9. **Object Pooling** - Entity recycling

---

## 17. Initialization Flow

```
main.py
    │
    ▼
Registry.initialize(content_path, config_path)
    └─ Load all blocks, biomes, tiles, settings
    │
    ▼
GameState.create(seed, mode, chunk_size, chunk_height)
    └─ Initialize PlayerState, WorldState, EntityState
    │
    ▼
Window(width, height, title)
    └─ Initialize GLFW window + ModernGL context
    │
    ▼
Create Systems:
    ├─ InputSystem(window)
    ├─ PhysicsSystem()
    ├─ AudioSystem(audio_manager)
    ├─ InteractionSystem(block_selector)
    ├─ ChunkStreamingSystem(chunk_streamer)
    ├─ ChunkUploadSystem(chunk_streamer)
    ├─ RenderSystem(window)
    ├─ WorldRenderSystem(window)
    └─ UISystem(window)
    │
    ▼
GameLoop(state, tick_rate=20, target_fps=60)
    ├─ add_tick_system() for each tick system
    ├─ add_frame_system() for each frame system
    └─ run()
```

---

## 18. File Count Summary

| Directory | File Count | Purpose |
|-----------|------------|---------|
| engine/ | 72 | Core game engine |
| content/ | ~30 | Data-driven content (YAML) |
| entities/ | 5 | Legacy entity classes |
| rendering/ | 8 | Legacy rendering (deprecated) |
| systems/ | 12 | Legacy systems (deprecated) |
| world/ | 4 | Core world structures |
| utils/ | 4 | Utilities |
| tools/ | ~10 | Testing and benchmarks |
| **Total** | **~145** | |

**Active Architecture**: ~72 files in `engine/` + 4 in `world/`

---

## 19. Summary

The Python `voxel_engine/` is a well-structured, modular voxel engine featuring:

- **ECS-lite Architecture** - Clear separation of state and systems
- **Fixed Timestep** - 20 TPS physics with variable FPS rendering
- **Data-Driven Content** - YAML definitions for blocks, biomes, mobs
- **Efficient Streaming** - Priority-based chunk loading/unloading
- **Two-Pass Rendering** - Opaque then transparent with proper sorting
- **Modern OpenGL** - ModernGL with VAOs and shaders
- **Persistence** - RLE-compressed save files

---

*Generated: 2026-01-11*
*Total Python Files: ~145*
*Active Engine Files: ~76*
*Architecture Version: 2.0*

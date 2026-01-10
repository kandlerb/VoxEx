"""
VoxEx game systems.

Systems process GameState at fixed (tick) or variable (frame) rates.

Tick systems run at 20 TPS (fixed timestep):
- InputSystem: Samples input, updates PlayerState (priority 0)
- PhysicsSystem: Movement and collision (priority 10)
- AudioSystem: Footsteps and ambient sounds (priority 15)
- InteractionSystem: Block mining and placement (priority 20)
- ChunkStreamingSystem: Chunk generation and meshing (priority 50)

Frame systems run every frame (variable rate):
- ChunkUploadSystem: GPU mesh uploads (priority 90)
- RenderSystem: Clears screen, basic rendering (priority 100)
- WorldRenderSystem: Full voxel world rendering (priority 100)
- UISystem: UI/HUD rendering (priority 110)

Usage:
    from voxel_engine.engine.systems import InputSystem, PhysicsSystem
    from voxel_engine.engine.systems import InteractionSystem, UISystem
    from voxel_engine.engine.systems import RenderSystem, WorldRenderSystem
    from voxel_engine.engine.systems import ChunkStreamingSystem, ChunkUploadSystem
    from voxel_engine.engine.systems import AudioSystem
    from voxel_engine.engine.window import Window
    from voxel_engine.engine.audio import AudioManager

    window = Window()
    audio_manager = AudioManager()
    game_loop.add_tick_system(InputSystem(window))
    game_loop.add_tick_system(PhysicsSystem())
    game_loop.add_tick_system(AudioSystem(audio_manager))
    game_loop.add_tick_system(InteractionSystem(selector))
    game_loop.add_tick_system(ChunkStreamingSystem(streamer))
    game_loop.add_frame_system(ChunkUploadSystem(streamer))
    game_loop.add_frame_system(WorldRenderSystem(window))
    game_loop.add_frame_system(UISystem(window, clock))
"""

from .base import System, TickSystem, FrameSystem
from .input_system import InputSystem
from .physics_system import PhysicsSystem
from .audio_system import AudioSystem
from .interaction_system import InteractionSystem
from .render_system import RenderSystem
from .world_render_system import WorldRenderSystem
from .chunk_system import ChunkStreamingSystem
from .chunk_upload_system import ChunkUploadSystem
from .ui_system import UISystem
from .save_system import SaveSystem

__all__ = [
    "System",
    "TickSystem",
    "FrameSystem",
    "InputSystem",
    "PhysicsSystem",
    "AudioSystem",
    "InteractionSystem",
    "RenderSystem",
    "WorldRenderSystem",
    "ChunkStreamingSystem",
    "ChunkUploadSystem",
    "UISystem",
    "SaveSystem",
]

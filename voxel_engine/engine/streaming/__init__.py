"""
VoxEx chunk streaming system.

Manages dynamic chunk loading/unloading around the player as they move
through the world. Uses priority queues to ensure chunks closest to the
player are loaded first.

Components:
- ChunkStreamer: Core coordinator for chunk lifecycle
- ChunkQueue: Priority queue for chunk operations
- ChunkTracker: State tracking for chunks
- ChunkStreamingSystem: TickSystem for generation/meshing
- ChunkUploadSystem: FrameSystem for GPU uploads

Usage:
    from voxel_engine.engine.streaming import (
        ChunkStreamer, ChunkStreamingSystem, ChunkUploadSystem
    )

    # Create streamer
    streamer = ChunkStreamer(world, generator, builder, render_distance=8)
    streamer.set_callbacks(on_ready=renderer.upload, on_unload=renderer.remove)

    # Add systems to game loop
    loop.add_tick_system(ChunkStreamingSystem(streamer))
    loop.add_frame_system(ChunkUploadSystem(streamer))
"""

from .constants import (
    DEFAULT_RENDER_DISTANCE,
    MIN_RENDER_DISTANCE,
    MAX_RENDER_DISTANCE,
    PRE_GEN_PADDING,
    MAX_CHUNKS_PER_TICK,
    MAX_MESHES_PER_FRAME,
    MAX_BUILD_QUEUE_SIZE,
    MAX_CACHED_CHUNKS,
    EVICTION_BATCH_SIZE,
    PRIORITY_PLAYER_CHUNK,
    PRIORITY_ADJACENT,
    PRIORITY_NEAR,
    PRIORITY_FAR,
)
from .chunk_queue import ChunkQueue, ChunkTask, ChunkTaskType
from .chunk_tracker import ChunkTracker, ChunkState
from .chunk_streamer import ChunkStreamer

__all__ = [
    # Constants
    'DEFAULT_RENDER_DISTANCE',
    'MIN_RENDER_DISTANCE',
    'MAX_RENDER_DISTANCE',
    'PRE_GEN_PADDING',
    'MAX_CHUNKS_PER_TICK',
    'MAX_MESHES_PER_FRAME',
    'MAX_BUILD_QUEUE_SIZE',
    'MAX_CACHED_CHUNKS',
    'EVICTION_BATCH_SIZE',
    'PRIORITY_PLAYER_CHUNK',
    'PRIORITY_ADJACENT',
    'PRIORITY_NEAR',
    'PRIORITY_FAR',
    # Queue
    'ChunkQueue',
    'ChunkTask',
    'ChunkTaskType',
    # Tracker
    'ChunkTracker',
    'ChunkState',
    # Streamer
    'ChunkStreamer',
]

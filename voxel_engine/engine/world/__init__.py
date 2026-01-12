"""
VoxEx World Module.

Contains world generation settings, chunk building infrastructure,
and related utilities for world management.
"""

from .world_gen_settings import (
    WorldGenSettings,
    BIOME_LIST,
    WORLD_PRESETS,
    PRESET_DISPLAY_NAMES
)

from .chunk_build_queue import (
    ChunkBuildQueue,
    ChunkBuildPriority,
    ChunkBuildRequest
)

from .chunk_build_coordinator import (
    ChunkBuildCoordinator,
    extract_block_info_for_workers
)

__all__ = [
    # World generation settings
    'WorldGenSettings',
    'BIOME_LIST',
    'WORLD_PRESETS',
    'PRESET_DISPLAY_NAMES',
    # Chunk building
    'ChunkBuildQueue',
    'ChunkBuildPriority',
    'ChunkBuildRequest',
    'ChunkBuildCoordinator',
    'extract_block_info_for_workers',
]

"""
VoxEx Registry - Content and configuration management.

Provides centralized access to game content (blocks, biomes) and
configuration (world settings, tiles, physics).

Usage:
    from voxel_engine.engine.registry import Registry

    # Initialize at startup
    Registry.initialize(
        content_path=Path("voxel_engine/content"),
        config_path=Path("voxel_engine/config")
    )

    # Access content
    grass = Registry.get_block(1)
    plains = Registry.get_biome("plains")
    is_solid = Registry.is_solid(1)
"""

from .registry import Registry
from .loader import ConfigLoader, deep_merge

__all__ = ["Registry", "ConfigLoader", "deep_merge"]

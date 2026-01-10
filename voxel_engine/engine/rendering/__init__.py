"""
VoxEx rendering module.

Provides GPU rendering components for voxel worlds:
- Camera: Perspective projection and view matrix management
- Frustum: View frustum culling for chunks
- TextureAtlas: Procedural texture generation and GPU upload
- ChunkRenderer: VAO management for chunk meshes
- SkyRenderer: Sky background with day/night cycle
- Shaders: GLSL shader sources for terrain and sky

Usage:
    from voxel_engine.engine.rendering import Camera, Frustum, TextureAtlas
    from voxel_engine.engine.rendering import ChunkRenderer, SkyRenderer
    from voxel_engine.engine.rendering import VOXEL_VERTEX_SHADER
"""

from .camera import (
    Camera,
    perspective_matrix,
    fps_view_matrix,
    look_at_matrix,
    rotation_only_view
)
from .frustum import Frustum
from .texture import TextureAtlas, generate_texture_atlas, create_texture
from .chunk_renderer import ChunkRenderer, ChunkVAO
from .sky_renderer import SkyRenderer
from .shaders import (
    VOXEL_VERTEX_SHADER,
    VOXEL_FRAGMENT_SHADER,
    SKY_VERTEX_SHADER,
    SKY_FRAGMENT_SHADER,
    DEBUG_VERTEX_SHADER,
    DEBUG_FRAGMENT_SHADER
)

__all__ = [
    # Camera
    'Camera',
    'perspective_matrix',
    'fps_view_matrix',
    'look_at_matrix',
    'rotation_only_view',
    # Frustum
    'Frustum',
    # Texture
    'TextureAtlas',
    'generate_texture_atlas',
    'create_texture',
    # Chunk rendering
    'ChunkRenderer',
    'ChunkVAO',
    # Sky rendering
    'SkyRenderer',
    # Shaders
    'VOXEL_VERTEX_SHADER',
    'VOXEL_FRAGMENT_SHADER',
    'SKY_VERTEX_SHADER',
    'SKY_FRAGMENT_SHADER',
    'DEBUG_VERTEX_SHADER',
    'DEBUG_FRAGMENT_SHADER',
]
